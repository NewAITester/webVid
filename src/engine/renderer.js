import { byId, resolve } from '../effects/index.js';
import { sectionAt } from './project.js';
import { setupRTL, font, FONTS, faTime } from './text.js';
import { PALETTE, rgba } from './core.js';

/**
 * رندرر — قلب برنامه
 *
 * یک قانون طلایی دارد: renderFrame(t) باید **تابع خالص** باشد.
 * یعنی برای یک t مشخص، همیشه دقیقاً همان تصویر را بکشد، مستقل از
 * اینکه قبلش چه فریمی کشیده شده.
 *
 * به‌خاطر همین قانون است که می‌شود:
 *   • تایم‌لاین را آزادانه اسکراب کرد
 *   • از وسط کلیپ پیش‌نمایش گرفت
 *   • رندر را به چند تکهٔ موازی شکست
 *   • از هر بخش یک تصویر کوچک ساخت
 */
export class Renderer {
  constructor(stage) {
    this.stage = stage;
    this.project = null;
    this.lyrics = [];
    this.analysis = null;
    this.showFurniture = true;
    this.soloSection = null;   // اگر پر باشد، فقط همین بخش کشیده می‌شود
  }

  setProject(p) { this.project = p; return this; }
  setLyrics(l)  { this.lyrics = l; return this; }
  setAnalysis(a){ this.analysis = a; return this; }

  /** محیطی که به هر افکت پاس داده می‌شود */
  envFor(node, t) {
    return {
      t,
      local: node.t0 != null ? t - node.t0 : t,
      p: resolve(node.effect, node.params),
      section: node,
      project: this.project,
      lyrics: this.lyrics,
      analysis: this.analysis,
      overrides: this.project?.overrides || {},
    };
  }

  /** یک فریم کامل در لحظهٔ t */
  renderFrame(t) {
    const P = this.project;
    const ctx = this.stage.begin();
    if (!P) { this.stage.end(); return; }

    const posts = [];

    // ۱) لایه‌های همیشگی
    for (const L of P.layers) {
      const fx = byId[L.effect];
      if (!fx || L.hidden) continue;
      const e = this.envFor(L, t);
      ctx.save(); try { fx.draw?.(ctx, e); } catch (err) { this._err(err, L.effect); } ctx.restore();
      if (fx.post) posts.push([fx, e]);
    }

    // ۲) بخش فعال
    const sec = this.soloSection ?? sectionAt(P, t);
    if (sec && !sec.hidden) {
      const fx = byId[sec.effect];
      if (fx) {
        const e = this.envFor(sec, t);
        ctx.save(); try { fx.draw?.(ctx, e); } catch (err) { this._err(err, sec.effect); } ctx.restore();
      }
    }

    // ۳) اثاثیهٔ ثابت (نام کانال و تایم‌کد)
    if (this.showFurniture) this._furniture(ctx, t);

    // ۴) پس‌پردازش (دانه) — آخر از همه
    for (const [fx, e] of posts) {
      ctx.save(); try { fx.post(ctx, e); } catch (err) { this._err(err, fx.id); } ctx.restore();
    }

    this.stage.end();
    return sec;
  }

  _furniture(ctx, t) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.5;

    ctx.textAlign = 'right';
    ctx.font = font(30, FONTS.bold);
    ctx.fillStyle = PALETTE.grey;
    ctx.fillText('زروان اکو', 1840, 70);

    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = font(24, FONTS.bold);
    ctx.fillText('Telegram: @ZurvanEcho', 80, 1012);

    ctx.textAlign = 'right';
    ctx.globalAlpha = 0.34;
    ctx.fillText(faTime(t), 1840, 1012);
    ctx.restore();
  }

  _err(err, id) {
    if (this._lastErr === String(err)) return;
    this._lastErr = String(err);
    console.warn(`[افکت ${id}]`, err);
  }
}
