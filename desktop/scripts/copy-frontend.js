/**
 * Frontend'in static build çıktısını desktop/src-tauri/dist-frontend/'e kopyalar.
 * Tauri bu klasörü uygulamanın UI'ı olarak gömecek.
 */

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, cpSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const frontendOut = resolve(root, '..', 'frontend', '.output', 'public');
const target = resolve(root, 'src-tauri', 'dist-frontend');

if (!existsSync(frontendOut)) {
  console.error('✗ Frontend build çıktısı yok:', frontendOut);
  console.error('  Önce: cd ../frontend && npm run build');
  process.exit(1);
}

if (existsSync(target)) {
  console.log(`→ Eski hedef temizleniyor: ${target}`);
  rmSync(target, { recursive: true, force: true });
}

console.log(`→ Kopyalanıyor: ${frontendOut} → ${target}`);
cpSync(frontendOut, target, { recursive: true });

console.log('✓ Frontend hazır');
