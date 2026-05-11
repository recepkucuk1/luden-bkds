/**
 * Polling servisi
 *
 * Her N saniyede bir BRY'yi yoklar, yeni aktivite var mı bakar.
 * Yeni olay bulursa "newActivity" eventi yayar — WebSocket bunu dinler
 * ve bağlı telefonlara yerel ağ üzerinden iletir (telefon Notification API
 * ile yerel bildirim gösterir; Web Push YOK).
 *
 * Strateji (akıllı invalidation):
 *  - getTodayActivitySummary çağır (hızlı, ~70ms; tüm UUID'ler + first_entry/last_exit)
 *  - Önceki turdaki summary sinyali (en geç hareket zamanı) ile karşılaştır
 *  - Sadece sinyali değişen UUID'ler için aktivite cache'ini yenile
 *    → BRY'ye gereksiz istek YOK, cache TTL anlamlı kalıyor
 *  - Yeni gelen activity uuid'lerini "seenActivities" set'i ile karşılaştır
 *  - Set'te olmayan uuid = yeni olay = event yay
 *
 * Gün dönümü: TR günü değişince seen-set sıfırlanır + first-run modu yeniden açılır.
 *
 * Hata toleransı (exponential backoff):
 *  BRY ulaşılamaz duruma düşerse 5s'de bir denemek yerine 5s → 10s → 20s → ...
 *  şeklinde geriye çekilir (max 5 dakika). İlk başarıda interval normal'e döner.
 *  Bu sayede BRY 30 dakika düşmüş olsa bile saatlik istek sayısı 1000 değil ~12 olur.
 */

import { EventEmitter } from 'node:events';
import type { InnovaBryAdapter } from '../adapters/innova.js';
import type { CacheService } from './cache.js';
import type { InnovaActivity, InnovaIndividual } from '../types/innova.js';

const DEFAULT_INTERVAL_MS = 5000;  // 5 saniye
const MAX_BACKOFF_MS = 5 * 60 * 1000; // 5 dakika

// EventEmitter default 10 listener uyarısı verir. Birden fazla telefon WS'ye bağlanınca
// limit aşılır. Pilot için 50 yeterli; daha büyük dağıtımda artırılabilir.
const MAX_LISTENERS = 50;

export interface NewActivityEvent {
  activity: InnovaActivity;
  individual: InnovaIndividual | null;
}

export interface PollingStats {
  isRunning: boolean;
  consecutiveErrors: number;
  isInBackoff: boolean;
  currentDelayMs: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  totalPolls: number;
  totalErrors: number;
}

export class PollingService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private seenActivities = new Set<string>();
  private isFirstRun = true;
  private isPolling = false;
  private lastSeenDay: string | null = null;
  private summarySignals = new Map<string, string>();

  // Resilience stats
  private consecutiveErrors = 0;
  private currentDelayMs = DEFAULT_INTERVAL_MS;
  private lastSuccessAt: Date | null = null;
  private lastErrorAt: Date | null = null;
  private lastErrorMessage: string | null = null;
  private totalPolls = 0;
  private totalErrors = 0;

  constructor(
    private adapter: InnovaBryAdapter,
    private cache: CacheService,
    private intervalMs = DEFAULT_INTERVAL_MS,
  ) {
    super();
    this.setMaxListeners(MAX_LISTENERS);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.consecutiveErrors = 0;
    this.currentDelayMs = this.intervalMs;
    this.scheduleNextPoll(0); // İlk poll'u hemen yap
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getStats(): PollingStats {
    return {
      isRunning: this.running,
      consecutiveErrors: this.consecutiveErrors,
      isInBackoff: this.consecutiveErrors > 0,
      currentDelayMs: this.currentDelayMs,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: this.lastErrorAt?.toISOString() ?? null,
      lastErrorMessage: this.lastErrorMessage,
      totalPolls: this.totalPolls,
      totalErrors: this.totalErrors,
    };
  }

  /**
   * Bir sonraki poll'u zamanla. Exponential backoff hata sayısına göre delay belirler.
   */
  private scheduleNextPoll(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll()
        .then(() => {
          // Başarı: sayaçları sıfırla, normal interval'a dön
          this.consecutiveErrors = 0;
          this.currentDelayMs = this.intervalMs;
          this.lastSuccessAt = new Date();
          this.totalPolls++;
        })
        .catch((err) => {
          this.consecutiveErrors++;
          this.totalErrors++;
          this.totalPolls++;
          this.lastErrorAt = new Date();
          this.lastErrorMessage = err?.message ?? String(err);
          this.emit('error', err);

          // Exponential backoff: 5s × 2^(n-1), max MAX_BACKOFF_MS
          // 1.hata: 10s, 2.hata: 20s, 3.hata: 40s, ..., max 5dk
          this.currentDelayMs = Math.min(
            this.intervalMs * Math.pow(2, this.consecutiveErrors),
            MAX_BACKOFF_MS,
          );
        })
        .finally(() => {
          if (this.running) {
            this.scheduleNextPoll(this.currentDelayMs);
          }
        });
    }, delayMs);
  }

  /**
   * TR günü değiştiyse durumu sıfırla. Aksi halde seenActivities set'i sınırsız büyür.
   */
  private rotateIfNewDay(): void {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
    if (this.lastSeenDay !== null && this.lastSeenDay !== today) {
      this.seenActivities.clear();
      this.summarySignals.clear();
      this.cache.invalidateActivities();
      this.isFirstRun = true; // yeni güne sessizce drain et
    }
    this.lastSeenDay = today;
  }

  private async poll(): Promise<void> {
    // Bir polling çalışırken yenisini başlatma (yavaş bir tur olursa overlap olmasın)
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      this.rotateIfNewDay();

      const summary = await this.adapter.getTodayActivitySummary({ pageSize: 100 });
      const uuids = summary.results.map((r) => r.individual_uuid);

      // Sinyal: her UUID için summary'deki en geç zaman (last_exit > first_entry).
      // Bu zaman önceki tura göre değiştiyse → o UUID'nin aktivitesini yenile.
      const uuidsToRefresh: string[] = [];
      for (const r of summary.results) {
        const signal = [r.first_entry, r.last_exit]
          .filter(Boolean)
          .sort()
          .pop() ?? '';
        const known = this.summarySignals.get(r.individual_uuid);
        if (!known || signal > known) {
          uuidsToRefresh.push(r.individual_uuid);
          this.summarySignals.set(r.individual_uuid, signal);
        }
      }

      // Sadece değişen UUID'ler için BRY'ye git, cache'i güncelle
      await Promise.all(
        uuidsToRefresh.map((uuid) =>
          this.cache.refreshActivities(uuid).catch(() => {/* tekil hatayı yut */}),
        ),
      );

      const fresh: { act: InnovaActivity; ind: InnovaIndividual | null }[] = [];
      await Promise.all(
        uuids.map(async (uuid) => {
          try {
            const acts = await this.cache.getActivities(uuid);
            const ind = await this.cache.getIndividual(uuid).catch(() => null);
            for (const act of acts) {
              if (!this.seenActivities.has(act.uuid)) {
                fresh.push({ act, ind });
              }
            }
          } catch {
            /* ignore single-individual errors */
          }
        }),
      );

      // İlk turda her şey "yeni" — onları event olarak yayma, sadece kayda al
      if (this.isFirstRun) {
        for (const { act } of fresh) this.seenActivities.add(act.uuid);
        this.isFirstRun = false;
        this.emit('snapshotReady');
        return;
      }

      // Sonraki turlarda gerçekten yeni olanları yay
      // Eski → yeni sırada yay (kullanıcı doğal sırayla görsün)
      fresh.sort((a, b) => a.act.activity_time.localeCompare(b.act.activity_time));
      for (const { act, ind } of fresh) {
        this.seenActivities.add(act.uuid);
        const event: NewActivityEvent = { activity: act, individual: ind };
        this.emit('newActivity', event);
      }

      if (fresh.length > 0) {
        this.emit('snapshotReady');
      }
    } finally {
      this.isPolling = false;
    }
  }
}
