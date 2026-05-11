/**
 * HTTP API + WebSocket endpoint'leri
 *
 * Auth modeli:
 *   - Localhost (Mac webview, Tauri, dev'de Nuxt) → her zaman güvenilir, auth bypass
 *   - LAN (telefonlar) → Authorization: Bearer <token> şart
 *   - Public endpoint'ler (auth gerekmez): /healthz, /api/setup/status, /api/auth/pair
 *   - Localhost-only endpoint'ler: /api/setup/test, /api/setup/save, /api/auth/pair-code, /api/auth/devices
 *
 * Setup wizard endpoint'leri:
 *   GET  /api/setup/status     → kurulu mu, hangi URL/username (şifre yok)
 *   POST /api/setup/test       → verilen credentials ile login dener (LOCALHOST-ONLY)
 *   POST /api/setup/save       → bilgileri kaydet, polling başlat (LOCALHOST-ONLY)
 *
 * Auth endpoint'leri:
 *   GET  /api/auth/pair-code   → aktif pair-code (LOCALHOST-ONLY, Mac UI'da gösterilir)
 *   POST /api/auth/pair        → pair-code doğrula, device token üret
 *   GET  /api/auth/devices     → kayıtlı token sayısı (LOCALHOST-ONLY)
 *   POST /api/auth/revoke-all  → tüm token'ları iptal (LOCALHOST-ONLY)
 *
 * Veri endpoint'leri (config + token gerekir):
 *   GET  /api/snapshot
 *   GET  /api/individuals/:uuid
 *   GET  /api/individuals/:uuid/activities
 *   GET  /api/photos/*
 *
 * WebSocket (token query param ile):
 *   GET  /ws?token=<device-token>
 *
 * Health:
 *   GET  /healthz  (public)
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { networkInterfaces } from 'node:os';
import type { InnovaBryAdapter } from '../adapters/innova.js';
import type { CacheService } from '../services/cache.js';
import type { PresenceService } from '../services/presence.js';
import type { PollingService, NewActivityEvent } from '../services/polling.js';
import type { ConfigService } from '../services/config.js';
import type { AuthService } from '../services/auth.js';

export interface RouteDeps {
  adapter: InnovaBryAdapter;
  cache: CacheService;
  presence: PresenceService;
  polling: PollingService;
  configService: ConfigService;
  authService: AuthService;
  // Config kaydedilince çağrılır — server.ts'in polling'i başlatması için
  onConfigured: () => void;
}

/**
 * Localhost'tan mı geliyor? Mac webview, Tauri, dev'de Nuxt — hepsi 127.0.0.1 / ::1.
 */
function isLocalhost(req: FastifyRequest): boolean {
  const ip = req.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/**
 * Token'ı Authorization header'dan ya da query param'dan al.
 * Query param fallback: <img src> gibi auth header ekleyemeyen request'ler için.
 */
function extractToken(req: FastifyRequest): string | undefined {
  const auth = req.headers.authorization ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  const qToken = (req.query as any)?.token;
  if (typeof qToken === 'string' && qToken.length > 0) return qToken;
  return undefined;
}

/**
 * Public path'ler: hiç auth check yapılmaz.
 * Diğer path'ler için: localhost ise geçer, değilse Bearer token gerekir.
 */
const PUBLIC_PATHS = new Set<string>([
  '/healthz',
  '/api/setup/status',
  '/api/auth/pair',
]);

const LOCALHOST_ONLY_PATHS = new Set<string>([
  '/api/setup/test',
  '/api/setup/save',
  '/api/auth/pair-code',
  '/api/auth/rotate-pair-code',
  '/api/auth/devices',
  '/api/auth/revoke-all',
  '/api/network/info',
]);

export async function registerRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { adapter, cache, presence, polling, configService, authService, onConfigured } = deps;

  // ─── Auth middleware (preHandler) ─────────────────────────
  // Sadece /api/ ve /ws path'leri korumalı.
  // Static dosyalar (HTML/JS/CSS/images, /_nuxt/*, /pair sayfası vb.)
  // auth'suz erişilebilir olmalı — telefon önce uygulamayı yüklesin,
  // sonra middleware tarafında /pair'e yönlensin.
  app.addHook('preHandler', async (req, reply) => {
    const url = req.url.split('?')[0];

    // WebSocket upgrade — preHandler'da socket henüz upgrade olmadan yakalanır.
    // /ws için ayrı handle ediyoruz (aşağıda websocket route içinde).
    if (url === '/ws') return;

    // /api/ olmayan her path static asset → auth gerekmez
    // (frontend HTML/JS, /pair sayfası, /icon.svg, /_nuxt/..., /sw.js, manifest, vb.)
    if (!url.startsWith('/api/')) return;

    if (PUBLIC_PATHS.has(url)) return;

    const local = isLocalhost(req);
    if (LOCALHOST_ONLY_PATHS.has(url)) {
      if (!local) {
        reply.code(403).send({ error: 'Bu işlem yalnızca cihazın kendisinden yapılabilir' });
        return;
      }
      return;
    }

    // Standart korumalı endpoint: localhost geçer, değilse token şart
    if (local) return;
    const token = extractToken(req);
    if (!authService.isValidToken(token)) {
      reply.code(401).send({ error: 'Cihaz eşleştirmesi gerekli', needsPair: true });
      return;
    }
  });

  // Config gerektiren endpoint'ler için guard
  const requireConfig = (reply: any): boolean => {
    if (!configService.isConfigured()) {
      reply.code(503).send({
        error: 'BRY yapılandırılmamış',
        needsSetup: true,
      });
      return false;
    }
    return true;
  };

  // ─── Health ───────────────────────────────────────────────
  app.get('/healthz', async () => ({
    ok: true,
    time: new Date().toISOString(),
    configured: configService.isConfigured(),
  }));

  // ─── Setup wizard ─────────────────────────────────────────
  app.get('/api/setup/status', async () => ({
    configured: configService.isConfigured(),
    info: configService.publicInfo(),
  }));

  app.post<{
    Body: { baseUrl: string; username: string; password: string };
  }>('/api/setup/test', async (req, reply) => {
    const { baseUrl, username, password } = req.body || ({} as any);
    if (!baseUrl || !username || !password) {
      return reply.code(400).send({ ok: false, error: 'Tüm alanlar gerekli' });
    }
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    return adapter.testCredentials({ baseUrl: cleanUrl, username, password });
  });

  app.post<{
    Body: { baseUrl: string; username: string; password: string };
  }>('/api/setup/save', async (req, reply) => {
    const { baseUrl, username, password } = req.body || ({} as any);
    if (!baseUrl || !username || !password) {
      return reply.code(400).send({ error: 'Tüm alanlar gerekli' });
    }
    const cleanUrl = baseUrl.replace(/\/+$/, '');

    // Önce test et — yanlış bilgi kaydetmeyelim
    const test = await adapter.testCredentials({ baseUrl: cleanUrl, username, password });
    if (!test.ok) {
      return reply.code(400).send({ error: test.error || 'Kimlik doğrulanamadı' });
    }

    await configService.save({ baseUrl: cleanUrl, username, password });
    onConfigured();

    return { ok: true, info: configService.publicInfo() };
  });

  // ─── Auth (pair-code) ─────────────────────────────────────
  app.get('/api/auth/pair-code', async () => ({
    code: authService.getCurrentPairCode(),
    expiresAt: new Date(authService.getPairCodeExpiry()).toISOString(),
  }));

  app.post<{ Body: { code: string } }>('/api/auth/pair', async (req, reply) => {
    const code = (req.body?.code ?? '').toString();
    if (!code) {
      return reply.code(400).send({ error: 'Kod gerekli' });
    }
    const token = authService.verifyCodeAndIssueToken(code);
    if (!token) {
      return reply.code(401).send({ error: 'Kod geçersiz veya süresi dolmuş' });
    }
    return { ok: true, token };
  });

  app.post('/api/auth/rotate-pair-code', async () => ({
    code: authService.forceRotateCode(),
    expiresAt: new Date(authService.getPairCodeExpiry()).toISOString(),
  }));

  // ─── Network info (localhost-only) ─────────────────────────
  // Telefondan bağlanmak için kullanıcıya gösterilecek Mac/PC LAN IP'si.
  // Birden çok arayüz olabilir (Wi-Fi en0, ethernet en1, vb.) — hepsi döner,
  // UI ilk geçerli olanı belirgin gösterir.
  app.get('/api/network/info', async () => {
    const port = Number(process.env.PORT ?? 8787);
    const ifaces = networkInterfaces();
    const urls: string[] = [];
    for (const name of Object.keys(ifaces)) {
      const list = ifaces[name];
      if (!list) continue;
      for (const net of list) {
        if (net.family === 'IPv4' && !net.internal) {
          urls.push(`http://${net.address}:${port}`);
        }
      }
    }
    return { port, urls };
  });

  app.get('/api/auth/devices', async () => ({
    count: authService.tokenCount(),
  }));

  app.post('/api/auth/revoke-all', async () => {
    await authService.revokeAll();
    return { ok: true };
  });

  // ─── Anasayfa snapshot ────────────────────────────────────
  app.get('/api/snapshot', async (req, reply) => {
    if (!requireConfig(reply)) return;
    try {
      const data = await presence.getSnapshot();
      reply.header('Cache-Control', 'no-store');
      return data;
    } catch (err) {
      app.log.error({ err }, 'snapshot failed');
      return reply.code(502).send({ error: 'INNOVA bağlantısı kurulamadı' });
    }
  });

  // ─── Birey detay ──────────────────────────────────────────
  app.get<{ Params: { uuid: string } }>('/api/individuals/:uuid', async (req, reply) => {
    if (!requireConfig(reply)) return;
    try {
      const individual = await cache.getIndividual(req.params.uuid);
      return individual;
    } catch (err) {
      return reply.code(404).send({ error: 'Birey bulunamadı' });
    }
  });

  app.get<{ Params: { uuid: string } }>(
    '/api/individuals/:uuid/activities',
    async (req, reply) => {
      if (!requireConfig(reply)) return;
      try {
        const activities = await cache.getActivities(req.params.uuid);
        const individual = await cache.getIndividual(req.params.uuid).catch(() => null);
        return { individual, activities };
      } catch (err) {
        return reply.code(404).send({ error: 'Birey bulunamadı' });
      }
    },
  );

  // ─── ROI Foto Proxy ───────────────────────────────────────
  app.get<{ Params: { '*': string } }>('/api/photos/*', async (req, reply) => {
    if (!requireConfig(reply)) return;
    const path = req.params['*'];
    if (!/^[a-z0-9-]+_roi\/\d{4}\/\d{1,2}\/\d{1,2}\/[a-f0-9-]+\.jpg$/i.test(path)) {
      return reply.code(400).send({ error: 'Geçersiz fotoğraf yolu' });
    }
    // Foto portu BRY'nin baseUrl'inden türetilir (port 8000)
    const innovaBaseUrl = adapter.getBaseUrl();
    const photoBase = innovaBaseUrl.replace(/:\d+$/, ':8000');
    const upstream = `${photoBase}/media/${path}`;

    try {
      const upstreamRes = await fetch(upstream);
      if (!upstreamRes.ok || !upstreamRes.body) {
        return reply.code(upstreamRes.status).send();
      }
      reply.header('Content-Type', upstreamRes.headers.get('content-type') ?? 'image/jpeg');
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(Buffer.from(await upstreamRes.arrayBuffer()));
    } catch (err) {
      app.log.error({ err, upstream }, 'photo proxy failed');
      return reply.code(502).send();
    }
  });

  // ─── WebSocket ────────────────────────────────────────────
  // WS auth: localhost geçer, LAN'dan geliyorsa ?token=<device-token> şart.
  app.get<{ Querystring: { token?: string } }>(
    '/ws',
    { websocket: true },
    (socket, req) => {
      const local = isLocalhost(req);
      if (!local) {
        const token = req.query?.token;
        if (!authService.isValidToken(token)) {
          socket.close(1008, 'unauthorized');
          return;
        }
      }

      app.log.info('ws client connected');

      const onNew = (e: NewActivityEvent) => {
        socket.send(JSON.stringify({ type: 'newActivity', payload: e }));
      };
      const onSnapshot = () => {
        socket.send(JSON.stringify({ type: 'snapshotReady' }));
      };

      polling.on('newActivity', onNew);
      polling.on('snapshotReady', onSnapshot);

      socket.on('close', () => {
        polling.off('newActivity', onNew);
        polling.off('snapshotReady', onSnapshot);
        app.log.info('ws client disconnected');
      });

      socket.send(JSON.stringify({ type: 'hello', time: new Date().toISOString() }));
    },
  );
}
