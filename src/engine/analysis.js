import { clamp, lerp } from './core.js';

/**
 * تحلیل صدا — پل بین آهنگ و تصویر.
 *
 * از فایل analysis.json می‌خوانیم که از قبل با librosa ساخته شده:
 *   beats    — زمان هر ضرب (۴۸۷ عدد)
 *   rms      — بلندی صدا در طول زمان
 *   low      — انرژی فرکانس پایین (کیک/بیس)
 *   voc      — حضور وکال
 *   t_step   — فاصلهٔ زمانی بین نمونه‌های منحنی‌ها
 */
export class Analysis {
  constructor(data) {
    Object.assign(this, data);
    this._norm('rms'); this._norm('low'); this._norm('voc'); this._norm('centroid');
  }

  static async load(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('analysis.json لود نشد');
    return new Analysis(await r.json());
  }

  /** هر منحنی را به بازهٔ ۰..۱ می‌برد تا افکت‌ها مستقل از میکس آهنگ کار کنند */
  _norm(key) {
    const a = this[key];
    if (!Array.isArray(a) || !a.length) return;
    let lo = Infinity, hi = -Infinity;
    for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const d = hi - lo || 1;
    this[key] = a.map(v => (v - lo) / d);
  }

  /** مقدار یک منحنی در لحظهٔ t، با درون‌یابی خطی بین نمونه‌ها */
  curve(key, t) {
    const a = this[key];
    if (!a?.length) return 0;
    const x = t / this.t_step;
    const i = Math.floor(x);
    if (i < 0) return a[0];
    if (i >= a.length - 1) return a[a.length - 1];
    return lerp(a[i], a[i + 1], x - i);
  }

  rmsAt(t) { return this.curve('rms', t); }
  lowAt(t) { return this.curve('low', t); }
  vocAt(t) { return this.curve('voc', t); }

  /** ایندکس آخرین ضربی که قبل از t اتفاق افتاده */
  beatIndex(t) {
    const b = this.beats;
    let lo = 0, hi = b.length - 1, res = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (b[m] <= t) { res = m; lo = m + 1; } else hi = m - 1;
    }
    return res;
  }

  /** زمان گذشته از آخرین ضرب (ثانیه) */
  sinceBeat(t) {
    const i = this.beatIndex(t);
    return i < 0 ? 999 : t - this.beats[i];
  }

  /**
   * «تپش» ضرب: درست روی ضرب ۱ است و در مدت decay به ۰ می‌رسد.
   * این پرکاربردترین تابع کل موتور است — هر چیزی که باید با ریتم
   * بپرد، اندازه‌اش را در این ضرب می‌کند.
   */
  pulse(t, decay = 0.28, curve = 2) {
    const d = this.sinceBeat(t);
    if (d < 0 || d > decay) return 0;
    return Math.pow(1 - d / decay, curve);
  }

  /** شمارهٔ ضرب در میزان ۴/۴ (۰..۳) */
  beatPhase(t) {
    const i = this.beatIndex(t);
    return i < 0 ? 0 : i % 4;
  }

  get bpm() { return this.tempo; }
  get beatDur() { return 60 / this.tempo; }
}
