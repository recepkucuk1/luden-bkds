/**
 * POST /api/signup
 *
 * Marketing sayfasındaki form bu endpoint'e POST eder. Yeni Kurum kaydı oluşturur.
 * Email zaten kayıtlıysa "zaten var" döner — Recep manuel takip edebilsin.
 * Lisans otomatik üretilmez — Recep onayladıktan sonra admin endpoint ile üretilir.
 *
 * Body: { kurum, yetkili, sehir, email, telefon, plan: 'lite'|'standart'|'pro', source?: string }
 * Response 200: { ok: true, kurumId, alreadyExists: boolean }
 * Response 400: { error: 'validation message' }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../lib/prisma.js';
import { handleOptions } from '../lib/auth.js';

const PLAN_MAP: Record<string, 'LITE' | 'STANDART' | 'PRO'> = {
  lite: 'LITE',
  standart: 'STANDART',
  pro: 'PRO',
};

function badRequest(res: VercelResponse, msg: string) {
  return res.status(400).json({ error: msg });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST gerekli' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // Doğrulama
  const kurum = String(body.kurum ?? '').trim();
  const yetkili = String(body.yetkili ?? '').trim();
  const sehir = String(body.sehir ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const telefon = String(body.telefon ?? '').trim();
  const planRaw = String(body.plan ?? 'lite').toLowerCase();
  const plan = PLAN_MAP[planRaw];
  const source = body.source ? String(body.source) : 'landing';

  if (!kurum) return badRequest(res, 'Kurum adı gerekli');
  if (!yetkili) return badRequest(res, 'Yetkili adı gerekli');
  if (!sehir) return badRequest(res, 'Şehir gerekli');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest(res, 'Geçersiz e-posta');
  if (!telefon || telefon.replace(/\D/g, '').length < 10) return badRequest(res, 'Geçersiz telefon');
  if (!plan) return badRequest(res, 'Plan: lite | standart | pro olmalı');

  try {
    // Email zaten kayıtlıysa update et (gelmeden manuel ekleme olmuş olabilir)
    const existing = await prisma.kurum.findUnique({ where: { email } });
    if (existing) {
      // Plan değişikliği olabilir, güncelle
      const updated = await prisma.kurum.update({
        where: { email },
        data: { ad: kurum, yetkili, sehir, telefon, plan, source },
      });
      return res.status(200).json({
        ok: true,
        kurumId: updated.id,
        alreadyExists: true,
        message: 'Mevcut kayıt güncellendi',
      });
    }

    const created = await prisma.kurum.create({
      data: { ad: kurum, yetkili, sehir, email, telefon, plan, source },
    });

    return res.status(200).json({
      ok: true,
      kurumId: created.id,
      alreadyExists: false,
    });
  } catch (err: any) {
    console.error('signup error:', err);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}
