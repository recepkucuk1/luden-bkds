/**
 * Service worker kaydı — yalnızca tarayıcı/PWA'da (client-only).
 *
 * Tauri webview'ında SW kaydedilmez: Windows'ta WebView2, SW'nin kendi
 * isteklerini Tauri'nin tauri.localhost handler'ına vermiyor → istek gerçek
 * ağa, 127.0.0.1:80'e çıkıyor. Orada bir web sunucusu (Caddy, IIS, XAMPP)
 * http→https 308 dönerse WebView2 bunu önbelleğe alıyor ve uygulama açılmıyor
 * (ERR_SSL_PROTOCOL_ERROR). Masaüstünde SW'ye zaten ihtiyaç yok: dosyalar
 * yerelden geliyor, bildirimler Tauri plugin'inden.
 *
 * Daha önce kaydolmuş bir SW varsa Tauri'de silinir.
 */
export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) return;

  const inTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (inTauri) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {/* ignore */});
    return;
  }

  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {/* SW desteklenmiyor / dev ortamı — sessiz geç */});
});
