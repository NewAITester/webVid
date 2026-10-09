import { Stage } from './engine/stage.js';
import { Renderer } from './engine/renderer.js';
import { Analysis } from './engine/analysis.js';
import { parseLRC } from './engine/lyrics.js';
import { loadFonts, faTime } from './engine/text.js';
import { Song, SECT, SECTION_NAMES, DUR, C, ASPECTS, setStageSize, W as SW, H as SH } from './engine/song.js';

import { clearLayoutCache } from './engine/layout.js';
import { clearGlyphCache } from './engine/glyphs.js';
import { exportVideo, canExport, RESOLUTIONS } from './engine/export.js';
import { saveFile, shareFile } from './engine/save.js';
import { Overrides } from './engine/overrides.js';
import { analyzeBuffer, decodeAudioFile } from './engine/analyze.js';
import { Library, autoSections, plainToLines } from './engine/library.js';
import { Timeline } from './ui/timeline.js';
import { PreviewPool } from './ui/previews.js';
import { newText, TEXT_ANIM, layerBox } from './engine/textlayers.js';
import { CustomSet, DEFAULT_CODE, SNIPPETS } from './engine/custom.js';
import { LESSONS, CATEGORIES } from './engine/learn.js';
import { TEXT_FX } from './engine/textfx.js';
import { TEXT_FX2 } from './engine/textfx2.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const BASE = import.meta.env.BASE_URL;
const faN = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

// ابعاد زندهٔ فضای طراحی (با تغییر نسبت عوض می‌شوند)
import * as SONG from './engine/song.js';
const stageDims = () => ({ W: SONG.W, H: SONG.H });

const canvas = $('#stage');
const stage = new Stage(canvas);
const R = new Renderer(stage);

/* ── حالت برنامه ─────────────────────────────────────────── */
const app = {
  song: null,
  audio: null,
  audioUrl: null,
  duration: DUR,
  projectId: '__demo',
  t: 0,
  playing: false,
  raf: 0,
  pane: 'lyrics',
};

/* ── حالت هر پروژه ───────────────────────────────────────────
   ظاهر و جابه‌جایی کلمات متعلق به پروژه‌اند، نه به برنامه. قبلاً
   هر دو در یک کلید سراسری ذخیره می‌شدند و به پروژهٔ بعدی نشت
   می‌کردند. */
const DEFAULT_LOOK = () => ({
  grain: 0.024, bloom: 0.55, chroma: 1.0, furniture: true, accents: {},
});
let look = DEFAULT_LOOK();

const OV = new Overrides({});
R.overrides = OV;

let lineFx = {};              // تنظیمات جداگانهٔ هر خط شعر
let texts = [];               // لایه‌های متن آزاد
R.lineFx = lineFx; R.texts = texts;

const CSET = new CustomSet();
R.customSet = CSET;
let cfIdx = 0;                 // افکت سفارشی در حال ویرایش

/** حالت پروژهٔ نمونه جدا ذخیره می‌شود تا تغییراتتان بماند ولی سرایت نکند */
const DEMO_KEY = 'lyricstudio.demo.state.v2';

function readState(p) {
  if (!p || p.id === '__demo') {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '{}'); } catch { return {}; }
  }
  return { look: p.look, overrides: p.overrides, sections: p.sections };
}

let saveTimer = 0;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const payload = { look, overrides: OV.map, sections: R.sections,
      custom: CSET.toJSON(), lineFx, texts };
    if (app.projectId === '__demo') {
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(payload)); } catch {}
      return;
    }
    const p = await Library.get(app.projectId);
    if (!p) return;
    Object.assign(p, payload);
    await Library.put(p);
  }, 250);
}
const saveLook = saveState;

function applyLook() {
  R.grain = look.grain;
  R.bloom = look.bloom;
  R.chroma = look.chroma;
  R.showFurniture = look.furniture;
  const tbl = R.sections || SECT;
  for (const [i, col] of Object.entries(look.accents)) if (tbl[i]) tbl[i][3] = col;
}

/* ── اندازهٔ بوم ─────────────────────────────────────────── */
function fit() {
  TL.resize();
  const wrap = canvas.parentElement;
  if (!wrap.clientWidth) return;
  const { W: dw, H: dh } = stageDims();
  const s = Math.min((wrap.clientWidth - 12) / dw, (wrap.clientHeight - 12) / dh);
  const cw = Math.max(140, dw * s), ch = Math.max(80, dh * s);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  stage.resize(cw * dpr, ch * dpr);
  if (!app.playing) draw();
}

/* ── حلقهٔ رندر ──────────────────────────────────────────── */
let frames = 0, lastFpsAt = performance.now();

function draw() {
  if (!app.song) return;
  R.renderFrame(app.t);
  $('#tc').textContent = faTime(app.t);
  TL.draw();

  if (app.playing) {
    frames++;
    const now = performance.now();
    if (now - lastFpsAt > 500) {
      $('#fps').textContent = Math.round((frames * 1000) / (now - lastFpsAt)) + ' fps';
      frames = 0; lastFpsAt = now;
    }
  }
}

function loop() {
  if (!app.playing) return;
  app.t = app.audio ? app.audio.currentTime : app.t + 1 / 60;
  if (app.t >= app.duration) { pause(); app.t = app.duration; }
  draw();
  app.raf = requestAnimationFrame(loop);
}
function play() {
  if (app.playing || !app.song) return;
  POOL.stop(); POOL2.stop();
  app.playing = true;
  $('#play').textContent = '❚❚';
  if (app.audio) { app.audio.currentTime = app.t; app.audio.play().catch(() => {}); }
  lastFpsAt = performance.now(); frames = 0;
  app.raf = requestAnimationFrame(loop);
}
function pause() {
  app.playing = false;
  if (app.pane === 'fx') POOL.start(fxPreviewTime());
  if (app.pane === 'clip') POOL2.start(app.t);
  $('#play').textContent = '▶';
  $('#fps').textContent = '—';
  app.audio?.pause();
  cancelAnimationFrame(app.raf);
}
const toggle = () => (app.playing ? pause() : play());
function seek(v) {
  app.t = Math.max(0, Math.min(app.duration, v));
  if (app.audio) app.audio.currentTime = app.t;
  draw();
}

/* ── ناوبری: سه صفحه، و تب‌ها فقط داخل ویرایشگر ───────────
   کتابخانه و ویرایش دو سطح متفاوت‌اند و نباید در یک نوار کنار هم
   باشند. حالا کتابخانه یک صفحهٔ مستقل است، ویرایشگر صفحهٔ دیگر با
   تب‌های خودش، و آموزش صفحهٔ سوم. تنظیمات پروژه هم کار همیشگی
   نیست، پس به یک شیت پشت دکمهٔ چرخ‌دنده رفت. */
const APP = document.getElementById('app');

function screen(name) {
  APP.dataset.screen = name;
  if (name !== 'editor') pause();
  if (name === 'editor') { fit(); draw(); }
  if (name === 'learn') buildLessons();
  if (name === 'library') buildProjList();
}

function go(name, toggle = false) {
  // زدن دوبارهٔ همان تب = بستن پنل
  if (toggle && app.pane === name && $('#panes').classList.contains('open')) {
    closePane(); return;
  }
  if (name !== 'fx') POOL.stop();
  if (name !== 'clip') POOL2.stop();
  app.pane = name;
  $$('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === name));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.go === name));
  sizePane();
  $('#panes').classList.add('open');
  R.editMode = name === 'words';
  canvas.classList.toggle('editing', name === 'words');
  draw();

  if (name === 'look') syncLook();
  if (name === 'words') refreshCount();
  if (name === 'code') syncCode();
  if (name === 'clip') buildClipPanel();
  if (name === 'lyrics') syncLyricsPane();
  if (name === 'fx') { buildFxCats(); buildFxGrid(); buildCfList(); }
}
$$('#nav button[data-go]').forEach(b => { b.onclick = () => go(b.dataset.go, true); });

function closePane() {
  POOL.stop(); POOL2.stop();
  $('#panes').classList.remove('open');
  $$('#nav button').forEach(b => b.classList.remove('on'));
  app.pane = null;
  R.editMode = false;
  canvas.classList.remove('editing');
  draw();
}
$('#paneGrab').onclick = closePane;

$('#backBtn').onclick = () => screen('library');
$('#learnBtn').onclick = () => screen('learn');
$('#lnBack').onclick = () => {
  if (!$('#lnBody').classList.contains('hidden')) { buildLessons(); return; }
  screen('library');
};
$('#gearBtn').onclick = () => { syncProject(); $('#pjSheet').classList.remove('hidden'); };
$('#pjX').onclick = () => $('#pjSheet').classList.add('hidden');
$('#pjSheet').onclick = e => { if (e.target.id === 'pjSheet') $('#pjSheet').classList.add('hidden'); };
$('#addAudioBtn').onclick = () => { syncProject(); $('#pjSheet').classList.remove('hidden'); };



/* ── نوار تصاویر بخش ─────────────────────────────────────── */
let cards = [];
function thumbTime(sec) {
  const [t0, t1, style] = sec;
  const mid = t0 + (t1 - t0) * 0.4;
  if (!['verse', 'chorus', 'pre', 'cold', 'mirror'].includes(style)) return mid;
  const L = app.song.lines.find(l => l.words[0].t >= t0 && l.words[0].t < t1 - 0.4);
  if (!L) return mid;
  const span = Math.max(0.8, app.song.lineOut(L.i) - app.song.lineStart(L.i));
  return Math.min(app.song.lineStart(L.i) + span * 0.5, t1 - 0.2);
}
function buildStrip() {
  const strip = $('#strip');
  if (!strip || !app.song) return;
  strip.innerHTML = '';
  cards = [];
  (R.sections || SECT).forEach(sec => {
    const el = document.createElement('div');
    el.className = 'card';
    const c = document.createElement('canvas');
    const { W: dw, H: dh } = stageDims();
    const tw = dh > dw ? 110 : 236;
    c.width = tw; c.height = Math.round(tw * dh / dw);
    const lb = document.createElement('div');
    lb.className = 'lb';
    lb.textContent = styleLabel(sec[2]);
    el.append(c, lb);
    el.onclick = () => seek(sec[0] + 0.3);
    strip.append(el);
    cards.push({ el, sec });
    const st = new Stage(c); st.resize(c.width, c.height);
    const r2 = new Renderer(st);
    r2.setSong(app.song);
    r2.sections = R.sections;
    r2.showFurniture = false; r2.grain = 0; r2.bloom = look.bloom; r2.chroma = 0;
    r2.soloStyle = sec;
    try { r2.renderFrame(thumbTime(sec)); } catch (e) { console.warn('thumb', sec[2], e); }
  });
}
function markActive() {}

/* ── ویرایش بخش‌ها ───────────────────────────────────────── */
const FX_CATS = {
  'پایه':    ['verse', 'chorus', 'pre', 'cold'],
  'حرکتی':   ['type', 'karaoke', 'wave', 'punch', 'split', 'stack'],
  'نمایشی':  ['neon', 'sh3d', 'slide', 'drop', 'shake', 'wipe', 'focus', 'breath', 'flip', 'underline', 'spot'],
  'بی‌کلام': ['intro', 'inst_a', 'inst_b', 'inst_c', 'mirror', 'end'],
};
const STYLES = Object.values(FX_CATS).flat();
const styleLabel = id => String(id).startsWith('cf:')
  ? (CSET.get(+id.slice(3))?.name || 'سفارشی') : (SECTION_NAMES[id] || id);

function sections() { return R.sections || (R.sections = SECT.map(s => s.slice())); }

/* ── تایم‌لاین ───────────────────────────────────────────── */
const TL = new Timeline(document.getElementById('tl'), {
  getSong: () => app.song,
  getSections: () => sections(),
  getTime: () => app.t,
  getDuration: () => app.duration,
  seek: v => seek(v),
  getTexts: () => texts,
  getLineFx: () => lineFx,
  label: id => styleLabel(id),
  onSelect: p => showClipBar(p),
  onChange: (done) => { if (done) { sortSections(); saveState(); buildStrip(); } draw(); },
});
const buildSecList = () => { TL.draw(); showClipBar(TL.sel); };

function sortSections() {
  const sel = sections()[TL.sel];
  sections().sort((x, y) => x[0] - y[0]);
  if (sel) TL.sel = sections().indexOf(sel);
  TL.draw();
}

const ACTS = {
  section: [['fx','✦','افکت'],['color','◐','رنگ'],['setA','⇤','شروع اینجا'],
            ['setB','⇥','پایان اینجا'],['split','⁄','تقسیم'],['del','🗑','حذف'],['close','✕','بستن']],
  line:    [['opts','⚙','تنظیمات'],['fx','✦','افکت'],['all','⇈','روی همه'],
            ['clear','↺','پیش‌فرض'],['close','✕','بستن']],
  text:    [['opts','⚙','تنظیمات'],['setA','⇤','شروع اینجا'],['setB','⇥','پایان اینجا'],
            ['dup','⧉','تکثیر'],['del','🗑','حذف'],['close','✕','بستن']],
};

function curPick() { return TL.pick; }
function pickedText() {
  const p = TL.pick;
  return p?.kind === 'text' ? texts.find(x => x.id === p.id) : null;
}

function showClipBar(p) {
  const bar = $('#clipBar');
  R.selText = p?.kind === 'text' ? p.id : null;
  if (!p) { bar.classList.add('hidden'); if (app.pane === 'clip') closePane(); draw(); return; }
  bar.classList.remove('hidden');
  sizePane();

  let name = '', time = '';
  if (p.kind === 'section') {
    const s = sections()[p.i]; if (!s) { bar.classList.add('hidden'); return; }
    name = styleLabel(s[2]); time = `${s[0].toFixed(1)} – ${s[1].toFixed(1)}s · ${(s[1]-s[0]).toFixed(1)}s`;
  } else if (p.kind === 'line') {
    const L = app.song?.lines[p.i]; if (!L) { bar.classList.add('hidden'); return; }
    name = L.text.slice(0, 18) + (L.text.length > 18 ? '…' : '');
    time = `خط ${faN(p.i + 1)}` + (lineFx[p.i] ? ' · تنظیم‌شده' : '');
  } else {
    const L = pickedText(); if (!L) { bar.classList.add('hidden'); return; }
    name = (L.text || 'متن').slice(0, 18);
    time = `${L.t0.toFixed(1)} – ${L.t1.toFixed(1)}s`;
  }
  $('#cbName').textContent = name;
  $('#cbTime').textContent = time;

  const host = $('#cbActs');
  host.innerHTML = '';
  for (const [act, ic, lb] of ACTS[p.kind]) {
    const b = document.createElement('button');
    b.className = 'cb'; b.dataset.act = act;
    b.innerHTML = `<i></i><b></b>`;
    b.querySelector('i').textContent = ic;
    b.querySelector('b').textContent = lb;
    b.onclick = () => clipAct(act);
    host.append(b);
  }
  if (app.pane === 'clip') buildClipPanel();
  draw();
}

function clipAct(act) {
  const p = TL.pick; if (!p) return;
  const s = p.kind === 'section' ? sections()[p.i] : null;
  const L = pickedText();
  switch (act) {
    case 'close': TL.choose(null); break;
    case 'opts': go('clip'); break;
    case 'fx':
      if (p.kind === 'line') { go('clip'); }
      else go('fx');
      break;
    case 'color': go('look'); break;
    case 'all': {
      const src = lineFx[p.i];
      if (!src) return;
      for (const l of app.song.lines) lineFx[l.i] = JSON.parse(JSON.stringify(src));
      saveState(); TL.draw(); draw();
      break;
    }
    case 'clear': delete lineFx[p.i]; saveState(); TL.draw(); draw(); buildClipPanel(); break;
    case 'setA':
      if (s) { if (app.t < s[1] - 0.4) { s[0] = +app.t.toFixed(2); sortSections(); } }
      else if (L && app.t < L.t1 - 0.3) L.t0 = +app.t.toFixed(2);
      saveState(); TL.draw(); showClipBar(p); draw(); break;
    case 'setB':
      if (s) { if (app.t > s[0] + 0.4) { s[1] = +app.t.toFixed(2); sortSections(); } }
      else if (L && app.t > L.t0 + 0.3) L.t1 = +app.t.toFixed(2);
      saveState(); TL.draw(); showClipBar(p); draw(); break;
    case 'split': {
      if (!s || app.t <= s[0] + 0.4 || app.t >= s[1] - 0.4) return;
      sections().splice(p.i + 1, 0, [+app.t.toFixed(2), s[1], s[2], s[3]]);
      s[1] = +app.t.toFixed(2);
      saveState(); sortSections(); buildStrip(); draw(); break;
    }
    case 'dup': {
      if (!L) return;
      const n = JSON.parse(JSON.stringify(L));
      n.id = newText(0).id; n.t0 = L.t1; n.t1 = L.t1 + (L.t1 - L.t0);
      texts.push(n); saveState(); TL.choose({ kind: 'text', id: n.id }); break;
    }
    case 'del': {
      if (s && sections().length > 1) { sections().splice(p.i, 1); }
      else if (L) { const i = texts.indexOf(L); if (i >= 0) texts.splice(i, 1); }
      TL.choose(null); saveState(); TL.draw(); buildStrip(); draw(); break;
    }
  }
}

/* ── پنل تنظیمات کلیپ ─────────────────────────────────────
   هر نوع کلیپ تنظیمات خودش را می‌گیرد — همان الگوی CapCut که
   با انتخاب هر چیز، پنل مربوط به همان ظاهر می‌شود. */
function row(label, el, valEl) {
  const d = document.createElement('div');
  d.className = 'ctl';
  const l = document.createElement('label'); l.textContent = label;
  d.append(l, el);
  if (valEl) d.append(valEl);
  return d;
}
function slider(min, max, step, val, fmt, on) {
  const i = document.createElement('input');
  i.type = 'range'; i.className = 'rng';
  i.min = min; i.max = max; i.step = step; i.value = val;
  const v = document.createElement('span');
  v.className = 'v'; v.textContent = fmt(val);
  i.oninput = () => { v.textContent = fmt(+i.value); on(+i.value); };
  return [i, v];
}

function buildClipPanel() {
  const host = $('#clBody');
  host.innerHTML = '';
  const p = TL.pick;
  if (!p) { $('#clHead').firstChild.textContent = 'تنظیمات'; return; }

  if (p.kind === 'line') {
    $('#clHead').firstChild.textContent = `خط ${faN(p.i + 1)}`;
    const fx = lineFx[p.i] || (lineFx[p.i] = {});
    const upd = () => { saveState(); TL.draw(); draw(); };

    // گالری افکت کوچک، مخصوص همین خط — با پیش‌نمایش متحرک
    POOL2.clear();
    const g = document.createElement('div');
    g.className = 'fxmini';
    const cur = fx.style || sections()[curSecIndex()]?.[2];
    const acc = fx.accent || sections()[curSecIndex()]?.[3] || C.CRIMSON;
    for (const id of allStyles()) {
      g.append(fxCard(POOL2, id, cur, acc, pick => { fx.style = pick; upd(); buildClipPanel(); }));
    }
    host.append(g);
    POOL2.observe($('#panes'));
    const L = app.song?.lines[p.i];
    POOL2.start(L ? L.words[0].t : app.t);

    const ac = document.createElement('input');
    ac.type = 'color'; ac.value = fx.accent || sections()[curSecIndex()]?.[3] || C.CRIMSON;
    ac.oninput = () => { fx.accent = ac.value; upd(); };
    host.append(row('رنگ', ac));

    host.append(row('اندازه', ...slider(50, 200, 1, Math.round((fx.scale ?? 1) * 100),
      v => v + '٪', v => { fx.scale = v / 100; upd(); })));
    host.append(row('شفافیت', ...slider(10, 100, 1, Math.round((fx.opacity ?? 1) * 100),
      v => v + '٪', v => { fx.opacity = v / 100; upd(); })));
    host.append(row('افقی', ...slider(-400, 400, 2, fx.dx || 0,
      v => String(v), v => { fx.dx = v; upd(); })));
    host.append(row('عمودی', ...slider(-400, 400, 2, fx.dy || 0,
      v => String(v), v => { fx.dy = v; upd(); })));
    return;
  }

  if (p.kind === 'text') {
    const L = pickedText(); if (!L) return;
    $('#clHead').firstChild.textContent = 'متن';
    const upd = () => { saveState(); TL.draw(); draw(); };

    const ta = document.createElement('input');
    ta.type = 'text'; ta.className = 'txt'; ta.value = L.text;
    ta.oninput = () => { L.text = ta.value; upd(); showClipBar(p); };
    host.append(row('متن', ta));

    const col = document.createElement('input');
    col.type = 'color'; col.value = L.color;
    col.oninput = () => { L.color = col.value; upd(); };
    host.append(row('رنگ', col));

    host.append(row('اندازه', ...slider(20, 300, 2, L.size, v => String(v), v => { L.size = v; upd(); })));
    host.append(row('شفافیت', ...slider(10, 100, 1, Math.round(L.opacity * 100),
      v => v + '٪', v => { L.opacity = v / 100; upd(); })));
    host.append(row('چرخش', ...slider(-45, 45, 1, L.rot, v => v + '°', v => { L.rot = v; upd(); })));
    host.append(row('افقی', ...slider(0, 100, 1, Math.round(L.x * 100),
      v => v + '٪', v => { L.x = v / 100; upd(); })));
    host.append(row('عمودی', ...slider(0, 100, 1, Math.round(L.y * 100),
      v => v + '٪', v => { L.y = v / 100; upd(); })));

    const sel = document.createElement('select');
    for (const [k, o] of Object.entries(TEXT_ANIM)) {
      const op = document.createElement('option');
      op.value = k; op.textContent = o.label;
      if (k === L.anim) op.selected = true;
      sel.append(op);
    }
    sel.onchange = () => { L.anim = sel.value; upd(); };
    host.append(row('ورود', sel));

    host.append(row('مدت ورود', ...slider(10, 150, 5, Math.round(L.dur * 100),
      v => (v / 100).toFixed(2), v => { L.dur = v / 100; upd(); })));

    const bo = document.createElement('label');
    bo.style.fontSize = '12px';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = L.bold;
    cb.onchange = () => { L.bold = cb.checked; upd(); };
    bo.append(cb, document.createTextNode(' ضخیم'));
    const ou = document.createElement('label');
    ou.style.fontSize = '12px';
    const cb2 = document.createElement('input');
    cb2.type = 'checkbox'; cb2.checked = L.outline;
    cb2.onchange = () => { L.outline = cb2.checked; upd(); };
    ou.append(cb2, document.createTextNode(' توخالی'));
    const r = document.createElement('div'); r.className = 'frow';
    r.append(bo, ou); host.append(r);
    return;
  }

  // بخش
  $('#clHead').firstChild.textContent = 'بخش';
  const s = sections()[p.i]; if (!s) return;
  const ac = document.createElement('input');
  ac.type = 'color'; ac.value = s[3] || C.CRIMSON;
  ac.oninput = () => { s[3] = ac.value; look.accents[p.i] = ac.value; saveState(); TL.draw(); draw(); };
  host.append(row('رنگ تأکید', ac));
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = 'برای تغییر افکت این بخش، دکمهٔ «افکت» را بزنید.';
  host.append(note);
}

$('#clAll').onclick = () => {
  const p = TL.pick;
  if (p?.kind === 'line' && lineFx[p.i]) {
    for (const l of app.song.lines) lineFx[l.i] = JSON.parse(JSON.stringify(lineFx[p.i]));
    saveState(); TL.draw(); draw();
  } else if (p?.kind === 'section') {
    const st = sections()[p.i][2];
    for (const x of sections()) x[2] = st;
    saveState(); TL.draw(); buildStrip(); draw();
  }
};
$('#clClear').onclick = () => {
  const p = TL.pick;
  if (p?.kind === 'line') { delete lineFx[p.i]; saveState(); TL.draw(); draw(); buildClipPanel(); }
};

$('#txtAdd').onclick = () => {
  const L = newText(app.t, Math.min(4, Math.max(1.5, app.duration - app.t)));
  texts.push(L);
  saveState();
  TL.choose({ kind: 'text', id: L.id });
  go('clip');
};

$('#zIn').onclick = () => TL.setZoom(1.5);
/* جا دادن: بخش انتخاب‌شده را کامل در صفحه می‌آورد تا دستگیره‌هایش
   در دسترس باشند. بدون انتخاب، کل آهنگ را نشان می‌دهد. */
$('#zFit').onclick = () => {
  const s = sections()[TL.sel];
  const w = TL.cssW || 360;
  if (s) {
    TL.pps = clampN((w - 60) / Math.max(0.5, s[1] - s[0]), 8, 260);
    seek((s[0] + s[1]) / 2);
  } else {
    TL.pps = clampN((w - 20) / Math.max(1, app.duration), 8, 260);
    seek(app.duration / 2);
  }
  TL.draw();
};
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
$('#zOut').onclick = () => TL.setZoom(1 / 1.5);
$('#secAuto').onclick = () => {
  if (!app.song) return;
  R.sections = autoSections(app.song.lines, app.duration);
  applyLook(); saveState(); TL.draw(); buildStrip(); draw();
};

/* ── ظاهر ────────────────────────────────────────────────── */
function curSecIndex() {
  const tbl = sections();
  for (let i = 0; i < tbl.length; i++) if (app.t >= tbl[i][0] && app.t < tbl[i][1]) return i;
  return 0;
}
function syncLook() {
  $('#lkGrain').value = Math.round(look.grain * 1000);
  $('#lkBloom').value = Math.round(look.bloom * 100);
  $('#lkChroma').value = Math.round(look.chroma * 10);
  $('#lkFurn').checked = look.furniture;
  $('#lkAccent').value = sections()[curSecIndex()]?.[3] || C.CRIMSON;
  $('#lkGrainV').textContent = faN(look.grain.toFixed(3));
  $('#lkBloomV').textContent = faN(look.bloom.toFixed(2));
  $('#lkChromaV').textContent = faN(look.chroma.toFixed(1));
}
$('#lkGrain').oninput = e => { look.grain = +e.target.value / 1000; applyLook(); saveLook(); syncLook(); draw(); };
$('#lkBloom').oninput = e => { look.bloom = +e.target.value / 100; applyLook(); saveLook(); syncLook(); draw(); };
$('#lkChroma').oninput = e => { look.chroma = +e.target.value / 10; applyLook(); saveLook(); syncLook(); draw(); };
$('#lkFurn').onchange = e => { look.furniture = e.target.checked; applyLook(); saveLook(); draw(); };
$('#lkAccent').oninput = e => {
  const i = curSecIndex();
  look.accents[i] = e.target.value;
  applyLook(); saveLook(); draw(); buildStrip();
};
$('#lkAccentAll').onclick = () => {
  const col = $('#lkAccent').value;
  sections().forEach((_, i) => { look.accents[i] = col; });
  applyLook(); saveLook(); draw(); buildStrip();
};
$('#lkReset').onclick = () => {
  look = DEFAULT_LOOK();
  R.sections = null; sections();
  applyLook(); saveLook(); syncLook(); buildSecList(); buildStrip(); draw();
};

/* ── جابه‌جایی کلمات ─────────────────────────────────────── */
let drag = null, lastPicked = null;
function refreshCount() {
  $('#edCount').textContent = faN(OV.count) + ' تغییر';
  $('#edHint').textContent = lastPicked
    ? `انتخاب‌شده: « ${lastPicked.word} » — بکشید یا از دکمه‌ها استفاده کنید`
    : 'روی یک کلمه بکشید تا جابه‌جا شود. کادرهای نقطه‌چین در خروجی نمی‌آیند.';
}
const pos = e => stage.toDesign((e.touches?.[0] ?? e).clientX, (e.touches?.[0] ?? e).clientY);

/* کشیدن لایهٔ متن روی خود بوم — مثل CapCut */
let txDrag = null;
canvas.addEventListener('pointerdown', e => {
  if (TL.pick?.kind === 'text') {
    const { x, y } = pos(e);
    const L = pickedText();
    if (L) {
      const b = layerBox(stage.ctx, L);
      if (Math.abs(x - b.cx) < b.w / 2 + 30 && Math.abs(y - b.cy) < b.h / 2 + 20) {
        txDrag = { L, x, y }; canvas.setPointerCapture?.(e.pointerId);
        e.preventDefault(); return;
      }
    }
  }
  if (app.pane !== 'words') return;
  const { x, y } = pos(e);
  const it = R.pickWord(app.t, x, y);
  if (!it) { R.selected = null; lastPicked = null; refreshCount(); draw(); return; }
  R.selected = it.id; lastPicked = it;
  drag = { id: it.id, x, y };
  canvas.classList.add('dragging');
  canvas.setPointerCapture?.(e.pointerId);
  refreshCount(); draw(); e.preventDefault();
});
canvas.addEventListener('pointermove', e => {
  if (txDrag) {
    const { x, y } = pos(e);
    const { W: dw, H: dh } = stageDims();
    txDrag.L.x = clampN((txDrag.L.x * dw + (x - txDrag.x)) / dw, 0, 1);
    txDrag.L.y = clampN((txDrag.L.y * dh + (y - txDrag.y)) / dh, 0, 1);
    txDrag.x = x; txDrag.y = y;
    draw(); e.preventDefault(); return;
  }
  if (!drag) return;
  const { x, y } = pos(e);
  OV.nudge(drag.id, x - drag.x, y - drag.y);
  drag.x = x; drag.y = y;
  draw(); e.preventDefault();
});
const endDrag = () => {
  if (txDrag) { txDrag = null; saveState(); buildClipPanel(); return; }
  if (!drag) return; drag = null; canvas.classList.remove('dragging'); OV.save(); refreshCount(); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

const scaleSel = k => {
  if (!R.selected) return;
  OV.setScale(R.selected, (OV.get(R.selected)?.scale ?? 1) * k);
  OV.save(); draw();
};
$('#edBigger').onclick = () => scaleSel(1.08);
$('#edSmaller').onclick = () => scaleSel(1 / 1.08);
$('#edReset').onclick = () => { if (R.selected) { OV.clear(R.selected); OV.save(); refreshCount(); draw(); } };
$('#edResetAll').onclick = () => {
  if (!OV.count || !confirm('همهٔ جابه‌جایی‌ها پاک شوند؟')) return;
  OV.clearAll(); OV.save(); R.selected = null; lastPicked = null; refreshCount(); draw();
};
$$('.nudge').forEach(b => {
  b.onclick = () => {
    if (!R.selected) return;
    const [dx, dy] = b.dataset.n.split(',').map(Number);
    OV.nudge(R.selected, dx, dy); OV.save(); draw();
  };
});

/* ── کتابخانهٔ پروژه ─────────────────────────────────────── */
function songMsg(t, cls = '') { $('#songMsg').textContent = t; $('#songMsg').className = 'msg ' + cls; }

async function buildProjList() {
  const host = $('#projList');
  host.innerHTML = '';
  const mk = (id, title, sub, removable, badge) => {
    const el = document.createElement('div');
    el.className = 'pcard' + (id === app.projectId ? ' on' : '');
    el.innerHTML = `<div class="pi"></div><div class="pm"><div class="pt"></div><div class="ps"></div></div>`;
    el.querySelector('.pi').textContent = badge;
    el.querySelector('.pt').textContent = title;
    el.querySelector('.ps').textContent = sub;
    el.onclick = async () => { await openProject(id); screen('editor'); closePane(); };
    if (removable) {
      const x = document.createElement('button');
      x.className = 'px'; x.textContent = '×';
      x.onclick = async ev => {
        ev.stopPropagation();
        if (!confirm('این پروژه حذف شود؟')) return;
        await Library.remove(id);
        if (app.projectId === id) await openProject('__demo');
        buildProjList();
      };
      el.append(x);
    }
    host.append(el);
  };
  mk('__demo', 'نقاب — زروان اکو', 'نمونهٔ همراه برنامه · ۳:۴۸ · ۱۶:۹', false, '۹:۱۶'.slice(0,0) || 'ن');
  let n = 1;
  try {
    for (const p of await Library.all()) {
      n++;
      const asp = p.aspect || '16:9';
      const sub = p.audio
        ? `${faN(Math.floor(p.duration / 60))}:${faN(String(Math.round(p.duration % 60)).padStart(2, '0'))} · ${faN(p.analysis.tempo.toFixed(0))} ضرب · ${asp}`
        : `بدون آهنگ · ${asp}`;
      mk(p.id, p.title || p.name, sub, true, (p.title || p.name || '؟').trim().charAt(0));
    }
  } catch (e) { console.warn(e); }
  $('#projCount').textContent = faN(n) + ' پروژه';
}

function setAspect(id) {
  const a = ASPECTS.find(x => x.id === id) || ASPECTS[0];
  setStageSize(a.w, a.h);
  clearLayoutCache(); clearGlyphCache();
  // قاب بلند به فضای بیشتری نیاز دارد
  document.getElementById('app').classList.toggle('portrait', a.h > a.w);
  return a;
}

async function openProject(id) {
  pause();
  clearLayoutCache(); clearGlyphCache();
  app.projectId = id;
  if (id === '__demo') {
    setAspect('16:9');
    const [lrc, an] = await Promise.all([
      fetch(`${BASE}data/lyrics.lrc`).then(r => r.text()),
      Analysis.load(`${BASE}data/analysis.json`),
    ]);
    app.song = new Song(parseLRC(lrc), an, { duration: DUR });
    app.duration = DUR;
    app.audioUrl = `${BASE}data/Neghab.mp3`;
    app.aspect = '16:9';
    R.sections = SECT.map(s => s.slice());
  } else {
    const p = await Library.get(id);
    if (!p) return;
    app.aspect = p.aspect || '16:9';
    setAspect(app.aspect);
    if (p.audio) {
      app.song = new Song(parseLRC(p.lrc || ''), new Analysis(p.analysis), {
        title: p.title || p.name, artist: p.artist || '', tg: p.tg || '', duration: p.duration,
      });
      app.duration = p.duration;
      app.audioUrl = URL.createObjectURL(p.audio);
      R.sections = p.sections ? p.sections.map(s => s.slice())
                              : autoSections(app.song.lines, p.duration);
    } else {
      // پروژهٔ خالی: هنوز آهنگی ندارد
      app.song = null; app.duration = 0; app.audioUrl = null; R.sections = null;
    }
  }
  // حالت این پروژه را بار کن — پروژهٔ تازه کاملاً دست‌نخورده است
  {
    const rec = app.projectId === '__demo' ? { id: '__demo' } : await Library.get(app.projectId);
    const st = readState(rec);
    look = Object.assign(DEFAULT_LOOK(), st.look || {});
    OV.setMap(JSON.parse(JSON.stringify(st.overrides || {})), saveState);
    if (st.sections?.length) R.sections = st.sections.map(x => x.slice());
    CSET.load(st.custom || (st.code ? [{ name: 'افکت من', code: st.code }] : null));
    cfIdx = 0;
    lineFx = JSON.parse(JSON.stringify(st.lineFx || {}));
    texts = JSON.parse(JSON.stringify(st.texts || []));
    R.lineFx = lineFx; R.texts = texts; R.selText = null;
  }
  R.selected = null; lastPicked = null;
  R.setSong(app.song);
  applyLook();
  app.audio = app.audioUrl ? new Audio(app.audioUrl) : null;
  if (app.audio) app.audio.preload = 'auto';
  app.t = 0;
  $('#tdur').textContent = faTime(app.duration || 0);
  $('#nowName').textContent = app.song?.title || (await currentMeta())?.title || 'پروژهٔ خالی';
  $('#noAudio').classList.toggle('hidden', !!app.song);
  buildStrip(); buildSecList(); buildProjList(); updateEstimate();
  fit(); draw();
}

async function currentMeta() {
  if (app.projectId === '__demo') {
    return { title: 'نقاب', artist: 'زروان اکو', tg: 'Telegram: @ZurvanEcho', aspect: '16:9' };
  }
  return await Library.get(app.projectId);
}

/* ── شیت پروژهٔ جدید ─────────────────────────────────────── */
let newAspect = '16:9';
function buildAspectPicker() {
  const host = $('#nwAspect');
  host.innerHTML = '';
  for (const a of ASPECTS) {
    const el = document.createElement('div');
    el.className = 'asp' + (a.id === newAspect ? ' on' : '');
    const bw = a.w >= a.h ? 26 : Math.round(26 * a.w / a.h);
    const bh = a.w >= a.h ? Math.round(26 * a.h / a.w) : 26;
    el.innerHTML = `<div class="box" style="width:${bw}px;height:${bh}px"></div>
      <div class="t"><b>${a.id}</b><span>${a.label.split('—')[1]?.trim() || ''}</span></div>`;
    el.onclick = () => { newAspect = a.id; buildAspectPicker(); };
    host.append(el);
  }
}
$('#newProj').onclick = () => {
  newAspect = '16:9'; buildAspectPicker();
  $('#nwName').value = ''; $('#nwArtist').value = ''; $('#nwTg').value = '';
  $('#sheet').classList.remove('hidden');
};
$('#sheetX').onclick = () => $('#sheet').classList.add('hidden');
$('#sheet').onclick = e => { if (e.target.id === 'sheet') $('#sheet').classList.add('hidden'); };

$('#nwGo').onclick = async () => {
  const name = ($('#nwName').value || 'پروژهٔ بی‌نام').trim();
  const proj = {
    id: 'p' + Date.now(), name,
    title: name,
    artist: ($('#nwArtist').value || '').trim(),
    tg: ($('#nwTg').value || '').trim(),
    aspect: newAspect,
    audio: null, lrc: '', analysis: null, duration: 0, sections: null,
    look: DEFAULT_LOOK(), overrides: {}, custom: null, lineFx: {}, texts: [],
    createdAt: Date.now(),
  };
  await Library.put(proj);
  $('#sheet').classList.add('hidden');
  await openProject(proj.id);
  screen('editor'); closePane();
  syncProject();
  $('#pjSheet').classList.remove('hidden');   // بلافاصله برای افزودن آهنگ
};

/* ── تب پروژه ────────────────────────────────────────────── */
async function syncProject() {
  const m = await currentMeta();
  if (!m) return;
  $('#pjTitle').value = m.title || m.name || '';
  $('#pjArtist').value = m.artist || '';
  $('#pjTg').value = m.tg || '';
  const sel = $('#pjAspect');
  if (!sel.options.length) {
    for (const a of ASPECTS) {
      const o = document.createElement('option');
      o.value = a.id; o.textContent = a.label;
      sel.append(o);
    }
  }
  sel.value = m.aspect || '16:9';
  const demo = app.projectId === '__demo';
  $('#pjSave').disabled = demo;
  $('#pjSave').textContent = demo ? 'نمونه قابل ویرایش نیست' : 'ذخیره';
  $('#projHead') && ($('#projHead').textContent = m.title || m.name || 'پروژه');
}

$('#pjSave').onclick = async () => {
  if (app.projectId === '__demo') return;
  const p = await Library.get(app.projectId);
  if (!p) return;
  p.title = ($('#pjTitle').value || p.name).trim();
  p.artist = ($('#pjArtist').value || '').trim();
  p.tg = ($('#pjTg').value || '').trim();
  const aspChanged = p.aspect !== $('#pjAspect').value;
  p.aspect = $('#pjAspect').value;
  await Library.put(p);
  $('#pjSheet').classList.add('hidden');
  if (aspChanged) await openProject(p.id);
  else {
    if (app.song) { app.song.title = p.title; app.song.artist = p.artist; app.song.tg = p.tg; }
    $('#nowName').textContent = p.title;
    buildStrip(); buildProjList(); draw();
  }
  $('#pjMsg').textContent = 'ذخیره شد';
  $('#pjMsg').className = 'msg ok';
};

/** افزودن یا تعویض آهنگ پروژهٔ فعلی */
async function attachAudio() {
  const af = $('#inAudio').files?.[0];
  const lf = $('#inLrc').files?.[0];
  if (!af && !lf) return;
  if (app.projectId === '__demo') { songMsg('نمونه قابل ویرایش نیست — اول یک پروژهٔ جدید بسازید', 'err'); return; }
  const p = await Library.get(app.projectId);
  if (!p) return;
  const bar = $('#songBar'); bar.classList.remove('hidden');
  const fill = bar.querySelector('i');
  try {
    if (af) {
      songMsg('در حال خواندن فایل…');
      const buf = await decodeAudioFile(af);
      p.analysis = await analyzeBuffer(buf, (q, m) => {
        fill.style.width = (q * 100).toFixed(0) + '%';
        songMsg(`${m} ${faN(Math.round(q * 100))}٪`);
      });
      p.audio = af;
      p.duration = buf.duration;
      p.sections = null;
    }
    if (lf) {
      let lrc = await lf.text();
      if (lrc && !/\[\d+:\d/.test(lrc)) lrc = plainToLines(lrc, p.duration || 60);
      p.lrc = lrc;
      p.sections = null;
    }
    if (p.audio && !p.sections) p.sections = autoSections(parseLRC(p.lrc || ''), p.duration);
    await Library.put(p);
    await openProject(p.id);
    songMsg(p.analysis
      ? `آماده — ${faN(p.analysis.tempo.toFixed(1))} ضرب در دقیقه · ${faN(p.analysis.beats.length)} ضرب · ${faN(app.song?.lines.length || 0)} خط`
      : 'شعر اضافه شد', 'ok');
  } catch (e) {
    console.error(e); songMsg('خطا: ' + e.message, 'err');
  } finally { bar.classList.add('hidden'); }
}
$('#inAudio').onchange = attachAudio;
$('#inLrc').onchange = attachAudio;

/* ── خروجی ───────────────────────────────────────────────── */
const resSel = $('#exRes');
RESOLUTIONS.forEach(r => {
  const o = document.createElement('option');
  o.value = r.id; o.textContent = r.label;
  if (r.id === '1080') o.selected = true;
  resSel.append(o);
});
const curRes = () => RESOLUTIONS.find(r => r.id === resSel.value) || RESOLUTIONS[2];

/* ابعاد خروجی از نسبت پروژه می‌آید، نه از فهرست ثابت ۱۶:۹.
   عدد رزولوشن (۱۰۸۰، ۷۲۰ …) را ضلع کوچک‌تر می‌گیریم: در قاب افقی
   یعنی ارتفاع و در قاب عمودی یعنی عرض — همان قراردادی که همه
   انتظار دارند. ابعاد باید زوج باشند وگرنه انکودر رد می‌کند. */
function outDims() {
  const { W: dw, H: dh } = stageDims();
  const k = (+curRes().id) / Math.min(dw, dh);
  return { w: Math.round(dw * k / 2) * 2, h: Math.round(dh * k / 2) * 2 };
}
const outW = () => outDims().w;
const outH = () => outDims().h;

function autoBitrate() {
  const fps = parseInt($('#exFps').value, 10);
  const d = outDims();
  // بیت‌ریت با تعداد پیکسل مقیاس می‌خورد، نه با نام رزولوشن
  const px = (d.w * d.h) / (1920 * 1080);
  const mbit = Math.round(12 * px * (fps >= 60 ? 1 : fps >= 30 ? 0.72 : 0.62));
  $('#exBr').value = String(Math.min(60, Math.max(1, mbit)));
  updateEstimate();
}
function updateEstimate() {
  const from = Math.max(0, parseFloat($('#exFrom').value) || 0);
  const to = Math.min(app.duration, parseFloat($('#exTo').value) || 0);
  const br = parseInt($('#exBr').value, 10) * 1e6;
  $('#exBrV').textContent = faN(br / 1e6) + ' مگابیت';
  const secs = Math.max(0, to - from);
  const el = $('#exEst');
  if (secs <= 0) { el.textContent = ''; return; }
  const mb = secs * (br + 224000) / 8 / 1048576;
  const d = outDims();
  el.textContent = `${d.w}×${d.h} · ${faN(parseInt($('#exFps').value, 10))} فریم · حدود ${faN(mb.toFixed(0))} مگابایت`;
  el.className = mb > 400 ? 'msg err' : mb > 180 ? 'msg warn' : 'msg';
  if (mb > 400) el.textContent += ' — ممکن است حافظه کم بیاورد، تکه‌تکه بگیرید';
}
['#exFrom', '#exTo', '#exBr'].forEach(id => { $(id).oninput = updateEstimate; });
['#exRes', '#exFps'].forEach(id => { $(id).onchange = autoBitrate; });
$('#exBrAuto').onclick = autoBitrate;
$$('[data-range]').forEach(b => {
  b.onclick = () => {
    const [a, z] = b.dataset.range.split(',').map(Number);
    $('#exFrom').value = a; $('#exTo').value = z; updateEstimate();
  };
});
$('#exAll').onclick = () => {
  $('#exFrom').value = 0; $('#exTo').value = Math.ceil(app.duration); updateEstimate();
};

let exAbort = null;
const setMsg = (t, cls = '') => { $('#exMsg').textContent = t; $('#exMsg').className = 'msg ' + cls; };

$('#exGo').onclick = async () => {
  const from = Math.max(0, parseFloat($('#exFrom').value) || 0);
  const to = Math.min(app.duration, parseFloat($('#exTo').value) || 0);
  if (!app.song) { setMsg('این پروژه هنوز آهنگ ندارد', 'err'); return; }
  if (to <= from) { setMsg('بازهٔ زمانی نامعتبر است', 'err'); return; }
  const cap = await canExport();
  if (!cap.ok) { setMsg('این دستگاه نمی‌تواند خروجی بگیرد: ' + cap.why, 'err'); return; }

  pause();
  $('#exShare')?.classList.add('hidden');
  exAbort = new AbortController();
  $('#exGo').classList.add('hidden');
  $('#exCancel').classList.remove('hidden');
  $('#exBar').classList.remove('hidden');
  const fill = $('#exBar').querySelector('i');
  try {
    const blob = await exportVideo({
      song: app.song, from, to,
      audioUrl: app.audioUrl,
      width: outW(), height: outH(),
      fps: parseInt($('#exFps').value, 10),
      bitrate: parseInt($('#exBr').value, 10) * 1e6,
      grain: look.grain, overrides: OV, sections: R.sections, customSet: CSET,
      lineFx, texts,
      look,
      signal: exAbort.signal,
      onProgress: p => {
        fill.style.width = (p.pct * 100).toFixed(1) + '%';
        if (p.phase === 'video') {
          setMsg(`فریم ${faN(p.done)} از ${faN(p.total)} · ${faN(p.fps.toFixed(1))} فریم بر ثانیه · `
               + `حدود ${faN(Math.ceil(p.eta))} ثانیه مانده`);
        } else if (p.phase === 'audio') setMsg('در حال افزودن صدا…');
      },
    });
    const mb = (blob.size / 1048576).toFixed(1);
    const name = `${(app.song.title || 'clip').replace(/\s+/g, '_')}_${from | 0}-${to | 0}_${curRes().id}p.mp4`;
    setMsg(`در حال ذخیره… (${faN(mb)} مگابایت)`);
    const res = await saveFile(blob, name, p => { fill.style.width = (p * 100).toFixed(0) + '%'; });
    if (res.where === 'browser') setMsg(`آماده شد — ${faN(mb)} مگابایت، در پوشهٔ Downloads`, 'ok');
    else if (res.where === 'downloads') setMsg(`✓ ذخیره شد در ${res.path} — ${faN(mb)} مگابایت`, 'ok');
    else setMsg(`${faN(mb)} مگابایت ساخته شد ولی در Downloads ذخیره نشد. از اشتراک‌گذاری استفاده کنید.`, 'warn');
    if (res.canShare && res.uri) {
      const sh = $('#exShare');
      sh.classList.remove('hidden');
      sh.onclick = () => shareFile(res.uri);
    }
  } catch (e) {
    console.error(e);
    setMsg('خطا: ' + e.message, 'err');
  } finally {
    $('#exGo').classList.remove('hidden');
    $('#exCancel').classList.add('hidden');
    exAbort = null;
  }
};
$('#exCancel').onclick = () => exAbort?.abort();

/* ── ویرایشگر شعر ────────────────────────────────────────── */
let syncTimes = [];     // زمان شروع هر خط در حالت هم‌زمان‌سازی

function lyricsText() {
  return (app.song?.lines || []).map(l => l.text).join('\n');
}
function syncMode(on) {
  $('#lyWritePane').classList.toggle('hidden', on);
  $('#lySyncPane').classList.toggle('hidden', !on);
  $('#lyWrite').classList.toggle('on', !on);
  $('#lySync').classList.toggle('on', on);
  if (on) { syncTimes = []; renderSync(); }
}
$('#lyWrite').onclick = () => syncMode(false);
$('#lySync').onclick = () => syncMode(true);

function syncLyricsPane() {
  const ta = $('#lyText');
  if (document.activeElement !== ta) ta.value = lyricsText();
  $('#syncTotal').textContent = faN(linesForSync().length);
  renderSync();
}
const linesForSync = () =>
  $('#lyText').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

/**
 * متن ساده + زمان خطوط ← LRC با زمان کلمه‌ای
 * زمان هر کلمه به نسبت طولش بین شروع این خط و خط بعد پخش می‌شود.
 */
function buildLrc(lines, times, duration) {
  const fmt = t => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  };
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const t0 = times[i];
    if (t0 == null) continue;
    const t1 = times[i + 1] ?? Math.min(duration, t0 + 4);
    const ws = lines[i].split(/\s+/).filter(Boolean);
    const span = Math.max(0.4, (t1 - t0) * 0.88);
    const tot = ws.reduce((p, w) => p + w.length + 1, 0);
    let acc2 = 0;
    const parts = ws.map(w => {
      const tt = t0 + (acc2 / tot) * span;
      acc2 += w.length + 1;
      return `<${fmt(tt)}>${w}`;
    });
    out.push(`[${fmt(t0)}]${parts.join(' ')}`);
  }
  return out.join('\n');
}

async function applyLyrics(lrc) {
  if (app.projectId === '__demo') {
    $('#lyMsg').textContent = 'نمونه قابل ویرایش نیست — یک پروژهٔ جدید بسازید';
    $('#lyMsg').className = 'msg err'; return;
  }
  const p = await Library.get(app.projectId);
  if (!p) return;
  p.lrc = lrc;
  p.sections = null;
  await Library.put(p);
  await openProject(p.id);
  go('lyrics');
  $('#lyMsg').textContent = `${faN(app.song?.lines.length || 0)} خط اعمال شد`;
  $('#lyMsg').className = 'msg ok';
}

$('#lyApply').onclick = () => {
  const ls = linesForSync();
  if (!ls.length) return;
  // بدون زمان‌بندی: یکنواخت روی طول آهنگ پخش می‌شود
  applyLyrics(plainToLines(ls.join('\n'), app.duration || 60));
};
$('#lyFromFile').onclick = () => $('#lyFile').click();
$('#lyFile').onchange = async e => {
  const f = e.target.files?.[0]; if (!f) return;
  const txt = await f.text();
  if (/\[\d+:\d/.test(txt)) { applyLyrics(txt); }
  else { $('#lyText').value = txt; $('#lyMsg').textContent = 'متن بارگذاری شد — «اعمال» را بزنید'; }
};

function renderSync() {
  const ls = linesForSync();
  $('#syncCount').textContent = faN(syncTimes.length);
  $('#syncTotal').textContent = faN(ls.length);
  $('#syncNow').textContent = syncTimes.length < ls.length
    ? ls[syncTimes.length] : '✓ تمام شد — «اعمال» را بزنید';
  const host = $('#syncList');
  host.innerHTML = '';
  for (let i = syncTimes.length - 1; i >= 0 && i > syncTimes.length - 7; i--) {
    const r = document.createElement('div');
    r.className = 'syncrow';
    r.innerHTML = `<span class="tt"></span><span class="tx"></span>`;
    r.querySelector('.tt').textContent = faTime(syncTimes[i]);
    r.querySelector('.tx').textContent = ls[i] || '';
    host.append(r);
  }
}
$('#syncTap').onclick = () => {
  const ls = linesForSync();
  if (syncTimes.length >= ls.length) {
    applyLyrics(buildLrc(ls, syncTimes, app.duration));
    return;
  }
  syncTimes.push(+app.t.toFixed(2));
  renderSync();
  if (syncTimes.length === ls.length) $('#syncTap').textContent = 'اعمال زمان‌بندی';
};
$('#syncUndo').onclick = () => { syncTimes.pop(); $('#syncTap').textContent = 'ثبت این خط'; renderSync(); };
$('#syncRestart').onclick = () => { syncTimes = []; $('#syncTap').textContent = 'ثبت این خط'; seek(0); renderSync(); };

/* ── گالری افکت با پیش‌نمایش زنده ────────────────────────── */
let fxCat = 'حرکتی';
function buildFxCats() {
  const host = $('#fxCats');
  host.innerHTML = '';
  for (const c of Object.keys(FX_CATS)) {
    const b = document.createElement('button');
    b.className = 'chip' + (c === fxCat ? ' on' : '');
    b.textContent = c;
    b.onclick = () => { fxCat = c; buildFxCats(); buildFxGrid(); };
    host.append(b);
  }
}
/** لحظه‌ای که پیش‌نمایش افکت واقعاً چیزی نشان می‌دهد.
    اگر همین الان خطی فعال نیست، به نزدیک‌ترین خط می‌پریم — وگرنه
    همهٔ کارت‌ها سیاه درمی‌آیند و مقایسه ممکن نیست. */
function fxPreviewTime() {
  const sg = app.song;
  if (!sg || !sg.lines.length) return app.t;
  if (sg.activeLine(app.t) >= 0) return app.t;
  let best = sg.lines[0], bd = Infinity;
  for (const L of sg.lines) {
    const d = Math.abs(L.words[0].t - app.t);
    if (d < bd) { bd = d; best = L; }
  }
  const span = Math.max(0.8, sg.lineOut(best.i) - sg.lineStart(best.i));
  return sg.lineStart(best.i) + span * 0.55;
}

const POOL = new PreviewPool();      // گالری تب افکت
const POOL2 = new PreviewPool();     // گالری کوچک داخل تنظیمات خط

/** همهٔ سبک‌های قابل انتخاب، شامل افکت‌های سفارشی */
const allStyles = () => Object.values(FX_CATS).flat().concat(CSET.styles().map(x => x.id));

/** یک کارت پیش‌نمایش می‌سازد و به استخر اضافه می‌کند */
function fxCard(pool, id, active, accent, onPick) {
  const { W: dw, H: dh } = stageDims();
  const tw = dh > dw ? 72 : 132;
  const el = document.createElement('div');
  el.className = 'fxcard' + (id === active ? ' on' : '');
  const c = document.createElement('canvas');
  c.width = tw; c.height = Math.round(tw * dh / dw);
  const lb = document.createElement('div');
  lb.className = 'fl'; lb.textContent = styleLabel(id);
  el.append(c, lb);
  el.onclick = () => onPick(id);
  pool.add({ canvas: c, style: id, song: app.song, accent, customSet: CSET });
  return el;
}

function buildFxGrid() {
  const host = $('#fxGrid');
  POOL.clear();
  host.innerHTML = '';
  if (!app.song) return;
  const i = curSecIndex();
  const sec = sections()[i];
  $('#fxFor').textContent = sec ? `بخش ${faN(i + 1)}` : '—';
  const acc = sec ? sec[3] : C.CRIMSON;
  for (const id of (FX_CATS[fxCat] || [])) {
    host.append(fxCard(POOL, id, sec?.[2], acc, pick => {
      if (!sec) return;
      sec[2] = pick; saveState(); TL.draw(); buildStrip(); buildFxGrid(); draw();
    }));
  }
  POOL.observe($('#panes'));
  POOL.start(fxPreviewTime());
}

function buildCfList() {
  const host = $('#cfList');
  host.innerHTML = '';
  const sec = sections()[curSecIndex()];
  CSET.list.forEach((f, i) => {
    const id = `cf:${i}`;
    const row = document.createElement('div');
    row.className = 'srow';
    const nm = document.createElement('div');
    nm.style.cssText = 'flex:1;font-size:12.5px;overflow:hidden;text-overflow:ellipsis';
    nm.textContent = f.name + (f.error ? ' ⚠' : '');
    const use = document.createElement('button');
    use.className = 'btn sm' + (sec && sec[2] === id ? ' primary' : ' ghost');
    use.textContent = sec && sec[2] === id ? 'فعال' : 'استفاده';
    use.onclick = () => { if (sec) { sec[2] = id; saveState(); buildSecList(); buildStrip(); buildCfList(); draw(); } };
    const ed = document.createElement('button');
    ed.className = 'btn sm ghost'; ed.textContent = 'ویرایش';
    ed.onclick = () => { cfIdx = i; go('code'); };
    row.append(nm, use, ed);
    host.append(row);
  });
}
$('#cfAdd').onclick = () => {
  cfIdx = CSET.add('افکت ' + faN(CSET.count + 1), DEFAULT_CODE);
  saveState(); buildCfList(); buildSecList(); go('code');
};

/* ── ادیتور کد ───────────────────────────────────────────── */
function curCf() { return CSET.get(cfIdx) || CSET.get(0); }
function syncCode() {
  const sel = $('#cdWhich');
  sel.innerHTML = '';
  CSET.list.forEach((f, i) => {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = f.name;
    if (i === cfIdx) o.selected = true;
    sel.append(o);
  });
  const sn = $('#cdSnip');
  if (sn.options.length <= 1) {
    for (const k of Object.keys(SNIPPETS)) {
      const o = document.createElement('option');
      o.value = k; o.textContent = k;
      sn.append(o);
    }
  }
  const f = curCf();
  $('#cdName').value = f.name;
  const ta = $('#cdText');
  if (ta.value !== f.code) ta.value = f.code;
  showCodeMsg();
}
function showCodeMsg() {
  const el = $('#cdMsg'), ta = $('#cdText'), f = curCf();
  if (f.error) { el.textContent = f.error; el.className = 'msg err'; ta.classList.add('bad'); return; }
  ta.classList.remove('bad');
  if (f.runtimeError) { el.textContent = 'خطای اجرا: ' + f.runtimeError; el.className = 'msg warn'; return; }
  const used = (R.sections || []).some(x => x[2] === `cf:${cfIdx}`);
  el.textContent = used ? 'سالم — روی بخش فعال اجرا می‌شود'
    : 'سالم — از تب «افکت» روی یک بخش بگذاریدش';
  el.className = 'msg ' + (used ? 'ok' : '');
}
$('#cdWhich').onchange = e => { cfIdx = +e.target.value; syncCode(); };
$('#cdName').oninput = e => { curCf().name = e.target.value || 'بی‌نام'; saveState(); buildSecList(); };
let codeTimer = 0;
$('#cdText').addEventListener('input', e => {
  clearTimeout(codeTimer);
  codeTimer = setTimeout(() => {
    curCf().compile(e.target.value);
    saveState(); draw(); showCodeMsg(); buildStrip();
  }, 350);
});
$('#cdReset').onclick = () => { curCf().compile(DEFAULT_CODE); $('#cdText').value = DEFAULT_CODE; saveState(); draw(); showCodeMsg(); };
$('#cdDel').onclick = () => {
  if (CSET.count <= 1) return;
  CSET.remove(cfIdx); cfIdx = 0; saveState(); syncCode(); buildSecList(); draw();
};
$('#cdCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('#cdText').value); setCdMsg('کپی شد', 'ok'); }
  catch { setCdMsg('مرورگر اجازهٔ کپی نداد', 'err'); }
};
$('#cdPaste').onclick = async () => {
  try {
    const txt = await navigator.clipboard.readText();
    if (!txt) return;
    $('#cdText').value = txt;
    curCf().compile(txt); saveState(); draw(); showCodeMsg();
  } catch { setCdMsg('مرورگر اجازهٔ خواندن حافظه نداد — دستی جای‌گذاری کنید', 'warn'); }
};
const setCdMsg = (t, c) => { $('#cdMsg').textContent = t; $('#cdMsg').className = 'msg ' + c; };
$('#cdSnip').onchange = e => {
  const k = e.target.value; if (!k) return;
  const ta = $('#cdText');
  ta.value = ta.value.trimEnd() + '\n\n' + SNIPPETS[k] + '\n';
  e.target.value = '';
  curCf().compile(ta.value); saveState(); draw(); showCodeMsg();
};

/* ── آموزش ───────────────────────────────────────────────── */
function buildLessons() {
  $('#lnBody').classList.add('hidden');
  $('#lnList').classList.remove('hidden');
  $('#lnHead').textContent = 'آموزش';
  const host = $('#lnList');
  if (host.childElementCount) return;
  for (const cat of CATEGORIES) {
    const items = LESSONS.filter(l => l.cat === cat);
    if (!items.length) continue;
    const h = document.createElement('div');
    h.className = 'lcat'; h.textContent = cat;
    const g = document.createElement('div');
    g.className = 'lgrid';
    for (const L of items) {
      const i = LESSONS.indexOf(L) + 1;
      const el = document.createElement('div');
      el.className = 'litem';
      el.innerHTML = `<div class="n"></div><div><div class="lt"></div><div class="lo"></div></div>`;
      el.querySelector('.n').textContent = faN(i);
      el.querySelector('.lt').textContent = L.title;
      el.querySelector('.lo').textContent = L.one;
      el.onclick = () => openLesson(L);
      g.append(el);
    }
    host.append(h, g);
  }
}
function openLesson(L) {
  const b = $('#lnBody');
  const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let html = `<h3>${esc(L.title)}</h3>`;
  html += `<div class="lvl">۱ · شهود</div><p class="big">${esc(L.one)}</p>`;
  html += `<div class="lvl">۲ · تشبیه</div><p>${esc(L.like)}</p>`;
  if (L.svg) html += L.svg;
  html += `<div class="lvl">۳ · ساز و کار</div><p>${esc(L.how)}</p>`;
  if (L.code) html += `<div class="lvl">۴ · کد</div><pre>${esc(L.code)}</pre>`;
  if (L.note) html += `<div class="nb">${esc(L.note)}</div>`;
  b.innerHTML = html;
  b.classList.remove('hidden');
  $('#lnList').classList.add('hidden');
  $('#lnHead').textContent = L.title;
  document.querySelector('.screen[data-screen="learn"] .scroll').scrollTop = 0;
}


/* ── رویدادهای عمومی ─────────────────────────────────────── */
$('#play').onclick = toggle;

window.addEventListener('resize', fit);
/* اندازهٔ صحنه ممکن است بدون رویداد resize عوض شود (چرخش، نوار
   مرورگر، باز شدن صفحه‌کلید). اندازه‌گیری فوری بعد از تغییر کلاس
   هم مقدار قدیمی می‌داد چون مرورگر هنوز چیدمان را دوباره نچیده
   بود. ناظر اندازه این هر دو را حل می‌کند. */
/** ارتفاع ثابت پنل: نه آن‌قدر کم که بی‌فایده شود، نه آن‌قدر زیاد
    که صحنه له شود. چون ثابت است، عوض کردن تب چیدمان را تکان
    نمی‌دهد — همان چیزی که قبلاً مشکل‌ساز بود. */
function sizePane() {
  const body = document.querySelector('.ebody');
  if (!body) return;
  const h = body.clientHeight;
  const chrome = 60 + 153 + ($('#clipBar').classList.contains('hidden') ? 0 : 58);
  const avail = Math.max(120, h - chrome - 110);   // ۱۱۰ = کمینهٔ صحنه
  const paneH = Math.round(Math.min(avail, Math.max(180, h * 0.40)));
  document.documentElement.style.setProperty('--paneH', paneH + 'px');
}

if (window.ResizeObserver) {
  new ResizeObserver(() => fit()).observe(document.getElementById('stagewrap'));
  new ResizeObserver(() => TL.resize()).observe(document.querySelector('.tlwrap'));
  new ResizeObserver(() => { sizePane(); }).observe(document.querySelector('.ebody'));
}
window.addEventListener('keydown', e => {
  if (app.pane === 'words' && R.selected && e.code.startsWith('Arrow')) {
    const s = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.code];
    if (d) { e.preventDefault(); OV.nudge(R.selected, d[0], d[1]); OV.save(); draw(); return; }
  }
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  if (e.code === 'ArrowRight') seek(app.t + (e.shiftKey ? 5 : 1 / 60));
  if (e.code === 'ArrowLeft') seek(app.t - (e.shiftKey ? 5 : 1 / 60));
});

/* ── راه‌اندازی ──────────────────────────────────────────── */
async function boot() {
  await loadFonts();
  applyLook();
  buildAspectPicker();
  await openProject('__demo');
  autoBitrate();
  $('#loading').classList.add('gone');
  closePane();
  screen('library');
  console.log('%c لیریک استودیو %c آماده',
    'background:#E4142A;color:#fff;padding:2px 6px;border-radius:3px', 'color:#9AA0AC');
}

window.__studio = {
  seek, play, pause, draw, go, screen, openProject,
  get app() { return app; },
  get song() { return app.song; },
  get time() { return app.t; },
  get renderer() { return R; },
  get tl() { return TL; },
  get lineFx() { return lineFx; },
  get texts() { return texts; },
  get overrides() { return OV; },
  get look() { return look; },
  exportVideo, canExport,
};
window.addEventListener('seek-test', e => seek(e.detail));

boot().catch(err => {
  console.error(err);
  $('#loading').textContent = 'خطا: ' + err.message;
});
