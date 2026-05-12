/**
 * Admin endpoint'leri — Recep'in lead/payment yönetimi için.
 *
 * GET  /api/admin/kurums       — liste + filtre
 * POST /api/admin/payment      — manuel ödeme kaydı
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAdmin } from '../lib/auth.js';

const VALID_METHODS = ['HAVALE', 'IYZICO', 'MANUEL', 'OTHER'] as const;

interface KurumsQuery {
  q?: string;
  plan?: string;
  limit?: string;
  offset?: string;
}

interface PaymentBody {
  kurumId?: string;
  amount?: number;
  method?: string;
  paidAt?: string;
  invoiceNo?: string;
  notes?: string;
}

export default async function adminRoutes(app: FastifyInstance) {
  // ─── kurums listele ─────────────────────────────────────────
  app.get<{ Querystring: KurumsQuery }>('/api/admin/kurums', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const q = String(req.query.q ?? '').trim();
    const plan = String(req.query.plan ?? '').toUpperCase();
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')) || 50, 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0')) || 0, 0);

    const where: any = {};
    if (q) {
      where.OR = [
        { ad: { contains: q, mode: 'insensitive' } },
        { yetkili: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { telefon: { contains: q } },
        { sehir: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (['LITE', 'STANDART', 'PRO'].includes(plan)) {
      where.plan = plan;
    }

    try {
      const [total, kurums] = await Promise.all([
        prisma.kurum.count({ where }),
        prisma.kurum.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            _count: { select: { licenses: true, payments: true } },
            licenses: {
              select: { id: true, status: true, expiresAt: true, key: true },
              orderBy: { issuedAt: 'desc' },
              take: 1,
            },
            payments: {
              select: { id: true, amount: true, paidAt: true, status: true, method: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        }),
      ]);

      return { total, limit, offset, kurums };
    } catch (err: any) {
      req.log.error({ err }, 'admin kurums error');
      return reply.code(500).send({ error: 'Sunucu hatası' });
    }
  });

  // ─── payment ekle ───────────────────────────────────────────
  app.post<{ Body: PaymentBody }>('/api/admin/payment', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const body = req.body ?? {};
    const kurumId = String(body.kurumId ?? '').trim();
    const amount = Number(body.amount);
    const methodRaw = String(body.method ?? 'HAVALE').toUpperCase();
    const method = (VALID_METHODS as readonly string[]).includes(methodRaw)
      ? (methodRaw as (typeof VALID_METHODS)[number])
      : null;
    const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date();
    const invoiceNo = body.invoiceNo ? String(body.invoiceNo) : null;
    const notes = body.notes ? String(body.notes) : null;

    if (!kurumId) return reply.code(400).send({ error: 'kurumId gerekli' });
    if (!Number.isFinite(amount) || amount <= 0)
      return reply.code(400).send({ error: 'amount > 0 olmalı' });
    if (!method) return reply.code(400).send({ error: `method: ${VALID_METHODS.join('/')}` });

    try {
      const kurum = await prisma.kurum.findUnique({ where: { id: kurumId } });
      if (!kurum) return reply.code(404).send({ error: 'Kurum bulunamadı' });

      const payment = await prisma.payment.create({
        data: {
          kurumId,
          amount,
          method,
          status: 'COMPLETED',
          paidAt,
          invoiceNo,
          notes,
        },
      });

      return { ok: true, payment };
    } catch (err: any) {
      req.log.error({ err }, 'admin payment error');
      return reply.code(500).send({ error: 'Sunucu hatası' });
    }
  });
}
