import { Stage } from './engine/stage.js';
import { Renderer } from './engine/renderer.js';
import { Analysis } from './engine/analysis.js';
import { parseLRC } from './engine/lyrics.js';
import { loadFonts, faTime } from './engine/text.js';
import { demoProject } from './engine/project.js';
import { DESIGN_W, DESIGN_H } from './engine/core.js';

const $ = s => document.querySelector(s);

const canvas = $('#stage');
const stage  = new Stage(canvas);
const R      = new Renderer(stage);

let project = demoProject();
let audio   = null;
let playing = false;
let t       = 0;
let raf     = 0;

/* ── اندازهٔ بوم: همیشه نسبت ۱۶:۹، با در نظر گرفتن DPI صفحه ─────── */
function fit() {
  const wrap = canvas.parentElement;
  const availW = wrap.clientWidth - 16;
  const availH = wrap.clientHeight - 16;
  const s = Math.min(availW / DESIGN_W, availH / DESIGN_H);
  const cssW = Math.max(160, DESIGN_W * s);
  const cssH = Math.max(90,  DESIGN_H * s);
  canvas.style.width  = cssW + 'px';
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
  if (t >= project.duration) { pause(); t = project.duration; }
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

/* ── نوار بخش‌ها: از هر بخش یک فریم نماینده ───────────────────── */
let cards = [];

/**
 * بهترین لحظه برای تصویر کوچک یک بخش.
 *
 * نمی‌شود کورکورانه وسط بخش را گرفت: ممکن است دقیقاً وسط محوشدن
 * ورود یک خط بیفتد و تصویر خالی دربیاید. پس اگر بخش متنی است،
 * دنبال خطی می‌گردیم که داخل بازه شروع شود و کمی بعد از شروعش
 * نمونه می‌گیریم — جایی که متن کاملاً ظاهر شده.
 */
function thumbTime(sec) {
  const mid = sec.t0 + (sec.t1 - sec.t0) * 0.4;
  const textual = sec.effect === 'wordReveal' || sec.effect === 'shatter';
  if (!textual) return mid;

  const L = R.lyrics.find(l => l.t >= sec.t0 && l.t < sec.t1 - 0.3);
  if (!L) return mid;

  // پاشیدن: وسط خود انفجار جالب‌ترین لحظه است
  if (sec.effect === 'shatter') {
    const pr = { hold: 0.85, burstDur: 1.15, ...(sec.params || {}) };
    return Math.min(L.t + pr.hold + pr.burstDur * 0.38, sec.t1 - 0.1);
  }
  // متن معمولی: کمی بعد از شروع خط تا چند کلمه رنگی شده باشند
  const span = Math.max(0.6, L.end - L.t);
  return Math.min(L.t + span * 0.55, sec.t1 - 0.15);
}

function buildStrip() {
  const strip = $('#strip');
  strip.innerHTML = '';
  cards = [];

  // رندرر جدا با بوم کوچک برای تصاویر کوچک
  for (const sec of project.sections) {
    const el = document.createElement('div');
    el.className = 'card';
    const c = document.createElement('canvas');
    c.width = 264; c.height = 148;
    const lb = document.createElement('div');
    lb.className = 'lb';
    lb.textContent = sec.name;
    el.append(c, lb);
    el.onclick = () => { seek(sec.t0 + 0.35); };
    strip.append(el);
    cards.push({ el, sec });

    // یک فریم از وسط بخش می‌کشیم
    const st = new Stage(c);
    st.resize(264, 148);
    const r2 = new Renderer(st);
    r2.setProject(project).setLyrics(R.lyrics).setAnalysis(R.analysis);
    r2.showFurniture = false;
    r2.soloSection = sec;
    r2.renderFrame(thumbTime(sec));
  }
}

function markActiveCard() {
  for (const c of cards) {
    const on = t >= c.sec.t0 && t < c.sec.t1;
    if (on !== c.el.classList.contains('on')) c.el.classList.toggle('on', on);
  }
}

function seek(v) {
  t = Math.max(0, Math.min(project.duration, v));
  if (audio) audio.currentTime = t;
  draw();
}

/* ── راه‌اندازی ──────────────────────────────────────────────── */
async function boot() {
  await loadFonts();

  const [lrcText, analysis] = await Promise.all([
    fetch(project.lyricsUrl).then(r => r.text()),
    Analysis.load(project.analysisUrl),
  ]);

  R.setProject(project)
   .setLyrics(parseLRC(lrcText))
   .setAnalysis(analysis);

  audio = new Audio(project.audio);
  audio.preload = 'auto';

  $('#scrub').max = String(project.duration);
  $('#tdur').textContent = faTime(project.duration);

  fit();
  buildStrip();
  draw();
  $('#loading').classList.add('gone');

  console.log(
    `%c لیریک استودیو %c ${R.lyrics.length} خط · ${analysis.beats.length} ضرب · ${analysis.tempo.toFixed(1)} BPM · ${analysis.key}`,
    'background:#E4142A;color:#fff;padding:2px 6px;border-radius:3px',
    'color:#9AA0AC'
  );
}

/* ── رویدادها ────────────────────────────────────────────────── */
$('#play').onclick = toggle;
$('#scrub').oninput = e => { if (playing) pause(); seek(parseFloat(e.target.value)); };
window.addEventListener('resize', fit);
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  if (e.code === 'ArrowRight') seek(t + (e.shiftKey ? 5 : 1 / 60));
  if (e.code === 'ArrowLeft')  seek(t - (e.shiftKey ? 5 : 1 / 60));
});

/* ── دریچهٔ دیباگ و تست خودکار ───────────────────────────────── */
window.__studio = {
  seek, play, pause, draw,
  get time() { return t; },
  get project() { return project; },
  get renderer() { return R; },
};
window.addEventListener('seek-test', e => seek(e.detail));

boot().catch(err => {
  console.error(err);
  $('#loading').textContent = 'خطا: ' + err.message;
});
