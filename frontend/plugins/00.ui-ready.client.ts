/**
 * Açılış sinyali — Tauri kabuğuna "JS paketi yüklendi, sayfa çalışıyor" der.
 *
 * Kabuk (desktop/src-tauri/src/lib.rs) her sayfa yüklemesinde bir bekçi
 * kurar; bu sinyal belirli süre içinde gelmezse WebView2'nin HTTP önbelleğini
 * ve service worker'larını temizleyip uygulamayı baştan yükler. Böylece
 * önbelleğe yazılmış bir yönlendirme veya bozuk bir SW yüzünden beyaz kalan
 * pencere, kullanıcı hiçbir şey yapmadan kendini toparlar.
 *
 * Dosya adı "00." ile başlıyor: Nuxt eklentileri ada göre sıralar, bu yüzden
 * sinyal backend port keşfini (backend-port.client.ts) beklemeden gider.
 * Backend'in geç açılması önbellek sorunu değildir, bekçiyi tetiklememeli.
 */
export default defineNuxtPlugin(() => {
  if (!('__TAURI_INTERNALS__' in window)) return;
  import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('ui_ready'))
    .catch(() => {/* eski kabuk komutu tanımıyorsa sessiz geç */});
});
