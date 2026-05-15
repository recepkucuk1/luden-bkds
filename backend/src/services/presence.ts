/**
 * Presence (anlık durum) servisi
 *
 * Sorumluluk: BRY ham verisini telefon UI'ı için zenginleştirilmiş
 * forma dönüştürmek.
 *
 *  - "Şu an içeride mi?" hesabı (son aktivite entry mi exit mi?)
 *  - İsim ekleme (cache'den)
 *  - Sayım (içerideki birey sayısı)
 *  - Son N hareket
 */

import type { InnovaBryAdapter } from '../adapters/innova.js';
import type { CacheService } from './cache.js';
import type {
  InnovaIndividual,
  InnovaActivity,
  InnovaDailySummary,
  PresenceItem,
  RecentActivityItem,
} from '../types/innova.js';

export interface SnapshotPayload {
  generatedAt: string;
  date: string;               // hangi günün snapshot'ı (YYYY-MM-DD, TR günü)
  isToday: boolean;           // o gün TR'de bugün mü? (UI canlı/geçmiş ayrımı için)
  todayCount: number;         // o gün toplam kaç kişi gelmiş (özet count)
  presence: PresenceItem[];   // birey-bazlı durum (en son hareket önce)
  recentActivities: RecentActivityItem[];  // son N hareket (en yeni önce)
  manualMatchToday: number;   // o gün kaç kişi manuel eşleştirilmiş
  hourlyDistribution: number[]; // 24 eleman, her saatin (0-23 TR) toplam aktivite sayısı
}

/**
 * ISO zaman → TR saat dilimindeki saat (0-23).
 */
function trHour(iso: string): number {
  const hourStr = new Date(iso).toLocaleString('en-CA', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Europe/Istanbul',
  });
  return parseInt(hourStr, 10);
}

/**
 * Verilen tarih TR'de bugün mü?
 */
function isTodayInTurkey(date: string): boolean {
  const trToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  return date === trToday;
}

function turkishToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

/**
 * YYYY-MM-DD + delta gün → YYYY-MM-DD (TR günü). T12 sabitlemesi TZ edge case'i önler.
 */
function shiftDateStr(date: string, deltaDays: number): string {
  const d = new Date(`${date}T12:00:00+03:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

export interface WeekStats {
  startDate: string;
  endDate: string;
  totalIndividuals: number;   // hafta boyunca gelen farklı birey sayısı (union)
  dailyCounts: { date: string; count: number }[];  // her gün kaç kişi (sparkline için)
}

export class PresenceService {
  constructor(
    private adapter: InnovaBryAdapter,
    private cache: CacheService,
  ) {}

  /**
   * Anasayfanın ihtiyacı olan tüm veriyi tek bir snapshot olarak döner.
   * `date` verilmezse bugün; verilirse o gün için geçmişe bakış.
   *
   * Bugün için: kısa-TTL activities cache + polling servisinin akıllı invalidation'ı.
   * Geçmiş gün için: uzun-TTL historicalActivities cache (statik veri).
   */
  async getSnapshot(opts?: { recentLimit?: number; date?: string }): Promise<SnapshotPayload> {
    const recentLimit = opts?.recentLimit ?? 10;
    const date = opts?.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)
      ? opts.date
      : turkishToday();
    const isToday = isTodayInTurkey(date);

    // 1. O günün toplam özeti
    const summary = await this.adapter.getTodayActivitySummary({
      pageSize: 100,
      date: isToday ? undefined : date,
    });
    const uuids = summary.results.map((r) => r.individual_uuid);

    // 2. Tüm bireylerin meta bilgisini cache'ten/INNOVA'dan al (paralel)
    const individuals = await this.cache.getIndividuals(uuids);

    // 3. Her bireyin aktivitelerini al (bugün vs geçmiş için ayrı cache)
    const activitiesMap = new Map<string, InnovaActivity[]>();
    await Promise.all(
      uuids.map(async (uuid) => {
        try {
          const acts = isToday
            ? await this.cache.getActivities(uuid)
            : await this.cache.getActivitiesForDate(uuid, date);
          activitiesMap.set(uuid, acts);
        } catch {
          activitiesMap.set(uuid, []);
        }
      }),
    );

    // 4. Presence hesabı: her birey için son aktivite entry mi exit mi?
    const presence: PresenceItem[] = [];

    // Summary'den first_entry/last_exit'i UUID'ye göre indeksleyelim (BRY zaten veriyor)
    const summaryByUuid = new Map(summary.results.map((r) => [r.individual_uuid, r]));

    for (const uuid of uuids) {
      const ind = individuals.get(uuid);
      const acts = activitiesMap.get(uuid) ?? [];
      if (!ind || acts.length === 0) continue;

      // Sort DESC by activity_time (en yeni başta)
      const sorted = [...acts].sort((a, b) =>
        b.activity_time.localeCompare(a.activity_time),
      );
      const last = sorted[0];

      // İlk hareket (zaman olarak en eski) → "ilk giriş"
      // Son hareket (zaman olarak en yeni) → "son çıkış"
      // BRY summary'si first_entry/last_exit veriyor — onları kullan.
      //
      // ÖNEMLİ: BRY summary'sinin last_exit alanı çıkış kaydı OLMASA bile son
      // hareketin zamanını döndürüyor (semantik bug). Tek aktivite ya da
      // first_entry == last_exit ise gerçek bir çıkış henüz olmamıştır,
      // kişi hâlâ içeride sayılır — null bırak ki UI "13:52 → 13:52 · 0dk"
      // gibi sahte aralık göstermesin.
      const sum = summaryByUuid.get(uuid);
      const firstEntry = sum?.first_entry ?? sorted[sorted.length - 1].activity_time;
      const rawLastExit = sum?.last_exit ?? last.activity_time;
      const lastExit = acts.length > 1 && rawLastExit !== firstEntry ? rawLastExit : null;

      presence.push({
        individual: ind,
        lastActivity: last,
        todayActivityCount: acts.length,
        firstEntry,
        lastExit,
      });
    }

    // Son hareket eden üste
    presence.sort((a, b) => {
      return b.lastActivity.activity_time.localeCompare(a.lastActivity.activity_time);
    });

    // 5. Son N hareket (tüm bireyler arası, zaman bazlı)
    const allActivities: { act: InnovaActivity; ind: InnovaIndividual }[] = [];
    for (const uuid of uuids) {
      const ind = individuals.get(uuid);
      if (!ind) continue;
      for (const act of activitiesMap.get(uuid) ?? []) {
        allActivities.push({ act, ind });
      }
    }
    allActivities.sort((a, b) =>
      b.act.activity_time.localeCompare(a.act.activity_time),
    );
    const recentActivities: RecentActivityItem[] = allActivities
      .slice(0, recentLimit)
      .map(({ act, ind }) => ({
        activity: act,
        individual: { uuid: ind.uuid, full_name: ind.full_name },
      }));

    // 6. Manuel eşleştirme sayısı (kamera doğrulaması metriği)
    const manualMatchToday = summary.results.filter((r) => r.has_manuel_match).length;

    // 7. Saatlik dağılım — her saat (TR, 0-23) kaç aktivite
    const hourlyDistribution = new Array(24).fill(0);
    for (const acts of activitiesMap.values()) {
      for (const act of acts) {
        hourlyDistribution[trHour(act.activity_time)]++;
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      date,
      isToday,
      todayCount: summary.count,
      presence,
      recentActivities,
      manualMatchToday,
      hourlyDistribution,
    };
  }

  /**
   * Verilen günün manuel eşleşmelerinin tam listesi.
   * is_matched_manually=true olan tüm aktiviteler + benzerlik skoru.
   * Snapshot'ın recentActivities'inden farklı: tüm gün, sınırsız.
   */
  async getManualMatches(opts?: { date?: string }): Promise<{
    date: string;
    isToday: boolean;
    matches: Array<{
      activity: InnovaActivity;
      individual: Pick<InnovaIndividual, 'uuid' | 'full_name'>;
    }>;
  }> {
    const date = opts?.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)
      ? opts.date
      : turkishToday();
    const isToday = isTodayInTurkey(date);

    const summary = await this.adapter.getTodayActivitySummary({
      pageSize: 100,
      date: isToday ? undefined : date,
    });
    const uuids = summary.results.map((r) => r.individual_uuid);
    const individuals = await this.cache.getIndividuals(uuids);

    const matches: Array<{
      activity: InnovaActivity;
      individual: Pick<InnovaIndividual, 'uuid' | 'full_name'>;
    }> = [];

    await Promise.all(
      uuids.map(async (uuid) => {
        const ind = individuals.get(uuid);
        if (!ind) return;
        try {
          const acts = isToday
            ? await this.cache.getActivities(uuid)
            : await this.cache.getActivitiesForDate(uuid, date);
          for (const act of acts) {
            if (act.is_matched_manually) {
              matches.push({
                activity: act,
                individual: { uuid: ind.uuid, full_name: ind.full_name },
              });
            }
          }
        } catch {
          /* tek bireyin hatasını yut */
        }
      }),
    );

    // En yeni manuel eşleşme üstte
    matches.sort((a, b) =>
      b.activity.activity_time.localeCompare(a.activity.activity_time),
    );

    return { date, isToday, matches };
  }

  /**
   * Son 7 gün vs önceki 7 gün karşılaştırması.
   * Her gün için summary endpoint'i çekilir; o günkü farklı birey sayısı +
   * UUID'ler toplanır. Hafta boyunca union'la unique birey sayısı bulunur.
   *
   * Maliyet: 14 summary çağrısı (her biri ~70ms BRY'den).
   * Cache: historical activities cache kullanılmıyor ama summary INNOVA tarafında
   * hızlı; route layer'da 1 dk Cache-Control eklenir.
   */
  async getWeeklyComparison(): Promise<{
    thisWeek: WeekStats;
    lastWeek: WeekStats;
  }> {
    const today = turkishToday();
    const lastWeekEnd = shiftDateStr(today, -7);

    const [thisWeek, lastWeek] = await Promise.all([
      this.fetchWeekStats(today, 7),
      this.fetchWeekStats(lastWeekEnd, 7),
    ]);

    return { thisWeek, lastWeek };
  }

  /**
   * Kuruma kayıtlı tüm bireyler + son N gün içinde görülen son aktivite zamanı.
   * "Yokluk takibi" için: hangi öğrenci bu hafta gelmedi?
   *
   * Adımlar:
   *  1. INNOVA list endpoint'inden tüm bireyler (~50-200 kişi)
   *  2. Son N gün summary'lerini paralelde çek (varsayılan 7 gün)
   *  3. Her UUID için en geç last_exit/first_entry zamanı → lastSeen
   *
   * Önemli: bu method tüm kayıtlı bireyleri ister; INNOVA list endpoint'i
   * yoksa veya farklı yoldaysa 502 yükselir, frontend hata gösterir.
   */
  async getAllIndividuals(opts?: { lookBackDays?: number }): Promise<{
    totalCount: number;
    lookBackDays: number;
    individuals: Array<{ individual: InnovaIndividual; lastSeen: string | null }>;
  }> {
    const days = opts?.lookBackDays ?? 7;
    const today = turkishToday();
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      dates.push(shiftDateStr(today, -i));
    }

    // Paralelde: tüm bireyler + son N gün summary
    const [list, ...summaries] = await Promise.all([
      this.adapter.listIndividuals({ pageSize: 200 }),
      ...dates.map((date) =>
        this.adapter
          .getTodayActivitySummary({
            pageSize: 100,
            date: isTodayInTurkey(date) ? undefined : date,
          })
          .catch(() => ({ count: 0, next: null, previous: null, results: [] as InnovaDailySummary[] })),
      ),
    ]);

    // lastSeen hesabı: union of summary.results, per-UUID maksimum zaman
    const lastSeenMap = new Map<string, string>();
    for (const s of summaries) {
      for (const r of s.results) {
        const candidate = r.last_exit || r.first_entry;
        if (!candidate) continue;
        const existing = lastSeenMap.get(r.individual_uuid);
        if (!existing || candidate > existing) {
          lastSeenMap.set(r.individual_uuid, candidate);
        }
      }
    }

    const enriched = list.results.map((ind) => ({
      individual: ind,
      lastSeen: lastSeenMap.get(ind.uuid) ?? null,
    }));

    return {
      totalCount: list.count,
      lookBackDays: days,
      individuals: enriched,
    };
  }

  /**
   * Aylık rapor — her birey için o ayda gelinen gün sayısı (MEB raporu için temel veri).
   *
   * Maliyet: ay başından bugüne kadar her gün için 1 summary çağrısı (max 31).
   * Detaylı ders sayısı için per-individual activity fetch gerekir; bu sürüm
   * sadece "gelinen gün sayısı" + birey meta veriyor. MEB raporu formatına
   * göre kullanıcı bunu Excel'de işleyebilir.
   */
  async getMonthlyReport(month: string /* YYYY-MM */): Promise<Array<{
    uuid: string;
    full_name: string;
    identity_number: string;
    individual_type: number;
    disability_code: string;
    daysAttended: number;
    firstSeen: string | null;
    lastSeen: string | null;
  }>> {
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    const lastDay = new Date(year, monthNum, 0).getDate();
    const today = turkishToday();

    const dates: string[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${yearStr}-${monthStr.padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      if (dateStr > today) break;
      dates.push(dateStr);
    }

    const summaries = await Promise.all(
      dates.map((date) =>
        this.adapter
          .getTodayActivitySummary({
            pageSize: 100,
            date: isTodayInTurkey(date) ? undefined : date,
          })
          .catch(() => ({ count: 0, next: null, previous: null, results: [] as InnovaDailySummary[] })),
      ),
    );

    // Per-UUID aggregate
    const stats = new Map<string, { daysAttended: number; firstSeen: string | null; lastSeen: string | null }>();
    for (const s of summaries) {
      for (const r of s.results) {
        const existing = stats.get(r.individual_uuid) ?? { daysAttended: 0, firstSeen: null, lastSeen: null };
        existing.daysAttended += 1;
        const candidate = r.last_exit || r.first_entry;
        if (candidate) {
          if (!existing.firstSeen || candidate < existing.firstSeen) existing.firstSeen = candidate;
          if (!existing.lastSeen || candidate > existing.lastSeen) existing.lastSeen = candidate;
        }
        stats.set(r.individual_uuid, existing);
      }
    }

    const uuids = [...stats.keys()];
    const individuals = await this.cache.getIndividuals(uuids);

    const rows = [];
    for (const [uuid, s] of stats) {
      const ind = individuals.get(uuid);
      if (!ind) continue;
      rows.push({
        uuid,
        full_name: ind.full_name,
        identity_number: ind.identity_number,
        individual_type: ind.individual_type,
        disability_code: ind.disability_code,
        daysAttended: s.daysAttended,
        firstSeen: s.firstSeen,
        lastSeen: s.lastSeen,
      });
    }

    // Çok gelen üstte
    rows.sort((a, b) => b.daysAttended - a.daysAttended);
    return rows;
  }

  private async fetchWeekStats(endDate: string, days: number): Promise<WeekStats> {
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      dates.push(shiftDateStr(endDate, -i));
    }

    const results = await Promise.all(
      dates.map(async (date) => {
        try {
          const isToday = isTodayInTurkey(date);
          const summary = await this.adapter.getTodayActivitySummary({
            pageSize: 100,
            date: isToday ? undefined : date,
          });
          return { date, results: summary.results };
        } catch {
          return { date, results: [] as InnovaDailySummaryShort[] };
        }
      }),
    );

    const allUuids = new Set<string>();
    const dailyCounts: { date: string; count: number }[] = [];
    for (const r of results) {
      for (const item of r.results) {
        allUuids.add(item.individual_uuid);
      }
      dailyCounts.push({ date: r.date, count: r.results.length });
    }

    return {
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      totalIndividuals: allUuids.size,
      dailyCounts,
    };
  }
}

// fetchWeekStats için minimal type (BRY summary'sinin tek bir item'ı)
interface InnovaDailySummaryShort {
  individual_uuid: string;
}
