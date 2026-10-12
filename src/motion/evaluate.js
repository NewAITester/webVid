import { evalTrack } from './expr.js';
import { animMods, combine } from './animate.js';
import { propDefs, EFFECTS } from './schema.js';
import { noise } from './expr.js';
import * as M from './mat.js';

/**
 * ارزیابی لایه در یک لحظه — بدون کشیدن
 * ─────────────────────────────────────────────────────────────
 * «قانون طلایی» موتور اینجا هم برقرار است: همه‌چیز تابع خالص زمان
 * است. هیچ حالتی بین فریم‌ها نگه داشته نمی‌شود؛ پس اسکراب، پخش و
 * خروجی دقیقاً یک تصویر می‌دهند.
 *
 * ترتیب محاسبه:
 *   ۱) مقدار هر ویژگی از کی‌فریم‌ها
 *   ۲) عبارت (کد) روی همان مقدار
 *   ۳) انیمیشن‌های آماده (ورود/خروج/تکرار)
 *   ۴) افکت‌های حرکتی (لرزش، شناوری، تپش)
 *   ۵) ماتریس نهایی، ضرب‌شده در ماتریس والد
 */

/** حالت صوتی یک لحظه — یک‌بار برای هر فریم حساب می‌شود */
export function frameEnv(song, t, W, H, extra = {}) {
  if (!song) return { time: t, kick: 0, rms: 0, low: 0, beat: 0, pulse: 0, W, H, ...extra };
  return {
    time: t,
    kick: song.kick(t),
    rms: song.rms(t),
    low: song.A?.lowAt ? song.A.lowAt(t) : 0,
    beat: song.beatI(t),
    pulse: song.beatEnv(t, 8),
    W, H, ...extra,
  };
}

/** مقدار همهٔ ویژگی‌ها در زمان محلی lt */
export function evalProps(L, lt, env) {
  const P = {};
  const e2 = { ...env, dur: Math.max(0.01, L.t1 - L.t0) };
  for (const d of propDefs(L.type)) {
    const tr = L.props[d.key];
    let v = tr ? evalTrack(tr, lt, e2, `${L.id}.${d.key}`) : d.def;
    if (d.type === 'num' && typeof v !== 'number') v = d.def;
    P[d.key] = v;
  }
  return P;
}

/** مقادیر پارامترهای افکت‌ها */
export function evalEffects(L, lt, env) {
  const out = [];
  for (const fx of L.effects || []) {
    if (!fx.on || !EFFECTS[fx.type]) continue;
    const v = {};
    for (const d of EFFECTS[fx.type].params) {
      const tr = fx.p[d.key];
      v[d.key] = tr ? evalTrack(tr, lt, env, `${L.id}.${fx.id}.${d.key}`) : d.def;
    }
    out.push({ type: fx.type, kind: EFFECTS[fx.type].kind, v, id: fx.id });
  }
  return out;
}

/** تغییردهندهٔ افکت‌های حرکتی */
export function moveMods(fxs, lt, env) {
  const parts = [];
  const U = Math.max(1, Math.min(env.W || 1080, env.H || 1080));
  for (const f of fxs) {
    if (f.kind !== 'move') continue;
    const v = f.v, t = env.time ?? lt;
    if (f.type === 'shake') {
      const mix = v.beat / 100;
      const amp = (v.amt / 1000) * ((1 - mix) + mix * (env.kick || 0) * 2.2);
      parts.push({ dx: noise(t * v.freq) * amp, dy: noise(t * v.freq + 71.3) * amp });
    } else if (f.type === 'wiggle') {
      const a = v.amt / 1080;
      parts.push({
        dx: noise(t * v.freq + 3.1) * a, dy: noise(t * v.freq + 47.9) * a,
        rot: noise(t * v.freq + 91.7) * v.rot,
      });
    } else if (f.type === 'pulse') {
      parts.push({ s: 1 + (env.kick || 0) * (v.amt / 100) });
    } else if (f.type === 'spin') {
      parts.push({ rot: lt * v.speed * 360 });
    } else if (f.type === 'swing') {
      parts.push({ rot: Math.sin(lt * v.freq * Math.PI * 2) * v.ang });
    } else if (f.type === 'bounce') {
      parts.push({ dy: -Math.abs(Math.sin(lt * v.freq * Math.PI)) * (v.h / U) });
    } else if (f.type === 'orbit') {
      const a = lt * v.freq * Math.PI * 2;
      parts.push({ dx: Math.cos(a) * (v.r / U), dy: Math.sin(a) * (v.r / U) });
    } else if (f.type === 'zoomPulse') {
      parts.push({ s: 1 + Math.sin(lt * v.freq * Math.PI * 2) * (v.amt / 100) });
    } else if (f.type === 'strobe') {
      const mix = v.beat / 100;
      const blink = ((lt * v.rate) % 1) < 0.5 ? 1 : 0;
      const on = (1 - mix) * blink + mix * Math.min(1, (env.kick || 0) * 2.5);
      parts.push({ a: 1 - (v.depth / 100) * (1 - on) });
    }
  }
  return parts;
}

/** ماتریس محلی لایه از روی مقادیر و تغییردهنده‌ها */
export function localMatrix(P, m, U) {
  const k = (P.sc / 100) * m.s;
  let X = M.translate(M.I(), P.x + m.dx * U, P.y + m.dy * U);
  X = M.rotate(X, P.rot + m.rot);
  if (P.skx) X = M.skewX(X, P.skx);
  X = M.scale(X, k * (P.sx / 100) * m.sx, k * (P.sy / 100) * m.sy);
  if (P.ax || P.ay) X = M.translate(X, -P.ax, -P.ay);
  return X;
}

/**
 * وضعیت کامل یک لایه در زمان t (زمان آهنگ).
 * @param {object}  L      لایه
 * @param {number}  t      زمان
 * @param {object}  env    از frameEnv
 * @param {Map}     byId   id → layer (برای والد)
 * @param {Map}     memo   کش همین فریم
 * @returns {{L, lt, dur, P, mods, fx, local, world, alpha, active}}
 */
export function evalLayer(L, t, env, byId = null, memo = null, depth = 0) {
  const key = L.id + '@' + t;
  if (memo?.has(key)) return memo.get(key);

  const dur = Math.max(0.01, L.t1 - L.t0);
  const lt = Math.min(dur, Math.max(0, t - L.t0));
  const e2 = { ...env, dur, index: env.index ?? 0 };
  const P = evalProps(L, lt, e2);
  const fx = evalEffects(L, lt, e2);
  const mods = combine(animMods(L.anim, lt, dur, e2), ...moveMods(fx, lt, e2));
  const U = Math.min(env.W, env.H);

  let parentWorld = M.translate(M.I(), env.W / 2, env.H / 2);
  const par = L.parent && byId?.get(L.parent);
  if (par && par.id !== L.id && depth < 8) {
    parentWorld = evalLayer(par, t, env, byId, memo, depth + 1).world;
  }
  const local = localMatrix(P, mods, U);
  const st = {
    L, lt, dur, P, mods, fx, local,
    world: M.mul(parentWorld, local),
    alpha: Math.max(0, Math.min(1, (P.opacity / 100) * mods.a)),
    active: L.visible !== false && t >= L.t0 && t < L.t1,
  };
  memo?.set(key, st);
  return st;
}

/** آیا لایه برای کشیدن به بوم جداگانه نیاز دارد؟ */
export function needsBuffer(st) {
  if (st.L.type === 'adjust') return true;
  if (st.L.clip && st.L.clip !== 'none') return true;
  if ((st.L.mblur || 0) > 0) return true;
  if (st.mods.blur > 0.3) return true;
  return st.fx.some(f => f.kind === 'filter');
}
