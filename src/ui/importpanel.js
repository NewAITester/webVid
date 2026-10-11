import { h, faN } from './dom.js';
import { importCode, detectFormat, pickMain, synthAudio, FORMATS } from '../motion/importers/index.js';

/**
 * کارت «🧩 وارد کردن کد ویدیو» داخل پنجرهٔ موشن‌اسکریپت
 * ─────────────────────────────────────────────────────────────
 * کد (JS بوم، HTML، پایتون MoviePy/Manim) را تحلیل می‌کند و نشان می‌دهد:
 * صحنه‌ها (با پیش‌نمایش)، اجزای پیدا‌شده، چیزهای ناشناخته و هشدارها،
 * و همهٔ مقدارهای قابل‌تغییر (رنگ، متن، عدد). با هر تغییر، تبدیل دوباره
 * انجام می‌شود؛ نتیجه به موشن‌اسکریپت منتقل یا مستقیم ساخته می‌شود.
 */
const fmt = s => faN((+s).toFixed(2).replace(/\.?0+$/, ''));
export const isVideoCode = (text, name = '') => detectFormat(text, name) !== 'motion';

/**
 * @param {object} o  { host, files:[{name,text}], onScript(script, build:boolean), say(cls,msg) }
 * @returns {HTMLElement}
 */
export function importCard({ host, files, onScript, say }) {
  const main = pickMain(files);
  const others = files.filter(f => f.name !== main.name);
  const values = {};
  let R = null, busy = 0, tweakEl = null;   // فهرست مقدارها یک‌بار ساخته می‌شود تا تایپ قطع نشود
  const card = h('div', { class: 'impcard' });

  const save = (data, name, type) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    if (host?.saveFile) host.saveFile(blob, name);
    else { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  };
  const modName = n => { const m = /^(.*?)(\.[^.]+)?$/.exec(n); return `${m[1]}-edited${m[2] || ''}`; };

  function convert() {
    const t0 = performance.now();
    try { R = importCode(main.text, { name: main.name, values: Object.keys(values).length ? values : null }); }
    catch (e) { R = { kind: 'unknown', ic: '⚠', label: 'خطا', error: e.message, warnings: [], tweaks: [], scenes: [], found: [], unknown: [], media: [], audio: [] }; }
    R.ms = Math.round(performance.now() - t0);
    paint();
  }

  const thumbs = new Map();          // OffscreenCanvas ← <canvas> (یک‌بار برای هر صحنه)
  function thumbEl(sc) {
    const key = sc.name + sc.t0;
    if (!thumbs.has(key)) {
      const c = h('canvas', { class: 'ithumb', width: sc.thumb.width || 192, height: sc.thumb.height || 108 });
      try { c.getContext('2d').drawImage(sc.thumb, 0, 0); } catch { /* */ }
      thumbs.set(key, c);
    }
    return thumbs.get(key);
  }

  function tweakInput(t) {
    const v = t.id in values ? values[t.id] : t.value;
    const set = x => { values[t.id] = x; clearTimeout(busy); busy = setTimeout(convert, t.type === 'text' ? 500 : 250); };
    if (t.type === 'color') {
      const hex = String(v).slice(0, 7);
      return h('input', { type: 'color', value: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#ffffff', oninput: e => set(String(v).length === 9 ? e.target.value + String(v).slice(7) : e.target.value.toUpperCase()) });
    }
    if (t.type === 'num') return h('input', { type: 'number', value: v, step: Math.abs(t.def) >= 10 || Number.isInteger(t.def) ? 1 : 0.05, oninput: e => { const x = parseFloat(e.target.value); if (isFinite(x)) set(x); } });
    return h('input', { type: 'text', value: v, dir: 'auto', oninput: e => set(e.target.value) });
  }

  function paint() {
    card.innerHTML = '';
    const F = FORMATS[R.kind] || FORMATS.unknown;
    card.append(h('div', { class: 'ihd' },
      h('span', { class: 'iic' }, F.ic),
      h('div', {}, h('b', {}, `${main.name}`), h('small', {}, ` ${F.label}` + (R.duration ? ` · ${fmt(R.duration)} ثانیه` : '') + (R.scenes?.length ? ` · ${faN(R.scenes.length)} صحنه` : '') + ` · ${faN(R.ms)} میلی‌ثانیه`)),
      h('div', { class: 'spacer' }),
      h('button', { class: 'icon sm', title: 'بستن', onclick: () => card.remove() }, '✕')));
    if (others.length) card.append(h('div', { class: 'inote' }, `فایل‌های همراه: ${others.map(f => f.name).join('، ')} — «${main.name}» به‌عنوان فایل اصلی خوانده شد` + (main.merged ? ` و ${main.merged.join('، ')} داخلش گذاشته شد.` : '.')));
    if (R.error) card.append(h('div', { class: 'msg err' }, '✗ ' + R.error));

    // اجزای پیدا‌شده
    if (R.found?.length) card.append(h('div', { class: 'isec' }, h('div', { class: 'ist' }, '🔎 اجزای پیدا‌شده'),
      h('div', { class: 'chips' }, ...R.found.map(f => h('span', { class: 'echip' }, h('i', {}, f.ic), `${f.label} ×${faN(f.n)}`)))));

    // صحنه‌ها
    if (R.scenes?.length) card.append(h('div', { class: 'isec' }, h('div', { class: 'ist' }, '🎞 صحنه‌ها'),
      h('div', { class: 'iscenes' }, ...R.scenes.map(sc => h('div', { class: 'iscene' },
        sc.thumb ? thumbEl(sc) : null,
        h('div', { class: 'sh' }, h('b', {}, sc.name), h('small', {}, `${fmt(sc.t0)}–${fmt(sc.t1)} ث`)),
        h('div', { class: 'chips' }, ...sc.chips.slice(0, 10).map(c => h('span', { class: 'echip sm' }, c))))))));

    // مقدارهای قابل‌تغییر
    if (tweakEl) card.append(tweakEl);
    else if (R.tweaks?.length) {
      const groups = new Map();
      for (const t of R.tweaks) { if (!groups.has(t.group)) groups.set(t.group, []); groups.get(t.group).push(t); }
      card.append(tweakEl = h('details', { class: 'isec', open: R.tweaks.length <= 40 },
        h('summary', { class: 'ist' }, `🎛 مقدارهای قابل‌تغییر (${faN(R.tweaks.length)}) — با هر تغییر دوباره تبدیل می‌شود`),
        ...[...groups.entries()].map(([g, ts]) => h('div', { class: 'itw' }, h('div', { class: 'itg' }, g),
          ...ts.map(t => h('label', { class: 'itrow', title: `${t.id}${t.line ? ' — خط ' + faN(t.line) : ''}` },
            h('span', {}, t.label), tweakInput(t)))))));
    }

    // هشدارها / ناشناخته‌ها / رسانه
    const notes = [...(R.warnings || [])];
    if (R.unknown?.length) notes.push(`ناشناخته (نادیده گرفته شد): ${[...new Set(R.unknown)].slice(0, 12).join('، ')}`);
    if (R.media?.length) notes.push(`فایل‌های رسانه (به‌جایشان کادر جایگزین گذاشته شد؛ بعداً در لایه‌ها عوضشان کنید): ${[...new Set(R.media.map(m => m.file))].join('، ')}`);
    if (R.files?.length) notes.push(`فایل‌هایی که این کد استفاده می‌کند: ${R.files.join('، ')}`);
    if (notes.length) card.append(h('div', { class: 'isec inotes' }, ...notes.map(n => h('div', {}, '⚠ ' + n))));

    // دکمه‌ها
    const btns = h('div', { class: 'frow btns' });
    if (R.script) {
      btns.append(
        h('button', { class: 'btn primary', onclick: () => onScript(R.script, true) }, '▶ همین الان بساز'),
        h('button', { class: 'btn sm ghost', title: 'کد تبدیل‌شده در کادر اسکریپت قرار می‌گیرد تا دستی ویرایشش کنید', onclick: () => onScript(R.script, false) }, '← انتقال به موشن‌اسکریپت'));
    }
    if (R.tweaks?.length) btns.append(h('button', { class: 'btn sm ghost', title: 'همان کد اصلی، با مقدارهای تازه', onclick: () => save(R.source, modName(main.name), 'text/plain') }, '⬇ کد اصلیِ تغییریافته'));
    if (R.hasAudio && R.canvas) btns.append(h('button', { class: 'btn sm ghost', onclick: async e => {
      const b = e.currentTarget; b.disabled = true; const old = b.textContent; b.textContent = '… در حال ساخت صدا';
      try {
        const wav = await synthAudio(R.canvas.program, R.canvas.T, R.canvas.run);
        if (!wav) say('warn', 'موسیقی کد ساخته نشد.');
        else { save(new Blob([wav], { type: 'audio/wav' }), main.name.replace(/\.[^.]+$/, '') + '-music.wav'); say('ok', '✓ موسیقی کد به‌صورت WAV ذخیره شد؛ می‌توانید به‌عنوان آهنگ پروژه بارش کنید.'); }
      } catch (err) { say('err', 'خطا در ساخت صدا: ' + err.message); }
      b.disabled = false; b.textContent = old;
    } }, '🎵 موسیقی کد (WAV)'));
    if (btns.childNodes.length) card.append(btns);
  }

  convert();
  return card;
}
