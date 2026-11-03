package com.example.assistant
import android.content.Context
object Config {
    private fun p(c: Context) = c.getSharedPreferences("cfg", Context.MODE_PRIVATE)
    fun url(c: Context) = p(c).getString("url", BuildConfig.DEFAULT_URL) ?: BuildConfig.DEFAULT_URL
    // a token baked in at build time always wins, so an old saved one can never cause "unauthorized"
    fun token(c: Context) = if (BuildConfig.DEFAULT_TOKEN.isNotEmpty()) BuildConfig.DEFAULT_TOKEN else p(c).getString("token", "") ?: ""
    fun save(c: Context, url: String, token: String) = p(c).edit().putString("url", url.trim().trimEnd('/')).putString("token", token.trim()).apply()
}
