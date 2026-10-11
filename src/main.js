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
import { Library, autoSections, plainToLines, silentAnalysis } from './engine/library.js';
import { Timeline, TL_HEIGHT } from './ui/timeline.js';
import { PreviewPool } from './ui/previews.js';
import { newText, TEXT_ANIM, layerBox } from './engine/textlayers.js';
import { CustomSet, DEFAULT_CODE, SNIPPETS, remapCustomRefs, MAX_CUSTOM } from './engine/custom.js';
import { MediaPool } from './motion/media.js';
import { normalizeLayer, uid } from './motion/schema.js';
const KEY_PROPS = ['x', 'y', 'sc', 'rot', 'opacity'];   // دکمهٔ ◆ نوار کلیپ
import { sample, setKey } from './motion/tracks.js';
import * as OPS from './motion/ops.js';
import { MotionPanel } from './ui/motionpanel.js';
import { FFmpegPanel } from './ui/ffmpegpanel.js';
import { Lessons } from './ui/lessons.js';
import { MG_PRESETS, VIDEO_PRESETS, MG_LABELS, MIX, MIX_OPTS, MIX_DEFAULT, setMixes, mixOf, clearMixCache } from './engine/textfx3.js';
import { DRAW } from './engine/draw.js';
import { IDLE_FX, IDLE_IDS, drawIdle, idleWindow, IDLE_DEFAULT_OPT } from './engine/idlefx.js';
import { loadUserFonts, userFonts, pickFontFile, removeFont, setLyricFont } from './motion/fonts.js';
import { buildProjectFile, projectFromText } from './ui/projectio.js';

import { $, $$, faN } from './ui/dom.js';
const BASE = import.meta.env.BASE_URL;

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
  fx: { lyric: [], screen: [] },   // افکت‌های تصویری روی همهٔ شعرها / کل ویدیو
  lyricFont: null,                 // فونت شعر (شناسهٔ فونت کاربر) یا null = اصلی
  mixes: [],                       // سبک‌های موشن‌گرافی دلخواه کاربر [{id,name,o}]
  noGhost: false,                  // پیش‌نمایش کم‌رنگ کلمه‌ها قبل از خوانده شدن پنهان شود
  idle: [],                        // افکت‌های بین‌خوانی (وقتی آواز نیست) — چندتا با هم
  idleOpt: { ...IDLE_DEFAULT_OPT },
});
let look = DEFAULT_LOOK();

const OV = new Overrides({});
R.overrides = OV;

let lineFx = {};              // تنظیمات جداگانهٔ هر خط شعر
let texts = [];               // لایه‌های متن آزاد
let layers = [];              // لایه‌های موشن (مثل Alight Motion)
let selLayerId = null;        // لایهٔ موشن انتخاب‌شده
R.lineFx = lineFx; R.texts = texts; R.layers = layers;

/* عکس و ویدیوی لایه‌ها: فایل در IndexedDB، عنصر آماده در این استخر */
const MEDIA = new MediaPool();
MEDIA.onUpdate = () => { if (!app.playing) draw(); };
R.media = MEDIA;

const CSET = new CustomSet();
R.customSet = CSET;
let cfIdx = 0;                 // افکت سفارشی در حال ویرایش

/** حالت پروژهٔ نمونه جدا ذخیره می‌شود تا تغییراتتان بماند ولی سرایت نکند */
const DEMO_KEY = 'lyricstudio.demo.state.v2';

/** همهٔ حالت قابل ذخیرهٔ یک پروژه.
    باگ قدیمی: برای پروژه‌های غیرنمونه فقط look/overrides/sections
    برمی‌گشت؛ یعنی افکت‌های سفارشی، تنظیم خطوط و متن‌ها بعد از
    باز کردن دوباره پاک می‌شدند. */
function readState(p) {
  if (!p || p.id === '__demo') {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '{}'); } catch { return {}; }
  }
  const { look: lk, overrides, sections: sc, custom, code, lineFx: lf, texts: tx, layers: ly } = p;
  return { look: lk, overrides, sections: sc, custom, code, lineFx: lf, texts: tx, layers: ly };
}

const currentPayload = () => ({ look, overrides: OV.map, sections: R.sections,
  custom: CSET.toJSON(), lineFx, texts, layers });

/** حالت را روی برنامه بنشان (هنگام باز کردن پروژه و واگرد) */
function loadPayload(st) {
  look = Object.assign(DEFAULT_LOOK(), JSON.parse(JSON.stringify(st.look || {})));
  look.fx = { lyric: [], screen: [], ...(look.fx || {}) };
  OV.setMap(JSON.parse(JSON.stringify(st.overrides || {})), saveState);
  if (st.sections?.length) {
    R.sections = st.sections.map(x => x.slice());
    look.accents = {};       // رنگ هر بخش داخل خود جدول ذخیره شده است
  }
  CSET.load(st.custom || (st.code ? [{ name: 'افکت من', code: st.code }] : null));
  cfIdx = Math.min(cfIdx, Math.max(0, CSET.count - 1));
  lineFx = JSON.parse(JSON.stringify(st.lineFx || {}));
  texts = JSON.parse(JSON.stringify(st.texts || []));
  layers = (JSON.parse(JSON.stringify(st.layers || []))).map(normalizeLayer).filter(Boolean);
  R.lineFx = lineFx; R.texts = texts; R.layers = layers;
  if (selLayerId && !layers.some(L => L.id === selLayerId)) selLayerId = null;
  R.selLayer = selLayerId;
}

/* ── واگرد / ازنو ────────────────────────────────────────────
   هر ذخیره یک عکس فوری از کل حالت می‌گیرد. چون ذخیره با تأخیر
   انجام می‌شود، کشیدن‌های پشت سر هم یک قدم حساب می‌شوند. */
const HIST = { stack: [], i: -1, max: 60, lock: false };
function histReset() { HIST.stack = [JSON.stringify(currentPayload())]; HIST.i = 0; syncUndo(); }
function histPush() {
  if (HIST.lock) return;
  const snap = JSON.stringify(currentPayload());
  if (snap === HIST.stack[HIST.i]) return;
  HIST.stack.length = HIST.i + 1;
  HIST.stack.push(snap);
  if (HIST.stack.length > HIST.max) HIST.stack.shift();
  HIST.i = HIST.stack.length - 1;
  syncUndo();
}
function histGo(d) {
  const j = HIST.i + d;
  if (j < 0 || j >= HIST.stack.length) return;
  HIST.i = j;
  HIST.lock = true;
  loadPayload(JSON.parse(HIST.stack[j]));
  applyLook();
  HIST.lock = false;
  persist();
  refreshAll();
  syncUndo();
}
function syncUndo() {
  const u = $('#undoBtn'), r = $('#redoBtn');
  if (u) u.disabled = HIST.i <= 0;
  if (r) r.disabled = HIST.i >= HIST.stack.length - 1;
}
/** همه‌چیز را از نو بکش (بعد از واگرد) */
function refreshAll() {
  if (TL.pick?.kind === 'layer' && !layers.some(L => L.id === TL.pick.id)) TL.choose(null);
  else if (TL.pick?.kind === 'text' && !texts.some(L => L.id === TL.pick.id)) TL.choose(null);
  else showClipBar(TL.pick);
  if (app.pane === 'layers') MP.render();
  if (app.pane === 'look') syncLook();
  if (app.pane === 'clip') buildClipPanel();
  TL.draw(); buildStrip(); draw();
}

let saveTimer = 0;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { histPush(); persist(); }, 250);
}
async function persist() {
  {
    const payload = currentPayload();
    if (app.projectId === '__demo') {
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(payload)); } catch {}
      return;
    }
    const p = await Library.get(app.projectId);
    if (!p) return;
    Object.assign(p, payload);
    await Library.put(p);
  }
}
const saveLook = saveState;
let curLyricFont = null;

function applyLook() {
  R.grain = look.grain;
  R.bloom = look.bloom;
  R.chroma = look.chroma;
  R.showFurniture = look.furniture;
  R.globalFx = look.fx;
  setMixes(look.mixes || (look.mixes = []));
  DRAW.global = !!look.noGhost;
  R.idle = look.idle || (look.idle = []);
  R.idleOpt = look.idleOpt || (look.idleOpt = { ...IDLE_DEFAULT_OPT });
  if ((look.lyricFont || null) !== curLyricFont) {
    curLyricFont = look.lyricFont || null;
    setLyricFont(curLyricFont).then(() => { clearLayoutCache(); clearGlyphCache(); clearMixCache(); draw(); });
  }
  // رنگ‌های تأکید قدیمی فقط وقتی اعمال شوند که جدول بخش ذخیره نشده باشد؛
  // وگرنه رنگ هر بخش داخل خود جدول است و شماره‌ها ممکن است جابه‌جا شده باشند.
  if (!look.accents || !Object.keys(look.accents).length) return;
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
let frames = 0, lastFpsAt = performance.now(), lastTick = 0;

function draw() {
  if (!app.song) return;
  R.renderFrame(app.t);
  $('#tc').textContent = faTime(app.t);
  TL.draw();
  // مقدار ویژگی‌های پنل لایه با زمان عوض می‌شود (کی‌فریم‌ها)؛
  // در حین پخش هر ۱۵۰ میلی‌ثانیه یک بار کافی است.
  if (app.pane === 'layers' && selLayerId) {
    const now = performance.now();
    if (!app.playing || now - lastTick > 150) { lastTick = now; MP.tick(); }
  }

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
  if (rangeEnd != null && app.t >= rangeEnd) { rangeEnd = null; pause(); }
  if (app.t >= app.duration) { pause(); app.t = app.duration; }
  draw();
  app.raf = requestAnimationFrame(loop);
}
function play() {
  if (app.playing || !app.song) return;
  POOL.stop(); POOL2.stop(); POOL3.stop();
  app.playing = true;
  R.playing = true;
  $('#play').textContent = '❚❚';
  if (app.audio) { app.audio.currentTime = app.t; app.audio.play().catch(() => {}); }
  lastFpsAt = performance.now(); frames = 0;
  app.raf = requestAnimationFrame(loop);
}
function pause() {
  app.playing = false;
  R.playing = false;
  MEDIA.pauseAll();
  if (app.pane === 'fx') { POOL.start(fxPreviewTime(sections()[styleSecIndex()])); startIdleAnim(); }
  if (app.pane === 'clip') POOL2.start(app.t);
  $('#play').textContent = '▶';
  rangeEnd = null;
  $('#fps').textContent = '—';
  app.audio?.pause();
  cancelAnimationFrame(app.raf);
}
const toggle = () => (app.playing ? pause() : play());

/** پخش یک بازه و توقف در انتهایش (پیش‌نمایش انیمیشن ورود/خروج) */
let rangeEnd = null;
function playRange(t0, t1) {
  pause();
  seek(t0);
  rangeEnd = t1;
  play();
}
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
  if (name === 'learn') LS.list();
  else LS.stop();
  if (name === 'library') buildProjList();
}

function go(name, toggle = false) {
  // زدن دوبارهٔ همان تب = بستن پنل
  if (toggle && app.pane === name && $('#panes').classList.contains('open')) {
    closePane(); return;
  }
  if (name !== 'fx') { POOL.stop(); POOL3.stop(); }
  if (name !== 'clip') POOL2.stop();
  app.pane = name;
  $$('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === name));
  // «شعر» یک گروه است: متن و زمان، سبک نمایش، جای کلمات
  const navOf = { fx: 'lyrics', words: 'lyrics', code: 'lyrics' };
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.go === (navOf[name] || name)));
  $$('.subnav button').forEach(b => b.classList.toggle('on', b.dataset.goto === name));
  sizePane();
  $('#panes').classList.add('open');
  R.editMode = name === 'words';
  canvas.classList.toggle('editing', name === 'words');
  draw();

  if (name === 'look') { syncLook(); buildLookExtras(); }
  if (name === 'words') refreshCount();
  if (name === 'code') syncCode();
  if (name === 'clip') buildClipPanel();
  if (name === 'lyrics') syncLyricsPane();
  if (name === 'fx') { buildFxCats(); buildFxGrid(); buildCfList(); }
  if (name === 'layers') MP.render();
  if (name === 'export') FF.render();
}
$$('#nav button[data-go]').forEach(b => { b.onclick = () => go(b.dataset.go, true); });

function closePane() {
  POOL.stop(); POOL2.stop(); POOL3.stop();
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
  if (LS.open) { LS.list(); return; }
  screen(lessonReturn);
  lessonReturn = 'library';
};
let lessonReturn = 'library';     // آموزش از ویرایشگر باز شد؟ برگرد همان‌جا
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

/* ── ویرایش بخش‌ها ───────────────────────────────────────── */
const MINE = 'سبک‌های من';
const FX_CATS = {
  'استایل ویدیو': VIDEO_PRESETS.map(p => p.id),
  'موشن‌گرافی': MG_PRESETS.filter(p => !p.id.startsWith('vs_')).map(p => p.id),
  'پایه':    ['verse', 'chorus', 'pre', 'cold'],
  'حرکتی':   ['type', 'karaoke', 'wave', 'punch', 'split', 'stack'],
  'نمایشی':  ['neon', 'sh3d', 'slide', 'drop', 'shake', 'wipe', 'focus', 'breath', 'flip', 'underline', 'spot'],
  'بی‌کلام': ['intro', 'inst_a', 'inst_b', 'inst_c', 'mirror', 'end'],
  [MINE]: [],
};
const FAV = '⭐ پسندیده‌ها';
let favs = (() => { try { return JSON.parse(localStorage.getItem('fxFav') || '[]'); } catch { return []; } })();
const saveFavs = () => { try { localStorage.setItem('fxFav', JSON.stringify(favs)); } catch { /* حافظهٔ پر */ } };
let fxQuery = '';
const mixIds = () => (look.mixes || []).map(m => 'mx:' + m.id);
const catIds = c => {
  if (fxQuery) {
    const q = fxQuery.trim();
    return [...new Set(allStyles())].filter(id => styleLabel(id).includes(q) || String(id).includes(q));
  }
  if (c === FAV) return favs.filter(id => allStyles().includes(id));
  return c === MINE ? mixIds() : FX_CATS[c] || [];
};
const STYLES = Object.values(FX_CATS).flat();
const styleLabel = id => String(id).startsWith('cf:')
  ? (CSET.get(+id.slice(3))?.name || 'سفارشی')
  : String(id).startsWith('mx:') ? ('★ ' + (MIX.get(id.slice(3))?.name || 'سبک من'))
  : (MG_LABELS[id] || SECTION_NAMES[id] || id);

/** جدول پیش‌فرض بخش‌ها برای پروژهٔ فعلی */
function defaultSections() {
  if (app.projectId === '__demo') return SECT.map(s => s.slice());
  if (!app.song?.lines.length) return [[0, Math.max(1, app.duration), 'none', C.CRIMSON]];
  return autoSections(app.song.lines, app.duration);
}
function sections() { return R.sections || (R.sections = defaultSections()); }

/* ── تایم‌لاین ───────────────────────────────────────────── */
const TL = new Timeline(document.getElementById('tl'), {
  getSong: () => app.song,
  getSections: () => sections(),
  getTime: () => app.t,
  getDuration: () => app.duration,
  seek: v => seek(v),
  getTexts: () => texts,
  getLineFx: () => lineFx,
  getLayers: () => layers,
  label: id => styleLabel(id),
  onSelect: p => { showClipBar(p); if (app.pane === 'fx' && p?.kind === 'section') buildFxGrid(); },
  onKey: () => { if (app.pane === 'layers') MP.tick(); },
  onChange: (done) => {
    if (done) {
      sortSections(); saveState(); buildStrip();
      if (TL.pick?.kind === 'layer' || TL.pick?.kind === 'text') showClipBar(TL.pick);
    }
    draw();
  },
});
const buildSecList = () => { TL.draw(); showClipBar(TL.sel); };

function sortSections() {
  const sel = sections()[TL.sel];
  sections().sort((x, y) => x[0] - y[0]);
  if (sel) TL.sel = sections().indexOf(sel);
  TL.draw();
}

const ACTS = {
  section: [['fx','♪','سبک شعر'],['vfx','✨','افکت تصویری'],['color','◐','رنگ'],['setA','⇤','شروع اینجا'],
            ['setB','⇥','پایان اینجا'],['split','⁄','تقسیم'],['del','🗑','حذف'],['close','✕','بستن']],
  line:    [['opts','⚙','تنظیمات'],['vfx','✨','افکت تصویری'],['all','⇈','روی همه'],
            ['clear','↺','پیش‌فرض'],['close','✕','بستن']],
  text:    [['opts','⚙','تنظیمات'],['setA','⇤','شروع اینجا'],['setB','⇥','پایان اینجا'],
            ['dup','⧉','تکثیر'],['del','🗑','حذف'],['close','✕','بستن']],
  layer:   [['opts','⚙','ویرایش'],['key','◆','کی‌فریم'],['setA','⇤','شروع اینجا'],
            ['setB','⇥','پایان اینجا'],['split','⁄','تقسیم'],['dup','⧉','تکثیر'],
            ['del','🗑','حذف'],['close','✕','بستن']],
};
const pickedLayer = () => (TL.pick?.kind === 'layer' ? layers.find(L => L.id === TL.pick.id) : null);

function curPick() { return TL.pick; }
function pickedText() {
  const p = TL.pick;
  return p?.kind === 'text' ? texts.find(x => x.id === p.id) : null;
}

function showClipBar(p) {
  const bar = $('#clipBar');
  R.selText = p?.kind === 'text' ? p.id : null;
  const newSel = p?.kind === 'layer' ? p.id : null;
  if (newSel !== selLayerId) {
    selLayerId = newSel;
    R.selLayer = newSel;
    // انتخاب از روی تایم‌لاین: پنل لایه هم باید عوض شود
    if (app.pane === 'layers' && !mpSelecting) MP.render();
  }
  // نوار همیشه سر جایش است تا صفحه بالا و پایین نپرد؛ بدون انتخاب فقط راهنما نشان می‌دهد
  const empty = () => {
    bar.classList.add('empty');
    $('#cbName').textContent = 'چیزی انتخاب نشده';
    $('#cbTime').textContent = 'روی بخش، خط شعر یا لایه در تایم‌لاین بزنید';
    $('#cbActs').innerHTML = '';
  };
  if (!p) { empty(); if (app.pane === 'clip') closePane(); draw(); return; }
  bar.classList.remove('empty');
  sizePane();

  let name = '', time = '';
  if (p.kind === 'section') {
    const s = sections()[p.i]; if (!s) { empty(); return; }
    name = styleLabel(s[2]); time = `${s[0].toFixed(1)} – ${s[1].toFixed(1)}s · ${(s[1]-s[0]).toFixed(1)}s`;
  } else if (p.kind === 'line') {
    const L = app.song?.lines[p.i]; if (!L) { empty(); return; }
    name = L.text.slice(0, 18) + (L.text.length > 18 ? '…' : '');
    time = `خط ${faN(p.i + 1)}` + (lineFx[p.i] ? ' · تنظیم‌شده' : '');
  } else if (p.kind === 'layer') {
    const L = pickedLayer(); if (!L) { empty(); return; }
    name = L.name;
    time = `${L.t0.toFixed(1)} – ${L.t1.toFixed(1)}s`;
  } else {
    const L = pickedText(); if (!L) { empty(); return; }
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

/** کارهای نوار کلیپ برای لایهٔ موشن */
function layerAct(act, L) {
  const done = (keep = true) => { saveState(); TL.draw(); if (keep) showClipBar(TL.pick); if (app.pane === 'layers') MP.render(); draw(); };
  const lt = Math.max(0, Math.min(L.t1 - L.t0, app.t - L.t0));
  switch (act) {
    case 'opts': go('layers'); break;
    case 'key':
      // روی همهٔ ویژگی‌های تبدیل در این لحظه کی‌فریم بگذار
      for (const k of KEY_PROPS) {
        const tr = L.props[k];
        if (tr) setKey(tr, lt, sample(tr, lt));
      }
      done(); break;
    case 'setA': if (app.t < L.t1 - 0.1) OPS.trimStart(L, app.t); done(); break;
    case 'setB': if (app.t > L.t0 + 0.1) OPS.trimEnd(L, app.t); done(); break;
    case 'split': {
      const b = OPS.split(L, app.t);
      if (!b) return;
      layers.splice(layers.indexOf(L) + 1, 0, b);
      done(); break;
    }
    case 'dup': {
      const n = OPS.duplicate(L, L.t1 - L.t0);
      layers.splice(layers.indexOf(L) + 1, 0, n);
      TL.choose({ kind: 'layer', id: n.id }); done(); break;
    }
    case 'del': {
      layers.splice(layers.indexOf(L), 1);
      for (const x of layers) if (x.parent === L.id) x.parent = null;
      TL.choose(null); done(false); break;
    }
  }
}

function clipAct(act) {
  const p = TL.pick; if (!p) return;
  if (act === 'close') { TL.choose(null); return; }
  if (p.kind === 'layer') { const Lr = pickedLayer(); if (Lr) layerAct(act, Lr); return; }
  const s = p.kind === 'section' ? sections()[p.i] : null;
  const L = pickedText();
  switch (act) {
    case 'close': TL.choose(null); break;
    case 'opts': go('clip'); break;
    case 'vfx': go('clip'); setTimeout(() => $('#clBody .vfxbox')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); break;
    case 'fx':
      if (p.kind === 'line') { go('clip'); }
      else go('fx');
      break;
    case 'color': go('clip'); break;
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
    if (L) ghostBox(host, fx, L, upd);
    if (L) vfxBox(host, fx.vfx || (fx.vfx = { lyric: [], screen: [] }), 'lfx' + p.i,
      app.song.lineStart(p.i), app.song.lineOut(p.i), 'همین خط');
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
  ac.oninput = () => { s[3] = ac.value; saveState(); TL.draw(); draw(); };
  host.append(row('رنگ تأکید', ac));
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = 'سبک این بخش: ' + styleLabel(s[2]) + '. با دکمهٔ زیر عوضش کنید — همهٔ خط‌های شعرِ همین بازه با آن تغییر شکل می‌دهند. افکت‌های تصویری پایین همین صفحه‌اند.';
  host.append(note);
  const sb = document.createElement('button');
  sb.className = 'btn sm';
  sb.textContent = '♪ انتخاب استایل برای همین بخش';
  sb.onclick = () => go('fx');
  host.append(sb);
  const gs = document.createElement('select');
  const sv = s[4]?.noGhost;
  for (const [v, lb] of [['', 'مثل کل ویدیو'], ['show', 'نشان بده'], ['hide', 'پنهان کن']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = lb;
    if ((sv === true && v === 'hide') || (sv === false && v === 'show') || ((sv === undefined || sv === null) && v === '')) o.selected = true;
    gs.append(o);
  }
  gs.onchange = () => {
    s[4] ||= { lyric: [], screen: [] };
    if (gs.value === '') delete s[4].noGhost; else s[4].noGhost = gs.value === 'hide';
    saveState(); draw();
  };
  host.append(row('کلمه‌های نخوانده', gs));
  const is = document.createElement('select');
  const iv = s[4]?.idle;
  for (const [v, lb] of [['', 'مثل کل ویدیو'], ['off', 'خاموش در این بخش'], ['own', 'ویژهٔ این بخش…']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = lb;
    if ((v === '' && !Array.isArray(iv)) || (v === 'off' && Array.isArray(iv) && !iv.length) || (v === 'own' && iv?.length)) o.selected = true;
    is.append(o);
  }
  is.onchange = () => {
    s[4] ||= { lyric: [], screen: [] };
    if (is.value === '') delete s[4].idle;
    else if (is.value === 'off') s[4].idle = [];
    else { s[4].idle = (look.idle || []).slice(); go('fx'); setTimeout(() => { const f = $('#idFold'); if (f) { f.open = true; f.scrollIntoView({ block: 'nearest' }); } }, 60); }
    saveState(); draw();
  };
  host.append(row('بین‌خوانی', is));
  vfxBox(host, s[4] || (s[4] = { lyric: [], screen: [] }), 'sfx' + s[0], s[0], s[1], 'همین بخش');
}

/**
 * جعبهٔ «افکت تصویری» برای یک بخش، یک خط یا کل پروژه.
 * set = { lyric:[…], screen:[…] }؛ هر کدام همان افکت‌های لایه‌ها.
 */
const vfxTarget = {};
function vfxBox(host, set, id, t0, t1, scope, rebuild = buildClipPanel) {
  const box = document.createElement('div');
  box.className = 'vfxbox';
  const which = vfxTarget[id] || 'lyric';
  const head = document.createElement('div');
  head.className = 'shead sm';
  head.textContent = `✨ افکت تصویری — ${scope}`;
  const seg = document.createElement('div');
  seg.className = 'seg';
  for (const [k, lb, sub] of [['lyric', 'روی شعر', 'فقط کلمه‌های شعر'], ['screen', 'روی کل تصویر', 'شعر + پس‌زمینه + لایه‌ها']]) {
    const b = document.createElement('button');
    b.className = which === k ? 'on' : '';
    b.innerHTML = '<b></b><small></small>';
    b.querySelector('b').textContent = lb + (set[k]?.length ? ` (${faN(set[k].length)})` : '');
    b.querySelector('small').textContent = sub;
    b.onclick = () => { vfxTarget[id] = k; rebuild(); };
    seg.append(b);
  }
  const body = document.createElement('div');
  body.className = 'ibody';
  box.append(head, seg, body);
  host.append(box);
  const target = { id, t0, t1, effects: set[which] || (set[which] = []) };
  MP.fxEditor(body, target, () => {
    set[which] = target.effects;
    saveState(); TL.draw(); draw(); rebuild();
  });
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

/* بخش تازه: بخشِ زیر نشانگر را همان‌جا دو تکه می‌کند؛ اگر نشانگر
   بیرون از همهٔ بخش‌ها باشد، فاصلهٔ خالی را پر می‌کند. (قبلاً این دکمه
   هیچ کاری نمی‌کرد.) */
$('#secAdd').onclick = () => {
  if (!app.song) return;
  const tbl = sections(), t = +app.t.toFixed(2);
  const i = tbl.findIndex(s => t >= s[0] && t < s[1]);
  if (i >= 0) {
    const s = tbl[i];
    if (t <= s[0] + 0.4 || t >= s[1] - 0.4) return;
    tbl.splice(i + 1, 0, [t, s[1], s[2], s[3]]);
    s[1] = t;
    TL.choose({ kind: 'section', i: i + 1 });
  } else {
    const end = Math.min(app.duration, ...tbl.filter(s => s[0] > t).map(s => s[0]), t + 8);
    if (end - t < 0.4) return;
    tbl.push([t, +end.toFixed(2), 'none', C.CRIMSON]);
    sortSections();
    TL.choose({ kind: 'section', i: tbl.findIndex(s => s[0] === t) });
  }
  saveState(); TL.draw(); buildStrip(); draw();
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
/** بخشی که سبک رویش اعمال می‌شود: بخش انتخاب‌شده در تایم‌لاین، وگرنه بخش زیر نشانگر */
function styleSecIndex() {
  const p = TL.pick;
  if (p?.kind === 'section' && sections()[p.i]) return p.i;
  return curSecIndex();
}
/** سبک یک بخش را عوض کن — همهٔ خط‌های داخل آن بازه هم همین سبک را می‌گیرند */
const hasOwnBg = id => { const o = mixOf(id); return !!(o?.bg && o.bg !== 'none'); };
const secBg = sec => sec?.[4]?.bg ?? null;
function applySecStyle(sec, id) {
  if (!sec) return;
  sec[2] = id;
  // استایل ویدیو (پس‌زمینه‌دار) پس‌زمینهٔ بخش را تعیین می‌کند؛ سبک متنی فقط متن را
  // عوض می‌کند و پس‌زمینهٔ انتخاب‌شده سر جایش می‌ماند.
  if (hasOwnBg(id)) (sec[4] ||= { lyric: [], screen: [] }).bg = id;
  for (const l of app.song?.lines || []) {
    const t0 = l.words[0]?.t ?? -1;
    if (t0 >= sec[0] && t0 < sec[1] && lineFx[l.i]?.style) {
      delete lineFx[l.i].style;
      if (!Object.keys(lineFx[l.i]).length) delete lineFx[l.i];
    }
  }
  // اگر نشانگر بیرون این بخش است، ببرش داخل تا تغییر را همان لحظه ببینید
  if (app.t < sec[0] || app.t >= sec[1]) {
    const first = (app.song?.lines || []).find(l => l.words[0]?.t >= sec[0] && l.words[0]?.t < sec[1]);
    seek(first ? first.words[0].t + 0.6 : sec[0] + 0.05);
  }
  saveState(); TL.draw(); buildStrip(); draw();
}
function curSecIndex() {
  const tbl = sections();
  for (let i = 0; i < tbl.length; i++) if (app.t >= tbl[i][0] && app.t < tbl[i][1]) return i;
  return 0;
}
/** زبانهٔ «کل ویدیو»: فونت شعر و افکت‌های کل پروژه */
function buildLookExtras() {
  const fh = $('#lkFont');
  fh.innerHTML = '';
  const sel = document.createElement('select');
  const opts = [['', 'IRANSansX (اصلی)'], ...userFonts.map(f => [f.id, f.name])];
  for (const [v, lb] of opts) {
    const o = document.createElement('option'); o.value = v; o.textContent = lb;
    if ((look.lyricFont || '') === v) o.selected = true;
    sel.append(o);
  }
  sel.onchange = () => { look.lyricFont = sel.value || null; applyLook(); saveLook(); };
  const add = document.createElement('button');
  add.className = 'btn sm ghost'; add.textContent = '＋ افزودن فونت';
  add.onclick = async () => {
    const id = await pickFontFile();
    if (id) { look.lyricFont = id.slice(2); applyLook(); saveLook(); buildLookExtras(); }
  };
  const del = document.createElement('button');
  del.className = 'btn sm ghost'; del.textContent = 'حذف این فونت';
  del.disabled = !look.lyricFont;
  del.onclick = async () => {
    if (!look.lyricFont || !confirm('این فونت از برنامه حذف شود؟')) return;
    await removeFont(look.lyricFont); look.lyricFont = null; applyLook(); saveLook(); buildLookExtras();
  };
  const r = document.createElement('div'); r.className = 'frow btns';
  r.append(sel, add, del);
  fh.append(r);
  const n = document.createElement('p'); n.className = 'note';
  n.textContent = 'فونت ttf، otf یا woff از گوشی. یک بار که اضافه کنید، در همهٔ پروژه‌ها و در فهرست فونت لایه‌های متن هم هست.';
  fh.append(n);

  const xh = $('#lkFx');
  xh.innerHTML = '';
  vfxBox(xh, look.fx, 'gfx', 0, app.duration || 1e4, 'کل پروژه', buildLookExtras);
}

function syncLook() {
  $('#lkGrain').value = Math.round(look.grain * 1000);
  $('#lkBloom').value = Math.round(look.bloom * 100);
  $('#lkChroma').value = Math.round(look.chroma * 10);
  $('#lkFurn').checked = look.furniture;
  $('#lkGhost').checked = !look.noGhost;
  $('#lkAccent').value = sections()[curSecIndex()]?.[3] || C.CRIMSON;
  $('#lkGrainV').textContent = faN(look.grain.toFixed(3));
  $('#lkBloomV').textContent = faN(look.bloom.toFixed(2));
  $('#lkChromaV').textContent = faN(look.chroma.toFixed(1));
}
$('#lkGrain').oninput = e => { look.grain = +e.target.value / 1000; applyLook(); saveLook(); syncLook(); draw(); };
$('#lkBloom').oninput = e => { look.bloom = +e.target.value / 100; applyLook(); saveLook(); syncLook(); draw(); };
$('#lkChroma').oninput = e => { look.chroma = +e.target.value / 10; applyLook(); saveLook(); syncLook(); draw(); };
$('#lkGhost').onchange = e => { look.noGhost = !e.target.checked; applyLook(); saveLook(); draw(); if (app.pane === 'fx') buildFxGrid(); };
$('#fxGhost').onchange = e => { look.noGhost = !e.target.checked; applyLook(); saveLook(); draw(); const g = $('#lkGhost'); if (g) g.checked = e.target.checked; };
$('#lkFurn').onchange = e => { look.furniture = e.target.checked; applyLook(); saveLook(); draw(); };
$('#lkAccent').oninput = e => {
  const s = sections()[curSecIndex()];
  if (s) s[3] = e.target.value;
  saveLook(); draw(); buildStrip();
};
$('#lkAccentAll').onclick = () => {
  const col = $('#lkAccent').value;
  for (const s of sections()) s[3] = col;
  saveLook(); draw(); buildStrip();
};
$('#lkReset').onclick = () => {
  look = DEFAULT_LOOK();
  // پروژهٔ کاربر به چیدمان خودکار خودش برمی‌گردد، نه به جدول آهنگ نمونه
  R.sections = defaultSections();
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
  mk('__demo', 'نقاب — زروان اکو', 'نمونهٔ همراه برنامه · ۳:۴۸ · ۱۶:۹', false, 'ن');
  let n = 1;
  try {
    for (const p of await Library.all()) {
      n++;
      const asp = p.aspect || '16:9';
      const sub = p.audio
        ? `${faN(Math.floor(p.duration / 60))}:${faN(String(Math.round(p.duration % 60)).padStart(2, '0'))} · ${faN(p.analysis.tempo.toFixed(0))} ضرب · ${asp}`
        : `بدون آهنگ · ${faN(p.length || 15)} ثانیه · ${asp}`;
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
  // انتخاب پروژهٔ قبلی نباید به این پروژه نشت کند
  TL.pick = null; TL.sel = -1; selLayerId = null; R.selLayer = null;
  $('#clipBar').classList.add('empty'); $('#cbActs').innerHTML = '';
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
      // پروژهٔ بی‌صدا: یک «آهنگ ساکت» با طول دلخواه می‌سازیم تا لایه‌ها،
      // متن‌ها و خروجی مثل یک پروژهٔ موشن‌گرافیک معمولی کار کنند.
      const dur = Math.max(1, +p.length || 15);
      app.song = new Song(parseLRC(p.lrc || ''), new Analysis(silentAnalysis(dur)), {
        title: p.title || p.name, artist: p.artist || '', tg: p.tg || '', duration: dur,
      });
      app.duration = dur;
      app.audioUrl = null;
      R.sections = p.sections ? p.sections.map(s => s.slice())
        : app.song.lines.length ? autoSections(app.song.lines, dur)
        : [[0, dur, 'none', C.CRIMSON]];
    }
  }
  // حالت این پروژه را بار کن — پروژهٔ تازه کاملاً دست‌نخورده است
  {
    const rec = app.projectId === '__demo' ? { id: '__demo' } : await Library.get(app.projectId);
    cfIdx = 0;
    loadPayload(readState(rec));
    R.selText = null;
  }
  // عکس‌ها و ویدیوهای همین پروژه
  MEDIA.clear();
  try { for (const m of await Library.mediaOf(id)) MEDIA.add(m); } catch (e) { console.warn('media', e); }
  histReset();
  R.selected = null; lastPicked = null;
  R.setSong(app.song);
  applyLook();
  app.audio = app.audioUrl ? new Audio(app.audioUrl) : null;
  if (app.audio) app.audio.preload = 'auto';
  app.t = 0;
  $('#tdur').textContent = faTime(app.duration || 0);
  $('#nowName').textContent = app.song?.title || (await currentMeta())?.title || 'پروژهٔ خالی';
  app.hasAudio = !!app.audioUrl;
  // راهنمای پروژهٔ خالی: فقط وقتی هنوز هیچ چیزی در آن نیست
  $('#noAudio').classList.toggle('hidden',
    app.hasAudio || layers.length > 0 || texts.length > 0 || (app.song?.lines.length || 0) > 0);
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
    audio: null, lrc: '', analysis: null, duration: 0, sections: null, length: 15,
    look: DEFAULT_LOOK(), overrides: {}, custom: null, lineFx: {}, texts: [], layers: [],
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
  // طول فقط برای پروژهٔ بی‌صدا معنا دارد؛ با آهنگ، طول همان طول آهنگ است
  $('#pjLenRow').classList.toggle('hidden', !!m.audio || app.projectId === '__demo');
  $('#pjLen').value = Math.round(m.length || 15);
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
  let lenChanged = false;
  if (!p.audio) {
    const len = Math.max(1, Math.min(600, Math.round(+$('#pjLen').value || 15)));
    lenChanged = len !== (p.length || 15);
    p.length = len;
    // جدول پیش‌فرض تک‌بخشی با طول تازه کش می‌آید
    if (lenChanged && p.sections?.length === 1 && p.sections[0][2] === 'none') p.sections[0][1] = len;
  }
  await Library.put(p);
  $('#pjSheet').classList.add('hidden');
  if (aspChanged || lenChanged) await openProject(p.id);
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
let lastExport = null;        // آخرین ویدیوی ساخته‌شده {blob, name}
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
      lineFx, texts, layers, media: MEDIA,
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
    lastExport = { blob, name };      // ورودی آمادهٔ FFmpeg
    if (app.pane === 'export') { FF.src = 'last'; FF.duration = 0; FF.render(); }
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
let fxCat = 'استایل ویدیو';
function buildFxCats() {
  const host = $('#fxCats');
  host.innerHTML = '';
  for (const c of [FAV, ...Object.keys(FX_CATS)]) {
    if (c === FAV && !favs.length && fxCat !== FAV) continue;
    const b = document.createElement('button');
    b.className = 'chip' + (c === fxCat && !fxQuery ? ' on' : '');
    b.textContent = c;
    b.onclick = () => { fxCat = c; fxQuery = ''; const q = $('#fxSearch'); if (q) q.value = ''; buildFxCats(); buildFxGrid(); };
    host.append(b);
  }
}
$('#fxSearch')?.addEventListener('input', e => { fxQuery = e.target.value; buildFxCats(); buildFxGrid(); });
/* 🎲 شانسی: یک استایل ویدیو + یک سبک متن تصادفی برای بخش انتخاب‌شده */
$('#fxRand')?.addEventListener('click', () => {
  const sec = sections()[styleSecIndex()];
  if (!sec) return;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const vs = pick(FX_CATS['استایل ویدیو']);
  applySecStyle(sec, vs);
  if (Math.random() < 0.6) applySecStyle(sec, pick(FX_CATS['موشن‌گرافی']));
  buildFxGrid();
});
/** لحظه‌ای که پیش‌نمایش افکت واقعاً چیزی نشان می‌دهد.
    اگر همین الان خطی فعال نیست، به نزدیک‌ترین خط می‌پریم — وگرنه
    همهٔ کارت‌ها سیاه درمی‌آیند و مقایسه ممکن نیست. */
function fxPreviewTime(sec = null) {
  const sg = app.song;
  if (!sg || !sg.lines.length) return app.t;
  if (sec) {
    // پیش‌نمایش از خط‌های همان بخش
    const L = sg.lines.find(l => l.words[0].t >= sec[0] && l.words[0].t < sec[1]);
    if (L) return sg.lineStart(L.i) + Math.max(0.8, sg.lineOut(L.i) - sg.lineStart(L.i)) * 0.3;
  }
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
const POOL3 = new PreviewPool();     // پیش‌نمایش سازندهٔ سبک دلخواه

/** همهٔ سبک‌های قابل انتخاب، شامل افکت‌های سفارشی */
const allStyles = () => Object.values(FX_CATS).flat().concat(mixIds(), CSET.styles().map(x => x.id));

/** یک کارت پیش‌نمایش می‌سازد و به استخر اضافه می‌کند */
function fxCard(pool, id, active, accent, onPick, bg = null) {
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
  if (pool === POOL) {
    const st = document.createElement('button');
    st.className = 'fav' + (favs.includes(id) ? ' on' : '');
    st.textContent = favs.includes(id) ? '★' : '☆';
    st.title = 'پسندیده';
    st.onclick = ev => {
      ev.stopPropagation();
      const k = favs.indexOf(id);
      if (k >= 0) favs.splice(k, 1); else favs.push(id);
      saveFavs();
      st.classList.toggle('on', k < 0); st.textContent = k < 0 ? '★' : '☆';
      buildFxCats();
      if (fxCat === FAV && k >= 0) buildFxGrid();
    };
    el.append(st);
  }
  pool.add({ canvas: c, style: id, song: app.song, accent, customSet: CSET, bg: bg && !hasOwnBg(id) ? bg : null });
  return el;
}

function buildFxGrid() {
  const host = $('#fxGrid');
  POOL.clear();
  host.innerHTML = '';
  if (!app.song) return;
  const i = styleSecIndex();
  const sec = sections()[i];
  $('#fxFor').textContent = sec ? `بخش ${faN(i + 1)} · ${faTime(sec[0])}–${faTime(sec[1])}` : '—';
  const gh = $('#fxGhost');
  if (gh) gh.checked = !look.noGhost;
  const acc = sec ? sec[3] : C.CRIMSON;
  // پس‌زمینهٔ فعلی بخش: کارت‌های سبک متن روی همین زمینه نشان داده می‌شوند
  const bgNow = secBg(sec);
  const bgBar = $('#fxBg');
  if (bgBar) {
    bgBar.innerHTML = '';
    if (bgNow && bgNow !== 'none') {
      const t = document.createElement('span');
      t.textContent = '🎬 پس‌زمینهٔ این بخش: ' + styleLabel(bgNow);
      const x = document.createElement('button');
      x.className = 'btn sm ghost'; x.textContent = 'برداشتن پس‌زمینه';
      x.onclick = () => { sec[4].bg = 'none'; saveState(); TL.draw(); buildStrip(); draw(); buildFxGrid(); };
      const all = document.createElement('button');
      all.className = 'btn sm ghost'; all.textContent = 'روی همهٔ بخش‌ها';
      all.onclick = () => { for (const s2 of sections()) (s2[4] ||= { lyric: [], screen: [] }).bg = bgNow; saveState(); TL.draw(); buildStrip(); draw(); };
      bgBar.append(t, x, all);
    } else {
      const t = document.createElement('span'); t.className = 'dim';
      t.textContent = 'این بخش پس‌زمینهٔ ویژه ندارد — از «استایل ویدیو» یکی انتخاب کنید. بعد هر سبک متنی که بزنید روی همان زمینه می‌آید.';
      bgBar.append(t);
    }
  }
  for (const id of catIds(fxCat)) {
    host.append(fxCard(POOL, id, sec?.[2], acc, pick => {
      if (!sec) return;
      applySecStyle(sec, pick); buildFxGrid();
    }, bgNow && bgNow !== 'none' ? bgNow : null));
  }
  if (fxQuery && !catIds(fxCat).length) {
    const p = document.createElement('p'); p.className = 'note';
    p.textContent = 'سبکی با این نام پیدا نشد.'; host.append(p);
  }
  if (!fxQuery && fxCat === MINE && !mixIds().length) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'هنوز سبکی نساخته‌اید. پایین «＋ سبک دلخواه» را بزنید، یا یکی از سبک‌های «موشن‌گرافی» را انتخاب و «سفارشی کن» را بزنید.';
    host.append(p);
  }
  POOL.observe($('#panes'));
  POOL.start(fxPreviewTime(sec));
  buildMixBox(sec, acc);
  buildIdleBox(sec, acc); updIdleSum();
}

/* ── کم‌رنگیِ کلمه‌های نخوانده برای یک خط و تک‌تک کلمه‌هایش ──
   lineFx[i].ghost = 'show'|'hide' (خالی = مثل بخش)
   lineFx[i].gw = { شمارهٔ کلمه: 'show'|'hide' } */
function ghostBox(host, fx, L, upd) {
  const box = document.createElement('div');
  box.className = 'ghostbox';
  const sel = document.createElement('select');
  for (const [v, lb] of [['', 'مثل بخش / کل ویدیو'], ['show', 'نشان بده'], ['hide', 'پنهان کن']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = lb;
    if ((fx.ghost || '') === v) o.selected = true;
    sel.append(o);
  }
  sel.onchange = () => { if (sel.value) fx.ghost = sel.value; else delete fx.ghost; upd(); paint(); };
  box.append(row('کم‌رنگِ نخوانده', sel));
  const hint = document.createElement('p');
  hint.className = 'note';
  hint.textContent = 'تک‌کلمه: روی هر کلمه بزنید تا بین «مثل خط» ← «پنهان» ← «نمایان» عوض شود.';
  const words = document.createElement('div');
  words.className = 'gwords';
  const paint = () => {
    words.innerHTML = '';
    const lineHide = fx.ghost ? fx.ghost === 'hide' : null;
    L.words.forEach((w, j) => {
      const v = fx.gw?.[j] || '';
      const b = document.createElement('button');
      b.className = 'gw ' + (v || 'inherit');
      const eff = v ? v === 'hide' : lineHide;
      b.textContent = w.text;
      b.title = v === 'hide' ? 'پنهان' : v === 'show' ? 'نمایان' : 'مثل خط';
      if (eff === true) b.classList.add('off');
      b.onclick = () => {
        const nx = v === '' ? 'hide' : v === 'hide' ? 'show' : '';
        fx.gw ||= {};
        if (nx) fx.gw[j] = nx; else delete fx.gw[j];
        if (!Object.keys(fx.gw).length) delete fx.gw;
        upd(); paint();
      };
      words.append(b);
    });
    if (fx.gw) {
      const clr = document.createElement('button');
      clr.className = 'btn sm ghost'; clr.textContent = 'پاک کردن تک‌کلمه‌ها';
      clr.onclick = () => { delete fx.gw; upd(); paint(); };
      words.append(clr);
    }
  };
  paint();
  box.append(hint, words);
  host.append(box);
}

/* ── بین‌خوانی: افکت‌هایی که وقتی آواز نیست می‌آیند ─────────── */
let idleScope = 'all';           // 'all' = کل ویدیو، 'sec' = بخش انتخاب‌شده
let idRaf = 0, idCards = [], idT0 = 0;
function idleTarget(sec) {
  if (idleScope === 'sec' && sec) {
    sec[4] ||= { lyric: [], screen: [] };
    if (!Array.isArray(sec[4].idle)) sec[4].idle = (look.idle || []).slice();
    return sec[4].idle;
  }
  return look.idle || (look.idle = []);
}
/** شروع بازهٔ بی‌کلام بعدی (برای پیش‌نمایش در صحنهٔ اصلی) */
function nextIdleAt(from) {
  const sg = app.song; if (!sg) return null;
  const mg = look.idleOpt?.minGap ?? 3;
  for (let t = Math.max(0, from); t < app.duration; t += 0.25) {
    if (idleWindow(sg, t, mg).k > 0.95) return t;
  }
  for (let t = 0; t < from; t += 0.25) if (idleWindow(sg, t, mg).k > 0.95) return t;
  return null;
}
function idleAnim(now) {
  const f = $('#idFold');
  if (!f?.open || app.pane !== 'fx' || app.playing || !app.song || !idCards.length) { idRaf = 0; return; }
  idRaf = requestAnimationFrame(idleAnim);
  if (now - (idleAnim.last || 0) < 40) return;      // حدود ۲۵ فریم؛ کارت‌ها کوچک‌اند
  idleAnim.last = now;
  const sg = app.song;
  const t = idT0 + ((now / 1000) % 8);
  const { W: dw } = stageDims();
  const kick = sg.kick(t);
  for (const { c, id } of idCards) {
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#0E0E12'; x.fillRect(0, 0, c.width, c.height);
    x.setTransform(c.width / dw, 0, 0, c.width / dw, 0, 0);
    try { drawIdle(x, sg, t, idleAcc, kick, [id], { amt: 1 }, 1); } catch (e) { /* کارت خراب نباید بقیه را بخواباند */ }
  }
}
let idleAcc = C.CRIMSON;
function startIdleAnim() { if (!idRaf) idRaf = requestAnimationFrame(idleAnim); }
$('#idFold')?.addEventListener('toggle', startIdleAnim);

function buildIdleBox(sec, acc) {
  const host = $('#idBox');
  if (!host) return;
  host.innerHTML = '';
  idCards = [];
  idleAcc = /^#[0-9a-f]{6}$/i.test(look.idleOpt?.color || '') ? look.idleOpt.color : acc;
  // زمان نمونه برای انرژی صدا: وسط آهنگ
  idT0 = Math.max(0, (app.duration || 10) * 0.4);
  // با عوض شدن بخش: اگر بخش تنظیم خودش را دارد همان را نشان بده، وگرنه کل ویدیو
  const sk = sec ? sec[0] : null;
  if (sk !== buildIdleBox.sk) { buildIdleBox.sk = sk; idleScope = sec && Array.isArray(sec[4]?.idle) ? 'sec' : 'all'; }
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const note = el('p', 'note', 'وقتی آهنگ خوانده نمی‌شود (اینترو، بین دو خط، سولو، پایان) این‌ها نرم می‌آیند و روی هر استایل ویدیو و سبک متنی سوار می‌شوند. چندتا را با هم روشن کنید.');
  const scope = el('div', 'frow btns');
  for (const [v, lb] of [['all', 'کل ویدیو'], ['sec', sec ? `فقط بخش ${faN(styleSecIndex() + 1)}` : 'فقط این بخش']]) {
    const b = el('button', 'chip' + (idleScope === v ? ' on' : ''), lb);
    b.onclick = () => { idleScope = v; buildIdleBox(sec, acc); };
    scope.append(b);
  }
  if (sec && Array.isArray(sec[4]?.idle)) {
    const r = el('button', 'btn sm ghost', '↺ این بخش مثل کل ویدیو');
    r.onclick = () => { delete sec[4].idle; idleScope = 'all'; saveState(); draw(); buildIdleBox(sec, acc); };
    scope.append(r);
  }
  const list = idleScope === 'sec' && sec ? (Array.isArray(sec[4]?.idle) ? sec[4].idle : (look.idle || [])) : (look.idle || []);
  const grid = el('div', 'fxgrid idgrid');
  const { W: dw, H: dh } = stageDims();
  const tw = dh > dw ? 72 : 132;
  for (const id of IDLE_IDS) {
    const fx = IDLE_FX[id];
    const card = el('div', 'fxcard' + (list.includes(id) ? ' on' : ''));
    const c = el('canvas'); c.width = tw; c.height = Math.round(tw * dh / dw);
    const lb = el('div', 'fl', (list.includes(id) ? '✓ ' : '') + fx.label);
    card.append(c, lb);
    card.onclick = () => {
      const tg = idleTarget(sec);
      const k = tg.indexOf(id);
      if (k >= 0) tg.splice(k, 1); else tg.push(id);
      saveState(); draw(); buildIdleBox(sec, acc); updIdleSum();
    };
    idCards.push({ c, id });
    grid.append(card);
  }
  const o = look.idleOpt || (look.idleOpt = { ...IDLE_DEFAULT_OPT });
  const opts = el('div', 'form');
  opts.append(row('شدت', ...slider(20, 150, 5, Math.round((o.amt ?? 1) * 100), v => v + '٪', v => { o.amt = v / 100; saveState(); draw(); })));
  opts.append(row('کمترین فاصله', ...slider(15, 100, 5, Math.round((o.minGap ?? 3) * 10), v => faN((v / 10).toFixed(1)) + ' ثانیه', v => { o.minGap = v / 10; saveState(); draw(); })));
  const cr = el('div', 'frow');
  const own = el('input'); own.type = 'checkbox'; own.checked = !!o.color;
  const col = el('input'); col.type = 'color'; col.value = o.color || acc; col.disabled = !o.color;
  own.onchange = () => { o.color = own.checked ? col.value : ''; col.disabled = !own.checked; saveState(); draw(); buildIdleBox(sec, acc); };
  col.oninput = () => { o.color = col.value; idleAcc = col.value; saveState(); draw(); };
  const lab = el('label', 'dim'); lab.style.fontSize = '12px'; lab.append(own, document.createTextNode(' رنگ جدا (وگرنه رنگ تأکید بخش)'));
  cr.append(lab, col);
  opts.append(cr);
  const pv = el('button', 'btn sm', '▶ دیدن در اولین جای بی‌کلام');
  pv.onclick = () => {
    const t = nextIdleAt(app.t + 0.3);
    if (t == null) { alert('فاصلهٔ بی‌کلامی به این بلندی پیدا نشد — «کمترین فاصله» را کم کنید'); return; }
    seek(t); play();
  };
  host.append(note, scope, grid, opts, pv);
  startIdleAnim();
}
function updIdleSum() {
  const n = (look.idle || []).length;
  const b = $('#idCount'); if (b) b.textContent = n ? `${faN(n)} روشن` : 'خاموش';
}

/* ── سازندهٔ سبک موشن‌گرافی دلخواه ─────────────────────────── */
let mixEdit = null;              // شناسهٔ سبک در حال ویرایش
function newMix(from, name) {
  const id = uid('mx');
  const m = { id: String(id), name, o: { ...MIX_DEFAULT, ...(from || {}) } };
  (look.mixes ||= []).push(m);
  setMixes(look.mixes);
  return m;
}
function buildMixBox(sec, acc) {
  const host = $('#mxBox');
  if (!host) return;
  POOL3.clear();
  host.innerHTML = '';
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const cur = sec?.[2];
  const head = el('div', 'phead', 'سبک دلخواه');
  // وقتی در حال ویرایش یک سبک دلخواه هستیم، بخش تاشو باز بماند
  const fold = $('#mxFold');
  if (fold && (mixEdit || String(cur || '').startsWith('mx:'))) fold.open = true;
  head.append(el('div', 'spacer'));
  const curIsMg = cur && (MG_LABELS[cur] || String(cur).startsWith('mx:'));
  if (curIsMg && !String(cur).startsWith('mx:')) {
    const b = el('button', 'btn sm', '✎ سفارشی کن');
    b.title = 'یک نسخه از همین سبک بسازید و هر چیزش را عوض کنید';
    b.onclick = () => {
      const m = newMix(mixOf(cur), MG_LABELS[cur] + ' (من)');
      mixEdit = m.id; fxCat = MINE;
      applySecStyle(sec, 'mx:' + m.id); buildFxCats(); buildFxGrid();
    };
    head.append(b);
  }
  const add = el('button', 'btn sm ghost', '＋ سبک دلخواه');
  add.onclick = () => {
    const m = newMix(null, 'سبک ' + faN((look.mixes?.length || 0) + 1));
    mixEdit = m.id; fxCat = MINE;
    if (sec) applySecStyle(sec, 'mx:' + m.id); else saveState();
    buildFxCats(); buildFxGrid();
  };
  head.append(add);
  host.append(head);

  const editId = String(cur || '').startsWith('mx:') ? cur.slice(3) : (MIX.has(mixEdit) ? mixEdit : null);
  const m = editId && (look.mixes || []).find(x => String(x.id) === editId);
  if (!m) {
    host.append(el('p', 'note', 'سبک خودتان را بسازید: نوع ورود کلمه‌ها، تأکید روی کلمهٔ فعال، تزئین، سایه، پالت رنگ، کجی و تپش با ضرب را انتخاب کنید. '
      + 'ساده‌ترین راه: یک سبک «موشن‌گرافی» را انتخاب کنید و «✎ سفارشی کن» را بزنید.'));
    return;
  }
  m.o = { ...MIX_DEFAULT, ...(m.o || {}) };
  const commit = (rebuild = false) => {
    setMixes(look.mixes);
    if (sec && sec[2] === 'mx:' + m.id) {
      if (m.o.bg && m.o.bg !== 'none') (sec[4] ||= { lyric: [], screen: [] }).bg = 'mx:' + m.id;
      else if (sec[4]?.bg === 'mx:' + m.id) delete sec[4].bg;
    }
    saveState(); draw();
    if (rebuild) buildFxGrid();
  };
  const top = el('div', 'mxtop');
  const prev = fxCard(POOL3, 'mx:' + m.id, null, acc, () => {});
  prev.classList.add('mxprev');
  const meta = el('div', 'mxmeta');
  const nm = el('input', 'txt'); nm.value = m.name;
  nm.oninput = () => { m.name = nm.value; commit(); };
  const row = el('div', 'frow btns');
  const use = el('button', 'btn sm' + (cur === 'mx:' + m.id ? ' primary' : ''), cur === 'mx:' + m.id ? '✓ روی این بخش' : 'روی این بخش');
  use.onclick = () => { if (sec) { applySecStyle(sec, 'mx:' + m.id); buildFxGrid(); } };
  const all = el('button', 'btn sm ghost', 'روی همهٔ بخش‌های با شعر');
  all.onclick = () => {
    for (const s2 of sections()) if (!['intro', 'inst_a', 'inst_b', 'inst_c', 'end', 'none'].includes(s2[2])) s2[2] = 'mx:' + m.id;
    saveState(); TL.draw(); buildStrip(); buildFxGrid(); draw();
  };
  const dup = el('button', 'btn sm ghost', 'کپی');
  dup.onclick = () => { const c = newMix(m.o, m.name + ' ۲'); mixEdit = c.id; if (sec) sec[2] = 'mx:' + c.id; saveState(); buildFxGrid(); draw(); };
  const rnd = el('button', 'btn sm ghost', '🎲 شانسی');
  rnd.title = 'ترکیب تصادفی — تا وقتی خوشتان بیاید بزنید';
  rnd.onclick = () => {
    for (const d of MIX_OPTS) if (d.ch && d.k !== 'layout') {
      const ch = d.k === 'bg' ? d.ch.filter(c => c[0] !== 'paper') : d.ch;
      m.o[d.k] = ch[Math.floor(Math.random() * ch.length)][0];
    }
    if (m.o.palette === 'custom') m.o.palette = 'mono';
    m.o.text = '#F6F3EC';
    m.o.tilt = Math.round((Math.random() - 0.5) * 12); m.o.beat = +(Math.random() * 1.6).toFixed(1);
    commit(true);
  };
  const del = el('button', 'btn sm ghost danger', 'حذف');
  del.onclick = () => {
    if (!confirm('این سبک حذف شود؟ بخش‌هایی که از آن استفاده می‌کنند به «بند» برمی‌گردند.')) return;
    look.mixes = look.mixes.filter(x => x !== m);
    for (const s2 of sections()) if (s2[2] === 'mx:' + m.id) s2[2] = 'verse';
    for (const s2 of sections()) if (s2[4]?.bg === 'mx:' + m.id) delete s2[4].bg;
    for (const f of Object.values(lineFx)) if (f?.style === 'mx:' + m.id) delete f.style;
    mixEdit = null; setMixes(look.mixes); saveState(); TL.draw(); buildStrip(); buildFxGrid(); draw();
  };
  row.append(use, all, dup, rnd, del);
  meta.append(nm, row);
  top.append(prev, meta);
  host.append(top);

  const form = el('div', 'mxform');
  for (const d of MIX_OPTS) {
    const fr = el('div', 'mxrow');
    fr.append(el('label', '', d.label));
    if (d.ch) {
      const chips = el('div', 'chips');
      for (const [v, lb] of d.ch) {
        const c = el('button', 'chip' + (m.o[d.k] === v ? ' on' : ''), lb);
        c.onclick = () => { m.o[d.k] = v; chips.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); commit(); };
        chips.append(c);
      }
      fr.append(chips);
    } else if (d.color) {
      const inp = el('input'); inp.type = 'color';
      inp.value = /^#[0-9a-f]{6}$/i.test(m.o[d.k]) ? m.o[d.k] : (d.k === 'hi' ? (acc || '#E4142A') : '#F6F3EC');
      inp.oninput = () => { m.o[d.k] = inp.value; if (d.k === 'text') m.o.palette = 'custom'; commit(); };
      fr.append(inp);
      if (d.k === 'hi') {
        const r = el('button', 'btn sm ghost', 'رنگ بخش');
        r.title = d.note || '';
        r.onclick = () => { m.o.hi = ''; commit(true); };
        fr.append(r);
      }
    } else {
      const inp = el('input', 'rng'); inp.type = 'range';
      inp.min = d.min; inp.max = d.max; inp.step = d.step; inp.value = m.o[d.k];
      const v = el('span', 'pill', faN(m.o[d.k]) + (d.unit || ''));
      inp.oninput = () => { m.o[d.k] = +inp.value; v.textContent = faN(+inp.value) + (d.unit || ''); commit(); };
      fr.classList.add('slider');
      fr.append(inp, v);
    }
    form.append(fr);
  }
  host.append(form);
  POOL3.observe($('#panes'));
  POOL3.start(fxPreviewTime(sec));
}

function buildCfList() {
  const host = $('#cfList');
  host.innerHTML = '';
  const sec = sections()[styleSecIndex()];
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
  const i = CSET.add('افکت ' + faN(CSET.count + 1), DEFAULT_CODE);
  if (i < 0) { alert(`حداکثر ${faN(MAX_CUSTOM)} افکت سفارشی — یکی را حذف کنید`); return; }
  cfIdx = i;
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
  // ارجاع‌های cf:N بعد از حذف باید یکی عقب بروند، وگرنه افکت اشتباه پخش می‌شود
  if (CSET.remove(cfIdx)) remapCustomRefs(cfIdx, sections(), lineFx);
  cfIdx = 0; saveState(); syncCode(); buildSecList(); buildStrip(); draw();
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

/* ── پنل‌های مستقل ─────────────────────────────────────────
   هر پنل بزرگ کلاس خودش را دارد و فقط از راه «host» با برنامه حرف
   می‌زند؛ این‌طوری main.js فقط سیم‌کشی است و هر بخش جدا خوانا می‌ماند. */
let mpSelecting = false;

async function addMediaFile(file) {
  const type = file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : null;
  if (!type) { alert('فقط عکس یا ویدیو'); return null; }
  const rec = { id: uid('md'), projectId: app.projectId, type, name: file.name, blob: file };
  try { await Library.putMedia(rec); } catch (e) { console.warn('media save', e); }
  MEDIA.add(rec);
  $('#noAudio').classList.add('hidden');
  return rec;
}

const MP = new MotionPanel($('#mpRoot'), {
  getLayers: () => layers,
  getTime: () => app.t,
  seek: v => seek(v),
  draw: () => { $('#noAudio').classList.add('hidden'); draw(); TL.draw(); },
  save: () => saveState(),
  select: id => {
    mpSelecting = true;
    try { TL.choose(id ? { kind: 'layer', id } : null); } finally { mpSelecting = false; }
  },
  selectedId: () => selLayerId,
  renderer: R, stage, canvas, media: MEDIA,
  addMediaFile,
  duration: () => app.duration,
  W: () => SONG.W, H: () => SONG.H,
  bpm: () => {               // سرعت آهنگ از فاصلهٔ ضرب‌ها (میانه)
    const b = app.song?.beats;
    if (!b || b.length < 4) return 120;
    const d = []; for (let i = 1; i < b.length; i++) d.push(b[i] - b[i - 1]);
    d.sort((x, y) => x - y);
    const m = d[d.length >> 1];
    return m > 0.2 && m < 2 ? Math.round(600 / m) / 10 : 120;
  },
  title: () => app.song?.title || '',
  saveFile: (blob, name) => saveFile(blob, name),
  isPaneOpen: () => app.pane === 'layers' && $('#panes').classList.contains('open'),
  playRange,
  openLearn: () => { lessonReturn = 'editor'; screen('learn'); },
  openPane: () => go('layers'),
  openLyricFx: () => { go('look'); setTimeout(() => $('#lkFx')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); },
  // کارهای «＋ افزودن» که لایهٔ موشن نیستند
  addExtras: () => [
    { ic: '▦', label: 'بخش تازهٔ شعر', desc: 'بخش زیر نشانگر را دو تکه می‌کند', openLayers: false,
      fn: () => $('#secAdd').click() },
    { ic: 'T', label: 'زیرنویس ساده', desc: 'متن ساده روی شعر (روش قدیمی)', openLayers: false,
      fn: () => $('#txtAdd').click() },
  ],
});
$('#addBtn').onclick = () => MP.openAdd();
document.querySelectorAll('[data-goto]').forEach(a => { a.onclick = e => { e.preventDefault(); go(a.dataset.goto); }; });
MP.attachGizmo();

const FF = new FFmpegPanel($('#ffRoot'), {
  getLastExport: () => lastExport,
  save: (blob, name) => saveFile(blob, name),
  share: uri => shareFile(uri),
});

const LS = new Lessons({
  list: $('#lnList'), body: $('#lnBody'), head: $('#lnHead'),
  scroller: () => document.querySelector('.screen[data-screen="learn"] .scroll'),
}, {
  // کد زمین بازی را به‌صورت یک لایهٔ کد به پروژهٔ باز اضافه کن
  tryInProject(code) {
    lessonReturn = 'library';
    screen('editor');
    go('layers');
    const L = MP.add('code');
    L.data.code = code;
    MP.render(); saveState(); draw();
  },
});

/* ── وارد کردن / بیرون دادن پروژه ─────────────────────────── */
$('#importBtn').onclick = () => { $('#imText').value = ''; $('#imMsg').textContent = ''; $('#imSheet').classList.remove('hidden'); };
$('#imX').onclick = () => $('#imSheet').classList.add('hidden');
$('#imSheet').onclick = e => { if (e.target.id === 'imSheet') $('#imSheet').classList.add('hidden'); };
$('#imFileBtn').onclick = () => $('#imFile').click();
$('#imFile').onchange = async e => {
  const f = e.target.files?.[0]; if (!f) return;
  $('#imMsg').textContent = 'در حال خواندن…';
  await doImport(await f.text());
  e.target.value = '';
};
$('#imPaste').onclick = async () => {
  try { $('#imText').value = await navigator.clipboard.readText(); } catch { $('#imMsg').textContent = 'اجازهٔ خواندن کلیپ‌بورد داده نشد — دستی بچسبانید.'; }
};
$('#imGo').onclick = () => doImport($('#imText').value);
async function doImport(text) {
  const msg = $('#imMsg');
  try {
    const { proj, media, what } = await projectFromText(text, { look: DEFAULT_LOOK });
    await Library.put(proj);
    for (const m of media) await Library.putMedia({ ...m, projectId: proj.id });
    $('#imSheet').classList.add('hidden');
    await openProject(proj.id);
    screen('editor'); closePane();
    setTimeout(() => alert('✓ ' + what), 50);
  } catch (e) {
    console.warn(e);
    msg.className = 'msg err';
    msg.textContent = 'وارد نشد: ' + (e.message || e);
  }
}
/* نمونهٔ آماده: شوریل موشن — همهٔ قطعه‌های شوریل داخل بخش‌های برنامه */
$('#reelTpl')?.addEventListener('click', async e => {
  const b = e.currentTarget, old = b.textContent;
  b.disabled = true; b.textContent = 'در حال آماده‌سازی…';
  try {
    const r = await fetch(import.meta.env.BASE_URL + 'templates/motion-reel.lyricstudio.json');
    if (!r.ok) throw new Error('فایل نمونه پیدا نشد');
    await doImport(await r.text());
    if ($('#imMsg').classList.contains('err')) throw new Error($('#imMsg').textContent);
  } catch (err) { alert('نمونه باز نشد: ' + (err.message || err)); }
  finally { b.disabled = false; b.textContent = old; }
});
async function exportProjectFile(withMedia) {
  const msg = $('#pjMsg');
  try {
    msg.className = 'msg'; msg.textContent = 'در حال ساختن فایل…';
    const meta = await currentMeta();
    const rec = app.projectId === '__demo' ? null : await Library.get(app.projectId);
    const media = rec ? await Library.mediaOf(app.projectId) : [];
    const blob = await buildProjectFile({ meta, rec, state: currentPayload(), media, withMedia });
    const nm = (meta?.title || meta?.name || 'project').replace(/[\\/:*?"<>|]+/g, '_');
    if (withMedia) { await saveFile(blob, nm + '.lyricstudio.json'); msg.textContent = '✓ فایل پروژه ذخیره شد'; }
    else { await navigator.clipboard.writeText(await blob.text()); msg.textContent = '✓ کد پروژه کپی شد (بدون آهنگ و عکس‌ها)'; }
    msg.className = 'msg ok';
  } catch (e) { msg.className = 'msg err'; msg.textContent = 'نشد: ' + (e.message || e); }
}
$('#pjExport').onclick = () => exportProjectFile(true);
$('#pjCopy').onclick = () => exportProjectFile(false);

$('#undoBtn').onclick = () => histGo(-1);
$('#redoBtn').onclick = () => histGo(1);
$('#noAudioLayers').onclick = () => { $('#noAudio').classList.add('hidden'); go('layers'); MP.openAdd(); };

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
  const chrome = 60 + TL_HEIGHT + 2 + 58;
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
  // وقتی کاربر در جعبهٔ متن یا کد تایپ می‌کند، فاصله و جهت‌ها مال همان جعبه‌اند
  // (قبلاً فاصله‌زدن در ویرایشگر کد آهنگ را پخش/توقف می‌کرد)
  const tg = e.target;
  if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
  if (APP.dataset.screen !== 'editor') return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); histGo(e.shiftKey ? 1 : -1); return; }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); histGo(1); return; }
  if (app.pane === 'words' && R.selected && e.code.startsWith('Arrow')) {
    const s = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.code];
    if (d) { e.preventDefault(); OV.nudge(R.selected, d[0], d[1]); OV.save(); draw(); return; }
  }
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  // [ و ] : پرش به خط قبلی/بعدی شعر
  if ((e.code === 'BracketLeft' || e.code === 'BracketRight') && app.song?.lines.length) {
    const ls = app.song.lines.map(l => l.words[0].t);
    const t = e.code === 'BracketRight' ? ls.find(x => x > app.t + 0.05) : [...ls].reverse().find(x => x < app.t - 0.3);
    if (t !== undefined) { e.preventDefault(); seek(Math.max(0, t - 0.25)); }
  }
  if (e.code === 'ArrowRight') seek(app.t + (e.shiftKey ? 5 : 1 / 60));
  if (e.code === 'ArrowLeft') seek(app.t - (e.shiftKey ? 5 : 1 / 60));
});

/* ── راه‌اندازی ──────────────────────────────────────────── */
async function boot() {
  await loadFonts();
  await loadUserFonts();
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
  get layers() { return layers; },
  get media() { return MEDIA; },
  get motionPanel() { return MP; },
  undo: () => histGo(-1), redo: () => histGo(1),
  exportVideo, canExport,
};
window.addEventListener('seek-test', e => seek(e.detail));

boot().catch(err => {
  console.error(err);
  $('#loading').textContent = 'خطا: ' + err.message;
});

