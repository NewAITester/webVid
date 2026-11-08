package com.zurvanecho.lyricstudio.motion.ui.editor

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import com.zurvanecho.lyricstudio.motion.model.Layer
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.ui.theme.LyricStudioFont
import com.zurvanecho.lyricstudio.motion.ui.theme.hexColor

/**
 * پیش‌نمایش پروژه روی Canvas — ترکیب‌کنندهٔ لایه‌ها (همان renderFrame وب):
 * لایه‌ها به ترتیب (پایین به بالا) با transform و شفافیت کشیده می‌شوند.
 * فعلاً شکل/متن؛ رسانه و افکت‌های پیکسلی در فازهای بعد می‌آیند.
 */
@Composable
fun ProjectPreview(project: Project, time: Double, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val aspect = remember(project.width, project.height) {
        project.width.toFloat() / project.height.toFloat()
    }
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(aspect),
    ) {
        drawRect(hexColor(project.bg), topLeft = Offset.Zero, size = size)
        val s = size.width / project.width
        for (layer in project.layers) {
            if (time < layer.start || time >= layer.end) continue
            drawLayer(layer, s, measurer)
        }
    }
}

private fun DrawScope.drawLayer(layer: Layer, s: Float, measurer: TextMeasurer) {
    val t = layer.transform
    val cx = (t.x * s).toFloat()
    val cy = (t.y * s).toFloat()
    // مبدأ لایه (anchor) در مرکز است؛ چرخش و مقیاس حول همان نقطه
    translate(left = cx, top = cy) {
        rotate(degrees = t.rotation.toFloat()) {
            scale(scaleX = t.scaleX.toFloat(), scaleY = t.scaleY.toFloat()) {
                val alpha = t.opacity.toFloat()
                when (layer.type) {
                    "shape" -> drawShape(layer, s, alpha)
                    "text" -> drawTextLayer(layer, s, alpha, measurer)
                }
            }
        }
    }
}

private fun DrawScope.drawShape(layer: Layer, s: Float, alpha: Float) {
    val spec = layer.shape ?: return
    val fill = hexColor(spec.fill).copy(alpha = alpha)
    val w = (spec.w * s).toFloat()
    val h = (spec.h * s).toFloat()
    val topLeft = Offset(-w / 2f, -h / 2f)
    when (spec.kind) {
        "rect" -> drawRect(fill, topLeft = topLeft, size = Size(w, h))
        "ellipse" -> drawOval(fill, topLeft = topLeft, size = Size(w, h))
        "ring" -> {
            // حلقه: دایرهٔ توخالی — ضخامت ۱۲٪ قطر
            val r = minOf(w, h) / 2f
            drawCircle(
                fill,
                radius = r,
                center = Offset.Zero,
                style = Stroke(width = r * 0.24f),
            )
        }
        "star" -> drawRect(fill, topLeft = topLeft, size = Size(w, h)) // جای‌نگه‌دار تا فاز شکل‌ها
        else -> drawRect(fill, topLeft = topLeft, size = Size(w, h))
    }
    val stroke = hexColor(spec.stroke)
    if (stroke != Color.Transparent && spec.strokeWidth > 0) {
        drawRect(stroke, topLeft = topLeft, size = Size(w, h), style = Stroke(width = (spec.strokeWidth * s).toFloat()))
    }
}

private fun DrawScope.drawTextLayer(layer: Layer, s: Float, alpha: Float, measurer: TextMeasurer) {
    val spec = layer.text ?: return
    val sizePx = (spec.size * s).toFloat()
    val weight = when {
        spec.weight >= 900 -> FontWeight.Black
        spec.weight >= 700 -> FontWeight.Bold
        spec.weight >= 500 -> FontWeight.Medium
        else -> FontWeight.Normal
    }
    val style = TextStyle(
        fontFamily = LyricStudioFont,
        fontWeight = weight,
        fontSize = sizePx.toSp(),
        color = hexColor(spec.color).copy(alpha = alpha),
    )
    val measured = measurer.measure(spec.content, style)
    drawText(
        measured,
        topLeft = Offset(-measured.size.width / 2f, -measured.size.height / 2f),
    )
}

private fun Float.toSp() = androidx.compose.ui.unit.TextUnit(this, androidx.compose.ui.unit.TextUnitType.Sp)
