/**
 * Şifre/secret depolama soyutlaması.
 *
 * Mac: macOS Keychain (`security` CLI üzerinden, native modül yok)
 * Linux: TODO — libsecret entegrasyonu (Faz 2)
 * Windows: TODO — DPAPI / wincred (Faz 2, Windows build park)
 *
 * Diğer platformlarda NoopStore döner — caller plaintext fallback'e geçer.
 *
 * Tasarım notu: `security add-generic-password -A` flag'i ile herhangi bir
 * uygulamanın okumasına izin veriyoruz. Bu prompt göstermiyor (kullanıcı
 * deneyimi için kritik) ama "aynı Mac'teki başka bir kullanıcı script'i
 * okuyabilir" zayıflığını kabul ediyor. Kurumda Mac tek kullanıcılı, login
 * keychain login parolasıyla şifreli — pratikte savunulabilir.
 *
 * Code signing'e geçince `-T <signed-binary-path>` ile sadece kendi binary'mize
 * izin verecek şekilde sıkıştırılır (Faz 1 sonu).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SERVICE = 'com.brytakip.app';
// Eski bundle identifier (Luden BKDS dönemi). Migration için get() önce yeni, sonra eski'ye bakar.
const SERVICE_LEGACY = 'com.ludenlab.bkds';

export interface SecretStore {
  isAvailable(): boolean;
  get(account: string): Promise<string | null>;
  set(account: string, value: string): Promise<void>;
  delete(account: string): Promise<void>;
  describe(): string; // log için
}

class MacKeychainStore implements SecretStore {
  isAvailable(): boolean {
    return process.platform === 'darwin';
  }

  describe(): string {
    return 'macOS Keychain';
  }

  async get(account: string): Promise<string | null> {
    // 1) Yeni service'den dene
    const fromNew = await this.readFrom(account, SERVICE);
    if (fromNew !== null) return fromNew;

    // 2) Eski service'den dene (Luden BKDS dönemi); bulursa yeni'ye taşı + eski'yi sil
    const fromLegacy = await this.readFrom(account, SERVICE_LEGACY);
    if (fromLegacy !== null) {
      try {
        await execFileAsync('security', [
          'add-generic-password',
          '-a', account, '-s', SERVICE,
          '-w', fromLegacy,
          '-U', '-A',
        ]);
        await execFileAsync('security', [
          'delete-generic-password',
          '-a', account, '-s', SERVICE_LEGACY,
        ]).catch(() => {/* zaten yoksa OK */});
      } catch {/* migrate başarısızsa eski'den okumayı tek seferlik döndür */}
      return fromLegacy;
    }
    return null;
  }

  private async readFrom(account: string, service: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-a', account, '-s', service, '-w',
      ]);
      return stdout.replace(/\n$/, '');
    } catch {
      return null;
    }
  }

  async set(account: string, value: string): Promise<void> {
    await execFileAsync('security', [
      'add-generic-password',
      '-a', account,
      '-s', SERVICE,
      '-w', value,
      '-U', // varsa güncelle
      '-A', // prompt yok — bkz. dosya başı not
    ]);
  }

  async delete(account: string): Promise<void> {
    await execFileAsync('security', [
      'delete-generic-password',
      '-a', account,
      '-s', SERVICE,
    ]).catch(() => { /* zaten yoksa sorun değil */ });
  }
}

class NoopStore implements SecretStore {
  isAvailable(): boolean { return false; }
  describe(): string { return 'plaintext (keychain bu platformda desteklenmiyor)'; }
  async get(): Promise<string | null> { return null; }
  async set(): Promise<void> { /* noop */ }
  async delete(): Promise<void> { /* noop */ }
}

export function createSecretStore(): SecretStore {
  if (process.platform === 'darwin') return new MacKeychainStore();
  return new NoopStore();
}
