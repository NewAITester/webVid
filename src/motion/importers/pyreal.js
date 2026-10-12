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
import { initWebfonts, familiesIn, bundledFaces } from '../webfonts.js';

/** بسته‌های همراه برنامه: نام import ← بسته (از public/pyodide/bundled.json؛ این فقط پیش‌فرض است) */
let BUNDLED = { imports: { numpy: 'numpy', scipy: 'scipy', PIL: 'pillow' }, pkgs: { numpy: { name: 'numpy' }, scipy: { name: 'scipy' }, pillow: { name: 'pillow' } } };
const FDIR = '/usr/share/fonts/truetype/wv';

let PY = null, B = null, W = null, loading = null, failed = null;
const loaded = new Set(), pkgJobs = new Map(), insts = new Map();

export function pyodideBase() {
  if (globalThis.WV_PYODIDE_URL) return globalThis.WV_PYODIDE_URL;
  try { return new URL('pyodide/', globalThis.document?.baseURI || self.location.href).href; } catch { return './pyodide/'; }
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
    # فقط importهای خود کد وارد‌شده (نه وابستگی‌های اختیاری کتابخانه‌ها که با try/except امتحان می‌شوند)
    def find_spec(self, name, path=None, target=None):
        mp = sys.meta_path
        for f in mp[mp.index(self) + 1:] if self in mp else ():
            try: sp = f.find_spec(name, path, target)
            except Exception: sp = None
            if sp is not None: return sp
        root = name.split('.')[0]
        if '.' in name and not isinstance(sys.modules.get(root), _Stub): return None
        fr = sys._getframe(1)
        while fr is not None and (fr.f_code.co_filename.startswith('<frozen') or 'importlib' in fr.f_code.co_filename): fr = fr.f_back
        if fr is None or fr.f_code.co_filename != 'code.py': return None
        _STUBBED.add(root)
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

/* خروجی فریم (PIL / numpy / OpenCV / imageio / لولهٔ ffmpeg / matplotlib / pygame)، فونت‌ها، noise */
const GLUE2 = String.raw`
import os, re, io, shlex
os.environ.setdefault('MPLBACKEND', 'Agg')
os.environ.setdefault('SDL_VIDEODRIVER', 'dummy')
os.environ.setdefault('SDL_AUDIODRIVER', 'dummy')

# ── noise (Perlin، همان رابط کتابخانهٔ noise) ──
_NOISE_SRC = r'''
import math as _m, random as _rnd
_rr = _rnd.Random(20240607)
_P = list(range(256)); _rr.shuffle(_P); _P = _P + _P
_G2 = [(1, 0), (-1, 0), (0, 1), (0, -1), (0.7071, 0.7071), (-0.7071, 0.7071), (0.7071, -0.7071), (-0.7071, -0.7071)]
_G3 = [(1,1,0),(-1,1,0),(1,-1,0),(-1,-1,0),(1,0,1),(-1,0,1),(1,0,-1),(-1,0,-1),(0,1,1),(0,-1,1),(0,1,-1),(0,-1,-1),(1,1,0),(0,-1,1),(-1,1,0),(0,-1,-1)]
def _f(t): return t * t * t * (t * (t * 6 - 15) + 10)
def _l(t, a, b): return a + t * (b - a)
def _p1(x, rep, base):
    i0 = _m.floor(x); x -= i0; i0 = int(i0) % rep; i1 = (i0 + 1) % rep
    a = _P[(i0 + base) & 255] & 1 and -x or x
    b = _P[(i1 + base) & 255] & 1 and -(x - 1) or (x - 1)
    return _l(_f(x), a, b) * 2
def _p2(x, y, rx, ry, base):
    xi = _m.floor(x); yi = _m.floor(y); xf = x - xi; yf = y - yi
    x0 = int(xi) % rx; y0 = int(yi) % ry; x1 = (x0 + 1) % rx; y1 = (y0 + 1) % ry
    def g(ix, iy, dx, dy):
        gx, gy = _G2[_P[_P[(ix + base) & 255] + (iy & 255)] & 7]; return gx * dx + gy * dy
    u = _f(xf); v = _f(yf)
    return _l(v, _l(u, g(x0, y0, xf, yf), g(x1, y0, xf - 1, yf)), _l(u, g(x0, y1, xf, yf - 1), g(x1, y1, xf - 1, yf - 1))) * 1.41
def _p3(x, y, z, rx, ry, rz, base):
    xi = _m.floor(x); yi = _m.floor(y); zi = _m.floor(z); xf = x - xi; yf = y - yi; zf = z - zi
    X = [int(xi) % rx, (int(xi) + 1) % rx]; Y = [int(yi) % ry, (int(yi) + 1) % ry]; Z = [int(zi) % rz, (int(zi) + 1) % rz]
    def g(a, b, c, dx, dy, dz):
        gx, gy, gz = _G3[_P[_P[_P[(X[a] + base) & 255] + (Y[b] & 255)] + (Z[c] & 255)] & 15]; return gx * dx + gy * dy + gz * dz
    u = _f(xf); v = _f(yf); w = _f(zf)
    return _l(w, _l(v, _l(u, g(0,0,0,xf,yf,zf), g(1,0,0,xf-1,yf,zf)), _l(u, g(0,1,0,xf,yf-1,zf), g(1,1,0,xf-1,yf-1,zf))),
                 _l(v, _l(u, g(0,0,1,xf,yf,zf-1), g(1,0,1,xf-1,yf,zf-1)), _l(u, g(0,1,1,xf,yf-1,zf-1), g(1,1,1,xf-1,yf-1,zf-1))))
def _oct(fn, n, pers, lac):
    tot = 0.0; amp = 1.0; fr = 1.0; mx = 0.0
    for _ in range(max(1, int(n))):
        tot += fn(fr) * amp; mx += amp; amp *= pers; fr *= lac
    return tot / mx
def pnoise1(x, octaves=1, persistence=0.5, lacunarity=2.0, repeat=1024, base=0):
    return _oct(lambda f: _p1(x * f, max(1, int(repeat)), int(base)), octaves, persistence, lacunarity)
def pnoise2(x, y, octaves=1, persistence=0.5, lacunarity=2.0, repeatx=1024, repeaty=1024, base=0):
    return _oct(lambda f: _p2(x * f, y * f, max(1, int(repeatx)), max(1, int(repeaty)), int(base)), octaves, persistence, lacunarity)
def pnoise3(x, y, z, octaves=1, persistence=0.5, lacunarity=2.0, repeatx=1024, repeaty=1024, repeatz=1024, base=0):
    return _oct(lambda f: _p3(x * f, y * f, z * f, max(1, int(repeatx)), max(1, int(repeaty)), max(1, int(repeatz)), int(base)), octaves, persistence, lacunarity)
def snoise2(x, y, octaves=1, persistence=0.5, lacunarity=2.0, repeatx=None, repeaty=None, base=0.0):
    return max(-1.0, min(1.0, pnoise2(x, y, octaves, persistence, lacunarity, 1 << 20, 1 << 20, int(base)) * 1.2))
def snoise3(x, y, z, octaves=1, persistence=0.5, lacunarity=2.0, repeatx=None, repeaty=None, repeatz=None, base=0.0):
    return max(-1.0, min(1.0, pnoise3(x, y, z, octaves, persistence, lacunarity, 1 << 20, 1 << 20, 1 << 20, int(base)) * 1.2))
def snoise4(x, y, z, w, octaves=1, persistence=0.5, lacunarity=2.0, base=0.0):
    return snoise3(x + w * 0.7071, y - w * 0.31, z + w * 0.5, octaves, persistence, lacunarity, base=base)
'''
class _SrcLoader:
    def __init__(self, src): self.src = src
    def create_module(self, spec): return None
    def exec_module(self, m): exec(compile(self.src, '<' + m.__name__ + '>', 'exec'), m.__dict__)
class _ShimFinder:
    SHIMS = {'noise': _NOISE_SRC}
    def find_spec(self, name, path=None, target=None):
        if name in self.SHIMS: return importlib.machinery.ModuleSpec(name, _SrcLoader(self.SHIMS[name]))
        return None
sys.meta_path.insert(max(0, len(sys.meta_path) - 1), _ShimFinder())

# ── خروجی فریم: تصویری که کد برمی‌گرداند یا می‌نویسد (PIL، numpy، OpenCV، imageio، لوله ffmpeg، matplotlib، pygame) ──
class _WVStop(BaseException): pass
_OUT = {'img': None, 'fmt': 'rgb', 'in': False, 'stop': None, 'n': 0}
_SCREEN = [None]; _ANIM = []; _PIX = []
def _halt_now():
    st = _OUT['stop']
    if not _OUT['in'] and st is not None and st(): raise _WVStop()
def _rec(img, fmt='rgb', video=False):
    _OUT['img'] = img; _OUT['fmt'] = fmt
    if not _OUT['in']:
        _OUT['n'] += 1
        if video or _OUT['n'] >= 2: _halt_now()
def _np():
    import numpy; return numpy
def _to_rgba(v, fmt='rgb', W=0, H=0):
    if v is None: return None
    m = type(v).__module__ or ''
    try:
        if m.startswith('PIL'):
            im = v if v.mode == 'RGBA' else v.convert('RGBA'); return (im.width, im.height, im.tobytes())
        if m.startswith('matplotlib') and hasattr(v, 'canvas'):
            v.canvas.draw(); a = _np().asarray(v.canvas.buffer_rgba()); return (a.shape[1], a.shape[0], a.tobytes())
        if m.startswith('pygame') and hasattr(v, 'get_width'):
            import pygame; return (v.get_width(), v.get_height(), pygame.image.tobytes(v, 'RGBA'))
    except Exception:
        return None
    np = None
    if isinstance(v, (bytes, bytearray, memoryview)) and W and H:
        np = _np(); b = bytes(v); n = len(b)
        ch = 4 if n == W * H * 4 else 3 if n == W * H * 3 else 1 if n == W * H else 0
        if not ch: return None
        v = np.frombuffer(b, np.uint8).reshape((H, W, ch) if ch > 1 else (H, W))
    if hasattr(v, 'shape') and hasattr(v, 'dtype') and getattr(v, 'ndim', 0) in (2, 3):
        np = np or _np(); a = np.asarray(v)
        if a.ndim == 3 and a.shape[2] not in (1, 3, 4): return None
        if a.shape[0] < 2 or a.shape[1] < 2: return None
        if a.dtype != np.uint8:
            a = np.nan_to_num(a.astype(np.float32))
            if a.size and float(a.max()) <= 1.0001: a = a * 255.0
            a = np.clip(a, 0, 255).astype(np.uint8)
        if a.ndim == 2: a = a[:, :, None]
        if a.shape[2] == 1: a = np.repeat(a, 3, axis=2)
        if fmt in ('bgr', 'bgra'): a = a[:, :, [2, 1, 0, 3] if a.shape[2] == 4 else [2, 1, 0]]
        if a.shape[2] == 3: a = np.concatenate([a, np.full(a.shape[:2] + (1,), 255, np.uint8)], axis=2)
        return (int(a.shape[1]), int(a.shape[0]), np.ascontiguousarray(a).tobytes())
    return None

def _raw(b, w, h, fmt):
    np = _np(); ch = {'gray': 1, 'rgb24': 3, 'bgr24': 3}.get(fmt, 4)
    a = np.frombuffer(b, np.uint8).reshape((h, w, ch) if ch > 1 else (h, w))
    if fmt == 'argb': a = a[:, :, [1, 2, 3, 0]]
    elif fmt == 'abgr': a = a[:, :, [3, 2, 1, 0]]
    return a, ('bgr' if fmt in ('bgr24', 'bgra') else 'rgb')
class _Sink:
    def __init__(self, w, h, fmt):
        self.w, self.h, self.fmt = w, h, fmt; self.buf = bytearray(); self.closed = False
        self.n = w * h * {'gray': 1, 'rgb24': 3, 'bgr24': 3}.get(fmt, 4) if w and h else 0
    def write(self, b):
        b = b if isinstance(b, (bytes, bytearray)) else bytes(memoryview(b).cast('B')) if not isinstance(b, str) else b.encode()
        if self.n:
            self.buf += b
            if len(self.buf) >= self.n:
                k = len(self.buf) // self.n
                last = bytes(self.buf[(k - 1) * self.n:k * self.n]); del self.buf[:k * self.n]
                a, f = _raw(last, self.w, self.h, self.fmt); _rec(a, f, True)
        return len(b)
    def flush(self): pass
    def close(self): self.closed = True
    def __enter__(self): return self
    def __exit__(self, *a): return False
class _Popen:
    def __init__(self, args, *a, **k):
        self.args = args; self.returncode = None; self.pid = 4242
        try: cmd = shlex.split(args) if isinstance(args, str) else [str(x) for x in args]
        except Exception: cmd = []
        w = h = 0; fmt = 'rgb24'; inp = None
        for i, c in enumerate(cmd):
            nx = cmd[i + 1] if i + 1 < len(cmd) else ''
            if c == '-i' and inp is None: inp = nx; continue
            if inp is None and c in ('-s', '-video_size', '-s:v'):
                mm = re.match(r'(\d+)x(\d+)', nx)
                if mm: w, h = int(mm[1]), int(mm[2])
            if inp is None and c == '-pix_fmt': fmt = nx
        self.stdin = _Sink(w, h, fmt) if inp in ('-', 'pipe:', 'pipe:0') else _Sink(0, 0, fmt)
        self.stdout = io.BytesIO(); self.stderr = io.BytesIO()
    def communicate(self, input=None, timeout=None):
        if input: self.stdin.write(input)
        self.returncode = 0; return (b'', b'')
    def wait(self, timeout=None): self.returncode = 0; return 0
    def poll(self): return self.returncode
    def kill(self): self.returncode = 0
    terminate = kill
    def __enter__(self): return self
    def __exit__(self, *a): self.wait(); return False

def _patch_subprocess():
    import subprocess, shutil
    subprocess.Popen = _Popen
    def run(args, *a, input=None, **k):
        p = _Popen(args)
        if input: p.stdin.write(input)
        txt = k.get('text') or k.get('universal_newlines') or k.get('encoding')
        return subprocess.CompletedProcess(args, 0, '' if txt else b'', '' if txt else b'')
    subprocess.run = run
    subprocess.call = subprocess.check_call = lambda *a, **k: 0
    subprocess.check_output = lambda *a, **k: '' if (k.get('text') or k.get('universal_newlines') or k.get('encoding')) else b''
    os.system = lambda *a, **k: 0
    _which = shutil.which
    shutil.which = lambda n, *a, **k: ('/usr/bin/' + str(n)) if str(n).split('/')[-1] in ('ffmpeg', 'ffprobe', 'ffmpeg.exe') else _which(n, *a, **k)

_FACES = []; _ALIAS = {}
_WN = {'thin': 100, 'hairline': 100, 'extralight': 200, 'ultralight': 200, 'light': 300, 'regular': 400, 'normal': 400, 'book': 400, 'roman': 400,
       'medium': 500, 'semibold': 600, 'demibold': 600, 'bold': 700, 'extrabold': 800, 'ultrabold': 800, 'black': 900, 'heavy': 900}
_SYS = {'arial': 'Arimo', 'arialbd': ('Arimo', 700), 'ariali': ('Arimo', 400, True), 'arialbi': ('Arimo', 700, True), 'arialblack': 'Archivo Black', 'ariblk': 'Archivo Black',
        'helvetica': 'Arimo', 'helveticaneue': 'Arimo', 'liberationsans': 'Arimo', 'freesans': 'Arimo', 'freesansbold': ('Arimo', 700), 'nimbussans': 'Arimo',
        'times': 'Tinos', 'timesbd': ('Tinos', 700), 'timesnewroman': 'Tinos', 'liberationserif': 'Tinos', 'cour': 'Cousine', 'courbd': ('Cousine', 700),
        'couriernew': 'Cousine', 'courier': 'Cousine', 'liberationmono': 'Cousine', 'dejavusans': 'Noto Sans', 'dejavusansmono': 'JetBrains Mono',
        'dejavuserif': 'Noto Serif', 'verdana': 'Noto Sans', 'verdanab': ('Noto Sans', 700), 'tahoma': 'Noto Sans', 'tahomabd': ('Noto Sans', 700), 'georgia': 'Noto Serif',
        'impact': 'Anton', 'segoeui': 'Inter', 'segoeuib': ('Inter', 700), 'sfpro': 'Inter', 'sfprodisplay': 'Inter', 'sfprotext': 'Inter', 'calibri': 'Open Sans',
        'calibrib': ('Open Sans', 700), 'consola': 'JetBrains Mono', 'consolas': 'JetBrains Mono', 'menlo': 'JetBrains Mono', 'monaco': 'JetBrains Mono',
        'sansserif': 'Noto Sans', 'sans': 'Noto Sans', 'serif': 'Noto Serif', 'monospace': 'JetBrains Mono', 'mono': 'JetBrains Mono', 'ubuntumono': 'JetBrains Mono'}
def _cn(s): return re.sub(r'[^a-z0-9]', '', str(s).lower())
def _resolve(name, bold=False, italic=False):
    if not _FACES: return None
    stem = re.sub(r'\.(ttf|otf|ttc|woff2?|pfb)$', '', os.path.basename(str(name or '')), flags=re.I)
    k = _cn(stem); w = 700 if bold else 400; it = bool(italic)
    fams = {_cn(f['family']): f['family'] for f in _FACES}
    for a, to in _ALIAS.items(): fams.setdefault(_cn(a), to)
    def look(k):
        if k in fams: return (fams[k], None, None)
        if k in _SYS:
            v = _SYS[k]; return (v, None, None) if isinstance(v, str) else (v[0], v[1], v[2] if len(v) > 2 else None)
        return None
    hit = look(k)
    if not hit:
        kk = re.sub(r'(variablefont.*|variable|vf|opszwght|wdthwght|wght)$', '', k)
        if re.search(r'(italic|oblique|it)$', kk) and not look(kk): it = True; kk = re.sub(r'(italic|oblique|it)$', '', kk)
        for wn in sorted(_WN, key=len, reverse=True):
            if kk.endswith(wn) and len(kk) > len(wn): w = _WN[wn]; kk = kk[:-len(wn)]; break
        hit = look(kk)
        if hit and hit[1] is None: hit = (hit[0], w, it)
    if not hit: hit = ('Arimo', w, it)
    fam, w2, it2 = hit; w = w2 or w; it = it if it2 is None else it2
    faces = [f for f in _FACES if f['family'] == fam] or [f for f in _FACES if f['family'] == 'Arimo']
    if not faces: return None
    def rng(f): return [int(float(x)) for x in str(f['weight']).split()]
    def score(f):
        ws = rng(f)
        d = 0 if (len(ws) == 2 and ws[0] <= w <= ws[1]) else min(abs(x - w) for x in ws)
        return d + (0 if (f['style'] == 'italic') == it else 1000)
    f = min(faces, key=score); ws = rng(f)
    return f['path'], (max(ws[0], min(ws[1], w)) if len(ws) == 2 else None)

def wv_fonts(js):
    import json as _j
    d = _j.loads(js)
    have = {f['path'] for f in _FACES}
    for f in d.get('faces', []):
        if f['path'] not in have: _FACES.append(f)
    _ALIAS.update(d.get('aliases', {}))
    mpl = sys.modules.get('matplotlib.font_manager')
    if mpl:
        for f in d.get('faces', []):
            try: mpl.fontManager.addfont(f['path'])
            except Exception: pass

def _patch_pil():
    from PIL import Image, ImageFont
    _save = Image.Image.save
    def save(self, fp, format=None, **params):
        if _OUT['in']: _rec(self); return None
        _rec(self)
        return _save(self, fp, format, **params)
    Image.Image.save = save
    Image.Image.show = lambda self, *a, **k: _rec(self)
    _tt = ImageFont.truetype
    def truetype(font=None, size=10, index=0, encoding='', layout_engine=None, **kw):
        try: return _tt(font, size, index, encoding, layout_engine, **kw)
        except OSError:
            if not isinstance(font, (str, os.PathLike)): raise
            r = _resolve(font)
            if not r: raise
            f = _tt(r[0], size, 0, encoding, layout_engine)
            if r[1]:
                try:
                    axes = f.get_variation_axes()
                    f.set_variation_by_axes([r[1] if 'eight' in str(a.get('name')) else a.get('default', a.get('minimum', 0)) for a in axes])
                except Exception: pass
            return f
    ImageFont.truetype = truetype

def _patch_cv2():
    import cv2
    _imw = cv2.imwrite
    def imwrite(path, img, *a):
        if _OUT['in']: _rec(img, 'bgr'); return True
        _rec(img, 'bgr')
        try: return _imw(path, img, *a)
        except Exception: return True
    cv2.imwrite = imwrite
    class VideoWriter:
        def __init__(self, *a, **k): pass
        def open(self, *a, **k): return True
        def write(self, img): _rec(img, 'bgr', True)
        def isOpened(self): return True
        def release(self): pass
        def set(self, *a): return True
        def get(self, *a): return 0.0
    cv2.VideoWriter = VideoWriter
    cv2.imshow = lambda name, img: _rec(img, 'bgr', True)
    cv2.waitKey = lambda *a: -1
    cv2.pollKey = lambda *a: -1
    for n in ('namedWindow', 'destroyAllWindows', 'destroyWindow', 'moveWindow', 'resizeWindow', 'setWindowTitle', 'setWindowProperty'):
        setattr(cv2, n, lambda *a, **k: None)

def _patch_imageio():
    import imageio
    class _W:
        def __init__(self, *a, **k): pass
        def append_data(self, im, meta=None): _rec(im, 'rgb', True)
        def write(self, im, *a, **k): _rec(im[-1] if getattr(im, 'ndim', 3) == 4 else im, 'rgb', True)
        def write_frame(self, im, *a, **k): _rec(im, 'rgb', True)
        def set_meta_data(self, *a, **k): pass
        def close(self): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
    def last(ims):
        try: return ims[-1] if (isinstance(ims, (list, tuple)) or getattr(ims, 'ndim', 3) == 4) else ims
        except Exception: return None
    def imwrite(uri, im, *a, **k): _rec(last(im), 'rgb', getattr(im, 'ndim', 3) == 4 or isinstance(im, (list, tuple)))
    def mimwrite(uri, ims, *a, **k):
        ims = list(ims) if not hasattr(ims, 'ndim') else ims
        if len(ims): _rec(ims[-1], 'rgb', True)
    for mod in [imageio] + [m for m in (getattr(imageio, 'v2', None),) if m]:
        mod.get_writer = lambda *a, **k: _W(); mod.imwrite = imwrite; mod.imsave = imwrite; mod.mimwrite = mimwrite; mod.mimsave = mimwrite
    try:
        import imageio.v3 as v3
        v3.imwrite = imwrite
        v3.imopen = lambda *a, **k: _W()
    except Exception: pass

def _patch_mpl():
    import matplotlib
    try: matplotlib.use('Agg', force=True)
    except Exception: pass
    import matplotlib.pyplot as plt, matplotlib.animation as ani, matplotlib.figure as mfig
    def fa_init(self, fig, func, frames=None, init_func=None, fargs=None, save_count=None, **kw):
        seq = None
        if frames is not None and not isinstance(frames, int):
            try: seq = list(frames() if callable(frames) else frames)
            except Exception: seq = None
        self._fig = fig
        _ANIM.append({'fig': fig, 'func': func, 'frames': seq, 'n': frames if isinstance(frames, int) else (len(seq) if seq else (save_count or 100)),
                      'fargs': fargs, 'init': init_func, 'interval': kw.get('interval', 200), 'inited': False})
    def aa_init(self, fig, artists, *a, **kw):
        self._fig = fig
        arts = [list(x) if isinstance(x, (list, tuple)) else [x] for x in artists]
        _ANIM.append({'fig': fig, 'artists': arts, 'n': len(arts), 'interval': kw.get('interval', 200), 'inited': True})
    ani.FuncAnimation.__init__ = fa_init
    ani.ArtistAnimation.__init__ = aa_init
    ani.Animation.save = lambda self, *a, **k: _halt_now()
    ani.Animation.to_jshtml = lambda self, *a, **k: ''
    ani.Animation.to_html5_video = lambda self, *a, **k: ''
    _show = plt.show
    plt.show = lambda *a, **k: _halt_now()
    plt.pause = lambda *a, **k: None
    _sf = mfig.Figure.savefig
    def savefig(self, fname, *a, **k):
        if _OUT['in']: _rec(self); return None
        _rec(self)
        return _sf(self, fname, *a, **k)
    mfig.Figure.savefig = savefig
    try:
        from matplotlib import font_manager
        for f in _FACES:
            try: font_manager.fontManager.addfont(f['path'])
            except Exception: pass
    except Exception: pass

def _patch_pygame():
    import pygame
    def set_mode(size=(0, 0), *a, **k):
        try: w, h = int(size[0]) or 1280, int(size[1]) or 720
        except Exception: w, h = 1280, 720
        s = pygame.Surface((w, h)); _SCREEN[0] = s; return s
    pygame.display.set_mode = set_mode
    pygame.display.get_surface = lambda: _SCREEN[0]
    def flip(*a, **k):
        if _SCREEN[0] is not None: _rec(_SCREEN[0])
    pygame.display.flip = flip; pygame.display.update = flip
    pygame.display.set_caption = lambda *a, **k: None
    pygame.display.set_icon = lambda *a, **k: None
    pygame.event.get = lambda *a, **k: []
    pygame.event.pump = lambda *a, **k: None
    pygame.event.poll = lambda *a, **k: pygame.event.Event(pygame.NOEVENT)
    class Clock:
        def tick(self, *a): return 16
        tick_busy_loop = tick
        def get_fps(self): return 60.0
        def get_time(self): return 16
        def get_rawtime(self): return 16
    pygame.time.Clock = Clock
    pygame.time.delay = pygame.time.wait = lambda *a: 0
    pygame.quit = lambda *a, **k: None
    try:
        pygame.font.init()
        _F = pygame.font.Font
        def SysFont(name, size, bold=False, italic=False, *a, **k):
            names = name if isinstance(name, (list, tuple)) else str(name or '').split(',')
            for n in names:
                r = _resolve(str(n).strip(), bold, italic)
                if r:
                    try: return _F(r[0], int(size))
                    except Exception: pass
            return _F(None, int(size))
        pygame.font.SysFont = SysFont
        def Font(file=None, size=20, *a, **k):
            if isinstance(file, (str, os.PathLike)) and not os.path.exists(file):
                r = _resolve(file); file = r[0] if r else None
            return _F(file, int(size))
        pygame.font.Font = Font
    except Exception: pass

_PATCHED = set()
def _patch(src):
    def want(*ns): return any(re.search(r'^\s*(?:import\s+[^\n#]*\b' + n + r'\b|from\s+' + n + r'\b)', src, re.M) for n in ns)
    for key, ns, fn in (('subprocess', ('subprocess',), _patch_subprocess), ('pil', ('PIL',), _patch_pil), ('cv2', ('cv2',), _patch_cv2),
                        ('imageio', ('imageio',), _patch_imageio), ('mpl', ('matplotlib', 'pylab'), _patch_mpl), ('pygame', ('pygame',), _patch_pygame)):
        if key in _PATCHED or not want(*ns): continue
        _PATCHED.add(key)
        try: fn()
        except Exception as e: print('wv patch', key, e)

def wv_load(src, limit=40, fn=None):
    g = {'__name__': 'webvid', '__file__': '/home/pyodide/code.py', '__builtins__': builtins}
    sys.argv = ['code.py']
    _patch(src)
    _ANIM.clear(); _SCREEN[0] = None
    _OUT['n'] = 0
    _OUT['stop'] = (lambda: bool(_ANIM)) if fn == '__wv_anim__' else (lambda: callable(g.get(fn))) if fn else None
    err = None
    _guard(limit)
    try:
        exec(compile(src, 'code.py', 'exec'), g)
    except _WVStop:
        pass
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
        _OUT['stop'] = None
    g['__wv_anims__'] = list(_ANIM); g['__wv_screen__'] = _SCREEN[0]
    ok = (fn == '__wv_anim__' and bool(_ANIM)) or (fn and callable(g.get(fn)))
    return g, err, bool(ok)

def _gd(self):
    raw = _wvc.call(self._h, 'get_data', _args(()), None)
    b = bytearray(raw.to_bytes() if hasattr(raw, 'to_bytes') else bytes(raw))
    _PIX.append((self, b, bytes(b)))
    return memoryview(b)
ImageSurface.get_data = _gd
def _cfd(data, fmt, w, h, stride=None):
    s = ImageSurface(fmt, w, h)
    try:
        bb = data.tobytes() if hasattr(data, 'tobytes') else bytes(data)
        _wvc.put(s._h, to_js(bb))
    except Exception: pass
    return s
ImageSurface.create_for_data = staticmethod(_cfd)

def wv_frame(g, name, W, H, bgr, *args):
    _ANIM[:] = g.get('__wv_anims__') or []
    _SCREEN[0] = g.get('__wv_screen__')
    an = _ANIM[-1] if (name == '__wv_anim__' and _ANIM) else None
    _OUT['img'] = None; _OUT['fmt'] = 'rgb'; _PIX.clear()
    plt = sys.modules.get('matplotlib.pyplot')
    before = set(plt.get_fignums()) if plt else set()
    r = None
    _OUT['in'] = True
    try:
        if an is not None:
            i = int(args[-1]) if args else 0
            if an.get('n'): i %= int(an['n'])
            if 'artists' in an:
                for k, arts in enumerate(an['artists']):
                    for a in arts:
                        try: a.set_visible(k == i)
                        except Exception: pass
            else:
                if not an['inited']:
                    an['inited'] = True
                    if an['init']: an['init']()
                a = an['frames'][i] if an['frames'] else i
                an['func'](a, *(an['fargs'] or ()))
        else:
            f = g.get(name)
            if not callable(f): raise NameError('تابع %s پیدا نشد' % name)
            r = f(*args)
    finally:
        _OUT['in'] = False
        g['__wv_screen__'] = _SCREEN[0]
    if isinstance(r, Surface):
        _wvc.outSurface(r._h); return None
    out = None
    if r is not None and an is None:
        if isinstance(r, tuple) and len(r) and not hasattr(r, 'shape'): r = r[0]
        out = _to_rgba(r, 'bgr' if bgr else 'rgb', W, H)
    if out is None and _OUT['img'] is not None: out = _to_rgba(_OUT['img'], _OUT['fmt'], W, H)
    if out is None and not _wvc.R.bound:
        fig = an['fig'] if an is not None else None
        if fig is None and plt is not None and plt.get_fignums(): fig = plt.gcf()
        if fig is not None: out = _to_rgba(fig)
        if out is None and _SCREEN[0] is not None: out = _to_rgba(_SCREEN[0])
    if plt is not None:
        for k in set(plt.get_fignums()) - before:
            try: plt.close(k)
            except Exception: pass
    if out is None:
        for s, b, orig in _PIX:
            if b != orig: _wvc.put(s._h, to_js(bytes(b)))
    _PIX.clear()
    if out is not None: _wvc.out(out[0], out[1], to_js(out[2]))
    return None
`;

/** بار کردن Pyodide (یک بار) */
export function loadReal() {
  if (loading) return loading;
  if ((typeof document === 'undefined' && typeof WorkerGlobalScope === 'undefined') || typeof WebAssembly === 'undefined' || globalThis.WV_NO_REAL_PY) { failed = 'unavailable'; return (loading = Promise.resolve(null)); }
  loading = (async () => {
    const base = pyodideBase();
    try { const r = await fetch(base + 'bundled.json'); if (r.ok) { const j = await r.json(); if (j?.imports) BUNDLED = j; } } catch { /* فهرست پیش‌فرض */ }
    initWebfonts();
    const { loadPyodide } = await import(/* @vite-ignore */ base + 'pyodide.mjs');
    const py = await loadPyodide({ indexURL: base, stdout: () => {}, stderr: () => {} });
    await py.loadPackage(['numpy'], { messageCallback: () => {} });
    loaded.add('numpy');
    B = cairoBridge();
    B.same = (a, b) => a === b;
    py.registerJsModule('_wvc', B);
    const ns = py.globals.get('dict')();
    py.runPython(GLUE, { globals: ns });
    py.runPython(GLUE2, { globals: ns });
    W = { ns, load: ns.get('wv_load'), wrap: ns.get('wv_wrap'), audio: ns.get('wv_audio'), frame: ns.get('wv_frame'), fonts: ns.get('wv_fonts') };
    PY = py;
    fire();
    return py;
  })().catch(e => { failed = String(e?.message || e); console.warn('Pyodide:', e); return null; });
  return loading;
}

const pnorm = n => String(n).toLowerCase().replace(/[-_.]+/g, '-');
/** بسته‌هایی که کد import می‌کند (با وابستگی‌های بسته‌های PyPI) و هنوز بار نشده‌اند */
function needPkgs(src) {
  const out = new Set();
  const add = k => {
    k = pnorm(k);
    const P = BUNDLED.pkgs?.[k];
    if (!P || out.has(k)) return;
    out.add(k);
    for (const d of P.deps || []) add(d);
  };
  for (const m of String(src).matchAll(/^\s*(?:from\s+([A-Za-z_]\w*)|import\s+([A-Za-z_][\w., ]*))/gm)) {
    for (const n of (m[1] ? [m[1]] : m[2].split(',').map(x => x.trim().split(/[.\s]/)[0]))) if (BUNDLED.imports[n]) add(BUNDLED.imports[n]);
  }
  return [...out].filter(p => !loaded.has(p));
}
function ensurePkgs(list) {
  const key = list.slice().sort().join(',');
  if (!pkgJobs.has(key)) {
    const base = pyodideBase();
    const built = list.filter(k => !BUNDLED.pkgs?.[k]?.file).map(k => BUNDLED.pkgs?.[k]?.name || k);
    const wheels = list.filter(k => BUNDLED.pkgs?.[k]?.file).map(k => base + BUNDLED.pkgs[k].file);
    const opt = { messageCallback: () => {}, errorCallback: () => {} };
    pkgJobs.set(key, (async () => {
      if (built.length) await PY.loadPackage(built, opt);
      if (wheels.length) await PY.loadPackage(wheels, opt);
    })().then(() => { list.forEach(p => loaded.add(p)); fire(); })
      .catch(e => { console.warn('Pyodide packages', list, e); list.forEach(p => loaded.add(p)); }));
  }
  return pkgJobs.get(key);
}

/* ── فونت‌ها برای پایتون (PIL / matplotlib / pygame): فایل‌های TTF همراه برنامه در FS پایتون ── */
const SYS_FONTS = [[/\b(arial|helvetica|liberation ?sans|freesans|nimbus ?sans)/i, 'Arimo'], [/\b(times|liberation ?serif)/i, 'Tinos'], [/\b(cour|courier|liberation ?mono)/i, 'Cousine'],
  [/dejavu ?sans(?! ?mono)|\b(verdana|tahoma|sans-?serif)\b/i, 'Noto Sans'], [/dejavu ?serif|\bgeorgia\b/i, 'Noto Serif'], [/dejavu ?sans ?mono|\b(consola|menlo|monaco|monospace)/i, 'JetBrains Mono'],
  [/\bimpact\b/i, 'Anton'], [/\b(segoe|sf ?pro)/i, 'Inter'], [/\bcalibri/i, 'Open Sans'], [/\b(arial ?black|ariblk)/i, 'Archivo Black']];
const fontsDone = new Set();
let fontJob = null;
function needFonts(src) {
  const s = String(src || ''), fams = new Set(['Arimo']);
  for (const k of familiesIn(s)) fams.add(k);
  for (const [re, f] of SYS_FONTS) if (re.test(s)) fams.add(f);
  if (/[\u0600-\u06FF]/.test(s)) fams.add('Vazirmatn');
  const faces = [];
  for (const f of fams) for (const x of bundledFaces(f)) if (!fontsDone.has(x.file)) faces.push(x);
  return [...new Map(faces.map(x => [x.file, x])).values()];
}
function ensureFonts(faces) {
  const job = (async () => {
    try { PY.FS.mkdirTree(FDIR); } catch { /* */ }
    const done = [];
    await Promise.all(faces.map(async f => {
      try {
        const b = new Uint8Array(await (await fetch(f.url)).arrayBuffer());
        PY.FS.writeFile(`${FDIR}/${f.file}`, b);
        done.push({ family: f.family, path: `${FDIR}/${f.file}`, weight: f.weight, style: f.style });
      } catch (e) { console.warn('font', f.file, e); }
      fontsDone.add(f.file);
    }));
    if (done.length) W.fonts(JSON.stringify({ faces: done }));
    fire();
  })();
  fontJob = (fontJob || Promise.resolve()).then(() => job);
  return job;
}
async function prepare(src) {
  await initWebfonts();
  const need = needPkgs(src);
  if (need.length) await ensurePkgs(need);
  const nf = needFonts(src);
  if (nf.length) await ensureFonts(nf);
}

const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + ':' + s.length; };

const imports = (src, n) => new RegExp(`^\\s*(?:import\\s+[^\\n#]*\\b${n}\\b|from\\s+${n}\\b)`, 'm').test(src);
function makeInst(src, fn) {
  const key = hashStr(src) + '|' + (fn || '');
  let RI = insts.get(key);
  if (RI) return RI;
  const r = W.load(src, 40, fn || null);
  const g = r.get(0), err = r.get(1), ok = r.get(2);
  r.destroy();
  // خطای بالای فایل بعد از تعریف تابع فریم (مثلاً حلقهٔ ساخت ویدیو که کامل نشد) ← فقط هشدار
  RI = { key, g, error: err && !ok ? new Error(err) : null, warning: err && ok ? err : null, frames: 0,
    pix: /\.get_data\s*\(/.test(src), bgr: imports(src, 'cv2') && !['PIL', 'imageio', 'matplotlib', 'pygame', 'skimage'].some(n => imports(src, n)) };
  insts.set(key, RI);
  if (insts.size > 4) { const [k0, o] = insts.entries().next().value; try { o.g.destroy(); } catch { /* */ } insts.delete(k0); }
  return RI;
}

/** نمونهٔ آماده (هم‌زمان) یا null — اگر آماده نیست بار کردن شروع می‌شود */
export function realInst(src, fn) {
  if (failed) return null;
  // همهٔ مرحله‌ها (Pyodide ← بسته‌ها ← فونت‌ها) در یک انتظار، تا خروجی فقط یک بار صبر کند
  if (!PY) { addPending(loadReal().then(py => py && prepare(src))); return null; }
  if (needPkgs(src).length || needFonts(src).length) { addPending(prepare(src)); return null; }
  return makeInst(src, fn);
}
export async function realInstAsync(src, fn) {
  if (!(await loadReal())) return null;
  await prepare(src);
  return makeInst(src, fn);
}

let offC = null, tmpC = null;
function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
/** تصویر خروجی پایتون (RGBA) روی قاب W0×H0 — با حفظ نسبت */
function drawOut(ctx, O, W0, H0) {
  let src = null, w = 0, h = 0;
  if (O.surf) { src = O.surf.canvas; if (!src) return; w = src.width; h = src.height; }
  else {
    w = O.w; h = O.h;
    if (!tmpC || tmpC.width !== w || tmpC.height !== h) tmpC = canvas(w, h);
    const g = tmpC.getContext('2d');
    g.putImageData(new ImageData(new Uint8ClampedArray(O.u8.buffer, O.u8.byteOffset, w * h * 4), w, h), 0, 0);
    src = tmpC;
  }
  const s = Math.min(W0 / w, H0 / h), dw = w * s, dh = h * s;
  if (Math.abs(dw - W0) > 1 || Math.abs(dh - H0) > 1) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W0, H0); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (W0 - dw) / 2, (H0 - dh) / 2, dw, dh);
}

/** یک فریم با پایتون واقعی (fn: همان اطلاعات تابع فریم که مفسر داخلی پیدا کرده) */
export function realFrame(RI, fn, ctx, t, { fps = 30, dur = 10, W0 = 1920, H0 = 1080 } = {}) {
  const name = fn.anim ? '__wv_anim__' : fn.name;
  if (!fn.anim && !RI.g.has(name)) throw new Error(`تابع ${fn.name} در پایتون واقعی پیدا نشد`);
  const fi = Math.max(0, Math.round(t * fps));
  const arg = fn.mode === 't' ? t : fn.mode === 'p' ? Math.max(0, Math.min(1, t / dur)) : fi;
  const made = [], done = RI.frames;
  let g = ctx, O = null;
  if (RI.pix) {
    if (!offC || offC.width !== W0 || offC.height !== H0) offC = canvas(W0, H0);
    g = offC.getContext('2d', { willReadFrequently: true });
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W0, H0);
  }
  ctx.save();
  if (g !== ctx) g.save();
  B.begin(g, W0, H0);
  B.R.pix = RI.pix; B.R.out = null;
  try {
    const args = [arg];
    if (fn.ctxArg) { const s = B.surface(); const p = W.wrap('ctx', B.context(s)); made.push(p); args.unshift(p); }
    else if (fn.surfArg) { const p = W.wrap('surface', B.surface()); made.push(p); args.unshift(p); }
    for (const n of fn.extra || []) args.push(/^fps$/i.test(n) ? fps : /w/i.test(n) ? W0 : H0);
    try { W.frame(RI.g, name, W0, H0, RI.bgr, ...args); } catch (e) { if (!B.R.done && !/__wv_frame_done__/.test(String(e?.message))) throw e; }
    RI.frames++;
  } finally {
    O = B.R.out; B.R.out = null;
    B.end(g);
    for (const p of made) try { p.destroy(); } catch { /* */ }
    if (g !== ctx) g.restore();
    if (RI.frames === done) ctx.restore();
  }
  try {
    if (g !== ctx) ctx.drawImage(offC, 0, 0, W0, H0);
    if (O) drawOut(ctx, O, W0, H0);
  } finally { ctx.restore(); }
}

/** صدای کد با پایتون واقعی ← بایت‌های WAV (یا null) */
export async function realAudio(src, fnName, frameFn) {
  const RI = await realInstAsync(src, frameFn);
  if (!RI) return null;
  if (RI.error) throw RI.error;
  const p = W.audio(RI.g, fnName || null);
  if (!p) return null;
  return PY.FS.readFile(String(p));
}
/** برای آزمون‌ها */
export const _realDebug = () => ({ PY, W });
