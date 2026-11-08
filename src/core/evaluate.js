/** ارزیابی خالص لایه در زمان t: ترنسفورم + شفافیت + افکت‌های انیمیشنی. */
import { ease } from './easing.js';

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

/** ترنسفورم نهایی لایه در زمان t (با کی‌فریم‌ها و افکت‌های anim). */
export function layerTransform(layer, t) {
  const tr = { ...layer.transform };
  for (const prop of PROPS) {
    const kfs = layer.keyframes?.[prop];
    if (kfs) tr[prop] = valueAt(kfs, t, tr[prop]);
  }
  // افکت‌های انیمیشنی روی ترنسفورم
  for (const fx of layer.effects || []) {
    const p = fx.params || {};
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
    }
  }
  return tr;
}

/** شفافیت نهایی (ترنسفورم + fade + blink). */
export function layerOpacity(layer, t) {
  let o = layerTransform(layer, t).opacity;
  for (const fx of layer.effects || []) {
    const p = fx.params || {};
    if (fx.id === 'fade') o *= (p.amount ?? 1);
    if (fx.id === 'blink') o *= (Math.sin(t * (p.speed || 4) * Math.PI * 2) > 0 ? 1 : 0.15);
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

/** رشتهٔ ctx.filter از افکت‌های kind=filter. */
export function filterString(layer) {
  const parts = [];
  for (const fx of layer.effects || []) {
    const p = fx.params || {};
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

/** افکت‌های kind=canvas لایه. */
export function canvasEffects(layer) {
  return (layer.effects || []).filter(fx => {
    const def = { temperature: 1, tint: 1, threshold: 1, posterize: 1, motionBlur: 1, radialBlur: 1, sharpen: 1,
      pixelate: 1, bulge: 1, twirl: 1, pinch: 1, ripple: 1, wave: 1, vortex: 1, glow: 1, outline: 1,
      dropShadow: 1, vignette: 1, noise: 1, scanlines: 1, perspective: 1, tile: 1, kaleidoscope: 1, chroma: 1, textGlow: 1 };
    return def[fx.id];
  });
}
