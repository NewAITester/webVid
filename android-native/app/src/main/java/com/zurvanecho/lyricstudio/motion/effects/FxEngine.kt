package com.zurvanecho.lyricstudio.motion.effects

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.zurvanecho.lyricstudio.motion.model.EffectRef
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * موتور افکت‌های پیکسلی — پورت applyCanvasFxList از src/render/canvasfx.js (نسخهٔ وب).
 *
 * قرارداد وب: هر افکت یک تابع است که بوم مقصد (d) را از روی بوم مبدأ (cur) می‌سازد.
 * اینجا مبدأ یک Bitmap (src) و مقصد یک Bitmap قابل‌تغییر (dst) است که با کپی src شروع می‌شود.
 * افکت‌ها به‌ترتیب روی dst اعمال می‌شوند؛ افکت خراب نادیده گرفته می‌شود (لایه بدون آن می‌ماند).
 *
 * ابزارها (همان X وب): pixelOp، warp، boxBlur، tinted، rgbSplit، noise، parseColor، clamp.
 * برای ترکیب‌بندی (سایه، درخشش و...) مستقیم از android.graphics.Canvas + Paint
 * با PorterDuff استفاده کن — نزدیک‌ترین معادل Canvas 2D وب.
 */

typealias FxImpl = (ctx: FxCtx, p: Map<String, Double>, tp: Map<String, String>) -> Unit

class FxCtx(
    val w: Int,
    val h: Int,
    val time: Double,
    /** مبدأ (cur) — فقط خواندنی. */
    val src: Bitmap,
    /** مقصد — با کپی src شروع می‌شود؛ افکت روی آن می‌نویسد. */
    val dst: Bitmap,
) {
    val canvas: Canvas = Canvas(dst)

    /** عملیات تک‌پیکسلی با دسترسی مستقیم به کانال‌ها (r,g,b,a جدا)؛ خروجی ARGB int است. */
    fun pixelOpChannels(fn: (r: Int, g: Int, b: Int, a: Int) -> Int) {
        val n = w * h
        val px = IntArray(n)
        dst.getPixels(px, 0, w, 0, 0, w, h)
        for (i in 0 until n) {
            val c = px[i]
            val a = (c ushr 24) and 0xFF
            if (a == 0) continue
            val r = (c ushr 16) and 0xFF
            val g = (c ushr 8) and 0xFF
            val b = c and 0xFF
            px[i] = fn(r, g, b, a)
        }
        dst.setPixels(px, 0, w, 0, 0, w, h)
    }

    /** اعوجاج مختصات: fn(dx, dy) نسبت به مرکز → (sx, sy) نسبت به مرکز؛ نمونه‌برداری نزدیک‌ترین همسایه از src. */
    fun warp(fn: (dx: Double, dy: Double) -> Pair<Double, Double>) {
        val srcPx = IntArray(w * h)
        src.getPixels(srcPx, 0, w, 0, 0, w, h)
        val out = IntArray(w * h)
        val hw = w / 2.0
        val hh = h / 2.0
        for (y in 0 until h) {
            for (x in 0 until w) {
                val dx = x - hw
                val dy = y - hh
                val (sx, sy) = fn(dx, dy)
                val cx = (hw + sx).roundToInt().coerceIn(0, w - 1)
                val cy = (hh + sy).roundToInt().coerceIn(0, h - 1)
                out[y * w + x] = srcPx[cy * w + cx]
            }
        }
        dst.setPixels(out, 0, w, 0, 0, w, h)
    }

    /** محو جعبه‌ای ۳ مرحله‌ای روی dst (شعاع بر حسب پیکسل). */
    fun boxBlur(radius: Int) {
        val r = radius.coerceAtLeast(1)
        val px = IntArray(w * h)
        dst.getPixels(px, 0, w, 0, 0, w, h)
        val tmp = IntArray(w * h)
        // گذر افقی
        for (y in 0 until h) {
            var sr = 0; var sg = 0; var sb = 0; var sa = 0
            for (x in -r..r) {
                val c = px[y * w + x.coerceIn(0, w - 1)]
                sr += (c ushr 16) and 0xFF; sg += (c ushr 8) and 0xFF; sb += c and 0xFF; sa += (c ushr 24) and 0xFF
            }
            val n = 2 * r + 1
            for (x in 0 until w) {
                tmp[y * w + x] = ((sa / n) shl 24) or ((sr / n) shl 16) or ((sg / n) shl 8) or (sb / n)
                val xOut = (x - r).coerceIn(0, w - 1)
                val xIn = (x + r + 1).coerceIn(0, w - 1)
                val cOut = px[y * w + xOut]; val cIn = px[y * w + xIn]
                sr += ((cIn ushr 16) and 0xFF) - ((cOut ushr 16) and 0xFF)
                sg += ((cIn ushr 8) and 0xFF) - ((cOut ushr 8) and 0xFF)
                sb += (cIn and 0xFF) - (cOut and 0xFF)
                sa += ((cIn ushr 24) and 0xFF) - ((cOut ushr 24) and 0xFF)
            }
        }
        // گذر عمودی
        for (x in 0 until w) {
            var sr = 0; var sg = 0; var sb = 0; var sa = 0
            for (y in -r..r) {
                val c = tmp[y.coerceIn(0, h - 1) * w + x]
                sr += (c ushr 16) and 0xFF; sg += (c ushr 8) and 0xFF; sb += c and 0xFF; sa += (c ushr 24) and 0xFF
            }
            val n = 2 * r + 1
            for (y in 0 until h) {
                px[y * w + x] = ((sa / n) shl 24) or ((sr / n) shl 16) or ((sg / n) shl 8) or (sb / n)
                val yOut = (y - r).coerceIn(0, h - 1)
                val yIn = (y + r + 1).coerceIn(0, h - 1)
                val cOut = tmp[yOut * w + x]; val cIn = tmp[yIn * w + x]
                sr += ((cIn ushr 16) and 0xFF) - ((cOut ushr 16) and 0xFF)
                sg += ((cIn ushr 8) and 0xFF) - ((cOut ushr 8) and 0xFF)
                sb += (cIn and 0xFF) - (cOut and 0xFF)
                sa += ((cIn ushr 24) and 0xFF) - ((cOut ushr 24) and 0xFF)
            }
        }
        dst.setPixels(px, 0, w, 0, 0, w, h)
    }

    /** نسخهٔ رنگی‌شدهٔ src با رنگ داده‌شده (SRC_IN) — بیت‌مپ تازه برمی‌گرداند. */
    fun tinted(color: Int): Bitmap {
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        c.drawBitmap(src, 0f, 0f, null)
        val p = Paint().apply {
            xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
            this.color = color
        }
        c.drawRect(0f, 0f, w.toFloat(), h.toFloat(), p)
        return out
    }

    /** جداسازی کانال RGB با جابه‌جایی (ADD) — همان rgbSplit وب. */
    fun rgbSplit(amount: Double, angleRad: Double) {
        val dx = cos(angleRad) * amount
        val dy = sin(angleRad) * amount
        val add = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD) }
        val mul = Paint()
        val dstCanvas = Canvas(dst)
        for ((col, k) in listOf(Color.RED to 1.0, Color.GREEN to 0.0, Color.BLUE to -1.0)) {
            val tmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val tc = Canvas(tmp)
            tc.drawBitmap(src, 0f, 0f, null)
            // فقط کانال موردنظر: ضرب در رنگ خالص، بعد DST_IN با src
            val mp = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.MULTIPLY); color = col }
            tc.drawRect(0f, 0f, w.toFloat(), h.toFloat(), mp)
            val dp = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
            tc.drawBitmap(src, 0f, 0f, dp)
            dstCanvas.drawBitmap(tmp, (dx * k).toFloat(), (dy * k).toFloat(), add)
            tmp.recycle()
        }
        mul.reset()
    }

    /** نویز مقداری قطعی (همان noise وب). */
    fun noise(x: Double): Double {
        val i = floor(x).toLong()
        val f = x - i
        val u = f * f * (3 - 2 * f)
        return (hash(i) + (hash(i + 1) - hash(i)) * u) * 2 - 1
    }

    private fun hash(n: Long): Double {
        val x = sin(n * 127.1 + 311.7) * 43758.5453
        return x - floor(x)
    }

    fun clamp(v: Double, a: Double = 0.0, b: Double = 1.0): Double = v.coerceIn(a, b)

    /** تجزیهٔ رنگ #rgb/#rrggbb/#rrggbbaa → ARGB int (همان parseColor وب). */
    fun parseColor(hex: String?): Int {
        if (hex.isNullOrBlank()) return Color.BLACK
        var h = hex.trimStart('#')
        if (h.length == 3) h = h.map { "$it$it" }.joinToString("")
        val n = h.take(6).toLongOrNull(16) ?: 0L
        val a = if (h.length == 8) (h.substring(6, 8).toLongOrNull(16) ?: 255L) else 255L
        val r = (n shr 16) and 0xFF
        val g = (n shr 8) and 0xFF
        val b = n and 0xFF
        return Color.argb(a.toInt(), r.toInt(), g.toInt(), b.toInt())
    }

    /** رسم یک بیت‌مپ روی dst با آلفا و حالت ترکیب. */
    fun drawBitmap(bmp: Bitmap, dx: Float = 0f, dy: Float = 0f, alpha: Int = 255, mode: PorterDuff.Mode? = null) {
        val p = Paint().apply {
            this.alpha = alpha
            if (mode != null) xfermode = PorterDuffXfermode(mode)
        }
        canvas.drawBitmap(bmp, dx, dy, p)
    }

    /** سایهٔ محو برای رسم: Paint با BlurMaskFilter. */
    fun blurPaint(radius: Float, color: Int = Color.BLACK): Paint {
        return Paint().apply {
            this.color = color
            maskFilter = BlurMaskFilter(radius, BlurMaskFilter.Blur.NORMAL)
        }
    }
}

/** موتور: اعمال افکت‌های canvas یک لایه روی بیت‌مپ، به‌ترتیب. */
object FxEngine {
    /**
     * افکت‌های canvas فعال لایه را روی src اعمال می‌کند و بیت‌مپ تازه برمی‌گرداند.
     * اگر افکتی نباشد، همان src برگردانده می‌شود (بدون کپی).
     */
    fun apply(src: Bitmap, effects: List<EffectRef>, t: Double): Bitmap {
        val canvasFx = effects.filter { it.enabled && Effects.byId(it.id)?.kind == "canvas" }
        if (canvasFx.isEmpty()) return src
        var cur = src
        for (fx in canvasFx) {
            val impl = FxImpls.ALL[fx.id] ?: continue
            val def = Effects.byId(fx.id)
            // پارامترهای حل‌شده (عددها + کی‌فریم) — همان effectParamsAt وب
            val p = mutableMapOf<String, Double>()
            def?.params?.forEach { (key, pd) ->
                if (pd.type == "n") p[key] = pd.defNum
            }
            p.putAll(fx.params)
            for ((key, list) in fx.keyframes) {
                if (list.isNotEmpty() && p[key] != null) {
                    p[key] = com.zurvanecho.lyricstudio.motion.core.valueAt(list, t, p[key] ?: 0.0)
                }
            }
            val tp = mutableMapOf<String, String>()
            def?.params?.forEach { (key, pd) ->
                if (pd.type == "c") tp[key] = pd.defStr
            }
            tp.putAll(fx.textParams)
            try {
                val dst = cur.copy(Bitmap.Config.ARGB_8888, true)
                val ctx = FxCtx(cur.width, cur.height, t, cur, dst)
                impl(ctx, p, tp)
                if (cur !== src) cur.recycle()
                cur = dst
            } catch (_: Exception) {
                // افکت خراب، لایه بدون آن می‌ماند (همان رفتار وب)
            }
        }
        return cur
    }

    /** تبدیل ImageBitmap کامپوز به Bitmap اندروید و برعکس. */
    fun toBitmap(img: androidx.compose.ui.graphics.ImageBitmap): Bitmap =
        img.asAndroidBitmap()

    fun toImageBitmap(bmp: Bitmap): androidx.compose.ui.graphics.ImageBitmap =
        bmp.asImageBitmap()
}
