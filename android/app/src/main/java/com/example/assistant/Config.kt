package com.example.assistant
import android.content.Context
object Config {
    private fun p(c: Context) = c.getSharedPreferences("cfg", Context.MODE_PRIVATE)
    fun url(c: Context) = p(c).getString("url", BuildConfig.DEFAULT_URL) ?: BuildConfig.DEFAULT_URL
    fun token(c: Context) = p(c).getString("token", BuildConfig.DEFAULT_TOKEN) ?: BuildConfig.DEFAULT_TOKEN
    fun save(c: Context, url: String, token: String) = p(c).edit().putString("url", url.trim().trimEnd('/')).putString("token", token.trim()).apply()
}
