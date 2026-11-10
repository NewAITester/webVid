package com.zurvanecho.lyricstudio.motion.core

import kotlin.math.PI
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.floor

/**
 * منحنی‌های easing — پورت خالص src/core/easing.js (نسخهٔ وب).
 * بدون DOM، بدون Math.random (هش قطعی sin-hash).
 */
object Easing {
    fun linear(t: Double) = t
    fun easeIn(t: Double) = t * t
    fun easeOut(t: Double) = 1.0 - (1.0 - t) * (1.0 - t)
    fun easeInOut(t: Double) = if (t < 0.5) 2.0 * t * t else 1.0 - (-2.0 * t + 2.0).pow(2) / 2.0
    fun easeOutCubic(t: Double) = 1.0 - (1.0 - t).pow(3)
    fun easeInCubic(t: Double) = t * t * t
    fun easeOutBack(t: Double): Double {
        val c = 1.70158
        return 1.0 + (c + 1.0) * (t - 1.0).pow(3) + c * (t - 1.0).pow(2)
    }

    /** نویز قطعی (جای Math.random): همان الگوی sin-hash وب. */
    fun hash(i: Double): Double {
        val s = sin(i * 12.9898) * 43758.5453
        return s - floor(s)
    }

    fun ease(name: String?, t: Double): Double {
        val clamped = t.coerceIn(0.0, 1.0)
        return when (name) {
            "easeIn" -> easeIn(clamped)
            "easeOut" -> easeOut(clamped)
            "easeInOut" -> easeInOut(clamped)
            "easeOutCubic" -> easeOutCubic(clamped)
            "easeInCubic" -> easeInCubic(clamped)
            "easeOutBack" -> easeOutBack(clamped)
            else -> linear(clamped)
        }
    }

    /** منحنی بزیهٔ مکعبی (برای کی‌فریم‌های سفارشی) — پورت cubicBezier وب. */
    fun cubicBezier(p1x: Double, p1y: Double, p2x: Double, p2y: Double): (Double) -> Double {
        val cx = 3.0 * p1x
        val bx = 3.0 * (p2x - p1x) - cx
        val ax = 1.0 - cx - bx
        val cy = 3.0 * p1y
        val by = 3.0 * (p2y - p1y) - cy
        val ay = 1.0 - cy - by
        val sx = { t: Double -> ((ax * t + bx) * t + cx) * t }
        val sy = { t: Double -> ((ay * t + by) * t + cy) * t }
        return { x: Double ->
            var t = x
            for (i in 0 until 5) {
                val e = sx(t) - x
                if (kotlin.math.abs(e) < 1e-4) break
                val d = (3.0 * ax * t + 2.0 * bx) * t + cx
                if (kotlin.math.abs(d) < 1e-6) break
                t -= e / d
            }
            sy(t.coerceIn(0.0, 1.0))
        }
    }
}
