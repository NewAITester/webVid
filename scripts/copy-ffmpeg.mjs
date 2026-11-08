/**
 * هستهٔ FFmpeg (ffmpeg-core.js و ffmpeg-core.wasm) را از node_modules
 * به public/ffmpeg کپی می‌کند تا داخل APK باشد و بدون اینترنت کار کند.
 * فقط دستی اجرا می‌شود (node scripts/copy-ffmpeg.mjs) — در بیلد خودکار
 * نیست، چون ورک‌فلو صراحتاً می‌خواهد باینری FFmpeg داخل APK نرود
 * (android.yml: test ! -d .../ffmpeg) و برنامه هنگام نیاز از CDN بارش کند.
 * اگر بسته نصب نشده باشد فقط هشدار می‌دهد.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'node_modules/@ffmpeg/core/dist/esm';
const DST = 'public/ffmpeg';
const FILES = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

if (!FILES.every(f => existsSync(join(SRC, f)))) {
  console.warn('⚠ @ffmpeg/core پیدا نشد — FFmpeg هنگام اجرا از اینترنت بار می‌شود.');
  process.exit(0);
}
mkdirSync(DST, { recursive: true });
for (const f of FILES) copyFileSync(join(SRC, f), join(DST, f));
console.log('✓ هستهٔ FFmpeg در public/ffmpeg کپی شد');
