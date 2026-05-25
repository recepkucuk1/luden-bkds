// Nuxt 3 + PWA + Tailwind config
// Backend URL'i runtime'da değiştirilebilir olsun diye runtimeConfig ile veriyoruz

export default defineNuxtConfig({
  compatibilityDate: '2024-09-01',
  devtools: { enabled: false },
  // SPA modu — Tauri webview'i static dosyalardan açacak
  ssr: false,
  modules: ['@nuxtjs/tailwindcss', '@vite-pwa/nuxt'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'BRY Takip',
      htmlAttrs: { lang: 'tr' },
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
        },
        { name: 'theme-color', content: '#0f6e56', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#0a4734', media: '(prefers-color-scheme: dark)' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'BRY Takip' },
        { name: 'application-name', content: 'BRY Takip' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon-180.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icons/icon-192.png' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/icons/icon-512.png' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1290x2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1179x2556.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1284x2778.png', media: '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1170x2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1080x2340.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1242x2688.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-828x1792.png', media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1125x2436.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1242x2208.png', media: '(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-750x1334.png', media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-640x1136.png', media: '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-2048x2732.png', media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1668x2388.png', media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1488x2266.png', media: '(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2)' },
        { rel: 'apple-touch-startup-image', href: '/splash/apple-splash-1620x2160.png', media: '(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2)' },
      ],
      script: [
        {
          // Erken tema uygulayıcı — Vue mount'tan önce html.dark class'ı belirler.
          // Bu sayede dark mode kullanıcı flash of white görmez.
          // localStorage'tan tercih oku: 'system' (default) | 'light' | 'dark'.
          innerHTML: `
            (function() {
              try {
                var t = localStorage.getItem('brytakip-theme') || 'system';
                var dark = t === 'dark' || (t === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (dark) document.documentElement.classList.add('dark');
              } catch (e) {}
            })();
          `,
          tagPosition: 'head',
        },
      ],
    },
  },

  // Backend URL'i — geliştirmede aynı Mac, üretimde aynı bilgisayar
  // Telefondan erişirken Mac'in yerel IP'sini kullanacağız
  runtimeConfig: {
    public: {
      backendUrl: process.env.NUXT_PUBLIC_BACKEND_URL || 'http://localhost:8787',
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      id: '/',
      name: 'BRY Takip',
      short_name: 'BRY Takip',
      description: 'BKDS giriş-çıkış anlık takip — özel eğitim merkezleri için',
      theme_color: '#0f6e56',
      // background_color = brand renk; iOS dark splash flash'ını önler
      background_color: '#0f6e56',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      lang: 'tr',
      dir: 'ltr',
      categories: ['productivity', 'business', 'education'],
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
      shortcuts: [
        { name: 'Bireyler', short_name: 'Bireyler', url: '/bireyler', description: 'Tüm bireylerin listesi' },
        { name: 'İstatistik', short_name: 'İstatistik', url: '/istatistik', description: 'Günlük dağılım' },
        { name: 'Ayarlar', short_name: 'Ayarlar', url: '/settings', description: 'Ayarlar' },
      ],
    },
    workbox: {
      // Offline shell — backend kopukken (Mac uyandı / WiFi koptu) en azından
      // marka kabuğu görünsün, beyaz sayfa olmasın.
      navigateFallback: '/offline.html',
      // Bilinen sayfa rotaları için fallback'i atla (yeni route'lar offline iken
      // navigate edilirse fallback kullanılır)
      navigateFallbackDenylist: [/^\/api\//, /^\/ws/, /^\/healthz/],
      // Sayfayı her zaman ağdan al — cache'lenmiş eski sayfa gösterme
      runtimeCaching: [
        {
          urlPattern: ({ request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'pages',
            networkTimeoutSeconds: 3,
          },
        },
      ],
      globPatterns: ['**/*.{js,css,svg,png,ico,html}'],
      importScripts: ['/sw-push.js'],
    },
    devOptions: {
      enabled: true,
      type: 'module',
    },
  },
});
