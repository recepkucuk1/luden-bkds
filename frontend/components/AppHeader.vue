<script setup lang="ts">
const { snapshot, wsConnected } = useBkds();

const time = ref('');
const updateTime = () => {
  time.value = new Date().toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  updateTime();
  timer = setInterval(updateTime, 30000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 pt-[env(safe-area-inset-top)]">
    <div class="px-4 py-3 flex items-center justify-between">
      <div>
        <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Luden Keşif</p>
        <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">Anlık Durum</h1>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5 text-xs">
          <span
            class="w-2 h-2 rounded-full"
            :class="wsConnected ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'"
          />
          <span class="text-gray-500 dark:text-gray-400">{{ wsConnected ? 'Canlı' : 'Bekleniyor' }}</span>
        </div>
        <span class="text-sm font-medium text-gray-700 dark:text-gray-200">{{ time }}</span>
        <NuxtLink
          to="/settings"
          class="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
          aria-label="Ayarlar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </NuxtLink>
      </div>
    </div>
  </header>
</template>
