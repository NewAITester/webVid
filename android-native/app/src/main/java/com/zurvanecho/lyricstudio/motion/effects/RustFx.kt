package com.zurvanecho.lyricstudio.motion.effects

import android.graphics.Bitmap
import android.graphics.Color
import com.zurvanecho.lyricstudio.motion.model.EffectRef

/**
 * پل Rust/JNI برای افکت‌های پیکسلی — همان ریاضیات هستهٔ Rust وب
 * (`android-native/rust/lyricstudio-jni`، ۲۲ افکت + color_adjust).
 *
 * اگر کتابخانهٔ بومی (liblyricstudio-jni.so) نباشد یا افکت پشتیبانی نشود،
 * به‌آرامی به پیاده‌سازی کاتلین (FxImpls) برمی‌گردد — هیچ‌وقت کرش نمی‌کند.
 */
object RustFx {
    /** ۲۲ افکتی که Rust دارد (همان RUST_FX وب). */
    val SUPPORTED: Set<String> = setOf(
        "duotone", "posterize", "threshold", "vibrance", "lumaKey", "matte",
        "solarize", "invertFx", "temperature", "exposure", "levels", "sepiaFx",
        "comic", "infrared", "thermal", "tritone", "crossProcess", "silhouette",
        "xray", "colorPop", "flicker", "invertPulse",
    )

    private var loaded = false

    init {
        try {
            System.loadLibrary("lyricstudio-jni")
            loaded = true
        } catch (_: UnsatisfiedLinkError) {
            loaded = false
        } catch (_: Exception) {
            loaded = false
        }
    }

    fun isAvailable(): Boolean = loaded

    private external fun applyEffect(
        pixels: IntArray,
        width: Int,
        height: Int,
        effectId: String,
        params: DoubleArray,
        colors: IntArray,
        time: Double,
    ): Boolean

    /**
     * اعمال یک افکت روی بیت‌مپ (درجا). اگر Rust در دسترس نباشد یا افکت
     * پشتیبانی نشود، false برمی‌گرداند و فراخواننده باید از FxImpls استفاده کند.
     */
    fun applyToBitmap(bmp: Bitmap, fx: EffectRef, t: Double): Boolean {
        if (!loaded || fx.id !in SUPPORTED) return false
        val def = Effects.byId(fx.id) ?: return false
        // پارامترهای عددی و رنگی، به‌ترتیب رجیستری (همان قرارداد Rust)
        val nums = mutableListOf<Double>()
        val cols = mutableListOf<Int>()
        for ((key, pd) in def.params) {
            if (pd.type == "n") {
                nums.add(fx.params[key] ?: pd.defNum)
            } else {
                val hex = fx.textParams[key] ?: pd.defStr
                cols.add(parseHex(hex))
            }
        }
        // کی‌فریم پارامترهای عددی
        for ((key, list) in fx.keyframes) {
            if (list.isEmpty()) continue
            val idx = def.params.entries.indexOfFirst { it.key == key && it.value.type == "n" }
            if (idx >= 0) {
                val cur = nums.getOrNull(idx) ?: continue
                val ordered = def.params.filter { it.value.type == "n" }.keys.toList()
                val pos = ordered.indexOf(key)
                if (pos >= 0) nums[pos] = com.zurvanecho.lyricstudio.motion.core.valueAt(list, t, cur)
            }
        }
        val w = bmp.width
        val h = bmp.height
        val px = IntArray(w * h)
        bmp.getPixels(px, 0, w, 0, 0, w, h)
        val ok = try {
            applyEffect(px, w, h, fx.id, nums.toDoubleArray(), cols.toIntArray(), t)
        } catch (_: Exception) {
            false
        }
        if (!ok) return false
        bmp.setPixels(px, 0, w, 0, 0, w, h)
        return true
    }

    /** تجزیهٔ رنگ #rgb/#rrggbb/#rrggbbaa به ARGB int (بدون وابستگی به Color.parseColor). */
    private fun parseHex(hex: String): Int {
        return try {
            var h = hex.trim().trimStart('#')
            if (h.length == 3) h = h.map { "$it$it" }.joinToString("")
            val n = h.take(6).toLongOrNull(16) ?: 0L
            val a = if (h.length == 8) (h.substring(6, 8).toLongOrNull(16) ?: 255L) else 255L
            val r = (n shr 16) and 0xFF
            val g = (n shr 8) and 0xFF
            val b = n and 0xFF
            ((a shl 24) or (r shl 16) or (g shl 8) or b).toInt()
        } catch (_: Exception) {
            Color.BLACK
        }
    }
}
