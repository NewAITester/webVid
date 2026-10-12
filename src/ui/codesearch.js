import { h, faN } from './dom.js';

/**
 * «🔍 جستجو در کد» برای هر کادر کد (textarea)
 * ─────────────────────────────────────────────────────────────
 * نوار جستجو بالای کادر: پیدا کردن (با/بی حساسیت به حروف بزرگ، کل کلمه، الگوی regex)،
 * رفتن به بعدی/قبلی و «انتخاب» همان تکه در کد تا مستقیم ویرایشش کنید،
 * فهرست همهٔ نتیجه‌ها با شمارهٔ خط، و جایگزینی (یکی / همه).
 * میان‌بُرها داخل کادر کد: Ctrl+F جستجو · F3 / Enter (داخل جستجو) بعدی · Shift+F3 قبلی · Esc بستن.
 */
const MAX = 2000;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function attachCodeSearch(ta, { open = false } = {}) {
  if (!ta || ta._codeSearch) return ta?._codeSearch || null;
  const st = { cs: false, word: false, re: false, hits: [], cur: -1, err: '' };
  const q = h('input', { type: 'search', class: 'txt cs-q', dir: 'auto', placeholder: 'جستجو در کد… (مثلاً یک نوشته، رنگ ‎#FF0055‎ یا نام تابع)' });
  const rep = h('input', { type: 'text', class: 'txt cs-r', dir: 'auto', placeholder: 'جایگزین با…' });
  const cnt = h('span', { class: 'cs-n' });
  const list = h('div', { class: 'cs-list' });
  const tog = (label, title, key) => {
    const b = h('button', { class: 'cs-t', title, onclick: () => { st[key] = !st[key]; b.classList.toggle('on', st[key]); find(true); } }, label);
    return b;
  };
  const repRow = h('div', { class: 'cs-row hidden' }, rep,
    h('button', { class: 'btn sm ghost', title: 'همین نتیجهٔ انتخاب‌شده را عوض کن و برو بعدی', onclick: () => replaceOne() }, 'جایگزینی'),
    h('button', { class: 'btn sm ghost', title: 'همهٔ نتیجه‌ها را یک‌جا عوض کن', onclick: () => replaceAll() }, 'همه'));
  const bar = h('div', { class: 'codesearch' + (open ? '' : ' closed') },
    h('div', { class: 'cs-row' },
      h('button', { class: 'cs-t cs-open', title: 'جستجو در کد (Ctrl+F)', onclick: () => toggle() }, '🔍'),
      q, cnt,
      h('button', { class: 'cs-t', title: 'قبلی (Shift+F3)', onclick: () => step(-1) }, '‹'),
      h('button', { class: 'cs-t', title: 'بعدی (F3)', onclick: () => step(1) }, '›'),
      tog('Aa', 'حساس به حروف بزرگ و کوچک', 'cs'), tog('«ab»', 'فقط کل کلمه', 'word'), tog('.*', 'الگوی regex', 're'),
      h('button', { class: 'cs-t', title: 'جایگزینی', onclick: () => repRow.classList.toggle('hidden') }, '⇄')),
    repRow, list);

  function rx() {
    const s = q.value;
    if (!s) return null;
    try {
      st.err = '';
      let src = st.re ? s : esc(s);
      if (st.word) src = `(?<![\\w$\\u0600-\\u06FF])(?:${src})(?![\\w$\\u0600-\\u06FF])`;
      return new RegExp(src, 'g' + (st.cs ? '' : 'i') + 'u');
    } catch (e) { st.err = 'الگوی نادرست'; return null; }
  }
  function find(keepNear) {
    const r = rx(), text = ta.value;
    st.hits = [];
    if (r) for (let m; (m = r.exec(text)) && st.hits.length < MAX;) { if (!m[0].length) { r.lastIndex++; continue; } st.hits.push([m.index, m.index + m[0].length]); }
    const at = ta.selectionStart || 0;
    st.cur = st.hits.length ? Math.max(0, st.hits.findIndex(([s]) => s >= (keepNear ? at : 0))) : -1;
    if (st.cur < 0 && st.hits.length) st.cur = 0;
    paint();
  }
  const lineOf = i => { let n = 1; const t = ta.value; for (let k = t.indexOf('\n'); k >= 0 && k < i; k = t.indexOf('\n', k + 1)) n++; return n; };
  function paint() {
    cnt.textContent = st.err || (!q.value ? '' : st.hits.length ? `${faN(st.cur + 1)} از ${faN(st.hits.length)}${st.hits.length >= MAX ? '+' : ''}` : 'پیدا نشد');
    cnt.classList.toggle('bad', !!q.value && !st.hits.length);
    list.innerHTML = '';
    if (!q.value || !st.hits.length) return;
    const t = ta.value;
    let n = 1, k = 0;
    for (let j = 0; j < Math.min(st.hits.length, 60); j++) {
      const [s, e] = st.hits[j];
      for (; ;) { const nl = t.indexOf('\n', k); if (nl < 0 || nl >= s) break; n++; k = nl + 1; }
      const ls = t.lastIndexOf('\n', s - 1) + 1, le = (t.indexOf('\n', s) + 1 || t.length + 1) - 1;
      const a = Math.max(ls, s - 40), b = Math.min(le, e + 60);
      list.append(h('div', { class: 'cs-hit' + (j === st.cur ? ' on' : ''), onclick: () => { st.cur = j; select(); } },
        h('b', {}, faN(n)), h('span', { dir: 'ltr' }, (a > ls ? '…' : '') + t.slice(a, s), h('mark', {}, t.slice(s, e)), t.slice(e, b) + (b < le ? '…' : ''))));
    }
    if (st.hits.length > 60) list.append(h('div', { class: 'cs-more' }, `و ${faN(st.hits.length - 60)} نتیجهٔ دیگر — با ‹ › بروید`));
  }
  /** انتخاب نتیجهٔ فعلی داخل کد (تا همان‌جا ویرایش شود) */
  function select(focus = true) {
    const hit = st.hits[st.cur];
    if (!hit) return;
    const [s, e] = hit;
    if (focus) ta.focus({ preventScroll: true });
    ta.setSelectionRange(s, e);
    const cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6 || 18;
    const line = lineOf(s), col = s - (ta.value.lastIndexOf('\n', s - 1) + 1);
    ta.scrollTop = Math.max(0, (line - 1) * lh - ta.clientHeight / 3);
    const cw = (parseFloat(cs.fontSize) || 12) * 0.6;
    ta.scrollLeft = col * cw > ta.clientWidth * 0.7 ? col * cw - ta.clientWidth / 3 : 0;
    paint();
  }
  function step(d) {
    if (!st.hits.length) find(true);
    if (!st.hits.length) return;
    st.cur = (st.cur + d + st.hits.length) % st.hits.length;
    select();
  }
  function commit(v) { ta.value = v; ta.dispatchEvent(new Event('input', { bubbles: true })); }
  function replaceOne() {
    const hit = st.hits[st.cur];
    if (!hit || ta.readOnly) return;
    const [s, e] = hit, r = rx();
    const piece = ta.value.slice(s, e);
    const by = st.re && r ? piece.replace(new RegExp(r.source, r.flags.replace('g', '')), rep.value) : rep.value;
    commit(ta.value.slice(0, s) + by + ta.value.slice(e));
    ta.setSelectionRange(s + by.length, s + by.length);
    find(true); if (st.hits.length) select();
  }
  function replaceAll() {
    const r = rx();
    if (!r || ta.readOnly || !st.hits.length) return;
    const n = st.hits.length;
    commit(ta.value.replace(r, st.re ? rep.value : () => rep.value));
    find(false);
    cnt.textContent = `${faN(n)} مورد عوض شد`;
  }
  function toggle(force) {
    const show = force ?? bar.classList.contains('closed');
    bar.classList.toggle('closed', !show);
    if (show) { q.focus(); q.select(); if (q.value) find(true); }
  }
  let t = 0;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { find(true); if (st.hits.length) select(false); }, 120); });
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { e.preventDefault(); toggle(false); ta.focus(); }
  });
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
      if (sel && !sel.includes('\n') && sel.length < 80) q.value = sel;
      toggle(true);
    } else if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G'))) { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape' && !bar.classList.contains('closed')) toggle(false);
  });
  ta.addEventListener('input', () => { if (q.value && !bar.classList.contains('closed')) { clearTimeout(t); t = setTimeout(() => find(true), 250); } });
  ta.before(bar);
  ta._codeSearch = { bar, open: () => toggle(true), find: s => { q.value = s; toggle(true); find(false); if (st.hits.length) select(); } };
  return ta._codeSearch;
}
