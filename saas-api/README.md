# BRY Takip SaaS API

`api.brytakip.com` üzerinde çalışan backend.

**Stack:** Fastify yok — Vercel serverless functions + Prisma + Supabase Postgres.

## Mimari

```
brytakip.com (Hostinger static)
       │ POST /api/signup
       │ GET  /api/admin/kurums
       ↓
api.brytakip.com (Vercel functions)
       │ Prisma queries
       ↓
Supabase Postgres (Frankfurt)
```

## Klasör

```
saas-api/
├── api/                      ← Vercel auto-routing
│   ├── signup.ts             POST /api/signup
│   ├── license/
│   │   ├── verify.ts         POST /api/license/verify (uygulama açılışta ping)
│   │   └── issue.ts          POST /api/license/issue (admin)
│   └── admin/
│       ├── kurums.ts         GET  /api/admin/kurums
│       └── payment.ts        POST /api/admin/payment
├── lib/
│   ├── prisma.ts             Prisma client singleton
│   └── auth.ts               admin token kontrolü + key generator
├── prisma/
│   └── schema.prisma         Kurum + License + Payment models
├── package.json
├── tsconfig.json
├── vercel.json               CORS + function config
├── .env.example
└── README.md
```

## İlk kurulum (Recep'in yapacakları)

### 1. Supabase projesi aç

1. https://supabase.com → "Start your project" → GitHub ile giriş yap
2. **New project**:
   - Project name: `brytakip`
   - Database password: güçlü rastgele şifre (kaydet!)
   - Region: **Central EU (Frankfurt)** — Türkiye'ye yakın, KVKK-uyumlu konum
   - Plan: **Free** (pilot için 500MB yeter)
3. Proje hazır olunca **Project Settings → Database** → **Connection string**:
   - "Transaction" sekmesinde **URI**'yi kopyala — bu `DATABASE_URL` (port 6543)
   - "Session" sekmesinde **URI**'yi kopyala — bu `DIRECT_URL` (port 5432)
   - `[YOUR-PASSWORD]` yerine database password'ünü yaz

### 2. Vercel projesi aç

1. https://vercel.com → "Continue with GitHub"
2. **Add New → Project** → `recepkucuk1/luden-bkds` repo'sunu seç
3. **Configure Project**:
   - Project Name: `brytakip-api`
   - **Root Directory**: `saas-api`  ← önemli, repo root'u değil
   - Framework Preset: **Other**
   - Build Command: `prisma generate` (otomatik dolacak)
   - Install Command: `npm install` (default)
4. **Environment Variables** (Deploy'dan önce):
   - `DATABASE_URL`: Supabase pooler URL'i (port 6543)
   - `DIRECT_URL`: Supabase direkt URL (port 5432)
   - `ADMIN_TOKEN`: `openssl rand -hex 32` ile ürettiğin uzun string (Vercel UI'da gizli kalır)
5. **Deploy**

İlk deploy başarısız olursa `prisma migrate deploy` çalışmamış demektir. Şu komutla manuel:

```bash
cd saas-api
npx prisma migrate deploy   # production migration'ları uygula
```

(Lokalde `.env` dosyası gerekir; DATABASE_URL + DIRECT_URL ile.)

### 3. Custom domain (api.brytakip.com)

Vercel Dashboard → Settings → Domains → "Add" → `api.brytakip.com`.

Hostinger DNS panelinde **CNAME record** ekle:
- Host: `api`
- Value: `cname.vercel-dns.com.`
- TTL: default

5-10 dakikada propagate eder. Vercel SSL otomatik kurulur.

### 4. Database migration

İlk kurulumda Prisma schema'yı DB'ye uygula:

```bash
cd saas-api
npm install
# .env dosyasını oluştur (.env.example'dan kopyala, gerçek URL'leri yaz)
npx prisma migrate dev --name init
```

Bu komut:
- `prisma/migrations/000_init/migration.sql` üretir
- Supabase'e uygular
- Prisma Client generate eder

Sonradan schema değişirse:
```bash
npx prisma migrate dev --name <açıklama>     # dev (lokalde)
npx prisma migrate deploy                     # production (Vercel auto-deploy zaten yapar)
```

## Geliştirme

```bash
cd saas-api
npm install
cp .env.example .env
# .env'i Supabase + ADMIN_TOKEN ile doldur
vercel dev   # localhost:3000'de serverless function'ları emüle eder
```

## Endpoint'ler

### Public

**POST /api/signup**
Marketing form'undan gelir.

Body:
```json
{
  "kurum": "Luden Keşif Özel Eğitim",
  "yetkili": "Recep Küçük",
  "sehir": "İzmir",
  "email": "recep@test.com",
  "telefon": "05551234567",
  "plan": "standart",
  "source": "landing"
}
```

Response: `{ ok: true, kurumId: "...", alreadyExists: false }`

**POST /api/license/verify**
Mac/Windows uygulaması açılışta çağırır.

Body:
```json
{ "key": "BRY-X3K2-9HFA-PQRS-TUVW", "machineId": "uuid-v4" }
```

Response: `{ status: "ACTIVE", plan: "STANDART", expiresAt: "2027-05-11T..." }`

### Admin (Authorization: Bearer ADMIN_TOKEN)

**GET /api/admin/kurums?q=arama&plan=STANDART&limit=50**

Tüm kurum listesi, filtreleme + arama destekli.

**POST /api/admin/license/issue**
Body: `{ kurumId, expiresInDays?: 365, status?: 'PENDING'|'ACTIVE' }`

Yeni lisans key üretir.

**POST /api/admin/payment**
Body: `{ kurumId, amount, method: 'HAVALE', paidAt?, invoiceNo?, notes? }`

Manuel ödeme kaydı (havale geldi vs.).

## Sıradaki işler

- [ ] **Marketing form'unu API'ye bağla** — `marketing/index.html` içinde `fetch('https://api.brytakip.com/signup', ...)` çağrısı
- [ ] **Admin panel HTML sayfası** — `marketing/admin.html` (token girişi + kurum tablosu + lisans üret butonu)
- [ ] **Tauri app'ten lisans ping'i** — uygulama açılışta `/api/license/verify` çağırması
- [ ] **Email bildirimi** — yeni kurum kaydında Recep'e mail (Resend free tier)
- [ ] **iyzico entegrasyonu** — Faz 3
