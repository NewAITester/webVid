/** فروشگاه وضعیت: پروژه + انتخاب + پخش + واگرد/ازنو + ذخیرهٔ محلی. */
import { newProject, demoProject, uid } from './schema.js';

const KEY = 'lyricstudio.projects.v2';

export class Store {
  constructor() {
    this.projects = this._load();
    this.currentId = this.projects[0]?.id || null;
    this.selId = null;
    this.time = 0;
    this.playing = false;
    this.pane = null; // 'layers' | 'inspector' | 'effects' | 'export' | null
    this.soloId = null; // تک‌نمایش (فقط نشست، ذخیره نمی‌شود)
    this._clipboard = null;
    this._fxClipboard = null;
    this.recentFx = this._loadRecent();
    this._listeners = new Set();
    this._undo = [];
    this._redo = [];
  }

  get canUndo() { return this._undo.length > 0; }
  get canRedo() { return this._redo.length > 0; }

  /** تک‌نمایش یک لایه (بقیه پنهان می‌شوند). */
  toggleSolo(id) {
    this.soloId = this.soloId === id ? null : id;
    this.emit();
  }

  /** کپی لایه در حافظهٔ موقت. */
  copyLayer(id) {
    const l = this.project?.layers.find(l => l.id === id);
    if (!l) return false;
    this._clipboard = JSON.parse(JSON.stringify(l));
    return true;
  }
  /** چسباندن کپی در زمان فعلی. */
  pasteLayer() {
    if (!this.project || !this._clipboard) return null;
    this._snapshot();
    const dur = this._clipboard.end - this._clipboard.start;
    const start = Math.min(this.time, Math.max(0, this.project.duration - dur));
    const copy = JSON.parse(JSON.stringify(this._clipboard));
    copy.id = uid(); copy.name = copy.name + ' کپی';
    copy.start = start; copy.end = start + dur;
    this.project.layers.push(copy);
    this.project.duration = Math.max(this.project.duration, copy.end);
    this.selId = copy.id;
    this.emit();
    return copy;
  }

  /** باز کردن گروه: بچه‌ها با ترنسفورم گروه ترکیب می‌شوند و جای گروه می‌نشینند. */
  ungroupLayer(id) {
    const ls = this.project?.layers; if (!ls) return false;
    const i = ls.findIndex(l => l.id === id);
    if (i < 0 || ls[i].type !== 'group') return false;
    this._snapshot();
    const g = ls[i];
    const kids = (g.children || []).map(ch => {
      const k = JSON.parse(JSON.stringify(ch));
      k.id = uid();
      k.start = g.start + (ch.start || 0);
      k.end = g.start + (ch.end || (g.end - g.start));
      const gt = g.transform || {};
      k.transform = {
        ...k.transform,
        x: (k.transform?.x || 0) + (gt.x || 0),
        y: (k.transform?.y || 0) + (gt.y || 0),
        scaleX: (k.transform?.scaleX || 1) * (gt.scaleX || 1),
        scaleY: (k.transform?.scaleY || 1) * (gt.scaleY || 1),
        rotation: (k.transform?.rotation || 0) + (gt.rotation || 0),
      };
      return k;
    });
    ls.splice(i, 1, ...kids);
    this.selId = kids[0]?.id || null;
    this.emit();
    return true;
  }

  get project() { return this.projects.find(p => p.id === this.currentId) || null; }
  get selection() { return this.project?.layers.find(l => l.id === this.selId) || null; }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  emit() { this._listeners.forEach(fn => fn()); this._save(); }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
    } catch { /* خراب: از اول */ }
    return [];
  }
  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.projects)); } catch { /* فضای کم */ }
  }
  _loadRecent() {
    try {
      const raw = localStorage.getItem('lyricstudio.recentFx.v1');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  /** ثبت افکت در «اخیر» (حداکثر ۶ مورد). */
  noteFx(id) {
    this.recentFx = [id, ...this.recentFx.filter(x => x !== id)].slice(0, 6);
    try { localStorage.setItem('lyricstudio.recentFx.v1', JSON.stringify(this.recentFx)); } catch { /* نه */ }
  }
  /** کپی همهٔ افکت‌های یک لایه. */
  copyEffects(id) {
    const l = this.project?.layers.find(l => l.id === id);
    if (!l || !l.effects?.length) return false;
    this._fxClipboard = JSON.parse(JSON.stringify(l.effects));
    return true;
  }
  /** چسباندن افکت‌های کپی‌شده روی لایهٔ دیگر (جایگزین می‌کند). */
  pasteEffects(id) {
    const l = this.project?.layers.find(l => l.id === id);
    if (!l || !this._fxClipboard) return false;
    this._snapshot();
    l.effects = JSON.parse(JSON.stringify(this._fxClipboard));
    this.emit();
    return true;
  }

  _snapshot() {
    this._undo.push(JSON.stringify(this.projects));
    if (this._undo.length > 50) this._undo.shift();
    this._redo = [];
  }
  undo() {
    if (!this._undo.length) return;
    this._redo.push(JSON.stringify(this.projects));
    this.projects = JSON.parse(this._undo.pop());
    this.selId = null; this.emit();
  }
  redo() {
    if (!this._redo.length) return;
    this._undo.push(JSON.stringify(this.projects));
    this.projects = JSON.parse(this._redo.pop());
    this.selId = null; this.emit();
  }

  createProject(name, w = 720, h = 1280) {
    const p = newProject(name, w, h);
    this.projects.unshift(p);
    this.currentId = p.id; this.selId = null; this.time = 0;
    this.emit();
    return p;
  }
  openProject(id) {
    if (!this.projects.some(p => p.id === id)) return;
    this.currentId = id; this.selId = null; this.time = 0; this.playing = false;
    this.emit();
  }
  deleteProject(id) {
    this._snapshot();
    this.projects = this.projects.filter(p => p.id !== id);
    if (this.currentId === id) this.currentId = this.projects[0]?.id || null;
    this.emit();
  }
  renameProject(id, name) {
    const p = this.projects.find(p => p.id === id);
    if (p && name.trim()) { this._snapshot(); p.name = name.trim(); this.emit(); }
  }

  /** پروژهٔ نمایشی برای اولین اجرا. */
  ensureDemo() {
    if (!this.projects.length) {
      this.projects.push(demoProject());
      this.currentId = this.projects[0].id;
      this._save();
    }
  }

  select(id) { this.selId = id; this.emit(); }

  addLayer(layer) {
    if (!this.project) return;
    this._snapshot();
    this.project.layers.push(layer);
    this.project.duration = Math.max(this.project.duration, layer.end);
    this.selId = layer.id;
    this.emit();
  }
  removeLayer(id) {
    if (!this.project) return;
    this._snapshot();
    this.project.layers = this.project.layers.filter(l => l.id !== id);
    if (this.selId === id) this.selId = null;
    this.emit();
  }
  updateLayer(id, patch) {
    const l = this.project?.layers.find(l => l.id === id);
    if (!l) return;
    this._snapshot();
    Object.assign(l, patch);
    this.emit();
  }
  /** تغییر یک ویژگیِ لایه بدون ثبت در تاریخچه (مثلاً هنگام کشیدن اسلایدر). */
  patchLayer(id, patch) {
    const l = this.project?.layers.find(l => l.id === id);
    if (!l) return;
    Object.assign(l, patch);
    this.emit();
  }
  moveLayer(id, dir) {
    const ls = this.project?.layers; if (!ls) return;
    const i = ls.findIndex(l => l.id === id); if (i < 0) return;
    const j = i + dir; if (j < 0 || j >= ls.length) return;
    this._snapshot();
    [ls[i], ls[j]] = [ls[j], ls[i]];
    this.emit();
  }
  duplicateLayer(id) {
    const l = this.project?.layers.find(l => l.id === id); if (!l) return;
    this._snapshot();
    const copy = JSON.parse(JSON.stringify(l));
    copy.id = uid(); copy.name = l.name + ' کپی';
    copy.start = l.start; copy.end = l.end;
    this.project.layers.splice(this.project.layers.indexOf(l) + 1, 0, copy);
    this.selId = copy.id;
    this.emit();
  }
  splitLayer(id, at) {
    const ls = this.project?.layers; if (!ls) return;
    const l = ls.find(l => l.id === id); if (!l || at <= l.start || at >= l.end) return;
    this._snapshot();
    const b = JSON.parse(JSON.stringify(l));
    b.id = uid(); b.start = at;
    l.end = at;
    ls.splice(ls.indexOf(l) + 1, 0, b);
    this.emit();
  }
  setTime(t) {
    if (!this.project) return;
    this.time = Math.min(this.project.duration, Math.max(0, t));
    this.emit();
  }
}
