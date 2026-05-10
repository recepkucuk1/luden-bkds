<script setup lang="ts">
const { snapshot, loading, error, fetchSnapshot, connectWs, disconnectWs } = useBkds();
const { relative } = useFormatters();
const { autoCheckOnStartup } = useUpdater();

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
  <div class="min-h-screen bg-white pb-8">
    <AppHeader />
    <LiveNotification />
    <UpdateBanner />

    <div v-if="error" class="mx-4 mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
      <p class="font-medium">Bağlanılamadı</p>
      <p class="text-[11px] mt-0.5 opacity-80">{{ error }}</p>
      <button
        class="mt-2 px-3 py-1 bg-white rounded-lg text-xs font-medium border border-red-200"
        @click="fetchSnapshot()"
      >
        Tekrar dene
      </button>
    </div>

    <StatsCards />

    <div
      v-if="cameraWarning"
      class="mx-4 mt-3 p-3 rounded-xl bg-amber-50 flex items-start gap-2.5"
    >
      <span class="text-amber-600 text-base leading-none mt-0.5">⚠</span>
      <div class="flex-1">
        <p class="text-sm font-medium text-amber-800">{{ cameraWarning }}</p>
        <p class="text-[11px] text-amber-700 mt-0.5">Kameraları kontrol et</p>
      </div>
    </div>

    <div class="px-4 mt-4">
      <div class="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
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
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500'
          "
          @click="filter = f.v as Filter"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <div v-if="loading && !snapshot" class="px-4 mt-4 space-y-2">
      <div v-for="i in 5" :key="i" class="h-14 bg-gray-100 rounded-xl animate-pulse" />
    </div>

    <template v-else-if="snapshot">
      <section class="mt-4">
        <div class="px-4 flex items-center justify-between mb-2">
          <h2 class="text-[11px] uppercase tracking-wider text-gray-500 font-medium">
            Bugün
          </h2>
          <span class="text-[11px] text-gray-400">{{ filteredList.length }} kişi</span>
        </div>
        <div
          v-if="filteredList.length === 0"
          class="mx-4 p-4 bg-gray-50 rounded-xl text-center text-xs text-gray-500"
        >
          Bu kategoride kayıt yok
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

      <p class="text-center text-[10px] text-gray-400 mt-6">
        Son güncelleme: {{ relative(snapshot.generatedAt) }}
      </p>
    </template>
  </div>
</template>
