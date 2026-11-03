package com.example.assistant
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL

// Keeps one long-poll connection to the server so reminders show up within seconds (and keeps the free server awake).
class PollService : Service() {
    @Volatile private var running = false
    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(i: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("svc", "Assistant background", NotificationManager.IMPORTANCE_MIN))
        nm.createNotificationChannel(NotificationChannel("a", "Assistant", NotificationManager.IMPORTANCE_HIGH))
        val ongoing: Notification = NotificationCompat.Builder(this, "svc").setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Assistant is listening for reminders").setOngoing(true).build()
        if (android.os.Build.VERSION.SDK_INT >= 29) startForeground(1, ongoing, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else startForeground(1, ongoing)
        if (!running) { running = true; Thread { loop(nm) }.start() }
        return START_STICKY
    }

    private fun loop(nm: NotificationManager) {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        while (running) {
            if (Config.token(this).isEmpty()) { try { Thread.sleep(15000) } catch (_: InterruptedException) {}; continue }
            try {
                val c = URL(Config.url(this) + "/api/notifications?wait=25").openConnection() as HttpURLConnection
                c.connectTimeout = 15000; c.readTimeout = 45000
                c.setRequestProperty("Authorization", "Bearer " + Config.token(this))
                if (c.responseCode == 200) {
                    val arr = JSONArray(c.inputStream.bufferedReader().readText())
                    for (k in 0 until arr.length()) {
                        val o = arr.getJSONObject(k)
                        nm.notify(o.getString("id").hashCode(), NotificationCompat.Builder(this, "a")
                            .setSmallIcon(R.drawable.ic_stat).setContentTitle(o.getString("title"))
                            .setContentText(o.getString("body")).setStyle(NotificationCompat.BigTextStyle().bigText(o.getString("body")))
                            .setContentIntent(open).setAutoCancel(true).build())
                    }
                } else Thread.sleep(10000)
            } catch (e: Exception) { try { Thread.sleep(10000) } catch (_: InterruptedException) {} }
        }
    }
    override fun onDestroy() { running = false; super.onDestroy() }
}
