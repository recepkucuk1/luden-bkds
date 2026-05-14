<script setup lang="ts">
/**
 * Tek ikon seti. Lucide tarzı: 24×24 viewBox, currentColor stroke, yuvarlak uçlar.
 * Renk için `class` (text-*), boyut için `size` prop'u kullanılır — eski Unicode
 * glifleri gibi font rengini miras alır.
 *
 * Yeni ikon: aşağıdaki haritaya bir satır ekle, başka yer değişmez.
 */
withDefaults(defineProps<{ name: string; size?: number | string }>(), {
  size: 20,
});

const icons: Record<string, string> = {
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'arrow-down-right': '<path d="M7 7 17 17"/><path d="M17 9v8H9"/>',
  'arrow-up-right': '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  inbox:
    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'triangle-alert':
    '<path d="M12 3 2.5 20h19Z"/><path d="M12 9v5"/><path d="M12 17.5h.01"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10.5 20a2 2 0 0 0 3 0"/>',
  'rotate-cw': '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/>',
};
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="icons[name] ?? ''"
  />
</template>
