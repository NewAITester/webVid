/** ارزیابی خالص لایه در زمان t: ترنسفورم + شفافیت + افکت‌های انیمیشنی. */
import { ease } from './easing.js';
import { effectById } from './schema.js';

const PROPS = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity'];

/** درون‌یابی یک ویژگی با کی‌فریم‌ها. */
export function valueAt(keyframes, t, fallback) {
  if (!keyframes || keyframes.length === 0) return fallback;
  const kfs = [...keyframes].sort((a, b) => a.t - b.t);
  if (t <= kfs[0].t) return kfs[0].v;
  if (t >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i], b = kfs[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = ease(b.ease || a.ease || 'linear', (t - a.t) / (b.t - a.t || 1));
      return a.v + (b.v - a.v) * u;
    }
  }
  return fallback;
}

/** پارامترهای یک افکت در زمان محلی t (داخل لایه): کی‌فریم پارامتر را حل می‌کند. */
export function effectParamsAt(fx, tLocal) {
  const base = { ...(fx.params || {}) };
  const kfs = fx.keyframes || {};
  for (const [key, list] of Object.entries(kfs)) {
    if (Array.isArray(list) && list.length && typeof base[key] === 'number') {
      base[key] = valueAt(list, tLocal, base[key]);
    }
  }
  return base;
}

/** آیا افکت فعال است؟ (پیش‌فرض فعال؛ enabled:false یعنی خاموش) */
export const isFxOn = fx => fx.enabled !== false;

/** بزرگنمایی دوربین در زمان t — کی‌فریم‌های zoom (نسبت به شروع لایه) وگرنه مقدار ثابت. */
export function cameraZoomAt(layer, t) {
  const kfs = layer.keyframes?.zoom;
  return kfs ? valueAt(kfs, t - layer.start, layer.camera?.zoom ?? 1) : (layer.camera?.zoom ?? 1);
}

/** ترنسفورم نهایی لایه در زمان t (با کی‌فریم‌ها و افکت‌های anim). */
export function layerTransform(layer, t) {
  const tr = { ...layer.transform };
  for (const prop of PROPS) {
    const kfs = layer.keyframes?.[prop];
    if (kfs) tr[prop] = valueAt(kfs, t, tr[prop]);
  }
  // افکت‌های انیمیشنی روی ترنسفورم
  for (const fx of (layer.effects || []).filter(isFxOn)) {
    const p = effectParamsAt(fx, t - layer.start);
    if (fx.id === 'shake') {
      const s = (p.speed || 8) * t;
      tr.x += Math.sin(s * 2.1) * (p.amount || 6);
      tr.y += Math.cos(s * 1.7) * (p.amount || 6);
    } else if (fx.id === 'pulse') {
      const k = 1 + Math.sin(t * (p.speed || 2) * Math.PI * 2) * (p.amount || 0.1);
      tr.scaleX *= k; tr.scaleY *= k;
    } else if (fx.id === 'spin') {
      tr.rotation += (p.speed || 90) * t;
    } else if (fx.id === 'float') {
      tr.y += Math.sin(t * (p.speed || 1) * Math.PI * 2) * (p.amount || 10);
    } else if (fx.id === 'bounce') {
      const u = (t * (p.speed || 2)) % 1;
      tr.y -= Math.abs(Math.sin(u * Math.PI)) * (p.amount || 20);
    } else if (fx.id === 'kenburns') {
      const prog = (t - layer.start) / Math.max(0.01, (layer.end - layer.start));
      const k = 1 + (p.amount || 0.15) * Math.min(1, Math.max(0, prog));
      tr.scaleX *= k; tr.scaleY *= k;
    } else if (fx.id === 'drift') {
      const a = ((p.rot || 0) * Math.PI) / 180;
      tr.x += Math.cos(a) * (p.speed || 10) * t;
      tr.y += Math.sin(a) * (p.speed || 10) * t;
    } else if (fx.id === 'wobble') {
      const s = t * (p.freq || 1) * Math.PI * 2;
      tr.x += Math.sin(s) * (p.amt || 8);
      tr.y += Math.cos(s * 0.7) * (p.amt || 8) * 0.5;
    } else if (fx.id === 'floaty') {
      tr.y += Math.sin(t * (p.freq || 1) * Math.PI * 2) * (p.amt || 10);
    } else if (fx.id === 'wiggle') {
      const s = t * (p.freq || 1) * Math.PI * 2;
      tr.rotation += Math.sin(s) * (p.rot || 5);
      tr.x += Math.sin(s * 1.3) * (p.amt || 6);
    } else if (fx.id === 'swing') {
      tr.rotation += Math.sin(t * (p.freq || 1) * Math.PI * 2) * (p.ang || 10);
    } else if (fx.id === 'orbit') {
      const s = t * (p.freq || 1) * Math.PI * 2;
      tr.x += Math.cos(s) * (p.r || 20);
      tr.y += Math.sin(s) * (p.r || 20);
    } else if (fx.id === 'zoomPulse') {
      const k = 1 + Math.sin(t * (p.freq || 1) * Math.PI * 2) * (p.amt || 0.1);
      tr.scaleX *= k; tr.scaleY *= k;
    } else if (fx.id === 'mirror') {
      if ((p.axis ?? 0) >= 0.5) tr.scaleY *= -1; else tr.scaleX *= -1;
    }
  }
  return tr;
}

/** شفافیت نهایی (ترنسفورم + fade + blink + flash). */
export function layerOpacity(layer, t) {
  let o = layerTransform(layer, t).opacity;
  for (const fx of (layer.effects || []).filter(isFxOn)) {
    const p = effectParamsAt(fx, t - layer.start);
    if (fx.id === 'fade') o *= (p.amount ?? 1);
    if (fx.id === 'blink') o *= (Math.sin(t * (p.speed || 4) * Math.PI * 2) > 0 ? 1 : 0.15);
    if (fx.id === 'flash') o *= 0.6 + 0.4 * Math.sin(t * (p.speed || 2) * Math.PI * 2);
    if (fx.id === 'fadePulse') o *= 1 - (p.amt || 0.5) * (0.5 + 0.5 * Math.sin(t * (p.freq || 1) * Math.PI * 2));
    if (fx.id === 'strobe') o *= (Math.sin(t * (p.rate || 4) * Math.PI * 2) > 0 ? 1 : 1 - (p.depth || 0.8));
  }
  return Math.min(1, Math.max(0, o));
}

/** آیا لایه در زمان t فعال است؟ */
export function isActive(layer, t) {
  return t >= layer.start && t < layer.end;
}

/** لایه‌های فعال به ترتیب رسم (پایین آرایه = عقب). */
export function visibleLayers(project, t) {
  return project.layers.filter(l => isActive(l, t));
}

/** رشتهٔ ctx.filter از افکت‌های kind=filter (با پارامترهای متحرک در زمان t). */
export function filterString(layer, t = 0) {
  const parts = [];
  for (const fx of (layer.effects || []).filter(isFxOn)) {
    const p = effectParamsAt(fx, t - layer.start);
    if (fx.id === 'brightness') parts.push(`brightness(${1 + (p.amount || 0)})`);
    if (fx.id === 'contrast') parts.push(`contrast(${1 + (p.amount || 0)})`);
    if (fx.id === 'saturation') parts.push(`saturate(${1 + (p.amount || 0)})`);
    if (fx.id === 'hueShift') parts.push(`hue-rotate(${p.amount || 0}deg)`);
    if (fx.id === 'grayscale') parts.push(`grayscale(${p.amount ?? 0})`);
    if (fx.id === 'sepia') parts.push(`sepia(${p.amount ?? 0})`);
    if (fx.id === 'invert') parts.push(`invert(${p.amount ?? 0})`);
    if (fx.id === 'blur') parts.push(`blur(${p.amount || 0}px)`);
  }
  return parts.length ? parts.join(' ') : 'none';
}

/** پارامترهای افکت تکرارکنندهٔ فعال لایه (در زمان t) یا null. */
export function repeatOf(layer, t) {
  for (const fx of (layer.effects || []).filter(isFxOn)) {
    if (fx.id === 'repeat') return effectParamsAt(fx, t - layer.start);
  }
  return null;
}

/** افکت‌های kind=canvas لایه (فعال‌ها). */
export function canvasEffects(layer) {
  return (layer.effects || []).filter(isFxOn).filter(fx => effectById(fx.id)?.kind === 'canvas');
}
