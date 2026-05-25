<script setup lang="ts">
// Bildirim izni JIT prompt — ilk aktivite geldikten sonra mini-kart ile sor.
// Settings'teki tam akışa karşı bu hafif & opsiyonel; "şimdi izin ver" veya
// "daha sonra" → 30 gün hatırla.
//
// iOS PWA edge case: tarayıcıda açıkken Notification API var ama izin
// alındığında çalışmaz — sadece standalone modda gerçek bildirim gönderir.
// Tarayıcıdan açıldıysa "Önce ana ekrana ekleyin" şeklinde install prompt'a
// yönlendiriyoruz.

const DISMISS_KEY = 'brytakip-notif-prompt-dismissed-at';
const DISMISS_DAYS = 30;

const { lastNotification } = useBkds();
const install = useInstallPrompt();

const visible = ref(false);
const requesting = ref(false);
const isStandalone = ref(false);
const isIos = ref(false);
const isTauri = ref(false);
const isSupported = ref(false);

const detect = () => {
  if (typeof window === 'undefined') return;
  isStandalone.value =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
  isIos.value = /iPad|iPhone|iPod/.test(navigator.userAgent);
  isTauri.value = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  isSupported.value = 'Notification' in window || isTauri.value;
};

const shouldOffer = (): boolean => {
  if (!isSupported.value) return false;
  if (isTauri.value) return false; // Mac/Win uygulamada settings'ten yönetilir
  if (typeof window === 'undefined') return false;
  // Sadece localhost dışında — telefondaki PWA
  const loc = window.location;
  if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'default') return false; // zaten karar verilmiş
  try {
    const d = localStorage.getItem(DISMISS_KEY);
    if (d && Date.now() - Number(d) < DISMISS_DAYS * 24 * 60 * 60 * 1000) return false;
  } catch { /* ignore */ }
  return true;
};

const dismiss = () => {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  visible.value = false;
};

const accept = async () => {
  // iOS edge: tarayıcıda izin verirse bile bildirim çalışmaz — install'a yönlendir
  if (isIos.value && !isStandalone.value) {
    visible.value = false;
    install.open();
    return;
  }
  requesting.value = true;
  try {
    const r = await Notification.requestPermission();
    if (r !== 'default') dismiss();
  } catch {
    dismiss();
  } finally {
    requesting.value = false;
  }
};

onMounted(() => {
  detect();
  // İlk gerçek aktivite geldiğinde tetikle — kullanıcı bildirimin değerini görsün
  watch(
    () => lastNotification.value,
    (n) => {
      if (n && shouldOffer()) visible.value = true;
    },
  );
});
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="visible"
      class="fixed left-3 right-3 bottom-3 sm:left-auto sm:right-4 sm:bottom-4 sm:w-80 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-labelledby="notif-optin-title"
    >
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-full bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand-200 flex items-center justify-center flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p id="notif-optin-title" class="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Bildirimleri aç
          </p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            <template v-if="isIos && !isStandalone">
              Önce uygulamayı ana ekrana ekleyin, sonra bildirim alabilirsiniz.
            </template>
            <template v-else>
              Yeni giriş-çıkışlarda bildirim gelsin. Sadece kurum ağındayken.
            </template>
          </p>
        </div>
        <button
          type="button"
          class="-mt-1 -mr-1 w-7 h-7 flex items-center justify-center text-gray-400 active:text-gray-700"
          style="touch-action: manipulation"
          aria-label="Kapat"
          @click="dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="flex gap-2 mt-3">
        <button
          type="button"
          class="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium rounded-lg active:opacity-70"
          style="touch-action: manipulation"
          @click="dismiss"
        >
          Şimdi değil
        </button>
        <button
          type="button"
          :disabled="requesting"
          class="flex-1 px-3 py-2 bg-brand text-white text-xs font-semibold rounded-lg active:bg-brand-dark disabled:opacity-60"
          style="touch-action: manipulation"
          @click="accept"
        >
          {{ requesting ? 'İsteniyor...' : (isIos && !isStandalone ? 'Ana ekrana ekle' : 'Bildirimleri aç') }}
        </button>
      </div>
    </div>
  </Transition>
</template>
