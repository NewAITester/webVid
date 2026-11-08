/**
 * تست برابری Rust/WASM با JS — فاز Rust.
 * هر ۲۲ افکت تک‌پیکسلی و color_adjust را روی یک بافر تصادفی یکسان
 * هم با پیاده‌سازی JS و هم با WASM اجرا می‌کند و بیشینهٔ اختلاف را
 * می‌سنجد (هدف: ۰؛ حد مجاز: ۱). بعد هم بنچ‌مارک ۷۲۰×۱۲۸۰ را چاپ می‌کند.
 * اگر فایل WASM نباشد، اول سعی می‌کند آن را بسازد؛ اگر cargo نباشد،
 * تست رد می‌شود (exit 0) تا روی ماشین بدون Rust سبز بماند.
 *   node tests/rust.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectById } from '../src/core/schema.js';
import { CANVAS_FX, parseColor, noise } from '../src/render/canvasfx.js';
import { applyColorAdjustPixels } from '../src/render/webgl.js';
import { RUST_FX_IDS, dispatchRustFx } from '../src/render/rustfx.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmPath = join(root, 'public', 'wasm', 'lyricstudio-core.wasm');

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

if (!existsSync(wasmPath)) {
  console.log('── WASM ساخته نشده — تلاش برای ساخت ──');
  try {
    execFileSync('node', [join(root, 'scripts', 'build-wasm.mjs')], { stdio: 'inherit' });
  } catch { /* رد می‌شود */ }
}
if (!existsSync(wasmPath)) {
  console.log('⏭️  WASM در دسترس نیست (cargo نصب نیست؟) — تست Rust رد شد.');
  process.exit(0);
}

const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath), {});
const ex = instance.exports;
ok(typeof ex.rs_version === 'function' && ex.rs_version() === 1, 'ماژول WASM بار شد (نسخهٔ ۱)');
ok(Math.abs(ex.rs_noise(1.5) - noise(1.5)) < 1e-12, 'rs_noise با JS برابر است');

// ── ابزار اجرای JS روی یک بافر واقعی ──
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
function runJsFx(id, data, W, H, p, t) {
  const working = new Uint8ClampedArray(data);
  const d = {
    drawImage: () => working.set(data),
    getImageData: () => ({ data: working, width: W, height: H }),
    putImageData: () => {},
  };
  const box = () => ({ x: 0, y: 0, w: W, h: H, cx: W / 2, cy: H / 2, fw: W, fh: H });
  const pixelOp = (dd, fn2) => {
    dd.drawImage(null, 0, 0);
    const b = box();
    const img = dd.getImageData(b.x, b.y, b.w, b.h), q = img.data;
    for (let i = 0; i < q.length; i += 4) if (q[i + 3]) fn2(q, i);
    dd.putImageData(img, b.x, b.y);
  };
  const X = {
    W, H, time: t, px: 1, box, pixelOp, warp: null, smear: null, rgbSplit: null,
    tinted: null, scratch: null, glAdjust: null, noiseTile: null, noise, parseColor, rgbaStr: null, clamp,
  };
  CANVAS_FX[id](d, {}, p, id, X);
  return working;
}

function runRustFx(id, data, p, t) {
  const ptr = ex.rs_alloc(data.length);
  const view = new Uint8Array(ex.memory.buffer, ptr, data.length);
  view.set(data);
  const done = dispatchRustFx(ex, id, ptr, data.length, p, t);
  const out = new Uint8ClampedArray(view);
  ex.rs_free(ptr, data.length);
  if (!done) throw new Error('dispatch failed for ' + id);
  return out;
}

function maxDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

function randomBuf(n, seed) {
  const buf = new Uint8ClampedArray(n);
  let s = seed;
  for (let i = 0; i < n; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    buf[i] = s % 256; buf[i + 1] = (s >> 8) % 256; buf[i + 2] = (s >> 16) % 256;
    buf[i + 3] = i % 32 === 0 ? 0 : 255; // چند پیکسل شفاف برای تست ردشدن
  }
  return buf;
}

const defaults = e => {
  const p = {};
  for (const [k, d] of Object.entries(e.params)) p[k] = d.def;
  return p;
};

console.log('── برابری ۲۲ افکت تک‌پیکسلی ──');
{
  const W = 64, H = 48;
  const src = randomBuf(W * H * 4, 987654321);
  let worst = 0, worstId = '';
  for (const id of RUST_FX_IDS) {
    const e = effectById(id);
    if (!e || !CANVAS_FX[id]) { ok(false, `افکت ${id} در رجیستری/پیاده‌سازی نیست`); continue; }
    const p = defaults(e);
    for (const t of [0.5, 2.0]) {
      const js = runJsFx(id, src, W, H, p, t);
      const rs = runRustFx(id, src, p, t);
      const d = maxDiff(js, rs);
      if (d > worst) { worst = d; worstId = id; }
      if (d > 1) ok(false, `${id} در t=${t} اختلاف ${d} دارد`);
    }
  }
  ok(worst <= 1, `بیشینهٔ اختلاف روی همهٔ افکت‌ها: ${worst} (${worstId || '—'})`);
}

console.log('── برابری color_adjust ──');
{
  const src = randomBuf(4 * 4 * 4, 424242);
  const opts = { hue: 45, brightness: 0.1, contrast: 1.2, saturation: 1.5, vignette: 0.5, sepia: 0.3, blur: 2 };
  const js = applyColorAdjustPixels(new Uint8ClampedArray(src), 4, 4, opts);
  const ptr = ex.rs_alloc(src.length);
  const view = new Uint8Array(ex.memory.buffer, ptr, src.length);
  view.set(src);
  ex.rs_color_adjust(ptr, src.length, 4, 4, opts.hue, opts.brightness, opts.contrast, opts.saturation, opts.vignette, 0, opts.sepia, 0, opts.blur);
  const rs = new Uint8ClampedArray(view);
  ex.rs_free(ptr, src.length);
  ok(maxDiff(js, rs) === 0, `color_adjust دقیقاً برابر است (اختلاف ${maxDiff(js, rs)})`);
}

// ── بنچ‌مارک ──
console.log('── بنچ‌مارک ۷۲۰×۱۲۸۰ (۵ تکرار، میانگین) ──');
{
  const W = 720, H = 1280;
  const src = randomBuf(W * H * 4, 13579);
  const bench = (label, jsFn, rsFn, iters = 5) => {
    let t0 = performance.now();
    for (let i = 0; i < iters; i++) jsFn(new Uint8ClampedArray(src));
    const jsMs = (performance.now() - t0) / iters;
    const ptr = ex.rs_alloc(src.length);
    const view = new Uint8Array(ex.memory.buffer, ptr, src.length);
    t0 = performance.now();
    for (let i = 0; i < iters; i++) { view.set(src); rsFn(ptr, src.length); }
    const rsMs = (performance.now() - t0) / iters;
    ex.rs_free(ptr, src.length);
    const speed = jsMs / Math.max(rsMs, 0.001);
    console.log(`  ${label}: JS ${jsMs.toFixed(1)}ms ←→ Rust ${rsMs.toFixed(1)}ms (×${speed.toFixed(1)})`);
  };
  const pOf = id => defaults(effectById(id));
  bench('threshold', d => runJsFx('threshold', d, W, H, pOf('threshold'), 0.5),
    (ptr, len) => dispatchRustFx(ex, 'threshold', ptr, len, pOf('threshold'), 0.5));
  bench('posterize', d => runJsFx('posterize', d, W, H, pOf('posterize'), 0.5),
    (ptr, len) => dispatchRustFx(ex, 'posterize', ptr, len, pOf('posterize'), 0.5));
  bench('sepiaFx', d => runJsFx('sepiaFx', d, W, H, pOf('sepiaFx'), 0.5),
    (ptr, len) => dispatchRustFx(ex, 'sepiaFx', ptr, len, pOf('sepiaFx'), 0.5));
  bench('thermal', d => runJsFx('thermal', d, W, H, pOf('thermal'), 0.5),
    (ptr, len) => dispatchRustFx(ex, 'thermal', ptr, len, pOf('thermal'), 0.5));
  bench('invertFx', d => runJsFx('invertFx', d, W, H, pOf('invertFx'), 0.5),
    (ptr, len) => dispatchRustFx(ex, 'invertFx', ptr, len, pOf('invertFx'), 0.5));
  bench('levels', d => runJsFx('levels', d, W, H, pOf('levels'), 0.5),
    (ptr, len) => dispatchRustFx(ex, 'levels', ptr, len, pOf('levels'), 0.5));
  bench('exposure', d => runJsFx('exposure', d, W, H, pOf('exposure'), 0.5),
    (ptr, len) => dispatchRustFx(ex, 'exposure', ptr, len, pOf('exposure'), 0.5));
  bench('temperature', d => runJsFx('temperature', d, W, H, pOf('temperature'), 0.5),
    (ptr, len) => dispatchRustFx(ex, 'temperature', ptr, len, pOf('temperature'), 0.5));
  bench('color_adjust', d => applyColorAdjustPixels(d, W, H, { hue: 45, brightness: 0.1, contrast: 1.2, saturation: 1.5, vignette: 0.5, sepia: 0.3 }),
    (ptr, len) => ex.rs_color_adjust(ptr, len, W, H, 45, 0.1, 1.2, 1.5, 0.5, 0, 0.3, 0, 0));
}

if (fail) { console.log(`\n❌ ${fail} خطا`); process.exit(1); }
console.log('\n✅ همهٔ تست‌های Rust گذشت');
