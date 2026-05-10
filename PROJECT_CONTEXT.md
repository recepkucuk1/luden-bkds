# Luden BKDS — Proje Bağlamı

> **Bu dosya:** Yeni bir Claude/AI oturumunda projenin tüm bağlamını hızlıca yüklemek için. Her yeni iş başlangıcında bunu oku.

---

## 1. Genel Bakış

**Ürün:** Luden BKDS — Türkiye'deki özel eğitim ve rehabilitasyon merkezleri için, INNOVA firmasının zorunlu kıldığı **BKDS (Biyometrik Kimlik Doğrulama Sistemi)** verilerini telefondan ve bilgisayardan canlı takip etmeyi sağlayan SaaS uygulaması.

**Hedef pazar:** Türkiye'de ~**3500 özel eğitim/rehabilitasyon merkezi**.

**İş modeli:** Lisanslı yerel kurulum + freemium SaaS abonelik.
- Lite: ücretsiz (temel görüntüleme)
- Standart: 299₺/ay (~2990₺/yıl)
- Pro: 599₺/ay (çoklu kullanıcı + raporlar)

**Kurucu:** Recep Küçük — LudenLab kurucusu, **Luden Keşif** isimli özel eğitim merkezinin sahibi (İzmir). Hem kullanıcı hem geliştirici. Sektörü içeriden bilen biri.

---

## 2. Sektör Bağlamı — INNOVA BRY ve BKDS

### Ne oldu?

Mayıs 2026'da MEB (Milli Eğitim Bakanlığı), Türkiye'deki tüm özel eğitim ve rehabilitasyon merkezlerine **INNOVA** firmasının BKDS sistemini **zorunlu** kıldı. Sistem her merkeze:
- 2 adet biyometrik kamera (giriş + çıkış)
- 1 adet yerel sunucu (Oracle DB + Django REST API)
- "BRY" (Biyometrik Rehabilitasyon Yazılımı) web arayüzü

Bu sistem öğrencilerin/personelin yüz tanıma ile giriş-çıkışını kayıt eder. MEB'in ödenek hesabı bu kayıtlara dayanır.

### Sorun ne?

1. **Kameralar başarısız okuma yapıyor.** Yüzler düzgün taranmıyor, manuel müdahale gerekiyor (BRY arayüzünde "manuel eşleşme" özelliği var, INNOVA bunu yapıyor ama gecikme oluyor).

2. **Kurum sahibi sürekli PC başında durmak zorunda.** BRY web arayüzünde anlık veri görmek için. Bu hem yorucu hem ölçeksiz — kurumda 50+ kişi takip edilmesi gerek.

3. **Telefondan erişim yok.** INNOVA mobil app vermiyor. Web arayüzü mobil uyumlu değil.

### Bizim çözümümüz

INNOVA'nın BRY API'sini **reverse engineer ederek** (BRY web arayüzünün kendi backend'iyle nasıl konuştuğunu çözerek), aynı verileri **çok daha iyi UX ile** telefona ve modern bir desktop uygulamaya getiriyoruz.

**Temel akış:**
1. Kurum sahibi `.dmg` veya `.msi` indirir, bilgisayara kurar
2. Setup wizard'da BRY sunucu adresi + kullanıcı adı + şifre girer
3. Uygulama 5 saniyede bir BRY API'sine polling yapar
4. Kurum sahibi telefonunu açar, `http://kurum-mac.local:8787` (veya yerel IP) adresinden tüm kuruma anında bakar
5. Yeni giriş-çıkış olduğunda telefonda yerel bildirim alır (telefon kurum WiFi'sinde + uygulama açık/yakındayken)

---

## 3. Teknik Mimari

### Stack

```
┌────────────────────────────────────────────────────┐
│ Tauri 2 .app/.msi (kullanıcının bilgisayarı)       │
│  ┌──────────────────┐  ┌──────────────────────┐   │
│  │ Rust kabuk       │  │ Webview (Nuxt 3)     │   │
│  │ - Node sidecar   │  │ - PWA, mobile-first  │   │
│  │ - Lifecycle      │  │ - Tailwind           │   │
│  └─────────┬────────┘  └──────────┬───────────┘   │
│            │                      │                │
│            v                      v                │
│  ┌────────────────────────────────────────────┐   │
│  │ Backend (Fastify + TypeScript)             │   │
│  │ - Port 8787, 0.0.0.0 (yerel ağa açık)      │   │
│  │ - REST + WebSocket                         │   │
│  │ - InnovaBryAdapter (BRY API client)        │   │
│  │ - 5sn polling, EventEmitter                │   │
│  │ - Foto proxy (KVKK için)                   │   │
│  │ - Bildirim: WS + browser Notification API  │   │
│  │   (Web Push YOK — saf yerel ağ)            │   │
│  └─────────────────┬──────────────────────────┘   │
└──────────────────────┼──────────────────────────────┘
                       │ HTTP (yerel ağ)
                       v
              ┌─────────────────┐
              │ INNOVA BRY      │ (kurumdaki yerel sunucu)
              │ Django + Oracle │ http://192.168.X.X:3000
              └─────────────────┘
```

### Teknolojiler

- **Backend:** Fastify, TypeScript, ESM, Node 20+
- **Frontend:** Nuxt 3 (SSR kapalı, SPA modu), Tailwind, @vite-pwa/nuxt
- **Desktop:** Tauri 2.x, Rust 1.95+
- **Build:** esbuild (backend bundle), nuxt generate (frontend static), GitHub Actions CI/CD

### Repo Yapısı

```
luden-bkds/
├── backend/              # Fastify backend
│   ├── src/
│   │   ├── server.ts                  # Entry point, Fastify setup
│   │   ├── adapters/innova.ts         # BRY API client
│   │   ├── services/
│   │   │   ├── cache.ts               # UUID→isim cache
│   │   │   ├── presence.ts            # Snapshot hesabı
│   │   │   ├── polling.ts             # 5sn polling
│   │   │   └── config.ts              # BRY config persistence
│   │   ├── routes/index.ts            # REST + WebSocket endpoints
│   │   └── types/innova.ts            # BRY tipleri
│   └── package.json
├── frontend/             # Nuxt 3 PWA
│   ├── pages/
│   │   ├── index.vue                  # Anasayfa
│   │   ├── individual/[uuid].vue      # Birey detay
│   │   ├── setup.vue                  # İlk kurulum sihirbazı
│   │   └── settings.vue
│   ├── components/
│   │   ├── IndividualAccordion.vue
│   │   ├── StatsCards.vue
│   │   └── ...
│   ├── composables/
│   │   ├── useBkds.ts                 # Backend URL hesaplama, fetch
│   │   ├── useLessons.ts              # MEB ders saati hesabı
│   │   └── ...
│   ├── middleware/
│   │   └── setup-required.global.ts
│   └── nuxt.config.ts                 # ssr: false (Tauri için)
├── desktop/              # Tauri uygulaması
│   ├── package.json
│   ├── scripts/
│   │   ├── build-backend.js           # Backend → .mjs bundle
│   │   ├── copy-frontend.js           # nuxt generate → dist-frontend
│   │   └── copy-node.js               # Node binary → .app içine göm
│   └── src-tauri/
│       ├── Cargo.toml
│       ├── src/lib.rs                 # Tauri Rust kabuk
│       ├── tauri.conf.json
│       └── capabilities/default.json
├── .github/workflows/build.yml         # CI/CD (Mac + Windows build)
└── README.md
```

---

## 4. INNOVA BRY API Bilgileri (Reverse Engineering Sonucu)

### Sunucu

- **Adres:** Her kurumda farklı, genelde `http://192.168.X.X:3000` formatında (yerel ağda)
- **Backend:** Django REST Framework + Oracle DB + nginx 1.30.0
- **Frontend:** Nuxt 3 + Vuetify (kullanıcının web arayüzü)

### Auth

- JWT (access 28.5dk, refresh 7gün), cookie tabanlı
- Login: `POST /api/users/login/` body: `{username, password, try_count: 0}` → `{access, refresh}`
- Bizim adapter access token'ı 25 dk sonra yeniliyor (güvenlik payı)

### Endpoint'ler

| Endpoint | Açıklama |
|----------|----------|
| `POST /api/users/login/` | Login, JWT token döner |
| `GET /api/users/get-data/` | Kullanıcı bilgisi |
| `GET /api/activities/individual-activity/each-individual/?page_size=100&ordering=-first_entry&start_time=...&end_time=...` | Bugünkü özet (UUID + first_entry + last_exit + has_manuel_match) |
| `GET /api/activities/individual-activity/?individual={uuid}&page=1&page_size=20&start_time=...&end_time=...` | Bireyin tüm aktiviteleri |
| `GET /api/activities/bkmsy-individuals/{uuid}/` | Birey detayı (full_name maskeli, individual_type, gender, birth_date, disability_code) |

### Kritik Bulgular

1. **Tarih UTC** olarak istenir. TR 00:00 = UTC önceki gün 21:00.
2. `each-individual` sadece UUID döner. İsim için ayrıca `bkmsy-individuals/{uuid}/` çağrılır → **yavaş** (1.5-1.8sn). Cache şart.
3. `roi_url` = `http://kurum-ip:8000/media/{uuid}_roi/YYYY/M/D/{filename}.jpg` — **yüz fotoları açık dizin port 8000'de**. Direkt internet'e açılırsa **KVKK riski** → bizim backend proxy ile sunar (auth gerektirir).
4. `disability_code` = MEB engel kodu = **özel sağlık verisi**. UI'da default gizli, sadece "Detayları göster" tıklanırsa açılır.
5. `full_name` ve `identity_number` BRY API'sinde **maskeli** dönüyor ("BÜL****ARI", "12******45"). İyi bir tasarım.

---

## 5. Ders Saati Hesabı (MEB Kuralları)

Bu **kritik iş mantığı** — kurumun MEB'ten alacağı ödenek bu hesaba bağlı.

```
Kurumda geçirilen süre  →  Ders sayısı
0-39 dakika             →  0 ders
40-89 dakika            →  1 ders
90-139 dakika           →  2 ders
140+ dakika             →  3 ders (max)
```

**Sadece öğrenci** için (individual_type=1). Personel (individual_type=2) için ders rozeti gösterilmez.

Hesaplamada **kuralımız:** "İlk hareket = giriş zamanı, son hareket = çıkış zamanı, aradaki fark = toplam süre". Kameranın "giriş/çıkış" tipini umursamıyoruz, çünkü kameralar bazen kafayı karıştırıyor (5 kere "giriş" okuyabilir). İlk-son okuma arasındaki süre ne ise odur.

---

## 6. Geliştirme Süreci ve Mevcut Durum (Faz 12)

### Tamamlanmış fazlar

✅ **Faz 0-7:** Çekirdek özellikler — BRY entegrasyonu, polling, akordeon UI, ders rozeti, setup wizard
✅ **Faz 8-10:** Tauri'ye paketleme — Mac `.dmg` ve `.app` üretimi
✅ **Faz 11:** Process lifecycle — Cmd+Q, X, Force Quit'te child process temizliği
✅ **Faz 11c:** Orphan detect — backend kendi parent'ını izler, ölünce kapanır
✅ **Faz 12:** User data dir — config `~/Library/Application Support/com.ludenlab.bkds/`'a yazılır
✅ **Faz 12b:** Web Push kaldırıldı — saf yerel ağ bildirimi (browser Notification API). KVKK ve "veri kurum dışına çıkmaz" iddiası granitleşti.
✅ **Faz 12c:** LAN sertleştirmesi — pair-code ile cihaz auth (telefon Mac'teki 6 haneli kodu girer, persistent token alır), şifre macOS Keychain'e taşındı (auto-migrate), polling/cache temizliği:
  - Akıllı cache invalidation: sadece summary'si değişen UUID'ler için BRY'ye gidilir
  - `seenActivities` her TR gün dönümünde sıfırlanır
  - WS listener limiti 50'ye çıkarıldı
  - Ölü kod (`isPresent`, `presentCount`) kaldırıldı
✅ **Faz 12d:** Auto-updater (Tauri 2 updater plugin) — imzalı build artifact'leri (signing keypair `~/.tauri/luden-bkds.key`), `latest.json` manifest, anasayfada "yeni sürüm" banner'ı, settings'te manuel kontrol. Detay: [RELEASE.md](RELEASE.md). Henüz canlı değil — endpoint URL + GitHub secrets yapılması gerekiyor.
✅ **Faz 12e:** Always-on background app pattern:
  - Auto-start (Login Items / Registry Run) — Mac boot sonrası uygulama arka planda kendiliğinden başlar
  - Tray icon + menü (Aç / Çıkış) — pencere kapanınca tray'den geri açılır
  - Pencere kapatma butonu (X / Cmd+W) artık uygulamayı kapatmıyor, sadece pencereyi gizliyor — backend çalışmaya devam eder, telefonlar bağlı kalır
  - `--auto-start` arg'ı ile boot olunca pencere hiç gösterilmez (sessiz başlangıç)
  - Setup wizard'ın ilk başarılı kaydında auto-start otomatik açılır (müdahalesizlik)
  - Settings'te toggle ile kullanıcı kontrolü

### Şu an çalışan akış

1. Mac'te `.dmg` çift tıkla → Applications'a sürükle → aç
2. Setup wizard'da BRY bilgileri gir → "Bağlantıyı test et" → "Kaydet ve başla"
3. Anasayfada canlı veriler görünür
4. Telefon Safari → `http://<Mac-IP>:8787` (Mac'in yerel IP'si) → Ana ekrana ekle → PWA olarak kullan
5. Cmd+Q veya Force Quit → port serbest kalır, yeniden açıldığında sorunsuz çalışır

### Şu an üzerinde çalışılan: Windows Build

**GitHub Actions** ile cross-platform CI/CD kuruluyor:
- Mac runner → `.dmg`
- Windows runner → `.msi`
- `git tag v0.X.Y` → otomatik release

Workflow dosyası: `.github/workflows/build.yml`

### Bilinen kısıtlar

1. **Code signing yok** — Mac kullanıcısı `.app`'i başka bir Mac'e kopyaladığında "damaged" hatası verir. Apple Developer ($99/yıl) ile çözülecek.
2. **Windows code signing yok** — SmartScreen uyarısı çıkar. OV cert (~$100/yıl) ile çözülecek.
3. **Auto-updater kurulu ama endpoint canlı değil** — Tauri 2 updater plugin entegre, imzalama altyapısı hazır. Eksikler: (a) `tauri.conf.json` endpoint URL'i (luden.app veya GitHub) belirlenmedi, (b) `TAURI_SIGNING_PRIVATE_KEY` GitHub secret'i eklenmedi. Detay: [RELEASE.md](RELEASE.md).
4. **Lisans sistemi yok** — kim isterse kullanır. `license.luden.app` ile abonelik kontrolü Faz 1'de eklenecek.
5. ~~Sistem tray + auto-start yok~~ → **Faz 12e'de tamamlandı** (always-on background app pattern).
6. **Bildirim kapsamı (kasıtlı)** — sadece kurum WiFi'sinde + uygulama açık/yakındayken çalışır. Telefon kurum dışına çıkınca veya ekran uzun süre kilitliyken bildirim gelmez. KVKK ve sektör konumlanması nedeniyle bilinçli karar.
7. **Şifre saklama (Mac'te keychain, diğer platformlarda plaintext)** — Linux libsecret + Windows DPAPI Faz 2'de eklenecek. Şu an Mac üretimde, gerisi park.
8. **Pagination 100 birey limiti** — INNOVA sayfa sayfa veri verir, biz şu an ilk sayfayı (100 birey) çekiyoruz. >100 aktif birey/gün olan kurumda eksik liste. Pilot ölçek için sorun değil; 200+ kurumlu kurumlar için Faz 2'de pagination chase eklenecek.

---

## 7. Pazarlama ve Satış

### Rekabet

- **EÇOP** — pazar lideri, 17 yıllık. Kurum yönetim yazılımı (muhasebe, öğrenci kayıt, raporlama). BKDS özelinde değil.
- **RemSis.net** — freemium, kurum yönetim yazılımı.
- **Fast Yazılım** — yerel rakip.

Hiçbiri **BKDS-spesifik mobil/canlı takip** sunmuyor. Bizim niş bu.

### Risk: INNOVA tepkisi

INNOVA bizim API'lerini kullandığımızı görürse:
- API'lerini değiştirebilir (kötü senaryo)
- Yasal süreç açabilir (düşük olasılık, B2B müşterileriyle çatışmak istemez)

**Önlem:**
- Pazarlama dilinde "tamamlayıcı, ek araç" vurgusu — INNOVA'nın yerini almıyoruz, üstüne ekliyoruz
- Adapter mimarisi: API değişimine 1-2 günde uyum
- İleride başka BKDS markalarına da adapter (sektör genişleme)

### Avantaj: Recep'in iletişim kanalları

Recep zaten:
- Özel eğitim sektöründe ağ sahibi
- Birden çok kurum sahibiyle WhatsApp iletişimi
- LudenLab markası altında geçmiş ürünler
- Kendi kurumu (Luden Keşif) zaten beta test ortamı

Bu **hızlı pilot dağıtımı** mümkün kılıyor.

---

## 8. Kullanıcı Profili

**Tipik kurum sahibi:**
- 35-55 yaş
- Teknik bilgisi sınırlı (terminal komutu çalıştırmaz)
- Mac veya Windows kullanıyor (çoğunluk Windows)
- Kurumda her gün 8-12 saat
- Telefonu sürekli yanında
- WhatsApp aktif kullanıcısı
- KVKK konusunda **paranoid haklı** olabilir — öğrenci verisi var ortada

**Anahtar tasarım kuralları:**
- "Kullanıcıdan karar isteme" felsefesi — uygulama otomatik düşünmeli
- Manuel düzeltme/override **yok** (Recep'in açık tercihi)
- Setup tek seferlik, sonra hiç müdahale gerektirmesin
- Hata mesajları Türkçe ve insan diliyle ("Sunucuya ulaşılamadı. Aynı ağda mısınız?")
- Mobile-first — telefon ana cihaz, masaüstü ikincil

---

## 9. Yol Haritası

### Faz 1 — İlk Para (3-5 gün)
- Apple Developer + Mac code signing (keychain'e `-T <signed-binary>` ile sıkıştır)
- Sistem tray + auto-start (Mac)
- Lisans sistemi (license.luden.app, machineId = install-time random UUID)
- Manuel ödeme + WhatsApp ile lisans dağıtımı
- **Sonuç:** İlk 5-10 pilot, 1500-3000₺/ay

### Faz 2 — Ölçek (5-7 gün)
- Windows build + code signing (Faz 12'de park edilmişti, dönülecek)
- ~~Auto-updater~~ → **Faz 12d'de tamamlandı**, yayına alma için endpoint + secrets gerek
- Bonjour/mDNS (luden-bkds.local)
- Splash screen, hata raporlama
- **Sonuç:** 30-50 kurum, 9000-15000₺/ay

### Faz 3 — Otomasyon (5-7 gün)
- iyzico entegrasyonu (otomatik ödeme)
- luden.app pazarlama sayfası
- panel.luden.app (kullanıcı paneli)
- Email otomasyonu
- **Sonuç:** 100-200 kurum, 30000-60000₺/ay

### Faz 4 — Pazar Lideri (1-3 ay)
- Aylık ders raporu (Excel export, MEB için)
- Çoklu kullanıcı (yönetici/öğretmen/muhasebe)
- Veli paneli (büyük satış argümanı, sadece kurum içi erişim)
- Sektörel genişleme (diğer BKDS markaları)
- **Sonuç:** 500+ kurum, pazar lideri

> **Not:** "iOS native push" yol haritasından kaldırıldı. Bildirim mimarisi tamamen yerel ağ — uzaktan bildirim hedeflenmiyor (KVKK ve sektör konumlanması nedeniyle).

---

## 10. Önemli Tasarım Kararları (geri dönülmez gibi)

1. **Stack: Nuxt 3 + Fastify + Tauri** — Recep normalde Next.js kullanıyor ama BRY de Nuxt olduğu için Nuxt seçildi. Tauri Electron yerine seçildi (50MB vs 200MB, Rust güvenliği, native hissi).

2. **Yerel mimari, cloud değil** — KVKK ve INNOVA tepkisi açısından kritik. Detay için `LEGAL_AND_KVKK.md`'ye bak.

3. **Setup wizard'la multi-tenant** — Tek `.exe` her kuruma gider, kullanıcı UI'dan kendi BRY bilgisini girer. Her kuruma özel build yok.

4. **Backend Node embed (Faz 9)** — Node binary `.app` içine gömüldü (~80MB). Kullanıcının Node kurmasını gerektirmiyor.

5. **GitHub Actions CI/CD** — Mac'te Windows cross-compile yok. GitHub'ın Windows runner'ı kullanılıyor.

6. **"Müdahalesizlik" felsefesi** — Recep'in açık tercihi: kullanıcı uygulamaya hiçbir şey girmemeli, sistem otomatik karar vermeli. Manual override butonları **yok**.

7. **Aşama aşama ürün** — her fazda satılabilir bir ürün var. "Mükemmel olmadan satma" düşüncesi reddedildi.

---

## 11. İletişim ve Mevcut Üretim Ortamı

- **Geliştirme makinesi:** MacBook Air (Apple Silicon, aarch64)
- **Recep'in BRY:** `192.168.X.X:3000` (kurum içi sunucu)
- **Mac IP'si (yerel ağ):** her kurum için farklı (DHCP)
- **Test cihazları:** MacBook Air (geliştirme), Mac mini (ikinci test), iPhone (PWA test)
- **Repo:** Henüz GitHub'a push edilecek (private)

---

## 12. Sonraki Adımlar

1. **GitHub'a ilk push** ve workflow tetikleme — Windows `.msi` üretimini doğrula
2. **Bir Windows PC'de test** — dost biri, internet kafe, vb.
3. **Apple Developer kayıt** ($99/yıl) — Mac code signing için
4. Faz 1 başla: lisans sistemi + sistem tray + auto-start

---

**Bu dosya `PROJECT_CONTEXT.md` adıyla repo root'una konmalı. Yeni Claude oturumunda ilk olarak okutulmalı.**
