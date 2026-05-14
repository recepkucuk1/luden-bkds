/**
 * Admin token kontrolü — Recep'in admin endpoint'lerine erişim için.
 *
 * Env var: ADMIN_TOKEN — Hostinger Node Manager → Environment Variables'da set.
 * İstek header: Authorization: Bearer <token>
 *
 * Production'da magic-link auth'a geçilecek (Faz 3). Şimdilik tek admin yeterli.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Sabit-zamanlı string karşılaştırma. Her iki tarafı da SHA-256'ya indirip
 * karşılaştırır — böylece uzunluk farkı timingSafeEqual'ı patlatmaz ve
 * token'ın uzunluğu/içeriği yanıt süresinden sızmaz.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function isAdmin(req: FastifyRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false; // env set'lenmedi → her şey reddedilir
  const auth = req.headers.authorization ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return safeEqual(match[1], expected);
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  if (isAdmin(req)) return true;
  reply.code(401).send({ error: 'Yetki yok' });
  return false;
}

/**
 * Lisans key üretici — okunaklı, 20 karakter, 5'erli gruplar.
 * Örn: BRY-X3K2-9HFA-PQRS-TUVW
 */
export function generateLicenseKey(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O/1/I/L karıştırılmayanlar
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) {
      s += charset[Math.floor(Math.random() * charset.length)];
    }
    groups.push(s);
  }
  return `BRY-${groups.join('-')}`;
}
