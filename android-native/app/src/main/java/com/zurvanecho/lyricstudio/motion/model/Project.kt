package com.zurvanecho.lyricstudio.motion.model

import kotlinx.serialization.Serializable

/**
 * مدل پروژه — همان شکل JSON نسخهٔ وب (src/core/schema.js) تا پروژه‌ها
 * بین وب و نیتیو قابل جابه‌جایی بمانند. ترتیب لایه‌ها: پایین = عقب، بالا = جلو.
 */
@Serializable
data class Project(
    val id: String,
    val name: String,
    val width: Int = 720,
    val height: Int = 1280,
    val fps: Int = 30,
    val duration: Double = 10.0,
    val bg: String = "#0C0D13",
    val layers: List<Layer> = emptyList(),
    /** نشان‌های زمانی (بوک‌مارک) روی خط‌کش تایم‌لاین — ثانیهٔ پروژه. */
    val bookmarks: List<Double> = emptyList(),
)

@Serializable
data class Transform(
    val x: Double = 0.0,
    val y: Double = 0.0,
    val scaleX: Double = 1.0,
    val scaleY: Double = 1.0,
    val rotation: Double = 0.0,
    val opacity: Double = 1.0,
    val anchorX: Double = 0.5,
    val anchorY: Double = 0.5,
)

@Serializable
data class Keyframe(
    val t: Double,
    val value: Double,
    /** نام easing این کی‌فریم (linear | easeIn | easeOut | easeInOut | ...) */
    val ease: String = "linear",
)

@Serializable
data class EffectRef(
    val id: String,
    val params: Map<String, Double> = emptyMap(),
    val enabled: Boolean = true,
    /** پارامترهای متنی (مثل رنگ) جدا نگه داشته می‌شوند */
    val textParams: Map<String, String> = emptyMap(),
    val keyframes: Map<String, List<Keyframe>> = emptyMap(),
)

@Serializable
data class ShapeSpec(
    val kind: String = "rect", // rect | ring | ellipse | star | ...
    val fill: String? = null,
    val stroke: String? = null,
    val strokeWidth: Double = 0.0,
    val w: Double = 100.0,
    val h: Double = 100.0,
)

@Serializable
data class WordTiming(val t: Double, val text: String)

@Serializable
data class TextSpec(
    val content: String = "",
    val font: String = "IRANSansX",
    val weight: Int = 400,
    val size: Double = 48.0,
    val color: String = "#FAFAFA",
    val align: String = "center",
    val lineHeight: Double = 1.3,
    /** زمان‌بندی کلمه‌ها (نسبی به شروع لایه) برای کارائوکه — از LRC می‌آید. */
    val words: List<WordTiming> = emptyList(),
)

@Serializable
data class AudioSpec(
    val src: String? = null,
    val volume: Double = 1.0,
    val fadeIn: Double = 0.0,
    val fadeOut: Double = 0.0,
)

/** یک ضربهٔ قلم آزاد (لایهٔ draw): نقاط نسبی به مرکز لایه. */
@Serializable
data class StrokePoint(val x: Double, val y: Double)

@Serializable
data class Stroke(
    val color: String = "#FAFAFA",
    val width: Double = 5.0,
    val points: List<StrokePoint> = emptyList(),
)

/** تنظیمات لایهٔ دوربین (camera): بزرگنمایی صحنه. */
@Serializable
data class CameraSpec(val zoom: Double = 1.0)

@Serializable
data class Layer(
    val id: String,
    val type: String, // shape | text | image | video | audio | draw | group | camera | null
    val name: String,
    val start: Double = 0.0,
    val end: Double = 10.0,
    /** ضریب سرعت پخش (۱٫۰ = طبیعی؛ مثل retime آلایت). */
    val speed: Double = 1.0,
    val clip: String = "none", // none | below | belowInv
    val transform: Transform = Transform(),
    val keyframes: Map<String, List<Keyframe>> = emptyMap(),
    val effects: List<EffectRef> = emptyList(),
    val shape: ShapeSpec? = null,
    val text: TextSpec? = null,
    val audio: AudioSpec? = null,
    /** منبع رسانه (image/video/audio): مسیر فایل یا content:// URI */
    val src: String? = null,
    /** فرزندان لایهٔ گروه */
    val children: List<Layer> = emptyList(),
    /** ضربه‌های قلم لایهٔ draw */
    val strokes: List<Stroke> = emptyList(),
    /** تنظیمات لایهٔ دوربین */
    val camera: CameraSpec? = null,
    /** حالت ترکیب (normal | multiply | screen | overlay | ...) */
    val blend: String = "normal",
    val solo: Boolean = false,
)

fun uid(): String = java.util.UUID.randomUUID().toString().replace("-", "").take(12)

/**
 * نسبت‌های تصویر واقعی Alight (از create_project_fragment دیکدشده):
 * 16:9، 9:16، 4:5، 1:1، 4:3 + سفارشی. هرکدام ابعاد پایه‌اش را می‌دهد.
 */
data class AspectRatio(val id: String, val label: String, val w: Int, val h: Int)

val ASPECT_RATIOS = listOf(
    AspectRatio("16x9", "۱۶:۹", 1280, 720),
    AspectRatio("9x16", "۹:۱۶", 720, 1280),
    AspectRatio("4x5", "۴:۵", 1080, 1350),
    AspectRatio("1x1", "۱:۱", 1080, 1080),
    AspectRatio("4x3", "۴:۳", 1440, 1080),
)

/** رزولوشن‌ها (پیکسلِ ضلع بزرگ) — همان ResolutionDropdown آلایت. */
val RESOLUTIONS = listOf(720, 1080)

/** نرخ فریم‌ها — همان FpsDropdown آلایت. */
val FRAME_RATES = listOf(24, 30, 60)

/** رنگ‌های پس‌زمینهٔ پیش‌فرض — همان ColorDropdown آلایت. */
val BG_COLORS = listOf("#0C0D13", "#000000", "#FFFFFF", "#141620", "#F16586", "#00FFA8")

/** ساخت پروژهٔ تازه و خالی با تنظیمات کاربر (بدون لایهٔ نمایشی). */
fun newProject(
    name: String,
    width: Int = 720,
    height: Int = 1280,
    fps: Int = 30,
    bg: String = "#0C0D13",
    duration: Double = 10.0,
): Project = Project(id = uid(), name = name, width = width, height = height, fps = fps, bg = bg, duration = duration)

fun newLayer(type: String, name: String, start: Double = 0.0, end: Double = 10.0): Layer =
    Layer(id = uid(), type = type, name = name, start = start, end = end)

/** پروژهٔ نمایشی — همان demoProject نسخهٔ وب (۴ لایه، ۱۰ ثانیه). */
fun demoProject(): Project {
    val p = newProject("نمایش")
    val bg = newLayer("shape", "پس‌زمینه", 0.0, 10.0).copy(
        shape = ShapeSpec(kind = "rect", fill = "#141620", w = 720.0, h = 1280.0),
        transform = Transform(x = 360.0, y = 640.0),
    )
    val ring = newLayer("shape", "حلقه", 0.0, 10.0).copy(
        shape = ShapeSpec(kind = "ring", fill = "#F16586", w = 420.0, h = 420.0),
        transform = Transform(x = 360.0, y = 560.0),
        effects = listOf(EffectRef(id = "pulse", params = mapOf("amount" to 0.12, "speed" to 1.5))),
    )
    val title = newLayer("text", "عنوان", 0.3, 9.0).copy(
        text = TextSpec(content = "لیریک استودیو", weight = 900, size = 72.0, color = "#FAFAFA"),
        transform = Transform(x = 360.0, y = 640.0),
    )
    val sub = newLayer("text", "زیرنویس", 1.0, 9.0).copy(
        text = TextSpec(content = "مثل آلایت موشن", weight = 500, size = 34.0, color = "#C4C5CB"),
        transform = Transform(x = 360.0, y = 730.0),
    )
    return p.copy(duration = 10.0, layers = listOf(bg, ring, title, sub))
}
