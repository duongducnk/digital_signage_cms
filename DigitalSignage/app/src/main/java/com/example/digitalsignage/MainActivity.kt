package com.example.digitalsignage

import android.os.Bundle
import android.view.KeyEvent
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
import androidx.compose.ui.modifier.modifierLocalConsumer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
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
                            serverBaseUrl = "http://10.0.2.2:3000",
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



data class  AdItem(val type: String, val url: String, val duration: Int)

//lay chuoi du lieu tu server
suspend fun fetchPlaylist(urlString: String): List<AdItem> {
    return withContext(Dispatchers.IO) {
        val list = mutableListOf<AdItem>()
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
            val items = json.getJSONArray("items")
            for (i in 0 until items.length()) {
                val obj = items.getJSONObject(i)
                list.add(AdItem(
                    type = obj.getString("type"),
                    url = obj.getString("url"),
                    duration = obj.getInt("duration")
                ))
            }
        }
        catch (e: Exception) {
            e.printStackTrace()
        }
        list
    }
}

@Composable
fun AdsPlayerScreen(
    serverBaseUrl: String,
    deviceId: String,
    onSettingsClick: () -> Unit
) { //xu ly chuoi du lieu tu server
    //tao url dong kem theo deviceId
    val serverUrl = "$serverBaseUrl/api/playlist?deviceId=$deviceId"

    var playlist by remember { mutableStateOf<List<AdItem>>(emptyList()) }
//    var pendingPlaylist by remember { mutableStateOf<List<AdItem>>(emptyList()) }
    var currentIndex by remember { mutableIntStateOf(0) }
    var playbackKey by remember { mutableIntStateOf(0) } //khoa tang dan de buoc lam moi player, timer
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(serverUrl) { //tai playlist tu server moi 10s
        while (true) {
            val fetchedList = fetchPlaylist(serverUrl)
            if (fetchedList.isNotEmpty()) {
                if (playlist.isEmpty()) { //luc mo app
                    playlist = fetchedList
                    isLoading = false
                } else {
                    //neu dang chay quang cao thi luu vao pendingPlaylist
                    //pendingPlaylist = fetchedList

                    //cap nhat ngay neu danh sach tu server thay doi so voi hien tai
                    //kiem tra bang cach so sanh kich thuoc hoac phan tu dau tien
                    if (fetchedList != playlist) {
                        playlist = fetchedList
                        //dam bao currentIndex khong bi tran sau khi cap nhat danh sach
                        if (currentIndex >= playlist.size) {
                            currentIndex = 0
                        }
                    }
                }
            } else {
                //neu server tra ve danh sach rong
                playlist = emptyList()
                currentIndex = 0
            }
            delay(5000) // thu lai sau moi 5s
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        //dieu phoi hien thi quang cao khi co du lieu playlist
        if (!isLoading && playlist.isNotEmpty()) {
            //dam bao currentIndex khong bao gio vuot qua kich thuoc mang moi, tranh loi khi xoa item
            if (currentIndex >= playlist.size) {
                currentIndex = 0
            }

            val currentAd = playlist[currentIndex]

            AdsPlayer(
                adUrl = currentAd.url,
                adType = currentAd.type,
                duration = currentAd.duration,
                playbackKey =  playbackKey //ep lam moi moi khi chay 1 item
            ) {
                //tang index dung chia lay du de tu dong lap
                currentIndex = (currentIndex + 1) % playlist.size //chuyen sang quang cao tiep
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
            androidx.tv.material3.Text("Cai dat TV")
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

//@Composable
//fun Greeting(name: String, modifier: Modifier = Modifier) {
//    Text(
//        text = "Hello $name!",
//        modifier = modifier
//    )
//}
//
//@Preview(showBackground = true)
//@Composable
//fun GreetingPreview() {
//    DigitalSignageTheme {
//        Greeting("Android")
//    }
//}
