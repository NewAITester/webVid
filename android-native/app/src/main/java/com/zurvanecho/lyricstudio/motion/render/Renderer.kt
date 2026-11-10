package com.zurvanecho.lyricstudio.motion.render

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.TextUnitType
import com.zurvanecho.lyricstudio.motion.core.FilterParams
import com.zurvanecho.lyricstudio.motion.core.cameraZoomAt
import com.zurvanecho.lyricstudio.motion.core.effectParamsAt
import com.zurvanecho.lyricstudio.motion.core.filterParamsFor
import com.zurvanecho.lyricstudio.motion.core.isActive
import com.zurvanecho.lyricstudio.motion.core.isFxOn
import com.zurvanecho.lyricstudio.motion.core.layerOpacity
import com.zurvanecho.lyricstudio.motion.core.layerTransform
import com.zurvanecho.lyricstudio.motion.core.repeatOf
import com.zurvanecho.lyricstudio.motion.core.shapePath
import com.zurvanecho.lyricstudio.motion.core.visibleLayers
import com.zurvanecho.lyricstudio.motion.model.Layer
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.ui.theme.LyricStudioFont
import com.zurvanecho.lyricstudio.motion.ui.theme.hexColor
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * ترکیب‌کنندهٔ صحنه — پورت renderFrame از src/render/renderer.js (نسخهٔ وب).
 * همان ترتیب و همان ریاضی: پایین آرایه عقب، بالا جلو؛ دوربین سراسری؛
 * ماسک below/belowInv؛ تکرارکننده؛ فیلتر رنگ (ColorMatrix)؛ گروه‌ها؛ مدیا.
 *
 * مسیر سریع: لایهٔ بدون ماسک/فیلتر/تکرار/ترکیب مستقیم رسم می‌شود.
 * مسیر کند: لایه به بیت‌مپِ خارج‌صفحه رندر و بعد ترکیب می‌شود (مثل وب).
 */
object Renderer {

    fun DrawScope.renderFrame(project: Project, t: Double, measurer: TextMeasurer, media: MediaResolver?) {
        val s = size.width / project.width
        drawRect(hexColor(project.bg), topLeft = Offset.Zero, size = size)
        val layers = visibleLayers(project, t)
        val cam = layers.firstOrNull { it.type == "camera" }
        if (cam != null) {
            val tr = layerTransform(cam, t)
            val zoom = cameraZoomAt(cam, t)
            val cx = size.width / 2f
            val cy = size.height / 2f
            translate(left = cx, top = cy) {
                rotate(degrees = tr.rotation.toFloat()) {
                    scale(scaleX = (tr.scaleX * zoom).toFloat(), scaleY = (tr.scaleY * zoom).toFloat()) {
                        translate(left = -cx + (tr.x * s).toFloat(), top = -cy + (tr.y * s).toFloat()) {
                            drawLayers(project, layers, t, s, measurer, media)
                        }
                    }
                }
            }
        } else {
            drawLayers(project, layers, t, s, measurer, media)
        }
    }

    private fun DrawScope.drawLayers(
        project: Project, layers: List<Layer>, t: Double, s: Float,
        measurer: TextMeasurer, media: MediaResolver?,
    ) {
        for (idx in layers.indices) {
            val layer = layers[idx]
            if (layer.type == "camera" || layer.type == "audio" || layer.type == "null") continue
            val op = layerOpacity(layer, t)
            if (op <= 0.01) continue
            // ماسک: لایه با clip، آلفای لایهٔ زیرین را می‌گیرد (below) یا برعکس (belowInv)
            if (layer.clip == "below" || layer.clip == "belowInv") {
                val below = layers.getOrNull(idx - 1)
                if (below == null || below.type == "camera" || below.type == "audio" || below.type == "null") {
                    if (layer.clip == "below") continue
                } else {
                    drawMasked(layer, below, t, s, measurer, media)
                    continue
                }
            }
            // تکرارکننده
            val rep = repeatOf(layer, t)
            if (rep != null && rep.count > 1.0) {
                drawRepeated(layer, rep, t, s, measurer, media)
                continue
            }
            // فیلتر رنگ یا حالت ترکیب → بیت‌مپ خارج‌صفحه
            val fp = filterParamsFor(layer, t)
            if (!fp.isIdentity || layer.blend != "normal") {
                val bmp = renderLayerBitmap(layer, t, s, measurer, media, fp)
                val cf = colorMatrixFor(fp)?.let { ColorFilter.colorMatrix(it) }
                val bm = blendModeFor(layer.blend)
                // تاری: تقریب با کوچک‌کردن و بزرگ‌کردن دوباره (دوبخطی)
                val finalBmp = if (fp.blur > 0.0) blurBitmap(bmp, fp.blur) else bmp
                drawImage(
                    finalBmp,
                    srcOffset = IntOffset.Zero,
                    srcSize = IntSize(finalBmp.width, finalBmp.height),
                    dstOffset = IntOffset.Zero,
                    dstSize = IntSize(size.width.toInt(), size.height.toInt()),
                    alpha = 1f,
                    colorFilter = cf,
                    blendMode = bm,
                )
                continue
            }
            // مسیر سریع
            drawLayerDirect(layer, t, s, measurer, media, op)
        }
    }

    /** رسم مستقیم لایه با ترنسفورم و شفافیت (بدون بیت‌مپ میانی). */
    private fun DrawScope.drawLayerDirect(
        layer: Layer, t: Double, s: Float, measurer: TextMeasurer, media: MediaResolver?, op: Double,
    ) {
        val tr = layerTransform(layer, t)
        translate(left = (tr.x * s).toFloat(), top = (tr.y * s).toFloat()) {
            rotate(degrees = tr.rotation.toFloat()) {
                scale(scaleX = tr.scaleX.toFloat(), scaleY = tr.scaleY.toFloat()) {
                    scale(scaleX = s, scaleY = s) {
                        drawLayerContent(layer, t, op.toFloat(), measurer, media)
                    }
                }
            }
        }
    }

    /** محتوای یک لایه (بدون ترنسفورم بیرونی) — در مختصات پروژه (پیکسلِ پروژه). */
    private fun DrawScope.drawLayerContent(
        layer: Layer, t: Double, alpha: Float, measurer: TextMeasurer, media: MediaResolver?,
    ) {
        when (layer.type) {
            "shape" -> drawShape(layer, alpha)
            "text" -> drawTextLayer(layer, t, alpha, measurer)
            "draw" -> drawFreehand(layer, alpha)
            "image" -> {
                val img = media?.image(layer.src) ?: return
                val iw = 320f
                val ih = iw * img.height / max(1, img.width)
                drawImage(
                    img,
                    srcOffset = IntOffset.Zero,
                    srcSize = IntSize(img.width, img.height),
                    dstOffset = IntOffset((-iw / 2f).roundToInt(), (-ih / 2f).roundToInt()),
                    dstSize = IntSize(iw.roundToInt(), ih.roundToInt()),
                    alpha = alpha,
                )
            }
            "video" -> {
                val img = media?.videoFrame(layer.src, t - layer.start) ?: return
                val iw = 320f
                val ih = iw * img.height / max(1, img.width)
                drawImage(
                    img,
                    srcOffset = IntOffset.Zero,
                    srcSize = IntSize(img.width, img.height),
                    dstOffset = IntOffset((-iw / 2f).roundToInt(), (-ih / 2f).roundToInt()),
                    dstSize = IntSize(iw.roundToInt(), ih.roundToInt()),
                    alpha = alpha,
                )
            }
            "group" -> {
                for (ch in layer.children) {
                    if (!isActive(ch, t)) continue
                    val tr = layerTransform(ch, t)
                    val op = layerOpacity(ch, t)
                    if (op <= 0.01) continue
                    translate(left = tr.x.toFloat(), top = tr.y.toFloat()) {
                        rotate(degrees = tr.rotation.toFloat()) {
                            scale(scaleX = tr.scaleX.toFloat(), scaleY = tr.scaleY.toFloat()) {
                                drawLayerContent(ch, t, (alpha * op).toFloat(), measurer, media)
                            }
                        }
                    }
                }
            }
        }
    }

    private fun DrawScope.drawShape(layer: Layer, alpha: Float) {
        val spec = layer.shape ?: return
        val w = spec.w.toFloat()
        val h = spec.h.toFloat()
        if (spec.kind == "line") {
            val path = shapePath("line", w, 8f)
            drawPath(
                path,
                color = hexColor(spec.fill).copy(alpha = alpha),
                style = Stroke(width = if (spec.strokeWidth > 0) spec.strokeWidth.toFloat() else 6f),
            )
            return
        }
        val path = shapePath(spec.kind, w, h)
        if (spec.fill != null) {
            drawPath(path, color = hexColor(spec.fill).copy(alpha = alpha))
        }
        if (spec.stroke != null && spec.strokeWidth > 0) {
            drawPath(
                path,
                color = hexColor(spec.stroke).copy(alpha = alpha),
                style = Stroke(width = spec.strokeWidth.toFloat()),
            )
        }
    }

    private fun DrawScope.drawTextLayer(layer: Layer, t: Double, alpha: Float, measurer: TextMeasurer) {
        val spec = layer.text ?: return
        val weight = when {
            spec.weight >= 900 -> FontWeight.Black
            spec.weight >= 700 -> FontWeight.Bold
            spec.weight >= 500 -> FontWeight.Medium
            else -> FontWeight.Normal
        }
        var content = spec.content
        // تایپ‌رایتر: برش محتوا بر اساس زمان
        val typeFx = layer.effects.firstOrNull { it.id == "typewriter" && isFxOn(it) }
        if (typeFx != null) {
            val p = effectParamsAt(typeFx, t - layer.start)
            val n = ((t - layer.start) * (p["speed"] ?: 12.0)).toInt()
            content = content.take(max(0, n))
        }
        val tracking = layer.effects.firstOrNull { it.id == "tracking" && isFxOn(it) }
        val letterSpacing = if (tracking != null) {
            val p = effectParamsAt(tracking, t - layer.start)
            TextUnit((p["amount"] ?: 0.0).toFloat(), TextUnitType.Sp)
        } else {
            TextUnit.Unspecified
        }
        val style = TextStyle(
            fontFamily = LyricStudioFont,
            fontWeight = weight,
            fontSize = TextUnit(spec.size.toFloat(), TextUnitType.Sp),
            color = hexColor(spec.color).copy(alpha = alpha),
            textAlign = TextAlign.Center,
            lineHeight = TextUnit((spec.size * spec.lineHeight).toFloat(), TextUnitType.Sp),
            letterSpacing = letterSpacing,
        )
        val measured = measurer.measure(content, style)
        drawText(measured, topLeft = Offset(-measured.size.width / 2f, -measured.size.height / 2f))
    }

    private fun DrawScope.drawFreehand(layer: Layer, alpha: Float) {
        for (st in layer.strokes) {
            if (st.points.isEmpty()) continue
            val path = Path()
            st.points.forEachIndexed { i, p ->
                if (i == 0) path.moveTo(p.x.toFloat(), p.y.toFloat())
                else path.lineTo(p.x.toFloat(), p.y.toFloat())
            }
            drawPath(
                path,
                color = hexColor(st.color).copy(alpha = alpha),
                style = Stroke(width = st.width.toFloat()),
            )
        }
    }

    /** رندر یک لایه به بیت‌مپ خارج‌صفحه (با ترنسفورم و شفافیت؛ فیلتر اختیاری داخلش اعمال می‌شود). */
    private fun DrawScope.renderLayerBitmap(
        layer: Layer, t: Double, s: Float, measurer: TextMeasurer, media: MediaResolver?,
        filter: FilterParams?,
    ): ImageBitmap {
        val pw = max(1, size.width.toInt())
        val ph = max(1, size.height.toInt())
        val bmp = ImageBitmap(pw, ph)
        val canvas = Canvas(bmp)
        val matrix = filter?.let { colorMatrixFor(it) }
        // DrawScope خودش یک Density است (density: Float چگالی پیکسل است، نه شیء Density)
        CanvasDrawScope().draw(this, layoutDirection, canvas, Size(pw.toFloat(), ph.toFloat())) {
            if (matrix != null) {
                drawIntoCanvas { c ->
                    val paint = Paint().apply { colorFilter = ColorFilter.colorMatrix(matrix) }
                    c.saveLayer(Rect(0f, 0f, pw.toFloat(), ph.toFloat()), paint)
                    drawLayerDirect(layer, t, s, measurer, media, layerOpacity(layer, t))
                    c.restore()
                }
            } else {
                drawLayerDirect(layer, t, s, measurer, media, layerOpacity(layer, t))
            }
        }
        return bmp
    }

    /** ماسک: لایه با clip، آلفای لایهٔ زیرین را می‌گیرد (below) یا برعکس (belowInv). */
    private fun DrawScope.drawMasked(
        layer: Layer, below: Layer, t: Double, s: Float,
        measurer: TextMeasurer, media: MediaResolver?,
    ) {
        val fp = filterParamsFor(layer, t)
        val mine = renderLayerBitmap(layer, t, s, measurer, media, if (fp.isIdentity) null else fp)
        val mask = renderLayerBitmap(below, t, s, measurer, media, null)
        val dstIn = layer.clip == "below"
        drawIntoCanvas { canvas ->
            canvas.saveLayer(Rect(0f, 0f, size.width, size.height), Paint())
            canvas.drawImage(mine, Offset.Zero, Paint())
            val maskPaint = Paint().apply {
                blendMode = if (dstIn) BlendMode.DstIn else BlendMode.DstOut
            }
            canvas.drawImage(mask, Offset.Zero, maskPaint)
            canvas.restore()
        }
    }

    /** تکرارکننده: لایه چند بار با جابه‌جایی/چرخش/مقیاس/محو کشیده می‌شود. */
    private fun DrawScope.drawRepeated(
        layer: Layer, rep: com.zurvanecho.lyricstudio.motion.core.RepeatParams, t: Double,
        s: Float, measurer: TextMeasurer, media: MediaResolver?,
    ) {
        val fp = filterParamsFor(layer, t)
        val tmp = renderLayerBitmap(layer, t, s, measurer, media, if (fp.isIdentity) null else fp)
        val n = min(12, max(2, rep.count.toInt()))
        for (i in n - 1 downTo 0) {
            val sc = (rep.scale / 100.0).pow(i.toDouble())
            val alpha = (1.0 - (rep.fade / 100.0) * (if (n > 1) i.toDouble() / (n - 1) else 0.0)).toFloat()
            translate(left = (rep.dx * i * s).toFloat(), top = (rep.dy * i * s).toFloat()) {
                rotate(degrees = (rep.rot * i).toFloat()) {
                    scale(scaleX = sc.toFloat(), scaleY = sc.toFloat()) {
                        drawImage(
                            tmp,
                            srcOffset = IntOffset.Zero,
                            srcSize = IntSize(tmp.width, tmp.height),
                            dstOffset = IntOffset.Zero,
                            dstSize = IntSize(size.width.toInt(), size.height.toInt()),
                            alpha = alpha,
                        )
                    }
                }
            }
        }
    }

    /** تقریب تاری: کوچک‌کردن و بزرگ‌کردن دوباره با فیلتر دوبخطی. */
    private fun DrawScope.blurBitmap(src: ImageBitmap, blurPx: Double): ImageBitmap {
        val k = (1.0 + blurPx / 4.0).coerceAtLeast(1.0)
        val sw = max(1, (src.width / k).toInt())
        val sh = max(1, (src.height / k).toInt())
        val small = ImageBitmap(sw, sh)
        CanvasDrawScope().draw(this, layoutDirection, Canvas(small), Size(sw.toFloat(), sh.toFloat())) {
            drawImage(
                src,
                srcOffset = IntOffset.Zero,
                srcSize = IntSize(src.width, src.height),
                dstOffset = IntOffset.Zero,
                dstSize = IntSize(sw, sh),
            )
        }
        val out = ImageBitmap(src.width, src.height)
        CanvasDrawScope().draw(this, layoutDirection, Canvas(out), Size(src.width.toFloat(), src.height.toFloat())) {
            drawImage(
                small,
                srcOffset = IntOffset.Zero,
                srcSize = IntSize(sw, sh),
                dstOffset = IntOffset.Zero,
                dstSize = IntSize(src.width, src.height),
            )
        }
        return out
    }

    /** ماتریس رنگ ۴×۵ از پارامترهای فیلتر (brightness/contrast/saturation/hue/grayscale/sepia/invert). */
    fun colorMatrixFor(p: FilterParams): ColorMatrix? {
        if (p.isIdentity) return null
        var m = identity()
        // brightness: ضرب (۱+amount)
        if (p.brightness != 0.0) m = multiply(m, scaleMatrix(1.0 + p.brightness))
        // contrast: (in-0.5)*f+0.5
        if (p.contrast != 0.0) {
            val f = 1.0 + p.contrast
            val off = 0.5 * (1.0 - f) * 255.0
            m = multiply(m, floatArrayOf(
                f.toFloat(), 0f, 0f, 0f, off.toFloat(),
                0f, f.toFloat(), 0f, 0f, off.toFloat(),
                0f, 0f, f.toFloat(), 0f, off.toFloat(),
                0f, 0f, 0f, 1f, 0f,
            ))
        }
        // saturation
        if (p.saturation != 0.0) m = multiply(m, saturationMatrix(1.0 + p.saturation))
        // hue rotate
        if (p.hueShift != 0.0) m = multiply(m, hueMatrix(p.hueShift))
        // grayscale: ترکیب به سمت خاکستری
        if (p.grayscale != 0.0) m = multiply(m, mixMatrix(grayscaleMatrix(), p.grayscale))
        // sepia
        if (p.sepia != 0.0) m = multiply(m, mixMatrix(sepiaMatrix(), p.sepia))
        // invert
        if (p.invert != 0.0) m = multiply(m, mixMatrix(invertMatrix(), p.invert))
        return ColorMatrix(m)
    }

    private fun identity() = floatArrayOf(
        1f, 0f, 0f, 0f, 0f,
        0f, 1f, 0f, 0f, 0f,
        0f, 0f, 1f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )

    private fun scaleMatrix(f: Double) = floatArrayOf(
        f.toFloat(), 0f, 0f, 0f, 0f,
        0f, f.toFloat(), 0f, 0f, 0f,
        0f, 0f, f.toFloat(), 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )

    private fun saturationMatrix(f: Double): FloatArray {
        val lumR = 0.213; val lumG = 0.715; val lumB = 0.072
        val a = (1 - f)
        return floatArrayOf(
            (a * lumR + f).toFloat(), (a * lumG).toFloat(), (a * lumB).toFloat(), 0f, 0f,
            (a * lumR).toFloat(), (a * lumG + f).toFloat(), (a * lumB).toFloat(), 0f, 0f,
            (a * lumR).toFloat(), (a * lumG).toFloat(), (a * lumB + f).toFloat(), 0f, 0f,
            0f, 0f, 0f, 1f, 0f,
        )
    }

    private fun hueMatrix(deg: Double): FloatArray {
        val rad = deg * PI / 180.0
        val c = cos(rad); val s = sin(rad)
        val lumR = 0.213; val lumG = 0.715; val lumB = 0.072
        return floatArrayOf(
            (lumR + c * (1 - lumR) + s * (-lumR)).toFloat(),
            (lumG + c * (-lumG) + s * (-lumG)).toFloat(),
            (lumB + c * (-lumB) + s * (1 - lumB)).toFloat(), 0f, 0f,
            (lumR + c * (-lumR) + s * 0.143).toFloat(),
            (lumG + c * (1 - lumG) + s * 0.143).toFloat(),
            (lumB + c * (-lumB) + s * (-0.283)).toFloat(), 0f, 0f,
            (lumR + c * (-lumR) + s * (-(1 - lumR))).toFloat(),
            (lumG + c * (-lumG) + s * lumG).toFloat(),
            (lumB + c * (1 - lumB) + s * lumB).toFloat(), 0f, 0f,
            0f, 0f, 0f, 1f, 0f,
        )
    }

    private fun grayscaleMatrix() = floatArrayOf(
        0.213f, 0.715f, 0.072f, 0f, 0f,
        0.213f, 0.715f, 0.072f, 0f, 0f,
        0.213f, 0.715f, 0.072f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )

    private fun sepiaMatrix() = floatArrayOf(
        0.393f, 0.769f, 0.189f, 0f, 0f,
        0.349f, 0.686f, 0.168f, 0f, 0f,
        0.272f, 0.534f, 0.131f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )

    private fun invertMatrix() = floatArrayOf(
        -1f, 0f, 0f, 0f, 255f,
        0f, -1f, 0f, 0f, 255f,
        0f, 0f, -1f, 0f, 255f,
        0f, 0f, 0f, 1f, 0f,
    )

    /** ترکیب ماتریس با هویت به نسبت amount (برای grayscale/sepia/invert). */
    private fun mixMatrix(m: FloatArray, amount: Double): FloatArray {
        val id = identity()
        return FloatArray(20) { i -> (id[i] * (1.0 - amount) + m[i] * amount).toFloat() }
    }

    /** ضرب دو ماتریس ۴×۵ (اعمال b بعد از a: ‏result = b ∘ a). */
    private fun multiply(a: FloatArray, b: FloatArray): FloatArray {
        val out = FloatArray(20)
        for (row in 0 until 4) {
            for (col in 0 until 5) {
                var v = 0.0
                for (k in 0 until 4) {
                    v += b[row * 5 + k] * a[k * 5 + col]
                }
                if (col == 4) v += b[row * 5 + 4]
                out[row * 5 + col] = v.toFloat()
            }
        }
        return out
    }

    fun blendModeFor(name: String): BlendMode = when (name) {
        "multiply" -> BlendMode.Multiply
        "screen" -> BlendMode.Screen
        "overlay" -> BlendMode.Overlay
        "darken" -> BlendMode.Darken
        "lighten" -> BlendMode.Lighten
        "colorDodge" -> BlendMode.ColorDodge
        "colorBurn" -> BlendMode.ColorBurn
        // HardLight/SoftLight در BlendMode کامپوز نیستند — نزدیک‌ترین تقریب
        "hardLight" -> BlendMode.Overlay
        "softLight" -> BlendMode.Screen
        "difference" -> BlendMode.Difference
        "exclusion" -> BlendMode.Exclusion
        "hue" -> BlendMode.Hue
        "saturation" -> BlendMode.Saturation
        "color" -> BlendMode.Color
        "luminosity" -> BlendMode.Luminosity
        "dstIn" -> BlendMode.DstIn
        "dstOut" -> BlendMode.DstOut
        "srcOver" -> BlendMode.SrcOver
        else -> BlendMode.SrcOver
    }
}
