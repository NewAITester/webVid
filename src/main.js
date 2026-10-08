import { Stage } from './engine/stage.js';
import { Renderer } from './engine/renderer.js';
import { Analysis } from './engine/analysis.js';
import { parseLRC } from './engine/lyrics.js';
import { loadFonts, faTime } from './engine/text.js';
import { Song, SECT, SECTION_NAMES, DUR } from './engine/song.js';
import { DESIGN_W, DESIGN_H } from './engine/core.js';
import { exportVideo, canExport } from './engine/export.js';

const $ = s => document.querySelector(s);
const BASE = import.meta.env.BASE_URL;

const canvas = $('#stage');
const stage  = new Stage(canvas);
const R      = new Renderer(stage);

let song = null;
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
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  if (e.code === 'ArrowRight') seek(t + (e.shiftKey ? 5 : 1 / 60));
  if (e.code === 'ArrowLeft')  seek(t - (e.shiftKey ? 5 : 1 / 60));
});

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

document.querySelectorAll('[data-range]').forEach(b => {
  b.onclick = () => {
    const [a, z] = b.dataset.range.split(',').map(Number);
    $('#exFrom').value = a; $('#exTo').value = z;
  };
});

$('#exCancel').onclick = () => { exAbort?.abort(); };

$('#exGo').onclick = async () => {
  const from = Math.max(0, parseFloat($('#exFrom').value) || 0);
  const to = Math.min(DUR, parseFloat($('#exTo').value) || 0);
  if (to <= from) { setMsg('بازهٔ زمانی نامعتبر است', 'err'); return; }

  pause();
  exAbort = new AbortController();
  $('#exGo').classList.add('hidden');
  $('#exCancel').classList.remove('hidden');
  exBar.classList.remove('hidden');
  const fill = exBar.querySelector('i');

  try {
    const blob = await exportVideo({
      song,
      from, to,
      audioUrl: `${BASE}data/Neghab.mp3`,
      bitrate: parseInt($('#exQ').value, 10),
      grain: $('#exGrain').checked ? 0.024 : 0,
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neghab_${from.toFixed(0)}-${to.toFixed(0)}.mp4`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setMsg(`آماده شد — ${mb} مگابایت. دانلود شروع شد.`, 'ok');
  } catch (e) {
    console.error(e);
    setMsg('خطا: ' + e.message, 'err');
  } finally {
    $('#exGo').classList.remove('hidden');
    $('#exCancel').classList.add('hidden');
    exAbort = null;
  }
};

window.__studio = {
  seek, play, pause, draw,
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
