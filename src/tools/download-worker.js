import { CACHE, cacheKey, valid } from './plan.js';
let controller;
self.onmessage = async ({ data }) => {
  if (data.type === 'cancel') { controller?.abort(); return; }
  if (controller) return;
  controller = new AbortController();
  const { files, base } = data;
  let currentFile;
  const checkAbort = () => { if (controller.signal.aborted) throw new Error('دانلود لغو شد'); };
  const report = payload => self.postMessage(payload);
  try {
    const cache = await caches.open(CACHE);
    for (const f of files) {
      currentFile = f;
      checkAbort();
      const key = cacheKey(f, base);
      if (valid(await cache.match(key), f)) { report({ type:'cached', file:f }); continue; }
      report({ type:'progress', file:f, received:0, total:f.bytes });
      // Abort stalled connections as well as explicit cancellation.
      let timer = setTimeout(() => controller.abort(), 60000);
      let reader;
      try {
        const r = await fetch(f.url, { signal:controller.signal, credentials:'omit' });
        if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}: ${f.name}`);
        reader = r.body.getReader();
        const chunks = []; let received = 0, last = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          clearTimeout(timer); timer = setTimeout(() => controller.abort(), 60000);
          chunks.push(value); received += value.length;
          if (received > f.bytes) throw new Error(`حجم فایل با فهرست ابزارها مطابقت ندارد؛ انتظار: ${f.bytes} بایت، دریافت: ${received} بایت`);
          const now = performance.now();
          if (now - last > 120) { report({ type:'progress', file:f, received, total:f.bytes }); last = now; }
        }
        if (received !== f.bytes) throw new Error(`دانلود ناقص است؛ انتظار: ${f.bytes} بایت، دریافت: ${received} بایت`);
        report({ type:'verifying', file:f, received, total:f.bytes });
        const blob = new Blob(chunks);
        chunks.length = 0; // Drop chunk references before allocating the hash buffer.
        const bytes = await blob.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2,'0')).join('');
        if (hash !== f.sha256) throw new Error('اعتبارسنجی فایل ناموفق بود');
        checkAbort();
        const mime = f.path.endsWith('.wasm') ? 'application/wasm' : /\.(m?js)$/.test(f.path) ? 'text/javascript' : f.path.endsWith('.json') ? 'application/json' : 'application/octet-stream';
        await cache.put(key, new Response(blob, { headers:{ 'content-type':mime, 'content-length':String(received), 'x-tool-sha256':hash } }));
        report({ type:'installed', file:f, received, total:f.bytes });
      } finally { clearTimeout(timer); await reader?.cancel().catch(() => {}); }
    }
    report({ type:'done' });
  } catch (e) {
    report({ type:'error', file:currentFile, message:controller.signal.aborted ? 'دانلود لغو شد یا اتصال بیش از یک دقیقه متوقف بود؛ فایل‌های کامل حفظ شدند.' : `${currentFile?.name || 'ابزار'} — ${currentFile?.path.split('/').pop() || ''}\n${e.message}` });
  } finally { controller = null; }
};
