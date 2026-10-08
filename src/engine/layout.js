import { W, H } from './song.js';
import { font, FONTS } from './text.js';

/**
 * موتور چیدمان چندحالته — ترجمهٔ وفادار row_layout / place / mode_for
 *
 * این قلب تفاوت بصری است. هر خط شعر بسته به تعداد کلماتش و سبک
 * بخش، یکی از چهار حالت را می‌گیرد:
 *
 *   one   یک سطر، سقف ۱۳۲   (ورود سرد)
 *   giant یک سطر، سقف ۱۵۲   (پیش‌کرس، خطوط کوتاه)
 *   huge  یک سطر، سقف ۱۹۰   (کرس کوتاه)
 *   two   دو سطر متوازن     (کرس بلند، بندهای ۷+ کلمه)
 *
 * و در هر خط، عریض‌ترین کلمه «کلمهٔ کلیدی» است و ۱٫۱۶ برابر
 * بزرگ‌تر کشیده می‌شود. همین یک جزئیات است که به خطوط ریتم
 * بصری می‌دهد.
 */

const PROBE = 100;
const KEY_SCALE = 1.16;

const _rowCache = new Map();
const _placeCache = new Map();

/** عرض متن با فونت مشخص در اندازهٔ probe */
function widthAt(ctx, s, size, family) {
  ctx.font = font(size, family);
  return ctx.measureText(s).width;
}

/** بزرگ‌ترین اندازه‌ای که متن در target جا شود (معادل fit_fa) */
export function fitFa(ctx, s, targetW, family = FONTS.black, probe = 200) {
  const w = widthAt(ctx, s, probe, family);
  return (probe * targetW) / Math.max(1, w);
}

/**
 * چیدن یک سطر از کلمات، راست‌به‌چپ، وسط‌چین.
 * فاصلهٔ بین کلمات = ۳۰٪ اندازهٔ فونت (دقیقاً مثل پایتون).
 */
export function rowLayout(ctx, words, maxw, cap, key = ['', 1.0]) {
  const ck = `${words.join('\u0000')}|${maxw}|${cap}|${key[0]}|${key[1]}`;
  const hit = _rowCache.get(ck);
  if (hit) return hit;

  const sc = words.map(w => (w === key[0] ? key[1] : 1.0));
  let wd = words.map((w, i) => widthAt(ctx, w, PROBE, FONTS.black) * sc[i]);
  let space = PROBE * 0.30;
  const total = wd.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  const size = Math.min(cap, (PROBE * maxw) / total);
  const f = size / PROBE;
  wd = wd.map(w => w * f);
  space *= f;

  let x = W / 2 + (wd.reduce((a, b) => a + b, 0) + space * (words.length - 1)) / 2;
  const items = [];
  for (let i = 0; i < words.length; i++) {
    items.push({ word: words[i], cx: x - wd[i] / 2, size: size * sc[i] });
    x -= wd[i] + space;
  }
  const out = { items, size };
  _rowCache.set(ck, out);
  if (_rowCache.size > 600) _rowCache.delete(_rowCache.keys().next().value);
  return out;
}

/** کدام حالت برای این خط در این سبک */
export function modeFor(line, style) {
  const n = line.words.length;
  if (style === 'chorus') return n > 5 ? 'two' : 'huge';
  if (style === 'cold') return 'one';
  if (style === 'pre' || style === 'mirror') return n <= 4 ? 'giant' : 'two';
  return n >= 7 ? 'two' : (line.i % 2 === 0 ? 'giant' : 'two');
}

/**
 * جای نهایی هر کلمه در یک خط.
 * خروجی: [{ word, t, cx, cy, size, key }]
 */
export function place(ctx, line, mode) {
  const ck = `${line.i}|${mode}`;
  const hit = _placeCache.get(ck);
  if (hit) return hit;

  const words = line.words.map(w => w.text);
  const times = line.words.map(w => w.t);
  const ids   = line.words.map(w => w.id);

  // کلمهٔ کلیدی = عریض‌ترین
  let kw = words[0], kwW = -1;
  for (const w of words) {
    const ww = widthAt(ctx, w, PROBE, FONTS.black);
    if (ww > kwW) { kwW = ww; kw = w; }
  }
  const key = [kw, KEY_SCALE];
  const out = [];

  if (mode === 'two') {
    const half = Math.ceil(words.length / 2);
    const rows = [words.slice(0, half), words.slice(half)];
    const tt   = [times.slice(0, half), times.slice(half)];
    const ii   = [ids.slice(0, half), ids.slice(half)];

    // هر دو سطر با یک اندازهٔ مشترک — کوچک‌ترینِ دو اندازه
    let s0 = Infinity;
    for (const r of rows) if (r.length) s0 = Math.min(s0, rowLayout(ctx, r, 1560, 126, key).size);

    for (let ri = 0; ri < rows.length; ri++) {
      if (!rows[ri].length) continue;
      const { items } = rowLayout(ctx, rows[ri], 1560, s0, key);
      const y = H * 0.50 + (ri - 0.5) * s0 * 1.34;
      items.forEach((it, k) => out.push({
        word: it.word, t: tt[ri][k], id: ii[ri][k],
        cx: it.cx, cy: y, size: it.size, key: it.word === kw,
      }));
    }
  } else {
    const cap = { giant: 152, huge: 190, one: 132 }[mode] ?? 140;
    const { items } = rowLayout(ctx, words, 1700, cap, key);
    items.forEach((it, k) => out.push({
      word: it.word, t: times[k], id: ids[k],
      cx: it.cx, cy: H * 0.50, size: it.size, key: it.word === kw,
    }));
  }

  _placeCache.set(ck, out);
  return out;
}

export function clearLayoutCache() { _rowCache.clear(); _placeCache.clear(); }
