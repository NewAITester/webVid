/**
 * پایتون واقعی داخل برنامه (Pyodide + کتابخانه‌های پایتون)
 * ─────────────────────────────────────────────────────────────
 * هستهٔ Pyodide را از node_modules/pyodide و بسته‌های پایتون (فایل‌های .whl) را
 * یک بار هنگام بیلد در public/pyodide می‌گذارد تا داخل APK و نسخهٔ وب باشند:
 * برنامه روی گوشی هیچ‌چیزی از اینترنت دانلود نمی‌کند. هر بسته فقط وقتی بار می‌شود
 * که کد وارد‌شده آن را import کند.
 * قبل از هر بیلد خودکار اجرا می‌شود (npm run build → prebuild).
 * اگر چیزی نبود فقط هشدار می‌دهد؛ برنامه آن وقت بدون آن بسته (یا با مفسر داخلی) کار می‌کند.
 * فهرست بسته‌ها و نام import آن‌ها در public/pyodide/bundled.json نوشته می‌شود.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const SRC = 'node_modules/pyodide';
const DST = 'public/pyodide';
const CORE = ['pyodide.mjs', 'pyodide.js', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
/** بسته‌های ساخته‌شدهٔ Pyodide که همراه برنامه‌اند (با همهٔ وابستگی‌هایشان) */
const PACKAGES = [
  // عدد و علم
  'numpy', 'scipy', 'pandas', 'sympy', 'mpmath', 'networkx', 'scikit-learn', 'shapely', 'pyclipper', 'pywavelets',
  // تصویر و ویدیو
  'pillow', 'pi-heif', 'opencv-python', 'imageio', 'scikit-image', 'matplotlib', 'colorspacious', 'pygame-ce', 'svgwrite', 'fonttools',
  // صدا
  'soundfile', 'soxr', 'audioop-lts',
  // متن و داده
  'pyyaml', 'regex', 'lxml', 'beautifulsoup4', 'rich', 'tqdm', 'more-itertools', 'sortedcontainers',
];
/** بسته‌های پایتونِ خالص از PyPI (نسخهٔ ثابت؛ نام import ← وابستگی‌ها) */
const PYPI = [
  { name: 'opensimplex', version: '0.4.5.1', imports: ['opensimplex'], deps: ['numpy'] },
  { name: 'perlin-noise', version: '1.14', imports: ['perlin_noise'], deps: [] },
  { name: 'vnoise', version: '0.1.0', imports: ['vnoise'], deps: ['numpy'] },
  { name: 'easing-functions', version: '1.0.4', imports: ['easing_functions'], deps: [] },
  { name: 'webcolors', version: '25.10.0', imports: ['webcolors'], deps: [] },
  { name: 'colour', version: '0.1.5', imports: ['colour'], deps: [] },
  { name: 'svgelements', version: '1.9.6', imports: ['svgelements'], deps: [] },
  { name: 'svgpathtools', version: '1.8.0', imports: ['svgpathtools'], deps: ['numpy', 'scipy', 'svgwrite'] },
  { name: 'webencodings', version: '0.6.1', imports: ['webencodings'], deps: [] },
  { name: 'tinycss2', version: '1.5.1', imports: ['tinycss2'], deps: ['webencodings'] },
  { name: 'qrcode', version: '8.2', imports: ['qrcode'], deps: ['pillow'] },
  { name: 'pyfiglet', version: '1.0.4', imports: ['pyfiglet'], deps: [] },
  { name: 'arabic-reshaper', version: '3.0.1', imports: ['arabic_reshaper'], deps: [] },
  { name: 'pydub', version: '0.25.1', imports: ['pydub'], deps: ['audioop-lts'] },
];

if (!CORE.every(f => existsSync(join(SRC, f)))) {
  console.warn('⚠ pyodide پیدا نشد (npm install) — کد پایتون با مفسر داخلی اجرا می‌شود.');
  process.exit(0);
}
mkdirSync(DST, { recursive: true });
for (const f of CORE) copyFileSync(join(SRC, f), join(DST, f));
const version = JSON.parse(readFileSync(join(SRC, 'package.json'), 'utf8')).version;
console.log(`✓ هستهٔ Pyodide ${version} در ${DST} کپی شد`);

const norm = s => String(s).toLowerCase().replace(/[-_.]+/g, '-');
const lock = {};
for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(SRC, 'pyodide-lock.json'), 'utf8')).packages)) lock[norm(k)] = { ...v, key: k };
const sha = b => createHash('sha256').update(b).digest('hex');
const CDN = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

async function fetchTo(url, out, sha256) {
  if (existsSync(out) && sha(readFileSync(out)) === sha256) return 0;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (sha256 && sha(buf) !== sha256) throw new Error('sha256 نادرست');
  writeFileSync(out, buf);
  return buf.length;
}

const want = [...PACKAGES, ...PYPI.flatMap(p => p.deps)];
const need = [], seen = new Set(), stack = [...want];
while (stack.length) {
  const k = norm(stack.pop());
  if (seen.has(k)) continue;
  seen.add(k);
  if (!lock[k]) { console.warn(`⚠ بستهٔ ${k} در Pyodide ${version} نیست`); continue; }
  need.push(k); stack.push(...(lock[k].depends || []));
}
const got = new Set();
let bytes = 0;
for (const k of need) {
  const { file_name: file, sha256 } = lock[k], out = join(DST, file);
  try {
    const local = join(SRC, file);
    if (!(existsSync(out) && sha(readFileSync(out)) === sha256) && existsSync(local) && sha(readFileSync(local)) === sha256) copyFileSync(local, out);
    const n = await fetchTo(CDN + file, out, sha256);
    if (n) console.log(`✓ ${k} (${(n / 1e6).toFixed(1)} MB)`);
    bytes += readFileSync(out).length; got.add(k);
  } catch (e) {
    console.warn(`⚠ بستهٔ ${k} گرفته نشد (${e.message}) — بدون آن ادامه می‌دهیم.`);
  }
}
console.log(`✓ بسته‌های Pyodide داخل برنامه: ${got.size}/${need.length}`);

// فهرست برای برنامه: نام import ← بسته
const imports = {}, pkgs = {};
const okDeps = k => (lock[k]?.depends || []).map(norm).every(d => got.has(d));
for (const k of got) {
  if (!okDeps(k)) continue;
  pkgs[k] = { name: lock[k].key };
  for (const m of lock[k].imports || []) if (!m.startsWith('_')) imports[m] = k;
}
mkdirSync(join(DST, 'pypi'), { recursive: true });
for (const p of PYPI) {
  try {
    if (!p.deps.map(norm).every(d => pkgs[d])) throw new Error('وابستگی‌ها نیستند');
    const info = await (await fetch(`https://pypi.org/pypi/${p.name}/${p.version}/json`)).json();
    const u = info.urls.find(x => x.filename.endsWith('-none-any.whl'));
    if (!u) throw new Error('wheel پایتون خالص ندارد');
    const out = join(DST, 'pypi', u.filename);
    const n = await fetchTo(u.url, out, u.digests.sha256);
    if (n) console.log(`✓ ${p.name} ${p.version} (PyPI، ${(n / 1e3).toFixed(0)} KB)`);
    bytes += readFileSync(out).length;
    pkgs[norm(p.name)] = { name: p.name, file: 'pypi/' + u.filename, deps: p.deps.map(norm) };
    for (const m of p.imports) imports[m] = norm(p.name);
  } catch (e) {
    console.warn(`⚠ ${p.name} (PyPI) گرفته نشد (${e.message})`);
  }
}
writeFileSync(join(DST, 'bundled.json'), JSON.stringify({ version, imports, pkgs }, null, 1));
console.log(`✓ ${Object.keys(pkgs).length} بستهٔ پایتون (${Object.keys(imports).length} نام import، ${(bytes / 1e6).toFixed(0)} MB) ← ${DST}/bundled.json`);
