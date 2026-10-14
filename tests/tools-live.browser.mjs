/** Optional live CDN integrity/download test; explicitly invoked, never automatic.
 * Generate public/tools-manifest.json with scripts/prepare-tools.mjs first.
 * Verifies downloads and reuse, not Python execution or APK installation. */
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const full = JSON.parse(readFileSync(new URL('../public/tools-manifest.json', import.meta.url), 'utf8'));
const files = [
  ...full.entries.python.files.filter(f => f.path.endsWith('pyodide.mjs')),
  full.entries.numpy.files[0],
  full.entries.mpmath.files[0],
  full.entries.ffmpeg.files.find(f => f.path.endsWith('.js')),
];
// Retain real CDN URLs, decoded byte counts and upstream SHA values.
const manifest = {
  pythonVersion:full.pythonVersion, ffmpegVersion:full.ffmpegVersion,
  entries:{ smoke:{ name:'Real CDN smoke', deps:[], files } },
};
const server = await createServer({
  root, configFile:false, server:{ host:'127.0.0.1', port:0 },
  plugins:[{
    name:'smoke-fixture',
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        if (req.url === '/tools-manifest.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(manifest));
        } else if (req.url === '/smoke.html') {
          res.setHeader('Content-Type', 'text/html');
          res.end('<script type="module">window.m=await import("/src/tools/manager.js");</script>');
        } else next();
      });
    },
  }],
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox'],
  });
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(server.resolvedUrls.local[0] + 'smoke.html');
  await page.waitForFunction('!!window.m');
  const result = await page.evaluate(async () => {
    const events = [];
    window.addEventListener('wv-tools-status', e => events.push(e.detail));
    try {
      await m.downloadTools(['smoke']);
      const installed = events.filter(x => x.type === 'installed')
        .map(x => ({ path:x.file.path, bytes:x.received }));
      events.length = 0;
      await m.downloadTools(['smoke']);
      return {
        ok:true, installed,
        secondDownloadInstalled:events.filter(x => x.type === 'installed').length,
        missing:(await m.missingFiles(['smoke'])).length,
      };
    } catch (error) {
      return { ok:false, error:error.message, last:events.slice(-2) };
    }
  });
  console.log(JSON.stringify(result));
  assert(result.ok, result.error);
  assert.equal(result.installed.length, 4);
  assert.equal(result.secondDownloadInstalled, 0);
  assert.equal(result.missing, 0);
  await context.close();
} finally {
  await browser?.close();
  await server.close();
}
