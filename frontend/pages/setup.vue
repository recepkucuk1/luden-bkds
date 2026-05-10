<script setup lang="ts">
definePageMeta({
  // Setup sayfası middleware'siz; her zaman erişilebilir
});

const { backendUrl } = useBkds();
const autostart = useAutostart();
const router = useRouter();
const route = useRoute();

// Mevcut config (varsa) ön doldur
const baseUrl = ref('');
const username = ref('');
const password = ref('');

// Düzenleme modu mu? (settings'ten gelinmiş)
const isEdit = computed(() => route.query.edit === '1');

const status = ref<'idle' | 'testing' | 'saving' | 'ok' | 'error'>('idle');
const errorMsg = ref<string | null>(null);

onMounted(async () => {
  // Mevcut config varsa preload
  try {
    const r = await $fetch<{ configured: boolean; info: any }>(
      `${backendUrl}/api/setup/status`,
    );
    if (r.info) {
      baseUrl.value = r.info.baseUrl ?? baseUrl.value;
      username.value = r.info.username ?? '';
      // şifre döndürülmez güvenlik için
    }
  } catch {
    // Sessizce geç — yeni kurulum
  }
});

const onTest = async () => {
  if (!baseUrl.value || !username.value || !password.value) {
    errorMsg.value = 'Tüm alanları doldurun';
    return;
  }
  status.value = 'testing';
  errorMsg.value = null;
  try {
    const r = await $fetch<{ ok: boolean; error?: string }>(
      `${backendUrl}/api/setup/test`,
      {
        method: 'POST',
        body: {
          baseUrl: baseUrl.value.trim(),
          username: username.value.trim(),
          password: password.value,
        },
      },
    );
    if (r.ok) {
      status.value = 'ok';
    } else {
      status.value = 'error';
      errorMsg.value = r.error || 'Bağlantı başarısız';
    }
  } catch (err: any) {
    status.value = 'error';
    errorMsg.value = err?.message ?? 'İstek başarısız';
  }
};

const onSave = async () => {
  if (!baseUrl.value || !username.value || !password.value) {
    errorMsg.value = 'Tüm alanları doldurun';
    return;
  }
  status.value = 'saving';
  errorMsg.value = null;
  try {
    await $fetch(`${backendUrl}/api/setup/save`, {
      method: 'POST',
      body: {
        baseUrl: baseUrl.value.trim(),
        username: username.value.trim(),
        password: password.value,
      },
    });

    // İlk kurulumdaysa auto-start'ı sessizce aç (kullanıcıya sormadan).
    // Tauri içinde değilse no-op. Düzenleme modunda da müdahale etme — zaten
    // ya açıktır ya da kullanıcı bilerek kapatmıştır.
    if (!isEdit.value && autostart.isInTauri()) {
      await autostart.refresh();
      if (autostart.enabled.value === false) {
        await autostart.enable();
      }
    }

    // Başarılı — anasayfaya yönlendir
    router.replace('/');
  } catch (err: any) {
    status.value = 'error';
    errorMsg.value = err?.data?.error || err?.message || 'Kayıt başarısız';
  }
};

// Form geçerli mi?
const canSubmit = computed(
  () =>
    baseUrl.value.trim().length > 0 &&
    username.value.trim().length > 0 &&
    password.value.length > 0 &&
    status.value !== 'testing' &&
    status.value !== 'saving',
);
</script>

<template>
  <div class="min-h-screen bg-white">
    <!-- Header -->
    <header class="bg-brand text-white pt-[env(safe-area-inset-top)]">
      <div class="px-4 py-5">
        <div class="flex items-center gap-3">
          <NuxtLink
            v-if="isEdit"
            to="/settings"
            class="w-9 h-9 rounded-full flex items-center justify-center text-white/80 active:bg-white/10"
          >
            ‹
          </NuxtLink>
          <div class="flex-1">
            <p class="text-[10px] uppercase tracking-wider text-white/70">
              {{ isEdit ? 'Ayar' : 'Hoş geldiniz' }}
            </p>
            <h1 class="text-lg font-semibold">
              {{ isEdit ? 'BRY bilgilerini güncelle' : 'Kurulum' }}
            </h1>
          </div>
        </div>
        <p v-if="!isEdit" class="text-sm text-white/85 mt-2 leading-relaxed">
          BRY sunucu adresini ve giriş bilgilerinizi girin. Bu bilgiler sadece
          bilgisayarınızda saklanır, kuruma dışına çıkmaz.
        </p>
      </div>
    </header>

    <!-- Form -->
    <main class="px-4 py-5 space-y-4">
      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">
          BRY sunucu adresi
        </label>
        <input
          v-model="baseUrl"
          type="url"
          inputmode="url"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="http://192.168.X.X:3000"
          class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm
                 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:bg-white"
        />
        <p class="text-[11px] text-gray-500 mt-1">
          Yerel ağdaki BRY sunucusunun IP adresi ve portu.
          Genellikle <code>http://192.168.X.X:3000</code> formatındadır.
        </p>
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">
          Kullanıcı adı
        </label>
        <input
          v-model="username"
          type="text"
          inputmode="text"
          autocomplete="username"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="örn: 12345678-1234567"
          class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm
                 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:bg-white"
        />
        <p class="text-[11px] text-gray-500 mt-1">
          BRY web arayüzüne giriş yaparken kullandığınız kullanıcı adı.
        </p>
      </div>

      <div>
        <label class="block text-xs font-medium text-gray-700 mb-1">
          Şifre
        </label>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="••••••••"
          class="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm
                 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:bg-white"
          @keyup.enter="onSave"
        />
        <p v-if="isEdit" class="text-[11px] text-gray-500 mt-1">
          Güvenlik için mevcut şifre gösterilmez. Kaydetmek için yeniden girin.
        </p>
      </div>

      <!-- Status -->
      <div
        v-if="status === 'ok'"
        class="p-3 rounded-xl bg-green-50 border border-green-100 text-sm text-green-800"
      >
        ✓ Bağlantı başarılı! Şimdi <strong>Kaydet</strong> ile devam edebilirsiniz.
      </div>
      <div
        v-if="errorMsg"
        class="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-800"
      >
        {{ errorMsg }}
      </div>

      <!-- Butonlar -->
      <div class="flex gap-2 pt-2">
        <button
          class="flex-1 px-4 py-2.5 bg-gray-100 text-gray-800 text-sm font-medium rounded-xl
                 active:opacity-80 disabled:opacity-50"
          :disabled="!canSubmit"
          @click="onTest"
        >
          {{ status === 'testing' ? 'Test ediliyor...' : 'Bağlantıyı test et' }}
        </button>
        <button
          class="flex-1 px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-xl
                 active:opacity-80 disabled:opacity-50"
          :disabled="!canSubmit"
          @click="onSave"
        >
          {{ status === 'saving' ? 'Kaydediliyor...' : 'Kaydet ve başla' }}
        </button>
      </div>

      <!-- Açıklama -->
      <div class="pt-4 text-[11px] text-gray-500 leading-relaxed border-t border-gray-100 mt-6">
        <p>
          <strong class="text-gray-700">Veriler nereye gidiyor?</strong>
          Tüm bilgiler bu bilgisayarda kalır.
          BRY sunucusuna doğrudan bu bilgisayardan bağlanılır.
          Telefonunuza sadece anlık özet gönderilir.
        </p>
      </div>
    </main>
  </div>
</template>
