import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {loadPyodide} from 'pyodide';
import {PY_PREVIEW} from '../src/motion/importers/py-preview.js';
import {PY_EXPORT_OPT} from '../src/motion/importers/py-export-opt.js';
const py=await loadPyodide();await py.loadPackage(['numpy','pillow']);
py.runPython(PY_PREVIEW);py.runPython(PY_EXPORT_OPT);
py.globals.set('source',await readFile(new URL('./fixtures/showreel-export.py',import.meta.url),'utf8'));
const bridgeSource=await readFile(new URL('../src/motion/importers/pyreal.js',import.meta.url),'utf8');
py.globals.set('loaderSource',bridgeSource.slice(bridgeSource.indexOf('def wv_load('),bridgeSource.indexOf('def _gd(')));
py.runPython(String.raw`
import builtins, sys
_ANIM=[]; _SCREEN=[None]; _OUT={}
class _WVStop(BaseException): pass
def _patch(src): pass
def _guard(limit): pass
exec(loaderSource)
g,err,ok=wv_load(source,40,'frame',0,True)
assert err is None and ok and g['__wv_export_optimizations__']==2
assert '_wv_mask_minimum' in g and '_wv_can_inplace' in g
original,err,ok=wv_load(source,40,'frame',0,False)
assert err is None and ok and original['__wv_export_optimizations__']==0
assert '_wv_mask_minimum' not in original
assert g['W']==original['W']==1920 and g['SS']==original['SS']==2
`);
py.runPython(String.raw`
import numpy as np, time, statistics
from PIL import Image

def load(src, opt=False, preview=0):
    g={'__name__':'webvid','_wv_mask_minimum':_wv_mask_minimum,'_wv_can_inplace':_wv_can_inplace}
    code, count=_wv_export_compile(src,preview,opt)
    exec(code,g)
    return g,count

def size_source(w,h):
    return source.replace('1920, 1080, 30, 15.0, 2', '%d, %d, 30, 15.0, 2' % (w,h))

# True lossless output and identical RNG progression, all six scenes, arbitrary seek order.
for w,h,times in [(192,108,[0,.15,2.59,2.6,5.2,6.2,7.999,8,11,12.4,13.4,14.8,3,6.1]),(1920,1080,[5.35,6.2])]:
    a,na=load(size_source(w,h),False);b,nb=load(size_source(w,h),True)
    assert na==0 and nb==2
    assert b['W']==w and b['H']==h and b['SS']==2 and b['FPS']==30
    for t in times:
        x,y=a['frame'](t),b['frame'](t)
        assert x.dtype==y.dtype==np.uint8 and x.shape==y.shape
        assert np.array_equal(x,y), ('pixel mismatch',w,h,t,int(np.max(abs(x.astype(int)-y.astype(int)))))
    assert a['rng'].bit_generator.state==b['rng'].bit_generator.state
# Guard avoids changed floating-point rounding with float64 VIG.
a,_=load(size_source(192,108),False);b,_=load(size_source(192,108),True)
a['VIG']=a['VIG'].astype(np.float64);b['VIG']=b['VIG'].astype(np.float64)
assert np.array_equal(a['frame'](6),b['frame'](6))
# Unrecognized code and module/helper shadowing are not rewritten.
for variant in [source.replace('f = np.asarray(img).astype(np.float32)','f = np.asarray(img).astype(np.float64)').replace('Image.fromarray(np.minimum(np.array(layer), np.array(mask)))','layer'),source+'\nnp = None\n',source+'\ndef _wv_mask_minimum(a,b): return a\n']:
    _,count=_wv_export_compile(variant,0,True)
    assert count==0
_,preview_count=_wv_export_compile(source,480,True);assert preview_count==0
# PIL L masks are pixel-identical; non-L and mismatched dimensions use original semantics.
r=np.random.default_rng(2)
for mode,shape in [('L',(64,96)),('RGB',(64,96,3))]:
    a=Image.fromarray(r.integers(0,256,shape,dtype=np.uint8));b=Image.fromarray(r.integers(0,256,shape,dtype=np.uint8))
    old=Image.fromarray(np.minimum(np.array(a),np.array(b)))
    assert np.array_equal(np.array(old),np.array(_wv_mask_minimum(a,b)))
try: _wv_mask_minimum(Image.new('L',(2,2)),Image.new('L',(3,3)))
except ValueError: pass
else: raise AssertionError('shape mismatch must preserve error')
# Alternating full-size post-processing benchmark; timing is evidence, never a flaky assertion.
a,_=load(source,False);b,_=load(source,True)
bench=[]
for repeat in range(4):
    for enabled,g in ((True,b),(False,a)) if repeat%2 else ((False,a),(True,b)):
        t0=time.perf_counter();g['frame'](6.2);bench.append({'optimized':enabled,'ms':(time.perf_counter()-t0)*1000})
bench_result={'synthetic':True,'runtime':'real Pyodide numpy Pillow','width':1920,'height':1080,'supersampling':2,'sceneTimeSeconds':6.2,'pixelEquality':True,'bench':bench,'medianOriginalMs':statistics.median(x['ms'] for x in bench if not x['optimized']),'medianOptimizedMs':statistics.median(x['ms'] for x in bench if x['optimized'])}
`);
const result=py.globals.get('bench_result');const js=result.toJs({dict_converter:Object.fromEntries});result.destroy();
assert.equal(js.pixelEquality,true);
await mkdir('artifacts/export-tests',{recursive:true});await writeFile('artifacts/export-tests/python-export-opt.json',JSON.stringify(js,null,2));
console.log(`PASS real Pyodide export optimization: pixel-identical all scenes + full 1080p, same RNG, original preview/audio contract, float64 fallback, unchanged unknown code; benchmark median original=${js.medianOriginalMs.toFixed(1)}ms optimized=${js.medianOptimizedMs.toFixed(1)}ms (not phone performance)`);
