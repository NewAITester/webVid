/**
 * وارد کردن و بیرون دادن پروژه — «کد کامل» پروژه
 * ─────────────────────────────────────────────────────────────
 * فایل پروژه یک JSON ساده است:
 *   { kind:'lyricstudio-project', v:1, meta:{…}, state:{…},
 *     audio?: dataURL, analysis?: {…}, media?: [{id,type,name,data}] }
 *
 * هنگام وارد کردن، این‌ها را هم می‌پذیریم تا کاربر هر چه دارد بچسباند:
 *   • فایل/متن پروژهٔ کامل (بالا)
 *   • فقط «حالت» (چیزی که layers / sections / look دارد)
 *   • آرایهٔ لایه‌ها
 *   • شعر LRC با زمان‌بندی ([00:12.34] …)
 *   • کد جاوااسکریپت → یک لایهٔ کد در پروژهٔ تازه
 */
export const KIND = 'lyricstudio-project';

const toDataURL = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result); r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
const fromDataURL = async url => (await fetch(url)).blob();

/** فایل پروژه را بساز */
export async function buildProjectFile({ meta = {}, rec = null, state, media = [], withMedia = true }) {
  const out = {
    kind: KIND, v: 1, savedAt: new Date().toISOString(),
    meta: {
      name: meta.name || meta.title || 'پروژه', title: meta.title || meta.name || '', artist: meta.artist || '',
      tg: meta.tg || '', aspect: meta.aspect || '16:9', length: rec?.length || meta.length || 15,
      duration: rec?.duration || 0, lrc: rec?.lrc || '',
    },
    state,
  };
  if (withMedia && rec?.audio) { out.audio = await toDataURL(rec.audio); out.analysis = rec.analysis; }
  if (withMedia) out.media = await Promise.all(media.map(async m => ({ id: m.id, type: m.type, name: m.name, data: await toDataURL(m.blob) })));
  return new Blob([JSON.stringify(out)], { type: 'application/json' });
}

const LRC_RE = /^\s*\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/m;
const lastLrcTime = txt => {
  let m, last = 0; const re = /\[(\d{1,2}):(\d{2}(?:[.:]\d{1,3})?)\]/g;
  while ((m = re.exec(txt))) last = Math.max(last, +m[1] * 60 + parseFloat(m[2].replace(':', '.')));
  return last;
};

/**
 * متن ورودی را بشناس و پروژهٔ تازه بساز.
 * @returns {Promise<{proj, media, what}>}  what: توضیح فارسی کاری که شد
 */
export async function projectFromText(text, defaults) {
  const base = (name, extra = {}) => ({
    id: 'p' + Date.now(), name, title: name, artist: '', tg: '', aspect: '9:16',
    audio: null, lrc: '', analysis: null, duration: 0, sections: null, length: 15,
    look: defaults.look(), overrides: {}, custom: null, lineFx: {}, texts: [], layers: [],
    createdAt: Date.now(), ...extra,
  });
  const src = String(text || '').trim();
  if (!src) throw new Error('چیزی برای وارد کردن نیست.');
  let j = null;
  if (/^[[{]/.test(src)) { try { j = JSON.parse(src); } catch { j = null; } }

  if (j && j.kind === KIND) {
    const m = j.meta || {}, st = j.state || {};
    const proj = base(m.name || 'پروژهٔ واردشده', {
      title: m.title || m.name || '', artist: m.artist || '', tg: m.tg || '', aspect: m.aspect || '16:9',
      lrc: m.lrc || '', length: m.length || 15,
    });
    Object.assign(proj, pickState(st));
    if (j.audio && j.analysis) {
      proj.audio = await fromDataURL(j.audio);
      proj.analysis = j.analysis; proj.duration = m.duration || 0;
    } else proj.length = Math.max(1, Math.round(m.duration || m.length || 15));
    const media = await Promise.all((j.media || []).map(async x => ({ id: x.id, type: x.type, name: x.name, blob: await fromDataURL(x.data) })));
    return { proj, media, what: `پروژهٔ «${proj.title || proj.name}» وارد شد` + (proj.audio ? ' (با آهنگ)' : ' (بدون آهنگ)') };
  }
  if (j && !Array.isArray(j) && (j.layers || j.sections || j.look || j.texts)) {
    const proj = base('پروژهٔ واردشده');
    Object.assign(proj, pickState(j));
    const end = Math.max(15, ...(j.layers || []).map(L => +L.t1 || 0), ...(j.sections || []).map(s => +s[1] || 0));
    proj.length = Math.ceil(end);
    return { proj, media: [], what: 'تنظیمات پروژه وارد شد' };
  }
  if (Array.isArray(j) && j.every(x => x && typeof x === 'object' && x.type)) {
    const proj = base('لایه‌های واردشده');
    proj.layers = j;
    proj.length = Math.ceil(Math.max(15, ...j.map(L => +L.t1 || 0)));
    return { proj, media: [], what: `${j.length} لایه وارد شد` };
  }
  if (LRC_RE.test(src)) {
    const proj = base('شعر واردشده');
    proj.lrc = src;
    proj.length = Math.ceil(lastLrcTime(src) + 4);
    return { proj, media: [], what: 'شعر زمان‌بندی‌شده وارد شد — حالا از ⚙ آهنگش را اضافه کنید' };
  }
  // در غیر این صورت: کد
  const proj = base('کد واردشده');
  proj.layers = [{ type: 'code', t0: 0, t1: 15, name: 'کد واردشده', data: { code: src } }];
  return { proj, media: [], what: 'کد به‌صورت یک «لایهٔ کد» وارد شد' };
}

function pickState(st) {
  const o = {};
  for (const k of ['look', 'overrides', 'sections', 'custom', 'code', 'lineFx', 'texts', 'layers']) if (st[k] !== undefined) o[k] = st[k];
  return o;
}
