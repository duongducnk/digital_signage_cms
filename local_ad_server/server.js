const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { version } = require('os');
const { url } = require('inspector');

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

//doc giu lieu tu file playlist.json
const playlistFilePath = path.join(__dirname, 'playlist.json');
function readPlaylist() {
    try {
        if (fs.existsSync(playlistFilePath)) {
            const data = fs.readFileSync(playlistFilePath, 'utf8');
            const parsed = JSON.parse(data);
            return parsed.items || []
        }
    } catch (error) {
        console.error("Loi khi doc file playlist.json", error);
    }
    return []; //tra ve mang rong neu khong co file hoac file loi
}

//ghi du lieu ra file json
function savePlaylist(items) {
    try {
        const data = JSON.stringify({ items: items}, null, 2);
        fs.writeFileSync(playlistFilePath, data, 'utf8');
    } catch (error) {
        console.error("Loi khi ghi file playlist.json", error);
    }
}

//tra ve cau truc json chua link ads
app.get('/api/playlist', (req, res) => {  //tra ve playlist
    const playlist = readPlaylist();
    res.json({  
        success :true,
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

    const fileType = req.file.mimetype.startsWith('video') ? 'video' : 'image';

    //nhan dien url theo moi truong may ao hoac mang LAN
    //o day mac dinh cau hinh url tro ve localhost
    // const host = req.get('host');
    // const fileUrl = `http://${host}/media/${req.file.filename}`;
    const fileUrl = `http://10.0.2.2:${PORT}/media/${req.file.filename}`;

    const newItem = {
        id: Date.now().toString(),
        title: req.body.title || req.file.originalname,
        type: fileType,
        url:fileUrl,
        duration: fileType === 'image' ? parseInt(req.body.duration || 10) : 0
    };

    const playlist = readPlaylist();
    playlist.push(newItem);
    savePlaylist(playlist);

    res.redirect('/');
});

//xoa muc khoi playlist
app.get('/delete/:id', (req, res) => {
    const id = req.params.id;
    let playlist = readPlaylist();

    //tim item trong playlist de lay ten file
    const itemToDelete = playlist.find(item => item.id === id);
    if (itemToDelete) {
        //trich xuat ten file tu url de xoa trong /media
        const filename = itemToDelete.url.split('/media/')[1];
        const filePath = path.join(mediaDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath); //xoa file tren o cung
        }
    }
    //loc item khoi playlist va luu lai file json
    playlist = playlist.filter(item => item.id !== id);
    savePlaylist(playlist);

    res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server dang chay tai http://localhost:${PORT}`);
})