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
    }

    /** توقف همه و آزاد کردن منابع (هنگام خروج از ادیتور). */
    fun release() {
        for ((_, rec) in players) {
            try { rec.player.release() } catch (_: Exception) { }
        }
        players.clear()
    }
}
