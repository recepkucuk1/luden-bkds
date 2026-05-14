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
 * Cache: 1 saatte bir SaaS'a re-verify. Offline'da son bilinen status
 * geçerli sayılır (kurum sahibi internetsiz BKDS izlemeye devam etsin).
 *
 * Kontrat: backend `{ status, plan, expiresAt }` döner. Lisans bir
 * `expiresAt` tarihine kadar geçerlidir; ayrı bir abonelik/trial katmanı
 * yok — Faz 1'de lisanslar manuel dağıtılır.
 */

const API_BASE = 'https://brytakip.com';
const STORAGE_KEY = 'brytakip-license';
const MACHINE_ID_KEY = 'brytakip-machine-id';
const REVERIFY_INTERVAL_MS = 60 * 60 * 1000; // 1 saat — admin iptalleri makul süre içinde yakalansın
const NETWORK_GRACE_MS = 24 * 60 * 60 * 1000; // internet 24 saatten fazla yoksa hard-block

export type LicenseRemoteStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'EXPIRED'
  | 'REVOKED'
  | 'INVALID'
  | 'WRONG_MACHINE'
  | 'NETWORK_ERROR';

export type LicensePlan = 'LITE' | 'STANDART' | 'PRO';

export interface LicenseStatus {
  status: LicenseRemoteStatus;
  plan: LicensePlan | null;
  expiresAt: string | null;
  key: string | null;
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
   * brytakip.com panel'ini tarayıcıda aç. Lisans key varsa panel'e,
   * yoksa signup'a yönlendirir. Tauri içindeysek shell.open ile dış
   * tarayıcı, değilsek window.open.
   */
  const openCheckoutPage = async () => {
    const url = status.value?.key
      ? `${API_BASE}/#/panel`
      : `${API_BASE}/#/signup`;

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

  /**
   * SaaS'a lisansı sor. Hata olsa bile status değerini saklar
   * (network error'larda son bilinen status kalır).
   */
  const verify = async (rawKey: string): Promise<LicenseStatus> => {
    const key = rawKey.trim().toUpperCase();
    if (!key) {
      const r: LicenseStatus = {
        status: 'INVALID',
        plan: null,
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
        plan: LicensePlan | null;
        expiresAt: string;
      }>(`${API_BASE}/api/license/verify`, {
        method: 'POST',
        body: { key, machineId },
        retry: 0,
      });
      result = {
        status: resp.status,
        plan: resp.plan ?? null,
        expiresAt: resp.expiresAt ?? null,
        key,
        lastVerifiedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      const data = err?.data || err?.response?._data;
      const cached = status.value;
      if (data?.status) {
        result = {
          status: data.status as LicenseRemoteStatus,
          plan: data.plan ?? cached?.plan ?? null,
          expiresAt: data.expiresAt ?? null,
          key,
          lastVerifiedAt: new Date().toISOString(),
          message: data.error,
        };
      } else {
        result = {
          status: 'NETWORK_ERROR',
          plan: cached?.plan ?? null,
          expiresAt: cached?.expiresAt ?? null,
          key: cached?.key ?? key,
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

  /** Son verify REVERIFY_INTERVAL_MS'den (1 saat) eskiyse true. */
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
  const isActive = computed(() => status.value?.status === 'ACTIVE');
  const isPending = computed(() => status.value?.status === 'PENDING');
  const isExpired = computed(() => status.value?.status === 'EXPIRED');
  const isRevoked = computed(() => status.value?.status === 'REVOKED');
  const isWrongMachine = computed(() => status.value?.status === 'WRONG_MACHINE');
  const isInvalid = computed(() => status.value?.status === 'INVALID');

  /** App fiilen kullanılabilir mi? Lisans ACTIVE veya PENDING. */
  const isUsable = computed(() => isActive.value || isPending.value);

  const plan = computed(() => status.value?.plan ?? null);
  const expiresAt = computed(() => status.value?.expiresAt ?? null);

  /**
   * Lisans key var ama lisans kullanılamaz mı?
   * Hard-block için kritik: bu true ise uygulama BKDS data'sını
   * göstermemeli, kullanıcıya "yenileme" modalı açmalı.
   *
   * Network error toleransı: son başarılı verify'den NETWORK_GRACE_MS
   * (24 saat) geçmemişse, henüz block etme — kullanıcı offline'da çalışabilsin.
   */
  const isBlocked = computed(() => {
    const s = status.value;
    if (!s?.key) return false; // henüz lisans aktive etmemiş — block değil, "aktive et" UX'i
    if (s.status === 'INVALID' || s.status === 'REVOKED' || s.status === 'WRONG_MACHINE') return true;
    if (s.status === 'EXPIRED') return true;
    // NETWORK_ERROR: 24 saatten az süredir offline'sak block etme
    if (s.status === 'NETWORK_ERROR') {
      if (!s.lastVerifiedAt) return true; // hiç verify yapmadıysak block
      const since = Date.now() - new Date(s.lastVerifiedAt).getTime();
      return since > NETWORK_GRACE_MS;
    }
    return false;
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
    isUsable,
    isBlocked,
    // Data
    plan,
    expiresAt,
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
