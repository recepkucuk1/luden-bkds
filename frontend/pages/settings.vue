<script setup lang="ts">
const { backendUrl, wsConnected } = useBkds();
const auth = useAuth();
const updater = useUpdater();
const autostart = useAutostart();
const network = useNetworkInfo();

// Yerel bildirim — context'e göre Tauri plugin veya browser Notification API.
// İzin reddedilince platforma özel kurtarma talimatı gösterilir (URL barı yok vs).
type NotifPermission = NotificationPermission | 'unsupported';
const supported = ref(false);
const permission = ref<NotifPermission>('default');
const errorMsg = ref<string | null>(null);
const requesting = ref(false);

const testing = ref(false);
const testResult = ref<string | null>(null);
const bryInfo = ref<{ baseUrl: string; username: string; configuredAt?: string } | null>(null);

const isPwa = ref(false);
const isIos = ref(false);

// Çalışma context'i — bildirim API'si ve recovery talimatı buna göre belirlenir
type Context = 'tauri-mac' | 'tauri-win' | 'mac-safari' | 'mac-chrome' | 'ios-pwa' | 'ios-safari' | 'other';
const context = ref<Context>('other');

const isInTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
};

const detectContext = (): Context => {
  if (typeof window === 'undefined') return 'other';
  const ua = navigator.userAgent;
  const isMacUA = /Mac/.test(ua);
  const isWinUA = /Windows/.test(ua);
  const isIosUA = /iPad|iPhone|iPod/.test(ua);
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/Edg/.test(ua) && !/CriOS/.test(ua);
  const isChrome = /Chrome/.test(ua) || /CriOS/.test(ua);

  if (isInTauri()) {
    return isWinUA ? 'tauri-win' : 'tauri-mac';
  }
  if (isIosUA && standalone) return 'ios-pwa';
  if (isIosUA) return 'ios-safari';
  if (isMacUA && isSafari) return 'mac-safari';
  if (isMacUA && isChrome) return 'mac-chrome';
  return 'other';
};

const checkSupport = async () => {
  if (typeof window === 'undefined') return;
  context.value = detectContext();

  if (isInTauri()) {
    // Tauri plugin — macOS Notification Center entegrasyonu
    try {
      const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
      const granted = await isPermissionGranted();
      supported.value = true;
      permission.value = granted ? 'granted' : 'default';
    } catch {
      supported.value = false;
      permission.value = 'unsupported';
    }
    return;
  }

  // Tarayıcı/PWA
  const ok = 'Notification' in window;
  supported.value = ok;
  permission.value = ok ? Notification.permission : 'unsupported';
};

// Pair-code (sadece Mac/localhost'ta gösterilir — backend zaten LAN'a kapatıyor)
const pairCode = ref<string | null>(null);
const pairCodeExpiresAt = ref<string | null>(null);
const deviceCount = ref<number | null>(null);
let pairRefreshTimer: ReturnType<typeof setInterval> | null = null;

const fetchPairCode = async () => {
  try {
    const r = await $fetch<{ code: string; expiresAt: string }>(
      `${backendUrl}/api/auth/pair-code`,
    );
    pairCode.value = r.code;
    pairCodeExpiresAt.value = r.expiresAt;
  } catch {
    // Telefondan açıldıysa 403 — zaten beklenen davranış
    pairCode.value = null;
  }
};

const fetchDeviceCount = async () => {
  try {
    const r = await $fetch<{ count: number }>(`${backendUrl}/api/auth/devices`);
    deviceCount.value = r.count;
  } catch {
    deviceCount.value = null;
  }
};

const revokeAll = async () => {
  if (!confirm('Eşleştirilmiş tüm telefonların erişimi kesilecek. Devam edilsin mi?')) return;
  try {
    await $fetch(`${backendUrl}/api/auth/revoke-all`, { method: 'POST' });
    await fetchDeviceCount();
  } catch {/* ignore */}
};

const rotatingCode = ref(false);
const rotateCode = async () => {
  rotatingCode.value = true;
  try {
    const r = await $fetch<{ code: string; expiresAt: string }>(
      `${backendUrl}/api/auth/rotate-pair-code`,
      { method: 'POST' },
    );
    pairCode.value = r.code;
    pairCodeExpiresAt.value = r.expiresAt;
  } catch {/* ignore */} finally {
    rotatingCode.value = false;
  }
};

onMounted(async () => {
  await checkSupport();
  if (typeof window !== 'undefined') {
    isPwa.value = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    isIos.value = /iPad|iPhone|iPod/.test(navigator.userAgent);
  }
  try {
    const r = await $fetch<{ configured: boolean; info: any }>(
      `${backendUrl}/api/setup/status`,
    );
    bryInfo.value = r.info;
  } catch {
    /* sessizce geç */
  }

  if (auth.isLocalhost()) {
    await fetchPairCode();
    await fetchDeviceCount();
    await network.refresh();
    // Hem kod hem cihaz sayısı her 5 sn'de bir tazelenir.
    // Telefondan yeni eşleştirme olunca deviceCount artışı + (gerekirse) kod
    // değişikliği UI'a yansır. Localhost'ta maliyet ihmal edilebilir.
    pairRefreshTimer = setInterval(() => {
      void fetchPairCode();
      void fetchDeviceCount();
    }, 5 * 1000);
  }

  // Sürüm bilgisi (sadece Tauri içinde anlamlı)
  await updater.loadCurrentVersion();

  // Auto-start durumu (Tauri içinde)
  await autostart.refresh();
});

const onCheckUpdate = async () => {
  const found = await updater.checkNow();
  if (!found && updater.status.value === 'idle') {
    // Banner göstermek için yapay durum tutmuyoruz; sadece test result yerine kısa metin
  }
};

const onInstallUpdate = () => {
  updater.installNow();
};

onUnmounted(() => {
  if (pairRefreshTimer) clearInterval(pairRefreshTimer);
});

const requestPermission = async () => {
  if (!supported.value) return;
  requesting.value = true;
  errorMsg.value = null;
  try {
    if (isInTauri()) {
      const { requestPermission: tauriReq } = await import(
        '@tauri-apps/plugin-notification',
      );
      const r = await tauriReq();
      permission.value = (r as NotifPermission) ?? 'default';
    } else {
      const r = await Notification.requestPermission();
      permission.value = r;
    }
    // 'denied' / 'default' durumlarında errorMsg set ETMİYORUZ — UI'da
    // zaten platform-spesifik bilgi kutusu var, çift mesaj olmasın.
  } catch (err: any) {
    errorMsg.value = err?.message || 'İzin istenemedi';
  } finally {
    requesting.value = false;
  }
};

const onTest = async () => {
  if (!supported.value || permission.value !== 'granted') return;
  testing.value = true;
  testResult.value = null;
  try {
    if (isInTauri()) {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      await sendNotification({ title: 'BRY Takip', body: 'Yerel test bildirimi ✓' });
    } else {
      const opts: NotificationOptions = {
        body: 'Yerel test bildirimi ✓',
        icon: '/icon.svg',
        tag: 'test',
      };
      if (navigator.serviceWorker?.ready) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification('BRY Takip', opts);
      } else {
        new Notification('BRY Takip', opts);
      }
    }
    testResult.value = 'Bildirim gönderildi';
  } catch (err: any) {
    testResult.value = 'Hata: ' + (err?.message || 'Bilinmeyen');
  } finally {
    testing.value = false;
  }
};

const notifStatus = computed(() => {
  if (!supported.value) return { label: 'Desteklenmiyor', tone: 'gray' };
  if (permission.value === 'denied') return { label: 'Reddedildi', tone: 'red' };
  if (permission.value !== 'granted') return { label: 'Henüz açılmadı', tone: 'gray' };
  return { label: 'Aktif', tone: 'green' };
});

// iOS Safari "Web Sitesi Verileri" listesinde sitenin görüneceği şekilde — host kısmı
const shortHost = computed(() => {
  if (typeof window === 'undefined') return '';
  return window.location.hostname;
});

// Modern tarayıcılar Notification API'sini "secure context" arkasına gizler.
// HTTPS, localhost, 127.0.0.1 = secure. LAN IP (örn. 192.168.X.X) = insecure.
// Insecure context'te requestPermission() promptu bile göstermez, sessizce reddeder.
// Tauri webview'i hariç tutuyoruz — orada native plugin var, secure context kuralı işlemez.
const notInSecureContext = computed(() => {
  if (typeof window === 'undefined') return false;
  if (isInTauri()) return false;
  return !window.isSecureContext;
});
</script>

<template>
  <div class="min-h-screen bg-white pb-8">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 pt-[env(safe-area-inset-top)]">
      <div class="px-4 py-3 flex items-center gap-3">
        <NuxtLink
          to="/"
          class="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 active:bg-gray-100"
        >
          ‹
        </NuxtLink>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] uppercase tracking-wider text-gray-500">Ayarlar</p>
          <h1 class="text-base font-semibold text-gray-900">Bildirimler ve Bağlantı</h1>
        </div>
      </div>
    </header>

    <!-- Bağlantı durumu -->
    <section class="mt-4 px-4">
      <h2 class="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-2">
        BRY Bağlantısı
      </h2>
      <div class="bg-gray-50 rounded-xl p-3 space-y-2.5">
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-700">BRY sunucusu</span>
          <span v-if="bryInfo" class="text-[11px] text-gray-500 truncate ml-2">
            {{ bryInfo.baseUrl }}
          </span>
          <span v-else class="text-[11px] text-amber-700">Yapılandırılmamış</span>
        </div>
        <div v-if="bryInfo" class="flex items-center justify-between text-sm">
          <span class="text-gray-700">Kullanıcı adı</span>
          <span class="text-[11px] text-gray-500 truncate ml-2">{{ bryInfo.username }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-700">Canlı bağlantı (WebSocket)</span>
          <span
            class="text-xs px-2 py-0.5 rounded-full"
            :class="
              wsConnected
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-200 text-gray-600'
            "
          >
            {{ wsConnected ? 'Bağlı' : 'Bağlı değil' }}
          </span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-700">Backend adresi</span>
          <span class="text-[11px] text-gray-500 truncate ml-2">{{ backendUrl }}</span>
        </div>
        <div class="pt-1">
          <NuxtLink
            to="/setup?edit=1"
            class="inline-block px-3 py-1.5 bg-gray-200 text-gray-800 text-xs font-medium rounded-lg active:opacity-80"
          >
            BRY bilgilerini değiştir
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Cihaz Eşleştirme (sadece Mac'te gösterilir, telefonda 403 olur) -->
    <section v-if="auth.isLocalhost() && pairCode" class="mt-5 px-4">
      <h2 class="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-2">
        Cihaz Eşleştirme
      </h2>
      <div class="bg-gray-50 rounded-xl p-3 space-y-3">
        <!-- Adım 1: telefondan açılacak adres -->
        <div>
          <p class="text-[11px] text-gray-600 mb-1.5">
            <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand text-white text-[10px] font-semibold mr-1.5">1</span>
            Telefonun tarayıcısında bu adrese gidin
          </p>
          <div
            v-if="network.primaryUrl.value"
            class="font-mono text-[13px] text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-2 select-all break-all"
          >
            {{ network.primaryUrl.value }}
          </div>
          <div
            v-else
            class="text-[11px] text-gray-500 bg-white rounded-lg px-3 py-2"
          >
            Ağ bilgisi alınıyor...
          </div>
          <div
            v-if="network.urls.value.length > 1"
            class="mt-1 space-y-0.5"
          >
            <p class="text-[10px] text-gray-500">Alternatif adresler:</p>
            <div
              v-for="alt in network.urls.value.slice(1)"
              :key="alt"
              class="font-mono text-[11px] text-gray-600 select-all break-all"
            >
              {{ alt }}
            </div>
          </div>

          <!-- Windows Firewall uyarısı — sadece Windows Tauri'de -->
          <div
            v-if="network.isWindowsTauri.value"
            class="mt-2 text-[11px] text-amber-800 bg-amber-50 rounded-lg p-2 leading-relaxed"
          >
            <p class="font-medium mb-0.5">⚠ Windows Firewall</p>
            <p>
              Telefon bağlanamıyorsa Firewall blokluyor olabilir. Başlat →
              <strong>Windows Defender Güvenlik Duvarı</strong> → "Bir uygulamaya izin ver" → listede
              <strong>brytakip-backend</strong>'i bul, <strong>Özel</strong> ve
              <strong>Genel</strong> kutularını işaretle.
            </p>
          </div>
        </div>

        <!-- Adım 2: pair code -->
        <div>
          <p class="text-[11px] text-gray-600 mb-1.5">
            <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand text-white text-[10px] font-semibold mr-1.5">2</span>
            Telefonda bu kodu girin
          </p>
          <div
            class="text-center text-3xl font-mono font-semibold tracking-[0.4em] text-brand
                   bg-white py-3 rounded-xl select-all"
          >
            {{ pairCode }}
          </div>
        </div>
        <div class="flex items-center justify-between text-xs text-gray-600">
          <span>Kayıtlı cihaz</span>
          <span class="font-medium">{{ deviceCount ?? '–' }}</span>
        </div>
        <p class="text-[11px] text-gray-500 leading-relaxed">
          Aynı kod 10 dakika boyunca birden çok telefonu eşleştirmek için kullanılabilir.
          10 dakika sonra ya da "Kodu yenile" tıklayınca yenisi üretilir.
        </p>
        <div class="flex flex-wrap gap-2 pt-1">
          <button
            class="px-3 py-1.5 bg-gray-200 text-gray-800 text-xs font-medium rounded-lg active:opacity-80
                   disabled:opacity-50"
            :disabled="rotatingCode"
            @click="rotateCode"
          >
            {{ rotatingCode ? 'Yenileniyor...' : 'Kodu yenile' }}
          </button>
          <button
            class="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-lg active:opacity-80
                   disabled:opacity-50"
            :disabled="!deviceCount"
            @click="revokeAll"
          >
            Tüm cihaz erişimini iptal et
          </button>
        </div>
      </div>
    </section>

    <!-- Sürüm + Auto-update + Auto-start (sadece Tauri içinde) -->
    <section v-if="updater.isInTauri()" class="mt-5 px-4">
      <h2 class="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-2">
        Uygulama
      </h2>
      <div class="bg-gray-50 rounded-xl p-3 space-y-2.5">
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-700">Sürüm</span>
          <span class="text-[11px] text-gray-500 font-mono">
            {{ updater.currentVersion.value ?? '–' }}
          </span>
        </div>

        <!-- Auto-start toggle -->
        <div class="flex items-center justify-between text-sm">
          <div class="flex-1 min-w-0">
            <p class="text-gray-700">Bilgisayar açılınca otomatik başlat</p>
            <p class="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
              Açıkken Mac restart sonrası uygulama arka planda kendiliğinden başlar.
              Pencere kapalı kalır, tray ikonundan açabilirsiniz.
            </p>
          </div>
          <button
            class="ml-3 relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0
                   disabled:opacity-50"
            :class="autostart.enabled.value ? 'bg-brand' : 'bg-gray-300'"
            :disabled="autostart.busy.value || autostart.enabled.value === null"
            @click="autostart.toggle()"
            :aria-label="autostart.enabled.value ? 'Kapat' : 'Aç'"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              :class="autostart.enabled.value ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </div>

        <p
          v-if="autostart.errorMsg.value"
          class="text-xs text-red-700 bg-red-50 rounded-lg p-2"
        >
          {{ autostart.errorMsg.value }}
        </p>

        <div v-if="updater.updateAvailable.value" class="flex items-center justify-between text-sm">
          <span class="text-gray-700">Yeni sürüm</span>
          <span class="text-[11px] text-brand font-medium">
            {{ updater.updateAvailable.value.version }}
          </span>
        </div>

        <div v-if="updater.errorMsg.value" class="text-xs text-red-700 bg-red-50 rounded-lg p-2">
          {{ updater.errorMsg.value }}
        </div>

        <div class="flex flex-wrap gap-2 pt-1">
          <button
            v-if="updater.updateAvailable.value"
            class="px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-lg active:opacity-80
                   disabled:opacity-50"
            :disabled="updater.status.value === 'downloading'"
            @click="onInstallUpdate"
          >
            {{ updater.status.value === 'downloading' ? 'İndiriliyor...' : 'Şimdi güncelle' }}
          </button>
          <button
            class="px-3 py-1.5 bg-gray-200 text-gray-800 text-xs font-medium rounded-lg active:opacity-80
                   disabled:opacity-50"
            :disabled="updater.status.value === 'checking' || updater.status.value === 'downloading'"
            @click="onCheckUpdate"
          >
            {{ updater.status.value === 'checking' ? 'Kontrol ediliyor...' : 'Güncelleme kontrol et' }}
          </button>
        </div>

        <p
          v-if="updater.status.value === 'idle' && !updater.updateAvailable.value && !updater.errorMsg.value"
          class="text-[11px] text-gray-500"
        >
          Güncellemeler arkaplanda kontrol edilir, yeni sürüm çıkınca burada bildirilir.
        </p>
      </div>
    </section>

    <!-- Bildirim durumu -->
    <section class="mt-5 px-4">
      <h2 class="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-2">
        Yerel Bildirim
      </h2>

      <!-- Insecure context (HTTPS olmadan LAN IP'den erişim):
           Tarayıcılar Notification API'sini bloklar. Tauri uygulaması bu durumdan etkilenmez. -->
      <div
        v-if="notInSecureContext"
        class="bg-gray-50 rounded-xl p-3 space-y-2.5"
      >
        <p class="text-sm text-gray-700 font-medium">
          Kilit ekranı bildirimi şu an aktif değil
        </p>
        <p class="text-[11px] text-gray-600 leading-relaxed">
          Modern tarayıcılar (Safari, Chrome, vb.) güvenli bağlantı (HTTPS)
          olmayan adreslerde bildirim göndermez. Bu uygulamaya yerel ağ üzerinden
          HTTP ile bağlandığınız için tarayıcı bildirim iznini sessizce reddediyor —
          bu uygulama tarafından değil, tarayıcı tarafından konulan bir kısıtlamadır.
        </p>
        <p class="text-[11px] text-gray-600 leading-relaxed">
          <strong class="text-gray-700">Bunun yerine:</strong> uygulama açıkken
          yeni giriş-çıkış olduğunda ekranın üstüne <strong>canlı bildirim banner'ı</strong>
          düşer. Telefon kilitliyken veya uygulama kapalıyken bildirim gelmez.
        </p>
        <p class="text-[11px] text-gray-600 leading-relaxed">
          <strong class="text-gray-700">Tam bildirim takibi için</strong> bilgisayardaki
          BRY Takip uygulamasını kullanın — kilit ekranı dahil her durumda bildirim
          gönderir.
        </p>
      </div>

      <!-- Diğer tüm context'ler için normal akış -->
      <div v-else class="bg-gray-50 rounded-xl p-3 space-y-2.5">
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-700">Durum</span>
          <span
            class="text-xs px-2 py-0.5 rounded-full"
            :class="{
              'bg-green-100 text-green-800': notifStatus.tone === 'green',
              'bg-red-100 text-red-800': notifStatus.tone === 'red',
              'bg-gray-200 text-gray-600': notifStatus.tone === 'gray',
            }"
          >
            {{ notifStatus.label }}
          </span>
        </div>

        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-700">İzin durumu</span>
          <span class="text-[11px] text-gray-500">{{ permission }}</span>
        </div>

        <p class="text-[11px] text-gray-500 leading-relaxed">
          Bildirimler yalnızca yerel ağda çalışır. Veriniz kurum dışına çıkmaz;
          Apple veya Google sunucuları kullanılmaz. Telefon kurum WiFi'sinden
          ayrıldığında bildirim gelmez.
        </p>

        <div v-if="errorMsg" class="text-xs text-red-700 bg-red-50 rounded-lg p-2">
          {{ errorMsg }}
        </div>

        <!-- iOS Safari (PWA değil): Ana Ekrana Ekle gerekiyor -->
        <div
          v-if="context === 'ios-safari'"
          class="text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5 leading-relaxed"
        >
          <p class="font-medium mb-1">⚠ Safari modundasınız</p>
          <p>
            iPhone'da bildirim almak için bu sayfayı <strong>Ana Ekrana Ekle</strong>menizgerekir.
            Safari'nin paylaş düğmesine basın → <strong>"Ana Ekrana Ekle"</strong> → ana ekrandaki
            ikonu açın → izin verin.
          </p>
        </div>

        <!-- Reddedildi durumu — context'e göre platform-spesifik kurtarma -->
        <div
          v-if="permission === 'denied'"
          class="text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5 leading-relaxed"
        >
          <p class="font-medium mb-1">İzin reddedilmiş — geri açmak için</p>

          <!-- Tauri (Mac): Sistem Ayarları → Bildirimler -->
          <ol v-if="context === 'tauri-mac'" class="list-decimal list-inside space-y-0.5">
            <li>Apple menüsü → <strong>Sistem Ayarları</strong></li>
            <li><strong>Bildirimler</strong> bölümüne girin</li>
            <li>Listeden <strong>BRY Takip</strong>'i bulun</li>
            <li>"Bildirimlere izin ver" seçeneğini açın</li>
            <li>Bu uygulamayı tray'den çıkış yapıp yeniden açın</li>
          </ol>

          <!-- Tauri (Windows) -->
          <ol v-else-if="context === 'tauri-win'" class="list-decimal list-inside space-y-0.5">
            <li>Başlat → <strong>Ayarlar</strong> → <strong>Sistem</strong> → <strong>Bildirimler</strong></li>
            <li>Listeden <strong>BRY Takip</strong>'i bulun</li>
            <li>Bildirimleri açın</li>
            <li>Uygulamayı yeniden başlatın</li>
          </ol>

          <!-- Mac Safari: Safari Tercihler → Web Siteleri -->
          <ol v-else-if="context === 'mac-safari'" class="list-decimal list-inside space-y-0.5">
            <li>Menü çubuğu → <strong>Safari → Ayarlar</strong> (⌘,)</li>
            <li><strong>Web Siteleri</strong> sekmesi → <strong>Bildirimler</strong></li>
            <li>Bu sitenin satırını bulup <strong>"İzin Ver"</strong> seçin</li>
            <li>Bu sayfayı yenileyin</li>
          </ol>

          <!-- Mac Chrome: URL bar lock icon -->
          <ol v-else-if="context === 'mac-chrome'" class="list-decimal list-inside space-y-0.5">
            <li>Adres çubuğunun solundaki <strong>kilit / ünlem ikonuna</strong> tıklayın</li>
            <li><strong>Site ayarları</strong>'na girin</li>
            <li><strong>Bildirimler</strong>'i <strong>"İzin ver"</strong> yapın</li>
            <li>Sayfayı yenileyin</li>
          </ol>

          <!-- iOS PWA: Safari website data sıfırla + tekrar ekle -->
          <ol v-else-if="context === 'ios-pwa'" class="list-decimal list-inside space-y-0.5">
            <li>Ana ekrandaki <strong>BRY Takip</strong> ikonunu tap-tut → <strong>Uygulamayı Sil</strong></li>
            <li>iPhone <strong>Ayarlar</strong> → <strong>Safari</strong> → <strong>Gelişmiş</strong> → <strong>Web Sitesi Verileri</strong></li>
            <li>Bu adresi (örn. {{ shortHost }}) bulup <strong>silin</strong></li>
            <li>Safari'de bu sayfayı tekrar açın → paylaş → <strong>Ana Ekrana Ekle</strong></li>
            <li>Ana ekrandan açıp izin verin</li>
          </ol>

          <!-- Diğer / fallback -->
          <p v-else>
            Tarayıcı/sistem ayarlarından bu site/uygulama için bildirim iznini "İzin ver" yapıp
            sayfayı yenileyin.
          </p>
        </div>

        <!-- Butonlar -->
        <div class="flex flex-wrap gap-2 pt-1">
          <!-- "İzin aç" butonu sadece henüz cevap verilmemiş durumda görünür.
               denied iken tarayıcı tekrar prompt göstermez — buton işe yaramaz, gizliyoruz.
               Kullanıcı yukarıdaki amber kutudaki adımları izleyip tarayıcı/sistem
               ayarlarından izni geri vermek zorunda. -->
          <button
            v-if="permission === 'default' && supported"
            class="px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-lg active:opacity-80 disabled:opacity-50"
            :disabled="requesting || (isIos && !isPwa)"
            @click="requestPermission"
          >
            {{ requesting ? 'İzin isteniyor...' : 'Bildirim iznini aç' }}
          </button>
          <button
            v-if="permission === 'granted'"
            class="px-3 py-1.5 bg-gray-200 text-gray-800 text-xs font-medium rounded-lg active:opacity-80 disabled:opacity-50"
            :disabled="testing"
            @click="onTest"
          >
            {{ testing ? 'Gönderiliyor...' : 'Test bildirimi göster' }}
          </button>
        </div>

        <p v-if="testResult" class="text-[11px] text-gray-600">{{ testResult }}</p>
      </div>
    </section>

    <!-- Cihaz bilgisi (debug) -->
    <section class="mt-5 px-4">
      <h2 class="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-2">
        Cihaz
      </h2>
      <div class="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs text-gray-600">
        <div class="flex justify-between">
          <span>Platform</span>
          <span>{{ isIos ? 'iOS' : (typeof navigator !== 'undefined' ? navigator.platform : '–') }}</span>
        </div>
        <div class="flex justify-between">
          <span>PWA modu</span>
          <span>{{ isPwa ? 'Evet' : 'Hayır (tarayıcı)' }}</span>
        </div>
        <div class="flex justify-between">
          <span>Service Worker</span>
          <span>{{ supported ? 'Destekleniyor' : 'Desteklenmiyor' }}</span>
        </div>
      </div>
    </section>

    <p class="text-center text-[10px] text-gray-400 mt-6 px-4">
      Bildirimler için Mac'in açık olması ve telefonun kurum WiFi'sinde olması gerekir.
    </p>
  </div>
</template>
