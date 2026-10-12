/**
 * فونت‌های همراه برنامه (public/webfonts ← scripts/copy-fonts.mjs)
 * ─────────────────────────────────────────────────────────────
 * ۱۱۰+ خانوادهٔ Google Fonts داخل خود برنامه‌اند (بدون اینترنت هم کار می‌کنند):
 *  • بوم: هر جا متنی با نام یکی از این فونت‌ها کشیده شود (موشن‌اسکریپت، کد بوم، pycairo)
 *    همان فونت بار و فریم دوباره کشیده می‌شود (رویداد wv-dom-frame).
 *  • صفحه‌های HTML وارد‌شده: @font-face محلی به‌جای fonts.googleapis.com.
 *  • پایتون واقعی: فایل TTF برای PIL / matplotlib / pygame (pyreal.js).
 * نام‌های سیستمی رایج (Arial، Helvetica، Times، Courier، DejaVu، …) به فونت هم‌اندازه می‌رسند.
 */
let M = null, loading = null;
const fam = new Map();           // نام کوچک‌شده ← { family, faces: [{…, ff}] }
const pend = new Set();
let redrawT = 0;

export function webfontsBase() {
  if (globalThis.WV_FONTS_URL) return globalThis.WV_FONTS_URL;
  try { return new URL('webfonts/', document.baseURI).href; } catch { return './webfonts/'; }
}
const key = s => String(s || '').trim().replace(/^['"]|['"]$/g, '').toLowerCase();
const compact = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** فهرست فونت‌ها (یک بار) و معرفی به document.fonts */
export function initWebfonts() {
  if (loading) return loading;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return (loading = Promise.resolve(null));
  loading = (async () => {
    const base = webfontsBase();
    const r = await fetch(base + 'fonts.json');
    if (!r.ok) throw new Error('fonts.json ' + r.status);
    M = await r.json();
    const add = (name, f) => {
      const k = key(name);
      let e = fam.get(k);
      if (!e) fam.set(k, (e = { family: name, faces: [] }));
      const ff = new FontFace(name, `url("${base}${encodeURI(f.file)}")`, { weight: f.weight, style: f.style, display: 'swap' });
      try { document.fonts.add(ff); } catch { /* */ }
      e.faces.push({ ...f, url: base + encodeURI(f.file), ff });
    };
    for (const f of M.faces) add(f.family, f);
    for (const [alias, to] of Object.entries(M.aliases || {})) for (const f of M.faces.filter(x => x.family === to)) add(alias, f);
    hookCanvas();
    return M;
  })().catch(e => { console.warn('webfonts:', e); return null; });
  return loading;
}
export const webfontsReady = () => !!M;
/** وقتی فونتی در حال بار شدن است (برای خروجی: صبر تا فونت برسد) */
export function webfontsPending() { return pend.size ? Promise.all([...pend]) : null; }

/** نام خانوادهٔ همراه برنامه (با نام مستعار) یا null */
export function bundledFamily(name) { const e = fam.get(key(name)); return e ? e.family : null; }
export function bundledFaces(name) { return fam.get(key(name))?.faces || []; }

function redraw() {
  clearTimeout(redrawT);
  redrawT = setTimeout(() => { try { window.dispatchEvent(new Event('wv-fonts-loaded')); window.dispatchEvent(new Event('wv-dom-frame')); } catch { /* */ } }, 30);
}
/** بار کردن فونت‌های یک رشتهٔ CSS font (مثل «bold 40px "Montserrat", sans-serif») */
const seen = new Set();
export function wantFont(css) {
  if (!M || seen.has(css)) return;
  seen.add(css);
  if (seen.size > 5000) seen.clear();
  const m = /(?:^|\s)[\d.]+(?:px|pt|em|rem|%|vh|vw)\s*(?:\/\s*\S+\s+)?(.+)$/i.exec(css);
  if (!m) return;
  for (const part of m[1].split(',')) {
    const e = fam.get(key(part));
    if (!e || !e.faces.some(f => f.ff.status === 'unloaded')) continue;
    let p;
    try { p = document.fonts.load(css.replace(m[1], `"${e.family}"`)); } catch { continue; }
    pend.add(p);
    p.then(list => { if (list?.length) redraw(); }).catch(() => {}).finally(() => pend.delete(p));
  }
}
function hookCanvas() {
  for (const C of [globalThis.CanvasRenderingContext2D, globalThis.OffscreenCanvasRenderingContext2D]) {
    const P = C?.prototype, d = P && Object.getOwnPropertyDescriptor(P, 'font');
    if (!d?.set || d.set.__wv) continue;
    const set = function (v) { d.set.call(this, v); try { wantFont(String(v)); } catch { /* */ } };
    set.__wv = true;
    Object.defineProperty(P, 'font', { ...d, set });
  }
}

/** خانواده‌های همراه برنامه که نامشان در یک متن (CSS، HTML، کد پایتون) آمده */
const SHORT = /^(inter|cairo|lora|sora|syne|teko|kalam|amiri|saira|rubik|lato|anton|outfit|geist|archivo|changa|barlow|ubuntu|bungee|caveat|lobster|almarai|tajawal|kanit|times|courier|monaco|impact|futura|avenir|vazir|system-ui)$/;
export function familiesIn(text) {
  if (!M) return [];
  const s = String(text || ''), low = s.toLowerCase(), cs = compact(s), out = new Set();
  for (const [k, e] of fam) {
    if (SHORT.test(k) || k.length < 6) {
      const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[^a-z0-9]+/g, '[\\s_-]?')}(?![a-z])`, 'i');
      if (re.test(low)) out.add(k);
    } else if (cs.includes(compact(k))) out.add(k);
  }
  return [...out];
}
/** @font-face برای خانواده‌های داده‌شده (آدرس محلی؛ یا data: اگر inline) */
const dataCache = new Map();
async function dataUrl(u) {
  if (!dataCache.has(u)) {
    dataCache.set(u, fetch(u).then(r => r.blob()).then(b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); })).catch(() => u));
  }
  return dataCache.get(u);
}
export async function fontFaceCss(keys, { inline = false } = {}) {
  await initWebfonts();
  const out = [];
  for (const k of keys) {
    const e = fam.get(key(k)); if (!e) continue;
    for (const f of e.faces) out.push(`@font-face{font-family:"${e.family}";src:url("${inline ? await dataUrl(f.url) : f.url}") format("truetype");font-weight:${f.weight};font-style:${f.style};font-display:block}`);
  }
  return out.join('\n');
}
