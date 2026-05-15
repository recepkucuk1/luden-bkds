<script setup lang="ts">
/**
 * İstatistik sayfası — analitik görseller burada toplanır.
 *
 * Anasayfa "anlık durum"a odaklı; bu sayfa "şu anki kurumun trendi"ne.
 * AppHeader'daki bar-chart ikonu buraya götürür.
 */
const { selectedDate } = useBkds();

const isViewingToday = computed(() => selectedDate.value === null);
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 pb-8">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 pt-[env(safe-area-inset-top)] sticky top-0 z-10">
      <div class="px-4 py-3 flex items-center gap-3">
        <NuxtLink
          to="/"
          class="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800"
          aria-label="Geri"
        >
          <Icon name="chevron-left" :size="22" />
        </NuxtLink>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Analiz</p>
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">İstatistikler</h1>
        </div>
      </div>
    </header>

    <!-- Geçmiş gün uyarısı — saatlik dağılım o günün verisini gösterir, haftalık karşılaştırma her zaman bugüne göredir -->
    <div
      v-if="!isViewingToday"
      class="mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs leading-relaxed"
    >
      Saatlik dağılım anasayfada seçili güne (geçmiş) göredir. Haftalık karşılaştırma her zaman bugünden geriye gider.
    </div>

    <!-- Saatlik yoğunluk -->
    <section class="mt-3">
      <p class="px-4 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-1">
        Bu günün saatlik dağılımı
      </p>
      <HourlyDistribution />
    </section>

    <!-- Haftalık karşılaştırma -->
    <section class="mt-5">
      <p class="px-4 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-1">
        Trend
      </p>
      <WeeklyComparison />
    </section>
  </div>
</template>
