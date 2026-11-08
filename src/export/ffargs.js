/**
 * سازندهٔ دستور FFmpeg — فاز R8 (خالص، بدون DOM؛ در Node تست می‌شود)
 * پورتِ بریده‌شدهٔ سازندهٔ برنامهٔ قبلی: قالب، کدک، کیفیت، اندازه،
 * سرعت، بلندی، محو و گیف/عکس. خروجی دقیقاً همان چیزی است که اگر
 * ffmpeg را روی کامپیوتر اجرا می‌کردید می‌نوشتید.
 */

export const CONTAINERS = [
  ['mp4', 'MP4 (همه‌جا پخش می‌شود)'], ['webm', 'WebM (وب)'], ['gif', 'GIF متحرک'],
  ['mp3', 'فقط صدا MP3'], ['wav', 'فقط صدا WAV'], ['png', 'یک عکس PNG از ویدیو'],
];

export const VCODECS = {
  mp4: [['libx264', 'H.264 (سازگارترین)'], ['libx265', 'H.265/HEVC (کم‌حجم‌تر)'], ['copy', 'کپی بدون تغییر']],
  webm: [['libvpx-vp9', 'VP9'], ['libvpx', 'VP8 (سریع‌تر)'], ['copy', 'کپی بدون تغییر']],
};
export const ACODECS = {
  mp4: [['aac', 'AAC'], ['libmp3lame', 'MP3'], ['copy', 'کپی'], ['none', 'بدون صدا']],
  webm: [['libopus', 'Opus'], ['libvorbis', 'Vorbis'], ['none', 'بدون صدا']],
};
export const PRESETS_X264 = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];

export function defaultOptions() {
  return {
    container: 'mp4', vcodec: 'libx264', acodec: 'aac',
    crf: 23, preset: 'veryfast',
    height: 720, fps: 30,
    speed: 1, volume: 0, fadeIn: 0, fadeOut: 0,
    abitrate: 128,
    gifWidth: 480, gifFps: 15, snapAt: 1,
  };
}

export const RECIPES = [
  { id: 'telegram', label: 'تلگرام کم‌حجم', o: { crf: 28, preset: 'veryfast', height: 720, fps: 30, abitrate: 96 } },
  { id: 'whatsapp', label: 'واتس‌اپ (زیر ۱۶ مگ)', o: { crf: 28, preset: 'fast', height: 720, fps: 30, abitrate: 96 } },
  { id: 'insta', label: 'اینستاگرام ریلز', o: { crf: 20, preset: 'medium', height: 1920, fps: 30, abitrate: 128 } },
  { id: 'hevc', label: 'نصف حجم (HEVC)', o: { vcodec: 'libx265', crf: 26, preset: 'fast', abitrate: 128 } },
  { id: 'webm', label: 'وب (WebM)', o: { container: 'webm', vcodec: 'libvpx-vp9', acodec: 'libopus', crf: 33, abitrate: 112 } },
  { id: 'gif', label: 'گیف', o: { container: 'gif', gifWidth: 480, gifFps: 15 } },
  { id: 'mp3', label: 'استخراج صدا MP3', o: { container: 'mp3', abitrate: 192 } },
];

export const isAudioOnly = c => c === 'mp3' || c === 'wav';
export const isImageOut = c => c === 'png';

const MIME = {
  mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif',
  mp3: 'audio/mpeg', wav: 'audio/wav', png: 'image/png',
};

function vf(o) {
  const f = [];
  if (o.height) f.push(`scale=-2:${o.height}`);
  if (o.fps) f.push(`fps=${o.fps}`);
  if (o.speed && o.speed !== 1) f.push(`setpts=${(1 / o.speed).toFixed(3)}*PTS`);
  if (o.fadeIn) f.push(`fade=t=in:st=0:d=${o.fadeIn}`);
  if (o.fadeOut) f.push(`fade=t=out:st=${o.fadeOut}:d=1`);
  return f;
}

/**
 * ساخت آرگومان‌ها از تنظیمات.
 * @returns {{args:string[], outName:string, mime:string}}
 */
export function buildArgs(o, inName, duration = 0) {
  const c = o.container;
  const args = ['-y', '-i', inName];
  const outName = `out.${c === 'png' ? 'png' : c}`;
  if (isAudioOnly(c)) {
    args.push('-vn');
    if (o.acodec) args.push('-c:a', c === 'mp3' ? 'libmp3lame' : 'pcm_s16le');
    if (o.abitrate) args.push('-b:a', `${o.abitrate}k`);
    if (o.volume) args.push('-af', `volume=${o.volume}dB`);
    args.push(outName);
    return { args, outName, mime: MIME[c] };
  }
  if (isImageOut(c)) {
    args.push('-ss', String(o.snapAt ?? 1), '-frames:v', '1', '-q:v', '2', outName);
    return { args, outName, mime: MIME[c] };
  }
  if (c === 'gif') {
    const w = o.gifWidth || 480, fps = o.gifFps || 15;
    args.push('-vf', `fps=${fps},scale=${w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop', '0', outName);
    return { args, outName, mime: MIME[c] };
  }
  const v = vf(o);
  if (v.length) args.push('-vf', v.join(','));
  const vcodec = o.vcodec || 'libx264';
  args.push('-c:v', vcodec);
  if (vcodec !== 'copy') {
    args.push('-crf', String(o.crf ?? 23));
    if ((vcodec === 'libx264' || vcodec === 'libx265') && o.preset) args.push('-preset', o.preset);
    if (vcodec === 'libx264') args.push('-pix_fmt', 'yuv420p');
    if (c === 'mp4') args.push('-movflags', '+faststart');
  }
  if (o.acodec === 'none') args.push('-an');
  else if (o.acodec && o.acodec !== 'copy') {
    args.push('-c:a', o.acodec);
    if (o.abitrate) args.push('-b:a', `${o.abitrate}k`);
  } else if (o.acodec === 'copy') args.push('-c:a', 'copy');
  const af = [];
  if (o.speed && o.speed !== 1) af.push(`atempo=${o.speed}`);
  if (o.volume) af.push(`volume=${o.volume}dB`);
  if (o.fadeIn) af.push(`afade=t=in:st=0:d=${o.fadeIn}`);
  if (o.fadeOut && duration) af.push(`afade=t=out:st=${Math.max(0, duration - o.fadeOut)}:d=${o.fadeOut}`);
  if (af.length) args.push('-af', af.join(','));
  args.push(outName);
  return { args, outName, mime: MIME[c] };
}

/** نمایش دستور به‌شکل خوانا (برای یادگیری). */
export function commandText(args) {
  return 'ffmpeg ' + args.map(a => (/\s/.test(a) ? `'${a}'` : a)).join(' ');
}
