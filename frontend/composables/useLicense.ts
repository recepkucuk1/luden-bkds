/**
 * BRY Takip SaaS lisans doğrulama.
 *
 * Akış:
 *  1. Kullanıcı SaaS panelinden (brytakip.com) signup yapar
 *  2. Recep o kuruma `BRY-XXXX-XXXX-XXXX-XXXX` formatında lisans üretir
 *  3. Kullanıcı bu key'i settings → Lisans bölümünde girer
 *  4. `verify(key)` brytakip.com/api/license/verify'a POST atar
 *  5. Backend cihaza bağlar (ilk verify'de machineId set), status döner
 *  6. Sonuç localStorage'da cache'lenir; uygulama boot'ta `reverify()` yapar
 *
 * Machine binding: lisansı bir cihaza bağlar. Aynı key başka cihazdan
 * gelirse `WRONG_MACHINE` döner (Recep manuel reset edebilir).
 *
 * Cache: 24 saatte bir SaaS'a re-verify. Offline'da son bilinen status
 * geçerli sayılır (kurum sahibi internetsiz BKDS izlemeye devam etsin).
 *
 * Plan'lar:
 *   LITE      — ücretsiz, sınırlı (yorumlar yok)
 *   STANDART  — 299 ₺/ay
 *   PRO       — 599 ₺/ay (full feature)
 */

const API_BASE = 'https://brytakip.com';
const STORAGE_KEY = 'brytakip-license';
const MACHINE_ID_KEY = 'brytakip-machine-id';
const REVERIFY_INTERVAL_MS = 60 * 60 * 1000; // 1 saat — admin/iyzico iptalleri makul süre içinde yakalansın
const PERIODIC_REVERIFY_INTERVAL_MS = 30 * 60 * 1000; // app açıkken 30 dk'da bir background tick
const NETWORK_GRACE_MS = 24 * 60 * 60 * 1000; // internet 24 saatten fazla yoksa hard-block

// Backend tek plan'a geçti — 'plan' field'ı yerine 'subStatus' kullanılır
export type LicenseRemoteStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'EXPIRED'
  | 'REVOKED'
  | 'INVALID'
  | 'WRONG_MACHINE'
  | 'SUBSCRIPTION_INVALID' // trial bitti veya abonelik EXPIRED/PAST_DUE
  | 'NETWORK_ERROR';

export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'CANCELED'
  | 'EXPIRED'
  | 'PAST_DUE'
  | 'NONE'; // backend subscription bulamadı

export interface LicenseStatus {
  status: LicenseRemoteStatus;
  subStatus: SubscriptionStatus | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  expiresAt: string | null;
  key: string | null;
  kurumEmail: string | null;  // brytakip.com'a yönlendirirken otomatik tanıma için
  lastVerifiedAt: string | null;
  message?: string;
}

const isLocalStorageAvailable = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return !!window.localStorage;
  } catch {
    return false;
  }
};

export const useLicense = () => {
  const status = useState<LicenseStatus | null>('brytakip-license-status', () => null);
  const verifying = useState<boolean>('brytakip-license-verifying', () => false);

  /** Stable machine ID — localStorage'da kalıcı, ilk kez random UUID üretir. */
  const getMachineId = (): string => {
    if (!isLocalStorageAvailable()) return 'unknown';
    try {
      let id = window.localStorage.getItem(MACHINE_ID_KEY);
      if (!id) {
        // crypto.randomUUID hem secure context hem Tauri'de var
        id = `mac-${(crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
        window.localStorage.setItem(MACHINE_ID_KEY, id);
      }
      return id;
    } catch {
      return 'unknown';
    }
  };

  /** localStorage'tan cache'lenmiş status'u oku. */
  const loadCached = (): LicenseStatus | null => {
    if (!isLocalStorageAvailable()) return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LicenseStatus;
      status.value = parsed;
      return parsed;
    } catch {
      return null;
    }
  };

  /** Status'u localStorage'a yaz. */
  const saveCached = (s: LicenseStatus) => {
    status.value = s;
    if (!isLocalStorageAvailable()) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // localStorage doluysa sessizce geç
    }
  };

  /** Cache'i tamamen sil — kullanıcı lisansını değiştirmek istediğinde. */
  const clearCached = () => {
    status.value = null;
    if (!isLocalStorageAvailable()) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  /**
   * SaaS'a lisansı sor. Hata olsa bile status değerini saklar
   * (network error'larda son bilinen status kalır).
   */
  /**
   * brytakip.com panel'i tarayıcıda aç. Kullanıcının email'i URL'de
   * geçirilir → landing otomatik panel görünümüne yönlendirir.
   * Tauri içindeysek shell.open ile dış tarayıcı, değilsek window.open.
   */
  const openCheckoutPage = async () => {
    const email = status.value?.kurumEmail ?? '';
    const key = status.value?.key ?? '';
    let url = 'https://brytakip.com/#/signup';
    if (email) {
      // lk: panel status çağrısında kimlik kanıtı — kurum PII + lisans anahtarı erişimini açar
      const qs = new URLSearchParams({ email });
      if (key) qs.set('lk', key);
      url = `https://brytakip.com/?${qs.toString()}#/panel`;
    }

    if (typeof window === 'undefined') return;
    const isInTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
    if (isInTauri) {
      try {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(url);
        return;
      } catch {
        // fallback aşağı düşer
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const verify = async (rawKey: string): Promise<LicenseStatus> => {
    const key = rawKey.trim().toUpperCase();
    if (!key) {
      const r: LicenseStatus = {
        status: 'INVALID',
        subStatus: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
        expiresAt: null,
        key: null,
        lastVerifiedAt: new Date().toISOString(),
        message: 'Lisans anahtarı boş',
      };
      return r;
    }

    const machineId = getMachineId();
    verifying.value = true;
    let result: LicenseStatus;

    try {
      const resp = await $fetch<{
        status: LicenseRemoteStatus;
        subStatus: SubscriptionStatus | null;
        trialEndsAt: string | null;
        currentPeriodEnd: string | null;
        expiresAt: string;
        kurumEmail?: string | null;
      }>(`${API_BASE}/api/license/verify`, {
        method: 'POST',
        body: { key, machineId },
        retry: 0,
      });
      result = {
        status: resp.status,
        subStatus: resp.subStatus ?? null,
        trialEndsAt: resp.trialEndsAt ?? null,
        currentPeriodEnd: resp.currentPeriodEnd ?? null,
        expiresAt: resp.expiresAt ?? null,
        key,
        kurumEmail: resp.kurumEmail ?? null,
        lastVerifiedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      const data = err?.data || err?.response?._data;
      const cached = status.value;
      if (data?.status) {
        result = {
          status: data.status as LicenseRemoteStatus,
          subStatus: data.subStatus ?? null,
          trialEndsAt: data.trialEndsAt ?? null,
          currentPeriodEnd: data.currentPeriodEnd ?? null,
          expiresAt: data.expiresAt ?? null,
          key,
          kurumEmail: cached?.kurumEmail ?? null,
          lastVerifiedAt: new Date().toISOString(),
          message: data.error,
        };
      } else {
        result = {
          status: 'NETWORK_ERROR',
          subStatus: cached?.subStatus ?? null,
          trialEndsAt: cached?.trialEndsAt ?? null,
          currentPeriodEnd: cached?.currentPeriodEnd ?? null,
          expiresAt: cached?.expiresAt ?? null,
          key: cached?.key ?? key,
          kurumEmail: cached?.kurumEmail ?? null,
          lastVerifiedAt: cached?.lastVerifiedAt ?? null,
          message: 'Sunucuya bağlanılamadı (internet yok?)',
        };
      }
    } finally {
      verifying.value = false;
    }

    saveCached(result);
    return result;
  };

  /** 24h'dan eski verify varsa true. */
  const shouldReverify = (): boolean => {
    if (!status.value?.lastVerifiedAt) return true;
    const last = new Date(status.value.lastVerifiedAt).getTime();
    if (Number.isNaN(last)) return true;
    return Date.now() - last > REVERIFY_INTERVAL_MS;
  };

  /**
   * Cache'deki key'le sessizce re-verify.
   * Boot'ta çağırılır, kullanıcıya görünmez. NETWORK_ERROR ise sessiz geç.
   */
  const reverify = async (force = false): Promise<LicenseStatus | null> => {
    loadCached();
    const cached = status.value;
    if (!cached?.key) return null;
    if (!force && !shouldReverify()) return cached;
    return verify(cached.key);
  };

  // ── Computed durumlar ─────────────────────────────────────────
  // License-level (key veya machine sorunu)
  const isActive = computed(() => status.value?.status === 'ACTIVE');
  const isPending = computed(() => status.value?.status === 'PENDING');
  const isExpired = computed(() => status.value?.status === 'EXPIRED');
  const isRevoked = computed(() => status.value?.status === 'REVOKED');
  const isWrongMachine = computed(() => status.value?.status === 'WRONG_MACHINE');
  const isInvalid = computed(() => status.value?.status === 'INVALID');

  // Subscription-level
  const subStatus = computed(() => status.value?.subStatus ?? null);
  const isSubTrial = computed(() => subStatus.value === 'TRIAL');
  const isSubActive = computed(() => subStatus.value === 'ACTIVE');
  const isSubCanceled = computed(() => subStatus.value === 'CANCELED');
  const isSubExpired = computed(() => subStatus.value === 'EXPIRED');
  const isSubPastDue = computed(() => subStatus.value === 'PAST_DUE');
  const isSubscriptionInvalid = computed(() => status.value?.status === 'SUBSCRIPTION_INVALID');

  // Uygulamanın fiilen kullanılabilir/blokeli olup olmadığı `isBlocked` ile
  // belirlenir (aşağıda). PENDING lisans + geçerli abonelik bloke değildir.

  const expiresAt = computed(() => status.value?.expiresAt ?? null);
  const trialEndsAt = computed(() => status.value?.trialEndsAt ?? null);
  const currentPeriodEnd = computed(() => status.value?.currentPeriodEnd ?? null);

  /** Trial bitimine kalan gün — TRIAL durumunda anlamlı. */
  const daysUntilTrialEnd = computed(() => {
    if (!status.value?.trialEndsAt) return null;
    const ms = new Date(status.value.trialEndsAt).getTime() - Date.now();
    if (Number.isNaN(ms)) return null;
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  });

  /**
   * Lisans key var ama lisans kullanılamaz mı?
   * Hard-block için kritik: bu true ise uygulama BKDS data'sını
   * göstermemeli, kullanıcıya "ödeme/yenileme" modalı açmalı.
   *
   * Network error toleransı: son başarılı verify'den NETWORK_GRACE_MS
   * (24 saat) geçmemişse, henüz block etme — kullanıcı offline'da çalışabilsin.
   */
  const isBlocked = computed(() => {
    const s = status.value;
    if (!s?.key) return false; // henüz lisans aktive etmemiş — block değil, "aktive et" UX'i
    // Sert reddedilenler: hemen block
    if (s.status === 'INVALID' || s.status === 'REVOKED' || s.status === 'WRONG_MACHINE') return true;
    if (s.status === 'EXPIRED' || s.status === 'SUBSCRIPTION_INVALID') return true;
    // Subscription tarafı pasif olduysa block
    if (s.subStatus === 'EXPIRED' || s.subStatus === 'PAST_DUE' || s.subStatus === 'NONE') return true;
    // NETWORK_ERROR: 24 saatten az süredir offline'sak block etme
    if (s.status === 'NETWORK_ERROR') {
      if (!s.lastVerifiedAt) return true; // hiç verify yapmadıysak block
      const since = Date.now() - new Date(s.lastVerifiedAt).getTime();
      return since > NETWORK_GRACE_MS;
    }
    return false;
  });

  /** Aktif aboneliğin dönem bitimine kalan gün. */
  const daysUntilPeriodEnd = computed(() => {
    if (!status.value?.currentPeriodEnd) return null;
    const ms = new Date(status.value.currentPeriodEnd).getTime() - Date.now();
    if (Number.isNaN(ms)) return null;
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  });

  /** Lisans expiresAt'a kalan gün (genelde subscription'la aynı). */
  const daysUntilExpiry = computed(() => {
    if (!status.value?.expiresAt) return null;
    const ms = new Date(status.value.expiresAt).getTime() - Date.now();
    if (Number.isNaN(ms)) return null;
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  });

  return {
    status: readonly(status),
    verifying: readonly(verifying),
    // License flags
    isActive,
    isPending,
    isExpired,
    isRevoked,
    isWrongMachine,
    isInvalid,
    // Subscription flags
    subStatus,
    isSubTrial,
    isSubActive,
    isSubCanceled,
    isSubExpired,
    isSubPastDue,
    isSubscriptionInvalid,
    isBlocked,
    // Dates
    trialEndsAt,
    currentPeriodEnd,
    expiresAt,
    daysUntilTrialEnd,
    daysUntilPeriodEnd,
    daysUntilExpiry,
    // Actions
    getMachineId,
    loadCached,
    saveCached,
    clearCached,
    verify,
    reverify,
    shouldReverify,
    openCheckoutPage,
  };
};
