/**
 * «تشخیص خودکار افکت‌ها» در کدهای وارد‌شده
 * ─────────────────────────────────────────────────────────────
 * کد اصلی چند بار در هر صحنه (با ردیاب بوم) اجرا می‌شود؛ از روی حرکت حروف و
 * نوشته‌ها، کلیپ‌ها، نقطه‌ها و خط‌ها، افکت‌ها شناخته و به نزدیک‌ترین المان برنامه
 * (با تنظیم‌های اندازه‌گیری‌شده) نگاشته می‌شوند. خروجی یک «موشن‌اسکریپت» است که
 * هم خود برنامه وارد می‌کند و هم هر ایجنتی (AI) می‌تواند بخواند/بنویسد.
 */
import { makeTracer } from './trace.js';
import { ELEMENT_KINDS } from '../elements.js';
import { getPyInst, pyFrame } from './pyframes.js';
import { runImported } from './runtime.js';

const r3 = v => +(+v).toFixed(3);
const r2 = v => +(+v).toFixed(2);
const med = a => { const b = a.filter(Number.isFinite).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };
const mode = (arr, key = x => x) => { const m = new Map(); for (const v of arr) { const k = key(v); m.set(k, (m.get(k) || 0) + 1); } let best = null, n = 0; for (const [k, c] of m) if (c > n) { n = c; best = k; } return best; };
const slope = (xs, ys) => { const n = xs.length; if (n < 2) return 0; const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } return den ? num / den : 0; };
function offscreen(w, h) { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
let _m = null;
function advOf(ch, size, mono, bold = true) { if (!_m) _m = offscreen(8, 8).getContext('2d'); _m.font = `${bold && !mono ? 700 : 400} ${size}px ${mono ? '"Liberation Mono", Menlo, monospace' : 'Arial, "Liberation Sans", sans-serif'}`; return _m.measureText(ch).width; }
const stopsHex = st => (st || []).map(([, c]) => { const m = /rgba?\(([\d.]+),([\d.]+),([\d.]+)/.exec(String(c).replace(/\s/g, '')); return m ? '#' + [m[1], m[2], m[3]].map(v => Math.round(+v).toString(16).padStart(2, '0')).join('').toUpperCase() : c; });

/* ── نمونه‌برداری ── */
/**
 * @param {(ctx, t) => void} sample  یک فریم کد اصلی را روی ctx (فضای قاب W0×H0) می‌کشد
 * @param {Array<{name,t0,t1}>} scenes
 */
export async function traceScenes(sample, scenes, { W0 = 1920, H0 = 1080, fps = 12, onProgress = null, isCancelled = () => false } = {}) {
  const cw = Math.max(32, Math.round(W0 / 10)), ch = Math.max(18, Math.round(H0 / 10));
  const c = offscreen(cw, ch), g = c.getContext('2d');
  const tr = makeTracer(g, W0, H0);
  const total = scenes.reduce((a, s) => a + Math.max(1, Math.round((s.t1 - s.t0) * fps)), 0);
  let done = 0, last = performance.now();
  const out = [];
  for (const sc of scenes) {
    const frames = [];
    const n = Math.max(1, Math.round((sc.t1 - sc.t0) * fps));
    for (let i = 0; i < n; i++) {
      if (isCancelled()) return null;
      const t = sc.t0 + (i + 0.5) * (sc.t1 - sc.t0) / n;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch); g.scale(cw / W0, ch / H0);
      tr.begin();
      try { sample(tr.ctx, t); } catch { /* */ }
      frames.push({ t, ev: tr.end() });
      done++;
      if (performance.now() - last > 30) { onProgress?.(done / total); await new Promise(r => setTimeout(r, 0)); last = performance.now(); }
    }
    out.push({ ...sc, frames });
  }
  return out;
}

/* ── تحلیل یک صحنه ── */
function transKind(e, W0, H0) {
  if (e.k !== 'clip') return null;
  if (e.wedge) return 'clockWipe';
  if (e.rects >= 6) return 'blinds';
  if (e.arcs >= 1 && !e.rects && e.lines === 0 && e.maxR > 0.12 * W0) return 'iris';
  if (e.lines >= 3 && !e.arcs && !e.rects && e.pts?.length >= 3) { const ys = e.pts.map(p => p[1]); if (Math.max(...ys) - Math.min(...ys) > 0.8 * H0) return 'slashWipe'; }
  return null;
}

function letterRuns(texts) {
  const runs = [], strings = [];
  let cur = null;
  for (const e of texts) {
    if ([...e.s].length === 1) {
      const p = cur && cur.chars[cur.chars.length - 1];
      if (p && Math.abs(e.size - p.size) < 0.5 + 0.02 * p.size && e.mono === p.mono && e.x > p.x - 0.1 * p.size && e.x - p.x < 2.6 * p.size && Math.abs(e.y - p.y) < 4 * p.size) cur.chars.push(e);
      else { cur = { chars: [e] }; runs.push(cur); }
    } else { cur = null; strings.push(e); }
  }
  for (const r of runs) { r.word = r.chars.map(c => c.s).join(''); r.size = r.chars[0].size; r.mono = r.chars[0].mono; r.x0 = r.chars[0].x; }
  return { runs: runs.filter(r => r.word.trim().length >= 2), strings };
}

function analyzeLetters(track, sc, W0, H0) {
  const obs = track.obs, n = [...track.word].length, size = med(obs.flatMap(o => o.chars.map(c => c.size)));
  const word = track.word, mono = track.mono;
  const per = [...Array(n)].map(() => []);
  for (const o of obs) o.chars.forEach((c, i) => { if (i < n) per[i].push({ t: o.t, ...c }); });
  const lens = obs.map(o => o.chars.length);
  const restA = Math.max(...obs.flatMap(o => o.chars.map(c => c.a)));
  const tol = Math.max(0.6, 0.004 * size);
  // جای ثابت هر حرف: بیشترین تکرار در بخش دوم (حروفِ پنهانِ پشت ماسک اول کار هم ثابت‌اند)
  const q = Math.max(1, 0.03 * size);
  const restOf = (s2, k) => { const b = mode(s2, c => Math.round(c[k] / q)); const vs = s2.filter(c => Math.round(c[k] / q) === b).map(c => c[k]); return Math.round(mode(vs, v => Math.round(v * 2) / 2) * 2) / 2; };
  const rest = per.map(ser => { const s2 = ser.length > 4 ? ser.slice(Math.floor(ser.length * 0.4)) : ser; return { y: restOf(s2, 'y'), x: restOf(s2, 'x') }; });
  // حرکت افقی یکنواخت (drift)
  const xs0 = per[0].map(c => c.x), ts0 = per[0].map(c => c.t);
  const driftV = per.length ? med(per.filter(s => s.length >= 3).map(s => slope(s.map(c => c.t), s.map(c => c.x)))) : 0;
  const drifting = Math.abs(driftV) > 8;
  const off = (c, i) => ({ dy: c.y - rest[i].y, dx: drifting ? 0 : c.x - rest[i].x });
  const settled = (c, i) => { const o = off(c, i); return Math.abs(o.dy) < tol && Math.abs(o.dx) < tol && Math.abs(c.sy - 1) < 0.03 && Math.abs(c.sx - 1) < 0.03 && c.a >= restA - 0.03; };
  const info = per.map((ser, i) => {
    const sIdx = ser.findIndex(c => settled(c, i));
    let lIdx = -1; for (let j = ser.length - 1; j >= 0; j--) if (settled(ser[j], i)) { lIdx = j; break; }
    const pre = sIdx > 0 ? ser.slice(0, sIdx) : [], post = lIdx >= 0 ? ser.slice(lIdx + 1) : [];
    return { ser, sIdx, lIdx, pre, post, e: sIdx >= 0 ? ser[sIdx].t : NaN, l: lIdx >= 0 ? ser[lIdx].t : NaN, first: ser[0]?.t };
  });
  const letters = info.map((f, i) => ({ f, i })).filter(({ i }) => word[i] && word[i] !== ' ');
  // نوع ورود
  let moveD = 0, dir = 'below', squash = false, axis = 'y', fadeIn = false;
  for (const { f, i } of letters) for (const c of f.pre) {
    const o = off(c, i);
    if (Math.abs(o.dy) > Math.abs(moveD) && Math.abs(o.dy) >= Math.abs(o.dx)) { moveD = o.dy; dir = o.dy > 0 ? 'below' : 'above'; }
    else if (Math.abs(o.dx) > Math.abs(moveD)) { moveD = o.dx; dir = o.dx > 0 ? 'right' : 'left'; }
    if (c.sy < 0.97) { squash = true; axis = 'y'; } else if (c.sx < 0.97) { squash = true; axis = 'x'; }
    if (c.a < restA * 0.9) fadeIn = true;
  }
  const dt = obs.length > 1 ? (obs[obs.length - 1].t - obs[0].t) / (obs.length - 1) : 0.08;
  // تایپ: حروف تازه از همان اول سر جایشان‌اند
  const grows = new Set(lens).size >= 3 && lens.every((v, j) => j === 0 || v >= lens[j - 1] - 0) && lens[lens.length - 1] > lens[0];
  const newSettled = grows && letters.every(({ f, i }) => !f.ser.length || settled(f.ser[0], i));
  const center = () => {
    const xsr = rest.map(r => r.x), adv = advOf(word[n - 1], size, mono);
    const x0 = drifting ? med(per.map(s => med(s.map(c => c.x))).slice(0, 1)) : xsr[0];
    const x1 = drifting ? x0 + (xsr[n - 1] - xsr[0]) : xsr[n - 1];
    return { cx: r2((x0 + x1 + adv) / 2 - W0 / 2), cy: r2(med(rest.map(r => r.y)) - 0.36 * size - H0 / 2) };
  };
  const colors = () => {
    const cs = letters.map(({ f, i }) => mode(f.ser.filter(c => settled(c, i)).map(c => c.c)) || f.ser[0]?.c);
    const c1 = mode(cs) || '#FFFFFF', others = cs.map((c, j) => [c, letters[j].i]).filter(([c]) => c !== c1);
    let accent = 0, c2 = others[0]?.[0] || c1;
    if (others.length) { const idx = others.map(([, i]) => i); const step = idx.length > 1 ? idx[1] - idx[0] : idx[0] || n; if (idx.every((v, j) => v === idx[0] + j * step) && idx[0] % step === 0) accent = step; }
    return { c1, c2, accent };
  };
  const tracking = () => {
    const d = []; for (let i = 0; i < n - 1; i++) d.push((rest[i + 1].x - rest[i].x) - advOf(word[i], size, mono));
    return r2(med(d) / size) || 0;
  };
  const { cx, cy } = center();
  const sizeK = r3(size / H0);
  const masked = obs.some(o => o.chars.some(c => c.clip > 0));
  const blend = mode(obs.flatMap(o => o.chars.map(c => c.op)));
  if (newSettled) {
    const ts = obs.map(o => o.t), fit = slope(ts, lens), k = fit > 0 ? fit : n / 0.5;
    const tStart = med(obs.map(o => o.t - o.chars.length / k));
    let out = 0; const as = obs.map(o => med(o.chars.map(c => c.a)));
    let j = as.length - 1; while (j > 0 && as[j] < restA - 0.03) j--;
    if (j < as.length - 1) out = r2(sc.t1 - obs[j].t);
    const { c1 } = colors();
    return { kind: 'typeOn', label: `تایپ حرف‌به‌حرف «${word.trim()}»`, x: cx, y: cy, params: { text: word, c1, font: mono ? 'mono' : 'sans', size: sizeK, track: tracking(), op: r2(restA), delay: r2(Math.max(0, tStart - sc.t0)), typeDur: r2(n / k), out } };
  }
  if (!moveD && !squash && !fadeIn) return null;              // بی‌حرکت ← افکت نیست
  // زمان‌ها
  const es = letters.filter(({ f }) => Number.isFinite(f.e)).map(({ f, i }) => [i, f.e]);
  const stagger = es.length >= 3 ? Math.max(0, slope(es.map(x => x[0]), es.map(x => x[1]))) : 0;
  const starts = letters.map(({ f, i }) => {
    if (!f.pre.length) return f.first != null ? f.first - dt / 2 : NaN;
    const mx = Math.max(...f.pre.map(c => Math.abs(off(c, i).dy) + Math.abs(off(c, i).dx) + (1 - Math.min(c.sy, c.sx)) * size));
    const st = f.pre.filter(c => Math.abs(off(c, i).dy) + Math.abs(off(c, i).dx) + (1 - Math.min(c.sy, c.sx)) * size >= mx * 0.97);
    return st.length ? st[st.length - 1].t : f.first;
  });
  const durs = letters.map(({ f }, j) => f.e - starts[j]).filter(v => Number.isFinite(v) && v > 0);
  const dur = r2(Math.max(0.15, (med(durs) || 0.5) / 0.85));
  const e0 = es.length ? es[0][1] - es[0][0] * stagger : sc.t0;
  const delay = r2(Math.max(0, e0 - dur * 0.85 - sc.t0));
  // خروج
  let exit = 'none', exitDur = 0.4, exitStagger = 0, layerEnd = sc.t1;
  const posts = letters.filter(({ f }) => f.post.length);
  if (posts.length >= Math.max(1, letters.length * 0.5)) {
    let ed = 0;
    for (const { f, i } of posts) for (const c of f.post) { const o = off(c, i); if (Math.abs(o.dy) > Math.abs(ed)) ed = o.dy; }
    if (Math.abs(ed) > 0.05 * size) {
      exit = ed < 0 ? 'above' : 'below';
      const ls = posts.map(({ f, i }) => [i, f.l]);
      exitStagger = Math.max(0, r3(slope(ls.map(x => x[0]), ls.map(x => x[1]))));
      const eds = posts.map(({ f, i }) => { const fin = f.post.find(c => Math.abs(off(c, i).dy) >= Math.abs(ed) * 0.95); return fin ? fin.t - f.l : NaN; });
      exitDur = r2(Math.max(0.12, med(eds) || 0.4));
      layerEnd = Math.min(sc.t1, (ls[0][1] - ls[0][0] * exitStagger) + exitDur + exitStagger * (n - 1));
    }
  }
  const { c1, c2, accent } = colors();
  if (squash && !moveD) {
    return { kind: 'squashText', label: `حروف کِشی «${word.trim()}»`, x: drifting ? r2(cx - driftV * ((sc.t0 + sc.t1) / 2 - med(ts0.length ? ts0 : [sc.t0]))) : cx, y: cy, blend: blend !== 'source-over' ? blend : undefined,
      params: { text: word, c1, font: mono ? 'mono' : 'sans', size: sizeK, track: tracking(), inDur: dur, stagger: r3(stagger), delay, drift: r3(-driftV * (sc.t1 - sc.t0) / W0), axis, ease: 'outExpo' } };
  }
  return { kind: 'letterRise', label: `حروف ${stagger > 0.005 ? 'پله‌ای' : ''} «${word.trim()}» ${moveD ? `از ${{ below: 'پایین', above: 'بالا', left: 'چپ', right: 'راست' }[dir]}` : 'با محو'}`.replace(/\s+/g, ' '),
    x: cx, y: cy, dur: r2(layerEnd - sc.t0), blend: blend !== 'source-over' ? blend : undefined,
    params: { text: word, c1, c2, accent, font: mono ? 'mono' : 'sans', size: sizeK, track: tracking(), dir: moveD ? dir : 'none', dist: r2(Math.abs(moveD) / size), inDur: dur, stagger: r3(stagger), delay, ease: 'outExpo', fade: fadeIn ? 'yes' : 'no', mask: masked ? 'yes' : 'no', outDir: exit, outDur: exitDur, outStagger: exitStagger } };
}

function analyzeScene(sc, W0, H0) {
  const F = sc.frames, effects = [], notes = [];
  // گذارها + جدا کردن رویدادهای صحنهٔ بعد (داخل کلیپ گذار)
  const trans = [];
  for (const f of F) {
    f.cut = f.ev.length;
    for (let i = 0; i < f.ev.length; i++) { const k = transKind(f.ev[i], W0, H0); if (k) { f.cut = i; f.trans = k; break; } }
    if (f.trans) { const last = trans[trans.length - 1]; if (last && last.kind === f.trans && f.t - last.t1 < 0.2) last.t1 = f.t; else trans.push({ kind: f.trans, t0: f.t, t1: f.t }); }
  }
  // پس‌زمینه
  const bgs = F.filter(f => !f.trans).map(f => { let b = null; for (const e of f.ev) { if (e.k === 'paint' && e.clip === 0 && e.a > 0.9) b = e; else if (e.k !== 'paint') break; } return b; }).filter(Boolean);
  const bgE = bgs.length ? bgs[Math.floor(bgs.length / 2)] : null;
  const bg = bgE ? (bgE.c === 'grad' ? stopsHex(bgE.stops) : [bgE.c]) : null;
  // متن‌ها
  const tracks = [], strs = [];
  for (const f of F) {
    const texts = f.ev.slice(0, f.cut).filter(e => e.k === 'text' && e.a > 0.01 && e.size > 2);
    const { runs, strings } = letterRuns(texts);
    for (const r of runs) {
      let tr = tracks.find(T => T.mono === r.mono && Math.abs(T.size - r.size) < 1 + 0.03 * r.size && (T.word === r.word || T.word.startsWith(r.word) || r.word.startsWith(T.word)) && Math.abs(T.lastX - r.x0) < 0.8 * r.size && T.lastT < f.t);
      if (!tr) { tr = { word: r.word, mono: r.mono, size: r.size, obs: [], lastX: r.x0, lastT: -1 }; tracks.push(tr); }
      if (r.word.length > tr.word.length) tr.word = r.word;
      tr.obs.push({ t: f.t, chars: r.chars }); tr.lastX = r.x0; tr.lastT = f.t;
    }
    strs.push({ t: f.t, strings, f });
  }
  for (const tr of tracks) {
    if (tr.obs.length < 3) continue;
    try { const ef = analyzeLetters(tr, sc, W0, H0); if (ef) effects.push(ef); } catch (e) { console.warn('effects', e); }
  }
  // نوشته‌های کامل: روان (marquee)، برشی، HUD، رمزگشا، محو
  const used = new Set();
  const byS = new Map();
  for (const { t, strings } of strs) for (const e of strings) { if (!byS.has(e.s)) byS.set(e.s, []); byS.get(e.s).push({ t, ...e }); }
  for (const [s, evs] of byS) {
    const frames = new Map(); for (const e of evs) { if (!frames.has(e.t)) frames.set(e.t, []); frames.get(e.t).push(e); }
    const multi = [...frames.values()].filter(a => a.length >= 2);
    if (multi.length >= Math.max(2, frames.size * 0.6) && evs.every(e => e.stroke || e.a < 0.5)) {
      const ys = new Set(evs.map(e => Math.round(e.y))), size = med(evs.map(e => e.size)), mn = Math.min(W0, H0);
      // سرعت: جابه‌جایی کمینهٔ هر ردیف بین دو فریم پشت سر هم (با در نظر گرفتن تکرار)
      const rowsV = [];
      for (const y of ys) {
        const seq = [...frames.entries()].map(([t, a]) => [t, a.filter(e => Math.round(e.y) === y).map(e => e.x).sort((p, q) => p - q)]).filter(([, a]) => a.length >= 2);
        for (let j = 1; j < seq.length; j++) { const rw = seq[j][1][1] - seq[j][1][0], d = seq[j][1][0] - seq[j - 1][1][0]; const w = ((d % rw) + rw * 1.5) % rw - rw / 2; rowsV.push(Math.abs(w) / (seq[j][0] - seq[j - 1][0])); }
      }
      effects.push({ kind: 'marquee', label: `نوشتهٔ روان توخالی «${s.trim().slice(0, 30)}»`, x: 0, y: 0, params: { text: s, c1: evs[0].c, rows: ys.size, size: Math.round(size * 1080 / mn), speed: Math.round((med(rowsV) || 300) * 1080 / mn), op: r2(med(evs.map(e => e.a))) } });
      used.add(s); continue;
    }
  }
  // کلمه‌های برشی: هر کلمه در یک فریم ≥۲ بار با کلیپ
  const slices = [];
  for (const { t, strings, f } of strs) {
    const cnt = new Map(); for (const e of strings) if (e.clip > 0 && !e.stroke && !used.has(e.s)) cnt.set(e.s, (cnt.get(e.s) || 0) + 1);
    for (const [s, c] of cnt) if (c >= 2) {
      const size = strings.find(e => e.s === s).size;
      const boxes = f.ev.slice(0, f.cut).filter(e => e.k === 'fill' && e.rects === 1 && e.rh > size * 0.8 && e.rw > size * 0.5);
      const box = boxes.sort((a, b) => b.rw - a.rw)[0];
      slices.push({ t, s, size, c: strings.find(e => e.s === s).c, box: box?.c, y: strings.find(e => e.s === s).y });
    }
  }
  if (slices.length >= 3) {
    const words = []; for (const x of slices) if (!words.length || words[words.length - 1].s !== x.s) words.push({ s: x.s, t0: x.t, t1: x.t, box: x.box }); else { words[words.length - 1].t1 = x.t; words[words.length - 1].box ||= x.box; }
    const per = r2(med(words.slice(0, -1).map(w => w.t1 - w.t0 + (F[1]?.t - F[0]?.t || 0.08))) || 0.5);
    const size = med(slices.map(x => x.size));
    const small = strs.flatMap(x => x.strings).filter(e => e.mono && e.size < size * 0.25);
    const label = mode(small.filter(e => !/^\s*\d+\s*\/\s*\d+\s*$/.test(e.s)).map(e => e.s)) || '';
    const counter = small.some(e => /^\s*\d+\s*\/\s*\d+\s*$/.test(e.s));
    for (const w of words) used.add(w.s);
    if (label) used.add(label);
    small.forEach(e => { if (/^\s*\d+\s*\/\s*\d+\s*$/.test(e.s)) used.add(e.s); });
    effects.push({ kind: 'sliceWords', label: `کلمه‌های برشی با جعبه: ${words.map(w => w.s).join('، ')}`, x: 0, y: r2(med(slices.map(x => x.y)) - 0.36 * size - H0 / 2), from: r2(words[0].t0 - sc.t0 - per / 2 > 0.05 ? words[0].t0 - sc.t0 - 0.04 : 0),
      params: { words: words.map(w => w.s).join(', '), colors: words.map(w => w.box).filter(Boolean).join(', '), c1: slices[0].c, font: 'sans', size: r3(size / H0), per, label, counter: counter ? 'yes' : 'no' } });
  }
  // HUD: نوشته‌های ریز ماشین‌تحریر نزدیک گوشه‌ها در بیشتر فریم‌ها
  const corner = e => (e.x < W0 * 0.15 ? 'l' : e.x > W0 * 0.6 ? 'r' : '') + (e.y < H0 * 0.15 ? 't' : e.y > H0 * 0.85 ? 'b' : '');
  const hudEv = strs.flatMap(x => x.strings.map(e => ({ ...e, t: x.t }))).filter(e => e.mono && e.size < H0 * 0.04 && corner(e).length === 2);
  if (hudEv.length && new Set(hudEv.map(e => e.t)).size >= F.length * 0.5) {
    const get = k => mode(hudEv.filter(e => corner(e) === k).map(e => e.s));
    const tl = get('lt') || '', br = get('rb') || get('lb') || '';
    effects.push({ kind: 'hud', label: 'قاب HUD با نوشته‌های گوشه', x: 0, y: 0, params: { c1: mode(hudEv.map(e => e.c)) || '#FFFFFF', tl, br, m: Math.round(40 * 1080 / Math.min(W0, H0)), len: 26 } });
    hudEv.forEach(e => used.add(e.s));
    // رمزگشا: نوشته‌ای در گوشه که اول عوض می‌شود و بعد ثابت می‌ماند
    for (const k of ['lb', 'lt', 'rb', 'rt']) {
      const seq = hudEv.filter(e => corner(e) === k).sort((a, b) => a.t - b.t);
      if (seq.length < 4) continue;
      const fin = seq[seq.length - 1].s;
      let j = seq.length - 1; while (j > 0 && seq[j - 1].s === fin) j--;
      const changing = seq.slice(0, j).filter(e => e.s.length === fin.length && e.s !== fin);
      if (changing.length >= 1 && j < seq.length - 2 && seq.slice(0, j).every(e => e.s.length === fin.length)) {
        effects.push({ kind: 'scramble', label: `رمزگشایی «${fin.trim()}»`, x: r2(seq[j].x - W0 / 2), y: r2(seq[j].y - seq[j].size * 0.36 - H0 / 2), dur: r2(Math.min(sc.t1 - sc.t0, Math.max(1, seq[j].t - sc.t0 + 0.5))),
          params: { text: fin, c1: seq[j].c, font: 'mono', size: r3(seq[j].size / H0), op: r2(seq[j].a), delay: 0, decodeDur: r2(Math.max(0.1, seq[j].t - sc.t0)), align: 'left' } });
        break;
      }
    }
  }
  // نوشته‌های ثابت که محو/بالا می‌آیند
  for (const [s, evs] of byS) {
    if (used.has(s) || s.trim().length < 3 || /\d/.test(s) && evs.length < F.length * 0.3) continue;
    const ser = evs.sort((a, b) => a.t - b.t), A = Math.max(...ser.map(e => e.a));
    const yR = mode(ser, e => Math.round(e.y)), a0 = ser[0].a, dy0 = ser[0].y - yR;
    if (ser.length < 3 || (a0 > A * 0.85 && Math.abs(dy0) < 2)) continue;
    const fin = ser.find(e => e.a >= A - 0.03 && Math.abs(e.y - yR) < 2) || ser[ser.length - 1];
    const d = r2(Math.max(0.2, (fin.t - ser[0].t) * 1.2));
    effects.push({ kind: 'text', label: `نوشتهٔ ${Math.abs(dy0) > 2 ? 'بالاآینده' : 'محوشونده'} «${s.trim().slice(0, 30)}»`, x: r2(ser[0].x + (ser[0].align === 'center' ? 0 : advOf(s, ser[0].size, ser[0].mono, false) / 2) - W0 / 2), y: r2(yR - ser[0].size * 0.36 - H0 / 2),
      from: r2(Math.max(0, ser[0].t - sc.t0 - 0.05)), params: { str: s, size: r2(ser[0].size), color: ser[0].c, opacity: r2(A), enter: [Math.abs(dy0) > 2 ? 'rise' : 'fade', d] } });
    used.add(s);
  }
  // ذره‌ها، نقطه‌ها، حلقه‌ها
  const stat = F.map(f => {
    const ev = f.ev.slice(0, f.cut);
    const dots = ev.filter(e => e.k === 'fill' && e.arcs === 1 && e.small === 1 && e.rects === 0);
    const streaks = ev.filter(e => e.k === 'stroke' && e.moves >= 50 && e.lines >= e.moves * 0.8);
    const rings = ev.filter(e => e.k === 'stroke' && e.arcs === 1 && !e.lines && e.maxR > 25 && e.lw > 2);
    return { t: f.t, dots, nd: dots.length, ns: streaks.reduce((a, e) => a + e.moves, 0), streaks, rings };
  });
  const maxD = Math.max(0, ...stat.map(s => s.nd)), maxS = Math.max(0, ...stat.map(s => s.ns));
  if (maxS >= 300) {
    const cols = [...new Set(stat.flatMap(s => s.streaks.map(e => e.c)))];
    effects.push({ kind: 'vortex', label: `ذره‌های چرخان (${maxS} رد ذره)`, x: 0, y: 0, params: { c1: cols[0] || '#5E9FE8', c2: cols[1] || cols[0] || '#DF84A8', n: Math.min(3000, maxS), spin: 1, arms: 3, tilt: 0.45, size: 1, r: 0.46 } });
  }
  if (maxD >= 500) {
    const ds = stat.find(s => s.nd === maxD).dots, cols = ds.map(e => e.c);
    const morph = stat.some((s, j) => j > 0 && s.nd === maxD) ? 0.65 : 0;
    effects.push({ kind: 'dotSphere', label: `ابر نقطه‌ای سه‌بعدی (${maxD} نقطه)`, x: 0, y: 0, params: { c1: cols[0] || '#4FB9C9', c2: cols[cols.length - 1] || '#DF84A8', n: Math.min(4000, maxD), r: 0.31, spin: 1.3, morph, rings: stat.some(s => s.f) ? 'yes' : 'yes', dot: 1 } });
  } else if (maxD >= 40) {
    const ds = stat.find(s => s.nd === maxD).dots;
    effects.push({ kind: 'starfield', label: `ذره‌های ریز شناور (${maxD})`, x: 0, y: 0, params: { c: mode(ds.map(e => e.c)) || '#FFFFFF', n: Math.min(2500, Math.max(60, maxD * 2)), speed: 0.3 }, opacity: r2(Math.min(1, med(ds.map(e => e.a)) * 1.4)) });
  }
  const rs = stat.filter(s => s.rings.length);
  if (rs.length >= 2 && rs[0].t - sc.t0 < (sc.t1 - sc.t0) * 0.6) {
    const cols = [...new Set(rs.flatMap(s => s.rings.map(e => e.c)))];
    effects.push({ kind: 'ringBurst', label: `حلقه‌های انفجاری (${Math.max(...rs.map(s => s.rings.length))} حلقه)`, x: 0, y: 0,
      params: { c1: cols[0] || '#5E9FE8', c2: cols[1] || cols[0] || '#DF84A8', c3: cols[2] || cols[0] || '#EAC26B', n: Math.max(...rs.map(s => s.rings.length)), delay: r2(Math.max(0, rs[0].t - sc.t0 - 0.05)), r: r2(Math.max(...rs.flatMap(s => s.rings.map(e => e.maxR))) / W0) } });
  }
  return { name: sc.name, t0: sc.t0, t1: sc.t1, bg, effects, trans: trans.map(x => ({ ...x, t1: x.t1 + (F[1]?.t - F[0]?.t || 0.08) })) };
}

/** همهٔ صحنه‌ها ← { scenes:[{name,t0,t1,bg,effects,trans}], count } */
export function analyzeTraces(traced, { W0 = 1920, H0 = 1080 } = {}) {
  const scenes = traced.map(sc => analyzeScene(sc, W0, H0));
  // گذارها بین صحنه‌ها: رنگ = پس‌زمینهٔ صحنهٔ بعد
  scenes.forEach((s, i) => s.trans.forEach(tr => { tr.c1 = scenes[i + 1]?.bg?.[0] || '#000000'; tr.c2 = scenes[i + 1]?.effects.find(e => e.params?.c1)?.params.c1 || '#FFFFFF'; }));
  return { scenes, count: scenes.reduce((a, s) => a + s.effects.length + s.trans.length, 0), W0, H0 };
}

/* ── خروجی: موشن‌اسکریپت ── */
const q = v => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const lit = v => (typeof v === 'number' ? String(r3(v)) : Array.isArray(v) ? `[${v.map(lit).join(', ')}]` : q(v));
const optStr = o => '{ ' + Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : q(k)}: ${typeof v === 'string' && /^[A-Z0-9_]+ \* /.test(v) ? v : lit(v)}`).join(', ') + ' }';

export function effectsScript(A, { name = 'code', source = '' } = {}) {
  const { W0, H0 } = A;
  const kinds = [...new Set(A.scenes.flatMap(s => [...s.effects.map(e => e.kind), ...s.trans.map(t => t.kind)]))].filter(k => ELEMENT_KINDS[k]);
  const L = [
    `// ✨ افکت‌های شناسایی‌شده از «${name}» — خروجی خودکار برنامه`,
    '// ─────────────────────────────────────────────────────────────',
    '// قالب: «موشن‌اسکریپت» webvid (JS ساده). برای وارد کردن در برنامه:',
    '//   صفحهٔ پروژه‌ها ← «🧩 پروژه از کد ویدیو»  یا  ویرایشگر ← «📜 موشن‌اسکریپت» ← وارد کردن.',
    '// برای ایجنت‌ها (AI): هر scene() یک صحنه است؛ داخلش bg() و المان‌ها با تنظیم‌های نام‌دار می‌آیند.',
    '//   from/dur زمان نسبت به شروع صحنه (ثانیه)، x/y پیکسل از مرکز قاب (ضربدر SX/SY تا با هر نسبتی جور شود).',
    '//   size در المان‌های تایپوگرافی = نسبت به ارتفاع قاب. رنگ‌ها هگز. transition() روی مرز صحنه‌ها.',
    '//   می‌توانید متن‌ها، رنگ‌ها، زمان‌ها را عوض کنید، صحنه/المان اضافه یا حذف کنید و دوباره وارد کنید.',
    `// قاب اصلی کد: ${W0}×${H0}`,
    '//',
    '// المان‌های استفاده‌شده و تنظیم‌هایشان:',
  ];
  for (const k of kinds) {
    const K = ELEMENT_KINDS[k];
    L.push(`//   ${k}({ ${K.params.map(p => `${p.key}${p.type === 'sel' ? `: ${p.opts.map(o => o[0]).join('|')}` : ''}`).join(', ')} })  — ${K.label}: ${K.desc || ''}`);
  }
  L.push('//   text(\'نوشته\', { size, color, opacity, x, y, from, dur, enter: [حرکت، مدت] })  — نوشتهٔ ساده', '');
  L.push(`const SX = W / ${W0}, SY = H / ${H0}, S = Math.min(SX, SY)`, '');
  const json = { format: 'webvid-effects', version: 1, source: name, frame: [W0, H0], scenes: A.scenes.map(s => ({ name: s.name, t0: r3(s.t0), t1: r3(s.t1), bg: s.bg, effects: s.effects.map(e => ({ kind: e.kind, label: e.label, x: e.x, y: e.y, from: e.from, dur: e.dur, blend: e.blend, params: e.params })), transitions: s.trans.map(t => ({ kind: t.kind, at: r3((t.t0 + t.t1) / 2), dur: r3(t.t1 - t.t0) })) })) };
  L.push('/* WEBVID_EFFECTS_JSON', JSON.stringify(json, null, 1), 'WEBVID_EFFECTS_JSON */', '');
  for (const s of A.scenes) {
    const items = [];
    if (s.bg?.length) items.push(s.bg.length > 1 ? `bg(${lit(s.bg.slice(0, 2))}, { radial: true })` : `bg(${q(s.bg[0])})`);
    for (const e of s.effects) {
      const pos = { x: e.x ? `${r2(e.x)}` : undefined, y: e.y ? `${r2(e.y)}` : undefined };
      const common = {};
      if (pos.x) common.x = `X * SX`.replace('X', pos.x);
      if (pos.y) common.y = `Y * SY`.replace('Y', pos.y);
      if (e.from) common.from = e.from;
      if (e.dur) common.dur = r3(Math.max(0.1, e.dur - (e.from || 0)));
      if (e.blend) common.blend = e.blend;
      if (e.opacity != null) common.opacity = e.opacity;
      common.name = '✨ ' + e.label.slice(0, 40);
      if (e.kind === 'text') {
        const { str, size, color, opacity, enter } = e.params;
        items.push(`// ${e.label}\n  text(${q(str)}, ${optStr({ size: `${r2(size)} * S`, color, opacity, ...common, enter })})`);
      } else items.push(`// ${e.label}\n  ${e.kind}(${optStr({ ...e.params, ...common })})`);
    }
    L.push(`scene({ name: ${q(s.name)}, at: ${r3(s.t0)}, dur: ${r3(s.t1 - s.t0)} },`, '  ' + items.join(',\n  ') + ')');
    for (const t of s.trans) L.push(`transition(${q(t.kind)}, ${optStr({ at: r3((t.t0 + t.t1) / 2), dur: r3(Math.max(0.15, t.t1 - t.t0)), c1: t.c1, ...(ELEMENT_KINDS[t.kind]?.params.some(p => p.key === 'c2') ? { c2: t.c2 } : {}) })})`);
    L.push('');
  }
  return L.join('\n').replace(/'(-?[\d.]+ \* S[XY]?)'/g, '$1');
}

/**
 * از نتیجهٔ importCode (کد بوم JS/HTML یا pycairo) افکت‌ها را پیدا می‌کند.
 * @returns {Promise<{A, script, count}|null>}  null = این نوع کد پشتیبانی نمی‌شود / لغو شد
 */
export async function detectEffects(R, { name = 'code', fps = 12, onProgress = null, isCancelled = () => false } = {}) {
  if (!R?.canvas || !R.scenes?.length) return null;
  const { program, T, run } = R.canvas;
  let sample, W0 = run?.W0 || 1920, H0 = run?.H0 || 1080;
  if (R.pyframes || run?.lang === 'py') {
    const inst = getPyInst(program, T, run);
    if (!inst?.fn) return null;
    W0 = inst.W0 || W0; H0 = inst.H0 || H0;
    sample = (ctx, t) => pyFrame(inst, ctx, t);
  } else {
    sample = (ctx, t) => { ctx.save(); ctx.translate(W0 / 2, H0 / 2); try { runImported(ctx, { t, w: W0, h: H0, p: 0 }, program, T, run); } finally { ctx.restore(); } };
  }
  const scenes = R.scenes.filter(s => s.t1 > s.t0).map(s => ({ name: s.name, t0: s.t0, t1: s.t1 }));
  const tr = await traceScenes(sample, scenes, { W0, H0, fps, onProgress, isCancelled });
  if (!tr) return null;
  const A = analyzeTraces(tr, { W0, H0 });
  return { A, count: A.count, script: effectsScript(A, { name }) };
}
