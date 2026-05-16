<script setup lang="ts">
/**
 * Telefon Ekle — yeni telefonu uygulamaya eşler.
 *
 * Mac/PC üzerinde açılır (auth.isLocalhost()). Telefon QR'ı tarar veya
 * tarayıcıdan adresi açar, 6 haneli kodu girer, eşleme tamamlanır.
 *
 * Backend zaten /api/auth/pair-code (10 dk geçerli) ve /api/auth/pair
 * (kodu doğrula, device token ver) endpoint'lerini sağlıyor.
 */
import QRCode from 'qrcode';

const { backendUrl } = useBkds();
const auth = useAuth();
const network = useNetworkInfo();

const pairCode = ref<string | null>(null);
const pairCodeExpiresAt = ref<string | null>(null);
const deviceCount = ref<number | null>(null);
const qrSvg = ref<string>('');
const rotating = ref(false);
const copied = ref(false);
let pairTimer: ReturnType<typeof setInterval> | null = null;

async function fetchPairCode() {
  try {
    const r = await $fetch<{ code: string; expiresAt: string }>(
      `${backendUrl}/api/auth/pair-code`,
    );
    pairCode.value = r.code;
    pairCodeExpiresAt.value = r.expiresAt;
  } catch {
    pairCode.value = null;
  }
}

async function fetchDeviceCount() {
  try {
    const r = await $fetch<{ count: number }>(`${backendUrl}/api/auth/devices`);
    deviceCount.value = r.count;
  } catch {
    deviceCount.value = null;
  }
}

async function rotateCode() {
  rotating.value = true;
  try {
    const r = await $fetch<{ code: string; expiresAt: string }>(
      `${backendUrl}/api/auth/rotate-pair-code`,
      { method: 'POST' },
    );
    pairCode.value = r.code;
    pairCodeExpiresAt.value = r.expiresAt;
  } catch {
    /* ignore */
  } finally {
    rotating.value = false;
  }
}

// QR içeriği: telefondan açılacak adres + kod (telefon ekrandan kodu tekrar
// girmek zorunda kalmasın diye URL'e ?code=XXXXXX append ediyoruz; pair sayfası
// query'den okuyup otomatik dolduracak)
const qrUrl = computed(() => {
  const base = network.primaryUrl.value;
  if (!base) return '';
  const sep = base.includes('?') ? '&' : '?';
  return pairCode.value ? `${base}/pair${sep}code=${pairCode.value}` : `${base}/pair`;
});

async function regenerateQr() {
  if (!qrUrl.value) {
    qrSvg.value = '';
    return;
  }
  try {
    qrSvg.value = await QRCode.toString(qrUrl.value, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
      color: {
        dark: '#0f172a',  // slate-900
        light: '#ffffff',
      },
    });
  } catch {
    qrSvg.value = '';
  }
}

async function copyUrl() {
  if (!network.primaryUrl.value) return;
  try {
    await navigator.clipboard.writeText(`${network.primaryUrl.value}/pair`);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  } catch {/* ignore */}
}

// Kod veya URL değiştiğinde QR'ı yeniden üret
watch([qrUrl], regenerateQr, { immediate: false });

onMounted(async () => {
  if (!auth.isLocalhost()) return;
  await network.refresh();
  await fetchPairCode();
  await fetchDeviceCount();
  await regenerateQr();
  pairTimer = setInterval(() => {
    void fetchPairCode();
    void fetchDeviceCount();
  }, 5_000);
});

onUnmounted(() => {
  if (pairTimer) clearInterval(pairTimer);
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 pt-[env(safe-area-inset-top)]">
      <div class="px-4 py-3 flex items-center gap-3">
        <NuxtLink
          to="/"
          class="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
          aria-label="Geri"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </NuxtLink>
        <div>
          <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">BRY Takip</p>
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">Telefon Ekle</h1>
        </div>
      </div>
    </header>

    <main class="flex-1 px-4 py-5">
      <!-- Telefonda açıldıysa uyarı -->
      <div
        v-if="!auth.isLocalhost()"
        class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-4 text-sm text-amber-900 dark:text-amber-100 leading-relaxed"
      >
        <p class="font-medium mb-1">Bu ekran sadece bilgisayar üzerinde gösterilir.</p>
        <p>BRY Takip uygulamasını Mac veya Windows'a kurun, ardından "Telefon Ekle" butonuna basın.</p>
      </div>

      <!-- Ana içerik -->
      <div v-else class="space-y-5">
        <!-- Açıklama -->
        <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          Telefonunuz kurum WiFi'sinde olmalı. Aşağıdaki QR'ı telefon kameranızla okutun
          <span class="text-gray-400">veya</span>
          adresi ve kodu manuel olarak girin.
        </p>

        <!-- QR kod kartı -->
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
          <div
            v-if="qrSvg"
            class="bg-white rounded-xl p-3 mx-auto"
            style="max-width: 260px"
            v-html="qrSvg"
          />
          <div
            v-else
            class="bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 mx-auto"
            style="max-width: 260px; aspect-ratio: 1"
          >
            QR hazırlanıyor...
          </div>
          <p class="text-[11px] text-gray-500 dark:text-gray-400 text-center mt-3 leading-relaxed">
            Bu QR hem adresi hem 6 haneli kodu içerir — telefonda hiçbir şey yazmaya gerek kalmaz.
          </p>
        </div>

        <!-- Manuel: URL -->
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <p class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-2">
            <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand text-white text-[10px] font-semibold mr-1.5">1</span>
            Telefon tarayıcısında bu adresi açın
          </p>
          <div class="flex items-center gap-2">
            <div
              v-if="network.primaryUrl.value"
              class="flex-1 font-mono text-[13px] text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 select-all break-all"
            >
              {{ network.primaryUrl.value }}/pair
            </div>
            <div
              v-else
              class="flex-1 text-[12px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2"
            >
              Ağ adresi alınıyor...
            </div>
            <button
              type="button"
              class="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg active:opacity-80 whitespace-nowrap"
              :disabled="!network.primaryUrl.value"
              @click="copyUrl"
            >
              {{ copied ? '✓' : 'Kopyala' }}
            </button>
          </div>

          <div
            v-if="network.urls.value.length > 1"
            class="mt-2 space-y-0.5"
          >
            <p class="text-[10px] text-gray-500 dark:text-gray-400">Alternatif adresler:</p>
            <div
              v-for="alt in network.urls.value.slice(1)"
              :key="alt"
              class="font-mono text-[11px] text-gray-600 dark:text-gray-400 select-all break-all"
            >
              {{ alt }}/pair
            </div>
          </div>

          <!-- Windows Firewall uyarısı -->
          <div
            v-if="network.isWindowsTauri.value"
            class="mt-2 text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-2 leading-relaxed"
          >
            <p class="font-medium mb-0.5">⚠ Windows Firewall</p>
            <p>
              Telefon bağlanamıyorsa Firewall blokluyor olabilir. Başlat →
              <strong>Windows Defender Güvenlik Duvarı</strong> → "Bir uygulamaya izin ver" → listede
              <strong>brytakip-backend</strong>'i bul, <strong>Özel</strong> ve <strong>Genel</strong>'i işaretle.
            </p>
          </div>
        </div>

        <!-- Manuel: 6 haneli kod -->
        <div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4">
          <p class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-2">
            <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand text-white text-[10px] font-semibold mr-1.5">2</span>
            Telefonda bu kodu girin
          </p>
          <div
            class="text-center text-3xl font-mono font-semibold tracking-[0.4em] text-brand
                   bg-gray-50 dark:bg-gray-800 py-4 rounded-xl select-all"
          >
            {{ pairCode ?? '——————' }}
          </div>
          <div class="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mt-2">
            <span>10 dk geçerli</span>
            <button
              type="button"
              class="text-brand hover:underline disabled:opacity-50"
              :disabled="rotating"
              @click="rotateCode"
            >
              {{ rotating ? 'Yenileniyor...' : 'Kodu yenile' }}
            </button>
          </div>
        </div>

        <!-- Mevcut cihaz sayısı -->
        <div class="bg-brand-50 dark:bg-brand-950/30 rounded-xl p-3 flex items-center justify-between">
          <div>
            <p class="text-xs text-brand-dark dark:text-brand-200 font-medium">Şu an eşli telefon</p>
            <p class="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
              Yeni eşleme yapınca buradaki sayı artar.
            </p>
          </div>
          <span class="text-2xl font-semibold text-brand">
            {{ deviceCount ?? '–' }}
          </span>
        </div>

        <!-- Footer link -->
        <NuxtLink
          to="/settings"
          class="block text-center text-xs text-gray-500 dark:text-gray-400 hover:text-brand py-2"
        >
          Ayarlar &raquo; cihaz yönetimi
        </NuxtLink>
      </div>
    </main>
  </div>
</template>
