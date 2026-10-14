/** Lossless export-only optimizations for recognized NumPy/Pillow code. Unknown code is untouched. */
export const PY_EXPORT_OPT = String.raw`
import ast as _wv_opt_ast

def _wv_mask_minimum(a, b):
    from PIL import Image, ImageChops
    if type(a) is Image.Image and type(b) is Image.Image and a.mode == b.mode == 'L' and a.size == b.size:
        return ImageChops.darker(a, b)
    import numpy as np
    return Image.fromarray(np.minimum(np.array(a), np.array(b)))

def _wv_can_inplace(f, vig, rng):
    import numpy as np
    return type(f) is np.ndarray and f.dtype == np.float32 and type(vig) is np.ndarray and vig.dtype == np.float32 and type(rng) is np.random.Generator

def _wv_export_compile(src, preview_max=0, optimize=False):
    if not optimize or preview_max:
        return _wv_preview_compile(src, preview_max), 0
    tree = _wv_opt_ast.parse(src, 'code.py', 'exec')
    def same(a, b):
        return _wv_opt_ast.dump(a, include_attributes=False) == _wv_opt_ast.dump(b, include_attributes=False)
    # Only the standard imports; reject shadowing of modules/helper names.
    numpy_ok = any(isinstance(n, _wv_opt_ast.Import) and any(a.name == 'numpy' and a.asname == 'np' for a in n.names) for n in tree.body)
    pillow_ok = any(isinstance(n, _wv_opt_ast.ImportFrom) and n.module == 'PIL' and any(a.name == 'Image' and a.asname in (None, 'Image') for a in n.names) for n in tree.body)
    reserved = {'np', 'Image', '_wv_mask_minimum', '_wv_can_inplace'}
    shadowed = any((isinstance(n, _wv_opt_ast.Name) and isinstance(n.ctx, _wv_opt_ast.Store) and n.id in reserved) or (isinstance(n, _wv_opt_ast.arg) and n.arg in reserved) or (isinstance(n, (_wv_opt_ast.FunctionDef, _wv_opt_ast.ClassDef)) and n.name in reserved) for n in _wv_opt_ast.walk(tree))
    if not (numpy_ok and pillow_ok) or shadowed:
        return _wv_preview_compile(src, preview_max), 0
    changes = 0
    # Exact, fresh local float32 buffer contract from the supplied showreel.
    # No frame reuse/RNG changes, no reduction in supersampling, resolution or FPS.
    suffix = _wv_opt_ast.parse('''f = np.asarray(img).astype(np.float32)
f[..., 0] = np.roll(f[..., 0], 2, axis=1)
f[..., 2] = np.roll(f[..., 2], -2, axis=1)
f = f * VIG + rng.normal(0, 6, (H, W, 1)).astype(np.float32)
f *= clamp(t / .15) * clamp((DUR - t) / .25)
return f.clip(0, 255).astype(np.uint8)''').body
    replacement = _wv_opt_ast.parse('''f = np.asarray(img).astype(np.float32)
f[..., 0] = np.roll(f[..., 0], 2, axis=1)
f[..., 2] = np.roll(f[..., 2], -2, axis=1)
if _wv_can_inplace(f, VIG, rng):
    f *= VIG
    f += rng.normal(0, 6, (H, W, 1)).astype(np.float32)
    f *= clamp(t / .15) * clamp((DUR - t) / .25)
    np.clip(f, 0, 255, out=f)
    return f.astype(np.uint8)
else:
    f = f * VIG + rng.normal(0, 6, (H, W, 1)).astype(np.float32)
    f *= clamp(t / .15) * clamp((DUR - t) / .25)
    return f.clip(0, 255).astype(np.uint8)''').body
    for fn in tree.body:
        if not isinstance(fn, _wv_opt_ast.FunctionDef) or fn.name != 'frame' or len(fn.body) < 6: continue
        if not all(same(a,b) for a,b in zip(fn.body[-6:],suffix)): continue
        # No references/aliases to f before fresh allocation; no closure or global f.
        if any((isinstance(n, _wv_opt_ast.Name) and n.id == 'f') or isinstance(n, (_wv_opt_ast.Global, _wv_opt_ast.Nonlocal, _wv_opt_ast.FunctionDef, _wv_opt_ast.Lambda)) for stmt in fn.body[:-6] for n in _wv_opt_ast.walk(stmt)): continue
        fn.body[-6:] = replacement
        changes += 1
    pattern = _wv_opt_ast.parse('Image.fromarray(np.minimum(np.array(layer), np.array(mask)))',mode='eval').body
    class Masks(_wv_opt_ast.NodeTransformer):
        def visit_Call(self, node):
            nonlocal changes
            if same(node, pattern):
                changes += 1
                return _wv_opt_ast.copy_location(_wv_opt_ast.Call(func=_wv_opt_ast.Name(id='_wv_mask_minimum',ctx=_wv_opt_ast.Load()),args=[_wv_opt_ast.Name(id='layer',ctx=_wv_opt_ast.Load()),_wv_opt_ast.Name(id='mask',ctx=_wv_opt_ast.Load())],keywords=[]),node)
            return self.generic_visit(node)
    tree = Masks().visit(tree)
    _wv_opt_ast.fix_missing_locations(tree)
    return compile(tree,'code.py','exec'), changes
`;
