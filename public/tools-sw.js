/* Serve ONLY verified, explicitly downloaded runtimes. Never fetch a missing binary. */
// Kept ES2019-compatible: public assets bypass Vite transpilation.
const CACHE = 'wv-tools-sha256-v1';
let manifestJob;
self.addEventListener('message', e => { if (e.data && e.data.type === 'reset-manifest') manifestJob = null; });
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url), base = new URL(self.registration.scope);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname + 'runtime/')) return;
  e.respondWith((async () => {
    if (!manifestJob) manifestJob = fetch(new URL('tools-manifest.json', base), { cache:'no-store' }).then(r => {
      if (!r.ok) throw new Error('Manifest unavailable');
      return r.json();
    }).catch(err => { manifestJob = null; throw err; });
    const manifest = await manifestJob;
    const path = url.pathname.slice((base.pathname + 'runtime/').length);
    const file = Object.values(manifest.entries).flatMap(e => e.files).find(f => f.path === path);
    if (!file) return new Response('Unknown tool', { status:404 });
    const cache = await caches.open(CACHE);
    const r = await cache.match(new URL(`__tool-cache/${file.sha256}`, base).href);
    if (!r || r.headers.get('x-tool-sha256') !== file.sha256 || Number(r.headers.get('content-length')) !== file.bytes) {
      return new Response('Download this tool from the tool manager first', { status:409 });
    }
    return r;
  })().catch(() => new Response('Tool storage unavailable', { status:503 })));
});
