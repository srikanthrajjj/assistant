plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.example.assistant"; compileSdk = 34
    defaultConfig { applicationId = "com.example.assistant"; minSdk = 26; targetSdk = 34; versionCode = 1; versionName = "0.1"
        buildConfigField("String", "DEFAULT_URL", "\"" + (System.getenv("DEFAULT_URL") ?: "https://assistant-mvp.onrender.com") + "\"")
        buildConfigField("String", "DEFAULT_TOKEN", "\"" + (System.getenv("APP_TOKEN") ?: "") + "\"")
    }
    buildFeatures { buildConfig = true }
    kotlinOptions { jvmTarget = "17" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
dependencies { implementation("androidx.work:work-runtime-ktx:2.9.1"); implementation("androidx.core:core-ktx:1.13.1") }
