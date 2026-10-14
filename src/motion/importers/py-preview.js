/** Python compiler shim. Only lower explicitly scale-aware supersampled Pillow scripts.
 * Unknown programs are left intact (blind W/H replacement can crop their artwork).
 * Original/export bypass the shim entirely. The source stored in the project is never edited.
 */
export const PY_PREVIEW = String.raw`
import ast as _wv_ast

def _wv_preview_compile(src, max_edge=0):
    if not max_edge:
        return compile(src, 'code.py', 'exec')
    tree = _wv_ast.parse(src, 'code.py', 'exec')
    # A known design-space contract: W/H/SS constants, RW/RH=W/H*SS,
    # K=RW/design_width and P(x,y)=(x*K,y*K). No heuristic on arbitrary W/H.
    configs = {}
    for stmt in tree.body:
        if not isinstance(stmt, _wv_ast.Assign) or len(stmt.targets) != 1: continue
        target, value = stmt.targets[0], stmt.value
        pairs = list(zip(target.elts, value.elts)) if isinstance(target, _wv_ast.Tuple) and isinstance(value, _wv_ast.Tuple) and len(target.elts) == len(value.elts) else [(target, value)]
        for name, val in pairs:
            if isinstance(name, _wv_ast.Name) and name.id in ('W', 'H', 'SS'):
                if name.id in configs or not isinstance(val, _wv_ast.Constant) or type(val.value) not in (int, float) or val.value <= 0:
                    return compile(src, 'code.py', 'exec')
                configs[name.id] = val
    def same(node, expr):
        return _wv_ast.dump(node, include_attributes=False) == _wv_ast.dump(_wv_ast.parse(expr).body[0], include_attributes=False)
    has_pillow = any(isinstance(s, _wv_ast.ImportFrom) and s.module == 'PIL' and any(a.name == 'Image' and a.asname in (None, 'Image') for a in s.names) for s in tree.body)
    has_image = any(isinstance(n, _wv_ast.Call) and isinstance(n.func, _wv_ast.Attribute) and n.func.attr == 'new' and isinstance(n.func.value, _wv_ast.Name) and n.func.value.id == 'Image' for n in _wv_ast.walk(tree))
    has_dims = any(same(s, 'RW, RH = W * SS, H * SS') for s in tree.body)
    has_scale = any(isinstance(s, _wv_ast.Assign) and len(s.targets) == 1 and isinstance(s.targets[0], _wv_ast.Name) and s.targets[0].id == 'K' and isinstance(s.value, _wv_ast.BinOp) and isinstance(s.value.op, _wv_ast.Div) and isinstance(s.value.left, _wv_ast.Name) and s.value.left.id == 'RW' and isinstance(s.value.right, _wv_ast.Constant) and type(s.value.right.value) in (int, float) and s.value.right.value > 0 for s in tree.body)
    has_coords = any(isinstance(s, _wv_ast.FunctionDef) and s.name == 'P' and [a.arg for a in s.args.args] == ['x', 'y'] and len(s.body) == 1 and same(s.body[0], 'return (x * K, y * K)') for s in tree.body)
    if set(configs) != {'W', 'H', 'SS'} or not (has_pillow and has_image and has_dims and has_scale and has_coords):
        return compile(src, 'code.py', 'exec')
    w, h = configs['W'].value, configs['H'].value
    scale = min(1.0, max_edge / max(w, h))
    configs['W'].value = max(1, round(w * scale))
    configs['H'].value = max(1, round(h * scale))
    configs['SS'].value = 1
    return compile(tree, 'code.py', 'exec')
`;
