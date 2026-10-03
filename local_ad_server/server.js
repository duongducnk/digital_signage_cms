const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { json } = require('stream/consumers');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//playlist mau (co the tach rieng ra file json/database)
// let playlist = [
//     {
//         id: "1",
//         title: "video quang cao",
//         type: "video",
//         url: "http://10.0.2.2:3000/media/toystory.mp4",
//         duration : 0
//     },
//     {
//         id: "2",
//         title: "anh quang cao",
//         type: "image",
//         url: "http://10.0.2.2:3000/media/zzz.png",
//         duration: 10
//     }
// ];

// //luu tru tam cac ma ghep noi
// let pairingCodes = {};

// //api de tv xin ma ghep noi
// app.get('/api/generate-pairing-code', (req, res) => {
//     //tao ngau nhien 4 ky tu viet hoa
//     const code = Math.random().toString(36).substring(2, 6).toUpperCase();

//     pairingCodes[code] = {
//         deviceId: `tv_${Date.now()}`,
//         paired: false,
//         createAt: Date.now()
//     };

//     res.json({
//         success: true,
//         pairingCodes: code
//     });
// });

// //api kiem tra da ghep noi thanh cong
// app.get('/api/check-pairing/:code', (req, res) => {
//     const code = req.params.code;
//     const session = pairingCodes[code];

//     if (!session) {
//         return res.json ({
//             success: false,
//             message: 'Ma khong ton tai hoac da het han'
//         })
//     }

//     if (session.paired) {
//         //neu da duyet, tra ve deviceId chinh thuc cho tv luu
//         res.json({
//             success: true,
//             paired: true,
//             deviceId: session.deviceId
//         });
//     } else {
//         res.json ({
//             success: true,
//             paired: false
//         });
//     }
// });

// //api tren web de admin xac nhan ghep ma voi tv
// app.post('/api/pair-device', (req, res) => {
//     const { pairingCode, customDeviceId } = req.body; //customDeviceId do admin dat
//     if (pairingCodes[pairingCode]) {
//         //cap nhat deviceid theo y admin
//         pairingCodes[pairingCode].deviceId = customDeviceId;
//         pairingCodes[pairingCode].paired = true;
//     }
// })

//doc giu lieu tu file playlist.json
const playlistFilePath = path.join(__dirname, 'playlist.json');

function readAllPlaylist() { //doc toan bo playlist
    try {
        if (fs.existsSync(playlistFilePath)) {
            const data = fs.readFileSync(playlistFilePath, 'utf8');
            const parsed = JSON.parse(data);

            if (Array.isArray(parsed.items)) {
                return { devices: { 'default_tv': parsed.items } };
            }
            return parsed;//parsed.devices && parsed.deviceId ? parsed.devices[deviceId] : [];
        }
    } catch (error) {
        console.error("Loi khi doc file playlist.json", error);
    }
    return { devices: {} }; //tra ve mang rong neu khong co file hoac file loi
}
function readPlaylist(deviceId) {
    if (!deviceId) return [];
    try  {
        const parsed = readAllPlaylist();
        return (parsed.devices && parsed.devices[deviceId]) ? parsed.devices[deviceId] : [];
    } catch (error) {
        console.error("Loi khi ghi file playlist.json", error);
        return [];
    }
}


//ghi du lieu ra file json
function savePlaylist(deviceId, items) {
    try {
        let parsed = readAllPlaylist();
            if (!parsed.devices) {
                parsed.devices = {};
            }

            // chuyen cau truc luu json cu sang moi
            // if (!parsed.devices) {
            //     parsed = { devices: { default_tv: parsed.items || [] } };
            // }

            parsed.devices[deviceId] = items;
            //const data = JSON.stringify({ items: items}, null, 2);
            fs.writeFileSync(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
        } catch (error) {
        console.error("Loi khi ghi file playlist.json", error);
    }
}

//tra ve danh sach thiet bi
app.get('/api/devices', (req, res) => {
    const parsed = readAllPlaylist();
    res.json({
        success: true, 
        devices: parsed.devices || {}
    });
});

//tra ve cau truc json chua link ads
app.get('/api/playlist', (req, res) => {  //tra ve playlist
    const deviceId = req.query.deviceId; //lay id tv tu client
    if (!deviceId) {
        return res.status(400).json({ success: false, message: "Thieu tham so deviceId"});
    }

    let playlist = readPlaylist(deviceId);

    const parsed = readAllPlaylist(); //neu chua co tv trong he thong, tao tv moi
    if (!parsed.devices || !parsed.devices[deviceId]) {
        savePlaylist(deviceId, []);
        playlist = [];
    }

    res.json({  
        success :true,
        deviceId: deviceId,
        items: playlist
    });
});

//giao dien web dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//thu muc luu tru media
const mediaDir = path.join(__dirname, 'media');
if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
}
app.use('/media', express.static(mediaDir)); //cho phep truy cap thu muc
//thu muc html
app.use(express.static(path.join(__dirname, 'public')));

//cau hinh multer de luu file tai len tu web
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, mediaDir);
    },
    filename: (req, file, cb) => {
        //giu nguyen ten file hoac co the xu ly tranh trung lap
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

//xu ly upload va them vao playlist
app.post('/upload', upload.single('mediaFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('Khong co file duoc tai len');
    }

    const deviceId = req.body.deviceId;
    if (!deviceId) {
        return res.status(400).send('Thieu ma thiet bi (deviceId)');
    }
    const fileType = req.file.mimetype.startsWith('video') ? 'video' : 'image';

    //nhan dien url theo moi truong may ao hoac mang LAN
    //o day mac dinh cau hinh url tro ve localhost
    const host = req.get('host');
    const fileUrl = `http://${host}/media/${req.file.filename}`;
    // const fileUrl = `http://10.0.2.2:${PORT}/media/${req.file.filename}`;

    const newItem = {
        id: Date.now() + '-' + Math.floor(Math.random() *1000),
        title: req.body.title || req.file.originalname,
        type: fileType,
        url:fileUrl,
        duration: fileType === 'image' ? parseInt(req.body.duration || 10) : 0
    };

    //doc, them, luu vao playlist cua deviceId
    const playlist = readPlaylist(deviceId);
    playlist.push(newItem);
    savePlaylist(deviceId, playlist);

    res.redirect(`/?deviceId=${deviceId}`);
});

//xoa muc khoi playlist
app.get('/delete/:deviceId/:id', (req, res) => {
    const { deviceId, id }  = req.params;
    let playlist = readPlaylist(deviceId);

    //tim item trong playlist de lay ten file
    const itemToDelete = playlist.find(item => item.id === id);
    if (itemToDelete) {
        try {
            //trich xuat ten file tu url de xoa trong /media
            const filename = itemToDelete.url.split('/media/')[1];
            const filePath = path.join(mediaDir, filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath); //xoa file tren o cung
            }
        } catch (e) {
            console.error("Khong the xoa file", e);
        }
        
    }
    //loc item khoi playlist va luu lai file json
    playlist = playlist.filter(item => item.id !== id);
    savePlaylist(deviceId, playlist);

    res.redirect(`/?deviceId=${deviceId}`);
});

//xoa thiet bi tv
app.get('/api/delete-device/:deviceId', (req, res) => {
    const deviceId = req.params.deviceId;
    let parsed = readAllPlaylist();

    if (parsed.devices && parsed.devices[deviceId]) {
        //xoa thiet bi khoi object devices
        delete parsed.devices[deviceId];

        //ghi lai file json
        try {
            fs.writeFileSync(playlistFilePath, JSON.stringify(parsed, null, 2), 'utf8');
        } catch (error) {
            console.error("Loi khi ghi file sau khi xoa thiet bi", error);
        }
    }

    res.json({ success: true });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server dang chay tai http://localhost:${PORT}`);
})