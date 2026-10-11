import { evalLayer, frameEnv, needsBuffer } from './evaluate.js';
import { compileCode, codeEnv } from './codeapi.js';
import { MediaPool } from './media.js';
import { parseColor } from './tracks.js';
import { EASINGS } from './easing.js';
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

function drawText(ctx, st) {
  const { L, P, mods } = st;
  const m = textMetrics(ctx, L, P);
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
  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${P.spacing}px`;
  ctx.lineJoin = 'round';
  ctx.fillStyle = P.fill;
  ctx.strokeStyle = P.stroke;
  ctx.lineWidth = P.strokeW * 2;

  // نمایش تدریجی (تایپ): ویژگی «نمایش» × انیمیشن تایپ
  const total = m.lines.reduce((s, l) => s + l.s.length, 0);
  let budget = Math.round(total * clamp((P.reveal / 100) * mods.reveal));

  const nWords = m.lines.reduce((s, l) => s + l.words.length, 0);
  let wi = 0;
  const y0 = -m.h / 2 + m.lh / 2;
  m.lines.forEach((ln, i) => {
    const y = y0 + i * m.lh;
    // لبهٔ راست سطر (متن راست‌به‌چپ است)
    const right = align === 'right' ? m.w / 2 : align === 'left' ? -m.w / 2 + ln.w : ln.w / 2;

    if (mods.stagger) {
      // کلمه‌به‌کلمه: کلمه‌ها جدا کشیده می‌شوند تا اتصال حروف فارسی نشکند
      let x = right;
      const span = Math.min(1, 2.6 / Math.max(1, nWords));
      for (const w of ln.words) {
        const u = clamp((mods.stagger.u - (wi / Math.max(1, nWords)) * (1 - span)) / span);
        wi++;
        ctx.save();
        const cx = x - w.w / 2;
        let a = u, dy = 0, s = 1;
        if (mods.stagger.kind === 'up') dy = (1 - EASINGS.outCubic(u)) * P.size * 0.8;
        if (mods.stagger.kind === 'pop') { s = Math.max(0.001, EASINGS.outBack(u)); a = clamp(u * 3); }
        ctx.globalAlpha *= a;
        ctx.translate(cx, y + dy); ctx.scale(s, s);
        ctx.textAlign = 'center';
        if (P.strokeW > 0) ctx.strokeText(w.s, 0, 0);
        ctx.fillText(w.s, 0, 0);
        ctx.restore();
        x -= w.w + ln.space;
      }
      return;
    }

    let s = ln.s;
    if (budget < s.length) s = s.slice(0, Math.max(0, budget));
    budget -= ln.s.length;
    if (!s) return;
    ctx.textAlign = 'right';
    if (P.strokeW > 0) ctx.strokeText(s, right, y);
    ctx.fillText(s, right, y);
  });
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/* ── شکل ─────────────────────────────────────────────────────── */
function shapePath(ctx, kind, w, h, P) {
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
    case 'cross': {
      const tw = Math.min(w, h) * 0.3 / 2;
      const p = [[-tw, -hh], [tw, -hh], [tw, -tw], [hw, -tw], [hw, tw], [tw, tw], [tw, hh],
                 [-tw, hh], [-tw, tw], [-hw, tw], [-hw, -tw], [-tw, -tw]];
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      return 2 * (w + h) + 4 * tw;
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
  const isLine = kind === 'line' || kind === 'ring';

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
  if (L.type === 'video' && !env.exporting) media.sync(L, st.lt, env.playing);
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
  const { fn, error } = compileCode(L.data.code);
  if (error) { errors.set(L.id, error); return; }
  if (!fn) return;
  try {
    ctx.save();
    fn(ctx, codeEnv({
      ctx, lt: st.lt, time: env.time, dur: st.dur, kick: env.kick, rms: env.rms, low: env.low,
      beat: env.beat, pulse: env.pulse, W: env.W, H: env.H, P: st.P, acc: env.acc, song: env.song,
      lineText: env.lineText, fx: env.fx,
    }));
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

  /** محتوای لایه + افکت‌های «draw» (تکرار، آینه) با ترنسفرم فعلی ctx */
  _content(ctx, st, env, media) {
    const draw = () => {
      switch (st.L.type) {
        case 'text': drawText(ctx, st); break;
        case 'shape': drawShape(ctx, st); break;
        case 'image': case 'video': drawMedia(ctx, st, media, env); break;
        case 'spectrum': drawSpectrum(ctx, st, env); break;
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
  _filters(src, st, px, env) {
    const cw = src.width, ch = src.height;
    let cur = src;
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
        case 'rgb': {
          const a = (v.ang * Math.PI) / 180, r = v.amt * px;
          const ch3 = [['#FF0000', 1], ['#00FF00', 0], ['#0000FF', -1]];
          const tmp = this._scratch('rgbT', cw, ch), tx = tmp.getContext('2d');
          d.globalCompositeOperation = 'lighter';
          for (const [col, k] of ch3) {
            tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, cw, ch);
            tx.drawImage(cur, 0, 0);
            tx.globalCompositeOperation = 'multiply'; tx.fillStyle = col; tx.fillRect(0, 0, cw, ch);
            tx.globalCompositeOperation = 'destination-in'; tx.drawImage(cur, 0, 0);
            d.drawImage(tmp, Math.cos(a) * r * k, Math.sin(a) * r * k);
          }
          break;
        }
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
      if (!!L.behind !== behind || L.visible === false || L.type === 'null') continue;
      if (t < L.t0 || t >= L.t1 || maskOnly.has(L.id)) continue;
      const e2 = { ...env, index: i };
      const st = evalLayer(L, t, e2, byId, memo);
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
          ctx.drawImage(res, 0, 0);
        } else if (!needsBuffer(st)) {
          ctx.globalAlpha *= st.alpha;
          ctx.globalCompositeOperation = L.blend || 'source-over';
          this._drawState(ctx, st, base, e2, media);
        } else {
          let buf = this._renderToBuffer('L', cw, ch, L, st, t, e2, base, byId, media);
          buf = this._filters(buf, st, px, e2);
          if (L.clip && L.clip !== 'none' && i > 0) {
            const ML = layers[i - 1];
            const ms = evalLayer(ML, t, { ...env, index: i - 1 }, byId, memo);
            let mbuf = this._renderToBuffer('Mk', cw, ch, ML, ms, t, env, base, byId, media);
            mbuf = this._filters(mbuf, ms, px, env);
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
          ctx.drawImage(buf, 0, 0);
        }
      } catch (err) {
        this.errors.set(L.id, String(err?.message || err));
      }
      ctx.restore();
    }
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
