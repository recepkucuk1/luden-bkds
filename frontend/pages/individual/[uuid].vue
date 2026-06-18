<script setup lang="ts">
const route = useRoute();
const { backendUrl, photoUrl, authHeaders } = useBkds();
const { toTime } = useFormatters();

interface Individual {
  uuid: string;
  full_name: string;
  identity_number: string;
  individual_type: number;
  gender: 'Erkek' | 'Kadın';
  birth_date: string | null;
  disability_code: string;
}

interface Activity {
  uuid: string;
  individual_uuid: string;
  activity_type: 'entry' | 'exit';
  activity_time: string;
  is_matched_manually: boolean;
  manual_match_similarity_score: number | null;
  roi_url: string;
}

const uuid = computed(() => route.params.uuid as string);
const showDetails = ref(false);

const { data, pending, error, refresh } = useFetch<{
  individual: Individual;
  activities: Activity[];
}>(`${backendUrl}/api/individuals/${uuid.value}/activities`, {
  key: `individual-${uuid.value}`,
  headers: authHeaders(),
});

const sortedActivities = computed(() => {
  if (!data.value?.activities) return [];
  return [...data.value.activities].sort((a, b) =>
    b.activity_time.localeCompare(a.activity_time),
  );
});

// Son aktivite içeride mi gösteriyor?
const isPresent = computed(() => {
  const last = sortedActivities.value[0];
  return last?.activity_type === 'entry';
});

// roi_url'i kendi proxy'mize çevir (token query param'ı dahil)
const proxyPhoto = photoUrl;
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 pb-8">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 pt-[env(safe-area-inset-top)]">
      <div class="px-4 py-3 flex items-center gap-3">
        <NuxtLink
          to="/"
          class="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:bg-gray-800"
        >
          <Icon name="chevron-left" :size="22" />
        </NuxtLink>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 dark:text-gray-500">Birey</p>
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
            {{ data?.individual?.full_name ?? '...' }}
          </h1>
        </div>
        <span
          v-if="data?.individual"
          class="text-[11px] px-2 py-1 rounded-full"
          :class="
            isPresent
              ? 'bg-brand-50 text-brand'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
          "
        >
          {{ isPresent ? 'İçeride' : 'Dışarıda' }}
        </span>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="pending" class="px-4 mt-4 space-y-2">
      <div v-for="i in 5" :key="i" class="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="mx-4 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
      Yüklenemedi.
      <button class="underline ml-2" @click="refresh">Yenile</button>
    </div>

    <!-- İçerik -->
    <div v-else-if="data">
      <!-- Hassas bilgi (gizli, talep üzerine) -->
      <section class="mt-4 px-4">
        <button
          class="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-gray-800 active:bg-gray-100 dark:bg-gray-800 flex items-center justify-between"
          @click="showDetails = !showDetails"
        >
          <span class="text-sm font-medium text-gray-700 dark:text-gray-200">
            {{ showDetails ? 'Detayları gizle' : 'Detayları göster' }}
          </span>
          <span class="text-gray-400 dark:text-gray-500">{{ showDetails ? '−' : '+' }}</span>
        </button>
        <Transition
          enter-active-class="transition duration-200"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
        >
          <div
            v-if="showDetails"
            class="mt-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 grid grid-cols-2 gap-2 text-xs"
          >
            <div>
              <p class="text-gray-500 dark:text-gray-400 dark:text-gray-500">TC</p>
              <p class="text-gray-900 dark:text-gray-100 font-medium">
                {{ data.individual.identity_number }}
              </p>
            </div>
            <div>
              <p class="text-gray-500 dark:text-gray-400 dark:text-gray-500">Cinsiyet</p>
              <p class="text-gray-900 dark:text-gray-100 font-medium">{{ data.individual.gender }}</p>
            </div>
            <div v-if="data.individual.birth_date">
              <p class="text-gray-500 dark:text-gray-400 dark:text-gray-500">Doğum</p>
              <p class="text-gray-900 dark:text-gray-100 font-medium">{{ data.individual.birth_date }}</p>
            </div>
            <div v-if="data.individual.disability_code">
              <p class="text-gray-500 dark:text-gray-400 dark:text-gray-500">Engel kodu</p>
              <p class="text-gray-900 dark:text-gray-100 font-medium">{{ data.individual.disability_code }}</p>
            </div>
            <div>
              <p class="text-gray-500 dark:text-gray-400 dark:text-gray-500">Tip</p>
              <p class="text-gray-900 dark:text-gray-100 font-medium">
                {{ data.individual.individual_type === 1 ? 'Birey' : 'Personel' }}
              </p>
            </div>
          </div>
        </Transition>
      </section>

      <!-- Devam takvimi (B) -->
      <IndividualCalendar :uuid="uuid" />

      <!-- Bugünkü aktiviteler -->
      <section class="mt-5">
        <div class="px-4 mb-2 flex items-center justify-between">
          <h2 class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 dark:text-gray-500 font-medium">
            Bugünkü hareketler
          </h2>
          <span class="text-[11px] text-gray-400 dark:text-gray-500"
            >{{ sortedActivities.length }} kayıt</span
          >
        </div>

        <div
          v-if="sortedActivities.length === 0"
          class="mx-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500"
        >
          Bugün hareket yok
        </div>

        <div v-else class="px-4 space-y-1.5">
          <div
            v-for="act in sortedActivities"
            :key="act.uuid"
            class="flex items-center gap-3 p-2.5 rounded-xl"
            :class="
              act.activity_type === 'entry' ? 'bg-brand-50' : 'bg-gray-50 dark:bg-gray-800'
            "
          >
            <img
              v-if="act.roi_url"
              :src="proxyPhoto(act.roi_url)"
              alt=""
              class="w-12 h-12 rounded-lg object-cover bg-white dark:bg-gray-900"
              loading="lazy"
            />
            <div class="flex-1 min-w-0">
              <p
                class="text-sm font-medium"
                :class="
                  act.activity_type === 'entry' ? 'text-brand' : 'text-gray-700 dark:text-gray-200'
                "
              >
                {{ act.activity_type === 'entry' ? 'Giriş' : 'Çıkış' }}
                <span v-if="act.is_matched_manually" class="ml-1 text-[10px] text-amber-700 dark:text-amber-300">
                  (manuel)
                </span>
              </p>
              <p class="text-[11px] text-gray-500 dark:text-gray-400 dark:text-gray-500">
                {{ toTime(act.activity_time) }}
              </p>
            </div>
            <div
              :class="act.activity_type === 'entry' ? 'text-brand' : 'text-gray-400 dark:text-gray-500'"
            >
              <Icon :name="act.activity_type === 'entry' ? 'arrow-down-right' : 'arrow-up-right'" :size="18" />
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
