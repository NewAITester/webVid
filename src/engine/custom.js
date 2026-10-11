import { W, H, C, S, SF, outQuint, outExpo } from './song.js';
import { clamp, lerp, ease, hash, hash2, noise1, rgba, mixHex, remap, ramp, env } from './core.js';
import { place, modeFor, fitFa, rowLayout } from './layout.js';
import { textFa, textMono, outlineTextFa, wordDraw, line, rect, ring } from './draw.js';
import { applyOverrides } from './overrides.js';
import { textPoints } from './glyphs.js';
import { particles } from './field.js';
import { FONTS, font } from './text.js';

/**
 * افکت سفارشی — کدی که خود کاربر می‌نویسد
 *
 * بدنهٔ تابع به‌صورت متن ذخیره می‌شود و با new Function کامپایل
 * می‌شود. دو ورودی می‌گیرد:
 *
 *   ctx  بوم، در فضای طراحی (W × H)
 *   e    همه‌چیزِ این لحظه: زمان، ضرب، کلمات، و جعبه‌ابزار
 *
 * خطا هر فریم گرفته می‌شود و فقط یک‌بار گزارش می‌شود، وگرنه یک
 * غلط تایپی کنسول را پر می‌کند و برنامه کند می‌شود.
 */

/** جعبه‌ابزاری که در اختیار کد کاربر است.
    یک‌بار ساخته می‌شود؛ قبلاً هر فریم یک شیء تازه با ۳۰ کلید ساخته
    می‌شد که روی گوشی فشار بی‌دلیل به حافظه می‌آورد. */
export const TOOLBOX = Object.freeze({
    // رسم
    textFa, textMono, outlineTextFa, wordDraw, line, rect, ring,
    fitFa, rowLayout, textPoints, particles, font, FONTS,
    // ریاضی
    clamp, lerp, ease, hash, hash2, noise1, remap, ramp, env,
    outQuint, outExpo,
    // رنگ
    rgba, mixHex, C,
    // مقیاس
    S, SF,
});

export const DEFAULT_CODE = `// ctx: بوم  ·  e: حالت این لحظه
// e.t زمان، e.kick ضربه (۰..۱)، e.words کلمات چیده‌شده،
// e.line خط فعال، e.acc رنگ تأکید، e.W و e.H ابعاد قاب
// e.fx جعبه‌ابزار: textFa، wordDraw، line، rect، ring، clamp، ease …

const { textFa, wordDraw, ring, clamp, ease } = e.fx;

// حلقه‌هایی که با ضرب بزرگ می‌شوند
for (let i = 0; i < 4; i++) {
  const r = (140 + i * 120 + e.kick * 60) * e.fx.S();
  ring(ctx, e.W / 2, e.H / 2, r, e.acc, 2, 0.22 - i * 0.045);
}

// کلمات خط فعال، با چرخش ملایم
for (const w of e.words) {
  const sung = e.t >= w.t;
  const heat = sung ? Math.exp(-(e.t - w.t) * 4) : 0;
  ctx.save();
  ctx.translate(w.cx, w.cy);
  ctx.rotate(Math.sin(e.t * 1.3 + w.cx * 0.004) * 0.05);
  wordDraw(ctx, w.word, 0, 0, w.size, sung, heat, 1, e.a, w.key && sung, e.acc);
  ctx.restore();
}
`;

/**
 * مجموعهٔ افکت‌های سفارشی
 *
 * هرکدام نام و کد خودش را دارد و به‌صورت سبک «cf:0»، «cf:1» … در
 * جدول بخش‌ها قابل انتخاب است. این‌طور می‌شود کدی که کسی به شما
 * داده را به‌عنوان یک افکت تازه اضافه کرد، بدون اینکه افکت قبلی
 * را از دست بدهید.
 */
export class CustomSet {
  constructor(list = null) {
    this.list = [];
    this.load(list);
  }

  load(list) {
    this.list = [];
    const src = (Array.isArray(list) && list.length)
      ? list : [{ name: 'افکت من', code: DEFAULT_CODE }];
    for (const it of src) this.add(it.name, it.code, false);
    return this;
  }

  add(name = 'افکت تازه', code = DEFAULT_CODE, trim = true) {
    const fx = new CustomFx();
    fx.name = name;
    fx.compile(code);
    // قبلاً بعد از ۱۲ افکت، اولی با shift() حذف می‌شد و همهٔ ارجاع‌های
    // «cf:N» در بخش‌ها یکی جابه‌جا می‌شدند — افکت اشتباه پخش می‌شد.
    // حالا سقف داریم ولی چیزی بی‌صدا حذف نمی‌شود.
    if (trim && this.list.length >= MAX_CUSTOM) return -1;
    this.list.push(fx);
    return this.list.length - 1;
  }

  /** حذف افکت i. ارجاع‌ها را با remapCustomRefs درست کنید. */
  remove(i) {
    if (this.list.length <= 1 || i < 0 || i >= this.list.length) return false;
    this.list.splice(i, 1);
    return true;
  }
  get(i) { return this.list[i] || null; }
  get count() { return this.list.length; }
  toJSON() { return this.list.map(f => ({ name: f.name, code: f.code })); }

  /** سبک‌هایی که این مجموعه فراهم می‌کند */
  styles() { return this.list.map((f, i) => ({ id: `cf:${i}`, label: f.name })); }
}

export const MAX_CUSTOM = 30;

/**
 * بعد از حذف افکت سفارشی شمارهٔ removed، ارجاع‌های «cf:N» را درست
 * می‌کند: ارجاع به خود افکت حذف‌شده به fallback برمی‌گردد و
 * ارجاع‌های بعد از آن یکی عقب می‌آیند.
 */
export function remapCustomRefs(removed, sections, lineFx, fallback = 'verse') {
  const fix = id => {
    if (!String(id).startsWith('cf:')) return id;
    const n = +id.slice(3);
    if (n === removed) return fallback;
    return n > removed ? `cf:${n - 1}` : id;
  };
  for (const s of sections || []) s[2] = fix(s[2]);
  for (const k of Object.keys(lineFx || {})) {
    if (lineFx[k]?.style) lineFx[k].style = fix(lineFx[k].style);
  }
}

export class CustomFx {
  constructor() {
    this.name = 'افکت من';
    this.code = DEFAULT_CODE;
    this.fn = null;
    this.error = null;
    this._lastRuntimeErr = null;
    this.compile(this.code);
  }

  /** @returns {string|null} پیام خطا، یا null اگر سالم بود */
  compile(code) {
    this.code = code;
    this._lastRuntimeErr = null;
    try {
      // eslint-disable-next-line no-new-func
      this.fn = new Function('ctx', 'e', `"use strict";\n${code}`);
      this.error = null;
    } catch (err) {
      this.fn = null;
      this.error = `خطای نگارشی: ${err.message}`;
    }
    return this.error;
  }

  /** خطای اجرایی آخرین فریم (جدا از خطای نگارشی) */
  get runtimeError() { return this._lastRuntimeErr; }

  draw(ctx, song, t, acc, kick, ov) {
    if (!this.fn) return;
    const cur = song.activeLine(t);
    let words = [], lineObj = null, a = 1;
    if (cur >= 0) {
      lineObj = song.lines[cur];
      const t0 = song.lineStart(cur), t1 = song.lineOut(cur);
      a = clamp((t - (t0 - 0.2)) / 0.25) * (1 - clamp((t - t1) / 0.3));
      words = applyOverrides(place(ctx, lineObj, modeFor(lineObj, 'pre')), ov);
    }
    const e = {
      t, kick, acc, a,
      W, H,
      words, line: lineObj, song,
      rms: song.rms(t),
      low: song.A?.lowAt ? song.A.lowAt(t) : 0,
      beat: song.beatI(t),
      pulse: song.beatEnv(t, 16),
      fx: TOOLBOX,
    };
    try {
      this.fn(ctx, e);
    } catch (err) {
      const m = String(err && err.message || err);
      if (m !== this._lastRuntimeErr) {
        this._lastRuntimeErr = m;
        console.warn('[افکت سفارشی]', err);
      }
    }
  }
}

/** متن منبع افکت‌های آماده — برای خواندن و یاد گرفتن */
export const SNIPPETS = {
  'ظهور کلمه‌به‌کلمه': `for (const w of e.words) {
  const sung = e.t >= w.t;                       // آیا خوانده شده؟
  const heat = sung ? Math.exp(-(e.t - w.t) * 4.5) : 0;  // درخشش محوشونده
  e.fx.wordDraw(ctx, w.word, w.cx, w.cy, w.size,
                sung, heat, 1, e.a, w.key && sung, e.acc);
}`,
  'پرش روی ضرب': `for (const w of e.words) {
  if (e.t < w.t) continue;
  const k = e.fx.clamp((e.t - w.t) / 0.22);
  const sc = 1 + 1.4 * (1 - e.fx.outQuint(k));   // از بزرگ به عادی
  ctx.save();
  ctx.translate(w.cx, w.cy);
  ctx.scale(sc, sc);
  e.fx.wordDraw(ctx, w.word, 0, 0, w.size, true, 0, 1, e.a, w.key, e.acc);
  ctx.restore();
}`,
  'موج سینوسی': `const amp = (26 + 34 * e.kick) * e.fx.S();
for (const w of e.words) {
  const ph = (w.cx / e.W) * 6.2832;
  const dy = Math.sin(e.t * 2.1 + ph) * amp;
  e.fx.wordDraw(ctx, w.word, w.cx, w.cy + dy, w.size,
                e.t >= w.t, 0, 1, e.a, false, e.acc);
}`,
  'ذرات واکنش‌گر': `e.fx.particles(ctx, e.song, e.t, e.acc, e.kick,
  { amp: (70 + 130 * e.rms) * e.fx.S(), alpha: 0.6 });`,
  'پاشیدن حروف': `const pts = e.fx.textPoints(e.line ? e.line.text : '', 120 * e.fx.SF(), 'IRANSansX Black', 6);
const burst = e.fx.clamp((e.t % 2) / 1.2);
ctx.fillStyle = e.acc;
for (let i = 0; i < pts.length; i++) {
  const ang = e.fx.hash(i * 1.7) * Math.PI * 2;
  const d = burst * 300 * e.fx.S() * (0.4 + e.fx.hash(i * 3.1) * 0.6);
  ctx.globalAlpha = 1 - burst;
  ctx.fillRect(e.W/2 + pts[i].x + Math.cos(ang)*d,
               e.H/2 + pts[i].y + Math.sin(ang)*d, 4, 4);
}`,
};

