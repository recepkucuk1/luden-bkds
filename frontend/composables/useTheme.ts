/**
 * useTheme — kullanıcı tema tercihini yönetir.
 *
 * Üç durum:
 *  - 'system'  → işletim sistemine göre (Apple Light/Dark, macOS Görünüm,
 *                Windows tema, GTK vb.) otomatik takip
 *  - 'light'   → kullanıcı her zaman aydınlık ister
 *  - 'dark'    → kullanıcı her zaman karanlık ister
 *
 * localStorage'da kalıcı. İlk açılışta nuxt.config.ts'deki inline script
 * tercihi okuyup html.dark class'ını uygular (no flash). Sonra bu composable
 * runtime'da güncellemeleri yönetir.
 */

type ThemePref = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'brytakip-theme';

const computeIsDark = (pref: ThemePref): boolean => {
  if (typeof window === 'undefined') return false;
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const applyToDocument = (isDark: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
};

export const useTheme = () => {
  const pref = useState<ThemePref>('brytakip-theme-pref', () => {
    if (typeof window === 'undefined') return 'system';
    return ((window.localStorage.getItem(STORAGE_KEY) as ThemePref) ?? 'system');
  });

  // Aktif (uygulanan) dark state — reactive computed
  const isDark = useState<boolean>('brytakip-theme-is-dark', () => {
    return computeIsDark(pref.value);
  });

  let mediaQuery: MediaQueryList | null = null;
  let listener: ((e: MediaQueryListEvent) => void) | null = null;

  const refresh = () => {
    const dark = computeIsDark(pref.value);
    isDark.value = dark;
    applyToDocument(dark);
  };

  const setPref = (next: ThemePref) => {
    pref.value = next;
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch {/* private mode */}
    }
    refresh();
  };

  /**
   * 'system' modundayken işletim sistemi tercihini izle. Tercih değişince
   * isDark otomatik güncellenir.
   */
  const watchSystem = () => {
    if (typeof window === 'undefined') return;
    if (mediaQuery) return; // zaten dinliyor
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    listener = () => {
      if (pref.value === 'system') refresh();
    };
    mediaQuery.addEventListener?.('change', listener);
  };

  const unwatchSystem = () => {
    if (mediaQuery && listener) {
      mediaQuery.removeEventListener?.('change', listener);
      mediaQuery = null;
      listener = null;
    }
  };

  return {
    pref,
    isDark,
    setPref,
    refresh,
    watchSystem,
    unwatchSystem,
  };
};
