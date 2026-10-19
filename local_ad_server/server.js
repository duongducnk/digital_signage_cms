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

            if (Array.isArray(parsed.items)) {
                return { devices: { 'default_tv': parsed.items } };
            }
            return parsed; //parsed.devices && parsed.deviceId ? parsed.devices[deviceId] : [];
        }
    } catch (error) {
        console.error("Loi khi doc file playlist.json", error);
    }
    return { devices: {} }; //tra ve mang rong neu khong co file hoac file loi
}

async function readPlaylist(deviceId) {
    if (!deviceId) return [];
    try  {
        const parsed = await readAllPlaylist();
        return (parsed.devices && parsed.devices[deviceId]) ? parsed.devices[deviceId] : [];
    } catch (error) {
        console.error("Loi khi doc file playlist.json", error);
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

            // chuyen cau truc luu json cu sang moi
            // if (!parsed.devices) {
            //     parsed = { devices: { default_tv: parsed.items || [] } };
            // }

            parsed.devices[deviceId] = items;
            //const data = JSON.stringify({ items: items}, null, 2);
            await fs.promises.writeFile(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
        } catch (error) {
        console.error("Lỗi khi file playlist.json", error);
    }
}


//tra ve cau truc json chua link ads
app.get('/api/playlist', async (req, res) => {  //tra ve playlist
    const deviceId = req.query.deviceId; //lay id tv tu client
    const forAdmin = req.query.admin === 'true';

    if (!deviceId) {
        return res.status(400).json({ success: false, message: "Thiếu tham số deviceId"});
    }

    let playlist = await readPlaylist(deviceId);

    const parsed = await readAllPlaylist(); //neu chua co tv trong he thong, tao tv moi
    if (!parsed.devices || !parsed.devices[deviceId]) {
        await savePlaylist(deviceId, []);
        playlist = [];
    }

    //neu la admin thi tra ve toan bo playlist, neu la tv thi loc bo item an
    const finalPlaylist = forAdmin ? playlist : playlist.filter(item => item.isHidden !== true);

    res.json({  
        success :true,
        deviceId: deviceId,
        items: finalPlaylist
    });
});

//tra ve danh sach thiet bi neu da dang nhap admin/manager
app.get('/api/devices', requireAuth, async (req, res) => {
    const parsed = await readAllPlaylist();
    res.json({
        success: true, 
        devices: parsed.devices || {}
    });
});

//giao dien web dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//xu ly upload va them vao playlist
app.post('/upload', requireAuth, upload.single('mediaFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('Không có file được tải lên');
    }

    const deviceId = req.body.deviceId;
    if (!deviceId) {
        return res.status(400).send('Thiếu mã thiết bị (deviceId)');
    }
    const fileType = req.file.mimetype.startsWith('video') ? 'video' : 'image';

    //nhan dien url theo moi truong may ao hoac mang LAN
    //o day mac dinh cau hinh url tro ve localhost
    // const host = req.get('host');
    // const fileUrl = `http://${host}/media/${req.file.filename}`;
    // const fileUrl = `http://10.0.2.2:${PORT}/media/${req.file.filename}`;
    const serverIp = getLocalIpAddress();
    const fileUrl = `http://${serverIp}:${PORT}/media/${req.file.filename}`;

    const newItem = {
        id: Date.now() + '-' + Math.floor(Math.random() * 1000),
        title: req.body.title || req.file.originalname,
        type: fileType,
        url: fileUrl,
        duration: fileType === 'image' ? parseInt(req.body.duration || 10, 10) : 0,
        isHidden: false
    };

    //doc, them, luu vao playlist cua deviceId
    const playlist = await readPlaylist(deviceId);
    playlist.push(newItem);
    await savePlaylist(deviceId, playlist);

    const redirectPath = req.session.user.role === 'admin' ? '/' : '/manager.html';

    res.redirect(`${redirectPath}?deviceId=${deviceId}`);
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

//xoa muc khoi playlist
app.delete('/api/playlist/:deviceId/:id', requireAdmin, async (req, res) => {
    const { deviceId, id } = req.params;
    let playlist = await readPlaylist(deviceId);

    //tim item trong playlist de lay ten file
    const itemToDelete = playlist.find(item => item.id === id);
    if (itemToDelete) {
        try {
            //trich xuat ten file tu url de xoa trong /media
            const filename = itemToDelete.url.split('/media/')[1];
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
        const items = parsed.devices[deviceId];
        for (const item of items) {
            try {
                const filename = item.url.split('/media/')[1];
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

