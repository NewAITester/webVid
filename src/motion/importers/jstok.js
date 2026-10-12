/**
 * توکن‌ساز کوچک جاوااسکریپت — فقط برای «خواندن» کد (نه اجرا)
 * خروجی: [{ t: 'id'|'num'|'str'|'tpl'|'re'|'p'|'kw', v, s, e, nl }]
 *   s/e جای شروع/پایان در متن، nl یعنی قبل از این توکن خط شکسته شده.
 */
const KW = new Set('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of static get set'.split(' '));
const PUNC = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const ID0 = /[A-Za-z_$\u00C0-\uFFFF]/, ID1 = /[\w$\u00C0-\uFFFF]/;

export function tokenize(src) {
  const out = [];
  let i = 0, nl = false;
  const n = src.length;
  const tplStack = [];                         // عمق آکولاد داخل ${ } قالب‌ها
  const regexOK = () => {
    const p = out[out.length - 1];
    if (!p) return true;
    if (p.t === 'num' || p.t === 'str' || p.t === 'tpl' || p.t === 're') return false;
    if (p.t === 'id') return false;
    if (p.t === 'kw') return !['this', 'super'].includes(p.v);
    return !(p.v === ')' || p.v === ']' || p.v === '}');
  };
  const push = (t, v, s) => { out.push({ t, v, s, e: i, nl }); nl = false; };
  const readTpl = s => {                       // از ` یا } تا ` یا ${
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; push('tpl', src.slice(s, i), s); return; }
      if (c === '$' && src[i + 1] === '{') { i += 2; push('tpl', src.slice(s, i), s); tplStack.push(0); return; }
      i++;
    }
    push('tpl', src.slice(s, i), s);
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { nl = true; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\uFEFF' || c === '\u00A0') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); const end = j < 0 ? n : j + 2; if (src.slice(i, end).includes('\n')) nl = true; i = end; continue; }
    const s = i;
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i++; push('str', src.slice(s, i), s); continue;
    }
    if (c === '`') { i++; readTpl(s); continue; }
    if (c === '}' && tplStack.length && tplStack[tplStack.length - 1] === 0) { tplStack.pop(); i++; readTpl(s); continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      if (c === '0' && /[xXbBoO]/.test(src[i + 1])) { i += 2; while (i < n && /[0-9a-fA-F_]/.test(src[i])) i++; }
      else {
        while (i < n && /[0-9_]/.test(src[i])) i++;
        if (src[i] === '.') { i++; while (i < n && /[0-9_]/.test(src[i])) i++; }
        if (/[eE]/.test(src[i]) && /[-+0-9]/.test(src[i + 1])) { i += 2; while (i < n && /[0-9]/.test(src[i])) i++; }
      }
      if (src[i] === 'n') i++;
      push('num', src.slice(s, i), s); continue;
    }
    if (ID0.test(c) || c === '\\') {
      while (i < n && ID1.test(src[i])) i++;
      if (i === s) i++;
      const v = src.slice(s, i);
      push(KW.has(v) ? 'kw' : 'id', v, s); continue;
    }
    if (c === '#' && ID0.test(src[i + 1] || '')) { i++; while (i < n && ID1.test(src[i])) i++; push('id', src.slice(s, i), s); continue; }
    if (c === '/' && regexOK()) {
      i++; let cls = false;
      while (i < n && src[i] !== '\n') {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') cls = true; else if (d === ']') cls = false;
        else if (d === '/' && !cls) break;
        i++;
      }
      i++; while (i < n && /[a-z]/.test(src[i])) i++;
      push('re', src.slice(s, i), s); continue;
    }
    const p = PUNC.find(q => src.startsWith(q, i)) || c;
    i += p.length;
    if (tplStack.length) { if (p === '{') tplStack[tplStack.length - 1]++; else if (p === '}') tplStack[tplStack.length - 1]--; }
    push('p', p, s);
  }
  return out;
}

/** مقدار یک توکن رشته (بدون گیومه، با پردازش \n و …) */
export function strValue(tok) {
  const raw = tok.v.slice(1, -1);
  try { return JSON.parse('"' + raw.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"').replace(/\\([^nrtbfvu0x"\\/\n])/g, '$1') + '"'); } catch { return raw; }
}

/** جفت هر پرانتز/کروشه/آکولاد ← اندیس جفتش */
export function matchBrackets(toks) {
  const m = new Int32Array(toks.length).fill(-1), st = [];
  const open = { '(': ')', '[': ']', '{': '}' };
  toks.forEach((k, i) => {
    if (k.t === 'tpl') {                         // `…${  باز می‌کند،  }…`  می‌بندد
      const opens = k.v.endsWith('${'), closes = k.v[0] === '}';
      if (closes && st.length) { const j = st.pop(); m[j] = i; m[i] = j; }
      if (opens) st.push(i);
      return;
    }
    if (k.t !== 'p') return;
    if (open[k.v]) st.push(i);
    else if (k.v === ')' || k.v === ']' || k.v === '}') { if (st.length) { const j = st.pop(); m[j] = i; m[i] = j; } }
  });
  return m;
}
