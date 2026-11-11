//! هستهٔ محاسباتی Rust برای LyricStudio — نسخهٔ WASM موتور پیکسل.
//!
//! دقیقاً همان ریاضیات جاوااسکریپت (`src/render/canvasfx.js` و
//! `src/render/webgl.js`) را پیاده می‌کند تا خروجی Rust و JS یکسان باشد:
//! - تخصیص Uint8ClampedArray: NaN→0، برش به ‎[0,255]‎، گرد کردن
//!   «نیم به زوج» (round-half-to-even) — `round_ties_even`.
//! - `Math.round` جاوااسکریپت: `floor(x + 0.5)` — `js_round`.
//! - حلقهٔ pixelOp فقط پیکسل‌هایی با آلفا > 0 را لمس می‌کند.
//!
//! بدون هیچ وابستگی خارجی و بدون wasm-bindgen: رابط FFI دستی با
//! بافر خام (`rs_alloc` / `rs_free`) است تا بیلد فقط با `cargo build`
//! و هدف `wasm32-unknown-unknown` انجام شود.

use std::alloc::{alloc, dealloc, Layout};
use std::slice;

// ── ابزارهای عددی ──────────────────────────────────────────────

/// تخصیص Uint8ClampedArray در جاوااسکریپت: NaN می‌شود 0، برش به
/// [0, 255]، گرد کردن نیم به زوج.
#[inline]
fn clamp_u8(v: f64) -> u8 {
    // max/min به‌جای clamp: با NaN هم panic نمی‌کند و 0 می‌دهد.
    v.max(0.0).min(255.0).round_ties_even() as u8
}

/// Math.round جاوااسکریپت: floor(x + 0.5).
#[inline]
fn js_round(v: f64) -> f64 {
    (v + 0.5).floor()
}

#[inline]
fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

/// روشنایی (luma) با همان ضرایب جاوااسکریپت.
#[inline]
fn luma(r: f64, g: f64, b: f64) -> f64 {
    0.299 * r + 0.587 * g + 0.114 * b
}

/// اجرای f روی هر پیکسل (قدم ۴ بایتی)، با رد کردن پیکسل‌های شفاف
/// (دقیقاً مثل pixelOp در canvasfx.js که `if (q[i+3])` می‌کند).
fn for_each_pixel<F: FnMut(&mut [u8], usize)>(buf: &mut [u8], mut f: F) {
    let mut i = 0;
    for px in buf.chunks_exact_mut(4) {
        if px[3] != 0 {
            // برش ۴ بایتی به‌علاوهٔ افست، تا f همان قرارداد (بافر، ایندکس) را ببیند
            let base = i;
            let _ = base;
            f(px, 0);
        }
        i += 4;
    }
}

/// بافر خام از FFI. مقدار null یا len=0 یعنی «هیچ کاری نکن».
unsafe fn buf_mut<'a>(ptr: *mut u8, len: usize) -> Option<&'a mut [u8]> {
    if ptr.is_null() || len == 0 {
        return None;
    }
    Some(slice::from_raw_parts_mut(ptr, len))
}

// ── نویز قطعی ──────────────────────────────────────────────────

fn hash(n: f64) -> f64 {
    let x = (n * 127.1 + 311.7).sin() * 43758.5453;
    x - x.floor()
}

/// نویز مقداری قطعی (هش سینوسی) — همان `noise` در canvasfx.js.
#[no_mangle]
pub extern "C" fn rs_noise(x: f64) -> f64 {
    let i = x.floor();
    let f = x - i;
    let u = f * f * (3.0 - 2.0 * f);
    (hash(i) + (hash(i + 1.0) - hash(i)) * u) * 2.0 - 1.0
}

// ── مدیریت حافظه (برای JS) ─────────────────────────────────────

#[no_mangle]
pub unsafe extern "C" fn rs_alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return std::ptr::null_mut();
    }
    let layout = Layout::from_size_align(len, 1).unwrap_or(Layout::new::<u8>());
    let ptr = alloc(layout);
    if ptr.is_null() {
        std::ptr::null_mut()
    } else {
        ptr
    }
}

#[no_mangle]
pub unsafe extern "C" fn rs_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    let layout = Layout::from_size_align(len, 1).unwrap_or(Layout::new::<u8>());
    dealloc(ptr, layout);
}

#[no_mangle]
pub extern "C" fn rs_version() -> u32 {
    1
}


/// اجرای یک نگاشت تک‌کاناله با جدول ۲۵۶تایی (LUT) — برای افکت‌هایی که
/// هر کانال فقط به خودش بستگی دارد؛ بدون هیچ محاسبهٔ اعشاری در حلقه.
fn lut3(buf: &mut [u8], r: &[u8; 256], g: &[u8; 256], b: &[u8; 256]) {
    for px in buf.chunks_exact_mut(4) {
        if px[3] == 0 {
            continue;
        }
        px[0] = r[px[0] as usize];
        px[1] = g[px[1] as usize];
        px[2] = b[px[2] as usize];
    }
}

fn identity_lut() -> [u8; 256] {
    let mut t = [0u8; 256];
    for (i, v) in t.iter_mut().enumerate() {
        *v = i as u8;
    }
    t
}

// ── افکت‌های تک‌پیکسلی (۲۲ افکت «pure pixelOp» از R6) ──────────

#[no_mangle]
pub unsafe extern "C" fn fx_duotone(
    ptr: *mut u8, len: usize, r1: f64, g1: f64, b1: f64, r2: f64, g2: f64, b2: f64, amt: f64,
) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let k = amt / 100.0;
    for_each_pixel(buf, |q, i| {
        let l = luma(q[i] as f64, q[i + 1] as f64, q[i + 2] as f64) / 255.0;
        q[i] = clamp_u8(q[i] as f64 + (r1 + (r2 - r1) * l - q[i] as f64) * k);
        q[i + 1] = clamp_u8(q[i + 1] as f64 + (g1 + (g2 - g1) * l - q[i + 1] as f64) * k);
        q[i + 2] = clamp_u8(q[i + 2] as f64 + (b1 + (b2 - b1) * l - q[i + 2] as f64) * k);
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_posterize(ptr: *mut u8, len: usize, levels: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let n = (js_round(levels).max(2.0) - 1.0).max(1.0);
    let mut t = [0u8; 256];
    for (i, v) in t.iter_mut().enumerate() {
        *v = clamp_u8(js_round((i as f64 / 255.0) * n) / n * 255.0);
    }
    lut3(buf, &t, &t, &t);
}

#[no_mangle]
pub unsafe extern "C" fn fx_threshold(
    ptr: *mut u8, len: usize, level: f64, c1r: f64, c1g: f64, c1b: f64, c2r: f64, c2g: f64, c2b: f64,
) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let lv = (level / 100.0) * 255.0;
    for_each_pixel(buf, |q, i| {
        let (r, g, b) = if luma(q[i] as f64, q[i + 1] as f64, q[i + 2] as f64) >= lv {
            (c2r, c2g, c2b)
        } else {
            (c1r, c1g, c1b)
        };
        q[i] = clamp_u8(r);
        q[i + 1] = clamp_u8(g);
        q[i + 2] = clamp_u8(b);
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_vibrance(ptr: *mut u8, len: usize, amt: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let k = amt / 100.0;
    for_each_pixel(buf, |q, i| {
        let (r, g, b) = (q[i] as f64, q[i + 1] as f64, q[i + 2] as f64);
        let mx = r.max(g).max(b);
        let mn = r.min(g).min(b);
        if mx <= mn {
            return;
        }
        let sat = (mx - mn) / mx;
        let avg = (r + g + b) / 3.0;
        let boost = 1.0 + k * (1.0 - sat);
        q[i] = clamp_u8(avg + (r - avg) * boost);
        q[i + 1] = clamp_u8(avg + (g - avg) * boost);
        q[i + 2] = clamp_u8(avg + (b - avg) * boost);
    });
}

/// lumaKey و matte دقیقاً یک ریاضیات دارند (فقط نام متفاوت است).
fn luma_key_impl(buf: &mut [u8], level: f64, soft: f64, mode: f64) {
    let lv = level / 100.0;
    let soft = (soft / 100.0).max(0.01);
    for_each_pixel(buf, |q, i| {
        let l = luma(q[i] as f64, q[i + 1] as f64, q[i + 2] as f64) / 255.0;
        let fct = if mode >= 0.5 {
            clamp01((lv + soft / 2.0 - l) / soft)
        } else {
            clamp01((l - (lv - soft / 2.0)) / soft)
        };
        q[i + 3] = clamp_u8(q[i + 3] as f64 * fct);
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_lumakey(ptr: *mut u8, len: usize, level: f64, soft: f64, mode: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    luma_key_impl(buf, level, soft, mode);
}

#[no_mangle]
pub unsafe extern "C" fn fx_matte(ptr: *mut u8, len: usize, level: f64, soft: f64, mode: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    luma_key_impl(buf, level, soft, mode);
}

#[no_mangle]
pub unsafe extern "C" fn fx_solarize(ptr: *mut u8, len: usize, level: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let lv = level / 100.0 * 255.0;
    let mut t = [0u8; 256];
    for (i, v) in t.iter_mut().enumerate() {
        *v = if i as f64 > lv { 255 - i as u8 } else { i as u8 };
    }
    lut3(buf, &t, &t, &t);
}

#[no_mangle]
pub unsafe extern "C" fn fx_invert(ptr: *mut u8, len: usize) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let mut t = [0u8; 256];
    for (i, v) in t.iter_mut().enumerate() {
        *v = 255 - i as u8;
    }
    lut3(buf, &t, &t, &t);
}

#[no_mangle]
pub unsafe extern "C" fn fx_temperature(ptr: *mut u8, len: usize, amt: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let k = amt / 100.0 * 40.0;
    let mut tr = [0u8; 256];
    let mut tb = [0u8; 256];
    for i in 0..256 {
        tr[i] = clamp_u8(i as f64 + k);
        tb[i] = clamp_u8(i as f64 - k);
    }
    lut3(buf, &tr, &identity_lut(), &tb);
}

#[no_mangle]
pub unsafe extern "C" fn fx_exposure(ptr: *mut u8, len: usize, amt: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let k = 1.0 + amt / 100.0;
    let mut t = [0u8; 256];
    for (i, v) in t.iter_mut().enumerate() {
        *v = clamp_u8(i as f64 * k);
    }
    lut3(buf, &t, &t, &t);
}

#[no_mangle]
pub unsafe extern "C" fn fx_levels(ptr: *mut u8, len: usize, black: f64, white: f64, gamma: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let bl = black / 100.0;
    let wh = (white / 100.0).max(bl + 0.01);
    let gm = gamma / 100.0;
    let inv = 1.0 / gm;
    let mut t = [0u8; 256];
    for (i, v) in t.iter_mut().enumerate() {
        let u = ((i as f64 / 255.0 - bl) / (wh - bl)).clamp(0.0, 1.0);
        *v = clamp_u8(u.powf(inv) * 255.0);
    }
    lut3(buf, &t, &t, &t);
}

#[no_mangle]
pub unsafe extern "C" fn fx_sepia(ptr: *mut u8, len: usize, amt: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let k = amt / 100.0;
    for_each_pixel(buf, |q, i| {
        let (r, g, b) = (q[i] as f64, q[i + 1] as f64, q[i + 2] as f64);
        let sr = r * 0.393 + g * 0.769 + b * 0.189;
        let sg = r * 0.349 + g * 0.686 + b * 0.168;
        let sb = r * 0.272 + g * 0.534 + b * 0.131;
        q[i] = clamp_u8(r + (sr - r) * k);
        q[i + 1] = clamp_u8(g + (sg - g) * k);
        q[i + 2] = clamp_u8(b + (sb - b) * k);
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_comic(ptr: *mut u8, len: usize, level: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let lv = level / 100.0;
    for_each_pixel(buf, |q, i| {
        let l = luma(q[i] as f64, q[i + 1] as f64, q[i + 2] as f64) / 255.0;
        let c = if l > lv { 255 } else { 0 };
        q[i] = c;
        q[i + 1] = c;
        q[i + 2] = c;
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_infrared(ptr: *mut u8, len: usize) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    for_each_pixel(buf, |q, i| {
        let r = q[i];
        q[i] = q[i + 1];
        q[i + 1] = r;
        q[i + 2] = clamp_u8(q[i + 2] as f64 * 0.5);
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_thermal(ptr: *mut u8, len: usize) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    const STOPS: [[f64; 4]; 4] = [
        [0.0, 0.0, 0.0, 0.0],
        [0.33, 128.0, 0.0, 0.0],
        [0.66, 255.0, 128.0, 0.0],
        [1.0, 255.0, 255.0, 220.0],
    ];
    for px in buf.chunks_exact_mut(4) {
        if px[3] == 0 {
            continue;
        }
        let l = luma(px[0] as f64, px[1] as f64, px[2] as f64) / 255.0;
        let mut done = false;
        for j in 1..STOPS.len() {
            if l >= STOPS[j - 1][0] && l <= STOPS[j][0] {
                let s = STOPS[j - 1];
                let t = (l - s[0]) / (STOPS[j][0] - s[0]);
                px[0] = clamp_u8(s[1] + (STOPS[j][1] - s[1]) * t);
                px[1] = clamp_u8(s[2] + (STOPS[j][2] - s[2]) * t);
                px[2] = clamp_u8(s[3] + (STOPS[j][3] - s[3]) * t);
                done = true;
                break;
            }
        }
        if !done && l >= 1.0 {
            px[0] = 255;
            px[1] = 255;
            px[2] = 220;
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn fx_tritone(
    ptr: *mut u8, len: usize, c1r: f64, c1g: f64, c1b: f64, c2r: f64, c2g: f64, c2b: f64, c3r: f64,
    c3g: f64, c3b: f64,
) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    for_each_pixel(buf, |q, i| {
        let l = luma(q[i] as f64, q[i + 1] as f64, q[i + 2] as f64) / 255.0;
        let (a, b, t) = if l < 0.5 {
            ([c1r, c1g, c1b], [c2r, c2g, c2b], l * 2.0)
        } else {
            ([c2r, c2g, c2b], [c3r, c3g, c3b], (l - 0.5) * 2.0)
        };
        q[i] = clamp_u8(a[0] + (b[0] - a[0]) * t);
        q[i + 1] = clamp_u8(a[1] + (b[1] - a[1]) * t);
        q[i + 2] = clamp_u8(a[2] + (b[2] - a[2]) * t);
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_cross_process(ptr: *mut u8, len: usize, amt: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let k = amt / 100.0;
    for_each_pixel(buf, |q, i| {
        let l = luma(q[i] as f64, q[i + 1] as f64, q[i + 2] as f64) / 255.0;
        if l < 0.5 {
            q[i + 2] = clamp_u8((q[i + 2] as f64 + (0.5 - l) * 80.0 * k).min(255.0));
        } else {
            q[i] = clamp_u8((q[i] as f64 + (l - 0.5) * 80.0 * k).min(255.0));
        }
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_silhouette(ptr: *mut u8, len: usize, r: f64, g: f64, b: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let (r, g, b) = (clamp_u8(r), clamp_u8(g), clamp_u8(b));
    for_each_pixel(buf, |q, i| {
        q[i] = r;
        q[i + 1] = g;
        q[i + 2] = b;
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_xray(ptr: *mut u8, len: usize) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    for_each_pixel(buf, |q, i| {
        let l = luma(q[i] as f64, q[i + 1] as f64, q[i + 2] as f64);
        let v = clamp_u8(255.0 - l);
        q[i] = v;
        q[i + 1] = v;
        q[i + 2] = v;
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_color_pop(
    ptr: *mut u8, len: usize, cr: f64, cg: f64, cb: f64, tol: f64,
) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let lim = tol * 2.55;
    for_each_pixel(buf, |q, i| {
        let (r, g, b) = (q[i] as f64, q[i + 1] as f64, q[i + 2] as f64);
        let dist = ((r - cr) * (r - cr) + (g - cg) * (g - cg) + (b - cb) * (b - cb)).sqrt();
        if dist > lim {
            let l = clamp_u8(luma(r, g, b));
            q[i] = l;
            q[i + 1] = l;
            q[i + 2] = l;
        }
    });
}

#[no_mangle]
pub unsafe extern "C" fn fx_flicker(ptr: *mut u8, len: usize, time: f64, amt: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let h = (time * 24.0).floor() * 12.9898;
    let h = h.sin() * 43758.5453;
    let k = 1.0 + ((h - h.floor()) - 0.5) * (amt / 100.0) * 0.6;
    let mut t = [0u8; 256];
    for (i, v) in t.iter_mut().enumerate() {
        *v = clamp_u8(i as f64 * k);
    }
    lut3(buf, &t, &t, &t);
}

#[no_mangle]
pub unsafe extern "C" fn fx_invert_pulse(ptr: *mut u8, len: usize, time: f64, amt: f64) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    let k = (0.5 + 0.5 * (time * 3.0).sin()) * (amt / 100.0);
    let mut t = [0u8; 256];
    for (i, slot) in t.iter_mut().enumerate() {
        let x = i as f64;
        *slot = clamp_u8(x + (255.0 - 2.0 * x) * k);
    }
    lut3(buf, &t, &t, &t);
}

// ── تنظیم رنگ (مرجع CPU در webgl.js) ──────────────────────────

/// همان `applyColorAdjustPixels`: بلور ۳×۳، چرخش رنگ YIQ، روشنایی/
/// کنتراست، اشباع، خاکستری/سپیا/معکوس، وینیت.
#[no_mangle]
pub unsafe extern "C" fn rs_color_adjust(
    ptr: *mut u8, len: usize, w: usize, h: usize, hue_deg: f64, brightness: f64,
    contrast: f64, saturation: f64, vignette: f64, grayscale: f64, sepia: f64, invert: f64,
    blur: f64,
) {
    let Some(buf) = buf_mut(ptr, len) else { return };
    if w == 0 || h == 0 {
        return;
    }
    let hue = hue_deg * std::f64::consts::PI / 180.0;
    let cos_a = hue.cos();
    let sin_a = hue.sin();
    let smoothstep = |a: f64, b: f64, x: f64| -> f64 {
        let t = ((x - a) / (b - a)).clamp(0.0, 1.0);
        t * t * (3.0 - 2.0 * t)
    };
    if blur > 0.5 {
        let r = (js_round(blur) as isize).max(1);
        let tmp = buf.to_vec();
        let w = w as isize;
        let h = h as isize;
        for y in 0..h {
            for x in 0..w {
                let (mut sr, mut sg, mut sb, mut sa) = (0f64, 0f64, 0f64, 0f64);
                for dy in -1..=1 {
                    for dx in -1..=1 {
                        let xx = (x + dx * r).clamp(0, w - 1);
                        let yy = (y + dy * r).clamp(0, h - 1);
                        let o = ((yy * w + xx) * 4) as usize;
                        sr += tmp[o] as f64;
                        sg += tmp[o + 1] as f64;
                        sb += tmp[o + 2] as f64;
                        sa += tmp[o + 3] as f64;
                    }
                }
                let o = ((y * w + x) * 4) as usize;
                buf[o] = clamp_u8(sr / 9.0);
                buf[o + 1] = clamp_u8(sg / 9.0);
                buf[o + 2] = clamp_u8(sb / 9.0);
                buf[o + 3] = clamp_u8(sa / 9.0);
            }
        }
    }
    let w = w as f64;
    let h = h as f64;
    let wi = w as usize;
    let hi = h as usize;
    for y in 0..hi {
        for x in 0..wi {
            let o = (y * wi + x) * 4;
            let (mut r, mut g, mut b) =
                (buf[o] as f64 / 255.0, buf[o + 1] as f64 / 255.0, buf[o + 2] as f64 / 255.0);
            let yv = 0.299 * r + 0.587 * g + 0.114 * b;
            let iv = 0.596 * r - 0.274 * g - 0.322 * b;
            let qv = 0.211 * r - 0.523 * g + 0.312 * b;
            let i2 = iv * cos_a - qv * sin_a;
            let q2 = iv * sin_a + qv * cos_a;
            r = yv + 0.956 * i2 + 0.621 * q2;
            g = yv - 0.272 * i2 - 0.647 * q2;
            b = yv - 1.106 * i2 + 1.703 * q2;
            r = ((r - 0.5) * contrast + 0.5 + brightness).clamp(0.0, 1.0);
            g = ((g - 0.5) * contrast + 0.5 + brightness).clamp(0.0, 1.0);
            b = ((b - 0.5) * contrast + 0.5 + brightness).clamp(0.0, 1.0);
            let lum = 0.299 * r + 0.587 * g + 0.114 * b;
            r = lum + (r - lum) * saturation;
            g = lum + (g - lum) * saturation;
            b = lum + (b - lum) * saturation;
            if grayscale > 0.001 || sepia > 0.001 || invert > 0.001 {
                let l2 = 0.299 * r + 0.587 * g + 0.114 * b;
                r += (l2 - r) * grayscale;
                g += (l2 - g) * grayscale;
                b += (l2 - b) * grayscale;
                let sr = 0.393 * r + 0.769 * g + 0.189 * b;
                let sg = 0.349 * r + 0.686 * g + 0.168 * b;
                let sb = 0.272 * r + 0.534 * g + 0.131 * b;
                r += (sr - r) * sepia;
                g += (sg - g) * sepia;
                b += (sb - b) * sepia;
                r += ((1.0 - r) - r) * invert;
                g += ((1.0 - g) - g) * invert;
                b += ((1.0 - b) - b) * invert;
            }
            if vignette > 0.001 {
                let u = (x as f64 + 0.5) / w;
                let v = (y as f64 + 0.5) / h;
                let d = ((u - 0.5) * (u - 0.5) + (v - 0.5) * (v - 0.5)).sqrt();
                let f = 1.0 - vignette * smoothstep(0.3, 0.9, d);
                r *= f;
                g *= f;
                b *= f;
            }
            buf[o] = js_round(r.clamp(0.0, 1.0) * 255.0) as u8;
            buf[o + 1] = js_round(g.clamp(0.0, 1.0) * 255.0) as u8;
            buf[o + 2] = js_round(b.clamp(0.0, 1.0) * 255.0) as u8;
        }
    }
}

// ── تست‌ها ─────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64, eps: f64) -> bool {
        (a - b).abs() <= eps
    }

    #[test]
    fn noise_matches_js() {
        // مقادیر مرجع از node (src/render/canvasfx.js).
        assert!(approx(rs_noise(0.0), 0.6386234602905461, 1e-12));
        assert!(approx(rs_noise(1.5), -0.09521049205068266, 1e-12));
        assert!(approx(rs_noise(3.7), 0.49272377479422724, 1e-12));
        assert!(approx(rs_noise(1.5), rs_noise(1.5), 0.0));
        assert!(rs_noise(10.0).abs() <= 1.0);
    }

    #[test]
    fn clamp_u8_rounding() {
        assert_eq!(clamp_u8(127.5), 128); // نیم به زوج: ۱۲۸ زوج است
        assert_eq!(clamp_u8(126.5), 126); // نیم به زوج: ۱۲۶ زوج است
        assert_eq!(clamp_u8(300.0), 255);
        assert_eq!(clamp_u8(-5.0), 0);
        assert_eq!(clamp_u8(f64::NAN), 0);
        assert_eq!(clamp_u8(0.4), 0);
        assert_eq!(clamp_u8(0.6), 1);
    }

    #[test]
    fn invert_and_threshold() {
        let mut px = vec![10u8, 20, 30, 255, 0, 0, 0, 0];
        unsafe { fx_invert(px.as_mut_ptr(), px.len()) };
        assert_eq!(px, vec![245, 235, 225, 255, 0, 0, 0, 0]);
        // پیکسل شفاف دست نخورده می‌ماند (مثل pixelOp در JS).
        let mut px = vec![200u8, 200, 200, 255];
        unsafe { fx_threshold(px.as_mut_ptr(), px.len(), 50.0, 0.0, 0.0, 0.0, 255.0, 255.0, 255.0) };
        assert_eq!(px, vec![255, 255, 255, 255]);
        let mut px = vec![10u8, 10, 10, 255];
        unsafe { fx_threshold(px.as_mut_ptr(), px.len(), 50.0, 0.0, 0.0, 0.0, 255.0, 255.0, 255.0) };
        assert_eq!(px, vec![0, 0, 0, 255]);
    }

    #[test]
    fn posterize_levels() {
        let mut px = vec![0u8, 64, 128, 255, 200, 255, 10, 255];
        unsafe { fx_posterize(px.as_mut_ptr(), px.len(), 4.0) };
        // n=3: round(v/255*3)/3*255 → 0, 85, 170, 170, 255, 0
        assert_eq!(px, vec![0, 85, 170, 255, 170, 255, 0, 255]);
    }

    #[test]
    fn color_adjust_matches_js() {
        // قرمز + چرخش ۱۸۰ درجه → (0,152,153) — مقدار واقعی JS.
        let mut px = vec![255u8, 0, 0, 255];
        unsafe {
            rs_color_adjust(px.as_mut_ptr(), px.len(), 1, 1, 180.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        }
        assert_eq!(px, vec![0, 152, 153, 255]);
        // ترکیب چند پارامتر (مقدار واقعی JS).
        let mut px = vec![200u8, 100, 50, 255, 10, 20, 30, 255];
        unsafe {
            rs_color_adjust(px.as_mut_ptr(), px.len(), 2, 1, 45.0, 0.1, 1.2, 1.5, 0.5, 0.0, 0.3, 0.0, 0.0);
        }
        assert_eq!(px, vec![255, 95, 201, 255, 11, 30, 19, 255]);
        // بلور ۳×۳ با شعاع ۲ (مقدار واقعی JS).
        let mut px = vec![
            100u8, 150, 200, 255, 50, 50, 50, 255, 200, 200, 200, 255, 0, 0, 0, 255,
        ];
        unsafe {
            rs_color_adjust(px.as_mut_ptr(), px.len(), 2, 2, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 2.0);
        }
        assert_eq!(
            px,
            vec![100, 122, 144, 255, 67, 78, 89, 255, 117, 128, 139, 255, 67, 72, 78, 255]
        );
    }

    #[test]
    fn null_safety() {
        unsafe {
            fx_invert(std::ptr::null_mut(), 0);
            fx_invert(std::ptr::null_mut(), 100);
            rs_color_adjust(std::ptr::null_mut(), 0, 0, 0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0);
            assert!(rs_alloc(0).is_null());
            let p = rs_alloc(16);
            assert!(!p.is_null());
            rs_free(p, 16);
        }
    }
}
