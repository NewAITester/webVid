import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadPyodide } from 'pyodide';
import { PY_PREVIEW } from '../src/motion/importers/py-preview.js';
import { previewQuality, setPreviewQuality, previewSize, pythonPreviewLimit, PREVIEW_KEY } from '../src/engine/preview.js';

const values = new Map();
globalThis.localStorage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
assert.equal(previewQuality(), 'original');
for (const [quality, width, height] of [['original',1920,1080],['light',960,540],['tiny',480,270]]) {
  setPreviewQuality(quality);
  assert.equal(values.get(PREVIEW_KEY), quality);
  assert.deepEqual(previewSize(1920,1080), {width,height});
  assert.deepEqual(previewSize(1080,1920), {width:height,height:width});
  assert.deepEqual(previewSize(320,180), {width:320,height:180});
  assert.equal(pythonPreviewLimit({exporting:true}), 0);
  assert.equal(pythonPreviewLimit({exporting:false}), quality === 'original' ? 0 : width);
}
assert.equal(setPreviewQuality('not-a-quality'), 'original');
globalThis.localStorage = { setItem: () => { throw Error('denied'); } };
assert.equal(setPreviewQuality('tiny'), 'tiny', 'unavailable storage still permits session preference');

// Evaluate the actual codeEnv/drawCode/runPyFrame functions, with dependency mocks.
const api = await readFile(new URL('../src/motion/codeapi.js',import.meta.url),'utf8');
const box = { noise:()=>0, EASINGS:{}, runImported:()=>{} };
vm.createContext(box);
vm.runInContext(api.replace(/^import .*;\n/gm,'').replace(/export /g,''),box);
const ctx = {save(){},restore(){},translate(){},scale(){}};
assert.equal(box.codeEnv({ctx,exporting:true}).exporting,true);
assert.equal(box.codeEnv({ctx}).exporting,false);
const render = await readFile(new URL('../src/motion/render.js',import.meta.url),'utf8');
box.compileCode = () => ({fn:(_ctx,e) => { box.captured=e; }});
vm.runInContext(render.slice(render.indexOf('function drawCode('),render.indexOf('/* ── اندازهٔ کادر')),box);
box.drawCode(ctx,{L:{id:'test',data:{}},lt:1,dur:15,P:{w:1920,h:1080}},{exporting:true},new Map());
assert.equal(box.captured.exporting,true,'export flag survives the code-layer boundary');
const frames = await readFile(new URL('../src/motion/importers/pyframes.js',import.meta.url),'utf8');
box.getPyInst=()=>({src:'source',fn:{name:'frame'},W0:1920,H0:1080});
box.pythonPreviewLimit=pythonPreviewLimit;
box.realInst=(_src,_fn,limit)=>{box.limit=limit;return {};};
box.realFrame=()=>{};
vm.runInContext(frames.slice(frames.indexOf('export function runPyFrame('),frames.indexOf('/** تصویر کوچک')).replace('export ',''),box);
box.runPyFrame(ctx,box.captured,'source',{},{});
assert.equal(box.limit,0,'export uses original Python even with tiny preference');
box.runPyFrame(ctx,box.codeEnv({ctx,P:{w:1920,h:1080},exporting:false}),'source',{},{});
assert.equal(box.limit,480,'preview passes the selected limit to Python');

// Actual export initializer creates a separate full-size canvas and marks its renderer.
// Stop before codec selection: this checks quality isolation, not successful MP4 delivery.
const exporting = await readFile(new URL('../src/engine/export.js',import.meta.url),'utf8');
const stop = new Error('test stopped before encoder');
const ex = {performance, W:1920,H:1080,document:{createElement:()=>({})},ArrayBufferTarget:class {}};
ex.Stage=class {constructor(canvas){ex.canvas=canvas;} resize(w,h){ex.size=[w,h];}};
ex.Renderer=class {constructor(){ex.renderer=this;}setSong(){return this;}};
vm.createContext(ex);
vm.runInContext(exporting.replace(/^import .*;\n/gm,'').replace(/export /g,''),ex);
ex.pickVideo=async()=>{throw stop;};
setPreviewQuality('tiny');
await assert.rejects(ex.exportVideo({song:{},width:1920,height:1080}),e=>e===stop);
assert.deepEqual(ex.size,[1920,1080]);
assert.equal(ex.canvas.width,1920);
assert.equal(ex.canvas.height,1080);
assert.equal(ex.renderer.exporting,true);

// Actual Pyodide, not a Python mock: sizes change before dependent globals initialize.
const py = await loadPyodide();
py.runPython(PY_PREVIEW);
py.runPython(`
# Only the Pillow import is mocked; the compiler and namespaces are real Pyodide.
import sys, types
_pil = types.ModuleType('PIL')
_pil.Image = types.SimpleNamespace(new=lambda *a: None)
sys.modules['PIL'] = _pil
source = '''from PIL import Image
W, H, FPS, DUR, SS = 1920, 1080, 30, 15.0, 2
RW, RH = W * SS, H * SS
K = RW / 1920
def P(x, y): return (x * K, y * K)
shape = (H, W, 3)
def frame(t):
    img = Image.new('RGB', (RW, RH))
    return (W, H, RW, RH, SS, P(1920, 1080), shape)
'''
def state(src, limit):
    g = {'__name__':'webvid'}
    exec(_wv_preview_compile(src, limit), g)
    return g
full = state(source, 0)
light = state(source, 960)
tiny = state(source, 480)
assert full['frame'](1) == (1920,1080,3840,2160,2,(3840,2160),(1080,1920,3))
assert light['frame'](1) == (960,540,960,540,1,(960,540),(540,960,3))
assert tiny['frame'](1) == (480,270,480,270,1,(480,270),(270,480,3))
# Switching does not contaminate the original instance or stored source.
assert full['W'] == state(source, 0)['W'] == 1920
assert '1920, 1080, 30, 15.0, 2' in source
# Unknown/unscaled scripts must NOT be blindly resized/cropped.
unknown = source.replace('return (x * K, y * K)', 'return (x, y)')
assert state(unknown, 480)['RW'] == 3840
assert state(source.replace('from PIL import Image', 'Image = None'), 480)['RW'] == 3840
assert state(source.replace('W, H, FPS, DUR, SS = 1920, 1080, 30, 15.0, 2', 'W, H, FPS, DUR, SS = 320, 180, 30, 15.0, 2'), 480)['W'] == 320
`);
// The runtime cache must keep different resolutions separate; audio always uses original.
const real = await readFile(new URL('../src/motion/importers/pyreal.js',import.meta.url),'utf8');
const cache = {insts:new Map(),hashStr:s=>s,imports:()=>false,W:{load:(src,timeout,fn,limit)=>({get:i=> i===0 ? {limit,get:k=>limit ? (k==='W' ? 480 : k==='H' ? 270 : null) : null,destroy(){}} : null,destroy(){}})}};
vm.createContext(cache);
vm.runInContext(real.slice(real.indexOf('function makeInst('),real.indexOf('/** نمونهٔ آماده')),cache);
const original=cache.makeInst('source','frame',0);
const low=cache.makeInst('source','frame',480);
assert.notEqual(original,low);
assert.equal(low.g.limit,480);
assert.equal(low.pixelSize.w,480);
assert.equal(low.pixelSize.h,270);
assert.equal(original.pixelSize,undefined);
assert.equal(cache.makeInst('source','frame',0),original);
assert.match(real,/export async function realInstAsync[\s\S]*?return makeInst\(src, fn\);/);
console.log('PASS: preview sizing, persistence, export flag pipeline, real Pyodide scaling, source preservation and isolated runtime caches');
