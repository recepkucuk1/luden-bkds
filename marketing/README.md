# BRY Takip Marketing Site

`brytakip.com` için one-page SPA.

## Mimari

Tek `index.html` içinde **3 view (görünüm)**, state-based switching:

| View | Görünür | İçerik |
|---|---|---|
| `landing` | Üye olmayan ziyaretçi | Hero, problem, özellikler, fiyat, SSS, iletişim |
| `signup` | "Üye Ol" tıklayan | Kurum bilgileri formu (kurum, yetkili, şehir, mail, telefon, plan, KVKK onayı) |
| `panel` | Form gönderildikten sonra | Hesap bilgileri + lisans durumu + indirme butonları + ödeme bilgileri |

State **localStorage'da** (`brytakip-user` key). Sayfa yeniden yüklendiğinde:
- Kayıt yoksa → `landing`
- Kayıt varsa → `panel`

URL hash routing var (`#/signup`, `#/panel`) — paylaşılabilir, geri tuşu çalışır.

## Üyelik akışı (şu anda)

1. Kullanıcı landing'i gezer, "Üye Ol" tıklar
2. Form doldurur (5 alan + plan radio + KVKK checkbox)
3. **Submit**: localStorage'a kaydedilir, panel'e yönlenir
4. Panel'de görür:
   - Hesap bilgileri (kurum, yetkili, mail, plan)
   - **Lisans Durumu**: "Manuel onay bekleniyor — WhatsApp'tan dönüş yapacağız"
   - **İndir kartı**: Mac (.dmg) + Windows (.exe) butonları (GitHub Releases'e gider)
   - **Ödeme bölümü** (Lite plan değilse): Havale/EFT bilgileri + "iyzico yakında" placeholder
5. Çıkış: localStorage temizlenir, landing'e döner

## Backend (henüz YOK — pilot için manuel)

Form submit şu an **sadece localStorage'a** yazıyor. Recep'in lead'i görmesi için backend gerekiyor. İki seçenek:

### A. Formspree benzeri 3. parti (en hızlı)
- formspree.io / web3forms.com / formsubmit.co
- 10 dakika kurulum
- Form action'ını endpoint'e yönlendir
- Recep'in mailbox'una otomatik mail düşer
- Aylık limit var ama pilot'a fazlasıyla yeter

### B. Hostinger PHP mail()
- Hostinger shared hosting'de PHP var
- `submit.php` dosyası 20 satır
- Form action="submit.php"
- Recep'in `bilgi@brytakip.com` adresine mail atar
- Limit yok, ücretsiz

### C. Cloudflare Workers (proper backend)
- Worker'da JSON al, Resend/Postmark ile mail at, isteğe bağlı DB'ye kaydet
- Faz 3'te lisans sistemine geçince zaten bunu kuracağız
- Şimdilik gereksiz

**Şimdi yapılması gereken**: A veya B seçeneğini hayata geçir. `index.html` içindeki `signupForm` submit handler'da yorum satırı var, orayı güncelle.

## Geliştirme

```bash
cd marketing
open index.html
# veya local server isterseniz:
python3 -m http.server 8000
```

İçerik düzenle, kaydet, browser yenile. Tailwind CDN runtime'da çalıştığı için class değişikliği anında yansır.

### View testi

URL'in sonuna ekleyerek view test et:
- `index.html` → landing
- `index.html#/signup` → signup form
- `index.html#/panel` → panel (önce form doldur veya localStorage'a manuel kayıt ekle)

localStorage'ı manuel set'lemek için browser console:
```js
localStorage.setItem('brytakip-user', JSON.stringify({
  kurum: 'Test Kurum',
  ad: 'Test Yetkili',
  email: 'test@test.com',
  telefon: '05551234567',
  plan: 'standart',
  createdAt: new Date().toISOString()
}));
location.reload();
```

Çıkış için console: `localStorage.removeItem('brytakip-user'); location.reload();`

## Hostinger deploy

### Seçenek A — Manuel FTP
1. Hostinger Panel → File Manager → public_html
2. `index.html` upload
3. (İleride) `kvkk.html`, `kosullar.html`, `iade.html`, `submit.php` (form backend için)
4. (İleride) `updates/latest.json` Tauri auto-updater için

### Seçenek B — GitHub auto-deploy
1. Hostinger Panel → Auto Deployer
2. Repo: `recepkucuk1/luden-bkds`
3. Branch: `main`
4. Source path: `marketing/`
5. Destination: `public_html/`

## Yapılacaklar listesi

### Hemen (pilot başlamadan)
- [ ] WhatsApp numarası: `https://wa.me/905XXXXXXXXX` → gerçek numara (5 yerde geçer, find/replace)
- [ ] Email: `bilgi@brytakip.com` Hostinger mailbox kurulumu
- [ ] Form backend (Formspree veya `submit.php`) — form şu an boş submit ediyor
- [ ] IBAN bilgileri — Ödeme kartında placeholder

### Önemli ama daha sonra
- [ ] `kvkk.html` — KVKK Aydınlatma Metni (avukatla)
- [ ] `kosullar.html` — Kullanım Koşulları (avukatla)
- [ ] `iade.html` — İade Politikası (Mesafeli Satış)
- [ ] Open Graph image `og.png` (1200x630, brand)
- [ ] Favicon gerçek tasarım
- [ ] Google Analytics / Plausible — pilot metriği

### Faz 3+
- [ ] iyzico entegrasyonu (otomatik tahsilat)
- [ ] Gerçek auth (email + magic link veya şifre)
- [ ] Lisans kodu otomatik üretim (`brytakip.com/api/license/issue`)
- [ ] e-Fatura entegrasyonu (BizimHesap, Logo vb.)
- [ ] Panel'de aktif lisans gösterimi (canlı backend'den)

## Brand kuralları

- Ana renk: `#0f6e56` (brand)
- Açık ton: `#1d9e75` (brand-light)
- Dark variant: `#0a4734` (brand-dark)
- Font: system-ui
- "BRY Takip" ürün adı, "LudenLab" firma adı
- KVKK + müdahalesizlik + yerel ağ vurgusu her ekranda
