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
      title: 'Luden BKDS',
      meta: [
        { charset: 'utf-8' },
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
        },
        { name: 'theme-color', content: '#0f6e56' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
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
      name: 'Luden BKDS',
      short_name: 'Luden BKDS',
      description: 'BKDS anlık takip',
      theme_color: '#0f6e56',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    workbox: {
      navigateFallback: null,
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
      globPatterns: ['**/*.{js,css,svg,png,ico}'],
      importScripts: ['/sw-push.js'],
    },
    devOptions: {
      enabled: true,
      type: 'module',
    },
  },
});
