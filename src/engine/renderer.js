import { W, H, C, SECT } from './song.js';
import { clamp, rgba, hash2 } from './core.js';
import { rect } from './draw.js';
import { particles, furniture, bgText, beatGrid } from './field.js';
import { drawLyrics } from './lyricbody.js';
import { STYLE_FN } from './styles.js';

const TEXTUAL = new Set(['verse', 'chorus', 'pre', 'cold']);

/**
 * رندرر — ترجمهٔ وفادار draw() از full.py
 *
 * قانون طلایی سر جایش است: renderFrame(t) تابع خالص زمان است.
 * هیچ حالتی بین فریم‌ها نگه داشته نمی‌شود.
 *
 * ترتیب دقیق کشیدن:
 *   ۱) زمینه (سفید اگر فریم وارونه باشد) + هالهٔ شعاعی رنگ تأکید
 *   ۲) ترنسفرم دوربین: لرزش و زوم ریز روی ضرب
 *   ۳) بسته به سبک: پس‌زمینهٔ متنی + ستون‌ها + اثاثیه + شعر
 *      یا: ستون‌ها + اثاثیه + سبک بخش بی‌کلام
 *   ۴) فلاش سفید روی ضربه‌های قوی
 *   ۵) گرید نهایی: بلوم، ویگنت، دانه
 */
export class Renderer {
  constructor(stage) {
    this.stage = stage;
    this.song = null;
    this.showFurniture = true;
    this.grain = 0.024;
    this.bloom = 0.55;
    this.soloStyle = null;      // برای تصویر کوچک بخش‌ها
    this._bloomCanvas = null;
    this._grainTile = null;
  }

  setSong(s) { this.song = s; return this; }

  /** بخش فعال در لحظهٔ t */
  sectionAt(t) {
    for (const s of SECT) if (t >= s[0] && t < s[1]) return s;
    return SECT[SECT.length - 1];
  }

  renderFrame(t) {
    const ctx = this.stage.begin();
    const song = this.song;
    if (!song) { this.stage.end(); return null; }

    const sec = this.soloStyle ?? this.sectionAt(t);
    const [, , style, acc] = sec;
    const kick = song.kick(t);

    // وارونگی تک‌فریمی: فقط در کرس، هر ۱۶ ضرب یک‌بار
    let invert = false;
    if (style === 'chorus') {
      const bi = song.beatI(t);
      invert = bi % 16 < 1 && t - song.beats[Math.min(bi, song.beats.length - 1)] < 0.16;
    }

    /* ۱) زمینه */
    rect(ctx, 0, 0, W, H, invert ? C.BONE : C.BG, 1);
    if (!invert) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 1250);
      g.addColorStop(0, rgba(acc, 0.05 + 0.20 * kick));
      g.addColorStop(1, rgba(acc, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    /* ۲) دوربین */
    const sx = Math.sin(t * 127) * 10 * kick;
    const sy = Math.cos(t * 97) * 7 * kick;
    const z = 1.0 + 0.016 * kick;
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(z, z);
    ctx.translate(-W / 2, -H / 2);

    /* ۳) محتوا */
    if (TEXTUAL.has(style)) {
      if (!invert) {
        bgText(ctx, song, t, acc, kick,
               style !== 'cold' ? 9 : 6,
               style !== 'cold' ? 0.05 : 0.035);
        beatGrid(ctx, song, t, kick, 10);
      }
      if (this.showFurniture) furniture(ctx, song, t, acc, invert);
      drawLyrics(ctx, song, t, style, acc, invert);
    } else {
      beatGrid(ctx, song, t, kick, 8);
      if (this.showFurniture) furniture(ctx, song, t, acc, false);
      STYLE_FN[style]?.(ctx, song, t, acc, kick);
    }
    ctx.restore();

    /* ۴) فلاش */
    if (kick > 0.6 && !invert) {
      rect(ctx, 0, 0, W, H, C.BONE, 0.05 * (kick - 0.6) / 0.4);
    }

    this.stage.end();

    /* ۵) گرید */
    this._grade(t);
    return sec;
  }

  /**
   * گرید نهایی
   *
   * در پایتون با numpy روی پیکسل‌ها انجام می‌شد و گران بود. اینجا
   * بلوم را با filter بومی مرورگر می‌گیریم که روی GPU اجرا می‌شود،
   * پس عملاً رایگان است.
   */
  _grade(t) {
    const cv = this.stage.canvas;
    const ctx = this.stage.ctx;
    const w = cv.width, h = cv.height;
    if (w < 4 || h < 4) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // بلوم: کپی تار‌شده را با حالت screen روی تصویر می‌گذاریم
    if (this.bloom > 0.01) {
      if (!this._bloomCanvas) this._bloomCanvas = document.createElement('canvas');
      const bc = this._bloomCanvas;
      const bw = Math.max(2, w >> 2), bh = Math.max(2, h >> 2);
      if (bc.width !== bw || bc.height !== bh) { bc.width = bw; bc.height = bh; }
      const bx = bc.getContext('2d');
      bx.setTransform(1, 0, 0, 1, 0, 0);
      bx.clearRect(0, 0, bw, bh);
      bx.filter = `blur(${Math.max(1, bw * 0.012)}px)`;
      bx.drawImage(cv, 0, 0, bw, bh);
      bx.filter = 'none';

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = this.bloom * 0.42;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bc, 0, 0, w, h);
      ctx.restore();
    }

    // ویگنت
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34,
                                        w / 2, h / 2, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // دانهٔ فیلم
    if (this.grain > 0.001) {
      if (!this._grainTile) this._grainTile = makeGrain(128);
      const f = Math.floor(t * 60);
      ctx.save();
      ctx.globalAlpha = this.grain * 4.0;
      ctx.globalCompositeOperation = 'overlay';
      ctx.translate(-((hash2(f, 1) * 128) | 0), -((hash2(f, 2) * 128) | 0));
      ctx.fillStyle = ctx.createPattern(this._grainTile, 'repeat');
      ctx.fillRect(0, 0, w + 128, h + 128);
      ctx.restore();
    }
  }
}

function makeGrain(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = (hash2(i % size, (i / size) | 0) * 255) | 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
