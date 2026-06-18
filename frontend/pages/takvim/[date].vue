<script setup lang="ts">
import { lessonsFromMinutes } from '~/composables/useLessons';
import type { Snapshot } from '~/composables/useBkds';
import type { SessionInput } from '~/utils/calendar';

const route = useRoute();
const { backendUrl, authHeaders } = useBkds();

const date = computed(() => String(route.params.date ?? ''));
const valid = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(date.value));
const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
const isToday = computed(() => date.value === todayStr);

const snap = ref<Snapshot | null>(null);
const pending = ref(false);
const error = ref<string | null>(null);

async function load() {
  if (!valid.value) {
    error.value = 'Geçersiz tarih';
    return;
  }
  pending.value = true;
  error.value = null;
  try {
    snap.value = await $fetch<Snapshot>(`${backendUrl}/api/snapshot?date=${date.value}`, {
      headers: authHeaders(),
    });
  } catch (e: any) {
    const status = e?.response?.status ?? e?.statusCode;
    error.value =
      status === 502
        ? (e?.data?.error ?? 'BRY sunucusuna ulaşılamıyor.')
        : (e?.data?.error ?? e?.message ?? 'Gün yüklenemedi');
  } finally {
    pending.value = false;
  }
}

const sessions = computed<SessionInput[]>(() => {
  const list = snap.value?.presence ?? [];
  return list
    .filter((p) => p.firstEntry)
    .map((p) => {
      const ongoing = !p.lastExit && isToday.value;
      const endIso = p.lastExit
        ? p.lastActivity.activity_time
        : isToday.value
          ? new Date().toISOString()
          : p.lastActivity.activity_time;
      const startMin = isoToTrMinutes(p.firstEntry!);
      const endMin = Math.max(startMin + 5, isoToTrMinutes(endIso));
      const lessons = p.individual.individual_type === 1
        ? lessonsFromMinutes(Math.max(0, endMin - startMin)).lessons
        : 0;
      return {
        uuid: p.individual.uuid,
        name: p.individual.full_name,
        type: p.individual.individual_type,
        startMin,
        endMin,
        ongoing,
        lessons,
      };
    });
});

const studentCount = computed(() => sessions.value.filter((s) => s.type === 1).length);
const lessonTotal = computed(() => sessions.value.reduce((sum, s) => sum + s.lessons, 0));
const staffCount = computed(() => sessions.value.filter((s) => s.type === 2).length);

type DayFilter = 'all' | 'student' | 'staff';
const filter = ref<DayFilter>('all');
const visibleSessions = computed(() => {
  if (filter.value === 'student') return sessions.value.filter((s) => s.type === 1);
  if (filter.value === 'staff') return sessions.value.filter((s) => s.type === 2);
  return sessions.value;
});

onMounted(load);
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 pb-8">
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 pt-[env(safe-area-inset-top)]">
      <div class="px-4 py-3 flex items-center gap-3">
        <NuxtLink to="/takvim" class="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800" aria-label="Takvime dön">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </NuxtLink>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Gün</p>
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate capitalize">
            {{ valid ? formatDayTr(date) : 'Geçersiz tarih' }}
          </h1>
        </div>
      </div>
    </header>

    <div v-if="snap" class="px-4 mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
      <template v-if="filter !== 'staff'">
        <span><strong class="text-gray-900 dark:text-gray-100">{{ studentCount }}</strong> öğrenci</span>
        <span><strong class="text-gray-900 dark:text-gray-100">{{ lessonTotal }}</strong> ders</span>
      </template>
      <span v-if="filter !== 'student'"><strong class="text-gray-900 dark:text-gray-100">{{ staffCount }}</strong> personel</span>
    </div>

    <div v-if="snap" class="px-4 mt-3">
      <div class="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs">
        <button
          v-for="f in [
            { v: 'all', label: 'Hepsi' },
            { v: 'student', label: 'Birey' },
            { v: 'staff', label: 'Personel' },
          ]"
          :key="f.v"
          class="px-3 py-1.5 rounded-md font-medium transition-colors"
          :class="filter === f.v
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
            : 'text-gray-500 dark:text-gray-400'"
          @click="filter = f.v as DayFilter"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <div v-if="pending && !snap" class="px-4 mt-4 space-y-2">
      <div v-for="i in 6" :key="i" class="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
    </div>
    <div v-else-if="error" class="mx-4 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
      <p class="font-medium">Gün yüklenemedi</p>
      <p class="text-[11px] mt-0.5 opacity-80">{{ error }}</p>
      <button class="underline mt-1" @click="load">Tekrar dene</button>
    </div>
    <div v-else-if="snap" class="mt-4">
      <DayTimeline :sessions="visibleSessions" />
    </div>
  </div>
</template>
