<script setup lang="ts">
const { snapshot } = useBkds();
</script>

<template>
  <div class="grid grid-cols-2 gap-2 px-4 mt-3">
    <div class="bg-gray-100 dark:bg-gray-800 rounded-xl p-3">
      <p class="text-xs text-gray-600 dark:text-gray-300 font-medium">Bugün toplam</p>
      <p class="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
        {{ snapshot?.todayCount ?? '–' }}
      </p>
    </div>
    <div class="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-3">
      <p class="text-xs text-amber-700 dark:text-amber-300 font-medium">Manuel eşleşme</p>
      <p class="text-2xl font-semibold text-amber-700 dark:text-amber-300 mt-0.5">
        {{ snapshot?.manualMatchToday ?? '–' }}
      </p>
    </div>
  </div>
</template>
