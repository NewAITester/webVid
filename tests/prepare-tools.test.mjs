/** Full prebuild-script regression with local package fixtures and metadata-only mocked fetch. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
const script = fileURLToPath(new URL('../scripts/prepare-tools.mjs', import.meta.url));
const source = readFileSync(script,'utf8');
const declarations = source.slice(source.indexOf('const PACKAGES ='),source.indexOf('\nconst norm ='));
const { PACKAGES, PYPI } = vm.runInNewContext(declarations + '\n({ PACKAGES, PYPI })');
const norm = s => s.toLowerCase().replace(/[-_.]+/g,'-');
const npmVersion = '314.0.7';
for (const [label, info, expectedRelease] of [
  ['modern ABI lock', { abi_version:'2026_0', arch:'wasm32', platform:'emscripten_5_0_3', python:'3.14.2' }, npmVersion],
  ['legacy versioned lock', { version:'0.28.3', python:'3.13.2' }, '0.28.3'],
  ['lock without info', undefined, npmVersion],
]) {
  const dir=mkdtempSync(join(tmpdir(),'wv-prebuild-'));
  const put=(p,data) => { const f=join(dir,p); mkdirSync(join(f,'..'),{recursive:true}); writeFileSync(f, typeof data === 'object' ? JSON.stringify(data) : data); };
  try {
    put('node_modules/pyodide/package.json',{version:npmVersion});
    const packages = {};
    for (const k of new Set([...PACKAGES,...PYPI.flatMap(p=>p.deps)].map(norm))) {
      packages[k] = { name:k, version:'1.0.0', depends:[], imports:[k.replaceAll('-','_')], file_name:`${k}-test.whl`, sha256:'a'.repeat(64) };
    }
    packages.scipy.depends=['numpy'];
    put('node_modules/pyodide/pyodide-lock.json',{ ...(info ? {info} : {}), packages });
    for (const f of ['pyodide.mjs','pyodide.js','pyodide.asm.mjs','pyodide.asm.wasm','python_stdlib.zip']) put('node_modules/pyodide/'+f,'fixture:'+f);
    put('node_modules/@ffmpeg/core/package.json',{version:'0.12.10'});
    for (const f of ['ffmpeg-core.js','ffmpeg-core.wasm']) put('node_modules/@ffmpeg/core/dist/esm/'+f,'fixture:'+f);
    put('public/pyodide/stale.whl','old bundled wheel');
    put('public/ffmpeg/ffmpeg-core.wasm','old bundled core');
    put('mock-fetch.mjs', `globalThis.fetch = async (url, options={}) => {
      if (options.method === 'HEAD') return new Response(null,{headers:{'content-length':'64'}});
      if (String(url).startsWith('https://pypi.org/pypi/') && String(url).endsWith('/json')) {
        const [,name,version] = new URL(url).pathname.split('/').slice(1);
        return Response.json({urls:[{filename:name+'-'+version+'-py3-none-any.whl',url:'https://example.test/'+name+'.whl',size:32,digests:{sha256:'b'.repeat(64)}}]});
      }
      throw new Error('Unexpected download during build: '+url);
    };`);
    const result=spawnSync(process.execPath,['--import',join(dir,'mock-fetch.mjs'),script],{cwd:dir,encoding:'utf8',timeout:20000});
    assert.equal(result.status,0,`${label}: ${result.stderr || result.error}`);
    const m=JSON.parse(readFileSync(join(dir,'public/tools-manifest.json'),'utf8'));
    assert.equal(m.pythonVersion,npmVersion);
    assert(m.entries.numpy.files[0].url.startsWith(`https://cdn.jsdelivr.net/pyodide/v${expectedRelease}/full/`));
    assert(m.entries.python.files[0].url.startsWith(`https://cdn.jsdelivr.net/npm/pyodide@${npmVersion}/`));
    assert.equal(m.entries.numpy.files[0].bytes,64);
    assert(m.entries.scipy.deps.includes('numpy'));
    assert(m.entries['perlin-noise'],'pure-Python metadata remains included');
    assert(!existsSync(join(dir,'public/pyodide/stale.whl')));
    assert(!existsSync(join(dir,'public/ffmpeg')));
    console.log(`PASS prebuild regression: ${label}`);
  } finally { rmSync(dir,{recursive:true,force:true}); }
}
