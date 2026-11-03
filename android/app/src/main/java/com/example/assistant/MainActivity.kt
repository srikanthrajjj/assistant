package com.example.assistant

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.speech.RecognizerIntent
import org.json.JSONObject
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private lateinit var web: WebView

    /** Lets the web UI hand the access token to the native background service. */
    inner class Bridge {
        @JavascriptInterface fun setToken(t: String) { Config.saveToken(this@MainActivity, t) }
        /** Opens Android's built-in speech recogniser; the result comes back through window.onVoice(text). */
        @JavascriptInterface fun startVoice() {
            runOnUiThread {
                try {
                    startActivityForResult(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                        .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM), 42)
                } catch (e: Exception) { web.evaluateJavascript("window.onVoice&&window.onVoice('',true)", null) }
            }
        }
    }

    private fun startUrl(): String =
        Config.url(this) + "#app=1&v=" + Uri.encode("${BuildConfig.APP_VERSION} (build ${BuildConfig.BUILD})") +
            "&t=" + Uri.encode(Config.token(this))

    private fun showOffline() {
        val html = assets.open("offline.html").bufferedReader().use { it.readText() }.replace("__URL__", startUrl())
        web.loadDataWithBaseURL("about:blank", html, "text/html", "utf-8", null)
    }

    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        if (android.os.Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)

        web = WebView(this)
        web.setBackgroundColor(getColor(R.color.surface))
        web.overScrollMode = View.OVER_SCROLL_NEVER
        with(web.settings) {
            javaScriptEnabled = true; domStorageEnabled = true
            setSupportZoom(false); builtInZoomControls = false; displayZoomControls = false
            textZoom = 100; allowFileAccess = false; allowContentAccess = false
        }
        web.addJavascriptInterface(Bridge(), "AndroidBridge")
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            // Anything that is not our own app page (Google sign-in, external links) opens in the real browser.
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                val u = r.url.toString()
                if (u.startsWith(Config.url(this@MainActivity)) && !u.contains("/auth/")) return false
                startActivity(Intent(Intent.ACTION_VIEW, r.url)); return true
            }
            override fun onReceivedError(v: WebView, r: WebResourceRequest, e: WebResourceError) { if (r.isForMainFrame) showOffline() }
            override fun onReceivedHttpError(v: WebView, r: WebResourceRequest, e: WebResourceResponse) { if (r.isForMainFrame && e.statusCode >= 500) showOffline() }
        }
        setContentView(web)
        web.loadUrl(startUrl())

        try { startForegroundService(Intent(this, PollService::class.java)) } catch (_: Exception) {}
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "poll", ExistingPeriodicWorkPolicy.KEEP, PeriodicWorkRequestBuilder<PollWorker>(15, TimeUnit.MINUTES).build())
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(req: Int, res: Int, data: Intent?) {
        super.onActivityResult(req, res, data)
        if (req == 42 && res == RESULT_OK) {
            val text = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull() ?: return
            web.evaluateJavascript("window.onVoice&&window.onVoice(" + JSONObject.quote(text) + ")", null)
        }
    }

    override fun onDestroy() { web.destroy(); super.onDestroy() }
}
