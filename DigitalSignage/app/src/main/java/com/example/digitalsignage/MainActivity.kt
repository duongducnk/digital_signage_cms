package com.example.digitalsignage

import android.location.GnssAntennaInfo
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.tv.material3.Text
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
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Surface
import com.example.digitalsignage.ui.theme.DigitalSignageTheme
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.core.net.toUri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalTvMaterial3Api::class)

    override fun onCreate(savedInstanceState: Bundle?) {
//        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContent {
            Box (
                modifier = Modifier.fillMaxSize().background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                AdsPlayerScreen(
                   serverUrl = "http://10.0.2.2:3000/api/playlist"
                )
            }

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
fun AdsPlayerScreen(serverUrl: String) { //xu ly chuoi du lieu tu server
    var playlist by remember { mutableStateOf<List<AdItem>>(emptyList()) }
    var pendingPlaylist by remember { mutableStateOf<List<AdItem>>(emptyList()) }
    var currentIndex by remember { mutableIntStateOf(0) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) { //tai playlist tu server moi 30s
        while (true) {
            val fetchedList = fetchPlaylist(serverUrl)
            if (fetchedList.isNotEmpty()) { //luc mo app
                playlist = fetchedList
                isLoading = false
            } else {
                //neu dang chay quang cao thi luu vao pendingPlaylist
                pendingPlaylist = fetchedList
            }
            delay(10000) // thu lai sau moi 10s

        }
    }

    //dieu phoi hien thi quang cao khi co du lieu playlist
    if (!isLoading && playlist.isNotEmpty()) {
        val safeIndex = currentIndex % playlist.size
        val currentAd = playlist[safeIndex]

        AdsPlayer(
            adUrl = currentAd.url,
            adType = currentAd.type,
            duration = currentAd.duration
        ) {
            //currentIndex++ //chuyen sang quang cao tiep

            if (currentIndex >= playlist.size) { //sau khi chay het 1 vong lap
                if (pendingPlaylist.isNotEmpty()) { //neu co playlist moi
                    playlist = pendingPlaylist
                    pendingPlaylist = emptyList()
                }
                currentIndex = 0 //quay ve dau vong lap
            }
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
    //quan ly exoplayer
//    DisposableEffect(Unit) {
//        onDispose {
//            exoPlayer.release()
//        }
//    }
//
//    AndroidView(
//        factory = { ctx -> PlayerView(ctx).apply {
//            player = exoPlayer
//            useController = false
//            }
//        },
//        modifier = Modifier.fillMaxSize()
//    )
}

@Composable
fun AdsPlayer (adUrl: String, adType: String, duration: Int, onAdsCompleted: () -> Unit) {
    val context = LocalContext.current

    //khoi tao exoplayer
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = true
        }
    }
    //cap nhat mediaItem va xu ly su kien hoan thanh video hoac anh
    DisposableEffect(adUrl) {
        val mediaItem = MediaItem.fromUri(adUrl)
        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()

        var isFinished = false

        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state : Int) {
                //neu la video, chuyen ngay sau khi phat xong
                if (adType == "video" && state == Player.STATE_ENDED && !isFinished) {
                    isFinished = true
                    onAdsCompleted()
                }
            }
        }
        exoPlayer.addListener(listener)

        //neu la hinh anh, chuyen sau khoang thoi gian duration
        val handler = android.os.Handler(context.mainLooper)
        val imageRunnable = Runnable {
            if (adType == "image" && !isFinished) {
                isFinished = true
                onAdsCompleted()
            }
        }
        if (adType == "image") {
            handler.postDelayed(imageRunnable, duration * 1000L)
        }

        onDispose {
            exoPlayer.removeListener(listener)
            handler.removeCallbacks(imageRunnable)
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
