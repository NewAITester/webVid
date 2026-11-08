/**
 * هستهٔ Rust را برای WASM می‌سازد و خروجی را در public/wasm می‌گذارد.
 * اگر cargo یا هدف wasm32 نصب نباشد فقط هشدار می‌دهد و با کد 0 خارج
 * می‌شود — برنامه آن وقت با پیاده‌سازی‌های JS کار می‌کند (fallback).
 * در CI ابزار Rust با اکشن dtolnay/rust-toolchain نصب می‌شود.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const crate = join(root, 'rust', 'lyricstudio-core');
const out = join(
  crate, 'target', 'wasm32-unknown-unknown', 'release', 'lyricstudio_core.wasm',
);
const dstDir = join(root, 'public', 'wasm');
const dst = join(dstDir, 'lyricstudio-core.wasm');

const cargoBin = join(process.env.HOME || '', '.cargo', 'bin');

function have(cmd) {
  for (const c of [cmd, join(cargoBin, cmd)]) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      // ادامه بده
    }
  }
  return false;
}

if (!have('cargo')) {
  console.warn('⚠ cargo پیدا نشد — هستهٔ Rust ساخته نشد؛ برنامه با JS کار می‌کند.');
  process.exit(0);
}
if (!existsSync(join(crate, 'Cargo.toml'))) {
  console.warn('⚠ کرت Rust پیدا نشد — رد شد.');
  process.exit(0);
}
try {
  execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], {
    cwd: crate,
    stdio: 'inherit',
    env: { ...process.env, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` },
  });
} catch (err) {
  // خطای کامپایل واقعی است — در CI باید بلند شکست بخورد، نه سکوت.
  console.error('❌ بیلد WASM شکست خورد:', err.message);
  process.exit(1);
}
if (!existsSync(out)) {
  console.warn('⚠ خروجی WASM ساخته نشد — برنامه با JS کار می‌کند.');
  process.exit(0);
}
mkdirSync(dstDir, { recursive: true });
copyFileSync(out, dst);
console.log(`✓ هستهٔ Rust → ${dst}`);
