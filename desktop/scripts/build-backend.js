/**
 * Backend'i tek bir Node.js JS dosyasına bundle eder.
 *
 * Output: desktop/src-tauri/binaries/server-{target-triple}
 *         (Tauri sidecar'lar target-triple suffix'i bekler)
 *
 * Backend ESM olarak yazıldığı için bundle'ı da ESM yapıyoruz.
 * Tauri sidecar olarak `node` ile çalıştırdığında shebang yönlendirir.
 */

import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const backendDir = resolve(root, '..', 'backend');
const outDir = resolve(root, 'src-tauri', 'binaries');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Tauri sidecar Rust target triple ile suffix bekler
const targetTriple = execSync('rustc -vV').toString()
  .split('\n')
  .find((l) => l.startsWith('host:'))
  ?.split(':')[1]
  .trim();

if (!targetTriple) {
  console.error('✗ Rust target triple bulunamadı. Rust kurulu mu?');
  process.exit(1);
}

const outFile = resolve(outDir, 'server.mjs');
const targetFile = resolve(outDir, `server-${targetTriple}.mjs`);

console.log('→ Backend bundle başlıyor...');
console.log(`  Kaynak: ${backendDir}/src/server.ts`);
console.log(`  Hedef:  ${outFile}`);
console.log(`  Sidecar: ${targetFile}`);

await build({
  entryPoints: [resolve(backendDir, 'src/server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: outFile,
  loader: { '.json': 'json' },
  // ESM bundle'da gerekli __dirname/__filename polyfill için
  banner: {
    js: `#!/usr/bin/env node
// Luden BKDS Backend bundle (auto-generated)
import { createRequire as __luden_createRequire } from 'node:module';
import { fileURLToPath as __luden_fileURLToPath } from 'node:url';
import { dirname as __luden_dirname } from 'node:path';
const require = __luden_createRequire(import.meta.url);
const __filename = __luden_fileURLToPath(import.meta.url);
const __dirname = __luden_dirname(__filename);
`,
  },
  sourcemap: false,
  minify: false,
  logLevel: 'info',
});

// Sidecar olarak çalıştırılması için target-triple isimli kopya
copyFileSync(outFile, targetFile);

// Çalıştırılabilir izin (Mac/Linux için)
try {
  execSync(`chmod +x "${targetFile}"`);
} catch {
  // Windows'da chmod yok, sorun değil
}

console.log('✓ Backend bundle hazır');
console.log(`✓ Sidecar: server-${targetTriple}.mjs`);
