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
  PresenceItem,
  RecentActivityItem,
} from '../types/innova.js';

export interface SnapshotPayload {
  generatedAt: string;
  todayCount: number;         // bugün toplam kaç kişi gelmiş (özet count)
  presence: PresenceItem[];   // birey-bazlı anlık durum (en son hareket önce)
  recentActivities: RecentActivityItem[];  // son N hareket (en yeni önce)
  manualMatchToday: number;   // bugün kaç kişi manuel eşleştirilmiş (kamera doğrulaması)
}

export class PresenceService {
  constructor(
    private adapter: InnovaBryAdapter,
    private cache: CacheService,
  ) {}

  /**
   * Anasayfanın ihtiyacı olan tüm veriyi tek bir snapshot olarak döner.
   * Frontend bunu polling ile çeker veya WebSocket "refresh" mesajıyla yeniler.
   */
  async getSnapshot(opts?: { recentLimit?: number }): Promise<SnapshotPayload> {
    const recentLimit = opts?.recentLimit ?? 10;

    // 1. Bugünkü toplam özeti
    const summary = await this.adapter.getTodayActivitySummary({ pageSize: 100 });
    const uuids = summary.results.map((r) => r.individual_uuid);

    // 2. Tüm bireylerin meta bilgisini cache'ten/INNOVA'dan al (paralel)
    const individuals = await this.cache.getIndividuals(uuids);

    // 3. Her bireyin aktivitelerini al (paralel — ilk seferde yavaş, sonra cache)
    const activitiesMap = new Map<string, InnovaActivity[]>();
    await Promise.all(
      uuids.map(async (uuid) => {
        try {
          const acts = await this.cache.getActivities(uuid);
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

    return {
      generatedAt: new Date().toISOString(),
      todayCount: summary.count,
      presence,
      recentActivities,
      manualMatchToday,
    };
  }
}
