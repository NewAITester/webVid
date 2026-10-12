import { ELEMENT_KINDS, ELEMENT_CATS } from './elements.js';
import { tokenize, matchBrackets } from './importers/jstok.js';

/**
 * «بستهٔ المان» — افزودن المان‌های تازه به برنامه بدون تغییر کد برنامه
 * ─────────────────────────────────────────────────────────────
 * هر جای یک موشن‌اسکریپت (یا یک فایل جدا) می‌شود نوشت:
 *
 *   elementPack({
 *     myEffect: {
 *       label: 'افکت من', ic: '✨', cat: 'type', box: 'full', desc: '…',
 *       params: [ T('text', 'نوشته', 'HELLO'), C('c1', 'رنگ', '#FFFFFF'), N('speed', 'سرعت', 1, 0, 5, 0.1),
 *                 S('mode', 'حالت', 'a', [['a', 'الف'], ['b', 'ب']]) ],
 *       code: p => `ctx.fillStyle = e.c1; ctx.fillText(${JSON.stringify(p.text)}, 0, 0);`,
 *     },
 *   })
 *
 * المان‌ها ثبت و در مرورگر نگه داشته می‌شوند؛ بعد مثل المان‌های خود برنامه
 * در اسکریپت‌ها (myEffect({...})) و فهرست المان‌ها هستند و تنظیم‌هایشان اسلایدر دارند.
 */
const KEY = 'webvid.elementPacks';
const N = (key, label, def, min = 0, max = 100, step = 1) => ({ key, label, type: 'num', def, min, max, step });
const C = (key, label, def) => ({ key, label, type: 'color', def });
const T = (key, label, def) => ({ key, label, type: 'text', def });
const S = (key, label, def, opts) => ({ key, label, type: 'sel', def, opts });
const BUILTIN = new Set(Object.keys(ELEMENT_KINDS));
const CATS = new Set(ELEMENT_CATS.map(c => c[0]));

/** المان‌های تعریف‌شده را بررسی و ثبت می‌کند ← { added:[], errors:[] } */
export function registerElements(defs, { source = 'pack' } = {}) {
  const added = [], errors = [];
  for (const [kind, d] of Object.entries(defs || {})) {
    try {
      if (!/^[A-Za-z_$][\w$]*$/.test(kind)) throw new Error('نام نادرست');
      if (BUILTIN.has(kind)) throw new Error('هم‌نام یک المان خود برنامه است');
      if (!d || typeof d.code !== 'function') throw new Error('code باید تابع p => `…کد…` باشد');
      const params = (d.params || []).map(x => {
        if (!x || !x.key || !['num', 'color', 'text', 'sel'].includes(x.type)) throw new Error('تنظیم نادرست: ' + JSON.stringify(x));
        return { ...x, label: x.label || x.key };
      });
      const K = { label: String(d.label || kind), ic: d.ic || '🧩', box: ['full', 'sq', 'band'].includes(d.box) ? d.box : 'full',
        cat: CATS.has(d.cat) ? d.cat : 'pack', desc: String(d.desc || ''), params, code: d.code, cols: d.cols, tr: !!d.tr, pack: source };
      const probe = {}; for (const x of params) probe[x.key] = x.def;
      const code = K.code(probe);
      if (typeof code !== 'string') throw new Error('code باید متن برگرداند');
      new Function('ctx', 'e', code);           // فقط بررسی نحو
      if (K.cat === 'pack' && !ELEMENT_CATS.some(c => c[0] === 'pack')) ELEMENT_CATS.push(['pack', '🧩 افزوده (بسته‌ها)']);
      ELEMENT_KINDS[kind] = K;
      added.push(kind);
    } catch (e) { errors.push(`${kind}: ${e.message}`); }
  }
  return { added, errors };
}

/** اجرای متن یک بسته (elementPack({...}) ها) */
export function runPackText(text, { source = 'pack' } = {}) {
  const added = [], errors = [];
  const elementPack = defs => { const r = registerElements(defs, { source }); added.push(...r.added); errors.push(...r.errors); };
  // eslint-disable-next-line no-new-func
  new Function('elementPack', 'N', 'C', 'T', 'S', `"use strict";\n${text}\n;`)(elementPack, N, C, T, S);
  return { added, errors };
}

/** فراخوانی‌های elementPack(…) داخل یک اسکریپت ← { packs:[متن], rest: اسکریپت بدون آن‌ها (شمارهٔ خط‌ها حفظ می‌شود) } */
export function extractPacks(src) {
  src = String(src || '');
  if (!/\belementPack\s*\(/.test(src)) return { packs: [], rest: src };
  const toks = tokenize(src), m = matchBrackets(toks), cut = [];
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i].t !== 'id' || toks[i].v !== 'elementPack' || toks[i + 1].v !== '(' || m[i + 1] < 0) continue;
    if (toks[i - 1] && toks[i - 1].v === '.') continue;
    let end = m[i + 1];
    if (toks[end + 1]?.v === ';') end++;
    cut.push([toks[i].s, toks[end].e]);
    i = end;
  }
  const packs = cut.map(([s, e]) => src.slice(s, e));
  let rest = src;
  for (const [s, e] of cut.reverse()) rest = rest.slice(0, s) + src.slice(s, e).replace(/[^\n]/g, ' ') + rest.slice(e);
  return { packs, rest };
}

/* ── نگه‌داری در مرورگر ── */
function readSaved() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } }
export function savedPacks() { return readSaved(); }
export function savePack(name, text) {
  const all = readSaved(); all[name] = text;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* */ }
}
export function removePack(name) {
  const all = readSaved(); delete all[name];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* */ }
  for (const [k, K] of Object.entries(ELEMENT_KINDS)) if (K.pack === name) delete ELEMENT_KINDS[k];
}
/** بسته‌های داخل اسکریپت را ثبت و ذخیره می‌کند؛ اسکریپت بدون آن‌ها را برمی‌گرداند */
export function usePacks(src) {
  const { packs, rest } = extractPacks(src);
  const added = [], errors = [];
  packs.forEach(text => {
    const name = 'pack:' + hash(text);
    try { const r = runPackText(text, { source: name }); added.push(...r.added); errors.push(...r.errors); if (r.added.length) savePack(name, text); }
    catch (e) { errors.push('elementPack: ' + (e.message || e)); }
  });
  return { rest, added, errors };
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); }

// بسته‌های ذخیره‌شده با بار شدن برنامه ثبت می‌شوند
if (typeof localStorage !== 'undefined') for (const [name, text] of Object.entries(readSaved())) { try { runPackText(text, { source: name }); } catch { /* */ } }
