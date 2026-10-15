import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
const sources={};for(const [key,path] of Object.entries({profile:'src/engine/render-profile.js',motion:'src/motion/render.js',scene:'src/engine/renderer.js'}))sources[key]=(await readFile(path,'utf8')).replace(/^import .*;\n/gm,'').replace(/^export \{.*\};?\n/gm,'').replace(/^export /gm,'');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.setContent('<!doctype html><body></body>');
 const result=await page.evaluate(sources=>{
  const {createRenderProfile,withProfileContext}=new Function(sources.profile+'\nreturn {createRenderProfile,withProfileContext};')();
  const noop=()=>{};
  const dependencies={withProfileContext,MediaPool:class{},EASINGS:{},noise:()=>0,solidText:noop,parseColor:()=>[1,1,1,1],
   evalLayer:(L,t,e)=>({L,lt:t,dur:1,active:true,alpha:1,P:{w:48,h:32},fx:L.filters||[],mods:{wipe:null,blur:0},world:[1,0,0,1,48,27]}),
   needsBuffer:s=>!!s.L.buffer,frameEnv:()=>({}),M:{mul:(a,b)=>[a[0],a[1],a[2],a[3],b[4],b[5]],apply:(m,x,y)=>({x:x+m[4],y:y+m[5]})},
   compileCode:()=>({fn:(ctx,e)=>{let v=0;for(let i=0;i<5000;i++)v+=Math.sin(i*.01+e.time);ctx.fillStyle='#36a2de';ctx.fillRect(-18+v*.001,-10,36,20);},error:null}),codeEnv:x=>x};
  const MotionRenderer=new Function(...Object.keys(dependencies),sources.motion+'\nreturn MotionRenderer;')(...Object.values(dependencies));
  const dep={W:96,H:54,C:{BG:'#080808',BONE:'#fff'},SECT:[[0,1,'none','#fff']],S:()=>1,
   clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),rgba:()=> '#121212',hash2:(a,b)=>{let x=Math.sin(a*17+b*3)*987;return x-Math.floor(x);},
   rect:(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);},DRAW:{},TEXT_FX:{},TEXT_FX2:{},TEXT_FX3:{},mixFn:()=>null,mixOf:()=>null,
   drawLayers:noop,MotionRenderer,TOOLBOX:{},frameEnv:()=>({}),evalEffects:()=>[],combine:()=>({}),moveMods:()=>[],drawIdle:noop};
  const Renderer=new Function(...Object.keys(dep),sources.scene+'\nreturn Renderer;')(...Object.values(dep));
  const layers=[{id:'private',type:'code',t0:0,t1:1,data:{code:'private'}},{id:'mask',type:'code',t0:0,t1:1,data:{code:'private'},buffer:true,mblur:50},{id:'clip',type:'code',t0:0,t1:1,data:{code:'private'},buffer:true,clip:'below',filters:[{type:'blur',kind:'filter',v:{r:1}}]}];
  function renderer(profile){const canvas=document.createElement('canvas');canvas.width=96;canvas.height=54;const ctx=canvas.getContext('2d');const R=new Renderer({canvas,ctx,begin(){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,96,54);return ctx;},end:noop});R.setSong({kick:()=>0,activeLine:()=>-1});R.layers=layers;R.exporting=true;R.grain=.024;R.profile=profile;return R;}
  const log={detail(k,v){this[k]=v;}};const profile=createRenderProfile(log,layers);const off=renderer(null),on=renderer(profile);
  let pixelMismatch=0;
  for(let i=0;i<12;i++){const t=i/24;off.renderFrame(t);profile.frame(()=>on.renderFrame(t));const a=off.stage.ctx.getImageData(0,0,96,54).data,b=on.stage.ctx.getImageData(0,0,96,54).data;for(let j=0;j<a.length;j++)if(a[j]!==b[j])pixelMismatch++;}
  if(on.motion.errors.size||off.motion.errors.size)throw Error('Fixture rendering errors');
  // Warm-up, alternating order: report the overhead measurement, do not assert a flaky wall-time ratio.
  const benchmark=[];
  for(let repeat=0;repeat<6;repeat++)for(const enabled of (repeat%2?[true,false]:[false,true])){
    const R=enabled?on:off,t0=performance.now();for(let i=0;i<40;i++){if(enabled)profile.frame(()=>R.renderFrame(.3));else R.renderFrame(.3);}benchmark.push({enabled,ms:performance.now()-t0,frames:40});
  }
  profile.finish();return {pixelMismatch,benchmark,profile:profile.data};
 },sources);
 assert.equal(result.pixelMismatch,0,'profiling on/off pixels identical');assert.equal(result.profile.incompleteSpans,0);assert(result.profile.buckets.some(r=>r.stage==='code.execute'));assert(result.profile.buckets.some(r=>r.stage==='layer.filters'));
 await mkdir('artifacts/export-tests',{recursive:true});await writeFile('artifacts/export-tests/render-profile-browser.json',JSON.stringify({synthetic:true,...result},null,2));
 const mean=enabled=>result.benchmark.filter(x=>x.enabled===enabled).reduce((n,x)=>n+x.ms/6,0);
 console.log(`PASS actual Chromium Canvas: identical pixels, masks/blur/grain, balanced spans; fixture 40-frame mean baseline=${mean(false).toFixed(2)}ms profiled=${mean(true).toFixed(2)}ms (not phone performance)`);
 await page.close();
} finally {await browser.close();}
