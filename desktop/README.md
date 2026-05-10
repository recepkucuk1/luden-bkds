# Luden BKDS Desktop

Tauri uygulaması — backend (Node.js) + frontend (Nuxt) tek `.app`/`.exe` içinde.

## Geliştirme

İlk kurulum:

```bash
cd desktop
npm install
```

Geliştirme modunda çalıştır (Tauri dev sunucusu + arka plan backend):

```bash
# Önce backend ve frontend bundle'larını hazırla
npm run prepare:dev

# Tauri'yi başlat
npm run dev
```

Tauri penceresi açılır. Hata olursa terminal log'larında ipucu var.

## Production build

```bash
npm run build:all   # Backend + frontend bundle'la
npm run build       # Tauri ile .app/.exe paketle
```

Çıktı: `src-tauri/target/release/bundle/`

- macOS: `.dmg` ve `.app`
- Windows: `.msi` ve `.exe`
- Linux: `.deb` ve `.AppImage`

## Mimari

```
.app içinde:
├── Frontend (static, dist-frontend olarak resource)
├── Backend (server-{target}.cjs sidecar)
└── Tauri Rust kabuğu (main)
```

Çalışma akışı:
1. Tauri açılır, Rust kabuk başlar
2. Sidecar olarak `node server-{target}.cjs` başlar (port 8787)
3. Webview file://...index.html'i açar
4. Frontend localhost:8787'ye bağlanır
5. Yerel ağdaki cihazlar (telefon) http://Mac-IP:8787 ile bağlanır
6. Pencere kapanınca backend de kapanır

## Notlar

- Pilot/MVP için: kullanıcının Mac'inde Node.js kurulu olmalı (sidecar onu çağırır)
- Node.js gömüsü için ileride Node SEA veya pkg kullanılacak
