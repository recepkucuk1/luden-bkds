<script setup lang="ts">
const { updateAvailable, status, errorMsg, isInTauri, installNow } = useUpdater();

const dismissed = ref(false);

const onInstall = () => {
  installNow();
};

const onDismiss = () => {
  dismissed.value = true;
};

const visible = computed(() => {
  if (!isInTauri()) return false;
  if (dismissed.value && status.value === 'idle') return false;
  return !!updateAvailable.value || status.value === 'downloading' || status.value === 'error';
});
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition duration-200"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="visible"
      class="mx-4 mt-3 rounded-xl bg-brand text-white p-3"
    >
      <div class="flex items-start gap-2.5">
        <span class="text-base leading-none mt-0.5">⬇</span>
        <div class="flex-1 min-w-0">
          <p v-if="status === 'downloading'" class="text-sm font-medium">
            İndiriliyor...
          </p>
          <template v-else-if="status === 'error'">
            <p class="text-sm font-medium">Güncelleme başarısız</p>
            <p class="text-[11px] text-white/80 mt-0.5">{{ errorMsg }}</p>
          </template>
          <template v-else-if="updateAvailable">
            <p class="text-sm font-medium">
              Yeni sürüm: {{ updateAvailable.version }}
            </p>
            <p
              v-if="updateAvailable.notes"
              class="text-[11px] text-white/80 mt-0.5 line-clamp-2"
            >
              {{ updateAvailable.notes }}
            </p>
          </template>

          <div v-if="status === 'idle' && updateAvailable" class="flex gap-2 mt-2">
            <button
              class="px-3 py-1.5 bg-white text-brand text-xs font-medium rounded-lg active:opacity-80"
              @click="onInstall"
            >
              Şimdi güncelle
            </button>
            <button
              class="px-3 py-1.5 text-white/90 text-xs"
              @click="onDismiss"
            >
              Sonra
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
