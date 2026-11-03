# Android shell (untested: no Android SDK in the build sandbox)
Open this folder in Android Studio -> it will generate the Gradle wrapper. Set `SERVER_URL` and `TOKEN` in `Config.kt`
(use http://10.0.2.2:3000 for the emulator, or your deployed https URL on a real phone).
It shows the web chat in a WebView and polls /api/notifications every 15 min (WorkManager) to post system notifications.
