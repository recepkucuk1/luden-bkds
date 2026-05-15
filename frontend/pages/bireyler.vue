<script setup lang="ts">
/**
 * Bireyler kataloğu — kuruma kayıtlı tüm bireyler + yokluk takibi.
 *
 * Son 7 gün içinde görülmemiş öğrenciler dikkat çekecek şekilde işaretlenir.
 * INNOVA list endpoint'i (/api/activities/bkmsy-individuals/) gerekiyor;
 * sunucu erişemezse hata mesajı.
 */
const { backendUrl, authHeaders } = useBkds();
const { initials } = useFormatters();

interface Individual {
  uuid: string;
  full_name: string;
  identity_number: string;
  individual_type: number;
  gender: 'Erkek' | 'Kadın';
  birth_date: string | null;
  disability_code: string;
}

interface CatalogEntry {
  individual: Individual;
  lastSeen: string | null;
}

interface CatalogResponse {
  totalCount: number;
  lookBackDays: number;
  individuals: CatalogEntry[];
}

const { data, pending, error, refresh } = await useFetch<CatalogResponse>(
  () => `${backendUrl}/api/individuals-catalog`,
  { headers: authHeaders() },
);

// Filtreleme
const searchQuery = ref('');
type Filter = 'all' | 'present' | 'absent';
const filter = ref<Filter>('all');

// Şu an TR saatine göre — lastSeen'den gün hesaplamak için
const trNow = computed(() => Date.now());

function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  return Math.floor((trNow.value - t) / (1000 * 60 * 60 * 24));
}

function lastSeenLabel(lastSeen: string | null, lookBackDays: number): {
  text: string;
  tone: 'green' | 'gray' | 'amber' | 'red';
} {
  if (!lastSeen) {
    return { text: `${lookBackDays}+ gündür yok`, tone: 'red' };
  }
  const d = daysSince(lastSeen);
  if (d === 0) return { text: 'Bugün', tone: 'green' };
  if (d === 1) return { text: 'Dün', tone: 'gray' };
  if (d < 7) return { text: `${d} gün önce`, tone: 'gray' };
  return { text: `${d} gün önce`, tone: 'amber' };
}

function toneClasses(tone: 'green' | 'gray' | 'amber' | 'red'): string {
  switch (tone) {
    case 'green':
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    case 'amber':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'red':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    case 'gray':
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  }
}

const filteredList = computed(() => {
  const items = data.value?.individuals ?? [];
  let out = items;

  // İsim araması
  const q = searchQuery.value.trim().toUpperCase();
  if (q) {
    out = out.filter((e) => e.individual.full_name.toUpperCase().includes(q));
  }

  // Yokluk filtresi
  if (filter.value === 'present') {
    out = out.filter((e) => e.lastSeen && daysSince(e.lastSeen) <= 7);
  } else if (filter.value === 'absent') {
    out = out.filter((e) => !e.lastSeen || daysSince(e.lastSeen) > 7);
  }

  // İsim sıralı (alfabetik, TR locale)
  return [...out].sort((a, b) =>
    a.individual.full_name.localeCompare(b.individual.full_name, 'tr'),
  );
});

const stats = computed(() => {
  const items = data.value?.individuals ?? [];
  let present = 0;
  let absent = 0;
  for (const e of items) {
    if (e.lastSeen && daysSince(e.lastSeen) <= 7) present++;
    else absent++;
  }
  return { present, absent, total: items.length };
});

// MEB raporu için aylık CSV indir
const downloading = ref(false);
const downloadError = ref<string | null>(null);
async function downloadMonthlyCsv() {
  downloading.value = true;
  downloadError.value = null;
  try {
    const month = new Date()
      .toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
      .slice(0, 7);
    const res = await fetch(`${backendUrl}/api/monthly-report?month=${month}`, {
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`Sunucu: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bry-takip-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: any) {
    downloadError.value = err?.message ?? 'CSV indirilemedi';
  } finally {
    downloading.value = false;
  }
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
          <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Bireyler</p>
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">
            {{ data?.totalCount ?? '...' }} kayıtlı
          </h1>
        </div>
      </div>
    </header>

    <!-- Aylık rapor CSV indir -->
    <div class="px-4 mt-3">
      <button
        type="button"
        :disabled="downloading"
        class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
        @click="downloadMonthlyCsv"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" x2="12" y1="15" y2="3"/>
        </svg>
        {{ downloading ? 'Hazırlanıyor...' : 'Bu ayı CSV olarak indir' }}
      </button>
      <p v-if="downloadError" class="mt-2 text-xs text-red-700 dark:text-red-400 text-center">
        {{ downloadError }}
      </p>
    </div>

    <!-- Stats -->
    <div v-if="data" class="grid grid-cols-3 gap-2 px-4 mt-3 text-xs">
      <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-2.5 text-center">
        <p class="text-gray-500 dark:text-gray-400 text-[10px]">Toplam</p>
        <p class="text-lg font-semibold text-gray-900 dark:text-gray-100 leading-none mt-1">{{ stats.total }}</p>
      </div>
      <div class="bg-green-100/60 dark:bg-green-950/40 rounded-lg p-2.5 text-center">
        <p class="text-green-700 dark:text-green-300 text-[10px]">Bu hafta geldi</p>
        <p class="text-lg font-semibold text-green-800 dark:text-green-200 leading-none mt-1">{{ stats.present }}</p>
      </div>
      <div class="bg-amber-100/60 dark:bg-amber-950/40 rounded-lg p-2.5 text-center">
        <p class="text-amber-700 dark:text-amber-300 text-[10px]">Gelmedi</p>
        <p class="text-lg font-semibold text-amber-800 dark:text-amber-200 leading-none mt-1">{{ stats.absent }}</p>
      </div>
    </div>

    <!-- Filtreler -->
    <div class="px-4 mt-3 flex flex-wrap items-center gap-2">
      <div class="relative flex-1 min-w-[180px]">
        <svg
          class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        ><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="İsimde ara (ilk 3 harf)..."
          class="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:bg-white dark:focus:bg-gray-900"
        />
      </div>
      <div class="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs">
        <button
          v-for="f in [
            { v: 'all', label: 'Tümü' },
            { v: 'present', label: 'Geldi' },
            { v: 'absent', label: 'Gelmedi' },
          ]"
          :key="f.v"
          class="px-3 py-1 rounded-md font-medium transition-colors"
          :class="
            filter === f.v
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400'
          "
          @click="filter = f.v as Filter"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="pending" class="px-4 mt-4 space-y-2">
      <div v-for="i in 8" :key="i" class="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="mx-4 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm leading-relaxed"
    >
      <p class="font-medium mb-1">Bireyler listesi alınamadı</p>
      <p class="text-xs">
        INNOVA sunucusu liste endpoint'ini desteklemiyor olabilir, ya da bağlantı sorunu var.
      </p>
      <button class="mt-2 underline" @click="refresh">Yenile</button>
    </div>

    <!-- Empty filtered -->
    <div
      v-else-if="filteredList.length === 0"
      class="mx-4 mt-6 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl text-center"
    >
      <div class="w-12 h-12 mx-auto mb-2 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-500">
        <Icon name="inbox" :size="22" />
      </div>
      <p class="text-sm font-medium text-gray-700 dark:text-gray-200">Eşleşen birey yok</p>
      <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Arama veya filtreyi gevşetin.</p>
    </div>

    <!-- List -->
    <ul v-else class="px-4 mt-4 space-y-1.5">
      <li
        v-for="entry in filteredList"
        :key="entry.individual.uuid"
      >
        <NuxtLink
          :to="`/individual/${entry.individual.uuid}`"
          class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 active:opacity-80 transition-opacity"
        >
          <div class="w-9 h-9 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
            {{ initials(entry.individual.full_name) }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {{ entry.individual.full_name }}
            </p>
            <p class="text-[10px] text-gray-500 dark:text-gray-400">
              {{ entry.individual.individual_type === 1 ? 'Birey' : 'Personel' }}
              <span v-if="entry.individual.disability_code" class="text-gray-400 dark:text-gray-500">· {{ entry.individual.disability_code }}</span>
            </p>
          </div>
          <span
            class="text-[10px] px-2 py-0.5 rounded-md font-semibold flex-shrink-0"
            :class="toneClasses(lastSeenLabel(entry.lastSeen, data?.lookBackDays ?? 7).tone)"
          >
            {{ lastSeenLabel(entry.lastSeen, data?.lookBackDays ?? 7).text }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
