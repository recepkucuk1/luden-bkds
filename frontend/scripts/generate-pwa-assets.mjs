// PWA varlık üretici — tek seferlik (commit edilmiş ikon klasörü)
//
// Kaynak: ../desktop/src-tauri/icons/icon-1024.png  (1024x1024 PNG, transparan arka plan)
// Çıkış : ./public/icons/  (ikon seti) + ./public/splash/  (iOS splash görselleri)
//
// Üretilenler:
//   icons/
//     icon-192.png             (manifest "any" purpose)
//     icon-512.png             (manifest "any" purpose)
//     icon-maskable-192.png    (Android adaptive — safe area %80)
//     icon-maskable-512.png    (Android adaptive)
//     apple-touch-icon-180.png (iOS home screen — opak arka plan, brand renk)
//   splash/
//     apple-splash-<W>x<H>.png  (yaygın iPhone/iPad çözünürlükleri, portrait)
//
// Çağrı: node scripts/generate-pwa-assets.mjs
// Bu script idempotent — istediğin zaman tekrar koşturabilirsin.

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, '..', 'desktop', 'src-tauri', 'icons', 'icon-1024.png');
const ICONS_OUT = join(ROOT, 'public', 'icons');
const SPLASH_OUT = join(ROOT, 'public', 'splash');

// Brand renkleri — nuxt.config theme_color ile aynı kalmalı
const BRAND_LIGHT = '#0f6e56';
const BRAND_DARK = '#0a4734';

await mkdir(ICONS_OUT, { recursive: true });
await mkdir(SPLASH_OUT, { recursive: true });

// ─── ICONS ──────────────────────────────────────────────────────────────────

// "any" purpose — transparan, tam kareye sığar
async function genAnyIcon(size) {
  const out = join(ICONS_OUT, `icon-${size}.png`);
  await sharp(SRC).resize(size, size, { fit: 'contain' }).png().toFile(out);
  console.log(`  ✓ ${out.replace(ROOT + '/', '')}`);
}

// "maskable" purpose — Android adaptive icon spec'i: dış %20 kırpılabilir.
// Ikonu %80 alana sığdır, geri kalanı brand renk dolgusu.
async function genMaskableIcon(size) {
  const out = join(ICONS_OUT, `icon-maskable-${size}.png`);
  const inner = Math.round(size * 0.8);
  const offset = Math.round((size - inner) / 2);
  const innerBuf = await sharp(SRC).resize(inner, inner, { fit: 'contain' }).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND_LIGHT },
  })
    .composite([{ input: innerBuf, top: offset, left: offset }])
    .png()
    .toFile(out);
  console.log(`  ✓ ${out.replace(ROOT + '/', '')}`);
}

// Apple touch icon — iOS SVG kabul etmez, transparency'i siyaha çevirir.
// Brand renkli arka plan üstüne ikon. 180×180 standart.
async function genAppleTouchIcon() {
  const size = 180;
  const out = join(ICONS_OUT, `apple-touch-icon-${size}.png`);
  const inner = Math.round(size * 0.85);
  const offset = Math.round((size - inner) / 2);
  const innerBuf = await sharp(SRC).resize(inner, inner, { fit: 'contain' }).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BRAND_LIGHT },
  })
    .composite([{ input: innerBuf, top: offset, left: offset }])
    .png()
    .toFile(out);
  console.log(`  ✓ ${out.replace(ROOT + '/', '')}`);
}

console.log('İkonlar üretiliyor:');
await genAnyIcon(192);
await genAnyIcon(512);
await genMaskableIcon(192);
await genMaskableIcon(512);
await genAppleTouchIcon();

// ─── SPLASH ─────────────────────────────────────────────────────────────────
// iOS splash (apple-touch-startup-image) — modele göre tam çözünürlük gerekli.
// Yanlış boyut → iOS yok sayar, beyaz ekran.
// Liste: PWA Builder + Apple HIG referansları, mevcut piyasadaki cihaz kapsamı.
//
// Format: [width, height, "media query" — device-width/height + pixel-ratio + orientation]
// Sadece portrait — manifest orientation: portrait.

const SPLASH_TARGETS = [
  // iPhone 14 Pro Max — 6.7" Dynamic Island
  [1290, 2796, '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)'],
  // iPhone 14 Pro — 6.1" Dynamic Island
  [1179, 2556, '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)'],
  // iPhone 14 Plus / 13 Pro Max / 12 Pro Max — 6.7"
  [1284, 2778, '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)'],
  // iPhone 14 / 13 / 13 Pro / 12 / 12 Pro — 6.1"
  [1170, 2532, '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)'],
  // iPhone 13 mini / 12 mini — 5.4"
  [1080, 2340, '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)'],
  // iPhone 11 Pro Max / XS Max — 6.5"
  [1242, 2688, '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)'],
  // iPhone 11 / XR — 6.1"
  [828, 1792, '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)'],
  // iPhone 11 Pro / XS / X — 5.8"
  [1125, 2436, '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)'],
  // iPhone 8 Plus / 7 Plus / 6+ — 5.5"
  [1242, 2208, '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)'],
  // iPhone 8 / 7 / 6 / SE2 / SE3 — 4.7"
  [750, 1334, '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)'],
  // iPhone SE (1st gen) — 4"
  [640, 1136, '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)'],
  // iPad Pro 12.9"
  [2048, 2732, '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)'],
  // iPad Pro 11" / iPad Air
  [1668, 2388, '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)'],
  // iPad mini
  [1488, 2266, '(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2)'],
  // iPad 10.2"
  [1620, 2160, '(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2)'],
];

// Splash görsel layout'u: brand renk arka plan + merkeze ikon (genişliğin %30'u kadar).
async function genSplash(w, h) {
  const out = join(SPLASH_OUT, `apple-splash-${w}x${h}.png`);
  const iconSize = Math.round(Math.min(w, h) * 0.3);
  const iconBuf = await sharp(SRC).resize(iconSize, iconSize, { fit: 'contain' }).png().toBuffer();
  await sharp({
    create: { width: w, height: h, channels: 4, background: BRAND_LIGHT },
  })
    .composite([
      {
        input: iconBuf,
        top: Math.round((h - iconSize) / 2),
        left: Math.round((w - iconSize) / 2),
      },
    ])
    .png()
    .toFile(out);
  console.log(`  ✓ ${out.replace(ROOT + '/', '')}`);
}

console.log('\niOS splash görselleri:');
for (const [w, h] of SPLASH_TARGETS) {
  await genSplash(w, h);
}

// ─── HTML link tag jeneratörü ──────────────────────────────────────────────
// Konsola yapıştırılacak meta link bloğu — nuxt.config'e elle koyacağız.

const links = SPLASH_TARGETS.map(
  ([w, h, mq]) =>
    `        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-${w}x${h}.png', media: "${mq}" },`,
).join('\n');

console.log('\n--- nuxt.config head.link[] (kopyalanacak) ---');
console.log(links);

console.log('\nTamamlandı. nuxt.config.ts head.link[] bölümüne yukarıdaki satırları ekle.');
