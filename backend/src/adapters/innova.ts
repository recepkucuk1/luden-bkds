/**
 * INNOVA BRY API Adapter
 *
 * Bu sınıf BRY API'sine konuşan tek noktadır. INNOVA bir gün API'sini
 * değiştirirse sadece bu dosyayı güncelleriz, projenin geri kalanı dokunmaz.
 *
 * Sorumlulukları:
 *  - Login + token cache
 *  - Token süresi dolduğunda otomatik refresh
 *  - Tüm GET isteklerine token'ı eklemek
 *  - HTTP hatalarını anlamlı hatalara çevirmek
 */

import type {
  InnovaLoginResponse,
  InnovaIndividual,
  InnovaActivity,
  InnovaDailySummary,
  InnovaPaginated,
} from '../types/innova.js';

interface AdapterConfig {
  baseUrl: string;       // örn: http://192.168.X.X:3000
  username: string;      // örn: 12345678-1234567
  password: string;
}

interface TokenState {
  access: string;
  refresh: string;
  // Access token'ı 28.5 dk geçerli, biz 25 dk sonra yeniliyoruz (güvenlik payı)
  accessExpiresAt: number;
}

const ACCESS_LIFETIME_MS = 25 * 60 * 1000; // 25 dk

export class InnovaBryAdapter {
  private tokens: TokenState | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(private config: AdapterConfig) {}

  /**
   * Config değişince yeni credentials ile çalış. Token'ı sıfırla.
   * Setup wizard'dan yeni bilgi gelince çağrılır.
   */
  updateConfig(newConfig: AdapterConfig): void {
    this.config = newConfig;
    this.tokens = null;
    this.loginPromise = null;
  }

  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Verilen credentials ile login deneyip başarılı olup olmadığını döner.
   * Setup wizard "bağlantıyı test et" butonu için.
   */
  async testCredentials(test: AdapterConfig): Promise<{ ok: boolean; error?: string }> {
    const url = `${test.baseUrl}/api/users/login/`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          username: test.username,
          password: test.password,
          try_count: 0,
        }),
      });
      if (!res.ok) {
        if (res.status === 400 || res.status === 401) {
          return { ok: false, error: 'Kullanıcı adı veya şifre hatalı' };
        }
        return { ok: false, error: `Sunucu yanıtı: ${res.status}` };
      }
      const data = (await res.json()) as { access?: string; refresh?: string };
      if (!data.access) return { ok: false, error: 'Beklenmeyen sunucu yanıtı' };
      return { ok: true };
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        return { ok: false, error: 'Sunucuya ulaşılamadı. Adres doğru mu? Aynı ağda mısınız?' };
      }
      return { ok: false, error: msg || 'Bağlantı kurulamadı' };
    }
  }

  /**
   * Token yoksa veya süresi dolmuşsa login/refresh yapar.
   * Aynı anda birden fazla istek gelirse, sadece bir login çalışır
   * (loginPromise ile dedup).
   */
  private async ensureAuthenticated(): Promise<string> {
    if (this.tokens && Date.now() < this.tokens.accessExpiresAt) {
      return this.tokens.access;
    }

    // Eşzamanlı login isteklerini birleştir
    if (!this.loginPromise) {
      this.loginPromise = this.performLogin().finally(() => {
        this.loginPromise = null;
      });
    }
    await this.loginPromise;
    return this.tokens!.access;
  }

  private async performLogin(): Promise<void> {
    const url = `${this.config.baseUrl}/api/users/login/`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
        try_count: 0,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`INNOVA login failed: ${res.status} ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as InnovaLoginResponse;
    this.tokens = {
      access: data.access,
      refresh: data.refresh,
      accessExpiresAt: Date.now() + ACCESS_LIFETIME_MS,
    };
  }

  /**
   * Generic authenticated GET. 401 alırsa bir kez yeniden login deneyip tekrar dener.
   */
  private async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const access = await this.ensureAuthenticated();

    const url = new URL(`${this.config.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }

    const doFetch = async (token: string) =>
      fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

    let res = await doFetch(access);

    if (res.status === 401) {
      // Token süresi sunucu tarafından dolmuş sayılmış — yeniden login dene
      this.tokens = null;
      const fresh = await this.ensureAuthenticated();
      res = await doFetch(fresh);
    }

    if (!res.ok) {
      throw new Error(`INNOVA GET ${path} failed: ${res.status}`);
    }

    return (await res.json()) as T;
  }

  // ─── Public API ─────────────────────────────────────────────

  /**
   * Belirli bir günün giriş-çıkış özeti (kim girdi, ilk giriş + son çıkış).
   * `date` verilmezse bugün. YYYY-MM-DD (TR günü) formatında.
   * Anasayfa feed'imizin temeli.
   */
  async getTodayActivitySummary(opts?: {
    pageSize?: number;
    page?: number;
    date?: string;
  }): Promise<InnovaPaginated<InnovaDailySummary>> {
    const { startTime, endTime } = computeDateUtcRange(opts?.date);
    return this.get('/api/activities/individual-activity/each-individual/', {
      page: opts?.page ?? 1,
      page_size: opts?.pageSize ?? 100,
      ordering: '-first_entry',
      start_time: startTime,
      end_time: endTime,
    });
  }

  /**
   * Tek bireyin belirli gündeki aktivitelerini çeker.
   * `date` verilmezse bugün.
   */
  async getIndividualActivities(
    individualUuid: string,
    opts?: { pageSize?: number; page?: number; date?: string },
  ): Promise<InnovaPaginated<InnovaActivity>> {
    const { startTime, endTime } = computeDateUtcRange(opts?.date);
    return this.get('/api/activities/individual-activity/', {
      individual: individualUuid,
      page: opts?.page ?? 1,
      page_size: opts?.pageSize ?? 50,
      start_time: startTime,
      end_time: endTime,
    });
  }

  /**
   * Bireyin meta bilgisi (isim, doğum tarihi, vb).
   * Ad bilgisini cache'lemek için ihtiyacımız var.
   */
  async getIndividual(individualUuid: string): Promise<InnovaIndividual> {
    return this.get(`/api/activities/bkmsy-individuals/${individualUuid}/`);
  }

  /**
   * Kuruma kayıtlı TÜM bireylerin listesi (sadece bugün aktif olanlar değil).
   * REST konvansiyonu — bkmsy-individuals UUID'siz çağrılınca paginated liste.
   * Endpoint mevcut değilse 404 yükselir.
   */
  async listIndividuals(opts?: {
    page?: number;
    pageSize?: number;
  }): Promise<InnovaPaginated<InnovaIndividual>> {
    return this.get('/api/activities/bkmsy-individuals/', {
      page: opts?.page ?? 1,
      page_size: opts?.pageSize ?? 200,
    });
  }
}

/**
 * Verilen TR gününün (YYYY-MM-DD) UTC karşılığını hesaplar.
 * `date` verilmezse bugün (TR saat dilimine göre).
 * INNOVA tarih aralığını UTC olarak istiyor (T21:00:00Z = TR 00:00).
 */
function computeDateUtcRange(date?: string): { startTime: string; endTime: string } {
  let trDateStr: string;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    trDateStr = date;
  } else {
    const now = new Date();
    trDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  }
  // TR günü 00:00 = UTC önceki gün 21:00
  const startTime = new Date(`${trDateStr}T00:00:00+03:00`).toISOString();
  const endTime = new Date(`${trDateStr}T23:59:59.999+03:00`).toISOString();
  return { startTime, endTime };
}
