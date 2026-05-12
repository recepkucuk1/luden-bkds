# BRY Takip Marketing Site

`brytakip.com` için one-page landing.

## Yapı

- **Tek dosya**: `index.html` — Tailwind CDN ile, build adımı YOK
- Tüm bölümler aynı dosyada (Hero, Özellikler, Fiyat, SSS, Footer)
- Brand renkleri ana uygulamayla aynı (#0f6e56)
- Mobile-first, responsive

## Geliştirme

Tarayıcıda doğrudan aç:

```bash
cd marketing
open index.html
```

(Mac: `open`, Linux: `xdg-open`, Windows: çift tıkla)

Veya local server isterseniz:

```bash
cd marketing
python3 -m http.server 8000
# http://localhost:8000
```

İçeriği değiştirmek için: `index.html`'i edit edin, kaydedin, tarayıcıyı yenileyin.
Tailwind CDN runtime'da çalıştığı için class değişikliği anında yansır.

## Yapılacaklar (Hostinger'a yükleme)

### Seçenek A — Manuel FTP

1. Hostinger Panel → File Manager → public_html
2. `index.html` dosyasını yükle
3. (İleride) `kvkk.html`, `kosullar.html`, `iade.html` dosyalarını oluştur ve yükle
4. (İleride) `updates/latest.json` Tauri updater için aynı dizine yüklenir

### Seçenek B — GitHub auto-deploy

1. Hostinger Panel → Websites → Auto Deployer veya Git
2. Repo: `recepkucuk1/luden-bkds`
3. Branch: `main`
4. Source path: `marketing/` (alt klasör)
5. Destination: `public_html/`
6. Auto-deploy on push

GitHub'a her push'ta Hostinger içeriği günceller. `latest.json` da
auto-updater için release job tarafından üretilip aynı yere konabilir
(workflow değişikliği gerekir).

## Yapılacaklar listesi (içerik bekliyor)

- [ ] WhatsApp numarası: `https://wa.me/905XXXXXXXXX` → gerçek numara
- [ ] Email: `bilgi@brytakip.com` çalışan mailbox kurulumu
- [ ] `kvkk.html` — Aydınlatma metni (LEGAL_AND_KVKK.md baz alınarak)
- [ ] `kosullar.html` — Kullanım koşulları (avukatla)
- [ ] `iade.html` — İade politikası (Mesafeli Satış Sözleşmesi gereği)
- [ ] Open Graph image — `og.png` (1200x630, brand renkli)
- [ ] Phone mockup screenshot — gerçek uygulama görseli (şu an SVG mockup)
- [ ] Favicon — gerçek tasarım (şu an inline SVG)
- [ ] Google Analytics / Plausible / vb. — pazarlama metriği (opsiyonel)

## Brand kuralları

- Ana renk: `#0f6e56` (brand)
- Açık ton: `#1d9e75` (brand-light)
- Dark variant: `#0a4734` (brand-dark)
- Font: system-ui (san serif default), Apple/Windows tüm cihazlarda uyumlu
- "BRY Takip" hep ürün adı, "LudenLab" hep firma adı
- KVKK + müdahalesizlik + yerel ağ vurgusu her sayfa
