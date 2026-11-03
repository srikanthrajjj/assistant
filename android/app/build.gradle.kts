plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.example.assistant"; compileSdk = 34
    defaultConfig { applicationId = "com.example.assistant"; minSdk = 26; targetSdk = 34; versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt(); versionName = "1.0.0"
        buildConfigField("String", "APP_VERSION", "\"1.0.0\"")
        buildConfigField("String", "BUILD", "\"" + (System.getenv("GITHUB_RUN_NUMBER") ?: "1") + "\"")
        buildConfigField("String", "DEFAULT_URL", "\"" + (System.getenv("DEFAULT_URL") ?: "https://assistant-mvp.onrender.com") + "\"")
        buildConfigField("String", "DEFAULT_TOKEN", "\"" + (System.getenv("APP_TOKEN") ?: "") + "\"")
    }
    signingConfigs {
        create("fixed") { storeFile = file("assistant.keystore"); storePassword = "assistant-mvp"; keyAlias = "assistant"; keyPassword = "assistant-mvp" }
    }
    buildTypes {
        getByName("debug") { signingConfig = signingConfigs.getByName("fixed") }
        getByName("release") { signingConfig = signingConfigs.getByName("fixed"); isMinifyEnabled = false; isShrinkResources = false }
    }
    lint { checkReleaseBuilds = false; abortOnError = false }
    buildFeatures { buildConfig = true }
    kotlinOptions { jvmTarget = "17" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
dependencies { implementation("androidx.work:work-runtime-ktx:2.9.1"); implementation("androidx.core:core-ktx:1.13.1") }
