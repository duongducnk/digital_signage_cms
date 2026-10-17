package com.example.digitalsignage

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class AdsForegroundService : Service() {
    private val screenStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == Intent.ACTION_SCREEN_ON ||
                intent.action == Intent.ACTION_USER_PRESENT ||
                intent.action == Intent.ACTION_BOOT_COMPLETED
            ) {
                //khi tv bat lai tu standing by, kich hoat mainactivity ngay lap tuc
                val launchIntent = Intent(context, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                }
                try {
                    context.startActivity(launchIntent)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()

        // Khởi động Foreground Service và truyền đúng loại type theo chuẩn Android mới
        val notification = createNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Từ Android 10 (API 29) trở lên
            val serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC

            startForeground(1, notification, serviceType)
        } else {
            // Dành cho Android cũ (như Android 7, 9 trên Asanzo 55U81)
            startForeground(1, notification)
        }

        // Đăng ký nhận sự kiện màn hình bật/tắt
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_USER_PRESENT)
            addAction(Intent.ACTION_BOOT_COMPLETED)
        }
        registerReceiver(screenStateReceiver, filter)
    }

    private fun createNotification(): Notification {
        val channelId = "ads_service_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Digital Signage Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Chạy ngầm để giữ kết nối quảng cáo TV"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("Digital Signage đang chạy")
            .setContentText("Hệ thống quảng cáo TV hoạt động ổn định")
            .setSmallIcon(android.R.drawable.ic_menu_slideshow)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY // Tự động khởi động lại service nếu bị hệ thống kill
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(screenStateReceiver)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        //tu khoi dong lai service neu bi he thong kill
        val restartIntent = Intent(applicationContext, AdsForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(restartIntent)
        } else {
            startService(restartIntent)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}