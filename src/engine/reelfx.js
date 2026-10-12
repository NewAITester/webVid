/**
 * reelfx — قطعه‌های موشن‌گرافی «شوریل»
 * ─────────────────────────────────────────────────────────────
 * هر تابع یک قطعهٔ کامل و مستقل است و فقط با ctx و «حال صدا» (env)
 * کار می‌کند؛ هیچ وابستگی به بقیهٔ موتور ندارد. همین فایل هم در
 * شوریل مستقل (showreel/) استفاده می‌شود و هم در برنامه:
 *   • پس‌زمینه‌های «استایل ویدیو» (textfx3 → bg: swarm/morph/wire/grid3d/burst)
 *   • افکت‌های بین‌خوانی (idlefx)
 *   • عنصرهای آماده و لایهٔ کد (e.reel.…)
 *
 * env = { t, W, H, kick, pulse, bi, sb, beats, rms }
 *   kick  ضربهٔ نرم (۰..۱)       pulse  تپش تیز روی ضرب (۰..۱)
 *   bi    شمارهٔ آخرین ضرب        sb     ثانیه از آخرین ضرب
 * همه تابع خالص زمان‌اند (بدون Math.random) تا اسکراب و خروجی یکی باشد.
 */

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };
export const lerp = (a, b, u) => a + (b - a) * u;
export const E = {
  out3: u => 1 - Math.pow(1 - clamp(u), 3),
  out5: u => 1 - Math.pow(1 - clamp(u), 5),
  in3: u => Math.pow(clamp(u), 3),
  io3: u => { u = clamp(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
  outBack: u => { u = clamp(u); const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
  outExpo: u => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(u))),
  outElastic: u => { u = clamp(u); if (u === 0 || u === 1) return u; return Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * (TAU / 3)) + 1; },
};
const hexRgb = h => { const s = String(h || '#ffffff').replace('#', ''); const n = parseInt(s.length === 3 ? s.replace(/./g, c => c + c) : s.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgba = (h, a = 1) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${clamp(a)})`; };
export const mixHex = (a, b, u) => { const A = hexRgb(a), B = hexRgb(b); const c = A.map((v, i) => Math.round(lerp(v, B[i], clamp(u)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };

/* ── حال صدا ────────────────────────────────────────────────── */
function bsearch(b, t) { let lo = 0, hi = b.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (b[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; }
/** از آرایهٔ زمان ضرب‌ها (شوریل مستقل) */
export function envFromBeats(beats, t, W, H, rms = 0.7) {
  const bi = bsearch(beats, t), sb = bi < 0 ? 99 : t - beats[bi];
  const pulse = sb < 0.3 ? Math.pow(1 - sb / 0.3, 2) : 0;
  const kick = sb < 0.4 ? Math.exp(-sb * 9) : 0;
  return { t, W, H, kick, pulse, bi, sb, beats, rms };
}
/** از Song برنامه */
export function envFromSong(song, t, W, H) {
  const beats = song?.beats || [];
  const e = envFromBeats(beats, t, W, H, song?.rms ? song.rms(t) : 0.5);
  if (song?.kick) e.kick = song.kick(t);
  return e;
}

/* ── ۱) گرداب ذرات (کهکشان) ─────────────────────────────────── */
export function vortex(ctx, env, o = {}) {
  const { W, H, t, kick, pulse } = env;
  const n = o.n ?? 900, cx = o.cx ?? W / 2, cy = o.cy ?? H / 2;
  const R = (o.r ?? Math.min(W, H) * 0.46) * (1 + 0.06 * kick);
  const c1 = o.c1 || '#E4142A', c2 = o.c2 || '#18E0FF', a = o.a ?? 1, spin = o.spin ?? 1;
  const arms = o.arms ?? 3, tilt = o.tilt ?? 0.55, sz = (o.size ?? 1) * Math.min(W, H) / 1080;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  const buckets = [[], [], []];
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 1.17), h2 = hash(i * 2.31 + 4), h3 = hash(i * 3.77 + 9);
    const d = Math.pow(h1, 0.65);
    const arm = (i % arms) / arms * TAU;
    const w = (0.35 + 1.6 * (1 - d)) * spin;
    const an = arm + d * 5.2 + t * w + (h2 - 0.5) * 0.7;
    const push = 1 + pulse * 0.22 * (1 - d) + kick * 0.05;
    const r = d * R * push + (h3 - 0.5) * R * 0.07;
    const x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r * tilt;
    const tr = 0.06 + 0.16 * kick;                     // دنباله: تکه‌ای از مسیر
    const x2 = cx + Math.cos(an - tr * w) * r, y2 = cy + Math.sin(an - tr * w) * r * tilt;
    buckets[h3 < 0.45 ? 0 : h3 < 0.85 ? 1 : 2].push(x, y, x2, y2, (0.8 + 2.4 * h2) * sz);
  }
  const cols = [c1, c2, '#FFFFFF'], alphas = [0.75, 0.6, 0.9];
  buckets.forEach((b, k) => {
    ctx.strokeStyle = rgba(cols[k], alphas[k] * a);
    for (const lw of [3.2, 1.6]) {
      ctx.lineWidth = lw * sz; ctx.beginPath();
      for (let j = 0; j < b.length; j += 5) if ((lw > 2) === (b[j + 4] > 2 * sz)) { ctx.moveTo(b[j], b[j + 1]); ctx.lineTo(b[j + 2], b[j + 3]); }
      ctx.stroke();
    }
  });
  // هستهٔ درخشان
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.35);
  g.addColorStop(0, rgba('#FFFFFF', (0.55 + 0.4 * pulse) * a)); g.addColorStop(0.25, rgba(c1, 0.35 * a)); g.addColorStop(1, rgba(c1, 0));
  ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
}

/* ── ۲) انفجار روی ضرب: ذره + موج ضربه + جرقه ─────────────────── */
export function burst(ctx, env, o = {}) {
  const { W, H, t, beats, bi } = env;
  const c1 = o.c1 || '#E4142A', c2 = o.c2 || '#FFD447', a = o.a ?? 1;
  const n = o.n ?? 60, life = o.life ?? 1.2, every = o.every ?? 1, sz = (o.size ?? 1) * Math.min(W, H) / 1080;
  const fixed = o.cx != null;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let b = bi; b >= 0 && b > bi - 4; b--) {
    if (b % every) continue;
    const dt = t - beats[b];
    if (dt < 0 || dt > life) continue;
    const u = dt / life, cx = fixed ? o.cx : W * (0.25 + 0.5 * hash(b * 1.3)), cy = fixed ? o.cy : H * (0.3 + 0.4 * hash(b * 2.9));
    // موج ضربه
    const rr = E.out5(u) * Math.min(W, H) * 0.42 * (o.ring ?? 1);
    ctx.strokeStyle = rgba(b % 2 ? c2 : c1, (1 - u) * 0.9 * a); ctx.lineWidth = (14 * (1 - u) + 1) * sz;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba('#FFFFFF', (1 - u) * 0.5 * a); ctx.lineWidth = 2 * sz;
    ctx.beginPath(); ctx.arc(cx, cy, rr * 0.7, 0, TAU); ctx.stroke();
    // ذره‌ها با گرانش و دنباله
    const col = [c1, c2, '#FFFFFF'];
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba(col[k], (1 - u) * a); ctx.lineWidth = (k === 2 ? 2 : 4) * sz * (1 - u * 0.7);
      ctx.beginPath();
      for (let i = k; i < n; i += 3) {
        const an = hash(b * 7 + i) * TAU, sp = (300 + 900 * hash(b * 3 + i * 1.7)) * sz;
        const d = sp * (1 - Math.exp(-dt * 3.2)) / 3.2, g = 380 * sz * dt * dt;
        const x = cx + Math.cos(an) * d, y = cy + Math.sin(an) * d + g;
        const v = sp * Math.exp(-dt * 3.2) * 0.04;
        ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(an) * v, y - Math.sin(an) * v - 760 * sz * dt * 0.04);
      }
      ctx.stroke();
    }
    // فلاش هسته
    if (dt < 0.15) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 140 * sz);
      g.addColorStop(0, rgba('#FFFFFF', (1 - dt / 0.15) * a)); g.addColorStop(1, rgba(c1, 0));
      ctx.fillStyle = g; ctx.fillRect(cx - 140 * sz, cy - 140 * sz, 280 * sz, 280 * sz);
    }
  }
  ctx.restore();
}

/* ── ۳) دگردیسی شکل‌ها روی ضرب ─────────────────────────────── */
const SHAPES = [0, 3, 4, 5, 6, -5];   // ۰ دایره، n ضلعی، منفی = ستاره
function shapePts(kind, m) {
  const pts = [];
  for (let j = 0; j < m; j++) {
    const u = j / m, an = u * TAU - Math.PI / 2;
    if (kind === 0) { pts.push([Math.cos(an), Math.sin(an)]); continue; }
    const star = kind < 0, s = Math.abs(kind) * (star ? 2 : 1);
    const seg = Math.floor(u * s), f = u * s - seg;
    const a0 = (seg / s) * TAU - Math.PI / 2, a1 = ((seg + 1) / s) * TAU - Math.PI / 2;
    const r0 = star && seg % 2 ? 0.45 : 1, r1 = star && (seg + 1) % 2 ? 0.45 : 1;
    const p0 = [Math.cos(a0) * r0, Math.sin(a0) * r0], p1 = [Math.cos(a1) * r1, Math.sin(a1) * r1];
    pts.push([lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f)]);
  }
  return pts;
}
const _shapeCache = new Map();
const ptsOf = (k, m) => { const key = k + ':' + m; let p = _shapeCache.get(key); if (!p) { p = shapePts(k, m); _shapeCache.set(key, p); } return p; };
export function morph(ctx, env, o = {}) {
  const { W, H, t, bi, sb } = env;
  const cx = o.cx ?? W / 2, cy = o.cy ?? H / 2, R = o.r ?? Math.min(W, H) * 0.26;
  const c1 = o.c1 || '#E4142A', c2 = o.c2 || '#F6F3EC', a = o.a ?? 1, sz = Math.min(W, H) / 1080;
  const m = 120, b = Math.max(0, bi);
  const k0 = SHAPES[b % SHAPES.length], k1 = SHAPES[(b + 1) % SHAPES.length];
  const u = E.outBack(clamp((sb - 0.0) / 0.32));
  const A = ptsOf(k0, m), B = ptsOf(k1, m);
  const rot = t * 0.6 + b * 0.5 + u * 0.4;
  ctx.save(); ctx.translate(cx, cy);
  // پژواک‌ها: چند نسخهٔ کوچک‌تر و چرخیده
  for (let e = 5; e >= 0; e--) {
    const s = R * (1 + e * 0.16) * (1 + 0.1 * env.pulse * (e === 0));
    ctx.save(); ctx.rotate(rot - e * 0.12);
    ctx.beginPath();
    for (let j = 0; j <= m; j++) { const p = A[j % m], q = B[j % m]; const x = lerp(p[0], q[0], u) * s, y = lerp(p[1], q[1], u) * s; j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
    if (e === 0) {
      ctx.fillStyle = rgba(c1, 0.92 * a); ctx.fill();
      ctx.strokeStyle = rgba(c2, a); ctx.lineWidth = 6 * sz; ctx.stroke();
    } else { ctx.strokeStyle = rgba(e % 2 ? c2 : c1, (0.5 - e * 0.08) * a); ctx.lineWidth = (4 - e * 0.5) * sz; ctx.stroke(); }
    ctx.restore();
  }
  // مدار نقطه‌ها
  ctx.fillStyle = rgba(c2, a);
  for (let j = 0; j < 12; j++) {
    const an = j / 12 * TAU - t * 1.2, rr = R * (1.55 + 0.08 * Math.sin(t * 3 + j)) + env.pulse * 30 * sz;
    ctx.beginPath(); ctx.arc(Math.cos(an) * rr, Math.sin(an) * rr, (j % 3 ? 4 : 8) * sz, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/* ── ۴) سیم‌کشی سه‌بعدی (بیست‌وجهی / مکعب) ──────────────────── */
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
const ICO_E = (() => { const e = []; for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { const d = Math.hypot(...ICO_V[i].map((v, k) => v - ICO_V[j][k])); if (Math.abs(d - 2) < 0.01) e.push([i, j]); } return e; })();
const CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
function rot3([x, y, z], ax, ay, az) {
  let c = Math.cos(ax), s = Math.sin(ax); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay); s = Math.sin(ay); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(az); s = Math.sin(az); [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}
export function wire(ctx, env, o = {}) {
  const { W, H, t, pulse } = env;
  const cx = o.cx ?? W / 2, cy = o.cy ?? H / 2, R = (o.r ?? Math.min(W, H) * 0.24) * (1 + 0.12 * pulse);
  const c1 = o.c1 || '#18E0FF', c2 = o.c2 || '#E4142A', a = o.a ?? 1, sz = Math.min(W, H) / 1080;
  const ico = (o.shape || 'ico') === 'ico';
  const V = ico ? ICO_V : CUBE_V, Ed = ico ? ICO_E : CUBE_E, nrm = ico ? 1 / Math.hypot(1, PHI) : 1 / Math.sqrt(3);
  const ax = t * 0.7 + env.bi * 0.15, ay = t * 0.9, az = t * 0.25;
  const P = V.map(v => { const [x, y, z] = rot3(v.map(c => c * nrm), ax, ay, az); const f = 3 / (3 + z); return [cx + x * R * f, cy + y * R * f, z]; });
  ctx.save(); ctx.lineCap = 'round';
  // قاب بیرونی دوم (بزرگ‌تر، با تأخیر) برای عمق
  if (o.double !== false) {
    const Q = V.map(v => { const [x, y, z] = rot3(v.map(c => c * nrm), -ay * 0.6, ax * 0.5, az); const f = 3 / (3 + z); return [cx + x * R * 1.7 * f, cy + y * R * 1.7 * f, z]; });
    ctx.strokeStyle = rgba(c2, 0.35 * a); ctx.lineWidth = 2 * sz; ctx.beginPath();
    for (const [i, j] of Ed) { ctx.moveTo(Q[i][0], Q[i][1]); ctx.lineTo(Q[j][0], Q[j][1]); }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const [lw, al] of [[14, 0.12], [6, 0.3], [2.5, 1]]) {
    ctx.strokeStyle = rgba(c1, al * a); ctx.lineWidth = lw * sz; ctx.beginPath();
    for (const [i, j] of Ed) { ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); }
    ctx.stroke();
  }
  ctx.fillStyle = rgba('#FFFFFF', a);
  for (const p of P) { ctx.beginPath(); ctx.arc(p[0], p[1], (5 - p[2] * 2) * sz, 0, TAU); ctx.fill(); }
  ctx.restore();
}

/* ── ۵) پرواز در ستاره‌ها (وارپ) ────────────────────────────── */
export function starfield(ctx, env, o = {}) {
  const { W, H, t, kick } = env;
  const n = o.n ?? 500, c = o.c || '#FFFFFF', a = o.a ?? 1, sp = (o.speed ?? 1) * (1 + 2.5 * kick);
  const cx = W / 2, cy = H / 2, sz = Math.min(W, H) / 1080, F = Math.max(W, H) * 0.6;
  ctx.save(); ctx.strokeStyle = rgba(c, 0.85 * a); ctx.lineCap = 'round';
  for (const lw of [1.2, 2.6]) {
    ctx.lineWidth = lw * sz; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if ((hash(i * 9.1) > 0.8) !== (lw > 2)) continue;
      const x0 = (hash(i * 1.3) - 0.5) * 2, y0 = (hash(i * 2.7) - 0.5) * 2;
      const z = 1 - ((hash(i * 4.1) + t * 0.35 * (o.speed ?? 1)) % 1);
      const z2 = Math.min(1, z + 0.012 * sp + 0.004);
      const x = cx + x0 / z * F * 0.25, y = cy + y0 / z * F * 0.25;
      const x2 = cx + x0 / z2 * F * 0.25, y2 = cy + y0 / z2 * F * 0.25;
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) continue;
      ctx.moveTo(x2, y2); ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ── ۶) زمین شبکه‌ای پرسپکتیو + خورشید + شهر اکولایزری ────────── */
export function grid3d(ctx, env, o = {}) {
  const { W, H, t, kick, pulse } = env;
  const c1 = o.c1 || '#FF2E97', c2 = o.c2 || '#18E0FF', a = o.a ?? 1, sz = Math.min(W, H) / 1080;
  const hz = H * (o.horizon ?? 0.58);
  ctx.save();
  // آسمان
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, rgba('#05010F', a)); sky.addColorStop(1, rgba(mixHex('#05010F', c1, 0.45), a));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
  // خورشید راه‌راه
  if (o.sun !== false) {
    const sr = Math.min(W, H) * 0.24 * (1 + 0.04 * pulse), sx = W / 2, sy = hz - sr * 0.35;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hz); ctx.clip();
    const sg = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
    sg.addColorStop(0, rgba('#FFE14F', a)); sg.addColorStop(1, rgba(c1, a));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(mixHex('#05010F', c1, 0.35), a);
    for (let i = 0; i < 7; i++) { const yy = sy + sr * (0.05 + i * 0.14), hh = (2 + i * 2.2) * sz; ctx.fillRect(sx - sr, yy + ((t * 30 * sz) % (sr * 0.14)), sr * 2, hh); }
    ctx.restore();
  }
  // شهر اکولایزری روی افق
  const nb = o.bars ?? 40, bw = W / nb;
  for (let i = 0; i < nb; i++) {
    const hh = (0.15 + 0.85 * Math.abs(Math.sin(t * (1.5 + hash(i) * 2.5) + i))) * (0.35 + 0.65 * kick * hash(i + env.bi)) * H * 0.22 + 6 * sz;
    ctx.fillStyle = rgba(i % 2 ? c2 : mixHex(c1, '#000000', 0.2), 0.85 * a);
    ctx.fillRect(i * bw + bw * 0.1, hz - hh, bw * 0.8, hh);
  }
  // زمین
  ctx.fillStyle = rgba('#05010F', a); ctx.fillRect(0, hz, W, H - hz);
  ctx.strokeStyle = rgba(c2, (0.55 + 0.45 * pulse) * a); ctx.lineWidth = 2.5 * sz;
  ctx.beginPath();
  const sp = (o.speed ?? 1) * (t * 0.9 + env.bi * 0.05);
  for (let k = 0; k < 18; k++) {
    const z = (k + 1 - (sp % 1)) / 18, y = hz + (H - hz) * Math.pow(z, 2.2);
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  for (let k = -14; k <= 14; k++) { ctx.moveTo(W / 2 + k * W * 0.012, hz); ctx.lineTo(W / 2 + k * W * 0.16, H); }
  ctx.stroke();
  const fog = ctx.createLinearGradient(0, hz - 10 * sz, 0, hz + (H - hz) * 0.35);
  fog.addColorStop(0, rgba(c1, 0.55 * a)); fog.addColorStop(1, rgba(c1, 0));
  ctx.fillStyle = fog; ctx.fillRect(0, hz - 10 * sz, W, (H - hz) * 0.4);
  ctx.restore();
}

/* ── ۷) حلقهٔ اکولایزر شعاعی ───────────────────────────────── */
export function eqRing(ctx, env, o = {}) {
  const { W, H, t, kick, pulse } = env;
  const cx = o.cx ?? W / 2, cy = o.cy ?? H / 2, R = (o.r ?? Math.min(W, H) * 0.3) * (1 + 0.05 * pulse);
  const n = o.n ?? 96, c1 = o.c1 || '#E4142A', c2 = o.c2 || '#18E0FF', a = o.a ?? 1, sz = Math.min(W, H) / 1080;
  ctx.save(); ctx.lineCap = 'round';
  for (const [col, off, lw] of [[c2, 0.5, 5], [c1, 0, 7]]) {
    ctx.strokeStyle = rgba(col, 0.9 * a); ctx.lineWidth = lw * sz; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const an = (i + off) / n * TAU + t * 0.2, s = Math.min(i, n - i) / (n / 2);
      const e = clamp(0.25 + 0.5 * Math.abs(Math.sin(t * (3 + s * 4) + i * 0.6)) * (0.4 + kick) + pulse * (1 - s) * 0.6);
      const r1 = R + e * R * 0.55 * (off ? 0.7 : 1);
      ctx.moveTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R); ctx.lineTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ── ۸) نوشته‌ای که از ذره‌ها ساخته می‌شود ───────────────────── */
const _txtPts = new Map();
function textPoints(text, font, n) {
  const key = text + '|' + font + '|' + n;
  let p = _txtPts.get(key); if (p) return p;
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return [];
  const cw = 900, ch = 260;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  let fs = 200; g.font = `900 ${fs}px ${font}`;
  while (g.measureText(text).width > cw * 0.92 && fs > 20) { fs -= 6; g.font = `900 ${fs}px ${font}`; }
  g.fillText(text, cw / 2, ch / 2);
  const d = g.getImageData(0, 0, cw, ch).data, cand = [];
  for (let y = 0; y < ch; y += 3) for (let x = 0; x < cw; x += 3) if (d[(y * cw + x) * 4 + 3] > 128) cand.push([(x - cw / 2) / cw, (y - ch / 2) / cw]);
  p = [];
  if (cand.length) for (let i = 0; i < n; i++) p.push(cand[Math.floor(hash(i * 3.17 + 0.5) * cand.length)]);
  _txtPts.set(key, p);
  if (_txtPts.size > 40) _txtPts.delete(_txtPts.keys().next().value);
  return p;
}
/** k: ۰ = پخش، ۱ = نوشته کامل */
export function swarmText(ctx, env, o = {}) {
  const { W, H, t, pulse } = env;
  const text = String(o.text || 'MOTION'), font = o.font || '"IRANSansX Black", Vazirmatn, "Noto Sans Arabic", sans-serif';
  const n = o.n ?? 1400, k = clamp(o.k ?? 1), cx = o.cx ?? W / 2, cy = o.cy ?? H / 2;
  const w = o.w ?? W * 0.8, c1 = o.c1 || '#F6F3EC', c2 = o.c2 || '#E4142A', a = o.a ?? 1, sz = Math.min(W, H) / 1080;
  const pts = textPoints(text, font, n);
  if (!pts.length) return;
  ctx.save();
  const b = [[], []];
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i];
    const delay = hash(i * 5.3) * 0.35, u = E.io3(clamp((k - delay) / 0.65));
    const an = hash(i * 1.9) * TAU + t * (0.3 + hash(i) * 0.6), rr = (0.35 + hash(i * 2.2) * 0.75) * Math.max(W, H) * 0.6;
    const sx = cx + Math.cos(an) * rr, sy = cy + Math.sin(an) * rr * 0.7;
    const jit = (1 - u) * 0 + pulse * 6 * sz * (hash(i * 7.7) - 0.5);
    const x = lerp(sx, cx + px * w, u) + jit, y = lerp(sy, cy + py * w, u) + jit;
    b[i % 5 ? 0 : 1].push(x, y);
  }
  const r = (2.2 + 1.2 * pulse) * sz * (o.dot ?? 1);
  [[c1, 0], [c2, 1]].forEach(([col, j]) => {
    ctx.fillStyle = rgba(col, a); ctx.beginPath();
    const L = b[j];
    for (let i = 0; i < L.length; i += 2) { ctx.moveTo(L[i] + r, L[i + 1]); ctx.arc(L[i], L[i + 1], r, 0, TAU); }
    ctx.fill();
  });
  ctx.restore();
}

/* ── ۱۰) جریان ذره‌ای نوشته (FLOW) ─────────────────────────────
   ذره‌ها روی مدارهای بیضی می‌چرخند (با رد حرکت)، جمع می‌شوند و نوشته را
   می‌سازند و آخر به بیرون پرت می‌شوند. حالت title: نوشته می‌ماند و با هر ضرب
   جلو می‌آید و برمی‌گردد (ذره‌ها کمی باز و دوباره جمع می‌شوند). */
const _flowPts = new Map();
function flowPoints(text, font, weight, n) {
  const key = [text, font, weight, n].join('|');
  let p = _flowPts.get(key); if (p) return p;
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return { pts: [], w: 1 };
  const fs = 160, mk = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
  let g = mk(8, 8).getContext('2d'); g.font = `${weight} ${fs}px ${font}`;
  const tw = Math.ceil(g.measureText(text).width) + 40, th = Math.ceil(fs * 1.6);
  const c = mk(tw, th); g = c.getContext('2d');
  g.font = `${weight} ${fs}px ${font}`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, tw / 2, th / 2);
  const d = g.getImageData(0, 0, tw, th).data, cand = [];
  for (let y = 0; y < th; y += 2) for (let x = 0; x < tw; x += 2) if (d[(y * tw + x) * 4 + 3] > 128) cand.push([(x - tw / 2) / fs, (y - th / 2) / fs]);
  p = { pts: [], w: (tw - 40) / fs };
  if (cand.length) for (let i = 0; i < n; i++) p.pts.push(cand[Math.floor(hash(i * 3.71 + 0.13) * cand.length)]);
  _flowPts.set(key, p);
  if (_flowPts.size > 30) _flowPts.delete(_flowPts.keys().next().value);
  return p;
}
/**
 * o: { text, font, weight, size (px قلم), n, cols[4], lw, trail, t (ثانیه از شروع), dur,
 *      swirl, inAt, gather, outLen, mode: 'reel'|'title', amp, bpm, beat: 'auto'|'bpm', cx, cy, s }
 */
export function flowText(ctx, env, o = {}) {
  const { W, H } = env;
  const text = String(o.text ?? 'FLOW'), n = Math.max(10, Math.min(5000, (o.n ?? 1500) | 0));
  const s = o.s ?? Math.min(W / 1920, H / 1080), cx = o.cx ?? W / 2, cy = o.cy ?? H / 2;
  const font = o.font || 'Arial, "Helvetica Neue", "Liberation Sans", sans-serif', weight = o.weight || '700';
  const cols = (o.cols && o.cols.length ? o.cols : ['#4FB9C9', '#5E9FE8', '#BF8EDA', '#DF84A8']);
  const lt0 = o.t ?? env.t, dur = o.dur ?? 2.5, mode = o.mode || 'reel';
  const swirlK = o.swirl ?? 2.6, inAt = o.inAt ?? 0.95, gather = Math.max(0.05, o.gather ?? 0.7);
  const outLen = o.outLen ?? 0.45, outAt = dur - outLen, amp = o.amp ?? 1;
  const P = flowPoints(text, font, weight, n);
  if (!P.pts.length) return;
  // اندازهٔ قلم ← هیچ‌وقت پهن‌تر از ۹۲٪ کادر نشود
  const size = Math.min(o.size ?? H * 0.46, W * 0.92 / Math.max(0.1, P.w));
  // ضرب: از آهنگ پروژه یا از BPM خود المان
  const beats = env.beats || [], useSong = o.beat !== 'bpm' && beats.length > 0, bp = 60 / Math.max(20, o.bpm ?? 120);
  const gt = env.t - lt0;     // زمان کل = gt + lt
  // پوش ضرب: حملهٔ تند (۰٫۰۴ ثانیه، درست روی ضرب) و برگشت نرم
  const env1 = sb => (sb < 0 || sb > 1.2 ? 0 : sb < 0.04 ? E.out3(sb / 0.04) : Math.exp(-(sb - 0.04) * 4.5));
  const kickAt = lt => {
    if (useSong) { const T = gt + lt; let lo = 0, hi = beats.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (beats[m] <= T) { r = m; lo = m + 1; } else hi = m - 1; } return env1(r < 0 ? 99 : T - beats[r]); }
    return env1((((lt / bp) % 1 + 1) % 1) * bp);
  };
  const pos = (lt, i, out) => {
    const h1 = hash(i * 1.37 + 0.11), h2 = hash(i * 2.91 + 0.7), h6 = hash(i * 6.13 + 0.3);
    const r = 70 + 640 * Math.pow(h1, 0.75), a = h2 * TAU, w = 2.2 / Math.sqrt(r / 100);
    const z = ((hash(i * 3.3) + hash(i * 4.7) + hash(i * 5.9)) - 1.5) * 2 * 18, d = h6 * 0.35;
    const sw = 1 + swirlK * (1 - E.outExpo(lt / 0.9)), an = a + w * lt + (sw - 1) * 0.8;
    let x = r * sw * Math.cos(an) * s, y = (r * sw * 0.45 * Math.sin(an) + z) * s;
    const m = E.io3((lt - inAt - d) / gather);
    const [px, py] = P.pts[i];
    let tx = px * size, ty = py * size;
    if (mode === 'title' && m > 0) {
      // با هر ضرب: نوشته جلو می‌آید (بزرگ‌تر) و ذره‌ها کمی باز می‌شوند، بعد برمی‌گردند
      const k = kickAt(lt) * amp * m, sc = 1 + 0.22 * k, spread = 1 + k * (0.04 + 0.16 * hash(i * 8.1));
      tx = tx * sc * spread; ty = ty * sc * spread;
      tx += Math.sin(a * 3 + i) * 10 * k * s; ty += Math.cos(a * 2 + i) * 8 * k * s;
    }
    const jx = Math.sin(lt * 4 + a * 5) * 1.6 * s, jy = Math.cos(lt * 3.3 + a * 7) * 1.6 * s;
    x += (tx + jx - x) * m; y += (ty + jy - y) * m;
    if (outLen > 0) {
      const ex = Math.pow(clamp((lt - outAt - d * 0.3) / outLen), 3);
      if (ex > 0) { const L = Math.hypot(x, y) + 1e-3; x += x / L * ex * 1500 * s; y += y / L * ex * 1500 * s; }
    }
    out[0] = cx + x; out[1] = cy + y;
  };
  const a0 = [0, 0], a1 = [0, 0], trail = o.trail ?? 0.06;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineWidth = (o.lw ?? 4.4) * s;
  ctx.globalAlpha = o.a ?? 1;
  for (let ci = 0; ci < 4; ci++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const r = 70 + 640 * Math.pow(hash(i * 1.37 + 0.11), 0.75);
      if (Math.min(3, Math.floor((r - 70) / 640 * 4)) !== ci) continue;
      pos(lt0 - trail, i, a0); pos(lt0, i, a1);
      ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0] + 0.01, a1[1]);
    }
    ctx.strokeStyle = cols[ci % cols.length]; ctx.stroke();
  }
  ctx.restore();
}

/* ── ۹) نوشتهٔ کوبنده (کینتیک تایپوگرافی) ─────────────────────── */
/** d: ثانیه از شروع کلمه */
export function slamText(ctx, env, o = {}) {
  const { W, H } = env;
  const d = o.d ?? 0, text = String(o.text || ''), size = o.size ?? Math.min(W, H) * 0.24;
  const font = o.font || '"IRANSansX Black", Vazirmatn, "Noto Sans Arabic", sans-serif';
  const c = o.c || '#F6F3EC', c2 = o.c2 || '#E4142A', a = (o.a ?? 1) * clamp(d / 0.04);
  if (a <= 0 || !text) return;
  const cx = o.cx ?? W / 2, cy = o.cy ?? H / 2, sz = Math.min(W, H) / 1080;
  const u = E.out5(clamp(d / 0.22)), s = lerp(2.6, 1, u) * (1 + 0.03 * Math.sin(d * 3));
  const shake = d < 0.35 ? (1 - d / 0.35) * 18 * sz : 0;
  ctx.save();
  ctx.translate(cx + Math.sin(d * 90) * shake, cy + Math.cos(d * 70) * shake);
  ctx.rotate((o.rot ?? -0.04) * (1 - u * 0.6));
  ctx.scale(s, s);
  ctx.font = `${o.weight ?? 900} ${size}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = o.ltr ? 'ltr' : 'rtl';
  // سایهٔ عمیق پله‌ای + جداشدن رنگ
  for (let q = 8; q >= 1; q--) { ctx.fillStyle = rgba(c2, a * 0.9); ctx.fillText(text, q * 2.4 * sz, q * 2.4 * sz); }
  if (d < 0.25) { const sp = (1 - d / 0.25) * 22 * sz; ctx.fillStyle = rgba('#18E0FF', a * 0.7); ctx.fillText(text, -sp, 0); ctx.fillStyle = rgba('#FF2E63', a * 0.7); ctx.fillText(text, sp, 0); }
  ctx.fillStyle = rgba(c, a); ctx.fillText(text, 0, 0);
  ctx.restore();
  // خط‌های سرعت
  if (d < 0.5 && o.lines !== false) {
    const k = 1 - d / 0.5;
    ctx.save(); ctx.strokeStyle = rgba(c, 0.6 * k * a); ctx.lineWidth = 3 * sz; ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const an = hash(i * 3.1 + Math.floor(o.seed || 0)) * TAU, r0 = Math.min(W, H) * (0.3 + 0.2 * hash(i)) + (1 - k) * 200 * sz;
      ctx.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); ctx.lineTo(cx + Math.cos(an) * (r0 + 160 * sz * k), cy + Math.sin(an) * (r0 + 160 * sz * k));
    }
    ctx.stroke(); ctx.restore();
  }
}

/* ── ۱۰) موج ضربه و خط‌های سرعت روی ضرب (تزئین) ─────────────── */
export function shock(ctx, env, o = {}) {
  const { W, H, sb } = env;
  if (sb > 0.6) return;
  const u = sb / 0.6, cx = o.cx ?? W / 2, cy = o.cy ?? H / 2, sz = Math.min(W, H) / 1080, a = o.a ?? 1;
  ctx.save();
  ctx.strokeStyle = rgba(o.c || '#FFFFFF', (1 - u) * 0.8 * a); ctx.lineWidth = (10 * (1 - u) + 1) * sz;
  ctx.beginPath(); ctx.ellipse(cx, cy, E.out3(u) * W * 0.45, E.out3(u) * H * 0.45, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}

/* ── ۱۱) گذار: نوارهای رنگی مورب ───────────────────────────── */
/** p: ۰..۱ — نیمهٔ اول صفحه را می‌پوشاند، نیمهٔ دوم باز می‌کند */
export function wipe(ctx, W, H, p, o = {}) {
  if (p <= 0 || p >= 1) return;
  const cols = o.cols || ['#E4142A', '#FFD447', '#18E0FF', '#0B0B12'];
  const ang = o.ang ?? -0.35, D = Math.hypot(W, H);
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(ang);
  const bw = D / cols.length * 0.6;
  cols.forEach((c, i) => {
    const d = i * 0.07, u1 = E.io3(clamp((p - d) / 0.5)), u2 = E.io3(clamp((p - 0.5 - d) / 0.45));
    const x0 = lerp(-D, -D / 2, u1) + u2 * D * 1.6, x1 = lerp(-D / 2 - bw, D, u1) + u2 * D * 1.6;
    ctx.fillStyle = c; ctx.fillRect(Math.min(x0, x1) - i * bw * 0.3, -D, Math.abs(x1 - x0) + bw, D * 2);
  });
  ctx.restore();
}

/* ── ۱۲) گلیچ برش‌ها روی تصویر فعلی ────────────────────────── */
export function glitch(ctx, W, H, amt, seed = 0) {
  if (amt <= 0.01) return;
  const c = ctx.canvas, sx = c.width / W, sy = c.height / H;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 9; i++) {
    const h = hash(seed * 13 + i);
    if (h > amt) continue;
    const y = Math.floor(hash(seed * 7 + i * 3.3) * c.height), hh = Math.max(2, Math.floor((0.02 + 0.08 * hash(i + seed)) * c.height));
    const dx = (hash(seed + i * 5.1) - 0.5) * 160 * amt * sx;
    try { ctx.drawImage(c, 0, y, c.width, hh, dx, y, c.width, hh); } catch (e) { /* بوم آلوده */ }
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,30,80,${0.12 * amt})`; ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}

/* ── برای لایهٔ کد: e.reel.vortex({...}) و … ──────────────────── */
export function reelApi(ctx, env) {
  const wrap = fn => (o = {}) => fn(ctx, env, o);
  return {
    vortex: wrap(vortex), burst: wrap(burst), morph: wrap(morph), wire: wrap(wire),
    starfield: wrap(starfield), grid3d: wrap(grid3d), eqRing: wrap(eqRing),
    swarmText: wrap(swarmText), slamText: wrap(slamText), shock: wrap(shock), flowText: wrap(flowText),
    wipe: (p, o) => wipe(ctx, env.W, env.H, p, o), glitch: (amt, seed) => glitch(ctx, env.W, env.H, amt, seed),
  };
}
