/**
 * Prisma client singleton — Fastify app boyunca tek instance.
 * Hostinger Node app'i tek process, tek bağlantı havuzu.
 *
 * Supabase pooler (PgBouncer) port 6543 üzerinden bağlanırız — connection
 * limit'lerini aşmadan ölçeklenir.
 */

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Graceful shutdown — Hostinger app restart'larda bağlantıları temiz kapat
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
