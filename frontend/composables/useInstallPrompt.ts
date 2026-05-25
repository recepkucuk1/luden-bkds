/**
 * useInstallPrompt — PWA yükleme/yönlendirme akışı
 *
 * İki platform farklı çalışır:
 *  - iOS Safari: beforeinstallprompt YOK. Kullanıcıya manuel adımları
 *    (Paylaş → Ana Ekrana Ekle) bottom-sheet ile göster.
 *  - Android Chrome: beforeinstallprompt'u yakala, kendi butonumuzla
 *    user gesture içinde prompt() çağır.
 *
 * Standalone modda (uygulama zaten yüklü) → sessiz.
 * "Daha sonra" → 14 gün hatırla.
 * Tauri webview (localhost) → sessiz (kurum bilgisayarı, yükleme zaten yok).
 */

const DISMISS_KEY = 'brytakip-install-dismissed-at';
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Modül seviyesi tek tane state — sayfa içi her yerden aynı.
let cachedPromptEvent: BeforeInstallPromptEvent | null = null;
let listenerAttached = false;

export const useInstallPrompt = () => {
  const isStandalone = useState<boolean>('install-standalone', () => false);
  const isIos = useState<boolean>('install-is-ios', () => false);
  const isAndroid = useState<boolean>('install-is-android', () => false);
  const isTauri = useState<boolean>('install-is-tauri', () => false);
  const hasNativePrompt = useState<boolean>('install-has-native', () => false);
  const sheetOpen = useState<boolean>('install-sheet-open', () => false);

  const detect = () => {
    if (typeof window === 'undefined') return;
    isStandalone.value =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    const ua = navigator.userAgent;
    isIos.value = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    isAndroid.value = /Android/.test(ua);
    isTauri.value = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;

    if (!listenerAttached) {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        cachedPromptEvent = e as BeforeInstallPromptEvent;
        hasNativePrompt.value = true;
      });
      // Uygulama yüklenince temizle
      window.addEventListener('appinstalled', () => {
        cachedPromptEvent = null;
        hasNativePrompt.value = false;
        isStandalone.value = true;
      });
      listenerAttached = true;
    }
  };

  /**
   * Şu an prompt'u göstermek mantıklı mı?
   * - Standalone'da değil (zaten yüklü)
   * - Tauri içinde değil (kurum bilgisayarı)
   * - Localhost değil (Mac uygulaması içinde değil)
   * - Son dismiss 14 gün önceden geçmiş
   * - iOS Safari veya Android (prompt yakalanmış) olmalı
   */
  const shouldShow = (): boolean => {
    if (typeof window === 'undefined') return false;
    if (isStandalone.value) return false;
    if (isTauri.value) return false;
    const loc = window.location;
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') return false;
    // Dismiss cooldown
    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const ms = Date.now() - Number(dismissedAt);
        if (ms < DISMISS_DAYS * 24 * 60 * 60 * 1000) return false;
      }
    } catch { /* ignore */ }
    // Android'de henüz beforeinstallprompt yakalanmadıysa bekle
    if (isAndroid.value && !hasNativePrompt.value) return false;
    if (!isIos.value && !isAndroid.value) return false;
    return true;
  };

  /**
   * Native install prompt (sadece Android Chrome / Edge / Brave).
   * iOS'ta çağırma — UI manuel rehberi gösterir.
   */
  const triggerNative = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!cachedPromptEvent) return 'unavailable';
    try {
      await cachedPromptEvent.prompt();
      const { outcome } = await cachedPromptEvent.userChoice;
      cachedPromptEvent = null;
      hasNativePrompt.value = false;
      if (outcome === 'dismissed') markDismissed();
      return outcome;
    } catch {
      return 'unavailable';
    }
  };

  const markDismissed = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    sheetOpen.value = false;
  };

  const open = () => { sheetOpen.value = true; };
  const close = () => { sheetOpen.value = false; };

  return {
    isStandalone,
    isIos,
    isAndroid,
    isTauri,
    hasNativePrompt,
    sheetOpen,
    detect,
    shouldShow,
    triggerNative,
    markDismissed,
    open,
    close,
  };
};
