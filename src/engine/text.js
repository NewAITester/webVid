/**
 * متن فارسی
 *
 * خبر خوب: مرورگر خودش HarfBuzz و ICU دارد، پس شکل‌دهی حروف
 * (چسبیدن حروف به هم) و راست‌به‌چپ بودن «مجانی» است.
 * همان چیزی که در پایتون با libraqm و کلی دردسر درست کردیم،
 * اینجا فقط یک ctx.direction = 'rtl' است.
 */

export const FONTS = {
  black: 'IRANSansX Black',
  bold:  'IRANSansX Bold',
};

/** فونت‌ها را قبل از اولین رندر لود می‌کند */
export async function loadFonts() {
  const defs = [
    [FONTS.black, '/fonts/IRANSansX-Black.ttf'],
    [FONTS.bold,  '/fonts/IRANSansX-Bold.ttf'],
  ];
  await Promise.all(defs.map(async ([name, url]) => {
    const f = new FontFace(name, `url(${url})`);
    await f.load();
    document.fonts.add(f);
  }));
  await document.fonts.ready;
}

/** رشتهٔ فونت برای canvas */
export const font = (size, family = FONTS.black) => `${size}px "${family}"`;

/** تنظیم context برای متن فارسی */
export function setupRTL(ctx) {
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

/** عرض یک رشته با فونت و اندازهٔ مشخص */
export function measure(ctx, text, size, family = FONTS.black) {
  ctx.font = font(size, family);
  return ctx.measureText(text).width;
}

/** بزرگ‌ترین اندازه‌ای که متن در عرض maxW جا شود */
export function fitSize(ctx, text, maxW, start = 160, min = 24, family = FONTS.black) {
  let s = start;
  while (s > min && measure(ctx, text, s, family) > maxW) s -= 2;
  return s;
}

/* ── ارقام فارسی ───────────────────────────────────────────── */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const faNum = n => String(n).replace(/\d/g, d => FA_DIGITS[+d]);

/** زمان را به شکل ۰۱:۲۳.۴۵ فارسی برمی‌گرداند */
export function faTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const txt = `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  return faNum(txt);
}

/**
 * چیدمان یک خط: جای هر کلمه را در فضای طراحی حساب می‌کند.
 * راست‌به‌چپ، وسط‌چین، با فاصلهٔ یکسان.
 *
 * خروجی هر کلمه: { word, x, y, w, size }
 * x مرکز کلمه است (چون textAlign = center).
 *
 * اینجا جایی است که بعداً لایهٔ override دستی وصل می‌شود:
 * اگر برای یک کلمه افست ذخیره شده باشد، به x و y اضافه می‌شود.
 */
export function layoutLine(ctx, line, {
  cx = 960, cy = 540, maxW = 1560, size = null,
  gap = 26, family = FONTS.black, overrides = null,
} = {}) {
  const words = line.words;
  const text = words.map(w => w.text).join(' ');
  const fs = size ?? fitSize(ctx, text, maxW, 170, 30, family);

  ctx.font = font(fs, family);
  const widths = words.map(w => ctx.measureText(w.text).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);

  // راست‌به‌چپ: از لبهٔ راست شروع و به چپ می‌رویم
  let x = cx + total / 2;
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = widths[i];
    const item = { word: words[i], x: x - w / 2, y: cy, w, h: fs, size: fs, family };
    const ov = overrides?.[words[i].id];
    if (ov) {
      item.x += ov.dx || 0;
      item.y += ov.dy || 0;
      if (ov.scale) item.size *= ov.scale;
      item.moved = true;
    }
    out.push(item);
    x -= w + gap;
  }
  return { items: out, size: fs, total };
}

/** آیا نقطهٔ (px,py) روی این کلمه است؟ — برای تشخیص لمس هنگام درگ */
export function hitTest(items, px, py, padX = 14, padY = 10) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const hw = it.w / 2 + padX, hh = it.size * 0.62 + padY;
    if (px >= it.x - hw && px <= it.x + hw && py >= it.y - hh && py <= it.y + hh) return it;
  }
  return null;
}
