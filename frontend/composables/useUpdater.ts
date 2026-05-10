/**
 * Tauri auto-updater wrapper.
 *
 * - Sadece Tauri webview içinde çalışır (Mac/Windows .app).
 * - Telefondan PWA olarak açıldığında no-op (window.__TAURI_INTERNALS__ yok).
 * - Tüm dosya transferi imzalanmış (signing keypair, public key tauri.conf.json'da).
 * - Manifest endpoint: tauri.conf.json `updater.endpoints` listesi.
 *
 * Tipik akış:
 *   1. Uygulama açılır, 5 sn sonra `checkNow()` arkaplanda
 *   2. Yeni sürüm varsa `updateAvailable.value` set edilir → UI banner çıkar
 *   3. Kullanıcı "Güncelle" basar → `installNow()` indirir + kurar + relaunch
 *
 * "Müdahalesizlik" prensibi: kullanıcıya soru sormadan kontrol et, yeni sürüm
 * varsa banner göster, kararı kullanıcıya bırak. Otomatik kuruluma geçmiyoruz
 * çünkü kurum sahibi BRY izlerken aniden uygulama yeniden başlasın istemeyiz.
 */

interface AvailableUpdate {
  version: string;
  notes?: string | null;
  date?: string | null;
}

const isInTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
};

export const useUpdater = () => {
  const updateAvailable = useState<AvailableUpdate | null>('luden-update', () => null);
  const status = useState<'idle' | 'checking' | 'downloading' | 'ready' | 'error'>(
    'luden-update-status',
    () => 'idle',
  );
  const errorMsg = useState<string | null>('luden-update-error', () => null);
  const currentVersion = useState<string | null>('luden-update-version', () => null);

  const loadCurrentVersion = async () => {
    if (!isInTauri()) return;
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      currentVersion.value = await getVersion();
    } catch {
      // Tauri API yoksa boş bırak
    }
  };

  /**
   * Sürüm kontrolü.
   * - silent: true ise UI'a hata yansıtmaz (auto-check için).
   *   Endpoint henüz canlı değilken / offline iken kullanıcıyı rahatsız etmemek için.
   * - silent: false (default) → kullanıcı tetiklediği manuel kontrol, hata gösterilir.
   */
  const checkNow = async (opts: { silent?: boolean } = {}): Promise<boolean> => {
    if (!isInTauri()) return false;
    const silent = !!opts.silent;
    if (!silent) {
      status.value = 'checking';
      errorMsg.value = null;
    }
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update?.available) {
        updateAvailable.value = {
          version: update.version,
          notes: update.body,
          date: update.date,
        };
        status.value = 'idle';
        return true;
      }
      updateAvailable.value = null;
      if (!silent) status.value = 'idle';
      return false;
    } catch (err: any) {
      if (!silent) {
        errorMsg.value = err?.message || 'Güncelleme kontrolü başarısız';
        status.value = 'error';
      }
      return false;
    }
  };

  const installNow = async (): Promise<void> => {
    if (!isInTauri()) return;
    status.value = 'downloading';
    errorMsg.value = null;
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      const update = await check();
      if (!update?.available) {
        status.value = 'idle';
        updateAvailable.value = null;
        return;
      }
      await update.downloadAndInstall();
      status.value = 'ready';
      // Kurulum bitti — uygulamayı yeniden başlat
      await relaunch();
    } catch (err: any) {
      errorMsg.value = err?.message || 'Güncelleme yüklenemedi';
      status.value = 'error';
    }
  };

  /**
   * Açılışta arkaplanda kontrol — UI'yi bloklamaz.
   * Endpoint canlı değilse / offline iken kullanıcıya hiçbir şey göstermez.
   */
  const autoCheckOnStartup = (delayMs = 5000) => {
    if (!isInTauri()) return;
    setTimeout(() => {
      checkNow({ silent: true }).catch(() => {/* sessizce */});
    }, delayMs);
  };

  return {
    updateAvailable,
    status,
    errorMsg,
    currentVersion,
    isInTauri,
    loadCurrentVersion,
    checkNow,
    installNow,
    autoCheckOnStartup,
  };
};
