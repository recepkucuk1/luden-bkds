/**
 * Node.js binary'sini Tauri resource olarak kopyalar.
 *
 * Çalışma mantığı:
 *   - Mac: `which node` ile aktif Node'u bul, src-tauri/binaries/node-runtime'a kopyala
 *   - Windows: node.exe'yi bul ve kopyala
 *   - Tauri build'i bunu .app/Contents/Resources/binaries/node-runtime içine gömer
 *
 * Çalışma anında Rust kabuk bu gömülü Node'u çağırır,
 * sistem PATH'ine güvenmez. Bu sayede:
 *   - Pilot kurumda Node kurulu olmasın
 *   - Versiyon farklı olmasın
 *   - PATH'te bulunmasın
 *   → uygulama yine de çalışır.
 */

import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'src-tauri', 'binaries');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Hangi platformdayız?
const platform = process.platform; // 'darwin', 'win32', 'linux'

// Aktif Node binary'sini bul
let nodeBinary;
try {
  if (platform === 'win32') {
    nodeBinary = execSync('where node').toString().trim().split('\n')[0].trim();
  } else {
    nodeBinary = execSync('which node').toString().trim();
  }
} catch (err) {
  console.error('✗ Node binary bulunamadı. Node kurulu mu?');
  process.exit(1);
}

if (!existsSync(nodeBinary)) {
  console.error(`✗ Node binary yok: ${nodeBinary}`);
  process.exit(1);
}

const targetName = platform === 'win32' ? 'node-runtime.exe' : 'node-runtime';
const target = resolve(outDir, targetName);

console.log('→ Node binary kopyalanıyor...');
console.log(`  Kaynak: ${nodeBinary}`);
console.log(`  Hedef:  ${target}`);

copyFileSync(nodeBinary, target);

// Çalıştırılabilir izin
if (platform !== 'win32') {
  execSync(`chmod +x "${target}"`);
}

const sizeMB = (statSync(target).size / 1024 / 1024).toFixed(1);
console.log(`✓ Node binary hazır (${sizeMB} MB)`);
