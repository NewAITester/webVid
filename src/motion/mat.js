/**
 * ماتریس تبدیل دوبعدی — [a, b, c, d, e, f] مثل setTransform بوم
 *
 *   | a c e |     x' = a·x + c·y + e
 *   | b d f |     y' = b·x + d·y + f
 *
 * خودمان نوشتیم (به‌جای DOMMatrix) تا محاسبهٔ جای لایه‌ها در Node هم
 * تست شود.
 */
export const I = () => [1, 0, 0, 1, 0, 0];

export function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
export const translate = (m, x, y) => mul(m, [1, 0, 0, 1, x, y]);
export const scale = (m, sx, sy = sx) => mul(m, [sx, 0, 0, sy, 0, 0]);
export function rotate(m, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return mul(m, [c, s, -s, c, 0, 0]);
}
export const skewX = (m, deg) => mul(m, [1, 0, Math.tan((deg * Math.PI) / 180), 1, 0, 0]);

export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return null;
  const id = 1 / det;
  return [
    m[3] * id, -m[1] * id, -m[2] * id, m[0] * id,
    (m[2] * m[5] - m[3] * m[4]) * id, (m[1] * m[4] - m[0] * m[5]) * id,
  ];
}
export const apply = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
/** فقط بخش خطی (بدون جابه‌جایی) — برای تبدیل «فاصله»، نه «نقطه» */
export const applyVec = (m, x, y) => ({ x: m[0] * x + m[2] * y, y: m[1] * x + m[3] * y });
