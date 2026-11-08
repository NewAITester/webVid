/**
 * افکت‌های Canvas — فاز R6 (بازسازی)
 * ─────────────────────────────────────────────────────────────
 * ۲۴۷ پیاده‌سازی افکت از برنامهٔ قبلی (ریاضیات خودمان، نه کد Alight):
 * هر افکت یک تابع است که بوم مقصد (d) را از روی بوم مبدأ (cur) می‌سازد.
 * افکت‌هایی که اینجا نیستند فقط در رجیستری‌اند و در رندر نادیده گرفته می‌شوند.
 * قرارداد: v = پارامترهای حل‌شدهٔ افکت، id = شناسهٔ افکت، X = ابزارها.
 */

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

/** تجزیهٔ رنگ #rgb/#rrggbb/#rrggbbaa → [r,g,b,a] */
export function parseColor(h) {
  h = String(h || '#000000').slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

const rgbaStr = (hex, mul = 1) => {
  const [r, g, b, a] = parseColor(hex);
  return `rgba(${r},${g},${b},${a * mul})`;
};

/** نویز مقداری قطعی (هش سینوسی) — همان expr.js برنامهٔ قبلی */
const _hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export function noise(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return (_hash(i) + (_hash(i + 1) - _hash(i)) * u) * 2 - 1;
}

/** بوم‌های موقت (کش بر اساس نام) */
const _scr = new Map();
function scratch(name, W, H) {
  let c = _scr.get(name);
  if (!c) { if (typeof document === 'undefined') return null; c = document.createElement('canvas'); _scr.set(name, c); }
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
  x.clearRect(0, 0, W, H);
  return c;
}

/** کاشی نویز ثابت برای «دانهٔ فیلم» */
let _nt = null;
function noiseTile() {
  if (_nt) return _nt;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), img = x.createImageData(256, 256), q = img.data;
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < q.length; i += 4) { const v = rnd() * 255; q[i] = q[i + 1] = q[i + 2] = v; q[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  return (_nt = c);
}

/** پیاده‌سازی هر افکت: (d, cur, v, id, X) => void */
export const CANVAS_FX = {
  'blur': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.filter = `blur(${Math.max(0, v.r * px)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
  },
  'glow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const tint = scratch('glowT'), g = tint.getContext('2d');
    g.drawImage(cur, 0, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = v.color; g.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'lighter';
    d.filter = `blur(${Math.max(0.5, v.r * px)}px)`;
    let k = v.amt / 100;
    while (k > 0.001) { d.globalAlpha = Math.min(1, k); d.drawImage(tint, 0, 0); k -= 1; }
    d.filter = 'none'; d.globalAlpha = 1;
    d.globalCompositeOperation = 'source-over';
    d.drawImage(cur, 0, 0);
  },
  'shadow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.filter = `drop-shadow(${v.dx * px}px ${v.dy * px}px ${Math.max(0, v.r * px)}px ${rgbaStr(v.color, v.op / 100)})`;
    d.drawImage(cur, 0, 0); d.filter = 'none';
  },
  'color': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    // شیدر WebGL خاکستری/سپیا/نگاتیو ندارد — فقط وقتی همه صفرند از GL استفاده می‌شود
    if (!v.gray && !v.sepia && !v.invert) {
      const glOut = glAdjust(cur, { hue: v.hue, brightness: (v.bright - 100) / 100, contrast: v.contrast / 100, saturation: v.sat / 100 });
      if (glOut) { d.drawImage(glOut, 0, 0); return; }
    }
    d.filter = `brightness(${v.bright}%) contrast(${v.contrast}%) saturate(${v.sat}%) `
      + `hue-rotate(${v.hue}deg) grayscale(${v.gray}%) sepia(${v.sepia}%) invert(${v.invert}%)`;
    d.drawImage(cur, 0, 0); d.filter = 'none';
  },
  'tint': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    d.globalCompositeOperation = 'source-atop';
    d.globalAlpha = v.amt / 100; d.fillStyle = v.color; d.fillRect(0, 0, W, H);
  },
  'pixel': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const s = Math.max(1, v.size * px);
    const sw = Math.max(1, Math.round(W / s)), sh = Math.max(1, Math.round(H / s));
    const sm = scratch('pix', sw, sh), sx = sm.getContext('2d');
    sx.drawImage(cur, 0, 0, sw, sh);
    d.imageSmoothingEnabled = false; d.drawImage(sm, 0, 0, W, H); d.imageSmoothingEnabled = true;
  },
  'rgb': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    rgbSplit(d, cur, v.amt * px, (v.ang * Math.PI) / 180);
  },
  'glitch': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const mix = v.beat / 100;
    const amt = (v.amt / 100) * ((1 - mix) + mix * clamp((0 || 0) * 2));
    const f0 = Math.floor((time || 0) * v.speed);
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      const y = (i / bands) * H, h = H / bands + 1;
      const hsh = Math.sin((f0 * 13.1 + i * 7.7) * 12.9898) * 43758.5453;
      const rnd = hsh - Math.floor(hsh);
      const dx = rnd > 0.6 ? (rnd - 0.8) * W * 0.12 * amt : 0;
      d.drawImage(cur, 0, y, W, h, dx, y, W, h);
    }
  },
  'chroma': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const img = d.getImageData(0, 0, W, H), p = img.data;
    const [kr, kg, kb] = parseColor(v.color);
    const tol = (v.tol / 100) * 442, soft = Math.max(1, (v.soft / 100) * 442);
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      const dist = Math.hypot(p[i] - kr, p[i + 1] - kg, p[i + 2] - kb);
      if (dist < tol + soft) p[i + 3] *= clamp((dist - tol) / soft);
    }
    d.putImageData(img, 0, 0);
  },
  'vignette': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    d.globalCompositeOperation = 'source-atop';
    const r = Math.hypot(W, H) / 2;
    const g = d.createRadialGradient(W / 2, H / 2, r * (v.size / 100) * 0.6, W / 2, H / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${v.amt / 100})`);
    d.fillStyle = g; d.fillRect(0, 0, W, H);
  },
  /* ── نور و سایه ── */
  'outline': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const r = v.w * px;
    if (r > 0.2) {
      const t = tinted(cur, v.color);
      const n = r > 6 ? 24 : 16;
      for (const rr of r > 6 ? [r, r * 0.5] : [r]) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    d.drawImage(t, Math.cos(a) * rr, Math.sin(a) * rr);
  }
      }
    }
    d.drawImage(cur, 0, 0);
  },
  'extrude': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const L = v.len * px;
    const [r, g, b, al] = parseColor(v.color);
    const t = tinted(cur, `rgb(${r},${g},${b})`);
    const a = (v.ang * Math.PI) / 180;
    const n = Math.max(1, Math.min(36, Math.ceil(L / Math.max(1.5, px * 1.5))));
    const acc = scratch('extr'), ax = acc.getContext('2d');
    for (let i = n; i >= 1; i--) {
      const k = (i / n) * L;
      ax.drawImage(t, Math.cos(a) * k, Math.sin(a) * k);
    }
    if (id === 'extrude') {
      // لبهٔ جلویی کمی روشن‌تر تا حس عمق بدهد
      ax.globalAlpha = 0.35; ax.filter = 'brightness(160%)';
      ax.drawImage(t, Math.cos(a) * L / n, Math.sin(a) * L / n);
      ax.filter = 'none'; ax.globalAlpha = 1;
    }
    d.globalAlpha = al; d.drawImage(acc, 0, 0); d.globalAlpha = 1;
    d.drawImage(cur, 0, 0);
  },
  'longShadow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const L = v.len * px;
    const [r, g, b, al] = parseColor(v.color);
    const t = tinted(cur, `rgb(${r},${g},${b})`);
    const a = (v.ang * Math.PI) / 180;
    const n = Math.max(1, Math.min(36, Math.ceil(L / Math.max(1.5, px * 1.5))));
    const acc = scratch('extr'), ax = acc.getContext('2d');
    for (let i = n; i >= 1; i--) {
      const k = (i / n) * L;
      ax.drawImage(t, Math.cos(a) * k, Math.sin(a) * k);
    }
    if (id === 'extrude') {
      // لبهٔ جلویی کمی روشن‌تر تا حس عمق بدهد
      ax.globalAlpha = 0.35; ax.filter = 'brightness(160%)';
      ax.drawImage(t, Math.cos(a) * L / n, Math.sin(a) * L / n);
      ax.filter = 'none'; ax.globalAlpha = 1;
    }
    d.globalAlpha = al; d.drawImage(acc, 0, 0); d.globalAlpha = 1;
    d.drawImage(cur, 0, 0);
  },
  'shine': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const per = Math.max(0.3, v.every), ph = (time % per) / per;
    const u = ph / Math.min(0.9, 0.35 + 0.3 / per);
    if (u <= 1) {
      const b = box(), diag = Math.hypot(b.fw, b.fh) / 2 + 2;
      const wpx = Math.max(2, (v.width / 100) * b.fw);
      const x = -diag - wpx + u * (2 * diag + 2 * wpx);
      d.save();
      d.globalCompositeOperation = 'source-atop';
      d.translate(b.cx, b.cy); d.rotate((v.ang * Math.PI) / 180);
      const g = d.createLinearGradient(x - wpx, 0, x + wpx, 0);
      g.addColorStop(0, rgbaStr(v.color, 0)); g.addColorStop(0.5, rgbaStr(v.color, v.op / 100)); g.addColorStop(1, rgbaStr(v.color, 0));
      d.fillStyle = g; d.fillRect(x - wpx, -diag * 2, wpx * 2, diag * 4);
      d.restore();
    }
  },
  'leak': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), R = Math.max(b.fw, b.fh);
    const lk = scratch('leak'), lx = lk.getContext('2d');
    const sp = time * (v.speed / 100);
    const blobs = [[v.color, 0.2, 0.8], [v.color2, 7.3, 0.6], [v.color, 13.1, 0.45]];
    lx.globalCompositeOperation = 'lighter';
    for (const [col, seed, rr] of blobs) {
      const bx = b.cx + noise(sp + seed) * b.fw * 0.6, by = b.cy + noise(sp * 0.8 + seed + 40) * b.fh * 0.6;
      const g = lx.createRadialGradient(bx, by, 0, bx, by, R * rr);
      g.addColorStop(0, rgbaStr(col, 0.9)); g.addColorStop(1, rgbaStr(col, 0));
      lx.fillStyle = g; lx.fillRect(0, 0, W, H);
    }
    lx.globalCompositeOperation = 'destination-in'; lx.drawImage(cur, 0, 0);
    d.globalCompositeOperation = 'screen'; d.globalAlpha = v.amt / 100;
    d.drawImage(lk, 0, 0);
  },
  'beatFlash': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = clamp((0 || 0) * (v.amt / 100), 0, 3);
    if (k > 0.01) d.filter = `brightness(${100 + k * 80}%)`;
    d.drawImage(cur, 0, 0); d.filter = 'none';
    if (k > 0.01) {
      d.globalCompositeOperation = 'source-atop'; d.globalAlpha = Math.min(0.75, k * 0.45);
      d.fillStyle = v.color; d.fillRect(0, 0, W, H);
    }
  },
  /* ── رنگ ── */
  'duotone': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const [r1, g1, b1] = parseColor(v.c1), [r2, g2, b2] = parseColor(v.c2), k = v.amt / 100;
    pixelOp(d, (q, i) => {
      const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
      q[i] += (r1 + (r2 - r1) * l - q[i]) * k;
      q[i + 1] += (g1 + (g2 - g1) * l - q[i + 1]) * k;
      q[i + 2] += (b1 + (b2 - b1) * l - q[i + 2]) * k;
    });
  },
  'gradOver': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), a = (v.ang * Math.PI) / 180, r = Math.hypot(b.fw, b.fh) / 2;
    const g = d.createLinearGradient(b.cx - Math.cos(a) * r, b.cy - Math.sin(a) * r, b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r);
    g.addColorStop(0, v.c1); g.addColorStop(1, v.c2);
    d.globalCompositeOperation = 'source-atop'; d.globalAlpha = v.amt / 100;
    d.fillStyle = g; d.fillRect(0, 0, W, H);
  },
  'hueCycle': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.filter = `hue-rotate(${(time * v.speed * 360) % 360}deg) saturate(${v.sat}%)`;
    d.drawImage(cur, 0, 0); d.filter = 'none';
  },
  'posterize': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const n = Math.max(2, Math.round(v.levels)) - 1;
    pixelOp(d, (q, i) => {
      q[i] = Math.round((q[i] / 255) * n) / n * 255;
      q[i + 1] = Math.round((q[i + 1] / 255) * n) / n * 255;
      q[i + 2] = Math.round((q[i + 2] / 255) * n) / n * 255;
    });
  },
  'threshold': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const c1 = parseColor(v.c1), c2 = parseColor(v.c2), lv = (v.level / 100) * 255;
    pixelOp(d, (q, i) => {
      const c = q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114 >= lv ? c2 : c1;
      q[i] = c[0]; q[i + 1] = c[1]; q[i + 2] = c[2];
    });
  },
  /* ── رترو ── */
  'vhs': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = v.amt / 100;
    const soft = scratch('vhsS'), sx = soft.getContext('2d');
    sx.filter = `saturate(${100 + 40 * k}%) contrast(${100 + 10 * k}%) blur(${0.8 * k * px}px)`;
    sx.drawImage(cur, 0, 0); sx.filter = 'none';
    rgbSplit(d, soft, (1 + 5 * k) * px, 0);
    // نوار «ترکینگ» که آرام پایین می‌رود و کمی کج می‌شود
    const b = box(), bh = Math.max(4, b.h * 0.07);
    const by = b.y + (((time * 0.23) % 1.3) - 0.15) * b.h;
    const cp = scratch('vhsB'), cx2 = cp.getContext('2d');
    cx2.drawImage(dst, 0, 0);
    d.save(); d.beginPath(); d.rect(0, by, W, bh); d.clip();
    d.clearRect(0, by, W, bh);
    d.drawImage(cp, (noise(time * 9) * 10 + 6) * k * px, 0);
    d.restore();
    if (v.lines > 0) {
      d.globalCompositeOperation = 'source-atop';
      d.fillStyle = `rgba(0,0,0,${(v.lines / 100) * 0.35})`;
      const gap = Math.max(2, 3 * px);
      for (let y = b.y; y < b.y + b.h; y += gap) d.fillRect(b.x, y, b.w, gap / 2);
      d.fillStyle = `rgba(255,255,255,${0.05 * k})`;
      d.fillRect(b.x, by + bh * 0.4, b.w, Math.max(1, px));
    }
  },
  'scan': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), gap = Math.max(2, v.gap * px), off = ((time * v.speed * px) % gap + gap) % gap;
    d.globalCompositeOperation = 'source-atop';
    d.fillStyle = `rgba(0,0,0,${v.op / 100})`;
    for (let y = b.y - gap + off; y < b.y + b.h; y += gap) d.fillRect(b.x, y, b.w, gap / 2);
  },
  'grain': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const tile = noiseTile();
    const gr = scratch('grain'), gx = gr.getContext('2d');
    const fr = Math.floor(time * 24);
    const hs = n => { const x = Math.sin(n * 91.7 + 13.3) * 43758.5453; return x - Math.floor(x); };
    const sc = Math.max(1, v.size * px * 0.5);
    gx.save();
    gx.translate(-hs(fr) * 256 * sc, -hs(fr + 0.5) * 256 * sc); gx.scale(sc, sc);
    gx.fillStyle = gx.createPattern(tile, 'repeat');
    gx.fillRect(0, 0, W / sc + 512, H / sc + 512);
    gx.restore();
    gx.globalCompositeOperation = 'destination-in'; gx.drawImage(cur, 0, 0);
    d.globalCompositeOperation = 'overlay'; d.globalAlpha = Math.min(1, v.amt / 60);
    d.drawImage(gr, 0, 0);
  },
  'halftone': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box();
    let s = Math.max(2, v.size * px);
    if ((b.w / s) * (b.h / s) > 30000) s = Math.sqrt((b.w * b.h) / 30000);
    const sw = Math.max(1, Math.ceil(b.w / s)), sh = Math.max(1, Math.ceil(b.h / s));
    const sm = scratch('half', sw, sh), sx = sm.getContext('2d');
    sx.drawImage(cur, b.x, b.y, sw * s, sh * s, 0, 0, sw, sh);
    const q = sx.getImageData(0, 0, sw, sh).data;
    const [fr, fg, fb, fa] = parseColor(v.color);
    const own = fa < 0.02;
    if (!own) d.fillStyle = `rgb(${fr},${fg},${fb})`;
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const o = (j * sw + i) * 4, al = q[o + 3] / 255;
      if (al < 0.03) continue;
      const l = (q[o] * 0.299 + q[o + 1] * 0.587 + q[o + 2] * 0.114) / 255;
      const r = own ? s * 0.56 * Math.sqrt(al) * (1 - l * 0.45) : s * 0.62 * Math.sqrt(al * (1 - l));
      if (r < 0.3) continue;
      if (own) d.fillStyle = `rgb(${q[o]},${q[o + 1]},${q[o + 2]})`;
      d.beginPath(); d.arc(b.x + (i + 0.5) * s, b.y + (j + 0.5) * s, r, 0, Math.PI * 2); d.fill();
    }
  },
  /* ── تاری و تحریف ── */
  'zoomBlur': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), k = v.amt / 100;
    smear(d, 10, (ax, u) => {
      const s = 1 + k * 0.35 * u;
      ax.translate(b.cx, b.cy); ax.scale(s, s); ax.translate(-b.cx, -b.cy);
    });
  },
  'dirBlur': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const a = (v.ang * Math.PI) / 180, L = v.len * px;
    smear(d, 10, (ax, u) => ax.translate(Math.cos(a) * L * (u - 0.5), Math.sin(a) * L * (u - 0.5)));
  },
  'wave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), A = v.amp * px, len = Math.max(1, v.len * px), ph = time * v.speed;
    const band = Math.max(2, Math.round(2 * px));
    if (v.dir >= 0.5) {
      for (let x = Math.max(0, b.x - A); x < Math.min(W, b.x + b.w + A); x += band) {
  const dy = Math.sin((x / len) * Math.PI * 2 + ph) * A;
  d.drawImage(cur, x, 0, band, H, x, dy, band, H);
      }
    } else {
      for (let y = Math.max(0, b.y - A); y < Math.min(H, b.y + b.h + A); y += band) {
  const dx = Math.sin((y / len) * Math.PI * 2 + ph) * A;
  d.drawImage(cur, 0, y, W, band, dx, y, W, band);
      }
    }
  },
  'kaleido': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), q = scratch('kal'), qx = q.getContext('2d');
    const four = v.mode < 0.5;
    qx.beginPath(); qx.rect(0, 0, b.cx, four ? b.cy : H); qx.clip(); qx.drawImage(cur, 0, 0);
    const put = (fx, fy) => {
      d.save(); d.translate(b.cx, b.cy); d.scale(fx, fy); d.translate(-b.cx, -b.cy); d.drawImage(q, 0, 0); d.restore();
    };
    put(1, 1); put(-1, 1);
    if (four) { put(1, -1); put(-1, -1); }
  },
  /* ── فاز ۴ هم‌ترازی با Alight Motion ── */
  'sharpen': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    // کانولوشن ۳×۳ روی کادر لایه (تیزکردن: کرنل تقویت مرکز؛
    // لبه: سوبل روی روشنایی، خروجی خاکستری)
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const at = (x, y, c) => src[((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4 + c];
      const lum = (x, y) => at(x, y, 0) * 0.299 + at(x, y, 1) * 0.587 + at(x, y, 2) * 0.114;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  if (!q[o + 3]) continue;
  if (id === 'sharpen') {
    const a = v.amt / 100;
    for (let c = 0; c < 3; c++) q[o + c] = (1 + 4 * a) * at(x, y, c)
      - a * (at(x - 1, y, c) + at(x + 1, y, c) + at(x, y - 1, c) + at(x, y + 1, c));
  } else {
    const gx = -lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1)
      + lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1);
    const gy = -lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1)
      + lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1);
    const m = Math.min(255, Math.hypot(gx, gy) / 4 * (v.amt / 100));
    q[o] = q[o + 1] = q[o + 2] = m;
  }
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'findEdges': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    // کانولوشن ۳×۳ روی کادر لایه (تیزکردن: کرنل تقویت مرکز؛
    // لبه: سوبل روی روشنایی، خروجی خاکستری)
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const at = (x, y, c) => src[((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4 + c];
      const lum = (x, y) => at(x, y, 0) * 0.299 + at(x, y, 1) * 0.587 + at(x, y, 2) * 0.114;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  if (!q[o + 3]) continue;
  if (id === 'sharpen') {
    const a = v.amt / 100;
    for (let c = 0; c < 3; c++) q[o + c] = (1 + 4 * a) * at(x, y, c)
      - a * (at(x - 1, y, c) + at(x + 1, y, c) + at(x, y - 1, c) + at(x, y + 1, c));
  } else {
    const gx = -lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1)
      + lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1);
    const gy = -lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1)
      + lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1);
    const m = Math.min(255, Math.hypot(gx, gy) / 4 * (v.amt / 100));
    q[o] = q[o + 1] = q[o + 2] = m;
  }
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'spinBlur': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box();
    smear(d, 12, (ax, u) => {
      ax.translate(b.cx, b.cy); ax.rotate((v.amt / 100) * 0.6 * (u - 0.5)); ax.translate(-b.cx, -b.cy);
    });
  },
  'vibrance': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = v.amt / 100;
    pixelOp(d, (q, i) => {
      const mx = Math.max(q[i], q[i + 1], q[i + 2]), mn = Math.min(q[i], q[i + 1], q[i + 2]);
      if (mx <= mn) return;
      const sat = (mx - mn) / mx, avg = (q[i] + q[i + 1] + q[i + 2]) / 3, boost = 1 + k * (1 - sat);
      q[i] = avg + (q[i] - avg) * boost; q[i + 1] = avg + (q[i + 1] - avg) * boost; q[i + 2] = avg + (q[i + 2] - avg) * boost;
    });
  },
  'lumaKey': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const lv = v.level / 100, soft = Math.max(0.01, v.soft / 100);
    pixelOp(d, (q, i) => {
      const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
      const fct = v.mode >= 0.5 ? clamp((lv + soft / 2 - l) / soft) : clamp((l - (lv - soft / 2)) / soft);
      q[i + 3] *= fct;
    });
  },
  'wipe': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), p = clamp(v.prog / 100, 0, 1);
    if (p <= 0) return;
    if (p >= 1) { d.drawImage(cur, 0, 0); return; }
    const a0 = (v.ang * Math.PI) / 180, r = Math.hypot(b.fw, b.fh);
    d.save(); d.beginPath(); d.moveTo(b.cx, b.cy);
    d.arc(b.cx, b.cy, r, a0, a0 + p * Math.PI * 2); d.closePath(); d.clip();
    d.drawImage(cur, 0, 0); d.restore();
  },
  /* ── فاز ۶–۷: افکت‌های تازهٔ Alight ── */
  'bulge': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const amt = v.amt / 100, r = Math.max(box().w, box().h) / 2 * (v.r / 100);
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist >= r || dist < 0.5) return [dx, dy];
      const k = Math.max(0.2, 1 - amt * (1 - (dist / r) * (dist / r)));
      return [dx * k, dy * k];
    });
  },
  'fisheye': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const amt = v.amt / 100, r = Math.hypot(box().w, box().h) / 2;
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy), rn = Math.min(1, dist / r);
      const k = 1 + amt * rn * rn * 0.5;
      return [dx * k, dy * k];
    });
  },
  'twirl': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const amt = v.amt / 100 * Math.PI, r = Math.max(box().w, box().h) / 2 * (v.r / 100);
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist >= r) return [dx, dy];
      const a = amt * (1 - dist / r), c = Math.cos(a), s = Math.sin(a);
      return [dx * c - dy * s, dx * s + dy * c];
    });
  },
  'ripple': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const A = v.amp * px, len = Math.max(1, v.len * px), ph = time * v.speed;
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) return [dx, dy];
      const off = Math.sin((dist / len) * Math.PI * 2 - ph) * A;
      return [dx * (1 + off / dist), dy * (1 + off / dist)];
    });
  },
  'noise': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), pat = d.createPattern(noiseTile(), 'repeat');
    if (pat) { d.save(); d.globalAlpha = v.amt / 100; d.globalCompositeOperation = 'overlay'; d.fillStyle = pat; d.fillRect(b.x, b.y, b.w, b.h); d.restore(); }
  },
  'channelShift': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const dx = Math.round(v.dx * px), dy = Math.round(v.dy * px);
      const at = (x, y, c) => src[((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4 + c];
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  if (!q[o + 3]) continue;
  q[o] = at(x - dx, y - dy, 0); q[o + 2] = at(x + dx, y + dy, 2);
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'solarize': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const lv = v.level / 100 * 255;
    pixelOp(d, (q, i) => {
      for (let c = 0; c < 3; c++) if (q[i + c] > lv) q[i + c] = 255 - q[i + c];
    });
  },
  'emboss': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const lum = (x, y) => { const o = ((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4; return src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114; };
      const k = v.amt / 100;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  if (!q[o + 3]) continue;
  const m = Math.max(0, Math.min(255, 128 + (lum(x - 1, y - 1) - lum(x + 1, y + 1)) * k));
  q[o] = q[o + 1] = q[o + 2] = m;
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'tile': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), nx = Math.max(1, Math.round(v.nx)), ny = Math.max(1, Math.round(v.ny));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
      d.drawImage(cur, b.x, b.y, b.w, b.h, b.x + i * b.w / nx, b.y + j * b.h / ny, b.w / nx, b.h / ny);
    d.restore();
  },
  'squeeze': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), k = Math.max(0.1, 1 - v.amt / 100), w2 = b.w * k;
    d.drawImage(cur, b.x, b.y, b.w, b.h, b.cx - w2 / 2, b.y, w2, b.h);
  },
  'clouds': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), sc = Math.max(10, v.scale);
    const tile = noiseTile();
    const tmp = scratch('cloud'), tx = tmp.getContext('2d');
    tx.filter = `blur(${Math.max(1, sc / 4 * px)}px)`;
    tx.drawImage(tile, b.x, b.y, b.w, b.h);
    tx.filter = 'none';
    d.save(); d.globalAlpha = v.amt / 100; d.globalCompositeOperation = 'overlay';
    d.drawImage(tmp, 0, 0); d.restore();
  },
  'checker': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), s = Math.max(2, v.size * px);
    d.save(); d.globalAlpha = v.op / 100; d.fillStyle = '#FFFFFF';
    d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = 0; y * s < b.h; y++) for (let x = 0; x * s < b.w; x++)
      if ((x + y) % 2 === 0) d.fillRect(b.x + x * s, b.y + y * s, s, s);
    d.restore();
  },
  'tiltShift': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), band = b.h * (v.band / 100);
    const blurred = scratch('tilt'), bx2 = blurred.getContext('2d');
    bx2.filter = `blur(${Math.max(0, v.r * px)}px)`; bx2.drawImage(cur, 0, 0); bx2.filter = 'none';
    d.drawImage(cur, 0, 0);
    d.drawImage(blurred, b.x, b.y, b.w, (b.h - band) / 2, b.x, b.y, b.w, (b.h - band) / 2);
    d.drawImage(blurred, b.x, b.y + (b.h + band) / 2, b.w, (b.h - band) / 2, b.x, b.y + (b.h + band) / 2, b.w, (b.h - band) / 2);
  },
  'flipH': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box();
    d.save(); d.translate(b.cx, 0); d.scale(-1, 1); d.translate(-b.cx, 0);
    d.drawImage(cur, 0, 0); d.restore();
  },
  'flipV': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box();
    d.save(); d.translate(0, b.cy); d.scale(1, -1); d.translate(0, -b.cy);
    d.drawImage(cur, 0, 0); d.restore();
  },
  'hueShift': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const glOut = glAdjust(cur, { hue: v.deg });
    if (glOut) { d.drawImage(glOut, 0, 0); return; }
    d.filter = `hue-rotate(${v.deg}deg)`; d.drawImage(cur, 0, 0); d.filter = 'none';
  },
  'invertFx': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    pixelOp(d, (q, i) => { q[i] = 255 - q[i]; q[i + 1] = 255 - q[i + 1]; q[i + 2] = 255 - q[i + 2]; });
  },
  'pinch': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const amt = v.amt / 100, r = Math.max(box().w, box().h) / 2 * (v.r / 100);
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist >= r || dist < 0.5) return [dx, dy];
      const k = 1 + amt * (1 - (dist / r) * (dist / r));
      return [dx * k, dy * k];
    });
  },
  'bend': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const amt = v.amt * px, hh = Math.max(1, box().h / 2);
    warp(d, (dx, dy) => [dx + amt * (1 - (dy / hh) * (dy / hh)), dy]);
  },
  'fractal': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), tile = noiseTile();
    for (const [scale, alpha] of [[1, 0.6], [0.35, 0.4]]) {
      const tmp = scratch('frac'), tx = tmp.getContext('2d');
      tx.filter = `blur(${Math.max(1, v.scale * scale / 4 * px)}px)`;
      tx.drawImage(tile, b.x, b.y, b.w, b.h); tx.filter = 'none';
      d.save(); d.globalAlpha = (v.amt / 100) * alpha; d.globalCompositeOperation = 'overlay';
      d.drawImage(tmp, 0, 0); d.restore();
    }
  },
  'grid': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), s = Math.max(2, v.size * px);
    d.save(); d.globalAlpha = v.op / 100; d.strokeStyle = v.color; d.lineWidth = Math.max(1, px);
    d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let x = b.x; x <= b.x + b.w; x += s) { d.moveTo(x, b.y); d.lineTo(x, b.y + b.h); }
    for (let y = b.y; y <= b.y + b.h; y += s) { d.moveTo(b.x, y); d.lineTo(b.x + b.w, y); }
    d.stroke(); d.restore();
  },
  'matte': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const lv = v.level / 100, soft = Math.max(0.01, v.soft / 100);
    pixelOp(d, (q, i) => {
      const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
      const keep = v.mode >= 0.5 ? clamp((lv + soft / 2 - l) / soft) : clamp((l - (lv - soft / 2)) / soft);
      q[i + 3] *= keep;
    });
  },
  'edgeGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
      const lum = (x, y) => { const o = ((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4; return q[o] * 0.299 + q[o + 1] * 0.587 + q[o + 2] * 0.114; };
      const edge = scratch('edge'), ex = edge.getContext('2d');
      const eimg = ex.createImageData(b.w, b.h), eq = eimg.data;
      const col = v.color || '#E4142A';
      const cr = parseInt(col.slice(1, 3), 16) || 0, cg = parseInt(col.slice(3, 5), 16) || 0, cb = parseInt(col.slice(5, 7), 16) || 0;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const gx = -lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1) + lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1);
  const gy = -lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1) + lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1);
  const m = Math.min(255, Math.hypot(gx, gy) / 4);
  const o = (y * b.w + x) * 4;
  eq[o] = cr; eq[o + 1] = cg; eq[o + 2] = cb; eq[o + 3] = m;
      }
      ex.putImageData(eimg, b.x, b.y);
      d.save(); d.globalCompositeOperation = 'lighter'; d.globalAlpha = Math.min(1, v.amt / 100);
      d.drawImage(edge, 0, 0); d.restore();
    }
  },
  'tilt3d': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), a = (v.ang * Math.PI) / 180, c = Math.max(0.2, Math.cos(a));
    d.save(); d.translate(b.cx, b.cy);
    if (v.axis >= 0.5) { d.transform(1, 0, -Math.sin(a) * 0.4, c, 0, 0); }
    else { d.transform(c, 0, 0, 1, 0, 0); d.transform(1, Math.sin(a) * 0.4, 0, 1, 0, 0); }
    d.translate(-b.cx, -b.cy); d.drawImage(cur, 0, 0); d.restore();
  },
  'flip3d': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), k = Math.cos(time * v.speed * Math.PI * 2);
    d.save(); d.translate(b.cx, b.cy); d.scale(Math.max(0.02, Math.abs(k)) * (k < 0 ? -1 : 1), 1);
    d.translate(-b.cx, -b.cy); d.drawImage(cur, 0, 0); d.restore();
  },
  'sphere': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const amt = v.amt / 100, r = Math.min(box().w, box().h) / 2;
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist >= r || dist < 0.5) return [dx, dy];
      const k = Math.max(0.2, 1 - amt * (1 - (dist / r) * (dist / r)) * 0.7);
      return [dx * k, dy * k];
    });
    const b = box();
    d.save(); d.globalAlpha = 0.25 * amt;
    const g = d.createRadialGradient(b.cx, b.cy, r * 0.3, b.cx, b.cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    d.fillStyle = g; d.beginPath(); d.arc(b.cx, b.cy, r, 0, Math.PI * 2); d.fill(); d.restore();
  },
  'temperature': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = v.amt / 100 * 40;
    pixelOp(d, (q, i) => { q[i] = Math.max(0, Math.min(255, q[i] + k)); q[i + 2] = Math.max(0, Math.min(255, q[i + 2] - k)); });
  },
  'exposure': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = 1 + v.amt / 100;
    pixelOp(d, (q, i) => { q[i] *= k; q[i + 1] *= k; q[i + 2] *= k; });
  },
  'clarity': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    // تیزکردن ملایم + کنتراست موضعی: کرنل تقویت مرکز با ضریب کم
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const at = (x, y, c) => src[((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4 + c];
      const a = (v.amt / 100) * 0.5;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  if (!q[o + 3]) continue;
  for (let c = 0; c < 3; c++) q[o + c] = (1 + 4 * a) * at(x, y, c) - a * (at(x - 1, y, c) + at(x + 1, y, c) + at(x, y - 1, c) + at(x, y + 1, c));
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'perspective': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), k = v.amt / 100, band = Math.max(2, Math.round(2 * px));
    for (let y = b.y; y < b.y + b.h; y += band) {
      const u = (y - b.y) / Math.max(1, b.h);
      const wScale = 1 - k * (0.5 - u) * 2 * 0.5;
      const w2 = b.w * Math.max(0.2, wScale);
      const x2 = b.cx - w2 / 2;
      d.drawImage(cur, b.x, y, b.w, band, x2, y, w2, band);
    }
  },
  'levels': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const bl = v.black / 100, wh = Math.max(bl + 0.01, v.white / 100), gm = v.gamma / 100;
    pixelOp(d, (q, i) => {
      for (let c = 0; c < 3; c++) {
  let u = (q[i + c] / 255 - bl) / (wh - bl);
  u = Math.max(0, Math.min(1, u));
  q[i + c] = Math.pow(u, 1 / gm) * 255;
      }
    });
  },
  'feather': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    // تاری آلفا با میانگین ۳×۳، چند بار تکرار بر حسب شعاع
    d.drawImage(cur, 0, 0);
    const b = box(), reps = Math.max(1, Math.round(v.r / 20));
    for (let r = 0; r < reps; r++) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const at = (x, y) => src[((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4 + 3];
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  q[o + 3] = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) + at(x, y) * 4) / 8;
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'sepiaFx': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = v.amt / 100;
    pixelOp(d, (q, i) => {
      const r = q[i], g = q[i + 1], b = q[i + 2];
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      q[i] = r + (sr - r) * k; q[i + 1] = g + (sg - g) * k; q[i + 2] = b + (sb - b) * k;
    });
  },
  'vintage': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = v.amt / 100;
    pixelOp(d, (q, i) => {
      const r = q[i], g = q[i + 1], b = q[i + 2];
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      q[i] = r + (sr - r) * k * 0.7; q[i + 1] = g + (sg - g) * k * 0.7; q[i + 2] = b + (sb - b) * k * 0.7;
    });
    const b = box();
    d.save(); d.globalAlpha = 0.35 * k;
    const g2 = d.createRadialGradient(b.cx, b.cy, Math.min(b.w, b.h) * 0.3, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.8)');
    d.fillStyle = g2; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'neon': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
      const lum = (x, y) => { const o = ((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4; return q[o] * 0.299 + q[o + 1] * 0.587 + q[o + 2] * 0.114; };
      const edge = scratch('neon'), ex = edge.getContext('2d');
      const eimg = ex.createImageData(b.w, b.h), eq = eimg.data;
      const col = v.color || '#FF2D78';
      const cr = parseInt(col.slice(1, 3), 16) || 0, cg = parseInt(col.slice(3, 5), 16) || 0, cb = parseInt(col.slice(5, 7), 16) || 0;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const gx = -lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1) + lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1);
  const gy = -lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1) + lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1);
  const m = Math.min(255, Math.hypot(gx, gy) / 4);
  const o = (y * b.w + x) * 4;
  eq[o] = cr; eq[o + 1] = cg; eq[o + 2] = cb; eq[o + 3] = m;
      }
      ex.putImageData(eimg, b.x, b.y);
      // بقیه را تیره کن، بعد لبه‌های نئونی را با نور اضافه کن
      d.save(); d.globalAlpha = 0.45; d.fillStyle = '#000000'; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
      d.save(); d.globalCompositeOperation = 'lighter'; d.globalAlpha = Math.min(1, v.amt / 100);
      d.drawImage(edge, 0, 0); d.restore();
    }
  },
  'innerShadow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    const tmp = scratch('insh'), tx = tmp.getContext('2d');
    tx.drawImage(cur, 0, 0);
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = v.color; tx.fillRect(0, 0, W, H);
    tx.filter = `blur(${Math.max(0.5, v.r * px)}px)`; tx.drawImage(tmp, 0, 0); tx.filter = 'none';
    d.save(); d.globalAlpha = v.op / 100; d.globalCompositeOperation = 'source-atop';
    d.drawImage(tmp, 0, 0); d.restore();
  },
  'bevel': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const lum = (x, y) => { const o = ((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4; return src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114; };
      const a = (v.ang * Math.PI) / 180, dx = Math.round(Math.cos(a)), dy = Math.round(Math.sin(a));
      const k = v.amt / 100;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  if (!q[o + 3]) continue;
  const diff = (lum(x + dx, y + dy) - lum(x - dx, y - dy)) * k;
  q[o] += diff; q[o + 1] += diff; q[o + 2] += diff;
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'oilPaint': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.filter = `blur(${Math.max(0.5, (v.amt / 100) * 2 * px)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
    pixelOp(d, (q, i) => {
      const lv = 6;
      q[i] = Math.round(q[i] / 255 * lv) / lv * 255;
      q[i + 1] = Math.round(q[i + 1] / 255 * lv) / lv * 255;
      q[i + 2] = Math.round(q[i + 2] / 255 * lv) / lv * 255;
    });
  },
  'watercolor': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.filter = `blur(${Math.max(0.5, (v.amt / 100) * 1.5 * px)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
    pixelOp(d, (q, i) => {
      const avg = (q[i] + q[i + 1] + q[i + 2]) / 3, boost = 1 + (v.amt / 100) * 0.5;
      q[i] = avg + (q[i] - avg) * boost; q[i + 1] = avg + (q[i + 1] - avg) * boost; q[i + 2] = avg + (q[i + 2] - avg) * boost;
    });
  },
  'pencil': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
      const lum = (x, y) => { const o = ((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4; return q[o] * 0.299 + q[o + 1] * 0.587 + q[o + 2] * 0.114; };
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const gx = -lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1) + lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1);
  const gy = -lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1) + lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1);
  const m = Math.min(255, Math.hypot(gx, gy) / 4 * (v.amt / 100));
  const o = (y * b.w + x) * 4;
  q[o] = q[o + 1] = q[o + 2] = 255 - m;
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'comic': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    pixelOp(d, (q, i) => {
      const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
      const c = l > v.level / 100 ? 255 : 0;
      q[i] = q[i + 1] = q[i + 2] = c;
    });
  },
  'infrared': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    pixelOp(d, (q, i) => { const r = q[i]; q[i] = q[i + 1]; q[i + 1] = r; q[i + 2] = q[i + 2] * 0.5; });
  },
  'nightVision': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = v.amt / 100;
    pixelOp(d, (q, i) => {
      const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114);
      q[i] = l * 0.2 * (1 + k); q[i + 1] = Math.min(255, l * (1 + k)); q[i + 2] = l * 0.2;
    });
    const b = box(), pat = d.createPattern(noiseTile(), 'repeat');
    if (pat) { d.save(); d.globalAlpha = 0.15 * k; d.fillStyle = pat; d.fillRect(b.x, b.y, b.w, b.h); d.restore(); }
  },
  'thermal': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const stops = [[0, 0, 0, 0], [0.33, 128, 0, 0], [0.66, 255, 128, 0], [1, 255, 255, 220]];
    pixelOp(d, (q, i) => {
      const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
      let s = stops[0];
      for (let j = 1; j < stops.length; j++) if (l >= stops[j - 1][0] && l <= stops[j][0]) { s = stops[j - 1]; const t = (l - s[0]) / (stops[j][0] - s[0]); q[i] = s[1] + (stops[j][1] - s[1]) * t; q[i + 1] = s[2] + (stops[j][2] - s[2]) * t; q[i + 2] = s[3] + (stops[j][3] - s[3]) * t; return; }
      if (l >= 1) { q[i] = 255; q[i + 1] = 255; q[i + 2] = 220; }
    });
  },
  'tritone': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const hex = c => [parseInt(c.slice(1, 3), 16) || 0, parseInt(c.slice(3, 5), 16) || 0, parseInt(c.slice(5, 7), 16) || 0];
    const c1 = hex(v.c1), c2 = hex(v.c2), c3 = hex(v.c3);
    pixelOp(d, (q, i) => {
      const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
      let a, b, t;
      if (l < 0.5) { a = c1; b = c2; t = l * 2; } else { a = c2; b = c3; t = (l - 0.5) * 2; }
      q[i] = a[0] + (b[0] - a[0]) * t; q[i + 1] = a[1] + (b[1] - a[1]) * t; q[i + 2] = a[2] + (b[2] - a[2]) * t;
    });
  },
  /* فاز ۱۶ (موازی) — رندر افکت‌هایی که فقط در schema بودند */
  'mosaic': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), s = Math.max(2, Math.round(v.size * px));
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
      for (let y = 0; y < b.h; y += s) for (let x = 0; x < b.w; x += s) {
  const cx = Math.min(b.w - 1, x + Math.floor(s / 2)), cy = Math.min(b.h - 1, y + Math.floor(s / 2));
  const co = (cy * b.w + cx) * 4;
  for (let yy = y; yy < Math.min(b.h, y + s); yy++) for (let xx = x; xx < Math.min(b.w, x + s); xx++) {
    const o = (yy * b.w + xx) * 4;
    q[o] = q[co]; q[o + 1] = q[co + 1]; q[o + 2] = q[co + 2];
  }
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'slitScan': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), A = v.amt * px;
    if (v.dir >= 0.5) {
      for (let x = b.x; x < b.x + b.w; x += Math.max(2, Math.round(2 * px))) {
  const dy = Math.sin((x / Math.max(1, b.w)) * Math.PI * 4 + time) * A;
  d.drawImage(cur, x, b.y, Math.max(2, Math.round(2 * px)), b.h, x, b.y + dy, Math.max(2, Math.round(2 * px)), b.h);
      }
    } else {
      for (let y = b.y; y < b.y + b.h; y += Math.max(2, Math.round(2 * px))) {
  const dx = Math.sin((y / Math.max(1, b.h)) * Math.PI * 4 + time) * A;
  d.drawImage(cur, b.x, y, b.w, Math.max(2, Math.round(2 * px)), b.x + dx, y, b.w, Math.max(2, Math.round(2 * px)));
      }
    }
  },
  'crossProcess': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = v.amt / 100;
    pixelOp(d, (q, i) => {
      const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
      if (l < 0.5) q[i + 2] = Math.min(255, q[i + 2] + (0.5 - l) * 80 * k);
      else q[i] = Math.min(255, q[i] + (l - 0.5) * 80 * k);
    });
  },
  'lensFlare': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), col = v.color || '#FFD36B';
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100);
    const g = d.createRadialGradient(b.cx, b.cy - b.h * 0.2, 0, b.cx, b.cy - b.h * 0.2, Math.min(b.w, b.h) * 0.4);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g; d.beginPath(); d.arc(b.cx, b.cy - b.h * 0.2, Math.min(b.w, b.h) * 0.4, 0, Math.PI * 2); d.fill();
    d.restore();
  },
  'rain': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt), a = (v.ang * Math.PI) / 180;
    d.save(); d.strokeStyle = 'rgba(200,220,255,0.5)'; d.lineWidth = Math.max(1, px);
    d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * (b.w + 100));
      const fy = b.y + (((h2 - Math.floor(h2)) * b.h + time * v.speed * px) % (b.h + 40)) - 20;
      const len = 18 * px;
      d.moveTo(fx, fy); d.lineTo(fx + Math.sin(a) * len, fy + Math.cos(a) * len);
    }
    d.stroke(); d.restore();
  },
  'surfaceBlur': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    // تاری + ترکیب با لبه‌ها: نسخهٔ سادهٔ تاری حفظ‌کنندهٔ لبه
    const tmp = scratch('surf'), tx = tmp.getContext('2d');
    tx.filter = `blur(${Math.max(0.5, v.r * px)}px)`; tx.drawImage(cur, 0, 0); tx.filter = 'none';
    d.drawImage(cur, 0, 0);
    d.save(); d.globalAlpha = 0.6; d.drawImage(tmp, 0, 0); d.restore();
  },
  'echo': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), n = Math.max(1, Math.round(v.n));
    for (let i = n; i >= 1; i--) {
      d.save(); d.globalAlpha = 0.35 * (1 - i / (n + 1));
      d.drawImage(cur, b.x - v.amt * px * i * 0.5, b.y - v.amt * px * i * 0.2, b.w, b.h);
      d.restore();
    }
    d.drawImage(cur, 0, 0);
  },
  'smear': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), a = (v.ang * Math.PI) / 180, A = v.amt * px;
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const u = i / steps;
      d.save(); d.globalAlpha = 0.25;
      d.drawImage(cur, b.x + Math.cos(a) * A * (u - 0.5), b.y + Math.sin(a) * A * (u - 0.5), b.w, b.h);
      d.restore();
    }
    d.drawImage(cur, 0, 0);
  },
  'pageCurl': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), k = v.amt / 100, curlW = b.w * 0.35 * k;
    d.drawImage(cur, 0, 0);
    // قسمت تا‌خورده: فشرده‌شده با سایه
    d.save(); d.beginPath(); d.rect(b.x + b.w - curlW, b.y, curlW, b.h); d.clip();
    d.translate(b.x + b.w, b.cy); d.scale(Math.max(0.15, 1 - k * 0.7), 1); d.translate(-(b.x + b.w), -b.cy);
    d.globalAlpha = 0.85; d.drawImage(cur, 0, 0);
    const g = d.createLinearGradient(b.x + b.w - curlW, 0, b.x + b.w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    d.fillStyle = g; d.fillRect(b.x + b.w - curlW, b.y, curlW, b.h); d.restore();
  },
  'cubeRotate': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), ph = time * v.speed * Math.PI * 2, k = Math.cos(ph);
    const frontW = b.w * Math.max(0.1, Math.abs(k));
    const sideW = b.w * Math.abs(Math.sin(ph)) * 0.35;
    d.save(); d.beginPath(); d.rect(b.x, b.y, frontW, b.h); d.clip();
    d.drawImage(cur, b.x, b.y, b.w, b.h); d.restore();
    // وجه کناری: نوار تیرهٔ مورب
    d.save(); d.fillStyle = 'rgba(0,0,0,0.45)';
    d.beginPath();
    const sx = k >= 0 ? b.x + frontW : b.x;
    d.moveTo(sx, b.y); d.lineTo(sx + sideW * (k >= 0 ? 1 : -1), b.y + b.h * 0.08);
    d.lineTo(sx + sideW * (k >= 0 ? 1 : -1), b.y + b.h * 0.92); d.lineTo(sx, b.y + b.h);
    d.closePath(); d.fill(); d.restore();
  },
  'vortex': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), r = Math.min(b.w, b.h) / 2, A = v.amt / 100 * 3;
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist >= r || dist < 0.5) return [dx, dy];
      const ang = A * (1 - dist / r);
      const c = Math.cos(ang), s = Math.sin(ang);
      return [dx * c - dy * s, dx * s + dy * c];
    });
  },
  'mandala': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), n = Math.max(2, Math.round(v.n));
    for (let i = 0; i < n; i++) {
      d.save(); d.translate(b.cx, b.cy); d.rotate((i / n) * Math.PI * 2); d.translate(-b.cx, -b.cy);
      d.globalAlpha = 1 / Math.max(1, n / 3); d.drawImage(cur, 0, 0); d.restore();
    }
  },
  'pixelSort': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), bs = Math.max(8, Math.round(v.size));
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
      const lum = o => q[o] * 0.299 + q[o + 1] * 0.587 + q[o + 2] * 0.114;
      for (let y = 0; y < b.h; y++) for (let x0 = 0; x0 < b.w; x0 += bs) {
  const x1 = Math.min(b.w, x0 + bs);
  const idx = [];
  for (let x = x0; x < x1; x++) idx.push((y * b.w + x) * 4);
  const vals = idx.map(o => [lum(o), q[o], q[o + 1], q[o + 2], q[o + 3]]);
  vals.sort((a, c) => a[0] - c[0]);
  idx.forEach((o, j) => { q[o] = vals[j][1]; q[o + 1] = vals[j][2]; q[o + 2] = vals[j][3]; q[o + 3] = vals[j][4]; });
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'dither': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    if (b.w > 1 && b.h > 1) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  const l = q[o] * 0.299 + q[o + 1] * 0.587 + q[o + 2] * 0.114;
  const c = l > bayer[y % 4][x % 4] * 16 ? 255 : 0;
  q[o] = q[o + 1] = q[o + 2] = c;
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'haze': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.filter = `blur(${Math.max(0.5, (v.amt / 100) * 3 * px)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35; d.fillStyle = '#FFFFFF';
    const b = box(); d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'silhouette': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    pixelOp(d, (q, i) => {
      const col = v.color || '#111111';
      q[i] = parseInt(col.slice(1, 3), 16) || 0;
      q[i + 1] = parseInt(col.slice(3, 5), 16) || 0;
      q[i + 2] = parseInt(col.slice(5, 7), 16) || 0;
    });
  },
  'xray': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    pixelOp(d, (q, i) => {
      const l = q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114;
      q[i] = q[i + 1] = q[i + 2] = 255 - l;
    });
  },
  'bloom': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const tmp = scratch('bloom'), tx = tmp.getContext('2d');
    tx.filter = `blur(${Math.max(1, (v.amt / 100) * 4 * px)}px)`; tx.drawImage(cur, 0, 0); tx.filter = 'none';
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100); d.globalCompositeOperation = 'lighter'; d.drawImage(tmp, 0, 0); d.restore();
  },
  'starburst': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.max(4, Math.round(v.n)), R = Math.hypot(b.w, b.h) / 2;
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100) * 0.7; d.strokeStyle = '#FFFFFF'; d.lineWidth = Math.max(1, px);
    d.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      d.moveTo(b.cx, b.cy); d.lineTo(b.cx + Math.cos(a) * R, b.cy + Math.sin(a) * R);
    }
    d.stroke(); d.restore();
  },
  'snow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt);
    d.save(); d.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w);
      const fy = b.y + (((h2 - Math.floor(h2)) * b.h + time * v.speed * px * 0.5) % (b.h + 20)) - 10;
      const r = 1 + ((h1 - Math.floor(h1)) * 2) * px;
      d.beginPath(); d.arc(fx, fy, Math.max(1, r), 0, Math.PI * 2); d.fill();
    }
    d.restore();
  },
  'confetti': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt), cols = ['#E4142A', '#FFD84D', '#4DD8FF', '#7CFF6B', '#FF7AD9'];
    d.save();
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w);
      const fy = b.y + (((h2 - Math.floor(h2)) * b.h + time * v.speed * px) % (b.h + 30)) - 15;
      d.fillStyle = cols[i % cols.length];
      d.save(); d.translate(fx, fy); d.rotate(time * 2 + i); d.fillRect(-4 * px, -2 * px, 8 * px, 4 * px); d.restore();
    }
    d.restore();
  },
  'fireflies': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt);
    d.save();
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.cx + Math.sin(time * 0.7 + i * 1.3) * b.w * 0.4 * ((h1 - Math.floor(h1)) + 0.2);
      const fy = b.cy + Math.cos(time * 0.9 + i * 0.7) * b.h * 0.4 * ((h2 - Math.floor(h2)) + 0.2);
      const a = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + i));
      d.fillStyle = `rgba(255,220,120,${a})`;
      d.beginPath(); d.arc(fx, fy, 3 * px, 0, Math.PI * 2); d.fill();
    }
    d.restore();
  },
  'bokeh': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = 14;
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100) * 0.5;
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w), fy = b.y + ((h2 - Math.floor(h2)) * b.h);
      const r = (10 + ((h1 - Math.floor(h1)) * 30)) * px;
      const g = d.createRadialGradient(fx, fy, 0, fx, fy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      d.fillStyle = g; d.beginPath(); d.arc(fx, fy, r, 0, Math.PI * 2); d.fill();
    }
    d.restore();
  },
  'halo': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), r = Math.min(b.w, b.h) * 0.45;
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100) * 0.6;
    const g = d.createRadialGradient(b.cx, b.cy, r * 0.7, b.cx, b.cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = g; d.beginPath(); d.arc(b.cx, b.cy, r, 0, Math.PI * 2); d.fill(); d.restore();
  },
  'prism': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.4; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
    ['#FF0000', '#FF7A00', '#FFD84D', '#00C853', '#0091FF', '#7C4DFF'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'aurora': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35;
    for (let i = 0; i < 3; i++) {
      const cols = ['#00FF88', '#0091FF', '#FF7AD9'][i];
      d.fillStyle = cols; d.beginPath();
      d.moveTo(b.x, b.y + b.h * (0.3 + i * 0.15));
      for (let x = b.x; x <= b.x + b.w; x += Math.max(4, b.w / 40)) {
  d.lineTo(x, b.y + b.h * (0.3 + i * 0.15) + Math.sin(x / b.w * Math.PI * 3 + time + i * 2) * b.h * 0.08);
      }
      d.lineTo(b.x + b.w, b.y + b.h * (0.5 + i * 0.15)); d.lineTo(b.x, b.y + b.h * (0.5 + i * 0.15));
      d.closePath(); d.fill();
    }
    d.restore();
  },
  'tunnel': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), n = Math.max(1, Math.round(v.n));
    for (let i = n; i >= 0; i--) {
      const s = 1 - (i / (n + 1)) * 0.8;
      d.save(); d.globalAlpha = i === 0 ? 1 : 0.5;
      d.drawImage(cur, b.cx - b.w * s / 2, b.cy - b.h * s / 2, b.w * s, b.h * s);
      d.restore();
    }
  },
  'infiniteZoom': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), u = (time * v.speed) % 1, s = 1 + u * 0.6;
    d.save(); d.globalAlpha = 1 - u * 0.5;
    d.drawImage(cur, b.cx - b.w * s / 2, b.cy - b.h * s / 2, b.w * s, b.h * s);
    d.restore();
  },
  'dataMosh': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), bs = 32, step = Math.floor(time * 2);
    d.drawImage(cur, 0, 0);
    for (let y = b.y; y < b.y + b.h; y += bs) for (let x = b.x; x < b.x + b.w; x += bs) {
      const h = Math.sin((x / bs) * 12.9898 + (y / bs) * 78.233 + step) * 43758.5453;
      const off = (h - Math.floor(h) - 0.5) * (v.amt / 100) * bs * 2;
      if (Math.abs(off) > 2) d.drawImage(cur, x, y, bs, bs, x + off, y, bs, bs);
    }
  },
  'inkBleed': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.filter = `blur(${Math.max(0.5, (v.amt / 100) * 2 * px)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
    pixelOp(d, (q, i) => { const l = q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114; const k = 0.7 + (l / 255) * 0.3; q[i] *= k; q[i + 1] *= k; q[i + 2] *= k; });
  },
  'paperGrain': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    pixelOp(d, (q, i) => { q[i] = Math.min(255, q[i] * 1.05 + 10); q[i + 1] = Math.min(255, q[i + 1] * 1.02 + 5); });
    const b = box(), pat = d.createPattern(noiseTile(), 'repeat');
    if (pat) { d.save(); d.globalAlpha = (v.amt / 100) * 0.12; d.fillStyle = pat; d.fillRect(b.x, b.y, b.w, b.h); d.restore(); }
  },
  'lightSweep': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), band = b.w * 0.3, u = (time * v.speed) % 1, x0 = b.x - band + u * (b.w + band * 2);
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100) * 0.6; d.globalCompositeOperation = 'lighter';
    const g = d.createLinearGradient(x0, 0, x0 + band, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = g; d.fillRect(x0, b.y, band, b.h); d.restore();
  },
  'spinZoom': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), s = 1 + Math.sin(time * 2) * (v.amt / 100) * 0.3;
    d.save(); d.translate(b.cx, b.cy); d.rotate(time * v.speed * Math.PI * 2); d.scale(s, s); d.translate(-b.cx, -b.cy);
    d.drawImage(cur, 0, 0); d.restore();
  },
  'colorPop': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const col = v.color || '#E4142A';
    const cr = parseInt(col.slice(1, 3), 16) || 0, cg = parseInt(col.slice(3, 5), 16) || 0, cb = parseInt(col.slice(5, 7), 16) || 0;
    pixelOp(d, (q, i) => {
      const dist = Math.hypot(q[i] - cr, q[i + 1] - cg, q[i + 2] - cb);
      if (dist > v.tol * 2.55) { const l = q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114; q[i] = q[i + 1] = q[i + 2] = l; }
    });
  },
  'dream': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const tmp = scratch('dream'), tx = tmp.getContext('2d');
    tx.filter = `blur(${Math.max(1, (v.amt / 100) * 3 * px)}px)`; tx.drawImage(cur, 0, 0); tx.filter = 'none';
    d.drawImage(cur, 0, 0);
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5; d.drawImage(tmp, 0, 0); d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.15; d.fillStyle = '#FFFFFF';
    const b = box(); d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'noir': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    pixelOp(d, (q, i) => {
      let l = q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114;
      l = Math.max(0, Math.min(255, (l - 128) * (1 + v.amt / 100) + 128));
      q[i] = q[i + 1] = q[i + 2] = l;
    });
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.4;
    const g = d.createRadialGradient(b.cx, b.cy, Math.min(b.w, b.h) * 0.3, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'solarFlare': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), pulse = 0.7 + 0.3 * Math.sin(time * 3), r = Math.min(b.w, b.h) * 0.4 * pulse;
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100);
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, r);
    g.addColorStop(0, 'rgba(255,240,180,0.9)'); g.addColorStop(0.4, 'rgba(255,200,80,0.4)'); g.addColorStop(1, 'rgba(255,200,80,0)');
    d.fillStyle = g; d.beginPath(); d.arc(b.cx, b.cy, r, 0, Math.PI * 2); d.fill(); d.restore();
  },
  'rainbowShift': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.filter = `hue-rotate(${((time * v.speed * 360) % 360).toFixed(1)}deg)`; d.drawImage(cur, 0, 0); d.filter = 'none';
  },
  'glowPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const tmp = scratch('glowP'), tx = tmp.getContext('2d');
    tx.filter = 'blur(6px)'; tx.drawImage(cur, 0, 0); tx.filter = 'none';
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100) * (0.5 + 0.5 * Math.abs(Math.sin(time * 2))); d.globalCompositeOperation = 'lighter'; d.drawImage(tmp, 0, 0); d.restore();
  },
  'softFocus': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const tmp = scratch('softF'), tx = tmp.getContext('2d');
    tx.filter = `blur(${Math.max(1, (v.amt / 100) * 4 * px)}px)`; tx.drawImage(cur, 0, 0); tx.filter = 'none';
    d.drawImage(cur, 0, 0);
    d.save(); d.globalAlpha = 0.5; d.drawImage(tmp, 0, 0); d.restore();
  },
  'anaglyph': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), off = Math.round(v.amt * px);
    if (b.w > 4 && b.h > 1) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const at = (x, y, c) => src[((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4 + c];
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  q[o] = at(x - off, y, 0); q[o + 1] = at(x + off, y, 1); q[o + 2] = at(x + off, y, 2);
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'rippleRing': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), maxR = Math.hypot(b.w, b.h) / 2;
    d.save(); d.strokeStyle = 'rgba(255,255,255,0.6)'; d.lineWidth = Math.max(1, px);
    for (let i = 0; i < 5; i++) {
      const u = ((time * v.speed + i / 5) % 1);
      d.globalAlpha = (1 - u) * Math.min(1, v.amt / 100);
      d.beginPath(); d.arc(b.cx, b.cy, u * maxR, 0, Math.PI * 2); d.stroke();
    }
    d.restore();
  },
  'gridWarp': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), step = 40 * px, A = v.amt * px * 0.5;
    d.save(); d.strokeStyle = 'rgba(255,255,255,0.35)'; d.lineWidth = Math.max(1, px * 0.5);
    d.beginPath();
    for (let x = b.x; x <= b.x + b.w; x += step) {
      d.moveTo(x, b.y);
      for (let y = b.y; y <= b.y + b.h; y += step / 2) d.lineTo(x + Math.sin(y * 0.02 + time) * A, y);
    }
    for (let y = b.y; y <= b.y + b.h; y += step) {
      d.moveTo(b.x, y);
      for (let x = b.x; x <= b.x + b.w; x += step / 2) d.lineTo(x, y + Math.sin(x * 0.02 + time) * A);
    }
    d.stroke(); d.restore();
  },
  'scanSweep': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), u = (time * v.speed) % 1, y0 = b.y + u * b.h, band = b.h * 0.1;
    d.save();
    const g = d.createLinearGradient(0, y0 - band, 0, y0 + band);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = g; d.fillRect(b.x, y0 - band, b.w, band * 2); d.restore();
  },
  'flicker': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const h = Math.sin(Math.floor(time * 24) * 12.9898) * 43758.5453;
    const k = 1 + ((h - Math.floor(h)) - 0.5) * (v.amt / 100) * 0.6;
    pixelOp(d, (q, i) => { q[i] *= k; q[i + 1] *= k; q[i + 2] *= k; });
  },
  'chromaticPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), off = (1 + Math.sin(time * 4)) * 0.5 * v.amt * px * 0.5;
    if (b.w > 4 && b.h > 1) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const at = (x, y, c) => src[((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4 + c];
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  q[o] = at(x - Math.round(off), y, 0); q[o + 2] = at(x + Math.round(off), y, 2);
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'heatHaze': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    warp(d, (dx, dy) => [dx + Math.sin(dy * 0.05 + time * 3) * v.amt * px * 0.3, dy]);
  },
  'liquid': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    warp(d, (dx, dy) => [
      dx + Math.sin(dy * 0.03 + time * 2) * v.amt * px * 0.3,
      dy + Math.cos(dx * 0.03 + time * 2) * v.amt * px * 0.3]);
  },
  'shatter': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), bs = 48;
    d.drawImage(cur, 0, 0);
    for (let y = b.y; y < b.y + b.h; y += bs) for (let x = b.x; x < b.x + b.w; x += bs) {
      const h = Math.sin((x / bs) * 12.9898 + (y / bs) * 78.233) * 43758.5453;
      const drop = ((h - Math.floor(h)) * b.h + time * v.speed * 200) % (b.h + bs);
      const dy = drop * (v.amt / 100);
      if (dy > 4) d.drawImage(cur, x, y, bs, bs, x, y + dy, bs, bs);
    }
  },
  'shear': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), k = Math.tan((v.amt * Math.PI) / 180);
    d.save(); d.translate(b.cx, b.cy); d.transform(1, 0, k, 1, 0, 0); d.translate(-b.cx, -b.cy);
    d.drawImage(cur, 0, 0); d.restore();
  },
  'cylinder': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), r = b.w / 2;
    warp(d, (dx, dy) => {
      const u = dx / r;
      if (Math.abs(u) >= 1) return [dx, dy];
      const k = 1 - (v.amt / 100) * 0.5 * (1 - Math.cos(u * Math.PI / 2));
      return [dx * k, dy];
    });
  },
  'marble': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 1 && b.h > 1) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  const m = Math.sin(x * 0.05 + Math.sin(y * 0.05) * 2) * 0.5 + 0.5;
  const k = 1 - (v.amt / 100) * 0.3 * m;
  q[o] *= k; q[o + 1] *= k; q[o + 2] *= (1 - (v.amt / 100) * 0.15 * m);
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'rowShift': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), band = 8;
    d.drawImage(cur, 0, 0);
    const step = Math.floor(time * 8);
    for (let y = b.y; y < b.y + b.h; y += band) {
      const h = Math.sin((y / band) * 12.9898 + step) * 43758.5453;
      const off = (h - Math.floor(h) - 0.5) * (v.amt / 100) * b.w * 0.3;
      if (Math.abs(off) > 2) d.drawImage(cur, b.x, y, b.w, band, b.x + off, y, b.w, band);
    }
  },
  'lightRays': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.max(4, Math.round(v.n)), R = Math.hypot(b.w, b.h) / 2, rot = time * v.speed;
    d.save(); d.globalAlpha = 0.35; d.strokeStyle = '#FFFFFF'; d.lineWidth = Math.max(1, px);
    d.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rot;
      d.moveTo(b.cx, b.cy); d.lineTo(b.cx + Math.cos(a) * R, b.cy + Math.sin(a) * R);
    }
    d.stroke(); d.restore();
  },
  'pixelWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), bs = 16;
    d.drawImage(cur, 0, 0);
    for (let x = b.x; x < b.x + b.w; x += bs) {
      const dy = Math.sin(x * 0.02 + time * 3) * v.amt * px * 0.5;
      d.drawImage(cur, x, b.y, bs, b.h, x, b.y + dy, bs, b.h);
    }
  },
  'electric': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), step = Math.floor(time * 6);
    d.save(); d.strokeStyle = 'rgba(200,230,255,0.9)'; d.lineWidth = Math.max(1, 2 * px); d.globalAlpha = Math.min(1, v.amt / 100);
    let x = b.cx;
    d.beginPath(); d.moveTo(x, b.y);
    for (let y = b.y; y < b.y + b.h; y += Math.max(8, b.h / 12)) {
      const h = Math.sin((y / 10) * 12.9898 + step) * 43758.5453;
      x += ((h - Math.floor(h)) - 0.5) * b.w * 0.15;
      d.lineTo(x, y);
    }
    d.stroke(); d.restore();
  },
  'smoke': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.25;
    for (let i = 0; i < 6; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w + time * 10 * px) % b.w;
      const fy = b.y + ((h2 - Math.floor(h2)) * b.h);
      const r = (30 + ((h1 - Math.floor(h1)) * 60)) * px;
      const g = d.createRadialGradient(fx, fy, 0, fx, fy, r);
      g.addColorStop(0, 'rgba(200,200,200,0.5)'); g.addColorStop(1, 'rgba(200,200,200,0)');
      d.fillStyle = g; d.beginPath(); d.arc(fx, fy, r, 0, Math.PI * 2); d.fill();
    }
    d.restore();
  },
  'dust': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt);
    d.save(); d.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w + Math.sin(time + i) * 20 * px) % b.w;
      const fy = b.y + ((h2 - Math.floor(h2)) * b.h + Math.cos(time * 0.7 + i) * 15 * px) % b.h;
      d.fillRect(fx, fy, Math.max(1, px), Math.max(1, px));
    }
    d.restore();
  },
  'colorBands': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), cols = ['#E4142A', '#FFD84D', '#4DD8FF', '#7CFF6B'];
    d.save(); d.globalAlpha = (v.amt / 100) * 0.25;
    for (let i = 0; i < 4; i++) {
      d.fillStyle = cols[(i + Math.floor(time)) % cols.length];
      d.fillRect(b.x, b.y + (i / 4) * b.h, b.w, b.h / 4);
    }
    d.restore();
  },
  'vhsTracking': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), u = (time * 0.5) % 1, y0 = b.y + u * b.h, band = Math.max(4, b.h * 0.08);
    const off = Math.sin(Math.floor(time * 4) * 12.9898) * 20 * px * (v.amt / 100);
    d.drawImage(cur, b.x, y0, b.w, band, b.x + off, y0, b.w, band);
    d.save(); d.fillStyle = 'rgba(255,255,255,0.4)'; d.fillRect(b.x, y0, b.w, Math.max(1, px)); d.restore();
  },
  'oldFilm': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = v.amt / 100;
    pixelOp(d, (q, i) => {
      const r = q[i], g = q[i + 1], b = q[i + 2];
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      q[i] = r + (sr - r) * k * 0.7; q[i + 1] = g + (sg - g) * k * 0.7; q[i + 2] = b + (sb - b) * k * 0.7;
    });
    const b = box();
    d.save(); d.globalAlpha = k * 0.5; d.fillStyle = '#FFFFFF';
    for (let i = 0; i < 3; i++) {
      const h = Math.sin(i * 12.9898 + Math.floor(time * 2)) * 43758.5453;
      const sx = b.x + ((h - Math.floor(h)) * b.w);
      d.fillRect(sx, b.y, Math.max(1, px), b.h);
    }
    d.restore();
  },
  'neonSign': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const tmp = scratch('neonS'), tx = tmp.getContext('2d');
    tx.filter = 'blur(8px)'; tx.drawImage(cur, 0, 0); tx.filter = 'none';
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = v.color || '#FF2D78'; tx.fillRect(0, 0, W, H);
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100); d.globalCompositeOperation = 'lighter'; d.drawImage(tmp, 0, 0); d.restore();
  },
  'prismShift': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), off = Math.round(v.amt * px * 0.3);
    if (b.w > 4 && b.h > 1) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const at = (x, y, c) => src[((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4 + c];
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  q[o] = at(x - off, y, 0); q[o + 2] = at(x + off, y, 2);
      }
      d.putImageData(img, b.x, b.y);
    }
    d.save(); d.globalAlpha = (v.amt / 100) * 0.25; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
    ['#FF0000', '#FFD84D', '#00C853', '#0091FF'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'flash': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), a = (0.5 + 0.5 * Math.sin(time * 4)) * (v.amt / 100) * 0.5;
    d.save(); d.globalAlpha = a; d.fillStyle = '#FFFFFF'; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'invertPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const k = (0.5 + 0.5 * Math.sin(time * 3)) * (v.amt / 100);
    pixelOp(d, (q, i) => { q[i] = q[i] + (255 - 2 * q[i]) * k; q[i + 1] = q[i + 1] + (255 - 2 * q[i + 1]) * k; q[i + 2] = q[i + 2] + (255 - 2 * q[i + 2]) * k; });
  },
  'huePulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const glOut = glAdjust(cur, { hue: Math.sin(time * 2) * v.amt });
    if (glOut) { d.drawImage(glOut, 0, 0); return; }
    d.filter = `hue-rotate(${Math.sin(time * 2) * v.amt}deg)`; d.drawImage(cur, 0, 0); d.filter = 'none';
  },
  'edgePulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    if (b.w > 2 && b.h > 2) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const lum = (x, y) => { const o = ((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4; return src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114; };
      const pulse = 0.5 + 0.5 * Math.sin(time * 3);
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const gx = -lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1) + lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1);
  const gy = -lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1) + lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1);
  const m = Math.min(255, Math.hypot(gx, gy) / 4 * (v.amt / 100) * pulse);
  const o = (y * b.w + x) * 4;
  q[o] = q[o + 1] = q[o + 2] = m;
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'warpWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    warp(d, (dx, dy) => [dx + Math.sin(dy * 0.04 + time * 2) * v.amt * px * 0.3, dy]);
  },
  'swirl': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), r = Math.min(b.w, b.h) / 2, A = v.amt / 100 * 4;
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist >= r || dist < 0.5) return [dx, dy];
      const ang = A * (1 - dist / r) * (1 - dist / r);
      const c = Math.cos(ang), s = Math.sin(ang);
      return [dx * c - dy * s, dx * s + dy * c];
    });
  },
  'gridPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), step = 40 * px, a = (0.5 + 0.5 * Math.sin(time * 3)) * (v.amt / 100) * 0.5;
    d.save(); d.strokeStyle = `rgba(255,255,255,${a})`; d.lineWidth = Math.max(1, px);
    d.beginPath();
    for (let x = b.x; x <= b.x + b.w; x += step) { d.moveTo(x, b.y); d.lineTo(x, b.y + b.h); }
    for (let y = b.y; y <= b.y + b.h; y += step) { d.moveTo(b.x, y); d.lineTo(b.x + b.w, y); }
    d.stroke(); d.restore();
  },
  'scanNoise': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt / 10);
    d.save(); d.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < n; i++) {
      const h = Math.sin(i * 12.9898 + Math.floor(time * 12)) * 43758.5453;
      const y = b.y + ((h - Math.floor(h)) * b.h);
      d.fillRect(b.x, y, b.w, Math.max(1, px));
    }
    d.restore();
  },
  'burst': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt), u = (time % 2) / 2;
    d.save(); d.fillStyle = 'rgba(255,240,180,0.9)';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = u * Math.min(b.w, b.h) * 0.45;
      d.globalAlpha = (1 - u) * 0.8;
      d.beginPath(); d.arc(b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r, 3 * px, 0, Math.PI * 2); d.fill();
    }
    d.restore();
  },
  'sparkle': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt);
    d.save(); d.fillStyle = '#FFFFFF';
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w), fy = b.y + ((h2 - Math.floor(h2)) * b.h);
      d.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(time * 2 + i * 1.7));
      const s = (2 + ((h1 - Math.floor(h1)) * 4)) * px;
      d.fillRect(fx - s / 2, fy, s, Math.max(1, px)); d.fillRect(fx, fy - s / 2, Math.max(1, px), s);
    }
    d.restore();
  },
  'echoZoom': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), n = Math.max(1, Math.round(v.n));
    for (let i = n; i >= 0; i--) {
      const s = 1 - (i / (n + 1)) * 0.4;
      d.save(); d.globalAlpha = i === 0 ? 1 : 0.4;
      d.drawImage(cur, b.cx - b.w * s / 2, b.cy - b.h * s / 2, b.w * s, b.h * s);
      d.restore();
    }
  },
  'focusPull': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const blur = (0.5 + 0.5 * Math.sin(time * 1.5)) * v.amt * px * 0.2;
    const glOut = glAdjust(cur, { blur: Math.max(0, blur) });
    if (glOut) { d.drawImage(glOut, 0, 0); return; }
    d.filter = `blur(${Math.max(0, blur)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
  },
  'depthField': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const tmp = scratch('depth'), tx = tmp.getContext('2d');
    tx.filter = `blur(${Math.max(1, (v.amt / 100) * 4 * px)}px)`; tx.drawImage(cur, 0, 0); tx.filter = 'none';
    d.drawImage(tmp, 0, 0);
    const b = box(), r = Math.min(b.w, b.h) * 0.35;
    d.save(); d.beginPath(); d.arc(b.cx, b.cy, r, 0, Math.PI * 2); d.clip(); d.drawImage(cur, 0, 0); d.restore();
  },
  'vignettePulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), pulse = 0.5 + 0.5 * Math.sin(time * 2);
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5 * pulse;
    const g = d.createRadialGradient(b.cx, b.cy, Math.min(b.w, b.h) * 0.3, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.8)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'grainPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), pat = d.createPattern(noiseTile(), 'repeat');
    if (pat) { d.save(); d.globalAlpha = (v.amt / 100) * 0.2 * (0.5 + 0.5 * Math.sin(time * 3)); d.fillStyle = pat; d.fillRect(b.x, b.y, b.w, b.h); d.restore(); }
  },
  'shadowPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), pulse = 0.5 + 0.5 * Math.sin(time * 2);
    const tmp = scratch('shP'), tx = tmp.getContext('2d');
    tx.drawImage(cur, 0, 0);
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#000000'; tx.fillRect(0, 0, W, H);
    d.save(); d.globalAlpha = (v.amt / 100) * 0.6 * pulse; d.filter = 'blur(8px)';
    d.drawImage(tmp, v.dx * px, v.dy * px); d.filter = 'none'; d.restore();
    d.drawImage(cur, 0, 0);
  },
  'waveShift': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * v.amt * px * 0.3;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
  },
  'colorSplit': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), off = Math.round(v.amt * px * 0.3);
    if (b.w > 4 && b.h > 1) {
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const at = (x, y, c) => src[((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4 + c];
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
  const o = (y * b.w + x) * 4;
  q[o] = at(x - off, y, 0); q[o + 1] = at(x, y, 1); q[o + 2] = at(x + off, y, 2);
      }
      d.putImageData(img, b.x, b.y);
    }
  },
  'zoomSpin': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), a = Math.sin(time * 2) * (v.amt / 100) * 0.5, s = 1 + Math.sin(time * 2) * (v.amt / 100) * 0.2;
    d.save(); d.translate(b.cx, b.cy); d.rotate(a); d.scale(s, s); d.translate(-b.cx, -b.cy); d.drawImage(cur, 0, 0); d.restore();
  },
  'slideEcho': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), n = Math.max(1, Math.round(v.n));
    for (let i = n; i >= 0; i--) {
      d.save(); d.globalAlpha = i === 0 ? 1 : 0.35;
      d.drawImage(cur, i * 8 * px, 0); d.restore();
    }
  },
  'blurPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const blur = (0.5 + 0.5 * Math.sin(time * 6)) * v.amt * px * 0.2;
    d.filter = `blur(${Math.max(0, blur)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
  },
  'tintPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), a = (0.5 + 0.5 * Math.sin(time * 3)) * (v.amt / 100) * 0.5;
    d.save(); d.globalAlpha = a; d.globalCompositeOperation = 'overlay'; d.fillStyle = v.color || '#FF2D78'; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'mosaicPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), size = Math.max(2, Math.round((10 + Math.sin(time * 3) * 8) * (v.amt / 50) * px));
    const tmp = scratch('mosP', Math.max(1, Math.ceil(b.w / size)), Math.max(1, Math.ceil(b.h / size))), tx = tmp.getContext('2d');
    tx.drawImage(cur, b.x, b.y, b.w, b.h, 0, 0, tmp.width, tmp.height);
    d.imageSmoothingEnabled = false; d.drawImage(tmp, b.x, b.y, b.w, b.h); d.imageSmoothingEnabled = true;
  },
  'strobeFlash': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    if (Math.floor(time * 8) % 2 === 0) {
      const b = box();
      d.save(); d.globalAlpha = v.amt / 100; d.fillStyle = '#000000'; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
    }
  },
  'ripplePulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const A = (0.5 + 0.5 * Math.sin(time * 2)) * v.amt * px * 0.5, len = Math.max(1, 40 * px);
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) return [dx, dy];
      const off = Math.sin((dist / len) * Math.PI * 2 - time * 3) * A;
      return [dx * (1 + off / dist), dy * (1 + off / dist)];
    });
  },
  'vortexPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), r = Math.min(b.w, b.h) / 2, A = (0.5 + 0.5 * Math.sin(time * 2)) * (v.amt / 100) * 3;
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist >= r || dist < 0.5) return [dx, dy];
      const ang = A * (1 - dist / r);
      const c = Math.cos(ang), s = Math.sin(ang);
      return [dx * c - dy * s, dx * s + dy * c];
    });
  },
  'shearPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), k = Math.sin(time * 2) * (v.amt / 100) * 0.5;
    d.save(); d.translate(b.cx, b.cy); d.transform(1, 0, k, 1, 0, 0); d.translate(-b.cx, -b.cy); d.drawImage(cur, 0, 0); d.restore();
  },
  'skewWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    warp(d, (dx, dy) => [dx + Math.sin(dy * 0.03 + time * 2) * v.amt * px * 0.3, dy + Math.sin(dx * 0.03 + time * 2) * v.amt * px * 0.3]);
  },
  'tunnelSpin': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), A = time * 0.5, zoom = 1 + (v.amt / 100) * 0.3;
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) return [dx, dy];
      const c = Math.cos(A), s = Math.sin(A);
      return [(dx * c - dy * s) / zoom, (dx * s + dy * c) / zoom];
    });
  },
  'fadeZoom': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), u = (time % 2) / 2, s = 1 + u * (v.amt / 100);
    d.save(); d.globalAlpha = 1 - u * 0.5; d.translate(b.cx, b.cy); d.scale(s, s); d.translate(-b.cx, -b.cy); d.drawImage(cur, 0, 0); d.restore();
  },
  'spinFade': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), u = (time % 2) / 2;
    d.save(); d.globalAlpha = 1 - u * 0.5; d.translate(b.cx, b.cy); d.rotate(u * Math.PI * (v.amt / 50)); d.translate(-b.cx, -b.cy); d.drawImage(cur, 0, 0); d.restore();
  },
  'lightLeak': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.x, b.y, 0, b.x, b.y, Math.hypot(b.w, b.h) * 0.6);
    g.addColorStop(0, 'rgba(255,200,120,0.8)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'neonPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const tmp = scratch('neonP'), tx = tmp.getContext('2d');
    tx.filter = 'blur(8px)'; tx.drawImage(cur, 0, 0); tx.filter = 'none';
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = v.color || '#00E5FF'; tx.fillRect(0, 0, W, H);
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100) * (0.5 + 0.5 * Math.sin(time * 3)); d.globalCompositeOperation = 'lighter'; d.drawImage(tmp, 0, 0); d.restore();
  },
  'haloPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), pulse = 0.5 + 0.5 * Math.sin(time * 2);
    d.save(); d.globalAlpha = (v.amt / 100) * 0.4 * pulse;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.min(b.w, b.h) * 0.5 * (1 + pulse * 0.3));
    g.addColorStop(0, 'rgba(255,255,200,0.8)'); g.addColorStop(1, 'rgba(255,255,200,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'fireGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,120,0,0.7)'); g.addColorStop(0.5, 'rgba(255,60,0,0.3)'); g.addColorStop(1, 'rgba(255,60,0,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'iceGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(120,200,255,0.7)'); g.addColorStop(0.5, 'rgba(0,120,255,0.3)'); g.addColorStop(1, 'rgba(0,120,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'prismWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * v.amt * px * 0.3;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.25; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
    ['#FF0000', '#FFD84D', '#00C853', '#0091FF'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'colorWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.filter = `hue-rotate(${Math.sin(time * 2) * v.amt}deg)`; d.drawImage(cur, 0, 0); d.filter = 'none';
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 10 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
  },
  'starPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt);
    d.save(); d.fillStyle = '#FFFFFF';
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w), fy = b.y + ((h2 - Math.floor(h2)) * b.h);
      const s = (2 + 3 * Math.abs(Math.sin(time * 2 + i))) * px;
      d.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + i * 1.3));
      d.fillRect(fx - s / 2, fy, s, Math.max(1, px)); d.fillRect(fx, fy - s / 2, Math.max(1, px), s);
    }
    d.restore();
  },
  'vignetteWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, Math.min(b.w, b.h) * 0.3, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.8)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'sunsetGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.4;
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(255,120,0,0.6)'); g.addColorStop(0.5, 'rgba(255,80,120,0.4)'); g.addColorStop(1, 'rgba(120,0,120,0.5)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'moonGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.4;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(220,230,255,0.7)'); g.addColorStop(1, 'rgba(220,230,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'cometTrail': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt), u = (time % 3) / 3;
    d.save();
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w + u * b.w * 0.5) % b.w;
      const fy = b.y + ((h2 - Math.floor(h2)) * b.h);
      d.globalAlpha = 0.8; d.fillStyle = '#FFFFFF';
      d.beginPath(); d.arc(fx, fy, 3 * px, 0, Math.PI * 2); d.fill();
      d.globalAlpha = 0.3; d.fillRect(fx - 20 * px, fy - Math.max(1, px) / 2, 20 * px, Math.max(1, px));
    }
    d.restore();
  },
  'rainbowWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.3; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x + b.w, b.y + Math.sin(time * 2) * 20 * px);
    ['#FF0000', '#FF7F00', '#FFD84D', '#00C853', '#0091FF', '#7C4DFF'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'emberGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt), u = (time % 2) / 2;
    d.save(); d.fillStyle = 'rgba(255,140,0,0.9)';
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w);
      const fy = b.y + b.h - ((h2 - Math.floor(h2)) * b.h + u * b.h * 0.5) % b.h;
      d.globalAlpha = 0.3 + 0.7 * (1 - u);
      d.beginPath(); d.arc(fx, fy, 2 * px, 0, Math.PI * 2); d.fill();
    }
    d.restore();
  },
  'frostGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.4;
    const g = d.createRadialGradient(b.cx, b.cy, Math.min(b.w, b.h) * 0.3, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(180,220,255,0.8)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'pulseRing': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), u = (time % 2) / 2;
    d.save(); d.strokeStyle = 'rgba(255,255,255,0.7)'; d.lineWidth = Math.max(1, 2 * px);
    for (let i = 0; i < 3; i++) {
      const uu = (u + i / 3) % 1;
      d.globalAlpha = (1 - uu) * (v.amt / 100);
      d.beginPath(); d.arc(b.cx, b.cy, uu * Math.min(b.w, b.h) * 0.5, 0, Math.PI * 2); d.stroke();
    }
    d.restore();
  },
  'waveRipple': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const A = v.amt * px * 0.3, len = Math.max(1, 40 * px);
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      const off = Math.sin(dy * 0.05 + time * 3) * A * 0.5 + (dist < 0.5 ? 0 : Math.sin((dist / len) * Math.PI * 2 - time * 3) * A * 0.5);
      return [dx + off, dy + off * 0.3];
    });
  },
  'auroraWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h + Math.sin(time * 2) * 20 * px);
    g.addColorStop(0, 'rgba(0,255,180,0.7)'); g.addColorStop(0.5, 'rgba(0,120,255,0.5)'); g.addColorStop(1, 'rgba(120,0,255,0.6)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'galaxyGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(180,120,255,0.7)'); g.addColorStop(0.5, 'rgba(80,0,180,0.3)'); g.addColorStop(1, 'rgba(80,0,180,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'cometPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt), u = (time % 3) / 3, pulse = 0.5 + 0.5 * Math.sin(time * 3);
    d.save();
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w + u * b.w * 0.5) % b.w;
      const fy = b.y + ((h2 - Math.floor(h2)) * b.h);
      d.globalAlpha = 0.5 + 0.5 * pulse; d.fillStyle = '#FFFFFF';
      d.beginPath(); d.arc(fx, fy, 3 * px, 0, Math.PI * 2); d.fill();
      d.globalAlpha = 0.25 * pulse; d.fillRect(fx - 20 * px, fy - Math.max(1, px) / 2, 20 * px, Math.max(1, px));
    }
    d.restore();
  },
  'oceanWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h + Math.sin(time * 2) * 15 * px);
    g.addColorStop(0, 'rgba(0,180,255,0.7)'); g.addColorStop(1, 'rgba(0,40,120,0.6)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'mistGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.3;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'solarGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,220,80,0.8)'); g.addColorStop(0.5, 'rgba(255,160,0,0.3)'); g.addColorStop(1, 'rgba(255,160,0,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'lunarGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(220,230,255,0.8)'); g.addColorStop(0.5, 'rgba(140,170,255,0.3)'); g.addColorStop(1, 'rgba(140,170,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'stormCloud': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.25;
    for (let i = 0; i < 5; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w + time * 8 * px) % b.w;
      const fy = b.y + ((h2 - Math.floor(h2)) * b.h * 0.5);
      const r = (30 + ((h1 - Math.floor(h1)) * 50)) * px;
      const g = d.createRadialGradient(fx, fy, 0, fx, fy, r);
      g.addColorStop(0, 'rgba(60,60,70,0.6)'); g.addColorStop(1, 'rgba(60,60,70,0)');
      d.fillStyle = g; d.beginPath(); d.arc(fx, fy, r, 0, Math.PI * 2); d.fill();
    }
    d.restore();
  },
  'crystalGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(220,240,255,0.8)'); g.addColorStop(0.5, 'rgba(120,180,255,0.3)'); g.addColorStop(1, 'rgba(120,180,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'coralGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,140,120,0.8)'); g.addColorStop(0.5, 'rgba(255,80,100,0.3)'); g.addColorStop(1, 'rgba(255,80,100,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'mintGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(180,255,200,0.8)'); g.addColorStop(0.5, 'rgba(80,220,140,0.3)'); g.addColorStop(1, 'rgba(80,220,140,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'amberGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,200,80,0.8)'); g.addColorStop(0.5, 'rgba(255,160,0,0.3)'); g.addColorStop(1, 'rgba(255,160,0,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'tealGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(120,230,220,0.8)'); g.addColorStop(0.5, 'rgba(0,180,170,0.3)'); g.addColorStop(1, 'rgba(0,180,170,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'violetGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(200,140,255,0.8)'); g.addColorStop(0.5, 'rgba(120,0,220,0.3)'); g.addColorStop(1, 'rgba(120,0,220,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'glowWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 10 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.4;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,200,0.7)'); g.addColorStop(1, 'rgba(255,255,200,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'glowRing': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), u = (time % 2) / 2;
    d.save(); d.strokeStyle = 'rgba(255,255,180,0.8)'; d.lineWidth = Math.max(1, 2 * px);
    for (let i = 0; i < 3; i++) {
      const uu = (u + i / 3) % 1;
      d.globalAlpha = (1 - uu) * (v.amt / 100);
      d.beginPath(); d.arc(b.cx, b.cy, uu * Math.min(b.w, b.h) * 0.5, 0, Math.PI * 2); d.stroke();
    }
    d.restore();
  },
  'hologram': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.3; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
    ['#FF0000', '#FFD84D', '#00C853', '#0091FF'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h);
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.2; d.fillStyle = '#000000';
    for (let y = b.y; y < b.y + b.h; y += Math.max(3, Math.round(4 * px))) d.fillRect(b.x, y, b.w, Math.max(1, px));
    d.restore();
  },
  'neonWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 10 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    const tmp = scratch('neonW'), tx = tmp.getContext('2d');
    tx.filter = 'blur(8px)'; tx.drawImage(cur, 0, 0); tx.filter = 'none';
    tx.globalCompositeOperation = 'source-in'; tx.fillStyle = v.color || '#FF2D78'; tx.fillRect(0, 0, W, H);
    d.save(); d.globalAlpha = Math.min(1, v.amt / 100); d.globalCompositeOperation = 'lighter'; d.drawImage(tmp, 0, 0); d.restore();
  },
  'prismGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.3; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
    ['#FF0000', '#FFD84D', '#00C853', '#0091FF', '#7C4DFF'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'auroraGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(0,255,180,0.7)'); g.addColorStop(0.5, 'rgba(0,120,255,0.5)'); g.addColorStop(1, 'rgba(120,0,255,0.6)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'sunsetWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35;
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(255,120,0,0.6)'); g.addColorStop(1, 'rgba(120,0,120,0.5)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'oceanGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(0,180,255,0.7)'); g.addColorStop(1, 'rgba(0,40,120,0.6)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'mistWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 6 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.25;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'stormGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.25;
    for (let i = 0; i < 5; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w + time * 8 * px) % b.w;
      const fy = b.y + ((h2 - Math.floor(h2)) * b.h * 0.5);
      const r = (30 + ((h1 - Math.floor(h1)) * 50)) * px;
      const g = d.createRadialGradient(fx, fy, 0, fx, fy, r);
      g.addColorStop(0, 'rgba(60,60,70,0.6)'); g.addColorStop(1, 'rgba(60,60,70,0)');
      d.fillStyle = g; d.beginPath(); d.arc(fx, fy, r, 0, Math.PI * 2); d.fill();
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.3;
    const g2 = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g2.addColorStop(0, 'rgba(255,255,200,0.6)'); g2.addColorStop(1, 'rgba(255,255,200,0)');
    d.fillStyle = g2; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'emberWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt), u = (time % 2) / 2;
    d.save(); d.fillStyle = 'rgba(255,140,0,0.9)';
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w + Math.sin(time + i) * 10 * px) % b.w;
      const fy = b.y + b.h - ((h2 - Math.floor(h2)) * b.h + u * b.h * 0.5) % b.h;
      d.globalAlpha = 0.3 + 0.7 * (1 - u);
      d.beginPath(); d.arc(fx, fy, 2 * px, 0, Math.PI * 2); d.fill();
    }
    d.restore();
  },
  'frostWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.4;
    const g = d.createRadialGradient(b.cx, b.cy, Math.min(b.w, b.h) * 0.3, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(180,220,255,0.8)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'pulseGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), pulse = 0.5 + 0.5 * Math.sin(time * 2);
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5 * pulse;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,200,0.8)'); g.addColorStop(1, 'rgba(255,255,200,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'ringGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.strokeStyle = 'rgba(255,255,180,0.8)'; d.lineWidth = Math.max(1, 2 * px);
    const u = (time % 2) / 2;
    for (let i = 0; i < 3; i++) {
      const uu = (u + i / 3) % 1;
      d.globalAlpha = (1 - uu) * (v.amt / 100);
      d.beginPath(); d.arc(b.cx, b.cy, uu * Math.min(b.w, b.h) * 0.5, 0, Math.PI * 2); d.stroke();
    }
    d.restore();
  },
  'starGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt);
    d.save(); d.fillStyle = '#FFFFFF';
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w), fy = b.y + ((h2 - Math.floor(h2)) * b.h);
      const s = (2 + 3 * Math.abs(Math.sin(time * 2 + i))) * px;
      d.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + i * 1.3));
      d.fillRect(fx - s / 2, fy, s, Math.max(1, px)); d.fillRect(fx, fy - s / 2, Math.max(1, px), s);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.3;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,220,0.6)'); g.addColorStop(1, 'rgba(255,255,220,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'cometGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt), u = (time % 3) / 3;
    d.save();
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w + u * b.w * 0.5) % b.w;
      const fy = b.y + ((h2 - Math.floor(h2)) * b.h);
      d.globalAlpha = 0.8; d.fillStyle = '#FFFFFF';
      d.beginPath(); d.arc(fx, fy, 3 * px, 0, Math.PI * 2); d.fill();
      d.globalAlpha = 0.3; d.fillRect(fx - 20 * px, fy - Math.max(1, px) / 2, 20 * px, Math.max(1, px));
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.3;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(220,230,255,0.6)'); g.addColorStop(1, 'rgba(220,230,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'moonWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.4;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(220,230,255,0.7)'); g.addColorStop(1, 'rgba(220,230,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'sunWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.4;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,220,80,0.8)'); g.addColorStop(1, 'rgba(255,220,80,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'nebulaGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,120,220,0.7)'); g.addColorStop(0.5, 'rgba(120,0,220,0.3)'); g.addColorStop(1, 'rgba(120,0,220,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'quasarGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), pulse = 0.5 + 0.5 * Math.sin(time * 3);
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5 * pulse;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'eclipseGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), r = Math.min(b.w, b.h) * 0.3;
    d.save(); d.globalAlpha = (v.amt / 100) * 0.6;
    d.fillStyle = 'rgba(0,0,0,0.7)'; d.beginPath(); d.arc(b.cx, b.cy, r, 0, Math.PI * 2); d.fill();
    d.strokeStyle = 'rgba(255,220,120,0.9)'; d.lineWidth = Math.max(1, 3 * px);
    d.beginPath(); d.arc(b.cx, b.cy, r + 4 * px, 0, Math.PI * 2); d.stroke();
    d.restore();
  },
  'supernova': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt), u = (time % 2) / 2;
    d.save(); d.fillStyle = 'rgba(255,240,180,0.9)';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = u * Math.min(b.w, b.h) * 0.45;
      d.globalAlpha = (1 - u) * 0.8;
      d.beginPath(); d.arc(b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r, 3 * px, 0, Math.PI * 2); d.fill();
    }
    d.restore();
    d.save(); d.globalAlpha = (1 - u) * (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,220,0.9)'); g.addColorStop(1, 'rgba(255,255,220,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'blackhole': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), r = Math.min(b.w, b.h) / 2, A = v.amt / 100 * 2;
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) return [dx, dy];
      const pull = 1 - (A * 0.3 * (1 - dist / (r * 2)));
      return [dx * pull, dy * pull];
    });
  },
  'wormhole': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), A = time * 0.5, zoom = 1 + (v.amt / 100) * 0.5;
    warp(d, (dx, dy) => {
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) return [dx, dy];
      const c = Math.cos(A), s = Math.sin(A);
      return [(dx * c - dy * s) / zoom, (dx * s + dy * c) / zoom];
    });
  },
  'stardust': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt);
    d.save(); d.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < n; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.21;
      const fx = b.x + ((h1 - Math.floor(h1)) * b.w + Math.sin(time + i) * 15 * px) % b.w;
      const fy = b.y + ((h2 - Math.floor(h2)) * b.h + Math.cos(time * 0.7 + i) * 10 * px) % b.h;
      d.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(time * 2 + i));
      d.fillRect(fx, fy, Math.max(1, px), Math.max(1, px));
    }
    d.restore();
  },
  'cosmosWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(120,0,255,0.7)'); g.addColorStop(0.5, 'rgba(0,120,255,0.5)'); g.addColorStop(1, 'rgba(255,0,180,0.6)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'lunarEclipse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), r = Math.min(b.w, b.h) * 0.3;
    d.save(); d.globalAlpha = (v.amt / 100) * 0.6;
    d.fillStyle = 'rgba(20,20,30,0.85)'; d.beginPath(); d.arc(b.cx, b.cy, r, 0, Math.PI * 2); d.fill();
    d.strokeStyle = 'rgba(220,230,255,0.9)'; d.lineWidth = Math.max(1, 3 * px);
    d.beginPath(); d.arc(b.cx, b.cy, r + 4 * px, 0, Math.PI * 2); d.stroke();
    d.restore();
  },
  'auroraPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), pulse = 0.5 + 0.5 * Math.sin(time * 2);
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35 * pulse; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(0,255,180,0.7)'); g.addColorStop(0.5, 'rgba(0,120,255,0.5)'); g.addColorStop(1, 'rgba(120,0,255,0.6)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'galaxyWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(180,120,255,0.7)'); g.addColorStop(1, 'rgba(180,120,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'nebulaWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5;
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,120,220,0.7)'); g.addColorStop(1, 'rgba(255,120,220,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'quasarWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5 * (0.5 + 0.5 * Math.sin(time * 3));
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'supernovaWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    const u = (time % 2) / 2, n = Math.round(v.amt);
    d.save(); d.fillStyle = 'rgba(255,240,180,0.9)';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = u * Math.min(b.w, b.h) * 0.45;
      d.globalAlpha = (1 - u) * 0.8;
      d.beginPath(); d.arc(b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r, 3 * px, 0, Math.PI * 2); d.fill();
    }
    d.restore();
  },
  'cosmosGlow': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(120,0,255,0.7)'); g.addColorStop(0.5, 'rgba(0,120,255,0.5)'); g.addColorStop(1, 'rgba(255,0,180,0.6)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'eclipseWave': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px));
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    const r = Math.min(b.w, b.h) * 0.3;
    d.save(); d.globalAlpha = (v.amt / 100) * 0.6;
    d.fillStyle = 'rgba(0,0,0,0.7)'; d.beginPath(); d.arc(b.cx, b.cy, r, 0, Math.PI * 2); d.fill();
    d.strokeStyle = 'rgba(255,220,120,0.9)'; d.lineWidth = Math.max(1, 3 * px);
    d.beginPath(); d.arc(b.cx, b.cy, r + 4 * px, 0, Math.PI * 2); d.stroke();
    d.restore();
  },
  'solarEclipse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), r = Math.min(b.w, b.h) * 0.3;
    d.save(); d.globalAlpha = (v.amt / 100) * 0.6;
    d.fillStyle = 'rgba(0,0,0,0.9)'; d.beginPath(); d.arc(b.cx, b.cy, r, 0, Math.PI * 2); d.fill();
    d.strokeStyle = 'rgba(255,240,180,0.9)'; d.lineWidth = Math.max(1, 4 * px);
    d.beginPath(); d.arc(b.cx, b.cy, r + 6 * px, 0, Math.PI * 2); d.stroke();
    d.restore();
  },
  'auroraWavePulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    const b = box(), step = Math.max(4, Math.round(4 * px)), pulse = 0.5 + 0.5 * Math.sin(time * 2);
    d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
    for (let y = b.y; y < b.y + b.h; y += step) {
      const off = Math.sin(y * 0.05 + time * 3) * 8 * px;
      d.drawImage(cur, b.x, y, b.w, step, b.x + off, y, b.w, step);
    }
    d.restore();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35 * pulse; d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(0,255,180,0.7)'); g.addColorStop(0.5, 'rgba(0,120,255,0.5)'); g.addColorStop(1, 'rgba(120,0,255,0.6)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'galaxyPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5 * (0.5 + 0.5 * Math.sin(time * 2));
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(180,120,255,0.7)'); g.addColorStop(1, 'rgba(180,120,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'nebulaPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5 * (0.5 + 0.5 * Math.sin(time * 2));
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,120,220,0.7)'); g.addColorStop(1, 'rgba(255,120,220,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'quasarPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.5 * (0.5 + 0.5 * Math.sin(time * 4));
    const g = d.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.hypot(b.w, b.h) / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'supernovaPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), n = Math.round(v.amt), u = (time % 2) / 2, pulse = 0.5 + 0.5 * Math.sin(time * 3);
    d.save(); d.fillStyle = 'rgba(255,240,180,0.9)';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = u * Math.min(b.w, b.h) * 0.45;
      d.globalAlpha = (1 - u) * 0.8 * pulse;
      d.beginPath(); d.arc(b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r, 3 * px, 0, Math.PI * 2); d.fill();
    }
    d.restore();
  },
  'cosmosPulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box();
    d.save(); d.globalAlpha = (v.amt / 100) * 0.35 * (0.5 + 0.5 * Math.sin(time * 2)); d.globalCompositeOperation = 'overlay';
    const g = d.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(120,0,255,0.7)'); g.addColorStop(0.5, 'rgba(0,120,255,0.5)'); g.addColorStop(1, 'rgba(255,0,180,0.6)');
    d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
  },
  'eclipsePulse': (d, cur, v, id, X) => {
    const { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch, glAdjust, noiseTile, noise } = X;
    d.drawImage(cur, 0, 0);
    const b = box(), r = Math.min(b.w, b.h) * 0.3, pulse = 0.5 + 0.5 * Math.sin(time * 2);
    d.save(); d.globalAlpha = (v.amt / 100) * 0.6 * pulse;
    d.fillStyle = 'rgba(0,0,0,0.7)'; d.beginPath(); d.arc(b.cx, b.cy, r, 0, Math.PI * 2); d.fill();
    d.strokeStyle = 'rgba(255,220,120,0.9)'; d.lineWidth = Math.max(1, 3 * px);
    d.beginPath(); d.arc(b.cx, b.cy, r + 4 * px, 0, Math.PI * 2); d.stroke();
    d.restore();
  },
};

/** اجرای زنجیرهٔ افکت‌های canvas روی بوم (درجا). fxList = [{id, p}] با پارامترهای حل‌شده. */
export function applyCanvasFxList(canvas, fxList, t, gl) {
  const W = canvas.width, H = canvas.height;
  if (!W || !H) return canvas;
  const ctx = canvas.getContext('2d');
  const px = 1, time = t;
  const box = () => ({ x: 0, y: 0, w: W, h: H, cx: W / 2, cy: H / 2, fw: W, fh: H });
  const glAdjust = (src, opts) => (gl && gl.supported ? gl.adjust(src, opts) : null);
  for (const { id, p } of fxList) {
    const fn = CANVAS_FX[id];
    if (!fn || !p) continue;
    const snap = scratch('__src', W, H);
    if (!snap) continue;
    const sctx = snap.getContext('2d');
    sctx.clearRect(0, 0, W, H);
    sctx.drawImage(canvas, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.restore();
    const cur = snap;
    const pixelOp = (d, fn2) => {
      d.drawImage(cur, 0, 0);
      const b = box();
      if (b.w < 1 || b.h < 1) return;
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
      for (let i = 0; i < q.length; i += 4) if (q[i + 3]) fn2(q, i);
      d.putImageData(img, b.x, b.y);
    };
    const warp = (d, fn2) => {
      d.drawImage(cur, 0, 0);
      const b = box();
      if (b.w < 2 || b.h < 2) return;
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const hw = b.w / 2, hh = b.h / 2;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const dx = x - hw, dy = y - hh;
        const [sx, sy] = fn2(dx, dy, b);
        const cx = Math.max(0, Math.min(b.w - 1, Math.round(hw + sx)));
        const cy = Math.max(0, Math.min(b.h - 1, Math.round(hh + sy)));
        const o = (y * b.w + x) * 4, so = (cy * b.w + cx) * 4;
        q[o] = src[so]; q[o + 1] = src[so + 1]; q[o + 2] = src[so + 2]; q[o + 3] = src[so + 3];
      }
      d.putImageData(img, b.x, b.y);
    };
    const smear = (d, n, place) => {
      const acc = scratch('smear', W, H), ax = acc.getContext('2d');
      for (let i = 0; i < n; i++) {
        ax.save(); ax.globalAlpha = 1 / (i + 1); place(ax, i / Math.max(1, n - 1)); ax.drawImage(cur, 0, 0); ax.restore();
      }
      d.drawImage(acc, 0, 0);
    };
    const rgbSplit = (d, img, r, a) => {
      const tmp = scratch('rgbT', W, H), tx = tmp.getContext('2d');
      d.globalCompositeOperation = 'lighter';
      for (const [col, k] of [['#FF0000', 1], ['#00FF00', 0], ['#0000FF', -1]]) {
        tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, W, H);
        tx.drawImage(img, 0, 0);
        tx.globalCompositeOperation = 'multiply'; tx.fillStyle = col; tx.fillRect(0, 0, W, H);
        tx.globalCompositeOperation = 'destination-in'; tx.drawImage(img, 0, 0);
        d.drawImage(tmp, Math.cos(a) * r * k, Math.sin(a) * r * k);
      }
      d.globalCompositeOperation = 'source-over';
    };
    const tinted = (img, color) => {
      const c = scratch('tintT', W, H), x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over';
      return c;
    };
    const X = { W, H, time, px, box, pixelOp, warp, smear, rgbSplit, tinted, scratch: (n) => scratch(n, W, H), glAdjust, noiseTile, noise, parseColor, rgbaStr, clamp };
    try { fn(ctx, cur, p, id, X); } catch { /* افکت خراب، لایه بدون آن می‌ماند */ }
  }
  return canvas;
}
