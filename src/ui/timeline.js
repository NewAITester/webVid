/** تایم‌لاین کانوسی: ردیف هر لایه ۲۸px، خط پخش وسط، اسکرول با کشیدن. */
const ROW_H = 28, RULER_H = 22, PX_PER_SEC = 100;

export class Timeline {
  constructor(canvas, store) {
    this.cv = canvas; this.store = store;
    this.scroll = 0; // ثانیه در لبهٔ چپ
    this._drag = null;
    this._bind();
  }
  get project() { return this.store.project; }
  get playheadX() { return this.cv.clientWidth / 2; }
  get duration() { return this.project?.duration || 10; }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (this.cv.width !== w * dpr || this.cv.height !== h * dpr) {
      this.cv.width = w * dpr; this.cv.height = h * dpr;
    }
    this.dpr = dpr;
  }
  tAt(x) { return this.scroll + (x - this.playheadX) / PX_PER_SEC; }
  xAt(t) { return this.playheadX + (t - this.scroll) * PX_PER_SEC; }

  rows() {
    const p = this.project; if (!p) return [];
    return p.layers.map((l, i) => ({ layer: l, y: RULER_H + i * ROW_H, h: ROW_H }));
  }

  draw() {
    const p = this.project; if (!p) return;
    this.resize();
    const ctx = this.cv.getContext('2d');
    const W = this.cv.clientWidth, H = this.cv.clientHeight;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0C0D13'; ctx.fillRect(0, 0, W, H);
    // خط‌کش
    ctx.fillStyle = '#141620'; ctx.fillRect(0, 0, W, RULER_H);
    ctx.fillStyle = '#9395A1'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    const startSec = Math.max(0, Math.floor(this.scroll));
    for (let s = startSec; s <= this.duration + 1; s++) {
      const x = this.xAt(s);
      if (x < 0 || x > W) continue;
      ctx.fillRect(x, RULER_H - 6, 1, 6);
      ctx.fillText(`${s}s`, x, 10);
    }
    // ردیف‌ها
    const selId = this.store.selId;
    const soloId = this.store.soloId;
    for (const { layer, y, h } of this.rows()) {
      const dimmed = soloId && layer.id !== soloId;
      const x0 = this.xAt(layer.start), x1 = this.xAt(layer.end);
      ctx.globalAlpha = dimmed ? 0.35 : 1;
      ctx.fillStyle = layer.id === selId ? '#1E2239' : '#141620';
      ctx.fillRect(0, y, W, h - 1);
      ctx.fillStyle = layer.id === selId ? '#E01445' : '#2B2F39';
      const bx = Math.max(0, x0), bw = Math.min(W, x1) - bx;
      if (bw > 2) {
        ctx.beginPath(); ctx.roundRect(bx, y + 3, bw, h - 6, 5); ctx.fill();
        ctx.fillStyle = layer.id === selId ? '#FAFAFA' : '#C4C5CB';
        ctx.font = '11px "IRANSansX", system-ui, sans-serif'; ctx.textAlign = 'left';
        if (bw > 30) ctx.fillText(layer.name, bx + 6, y + h / 2 + 4);
      }
      ctx.globalAlpha = 1;
    }
    // خط پخش
    const px = this.playheadX, t = this.store.time;
    ctx.strokeStyle = '#F16586'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    ctx.fillStyle = '#F16586';
    ctx.beginPath(); ctx.moveTo(px - 6, 0); ctx.lineTo(px + 6, 0); ctx.lineTo(px, 10); ctx.closePath(); ctx.fill();
    // زمان روی خط پخش
    ctx.fillStyle = '#FAFAFA'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(t.toFixed(2) + 's', px, RULER_H + 12);
  }

  _pos(e) {
    const r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  _bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => {
      try { cv.setPointerCapture(e.pointerId); } catch { /* وب‌ویوی قدیمی */ }
      const { x, y } = this._pos(e);
      const p = this.project; if (!p) return;
      if (y < RULER_H) { // اسکراب
        this._drag = { kind: 'scrub' };
        this.store.setTime(this.tAt(x));
        return;
      }
      const row = this.rows().find(r => y >= r.y && y < r.y + r.h);
      if (!row) { this._drag = { kind: 'scroll', x, scroll: this.scroll }; return; }
      const l = row.layer;
      const x0 = this.xAt(l.start), x1 = this.xAt(l.end);
      this.store.select(l.id);
      if (Math.abs(x - x0) < 10) this._drag = { kind: 'trimStart', layer: l };
      else if (Math.abs(x - x1) < 10) this._drag = { kind: 'trimEnd', layer: l };
      else this._drag = { kind: 'move', layer: l, dx: this.tAt(x) - l.start };
    });
    cv.addEventListener('pointermove', e => {
      if (!this._drag) return;
      const { x } = this._pos(e);
      const d = this._drag;
      if (d.kind === 'scrub') this.store.setTime(this.tAt(x));
      else if (d.kind === 'scroll') {
        this.scroll = Math.max(0, d.scroll - (x - d.x) / PX_PER_SEC);
        this.draw();
      } else if (d.kind === 'trimStart') {
        const nt = Math.max(0, Math.min(d.layer.end - 0.1, this.tAt(x)));
        this.store.patchLayer(d.layer.id, { start: nt });
      } else if (d.kind === 'trimEnd') {
        const nt = Math.max(d.layer.start + 0.1, Math.min(this.duration, this.tAt(x)));
        this.store.patchLayer(d.layer.id, { end: nt });
      } else if (d.kind === 'move') {
        const dur = d.layer.end - d.layer.start;
        let ns = Math.max(0, Math.min(this.duration - dur, this.tAt(x) - d.dx));
        this.store.patchLayer(d.layer.id, { start: ns, end: ns + dur });
      }
    });
    cv.addEventListener('pointerup', () => { this._drag = null; this.store.emit(); });
  }
}
