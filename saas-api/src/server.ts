/**
 * BRY Takip SaaS API — Fastify entry point.
 *
 * Hostinger Business Web Hosting'de **Node.js Apps** olarak deploy edilir
 * (2026 sonrası akış — eski "Advanced → Node.js" akışı kaldırıldı).
 *
 * Akış:
 *  hPanel → Websites → Add Website → Node.js Apps
 *    - Domain: brytakip.com
 *    - Source: GitHub repo (recepkucuk1/luden-bkds)
 *    - Root directory: saas-api
 *    - Build command: npm install && npm run build
 *    - Start command: npm start  (→ node dist/server.js)
 *    - Node version: 20.x
 *
 * Tek domain ile her şey serve edilir:
 *    GET  /                  → public/index.html (marketing)
 *    GET  /admin.html        → public/admin.html (Recep'in paneli)
 *    POST /api/signup        → SaaS signup
 *    POST /api/license/*     → lisans işlemleri
 *    GET  /api/admin/*       → admin (Bearer token)
 *    GET  /healthz           → uptime
 *
 * Environment variables (Hostinger Node.js Apps → Environment):
 *    DATABASE_URL            mysql://USER:PASS@HOST:3306/DBNAME
 *    ADMIN_TOKEN             openssl rand -hex 32
 *    PORT                    Hostinger otomatik atar
 *    NODE_ENV                production
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import { prisma } from './lib/prisma.js';

import signupRoute from './routes/signup.js';
import licenseRoutes from './routes/license.js';
import adminRoutes from './routes/admin.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

// dist/server.js çalışırken __dirname → saas-api/dist
// public klasörü → saas-api/public (repo root'tan kopyalanır)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const app = Fastify({
  logger: isProd
    ? { level: 'info' }
    : {
        level: 'info',
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      },
  trustProxy: true, // Hostinger reverse proxy arkasında çalışır
});

// CORS — artık aynı origin (marketing + API tek domain), Tauri app dışarıdan ping atabilir
await app.register(cors, {
  origin: true, // her origin'e izin (Tauri desktop app file://, tauri://localhost vb.)
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
});

// Rate limit — public endpoint'leri brute-force/spam'e karşı korur. Global makul
// bir taban; kritik route'lar (license verify, signup) kendi config'iyle daha sıkı.
// trustProxy açık olduğu için req.ip Hostinger proxy arkasında gerçek istemci IP'si.
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
});

// Static — marketing/index.html, admin.html, asset'ler
await app.register(staticPlugin, {
  root: PUBLIC_DIR,
  prefix: '/',
  index: ['index.html'],
  decorateReply: true,
});

// Health check (Hostinger uptime monitör için)
app.get('/healthz', async () => ({
  ok: true,
  time: new Date().toISOString(),
  uptime: Math.floor(process.uptime()),
}));

// API routes
await app.register(signupRoute);
await app.register(licenseRoutes);
await app.register(adminRoutes);

// Graceful shutdown
const shutdown = async () => {
  app.log.info('Kapatılıyor...');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`✓ BRY Takip hazır — port ${PORT}, public=${PUBLIC_DIR}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
