# BRY Takip SaaS API

`api.brytakip.com` — Fastify + Prisma + Supabase Postgres, **Hostinger Business Node.js**'de host edilir.

## Mimari

```
brytakip.com (Hostinger statik — public_html/)
       │  POST /api/signup, GET/POST /api/admin/*
       ↓
api.brytakip.com (Hostinger Node.js app)
       │  Prisma queries
       ↓
Supabase Postgres (Frankfurt)
```

Vercel YOK — her şey Hostinger üzerinde, DB sadece Supabase'de.

## Klasör

```
saas-api/
├── prisma/
│   └── schema.prisma           Kurum + License + Payment models
├── src/
│   ├── server.ts               Fastify entry (port 3000 default)
│   ├── lib/
│   │   ├── prisma.ts           Prisma client singleton
│   │   └── auth.ts             admin token kontrolü + key generator
│   └── routes/
│       ├── signup.ts           POST /api/signup
│       ├── license.ts          POST /api/license/verify, POST /api/license/issue
│       └── admin.ts            GET /api/admin/kurums, POST /api/admin/payment
├── dist/                       (TS derleme çıktısı — gitignore'da)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## İlk kurulum — Recep'in adımları

### 1. Supabase projesi (5 dk)

1. https://supabase.com → "Start your project" → GitHub ile gir
2. **New project**:
   - Name: `brytakip`
   - Database password: güçlü şifre + **kaydet**
   - Region: **Central EU (Frankfurt)** ← Türkiye'ye yakın, ücretsiz tier
3. ~1-2 dk bekle, proje hazır olunca:
4. Sol menüde **Project Settings → Database → Connection string**:
   - **"Transaction"** sekmesi (port 6543) → `DATABASE_URL`
   - **"Session"** sekmesi (port 5432) → `DIRECT_URL`
   - URL'lerdeki `[YOUR-PASSWORD]` yerine kaydettiğin şifre

### 2. Admin token üret (10 sn)

Terminal:
```bash
openssl rand -hex 32
```

Çıkan 64-char hex'i kaydet → `ADMIN_TOKEN` olacak.

### 3. İlk DB migration (3 dk, Mac'ten)

```bash
cd /Users/recepkucuk/Downloads/luden-bkds/saas-api
npm install
cp .env.example .env
# .env'i editor'la aç:
#   DATABASE_URL = Supabase Transaction URL (port 6543)
#   DIRECT_URL   = Supabase Session URL (port 5432)
#   ADMIN_TOKEN  = openssl ile üretilen

npx prisma migrate dev --name init
```

Bu:
- `prisma/migrations/000_init/migration.sql` üretir
- Supabase'e schema uygular
- Prisma Client generate eder

Migration dosyalarını commit'le:
```bash
cd /Users/recepkucuk/Downloads/luden-bkds
git add saas-api/prisma/migrations/
git commit -m "chore(saas-api): initial migration"
git push
```

### 4. Hostinger Node.js app kurulumu (10 dk)

1. Hostinger hPanel'a gir → `brytakip.com` domain'in
2. **Advanced** menüsü → **Node.js**
3. **Create application**:
   - **Node.js version**: 20.x (en yenisini seç)
   - **Application mode**: Production
   - **Application root**: `domains/brytakip.com/public_html/api` (subdomain için ayrı klasör)
   - **Application URL**: `api.brytakip.com`
   - **Application startup file**: `dist/server.js`
4. **Create** — Hostinger temel app'i oluşturur

### 5. Kodu Hostinger'a aktar — iki yol var

**A) Git deploy (önerilen, auto-deploy on push)**

1. Hostinger hPanel → **Advanced → Git**
2. **Create repository**:
   - Repository URL: `https://github.com/recepkucuk1/luden-bkds.git`
   - Branch: `main`
   - Repository path: `domains/brytakip.com/public_html/api`
3. (Hostinger PRO+ planda) **Automatic deployment**'ı aç → her push'ta otomatik pull
4. İlk pull: panel'den manuel "Pull" tıkla

Hostinger sadece `saas-api/` klasörünü çekmiyor — tüm repo'yu çeker. Bu sorun değil, Node app `dist/server.js` startup file'ı kullandığı için `saas-api/dist/server.js` yolunu doğru çalıştırır. Detay aşağıda Adım 7.

**B) Manuel upload (Git çalışmazsa)**

```bash
cd /Users/recepkucuk/Downloads/luden-bkds/saas-api
npm install      # node_modules + prisma generate
npm run build    # dist/ üretir
# Sonra dist/ + package.json + prisma/ + node_modules/ → Hostinger File Manager'a yükle
```

### 6. Environment variables (Hostinger Node Manager)

hPanel → Node.js app → **Environment Variables**:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase Transaction URL (port 6543) |
| `DIRECT_URL` | Supabase Session URL (port 5432) |
| `ADMIN_TOKEN` | openssl rand -hex 32 ile ürettiğin |
| `NODE_ENV` | `production` |

### 7. Application path düzeltmesi

Hostinger Node.js app subdomain için tipik yapı:
- `domains/brytakip.com/public_html/api/` ← uygulama burada
- Git pull edince tüm repo `api/` klasörüne gelir → `api/saas-api/dist/server.js`

İki seçenek:
- (a) **Application startup file** → `saas-api/dist/server.js` ayarla
- (b) Veya `package.json`'ı `saas-api/` köküne taşı (subtree split — daha temiz, sonra düzenleriz)

Şimdilik (a) kolay: hPanel'da startup file path'ini değiştir, kaydet.

### 8. Build + start

hPanel → Node.js app → **Run NPM Install** tıkla. `prisma generate` postinstall ile otomatik çalışır.

Sonra **Run NPM Script** → `build` seç → tsc derler `dist/`'e.

Sonra **Run NPM Script** → `db:deploy` ile Prisma migration'ları production'a uygula (zaten Supabase'de ama emin olmak için).

Son olarak **Restart application** tıkla.

Test:
```bash
curl https://api.brytakip.com/healthz
# {"ok":true,"time":"...","uptime":N}
```

### 9. DNS — `api.brytakip.com` subdomain

hPanel → **Subdomains** → **Create new** → `api` (subdomain). Hostinger otomatik DNS A record kurar, SSL Let's Encrypt otomatik gelir (5-10 dk).

## Geliştirme (lokalde)

```bash
cd saas-api
npm install
cp .env.example .env
# .env doldur (Supabase URL'leri + ADMIN_TOKEN)
npm run dev    # tsx watch ile localhost:3000'de çalışır
```

Test:
```bash
curl -X POST http://localhost:3000/api/signup \
  -H "Content-Type: application/json" \
  -d '{"kurum":"Test","yetkili":"X","sehir":"İzmir","email":"t@t.com","telefon":"05551234567","plan":"lite"}'
```

## Endpoint'ler

### Public

**POST /api/signup**

Marketing form'undan gelir.

Body: `{ kurum, yetkili, sehir, email, telefon, plan: 'lite'|'standart'|'pro', source? }`

Response 200: `{ ok: true, kurumId, alreadyExists: boolean }`

**POST /api/license/verify**

Mac/Windows uygulaması açılışta çağırır.

Body: `{ key: "BRY-X3K2-...", machineId: "uuid" }`

Response 200: `{ status: "ACTIVE"|"EXPIRED"|"PENDING", plan, expiresAt }`

### Admin (Authorization: Bearer ADMIN_TOKEN)

**GET /api/admin/kurums?q=arama&plan=STANDART&limit=50&offset=0**

Kurum listesi, filtreleme + arama.

**POST /api/license/issue**

Body: `{ kurumId, expiresInDays?: 365, status?: 'PENDING'|'ACTIVE' }`

**POST /api/admin/payment**

Body: `{ kurumId, amount, method: 'HAVALE'|'IYZICO'|'MANUEL'|'OTHER', paidAt?, invoiceNo?, notes? }`

### Health

**GET /healthz** — public, monitoring için

## Sıradaki işler

- [ ] **Hostinger Node app kurulumu** — Recep yapacak (yukarı adım 4-9)
- [ ] **Marketing'i Hostinger public_html'e yükle** — `marketing/index.html`, `marketing/admin.html`
- [ ] **Tauri app'ten lisans ping'i** — Mac/Windows uygulaması açılışta `/api/license/verify`
- [ ] **Email bildirimi** — yeni signup geldiğinde Recep'e mail (Resend / Hostinger mail SMTP)
- [ ] **iyzico entegrasyonu** — Faz 3, otomatik tahsilat
