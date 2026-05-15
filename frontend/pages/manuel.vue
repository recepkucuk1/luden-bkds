<script setup lang="ts">
/**
 * Manuel eşleşmeler listesi.
 *
 * Kamera bir yüzü tanırken emin olamadığında manuel eşleştirme yapar
 * (BRY arka uçtaki algoritma + manuel onay). Bu sayfa o gün manuel
 * eşleştirilen tüm aktiviteleri benzerlik skorlarıyla birlikte listeler.
 *
 * Düşük skorlu olanlar (özellikle <%70) gözle doğrulanmaya değer.
 */
const { backendUrl, authHeaders, selectedDate } = useBkds();
const { toTime, initials } = useFormatters();

interface ManualMatch {
  activity: {
    uuid: string;
    individual_uuid: string;
    activity_type: 'entry' | 'exit';
    activity_time: string;
    is_matched_manually: boolean;
    manual_match_similarity_score: number | null;
    roi_url: string;
  };
  individual: {
    uuid: string;
    full_name: string;
  };
}

interface ManualMatchesResponse {
  date: string;
  isToday: boolean;
  matches: ManualMatch[];
}

const { data, pending, error, refresh } = await useFetch<ManualMatchesResponse>(
  () => {
    const d = selectedDate.value;
    return `${backendUrl}/api/manual-matches${d ? `?date=${d}` : ''}`;
  },
  {
    headers: authHeaders(),
    // Tarih değişirse otomatik yenile
    watch: [selectedDate],
  },
);

function scoreClass(score: number | null): string {
  if (score === null) return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  if (score >= 90) return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (score >= 70) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
}

function formatTrDate(date: string): string {
  const d = new Date(`${date}T12:00:00+03:00`);
  return d.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Istanbul',
  });
}
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
          <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Manuel eşleşmeler</p>
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">
            {{ data?.matches?.length ?? 0 }} kayıt
            <span
              v-if="data && !data.isToday"
              class="text-xs text-gray-500 dark:text-gray-400 font-normal ml-1"
            >· {{ formatTrDate(data.date) }}</span>
          </h1>
        </div>
      </div>
    </header>

    <!-- Açıklama strip — kullanıcı ne olduğunu anlasın -->
    <div class="mx-4 mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
      Kamera bir yüzü tanırken emin olamadığında manuel eşleştirme yapılır.
      Düşük benzerlik skorlu (özellikle <strong>%70 altı</strong>) hareketler gözle doğrulanmaya değer.
    </div>

    <!-- Loading -->
    <div v-if="pending" class="px-4 mt-4 space-y-2">
      <div v-for="i in 5" :key="i" class="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="mx-4 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
      Yüklenemedi.
      <button class="underline ml-2" @click="refresh">Yenile</button>
    </div>

    <!-- Empty -->
    <div
      v-else-if="!data?.matches?.length"
      class="mx-4 mt-6 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl text-center"
    >
      <div class="w-12 h-12 mx-auto mb-2 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-green-600 dark:text-green-400">
        <Icon name="check" :size="22" />
      </div>
      <p class="text-sm font-medium text-gray-700 dark:text-gray-200">Manuel eşleşme yok</p>
      <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
        Kamera tüm hareketleri otomatik tanıyabilmiş — gözle doğrulama gerekmiyor.
      </p>
    </div>

    <!-- List -->
    <ul v-else class="px-4 mt-4 space-y-1.5">
      <li
        v-for="m in data.matches"
        :key="m.activity.uuid"
        class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800"
      >
        <div class="w-9 h-9 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
          {{ initials(m.individual.full_name) }}
        </div>
        <NuxtLink :to="`/individual/${m.individual.uuid}`" class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {{ m.individual.full_name }}
          </p>
          <p class="text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
            <span>{{ toTime(m.activity.activity_time) }}</span>
            <span class="text-gray-300 dark:text-gray-600">·</span>
            <Icon :name="m.activity.activity_type === 'entry' ? 'arrow-down-right' : 'arrow-up-right'" :size="11" />
            <span>{{ m.activity.activity_type === 'entry' ? 'Giriş' : 'Çıkış' }}</span>
          </p>
        </NuxtLink>
        <span
          class="text-[11px] px-2 py-0.5 rounded-md font-semibold flex-shrink-0"
          :class="scoreClass(m.activity.manual_match_similarity_score)"
          :title="m.activity.manual_match_similarity_score === null ? 'Skor yok' : `Benzerlik skoru ${Math.round(m.activity.manual_match_similarity_score)}%`"
        >
          <template v-if="m.activity.manual_match_similarity_score !== null">
            {{ Math.round(m.activity.manual_match_similarity_score) }}%
          </template>
          <template v-else>—</template>
        </span>
      </li>
    </ul>
  </div>
</template>
