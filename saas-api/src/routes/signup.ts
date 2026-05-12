/**
 * Public signup endpoint.
 *
 * POST /api/signup
 * Marketing form'undan gelir. Kurum kaydı oluşturur (veya günceller).
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

const PLAN_MAP: Record<string, 'LITE' | 'STANDART' | 'PRO'> = {
  lite: 'LITE',
  standart: 'STANDART',
  pro: 'PRO',
};

interface SignupBody {
  kurum?: string;
  yetkili?: string;
  sehir?: string;
  email?: string;
  telefon?: string;
  plan?: string;
  source?: string;
}

export default async function signupRoute(app: FastifyInstance) {
  app.post<{ Body: SignupBody }>('/api/signup', async (req, reply) => {
    const body = req.body ?? {};

    const kurum = String(body.kurum ?? '').trim();
    const yetkili = String(body.yetkili ?? '').trim();
    const sehir = String(body.sehir ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const telefon = String(body.telefon ?? '').trim();
    const planRaw = String(body.plan ?? 'lite').toLowerCase();
    const plan = PLAN_MAP[planRaw];
    const source = body.source ? String(body.source) : 'landing';

    if (!kurum) return reply.code(400).send({ error: 'Kurum adı gerekli' });
    if (!yetkili) return reply.code(400).send({ error: 'Yetkili adı gerekli' });
    if (!sehir) return reply.code(400).send({ error: 'Şehir gerekli' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return reply.code(400).send({ error: 'Geçersiz e-posta' });
    if (!telefon || telefon.replace(/\D/g, '').length < 10)
      return reply.code(400).send({ error: 'Geçersiz telefon' });
    if (!plan) return reply.code(400).send({ error: 'Plan: lite | standart | pro' });

    try {
      // Email zaten kayıtlıysa güncelle
      const existing = await prisma.kurum.findUnique({ where: { email } });
      if (existing) {
        const updated = await prisma.kurum.update({
          where: { email },
          data: { ad: kurum, yetkili, sehir, telefon, plan, source },
        });
        return {
          ok: true,
          kurumId: updated.id,
          alreadyExists: true,
          message: 'Mevcut kayıt güncellendi',
        };
      }

      const created = await prisma.kurum.create({
        data: { ad: kurum, yetkili, sehir, email, telefon, plan, source },
      });

      return { ok: true, kurumId: created.id, alreadyExists: false };
    } catch (err: any) {
      req.log.error({ err }, 'signup error');
      return reply.code(500).send({ error: 'Sunucu hatası' });
    }
  });
}
