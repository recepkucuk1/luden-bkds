<script setup lang="ts">
/**
 * Son 7 gün vs önceki 7 gün karşılaştırması.
 *
 * Backend her hafta için 7 günlük summary çekip union'la farklı birey sayısı
 * hesaplar. Frontend iki haftayı yan yana mini sparkline + sayı ile gösterir.
 *
 * Selected date'ten bağımsız — her zaman "şu an"ın son 7 günü baz alınır.
 */
const { backendUrl, authHeaders } = useBkds();

interface WeekStats {
  startDate: string;
  endDate: string;
  totalIndividuals: number;
  dailyCounts: { date: string; count: number }[];
}

interface ComparisonResponse {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
}

const { data, pending } = await useFetch<ComparisonResponse>(
  () => `${backendUrl}/api/weekly-comparison`,
  { headers: authHeaders() },
);

const trend = computed(() => {
  if (!data.value) return null;
  const tw = data.value.thisWeek.totalIndividuals;
  const lw = data.value.lastWeek.totalIndividuals;
  if (lw === 0) {
    return tw > 0 ? { sign: '+', pct: 100, dir: 'up' as const } : null;
  }
  const pct = Math.round(((tw - lw) / lw) * 100);
  if (pct === 0) return { sign: '', pct: 0, dir: 'flat' as const };
  return { sign: pct > 0 ? '+' : '', pct, dir: pct > 0 ? ('up' as const) : ('down' as const) };
});

const maxDaily = computed(() => {
  if (!data.value) return 1;
  const all = [
    ...data.value.thisWeek.dailyCounts,
    ...data.value.lastWeek.dailyCounts,
  ];
  return Math.max(...all.map((d) => d.count), 1);
});

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00+03:00`).toLocaleDateString('tr-TR', {
    weekday: 'short',
    timeZone: 'Europe/Istanbul',
  });
}
</script>

<template>
  <div class="px-4 mt-3">
    <div class="bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
      <div class="flex items-center justify-between mb-2">
        <p class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
          Haftalık karşılaştırma
        </p>
        <p
          v-if="trend"
          class="text-[10px] font-semibold"
          :class="{
            'text-green-700 dark:text-green-400': trend.dir === 'up',
            'text-red-700 dark:text-red-400': trend.dir === 'down',
            'text-gray-500 dark:text-gray-400': trend.dir === 'flat',
          }"
        >
          {{ trend.sign }}{{ trend.pct }}%
        </p>
      </div>

      <div v-if="pending" class="h-14 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      <div v-else-if="data" class="grid grid-cols-2 gap-3">
        <div>
          <p class="text-[10px] text-gray-500 dark:text-gray-400">Son 7 gün</p>
          <div class="flex items-baseline gap-1 leading-none mt-0.5">
            <p class="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {{ data.thisWeek.totalIndividuals }}
            </p>
            <p class="text-[10px] text-gray-500 dark:text-gray-400">kişi</p>
          </div>
          <div class="flex items-end gap-px h-6 mt-2">
            <div
              v-for="d in data.thisWeek.dailyCounts"
              :key="d.date"
              class="flex-1 bg-brand dark:bg-brand-400 rounded-t-sm"
              :style="{ height: `${Math.max(8, (d.count / maxDaily) * 100)}%` }"
              :title="`${dayLabel(d.date)}: ${d.count}`"
            />
          </div>
        </div>
        <div>
          <p class="text-[10px] text-gray-500 dark:text-gray-400">Önceki 7 gün</p>
          <div class="flex items-baseline gap-1 leading-none mt-0.5">
            <p class="text-2xl font-semibold text-gray-400 dark:text-gray-500">
              {{ data.lastWeek.totalIndividuals }}
            </p>
            <p class="text-[10px] text-gray-500 dark:text-gray-400">kişi</p>
          </div>
          <div class="flex items-end gap-px h-6 mt-2">
            <div
              v-for="d in data.lastWeek.dailyCounts"
              :key="d.date"
              class="flex-1 bg-gray-300 dark:bg-gray-600 rounded-t-sm"
              :style="{ height: `${Math.max(8, (d.count / maxDaily) * 100)}%` }"
              :title="`${dayLabel(d.date)}: ${d.count}`"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
