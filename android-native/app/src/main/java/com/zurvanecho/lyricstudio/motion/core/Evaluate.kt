package com.zurvanecho.lyricstudio.motion.core

import com.zurvanecho.lyricstudio.motion.model.EffectRef
import com.zurvanecho.lyricstudio.motion.model.Keyframe
import com.zurvanecho.lyricstudio.motion.model.Layer
import com.zurvanecho.lyricstudio.motion.model.Project
import com.zurvanecho.lyricstudio.motion.model.Transform
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * ارزیابی خالص لایه در زمان t — پورت src/core/evaluate.js (نسخهٔ وب).
 * ترنسفورم + شفافیت + افکت‌های انیمیشنی + فیلتر رنگ + تکرارکننده.
 * همان ریاضی وب، تا پروژه‌های وب و نیتیو یکسان رندر شوند.
 */

private val PROPS = listOf("x", "y", "scaleX", "scaleY", "rotation", "opacity")

/** درون‌یابی یک ویژگی با کی‌فریم‌ها. */
fun valueAt(keyframes: List<Keyframe>?, t: Double, fallback: Double): Double {
    if (keyframes.isNullOrEmpty()) return fallback
    val kfs = keyframes.sortedBy { it.t }
    if (t <= kfs.first().t) return kfs.first().value
    if (t >= kfs.last().t) return kfs.last().value
    for (i in 0 until kfs.size - 1) {
        val a = kfs[i]; val b = kfs[i + 1]
        if (t >= a.t && t <= b.t) {
            val span = b.t - a.t
            val u = Easing.ease(b.ease.ifEmpty { a.ease }, (t - a.t) / if (span == 0.0) 1.0 else span)
            return a.value + (b.value - a.value) * u
        }
    }
    return fallback
}

/** پارامترهای یک افکت در زمان محلی t (داخل لایه): کی‌فریم پارامتر را حل می‌کند. */
fun effectParamsAt(fx: EffectRef, tLocal: Double): Map<String, Double> {
    val base = fx.params.toMutableMap()
    for ((key, list) in fx.keyframes) {
        if (list.isNotEmpty() && base[key] is Double) {
            base[key] = valueAt(list, tLocal, base[key] ?: 0.0)
        }
    }
    return base
}

/** آیا افکت فعال است؟ (پیش‌فرض فعال؛ enabled=false یعنی خاموش) */
fun isFxOn(fx: EffectRef): Boolean = fx.enabled

/** بزرگنمایی دوربین در زمان t — کی‌فریم‌های zoom وگرنه مقدار ثابت. */
fun cameraZoomAt(layer: Layer, t: Double): Double {
    val kfs = layer.keyframes["zoom"]
    return if (kfs != null) valueAt(kfs, t - layer.start, layer.camera?.zoom ?: 1.0) else (layer.camera?.zoom ?: 1.0)
}

/** ترنسفورم نهایی لایه در زمان t (با کی‌فریم‌ها و افکت‌های anim). */
fun layerTransform(layer: Layer, t: Double): Transform {
    var tr = layer.transform
    for (prop in PROPS) {
        val kfs = layer.keyframes[prop]
        if (kfs != null) {
            val v = valueAt(kfs, t, propValue(tr, prop))
            tr = setProp(tr, prop, v)
        }
    }
    // افکت‌های انیمیشنی روی ترنسفورم — همان ریاضی وب
    for (fx in layer.effects.filter(::isFxOn)) {
        val p = effectParamsAt(fx, t - layer.start)
        when (fx.id) {
            "shake" -> {
                val s = (p["speed"] ?: 8.0) * t
                tr = tr.copy(
                    x = tr.x + sin(s * 2.1) * (p["amount"] ?: 6.0),
                    y = tr.y + cos(s * 1.7) * (p["amount"] ?: 6.0),
                )
            }
            "pulse" -> {
                val k = 1.0 + sin(t * (p["speed"] ?: 2.0) * PI * 2.0) * (p["amount"] ?: 0.1)
                tr = tr.copy(scaleX = tr.scaleX * k, scaleY = tr.scaleY * k)
            }
            "spin" -> tr = tr.copy(rotation = tr.rotation + (p["speed"] ?: 90.0) * t)
            "float" -> tr = tr.copy(y = tr.y + sin(t * (p["speed"] ?: 1.0) * PI * 2.0) * (p["amount"] ?: 10.0))
            "bounce" -> {
                val u = (t * (p["speed"] ?: 2.0)) % 1.0
                tr = tr.copy(y = tr.y - abs(sin(u * PI)) * (p["amount"] ?: 20.0))
            }
            "kenburns" -> {
                val prog = (t - layer.start) / maxOf(0.01, layer.end - layer.start)
                val k = 1.0 + (p["amount"] ?: 0.15) * prog.coerceIn(0.0, 1.0)
                tr = tr.copy(scaleX = tr.scaleX * k, scaleY = tr.scaleY * k)
            }
            "drift" -> {
                val a = ((p["rot"] ?: 0.0) * PI) / 180.0
                tr = tr.copy(
                    x = tr.x + cos(a) * (p["speed"] ?: 10.0) * t,
                    y = tr.y + sin(a) * (p["speed"] ?: 10.0) * t,
                )
            }
            "wobble" -> {
                val s = t * (p["freq"] ?: 1.0) * PI * 2.0
                tr = tr.copy(
                    x = tr.x + sin(s) * (p["amt"] ?: 8.0),
                    y = tr.y + cos(s * 0.7) * (p["amt"] ?: 8.0) * 0.5,
                )
            }
            "floaty" -> tr = tr.copy(y = tr.y + sin(t * (p["freq"] ?: 1.0) * PI * 2.0) * (p["amt"] ?: 10.0))
            "wiggle" -> {
                val s = t * (p["freq"] ?: 1.0) * PI * 2.0
                tr = tr.copy(
                    rotation = tr.rotation + sin(s) * (p["rot"] ?: 5.0),
                    x = tr.x + sin(s * 1.3) * (p["amt"] ?: 6.0),
                )
            }
            "swing" -> tr = tr.copy(rotation = tr.rotation + sin(t * (p["freq"] ?: 1.0) * PI * 2.0) * (p["ang"] ?: 10.0))
            "orbit" -> {
                val s = t * (p["freq"] ?: 1.0) * PI * 2.0
                tr = tr.copy(
                    x = tr.x + cos(s) * (p["r"] ?: 20.0),
                    y = tr.y + sin(s) * (p["r"] ?: 20.0),
                )
            }
            "zoomPulse" -> {
                val k = 1.0 + sin(t * (p["freq"] ?: 1.0) * PI * 2.0) * (p["amt"] ?: 0.1)
                tr = tr.copy(scaleX = tr.scaleX * k, scaleY = tr.scaleY * k)
            }
            "mirror" -> {
                if ((p["axis"] ?: 0.0) >= 0.5) tr = tr.copy(scaleY = tr.scaleY * -1.0)
                else tr = tr.copy(scaleX = tr.scaleX * -1.0)
            }
        }
    }
    return tr
}

private fun propValue(tr: Transform, prop: String): Double = when (prop) {
    "x" -> tr.x
    "y" -> tr.y
    "scaleX" -> tr.scaleX
    "scaleY" -> tr.scaleY
    "rotation" -> tr.rotation
    "opacity" -> tr.opacity
    else -> 0.0
}

private fun setProp(tr: Transform, prop: String, v: Double): Transform = when (prop) {
    "x" -> tr.copy(x = v)
    "y" -> tr.copy(y = v)
    "scaleX" -> tr.copy(scaleX = v)
    "scaleY" -> tr.copy(scaleY = v)
    "rotation" -> tr.copy(rotation = v)
    "opacity" -> tr.copy(opacity = v)
    else -> tr
}

/** شفافیت نهایی (ترنسفورم + fade + blink + flash). */
fun layerOpacity(layer: Layer, t: Double): Double {
    var o = layerTransform(layer, t).opacity
    for (fx in layer.effects.filter(::isFxOn)) {
        val p = effectParamsAt(fx, t - layer.start)
        when (fx.id) {
            "fade" -> o *= (p["amount"] ?: 1.0)
            "blink" -> o *= if (sin(t * (p["speed"] ?: 4.0) * PI * 2.0) > 0) 1.0 else 0.15
            "flash" -> o *= 0.6 + 0.4 * sin(t * (p["speed"] ?: 2.0) * PI * 2.0)
            "fadePulse" -> o *= 1.0 - (p["amt"] ?: 0.5) * (0.5 + 0.5 * sin(t * (p["freq"] ?: 1.0) * PI * 2.0))
            "strobe" -> o *= if (sin(t * (p["rate"] ?: 4.0) * PI * 2.0) > 0) 1.0 else 1.0 - (p["depth"] ?: 0.8)
        }
    }
    return o.coerceIn(0.0, 1.0)
}

/** آیا لایه در زمان t فعال است؟ */
fun isActive(layer: Layer, t: Double): Boolean = t >= layer.start && t < layer.end

/** لایه‌های فعال به ترتیب رسم (پایین آرایه = عقب). */
fun visibleLayers(project: Project, t: Double): List<Layer> = project.layers.filter { isActive(it, t) }

/** پارامترهای فیلتر رنگ لایه (kind=filter) — معادل filterString وب، ولی به‌صورت داده. */
data class FilterParams(
    val brightness: Double = 0.0,
    val contrast: Double = 0.0,
    val saturation: Double = 0.0,
    val hueShift: Double = 0.0,
    val grayscale: Double = 0.0,
    val sepia: Double = 0.0,
    val invert: Double = 0.0,
    val blur: Double = 0.0,
) {
    val isIdentity: Boolean
        get() = brightness == 0.0 && contrast == 0.0 && saturation == 0.0 && hueShift == 0.0 &&
            grayscale == 0.0 && sepia == 0.0 && invert == 0.0 && blur == 0.0
}

fun filterParamsFor(layer: Layer, t: Double): FilterParams {
    var b = 0.0; var c = 0.0; var s = 0.0; var h = 0.0
    var g = 0.0; var se = 0.0; var inv = 0.0; var bl = 0.0
    for (fx in layer.effects.filter(::isFxOn)) {
        val p = effectParamsAt(fx, t - layer.start)
        when (fx.id) {
            "brightness" -> b += (p["amount"] ?: 0.0)
            "contrast" -> c += (p["amount"] ?: 0.0)
            "saturation" -> s += (p["amount"] ?: 0.0)
            "hueShift" -> h += (p["amount"] ?: 0.0)
            "grayscale" -> g = (p["amount"] ?: 0.0)
            "sepia" -> se = (p["amount"] ?: 0.0)
            "invert" -> inv = (p["amount"] ?: 0.0)
            "blur" -> bl = (p["amount"] ?: 0.0)
        }
    }
    return FilterParams(b, c, s, h, g, se, inv, bl)
}

/** پارامترهای افکت تکرارکنندهٔ فعال لایه (در زمان t) یا null. */
data class RepeatParams(
    val count: Double = 2.0,
    val dx: Double = 0.0,
    val dy: Double = 0.0,
    val rot: Double = 0.0,
    val scale: Double = 100.0,
    val fade: Double = 0.0,
)

fun repeatOf(layer: Layer, t: Double): RepeatParams? {
    for (fx in layer.effects.filter(::isFxOn)) {
        if (fx.id == "repeat") {
            val p = effectParamsAt(fx, t - layer.start)
            return RepeatParams(
                count = p["count"] ?: 2.0,
                dx = p["dx"] ?: 0.0,
                dy = p["dy"] ?: 0.0,
                rot = p["rot"] ?: 0.0,
                scale = p["scale"] ?: 100.0,
                fade = p["fade"] ?: 0.0,
            )
        }
    }
    return null
}
