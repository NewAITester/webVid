/**
 * سازندهٔ دستور FFmpeg — از تنظیمات فرم به آرایهٔ آرگومان
 * ─────────────────────────────────────────────────────────────
 * این فایل هیچ وابستگی‌ای ندارد و در Node تست می‌شود. خروجی‌اش
 * دقیقاً همان چیزی است که اگر ffmpeg را روی کامپیوتر اجرا می‌کردید
 * می‌نوشتید — پس هر چه اینجا یاد بگیرید، بیرون از برنامه هم به کار
 * می‌آید.
 */

export const CONTAINERS = [
  ['mp4', 'MP4 (همه‌جا پخش می‌شود)'], ['webm', 'WebM (وب)'], ['mkv', 'MKV'], ['mov', 'MOV (اپل)'],
  ['gif', 'GIF متحرک'], ['webp', 'WebP متحرک'],
  ['mp3', 'فقط صدا MP3'], ['m4a', 'فقط صدا AAC'], ['ogg', 'فقط صدا Ogg'], ['wav', 'فقط صدا WAV'],
  ['png', 'یک عکس PNG از ویدیو'], ['jpg', 'یک عکس JPG از ویدیو'],
];

export const VCODECS = {
  mp4: [['libx264', 'H.264 (سازگارترین)'], ['libx265', 'H.265/HEVC (کم‌حجم‌تر)'], ['mpeg4', 'MPEG-4 قدیمی'], ['copy', 'کپی بدون تغییر']],
  mov: [['libx264', 'H.264'], ['libx265', 'H.265/HEVC'], ['copy', 'کپی بدون تغییر']],
  mkv: [['libx264', 'H.264'], ['libx265', 'H.265/HEVC'], ['libvpx-vp9', 'VP9'], ['copy', 'کپی بدون تغییر']],
  webm: [['libvpx-vp9', 'VP9'], ['libvpx', 'VP8 (سریع‌تر)'], ['copy', 'کپی بدون تغییر']],
};
export const ACODECS = {
  mp4: [['aac', 'AAC'], ['libmp3lame', 'MP3'], ['copy', 'کپی'], ['none', 'بدون صدا']],
  mov: [['aac', 'AAC'], ['copy', 'کپی'], ['none', 'بدون صدا']],
  mkv: [['aac', 'AAC'], ['libopus', 'Opus'], ['libmp3lame', 'MP3'], ['libvorbis', 'Vorbis'], ['copy', 'کپی'], ['none', 'بدون صدا']],
  webm: [['libopus', 'Opus'], ['libvorbis', 'Vorbis'], ['none', 'بدون صدا']],
};
export const PRESETS_X264 = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];
export const TUNES = [['', 'بدون'], ['film', 'فیلم'], ['animation', 'انیمیشن و گرافیک'], ['grain', 'حفظ دانه'],
  ['stillimage', 'تصویر ثابت'], ['fastdecode', 'پخش سریع'], ['zerolatency', 'پخش زنده']];

/** تنظیمات پیش‌فرض فرم */
export function defaultOptions() {
  return {
    container: 'mp4', vcodec: 'libx264', acodec: 'aac',
    rate: 'crf', crf: 23, vbitrate: 4000, targetMB: 15,
    preset: 'veryfast', tune: '', profile: 'high', pixfmt: true, gop: 0,
    height: 0, width: 0, fps: 0,
    start: '', end: '', speed: 1,
    rotate: 'none', crop: 'none',
    denoise: 0, sharpen: 0, bright: 0, contrast: 1, sat: 1, gray: false, vignette: false,
    fadeIn: 0, fadeOut: 0, deband: false, reverse: false,
    abitrate: 128, arate: 0, channels: 0, volume: 0, loudnorm: false, afadeIn: 0, afadeOut: 0,
    faststart: true, title: '', stripMeta: false,
    gifWidth: 480, gifFps: 15, gifLoop: 0,
    snapAt: 1,
  };
}

/** پیش‌تنظیم‌های آماده — فقط فیلدهایی که با پیش‌فرض فرق دارند */
export const RECIPES = [
  { id: 'telegram', label: 'تلگرام کم‌حجم', o: { crf: 28, preset: 'veryfast', height: 720, fps: 30, abitrate: 96 } },
  { id: 'whatsapp', label: 'واتس‌اپ (زیر ۱۶ مگ)', o: { rate: 'size', targetMB: 15, height: 720, fps: 30, abitrate: 96, preset: 'fast' } },
  { id: 'insta', label: 'اینستاگرام ریلز', o: { crf: 20, preset: 'medium', height: 1920, fps: 30, abitrate: 128, profile: 'high' } },
  { id: 'youtube', label: 'یوتیوب باکیفیت', o: { crf: 18, preset: 'slow', abitrate: 192, tune: 'animation' } },
  { id: 'hevc', label: 'نصف حجم (HEVC)', o: { vcodec: 'libx265', crf: 26, preset: 'fast', abitrate: 128 } },
  { id: 'webm', label: 'وب (WebM)', o: { container: 'webm', vcodec: 'libvpx-vp9', acodec: 'libopus', crf: 33, abitrate: 112 } },
  { id: 'gif', label: 'گیف', o: { container: 'gif', gifWidth: 480, gifFps: 15 } },
  { id: 'mp3', label: 'استخراج صدا MP3', o: { container: 'mp3', abitrate: 192 } },
  { id: 'thumb', label: 'عکس کاور', o: { container: 'jpg', snapAt: 1 } },
  { id: 'tiny', label: 'بسیار کم‌حجم', o: { crf: 32, preset: 'veryfast', height: 480, fps: 24, abitrate: 64, channels: 1 } },
];

const AUDIO_ONLY = new Set(['mp3', 'm4a', 'ogg', 'wav']);
const IMAGE_OUT = new Set(['png', 'jpg']);
export const isAudioOnly = c => AUDIO_ONLY.has(c);
export const isImageOut = c => IMAGE_OUT.has(c);

/** ثانیه از متن «۱:۲۳٫۵» یا «83.5» */
export function parseTime(s) {
  if (s === '' || s === null || s === undefined) return null;
  const t = String(s).trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace('٫', '.');
  if (!t) return null;
  const parts = t.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n))) return null;
  return parts.reduce((a, b) => a * 60 + b, 0);
}

/** atempo فقط بین ۰٫۵ و ۲ است؛ سرعت‌های دیگر با زنجیره ساخته می‌شوند */
export function atempoChain(speed) {
  const out = [];
  let s = speed;
  while (s > 2) { out.push('atempo=2'); s /= 2; }
  while (s < 0.5) { out.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1) > 1e-3) out.push(`atempo=${+s.toFixed(4)}`);
  return out;
}

/**
 * @param {object} o         تنظیمات (از defaultOptions)
 * @param {string} inName    نام فایل ورودی در حافظهٔ ffmpeg
 * @param {number} duration  طول ورودی (ثانیه) — برای «حجم هدف» و محو پایانی
 * @returns {{args:string[], outName:string, mime:string, twoPass:boolean}}
 */
export function buildArgs(o, inName = 'in.mp4', duration = 0) {
  const c = o.container;
  const outName = `out.${c}`;
  const args = ['-hide_banner', '-y'];
  const start = parseTime(o.start), end = parseTime(o.end);
  if (start !== null && start > 0) args.push('-ss', String(start));
  if (end !== null && end > 0) args.push('-to', String(end));
  args.push('-i', inName);

  const clipDur = Math.max(0.1, ((end ?? duration) || duration || 0) - (start ?? 0)) / (o.speed || 1);
  const mime = {
    mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm',
    gif: 'image/gif', webp: 'image/webp', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg',
    wav: 'audio/wav', png: 'image/png', jpg: 'image/jpeg',
  }[c] || 'application/octet-stream';

  /* ── عکس تکی ── */
  if (IMAGE_OUT.has(c)) {
    const at = Math.max(0, +o.snapAt || 0);
    // -ss بعد از -i دقیق‌تر است (فریم‌به‌فریم)
    args.push('-ss', String(at), '-frames:v', '1');
    const vf = videoFilters(o, clipDur);
    if (vf.length) args.push('-vf', vf.join(','));
    if (c === 'jpg') args.push('-q:v', '2');
    args.push(outName);
    return { args, outName, mime, twoPass: false };
  }

  /* ── گیف و وب‌پی متحرک ── */
  if (c === 'gif' || c === 'webp') {
    const base = videoFilters({ ...o, height: 0, fps: 0 }, clipDur);
    const w = Math.max(16, o.gifWidth | 0 || 480);
    const chain = [...base, `fps=${o.gifFps || 15}`, `scale=${w}:-2:flags=lanczos`].join(',');
    if (c === 'gif') {
      // پالت اختصاصی: کیفیت گیف را چند برابر می‌کند
      args.push('-filter_complex', `[0:v]${chain},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`);
      args.push('-loop', String(o.gifLoop | 0));
    } else {
      args.push('-vf', chain, '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(Math.max(0, 100 - (o.crf | 0) * 2)), '-loop', String(o.gifLoop | 0));
    }
    args.push('-an', outName);
    return { args, outName, mime, twoPass: false };
  }

  /* ── فقط صدا ── */
  if (AUDIO_ONLY.has(c)) {
    args.push('-vn');
    pushAudio(args, o, clipDur, { mp3: 'libmp3lame', m4a: 'aac', ogg: 'libvorbis', wav: 'pcm_s16le' }[c]);
    args.push(outName);
    return { args, outName, mime, twoPass: false };
  }

  /* ── ویدیو ── */
  const vc = o.vcodec;
  if (vc === 'copy') {
    args.push('-c:v', 'copy');
  } else {
    const vf = videoFilters(o, clipDur);
    if (vf.length) args.push('-vf', vf.join(','));
    args.push('-c:v', vc);
    const x26 = vc === 'libx264' || vc === 'libx265';
    const vpx = vc.startsWith('libvpx');
    if (o.rate === 'crf') {
      if (x26) args.push('-crf', String(o.crf));
      else if (vpx) args.push('-crf', String(Math.min(63, o.crf)), '-b:v', '0');
      else args.push('-q:v', String(Math.max(1, Math.min(31, Math.round(o.crf / 2)))));
    } else {
      let kbps = o.vbitrate;
      if (o.rate === 'size' && clipDur > 0) {
        // حجم هدف ← بیت‌ریت: (مگابایت × ۸۱۹۲) ÷ ثانیه − صدا، با ۴٪ حاشیهٔ اطمینان
        const audio = o.acodec === 'none' ? 0 : o.abitrate;
        kbps = Math.max(80, Math.floor(((o.targetMB * 8192) / clipDur) * 0.96 - audio));
      }
      args.push('-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 2}k`);
    }
    if (x26) {
      args.push('-preset', o.preset || 'veryfast');
      if (o.tune) args.push('-tune', o.tune);
      if (vc === 'libx264' && o.profile) args.push('-profile:v', o.profile);
      if (vc === 'libx265') args.push('-tag:v', 'hvc1');   // تا روی آیفون و مک هم پخش شود
    }
    if (vpx) {
      const fast = ['ultrafast', 'superfast', 'veryfast', 'faster'].includes(o.preset);
      args.push('-deadline', fast ? 'realtime' : 'good', '-cpu-used', fast ? '8' : '4', '-row-mt', '1');
    }
    if (o.pixfmt) args.push('-pix_fmt', 'yuv420p');
    if (o.gop > 0) args.push('-g', String(o.gop));
  }

  if (o.acodec === 'none') args.push('-an');
  else pushAudio(args, o, clipDur, o.acodec);

  if ((c === 'mp4' || c === 'mov') && o.faststart) args.push('-movflags', '+faststart');
  if (o.stripMeta) args.push('-map_metadata', '-1');
  if (o.title) args.push('-metadata', `title=${o.title}`);
  args.push(outName);
  return { args, outName, mime, twoPass: false };
}

function pushAudio(args, o, clipDur, codec) {
  if (codec === 'copy') { args.push('-c:a', 'copy'); return; }
  const af = [];
  if (o.speed && Math.abs(o.speed - 1) > 1e-3) af.push(...atempoChain(o.speed));
  if (o.reverse) af.push('areverse');
  if (o.volume) af.push(`volume=${o.volume}dB`);
  if (o.loudnorm) af.push('loudnorm=I=-14:TP=-1.5:LRA=11');
  if (o.afadeIn > 0) af.push(`afade=t=in:st=0:d=${o.afadeIn}`);
  if (o.afadeOut > 0 && clipDur > o.afadeOut) af.push(`afade=t=out:st=${+(clipDur - o.afadeOut).toFixed(3)}:d=${o.afadeOut}`);
  if (af.length) args.push('-af', af.join(','));
  args.push('-c:a', codec);
  if (codec !== 'pcm_s16le') args.push('-b:a', `${o.abitrate}k`);
  if (o.arate) args.push('-ar', String(o.arate));
  if (o.channels) args.push('-ac', String(o.channels));
}

/** فیلترهای تصویری به ترتیب درست: برش ← چرخش ← سرعت ← رنگ ← اندازه ← فریم ← محو */
export function videoFilters(o, clipDur = 0) {
  const f = [];
  const crop = {
    '9:16': 'crop=min(iw\\,ih*9/16):min(ih\\,iw*16/9)',
    '16:9': 'crop=min(iw\\,ih*16/9):min(ih\\,iw*9/16)',
    '1:1': 'crop=min(iw\\,ih):min(iw\\,ih)',
    '4:5': 'crop=min(iw\\,ih*4/5):min(ih\\,iw*5/4)',
  }[o.crop];
  if (crop) f.push(crop);
  const rot = { cw: 'transpose=1', ccw: 'transpose=2', '180': 'transpose=1,transpose=1', hflip: 'hflip', vflip: 'vflip' }[o.rotate];
  if (rot) f.push(rot);
  if (o.reverse) f.push('reverse');
  if (o.speed && Math.abs(o.speed - 1) > 1e-3) f.push(`setpts=PTS/${o.speed}`);
  if (o.denoise > 0) f.push(`hqdn3d=${(o.denoise * 0.04).toFixed(2)}:${(o.denoise * 0.03).toFixed(2)}:${(o.denoise * 0.06).toFixed(2)}:${(o.denoise * 0.045).toFixed(2)}`);
  if (o.deband) f.push('gradfun=1.2:16');
  if (o.sharpen > 0) f.push(`unsharp=5:5:${(o.sharpen / 50).toFixed(2)}:5:5:0`);
  if (o.bright || o.contrast !== 1 || o.sat !== 1) {
    f.push(`eq=brightness=${(+o.bright).toFixed(3)}:contrast=${(+o.contrast).toFixed(3)}:saturation=${(+o.sat).toFixed(3)}`);
  }
  if (o.gray) f.push('hue=s=0');
  if (o.vignette) f.push('vignette=PI/5');
  if (o.height > 0) f.push(`scale=-2:${o.height}:flags=lanczos`);
  else if (o.width > 0) f.push(`scale=${o.width}:-2:flags=lanczos`);
  if (o.fps > 0) f.push(`fps=${o.fps}`);
  if (o.fadeIn > 0) f.push(`fade=t=in:st=0:d=${o.fadeIn}`);
  if (o.fadeOut > 0 && clipDur > o.fadeOut) f.push(`fade=t=out:st=${+(clipDur - o.fadeOut).toFixed(3)}:d=${o.fadeOut}`);
  return f;
}

/** نمایش دستور برای کاربر — همان چیزی که در ترمینال می‌نوشت */
export function commandText(args) {
  return 'ffmpeg ' + args.map(a => (/[\s;,\[\]'"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
}

/** متن دستور دلخواه ← آرایه (با احترام به نقل‌قول‌ها) */
export function parseCommand(text) {
  const out = [];
  let cur = '', q = null, esc = false, any = false;
  for (const ch of String(text).trim()) {
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (q) { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; any = true; continue; }
    if (/\s/.test(ch)) { if (cur || any) out.push(cur); cur = ''; any = false; continue; }
    cur += ch;
  }
  if (cur || any) out.push(cur);
  if (out[0] === 'ffmpeg') out.shift();
  return out;
}
