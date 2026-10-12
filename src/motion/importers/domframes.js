/**
 * صفحه‌های وب «DOM» (div / svg / CSS) به‌عنوان لایهٔ کد
 * ─────────────────────────────────────────────────────────────
 * بعضی کدها بوم ندارند: انیمیشن با جابه‌جایی div و svg و CSS ساخته می‌شود و
 * زمان با window.seek(t) تنظیم می‌شود (مثل اسکریپت‌های Playwright که صفحه را
 * فریم‌به‌فریم عکس می‌گیرند). اینجا همان صفحه در یک iframe پنهان اجرا می‌شود،
 * برای هر لحظه seek(t) صدا زده می‌شود و خود DOM با SVG ‹foreignObject›
 * به تصویر تبدیل و روی بوم لایه کشیده می‌شود.
 *
 * عکس گرفتن ناهمگام است: در پیش‌نمایش آخرین فریم آماده کشیده می‌شود و وقتی
 * فریم تازه رسید رویداد «wv-dom-frame» می‌آید (برای کشیدن دوباره)؛ در خروجی
 * domSettle() صبر می‌کند تا فریم دقیق برسد و همان فریم دوباره کشیده می‌شود.
 * صدا: تابع صوتی خود صفحه (مثل window.renderAudio که WAV می‌دهد) اجرا می‌شود.
 */

const SEEK_NAMES = ['seek', 'setTime', 'seekTo', 'renderAt', 'gotoTime', '__seek'];
const AUDIO_NAMES = ['renderAudio', 'renderSoundtrack', 'makeAudio', 'buildAudio', 'renderMusic', 'synthAudio', 'synthTrack', 'getAudio', 'audioWav'];

/** صفحه زمان را خودش با تابعی مثل seek(t) تنظیم می‌کند؟ */
export function domSeekName(html) {
  const s = String(html || '');
  for (const n of SEEK_NAMES) if (new RegExp(`window\\.${n}\\s*=|window\\[['"]${n}['"]\\]\\s*=|function\\s+${n}\\s*\\(`).test(s)) return n;
  return null;
}
export function domAudioName(html) {
  const s = String(html || '');
  for (const n of AUDIO_NAMES) if (new RegExp(`window\\.${n}\\s*=|function\\s+${n}\\s*\\(`).test(s)) return n;
  if (/OfflineAudioContext/.test(s)) { const m = /window\.(\w*(?:[Aa]udio|[Ss]ound|[Mm]usic)\w*)\s*=/.exec(s); if (m) return m[1]; }
  return null;
}
/** صفحهٔ DOM (نه بوم) با انیمیشن؟ */
export function looksDomPage(html) {
  const s = String(html || '');
  if (!/<(div|svg|span|section|h1|h2|p)\b/i.test(s)) return false;
  if (domSeekName(s) && !/\.getContext\s*\(\s*['"](2d|webgl)/.test(s)) return true;
  if (/getContext\s*\(/.test(s)) return false;
  return /@keyframes|animation\s*:|\.animate\s*\(|requestAnimationFrame|transition\s*:/.test(s);
}

/** ساعت ساختگی برای صفحه‌هایی که seek ندارند (requestAnimationFrame / انیمیشن‌های CSS) */
const CLOCK = `<script>(function(){var T=0,q=[];var P=performance.now.bind(performance);performance.now=function(){return T*1000};var D=Date.now;Date.now=function(){return 1767225600000+T*1000};
window.requestAnimationFrame=function(c){q.push(c);return q.length};window.cancelAnimationFrame=function(){};
window.__wvSeek=function(t){T=t;for(var k=0;k<2;k++){var a=q.splice(0);for(var i=0;i<a.length;i++){try{a[i](T*1000)}catch(e){}}}try{document.getAnimations().forEach(function(x){x.pause();x.currentTime=T*1000})}catch(e){}};})();</script>`;

const pages = new Map();
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i += 3) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + ':' + s.length; };

function withHead(html, extra) {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, m => m + extra);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, m => m + extra);
  return extra + html;
}

async function toDataUrl(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(r.status);
  const b = await r.blob();
  return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
}
/** فونت‌های لینک‌شده (مثل Google Fonts) ← @font-face با داده‌های داخلی؛ تصویر SVG به اینترنت دسترسی ندارد */
async function inlineFonts(doc) {
  const out = [];
  const links = [...doc.querySelectorAll('link[rel~="stylesheet"][href]')].map(l => l.href).slice(0, 4);
  for (const href of links) {
    try {
      let css = await (await fetch(href)).text();
      const urls = [...new Set([...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map(m => m[1]))].slice(0, 24);
      for (const u of urls) {
        try { const abs = new URL(u, href).href; const d = await toDataUrl(abs); css = css.split(u).join(d); } catch { /* */ }
      }
      out.push(css);
    } catch { /* آفلاین — فونت جایگزین */ }
  }
  return out.join('\n');
}

function getPage(html, run = {}) {
  const key = hashStr(html);
  let P = pages.get(key);
  if (P) { P.used = performance.now(); return P; }
  if (typeof document === 'undefined') return null;
  const W0 = run.W0 || 1920, H0 = run.H0 || 1080;
  const seekName = run.seek || domSeekName(html);
  P = { key, W0, H0, seekName, ready: false, error: null, frames: new Map(), want: new Map(), busy: false, fontCss: '', used: performance.now(), waiters: [] };
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  f.style.cssText = `position:fixed;left:-${W0 + 4000}px;top:0;width:${W0}px;height:${H0}px;border:0;opacity:0;pointer-events:none;`;
  f.srcdoc = seekName ? html : withHead(html, CLOCK);
  P.frame = f;
  P.loaded = new Promise(res => { f.onload = res; });
  document.body.appendChild(f);
  P.init = (async () => {
    await P.loaded;
    const w = f.contentWindow, d = f.contentDocument;
    P.win = w; P.doc = d;
    try { await Promise.race([d.fonts?.ready, new Promise(r => setTimeout(r, 4000))]); } catch { /* */ }
    try { if (typeof w.init === 'function') await w.init(); } catch (e) { P.error = e; }
    try { P.fontCss = await Promise.race([inlineFonts(d), new Promise(r => setTimeout(() => r(''), 6000))]); } catch { /* */ }
    P.seek = typeof w[seekName] === 'function' ? t => w[seekName](t) : typeof w.__wvSeek === 'function' ? t => w.__wvSeek(t) : () => {};
    P.ready = true;
  })().catch(e => { P.error = e; P.ready = true; });
  pages.set(key, P);
  // صفحه‌های قدیمی را آزاد کن
  if (pages.size > 3) {
    const old = [...pages.values()].filter(x => x !== P).sort((a, b) => a.used - b.used)[0];
    if (old) { try { old.frame.remove(); } catch { /* */ } for (const fr of old.frames.values()) fr.bmp?.close?.(); pages.delete(old.key); }
  }
  return P;
}

/** عکس DOM فعلی صفحه با اندازهٔ px (عرض) */
async function snapshot(P, px) {
  const d = P.doc, W0 = P.W0, H0 = P.H0;
  const clone = d.documentElement.cloneNode(true);
  // بوم‌های داخل صفحه ← تصویر
  const live = [...d.querySelectorAll('canvas')], cl = [...clone.querySelectorAll('canvas')];
  cl.forEach((c, i) => { try { const im = d.createElement('img'); im.src = live[i].toDataURL(); im.setAttribute('style', c.getAttribute('style') || ''); im.className = c.className; im.width = live[i].width; im.height = live[i].height; c.replaceWith(im); } catch { /* */ } });
  clone.querySelectorAll('script,link,noscript,iframe').forEach(e => e.remove());
  if (P.fontCss) { const st = d.createElement('style'); st.textContent = P.fontCss; (clone.querySelector('head') || clone).prepend(st); }
  const xml = new XMLSerializer().serializeToString(clone);
  const ph = Math.round(px * H0 / W0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${ph}" viewBox="0 0 ${W0} ${H0}"><foreignObject x="0" y="0" width="${W0}" height="${H0}">${xml}</foreignObject></svg>`;
  const img = new Image();
  img.decoding = 'sync';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas'); c.width = px; c.height = ph;
  c.getContext('2d').drawImage(img, 0, 0, px, ph);
  return typeof createImageBitmap === 'function' ? await createImageBitmap(c) : c;
}

const fkey = (t, px) => t.toFixed(4) + '|' + px;
let fireT = 0;
function fire() {
  if (typeof window === 'undefined') return;
  const now = performance.now();
  if (now - fireT < 8) return;
  fireT = now;
  window.dispatchEvent(new Event('wv-dom-frame'));
}
async function pump(P) {
  if (P.busy) return;
  P.busy = true;
  try {
    await P.init;
    while (P.want.size) {
      const [px, t] = [...P.want.entries()].pop();
      P.want.delete(px);
      const k = fkey(t, px);
      if (P.frames.has(k)) continue;
      try {
        P.seek(t);
        const bmp = await snapshot(P, px);
        P.frames.set(k, { t, px, bmp });
        while (P.frames.size > 8) { const [ok, ov] = P.frames.entries().next().value; ov.bmp?.close?.(); P.frames.delete(ok); }
      } catch (e) { P.error = e; }
      fire();
    }
  } finally {
    P.busy = false;
    const w = P.waiters.splice(0); w.forEach(f => f());
  }
}

let misses = [];
/** اندازهٔ عکس: کوچک‌ترین پله‌ای که از اندازهٔ واقعی روی بوم کمتر نیست */
function bucket(need, W0) {
  const steps = [320, 640, 960, 1280, 1920, 2560, 3840];
  const cap = Math.min(3840, W0 * 2);
  for (const s of steps) if (s >= need * 0.98) return Math.min(s, cap);
  return cap;
}

/** از runImported: یک فریم صفحهٔ DOM روی ctx (مبدأ مرکز لایه، اندازهٔ e.w×e.h) */
export function runDomFrame(ctx, e, html, T, run) {
  const P = getPage(html, run);
  if (!P) return;
  const w = e.w, h = e.h, t = Math.max(0, (run.start || 0) + e.t);
  const W0 = P.W0, H0 = P.H0;
  const m = ctx.getTransform(), sx = Math.hypot(m.a, m.b) || 1;
  const s = run.fit === 'contain' ? Math.min(w / W0, h / H0) : Math.max(w / W0, h / H0);
  const px = bucket(W0 * s * sx, W0);
  const k = fkey(t, px);
  let fr = P.frames.get(k);
  if (!fr) {
    P.want.set(px, t);
    const p = pump(P);
    misses.push(P);
    // نزدیک‌ترین فریم آماده
    let best = null;
    for (const x of P.frames.values()) { const sc = Math.abs(x.t - t) + (x.px === px ? 0 : 0.05); if (!best || sc < best.sc) best = { sc, x }; }
    fr = best?.x;
    void p;
  }
  if (!fr) return;
  ctx.save();
  ctx.translate(-w / 2, -h / 2);
  ctx.translate((w - W0 * s) / 2, (h - H0 * s) / 2);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fr.bmp, 0, 0, W0 * s, H0 * s);
  ctx.restore();
}

/** خروجی: آیا در آخرین کشیدن فریمی آماده نبود؟ صبر تا برسد ← true (یعنی دوباره بکش) */
export async function domSettle() {
  if (!misses.length) return false;
  const list = [...new Set(misses)]; misses = [];
  await Promise.all(list.map(P => new Promise(res => { if (!P.busy && !P.want.size) res(); else P.waiters.push(res); if (!P.busy) pump(P); })));
  return true;
}
export function domBusy() { return misses.length > 0; }

/** صدای صفحه: تابع صوتی خودش (WAV به‌صورت base64 / ArrayBuffer / AudioBuffer) ← بایت‌های WAV */
export async function domAudio(html, run = {}, wavEncode) {
  const P = getPage(html, run);
  if (!P) return null;
  await P.init;
  const name = run.audio || domAudioName(html);
  const fn = name && P.win?.[name];
  if (typeof fn !== 'function') return null;
  let r = await fn.call(P.win);
  if (r == null) return null;
  if (typeof r === 'string') {
    const b64 = r.replace(/^data:[^,]*,/, '');
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  if (r instanceof P.win.Blob || r instanceof Blob) r = await r.arrayBuffer();
  if (r?.getChannelData && wavEncode) return wavEncode(r);
  if (r instanceof ArrayBuffer || r?.constructor?.name === 'ArrayBuffer') return new Uint8Array(r);
  if (ArrayBuffer.isView(r)) return new Uint8Array(r.buffer, r.byteOffset, r.byteLength);
  return null;
}

/* ───────── پایتونی که یک صفحهٔ HTML را داخل خودش دارد (Playwright و …) ───────── */
const pyStr = s => s.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{2}|n|t|r|\\|'|"|\n)/g, (m, c) => (c[0] === 'u' || c[0] === 'U' || c[0] === 'x' ? String.fromCodePoint(parseInt(c.slice(1), 16)) : c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c === '\n' ? '' : c));
/** @returns {{ html, varName, W0, H0, dur } | null} */
export function pyEmbeddedHtml(src) {
  const s = String(src || '');
  let best = null;
  for (const m of s.matchAll(/(^|\n)([A-Za-z_]\w*)\s*=\s*([rRbBuU]{0,2})("""|''')([\s\S]*?)\4/g)) {
    const body = m[5];
    if (!/<(html|!doctype|body)\b/i.test(body) || !/<(script|div|svg|canvas)\b/i.test(body)) continue;
    if (!best || body.length > best.body.length) best = { name: m[2], raw: /r/i.test(m[3]), body };
  }
  if (!best) return null;
  let html = best.raw ? best.body : pyStr(best.body);
  html = html.replace(/^\\\n/, '');
  // ثابت‌های رشته‌ای/عددی بالای فایل (برای جایگزینی‌ها)
  const consts = {};
  for (const m of s.matchAll(/^([A-Za-z_][\w, ]*?)\s*=\s*(.+)$/gm)) {
    const names = m[1].split(',').map(x => x.trim()), vals = m[2].replace(/\s+#.*$/, '').split(/,(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/).map(x => x.trim());
    if (names.length !== vals.length) continue;
    names.forEach((n, i) => {
      const v = vals[i];
      let q;
      if ((q = /^[rRuU]?(["'])((?:\\.|(?!\1).)*)\1$/.exec(v))) consts[n] = /^[rR]/.test(v) ? q[2] : pyStr(q[2]);
      else if (/^-?\d+(\.\d+)?$/.test(v)) consts[n] = v;
    });
  }
  const val = a => { a = a.trim(); let q; if ((q = /^[rRuU]?(["'])((?:\\.|(?!\1).)*)\1$/.exec(a))) return /^[rR]/.test(a) ? q[2] : pyStr(q[2]); let m2; if ((m2 = /^str\(\s*(\w+)\s*\)$/.exec(a))) a = m2[1]; return a in consts ? String(consts[a]) : null; };
  for (const m of s.matchAll(/\.replace\(\s*(["'])((?:\\.|(?!\1).)+)\1\s*,\s*([^()]+?|str\(\w+\))\s*\)/g)) {
    const from = pyStr(m[2]);
    if (!/^(__\w+__|\{\{\s*\w+\s*\}\}|%\w+%|\$\w+|@@\w+@@)$/.test(from) || !html.includes(from)) continue;
    const to = val(m[3]);
    if (to != null) html = html.split(from).join(to);
  }
  const num = n => (n in consts ? +consts[n] : null);
  return { html, varName: best.name, W0: num('W') || num('WIDTH'), H0: num('H') || num('HEIGHT'), dur: num('DUR') || num('DURATION') };
}
