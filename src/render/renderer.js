/** رندر Canvas 2D: renderFrame(ctx, project, t, media) — تابع خالصِ رسم.
 *  ترتیب: پایین آرایه عقب، بالا جلو. بدون Math.random (هش قطعی). */
import { layerTransform, layerOpacity, visibleLayers, filterString, canvasEffects } from '../core/evaluate.js';
import { EASINGS } from '../core/easing.js';

function shapePath(ctx, kind, w, h) {
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
  const typeFx = (layer.effects || []).find(f => f.id === 'typewriter');
  let content = tx.content || '';
  if (typeFx) {
    const n = Math.floor((t - layer.start) * (typeFx.params?.speed || 12));
    content = content.slice(0, Math.max(0, n));
  }
  const tracking = (layer.effects || []).find(f => f.id === 'tracking');
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
function applyCanvasFx(src, layer, t, W, H) {
  const fxs = canvasEffects(layer);
  if (!fxs.length) return src;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const c = out.getContext('2d');
  c.drawImage(src, 0, 0);
  for (const fx of fxs) {
    const p = fx.params || {};
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

/** رسم یک فریم کامل روی ctx (اندازهٔ ctx = اندازهٔ پروژه). */
export function renderFrame(ctx, project, t, media) {
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
    ctx.translate(W / 2, H / 2);
    ctx.rotate((tr.rotation * Math.PI) / 180);
    ctx.scale(tr.scaleX * (cam.camera?.zoom || 1), tr.scaleY * (cam.camera?.zoom || 1));
    ctx.translate(-W / 2 + tr.x, -H / 2 + tr.y);
  }
  for (const layer of layers) {
    if (layer.type === 'camera' || layer.type === 'audio' || layer.type === 'null') continue;
    const tr = layerTransform(layer, t);
    const op = layerOpacity(layer, t);
    if (op <= 0.01) continue;
    const needsFx = canvasEffects(layer).length > 0;
    const target = needsFx ? document.createElement('canvas') : null;
    if (target) { target.width = W; target.height = H; }
    const c2 = target ? target.getContext('2d') : ctx;
    c2.save();
    if (!target) { c2.translate(tr.x, tr.y); c2.rotate((tr.rotation * Math.PI) / 180); c2.scale(tr.scaleX, tr.scaleY); c2.globalAlpha = op; }
    else { c2.translate(tr.x, tr.y); c2.rotate((tr.rotation * Math.PI) / 180); c2.scale(tr.scaleX, tr.scaleY); c2.globalAlpha = op; }
    c2.filter = filterString(layer);
    drawLayerContent(c2, layer, t, project, media);
    c2.filter = 'none';
    c2.restore();
    if (target) {
      const done = applyCanvasFx(target, layer, t, W, H);
      ctx.drawImage(done, 0, 0);
    }
  }
  ctx.restore();
}
