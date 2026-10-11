import { h, faN, select, check } from './dom.js';
import { runScript, scriptToLayers, layersToScript, SCRIPT_HELP } from '../motion/scenescript.js';
import { SAMPLE_SCRIPTS } from '../motion/samplescript.js';
import { ELEMENT_KINDS } from '../motion/elements.js';
import { LAYER_TYPES } from '../motion/schema.js';
import { importCard } from './importpanel.js';
import { detectFormat, probeMotion } from '../motion/importers/index.js';

/**
 * پنجرهٔ «📜 موشن‌اسکریپت»
 * ─────────────────────────────────────────────────────────────
 * کد صحنه‌ها را می‌گیرد (تایپ، چسباندن، فایل یا نمونه)، اجرا می‌کند و
 * لایه‌ها را می‌سازد. بعد از اجرا فهرست صحنه‌ها و المان‌ها نشان داده
 * می‌شود؛ با زدن هر المان، همان لایه برای ویرایش دستی باز می‌شود.
 * «📤 از لایه‌ها» برعکس کار می‌کند: از لایه‌های فعلی کد می‌سازد.
 * «🧩 وارد کردن کد ویدیو»: کد بوم (JS/HTML) یا پایتون (MoviePy/Manim) که با
 * آن ویدیو ساخته شده را می‌خواند و به صحنه‌ها و لایه‌های قابل‌تغییر تبدیل می‌کند.
 */
const VIDEO_CODE = new Set(['canvas', 'html', 'moviepy', 'manim', 'python']);
const DRAFT = 'ls.motionScript';
const fmt = s => faN((+s).toFixed(2).replace(/\.?0+$/, ''));

export function openScriptSheet(mp) {
  const host = mp.host;
  document.querySelector('.addsheet')?.remove();
  let backup = null, lastIds = [];

  const ta = h('textarea', { class: 'code script', spellcheck: false, dir: 'ltr',
    value: localStorage.getItem(DRAFT) || SAMPLE_SCRIPTS[Object.keys(SAMPLE_SCRIPTS)[0]] });
  let saveT = 0;
  ta.addEventListener('input', () => { clearTimeout(saveT); saveT = setTimeout(() => localStorage.setItem(DRAFT, ta.value), 400); });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  });
  const msg = h('div', { class: 'msg' });
  const out = h('div', { class: 'sres' });
  const impBox = h('div', { class: 'impbox' });
  const file = h('input', { type: 'file', multiple: true, accept: '.js,.txt,.mjs,.html,.htm,.py,text/javascript,text/plain,text/html,text/x-python', class: 'hidden', onchange: async () => {
    const fs = [...(file.files || [])]; if (!fs.length) return;
    const files = await Promise.all(fs.map(async f => ({ name: f.name, text: await f.text() })));
    if (files.length === 1 && !VIDEO_CODE.has(detectFormat(files[0].text, files[0].name))) {
      ta.value = files[0].text; ta.dispatchEvent(new Event('input')); say('ok', `«${files[0].name}» باز شد — «▶ اجرا» را بزنید.`);
      return;
    }
    showImport(files);
  } });
  function showImport(files) {
    impBox.innerHTML = '';
    say('', '🧩 در حال خواندن کد…');
    setTimeout(() => {
      try {
        impBox.append(importCard({ host, files, say, meta: () => ({ title: host.title?.() || '', artist: host.artist?.() || '', tg: host.tg?.() || '' }), onScript: (script, build) => {
          ta.value = script; ta.dispatchEvent(new Event('input'));
          if (build) run(false);
          else { say('ok', '✓ کد تبدیل‌شده در کادر اسکریپت است؛ هر خط یک لایه است — عوضش کنید و «▶ اجرا» بزنید.'); ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop = 0; }
        } }));
        say('ok', '✓ کد خوانده شد — اجزا و مقدارهای قابل‌تغییر پایین آمده‌اند.');
        impBox.scrollIntoView?.({ block: 'nearest' });
      } catch (e) { say('err', '✗ خواندن کد نشد: ' + e.message); }
    }, 30);
  }

  const opts = { replace: true, from: 'start', behind: false };
  const say = (cls, text) => { msg.className = 'msg ' + cls; msg.textContent = text; };
  const ctxInfo = () => ({ W: host.W(), H: host.H(), bpm: host.bpm?.() || 120 });

  function gotoLine(n) {
    if (!n) return;
    const lines = ta.value.split('\n');
    const a = lines.slice(0, n - 1).join('\n').length + (n > 1 ? 1 : 0);
    ta.focus(); ta.setSelectionRange(a, a + (lines[n - 1] || '').length);
  }

  function summary(res, built) {
    out.innerHTML = '';
    const byScene = new Map();
    for (const L of built || []) { if (!byScene.has(L.scene)) byScene.set(L.scene, []); byScene.get(L.scene).push(L); }
    const chip = L => {
      const K = L.data?.el && ELEMENT_KINDS[L.data.el.kind];
      return h('button', { class: 'echip', title: 'باز کردن این لایه برای ویرایش', onclick: () => {
        sheet.remove(); host.openPane?.(); host.select(L.id); host.seek(L.t0 + Math.min(0.6, (L.t1 - L.t0) / 2)); mp.render();
      } }, h('i', {}, K ? K.ic : LAYER_TYPES[L.type]?.icon || '•'), L.name);
    };
    const rows = res.scenes.map(sc => h('div', { class: 'srow' },
      h('div', { class: 'sh' }, h('b', {}, sc.name), h('small', {}, `${fmt(sc.t0)}–${fmt(sc.t1)} ث`)),
      h('div', { class: 'chips' }, ...(byScene.get(sc.name) || []).map(chip))));
    for (const nm of ['گذار', 'روی همه']) {
      const Ls = byScene.get(nm);
      if (Ls?.length) rows.push(h('div', { class: 'srow' }, h('div', { class: 'sh' }, h('b', {}, nm)), h('div', { class: 'chips' }, ...Ls.map(chip))));
    }
    out.append(...rows);
  }

  function run(dry = false) {
    const info = ctxInfo();
    const kind = detectFormat(ta.value, '');
    if (VIDEO_CODE.has(kind) && !probeMotion(ta.value)?.res) {          // کد ویدیو چسبانده شده، نه موشن‌اسکریپت
      showImport([{ name: kind === 'html' ? 'code.html' : /python|moviepy|manim/.test(kind) ? 'code.py' : 'code.js', text: ta.value }]);
      return;
    }
    const res = runScript(ta.value, info);
    if (!res.ok) {
      say('err', '✗ ' + (res.line ? `خط ${faN(res.line)}: ` : '') + res.error);
      gotoLine(res.line);
      return;
    }
    const offset = opts.from === 'now' ? host.getTime() : 0;
    const { layers, warnings } = scriptToLayers(res, { ...info, offset, behind: opts.behind });
    const warn = [...res.warnings, ...warnings];
    const end = offset + res.length, dur = host.duration() || 0;
    if (dur && end > dur + 0.05) warn.push(`اسکریپت تا ${fmt(end)} ثانیه است ولی ویدیو ${fmt(dur)} ثانیه — بخش آخر دیده نمی‌شود.`);
    if (dry) {
      say(warn.length ? 'warn' : 'ok', `✓ سالم — ${faN(res.scenes.length)} صحنه، ${faN(layers.length)} لایه، ${fmt(res.length)} ثانیه، ${fmt(res.tempo)} ضرب در دقیقه`
        + (warn.length ? '\n⚠ ' + warn.join('\n⚠ ') : ''));
      summary(res, layers.map((L, i) => ({ ...L, id: '__dry' + i })));
      out.querySelectorAll('.echip').forEach(b => { b.disabled = true; });
      return;
    }
    const all = host.getLayers();
    backup = JSON.parse(JSON.stringify(all));
    if (opts.replace) for (let i = all.length - 1; i >= 0; i--) if (all[i].src === 'script') all.splice(i, 1);
    all.push(...layers);
    lastIds = layers.map(L => L.id);
    host.select(null);
    host.save(); host.draw(); mp.render();
    host.seek(offset + Math.min(0.5, res.length / 2));
    say(warn.length ? 'warn' : 'ok', `✓ ${faN(layers.length)} لایه در ${faN(res.scenes.length)} صحنه ساخته شد (${fmt(res.length)} ثانیه). روی هر المان بزنید تا دستی عوضش کنید.`
      + (warn.length ? '\n⚠ ' + warn.join('\n⚠ ') : ''));
    undoBtn.classList.remove('hidden');
    summary(res, layers);
  }

  const undoBtn = h('button', { class: 'btn sm ghost hidden', onclick: () => {
    if (!backup) return;
    const all = host.getLayers();
    all.splice(0, all.length, ...backup);
    backup = null; undoBtn.classList.add('hidden');
    host.select(null); host.save(); host.draw(); mp.render();
    say('ok', '↶ لایه‌ها به قبل از اجرا برگشتند.'); out.innerHTML = '';
  } }, '↶ برگرداندن');

  const samples = select([['', 'نمونه‌ها…'], ...Object.keys(SAMPLE_SCRIPTS).map(k => [k, k])], '', k => {
    if (!k) return;
    if (ta.value.trim() && ta.value !== SAMPLE_SCRIPTS[k] && !confirm('اسکریپت فعلی با نمونه عوض شود؟')) { samples.value = ''; return; }
    ta.value = SAMPLE_SCRIPTS[k]; ta.dispatchEvent(new Event('input')); samples.value = '';
    say('ok', `نمونهٔ «${k}» آماده است — «▶ اجرا» را بزنید.`);
  });

  const help = h('details', { class: 'xhelp' }, h('summary', {}, 'راهنمای اسکریپت'),
    h('div', {}, ...SCRIPT_HELP.map(([k, d]) => h('div', { class: 'xh' }, h('code', {}, k), ' ', d)),
      h('div', { class: 'xh' }, h('b', {}, 'المان‌ها: '), ...Object.entries(ELEMENT_KINDS).map(([k, K]) =>
        h('span', { class: 'ek', title: K.desc + ' — تنظیم‌ها: ' + K.params.map(p => p.key).join('، ') }, `${K.ic} ${k}`)))));

  const sheet = h('div', { class: 'addsheet scriptsheet', onclick: e => { if (e.target === sheet) sheet.remove(); } },
    h('div', { class: 'sbody' },
      h('div', { class: 'shd' }, h('b', {}, '📜 موشن‌اسکریپت'), h('small', {}, ' ویدیو را با کد بنویسید، بعد دستی ویرایش کنید'),
        h('div', { class: 'spacer' }), h('button', { class: 'icon sm', onclick: () => sheet.remove(), title: 'بستن' }, '✕')),
      h('div', { class: 'frow btns' }, samples,
        h('button', { class: 'btn sm ghost', onclick: () => { file.value = ''; file.click(); } }, '📂 باز کردن فایل'),
        h('button', { class: 'btn sm ghost', title: 'کد JS/HTML بوم یا پایتون (MoviePy، Manim) که با آن ویدیو ساخته شده — می‌شود چند فایل را با هم انتخاب کرد', onclick: () => { file.value = ''; file.click(); } }, '🧩 وارد کردن کد ویدیو (JS/HTML/Python)'),
        h('button', { class: 'btn sm ghost', title: 'از لایه‌های فعلی پروژه کد بساز', onclick: () => {
          const Ls = host.getLayers();
          if (!Ls.length) { say('warn', 'پروژه هنوز لایه‌ای ندارد.'); return; }
          if (ta.value.trim() && !confirm('کد ساخته‌شده از لایه‌ها جای اسکریپت فعلی بنشیند؟')) return;
          ta.value = layersToScript(Ls, { ...ctxInfo(), title: host.title?.() || '' });
          ta.dispatchEvent(new Event('input'));
          say('ok', `✓ از ${faN(Ls.length)} لایه کد ساخته شد. می‌شود ذخیره‌اش کرد یا تغییرش داد و دوباره اجرا کرد.`);
        } }, '📤 از لایه‌ها'),
        h('button', { class: 'btn sm ghost', onclick: async () => {
          try { await navigator.clipboard.writeText(ta.value); say('ok', '✓ کپی شد'); } catch { ta.select(); say('warn', 'کپی خودکار نشد؛ متن انتخاب شد.'); }
        } }, '📋 کپی'),
        h('button', { class: 'btn sm ghost', onclick: () => {
          const blob = new Blob([ta.value], { type: 'text/javascript' });
          if (host.saveFile) host.saveFile(blob, 'motion-script.js');
          else { const a = h('a', { href: URL.createObjectURL(blob), download: 'motion-script.js' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
        } }, '💾 ذخیره')),
      h('div', { class: 'sscroll' },
        ta,
        h('div', { class: 'frow btns' },
          check('لایه‌های اسکریپت قبلی پاک شوند', opts.replace, v => { opts.replace = v; }),
          check('پشت شعر', opts.behind, v => { opts.behind = v; }),
          select([['start', 'از ثانیهٔ صفر'], ['now', 'از نشانگر فعلی']], opts.from, v => { opts.from = v; })),
        h('div', { class: 'frow btns' },
          h('button', { class: 'btn primary', onclick: () => run(false) }, '▶ اجرا و ساخت لایه‌ها'),
          h('button', { class: 'btn sm ghost', onclick: () => run(true) }, '✓ فقط بررسی'),
          undoBtn),
        msg, impBox, out, help, file)));
  document.body.append(sheet);
  setTimeout(() => sheet.classList.add('in'), 0);
  say('', 'Ctrl+Enter = اجرا. هر صحنه و المان بعد از اجرا یک لایهٔ قابل ویرایش می‌شود.');
  return sheet;
}
