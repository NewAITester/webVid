import { font } from './text.js';

/**
 * تبدیل متن به «ابر نقطه»
 *
 * برای افکت‌هایی مثل پاشیدن حروف، لازم داریم بدانیم پیکسل‌های
 * یک کلمه دقیقاً کجا هستند. روش: کلمه را روی یک بوم پنهان می‌کشیم،
 * پیکسل‌هایش را می‌خوانیم، و هر چند پیکسل یک‌بار یک نقطه برمی‌داریم.
 *
 * نتیجه کش می‌شود چون این کار گران است و نباید هر فریم تکرار شود.
 */

const cache = new Map();
let off = null, offCtx = null;

function scratch(w, h) {
  if (!off) {
    off = document.createElement('canvas');
    offCtx = off.getContext('2d', { willReadFrequently: true });
  }
  if (off.width < w || off.height < h) {
    off.width = Math.max(off.width, w);
    off.height = Math.max(off.height, h);
  }
  return offCtx;
}

/**
 * @returns {Array<{x,y}>} نقاط نسبت به مرکز متن
 */
export function textPoints(text, size, family, step = 5) {
  const key = `${text}|${size}|${family}|${step}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const pad = Math.ceil(size * 0.4);
  const ctx = scratch(2048, Math.ceil(size * 2.2) + pad * 2);
  const W = off.width, H = off.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(size, family);
  ctx.fillStyle = '#fff';
  const cx = W / 2, cy = H / 2;
  ctx.fillText(text, cx, cy);

  const w = Math.min(W, Math.ceil(ctx.measureText(text).width) + pad * 2);
  const x0 = Math.max(0, Math.floor(cx - w / 2));
  const img = ctx.getImageData(x0, 0, w, H).data;

  const pts = [];
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < w; x += step) {
      if (img[(y * w + x) * 4 + 3] > 110) {
        pts.push({ x: x0 + x - cx, y: y - cy });
      }
    }
  }
  cache.set(key, pts);
  if (cache.size > 220) cache.delete(cache.keys().next().value);
  return pts;
}

export function clearGlyphCache() { cache.clear(); }
