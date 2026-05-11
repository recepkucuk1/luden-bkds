<script setup lang="ts">
definePageMeta({
  // Pair sayfası middleware'siz; her zaman erişilebilir.
  // Token yoksa zaten buraya yönlendiriliyoruz.
});

const { setToken } = useAuth();
const { backendUrl } = useBkds();
const router = useRouter();

const code = ref('');
const status = ref<'idle' | 'submitting' | 'error'>('idle');
const errorMsg = ref<string | null>(null);

const onInput = (e: Event) => {
  // Sadece rakam, max 6 hane
  const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6);
  code.value = v;
};

const submit = async () => {
  if (code.value.length !== 6) {
    errorMsg.value = '6 haneli kodu girin';
    return;
  }
  status.value = 'submitting';
  errorMsg.value = null;
  try {
    const r = await $fetch<{ ok: boolean; token: string }>(
      `${backendUrl}/api/auth/pair`,
      { method: 'POST', body: { code: code.value } },
    );
    setToken(r.token);
    router.replace('/');
  } catch (err: any) {
    status.value = 'error';
    errorMsg.value = err?.data?.error || 'Kod doğrulanamadı';
    code.value = '';
  } finally {
    if (status.value !== 'error') status.value = 'idle';
  }
};
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
    <header class="bg-brand text-white px-4 py-5 pt-[max(env(safe-area-inset-top),1.25rem)]">
      <p class="text-[10px] uppercase tracking-wider text-white/70">Cihaz Eşleştirme</p>
      <h1 class="text-lg font-semibold">Kodu girin</h1>
      <p class="text-sm text-white/85 mt-2 leading-relaxed">
        Bilgisayardaki BRY Takip uygulamasının ayarlar ekranında gösterilen
        6 haneli kodu girin. Bu telefon kuruma kayıtlı olur, bir daha sormayız.
      </p>
    </header>

    <main class="flex-1 px-4 py-6 space-y-4">
      <input
        :value="code"
        @input="onInput"
        type="tel"
        inputmode="numeric"
        pattern="[0-9]*"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        maxlength="6"
        placeholder="000000"
        class="w-full text-center text-3xl font-mono font-semibold tracking-[0.5em]
               px-3 py-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl
               focus:outline-none focus:ring-2 focus:ring-brand/30 focus:bg-white dark:bg-gray-900"
      />

      <div
        v-if="errorMsg"
        class="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 text-sm text-red-800 dark:text-red-200"
      >
        {{ errorMsg }}
      </div>

      <button
        class="w-full px-4 py-3 bg-brand text-white text-sm font-medium rounded-xl
               active:opacity-80 disabled:opacity-50"
        :disabled="code.length !== 6 || status === 'submitting'"
        @click="submit"
      >
        {{ status === 'submitting' ? 'Doğrulanıyor...' : 'Eşleştir' }}
      </button>

      <div class="pt-4 text-[11px] text-gray-500 dark:text-gray-400 dark:text-gray-500 leading-relaxed border-t border-gray-100 dark:border-gray-800 mt-6">
        <p class="font-medium text-gray-700 dark:text-gray-200 mb-1">Kod nereden alınır?</p>
        <p>
          Bilgisayardaki BRY Takip uygulamasını açın → Ayarlar →
          "Cihaz Eşleştirme" bölümünde 6 haneli kod görünür.
          Kod 10 dakikada bir otomatik yenilenir.
        </p>
      </div>
    </main>
  </div>
</template>
