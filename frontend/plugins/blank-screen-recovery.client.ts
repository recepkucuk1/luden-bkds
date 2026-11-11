/**
 * Boş ekran kurtarma.
 *
 * Bir bileşen çizilirken hata verirse Vue o kısmı boş bırakır. Sayfanın tamamı
 * boş kalırsa pencere bembeyaz görünür. Geliştirici araçları yayın sürümünde
 * kapalı olduğu için kullanıcı da biz de hatayı göremeyiz.
 *
 * Çizim hatasından ya da sayfa geçişinden 10 sn sonra #__nuxt içinde hâlâ hiç
 * metin yoksa:
 *   - ilk seferde uygulamayı anasayfadan baştan yükler (geçici durumlar için)
 *   - 1 dakika içinde tekrar olursa döngüye girmemek için Vue'dan bağımsız düz
 *     bir hata ekranı ve "Yeniden dene" düğmesi gösterir
 *
 * Kısmen çizilmiş, kullanılabilir sayfalara dokunmaz; yalnız tam boş ekranı
 * hedefler.
 */
const RECOVER_KEY = 'brytakip-blank-recover-at';
const LOOP_WINDOW_MS = 60_000;
const CHECK_DELAY_MS = 10_000;

function isBlank(): boolean {
  const root = document.getElementById('__nuxt');
  if (!root) return true;
  return (root.innerText || '').trim().length === 0;
}

function showFallback(): void {
  if (document.getElementById('brytakip-fallback')) return;
  const el = document.createElement('div');
  el.id = 'brytakip-fallback';
  el.setAttribute(
    'style',
    'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;' +
      'background:#0f6e56;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;',
  );
  el.innerHTML =
    '<div style="font-size:20px;font-weight:600">BRY Takip</div>' +
    '<div style="font-size:14px;opacity:.85;max-width:280px;line-height:1.5">' +
    'Ekran yüklenemedi. Verileriniz güvende; uygulama arkaplanda çalışmaya devam ediyor.</div>' +
    '<button id="brytakip-fallback-retry" style="margin-top:8px;padding:10px 20px;border:0;' +
    'border-radius:12px;background:#fff;color:#0f6e56;font-size:14px;font-weight:600;cursor:pointer">' +
    'Yeniden dene</button>';
  document.body.appendChild(el);
  document.getElementById('brytakip-fallback-retry')?.addEventListener('click', () => {
    window.location.replace('/');
  });
}

function recover(): void {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RECOVER_KEY) || 0);
  } catch {}
  if (Date.now() - last < LOOP_WINDOW_MS) {
    showFallback();
    return;
  }
  try {
    sessionStorage.setItem(RECOVER_KEY, String(Date.now()));
  } catch {}
  window.location.replace('/');
}

export default defineNuxtPlugin((nuxtApp) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleCheck = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (isBlank()) recover();
    }, CHECK_DELAY_MS);
  };

  nuxtApp.hook('vue:error', (err) => {
    console.error('[blank-screen-recovery] çizim hatası:', err);
    scheduleCheck();
  });
  nuxtApp.hook('page:finish', scheduleCheck);
});
