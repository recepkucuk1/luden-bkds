<script setup lang="ts">
/**
 * Saatlik aktivite dağılımı — kompakt bar chart.
 * Özel eğitim merkezlerinin tipik açık saatleri 08-19 arası, o aralığı
 * gösteririz. Dışındaki saatlerde aktivite olursa "Tümü" toggle ile
 * tüm 24 saati de açabiliriz (şimdilik sabit 08-19, ihtiyaç doğrularsa
 * genişletiriz).
 *
 * Veriyi backend snapshot'tan alır (hourlyDistribution: number[24]).
 * Bugün için canlı, geçmiş gün için statik.
 */
const { snapshot } = useBkds();

const FIRST_HOUR = 8;
const LAST_HOUR = 19; // 19 dahil → 12 bar

const data = computed(() => snapshot.value?.hourlyDistribution ?? new Array(24).fill(0));

const bars = computed(() =>
  data.value.slice(FIRST_HOUR, LAST_HOUR + 1).map((count, i) => ({
    hour: FIRST_HOUR + i,
    count,
  })),
);

const maxVal = computed(() => Math.max(...bars.value.map((b) => b.count), 1));
const totalInRange = computed(() => bars.value.reduce((s, b) => s + b.count, 0));

const peakBar = computed(() => {
  if (totalInRange.value === 0) return null;
  return bars.value.reduce((best, cur) => (cur.count > best.count ? cur : best));
});

// Şu anki TR saati — yalnızca bugüne bakarken vurgulanır
const currentTrHour = computed(() => {
  if (!snapshot.value?.isToday) return null;
  const hourStr = new Date().toLocaleString('en-CA', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'Europe/Istanbul',
  });
  return parseInt(hourStr, 10);
});

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
</script>

<template>
  <div class="px-4 mt-3">
    <div class="bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
      <div class="flex items-center justify-between mb-2">
        <p class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
          Saatlik yoğunluk
        </p>
        <p v-if="peakBar" class="text-[10px] text-gray-500 dark:text-gray-400">
          En yoğun <span class="font-mono text-gray-700 dark:text-gray-200">{{ pad(peakBar.hour) }}:00</span>
          · {{ peakBar.count }}
        </p>
        <p v-else class="text-[10px] text-gray-400 dark:text-gray-500">veri yok</p>
      </div>
      <div class="flex items-end justify-between gap-px h-10">
        <div
          v-for="b in bars"
          :key="b.hour"
          class="flex-1 flex items-end h-full"
          :title="`${pad(b.hour)}:00 — ${b.count} hareket`"
        >
          <div
            class="w-full rounded-t-sm transition-colors"
            :class="[
              b.count > 0 ? 'bg-brand dark:bg-brand-400' : 'bg-gray-100 dark:bg-gray-700',
              currentTrHour === b.hour ? 'ring-2 ring-brand/40 dark:ring-brand/60' : '',
            ]"
            :style="{ height: `${Math.max(4, (b.count / maxVal) * 100)}%` }"
          />
        </div>
      </div>
      <div class="flex justify-between mt-1 text-[9px] text-gray-400 dark:text-gray-500 font-mono">
        <span>{{ pad(FIRST_HOUR) }}</span>
        <span>12</span>
        <span>15</span>
        <span>{{ pad(LAST_HOUR) }}</span>
      </div>
    </div>
  </div>
</template>
