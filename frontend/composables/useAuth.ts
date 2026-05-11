/**
 * Cihaz auth — pair-code ile alınan token'ı yönetir.
 *
 * Mac webview (localhost) zaten backend'e bypass'la geçiyor; bu composable
 * fiilen sadece telefonda iş görür. Mac'te token olmaz, fetch'ler header'sız atılır,
 * backend localhost diye geçer.
 *
 * Storage: localStorage (kalıcı, Safari/iOS PWA dahil destekli).
 */

const TOKEN_KEY = 'brytakip-device-token';
// Geçiş: eski "luden-bkds-device-token" key'inden migrate ediyoruz.
const TOKEN_KEY_LEGACY = 'luden-bkds-device-token';

export const useAuth = () => {
  const token = useState<string | null>('luden-auth-token', () => null);

  // İlk çalışmada localStorage'tan oku. Eski key'den migrate eder.
  const loadFromStorage = () => {
    if (typeof window === 'undefined') return;
    if (token.value) return;
    try {
      let stored = window.localStorage.getItem(TOKEN_KEY);
      if (!stored) {
        // Eski "luden-bkds-device-token" key'inden bir kerelik migration
        const legacy = window.localStorage.getItem(TOKEN_KEY_LEGACY);
        if (legacy) {
          window.localStorage.setItem(TOKEN_KEY, legacy);
          window.localStorage.removeItem(TOKEN_KEY_LEGACY);
          stored = legacy;
        }
      }
      token.value = stored;
    } catch {
      // private mode vs.
    }
  };

  const setToken = (t: string) => {
    token.value = t;
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(TOKEN_KEY, t); } catch {}
    }
  };

  const clearToken = () => {
    token.value = null;
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(TOKEN_KEY); } catch {}
    }
  };

  /**
   * Mac webview / localhost mu? Bu durumda token gereksiz.
   */
  const isLocalhost = (): boolean => {
    if (typeof window === 'undefined') return false;
    const h = window.location.hostname;
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === 'tauri.localhost' ||
      window.location.protocol === 'tauri:'
    );
  };

  /**
   * fetch için Authorization header (localhost ise yok).
   */
  const authHeader = (): Record<string, string> => {
    if (isLocalhost()) return {};
    if (!token.value) return {};
    return { Authorization: `Bearer ${token.value}` };
  };

  /**
   * Backend URL'e WS query param için: localhost değil + token varsa.
   */
  const wsTokenParam = (): string => {
    if (isLocalhost()) return '';
    if (!token.value) return '';
    return `?token=${encodeURIComponent(token.value)}`;
  };

  return {
    token,
    loadFromStorage,
    setToken,
    clearToken,
    isLocalhost,
    authHeader,
    wsTokenParam,
  };
};
