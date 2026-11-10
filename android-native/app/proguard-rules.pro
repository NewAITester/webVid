# ProGuard / R8 rules for LyricStudio (native Android, N7)
# Keeps everything the release build needs: serialization, JNI, and the model.

# --- kotlinx-serialization: keep @Serializable classes and their serializers ---
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keep class kotlinx.serialization.** { *; }
-keepclassmembers @kotlinx.serialization.Serializable class ** {
    *** Companion;
    *** serializer(...);
}
-keepclassmembers class **$$serializer { *; }
# Model classes are (de)serialized to JSON by field name — keep their fields.
-keepclassmembers class com.zurvanecho.lyricstudio.motion.model.** { *; }

# --- JNI: the Rust core is called through this native method ---
-keepclassmembers class com.zurvanecho.lyricstudio.motion.effects.RustFx {
    native <methods>;
}

# --- Compose: keep the entry points the runtime reflects on ---
-keep class androidx.compose.ui.tooling.preview.** { *; }
-dontwarn androidx.compose.ui.tooling.preview.**

# --- AndroidX / Kotlin: standard keeps ---
-keep class androidx.core.content.FileProvider { *; }
-keep class com.zurvanecho.lyricstudio.motion.MainActivity { *; }
