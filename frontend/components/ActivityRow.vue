<script setup lang="ts">
interface Props {
  name: string;
  time: string;
  type: 'entry' | 'exit';
  uuid?: string;
  isPresent?: boolean;
}

const props = defineProps<Props>();
const { toTime, initials } = useFormatters();

const isEntry = computed(() => props.type === 'entry');
</script>

<template>
  <NuxtLink
    :to="uuid ? `/individual/${uuid}` : ''"
    class="flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-gray-100 transition-colors"
    :class="isEntry ? 'bg-brand-50' : 'bg-gray-50'"
  >
    <div
      class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium"
      :class="
        isEntry ? 'bg-white text-brand' : 'bg-white text-gray-500'
      "
    >
      {{ initials(name) }}
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-gray-900 truncate">{{ name }}</p>
      <p class="text-xs text-gray-500">
        {{ toTime(time) }} · {{ isEntry ? 'Giriş' : 'Çıkış' }}
      </p>
    </div>
    <div
      class="flex-shrink-0"
      :class="isEntry ? 'text-brand' : 'text-gray-400'"
    >
      <Icon :name="isEntry ? 'arrow-down-right' : 'arrow-up-right'" :size="18" />
    </div>
  </NuxtLink>
</template>
