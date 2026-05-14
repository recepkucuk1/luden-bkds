<script setup lang="ts">
definePageMeta({
  // Setup sayfası middleware'siz; her zaman erişilebilir
});

const { backendUrl } = useBkds();
const autostart = useAutostart();
const network = useNetworkInfo();
const router = useRouter();
const route = useRoute();

// Done step için pair code çek
const pairCode = ref<string | null>(null);
const fetchPairCode = async () => {
  try {
    const r = await $fetch<{ code: string }>(`${backendUrl}/api/auth/pair-code`);
    pairCode.value = r.code;
  } catch {
    pairCode.value = null;
  }
};

// Düzenleme modu — Settings'ten gelinmiş, karşılamayı atla
const isEdit = computed(() => route.query.edit === '1');

type Step = 'welcome' | 'url' | 'credentials' | 'done';
const currentStep = ref<Step>(isEdit.value ? 'url' : 'welcome');

const baseUrl = ref('');
const username = ref('');
const password = ref('');

const submitting = ref(false);
const errorMsg = ref<string | null>(null);

onMounted(async () => {
  // Edit modunda mevcut config'i yükle (şifre dönmez güvenlik için)
  if (isEdit.value) {
    try {
      const r = await $fetch<{ configured: boolean; info: any }>(
        `${backendUrl}/api/setup/status`,
      );
      if (r.info) {
        baseUrl.value = r.info.baseUrl ?? '';
        username.value = r.info.username ?? '';
      }
    } catch {
      /* yeni kurulum, sessizce geç */
    }
  }
});

// ── Step 1: URL format doğrulaması ──────────────────────────────
// Sadece syntax kontrolü; gerçek bağlanılabilirlik step 2'de credential
// testiyle birlikte doğrulanır (gereksiz round-trip yok)
const isValidUrl = computed(() => {
  const v = baseUrl.value.trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
});

// ── Step 2: Test + kaydet, tek tuşta ───────────────────────────
const submitCredentials = async () => {
  if (!username.value.trim() || !password.value) {
    errorMsg.value = 'Kullanıcı adı ve şifre gerekli';
    return;
  }
  submitting.value = true;
  errorMsg.value = null;
  try {
    const cleanUrl = baseUrl.value.trim().replace(/\/+$/, '');
    // /save endpoint zaten önce testCredentials çağırıp sonra kaydeder
    await $fetch(`${backendUrl}/api/setup/save`, {
      method: 'POST',
      body: {
        baseUrl: cleanUrl,
        username: username.value.trim(),
        password: password.value,
      },
    });

    // İlk kurulumdaysa auto-start'ı sessizce aç (Tauri içinde)
    if (!isEdit.value && autostart.isInTauri()) {
      await autostart.refresh();
      if (autostart.enabled.value === false) {
        await autostart.enable();
      }
    }

    // Edit modunda direkt anasayfaya, yeni kurulumda done ekranına
    if (isEdit.value) {
      router.replace('/');
    } else {
      // Done step'te göstermek üzere network info + pair code çek
      await Promise.all([network.refresh(), fetchPairCode()]);
      currentStep.value = 'done';
    }
  } catch (err: any) {
    errorMsg.value = err?.data?.error || err?.message || 'Bağlantı kurulamadı';
  } finally {
    submitting.value = false;
  }
};

const goBack = () => {
  if (currentStep.value === 'credentials') currentStep.value = 'url';
  else if (currentStep.value === 'url' && !isEdit.value) currentStep.value = 'welcome';
};

const goToHome = () => router.replace('/');

// Step indicator (1/3, 2/3, 3/3) — sadece url ve credentials adımlarında
const stepNumber = computed(() => {
  if (currentStep.value === 'url') return 1;
  if (currentStep.value === 'credentials') return 2;
  return 0;
});
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
    <!-- ── Karşılama ────────────────────────────────────────── -->
    <Transition
      mode="out-in"
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 translate-x-2"
      enter-to-class="opacity-100 translate-x-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0 -translate-x-2"
    >
      <!-- Step: welcome -->
      <div
        v-if="currentStep === 'welcome'"
        key="welcome"
        class="flex-1 flex flex-col"
      >
        <header class="bg-brand text-white pt-[env(safe-area-inset-top)]">
          <div class="px-5 py-8 text-center">
            <div class="w-20 h-20 rounded-2xl bg-white/15 mx-auto flex items-center justify-center mb-4">
              <Icon name="arrow-down-right" :size="44" />
            </div>
            <h1 class="text-2xl font-semibold">BRY Takip</h1>
            <p class="text-sm text-white/85 mt-1">
              Kameranızı cebinizde takip edin
            </p>
          </div>
        </header>

        <main class="flex-1 px-5 py-6 flex flex-col">
          <div class="space-y-4 mb-8">
            <div class="flex items-start gap-3">
              <span class="text-brand text-lg leading-none mt-0.5">●</span>
              <div>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Anlık takip</p>
                <p class="text-[12px] text-gray-600 dark:text-gray-300 leading-relaxed">
                  BKDS giriş-çıkışları telefonunuza yansır
                </p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <span class="text-brand text-lg leading-none mt-0.5">●</span>
              <div>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Otomatik ders hesabı</p>
                <p class="text-[12px] text-gray-600 dark:text-gray-300 leading-relaxed">
                  MEB ödenek için bireyin ders sayısı tek bakışta
                </p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <span class="text-brand text-lg leading-none mt-0.5">●</span>
              <div>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Yerel ağ</p>
                <p class="text-[12px] text-gray-600 dark:text-gray-300 leading-relaxed">
                  Veri kurum dışına çıkmaz; KVKK uyumlu tasarım
                </p>
              </div>
            </div>
          </div>

          <p class="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-6">
            Kurulum yaklaşık <strong class="text-gray-700 dark:text-gray-200">2 dakika</strong>, bir
            kerelik. BRY sunucu adresi ve giriş bilgilerinize ihtiyaç olacak.
          </p>

          <div class="mt-auto pb-[env(safe-area-inset-bottom)]">
            <button
              class="w-full px-4 py-3.5 bg-brand text-white text-sm font-medium rounded-xl
                     active:opacity-80 transition-opacity"
              @click="currentStep = 'url'"
            >
              Başlayalım
            </button>
          </div>
        </main>
      </div>

      <!-- Step: BRY adresi -->
      <div
        v-else-if="currentStep === 'url'"
        key="url"
        class="flex-1 flex flex-col"
      >
        <header class="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 pt-[env(safe-area-inset-top)]">
          <div class="px-4 py-3 flex items-center gap-3">
            <button
              v-if="!isEdit"
              class="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:bg-gray-800"
              aria-label="Geri"
              @click="goBack"
            >
              <Icon name="chevron-left" :size="22" />
            </button>
            <NuxtLink
              v-else
              to="/settings"
              class="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:bg-gray-800"
              aria-label="İptal"
            >
              <Icon name="chevron-left" :size="22" />
            </NuxtLink>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {{ isEdit ? 'Düzenleme' : `Adım ${stepNumber}/2` }}
              </p>
              <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">Sunucu adresi</h1>
            </div>
          </div>
          <!-- Progress bar (sadece yeni kurulum) -->
          <div v-if="!isEdit" class="px-4 pb-3 flex gap-1.5">
            <div class="h-1 flex-1 rounded-full bg-brand"></div>
            <div class="h-1 flex-1 rounded-full bg-gray-200 dark:bg-gray-700 dark:bg-gray-600"></div>
          </div>
        </header>

        <main class="flex-1 px-4 py-5 flex flex-col">
          <p class="text-sm text-gray-700 dark:text-gray-200 mb-4 leading-relaxed">
            BRY sunucusunun yerel ağ adresini girin. Genellikle kurumdaki INNOVA
            cihazının IP adresidir.
          </p>

          <label class="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
            Sunucu adresi
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
            class="w-full px-3 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand/30 focus:bg-white dark:bg-gray-900
                   font-mono"
            @keyup.enter="isValidUrl && (currentStep = 'credentials')"
          />

          <div class="mt-3 text-xs text-gray-600 dark:text-gray-300 leading-relaxed bg-amber-50 dark:bg-amber-950/40 rounded-lg p-3">
            <p class="font-medium text-amber-900 dark:text-amber-200 mb-1">Bilmiyor musunuz?</p>
            <p class="text-amber-800 dark:text-amber-200">
              Kurumdaki INNOVA cihazını teknik olarak kuran kişiden öğrenin —
              "BRY sunucusunun yerel ağ IP'si ve port'u" olarak sorun.
              Genellikle <code class="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">192.168.</code>
              ile başlar, port <code class="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">:3000</code>'dir.
            </p>
          </div>

          <div class="mt-auto pt-4 pb-[env(safe-area-inset-bottom)]">
            <button
              class="w-full px-4 py-3.5 bg-brand text-white text-sm font-medium rounded-xl
                     active:opacity-80 transition-opacity disabled:opacity-50"
              :disabled="!isValidUrl"
              @click="currentStep = 'credentials'"
            >
              Devam
            </button>
          </div>
        </main>
      </div>

      <!-- Step: Kullanıcı + Şifre -->
      <div
        v-else-if="currentStep === 'credentials'"
        key="credentials"
        class="flex-1 flex flex-col"
      >
        <header class="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 pt-[env(safe-area-inset-top)]">
          <div class="px-4 py-3 flex items-center gap-3">
            <button
              class="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:bg-gray-800"
              aria-label="Geri"
              @click="goBack"
            >
              <Icon name="chevron-left" :size="22" />
            </button>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {{ isEdit ? 'Düzenleme' : `Adım ${stepNumber}/2` }}
              </p>
              <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">Giriş bilgileri</h1>
            </div>
          </div>
          <div v-if="!isEdit" class="px-4 pb-3 flex gap-1.5">
            <div class="h-1 flex-1 rounded-full bg-brand"></div>
            <div class="h-1 flex-1 rounded-full bg-brand"></div>
          </div>
        </header>

        <main class="flex-1 px-4 py-5 flex flex-col">
          <p class="text-sm text-gray-700 dark:text-gray-200 mb-4 leading-relaxed">
            BRY web arayüzüne giriş yaparken kullandığınız kullanıcı adı ve
            şifre.
          </p>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
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
                class="w-full px-3 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand/30 focus:bg-white dark:bg-gray-900
                       font-mono"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                Şifre
              </label>
              <input
                v-model="password"
                type="password"
                autocomplete="current-password"
                placeholder="••••••••"
                class="w-full px-3 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand/30 focus:bg-white dark:bg-gray-900"
                @keyup.enter="submitCredentials"
              />
              <p v-if="isEdit" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Güvenlik için mevcut şifre gösterilmez. Yeniden girin.
              </p>
            </div>
          </div>

          <div
            v-if="errorMsg"
            class="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 text-sm text-red-800 dark:text-red-200"
          >
            {{ errorMsg }}
          </div>

          <div class="mt-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Bu bilgiler bilgisayarınızda macOS Keychain (Mac) ya da güvenli
            kayıtta saklanır. Kurum dışına çıkmaz.
          </div>

          <div class="mt-auto pt-4 pb-[env(safe-area-inset-bottom)]">
            <button
              class="w-full px-4 py-3.5 bg-brand text-white text-sm font-medium rounded-xl
                     active:opacity-80 transition-opacity disabled:opacity-50"
              :disabled="submitting || !username.trim() || !password"
              @click="submitCredentials"
            >
              {{ submitting ? 'Bağlanılıyor...' : (isEdit ? 'Kaydet' : 'Bağlan ve devam') }}
            </button>
          </div>
        </main>
      </div>

      <!-- Step: Hazır -->
      <div
        v-else-if="currentStep === 'done'"
        key="done"
        class="flex-1 flex flex-col"
      >
        <header class="bg-brand text-white pt-[env(safe-area-inset-top)]">
          <div class="px-5 py-8 text-center">
            <div class="w-20 h-20 rounded-full bg-white/15 mx-auto flex items-center justify-center mb-4">
              <Icon name="check" :size="44" />
            </div>
            <h1 class="text-2xl font-semibold">Hazırsınız</h1>
            <p class="text-sm text-white/85 mt-1">
              BRY Takip arkaplanda çalışıyor
            </p>
          </div>
        </header>

        <main class="flex-1 px-5 py-6 flex flex-col">
          <p class="text-sm text-gray-700 dark:text-gray-200 mb-5 leading-relaxed">
            BKDS verileriniz şu an telefonunuzdan da erişilebilir. Birkaç ipucu:
          </p>

          <!-- Telefondan bağlanma bilgisi — büyük + actionable -->
          <div
            v-if="network.primaryUrl.value || pairCode"
            class="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-5 space-y-3"
          >
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
              Telefonunuzu şimdi bağlayabilirsiniz
            </p>

            <div v-if="network.primaryUrl.value">
              <p class="text-xs text-gray-600 dark:text-gray-300 mb-1">
                <strong class="text-gray-700 dark:text-gray-200">1.</strong>
                Telefonun tarayıcısında bu adrese gidin:
              </p>
              <div class="font-mono text-[13px] text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 select-all break-all">
                {{ network.primaryUrl.value }}
              </div>
            </div>

            <div v-if="pairCode">
              <p class="text-xs text-gray-600 dark:text-gray-300 mb-1">
                <strong class="text-gray-700 dark:text-gray-200">2.</strong>
                Telefonda bu kodu girin:
              </p>
              <div class="text-center text-2xl font-mono font-semibold tracking-[0.3em] text-brand bg-white dark:bg-gray-900 py-2.5 rounded-lg select-all">
                {{ pairCode }}
              </div>
            </div>

            <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Telefon kurum WiFi'sinde olmalı. Kod 10 dakika geçerli; yenisi
              gerekirse Ayarlar → Cihaz Eşleştirme.
            </p>

            <p
              v-if="network.isWindowsTauri.value"
              class="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-lg p-2 leading-relaxed"
            >
              <strong>Windows kullanıyorsanız:</strong> ilk açılışta Windows
              Firewall <strong>"brytakip-backend ağa erişim istiyor"</strong> sorusu
              gösterebilir. <strong>"Erişime izin ver"</strong> tıklayın — yoksa
              telefon bağlanamaz.
            </p>
          </div>

          <!-- Diğer ipuçları -->
          <div class="space-y-3 mb-6">
            <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <span class="w-7 h-7 rounded-full bg-white dark:bg-gray-900 text-brand flex items-center justify-center flex-shrink-0">
                <Icon name="bell" :size="15" />
              </span>
              <div>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Bildirimleri açın</p>
                <p class="text-[12px] text-gray-600 dark:text-gray-300 leading-relaxed mt-0.5">
                  Yeni giriş-çıkış olduğunda haber alın. Ayarlar → Yerel
                  Bildirim'den izin verin.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <span class="w-7 h-7 rounded-full bg-white dark:bg-gray-900 text-brand flex items-center justify-center flex-shrink-0">
                <Icon name="rotate-cw" :size="15" />
              </span>
              <div>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Otomatik çalışma</p>
                <p class="text-[12px] text-gray-600 dark:text-gray-300 leading-relaxed mt-0.5">
                  Bilgisayar açılınca uygulama kendiliğinden başlar. Tray
                  ikonundan her zaman ulaşabilirsiniz.
                </p>
              </div>
            </div>
          </div>

          <div class="mt-auto pb-[env(safe-area-inset-bottom)]">
            <button
              class="w-full px-4 py-3.5 bg-brand text-white text-sm font-medium rounded-xl
                     active:opacity-80 transition-opacity"
              @click="goToHome"
            >
              Anasayfaya git
            </button>
          </div>
        </main>
      </div>
    </Transition>
  </div>
</template>
