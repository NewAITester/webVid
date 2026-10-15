import { defineConfig } from 'vite';

export default defineConfig({
  // مسیرهای نسبی: هم روی زیرمسیر Pages (/webVid/) کار می‌کند
  // هم بعداً داخل WebView که از file:// لود می‌شود.
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,          // اجازه به هاست پیش‌نمایش سندباکس
    hmr: { clientPort: 443, protocol: 'wss' },
  },
  // ffmpeg.wasm کارگر (Worker) خودش را با import.meta.url می‌سازد؛
  // پیش‌بستهٔ Vite این مسیر را می‌شکند، پس از آن مستثنا می‌شود.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  worker: { format: 'es' },
  // Android API 30 images can ship Chrome/WebView 80. Avoid ES2021+ syntax
  // in app and bundled workers. public/tools-sw.js is separately kept ES2019-safe.
  build: { target: 'chrome80', outDir: 'dist', assetsDir: 'a' },
});
