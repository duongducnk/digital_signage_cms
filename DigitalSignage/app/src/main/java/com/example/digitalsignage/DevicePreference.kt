package com.example.digitalsignage

import android.content.Context

object DevicePreference {
    private const val PREF_NAME = "tv_prefs"
    private const val KEY_DEVICE_ID = "device_id"

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
}