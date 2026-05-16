<script setup lang="ts">
import { lessonsFromMinutes, formatDuration } from '~/composables/useLessons';

interface Activity {
  uuid: string;
  activity_type: 'entry' | 'exit';
  activity_time: string;
  is_matched_manually: boolean;
  manual_match_similarity_score: number | null;
  roi_url: string;
}

interface Individual {
  uuid: string;
  full_name: string;
  individual_type: number;
}

interface Props {
  individual: Individual;
  lastActivity: Activity;
  todayActivityCount: number;
  firstEntry: string | null;
  lastExit: string | null;
  // Backend-hesaplı: entry→exit çiftleri toplamı (ara çıkışlar HARİÇ).
  // MEB ders saati buradan hesaplanır.
  insideMinutes: number;
}

const props = defineProps<Props>();
const { backendUrl, photoUrl, authHeaders } = useBkds();
const { toTime, initials } = useFormatters();

const isOpen = ref(false);
const activities = ref<Activity[]>([]);
const loading = ref(false);
const errorMsg = ref<string | null>(null);

// Index sayfasındaki global "şu an" tick'i — her dakika güncellenir.
// İçerideyken backend insideMinutes hesabını "şu ana" extrapole eder:
// son entry'den itibaren geçen dakikayı insideMinutes'a ekler.
const now = useState<number>('app-now', () => Date.now());

// İçerideyken backend insideMinutes'i son okumanın anına göre verir;
// son entry'den şu ana kadar geçen ek dakikayı ekleriz (canlı geri sayım).
const liveInsideMinutes = computed(() => {
  let base = props.insideMinutes ?? 0;
  // Hala içerideyse (lastExit yok), son aktivite entry ise: backend son
  // aktivite zamanına göre saymış. Şu ana kadar geçen ek dakikayı topla.
  if (!props.lastExit && props.lastActivity.activity_type === 'entry') {
    const lastEntryMs = new Date(props.lastActivity.activity_time).getTime();
    const extra = Math.max(0, Math.floor((now.value - lastEntryMs) / 60000));
    base += extra;
  }
  return base;
});

// Görüntülenen "toplam süre" — eski span yerine fiilen içeride geçen süre
const totalMinutes = computed(() => liveInsideMinutes.value);

// Personel için ders hesabı yapılmasın (sadece öğrenciler için)
const isStudent = computed(() => props.individual.individual_type === 1);

// Ders saati hesabı — sadece öğrenciler için
// liveInsideMinutes her dakika değişir → "1 derse 25 dk" canlı geri sayar
const lessonInfo = computed(() => {
  if (!isStudent.value || !props.firstEntry) return null;
  return lessonsFromMinutes(liveInsideMinutes.value, { isOngoing: !props.lastExit });
});

const lessonBadgeClass = computed(() => {
  const l = lessonInfo.value?.lessons ?? 0;
  if (l === 3) return 'bg-green-600 text-white';
  if (l === 2) return 'bg-green-500 text-white';
  if (l === 1) return 'bg-amber-500 text-white';
  return 'bg-gray-300 text-gray-700';
});

const loadActivities = async () => {
  if (activities.value.length > 0) return;
  loading.value = true;
  errorMsg.value = null;
  try {
    const data = await $fetch<{ activities: Activity[] }>(
      `${backendUrl}/api/individuals/${props.individual.uuid}/activities`,
      { headers: authHeaders() },
    );
    activities.value = [...data.activities].sort((a, b) =>
      b.activity_time.localeCompare(a.activity_time),
    );
  } catch (err: any) {
    errorMsg.value = 'Aktiviteler yüklenemedi';
  } finally {
    loading.value = false;
  }
};

const toggle = () => {
  isOpen.value = !isOpen.value;
  if (isOpen.value) loadActivities();
};

// Template'te `proxyPhoto` adıyla çağrılıyor — useBkds'in photoUrl'ünü alias et.
const proxyPhoto = photoUrl;
</script>

<template>
  <div class="rounded-xl overflow-hidden border bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
    <!-- Başlık satırı (her zaman görünür) -->
    <button
      class="w-full flex items-center gap-3 p-3 text-left active:opacity-70 transition-opacity"
      @click="toggle"
    >
      <div
        class="w-10 h-10 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200"
      >
        {{ initials(individual.full_name) }}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {{ individual.full_name }}
        </p>
        <div class="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">
          <template v-if="firstEntry">
            <span class="text-brand dark:text-brand-400 font-medium inline-flex items-center gap-0.5"><Icon name="arrow-down-right" :size="13" />{{ toTime(firstEntry) }}</span>
            <template v-if="lastExit">
              <span class="text-gray-400 dark:text-gray-500">→</span>
              <span class="text-gray-700 dark:text-gray-200 inline-flex items-center gap-0.5"><Icon name="arrow-up-right" :size="13" />{{ toTime(lastExit) }}</span>
              <span class="text-gray-400 dark:text-gray-500">·</span>
              <span class="font-medium">{{ formatDuration(totalMinutes) }}</span>
            </template>
            <template v-else>
              <span class="text-brand dark:text-brand-400 font-medium ml-1">· içeride</span>
            </template>
          </template>
          <template v-else>
            <span class="text-gray-500 dark:text-gray-400">{{ todayActivityCount }} hareket</span>
          </template>
        </div>
      </div>

      <!-- Ders rozeti (sadece öğrenci için) -->
      <div
        v-if="isStudent && lessonInfo"
        class="flex flex-col items-end flex-shrink-0 gap-0.5"
      >
        <span
          class="text-[10px] px-2 py-0.5 rounded-md font-semibold"
          :class="lessonBadgeClass"
        >
          {{ lessonInfo.lessons }} DERS
        </span>
        <!-- Bir sonraki derse kalan dakika (henüz 3 derse ulaşmadıysa) -->
        <span
          v-if="lessonInfo.minutesToNextLesson !== null && lessonInfo.minutesToNextLesson > 0"
          class="text-[9px] text-gray-500 dark:text-gray-400 leading-tight whitespace-nowrap"
        >
          {{ lessonInfo.lessons + 1 }} derse {{ lessonInfo.minutesToNextLesson }} dk
        </span>
      </div>

      <div class="text-gray-400 dark:text-gray-500 ml-1 flex-shrink-0">
        <Icon name="chevron-down" :size="16" class="transition-transform" :class="isOpen ? 'rotate-180' : ''" />
      </div>
    </button>

    <!-- Akordeon içeriği -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out overflow-hidden"
      enter-from-class="max-h-0 opacity-0"
      enter-to-class="max-h-[800px] opacity-100"
      leave-active-class="transition-all duration-150 ease-in overflow-hidden"
      leave-from-class="max-h-[800px] opacity-100"
      leave-to-class="max-h-0 opacity-0"
    >
      <div v-if="isOpen" class="border-t border-white/40 dark:border-gray-700">
        <!-- Loading -->
        <div v-if="loading" class="p-3 space-y-2">
          <div v-for="i in 3" :key="i" class="h-10 bg-white/50 dark:bg-gray-700/50 rounded-lg animate-pulse" />
        </div>

        <!-- Error -->
        <div v-else-if="errorMsg" class="p-3 text-xs text-red-600 dark:text-red-400">
          {{ errorMsg }}
          <button class="underline ml-1" @click="loadActivities">Tekrar dene</button>
        </div>

        <!-- Boş -->
        <div
          v-else-if="activities.length === 0"
          class="p-3 text-xs text-gray-500 dark:text-gray-400 text-center"
        >
          Bugün başka hareket yok
        </div>

        <!-- Aktivite listesi -->
        <div v-else class="p-2 space-y-1">
          <div
            v-for="act in activities"
            :key="act.uuid"
            class="flex items-center gap-2.5 p-2 rounded-lg bg-white/70 dark:bg-gray-700/60"
          >
            <img
              v-if="act.roi_url"
              :src="proxyPhoto(act.roi_url)"
              alt=""
              class="w-9 h-9 rounded-md object-cover bg-white dark:bg-gray-600 flex-shrink-0"
              loading="lazy"
            />
            <div class="flex-1 min-w-0">
              <p
                class="text-xs font-medium"
                :class="
                  act.activity_type === 'entry'
                    ? 'text-brand dark:text-brand-400'
                    : 'text-gray-700 dark:text-gray-200'
                "
              >
                {{ act.activity_type === 'entry' ? 'Giriş' : 'Çıkış' }}
                <span
                  v-if="act.is_matched_manually"
                  class="ml-1 text-[10px] text-amber-700 dark:text-amber-300"
                  :title="act.manual_match_similarity_score !== null ? `Benzerlik %${Math.round(act.manual_match_similarity_score)}` : 'Manuel eşleşme'"
                >
                  (manuel<span v-if="act.manual_match_similarity_score !== null"> · %{{ Math.round(act.manual_match_similarity_score) }}</span>)
                </span>
              </p>
              <p class="text-[11px] text-gray-500 dark:text-gray-400">
                {{ toTime(act.activity_time) }}
              </p>
            </div>
            <div
              class="flex-shrink-0"
              :class="
                act.activity_type === 'entry'
                  ? 'text-brand dark:text-brand-400'
                  : 'text-gray-400 dark:text-gray-500'
              "
            >
              <Icon :name="act.activity_type === 'entry' ? 'arrow-down-right' : 'arrow-up-right'" :size="16" />
            </div>
          </div>

          <NuxtLink
            :to="`/individual/${individual.uuid}`"
            class="block text-center text-[11px] text-gray-500 dark:text-gray-400 underline mt-2 py-1"
          >
            Tüm bilgiler →
          </NuxtLink>
        </div>
      </div>
    </Transition>
  </div>
</template>
