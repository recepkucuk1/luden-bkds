/**
 * useBkds — backend ile konuşan ana composable
 *
 * Sorumlulukları:
 *  - Snapshot'ı fetch etmek
 *  - WebSocket'a bağlanıp yeni olay geldiğinde snapshot'ı yenilemek
 *  - Reactive state sağlamak (her sayfada `useBkds()` çağrılınca aynı veri)
 *
 * Nuxt'ın useState'i sayesinde state SSR-safe ve global.
 */

interface Individual {
  uuid: string;
  full_name: string;
  identity_number: string;
  individual_type: number;
  gender: 'Erkek' | 'Kadın';
  birth_date: string | null;
  disability_code: string;
}

interface Activity {
  uuid: string;
  individual_uuid: string;
  activity_type: 'entry' | 'exit';
  activity_time: string;
  created_at: string;
  updated_at: string;
  is_matched_manually: boolean;
  manuel_match_time: string | null;
  manual_match_similarity_score: number | null;
  roi_url: string;
}

interface PresenceItem {
  individual: Individual;
  lastActivity: Activity;
  todayActivityCount: number;
  firstEntry: string | null;
  lastExit: string | null;
  hasManualMatch: boolean;
}

interface RecentActivityItem {
  activity: Activity;
  individual: Pick<Individual, 'uuid' | 'full_name'>;
}

export interface Snapshot {
  generatedAt: string;
  date: string;           // hangi günün snapshot'ı (YYYY-MM-DD, TR günü)
  isToday: boolean;       // bugün mü? (UI canlı/geçmiş ayrımı için)
  todayCount: number;
  presence: PresenceItem[];
  recentActivities: RecentActivityItem[];
  manualMatchToday: number;
  hourlyDistribution: number[]; // 24 eleman, her TR saatinin (0-23) aktivite sayısı
}

export const useBkds = () => {
  const config = useRuntimeConfig();
  const auth = useAuth();

  // Backend URL hesaplama — sayfa açıldığı host'u baz alır
  // - Tauri içinde (localhost): localhost:8787
  // - Telefondan Mac-IP:3000'den açıldı: Mac-IP:8787
  // - Bu sayede tek build her senaryoda doğru çalışır
  const computeBackendUrl = (): string => {
    if (typeof window !== 'undefined') {
      const loc = window.location;
      if (
        loc.protocol === 'tauri:' ||
        loc.hostname === 'tauri.localhost' ||
        loc.hostname === 'localhost' ||
        loc.hostname === '127.0.0.1'
      ) {
        return 'http://localhost:8787';
      }
      return `${loc.protocol}//${loc.hostname}:8787`;
    }
    return config.public.backendUrl || 'http://localhost:8787';
  };
  // String, ref değil — kullanan yerlerde .value gerekmez
  const backendUrl = computeBackendUrl();

  // Token'ı storage'tan ilk seferde yükle
  if (typeof window !== 'undefined') {
    auth.loadFromStorage();
  }

  const snapshot = useState<Snapshot | null>('bkds-snapshot', () => null);
  const loading = useState<boolean>('bkds-loading', () => false);
  const error = useState<string | null>('bkds-error', () => null);
  const wsConnected = useState<boolean>('bkds-ws-connected', () => false);
  const lastNotification = useState<{ name: string; type: string; time: string } | null>(
    'bkds-last-notif',
    () => null,
  );
  // Seçili gün — null = bugün (canlı + WS). YYYY-MM-DD = geçmiş gün (statik).
  const selectedDate = useState<string | null>('bkds-selected-date', () => null);

  const fetchSnapshot = async () => {
    loading.value = true;
    error.value = null;
    try {
      const url = selectedDate.value
        ? `${backendUrl}/api/snapshot?date=${selectedDate.value}`
        : `${backendUrl}/api/snapshot`;
      const data = await $fetch<Snapshot>(url, {
        headers: auth.authHeader(),
      });
      snapshot.value = data;
    } catch (err: any) {
      // 401 → token geçersiz, eşleştirme sayfasına gönder
      if (err?.response?.status === 401 && !auth.isLocalhost()) {
        auth.clearToken();
        if (typeof window !== 'undefined' && window.location.pathname !== '/pair') {
          window.location.href = '/pair';
          return;
        }
      }

      // Hata mesajını duruma göre insancıllaştır
      const status = err?.response?.status;
      const backendError = err?.data?.error;
      if (status === 502) {
        // Backend BRY'ye ulaşamadı
        error.value = backendError ?? 'BRY sunucusuna ulaşılamıyor. Sunucu açık mı, aynı ağda mısınız?';
      } else if (status === 503) {
        // Henüz yapılandırılmamış (middleware zaten /setup'a göndermeli)
        error.value = 'BRY yapılandırılmamış. Kurulum sayfasına yönlendiriliyorsunuz...';
      } else if (status === 504 || err?.message?.includes('timeout')) {
        error.value = 'Bağlantı zaman aşımına uğradı. BRY sunucusu yavaş veya ulaşılamaz.';
      } else if (err?.message?.includes('fetch failed') || err?.message?.includes('Failed to fetch') || !status) {
        // Network seviyesi — backend'e (Mac uygulamasına) ulaşılamadı
        if (auth.isLocalhost()) {
          error.value = 'Backend ile bağlantı kesildi. Uygulama beklenmedik şekilde kapanmış olabilir.';
        } else {
          error.value = 'Bilgisayardaki BRY Takip uygulamasına ulaşılamıyor. Bilgisayar açık mı, aynı WiFi\'de misiniz?';
        }
      } else {
        error.value = backendError ?? err?.message ?? 'Beklenmedik bir hata oluştu';
      }
    } finally {
      loading.value = false;
    }
  };

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  // Yerel bildirim — telefon kurum WiFi'sinde ve uygulama açıkken/yakındayken çalışır.
  // Push subscription, VAPID, Apple/Google sunucuları YOK. Veri kurum dışına çıkmıyor.
  // Sadece ekran görünmüyorken tetikle — sayfa açıkken in-app banner zaten gösteriyor.
  //
  // Tauri içinde: tauri-plugin-notification → macOS Notification Center'a düzgün entegre,
  // izin yönetimi Sistem Ayarları → Bildirimler → BRY Takip üzerinden yapılır.
  // Tarayıcı/PWA: standart Notification API.
  const isInTauri = (): boolean => {
    if (typeof window === 'undefined') return false;
    return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  };

  const showLocalNotification = async (name: string, action: string, time: string) => {
    if (typeof window === 'undefined') return;
    if (document.visibilityState === 'visible') return;

    const formatted = new Date(time).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul',
    });
    const body = `${formatted} · ${action}`;

    // Tauri context: native plugin
    if (isInTauri()) {
      try {
        const { isPermissionGranted, sendNotification } = await import(
          '@tauri-apps/plugin-notification'
        );
        if (!(await isPermissionGranted())) return;
        await sendNotification({ title: name, body });
      } catch {/* sessizce */}
      return;
    }

    // Browser/PWA context: standart Notification API
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const opts: NotificationOptions = {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'activity',
    };
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(name, opts))
        .catch(() => {
          try { new Notification(name, opts); } catch {/* iOS Safari tab dışı bloklayabilir */}
        });
    } else {
      try { new Notification(name, opts); } catch {/* ignore */}
    }
  };

  // WebSocket sağlık kontrolü — ölü ise yeniden bağlan
  // iOS PWA arkaplandan dönüşte WS bazen "yarı ölü" kalır, bu onu çözer
  const ensureConnected = () => {
    if (typeof window === 'undefined') return;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      connectWs();
    }
  };

  const connectWs = () => {
    if (typeof window === 'undefined') return;
    // Eski bağlantı varsa kapat ve yenisini kur
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws' + auth.wsTokenParam();
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      wsConnected.value = true;
      // Bağlanır bağlanmaz snapshot'ı yenile (uzun süre bağlantısızken state eski olabilir)
      fetchSnapshot();
      // Heartbeat başlat (sağlık kontrolü)
      if (healthCheckTimer) clearInterval(healthCheckTimer);
      healthCheckTimer = setInterval(() => {
        // Sayfa görünür ve WS kapalıysa yeniden bağlan
        if (document.visibilityState === 'visible') {
          ensureConnected();
        }
      }, 5000);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'newActivity') {
          const { activity, individual } = msg.payload;
          const name = individual?.full_name ?? 'Bilinmeyen';
          const action = activity.activity_type === 'entry' ? 'giriş' : 'çıkış';
          lastNotification.value = {
            name,
            type: action,
            time: activity.activity_time,
          };
          showLocalNotification(name, action, activity.activity_time);
          fetchSnapshot();
          setTimeout(() => {
            lastNotification.value = null;
          }, 4000);
        } else if (msg.type === 'snapshotReady') {
          fetchSnapshot();
        }
      } catch {
        /* ignore parse errors */
      }
    };

    ws.onclose = () => {
      wsConnected.value = false;
      if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
      }
      // Sayfa görünürse 2 sn sonra reconnect dene
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        reconnectTimer = setTimeout(connectWs, 2000);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  const disconnectWs = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    healthCheckTimer = null;
    ws?.close();
    ws = null;
  };

  /**
   * Foto proxy URL'ine token query param'ı ekle (img src gibi header taşıyamayan
   * context'ler için). Localhost'ta token gereksiz.
   */
  const photoUrl = (roiUrl: string): string => {
    const m = roiUrl.match(/\/media\/(.+)$/);
    if (!m) return roiUrl;
    const base = `${backendUrl}/api/photos/${m[1]}`;
    if (auth.isLocalhost()) return base;
    if (!auth.token.value) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}token=${encodeURIComponent(auth.token.value)}`;
  };

  /**
   * Korumalı endpoint'e fetch için ortak header bundle.
   */
  const authHeaders = (): Record<string, string> => auth.authHeader();

  /**
   * Seçili günü değiştir. null = bugün (canlı + WS), YYYY-MM-DD = geçmiş gün (statik).
   * Geçmişe geçince WS kapanır, bugüne dönünce yeniden bağlanır.
   */
  const setDate = async (date: string | null) => {
    selectedDate.value = date;
    if (date === null) {
      // Bugüne dönüş — WS yeniden bağlan (initial fetchSnapshot WS onopen'da)
      connectWs();
    } else {
      // Geçmiş gün — WS kapat, doğrudan fetch
      disconnectWs();
      await fetchSnapshot();
    }
  };

  return {
    snapshot,
    loading,
    error,
    wsConnected,
    lastNotification,
    selectedDate,
    setDate,
    fetchSnapshot,
    connectWs,
    disconnectWs,
    backendUrl,
    photoUrl,
    authHeaders,
  };
};
