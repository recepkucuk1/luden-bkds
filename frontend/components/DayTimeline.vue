<script setup lang="ts">
/**
 * Tek günün seans zaman çizelgesi. Her seans giriş→çıkış bloğu;
 * çakışanlar yan şeritlerde. Bloğa dokun → birey sayfası.
 */
import type { SessionInput } from '~/utils/calendar';

const props = defineProps<{ sessions: SessionInput[] }>();

const HOUR_HEIGHT = 54; // px
const lanes = computed(() => assignLanes(props.sessions));
const range = computed(() => axisRange(props.sessions));
const laneCount = computed(() => Math.max(1, ...lanes.value.map((l) => l + 1)));
const totalHeight = computed(() => (range.value.endHour - range.value.startHour) * HOUR_HEIGHT);
const hours = computed(() => {
  const out: number[] = [];
  for (let h = range.value.startHour; h < range.value.endHour; h++) out.push(h);
  return out;
});

function topPx(s: SessionInput): number {
  return ((s.startMin - range.value.startHour * 60) / 60) * HOUR_HEIGHT;
}
function heightPx(s: SessionInput): number {
  return Math.max(20, ((s.endMin - s.startMin) / 60) * HOUR_HEIGHT);
}
function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
</script>

<template>
  <div v-if="sessions.length === 0" class="mx-4 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-500 dark:text-gray-400">
    Bu gün hareket kaydı yok
  </div>

  <div v-else class="px-4 flex gap-2" :style="{ height: totalHeight + 'px' }">
    <div class="relative w-10 flex-none">
      <div
        v-for="h in hours"
        :key="h"
        class="absolute right-1 text-[10px] text-gray-400 dark:text-gray-500 -translate-y-1/2"
        :style="{ top: ((h - range.startHour) * HOUR_HEIGHT) + 'px' }"
      >
        {{ String(h).padStart(2, '0') }}:00
      </div>
    </div>

    <div class="relative flex-1">
      <div
        v-for="h in hours"
        :key="'l' + h"
        class="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-800"
        :style="{ top: ((h - range.startHour) * HOUR_HEIGHT) + 'px' }"
      />
      <NuxtLink
        v-for="(s, i) in sessions"
        :key="s.uuid + i"
        :to="`/individual/${s.uuid}`"
        class="absolute rounded-md px-1.5 py-1 overflow-hidden border bg-brand-50 border-brand-100 active:opacity-80"
        :style="{
          top: topPx(s) + 'px',
          height: heightPx(s) + 'px',
          left: `calc(${(lanes[i] / laneCount) * 100}% + 2px)`,
          width: `calc(${100 / laneCount}% - 4px)`,
        }"
      >
        <p class="text-[11px] font-medium text-brand leading-tight truncate">{{ s.name }}</p>
        <p class="text-[10px] text-brand/80 leading-tight truncate">
          {{ fmt(s.startMin) }}<span v-if="!s.ongoing">–{{ fmt(s.endMin) }}</span><span v-else> · sürüyor</span>
          <span v-if="s.type === 1"> · {{ s.lessons }} ders</span>
        </p>
      </NuxtLink>
    </div>
  </div>
</template>
