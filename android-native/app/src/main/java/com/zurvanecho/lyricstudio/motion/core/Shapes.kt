package com.zurvanecho.lyricstudio.motion.core

import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * هر ۲۱ شکل آلایت — پورت shapePath از src/render/renderer.js (نسخهٔ وب).
 * مسیرها حول مبدأ (مرکز) ساخته می‌شوند؛ w و h اندازهٔ شکل‌اند.
 * همان مختصات وب، تا شکل‌ها در وب و نیتیو یکسان دیده شوند.
 */

val SHAPE_KINDS = listOf(
    "ellipse", "rect", "polygon", "star", "heart", "ring", "line", "arrow",
    "callout", "flower", "triangle", "diamond", "cross", "pie", "arc", "moon",
    "teardrop", "roundrect", "quad", "plus", "stamp",
)

val SHAPE_NAMES_FA = mapOf(
    "ellipse" to "بیضی", "rect" to "مستطیل", "polygon" to "چندضلعی", "star" to "ستاره",
    "heart" to "قلب", "ring" to "حلقه", "line" to "خط", "arrow" to "پیکان",
    "callout" to "حباب", "flower" to "گل", "triangle" to "مثلث", "diamond" to "لوزی",
    "cross" to "ضربدر", "pie" to "قطعه", "arc" to "کمان", "moon" to "ماه",
    "teardrop" to "قطره", "roundrect" to "مستطیل گرد", "quad" to "ذوزنقه",
    "plus" to "بعلاوه", "stamp" to "مهر",
)

fun shapePath(kind: String, w: Float, h: Float): Path {
    val path = Path()
    val hw = w / 2f
    val hh = h / 2f
    when (kind) {
        "ellipse" -> path.addOval(Rect(-hw, -hh, hw, hh))
        "rect" -> path.addRect(Rect(-hw, -hh, hw, hh))
        "ring" -> {
            path.fillType = PathFillType.EvenOdd
            path.addOval(Rect(-hw, -hh, hw, hh))
            val inner = min(hw, hh) * 0.62f
            path.addOval(Rect(-inner, -inner, inner, inner))
        }
        "line" -> {
            path.moveTo(-hw, 0f)
            path.lineTo(hw, 0f)
        }
        "triangle" -> polygon(path, listOf(0f to -hh, hw to hh, -hw to hh))
        "diamond" -> polygon(path, listOf(0f to -hh, hw to 0f, 0f to hh, -hw to 0f))
        "heart" -> {
            val s = hw
            path.moveTo(0f, s * 0.55f)
            path.cubicTo(-s * 1.1f, -s * 0.25f, -s * 0.45f, -s * 0.95f, 0f, -s * 0.3f)
            path.cubicTo(s * 0.45f, -s * 0.95f, s * 1.1f, -s * 0.25f, 0f, s * 0.55f)
            path.close()
        }
        "arrow" -> {
            val sh = hh * 0.38f
            val head = min(hw, hh * 1.1f)
            polygon(path, listOf(
                -hw to -sh, hw - head to -sh, hw - head to -hh, hw to 0f,
                hw - head to hh, hw - head to sh, -hw to sh,
            ))
        }
        "plus", "cross" -> {
            val tw = min(w, h) * (if (kind == "plus") 0.42f else 0.3f) / 2f
            polygon(path, listOf(
                -tw to -hh, tw to -hh, tw to -tw, hw to -tw, hw to tw, tw to tw,
                tw to hh, -tw to hh, -tw to tw, -hw to tw, -hw to -tw, -tw to -tw,
            ))
        }
        "stamp" -> {
            val n = 24
            val rOut = min(hw, hh)
            val rIn = rOut * 0.88f
            for (i in 0..n * 2) {
                val a = (i.toDouble() / (n * 2)) * PI * 2.0 - PI / 2.0
                val r = if (i % 2 == 1) rIn else rOut
                val px = (cos(a) * r).toFloat()
                val py = (sin(a) * r).toFloat()
                if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
            }
            path.close()
        }
        "roundrect" -> {
            val r = min(w, h) * 0.2f
            path.addRoundRect(androidx.compose.ui.geometry.RoundRect(Rect(-hw, -hh, hw, hh), r, r))
        }
        "quad" -> {
            val tw = hw * 0.6f
            polygon(path, listOf(-tw to -hh, tw to -hh, hw to hh, -hw to hh))
        }
        "pie" -> {
            path.moveTo(0f, 0f)
            path.arcTo(Rect(-hw, -hh, hw, hh), -90f, 270f, false)
            path.close()
        }
        "arc" -> {
            // کمان باز — در این رندر با پُر شدن، گُوه می‌شود (تقریب وب)
            path.arcTo(Rect(-hw, -hh, hw, hh), -90f, 270f, false)
            path.close()
        }
        "moon" -> {
            path.fillType = PathFillType.EvenOdd
            path.addOval(Rect(-hw, -hh, hw, hh))
            path.addOval(Rect(hw * 0.35f - hw * 0.85f, -hh * 0.1f - hh * 0.85f, hw * 0.35f + hw * 0.85f, -hh * 0.1f + hh * 0.85f))
        }
        "teardrop" -> {
            path.moveTo(0f, -hh)
            path.cubicTo(hw * 0.9f, -hh * 0.1f, hw, hh * 0.5f, 0f, hh)
            path.cubicTo(-hw, hh * 0.5f, -hw * 0.9f, -hh * 0.1f, 0f, -hh)
            path.close()
        }
        "callout" -> {
            val by = hh * 0.65f
            polygon(path, listOf(
                -hw to -hh, hw to -hh, hw to by, hw * 0.25f to by,
                -hw * 0.05f to hh, -hw * 0.35f to by, -hw to by,
            ))
        }
        "star", "flower" -> {
            val n = if (kind == "star") 5 else 8
            for (i in 0 until n * 2) {
                val r = if (i % 2 == 0) w / 2f else w / 2f * 0.45f
                val a = (i.toDouble() / (n * 2)) * PI * 2.0 - PI / 2.0
                val px = (cos(a) * r).toFloat()
                val py = (sin(a) * (h / w) * r).toFloat()
                if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
            }
            path.close()
        }
        else -> {
            // polygon (۶ ضلعی) یا ناشناخته — چندضلعی منتظم
            val n = if (kind == "polygon") 6 else 3
            for (i in 0 until n) {
                val a = (i.toDouble() / n) * PI * 2.0 - PI / 2.0
                val px = (cos(a) * w / 2.0).toFloat()
                val py = (sin(a) * h / 2.0).toFloat()
                if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
            }
            path.close()
        }
    }
    return path
}

private fun polygon(path: Path, points: List<Pair<Float, Float>>) {
    points.forEachIndexed { i, (px, py) ->
        if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
    }
    path.close()
}
