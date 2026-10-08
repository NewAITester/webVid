import { rgba } from './core.js';
import { font, FONTS } from './text.js';
import { C } from './song.js';

/* ── ابزارهای هندسی ─────────────────────────────────────────── */

export function rect(ctx, x, y, w, h, color, a = 1) {
  ctx.fillStyle = rgba(color, a);
  ctx.fillRect(x, y, w, h);
}

export function line(ctx, x0, y0, x1, y1, color, lw = 2, a = 1) {
  if (a <= 0.003) return;
  ctx.strokeStyle = rgba(color, a);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

export function ring(ctx, cx, cy, r, color, lw = 2, a = 1) {
  if (a <= 0.003 || r <= 0) return;
  ctx.strokeStyle = rgba(color, a);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

/* ── متن ────────────────────────────────────────────────────── */

/**
 * جابه‌جایی لازم برای مرکز کردن روی «جعبهٔ جوهر»
 *
 * تفاوت ظریف ولی مهم: پایتون متن را روی ماسک رندرشده مرکز می‌کرد،
 * یعنی وسطِ پیکسل‌های واقعیِ حرف. ولی textBaseline='middle' در canvas
 * روی متریک فونت (em) مرکز می‌کند که برای فونت فارسی با صعودی‌های
 * بلند، چند ده پیکسل بالاتر می‌افتد.
 *
 * نتیجه‌اش این بود که عنوان کارت پایان ۲۴ پیکسل بالاتر از اصل بود.
 */
const _inkCache = new Map();

function inkOffset(ctx, s, size, family) {
  const k = `${s}|${size}|${family}`;
  const hit = _inkCache.get(k);
  if (hit !== undefined) return hit;
  ctx.font = font(size, family);
  const m = ctx.measureText(s);
  const asc = m.actualBoundingBoxAscent, dsc = m.actualBoundingBoxDescent;
  // اگر مرورگر این متریک‌ها را نداشت، به حالت قبلی برگرد
  const v = Number.isFinite(asc) && Number.isFinite(dsc) ? (asc - dsc) / 2 : null;
  _inkCache.set(k, v);
  if (_inkCache.size > 900) _inkCache.delete(_inkCache.keys().next().value);
  return v;
}

/**
 * متن فارسی.
 * baseline: 'mid' وسطِ جوهر، 'cap' بالای حرف
 */
export function textFa(ctx, s, x, y, size, color, a = 1,
                       family = FONTS.black, align = 'center', baseline = 'mid') {
  if (a <= 0.004 || !s) return;
  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = align;
  ctx.font = font(size, family);
  ctx.fillStyle = rgba(color, a);

  if (baseline === 'cap') {
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y + size * 0.74);
  } else {
    const off = inkOffset(ctx, s, size, family);
    if (off === null) {
      ctx.textBaseline = 'middle';
      ctx.fillText(s, x, y);
    } else {
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(s, x, y + off);
    }
  }
  ctx.restore();
}

/** متن لاتین تک‌فاصله با فاصلهٔ حروف — برای Telegram: @ZurvanEcho */
export function textMono(ctx, s, x, y, size, color, a = 1, tracking = 4, align = 'left') {
  if (a <= 0.004 || !s) return;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  ctx.fillStyle = rgba(color, a);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
  ctx.textAlign = align;
  ctx.fillText(s, x, y + size * 0.74);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();
}

/**
 * متن تورفته (outline)
 *
 * روش غلطی که اول رفتم: strokeText.
 * آن هر حرف را جداگانه دور می‌گیرد، پس در محل چسبیدن دو حرف فارسی
 * لبهٔ داخلی هرکدام دیده می‌شود و یک خط عمودی زشت می‌افتد وسط کلمه.
 *
 * روش درست (همان کاری که پایتون می‌کرد): کل کلمه را به‌صورت یک ماسک
 * واحد پر می‌کنیم، یک نسخهٔ فرسوده‌شده (eroded) از آن می‌سازیم، و
 * فرسوده را از اصل کم می‌کنیم. چون کلمه یک شکل یکپارچه است، اتصال‌ها
 * اصلاً مرزی ندارند.
 *
 * فرسایش در canvas: اشتراک چند کپیِ جابه‌جاشده روی دایره‌ای به شعاع w،
 * با حالت ترکیب destination-in.
 *
 * نتیجه کش می‌شود، چون عنوان‌ها در طول کلیپ ثابت‌اند و این کار گران است.
 */
const _outlineCache = new Map();
const ERODE_DIRS = 16;

function buildOutline(s, size, family, w, color) {
  const key = `${s}|${size.toFixed(1)}|${family}|${w}|${color}`;
  const hit = _outlineCache.get(key);
  if (hit) return hit;

  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font(size, family);
  const m = probe.measureText(s);
  const asc = Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : size * 0.8;
  const dsc = Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : size * 0.3;
  const pad = Math.ceil(w * 2 + 6);
  const cw = Math.ceil(m.width + pad * 2);
  const ch = Math.ceil(asc + dsc + pad * 2);
  if (cw < 2 || ch < 2 || cw > 8000 || ch > 4000) return null;

  const mk = (fn) => {
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    fn(c.getContext('2d'));
    return c;
  };

  // ۱) ماسک پر — کل کلمه، یکپارچه
  const drawText = (g) => {
    g.direction = 'rtl';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = font(size, family);
    g.fillStyle = '#fff';
    g.fillText(s, cw / 2, ch / 2 + (asc - dsc) / 2);
  };
  const mask = mk(drawText);

  // ۲) نسخهٔ فرسوده: اشتراک کپی‌های جابه‌جاشده
  const eroded = mk(g => { g.drawImage(mask, 0, 0); });
  const eg = eroded.getContext('2d');
  eg.globalCompositeOperation = 'destination-in';
  for (let i = 0; i < ERODE_DIRS; i++) {
    const a = (i / ERODE_DIRS) * Math.PI * 2;
    eg.drawImage(mask, Math.cos(a) * w, Math.sin(a) * w);
  }
  eg.globalCompositeOperation = 'source-over';

  // ۳) اصل منهای فرسوده = پوستهٔ توخالی
  const shell = mk(g => { g.drawImage(mask, 0, 0); });
  const sg = shell.getContext('2d');
  sg.globalCompositeOperation = 'destination-out';
  sg.drawImage(eroded, 0, 0);
  // ۴) رنگ‌آمیزی
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = color;
  sg.fillRect(0, 0, cw, ch);
  sg.globalCompositeOperation = 'source-over';

  const out = { canvas: shell, cw, ch };
  _outlineCache.set(key, out);
  if (_outlineCache.size > 40) {
    const k0 = _outlineCache.keys().next().value;
    _outlineCache.delete(k0);
  }
  return out;
}

export function outlineTextFa(ctx, s, x, y, size, color, a = 1,
                              family = FONTS.black, w = 3) {
  if (a <= 0.004 || !s) return;
  const o = buildOutline(s, size, family, w, color);
  if (!o) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.drawImage(o.canvas, x - o.cw / 2, y - o.ch / 2);
  ctx.restore();
}

export function clearOutlineCache() { _outlineCache.clear(); }

/**
 * کشیدن یک کلمهٔ شعر — ترجمهٔ وفادار word_draw
 *
 * سه حالت دارد و تفاوتشان ظریف ولی تعیین‌کننده است:
 *   • خوانده‌نشده  → خاکستری محو (GHOST)
 *   • کلمهٔ کلیدی  → رنگ تأکید، با هالهٔ سفید محوشونده
 *   • بقیهٔ کلمات  → سفید استخوانی، با هالهٔ رنگ تأکید محوشونده
 *
 * یعنی برخلاف تصور اول، همهٔ کلمات خوانده‌شده قرمز نمی‌شوند؛
 * فقط کلمهٔ کلیدی. بقیه سفیدند و فقط لحظه‌ای هالهٔ قرمز می‌گیرند.
 */
export function wordDraw(ctx, word, cx, cy, size, sung, heat, pop, a, isKey, acc, invert = false) {
  if (a <= 0.01) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);

  const base = invert ? C.BG : C.BONE;
  const gh   = invert ? '#8E8E96' : C.GHOST;

  if (!sung) {
    textFa(ctx, word, 0, 0, size, gh, 0.8 * a);
  } else if (isKey) {
    if (heat > 0.02) textFa(ctx, word, 0, 0, size * 1.03, C.BONE, heat * 0.5 * a);
    textFa(ctx, word, 0, 0, size, acc, a);
  } else {
    if (heat > 0.02) textFa(ctx, word, 0, 0, size * 1.03, acc, heat * a);
    textFa(ctx, word, 0, 0, size, base, a);
  }
  ctx.restore();
}
