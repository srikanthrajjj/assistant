package com.example.assistant
import android.content.Context

object Config {
    private fun p(c: Context) = c.getSharedPreferences("cfg", Context.MODE_PRIVATE)
    fun url(c: Context): String = BuildConfig.DEFAULT_URL
    // A token baked in at build time always wins; otherwise use the one the user entered in the app's Settings.
    fun token(c: Context): String = if (BuildConfig.DEFAULT_TOKEN.isNotEmpty()) BuildConfig.DEFAULT_TOKEN else p(c).getString("token", "") ?: ""
    fun saveToken(c: Context, t: String) { p(c).edit().putString("token", t.trim()).apply() }
}
