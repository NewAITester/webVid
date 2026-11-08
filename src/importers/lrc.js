/**
 * ایمپورت شعر LRC — فاز R7 (خالص، بدون DOM)
 *
 * هم LRC ساده ([mm:ss.xx]متن) و هم LRC پیشرفته با برچسب کلمه
 * ([mm:ss.xx]<mm:ss.xx>کلمه <mm:ss.xx>کلمه) را می‌خواند؛
 * [offset:ms] و برچسب‌های متا ([ti:]/[ar:]/[al:]/[by:]) هم پشتیبانی می‌شوند.
 */
import { newLayer } from '../core/schema.js';

const TAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

function toSec(m, s, frac) {
  const f = frac == null ? 0 : +frac / (frac.length === 1 ? 10 : frac.length === 2 ? 100 : 1000);
  return +m * 60 + +s + f;
}

/**
 * تجزیهٔ متن LRC → {meta, lines:[{start, end, text, words:[{t, text}]}]}
 * زمان‌ها ثانیه‌اند؛ end هر خط = شروع خط بعد (خط آخر: آخرین کلمه + ۲ ثانیه).
 */
export function parseLrc(text) {
  const meta = {};
  const lines = [];
  let offset = 0;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const metaM = /^\[(ti|ar|al|by|offset):([^\]]*)\]/.exec(line);
    if (metaM) {
      if (metaM[1] === 'offset') offset = (+metaM[2] || 0) / 1000;
      else meta[metaM[1]] = metaM[2].trim();
      continue;
    }
    TAG.lastIndex = 0;
    const tags = [...line.matchAll(TAG)];
    if (!tags.length) continue;
    const start = toSec(tags[0][1], tags[0][2], tags[0][3]) + offset;
    let rest = line.slice(tags[0][0].length);
    // برچسب‌های زمانیِ اضافه در ابتدای خط (چند زمان برای یک متن) نادیده گرفته می‌شوند
    rest = rest.replace(/^(\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\])+/g, '').trim();
    const words = [];
    WORD_TAG.lastIndex = 0;
    const wtags = [...rest.matchAll(WORD_TAG)];
    if (wtags.length) {
      for (let i = 0; i < wtags.length; i++) {
        const wt = wtags[i];
        const wStart = wt.index + wt[0].length;
        const wEnd = i + 1 < wtags.length ? wtags[i + 1].index : rest.length;
        const wtext = rest.slice(wStart, wEnd).trim();
        if (!wtext) continue;
        words.push({ t: toSec(wt[1], wt[2], wt[3]) + offset, text: wtext });
      }
    }
    const textOut = words.length ? words.map(w => w.text).join(' ') : rest.replace(/<[^>]*>/g, '').trim();
    if (!textOut) continue;
    lines.push({ start, end: null, text: textOut, words });
  }
  lines.sort((a, b) => a.start - b.start);
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    const lastWord = lines[i].words.length ? lines[i].words[lines[i].words.length - 1].t : lines[i].start;
    lines[i].end = next ? next.start : lastWord + 2;
  }
  return { meta, lines };
}

/**
 * خط‌های شعر → لایه‌های متن (یکی برای هر خط، با زمان‌بندی خودش).
 * زمان‌بندی کلمه‌ها روی layer.text.words می‌ماند تا کارائوکهٔ آینده از آن استفاده کند.
 */
export function lrcToLayers(lines, { x = 360, y = 640 } = {}) {
  return lines.map((ln, i) => {
    const l = newLayer('text', {
      name: ln.text.length > 18 ? ln.text.slice(0, 18) + '…' : ln.text,
      start: ln.start,
      end: ln.end,
    });
    l.text.content = ln.text;
    l.text.words = ln.words.map(w => ({ t: +(w.t - ln.start).toFixed(2), text: w.text }));
    l.transform.x = x; l.transform.y = y;
    return l;
  });
}
