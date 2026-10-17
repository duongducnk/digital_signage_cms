package com.example.digitalsignage

import android.content.Context

object DevicePreference {
    private const val PREF_NAME = "tv_prefs"
    private const val KEY_DEVICE_ID = "device_id"
    private const val KEY_SERVER_URL = "server_url"

    fun getDeviceId(context: Context): String {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        //neu chua cai, lay android tv lam mac dinh
        val defaultId = android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ) ?: "default_tv"

        return prefs.getString(KEY_DEVICE_ID, defaultId) ?: defaultId
    }

    fun saveDeviceId(context: Context, deviceId: String) {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_DEVICE_ID, deviceId.trim()).apply()
    }

    //ham lay va luu server url dong
    fun getServerUrl(context: Context): String {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        //tra ve chuoi rong neu chua co url duoc luu de kich hoat mDNS tu quet
        return prefs.getString(KEY_SERVER_URL, "http://192.168.20.227:3000") ?: "http://192.168.20.227:3000"
    }
    fun saveServerUrl(context: Context, url: String) {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_SERVER_URL, url.trim()).apply()
    }
}