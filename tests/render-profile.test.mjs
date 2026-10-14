import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRenderProfile,profileContext,withProfileContext} from '../src/engine/render-profile.js';
const reports=[];
let time=0;
const layers=[{id:'PRIVATE-ID',title:'PRIVATE-TITLE',type:'code',data:{code:'PRIVATE-CODE'}}];
const log={detail(k,v){this[k]=v;}};
const p=createRenderProfile(log,layers,{clock:()=>time});
const root=p.begin('frame.render');time+=2;
const child=p.begin('layer.content',layers[0]);time+=3;p.end(child);time+=1;p.end(root);
assert.equal(p.data.buckets[0].inclusiveMs,6);assert.equal(p.data.buckets[0].selfMs,3);
assert.equal(p.data.buckets[1].inclusiveMs,3);assert.equal(p.data.buckets[1].layerIndex,0);
assert.throws(()=>p.run('code.execute',layers[0],()=>{time+=5;throw Error('PRIVATE ERROR');}));
assert.equal(p.data.buckets.at(-1).failedCalls,1);p.finish();assert.equal(createRenderProfile(null),null);
const ctx={};withProfileContext(ctx,p,layers[0],()=>{assert.equal(profileContext(ctx).profile,p);assert.throws(()=>withProfileContext(ctx,p,null,()=>{throw Error();}));assert.equal(profileContext(ctx).layer,layers[0]);});assert.equal(profileContext(ctx),null);
assert.throws(()=>withProfileContext(ctx,p,null,()=>{throw Error();}));assert.equal(profileContext(ctx),null);
for(const secret of ['PRIVATE-ID','PRIVATE-TITLE','PRIVATE-CODE','PRIVATE ERROR'])assert(!JSON.stringify(log.renderProfile).includes(secret));
const bounded=createRenderProfile({detail(){}},[],{clock:()=>time,maxBuckets:2});
for(let i=0;i<10000;i++)bounded.run(i%2?'grade.bloom':'grade.tone',null,()=>{time++;});
bounded.run('scene.text',null,()=>{});assert.equal(bounded.data.buckets.length,2);assert.equal(bounded.data.droppedSpans,1);
assert.equal(bounded.data.buckets.reduce((n,r)=>n+r.calls,0),10000);
const locations=createRenderProfile({detail(){}},[],{clock:()=>time});
for(let i=0;i<20;i++)locations.frame(()=>{time+=i;},false,{index:i,timeSeconds:i/60});
assert.equal(locations.data.slowestFrames.length,8);assert.equal(locations.data.slowestFrames[0].frameIndex,19);
assert.throws(()=>locations.frame(()=>{time++;throw Error();},true,{index:20,timeSeconds:1}));locations.finish();assert.equal(locations.data.incompleteSpans,0);
const motionSource=await readFile(new URL('../src/motion/render.js',import.meta.url),'utf8');
const noop=()=>{};let contentCalls=0;const canvas={width:32,height:18};
const canvasCtx=new Proxy({canvas,globalAlpha:1,getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),createLinearGradient:()=>({addColorStop:noop})},{get:(o,k)=>k in o?o[k]:noop});canvas.getContext=()=>canvasCtx;
const sandbox={console,performance,Map,Set,Math,document:{createElement:()=>canvas},withProfileContext,
 MediaPool:class{},EASINGS:{},evalLayer:(L,t,e)=>({L,lt:t,dur:1,active:true,alpha:1,P:{},fx:[],mods:{wipe:null},world:[1,0,0,1,0,0]}),
 needsBuffer:s=>!!s.L.buffer,frameEnv:()=>({}),M:{mul:(a,b)=>a,apply:(m,x,y)=>({x,y})},
 compileCode:()=>({fn:()=>{contentCalls++;time+=3;},error:null}),codeEnv:x=>x};
vm.createContext(sandbox);vm.runInContext(motionSource.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\nglobalThis.MotionRenderer=MotionRenderer;',sandbox);
for(const optimized of [false,true]) {
 const testLayers=[{id:'secret',type:'code',t0:0,t1:1,data:{code:'secret'}},{id:'mask',type:'code',t0:0,t1:1,data:{code:'mask'},buffer:true,mblur:50},{id:'clip',type:'code',t0:0,t1:1,data:{code:'clip'},buffer:true,clip:'below'}];
 const report={};const profile=createRenderProfile({detail:(k,v)=>report[k]=v},testLayers,{clock:()=>time});
 const R=new sandbox.MotionRenderer();R._filtersImpl=(src)=>{time+=2;return src;};R._scratch=()=>canvas;R._geo=()=>null;
 const run=prof=>R.draw(canvasCtx,testLayers,.5,{exporting:true,profile:prof,frameDur:1/60},{});
 let before=contentCalls;run(null);const without=contentCalls-before;
 before=contentCalls;profile.frame(()=>run(profile));const withP=contentCalls-before;assert.equal(withP,without,'profiling cannot add drawing calls');
 assert(profile.data.buckets.some(r=>r.stage==='layer.total'&&r.layerIndex===0));
 assert(profile.data.buckets.some(r=>r.stage==='layer.buffer'&&r.layerIndex===1),'mask attributed to its own ordinal');
 assert(profile.data.buckets.some(r=>r.stage==='code.execute'&&r.calls===8),'export motion blur counted');
 profile.frame(()=>run(profile),true);profile.finish();assert.equal(profile.data.redrawCalls,1);assert.equal(profile.data.incompleteSpans,0);assert.equal(profileContext(canvasCtx),null);
 reports.push({mode:optimized?'optimized':'original',renderProfile:report.renderProfile});
}
const sceneSource=await readFile(new URL('../src/engine/renderer.js',import.meta.url),'utf8');
const sceneBox={console,performance,W:32,H:18,C:{BG:'#000',BONE:'#fff'},SECT:[[0,1,'none','#fff']],S:()=>1,
 clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),rgba:()=> '#000',hash2:()=>0,
 rect:noop,DRAW:{},TEXT_FX:{},TEXT_FX2:{},TEXT_FX3:{},mixFn:()=>null,mixOf:()=>null,
 drawLayers:noop,MotionRenderer:sandbox.MotionRenderer,TOOLBOX:{},frameEnv:()=>({}),evalEffects:()=>[],combine:()=>({}),moveMods:()=>[],drawIdle:noop};
vm.createContext(sceneBox);vm.runInContext(sceneSource.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\nglobalThis.Renderer=Renderer;',sceneBox);
canvasCtx.createRadialGradient=()=>({addColorStop:noop});
const R=new sceneBox.Renderer({canvas,ctx:canvasCtx,begin:()=>canvasCtx,end:noop});R.setSong({kick:()=>0,activeLine:()=>-1});R.bloom=0;R.tone=false;R.grain=0;
let report={};const profile=createRenderProfile({detail:(k,v)=>report[k]=v});R.profile=profile;R.renderFrame(.2);assert.equal(profile.data.buckets.length,0,'preview is not profiled');
R.exporting=true;profile.frame(()=>R.renderFrame(.2));profile.finish();
for(const s of ['scene.background','scene.behind','scene.lyrics','scene.idle','scene.text','scene.front','scene.screenFx','scene.finish','grade.bloom','grade.tone','grade.vignette','grade.grain'])assert(profile.data.buckets.some(r=>r.stage===s),s);assert.equal(profile.data.incompleteSpans,0);
const pySource=await readFile(new URL('../src/motion/importers/pyreal.js',import.meta.url),'utf8');
const pyBox={console,performance,profileContext,document:{createElement:()=>canvas},ImageData:class{constructor(bytes,w,h){this.data=bytes;this.width=w;this.height=h;}},setTimeout};
vm.createContext(pyBox);vm.runInContext(pySource.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+`\nglobalThis.realFrame=realFrame;globalThis.mockBridge=()=>{B={R:{},begin(){},end(){}};W={frame(){B.R.out={w:2,h:2,u8:new Uint8Array(16)};}};};`,pyBox);pyBox.mockBridge();
report={};const pyLayer={type:'code'};const pyProfile=createRenderProfile({detail:(k,v)=>report[k]=v},[pyLayer]);
withProfileContext(canvasCtx,pyProfile,pyLayer,()=>pyBox.realFrame({g:{has:()=>true},frames:0},{name:'frame',mode:'t'},canvasCtx,.5,{W0:32,H0:18}));
pyProfile.finish();for(const stage of ['python.frameAndPack','python.pixelUpload','python.composite'])assert(pyProfile.data.buckets.some(r=>r.stage===stage),stage);assert.equal(pyProfile.data.incompleteSpans,0);reports.push({pythonBridgeFixture:true,renderProfile:report.renderProfile});
await mkdir('artifacts/export-tests',{recursive:true});await writeFile('artifacts/export-tests/render-profiles.json',JSON.stringify({synthetic:true,runs:reports},null,2));
console.log('PASS render profiling: nested inclusive/self times, privacy, bounded memory, preview off, both modes, redraw, motion-blur/mask attribution, scene stages and Python bridge spans');
