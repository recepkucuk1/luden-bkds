/**
 * Config servisi
 *
 * Kurum BRY bilgilerini saklar. Öncelik:
 *   1. .data/config.json (kullanıcı UI'dan girdi)
 *   2. .env (geliştirme için fallback)
 *
 * UI'dan girince dosyaya yazılır, sonraki açılışlarda oradan okunur.
 * .env'de değer varsa ve dosya yoksa, dosya gibi davranır (geri uyumluluk).
 *
 * Şifre saklama:
 *   - macOS: Keychain (services/secret.ts → security CLI)
 *   - Diğer: config.json içinde plaintext (Faz 2 hedefi: Linux libsecret, Windows DPAPI)
 *
 * Mac'te eski plaintext config.json varsa load() sırasında otomatik migrate edilir
 *   → şifre Keychain'e taşınır, dosyadaki şifre alanı boşaltılır.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSecretStore, type SecretStore } from './secret.js';

export interface BryConfig {
  baseUrl: string;
  username: string;
  password: string;
  // Ne zaman kaydedildi
  configuredAt?: string;
}

interface ConfigFileShape extends Omit<BryConfig, 'password'> {
  // Dosyada şifre olabilir (plaintext fallback) ya da olmayabilir (keychain'de)
  password?: string;
}

const SECRET_ACCOUNT = 'bry-password';

export class ConfigService {
  private current: BryConfig | null = null;
  private secret: SecretStore;

  constructor(private filePath: string) {
    this.secret = createSecretStore();
  }

  /**
   * Hangi backend kullanılıyor? Server startup log'u için.
   */
  describeSecretStore(): string {
    return this.secret.describe();
  }

  /**
   * Disk'ten yükle. Yoksa .env'e bak. İkisi de yoksa null.
   */
  async load(): Promise<BryConfig | null> {
    if (existsSync(this.filePath)) {
      try {
        const data = await readFile(this.filePath, 'utf-8');
        const parsed = JSON.parse(data) as ConfigFileShape;
        const password = await this.resolvePassword(parsed);
        if (password === null) {
          // Dosya bozuk veya şifre hiçbir yerde yok
          return null;
        }
        this.current = {
          baseUrl: parsed.baseUrl,
          username: parsed.username,
          password,
          configuredAt: parsed.configuredAt,
        };
        return this.current;
      } catch {
        // Bozuk dosya — yok say, .env'e düş
      }
    }

    // .env fallback
    if (
      process.env.INNOVA_BASE_URL &&
      process.env.INNOVA_USERNAME &&
      process.env.INNOVA_PASSWORD
    ) {
      this.current = {
        baseUrl: process.env.INNOVA_BASE_URL,
        username: process.env.INNOVA_USERNAME,
        password: process.env.INNOVA_PASSWORD,
        configuredAt: 'env',
      };
      return this.current;
    }

    return null;
  }

  /**
   * Önce keychain, yoksa dosyadaki plaintext.
   * Plaintext ile geldiyse ve keychain mevcutsa otomatik migrate et.
   */
  private async resolvePassword(parsed: ConfigFileShape): Promise<string | null> {
    if (this.secret.isAvailable()) {
      const stored = await this.secret.get(SECRET_ACCOUNT).catch(() => null);
      if (stored) return stored;

      // Keychain boş ama dosyada plaintext varsa → migrate
      if (parsed.password) {
        try {
          await this.secret.set(SECRET_ACCOUNT, parsed.password);
          await this.persistFile({ ...parsed, password: '' });
          return parsed.password;
        } catch {
          // Migrate başarısız, dosyadaki plaintext ile devam et
          return parsed.password;
        }
      }
      return null;
    }
    // Platform keychain desteklemiyor → dosya tek kaynak
    return parsed.password ?? null;
  }

  get(): BryConfig | null {
    return this.current;
  }

  isConfigured(): boolean {
    return this.current !== null;
  }

  /**
   * Yeni config kaydet. Şifreyi mümkünse keychain'e, yoksa plaintext disk'e yaz.
   */
  async save(config: Omit<BryConfig, 'configuredAt'>): Promise<BryConfig> {
    const saved: BryConfig = {
      ...config,
      configuredAt: new Date().toISOString(),
    };

    let plaintextOnDisk = saved.password;
    if (this.secret.isAvailable()) {
      try {
        await this.secret.set(SECRET_ACCOUNT, saved.password);
        plaintextOnDisk = ''; // keychain'e yazıldı, dosyaya gerek yok
      } catch {
        // Keychain başarısız — plaintext fallback'e izin ver, runtime log'lar warning verir
      }
    }

    await this.persistFile({
      baseUrl: saved.baseUrl,
      username: saved.username,
      password: plaintextOnDisk,
      configuredAt: saved.configuredAt,
    });

    this.current = saved; // bellekte gerçek şifre
    return saved;
  }

  private async persistFile(data: ConfigFileShape): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Şifreyi açığa vurmadan public bilgi
   */
  publicInfo() {
    if (!this.current) return null;
    return {
      baseUrl: this.current.baseUrl,
      username: this.current.username,
      configuredAt: this.current.configuredAt,
    };
  }
}
