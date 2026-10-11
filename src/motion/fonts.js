import { FONT_CHOICES } from './render.js';

/**
 * فونت‌های خودتان — یک‌بار اضافه کنید، در همهٔ پروژه‌ها دارید
 * ─────────────────────────────────────────────────────────────
 * فایل فونت (ttf / otf / woff / woff2) در IndexedDB ذخیره می‌شود و
 * هر بار برنامه باز شود با FontFace به مرورگر معرفی می‌شود. بعد در
 * فهرست فونت لایه‌های متن ظاهر می‌شود.
 *
 * «فونت شعر»: برای اینکه همهٔ سبک‌های شعر (که نام فونت را مستقیم
 * می‌نویسند) فونت تازه را بگیرند، فونت شما را با همان نام فونت اصلی
 * (IRANSansX) جایگزین می‌کنیم و با «پیش‌فرض» برمی‌گردانیم.
 */
const DB = 'lyricstudio-fonts', STORE = 'fonts';
const MAIN = ['IRANSansX Black', 'IRANSansX Bold'];

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), st = t.objectStore(STORE);
    const out = fn(st);
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}

export const userFonts = [];          // { id, name, family, face }
const listeners = new Set();
export const onFontsChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(f => { try { f(); } catch { /* */ } });

function register(rec) {
  const family = 'UF ' + rec.id;
  const face = new FontFace(family, rec.data);
  return face.load().then(f => {
    document.fonts.add(f);
    const it = { id: rec.id, name: rec.name, family, face: f, data: rec.data };
    userFonts.push(it);
    if (!FONT_CHOICES.some(c => c[0] === 'u:' + rec.id)) FONT_CHOICES.push(['u:' + rec.id, family, '★ ' + rec.name]);
    return it;
  });
}

/** هنگام شروع برنامه: همهٔ فونت‌های ذخیره‌شده را بار کن */
export async function loadUserFonts() {
  try {
    const all = await tx('readonly', st => st.getAll());
    const recs = Array.isArray(all) ? all : [];
    await Promise.all(recs.map(r => register(r).catch(e => console.warn('font', r.name, e))));
    emit();
  } catch (e) { console.warn('user fonts', e); }
}

/** فایل فونت تازه؛ شناسهٔ انتخاب (مثل 'u:abc') را برمی‌گرداند */
export async function addFontFile(file) {
  const data = await file.arrayBuffer();
  const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').slice(0, 30) || 'فونت';
  const rec = { id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name, data };
  await register(rec);           // اگر فایل خراب باشد اینجا خطا می‌دهد و ذخیره نمی‌شود
  try { await tx('readwrite', st => st.put(rec)); } catch (e) { console.warn('font save', e); }
  emit();
  return 'u:' + rec.id;
}

export async function removeFont(id) {
  const i = userFonts.findIndex(f => f.id === id);
  if (i < 0) return;
  document.fonts.delete(userFonts[i].face);
  userFonts.splice(i, 1);
  const j = FONT_CHOICES.findIndex(c => c[0] === 'u:' + id);
  if (j >= 0) FONT_CHOICES.splice(j, 1);
  try { await tx('readwrite', st => st.delete(id)); } catch { /* */ }
  emit();
}

/** دکمه/ورودی انتخاب فایل فونت */
export function pickFontFile() {
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.ttf,.otf,.woff,.woff2,font/*';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return res(null);
      try { res(await addFontFile(f)); }
      catch (e) { alert('این فایل فونت باز نشد. فایل ttf، otf یا woff انتخاب کنید.'); res(null); }
    };
    inp.click();
  });
}

/* ── فونت شعر ── */
let saved = null, swapped = [];
/**
 * @param {string|null} id  شناسهٔ فونت کاربر، یا null برای فونت اصلی
 * @returns {Promise} وقتی فونت آمادهٔ کشیدن شد
 */
export function setLyricFont(id) {
  const uf = id ? userFonts.find(f => f.id === String(id).replace(/^u:/, '')) : null;
  if (!saved) saved = [...document.fonts].filter(f => MAIN.includes(f.family.replace(/["']/g, '')));
  for (const f of swapped) document.fonts.delete(f);
  swapped = [];
  if (!uf) {
    for (const f of saved) if (!document.fonts.has(f)) document.fonts.add(f);
    return Promise.resolve();
  }
  for (const f of saved) document.fonts.delete(f);
  for (const fam of MAIN) {
    const f = new FontFace(fam, uf.data);
    f.load().catch(() => {});
    document.fonts.add(f);
    swapped.push(f);
  }
  return Promise.all(swapped.map(f => f.loaded.catch(() => {})));
}
