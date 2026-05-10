<script setup lang="ts">
const { snapshot } = useBkds();
</script>

<template>
  <div class="grid grid-cols-2 gap-2 px-4 mt-3">
    <div class="bg-gray-100 rounded-xl p-3">
      <p class="text-[11px] text-gray-600 font-medium">Bugün toplam</p>
      <p class="text-2xl font-semibold text-gray-900 mt-0.5">
        {{ snapshot?.todayCount ?? '–' }}
      </p>
    </div>
    <div class="bg-amber-50 rounded-xl p-3">
      <p class="text-[11px] text-amber-700 font-medium">Manuel eşleşme</p>
      <p class="text-2xl font-semibold text-amber-700 mt-0.5">
        {{ snapshot?.manualMatchToday ?? '–' }}
      </p>
    </div>
  </div>
</template>
