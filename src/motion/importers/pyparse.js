/**
 * خواندن پایتون (بدون اجرا): توکن‌ساز + تجزیه‌گر ← درخت نحو
 * زیرمجموعهٔ رایج پایتون ۳ که در اسکریپت‌های ساخت ویدیو (MoviePy، Manim، …) می‌آید.
 */
const OPS = ['**=', '//=', '>>=', '<<=', '...', '->', ':=', '==', '!=', '<=', '>=', '**', '//', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@=',
  '+', '-', '*', '/', '%', '@', '<', '>', '=', '.', ',', ':', ';', '(', ')', '[', ']', '{', '}', '~', '&', '|', '^'];
const KW = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));

export class PySyntaxError extends Error { constructor(msg, line) { super(msg); this.line = line; } }

export function pyTokenize(src) {
  const out = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const ind = [0];
  let depth = 0, cont = false;
  let li = 0;
  const push = (t, v, line, col) => out.push({ t, v, line, col });
  while (li < lines.length) {
    let line = lines[li]; let i = 0;
    const lno = li + 1;
    if (depth === 0 && !cont) {
      let w = 0;
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) { w += line[i] === '\t' ? 8 - (w % 8) : 1; i++; }
      if (i >= line.length || line[i] === '#') { li++; continue; }
      if (w > ind[ind.length - 1]) { ind.push(w); push('indent', null, lno, 0); }
      else while (w < ind[ind.length - 1]) { ind.pop(); push('dedent', null, lno, 0); }
    }
    cont = false;
    while (i < line.length) {
      const c = line[i];
      if (c === ' ' || c === '\t' || c === '\f') { i++; continue; }
      if (c === '#') break;
      if (c === '\\' && i === line.length - 1) { cont = true; i++; break; }
      // رشته‌ها (با پیشوند)
      const pm = /^([rRbBuUfF]{0,2})('''|"""|'|")/.exec(line.slice(i));
      if (pm && (pm[1] === '' || /^[rRbBuUfF]+$/.test(pm[1])) && !(pm[1] && /[\w]/.test(line[i - 1] || ''))) {
        const pre = pm[1].toLowerCase(), q = pm[2];
        let j = i + pm[0].length, buf = '', startLine = lno;
        const raw = pre.includes('r');
        for (;;) {
          if (j >= line.length) {
            if (q.length === 3) { buf += '\n'; li++; if (li >= lines.length) throw new PySyntaxError('رشتهٔ سه‌گیومه بسته نشد', startLine); line = lines[li]; j = 0; continue; }
            if (line[line.length - 1] === '\\') { li++; line = lines[li] || ''; j = 0; continue; }
            throw new PySyntaxError('رشته بسته نشد', lno);
          }
          if (line.startsWith(q, j)) { j += q.length; break; }
          const ch = line[j];
          if (ch === '\\' && !raw) {
            const n = line[j + 1];
            const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', 0: '\0', a: '\x07', b: '\b', f: '\f', v: '\v' };
            if (n === undefined) { j++; continue; }
            if (map[n] !== undefined) { buf += map[n]; j += 2; continue; }
            if (n === 'x') { buf += String.fromCharCode(parseInt(line.substr(j + 2, 2), 16)); j += 4; continue; }
            if (n === 'u') { buf += String.fromCharCode(parseInt(line.substr(j + 2, 4), 16)); j += 6; continue; }
            if (n === 'U') { buf += String.fromCodePoint(parseInt(line.substr(j + 2, 8), 16)); j += 10; continue; }
            if (n === 'N') { const e = line.indexOf('}', j); buf += '?'; j = e + 1; continue; }
            buf += ch + n; j += 2; continue;
          }
          if (ch === '\\' && raw) { buf += ch + (line[j + 1] ?? ''); j += 2; continue; }
          buf += ch; j++;
        }
        push(pre.includes('f') ? 'fstr' : 'str', buf, startLine, i);
        i = j; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(line[i + 1] || ''))) {
        const m = /^(0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][-+]?\d+)?)[jJ]?/.exec(line.slice(i));
        const s = m[1].replace(/_/g, '');
        const v = /^0[xX]/.test(s) ? parseInt(s, 16) : /^0[oO]/.test(s) ? parseInt(s.slice(2), 8) : /^0[bB]/.test(s) ? parseInt(s.slice(2), 2) : +s;
        push('num', v, lno, i); out[out.length - 1].isFloat = /[.eE]/.test(s) && !/^0[xX]/.test(s); i += m[0].length; continue;
      }
      if (/[A-Za-z_\u00C0-\uFFFF]/.test(c)) {
        let j = i; while (j < line.length && /[\w\u00C0-\uFFFF]/.test(line[j])) j++;
        const w = line.slice(i, j);
        push(KW.has(w) ? 'kw' : 'name', w, lno, i); i = j; continue;
      }
      const op = OPS.find(o => line.startsWith(o, i));
      if (!op) throw new PySyntaxError(`نویسهٔ ناشناخته «${c}»`, lno);
      if ('([{'.includes(op)) depth++;
      if (')]}'.includes(op)) depth = Math.max(0, depth - 1);
      push('op', op, lno, i); i += op.length;
    }
    if (depth === 0 && !cont) { const last = out[out.length - 1]; if (last && last.t !== 'nl' && last.t !== 'indent' && last.t !== 'dedent') push('nl', null, lno, line.length); }
    li++;
  }
  if (out.length && out[out.length - 1].t !== 'nl') push('nl', null, lines.length, 0);
  while (ind.length > 1) { ind.pop(); push('dedent', null, lines.length, 0); }
  push('eof', null, lines.length, 0);
  return out;
}

/* ── تجزیه‌گر ─────────────────────────────────────────────── */
export function pyParse(src) {
  const T = pyTokenize(src);
  let p = 0;
  const peek = (k = 0) => T[p + k];
  const is = (t, v) => { const k = T[p]; return k.t === t && (v === undefined || k.v === v); };
  const isOp = v => is('op', v), isKw = v => is('kw', v);
  const next = () => T[p++];
  const err = (m) => { throw new PySyntaxError(m, T[p]?.line); };
  const expect = (t, v) => { if (!is(t, v)) err(`انتظار «${v ?? t}» بود ولی «${T[p].v ?? T[p].t}» آمد`); return next(); };
  const N = (type, o, line) => ({ type, line: line ?? T[p]?.line, ...o });

  function file() { const body = []; while (!is('eof')) { if (is('nl')) { next(); continue; } body.push(...statement()); } return N('Module', { body }); }
  function block() {
    if (!is('nl')) return simpleStmts();
    expect('nl'); expect('indent');
    const body = [];
    while (!is('dedent') && !is('eof')) { if (is('nl')) { next(); continue; } body.push(...statement()); }
    if (is('dedent')) next();
    return body;
  }
  function statement() {
    const k = T[p];
    if (k.t === 'op' && k.v === '@') {
      const decos = [];
      while (isOp('@')) { next(); decos.push(expr()); expect('nl'); }
      const s = statement();
      s[0].decorators = decos; return s;
    }
    if (k.t === 'kw') {
      switch (k.v) {
        case 'if': return [ifStmt()];
        case 'while': { const line = next().line; const test = namedExpr(); expect('op', ':'); const body = block(); let orelse = []; if (isKw('else')) { next(); expect('op', ':'); orelse = block(); } return [N('While', { test, body, orelse }, line)]; }
        case 'for': return [forStmt()];
        case 'def': return [defStmt()];
        case 'class': return [classStmt()];
        case 'with': return [withStmt()];
        case 'try': return [tryStmt()];
        case 'async': { next(); return statement(); }
      }
    }
    return simpleStmts();
  }
  function simpleStmts() {
    const out = [simple()];
    while (isOp(';')) { next(); if (is('nl')) break; out.push(simple()); }
    if (!is('eof')) expect('nl');
    return out;
  }
  function simple() {
    const k = T[p], line = k.line;
    if (k.t === 'kw') {
      switch (k.v) {
        case 'pass': next(); return N('Pass', {}, line);
        case 'break': next(); return N('Break', {}, line);
        case 'continue': next(); return N('Continue', {}, line);
        case 'return': next(); return N('Return', { value: is('nl') || isOp(';') ? null : exprList() }, line);
        case 'raise': next(); { const e = is('nl') ? null : expr(); if (isKw('from')) { next(); expr(); } return N('Raise', { exc: e }, line); }
        case 'global': case 'nonlocal': { next(); const names = [expect('name').v]; while (isOp(',')) { next(); names.push(expect('name').v); } return N('Global', { names, nonlocal: k.v === 'nonlocal' }, line); }
        case 'del': next(); return N('Del', { targets: exprList() }, line);
        case 'assert': next(); { const test = expr(); if (isOp(',')) { next(); expr(); } return N('Assert', { test }, line); }
        case 'import': {
          next(); const names = [];
          do { if (isOp(',')) next(); let n = expect('name').v; while (isOp('.')) { next(); n += '.' + expect('name').v; } let as = null; if (isKw('as')) { next(); as = expect('name').v; } names.push([n, as]); } while (isOp(','));
          return N('Import', { names }, line);
        }
        case 'from': {
          next(); let mod = ''; while (isOp('.') || isOp('...')) mod += next().v;
          if (is('name')) { mod += next().v; while (isOp('.')) { next(); mod += '.' + expect('name').v; } }
          expect('kw', 'import');
          const names = [];
          if (isOp('*')) { next(); names.push(['*', null]); }
          else {
            const par = isOp('('); if (par) next();
            do { if (isOp(',')) next(); if (par && isOp(')')) break; const n = expect('name').v; let as = null; if (isKw('as')) { next(); as = expect('name').v; } names.push([n, as]); } while (isOp(','));
            if (par) expect('op', ')');
          }
          return N('ImportFrom', { module: mod, names }, line);
        }
      }
    }
    // عبارت / انتساب
    const first = starExprList();
    if (isOp('=')) {
      const targets = [first]; let value;
      while (isOp('=')) { next(); value = is('kw', 'yield') ? (next(), N('Yield', { value: exprList() })) : starExprList(); if (isOp('=')) targets.push(value); }
      return N('Assign', { targets, value }, line);
    }
    if (isOp(':')) { next(); const ann = expr(); let value = null; if (isOp('=')) { next(); value = exprList(); } return value ? N('Assign', { targets: [first], value }, line) : N('Pass', {}, line); }
    const aug = ['+=', '-=', '*=', '/=', '//=', '%=', '**=', '>>=', '<<=', '&=', '|=', '^=', '@='];
    if (is('op') && aug.includes(T[p].v)) { const op = next().v.slice(0, -1); const value = exprList(); return N('AugAssign', { target: first, op, value }, line); }
    return N('Expr', { value: first }, line);
  }
  function ifStmt() {
    const line = next().line; const test = namedExpr(); expect('op', ':'); const body = block();
    let orelse = [];
    if (isKw('elif')) orelse = [ifStmt()];
    else if (isKw('else')) { next(); expect('op', ':'); orelse = block(); }
    return N('If', { test, body, orelse }, line);
  }
  function forStmt() {
    const line = next().line;
    const target = targetList(); expect('kw', 'in'); const iter = exprList(); expect('op', ':');
    const body = block(); let orelse = []; if (isKw('else')) { next(); expect('op', ':'); orelse = block(); }
    return N('For', { target, iter, body, orelse }, line);
  }
  function targetList() {
    const items = [orExpr(true)];
    let tuple = false;
    while (isOp(',')) { next(); tuple = true; if (isKw('in') || isOp('=')) break; items.push(orExpr(true)); }
    return tuple ? N('Tuple', { elts: items }) : items[0];
  }
  function params(close) {
    const out = [];
    while (!isOp(close)) {
      if (isOp('/')) { next(); if (isOp(',')) next(); continue; }
      let star = 0;
      if (isOp('*')) { next(); star = 1; } else if (isOp('**')) { next(); star = 2; }
      if (star === 1 && (isOp(',') || isOp(close))) { if (isOp(',')) next(); continue; }
      const name = expect('name').v;
      if (isOp(':') && close === ')') { next(); expr(); }
      let def = null; if (isOp('=')) { next(); def = expr(); }
      out.push({ name, def, star });
      if (isOp(',')) next(); else break;
    }
    return out;
  }
  function defStmt() {
    const line = next().line; const name = expect('name').v; expect('op', '(');
    const ps = params(')'); expect('op', ')');
    if (isOp('->')) { next(); expr(); }
    expect('op', ':');
    return N('Def', { name, params: ps, body: block() }, line);
  }
  function classStmt() {
    const line = next().line; const name = expect('name').v; let bases = [];
    if (isOp('(')) { next(); const a = callArgs(); bases = a.args; expect('op', ')'); }
    expect('op', ':');
    return N('Class', { name, bases, body: block() }, line);
  }
  function withStmt() {
    const line = next().line; const items = [];
    const par = isOp('(') && false;
    do { if (isOp(',')) next(); const e = expr(); let as = null; if (isKw('as')) { next(); as = orExpr(true); } items.push({ e, as }); } while (isOp(','));
    if (par) expect('op', ')');
    expect('op', ':');
    return N('With', { items, body: block() }, line);
  }
  function tryStmt() {
    const line = next().line; expect('op', ':'); const body = block();
    const handlers = []; let orelse = [], fin = [];
    while (isKw('except')) {
      next(); let typ = null, name = null;
      if (isOp('*')) next();
      if (!isOp(':')) { typ = expr(); if (isKw('as')) { next(); name = expect('name').v; } else if (isOp(',')) { next(); name = expect('name').v; } }
      expect('op', ':'); handlers.push({ typ, name, body: block() });
    }
    if (isKw('else')) { next(); expect('op', ':'); orelse = block(); }
    if (isKw('finally')) { next(); expect('op', ':'); fin = block(); }
    return N('Try', { body, handlers, orelse, fin }, line);
  }
  /* عبارت‌ها */
  function exprList() {
    const first = isOp('*') ? starred() : expr();
    if (!isOp(',')) return first;
    const elts = [first];
    while (isOp(',')) { next(); if (endOfList()) break; elts.push(isOp('*') ? starred() : expr()); }
    return N('Tuple', { elts });
  }
  const starExprList = exprList;
  function endOfList() { const k = T[p]; return k.t === 'nl' || k.t === 'eof' || (k.t === 'op' && [')', ']', '}', '=', ':', ';'].includes(k.v)) || (k.t === 'op' && k.v.endsWith('=') && k.v.length >= 2 && !['==', '<=', '>=', '!='].includes(k.v)); }
  function starred() { next(); return N('Starred', { value: orExpr() }); }
  function namedExpr() { const e = expr(); if (isOp(':=')) { next(); return N('Walrus', { target: e, value: expr() }); } return e; }
  function expr() {
    if (isKw('lambda')) {
      next(); const ps = params(':'); expect('op', ':');
      return N('Lambda', { params: ps, body: expr() });
    }
    if (isKw('yield')) { next(); return N('Yield', { value: is('nl') || isOp(')') ? null : exprList() }); }
    if (isKw('await')) { next(); return expr(); }
    const e = orExpr();
    if (isKw('if')) {
      const save = p; next();
      const test = orExpr();
      if (isKw('else')) { next(); return N('IfExp', { test, body: e, orelse: expr() }); }
      p = save;
    }
    return e;
  }
  function orExpr(noIn) { let l = andExpr(noIn); while (isKw('or')) { next(); l = N('BoolOp', { op: 'or', l, r: andExpr(noIn) }); } return l; }
  function andExpr(noIn) { let l = notExpr(noIn); while (isKw('and')) { next(); l = N('BoolOp', { op: 'and', l, r: notExpr(noIn) }); } return l; }
  function notExpr(noIn) { if (isKw('not')) { next(); return N('Unary', { op: 'not', v: notExpr(noIn) }); } return compare(noIn); }
  function compare(noIn) {
    const first = bitor(); const ops = [], rs = [];
    for (;;) {
      let op = null;
      if (is('op') && ['<', '>', '==', '>=', '<=', '!='].includes(T[p].v)) op = next().v;
      else if (isKw('in') && !noIn) { next(); op = 'in'; }
      else if (isKw('not') && T[p + 1].t === 'kw' && T[p + 1].v === 'in') { next(); next(); op = 'not in'; }
      else if (isKw('is')) { next(); if (isKw('not')) { next(); op = 'is not'; } else op = 'is'; }
      if (!op) break;
      ops.push(op); rs.push(bitor());
    }
    return ops.length ? N('Compare', { l: first, ops, rs }) : first;
  }
  const bin = (sub, opsList) => () => { let l = sub(); while (is('op') && opsList.includes(T[p].v)) { const op = next().v; l = N('Bin', { op, l, r: sub() }); } return l; };
  const power = () => { const b = awaitPrimary(); if (isOp('**')) { next(); return N('Bin', { op: '**', l: b, r: unary() }); } return b; };
  function unary() { if (is('op') && ['-', '+', '~'].includes(T[p].v)) { const op = next().v; return N('Unary', { op, v: unary() }); } return power(); }
  const term = bin(unary, ['*', '/', '//', '%', '@']);
  const arith = bin(term, ['+', '-']);
  const shift = bin(arith, ['<<', '>>']);
  const band = bin(shift, ['&']);
  const bxor = bin(band, ['^']);
  const bitor = bin(bxor, ['|']);
  function awaitPrimary() { return primary(); }
  function callArgs() {
    const args = [], kw = [];
    while (!isOp(')')) {
      if (isOp('*')) { next(); args.push(N('Starred', { value: expr() })); }
      else if (isOp('**')) { next(); kw.push({ name: null, value: expr() }); }
      else if (is('name') && T[p + 1].t === 'op' && T[p + 1].v === '=') { const name = next().v; next(); kw.push({ name, value: expr() }); }
      else {
        const e = namedExpr();
        if (isKw('for') || (isKw('async'))) { args.push(comprehension('GenExp', e)); }
        else args.push(e);
      }
      if (isOp(',')) next(); else break;
    }
    return { args, kw };
  }
  function primary() {
    let e = atom();
    for (;;) {
      if (isOp('.')) { next(); const name = is('kw') ? next().v : expect('name').v; e = N('Attr', { obj: e, name }); }
      else if (isOp('(')) { const line = next().line; const a = callArgs(); expect('op', ')'); e = N('Call', { fn: e, args: a.args, kw: a.kw }, line); }
      else if (isOp('[')) { next(); const idx = subscript(); expect('op', ']'); e = N('Sub', { obj: e, idx }); }
      else break;
    }
    return e;
  }
  function subscript() {
    const one = () => {
      let a = null, b = null, c = null;
      if (!isOp(':')) { a = expr(); if (!isOp(':')) return a; }
      next(); if (!isOp(']') && !isOp(':') && !isOp(',')) b = expr();
      if (isOp(':')) { next(); if (!isOp(']') && !isOp(',')) c = expr(); }
      return N('Slice', { a, b, c });
    };
    const first = one();
    if (!isOp(',')) return first;
    const elts = [first]; while (isOp(',')) { next(); if (isOp(']')) break; elts.push(one()); }
    return N('Tuple', { elts });
  }
  function comprehension(kind, elt, val) {
    const gens = [];
    while (isKw('for') || isKw('async')) {
      if (isKw('async')) next();
      next(); const target = targetList(); expect('kw', 'in'); const iter = orExpr(); const ifs = [];
      while (isKw('if')) { next(); ifs.push(orExprNoCond()); }
      gens.push({ target, iter, ifs });
    }
    return N(kind, { elt, val, gens });
  }
  function orExprNoCond() { return orExpr(); }
  function atom() {
    const k = T[p];
    if (k.t === 'num') { next(); return N('Num', { v: k.v, isFloat: k.isFloat }); }
    if (k.t === 'str' || k.t === 'fstr') {
      const parts = [];
      while (is('str') || is('fstr')) { const s = next(); parts.push(s.t === 'fstr' ? fstring(s.v, s.line) : N('Str', { v: s.v })); }
      if (parts.length === 1) return parts[0];
      return N('JoinedStr', { parts: parts.flatMap(x => (x.type === 'JoinedStr' ? x.parts : [x])) });
    }
    if (k.t === 'name') { next(); return N('Name', { id: k.v }); }
    if (k.t === 'kw') {
      if (k.v === 'True' || k.v === 'False') { next(); return N('Const', { v: k.v === 'True' }); }
      if (k.v === 'None') { next(); return N('Const', { v: null }); }
      if (k.v === 'lambda' || k.v === 'not' || k.v === 'await' || k.v === 'yield') return expr();
    }
    if (k.t === 'op') {
      if (k.v === '...') { next(); return N('Const', { v: null }); }
      if (k.v === '(') {
        next();
        if (isOp(')')) { next(); return N('Tuple', { elts: [] }); }
        const first = isOp('*') ? starred() : namedExpr();
        if (isKw('for')) { const g = comprehension('GenExp', first); expect('op', ')'); return g; }
        if (isOp(')')) { next(); return N('Paren', { v: first }); }
        const elts = [first];
        while (isOp(',')) { next(); if (isOp(')')) break; elts.push(isOp('*') ? starred() : namedExpr()); }
        expect('op', ')');
        return N('Tuple', { elts });
      }
      if (k.v === '[') {
        next();
        if (isOp(']')) { next(); return N('List', { elts: [] }); }
        const first = isOp('*') ? starred() : namedExpr();
        if (isKw('for')) { const g = comprehension('ListComp', first); expect('op', ']'); return g; }
        const elts = [first];
        while (isOp(',')) { next(); if (isOp(']')) break; elts.push(isOp('*') ? starred() : namedExpr()); }
        expect('op', ']');
        return N('List', { elts });
      }
      if (k.v === '{') {
        next();
        if (isOp('}')) { next(); return N('Dict', { keys: [], vals: [] }); }
        if (isOp('**')) { next(); const v = expr(); const keys = [null], vals = [v]; while (isOp(',')) { next(); if (isOp('}')) break; if (isOp('**')) { next(); keys.push(null); vals.push(expr()); } else { keys.push(expr()); expect('op', ':'); vals.push(expr()); } } expect('op', '}'); return N('Dict', { keys, vals }); }
        const first = isOp('*') ? starred() : expr();
        if (isOp(':')) {
          next(); const v = expr();
          if (isKw('for')) { const g = comprehension('DictComp', first, v); expect('op', '}'); return g; }
          const keys = [first], vals = [v];
          while (isOp(',')) { next(); if (isOp('}')) break; if (isOp('**')) { next(); keys.push(null); vals.push(expr()); continue; } keys.push(expr()); expect('op', ':'); vals.push(expr()); }
          expect('op', '}');
          return N('Dict', { keys, vals });
        }
        if (isKw('for')) { const g = comprehension('SetComp', first); expect('op', '}'); return g; }
        const elts = [first];
        while (isOp(',')) { next(); if (isOp('}')) break; elts.push(expr()); }
        expect('op', '}');
        return N('Set', { elts });
      }
    }
    err(`عبارت نامعتبر نزدیک «${k.v ?? k.t}»`);
  }
  function fstring(s, line) {
    const parts = []; let i = 0, buf = '';
    while (i < s.length) {
      const c = s[i];
      if (c === '{' && s[i + 1] === '{') { buf += '{'; i += 2; continue; }
      if (c === '}' && s[i + 1] === '}') { buf += '}'; i += 2; continue; }
      if (c === '{') {
        if (buf) parts.push(N('Str', { v: buf }, line)), buf = '';
        let d = 1, j = i + 1, q = null;
        while (j < s.length && d > 0) {
          const ch = s[j];
          if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--;
          if (d > 0) j++;
        }
        let inner = s.slice(i + 1, j), spec = null, conv = null;
        // جداکردن :spec و !r در سطح صفر
        let dd = 0, qq = null, cut = -1;
        for (let x = 0; x < inner.length; x++) {
          const ch = inner[x];
          if (qq) { if (ch === qq) qq = null; continue; }
          if (ch === '"' || ch === "'") qq = ch; else if ('([{'.includes(ch)) dd++; else if (')]}'.includes(ch)) dd--;
          else if (dd === 0 && ch === '!' && inner[x + 1] !== '=') { conv = inner[x + 1]; if (cut < 0) cut = x; }
          else if (dd === 0 && ch === ':' ) { spec = inner.slice(x + 1); if (cut < 0) cut = x; break; }
        }
        if (cut >= 0) inner = inner.slice(0, cut);
        let debug = false;
        if (/=\s*$/.test(inner) && !/[=!<>]=\s*$/.test(inner)) { debug = true; inner = inner.replace(/=\s*$/, ''); }
        const sub = pyParse(`(${inner})\n`).body[0].value;
        if (debug) parts.push(N('Str', { v: inner + '=' }, line));
        parts.push(N('FVal', { v: sub, spec: spec != null ? fstring(spec, line) : null, conv }, line));
        i = j + 1; continue;
      }
      buf += c; i++;
    }
    if (buf) parts.push(N('Str', { v: buf }, line));
    return N('JoinedStr', { parts }, line);
  }
  return file();
}
