/**
 * GET /api/admin/kurums (admin)
 *
 * Recep'in admin panelinden kurum listesi. Filter + arama destekli.
 *
 * Query: ?q=arama&plan=LITE|STANDART|PRO&limit=50&offset=0
 * Response 200: { total, kurums: [{ id, ad, yetkili, email, telefon, sehir, plan, createdAt, licenseCount, lastPayment }] }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin, handleOptions } from '../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET gerekli' });
  }
  if (!requireAdmin(req, res)) return;

  const q = String(req.query.q ?? '').trim();
  const plan = String(req.query.plan ?? '').toUpperCase();
  const limit = Math.min(parseInt(String(req.query.limit ?? '50')) || 50, 200);
  const offset = Math.max(parseInt(String(req.query.offset ?? '0')) || 0, 0);

  // Filter where clause
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

    return res.status(200).json({
      total,
      limit,
      offset,
      kurums,
    });
  } catch (err: any) {
    console.error('admin/kurums error:', err);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
