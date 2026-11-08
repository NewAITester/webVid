/** بازرس لایه: ترنسفورم، متن/شکل، افکت‌ها. */
import { EFFECTS, effectById, SHAPE_KINDS } from '../core/schema.js';
import { layerTransform, effectParamsAt, isFxOn } from '../core/evaluate.js';

const $ = s => document.querySelector(s);

function slider(label, min, max, step, value, oninput) {
  const wrap = document.createElement('div');
  wrap.className = 'ctl';
  wrap.innerHTML = `<label>${label}</label><input type="range" class="rng" min="${min}" max="${max}" step="${step}" value="${value}" dir="ltr"><span class="v">${value}</span>`;
  const input = wrap.querySelector('input'), v = wrap.querySelector('.v');
  input.oninput = () => { v.textContent = input.value; oninput(parseFloat(input.value)); };
  return wrap;
}

export function renderInspector(store) {
  const root = $('#inspector');
  const l = store.selection;
  root.innerHTML = '';
  if (!l) { root.innerHTML = '<div class="empty">لایه‌ای انتخاب نشده — روی تایم‌لاین یک لایه را بزن.</div>'; return; }
  const tr = layerTransform(l, store.time);
  const head = document.createElement('div');
  head.className = 'ihead';
  head.innerHTML = `<input class="txt" value="${l.name.replace(/"/g, '&quot;')}"><button class="ib" id="lyrDup" title="کپی">⧉</button><button class="ib" id="lyrDel" title="حذف">🗑</button>`;
  head.querySelector('.txt').onchange = e => store.updateLayer(l.id, { name: e.target.value });
  head.querySelector('#lyrDup').onclick = () => store.duplicateLayer(l.id);
  head.querySelector('#lyrDel').onclick = () => store.removeLayer(l.id);
  root.appendChild(head);

  const patch = patch => store.patchLayer(l.id, { transform: { ...l.transform, ...patch } });
  root.appendChild(slider('X', -720, 720, 1, Math.round(tr.x), v => patch({ x: v })));
  root.appendChild(slider('Y', -1280, 1280, 1, Math.round(tr.y), v => patch({ y: v })));
  root.appendChild(slider('مقیاس', 0.1, 3, 0.01, +tr.scaleX.toFixed(2), v => patch({ scaleX: v, scaleY: v })));
  root.appendChild(slider('چرخش', -180, 180, 1, Math.round(tr.rotation), v => patch({ rotation: v })));
  root.appendChild(slider('شفافیت', 0, 1, 0.01, +tr.opacity.toFixed(2), v => patch({ opacity: v })));

  if (l.type === 'text') {
    const t = l.text;
    const ta = document.createElement('textarea');
    ta.className = 'txt'; ta.rows = 2; ta.value = t.content;
    ta.onchange = () => store.updateLayer(l.id, { text: { ...t, content: ta.value } });
    root.appendChild(ta);
    root.appendChild(slider('اندازه', 12, 200, 1, t.size, v => store.patchLayer(l.id, { text: { ...t, size: v } })));
    const col = document.createElement('div');
    col.className = 'ctl';
    col.innerHTML = `<label>رنگ</label><input type="color" value="${t.color}">`;
    col.querySelector('input').oninput = e => store.patchLayer(l.id, { text: { ...t, color: e.target.value } });
    root.appendChild(col);
  }
  if (l.type === 'shape') {
    const s = l.shape;
    const row = document.createElement('div');
    row.className = 'chips';
    for (const k of SHAPE_KINDS) {
      const b = document.createElement('button');
      b.className = 'chip' + (s.kind === k ? ' on' : '');
      b.textContent = k;
      b.onclick = () => store.updateLayer(l.id, { shape: { ...s, kind: k } });
      row.appendChild(b);
    }
    root.appendChild(row);
    const col = document.createElement('div');
    col.className = 'ctl';
    col.innerHTML = `<label>رنگ</label><input type="color" value="${s.fill}">`;
    col.querySelector('input').oninput = e => store.patchLayer(l.id, { shape: { ...s, fill: e.target.value } });
    root.appendChild(col);
  }

  // افکت‌ها
  const tLocal = Math.max(0, store.time - l.start);
  const fxHead = document.createElement('div');
  fxHead.className = 'fxhead';
  fxHead.innerHTML = `<span class="fxcat">افکت‌ها</span><div class="spacer"></div>
    <button class="ib" id="fxCopy" title="کپی افکت‌ها">⧉</button>
    <button class="ib" id="fxPaste" title="چسباندن افکت‌ها">⎘</button>`;
  fxHead.querySelector('#fxCopy').onclick = () => store.copyEffects(l.id);
  fxHead.querySelector('#fxPaste').onclick = () => store.pasteEffects(l.id);
  root.appendChild(fxHead);
  const list = document.createElement('div');
  list.className = 'llist';
  (l.effects || []).forEach((fx, i) => {
    const def = effectById(fx.id); if (!def) return;
    const setFx = next => store.patchLayer(l.id, { effects: l.effects.map(f => f === fx ? next : f) });
    const row = document.createElement('div');
    row.className = 'lrow';
    row.style.opacity = isFxOn(fx) ? 1 : 0.45;
    row.innerHTML = `<button class="ib" title="فعال/غیرفعال">${isFxOn(fx) ? '◉' : '○'}</button>
      <span class="lnm">${def.name}</span>
      <button class="ib" title="بالا">↑</button><button class="ib" title="پایین">↓</button>
      <button class="ib" title="حذف">✕</button>`;
    const [tog, up, down, del] = row.querySelectorAll('button');
    tog.onclick = () => { setFx({ ...fx, enabled: !isFxOn(fx) }); };
    up.onclick = () => {
      if (i === 0) return;
      const next = [...l.effects]; [next[i - 1], next[i]] = [next[i], next[i - 1]];
      store.updateLayer(l.id, { effects: next });
    };
    down.onclick = () => {
      if (i === l.effects.length - 1) return;
      const next = [...l.effects]; [next[i + 1], next[i]] = [next[i], next[i + 1]];
      store.updateLayer(l.id, { effects: next });
    };
    del.onclick = () => store.updateLayer(l.id, { effects: l.effects.filter(f => f !== fx) });
    list.appendChild(row);
    const resolved = effectParamsAt(fx, tLocal);
    for (const [key, pd] of Object.entries(def.params)) {
      if (pd.type === 'n') {
        const kfs = fx.keyframes?.[key] || [];
        const wrap = document.createElement('div');
        wrap.className = 'ctl';
        const sl = slider(`${pd.label}${kfs.length ? ` ◆${kfs.length}` : ''}`, pd.min, pd.max,
          (pd.max - pd.min) > 20 ? 1 : 0.05, +(resolved[key] ?? pd.def).toFixed(2), v => {
            if (kfs.length) {
              // ویرایش نزدیک‌ترین کی‌فریم، یا افزودن یکی در زمان فعلی
              const list2 = [...kfs];
              let best = -1, bd = 1e9;
              list2.forEach((k, j) => { const d = Math.abs(k.t - tLocal); if (d < bd) { bd = d; best = j; } });
              if (best >= 0 && bd <= 0.3) list2[best] = { ...list2[best], v };
              else list2.push({ t: +tLocal.toFixed(2), v });
              list2.sort((a, b) => a.t - b.t);
              setFx({ ...fx, keyframes: { ...(fx.keyframes || {}), [key]: list2 } });
            } else {
              setFx({ ...fx, params: { ...fx.params, [key]: v } });
            }
          });
        wrap.appendChild(sl);
        const kfBtn = document.createElement('button');
        kfBtn.className = 'ib'; kfBtn.title = 'افزودن کی‌فریم در زمان فعلی';
        kfBtn.textContent = '◆';
        kfBtn.onclick = () => {
          const list2 = [...kfs];
          const near = list2.findIndex(k => Math.abs(k.t - tLocal) <= 0.3);
          if (near >= 0) list2[near] = { ...list2[near], v: resolved[key] ?? pd.def };
          else list2.push({ t: +tLocal.toFixed(2), v: resolved[key] ?? pd.def });
          list2.sort((a, b) => a.t - b.t);
          setFx({ ...fx, keyframes: { ...(fx.keyframes || {}), [key]: list2 } });
        };
        wrap.appendChild(kfBtn);
        if (kfs.length) {
          const clr = document.createElement('button');
          clr.className = 'ib'; clr.title = 'پاک کردن کی‌فریم‌ها';
          clr.textContent = '✕';
          clr.onclick = () => {
            const nk = { ...(fx.keyframes || {}) }; delete nk[key];
            setFx({ ...fx, keyframes: nk });
          };
          wrap.appendChild(clr);
        }
        list.appendChild(wrap);
      } else if (pd.type === 'c') {
        const col = document.createElement('div');
        col.className = 'ctl';
        col.innerHTML = `<label>${pd.label}</label><input type="color" value="${resolved[key] || pd.def}">`;
        col.querySelector('input').oninput = e => setFx({ ...fx, params: { ...fx.params, [key]: e.target.value } });
        list.appendChild(col);
      }
    }
  });
  root.appendChild(list);
  const add = document.createElement('select');
  add.className = 'txt';
  add.innerHTML = '<option value="">+ افزودن افکت…</option>' + EFFECTS.map(e => `<option value="${e.id}">${e.name} (${e.cat})</option>`).join('');
  add.onchange = () => {
    if (!add.value) return;
    const def = effectById(add.value);
    const params = {};
    for (const [k, pd] of Object.entries(def.params)) params[k] = pd.def;
    store.updateLayer(l.id, { effects: [...(l.effects || []), { id: def.id, params, enabled: true, keyframes: {} }] });
    store.noteFx(def.id);
    add.value = '';
  };
  root.appendChild(add);
}
