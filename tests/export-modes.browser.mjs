/** Real WebCodecs + mp4-muxer + download/IndexedDB; renderer is a deterministic fixture. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const root=new URL('../',import.meta.url);
await mkdir('artifacts/export-tests',{recursive:true});
const bundle=await build({stdin:{contents:`
import {exportVideo} from './src/engine/export.js';
import {saveFile} from './src/engine/save.js';
import {startExportLog,reportsBlob,fingerprint} from './src/engine/export-log.js';
import {mountExportOptions} from './src/ui/exportoptions.js';
mountExportOptions({save:async blob=>{window.lastPack=JSON.parse(await blob.text());return {where:'browser'};},share:async()=>{},onMessage:s=>document.querySelector('#exLogMsg').textContent=s});
window.run=async(optimized,audio)=>{
 const settings={mode:optimized?'optimized':'original',width:320,height:180,fps:24,from:0,to:1,audioPresent:audio,sceneFingerprint:await fingerprint('deterministic fixture')};
 const log=await startExportLog(settings);let state='failed',failure=null;
 try{
  const blob=await exportVideo({...settings,song:{},bitrate:1000000,optimized,log,audioUrl:audio?'/tone.wav':null});
  const at=performance.now();log.detail('activeStage','save');await saveFile(blob,optimized?'optimized.mp4':'original.mp4',()=>{}, {optimized,log});log.add('saveWall',performance.now()-at);state='success';
  return {bytes:blob.size,audioCodec:log.report.details.audioCodec};
 }catch(e){failure=e;log.detail('fixtureError',e.name);throw e;}
 finally{await log.finish(state,failure);}
};
window.getLogs=async()=>JSON.parse(await (await reportsBlob()).text());
window.ready=true;`,resolveDir:process.cwd(),sourcefile:'export-fixture.js'},bundle:true,format:'esm',write:false,target:'chrome80',plugins:[{name:'fixture-renderer',setup(b){
 b.onResolve({filter:/^\.\/stage\.js$/},()=>({path:'stage',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/renderer\.js$/},()=>({path:'renderer',namespace:'fixture'}));
 b.onResolve({filter:/^\.\/song\.js$/},()=>({path:'song',namespace:'fixture'}));
 b.onResolve({filter:/domframes\.js$/},()=>({path:'domframes',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:{
 stage:`export class Stage {constructor(c){this.canvas=c;}resize(w,h){this.canvas.width=w;this.canvas.height=h;}}`,
 renderer:`export class Renderer {constructor(stage){this.canvas=stage.canvas;}setSong(){return this;}renderFrame(t){if(!this.exporting)throw Error('export flag lost');const g=this.canvas.getContext('2d');g.fillStyle='#121526';g.fillRect(0,0,this.canvas.width,this.canvas.height);g.fillStyle='#ff2350';g.beginPath();g.arc(160+60*Math.sin(t*6),90,30,0,Math.PI*2);g.fill();}}`,
 song:`export const W=320,H=180;`,domframes:`export async function domSettle(){return false;}`}[path],loader:'js'}));
 }}]});
const html=await readFile(new URL('index.html',root),'utf8');
const start=html.indexOf('<section class="pane" data-pane="export">');
const form=html.slice(start,html.indexOf('</section>',start)+10);
// A real PCM audio source for the optional audio export path.
const pcm=Buffer.alloc(44+48000*2*2);pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(2,22);pcm.writeUInt32LE(48000,24);pcm.writeUInt32LE(192000,28);pcm.writeUInt16LE(4,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(pcm.length-44,40);
for(let i=0;i<48000;i++){const n=Math.round(12000*Math.sin(i*440*2*Math.PI/48000));pcm.writeInt16LE(n,44+i*4);pcm.writeInt16LE(n,46+i*4);}
const server=createServer((req,res)=>{
 if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].contents);}
 else if(req.url==='/tone.wav'){res.setHeader('content-type','audio/wav');res.end(pcm);}
 else{res.setHeader('content-type','text/html; charset=utf-8');res.end(`<!doctype html><html dir="rtl" lang="fa"><meta charset="utf-8"><body>${form}<script type="module" src="/fixture.js"></script></body></html>`);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,page;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 const ctx=await browser.newContext({acceptDownloads:true}),errors=[];page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction('window.ready');
 assert.equal(await page.locator('#exOptimized').isChecked(),false);
 await page.locator('#exOptimized').check();await page.reload();await page.waitForFunction('window.ready');assert.equal(await page.locator('#exOptimized').isChecked(),true);
 await page.locator('#exOptimized').uncheck();
 for(const [mode,audio] of [[false,false],[true,false],[true,true]]){
  const downloadPromise=page.waitForEvent('download');
  const result=await page.evaluate(([optimized,audio])=>window.run(optimized,audio),[mode,audio]);
  const download=await downloadPromise;
  const path=`artifacts/export-tests/${mode?'optimized':'original'}-${audio?'audio':'silent'}.mp4`;await download.saveAs(path);
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_type,width,height,nb_read_frames,r_frame_rate:format=duration','-of','json',path],{encoding:'utf8'}));
  const video=info.streams.find(x=>x.codec_type==='video');assert.equal(video.width,320);assert.equal(video.height,180);assert.equal(Number(video.nb_read_frames),24);assert.equal(video.r_frame_rate,'24/1');
  assert(Math.abs(Number(info.format.duration)-1)<0.2);
  if(audio && result.audioCodec)assert(info.streams.some(x=>x.codec_type==='audio'));
  execFileSync('ffmpeg',['-v','error','-i',path,'-f','null','-'],{stdio:'pipe'});
 }
 await page.reload();await page.waitForFunction('window.ready');
 const logs=await page.evaluate(()=>window.getLogs());assert.equal(logs.runs.length,3);
 assert(logs.runs.every(x=>x.status==='success'));assert(logs.runs.every(x=>x.details.actualHardwareEncoder===null));
 await page.locator('#exLogs').click();await page.waitForFunction('window.lastPack');
 const pack=await page.evaluate(()=>window.lastPack);assert.equal(pack.runs.length,3);
 assert.deepEqual(errors,[]);
 await writeFile('artifacts/export-tests/browser-reports.json',JSON.stringify({fixture:true,...pack},null,2));
 console.log('PASS real browser: original/optimized MP4s decode, dimensions/FPS/frame counts unchanged, audio when supported, default-off toggle/reload, automatic report persistence and JSON export');
}catch(error){
 try{const reports=await page.evaluate(()=>window.getLogs());await writeFile('artifacts/export-tests/browser-failure-reports.json',JSON.stringify({fixture:true,...reports},null,2));}catch{/* early fixture initialization failure */}
 throw error;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
