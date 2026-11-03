package com.example.assistant
import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.net.Uri
import android.os.Bundle
import android.view.Menu
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.LinearLayout
import androidx.work.*
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private lateinit var web: WebView
    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        web = WebView(this).also { it.settings.javaScriptEnabled = true; it.settings.domStorageEnabled = true; it.webViewClient = WebViewClient(); it.webChromeClient = android.webkit.WebChromeClient() }
        setContentView(web)
        if (Config.url(this).isEmpty() || Config.token(this).isEmpty()) askServer() else start()
    }
    private fun start() {
        web.loadUrl(Config.url(this) + "#t=" + Uri.encode(Config.token(this)))
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "poll", ExistingPeriodicWorkPolicy.REPLACE, PeriodicWorkRequestBuilder<PollWorker>(15, TimeUnit.MINUTES).build())
    }
    private fun askServer() {
        val u = EditText(this).apply { hint = "Server URL e.g. https://my-app.onrender.com"; setText(Config.url(context)) }
        val t = EditText(this).apply { hint = "App token"; setText(Config.token(context)) }
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(48, 24, 48, 0); addView(u); addView(t) }
        AlertDialog.Builder(this).setTitle("Connect to your server").setView(box).setCancelable(false)
            .setPositiveButton("Connect") { _, _ -> Config.save(this, u.text.toString(), t.text.toString()); start() }.show()
    }
    override fun onCreateOptionsMenu(m: Menu): Boolean { m.add("Server settings"); return true }
    override fun onOptionsItemSelected(i: android.view.MenuItem): Boolean { askServer(); return true }
    @Deprecated("") override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }
}
