/**
 * پایتون واقعی داخل برنامه (Pyodide + numpy / scipy / Pillow)
 * ─────────────────────────────────────────────────────────────
 * هستهٔ Pyodide را از node_modules/pyodide و بسته‌های پایتون (فایل‌های .whl) را
 * یک بار هنگام بیلد در public/pyodide می‌گذارد تا داخل APK و نسخهٔ وب باشند:
 * برنامه روی گوشی هیچ‌چیزی از اینترنت دانلود نمی‌کند.
 * قبل از هر بیلد خودکار اجرا می‌شود (npm run build → prebuild).
 * اگر چیزی نبود فقط هشدار می‌دهد؛ برنامه آن وقت با مفسر داخلی خودش کار می‌کند.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const SRC = 'node_modules/pyodide';
const DST = 'public/pyodide';
const CORE = ['pyodide.mjs', 'pyodide.js', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
/** بسته‌هایی که همراه برنامه‌اند (با وابستگی‌هایشان) */
const PACKAGES = ['numpy', 'scipy', 'pillow'];

if (!CORE.every(f => existsSync(join(SRC, f)))) {
  console.warn('⚠ pyodide پیدا نشد (npm install) — کد پایتون با مفسر داخلی اجرا می‌شود.');
  process.exit(0);
}
mkdirSync(DST, { recursive: true });
for (const f of CORE) copyFileSync(join(SRC, f), join(DST, f));
const version = JSON.parse(readFileSync(join(SRC, 'package.json'), 'utf8')).version;
console.log(`✓ هستهٔ Pyodide ${version} در ${DST} کپی شد`);

const lock = JSON.parse(readFileSync(join(SRC, 'pyodide-lock.json'), 'utf8')).packages;
const need = [], seen = new Set(), stack = [...PACKAGES];
while (stack.length) {
  const k = stack.pop();
  if (seen.has(k) || !lock[k]) continue;
  seen.add(k); need.push(k); stack.push(...(lock[k].depends || []));
}
const sha = b => createHash('sha256').update(b).digest('hex');
const CDN = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
let ok = 0;
for (const k of need) {
  const { file_name: file, sha256 } = lock[k], out = join(DST, file);
  if (existsSync(out) && sha(readFileSync(out)) === sha256) { ok++; continue; }
  const local = join(SRC, file);
  if (existsSync(local) && sha(readFileSync(local)) === sha256) { copyFileSync(local, out); ok++; continue; }
  try {
    const r = await fetch(CDN + file);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (sha(buf) !== sha256) throw new Error('sha256 نادرست');
    writeFileSync(out, buf); ok++;
    console.log(`✓ ${k} (${(buf.length / 1e6).toFixed(1)} MB)`);
  } catch (e) {
    console.warn(`⚠ بستهٔ ${k} گرفته نشد (${e.message}) — بدون آن ادامه می‌دهیم.`);
  }
}
console.log(`✓ بسته‌های پایتون داخل برنامه: ${ok}/${need.length} (${need.join('، ')})`);
