import { h, faN } from './dom.js';
import { importCode, detectFormat, pickMain, synthAudio, FORMATS } from '../motion/importers/index.js';
import { EXTRAS, defaultExtras, applyExtras } from '../motion/importers/extras.js';
import { detectEffects, agentBrief } from '../motion/importers/effects.js';

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
 * قبل از ساخت می‌پرسد: «فقط اجزای خود کد» یا «کد + چیزهایی از خود برنامه».
 * @param {object} o  { host, files:[{name,text}], onScript(script, build:boolean, info), say(cls,msg),
 *                      project:boolean (ساخت پروژهٔ تازه), meta:()=>({title,artist,tg,accent}), onResult(R) }
 * @returns {HTMLElement}
 */
export function importCard({ host, files, onScript, say, project = false, meta = () => ({}), onResult = null }) {
  const main = pickMain(files);
  const others = files.filter(f => f.name !== main.name);
  const values = {};
  let R = null, busy = 0, tweakEl = null, modeEl = null;   // فهرست مقدارها یک‌بار ساخته می‌شود تا تایپ قطع نشود
  const card = h('div', { class: 'impcard' });
  const extras = defaultExtras(project);
  extras.music = true;                                     // موسیقی خود کد (اگر دارد) پیش‌فرض داخل پروژه می‌آید
  let fx = null, fxGen = 0, fxEl = null;                   // افکت‌های شناسایی‌شده (خودکار، پس‌زمینه)
  const finalScript = () => (extras.mode === 'fx' && fx?.script ? fx.script
    : applyExtras(R.script, extras, { scenes: R.scenes, duration: R.duration, ...meta() }));
  let fxRadio = null, modeSync = null;
  const info = () => ({ R, extras: { ...extras }, name: main.name });

  /** پرسش «پروژه با این کد چطور ساخته شود؟» — یک‌بار ساخته می‌شود */
  function modeBox() {
    if (modeEl) return modeEl;
    const opts = h('div', { class: 'imxopts' }), grp = 'imx' + Math.random().toString(36).slice(2, 7);
    const radio = (id, ic, title, desc) => h('label', { class: 'imxr' + (extras.mode === id ? ' on' : '') },
      h('input', { type: 'radio', name: grp, checked: extras.mode === id, onchange: () => { extras.mode = id; sync(); } }),
      h('div', {}, h('b', {}, `${ic} ${title}`), h('small', {}, desc)));
    const rows = [
      radio('pure', '🧩', 'فقط اجزای خود کد', 'فقط المان‌ها، اجزا و نوشته‌های همین کد ساخته می‌شوند — بدون هیچ اضافه‌ای از برنامه.'),
      radio('app', '✨', 'کد + چیزهایی از خود برنامه', 'اجزای کد، به‌علاوهٔ مواردی که پایین انتخاب می‌کنید (گذار، عنوان، کانال، …).'),
    ];
    // «نسخهٔ قابل‌ویرایش» برداشته شد: بازسازی افکت‌ها تقریبی بود و کد را درست نشان نمی‌داد؛
    // خروجی افکت‌ها فقط به‌صورت پیش‌نویس (دکمه‌های پایین) برای ایجنت می‌ماند.
    const list = EXTRAS.filter(x => project || !x.project);
    for (const x of list) {
      const row = h('label', { class: 'imxo' },
        h('input', { type: 'checkbox', checked: !!extras[x.id], onchange: e => { extras[x.id] = e.target.checked; } }),
        h('span', {}, x.label));
      if (x.pick) row.append(h('select', { onchange: e => { extras.transKind = e.target.value; } },
        ...x.pick.map(([v, l]) => h('option', { value: v, selected: extras.transKind === v }, l))));
      opts.append(row);
    }
    function sync() {
      rows.forEach((r, i) => r.classList.toggle('on', ['pure', 'app', 'fx'][i] === extras.mode));
      opts.classList.toggle('hidden', extras.mode !== 'app');
    }
    sync(); modeSync = sync;
    return (modeEl = h('div', { class: 'isec imx' }, h('div', { class: 'ist' }, '❓ ' + (project ? 'پروژه با این کد چطور ساخته شود؟' : 'با این کد چطور ساخته شود؟')), ...rows, opts));
  }

  const save = (data, name, type) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    if (host?.saveFile) host.saveFile(blob, name);
    else { const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  };
  const base = () => main.name.replace(/\.[^.]+$/, '');
  const modName = n => { const m = /^(.*?)(\.[^.]+)?$/.exec(n); return `${m[1]}-edited${m[2] || ''}`; };

  function convert() {
    const t0 = performance.now();
    try { R = importCode(main.text, { name: main.name, values: Object.keys(values).length ? values : null }); }
    catch (e) { R = { kind: 'unknown', ic: '⚠', label: 'خطا', error: e.message, warnings: [], tweaks: [], scenes: [], found: [], unknown: [], media: [], audio: [] }; }
    R.ms = Math.round(performance.now() - t0);
    fx = null;
    paint();
    try { onResult?.(R); } catch { /* */ }
    startFx();
  }

  /** تشخیص خودکار افکت‌ها (فقط کد بوم / pycairo) — بی‌آنکه کارت را قفل کند */
  function startFx() {
    const gen = ++fxGen;
    if (!R?.canvas || !R.scenes?.length || R.error) { fx = null; paintFx(); return; }
    fx = { busy: true, p: 0 };
    paintFx();
    setTimeout(async () => {
      if (gen !== fxGen) return;
      try {
        const res = await detectEffects(R, { name: main.name, isCancelled: () => gen !== fxGen || !card.isConnected,
          onProgress: p => { if (gen === fxGen) { fx.p = p; paintFx(); } } });
        if (gen !== fxGen) return;
        fx = res ? { ...res, busy: false } : null;
      } catch (e) { if (gen === fxGen) fx = { busy: false, error: e.message }; }
      paintFx();
    }, 400);
  }
  /** گزینهٔ «نسخهٔ قابل‌ویرایش» فقط وقتی افکت‌ها آماده‌اند */
  function syncFxRadio() {
    if (!fxRadio) return;
    const ready = !!(fx && !fx.busy && fx.count), inp = fxRadio.querySelector('input'), sm = fxRadio.querySelector('small');
    inp.disabled = !ready && extras.mode !== 'fx';
    fxRadio.classList.toggle('dis', !ready);
    if (!sm.dataset.d) sm.dataset.d = sm.textContent;
    sm.textContent = fx?.busy ? `در حال شناختن افکت‌ها… ${faN(Math.round((fx.p || 0) * 100))}٪` : ready ? sm.dataset.d : 'افکتی شناخته نشد.';
    if (fx && !fx.busy && !fx.count && extras.mode === 'fx') { extras.mode = 'pure'; const r0 = modeEl?.querySelector('input[type=radio]'); if (r0) r0.checked = true; modeSync?.(); }
  }
  function paintFx() {
    syncFxRadio();
    if (!fxEl) fxEl = h('div', { class: 'isec ifx' });
    fxEl.innerHTML = '';
    fxEl.classList.toggle('hidden', !fx);
    if (!fx) return;
    const head = h('div', { class: 'ist' }, '✨ افکت‌های شناسایی‌شده');
    if (fx.busy) { fxEl.append(head, h('small', { class: 'muted' }, `در حال بررسی فریم‌ها… ${faN(Math.round((fx.p || 0) * 100))}٪`)); return; }
    if (fx.error || !fx.count) { fxEl.append(head, h('small', { class: 'muted' }, fx.error ? 'تشخیص افکت انجام نشد: ' + fx.error : 'افکت شناخته‌شده‌ای پیدا نشد.')); return; }
    fxEl.append(head,
      h('div', { class: 'chips' }, ...fx.A.scenes.flatMap(sc => [...sc.effects.map(e => e.label), ...sc.trans.map(t => 'گذار ' + t.kind)])
        .filter((v, i, a) => a.indexOf(v) === i).slice(0, 24).map(l => h('span', { class: 'echip sm' }, l))),
      h('small', { class: 'muted' }, '«✨ خروجی افکت‌ها» یک بازسازی تقریبی (پیش‌نویس) با المان‌های برنامه است، نه خود کد. «🤖 دستور برای ایجنت» یک فایل Markdown است: آن را به یک AI بدهید تا برای افکت‌هایی که دقیق درنیامده‌اند المان تازه بنویسد؛ فایلی که برمی‌گرداند (elementPack + صحنه‌ها) را همین‌جا وارد کنید تا المان‌ها به برنامه اضافه شوند.'),
      h('div', { class: 'frow btns' },
        h('button', { class: 'btn sm', title: 'افکت‌ها به‌صورت المان‌های قابل‌تغییر برنامه — قابل وارد کردن دوباره',
          onclick: () => save(fx.script, base() + '.effects.motion.js', 'text/javascript') }, `✨ خروجی افکت‌ها (${faN(fx.count)})`),
        h('button', { class: 'btn sm ghost', title: 'دستور کار کامل برای ایجنت: قرارداد المان‌ها، افکت‌های اندازه‌گیری‌شده، کد هر صحنه و کد اصلی',
          onclick: () => save(agentBrief(fx, R, { name: main.name }), base() + '.agent.md', 'text/markdown') }, '🤖 دستور برای ایجنت'),
        h('button', { class: 'btn sm ghost', title: 'کپی همان دستور در کلیپ‌بورد', onclick: async () => {
          try { await navigator.clipboard.writeText(agentBrief(fx, R, { name: main.name })); say('ok', '✓ دستور ایجنت کپی شد — در گفتگو با AI بچسبانید.'); }
          catch { say('warn', 'کپی نشد؛ از دکمهٔ «🤖 دستور برای ایجنت» فایلش را بگیرید.'); }
        } }, '📋')));
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
    if (R.packAdded?.length) card.append(h('div', { class: 'msg ok' }, `🧩 ${faN(R.packAdded.length)} المان تازه به برنامه اضافه شد: ${R.packAdded.join('، ')}`
      + (R.packOnly ? ' — حالا در موشن‌اسکریپت و فهرست «المان‌ها» در دسترس‌اند.' : '')));
    if (R.script) card.append(modeBox());
    if (project && R.script && R.hasAudio && R.canvas) card.append(h('div', { class: 'isec imusic' }, h('label', { class: 'imxo' },
      h('input', { type: 'checkbox', checked: !!extras.music, onchange: e => { extras.music = e.target.checked; } }),
      h('span', {}, '🎵 موسیقیِ خود کد هم داخل پروژه بیاید (بعداً از «تنظیمات پروژه» ← «🔇 حذف آهنگ» می‌شود برداشتش)'))));
    if (R.canvas && R.script) card.append(h('div', { class: 'inote' },
      'ℹ در حالت «فقط اجزای خود کد»، خود کد اصلی هر صحنه را می‌کشد: متن‌ها، رنگ‌ها و عددهای پیدا‌شده (پایین و در «✎ تنظیم» هر لایه) قابل‌تغییرند، '
      + 'ولی شکل‌ها و نوشته‌ها لایهٔ جدا نیستند. برای بقیه در زبانهٔ «{} کد» لایه با 🔍 جستجو کنید (کد همان صحنه بالای کد است).'));

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

    paintFx(); card.append(fxEl);

    // دکمه‌ها
    const btns = h('div', { class: 'frow btns' });
    if (R.script) {
      btns.append(h('button', { class: 'btn primary', onclick: () => {
        if (extras.mode === 'fx' && !fx?.script) { say('warn', 'کمی صبر کنید تا افکت‌ها شناخته شوند…'); return; }
        onScript(finalScript(), true, info());
      } }, project ? '✓ ساخت پروژه و باز کردن' : '▶ همین الان بساز'));
      if (!project) btns.append(h('button', { class: 'btn sm ghost', title: 'کد تبدیل‌شده در کادر اسکریپت قرار می‌گیرد تا دستی ویرایشش کنید', onclick: () => { if (extras.mode === 'fx' && !fx?.script) { say('warn', 'کمی صبر کنید تا افکت‌ها شناخته شوند…'); return; } onScript(finalScript(), false, info()); } }, '← انتقال به موشن‌اسکریپت'));
    }
    const changed = R.source && R.tweaks?.some(t => t.id in values && String(values[t.id]) !== String(t.def ?? t.value));
    if (changed) btns.append(h('button', { class: 'btn sm ghost', title: 'فایل کد اصلی شما (همان زبان و همان ساختار)، فقط با مقدارهایی که این‌جا عوض کرده‌اید — برای اجرای دوباره در محیط خودش',
      onclick: () => save(R.source, modName(main.name), 'text/plain') }, '⬇ دانلود کد اصلی با مقدارهای تازه'));
    if (!project && R.hasAudio && R.canvas) btns.append(h('button', { class: 'btn sm ghost', onclick: async e => {
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
