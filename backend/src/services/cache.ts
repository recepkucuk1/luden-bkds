/**
 * Bellek-içi cache servisi
 *
 * Niye? INNOVA'nın birey detay endpoint'i (1.5-1.8 saniye) çok yavaş.
 * Birey isimleri günde belki 1-2 değişir, her sorguda çekmenin anlamı yok.
 *
 * Strateji:
 *  - İsim cache: UUID → InnovaIndividual, TTL 1 saat
 *  - Aktivite cache: bireyin bugünkü aktiviteleri, TTL 30 saniye
 *
 * Tek instance olarak server.ts'de yaratılır, her yere oradan dağıtılır.
 */

import type { InnovaIndividual, InnovaActivity } from '../types/innova.js';
import type { InnovaBryAdapter } from '../adapters/innova.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const INDIVIDUAL_TTL_MS = 60 * 60 * 1000;       // 1 saat
const ACTIVITIES_TTL_MS = 30 * 1000;            // 30 saniye — bugünkü veri
const HISTORICAL_ACTIVITIES_TTL_MS = 60 * 60 * 1000;  // 1 saat — geçmiş gün statik

export class CacheService {
  private individuals = new Map<string, CacheEntry<InnovaIndividual>>();
  private activities = new Map<string, CacheEntry<InnovaActivity[]>>();
  // Geçmiş gün aktiviteleri — key: "uuid:YYYY-MM-DD"
  private historicalActivities = new Map<string, CacheEntry<InnovaActivity[]>>();
  // Eşzamanlı isteklerin aynı UUID için tekrar fetch yapmamasını sağla
  private inflightIndividuals = new Map<string, Promise<InnovaIndividual>>();

  constructor(private adapter: InnovaBryAdapter) {}

  /**
   * UUID → birey bilgisi. Cache'de varsa anında, yoksa fetch + cache.
   */
  async getIndividual(uuid: string): Promise<InnovaIndividual> {
    const cached = this.individuals.get(uuid);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    // Eşzamanlı dedup
    const inflight = this.inflightIndividuals.get(uuid);
    if (inflight) return inflight;

    const promise = this.adapter.getIndividual(uuid).then((value) => {
      this.individuals.set(uuid, { value, expiresAt: Date.now() + INDIVIDUAL_TTL_MS });
      this.inflightIndividuals.delete(uuid);
      return value;
    }).catch((err) => {
      this.inflightIndividuals.delete(uuid);
      throw err;
    });

    this.inflightIndividuals.set(uuid, promise);
    return promise;
  }

  /**
   * Birden fazla UUID için isim getir — paralelde çek, hepsi cache'e yazılır.
   */
  async getIndividuals(uuids: string[]): Promise<Map<string, InnovaIndividual>> {
    const results = await Promise.all(
      uuids.map((uuid) =>
        this.getIndividual(uuid).then((ind) => [uuid, ind] as const).catch(() => null),
      ),
    );
    const map = new Map<string, InnovaIndividual>();
    for (const r of results) if (r) map.set(r[0], r[1]);
    return map;
  }

  /**
   * Bireyin bugünkü aktivite listesi (kısa TTL — anlık durumda kullanılıyor).
   */
  async getActivities(uuid: string): Promise<InnovaActivity[]> {
    const cached = this.activities.get(uuid);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    const res = await this.adapter.getIndividualActivities(uuid);
    this.activities.set(uuid, {
      value: res.results,
      expiresAt: Date.now() + ACTIVITIES_TTL_MS,
    });
    return res.results;
  }

  /**
   * Bir UUID için aktivite cache'ini zorla yenile (TTL'i sıfırlamadan, cache'i taze ile değiştirir).
   * Polling servisi summary'de değişiklik gördüğü UUID'ler için bunu çağırır —
   * sadece değişen kayıtlar için BRY'ye gider.
   */
  async refreshActivities(uuid: string): Promise<InnovaActivity[]> {
    const res = await this.adapter.getIndividualActivities(uuid);
    this.activities.set(uuid, {
      value: res.results,
      expiresAt: Date.now() + ACTIVITIES_TTL_MS,
    });
    return res.results;
  }

  /**
   * Geçmiş bir günün bireyin aktivite listesi. Statik veri olduğu için daha
   * uzun TTL (1 saat). Bugün için bu metod yerine getActivities() kullanın —
   * o polling servisinin akıllı invalidation'ına bağlı kısa TTL ile çalışır.
   */
  async getActivitiesForDate(uuid: string, date: string): Promise<InnovaActivity[]> {
    const key = `${uuid}:${date}`;
    const cached = this.historicalActivities.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    const res = await this.adapter.getIndividualActivities(uuid, { date });
    this.historicalActivities.set(key, {
      value: res.results,
      expiresAt: Date.now() + HISTORICAL_ACTIVITIES_TTL_MS,
    });
    return res.results;
  }

  /**
   * Polling servisi yeni veri görünce cache'i invalide etmek için kullanır.
   */
  invalidateActivities(uuid?: string): void {
    if (uuid) this.activities.delete(uuid);
    else this.activities.clear();
  }
}
