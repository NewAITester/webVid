import { clamp } from './core.js';

/**
 * دادهٔ آهنگ و زمان‌بندی — ترجمهٔ وفادار از full.py
 *
 * اینجا همان توابعی است که در نسخهٔ پایتون تصمیم می‌گرفتند «الان
 * کدام خط فعال است» و «ضرب چقدر قوی است». دقیقاً همان فرمول‌ها،
 * چون کوچک‌ترین اختلاف در این اعداد کل حس ویدیو را عوض می‌کند.
 */

/* ابعاد فضای طراحی.
   عمداً let است نه const: ماژول‌های ES «اتصال زنده» دارند، پس وقتی
   اینجا عوضشان می‌کنیم، همهٔ فایل‌هایی که W و H را import کرده‌اند
   مقدار تازه را می‌بینند. این‌طور می‌شود بدون بازنویسی همهٔ افکت‌ها،
   ویدیوی عمودی و مربعی هم ساخت. */
export let W = 1920;
export let H = 1080;

/** ضریب مقیاس عرضی — برای حاشیه، ضخامت خط و فاصله‌ها */
export const S = () => W / 1920;

/** ضریب مقیاس اندازهٔ قلم — بر پایهٔ ضلع کوچک‌تر قاب.
    چرا جدا از S: در قاب عمودی عرض نصف می‌شود و اگر اندازهٔ قلم هم
    نصف شود، متن نسبت به ارتفاع قاب خیلی ریز می‌افتد. با ضلع کوچک‌تر،
    متن در هر نسبتی هم‌اندازه حس می‌شود. */
export const SF = () => Math.min(W, H) / 1080;

export const ASPECTS = [
  { id: '16:9', w: 1920, h: 1080, label: 'افقی ۱۶:۹ — یوتیوب' },
  { id: '9:16', w: 1080, h: 1920, label: 'عمودی ۹:۱۶ — استوری و ریلز' },
  { id: '1:1',  w: 1080, h: 1080, label: 'مربع ۱:۱ — پست' },
  { id: '4:5',  w: 1080, h: 1350, label: 'عمودی ۴:۵ — پست بلند' },
];

const _sizeHooks = [];
export function onStageSize(fn) { _sizeHooks.push(fn); }

export function setStageSize(w, h) {
  if (W === w && H === h) return;
  W = w; H = h;
  for (const fn of _sizeHooks) fn(w, h);
}
export const SONG = 226.81;
export const DUR = 228.6;

export const TITLE_FA = 'نقاب';
export const NAME_FA  = 'زروان اکو';
export const TG       = 'Telegram: @ZurvanEcho';

/* پالت اصلی ویدیو */
export const C = {
  BG:      '#08080B',
  BONE:    '#F6F3EC',
  GHOST:   '#3A3F4B',
  CRIMSON: '#E4142A',
  STEEL:   '#5A6472',
  GREY:    '#9AA0AC',
};

/* جدول ۱۳ بخش — عیناً از full.py */
export const SECT = [
  [  0.00,  10.08, 'intro',  C.GREY],
  [ 10.08,  19.34, 'cold',   C.GREY],
  [ 19.34,  30.02, 'inst_a', C.CRIMSON],
  [ 30.02,  59.00, 'verse',  C.CRIMSON],
  [ 59.00,  69.00, 'pre',    C.CRIMSON],
  [ 69.00,  88.60, 'chorus', C.CRIMSON],
  [ 88.60, 118.50, 'verse',  C.CRIMSON],
  [118.50, 129.00, 'pre',    C.CRIMSON],
  [129.00, 158.10, 'inst_b', C.CRIMSON],
  [158.10, 177.00, 'chorus', C.CRIMSON],
  [177.00, 189.48, 'inst_c', C.GREY],
  [189.48, 207.20, 'mirror', C.GREY],
  [207.20, DUR,    'end',    C.CRIMSON],
];

export const SECTION_NAMES = {
  intro: 'تیتراژ', cold: 'ورود سرد', inst_a: 'ورود باند', verse: 'بند',
  pre: 'پیش‌کرس', chorus: 'کرس', inst_b: 'شکست ۲۹ ثانیه', inst_c: 'فرود',
  mirror: 'آینه', end: 'کارت پایان',
};

export const outQuint = t => 1 - Math.pow(1 - t, 5);
export const outExpo  = t => (t >= 1 ? 1 : 1 - Math.pow(2, -11 * t));

/** همهٔ حالت زمانی آهنگ در یک شیء */
export class Song {
  constructor(lines, analysis, meta = {}) {
    this.lines = lines;              // از parseLRC
    this.A = analysis;
    // عنوان و نام هنرمند قابل تنظیم‌اند تا اپ به یک آهنگ گره نخورد
    this.title = meta.title || TITLE_FA;
    this.artist = meta.artist || NAME_FA;
    this.tg = meta.tg ?? TG;
    this.duration = meta.duration || DUR;
    this.beats = analysis.beats;
    // RMS در پایتون بر صدک ۹۹ تقسیم می‌شد، نه بر بیشینه
    const r = analysis.rmsRaw || analysis.rms;
    const sorted = [...r].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 1;
    this._rms = r.map(v => v / (p99 + 1e-9));
    this._step = analysis.t_step;
  }

  section(t) {
    for (const s of SECT) if (t >= s[0] && t < s[1]) return s;
    return SECT[SECT.length - 1];
  }

  rms(t) {
    const x = t / this._step, i = Math.floor(x);
    const a = this._rms;
    if (i < 0) return clamp(a[0] * 1.2);
    if (i >= a.length - 1) return clamp(a[a.length - 1] * 1.2);
    return clamp((a[i] + (a[i + 1] - a[i]) * (x - i)) * 1.2);
  }

  /** ایندکس آخرین ضرب قبل از t */
  beatI(t) {
    const b = this.beats;
    let lo = 0, hi = b.length, m;
    while (lo < hi) { m = (lo + hi) >> 1; if (b[m] <= t) lo = m + 1; else hi = m; }
    return Math.max(0, lo - 1);
  }
  _searchsorted(t) {
    const b = this.beats;
    let lo = 0, hi = b.length, m;
    while (lo < hi) { m = (lo + hi) >> 1; if (b[m] < t) lo = m + 1; else hi = m; }
    return lo;
  }

  /** پاکت ضرب: ۱ روی ضرب، با نرخ decay افت می‌کند */
  beatEnv(t, decay = 15.0) {
    const i = this._searchsorted(t);
    let e = 0;
    for (const j of [i - 1, i]) {
      if (j >= 0 && j < this.beats.length && this.beats[j] <= t && t < this.beats[j] + 0.4) {
        e = Math.max(e, Math.exp(-(t - this.beats[j]) * decay));
      }
    }
    return e;
  }

  /** «ضربه» — محرک اصلی همهٔ حرکت‌های تصویر */
  kick(t) { return this.beatEnv(t, 16) * (0.4 + 0.6 * this.rms(t)); }

  lineStart(i) { return this.lines[i].words[0].t; }
  lineEnd(i)   { return this.lines[i].words[this.lines[i].words.length - 1].t; }

  lineOut(i) {
    if (i + 1 < this.lines.length) {
      return Math.min(this.lineStart(i + 1) - 0.14, this.lineEnd(i) + 2.6);
    }
    return this.lineEnd(i) + 2.2;
  }

  /** خط فعال، با همان قانون پایتون: ۰٫۲۲ ثانیه زودتر، ۱٫۲ ثانیه دیرتر */
  activeLine(t) {
    let cur = -1;
    for (let i = 0; i < this.lines.length; i++) {
      if (t >= this.lineStart(i) - 0.22) cur = i; else break;
    }
    if (cur >= 0 && t > this.lineOut(cur) + 1.2) return -1;
    return cur;
  }

  /** مجموع ضربه‌های محوشوندهٔ چند ضرب اخیر — برای میدان ذرات */
  beatPush(t, decay = 4.2, span = 6) {
    const i = this._searchsorted(t);
    let s = 0;
    for (let j = Math.max(0, i - span); j < Math.min(i, this.beats.length); j++) {
      const dt = t - this.beats[j];
      if (dt >= 0 && dt < 2.2) s += Math.exp(-dt * decay) * (j % 4 === 0 ? 1.35 : 1.0);
    }
    return s;
  }
}
