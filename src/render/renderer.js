/** رندر Canvas 2D: renderFrame(ctx, project, t, media) — تابع خالصِ رسم.
 *  ترتیب: پایین آرایه عقب، بالا جلو. بدون Math.random (هش قطعی). */
import { layerTransform, layerOpacity, visibleLayers, filterString, canvasEffects, effectParamsAt, isFxOn, cameraZoomAt } from '../core/evaluate.js';
import { webglParamsFor } from './webgl.js';
import { CANVAS_FX, applyCanvasFxList } from './canvasfx.js';
import { EASINGS } from '../core/easing.js';

export function shapePath(ctx, kind, w, h) {
  const x = -w / 2, y = -h / 2;
  ctx.beginPath();
  if (kind === 'ellipse') { ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); return; }
  if (kind === 'rect') { ctx.rect(x, y, w, h); return; }
  if (kind === 'ring') {
    ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.arc(0, 0, w / 2 * 0.62, 0, Math.PI * 2, true); return;
  }
  if (kind === 'line') { ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); return; }
  if (kind === 'triangle') { ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); return; }
  if (kind === 'diamond') { ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, 0); ctx.lineTo(0, h / 2); ctx.lineTo(-w / 2, 0); ctx.closePath(); return; }
  if (kind === 'heart') {
    const s = w / 2;
    ctx.moveTo(0, s * 0.55);
    ctx.bezierCurveTo(-s * 1.1, -s * 0.25, -s * 0.45, -s * 0.95, 0, -s * 0.3);
    ctx.bezierCurveTo(s * 0.45, -s * 0.95, s * 1.1, -s * 0.25, 0, s * 0.55);
    ctx.closePath(); return;
  }
  const hw = w / 2, hh = h / 2;
  if (kind === 'arrow') {
    const sh = hh * 0.38, head = Math.min(hw, hh * 1.1);
    const p = [[-hw, -sh], [hw - head, -sh], [hw - head, -hh], [hw, 0], [hw - head, hh], [hw - head, sh], [-hw, sh]];
    p.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath(); return;
  }
  if (kind === 'plus' || kind === 'cross') {
    const tw = Math.min(w, h) * (kind === 'plus' ? 0.42 : 0.3) / 2;
    const p = [[-tw, -hh], [tw, -hh], [tw, -tw], [hw, -tw], [hw, tw], [tw, tw], [tw, hh],
               [-tw, hh], [-tw, tw], [-hw, tw], [-hw, -tw], [-tw, -tw]];
    p.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath(); return;
  }
  if (kind === 'stamp') {
    const n = 24, rOut = Math.min(hw, hh), rIn = rOut * 0.88;
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? rIn : rOut;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); return;
  }
  if (kind === 'roundrect') {
    const r = Math.min(w, h) * 0.2;
    if (ctx.roundRect) ctx.roundRect(-hw, -hh, w, h, r); else ctx.rect(-hw, -hh, w, h);
    return;
  }
  if (kind === 'quad') {
    const tw = hw * 0.6;
    const p = [[-tw, -hh], [tw, -hh], [hw, hh], [-hw, hh]];
    p.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath(); return;
  }
  if (kind === 'pie') {
    ctx.moveTo(0, 0);
    ctx.ellipse(0, 0, hw, hh, 0, -Math.PI / 2, Math.PI, false);
    ctx.closePath(); return;
  }
  if (kind === 'arc') {
    // کمان باز — در این رندر با پُر شدن، گُوه می‌شود (تقریب)
    ctx.ellipse(0, 0, hw, hh, 0, -Math.PI / 2, Math.PI, false);
    ctx.closePath(); return;
  }
  if (kind === 'moon') {
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2, false);
    ctx.ellipse(hw * 0.35, -hh * 0.1, hw * 0.85, hh * 0.85, 0, 0, Math.PI * 2, true);
    ctx.closePath(); return;
  }
  if (kind === 'teardrop') {
    ctx.moveTo(0, -hh);
    ctx.bezierCurveTo(hw * 0.9, -hh * 0.1, hw, hh * 0.5, 0, hh);
    ctx.bezierCurveTo(-hw, hh * 0.5, -hw * 0.9, -hh * 0.1, 0, -hh);
    ctx.closePath(); return;
  }
  if (kind === 'callout') {
    const by = hh * 0.65;
    const p = [[-hw, -hh], [hw, -hh], [hw, by], [hw * 0.25, by],
               [-hw * 0.05, hh], [-hw * 0.35, by], [-hw, by]];
    p.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath(); return;
  }
  const n = kind === 'star' ? 5 : kind === 'flower' ? 8 : kind === 'polygon' ? 6 : 3;
  if (kind === 'star' || kind === 'flower') {
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 === 0 ? w / 2 : w / 2 * 0.45;
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r, py = Math.sin(a) * (h / w) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); return;
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * w / 2, py = Math.sin(a) * h / 2;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawShape(ctx, layer) {
  const s = layer.shape || {};
  const w = s.w || 200, h = s.h || 200;
  if (s.kind === 'line') {
    ctx.strokeStyle = s.fill || '#FAFAFA'; ctx.lineWidth = s.strokeWidth || 6; ctx.lineCap = 'round';
    shapePath(ctx, 'line', w, 8); ctx.stroke(); return;
  }
  shapePath(ctx, s.kind || 'ellipse', w, h);
  if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
  if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.strokeWidth || 2; ctx.stroke(); }
}

function drawText(ctx, layer, t) {
  const tx = layer.text || {};
  const weight = tx.weight || 700;
  const size = tx.size || 64;
  ctx.font = `${weight} ${size}px "${tx.font || 'IRANSansX'}", system-ui, sans-serif`;
  ctx.fillStyle = tx.color || '#FAFAFA';
  ctx.textAlign = tx.align || 'center';
  ctx.textBaseline = 'middle';
  const typeFx = (layer.effects || []).find(f => f.id === 'typewriter' && isFxOn(f));
  let content = tx.content || '';
  if (typeFx) {
    const n = Math.floor((t - layer.start) * (effectParamsAt(typeFx, t - layer.start).speed || 12));
    content = content.slice(0, Math.max(0, n));
  }
  const tracking = (layer.effects || []).find(f => f.id === 'tracking' && isFxOn(f));
  if (tracking && 'letterSpacing' in ctx) ctx.letterSpacing = `${tracking.params?.amount || 0}px`;
  const lines = content.split('\n');
  const lh = size * (tx.lineHeight || 1.4);
  lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * lh));
  if (tracking && 'letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function drawDraw(ctx, layer) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const st of layer.strokes || []) {
    if (!st.points?.length) continue;
    ctx.strokeStyle = st.color || '#FAFAFA';
    ctx.lineWidth = st.width || 5;
    ctx.beginPath();
    st.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }
}

/** افکت‌های canvas روی یک بومِ موقت (ورودی: بومِ لایه + اندازه). */
function applyCanvasFx(src, layer, t, W, H, gl) {
  const fxs = canvasEffects(layer);
  if (!fxs.length) return src;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const c = out.getContext('2d');
  c.drawImage(src, 0, 0);
  for (const fx of fxs) {
    const p = effectParamsAt(fx, t - layer.start);
    if (fx.id === 'pixelate') {
      const s = Math.max(2, p.size || 12);
      const small = document.createElement('canvas');
      small.width = Math.max(1, W / s | 0); small.height = Math.max(1, H / s | 0);
      small.getContext('2d').drawImage(out, 0, 0, small.width, small.height);
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, W, H); c.drawImage(small, 0, 0, W, H);
    } else if (fx.id === 'vignette') {
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${p.amount || 0.5})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    } else if (fx.id === 'noise') {
      const img = c.getImageData(0, 0, W, H), d = img.data;
      const amt = (p.amount || 0.15) * 255;
      for (let i = 0; i < d.length; i += 4) {
        const n = (EASINGS.hash(i * 0.7 + Math.floor(t * 24)) - 0.5) * amt;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
      c.putImageData(img, 0, 0);
    } else if (fx.id === 'glow' || fx.id === 'textGlow') {
      c.shadowColor = p.color || '#FFFFFF'; c.shadowBlur = p.amount || 16;
      c.globalCompositeOperation = 'source-over';
      c.drawImage(src, 0, 0);
    } else if (fx.id === 'scanlines') {
      c.fillStyle = `rgba(0,0,0,${p.amount || 0.3})`;
      const gap = p.gap || 4;
      for (let y = 0; y < H; y += gap) c.fillRect(0, y, W, 1);
    } else if (fx.id === 'wave' || fx.id === 'ripple') {
      const amp = p.amount || 6, fr = p.freq || 4;
      const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
      const tc = tmp.getContext('2d'); tc.drawImage(out, 0, 0);
      c.clearRect(0, 0, W, H);
      const slice = 4;
      for (let y = 0; y < H; y += slice) {
        const dx = Math.sin((y / H) * Math.PI * fr + t * 3) * amp;
        c.drawImage(tmp, 0, y, W, slice, dx, y, W, slice);
      }
    } else if (fx.id === 'tile') {
      const cols = p.cols || 2, rows = p.rows || 2;
      const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
      tmp.getContext('2d').drawImage(out, 0, 0);
      c.clearRect(0, 0, W, H);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
        c.drawImage(tmp, 0, 0, W, H, (i * W) / cols, (j * H) / rows, W / cols, H / rows);
    } else if (fx.id === 'chromaShift') {
      // تقریب جابه‌جایی کانال: دو نسخهٔ رنگی با جابه‌جایی افقی
      const dx = p.amount || 6;
      const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
      tmp.getContext('2d').drawImage(out, 0, 0);
      c.clearRect(0, 0, W, H);
      c.globalCompositeOperation = 'lighter';
      c.filter = 'sepia(1) hue-rotate(-45deg) saturate(4)';
      c.drawImage(tmp, -dx, 0);
      c.filter = 'sepia(1) hue-rotate(180deg) saturate(4)';
      c.drawImage(tmp, dx, 0);
      c.filter = 'none';
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 0.85;
      c.drawImage(tmp, 0, 0);
      c.globalAlpha = 1;
    } else if (CANVAS_FX[fx.id]) {
      // افکت‌های پورت‌شده از برنامهٔ قبلی (فاز R6) — ترتیب لایه حفظ می‌شود
      applyCanvasFxList(out, [{ id: fx.id, p }], t - layer.start, gl);
    }
  }
  return out;
}

function drawLayerContent(ctx, layer, t, project, media) {
  if (layer.type === 'shape') drawShape(ctx, layer);
  else if (layer.type === 'text') drawText(ctx, layer, t);
  else if (layer.type === 'draw') drawDraw(ctx, layer);
  else if (layer.type === 'image') {
    const img = media.image(layer.src);
    if (img) {
      const iw = 320, ih = 320 * (img.naturalHeight / Math.max(1, img.naturalWidth));
      ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    }
  } else if (layer.type === 'video') {
    const v = media.video(layer.src);
    if (v) {
      media.seekVideo(layer.src, t - layer.start);
      const iw = 320, ih = 320 * (v.videoHeight / Math.max(1, v.videoWidth));
      ctx.drawImage(v, -iw / 2, -ih / 2, iw, ih);
    }
  } else if (layer.type === 'group') {
    for (const ch of layer.children || []) {
      ctx.save();
      const tr = layerTransform(ch, t);
      ctx.translate(tr.x, tr.y); ctx.rotate((tr.rotation * Math.PI) / 180);
      ctx.scale(tr.scaleX, tr.scaleY); ctx.globalAlpha = layerOpacity(ch, t);
      drawLayerContent(ctx, ch, t, project, media);
      ctx.restore();
    }
  }
}

/** رسم یک لایه روی بومِ تازه (ترنسفورم، شفافیت، افکت‌های canvas و در صورت امکان WebGL) — بدون ماسک. */
function renderLayerCanvas(layer, t, project, media, W, H, gl) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c2 = cv.getContext('2d');
  const tr = layerTransform(layer, t);
  const op = layerOpacity(layer, t);
  const glParams = gl?.supported ? webglParamsFor(layer, t) : null;
  c2.save();
  c2.translate(tr.x, tr.y);
  c2.rotate((tr.rotation * Math.PI) / 180);
  c2.scale(tr.scaleX, tr.scaleY);
  c2.globalAlpha = op;
  // با WebGL، درجه‌بندی رنگ در شیدر انجام می‌شود؛ وگرنه با ctx.filter
  c2.filter = glParams ? 'none' : filterString(layer, t);
  drawLayerContent(c2, layer, t, project, media);
  c2.filter = 'none';
  c2.restore();
  const done = applyCanvasFx(cv, layer, t, W, H, gl);
  if (glParams) {
    const glOut = gl.adjust(done, glParams);
    if (glOut) return glOut;
    // WebGL وسط کار شکست خورد: درجه‌بندی با ctx.filter روی بوم دوبعدی
    const fb = document.createElement('canvas'); fb.width = W; fb.height = H;
    const fc = fb.getContext('2d');
    fc.filter = filterString(layer, t);
    fc.drawImage(done, 0, 0);
    return fb;
  }
  return done;
}

/** رسم یک فریم کامل روی ctx (اندازهٔ ctx = اندازهٔ پروژه). gl اختیاری است. */
export function renderFrame(ctx, project, t, media, gl) {
  const W = project.width, H = project.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = project.bg || '#0C0D13';
  ctx.fillRect(0, 0, W, H);
  const layers = visibleLayers(project, t);
  // دوربین فعال: ترنسفورم سراسری صحنه
  const cam = layers.find(l => l.type === 'camera');
  ctx.save();
  if (cam) {
    const tr = layerTransform(cam, t);
    const zoom = cameraZoomAt(cam, t);
    ctx.translate(W / 2, H / 2);
    ctx.rotate((tr.rotation * Math.PI) / 180);
    ctx.scale(tr.scaleX * zoom, tr.scaleY * zoom);
    ctx.translate(-W / 2 + tr.x, -H / 2 + tr.y);
  }
  for (let idx = 0; idx < layers.length; idx++) {
    const layer = layers[idx];
    if (layer.type === 'camera' || layer.type === 'audio' || layer.type === 'null') continue;
    const op = layerOpacity(layer, t);
    if (op <= 0.01) continue;
    // ماسک: لایه با clip، آلفای لایهٔ زیرین را می‌گیرد (below) یا برعکس (belowInv)
    if (layer.clip === 'below' || layer.clip === 'belowInv') {
      const below = layers[idx - 1];
      if (!below || below.type === 'camera' || below.type === 'audio' || below.type === 'null') {
        if (layer.clip === 'below') continue; // ماسک خالی = هیچ‌چیز دیده نمی‌شود
      } else {
        const mine = renderLayerCanvas(layer, t, project, media, W, H, gl);
        const mask = renderLayerCanvas(below, t, project, media, W, H, gl);
        const mc = mine.getContext('2d');
        mc.globalCompositeOperation = layer.clip === 'below' ? 'destination-in' : 'destination-out';
        mc.drawImage(mask, 0, 0);
        mc.globalCompositeOperation = 'source-over';
        ctx.drawImage(mine, 0, 0);
        continue;
      }
    }
    if (canvasEffects(layer).length > 0) {
      ctx.drawImage(renderLayerCanvas(layer, t, project, media, W, H, gl), 0, 0);
      continue;
    }
    // درجه‌بندی رنگ با WebGL (سریع‌تر و یکنواخت‌تر از ctx.filter)
    if (gl?.supported && webglParamsFor(layer, t)) {
      ctx.drawImage(renderLayerCanvas(layer, t, project, media, W, H, gl), 0, 0);
      continue;
    }
    const tr = layerTransform(layer, t);
    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.rotate((tr.rotation * Math.PI) / 180);
    ctx.scale(tr.scaleX, tr.scaleY);
    ctx.globalAlpha = op;
    ctx.filter = filterString(layer, t);
    drawLayerContent(ctx, layer, t, project, media);
    ctx.filter = 'none';
    ctx.restore();
  }
  ctx.restore();
}
