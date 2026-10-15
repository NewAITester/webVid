/** Device preference only: never part of a project or export dimensions. */
export const PREVIEW_KEY = 'lyricstudio.preview.quality.v1';
export const PREVIEW_LEVELS = Object.freeze({ original: 0, light: 960, tiny: 480 });
const valid = value => Object.prototype.hasOwnProperty.call(PREVIEW_LEVELS, value) ? value : 'original';
let quality = 'original';
try { quality = valid(globalThis.localStorage?.getItem(PREVIEW_KEY)); } catch { /* private/storage disabled */ }
export const previewQuality = () => quality;
export function setPreviewQuality(value) {
  quality = valid(value);
  try { globalThis.localStorage?.setItem(PREVIEW_KEY, quality); } catch { /* still works this session */ }
  return quality;
}
export function previewSize(w, h, value = quality) {
  const max = PREVIEW_LEVELS[valid(value)];
  const scale = max ? Math.min(1, max / Math.max(w, h)) : 1;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
/** Export must ALWAYS use the untouched Python program, regardless of device preference. */
export const pythonPreviewLimit = (env = {}) => env.exporting ? 0 : PREVIEW_LEVELS[quality];
