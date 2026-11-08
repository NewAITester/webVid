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
data class TextSpec(
    val content: String = "",
    val font: String = "IRANSansX",
    val weight: Int = 400,
    val size: Double = 48.0,
    val color: String = "#FAFAFA",
    val align: String = "center",
    val lineHeight: Double = 1.3,
)

@Serializable
data class AudioSpec(
    val src: String? = null,
    val volume: Double = 1.0,
    val fadeIn: Double = 0.0,
    val fadeOut: Double = 0.0,
)

@Serializable
data class Layer(
    val id: String,
    val type: String, // shape | text | media | audio | draw | group | camera | vector | element
    val name: String,
    val start: Double = 0.0,
    val end: Double = 10.0,
    val clip: String = "none", // none | below | belowInv
    val transform: Transform = Transform(),
    val keyframes: Map<String, List<Keyframe>> = emptyMap(),
    val effects: List<EffectRef> = emptyList(),
    val shape: ShapeSpec? = null,
    val text: TextSpec? = null,
    val audio: AudioSpec? = null,
    val solo: Boolean = false,
)

fun uid(): String = java.util.UUID.randomUUID().toString().replace("-", "").take(12)

fun newProject(name: String, width: Int = 720, height: Int = 1280): Project =
    Project(id = uid(), name = name, width = width, height = height)

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
