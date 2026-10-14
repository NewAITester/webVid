/** Small local fixtures, not a Python/FFmpeg runtime integration test. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const root = new URL('../', import.meta.url);
const body = Buffer.from('export const installed = 42;');
const file = { path:'ffmpeg/1/core.js', url:'', bytes:body.length, sha256:createHash('sha256').update(body).digest('hex'), name:'FFmpeg' };
const counts = new Map(); let corrupt = false;
const server = createServer(async (req,res) => {
  const path = req.url.split('?')[0]; counts.set(path,(counts.get(path)||0)+1);
  try {
    let data, type = 'text/javascript';
    if (path === '/app/') {
      type = 'text/html';
      data = '<html lang="fa" dir="rtl"><body><section data-screen="library"><header class="top"></header></section><script type="module">import {mountToolManager} from "./src/ui/toolmanager.js";mountToolManager();window.m=await import("./src/tools/manager.js");</script></body></html>';
    } else if (path === '/app/tools-manifest.json') {
      type='application/json';
      data=JSON.stringify({pythonVersion:'1',ffmpegVersion:'1',entries:{ffmpeg:{name:'FFmpeg',version:'1',deps:[],files:[file]}}});
    } else if (path === '/payload.js') data=corrupt ? 'bad' : body;
    else if (path === '/app/tools-sw.js') data=await readFile(new URL('public/tools-sw.js',root));
    else if (/^\/app\/src\/[a-zA-Z0-9/.-]+\.js$/.test(path) && !path.includes('..')) data=await readFile(new URL(path.slice('/app/'.length),root));
    else { res.writeHead(404).end(); return; }
    res.writeHead(200,{'content-type':type});res.end(data);
  } catch { res.writeHead(500).end(); }
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
file.url=base+'/payload.js';
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
  const context=await browser.newContext(), page=await context.newPage(), errors=[];
  page.on('pageerror',e => errors.push(String(e)));page.on('dialog',d => d.accept());
  await page.goto(base+'/app/');await page.waitForFunction('!!window.m');
  assert.equal(counts.get('/payload.js')||0,0);
  await page.locator('button').click();await page.waitForFunction('document.querySelector("input[type=checkbox]")');
  assert.equal(counts.get('/payload.js')||0,0);
  assert.equal(await page.locator('progress').count(),1);
  assert.match(await page.locator('.pill').innerText(),/مگابایت/);
  await page.locator('input[type=checkbox]').check();
  await page.getByText('دانلود انتخاب‌شده‌ها',{exact:true}).click();
  await page.waitForFunction('document.querySelector(".tool-installed").textContent.includes("آماده")');
  assert.equal(counts.get('/payload.js'),1);
  assert.equal(await page.evaluate(async () => (await import((await m.runtimeBase('ffmpeg'))+'core.js')).installed),42);
  await page.reload();await page.waitForFunction('!!window.m');
  await page.evaluate(() => m.downloadTools(['ffmpeg']));assert.equal(counts.get('/payload.js'),1);
  await context.setOffline(true);
  assert.equal(await page.evaluate(async () => (await import((await m.runtimeBase('ffmpeg'))+'core.js')).installed),42);
  await context.setOffline(false);
  await page.evaluate(() => caches.delete('wv-tools-sha256-v1'));corrupt=true;
  const error=await page.evaluate(async () => {try {await m.downloadTools(['ffmpeg']);return '';}catch(e){return e.message;}});
  assert.match(error,/حجم|ناقص|اعتبار/);
  assert.equal(await page.evaluate(async () => (await m.missingFiles(['ffmpeg'])).length),1);
  corrupt=false;await page.evaluate(() => m.downloadTools(['ffmpeg']));
  assert.equal(await page.evaluate(async () => (await m.missingFiles(['ffmpeg'])).length),0);
  assert.deepEqual(errors,[]);
  // Reproduce the screenshot's failed registration: metadata must remain visible,
  // no download may start, and retry must recover after the backend is available.
  const retryContext = await browser.newContext();
  const retryPage = await retryContext.newPage();
  await retryPage.addInitScript(() => {
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    let calls = 0;
    navigator.serviceWorker.register = (...args) => ++calls === 1
      ? Promise.reject(new Error('An unknown error occurred when fetching the script'))
      : register(...args);
  });
  const beforeRetry = counts.get('/payload.js');
  await retryPage.goto(base+'/app/');await retryPage.waitForFunction('!!window.m');
  await retryPage.locator('button').click();
  await retryPage.getByText('تلاش دوباره برای اتصال',{exact:true}).waitFor({state:'visible'});
  assert.equal(await retryPage.locator('input[type=checkbox]').count(),1);
  await retryPage.locator('input[type=checkbox]').check();
  assert(await retryPage.getByText('دانلود انتخاب‌شده‌ها',{exact:true}).isDisabled());
  assert.equal(counts.get('/payload.js'),beforeRetry);
  await retryPage.getByText('تلاش دوباره برای اتصال',{exact:true}).click();
  await retryPage.waitForFunction('document.querySelector("input[type=checkbox]")?.checked && ![...document.querySelectorAll("button")].find(b=>b.textContent === "دانلود انتخاب‌شده‌ها").disabled');
  assert.equal(counts.get('/payload.js'),beforeRetry);
  await retryContext.close();
  console.log('PASS browser: consent, sizes/progress, worker download, SW import, reload/offline reuse, corrupt rejection and retry');
} finally { await browser?.close();await new Promise(r => server.close(r)); }
