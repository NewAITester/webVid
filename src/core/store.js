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
    this._listeners = new Set();
    this._undo = [];
    this._redo = [];
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
