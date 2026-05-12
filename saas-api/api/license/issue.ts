/**
 * POST /api/license/issue (admin)
 *
 * Recep yeni lisans üretir. Genellikle:
 *  1. Kurum havale yapar
 *  2. Recep admin paneline gider, "Lisans Üret" tıklar
 *  3. Bu endpoint çağrılır, License kaydı oluşturulur
 *  4. Key kurumun mail/WhatsApp'ına gönderilir (manuel veya otomatik)
 *
 * Body: { kurumId, expiresInDays?: number (default 365), status?: 'PENDING'|'ACTIVE' }
 * Response 200: { ok: true, license: {...} }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin, generateLicenseKey, handleOptions } from '../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST gerekli' });
  }
  if (!requireAdmin(req, res)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const kurumId = String(body.kurumId ?? '').trim();
  const expiresInDays = Number(body.expiresInDays ?? 365);
  const status = (body.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING') as 'ACTIVE' | 'PENDING';

  if (!kurumId) return res.status(400).json({ error: 'kurumId gerekli' });
  if (!Number.isFinite(expiresInDays) || expiresInDays < 1 || expiresInDays > 3650) {
    return res.status(400).json({ error: 'expiresInDays: 1-3650 arası olmalı' });
  }

  try {
    const kurum = await prisma.kurum.findUnique({ where: { id: kurumId } });
    if (!kurum) return res.status(404).json({ error: 'Kurum bulunamadı' });

    // Benzersiz key üret (çakışma riski 32^16 = astronomik, ama yine de retry)
    let key = generateLicenseKey();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.license.findUnique({ where: { key } });
      if (!exists) break;
      key = generateLicenseKey();
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const license = await prisma.license.create({
      data: {
        kurumId,
        key,
        status,
        expiresAt,
      },
      include: { kurum: { select: { ad: true, email: true, plan: true } } },
    });

    return res.status(200).json({ ok: true, license });
  } catch (err: any) {
    console.error('issue error:', err);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
