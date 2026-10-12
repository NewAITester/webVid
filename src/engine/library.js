import { SECT, C, DUR } from './song.js';

/**
 * کتابخانهٔ پروژه‌ها — نگه‌داری آهنگ‌های وارد‌شده
 *
 * صدا چند مگابایت است و در localStorage جا نمی‌شود، پس IndexedDB.
 * ساختار هر پروژه: { id, name, audio(Blob), lrc, analysis, sections, overrides }
 */

const DB = 'lyricstudio', STORE = 'projects', MEDIA = 'media';

/* نسخهٔ ۲ پایگاه داده یک مخزن «media» اضافه کرد برای تصویر و ویدیوی
   لایه‌ها. ارتقا فقط مخزن تازه را می‌سازد؛ پروژه‌های قبلی دست نمی‌خورند. */
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(MEDIA)) {
        db.createObjectStore(MEDIA, { keyPath: 'id' }).createIndex('project', 'projectId');
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}

export const Library = {
  async put(p) { return tx(STORE, 'readwrite', s => s.put(p)); },
  async get(id) { return tx(STORE, 'readonly', s => s.get(id)); },
  async all() { return tx(STORE, 'readonly', s => s.getAll()); },
  async remove(id) {
    await this.removeMediaOf(id);
    return tx(STORE, 'readwrite', s => s.delete(id));
  },

  /* ── رسانهٔ لایه‌ها ── { id, projectId, type, name, blob } */
  async putMedia(m) { return tx(MEDIA, 'readwrite', s => s.put(m)); },
  async getMedia(id) { return tx(MEDIA, 'readonly', s => s.get(id)); },
  async mediaOf(projectId) {
    return tx(MEDIA, 'readonly', s => s.index('project').getAll(projectId));
  },
  async removeMedia(id) { return tx(MEDIA, 'readwrite', s => s.delete(id)); },
  async removeMediaOf(projectId) {
    const list = await this.mediaOf(projectId);
    for (const m of list) await this.removeMedia(m.id);
  },
};

/**
 * تحلیل «بی‌صدا» برای پروژه‌ای که هنوز آهنگ ندارد.
 * این‌طور می‌شود فقط با لایه‌ها (متن، شکل، ویدیو) هم کار کرد —
 * مثل یک ویرایشگر ویدیوی معمولی.
 */
export function silentAnalysis(duration = 15) {
  return {
    tempo: 120, beats: [], t_step: 0.5,
    rms: [0, 0], low: [0, 0], voc: [0, 0], centroid: [0, 0],
    duration, silent: true,
  };
}

/**
 * ساخت خودکار بخش‌ها از روی شکاف‌های بی‌کلام شعر.
 *
 * منطق: جایی که بیش از ۶ ثانیه هیچ کلمه‌ای نیست، یک بخش بی‌کلام
 * است. اول آهنگ تیتراژ، آخرش کارت پایان، و بقیه بند و کرس که
 * یکی‌درمیان عوض می‌شوند تا یکنواخت نشود.
 */
export function autoSections(lines, duration) {
  // بی‌شعر ← یک بخش خالی؛ نه جدول بخش‌های پروژهٔ نمونه (وگرنه صحنه‌های «نقاب» پشت پروژهٔ تازه پخش می‌شوند)
  const blank = () => [[0, +Math.max(1, duration || 15).toFixed(2), 'none', C.CRIMSON]];
  if (!lines.length) return blank();

  const GAP = 6.0;
  const out = [];
  const first = lines[0].words[0].t;
  const lastEnd = lines[lines.length - 1].words.at(-1).t + 2.5;

  const push = (t0, t1, style) => {
    if (t1 - t0 < 1.2) return;
    const acc = (style === 'intro' || style === 'cold' || style === 'mirror' ||
                 style === 'inst_c') ? C.GREY : C.CRIMSON;
    out.push([+t0.toFixed(2), +t1.toFixed(2), style, acc]);
  };

  // تیتراژ تا اولین کلمه
  if (first > 2.5) push(0, first - 0.3, 'intro');

  // بلوک‌های کلام، جدا شده با شکاف‌ها
  const blocks = [];
  let bStart = lines[0].words[0].t;
  for (let i = 0; i < lines.length - 1; i++) {
    const end = lines[i].words.at(-1).t + 1.2;
    const next = lines[i + 1].words[0].t;
    if (next - end > GAP) { blocks.push([bStart, end]); bStart = next; }
  }
  blocks.push([bStart, lastEnd]);

  const instStyles = ['inst_a', 'inst_b', 'inst_c'];
  let prevEnd = first > 2.5 ? first - 0.3 : 0;
  let vi = 0, ii = 0;

  for (const [s0, s1] of blocks) {
    if (s0 - prevEnd > 2) push(prevEnd, s0 - 0.2, instStyles[ii++ % 3]);
    // بلوک‌های بلند را نصف می‌کنیم تا بند و کرس عوض شوند
    const len = s1 - s0;
    if (len > 40) {
      const mid = s0 + len * 0.55;
      push(s0, mid, vi++ % 2 ? 'chorus' : 'verse');
      push(mid, s1, vi++ % 2 ? 'chorus' : 'verse');
    } else {
      push(s0, s1, vi++ % 2 ? 'chorus' : 'verse');
    }
    prevEnd = s1;
  }

  // کارت پایان
  if (duration - prevEnd > 3) push(prevEnd, duration, 'end');
  else if (out.length) out[out.length - 1][1] = duration;

  return out.length ? out : blank();
}

/** خواندن متن ساده و ساختن LRC تقریبی (وقتی کاربر فقط شعر دارد) */
export function plainToLines(text, duration, startAt = 5) {
  const raw = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!raw.length) return '';
  const span = Math.max(1, duration - startAt - 3);
  const per = span / raw.length;
  const fmt = t => {
    const m = Math.floor(t / 60), s = (t - m * 60);
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  };
  return raw.map((line, i) => {
    const t0 = startAt + i * per;
    const words = line.split(/\s+/);
    const wp = per * 0.8 / Math.max(1, words.length);
    const parts = words.map((w, k) => `<${fmt(t0 + k * wp)}>${w}`).join(' ');
    return `[${fmt(t0)}]${parts}`;
  }).join('\n');
}

