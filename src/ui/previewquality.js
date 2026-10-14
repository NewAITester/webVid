import { previewQuality, setPreviewQuality } from '../engine/preview.js';

/** Applies immediately, including in read-only demo projects; no project Save needed. */
export function mountPreviewQuality(onChange, root = document) {
  const select = root.querySelector('#previewQuality');
  if (!select) return;
  select.value = previewQuality();
  select.addEventListener('change', () => {
    select.value = setPreviewQuality(select.value);
    onChange();
  });
}
