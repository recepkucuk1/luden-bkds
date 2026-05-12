/**
 * Prisma client singleton — Vercel serverless function'lar arasında
 * connection pool'unu paylaşır. Cold start'larda yeni instance oluşur,
 * warm'da cached olan kullanılır.
 *
 * Supabase pooler (PgBouncer) port 6543 üzerinden bağlanırız — connection
 * limit'lerini aşmadan ölçeklenir.
 */

import { PrismaClient } from '@prisma/client';

// Vercel'in HMR'sinde global referans tutarak çoklu instance'tan kaçın
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
