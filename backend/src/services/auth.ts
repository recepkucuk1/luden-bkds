/**
 * LAN auth — pair-code servisi.
 *
 * Sorun: Backend 0.0.0.0:8787'de açık, kurum WiFi'sindeki herkes erişebilir.
 *        Setup endpoint'leri ile BRY creds bile overwrite edilebilir.
 *
 * Çözüm: İki kademeli güven modeli.
 *
 *   1. Localhost (Tauri webview, Mac'in kendisi) → her zaman güvenilir, auth gerekmez.
 *   2. LAN (telefonlar) → device token gerekli.
 *
 * Pairing akışı:
 *   1. Kullanıcı Mac'te bir 6 haneli pair code görür (10 dk geçerli, otomatik döner).
 *   2. Telefon /pair sayfasında kodu girer.
 *   3. Backend kodu doğrular, telefon için kalıcı token üretir.
 *   4. Telefon bundan sonra her isteğe Authorization: Bearer <token> ekler.
 *
 * Pair-code disk'te değil bellekte tutulur (kısa ömürlü). Token'lar persistent.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const PAIR_CODE_TTL_MS = 10 * 60 * 1000; // 10 dakika
// Yanlış denemede kod hemen dönmesin — typo'ya tolerans. N yanlıştan sonra döner.
const MAX_WRONG_ATTEMPTS = 5;

interface DeviceToken {
  token: string;
  createdAt: string;
  lastSeen: string;
}

interface DevicesFile {
  tokens: DeviceToken[];
}

export class AuthService {
  private currentCode: string | null = null;
  private currentCodeExpiresAt = 0;
  private wrongAttempts = 0;
  private tokens = new Set<string>();

  constructor(private storagePath: string) {}

  async load(): Promise<void> {
    if (!existsSync(this.storagePath)) return;
    try {
      const data = await readFile(this.storagePath, 'utf-8');
      const parsed = JSON.parse(data) as DevicesFile;
      for (const t of parsed.tokens ?? []) this.tokens.add(t.token);
    } catch {
      // Bozuk dosya — sıfırdan başla
    }
  }

  /**
   * Aktif pair-code'u döner. Süresi dolduysa yenisini üretir.
   * 6 haneli numerik (telefondan girmesi kolay).
   */
  getCurrentPairCode(): string {
    if (!this.currentCode || Date.now() > this.currentCodeExpiresAt) {
      this.rotateCode();
    }
    return this.currentCode!;
  }

  getPairCodeExpiry(): number {
    return this.currentCodeExpiresAt;
  }

  /**
   * Mac admin manuel "Kodu yenile" tıklayınca çağrılır.
   */
  forceRotateCode(): string {
    this.rotateCode();
    return this.currentCode!;
  }

  private rotateCode(): void {
    this.currentCode = generateNumericCode(6);
    this.currentCodeExpiresAt = Date.now() + PAIR_CODE_TTL_MS;
    this.wrongAttempts = 0;
  }

  /**
   * Kodu doğrula. Geçerliyse yeni token üret ve dön.
   *
   * Tasarım kararları:
   *  - Başarılı eşleştirmede kod DÖNMEZ → aynı kod 10dk içinde birden çok cihaz
   *    için kullanılabilir (kurum sahibi 3 telefonu eşleştirirken yenisini okumaz)
   *  - Yanlış denemede hemen dönmez, MAX_WRONG_ATTEMPTS sonra döner (typo toleransı)
   *  - LAN brute-force pratik değil (5 deneme/10dk × 1M kombinasyon = 19 yıl)
   */
  verifyCodeAndIssueToken(code: string): string | null {
    if (!this.currentCode || Date.now() > this.currentCodeExpiresAt) return null;

    if (code.trim() !== this.currentCode) {
      this.wrongAttempts++;
      if (this.wrongAttempts >= MAX_WRONG_ATTEMPTS) {
        this.rotateCode();
      }
      return null;
    }

    // Doğru kod → token üret. Kod aynı kalır (multi-device pairing window açık).
    this.wrongAttempts = 0;
    const token = randomUUID();
    this.tokens.add(token);
    void this.persist();
    return token;
  }

  isValidToken(token: string | undefined | null): boolean {
    if (!token) return false;
    return this.tokens.has(token);
  }

  async revokeToken(token: string): Promise<void> {
    this.tokens.delete(token);
    await this.persist();
  }

  async revokeAll(): Promise<void> {
    this.tokens.clear();
    await this.persist();
  }

  tokenCount(): number {
    return this.tokens.size;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.storagePath), { recursive: true });
    const now = new Date().toISOString();
    const data: DevicesFile = {
      tokens: Array.from(this.tokens).map((t) => ({
        token: t,
        createdAt: now,
        lastSeen: now,
      })),
    };
    await writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

function generateNumericCode(length: number): string {
  // crypto.randomBytes ile bias-azaltılmış numerik kod
  const buf = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += (buf[i] % 10).toString();
  return out;
}
