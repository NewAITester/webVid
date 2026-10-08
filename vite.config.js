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
  build: { target: 'es2022', outDir: 'dist', assetsDir: 'a' },
});
