/**
 * Sayfa açılmadan önce iki kontrol:
 *  1. Telefon (localhost değil) ve token yoksa → /pair'e yönlendir
 *  2. BRY config yoksa → /setup'a yönlendir
 *
 * /pair, /setup: middleware'i atla (her zaman erişilebilir).
 */

export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/setup') return;
  if (to.path === '/pair') return;
  if (import.meta.server) return;

  const loc = window.location;
  const isLocal =
    loc.protocol === 'tauri:' ||
    loc.hostname === 'tauri.localhost' ||
    loc.hostname === 'localhost' ||
    loc.hostname === '127.0.0.1';

  const backendUrl = isLocal
    ? 'http://localhost:8787'
    : `${loc.protocol}//${loc.hostname}:8787`;

  // 1. Telefon ise token kontrolü
  if (!isLocal) {
    let token: string | null = null;
    try { token = window.localStorage.getItem('brytakip-device-token'); } catch {}
    if (!token) {
      return navigateTo('/pair');
    }
  }

  // 2. Config kontrolü (auth header gerekirse ekle)
  try {
    const headers: Record<string, string> = {};
    if (!isLocal) {
      const t = window.localStorage.getItem('brytakip-device-token');
      if (t) headers.Authorization = `Bearer ${t}`;
    }
    const r = await $fetch<{ configured: boolean }>(
      `${backendUrl}/api/setup/status`,
      { headers },
    );
    if (!r.configured) {
      // Telefon kullanıcısı setup yapamaz (localhost-only endpoint), yine de /setup'a
      // gidip durumu görsün; setup.vue ekranı kuruluma başlanmamışsa açıklayıcı bir
      // mesaj gösterebilir. Şimdilik anasayfada hata gösterilecek.
      if (isLocal) {
        return navigateTo('/setup');
      }
    }
  } catch {
    // Backend'e ulaşılamıyorsa anasayfada hata gösterilecek
  }
});
