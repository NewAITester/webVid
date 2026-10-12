# شوریل تک‌فایلی: reelfx.js + scenes.js را داخل template.html می‌گذارد
import re, pathlib
root = pathlib.Path(__file__).resolve().parent
fx = (root.parent / 'src/engine/reelfx.js').read_text(encoding='utf-8')
fx = re.sub(r'^export\s+', '', fx, flags=re.M)
sc = (root / 'scenes.js').read_text(encoding='utf-8')
html = (root / 'template.html').read_text(encoding='utf-8').replace('/*REELFX*/', fx).replace('/*SCENES*/', sc)
(root / 'showreel.html').write_text(html, encoding='utf-8')
print('showreel.html', len(html))
