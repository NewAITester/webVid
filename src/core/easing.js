/** منحنی‌های easing — خالص، بدون DOM. */
export const EASINGS = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => 1 - (1 - t) * (1 - t),
  easeInOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  easeInCubic: t => t * t * t,
  easeOutBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  // نویز قطعی (جای Math.random): همان الگوی خانه sin-hash
  hash: i => { const s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); },
};

export function ease(name, t) {
  const f = EASINGS[name] || EASINGS.linear;
  return f(Math.min(1, Math.max(0, t)));
}

/** منحنی بزیهٔ مکعبی (برای کی‌فریم‌های سفارشی). */
export function cubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  return x => {
    let t = x;
    for (let i = 0; i < 5; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-4) break;
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}
