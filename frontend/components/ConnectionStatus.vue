<script setup lang="ts">
// Bağlantı durumu — header'daki noktayı tıklanınca popover gösterir.
// İçinde: WS durumu, son veri zamanı, "Yeniden bağlan" butonu, telefon için
// "aynı WiFi'de misin?" rehberi (sadece telefondan açıldığında).
//
// Mevcut basit yeşil/kırmızı nokta korunuyor; bu component üzerine popover ekliyor.

const { wsConnected, snapshot, error, fetchSnapshot, connectWs } = useBkds();
const auth = useAuth();

const open = ref(false);
const popoverRef = ref<HTMLElement | null>(null);
const buttonRef = ref<HTMLElement | null>(null);

const onClickOutside = (e: MouseEvent) => {
  if (!open.value) return;
  const t = e.target as Node;
  if (popoverRef.value?.contains(t) || buttonRef.value?.contains(t)) return;
  open.value = false;
};

onMounted(() => {
  document.addEventListener('click', onClickOutside);
});
onUnmounted(() => {
  document.removeEventListener('click', onClickOutside);
});

const lastUpdateAgo = computed(() => {
  if (!snapshot.value?.generatedAt) return null;
  const ms = Date.now() - new Date(snapshot.value.generatedAt).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 5) return 'az önce';
  if (s < 60) return `${s} sn önce`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  return `${h} sa önce`;
});

// Tik için canlı now
const now = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval>;
onMounted(() => {
  tickTimer = setInterval(() => (now.value = Date.now()), 5000);
});
onUnmounted(() => clearInterval(tickTimer));
// Eager re-eval — now.value değişince lastUpdateAgo da computed olduğu için yeniden hesaplanır
watch(now, () => { /* trigger */ });

const reconnect = () => {
  connectWs();
  fetchSnapshot();
  open.value = false;
};

const statusLabel = computed(() => {
  if (error.value) return 'Bağlantı kesik';
  if (wsConnected.value) return 'Canlı';
  return 'Bekleniyor';
});

const statusTone = computed(() => {
  if (error.value) return 'red';
  if (wsConnected.value) return 'green';
  return 'amber';
});
</script>

<template>
  <div class="relative">
    <button
      ref="buttonRef"
      type="button"
      class="flex items-center gap-1.5 text-xs px-1 -mx-1 py-0.5 rounded active:bg-gray-100 dark:active:bg-gray-800"
      style="touch-action: manipulation"
      :aria-expanded="open"
      aria-label="Bağlantı durumu"
      @click="open = !open"
    >
      <span
        class="w-2 h-2 rounded-full"
        :class="{
          'bg-green-500': statusTone === 'green',
          'bg-red-500': statusTone === 'red',
          'bg-amber-400': statusTone === 'amber',
        }"
      />
      <span
        :class="{
          'text-red-600 dark:text-red-400': statusTone === 'red',
          'text-amber-600 dark:text-amber-400': statusTone === 'amber',
          'text-gray-500 dark:text-gray-400': statusTone === 'green',
        }"
      >
        {{ statusLabel }}
      </span>
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        ref="popoverRef"
        class="absolute right-0 top-full mt-1.5 w-64 z-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3"
        role="dialog"
      >
        <div class="flex items-center gap-2 mb-2">
          <span
            class="w-2.5 h-2.5 rounded-full"
            :class="{
              'bg-green-500': statusTone === 'green',
              'bg-red-500': statusTone === 'red',
              'bg-amber-400': statusTone === 'amber',
            }"
          />
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ statusLabel }}</p>
        </div>

        <p v-if="lastUpdateAgo" class="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Son güncelleme: {{ lastUpdateAgo }}
        </p>

        <!-- Hata varsa rehber -->
        <div v-if="error" class="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-[11px] text-red-700 dark:text-red-300 leading-relaxed">
          {{ error }}
        </div>

        <!-- Telefondan açıldıysa "aynı WiFi'de misin" rehberi -->
        <ul
          v-if="!auth.isLocalhost() && !wsConnected"
          class="text-xs text-gray-600 dark:text-gray-300 space-y-1 mb-3 list-disc pl-4"
        >
          <li>Kurum WiFi'sine bağlı mısınız?</li>
          <li>Kurumdaki bilgisayar açık mı?</li>
          <li>BRY Takip uygulaması çalışıyor mu?</li>
        </ul>

        <button
          type="button"
          class="w-full px-3 py-2 bg-brand text-white text-xs font-medium rounded-lg active:bg-brand-dark"
          style="touch-action: manipulation"
          @click="reconnect"
        >
          Yeniden bağlan
        </button>
      </div>
    </Transition>
  </div>
</template>
