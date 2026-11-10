package com.zurvanecho.lyricstudio.motion.export

import com.zurvanecho.lyricstudio.motion.model.Project
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * نقشهٔ خروجی — پورت exportPlan و audioSchedule از src/export/exporter.js نسخهٔ وب.
 * خالص و تست‌پذیر.
 */

data class ExportPlan(
    val from: Double,
    val to: Double,
    val fps: Int,
    val width: Int,
    val height: Int,
    val seconds: Double,
    val frames: Int,
    val bitrate: Int,
    val estMB: Double,
)

data class AudioClip(
    val src: String,
    val start: Double,
    val offset: Double,
    val duration: Double,
    /** بلندی لایه (۰ تا ۱) + محو ورود/خروج (ثانیه) — برای میکس. */
    val volume: Double = 1.0,
    val fadeIn: Double = 0.0,
    val fadeOut: Double = 0.0,
    /** شروع/پایان لایه در زمان پروژه (برای محو ورود/خروج). */
    val layerStart: Double = 0.0,
    val layerEnd: Double = 0.0,
)

fun exportPlan(
    project: Project,
    from: Double = 0.0,
    to: Double = project.duration,
    fps: Int = 30,
    width: Int = project.width,
    height: Int = project.height,
    bitrateMbps: Double = 12.0,
): ExportPlan {
    val dur = project.duration
    val f = max(0.0, min(dur, from))
    val t = max(0.0, min(dur, to))
    require(t > f) { "بازهٔ خروجی نامعتبر است (پایان باید بعد از شروع باشد)" }
    val fpsC = min(60, max(1, fps))
    val w = max(16, width)
    val h = max(16, height)
    val seconds = t - f
    val frames = max(1, (seconds * fpsC).roundToInt())
    val bitrate = (bitrateMbps * 1_000_000).toInt()
    val estMB = (seconds * bitrateMbps / 8.0 * 10).roundToInt() / 10.0
    return ExportPlan(f, t, fpsC, w, h, seconds, frames, bitrate, estMB)
}

/** لایه‌های صوتی فعال در بازه — {src, start, offset, duration, volume, fadeIn, fadeOut}. */
fun audioSchedule(project: Project, from: Double, to: Double): List<AudioClip> {
    val out = mutableListOf<AudioClip>()
    for (l in project.layers) {
        if (l.type != "audio" || l.src == null) continue
        val s = max(l.start, from)
        val e = min(l.end, to)
        if (e <= s) continue
        out.add(
            AudioClip(
                l.src, s - from, s - l.start, e - s,
                volume = l.audio?.volume ?: 1.0,
                fadeIn = l.audio?.fadeIn ?: 0.0,
                fadeOut = l.audio?.fadeOut ?: 0.0,
                layerStart = l.start,
                layerEnd = l.end,
            ),
        )
    }
    return out
}

/** برآورد حجم خروجی (مگابایت). */
fun estimateSize(project: Project, fps: Int = 30, bitrateMbps: Double = 12.0): Double {
    return (project.duration * bitrateMbps / 8.0 * 10).roundToInt() / 10.0
}
