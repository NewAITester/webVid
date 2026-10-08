import { Stage } from './engine/stage.js';
import { Renderer } from './engine/renderer.js';
import { Analysis } from './engine/analysis.js';
import { parseLRC } from './engine/lyrics.js';
import { loadFonts, faTime } from './engine/text.js';
import { Song, SECT, SECTION_NAMES, DUR } from './engine/song.js';
import { DESIGN_W, DESIGN_H } from './engine/core.js';
import { exportVideo, canExport, RESOLUTIONS } from './engine/export.js';
import { saveFile, shareFile } from './engine/save.js';
import { Overrides } from './engine/overrides.js';

const $ = s => document.querySelector(s);
const BASE = import.meta.env.BASE_URL;

const canvas = $('#stage');
const stage  = new Stage(canvas);
const R      = new Renderer(stage);

let song = null;
const OV = Overrides.load();
R.overrides = OV;
let audio = null;
let playing = false;
let t = 0;
let raf = 0;

/* ── اندازهٔ بوم ─────────────────────────────────────────────── */
function fit() {
  const wrap = canvas.parentElement;
  const s = Math.min((wrap.clientWidth - 16) / DESIGN_W, (wrap.clientHeight - 16) / DESIGN_H);
  const cssW = Math.max(160, DESIGN_W * s);
  const cssH = Math.max(90, DESIGN_H * s);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  stage.resize(cssW * dpr, cssH * dpr);
  if (!playing) draw();
}

/* ── حلقهٔ رندر ──────────────────────────────────────────────── */
let frames = 0, lastFpsAt = performance.now();

function draw() {
  R.renderFrame(t);
  $('#tc').textContent = faTime(t);
  const sc = $('#scrub');
  if (document.activeElement !== sc) sc.value = String(t);
  markActiveCard();
  if (playing) {
    frames++;
    const now = performance.now();
    if (now - lastFpsAt > 500) {
      $('#fps').textContent = Math.round((frames * 1000) / (now - lastFpsAt)) + ' fps';
      frames = 0; lastFpsAt = now;
    }
  }
}

function loop() {
  if (!playing) return;
  t = audio ? audio.currentTime : t + 1 / 60;
  if (t >= DUR) { pause(); t = DUR; }
  draw();
  raf = requestAnimationFrame(loop);
}

function play() {
  if (playing) return;
  playing = true;
  $('#play').textContent = '❚❚';
  if (audio) { audio.currentTime = t; audio.play().catch(() => {}); }
  lastFpsAt = performance.now(); frames = 0;
  raf = requestAnimationFrame(loop);
}
function pause() {
  playing = false;
  $('#play').textContent = '▶';
  $('#fps').textContent = '—';
  audio?.pause();
  cancelAnimationFrame(raf);
}
const toggle = () => (playing ? pause() : play());

function seek(v) {
  t = Math.max(0, Math.min(DUR, v));
  if (audio) audio.currentTime = t;
  draw();
}

/* ── نوار بخش‌ها ─────────────────────────────────────────────── */
let cards = [];

/** لحظهٔ نماینده: جایی که محتوا واقعاً روی صفحه است */
function thumbTime(sec) {
  const [t0, t1, style] = sec;
  const mid = t0 + (t1 - t0) * 0.4;
  if (!['verse', 'chorus', 'pre', 'cold', 'mirror'].includes(style)) return mid;
  const L = song.lines.find(l => l.words[0].t >= t0 && l.words[0].t < t1 - 0.4);
  if (!L) return mid;
  const span = Math.max(0.8, song.lineOut(L.i) - song.lineStart(L.i));
  return Math.min(song.lineStart(L.i) + span * 0.5, t1 - 0.2);
}

function buildStrip() {
  const strip = $('#strip');
  strip.innerHTML = '';
  cards = [];
  SECT.forEach((sec, i) => {
    const el = document.createElement('div');
    el.className = 'card';
    const c = document.createElement('canvas');
    c.width = 264; c.height = 148;
    const lb = document.createElement('div');
    lb.className = 'lb';
    lb.textContent = SECTION_NAMES[sec[2]] || sec[2];
    el.append(c, lb);
    el.onclick = () => seek(sec[0] + 0.3);
    strip.append(el);
    cards.push({ el, sec });

    const st = new Stage(c);
    st.resize(264, 148);
    const r2 = new Renderer(st);
    r2.setSong(song);
    r2.showFurniture = false;
    r2.grain = 0;
    r2.bloom = 0.4;
    r2.soloStyle = sec;
    try { r2.renderFrame(thumbTime(sec)); } catch (e) { console.warn('thumb', sec[2], e); }
  });
}

function markActiveCard() {
  for (const c of cards) {
    const on = t >= c.sec[0] && t < c.sec[1];
    if (on !== c.el.classList.contains('on')) c.el.classList.toggle('on', on);
  }
}

/* ── راه‌اندازی ──────────────────────────────────────────────── */
async function boot() {
  await loadFonts();
  const [lrcText, analysis] = await Promise.all([
    fetch(`${BASE}data/lyrics.lrc`).then(r => r.text()),
    Analysis.load(`${BASE}data/analysis.json`),
  ]);

  song = new Song(parseLRC(lrcText), analysis);
  R.setSong(song);

  audio = new Audio(`${BASE}data/Neghab.mp3`);
  audio.preload = 'auto';

  $('#scrub').max = String(DUR);
  $('#tdur').textContent = faTime(DUR);

  fit();
  buildStrip();
  refreshCount();
  draw();
  $('#loading').classList.add('gone');

  console.log(
    `%c لیریک استودیو %c ${song.lines.length} خط · ${song.beats.length} ضرب · ${analysis.tempo.toFixed(1)} BPM · ${SECT.length} بخش`,
    'background:#E4142A;color:#fff;padding:2px 6px;border-radius:3px', 'color:#9AA0AC');
}

$('#play').onclick = toggle;
$('#scrub').oninput = e => { if (playing) pause(); seek(parseFloat(e.target.value)); };
window.addEventListener('resize', fit);
window.addEventListener('keydown', e => {
  // در حالت ویرایش، کلیدهای جهت کلمهٔ انتخاب‌شده را پیکسلی جابه‌جا می‌کنند
  if (editing && R.selected && e.code.startsWith('Arrow')) {
    const s = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.code];
    if (d) { e.preventDefault(); OV.nudge(R.selected, d[0], d[1]); OV.save(); draw(); return; }
  }
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  if (e.code === 'ArrowRight') seek(t + (e.shiftKey ? 5 : 1 / 60));
  if (e.code === 'ArrowLeft')  seek(t - (e.shiftKey ? 5 : 1 / 60));
});

/* ── جابه‌جایی دستی کلمات ────────────────────────────────────── */
const faN = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
let editing = false, drag = null;

function setEdit(on) {
  editing = on;
  R.editMode = on;
  $('#editBtn').classList.toggle('on', on);
  $('#edPanel').classList.toggle('hidden', !on);
  canvas.classList.toggle('editing', on);
  if (!on) { R.selected = null; drag = null; }
  draw();
}
$('#editBtn').onclick = () => setEdit(!editing);

function refreshCount() {
  $('#edCount').textContent = faN(OV.count) + ' تغییر';
  const it = R.selected;
  $('#edHint').textContent = it
    ? 'انتخاب‌شده: « ' + (lastPicked?.word || '') + ' » — بکشید یا از دکمه‌ها استفاده کنید'
    : 'روی یک کلمه بکشید تا جابه‌جا شود';
}

let lastPicked = null;

function pointerPos(e) {
  const p = e.touches?.[0] ?? e;
  return stage.toDesign(p.clientX, p.clientY);
}

canvas.addEventListener('pointerdown', e => {
  if (!editing) return;
  const { x, y } = pointerPos(e);
  const it = R.pickWord(t, x, y);
  if (!it) { R.selected = null; lastPicked = null; refreshCount(); draw(); return; }
  R.selected = it.id; lastPicked = it;
  drag = { id: it.id, x, y };
  canvas.classList.add('dragging');
  canvas.setPointerCapture?.(e.pointerId);
  refreshCount(); draw();
  e.preventDefault();
});

canvas.addEventListener('pointermove', e => {
  if (!editing || !drag) return;
  const { x, y } = pointerPos(e);
  OV.nudge(drag.id, x - drag.x, y - drag.y);
  drag.x = x; drag.y = y;
  draw();
  e.preventDefault();
});

function endDrag(e) {
  if (!drag) return;
  drag = null;
  canvas.classList.remove('dragging');
  OV.save();
  refreshCount();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

function scaleSel(k) {
  if (!R.selected) return;
  const cur = OV.get(R.selected)?.scale ?? 1;
  OV.setScale(R.selected, cur * k);
  OV.save(); refreshCount(); draw();
}
$('#edBigger').onclick = () => scaleSel(1.08);
$('#edSmaller').onclick = () => scaleSel(1 / 1.08);
$('#edReset').onclick = () => { if (R.selected) { OV.clear(R.selected); OV.save(); refreshCount(); draw(); } };
$('#edResetAll').onclick = () => {
  if (!OV.count || !confirm('همهٔ جابه‌جایی‌ها پاک شوند؟')) return;
  OV.clearAll(); OV.save(); R.selected = null; refreshCount(); draw();
};

/* ── خروجی گرفتن ─────────────────────────────────────────────── */
const exPanel = $('#exPanel'), exMsg = $('#exMsg'), exBar = $('#exBar');
let exAbort = null;

function setMsg(text, cls = '') { exMsg.textContent = text; exMsg.className = 'msg ' + cls; }

$('#exportBtn').onclick = async () => {
  exPanel.classList.toggle('hidden');
  if (!exPanel.classList.contains('hidden') && !exMsg.textContent) {
    const c = await canExport();
    setMsg(c.ok
      ? `آماده — تصویر ${c.video}${c.audio ? ' · صدا ' + c.audio : ' · بدون صدا'}`
      : 'این مرورگر نمی‌تواند خروجی بگیرد: ' + c.why, c.ok ? '' : 'err');
  }
};

// پر کردن فهرست رزولوشن‌ها
const resSel = $('#exRes');
RESOLUTIONS.forEach(r => {
  const o = document.createElement('option');
  o.value = r.id; o.textContent = r.label;
  if (r.id === '1080') o.selected = true;
  resSel.append(o);
});
const curRes = () => RESOLUTIONS.find(r => r.id === resSel.value) || RESOLUTIONS[2];

const faNum = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/** بیت‌ریت پیشنهادی بر اساس رزولوشن و نرخ فریم */
function autoBitrate() {
  const r = curRes();
  const fps = parseInt($('#exFps').value, 10);
  const mbit = Math.round((r.rec / 1e6) * (fps >= 60 ? 1 : fps >= 30 ? 0.72 : 0.62));
  $('#exBr').value = String(Math.min(60, Math.max(1, mbit)));
  updateEstimate();
}

/** برآورد حجم فایل قبل از شروع — تا غافلگیر نشوید */
function updateEstimate() {
  const from = Math.max(0, parseFloat($('#exFrom').value) || 0);
  const to = Math.min(DUR, parseFloat($('#exTo').value) || 0);
  const br = parseInt($('#exBr').value, 10) * 1e6;
  const r = curRes();
  const fps = parseInt($('#exFps').value, 10);
  const brv = $('#exBrV'); if (brv) brv.textContent = faNum(br / 1e6) + ' مگابیت';
  const secs = Math.max(0, to - from);
  const el = $('#exEst');
  if (!el) return;
  if (secs <= 0) { el.textContent = ''; return; }
  const mb = (secs * (br + 224000) / 8 / 1048576);
  el.textContent = `${r.w}×${r.h} · ${faNum(fps)} فریم · حدود ${faNum(mb.toFixed(0))} مگابایت`;
  // کل فایل در حافظه ساخته می‌شود، پس بالای ~۴۰۰ مگابایت روی گوشی خطرناک است
  el.className = mb > 400 ? 'msg err' : mb > 180 ? 'msg warn' : 'msg';
  if (mb > 400) el.textContent += ' — ممکن است حافظهٔ گوشی کم بیاورد، تکه‌تکه بگیرید';
}
['#exFrom', '#exTo', '#exBr'].forEach(id => {
  const e = $(id); if (e) { e.oninput = updateEstimate; e.onchange = updateEstimate; }
});
['#exRes', '#exFps'].forEach(id => { const e = $(id); if (e) e.onchange = autoBitrate; });
$('#exBrAuto').onclick = autoBitrate;
autoBitrate();

document.querySelectorAll('[data-range]').forEach(b => {
  b.onclick = () => {
    const [a, z] = b.dataset.range.split(',').map(Number);
    $('#exFrom').value = a; $('#exTo').value = z;
    updateEstimate();
  };
});

$('#exCancel').onclick = () => { exAbort?.abort(); };

$('#exGo').onclick = async () => {
  const from = Math.max(0, parseFloat($('#exFrom').value) || 0);
  const to = Math.min(DUR, parseFloat($('#exTo').value) || 0);
  if (to <= from) { setMsg('بازهٔ زمانی نامعتبر است', 'err'); return; }

  pause();
  $('#exShare')?.classList.add('hidden');
  exAbort = new AbortController();
  $('#exGo')?.classList.add('hidden');
  $('#exCancel')?.classList.remove('hidden');
  exBar.classList.remove('hidden');
  const fill = exBar.querySelector('i');

  try {
    const blob = await exportVideo({
      song,
      from, to,
      audioUrl: `${BASE}data/Neghab.mp3`,
      width: curRes().w, height: curRes().h,
      fps: parseInt($('#exFps').value, 10),
      bitrate: parseInt($('#exBr').value, 10) * 1e6,
      grain: $('#exGrain').checked ? 0.024 : 0,
      overrides: OV,
      signal: exAbort.signal,
      onProgress: p => {
        fill.style.width = (p.pct * 100).toFixed(1) + '%';
        if (p.phase === 'video') {
          setMsg(`فریم ${p.done} از ${p.total} · ${p.fps.toFixed(1)} فریم بر ثانیه · ` +
                 `حدود ${Math.ceil(p.eta)} ثانیه مانده`);
        } else if (p.phase === 'audio') setMsg('در حال افزودن صدا…');
      },
    });

    const mb = (blob.size / 1048576).toFixed(1);
    const name = `neghab_${from.toFixed(0)}-${to.toFixed(0)}_${curRes().id}p.mp4`;
    setMsg(`در حال ذخیره… (${mb} مگابایت)`);
    const res = await saveFile(blob, name, p => {
      fill.style.width = (p * 100).toFixed(0) + '%';
    });

    if (res.where === 'browser') {
      setMsg(`آماده شد — ${mb} مگابایت. در پوشهٔ Downloads ذخیره شد.`, 'ok');
    } else if (res.where === 'downloads') {
      setMsg(`✓ ذخیره شد در ${res.path} — ${mb} مگابایت`, 'ok');
    } else {
      setMsg(`${mb} مگابایت ساخته شد ولی در Downloads ذخیره نشد `
             + `(${res.warn || 'دلیل نامشخص'}). از دکمهٔ اشتراک‌گذاری استفاده کنید.`, 'warn');
    }
    if (res.canShare && res.uri) {
      const sh = $('#exShare');
      if (sh) { sh.classList.remove('hidden'); sh.onclick = () => shareFile(res.uri); }
    }
  } catch (e) {
    console.error(e);
    setMsg('خطا: ' + e.message, 'err');
  } finally {
    $('#exGo')?.classList.remove('hidden');
    $('#exCancel')?.classList.add('hidden');
    exAbort = null;
  }
};

window.__studio = {
  seek, play, pause, draw, setEdit,
  get overrides() { return OV; },
  get time() { return t; },
  get song() { return song; },
  get renderer() { return R; },
  exportVideo, canExport,
};
window.addEventListener('seek-test', e => seek(e.detail));

boot().catch(err => {
  console.error(err);
  $('#loading').textContent = 'خطا: ' + err.message;
});
