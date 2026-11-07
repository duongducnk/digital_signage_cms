package com.example.digitalsignage

import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalTvMaterial3Api::class)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

//        //lay ma dinh danh tv deviceId
//        val deviceId = android.provider.Settings.Secure.getString(
//            contentResolver,
//            android.provider.Settings.Secure.ANDROID_ID
//        ) ?: "default_tv"

        //lang nghe khi tv tinh day tu trang thai cho
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onResume(owner: LifecycleOwner) {
                super.onResume(owner)
            }
        })

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }

        val serviceIntent = android.content.Intent(this, AdsForegroundService::class.java)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        setContent {
            var currentDeviceId by remember { mutableStateOf(DevicePreference.getDeviceId(this)) }

            //bien trang thai chuyen qua lai giua man hinh cai dat va man hinh quang cao
            var isSettingMode by remember { mutableStateOf(false) }

            Surface(
                modifier = Modifier.fillMaxSize(),
                color = Color.Black
            ) {
                Box (
                    modifier = Modifier.fillMaxSize().background(Color.Black),
                    contentAlignment = Alignment.Center
                ) {
                    if (isSettingMode) {
                        SettingsScreen { newId ->
                            currentDeviceId = newId
                            isSettingMode = false // luu xong thi chuyen ve man hinh phat quang cao
                        }
                    } else {
                        AdsPlayerScreen(
                            //serverBaseUrl = "http://192.168.11.223:3000",
                            serverBaseUrl = "http://192.168.20.203:3000",
                            deviceId = currentDeviceId,
                            onSettingsClick = {
                                isSettingMode = true //mo lai man hinh cai dat khi can
                            }
                        )
                    }
                }
            }
//            Box (
//                modifier = Modifier.fillMaxSize().background(Color.Black),
//                contentAlignment = Alignment.Center
//            ) {
//                AdsPlayerScreen(
//                   serverBaseUrl = "http://10.0.2.2:3000",
//                    deviceId = deviceId
//                )
//            }

//            DigitalSignageTheme {
//                Surface(
//                    modifier = Modifier.fillMaxSize(),
//                    shape = RectangleShape
//                ) {
//                    //Greeting("Android")
//                    Image(
//                        painter = painterResource(id = R.drawable.bia),
//                        contentDescription = null,
//                        modifier = Modifier
//                    )
//                }
//            }
        }
    }

    //ho tro phim menu tren remote tv de mo bang doi device id
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_SETTINGS) {
            //restart activit hoac chuyen trang thai sang settings
            recreate() //xu ly state tuong ung
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}

data class ScheduledPlaylist(
    val enabled: Boolean,
    val startTime: String,
    val endTime: String,
    val items: List<AdItem>
)

data class  AdItem(val type: String, val url: String, val duration: Int)

//lay chuoi du lieu tu server
suspend fun fetchPlaylistResponse(urlString: String): Pair<List<AdItem>, ScheduledPlaylist?> {
    return withContext(Dispatchers.IO) {
        //val list = mutableListOf<AdItem>()
        var mainList = listOf<AdItem>()
        var scheduledData: ScheduledPlaylist? = null
        try {
            val url = URL(urlString)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 5000
            connection.readTimeout = 5000

            val reader = connection.inputStream.bufferedReader()
            val response = reader.readText()
            reader.close()

            val json = JSONObject(response)

            // 1. Đọc playlist chính
            val items = json.getJSONArray("items")
            val tempMain = mutableListOf<AdItem>()
            for (i in 0 until items.length()) {
                val obj = items.getJSONObject(i)
                tempMain.add(AdItem(
                    type = obj.getString("type"),
                    url = obj.getString("url"),
                    duration = obj.getInt("duration")
                ))
            }
            mainList = tempMain

            // 2. Đọc playlist phụ hẹn giờ (nếu có từ server)
            if (json.has("scheduledPlaylist")) {
                val schedObj = json.getJSONObject("scheduledPlaylist")
                val enabled = schedObj.optBoolean("enabled", false)
                val startTime = schedObj.optString("startTime", "")
                val endTime = schedObj.optString("endTime", "")

                val schedItemsArray = schedObj.getJSONArray("items")
                val tempSchedItems = mutableListOf<AdItem>()
                for (i in 0 until schedItemsArray.length()) {
                    val obj = schedItemsArray.getJSONObject(i)
                    tempSchedItems.add(AdItem(
                        type = obj.getString("type"),
                        url = obj.getString("url"),
                        duration = obj.getInt("duration")
                    ))
                }
                scheduledData = ScheduledPlaylist(enabled, startTime, endTime, tempSchedItems)
            }
        }
        catch (e: Exception) {
            e.printStackTrace()
        }
        Pair(mainList, scheduledData)
    }
}

@Composable
fun AdsPlayerScreen(
    serverBaseUrl: String,
    deviceId: String,
    onSettingsClick: () -> Unit
) { //xu ly chuoi du lieu tu server

    val context = LocalContext.current
    //tao url dong kem theo deviceId
    val serverUrl = "$serverBaseUrl/api/playlist?deviceId=$deviceId"

    var mainPlaylist by remember { mutableStateOf<List<AdItem>>(emptyList()) }
    var scheduledPlaylistState by remember { mutableStateOf<ScheduledPlaylist?>(null) }
    //var pendingPlaylist by remember { mutableStateOf<List<AdItem>>(emptyList()) }

    var currentIndex by remember { mutableIntStateOf(0) }
    var playbackKey by remember { mutableIntStateOf(0) } //khoa tang dan de buoc lam moi player, timer
    var isLoading by remember { mutableStateOf(true) }

    // Biến theo dõi danh sách đang thực tế phát trên màn hình (Playlist chính hay Playlist phụ)
    var activePlaylistToPlay by remember { mutableStateOf<List<AdItem>>(emptyList()) }

    LaunchedEffect(serverUrl) {
        // 1. NGAY KHI KHỞI ĐỘNG: Thử load cache cục bộ lên trước để phát ngay lập tức nếu mất mạng
        val cachedMain = loadPlaylistCache(context)
        val cachedSched = loadScheduleCache(context)
        if (cachedMain.isNotEmpty()) {
            mainPlaylist = cachedMain
            scheduledPlaylistState = cachedSched
            isLoading = false
        }

        while (true) {
            val (fetchedMain, fetchedSched) = fetchPlaylistResponse(serverUrl)
            if (fetchedMain.isNotEmpty() || fetchedSched != null) {
//                val localProcessedList = fetchedMain.map { item ->
//                    val localPath = getOrDownloadLocalFile(context, item.url)
//                    // Thay thế URL mạng bằng đường dẫn file cục bộ
//                    item.copy(url = localPath)
//                }
//                if (localProcessedList != playlist) {
//                    playlist = localProcessedList
//                    isLoading = false
//
//                    // Đảm bảo currentIndex không bị tràn (out of bounds) sau khi cập nhật danh sách mới
//                    if (currentIndex >= playlist.size) {
//                        currentIndex = 0
//                    }
//
//                    // Lưu lại cache mới nhất để phòng lần sau mất mạng
//                    savePlaylistCache(context, localProcessedList)
//
//                    // Dọn dẹp tệp thừa
//                    cleanUnusedFiles(context, localProcessedList)
//                }
//
////                if (playlist.isEmpty()) { //luc mo app
////                    playlist = localProcessedList
////                    isLoading = false
////                } else {
////                    //neu dang chay quang cao thi luu vao pendingPlaylist
////                    //pendingPlaylist = fetchedMain
////
////                    //cap nhat ngay neu danh sach tu server thay doi so voi hien tai
////                    //kiem tra bang cach so sanh kich thuoc hoac phan tu dau tien
////                    if (localProcessedList != playlist) {
////                        playlist = localProcessedList
////                        //dam bao currentIndex khong bi tran sau khi cap nhat danh sach
////                        if (currentIndex >= playlist.size) {
////                            currentIndex = 0
////                        }
////                    }
////                }
//            } else {
//                //neu server tra ve danh sach rong
//                if (playlist.isEmpty()) {
//                    playlist = emptyList()
//                    currentIndex = 0
//                    isLoading = false
//                }
                // Tải trước các tệp media về thư mục nội bộ (cho cả playlist chính và playlist phụ)
                val processedMain = fetchedMain.map { it.copy(url = getOrDownloadLocalFile(context, it.url)) }
                val processedSchedItems = fetchedSched?.items?.map { it.copy(url = getOrDownloadLocalFile(context, it.url)) } ?: emptyList()

                val processedSched = fetchedSched?.copy(items = processedSchedItems)

                if (processedMain != mainPlaylist || processedSched != scheduledPlaylistState) {
                    mainPlaylist = processedMain
                    scheduledPlaylistState = processedSched
                    isLoading = false
                    savePlaylistCache(context, processedMain)
                    saveScheduleCache(context, processedSched)

                    // Gom dọn dẹp file thừa từ cả 2 playlist
                    val allActiveFiles = processedMain + processedSchedItems
                    cleanUnusedFiles(context, allActiveFiles)
                }
            }
            delay(10000)  //tai playlist tu server moi 10s
        }
    }

    // 2. Thuật toán kiểm tra thời gian thực để phân định phát playlist chính hay phụ
    LaunchedEffect(mainPlaylist, scheduledPlaylistState) {
        while (true) {
            var shouldUseScheduled = false

            val sched = scheduledPlaylistState
            if (sched != null && sched.enabled && sched.startTime.isNotBlank() && sched.endTime.isNotBlank()) {
                try {
                    // Định dạng thời gian từ thẻ input datetime-local của web admin dạng "YYYY-MM-DDTHH:mm"
                    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm", java.util.Locale.getDefault()).apply {
                        // Đồng bộ múi giờ hệ thống để khớp tuyệt đối với Admin Web
                        timeZone = java.util.TimeZone.getDefault()
                    }

                    val startMillis = sdf.parse(sched.startTime)?.time ?: 0L
                    val endMillis = sdf.parse(sched.endTime)?.time ?: 0L
                    val currentMillis = System.currentTimeMillis()

                    if (currentMillis in startMillis..endMillis && sched.items.isNotEmpty()) {
                        shouldUseScheduled = true
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }

            val targetList = if (shouldUseScheduled) sched!!.items else mainPlaylist
            if (activePlaylistToPlay != targetList) {
                activePlaylistToPlay = targetList
                currentIndex = 0 // Reset lại vị trí phát từ đầu khi chuyển đổi qua lại giữa lịch chính và lịch phụ
                playbackKey++ // Bắt buộc làm mới trình phát ngay khi đổi lịch
            }
            delay(2000) // Kiểm tra mốc thời gian mỗi 2 giây
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        //dieu phoi hien thi quang cao khi co du lieu playlist
        if (!isLoading && activePlaylistToPlay.isNotEmpty()) {
            //dam bao currentIndex khong bao gio vuot qua kich thuoc mang moi, tranh loi khi xoa item
            if (currentIndex >= activePlaylistToPlay.size) {
                currentIndex = 0
            }

            val currentAd = activePlaylistToPlay[currentIndex]

            AdsPlayer(
                adUrl = currentAd.url,
                adType = currentAd.type,
                duration = currentAd.duration,
                playbackKey =  playbackKey //ep lam moi moi khi chay 1 item
            ) {
                //tang index dung chia lay du de tu dong lap
                currentIndex = (currentIndex + 1) % activePlaylistToPlay.size //chuyen sang quang cao tiep
                playbackKey++ //tang key de bao hieu composable chay lai tu

//            if (currentIndex == 0) { //sau khi chay het 1 vong lap day du, cap nhat playlist moi neu co
//                if (pendingPlaylist.isNotEmpty()) { //neu co playlist moi
//                    playlist = pendingPlaylist
//                    pendingPlaylist = emptyList()
//                }
//            }
            }
        }

        //su dung onSettingsClick tao nut cai dat
        Button(
            onClick = onSettingsClick,
            modifier = Modifier.align(Alignment.TopEnd).padding(16.dp)
        ) {
            androidx.tv.material3.Text("Cài đặt TV")
        }

    }


//    videoUrl: String = "https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4"
//    val context = LocalContext.current

//    val videoUrl = "android.resource://${context.packageName}/${R.raw.sample_10s_360p}".toUri()

//    val exoPlayer = remember {
//        ExoPlayer.Builder(context).build().apply {
//            val mediaItem = MediaItem.fromUri("http://192.168.22.122:3000/uploads/zzz.png")
//            setMediaItem(mediaItem)
//            repeatMode = Player.REPEAT_MODE_ALL //lap vo han video
//            prepare()
//            playWhenReady = true //tu dong phat khi mo app
//
//            addListener(object : Player.Listener {
//                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
//                    android.util.Log.e("ExoPlayerError", "Loi phat mang: ${error.message}")
//                }
//            })
//        }
//    }
}

@Composable
fun AdsPlayer (
    adUrl: String,
    adType: String,
    duration: Int,
    playbackKey: Int,
    onAdsCompleted: () -> Unit) {
    val context = LocalContext.current

    //khoi tao exoplayer
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = true
        }
    }

    //dung launchedEffect rieng cho anh voi khoa playbackKey de anh luon dem nguoc ke ca lap lai
    if (adType == "image") {
        LaunchedEffect(playbackKey) {
            delay(duration * 1000L)
            onAdsCompleted()
        }
    }

//    neu la hinh anh, chuyen sau khoang thoi gian duration
//    val handler = android.os.Handler(context.mainLooper)
//    val imageRunnable = Runnable {
//        if (adType == "image" && !isFinished) {
//            isFinished = true
//            onAdsCompleted()
//        }
//    }
//    if (adType == "image") {
//        handler.postDelayed(imageRunnable, duration * 1000L)
//    }

    //cap nhat mediaItem va xu ly su kien hoan thanh video hoac anh
    // dung playbackKey lam khoa de exoplayer luon load va play lai tu dau moi khi chuyen/lap file
    DisposableEffect(playbackKey, adUrl) {
        val mediaItem = MediaItem.fromUri(adUrl)
        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()
        exoPlayer.play()

        var isFinished = false

        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state : Int) {
                //neu la video, chuyen ngay sau khi phat xong
                if (adType == "video" && state == Player.STATE_ENDED && !isFinished) {
                    isFinished = true
                    onAdsCompleted()
                }
            }

            //bat loi phat video/anh de khong bi ket man hinh
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                super.onPlayerError(error)
                if (!isFinished) {
                    isFinished = true
                    onAdsCompleted() //loi thi tu dong bo qua
                }
            }
        }
        exoPlayer.addListener(listener)

        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.stop() //dung player khi doi item
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            exoPlayer.release()
        }
    }
    //nhung playerview cua media3 vao jetpack compose qua androidview
    AndroidView(
        factory = {
                ctx -> PlayerView(ctx).apply {
            player = exoPlayer
            useController = false //an thanh dieu khieu play pause
        }
        },
        modifier = Modifier.fillMaxSize()
    )

}
