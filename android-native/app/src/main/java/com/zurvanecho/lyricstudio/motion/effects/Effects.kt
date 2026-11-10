package com.zurvanecho.lyricstudio.motion.effects

/**
 * رجیستری ۲۹۱ افکت — تولید خودکار از src/core/schema.js نسخهٔ وب
 * (همان شناسه، نام فارسی، دسته، kind و پارامترها؛ بدون تغییر دستی).
 * kind: 'filter' (فیلتر رنگ) | 'canvas' (عملیات پیکسلی) | 'anim' (زمان/ترنسفورم).
 */

/** تعریف یک پارامتر افکت. type: 'n' عددی | 'c' رنگ. */
data class ParamDef(
    val type: String,
    val defNum: Double = 0.0,
    val defStr: String = "",
    val min: Double = 0.0,
    val max: Double = 0.0,
    val label: String = "",
)

data class EffectDef(
    val id: String,
    val name: String,
    val cat: String,
    val kind: String,
    val params: Map<String, ParamDef> = emptyMap(),
)

object Effects {
    val ALL: List<EffectDef> = listOf(
        EffectDef("brightness", "روشنایی", "color", "filter", mapOf(
            "amount" to ParamDef("n", 0.0, "", -1.0, 1.0, "مقدار"),
        )),
        EffectDef("contrast", "کنتراست", "color", "filter", mapOf(
            "amount" to ParamDef("n", 0.0, "", -1.0, 1.0, "مقدار"),
        )),
        EffectDef("saturation", "اشباع", "color", "filter", mapOf(
            "amount" to ParamDef("n", 0.0, "", -1.0, 1.0, "مقدار"),
        )),
        EffectDef("hueShift", "چرخش رنگ", "color", "filter", mapOf(
            "amount" to ParamDef("n", 0.0, "", -180.0, 180.0, "درجه"),
        )),
        EffectDef("grayscale", "سیاه‌سفید", "color", "filter", mapOf(
            "amount" to ParamDef("n", 1.0, "", 0.0, 1.0, "مقدار"),
        )),
        EffectDef("sepia", "سپیا", "color", "filter", mapOf(
            "amount" to ParamDef("n", 1.0, "", 0.0, 1.0, "مقدار"),
        )),
        EffectDef("invert", "معکوس", "color", "filter", mapOf(
            "amount" to ParamDef("n", 1.0, "", 0.0, 1.0, "مقدار"),
        )),
        EffectDef("temperature", "دما", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", -100.0, 100.0, "دما"),
        )),
        EffectDef("tint", "ته‌رنگ", "color", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#E4142A", 0.0, 0.0, "رنگ"),
            "amt" to ParamDef("n", 60.0, "", 0.0, 100.0, "میزان"),
        )),
        EffectDef("threshold", "آستانه", "color", "canvas", mapOf(
            "level" to ParamDef("n", 50.0, "", 0.0, 100.0, "مرز"),
            "c1" to ParamDef("c", 0.0, "#000000", 0.0, 0.0, "تیره"),
            "c2" to ParamDef("c", 0.0, "#FFFFFF", 0.0, 0.0, "روشن"),
        )),
        EffectDef("posterize", "پوستریز", "color", "canvas", mapOf(
            "levels" to ParamDef("n", 4.0, "", 2.0, 16.0, "سطح"),
        )),
        EffectDef("blur", "محو", "blur", "filter", mapOf(
            "amount" to ParamDef("n", 8.0, "", 0.0, 40.0, "شعاع"),
        )),
        EffectDef("motionBlur", "محو حرکتی", "blur", "canvas", mapOf(
            "amount" to ParamDef("n", 10.0, "", 0.0, 40.0, "مقدار"),
            "angle" to ParamDef("n", 0.0, "", -180.0, 180.0, "زاویه"),
        )),
        EffectDef("radialBlur", "محو شعاعی", "blur", "canvas", mapOf(
            "amount" to ParamDef("n", 0.4, "", 0.0, 1.0, "مقدار"),
        )),
        EffectDef("sharpen", "تیز کردن", "blur", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("pixelate", "پیکسلی", "distort", "canvas", mapOf(
            "size" to ParamDef("n", 12.0, "", 2.0, 64.0, "اندازه"),
        )),
        EffectDef("bulge", "برآمدگی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", -100.0, 100.0, "شدت"),
            "r" to ParamDef("n", 60.0, "", 10.0, 100.0, "شعاع"),
        )),
        EffectDef("twirl", "چرخش", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", -200.0, 200.0, "شدت"),
            "r" to ParamDef("n", 70.0, "", 10.0, 100.0, "شعاع"),
        )),
        EffectDef("pinch", "نیشگون", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", -100.0, 100.0, "شدت"),
            "r" to ParamDef("n", 60.0, "", 10.0, 100.0, "شعاع"),
        )),
        EffectDef("ripple", "موج", "distort", "canvas", mapOf(
            "amount" to ParamDef("n", 8.0, "", 0.0, 30.0, "دامنه"),
            "freq" to ParamDef("n", 6.0, "", 1.0, 20.0, "فرکانس"),
        )),
        EffectDef("wave", "موج‌دار", "distort", "canvas", mapOf(
            "amount" to ParamDef("n", 6.0, "", 0.0, 30.0, "دامنه"),
            "freq" to ParamDef("n", 4.0, "", 1.0, 20.0, "فرکانس"),
        )),
        EffectDef("vortex", "گرداب", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 60.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("fade", "محو شدن", "opacity", "anim", mapOf(
            "amount" to ParamDef("n", 1.0, "", 0.0, 1.0, "مقدار"),
        )),
        EffectDef("blink", "چشمک", "opacity", "anim", mapOf(
            "speed" to ParamDef("n", 4.0, "", 0.5, 20.0, "سرعت"),
        )),
        EffectDef("glow", "درخشش", "stylize", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#FFFFFF", 0.0, 0.0, "رنگ"),
            "amount" to ParamDef("n", 16.0, "", 0.0, 60.0, "شعاع"),
        )),
        EffectDef("outline", "حاشیه", "stylize", "canvas", mapOf(
            "w" to ParamDef("n", 6.0, "", 0.0, 60.0, "ضخامت"),
            "color" to ParamDef("c", 0.0, "#FFFFFF", 0.0, 0.0, "رنگ"),
        )),
        EffectDef("dropShadow", "سایه", "stylize", "canvas", mapOf(
            "dx" to ParamDef("n", 4.0, "", -30.0, 30.0, "X"),
            "dy" to ParamDef("n", 4.0, "", -30.0, 30.0, "Y"),
            "blur" to ParamDef("n", 8.0, "", 0.0, 40.0, "محو"),
            "color" to ParamDef("c", 0.0, "#000000", 0.0, 0.0, "رنگ"),
        )),
        EffectDef("vignette", "وینیت", "stylize", "canvas", mapOf(
            "amount" to ParamDef("n", 0.5, "", 0.0, 1.0, "مقدار"),
        )),
        EffectDef("noise", "نویز", "procedural", "canvas", mapOf(
            "amount" to ParamDef("n", 0.15, "", 0.0, 1.0, "مقدار"),
        )),
        EffectDef("scanlines", "خطوط اسکن", "procedural", "canvas", mapOf(
            "gap" to ParamDef("n", 4.0, "", 2.0, 12.0, "فاصله"),
            "amount" to ParamDef("n", 0.3, "", 0.0, 1.0, "مقدار"),
        )),
        EffectDef("shake", "لرزش", "transform", "anim", mapOf(
            "amount" to ParamDef("n", 6.0, "", 0.0, 40.0, "دامنه"),
            "speed" to ParamDef("n", 8.0, "", 1.0, 30.0, "سرعت"),
        )),
        EffectDef("mirror", "آینه", "transform", "anim", mapOf(
            "axis" to ParamDef("n", 0.0, "", 0.0, 1.0, "محور"),
        )),
        EffectDef("pulse", "تپش", "transform", "anim", mapOf(
            "amount" to ParamDef("n", 0.1, "", 0.0, 0.6, "دامنه"),
            "speed" to ParamDef("n", 2.0, "", 0.5, 10.0, "سرعت"),
        )),
        EffectDef("spin", "چرخش", "transform", "anim", mapOf(
            "speed" to ParamDef("n", 90.0, "", -360.0, 360.0, "درجه/ثانیه"),
        )),
        EffectDef("float", "شناور", "transform", "anim", mapOf(
            "amount" to ParamDef("n", 10.0, "", 0.0, 60.0, "دامنه"),
            "speed" to ParamDef("n", 1.0, "", 0.2, 5.0, "سرعت"),
        )),
        EffectDef("bounce", "جهش", "transform", "anim", mapOf(
            "amount" to ParamDef("n", 20.0, "", 0.0, 80.0, "دامنه"),
            "speed" to ParamDef("n", 2.0, "", 0.5, 8.0, "سرعت"),
        )),
        EffectDef("typewriter", "تایپ", "text", "anim", mapOf(
            "speed" to ParamDef("n", 12.0, "", 1.0, 60.0, "حرف/ثانیه"),
        )),
        EffectDef("tracking", "فاصلهٔ حروف", "text", "anim", mapOf(
            "amount" to ParamDef("n", 0.0, "", -10.0, 40.0, "پیکسل"),
        )),
        EffectDef("textGlow", "درخشش متن", "text", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#F16586", 0.0, 0.0, "رنگ"),
            "amount" to ParamDef("n", 12.0, "", 0.0, 50.0, "شعاع"),
        )),
        EffectDef("perspective", "پرسپکتیو", "3d", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", -90.0, 90.0, "شدت"),
        )),
        EffectDef("tile", "کاشی", "repeat", "canvas", mapOf(
            "cols" to ParamDef("n", 2.0, "", 1.0, 6.0, "ستون"),
            "rows" to ParamDef("n", 2.0, "", 1.0, 6.0, "ردیف"),
        )),
        EffectDef("kaleidoscope", "کالیدوسکوپ", "repeat", "canvas", mapOf(
            "segments" to ParamDef("n", 6.0, "", 2.0, 12.0, "بخش"),
        )),
        EffectDef("chroma", "کروما", "matte", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#00FF00", 0.0, 0.0, "رنگ حذفی"),
            "tol" to ParamDef("n", 32.0, "", 0.0, 100.0, "دامنه"),
            "soft" to ParamDef("n", 12.0, "", 0.0, 100.0, "نرمی لبه"),
        )),
        EffectDef("chromaShift", "جابه‌جایی رنگ", "stylize", "canvas", mapOf(
            "amount" to ParamDef("n", 6.0, "", 0.0, 30.0, "پیکسل"),
        )),
        EffectDef("flash", "فلش", "opacity", "anim", mapOf(
            "speed" to ParamDef("n", 2.0, "", 0.5, 10.0, "سرعت"),
        )),
        EffectDef("kenburns", "کن برنز", "transform", "anim", mapOf(
            "amount" to ParamDef("n", 0.15, "", 0.0, 0.6, "مقدار"),
        )),
        EffectDef("shadow", "سایه", "stylize", "canvas", mapOf(
            "dx" to ParamDef("n", 10.0, "", -200.0, 200.0, "افقی"),
            "dy" to ParamDef("n", 12.0, "", -200.0, 200.0, "عمودی"),
            "r" to ParamDef("n", 16.0, "", 0.0, 100.0, "نرمی"),
            "color" to ParamDef("c", 0.0, "#000000", 0.0, 0.0, "رنگ"),
            "op" to ParamDef("n", 75.0, "", 0.0, 100.0, "شفافیت"),
        )),
        EffectDef("extrude", "سه‌بعدی (عمق)", "stylize", "canvas", mapOf(
            "len" to ParamDef("n", 18.0, "", 0.0, 120.0, "عمق"),
            "ang" to ParamDef("n", 45.0, "", -180.0, 180.0, "زاویه"),
            "color" to ParamDef("c", 0.0, "#8A0A18", 0.0, 0.0, "رنگ عمق"),
        )),
        EffectDef("longShadow", "سایهٔ بلند", "stylize", "canvas", mapOf(
            "len" to ParamDef("n", 80.0, "", 0.0, 400.0, "طول"),
            "ang" to ParamDef("n", 45.0, "", -180.0, 180.0, "زاویه"),
            "color" to ParamDef("c", 0.0, "#00000066", 0.0, 0.0, "رنگ"),
        )),
        EffectDef("shine", "برق زدن", "stylize", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#FFFFFF", 0.0, 0.0, "رنگ نور"),
            "width" to ParamDef("n", 18.0, "", 2.0, 80.0, "پهنا"),
            "ang" to ParamDef("n", 20.0, "", -90.0, 90.0, "زاویه"),
            "every" to ParamDef("n", 2.0, "", 0.3, 10.0, "هر چند ثانیه"),
            "op" to ParamDef("n", 80.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("leak", "نشت نور", "stylize", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#FF6A2A", 0.0, 0.0, "رنگ ۱"),
            "color2" to ParamDef("c", 0.0, "#FFD36B", 0.0, 0.0, "رنگ ۲"),
            "amt" to ParamDef("n", 60.0, "", 0.0, 100.0, "شدت"),
            "speed" to ParamDef("n", 30.0, "", 0.0, 200.0, "سرعت"),
        )),
        EffectDef("beatFlash", "فلاش با ضرب", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 80.0, "", 0.0, 300.0, "شدت"),
            "color" to ParamDef("c", 0.0, "#FFFFFF", 0.0, 0.0, "رنگ فلاش"),
        )),
        EffectDef("rgb", "تفکیک رنگ", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 8.0, "", 0.0, 80.0, "فاصله"),
            "ang" to ParamDef("n", 0.0, "", -360.0, 360.0, "زاویه"),
        )),
        EffectDef("glitch", "گلیچ", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
            "speed" to ParamDef("n", 12.0, "", 1.0, 60.0, "سرعت"),
            "beat" to ParamDef("n", 60.0, "", 0.0, 100.0, "وابستگی به ضرب"),
        )),
        EffectDef("vhs", "نوار VHS", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 60.0, "", 0.0, 100.0, "شدت"),
            "lines" to ParamDef("n", 50.0, "", 0.0, 100.0, "خطوط"),
        )),
        EffectDef("scan", "خطوط تلویزیون", "stylize", "canvas", mapOf(
            "gap" to ParamDef("n", 4.0, "", 2.0, 30.0, "فاصله"),
            "op" to ParamDef("n", 35.0, "", 0.0, 100.0, "تیرگی"),
            "speed" to ParamDef("n", 20.0, "", 0.0, 200.0, "حرکت"),
        )),
        EffectDef("grain", "دانهٔ فیلم", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
            "size" to ParamDef("n", 1.5, "", 1.0, 6.0, "درشتی"),
        )),
        EffectDef("halftone", "نقطه‌ای (چاپی)", "stylize", "canvas", mapOf(
            "size" to ParamDef("n", 10.0, "", 3.0, 60.0, "اندازهٔ نقطه"),
            "color" to ParamDef("c", 0.0, "#00000000", 0.0, 0.0, "رنگ نقطه (شفاف = رنگ خود تصویر)"),
        )),
        EffectDef("pixel", "پیکسلی", "stylize", "canvas", mapOf(
            "size" to ParamDef("n", 14.0, "", 1.0, 120.0, "اندازهٔ خانه"),
        )),
        EffectDef("lumaKey", "کلید روشنایی", "stylize", "canvas", mapOf(
            "level" to ParamDef("n", 50.0, "", 0.0, 100.0, "مرز"),
            "soft" to ParamDef("n", 20.0, "", 0.0, 100.0, "نرمی"),
            "mode" to ParamDef("n", 0.0, "", 0.0, 1.0, "حالت: ۰ حذف تیره، ۱ حذف روشن"),
        )),
        EffectDef("wipe", "پاک‌کن شعاعی", "stylize", "canvas", mapOf(
            "prog" to ParamDef("n", 50.0, "", 0.0, 100.0, "پیشرفت"),
            "ang" to ParamDef("n", 0.0, "", -180.0, 180.0, "زاویهٔ شروع"),
        )),
        EffectDef("checker", "شطرنجی", "stylize", "canvas", mapOf(
            "size" to ParamDef("n", 40.0, "", 5.0, 200.0, "اندازهٔ خانه"),
            "op" to ParamDef("n", 40.0, "", 0.0, 100.0, "شفافیت"),
        )),
        EffectDef("flipH", "وارونهٔ افقی", "stylize", "canvas", mapOf(
        )),
        EffectDef("flipV", "وارونهٔ عمودی", "stylize", "canvas", mapOf(
        )),
        EffectDef("grid", "شبکه", "stylize", "canvas", mapOf(
            "size" to ParamDef("n", 60.0, "", 5.0, 300.0, "فاصلهٔ خطوط"),
            "op" to ParamDef("n", 35.0, "", 0.0, 100.0, "شفافیت"),
            "color" to ParamDef("c", 0.0, "#FFFFFF", 0.0, 0.0, "رنگ خط"),
        )),
        EffectDef("matte", "مات تیره/روشن", "stylize", "canvas", mapOf(
            "level" to ParamDef("n", 50.0, "", 0.0, 100.0, "مرز"),
            "soft" to ParamDef("n", 20.0, "", 0.0, 100.0, "نرمی"),
            "mode" to ParamDef("n", 0.0, "", 0.0, 1.0, "حالت: ۰ نگه داشتن روشن، ۱ نگه داشتن تیره"),
        )),
        EffectDef("edgeGlow", "درخشش لبه", "stylize", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#E4142A", 0.0, 0.0, "رنگ"),
            "amt" to ParamDef("n", 80.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("feather", "لبهٔ نرم", "stylize", "canvas", mapOf(
            "r" to ParamDef("n", 20.0, "", 0.0, 100.0, "شعاع"),
        )),
        EffectDef("neon", "نئون", "stylize", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#FF2D78", 0.0, 0.0, "رنگ"),
            "amt" to ParamDef("n", 80.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("lensFlare", "درخشش لنز", "stylize", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#FFD36B", 0.0, 0.0, "رنگ"),
            "amt" to ParamDef("n", 70.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("rain", "بارش", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "تراکم"),
            "speed" to ParamDef("n", 60.0, "", 0.0, 200.0, "سرعت بارش"),
            "ang" to ParamDef("n", 15.0, "", -45.0, 45.0, "زاویه"),
        )),
        EffectDef("innerShadow", "سایهٔ داخلی", "stylize", "canvas", mapOf(
            "r" to ParamDef("n", 16.0, "", 0.0, 100.0, "نرمی"),
            "op" to ParamDef("n", 60.0, "", 0.0, 100.0, "شفافیت"),
            "color" to ParamDef("c", 0.0, "#000000", 0.0, 0.0, "رنگ"),
        )),
        EffectDef("bevel", "لبهٔ برجسته", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 60.0, "", 0.0, 200.0, "شدت"),
            "ang" to ParamDef("n", 45.0, "", -180.0, 180.0, "زاویهٔ نور"),
        )),
        EffectDef("comic", "کمیک", "stylize", "canvas", mapOf(
            "level" to ParamDef("n", 50.0, "", 0.0, 100.0, "مرز"),
        )),
        EffectDef("echo", "پژواک", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "فاصله"),
            "n" to ParamDef("n", 4.0, "", 1.0, 8.0, "تعداد کپی"),
        )),
        EffectDef("dither", "دیتر", "stylize", "canvas", mapOf(
        )),
        EffectDef("haze", "مه", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("bloom", "شکوفایی نور", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("starburst", "ستارهٔ نور", "stylize", "canvas", mapOf(
            "n" to ParamDef("n", 12.0, "", 4.0, 24.0, "تعداد پرتو"),
            "amt" to ParamDef("n", 60.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("snow", "برف", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "تراکم"),
            "speed" to ParamDef("n", 50.0, "", 0.0, 200.0, "سرعت"),
        )),
        EffectDef("confetti", "کاغذ رنگی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "تراکم"),
            "speed" to ParamDef("n", 60.0, "", 0.0, 200.0, "سرعت"),
        )),
        EffectDef("fireflies", "کرم شب‌تاب", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("bokeh", "بوکه", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("halo", "هاله", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 60.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("dataMosh", "دیتاموش", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("inkBleed", "پخش جوهر", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("paperGrain", "کاغذ", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("lightSweep", "جاروی نور", "stylize", "canvas", mapOf(
            "speed" to ParamDef("n", 1.0, "", 0.1, 5.0, "سرعت"),
            "amt" to ParamDef("n", 60.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("dream", "رویا", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("noir", "نوآر", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 70.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("solarFlare", "شعلهٔ خورشیدی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 70.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("glowPulse", "درخشش تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 60.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("softFocus", "فوکوس نرم", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("anaglyph", "آنالیف سه‌بعدی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 10.0, "", 0.0, 40.0, "فاصله"),
        )),
        EffectDef("scanSweep", "خط اسکن", "stylize", "canvas", mapOf(
            "speed" to ParamDef("n", 1.0, "", 0.1, 5.0, "سرعت"),
        )),
        EffectDef("flicker", "سوسو", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("chromaticPulse", "تپش رنگی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("shatter", "خرد شدن", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
            "speed" to ParamDef("n", 1.0, "", 0.1, 5.0, "سرعت"),
        )),
        EffectDef("rowShift", "جابه‌جایی ردیف", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("lightRays", "پرتوهای چرخان", "stylize", "canvas", mapOf(
            "n" to ParamDef("n", 12.0, "", 4.0, 24.0, "تعداد پرتو"),
            "speed" to ParamDef("n", 0.5, "", 0.0, 3.0, "سرعت"),
        )),
        EffectDef("electric", "برق", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 70.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("smoke", "دود", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("dust", "غبار", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("vhsTracking", "ردیابی نوار", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("oldFilm", "فیلم قدیمی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 70.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("neonSign", "تابلوی نئون", "stylize", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#FF2D78", 0.0, 0.0, "رنگ"),
            "amt" to ParamDef("n", 80.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("scanNoise", "نویز اسکن", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("burst", "انفجار نور", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("sparkle", "جرقه", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("vignettePulse", "تاریکی لبهٔ تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("grainPulse", "دانهٔ تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("shadowPulse", "سایهٔ تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
            "dx" to ParamDef("n", 10.0, "", -200.0, 200.0, "افقی"),
            "dy" to ParamDef("n", 12.0, "", -200.0, 200.0, "عمودی"),
        )),
        EffectDef("strobeFlash", "چشمک‌زن", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 80.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("lightLeak", "نشت نور", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("neonPulse", "نئون تپنده", "stylize", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#00E5FF", 0.0, 0.0, "رنگ"),
            "amt" to ParamDef("n", 80.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("haloPulse", "هالهٔ تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("fireGlow", "درخشش آتش", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("iceGlow", "درخشش یخ", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("starPulse", "ستارهٔ تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("sunsetGlow", "درخشش غروب", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("moonGlow", "درخشش ماه", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("cometTrail", "دنبالهٔ شهاب", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("emberGlow", "جرقه‌های آتش", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("frostGlow", "سرمای یخ", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("pulseRing", "حلقهٔ تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("auroraWave", "موج شفق", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("galaxyGlow", "درخشش کهکشان", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("cometPulse", "شهاب تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 15.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("mistGlow", "درخشش مه", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("solarGlow", "درخشش خورشید", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("lunarGlow", "درخشش ماهتاب", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("stormCloud", "ابر طوفان", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("crystalGlow", "درخشش کریستال", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("coralGlow", "درخشش مرجانی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("mintGlow", "درخشش نعنایی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("amberGlow", "درخشش کهربایی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("tealGlow", "درخشش فیروزه‌ای", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("violetGlow", "درخشش بنفش", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("glowWave", "درخشش موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("glowRing", "حلقهٔ درخشان", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("neonWave", "نئون موجی", "stylize", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#FF2D78", 0.0, 0.0, "رنگ"),
            "amt" to ParamDef("n", 80.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("auroraGlow", "درخشش شفق", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("sunsetWave", "غروب موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("oceanGlow", "درخشش اقیانوس", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("mistWave", "مهٔ موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("stormGlow", "درخشش طوفان", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("emberWave", "جرقهٔ موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("frostWave", "سرمای موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("pulseGlow", "درخشش تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("ringGlow", "حلقهٔ درخشان موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("starGlow", "درخشش ستاره", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("cometGlow", "درخشش شهاب", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 15.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("moonWave", "ماه موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("sunWave", "خورشید موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("nebulaGlow", "درخشش سحابی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("quasarGlow", "درخشش اختروش", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("eclipseGlow", "درخشش خورشیدگرفتگی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("supernova", "ابرنواختر", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("stardust", "غبار ستاره‌ای", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "تعداد"),
        )),
        EffectDef("lunarEclipse", "ماه‌گرفتگی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("auroraPulse", "شفق تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("galaxyWave", "کهکشان موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("nebulaWave", "سحابی موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("quasarWave", "اختروش موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("supernovaWave", "ابرنواختر موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("cosmosGlow", "درخشش کیهانی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("eclipseWave", "خورشیدگرفتگی موجی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("solarEclipse", "خورشیدگرفتگی", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("auroraWavePulse", "شفق موجی تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("galaxyPulse", "کهکشان تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("nebulaPulse", "سحابی تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("quasarPulse", "اختروش تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("supernovaPulse", "ابرنواختر تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("cosmosPulse", "کیهان تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("eclipsePulse", "گرفتگی تپنده", "stylize", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("repeat", "تکرارکننده", "stylize", "filter", mapOf(
            "count" to ParamDef("n", 5.0, "", 1.0, 40.0, "تعداد"),
            "dx" to ParamDef("n", 90.0, "", -800.0, 800.0, "فاصلهٔ افقی"),
            "dy" to ParamDef("n", 0.0, "", -800.0, 800.0, "فاصلهٔ عمودی"),
            "rot" to ParamDef("n", 0.0, "", -180.0, 180.0, "چرخش هر نسخه"),
            "scale" to ParamDef("n", 100.0, "", 30.0, 160.0, "اندازهٔ هر نسخه"),
            "fade" to ParamDef("n", 50.0, "", 0.0, 100.0, "محو تدریجی"),
        )),
        EffectDef("crop", "برش لبه‌ها", "stylize", "filter", mapOf(
            "l" to ParamDef("n", 0.0, "", 0.0, 100.0, "از راست"),
            "r" to ParamDef("n", 0.0, "", 0.0, 100.0, "از چپ"),
            "t" to ParamDef("n", 0.0, "", 0.0, 100.0, "از بالا"),
            "b" to ParamDef("n", 0.0, "", 0.0, 100.0, "از پایین"),
        )),
        EffectDef("color", "تنظیم رنگ", "color", "canvas", mapOf(
            "bright" to ParamDef("n", 100.0, "", 0.0, 300.0, "روشنایی"),
            "contrast" to ParamDef("n", 100.0, "", 0.0, 300.0, "کنتراست"),
            "sat" to ParamDef("n", 100.0, "", 0.0, 300.0, "اشباع"),
            "hue" to ParamDef("n", 0.0, "", -180.0, 180.0, "چرخش فام"),
            "gray" to ParamDef("n", 0.0, "", 0.0, 100.0, "سیاه‌وسفید"),
            "sepia" to ParamDef("n", 0.0, "", 0.0, 100.0, "قدیمی"),
            "invert" to ParamDef("n", 0.0, "", 0.0, 100.0, "نگاتیو"),
        )),
        EffectDef("duotone", "دوتُن", "color", "canvas", mapOf(
            "c1" to ParamDef("c", 0.0, "#1B0B3A", 0.0, 0.0, "رنگ تیره‌ها"),
            "c2" to ParamDef("c", 0.0, "#FF4D6D", 0.0, 0.0, "رنگ روشن‌ها"),
            "amt" to ParamDef("n", 100.0, "", 0.0, 100.0, "میزان"),
        )),
        EffectDef("gradOver", "گرادیان رنگی", "color", "canvas", mapOf(
            "c1" to ParamDef("c", 0.0, "#FFD86B", 0.0, 0.0, "رنگ ۱"),
            "c2" to ParamDef("c", 0.0, "#FF3D7F", 0.0, 0.0, "رنگ ۲"),
            "ang" to ParamDef("n", 90.0, "", -360.0, 360.0, "زاویه"),
            "amt" to ParamDef("n", 100.0, "", 0.0, 100.0, "میزان"),
        )),
        EffectDef("hueCycle", "چرخش رنگ‌ها", "color", "canvas", mapOf(
            "speed" to ParamDef("n", 0.5, "", 0.0, 5.0, "دور در ثانیه"),
            "sat" to ParamDef("n", 130.0, "", 0.0, 300.0, "اشباع"),
        )),
        EffectDef("vibrance", "سرزندگی رنگ", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("channelShift", "جابه‌جایی کانال", "color", "canvas", mapOf(
            "dx" to ParamDef("n", 8.0, "", -80.0, 80.0, "جابه‌جایی افقی"),
            "dy" to ParamDef("n", 0.0, "", -80.0, 80.0, "جابه‌جایی عمودی"),
        )),
        EffectDef("solarize", "سولاریزه", "color", "canvas", mapOf(
            "level" to ParamDef("n", 50.0, "", 0.0, 100.0, "مرز"),
        )),
        EffectDef("invertFx", "نگاتیو", "color", "canvas", mapOf(
        )),
        EffectDef("exposure", "نوردهی", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", -100.0, 100.0, "مقدار"),
        )),
        EffectDef("clarity", "وضوح", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("levels", "سطوح رنگ", "color", "canvas", mapOf(
            "black" to ParamDef("n", 0.0, "", 0.0, 100.0, "سیاه"),
            "white" to ParamDef("n", 100.0, "", 0.0, 100.0, "سفید"),
            "gamma" to ParamDef("n", 100.0, "", 10.0, 300.0, "گاما"),
        )),
        EffectDef("sepiaFx", "سپیا", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 80.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("vintage", "قدیمی (وینتیج)", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 70.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("crossProcess", "کراس‌پروسس", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 70.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("watercolor", "آبرنگ", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("infrared", "مادون قرمز", "color", "canvas", mapOf(
        )),
        EffectDef("nightVision", "دید در شب", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 70.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("thermal", "حرارتی", "color", "canvas", mapOf(
        )),
        EffectDef("tritone", "سه‌تُن", "color", "canvas", mapOf(
            "c1" to ParamDef("c", 0.0, "#0B1026", 0.0, 0.0, "رنگ سایه‌ها"),
            "c2" to ParamDef("c", 0.0, "#E4142A", 0.0, 0.0, "رنگ میانه‌ها"),
            "c3" to ParamDef("c", 0.0, "#FFD86B", 0.0, 0.0, "رنگ روشن‌ها"),
        )),
        EffectDef("silhouette", "سیلوئت", "color", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#111111", 0.0, 0.0, "رنگ"),
        )),
        EffectDef("xray", "اشعهٔ ایکس", "color", "canvas", mapOf(
        )),
        EffectDef("prism", "منشور", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("aurora", "شفق", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("colorPop", "رنگ گزینشی", "color", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#E4142A", 0.0, 0.0, "رنگ"),
            "tol" to ParamDef("n", 40.0, "", 0.0, 100.0, "دامنه"),
        )),
        EffectDef("rainbowShift", "چرخش رنگ", "color", "canvas", mapOf(
            "speed" to ParamDef("n", 1.0, "", 0.1, 5.0, "سرعت"),
        )),
        EffectDef("colorBands", "نوارهای رنگی", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("prismShift", "منشور جابه‌جا", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("invertPulse", "معکوس تپنده", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 70.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("huePulse", "فام تپنده", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 60.0, "", 0.0, 180.0, "دامنه"),
        )),
        EffectDef("colorSplit", "شکاف رنگ", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("tintPulse", "رنگ تپنده", "color", "canvas", mapOf(
            "color" to ParamDef("c", 0.0, "#FF2D78", 0.0, 0.0, "رنگ"),
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("prismWave", "منشور موجی", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("colorWave", "موج رنگ", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 60.0, "", 0.0, 180.0, "شدت"),
        )),
        EffectDef("rainbowWave", "موج رنگین‌کمان", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("oceanWave", "موج اقیانوس", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("hologram", "هولوگرام", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("prismGlow", "درخشش منشور", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("cosmosWave", "موج کیهانی", "color", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("gradText", "متن گرادیان", "text", "filter", mapOf(
            "c1" to ParamDef("c", 0.0, "#FFD86B", 0.0, 0.0, "رنگ ۱"),
            "c2" to ParamDef("c", 0.0, "#FF7A00", 0.0, 0.0, "رنگ ۲"),
            "ang" to ParamDef("n", 90.0, "", -360.0, 360.0, "زاویه"),
        )),
        EffectDef("rainbow", "کلمه‌های رنگین‌کمانی", "text", "filter", mapOf(
            "speed" to ParamDef("n", 0.4, "", 0.0, 4.0, "سرعت چرخش"),
            "sat" to ParamDef("n", 90.0, "", 0.0, 100.0, "اشباع"),
            "light" to ParamDef("n", 62.0, "", 20.0, 90.0, "روشنی"),
        )),
        EffectDef("wordWave", "موج کلمه‌ها", "text", "filter", mapOf(
            "amp" to ParamDef("n", 18.0, "", 0.0, 120.0, "ارتفاع"),
            "speed" to ParamDef("n", 3.0, "", 0.0, 15.0, "سرعت"),
            "gap" to ParamDef("n", 0.7, "", 0.0, 3.0, "فاصلهٔ موج"),
        )),
        EffectDef("jitter", "لرزش کلمه‌ها", "text", "filter", mapOf(
            "amt" to ParamDef("n", 6.0, "", 0.0, 60.0, "شدت"),
            "speed" to ParamDef("n", 12.0, "", 1.0, 40.0, "تندی"),
            "rot" to ParamDef("n", 4.0, "", 0.0, 30.0, "چرخش"),
        )),
        EffectDef("karaoke", "کارائوکه", "text", "filter", mapOf(
            "color" to ParamDef("c", 0.0, "#E4142A", 0.0, 0.0, "رنگ خوانده‌شده"),
            "start" to ParamDef("n", 0.0, "", 0.0, 100.0, "شروع"),
            "end" to ParamDef("n", 90.0, "", 0.0, 100.0, "پایان"),
            "pop" to ParamDef("n", 12.0, "", 0.0, 60.0, "بزرگ شدن کلمهٔ فعلی"),
        )),
        EffectDef("wordFlicker", "چشمک کلمه‌ها", "text", "filter", mapOf(
            "amt" to ParamDef("n", 35.0, "", 0.0, 100.0, "مقدار"),
            "speed" to ParamDef("n", 10.0, "", 1.0, 40.0, "تندی"),
        )),
        EffectDef("wordPop", "پرش کلمه‌ها", "text", "filter", mapOf(
            "amp" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت بزرگ شدن"),
            "speed" to ParamDef("n", 3.0, "", 0.0, 15.0, "سرعت موج"),
        )),
        EffectDef("letterBounce", "پرش حروف", "text", "filter", mapOf(
            "amp" to ParamDef("n", 30.0, "", 0.0, 120.0, "ارتفاع پرش"),
            "speed" to ParamDef("n", 3.0, "", 0.0, 15.0, "سرعت موج"),
        )),
        EffectDef("zoomBlur", "تاری زوم", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 25.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("dirBlur", "تاری جهت‌دار", "distort", "canvas", mapOf(
            "len" to ParamDef("n", 30.0, "", 0.0, 200.0, "طول"),
            "ang" to ParamDef("n", 0.0, "", -180.0, 180.0, "زاویه"),
        )),
        EffectDef("kaleido", "کالیدوسکوپ", "distort", "canvas", mapOf(
            "mode" to ParamDef("n", 0.0, "", 0.0, 1.0, "حالت: ۰ چهارتایی، ۱ دوتایی"),
        )),
        EffectDef("spinBlur", "تاری چرخشی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("findEdges", "یافتن لبه", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 100.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("fisheye", "چشم ماهی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("emboss", "برجسته‌سازی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 60.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("squeeze", "فشردگی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", -90.0, 90.0, "شدت"),
        )),
        EffectDef("clouds", "ابر", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
            "scale" to ParamDef("n", 50.0, "", 10.0, 200.0, "درشتی"),
        )),
        EffectDef("tiltShift", "تاری بالا و پایین", "distort", "canvas", mapOf(
            "r" to ParamDef("n", 12.0, "", 0.0, 60.0, "شعاع تاری"),
            "band" to ParamDef("n", 40.0, "", 5.0, 100.0, "پهنای نوار واضح"),
        )),
        EffectDef("bend", "خم کردن", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", -100.0, 100.0, "شدت"),
        )),
        EffectDef("fractal", "نویز فرکتالی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
            "scale" to ParamDef("n", 50.0, "", 10.0, 200.0, "درشتی"),
        )),
        EffectDef("tilt3d", "کج سه‌بعدی", "distort", "canvas", mapOf(
            "ang" to ParamDef("n", 25.0, "", -75.0, 75.0, "زاویه"),
            "axis" to ParamDef("n", 0.0, "", 0.0, 1.0, "محور: ۰ افقی، ۱ عمودی"),
        )),
        EffectDef("flip3d", "چرخش سه‌بعدی", "distort", "canvas", mapOf(
            "speed" to ParamDef("n", 0.5, "", 0.0, 3.0, "دور در ثانیه"),
        )),
        EffectDef("sphere", "کره", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 60.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("mosaic", "موزاییک", "distort", "canvas", mapOf(
            "size" to ParamDef("n", 24.0, "", 4.0, 120.0, "اندازهٔ خانه"),
        )),
        EffectDef("slitScan", "اسکن نواری", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "کشیدگی"),
            "dir" to ParamDef("n", 0.0, "", 0.0, 1.0, "جهت: ۰ افقی، ۱ عمودی"),
        )),
        EffectDef("oilPaint", "رنگ روغن", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("pencil", "مداد", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 100.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("surfaceBlur", "تاری سطحی", "distort", "canvas", mapOf(
            "r" to ParamDef("n", 12.0, "", 0.0, 100.0, "شعاع"),
        )),
        EffectDef("smear", "کشیدگی جهتی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
            "ang" to ParamDef("n", 0.0, "", -180.0, 180.0, "زاویه"),
        )),
        EffectDef("pageCurl", "تا خوردن صفحه", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت تا"),
        )),
        EffectDef("cubeRotate", "مکعب", "distort", "canvas", mapOf(
            "speed" to ParamDef("n", 0.5, "", 0.0, 3.0, "دور در ثانیه"),
        )),
        EffectDef("mandala", "مندالا", "distort", "canvas", mapOf(
            "n" to ParamDef("n", 6.0, "", 2.0, 12.0, "تعداد تکرار"),
        )),
        EffectDef("pixelSort", "مرتب‌سازی پیکسل", "distort", "canvas", mapOf(
            "size" to ParamDef("n", 32.0, "", 8.0, 128.0, "اندازهٔ بلوک"),
        )),
        EffectDef("tunnel", "تونل", "distort", "canvas", mapOf(
            "n" to ParamDef("n", 5.0, "", 1.0, 10.0, "تعداد"),
        )),
        EffectDef("infiniteZoom", "زوم بی‌نهایت", "distort", "canvas", mapOf(
            "speed" to ParamDef("n", 1.0, "", 0.1, 5.0, "سرعت"),
        )),
        EffectDef("spinZoom", "چرخش و زوم", "distort", "canvas", mapOf(
            "speed" to ParamDef("n", 0.5, "", 0.0, 3.0, "سرعت چرخش"),
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "تپش زوم"),
        )),
        EffectDef("rippleRing", "حلقه‌های موج", "distort", "canvas", mapOf(
            "speed" to ParamDef("n", 1.0, "", 0.1, 5.0, "سرعت"),
            "amt" to ParamDef("n", 60.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("gridWarp", "شبکهٔ تاب‌دار", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("heatHaze", "گرمای هوا", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("liquid", "مایع", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("shear", "کجی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", -80.0, 80.0, "شدت"),
        )),
        EffectDef("cylinder", "استوانه", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 60.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("marble", "مرمر", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("pixelWave", "موج پیکسلی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("edgePulse", "لبهٔ تپنده", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 80.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("warpWave", "موج تاب", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("swirl", "چرخش مرکزی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 80.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("gridPulse", "شبکهٔ تپنده", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 40.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("echoZoom", "پژواک زوم", "distort", "canvas", mapOf(
            "n" to ParamDef("n", 4.0, "", 1.0, 8.0, "تعداد"),
        )),
        EffectDef("focusPull", "تغییر فوکوس", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("depthField", "عمق میدان", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("waveShift", "جابه‌جایی موجی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("zoomSpin", "زوم چرخان", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("slideEcho", "پژواک لغزش", "distort", "canvas", mapOf(
            "n" to ParamDef("n", 4.0, "", 1.0, 8.0, "تعداد"),
        )),
        EffectDef("blurPulse", "تاری تپنده", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("mosaicPulse", "موزاییک تپنده", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("ripplePulse", "موج تپنده", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("vortexPulse", "گرداب تپنده", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 80.0, "", 0.0, 200.0, "شدت"),
        )),
        EffectDef("shearPulse", "برش تپنده", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("skewWave", "کجی موجی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("tunnelSpin", "تونل چرخان", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("fadeZoom", "محو زوم", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("spinFade", "چرخش محو", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("vignetteWave", "لبهٔ موجی", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("waveRipple", "موج و ripple", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("blackhole", "سیاه‌چاله", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("wormhole", "کرم‌چاله", "distort", "canvas", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "شدت"),
        )),
        EffectDef("drift", "رانش آرام", "motion", "filter", mapOf(
            "speed" to ParamDef("n", 30.0, "", -400.0, 400.0, "سرعت (پیکسل/ثانیه)"),
            "rot" to ParamDef("n", 5.0, "", -90.0, 90.0, "چرخش (درجه/ثانیه)"),
        )),
        EffectDef("wobble", "تکان موجی", "motion", "filter", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 200.0, "دامنه"),
            "freq" to ParamDef("n", 2.0, "", 0.1, 10.0, "تندی"),
        )),
        EffectDef("floaty", "شناور", "motion", "filter", mapOf(
            "amt" to ParamDef("n", 20.0, "", 0.0, 200.0, "دامنه"),
            "freq" to ParamDef("n", 1.0, "", 0.1, 5.0, "تندی"),
        )),
        EffectDef("fadePulse", "تپش شفافیت", "motion", "filter", mapOf(
            "amt" to ParamDef("n", 50.0, "", 0.0, 100.0, "عمق"),
            "freq" to ParamDef("n", 2.0, "", 0.1, 10.0, "تندی"),
        )),
        EffectDef("wiggle", "شناوری نرم", "motion", "filter", mapOf(
            "amt" to ParamDef("n", 30.0, "", 0.0, 400.0, "دامنه"),
            "freq" to ParamDef("n", 1.5, "", 0.1, 12.0, "تندی"),
            "rot" to ParamDef("n", 0.0, "", 0.0, 90.0, "چرخش"),
        )),
        EffectDef("swing", "تاب خوردن", "motion", "filter", mapOf(
            "ang" to ParamDef("n", 12.0, "", 0.0, 90.0, "زاویه"),
            "freq" to ParamDef("n", 0.8, "", 0.05, 6.0, "تندی"),
        )),
        EffectDef("orbit", "گردش دایره‌ای", "motion", "filter", mapOf(
            "r" to ParamDef("n", 30.0, "", 0.0, 600.0, "شعاع"),
            "freq" to ParamDef("n", 0.5, "", -4.0, 4.0, "دور در ثانیه"),
        )),
        EffectDef("zoomPulse", "بزرگ‌کوچک منظم", "motion", "filter", mapOf(
            "amt" to ParamDef("n", 8.0, "", 0.0, 100.0, "شدت"),
            "freq" to ParamDef("n", 1.0, "", 0.1, 8.0, "تندی"),
        )),
        EffectDef("strobe", "چشمک", "motion", "filter", mapOf(
            "rate" to ParamDef("n", 4.0, "", 0.5, 30.0, "بار در ثانیه"),
            "depth" to ParamDef("n", 100.0, "", 0.0, 100.0, "عمق"),
            "beat" to ParamDef("n", 0.0, "", 0.0, 100.0, "روی ضرب"),
        )),
    )

    val BY_ID: Map<String, EffectDef> = ALL.associateBy { it.id }

    val CATS: List<String> = ALL.map { it.cat }.distinct()

    fun byId(id: String): EffectDef? = BY_ID[id]

    fun byCat(cat: String): List<EffectDef> = ALL.filter { it.cat == cat }

    /** افکت‌های canvas فعال یک لایه (همان canvasEffects وب). */
    fun canvasEffectsOf(layer: com.zurvanecho.lyricstudio.motion.model.Layer): List<com.zurvanecho.lyricstudio.motion.model.EffectRef> =
        layer.effects.filter { it.enabled && byId(it.id)?.kind == "canvas" }
}
