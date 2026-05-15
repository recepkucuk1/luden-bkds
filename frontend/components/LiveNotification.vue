<script setup lang="ts">
const { lastNotification } = useBkds();
const { toTime } = useFormatters();
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="-translate-y-4 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="-translate-y-4 opacity-0"
  >
    <div
      v-if="lastNotification"
      class="mx-4 mt-3 rounded-xl px-3 py-2.5 flex items-center gap-3 shadow-sm"
      :class="
        lastNotification.type === 'giriş'
          ? 'bg-brand text-white'
          : 'bg-gray-700 dark:bg-gray-600 text-white'
      "
    >
      <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
        <Icon :name="lastNotification.type === 'giriş' ? 'arrow-down-right' : 'arrow-up-right'" :size="16" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">
          {{ lastNotification.name }} {{ lastNotification.type }} yaptı
        </p>
        <p class="text-[11px] opacity-80">{{ toTime(lastNotification.time) }}</p>
      </div>
    </div>
  </Transition>
</template>
