import { nat, PyModule, PyFunc, Unk, tup, isTuple, repr, truthy } from './pyinterp.js';
import { toHex } from './emit.js';

/**
 * آداپتور MoviePy (نسخهٔ ۱ و ۲)
 * ─────────────────────────────────────────────────────────────
 * TextClip / ColorClip / ImageClip / VideoFileClip / CompositeVideoClip /
 * concatenate_videoclips … به‌جای ساختن ویدیو، «کلیپ ثبت‌شده» برمی‌گردانند.
 * بعد از اجرا، کلیپ نهایی (write_videofile) به مدل میانی تبدیل می‌شود.
 */
let SEQ = 0;
class Clip {
  constructor(kind, o = {}) {
    this.id = ++SEQ; this.kind = kind;
    Object.assign(this, { dur: null, start: 0, pos: null, rel: false, opacity: 1, fadein: 0, fadeout: 0, rot: 0, scale: 1, scaleFn: null, w: null, h: null, layer: 0, slideIn: null, slideOut: null }, o);
  }
  clone(o = {}) { const c = Object.assign(Object.create(Clip.prototype), this, o); c.id = ++SEQ; return c; }
  get end() { return this.dur == null ? null : this.start + this.dur; }
  __repr() { return `<${this.kind}Clip>`; }
}
const isClip = v => v instanceof Clip;

export function moviepyModules(S) {
  // S: وضعیت جمع‌آوری { finals: [], all: [], audio: [], media: [], fps, interp }
  const n = nat;
  const reg = c => { S.all.push(c); return c; };
  const sz = v => (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' ? [v[0], v[1]] : null);
  const textSize = (txt, fs, size, method) => {
    const lines = String(txt).split('\n');
    const longest = Math.max(1, ...lines.map(l => [...l].length));
    let w = size?.[0] ?? Math.round(longest * fs * 0.58 + fs * 0.2), h = size?.[1] ?? Math.round(lines.length * fs * 1.25);
    if (method === 'caption' && size?.[0] && !size?.[1]) h = Math.round(Math.ceil(longest * fs * 0.58 / size[0]) * fs * 1.25);
    return [w, h];
  };
  const fontId = f => { const s = String(f || '').toLowerCase(); if (!s) return null; if (/mono|courier|consol/.test(s)) return 'mono'; if (/serif|times|georgia|garamond/.test(s) && !/sans/.test(s)) return 'serif'; if (/black|heavy|extrabold/.test(s)) return 'black'; if (/bold/.test(s)) return 'bold'; return 'sans'; };

  /* ── سازنده‌ها ── */
  const TextClip = n((a, k) => {
    let txt = k.txt ?? k.text, font = k.font;
    if (txt == null) {
      // v2: TextClip(font, text, …) — v1: TextClip(txt, …)
      if (a.length >= 2 && typeof a[0] === 'string' && /\.(ttf|otf|ttc)$/i.test(a[0])) { font = a[0]; txt = a[1]; }
      else txt = a[0];
    }
    if (txt instanceof Unk || txt == null) txt = typeof txt === 'string' ? txt : (k.filename ? `[${k.filename}]` : 'متن');
    const fs = +(k.fontsize ?? k.font_size ?? (a.length > 1 && typeof a[1] === 'number' ? a[1] : 48)) || 48;
    const size = sz(k.size);
    const [w, h] = textSize(txt, fs, size, k.method);
    return reg(new Clip('text', {
      text: String(txt), fontsize: fs, color: toHex(k.color ?? (a.length > 2 ? a[2] : null), '#000000', '255'), font: fontId(font), fontName: font ? String(font) : null,
      bg: k.bg_color ? toHex(k.bg_color, null, '255') : null, stroke: k.stroke_color ? toHex(k.stroke_color, null, '255') : null, strokeW: k.stroke_width ?? null,
      kerning: k.kerning ?? null, align: k.align || k.text_align || null, w, h, dur: k.duration ?? null,
    }));
  });
  const ColorClip = n((a, k) => {
    const size = sz(k.size ?? a[0]) || [S.W0 || 1920, S.H0 || 1080];
    return reg(new Clip('color', { w: size[0], h: size[1], color: toHex(k.color ?? k.col ?? a[1] ?? [0, 0, 0], '#000000', '255'), dur: k.duration ?? a[3] ?? null }));
  });
  const ImageClip = n((a, k) => {
    const f = k.img ?? k.filename ?? a[0];
    const file = typeof f === 'string' ? f : '(آرایهٔ تصویر)';
    S.media.push({ kind: 'تصویر', file });
    return reg(new Clip('image', { file, dur: k.duration ?? a[3] ?? null }));
  });
  const VideoFileClip = n((a, k) => {
    const file = typeof (k.filename ?? a[0]) === 'string' ? (k.filename ?? a[0]) : 'ویدیو';
    S.media.push({ kind: 'ویدیو', file });
    const tr = sz(k.target_resolution);
    return reg(new Clip('video', { file, dur: null, unknownDur: true, w: tr?.[1] ?? null, h: tr?.[0] ?? null }));
  });
  const AudioFileClip = n((a, k) => { const file = String(k.filename ?? a[0] ?? 'audio'); S.audio.push(file); return reg(new Clip('audio', { file, dur: null, unknownDur: true })); });
  const Composite = n((a, k) => {
    const kids = (a[0] && Array.isArray(a[0]) ? a[0] : a).filter(isClip).filter(c => c.kind !== 'audio');
    const size = sz(k.size) || (kids[0] && kids[0].w ? [kids[0].w, kids[0].h] : null);
    const ends = kids.map(c => (c.dur == null ? null : c.start + c.dur)).filter(x => x != null);
    return reg(new Clip('composite', { kids, w: size?.[0] ?? null, h: size?.[1] ?? null, bg: k.bg_color ? toHex(k.bg_color, null, '255') : null, dur: ends.length ? Math.max(...ends) : null }));
  });
  const concat = n((a, k) => {
    const kids = (Array.isArray(a[0]) ? a[0] : a).filter(isClip);
    const pad = +(k.padding ?? 0) || 0;
    const ws = kids.map(c => c.w).filter(Boolean), hs = kids.map(c => c.h).filter(Boolean);
    const total = kids.reduce((s, c) => s + (c.dur ?? 5), 0) + pad * Math.max(0, kids.length - 1);
    return reg(new Clip('concat', { kids, pad, method: k.method || 'chain', w: ws.length ? Math.max(...ws) : null, h: hs.length ? Math.max(...hs) : null, dur: total, transition: isClip(k.transition) ? k.transition : null }));
  });
  const clipsArray = n((a) => {
    const rows = a[0] || [];
    const kids = [];
    let y = 0, W = 0;
    for (const row of rows) { let x = 0, rh = 0; for (const c of row) { if (!isClip(c)) continue; const cw = c.w || 640, ch = c.h || 360; kids.push(c.clone({ pos: [x, y], start: c.start })); x += cw; rh = Math.max(rh, ch); } W = Math.max(W, x); y += rh; }
    const ends = kids.map(c => c.start + (c.dur ?? 5));
    return reg(new Clip('composite', { kids, w: W || null, h: y || null, dur: ends.length ? Math.max(...ends) : null }));
  });

  /* ── افکت‌ها ── */
  const fx = (name, fn) => { const f = n((a, k) => { if (isClip(a[0])) return fn(a[0], a.slice(1), k); return { __eff: name, a, k }; }, name); f.__fx = name; f.__apply = fn; return f; };
  const FX = {
    fadein: fx('fadein', (c, [d = 1], k) => c.clone({ fadein: +(k.duration ?? d) })), fadeout: fx('fadeout', (c, [d = 1], k) => c.clone({ fadeout: +(k.duration ?? d) })),
    crossfadein: fx('crossfadein', (c, [d = 1], k) => c.clone({ fadein: +(k.duration ?? d) })), crossfadeout: fx('crossfadeout', (c, [d = 1], k) => c.clone({ fadeout: +(k.duration ?? d) })),
    resize: fx('resize', (c, a, k) => doResize(c, a, k)), rotate: fx('rotate', (c, [ang = 0], k) => c.clone({ rot: c.rot - (+(k.angle ?? ang) || 0) })),
    slide_in: fx('slide_in', (c, [d = 1, side = 'left'], k) => c.clone({ slideIn: [k.side ?? side, +(k.duration ?? d)] })), slide_out: fx('slide_out', (c, [d = 1, side = 'left'], k) => c.clone({ slideOut: [k.side ?? side, +(k.duration ?? d)] })),
    speedx: fx('speedx', (c, [f = 1], k) => c.clone({ dur: c.dur != null ? c.dur / (+(k.factor ?? f) || 1) : null })),
    loop: fx('loop', (c, [nn], k) => c.clone({ dur: k.duration ?? (c.dur != null && nn ? c.dur * nn : c.dur) })),
    mirror_x: fx('mirror_x', c => c.clone({ mirrorX: true })), mirror_y: fx('mirror_y', c => c.clone({ mirrorY: true })),
    blackwhite: fx('blackwhite', c => c.clone({ bw: true })), colorx: fx('colorx', c => c), margin: fx('margin', c => c), crop: fx('crop', c => c),
    time_mirror: fx('time_mirror', c => c), invert_colors: fx('invert_colors', c => c.clone({ invert: true })), lum_contrast: fx('lum_contrast', c => c), gamma_corr: fx('gamma_corr', c => c),
  };
  // نسخهٔ ۲: کلاس‌های افکت
  const effCls = (name, map) => n((a, k) => ({ __eff: name, a, k, __apply: (c) => map(c, a, k) }), name);
  const V2 = {
    FadeIn: effCls('FadeIn', (c, [d = 1], k) => c.clone({ fadein: +(k.duration ?? d) })), FadeOut: effCls('FadeOut', (c, [d = 1], k) => c.clone({ fadeout: +(k.duration ?? d) })),
    CrossFadeIn: effCls('CrossFadeIn', (c, [d = 1], k) => c.clone({ fadein: +(k.duration ?? d) })), CrossFadeOut: effCls('CrossFadeOut', (c, [d = 1], k) => c.clone({ fadeout: +(k.duration ?? d) })),
    Resize: effCls('Resize', (c, a, k) => doResize(c, a, k)), Rotate: effCls('Rotate', (c, [ang = 0], k) => c.clone({ rot: c.rot - (+(k.angle ?? ang) || 0) })),
    SlideIn: effCls('SlideIn', (c, [d = 1, side = 'left'], k) => c.clone({ slideIn: [k.side ?? side, +(k.duration ?? d)] })), SlideOut: effCls('SlideOut', (c, [d = 1, side = 'left'], k) => c.clone({ slideOut: [k.side ?? side, +(k.duration ?? d)] })),
    MirrorX: effCls('MirrorX', c => c.clone({ mirrorX: true })), MirrorY: effCls('MirrorY', c => c.clone({ mirrorY: true })), BlackAndWhite: effCls('BlackAndWhite', c => c.clone({ bw: true })),
    MultiplySpeed: effCls('MultiplySpeed', (c, [f = 1], k) => c.clone({ dur: c.dur != null ? c.dur / (+(k.factor ?? f) || 1) : null })), Loop: effCls('Loop', (c, [nn], k) => c.clone({ dur: k.duration ?? (c.dur != null && nn ? c.dur * nn : c.dur) })),
    Margin: effCls('Margin', c => c), Crop: effCls('Crop', c => c), InvertColors: effCls('InvertColors', c => c.clone({ invert: true })), LumContrast: effCls('LumContrast', c => c), GammaCorrection: effCls('GammaCorrection', c => c), TimeMirror: effCls('TimeMirror', c => c),
  };
  function doResize(c, a, k) {
    const ns = k.newsize ?? k.new_size ?? a[0];
    if (ns instanceof PyFunc || (ns && ns.__native)) return c.clone({ scaleFn: ns });
    if (typeof ns === 'number') return c.clone({ scale: c.scale * ns });
    const t = sz(ns);
    if (t && c.w && c.h) { if (c.kind === 'color') return c.clone({ w: t[0], h: t[1] }); return c.clone({ scale: c.scale * (t[1] / c.h), w: c.w, h: c.h }); }
    if (t) return c.clone({ w: t[0], h: t[1], fit: true });
    if (k.height != null) { if (c.h) return c.clone({ scale: c.scale * (k.height / c.h) }); return c.clone({ h: k.height, w: c.w ?? Math.round(k.height * (c.kind === 'video' ? 16 / 9 : 1)), fitH: true }); }
    if (k.width != null) { if (c.w) return c.clone({ scale: c.scale * (k.width / c.w) }); return c.clone({ w: k.width, h: c.h ?? Math.round(k.width * (c.kind === 'video' ? 9 / 16 : 1)), fitW: true }); }
    if (k.scale != null) return c.clone({ scale: c.scale * k.scale });
    return c;
  }

  /* ── متدهای کلیپ ── */
  const applyEff = (c, e) => (e?.__apply ? e.__apply(c) : e?.__eff && FX[e.__eff.toLowerCase?.()] ? FX[e.__eff.toLowerCase()].__apply(c, e.a, e.k) : c);
  const methods = {
    set_duration: (c, [d], k) => c.clone({ dur: +(k.duration ?? d), unknownDur: false }), with_duration: (c, [d], k) => c.clone({ dur: +(k.duration ?? d), unknownDur: false }),
    set_start: (c, [t], k) => c.clone({ start: +(k.t ?? k.start ?? t) || 0 }), with_start: (c, [t], k) => c.clone({ start: +(k.t ?? k.start ?? t) || 0 }),
    set_end: (c, [t]) => c.clone({ dur: +t - c.start, unknownDur: false }), with_end: (c, [t]) => c.clone({ dur: +t - c.start, unknownDur: false }),
    set_position: (c, [p], k) => c.clone({ pos: k.pos ?? p, rel: truthy(k.relative) }), with_position: (c, [p], k) => c.clone({ pos: k.pos ?? p, rel: truthy(k.relative) }),
    set_pos: (c, [p], k) => c.clone({ pos: k.pos ?? p, rel: truthy(k.relative) }),
    set_opacity: (c, [o]) => c.clone({ opacity: +o }), with_opacity: (c, [o]) => c.clone({ opacity: +o }),
    set_layer: (c, [l]) => c.clone({ layer: +l || 0 }), with_layer_index: (c, [l]) => c.clone({ layer: +l || 0 }), with_layer: (c, [l]) => c.clone({ layer: +l || 0 }),
    set_audio: (c, [a]) => { if (isClip(a)) S.audioUsed = a.file; return c.clone({ audio: a }); }, with_audio: (c, [a]) => { if (isClip(a)) S.audioUsed = a.file; return c.clone({ audio: a }); },
    without_audio: c => c, set_fps: c => c, with_fps: c => c, set_mask: c => c, with_mask: c => c, add_mask: c => c, on_color: (c, a, k) => c.clone({ onColor: k.color ? toHex(k.color, null, '255') : null }),
    subclip: (c, [a = 0, b], k) => { const t0 = +(k.t_start ?? a) || 0, t1 = k.t_end ?? b; return c.clone({ dur: t1 != null ? (+t1 < 0 && c.dur ? c.dur + +t1 - t0 : +t1 - t0) : c.dur != null ? c.dur - t0 : null, unknownDur: t1 == null && c.unknownDur }); },
    resize: (c, a, k) => doResize(c, a, k), resized: (c, a, k) => doResize(c, a, k),
    rotate: (c, [ang], k) => c.clone({ rot: c.rot - (+(k.angle ?? ang) || 0) }), rotated: (c, [ang], k) => c.clone({ rot: c.rot - (+(k.angle ?? ang) || 0) }),
    fadein: (c, [d = 1]) => c.clone({ fadein: +d }), fadeout: (c, [d = 1]) => c.clone({ fadeout: +d }), crossfadein: (c, [d = 1]) => c.clone({ fadein: +d }), crossfadeout: (c, [d = 1]) => c.clone({ fadeout: +d }),
    audio_fadein: c => c, audio_fadeout: c => c, volumex: c => c, audio_normalize: c => c, with_volume_scaled: c => c,
    fx: (c, [f, ...rest], k) => { if (f?.__apply && f.__fx) return f.__apply(c, rest, k); if (f instanceof PyFunc || f?.__native) { const r = S.interp.call(f, [c, ...rest], k); return isClip(r) ? r : c; } return c; },
    with_effects: (c, [list]) => { let r = c; for (const e of (Array.isArray(list) ? list : [list])) r = applyEff(r, e); return r; },
    copy: c => c.clone(), loop: (c, [nn], k) => FX.loop.__apply(c, [nn], k), with_speed_scaled: (c, [f = 1]) => c.clone({ dur: c.dur != null ? c.dur / f : null }),
    margin: c => c, crop: c => c, cropped: c => c, with_section_cut_out: c => c, time_transform: c => c, fl: c => c, fl_image: c => c, image_transform: c => c, transform: c => c,
    write_videofile: (c, [f], k) => { S.finals.push(c); S.output = String(k.filename ?? f ?? 'video.mp4'); if (k.fps) S.fps = +k.fps; return null; },
    write_gif: (c, [f], k) => { S.finals.push(c); S.output = String(f ?? 'out.gif'); return null; },
    write_images_sequence: (c) => { S.finals.push(c); return null; },
    preview: () => null, show: () => null, ipython_display: () => null, save_frame: () => null, close: () => null, get_frame: () => new Unk('frame'), iter_frames: () => [],
    write_audiofile: () => null,
  };
  Clip.prototype.__pyget = function (name) {
    const c = this;
    if (name === 'duration') return c.dur ?? 5;
    if (name === 'start') return c.start; if (name === 'end') return c.end ?? c.start + 5;
    if (name === 'w') return c.w ?? S.W0 ?? 1920; if (name === 'h') return c.h ?? S.H0 ?? 1080;
    if (name === 'size') return tup([c.w ?? S.W0 ?? 1920, c.h ?? S.H0 ?? 1080]);
    if (name === 'fps') return S.fps || 30; if (name === 'audio') return c.audio ?? null; if (name === 'mask') return null;
    if (name === 'pos') return c.pos; if (name === 'layer') return c.layer; if (name === 'layer_index') return c.layer;
    if (name === 'txt' || name === 'text') return c.text ?? '';
    const m = methods[name];
    if (m) return nat((a, k) => m(c, a, k), name);
    return new Unk('clip.' + name);
  };
  Clip.prototype.__pyset = function (name, v) { if (name === 'duration') this.dur = +v; else if (name === 'start') this.start = +v; else if (name === 'end') this.dur = +v - this.start; else if (name === 'audio') this.audio = v; else this[name] = v; };

  const vfx = new PyModule('moviepy.video.fx', { ...FX, ...V2, all: new PyModule('all', FX) });
  const afx = new PyModule('moviepy.audio.fx', new Proxy({}, { get: (o, k) => (typeof k === 'string' ? nat(a => (isClip(a[0]) ? a[0] : { __eff: k })) : undefined), has: () => true }));
  const transfx = new PyModule('transfx', { crossfadein: FX.crossfadein, crossfadeout: FX.crossfadeout, slide_in: FX.slide_in, slide_out: FX.slide_out });
  const d = {
    TextClip, ColorClip, ImageClip, VideoFileClip, AudioFileClip, CompositeVideoClip: Composite, concatenate_videoclips: concat, concatenate: concat, clips_array: clipsArray,
    CompositeAudioClip: n((a) => { const l = (a[0] || []).filter(isClip); return l[0] || new Clip('audio', {}); }), concatenate_audioclips: n((a) => (a[0] || []).find(isClip) || new Clip('audio', {})),
    vfx, afx, transfx, VideoClip: n(() => reg(new Clip('unknown', { dur: null }))), ImageSequenceClip: n((a, k) => { S.media.push({ kind: 'دنبالهٔ تصویر', file: String(a[0]) }); return reg(new Clip('image', { file: 'sequence', dur: null })); }),
    DataVideoClip: n(() => reg(new Clip('unknown', {}))), BitmapClip: n(() => reg(new Clip('unknown', {}))), ...FX,
  };
  const editor = new PyModule('moviepy.editor', d);
  return {
    'moviepy': editor, 'moviepy.editor': editor, 'moviepy.video.fx': vfx, 'moviepy.video.fx.all': vfx, 'moviepy.audio.fx': afx, 'moviepy.audio.fx.all': afx, 'moviepy.video.compositing.transitions': transfx,
    'moviepy.video.VideoClip': editor, 'moviepy.video.io.VideoFileClip': editor, 'moviepy.video.compositing.CompositeVideoClip': editor, 'moviepy.video.compositing.concatenate': editor, 'moviepy.audio.io.AudioFileClip': editor,
    'moviepy.video.tools.drawing': new PyModule('drawing', { color_gradient: n(() => new Unk('gradient')), circle: n(() => new Unk('circle')) }),
    'moviepy.config': new PyModule('config', { change_settings: n(() => null) }),
    'moviepy.*': editor,
  };
}

/* ── کلیپ نهایی ← مدل میانی ───────────────────────────────── */
export function moviepyModel(S, { source = 'video.py' } = {}) {
  let root = S.finals[S.finals.length - 1];
  const notes = [];
  if (!root) {
    // کلیپ نهایی نوشته نشد: آخرین ترکیب یا همهٔ کلیپ‌ها
    root = [...S.all].reverse().find(c => c.kind === 'composite' || c.kind === 'concat');
    if (root) notes.push('write_videofile پیدا نشد؛ آخرین ترکیب کلیپ‌ها به‌عنوان ویدیو گرفته شد.');
  }
  if (!root) {
    const vis = S.all.filter(c => c.kind !== 'audio');
    if (vis.length) { root = new Clip('composite', { kids: vis.filter((c, i, arr) => arr.findIndex(x => x === c) === i).slice(-12), dur: null }); notes.push('ترکیبی پیدا نشد؛ کلیپ‌های ساخته‌شده روی هم گذاشته شدند.'); }
  }
  if (!root) return null;
  const W0 = root.w || S.all.find(c => c.kind === 'color' && c.w)?.w || 1920;
  const H0 = root.h || S.all.find(c => c.kind === 'color' && c.h)?.h || 1080;
  const items = [], scenes = [];
  const I = S.interp;
  const durOf = (c, fallback) => (c.dur != null && !c.unknownDur ? c.dur : c.kind === 'composite' && c.kids?.length ? Math.max(...c.kids.map(k => k.start + durOf(k, fallback))) : c.kind === 'concat' ? c.kids.reduce((s, k) => s + durOf(k, 5), 0) + (c.pad || 0) * Math.max(0, c.kids.length - 1) : fallback ?? 5);
  let z = 0;
  const resolvePos = (p, cw, ch, w, h, rel, t) => {
    if (p instanceof PyFunc || p?.__native) { try { p = I.call(p, [t], {}); } catch { p = null; } }
    if (p == null) return [0, 0];
    if (typeof p === 'string') p = [p, p];
    if (!Array.isArray(p)) return [0, 0];
    const ax = (v, c, s, isX) => {
      if (typeof v === 'string') { if (v === 'center') return (c - s) / 2; if ((isX && v === 'left') || (!isX && v === 'top')) return 0; if ((isX && v === 'right') || (!isX && v === 'bottom')) return c - s; return 0; }
      if (typeof v === 'number') return rel ? v * c : v;
      return 0;
    };
    return [ax(p[0], cw, w, true), ax(p[1], ch, h, false)];
  };
  const sampleTimes = d => { const n = Math.min(24, Math.max(4, Math.round(d * 4))); return [...Array(n + 1)].map((_, i) => (i / n) * d); };
  function leaf(c, t0, ox, oy, cw, ch, inherited) {
    const d = durOf(c, inherited.dur);
    const it = { t0, t1: t0 + d, z: z++, opacity: c.opacity * (inherited.opacity ?? 1) };
    let w = c.w, h = c.h;
    if (c.kind === 'image' || c.kind === 'video') { if (!w || !h) { w = w || cw; h = h || (c.fitW ? Math.round(w * 9 / 16) : ch); } }
    const scale0 = c.scale;
    const place = (t) => {
      const s = c.scaleFn ? (() => { try { const v = I.call(c.scaleFn, [t], {}); return typeof v === 'number' ? v : Array.isArray(v) && h ? v[1] / h : 1; } catch { return 1; } })() * scale0 : scale0;
      const [px, py] = resolvePos(c.pos, cw, ch, (w || 0) * s, (h || 0) * s, c.rel, t);
      return { x: ox + px + (w || 0) * s / 2 - W0 / 2, y: oy + py + (h || 0) * s / 2 - H0 / 2, s };
    };
    const p0 = place(0);
    it.x = p0.x; it.y = p0.y; it.scale = p0.s;
    if (c.pos instanceof PyFunc || c.pos?.__native || c.scaleFn) {
      const ts = sampleTimes(d), xs = [], ys = [], ss = [];
      for (const t of ts) { const p = place(t); xs.push([t0 + t, p.x]); ys.push([t0 + t, p.y]); ss.push([t0 + t, p.s]); }
      it.keys = { x: xs, y: ys };
      if (c.scaleFn) it.keys.sc = ss;
      it.animated = true;
    }
    if (c.rot) it.rot = c.rot;
    const fi = c.fadein || 0, fo = c.fadeout || 0;
    if (fi) it.enter = ['fade', fi]; if (fo) it.exit = ['fade', fo];
    const slide = (s, d2) => [{ left: 'slideL', right: 'slideR', top: 'slideU', bottom: 'slideD' }[s] || 'slideL', d2];
    if (c.slideIn) it.enter = slide(...c.slideIn); if (c.slideOut) it.exit = slide(...c.slideOut);
    if (inherited.fadein && Math.abs(t0 - inherited.t0) < 1e-3 && !it.enter) it.enter = ['fade', inherited.fadein];
    if (inherited.fadeout && Math.abs(it.t1 - inherited.t1) < 1e-3 && !it.exit) it.exit = ['fade', inherited.fadeout];
    switch (c.kind) {
      case 'text': Object.assign(it, { type: 'text', str: c.text, size: c.fontsize, color: c.color, font: c.font, bg: c.bg || undefined, stroke: c.stroke || undefined, strokeW: c.strokeW || undefined, name: c.text.slice(0, 24) }); break;
      case 'color': {
        const full = w >= W0 - 1 && h >= H0 - 1 && Math.abs(it.x) < 2 && Math.abs(it.y) < 2 && !it.animated;
        if (full) Object.assign(it, { type: 'bg', c: c.color });
        else Object.assign(it, { type: 'shape', kind: 'rect', w, h, fill: c.color });
        break;
      }
      case 'image': case 'video': {
        Object.assign(it, { type: 'shape', kind: 'rect', w, h, fill: '#23232E', stroke: '#8A8AA0', strokeW: 4, name: `📁 ${String(c.file).split('/').pop()}` });
        items.push(it);
        items.push({ type: 'text', t0: it.t0, t1: it.t1, z: z++, x: it.x, y: it.y, str: `${c.kind === 'video' ? '🎬' : '🖼'} ${String(c.file).split('/').pop()}`, size: Math.max(18, Math.min(48, (w || 400) / 14)), color: '#C8C8D8', font: 'mono', keys: it.keys ? { x: it.keys.x, y: it.keys.y } : undefined, name: 'برچسب رسانه' });
        return;
      }
      default: return;
    }
    items.push(it);
  }
  function walk(c, t0, ox, oy, cw, ch, depth, inh) {
    const d = durOf(c, inh.dur);
    if (c.kind === 'composite') {
      const W = c.w || cw, H = c.h || ch;
      const [px, py] = c.pos ? resolvePos(c.pos, cw, ch, W, H, c.rel, 0) : [0, 0];
      const nx = ox + px, ny = oy + py;
      const inh2 = { dur: d, t0: t0, t1: t0 + d, opacity: (inh.opacity ?? 1) * c.opacity, fadein: c.fadein || inh.fadein, fadeout: c.fadeout || inh.fadeout };
      if (c.bg) items.push({ type: depth === 0 ? 'bg' : 'shape', kind: 'rect', c: c.bg, fill: c.bg, w: W, h: H, x: nx + W / 2 - W0 / 2, y: ny + H / 2 - H0 / 2, t0, t1: t0 + d, z: z++ });
      const kids = c.kids.map((k, i) => ({ k, i })).sort((a, b) => a.k.layer - b.k.layer || a.i - b.i);
      for (const { k } of kids) walk(k, t0 + k.start, nx, ny, W, H, depth + 1, { ...inh2, dur: Math.max(0.05, d - k.start) });
      return;
    }
    if (c.kind === 'concat') {
      let cur = t0;
      c.kids.forEach((k, i) => {
        const kd = durOf(k, 5);
        const W = c.w || cw, H = c.h || ch;
        const kw = k.w || W, kh = k.h || H;
        const offx = c.method === 'compose' ? (W - kw) / 2 : 0, offy = c.method === 'compose' ? (H - kh) / 2 : 0;
        if (depth === 0) scenes.push({ name: sceneName(k, i), t0: cur, t1: cur + kd });
        walk(k, cur, ox + offx, oy + offy, W, H, depth + 1, { dur: kd, t0: cur, t1: cur + kd, opacity: inh.opacity, fadein: i === 0 ? c.fadein : 0, fadeout: i === c.kids.length - 1 ? c.fadeout : 0 });
        cur += kd + (c.pad || 0);
        if (c.transition && i < c.kids.length - 1) { walk(c.transition, cur, ox, oy, W, H, depth + 1, { dur: durOf(c.transition, 1) }); cur += durOf(c.transition, 1); }
      });
      return;
    }
    leaf(c, t0, ox, oy, cw, ch, inh);
  }
  const sceneName = (k, i) => {
    const t = k.kind === 'text' ? k.text : k.kind === 'composite' ? (k.kids.find(x => x.kind === 'text')?.text) : null;
    return t ? `${i + 1}. ${String(t).split('\n')[0].slice(0, 20)}` : `صحنه ${i + 1}`;
  };
  const total = durOf(root, 5);
  walk(root, 0, 0, 0, W0, H0, 0, { dur: total, t0: 0, t1: total, opacity: 1 });
  const au = [...new Set(S.audio || [])];
  if (au.length) notes.push(`صدا: ${au.join('، ')} — فایل صدا را جدا در پروژه بگذارید.`);
  if (S.all.some(c => c.unknownDur && S.finals.length)) notes.push('مدت فایل‌های ویدیو/صدا از روی کد معلوم نیست؛ ۵ ثانیه فرض شد (با set_duration/subclip دقیق می‌شود).');
  return { W0, H0, duration: total, items, scenes, notes, source, kindLabel: 'MoviePy', media: S.media, audio: [...new Set([...(S.audio || [])])], fps: S.fps };
}
export { Clip };
