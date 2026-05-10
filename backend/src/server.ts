/**
 * Luden BKDS Mobile — Backend entry point
 *
 * Akış:
 *  1. ConfigService yükler (.data/config.json veya .env fallback)
 *  2. Config varsa adapter ayağa kalkar, polling başlar
 *  3. Config yoksa sadece HTTP sunucu açılır, /api/setup endpoint'leri çalışır
 *  4. Setup wizard'dan başarılı kayıt sonrası polling otomatik başlar
 */

import 'dotenv/config';
import { join } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

import { InnovaBryAdapter } from './adapters/innova.js';
import { CacheService } from './services/cache.js';
import { PresenceService } from './services/presence.js';
import { PollingService } from './services/polling.js';
import { ConfigService } from './services/config.js';
import { AuthService } from './services/auth.js';
import { registerRoutes } from './routes/index.js';

// ─── Config ─────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 8787);
// Veri klasörü:
// - Tauri içinde: LUDEN_DATA_DIR env ile gelir (Rust'ın app_data_dir'i)
//   örn: ~/Library/Application Support/com.ludenlab.bkds/
// - Dev'de: cwd/.data (geliştirme rahatlığı için)
// .app'in içine yazamayız (Gatekeeper engelliyor), kullanıcı klasörüne yazmak zorundayız
const DATA_DIR = process.env.LUDEN_DATA_DIR || join(process.cwd(), '.data');

// ─── Bootstrap ──────────────────────────────────────────────
// pino-pretty transport bundle edilemediği için sadece dev modda kullanıyoruz.
// LUDEN_FRONTEND_DIST varsa Tauri içindeyiz, JSON log yeterli.
const isBundled = !!process.env.LUDEN_FRONTEND_DIST;

// Tauri içindeysek parent process'i (Tauri Rust kabuk) izle.
// Eğer parent öldüyse (Force Quit dahil), backend de kapansın ki port serbest kalsın.
//
// macOS/Linux'ta parent process ölünce child'ın ppid'i 1 (init/launchd) olur — orphan!
// Bu yüzden başlangıç ppid'ini saklayıp DEĞİŞMESİNİ izliyoruz.
// Sadece "parent yaşıyor mu" değil "parent hâlâ ESKİ parent mı" sorusu.
if (isBundled) {
  const originalParentPid = process.ppid;
  console.log(`[backend] Parent watch başladı, parent pid=${originalParentPid}`);

  setInterval(() => {
    const currentPpid = process.ppid;

    // Parent değişti mi? (Eski parent öldü, init bizi adopted etti)
    if (currentPpid !== originalParentPid) {
      console.log(
        `[backend] Parent değişti: ${originalParentPid} → ${currentPpid}. Eski parent öldü, kapanıyorum.`,
      );
      process.exit(0);
    }

    // Yedek kontrol: original parent hâlâ var mı?
    try {
      process.kill(originalParentPid, 0);
    } catch {
      console.log(`[backend] Parent (pid=${originalParentPid}) yok, kapanıyorum.`);
      process.exit(0);
    }
  }, 1000); // 1 saniyede bir kontrol — daha hızlı reaksiyon
}

const app = Fastify({
  logger: isBundled
    ? { level: 'info' }
    : {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      },
});

await app.register(cors, { origin: true, credentials: true });
await app.register(websocket);

// Tauri ortamında: frontend statik dosyalarını backend'in kendisinden servis et.
// Bu sayede tek port'ta hem API hem UI olur.
// Dev'de bu env değişkeni boş — Nuxt dev server kullanılır (port 3000).
const frontendDistPath = process.env.LUDEN_FRONTEND_DIST;
if (frontendDistPath) {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Debug — neyin nerede olduğunu logla
  console.log(`→ LUDEN_FRONTEND_DIST: ${frontendDistPath}`);
  console.log(`→ Klasör var mı: ${fs.existsSync(frontendDistPath)}`);
  if (fs.existsSync(frontendDistPath)) {
    const items = fs.readdirSync(frontendDistPath);
    console.log(`→ İçerik: ${items.join(', ')}`);
    const nuxtDir = path.join(frontendDistPath, '_nuxt');
    if (fs.existsSync(nuxtDir)) {
      const nuxtFiles = fs.readdirSync(nuxtDir).slice(0, 5);
      console.log(`→ _nuxt örnek dosyalar: ${nuxtFiles.join(', ')}`);
    } else {
      console.log(`✗ _nuxt klasörü YOK: ${nuxtDir}`);
    }
  }

  const staticPlugin = await import('@fastify/static');
  await app.register(staticPlugin.default, {
    root: frontendDistPath,
    prefix: '/',
    decorateReply: true,
  });

  // SPA fallback — sadece "sayfa yolları" için (uzantısız, /api olmayan)
  app.setNotFoundHandler(async (req, reply) => {
    if (
      req.url.startsWith('/api/') ||
      req.url.startsWith('/ws') ||
      req.url === '/healthz'
    ) {
      return reply.code(404).send({ error: 'Not found' });
    }
    const pathname = req.url.split('?')[0];
    const lastSegment = pathname.split('/').pop() || '';
    if (lastSegment.includes('.')) {
      console.log(`✗ Static dosya bulunamadı: ${req.url}`);
      return reply.code(404).send({ error: 'File not found' });
    }
    return reply.sendFile('index.html');
  });
  console.log(`✓ Frontend statik servisleniyor: ${frontendDistPath}`);
}

// ConfigService: BRY bilgilerini diskten okur veya .env fallback
const configService = new ConfigService(join(DATA_DIR, 'config.json'));
const initialConfig = await configService.load();

// AuthService: LAN auth (pair-code + device tokens). Localhost bypass eder.
const authService = new AuthService(join(DATA_DIR, 'devices.json'));
await authService.load();

// Adapter — config olmasa bile yaratılabilir, sadece kullanıma hazır olmaz
const adapter = new InnovaBryAdapter({
  baseUrl: initialConfig?.baseUrl ?? '',
  username: initialConfig?.username ?? '',
  password: initialConfig?.password ?? '',
});
const cache = new CacheService(adapter);
const presence = new PresenceService(adapter, cache);
const polling = new PollingService(adapter, cache);

polling.on('error', (err) => app.log.warn({ err: err?.message }, 'polling error'));
polling.on('newActivity', (e) => {
  // Bildirim WebSocket üzerinden gönderiliyor (routes/index.ts).
  // Burada sadece log; push notification yok — telefon kurum WiFi'sinde
  // Notification API ile yerel olarak gösteriyor.
  const name = e.individual?.full_name ?? e.activity.individual_uuid.slice(0, 8);
  app.log.info(
    `🔔 ${e.activity.activity_type === 'entry' ? '→' : '←'} ${name} @ ${e.activity.activity_time}`,
  );
});

// Setup wizard'ın kullanması için yardımcı: config kaydedilince polling başlat
const onConfigured = () => {
  const cfg = configService.get();
  if (!cfg) return;
  adapter.updateConfig({
    baseUrl: cfg.baseUrl,
    username: cfg.username,
    password: cfg.password,
  });
  // Cache'i temizle (eski kuruma ait veriler varsa gitsin)
  cache.invalidateActivities();
  if (!polling.isRunning()) {
    polling.start();
    app.log.info('✓ Polling başladı (yeni config)');
  }
};

await registerRoutes(app, {
  adapter,
  cache,
  presence,
  polling,
  configService,
  authService,
  onConfigured,
});

// ─── Start ──────────────────────────────────────────────────
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  app.log.info(`✓ Hazır. Telefondan: http://<bilgisayarınızın-IP>:${PORT}/`);
  app.log.info(`📲 Bildirim: yerel ağ (Notification API)`);
  app.log.info(`🔐 Şifre saklama: ${configService.describeSecretStore()}`);
  app.log.info(`🔑 LAN auth: pair-code (kayıtlı cihaz: ${authService.tokenCount()})`);

  if (initialConfig) {
    polling.start();
    app.log.info(`✓ BRY yapılandırılmış: ${initialConfig.baseUrl}`);
    app.log.info(`✓ Polling başladı`);
  } else {
    app.log.warn('⚠ BRY yapılandırılmamış — kullanıcı setup yapana kadar polling beklemede');
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async () => {
  app.log.info('Kapatılıyor...');
  polling.stop();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
