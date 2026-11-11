package com.zurvanecho.lyricstudio.motion.audio

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import com.zurvanecho.lyricstudio.motion.model.Layer
import com.zurvanecho.lyricstudio.motion.model.Project
import kotlin.math.max
import kotlin.math.min

/**
 * پخش صدا در پیش‌نمایش — پورت src/render/audio.js نسخهٔ وب.
 * برای هر لایهٔ صوتی یک MediaPlayer نگه می‌دارد و با زمان پروژه همگام می‌کند:
 * پخش/توقف، جابه‌جایی (seek) و بلندی با محو ورود/خروج.
 * افکت‌های صوتی در پیش‌نمایش خشک‌اند (مثل نسخهٔ وب)؛ در خروجی میکس می‌شوند.
 */

/** بلندی لایهٔ صوتی در زمان t (۰ خارج از بازه؛ محو ورود/خروج خطی). */
fun audioVolumeAt(layer: Layer, t: Double): Double {
    val a = layer.audio
    val vol = a?.volume ?: 1.0
    if (t < layer.start || t > layer.end) return 0.0
    val local = t - layer.start
    val dur = max(0.01, layer.end - layer.start)
    var k = 1.0
    val fi = a?.fadeIn ?: 0.0
    val fo = a?.fadeOut ?: 0.0
    if (fi > 0 && local < fi) k = min(k, local / fi)
    if (fo > 0 && local > dur - fo) k = min(k, (dur - local) / fo)
    return max(0.0, min(1.0, vol * k))
}

class AudioPlayer(private val context: Context) {
    private data class Rec(val player: MediaPlayer, val src: String)
    private val players = mutableMapOf<String, Rec>()
    var muted: Boolean = false

    /** سطح لحظه‌ای صدا (۰–۱) از Visualizer روی اولین پخش‌کنندهٔ فعال. */
    @Volatile
    private var level: Float = 0f
    private var visualizer: android.media.audiofx.Visualizer? = null
    private var vizSession: Int = -1

    /** سطح فعلی (خواندن از رشتهٔ UI؛ مقدار بین دو خواندن محو می‌شود). */
    fun currentLevel(): Float = level

    /** اتصال Visualizer به جلسهٔ صوتی یک پخش‌کننده؛ در صورت خطا بی‌صدا رد می‌شود. */
    private fun attachVisualizer(sessionId: Int) {
        if (sessionId == vizSession || sessionId <= 0) return
        try {
            visualizer?.release()
            val viz = android.media.audiofx.Visualizer(sessionId)
            val rates = android.media.audiofx.Visualizer.getCaptureSizeRange()
            viz.captureSize = rates[0]
            viz.setDataCaptureListener(
                object : android.media.audiofx.Visualizer.OnDataCaptureListener {
                    override fun onWaveFormDataCapture(
                        v: android.media.audiofx.Visualizer?,
                        bytes: ByteArray?,
                        rate: Int,
                    ) {
                        if (bytes == null) return
                        var peak = 0
                        for (b in bytes) {
                            val a = kotlin.math.abs(b.toInt() - 128)
                            if (a > peak) peak = a
                        }
                        level = (peak / 128f).coerceIn(0f, 1f)
                    }

                    override fun onFftDataCapture(
                        v: android.media.audiofx.Visualizer?,
                        bytes: ByteArray?,
                        rate: Int,
                    ) {
                    }
                },
                android.media.audiofx.Visualizer.getMaxCaptureRate() / 2,
                true,
                false,
            )
            viz.enabled = true
            visualizer = viz
            vizSession = sessionId
        } catch (_: Exception) {
            visualizer = null
            vizSession = -1
        }
    }

    /** همگام‌سازی با پروژه: ساخت/حذف پخش‌کننده‌ها، پخش یا توقف، تنظیم زمان. */
    fun sync(project: Project, t: Double, playing: Boolean) {
        val layers = project.layers.filter { it.type == "audio" && it.src != null }
        val seen = mutableSetOf<String>()
        for (l in layers) {
            val src = l.src ?: continue
            seen.add(l.id)
            var rec = players[l.id]
            if (rec == null || rec.src != src) {
                rec?.player?.release()
                val mp = MediaPlayer()
                try {
                    mp.setDataSource(context, Uri.parse(src))
                    mp.prepare()
                } catch (_: Exception) {
                    // فایل خراب یا در دسترس نیست — لایه بی‌صدا می‌ماند
                    try { mp.release() } catch (_: Exception) { }
                    continue
                }
                rec = Rec(mp, src)
                players[l.id] = rec
            }
            val mp = rec.player
            mp.setVolume(
                if (muted) 0f else audioVolumeAt(l, t).toFloat(),
                if (muted) 0f else audioVolumeAt(l, t).toFloat(),
            )
            val active = t >= l.start && t <= l.end
            if (!active || !playing) {
                if (mp.isPlaying) mp.pause()
                if (active) {
                    try { mp.seekTo(max(0, ((t - l.start) * 1000).toInt())) } catch (_: Exception) { }
                }
                continue
            }
            val target = max(0, ((t - l.start) * 1000).toInt())
            if (kotlin.math.abs(mp.currentPosition - target) > 250) {
                try { mp.seekTo(target) } catch (_: Exception) { }
            }
            if (!mp.isPlaying) {
                try { mp.start() } catch (_: Exception) { }
            }
            attachVisualizer(mp.audioSessionId)
        }
        // حذف پخش‌کننده‌های لایه‌های حذف‌شده
        val it = players.iterator()
        while (it.hasNext()) {
            val (id, rec) = it.next()
            if (id !in seen) {
                try { rec.player.release() } catch (_: Exception) { }
                it.remove()
            }
        }
        if (players.isEmpty()) level = 0f
    }

    /** توقف همه و آزاد کردن منابع (هنگام خروج از ادیتور). */
    fun release() {
        for ((_, rec) in players) {
            try { rec.player.release() } catch (_: Exception) { }
        }
        players.clear()
        try { visualizer?.release() } catch (_: Exception) { }
        visualizer = null
        vizSession = -1
        level = 0f
    }
}
