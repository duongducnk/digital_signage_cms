const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//quan ly phien dang nhap
app.use(session({
    secret: 'digital_signage_secret_key_lan',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } //session ton tai 24h
}));

//quan ly user va xac thuc
const usersFilePath = path.join(__dirname, 'users.json');
//doc giu lieu tu file playlist.json
const playlistFilePath = path.join(__dirname, 'playlist.json');
//thu muc luu tru media
const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}
app.use('/media', express.static(mediaDir)); //cho phep truy cap thu muc
//thu muc html cho file tinh cong khai login.html
app.use(express.static(path.join(__dirname, 'public')));

//cau hinh multer de luu file tai len tu web
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, mediaDir);
    },
    filename: (req, file, cb) => {
        //giu nguyen ten file hoac co the xu ly tranh trung lap
         // Làm sạch tên file tránh lỗi ký tự đặc biệt
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, Date.now() + '-' + safeName);
    }
});
const upload = multer({ storage: storage });

async function readUsers() {
    try {
        if (fs.existsSync(usersFilePath)) {
            const data = await fs.promises.readFile(usersFilePath, 'utf8');
            return JSON.parse(data);
            //return JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
        }
    } catch (e) {
        console.error("Lỗi đọc file users.json", e);
    }
    return [];
}
//kiem tra da dang nhap chua
function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    return res.status(401).json({ success: false, message: "Yêu cầu đăng nhập" });
}
//thong bao chi cho phep admin
function requireAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    return res.status(403).json({ success: false, message: "Bạn không có quyền admin"});
}

//api dang nhap
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await readUsers();
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(400).json({ success: false, message: "Tài khoản hoặc mật khẩu không đúng"});
        }
        
        const match = await bcrypt.compare(password, user.passwordHash);
        if (match) {
            req.session.user = { id: user.id, username: user.username, role: user.role };
            return res.json({
                success: true,
                role: user.role,
                redirectUrl: user.role === 'admin' ? '/' : '/manager.html'
            });
        }

        res.status(400).json({ success: false, message: "Tài khoản hoặc mật khẩu không đúng" });
    } catch (error) {
        console.error("Lỗi đăng nhập:", error);
        res.status(500).json({ success: false, message: "Lỗi hệ thống đăng nhập" });
    }
    
});

//api dang xuat
app.get('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

//api kiem tra user hien tai
app.get('/api/me', (req, res) => {
    if (req.session && req.session.user) {
        return res.json({ success: true, user: req.session.user });
    }
    res.json({ success: false });
});

//lay dia chi ip lan cua may tinh server
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            //chi lay ipv4, khong phai dia chi noi bo localhost
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

async function readAllPlaylist() { //doc toan bo playlist
    try {
        if (fs.existsSync(playlistFilePath)) {
            const data = await fs.promises.readFile(playlistFilePath, 'utf8');
            const parsed = JSON.parse(data);

            if (!parsed.mediaLibrary) parsed.mediaLibrary = [];
            if (!parsed.devices) parsed.devices = {};
            // if (Array.isArray(parsed.items)) {
            //     return { devices: { 'default_tv': { group: "tv", displayName: "default", playlist: parsed.items } } };
            // }
            return parsed; //parsed.devices && parsed.deviceId ? parsed.devices[deviceId] : [];
        }
    } catch (error) {
        console.error("Loi khi doc file playlist.json", error);
    }
    // return { devices: {} }; //tra ve mang rong neu khong co file hoac file loi
    return { mediaLibrary: [], devices: {} };
}

async function readPlaylist(deviceId) {
    if (!deviceId) return [];
    try  {
        const parsed = await readAllPlaylist();
        //return (parsed.devices && parsed.devices[deviceId]) ? parsed.devices[deviceId] : [];
        
        if (!parsed.devices || !parsed.devices[deviceId]) return [];
        const devData = parsed.devices[deviceId];
        // Nếu là object cấu hình mới, lấy mảng .playlist. Nếu là mảng cũ thì trả về luôn.
        if (Array.isArray(devData)) return devData;
        if (devData && Array.isArray(devData.playlist)) return devData.playlist;
        
        return [];
    } catch (error) {
        console.error("Lỗi khi đọc playlist của thiết bị", error);
        return [];
    }
}


//ghi du lieu ra file json
async function savePlaylist(deviceId, items) {
    try {
        let parsed = await readAllPlaylist();
            if (!parsed.devices) {
                parsed.devices = {};
            }

            let existing = parsed.devices[deviceId];
            // Nếu thiết bị chưa tồn tại hoặc đang là mảng cũ, khởi tạo chuẩn object mới
            if (!existing || Array.isArray(existing) || typeof existing !== 'object') {
                parsed.devices[deviceId] = {
                    group: existing?.group || "tv",
                    displayName: existing?.displayName || deviceId,
                    playlist: Array.isArray(items) ? items : []
                };
            } else {
                // Cập nhật lại mảng playlist bên trong object
                existing.playlist = Array.isArray(items) ? items : [];
            }

            // chuyen cau truc luu json cu sang moi
            // if (!parsed.devices) {
            //     parsed = { devices: { default_tv: parsed.items || [] } };
            // }

            //parsed.devices[deviceId] = items;
            //const data = JSON.stringify({ items: items}, null, 2);
            await fs.promises.writeFile(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
        } catch (error) {
        console.error("Lỗi khi ghi file playlist.json", error);
    }
}

// API lấy kho Media chung (Media Pool)
app.get('/api/media-library', requireAuth, async (req, res) => {
    const parsed = await readAllPlaylist();
    res.json({ success: true, mediaLibrary: parsed.mediaLibrary || [] });
});

// API Admin upload tệp trực tiếp vào kho Media chung
app.post('/api/media-library/upload', requireAuth, requireAdmin, upload.single('mediaFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Không có file được tải lên' });
    }

    const fileType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
    const serverIp = getLocalIpAddress();
    const fileUrl = `http://${serverIp}:${PORT}/media/${req.file.filename}`;

    const newMedia = {
        id: 'media_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        title: req.body.title || req.file.originalname,
        type: fileType,
        url: fileUrl,
        duration: fileType === 'image' ? parseInt(req.body.duration || 10, 10) : 0
    };

    let parsed = await readAllPlaylist();
    if (!parsed.mediaLibrary) parsed.mediaLibrary = [];
    parsed.mediaLibrary.push(newMedia);

    await fs.promises.writeFile(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
    res.json({ success: true, media: newMedia });
});

//tra ve cau truc json chua link ads
app.get('/api/playlist', async (req, res) => {  //tra ve playlist
    const deviceId = req.query.deviceId; //lay id tv tu client
    const forAdmin = req.query.admin === 'true';

    if (!deviceId) {
        return res.status(400).json({ success: false, message: "Thiếu tham số deviceId"});
    }

    const parsed = await readAllPlaylist(); 

    // Nếu TV chưa tồn tại, khởi tạo mới với đầy đủ group và displayName người dùng truyền vào
    if (!parsed.devices || !parsed.devices[deviceId]) {
        const group = req.query.group || "tv";
        const displayName = req.query.displayName || deviceId;
        parsed.devices[deviceId] = { group, displayName, playlist: [], scheduledPlaylist: { enabled: false, items: [] } };
        await fs.promises.writeFile(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
    }

    //let playlist = await readPlaylist(deviceId);
    const deviceObj = parsed.devices[deviceId];
    let playlist = Array.isArray(deviceObj) ? deviceObj : (deviceObj.playlist || []);
    let scheduledPlaylist = deviceObj.scheduledPlaylist || { enabled: false, items: [] };

    //neu la admin thi tra ve toan bo playlist, neu la tv thi loc bo item an
    const finalPlaylist = forAdmin ? playlist : playlist.filter(item => item.isHidden !== true);
    const finalScheduledItems = forAdmin ? scheduledPlaylist.items : scheduledPlaylist.items.filter(item => item.isHidden !== true);
    
    res.json({  
        success: true,
        deviceId: deviceId,
        group: deviceObj.group || "tv",
        displayName: deviceObj.displayName || deviceId,
        items: finalPlaylist, // Playlist chính
        scheduledPlaylist: {  // Playlist phụ hẹn giờ kèm theo
            ...scheduledPlaylist,
            items: finalScheduledItems
        }
    });
});

//tra ve danh sach thiet bi neu da dang nhap admin/manager
app.get('/api/devices', requireAuth, async (req, res) => {
    const parsed = await readAllPlaylist();
    let devices = parsed.devices || {};

    // Nếu là manager, lọc chỉ giữ lại các thiết bị được phân quyền trong allowedDevices
    if (req.session.user.role === 'manager') {
        const users = await readUsers();
        const currentUser = users.find(u => u.id === req.session.user.id);
        const allowedList = currentUser?.allowedDevices || [];
        
        const filteredDevices = {};
        allowedList.forEach(devId => {
            if (devices[devId]) {
                filteredDevices[devId] = devices[devId];
            }
        });
        devices = filteredDevices;
    }

    res.json({
        success: true, 
        devices: devices
    });
});

//giao dien web dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//xu ly upload va them vao playlist
app.post('/upload', requireAuth, upload.single('mediaFile'), async (req, res) => {
    // if (!req.file) {
    //     return res.status(400).send('Không có file được tải lên');
    // }

    const deviceId = req.body.deviceId;
    const mediaIdFromPool = req.body.mediaIdFromPool; // Nếu chọn từ kho chung

    if (!deviceId) {
        return res.status(400).send('Thiếu mã thiết bị (deviceId)');
    }

    let newItem = null;
    let parsed = await readAllPlaylist();

    if (mediaIdFromPool) {
        // Lấy tệp từ kho Media Pool chung của Admin
        const mediaFound = parsed.mediaLibrary.find(m => m.id === mediaIdFromPool);
        if (mediaFound) {
            newItem = {
                id: Date.now() + '-' + Math.floor(Math.random() * 1000),
                mediaId: mediaFound.id,
                title: mediaFound.title,
                type: mediaFound.type,
                url: mediaFound.url,
                duration: mediaFound.duration,
                isHidden: false,
                origin: 'admin_shared', // Nguồn gốc từ Admin
                canDelete: false        // Manager không được xóa tệp này khỏi playlist
            };
        }
    }

    if (!newItem && req.file) {
        // Manager tự upload tệp custom riêng cho thiết bị
        const fileType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
        const serverIp = getLocalIpAddress();
        const fileUrl = `http://${serverIp}:${PORT}/media/${req.file.filename}`;

        newItem = {
            id: Date.now() + '-' + Math.floor(Math.random() * 1000),
            title: req.body.title || req.file.originalname,
            type: fileType,
            url: fileUrl,
            duration: fileType === 'image' ? parseInt(req.body.duration || 10, 10) : 0,
            isHidden: false,
            origin: 'manager_custom', // Nguồn gốc tự upload
            canDelete: true           // Manager có toàn quyền xóa
        };
    }

    if (!newItem) {
        return res.status(400).send('Không có tệp nào được chọn hoặc tải lên');
    }

    //nhan dien url theo moi truong may ao hoac mang LAN
    //o day mac dinh cau hinh url tro ve localhost
    // const host = req.get('host');
    // const fileUrl = `http://${host}/media/${req.file.filename}`;
    // const fileUrl = `http://10.0.2.2:${PORT}/media/${req.file.filename}`;
    const serverIp = getLocalIpAddress();
    const fileUrl = `http://${serverIp}:${PORT}/media/${req.file.filename}`;

    // const newItem = {
    //     id: Date.now() + '-' + Math.floor(Math.random() * 1000),
    //     title: req.body.title || req.file.originalname,
    //     type: fileType,
    //     url: fileUrl,
    //     duration: fileType === 'image' ? parseInt(req.body.duration || 10, 10) : 0,
    //     isHidden: false
    // };

    //doc, them, luu vao playlist cua deviceId
    const targetPlaylist = req.body.targetPlaylist; // Nhận diện tab đích: 'main' hoặc 'scheduled'
    parsed = await readAllPlaylist();
    if (!parsed.devices || !parsed.devices[deviceId]) {
        return res.status(404).send('Không tìm thấy thiết bị');
    }

    let deviceObj = parsed.devices[deviceId];
    if (Array.isArray(deviceObj)) {
        deviceObj = { group: "tv", displayName: deviceId, playlist: deviceObj, scheduledPlaylist: { enabled: false, items: [] } };
        parsed.devices[deviceId] = deviceObj;
    }

    if (targetPlaylist === 'scheduled') {
        // Đẩy vào Playlist hẹn giờ
        if (!deviceObj.scheduledPlaylist) {
            deviceObj.scheduledPlaylist = { enabled: false, items: [] };
        }
        if (!Array.isArray(deviceObj.scheduledPlaylist.items)) {
            deviceObj.scheduledPlaylist.items = [];
        }
        deviceObj.scheduledPlaylist.items.push(newItem);
    } else {
        // Đẩy vào Playlist chính (mặc định)
        if (!Array.isArray(deviceObj.playlist)) {
            deviceObj.playlist = [];
        }
        deviceObj.playlist.push(newItem);
    }

    await fs.promises.writeFile(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');

    const redirectPath = req.session.user.role === 'admin' ? '/' : '/manager.html';
    res.redirect(`${redirectPath}?deviceId=${deviceId}`);
    // let playlist = await readPlaylist(deviceId);
    // if (!Array.isArray(playlist)) playlist = [];

    // playlist.push(newItem);
    // if (!devices[deviceId]) {
    //     devices[deviceId] = { group: "DEFAULT", displayName: deviceId, playlist: [] };
    // }
    // // Nếu cấu trúc cũ vẫn là mảng, chuyển đổi sang object hoặc push trực tiếp
    // if (Array.isArray(devices[deviceId])) {
    //     devices[deviceId].push(newItem);
    // } else {
    //     // Cấu trúc mới: đẩy vào mảng nằm bên trong thuộc tính .playlist
    //     if (!devices[deviceId].playlist) {
    //         devices[deviceId].playlist = [];
    //     }
    //     devices[deviceId].playlist.push(newItem);
    // }
    // await savePlaylist(deviceId, playlist);

    // const redirectPath = req.session.user.role === 'admin' ? '/' : '/manager.html';

    // res.redirect(`${redirectPath}?deviceId=${deviceId}`);
});

// API Thêm tệp từ Thư viện chung vào Playlist của TV
app.post('/api/playlist/add-from-pool', requireAuth, async (req, res) => {
    const { deviceId, mediaIdFromPool } = req.body;
    if (!deviceId || !mediaIdFromPool) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin thiết bị hoặc mã media" });
    }

    let parsed = await readAllPlaylist();
    if (!parsed.mediaLibrary) parsed.mediaLibrary = [];

    const mediaFound = parsed.mediaLibrary.find(m => m.id === mediaIdFromPool);
    if (!mediaFound) {
        return res.status(404).json({ success: false, message: "Không tìm thấy tệp trong thư viện chung" });
    }

    const newItem = {
        id: Date.now() + '-' + Math.floor(Math.random() * 1000),
        mediaId: mediaFound.id,
        title: mediaFound.title,
        type: mediaFound.type,
        url: mediaFound.url,
        duration: mediaFound.duration,
        isHidden: false,
        origin: 'admin_shared', // Nguồn gốc từ Admin
        canDelete: false        // Không cho phép xóa trực tiếp nếu không phải quyền tối cao
    };

    let playlist = await readPlaylist(deviceId);
    if (!Array.isArray(playlist)) playlist = [];
    playlist.push(newItem);
    await savePlaylist(deviceId, playlist);

    res.json({ success: true, message: "Đã thêm tệp vào playlist thành công" });
});

// API Xóa tệp khỏi kho Media chung (Chỉ Admin)
app.delete('/api/media-library/:id', requireAuth, requireAdmin, async (req, res) => {
    const mediaId = req.params.id;
    let parsed = await readAllPlaylist();

    if (!parsed.mediaLibrary) parsed.mediaLibrary = [];

    const mediaIndex = parsed.mediaLibrary.findIndex(m => m.id === mediaId);
    if (mediaIndex === -1) {
        return res.status(404).json({ success: false, message: "Không tìm thấy tệp trong kho chung" });
    }

    const mediaToDelete = parsed.mediaLibrary[mediaIndex];

    // Xóa file vật lý trong thư mục media
    try {
        const filename = mediaToDelete.url ? mediaToDelete.url.split('/media/')[1] : null;
        if (filename) {
            const filePath = path.join(mediaDir, filename);
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
        }
    } catch (e) {
        console.error("Không thể xoá file vật lý của media pool", e);
    }

    // Xóa khỏi danh sách mediaLibrary
    parsed.mediaLibrary.splice(mediaIndex, 1);

    await fs.promises.writeFile(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
    res.json({ success: true, message: "Đã xóa tệp khỏi kho chung thành công" });
});

//an hien quang cao
//api thay doi trang thai an/hien quang cao cho tung thiet bi
app.post('/api/toggle-ad', requireAuth, async (req, res) => {
    const { deviceId, adId, show } = req.body; // show: true là hiện, false là ẩn
    if (!deviceId || !adId) {
        return res.status(400).json({ success: false, message: "Thiếu thông tin deviceId hoặc adId" });
    }

    let playlist = await readPlaylist(deviceId);
    let updated = false;

    playlist = playlist.map(item => {
        if (item.id === adId) {
            updated = true;
            return { ...item, isHidden: !show }; // Nếu show = false thì isHidden = true (bị ẩn)
        }
        return item;
    });

    if (updated) {
        await savePlaylist(deviceId, playlist);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, message: "Không tìm thấy quảng cáo" });
    }
});

// API Xóa tệp khỏi playlist (Kiểm tra quyền hạn: admin xóa tất cả, manager chỉ xóa tệp manager_custom)
app.delete('/api/playlist/:deviceId/:id', requireAuth, async (req, res) => {
    const { deviceId, id } = req.params;
    const userRole = req.session.user.role;
    let playlist = await readPlaylist(deviceId);

    //tim item trong playlist de lay ten file
    const itemToDelete = playlist.find(item => item.id === id);
    if (!itemToDelete) {
        return res.status(404).json({ success: false, message: "Không tìm thấy tệp" });
    }
    // Phân quyền: Manager không được xóa tệp có nguồn gốc admin_shared
    if (userRole !== 'admin' && itemToDelete.origin === 'admin_shared') {
        return res.status(403).json({ success: false, message: "Bạn không có quyền xóa tệp này" });
    }

    // Nếu là tệp do manager tự upload hoặc admin xóa, có thể dọn dẹp file vật lý nếu không nằm trong mediaLibrary
    if (itemToDelete.origin === 'manager_custom') {
        try {
            //trich xuat ten file tu url de xoa trong /media
            const filename = itemToDelete.url ? itemToDelete.url.split('/media/')[1] : null;
            if (filename) {
                const filePath = path.join(mediaDir, filename);
                if (fs.existsSync(filePath)) {
                    await fs.promises.unlink(filePath); //xoa file tren o cung
                }
            }
            
        } catch (e) {
            console.error("Không thể xoá file", e);
        }
        
    }
    //loc item khoi playlist va luu lai file json
    playlist = playlist.filter(item => item.id !== id);
    await savePlaylist(deviceId, playlist);

    //res.redirect(`/?deviceId=${deviceId}`);
    res.json({ success: true });
});

//xoa thiet bi tv
app.delete('/api/delete-device/:deviceId', requireAdmin, async (req, res) => {
    const deviceId = req.params.deviceId;
    let parsed = await readAllPlaylist();

    if (parsed.devices && parsed.devices[deviceId]) {
        //xoa file vat ly tren may
        // const items = parsed.devices[deviceId];

        const devData = parsed.devices[deviceId];
        // Lấy mảng items an toàn từ object hoặc array cũ
        const items = Array.isArray(devData) ? devData : (devData?.playlist || []);

        for (const item of items) {
            if (item.origin === 'manager_custom') {
                try {
                    const filename = item.url ? item.url.split('/media/')[1] : null;
                    if (filename) {
                        const filePath = path.join(mediaDir, filename);
                        if (fs.existsSync(filePath)) {
                            await fs.promises.unlink(filePath);
                        }
                    }
                } catch (e) {
                    console.error("Lỗi xóa file của thiết bị", e);
                }
            }
        }

        //xoa thiet bi khoi object devices
        delete parsed.devices[deviceId];

        //ghi lai file json
        try {
            await fs.promises.writeFile(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
        } catch (error) {
            console.error("Lỗi khi ghi file sau khi xoá thiết bị", error);
            return res.status(500).json({ success: false, message: "Lỗi ghi dữ liệu" });
        }
    }

    res.json({ success: true });
});

// API Cập nhật hoặc Bật/Tắt lịch phát phụ (Scheduled Playlist) cho thiết bị (Chỉ Admin)
app.post('/api/device/schedule', requireAuth, requireAdmin, async (req, res) => {
    const { deviceId, enabled, title, startTime, endTime, items } = req.body;
    
    if (!deviceId) {
        return res.status(400).json({ success: false, message: "Thiếu mã thiết bị (deviceId)" });
    }

    let parsed = await readAllPlaylist();
    if (!parsed.devices || !parsed.devices[deviceId]) {
        return res.status(404).json({ success: false, message: "Không tìm thấy thiết bị" });
    }

    // Đảm bảo cấu trúc thiết bị là object chuẩn, không phải mảng cũ
    let deviceObj = parsed.devices[deviceId];
    if (Array.isArray(deviceObj)) {
        deviceObj = { group: "tv", displayName: deviceId, playlist: deviceObj };
        parsed.devices[deviceId] = deviceObj;
    }

    // Cập nhật cấu hình scheduledPlaylist
    deviceObj.scheduledPlaylist = {
        enabled: enabled !== undefined ? Boolean(enabled) : false,
        title: title || "Lịch phát hẹn giờ",
        startTime: startTime || "", // Định dạng: "YYYY-MM-DDTHH:mm"
        endTime: endTime || "",     // Định dạng: "YYYY-MM-DDTHH:mm"
        items: Array.isArray(items) ? items : (deviceObj.scheduledPlaylist?.items || [])
    };

    try {
        await fs.promises.writeFile(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
        res.json({ 
            success: true, 
            message: "Cập nhật lịch hẹn giờ thành công", 
            scheduledPlaylist: deviceObj.scheduledPlaylist 
        });
    } catch (error) {
        console.error("Lỗi khi ghi file lịch hẹn giờ:", error);
        res.status(500).json({ success: false, message: "Lỗi hệ thống khi lưu lịch" });
    }
});

// API Thêm tệp vào Playlist phụ hẹn giờ của thiết bị (Hỗ trợ cả chọn từ kho chung và upload custom)
app.post('/api/scheduled-playlist/add', requireAuth, upload.single('mediaFile'), async (req, res) => {
    const { deviceId, mediaIdFromPool } = req.body;
    
    if (!deviceId) {
        return res.status(400).json({ success: false, message: "Thiếu mã thiết bị (deviceId)" });
    }

    let parsed = await readAllPlaylist();
    if (!parsed.devices || !parsed.devices[deviceId]) {
        return res.status(404).json({ success: false, message: "Không tìm thấy thiết bị" });
    }

    let deviceObj = parsed.devices[deviceId];
    if (Array.isArray(deviceObj)) {
        deviceObj = { group: "tv", displayName: deviceId, playlist: deviceObj, scheduledPlaylist: { enabled: false, items: [] } };
        parsed.devices[deviceId] = deviceObj;
    }

    if (!deviceObj.scheduledPlaylist) {
        deviceObj.scheduledPlaylist = { enabled: false, items: [] };
    }

    let newItem = null;

    // Trường hợp 1: Chọn từ Kho Media chung (Media Pool)
    if (mediaIdFromPool) {
        const mediaFound = (parsed.mediaLibrary || []).find(m => m.id === mediaIdFromPool);
        if (mediaFound) {
            newItem = {
                id: 'sched_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                mediaId: mediaFound.id,
                title: mediaFound.title,
                type: mediaFound.type,
                url: mediaFound.url,
                duration: mediaFound.duration,
                isHidden: false,
                origin: 'admin_shared'
            };
        }
    } 
    // Trường hợp 2: Tải lên tệp mới trực tiếp
    else if (req.file) {
        const fileType = req.file.mimetype.startsWith('video') ? 'video' : 'image';
        const serverIp = getLocalIpAddress();
        const fileUrl = `http://${serverIp}:${PORT}/media/${req.file.filename}`;

        newItem = {
            id: 'sched_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            title: req.body.title || req.file.originalname,
            type: fileType,
            url: fileUrl,
            duration: fileType === 'image' ? parseInt(req.body.duration || 10, 10) : 0,
            isHidden: false,
            origin: req.session.user.role === 'admin' ? 'admin_shared' : 'manager_custom'
        };
    }

    if (!newItem) {
        return res.status(400).json({ success: false, message: "Không có tệp nào được chọn hoặc tải lên" });
    }

    if (!Array.isArray(deviceObj.scheduledPlaylist.items)) {
        deviceObj.scheduledPlaylist.items = [];
    }

    deviceObj.scheduledPlaylist.items.push(newItem);

    try {
        await fs.promises.writeFile(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
        
        // Phản hồi linh hoạt tùy theo kiểu gọi (Fetch JSON hay Form Redirect)
        if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
            return res.json({ success: true, message: "Đã thêm tệp vào playlist hẹn giờ", scheduledPlaylist: deviceObj.scheduledPlaylist });
        }
        
        const redirectPath = req.session.user.role === 'admin' ? '/' : '/manager.html';
        res.redirect(`${redirectPath}?deviceId=${deviceId}`);
    } catch (error) {
        console.error("Lỗi ghi file khi thêm tệp vào lịch hẹn giờ:", error);
        res.status(500).json({ success: false, message: "Lỗi hệ thống khi lưu dữ liệu" });
    }
});

// API Xóa tệp khỏi Playlist phụ hẹn giờ của thiết bị
app.delete('/api/playlist/:deviceId/scheduled/:id', requireAuth, async (req, res) => {
    const { deviceId, id } = req.path || req.params; // Lấy tham số chuẩn từ URL
    // Lưu ý Express route params: /api/playlist/:deviceId/scheduled/:id
    const actualDeviceId = req.params.deviceId;
    const actualId = req.params.id;

    let parsed = await readAllPlaylist();
    if (!parsed.devices || !parsed.devices[actualDeviceId]) {
        return res.status(404).json({ success: false, message: "Không tìm thấy thiết bị" });
    }

    let deviceObj = parsed.devices[actualDeviceId];
    if (!deviceObj.scheduledPlaylist || !Array.isArray(deviceObj.scheduledPlaylist.items)) {
        return res.status(404).json({ success: false, message: "Không tìm thấy playlist hẹn giờ" });
    }

    const itemIndex = deviceObj.scheduledPlaylist.items.findIndex(item => item.id === actualId);
    if (itemIndex === -1) {
        return res.status(404).json({ success: false, message: "Không tìm thấy tệp trong lịch hẹn giờ" });
    }

    const itemToDelete = deviceObj.scheduledPlaylist.items[itemIndex];

    // Nếu là tệp tự tải lên riêng, tiến hành dọn dẹp file vật lý
    if (itemToDelete.origin === 'manager_custom') {
        try {
            const filename = itemToDelete.url ? itemToDelete.url.split('/media/')[1] : null;
            if (filename) {
                const filePath = path.join(mediaDir, filename);
                if (fs.existsSync(filePath)) {
                    await fs.promises.unlink(filePath);
                }
            }
        } catch (e) {
            console.error("Không thể xóa file vật lý của lịch hẹn giờ", e);
        }
    }

    // Xóa khỏi mảng items của scheduledPlaylist
    deviceObj.scheduledPlaylist.items.splice(itemIndex, 1);

    try {
        await fs.promises.writeFile(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
        res.json({ success: true, message: "Đã xóa tệp khỏi lịch hẹn giờ thành công" });
    } catch (error) {
        console.error("Lỗi ghi file khi xóa tệp lịch hẹn giờ:", error);
        res.status(500).json({ success: false, message: "Lỗi hệ thống khi lưu dữ liệu" });
    }
});

// async function generateHash() {
//     const hash = await bcrypt.hash('123', 10);
//     console.log('Hash chuẩn cho mật khẩu 123 là:', hash);
// }

// generateHash();

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);

    // //quang ba dich vu http de tv trong mang lan tu dong tim thay
    // bonjour.publish({
    //     name: 'DigitalSignageServer', //ten dinh danh server trong mang
    //     type: 'http', //giao thuc
    //     port: PORT,
    //     txt: { path: '/api/playlist'}
    // });
    // console.log(`mDNS Service published: DigitalSignageServer on port ${PORT}`);
});

