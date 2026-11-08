/**
 * تست سازندهٔ دستور FFmpeg — فاز R8 (خالص، بدون wasm).
 *   node tests/ffmpeg.test.mjs
 */
import { CONTAINERS, VCODECS, ACODECS, RECIPES, defaultOptions, buildArgs, commandText, isAudioOnly, isImageOut } from '../src/export/ffargs.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

console.log('── پیش‌فرض و دسته‌ها ──');
{
  const o = defaultOptions();
  ok(o.container === 'mp4' && o.vcodec === 'libx264' && o.acodec === 'aac', 'پیش‌فرض: MP4/H.264/AAC');
  ok(CONTAINERS.some(([v]) => v === 'gif') && CONTAINERS.some(([v]) => v === 'mp3'), 'گیف و MP3 در قالب‌ها هستند');
  ok(isAudioOnly('mp3') && isAudioOnly('wav') && !isAudioOnly('mp4'), 'تشخیص فقط-صدا');
  ok(isImageOut('png') && !isImageOut('gif'), 'تشخیص خروجی عکس');
  ok(RECIPES.length === 7, `۷ دستورپخت آماده (تلگرام، واتس‌اپ، اینستا، HEVC، WebM، گیف، MP3)`);
}

console.log('── ساخت دستور ──');
{
  const { args, outName, mime } = buildArgs(defaultOptions(), 'in.mp4', 10);
  ok(outName === 'out.mp4' && mime === 'video/mp4', 'خروجی پیش‌فرض out.mp4 است');
  ok(args.includes('-c:v') && args.includes('libx264'), 'کدک ویدیو H.264');
  ok(args.includes('-crf') && args[args.indexOf('-crf') + 1] === '23', 'CRF ۲۳');
  ok(args.includes('-preset') && args[args.indexOf('-preset') + 1] === 'veryfast', 'پیش‌تنظیم veryfast');
  ok(args.includes('-vf') && args[args.indexOf('-vf') + 1].includes('scale=-2:720'), 'مقیاس به ارتفاع ۷۲۰');
  ok(args.includes('-movflags') && args.includes('+faststart'), 'faststart برای MP4');
  ok(commandText(args).startsWith('ffmpeg -y -i in.mp4'), 'متن دستور با ffmpeg شروع می‌شود');

  const w = buildArgs({ ...defaultOptions(), container: 'webm', vcodec: 'libvpx-vp9', acodec: 'libopus' }, 'in.mp4', 10);
  ok(w.outName === 'out.webm' && w.mime === 'video/webm', 'خروجی WebM');
  ok(w.args.includes('libvpx-vp9') && w.args.includes('libopus'), 'کدک‌های WebM درست‌اند');
  ok(!w.args.includes('+faststart'), 'faststart فقط برای MP4 است');

  const g = buildArgs({ ...defaultOptions(), container: 'gif', gifWidth: 480, gifFps: 15 }, 'in.mp4', 10);
  ok(g.outName === 'out.gif' && g.mime === 'image/gif', 'خروجی گیف');
  ok(g.args.some(a => a.includes('palettegen')), 'گیف با پالت ساخته می‌شود');
  ok(g.args.includes('-loop') && g.args[g.args.indexOf('-loop') + 1] === '0', 'گیف بی‌نهایت تکرار می‌شود');

  const m = buildArgs({ ...defaultOptions(), container: 'mp3', abitrate: 192 }, 'in.mp4', 10);
  ok(m.outName === 'out.mp3' && m.mime === 'audio/mpeg', 'خروجی MP3');
  ok(m.args.includes('-vn') && m.args.includes('libmp3lame'), 'فقط صدا با libmp3lame');
  ok(!m.args.includes('-c:v'), 'در MP3 کدک ویدیو نیست');

  const p = buildArgs({ ...defaultOptions(), container: 'png', snapAt: 2.5 }, 'in.mp4', 10);
  ok(p.outName === 'out.png' && p.args.includes('-frames:v') && p.args.includes('1'), 'عکس: یک فریم');
  ok(p.args[p.args.indexOf('-ss') + 1] === '2.5', 'عکس در ثانیهٔ ۲٫۵ گرفته می‌شود');

  const c = buildArgs({ ...defaultOptions(), vcodec: 'copy', acodec: 'copy' }, 'in.mp4', 10);
  ok(c.args.includes('copy') && !c.args.includes('-crf'), 'کپی بدون تغییر CRF ندارد');

  const f = buildArgs({ ...defaultOptions(), fadeIn: 1, fadeOut: 2 }, 'in.mp4', 10);
  const vf = f.args[f.args.indexOf('-vf') + 1];
  ok(vf.includes('fade=t=in') && vf.includes('fade=t=out'), 'محو ورود و خروج در فیلتر ویدیو');
  const af = f.args[f.args.indexOf('-af') + 1];
  ok(af.includes('afade=t=in') && af.includes('afade=t=out:st=8'), 'محو صدا با زمان درست (۱۰-۲=۸)');

  const s = buildArgs({ ...defaultOptions(), speed: 2 }, 'in.mp4', 10);
  ok(s.args[s.args.indexOf('-vf') + 1].includes('setpts=0.500*PTS'), 'سرعت ۲× ویدیو را نیم می‌کند');
  ok(s.args[s.args.indexOf('-af') + 1].includes('atempo=2'), 'سرعت ۲× صدا را atempo می‌کند');
}

console.log('── دستورپخت‌ها ──');
{
  for (const r of RECIPES) {
    const o = { ...defaultOptions(), ...r.o };
    const { args, outName } = buildArgs(o, 'in.mp4', 10);
    ok(args.length > 4 && outName.startsWith('out.'), `دستورپخت ${r.label} دستور معتبر می‌سازد (${outName})`);
  }
  const wa = { ...defaultOptions(), ...RECIPES.find(r => r.id === 'whatsapp').o };
  ok(wa.height === 720 && wa.abitrate === 96, 'واتس‌اپ: ۷۲۰p و صدای ۹۶k');
  const gif = { ...defaultOptions(), ...RECIPES.find(r => r.id === 'gif').o };
  ok(gif.container === 'gif', 'دستورپخت گیف قالب را عوض می‌کند');
}

console.log(fail === 0 ? '\n✅ همهٔ تست‌ها گذشت' : `\n❌ ${fail} تست ناموفق`);
process.exit(fail ? 1 : 0);
