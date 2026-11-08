/** پوستهٔ ویرایشگر: نوار بالا، صحنه، پخش، تایم‌لاین، شیت، منوی ＋، نوارهای انتخاب. */
import { newLayer, EFFECTS, EFFECT_PRESETS, effectById } from '../core/schema.js';
import { Timeline } from './timeline.js';
import { renderInspector } from './panels.js';
import { renderFrame } from '../render/renderer.js';
import { MediaPool } from '../render/media.js';

const $ = s => document.querySelector(s);

export class Editor {
  constructor(store, onExit) {
    this.store = store; this.onExit = onExit;
    this.media = new MediaPool();
    this.tl = new Timeline($('#tl'), store);
    this.raf = null; this.lastT = 0;
    this._wire();
    store.subscribe(() => this.sync());
  }

  get project() { return this.store.project; }
  get canvas() { return $('#stage'); }

  _wire() {
    $('#backBtn').onclick = () => { this.stop(); this.onExit(); };
    $('#topExport').onclick = () => this.openPane('export');
    $('#etitle').onchange = e => this.store.renameProject(this.project.id, e.target.value);
    $('#play').onclick = () => this.toggle();
    $('#prevFrame').onclick = () => this.seek(this.store.time - 1 / 30);
    $('#nextFrame').onclick = () => this.seek(this.store.time + 1 / 30);
    $('#undoBtn').onclick = () => this.store.undo();
    $('#redoBtn').onclick = () => this.store.redo();
    $('#scrub').oninput = e => this.seek(parseFloat(e.target.value));
    $('#addFab').onclick = () => this.openAdd();
    $('#addClose').onclick = () => this.closeAdd();
    $('#railGrid').onclick = () => { $('#stageGrid').classList.toggle('hidden'); $('#railGrid').classList.toggle('on'); };
    $('#railSolo').onclick = () => {
      const l = this.store.selection; if (!l) return;
      this.store.toggleSolo(l.id);
      $('#railSolo').classList.toggle('on', this.store.soloId === l.id);
      this.draw();
    };
    $('#zIn').onclick = () => this._zoom(1.2);
    $('#zOut').onclick = () => this._zoom(1 / 1.2);
    $('#zFit').onclick = () => { this._zoomV = 1; this.sizeStage(); };
    $('#selClose').onclick = () => this.store.select(null);
    $('#selDel').onclick = () => { if (this.store.selection) this.store.removeLayer(this.store.selection.id); };
    $('#selGroup').onclick = () => this._groupSelected();
    $('#selUngroup').onclick = () => this._ungroupSelected();
    $('#selCopy').onclick = () => { if (this.store.selection) this.store.copyLayer(this.store.selection.id); };
    $('#selMask').onclick = () => this._cycleMask();
    $('#pasteLayerBtn').onclick = () => this.store.pasteLayer();
    window.addEventListener('keydown', e => this._onKey(e));
    $('#sbTrimA').onclick = () => this._trimSel('a');
    $('#sbSplit').onclick = () => this._splitSel();
    $('#sbTrimB').onclick = () => this._trimSel('b');
    $('#sbAlignA').onclick = () => this._alignSel('a');
    $('#sbAlignB').onclick = () => this._alignSel('b');
    $('#paneClose').onclick = () => this.closePane();
    $('#addLayerBtn').onclick = () => this.openAdd();
    document.querySelectorAll('.ptab').forEach(b => {
      b.onclick = () => this.openPane(b.dataset.pane);
    });
    document.querySelectorAll('.addtab').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.addtab').forEach(x => x.classList.toggle('on', x === b));
        this._addFilter = b.dataset.cat;
        this._renderAddTiles();
      };
    });
    document.querySelectorAll('.qbtn[data-add]').forEach(b => {
      b.onclick = () => { this.addLayer(b.dataset.add); };
    });
    $('#addSearch').oninput = () => this._renderAddTiles();
    window.addEventListener('resize', () => this.sizeStage());
  }

  open() {
    const p = this.project; if (!p) return;
    $('#etitle').value = p.name;
    $('#app').dataset.screen = 'editor';
    this.sizeStage();
    this.sync();
    this.draw();
  }

  sizeStage() {
    const wrap = $('.stagewrap');
    const p = this.project; if (!p) return;
    const availW = wrap.clientWidth - 8, availH = wrap.clientHeight - 8;
    const scale = Math.min(availW / p.width, availH / p.height) * (this._zoomV || 1);
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = p.width * dpr; cv.height = p.height * dpr;
    cv.style.width = `${p.width * scale}px`;
    cv.style.height = `${p.height * scale}px`;
    this._dpr = dpr;
  }

  _zoom(f) { this._zoomV = Math.min(3, Math.max(0.3, (this._zoomV || 1) * f)); this.sizeStage(); }

  sync() {
    const p = this.project; if (!p) return;
    $('#tc').textContent = fmtTime(this.store.time);
    $('#dur').textContent = fmtTime(p.duration);
    $('#scrub').max = p.duration; $('#scrub').value = this.store.time;
    $('#play').textContent = this.store.playing ? '❚❚' : '▶';
    $('#undoBtn').disabled = !this.store.canUndo;
    $('#redoBtn').disabled = !this.store.canRedo;
    const l = this.store.selection;
    $('#selBar').classList.toggle('hidden', !l);
    $('#selBottom').classList.toggle('hidden', !l || !!this.store.pane);
    $('#addFab').classList.toggle('hidden', !!l);
    if (l) {
      $('#selName').textContent = l.name;
      $('#selMask').classList.toggle('on', l.clip !== 'none');
      $('#selMask b').textContent = l.clip === 'belowInv' ? 'ماسک معکوس' : 'ماسک';
      $('#selUngroup').classList.toggle('hidden', l.type !== 'group');
      $('#selGroup').classList.toggle('hidden', l.type === 'group');
    }
    if (this.store.pane === 'inspector') renderInspector(this.store);
    if (this.store.pane === 'layers') this._renderLayers();
    if (this.store.pane === 'effects') this._renderFxCatalog();
    this.tl.draw();
    this.draw();
  }

  _renderLayers() {
    const root = $('#layerList');
    root.innerHTML = '';
    const layers = [...this.project.layers].reverse();
    if (!layers.length) { root.innerHTML = '<div class="empty">لایه‌ای نیست — با ＋ اضافه کن.</div>'; return; }
    for (const l of layers) {
      const row = document.createElement('div');
      row.className = 'lrow' + (l.id === this.store.selId ? ' live' : '');
      row.innerHTML = `<span class="lic">${{ text: 'T', shape: '◆', image: '▣', video: '▶', audio: '♪', draw: '〰', camera: '◉', group: '▣', null: '○' }[l.type] || '•'}</span><span class="lnm">${l.name}<em> ${l.start.toFixed(1)}–${l.end.toFixed(1)}s</em></span><button class="ib" title="بالا">↑</button><button class="ib" title="پایین">↓</button>`;
      row.onclick = () => this.store.select(l.id);
      const [up, down] = row.querySelectorAll('.ib');
      up.onclick = e => { e.stopPropagation(); this.store.moveLayer(l.id, 1); };
      down.onclick = e => { e.stopPropagation(); this.store.moveLayer(l.id, -1); };
      root.appendChild(row);
    }
  }

  _renderFxCatalog() {
    const root = $('#fxList');
    root.innerHTML = '';
    const l = this.store.selection;
    if (!l) { root.innerHTML = '<div class="empty">اول یک لایه انتخاب کن.</div>'; return; }
    // پیش‌تنظیم‌ها
    const preTitle = document.createElement('div');
    preTitle.className = 'fxcat'; preTitle.textContent = 'پیش‌تنظیم‌ها';
    root.appendChild(preTitle);
    const preRow = document.createElement('div');
    preRow.className = 'chips';
    for (const pre of EFFECT_PRESETS) {
      const b = document.createElement('button');
      b.className = 'chip'; b.textContent = '✦ ' + pre.name;
      b.onclick = () => {
        const next = [...(l.effects || [])];
        for (const pe of pre.effects) {
          const def = effectById(pe.id); if (!def) continue;
          const params = {};
          for (const [k, pd] of Object.entries(def.params)) params[k] = pe.params?.[k] ?? pd.def;
          const i = next.findIndex(f => f.id === pe.id);
          if (i >= 0) next[i] = { ...next[i], params };
          else next.push({ id: pe.id, params, enabled: true, keyframes: {} });
          this.store.noteFx(pe.id);
        }
        this.store.updateLayer(l.id, { effects: next });
      };
      preRow.appendChild(b);
    }
    root.appendChild(preRow);
    // اخیر
    const recent = (this.store.recentFx || []).map(effectById).filter(Boolean);
    if (recent.length) {
      const rTitle = document.createElement('div');
      rTitle.className = 'fxcat'; rTitle.textContent = 'اخیر';
      root.appendChild(rTitle);
      const rRow = document.createElement('div');
      rRow.className = 'chips';
      for (const e of recent) {
        const b = document.createElement('button');
        b.className = 'chip'; b.textContent = e.name;
        b.onclick = () => this._addFxTo(l, e);
        rRow.appendChild(b);
      }
      root.appendChild(rRow);
    }
    const cats = {};
    for (const e of EFFECTS) (cats[e.cat] ||= []).push(e);
    for (const [cat, list] of Object.entries(cats)) {
      const title = document.createElement('div');
      title.className = 'fxcat'; title.textContent = cat;
      root.appendChild(title);
      for (const e of list) {
        const row = document.createElement('div');
        row.className = 'lrow';
        const has = (l.effects || []).some(f => f.id === e.id);
        row.innerHTML = `<span class="lnm">${e.name}</span><span class="ltm">${has ? '✓ اضافه شده' : ''}</span>`;
        row.onclick = () => this._addFxTo(l, e);
        root.appendChild(row);
      }
    }
  }

  _addFxTo(layer, def) {
    if ((layer.effects || []).some(f => f.id === def.id)) return;
    const params = {};
    for (const [k, pd] of Object.entries(def.params)) params[k] = pd.def;
    this.store.updateLayer(layer.id, { effects: [...(layer.effects || []), { id: def.id, params, enabled: true, keyframes: {} }] });
    this.store.noteFx(def.id);
  }

  draw() {
    const p = this.project; if (!p) return;
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(this._dpr || 1, 0, 0, this._dpr || 1, 0, 0);
    let proj = p;
    if (this.store.soloId) {
      proj = { ...p, layers: p.layers.filter(l => l.id === this.store.soloId || l.type === 'camera') };
    }
    renderFrame(ctx, proj, this.store.time, this.media);
  }

  seek(t) {
    this.store.setTime(t);
    this.draw(); this.tl.draw();
  }
  toggle() {
    if (this.store.playing) this.stop();
    else {
      this.store.playing = true;
      this.lastT = performance.now();
      const loop = now => {
        if (!this.store.playing) return;
        const dt = Math.min(0.1, (now - this.lastT) / 1000);
        this.lastT = now;
        let t = this.store.time + dt;
        if (t >= this.project.duration) { t = this.project.duration; this.stop(); }
        this.store.time = t;
        $('#tc').textContent = fmtTime(t);
        $('#scrub').value = t;
        this.tl.draw(); this.draw();
        if (this.store.playing) this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
    this.sync();
  }
  stop() { this.store.playing = false; if (this.raf) cancelAnimationFrame(this.raf); this.sync(); }

  openPane(name) {
    this.store.pane = name;
    document.querySelectorAll('.ptab').forEach(b => b.classList.toggle('on', b.dataset.pane === name));
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.pane === name));
    $('#panes').classList.add('open');
    if (name === 'inspector') renderInspector(this.store);
    this.sync();
  }
  closePane() {
    this.store.pane = null;
    $('#panes').classList.remove('open');
    this.sync();
  }

  openAdd() {
    this._addFilter = 'shape';
    document.querySelectorAll('.addtab').forEach(x => x.classList.toggle('on', x.dataset.cat === 'shape'));
    this._renderAddTiles();
    $('#addsheet').classList.add('in');
    $('#addsheet').classList.remove('hidden');
  }
  closeAdd() { $('#addsheet').classList.add('hidden'); }
  _renderAddTiles() {
    const grid = $('#addGrid');
    const q = ($('#addSearch').value || '').trim();
    const cat = this._addFilter || 'shape';
    grid.innerHTML = '';
    const tiles = [];
    if (cat === 'shape') for (const k of ['ellipse', 'rect', 'triangle', 'star', 'heart', 'ring', 'line', 'diamond']) tiles.push({ kind: 'shape', shape: k, label: k });
    if (cat === 'text') tiles.push({ kind: 'text', label: 'متن تازه' });
    if (cat === 'media') tiles.push({ kind: 'image', label: 'تصویر (از فایل)' }, { kind: 'video', label: 'ویدیو (از فایل)' });
    if (cat === 'audio') tiles.push({ kind: 'audio', label: 'صدا (از فایل)' });
    if (cat === 'object') tiles.push({ kind: 'camera', label: 'دوربین' }, { kind: 'null', label: 'لایهٔ خالی' }, { kind: 'group', label: 'گروه خالی' });
    if (cat === 'template') tiles.push({ kind: 'template', label: 'قالب نمایش' });
    for (const t of tiles) {
      if (q && !t.label.includes(q)) continue;
      const b = document.createElement('button');
      b.className = 'stile';
      b.innerHTML = `<i>${t.kind === 'shape' ? '◆' : t.kind === 'text' ? 'T' : t.kind === 'camera' ? '◉' : '+'}</i><b>${t.label}</b>`;
      b.onclick = () => this.addLayer(t.kind, t.shape);
      grid.appendChild(b);
    }
  }
  addLayer(kind, shapeKind) {
    const p = this.project; if (!p) return;
    if (kind === 'template') { this._addDemo(); this.closeAdd(); return; }
    if (kind === 'image' || kind === 'video' || kind === 'audio') { this._pickFile(kind); this.closeAdd(); return; }
    const l = newLayer(kind, { start: this.store.time, end: Math.min(p.duration, this.store.time + 5) });
    l.transform.x = p.width / 2; l.transform.y = p.height / 2;
    if (shapeKind) l.shape.kind = shapeKind;
    this.store.addLayer(l);
    this.closeAdd();
    this.openPane('inspector');
  }
  _addDemo() {
    const p = this.project;
    const t = newLayer('text', { name: 'عنوان', start: this.store.time, end: Math.min(p.duration, this.store.time + 5) });
    t.text.content = 'عنوان تازه';
    t.transform.x = p.width / 2; t.transform.y = p.height / 2;
    this.store.addLayer(t);
  }
  _pickFile(kind) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = kind === 'audio' ? 'audio/*' : kind === 'video' ? 'video/*' : 'image/*';
    inp.onchange = () => {
      const f = inp.files?.[0]; if (!f) return;
      const url = URL.createObjectURL(f);
      const l = newLayer(kind, { name: f.name, start: this.store.time, end: Math.min(this.project.duration, this.store.time + 5), src: url });
      l.transform.x = this.project.width / 2; l.transform.y = this.project.height / 2;
      this.store.addLayer(l);
      this.openPane('inspector');
    };
    inp.click();
  }
  _groupSelected() {
    const l = this.store.selection; if (!l || l.type === 'group') return;
    const g = newLayer('group', { name: 'گروه', start: l.start, end: l.end });
    g.children = [JSON.parse(JSON.stringify(l))];
    g.children[0].start = 0; g.children[0].end = l.end - l.start;
    this.store._snapshot();
    this.project.layers = this.project.layers.filter(x => x.id !== l.id);
    this.project.layers.push(g);
    this.store.selId = g.id;
    this.store.emit();
  }
  _ungroupSelected() {
    const l = this.store.selection; if (!l) return;
    this.store.ungroupLayer(l.id);
  }

  /** میانبرها: Space پخش، Delete حذف، Ctrl+Z/Y واگرد/ازنو، Ctrl+C/V کپی/چسباندن، Ctrl+D کپی لایه. */
  _onKey(e) {
    if ($('#app').dataset.screen !== 'editor') return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
    const mod = e.ctrlKey || e.metaKey;
    const l = this.store.selection;
    if (e.code === 'Space') { e.preventDefault(); this.toggle(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && l) { this.store.removeLayer(l.id); }
    else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.store.undo(); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); this.store.redo(); }
    else if (mod && e.key.toLowerCase() === 'c' && l) { this.store.copyLayer(l.id); }
    else if (mod && e.key.toLowerCase() === 'v') { this.store.pasteLayer(); }
    else if (mod && e.key.toLowerCase() === 'd' && l) { e.preventDefault(); this.store.duplicateLayer(l.id); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.seek(this.store.time - 1 / 30); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.seek(this.store.time + 1 / 30); }
  }
  _cycleMask() {
    const l = this.store.selection; if (!l) return;
    const next = l.clip === 'none' ? 'below' : l.clip === 'below' ? 'belowInv' : 'none';
    this.store.updateLayer(l.id, { clip: next });
  }
  _trimSel(which) {
    const l = this.store.selection; if (!l) return;
    if (which === 'a') this.store.updateLayer(l.id, { start: this.store.time });
    else this.store.updateLayer(l.id, { end: this.store.time });
  }
  _splitSel() {
    const l = this.store.selection; if (!l) return;
    this.store.splitLayer(l.id, this.store.time);
  }
  _alignSel(which) {
    const l = this.store.selection; if (!l) return;
    if (which === 'a') this.store.updateLayer(l.id, { start: this.store.time });
    else this.store.updateLayer(l.id, { end: this.store.time });
  }
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
