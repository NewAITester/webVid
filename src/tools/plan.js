export const CACHE = 'wv-tools-sha256-v1'; // stable across application updates
export function cacheKey(file, base) {
  return new URL(`__tool-cache/${file.sha256}`, base).href;
}
export function plan(manifest, ids) {
  const seen = new Set(), files = new Map();
  function add(id) {
    if (seen.has(id)) return;
    const e = manifest.entries[id];
    if (!e) throw new Error(`ابزار ناشناخته: ${id}`);
    seen.add(id);
    for (const d of e.deps || []) add(d);
    for (const f of e.files) files.set(f.path, { ...f, tool:id, name:e.name });
  }
  ids.forEach(add);
  return [...files.values()];
}
export function valid(response, file) {
  return !!response && response.headers.get('x-tool-sha256') === file.sha256
    && Number(response.headers.get('content-length')) === file.bytes;
}
