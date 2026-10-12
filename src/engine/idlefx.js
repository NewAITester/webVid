/**
 * افکت‌های «بین‌خوانی» — وقتی شعری خوانده نمی‌شود (اینترو، فاصلهٔ بین
 * دو خط، سولوی ساز، پایان).
 *
 * روی هر استایل ویدیو و هر سبک متنی سوار می‌شوند و جایگزین‌شان نمی‌کنند.
 * چندتا را می‌شود با هم روشن کرد. همه تابع خالص زمان‌اند.
 *
 * idleK(song,t) میزان «بی‌کلامی» را ۰ تا ۱ می‌دهد: نزدیک خط‌ها صفر است
 * و در فاصله‌های بلندتر از MIN_GAP نرم بالا می‌آید.
 */
import { W, H, S, SF } from './song.js';
import { clamp, hash, rgba } from './core.js';
import { textFa } from './draw.js';
import { FONTS } from './text.js';
import * as REEL from './reelfx.js';

export const IDLE_DEFAULT_OPT = { amt: 1, minGap: 3, color: '' };

/** پنجرهٔ بی‌کلامی فعلی: {k, t0, t1, next} */
export function idleWindow(song, t, minGap = 3) {
  const L = song?.lines || [];
  const dur = song?.duration || 0;
  let prevOut = 0, next = dur, ni = -1;
  for (let i = 0; i < L.length; i++) {
    const s = L[i].words[0].t;
    if (s > t) { next = s; ni = i; break; }
    prevOut = song.lineOut(i);
  }
  if (t < prevOut) return { k: 0, t0: prevOut, t1: next, next: ni };
  const gap = next - prevOut;
  if (gap < minGap) return { k: 0, t0: prevOut, t1: next, next: ni };
  const fin = clamp((t - prevOut - 0.15) / 0.7);
  const fout = ni < 0 ? 1 : clamp((next - 0.45 - t) / 0.55);
  const k = fin * fout;
  return { k: k * k * (3 - 2 * k), t0: prevOut, t1: next, next: ni };
}

const TAU = Math.PI * 2;
const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/* انرژی شبه‌طیفی یک باند — از rms و ضرب، بدون تحلیل فرکانس */
function band(song, t, i, n, kick) {
  const r = song.rms(t);
  const f = 0.5 + 0.5 * Math.sin(t * (2.1 + (i % 7) * 0.37) + i * 1.7);
  const g = 0.5 + 0.5 * Math.sin(t * (5.3 + (i % 5) * 0.61) - i * 0.9);
  const low = 1 - i / n;                       // باندهای بم با ضرب بیشتر می‌پرند
  return clamp(r * (0.35 + 0.45 * f * g) + kick * (0.25 + 0.6 * low) * (0.6 + 0.4 * hash(i * 13 + Math.floor(t * 12))));
}

export const IDLE_FX = {
  bars: {
    label: 'اکولایزر', icon: '▮▮▮',
    draw(ctx, song, t, acc, kick, k) {
      const n = 48, sc = S(), base = H * 0.86, gap = W / n;
      ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = acc;
      for (let i = 0; i < n; i++) {
        const j = Math.abs(i - n / 2) / (n / 2);
        const h = (12 * sc + band(song, t, Math.floor(j * n), n, kick) * H * 0.26) * (1 - j * 0.35);
        ctx.globalAlpha = k * (0.55 + 0.45 * (1 - j));
        ctx.fillRect(i * gap + gap * 0.18, base - h, gap * 0.64, h);
        ctx.globalAlpha = k * 0.18;
        ctx.fillRect(i * gap + gap * 0.18, base + 6 * sc, gap * 0.64, h * 0.35);
      }
      ctx.restore();
    },
  },
  ring: {
    label: 'حلقهٔ ضربان', icon: '◎',
    draw(ctx, song, t, acc, kick, k) {
      const n = 72, cx = W / 2, cy = H / 2, r0 = Math.min(W, H) * (0.2 + 0.03 * kick);
      ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = acc;
      ctx.lineWidth = 5 * SF(); ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + t * 0.25;
        const e = band(song, t, i < n / 2 ? i : n - i, n / 2, kick);
        const r1 = r0 + 8 * SF() + e * Math.min(W, H) * 0.14;
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
      ctx.stroke();
      ctx.globalAlpha = k * 0.5; ctx.lineWidth = 2 * SF();
      ctx.beginPath(); ctx.arc(cx, cy, r0 - 10 * SF(), 0, TAU); ctx.stroke();
      ctx.restore();
    },
  },
  wave: {
    label: 'موج صدا', icon: '∿',
    draw(ctx, song, t, acc, kick, k) {
      const cy = H / 2, r = song.rms(t);
      ctx.save(); ctx.lineWidth = 4 * SF(); ctx.lineJoin = 'round';
      for (let L = 0; L < 3; L++) {
        ctx.globalAlpha = k * (L ? 0.3 : 0.9);
        ctx.strokeStyle = L ? '#FFFFFF' : acc;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8 * S()) {
          const u = x / W, env = Math.sin(u * Math.PI);
          const y = cy + env * H * (0.05 + 0.16 * r + 0.1 * kick) *
            Math.sin(u * (9 + L * 3) + t * (3 + L) + L * 1.3) * Math.sin(u * 3.1 - t * 1.4 + L);
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  count: {
    label: 'شمارش تا خط بعد', icon: '۳۲۱',
    draw(ctx, song, t, acc, kick, k, w) {
      if (w.next < 0) return;
      const left = w.t1 - t;
      const p = clamp((t - w.t0) / Math.max(0.1, w.t1 - w.t0));
      const sc = SF();
      // نوار پیشرفت تا ورود خط بعد
      const bw = Math.min(W * 0.4, 700 * S()), bx = (W - bw) / 2, by = H * 0.9;
      ctx.save(); ctx.globalAlpha = k * 0.25; ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(bx, by, bw, 4 * sc);
      ctx.globalAlpha = k; ctx.fillStyle = acc;
      ctx.fillRect(bx + bw * (1 - p), by, bw * p, 4 * sc);   // راست به چپ
      ctx.restore();
      if (left < 3.6 && left > 0.4) {
        const n = Math.ceil(left - 0.45), f = (left - 0.45) % 1;
        const pop = 1 + 0.35 * Math.pow(f, 3);
        textFa(ctx, fa(n), W / 2, H / 2, 200 * sc * pop, acc, k * clamp(f * 3) * 0.95);
      } else {
        for (let i = 0; i < 3; i++) {
          const a = 0.3 + 0.7 * Math.max(0, Math.sin(t * 4 - i * 0.9));
          ctx.save(); ctx.globalAlpha = k * a; ctx.fillStyle = acc;
          ctx.beginPath(); ctx.arc(W / 2 + (i - 1) * 46 * sc, H / 2, 11 * sc, 0, TAU); ctx.fill(); ctx.restore();
        }
      }
    },
  },
  title: {
    label: 'نام آهنگ', icon: 'T',
    draw(ctx, song, t, acc, kick, k, w) {
      const sc = SF(), d = t - w.t0;
      const a = k * clamp((d - 0.2) / 0.6);
      if (a <= 0) return;
      const y = H * 0.5 - (1 - clamp(d / 0.9)) * 30 * sc;
      textFa(ctx, song.title || '', W / 2, y - 40 * sc, 104 * sc, '#FFFFFF', a);
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = acc;
      const lw = 160 * sc * clamp((d - 0.4) / 0.6);
      ctx.fillRect(W / 2 - lw / 2, y + 30 * sc, lw, 4 * sc); ctx.restore();
      textFa(ctx, song.artist || '', W / 2, y + 86 * sc, 46 * sc, acc, a * clamp((d - 0.6) / 0.6), FONTS.light || FONTS.black);
    },
  },
  notes: {
    label: 'نت‌های شناور', icon: '♪',
    draw(ctx, song, t, acc, kick, k) {
      const sc = SF();
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 22; i++) {
        const sp = 0.06 + hash(i * 3.1) * 0.08, ph = (t * sp + hash(i)) % 1;
        const x = W * hash(i * 7.7) + Math.sin(t * 1.3 + i) * 30 * sc;
        const y = H * (1.08 - ph * 1.2);
        const s = (34 + hash(i * 2.3) * 50) * sc * (1 + kick * 0.15);
        ctx.globalAlpha = k * Math.sin(ph * Math.PI) * 0.85;
        ctx.fillStyle = i % 3 ? acc : '#FFFFFF';
        ctx.font = `${s}px sans-serif`;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2 + i) * 0.3);
        ctx.fillText(i % 2 ? '♪' : '♫', 0, 0); ctx.restore();
      }
      ctx.restore();
    },
  },
  vinyl: {
    label: 'صفحهٔ گرامافون', icon: '◉',
    draw(ctx, song, t, acc, kick, k) {
      const R = Math.min(W, H) * 0.26 * (1 + 0.02 * kick), cx = W / 2, cy = H / 2;
      ctx.save(); ctx.globalAlpha = k;
      ctx.translate(cx, cy); ctx.rotate(t * 1.6);
      ctx.fillStyle = '#0B0B0E'; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1.5 * SF();
      ctx.beginPath();
      for (let r = R * 0.42; r < R * 0.97; r += R * 0.045) { ctx.moveTo(r, 0); ctx.arc(0, 0, r, 0, TAU); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 6 * SF();
      ctx.beginPath(); ctx.arc(0, 0, R * 0.8, -0.5, 0.2); ctx.stroke();
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(0, 0, R * 0.33, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0B0B0E'; ctx.beginPath(); ctx.arc(0, 0, R * 0.04, 0, TAU); ctx.fill();
      ctx.restore();
    },
  },
  burst: {
    label: 'انفجار روی ضرب', icon: '✺',
    draw(ctx, song, t, acc, kick, k) {
      const bi = song.beatI(t), sc = SF();
      ctx.save();
      for (let b = bi; b > bi - 3 && b >= 0; b--) {
        const dt = t - song.beats[b];
        if (dt < 0 || dt > 1.1) continue;
        const cx = W * (0.2 + 0.6 * hash(b * 1.3)), cy = H * (0.25 + 0.5 * hash(b * 2.9));
        const n = 14, rr = (40 + dt * 520) * sc;
        ctx.globalAlpha = k * (1 - dt / 1.1);
        ctx.fillStyle = b % 2 ? acc : '#FFFFFF';
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + b, r = rr * (0.7 + 0.3 * hash(b * 5 + i));
          const s = (7 - dt * 5) * sc;
          if (s <= 0) continue;
          ctx.moveTo(cx + Math.cos(a) * r + s, cy + Math.sin(a) * r);
          ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, s, 0, TAU);
        }
        ctx.fill();
      }
      ctx.restore();
    },
  },
  next: {
    label: 'پیش‌نمایش خط بعد', icon: '…',
    draw(ctx, song, t, acc, kick, k, w) {
      if (w.next < 0) return;
      const L = song.lines[w.next]; if (!L) return;
      const sc = SF();
      const txt = L.text || L.words.map(x => x.text).join(' ');
      textFa(ctx, 'خط بعد', W / 2, H * 0.72, 36 * sc, acc, k * 0.9, FONTS.light || FONTS.black);
      textFa(ctx, txt.length > 42 ? txt.slice(0, 42) + '…' : txt, W / 2, H * 0.8, 66 * sc, '#FFFFFF', k * 0.6);
    },
  },
  edge: {
    label: 'درخشش لبه', icon: '▢',
    draw(ctx, song, t, acc, kick, k) {
      const a = k * (0.25 + 0.75 * kick);
      if (a < 0.01) return;
      const d = Math.min(W, H) * 0.22;
      ctx.save(); ctx.globalAlpha = a;
      for (const [x0, y0, x1, y1, x, y, w, h] of [
        [0, 0, 0, d, 0, 0, W, d], [0, H, 0, H - d, 0, H - d, W, d],
        [0, 0, d, 0, 0, 0, d, H], [W, 0, W - d, 0, W - d, 0, d, H]]) {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, rgba(acc, 0.55)); g.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
    },
  },
  orbit: {
    label: 'مدار ذرات', icon: '⁘',
    draw(ctx, song, t, acc, kick, k) {
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.32, sc = SF();
      ctx.save();
      for (const [col, off] of [[acc, 0], ['#FFFFFF', 1]]) {
        ctx.fillStyle = col; ctx.globalAlpha = k * (off ? 0.6 : 0.95);
        ctx.beginPath();
        for (let i = off; i < 60; i += 2) {
          const a = (i / 60) * TAU + t * (0.3 + (i % 3) * 0.12);
          const r = R * (0.75 + 0.35 * hash(i * 1.9)) * (1 + kick * 0.12 * (i % 2 ? 1 : -1));
          const s = (2.5 + 3.5 * hash(i)) * sc;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.55;
          ctx.moveTo(x + s, y); ctx.arc(x, y, s, 0, TAU);
        }
        ctx.fill();
      }
      ctx.restore();
    },
  },
  breathe: {
    label: 'نفس (تیره و روشن)', icon: '◐',
    draw(ctx, song, t, acc, kick, k) {
      const a = k * (0.18 + 0.12 * Math.sin(t * 1.6));
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      g.addColorStop(0, rgba(acc, a * 0.9));
      g.addColorStop(0.6, rgba(acc, a * 0.25));
      g.addColorStop(1, 'rgba(0,0,0,' + (k * 0.35).toFixed(3) + ')');
      ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    },
  },
};

/* قطعه‌های شوریل: در فاصله‌های بی‌کلام با ضرب آهنگ تکان می‌خورند */
const R = (song, t) => REEL.envFromSong(song, t, W, H);
Object.assign(IDLE_FX, {
  swarm: { label: '✦ کهکشان ذرات', icon: '✺', draw(ctx, song, t, acc, kick, k) { REEL.vortex(ctx, R(song, t), { c1: acc, c2: '#18E0FF', a: k, n: 900 }); } },
  morph: { label: '✦ دگردیسی شکل‌ها', icon: '◆', draw(ctx, song, t, acc, kick, k) { REEL.morph(ctx, R(song, t), { c1: acc, c2: '#F6F3EC', a: k }); } },
  wire: { label: '✦ بیست‌وجهی سیمی', icon: '⬡', draw(ctx, song, t, acc, kick, k) { REEL.wire(ctx, R(song, t), { c1: '#18E0FF', c2: acc, a: k }); } },
  warp: { label: '✦ پرواز در ستاره‌ها', icon: '✧', draw(ctx, song, t, acc, kick, k) { REEL.starfield(ctx, R(song, t), { a: k, n: 500 }); } },
  shockb: { label: '✦ انفجار ذرات روی ضرب', icon: '✹', draw(ctx, song, t, acc, kick, k) { REEL.burst(ctx, R(song, t), { c1: acc, c2: '#FFD447', a: k }); } },
  logo: {
    label: '✦ نام آهنگ از ذره‌ها', icon: '⁂',
    draw(ctx, song, t, acc, kick, k, w) {
      // ذره‌ها در نیمهٔ اول فاصله جمع می‌شوند و نزدیک خط بعد دوباره پخش
      const span = Math.max(0.5, w.t1 - w.t0), u = (t - w.t0) / span;
      const kk = Math.min(REEL.clamp(u * 2.2), w.next < 0 ? 1 : REEL.clamp((1 - u) * 4));
      REEL.swarmText(ctx, R(song, t), { text: song.title || 'MOTION', k: kk, a: k, c1: '#F6F3EC', c2: acc, n: 1400, w: W * 0.7 });
    },
  },
});

/* FLOW (همان صحنهٔ ذره‌ای شوریل): نام آهنگ از هزاران ذرهٔ رنگی، دقیقاً روی ضرب‌های آهنگ */
const FLOW_COLS = acc => [acc, '#5E9FE8', '#BF8EDA', '#4FB9C9'];
const flowFont = s => (/[\u0600-\u06FF]/.test(s) ? `"${FONTS.black}", Vazirmatn, "Noto Sans Arabic", sans-serif` : 'Arial, "Helvetica Neue", "Liberation Sans", sans-serif');
const flowName = song => String(song.title || '').trim() || 'MUSIC';
Object.assign(IDLE_FX, {
  flowsong: {
    label: '🌊 نام آهنگ ذره‌ای — با ضرب جلو و عقب', icon: '🌊',
    draw(ctx, song, t, acc, kick, k, w) {
      // اول فاصله: ذره‌ها می‌چرخند و نام را می‌سازند؛ بعد با هر ضرب جلو می‌آید؛ نزدیک خط بعد پخش می‌شود
      const text = flowName(song), span = Math.max(1, w.t1 - w.t0);
      REEL.flowText(ctx, R(song, t), { text, font: flowFont(text), weight: '900', mode: 'title', t: t - w.t0, dur: w.next < 0 ? span : Math.max(1, span - 0.5), inAt: 0.25, gather: 0.75,
        outLen: w.next < 0 ? 0 : Math.min(0.45, span * 0.2), amp: 1.3, a: k, n: 1700, lw: 3.6, size: H * 0.3, cols: FLOW_COLS(acc) });
    },
  },
  flowbeat: {
    label: '💓 نام آهنگ ذره‌ای — فقط با ریتم می‌تپد', icon: '💓',
    draw(ctx, song, t, acc, kick, k, w) {
      // نوشته از اول ساخته است؛ فقط با ضرب‌های آهنگ می‌تپد (بدون چرخش ورود و انفجار)
      const text = flowName(song);
      REEL.flowText(ctx, R(song, t), { text, font: flowFont(text), weight: '900', mode: 'title', t: t - w.t0, dur: 1e9, inAt: -10, gather: 0.05, swirl: 0, outLen: 0,
        amp: 1.6, a: k, n: 1700, lw: 3.6, size: H * 0.3, cols: FLOW_COLS(acc) });
    },
  },
});

// FLOW اول فهرست (تازه‌ها)
export const IDLE_IDS = ['flowsong', 'flowbeat', ...Object.keys(IDLE_FX).filter(k => k !== 'flowsong' && k !== 'flowbeat')];

/**
 * کشیدن افکت‌های بین‌خوانی
 * ids: آرایهٔ شناسه‌ها؛ opt: {amt, minGap, color}
 * kForce: برای پیش‌نمایش (نادیده گرفتن تشخیص بی‌کلامی)
 */
export function drawIdle(ctx, song, t, acc, kick, ids, opt = {}, kForce = null) {
  if (!ids?.length || !song) return 0;
  const o = { ...IDLE_DEFAULT_OPT, ...opt };
  const w = kForce != null
    ? { k: kForce, t0: t - 2, t1: t + 4, next: Math.max(0, song.activeLine?.(t) ?? 0) }
    : idleWindow(song, t, o.minGap);
  const k = w.k * clamp(+o.amt || 0, 0, 1.5);
  if (k <= 0.003) return 0;
  const col = /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : acc;
  for (const id of ids) {
    const fx = IDLE_FX[id];
    if (!fx) continue;
    ctx.save();
    try { fx.draw(ctx, song, t, col, kick, Math.min(1, k), w); } finally { ctx.restore(); }
  }
  return k;
}
