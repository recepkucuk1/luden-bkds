# BRY Takip

Özel eğitim merkezleri için INNOVA BKDS giriş-çıkış canlı takip uygulaması. Telefondan ve bilgisayardan anlık takip, ders saati hesabı, yerel ağ bildirimi (Web Push yok — veri kurum dışına çıkmaz).

## Mimari

```
luden-bkds/
├── backend/      # Fastify + TypeScript (Node.js)
├── frontend/     # Nuxt 3 + Tailwind (PWA)
└── desktop/      # Tauri 2 (Mac/Windows native app)
```

- **Backend**: BRY API'sine bağlanır, polling yapar, frontend'e WebSocket + REST sunar
- **Frontend**: Mobile-first PWA, akordeon UI, ders saati hesabı
- **Desktop**: Backend + frontend tek `.app`/`.msi`'de paketlenmiş, Tauri Rust kabuk ile

## Geliştirme

### Önkoşullar
- Node.js 20+
- Rust (Tauri için)
- macOS veya Windows

### Çalıştır

```bash
# Backend
cd backend
npm install
npm run dev   # port 8787

# Frontend (ayrı terminal)
cd frontend
npm install
npm run dev   # port 3000

# Desktop (ayrı terminal)
cd desktop
npm install
npm run dev   # Tauri penceresi açılır
```

### Production build

```bash
cd desktop
npm run build:all    # backend + frontend + node bundle
npm run build        # Tauri ile .dmg/.msi üret
```

Çıktılar: `desktop/src-tauri/target/release/bundle/`

## Release

`git tag v0.X.Y` push edilince GitHub Actions otomatik build alır, release oluşturur.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Lisans

Telif hakkı © 2026 LudenLab. Tüm hakları saklıdır.
