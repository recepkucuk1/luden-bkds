# BRY Takip — Tek Servis (Marketing + API)

`brytakip.com` — Fastify + Prisma + Hostinger MySQL + statik marketing,
**hepsi tek Node.js app**, Hostinger Business plan'da **Node.js Apps** olarak host edilir.

## Mimari

```
brytakip.com (Hostinger Node.js Apps — Fastify)
    │
    ├─ GET /                  → public/index.html (landing, signup form)
    ├─ GET /admin.html        → public/admin.html (Recep paneli)
    │
    ├─ POST /api/signup       → yeni kurum kaydı
    ├─ POST /api/license/verify        → uygulama açılışta lisans kontrol
    ├─ POST /api/license/issue [admin] → lisans üret
    ├─ GET  /api/admin/kurums [admin]  → liste + arama
    └─ POST /api/admin/payment [admin] → ödeme kaydet
       │
       └─ Prisma → Hostinger MySQL (aynı sunucu)
```

**Subdomain yok** (`api.brytakip.com` artık gerekli değil). Tek site, tek SSL,
tek build, tek dashboard. Marketing'i değiştirmek isterse Recep
`saas-api/public/index.html`'i edit edip GitHub'a push atar — Hostinger otomatik
yeniden deploy eder.

## Klasör

```
saas-api/
├── public/
│   ├── index.html          Landing + signup form (one-page SPA)
│   └── admin.html          Token korumalı admin paneli
├── prisma/schema.prisma    Kurum + License + Payment (MySQL)
├── src/
│   ├── server.ts           Fastify entry (+ @fastify/static)
│   ├── lib/{prisma,auth}.ts
│   └── routes/{signup,license,admin}.ts
├── package.json
├── tsconfig.json
└── .env.example
```

## Hostinger'da deploy (2026 akışı)

**ÖNEMLİ**: Hostinger 2026'da "Advanced → Node.js" akışını **kaldırdı**.
Artık `Websites → Add Website → Node.js Apps` ayrı bir website tipi.
Bir domain hem PHP hem Node.js olamaz — eski PHP website'i silmek gerekir.

### Recep'in adımları (hPanel)

1. **Eski PHP website'ini sil**: hPanel → Websites → `brytakip.com` → Settings →
   Delete website (henüz boş, kaybedilecek bir şey yok).

2. **MySQL veritabanını koru veya yeni oluştur**:
   hPanel → Databases → MySQL Databases. DB adı, user, password not al.

3. **Yeni Node.js website oluştur**:
   hPanel → Websites → **Add Website** → **Node.js Apps**
   - Source: **Import Git Repository**
   - Repository: `https://github.com/recepkucuk1/luden-bkds`
   - Branch: `main`
   - **Root directory: `saas-api`** ← önemli, monorepo'nun bu alt klasörü deploy
   - Domain: `brytakip.com` (mevcut domain)
   - Node version: **20.x**
   - Build command: `npm install && npm run build`
   - Start command: `npm start`

4. **Environment Variables ekle** (build başlamadan önce):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `mysql://u302466594_brytakip:PASS@HOST:3306/u302466594_brytakip` |
   | `ADMIN_TOKEN` | `openssl rand -hex 32` çıktısı (Mac terminal'de üret) |
   | `NODE_ENV` | `production` |

5. **Deploy** → Hostinger build container'ını çalıştırır:
   - `npm install` → prisma client generate + dependencies
   - `npm run build` → TypeScript derleme (`dist/`)
   - Container'da `dist/server.js` başlatılır
   - Build log'larını UI'dan takip edebilirsin

6. **DB migration**: Build başarılı olduktan sonra Hostinger Node.js Apps'in
   **"Run command"** veya **"Deployment hooks"** bölümünden:
   ```
   npx prisma migrate deploy
   ```
   Bu MySQL'de tabloları (Kurum, License, Payment) oluşturur.
   (Alternatif: `package.json` scripts'e `postinstall` veya `prebuild` ekleyip
   otomatik yapılabilir.)

7. **Smoke test**:
   ```bash
   curl https://brytakip.com/healthz
   # {"ok":true,"time":"...","uptime":N}
   ```

## Geliştirme (lokal)

```bash
# DB için Hostinger remote MySQL whitelistine kendi IP'ni ekle, veya:
docker run -d --name brytakip-mysql \
  -e MYSQL_ROOT_PASSWORD=devpass \
  -e MYSQL_DATABASE=brytakip \
  -p 3306:3306 mysql:8

# .env oluştur
cp .env.example .env
# DATABASE_URL'i lokal MySQL'e ayarla, ADMIN_TOKEN'a random hex koy

npm install
npx prisma migrate dev --name init  # ilk kez
npm run dev                          # tsx watch
# → http://localhost:3000
```

## Endpoint'ler

### Public
- `GET  /`                       — marketing landing page
- `GET  /admin.html`             — admin login + paneli
- `POST /api/signup`             — yeni kurum kaydı (marketing form)
- `POST /api/license/verify`     — uygulama açılışta lisans kontrol
- `GET  /healthz`                — uptime monitör

### Admin (`Authorization: Bearer $ADMIN_TOKEN`)
- `GET  /api/admin/kurums?q=&plan=&limit=50` — liste + arama
- `POST /api/license/issue`      — Recep lisans üretir
- `POST /api/admin/payment`      — Recep ödeme kaydeder

## Sıradaki işler

- [ ] Recep hPanel'den deploy + DATABASE_URL env var
- [ ] Prisma migrate deploy (ilk tablo oluşturma)
- [ ] Tauri app'ten lisans ping'i — sonraki commit
- [ ] Hostinger SMTP ile email notification — yeni signup'ta Recep'e mail
- [ ] iyzico — Faz 3
