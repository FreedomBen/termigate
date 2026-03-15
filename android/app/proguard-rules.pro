# ============================================================================
# termigate ProGuard rules
# ============================================================================

# --- kotlinx.serialization ---
# Keep @Serializable classes and their generated serializers
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep project @Serializable data classes and their serializers
-keep,includedescriptorclasses class org.tamx.termigate.data.model.**$$serializer { *; }
-keepclassmembers class org.tamx.termigate.data.model.** {
    *** Companion;
}
-keepclasseswithmembers class org.tamx.termigate.data.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# --- Ktor ---
-keep class io.ktor.** { *; }
-keepclassmembers class io.ktor.** { volatile <fields>; }
-dontwarn io.ktor.**

# --- OkHttp ---
# OkHttp ships its own rules; these cover edge cases
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# --- Termux terminal-lib ---
# TerminalView and TerminalEmulator use reflection for text measurement
-keep class com.termux.terminal.** { *; }
-keep class com.termux.view.** { *; }

# --- Coroutines ---
-dontwarn kotlinx.coroutines.debug.**

# --- General ---
# Keep Hilt-generated components
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }
