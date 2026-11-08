/**
 * پل Rust/WASM موتور پیکسل — فاز Rust
 * ─────────────────────────────────────────────────────────────
 * حلقه‌های تک‌پیکسلی ۲۲ افکت (همان ریاضیات canvasfx.js) در Rust
 * کامپایل شده‌اند و روی یک بافر خام در حافظهٔ WASM اجرا می‌شوند.
 * بارگذاری تنبل است و رندر هم‌زمان نمی‌شود: اگر WASM آماده نباشد
 * (jsdom، مرورگر قدیمی، نبود فایل) یا یک افکت در جدول Rust نباشد،
 * همان پیاده‌سازی JS اجرا می‌شود — هیچ افکتی به Rust وابسته نیست.
 * فایل WASM در `public/wasm/lyricstudio-core.wasm` ساخته می‌شود
 * (scripts/build-wasm.mjs) و با بیلد وب کپی می‌شود.
 */

import { parseColor } from './canvasfx.js';

let _ex = null; // exports ماژول WASM
let _loadPromise = null;

/** آیا WASM بار شده و آماده است؟ (هم‌زمان، برای حلقهٔ رندر) */
export function rustFxReady() {
  return !!_ex;
}

function wasmUrl() {
  const base = import.meta.env?.BASE_URL || './';
  const href = typeof location !== 'undefined' ? location.href : 'http://localhost/';
  return new URL(base + 'wasm/lyricstudio-core.wasm', href).href;
}

export function loadRust() {
  if (!_loadPromise) {
    _loadPromise = (async () => {
      try {
        let inst;
        try {
          inst = await WebAssembly.instantiateStreaming(fetch(wasmUrl()));
        } catch {
          const res = await fetch(wasmUrl());
          const buf = await res.arrayBuffer();
          inst = await WebAssembly.instantiate(buf, {});
        }
        _ex = inst.instance.exports;
        if (typeof window !== 'undefined') window.__rustReady = true;
        return true;
      } catch {
        if (typeof window !== 'undefined') window.__rustReady = false;
        return false;
      }
    })();
  }
  return _loadPromise;
}
// مشتاقانه — فقط در مرورگر (در Node تست‌ها خودشان WASM را بار می‌کنند).
if (typeof window !== 'undefined') loadRust();

// بافر موقت در حافظهٔ WASM — یک بار تخصیص، برای هر فریم بازاستفاده.
let _scratch = { ptr: 0, len: 0 };
function ensureScratch(ex, len) {
  if (_scratch.len < len) {
    if (_scratch.ptr) ex.rs_free(_scratch.ptr, _scratch.len);
    _scratch.ptr = ex.rs_alloc(len);
    if (!_scratch.ptr) return null;
    _scratch.len = len;
  }
  return new Uint8Array(ex.memory.buffer, _scratch.ptr, len);
}

function runFx(ex, data, call) {
  const view = ensureScratch(ex, data.length);
  if (!view) return false;
  view.set(data);
  call(_scratch.ptr, data.length);
  data.set(view);
  return true;
}

// نگاشت شناسهٔ افکت → فراخوانی WASM با پارامترهای حل‌شده.
// کلیدها دقیقاً همان‌هایی‌اند که پیاده‌سازی JS در canvasfx.js می‌خواند.
const RUST_FX = new Map([
  ['duotone', (ex, ptr, len, p) => {
    const [r1, g1, b1] = parseColor(p.c1), [r2, g2, b2] = parseColor(p.c2);
    ex.fx_duotone(ptr, len, r1, g1, b1, r2, g2, b2, p.amt ?? 100);
  }],
  ['posterize', (ex, ptr, len, p) => ex.fx_posterize(ptr, len, p.levels ?? 4)],
  ['threshold', (ex, ptr, len, p) => {
    const [r1, g1, b1] = parseColor(p.c1), [r2, g2, b2] = parseColor(p.c2);
    ex.fx_threshold(ptr, len, p.level ?? 50, r1, g1, b1, r2, g2, b2);
  }],
  ['vibrance', (ex, ptr, len, p) => ex.fx_vibrance(ptr, len, p.amt ?? 0)],
  ['lumaKey', (ex, ptr, len, p) => ex.fx_lumakey(ptr, len, p.level ?? 50, p.soft ?? 10, p.mode ?? 0)],
  ['solarize', (ex, ptr, len, p) => ex.fx_solarize(ptr, len, p.level ?? 50)],
  ['invertFx', (ex, ptr, len) => ex.fx_invert(ptr, len)],
  ['matte', (ex, ptr, len, p) => ex.fx_matte(ptr, len, p.level ?? 50, p.soft ?? 10, p.mode ?? 0)],
  ['temperature', (ex, ptr, len, p) => ex.fx_temperature(ptr, len, p.amt ?? 0)],
  ['exposure', (ex, ptr, len, p) => ex.fx_exposure(ptr, len, p.amt ?? 0)],
  ['levels', (ex, ptr, len, p) => ex.fx_levels(ptr, len, p.black ?? 0, p.white ?? 100, p.gamma ?? 100)],
  ['sepiaFx', (ex, ptr, len, p) => ex.fx_sepia(ptr, len, p.amt ?? 100)],
  ['comic', (ex, ptr, len, p) => ex.fx_comic(ptr, len, p.level ?? 50)],
  ['infrared', (ex, ptr, len) => ex.fx_infrared(ptr, len)],
  ['thermal', (ex, ptr, len) => ex.fx_thermal(ptr, len)],
  ['tritone', (ex, ptr, len, p) => {
    const [r1, g1, b1] = parseColor(p.c1), [r2, g2, b2] = parseColor(p.c2), [r3, g3, b3] = parseColor(p.c3);
    ex.fx_tritone(ptr, len, r1, g1, b1, r2, g2, b2, r3, g3, b3);
  }],
  ['crossProcess', (ex, ptr, len, p) => ex.fx_cross_process(ptr, len, p.amt ?? 100)],
  ['silhouette', (ex, ptr, len, p) => {
    const [r, g, b] = parseColor(p.color ?? '#111111');
    ex.fx_silhouette(ptr, len, r, g, b);
  }],
  ['xray', (ex, ptr, len) => ex.fx_xray(ptr, len)],
  ['colorPop', (ex, ptr, len, p) => {
    const [r, g, b] = parseColor(p.color ?? '#E4142A');
    ex.fx_color_pop(ptr, len, r, g, b, p.tol ?? 20);
  }],
  ['flicker', (ex, ptr, len, p, t) => ex.fx_flicker(ptr, len, t, p.amt ?? 100)],
  ['invertPulse', (ex, ptr, len, p, t) => ex.fx_invert_pulse(ptr, len, t, p.amt ?? 100)],
]);

export const RUST_FX_IDS = [...RUST_FX.keys()];

/** فراخوانی مستقیم یک افکت با exports از پیش بار شده (برای تست). */
export function dispatchRustFx(ex, id, ptr, len, p, t) {
  const entry = RUST_FX.get(id);
  if (!entry) return false;
  entry(ex, ptr, len, p, t);
  return true;
}

/**
 * اجرای یک افکت روی بوم مقصد با WASM. همان قدم‌های pixelOp در
 * canvasfx.js را تکرار می‌کند (drawImage از cur، getImageData،
 * putImageData). در صورت هر خطا false برمی‌گرداند تا فراخواننده
 * همان پیاده‌سازی JS را اجرا کند.
 */
export function runRustFxOnCanvas(id, ctx, cur, W, H, p, t) {
  if (!_ex || !RUST_FX.has(id)) return false;
  try {
    ctx.drawImage(cur, 0, 0);
    const img = ctx.getImageData(0, 0, W, H);
    if (!runFx(_ex, img.data, (ptr, len) => dispatchRustFx(_ex, id, ptr, len, p, t))) return false;
    ctx.putImageData(img, 0, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * تنظیم رنگ CPU با WASM (همان rs_color_adjust) — برای تست برابری و
 * استفادهٔ آینده؛ مسیر داغ رندر از WebGL یا ctx.filter استفاده می‌کند.
 */
export function rustColorAdjust(data, w, h, opts = {}) {
  if (!_ex) return false;
  try {
    return runFx(_ex, data, (ptr, len) => _ex.rs_color_adjust(
      ptr, len, w, h,
      opts.hue || 0, opts.brightness || 0,
      opts.contrast == null ? 1 : opts.contrast,
      opts.saturation == null ? 1 : opts.saturation,
      opts.vignette || 0, opts.grayscale || 0, opts.sepia || 0,
      opts.invert || 0, opts.blur || 0,
    ));
  } catch {
    return false;
  }
}
