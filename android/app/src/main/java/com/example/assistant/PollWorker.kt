package com.example.assistant
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.work.*
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

class PollWorker(ctx: Context, p: WorkerParameters) : Worker(ctx, p) {
    override fun doWork(): Result = try {
        val c = URL(Config.url(applicationContext) + "/api/notifications").openConnection() as HttpURLConnection
        c.setRequestProperty("Authorization", "Bearer " + Config.token(applicationContext))
        val arr = JSONArray(c.inputStream.bufferedReader().readText())
        val nm = applicationContext.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("a", "Assistant", NotificationManager.IMPORTANCE_DEFAULT))
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            nm.notify(o.getString("id").hashCode(), NotificationCompat.Builder(applicationContext, "a")
                .setSmallIcon(R.drawable.ic_stat).setContentTitle(o.getString("title"))
                .setContentText(o.getString("body")).setStyle(NotificationCompat.BigTextStyle().bigText(o.getString("body"))).build())
        }
        Result.success()
    } catch (e: Exception) { Result.retry() }
}
