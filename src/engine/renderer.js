import { W, H, C, SECT } from './song.js';
import { clamp, rgba, hash2 } from './core.js';
import { rect } from './draw.js';
import { particles, furniture, bgText, beatGrid } from './field.js';
import { drawLyrics } from './lyricbody.js';
import { STYLE_FN, sMirror } from './styles.js';
import { applyOverrides, hitWord } from './overrides.js';
import { place, modeFor } from './layout.js';

const TEXTUAL = new Set(['verse', 'chorus', 'pre', 'cold']);

/** ضریب شدت دانه و میزان بالا بردن میانگین — هر دو اندازه‌گیری‌شده.
    دانه فقط زیبایی نیست: در گرادیان‌های تیره، باندینگ و بلوک‌های
    فشرده‌سازی را می‌پوشاند. ضعیف بودنش در خروجی به‌صورت پله و خط
    دیده می‌شود. */
const GRAIN_GAIN = 3.2;
const GRAIN_LIFT = 162;

/** کاشی بزرگ‌تر = تکرار کمتر محسوس. پایتون میدان تصادفی تمام‌قاب داشت. */
const GRAIN_TILE = 512;

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
    this.tone = true;        // منحنی تُن نهایی
    this.chroma = 1.0;       // انحراف رنگی، برحسب پیکسل در ۱۹۲۰
    this.soloStyle = null;      // برای تصویر کوچک بخش‌ها
    this.overrides = null;      // لایهٔ جابه‌جایی دستی
    this.editMode = false;      // روکش ویرایش (هرگز در خروجی)
    this.selected = null;       // شناسهٔ کلمهٔ انتخاب‌شده
    this.sections = null;       // جدول بخش سفارشی (برای آهنگ وارد‌شده)
    this._bloomCanvas = null;
    this._grainTile = null;
  }

  setSong(s) { this.song = s; return this; }

  /** بخش فعال در لحظهٔ t */
  sectionAt(t) {
    const tbl = this.sections || SECT;
    for (const s of tbl) if (t >= s[0] && t < s[1]) return s;
    return tbl[tbl.length - 1];
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
      drawLyrics(ctx, song, t, style, acc, invert, this.overrides);
    } else {
      beatGrid(ctx, song, t, kick, 8);
      if (this.showFurniture) furniture(ctx, song, t, acc, false);
      if (style === 'mirror') sMirror(ctx, song, t, acc, kick, this.overrides);
      else STYLE_FN[style]?.(ctx, song, t, acc, kick);
    }
    if (this.editMode) this._editOverlay(ctx, t, style);
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
   * گرید نهایی — ترجمهٔ وفادار grade()
   *
   * ترتیب دقیقاً مثل پایتون است و ترتیبش مهم است:
   *   ۱) بلوم با آستانهٔ ۰٫۶۰ (فقط روشنایی‌ها می‌درخشند، نه کل تصویر)
   *   ۲) منحنی تُن (نواحی تاریک را تا ۳ برابر تیره‌تر می‌کند)
   *   ۳) ویگنت ضربی
   *   ۴) دانهٔ افزایشی
   *
   * در پایتون همهٔ این‌ها با numpy روی پیکسل‌ها بود و گران. اینجا
   * فیلترهای SVG روی GPU اجرا می‌شوند.
   */
  _grade(t) {
    const cv = this.stage.canvas;
    const ctx = this.stage.ctx;
    const w = cv.width, h = cv.height;
    if (w < 4 || h < 4) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    /* ۱) بلوم با آستانه */
    if (this.bloom > 0.01) {
      const bw = Math.max(4, w >> 2), bh = Math.max(4, h >> 2);
      // دو بوم جدا لازم است: کشیدن یک بوم روی خودش با فیلتر، رفتار
      // تعریف‌نشده دارد و هالهٔ غول‌پیکر تولید می‌کرد.
      const ba = this._scratch('_bloomA', bw, bh);
      const bb = this._scratch('_bloomB', bw, bh);
      const ax = ba.getContext('2d');
      ax.setTransform(1, 0, 0, 1, 0, 0);
      ax.globalCompositeOperation = 'copy';
      ax.filter = 'url(#bloomThresh)';
      ax.drawImage(cv, 0, 0, bw, bh);
      ax.filter = 'none';
      ax.globalCompositeOperation = 'source-over';

      const bxx = bb.getContext('2d');
      bxx.setTransform(1, 0, 0, 1, 0, 0);
      bxx.globalCompositeOperation = 'copy';
      // sigma معادل بلوم پایتون: sqrt((54²+13²)/12) ≈ ۱۶ پیکسل در مقیاس کامل
      bxx.filter = `blur(${Math.max(0.8, bw * 0.0085)}px)`;
      bxx.drawImage(ba, 0, 0);
      bxx.filter = 'none';
      bxx.globalCompositeOperation = 'source-over';

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = this.bloom;
      ctx.drawImage(bb, 0, 0, w, h);
      ctx.restore();
    }

    /* ۲) انحراف رنگی + منحنی تُن — در یک پاس */
    if (this.tone) {
      // انحراف باید با رزولوشن مقیاس بخورد: ۱ پیکسل در ۱۹۲۰
      if (this.chroma > 0) {
        const dx = Math.max(0.4, (w / W) * this.chroma);
        if (dx !== this._lastDx) {
          this._chR ??= document.getElementById('chromaR');
          this._chB ??= document.getElementById('chromaB');
          this._chR?.setAttribute('dx', String(dx));
          this._chB?.setAttribute('dx', String(-dx));
          this._lastDx = dx;
        }
      }
      const tc = this._scratch('_toneCanvas', w, h);
      const tx = tc.getContext('2d');
      tx.setTransform(1, 0, 0, 1, 0, 0);
      tx.globalCompositeOperation = 'copy';
      tx.filter = 'none';
      tx.drawImage(cv, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'copy';
      ctx.filter = 'url(#tone)';
      ctx.drawImage(tc, 0, 0);
      ctx.filter = 'none';
      ctx.restore();
    }

    /* ۳) ویگنت — در پایتون ضربی بود، پس اینجا هم multiply */
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.30,
                                        w / 2, h / 2, Math.hypot(w, h) * 0.56);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.6, 'rgba(0,0,0,0.10)');
    vg.addColorStop(1, 'rgba(0,0,0,0.44)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    /* ۴) دانه
       دو نکته که اول اشتباه کرده بودم:

       الف) حالت overlay روی پیکسل‌های تیره تقریباً بی‌اثر است
            (۲×base×blend)، و این ویدیو تقریباً تماماً تیره است.
            پایتون نویز افزایشی اضافه می‌کرد، پس اینجا هم lighter.
            چون زمینه سیاه است، نیمهٔ منفی نویز در پایتون هم به صفر
            بریده می‌شد — یعنی عملاً همان نویز افزایشی است.

       ب) اندازهٔ دانه باید در فضای طراحی ثابت باشد نه پیکسل دستگاه،
          وگرنه روی گوشی درشت‌تر از خروجی ۱۰۸۰p دیده می‌شود. */
    if (this.grain > 0.001) {
      if (!this._grainTile) this._grainTile = makeGrain(GRAIN_TILE);
      const f = Math.floor(t * 60);
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.grain * GRAIN_GAIN);
      ctx.globalCompositeOperation = 'lighter';
      /* کاشی را عمداً مقیاس نمی‌دهیم.
         قبلاً با ضریب w/W مقیاس می‌خورد (مثلاً ۱٫۰۲۳) و چون این عدد
         کسری است، مرز هر کاشی درون‌یابی می‌شد و یک خط عمودی نازک
         هر ۲۵۶ پیکسل می‌ساخت — همان «خط بین دو حرف» که روی شبح
         دیده می‌شد. حالا یک‌به‌یک روی پیکسل بوم کشیده می‌شود و
         جابه‌جایی هم عدد صحیح است، پس هیچ درون‌یابی‌ای رخ نمی‌دهد.
         اندازهٔ ظاهری دانه حداکثر ۲٪ فرق می‌کند که دیده نمی‌شود،
         و در خروجی ۱۹۲۰ دقیقاً یک‌به‌یک است. */
      ctx.imageSmoothingEnabled = false;
      ctx.translate(-((hash2(f, 1) * GRAIN_TILE) | 0), -((hash2(f, 2) * GRAIN_TILE) | 0));
      ctx.fillStyle = ctx.createPattern(this._grainTile, 'repeat');
      ctx.fillRect(0, 0, w + GRAIN_TILE, h + GRAIN_TILE);
      ctx.restore();

      /* جبران میانگین دانه.
         نویز پایتون متقارن بود (میانگین صفر)، ولی نویز ما فقط مثبت
         است چون حالت lighter نمی‌تواند کم کند. نتیجه این بود که کل
         تصویر حدود ۱٫۷ واحد بالا می‌رفت و سیاهی‌ها خاکستری می‌شدند —
         همان چیزی که به‌نظر می‌رسید «متن پس‌زمینه روشن‌تر شده».
         با حالت difference روی یک رنگ ثابتِ کوچک، دقیقاً همان مقدار
         کم می‌شود: |dst - c| برای dst > c یعنی تفریق. */
      const lift = this.grain * GRAIN_LIFT;
      if (lift > 0.02) {
        // c باید کوچک بماند: difference فقط برای پیکسل‌های روشن‌تر از c
        // تفریق واقعی است، و زمینهٔ ما حدود ۸ است.
        const c = Math.max(3, Math.ceil(lift));
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.globalAlpha = Math.min(1, lift / c);
        ctx.fillStyle = `rgb(${c},${c},${c})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
  }

  /**
   * کلمات قابل ویرایش در لحظهٔ t.
   * همان منطق رندر است، فقط بدون کشیدن — تا کادرها دقیقاً سر جای
   * واقعی کلمات بیفتند و درگ با چیزی که می‌بینید بخواند.
   */
  wordsAt(t) {
    const song = this.song;
    if (!song) return [];
    const [, , style] = this.soloStyle ?? this.sectionAt(t);
    const ctx = this.stage.ctx;
    const out = [];
    if (TEXTUAL.has(style)) {
      const cur = song.activeLine(t);
      if (cur < 0) return [];
      for (const li of [cur - 1, cur]) {
        if (li < 0) continue;
        if (t < song.lineStart(li) - 0.2 || t > song.lineOut(li) + 0.2) continue;
        const line = song.lines[li];
        out.push(...applyOverrides(place(ctx, line, modeFor(line, style)), this.overrides));
      }
    } else if (style === 'mirror') {
      const cur = song.activeLine(t);
      if (cur < 0) return [];
      out.push(...applyOverrides(place(ctx, song.lines[cur], 'giant'), this.overrides));
    }
    return out;
  }

  /** کدام کلمه زیر نقطهٔ (px,py) در فضای طراحی است */
  pickWord(t, px, py) { return hitWord(this.wordsAt(t), px, py); }

  /** کادر دور کلمات — فقط در حالت ویرایش، هرگز در خروجی */
  _editOverlay(ctx, t) {
    ctx.save();
    ctx.setLineDash([7, 6]);
    for (const it of this.wordsAt(t)) {
      const hw = (it.w || it.size) / 2 + 10;
      const hh = it.size * 0.62 + 8;
      const on = this.selected === it.id;
      ctx.strokeStyle = on ? '#E4142A'
        : it.moved ? 'rgba(228,20,42,0.55)' : 'rgba(154,160,172,0.45)';
      ctx.lineWidth = on ? 3 : 2;
      ctx.strokeRect(it.cx - hw, it.cy - hh, hw * 2, hh * 2);
    }
    ctx.restore();
  }

  _scratch(key, w, h) {
    let c = this[key];
    if (!c) { c = this[key] = document.createElement('canvas'); }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
}

/**
 * کاشی دانه: نویز گاوسی، فقط نیمهٔ مثبت.
 * (نیمهٔ منفی روی زمینهٔ سیاه به صفر بریده می‌شود، پس نگه داشتنش
 *  معنایی ندارد.)
 */
function makeGrain(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // Box-Muller از دو hash تکرارپذیر
    const u1 = Math.max(1e-6, hash2(i, 11));
    const u2 = hash2(i, 29);
    const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const v = Math.min(255, Math.max(0, gauss) * 160) | 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
