# Seans Takvimi — Tasarım Belgesi

> **Durum:** Onaylandı (tasarım), uygulama planı bekliyor
> **Tarih:** 2026-06-18
> **Bağlam:** BRY Takip — özel eğitim/rehabilitasyon merkezleri için BKDS canlı takip uygulaması. Bu özellik, gelen öğrencilerin geldiği seansları takvim benzeri bir arayüzle görselleştirir. Genel proje bağlamı için `PROJECT_CONTEXT.md`, mahremiyet duruşu için `LEGAL_AND_KVKK.md`.

---

## 1. Amaç

Kurum sahibinin, öğrencilerin devam/seans durumunu zaman ekseninde **görsel** olarak görebileceği, salt-okunur bir takvim arayüzü. Üç katmanlı tek bir akış:

**A (ay) → güne dokun → C (o günün zaman çizelgesi) → seansa/kişiye dokun → B (o bireyin devam takvimi)**

Mevcut anasayfa (Anlık Durum) "şu an kim içeride" sorusuna cevap verir; bu özellik "zaman içinde devam nasıldı" sorusuna cevap verir.

## 2. Hedefler ve Hedef-Olmayanlar

**Hedefler (v1):**
- A: Ay ızgarası — her günün gelen **öğrenci sayısı** ile renklenen ısı haritası.
- C: Günlük zaman çizelgesi — her bireyin giriş→çıkış bloğu; çakışan seanslar yan yana.
- B: Kişi devam takvimi — bir bireyin ay içinde geldiği/gelmediği günler + ders sayısı.
- Ay gezinme (önceki/sonraki ay; geleceğe kapalı).
- Türkçe yükleniyor / boş / hata durumları.

**Hedef-olmayanlar (bilinçli olarak v1 dışı, bkz. §8):**
- Manuel ekleme / düzeltme / override (müdahalesizlik felsefesi — salt-okunur).
- Yokluk uyarıları ("düzenli gelip bırakanlar").
- Ödenek (ders) ısı haritasına geçiş toggle'ı.
- Ayrı personel görünümü.
- Diske kalıcı veri yazımı / geçmiş arşivleme.

## 3. Temel Kararlar (çözüldü)

1. **Birleşik akış:** A → C → B tek bir gezinti zinciri. Üç görünüm de v1 kapsamında.
2. **A'nın metriği:** Hücre rengi + sayı = o gün gelen **öğrenci (birey, `individual_type === 1`) sayısı**. Personel sayıma girmez. Ödenek/ders detayı bir tık ötede (C'nin gün özeti ve B) görünür.
3. **Salt-okunur:** Takvim yalnızca kameraların kaydını gösterir; hiçbir yazma/düzeltme yok.
4. **KVKK minimumu:** Takvim uçları PII'yi en aza indirir — maskeli isim + uuid + sayım/süre. **TC kimlik no ve engel kodu takvim uçlarında hiç gönderilmez** (rapor CSV'sinden farklı olarak takvim bunlara ihtiyaç duymaz). Fotoğraf yok.
5. **B'nin yeri:** Kişi devam takvimi, yeni bir rota değil; **mevcut `pages/individual/[uuid].vue`** sayfasına bir "Devam takvimi" bölümü olarak eklenir. Böylece hem C'den hem bireyler listesinden erişilir.
6. **Veri kaynağı:** Yerel kalıcılık yok — BRY'den canlı çekilir, bellekte cache'lenir.

## 4. Görünümler

### 4.1 A — Ay ızgarası (`/takvim`)

- 7 sütunlu ay ızgarası (Pzt→Paz), ayın ilk gününe göre baştan boş hücreler.
- Hücre içeriği: gün numarası (küçük) + o gün gelen öğrenci sayısı (vurgulu).
- Hücre arka plan rengi = öğrenci sayısına göre ısı (teal rampası, 4 kademe + boş). Eşikler frontend'de sabit; tek bir merkezi yardımcı fonksiyonla.
- Üst bar: `‹ Haziran 2026 ›` ay gezinme. Sonraki ay bugünün ayını geçemez (gelecek butonu pasif).
- Bugün hücresi halkalı/işaretli. Veri olmayan/gelecek/hafta sonu günler soluk.
- Etkileşim: bir güne dokun → `C` (`/takvim/<YYYY-MM-DD>`).
- Durumlar: yükleniyor (iskelet ızgara), boş ay ("Bu ay için kayıt yok"), hata ("INNOVA'ya ulaşılamadı. Aynı ağda mısınız?"), yapılandırılmamış → setup'a yönlendir (mevcut middleware ile uyumlu).

### 4.2 C — Günlük zaman çizelgesi (`/takvim/[date]`)

- Kaynak: **mevcut** `GET /api/snapshot?date=YYYY-MM-DD` (değişiklik gerekmez). `presence[]` her birey için `firstEntry`/`lastExit`/`individual`/`hasManualMatch` taşır.
- Düzen: solda dikey saat ekseni; saatlik ızgara çizgileri. Eksen aralığı **o günün verisinden türetilir** — en erken giriş saatinden en geç hareket saatine kadar, en az bir tampon saatle; veri yoksa/çok darsa varsayılan 08:00–18:00. Her birey, giriş→çıkış süresine oranlı bir blok; başlangıç/bitiş zamanına göre konumlanır.
- Çakışma: aynı anda içeride olan bireyler yan şeritlere (lane) yerleştirilir (basit greedy lane atama).
- Hâlâ içeride (lastExit `null`): blok bugünse "şu an"a uzanır (canlı); geçmiş günse `lastActivity` zamanına kadar çizilir ve "çıkış yok" işaretiyle gösterilir (sahte aralık üretilmez — `presence.ts`'deki mevcut mantıkla tutarlı).
- Blok içeriği: maskeli isim + saat aralığı + ders rozeti (yalnız `individual_type === 1`).
- Üst özet: *N öğrenci · M ders* (o gün). Saat ekseni boşsa "Bu gün hareket kaydı yok".
- Etkileşim: bloğa dokun → bireyin sayfası `pages/individual/[uuid].vue` (orada B bölümü görünür).
- Bugünse: WebSocket `snapshotReady`/`newActivity` ile canlı tazeleme (mevcut altyapı; anasayfayla aynı). Geçmiş günse statik.

### 4.3 B — Kişi devam takvimi (`pages/individual/[uuid].vue` içinde bölüm)

- Kaynak: yeni `GET /api/calendar/individual/:uuid?month=YYYY-MM`.
- A ile aynı ay-ızgarası tabanı (ortak `MonthGrid.vue`); hücre içeriği farklı:
  - Geldiği gün: dolu hücre + ders rozeti (örn. "2 ders").
  - Gelmediği (geçmiş, hafta içi) gün: kesik çizgili soluk hücre.
  - Hafta sonu / gelecek: nötr soluk.
- Üst özet: *bu ay X/Y gün · toplam Z ders*. Ay gezinme A ile aynı.
- `individual_type === 2` (personel) ise ders rozetleri gösterilmez (yalnız devam günleri).

## 5. Navigasyon

- `AppHeader.vue`: mevcut ikon dizisine (istatistik, bireyler, ayarlar) bir **takvim ikonu** (`NuxtLink to="/takvim"`, `aria-label="Takvim"`) eklenir. Mevcut inline-SVG ikon stiliyle aynı.
- Rotalar:
  - `/takvim` → A
  - `/takvim/<YYYY-MM-DD>` → C
  - `/individual/<uuid>` → B'yi içeren mevcut birey sayfası
- Geri navigasyonu tarayıcı/Tauri geri ile doğal çalışır (gerçek rotalar, in-page state değil).

## 6. Veri Katmanı

### 6.1 Mevcut, yeniden kullanılan

- `GET /api/snapshot?date=` → C. Değişiklik yok.
- `presence.ts` yardımcıları: `turkishToday`, `shiftDateStr`, `isTodayInTurkey`, `trHour`.
- `lessons.ts`: `calculateLessons` / `lessonsFromMinutes`, `formatDuration`.
- `cache.getIndividuals(uuids)` → maskeli isim + tip (cache'li).

### 6.2 Yeni: ay-özeti cache + iki yalın uç

Pahalı ortak primitif, ayın her günü için `adapter.getTodayActivitySummary({ date })` çağrısıdır (ayda en fazla 31 çağrı; `getMonthlyReport`/`fetchWeekStats` zaten bu deseni kullanıyor). Bunu **ay-bazlı cache**'leyen bir katman ekliyoruz:

- `presence.ts` (veya yeni `CalendarService`) içinde private `getMonthSummaries(month)`:
  - `Map<month, { fetchedAt, perDay: Map<date, summaryResults> }>`.
  - **Geçmiş ay** (`month < geçerli ay`): veri değişmez → süresiz cache (process ömrü).
  - **Geçerli ay**: kısa TTL (~60 sn) — bugün canlı değişir (mevcut weekly-comparison 60 sn Cache-Control ile aynı mantık).
  - Bugünden büyük tarihler hiç çekilmez.

Üstüne iki uç (`routes/index.ts`, `requireConfig` + standart auth arkasında):

**`GET /api/calendar/month?month=YYYY-MM`** → A:
```json
{
  "month": "2026-06",
  "today": "2026-06-18",
  "days": [
    { "date": "2026-06-01", "students": 23, "lessons": 51, "isToday": false }
  ]
}
```
- `students` = o gün gelen, `individual_type === 1` olan benzersiz uuid sayısı.
- `lessons` = o gün öğrencilerin ders toplamı (mevcut ders hesabıyla).
- Yalnızca `date <= today` günler döner. **İsim/PII içermez.**
- `Cache-Control`: geçmiş ay `private, max-age=86400`; geçerli ay `private, max-age=60`.

**`GET /api/calendar/individual/:uuid?month=YYYY-MM`** → B:
```json
{
  "uuid": "…",
  "month": "2026-06",
  "fullName": "BÜL****ARI",
  "individualType": 1,
  "days": [
    { "date": "2026-06-03", "lessons": 2, "firstEntry": "…", "lastExit": "…", "durationMinutes": 95 }
  ]
}
```
- Yalnız **geldiği** günler döner; gelmediği günleri frontend ızgarada boş bırakır.
- Tek bir bireyin maskeli adı + süre/ders. **TC, engel kodu yok.**
- `Cache-Control`: ay'a göre yukarıdakiyle aynı.

> Not: `getCalendarMonth` ve `getIndividualMonth` aynı `getMonthSummaries(month)` çıktısından beslenir; ikinci görünüm aynı ay için cache'i yeniden kullanır.

## 7. Felsefe & KVKK Uyumu

- **Müdahalesizlik:** Salt-okunur. Hiçbir override/düzeltme butonu yok.
- **Veri kurum dışına çıkmaz:** Diske yazılmaz; BRY'den yerel ağ üzerinden çekilir, bellekte cache'lenir.
- **Minimum PII:** Ay ucu hiç isim taşımaz; birey ucu yalnız bakılan kişinin maskeli adını taşır. TC ve engel kodu takvimde yok; fotoğraf yok.
- **Mobile-first:** Üç görünüm de telefon genişliğinde (~360px) çalışır — ızgara hücresinde tek sayı; C'de dikey eksen mobil için uygundur.
- **Auth:** Yeni uçlar mevcut auth modeline tabidir (localhost geçer, LAN'dan Bearer token şart).

## 8. Kapsam

**v1:** A + C + B, ay gezinme, durum ekranları, AppHeader ikonu, iki yeni uç + ay cache.

**Sonraya (YAGNI):**
- Yokluk uyarısı — verisi `getAllIndividuals`/`/api/individuals-catalog`'da hazır.
- A'da ödenek (ders) ısı haritasına geçiş toggle'ı.
- Ayrı personel görünümü / filtre.
- Takvimden CSV dışa aktarım (aylık/günlük rapor uçları zaten var).

## 9. Bilinen Maliyet ve Kısıtlar

- Yeni bir ay açmak ~31 özet çağrısı (paralel) + uuid meta çözümü (cache'li). İlk açılıştan sonra ay cache'lenir; aynı ayda B'ye geçiş ek BRY çağrısı yapmaz.
- **Pagination limiti (mevcut kısıt #8):** BRY sayfa başına ~100–200 birey verir; çok yoğun günlerde sayım eksik olabilir. Pilot ölçeği için kabul; ileride pagination chase ile çözülür.
- Tüm gün gruplaması TR saat dilimine göre (mevcut `Europe/Istanbul` yardımcıları).
- Ders hesabı `getMonthlyReport` ile aynı `calculateLessons(firstEntry, lastExit)` yaklaşımını kullanır (ara çıkışları aralık içine alır); rapor CSV'siyle tutarlı kalsın diye bilinçli.

## 10. Dosya Değişiklik Haritası

**Backend:**
- `backend/src/services/presence.ts` — `getMonthSummaries(month)` (private, ay cache), `getCalendarMonth(month)`, `getIndividualMonth(uuid, month)`.
- `backend/src/routes/index.ts` — `GET /api/calendar/month`, `GET /api/calendar/individual/:uuid` (+ `Cache-Control`).
- (Tipler gerekiyorsa `backend/src/types/innova.ts` veya route-yerel arayüzler.)

**Frontend:**
- `frontend/pages/takvim.vue` (veya `pages/takvim/index.vue`) — A.
- `frontend/pages/takvim/[date].vue` — C.
- `frontend/components/MonthGrid.vue` — A ve B'nin paylaştığı ızgara tabanı (hafta başlıkları, baştan boşluk, ay gezinme; hücre içeriği slot ile).
- `frontend/components/DayTimeline.vue` — C'nin zaman ekseni + lane yerleşimi.
- `frontend/components/IndividualCalendar.vue` — B; `pages/individual/[uuid].vue` içine gömülür.
- `frontend/pages/individual/[uuid].vue` — "Devam takvimi" bölümü eklenir.
- `frontend/composables/useCalendar.ts` — `fetchMonth`, `fetchIndividualMonth`, ay-ızgarası kurulum yardımcıları (TR ay matrisi, önceki/sonraki ay, gelecek koruması), ısı eşik fonksiyonu.
- `frontend/components/AppHeader.vue` — takvim ikon-linki.
- Yeniden kullanım: `useBkds` (backendUrl, authHeaders), `useLessons` (formatDuration), `useFormatters`.

## 11. Doğrulama (uygulama planında detaylandırılacak)

- Backend: ay ucu yalnız `date <= today` döner; `students` öğrenci-only; geçmiş ay cache hit, geçerli ay TTL sonrası taze.
- C: çakışan seanslar ayrı lane'lerde; "içeride" bloğu bugünse şu an'a uzanır, geçmişte sahte aralık üretmez.
- B: gelmediği günler boş; ders toplamı CSV raporuyla aynı bireyde tutarlı.
- KVKK: ay/birey uçlarının yanıtında TC ve engel kodu yok (sözleşme testi).
- Mobil genişlikte (~360px) üç görünüm de okunur.
- Preview ile görsel doğrulama (statik build + SW cache notu: `reference_frontend_preview_verify`).
