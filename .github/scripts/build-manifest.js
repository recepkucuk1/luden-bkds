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

const platforms = {};

// macOS Apple Silicon
const macDir = path.join(artifactsDir, 'macos-build');
if (fs.existsSync(macDir)) {
  const files = fs.readdirSync(macDir);
  const tarGz = files.find((f) => f.endsWith('.app.tar.gz'));
  const sig = files.find((f) => f.endsWith('.app.tar.gz.sig'));
  if (tarGz && sig) {
    platforms['darwin-aarch64'] = {
      signature: fs.readFileSync(path.join(macDir, sig), 'utf8').trim(),
      url: `${releaseUrlBase}/${encodeURIComponent(tarGz)}`,
    };
  } else {
    console.error(`uyarı: macOS .app.tar.gz veya .sig bulunamadı (${files.join(', ')})`);
  }
}

// Windows x64 — NSIS setup.exe (auto-updater için tercih edilen format)
const winDir = path.join(artifactsDir, 'windows-build');
if (fs.existsSync(winDir)) {
  const files = fs.readdirSync(winDir);
  const exe = files.find((f) => f.endsWith('-setup.exe'));
  const sig = files.find((f) => f.endsWith('-setup.exe.sig'));
  if (exe && sig) {
    platforms['windows-x86_64'] = {
      signature: fs.readFileSync(path.join(winDir, sig), 'utf8').trim(),
      url: `${releaseUrlBase}/${encodeURIComponent(exe)}`,
    };
  } else {
    console.error(`uyarı: Windows -setup.exe veya .sig bulunamadı (${files.join(', ')})`);
  }
}

const manifest = {
  version,
  notes: `Sürüm ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
};

process.stdout.write(JSON.stringify(manifest, null, 2));
