import { tokenize, matchBrackets, strValue } from './jstok.js';
import { REEL_NAMES } from './runtime.js';

/**
 * خواندن کد بوم (Canvas 2D) — فایل JS یا HTML
 * ─────────────────────────────────────────────────────────────
 * ۱) اسکریپت‌های داخل HTML جدا می‌شوند؛ import/export حذف یا جایگزین می‌شود.
 * ۲) تابع اصلی فریم (render/draw/… یا حلقهٔ requestAnimationFrame) پیدا می‌شود.
 * ۳) «صحنه»ها: شیء/آرایه‌ای از تابع‌ها مثل SCENES = { intro(ctx…){…}, … }
 * ۴) مقدارهای قابل‌تغییر: ثابت‌های سراسری، رنگ‌ها، متن‌ها و عددهای داخل
 *    تنظیمات المان‌ها ({ n: 1300, spin: 1.1 }) ← $T.نام در کد بازنویسی‌شده.
 */

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FONTISH = /(sans|serif|monospace|px\b|\bem\b|bold|italic|Arial|Helvetica|Tahoma|Consolas|Menlo)/i;
const KEYWORDISH = /^(?:left|right|center|start|end|top|bottom|middle|alphabetic|hanging|ideographic|ltr|rtl|round|butt|square|miter|bevel|source-over|source-in|source-out|source-atop|destination-over|destination-in|destination-out|destination-atop|lighter|copy|xor|multiply|screen|overlay|darken|lighten|color-dodge|color-burn|hard-light|soft-light|difference|exclusion|hue|saturation|color|luminosity|2d|webgl|webgl2|none|nonzero|evenodd|anonymous|use strict|low|medium|high|lowpass|highpass|bandpass|sine|square|sawtooth|triangle|linear|exponential|function|object|string|number|undefined|boolean|canvas|div|click|keydown|keyup|resize|load|pointerdown|pointermove|pointerup|mousedown|mousemove|mouseup|touchstart|audio\/wav|video\/webm|image\/png|transparent|black|white)$/;
const TEXT_CALLEE = /^(txt|text|label|title|caption|write|say|fillText|strokeText|drawText|typewriter|heading|subtitle|word|banner|slamText|swarmText|marquee)$/i;
const TEXT_KEY = /^(text|label|title|str|caption|word|words|msg|message|name|tl|tr|bl|br|subtitle|heading)$/;
const MAIN_NAMES = ['render', 'renderFrame', 'drawFrame', 'renderAt', 'drawAt', 'draw', 'frame', 'paint', 'scene', 'animate', 'loop', 'tick', 'update', 'step', 'main'];

/** HTML ← اسکریپت‌های داخلی (+ جای هرکدام در فایل) و اندازهٔ بوم */
export function extractHtml(html) {
  const blocks = [], ext = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (src) { ext.push(src[1]); continue; }
    if (/type\s*=\s*["'](?!module|text\/javascript|application\/javascript)[^"']*["']/i.test(attrs)) continue;
    const off = m.index + m[0].indexOf('>') + 1;
    blocks.push({ code: m[2], off });
  }
  const cv = /<canvas\b([^>]*)>/i.exec(html);
  let W0 = null, H0 = null;
  if (cv) { W0 = +(/\bwidth\s*=\s*["']?(\d+)/i.exec(cv[1]) || [])[1] || null; H0 = +(/\bheight\s*=\s*["']?(\d+)/i.exec(cv[1]) || [])[1] || null; }
  const title = (/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || '';
  return { blocks, ext, W0, H0, title: title.trim() };
}

const ident = s => String(s).replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, '_$1') || 'v';

/**
 * تحلیل ایستا
 * @param {string} code  کد JS (همهٔ بلوک‌ها پشت سر هم)
 * @returns {{ program, tweaks, run, report }}
 */
export function analyzeJS(code, { file = 'code.js', W0 = null, H0 = null } = {}) {
  const toks = tokenize(code);
  const M = matchBrackets(toks);
  const edits = [];                     // { s, e, text }
  const report = { file, imports: [], functions: [], declared: [], scenes: [], unknownImports: [], main: null, warnings: [] };
  const declared = new Set();
  const used = new Set(toks.filter(k => k.t === 'id').map(k => k.v));

  /* ── import / export ── */
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.t !== 'kw') continue;
    const prev = toks[i - 1];
    if (prev && prev.t === 'p' && (prev.v === '.' || prev.v === '?.')) continue;
    if (k.v === 'import' && !(toks[i + 1]?.v === '(' || toks[i + 1]?.v === '.')) {
      let j = i + 1; const names = []; let path = '';
      if (toks[j]?.t === 'str') { path = strValue(toks[j]); }
      else {
        for (; j < toks.length && toks[j].v !== 'from'; j++) {
          const q = toks[j];
          if (q.v === '*' && toks[j + 1]?.v === 'as') { names.push(['*', toks[j + 2].v]); j += 2; }
          else if (q.v === '{') {
            const end = M[j];
            for (let a = j + 1; a < end; a++) if (toks[a].t === 'id' || toks[a].t === 'kw') {
              if (toks[a + 1]?.v === 'as') { names.push([toks[a].v, toks[a + 2].v]); a += 2; } else if (toks[a].v !== 'type') names.push([toks[a].v, toks[a].v]);
            }
            j = end;
          } else if (q.t === 'id') names.push(['default', q.v]);
        }
        path = toks[j + 1]?.t === 'str' ? strValue(toks[j + 1]) : '';
        j++;
      }
      let end = toks[j]?.e ?? k.e;
      if (toks[j + 1]?.v === ';') end = toks[j + 1].e;
      const P = JSON.stringify(path);
      const parts = names.map(([a, b]) => (a === '*' ? `const ${b} = $rt.mod(${P});` : `const ${b} = $rt.mod(${P})[${JSON.stringify(a)}];`));
      names.forEach(([, b]) => declared.add(b));
      edits.push({ s: k.s, e: end, text: parts.join(' ') });
      report.imports.push({ path, names: names.map(x => x[1]) });
      if (!/reelfx/.test(path)) report.unknownImports.push(path);
      continue;
    }
    if (k.v === 'export') {
      const nx = toks[i + 1];
      if (nx?.v === '{') { let end = toks[M[i + 1]].e; if (toks[M[i + 1] + 1]?.v === 'from') end = toks[M[i + 1] + 2].e; if (toks[M[i + 1] + (toks[M[i + 1] + 1]?.v === 'from' ? 3 : 1)]?.v === ';') end = toks[M[i + 1] + (toks[M[i + 1] + 1]?.v === 'from' ? 3 : 1)].e; edits.push({ s: k.s, e: end, text: '' }); }
      else if (nx?.v === 'default') {
        const nn = toks[i + 2];
        if (nn && (nn.v === 'function' || nn.v === 'class' || nn.v === 'async')) edits.push({ s: k.s, e: nx.e, text: '' });
        else edits.push({ s: k.s, e: nx.e, text: 'const __default =' });
      } else edits.push({ s: k.s, e: k.e, text: '' });
    }
  }

  /* ── سطح بالا: تعریف‌ها ── */
  const top = [];                        // اندیس توکن‌های سطح بالا
  for (let i = 0; i < toks.length; i++) { top.push(i); if (M[i] > i && toks[i].t === 'p') i = M[i]; }
  const fns = {};                        // نام ← { params, bodyS, bodyE (اندیس توکن) }
  const objs = [];                       // ثابت‌های شیئی سطح بالا
  const topVals = [];                    // const X = literal
  const isLitAt = j => {                 // [s, e, value, type, raw] یا null
    let a = j, neg = false;
    if (toks[a]?.v === '-' && toks[a + 1]?.t === 'num') { neg = true; a++; }
    const q = toks[a];
    if (!q) return null;
    const after = toks[a + 1];
    if (after && !(after.v === ',' || after.v === ';' || after.v === '}' || after.v === ']' || after.v === ')' || after.nl || (q.t === 'str' && after.v === '+'))) return null;
    if (q.t === 'num' && !/[xXbBoOn_]/.test(q.v)) return { s: toks[j].s, e: q.e, value: (neg ? -1 : 1) * +q.v, type: 'num', last: a };
    if (q.t === 'str' && !neg) { const v = strValue(q); return { s: q.s, e: q.e, value: v, type: HEX.test(v) ? 'color' : 'text', last: a, quote: q.v[0] }; }
    return null;
  };
  const paramsOf = (a, b) => {           // اندیس ( و ) ← نام‌ها
    const out = []; let depth = 0, cur = '';
    for (let x = a + 1; x < b; x++) {
      const q = toks[x];
      if (q.t === 'p' && '([{'.includes(q.v)) depth++;
      if (q.t === 'p' && ')]}'.includes(q.v)) depth--;
      if (depth === 0 && q.v === ',') { out.push(cur.trim()); cur = ''; continue; }
      cur += (cur ? ' ' : '') + q.v;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  for (let ti = 0; ti < top.length; ti++) {
    const i = top[ti], k = toks[i];
    if (k.v === 'function' || (k.v === 'async' && toks[i + 1]?.v === 'function')) {
      const f = k.v === 'async' ? i + 1 : i;
      let n = f + 1; if (toks[n]?.v === '*') n++;
      const name = toks[n]?.t === 'id' ? toks[n].v : null;
      const pa = toks[n + 1]?.v === '(' ? n + 1 : -1;
      if (!name || pa < 0) continue;
      const bo = M[pa] + 1;
      declared.add(name);
      fns[name] = { params: paramsOf(pa, M[pa]), bodyS: bo, bodyE: M[bo] };
      continue;
    }
    if (k.v === 'class' && toks[i + 1]?.t === 'id') { declared.add(toks[i + 1].v); continue; }
    if (k.v === 'const' || k.v === 'let' || k.v === 'var') {
      // تعریف‌ها تا ; یا خط تازه در سطح بالا
      let j = i + 1;
      while (j < toks.length) {
        const q = toks[j];
        if (q.v === '{' || q.v === '[') {                     // destructuring
          for (let a = j + 1; a < M[j]; a++) if (toks[a].t === 'id' && toks[a + 1]?.v !== ':') declared.add(toks[a].v);
          j = M[j] + 1;
        } else if (q.t === 'id') { declared.add(q.v); j++; } else break;
        const name = toks[j - 1].t === 'id' ? toks[j - 1].v : null;
        if (toks[j]?.v !== '=') { if (toks[j]?.v === ',') { j++; continue; } break; }
        const vs = j + 1;
        // پایان مقدار
        let e = vs;
        for (; e < toks.length; e++) {
          const q2 = toks[e];
          if (e > vs && q2.nl && (q2.t === 'kw' && /^(const|let|var|function|class|if|for|while|return|export|import|try|switch|do|async)$/.test(q2.v))) break;
          if (q2.v === ';' || q2.v === ',') break;
          if (e > vs && q2.nl && ['id', 'kw'].includes(q2.t) && ['id', 'num', 'str', 'tpl'].includes(toks[e - 1].t || '') ) break;
          if (e > vs && q2.nl && toks[e - 1].v === '}' && q2.t === 'id') break;
          if (M[e] > e && q2.t === 'p') e = M[e];
        }
        if (name) {
          const lit = isLitAt(vs);
          if (lit && lit.last === e - 1) topVals.push({ name, ...lit });
          const v0 = toks[vs];
          if (v0?.v === '{' && M[vs] === e - 1) objs.push({ name, s: vs, e: M[vs] });
          if (v0?.v === '[' && M[vs] === e - 1) objs.push({ name, s: vs, e: M[vs], arr: true });
          // const f = (…) => {…}  یا  function
          let pa = -1;
          if (v0?.v === 'async') pa = vs + 1; else pa = vs;
          if (toks[pa]?.v === 'function') { pa++; if (toks[pa]?.t === 'id') pa++; }
          if (toks[pa]?.v === '(' && toks[M[pa] + 1]?.v === '=>') fns[name] = { params: paramsOf(pa, M[pa]), bodyS: M[pa] + 2, bodyE: toks[M[pa] + 2]?.v === '{' ? M[M[pa] + 2] : e - 1, arrow: true };
          else if (toks[pa]?.v === '(' && toks[M[pa] + 1]?.v === '{' && toks[vs].v !== '(') fns[name] = { params: paramsOf(pa, M[pa]), bodyS: M[pa] + 1, bodyE: M[M[pa] + 1] };
          else if (toks[pa]?.t === 'id' && toks[pa + 1]?.v === '=>') fns[name] = { params: [toks[pa].v], bodyS: pa + 2, bodyE: toks[pa + 2]?.v === '{' ? M[pa + 2] : e - 1, arrow: true };
        }
        j = e;
        if (toks[j]?.v === ',') { j++; continue; }
        break;
      }
    }
  }
  report.declared = [...declared];
  report.functions = Object.keys(fns);

  /* ── صحنه‌ها: شیء یا آرایه‌ای از تابع‌ها ── */
  const memberFns = (o) => {           // اعضای تابعی یک شیء
    const out = [];
    for (let a = o.s + 1; a < o.e; a++) {
      const q = toks[a];
      if ((q.t === 'id' || q.t === 'str' || q.t === 'kw' || q.t === 'num') && (toks[a - 1].v === '{' || toks[a - 1].v === ',')) {
        const key = q.t === 'str' ? strValue(q) : q.v;
        let b = a + 1;
        if (toks[b]?.v === '(' && toks[M[b] + 1]?.v === '{') { out.push({ key, params: paramsOf(b, M[b]), bodyS: M[b] + 1, bodyE: M[M[b] + 1] }); a = M[M[b] + 1]; continue; }
        if (toks[b]?.v === ':') {
          b++;
          if (toks[b]?.v === 'async') b++;
          if (toks[b]?.v === 'function') { b++; if (toks[b]?.t === 'id') b++; }
          if (toks[b]?.v === '(' && (toks[M[b] + 1]?.v === '=>' || toks[M[b] + 1]?.v === '{')) {
            const arrow = toks[M[b] + 1].v === '=>', bs = M[b] + (arrow ? 2 : 1);
            let be = toks[bs]?.v === '{' ? M[bs] : bs;
            if (!(toks[bs]?.v === '{')) { while (be + 1 < o.e && toks[be + 1].v !== ',' ) { be++; if (M[be] > be) be = M[be]; } }
            out.push({ key, params: paramsOf(b, M[b]), bodyS: bs, bodyE: be }); a = be; continue;
          }
          if (toks[b]?.t === 'id' && toks[b + 1]?.v === '=>') { const bs = b + 2; const be = toks[bs]?.v === '{' ? M[bs] : bs; out.push({ key, params: [toks[b].v], bodyS: bs, bodyE: be }); a = be; continue; }
        }
      }
      if (M[a] > a && toks[a].t === 'p') a = M[a];
    }
    return out;
  };
  let holder = null;
  for (const o of objs) {
    if (o.arr) {
      const els = [];
      for (let a = o.s + 1; a < o.e; a++) {
        if (toks[a].v === '{') { const mf = memberFns({ s: a, e: M[a] }); if (mf.length) { const nm = labelInObj(a, M[a]); els.push({ key: String(els.length), label: nm || `صحنه ${els.length + 1}`, fns: mf, s: a, e: M[a] }); } a = M[a]; }
        else if (toks[a].v === ',') continue;
        else if (M[a] > a) a = M[a];
      }
      if (els.length >= 2 && (!holder || /scene|shot|part|section|slide/i.test(o.name) || els.length > holder.items.length)) holder = { name: o.name, kind: 'arr', items: els };
    } else {
      const mf = memberFns(o);
      const sceneLike = mf.filter(f => f.params.length >= 1);
      if (sceneLike.length >= 2 && (!holder || /scene|shot|part|section|slide/i.test(o.name) || (!/scene/i.test(holder.name) && sceneLike.length > holder.items.length)))
        holder = { name: o.name, kind: 'obj', items: sceneLike.map(f => ({ key: f.key, label: f.key, fns: [f], s: f.bodyS, e: f.bodyE })) };
    }
  }
  function labelInObj(a, b) {
    for (let x = a + 1; x < b; x++) if ((toks[x].t === 'id' && /^(name|title|label|id)$/.test(toks[x].v)) && toks[x + 1]?.v === ':' && toks[x + 2]?.t === 'str') return strValue(toks[x + 2]);
    return null;
  }

  /* ── تابع اصلی فریم ── */
  const ctxish = p => /^(ctx|c|g|context|ctx2d|gfx)$/.test(String(p).replace(/=.*$/, '').trim());
  const timeish = p => /^(t|time|sec|secs|seconds|now|ms|timestamp|ts|frame|f|elapsed)$/.test(String(p).replace(/=.*$/, '').trim());
  let main = null, best = -1;
  for (const [name, f] of Object.entries(fns)) {
    const pi = MAIN_NAMES.indexOf(name);
    let sc = pi >= 0 ? 40 - pi : 0;
    if (f.params.some(ctxish)) sc += 15;
    if (f.params.some(timeish)) sc += 20;
    if (f.params.some(p => /^(W|width)\b/.test(p))) sc += 5;
    if (/^(synth|wav|audio|sound|play|stop|init|setup|resize|onResize|hex|rgb|ease|clamp|lerp|mix)/i.test(name)) sc -= 50;
    if (sc > best && sc >= 20) { best = sc; main = name; }
  }
  const hasRaf = used.has('requestAnimationFrame'), hasInterval = used.has('setInterval');
  let mode = 'static';
  if (main) mode = 'call';
  else if (hasRaf) mode = 'raf';
  else if (hasInterval) mode = 'interval';
  // اگر تابع اصلی فقط با rAF صدا زده می‌شود و پارامتر زمان ندارد ← rAF
  if (main && !fns[main].params.some(timeish) && hasRaf && !fns[main].params.length) mode = 'raf';
  const params = main ? fns[main].params : [];
  const adaptive = main ? params.some(p => /^(W|w|width)\b/.test(p)) && params.some(p => /^(H|h|height)\b/.test(p)) : false;
  if (!W0) {
    const wDef = params.map(p => /^(?:W|w|width)\s*=\s*(\d+)/.exec(p)).find(Boolean), hDef = params.map(p => /^(?:H|h|height)\s*=\s*(\d+)/.exec(p)).find(Boolean);
    if (wDef) W0 = +wDef[1]; if (hDef) H0 = +hDef[1];
  }
  if (!W0) { const m = /\.width\s*=\s*(\d{3,4})\b/.exec(code); if (m) W0 = +m[1]; }
  if (!H0) { const m = /\.height\s*=\s*(\d{3,4})\b/.exec(code); if (m) H0 = +m[1]; }
  if (!W0 || !H0) { const v = topVals.find(x => /^(W|WIDTH)$/.test(x.name)), h = topVals.find(x => /^(H|HEIGHT)$/.test(x.name)); if (v && h) { W0 = v.value; H0 = h.value; } }
  W0 = W0 || 1920; H0 = H0 || 1080;
  report.main = main; report.mode = mode;

  /* ── مقدارهای قابل‌تغییر ── */
  const tweaks = [], ids = new Set(), seenS = new Set();
  const RESERVED = new Set(['START', 'RUN', 'PROGRAM', 'ctx', 'e', '$V', '$T', '$rt']);
  const sceneKeys = new Set(holder ? holder.items.map(it => it.label) : []);
  const addTw = (lit, id0, label, group) => {
    if (seenS.has(lit.s)) return;
    if (lit.type === 'text' && (!/[\p{L}\p{N}]/u.test(lit.value) || lit.value.length > 60 || KEYWORDISH.test(lit.value) || (FONTISH.test(lit.value) && /,|px/.test(lit.value)))) return;
    if (lit.type === 'num' && !isFinite(lit.value)) return;
    let id = ident(id0); if (/^\d/.test(id)) id = '_' + id;
    if (lit.type === 'text' && (sceneKeys.has(lit.value) || declared.has(lit.value))) return;
    while (ids.has(id) || RESERVED.has(id)) id = id.replace(/(_\d+)?$/, m => '_' + ((+(m.slice(1)) || 1) + 1));
    ids.add(id); seenS.add(lit.s);
    tweaks.push({ id, label, group, type: lit.type, value: lit.value, def: lit.value, s: lit.s, e: lit.e, quote: lit.quote || "'" });
    edits.push({ s: lit.s, e: lit.e, text: `$T.${id}` });
  };
  // ۱) ثابت‌های سراسری و اعضای شیء‌ها
  for (const v of topVals) addTw(v, v.name, v.name, 'سراسری');
  for (const o of objs) {
    if (o.arr || (holder && o.name === holder.name)) continue;
    for (let a = o.s + 1; a < o.e; a++) {
      const q = toks[a];
      if ((q.t === 'id' || q.t === 'str') && toks[a + 1]?.v === ':' && (toks[a - 1].v === '{' || toks[a - 1].v === ',')) {
        const lit = isLitAt(a + 2);
        const key = q.t === 'str' ? strValue(q) : q.v;
        if (lit) addTw(lit, `${o.name}_${key}`, `${o.name}.${key}`, 'سراسری');
      }
      if (M[a] > a && toks[a].t === 'p' && a !== o.s) a = M[a];
    }
  }
  // ۲) داخل بدنه‌ها
  const scanBody = (s, e, group, prefix) => {
    const st = [];                                  // { kind: 'call'|'obj'|'arr'|'blk', callee, key }
    let lastKey = null;
    for (let a = s; a <= e && a < toks.length; a++) {
      const q = toks[a], prev = toks[a - 1];
      if (q.t === 'p' && (q.v === '(' || q.v === '[' || q.v === '{')) {
        let kind = 'blk', callee = null;
        if (q.v === '(') { kind = prev && (prev.t === 'id' || prev.v === ']' || prev.v === ')') && !(prev.t === 'kw') ? 'call' : 'paren'; if (prev?.t === 'id') callee = prev.v; }
        else if (q.v === '[') kind = prev && (prev.t === 'id' || prev.v === ']' || prev.v === ')' || prev.t === 'str') ? 'idx' : 'arr';
        else if (prev && (['(', ',', ':', '=', '[', '?', '||', '&&', '??', '...', '=>'].includes(prev.v) && !(prev.v === '=>' )) || prev?.v === 'return') kind = 'obj';
        const parent = st[st.length - 1];
        st.push({ kind, callee: callee || (kind === 'obj' || kind === 'arr' ? parent?.callee : null), strs: 0, key: kind === 'obj' && prev?.v === ':' ? lastKey : parent?.key });
        continue;
      }
      if (q.t === 'p' && (q.v === ')' || q.v === ']' || q.v === '}')) { st.pop(); continue; }
      const top2 = st[st.length - 1];
      if ((q.t === 'id' || q.t === 'str') && toks[a + 1]?.v === ':' && top2?.kind === 'obj' && (prev.v === '{' || prev.v === ',')) { lastKey = q.t === 'str' ? strValue(q) : q.v; continue; }
      const lit = (q.t === 'num' || q.t === 'str' || (q.v === '-' && toks[a + 1]?.t === 'num')) ? isLitAt(a) : null;
      if (!lit) continue;
      const before = prev?.v;
      if (before === '===' || before === '!==' || before === '==' || before === '!=' || toks[lit.last + 1]?.v === '===' || toks[lit.last + 1]?.v === '!==' || before === 'case') { a = lit.last; continue; }
      if (prev?.v === '[' && top2?.kind === 'idx') { a = lit.last; continue; }
      const callee = top2?.callee || null;
      let ok = false, label = '', id = '';
      if (lit.type === 'color') { ok = true; label = `رنگ${callee ? ' · ' + callee : ''}${before === ':' && lastKey ? ' · ' + lastKey : ''}`; id = `${prefix}_${before === ':' && lastKey ? lastKey : callee || 'color'}`; }
      else if (lit.type === 'text') {
        if ((top2?.kind === 'call' && callee && TEXT_CALLEE.test(callee) && (prev.v === '(' || prev.v === ',')) || (before === ':' && lastKey && TEXT_KEY.test(lastKey)) || (top2?.kind === 'arr' && (prev.v === '[' || prev.v === ',')) || (before === '=' && toks[a - 2]?.t === 'id' && /\s|[^\x00-\x7F]/.test(lit.value)))
        { ok = true; label = `متن${callee ? ' · ' + callee : ''}`; id = `${prefix}_${before === ':' && lastKey ? lastKey : 'text'}`; }
      } else if (lit.type === 'num' && before === ':' && top2?.kind === 'obj' && lastKey) {
        ok = true; label = `${callee || 'تنظیم'} · ${lastKey}`; id = `${prefix}_${callee || 'opt'}_${lastKey}`;
      }
      if (ok) addTw(lit, id, label, group);
      a = lit.last;
    }
  };
  if (holder) for (const it of holder.items) for (const f of it.fns) scanBody(f.bodyS, f.bodyE, it.key, it.label);
  const scanned = new Set(holder ? holder.items.flatMap(it => it.fns.map(f => f.bodyS)) : []);
  for (const [name, f] of Object.entries(fns)) {
    if (scanned.has(f.bodyS) || /^(synth|wav|audio|sound|hex|rgb)/i.test(name) || REEL_NAMES.includes(name)) continue;
    scanBody(f.bodyS, f.bodyE, 'سراسری', name);
  }
  if (tweaks.length > 160) report.warnings.push(`فقط ۱۶۰ مقدار اول قابل‌تغییر شد (از ${tweaks.length}).`);
  const keep = new Set(tweaks.slice(0, 160).map(t => t.s));
  const finalEdits = edits.filter(ed => !ed.text.startsWith('$T.') || keep.has(ed.s));
  const TW = tweaks.filter(t => keep.has(t.s));

  /* ── کد بازنویسی‌شده ── */
  finalEdits.sort((a, b) => b.s - a.s);
  let program = code;
  let lastS = Infinity;
  for (const ed of finalEdits) { if (ed.e > lastS) continue; program = program.slice(0, ed.s) + ed.text + program.slice(ed.e); lastS = ed.s; }
  const uses = REEL_NAMES.filter(n => used.has(n));
  if (holder) report.scenes = holder.items.map(it => ({ key: it.key, label: it.label }));
  const run = { mode, fn: main, params, W0, H0, adaptive, holder: holder?.name || null, holderKind: holder?.kind || null, declared: [...declared], uses, fps: 30 };
  return { program, tweaks: TW, run, report, holder, sceneLabels: holder ? Object.fromEntries(holder.items.map(it => [it.key, it.label])) : {} };
}

/* ── بدنهٔ لایهٔ کد برای یک تکه ── */
const q = v => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'` : String(+(+v).toFixed(5)));
/**
 * @param {string} program  کد بازنویسی‌شده
 * @param {object} o  { run, start, values: {id: v}, tweaks: {id: [value, label]}, title }
 */
export function importedBody(program, o = {}) {
  const tw = o.tweaks || {};
  const vals = { ...(o.values || {}) };
  for (const k of Object.keys(tw)) delete vals[k];
  const lines = [
    `// 🧩 کد وارد‌شده${o.title ? ' — ' + o.title : ''}`,
    '// کد اصلی همان‌طور که نوشته شده اجرا می‌شود؛ مقدارهای زیر را عوض کنید:',
    `const START = ${q(o.start || 0)}; // شروع این تکه در ویدیوی اصلی (ثانیه)`,
  ];
  for (const [id, [v, label]] of Object.entries(tw)) lines.push(`const ${id} = ${q(v)}; // ${String(label || id).replace(/\n/g, ' ')}`);
  lines.push(`const $V = ${JSON.stringify(vals)};`);
  lines.push(`const RUN = ${JSON.stringify(o.run || {})};`);
  lines.push(`const PROGRAM = ${JSON.stringify(program)};`);
  lines.push(`return e.runImported(ctx, e, PROGRAM, { ...$V${Object.keys(tw).map(k => ', ' + k).join('')} }, { ...RUN, start: START });`);
  return lines.join('\n');
}
