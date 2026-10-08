import { Stage } from './engine/stage.js';
import { Renderer } from './engine/renderer.js';
import { Analysis } from './engine/analysis.js';
import { parseLRC } from './engine/lyrics.js';
import { loadFonts, faTime } from './engine/text.js';
import { Song, SECT, SECTION_NAMES, DUR, C } from './engine/song.js';
import { DESIGN_W, DESIGN_H } from './engine/core.js';
import { clearLayoutCache } from './engine/layout.js';
import { clearGlyphCache } from './engine/glyphs.js';
import { exportVideo, canExport, RESOLUTIONS } from './engine/export.js';
import { saveFile, shareFile } from './engine/save.js';
import { Overrides } from './engine/overrides.js';
import { analyzeBuffer, decodeAudioFile } from './engine/analyze.js';
import { Library, autoSections, plainToLines } from './engine/library.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const BASE = import.meta.env.BASE_URL;
const faN = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

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
  pane: 'home',
};

const OV = Overrides.load();
R.overrides = OV;

const LOOK_KEY = 'lyricstudio.look.v1';
const look = Object.assign(
  { grain: 0.024, bloom: 0.55, chroma: 1.0, furniture: true, accents: {} },
  JSON.parse(localStorage.getItem(LOOK_KEY) || '{}')
);
const saveLook = () => localStorage.setItem(LOOK_KEY, JSON.stringify(look));

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
  const wrap = canvas.parentElement;
  if (!wrap.clientWidth) return;
  const s = Math.min((wrap.clientWidth - 12) / DESIGN_W, (wrap.clientHeight - 12) / DESIGN_H);
  const cw = Math.max(160, DESIGN_W * s), ch = Math.max(90, DESIGN_H * s);
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
  const sc = $('#scrub');
  if (document.activeElement !== sc) sc.value = String(app.t);
  markActive();
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
  app.playing = true;
  $('#play').textContent = '❚❚';
  if (app.audio) { app.audio.currentTime = app.t; app.audio.play().catch(() => {}); }
  lastFpsAt = performance.now(); frames = 0;
  app.raf = requestAnimationFrame(loop);
}
function pause() {
  app.playing = false;
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

/* ── ناوبری پایین ────────────────────────────────────────── */
function go(name) {
  app.pane = name;
  $$('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === name));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.go === name));
  const home = name === 'home';
  $('#stagewrap').classList.toggle('hide', home);
  $('#transport').classList.toggle('hide', home);
  $('#panes').classList.toggle('tall', home);
  // «کلمات» تنها جایی است که کادرها و درگ فعال‌اند
  R.editMode = name === 'words';
  canvas.classList.toggle('editing', name === 'words');
  if (home) pause(); else { fit(); draw(); }
  if (name === 'sections') buildSecList();
  if (name === 'look') syncLook();
  if (name === 'words') refreshCount();
}
$$('#nav button').forEach(b => { b.onclick = () => go(b.dataset.go); });

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
    c.width = 236; c.height = 132;
    const lb = document.createElement('div');
    lb.className = 'lb';
    lb.textContent = SECTION_NAMES[sec[2]] || sec[2];
    el.append(c, lb);
    el.onclick = () => seek(sec[0] + 0.3);
    strip.append(el);
    cards.push({ el, sec });
    const st = new Stage(c); st.resize(236, 132);
    const r2 = new Renderer(st);
    r2.setSong(app.song);
    r2.sections = R.sections;
    r2.showFurniture = false; r2.grain = 0; r2.bloom = look.bloom; r2.chroma = 0;
    r2.soloStyle = sec;
    try { r2.renderFrame(thumbTime(sec)); } catch (e) { console.warn('thumb', sec[2], e); }
  });
}
function markActive() {
  for (const c of cards) {
    const on = app.t >= c.sec[0] && app.t < c.sec[1];
    if (on !== c.el.classList.contains('on')) c.el.classList.toggle('on', on);
  }
}

/* ── ویرایش بخش‌ها ───────────────────────────────────────── */
const STYLES = ['intro', 'cold', 'inst_a', 'verse', 'pre', 'chorus', 'inst_b', 'inst_c', 'mirror', 'end'];

function sections() { return R.sections || (R.sections = SECT.map(s => s.slice())); }

function buildSecList() {
  const host = $('#secList');
  host.innerHTML = '';
  sections().forEach((sec, i) => {
    const row = document.createElement('div');
    row.className = 'srow';
    const sel = document.createElement('select');
    for (const st of STYLES) {
      const o = document.createElement('option');
      o.value = st; o.textContent = SECTION_NAMES[st] || st;
      if (st === sec[2]) o.selected = true;
      sel.append(o);
    }
    sel.onchange = () => { sec[2] = sel.value; buildStrip(); draw(); };
    const a = document.createElement('input');
    a.type = 'number'; a.step = '0.1'; a.value = sec[0].toFixed(1);
    const b = document.createElement('input');
    b.type = 'number'; b.step = '0.1'; b.value = sec[1].toFixed(1);
    const commit = () => {
      sec[0] = Math.max(0, parseFloat(a.value) || 0);
      sec[1] = Math.max(sec[0] + 0.5, parseFloat(b.value) || 0);
      sections().sort((x, y) => x[0] - y[0]);
      buildSecList(); buildStrip(); draw();
    };
    a.onchange = commit; b.onchange = commit;
    const jump = document.createElement('button');
    jump.className = 'jump'; jump.textContent = '▶'; jump.title = 'پرش';
    jump.onclick = () => seek(sec[0] + 0.3);
    const del = document.createElement('button');
    del.className = 'px'; del.textContent = '×';
    del.onclick = () => { sections().splice(i, 1); buildSecList(); buildStrip(); draw(); };
    row.append(jump, sel, a, b, del);
    host.append(row);
  });
}
$('#secAdd').onclick = () => {
  const t0 = +app.t.toFixed(1);
  sections().push([t0, Math.min(app.duration, t0 + 10), 'verse', C.CRIMSON]);
  sections().sort((x, y) => x[0] - y[0]);
  buildSecList(); buildStrip(); draw();
};
$('#secAuto').onclick = () => {
  R.sections = autoSections(app.song.lines, app.duration);
  applyLook(); buildSecList(); buildStrip(); draw();
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
  Object.assign(look, { grain: 0.024, bloom: 0.55, chroma: 1.0, furniture: true, accents: {} });
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

canvas.addEventListener('pointerdown', e => {
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
  if (!drag) return;
  const { x, y } = pos(e);
  OV.nudge(drag.id, x - drag.x, y - drag.y);
  drag.x = x; drag.y = y;
  draw(); e.preventDefault();
});
const endDrag = () => { if (!drag) return; drag = null; canvas.classList.remove('dragging'); OV.save(); refreshCount(); };
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
  const add = (id, title, sub, removable) => {
    const el = document.createElement('div');
    el.className = 'pcard' + (id === app.projectId ? ' on' : '');
    el.innerHTML = `<div class="pi">${(title || '؟').trim().charAt(0)}</div>
      <div class="pm"><div class="pt"></div><div class="ps"></div></div>`;
    el.querySelector('.pt').textContent = title;
    el.querySelector('.ps').textContent = sub;
    el.onclick = () => openProject(id);
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
  add('__demo', 'نقاب — زروان اکو', 'نمونهٔ همراه برنامه · ۳:۴۸', false);
  try {
    for (const p of await Library.all()) {
      const m = Math.floor(p.duration / 60), s = Math.round(p.duration % 60);
      add(p.id, p.title || p.name, `${faN(m)}:${faN(String(s).padStart(2, '0'))} · ${faN(p.analysis.tempo.toFixed(0))} ضرب`, true);
    }
  } catch (e) { console.warn(e); }
}

async function openProject(id) {
  pause();
  clearLayoutCache(); clearGlyphCache();
  if (id === '__demo') {
    const [lrc, an] = await Promise.all([
      fetch(`${BASE}data/lyrics.lrc`).then(r => r.text()),
      Analysis.load(`${BASE}data/analysis.json`),
    ]);
    app.song = new Song(parseLRC(lrc), an, { duration: DUR });
    app.duration = DUR;
    app.audioUrl = `${BASE}data/Neghab.mp3`;
    R.sections = SECT.map(s => s.slice());
  } else {
    const p = await Library.get(id);
    if (!p) return;
    app.song = new Song(parseLRC(p.lrc || ''), new Analysis(p.analysis), {
      title: p.title || p.name, artist: p.artist || '', tg: p.tg || '', duration: p.duration,
    });
    app.duration = p.duration;
    app.audioUrl = URL.createObjectURL(p.audio);
    R.sections = p.sections ? p.sections.map(s => s.slice())
                            : autoSections(app.song.lines, p.duration);
  }
  app.projectId = id;
  R.setSong(app.song);
  applyLook();
  app.audio = new Audio(app.audioUrl);
  app.audio.preload = 'auto';
  app.t = 0;
  $('#scrub').max = String(app.duration);
  $('#tdur').textContent = faTime(app.duration);
  $('#nowName').textContent = app.song.title || 'بدون نام';
  buildStrip(); buildSecList(); buildProjList(); updateEstimate(); draw();
}

$('#songGo').onclick = async () => {
  const af = $('#inAudio').files?.[0];
  if (!af) { songMsg('اول یک فایل صوتی انتخاب کنید', 'err'); return; }
  const bar = $('#songBar'); bar.classList.remove('hidden');
  const fill = bar.querySelector('i');
  try {
    songMsg('در حال خواندن فایل…');
    const buf = await decodeAudioFile(af);
    const analysis = await analyzeBuffer(buf, (p, m) => {
      fill.style.width = (p * 100).toFixed(0) + '%';
      songMsg(`${m} ${faN(Math.round(p * 100))}٪`);
    });
    let lrc = $('#inLrc').files?.[0] ? await $('#inLrc').files[0].text() : '';
    if (lrc && !/\[\d+:\d/.test(lrc)) lrc = plainToLines(lrc, buf.duration);
    const nm = af.name.replace(/\.[^.]+$/, '');
    const lines = parseLRC(lrc);
    const proj = {
      id: 'p' + Date.now(), name: nm, audio: af, lrc, analysis,
      duration: buf.duration,
      title: ($('#inTitle').value || nm).trim(),
      artist: ($('#inArtist').value || '').trim(),
      tg: ($('#inTg').value || '').trim(),
      sections: autoSections(lines, buf.duration),
      createdAt: Date.now(),
    };
    await Library.put(proj);
    await openProject(proj.id);
    songMsg(`آماده شد — ${faN(analysis.tempo.toFixed(1))} ضرب در دقیقه · `
          + `${faN(analysis.beats.length)} ضرب · ${faN(lines.length)} خط`, 'ok');
    go('sections');
  } catch (e) {
    console.error(e);
    songMsg('خطا: ' + e.message, 'err');
  } finally { bar.classList.add('hidden'); }
};

/* ── خروجی ───────────────────────────────────────────────── */
const resSel = $('#exRes');
RESOLUTIONS.forEach(r => {
  const o = document.createElement('option');
  o.value = r.id; o.textContent = r.label;
  if (r.id === '1080') o.selected = true;
  resSel.append(o);
});
const curRes = () => RESOLUTIONS.find(r => r.id === resSel.value) || RESOLUTIONS[2];

function autoBitrate() {
  const fps = parseInt($('#exFps').value, 10);
  const mbit = Math.round((curRes().rec / 1e6) * (fps >= 60 ? 1 : fps >= 30 ? 0.72 : 0.62));
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
  const r = curRes();
  el.textContent = `${r.w}×${r.h} · ${faN(parseInt($('#exFps').value, 10))} فریم · حدود ${faN(mb.toFixed(0))} مگابایت`;
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
      width: curRes().w, height: curRes().h,
      fps: parseInt($('#exFps').value, 10),
      bitrate: parseInt($('#exBr').value, 10) * 1e6,
      grain: look.grain, overrides: OV, sections: R.sections,
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

/* ── رویدادهای عمومی ─────────────────────────────────────── */
$('#play').onclick = toggle;
$('#scrub').oninput = e => { if (app.playing) pause(); seek(parseFloat(e.target.value)); };
window.addEventListener('resize', fit);
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
  await openProject('__demo');
  autoBitrate();
  $('#loading').classList.add('gone');
  go('home');
  console.log('%c لیریک استودیو %c آماده',
    'background:#E4142A;color:#fff;padding:2px 6px;border-radius:3px', 'color:#9AA0AC');
}

window.__studio = {
  seek, play, pause, draw, go, openProject,
  get app() { return app; },
  get song() { return app.song; },
  get time() { return app.t; },
  get renderer() { return R; },
  get overrides() { return OV; },
  get look() { return look; },
  exportVideo, canExport,
};
window.addEventListener('seek-test', e => seek(e.detail));

boot().catch(err => {
  console.error(err);
  $('#loading').textContent = 'خطا: ' + err.message;
});
