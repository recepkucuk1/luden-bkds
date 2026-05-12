/**
 * POST /api/license/verify
 *
 * Mac/Windows uygulaması açılışta lisans doğrulamak için çağırır.
 * İlk çağrıda machineId license'a bağlanır; sonraki çağrılarda eşleşmesi gerekir.
 *
 * Body: { key: string, machineId: string }
 * Response 200: { status: 'ACTIVE'|'EXPIRED'|'PENDING', plan, expiresAt }
 * Response 403: { status: 'WRONG_MACHINE' } — başka cihaza bağlanmış
 * Response 404: { status: 'INVALID' } — kod bulunamadı
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../../lib/prisma.js';
import { handleOptions } from '../../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST gerekli' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const key = String(body.key ?? '').trim();
  const machineId = String(body.machineId ?? '').trim();

  if (!key) return res.status(400).json({ error: 'Lisans kodu gerekli' });
  if (!machineId) return res.status(400).json({ error: 'machineId gerekli' });

  try {
    const lic = await prisma.license.findUnique({
      where: { key },
      include: { kurum: { select: { plan: true, ad: true } } },
    });

    if (!lic) {
      return res.status(404).json({ status: 'INVALID', error: 'Lisans bulunamadı' });
    }

    if (lic.status === 'REVOKED') {
      return res.status(403).json({ status: 'REVOKED', error: 'Lisans iptal edilmiş' });
    }

    // Machine binding
    if (!lic.machineId) {
      // İlk verify — cihaza bağla
      await prisma.license.update({
        where: { id: lic.id },
        data: {
          machineId,
          lastPingAt: new Date(),
          // PENDING'i otomatik ACTIVE'e çevirme — bunu Recep admin'den yapar
        },
      });
    } else if (lic.machineId !== machineId) {
      return res.status(403).json({
        status: 'WRONG_MACHINE',
        error: 'Bu lisans başka bir cihaza bağlanmış. Yeni cihaz için Recep ile iletişime geçin.',
      });
    } else {
      // Aynı cihaz, ping güncelle
      await prisma.license.update({
        where: { id: lic.id },
        data: { lastPingAt: new Date() },
      });
    }

    // Süre kontrol
    const expired = lic.expiresAt < new Date();
    if (expired && lic.status !== 'EXPIRED') {
      // Auto-mark as expired
      await prisma.license.update({
        where: { id: lic.id },
        data: { status: 'EXPIRED' },
      });
      return res.status(200).json({
        status: 'EXPIRED',
        plan: lic.kurum.plan,
        expiresAt: lic.expiresAt.toISOString(),
      });
    }

    return res.status(200).json({
      status: lic.status,
      plan: lic.kurum.plan,
      expiresAt: lic.expiresAt.toISOString(),
    });
  } catch (err: any) {
    console.error('verify error:', err);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
