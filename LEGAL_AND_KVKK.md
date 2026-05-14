# BRY Takip — Hukuki Boyut ve KVKK

> **Bu dosya:** Mimari kararlarımızın **neden** böyle olduğunu ve hukuki/etik gerekçelerini yazıyor. KVKK uyumluluğu, INNOVA ile ilişki, lokal vs cloud mimari tartışması.

---

## 1. KVKK Bağlamı

### Hangi veriler işleniyor?

INNOVA BRY üzerinden gelen veriler **KVKK'nın özel nitelikli kişisel verileri** kategorisinde:

1. **Biyometrik veri:** Yüz fotoğrafları (`roi_url`'den gelen jpg'ler)
2. **Sağlık verisi:** `disability_code` — MEB engel kodu (öğrencinin engel türü)
3. **Kimlik bilgisi:** `identity_number` — TC kimlik numarası (BRY'de maskeli ama açık halde de mevcut)
4. **Kişisel veri:** Ad-soyad, doğum tarihi, cinsiyet
5. **Davranışsal veri:** Giriş-çıkış zamanları, kurumda geçirilen süre

Bunlar **çocukların verisi** çünkü öğrenciler büyük çoğunluğu reşit değil. **Çocuk hakları** açısından ekstra hassasiyet gerektiriyor.

### KVKK Madde 6 — Özel nitelikli kişisel veriler

> "Kişilerin ırkı, etnik kökeni, siyasi düşüncesi, felsefi inancı, dini, mezhebi veya diğer inançları, kılık ve kıyafeti, dernek, vakıf ya da sendika üyeliği, **sağlığı**, cinsel hayatı, ceza mahkûmiyeti ve güvenlik tedbirleriyle ilgili verileri ile **biyometrik ve genetik verileri** özel nitelikli kişisel veridir."

İşleme şartları çok daha sıkı:
- **Açık rıza** zorunlu (veya kanunda öngörülen istisna)
- **VERBIS** kayıt zorunlu (10+ veri kategorisi işlenince)
- **Aydınlatma yükümlülüğü** sıkı

### Veri sorumlusu kim?

**Kurum (özel eğitim merkezi) veri sorumlusu.** INNOVA ve LudenLab **veri işleyen** olabilir.

Bu çok önemli ayrım:
- **Veri sorumlusu** (kurum): KVKK'ya karşı asıl muhatap, ihlallerden hesap verir
- **Veri işleyen** (LudenLab): Sadece kurumun talimatıyla işler, sözleşme şarttır

Bizim ürün lokal kurulduğu sürece **biz veri işleyen bile değiliz** — sadece yazılım sağlıyoruz, veri bize gelmiyor. Bu mimari kararın hukuki temeli.

---

## 2. Neden Lokal Mimari, Cloud Değil?

Bu **en temel** mimari kararımız. Sebepleri:

### Sebep 1: KVKK Madde 9 — Yurt Dışına Aktarım

> "Kişisel veriler, ilgili kişinin açık rızası olmaksızın yurt dışına aktarılamaz."

Cloud altyapı kullansak (AWS, GCP, Azure):
- Veri merkezleri çoğunlukla AB veya ABD'de
- Türkiye'de Cloud sağlayıcı sınırlı (Turkcell, Türk Telekom)
- Her cloud sağlayıcı için **KVKK Kurulu izni** veya **standart sözleşme** gerekir
- Çocuk biyometrik verisi için KVKK Kurulu **muhtemelen reddeder**

**Lokal mimaride:** Veri kurum bilgisayarından **hiç çıkmıyor**. Yurt dışı aktarım sorunu yok.

### Sebep 2: Çocuk Verisi = Maximum Hassasiyet

Veri **çocukların biyometrik + sağlık verisi**. Bunu cloud'a koymak:
- Hack riski — sızıntı olursa kurum hapsi yer
- KVKK denetiminde reddedilme riski yüksek
- Velilerle çatışma riski (medya skandalı potansiyeli)

**Velilerin "verim cloud'da mı" sorusuna cevabımız: HAYIR. Veriniz kurumdan çıkmıyor.**

### Sebep 3: INNOVA İle Çatışmama

INNOVA bizim API'lerini kullandığımızı görürse:
- "Verileri çekiyorlar, kendi sistemlerine kopyalıyorlar" derse → **iddia edilebilir hukuki sorun**
- Cloud'da olunca: "Bizim verimizi alıp ABD sunucularına gönderiyorlar" çok kötü görünür
- Lokal'de: "Sadece kendi yerel sunucularıyla konuşan bir görüntüleyici" çok daha savunulabilir

**Mesajımız:** "Biz INNOVA'nın yerini almıyoruz, kullanıcının kendi verisini daha iyi gösteriyoruz."

### Sebep 4: Düzenleyici Belirsizlik

MEB BKDS sistemi 2026'da zorunlu oldu. Etrafındaki mevzuat **netleşme aşamasında**:
- "Bu veriler nereye depolanabilir?" netleşmemiş
- "Üçüncü taraf yazılımlar erişebilir mi?" gri alan
- KVKK Kurulu MEB'le ortak yönerge çıkarabilir, sınırlar netleşebilir

**Lokal mimari = bu belirsizlikten korunma.** Veri kurumdan çıkmazsa hangi yönerge gelirse gelsin uyumlu kalırız.

### Sebep 5: Kurum Sahibinin Güveni

Kurum sahibi 249₺/ay öderken sorar: **"Verim sizin sunucunuzda mı?"**

- "Evet, bizim cloud'umuzda" → uzun açıklama, güvensizlik
- "Hayır, sizin bilgisayarınızda kalıyor, biz sadece yazılım veriyoruz" → kısa, anlaşılır, güven

**Satış argümanı olarak da lokal mimari kazandırır.**

---

## 3. Lokal Mimarinin Pratik Uygulaması

### Veri akışı

```
INNOVA BRY (kurum sunucusu)
    │
    │ HTTP (yerel ağ)
    ↓
BRY Takip (kurum bilgisayarı)
    │
    │ HTTP (yerel ağ)
    ↓
Telefon (kurum WiFi)
```

**Kurum verisi internete hiç çıkmıyor.** BKDS verisi (isimler, fotoğraflar, giriş-çıkış zamanları, engel kodu) yerel ağdan **hiçbir koşulda dışarı çıkmaz** — bildirim akışı dahil.

### Bildirim mimarisi: tamamen yerel

Diğer SaaS uygulamalarından farkımız: **Web Push (Apple APNs / Google FCM) kullanmıyoruz.** Bunun yerine:

- Backend WebSocket üzerinden yeni aktivite eventi yayar (yerel ağ trafiği)
- Telefonun PWA'sı bunu alır ve **browser Notification API** ile yerel olarak bildirim gösterir
- **Apple/Google sunucuları yok, VAPID anahtarı yok, push subscription yok**
- Telefon kurum WiFi'sinden ayrıldığında bildirim gelmez (kasıtlı tasarım)

Bu kararın sonucu: "veri kurum dışına çıkmıyor" iddiamız **hiçbir nüansa ihtiyaç duymadan doğru.**

### Dış dünyaya tek bağlantı: Lisans + Güncelleme

Uygulama internete sadece iki amaçla ulaşır, **kurum verisi geçirmez**:

**1. Lisans kontrolü** (`license.luden.app`):
- Endpoint: `POST /verify`
- Body: `{licenseKey, machineId}` — sadece lisans kodu ve makine ID'si
- `machineId` install-time random UUID (donanım fingerprint'i DEĞİL)
- Kişisel veri içermez, sadece "abonelik geçerli mi?" sorusu

**2. Sürüm kontrolü** (Tauri auto-updater):
- Endpoint: tauri.conf.json'da tanımlı (`luden.app/updates/latest.json` veya GitHub Releases)
- HTTP GET ile `latest.json` çekilir — sadece sürüm numarası + indirme URL'i + imza içerir
- Yeni sürüm varsa kullanıcı onayıyla indirilir, **kullanıcıdan veri gönderilmez** (sadece indirme yapılır)
- İndirilen binary kriptografik imzayla doğrulanır (`minisign`-uyumlu)

Bu iki bağlantı KVKK açısından temiz. **Aydınlatma metninde açıkça belirtilir.**

### Yedekleme

Cloud yedekleme **yapmıyoruz**. Kurum kendi sorumlu:
- Faz 4'te ileride: kullanıcının kendi cloud hesabına (iCloud, Google Drive) **şifreli yedek** seçeneği
- Veriler şifreli, anahtar kullanıcıda → biz erişemeyiz
- KVKK tarafında temiz: "kullanıcı kendi seçimiyle kendi cloud'una yedekledi"

---

## 4. KVKK Uyumluluk Adımları

### Şu an yaptıklarımız (teknik)

✅ **Yüz fotoları için backend proxy** — INNOVA port 8000'de fotoları açık dizinde sunuyor (`http://kurum-ip:8000/media/...`). Eğer biz direkt linkle gösterseydik, **fotoğraflar internete açık** olabilirdi. Bunun yerine bizim backend kendisi fotoyu çekip frontend'e veriyor → fotoğraf yine yerel ağ dışına çıkmıyor.

✅ **Disability code default gizli** — Engel kodu özel sağlık verisi. UI'da default gizli, "Detayları göster" tıklanırsa açılıyor. Veri minimizasyonu prensibi.

✅ **Maskeleme** — BRY zaten ad ve TC'yi maskeli veriyor ("BÜL****ARI"). Biz bunu olduğu gibi gösteriyoruz, hiçbir yerde tam halini saklamıyoruz.

✅ **Şifre saklama (macOS Keychain)** — BRY şifresi macOS Keychain'de tutulur (`security` CLI ile, native modül yok). `config.json`'da artık şifre yok; eski plaintext kurulumlar otomatik migrate edilir. Linux libsecret + Windows DPAPI Faz 2'de eklenecek.

✅ **LAN auth (pair-code)** — Backend `0.0.0.0:8787`'de açık ama auth zorunlu. Mac webview/Tauri (localhost) bypass eder; LAN'daki telefonlar Mac'te gösterilen 6 haneli kodu girip persistent token alır. Setup endpoint'leri (BRY creds yazma) localhost-only — bir telefon kurum WiFi'sinden BRY ayarlarını overwrite edemez.

### Yapılacaklar (yasal)

🔲 **VERBIS kayıt** — LudenLab veri işleyen olarak kayıt olmalı (10+ kategori için)
🔲 **Aydınlatma metni** — `luden.app/kvkk` sayfasında. İçerik:
   - Hangi veriler işleniyor: lisans bilgisi (machine ID, lisans kodu), iletişim bilgileri
   - Kuruma ait BKDS verisini biz işlemiyoruz, sadece görüntüleme aracı sağlıyoruz
   - Veri sorumlusu: kurum (özel eğitim merkezi), bizim sorumluluğumuz değil
   - Veri yurt dışına aktarılmıyor
   - Saklama süresi, kullanıcı hakları, başvuru kanalı

🔲 **Veri İşleyen Sözleşmesi (DPA)** — Kurum aboneliğinde imzalanan sözleşmeye eklenmeli:
   - LudenLab'ın "veri işleyen" olarak görevleri
   - Veri ihlali bildirimi (72 saat)
   - Alt işleyen kullanımı (yok)
   - Kullanıcı haklarına yardım

🔲 **Çocuk verisi açık rızası** — Kurum velilerden zaten BKDS için almış olmalı (MEB zorunlu kıldı). Biz ek rıza istemiyoruz çünkü ek veri işlemiyoruz, sadece kullanıcı kurumun zaten gördüğü verileri farklı arayüzde görüyor.

🔲 **Avukat danışmanlığı** — KVKK'da uzman bir avukat (3-5 saatlik konsültasyon ~3000-5000₺) ile yukarıdaki dokümanları gözden geçir.

---

## 5. INNOVA İle İlişki — Hukuki Konum

### Reverse engineering yasal mı?

**Türkiye'de:** Ticari yazılımın "interoperability" (birlikte çalışabilirlik) için reverse engineering Avrupa Birliği müktesebatına paralel düzenlenmiş. **5846 sayılı FSEK Madde 38**:

> "Bilgisayar programının diğer programlarla uyumlu çalışması için **gerekli bilgileri elde etmek amacıyla** çoğaltma ve uyarlama hakları izinsiz kullanılabilir, ancak elde edilen bilgi başka amaçlarla kullanılamaz."

Bizim durum:
- ✅ Amaç: BRY ile uyumlu çalışan görüntüleme aracı (interoperability)
- ✅ Bilgi başka amaçla kullanılmıyor
- ✅ Yasal kullanıcının (kurum sahibinin) kendi verisini görüntülüyoruz

**Hukuki konum güçlü.**

### INNOVA'nın olası tepkileri

**Tepki 1:** "API'lerimizi ticari amaçlı kullanıyorsunuz"
- **Cevap:** Kurum sahibi BRY'ye **lisanslı erişim hakkına** sahip. Biz kurumun kendi yetkilendirdiği bir aracın yaptığı şeyi yapıyoruz, üçüncü tarafa veri vermiyoruz.

**Tepki 2:** "API'leri değiştirelim, çalışmasın"
- **Cevap:** İnteroperability hakkımıza müdahale. Hem hukuki sorun, hem kendi müşterilerine kötü deneyim (çünkü API değişimi kendi web frontend'lerini de bozar).
- Pratik: Adapter mimarisi ile 1-2 günde uyum sağlarız

**Tepki 3:** "Müşterilerimize 'bu yazılımı kullanmayın' diyelim"
- **Cevap:** Onların müşterileri zaten kendi parasıyla 249₺ ödüyor. INNOVA'nın "şu yazılımı kullanma" demesi kurumla ilişkisini bozar.

**En kötü senaryo:** INNOVA bizi mahkemeye verir.
- **Sonuç:** Hukuki süreç 1-2 yıl. Bu süreçte:
  - Pazarda olmaya devam edebiliriz (önlem alınmazsa)
  - Medya görünürlüğü artabilir (haber değeri)
  - Kurumlar bizim tarafa daha sıkı bağlanabilir ("INNOVA bizi sıkıştırıyor" hikâyesi)

### Pazarlama dili

**Yapmayacağımız:**
- "INNOVA'nın yerine geçin" ❌
- "INNOVA'nın eksiklerini kapatın" ❌
- "INNOVA'nın API'sini hack'liyoruz" ❌

**Yapacağımız:**
- "BKDS verilerinizi cebinizde taşıyın" ✓
- "INNOVA BRY'nizin tamamlayıcı arayüzü" ✓
- "Kameralarınızla anında iletişim" ✓

Konum: **tamamlayıcı, ek değer üreten araç.** INNOVA'nın varlığını gerektiriyor.

---

## 6. Etik Sınırlar — Yapmadığımız Şeyler

Teknik olarak **yapabileceğimiz** ama yapmadığımız şeyler:

1. **Verileri cloud'a yedeklemek** — Pratik ama KVKK riski. Yapmıyoruz.
2. **AI/ML için veri kullanmak** — Yüz tanıma modeli eğitebilirdik, yapmıyoruz.
3. **Anonim "analytics"** — "Kaç kurumda kaç öğrenci var" gibi istatistikler bile toplamıyoruz. Sadece lisans kontrolü.
4. **Reklam veya 3. taraf paylaşımı** — Yok ve olmayacak.
5. **Veri zenginleştirme** — Başka kaynaklardan veri çekip eklemiyoruz.

**Bu sınırlar pazarlamamızın güçlü yanı.** "Biz veri toplama, biz hizmet veriyoruz" mesajı.

---

## 7. Veli Paneli ve KVKK (Faz 4)

Faz 4'te veli paneli geliyor — burada hukuki durum **biraz daha karmaşık** olacak:

- Veli kendi çocuğunun verisini görmek isteyecek
- Bu **velinin yasal hakkı** (KVKK + Çocuk Hakları)
- Veli authentication: kurum QR kod verir, veli telefonunda PWA olarak açar
- **Sadece kendi çocuğunun verisini görür** — başka çocuk verisi sızıntısı yok

Bu özellik **kurum sahibi tarafından devreye alınır**, biz default kapalı tutarız. Kurum açmak isterse:
- Kullanım koşullarını gösterir
- "Veli rızalarını aldım" onayı verir (sözleşmesel sorumluluk)
- Sonra QR'ları üretir

---

## 8. Sonuç — Mimarinin Hukuki Felsefesi

**Lokal mimari = hem teknik hem hukuki seçim.**

Cloud yapsak:
- Daha kolay özellik geliştirilir (gerçek zamanlı sync, multi-device, vs)
- Ama KVKK denetimi, çocuk verisi riski, INNOVA çatışması, kullanıcı güvensizliği
- Net hesap: **Riskler avantajlardan büyük**

Lokal yapınca:
- Bazı özellikler zor (multi-device sync için ek katman gerekir)
- Ama **hukuki olarak temiz**, INNOVA ile çatışmaz, kullanıcı güveni yüksek
- Net hesap: **Doğru karar**

**Kuruma satarken cümle:** "Veriniz size ait. Sizden çıkmıyor. Biz sadece arayüz sağlıyoruz."

Bu cümlenin arkasında durabilmek için tüm mimariyi buna göre kurduk.

---

**Bu dosya `LEGAL_AND_KVKK.md` adıyla repo root'una konmalı. Pazarlama materyalleri, sözleşmeler, satış konuşmaları için referans olacak.**
