<script setup lang="ts">
/**
 * B — tek bireyin ay devam takvimi. Geldiği günler ders rozetiyle dolu,
 * gelmediği (geçmiş hafta içi) günler kesik çizgili.
 */
import type { IndividualMonthPayload, IndividualMonthDay } from '~/composables/useCalendar';

const props = defineProps<{ uuid: string }>();
const { fetchIndividualMonth, humanizeError } = useCalendar();

const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
const [ty, tm] = todayStr.split('-').map(Number);
const year = ref(ty);
const month = ref(tm);

const data = ref<IndividualMonthPayload | null>(null);
const pending = ref(false);
const error = ref<string | null>(null);

const dayMap = computed(() => {
  const m = new Map<string, IndividualMonthDay>();
  data.value?.days.forEach((d) => m.set(d.date, d));
  return m;
});
const attendedCount = computed(() => data.value?.days.length ?? 0);
const lessonTotal = computed(() => data.value?.days.reduce((s, d) => s + d.lessons, 0) ?? 0);

async function load() {
  pending.value = true;
  error.value = null;
  try {
    data.value = await fetchIndividualMonth(props.uuid, monthKey(year.value, month.value));
  } catch (e: any) {
    error.value = humanizeError(e);
  } finally {
    pending.value = false;
  }
}

function go(delta: number) {
  const s = shiftMonth(year.value, month.value, delta);
  if (delta > 0 && isFutureMonth(s.year, s.month, todayStr)) return;
  year.value = s.year;
  month.value = s.month;
  load();
}

watch(() => props.uuid, load);
onMounted(load);
</script>

<template>
  <section class="mt-5">
    <div class="px-4 mb-2 flex items-center justify-between">
      <h2 class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
        Devam takvimi
      </h2>
      <span v-if="data" class="text-[11px] text-gray-400 dark:text-gray-500">
        {{ attendedCount }} gün · {{ lessonTotal }} ders
      </span>
    </div>

    <MonthGrid :year="year" :month="month" :today="todayStr" @prev="go(-1)" @next="go(1)">
      <template #cell="{ cell, isToday, isFuture, isWeekend }">
        <div
          class="aspect-square rounded-lg flex flex-col items-center justify-center select-none"
          :class="[
            dayMap.get(cell.date)
              ? 'bg-brand-50 text-brand'
              : isFuture
                ? 'text-gray-300 dark:text-gray-700'
                : isWeekend
                  ? 'text-gray-300 dark:text-gray-600'
                  : 'border border-dashed border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600',
            isToday ? 'ring-2 ring-brand ring-offset-1 dark:ring-offset-gray-900' : '',
          ]"
        >
          <span class="text-[10px] leading-none opacity-70">{{ cell.day }}</span>
          <span v-if="dayMap.get(cell.date)" class="text-[10px] font-semibold leading-tight mt-0.5">
            {{ dayMap.get(cell.date).lessons }}d
          </span>
          <span v-else-if="!isFuture && !isWeekend" class="text-[10px] leading-tight mt-0.5">—</span>
        </div>
      </template>
    </MonthGrid>

    <div v-if="pending && !data" class="px-4 mt-3 grid grid-cols-7 gap-1">
      <div v-for="i in 35" :key="i" class="aspect-square rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
    </div>
    <div v-else-if="error" class="mx-4 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
      {{ error }}
      <button class="underline ml-2" @click="load">Tekrar dene</button>
    </div>
  </section>
</template>
