#!/usr/bin/env node
/**
 * Tauri auto-updater manifest üretici.
 *
 * Build job'ları artifact'leri (`*.app.tar.gz`, `*-setup.exe`, `.sig` dosyaları)
 * yükledikten sonra release job'unda çalıştırılır:
 *
 *   node .github/scripts/build-manifest.js <artifacts-dir> <tag>
 *
 * Output: stdout'a Tauri updater format'ında JSON.
 *
 * Format referansı: https://v2.tauri.app/plugin/updater/
 *
 * Tauri client her açılışta tauri.conf.json'daki endpoint URL'sinden bu JSON'u
 * çeker; içindeki sürümü kendi sürümüyle karşılaştırır; daha yeniyse imzayı
 * doğrulayıp .app.tar.gz / setup.exe'yi indirip kurar.
 *
 * NOT: Tauri 2 bundle çıktıları platforma göre alt klasörlerde olur:
 *   macos-build/dmg/*.dmg
 *   macos-build/macos/*.app.tar.gz + .sig
 *   windows-build/msi/*.msi
 *   windows-build/nsis/*-setup.exe + .sig
 * Bu yüzden arama recursive yapılır.
 */

const fs = require('node:fs');
const path = require('node:path');

const [, , artifactsDir, tagRef] = process.argv;
if (!artifactsDir || !tagRef) {
  console.error('Usage: build-manifest.js <artifacts-dir> <tag>');
  process.exit(1);
}

const version = tagRef.replace(/^v/, ''); // "v0.2.0" → "0.2.0"
const repo = process.env.GITHUB_REPOSITORY; // "owner/repo"
if (!repo) {
  console.error('GITHUB_REPOSITORY env var gerekli');
  process.exit(1);
}

const releaseUrlBase = `https://github.com/${repo}/releases/download/${tagRef}`;

/**
 * GitHub release asset adlarında boşlukları noktaya çevirir (GitHub UI/CDN
 * davranışını taklit). Disk'teki dosya adı "BRY Takip.app.tar.gz" iken
 * release URL'inde "BRY.Takip.app.tar.gz" oluyor. Manifest URL'sinin
 * gerçek asset URL'siyle eşleşmesi için aynı dönüşümü uyguluyoruz.
 */
function ghAssetName(filename) {
  return filename.replace(/ /g, '.');
}

/** Recursive — dir altındaki tüm dosyaları (alt klasörler dahil) düz liste döndürür. */
function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...walkFiles(full));
    else if (item.isFile()) out.push(full);
  }
  return out;
}

const platforms = {};
const errors = [];

// macOS Apple Silicon
const macDir = path.join(artifactsDir, 'macos-build');
const macFiles = walkFiles(macDir);
const macTarGz = macFiles.find((f) => f.endsWith('.app.tar.gz'));
const macSig = macFiles.find((f) => f.endsWith('.app.tar.gz.sig'));
if (macTarGz && macSig) {
  platforms['darwin-aarch64'] = {
    signature: fs.readFileSync(macSig, 'utf8').trim(),
    url: `${releaseUrlBase}/${encodeURIComponent(ghAssetName(path.basename(macTarGz)))}`,
  };
} else if (macFiles.length > 0) {
  errors.push(
    `macOS build var ama imzalı updater çıktısı (.app.tar.gz + .sig) eksik: ${macFiles.map((f) => path.basename(f)).join(', ')}`,
  );
}

// Windows x64 — NSIS setup.exe (auto-updater için tercih edilen format)
const winDir = path.join(artifactsDir, 'windows-build');
const winFiles = walkFiles(winDir);
const winExe = winFiles.find((f) => f.endsWith('-setup.exe'));
const winSig = winFiles.find((f) => f.endsWith('-setup.exe.sig'));
if (winExe && winSig) {
  platforms['windows-x86_64'] = {
    signature: fs.readFileSync(winSig, 'utf8').trim(),
    url: `${releaseUrlBase}/${encodeURIComponent(ghAssetName(path.basename(winExe)))}`,
  };
} else if (winFiles.length > 0) {
  errors.push(
    `Windows build var ama imzalı updater çıktısı (-setup.exe + .sig) eksik: ${winFiles.map((f) => path.basename(f)).join(', ')}`,
  );
}

// İmza kapısı — imzasız ya da eksik bir release sessizce yayınlanmasın.
// (release job sadece v* tag'lerinde çalışır; normal CI/PR build'leri etkilenmez.)
if (errors.length > 0) {
  console.error('HATA: imzalı updater artifact doğrulaması başarısız:');
  for (const e of errors) console.error('  - ' + e);
  console.error(
    "Çözüm: TAURI_SIGNING_PRIVATE_KEY repo secret'ını ekleyin (bkz. RELEASE.md).",
  );
  process.exit(1);
}
if (Object.keys(platforms).length === 0) {
  console.error(
    'HATA: hiçbir platform için imzalı updater artifact bulunamadı — release iptal.',
  );
  process.exit(1);
}

const manifest = {
  version,
  notes: `Sürüm ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
};

process.stdout.write(JSON.stringify(manifest, null, 2));
