<script setup lang="ts">
/**
 * Ay ızgarası tabanı — A ve B'nin paylaştığı sunum bileşeni.
 * Hücre içeriğini parent `#cell` slot'u ile verir; ay durumunu parent tutar.
 */
const props = defineProps<{
  year: number;
  month: number;
  today: string; // YYYY-MM-DD (TR)
}>();

const emit = defineEmits<{ (e: 'prev'): void; (e: 'next'): void }>();

const weekdays = weekdayLabels();
const cells = computed(() => monthMatrix(props.year, props.month));
const label = computed(() => formatMonthTr(props.year, props.month));
const nextDisabled = computed(() => {
  const n = shiftMonth(props.year, props.month, 1);
  return isFutureMonth(n.year, n.month, props.today);
});
</script>

<template>
  <div>
    <div class="px-4 flex items-center justify-between mb-3">
      <button
        type="button"
        class="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label="Önceki ay"
        @click="emit('prev')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span class="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{{ label }}</span>
      <button
        type="button"
        :disabled="nextDisabled"
        class="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800"
        aria-label="Sonraki ay"
        @click="emit('next')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>

    <div class="px-4">
      <div class="grid grid-cols-7 gap-1 mb-1">
        <div v-for="w in weekdays" :key="w" class="text-center text-[11px] text-gray-400 dark:text-gray-500">
          {{ w }}
        </div>
      </div>
      <div class="grid grid-cols-7 gap-1">
        <template v-for="(cell, i) in cells" :key="i">
          <div v-if="!cell.date" />
          <slot
            v-else
            name="cell"
            :cell="cell"
            :is-today="cell.date === today"
            :is-future="cell.date > today"
            :is-weekend="i % 7 >= 5"
          />
        </template>
      </div>
    </div>
  </div>
</template>
