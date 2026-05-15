<script setup lang="ts">
import { calculateLessons } from '~/composables/useLessons';

const { snapshot, loading, error, fetchSnapshot, connectWs, disconnectWs, selectedDate, setDate } = useBkds();

// TR günü "bugün" string'i — date input max'ı + bugüne dönüş kontrolü için
const todayStr = computed(() =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }),
);

// Seçili gün için v-model uyumlu wrapper (input type=date YYYY-MM-DD bekler)
const dateInputModel = computed({
  get: () => selectedDate.value ?? todayStr.value,
  set: (v: string) => {
    if (!v || v > todayStr.value) return; // gelecek günler engelli
    setDate(v === todayStr.value ? null : v);
  },
});

// "Pazar, 14 Mayıs 2026" gibi okunaklı format (TR locale)
function formatTrDate(date: string): string {
  // T12 sabitlemesi → timezone edge case'lerinde gün kaymasını önler
  const d = new Date(`${date}T12:00:00+03:00`);
  return d.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Istanbul',
  });
}

// Önceki/sonraki gün
function shiftDay(delta: number) {
  const cur = selectedDate.value ?? todayStr.value;
  const d = new Date(`${cur}T12:00:00+03:00`);
  d.setDate(d.getDate() + delta);
  const newDate = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  if (newDate > todayStr.value) return; // gelecek engelli
  setDate(newDate === todayStr.value ? null : newDate);
}

const isViewingToday = computed(() => selectedDate.value === null);
const { relative } = useFormatters();
const { autoCheckOnStartup } = useUpdater();
const license = useLicense();
const auth = useAuth();

// Tüm akordeonların paylaştığı reactive "şu an" — her dakika tik atar
// İçerideyken süre canlı sayar
const now = useState<number>('app-now', () => Date.now());
let nowTimer: ReturnType<typeof setInterval>;
let licenseTickTimer: ReturnType<typeof setInterval>;

onMounted(() => {
  fetchSnapshot();
  connectWs();
  // Her dakika "şu an"ı güncelle — ders saati hesabı canlı kalsın
  nowTimer = setInterval(() => {
    now.value = Date.now();
  }, 60000);
  // Tauri içindeyse 5 sn sonra güncelleme kontrolü (PWA'da no-op)
  autoCheckOnStartup(5000);

  // Lisans cache'i yalnızca localhost'ta (Mac/Win Tauri app) anlamlı;
  // telefondaki PWA Mac'in proxy'si, kendi lisans state'i tutmaz
  if (auth.isLocalhost()) {
    license.loadCached();
    if (license.status.value?.key && license.shouldReverify()) {
      license.reverify().catch(() => { /* internet yoksa cache geçerli */ });
    }
    // 30 dk'da bir background reverify — admin'den iptal makul süre içinde
    // yansır, kullanıcı uygulamayı kapatıp açmasa bile.
    licenseTickTimer = setInterval(() => {
      if (license.status.value?.key && license.shouldReverify()) {
        license.reverify().catch(() => { /* sessiz */ });
      }
    }, 30 * 60 * 1000);
  }
});

onUnmounted(() => {
  disconnectWs();
  if (nowTimer) clearInterval(nowTimer);
  if (licenseTickTimer) clearInterval(licenseTickTimer);
});

const onResume = () => {
  // Sayfa görünür olduğunda her zaman snapshot'ı yenile + WS'yi yeniden bağla
  fetchSnapshot();
  connectWs();  // Bu zaten eski WS'yi kapatıp yenisini kuruyor
};

const onVisibility = () => {
  if (document.visibilityState === 'visible') {
    onResume();
  }
};

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onResume);
  window.addEventListener('pageshow', onResume);  // iOS Safari için kritik
});
onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', onResume);
  window.removeEventListener('pageshow', onResume);
});

const presence = computed(() => snapshot.value?.presence ?? []);

type Filter = 'all' | 'student' | 'staff';
type SortMode = 'last' | 'first' | 'lessons' | 'alpha';

const filter = ref<Filter>('all');
const sortMode = ref<SortMode>('last');
const searchQuery = ref('');
const startTime = ref(''); // "HH:MM", boş = sınır yok
const endTime = ref('');

// ISO datetime → "HH:MM" (yerel saat) — saat aralığı karşılaştırması için
function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Birey için ders sayısı (öğrenci değilse veya firstEntry yoksa -1 → sıralamada en sona)
function lessonCount(p: { individual: { individual_type: number }; firstEntry: string | null; lastExit: string | null; lastActivity: { activity_time: string } }): number {
  if (p.individual.individual_type !== 1 || !p.firstEntry) return -1;
  const lastTime = new Date(p.lastActivity.activity_time).getTime();
  return calculateLessons(p.firstEntry, p.lastExit, lastTime).lessons;
}

const filteredList = computed(() => {
  let items = presence.value;

  // Tab filtresi
  if (filter.value === 'student')
    items = items.filter((p) => p.individual.individual_type === 1);
  else if (filter.value === 'staff')
    items = items.filter((p) => p.individual.individual_type === 2);

  // İsim araması — maskeli isimlerde ilk 3 harf kurumun tanıma ipucu
  const q = searchQuery.value.trim().toUpperCase();
  if (q) {
    items = items.filter((p) => p.individual.full_name.toUpperCase().includes(q));
  }

  // Saat aralığı (ilk girişe göre)
  if (startTime.value || endTime.value) {
    items = items.filter((p) => {
      if (!p.firstEntry) return false;
      const hhmm = isoToHHMM(p.firstEntry);
      if (startTime.value && hhmm < startTime.value) return false;
      if (endTime.value && hhmm > endTime.value) return false;
      return true;
    });
  }

  // Sıralama
  return [...items].sort((a, b) => {
    switch (sortMode.value) {
      case 'first':
        // Erkenden gelen üstte (eski zaman önce); null firstEntry'ler en sona
        if (!a.firstEntry) return 1;
        if (!b.firstEntry) return -1;
        return a.firstEntry.localeCompare(b.firstEntry);
      case 'lessons':
        return lessonCount(b) - lessonCount(a);
      case 'alpha':
        return a.individual.full_name.localeCompare(b.individual.full_name, 'tr');
      case 'last':
      default:
        return b.lastActivity.activity_time.localeCompare(a.lastActivity.activity_time);
    }
  });
});

const lastReadingMinutesAgo = computed(() => {
  if (!snapshot.value?.presence.length) return null;
  let latest = '';
  for (const p of snapshot.value.presence) {
    if (p.lastActivity.activity_time > latest) latest = p.lastActivity.activity_time;
  }
  if (!latest) return null;
  return Math.floor((Date.now() - new Date(latest).getTime()) / 60000);
});

const cameraWarning = computed(() => {
  // Sadece bugüne bakarken anlamlı — geçmiş günde "X dk okuma yok" hep tetiklenir
  if (selectedDate.value !== null) return null;
  const m = lastReadingMinutesAgo.value;
  if (m === null) return null;
  const h = new Date().getHours();
  if (h < 8 || h >= 20) return null;
  if (m >= 15) return `${m} dk okuma yok`;
  return null;
});

// Durum şeridi — tek öncelikli uyarı (öncelik: veri hatası > kamera).
// Lisans/abonelik hard error'ları yukarıdaki tam ekran modalla ele alınır,
// burada tekrarlanmaz. Trial/cancel countdown banner'ları soft uyarılar
// olduğu için kendi v-if zincirinde ayrı kalır.
type StatusAction =
  | { kind: 'retry'; label: string }
  | { kind: 'link'; label: string; to: string };

interface StatusBanner {
  tone: 'red' | 'amber';
  title: string;
  detail: string;
  actions: StatusAction[];
}

const statusBanner = computed<StatusBanner | null>(() => {
  if (error.value) {
    return {
      tone: 'red',
      title: 'Veriler yüklenemedi',
      detail: error.value,
      actions: [
        { kind: 'retry', label: 'Tekrar dene' },
        { kind: 'link', label: 'Sistem durumu', to: '/settings' },
      ],
    };
  }
  if (cameraWarning.value) {
    return {
      tone: 'amber',
      title: cameraWarning.value,
      detail: 'Kameraları kontrol et',
      actions: [],
    };
  }
  return null;
});
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 pb-8">
    <AppHeader />

    <!-- Hard block — abonelik/lisans iptal/expired/wrong-machine durumunda
         BKDS verisini göstermeyi engelle. Sadece localhost'ta (Mac/Win app);
         PWA'da bu kontrol Mac üzerinden yapılır. -->
    <div
      v-if="auth.isLocalhost() && license.isBlocked.value"
      class="fixed inset-0 z-50 bg-gray-900/95 dark:bg-gray-950/98 backdrop-blur flex items-center justify-center p-6"
    >
      <div class="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-2xl">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 flex items-center justify-center">
            <Icon name="ban" :size="22" />
          </div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Uygulama Kullanılamaz
          </h2>
        </div>
        <p class="text-sm text-gray-700 dark:text-gray-200 leading-relaxed mb-4">
          {{
            license.isWrongMachine.value
              ? 'Lisansınız başka bir cihaza bağlı. Bu cihazda kullanmak için aboneliğinizi yönetin veya destek alın.'
              : license.isRevoked.value
                ? 'Lisansınız iptal edilmiş. Aboneliğinizi yenilemek için brytakip.com adresinden ödeme yapın.'
                : license.isSubscriptionInvalid.value || license.subStatus.value === 'EXPIRED' || license.subStatus.value === 'PAST_DUE'
                  ? 'Aboneliğiniz aktif değil. Yenilemek için brytakip.com adresinden ödeme yapın.'
                  : license.isExpired.value
                    ? 'Lisans süreniz dolmuş. Yenilemek için brytakip.com.'
                    : 'Lisansınız geçersiz görünüyor. Detay için brytakip.com / WhatsApp.'
          }}
        </p>
        <div class="space-y-2">
          <button
            class="block w-full px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-lg active:opacity-80"
            @click="license.openCheckoutPage()"
          >
            Aboneliği Yönet ↗
          </button>
          <NuxtLink
            to="/settings"
            class="block w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium rounded-lg text-center active:opacity-80"
          >
            Ayarlar → Lisansı yenile
          </NuxtLink>
          <button
            :disabled="license.verifying.value"
            class="block w-full px-4 py-2 text-xs text-gray-500 dark:text-gray-400 active:opacity-80 disabled:opacity-50"
            @click="license.reverify(true)"
          >
            {{ license.verifying.value ? 'Kontrol ediliyor...' : 'Tekrar dene' }}
          </button>
        </div>
        <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-4 text-center">
          Sorun varsa: <a href="mailto:info@brytakip.com" class="underline">info@brytakip.com</a>
        </p>
      </div>
    </div>

    <LiveNotification />
    <UpdateBanner />

    <!-- Trial countdown: 3 gün kala uyarı banner'ı.
         Hard license/abonelik error'ları tam ekran modalla (yukarıda
         isBlocked) ele alınıyor — burada tekrarlanan banner kaldırıldı. -->
    <NuxtLink
      v-if="
        auth.isLocalhost()
          && license.isSubTrial.value
          && license.daysUntilTrialEnd.value !== null
          && license.daysUntilTrialEnd.value <= 3
      "
      to="/settings"
      class="block mx-4 mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-sm active:opacity-80"
    >
      <p class="font-medium">
        Trial bitimine
        {{ license.daysUntilTrialEnd.value === 0 ? 'bugün' : license.daysUntilTrialEnd.value + ' gün' }}
        kaldı
      </p>
      <p class="text-[11px] mt-0.5 opacity-80">Aboneliği başlat: brytakip.com</p>
    </NuxtLink>

    <!-- İptal edilen abonelik: dönem sonuna yaklaşma uyarısı -->
    <NuxtLink
      v-else-if="
        auth.isLocalhost()
          && license.isSubCanceled.value
          && license.daysUntilPeriodEnd.value !== null
          && license.daysUntilPeriodEnd.value <= 7
      "
      to="/settings"
      class="block mx-4 mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-sm active:opacity-80"
    >
      <p class="font-medium">
        Erişim {{ license.daysUntilPeriodEnd.value }} gün sonra sona erecek
      </p>
      <p class="text-[11px] mt-0.5 opacity-80">İptal'i geri almak için brytakip.com</p>
    </NuxtLink>

    <!-- Durum şeridi — tek öncelikli uyarı (veri hatası ya da kamera).
         Önceki ayrı error + cameraWarning banner'ları burada birleşti. -->
    <div
      v-if="statusBanner"
      class="mx-4 mt-3 p-3 rounded-xl text-sm"
      :class="statusBanner.tone === 'red'
        ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'"
    >
      <p class="font-medium">{{ statusBanner.title }}</p>
      <p class="text-[11px] mt-0.5 opacity-80 leading-relaxed">{{ statusBanner.detail }}</p>
      <div v-if="statusBanner.actions.length" class="flex items-center gap-3 mt-2">
        <template v-for="a in statusBanner.actions" :key="a.label">
          <button
            v-if="a.kind === 'retry'"
            class="px-3 py-1 bg-white dark:bg-gray-800 rounded-lg text-xs font-medium border border-red-200 dark:border-red-900 active:opacity-80"
            @click="fetchSnapshot()"
          >
            {{ a.label }}
          </button>
          <NuxtLink v-else :to="a.to" class="text-[11px] underline opacity-90">
            {{ a.label }} →
          </NuxtLink>
        </template>
      </div>
    </div>

    <!-- Tarih seçici — geçmiş güne bakış için. Bugünde WS canlı, geçmişte statik. -->
    <div class="px-4 mt-3 flex items-center gap-2">
      <button
        type="button"
        class="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label="Önceki gün"
        @click="shiftDay(-1)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>

      <label class="flex-1 relative">
        <input
          v-model="dateInputModel"
          type="date"
          :max="todayStr"
          class="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </label>

      <button
        type="button"
        :disabled="isViewingToday"
        class="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800"
        aria-label="Sonraki gün"
        @click="shiftDay(1)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </button>

      <button
        v-if="!isViewingToday"
        type="button"
        class="px-3 py-2 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-dark transition-colors"
        @click="setDate(null)"
      >
        Bugün
      </button>
    </div>

    <!-- Geçmiş gün rozeti — kullanıcı canlı veriye bakmadığını bilsin -->
    <div
      v-if="!isViewingToday && snapshot"
      class="mx-4 mt-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span><strong>{{ formatTrDate(snapshot.date) }}</strong> — geçmiş gün, canlı güncelleme yok</span>
    </div>

    <StatsCards />

    <HourlyDistribution />

    <WeeklyComparison />

    <div class="px-4 mt-4">
      <div class="inline-flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs">
        <button
          v-for="f in [
            { v: 'all', label: 'Hepsi' },
            { v: 'student', label: 'Birey' },
            { v: 'staff', label: 'Personel' },
          ]"
          :key="f.v"
          class="px-3 py-1.5 rounded-md font-medium transition-colors"
          :class="
            filter === f.v
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400'
          "
          @click="filter = f.v as Filter"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <!-- Filtre / sıralama / arama kontrolleri -->
    <div class="px-4 mt-3 flex flex-wrap items-center gap-2">
      <div class="relative flex-1 min-w-[180px]">
        <svg
          class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        ><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="İsimde ara (ilk 3 harf)..."
          class="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:bg-white dark:focus:bg-gray-900"
        />
      </div>
      <select
        v-model="sortMode"
        class="px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
        aria-label="Sıralama"
      >
        <option value="last">Son hareket</option>
        <option value="first">İlk giriş</option>
        <option value="lessons">Ders sayısı</option>
        <option value="alpha">İsim (A-Z)</option>
      </select>
    </div>

    <!-- Saat aralığı (ilk girişe göre filtreler) -->
    <div class="px-4 mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
      <span class="font-medium whitespace-nowrap">Saat aralığı:</span>
      <input
        v-model="startTime"
        type="time"
        class="px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <span class="text-gray-400">—</span>
      <input
        v-model="endTime"
        type="time"
        class="px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <button
        v-if="startTime || endTime"
        type="button"
        class="ml-auto text-[11px] text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 underline"
        @click="startTime = ''; endTime = ''"
      >
        Temizle
      </button>
    </div>

    <div v-if="loading && !snapshot" class="px-4 mt-4 space-y-2">
      <div v-for="i in 5" :key="i" class="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
    </div>

    <template v-else-if="snapshot">
      <section class="mt-4">
        <div class="px-4 flex items-center justify-between mb-2">
          <h2 class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
            Bugün
          </h2>
          <span class="text-[11px] text-gray-400 dark:text-gray-500">{{ filteredList.length }} kişi</span>
        </div>
        <!-- Empty state — başlangıçta veya kategori boşken -->
        <div
          v-if="filteredList.length === 0"
          class="mx-4 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl text-center"
        >
          <div class="w-12 h-12 mx-auto mb-2 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-500">
            <Icon name="inbox" :size="24" />
          </div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-200">
            Bu kategoride henüz kayıt yok
          </p>
          <p class="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
            BRY kameralarınızdan ilk hareket geldiğinde burada görünecek.
          </p>
        </div>
        <div v-else class="px-4 space-y-1.5">
          <IndividualAccordion
            v-for="p in filteredList"
            :key="p.individual.uuid"
            :individual="p.individual"
            :last-activity="p.lastActivity"
            :today-activity-count="p.todayActivityCount"
            :first-entry="p.firstEntry"
            :last-exit="p.lastExit"
          />
        </div>
      </section>

      <p class="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-6">
        Son güncelleme: {{ relative(snapshot.generatedAt) }}
      </p>
    </template>
  </div>
</template>
