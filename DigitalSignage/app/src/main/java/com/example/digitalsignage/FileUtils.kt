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