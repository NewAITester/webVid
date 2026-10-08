import { Stage } from './engine/stage.js';
import { Renderer } from './engine/renderer.js';
import { Analysis } from './engine/analysis.js';
import { parseLRC } from './engine/lyrics.js';
import { loadFonts, faTime } from './engine/text.js';
import { Song, SECT, SECTION_NAMES, DUR } from './engine/song.js';
import { DESIGN_W, DESIGN_H } from './engine/core.js';

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

window.__studio = {
  seek, play, pause, draw,
  get time() { return t; },
  get song() { return song; },
  get renderer() { return R; },
};
window.addEventListener('seek-test', e => seek(e.detail));

boot().catch(err => {
  console.error(err);
  $('#loading').textContent = 'خطا: ' + err.message;
});
