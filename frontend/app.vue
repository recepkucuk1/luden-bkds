<script setup lang="ts">
// Tema watcher — 'system' modundayken OS tercihi değişimini canlı izle.
// Erken inline script (nuxt.config.ts'de) html.dark class'ını zaten set'lemiş;
// burası sadece sonraki değişimleri reactive olarak yansıtır.
const theme = useTheme();
onMounted(() => {
  theme.refresh();
  theme.watchSystem();
});
onUnmounted(() => {
  theme.unwatchSystem();
});
</script>

<template>
  <NuxtPage />
</template>
