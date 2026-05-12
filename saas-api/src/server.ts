/**
 * BRY Takip SaaS API — Fastify entry point.
 *
 * Hostinger Business Node.js'de host edilir:
 *  - hPanel → Advanced → Node.js → Create app
 *  - Application root: saas-api/
 *  - Application URL: api.brytakip.com
 *  - Application startup file: dist/server.js
 *  - Node version: 20.x
 *
 * Build pipeline:
 *  npm install         → prisma generate (postinstall)
 *  npm run build       → tsc derler dist/'e
 *  npm start           → node dist/server.js
 *
 * Environment variables (Hostinger Node Manager → Env Variables):
 *  DATABASE_URL        Supabase pooler (port 6543)
 *  DIRECT_URL          Supabase direct (port 5432)
 *  ADMIN_TOKEN         openssl rand -hex 32 ile üretilmiş
 *  PORT                Hostinger otomatik set'ler
 *  NODE_ENV            production
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from './lib/prisma.js';

import signupRoute from './routes/signup.js';
import licenseRoutes from './routes/license.js';
import adminRoutes from './routes/admin.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

const isProd = process.env.NODE_ENV === 'production';

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

// CORS — production'da brytakip.com'a, dev'de localhost'a izin
await app.register(cors, {
  origin: isProd
    ? ['https://brytakip.com', 'https://www.brytakip.com']
    : true, // dev'de hepsi
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
});

// Health check (Hostinger uptime monitör için)
app.get('/healthz', async () => ({
  ok: true,
  time: new Date().toISOString(),
  uptime: Math.floor(process.uptime()),
}));

// Routes
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
  app.log.info(`✓ BRY Takip SaaS API hazır — port ${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
