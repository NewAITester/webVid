/**
 * پایتون واقعی (CPython + numpy/scipy/Pillow روی WebAssembly با Pyodide)
 * ─────────────────────────────────────────────────────────────
 * فایل‌های Pyodide داخل خود برنامه‌اند (public/pyodide ← scripts/copy-pyodide.mjs)،
 * پس چیزی از اینترنت دانلود نمی‌شود. کد پایتون وارد‌شده همان‌طور که هست با پایتون
 * واقعی اجرا می‌شود: صدا (wave / scipy.io.wavfile) دقیقاً همان خروجی اجرای اصلی است و
 * فریم‌ها با numpy واقعی حساب می‌شوند؛ فقط cairo به بوم برنامه وصل است (cairoBridge).
 * تا وقتی پایتون واقعی آماده نشده (یا اگر فایل‌هایش نبود) مفسر داخلی کار می‌کند.
 */
import { cairoBridge } from './pyframes.js';
import { addPending } from './domframes.js';

/** بسته‌هایی که همراه برنامه‌اند: نام import ← نام بسته */
const BUNDLED = { numpy: 'numpy', scipy: 'scipy', PIL: 'pillow' };

let PY = null, B = null, W = null, loading = null, failed = null;
const loaded = new Set(), pkgJobs = new Map(), insts = new Map();

export function pyodideBase() {
  if (globalThis.WV_PYODIDE_URL) return globalThis.WV_PYODIDE_URL;
  try { return new URL('pyodide/', document.baseURI).href; } catch { return './pyodide/'; }
}
const fire = () => { try { window.dispatchEvent(new Event('wv-dom-frame')); } catch { /* */ } };
export const realState = () => (PY ? 'ready' : failed ? 'failed' : loading ? 'loading' : 'idle');
export const realError = () => failed;

const GLUE = String.raw`
import sys, types, json, time, builtins, importlib.machinery
from collections import namedtuple
import _wvc
from pyodide.ffi import JsProxy, to_js
import js

_SIMPLE = (float, int, str, bool, type(None))
def _a(v):
    t = type(v)
    if t in _SIMPLE: return v
    if isinstance(v, _O): return v._h
    if isinstance(v, (int, float)): return float(v)
    if isinstance(v, (list, tuple)): return to_js([_a(x) for x in v])
    if hasattr(v, 'dtype') and getattr(v, 'ndim', 1) == 0: return float(v)
    if hasattr(v, 'tolist'): return _a(v.tolist())
    if isinstance(v, (bytes, bytearray, memoryview)): return to_js(bytes(v))
    try: return float(v)
    except Exception: return v
def _args(a): return to_js([_a(x) for x in a])
def _kw(k): return to_js({n: _a(v) for n, v in k.items()}, dict_converter=js.Object.fromEntries) if k else None

def _wrap(cls, h):
    o = object.__new__(cls); o._h = h; return o
def _r(v):
    if not isinstance(v, JsProxy): return v
    k = _wvc.kind(v)
    if k == 'arr': return tuple(_r(x) for x in v)
    if k == 'surface': return _wrap(ImageSurface, v)
    if k == 'ctx': return _wrap(Context, v)
    if k == 'pattern': return _wrap(Pattern, v)
    if k == 'matrix': return _wrap(Matrix, v)
    if k == 'bytes': return v.to_bytes()
    return _wrap(_O, v)

TextExtents = namedtuple('TextExtents', 'x_bearing y_bearing width height x_advance y_advance')
FontExtents = namedtuple('FontExtents', 'ascent descent height max_x_advance max_y_advance')
_SPECIAL = {'text_extents': TextExtents, 'font_extents': FontExtents}

class _O:
    def __getattr__(self, n):
        if n.startswith('__') or n == '_h': raise AttributeError(n)
        k = _wvc.has(self._h, n)
        if k == 0: raise AttributeError(n)
        if k == 2: return _r(_wvc.get(self._h, n))
        nt = _SPECIAL.get(n)
        if nt:
            def m(self, *a, **kw): return nt(*_r(_wvc.call(self._h, n, _args(a), _kw(kw))))
        else:
            def m(self, *a, **kw): return _r(_wvc.call(self._h, n, _args(a), _kw(kw)))
        m.__name__ = n
        cls = type(self)
        if cls is not _O: setattr(cls, n, m)
        return m.__get__(self, cls)
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def __eq__(self, o): return isinstance(o, _O) and _wvc.same(self._h, o._h)
    def __hash__(self): return id(self)

def _mk(name):
    def __new__(cls, *a, **k): return _wrap(cls, _wvc.make(name, _args(a), _kw(k)))
    return __new__

class Surface(_O): pass
class ImageSurface(Surface):
    __new__ = _mk('ImageSurface')
    def __init__(self, *a, **k): pass
    @staticmethod
    def create_from_png(*a): return _r(_wvc.stat('ImageSurface', 'create_from_png', _args(a), None))
    @staticmethod
    def format_stride_for_width(*a): return _wvc.stat('ImageSurface', 'format_stride_for_width', _args(a), None)
    @classmethod
    def create_for_data(cls, data, fmt, w, h, stride=None): return ImageSurface(fmt, w, h)
class Context(_O):
    __new__ = _mk('Context')
    def __init__(self, *a, **k): pass
class Pattern(_O): pass
class Gradient(Pattern): pass
class LinearGradient(Gradient):
    __new__ = _mk('LinearGradient')
    def __init__(self, *a, **k): pass
class RadialGradient(Gradient):
    __new__ = _mk('RadialGradient')
    def __init__(self, *a, **k): pass
class SolidPattern(Pattern):
    __new__ = _mk('SolidPattern')
    def __init__(self, *a, **k): pass
class SurfacePattern(Pattern):
    __new__ = _mk('SurfacePattern')
    def __init__(self, *a, **k): pass
class Matrix(_O):
    __new__ = _mk('Matrix')
    def __init__(self, *a, **k): pass
class FontOptions(_O):
    __new__ = _mk('FontOptions')
    def __init__(self, *a, **k): pass
class Error(Exception): pass
CairoError = Error
MemoryError = builtins.MemoryError

_cm = types.ModuleType('cairo')
for _k, _v in list(globals().items()):
    if _k in ('Surface', 'ImageSurface', 'Context', 'Pattern', 'Gradient', 'LinearGradient', 'RadialGradient', 'SolidPattern', 'SurfacePattern', 'Matrix', 'FontOptions', 'Error', 'CairoError', 'TextExtents', 'FontExtents'):
        setattr(_cm, _k, _v)
for _k, _v in json.loads(_wvc.consts()).items(): setattr(_cm, _k, _v)
for _k, _d in json.loads(_wvc.enums()).items(): setattr(_cm, _k, type(_k, (), dict(_d)))
_cm.version = '1.26.1'; _cm.version_info = (1, 26, 1)
_cm.cairo_version = lambda: 11800; _cm.cairo_version_string = lambda: '1.18.0'
for _f in ('HAS_IMAGE_SURFACE', 'HAS_PNG_FUNCTIONS', 'HAS_PDF_SURFACE', 'HAS_SVG_SURFACE', 'HAS_PS_SURFACE', 'HAS_FT_FONT', 'HAS_MIME_SURFACE'): setattr(_cm, _f, _f in ('HAS_IMAGE_SURFACE', 'HAS_PNG_FUNCTIONS'))
sys.modules['cairo'] = _cm
sys.modules['cairocffi'] = _cm

# کتابخانه‌هایی که در برنامه نیستند (cv2، imageio، playwright، …) ← ماژول خالی تا import خطا ندهد
class _Dummy:
    def __call__(self, *a, **k): return _Dummy()
    def __getattr__(self, n):
        if n.startswith('__'): raise AttributeError(n)
        return _Dummy()
    def __iter__(self): return iter(())
    def __bool__(self): return False
    def __len__(self): return 0
    def __enter__(self): return self
    def __exit__(self, *a): return False
class _Stub(types.ModuleType):
    def __getattr__(self, n):
        if n.startswith('__'): raise AttributeError(n)
        return _Dummy()
class _StubLoader:
    def create_module(self, spec): return _Stub(spec.name)
    def exec_module(self, m): m.__path__ = []; m.__wv_stub__ = True
_STUBBED = set()
class _StubFinder:
    def find_spec(self, name, path=None, target=None):
        _STUBBED.add(name.split('.')[0])
        return importlib.machinery.ModuleSpec(name, _StubLoader(), is_package=True)
sys.meta_path.append(_StubFinder())

class _Limit(Exception): pass
def _guard(limit):
    t0 = time.time(); c = [0]
    def tr(frame, ev, arg):
        c[0] += 1
        if c[0] % 500 == 0 and time.time() - t0 > limit: raise TimeoutError('اجرای کد پایتون بیش از %d ثانیه طول کشید' % limit)
        return None
    sys.settrace(tr)

def wv_load(src, limit=40):
    g = {'__name__': 'webvid', '__file__': '/home/pyodide/code.py', '__builtins__': builtins}
    sys.argv = ['code.py']
    err = None
    _guard(limit)
    try:
        exec(compile(src, 'code.py', 'exec'), g)
    except SystemExit as e:
        err = 'SystemExit: %s' % (e.code,)
    except BaseException as e:
        import traceback
        err = ''.join(traceback.format_exception_only(type(e), e)).strip()
        tb = e.__traceback__
        while tb and tb.tb_next: tb = tb.tb_next
        if tb and tb.tb_frame.f_code.co_filename == 'code.py': err = 'خط %d: %s' % (tb.tb_lineno, err)
    finally:
        sys.settrace(None)
    return g, err

def wv_wrap(kind, h): return _wrap({'ctx': Context, 'surface': ImageSurface}[kind], h)

_AUDIO = ['make_audio', 'synth_audio', 'build_audio', 'generate_audio', 'render_audio', 'make_music', 'synth', 'make_sound', 'audio', 'music', 'soundtrack', 'make_soundtrack']
def wv_audio(g, name, limit=120):
    import os, inspect, glob
    f = g.get(name) if name else None
    if not callable(f):
        for n in _AUDIO:
            if callable(g.get(n)): f = g[n]; break
    if not callable(f): return None
    def wavs():
        out = {}
        for d in ('/home/pyodide', '/tmp', '/home/pyodide/out', '.'):
            for p in glob.glob(os.path.join(d, '**', '*.wav'), recursive=True):
                try: out[os.path.abspath(p)] = os.stat(p).st_mtime_ns
                except OSError: pass
        return out
    before = wavs()
    target = '/tmp/wv_audio.wav'
    if os.path.exists(target): os.remove(target)
    try:
        req = [p for p in inspect.signature(f).parameters.values() if p.default is p.empty and p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)]
    except (TypeError, ValueError):
        req = []
    _guard(limit)
    try:
        ret = f(*([target] + [None] * (len(req) - 1))) if req else f()
    finally:
        sys.settrace(None)
    if os.path.exists(target): return target
    after = wavs()
    new = [p for p, m in after.items() if before.get(p) != m]
    if new: return max(new, key=lambda p: after[p])
    if isinstance(ret, (str, os.PathLike)) and str(ret).endswith('.wav') and os.path.exists(ret): return str(ret)
    if isinstance(ret, (bytes, bytearray)) and bytes(ret[:4]) == b'RIFF':
        open(target, 'wb').write(ret); return target
    return None
`;

/** بار کردن Pyodide (یک بار) */
export function loadReal() {
  if (loading) return loading;
  if (typeof document === 'undefined' || globalThis.WV_NO_REAL_PY) { failed = 'unavailable'; return (loading = Promise.resolve(null)); }
  loading = (async () => {
    const base = pyodideBase();
    const { loadPyodide } = await import(/* @vite-ignore */ base + 'pyodide.mjs');
    const py = await loadPyodide({ indexURL: base, stdout: () => {}, stderr: () => {} });
    await py.loadPackage(['numpy'], { messageCallback: () => {} });
    loaded.add('numpy');
    B = cairoBridge();
    B.same = (a, b) => a === b;
    py.registerJsModule('_wvc', B);
    const ns = py.globals.get('dict')();
    py.runPython(GLUE, { globals: ns });
    W = { ns, load: ns.get('wv_load'), wrap: ns.get('wv_wrap'), audio: ns.get('wv_audio') };
    PY = py;
    fire();
    return py;
  })().catch(e => { failed = String(e?.message || e); console.warn('Pyodide:', e); return null; });
  return loading;
}

function needPkgs(src) {
  const out = new Set();
  for (const m of String(src).matchAll(/^\s*(?:from\s+([A-Za-z_]\w*)|import\s+([A-Za-z_][\w., ]*))/gm)) {
    for (const n of (m[1] ? [m[1]] : m[2].split(',').map(x => x.trim().split(/[.\s]/)[0]))) if (BUNDLED[n]) out.add(BUNDLED[n]);
  }
  return [...out].filter(p => !loaded.has(p));
}
function ensurePkgs(list) {
  const key = list.slice().sort().join(',');
  if (!pkgJobs.has(key)) {
    pkgJobs.set(key, PY.loadPackage(list, { messageCallback: () => {} }).then(() => { list.forEach(p => loaded.add(p)); fire(); })
      .catch(e => { console.warn('Pyodide packages', list, e); list.forEach(p => loaded.add(p)); }));
  }
  return pkgJobs.get(key);
}
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + ':' + s.length; };

function makeInst(src) {
  const key = hashStr(src);
  let RI = insts.get(key);
  if (RI) return RI;
  const r = W.load(src);
  const g = r.get(0), err = r.get(1);
  r.destroy();
  RI = { key, g, error: err ? new Error(err) : null, frames: 0 };
  insts.set(key, RI);
  if (insts.size > 4) { const [k0, o] = insts.entries().next().value; try { o.g.destroy(); } catch { /* */ } insts.delete(k0); }
  return RI;
}

/** نمونهٔ آماده (هم‌زمان) یا null — اگر آماده نیست بار کردن شروع می‌شود */
export function realInst(src) {
  if (failed) return null;
  if (!PY) { addPending(loadReal()); return null; }
  const need = needPkgs(src);
  if (need.length) { addPending(ensurePkgs(need)); return null; }
  return makeInst(src);
}
export async function realInstAsync(src) {
  if (!(await loadReal())) return null;
  const need = needPkgs(src);
  if (need.length) await ensurePkgs(need);
  return makeInst(src);
}

/** یک فریم با پایتون واقعی (fn: همان اطلاعات تابع فریم که مفسر داخلی پیدا کرده) */
export function realFrame(RI, fn, ctx, t, { fps = 30, dur = 10, W0 = 1920, H0 = 1080 } = {}) {
  const f = RI.g.get(fn.name);
  if (!f) throw new Error(`تابع ${fn.name} در پایتون واقعی پیدا نشد`);
  const fi = Math.max(0, Math.round(t * fps));
  const arg = fn.mode === 't' ? t : fn.mode === 'p' ? Math.max(0, Math.min(1, t / dur)) : fi;
  const made = [];
  ctx.save();
  B.begin(ctx, W0, H0);
  try {
    const args = [arg];
    if (fn.ctxArg) { const s = B.surface(); const p = W.wrap('ctx', B.context(s)); made.push(p); args.unshift(p); }
    else if (fn.surfArg) { const p = W.wrap('surface', B.surface()); made.push(p); args.unshift(p); }
    for (const n of fn.extra || []) args.push(/^fps$/i.test(n) ? fps : /w/i.test(n) ? W0 : H0);
    try { const r = f(...args); r?.destroy?.(); } catch (e) { if (!B.R.done && !/__wv_frame_done__/.test(String(e?.message))) throw e; }
    RI.frames++;
  } finally {
    B.end(ctx);
    for (const p of made) try { p.destroy(); } catch { /* */ }
    f.destroy?.();
    ctx.restore();
  }
}

/** صدای کد با پایتون واقعی ← بایت‌های WAV (یا null) */
export async function realAudio(src, fnName) {
  const RI = await realInstAsync(src);
  if (!RI) return null;
  if (RI.error) throw RI.error;
  const p = W.audio(RI.g, fnName || null);
  if (!p) return null;
  return PY.FS.readFile(String(p));
}
