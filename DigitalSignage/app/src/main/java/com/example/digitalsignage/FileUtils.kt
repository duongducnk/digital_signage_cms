package com.example.digitalsignage

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

// Lưu playlist hiện tại ra bộ nhớ trong làm cache dự phòng
fun savePlaylistCache(context: Context, playlist: List<AdItem>) {
    try {
        val file = File(context.filesDir, "playlist_cache.json")
        val jsonArray = JSONArray()
        for (item in playlist) {
            val obj = JSONObject().apply {
                put("type", item.type)
                put("url", item.url)
                put("duration", item.duration)
            }
            jsonArray.put(obj)
        }
        file.writeText(jsonArray.toString())
    } catch (e: Exception) {
        e.printStackTrace()
    }
}

// Đọc lại playlist cache khi mất kết nối từ đầu
fun loadPlaylistCache(context: Context): List<AdItem> {
    val list = mutableListOf<AdItem>()
    try {
        val file = File(context.filesDir, "playlist_cache.json")
        if (file.exists()) {
            val jsonString = file.readText()
            val jsonArray = JSONArray(jsonString)
            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                list.add(
                    AdItem(
                        type = obj.getString("type"),
                        url = obj.getString("url"),
                        duration = obj.getInt("duration")
                    )
                )
            }
        }
    } catch (e: Exception) {
        e.printStackTrace()
    }
    return list
}

// Lưu cấu hình lịch hẹn giờ vào cache
fun saveScheduleCache(context: Context, scheduled: ScheduledPlaylist?) {
    try {
        val file = File(context.filesDir, "schedule_cache.json")
        if (scheduled == null) {
            if (file.exists()) file.delete()
            return
        }
        val obj = JSONObject().apply {
            put("enabled", scheduled.enabled)
            put("startTime", scheduled.startTime)
            put("endTime", scheduled.endTime)
            val jsonArray = JSONArray()
            for (item in scheduled.items) {
                jsonArray.put(JSONObject().apply {
                    put("type", item.type)
                    put("url", item.url)
                    put("duration", item.duration)
                })
            }
            put("items", jsonArray)
        }
        file.writeText(obj.toString())
    } catch (e: Exception) {
        e.printStackTrace()
    }
}

// Đọc cache lịch hẹn giờ khi mất mạng
fun loadScheduleCache(context: Context): ScheduledPlaylist? {
    try {
        val file = File(context.filesDir, "schedule_cache.json")
        if (file.exists()) {
            val jsonString = file.readText()
            val obj = JSONObject(jsonString)
            val enabled = obj.getBoolean("enabled")
            val startTime = obj.getString("startTime")
            val endTime = obj.getString("endTime")
            val jsonArray = obj.getJSONArray("items")
            val items = mutableListOf<AdItem>()
            for (i in 0 until jsonArray.length()) {
                val itemObj = jsonArray.getJSONObject(i)
                items.add(AdItem(
                    type = itemObj.getString("type"),
                    url = itemObj.getString("url"),
                    duration = itemObj.getInt("duration")
                ))
            }
            return ScheduledPlaylist(enabled, startTime, endTime, items)
        }
    } catch (e: Exception) {
        e.printStackTrace()
    }
    return null
}

suspend fun getOrDownloadLocalFile(context: Context, fileUrl: String): String {
    return withContext(Dispatchers.IO) {
        try {
            // Lấy tên file từ URL
            val fileName = fileUrl.substringAfterLast("/")
            val localFile = File(context.filesDir, fileName)

            // Nếu file đã tồn tại và có dung lượng > 0 thì dùng luôn file nội bộ
            if (localFile.exists() && localFile.length() > 0) {
                return@withContext localFile.absolutePath
            }

            // Nếu chưa có, tiến hành tải xuống từ Server qua HTTP
            val url = URL(fileUrl)
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.connect()

            val inputStream = connection.getInputStream()
            val outputStream = FileOutputStream(localFile)
            inputStream.copyTo(outputStream)

            outputStream.close()
            inputStream.close()

            // Trả về đường dẫn tuyệt đối dạng file:// hoặc đường dẫn file
            return@withContext localFile.absolutePath
        } catch (e: Exception) {
            e.printStackTrace()
            // Nếu tải thất bại (mất mạng đột ngột), fallback về URL gốc của server
            return@withContext fileUrl
        }
    }
}

// Dọn dẹp các tệp tin cũ không còn nằm trong playlist hiện tại
fun cleanUnusedFiles(context: Context, activePlaylist: List<AdItem>) {
    try {
        val fileDir = context.filesDir
        if (!fileDir.exists()) return

        // 1. Lấy danh sách tên các tệp đang có trong playlist hiện tại
        val activeFileNames = activePlaylist.map { item ->
            item.url.substringAfterLast("/")
        }.toSet()

        // 2. Duyệt qua toàn bộ tệp trong thư mục lưu trữ nội bộ của app
        fileDir.listFiles()?.forEach { file ->
            val fileName = file.name

            // 3. Nếu tệp không phải là file cache playlist VÀ không nằm trong danh sách đang dùng -> Xóa
            if (fileName != "playlist_cache.json" && !activeFileNames.contains(fileName)) {
                val deleted = file.delete()
                if (deleted) {
                    android.util.Log.d("FileCleanUp", "Đã dọn dẹp tệp không dùng: $fileName")
                }
            }
        }
    } catch (e: Exception) {
        e.printStackTrace()
    }
}

