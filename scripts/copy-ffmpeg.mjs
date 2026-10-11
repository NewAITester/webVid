/**
 * هستهٔ FFmpeg (ffmpeg-core.js و ffmpeg-core.wasm) را از node_modules
 * به public/ffmpeg کپی می‌کند تا داخل APK باشد و بدون اینترنت کار کند.
 * قبل از هر بیلد خودکار اجرا می‌شود (npm run build → prebuild).
 * اگر بسته نصب نشده باشد فقط هشدار می‌دهد؛ برنامه آن وقت از CDN بار می‌کند.
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
