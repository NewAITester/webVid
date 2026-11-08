/**
 * تست برابری افکت‌ها — فاز R6.
 * رجیستری (۲۹۱ افکت)، پیاده‌سازی‌های canvas (۲۴۷) و شکل‌ها (۲۱)
 * را بدون مرورگر می‌سنجد؛ بوم و ctx با استاب جعلی ساخته می‌شوند.
 *   node tests/effects.test.mjs
 */
import { EFFECTS, SHAPE_KINDS, effectById } from '../src/core/schema.js';
import { CANVAS_FX, applyCanvasFxList, noise, parseColor } from '../src/render/canvasfx.js';
import { shapePath } from '../src/render/renderer.js';
import { canvasEffects, effectParamsAt } from '../src/core/evaluate.js';
import { newLayer } from '../src/core/schema.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

/* ── استاب بوم ── */
function fakeCtx(W, H) {
  const imgData = () => ({ data: new Uint8ClampedArray(W * H * 4).fill(128), width: W, height: H });
  const grad = { addColorStop() {} };
  const stub = new Proxy(function () {}, {
    get: (t, p) => {
      if (p === 'getImageData' || p === 'createImageData') return () => imgData();
      if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => grad;
      if (p === 'createPattern') return () => ({});
      if (p === Symbol.toPrimitive) return () => 0;
      return stub;
    },
    set: () => true,
    apply: () => stub,
  });
  return stub;
}
function fakeCanvas(W, H) {
  return { width: W, height: H, getContext: () => fakeCtx(W, H) };
}
if (typeof document === 'undefined') {
  globalThis.document = { createElement: () => fakeCanvas(64, 64) };
}

console.log('── رجیستری ──');
{
  ok(EFFECTS.length === 291, `رجیستری ${EFFECTS.length} افکت دارد (هدف: ۲۷۲+)`);
  const ids = EFFECTS.map(e => e.id);
  ok(new Set(ids).size === ids.length, 'شناسهٔ تکراری نیست');
  ok(EFFECTS.every(e => e.id && e.name && e.cat && e.kind && e.params && typeof e.params === 'object'), 'همهٔ افکت‌ها id/name/cat/kind/params دارند');
  ok(EFFECTS.every(e => Object.values(e.params).every(p => p.type && p.def !== undefined && p.label)), 'همهٔ پارامترها type/def/label دارند');
  const canvasKind = EFFECTS.filter(e => e.kind === 'canvas').length;
  ok(canvasKind === 252, `افکت‌های canvas: ${canvasKind}`);
  const withImpl = EFFECTS.filter(e => CANVAS_FX[e.id]).length;
  ok(withImpl === 247, `افکت‌های با پیاده‌سازی canvas: ${withImpl}`);
  const registryOnly = EFFECTS.filter(e => e.kind === 'filter' && !CANVAS_FX[e.id]).length;
  console.log(`  (رجیستری‌صرف: ${registryOnly} افکت بدون پیاده‌سازی رندر — مثل برنامهٔ قبلی)`);
  // هر پیاده‌سازی در رجیستری است
  ok(Object.keys(CANVAS_FX).every(id => effectById(id)), 'همهٔ پیاده‌سازی‌ها در رجیستری‌اند');
}

console.log('── پیاده‌سازی‌های canvas (اجرا بدون خطا) ──');
{
  const defaults = e => {
    const p = {};
    for (const [k, d] of Object.entries(e.params)) p[k] = d.def;
    return p;
  };
  let ran = 0, skipped = 0;
  for (const e of EFFECTS) {
    if (!CANVAS_FX[e.id]) { skipped++; continue; }
    const cv = fakeCanvas(64, 64);
    try {
      applyCanvasFxList(cv, [{ id: e.id, p: defaults(e) }], 0.5, null);
      applyCanvasFxList(cv, [{ id: e.id, p: defaults(e) }], 2.0, null);
      ran++;
    } catch (err) {
      ok(false, `افکت ${e.id} خطا داد: ${err.message}`);
    }
  }
  ok(ran === 247, `${ran} پیاده‌سازی روی بوم جعلی اجرا شد (ردشده: ${skipped})`);
  // کلیدهای پارامتر خوانده‌شده در هر پیاده‌سازی باید در تعریف رجیستری باشند
  // (وگرنه مقدار undefined می‌شود و افکت لایه را خراب می‌کند).
  // ۱۰ افکت با شاخهٔ بومی در رندر (pixelate/vignette/noise/glow/textGlow/
  // scanlines/wave/ripple/tile/chromaShift) پیاده‌سازی پورت‌شده‌شان سایه‌خورده
  // است و هرگز اجرا نمی‌شود، پس از این بررسی بیرون‌اند.
  const NATIVE = new Set(['pixelate', 'vignette', 'noise', 'glow', 'textGlow', 'scanlines', 'wave', 'ripple', 'tile', 'chromaShift']);
  {
    let bad = [];
    for (const e of EFFECTS) {
      if (e.kind !== 'canvas' || !CANVAS_FX[e.id] || NATIVE.has(e.id)) continue;
      const src = CANVAS_FX[e.id].toString();
      const keys = [...new Set([...src.matchAll(/\bv\.([a-zA-Z0-9_]+)/g)].map(m => m[1]))];
      for (const k of keys) if (!(k in e.params)) bad.push(`${e.id}.v.${k}`);
    }
    ok(bad.length === 0, bad.length ? `کلیدهای ناهماهنگ: ${bad.slice(0, 8).join(', ')}` : 'کلیدهای پارامتر پیاده‌سازی‌ها با رجیستری هماهنگ‌اند');
  }
  // نویز و رنگ قطعی‌اند
  ok(noise(0.5) === noise(0.5) && noise(0.5) >= -1 && noise(0.5) <= 1, 'نویز قطعی و در بازهٔ ‎-۱..۱ است');
  ok(JSON.stringify(parseColor('#FF2D7880')) === JSON.stringify([255, 45, 120, 0.5019607843137255]), 'تجزیهٔ رنگ با آلفا درست است');
}

console.log('── اتصال به لایه ──');
{
  const l = newLayer('shape', { start: 0, end: 4 });
  l.effects = [
    { id: 'glow', params: { color: '#FFFFFF', amount: 16 }, enabled: true },
    { id: 'vignette', params: { amount: 0.5 }, enabled: true },
    { id: 'blur', params: { amount: 8 }, enabled: true },
    { id: 'supernova', params: { amt: 50 }, enabled: true },
    { id: 'fade', params: { amount: 1 }, enabled: true },
  ];
  const ce = canvasEffects(l);
  ok(ce.length === 3 && ce.map(f => f.id).join(',') === 'glow,vignette,supernova', 'canvasEffects فقط افکت‌های canvas را می‌گیرد (glow,vignette,supernova)');
  const p = effectParamsAt(l.effects[3], 1);
  ok(p.amt === 50, 'پارامتر افکت پورت‌شده خوانده می‌شود');
}

console.log('── شکل‌ها ──');
{
  ok(SHAPE_KINDS.length === 21, `شکل‌ها: ${SHAPE_KINDS.length} (هدف: ۲۰ Alight + لوزی)`);
  for (const k of ['cross', 'pie', 'arc', 'moon', 'teardrop', 'roundrect', 'quad', 'plus', 'stamp', 'arrow', 'callout']) {
    ok(SHAPE_KINDS.includes(k), `شکل ${k} هست`);
  }
  const ctx = fakeCtx(200, 200);
  let threw = null;
  try {
    for (const k of SHAPE_KINDS) shapePath(ctx, k, 200, 200);
  } catch (e) { threw = e; }
  ok(!threw, 'همهٔ شکل‌ها بدون خطا رسم می‌شوند');
}

console.log(fail === 0 ? '\n✅ همهٔ تست‌ها گذشت' : `\n❌ ${fail} تست ناموفق`);
process.exit(fail ? 1 : 0);
