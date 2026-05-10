# Luden BKDS — Release Kılavuzu

> Auto-updater için imzalama anahtarları, GitHub secret'leri, endpoint URL'i ve sürüm yayınlama adımları.

---

## 1. Imzalama Anahtarları (Tek Sefer)

`@tauri-apps/cli signer generate` komutu ile üretildi (2026-05-10):

- **Private key**: `~/.tauri/luden-bkds.key` — bilgisayarında kalır, repo'ya GİRMEZ
- **Public key**: `~/.tauri/luden-bkds.key.pub` — `desktop/src-tauri/tauri.conf.json`'a gömülü
- **Password**: boş (pilot için; production öncesi rotate edilebilir)

⚠️ **Private key'i KAYBETMEYİN.** Kayıp olursa hiçbir kullanıcı yeni güncelleme alamaz — yeni anahtar + yeni binary + manuel migrate gerekir.

`~/.tauri/` klasörünün macOS Time Machine yedeğinde olduğundan emin olun.

---

## 2. GitHub Secrets (Tek Sefer, Repo Push'tan Sonra)

Repo GitHub'a yüklendikten sonra **Settings → Secrets and variables → Actions** menüsünden iki secret ekle:

### `TAURI_SIGNING_PRIVATE_KEY`
```bash
# Bu komutun çıktısını kopyala, secret değeri olarak yapıştır
cat ~/.tauri/luden-bkds.key
```

### `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Pilot için **boş bırak** (anahtar password'süz üretildi)

Bu iki secret olmadan CI build başarılı olur AMA imza üretmez → auto-updater çalışmaz. CI build log'unda "skipping signing" uyarısı görünür.

---

## 3. Endpoint URL Ayarı

`desktop/src-tauri/tauri.conf.json` içindeki:

```json
"endpoints": [
  "https://luden.app/updates/latest.json"
]
```

Bu URL **henüz canlı değil**. Üç seçenek:

### Seçenek A — luden.app altında (önerilen, uzun vadeli)
- DNS → bir static hosting (Cloudflare Pages, Vercel, GitHub Pages, vb.)
- CI her release'te `latest.json`'ı bu hosting'e push eder
- URL marka uyumlu, GitHub repo URL'in son kullanıcıya görünmez

### Seçenek B — GitHub Releases (hızlı başlangıç)
URL'i şuna değiştir:
```json
"https://github.com/<KULLANICI>/luden-bkds/releases/latest/download/latest.json"
```
- `<KULLANICI>` Recep'in GitHub username'i
- Sıfır altyapı: CI release'i oluştururken `latest.json`'ı zaten release dosyalarına ekliyor
- Dezavantaj: kullanıcının gözüne GitHub URL'i görünür (App network log'larında)

### Seçenek C — Birden çok endpoint (fallback)
```json
"endpoints": [
  "https://luden.app/updates/latest.json",
  "https://github.com/<KULLANICI>/luden-bkds/releases/latest/download/latest.json"
]
```
İlk URL'e ulaşılamazsa ikinci dener. Migration sırasında önerilir.

**Karar verdikten sonra `tauri.conf.json`'ı güncelle ve yeni release çıkar.**

---

## 4. Sürüm Yayınlama

```bash
# 1. Sürüm bumpla — DÖRT yerde tutarlı olmalı
#    - desktop/src-tauri/tauri.conf.json:    "version": "0.2.0"
#    - desktop/src-tauri/Cargo.toml:         version = "0.2.0"
#    - desktop/package.json:                 "version": "0.2.0"
#    - backend/package.json (opsiyonel):     "version": "0.2.0"
#
# Bunları senkronize tutmak için ileride bir script yazılabilir.

# 2. Commit + tag + push
git commit -am "v0.2.0"
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions otomatik:
1. Mac + Windows build başlar (matrix)
2. Imzalı `.app.tar.gz` + `.dmg` (Mac) ve `-setup.exe` + `.msi` (Windows) üretir
3. Build bitince `release` job devreye girer
4. `latest.json` üretir (her platformun imzası + URL'leri ile)
5. GitHub Release oluşturur — tüm artifact'leri ve `latest.json`'ı yükler

İlk açılan kullanıcının uygulaması açılışta `tauri.conf.json`'daki endpoint URL'ini sorar, yeni sürüm görürse banner gösterir.

---

## 5. Test Akışı (İlk Release Öncesi)

### Yerel test
1. `cd desktop && npm run build:all && npm run build`
2. `open "src-tauri/target/release/bundle/macos/Luden BKDS.app"`
3. Açılır, çalışır. Auto-update kontrolü endpoint'e ulaşamayacağı için sessizce başarısız olur (banner çıkmaz, hata gizli).

### CI test (release publish etmeden)
1. `git push` → workflow_dispatch ile manuel tetikle (PR/branch'te)
2. Artifact'leri manuel indir, `.sig` dosyalarının üretildiğini doğrula

### Gerçek release test
1. v0.1.0 olarak ilk release çıkar (kurulum başlangıç noktası)
2. Bir kuruma yükle
3. v0.1.1 hot-fix ile bir değişiklik yap, tag'le
4. CI release oluşturur
5. Yüklü kurum 5 sn içinde "yeni sürüm var" banner'ı görür
6. Tıklar → indirir → kurar → relaunch

---

## 6. Güvenlik Notları

- Private key password'süz — kurum 50+ olunca rotate et:
  ```bash
  # Yeni anahtar üret
  npx tauri signer generate -w ~/.tauri/luden-bkds-v2.key
  # Yeni public key'i tauri.conf.json'a koy
  # ESKİ kullanıcılar yeni sürüme **manuel** geçmek zorunda kalır
  ```
- Code signing (Apple Developer + Windows EV cert) **henüz yok** — Faz 1 işi
- Auto-update **olur** ama yüklerken Gatekeeper/SmartScreen uyarısı çıkar
- Kullanıcı ilk yükledikten sonra "Allow Anyway" → sonraki güncellemeler aynı uyarıyı verebilir

Code signing eklendiğinde:
- Apple Developer cert ile `.app.tar.gz` notarized olur
- Windows EV cert ile `.exe` Authenticode imzalı olur
- Auto-update tamamen şeffaf akar
