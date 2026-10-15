import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import {chooseVideoConfig,configureVideoEncoder} from '../src/engine/export-mode.js';
import {saveNativeBlob} from '../src/engine/save.js';
import {createRenderProfile} from '../src/engine/render-profile.js';
import {startExportLog,fingerprint} from '../src/engine/export-log.js';

const logs=[];
const settings={width:320,height:180,bitrate:1000000,framerate:24};
const codec={codec:'vp09.00.10.08',mux:'vp9',label:'VP9'};
let calls=[];
const probe={isConfigSupported:async config=>{calls.push(config);return {supported:true,config};}};
assert.equal((await chooseVideoConfig(codec,settings,false,null,probe)).config.hardwareAcceleration,undefined);
assert.equal(calls.length,1,'legacy path unchanged');
assert.equal((await chooseVideoConfig(codec,settings,true,null,probe)).config.hardwareAcceleration,'prefer-hardware');
const warnings=[];const warningLog={warn:x=>warnings.push(x)};
const unavailable={isConfigSupported:async config=>({supported:!config.hardwareAcceleration,config})};
assert.equal((await chooseVideoConfig(codec,settings,true,warningLog,unavailable)).config.hardwareAcceleration,undefined);
const ignored={isConfigSupported:async config=>({supported:true,config:{codec:config.codec}})};
assert.equal((await chooseVideoConfig(codec,settings,true,warningLog,ignored)).config.hardwareAcceleration,undefined);
const configurations=[];
configureVideoEncoder({configure(c){configurations.push(c);if(c.hardwareAcceleration)throw Error('driver');}}, {...settings,hardwareAcceleration:'prefer-hardware'},warningLog);
assert.equal(configurations.length,2);assert.equal(configurations[1].hardwareAcceleration,undefined);
assert(warnings.includes('hardware-configure-fallback'));

const source=await readFile(new URL('../src/engine/export.js',import.meta.url),'utf8');
let failEncode=false;
class FakeFrame{constructor(canvas,opts){this.timestamp=opts.timestamp;this.closed=false;}close(){this.closed=true;}}
const sandbox={console,performance,setTimeout,DOMException,Blob,chooseVideoConfig,configureVideoEncoder,W:320,H:180,
 createRenderProfile,document:{createElement:()=>({})},VideoFrame:FakeFrame,
 Stage:class{constructor(c){this.canvas=c;}resize(w,h){this.canvas.width=w;this.canvas.height=h;}},
 Renderer:class{constructor(stage){this.stage=stage;}setSong(){return this;}renderFrame(){assert.equal(this.exporting,true);}},
 domSettle:async()=>false,
 ArrayBufferTarget:class{constructor(){this.buffer=new Uint8Array([1,2,3]).buffer;}},
 Muxer:class{addVideoChunk(){}finalize(){}},
 VideoEncoder:class{static isConfigSupported=probe.isConfigSupported;constructor(c){this.cb=c;this.state='unconfigured';this.encodeQueueSize=0;}configure(c){this.config=c;this.state='configured';}encode(frame){if(failEncode)throw Error('encode-failure');this.cb.output({timestamp:frame.timestamp},{});}async flush(){}close(){this.state='closed';}}
};
sandbox.chooseVideoConfig=(codec,settings,optimized,log)=>chooseVideoConfig(codec,settings,optimized,log,sandbox.VideoEncoder);
vm.createContext(sandbox);vm.runInContext(source.replace(/^import .*;\n/gm,'').replace(/^export /gm,''),sandbox);
for(const optimized of [false,true]) {
 const snapshots=[],save=async report=>{snapshots.push(JSON.parse(JSON.stringify(report)));return [];};
 const log=await startExportLog({mode:optimized?'optimized':'original',sceneFingerprint:await fingerprint('same-scene'),...settings},{snapshot:async()=>({processCpuMs:100,processPssKiB:123}),save});
 const blob=await sandbox.exportVideo({song:{},from:0,to:1/6,width:320,height:180,fps:24,optimized,log});
 assert.equal(blob.type,'video/mp4');assert.equal(blob.size,3);
 assert.equal(log.report.counts.renderedFrames,4);assert.equal(log.report.counts.encodedVideoChunks,4);
 assert.equal(log.report.details.videoEncoderConfig.hardwareAcceleration,optimized?'prefer-hardware':undefined);
 assert.equal(log.report.details.actualHardwareEncoder,null);
 const result=await log.finish('success');assert.equal(snapshots[0].status,'running');assert.equal(snapshots.at(-1).status,'success');
 assert.equal(result.details.renderProfile.renderCalls,4);assert.equal(result.details.renderProfile.incompleteSpans,0);assert(result.timingsMs.uiYield>=0);assert(result.timingsMs.videoEncodeSubmit>=0);assert.equal(result.status,'success');assert(result.timingsMs.videoWall>=0);assert(result.timingsMs.total>=0);
 logs.push(result);
}
for(const status of ['cancelled','failed']) {
 const log=await startExportLog({mode:'original'},{snapshot:async()=>null,save:async()=>[]});
 const controller=new AbortController();if(status==='cancelled')controller.abort();else failEncode=true;
 let error;
 try{await sandbox.exportVideo({song:{},to:1/6,fps:24,signal:controller.signal,log});assert.fail('must fail');}catch(e){error=e;}
 failEncode=false;
 await log.finish(status,error);assert.equal(log.report.status,status);assert.equal(log.report.error.stage,status==='cancelled'?'unknown':'video');assert(log.report.warnings.includes('native-system-metrics-unavailable'));logs.push(log.report);
}

const bytes=Buffer.alloc(7*1024*1024+17);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
for(const optimized of [false,true]) {
 const events=[],parts=[];let wholeRead=0;
 const blob=new Blob([bytes],{type:'video/mp4'}),original=blob.arrayBuffer.bind(blob);
 blob.arrayBuffer=()=>{wholeRead++;if(optimized)throw Error('whole-file copy forbidden');return original();};
 const fs={async writeFile(){events.push('create');},async appendFile({data}){parts.push(Buffer.from(data,'base64'));},async getUri(){return {uri:'file:///tmp/video'};},async deleteFile(){events.push('delete');}};
 const media={async saveToDownloads(){return {uri:'content://downloads/test',path:'Download/test.mp4'};}};
 const log=await startExportLog({mode:optimized?'optimized':'original'},{snapshot:async()=>null,save:async()=>[]});
 const result=await saveNativeBlob(blob,'test.mp4',()=>{}, {Filesystem:fs,Directory:{Cache:'cache'},MediaSaver:media,optimized,log});
 assert.equal(result.where,'downloads');assert.deepEqual(Buffer.concat(parts),bytes);
 assert.equal(wholeRead,optimized?0:1);
 assert(parts.every(x=>x.length<=(optimized?1:3)*1024*1024));
 assert.equal(log.report.counts.saveChunks,parts.length);await log.finish('success');logs.push(log.report);
 // Publishing failure keeps the complete cache file, usable through Share.
 parts.length=0;
 const partialLog=await startExportLog({mode:optimized?'optimized':'original'},{snapshot:async()=>null,save:async()=>[]});
 const partial=await saveNativeBlob(blob,'test.mp4',()=>{}, {Filesystem:fs,Directory:{Cache:'cache'},MediaSaver:{saveToDownloads:async()=>{throw Error('no space');}},optimized,log:partialLog});
 assert(partialLog.report.warnings.includes('downloads-publish-failed-cache-preserved'));
 await partialLog.finish('partial-save');logs.push(partialLog.report);
 assert.equal(partial.where,'cache');assert.equal(partial.canShare,true);assert(!events.includes('delete'));
 const controller=new AbortController();
 await assert.rejects(saveNativeBlob(blob,'test.mp4',()=>controller.abort(),{Filesystem:fs,Directory:{Cache:'cache'},MediaSaver:media,optimized,signal:controller.signal}),{name:'AbortError'});
 assert(events.includes('delete'),'cancel removes partial temp file');
}
const privacyLog=await startExportLog({mode:'original'},{snapshot:async()=>null,save:async()=>[]});
await privacyLog.finish('failed',new Error('private code/title/path must never enter log'));
assert(!JSON.stringify(privacyLog.report).includes('private code/title/path'));
await mkdir('artifacts/export-tests',{recursive:true});await writeFile('artifacts/export-tests/unit-reports.json',JSON.stringify({synthetic:true,runs:logs},null,2));
console.log('PASS both export modes: hardware probing/fallback, isolated full-size renderer, encoder cleanup, success/error/cancel logs, byte-identical native saves, bounded slice reads, cache recovery and report privacy');
