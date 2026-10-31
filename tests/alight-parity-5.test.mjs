/**
 * تست فاز ۵ هم‌ترازی با Alight Motion — پریست‌های خروجی.
 *   node tests/alight-parity-5.test.mjs
 */
import { EXPORT_PRESETS, presetById, presetDims, applyPreset, estimateMB } from '../src/motion/exportPresets.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✅' : '  ❌') + ' ' + m); if (!c) fail++; };

console.log('── پریست‌های خروجی ──');
ok(EXPORT_PRESETS.length >= 5, `حداقل ۵ پریست هست (got ${EXPORT_PRESETS.length})`);
for (const p of EXPORT_PRESETS) {
  ok([540, 720, 1080, 2160].includes(p.res), `پریست ${p.id}: رزولوشن ${p.res} از رزولوشن‌های موجود است`);
  ok([24, 30, 60].includes(p.fps), `پریست ${p.id}: فریم ${p.fps} از فریم‌های موجود است`);
}
{
  // قاب عمودی ۹:۱۶ با ضلع کوچک ۱۰۸۰ → ۱۰۸۰×۱۹۲۰
  const d = presetDims(presetById('reels'), 1080, 1920);
  ok(d.w === 1080 && d.h === 1920, `ریلز عمودی: ۱۰۸۰×۱۹۲۰ (got ${d.w}×${d.h})`);
  // قاب افقی ۱۶:۹ با همان پریست → ۱۹۲۰×۱۰۸۰
  const d2 = presetDims(presetById('reels'), 1920, 1080);
  ok(d2.w === 1920 && d2.h === 1080, `ریلز افقی: ۱۹۲۰×۱۰۸۰ (got ${d2.w}×${d2.h})`);
  ok(d.w % 2 === 0 && d.h % 2 === 0, 'ابعاد زوج‌اند (انکودر رد نمی‌کند)');
  const s = applyPreset(presetById('draft'), 1920, 1080);
  ok(s.container === 'mp4' && s.fps === 24 && s.bitrateMbps >= 1 && s.bitrateMbps <= 60,
    `پیش‌نمایش: mp4، ۲۴ فریم، بیت‌ریت ${s.bitrateMbps} مگابیت در بازهٔ مجاز`);
  const mb = estimateMB(s, 60);
  ok(mb > 0 && mb < 500, `تخمین حجم ۶۰ ثانیه: ${mb.toFixed(0)} مگابایت (معقول)`);
  ok(presetById('nope') === null, 'پریست ناشناخته null برمی‌گرداند');
}

console.log(fail ? `❌ ${fail} خطا` : '✅ همهٔ تست‌ها گذشت');
process.exit(fail ? 1 : 0);
