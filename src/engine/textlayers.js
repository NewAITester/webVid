import { W, H, C, S, SF, outQuint } from './song.js';
import { clamp, ease, rgba } from './core.js';
import { textFa, outlineTextFa } from './draw.js';
import { FONTS, font, fitSize } from './text.js';

/**
 * لایه‌های متن آزاد
 *
 * متنی که خودتان می‌نویسید و هرجای قاب می‌گذارید — مستقل از شعر.
 * هر لایه یک کلیپ روی تایم‌لاین است با زمان، جا، اندازه، رنگ و
 * انیمیشن ورود و خروج خودش.
 *
 * مختصات x و y نسبی‌اند (۰ تا ۱)، نه پیکسلی. پس اگر نسبت تصویر را
 * از افقی به عمودی عوض کنید، متن سر جای نسبی خودش می‌ماند.
 */

export const TEXT_ANIM = {
  none:  { label: 'بدون' },
  fade:  { label: 'محو' },
  up:    { label: 'از پایین' },
  down:  { label: 'از بالا' },
  side:  { label: 'از کنار' },
  pop:   { label: 'جهش' },
  type:  { label: 'تایپ' },
  blur:  { label: 'تمرکز' },
};

export function newText(t0, dur = 4) {
  return {
    id: 'tx' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    text: 'متن تازه',
    t0: +t0.toFixed(2), t1: +(t0 + dur).toFixed(2),
    x: 0.5, y: 0.5,            // نسبی به قاب
    size: 90,                  // در فضای مرجع ۱۰۸۰
    color: '#F6F3EC',
    outline: false,
    opacity: 1,
    rot: 0,
    anim: 'up', animOut: 'fade',
    dur: 0.45,                 // مدت ورود و خروج
    bold: true,
  };
}

/** اندازه و جای واقعی یک لایه در فضای طراحی */
export function layerBox(ctx, L) {
  const size = L.size * SF();
  ctx.font = font(size, L.bold ? FONTS.black : FONTS.bold);
  ctx.direction = 'rtl';
  const w = ctx.measureText(L.text || ' ').width;
  return { cx: L.x * W, cy: L.y * H, w, h: size * 1.24, size };
}

function envelope(L, t) {
  if (t < L.t0 - 0.01 || t > L.t1 + 0.01) return null;
  const d = Math.max(0.05, L.dur);
  const kin = clamp((t - L.t0) / d);
  const kout = clamp((L.t1 - t) / d);
  return { kin, kout, a: Math.min(1, kin) * Math.min(1, kout) };
}

/** یک لایه را می‌کشد. اگر خارج از بازهٔ زمانی باشد، هیچ. */
export function drawLayer(ctx, L, t, acc) {
  const e = envelope(L, t);
  if (!e) return;
  const b = layerBox(ctx, L);
  let { cx, cy } = b;
  const size = b.size;
  let alpha = L.opacity * e.a;
  let scale = 1;
  let txt = L.text || '';

  const k = ease.outCubic(e.kin);
  switch (L.anim) {
    case 'up':   cy += (1 - k) * H * 0.07; break;
    case 'down': cy -= (1 - k) * H * 0.07; break;
    case 'side': cx += (1 - k) * W * 0.18; break;
    case 'pop':  scale = 0.55 + 0.45 * ease.outBack(e.kin); break;
    case 'type': {
      const n = Math.max(1, Math.round(txt.length * e.kin));
      txt = txt.slice(0, n);
      break;
    }
    case 'blur': scale = 1 + (1 - k) * 0.12; alpha *= k; break;
    case 'none': alpha = L.opacity * (t >= L.t0 && t <= L.t1 ? 1 : 0); break;
  }
  const ko = ease.outCubic(e.kout);
  if (L.animOut === 'up') cy -= (1 - ko) * H * 0.05;
  if (L.animOut === 'pop') scale *= 0.8 + 0.2 * ko;

  if (alpha <= 0.004) return;
  ctx.save();
  ctx.translate(cx, cy);
  if (L.rot) ctx.rotate((L.rot * Math.PI) / 180);
  if (scale !== 1) ctx.scale(scale, scale);
  const fam = L.bold ? FONTS.black : FONTS.bold;
  if (L.anim === 'blur' && k < 0.98) {
    const bl = (1 - k) * 14 * S();
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * Math.PI * 2;
      textFa(ctx, txt, Math.cos(an) * bl, Math.sin(an) * bl, size,
             L.color, alpha * 0.15, fam);
    }
  }
  if (L.outline) outlineTextFa(ctx, txt, 0, 0, size, L.color, alpha, fam, 4 * S());
  else textFa(ctx, txt, 0, 0, size, L.color, alpha, fam);
  ctx.restore();
}

export function drawLayers(ctx, list, t, acc) {
  if (!list?.length) return;
  for (const L of list) { try { drawLayer(ctx, L, t, acc); } catch { /* نادیده */ } }
}

/** کدام لایه زیر این نقطه است (از رو به زیر) */
export function hitLayer(ctx, list, t, px, py, pad = 16) {
  if (!list?.length) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    const L = list[i];
    if (t < L.t0 || t > L.t1) continue;
    const b = layerBox(ctx, L);
    if (Math.abs(px - b.cx) <= b.w / 2 + pad && Math.abs(py - b.cy) <= b.h / 2 + pad) return L;
  }
  return null;
}

/** کادر راهنما دور لایهٔ انتخاب‌شده */
export function outlineLayer(ctx, L, t, color = '#E4142A') {
  if (t < L.t0 - 0.2 || t > L.t1 + 0.2) return;
  const b = layerBox(ctx, L);
  ctx.save();
  ctx.translate(b.cx, b.cy);
  if (L.rot) ctx.rotate((L.rot * Math.PI) / 180);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 * S();
  ctx.setLineDash([9 * S(), 7 * S()]);
  const hw = b.w / 2 + 12 * S(), hh = b.h / 2 + 6 * S();
  ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
  ctx.setLineDash([]);
  // دستگیرهٔ گوشه‌ها
  ctx.fillStyle = color;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.arc(sx * hw, sy * hh, 7 * S(), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
