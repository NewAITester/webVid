//! لایهٔ JNI برای هستهٔ Rust — همان ریاضیات هستهٔ وب (`fx.rs`، کپیِ
//! `rust/lyricstudio-core/src/lib.rs` از برنچ بازسازی) روی اندروید.
//!
//! قرارداد با کاتلین (`RustFx.kt`):
//! - `pixels`: IntArray با پیکسل‌های ARGB (همان فرمت Bitmap اندروید)، درجا تغییر می‌کند.
//! - `params`: DoubleArray — پارامترهای عددی افکت، به‌ترتیب رجیستری (Effects.kt).
//! - `colors`: IntArray — پارامترهای رنگی افکت (ARGB int)، به‌ترتیب رجیستری.
//! - `time`: زمان فعلی (ثانیه) برای افکت‌های وابسته به زمان (flicker، invertPulse).
//! - خروجی: true یعنی افکت اعمال شد، false یعنی شناسه پشتیبانی نمی‌شود.

mod fx;

use jni::objects::{JClass, JDoubleArray, JIntArray, JString};
use jni::sys::{jboolean, jdouble, jint, JNI_TRUE, JNI_FALSE};
use jni::JNIEnv;

/// استخراج (r, g, b) از یک ARGB int.
#[inline]
fn rgb(c: i32) -> (f64, f64, f64) {
    (
        ((c >> 16) & 0xFF) as f64,
        ((c >> 8) & 0xFF) as f64,
        (c & 0xFF) as f64,
    )
}

#[no_mangle]
pub extern "system" fn Java_com_zurvanecho_lyricstudio_motion_effects_RustFx_applyEffect(
    mut env: JNIEnv,
    _class: JClass,
    pixels: JIntArray,
    _width: jint,
    _height: jint,
    effect_id: JString,
    params: JDoubleArray,
    colors: JIntArray,
    time: jdouble,
) -> jboolean {
    // شناسهٔ افکت
    let id: String = match env.get_string(&effect_id) {
        Ok(s) => s.into(),
        Err(_) => return JNI_FALSE,
    };
    // پیکسل‌ها (ARGB int)
    let len = match env.get_array_length(&pixels) {
        Ok(l) => l as usize,
        Err(_) => return JNI_FALSE,
    };
    if len == 0 {
        return JNI_FALSE;
    }
    let mut argb = vec![0i32; len];
    if env.get_int_array_region(&pixels, 0, &mut argb).is_err() {
        return JNI_FALSE;
    }
    // ARGB int → بایت‌های RGBA (همان فرمت هستهٔ وب)
    let mut rgba = vec![0u8; len * 4];
    for (i, &c) in argb.iter().enumerate() {
        let o = i * 4;
        rgba[o] = ((c >> 16) & 0xFF) as u8;
        rgba[o + 1] = ((c >> 8) & 0xFF) as u8;
        rgba[o + 2] = (c & 0xFF) as u8;
        rgba[o + 3] = ((c >> 24) & 0xFF) as u8;
    }
    // پارامترهای عددی و رنگی
    let n_params = env.get_array_length(&params).unwrap_or(0) as usize;
    let mut p = vec![0f64; n_params];
    if n_params > 0 && env.get_double_array_region(&params, 0, &mut p).is_err() {
        return JNI_FALSE;
    }
    let n_colors = env.get_array_length(&colors).unwrap_or(0) as usize;
    let mut col = vec![0i32; n_colors];
    if n_colors > 0 && env.get_int_array_region(&colors, 0, &mut col).is_err() {
        return JNI_FALSE;
    }
    let num = |i: usize, def: f64| -> f64 { p.get(i).copied().unwrap_or(def) };
    let ptr = rgba.as_mut_ptr();
    let blen = rgba.len();
    // اعمال افکت (همان توابع fx_* در fx.rs؛ پارامترها به‌ترتیب رجیستری)
    let ok = unsafe {
        match id.as_str() {
            "duotone" => {
                let (r1, g1, b1) = col.get(0).map(|&c| rgb(c)).unwrap_or((0.0, 0.0, 0.0));
                let (r2, g2, b2) = col.get(1).map(|&c| rgb(c)).unwrap_or((0.0, 0.0, 0.0));
                fx::fx_duotone(ptr, blen, r1, g1, b1, r2, g2, b2, num(0, 100.0));
                true
            }
            "posterize" => {
                fx::fx_posterize(ptr, blen, num(0, 4.0));
                true
            }
            "threshold" => {
                let (r1, g1, b1) = col.get(0).map(|&c| rgb(c)).unwrap_or((0.0, 0.0, 0.0));
                let (r2, g2, b2) = col.get(1).map(|&c| rgb(c)).unwrap_or((255.0, 255.0, 255.0));
                fx::fx_threshold(ptr, blen, num(0, 50.0), r1, g1, b1, r2, g2, b2);
                true
            }
            "vibrance" => {
                fx::fx_vibrance(ptr, blen, num(0, 50.0));
                true
            }
            "lumaKey" => {
                fx::fx_lumakey(ptr, blen, num(0, 50.0), num(1, 20.0), num(2, 0.0));
                true
            }
            "matte" => {
                fx::fx_matte(ptr, blen, num(0, 50.0), num(1, 20.0), num(2, 0.0));
                true
            }
            "solarize" => {
                fx::fx_solarize(ptr, blen, num(0, 50.0));
                true
            }
            "invertFx" => {
                fx::fx_invert(ptr, blen);
                true
            }
            "temperature" => {
                fx::fx_temperature(ptr, blen, num(0, 30.0));
                true
            }
            "exposure" => {
                fx::fx_exposure(ptr, blen, num(0, 20.0));
                true
            }
            "levels" => {
                fx::fx_levels(ptr, blen, num(0, 0.0), num(1, 100.0), num(2, 100.0));
                true
            }
            "sepiaFx" => {
                fx::fx_sepia(ptr, blen, num(0, 80.0));
                true
            }
            "comic" => {
                fx::fx_comic(ptr, blen, num(0, 50.0));
                true
            }
            "infrared" => {
                fx::fx_infrared(ptr, blen);
                true
            }
            "thermal" => {
                fx::fx_thermal(ptr, blen);
                true
            }
            "tritone" => {
                let (r1, g1, b1) = col.get(0).map(|&c| rgb(c)).unwrap_or((0.0, 0.0, 0.0));
                let (r2, g2, b2) = col.get(1).map(|&c| rgb(c)).unwrap_or((0.0, 0.0, 0.0));
                let (r3, g3, b3) = col.get(2).map(|&c| rgb(c)).unwrap_or((0.0, 0.0, 0.0));
                fx::fx_tritone(ptr, blen, r1, g1, b1, r2, g2, b2, r3, g3, b3);
                true
            }
            "crossProcess" => {
                fx::fx_cross_process(ptr, blen, num(0, 70.0));
                true
            }
            "silhouette" => {
                let (r, g, b) = col.get(0).map(|&c| rgb(c)).unwrap_or((0.0, 0.0, 0.0));
                fx::fx_silhouette(ptr, blen, r, g, b);
                true
            }
            "xray" => {
                fx::fx_xray(ptr, blen);
                true
            }
            "colorPop" => {
                let (r, g, b) = col.get(0).map(|&c| rgb(c)).unwrap_or((0.0, 0.0, 0.0));
                fx::fx_color_pop(ptr, blen, r, g, b, num(0, 40.0));
                true
            }
            "flicker" => {
                fx::fx_flicker(ptr, blen, time, num(0, 30.0));
                true
            }
            "invertPulse" => {
                fx::fx_invert_pulse(ptr, blen, time, num(0, 70.0));
                true
            }
            _ => false,
        }
    };
    if !ok {
        return JNI_FALSE;
    }
    // بایت‌های RGBA → ARGB int و نوشتن برگشتی
    for (i, c) in argb.iter_mut().enumerate() {
        let o = i * 4;
        let r = rgba[o] as i32;
        let g = rgba[o + 1] as i32;
        let b = rgba[o + 2] as i32;
        let a = rgba[o + 3] as i32;
        *c = (a << 24) | (r << 16) | (g << 8) | b;
    }
    match env.set_int_array_region(&pixels, 0, &argb) {
        Ok(()) => JNI_TRUE,
        Err(_) => JNI_FALSE,
    }
}
