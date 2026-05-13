<script setup lang="ts">
const { snapshot, loading, error, fetchSnapshot, connectWs, disconnectWs } = useBkds();
const { relative } = useFormatters();
const { autoCheckOnStartup } = useUpdater();
const license = useLicense();
const auth = useAuth();

// Tüm akordeonların paylaştığı reactive "şu an" — her dakika tik atar
// İçerideyken süre canlı sayar
const now = useState<number>('app-now', () => Date.now());
let nowTimer: ReturnType<typeof setInterval>;

onMounted(() => {
  fetchSnapshot();
  connectWs();
  // Her dakika "şu an"ı güncelle — ders saati hesabı canlı kalsın
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 60000);
  // Tauri içindeyse 5 sn sonra güncelleme kontrolü (PWA'da no-op)
  autoCheckOnStartup(5000);

  // Lisans cache'i yalnızca localhost'ta (Mac/Win Tauri app) anlamlı;
  // telefondaki PWA Mac'in proxy'si, kendi lisans state'i tutmaz
  if (auth.isLocalhost()) {
    license.loadCached();
    if (license.status.value?.key && license.shouldReverify()) {
      license.reverify().catch(() => { /* internet yoksa cache geçerli */ });
    }
  }
});

onUnmounted(() => {
  disconnectWs();
  if (nowTimer) clearInterval(nowTimer);
});

const onResume = () => {
  // Sayfa görünür olduğunda her zaman snapshot'ı yenile + WS'yi yeniden bağla
  fetchSnapshot();
  connectWs();  // Bu zaten eski WS'yi kapatıp yenisini kuruyor
};

const onVisibility = () => {
  if (document.visibilityState === 'visible') {
    onResume();
  }
};

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onResume);
  window.addEventListener('pageshow', onResume);  // iOS Safari için kritik
});
onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', onResume);
  window.removeEventListener('pageshow', onResume);
});

const presence = computed(() => snapshot.value?.presence ?? []);

type Filter = 'all' | 'student' | 'staff';
const filter = ref<Filter>('all');

// Filtre uygulanmış, içerideler üstte, sonra son aktiviteye göre azalan
const filteredList = computed(() => {
  let items = presence.value;
  if (filter.value === 'student')
    items = items.filter((p) => p.individual.individual_type === 1);
  else if (filter.value === 'staff')
    items = items.filter((p) => p.individual.individual_type === 2);

  return [...items].sort((a, b) => {
    // Son aktivite zamanı (yeni → eski)
    return b.lastActivity.activity_time.localeCompare(a.lastActivity.activity_time);
  });
});

const lastReadingMinutesAgo = computed(() => {
  if (!snapshot.value?.presence.length) return null;
  let latest = '';
  for (const p of snapshot.value.presence) {
    if (p.lastActivity.activity_time > latest) latest = p.lastActivity.activity_time;
  }
  if (!latest) return null;
  return Math.floor((Date.now() - new Date(latest).getTime()) / 60000);
});

const cameraWarning = computed(() => {
  const m = lastReadingMinutesAgo.value;
  if (m === null) return null;
  const h = new Date().getHours();
  if (h < 8 || h >= 20) return null;
  if (m >= 15) return `${m} dk okuma yok`;
  return null;
});
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 pb-8">
    <AppHeader />
    <LiveNotification />
    <UpdateBanner />

    <!-- Lisans uyarıları — yalnızca localhost'ta (Mac/Win app), telefonda
         lisans state'i ayrı; banner orada anlamsız -->
    <NuxtLink
      v-if="auth.isLocalhost() && license.status.value?.key && !license.isActive.value && !license.isPending.value"
      to="/settings"
      class="block mx-4 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm active:opacity-80"
    >
      <p class="font-medium">
        Lisans uyarısı:
        {{
          license.isExpired.value
            ? 'süresi doldu'
            : license.isRevoked.value
              ? 'iptal edilmiş'
              : license.isWrongMachine.value
                ? 'başka bir cihaza bağlı'
                : 'geçersiz'
        }}
      </p>
      <p class="text-[11px] mt-0.5 opacity-80">Ayarlar → Lisansı yenileyin</p>
    </NuxtLink>
    <NuxtLink
      v-else-if="
        auth.isLocalhost()
          && license.isActive.value
          && license.daysUntilExpiry.value !== null
          && license.daysUntilExpiry.value <= 30
      "
      to="/settings"
      class="block mx-4 mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-sm active:opacity-80"
    >
      <p class="font-medium">
        Lisansınızın bitmesine {{ license.daysUntilExpiry.value }} gün kaldı
      </p>
      <p class="text-[11px] mt-0.5 opacity-80">Yenileme için brytakip.com</p>
    </NuxtLink>

    <div v-if="error" class="mx-4 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
      <p class="font-medium">Veriler yüklenemedi</p>
      <p class="text-[11px] mt-0.5 opacity-80 leading-relaxed">{{ error }}</p>
      <div class="flex items-center gap-2 mt-2">
        <button
          class="px-3 py-1 bg-white dark:bg-gray-800 rounded-lg text-xs font-medium border border-red-200 dark:border-red-900 active:bg-red-50 dark:active:bg-red-950/60"
          @click="fetchSnapshot()"
        >
          Tekrar dene
        </button>
        <NuxtLink
          to="/settings"
          class="text-[11px] text-red-700 dark:text-red-300 underline"
        >
          Sistem durumuna bak →
        </NuxtLink>
      </div>
    </div>

    <StatsCards />

    <div
      v-if="cameraWarning"
      class="mx-4 mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-start gap-2.5"
    >
      <span class="text-amber-600 dark:text-amber-400 text-base leading-none mt-0.5">⚠</span>
      <div class="flex-1">
        <p class="text-sm font-medium text-amber-800 dark:text-amber-200">{{ cameraWarning }}</p>
        <p class="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">Kameraları kontrol et</p>
      </div>
    </div>

    <div class="px-4 mt-4">
      <div class="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs">
        <button
          v-for="f in [
            { v: 'all', label: 'Hepsi' },
            { v: 'student', label: 'Birey' },
            { v: 'staff', label: 'Personel' },
          ]"
          :key="f.v"
          class="px-3 py-1.5 rounded-md font-medium transition-colors"
          :class="
            filter === f.v
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400'
          "
          @click="filter = f.v as Filter"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <div v-if="loading && !snapshot" class="px-4 mt-4 space-y-2">
      <div v-for="i in 5" :key="i" class="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
    </div>

    <template v-else-if="snapshot">
      <section class="mt-4">
        <div class="px-4 flex items-center justify-between mb-2">
          <h2 class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
            Bugün
          </h2>
          <span class="text-[11px] text-gray-400 dark:text-gray-500">{{ filteredList.length }} kişi</span>
        </div>
        <!-- Empty state — başlangıçta veya kategori boşken -->
        <div
          v-if="filteredList.length === 0"
          class="mx-4 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl text-center"
        >
          <div class="w-12 h-12 mx-auto mb-2 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-xl text-gray-300 dark:text-gray-500">
            ⌀
          </div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-200">
            Bu kategoride henüz kayıt yok
          </p>
          <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
            BRY kameralarınızdan ilk hareket geldiğinde burada görünecek.
          </p>
        </div>
        <div v-else class="px-4 space-y-1.5">
          <IndividualAccordion
            v-for="p in filteredList"
            :key="p.individual.uuid"
            :individual="p.individual"
            :last-activity="p.lastActivity"
            :today-activity-count="p.todayActivityCount"
            :first-entry="p.firstEntry"
            :last-exit="p.lastExit"
          />
        </div>
      </section>

      <p class="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-6">
        Son güncelleme: {{ relative(snapshot.generatedAt) }}
      </p>
    </template>
  </div>
</template>
