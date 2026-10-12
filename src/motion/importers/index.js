import { analyzeJS, extractHtml } from './canvasjs.js';
import { looksDomPage, pyEmbeddedHtml, domSeekName, domAudioName } from './domframes.js';
import { analyzeRun, synthAudio, REEL_NAMES, PRELUDE_NAMES } from './runtime.js';
import { emitScript } from './emit.js';
import { Interp } from './pyinterp.js';
import { moviepyModules, moviepyModel } from './moviepy.js';
import { manimModules, runManimScenes, manimModel } from './manim.js';
import { fallbackModel, literals } from './fallback.js';
import { looksPyCairo, getPyInst, pyThumb, pyAudioFn } from './pyframes.js';
import { runScript, scriptToLayers } from '../scenescript.js';
import { ELEMENT_KINDS } from '../elements.js';
import { usePacks } from '../packs.js';

/**
 * «وارد کردن کد ویدیو»
 * ─────────────────────────────────────────────────────────────
 * هر کدی که با آن ویدیو ساخته شده را می‌خواند، اجزایش را پیدا می‌کند و
 * به موشن‌اسکریپت (لایه‌های قابل‌ویرایش) تبدیل می‌کند:
 *   • موشن‌اسکریپت خود برنامه        ← همان
 *   • کد بوم (Canvas 2D) در JS/HTML   ← کد اصلی داخل لایه‌های «کد»، صحنه‌به‌صحنه،
 *                                        با رنگ‌ها/متن‌ها/عددهای قابل‌تغییر
 *   • پایتون MoviePy / Manim           ← اجرای نمادین ← متن، شکل، پس‌زمینه، کی‌فریم
 *   • پایتونِ سازندهٔ فایل (مثل build.py) ← گزارش فایل‌هایی که کنار هم می‌گذارد
 * مقدارهای بالای فایل‌های پایتون (NAME = 12  # توضیح) هم قابل‌تغییرند و
 * کد اصلیِ تغییریافته را می‌شود دوباره دانلود کرد.
 */

export const FORMATS = {
  motion: { ic: '📜', label: 'موشن‌اسکریپت' },
  canvas: { ic: '🎨', label: 'کد بوم (Canvas 2D)' },
  html: { ic: '🌐', label: 'صفحهٔ HTML با بوم' },
  moviepy: { ic: '🎬', label: 'پایتون MoviePy' },
  manim: { ic: '📐', label: 'پایتون Manim' },
  python: { ic: '🐍', label: 'پایتونِ سازندهٔ فایل' },
  unknown: { ic: '❓', label: 'ناشناخته' },
};

const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
const r3 = v => +(+v).toFixed(3);
const q = v => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const lit = v => (typeof v === 'number' ? String(r3(v)) : q(v));
const cmt = s => String(s || '').replace(/\s+/g, ' ').slice(0, 70);

/** تشخیص نوع کد */
export function detectFormat(text, name = '') {
  const s = String(text || ''), n = String(name).toLowerCase();
  if (/\bimported\s*\(\s*PROGRAM\b/.test(s) && /^\s*scene\s*\(/m.test(s)) return 'motion';   // خروجی همین واردکننده
  if (/^\s*elementPack\s*\(/m.test(s)) return 'motion';                                         // بستهٔ المان (+ صحنه‌ها)
  if (/\.html?$/.test(n) || /^\s*(<!doctype|<html|<head|<body|<canvas|<script)/i.test(s)) return 'html';
  const py = /\.py$/.test(n) || (/^\s*(from\s+[\w.]+\s+import|import\s+[\w.]+\s*$|def\s+\w+\(.*\)\s*:|class\s+\w+(\(.*\))?\s*:)/m.test(s) && !/[{};]\s*$/m.test(s.split('\n').slice(0, 30).join('\n').replace(/#.*$/gm, '')));
  if (py) {
    if (/^\s*(from|import)\s+moviepy\b/m.test(s)) return 'moviepy';
    if (/^\s*(from|import)\s+(manim|manimlib)\b/m.test(s)) return 'manim';
    return 'python';
  }
  const canvasy = /getContext\s*\(|\bctx\s*\.\s*(fillRect|fillText|arc|beginPath|drawImage|save)\b|requestAnimationFrame|CanvasRenderingContext2D/.test(s);
  const motion = /^\s*scene\s*\(/m.test(s) && /\b(text|bg|shape|burst|transition|tempo)\s*\(/.test(s);
  if (motion && !/getContext\s*\(/.test(s)) return 'motion';
  if (canvasy) return 'canvas';
  if (/\.(m?js|ts)$/.test(n) || /\bfunction\b|=>/.test(s)) return 'canvas';
  return 'unknown';
}

/* ───────────── مقدارهای بالای فایل پایتون ───────────── */
function scanPyValue(line, i) {          // پایان مقدار (بیرون رشته‌ها) و شروع توضیح
  let qch = null;
  for (let k = i; k < line.length; k++) {
    const c = line[k];
    if (qch) { if (c === '\\') k++; else if (c === qch) qch = null; continue; }
    if (c === '"' || c === "'") qch = c;
    else if (c === '#') return k;
  }
  return line.length;
}
function pyLiteral(src) {
  const t = src.trim();
  let m;
  if ((m = /^-?\d+(?:\.\d+)?(?:e-?\d+)?$/i.exec(t))) return { type: 'num', value: +t };
  if ((m = /^([rbuf]?)(['"])((?:\\.|(?!\2).)*)\2$/i.exec(t)) && !/[fb]/i.test(m[1])) {
    const v = m[3].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
    return { type: /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? 'color' : 'text', value: v, quote: m[2] };
  }
  if ((m = /^[([]\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*[)\]]$/.exec(t)) && [m[1], m[2], m[3]].every(x => +x <= 255)) {
    return { type: 'color', rgb: true, value: '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase(), open: t[0], close: t[t.length - 1] };
  }
  if (/^(True|False)$/.test(t)) return { type: 'bool', value: t === 'True' };
  return null;
}
/** NAME = مقدار  # توضیح   (و  A, B = 1, 2) */
export function pyTweaks(src) {
  const out = [], lines = String(src).split('\n');
  let off = 0, inStr = false;
  for (const line of lines) {
    const tq = (line.match(/"""|'''/g) || []).length;
    if (!inStr && /^[A-Za-z_]\w*(\s*,\s*[A-Za-z_]\w*)*\s*=(?!=)/.test(line)) {
      const eq = line.indexOf('=');
      const names = line.slice(0, eq).split(',').map(x => x.trim());
      const vEnd = scanPyValue(line, eq + 1);
      const comment = line.slice(vEnd + 1).trim();
      const raw = line.slice(eq + 1, vEnd);
      let parts = [raw];
      if (names.length > 1) { parts = raw.split(','); if (parts.length !== names.length) parts = null; }
      if (parts) {
        let p = eq + 1;
        names.forEach((nm, i) => {
          const seg = parts[i], lead = seg.length - seg.trimStart().length;
          const L = pyLiteral(seg);
          if (L && L.type !== 'bool' && !/^_/.test(nm)) {
            const s = off + p + lead, e = off + p + lead + seg.trim().length;
            out.push({ id: nm, label: comment || nm, group: 'بالای فایل', ...L, def: L.value, s, e, line: lines.indexOf(line) + 1 });
          }
          p += seg.length + 1;
        });
      }
    }
    if (tq % 2) inStr = !inStr;
    off += line.length + 1;
  }
  return out;
}
/** کد اصلی با مقدارهای تازه */
export function applySourceTweaks(src, tweaks, values, { lang = 'py', map = null } = {}) {
  const eds = [];
  for (const t of tweaks) {
    if (!(t.id in values) || values[t.id] === t.def) continue;
    const v = values[t.id];
    let text;
    if (t.type === 'num') text = String(+v);
    else if (t.rgb) { const h = String(v).replace('#', ''); text = `${t.open}${[0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0).join(', ')}${t.close}`; }
    else { const Q = t.quote || "'"; text = Q + String(v).replace(/\\/g, '\\\\').split(Q).join('\\' + Q).replace(/\n/g, '\\n') + Q; }
    const s = map ? map(t.s) : t.s, e = map ? map(t.e) : t.e;
    eds.push({ s, e, text });
  }
  eds.sort((a, b) => b.s - a.s);
  let out = src;
  for (const ed of eds) out = out.slice(0, ed.s) + ed.text + out.slice(ed.e);
  return out;
}

/* ───────────── گزارش اجزا ───────────── */
const KIND_FA = { bg: ['🟫', 'پس‌زمینه'], text: ['🔤', 'متن'], shape: ['⬛', 'شکل'], el: ['✨', 'المان'], media: ['🖼', 'رسانه (جایگزین)'], adjust: ['🎚', 'تنظیم رنگ'], code: ['〰', 'منحنی (لایهٔ کد)'] };
function modelFound(M) {
  const cnt = {};
  for (const it of M.items) { const k = /^📁/.test(it.name || '') ? 'media' : it.name === 'برچسب رسانه' ? null : it.type; if (k) cnt[k] = (cnt[k] || 0) + 1; }
  return Object.entries(cnt).map(([k, n]) => ({ ic: KIND_FA[k]?.[0] || '•', label: KIND_FA[k]?.[1] || k, n }));
}
function modelScenes(M) {
  const scs = M.scenes?.length ? M.scenes : [{ name: 'صحنه', t0: 0, t1: M.duration }];
  return scs.map(sc => {
    const its = M.items.filter(it => it.t0 < sc.t1 - 1e-3 && it.t1 > sc.t0 + 1e-3 && it.name !== 'برچسب رسانه');
    return { name: sc.name, t0: sc.t0, t1: sc.t1, chips: its.map(it => (it.type === 'text' ? `🔤 ${String(it.str).slice(0, 24)}` : it.type === 'bg' ? `🟫 ${it.c}` : `${KIND_FA[/^📁/.test(it.name || '') ? 'media' : it.type]?.[0] || '•'} ${it.name || it.kind || it.type}`)) };
  });
}

/* ───────────── پایتون ───────────── */
function convertPython(kind, src, name, values) {
  const tweaks = pyTweaks(src);
  const code = values ? applySourceTweaks(src, tweaks, values) : src;
  const warns = [];
  const I = new Interp({ modules: {}, maxSteps: 4e6 });
  let M = null, error = null;
  try {
    if (kind === 'moviepy') {
      const S = { finals: [], all: [], audio: [], media: [], interp: I };
      Object.assign(I.modules, moviepyModules(S));
      I.run(code);
      M = moviepyModel(S, { source: name });
    } else {
      const S = { tracks: [], media: [], audio: [], warn: m => { if (!warns.includes(m)) warns.push(m); }, interp: I, W0: 1920, H0: 1080, bg: '#000000' };
      const mods = manimModules(S), Scene = mods.__Scene; delete mods.__Scene;
      Object.assign(I.modules, mods);
      const g = I.run(code);
      const scenes = runManimScenes(S, g, I, Scene);
      if (!scenes.length) warns.push('هیچ کلاس Scene با construct پیدا نشد.');
      M = manimModel(S, scenes, { source: name });
    }
  } catch (e) {
    error = `خط ${e.line ?? I.line ?? '?'}: ${e.message}`;
  }
  const warnings = [...new Set([...(I.warnings || []), ...warns, ...(M?.notes || [])])];
  // متن‌های نمایش‌داده‌شده که مستقیم در کد نوشته شده‌اند هم قابل‌تغییر شوند
  if (M) {
    const taken = tweaks.map(t => [t.s, t.e]);
    const seen = new Set(tweaks.filter(t => t.type === 'text').map(t => t.value));
    let k = 0;
    for (const it of M.items) {
      if (it.type !== 'text' || seen.has(it.str) || /^🖼/.test(it.str)) continue;
      for (const Q of ['"', "'"]) {
        const needle = Q + String(it.str).replace(/\\/g, '\\\\').replace(/\n/g, '\\n') + Q;
        const at = src.indexOf(needle);
        if (at < 0 || taken.some(([s, e]) => at < e && at + needle.length > s)) continue;
        seen.add(it.str); taken.push([at, at + needle.length]);
        tweaks.push({ id: `TEXT_${++k}`, label: `متن «${String(it.str).slice(0, 30)}»`, group: 'متن‌های کد', type: 'text', value: it.str, def: it.str, quote: Q, s: at, e: at + needle.length, line: src.slice(0, at).split('\n').length });
        break;
      }
    }
  }
  if (values) for (const t of tweaks) if (t.id in values) t.value = values[t.id];
  const script = M ? emitScript(M) : null;
  return {
    kind, script, error, warnings, tweaks, model: M,
    duration: M?.duration || 0, media: M?.media || [], audio: M?.audio || [],
    scenes: M ? modelScenes(M) : [], found: M ? modelFound(M) : [],
    unknown: (I.warnings || []).filter(w => /ناشناخته|پشتیبانی نمی|unknown/i.test(w)),
    source: code,
  };
}

/* ───────────── پایتون فریم‌به‌فریم (pycairo) ───────────── */
const FONT_NAME = /^(Liberation|DejaVu|Noto|Helvetica|Courier|Consolas|Menlo|Monaco|Times|Georgia|Verdana|Roboto|Inter|Ubuntu|Segoe|Tahoma|Impact|Futura|Montserrat|Open Sans|Source)\b/i;
function pyFrameTweaks(src) {
  const tw = pyTweaks(src).filter(t => !/^(NP|NS|N_?PARTICLES|SEED)$/i.test(t.id));
  const taken = tw.map(t => [t.s, t.e]);
  const free = (s, e) => !taken.some(([a, b]) => s < b && e > a);
  // رنگ‌های '#RRGGBB'
  let k = 0;
  for (const m of src.matchAll(/(['"])#([0-9a-fA-F]{6})\1/g)) {
    const s = m.index, e = s + m[0].length;
    if (!free(s, e)) continue;
    const line = src.slice(0, s).split('\n').length, ln = src.split('\n')[line - 1] || '';
    const owner = (/^\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*=/.exec(ln) || [])[1];
    const v = '#' + m[2].toUpperCase();
    tw.push({ id: `COLOR_${++k}`, label: `رنگ ${v}${owner ? ' (' + owner.split(',').map(x => x.trim()).slice(0, 4).join('، ') + ')' : ''}`, group: 'رنگ‌ها', type: 'color', value: v, def: v, quote: m[1], s, e, line, raw: m[0] });
    taken.push([s, e]);
  }
  // متن‌های نوشته‌شده
  k = 0;
  for (const L of literals(src)) {
    if (k >= 40 || FONT_NAME.test(L.str) || !free(L.s, L.e) || !/[A-Za-z\u0600-\u06FF]{2}/.test(L.str)) continue;
    tw.push({ id: `TEXT_${++k}`, label: `متن «${L.str.slice(0, 30)}»`, group: 'متن‌های کد', type: 'text', value: L.str, def: L.str, quote: L.quote, s: L.s, e: L.e, line: L.line });
    taken.push([L.s, L.e]);
  }
  return tw;
}
/** بازهٔ خط‌های هر تابع پایتون (def نام) ← { نام: [شروع، پایان] } (۱-مبنا) */
function pyDefRanges(src) {
  const lines = String(src).split('\n'), out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)def\s+(\w+)\s*\(/.exec(lines[i]);
    if (!m) continue;
    const ind = m[1].length;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || /^\s*#/.test(l)) continue;
      if (l.length - l.trimStart().length <= ind) break;
    }
    if (!(m[2] in out)) out[m[2]] = [i + 1, j];
  }
  return out;
}
/** واحدهای سطح بالای فایل پایتون: def/class یا انتساب «نام = …» ← { names, a, b (خط ۱-مبنا، b انحصاری), refs } */
function pyTopUnits(src) {
  const lines = String(src).split('\n'), top = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || /^\s/.test(l) || /^#/.test(l) || /^[)\]}]/.test(l)) continue;
    top.push(i);
  }
  const strip = t => t.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/g, '""').replace(/#[^\n]*/g, '');
  return top.map((i, k) => {
    const j = k + 1 < top.length ? top[k + 1] : lines.length, l = lines[i];
    let names = [], m;
    if ((m = /^(?:async\s+)?(?:def|class)\s+(\w+)/.exec(l))) names = [m[1]];
    else if ((m = /^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(?::[^=]*)?=(?!=)/.exec(l))) names = m[1].split(',').map(x => x.trim());
    const body = strip(lines.slice(i, j).join('\n'));
    return { names, main: /^if\s+__name__\b/.test(l), a: i + 1, b: j + 1, refs: new Set(body.match(/[A-Za-z_]\w*/g) || []) };
  });
}
/** نام‌هایی که از تابع‌های شروع (بدون رفتن داخل تابع‌های ممنوع) قابل‌دسترسی‌اند */
function pyReach(units, starts, banned) {
  const def = new Map();
  for (const u of units) for (const n of u.names) { if (!def.has(n)) def.set(n, []); def.get(n).push(u); }
  const seen = new Set(), queue = [...starts];
  while (queue.length) {
    const n = queue.pop();
    if (seen.has(n) || banned.has(n)) continue;
    seen.add(n);
    for (const u of def.get(n) || []) for (const r of u.refs) if (!seen.has(r) && def.has(r)) queue.push(r);
  }
  return seen;
}
function convertPyFrames(text, name, values) {
  const tweaks = pyFrameTweaks(text);
  if (values) for (const t of tweaks) if (t.id in values) t.value = values[t.id];
  const T = Object.fromEntries(tweaks.map(t => [t.id, t.value]));
  const run = { lang: 'py', tweaks: tweaks.map(t => ({ id: t.id, s: t.s, e: t.e, raw: text.slice(t.s, t.e), type: t.type === 'num' ? 'num' : 'str', quote: t.quote, def: t.def })) };
  const inst = getPyInst(text, T, run);
  const warnings = [...(inst.warnings || [])];
  const libs = [...new Set([...text.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w., ]+))/gm)].flatMap(m => (m[1] || m[2]).split(',').map(x => x.trim().split(/\s+as\s+/)[0].split('.')[0])))].filter(Boolean);
  const errMsg = e => (e ? `${e.line ? `خط ${e.line}: ` : ''}${e.message || e}` : null);
  if (!inst.fn) return { kind: 'python', script: null, error: errMsg(inst.error) || 'تابع فریم پیدا نشد.', warnings, tweaks, scenes: [], found: [], unknown: [], media: [], audio: [], source: text };
  if (inst.error) warnings.push('خطا هنگام اجرای بالای فایل: ' + errMsg(inst.error));
  Object.assign(run, { fps: inst.fps, W0: inst.W0, H0: inst.H0, fn: inst.fn.name });
  const scenes = inst.scenes.map(s => {
    let thumb = null, err = null;
    try { thumb = pyThumb(inst, s.t0 + (s.t1 - s.t0) * 0.6); } catch (e) { err = e; }
    return { name: s.name, t0: s.t0, t1: s.t1, thumb, err, chips: [s.fn ? `⚙ ${s.fn}()` : `⚙ ${inst.fn.name}()`] };
  });
  const bad = scenes.filter(s => s.err);
  if (bad.length) warnings.push(`خطای اجرای فریم در ${bad.map(s => s.name).join('، ')}: ${errMsg(bad[0].err)}`);
  const post = libs.filter(l => /^(cv2|PIL|scipy|skimage)$/.test(l));
  if (post.length) warnings.push(`پس‌پردازش پیکسلی (${post.join('، ')} — مثل bloom، grain، لرزش رنگ) اجرا نمی‌شود؛ طراحی خود cairo کامل اجرا می‌شود. برای حال‌وهوای مشابه می‌توانید «افکت پایانی» برنامه را روشن کنید.`);
  warnings.push('کد با پایتون واقعی (CPython + numpy داخل برنامه) اجرا می‌شود؛ صدا دقیقاً همان خروجی اجرای اصلی است. تا پایتون واقعی بار شود (چند ثانیه) پیش‌نمایش با مفسر داخلی کشیده می‌شود' + (/\brandom\b|default_rng/.test(text) ? ' و چیدمان ذره‌های تصادفی بعد از بار شدن کمی عوض می‌شود.' : '.'));
  const audioFn = pyAudioFn(inst);
  const L = [
    `// 🧩 وارد‌شده از «${name}» — پایتون فریم‌به‌فریم (pycairo)`,
    `// ${fa(scenes.length)} صحنه · ${fa(r3(inst.dur))} ثانیه · ${fa(inst.fps)} فریم بر ثانیه · قاب اصلی ${inst.W0}×${inst.H0}`,
    `// خود کد پایتون (پایین فایل) هر فریم با ${inst.fn.name}() داخل لایه‌های «کد» اجرا و مستقیم روی بوم کشیده می‌شود.`,
    '// مقدارهای قابل‌تغییر در G است؛ صحنه‌ها را جابه‌جا، کوتاه/بلند یا حذف کنید و «▶ اجرا» بزنید.',
    '', 'const G = {',
  ];
  let lastGroup = null;
  for (const t of tweaks) {
    if (t.group !== lastGroup) { L.push(`  // ── ${t.group}`); lastGroup = t.group; }
    L.push(`  ${t.id}: ${lit(t.value)}, // ${cmt(t.label)}`);
  }
  L.push('}', '// برچسب مقدارها (برای کنترل‌های لایه)', `const GL = {`, ...tweaks.map(t => `  ${t.id}: ${q(cmt(t.label))},`), '}', `const RUN = ${JSON.stringify(run)}`, '');
  // مقدارهایی که فقط داخل تابع همان صحنه‌اند ← «مقدارهای همین صحنه»
  const ranges = pyDefRanges(text);
  const ownOf = s => { const rg = s.fn && ranges[s.fn]; return rg ? tweaks.filter(t => t.line >= rg[0] && t.line <= rg[1]) : []; };
  const owned = new Set(inst.scenes.flatMap(s => ownOf(s).map(t => t.id)));
  const units = pyTopUnits(text), sceneFns = new Set(inst.scenes.map(s => s.fn).filter(Boolean));
  const unitOf = line => units.find(u => line >= u.a && line < u.b);
  const lineAt = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineAt.push(i + 1);
  for (const s of inst.scenes) {
    const own = ownOf(s), mine = new Set(own.map(t => t.id)), hide = [...owned].filter(id => !mine.has(id));
    // مقدارهای سراسری‌ای که این صحنه اصلاً به آن‌ها نمی‌رسد (مال صحنه‌های دیگرند) ← پنهان
    if (s.fn && ranges[s.fn] && sceneFns.size > 1) {
      const reach = pyReach(units, [s.fn, ...(inst.fn.name !== s.fn ? [inst.fn.name] : [])], new Set([...sceneFns].filter(f => f !== s.fn)));
      for (const t of tweaks) {
        if (mine.has(t.id) || hide.includes(t.id)) continue;
        const u = unitOf(t.line);
        if (u && ((u.names.length && !u.names.some(n => reach.has(n))) || u.main)) { hide.push(t.id); continue; }
        // جدول صحنه‌ها مثل [(0, s_intro, 'INTRO'), (2.5, s_flow, 'FLOW')] ← فقط ردیف همین صحنه
        if (u && [...sceneFns].filter(f => u.refs.has(f)).length > 1 && t.s != null) {
          const before = text.slice(lineAt[u.a - 1] ?? 0, t.s);
          let last = null, at = -1;
          for (const f of sceneFns) { const m = [...before.matchAll(new RegExp(`\\b${f}\\b`, 'g'))].pop(); if (m && m.index > at) { at = m.index; last = f; } }
          if (last && last !== s.fn) hide.push(t.id);
        }
      }
    }
    const rg = s.fn && sceneFns.size > 1 && ranges[s.fn];
    const part = rg ? `, part: [${rg[0]}, ${rg[1] + 1}], partName: ${q(s.fn + '()')}` : '';
    const tw = own.length ? `,\n    tweaks: {\n${own.map(t => `      ${t.id}: [G.${t.id}, ${q(cmt(t.label))}],`).join('\n')}\n    }` : '';
    L.push(`scene({ name: ${q(s.name)}, at: ${r3(s.t0)}, dur: ${r3(s.t1 - s.t0)} },`,
      `  imported(PROGRAM(), { run: RUN, start: ${r3(s.t0)}, values: G, labels: GL${hide.length ? `, hide: ${JSON.stringify(hide)}` : ''}${part}, title: ${q(s.name)}, name: ${q('🧩 ' + s.name)}${tw} }))`, '');
  }
  L.push('// ───── کد پایتون اصلی ─────', `function PROGRAM() { return ${JSON.stringify(text)} }`);
  const found = [
    { ic: '🎞', label: 'صحنه', n: scenes.length },
    { ic: '⚙', label: `تابع فریم ${inst.fn.name}()`, n: 1 },
    { ic: '🎨', label: 'رنگ', n: tweaks.filter(t => t.type === 'color').length },
    { ic: '🔤', label: 'متن', n: tweaks.filter(t => t.type === 'text').length },
    { ic: '🔢', label: 'عدد', n: tweaks.filter(t => t.type === 'num').length },
    ...(audioFn ? [{ ic: '🎵', label: `صدای ساخته‌شده با کد (${audioFn}())`, n: 1 }] : []),
  ].filter(f => f.n);
  return {
    kind: 'python', script: L.join('\n'), error: null, warnings, tweaks, scenes: scenes.map(({ err, ...s }) => s), found,
    unknown: libs.filter(l => /^(cv2|PIL|scipy|skimage|imageio)$/.test(l)), media: [], audio: [], duration: inst.dur, hasAudio: !!audioFn,
    canvas: { program: text, T, run }, pyframes: true,
    source: text,
  };
}

function pythonOther(src, name) {
  const files = [...new Set([...src.matchAll(/['"]([\w./\\-]+\.(?:js|mjs|html?|css|png|jpe?g|gif|webp|svg|mp4|webm|mov|mp3|wav|ogg|json|txt|ttf|otf))['"]/gi)].map(m => m[1]))];
  const libs = [...new Set([...src.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w., ]+))/gm)].flatMap(m => (m[1] || m[2]).split(',').map(x => x.trim().split(/\s+as\s+/)[0].split('.')[0])))].filter(Boolean);
  const warnings = [];
  const frameLibs = libs.filter(l => /^(PIL|cv2|imageio|matplotlib|pygame|cairo|skia|numpy|ffmpeg|subprocess)$/.test(l));
  if (files.some(f => /\.(html?|js)$/i.test(f))) warnings.push('این اسکریپت فایل‌های وب را کنار هم می‌گذارد (مثل build.py). خود فایل HTML یا JS نهایی را وارد کنید تا ویدیو خوانده شود؛ فایل‌های لازم پایین آمده‌اند.');
  if (frameLibs.length) warnings.push(`کتابخانه‌های ${frameLibs.join('، ')} فریم‌به‌فریم تصویر می‌سازند و مستقیم اجرا نمی‌شوند؛ مقدارهای بالای فایل قابل‌تغییرند و کد تغییریافته را می‌شود دانلود کرد.`);
  if (!warnings.length) warnings.push('کتابخانهٔ ویدیوی شناخته‌شده‌ای (moviepy یا manim) در این فایل نیست.');
  return { kind: 'python', script: null, error: null, warnings, tweaks: pyTweaks(src), files, libs, scenes: [], found: [], unknown: libs.filter(l => !/^(re|os|sys|math|json|pathlib|random|time|itertools|functools|collections|subprocess|shutil|glob|argparse)$/.test(l)), media: files.filter(f => /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov)$/i.test(f)).map(file => ({ kind: 'فایل', file })), audio: files.filter(f => /\.(mp3|wav|ogg)$/i.test(f)), source: src };
}

/* ───────────── کد بوم ───────────── */
function prepCanvas(text, name, kind) {
  let code = text, W0 = null, H0 = null, title = '', map = null, ext = [];
  if (kind === 'html') {
    const h = extractHtml(text);
    W0 = h.W0; H0 = h.H0; title = h.title; ext = h.ext;
    const parts = []; let pos = 0; const segs = [];
    for (const b of h.blocks) { segs.push([pos, b.off, b.code.length]); parts.push(b.code); pos += b.code.length + 3; }
    code = parts.join('\n;\n');
    map = p => { for (const [js, ho, len] of segs) if (p >= js && p <= js + len) return ho + (p - js); return p; };
  }
  return { code, W0, H0, title, map, ext };
}

/** اسکریپت لایه‌های «کد وارد‌شده» */
function canvasScript(A, R, vals, { name, title }) {
  const segs = R.segments.length ? R.segments : [{ key: '__', t0: 0, t1: R.duration, calls: {}, texts: [] }];
  const labelOf = s => (s.key === '__' ? (segs.length > 1 ? `بخش ${s.n || ''}`.trim() : (title || 'کد وارد‌شده')) : (A.sceneLabels[s.key] || s.key) + (s.n > 1 ? ` ${s.n}` : ''));
  const single = segs.length === 1;
  const G = A.tweaks;   // همه (صحنهٔ «خلاصه» ممکن است صحنه‌های دیگر را هم بکشد)
  const L = [
    `// 🧩 وارد‌شده از «${name}» — ${FORMATS.canvas.label}`,
    `// ${fa(segs.length)} صحنه · ${fa(r3(R.duration))} ثانیه · ${fa(A.tweaks.length)} مقدار قابل‌تغییر · قاب اصلی ${A.run.W0 || '?'}×${A.run.H0 || '?'}`,
    '// کد اصلی دست‌نخورده (پایین فایل) داخل لایه‌های «کد» اجرا می‌شود.',
    '// همهٔ مقدارهای قابل‌تغییر در G است (به ترتیب صحنه)؛ هر لایه مقدارهای صحنهٔ خودش را',
    '// هم بالای کدش نشان می‌دهد تا بعداً در زبانهٔ لایه‌ها هم عوض شود.',
    '// صحنه‌ها را جابه‌جا، کوتاه/بلند یا حذف کنید و «▶ اجرا» بزنید.',
  ];
  if (R.bpm) L.push(`tempo(${r3(R.bpm)})`);
  L.push('', 'const G = {');
  let lastGroup = null;
  for (const t of G) {
    if (t.group !== lastGroup) { L.push(`  // ── ${t.group === 'سراسری' ? 'سراسری' : (A.sceneLabels[t.group] || t.group)}`); lastGroup = t.group; }
    L.push(`  ${t.id}: ${lit(t.id in vals ? vals[t.id] : t.value)}, // ${cmt(t.label)}`);
  }
  L.push('}', '// برچسب مقدارها (برای کنترل‌های لایه)', 'const GL = {', ...G.map(t => `  ${t.id}: ${q(cmt(t.label))},`), '}');
  const run = { ...A.run };
  if (run.declared) run.declared = run.declared.filter(k => /^[A-Za-z_$][\w$]*$/.test(k) && (REEL_NAMES.includes(k) || PRELUDE_NAMES().includes(k)));
  L.push(`const RUN = ${JSON.stringify(run)}`, '');
  for (const s of segs) {
    const own = single ? [] : A.tweaks.filter(t => t.group === s.key);
    const hide = single ? [] : A.tweaks.filter(t => t.group !== s.key && segs.some(x => x.key === t.group)).map(t => t.id);
    const tw = own.length ? `,\n    tweaks: {\n${own.map(t => `      ${t.id}: [G.${t.id}, ${q(cmt(t.label))}],`).join('\n')}\n    }` : '';
    L.push(`scene({ name: ${q(labelOf(s))}, at: ${r3(s.t0)}, dur: ${r3(s.t1 - s.t0)} },`,
      `  imported(PROGRAM(), { run: RUN, start: ${r3(s.t0)}, values: G, labels: GL${hide.length ? `, hide: ${JSON.stringify(hide)}` : ''}, title: ${q(labelOf(s))}, name: ${q('🧩 ' + labelOf(s))}${tw} }))`, '');
  }
  L.push('// ───── کد اصلی ─────', `function PROGRAM() { return ${JSON.stringify(A.program)} }`);
  return L.join('\n');
}

function convertCanvas(kind, text, name, values) {
  const P = prepCanvas(text, name, kind);
  const A = analyzeJS(P.code, { file: name, W0: P.W0, H0: P.H0 });
  const T = Object.fromEntries(A.tweaks.map(t => [t.id, values && t.id in values ? values[t.id] : t.value]));
  let R;
  try { R = analyzeRun(A.program, T, A.run, {}); } catch (e) { R = { ok: false, error: e.message, segments: [], duration: 10, thumbs: {} }; }
  const warnings = [...A.report.warnings];
  if (R.error) warnings.push('خطای اجرا: ' + R.error);
  if (!R.durationFound) warnings.push(`مدت ویدیو در کد پیدا نشد؛ ${fa(r3(R.duration))} ثانیه فرض شد (در اسکریپت عوضش کنید).`);
  if (P.ext.length) warnings.push(`اسکریپت‌های بیرونی بارگذاری نمی‌شوند: ${P.ext.join('، ')}`);
  if (A.report.unknownImports.length) warnings.push(`import ناشناخته: ${A.report.unknownImports.join('، ')}`);
  const tweaks = A.tweaks.map(t => ({ ...t, value: T[t.id] }));
  const script = canvasScript(A, R, T, { name, title: P.title });
  const segs = R.segments.length ? R.segments : [{ key: '__', t0: 0, t1: R.duration, calls: {}, texts: [] }];
  const scenes = segs.map((s, i) => ({
    name: s.key === '__' ? (segs.length > 1 ? `بخش ${i + 1}` : 'کل ویدیو') : (A.sceneLabels[s.key] || s.key), t0: s.t0, t1: s.t1, thumb: R.thumbs?.[R.segments.indexOf(s)] || null,
    chips: [...Object.entries(s.calls || {}).map(([k, n]) => `✨ ${k}${n > 1 ? '' : ''}`), ...(s.texts || []).filter(x => !/\d{1,2}[:/]\d{2}|\d+\.\d+°/.test(x)).slice(0, 4).map(x => `🔤 ${x.slice(0, 24)}`)],
  }));
  const calls = {}; for (const s of segs) for (const k of Object.keys(s.calls || {})) calls[k] = (calls[k] || 0) + 1;
  const found = [
    { ic: '🎞', label: 'صحنه', n: segs.length },
    ...(A.run.fn ? [{ ic: '⚙', label: `تابع اصلی ${A.run.fn}()`, n: 1 }] : []),
    ...Object.keys(calls).length ? [{ ic: '✨', label: 'افکت/المان: ' + Object.keys(calls).slice(0, 12).join('، '), n: Object.keys(calls).length }] : [],
    { ic: '🎨', label: 'رنگ', n: tweaks.filter(t => t.type === 'color').length },
    { ic: '🔤', label: 'متن', n: tweaks.filter(t => t.type === 'text').length },
    { ic: '🔢', label: 'عدد', n: tweaks.filter(t => t.type === 'num').length },
    ...(R.hasAudio ? [{ ic: '🎵', label: 'موسیقی ساخته‌شده با کد', n: 1 }] : []),
  ].filter(f => f.n);
  return {
    kind, script, error: R.ok === false && !R.segments.length ? R.error : null, warnings, tweaks, scenes, found,
    unknown: A.report.unknownImports, media: [], audio: [], duration: R.duration, bpm: R.bpm, hasAudio: !!R.hasAudio,
    report: A.report, canvas: { program: A.program, T, run: A.run },
    source: values ? applySourceTweaks(text, A.tweaks, values, { lang: 'js', map: P.map }) : text,
  };
}

/* ───────────── صفحهٔ وب DOM (div / svg / CSS، بدون بوم) ───────────── */
function convertDom(html, name, { py = null } = {}) {
  const num = re => { const m = re.exec(html); return m ? +m[1] : null; };
  const W0 = py?.W0 || num(/#stage\s*\{[^}]*?\bwidth\s*:\s*(\d+)px/) || num(/<body[^>]*>[\s\S]{0,400}?width\s*:\s*(\d{3,4})px/) || 1920;
  const H0 = py?.H0 || num(/#stage\s*\{[^}]*?\bheight\s*:\s*(\d+)px/) || num(/<body[^>]*>[\s\S]{0,400}?height\s*:\s*(\d{3,4})px/) || Math.round(W0 * 9 / 16);
  const dur = py?.dur || num(/\b(?:DUR|DURATION|TOTAL|LENGTH)\s*[:=]\s*(\d+(?:\.\d+)?)/) || 10;
  const bpm = num(/\b(?:BPM|TEMPO)\s*[:=]\s*(\d+(?:\.\d+)?)/) || (num(/\bBEAT\s*[:=]\s*(0?\.\d+|\d+(?:\.\d+)?)/) ? 60 / num(/\bBEAT\s*[:=]\s*(0?\.\d+|\d+(?:\.\d+)?)/) : null);
  const seek = domSeekName(html), audio = domAudioName(html);
  const doc1 = py ? (/^\s*(?:#[^\n]*\n\s*)*[rRuU]?(?:"""|''')\s*([^\n]+)/.exec(py.src || '')?.[1] || '').split(/\s+[-–—|:]\s+/)[0].trim() : '';
  const title = (/<title>([^<]*)<\/title>/i.exec(html)?.[1] || '').trim() || (doc1.length > 1 && doc1.length < 40 ? doc1 : '') || String(name).replace(/\.[^.]+$/, '');
  const run = { lang: 'dom', W0, H0, dur, ...(seek ? { seek } : {}), ...(audio ? { audio } : {}) };
  const warnings = [];
  if (!seek) warnings.push('این صفحه تابع seek(t) ندارد؛ زمان با ساعت ساختگی (requestAnimationFrame و انیمیشن‌های CSS) جلو می‌رود و عقب رفتن ممکن است دقیق نباشد.');
  if (/fonts\.googleapis|@import\s+url/.test(html)) warnings.push('فونت‌های اینترنتی (مثل Google Fonts) فقط وقتی اینترنت وصل است بار می‌شوند؛ وگرنه فونت جایگزین دیده می‌شود.');
  if (py) warnings.push(`صفحهٔ HTML داخل کد پایتون (${py.varName}) جدا شد و مستقیم اجرا می‌شود — همان کاری که Playwright در اسکریپت می‌کند (seek(t) و عکس هر فریم).`);
  const L = [
    `// 🧩 وارد‌شده از «${name}» — صفحهٔ وب (DOM / SVG / CSS)`,
    `// ${fa(r3(dur))} ثانیه · قاب اصلی ${W0}×${H0}${seek ? ` · زمان با ${seek}(t)` : ''}${audio ? ` · صدا با ${audio}()` : ''}`,
    '// خود صفحه (پایین فایل) در یک iframe پنهان اجرا می‌شود و هر فریم از روی DOM عکس گرفته و روی بوم کشیده می‌شود.',
    '// صحنه را جابه‌جا، کوتاه/بلند یا حذف کنید و «▶ اجرا» بزنید؛ متن و رنگ‌ها را در خود PROGRAM عوض کنید.',
  ];
  if (bpm && bpm > 20 && bpm < 400) L.push(`tempo(${r3(bpm)})`);
  L.push('', `const RUN = ${JSON.stringify(run)}`, '',
    `scene({ name: ${q(title)}, at: 0, dur: ${r3(dur)} },`,
    `  imported(PROGRAM(), { run: RUN, start: 0, title: ${q(title)}, name: ${q('🧩 ' + title)} }))`, '',
    '// ───── صفحهٔ اصلی ─────', `function PROGRAM() { return ${JSON.stringify(html)} }`);
  const found = [
    { ic: '🎞', label: 'صفحهٔ DOM', n: 1 },
    ...(seek ? [{ ic: '⏱', label: `زمان‌بندی ${seek}(t)`, n: 1 }] : []),
    ...(audio ? [{ ic: '🎵', label: `صدای ساخته‌شده با کد (${audio}())`, n: 1 }] : []),
  ];
  return {
    kind: py ? 'python' : 'html', script: L.join('\n'), error: null, warnings, tweaks: [],
    scenes: [{ name: title, t0: 0, t1: dur, thumb: null, chips: ['🌐 DOM / SVG / CSS'] }], found,
    unknown: [], media: [], audio: [], duration: dur, bpm, hasAudio: !!audio,
    canvas: { program: html, T: {}, run }, dom: true, source: html,
  };
}

/**
 * @param {string} text  کد
 * @param {object} o  { name, values }  values: مقدارهای تازهٔ tweaks (اختیاری)
 */
/**
 * آیا این متن «موشن‌اسکریپتِ خود برنامه» است؟ (واقعاً اجرا می‌شود و لایه می‌سازد)
 * موشن‌اسکریپت لازم نیست scene() داشته باشد — مثلاً فقط text()/bg()/overlay() یا المان‌ها.
 */
export function probeMotion(text) {
  try {
    const res = runScript(String(text || ''), { W: 1920, H: 1080, bpm: 120 });
    if (!res.ok) return res.line ? { err: res.error, line: res.line } : null;
    const { layers } = scriptToLayers(res, { W: 1920, H: 1080 });
    return layers.length ? { res, n: layers.length, types: layers.map(L => L.type) } : null;
  } catch { return null; }
}
function motionResult(text, P) {
  const cnt = {};
  for (const t of P?.types || []) cnt[t] = (cnt[t] || 0) + 1;
  return {
    kind: 'motion', script: text, warnings: [], tweaks: [], unknown: [], media: [], audio: [], source: text,
    duration: P?.res.length || 0,
    scenes: (P?.res.scenes || []).map(sc => ({ name: sc.name, t0: sc.t0, t1: sc.t1, chips: (sc.items || []).slice(0, 10).map(it => `• ${it.name || it.kind || it.type}`) })),
    found: P ? Object.entries(cnt).map(([k, n]) => ({ ic: '📜', label: `لایهٔ ${k}`, n })) : [],
  };
}

export function importCode(text, { name = 'code', values = null } = {}) {
  let kind = detectFormat(text, name);
  let EMB = null;
  // بستهٔ المان: اول ثبت شود
  const PK = /\belementPack\s*\(/.test(String(text || '')) ? usePacks(text) : null;
  if (PK && !/^\s*(scene|overlay|transition|text|bg)\s*\(/m.test(PK.rest)) {
    return { kind: 'motion', name, label: FORMATS.motion.label, ic: '🧩', script: null, packOnly: true, packAdded: PK.added, error: PK.added.length ? null : 'هیچ المانی از این بسته ثبت نشد.',
      warnings: PK.errors, tweaks: [], scenes: [], found: [], unknown: [], media: [], audio: [], source: text };
  }
  // کد JS که به‌عنوان «بوم» یا «ناشناخته» تشخیص داده شده ولی در واقع موشن‌اسکریپت است ← همان‌طور که هست
  let P = null;
  if (kind === 'motion' || kind === 'unknown' || (kind === 'canvas' && !/getContext\s*\(|requestAnimationFrame|\bdocument\s*\./.test(text))) {
    P = probeMotion(text);
    if (P?.res) kind = 'motion';
  }
  let r;
  if (kind === 'motion') r = motionResult(text, P);
  else if (kind === 'moviepy' || kind === 'manim') r = convertPython(kind, text, name, values);
  else if (kind === 'python' && looksPyCairo(text)) r = convertPyFrames(text, name, values);
  else if (kind === 'python' && (EMB = pyEmbeddedHtml(text))) r = looksDomPage(EMB.html) ? { ...convertDom(EMB.html, name, { py: { ...EMB, src: text } }), source: text } : { ...convertCanvas('html', EMB.html, name, values), kind: 'python' };
  else if (kind === 'python') r = pythonOther(text, name);
  else if (kind === 'html' && looksDomPage(text)) r = convertDom(text, name, {});
  else if (kind === 'html' || kind === 'canvas') r = convertCanvas(kind, text, name, values);
  else r = { kind, script: null, error: 'نوع این کد شناخته نشد (JS بوم، HTML، MoviePy یا Manim).', warnings: [], tweaks: [], scenes: [], found: [], unknown: [], media: [], audio: [], source: text };
  r.name = name; r.label = FORMATS[kind].label; r.ic = FORMATS[kind].ic;
  if (PK) { r.packAdded = PK.added; r.warnings = [...(r.warnings || []), ...PK.errors]; }
  // شبیه موشن‌اسکریپت ولی خطا دارد ← خود خطا را نشان بده، نه برداشت تقریبی
  const looksMotion = () => new RegExp(`^\\s*(scene|overlay|transition|tempo|${Object.keys(ELEMENT_KINDS).join('|')})\\s*\\(`, 'm').test(text);
  if (!r.script && kind === 'unknown' && P?.err && looksMotion()) {
    r.error = `این کد شبیه موشن‌اسکریپت است ولی در خط ${P.line} خطا دارد: ${P.err}`;
    return r;
  }
  if (!r.script && String(text || '').trim()) {          // قابل اجرا نبود ← برداشت ساده تا بشود پروژه ساخت
    let M = null;
    try { M = fallbackModel(text, r, { name, values }); } catch (e) { console.warn('fallback', e); }
    if (M && M.items.length) {
      r.script = emitScript(M); r.model = M; r.fallback = true;
      r.scenes = modelScenes(M); r.found = modelFound(M); r.duration = M.duration;
      if (!r.media?.length) r.media = M.media;
      r.warnings = [...(r.warnings || []), 'برای ساخت پروژه، متن‌ها، رنگ‌ها، اندازهٔ قاب و تصویرهای همین کد برداشته شد (همه پایین قابل‌تغییرند).'];
      if (r.error) { r.warnings.unshift(r.error); r.error = null; }
    }
  }
  if (kind === 'python' && values) r.source = applySourceTweaks(text, r.tweaks, values);
  return r;
}

/**
 * چند فایل با هم (مثلاً build.py + template.html + scenes.js) ← یک فایل اصلی.
 * قالب HTML با جای‌خالی «SCENES» (کامنت بلوکی) یا <script src="scenes.js"> از فایل‌های
 * همراه پر می‌شود (همان کاری که build.py می‌کند).
 */
export function pickMain(files) {
  const base = n => String(n).split(/[\\/]/).pop();
  const js = files.filter(f => /\.m?js$/i.test(f.name));
  const fill = f => {
    if (!/\.html?$/i.test(f.name) || !js.length) return f;
    let text = f.text, used = [];
    for (const j of js) {
      const b = base(j.name), stem = b.replace(/\.m?js$/i, '');
      const ph = new RegExp(`/\\*\\s*${stem.replace(/\W/g, '.')}\\s*\\*/`, 'i');
      if (ph.test(text)) { text = text.replace(ph, () => j.text.replace(/^export\s+/gm, '')); used.push(b); continue; }
      const tag = new RegExp(`<script\\b([^>]*)\\bsrc\\s*=\\s*["'][^"']*${b.replace(/\W/g, '\\$&')}["']([^>]*)>\\s*</script>`, 'i');
      if (tag.test(text)) { text = text.replace(tag, (m, a, c) => `<script${(a + c).replace(/\btype\s*=\s*["']module["']/i, '')}>${j.text.replace(/^export\s+/gm, '').replace(/^import\s.*$/gm, '')}</script>`); used.push(b); }
    }
    return used.length ? { name: f.name, text, merged: used } : f;
  };
  const all = files.map(fill);
  const merged = new Set(all.flatMap(f => f.merged || []));
  const rank = f => ({ html: 5, canvas: 4, moviepy: 6, manim: 6, motion: 7, python: 1, unknown: 0 }[detectFormat(f.text, f.name)] ?? 0) + (f.merged ? 3 : 0) - (merged.has(base(f.name)) ? 4 : 0);
  return [...all].sort((a, b) => rank(b) - rank(a))[0];
}

export { synthAudio };
