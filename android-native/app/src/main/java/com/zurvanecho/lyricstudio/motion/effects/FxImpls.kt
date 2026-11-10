package com.zurvanecho.lyricstudio.motion.effects

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * پیاده‌سازی افکت‌های canvas — پورت src/render/canvasfx.js نسخهٔ وب.
 * قرارداد وب: بوم مقصد از روی بوم مبدأ ساخته می‌شود؛ box() یعنی کل بیت‌مپ.
 * افکت‌هایی که در وب با drawImage(cur) شروع می‌شوند اینجا چیزی نمی‌خواهند
 * (چون dst از اول کپی src است)؛ افکت‌هایی که خروجی را از صفر می‌سازند اول clear می‌شوند.
 */

object FxImpls {

    // ── ابزارهای مشترک ──

    private data class LBox(val x: Float, val y: Float, val w: Float, val h: Float) {
        val cx: Float get() = x + w / 2f
        val cy: Float get() = y + h / 2f
    }

    private fun box(ctx: FxCtx) = LBox(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat())

    private fun clear(ctx: FxCtx) {
        ctx.canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    }

    private fun cl(v: Double): Int = v.roundToInt().coerceIn(0, 255)
    private fun cli(v: Int): Int = v.coerceIn(0, 255)
    private fun argb(a: Number, r: Number, g: Number, b: Number): Int =
        (cl(a.toDouble()) shl 24) or (cl(r.toDouble()) shl 16) or (cl(g.toDouble()) shl 8) or cl(b.toDouble())

    private fun lum(r: Int, g: Int, b: Int): Double = r * 0.299 + g * 0.587 + b * 0.114

    private fun hashFrac(n: Double): Double {
        val x = sin(n * 12.9898) * 43758.5453
        return x - floor(x)
    }

    private fun hashFrac2(n: Double): Double {
        val x = sin(n * 78.233) * 12543.21
        return x - floor(x)
    }

    /** کپی محوشدهٔ هر بیت‌مپ */
    private fun blurBitmap(bmp: Bitmap, radius: Int): Bitmap {
        val dst = bmp.copy(Bitmap.Config.ARGB_8888, true)
        val tctx = FxCtx(bmp.width, bmp.height, 0.0, bmp, dst)
        tctx.boxBlur(radius)
        return dst
    }

    /** کپی محوشدهٔ src */
    private fun blurredBmp(ctx: FxCtx, radius: Int): Bitmap = blurBitmap(ctx.src, radius)

    /** کپی محوشدهٔ src که با رنگ پر شده (SRC_IN) */
    private fun blurredTinted(ctx: FxCtx, radius: Int, colorHex: String): Bitmap {
        val b = blurredBmp(ctx, radius)
        val c = Canvas(b)
        val p = Paint().apply {
            xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
            color = ctx.parseColor(colorHex)
        }
        c.drawRect(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat(), p)
        return b
    }

    /** تایل نویز قطعی ۲۵۶×۲۵۶ (همان LCG وب) */
    private var noiseTileCache: Bitmap? = null
    private fun noiseTileBmp(): Bitmap {
        noiseTileCache?.let { return it }
        val bmp = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
        val px = IntArray(256 * 256)
        var seed = 1234567L
        for (i in px.indices) {
            seed = (seed * 1103515245L + 12345L) and 0x7fffffffL
            val v = ((seed / 0x7fffffff.toDouble()) * 255).roundToInt()
            px[i] = (255 shl 24) or (v shl 16) or (v shl 8) or v
        }
        bmp.setPixels(px, 0, 256, 0, 0, 256, 256)
        noiseTileCache = bmp
        return bmp
    }

    /** پوشش نویز تکراری با آلفا و حالت ترکیب */
    private fun noiseOverlay(ctx: FxCtx, alpha: Double, mode: PorterDuff.Mode = PorterDuff.Mode.OVERLAY, dx: Float = 0f, dy: Float = 0f) {
        val sh = BitmapShader(noiseTileBmp(), Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
        if (dx != 0f || dy != 0f) {
            val m = Matrix()
            m.setTranslate(dx, dy)
            sh.setLocalMatrix(m)
        }
        val paint = Paint().apply {
            shader = sh
            this.alpha = (alpha.coerceIn(0.0, 1.0) * 255).roundToInt()
            xfermode = PorterDuffXfermode(mode)
        }
        ctx.canvas.drawRect(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat(), paint)
    }

    /** عملیات همسایه‌محور با اسنپ‌شات (خواندن از کپی، نوشتن روی dst) */
    private fun neighborOp(ctx: FxCtx, fn: (at: (Int, Int, Int) -> Int, x: Int, y: Int) -> Int) {
        val w = ctx.w
        val h = ctx.h
        val px = IntArray(w * h)
        ctx.dst.getPixels(px, 0, w, 0, 0, w, h)
        val snap = px.copyOf()
        val at = { x: Int, y: Int, c: Int ->
            val xx = x.coerceIn(0, w - 1)
            val yy = y.coerceIn(0, h - 1)
            val cc = snap[yy * w + xx]
            when (c) {
                0 -> (cc ushr 16) and 0xFF
                1 -> (cc ushr 8) and 0xFF
                2 -> cc and 0xFF
                else -> (cc ushr 24) and 0xFF
            }
        }
        for (y in 0 until h) for (x in 0 until w) {
            val i = y * w + x
            if (((snap[i] ushr 24) and 0xFF) == 0) continue
            px[i] = fn(at, x, y)
        }
        ctx.dst.setPixels(px, 0, w, 0, 0, w, h)
    }

    private fun lumAt(at: (Int, Int, Int) -> Int, x: Int, y: Int): Double =
        at(x, y, 0) * 0.299 + at(x, y, 1) * 0.587 + at(x, y, 2) * 0.114

    /** بزرگی لبهٔ سوبل برای هر پیکسل (۰ تا ۲۵۵) */
    private fun sobel(ctx: FxCtx): IntArray {
        val w = ctx.w
        val h = ctx.h
        val px = IntArray(w * h)
        ctx.dst.getPixels(px, 0, w, 0, 0, w, h)
        val mag = IntArray(w * h)
        val at = { x: Int, y: Int ->
            val xx = x.coerceIn(0, w - 1)
            val yy = y.coerceIn(0, h - 1)
            val cc = px[yy * w + xx]
            ((cc ushr 16) and 0xFF) * 0.299 + ((cc ushr 8) and 0xFF) * 0.587 + (cc and 0xFF) * 0.114
        }
        for (y in 0 until h) for (x in 0 until w) {
            val gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
            val gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
            mag[y * w + x] = min(255.0, hypot(gx, gy) / 4).roundToInt()
        }
        return mag
    }

    /** چرخش رنگ (HSL) — خروجی RGB بسته‌بندی‌شده بدون آلفا */
    private fun hueRotPacked(r: Int, g: Int, b: Int, deg: Double): Int {
        val rf = r / 255.0
        val gf = g / 255.0
        val bf = b / 255.0
        val mx = maxOf(rf, gf, bf)
        val mn = minOf(rf, gf, bf)
        val l = (mx + mn) / 2.0
        if (mx == mn) return (r shl 16) or (g shl 8) or b
        val d = mx - mn
        val s = if (l > 0.5) d / (2 - mx - mn) else d / (mx + mn)
        var hh = (when (mx) {
            rf -> (gf - bf) / d + (if (gf < bf) 6.0 else 0.0)
            gf -> (bf - rf) / d + 2.0
            else -> (rf - gf) / d + 4.0
        }) / 6.0
        hh = (hh + deg / 360.0) % 1.0
        if (hh < 0) hh += 1.0
        val q = if (l < 0.5) l * (1 + s) else l + s - l * s
        val pp = 2 * l - q
        fun hr(p: Double, q: Double, t0: Double): Double {
            var t = t0
            if (t < 0) t += 1.0
            if (t > 1) t -= 1.0
            return when {
                t < 1.0 / 6 -> p + (q - p) * 6 * t
                t < 1.0 / 2 -> q
                t < 2.0 / 3 -> p + (q - p) * (2.0 / 3 - t) * 6
                else -> p
            }
        }
        val rr = (hr(pp, q, hh + 1.0 / 3) * 255).roundToInt().coerceIn(0, 255)
        val gg = (hr(pp, q, hh) * 255).roundToInt().coerceIn(0, 255)
        val bb = (hr(pp, q, hh - 1.0 / 3) * 255).roundToInt().coerceIn(0, 255)
        return (rr shl 16) or (gg shl 8) or bb
    }

    /** چرخش رنگ روی کل لایه */
    private fun hueRotate(ctx: FxCtx, deg: Double) {
        if (deg == 0.0) return
        ctx.pixelOpChannels { r, g, b, a ->
            (a shl 24) or hueRotPacked(r, g, b, deg)
        }
    }

    /** چندبار رسم با تبدیل (همان smear وب)؛ place روی Matrix با post* صدا می‌شود */
    private fun smear(ctx: FxCtx, n: Int, place: (m: Matrix, u: Double) -> Unit) {
        val acc = Bitmap.createBitmap(ctx.w, ctx.h, Bitmap.Config.ARGB_8888)
        val ac = Canvas(acc)
        for (i in 0 until n) {
            val u = i / max(1, n - 1).toDouble()
            val m = Matrix()
            place(m, u)
            val paint = Paint().apply { alpha = (255.0 / (i + 1)).roundToInt().coerceIn(1, 255) }
            ac.drawBitmap(ctx.src, m, paint)
        }
        clear(ctx)
        ctx.canvas.drawBitmap(acc, 0f, 0f, null)
        acc.recycle()
    }

    /** جابه‌جایی سطری (موج افقی) — پایهٔ بیشتر افکت‌های *Wave */
    private fun rowWave(ctx: FxCtx, ampPx: Double, step: Int = 4, freq: Double = 0.05, phase: Double = ctx.time * 3.0) {
        val b = box(ctx)
        val st = max(4, step)
        val srcR = Rect(0, 0, 0, 0)
        val dstR = RectF()
        var y = b.y
        while (y < b.y + b.h) {
            val off = (sin(y * freq + phase) * ampPx).toFloat()
            val y2 = min(b.y + b.h, y + st)
            srcR.set(b.x.roundToInt(), y.roundToInt(), (b.x + b.w).roundToInt(), y2.roundToInt())
            dstR.set(b.x + off, y, b.x + b.w + off, y2)
            ctx.canvas.drawBitmap(ctx.src, srcR, dstR, null)
            y += st
        }
    }

    /** پوشش گرادیان شعاعی روی کل بیت‌مپ */
    private fun radialOverlay(ctx: FxCtx, cx: Float, cy: Float, r0: Float, r1: Float, stops: Array<Pair<Float, Int>>, alpha: Double, mode: PorterDuff.Mode? = null) {
        val r = max(1f, r1)
        val f0 = (r0 / r).coerceIn(0f, 1f)
        val pos = FloatArray(stops.size + 1)
        val col = IntArray(stops.size + 1)
        pos[0] = 0f
        col[0] = stops[0].second
        for (i in stops.indices) {
            pos[i + 1] = f0 + stops[i].first * (1f - f0)
            col[i + 1] = stops[i].second
        }
        val sh = RadialGradient(cx, cy, r, col, pos, Shader.TileMode.CLAMP)
        val paint = Paint().apply {
            shader = sh
            this.alpha = (alpha.coerceIn(0.0, 1.0) * 255).roundToInt()
            if (mode != null) xfermode = PorterDuffXfermode(mode)
        }
        ctx.canvas.drawRect(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat(), paint)
    }

    /** پوشش گرادیان خطی روی کل بیت‌مپ */
    private fun linearOverlay(ctx: FxCtx, x0: Float, y0: Float, x1: Float, y1: Float, stops: Array<Pair<Float, Int>>, alpha: Double, mode: PorterDuff.Mode? = null) {
        val sh = LinearGradient(x0, y0, x1, y1, stops.map { it.second }.toIntArray(), stops.map { it.first }.toFloatArray(), Shader.TileMode.CLAMP)
        val paint = Paint().apply {
            shader = sh
            this.alpha = (alpha.coerceIn(0.0, 1.0) * 255).roundToInt()
            if (mode != null) xfermode = PorterDuffXfermode(mode)
        }
        ctx.canvas.drawRect(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat(), paint)
    }

    /** رنگ با آلفا از rgba(r,g,b,a) وب */
    private fun rgba(r: Int, g: Int, b: Int, a: Double): Int =
        argb((a.coerceIn(0.0, 1.0) * 255).roundToInt(), r, g, b)

    /** رسم src با تبدیل حول مرکز */
    private fun drawAboutCenter(ctx: FxCtx, apply: (c: Canvas) -> Unit) {
        val b = box(ctx)
        ctx.canvas.save()
        ctx.canvas.translate(b.cx, b.cy)
        apply(ctx.canvas)
        ctx.canvas.translate(-b.cx, -b.cy)
        ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        ctx.canvas.restore()
    }

    val ALL: Map<String, FxImpl> = mapOf(
        // ── رنگ (pixelOp) ──
        "temperature" to { ctx, p, _ ->
            val k = (p["amt"] ?: 30.0) / 100 * 40
            ctx.pixelOpChannels { r, g, b, a -> argb(a, r + k, g, b - k) }
        },
        "tint" to { ctx, p, tp ->
            val col = ctx.parseColor(tp["color"] ?: "#E4142A")
            val paint = Paint().apply {
                alpha = (((p["amt"] ?: 60.0) / 100) * 255).roundToInt().coerceIn(0, 255)
                xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP)
                color = col
            }
            ctx.canvas.drawRect(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat(), paint)
        },
        "threshold" to { ctx, p, tp ->
            val c1 = ctx.parseColor(tp["c1"] ?: "#000000")
            val c2 = ctx.parseColor(tp["c2"] ?: "#FFFFFF")
            val lv = (p["level"] ?: 50.0) / 100 * 255
            ctx.pixelOpChannels { r, g, b, a ->
                val c = if (lum(r, g, b) >= lv) c2 else c1
                (a shl 24) or (c and 0x00FFFFFF)
            }
        },
        "posterize" to { ctx, p, _ ->
            val n = max(2.0, (p["levels"] ?: 4.0).roundToInt().toDouble()) - 1
            ctx.pixelOpChannels { r, g, b, a ->
                argb(a, ((r / 255.0 * n).roundToInt() / n * 255), ((g / 255.0 * n).roundToInt() / n * 255), ((b / 255.0 * n).roundToInt() / n * 255))
            }
        },
        "duotone" to { ctx, p, tp ->
            val c1 = ctx.parseColor(tp["c1"] ?: "#1B0B3A")
            val c2 = ctx.parseColor(tp["c2"] ?: "#FF4D6D")
            val k = (p["amt"] ?: 100.0) / 100
            val r1 = (c1 ushr 16) and 0xFF
            val g1 = (c1 ushr 8) and 0xFF
            val b1 = c1 and 0xFF
            val r2 = (c2 ushr 16) and 0xFF
            val g2 = (c2 ushr 8) and 0xFF
            val b2 = c2 and 0xFF
            ctx.pixelOpChannels { r, g, b, a ->
                val l = lum(r, g, b) / 255
                argb(a, r + (r1 + (r2 - r1) * l - r) * k, g + (g1 + (g2 - g1) * l - g) * k, b + (b1 + (b2 - b1) * l - b) * k)
            }
        },
        "gradOver" to { ctx, p, tp ->
            val b = box(ctx)
            val a = (p["ang"] ?: 90.0) * PI / 180
            val r = hypot(b.w.toDouble(), b.h.toDouble()) / 2
            linearOverlay(
                ctx, (b.cx - cos(a) * r).toFloat(), (b.cy - sin(a) * r).toFloat(),
                (b.cx + cos(a) * r).toFloat(), (b.cy + sin(a) * r).toFloat(),
                arrayOf(0f to ctx.parseColor(tp["c1"] ?: "#FFD86B"), 1f to ctx.parseColor(tp["c2"] ?: "#FF3D7F")),
                (p["amt"] ?: 100.0) / 100, PorterDuff.Mode.SRC_ATOP,
            )
        },
        "hueCycle" to { ctx, p, _ ->
            hueRotate(ctx, (ctx.time * (p["speed"] ?: 0.5) * 360) % 360)
            // saturate اضافی وب: saturate(sat%)
            val s = (p["sat"] ?: 130.0) / 100
            if (s != 1.0) ctx.pixelOpChannels { r, g, b, a ->
                val l = lum(r, g, b)
                argb(a, l + (r - l) * s, l + (g - l) * s, l + (b - l) * s)
            }
        },
        "vibrance" to { ctx, p, _ ->
            val k = (p["amt"] ?: 50.0) / 100
            ctx.pixelOpChannels { r, g, b, a ->
                val mx = maxOf(r, g, b)
                val mn = minOf(r, g, b)
                if (mx <= mn) return@pixelOpChannels (a shl 24) or (r shl 16) or (g shl 8) or b
                val sat = (mx - mn).toDouble() / mx
                val avg = (r + g + b) / 3.0
                val boost = 1 + k * (1 - sat)
                argb(a, avg + (r - avg) * boost, avg + (g - avg) * boost, avg + (b - avg) * boost)
            }
        },
        "channelShift" to { ctx, p, _ ->
            val dx = (p["dx"] ?: 8.0).roundToInt()
            val dy = (p["dy"] ?: 0.0).roundToInt()
            neighborOp(ctx) { at, x, y ->
                val a = at(x, y, 3)
                argb(a, at(x - dx, y - dy, 0), at(x, y, 1), at(x + dx, y + dy, 2))
            }
        },
        "solarize" to { ctx, p, _ ->
            val lv = (p["level"] ?: 50.0) / 100 * 255
            ctx.pixelOpChannels { r, g, b, a ->
                argb(a, if (r > lv) 255 - r else r, if (g > lv) 255 - g else g, if (b > lv) 255 - b else b)
            }
        },
        "invertFx" to { ctx, _, _ ->
            ctx.pixelOpChannels { r, g, b, a -> argb(a, 255 - r, 255 - g, 255 - b) }
        },
        "exposure" to { ctx, p, _ ->
            val k = 1 + (p["amt"] ?: 20.0) / 100
            ctx.pixelOpChannels { r, g, b, a -> argb(a, r * k, g * k, b * k) }
        },
        "clarity" to { ctx, p, _ ->
            val a = (p["amt"] ?: 50.0) / 100 * 0.5
            neighborOp(ctx) { at, x, y ->
                val al = at(x, y, 3)
                argb(
                    al,
                    (1 + 4 * a) * at(x, y, 0) - a * (at(x - 1, y, 0) + at(x + 1, y, 0) + at(x, y - 1, 0) + at(x, y + 1, 0)),
                    (1 + 4 * a) * at(x, y, 1) - a * (at(x - 1, y, 1) + at(x + 1, y, 1) + at(x, y - 1, 1) + at(x, y + 1, 1)),
                    (1 + 4 * a) * at(x, y, 2) - a * (at(x - 1, y, 2) + at(x + 1, y, 2) + at(x, y - 1, 2) + at(x, y + 1, 2)),
                )
            }
        },
        "levels" to { ctx, p, _ ->
            val bl = (p["black"] ?: 0.0) / 100
            val wh = max(bl + 0.01, (p["white"] ?: 100.0) / 100)
            val gm = (p["gamma"] ?: 100.0) / 100
            ctx.pixelOpChannels { r, g, b, a ->
                fun lv(v: Int): Int {
                    var u = (v / 255.0 - bl) / (wh - bl)
                    u = u.coerceIn(0.0, 1.0)
                    return (Math.pow(u, 1 / gm) * 255).roundToInt().coerceIn(0, 255)
                }
                argb(a, lv(r), lv(g), lv(b))
            }
        },
        "sepiaFx" to { ctx, p, _ ->
            val k = (p["amt"] ?: 80.0) / 100
            ctx.pixelOpChannels { r, g, b, a ->
                val sr = r * 0.393 + g * 0.769 + b * 0.189
                val sg = r * 0.349 + g * 0.686 + b * 0.168
                val sb = r * 0.272 + g * 0.534 + b * 0.131
                argb(a, r + (sr - r) * k, g + (sg - g) * k, b + (sb - b) * k)
            }
        },
        "vintage" to { ctx, p, _ ->
            val k = (p["amt"] ?: 70.0) / 100
            ctx.pixelOpChannels { r, g, b, a ->
                val sr = r * 0.393 + g * 0.769 + b * 0.189
                val sg = r * 0.349 + g * 0.686 + b * 0.168
                val sb = r * 0.272 + g * 0.534 + b * 0.131
                argb(a, r + (sr - r) * k * 0.7, g + (sg - g) * k * 0.7, b + (sb - b) * k * 0.7)
            }
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, min(b.w, b.h) * 0.3f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(0, 0, 0, 0.0), 1f to rgba(0, 0, 0, 0.8)), 0.35 * k,
            )
        },
        "crossProcess" to { ctx, p, _ ->
            val k = (p["amt"] ?: 70.0) / 100
            ctx.pixelOpChannels { r, g, b, a ->
                val l = lum(r, g, b) / 255
                val nb = if (l < 0.5) min(255.0, b + (0.5 - l) * 80 * k) else b.toDouble()
                val nr = if (l >= 0.5) min(255.0, r + (l - 0.5) * 80 * k) else r.toDouble()
                argb(a, nr, g.toDouble(), nb)
            }
        },
        "infrared" to { ctx, _, _ ->
            ctx.pixelOpChannels { r, g, b, a -> argb(a, g, r, b * 0.5) }
        },
        "thermal" to { ctx, _, _ ->
            val stops = arrayOf(
                doubleArrayOf(0.0, 0.0, 0.0, 0.0),
                doubleArrayOf(0.33, 128.0, 0.0, 0.0),
                doubleArrayOf(0.66, 255.0, 128.0, 0.0),
                doubleArrayOf(1.0, 255.0, 255.0, 220.0),
            )
            ctx.pixelOpChannels { r, g, b, a ->
                val l = lum(r, g, b) / 255
                if (l >= 1) return@pixelOpChannels argb(a, 255, 255, 220)
                for (j in 1 until stops.size) {
                    if (l >= stops[j - 1][0] && l <= stops[j][0]) {
                        val s = stops[j - 1]
                        val t = (l - s[0]) / (stops[j][0] - s[0])
                        return@pixelOpChannels argb(
                            a,
                            s[1] + (stops[j][1] - s[1]) * t,
                            s[2] + (stops[j][2] - s[2]) * t,
                            s[3] + (stops[j][3] - s[3]) * t,
                        )
                    }
                }
                argb(a, 0, 0, 0)
            }
        },
        "tritone" to { ctx, p, tp ->
            val c1 = ctx.parseColor(tp["c1"] ?: "#0B1026")
            val c2 = ctx.parseColor(tp["c2"] ?: "#E4142A")
            val c3 = ctx.parseColor(tp["c3"] ?: "#FFD86B")
            fun ch(c: Int, i: Int) = when (i) { 0 -> (c ushr 16) and 0xFF; 1 -> (c ushr 8) and 0xFF; else -> c and 0xFF }
            ctx.pixelOpChannels { r, g, b, a ->
                val l = lum(r, g, b) / 255
                val (ca, cb, t) = if (l < 0.5) Triple(c1, c2, l * 2) else Triple(c2, c3, (l - 0.5) * 2)
                argb(a, ch(ca, 0) + (ch(cb, 0) - ch(ca, 0)) * t, ch(ca, 1) + (ch(cb, 1) - ch(ca, 1)) * t, ch(ca, 2) + (ch(cb, 2) - ch(ca, 2)) * t)
            }
        },
        "silhouette" to { ctx, _, tp ->
            val col = ctx.parseColor(tp["color"] ?: "#111111")
            val r = (col ushr 16) and 0xFF
            val g = (col ushr 8) and 0xFF
            val b = col and 0xFF
            ctx.pixelOpChannels { _, _, _, a -> argb(a, r, g, b) }
        },
        "xray" to { ctx, _, _ ->
            ctx.pixelOpChannels { r, g, b, a ->
                val l = (255 - lum(r, g, b)).roundToInt()
                argb(a, l, l, l)
            }
        },
        "colorPop" to { ctx, p, tp ->
            val col = ctx.parseColor(tp["color"] ?: "#E4142A")
            val cr = (col ushr 16) and 0xFF
            val cg = (col ushr 8) and 0xFF
            val cb = col and 0xFF
            val tol = (p["tol"] ?: 40.0) * 2.55
            ctx.pixelOpChannels { r, g, b, a ->
                if (hypot(hypot((r - cr).toDouble(), (g - cg).toDouble()), (b - cb).toDouble()) > tol) {
                    val l = lum(r, g, b).roundToInt()
                    argb(a, l, l, l)
                } else (a shl 24) or (r shl 16) or (g shl 8) or b
            }
        },
        "color" to { ctx, p, _ ->
            val bright = (p["bright"] ?: 100.0) / 100
            val contrast = (p["contrast"] ?: 100.0) / 100
            val sat = (p["sat"] ?: 100.0) / 100
            val hue = p["hue"] ?: 0.0
            val gray = (p["gray"] ?: 0.0) / 100
            val sepia = (p["sepia"] ?: 0.0) / 100
            val invert = (p["invert"] ?: 0.0) / 100
            ctx.pixelOpChannels { r0, g0, b0, a ->
                var r = r0 * bright
                var g = g0 * bright
                var b = b0 * bright
                r = (r - 128) * contrast + 128
                g = (g - 128) * contrast + 128
                b = (b - 128) * contrast + 128
                var l = lum(r.roundToInt().coerceIn(0, 255), g.roundToInt().coerceIn(0, 255), b.roundToInt().coerceIn(0, 255))
                r = l + (r - l) * sat
                g = l + (g - l) * sat
                b = l + (b - l) * sat
                var packed = hueRotPacked(r.roundToInt().coerceIn(0, 255), g.roundToInt().coerceIn(0, 255), b.roundToInt().coerceIn(0, 255), hue)
                r = ((packed ushr 16) and 0xFF).toDouble()
                g = ((packed ushr 8) and 0xFF).toDouble()
                b = (packed and 0xFF).toDouble()
                l = lum(r.roundToInt().coerceIn(0, 255), g.roundToInt().coerceIn(0, 255), b.roundToInt().coerceIn(0, 255))
                r += (l - r) * gray
                g += (l - g) * gray
                b += (l - b) * gray
                val sr = r * 0.393 + g * 0.769 + b * 0.189
                val sg = r * 0.349 + g * 0.686 + b * 0.168
                val sb = r * 0.272 + g * 0.534 + b * 0.131
                r += (sr - r) * sepia
                g += (sg - g) * sepia
                b += (sb - b) * sepia
                r += (255 - 2 * r) * invert
                g += (255 - 2 * g) * invert
                b += (255 - 2 * b) * invert
                argb(a, r, g, b)
            }
        },
        "huePulse" to { ctx, p, _ ->
            hueRotate(ctx, sin(ctx.time * 2) * (p["amt"] ?: 60.0))
        },
        "colorSplit" to { ctx, p, _ ->
            val off = ((p["amt"] ?: 20.0) * 0.3).roundToInt()
            neighborOp(ctx) { at, x, y ->
                val a = at(x, y, 3)
                argb(a, at(x - off, y, 0), at(x, y, 1), at(x + off, y, 2))
            }
        },
        "tintPulse" to { ctx, p, tp ->
            val a = (0.5 + 0.5 * sin(ctx.time * 3)) * (p["amt"] ?: 40.0) / 100 * 0.5
            val paint = Paint().apply {
                alpha = (a.coerceIn(0.0, 1.0) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.OVERLAY)
                color = ctx.parseColor(tp["color"] ?: "#FF2D78")
            }
            val b = box(ctx)
            ctx.canvas.drawRect(b.x, b.y, b.x + b.w, b.y + b.h, paint)
        },
        "prismShift" to { ctx, p, _ ->
            val off = ((p["amt"] ?: 30.0) * 0.3).roundToInt()
            neighborOp(ctx) { at, x, y ->
                val a = at(x, y, 3)
                argb(a, at(x - off, y, 0), at(x, y, 1), at(x + off, y, 2))
            }
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x + b.w, b.y,
                arrayOf(
                    0f to Color.RED, 1f / 3 to ctx.parseColor("#FFD84D"),
                    2f / 3 to ctx.parseColor("#00C853"), 1f to ctx.parseColor("#0091FF"),
                ),
                (p["amt"] ?: 30.0) / 100 * 0.25, PorterDuff.Mode.OVERLAY,
            )
        },
        "prismWave" to { ctx, p, _ ->
            rowWave(ctx, (p["amt"] ?: 30.0) * 0.3)
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x + b.w, b.y,
                arrayOf(
                    0f to Color.RED, 1f / 3 to ctx.parseColor("#FFD84D"),
                    2f / 3 to ctx.parseColor("#00C853"), 1f to ctx.parseColor("#0091FF"),
                ),
                (p["amt"] ?: 30.0) / 100 * 0.25, PorterDuff.Mode.OVERLAY,
            )
        },
        "colorWave" to { ctx, p, _ ->
            hueRotate(ctx, sin(ctx.time * 2) * (p["amt"] ?: 60.0))
            rowWave(ctx, 10.0)
        },
        "rainbowWave" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x + b.w, (b.y + b.h + sin(ctx.time * 2) * 20).toFloat(),
                arrayOf(
                    0f to Color.RED, 0.2f to ctx.parseColor("#FF7F00"), 0.4f to ctx.parseColor("#FFD84D"),
                    0.6f to ctx.parseColor("#00C853"), 0.8f to ctx.parseColor("#0091FF"), 1f to ctx.parseColor("#7C4DFF"),
                ),
                (p["amt"] ?: 40.0) / 100 * 0.3, PorterDuff.Mode.OVERLAY,
            )
        },
        "oceanWave" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x, (b.y + b.h + sin(ctx.time * 2) * 15).toFloat(),
                arrayOf(0f to rgba(0, 180, 255, 0.7), 1f to rgba(0, 40, 120, 0.6)),
                (p["amt"] ?: 40.0) / 100 * 0.35, PorterDuff.Mode.OVERLAY,
            )
        },
        "hologram" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x + b.w, b.y,
                arrayOf(
                    0f to Color.RED, 1f / 3 to ctx.parseColor("#FFD84D"),
                    2f / 3 to ctx.parseColor("#00C853"), 1f to ctx.parseColor("#0091FF"),
                ),
                (p["amt"] ?: 40.0) / 100 * 0.3, PorterDuff.Mode.OVERLAY,
            )
            val paint = Paint().apply {
                alpha = (((p["amt"] ?: 40.0) / 100 * 0.2) * 255).roundToInt()
                color = Color.BLACK
            }
            var y = b.y
            val step = max(3, 4)
            while (y < b.y + b.h) {
                ctx.canvas.drawRect(b.x, y, b.x + b.w, y + 1f, paint)
                y += step
            }
        },
        "prismGlow" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x + b.w, b.y + b.h,
                arrayOf(
                    0f to Color.RED, 0.25f to ctx.parseColor("#FFD84D"), 0.5f to ctx.parseColor("#00C853"),
                    0.75f to ctx.parseColor("#0091FF"), 1f to ctx.parseColor("#7C4DFF"),
                ),
                (p["amt"] ?: 40.0) / 100 * 0.3, PorterDuff.Mode.OVERLAY,
            )
        },
        "cosmosWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x, b.y + b.h,
                arrayOf(
                    0f to rgba(120, 0, 255, 0.7), 0.5f to rgba(0, 120, 255, 0.5), 1f to rgba(255, 0, 180, 0.6),
                ),
                (p["amt"] ?: 40.0) / 100 * 0.35, PorterDuff.Mode.OVERLAY,
            )
        },
        "rainbowShift" to { ctx, p, _ ->
            hueRotate(ctx, ((ctx.time * (p["speed"] ?: 1.0) * 360) % 360))
        },
        "invertPulse" to { ctx, p, _ ->
            val k = (0.5 + 0.5 * sin(ctx.time * 3)) * (p["amt"] ?: 70.0) / 100
            ctx.pixelOpChannels { r, g, b, a -> argb(a, r + (255 - 2 * r) * k, g + (255 - 2 * g) * k, b + (255 - 2 * b) * k) }
        },
        "colorBands" to { ctx, p, _ ->
            val b = box(ctx)
            val cols = intArrayOf(
                ctx.parseColor("#E4142A"), ctx.parseColor("#FFD84D"),
                ctx.parseColor("#4DD8FF"), ctx.parseColor("#7CFF6B"),
            )
            val paint = Paint().apply { alpha = (((p["amt"] ?: 30.0) / 100 * 0.25) * 255).roundToInt() }
            val fl = floor(ctx.time).toInt()
            for (i in 0 until 4) {
                paint.color = cols[(i + fl) % cols.size]
                ctx.canvas.drawRect(b.x, b.y + (i / 4f) * b.h, b.x + b.w, b.y + ((i + 1) / 4f) * b.h, paint)
            }
        },
        "prism" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x + b.w, b.y,
                arrayOf(
                    0f to Color.RED, 0.2f to ctx.parseColor("#FF7A00"), 0.4f to ctx.parseColor("#FFD84D"),
                    0.6f to ctx.parseColor("#00C853"), 0.8f to ctx.parseColor("#0091FF"), 1f to ctx.parseColor("#7C4DFF"),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.4, PorterDuff.Mode.OVERLAY,
            )
        },
        "aurora" to { ctx, p, _ ->
            val b = box(ctx)
            val paint = Paint().apply { alpha = (((p["amt"] ?: 50.0) / 100 * 0.35) * 255).roundToInt() }
            val cols = intArrayOf(ctx.parseColor("#00FF88"), ctx.parseColor("#0091FF"), ctx.parseColor("#FF7AD9"))
            for (i in 0 until 3) {
                paint.color = cols[i]
                val path = android.graphics.Path()
                val y0 = b.y + b.h * (0.3f + i * 0.15f)
                path.moveTo(b.x, y0)
                var x = b.x
                val step = max(4f, b.w / 40)
                while (x <= b.x + b.w) {
                    path.lineTo(x, b.y + b.h * (0.3f + i * 0.15f) + sin(x / b.w * PI * 3 + ctx.time + i * 2).toFloat() * b.h * 0.08f)
                    x += step
                }
                path.lineTo(b.x + b.w, b.y + b.h * (0.5f + i * 0.15f))
                path.lineTo(b.x, b.y + b.h * (0.5f + i * 0.15f))
                path.close()
                ctx.canvas.drawPath(path, paint)
            }
        },
        "watercolor" to { ctx, p, _ ->
            val tmp = blurredBmp(ctx, max(1, ((p["amt"] ?: 50.0) / 100 * 1.5).roundToInt()))
            clear(ctx)
            ctx.canvas.drawBitmap(tmp, 0f, 0f, null)
            tmp.recycle()
            val boost = 1 + (p["amt"] ?: 50.0) / 100 * 0.5
            ctx.pixelOpChannels { r, g, b, a ->
                val avg = (r + g + b) / 3.0
                argb(a, avg + (r - avg) * boost, avg + (g - avg) * boost, avg + (b - avg) * boost)
            }
        },
        "nightVision" to { ctx, p, _ ->
            val k = (p["amt"] ?: 70.0) / 100
            ctx.pixelOpChannels { r, g, b, a ->
                val l = lum(r, g, b)
                argb(a, l * 0.2 * (1 + k), min(255.0, l * (1 + k)), l * 0.2)
            }
            noiseOverlay(ctx, 0.15 * k, PorterDuff.Mode.SRC_OVER)
        },
        "comic" to { ctx, p, _ ->
            val lv = (p["level"] ?: 50.0) / 100
            ctx.pixelOpChannels { r, g, b, a ->
                val c = if (lum(r, g, b) / 255 > lv) 255 else 0
                argb(a, c, c, c)
            }
        },
        "pencil" to { ctx, p, _ ->
            val mag = sobel(ctx)
            val k = (p["amt"] ?: 100.0) / 100
            val px = IntArray(ctx.w * ctx.h)
            ctx.dst.getPixels(px, 0, ctx.w, 0, 0, ctx.w, ctx.h)
            for (i in px.indices) {
                val m = min(255.0, mag[i] * k).roundToInt()
                val c = px[i]
                val a = (c ushr 24) and 0xFF
                px[i] = argb(a, 255 - m, 255 - m, 255 - m)
            }
            ctx.dst.setPixels(px, 0, ctx.w, 0, 0, ctx.w, ctx.h)
        },
        "emboss" to { ctx, p, _ ->
            val k = (p["amt"] ?: 60.0) / 100
            neighborOp(ctx) { at, x, y ->
                val a = at(x, y, 3)
                val m = (128 + (lumAt(at, x - 1, y - 1) - lumAt(at, x + 1, y + 1)) * k).coerceIn(0.0, 255.0).roundToInt()
                argb(a, m, m, m)
            }
        },
        "bevel" to { ctx, p, _ ->
            val a = (p["ang"] ?: 45.0) * PI / 180
            val dx = cos(a).roundToInt()
            val dy = sin(a).roundToInt()
            val k = (p["amt"] ?: 60.0) / 100
            neighborOp(ctx) { at, x, y ->
                val al = at(x, y, 3)
                val diff = (lumAt(at, x + dx, y + dy) - lumAt(at, x - dx, y - dy)) * k
                argb(al, at(x, y, 0) + diff, at(x, y, 1) + diff, at(x, y, 2) + diff)
            }
        },
        "findEdges" to { ctx, p, _ ->
            val mag = sobel(ctx)
            val k = (p["amt"] ?: 100.0) / 100
            val px = IntArray(ctx.w * ctx.h)
            ctx.dst.getPixels(px, 0, ctx.w, 0, 0, ctx.w, ctx.h)
            for (i in px.indices) {
                val m = min(255.0, mag[i] * k).roundToInt()
                val c = px[i]
                val a = (c ushr 24) and 0xFF
                px[i] = argb(a, m, m, m)
            }
            ctx.dst.setPixels(px, 0, ctx.w, 0, 0, ctx.w, ctx.h)
        },
        "edgeGlow" to { ctx, p, tp ->
            val mag = sobel(ctx)
            val col = ctx.parseColor(tp["color"] ?: "#E4142A")
            val cr = (col ushr 16) and 0xFF
            val cg = (col ushr 8) and 0xFF
            val cb = col and 0xFF
            val edge = Bitmap.createBitmap(ctx.w, ctx.h, Bitmap.Config.ARGB_8888)
            val epx = IntArray(ctx.w * ctx.h)
            for (i in epx.indices) epx[i] = argb(mag[i], cr, cg, cb)
            edge.setPixels(epx, 0, ctx.w, 0, 0, ctx.w, ctx.h)
            val paint = Paint().apply {
                alpha = (min(1.0, (p["amt"] ?: 80.0) / 100) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
            }
            ctx.canvas.drawBitmap(edge, 0f, 0f, paint)
            edge.recycle()
        },
        "neon" to { ctx, p, tp ->
            val mag = sobel(ctx)
            val col = ctx.parseColor(tp["color"] ?: "#FF2D78")
            val cr = (col ushr 16) and 0xFF
            val cg = (col ushr 8) and 0xFF
            val cb = col and 0xFF
            val edge = Bitmap.createBitmap(ctx.w, ctx.h, Bitmap.Config.ARGB_8888)
            val epx = IntArray(ctx.w * ctx.h)
            for (i in epx.indices) epx[i] = argb(mag[i], cr, cg, cb)
            edge.setPixels(epx, 0, ctx.w, 0, 0, ctx.w, ctx.h)
            val b = box(ctx)
            val dim = Paint().apply { alpha = (0.45 * 255).roundToInt(); color = Color.BLACK }
            ctx.canvas.drawRect(b.x, b.y, b.x + b.w, b.y + b.h, dim)
            val paint = Paint().apply {
                alpha = (min(1.0, (p["amt"] ?: 80.0) / 100) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
            }
            ctx.canvas.drawBitmap(edge, 0f, 0f, paint)
            edge.recycle()
        },
        "edgePulse" to { ctx, p, _ ->
            val mag = sobel(ctx)
            val pulse = 0.5 + 0.5 * sin(ctx.time * 3)
            val k = (p["amt"] ?: 80.0) / 100 * pulse
            val px = IntArray(ctx.w * ctx.h)
            ctx.dst.getPixels(px, 0, ctx.w, 0, 0, ctx.w, ctx.h)
            for (i in px.indices) {
                val m = min(255.0, mag[i] * k).roundToInt()
                val c = px[i]
                val a = (c ushr 24) and 0xFF
                px[i] = argb(a, m, m, m)
            }
            ctx.dst.setPixels(px, 0, ctx.w, 0, 0, ctx.w, ctx.h)
        },
        "oilPaint" to { ctx, p, _ ->
            val tmp = blurredBmp(ctx, max(1, ((p["amt"] ?: 50.0) / 100 * 2).roundToInt()))
            clear(ctx)
            ctx.canvas.drawBitmap(tmp, 0f, 0f, null)
            tmp.recycle()
            val lv = 6.0
            ctx.pixelOpChannels { r, g, b, a ->
                argb(
                    a,
                    ((r / 255.0 * lv).roundToInt() / lv * 255),
                    ((g / 255.0 * lv).roundToInt() / lv * 255),
                    ((b / 255.0 * lv).roundToInt() / lv * 255),
                )
            }
        },
        "dither" to { ctx, _, _ ->
            val bayer = arrayOf(
                intArrayOf(0, 8, 2, 10), intArrayOf(12, 4, 14, 6),
                intArrayOf(3, 11, 1, 9), intArrayOf(15, 7, 13, 5),
            )
            neighborOp(ctx) { at, x, y ->
                val a = at(x, y, 3)
                val l = lumAt(at, x, y)
                val c = if (l > bayer[y % 4][x % 4] * 16) 255 else 0
                argb(a, c, c, c)
            }
        },
        "haze" to { ctx, p, _ ->
            val tmp = blurredBmp(ctx, max(1, ((p["amt"] ?: 40.0) / 100 * 3).roundToInt()))
            clear(ctx)
            ctx.canvas.drawBitmap(tmp, 0f, 0f, null)
            tmp.recycle()
            val paint = Paint().apply {
                alpha = (((p["amt"] ?: 40.0) / 100 * 0.35) * 255).roundToInt()
                color = Color.WHITE
            }
            val b = box(ctx)
            ctx.canvas.drawRect(b.x, b.y, b.x + b.w, b.y + b.h, paint)
        },
        "dream" to { ctx, p, _ ->
            val tmp = blurredBmp(ctx, max(1, ((p["amt"] ?: 50.0) / 100 * 3).roundToInt()))
            val paint = Paint().apply { alpha = (((p["amt"] ?: 50.0) / 100 * 0.5) * 255).roundToInt() }
            ctx.canvas.drawBitmap(tmp, 0f, 0f, paint)
            tmp.recycle()
            val white = Paint().apply {
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.15) * 255).roundToInt()
                color = Color.WHITE
            }
            val b = box(ctx)
            ctx.canvas.drawRect(b.x, b.y, b.x + b.w, b.y + b.h, white)
        },
        "noir" to { ctx, p, _ ->
            val k = (p["amt"] ?: 70.0) / 100
            ctx.pixelOpChannels { r, g, b, a ->
                var l = lum(r, g, b)
                l = max(0.0, min(255.0, (l - 128) * (1 + k) + 128))
                val li = l.roundToInt()
                argb(a, li, li, li)
            }
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, min(b.w, b.h) * 0.3f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(0, 0, 0, 0.0), 1f to rgba(0, 0, 0, 0.7)), k * 0.4,
            )
        },
        "oldFilm" to { ctx, p, _ ->
            val k = (p["amt"] ?: 70.0) / 100
            ctx.pixelOpChannels { r, g, b, a ->
                val sr = r * 0.393 + g * 0.769 + b * 0.189
                val sg = r * 0.349 + g * 0.686 + b * 0.168
                val sb = r * 0.272 + g * 0.534 + b * 0.131
                argb(a, r + (sr - r) * k * 0.7, g + (sg - g) * k * 0.7, b + (sb - b) * k * 0.7)
            }
            val b = box(ctx)
            val paint = Paint().apply {
                alpha = (k * 0.5 * 255).roundToInt()
                color = Color.WHITE
            }
            val step = floor(ctx.time * 2).toInt()
            for (i in 0 until 3) {
                val sx = b.x + hashFrac(i * 12.9898 + step) * b.w
                ctx.canvas.drawRect(sx.toFloat(), b.y, (sx + 1).toFloat(), b.y + b.h, paint)
            }
        },
        "paperGrain" to { ctx, p, _ ->
            ctx.pixelOpChannels { r, g, b, a -> argb(a, min(255.0, r * 1.05 + 10), min(255.0, g * 1.02 + 5), b.toDouble()) }
            noiseOverlay(ctx, (p["amt"] ?: 50.0) / 100 * 0.12, PorterDuff.Mode.SRC_OVER)
        },
        "inkBleed" to { ctx, p, _ ->
            val tmp = blurredBmp(ctx, max(1, ((p["amt"] ?: 50.0) / 100 * 2).roundToInt()))
            clear(ctx)
            ctx.canvas.drawBitmap(tmp, 0f, 0f, null)
            tmp.recycle()
            ctx.pixelOpChannels { r, g, b, a ->
                val l = lum(r, g, b)
                val k = 0.7 + (l / 255) * 0.3
                argb(a, r * k, g * k, b * k)
            }
        },
        "grain" to { ctx, p, _ ->
            val fr = floor(ctx.time * 24).toInt()
            val sc = max(1.0, (p["size"] ?: 1.5) * 0.5)
            val dx = -hashFrac(fr.toDouble()) * 256 * sc
            val dy = -hashFrac(fr + 0.5) * 256 * sc
            noiseOverlay(ctx, min(1.0, (p["amt"] ?: 30.0) / 60), PorterDuff.Mode.OVERLAY, dx.toFloat(), dy.toFloat())
        },
        "noise" to { ctx, p, _ ->
            noiseOverlay(ctx, (p["amt"] ?: 0.15) / 100, PorterDuff.Mode.OVERLAY)
        },
        "clouds" to { ctx, p, _ ->
            val sc = max(10.0, p["scale"] ?: 50.0)
            val tmp = blurredBmp(ctx, max(1, (sc / 4).roundToInt()))
            val paint = Paint().apply {
                alpha = (((p["amt"] ?: 50.0) / 100) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.OVERLAY)
            }
            ctx.canvas.drawBitmap(tmp, 0f, 0f, paint)
            tmp.recycle()
        },
        "fractal" to { ctx, p, _ ->
            val b = box(ctx)
            for ((scale, alpha) in listOf(1.0 to 0.6, 0.35 to 0.4)) {
                val tmp = blurredBmp(ctx, max(1, ((p["scale"] ?: 50.0) * scale / 4).roundToInt()))
                val paint = Paint().apply {
                    this.alpha = (((p["amt"] ?: 50.0) / 100 * alpha) * 255).roundToInt()
                    xfermode = PorterDuffXfermode(PorterDuff.Mode.OVERLAY)
                }
                ctx.canvas.drawBitmap(tmp, 0f, 0f, paint)
                tmp.recycle()
            }
        },
        "marble" to { ctx, p, _ ->
            val k = (p["amt"] ?: 50.0) / 100
            neighborOp(ctx) { at, x, y ->
                val a = at(x, y, 3)
                val m = sin(x * 0.05 + sin(y * 0.05) * 2) * 0.5 + 0.5
                val kk = 1 - k * 0.3 * m
                argb(a, at(x, y, 0) * kk, at(x, y, 1) * kk, at(x, y, 2) * (1 - k * 0.15 * m))
            }
        },
        "chroma" to { ctx, p, tp ->
            val kc = ctx.parseColor(tp["color"] ?: "#00FF00")
            val kr = (kc ushr 16) and 0xFF
            val kg = (kc ushr 8) and 0xFF
            val kb = kc and 0xFF
            val tol = (p["tol"] ?: 32.0) / 100 * 442
            val soft = max(1.0, (p["soft"] ?: 12.0) / 100 * 442)
            ctx.pixelOpChannels { r, g, b, a ->
                val dist = hypot(hypot((r - kr).toDouble(), (g - kg).toDouble()), (b - kb).toDouble())
                val f = if (dist < tol + soft) ((dist - tol) / soft).coerceIn(0.0, 1.0) else 1.0
                argb((a * f).roundToInt(), r, g, b)
            }
        },
        "lumaKey" to { ctx, p, _ ->
            val lv = (p["level"] ?: 50.0) / 100
            val soft = max(0.01, (p["soft"] ?: 20.0) / 100)
            val mode = p["mode"] ?: 0.0
            ctx.pixelOpChannels { r, g, b, a ->
                val l = lum(r, g, b) / 255
                val f = if (mode >= 0.5) ((lv + soft / 2 - l) / soft).coerceIn(0.0, 1.0) else ((l - (lv - soft / 2)) / soft).coerceIn(0.0, 1.0)
                argb((a * f).roundToInt(), r, g, b)
            }
        },
        "matte" to { ctx, p, _ ->
            val lv = (p["level"] ?: 50.0) / 100
            val soft = max(0.01, (p["soft"] ?: 20.0) / 100)
            val mode = p["mode"] ?: 0.0
            ctx.pixelOpChannels { r, g, b, a ->
                val l = lum(r, g, b) / 255
                val keep = if (mode >= 0.5) ((lv + soft / 2 - l) / soft).coerceIn(0.0, 1.0) else ((l - (lv - soft / 2)) / soft).coerceIn(0.0, 1.0)
                argb((a * keep).roundToInt(), r, g, b)
            }
        },
        "chromaShift" to { ctx, p, _ ->
            ctx.rgbSplit(p["amount"] ?: 6.0, 0.0)
        },
        "anaglyph" to { ctx, p, _ ->
            val off = (p["amt"] ?: 10.0).roundToInt()
            neighborOp(ctx) { at, x, y ->
                val a = at(x, y, 3)
                argb(a, at(x - off, y, 0), at(x + off, y, 1), at(x + off, y, 2))
            }
        },

        // ── تاری و تحریف ──
        "sharpen" to { ctx, p, _ ->
            val a = (p["amt"] ?: 50.0) / 100
            neighborOp(ctx) { at, x, y ->
                val al = at(x, y, 3)
                argb(
                    al,
                    (1 + 4 * a) * at(x, y, 0) - a * (at(x - 1, y, 0) + at(x + 1, y, 0) + at(x, y - 1, 0) + at(x, y + 1, 0)),
                    (1 + 4 * a) * at(x, y, 1) - a * (at(x - 1, y, 1) + at(x + 1, y, 1) + at(x, y - 1, 1) + at(x, y + 1, 1)),
                    (1 + 4 * a) * at(x, y, 2) - a * (at(x - 1, y, 2) + at(x + 1, y, 2) + at(x, y - 1, 2) + at(x, y + 1, 2)),
                )
            }
        },
        "motionBlur" to { ctx, p, _ ->
            val a = (p["angle"] ?: 0.0) * PI / 180
            val l = p["amount"] ?: 10.0
            smear(ctx, 10) { m, u ->
                m.postTranslate((cos(a) * l * (u - 0.5)).toFloat(), (sin(a) * l * (u - 0.5)).toFloat())
            }
        },
        "radialBlur" to { ctx, p, _ ->
            val b = box(ctx)
            val k = p["amount"] ?: 0.4
            smear(ctx, 10) { m, u ->
                val s = 1 + k * 0.35 * u
                m.postTranslate(b.cx, b.cy)
                m.postScale(s.toFloat(), s.toFloat())
                m.postTranslate(-b.cx, -b.cy)
            }
        },
        "pixelate" to { ctx, p, _ ->
            val s = max(1.0, p["size"] ?: 12.0)
            val sw = max(1, (ctx.w / s).roundToInt())
            val sh = max(1, (ctx.h / s).roundToInt())
            val small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
            val sc = Canvas(small)
            sc.drawBitmap(ctx.src, Rect(0, 0, ctx.w, ctx.h), RectF(0f, 0f, sw.toFloat(), sh.toFloat()), Paint().apply { isFilterBitmap = false })
            clear(ctx)
            ctx.canvas.drawBitmap(small, Rect(0, 0, sw, sh), RectF(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat()), Paint().apply { isFilterBitmap = false })
            small.recycle()
        },
        "pixel" to { ctx, p, _ ->
            val s = max(1.0, p["size"] ?: 14.0)
            val sw = max(1, (ctx.w / s).roundToInt())
            val sh = max(1, (ctx.h / s).roundToInt())
            val small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
            val sc = Canvas(small)
            sc.drawBitmap(ctx.src, Rect(0, 0, ctx.w, ctx.h), RectF(0f, 0f, sw.toFloat(), sh.toFloat()), Paint().apply { isFilterBitmap = false })
            clear(ctx)
            ctx.canvas.drawBitmap(small, Rect(0, 0, sw, sh), RectF(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat()), Paint().apply { isFilterBitmap = false })
            small.recycle()
        },
        "bulge" to { ctx, p, _ ->
            val amt = (p["amt"] ?: 50.0) / 100
            val b = box(ctx)
            val r = max(b.w, b.h) / 2 * (p["r"] ?: 60.0) / 100
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist >= r || dist < 0.5) Pair(dx, dy)
                else {
                    val k = max(0.2, 1 - amt * (1 - (dist / r) * (dist / r)))
                    Pair(dx * k, dy * k)
                }
            }
        },
        "twirl" to { ctx, p, _ ->
            val amt = (p["amt"] ?: 50.0) / 100 * PI
            val b = box(ctx)
            val r = max(b.w, b.h) / 2 * (p["r"] ?: 70.0) / 100
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist >= r) Pair(dx, dy)
                else {
                    val a = amt * (1 - dist / r)
                    val c = cos(a)
                    val s = sin(a)
                    Pair(dx * c - dy * s, dx * s + dy * c)
                }
            }
        },
        "pinch" to { ctx, p, _ ->
            val amt = (p["amt"] ?: 50.0) / 100
            val b = box(ctx)
            val r = max(b.w, b.h) / 2 * (p["r"] ?: 60.0) / 100
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist >= r || dist < 0.5) Pair(dx, dy)
                else {
                    val k = 1 + amt * (1 - (dist / r) * (dist / r))
                    Pair(dx * k, dy * k)
                }
            }
        },
        "ripple" to { ctx, p, _ ->
            // در وب پارامترهای amp/len/speed خوانده می‌شوند ولی رجیستری amount/freq دارد؛
            // اینجا با همان فرمول و پارامترهای رجیستری پیاده شده است.
            val a = p["amount"] ?: 8.0
            val len = max(1.0, min(ctx.w, ctx.h) / (p["freq"] ?: 6.0))
            val ph = ctx.time
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist < 0.5) Pair(dx, dy)
                else {
                    val off = sin((dist / len) * PI * 2 - ph) * a
                    Pair(dx * (1 + off / dist), dy * (1 + off / dist))
                }
            }
        },
        "wave" to { ctx, p, _ ->
            // مثل ripple: وب amp/len/speed می‌خواند، رجیستری amount/freq دارد.
            val b = box(ctx)
            val a = p["amount"] ?: 6.0
            val len = max(1.0, ctx.w / (p["freq"] ?: 4.0))
            val ph = ctx.time
            val band = max(2, 2)
            val srcR = Rect(0, 0, 0, 0)
            val dstR = RectF()
            // جهت افقی (dir پیش‌فرض وب >= 0.5): جابه‌جایی عمودی بر حسب x
            var x = max(0f, b.x - a.toFloat())
            while (x < min(ctx.w.toFloat(), b.x + b.w + a.toFloat())) {
                val dy = (sin((x / len) * PI * 2 + ph) * a).toFloat()
                srcR.set(x.roundToInt(), 0, min(ctx.w, x.roundToInt() + band), ctx.h)
                dstR.set(x, dy, min(ctx.w.toFloat(), x + band), ctx.h + dy)
                ctx.canvas.drawBitmap(ctx.src, srcR, dstR, null)
                x += band
            }
        },
        "vortex" to { ctx, p, _ ->
            val b = box(ctx)
            val r = min(b.w, b.h) / 2
            val a = (p["amt"] ?: 60.0) / 100 * 3
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist >= r || dist < 0.5) Pair(dx, dy)
                else {
                    val ang = a * (1 - dist / r)
                    val c = cos(ang)
                    val s = sin(ang)
                    Pair(dx * c - dy * s, dx * s + dy * c)
                }
            }
        },
        "zoomBlur" to { ctx, p, _ ->
            val b = box(ctx)
            val k = (p["amt"] ?: 25.0) / 100
            smear(ctx, 10) { m, u ->
                val s = 1 + k * 0.35 * u
                m.postTranslate(b.cx, b.cy)
                m.postScale(s.toFloat(), s.toFloat())
                m.postTranslate(-b.cx, -b.cy)
            }
        },
        "dirBlur" to { ctx, p, _ ->
            val a = (p["ang"] ?: 0.0) * PI / 180
            val l = p["len"] ?: 30.0
            smear(ctx, 10) { m, u ->
                m.postTranslate((cos(a) * l * (u - 0.5)).toFloat(), (sin(a) * l * (u - 0.5)).toFloat())
            }
        },
        "kaleido" to { ctx, p, _ ->
            val b = box(ctx)
            val four = (p["mode"] ?: 0.0) < 0.5
            val q = Bitmap.createBitmap(ctx.w, ctx.h, Bitmap.Config.ARGB_8888)
            val qc = Canvas(q)
            qc.save()
            qc.clipRect(0f, 0f, b.cx, if (four) b.cy else ctx.h.toFloat())
            qc.drawBitmap(ctx.src, 0f, 0f, null)
            qc.restore()
            clear(ctx)
            fun put(fx: Float, fy: Float) {
                ctx.canvas.save()
                ctx.canvas.translate(b.cx, b.cy)
                ctx.canvas.scale(fx, fy)
                ctx.canvas.translate(-b.cx, -b.cy)
                ctx.canvas.drawBitmap(q, 0f, 0f, null)
                ctx.canvas.restore()
            }
            put(1f, 1f)
            put(-1f, 1f)
            if (four) {
                put(1f, -1f)
                put(-1f, -1f)
            }
            q.recycle()
        },
        "kaleidoscope" to { ctx, p, _ ->
            val n = max(2.0, (p["segments"] ?: 6.0).roundToInt().toDouble())
            val seg = 2 * PI / n
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist < 0.5) return@warp Pair(dx, dy)
                var th = atan2(dy, dx)
                if (th < 0) th += 2 * PI
                val idx = floor(th / seg).toInt()
                var f = th - idx * seg
                if (idx % 2 == 1) f = seg - f
                Pair(cos(f) * dist, sin(f) * dist)
            }
        },
        "spinBlur" to { ctx, p, _ ->
            val b = box(ctx)
            smear(ctx, 12) { m, u ->
                m.postTranslate(b.cx, b.cy)
                m.postRotate((((p["amt"] ?: 30.0) / 100 * 0.6 * (u - 0.5)) * 180 / PI).toFloat())
                m.postTranslate(-b.cx, -b.cy)
            }
        },
        "fisheye" to { ctx, p, _ ->
            val amt = (p["amt"] ?: 50.0) / 100
            val b = box(ctx)
            val r = hypot(b.w.toDouble(), b.h.toDouble()) / 2
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                val rn = min(1.0, dist / r)
                val k = 1 + amt * rn * rn * 0.5
                Pair(dx * k, dy * k)
            }
        },
        "squeeze" to { ctx, p, _ ->
            val b = box(ctx)
            val k = max(0.1, 1 - (p["amt"] ?: 40.0) / 100)
            val w2 = b.w * k
            clear(ctx)
            ctx.canvas.drawBitmap(ctx.src, Rect(b.x.roundToInt(), b.y.roundToInt(), (b.x + b.w).roundToInt(), (b.y + b.h).roundToInt()), RectF((b.cx - w2 / 2).toFloat(), b.y, (b.cx + w2 / 2).toFloat(), b.y + b.h), null)
        },
        "tiltShift" to { ctx, p, _ ->
            val b = box(ctx)
            val band = (b.h * (p["band"] ?: 40.0) / 100).toFloat()
            val blurred = blurredBmp(ctx, max(0, (p["r"] ?: 12.0).roundToInt()))
            val top = (b.h - band) / 2
            ctx.canvas.drawBitmap(blurred, Rect(b.x.roundToInt(), b.y.roundToInt(), (b.x + b.w).roundToInt(), (b.y + top).roundToInt()), RectF(b.x, b.y, b.x + b.w, b.y + top), null)
            val botY = b.y + (b.h + band) / 2
            ctx.canvas.drawBitmap(blurred, Rect(b.x.roundToInt(), botY.roundToInt(), (b.x + b.w).roundToInt(), (b.y + b.h).roundToInt()), RectF(b.x, botY, b.x + b.w, b.y + b.h), null)
            blurred.recycle()
        },
        "bend" to { ctx, p, _ ->
            val amt = p["amt"] ?: 40.0
            val b = box(ctx)
            val hh = max(1f, b.h / 2)
            ctx.warp { dx, dy -> Pair(dx + amt * (1 - (dy / hh) * (dy / hh)), dy) }
        },
        "tilt3d" to { ctx, p, _ ->
            val b = box(ctx)
            val a = (p["ang"] ?: 25.0) * PI / 180
            val c = max(0.2, cos(a))
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.translate(b.cx, b.cy)
            if ((p["axis"] ?: 0.0) >= 0.5) {
                val m = Matrix()
                m.setValues(floatArrayOf(1f, 0f, (-sin(a) * 0.4).toFloat(), 0f, c.toFloat(), 0f, 0f, 0f, 1f))
                ctx.canvas.concat(m)
            } else {
                val m1 = Matrix()
                m1.setValues(floatArrayOf(c.toFloat(), 0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f))
                ctx.canvas.concat(m1)
                val m2 = Matrix()
                m2.setValues(floatArrayOf(1f, (sin(a) * 0.4).toFloat(), 0f, 0f, 1f, 0f, 0f, 0f, 1f))
                ctx.canvas.concat(m2)
            }
            ctx.canvas.translate(-b.cx, -b.cy)
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
            ctx.canvas.restore()
        },
        "flip3d" to { ctx, p, _ ->
            val b = box(ctx)
            val k = cos(ctx.time * (p["speed"] ?: 0.5) * PI * 2)
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.translate(b.cx, b.cy)
            ctx.canvas.scale((max(0.02, abs(k)) * (if (k < 0) -1 else 1)).toFloat(), 1f)
            ctx.canvas.translate(-b.cx, -b.cy)
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
            ctx.canvas.restore()
        },
        "sphere" to { ctx, p, _ ->
            val amt = (p["amt"] ?: 60.0) / 100
            val b = box(ctx)
            val r = min(b.w, b.h) / 2
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist >= r || dist < 0.5) Pair(dx, dy)
                else {
                    val k = max(0.2, 1 - amt * (1 - (dist / r) * (dist / r)) * 0.7)
                    Pair(dx * k, dy * k)
                }
            }
            radialOverlay(
                ctx, b.cx, b.cy, r * 0.3f, r,
                arrayOf(0f to rgba(255, 255, 255, 0.0), 1f to rgba(0, 0, 0, 0.6)), 0.25 * amt,
            )
        },
        "mosaic" to { ctx, p, _ ->
            val s = max(2, (p["size"] ?: 24.0).roundToInt())
            neighborOp(ctx) { at, x, y ->
                val a = at(x, y, 3)
                val cx = min(ctx.w - 1, (x / s) * s + s / 2)
                val cy = min(ctx.h - 1, (y / s) * s + s / 2)
                argb(a, at(cx, cy, 0), at(cx, cy, 1), at(cx, cy, 2))
            }
        },
        "slitScan" to { ctx, p, _ ->
            val b = box(ctx)
            val a = p["amt"] ?: 50.0
            val band = max(2, 2)
            val srcR = Rect(0, 0, 0, 0)
            val dstR = RectF()
            if ((p["dir"] ?: 0.0) >= 0.5) {
                var x = b.x
                while (x < b.x + b.w) {
                    val dy = (sin((x / max(1f, b.w)) * PI * 4 + ctx.time) * a).toFloat()
                    srcR.set(x.roundToInt(), b.y.roundToInt(), min(ctx.w, x.roundToInt() + band), (b.y + b.h).roundToInt())
                    dstR.set(x, b.y + dy, min(ctx.w.toFloat(), x + band), b.y + b.h + dy)
                    ctx.canvas.drawBitmap(ctx.src, srcR, dstR, null)
                    x += band
                }
            } else {
                var y = b.y
                while (y < b.y + b.h) {
                    val dx = (sin((y / max(1f, b.h)) * PI * 4 + ctx.time) * a).toFloat()
                    srcR.set(b.x.roundToInt(), y.roundToInt(), (b.x + b.w).roundToInt(), min(ctx.h, y.roundToInt() + band))
                    dstR.set(b.x + dx, y, b.x + b.w + dx, min(ctx.h.toFloat(), y + band))
                    ctx.canvas.drawBitmap(ctx.src, srcR, dstR, null)
                    y += band
                }
            }
        },
        "surfaceBlur" to { ctx, p, _ ->
            val tmp = blurredBmp(ctx, max(1, (p["r"] ?: 12.0).roundToInt()))
            val paint = Paint().apply { alpha = (0.6 * 255).roundToInt() }
            ctx.canvas.drawBitmap(tmp, 0f, 0f, paint)
            tmp.recycle()
        },
        "smear" to { ctx, p, _ ->
            val b = box(ctx)
            val a = (p["ang"] ?: 0.0) * PI / 180
            val amp = p["amt"] ?: 50.0
            val steps = 12
            clear(ctx)
            val paint = Paint().apply { this.alpha = (0.25 * 255).roundToInt() }
            for (i in 0 until steps) {
                val u = i / steps.toDouble()
                ctx.canvas.drawBitmap(
                    ctx.src,
                    Rect(b.x.roundToInt(), b.y.roundToInt(), (b.x + b.w).roundToInt(), (b.y + b.h).roundToInt()),
                    RectF(
                        (b.x + cos(a) * amp * (u - 0.5)).toFloat(), (b.y + sin(a) * amp * (u - 0.5)).toFloat(),
                        (b.x + b.w + cos(a) * amp * (u - 0.5)).toFloat(), (b.y + b.h + sin(a) * amp * (u - 0.5)).toFloat(),
                    ),
                    paint,
                )
            }
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        },
        "pageCurl" to { ctx, p, _ ->
            val b = box(ctx)
            val k = (p["amt"] ?: 50.0) / 100
            val curlW = b.w * 0.35f * k.toFloat()
            ctx.canvas.save()
            ctx.canvas.clipRect(b.x + b.w - curlW, b.y, b.x + b.w, b.y + b.h)
            ctx.canvas.translate(b.x + b.w, b.cy)
            ctx.canvas.scale(max(0.15f, (1 - k * 0.7).toFloat()), 1f)
            ctx.canvas.translate(-(b.x + b.w), -b.cy)
            val paint = Paint().apply { alpha = (0.85 * 255).roundToInt() }
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, paint)
            ctx.canvas.restore()
            val sh = LinearGradient(b.x + b.w - curlW, 0f, b.x + b.w, 0f, intArrayOf(rgba(0, 0, 0, 0.0), rgba(0, 0, 0, 0.45)), floatArrayOf(0f, 1f), Shader.TileMode.CLAMP)
            val sp = Paint().apply { shader = sh }
            ctx.canvas.drawRect(b.x + b.w - curlW, b.y, b.x + b.w, b.y + b.h, sp)
        },
        "cubeRotate" to { ctx, p, _ ->
            val b = box(ctx)
            val ph = ctx.time * (p["speed"] ?: 0.5) * PI * 2
            val k = cos(ph)
            val frontW = b.w * max(0.1f, abs(k).toFloat())
            val sideW = b.w * abs(sin(ph)).toFloat() * 0.35f
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.clipRect(b.x, b.y, b.x + frontW, b.y + b.h)
            ctx.canvas.drawBitmap(ctx.src, b.x, b.y, null)
            ctx.canvas.restore()
            val sx = if (k >= 0) b.x + frontW else b.x
            val dir = if (k >= 0) 1f else -1f
            val path = android.graphics.Path()
            path.moveTo(sx, b.y)
            path.lineTo(sx + sideW * dir, b.y + b.h * 0.08f)
            path.lineTo(sx + sideW * dir, b.y + b.h * 0.92f)
            path.lineTo(sx, b.y + b.h)
            path.close()
            ctx.canvas.drawPath(path, Paint().apply { color = rgba(0, 0, 0, 0.45) })
        },
        "mandala" to { ctx, p, _ ->
            val b = box(ctx)
            val n = max(2, (p["n"] ?: 6.0).roundToInt())
            clear(ctx)
            val paint = Paint().apply { alpha = (255.0 / max(1, n / 3)).roundToInt().coerceIn(1, 255) }
            for (i in 0 until n) {
                ctx.canvas.save()
                ctx.canvas.translate(b.cx, b.cy)
                ctx.canvas.rotate(((i / n.toDouble()) * 360).toFloat())
                ctx.canvas.translate(-b.cx, -b.cy)
                ctx.canvas.drawBitmap(ctx.src, 0f, 0f, paint)
                ctx.canvas.restore()
            }
        },
        "pixelSort" to { ctx, p, _ ->
            val bs = max(8, (p["size"] ?: 32.0).roundToInt())
            val w = ctx.w
            val h = ctx.h
            val px = IntArray(w * h)
            ctx.dst.getPixels(px, 0, w, 0, 0, w, h)
            for (y in 0 until h) {
                var x0 = 0
                while (x0 < w) {
                    val x1 = min(w, x0 + bs)
                    val idx = (x0 until x1).map { (y * w + it) * 4 }.toIntArray()
                    // مرتب‌سازی بر حسب روشنایی، با نگه‌داشتن RGBA
                    val vals = idx.map { o ->
                        val pi = o / 4
                        val c = px[pi]
                        val l = lum((c ushr 16) and 0xFF, (c ushr 8) and 0xFF, c and 0xFF)
                        doubleArrayOf(l, ((c ushr 16) and 0xFF).toDouble(), ((c ushr 8) and 0xFF).toDouble(), (c and 0xFF).toDouble(), ((c ushr 24) and 0xFF).toDouble())
                    }.sortedBy { it[0] }
                    idx.forEachIndexed { j, o ->
                        val pi = o / 4
                        px[pi] = argb(vals[j][4].roundToInt(), vals[j][1], vals[j][2], vals[j][3])
                    }
                    x0 = x1
                }
            }
            ctx.dst.setPixels(px, 0, w, 0, 0, w, h)
        },
        "tunnel" to { ctx, p, _ ->
            val b = box(ctx)
            val n = max(1, (p["n"] ?: 5.0).roundToInt())
            clear(ctx)
            for (i in n downTo 0) {
                val s = 1 - (i / (n + 1).toDouble()) * 0.8
                val paint = Paint().apply { alpha = if (i == 0) 255 else (0.5 * 255).roundToInt() }
                ctx.canvas.drawBitmap(
                    ctx.src,
                    Rect(b.x.roundToInt(), b.y.roundToInt(), (b.x + b.w).roundToInt(), (b.y + b.h).roundToInt()),
                    RectF((b.cx - b.w * s / 2).toFloat(), (b.cy - b.h * s / 2).toFloat(), (b.cx + b.w * s / 2).toFloat(), (b.cy + b.h * s / 2).toFloat()),
                    paint,
                )
            }
        },
        "infiniteZoom" to { ctx, p, _ ->
            val b = box(ctx)
            val u = (ctx.time * (p["speed"] ?: 1.0)) % 1
            val s = 1 + u * 0.6
            clear(ctx)
            val paint = Paint().apply { alpha = ((1 - u * 0.5) * 255).roundToInt() }
            ctx.canvas.drawBitmap(
                ctx.src,
                Rect(b.x.roundToInt(), b.y.roundToInt(), (b.x + b.w).roundToInt(), (b.y + b.h).roundToInt()),
                RectF((b.cx - b.w * s / 2).toFloat(), (b.cy - b.h * s / 2).toFloat(), (b.cx + b.w * s / 2).toFloat(), (b.cy + b.h * s / 2).toFloat()),
                paint,
            )
        },
        "spinZoom" to { ctx, p, _ ->
            val b = box(ctx)
            val s = 1 + sin(ctx.time * 2) * (p["amt"] ?: 20.0) / 100 * 0.3
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.translate(b.cx, b.cy)
            ctx.canvas.rotate((ctx.time * (p["speed"] ?: 0.5) * 360).toFloat())
            ctx.canvas.scale(s.toFloat(), s.toFloat())
            ctx.canvas.translate(-b.cx, -b.cy)
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
            ctx.canvas.restore()
        },
        "rippleRing" to { ctx, p, _ ->
            val b = box(ctx)
            val maxR = hypot(b.w.toDouble(), b.h.toDouble()) / 2
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                color = rgba(255, 255, 255, 0.6)
                strokeWidth = max(1f, 1f)
            }
            for (i in 0 until 5) {
                val u = ((ctx.time * (p["speed"] ?: 1.0) + i / 5.0) % 1)
                paint.alpha = ((1 - u) * min(1.0, (p["amt"] ?: 60.0) / 100) * 255).roundToInt()
                ctx.canvas.drawCircle(b.cx, b.cy, (u * maxR).toFloat(), paint)
            }
        },
        "gridWarp" to { ctx, p, _ ->
            val b = box(ctx)
            val step = 40f
            val a = (p["amt"] ?: 20.0) * 0.5
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                color = rgba(255, 255, 255, 0.35)
                strokeWidth = max(1f, 0.5f)
            }
            val path = android.graphics.Path()
            var x = b.x
            while (x <= b.x + b.w) {
                path.moveTo(x, b.y)
                var y = b.y
                while (y <= b.y + b.h) {
                    path.lineTo((x + sin(y * 0.02 + ctx.time) * a).toFloat(), y)
                    y += step / 2
                }
                x += step
            }
            var y = b.y
            while (y <= b.y + b.h) {
                path.moveTo(b.x, y)
                var xx = b.x
                while (xx <= b.x + b.w) {
                    path.lineTo(xx, (y + sin(xx * 0.02 + ctx.time) * a).toFloat())
                    xx += step / 2
                }
                y += step
            }
            ctx.canvas.drawPath(path, paint)
        },
        "heatHaze" to { ctx, p, _ ->
            val a = p["amt"] ?: 20.0
            ctx.warp { dx, dy -> Pair(dx + sin(dy * 0.05 + ctx.time * 3) * a * 0.3, dy) }
        },
        "liquid" to { ctx, p, _ ->
            val a = p["amt"] ?: 20.0
            ctx.warp { dx, dy ->
                Pair(
                    dx + sin(dy * 0.03 + ctx.time * 2) * a * 0.3,
                    dy + cos(dx * 0.03 + ctx.time * 2) * a * 0.3,
                )
            }
        },
        "shear" to { ctx, p, _ ->
            val b = box(ctx)
            val k = tan((p["amt"] ?: 20.0) * PI / 180)
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.translate(b.cx, b.cy)
            val m = Matrix()
            m.setValues(floatArrayOf(1f, 0f, k.toFloat(), 0f, 1f, 0f, 0f, 0f, 1f))
            ctx.canvas.concat(m)
            ctx.canvas.translate(-b.cx, -b.cy)
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
            ctx.canvas.restore()
        },
        "cylinder" to { ctx, p, _ ->
            val b = box(ctx)
            val r = b.w / 2
            ctx.warp { dx, dy ->
                val u = dx / r
                if (abs(u) >= 1) Pair(dx, dy)
                else {
                    val k = 1 - (p["amt"] ?: 60.0) / 100 * 0.5 * (1 - cos(u * PI / 2))
                    Pair(dx * k, dy)
                }
            }
        },
        "pixelWave" to { ctx, p, _ ->
            val b = box(ctx)
            val bs = 16
            val srcR = Rect(0, 0, 0, 0)
            val dstR = RectF()
            var x = b.x
            while (x < b.x + b.w) {
                val dy = (sin(x * 0.02 + ctx.time * 3) * (p["amt"] ?: 20.0) * 0.5).toFloat()
                srcR.set(x.roundToInt(), b.y.roundToInt(), min(ctx.w, x.roundToInt() + bs), (b.y + b.h).roundToInt())
                dstR.set(x, b.y + dy, min(ctx.w.toFloat(), x + bs), b.y + b.h + dy)
                ctx.canvas.drawBitmap(ctx.src, srcR, dstR, null)
                x += bs
            }
        },
        "warpWave" to { ctx, p, _ ->
            val a = p["amt"] ?: 20.0
            ctx.warp { dx, dy -> Pair(dx + sin(dy * 0.04 + ctx.time * 2) * a * 0.3, dy) }
        },
        "swirl" to { ctx, p, _ ->
            val b = box(ctx)
            val r = min(b.w, b.h) / 2
            val a = (p["amt"] ?: 80.0) / 100 * 4
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist >= r || dist < 0.5) Pair(dx, dy)
                else {
                    val ang = a * (1 - dist / r) * (1 - dist / r)
                    val c = cos(ang)
                    val s = sin(ang)
                    Pair(dx * c - dy * s, dx * s + dy * c)
                }
            }
        },
        "gridPulse" to { ctx, p, _ ->
            val b = box(ctx)
            val step = 40f
            val a = (0.5 + 0.5 * sin(ctx.time * 3)) * (p["amt"] ?: 40.0) / 100 * 0.5
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                color = rgba(255, 255, 255, a)
                strokeWidth = max(1f, 1f)
            }
            val path = android.graphics.Path()
            var x = b.x
            while (x <= b.x + b.w) {
                path.moveTo(x, b.y)
                path.lineTo(x, b.y + b.h)
                x += step
            }
            var y = b.y
            while (y <= b.y + b.h) {
                path.moveTo(b.x, y)
                path.lineTo(b.x + b.w, y)
                y += step
            }
            ctx.canvas.drawPath(path, paint)
        },
        "echoZoom" to { ctx, p, _ ->
            val b = box(ctx)
            val n = max(1, (p["n"] ?: 4.0).roundToInt())
            clear(ctx)
            for (i in n downTo 0) {
                val s = 1 - (i / (n + 1).toDouble()) * 0.4
                val paint = Paint().apply { alpha = if (i == 0) 255 else (0.4 * 255).roundToInt() }
                ctx.canvas.drawBitmap(
                    ctx.src,
                    Rect(b.x.roundToInt(), b.y.roundToInt(), (b.x + b.w).roundToInt(), (b.y + b.h).roundToInt()),
                    RectF((b.cx - b.w * s / 2).toFloat(), (b.cy - b.h * s / 2).toFloat(), (b.cx + b.w * s / 2).toFloat(), (b.cy + b.h * s / 2).toFloat()),
                    paint,
                )
            }
        },
        "focusPull" to { ctx, p, _ ->
            val blur = (0.5 + 0.5 * sin(ctx.time * 1.5)) * (p["amt"] ?: 20.0) * 0.2
            ctx.boxBlur(max(1, blur.roundToInt()))
        },
        "depthField" to { ctx, p, _ ->
            val tmp = blurredBmp(ctx, max(1, ((p["amt"] ?: 50.0) / 100 * 4).roundToInt()))
            clear(ctx)
            ctx.canvas.drawBitmap(tmp, 0f, 0f, null)
            tmp.recycle()
            val b = box(ctx)
            val r = min(b.w, b.h) * 0.35f
            ctx.canvas.save()
            ctx.canvas.clipRect(b.cx - r, b.cy - r, b.cx + r, b.cy + r)
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
            ctx.canvas.restore()
        },
        "waveShift" to { ctx, p, _ ->
            val b = box(ctx)
            val step = max(4, 4)
            ctx.canvas.save()
            ctx.canvas.clipRect(b.x, b.y, b.x + b.w, b.y + b.h)
            val srcR = Rect(0, 0, 0, 0)
            val dstR = RectF()
            var y = b.y
            while (y < b.y + b.h) {
                val off = (sin(y * 0.05 + ctx.time * 3) * (p["amt"] ?: 20.0) * 0.3).toFloat()
                val y2 = min(b.y + b.h, y + step)
                srcR.set(b.x.roundToInt(), y.roundToInt(), (b.x + b.w).roundToInt(), y2.roundToInt())
                dstR.set(b.x + off, y, b.x + b.w + off, y2)
                ctx.canvas.drawBitmap(ctx.src, srcR, dstR, null)
                y += step
            }
            ctx.canvas.restore()
        },
        "zoomSpin" to { ctx, p, _ ->
            val b = box(ctx)
            val a = sin(ctx.time * 2) * (p["amt"] ?: 30.0) / 100 * 0.5
            val s = 1 + sin(ctx.time * 2) * (p["amt"] ?: 30.0) / 100 * 0.2
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.translate(b.cx, b.cy)
            ctx.canvas.rotate((a * 180 / PI).toFloat())
            ctx.canvas.scale(s.toFloat(), s.toFloat())
            ctx.canvas.translate(-b.cx, -b.cy)
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
            ctx.canvas.restore()
        },
        "slideEcho" to { ctx, p, _ ->
            val n = max(1, (p["n"] ?: 4.0).roundToInt())
            clear(ctx)
            for (i in n downTo 0) {
                val paint = Paint().apply { alpha = if (i == 0) 255 else (0.35 * 255).roundToInt() }
                ctx.canvas.drawBitmap(ctx.src, i * 8f, 0f, paint)
            }
        },
        "blurPulse" to { ctx, p, _ ->
            val blur = (0.5 + 0.5 * sin(ctx.time * 6)) * (p["amt"] ?: 20.0) * 0.2
            ctx.boxBlur(max(1, blur.roundToInt()))
        },
        "mosaicPulse" to { ctx, p, _ ->
            val b = box(ctx)
            val size = max(2, ((10 + sin(ctx.time * 3) * 8) * (p["amt"] ?: 30.0) / 50).roundToInt())
            val sw = max(1, (b.w / size).toInt())
            val sh = max(1, (b.h / size).toInt())
            val small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
            val sc = Canvas(small)
            sc.drawBitmap(ctx.src, Rect(b.x.roundToInt(), b.y.roundToInt(), (b.x + b.w).roundToInt(), (b.y + b.h).roundToInt()), RectF(0f, 0f, sw.toFloat(), sh.toFloat()), null)
            ctx.canvas.drawBitmap(small, Rect(0, 0, sw, sh), RectF(b.x, b.y, b.x + b.w, b.y + b.h), Paint().apply { isFilterBitmap = false })
            small.recycle()
        },
        "ripplePulse" to { ctx, p, _ ->
            val a = (0.5 + 0.5 * sin(ctx.time * 2)) * (p["amt"] ?: 30.0) * 0.5
            val len = max(1.0, 40.0)
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist < 0.5) Pair(dx, dy)
                else {
                    val off = sin((dist / len) * PI * 2 - ctx.time * 3) * a
                    Pair(dx * (1 + off / dist), dy * (1 + off / dist))
                }
            }
        },
        "vortexPulse" to { ctx, p, _ ->
            val b = box(ctx)
            val r = min(b.w, b.h) / 2
            val a = (0.5 + 0.5 * sin(ctx.time * 2)) * (p["amt"] ?: 80.0) / 100 * 3
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist >= r || dist < 0.5) Pair(dx, dy)
                else {
                    val ang = a * (1 - dist / r)
                    val c = cos(ang)
                    val s = sin(ang)
                    Pair(dx * c - dy * s, dx * s + dy * c)
                }
            }
        },
        "shearPulse" to { ctx, p, _ ->
            val b = box(ctx)
            val k = sin(ctx.time * 2) * (p["amt"] ?: 30.0) / 100 * 0.5
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.translate(b.cx, b.cy)
            val m = Matrix()
            m.setValues(floatArrayOf(1f, 0f, k.toFloat(), 0f, 1f, 0f, 0f, 0f, 1f))
            ctx.canvas.concat(m)
            ctx.canvas.translate(-b.cx, -b.cy)
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
            ctx.canvas.restore()
        },
        "skewWave" to { ctx, p, _ ->
            val a = p["amt"] ?: 20.0
            ctx.warp { dx, dy ->
                Pair(
                    dx + sin(dy * 0.03 + ctx.time * 2) * a * 0.3,
                    dy + sin(dx * 0.03 + ctx.time * 2) * a * 0.3,
                )
            }
        },
        "tunnelSpin" to { ctx, p, _ ->
            val a = ctx.time * 0.5
            val zoom = 1 + (p["amt"] ?: 50.0) / 100 * 0.3
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist < 0.5) Pair(dx, dy)
                else {
                    val c = cos(a)
                    val s = sin(a)
                    Pair((dx * c - dy * s) / zoom, (dx * s + dy * c) / zoom)
                }
            }
        },
        "fadeZoom" to { ctx, p, _ ->
            val b = box(ctx)
            val u = (ctx.time % 2) / 2
            val s = 1 + u * (p["amt"] ?: 50.0) / 100
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.translate(b.cx, b.cy)
            ctx.canvas.scale(s.toFloat(), s.toFloat())
            ctx.canvas.translate(-b.cx, -b.cy)
            val paint = Paint().apply { alpha = ((1 - u * 0.5) * 255).roundToInt() }
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, paint)
            ctx.canvas.restore()
        },
        "spinFade" to { ctx, p, _ ->
            val b = box(ctx)
            val u = (ctx.time % 2) / 2
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.translate(b.cx, b.cy)
            ctx.canvas.rotate((u * PI * (p["amt"] ?: 50.0) / 50 * 180 / PI).toFloat())
            ctx.canvas.translate(-b.cx, -b.cy)
            val paint = Paint().apply { alpha = ((1 - u * 0.5) * 255).roundToInt() }
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, paint)
            ctx.canvas.restore()
        },
        "vignetteWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, min(b.w, b.h) * 0.3f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(0, 0, 0, 0.0), 1f to rgba(0, 0, 0, 0.8)), (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "waveRipple" to { ctx, p, _ ->
            val a = (p["amt"] ?: 20.0) * 0.3
            val len = max(1.0, 40.0)
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                val off = sin(dy * 0.05 + ctx.time * 3) * a * 0.5 + (if (dist < 0.5) 0.0 else sin((dist / len) * PI * 2 - ctx.time * 3) * a * 0.5)
                Pair(dx + off, dy + off * 0.3)
            }
        },
        "blackhole" to { ctx, p, _ ->
            val b = box(ctx)
            val r = min(b.w, b.h) / 2
            val a = (p["amt"] ?: 50.0) / 100 * 2
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist < 0.5) Pair(dx, dy)
                else {
                    val pull = 1 - (a * 0.3 * (1 - dist / (r * 2)))
                    Pair(dx * pull, dy * pull)
                }
            }
        },
        "wormhole" to { ctx, p, _ ->
            val a = ctx.time * 0.5
            val zoom = 1 + (p["amt"] ?: 50.0) / 100 * 0.5
            ctx.warp { dx, dy ->
                val dist = hypot(dx, dy)
                if (dist < 0.5) Pair(dx, dy)
                else {
                    val c = cos(a)
                    val s = sin(a)
                    Pair((dx * c - dy * s) / zoom, (dx * s + dy * c) / zoom)
                }
            }
        },
        "flipH" to { ctx, _, _ ->
            val b = box(ctx)
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.translate(b.cx, 0f)
            ctx.canvas.scale(-1f, 1f)
            ctx.canvas.translate(-b.cx, 0f)
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
            ctx.canvas.restore()
        },
        "flipV" to { ctx, _, _ ->
            val b = box(ctx)
            clear(ctx)
            ctx.canvas.save()
            ctx.canvas.translate(0f, b.cy)
            ctx.canvas.scale(1f, -1f)
            ctx.canvas.translate(0f, -b.cy)
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
            ctx.canvas.restore()
        },
        "perspective" to { ctx, p, _ ->
            val b = box(ctx)
            val k = (p["amt"] ?: 40.0) / 100
            val band = max(2, 2)
            val srcR = Rect(0, 0, 0, 0)
            val dstR = RectF()
            var y = b.y
            while (y < b.y + b.h) {
                val u = (y - b.y) / max(1f, b.h)
                val wScale = 1 - k * (0.5 - u) * 2 * 0.5
                val w2 = b.w * max(0.2, wScale)
                val x2 = b.cx - w2 / 2
                val y2 = min(b.y + b.h, y + band)
                srcR.set(b.x.roundToInt(), y.roundToInt(), (b.x + b.w).roundToInt(), y2.roundToInt())
                dstR.set(x2.toFloat(), y, (x2 + w2).toFloat(), y2)
                ctx.canvas.drawBitmap(ctx.src, srcR, dstR, null)
                y += band
            }
        },
        "tile" to { ctx, p, _ ->
            val b = box(ctx)
            val nx = max(1, (p["cols"] ?: 2.0).roundToInt())
            val ny = max(1, (p["rows"] ?: 2.0).roundToInt())
            ctx.canvas.save()
            ctx.canvas.clipRect(b.x, b.y, b.x + b.w, b.y + b.h)
            for (j in 0 until ny) for (i in 0 until nx) {
                ctx.canvas.drawBitmap(
                    ctx.src,
                    Rect(b.x.roundToInt(), b.y.roundToInt(), (b.x + b.w).roundToInt(), (b.y + b.h).roundToInt()),
                    RectF(b.x + i * b.w / nx, b.y + j * b.h / ny, b.x + (i + 1) * b.w / nx, b.y + (j + 1) * b.h / ny),
                    null,
                )
            }
            ctx.canvas.restore()
        },
        "wipe" to { ctx, p, _ ->
            val b = box(ctx)
            val prog = ((p["prog"] ?: 50.0) / 100).coerceIn(0.0, 1.0)
            if (prog <= 0) {
                clear(ctx)
                return@to
            }
            if (prog >= 1) return@to
            val a0 = (p["ang"] ?: 0.0) * PI / 180
            val r = hypot(b.w.toDouble(), b.h.toDouble())
            clear(ctx)
            val path = android.graphics.Path()
            path.moveTo(b.cx, b.cy)
            path.addArc(b.cx - r.toFloat(), b.cy - r.toFloat(), b.cx + r.toFloat(), b.cy + r.toFloat(), (a0 * 180 / PI).toFloat(), (prog * 360).toFloat())
            path.close()
            ctx.canvas.save()
            ctx.canvas.clipPath(path)
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
            ctx.canvas.restore()
        },
        "glitch" to { ctx, p, _ ->
            val mix = (p["beat"] ?: 60.0) / 100
            val amt = (p["amt"] ?: 40.0) / 100 * ((1 - mix) + mix * 0.0)
            val f0 = floor(ctx.time * (p["speed"] ?: 12.0))
            val bands = 14
            val srcR = Rect(0, 0, 0, 0)
            val dstR = RectF()
            for (i in 0 until bands) {
                val y = (i / bands.toDouble()) * ctx.h
                val h = ctx.h / bands + 1
                val rnd = hashFrac((f0 * 13.1 + i * 7.7) * 12.9898)
                val dx = if (rnd > 0.6) (rnd - 0.8) * ctx.w * 0.12 * amt else 0.0
                srcR.set(0, y.roundToInt(), ctx.w, min(ctx.h, (y + h).roundToInt()))
                dstR.set(dx.toFloat(), y.toFloat(), (ctx.w + dx).toFloat(), (y + h).toFloat())
                ctx.canvas.drawBitmap(ctx.src, srcR, dstR, null)
            }
        },
        "dataMosh" to { ctx, p, _ ->
            val b = box(ctx)
            val bs = 32
            val step = floor(ctx.time * 2).toInt()
            var y = b.y
            while (y < b.y + b.h) {
                var x = b.x
                while (x < b.x + b.w) {
                    val off = (hashFrac((x / bs) * 12.9898 + (y / bs) * 78.233 + step) - 0.5) * (p["amt"] ?: 50.0) / 100 * bs * 2
                    if (abs(off) > 2) {
                        ctx.canvas.drawBitmap(
                            ctx.src,
                            Rect(x.roundToInt(), y.roundToInt(), min(ctx.w, x.roundToInt() + bs), min(ctx.h, y.roundToInt() + bs)),
                            RectF(x + off.toFloat(), y, min(ctx.w.toFloat(), x + bs + off.toFloat()), min(ctx.h.toFloat(), y + bs)),
                            null,
                        )
                    }
                    x += bs
                }
                y += bs
            }
        },
        "rowShift" to { ctx, p, _ ->
            val b = box(ctx)
            val band = 8
            val step = floor(ctx.time * 8).toInt()
            val srcR = Rect(0, 0, 0, 0)
            val dstR = RectF()
            var y = b.y
            while (y < b.y + b.h) {
                val off = (hashFrac((y / band) * 12.9898 + step) - 0.5) * (p["amt"] ?: 30.0) / 100 * b.w * 0.3
                if (abs(off) > 2) {
                    srcR.set(b.x.roundToInt(), y.roundToInt(), (b.x + b.w).roundToInt(), min(ctx.h, y.roundToInt() + band))
                    dstR.set(b.x + off.toFloat(), y, b.x + b.w + off.toFloat(), min(ctx.h.toFloat(), y + band))
                    ctx.canvas.drawBitmap(ctx.src, srcR, dstR, null)
                }
                y += band
            }
        },
        "shatter" to { ctx, p, _ ->
            val b = box(ctx)
            val bs = 48
            var y = b.y
            while (y < b.y + b.h) {
                var x = b.x
                while (x < b.x + b.w) {
                    val drop = ((hashFrac((x / bs) * 12.9898 + (y / bs) * 78.233) * b.h + ctx.time * (p["speed"] ?: 1.0) * 200) % (b.h + bs))
                    val dy = drop * (p["amt"] ?: 50.0) / 100
                    if (dy > 4) {
                        ctx.canvas.drawBitmap(
                            ctx.src,
                            Rect(x.roundToInt(), y.roundToInt(), min(ctx.w, x.roundToInt() + bs), min(ctx.h, y.roundToInt() + bs)),
                            RectF(x, y + dy.toFloat(), min(ctx.w.toFloat(), x + bs), min(ctx.h.toFloat(), y + bs + dy.toFloat())),
                            null,
                        )
                    }
                    x += bs
                }
                y += bs
            }
        },
        "vhs" to { ctx, p, _ ->
            val k = (p["amt"] ?: 60.0) / 100
            // نرم‌کردن: تاری + اشباع/کنتراست بیشتر روی کپی
            val soft = blurredBmp(ctx, max(1, (0.8 * k).roundToInt()))
            val stctx = FxCtx(ctx.w, ctx.h, ctx.time, soft, soft)
            stctx.pixelOpChannels { r, g, b, a ->
                val l = lum(r, g, b)
                val s = 1 + 0.4 * k
                val c = 1 + 0.1 * k
                val nr = (l + (r - l) * s)
                val ng = (l + (g - l) * s)
                val nb = (l + (b - l) * s)
                argb(a, (nr - 128) * c + 128, (ng - 128) * c + 128, (nb - 128) * c + 128)
            }
            clear(ctx)
            // جداسازی RGB روی کپی نرم
            val dx = cos(0.0) * (1 + 5 * k)
            val dy = sin(0.0) * (1 + 5 * k)
            val add = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD) }
            for ((col, kk) in listOf(Color.RED to 1.0, Color.GREEN to 0.0, Color.BLUE to -1.0)) {
                val tmp = Bitmap.createBitmap(ctx.w, ctx.h, Bitmap.Config.ARGB_8888)
                val tc = Canvas(tmp)
                tc.drawBitmap(soft, 0f, 0f, null)
                val mp = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.MULTIPLY); color = col }
                tc.drawRect(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat(), mp)
                val dp = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
                tc.drawBitmap(soft, 0f, 0f, dp)
                ctx.canvas.drawBitmap(tmp, (dx * kk).toFloat(), (dy * kk).toFloat(), add)
                tmp.recycle()
            }
            soft.recycle()
            // نوار ترکینگ
            val b = box(ctx)
            val bh = max(4f, b.h * 0.07f)
            val by = b.y + (((ctx.time * 0.23) % 1.3) - 0.15) * b.h
            val snap = ctx.dst.copy(Bitmap.Config.ARGB_8888, false)
            val shift = (ctx.noise(ctx.time * 9) * 10 + 6) * k
            ctx.canvas.save()
            ctx.canvas.clipRect(0f, by.toFloat(), ctx.w.toFloat(), (by + bh).toFloat())
            ctx.canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
            ctx.canvas.drawBitmap(snap, shift.toFloat(), 0f, null)
            ctx.canvas.restore()
            snap.recycle()
            if ((p["lines"] ?: 50.0) > 0) {
                val lp = Paint().apply {
                    alpha = (((p["lines"] ?: 50.0) / 100 * 0.35) * 255).roundToInt()
                    xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP)
                    color = Color.BLACK
                }
                val gap = max(2f, 3f)
                var y = b.y - gap
                while (y < b.y + b.h) {
                    ctx.canvas.drawRect(b.x, y, b.x + b.w, y + gap / 2, lp)
                    y += gap.toFloat()
                }
                val wp = Paint().apply { alpha = (0.05 * k * 255).roundToInt(); color = Color.WHITE }
                ctx.canvas.drawRect(b.x, (by + bh * 0.4).toFloat(), b.x + b.w, (by + bh * 0.4).toFloat() + 1f, wp)
            }
        },
        "scan" to { ctx, p, _ ->
            val b = box(ctx)
            val gap = max(2.0, p["gap"] ?: 4.0)
            val off = (((ctx.time * (p["speed"] ?: 20.0)) % gap + gap) % gap)
            val paint = Paint().apply {
                alpha = (((p["op"] ?: 35.0) / 100) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP)
                color = Color.BLACK
            }
            var y = b.y - gap + off
            while (y < b.y + b.h) {
                ctx.canvas.drawRect(b.x, y.toFloat(), b.x + b.w, (y + gap / 2).toFloat(), paint)
                y += gap.toFloat()
            }
        },
        "scanlines" to { ctx, p, _ ->
            val b = box(ctx)
            val gap = max(2.0, p["gap"] ?: 4.0)
            val paint = Paint().apply {
                alpha = (((p["amount"] ?: 0.3)) * 255).roundToInt().coerceIn(0, 255)
                xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP)
                color = Color.BLACK
            }
            var y = b.y
            while (y < b.y + b.h) {
                ctx.canvas.drawRect(b.x, y.toFloat(), b.x + b.w, (y + gap / 2).toFloat(), paint)
                y += gap.toFloat()
            }
        },
        "scanSweep" to { ctx, p, _ ->
            val b = box(ctx)
            val u = (ctx.time * (p["speed"] ?: 1.0)) % 1
            val y0 = b.y + u * b.h
            val band = b.h * 0.1f
            val sh = LinearGradient(0f, (y0 - band).toFloat(), 0f, (y0 + band).toFloat(), intArrayOf(rgba(255, 255, 255, 0.0), rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.0)), floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
            ctx.canvas.drawRect(b.x, (y0 - band).toFloat(), b.x + b.w, (y0 + band).toFloat(), Paint().apply { shader = sh })
        },
        "scanNoise" to { ctx, p, _ ->
            val b = box(ctx)
            val n = ((p["amt"] ?: 30.0) / 10).roundToInt()
            val paint = Paint().apply { alpha = (0.3 * 255).roundToInt(); color = Color.WHITE }
            val step = floor(ctx.time * 12).toInt()
            for (i in 0 until n) {
                val y = b.y + hashFrac(i * 12.9898 + step) * b.h
                ctx.canvas.drawRect(b.x, y.toFloat(), b.x + b.w, y.toFloat() + 1f, paint)
            }
        },
        "vhsTracking" to { ctx, p, _ ->
            val b = box(ctx)
            val u = (ctx.time * 0.5) % 1
            val y0 = b.y + u * b.h
            val band = max(4f, b.h * 0.08f)
            val off = (sin(floor(ctx.time * 4) * 12.9898) * 20 * (p["amt"] ?: 50.0) / 100).toFloat()
            ctx.canvas.drawBitmap(
                ctx.src,
                Rect(b.x.roundToInt(), y0.roundToInt(), (b.x + b.w).roundToInt(), min(ctx.h, (y0 + band).roundToInt())),
                RectF(b.x + off, y0.toFloat(), b.x + b.w + off, (y0 + band).toFloat()),
                null,
            )
            ctx.canvas.drawRect(b.x, y0.toFloat(), b.x + b.w, (y0 + 1).toFloat(), Paint().apply { alpha = (0.4 * 255).roundToInt(); color = Color.WHITE })
        },
        "halftone" to { ctx, p, tp ->
            val b = box(ctx)
            var s = max(2.0, p["size"] ?: 10.0)
            if ((b.w / s) * (b.h / s) > 30000) s = sqrt((b.w * b.h) / 30000.0)
            val sw = max(1, (b.w / s).toInt())
            val sh = max(1, (b.h / s).toInt())
            val small = Bitmap.createBitmap(sw, sh, Bitmap.Config.ARGB_8888)
            val sc = Canvas(small)
            sc.drawBitmap(ctx.src, Rect(b.x.roundToInt(), b.y.roundToInt(), (b.x + b.w).roundToInt(), (b.y + b.h).roundToInt()), RectF(0f, 0f, sw.toFloat(), sh.toFloat()), null)
            val q = IntArray(sw * sh)
            small.getPixels(q, 0, sw, 0, 0, sw, sh)
            small.recycle()
            val fc = ctx.parseColor(tp["color"] ?: "#00000000")
            val fa = (fc ushr 24) and 0xFF
            val own = fa < 0.02 * 255
            clear(ctx)
            val paint = Paint()
            if (!own) {
                paint.color = fc
            }
            for (j in 0 until sh) for (i in 0 until sw) {
                val o = j * sw + i
                val c = q[o]
                val al = ((c ushr 24) and 0xFF) / 255.0
                if (al < 0.03) continue
                val l = lum((c ushr 16) and 0xFF, (c ushr 8) and 0xFF, c and 0xFF) / 255
                val r = if (own) s * 0.56 * sqrt(al) * (1 - l * 0.45) else s * 0.62 * sqrt(al * (1 - l))
                if (r < 0.3) continue
                if (own) paint.color = c or (255 shl 24)
                ctx.canvas.drawCircle((b.x + (i + 0.5) * s).toFloat(), (b.y + (j + 0.5) * s).toFloat(), r.toFloat(), paint)
            }
        },
        "grid" to { ctx, p, tp ->
            val b = box(ctx)
            val s = max(2.0, p["size"] ?: 60.0)
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                alpha = (((p["op"] ?: 35.0) / 100) * 255).roundToInt()
                color = ctx.parseColor(tp["color"] ?: "#FFFFFF")
                strokeWidth = max(1f, 1f)
            }
            ctx.canvas.save()
            ctx.canvas.clipRect(b.x, b.y, b.x + b.w, b.y + b.h)
            val path = android.graphics.Path()
            var x = b.x
            while (x <= b.x + b.w) {
                path.moveTo(x, b.y)
                path.lineTo(x, b.y + b.h)
                x += s.toFloat()
            }
            var y = b.y
            while (y <= b.y + b.h) {
                path.moveTo(b.x, y)
                path.lineTo(b.x + b.w, y)
                y += s.toFloat()
            }
            ctx.canvas.drawPath(path, paint)
            ctx.canvas.restore()
        },
        "checker" to { ctx, p, _ ->
            val b = box(ctx)
            val s = max(2.0, p["size"] ?: 40.0)
            val paint = Paint().apply {
                alpha = (((p["op"] ?: 40.0) / 100) * 255).roundToInt()
                color = Color.WHITE
            }
            ctx.canvas.save()
            ctx.canvas.clipRect(b.x, b.y, b.x + b.w, b.y + b.h)
            var y = 0
            while (y * s < b.h) {
                var x = 0
                while (x * s < b.w) {
                    if ((x + y) % 2 == 0) ctx.canvas.drawRect(b.x + x * s.toFloat(), b.y + y * s.toFloat(), b.x + (x + 1) * s.toFloat(), b.y + (y + 1) * s.toFloat(), paint)
                    x++
                }
                y++
            }
            ctx.canvas.restore()
        },
        "feather" to { ctx, p, _ ->
            val reps = max(1, ((p["r"] ?: 20.0) / 20).roundToInt())
            val w = ctx.w
            val h = ctx.h
            repeat(reps) {
                val px = IntArray(w * h)
                ctx.dst.getPixels(px, 0, w, 0, 0, w, h)
                val snap = px.copyOf()
                val at = { x: Int, y: Int ->
                    val xx = x.coerceIn(0, w - 1)
                    val yy = y.coerceIn(0, h - 1)
                    (snap[yy * w + xx] ushr 24) and 0xFF
                }
                for (y in 0 until h) for (x in 0 until w) {
                    val o = y * w + x
                    val a = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) + at(x, y) * 4) / 8
                    px[o] = (a shl 24) or (px[o] and 0x00FFFFFF)
                }
                ctx.dst.setPixels(px, 0, w, 0, 0, w, h)
            }
        },
        "innerShadow" to { ctx, p, tp ->
            val tmp = ctx.tinted(ctx.parseColor(tp["color"] ?: "#000000"))
            val blurred = blurBitmap(tmp, max(1, (p["r"] ?: 16.0).roundToInt()))
            tmp.recycle()
            val paint = Paint().apply {
                alpha = (((p["op"] ?: 60.0) / 100) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP)
            }
            ctx.canvas.drawBitmap(blurred, 0f, 0f, paint)
            blurred.recycle()
        },
        "echo" to { ctx, p, _ ->
            val b = box(ctx)
            val n = max(1, (p["n"] ?: 4.0).roundToInt())
            clear(ctx)
            for (i in n downTo 1) {
                val paint = Paint().apply { alpha = (0.35 * (1 - i / (n + 1.0)) * 255).roundToInt() }
                ctx.canvas.drawBitmap(
                    ctx.src,
                    Rect(b.x.roundToInt(), b.y.roundToInt(), (b.x + b.w).roundToInt(), (b.y + b.h).roundToInt()),
                    RectF((b.x - (p["amt"] ?: 20.0) * i * 0.5).toFloat(), (b.y - (p["amt"] ?: 20.0) * i * 0.2).toFloat(), (b.x + b.w - (p["amt"] ?: 20.0) * i * 0.5).toFloat(), (b.y + b.h - (p["amt"] ?: 20.0) * i * 0.2).toFloat()),
                    paint,
                )
            }
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        },

        // ── نور و سایه (ترکیب‌بندی) ──
        "glow" to { ctx, p, tp ->
            // وب: شعاع از v.r می‌خواند که در رجیستری نیست؛ اینجا شعاع = amount
            val r = max(1, (p["amount"] ?: 16.0).roundToInt())
            val tint = ctx.tinted(ctx.parseColor(tp["color"] ?: "#FFFFFF"))
            val blurred = blurBitmap(tint, r)
            tint.recycle()
            clear(ctx)
            val add = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD) }
            var k = (p["amount"] ?: 16.0) / 100
            while (k > 0.001) {
                add.alpha = (min(1.0, k) * 255).roundToInt()
                ctx.canvas.drawBitmap(blurred, 0f, 0f, add)
                k -= 1
            }
            blurred.recycle()
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        },
        "textGlow" to { ctx, p, tp ->
            val r = max(1, (p["amount"] ?: 12.0).roundToInt())
            val tint = ctx.tinted(ctx.parseColor(tp["color"] ?: "#F16586"))
            val blurred = blurBitmap(tint, r)
            tint.recycle()
            clear(ctx)
            val add = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD) }
            var k = (p["amount"] ?: 12.0) / 100
            while (k > 0.001) {
                add.alpha = (min(1.0, k) * 255).roundToInt()
                ctx.canvas.drawBitmap(blurred, 0f, 0f, add)
                k -= 1
            }
            blurred.recycle()
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        },
        "shadow" to { ctx, p, tp ->
            val r = max(1, (p["r"] ?: 16.0).roundToInt())
            val tint = blurredTinted(ctx, r, tp["color"] ?: "#000000")
            clear(ctx)
            val paint = Paint().apply { alpha = (((p["op"] ?: 75.0) / 100) * 255).roundToInt() }
            ctx.canvas.drawBitmap(tint, (p["dx"] ?: 10.0).toFloat(), (p["dy"] ?: 12.0).toFloat(), paint)
            tint.recycle()
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        },
        "dropShadow" to { ctx, p, tp ->
            val r = max(1, (p["blur"] ?: 8.0).roundToInt())
            val tint = blurredTinted(ctx, r, tp["color"] ?: "#000000")
            clear(ctx)
            ctx.canvas.drawBitmap(tint, (p["dx"] ?: 4.0).toFloat(), (p["dy"] ?: 4.0).toFloat(), null)
            tint.recycle()
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        },
        "outline" to { ctx, p, tp ->
            val r = p["w"] ?: 6.0
            if (r > 0.2) {
                val t = ctx.tinted(ctx.parseColor(tp["color"] ?: "#FFFFFF"))
                val n = if (r > 6) 24 else 16
                val radii = if (r > 6) listOf(r, r * 0.5) else listOf(r)
                clear(ctx)
                for (rr in radii) {
                    for (i in 0 until n) {
                        val a = (i / n.toDouble()) * PI * 2
                        ctx.canvas.drawBitmap(t, (cos(a) * rr).toFloat(), (sin(a) * rr).toFloat(), null)
                    }
                }
                t.recycle()
            }
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        },
        "extrude" to { ctx, p, tp ->
            val l = p["len"] ?: 18.0
            val col = ctx.parseColor(tp["color"] ?: "#8A0A18")
            val t = ctx.tinted(ctx.parseColor(tp["color"] ?: "#8A0A18"))
            val a = (p["ang"] ?: 45.0) * PI / 180
            val n = max(1, min(36, (l / max(1.5, 1.5)).toInt()))
            val acc = Bitmap.createBitmap(ctx.w, ctx.h, Bitmap.Config.ARGB_8888)
            val ac = Canvas(acc)
            for (i in n downTo 1) {
                val k = (i / n.toDouble()) * l
                ac.drawBitmap(t, (cos(a) * k).toFloat(), (sin(a) * k).toFloat(), null)
            }
            // لبهٔ جلویی روشن‌تر
            val front = Paint().apply { alpha = (0.35 * 255).roundToInt() }
            ac.drawBitmap(t, (cos(a) * l / n).toFloat(), (sin(a) * l / n).toFloat(), front)
            t.recycle()
            clear(ctx)
            val paint = Paint().apply { alpha = (col ushr 24) and 0xFF }
            ctx.canvas.drawBitmap(acc, 0f, 0f, paint)
            acc.recycle()
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        },
        "longShadow" to { ctx, p, tp ->
            val l = p["len"] ?: 80.0
            val col = ctx.parseColor(tp["color"] ?: "#00000066")
            val t = ctx.tinted(ctx.parseColor(tp["color"] ?: "#00000066"))
            val a = (p["ang"] ?: 45.0) * PI / 180
            val n = max(1, min(36, (l / max(1.5, 1.5)).toInt()))
            val acc = Bitmap.createBitmap(ctx.w, ctx.h, Bitmap.Config.ARGB_8888)
            val ac = Canvas(acc)
            for (i in n downTo 1) {
                val k = (i / n.toDouble()) * l
                ac.drawBitmap(t, (cos(a) * k).toFloat(), (sin(a) * k).toFloat(), null)
            }
            t.recycle()
            clear(ctx)
            val paint = Paint().apply { alpha = (col ushr 24) and 0xFF }
            ctx.canvas.drawBitmap(acc, 0f, 0f, paint)
            acc.recycle()
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        },
        "vignette" to { ctx, p, _ ->
            // وب: size/amt می‌خواند که در رجیستری نیست (amount=0.5)؛ اینجا amount = شدت ۰ تا ۱
            val b = box(ctx)
            val r = hypot(b.w.toDouble(), b.h.toDouble()) / 2
            radialOverlay(
                ctx, b.cx, b.cy, (r * 0.36).toFloat(), r.toFloat(),
                arrayOf(0f to rgba(0, 0, 0, 0.0), 1f to rgba(0, 0, 0, 1.0)),
                (p["amount"] ?: 0.5).coerceIn(0.0, 1.0),
            )
        },
        "halo" to { ctx, p, _ ->
            val b = box(ctx)
            val r = min(b.w, b.h) * 0.45f
            radialOverlay(
                ctx, b.cx, b.cy, r * 0.7f, r,
                arrayOf(
                    0f to rgba(255, 255, 255, 0.0), 0.85f to rgba(255, 255, 255, 0.5), 1f to rgba(255, 255, 255, 0.0),
                ),
                min(1.0, (p["amt"] ?: 60.0) / 100) * 0.6,
            )
        },
        "bloom" to { ctx, p, _ ->
            val tmp = blurredBmp(ctx, max(1, ((p["amt"] ?: 50.0) / 100 * 4).roundToInt()))
            val paint = Paint().apply {
                alpha = (min(1.0, (p["amt"] ?: 50.0) / 100) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
            }
            ctx.canvas.drawBitmap(tmp, 0f, 0f, paint)
            tmp.recycle()
        },
        "softFocus" to { ctx, p, _ ->
            val tmp = blurredBmp(ctx, max(1, ((p["amt"] ?: 50.0) / 100 * 4).roundToInt()))
            val paint = Paint().apply { alpha = (0.5 * 255).roundToInt() }
            ctx.canvas.drawBitmap(tmp, 0f, 0f, paint)
            tmp.recycle()
        },
        "shine" to { ctx, p, tp ->
            val per = max(0.3, p["every"] ?: 2.0)
            val ph = (ctx.time % per) / per
            val u = ph / min(0.9, 0.35 + 0.3 / per)
            if (u <= 1) {
                val b = box(ctx)
                val diag = hypot(b.w.toDouble(), b.h.toDouble()) / 2 + 2
                val wpx = max(2.0, (p["width"] ?: 18.0) / 100 * b.w)
                val x = -diag - wpx + u * (2 * diag + 2 * wpx)
                val col = ctx.parseColor(tp["color"] ?: "#FFFFFF")
                val cr = (col ushr 16) and 0xFF
                val cg = (col ushr 8) and 0xFF
                val cb = col and 0xFF
                val op = (p["op"] ?: 80.0) / 100
                val sh = LinearGradient(
                    (x - wpx).toFloat(), 0f, (x + wpx).toFloat(), 0f,
                    intArrayOf(rgba(cr, cg, cb, 0.0), rgba(cr, cg, cb, op), rgba(cr, cg, cb, 0.0)),
                    floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP,
                )
                ctx.canvas.save()
                ctx.canvas.translate(b.cx, b.cy)
                ctx.canvas.rotate((p["ang"] ?: 20.0).toFloat())
                ctx.canvas.translate(-b.cx, -b.cy)
                val paint = Paint().apply {
                    shader = sh
                    xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP)
                }
                ctx.canvas.drawRect((x - wpx).toFloat(), (b.cy - diag * 2).toFloat(), (x + wpx).toFloat(), (b.cy + diag * 2).toFloat(), paint)
                ctx.canvas.restore()
            }
        },
        "leak" to { ctx, p, tp ->
            val b = box(ctx)
            val r = max(b.w, b.h)
            val lk = Bitmap.createBitmap(ctx.w, ctx.h, Bitmap.Config.ARGB_8888)
            val lx = Canvas(lk)
            val sp = ctx.time * (p["speed"] ?: 30.0) / 100
            val blobs = listOf(
                Triple(tp["color"] ?: "#FF6A2A", 0.2, 0.8),
                Triple(tp["color2"] ?: "#FFD36B", 7.3, 0.6),
                Triple(tp["color"] ?: "#FF6A2A", 13.1, 0.45),
            )
            val add = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD) }
            for ((colHex, seed, rr) in blobs) {
                val col = ctx.parseColor(colHex)
                val cr = (col ushr 16) and 0xFF
                val cg = (col ushr 8) and 0xFF
                val cb = col and 0xFF
                val bx = (b.cx + ctx.noise(sp + seed) * b.w * 0.6).toFloat()
                val by = (b.cy + ctx.noise(sp * 0.8 + seed + 40) * b.h * 0.6).toFloat()
                val rad = (r * rr).toFloat()
                val sh = RadialGradient(
                    bx, by, rad,
                    intArrayOf(rgba(cr, cg, cb, 0.9), rgba(cr, cg, cb, 0.0)),
                    floatArrayOf(0f, 1f), Shader.TileMode.CLAMP,
                )
                val paint = Paint().apply { shader = sh; xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD) }
                lx.drawRect(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat(), paint)
            }
            // ماسک با خود لایه
            val dp = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
            lx.drawBitmap(ctx.src, 0f, 0f, dp)
            val paint = Paint().apply {
                alpha = (((p["amt"] ?: 60.0) / 100) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN)
            }
            ctx.canvas.drawBitmap(lk, 0f, 0f, paint)
            lk.recycle()
        },
        "lightSweep" to { ctx, p, tp ->
            val b = box(ctx)
            val band = b.w * 0.3f
            val u = (ctx.time * (p["speed"] ?: 1.0)) % 1
            val x0 = b.x - band + u * (b.w + band * 2)
            val sh = LinearGradient(
                x0.toFloat(), 0f, (x0 + band).toFloat(), 0f,
                intArrayOf(rgba(255, 255, 255, 0.0), rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.0)),
                floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP,
            )
            val paint = Paint().apply {
                shader = sh
                alpha = (min(1.0, (p["amt"] ?: 60.0) / 100) * 0.6 * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
            }
            ctx.canvas.drawRect(x0.toFloat(), b.y, (x0 + band).toFloat(), b.y + b.h, paint)
        },
        "lightLeak" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.x, b.y, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() * 0.6f,
                arrayOf(0f to rgba(255, 200, 120, 0.8), 1f to rgba(255, 200, 120, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "lensFlare" to { ctx, p, tp ->
            val b = box(ctx)
            val col = ctx.parseColor(tp["color"] ?: "#FFD36B")
            val cr = (col ushr 16) and 0xFF
            val cg = (col ushr 8) and 0xFF
            val cb = col and 0xFF
            val r = min(b.w, b.h) * 0.4f
            radialOverlay(
                ctx, b.cx, b.cy - b.h * 0.2f, 0f, r,
                arrayOf(0f to rgba(cr, cg, cb, 1.0), 1f to rgba(0, 0, 0, 0.0)),
                min(1.0, (p["amt"] ?: 70.0) / 100),
            )
        },
        "solarFlare" to { ctx, p, _ ->
            val b = box(ctx)
            val pulse = 0.7 + 0.3 * sin(ctx.time * 3)
            val r = (min(b.w, b.h) * 0.4 * pulse).toFloat()
            radialOverlay(
                ctx, b.cx, b.cy, 0f, r,
                arrayOf(
                    0f to rgba(255, 240, 180, 0.9), 0.4f to rgba(255, 200, 80, 0.4), 1f to rgba(255, 200, 80, 0.0),
                ),
                min(1.0, (p["amt"] ?: 70.0) / 100),
            )
        },
        "starburst" to { ctx, p, _ ->
            val b = box(ctx)
            val n = max(4, (p["n"] ?: 12.0).roundToInt())
            val r = hypot(b.w.toDouble(), b.h.toDouble()) / 2
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                alpha = (min(1.0, (p["amt"] ?: 60.0) / 100) * 0.7 * 255).roundToInt()
                color = Color.WHITE
                strokeWidth = max(1f, 1f)
            }
            val path = android.graphics.Path()
            for (i in 0 until n) {
                val a = (i / n.toDouble()) * PI * 2
                path.moveTo(b.cx, b.cy)
                path.lineTo((b.cx + cos(a) * r).toFloat(), (b.cy + sin(a) * r).toFloat())
            }
            ctx.canvas.drawPath(path, paint)
        },
        "lightRays" to { ctx, p, _ ->
            val b = box(ctx)
            val n = max(4, (p["n"] ?: 12.0).roundToInt())
            val r = hypot(b.w.toDouble(), b.h.toDouble()) / 2
            val rot = ctx.time * (p["speed"] ?: 0.5)
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                alpha = (0.35 * 255).roundToInt()
                color = Color.WHITE
                strokeWidth = max(1f, 1f)
            }
            val path = android.graphics.Path()
            for (i in 0 until n) {
                val a = (i / n.toDouble()) * PI * 2 + rot
                path.moveTo(b.cx, b.cy)
                path.lineTo((b.cx + cos(a) * r).toFloat(), (b.cy + sin(a) * r).toFloat())
            }
            ctx.canvas.drawPath(path, paint)
        },
        "electric" to { ctx, p, _ ->
            val b = box(ctx)
            val step = floor(ctx.time * 6).toInt()
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                alpha = (min(1.0, (p["amt"] ?: 70.0) / 100) * 255).roundToInt()
                color = rgba(200, 230, 255, 0.9)
                strokeWidth = max(1f, 2f)
            }
            var x = b.cx
            val path = android.graphics.Path()
            path.moveTo(x, b.y)
            var y = b.y
            while (y < b.y + b.h) {
                x += ((hashFrac((y / 10) * 12.9898 + step) - 0.5) * b.w * 0.15f).toFloat()
                path.lineTo(x, y)
                y += max(8f, b.h / 12)
            }
            ctx.canvas.drawPath(path, paint)
        },
        "smoke" to { ctx, p, _ ->
            val b = box(ctx)
            val paint = Paint()
            for (i in 0 until 6) {
                val fx = (b.x + ((hashFrac(i * 12.9898) * b.w + ctx.time * 10) % b.w)).toFloat()
                val fy = (b.y + hashFrac2(i.toDouble()) * b.h).toFloat()
                val r = ((30 + hashFrac(i * 12.9898) * 60)).toFloat()
                val sh = RadialGradient(
                    fx, fy, r,
                    intArrayOf(rgba(200, 200, 200, 0.5), rgba(200, 200, 200, 0.0)),
                    floatArrayOf(0f, 1f), Shader.TileMode.CLAMP,
                )
                paint.shader = sh
                paint.alpha = (((p["amt"] ?: 40.0) / 100 * 0.25) * 255).roundToInt()
                ctx.canvas.drawCircle(fx, fy, r, paint)
            }
        },
        "dust" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 40.0).roundToInt()
            val paint = Paint().apply { color = rgba(255, 255, 255, 0.7) }
            for (i in 0 until n) {
                val fx = (b.x + ((hashFrac(i * 12.9898) * b.w + sin(ctx.time + i) * 20) % b.w)).toFloat()
                val fy = (b.y + ((hashFrac2(i.toDouble()) * b.h + cos(ctx.time * 0.7 + i) * 15) % b.h)).toFloat()
                ctx.canvas.drawRect(fx, fy, fx + 1f, fy + 1f, paint)
            }
        },
        "rain" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 40.0).roundToInt()
            val a = (p["ang"] ?: 15.0) * PI / 180
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                color = rgba(200, 220, 255, 0.5)
                strokeWidth = max(1f, 1f)
            }
            val path = android.graphics.Path()
            for (i in 0 until n) {
                val fx = (b.x + hashFrac(i * 12.9898) * (b.w + 100)).toFloat()
                val fy = (b.y + (((hashFrac2(i.toDouble()) * b.h + ctx.time * (p["speed"] ?: 60.0)) % (b.h + 40)) - 20)).toFloat()
                val len = 18f
                path.moveTo(fx, fy)
                path.lineTo((fx + sin(a) * len).toFloat(), (fy + cos(a) * len).toFloat())
            }
            ctx.canvas.save()
            ctx.canvas.clipRect(b.x, b.y, b.x + b.w, b.y + b.h)
            ctx.canvas.drawPath(path, paint)
            ctx.canvas.restore()
        },
        "snow" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 40.0).roundToInt()
            val paint = Paint().apply { color = rgba(255, 255, 255, 0.85) }
            for (i in 0 until n) {
                val fx = (b.x + hashFrac(i * 12.9898) * b.w).toFloat()
                val fy = (b.y + (((hashFrac2(i.toDouble()) * b.h + ctx.time * (p["speed"] ?: 50.0) * 0.5) % (b.h + 20)) - 10)).toFloat()
                val r = max(1f, (1 + hashFrac(i * 12.9898) * 2).toFloat())
                ctx.canvas.drawCircle(fx, fy, r, paint)
            }
        },
        "confetti" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 40.0).roundToInt()
            val cols = intArrayOf(
                ctx.parseColor("#E4142A"), ctx.parseColor("#FFD84D"), ctx.parseColor("#4DD8FF"),
                ctx.parseColor("#7CFF6B"), ctx.parseColor("#FF7AD9"),
            )
            for (i in 0 until n) {
                val fx = (b.x + hashFrac(i * 12.9898) * b.w).toFloat()
                val fy = (b.y + (((hashFrac2(i.toDouble()) * b.h + ctx.time * (p["speed"] ?: 60.0)) % (b.h + 30)) - 15)).toFloat()
                ctx.canvas.save()
                ctx.canvas.translate(fx, fy)
                ctx.canvas.rotate((ctx.time * 2 + i).toFloat() * 180f / PI.toFloat())
                ctx.canvas.drawRect(-4f, -2f, 4f, 2f, Paint().apply { color = cols[i % cols.size] })
                ctx.canvas.restore()
            }
        },
        "fireflies" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 30.0).roundToInt()
            for (i in 0 until n) {
                val fx = (b.cx + sin(ctx.time * 0.7 + i * 1.3) * b.w * 0.4 * (hashFrac(i * 12.9898) + 0.2)).toFloat()
                val fy = (b.cy + cos(ctx.time * 0.9 + i * 0.7) * b.h * 0.4 * (hashFrac2(i.toDouble()) + 0.2)).toFloat()
                val a = 0.4 + 0.6 * abs(sin(ctx.time * 2 + i))
                ctx.canvas.drawCircle(fx, fy, 3f, Paint().apply { color = rgba(255, 220, 120, a) })
            }
        },
        "bokeh" to { ctx, p, _ ->
            val b = box(ctx)
            val n = 14
            for (i in 0 until n) {
                val fx = (b.x + hashFrac(i * 12.9898) * b.w).toFloat()
                val fy = (b.y + hashFrac2(i.toDouble()) * b.h).toFloat()
                val r = ((10 + hashFrac(i * 12.9898) * 30)).toFloat()
                radialOverlay(
                    ctx, fx, fy, 0f, r,
                    arrayOf(0f to rgba(255, 255, 255, 0.7), 1f to rgba(255, 255, 255, 0.0)),
                    min(1.0, (p["amt"] ?: 50.0) / 100) * 0.5,
                )
            }
        },
        "beatFlash" to { ctx, p, tp ->
            // در وب ضرب‌آهنگ (0||0) همیشه صفر است؛ اینجا با پالس زمانی جایگزین شده است.
            val k = ((0.5 + 0.5 * sin(ctx.time * 4)) * (p["amt"] ?: 80.0) / 100).coerceIn(0.0, 3.0)
            if (k > 0.01) {
                ctx.pixelOpChannels { r, g, b, a -> argb(a, r * (1 + k * 0.8), g * (1 + k * 0.8), b * (1 + k * 0.8)) }
                val paint = Paint().apply {
                    alpha = (min(0.75, k * 0.45) * 255).roundToInt()
                    xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_ATOP)
                    color = ctx.parseColor(tp["color"] ?: "#FFFFFF")
                }
                ctx.canvas.drawRect(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat(), paint)
            }
        },
        "strobeFlash" to { ctx, p, _ ->
            if (floor(ctx.time * 8).toInt() % 2 == 0) {
                val b = box(ctx)
                val paint = Paint().apply {
                    alpha = (((p["amt"] ?: 80.0) / 100) * 255).roundToInt()
                    color = Color.BLACK
                }
                ctx.canvas.drawRect(b.x, b.y, b.x + b.w, b.y + b.h, paint)
            }
        },
        "flicker" to { ctx, p, _ ->
            val h = hashFrac(floor(ctx.time * 24) * 12.9898)
            val k = 1 + (h - 0.5) * (p["amt"] ?: 30.0) / 100 * 0.6
            ctx.pixelOpChannels { r, g, b, a -> argb(a, r * k, g * k, b * k) }
        },
        "chromaticPulse" to { ctx, p, _ ->
            val off = (1 + sin(ctx.time * 4)) * 0.5 * (p["amt"] ?: 20.0) * 0.5
            val o = off.roundToInt()
            neighborOp(ctx) { at, x, y ->
                val a = at(x, y, 3)
                argb(a, at(x - o, y, 0), at(x, y, 1), at(x + o, y, 2))
            }
        },
        "glowPulse" to { ctx, p, _ ->
            val tmp = blurredBmp(ctx, 6)
            val paint = Paint().apply {
                alpha = (min(1.0, (p["amt"] ?: 60.0) / 100) * (0.5 + 0.5 * abs(sin(ctx.time * 2))) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
            }
            ctx.canvas.drawBitmap(tmp, 0f, 0f, paint)
            tmp.recycle()
        },
        "vignettePulse" to { ctx, p, _ ->
            val b = box(ctx)
            val pulse = 0.5 + 0.5 * sin(ctx.time * 2)
            radialOverlay(
                ctx, b.cx, b.cy, min(b.w, b.h) * 0.3f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(0, 0, 0, 0.0), 1f to rgba(0, 0, 0, 0.8)),
                (p["amt"] ?: 50.0) / 100 * 0.5 * pulse,
            )
        },
        "grainPulse" to { ctx, p, _ ->
            noiseOverlay(ctx, (p["amt"] ?: 30.0) / 100 * 0.2 * (0.5 + 0.5 * sin(ctx.time * 3)), PorterDuff.Mode.SRC_OVER)
        },
        "shadowPulse" to { ctx, p, _ ->
            val pulse = 0.5 + 0.5 * sin(ctx.time * 2)
            val tmp = blurredBmp(ctx, 8)
            val black = Bitmap.createBitmap(ctx.w, ctx.h, Bitmap.Config.ARGB_8888)
            val bc = Canvas(black)
            bc.drawBitmap(tmp, 0f, 0f, null)
            tmp.recycle()
            val bp = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN); color = Color.BLACK }
            bc.drawRect(0f, 0f, ctx.w.toFloat(), ctx.h.toFloat(), bp)
            clear(ctx)
            val paint = Paint().apply { alpha = (((p["amt"] ?: 50.0) / 100 * 0.6 * pulse) * 255).roundToInt() }
            ctx.canvas.drawBitmap(black, (p["dx"] ?: 10.0).toFloat(), (p["dy"] ?: 12.0).toFloat(), paint)
            black.recycle()
            ctx.canvas.drawBitmap(ctx.src, 0f, 0f, null)
        },
        "neonPulse" to { ctx, p, tp ->
            val tmp = blurredTinted(ctx, 8, tp["color"] ?: "#00E5FF")
            val paint = Paint().apply {
                alpha = (min(1.0, (p["amt"] ?: 80.0) / 100) * (0.5 + 0.5 * sin(ctx.time * 3)) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
            }
            ctx.canvas.drawBitmap(tmp, 0f, 0f, paint)
            tmp.recycle()
        },
        "haloPulse" to { ctx, p, _ ->
            val b = box(ctx)
            val pulse = 0.5 + 0.5 * sin(ctx.time * 2)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, min(b.w, b.h) * 0.5f * (1 + pulse * 0.3).toFloat(),
                arrayOf(0f to rgba(255, 255, 200, 0.8), 1f to rgba(255, 255, 200, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.4 * pulse,
            )
        },
        "fireGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(255, 120, 0, 0.7), 0.5f to rgba(255, 60, 0, 0.3), 1f to rgba(255, 60, 0, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "iceGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(120, 200, 255, 0.7), 0.5f to rgba(0, 120, 255, 0.3), 1f to rgba(0, 120, 255, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "starPulse" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 30.0).roundToInt()
            val paint = Paint().apply { color = Color.WHITE }
            for (i in 0 until n) {
                val fx = (b.x + hashFrac(i * 12.9898) * b.w).toFloat()
                val fy = (b.y + hashFrac2(i.toDouble()) * b.h).toFloat()
                val s = (2 + 3 * abs(sin(ctx.time * 2 + i))).toFloat()
                paint.alpha = ((0.4 + 0.6 * abs(sin(ctx.time * 2 + i * 1.3))) * 255).roundToInt()
                ctx.canvas.drawRect(fx - s / 2, fy, fx + s / 2, fy + 1f, paint)
                ctx.canvas.drawRect(fx, fy - s / 2, fx + 1f, fy + s / 2, paint)
            }
        },
        "sunsetGlow" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x, b.y + b.h,
                arrayOf(
                    0f to rgba(255, 120, 0, 0.6), 0.5f to rgba(255, 80, 120, 0.4), 1f to rgba(120, 0, 120, 0.5),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.4,
            )
        },
        "moonGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(220, 230, 255, 0.7), 1f to rgba(220, 230, 255, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.4,
            )
        },
        "cometTrail" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 20.0).roundToInt()
            val u = (ctx.time % 3) / 3
            for (i in 0 until n) {
                val fx = (b.x + ((hashFrac(i * 12.9898) * b.w + u * b.w * 0.5) % b.w)).toFloat()
                val fy = (b.y + hashFrac2(i.toDouble()) * b.h).toFloat()
                ctx.canvas.drawCircle(fx, fy, 3f, Paint().apply { alpha = (0.8 * 255).roundToInt(); color = Color.WHITE })
                ctx.canvas.drawRect(fx - 20f, fy - 0.5f, fx, fy + 0.5f, Paint().apply { alpha = (0.3 * 255).roundToInt(); color = Color.WHITE })
            }
        },
        "emberGlow" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 30.0).roundToInt()
            val u = (ctx.time % 2) / 2
            val paint = Paint().apply { color = rgba(255, 140, 0, 0.9) }
            for (i in 0 until n) {
                val fx = (b.x + hashFrac(i * 12.9898) * b.w).toFloat()
                val fy = (b.y + b.h - ((hashFrac2(i.toDouble()) * b.h + u * b.h * 0.5) % b.h)).toFloat()
                paint.alpha = ((0.3 + 0.7 * (1 - u)) * 255).roundToInt()
                ctx.canvas.drawCircle(fx, fy, 2f, paint)
            }
        },
        "frostGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, min(b.w, b.h) * 0.3f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 255, 0.0), 1f to rgba(180, 220, 255, 0.8)),
                (p["amt"] ?: 50.0) / 100 * 0.4,
            )
        },
        "pulseRing" to { ctx, p, _ ->
            val b = box(ctx)
            val u = (ctx.time % 2) / 2
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                color = rgba(255, 255, 255, 0.7)
                strokeWidth = max(1f, 2f)
            }
            for (i in 0 until 3) {
                val uu = (u + i / 3.0) % 1
                paint.alpha = ((1 - uu) * (p["amt"] ?: 50.0) / 100 * 255).roundToInt()
                ctx.canvas.drawCircle(b.cx, b.cy, (uu * min(b.w, b.h) * 0.5).toFloat(), paint)
            }
        },
        "auroraWave" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x, (b.y + b.h + sin(ctx.time * 2) * 20).toFloat(),
                arrayOf(
                    0f to rgba(0, 255, 180, 0.7), 0.5f to rgba(0, 120, 255, 0.5), 1f to rgba(120, 0, 255, 0.6),
                ),
                (p["amt"] ?: 40.0) / 100 * 0.35, PorterDuff.Mode.OVERLAY,
            )
        },
        "galaxyGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(180, 120, 255, 0.7), 0.5f to rgba(80, 0, 180, 0.3), 1f to rgba(80, 0, 180, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "cometPulse" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 15.0).roundToInt()
            val u = (ctx.time % 3) / 3
            val pulse = 0.5 + 0.5 * sin(ctx.time * 3)
            for (i in 0 until n) {
                val fx = (b.x + ((hashFrac(i * 12.9898) * b.w + u * b.w * 0.5) % b.w)).toFloat()
                val fy = (b.y + hashFrac2(i.toDouble()) * b.h).toFloat()
                ctx.canvas.drawCircle(fx, fy, 3f, Paint().apply { alpha = ((0.5 + 0.5 * pulse) * 255).roundToInt(); color = Color.WHITE })
                ctx.canvas.drawRect(fx - 20f, fy - 0.5f, fx, fy + 0.5f, Paint().apply { alpha = (0.25 * pulse * 255).roundToInt(); color = Color.WHITE })
            }
        },
        "mistGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 255, 0.6), 1f to rgba(255, 255, 255, 0.0)),
                (p["amt"] ?: 40.0) / 100 * 0.3,
            )
        },
        "solarGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(255, 220, 80, 0.8), 0.5f to rgba(255, 160, 0, 0.3), 1f to rgba(255, 160, 0, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "lunarGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(220, 230, 255, 0.8), 0.5f to rgba(140, 170, 255, 0.3), 1f to rgba(140, 170, 255, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "stormCloud" to { ctx, p, _ ->
            val b = box(ctx)
            for (i in 0 until 5) {
                val fx = (b.x + ((hashFrac(i * 12.9898) * b.w + ctx.time * 8) % b.w)).toFloat()
                val fy = (b.y + hashFrac2(i.toDouble()) * b.h * 0.5).toFloat()
                val r = ((30 + hashFrac(i * 12.9898) * 50)).toFloat()
                radialOverlay(
                    ctx, fx, fy, 0f, r,
                    arrayOf(0f to rgba(60, 60, 70, 0.6), 1f to rgba(60, 60, 70, 0.0)),
                    (p["amt"] ?: 40.0) / 100 * 0.25,
                )
            }
        },
        "crystalGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(220, 240, 255, 0.8), 0.5f to rgba(120, 180, 255, 0.3), 1f to rgba(120, 180, 255, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "coralGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(255, 140, 120, 0.8), 0.5f to rgba(255, 80, 100, 0.3), 1f to rgba(255, 80, 100, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "mintGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(180, 255, 200, 0.8), 0.5f to rgba(80, 220, 140, 0.3), 1f to rgba(80, 220, 140, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "amberGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(255, 200, 80, 0.8), 0.5f to rgba(255, 160, 0, 0.3), 1f to rgba(255, 160, 0, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "tealGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(120, 230, 220, 0.8), 0.5f to rgba(0, 180, 170, 0.3), 1f to rgba(0, 180, 170, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "violetGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(200, 140, 255, 0.8), 0.5f to rgba(120, 0, 220, 0.3), 1f to rgba(120, 0, 220, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "rgb" to { ctx, p, _ ->
            ctx.rgbSplit(p["amt"] ?: 8.0, (p["ang"] ?: 0.0) * PI / 180)
        },

        // ── خانواده‌های *Wave / *Glow / *Pulse ──
        "glowWave" to { ctx, p, _ ->
            rowWave(ctx, 10.0)
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 200, 0.7), 1f to rgba(255, 255, 200, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.4,
            )
        },
        "glowRing" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            val u = (ctx.time % 2) / 2
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                color = rgba(255, 255, 180, 0.8)
                strokeWidth = max(1f, 2f)
            }
            for (i in 0 until 3) {
                val uu = (u + i / 3.0) % 1
                paint.alpha = ((1 - uu) * (p["amt"] ?: 50.0) / 100 * 255).roundToInt()
                ctx.canvas.drawCircle(b.cx, b.cy, (uu * min(b.w, b.h) * 0.5).toFloat(), paint)
            }
        },
        "neonWave" to { ctx, p, tp ->
            rowWave(ctx, 10.0)
            val tmp = blurredTinted(ctx, 8, tp["color"] ?: "#FF2D78")
            val paint = Paint().apply {
                alpha = (min(1.0, (p["amt"] ?: 80.0) / 100) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
            }
            ctx.canvas.drawBitmap(tmp, 0f, 0f, paint)
            tmp.recycle()
        },
        "neonSign" to { ctx, p, tp ->
            val tmp = blurredTinted(ctx, 8, tp["color"] ?: "#FF2D78")
            val paint = Paint().apply {
                alpha = (min(1.0, (p["amt"] ?: 80.0) / 100) * 255).roundToInt()
                xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
            }
            ctx.canvas.drawBitmap(tmp, 0f, 0f, paint)
            tmp.recycle()
        },
        "auroraGlow" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x, b.y + b.h,
                arrayOf(
                    0f to rgba(0, 255, 180, 0.7), 0.5f to rgba(0, 120, 255, 0.5), 1f to rgba(120, 0, 255, 0.6),
                ),
                (p["amt"] ?: 40.0) / 100 * 0.35, PorterDuff.Mode.OVERLAY,
            )
        },
        "sunsetWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x, b.y + b.h,
                arrayOf(0f to rgba(255, 120, 0, 0.6), 1f to rgba(120, 0, 120, 0.5)),
                (p["amt"] ?: 40.0) / 100 * 0.35,
            )
        },
        "oceanGlow" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x, b.y + b.h,
                arrayOf(0f to rgba(0, 180, 255, 0.7), 1f to rgba(0, 40, 120, 0.6)),
                (p["amt"] ?: 40.0) / 100 * 0.35, PorterDuff.Mode.OVERLAY,
            )
        },
        "mistWave" to { ctx, p, _ ->
            rowWave(ctx, 6.0)
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 255, 0.6), 1f to rgba(255, 255, 255, 0.0)),
                (p["amt"] ?: 40.0) / 100 * 0.25,
            )
        },
        "stormGlow" to { ctx, p, _ ->
            val b = box(ctx)
            for (i in 0 until 5) {
                val fx = (b.x + ((hashFrac(i * 12.9898) * b.w + ctx.time * 8) % b.w)).toFloat()
                val fy = (b.y + hashFrac2(i.toDouble()) * b.h * 0.5).toFloat()
                val r = ((30 + hashFrac(i * 12.9898) * 50)).toFloat()
                radialOverlay(
                    ctx, fx, fy, 0f, r,
                    arrayOf(0f to rgba(60, 60, 70, 0.6), 1f to rgba(60, 60, 70, 0.0)),
                    (p["amt"] ?: 40.0) / 100 * 0.25,
                )
            }
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 200, 0.6), 1f to rgba(255, 255, 200, 0.0)),
                (p["amt"] ?: 40.0) / 100 * 0.3,
            )
        },
        "emberWave" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 30.0).roundToInt()
            val u = (ctx.time % 2) / 2
            val paint = Paint().apply { color = rgba(255, 140, 0, 0.9) }
            for (i in 0 until n) {
                val fx = (b.x + ((hashFrac(i * 12.9898) * b.w + sin(ctx.time + i) * 10) % b.w)).toFloat()
                val fy = (b.y + b.h - ((hashFrac2(i.toDouble()) * b.h + u * b.h * 0.5) % b.h)).toFloat()
                paint.alpha = ((0.3 + 0.7 * (1 - u)) * 255).roundToInt()
                ctx.canvas.drawCircle(fx, fy, 2f, paint)
            }
        },
        "frostWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, min(b.w, b.h) * 0.3f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 255, 0.0), 1f to rgba(180, 220, 255, 0.8)),
                (p["amt"] ?: 50.0) / 100 * 0.4,
            )
        },
        "pulseGlow" to { ctx, p, _ ->
            val b = box(ctx)
            val pulse = 0.5 + 0.5 * sin(ctx.time * 2)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 200, 0.8), 1f to rgba(255, 255, 200, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.5 * pulse,
            )
        },
        "ringGlow" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            val u = (ctx.time % 2) / 2
            val paint = Paint().apply {
                style = Paint.Style.STROKE
                color = rgba(255, 255, 180, 0.8)
                strokeWidth = max(1f, 2f)
            }
            for (i in 0 until 3) {
                val uu = (u + i / 3.0) % 1
                paint.alpha = ((1 - uu) * (p["amt"] ?: 50.0) / 100 * 255).roundToInt()
                ctx.canvas.drawCircle(b.cx, b.cy, (uu * min(b.w, b.h) * 0.5).toFloat(), paint)
            }
        },
        "starGlow" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 30.0).roundToInt()
            val paint = Paint().apply { color = Color.WHITE }
            for (i in 0 until n) {
                val fx = (b.x + hashFrac(i * 12.9898) * b.w).toFloat()
                val fy = (b.y + hashFrac2(i.toDouble()) * b.h).toFloat()
                val s = (2 + 3 * abs(sin(ctx.time * 2 + i))).toFloat()
                paint.alpha = ((0.4 + 0.6 * abs(sin(ctx.time * 2 + i * 1.3))) * 255).roundToInt()
                ctx.canvas.drawRect(fx - s / 2, fy, fx + s / 2, fy + 1f, paint)
                ctx.canvas.drawRect(fx, fy - s / 2, fx + 1f, fy + s / 2, paint)
            }
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 220, 0.6), 1f to rgba(255, 255, 220, 0.0)),
                (p["amt"] ?: 30.0) / 100 * 0.3,
            )
        },
        "cometGlow" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 15.0).roundToInt()
            val u = (ctx.time % 3) / 3
            for (i in 0 until n) {
                val fx = (b.x + ((hashFrac(i * 12.9898) * b.w + u * b.w * 0.5) % b.w)).toFloat()
                val fy = (b.y + hashFrac2(i.toDouble()) * b.h).toFloat()
                ctx.canvas.drawCircle(fx, fy, 3f, Paint().apply { alpha = (0.8 * 255).roundToInt(); color = Color.WHITE })
                ctx.canvas.drawRect(fx - 20f, fy - 0.5f, fx, fy + 0.5f, Paint().apply { alpha = (0.3 * 255).roundToInt(); color = Color.WHITE })
            }
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(220, 230, 255, 0.6), 1f to rgba(220, 230, 255, 0.0)),
                (p["amt"] ?: 15.0) / 100 * 0.3,
            )
        },
        "moonWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(220, 230, 255, 0.7), 1f to rgba(220, 230, 255, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.4,
            )
        },
        "sunWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 220, 80, 0.8), 1f to rgba(255, 220, 80, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.4,
            )
        },
        "nebulaGlow" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(
                    0f to rgba(255, 120, 220, 0.7), 0.5f to rgba(120, 0, 220, 0.3), 1f to rgba(120, 0, 220, 0.0),
                ),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "quasarGlow" to { ctx, p, _ ->
            val b = box(ctx)
            val pulse = 0.5 + 0.5 * sin(ctx.time * 3)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 255, 0.9), 1f to rgba(255, 255, 255, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.5 * pulse,
            )
        },
        "eclipseGlow" to { ctx, p, _ ->
            val b = box(ctx)
            val r = min(b.w, b.h) * 0.3f
            val paint = Paint().apply {
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.6) * 255).roundToInt()
                color = rgba(0, 0, 0, 0.7)
            }
            ctx.canvas.drawCircle(b.cx, b.cy, r, paint)
            val ring = Paint().apply {
                style = Paint.Style.STROKE
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.6) * 255).roundToInt()
                color = rgba(255, 220, 120, 0.9)
                strokeWidth = max(1f, 3f)
            }
            ctx.canvas.drawCircle(b.cx, b.cy, r + 4f, ring)
        },
        "supernova" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 50.0).roundToInt()
            val u = (ctx.time % 2) / 2
            val paint = Paint().apply { color = rgba(255, 240, 180, 0.9) }
            for (i in 0 until n) {
                val a = (i / n.toDouble()) * PI * 2
                val r = u * min(b.w, b.h) * 0.45
                paint.alpha = ((1 - u) * 0.8 * 255).roundToInt()
                ctx.canvas.drawCircle((b.cx + cos(a) * r).toFloat(), (b.cy + sin(a) * r).toFloat(), 3f, paint)
            }
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 220, 0.9), 1f to rgba(255, 255, 220, 0.0)),
                (1 - u) * (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "stardust" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 40.0).roundToInt()
            val paint = Paint().apply { color = rgba(255, 255, 255, 0.8) }
            for (i in 0 until n) {
                val fx = (b.x + ((hashFrac(i * 12.9898) * b.w + sin(ctx.time + i) * 15) % b.w)).toFloat()
                val fy = (b.y + ((hashFrac2(i.toDouble()) * b.h + cos(ctx.time * 0.7 + i) * 10) % b.h)).toFloat()
                paint.alpha = ((0.3 + 0.7 * abs(sin(ctx.time * 2 + i))) * 255).roundToInt()
                ctx.canvas.drawRect(fx, fy, fx + 1f, fy + 1f, paint)
            }
        },
        "lunarEclipse" to { ctx, p, _ ->
            val b = box(ctx)
            val r = min(b.w, b.h) * 0.3f
            val paint = Paint().apply {
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.6) * 255).roundToInt()
                color = rgba(20, 20, 30, 0.85)
            }
            ctx.canvas.drawCircle(b.cx, b.cy, r, paint)
            val ring = Paint().apply {
                style = Paint.Style.STROKE
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.6) * 255).roundToInt()
                color = rgba(220, 230, 255, 0.9)
                strokeWidth = max(1f, 3f)
            }
            ctx.canvas.drawCircle(b.cx, b.cy, r + 4f, ring)
        },
        "auroraPulse" to { ctx, p, _ ->
            val b = box(ctx)
            val pulse = 0.5 + 0.5 * sin(ctx.time * 2)
            linearOverlay(
                ctx, b.x, b.y, b.x, b.y + b.h,
                arrayOf(
                    0f to rgba(0, 255, 180, 0.7), 0.5f to rgba(0, 120, 255, 0.5), 1f to rgba(120, 0, 255, 0.6),
                ),
                (p["amt"] ?: 40.0) / 100 * 0.35 * pulse, PorterDuff.Mode.OVERLAY,
            )
        },
        "galaxyWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(180, 120, 255, 0.7), 1f to rgba(180, 120, 255, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "nebulaWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 120, 220, 0.7), 1f to rgba(255, 120, 220, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.5,
            )
        },
        "quasarWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 255, 0.9), 1f to rgba(255, 255, 255, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.5 * (0.5 + 0.5 * sin(ctx.time * 3)),
            )
        },
        "supernovaWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            val u = (ctx.time % 2) / 2
            val n = (p["amt"] ?: 50.0).roundToInt()
            val paint = Paint().apply { color = rgba(255, 240, 180, 0.9) }
            for (i in 0 until n) {
                val a = (i / n.toDouble()) * PI * 2
                val r = u * min(b.w, b.h) * 0.45
                paint.alpha = ((1 - u) * 0.8 * 255).roundToInt()
                ctx.canvas.drawCircle((b.cx + cos(a) * r).toFloat(), (b.cy + sin(a) * r).toFloat(), 3f, paint)
            }
        },
        "cosmosGlow" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x, b.y + b.h,
                arrayOf(
                    0f to rgba(120, 0, 255, 0.7), 0.5f to rgba(0, 120, 255, 0.5), 1f to rgba(255, 0, 180, 0.6),
                ),
                (p["amt"] ?: 40.0) / 100 * 0.35, PorterDuff.Mode.OVERLAY,
            )
        },
        "eclipseWave" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            val r = min(b.w, b.h) * 0.3f
            val paint = Paint().apply {
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.6) * 255).roundToInt()
                color = rgba(0, 0, 0, 0.7)
            }
            ctx.canvas.drawCircle(b.cx, b.cy, r, paint)
            val ring = Paint().apply {
                style = Paint.Style.STROKE
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.6) * 255).roundToInt()
                color = rgba(255, 220, 120, 0.9)
                strokeWidth = max(1f, 3f)
            }
            ctx.canvas.drawCircle(b.cx, b.cy, r + 4f, ring)
        },
        "solarEclipse" to { ctx, p, _ ->
            val b = box(ctx)
            val r = min(b.w, b.h) * 0.3f
            val paint = Paint().apply {
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.6) * 255).roundToInt()
                color = rgba(0, 0, 0, 0.9)
            }
            ctx.canvas.drawCircle(b.cx, b.cy, r, paint)
            val ring = Paint().apply {
                style = Paint.Style.STROKE
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.6) * 255).roundToInt()
                color = rgba(255, 240, 180, 0.9)
                strokeWidth = max(1f, 4f)
            }
            ctx.canvas.drawCircle(b.cx, b.cy, r + 6f, ring)
        },
        "auroraWavePulse" to { ctx, p, _ ->
            rowWave(ctx, 8.0)
            val b = box(ctx)
            val pulse = 0.5 + 0.5 * sin(ctx.time * 2)
            linearOverlay(
                ctx, b.x, b.y, b.x, b.y + b.h,
                arrayOf(
                    0f to rgba(0, 255, 180, 0.7), 0.5f to rgba(0, 120, 255, 0.5), 1f to rgba(120, 0, 255, 0.6),
                ),
                (p["amt"] ?: 40.0) / 100 * 0.35 * pulse, PorterDuff.Mode.OVERLAY,
            )
        },
        "galaxyPulse" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(180, 120, 255, 0.7), 1f to rgba(180, 120, 255, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.5 * (0.5 + 0.5 * sin(ctx.time * 2)),
            )
        },
        "nebulaPulse" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 120, 220, 0.7), 1f to rgba(255, 120, 220, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.5 * (0.5 + 0.5 * sin(ctx.time * 2)),
            )
        },
        "quasarPulse" to { ctx, p, _ ->
            val b = box(ctx)
            radialOverlay(
                ctx, b.cx, b.cy, 0f, hypot(b.w.toDouble(), b.h.toDouble()).toFloat() / 2,
                arrayOf(0f to rgba(255, 255, 255, 0.9), 1f to rgba(255, 255, 255, 0.0)),
                (p["amt"] ?: 50.0) / 100 * 0.5 * (0.5 + 0.5 * sin(ctx.time * 4)),
            )
        },
        "supernovaPulse" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 50.0).roundToInt()
            val u = (ctx.time % 2) / 2
            val pulse = 0.5 + 0.5 * sin(ctx.time * 3)
            val paint = Paint().apply { color = rgba(255, 240, 180, 0.9) }
            for (i in 0 until n) {
                val a = (i / n.toDouble()) * PI * 2
                val r = u * min(b.w, b.h) * 0.45
                paint.alpha = ((1 - u) * 0.8 * pulse * 255).roundToInt()
                ctx.canvas.drawCircle((b.cx + cos(a) * r).toFloat(), (b.cy + sin(a) * r).toFloat(), 3f, paint)
            }
        },
        "cosmosPulse" to { ctx, p, _ ->
            val b = box(ctx)
            linearOverlay(
                ctx, b.x, b.y, b.x, b.y + b.h,
                arrayOf(
                    0f to rgba(120, 0, 255, 0.7), 0.5f to rgba(0, 120, 255, 0.5), 1f to rgba(255, 0, 180, 0.6),
                ),
                (p["amt"] ?: 40.0) / 100 * 0.35 * (0.5 + 0.5 * sin(ctx.time * 2)), PorterDuff.Mode.OVERLAY,
            )
        },
        "eclipsePulse" to { ctx, p, _ ->
            val b = box(ctx)
            val r = min(b.w, b.h) * 0.3f
            val pulse = 0.5 + 0.5 * sin(ctx.time * 2)
            val paint = Paint().apply {
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.6 * pulse) * 255).roundToInt()
                color = rgba(0, 0, 0, 0.7)
            }
            ctx.canvas.drawCircle(b.cx, b.cy, r, paint)
            val ring = Paint().apply {
                style = Paint.Style.STROKE
                alpha = (((p["amt"] ?: 50.0) / 100 * 0.6 * pulse) * 255).roundToInt()
                color = rgba(255, 220, 120, 0.9)
                strokeWidth = max(1f, 3f)
            }
            ctx.canvas.drawCircle(b.cx, b.cy, r + 4f, ring)
        },
        "burst" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 50.0).roundToInt()
            val u = (ctx.time % 2) / 2
            val paint = Paint().apply { color = rgba(255, 240, 180, 0.9) }
            for (i in 0 until n) {
                val a = (i / n.toDouble()) * PI * 2
                val r = u * min(b.w, b.h) * 0.45
                paint.alpha = ((1 - u) * 0.8 * 255).roundToInt()
                ctx.canvas.drawCircle((b.cx + cos(a) * r).toFloat(), (b.cy + sin(a) * r).toFloat(), 3f, paint)
            }
        },
        "sparkle" to { ctx, p, _ ->
            val b = box(ctx)
            val n = (p["amt"] ?: 40.0).roundToInt()
            val paint = Paint().apply { color = Color.WHITE }
            for (i in 0 until n) {
                val fx = (b.x + hashFrac(i * 12.9898) * b.w).toFloat()
                val fy = (b.y + hashFrac2(i.toDouble()) * b.h).toFloat()
                paint.alpha = ((0.3 + 0.7 * abs(sin(ctx.time * 2 + i * 1.7))) * 255).roundToInt()
                val s = (2 + hashFrac(i * 12.9898) * 4).toFloat()
                ctx.canvas.drawRect(fx - s / 2, fy, fx + s / 2, fy + 1f, paint)
                ctx.canvas.drawRect(fx, fy - s / 2, fx + 1f, fy + s / 2, paint)
            }
        },
    )
}
