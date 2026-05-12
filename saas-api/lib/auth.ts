/**
 * Basit admin token kontrolü — Recep'in admin endpoint'lerine erişimi için.
 *
 * Vercel env var: ADMIN_TOKEN — Vercel Dashboard'da set'lenir.
 * İstek header: Authorization: Bearer <token>
 *
 * Production'da magic-link auth'a geçilecek (Faz 3). Şimdilik tek admin
 * (Recep) için bu yeterli.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export function isAdmin(req: VercelRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    // Env var set'lenmemiş → güvenlik için her isteği reddet
    return false;
  }
  const auth = req.headers.authorization ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return match[1] === expected;
}

export function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  if (isAdmin(req)) return true;
  res.status(401).json({ error: 'Yetki yok' });
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

/**
 * CORS preflight için OPTIONS request handler'ı.
 * vercel.json'daki headers tüm GET/POST/OPTIONS'a uygulanır;
 * OPTIONS için sadece 200 dönmek yeterli.
 */
export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
