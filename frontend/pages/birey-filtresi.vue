<script setup lang="ts">
/**
 * Birey filtresi — kullanıcı sadece görmek istediği bireyleri seçer.
 *
 * Seçim localStorage'a kaydedilir (her cihaz/telefon kendi seçimi).
 * Boş seçim = filtre kapalı (varsayılan), tüm bireyler görünür.
 */

interface CatalogEntry {
  individual: {
    uuid: string;
    full_name: string;
    individual_type: number; // 1 = öğrenci, 2 = personel
  };
}

const { backendUrl, authHeaders } = useBkds();
const filter = useIndividualFilter();
const { initials } = useFormatters();

const { data, pending, error } = useAsyncData(
  'birey-filtresi-catalog',
  () => $fetch<{ individuals: CatalogEntry[] }>(
    `${backendUrl}/api/individuals-catalog`,
    { headers: authHeaders() },
  ),
);

const searchQuery = ref('');
const showOnlySelected = ref(false);

// 1 = öğrenci, 2 = personel — sadece öğrenciler ve personel ayrımı için tab
const tab = ref<'all' | 'student' | 'staff'>('all');

const filteredList = computed(() => {
  const items = data.value?.individuals ?? [];
  let out = [...items];

  if (tab.value === 'student') out = out.filter((e) => e.individual.individual_type === 1);
  else if (tab.value === 'staff') out = out.filter((e) => e.individual.individual_type === 2);

  const q = searchQuery.value.trim().toUpperCase();
  if (q) out = out.filter((e) => e.individual.full_name.toUpperCase().includes(q));

  if (showOnlySelected.value) {
    out = out.filter((e) => filter.isSelected(e.individual.uuid));
  }

  // Alfabetik sıralama
  out.sort((a, b) => a.individual.full_name.localeCompare(b.individual.full_name, 'tr'));
  return out;
});

const totalCount = computed(() => data.value?.individuals.length ?? 0);

function selectAllVisible() {
  const visible = filteredList.value.map((e) => e.individual.uuid);
  const next = new Set([...filter.selectedUuids.value, ...visible]);
  filter.setAll(Array.from(next));
}

function clearAll() {
  if (!confirm('Tüm seçimler temizlenecek (filtre kapanır, herkes görünür). Devam?')) return;
  filter.clear();
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
    <!-- Header -->
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 pt-[env(safe-area-inset-top)] sticky top-0 z-10">
      <div class="px-4 py-3 flex items-center gap-3">
        <NuxtLink
          to="/settings"
          class="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
          aria-label="Geri"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </NuxtLink>
        <div class="flex-1">
          <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">BRY Takip</p>
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">Birey Filtresi</h1>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-500 dark:text-gray-400">Seçili</p>
          <p class="text-sm font-semibold" :class="filter.isEnabled.value ? 'text-brand' : 'text-gray-400'">
            {{ filter.selectedCount.value }}
            <span class="text-xs text-gray-400 dark:text-gray-500 font-normal">/ {{ totalCount }}</span>
          </p>
        </div>
      </div>
    </header>

    <main class="flex-1 px-4 py-4 space-y-4">
      <!-- Açıklama -->
      <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 text-[12px] text-gray-700 dark:text-gray-300 leading-relaxed">
        Sadece görmek istediğin bireyleri işaretle.
        <strong class="text-gray-900 dark:text-gray-100">Hiç seçim yapmazsan filtre kapalı kalır, herkes görünür.</strong>
        Bu seçim sadece bu cihazda saklanır — diğer telefonlar etkilenmez.
      </div>

      <!-- Tab: hepsi / birey / personel -->
      <div class="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs">
        <button
          v-for="t in [
            { v: 'all', label: 'Hepsi' },
            { v: 'student', label: 'Birey' },
            { v: 'staff', label: 'Personel' },
          ]"
          :key="t.v"
          type="button"
          class="px-3 py-1.5 rounded-md font-medium transition-colors"
          :class="tab === t.v ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400'"
          @click="tab = t.v as any"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- Arama + hızlı aksiyonlar -->
      <div class="flex items-center gap-2">
        <div class="flex-1 relative">
          <svg
            class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          ><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="İsimde ara..."
            class="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <button
          type="button"
          class="px-3 py-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium active:opacity-80 whitespace-nowrap"
          @click="showOnlySelected = !showOnlySelected"
        >
          {{ showOnlySelected ? 'Tümü' : 'Seçili' }}
        </button>
      </div>

      <!-- Hızlı işlemler -->
      <div class="flex gap-2 text-xs">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg bg-brand/10 text-brand font-medium active:opacity-80"
          @click="selectAllVisible"
        >
          + Görünenleri ekle ({{ filteredList.length }})
        </button>
        <button
          type="button"
          :disabled="!filter.isEnabled.value"
          class="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-medium active:opacity-80 disabled:opacity-40"
          @click="clearAll"
        >
          Tümünü temizle
        </button>
      </div>

      <!-- Liste -->
      <div v-if="pending" class="space-y-2">
        <div v-for="i in 5" :key="i" class="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
      </div>

      <div v-else-if="error" class="p-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl text-sm">
        Birey kataloğu yüklenemedi. Bağlantını kontrol et.
      </div>

      <div v-else-if="filteredList.length === 0" class="p-4 bg-white dark:bg-gray-900 rounded-xl text-center text-sm text-gray-500 dark:text-gray-400">
        {{ showOnlySelected ? 'Hiç seçimin yok.' : 'Sonuç bulunamadı.' }}
      </div>

      <div v-else class="space-y-1.5">
        <label
          v-for="entry in filteredList"
          :key="entry.individual.uuid"
          class="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 cursor-pointer transition-colors"
          :class="filter.isSelected(entry.individual.uuid) ? 'ring-2 ring-brand bg-brand-50/40 dark:bg-brand-950/30 border-brand/40' : ''"
        >
          <input
            type="checkbox"
            :checked="filter.isSelected(entry.individual.uuid)"
            class="w-4 h-4 accent-brand cursor-pointer flex-shrink-0"
            @change="filter.toggle(entry.individual.uuid)"
          />
          <div class="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
               :class="entry.individual.individual_type === 1 ? 'bg-brand-50 text-brand' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'">
            {{ initials(entry.individual.full_name) }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {{ entry.individual.full_name }}
            </p>
            <p class="text-[11px] text-gray-500 dark:text-gray-400">
              {{ entry.individual.individual_type === 1 ? 'Birey' : 'Personel' }}
            </p>
          </div>
        </label>
      </div>
    </main>
  </div>
</template>
