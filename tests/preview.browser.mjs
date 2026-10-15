/** Uses the real settings markup, real mount function, and actual main.js fit function. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const root = new URL('../',import.meta.url);
const html = await readFile(new URL('index.html',root),'utf8');
const main = await readFile(new URL('src/main.js',root),'utf8');
const fit = main.slice(main.indexOf('function fit()'),main.indexOf('/* ── حلقهٔ رندر'));
const settings = html.slice(html.indexOf('<div id="pjSheet"'), html.indexOf('<script type="module"')).replace('sheet hidden','sheet');
const fixture = `<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><body>
<div style="width:972px;height:552px"><canvas id="stage"></canvas></div>${settings}
<script type="module">
import {previewSize,pythonPreviewLimit} from '/src/engine/preview.js';
import {mountPreviewQuality} from '/src/ui/previewquality.js';
const canvas=document.querySelector('#stage'), TL={resize(){}}, app={playing:false};
const stage={resize(w,h){canvas.width=w;canvas.height=h;}}, stageDims=()=>({W:1920,H:1080});
function draw(){const g=canvas.getContext('2d');g.fillStyle='red';g.fillRect(0,0,canvas.width,canvas.height);}
${fit}
// A demo project's Save is disabled; device settings must still work immediately.
document.querySelector('#pjSave').disabled=true;
mountPreviewQuality(fit);fit();
window.previewStatus=()=>({width:canvas.width,height:canvas.height,css:canvas.style.cssText,preview:pythonPreviewLimit(),export:pythonPreviewLimit({exporting:true})});
window.ready=true;
</script></body></html>`;
const server = createServer(async(req,res)=>{
  try {
    if(req.url === '/') {res.setHeader('content-type','text/html; charset=utf-8');res.end(fixture);return;}
    if(!/^\/src\/[a-zA-Z0-9/.-]+\.js$/.test(req.url)||req.url.includes('..')){res.writeHead(404).end();return;}
    res.setHeader('content-type','text/javascript');res.end(await readFile(new URL(req.url.slice(1),root)));
  } catch {res.writeHead(500).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1200,height:900},deviceScaleFactor:2}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction('window.ready');
  assert.equal(await page.locator('#previewQuality').inputValue(),'original');
  const initial=await page.evaluate(()=>window.previewStatus());
  assert.equal(initial.width,1920);assert.equal(initial.height,1080);
  for(const [level,width,height] of [['light',960,540],['tiny',480,270],['original',1920,1080]]) {
    await page.locator('#previewQuality').selectOption(level);
    const result=await page.evaluate(()=>window.previewStatus());
    assert.equal(result.width,width);assert.equal(result.height,height);
    assert.equal(result.css,initial.css,'CSS size/design coordinates must not change');
    assert.equal(result.export,0,'export is independent of selected preview resolution');
    assert.equal(await page.evaluate(()=>document.querySelector('#pjSave').disabled),true);
  }
  await page.locator('#previewQuality').selectOption('tiny');
  await page.reload();await page.waitForFunction('window.ready');
  assert.equal(await page.locator('#previewQuality').inputValue(),'tiny');
  assert.equal((await page.evaluate(()=>window.previewStatus())).width,480);
  await page.evaluate(()=>localStorage.setItem('lyricstudio.preview.quality.v1','invalid'));
  await page.reload();await page.waitForFunction('window.ready');
  assert.equal(await page.locator('#previewQuality').inputValue(),'original');
  assert.deepEqual(errors,[]);
  console.log('PASS browser: settings selection, immediate demo application, actual fit/backing dimensions, unchanged display size, export isolation and reload persistence');
} finally {await browser?.close();await new Promise(r=>server.close(r));}
