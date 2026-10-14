/** Build small, pinned download manifests; never bundle runtime binaries. */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
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

const norm = s => String(s).toLowerCase().replace(/[-_.]+/g, '-');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const src = 'node_modules/pyodide';
const version = read(join(src, 'package.json')).version;
const lock = read(join(src, 'pyodide-lock.json'));
// Older locks include info.version; current ABI-based locks (e.g. 314.0.7) do not.
// In that format the pinned npm version is also the /pyodide/v<VERSION>/full release.
const release = lock.info?.version || version;
const coreCDN = `https://cdn.jsdelivr.net/npm/pyodide@${version}/`;
const wheelCDN = `https://cdn.jsdelivr.net/pyodide/v${release}/full/`;
const entries = {}, imports = {}, pkgs = {};
const file = (path, url, bytes, sha256) => ({ path, url, bytes, sha256 });
const local = (path, url, source) => {
  const b = readFileSync(source);
  return file(path, url, b.length, sha(b));
};
entries.python = { name: 'Python / Pyodide', version, deps: ['numpy'], files: [] };
for (const f of ['pyodide.mjs', 'pyodide.js', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  entries.python.files.push(local(`pyodide/${version}/${f}`, coreCDN + f, join(src, f)));
}
const packages = Object.fromEntries(Object.entries(lock.packages).map(([k,v]) => [norm(k), { ...v, key:k }]));
const seen = new Set();
function add(k) {
  k = norm(k);
  if (seen.has(k)) return;
  seen.add(k);
  const p = packages[k];
  if (!p) throw new Error(`Package ${k} missing from Pyodide ${release}`);
  for (const d of p.depends || []) add(d);
  entries[k] = { name: p.key, version:p.version, deps: (p.depends || []).map(norm),
    files: [file(`pyodide/${version}/${p.file_name}`, wheelCDN + p.file_name, p.size || null, p.sha256)] };
  pkgs[k] = { name:p.key, deps:(p.depends || []).map(norm), tool:k };
  for (const m of p.imports || []) if (!m.startsWith('_')) imports[m] = k;
}
for (const k of [...PACKAGES, ...PYPI.flatMap(p => p.deps)]) {
  // Keep unavailable upstream optional packages visible in build logs, not broken entries.
  if (!packages[norm(k)]) { console.warn(`Optional package unavailable: ${k}`); continue; }
  add(k);
}
async function get(url, method='GET') {
  const r = await fetch(url, { method, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r;
}
for (const p of PYPI) {
  if (!p.deps.every(d => entries[norm(d)])) continue;
  // Metadata only. No wheel downloads during builds.
  const info = await (await get(`https://pypi.org/pypi/${p.name}/${p.version}/json`)).json();
  const w = info.urls.find(x => x.filename.endsWith('-none-any.whl'));
  if (!w) throw new Error(`Pure Python wheel missing: ${p.name}`);
  const k = norm(p.name), rel = `pypi/${w.filename}`;
  entries[k] = { name:p.name, version:p.version, deps:p.deps.map(norm),
    files:[file(`pyodide/${version}/${rel}`, w.url, w.size, w.digests.sha256)] };
  pkgs[k] = { name:p.name, file:rel, deps:p.deps.map(norm), tool:k };
  for (const m of p.imports) imports[m] = k;
}
const ffVersion = read('node_modules/@ffmpeg/core/package.json').version;
const ffCDN = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${ffVersion}/dist/esm/`;
entries.ffmpeg = { name:'FFmpeg', version:ffVersion, deps:[], files:['ffmpeg-core.js','ffmpeg-core.wasm'].map(f =>
  local(`ffmpeg/${ffVersion}/${f}`, ffCDN + f, 'node_modules/@ffmpeg/core/dist/esm/' + f)) };
// Content-Length from CDN HEAD can describe gzip/Brotli transfer bytes, not
// the decoded file delivered by fetch(). Measure unknown wheel sizes from the
// decoded stream and verify the upstream SHA. This is CI/build-time only: no
// runtime binaries are written to public/ or included in app updates.
const unknown = Object.values(entries).flatMap(e => e.files).filter(f => !f.bytes);
let cursor = 0;
await Promise.all(Array.from({ length:4 }, async () => {
  while (cursor < unknown.length) {
    const f = unknown[cursor++], r = await get(f.url);
    if (!r.body) throw new Error(`Download body unavailable: ${f.url}`);
    const hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of r.body) { bytes += chunk.byteLength; hash.update(chunk); }
    if (!bytes || hash.digest('hex') !== f.sha256) {
      throw new Error(`Wheel integrity mismatch while measuring decoded size: ${f.url}`);
    }
    f.bytes = bytes;
  }
}));
for (const [k,e] of Object.entries(entries)) if (!['python','ffmpeg'].includes(k)) e.deps = [...new Set(['python', ...e.deps])];
// Purge leftovers from older builds so updates contain metadata only.
rmSync('public/pyodide', { recursive:true, force:true });
rmSync('public/ffmpeg', { recursive:true, force:true });
mkdirSync('public/pyodide', { recursive:true });
writeFileSync('public/pyodide/bundled.json', JSON.stringify({ version, imports, pkgs }));
writeFileSync('public/tools-manifest.json', JSON.stringify({ schema:1, pythonVersion:version, ffmpegVersion:ffVersion, entries }));
console.log(`Optional runtime manifest: ${Object.keys(entries).length} tools; binaries excluded from APK.`);
