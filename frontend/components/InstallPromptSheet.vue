<script setup lang="ts">
// PWA yükleme yönlendirme bottom-sheet'i.
// - iOS Safari'de adım adım "Paylaş → Ana Ekrana Ekle" rehberi
// - Android Chrome'da native beforeinstallprompt'u tetikleyen buton
//
// Görünme koşulu (useInstallPrompt.shouldShow):
//   - Standalone değil, Tauri değil, localhost değil
//   - Son dismiss 14 günden önceyse VE (iOS Safari || Android+prompt yakalandı)
// İlk WS bağlantısı kurulup snapshot geldikten 8 sn sonra otomatik açılır,
// kullanıcı önce gerçek değeri görsün.

const install = useInstallPrompt();
const { wsConnected, snapshot } = useBkds();

const autoShown = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  install.detect();

  // İlk değer geldikten ve WS bağlandıktan sonra timer başlat
  watch(
    () => wsConnected.value && !!snapshot.value && !autoShown.value,
    (ready) => {
      if (!ready) return;
      autoShown.value = true;
      timer = setTimeout(() => {
        if (install.shouldShow()) install.open();
      }, 8000);
    },
    { immediate: true },
  );
});

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});

const onInstallClick = async () => {
  // Android: native prompt; iOS: zaten manuel rehber ekranı gösteriyoruz
  if (install.isAndroid.value && install.hasNativePrompt.value) {
    await install.triggerNative();
  }
};

const onLater = () => install.markDismissed();
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="install.sheetOpen.value"
        class="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
        @click.self="install.close()"
      >
        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="translate-y-full sm:translate-y-4 opacity-0"
          enter-to-class="translate-y-0 opacity-100"
          leave-active-class="transition duration-200 ease-in"
          leave-from-class="translate-y-0 opacity-100"
          leave-to-class="translate-y-full sm:translate-y-4 opacity-0"
          appear
        >
          <div
            v-if="install.sheetOpen.value"
            class="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
          >
            <!-- Tutamaç -->
            <div class="sm:hidden flex justify-center pt-2 pb-1">
              <div class="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
            </div>

            <div class="px-5 pt-4 pb-5">
              <div class="flex items-center gap-3 mb-3">
                <img
                  src="/icons/apple-touch-icon-180.png"
                  alt=""
                  class="w-12 h-12 rounded-xl"
                  width="48"
                  height="48"
                />
                <div>
                  <h2 id="install-title" class="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Ana ekrana ekle
                  </h2>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    BRY Takip'i bir uygulama gibi kullan
                  </p>
                </div>
              </div>

              <p class="text-sm text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                Tarayıcı çubukları olmadan tam ekran. İkonu home screen'de.
                Bildirimler de açılabilir.
              </p>

              <!-- iOS rehberi: 3 adım, ikon eşliğinde -->
              <ol v-if="install.isIos.value" class="space-y-3 mb-5">
                <li class="flex items-start gap-3">
                  <span class="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center">1</span>
                  <div class="text-sm text-gray-700 dark:text-gray-200 leading-snug">
                    Aşağıdaki <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 mx-0.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                      <span class="text-xs font-medium">Paylaş</span>
                    </span> butonuna dokun
                  </div>
                </li>
                <li class="flex items-start gap-3">
                  <span class="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center">2</span>
                  <div class="text-sm text-gray-700 dark:text-gray-200 leading-snug">
                    Listede <strong>"Ana Ekrana Ekle"</strong> seçeneğini bul
                  </div>
                </li>
                <li class="flex items-start gap-3">
                  <span class="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center">3</span>
                  <div class="text-sm text-gray-700 dark:text-gray-200 leading-snug">
                    Sağ üstte <strong>"Ekle"</strong>ye dokun
                  </div>
                </li>
              </ol>

              <!-- Android: tek butonla native prompt -->
              <div v-else-if="install.isAndroid.value && install.hasNativePrompt.value" class="mb-5">
                <button
                  type="button"
                  class="w-full px-4 py-3 bg-brand text-white text-sm font-semibold rounded-xl active:bg-brand-dark"
                  style="touch-action: manipulation"
                  @click="onInstallClick"
                >
                  Yükle
                </button>
              </div>

              <!-- Diğer (desktop browser vb.) — sessiz fallback -->
              <p v-else class="text-xs text-gray-500 dark:text-gray-400 mb-5">
                Tarayıcı menüsünden "Uygulamayı yükle" seçeneğini kullanabilirsin.
              </p>

              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-xl active:opacity-70"
                  style="touch-action: manipulation"
                  @click="onLater"
                >
                  Daha sonra
                </button>
                <button
                  v-if="install.isIos.value"
                  type="button"
                  class="flex-1 px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-xl active:bg-brand-dark"
                  style="touch-action: manipulation"
                  @click="install.close()"
                >
                  Anladım
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
