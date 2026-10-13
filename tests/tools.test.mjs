import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';
import { CACHE, plan, cacheKey, valid } from '../src/tools/plan.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const body = new TextEncoder().encode('test runtime');
const file = { path:'ffmpeg/1/core.js', url:'https://example.test/core.js', bytes:body.length, sha256:hash(body), name:'FFmpeg', tool:'ffmpeg' };
const manifest = { entries:{ python:{ deps:['numpy'], files:[{ ...file,path:'python/core' }] }, numpy:{ deps:['python'], files:[{ ...file,path:'python/numpy' }] }, ffmpeg:{ files:[file] } } };
assert.equal(plan(manifest,['python','numpy']).length,2,'cyclic shared dependency is deduplicated');
assert.equal(plan(manifest,['ffmpeg','ffmpeg']).length,1);
assert.throws(() => plan(manifest,['missing']), /ناشناخته/);
assert.equal(cacheKey(file,'https://host.test/app/'), `https://host.test/app/__tool-cache/${file.sha256}`);
const ok = new Response(body,{ headers:{'x-tool-sha256':file.sha256,'content-length':String(file.bytes)} });
assert(valid(ok,file));
assert(!valid(ok,{ ...file, bytes:99 }));
assert(!valid(ok,{ ...file, sha256:'changed' }));
assert.equal(CACHE,'wv-tools-sha256-v1');

// Run the actual download worker with isolated Web APIs; no network required.
let source = readFileSync(new URL('../src/tools/download-worker.js',import.meta.url),'utf8').replace(/^import .*\n/,'');
async function workerRun({ response = () => new Response(body), cached, files=[file], action } = {}) {
  const entries = new Map(); if (cached) entries.set(cacheKey(file,'https://host.test/app/'),cached);
  const messages = []; let requests = 0;
  const self = { postMessage:x => { messages.push(x); action?.(x,self); } };
  const cache = { match:async k => entries.get(k)?.clone(), put:async (k,r) => { entries.set(k,r); } };
  const context = vm.createContext({ self, CACHE, cacheKey, valid, caches:{ open:async () => cache },
    fetch:async () => { requests++; return response(); }, Response, Blob, AbortController,
    performance, crypto:webcrypto, setTimeout, clearTimeout, URL, Uint8Array, console });
  vm.runInContext(source,context);
  await self.onmessage({ data:{files,base:'https://host.test/app/'} });
  return { messages, requests, entries };
}
let result = await workerRun();
assert.equal(result.messages.at(-1).type,'done');
assert.equal(result.requests,1);
assert(valid([...result.entries.values()][0],file));
result = await workerRun({ cached:ok });
assert.equal(result.requests,0,'complete tools do not download again');
assert.equal(result.messages[0].type,'cached');
result = await workerRun({ response:() => new Response('wrong bytes!') });
assert.equal(result.messages.at(-1).type,'error');
assert.equal(result.entries.size,0,'corrupt downloads are never installed');
result = await workerRun({ response:() => new Response(body.slice(0,3)) });
assert.equal(result.messages.at(-1).type,'error');
assert.equal(result.entries.size,0,'partial downloads are never installed');
result = await workerRun({ response:() => new Response(body,{status:503}) });
assert.equal(result.messages.at(-1).type,'error');
result = await workerRun({ action:(data,self) => { if(data.type === 'verifying') self.onmessage({data:{type:'cancel'}}); } });
assert.equal(result.messages.at(-1).type,'error');
assert.equal(result.entries.size,0,'cancellation during validation does not install files');
const bad = { ...file, path:'ffmpeg/1/bad.js', bytes:3, sha256:hash(new Uint8Array([1,2,3])) };
result = await workerRun({ files:[file,bad] });
assert.equal(result.entries.size,1,'a later failure preserves previously completed files');
assert.equal(result.messages.at(-1).type,'error');

// Verify the actual SW refuses network fallback and handles nested application paths.
const handlers = {}; let served, fetches = 0;
const scope = 'https://host.test/nested/app/';
const swSelf = { registration:{scope}, addEventListener:(name,fn) => { handlers[name]=fn; }, skipWaiting:async () => {}, clients:{claim:async () => {}} };
const cachedKey = cacheKey(file,scope);
const context = vm.createContext({ self:swSelf, URL, Response,
  fetch:async () => { fetches++; return Response.json({entries:{ffmpeg:{files:[file]}}}); },
  caches:{open:async () => ({match:async k => k === cachedKey ? ok.clone() : undefined})} });
vm.runInContext(readFileSync(new URL('../public/tools-sw.js',import.meta.url),'utf8'),context);
handlers.fetch({request:{url:scope+'runtime/'+file.path},respondWith:p => { served=p; }});
assert.equal((await served).status,200);
handlers.fetch({request:{url:scope+'runtime/unknown'},respondWith:p => { served=p; }});
assert.equal((await served).status,404);
assert.equal(fetches,1,'service worker only reads manifest, never downloads binaries');
console.log('PASS: tool dependency planning, versioned cache, checksum/size validation, retry, cancellation, partial preservation, offline service-worker routing');

// Exercise the actual prebuild generator with modern and legacy lock formats.
await import('./prepare-tools.test.mjs');
