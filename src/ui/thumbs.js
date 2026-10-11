import { MotionRenderer } from '../motion/render.js';
import { frameEnv } from '../motion/evaluate.js';
import { newLayer } from '../motion/schema.js';

/**
 * پیش‌نمایش کوچک قالب‌ها و افکت‌ها
 * ─────────────────────────────────────────────────────────────
 * به‌جای فهرست اسم، هر قالب یک تصویر کوچک دارد که با همان موتور
 * اصلی کشیده شده — پس دقیقاً همان چیزی است که روی ویدیو می‌بینید.
 * کشیدن‌ها در صف می‌روند و هر فریم چندتا انجام می‌شود تا پنل گیر نکند.
 * نتیجه کش می‌شود؛ بار دوم فوری است.
 */
const TW = 600, TH = 400;          // فضای طراحی پیش‌نمایش
const PW = 132, PH = 88;           // اندازهٔ واقعی تصویر کوچک

let renderer = null, photo = null;
const cache = new Map();
const queue = [];
let busy = false;

/** یک «عکس نمونه» ساختگی: آسمان، خورشید، کوه — برای نشان دادن افکت‌های رنگ */
function samplePhoto() {
  if (photo) return photo;
  const c = document.createElement('canvas'); c.width = 600; c.height = 400;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 400);
  sky.addColorStop(0, '#2B5FA8'); sky.addColorStop(0.55, '#F08A4B'); sky.addColorStop(1, '#F7C873');
  x.fillStyle = sky; x.fillRect(0, 0, 600, 400);
  x.fillStyle = '#FFE9A8'; x.beginPath(); x.arc(400, 210, 60, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#3B2A4A';
  x.beginPath(); x.moveTo(0, 400); x.lineTo(0, 260); x.lineTo(140, 170); x.lineTo(260, 270); x.lineTo(380, 190);
  x.lineTo(600, 300); x.lineTo(600, 400); x.fill();
  x.fillStyle = '#1F6B4F';
  x.beginPath(); x.moveTo(0, 400); x.lineTo(0, 330); x.quadraticCurveTo(300, 270, 600, 350); x.lineTo(600, 400); x.fill();
  x.fillStyle = '#E4142A'; x.fillRect(80, 300, 70, 70);
  x.fillStyle = '#F6F3EC'; x.font = 'bold 54px sans-serif'; x.fillText('★', 470, 90);
  photo = { id: 'sample', type: 'image', name: 'نمونه', el: c, w: 600, h: 400, ready: true };
  return photo;
}
const fakeMedia = { get: () => samplePhoto(), sync() {} };

/** لایه‌های پیش‌فرض نمونه */
export function sampleText(str = 'سلام') {
  const L = newLayer('text', 0, 5);
  L.data.str = str; L.props.size = { v: 150 };
  return L;
}
export function sampleImage() {
  const L = newLayer('image', 0, 5);
  L.data.media = 'sample'; L.props.w = { v: 600 };
  return L;
}
export function sampleShape() {
  const L = newLayer('shape', 0, 5);
  L.data.kind = 'star'; L.props.w = { v: 240 }; L.props.h = { v: 240 }; L.props.x = { v: 0 };
  return L;
}

function paint(cv, layers, t) {
  renderer ||= new MotionRenderer();
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0D0F14'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(cv.width / TW, 0, 0, cv.height / TH, 0, 0);
  const env = { ...frameEnv(null, t, TW, TH), kick: 0.55, rms: 0.5, pulse: 0.5, song: null, frameDur: 1 / 30 };
  renderer.draw(ctx, layers, t, env, { behind: false, media: fakeMedia });
}

function pump() {
  if (busy) return;
  busy = true;
  requestAnimationFrame(() => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 12) {
      const job = queue.shift();
      if (!job.img.isConnected && job.img.dataset.wait) continue;   // پنل بسته شد
      try {
        let url = cache.get(job.key);
        if (!url) {
          const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH;
          paint(cv, job.build(), job.t);
          url = cv.toDataURL('image/webp', 0.8);
          cache.set(job.key, url);
        }
        job.img.src = url;
      } catch (e) { console.warn('thumb', job.key, e); }
    }
    busy = false;
    if (queue.length) pump();
  });
}

/**
 * عنصر <img> که بعداً پیش‌نمایش را می‌گیرد.
 * @param {string}   key    کلید کش (مثلاً 'style:neonRed')
 * @param {()=>Array} build  سازندهٔ لایه‌ها (فقط اگر در کش نبود صدا زده می‌شود)
 * @param {number}   t      لحظهٔ عکس‌برداری (ثانیه)
 */
export function thumb(key, build, t = 2.3) {
  const img = document.createElement('img');
  img.className = 'thumb';
  img.alt = '';
  img.width = PW; img.height = PH;
  const hit = cache.get(key);
  if (hit) { img.src = hit; return img; }
  img.dataset.wait = '1';
  queue.push({ key, build, t, img });
  // صبر تا عنصر در صفحه قرار گیرد
  setTimeout(pump, 0);
  return img;
}
