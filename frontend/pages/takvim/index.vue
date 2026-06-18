<script setup lang="ts">
import type { CalendarMonthPayload, CalendarMonthDay } from '~/composables/useCalendar';

const { fetchMonth, humanizeError } = useCalendar();
const NuxtLink = resolveComponent('NuxtLink');

const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
const [ty, tm] = todayStr.split('-').map(Number);
const year = ref(ty);
const month = ref(tm);

const data = ref<CalendarMonthPayload | null>(null);
const pending = ref(false);
const error = ref<string | null>(null);

const dayMap = computed(() => {
  const m = new Map<string, CalendarMonthDay>();
  data.value?.days.forEach((d) => m.set(d.date, d));
  return m;
});
const maxStudents = computed(() =>
  Math.max(1, ...(data.value?.days.map((d) => d.students) ?? [0])),
);

async function load() {
  pending.value = true;
  error.value = null;
  try {
    data.value = await fetchMonth(monthKey(year.value, month.value));
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

onMounted(load);
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 pb-8">
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 pt-[env(safe-area-inset-top)]">
      <div class="px-4 py-3 flex items-center gap-3">
        <NuxtLink to="/" class="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800" aria-label="Geri">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </NuxtLink>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">BRY Takip</p>
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">Seans Takvimi</h1>
        </div>
      </div>
    </header>

    <div class="mt-4">
      <MonthGrid :year="year" :month="month" :today="todayStr" @prev="go(-1)" @next="go(1)">
        <template #cell="{ cell, isToday, isFuture, isWeekend }">
          <component
            :is="isFuture ? 'div' : NuxtLink"
            :to="isFuture ? undefined : `/takvim/${cell.date}`"
            class="aspect-square rounded-lg flex flex-col items-center justify-center select-none"
            :class="[
              isFuture
                ? 'bg-transparent text-gray-300 dark:text-gray-700'
                : heatClasses(heatLevel(dayMap.get(cell.date)?.students ?? 0, maxStudents)),
              isToday ? 'ring-2 ring-brand ring-offset-1 dark:ring-offset-gray-900' : '',
              isWeekend && !dayMap.get(cell.date)?.students ? 'opacity-60' : '',
            ]"
          >
            <span class="text-[10px] leading-none opacity-70">{{ cell.day }}</span>
            <span v-if="!isFuture && dayMap.get(cell.date)?.students" class="text-sm font-semibold leading-tight mt-0.5">
              {{ dayMap.get(cell.date).students }}
            </span>
          </component>
        </template>
      </MonthGrid>
    </div>

    <div class="px-4 mt-4 flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
      <span>az</span>
      <span class="w-4 h-3 rounded-sm bg-brand-50" />
      <span class="w-4 h-3 rounded-sm bg-brand-100" />
      <span class="w-4 h-3 rounded-sm bg-brand-light" />
      <span class="w-4 h-3 rounded-sm bg-brand" />
      <span>çok</span>
      <span class="ml-auto">öğrenci / gün</span>
    </div>

    <div v-if="pending && !data" class="px-4 mt-4">
      <div class="grid grid-cols-7 gap-1">
        <div v-for="i in 35" :key="i" class="aspect-square rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    </div>
    <div v-else-if="error" class="mx-4 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
      <p class="font-medium">Takvim yüklenemedi</p>
      <p class="text-[11px] mt-0.5 opacity-80">{{ error }}</p>
      <button class="underline mt-1" @click="load">Tekrar dene</button>
    </div>
  </div>
</template>
