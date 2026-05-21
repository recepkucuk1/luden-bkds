/**
 * Backend port keşfi — uygulama açılışında çalışır (client-only).
 *
 * Backend 8787 doluysa 8788+'a düşebilir (server.ts port fallback). Bundled
 * Tauri webview'i bu portu bilemez; burada /healthz ile aralığı tarayıp doğru
 * porta kilitleniriz. Plugin async olduğu için Nuxt sayfaları render etmeden
 * önce bekler → useBkds() ilk çağrıldığında backendUrl doğru porta sahip olur.
 *
 * Mutlu yol (8787 boş): ilk probe anında yanıt verir, gecikme ~ms.
 */
import { ensureBackendPort } from '~/composables/useBkds';

export default defineNuxtPlugin(async () => {
  await ensureBackendPort();
});
