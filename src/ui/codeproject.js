import { h, faN } from './dom.js';
import { importCard } from './importpanel.js';
import { runScript, scriptToLayers } from '../motion/scenescript.js';

/**
 * پنجرهٔ «🧩 پروژه از کد ویدیو» (صفحهٔ پروژه‌ها)
 * ─────────────────────────────────────────────────────────────
 * کد ویدیو (JS/HTML بوم، پایتون MoviePy/Manim، موشن‌اسکریپت) را می‌گیرد،
 * مثل پنجرهٔ موشن‌اسکریپت تحلیلش می‌کند و قبل از ساخت می‌پرسد:
 *   «فقط اجزای خود کد» یا «کد + چیزهایی از خود برنامه».
 * بعد لایه‌ها را می‌سازد و onCreate({ name, artist, tg, aspect, layers, length, script, info }) را صدا می‌زند.
 * نسبت تصویر خودکار نزدیک‌ترین نسبت به قاب اصلی کد انتخاب می‌شود.
 */
const DRAFT = 'ls.motionScript';
const base = n => String(n || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');

export function nearestAspect(aspects, W0, H0) {
  if (!W0 || !H0) return null;
  const r = W0 / H0;
  return aspects.reduce((b, a) => (Math.abs(Math.log(a.w / a.h / r)) < Math.abs(Math.log(b.w / b.h / r)) ? a : b), aspects[0]).id;
}

/**
 * @param {object} o { files:[{name,text}], aspects:[{id,w,h,label}], defaults:{artist,tg}, onCreate(res):Promise, host }
 */
export function openCodeProjectSheet({ files, aspects, defaults = {}, onCreate, host = null }) {
  document.querySelector('.cpsheet')?.remove();
  let aspect = aspects[0].id, aspectTouched = false, nameTouched = false, lastR = null;
  const inp = (ph, v, ltr) => h('input', { type: 'text', class: 'txt' + (ltr ? ' ltr' : ''), placeholder: ph, value: v || '' });
  const nameI = inp('نام پروژه', base(files[0]?.name));
  const artistI = inp('نام شما', defaults.artist);
  const tgI = inp('Telegram: @channel', defaults.tg, true);
  nameI.addEventListener('input', () => { nameTouched = true; });
  const aspBox = h('div', { class: 'aspects' }), autoNote = h('div', { class: 'cpauto' });
  const msg = h('div', { class: 'msg' });
  const say = (cls, m) => { msg.className = 'msg ' + (cls || ''); msg.textContent = m; };

  function paintAspects() {
    aspBox.innerHTML = '';
    for (const a of aspects) {
      const bw = a.w >= a.h ? 26 : Math.round(26 * a.w / a.h), bh = a.w >= a.h ? Math.round(26 * a.h / a.w) : 26;
      aspBox.append(h('div', { class: 'asp' + (a.id === aspect ? ' on' : ''), onclick: () => { aspect = a.id; aspectTouched = true; paintAspects(); } },
        h('div', { class: 'box', style: { width: bw + 'px', height: bh + 'px' } }),
        h('div', { class: 't' }, h('b', {}, a.id), h('span', {}, a.label?.split('—')[1]?.trim() || ''))));
    }
  }
  paintAspects();

  const onResult = R => {
    lastR = R;
    const W0 = R.model?.W0 || R.canvas?.run?.W0, H0 = R.model?.H0 || R.canvas?.run?.H0;
    const near = nearestAspect(aspects, W0, H0);
    if (near && !aspectTouched) { aspect = near; paintAspects(); }
    autoNote.textContent = W0 && H0 ? `قاب اصلی کد ${faN(W0)}×${faN(H0)} است${near ? ` — نزدیک‌ترین نسبت: ${near}` : ''}. اجزا با قاب پروژه مقیاس می‌گیرند.` : '';
    const t = R.model?.title;
    if (t && !nameTouched && !/^(scene|video|main|index|untitled)$/i.test(t)) nameI.value = t;
  };

  async function create(script, info) {
    const A = aspects.find(a => a.id === aspect) || aspects[0];
    const R = info?.R || lastR;
    say('', 'در حال ساختن لایه‌ها…');
    try {
      const res = runScript(script, { W: A.w, H: A.h, bpm: R?.bpm || R?.model?.tempo || 120 });
      if (!res.ok) throw new Error(`خطای اسکریپت (خط ${faN(res.line || '?')}): ${res.error}`);
      const { layers, warnings } = scriptToLayers(res, { W: A.w, H: A.h });
      if (!layers.length) throw new Error('هیچ لایه‌ای از این کد ساخته نشد.');
      try { localStorage.setItem(DRAFT, script); } catch { /* */ }
      const name = (nameI.value || base(files[0]?.name) || 'پروژهٔ کدی').trim();
      await onCreate({
        name, title: name, artist: artistI.value.trim(), tg: tgI.value.trim(), aspect: A.id,
        layers, length: Math.max(1, Math.ceil(res.length || R?.duration || 10)), script,
        extras: info?.extras || { mode: 'pure' }, warnings: [...(res.warnings || []), ...(warnings || [])],
        scenes: res.scenes?.length || 0, kind: R?.kind,
      });
      sheet.remove();
    } catch (e) { console.warn(e); say('err', '✗ ' + (e.message || e)); }
  }

  const card = importCard({
    host, files, say, project: true, onResult,
    meta: () => ({ title: nameI.value.trim(), artist: artistI.value.trim(), tg: tgI.value.trim() }),
    onScript: (script, build, info) => { if (build) create(script, info); },
  });
  card.querySelector('.ihd .icon')?.remove();     // بستن کارت = بستن پنجره (دکمهٔ بالا)

  const sheet = h('div', { class: 'sheet cpsheet', onclick: e => { if (e.target === sheet) sheet.remove(); } },
    h('div', { class: 'sheetbox' },
      h('div', { class: 'shead' }, '🧩 پروژه از کد ویدیو', h('div', { class: 'spacer' }), h('button', { class: 'icon', onclick: () => sheet.remove() }, '×')),
      h('div', { class: 'form' },
        h('div', { class: 'frow' }, h('label', {}, 'نام'), nameI),
        h('div', { class: 'frow' }, h('label', {}, 'هنرمند'), artistI),
        h('div', { class: 'frow' }, h('label', {}, 'تلگرام'), tgI),
        h('div', { class: 'shead sm' }, 'نسبت تصویر'), aspBox, autoNote,
        card, msg)));
  document.body.append(sheet);
  return sheet;
}
