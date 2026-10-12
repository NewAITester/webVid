/**
 * متن نیمه‌شفاف بدون «درز» بین حروف
 *
 * مشکل: در فارسی حروف متصل کمی روی هم می‌افتند. وقتی متن با شفافیت
 * (globalAlpha یا رنگ rgba) کشیده می‌شود، هر حرف جدا ترکیب می‌شود و
 * محل اتصال دو بار رنگ می‌خورد — یک خط پررنگ‌تر بین حروف. با دور
 * (stroke) بدتر هم می‌شود، چون دورِ هر حرف از زیر حرف بعدی پیداست.
 *
 * راه‌حل: متن را کاملاً مات روی یک بوم کمکی هم‌اندازهٔ پیکسل‌های واقعی
 * (با همان ترنسفرم) می‌کشیم و بعد یک‌جا با شفافیت روی بوم اصلی
 * می‌گذاریم. پس شفافیت فقط یک بار و یکنواخت اعمال می‌شود.
 */
let scratch = null, sctx = null;
function getScratch(w, h) {
  if (!scratch) {
    scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    if (!scratch.width) { scratch.width = w; scratch.height = h; }
    sctx = scratch.getContext('2d');
  }
  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, w);
    scratch.height = Math.max(scratch.height, h);
    sctx = scratch.getContext('2d');
  }
  return sctx;
}

/** آلفای یک رنگ متنی و نسخهٔ مات آن */
export function splitAlpha(c) {
  if (typeof c !== 'string') return [c, 1];
  let m = c.match(/^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/i);
  if (m) return [`rgb(${m[1]},${m[2]},${m[3]})`, Math.max(0, Math.min(1, parseFloat(m[4])))];
  m = c.match(/^hsla\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/i);
  if (m) return [`hsl(${m[1]},${m[2]},${m[3]})`, Math.max(0, Math.min(1, parseFloat(m[4])))];
  m = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i);
  if (m) return ['#' + m[1], parseInt(m[2], 16) / 255];
  return [c, 1];
}

/**
 * مثل fillText (و اگر stroke=true اول strokeText) ولی بدون درز.
 * وضعیت فعلی ctx (فونت، تراز، رنگ، ترنسفرم، سایه، فیلتر) رعایت می‌شود.
 */
export function solidText(ctx, s, x, y, stroke = false, fill = true) {
  if (!s) return;
  const [fs, fa] = splitAlpha(ctx.fillStyle);
  const [ss, sa] = stroke ? splitAlpha(ctx.strokeStyle) : [null, 1];
  const ga = ctx.globalAlpha * (fill ? fa : sa);
  // مات است؟ همان راه معمول
  if (ga >= 0.999 && (!stroke || sa >= 0.999) || ga <= 0.002 || typeof ctx.getTransform !== 'function') {
    if (stroke) ctx.strokeText(s, x, y);
    if (fill) ctx.fillText(s, x, y);
    return;
  }
  const mt = ctx.measureText(s);
  const lw = stroke ? ctx.lineWidth : 0;
  const pad = lw + 4;
  const l = x - (mt.actualBoundingBoxLeft || 0) - pad, r = x + (mt.actualBoundingBoxRight || mt.width) + pad;
  const t = y - (mt.actualBoundingBoxAscent || 0) - pad, b = y + (mt.actualBoundingBoxDescent || 0) + pad;
  const M = ctx.getTransform();
  const pts = [[l, t], [r, t], [l, b], [r, b]].map(([px, py]) => [M.a * px + M.c * py + M.e, M.b * px + M.d * py + M.f]);
  const cw = ctx.canvas?.width || 4096, ch = ctx.canvas?.height || 4096;
  let x0 = Math.floor(Math.max(0, Math.min(...pts.map(p => p[0])))), y0 = Math.floor(Math.max(0, Math.min(...pts.map(p => p[1]))));
  let x1 = Math.ceil(Math.min(cw, Math.max(...pts.map(p => p[0])))), y1 = Math.ceil(Math.min(ch, Math.max(...pts.map(p => p[1]))));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  if (w * h > 9e6) { if (stroke) ctx.strokeText(s, x, y); if (fill) ctx.fillText(s, x, y); return; }
  const g = getScratch(w, h);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.filter = 'none';
  g.clearRect(0, 0, w, h);
  g.setTransform(M.a, M.b, M.c, M.d, M.e - x0, M.f - y0);
  g.font = ctx.font; g.textAlign = ctx.textAlign; g.textBaseline = ctx.textBaseline; g.direction = ctx.direction;
  if ('letterSpacing' in g) g.letterSpacing = ctx.letterSpacing;
  if ('fontKerning' in g) g.fontKerning = ctx.fontKerning;
  g.lineJoin = ctx.lineJoin; g.miterLimit = ctx.miterLimit; g.lineWidth = ctx.lineWidth;
  g.fillStyle = fs;
  if (stroke) { g.strokeStyle = ss; g.globalAlpha = fill ? sa / Math.max(0.001, fa) : 1; g.strokeText(s, x, y); g.globalAlpha = 1; }
  if (fill) g.fillText(s, x, y);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = ga;
  ctx.drawImage(scratch, 0, 0, w, h, x0, y0, w, h);
  ctx.restore();
}
