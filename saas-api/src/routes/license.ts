/**
 * License endpoint'leri.
 *
 * POST /api/license/verify    — public, Mac/Windows uygulaması açılışta ping
 * POST /api/license/issue     — admin, Recep manuel veya otomatik üretir
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, generateLicenseKey } from '../lib/auth.js';

interface VerifyBody {
  key?: string;
  machineId?: string;
}

interface IssueBody {
  kurumId?: string;
  expiresInDays?: number;
  status?: 'PENDING' | 'ACTIVE';
}

export default async function licenseRoutes(app: FastifyInstance) {
  // ─── verify (public) ────────────────────────────────────────
  app.post<{ Body: VerifyBody }>('/api/license/verify', async (req, reply) => {
    const body = req.body ?? {};
    const key = String(body.key ?? '').trim();
    const machineId = String(body.machineId ?? '').trim();

    if (!key) return reply.code(400).send({ error: 'Lisans kodu gerekli' });
    if (!machineId) return reply.code(400).send({ error: 'machineId gerekli' });

    try {
      const lic = await prisma.license.findUnique({
        where: { key },
        include: { kurum: { select: { plan: true, ad: true } } },
      });

      if (!lic) {
        return reply.code(404).send({ status: 'INVALID', error: 'Lisans bulunamadı' });
      }

      if (lic.status === 'REVOKED') {
        return reply.code(403).send({ status: 'REVOKED', error: 'Lisans iptal edilmiş' });
      }

      // Machine binding
      if (!lic.machineId) {
        // İlk verify — cihaza bağla
        await prisma.license.update({
          where: { id: lic.id },
          data: { machineId, lastPingAt: new Date() },
        });
      } else if (lic.machineId !== machineId) {
        return reply.code(403).send({
          status: 'WRONG_MACHINE',
          error:
            'Bu lisans başka bir cihaza bağlanmış. Yeni cihaz için Recep ile iletişime geçin.',
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
        await prisma.license.update({ where: { id: lic.id }, data: { status: 'EXPIRED' } });
        return {
          status: 'EXPIRED',
          plan: lic.kurum.plan,
          expiresAt: lic.expiresAt.toISOString(),
        };
      }

      return {
        status: lic.status,
        plan: lic.kurum.plan,
        expiresAt: lic.expiresAt.toISOString(),
      };
    } catch (err: any) {
      req.log.error({ err }, 'license verify error');
      return reply.code(500).send({ error: 'Sunucu hatası' });
    }
  });

  // ─── issue (admin) ──────────────────────────────────────────
  app.post<{ Body: IssueBody }>('/api/license/issue', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const body = req.body ?? {};
    const kurumId = String(body.kurumId ?? '').trim();
    const expiresInDays = Number(body.expiresInDays ?? 365);
    const status = body.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING';

    if (!kurumId) return reply.code(400).send({ error: 'kurumId gerekli' });
    if (!Number.isFinite(expiresInDays) || expiresInDays < 1 || expiresInDays > 3650)
      return reply.code(400).send({ error: 'expiresInDays: 1-3650 arası olmalı' });

    try {
      const kurum = await prisma.kurum.findUnique({ where: { id: kurumId } });
      if (!kurum) return reply.code(404).send({ error: 'Kurum bulunamadı' });

      // Benzersiz key üret
      let key = generateLicenseKey();
      for (let i = 0; i < 5; i++) {
        const exists = await prisma.license.findUnique({ where: { key } });
        if (!exists) break;
        key = generateLicenseKey();
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const license = await prisma.license.create({
        data: { kurumId, key, status, expiresAt },
        include: { kurum: { select: { ad: true, email: true, plan: true } } },
      });

      return { ok: true, license };
    } catch (err: any) {
      req.log.error({ err }, 'license issue error');
      return reply.code(500).send({ error: 'Sunucu hatası' });
    }
  });
}
