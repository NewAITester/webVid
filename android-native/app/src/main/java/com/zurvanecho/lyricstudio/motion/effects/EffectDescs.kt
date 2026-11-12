package com.zurvanecho.lyricstudio.motion.effects

/**
 * توضیح انگلیسی افکت‌ها — از رشته‌های effect_<id>_desc نسخهٔ آلایت
 * (res/values/strings.xml فایل دیکدشده). شناسه‌های رجیستری camelCaseاند
 * و رشته‌های آلایت snake_case؛ تطبیق با تبدیل camelCase به snake_case.
 * در جزئیات افکت (مرورگر افکت) نمایش داده می‌شود.
 */
object EffectDescs {
    val DESCS: Map<String, String> = mapOf(
        "bend" to "Bends the layer along a circular arc.",
        "blink" to "Automatically adjusts the opacity of the layer, alternating between its normal value and zero over time.",
        "checker" to "Renders a checkerboard pattern in the opaque parts of the layer.",
        "clouds" to "Renders a procedurally generated cloud pattern in the opaque parts of the layer.",
        "cylinder" to "Renders a faux-3D cylinder using the layer as a surface texture.",
        "edgeGlow" to "Detects edges in a photo or video and creates a glow around them.",
        "exposure" to "Adjusts the exposure, gamma curve, and luminance offset of photo and video layers.",
        "fade" to "Automatically animates the layer opacity to fade the layer in at its beginning, and out again at its end.",
        "feather" to "Softens the edges of the opaque part of the layer by blurring the alpha channel.",
        "flicker" to "Randomly flickers the layer by automatically adjusting the opacity over time.",
        "glow" to "Draws a glow around the outside of the opaque parts of the layer.",
        "grid" to "Overlays the opaque parts of the layer with grid lines.",
        "invert" to "\"Inverts the layer's red, green, or blue channels independently.\"",
        "jitter" to "Automatically jumps the layer randomly back and forth over time, along a selected angle.",
        "kaleidoscope" to "Creates symmetric radial reflections of the layer.",
        "mirror" to "Overlays the layer with a copy of itself mirrored along either the horizontal or vertical axis, with optional alpha and blending mode control.",
        "mosaic" to "Divides the layer into array of squares and averages the color of each square, resulting in a pixelated look.",
        "noise" to "Blends random noise with the opaque parts of the layer.",
        "pageCurl" to "Curls a corner of the layer upwards as if the layer were made of paper or thin plastic.",
        "pixelate" to "Decreases the layer resolution so that individual pixels become visible, sampling at the centers of the pixels, and drawing each pixel with an optional vignette.",
        "posterize" to "\"Decreases the number of step in the layer's color channels.\"",
        "repeat" to "Dynamically generates multiple copies of the layer.",
        "shake" to "Moves the layer randomly over time within specified parameters.",
        "sharpen" to "Enhances details in the layer by increasing the contrast wherever there are abrupt differences in the luminance of nearby pixels in the layer.",
        "spin" to "Automatically spins the layer at a given speed.",
        "squeeze" to "Distorts the layer by squeezing it along one axis while expanding it along the other axis.",
        "swing" to "Automatically rotates the layer back and forth over time.",
        "swirl" to "Warps the layer by rotating it different amounts based on the distance from a center-point, resulting in a vortex or whirlpool-like distortion.",
        "threshold" to "Converts the layer to black and white with a hard cutoff at the specified luminance threshold.",
        "tunnel" to "Renders a round faux-3D tunnel using the layer as the interior surface texture.",
        "vignette" to "Darkens the edges of the layer.",
        "wipe" to "Masks out rectangular segments from opposite sides of the layer. Use keyframe animation to create a wipe transition.",
    )

    fun byId(id: String): String? = DESCS[id]
}
