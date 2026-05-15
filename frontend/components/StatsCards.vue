<script setup lang="ts">
const { snapshot } = useBkds();
</script>

<template>
  <div class="grid grid-cols-2 gap-2 px-4 mt-3">
    <div class="bg-gray-100 dark:bg-gray-800 rounded-xl p-3">
      <p class="text-[11px] text-gray-600 dark:text-gray-300 font-medium">Bugün toplam</p>
      <p class="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
        {{ snapshot?.todayCount ?? '–' }}
      </p>
    </div>
    <NuxtLink
      to="/manuel"
      class="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-3 hover:bg-amber-100 dark:hover:bg-amber-900/30 active:opacity-80 transition-colors block"
    >
      <div class="flex items-start justify-between">
        <p class="text-[11px] text-amber-700 dark:text-amber-300 font-medium">Manuel eşleşme</p>
        <Icon name="chevron-right" :size="14" class="text-amber-600 dark:text-amber-400 opacity-60" />
      </div>
      <p class="text-2xl font-semibold text-amber-700 dark:text-amber-300 mt-0.5">
        {{ snapshot?.manualMatchToday ?? '–' }}
      </p>
    </NuxtLink>
  </div>
</template>
