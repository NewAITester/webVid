import { withProfileContext } from '../engine/render-profile.js';
import { evalLayer, frameEnv, needsBuffer } from './evaluate.js';
import { solidText } from './solidtext.js';
import { compileCode, codeEnv } from './codeapi.js';
import { MediaPool } from './media.js';
import { parseColor } from './tracks.js';
import { EASINGS } from './easing.js';
import { noise } from './expr.js';
import * as M from './mat.js';

/**
 * کشیدن لایه‌های حرکتی روی بوم
 * ─────────────────────────────────────────────────────────────
 * مسیر ساده: لایه بدون افکت تصویری ← مستقیم روی بوم اصلی با ترنسفرم.
 * مسیر بافر: لایه با تاری/درخشش/ماسک/تاری حرکت ← اول روی یک بوم
 * جداگانه به اندازهٔ قاب، افکت‌ها پشت سر هم، بعد ترکیب با حالت ترکیب
 * (blend) و شفافیت لایه.
 *
 * ترتیب آرایه = ترتیب کشیدن: اولی زیر همه، آخری روی همه.
 */

export const FONT_CHOICES = [
  ['black', 'IRANSansX Black', 'ضخیم'],
  ['bold', 'IRANSansX Bold', 'معمولی'],
  ['sans', 'sans-serif', 'سیستمی'],
  ['serif', 'serif', 'سریف'],
  ['mono', 'monospace', 'ماشین‌تحریر'],
];
const fontFamily = id => (FONT_CHOICES.find(f => f[0] === id) || FONT_CHOICES[0])[1];

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const rgbaStr = (hex, mul = 1) => {
  const [r, g, b, a] = parseColor(hex);
  return `rgba(${r},${g},${b},${a * mul})`;
};
const alphaOf = hex => (typeof hex === 'string' && hex.length === 9 ? parseColor(hex)[3] : 1);

/* ── متن ─────────────────────────────────────────────────────── */
const _measure = new Map();
if (typeof window !== 'undefined') window.addEventListener('wv-fonts-loaded', () => _measure.clear());
function textMetrics(ctx, L, P) {
  const str = String(L.data.str ?? '');
  const fam = fontFamily(L.data.font);
  const key = `${str}|${P.size}|${fam}|${P.spacing}|${P.lineH}`;
  let m = _measure.get(key);
  if (m) return m;
  ctx.save();
  ctx.font = `${P.size}px "${fam}"`;
  ctx.direction = 'rtl';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${P.spacing}px`;
  const lines = str.split('\n').map(s => {
    const words = s.split(' ');
    return {
      s, w: ctx.measureText(s || ' ').width,
      words: words.map(w => ({ s: w, w: ctx.measureText(w).width })),
      space: ctx.measureText(' ').width,
    };
  });
  ctx.restore();
  const lh = P.size * (P.lineH / 100);
  m = { lines, w: Math.max(1, ...lines.map(l => l.w)), h: Math.max(lh, lh * lines.length), lh };
  if (_measure.size > 500) _measure.clear();
  _measure.set(key, m);
  return m;
}

const isLtr = str => !/[\u0590-\u08FF\uFB1D-\uFEFF]/.test(str) && /[A-Za-z0-9]/.test(str);
function drawText(ctx, st) {
  const { L, P, mods } = st;
  const m = textMetrics(ctx, L, P);
  const ltr = isLtr(String(L.data.str ?? ''));   // متن لاتین چپ‌به‌چپ کشیده شود (Hello! نه !Hello)
  const fam = fontFamily(L.data.font);
  const align = L.data.align || 'center';

  // پس‌زمینهٔ متن (مثل برچسب CapCut)
  if (alphaOf(P.bg) > 0.004) {
    ctx.save();
    ctx.fillStyle = rgbaStr(P.bg);
    const pw = m.w + P.bgPad * 2, ph = m.h + P.bgPad * 1.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-pw / 2, -ph / 2, pw, ph, P.bgR); else ctx.rect(-pw / 2, -ph / 2, pw, ph);
    ctx.fill();
    ctx.restore();
  }

  ctx.font = `${P.size}px "${fam}"`;
  ctx.direction = ltr ? 'ltr' : 'rtl';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${P.spacing}px`;
  ctx.lineJoin = 'round';
  ctx.fillStyle = P.fill;
  ctx.strokeStyle = P.stroke;
  ctx.lineWidth = P.strokeW * 2;

  // افکت‌های متنی (کلمه‌به‌کلمه) و گرادیان حروف
  const tfx = st.fx.filter(f => f.kind === 'text');
  const grad = tfx.find(f => f.type === 'gradText');
  const makeGrad = (ox = 0, oy = 0) => {
    const v = grad.v, a = (v.ang * Math.PI) / 180;
    const r = Math.hypot(m.w, m.h) / 2;
    const g = ctx.createLinearGradient(-Math.cos(a) * r - ox, -Math.sin(a) * r - oy, Math.cos(a) * r - ox, Math.sin(a) * r - oy);
    g.addColorStop(0, v.c1); g.addColorStop(1, v.c2);
    return g;
  };
  if (grad) ctx.fillStyle = makeGrad();
  const perWord = !!mods.stagger || tfx.some(f => f.type !== 'gradText');

  // نمایش تدریجی (تایپ): ویژگی «نمایش» × انیمیشن تایپ
  const total = m.lines.reduce((s, l) => s + l.s.length, 0);
  let budget = Math.round(total * clamp((P.reveal / 100) * mods.reveal));

  const nWords = m.lines.reduce((s, l) => s + l.words.length, 0);
  let wi = 0;
  const y0 = -m.h / 2 + m.lh / 2;
  const lt = st.lt, fxOf = id => tfx.find(f => f.type === id)?.v;
  const rainbow = fxOf('rainbow'), wave = fxOf('wordWave'), jit = fxOf('jitter');
  const wpop = fxOf('wordPop');
  const lbnc = fxOf('letterBounce');
  const kar = fxOf('karaoke'), flk = fxOf('wordFlicker');
  let karPos = -1;
  if (kar) {
    const p = (lt / Math.max(0.01, st.dur)) * 100;
    karPos = clamp((p - kar.start) / Math.max(0.5, kar.end - kar.start)) * nWords;
  }
  m.lines.forEach((ln, i) => {
    const y = y0 + i * m.lh;
    // لبهٔ راست سطر (متن راست‌به‌چپ است)
    const right = align === 'right' ? m.w / 2 : align === 'left' ? -m.w / 2 + ln.w : ln.w / 2;

    if (perWord) {
      // کلمه‌به‌کلمه: کلمه‌ها جدا کشیده می‌شوند تا اتصال حروف فارسی نشکند
      let x = ltr ? right - ln.w : right;
      const span = Math.min(1, 2.6 / Math.max(1, nWords));
      for (const w of ln.words) {
        const idx = wi++;
        const cx = ltr ? x + w.w / 2 : x - w.w / 2;
        x += ltr ? w.w + ln.space : -(w.w + ln.space);
        if (budget <= 0) continue;
        budget -= w.s.length + 1;
        let a = 1, dx = 0, dy = 0, s = 1, rot = 0;
        if (mods.stagger) {
          const u = clamp((mods.stagger.u - (idx / Math.max(1, nWords)) * (1 - span)) / span);
          a = u;
          const k = mods.stagger.kind;
          if (k === 'up') dy = (1 - EASINGS.outCubic(u)) * P.size * 0.8;
          else if (k === 'pop') { s = Math.max(0.001, EASINGS.outBack(u)); a = clamp(u * 3); }
          else if (k === 'drop') { dy = -(1 - EASINGS.outBounce(u)) * P.size * 1.4; a = clamp(u * 4); }
          else if (k === 'zoom') { s = 1 + (1 - EASINGS.outCubic(u)) * 1.6; }
          else if (k === 'slide') { dx = (1 - EASINGS.outCubic(u)) * P.size * 1.4; }
          else if (k === 'spin') { rot = (1 - EASINGS.outBack(u)) * -1.6; s = Math.max(0.001, EASINGS.outCubic(u)); }
        }
        if (wave) dy += Math.sin(lt * wave.speed * 2 - idx * wave.gap) * wave.amp;
        if (wpop) s *= 1 + (wpop.amp / 100) * Math.max(0, Math.sin(lt * wpop.speed * 2 - idx * 0.7));
        if (lbnc) dy -= Math.abs(Math.sin(lt * lbnc.speed * 2 - idx * 0.7)) * lbnc.amp;
        if (jit) {
          dx += noise(lt * jit.speed + idx * 13.7) * jit.amt;
          dy += noise(lt * jit.speed + idx * 29.3 + 7) * jit.amt;
          rot += (noise(lt * jit.speed + idx * 5.1 + 3) * jit.rot * Math.PI) / 180;
        }
        if (flk) {
          const hsh = Math.sin((Math.floor(lt * flk.speed) * 3.7 + idx * 11.3) * 12.9898) * 43758.5453;
          if (hsh - Math.floor(hsh) < (flk.amt / 100) * 0.6) a *= 0.12;
        }
        let fill = null;
        if (rainbow) fill = `hsl(${(idx / Math.max(1, nWords)) * 360 + lt * rainbow.speed * 360},${rainbow.sat}%,${rainbow.light}%)`;
        if (kar) {
          if (idx < Math.floor(karPos)) fill = kar.color;
          else if (idx === Math.floor(karPos)) {
            fill = kar.color;
            s *= 1 + (kar.pop / 100) * Math.sin(clamp(karPos - idx) * Math.PI);
          }
        }
        if (a <= 0.002) continue;
        ctx.save();
        ctx.globalAlpha *= a;
        ctx.translate(cx + dx, y + dy); if (rot) ctx.rotate(rot); ctx.scale(s, s);
        ctx.textAlign = 'center';
        if (fill) ctx.fillStyle = fill;
        else if (grad) ctx.fillStyle = makeGrad(cx + dx, y + dy);
        solidText(ctx, w.s, 0, 0, P.strokeW > 0);
        ctx.restore();
      }
      return;
    }

    let s = ln.s;
    if (budget < s.length) s = s.slice(0, Math.max(0, budget));
    budget -= ln.s.length;
    if (!s) return;
    ctx.textAlign = ltr ? 'left' : 'right';
    solidText(ctx, s, ltr ? right - ln.w : right, y, P.strokeW > 0);
  });
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* ── شکل ─────────────────────────────────────────────────────── */
/* shapePath را export می‌کنیم تا تست Node بتواند بدون بوم واقعی،
   مسیر هر شکل تازه را با یک ctx ساختگی بررسی کند. */
export function shapePath(ctx, kind, w, h, P) {
  const hw = w / 2, hh = h / 2;
  ctx.beginPath();
  switch (kind) {
    case 'ellipse': case 'ring':
      ctx.ellipse(0, 0, Math.max(0.1, hw), Math.max(0.1, hh), 0, 0, Math.PI * 2);
      return Math.PI * (3 * (hw + hh) - Math.sqrt((3 * hw + hh) * (hw + 3 * hh)));
    case 'polygon': case 'star': {
      const n = Math.max(3, Math.round(P.sides));
      const pts = kind === 'star' ? n * 2 : n;
      let len = 0, px = 0, py = 0;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
        const r = kind === 'star' && i % 2 ? P.inner / 100 : 1;
        const x = Math.cos(a) * hw * r, y = Math.sin(a) * hh * r;
        if (i === 0) ctx.moveTo(x, y); else { ctx.lineTo(x, y); len += Math.hypot(x - px, y - py); }
        px = x; py = y;
      }
      ctx.closePath();
      return len;
    }
    case 'line':
      ctx.moveTo(-hw, 0); ctx.lineTo(hw, 0);
      return w;
    case 'heart': {
      ctx.moveTo(0, hh * 0.95);
      ctx.bezierCurveTo(-hw * 1.15, hh * 0.15, -hw * 0.75, -hh * 1.05, 0, -hh * 0.45);
      ctx.bezierCurveTo(hw * 0.75, -hh * 1.05, hw * 1.15, hh * 0.15, 0, hh * 0.95);
      ctx.closePath();
      return (w + h) * 1.7;
    }
    case 'arrow': {
      const sh = hh * 0.38, head = Math.min(hw, hh * 1.1);
      const p = [[-hw, -sh], [hw - head, -sh], [hw - head, -hh], [hw, 0], [hw - head, hh], [hw - head, sh], [-hw, sh]];
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      return 2 * w + 2 * h;
    }
    case 'plus': {
      // فاز ۶: به‌علاوهٔ ضخیم Alight — بازوهای پهن‌تر از cross
      const tw = Math.min(w, h) * 0.42 / 2;
      const p = [[-tw, -hh], [tw, -hh], [tw, -tw], [hw, -tw], [hw, tw], [tw, tw], [tw, hh],
                 [-tw, hh], [-tw, tw], [-hw, tw], [-hw, -tw], [-tw, -tw]];
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      return 2 * (w + h) + 4 * tw;
    }
    case 'stamp': {
      // فاز ۶: مُهر دندانه‌دار — دایره با ۲۴ دندانهٔ کوچک دورش
      const n = 24, rOut = Math.min(hw, hh), rIn = rOut * 0.88;
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? rIn : rOut;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      return Math.PI * (rOut + rIn) * 2;
    }
    case 'triangle': {
      const p = [[-hw, hh], [hw, hh], [0, -hh]];
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      return 2 * Math.hypot(hw, 2 * hh) + w;
    }
    case 'cross': {
      const tw = Math.min(w, h) * 0.3 / 2;
      const p = [[-tw, -hh], [tw, -hh], [tw, -tw], [hw, -tw], [hw, tw], [tw, tw], [tw, hh],
                 [-tw, hh], [-tw, tw], [-hw, tw], [-hw, -tw], [-tw, -tw]];
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      return 2 * (w + h) + 4 * tw;
    }
    /* ── شکل‌های تازهٔ فاز ۱ (هم‌ترازی با Alight Motion) ── */
    case 'roundrect': {
      const r = Math.min(P.radius, hw, hh);
      if (r > 0 && ctx.roundRect) ctx.roundRect(-hw, -hh, w, h, r); else ctx.rect(-hw, -hh, w, h);
      return 2 * (w + h);
    }
    case 'quad': {
      // ذوزنقه: بالای باریک‌تر، پایین پهن — مثل چهارضلعی Alight
      const tw = hw * 0.6;
      const p = [[-tw, -hh], [tw, -hh], [hw, hh], [-hw, hh]];
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      return 2 * w + 2 * h;
    }
    case 'pie': {
      // برش دایره: قطاع ۲۷۰ درجه (سه‌ربع)، از بالای دایره شروع می‌شود
      ctx.moveTo(0, 0);
      ctx.ellipse(0, 0, hw, hh, 0, -Math.PI / 2, Math.PI, false);
      ctx.closePath();
      return Math.PI * (hw + hh) * 0.75 + hw + hh;
    }
    case 'arc': {
      // کمان باز ۲۷۰ درجه — فقط دورخط کشیده می‌شود، پُر نمی‌شود
      ctx.ellipse(0, 0, hw, hh, 0, -Math.PI / 2, Math.PI, false);
      return Math.PI * (hw + hh) * 0.75;
    }
    case 'moon': {
      // هلال: دایرهٔ بیرونی منهای دایرهٔ داخلی با جهت مخالف
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2, false);
      ctx.ellipse(hw * 0.35, -hh * 0.1, hw * 0.85, hh * 0.85, 0, 0, Math.PI * 2, true);
      ctx.closePath();
      return Math.PI * (hw + hh) * 1.8;
    }
    case 'teardrop': {
      ctx.moveTo(0, -hh);
      ctx.bezierCurveTo(hw * 0.9, -hh * 0.1, hw, hh * 0.5, 0, hh);
      ctx.bezierCurveTo(-hw, hh * 0.5, -hw * 0.9, -hh * 0.1, 0, -hh);
      ctx.closePath();
      return (w + h) * 1.7;
    }
    case 'callout': {
      // حباب گفتگو: بدنهٔ مستطیل + دمِ پایین
      const by = hh * 0.65;
      const p = [[-hw, -hh], [hw, -hh], [hw, by], [hw * 0.25, by],
                 [-hw * 0.05, hh], [-hw * 0.35, by], [-hw, by]];
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      return 2 * w + 2 * h;
    }
    case 'flower': {
      // گل چندپر: نوک گلبرگ‌ها و دره‌های بین‌شان با منحنی نرم به هم می‌رسند.
      // تعداد گلبرگ = sides، عمق دره = inner درصد.
      const n = Math.max(3, Math.round(P.sides));
      const pts = [];
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? (P.inner / 100) : 1;
        pts.push([Math.cos(a) * hw * r, Math.sin(a) * hh * r]);
      }
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let [mx, my] = mid(pts[pts.length - 1], pts[0]);
      ctx.moveTo(mx, my);
      let len = 0, px = mx, py = my;
      for (let i = 0; i < pts.length; i++) {
        const [nx, ny] = mid(pts[i], pts[(i + 1) % pts.length]);
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], nx, ny);
        len += Math.hypot(nx - px, ny - py); px = nx; py = ny;
      }
      ctx.closePath();
      return len;
    }
    default: {
      const r = Math.min(P.radius, hw, hh);
      if (r > 0 && ctx.roundRect) ctx.roundRect(-hw, -hh, w, h, r); else ctx.rect(-hw, -hh, w, h);
      return 2 * (w + h);
    }
  }
}

function drawShape(ctx, st) {
  const { L, P } = st;
  const kind = L.data.kind || 'rect';
  const len = shapePath(ctx, kind, P.w, P.h, P);
  const trimmed = P.trimS > 0.01 || P.trimE < 99.99;
  const isLine = kind === 'line' || kind === 'ring' || kind === 'arc';

  if (!isLine && !trimmed && L.data.fillOn !== false) {
    if (L.data.grad === 'linear' || L.data.grad === 'radial') {
      let g;
      if (L.data.grad === 'radial') g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(P.w, P.h) / 2);
      else {
        const a = (P.gradA * Math.PI) / 180, r = Math.hypot(P.w, P.h) / 2;
        g = ctx.createLinearGradient(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r);
      }
      g.addColorStop(0, P.fill); g.addColorStop(1, P.fill2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = P.fill;
    ctx.fill();
  }
  const sw = isLine ? Math.max(P.strokeW, kind === 'line' ? Math.max(2, P.h / 10) : 10) : P.strokeW;
  if (sw > 0 || trimmed) {
    ctx.lineWidth = Math.max(sw, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = isLine && P.strokeW <= 0 ? P.fill : (P.strokeW > 0 ? P.stroke : P.fill);
    if (trimmed) {
      const a = Math.min(P.trimS, P.trimE) / 100, b = Math.max(P.trimS, P.trimE) / 100;
      ctx.setLineDash([Math.max(0.01, len * (b - a)), len * 2]);
      ctx.lineDashOffset = -len * a;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ── تصویر و ویدیو ─────────────────────────────────────────── */
function drawMedia(ctx, st, media, env) {
  const { L, P } = st;
  const it = media?.get(L.data.media);
  const w = P.w;
  if (!it?.ready) {
    // جای خالی تا وقتی فایل آماده شود
    const h = w * 0.5625;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
    ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([]);
    return;
  }
  if (L.type === 'video' && !env.exporting) media.sync(L, st.lt, env.playing, st.P);
  const h = w * (it.h / Math.max(1, it.w));
  ctx.save();
  if (P.radius > 0) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(P.radius, w / 2, h / 2));
    else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.clip();
  }
  ctx.imageSmoothingQuality = 'high';
  try { ctx.drawImage(it.el, -w / 2, -h / 2, w, h); } catch { /* فریم هنوز آماده نیست */ }
  ctx.restore();
}

/* ── خط آزاد (فاز ۱۱) ────────────────────────────────────────
   نقاط موج قطعی: x از چپ به راست، y از ترکیب دو سینوس. بدون
   Math.random تا renderFrame خالص بماند. */
export function scribblePoints(w, h, P) {
  const n = 60, amp = P.amp || 0, fr = P.freq || 1, pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = -w / 2 + u * w;
    const y = Math.sin(u * fr * Math.PI * 2) * amp + Math.sin(u * fr * 2.3 * Math.PI * 2) * amp * 0.3;
    pts.push([x, y]);
  }
  return pts;
}
/* فاز ۱۹ — نقاطی که لایهٔ خط آزاد باید بکشد: موج قطعی، یا خطی که کاربر
   با دست روی پد ضبط کرده (L.data.mode === 'free'). خالص و قابل تست. */
export function drawPathPoints(P, data) {
  const all = data?.mode === 'free' && Array.isArray(data.points) && data.points.length > 1
    ? data.points.map(([x, y]) => [x, y])
    : scribblePoints(P.w, P.h, P);
  const a = Math.floor(all.length * Math.max(0, Math.min(1, (P.trimS || 0) / 100)));
  const b = Math.max(a + 1, Math.ceil(all.length * Math.max(0, Math.min(1, (P.trimE ?? 100) / 100))));
  return all.slice(a, b);
}
function drawScribble(ctx, st) {
  const { L, P } = st;
  const pts = drawPathPoints(P, L.data);
  ctx.save();
  ctx.strokeStyle = P.stroke; ctx.lineWidth = Math.max(1, P.strokeW);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
}

/* ── موج صدا ───────────────────────────────────────────────── */
function drawSpectrum(ctx, st, env) {
  const { L, P } = st;
  const n = Math.max(4, Math.min(256, L.data.bars | 0 || 48));
  const mode = L.data.mode || 'mirror';
  const src = L.data.source || 'rms';
  const A = env.song?.A;
  const time = env.time;
  const val = (i) => {
    const d = Math.abs(i - (n - 1) / 2) / (n / 2);           // فاصله از وسط ۰..۱
    const lag = mode === 'bars' ? (i / n) * 0.6 : d * 0.45;
    const v = A?.curve ? A.curve(src, Math.max(0, time - lag)) : 0.3 + 0.3 * Math.sin(time * 3 + i);
    const k = (env.kick || 0) * (1 - d) * 0.5;
    return clamp((v * 0.85 + k) * (P.gain / 100), 0, 1.4);
  };
  const g = ctx.createLinearGradient(0, P.h / 2, 0, -P.h / 2);
  g.addColorStop(0, P.fill); g.addColorStop(1, P.fill2);
  ctx.fillStyle = g; ctx.strokeStyle = g;

  if (mode === 'circle') {
    const r0 = Math.min(P.w, P.h * 3) / 4;
    const bw = ((Math.PI * 2 * r0) / n) * (1 - P.gap / 100);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const len = 6 + val(i) * P.h * 0.5;
      ctx.save(); ctx.rotate(a);
      ctx.fillRect(r0, -bw / 2, len, bw);
      ctx.restore();
    }
    return;
  }
  if (mode === 'wave') {
    ctx.lineWidth = Math.max(2, P.h / 40); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = -P.w / 2 + (i / (n - 1)) * P.w;
      const y = Math.sin(i * 0.7 + time * 6) * val(i) * P.h * 0.5;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    return;
  }
  const cw = P.w / n, bw = cw * (1 - P.gap / 100);
  for (let i = 0; i < n; i++) {
    const x = -P.w / 2 + i * cw + (cw - bw) / 2;
    const hgt = Math.max(2, val(i) * P.h);
    if (mode === 'bars') ctx.fillRect(x, P.h / 2 - hgt, bw, hgt);
    else ctx.fillRect(x, -hgt / 2, bw, hgt);
  }
}

/* ── لایهٔ کد ─────────────────────────────────────────────── */
function drawCode(ctx, st, env, errors) {
  const { L } = st;
  const p=env.profile;
  const compiled=p ? p.run('code.compile',L,()=>compileCode(L.data.code)) : compileCode(L.data.code);
  const { fn, error } = compiled;
  if (error) { errors.set(L.id, error); return; }
  if (!fn) return;
  try {
    ctx.save();
    const execution=p?.begin('code.execute',L);
    try { fn(ctx, codeEnv({
      ctx, lt: st.lt, time: env.time, dur: st.dur, kick: env.kick, rms: env.rms, low: env.low,
      beat: env.beat, pulse: env.pulse, W: env.W, H: env.H, P: st.P, acc: env.acc, song: env.song,
      lineText: env.lineText, fx: env.fx, exporting: !!env.exporting,
    })); } finally { p?.end(execution); }
    ctx.restore();
    errors.delete(L.id);
  } catch (err) {
    ctx.restore();
    errors.set(L.id, 'خطای اجرا: ' + (err?.message || err));
  }
}

/* ── اندازهٔ کادر لایه (برای انتخاب و دستگیره‌ها) ───────────── */
export function layerBounds(ctx, st, media, env) {
  const { L, P } = st;
  switch (L.type) {
    case 'text': { const m = textMetrics(ctx, L, P); return { w: m.w + 20, h: m.h + 10 }; }
    case 'shape': return { w: Math.max(P.w, 8), h: L.data.kind === 'line' ? Math.max(P.h / 5, 24) : Math.max(P.h, 8) };
    case 'image': case 'video': {
      const it = media?.get(L.data.media);
      return { w: P.w, h: it?.ready ? P.w * (it.h / Math.max(1, it.w)) : P.w * 0.5625 };
    }
    case 'spectrum': case 'code': return { w: P.w, h: P.h };
    case 'draw': return { w: P.w, h: P.h };
    case 'audio': return { w: 800, h: 60 };
    case 'adjust': return { w: env.W, h: env.H };
    default: return { w: 80, h: 80 };
  }
}

/* ── رندرر ────────────────────────────────────────────────── */
export class MotionRenderer {
  constructor() {
    this._c = {};
    this.errors = new Map();        // id لایه ← پیام خطای کد
  }

  _scratch(name, w, h) {
    let c = this._c[name];
    if (!c) c = this._c[name] = document.createElement('canvas');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none';
    x.clearRect(0, 0, w, h);
    return c;
  }

  /** کاشی نویز ثابت برای «دانهٔ فیلم» — یک‌بار ساخته می‌شود */
  _noiseTile() {
    if (this._nt) return this._nt;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), img = x.createImageData(256, 256), q = img.data;
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < q.length; i += 4) { const v = rnd() * 255; q[i] = q[i + 1] = q[i + 2] = v; q[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    return (this._nt = c);
  }

  /** کادر لایه روی بوم (پیکسل)، برای افکت‌هایی مثل برق زدن و گرادیان */
  _geo(ctx, st, base, env, media) {
    return () => {
      if (st.L.type === 'adjust') return null;
      const b = layerBounds(ctx, st, media, env);
      const m = M.mul(base, st.world);
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => M.apply(m, sx * b.w / 2, sy * b.h / 2));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      // حاشیه برای سایه، دورخط و حرکت تکرارکننده
      const pad = Math.max(16, 0.15 * Math.max(Math.max(...xs) - x, Math.max(...ys) - y));
      const rep = st.fx.some(f => f.type === 'repeat' || f.type === 'mirror' || f.kind === 'text');
      if (rep) return null;
      return { x: x - pad, y: y - pad, w: Math.max(...xs) - x + pad * 2, h: Math.max(...ys) - y + pad * 2 };
    };
  }

  /** محتوای لایه + افکت‌های «draw» (تکرار، آینه) با ترنسفرم فعلی ctx */
  _content(ctx, st, env, media) {
    const p=env.profile;
    if(!p)return this._contentImpl(ctx,st,env,media);
    return p.run('layer.content',st.L,()=>withProfileContext(ctx,p,st.L,()=>this._contentImpl(ctx,st,env,media)));
  }

  _contentImpl(ctx, st, env, media) {
    const draw = () => {
      switch (st.L.type) {
        case 'text': drawText(ctx, st); break;
        case 'shape': drawShape(ctx, st); break;
        case 'image': case 'video': drawMedia(ctx, st, media, env); break;
        case 'spectrum': drawSpectrum(ctx, st, env); break;
        case 'draw': drawScribble(ctx, st); break;
        case 'code': drawCode(ctx, st, env, this.errors); break;
        default: break;
      }
    };
    const wipe = st.mods.wipe;
    if (wipe) {
      const b = layerBounds(ctx, st, media, env), u = clamp(wipe.u);
      ctx.save(); ctx.beginPath();
      if (wipe.dir === 'rtl') ctx.rect(b.w / 2 - b.w * u, -b.h, b.w * u, b.h * 2);
      else if (wipe.dir === 'ltr') ctx.rect(-b.w / 2, -b.h, b.w * u, b.h * 2);
      else ctx.rect(-b.w, b.h / 2 - b.h * u, b.w * 2, b.h * u);
      ctx.clip();
    }
    const crop = st.fx.find(f => f.type === 'crop');
    if (crop) {
      const b = layerBounds(ctx, st, media, env), v = crop.v;
      const x0 = -b.w / 2 + b.w * clamp(v.r / 100), x1 = b.w / 2 - b.w * clamp(v.l / 100);
      const y0 = -b.h / 2 + b.h * clamp(v.t / 100), y1 = b.h / 2 - b.h * clamp(v.b / 100);
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)); ctx.clip();
    }
    const rep = st.fx.find(f => f.type === 'repeat');
    const mir = st.fx.find(f => f.type === 'mirror');
    const once = () => {
      if (!mir) { draw(); return; }
      draw();
      const v = mir.v;
      ctx.save();
      ctx.globalAlpha *= v.op / 100;
      if (v.axis >= 0.5) { ctx.translate(0, v.gap); ctx.scale(1, -1); }
      else { ctx.translate(v.gap, 0); ctx.scale(-1, 1); }
      draw();
      ctx.restore();
    };
    if (rep) {
      const v = rep.v, n = Math.max(1, Math.round(v.count));
      for (let i = n - 1; i >= 0; i--) {
        ctx.save();
        ctx.translate(v.dx * i, v.dy * i);
        ctx.rotate((v.rot * i * Math.PI) / 180);
        const s = Math.pow(v.scale / 100, i);
        ctx.scale(s, s);
        ctx.globalAlpha *= 1 - (v.fade / 100) * (n > 1 ? i / (n - 1) : 0);
        once();
        ctx.restore();
      }
    } else once();
    if (crop) ctx.restore();
    if (wipe) ctx.restore();
  }

  /** کشیدن یک وضعیت روی ctx با ماتریس base·world */
  _drawState(ctx, st, base, env, media) {
    const m = M.mul(base, st.world);
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    this._content(ctx, st, env, media);
  }

  /** لایه را (با تاری حرکت اگر لازم است) روی یک بوم شفاف تازه می‌کشد */
  _renderToBuffer(name, cw, ch, L, st, t, env, base, byId, media) {
    if(!env.profile)return this._renderToBufferImpl(name,cw,ch,L,st,t,env,base,byId,media);
    return env.profile.run('layer.buffer',L,()=>this._renderToBufferImpl(name,cw,ch,L,st,t,env,base,byId,media));
  }

  _renderToBufferImpl(name, cw, ch, L, st, t, env, base, byId, media) {
    const buf = this._scratch(name, cw, ch);
    const bx = buf.getContext('2d');
    const mb = clamp((L.mblur || 0) / 100);
    if (mb > 0 && !env.noMotionBlur) {
      const n = env.exporting ? 8 : 4;
      const shutter = mb * 4 * (env.frameDur || 1 / 60);
      const tmp = this._scratch(name + 'm', cw, ch);
      const tx = tmp.getContext('2d');
      for (let i = 0; i < n; i++) {
        const ts = t - shutter * (i / (n - 1));
        const s2 = i === 0 ? st : evalLayer(L, ts, frameEnv(env.song, ts, env.W, env.H, { index: env.index }), byId, null);
        tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, cw, ch);
        tx.save(); this._drawState(tx, s2, base, env, media); tx.restore();
        bx.setTransform(1, 0, 0, 1, 0, 0);
        bx.globalAlpha = 1 / (i + 1);
        bx.drawImage(tmp, 0, 0);
      }
      bx.globalAlpha = 1;
    } else {
      bx.save(); this._drawState(bx, st, base, env, media); bx.restore();
    }
    return buf;
  }

  /** زنجیرهٔ افکت‌های تصویری روی بافر */
  _filters(src, st, px, env, geo = null) {
    if(!env.profile)return this._filtersImpl(src,st,px,env,geo);
    return env.profile.run('layer.filters',st.L,()=>this._filtersImpl(src,st,px,env,geo));
  }

  _filtersImpl(src, st, px, env, geo = null) {
    const cw = src.width, ch = src.height;
    let cur = src;
    // کادر لایه روی بافر (پیکسل) — برای افکت‌هایی که به جا و اندازهٔ لایه وابسته‌اند
    let G = null;
    const box = () => {
      if (G) return G;
      const g = (geo && geo()) || { x: 0, y: 0, w: cw, h: ch };
      const x = Math.max(0, Math.floor(g.x)), y = Math.max(0, Math.floor(g.y));
      const x2 = Math.min(cw, Math.ceil(g.x + g.w)), y2 = Math.min(ch, Math.ceil(g.y + g.h));
      G = { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y), cx: g.x + g.w / 2, cy: g.y + g.h / 2, fw: g.w, fh: g.h };
      return G;
    };
    const tinted = (img, color, name = 'tintT') => {
      const c = this._scratch(name, cw, ch), x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, cw, ch);
      x.globalCompositeOperation = 'source-over';
      return c;
    };
    // کار پیکسل‌به‌پیکسل، فقط داخل کادر لایه تا سریع بماند
    const pixelOp = (d, fn) => {
      d.drawImage(cur, 0, 0);
      const b = box();
      if (b.w < 1 || b.h < 1) return;
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
      for (let i = 0; i < q.length; i += 4) if (q[i + 3]) fn(q, i);
      d.putImageData(img, b.x, b.y);
    };
    // چند نسخهٔ جابه‌جاشده با وزن برابر (برای تاری‌های جهت‌دار)
    const smear = (d, n, place) => {
      const acc = this._scratch('smear', cw, ch), ax = acc.getContext('2d');
      for (let i = 0; i < n; i++) {
        ax.save(); ax.globalAlpha = 1 / (i + 1); place(ax, i / Math.max(1, n - 1)); ax.drawImage(cur, 0, 0); ax.restore();
      }
      d.drawImage(acc, 0, 0);
    };
    const rgbSplit = (d, img, r, a) => {
      const tmp = this._scratch('rgbT', cw, ch), tx = tmp.getContext('2d');
      d.globalCompositeOperation = 'lighter';
      for (const [col, k] of [['#FF0000', 1], ['#00FF00', 0], ['#0000FF', -1]]) {
        tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, cw, ch);
        tx.drawImage(img, 0, 0);
        tx.globalCompositeOperation = 'multiply'; tx.fillStyle = col; tx.fillRect(0, 0, cw, ch);
        tx.globalCompositeOperation = 'destination-in'; tx.drawImage(img, 0, 0);
        d.drawImage(tmp, Math.cos(a) * r * k, Math.sin(a) * r * k);
      }
      d.globalCompositeOperation = 'source-over';
    };
    // فاز ۶–۷: تاب‌دادن پیکسلی داخل کادر لایه — fn فاصلهٔ هر پیکسل از
    // مرکز را می‌گیرد و فاصلهٔ مبدأ را برمی‌گرداند (نمونه‌برداری نزدیک‌ترین)
    const warp = (d, fn) => {
      d.drawImage(cur, 0, 0);
      const b = box();
      if (b.w < 2 || b.h < 2) return;
      const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data, src = new Uint8ClampedArray(q);
      const hw = b.w / 2, hh = b.h / 2;
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const dx = x - hw, dy = y - hh;
        const [sx, sy] = fn(dx, dy, b);
        const cx = Math.max(0, Math.min(b.w - 1, Math.round(hw + sx)));
        const cy = Math.max(0, Math.min(b.h - 1, Math.round(hh + sy)));
        const o = (y * b.w + x) * 4, so = (cy * b.w + cx) * 4;
        q[o] = src[so]; q[o + 1] = src[so + 1]; q[o + 2] = src[so + 2]; q[o + 3] = src[so + 3];
      }
      d.putImageData(img, b.x, b.y);
    };
    const time = env.time || 0;
    const next = name => this._scratch(name, cw, ch);
    let flip = 0;
    const out = () => next((flip++ % 2) ? 'fA' : 'fB');

    const list = [...st.fx.filter(f => f.kind === 'filter')];
    if (st.mods.blur > 0.3) list.unshift({ type: 'blur', v: { r: st.mods.blur } });

    for (const f of list) {
      const v = f.v;
      const dst = out(), d = dst.getContext('2d');
      switch (f.type) {
        case 'blur':
          d.filter = `blur(${Math.max(0, v.r * px)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
          break;
        case 'glow': {
          const tint = this._scratch('glowT', cw, ch), g = tint.getContext('2d');
          g.drawImage(cur, 0, 0);
          g.globalCompositeOperation = 'source-in'; g.fillStyle = v.color; g.fillRect(0, 0, cw, ch);
          d.globalCompositeOperation = 'lighter';
          d.filter = `blur(${Math.max(0.5, v.r * px)}px)`;
          let k = v.amt / 100;
          while (k > 0.001) { d.globalAlpha = Math.min(1, k); d.drawImage(tint, 0, 0); k -= 1; }
          d.filter = 'none'; d.globalAlpha = 1;
          d.globalCompositeOperation = 'source-over';
          d.drawImage(cur, 0, 0);
          break;
        }
        case 'shadow':
          d.filter = `drop-shadow(${v.dx * px}px ${v.dy * px}px ${Math.max(0, v.r * px)}px ${rgbaStr(v.color, v.op / 100)})`;
          d.drawImage(cur, 0, 0); d.filter = 'none';
          break;
        case 'color':
          d.filter = `brightness(${v.bright}%) contrast(${v.contrast}%) saturate(${v.sat}%) `
            + `hue-rotate(${v.hue}deg) grayscale(${v.gray}%) sepia(${v.sepia}%) invert(${v.invert}%)`;
          d.drawImage(cur, 0, 0); d.filter = 'none';
          break;
        case 'tint':
          d.drawImage(cur, 0, 0);
          d.globalCompositeOperation = 'source-atop';
          d.globalAlpha = v.amt / 100; d.fillStyle = v.color; d.fillRect(0, 0, cw, ch);
          break;
        case 'pixel': {
          const s = Math.max(1, v.size * px);
          const sw = Math.max(1, Math.round(cw / s)), sh = Math.max(1, Math.round(ch / s));
          const sm = this._scratch('pix', sw, sh), sx = sm.getContext('2d');
          sx.drawImage(cur, 0, 0, sw, sh);
          d.imageSmoothingEnabled = false; d.drawImage(sm, 0, 0, cw, ch); d.imageSmoothingEnabled = true;
          break;
        }
        case 'rgb':
          rgbSplit(d, cur, v.amt * px, (v.ang * Math.PI) / 180);
          break;
        case 'glitch': {
          const mix = v.beat / 100;
          const amt = (v.amt / 100) * ((1 - mix) + mix * clamp((env.kick || 0) * 2));
          const f0 = Math.floor((env.time || 0) * v.speed);
          const bands = 14;
          for (let i = 0; i < bands; i++) {
            const y = (i / bands) * ch, h = ch / bands + 1;
            const hsh = Math.sin((f0 * 13.1 + i * 7.7) * 12.9898) * 43758.5453;
            const rnd = hsh - Math.floor(hsh);
            const dx = rnd > 0.6 ? (rnd - 0.8) * cw * 0.12 * amt : 0;
            d.drawImage(cur, 0, y, cw, h, dx, y, cw, h);
          }
          break;
        }
        case 'chroma': {
          d.drawImage(cur, 0, 0);
          const img = d.getImageData(0, 0, cw, ch), p = img.data;
          const [kr, kg, kb] = parseColor(v.color);
          const tol = (v.tol / 100) * 442, soft = Math.max(1, (v.soft / 100) * 442);
          for (let i = 0; i < p.length; i += 4) {
            if (!p[i + 3]) continue;
            const dist = Math.hypot(p[i] - kr, p[i + 1] - kg, p[i + 2] - kb);
            if (dist < tol + soft) p[i + 3] *= clamp((dist - tol) / soft);
          }
          d.putImageData(img, 0, 0);
          break;
        }
        case 'vignette': {
          d.drawImage(cur, 0, 0);
          d.globalCompositeOperation = 'source-atop';
          const r = Math.hypot(cw, ch) / 2;
          const g = d.createRadialGradient(cw / 2, ch / 2, r * (v.size / 100) * 0.6, cw / 2, ch / 2, r);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${v.amt / 100})`);
          d.fillStyle = g; d.fillRect(0, 0, cw, ch);
          break;
        }
        /* ── نور و سایه ── */
        case 'outline': {
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
          break;
        }
        case 'extrude': case 'longShadow': {
          const L = v.len * px;
          const [r, g, b, al] = parseColor(v.color);
          const t = tinted(cur, `rgb(${r},${g},${b})`);
          const a = (v.ang * Math.PI) / 180;
          const n = Math.max(1, Math.min(36, Math.ceil(L / Math.max(1.5, px * 1.5))));
          const acc = this._scratch('extr', cw, ch), ax = acc.getContext('2d');
          for (let i = n; i >= 1; i--) {
            const k = (i / n) * L;
            ax.drawImage(t, Math.cos(a) * k, Math.sin(a) * k);
          }
          if (f.type === 'extrude') {
            // لبهٔ جلویی کمی روشن‌تر تا حس عمق بدهد
            ax.globalAlpha = 0.35; ax.filter = 'brightness(160%)';
            ax.drawImage(t, Math.cos(a) * L / n, Math.sin(a) * L / n);
            ax.filter = 'none'; ax.globalAlpha = 1;
          }
          d.globalAlpha = al; d.drawImage(acc, 0, 0); d.globalAlpha = 1;
          d.drawImage(cur, 0, 0);
          break;
        }
        case 'shine': {
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
          break;
        }
        case 'leak': {
          d.drawImage(cur, 0, 0);
          const b = box(), R = Math.max(b.fw, b.fh);
          const lk = this._scratch('leak', cw, ch), lx = lk.getContext('2d');
          const sp = time * (v.speed / 100);
          const blobs = [[v.color, 0.2, 0.8], [v.color2, 7.3, 0.6], [v.color, 13.1, 0.45]];
          lx.globalCompositeOperation = 'lighter';
          for (const [col, seed, rr] of blobs) {
            const bx = b.cx + noise(sp + seed) * b.fw * 0.6, by = b.cy + noise(sp * 0.8 + seed + 40) * b.fh * 0.6;
            const g = lx.createRadialGradient(bx, by, 0, bx, by, R * rr);
            g.addColorStop(0, rgbaStr(col, 0.9)); g.addColorStop(1, rgbaStr(col, 0));
            lx.fillStyle = g; lx.fillRect(0, 0, cw, ch);
          }
          lx.globalCompositeOperation = 'destination-in'; lx.drawImage(cur, 0, 0);
          d.globalCompositeOperation = 'screen'; d.globalAlpha = v.amt / 100;
          d.drawImage(lk, 0, 0);
          break;
        }
        case 'beatFlash': {
          const k = clamp((env.kick || 0) * (v.amt / 100), 0, 3);
          if (k > 0.01) d.filter = `brightness(${100 + k * 80}%)`;
          d.drawImage(cur, 0, 0); d.filter = 'none';
          if (k > 0.01) {
            d.globalCompositeOperation = 'source-atop'; d.globalAlpha = Math.min(0.75, k * 0.45);
            d.fillStyle = v.color; d.fillRect(0, 0, cw, ch);
          }
          break;
        }
        /* ── رنگ ── */
        case 'duotone': {
          const [r1, g1, b1] = parseColor(v.c1), [r2, g2, b2] = parseColor(v.c2), k = v.amt / 100;
          pixelOp(d, (q, i) => {
            const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
            q[i] += (r1 + (r2 - r1) * l - q[i]) * k;
            q[i + 1] += (g1 + (g2 - g1) * l - q[i + 1]) * k;
            q[i + 2] += (b1 + (b2 - b1) * l - q[i + 2]) * k;
          });
          break;
        }
        case 'gradOver': {
          d.drawImage(cur, 0, 0);
          const b = box(), a = (v.ang * Math.PI) / 180, r = Math.hypot(b.fw, b.fh) / 2;
          const g = d.createLinearGradient(b.cx - Math.cos(a) * r, b.cy - Math.sin(a) * r, b.cx + Math.cos(a) * r, b.cy + Math.sin(a) * r);
          g.addColorStop(0, v.c1); g.addColorStop(1, v.c2);
          d.globalCompositeOperation = 'source-atop'; d.globalAlpha = v.amt / 100;
          d.fillStyle = g; d.fillRect(0, 0, cw, ch);
          break;
        }
        case 'hueCycle':
          d.filter = `hue-rotate(${(time * v.speed * 360) % 360}deg) saturate(${v.sat}%)`;
          d.drawImage(cur, 0, 0); d.filter = 'none';
          break;
        case 'posterize': {
          const n = Math.max(2, Math.round(v.levels)) - 1;
          pixelOp(d, (q, i) => {
            q[i] = Math.round((q[i] / 255) * n) / n * 255;
            q[i + 1] = Math.round((q[i + 1] / 255) * n) / n * 255;
            q[i + 2] = Math.round((q[i + 2] / 255) * n) / n * 255;
          });
          break;
        }
        case 'threshold': {
          const c1 = parseColor(v.c1), c2 = parseColor(v.c2), lv = (v.level / 100) * 255;
          pixelOp(d, (q, i) => {
            const c = q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114 >= lv ? c2 : c1;
            q[i] = c[0]; q[i + 1] = c[1]; q[i + 2] = c[2];
          });
          break;
        }
        /* ── رترو ── */
        case 'vhs': {
          const k = v.amt / 100;
          const soft = this._scratch('vhsS', cw, ch), sx = soft.getContext('2d');
          sx.filter = `saturate(${100 + 40 * k}%) contrast(${100 + 10 * k}%) blur(${0.8 * k * px}px)`;
          sx.drawImage(cur, 0, 0); sx.filter = 'none';
          rgbSplit(d, soft, (1 + 5 * k) * px, 0);
          // نوار «ترکینگ» که آرام پایین می‌رود و کمی کج می‌شود
          const b = box(), bh = Math.max(4, b.h * 0.07);
          const by = b.y + (((time * 0.23) % 1.3) - 0.15) * b.h;
          const cp = this._scratch('vhsB', cw, ch), cx2 = cp.getContext('2d');
          cx2.drawImage(dst, 0, 0);
          d.save(); d.beginPath(); d.rect(0, by, cw, bh); d.clip();
          d.clearRect(0, by, cw, bh);
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
          break;
        }
        case 'scan': {
          d.drawImage(cur, 0, 0);
          const b = box(), gap = Math.max(2, v.gap * px), off = ((time * v.speed * px) % gap + gap) % gap;
          d.globalCompositeOperation = 'source-atop';
          d.fillStyle = `rgba(0,0,0,${v.op / 100})`;
          for (let y = b.y - gap + off; y < b.y + b.h; y += gap) d.fillRect(b.x, y, b.w, gap / 2);
          break;
        }
        case 'grain': {
          d.drawImage(cur, 0, 0);
          const tile = this._noiseTile();
          const gr = this._scratch('grain', cw, ch), gx = gr.getContext('2d');
          const fr = Math.floor(time * 24);
          const hs = n => { const x = Math.sin(n * 91.7 + 13.3) * 43758.5453; return x - Math.floor(x); };
          const sc = Math.max(1, v.size * px * 0.5);
          gx.save();
          gx.translate(-hs(fr) * 256 * sc, -hs(fr + 0.5) * 256 * sc); gx.scale(sc, sc);
          gx.fillStyle = gx.createPattern(tile, 'repeat');
          gx.fillRect(0, 0, cw / sc + 512, ch / sc + 512);
          gx.restore();
          gx.globalCompositeOperation = 'destination-in'; gx.drawImage(cur, 0, 0);
          d.globalCompositeOperation = 'overlay'; d.globalAlpha = Math.min(1, v.amt / 60);
          d.drawImage(gr, 0, 0);
          break;
        }
        case 'halftone': {
          const b = box();
          let s = Math.max(2, v.size * px);
          if ((b.w / s) * (b.h / s) > 30000) s = Math.sqrt((b.w * b.h) / 30000);
          const sw = Math.max(1, Math.ceil(b.w / s)), sh = Math.max(1, Math.ceil(b.h / s));
          const sm = this._scratch('half', sw, sh), sx = sm.getContext('2d');
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
          break;
        }
        /* ── تاری و تحریف ── */
        case 'zoomBlur': {
          const b = box(), k = v.amt / 100;
          smear(d, 10, (ax, u) => {
            const s = 1 + k * 0.35 * u;
            ax.translate(b.cx, b.cy); ax.scale(s, s); ax.translate(-b.cx, -b.cy);
          });
          break;
        }
        case 'dirBlur': {
          const a = (v.ang * Math.PI) / 180, L = v.len * px;
          smear(d, 10, (ax, u) => ax.translate(Math.cos(a) * L * (u - 0.5), Math.sin(a) * L * (u - 0.5)));
          break;
        }
        case 'wave': {
          const b = box(), A = v.amp * px, len = Math.max(1, v.len * px), ph = time * v.speed;
          const band = Math.max(2, Math.round(2 * px));
          if (v.dir >= 0.5) {
            for (let x = Math.max(0, b.x - A); x < Math.min(cw, b.x + b.w + A); x += band) {
              const dy = Math.sin((x / len) * Math.PI * 2 + ph) * A;
              d.drawImage(cur, x, 0, band, ch, x, dy, band, ch);
            }
          } else {
            for (let y = Math.max(0, b.y - A); y < Math.min(ch, b.y + b.h + A); y += band) {
              const dx = Math.sin((y / len) * Math.PI * 2 + ph) * A;
              d.drawImage(cur, 0, y, cw, band, dx, y, cw, band);
            }
          }
          break;
        }
        case 'kaleido': {
          const b = box(), q = this._scratch('kal', cw, ch), qx = q.getContext('2d');
          const four = v.mode < 0.5;
          qx.beginPath(); qx.rect(0, 0, b.cx, four ? b.cy : ch); qx.clip(); qx.drawImage(cur, 0, 0);
          const put = (fx, fy) => {
            d.save(); d.translate(b.cx, b.cy); d.scale(fx, fy); d.translate(-b.cx, -b.cy); d.drawImage(q, 0, 0); d.restore();
          };
          put(1, 1); put(-1, 1);
          if (four) { put(1, -1); put(-1, -1); }
          break;
        }
        /* ── فاز ۴ هم‌ترازی با Alight Motion ── */
        case 'sharpen': case 'findEdges': {
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
              if (f.type === 'sharpen') {
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
          break;
        }
        case 'spinBlur': {
          const b = box();
          smear(d, 12, (ax, u) => {
            ax.translate(b.cx, b.cy); ax.rotate((v.amt / 100) * 0.6 * (u - 0.5)); ax.translate(-b.cx, -b.cy);
          });
          break;
        }
        case 'vibrance': {
          const k = v.amt / 100;
          pixelOp(d, (q, i) => {
            const mx = Math.max(q[i], q[i + 1], q[i + 2]), mn = Math.min(q[i], q[i + 1], q[i + 2]);
            if (mx <= mn) return;
            const sat = (mx - mn) / mx, avg = (q[i] + q[i + 1] + q[i + 2]) / 3, boost = 1 + k * (1 - sat);
            q[i] = avg + (q[i] - avg) * boost; q[i + 1] = avg + (q[i + 1] - avg) * boost; q[i + 2] = avg + (q[i + 2] - avg) * boost;
          });
          break;
        }
        case 'lumaKey': {
          const lv = v.level / 100, soft = Math.max(0.01, v.soft / 100);
          pixelOp(d, (q, i) => {
            const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
            const fct = v.mode >= 0.5 ? clamp((lv + soft / 2 - l) / soft) : clamp((l - (lv - soft / 2)) / soft);
            q[i + 3] *= fct;
          });
          break;
        }
        case 'wipe': {
          const b = box(), p = clamp(v.prog / 100, 0, 1);
          if (p <= 0) break;
          if (p >= 1) { d.drawImage(cur, 0, 0); break; }
          const a0 = (v.ang * Math.PI) / 180, r = Math.hypot(b.fw, b.fh);
          d.save(); d.beginPath(); d.moveTo(b.cx, b.cy);
          d.arc(b.cx, b.cy, r, a0, a0 + p * Math.PI * 2); d.closePath(); d.clip();
          d.drawImage(cur, 0, 0); d.restore();
          break;
        }
        /* ── فاز ۶–۷: افکت‌های تازهٔ Alight ── */
        case 'bulge': {
          const amt = v.amt / 100, r = Math.max(box().w, box().h) / 2 * (v.r / 100);
          warp(d, (dx, dy) => {
            const dist = Math.hypot(dx, dy);
            if (dist >= r || dist < 0.5) return [dx, dy];
            const k = Math.max(0.2, 1 - amt * (1 - (dist / r) * (dist / r)));
            return [dx * k, dy * k];
          });
          break;
        }
        case 'fisheye': {
          const amt = v.amt / 100, r = Math.hypot(box().w, box().h) / 2;
          warp(d, (dx, dy) => {
            const dist = Math.hypot(dx, dy), rn = Math.min(1, dist / r);
            const k = 1 + amt * rn * rn * 0.5;
            return [dx * k, dy * k];
          });
          break;
        }
        case 'twirl': {
          const amt = v.amt / 100 * Math.PI, r = Math.max(box().w, box().h) / 2 * (v.r / 100);
          warp(d, (dx, dy) => {
            const dist = Math.hypot(dx, dy);
            if (dist >= r) return [dx, dy];
            const a = amt * (1 - dist / r), c = Math.cos(a), s = Math.sin(a);
            return [dx * c - dy * s, dx * s + dy * c];
          });
          break;
        }
        case 'ripple': {
          const A = v.amp * px, len = Math.max(1, v.len * px), ph = time * v.speed;
          warp(d, (dx, dy) => {
            const dist = Math.hypot(dx, dy);
            if (dist < 0.5) return [dx, dy];
            const off = Math.sin((dist / len) * Math.PI * 2 - ph) * A;
            return [dx * (1 + off / dist), dy * (1 + off / dist)];
          });
          break;
        }
        case 'noise': {
          d.drawImage(cur, 0, 0);
          const b = box(), pat = d.createPattern(this._noiseTile(), 'repeat');
          if (pat) { d.save(); d.globalAlpha = v.amt / 100; d.globalCompositeOperation = 'overlay'; d.fillStyle = pat; d.fillRect(b.x, b.y, b.w, b.h); d.restore(); }
          break;
        }
        case 'channelShift': {
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
          break;
        }
        case 'solarize': {
          const lv = v.level / 100 * 255;
          pixelOp(d, (q, i) => {
            for (let c = 0; c < 3; c++) if (q[i + c] > lv) q[i + c] = 255 - q[i + c];
          });
          break;
        }
        case 'emboss': {
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
          break;
        }
        case 'tile': {
          const b = box(), nx = Math.max(1, Math.round(v.nx)), ny = Math.max(1, Math.round(v.ny));
          d.save(); d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
            d.drawImage(cur, b.x, b.y, b.w, b.h, b.x + i * b.w / nx, b.y + j * b.h / ny, b.w / nx, b.h / ny);
          d.restore();
          break;
        }
        case 'squeeze': {
          const b = box(), k = Math.max(0.1, 1 - v.amt / 100), w2 = b.w * k;
          d.drawImage(cur, b.x, b.y, b.w, b.h, b.cx - w2 / 2, b.y, w2, b.h);
          break;
        }
        case 'clouds': {
          d.drawImage(cur, 0, 0);
          const b = box(), sc = Math.max(10, v.scale);
          const tile = this._noiseTile();
          const tmp = this._scratch('cloud', cw, ch), tx = tmp.getContext('2d');
          tx.filter = `blur(${Math.max(1, sc / 4 * px)}px)`;
          tx.drawImage(tile, b.x, b.y, b.w, b.h);
          tx.filter = 'none';
          d.save(); d.globalAlpha = v.amt / 100; d.globalCompositeOperation = 'overlay';
          d.drawImage(tmp, 0, 0); d.restore();
          break;
        }
        case 'checker': {
          d.drawImage(cur, 0, 0);
          const b = box(), s = Math.max(2, v.size * px);
          d.save(); d.globalAlpha = v.op / 100; d.fillStyle = '#FFFFFF';
          d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
          for (let y = 0; y * s < b.h; y++) for (let x = 0; x * s < b.w; x++)
            if ((x + y) % 2 === 0) d.fillRect(b.x + x * s, b.y + y * s, s, s);
          d.restore();
          break;
        }
        case 'tiltShift': {
          const b = box(), band = b.h * (v.band / 100);
          const blurred = this._scratch('tilt', cw, ch), bx2 = blurred.getContext('2d');
          bx2.filter = `blur(${Math.max(0, v.r * px)}px)`; bx2.drawImage(cur, 0, 0); bx2.filter = 'none';
          d.drawImage(cur, 0, 0);
          d.drawImage(blurred, b.x, b.y, b.w, (b.h - band) / 2, b.x, b.y, b.w, (b.h - band) / 2);
          d.drawImage(blurred, b.x, b.y + (b.h + band) / 2, b.w, (b.h - band) / 2, b.x, b.y + (b.h + band) / 2, b.w, (b.h - band) / 2);
          break;
        }
        case 'flipH': {
          const b = box();
          d.save(); d.translate(b.cx, 0); d.scale(-1, 1); d.translate(-b.cx, 0);
          d.drawImage(cur, 0, 0); d.restore();
          break;
        }
        case 'flipV': {
          const b = box();
          d.save(); d.translate(0, b.cy); d.scale(1, -1); d.translate(0, -b.cy);
          d.drawImage(cur, 0, 0); d.restore();
          break;
        }
        case 'hueShift': {
          d.filter = `hue-rotate(${v.deg}deg)`; d.drawImage(cur, 0, 0); d.filter = 'none';
          break;
        }
        case 'invertFx': {
          pixelOp(d, (q, i) => { q[i] = 255 - q[i]; q[i + 1] = 255 - q[i + 1]; q[i + 2] = 255 - q[i + 2]; });
          break;
        }
        case 'pinch': {
          const amt = v.amt / 100, r = Math.max(box().w, box().h) / 2 * (v.r / 100);
          warp(d, (dx, dy) => {
            const dist = Math.hypot(dx, dy);
            if (dist >= r || dist < 0.5) return [dx, dy];
            const k = 1 + amt * (1 - (dist / r) * (dist / r));
            return [dx * k, dy * k];
          });
          break;
        }
        case 'bend': {
          const amt = v.amt * px, hh = Math.max(1, box().h / 2);
          warp(d, (dx, dy) => [dx + amt * (1 - (dy / hh) * (dy / hh)), dy]);
          break;
        }
        case 'fractal': {
          d.drawImage(cur, 0, 0);
          const b = box(), tile = this._noiseTile();
          for (const [scale, alpha] of [[1, 0.6], [0.35, 0.4]]) {
            const tmp = this._scratch('frac', cw, ch), tx = tmp.getContext('2d');
            tx.filter = `blur(${Math.max(1, v.scale * scale / 4 * px)}px)`;
            tx.drawImage(tile, b.x, b.y, b.w, b.h); tx.filter = 'none';
            d.save(); d.globalAlpha = (v.amt / 100) * alpha; d.globalCompositeOperation = 'overlay';
            d.drawImage(tmp, 0, 0); d.restore();
          }
          break;
        }
        case 'grid': {
          d.drawImage(cur, 0, 0);
          const b = box(), s = Math.max(2, v.size * px);
          d.save(); d.globalAlpha = v.op / 100; d.strokeStyle = v.color; d.lineWidth = Math.max(1, px);
          d.beginPath(); d.rect(b.x, b.y, b.w, b.h); d.clip();
          for (let x = b.x; x <= b.x + b.w; x += s) { d.moveTo(x, b.y); d.lineTo(x, b.y + b.h); }
          for (let y = b.y; y <= b.y + b.h; y += s) { d.moveTo(b.x, y); d.lineTo(b.x + b.w, y); }
          d.stroke(); d.restore();
          break;
        }
        case 'matte': {
          const lv = v.level / 100, soft = Math.max(0.01, v.soft / 100);
          pixelOp(d, (q, i) => {
            const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
            const keep = v.mode >= 0.5 ? clamp((lv + soft / 2 - l) / soft) : clamp((l - (lv - soft / 2)) / soft);
            q[i + 3] *= keep;
          });
          break;
        }
        case 'edgeGlow': {
          d.drawImage(cur, 0, 0);
          const b = box();
          if (b.w > 2 && b.h > 2) {
            const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
            const lum = (x, y) => { const o = ((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4; return q[o] * 0.299 + q[o + 1] * 0.587 + q[o + 2] * 0.114; };
            const edge = this._scratch('edge', cw, ch), ex = edge.getContext('2d');
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
          break;
        }
        case 'tilt3d': {
          const b = box(), a = (v.ang * Math.PI) / 180, c = Math.max(0.2, Math.cos(a));
          d.save(); d.translate(b.cx, b.cy);
          if (v.axis >= 0.5) { d.transform(1, 0, -Math.sin(a) * 0.4, c, 0, 0); }
          else { d.transform(c, 0, 0, 1, 0, 0); d.transform(1, Math.sin(a) * 0.4, 0, 1, 0, 0); }
          d.translate(-b.cx, -b.cy); d.drawImage(cur, 0, 0); d.restore();
          break;
        }
        case 'flip3d': {
          const b = box(), k = Math.cos(time * v.speed * Math.PI * 2);
          d.save(); d.translate(b.cx, b.cy); d.scale(Math.max(0.02, Math.abs(k)) * (k < 0 ? -1 : 1), 1);
          d.translate(-b.cx, -b.cy); d.drawImage(cur, 0, 0); d.restore();
          break;
        }
        case 'sphere': {
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
          break;
        }
        case 'temperature': {
          const k = v.amt / 100 * 40;
          pixelOp(d, (q, i) => { q[i] = Math.max(0, Math.min(255, q[i] + k)); q[i + 2] = Math.max(0, Math.min(255, q[i + 2] - k)); });
          break;
        }
        case 'exposure': {
          const k = 1 + v.amt / 100;
          pixelOp(d, (q, i) => { q[i] *= k; q[i + 1] *= k; q[i + 2] *= k; });
          break;
        }
        case 'clarity': {
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
          break;
        }
        case 'perspective': {
          const b = box(), k = v.amt / 100, band = Math.max(2, Math.round(2 * px));
          for (let y = b.y; y < b.y + b.h; y += band) {
            const u = (y - b.y) / Math.max(1, b.h);
            const wScale = 1 - k * (0.5 - u) * 2 * 0.5;
            const w2 = b.w * Math.max(0.2, wScale);
            const x2 = b.cx - w2 / 2;
            d.drawImage(cur, b.x, y, b.w, band, x2, y, w2, band);
          }
          break;
        }
        case 'levels': {
          const bl = v.black / 100, wh = Math.max(bl + 0.01, v.white / 100), gm = v.gamma / 100;
          pixelOp(d, (q, i) => {
            for (let c = 0; c < 3; c++) {
              let u = (q[i + c] / 255 - bl) / (wh - bl);
              u = Math.max(0, Math.min(1, u));
              q[i + c] = Math.pow(u, 1 / gm) * 255;
            }
          });
          break;
        }
        case 'feather': {
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
          break;
        }
        case 'sepiaFx': {
          const k = v.amt / 100;
          pixelOp(d, (q, i) => {
            const r = q[i], g = q[i + 1], b = q[i + 2];
            const sr = r * 0.393 + g * 0.769 + b * 0.189;
            const sg = r * 0.349 + g * 0.686 + b * 0.168;
            const sb = r * 0.272 + g * 0.534 + b * 0.131;
            q[i] = r + (sr - r) * k; q[i + 1] = g + (sg - g) * k; q[i + 2] = b + (sb - b) * k;
          });
          break;
        }
        case 'vintage': {
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
          break;
        }
        case 'neon': {
          d.drawImage(cur, 0, 0);
          const b = box();
          if (b.w > 2 && b.h > 2) {
            const img = d.getImageData(b.x, b.y, b.w, b.h), q = img.data;
            const lum = (x, y) => { const o = ((Math.max(0, Math.min(b.h - 1, y)) * b.w) + Math.max(0, Math.min(b.w - 1, x))) * 4; return q[o] * 0.299 + q[o + 1] * 0.587 + q[o + 2] * 0.114; };
            const edge = this._scratch('neon', cw, ch), ex = edge.getContext('2d');
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
          break;
        }
        case 'innerShadow': {
          d.drawImage(cur, 0, 0);
          const b = box();
          const tmp = this._scratch('insh', cw, ch), tx = tmp.getContext('2d');
          tx.drawImage(cur, 0, 0);
          tx.globalCompositeOperation = 'source-in'; tx.fillStyle = v.color; tx.fillRect(0, 0, cw, ch);
          tx.filter = `blur(${Math.max(0.5, v.r * px)}px)`; tx.drawImage(tmp, 0, 0); tx.filter = 'none';
          d.save(); d.globalAlpha = v.op / 100; d.globalCompositeOperation = 'source-atop';
          d.drawImage(tmp, 0, 0); d.restore();
          break;
        }
        case 'bevel': {
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
          break;
        }
        case 'oilPaint': {
          d.filter = `blur(${Math.max(0.5, (v.amt / 100) * 2 * px)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
          pixelOp(d, (q, i) => {
            const lv = 6;
            q[i] = Math.round(q[i] / 255 * lv) / lv * 255;
            q[i + 1] = Math.round(q[i + 1] / 255 * lv) / lv * 255;
            q[i + 2] = Math.round(q[i + 2] / 255 * lv) / lv * 255;
          });
          break;
        }
        case 'watercolor': {
          d.filter = `blur(${Math.max(0.5, (v.amt / 100) * 1.5 * px)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
          pixelOp(d, (q, i) => {
            const avg = (q[i] + q[i + 1] + q[i + 2]) / 3, boost = 1 + (v.amt / 100) * 0.5;
            q[i] = avg + (q[i] - avg) * boost; q[i + 1] = avg + (q[i + 1] - avg) * boost; q[i + 2] = avg + (q[i + 2] - avg) * boost;
          });
          break;
        }
        case 'pencil': {
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
          break;
        }
        case 'comic': {
          pixelOp(d, (q, i) => {
            const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
            const c = l > v.level / 100 ? 255 : 0;
            q[i] = q[i + 1] = q[i + 2] = c;
          });
          break;
        }
        case 'infrared': {
          pixelOp(d, (q, i) => { const r = q[i]; q[i] = q[i + 1]; q[i + 1] = r; q[i + 2] = q[i + 2] * 0.5; });
          break;
        }
        case 'nightVision': {
          const k = v.amt / 100;
          pixelOp(d, (q, i) => {
            const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114);
            q[i] = l * 0.2 * (1 + k); q[i + 1] = Math.min(255, l * (1 + k)); q[i + 2] = l * 0.2;
          });
          const b = box(), pat = d.createPattern(this._noiseTile(), 'repeat');
          if (pat) { d.save(); d.globalAlpha = 0.15 * k; d.fillStyle = pat; d.fillRect(b.x, b.y, b.w, b.h); d.restore(); }
          break;
        }
        case 'thermal': {
          const stops = [[0, 0, 0, 0], [0.33, 128, 0, 0], [0.66, 255, 128, 0], [1, 255, 255, 220]];
          pixelOp(d, (q, i) => {
            const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
            let s = stops[0];
            for (let j = 1; j < stops.length; j++) if (l >= stops[j - 1][0] && l <= stops[j][0]) { s = stops[j - 1]; const t = (l - s[0]) / (stops[j][0] - s[0]); q[i] = s[1] + (stops[j][1] - s[1]) * t; q[i + 1] = s[2] + (stops[j][2] - s[2]) * t; q[i + 2] = s[3] + (stops[j][3] - s[3]) * t; break; }
            if (l >= 1) { q[i] = 255; q[i + 1] = 255; q[i + 2] = 220; }
          });
          break;
        }
        case 'tritone': {
          const hex = c => [parseInt(c.slice(1, 3), 16) || 0, parseInt(c.slice(3, 5), 16) || 0, parseInt(c.slice(5, 7), 16) || 0];
          const c1 = hex(v.c1), c2 = hex(v.c2), c3 = hex(v.c3);
          pixelOp(d, (q, i) => {
            const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
            let a, b, t;
            if (l < 0.5) { a = c1; b = c2; t = l * 2; } else { a = c2; b = c3; t = (l - 0.5) * 2; }
            q[i] = a[0] + (b[0] - a[0]) * t; q[i + 1] = a[1] + (b[1] - a[1]) * t; q[i + 2] = a[2] + (b[2] - a[2]) * t;
          });
          break;
        }
        /* فاز ۱۶ (موازی) — رندر افکت‌هایی که فقط در schema بودند */
        case 'mosaic': {
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
          break;
        }
        case 'slitScan': {
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
          break;
        }
        case 'crossProcess': {
          const k = v.amt / 100;
          pixelOp(d, (q, i) => {
            const l = (q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114) / 255;
            if (l < 0.5) q[i + 2] = Math.min(255, q[i + 2] + (0.5 - l) * 80 * k);
            else q[i] = Math.min(255, q[i] + (l - 0.5) * 80 * k);
          });
          break;
        }
        case 'lensFlare': {
          d.drawImage(cur, 0, 0);
          const b = box(), col = v.color || '#FFD36B';
          d.save(); d.globalAlpha = Math.min(1, v.amt / 100);
          const g = d.createRadialGradient(b.cx, b.cy - b.h * 0.2, 0, b.cx, b.cy - b.h * 0.2, Math.min(b.w, b.h) * 0.4);
          g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
          d.fillStyle = g; d.beginPath(); d.arc(b.cx, b.cy - b.h * 0.2, Math.min(b.w, b.h) * 0.4, 0, Math.PI * 2); d.fill();
          d.restore();
          break;
        }
        case 'rain': {
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
          break;
        }
        case 'surfaceBlur': {
          // تاری + ترکیب با لبه‌ها: نسخهٔ سادهٔ تاری حفظ‌کنندهٔ لبه
          const tmp = this._scratch('surf', cw, ch), tx = tmp.getContext('2d');
          tx.filter = `blur(${Math.max(0.5, v.r * px)}px)`; tx.drawImage(cur, 0, 0); tx.filter = 'none';
          d.drawImage(cur, 0, 0);
          d.save(); d.globalAlpha = 0.6; d.drawImage(tmp, 0, 0); d.restore();
          break;
        }
        case 'echo': {
          const b = box(), n = Math.max(1, Math.round(v.n));
          for (let i = n; i >= 1; i--) {
            d.save(); d.globalAlpha = 0.35 * (1 - i / (n + 1));
            d.drawImage(cur, b.x - v.amt * px * i * 0.5, b.y - v.amt * px * i * 0.2, b.w, b.h);
            d.restore();
          }
          d.drawImage(cur, 0, 0);
          break;
        }
        case 'smear': {
          const b = box(), a = (v.ang * Math.PI) / 180, A = v.amt * px;
          const steps = 12;
          for (let i = 0; i < steps; i++) {
            const u = i / steps;
            d.save(); d.globalAlpha = 0.25;
            d.drawImage(cur, b.x + Math.cos(a) * A * (u - 0.5), b.y + Math.sin(a) * A * (u - 0.5), b.w, b.h);
            d.restore();
          }
          d.drawImage(cur, 0, 0);
          break;
        }
        case 'pageCurl': {
          const b = box(), k = v.amt / 100, curlW = b.w * 0.35 * k;
          d.drawImage(cur, 0, 0);
          // قسمت تا‌خورده: فشرده‌شده با سایه
          d.save(); d.beginPath(); d.rect(b.x + b.w - curlW, b.y, curlW, b.h); d.clip();
          d.translate(b.x + b.w, b.cy); d.scale(Math.max(0.15, 1 - k * 0.7), 1); d.translate(-(b.x + b.w), -b.cy);
          d.globalAlpha = 0.85; d.drawImage(cur, 0, 0);
          const g = d.createLinearGradient(b.x + b.w - curlW, 0, b.x + b.w, 0);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
          d.fillStyle = g; d.fillRect(b.x + b.w - curlW, b.y, curlW, b.h); d.restore();
          break;
        }
        case 'cubeRotate': {
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
          break;
        }
        case 'vortex': {
          const b = box(), r = Math.min(b.w, b.h) / 2, A = v.amt / 100 * 3;
          warp(d, (dx, dy) => {
            const dist = Math.hypot(dx, dy);
            if (dist >= r || dist < 0.5) return [dx, dy];
            const ang = A * (1 - dist / r);
            const c = Math.cos(ang), s = Math.sin(ang);
            return [dx * c - dy * s, dx * s + dy * c];
          });
          break;
        }
        case 'mandala': {
          const b = box(), n = Math.max(2, Math.round(v.n));
          for (let i = 0; i < n; i++) {
            d.save(); d.translate(b.cx, b.cy); d.rotate((i / n) * Math.PI * 2); d.translate(-b.cx, -b.cy);
            d.globalAlpha = 1 / Math.max(1, n / 3); d.drawImage(cur, 0, 0); d.restore();
          }
          break;
        }
        case 'pixelSort': {
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
          break;
        }
        case 'dither': {
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
          break;
        }
        case 'haze': {
          d.filter = `blur(${Math.max(0.5, (v.amt / 100) * 3 * px)}px)`; d.drawImage(cur, 0, 0); d.filter = 'none';
          d.save(); d.globalAlpha = (v.amt / 100) * 0.35; d.fillStyle = '#FFFFFF';
          const b = box(); d.fillRect(b.x, b.y, b.w, b.h); d.restore();
          break;
        }
        case 'silhouette': {
          pixelOp(d, (q, i) => {
            const col = v.color || '#111111';
            q[i] = parseInt(col.slice(1, 3), 16) || 0;
            q[i + 1] = parseInt(col.slice(3, 5), 16) || 0;
            q[i + 2] = parseInt(col.slice(5, 7), 16) || 0;
          });
          break;
        }
        case 'xray': {
          pixelOp(d, (q, i) => {
            const l = q[i] * 0.299 + q[i + 1] * 0.587 + q[i + 2] * 0.114;
            q[i] = q[i + 1] = q[i + 2] = 255 - l;
          });
          break;
        }
        case 'bloom': {
          d.drawImage(cur, 0, 0);
          const tmp = this._scratch('bloom', cw, ch), tx = tmp.getContext('2d');
          tx.filter = `blur(${Math.max(1, (v.amt / 100) * 4 * px)}px)`; tx.drawImage(cur, 0, 0); tx.filter = 'none';
          d.save(); d.globalAlpha = Math.min(1, v.amt / 100); d.globalCompositeOperation = 'lighter'; d.drawImage(tmp, 0, 0); d.restore();
          break;
        }
        case 'starburst': {
          d.drawImage(cur, 0, 0);
          const b = box(), n = Math.max(4, Math.round(v.n)), R = Math.hypot(b.w, b.h) / 2;
          d.save(); d.globalAlpha = Math.min(1, v.amt / 100) * 0.7; d.strokeStyle = '#FFFFFF'; d.lineWidth = Math.max(1, px);
          d.beginPath();
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            d.moveTo(b.cx, b.cy); d.lineTo(b.cx + Math.cos(a) * R, b.cy + Math.sin(a) * R);
          }
          d.stroke(); d.restore();
          break;
        }
        case 'snow': {
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
          break;
        }
        case 'confetti': {
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
          break;
        }
        case 'fireflies': {
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
          break;
        }
        case 'bokeh': {
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
          break;
        }
        case 'halo': {
          d.drawImage(cur, 0, 0);
          const b = box(), r = Math.min(b.w, b.h) * 0.45;
          d.save(); d.globalAlpha = Math.min(1, v.amt / 100) * 0.6;
          const g = d.createRadialGradient(b.cx, b.cy, r * 0.7, b.cx, b.cy, r);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          d.fillStyle = g; d.beginPath(); d.arc(b.cx, b.cy, r, 0, Math.PI * 2); d.fill(); d.restore();
          break;
        }
        case 'prism': {
          d.drawImage(cur, 0, 0);
          const b = box();
          d.save(); d.globalAlpha = (v.amt / 100) * 0.4; d.globalCompositeOperation = 'overlay';
          const g = d.createLinearGradient(b.x, b.y, b.x + b.w, b.y);
          ['#FF0000', '#FF7A00', '#FFD84D', '#00C853', '#0091FF', '#7C4DFF'].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
          d.fillStyle = g; d.fillRect(b.x, b.y, b.w, b.h); d.restore();
          break;
        }
        case 'aurora': {
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
          break;
        }
        case 'tunnel': {
          const b = box(), n = Math.max(1, Math.round(v.n));
          for (let i = n; i >= 0; i--) {
            const s = 1 - (i / (n + 1)) * 0.8;
            d.save(); d.globalAlpha = i === 0 ? 1 : 0.5;
            d.drawImage(cur, b.cx - b.w * s / 2, b.cy - b.h * s / 2, b.w * s, b.h * s);
            d.restore();
          }
          break;
        }
        case 'infiniteZoom': {
          const b = box(), u = (time * v.speed) % 1, s = 1 + u * 0.6;
          d.save(); d.globalAlpha = 1 - u * 0.5;
          d.drawImage(cur, b.cx - b.w * s / 2, b.cy - b.h * s / 2, b.w * s, b.h * s);
          d.restore();
          break;
        }
        case 'dataMosh': {
          const b = box(), bs = 32, step = Math.floor(time * 2);
          d.drawImage(cur, 0, 0);
          for (let y = b.y; y < b.y + b.h; y += bs) for (let x = b.x; x < b.x + b.w; x += bs) {
            const h = Math.sin((x / bs) * 12.9898 + (y / bs) * 78.233 + step) * 43758.5453;
            const off = (h - Math.floor(h) - 0.5) * (v.amt / 100) * bs * 2;
            if (Math.abs(off) > 2) d.drawImage(cur, x, y, bs, bs, x + off, y, bs, bs);
          }
          break;
        }
        default: d.drawImage(cur, 0, 0);
      }
      cur = dst;
    }
    return cur;
  }

  /**
   * همهٔ لایه‌های یک گروه (پشت یا روی شعر) را می‌کشد.
   * @param {CanvasRenderingContext2D} ctx  بوم اصلی، با ترنسفرم صحنه
   * @param {Array}  layers
   * @param {number} t
   * @param {object} env  از frameEnv + { song, acc, playing, exporting, frameDur, fx, lineText }
   * @param {object} o    { behind:boolean, media:MediaPool }
   */
  draw(ctx, layers, t, env, o = {}) {
    if (!layers?.length) return;
    const media = o.media;
    const behind = !!o.behind;
    // فاز ۶ — دوربین: اگر لایهٔ دوربین فعالی هست، ترنسفرم معکوسش را
    // روی کل صحنهٔ موشن می‌گذاریم (در هر دو فراخوان behind/front، چون
    // هر فراخوان از ترنسفرم پایهٔ صحنه شروع می‌شود، نه از قبلی).
    const cam = layers.find(L => L.type === 'camera' && L.visible !== false && t >= L.t0 && t < L.t1);
    let camApplied = false;
    if (cam) {
      try {
        const cst = evalLayer(cam, t, { ...env, index: layers.indexOf(cam) }, new Map(layers.map(L => [L.id, L])), new Map());
        const cw0 = ctx.canvas.width, ch0 = ctx.canvas.height, px0 = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1;
        const sc = Math.max(0.01, (cst.P.sc || 100) / 100);
        ctx.save(); camApplied = true;
        ctx.translate(cw0 / 2, ch0 / 2);
        ctx.rotate(-(cst.P.rot || 0) * Math.PI / 180);
        ctx.scale(sc, sc);
        ctx.translate(-cw0 / 2 - (cst.P.x || 0) * px0, -ch0 / 2 - (cst.P.y || 0) * px0);
      } catch { /* دوربین خراب = بی‌دوربین */ }
    }
    // فاز ۶ — صدای لایه‌ها در پیش‌نمایش (نه خروجی: خروجی صدا را جدا میکس می‌کند)
    if (media && !env.exporting) {
      for (const L of layers) {
        if (L.type !== 'audio' || L.visible === false || t < L.t0 || t >= L.t1) continue;
        try {
          const ast = evalLayer(L, t, { ...env, index: layers.indexOf(L) }, new Map(layers.map(x => [x.id, x])), new Map());
          media.syncAudio(L, ast.lt, !!env.playing, ast.P);
        } catch { /* */ }
      }
    }
    const tm = ctx.getTransform();
    const base = [tm.a, tm.b, tm.c, tm.d, tm.e, tm.f];
    const px = Math.hypot(tm.a, tm.b) || 1;          // پیکسل بوم بر واحد طراحی
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const byId = new Map(layers.map(L => [L.id, L]));
    const memo = new Map();

    // لایه‌ای که ماسکِ لایهٔ بالایی‌اش است، جداگانه کشیده نمی‌شود
    const maskOnly = new Set();
    for (let i = 1; i < layers.length; i++) {
      const L = layers[i];
      if (L.clip && L.clip !== 'none' && !!L.behind === behind) maskOnly.add(layers[i - 1].id);
    }

    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      if (!!L.behind !== behind || L.visible === false || L.type === 'null' || L.type === 'audio' || L.type === 'camera') continue;
      if (t < L.t0 || t >= L.t1 || maskOnly.has(L.id)) continue;
      const p=env.profile, layerToken=p?.begin('layer.total',L);
      try {
      const e2 = { ...env, index: i };
      const st = p ? p.run('layer.evaluate',L,()=>evalLayer(L,t,e2,byId,memo)) : evalLayer(L,t,e2,byId,memo);
      if (st.alpha <= 0.002) continue;

      ctx.save();
      try {
        if (L.type === 'adjust') {
          // لایهٔ تنظیم: روی «هر چیزی که زیرش کشیده شده» اثر می‌گذارد
          const snap = this._scratch('adj', cw, ch);
          snap.getContext('2d').drawImage(ctx.canvas, 0, 0);
          const res = this._filters(snap, st, px, e2);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = st.alpha;
          ctx.globalCompositeOperation = L.blend || 'source-over';
          if(p)p.run('layer.composite',L,()=>ctx.drawImage(res,0,0));else ctx.drawImage(res, 0, 0);
        } else if (!needsBuffer(st)) {
          ctx.globalAlpha *= st.alpha;
          ctx.globalCompositeOperation = L.blend || 'source-over';
          this._drawState(ctx, st, base, e2, media);
        } else {
          let buf = this._renderToBuffer('L', cw, ch, L, st, t, e2, base, byId, media);
          buf = this._filters(buf, st, px, e2, this._geo(ctx, st, base, e2, media));
          if (L.clip && L.clip !== 'none' && i > 0) {
            const ML = layers[i - 1];
            const ms = evalLayer(ML, t, { ...env, index: i - 1 }, byId, memo);
            let mbuf = this._renderToBuffer('Mk', cw, ch, ML, ms, t, env, base, byId, media);
            mbuf = this._filters(mbuf, ms, px, env, this._geo(ctx, ms, base, env, media));
            const bx = buf.getContext('2d');
            bx.setTransform(1, 0, 0, 1, 0, 0);
            bx.globalAlpha = ms.active ? ms.alpha : 0;
            bx.globalCompositeOperation = L.clip === 'belowInv' ? 'destination-out' : 'destination-in';
            if (ms.active || L.clip === 'below') bx.drawImage(mbuf, 0, 0);
            bx.globalCompositeOperation = 'source-over'; bx.globalAlpha = 1;
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha *= st.alpha;
          ctx.globalCompositeOperation = L.blend || 'source-over';
          if(p)p.run('layer.composite',L,()=>ctx.drawImage(buf,0,0));else ctx.drawImage(buf, 0, 0);
        }
      } catch (err) {
        this.errors.set(L.id, String(err?.message || err));
      }
      ctx.restore();
      } finally { p?.end(layerToken); }
    }
    if (camApplied) ctx.restore();
  }

  /* ── انتخاب با لمس ─────────────────────────────────────────── */
  /** بالاترین لایهٔ زیر نقطهٔ (px,py) در فضای طراحی */
  hit(ctx, layers, t, env, px, py, media, pad = 18) {
    const byId = new Map(layers.map(L => [L.id, L]));
    const memo = new Map();
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      if (L.visible === false || L.locked || L.type === 'adjust' || t < L.t0 || t >= L.t1) continue;
      const st = evalLayer(L, t, { ...env, index: i }, byId, memo);
      const inv = M.invert(st.world);
      if (!inv) continue;
      const q = M.apply(inv, px, py);
      const b = layerBounds(ctx, st, media, env);
      const k = Math.hypot(st.world[0], st.world[1]) || 1;
      if (Math.abs(q.x) <= b.w / 2 + pad / k && Math.abs(q.y) <= b.h / 2 + pad / k) return L;
    }
    return null;
  }

  /** جای دستگیره‌ها برای لایهٔ انتخاب‌شده (فضای طراحی) */
  handles(ctx, L, layers, t, env, media) {
    const byId = new Map(layers.map(x => [x.id, x]));
    const st = evalLayer(L, t, { ...env, index: layers.indexOf(L) }, byId, new Map());
    const b = layerBounds(ctx, st, media, env);
    const W = st.world;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => M.apply(W, sx * b.w / 2, sy * b.h / 2));
    const top = M.apply(W, 0, -b.h / 2);
    const center = M.apply(W, 0, 0);
    // دستگیرهٔ چرخش: کمی بیرون‌تر از لبهٔ بالا، در جهت محور y لایه
    const up = M.applyVec(W, 0, -1), ul = Math.hypot(up.x, up.y) || 1;
    const rot = { x: top.x + (up.x / ul) * 70, y: top.y + (up.y / ul) * 70 };
    const anchor = M.apply(W, st.P.ax, st.P.ay);
    return { st, corners, top, rot, center, anchor, bounds: b };
  }

  /** کادر و دستگیره‌ها — فقط در پیش‌نمایش، هرگز در خروجی */
  drawGizmo(ctx, L, layers, t, env, media, unit = 1) {
    if (!L || t < L.t0 - 0.001 || t > L.t1 + 0.001) return;
    const h = this.handles(ctx, L, layers, t, env, media);
    ctx.save();
    ctx.lineWidth = 2 * unit;
    ctx.strokeStyle = '#E4142A';
    ctx.setLineDash([8 * unit, 6 * unit]);
    ctx.beginPath();
    h.corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(h.top.x, h.top.y); ctx.lineTo(h.rot.x, h.rot.y); ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const p of h.corners) {
      ctx.beginPath(); ctx.rect(p.x - 9 * unit, p.y - 9 * unit, 18 * unit, 18 * unit);
      ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(h.rot.x, h.rot.y, 12 * unit, 0, Math.PI * 2);
    ctx.fillStyle = '#E4142A'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * unit; ctx.stroke();
    // نقطهٔ لنگر
    ctx.beginPath();
    ctx.moveTo(h.anchor.x - 14 * unit, h.anchor.y); ctx.lineTo(h.anchor.x + 14 * unit, h.anchor.y);
    ctx.moveTo(h.anchor.x, h.anchor.y - 14 * unit); ctx.lineTo(h.anchor.x, h.anchor.y + 14 * unit);
    ctx.stroke();
    ctx.restore();
  }
}

export { MediaPool };
