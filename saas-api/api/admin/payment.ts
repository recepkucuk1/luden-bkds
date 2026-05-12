/**
 * POST /api/admin/payment (admin)
 *
 * Recep manuel ödeme kaydı ekler — havale geldiğinde kullanılır.
 *
 * Body: { kurumId, amount, method, paidAt?, invoiceNo?, notes? }
 * Response 200: { ok: true, payment: {...} }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin, handleOptions } from '../../lib/auth.js';

const VALID_METHODS = ['HAVALE', 'IYZICO', 'MANUEL', 'OTHER'] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST gerekli' });
  }
  if (!requireAdmin(req, res)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const kurumId = String(body.kurumId ?? '').trim();
  const amount = Number(body.amount);
  const methodRaw = String(body.method ?? 'HAVALE').toUpperCase();
  const method = (VALID_METHODS as readonly string[]).includes(methodRaw)
    ? (methodRaw as typeof VALID_METHODS[number])
    : null;
  const paidAt = body.paidAt ? new Date(String(body.paidAt)) : new Date();
  const invoiceNo = body.invoiceNo ? String(body.invoiceNo) : null;
  const notes = body.notes ? String(body.notes) : null;

  if (!kurumId) return res.status(400).json({ error: 'kurumId gerekli' });
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount > 0 olmalı' });
  }
  if (!method) {
    return res.status(400).json({ error: `method: ${VALID_METHODS.join('/')}` });
  }

  try {
    const kurum = await prisma.kurum.findUnique({ where: { id: kurumId } });
    if (!kurum) return res.status(404).json({ error: 'Kurum bulunamadı' });

    const payment = await prisma.payment.create({
      data: {
        kurumId,
        amount,
        method,
        status: 'COMPLETED', // manuel kayıt = doğrudan completed
        paidAt,
        invoiceNo,
        notes,
      },
    });

    return res.status(200).json({ ok: true, payment });
  } catch (err: any) {
    console.error('admin/payment error:', err);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
