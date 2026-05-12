# BRY Takip SaaS API

`api.brytakip.com` — Fastify + Prisma + **Hostinger MySQL**, Hostinger Business Node.js'de host.

## Mimari (tamamı Hostinger)

```
brytakip.com (Hostinger statik — public_html/)
       │ POST /api/signup, GET/POST /api/admin/*
       ↓
api.brytakip.com (Hostinger Node.js app)
       │ Prisma queries
       ↓
Hostinger MySQL (aynı sunucu, localhost:3306)
```

Tek sağlayıcı, tek dashboard, tek fatura.

## Klasör

```
saas-api/
├── prisma/schema.prisma     Kurum + License + Payment (MySQL)
├── src/
│   ├── server.ts            Fastify entry
│   ├── lib/{prisma,auth}.ts
│   └── routes/{signup,license,admin}.ts
├── package.json
├── tsconfig.json
└── .env.example
```

## Recep'in hPanel'de yapacakları (~20 dk)

Aşağıdaki 1-4 adımları **Recep yapacak** (hPanel UI clicks).
Adım 5-10'u Claude (Bash agent) SSH ile yapacak.

### 1. MySQL veritabanı oluştur

1. hPanel → **MySQL Databases**
2. **Create new database**:
   - Database name: `brytakip` (Hostinger otomatik `u1234567_brytakip` formatına çevirir)
   - Database user: `brytakip` (aynı)
   - Password: güçlü şifre üret + kaydet
3. Oluşan **Database name, Username, Password**'ü bir kenara not et.

### 2. Subdomain `api.brytakip.com` aç

1. hPanel → **Subdomains** → **Create**
2. Subdomain: `api`, Domain: `brytakip.com`
3. SSL Let's Encrypt otomatik kurulur (5-10 dk içinde).

### 3. Node.js app oluştur

1. hPanel → **Advanced → Node.js**
2. **Create application**:
   - Node.js version: **20.x**
   - Application mode: **Production**
   - Application root: `domains/brytakip.com/public_html/api` (yukarıdaki subdomain folder'ı)
   - Application URL: `api.brytakip.com`
   - Application startup file: `saas-api/dist/server.js`
3. Oluştur.

### 4. Environment Variables ekle

hPanel → Node.js app → **Environment Variables**:

| Name | Value |
|---|---|
| `DATABASE_URL` | `mysql://u1234567_brytakip:PASS@localhost:3306/u1234567_brytakip` (1. adımdaki bilgiler) |
| `ADMIN_TOKEN` | terminal `openssl rand -hex 32` ile üret |
| `NODE_ENV` | `production` |

### 5. SSH erişimi

hPanel → **Advanced → SSH Access** → enable. Bana paylaşman gereken bilgiler:
- SSH hostname (örn. `194.62.X.X` veya `ssh.brytakip.com`)
- Port (genelde 65002)
- Username (örn. `u1234567`)
- Password — Hostinger SSH password'ü

⚠ Güvenlik: paylaştıktan sonra deploy bitince hPanel'den SSH parolasını rotate edebilirsin.

## Claude'un SSH ile yapacakları

Sen 1-5'i bitirip bilgileri verdiğinde, ben:

1. **SSH bağlan + repo çek**:
   ```bash
   ssh -p 65002 u1234567@host
   cd domains/brytakip.com/public_html/api
   git clone https://github.com/recepkucuk1/luden-bkds.git .
   ```

2. **Bağımlılık kurulumu**:
   ```bash
   cd saas-api
   npm install
   # postinstall otomatik `prisma generate` çağırır
   ```

3. **DB migration uygula**:
   ```bash
   npx prisma migrate deploy
   # initial migration MySQL tablolarını oluşturur
   ```

4. **TypeScript build**:
   ```bash
   npm run build
   # dist/server.js + tüm route'ler derlenir
   ```

5. **Node app restart** (hPanel'den de yapılabilir, SSH'tan touch ile de):
   ```bash
   touch tmp/restart.txt
   # Hostinger Node app bu dosyaya bakar, restart eder
   ```

6. **Smoke test**:
   ```bash
   curl https://api.brytakip.com/healthz
   # {"ok":true,"time":"...","uptime":N}
   ```

7. **İlk signup denemesi**:
   ```bash
   curl -X POST https://api.brytakip.com/api/signup \
     -H "Content-Type: application/json" \
     -d '{"kurum":"Test","yetkili":"X","sehir":"İzmir","email":"t@test.com","telefon":"05551234567","plan":"lite"}'
   # {"ok":true,"kurumId":"...","alreadyExists":false}
   ```

8. **MySQL tablo doğrulaması** (hPanel phpMyAdmin'den veya SSH):
   ```bash
   mysql -u u1234567_brytakip -p u1234567_brytakip -e "SELECT * FROM Kurum;"
   # Az önce eklenen test kaydı görünmeli
   ```

## Marketing dosyalarını yükleme

`public_html/` köküne `marketing/index.html` ve `marketing/admin.html` yüklenir.
Hostinger File Manager'dan drag-drop veya SSH `scp`:

```bash
scp -P 65002 marketing/index.html u1234567@host:domains/brytakip.com/public_html/
scp -P 65002 marketing/admin.html u1234567@host:domains/brytakip.com/public_html/
```

(Bunu da SSH ile birlikte yaparım.)

## Geliştirme (lokalde)

Lokal dev için ya Hostinger remote MySQL'e bağlan ya da lokal MySQL kur.

Hostinger remote için:
- hPanel → MySQL → **Remote Access** → IP whitelistine kendi IP'ni ekle
- DATABASE_URL host'u `localhost` yerine Hostinger MySQL host'u

Veya Docker ile lokal MySQL (basit):
```bash
docker run -d --name brytakip-mysql -e MYSQL_ROOT_PASSWORD=devpass -e MYSQL_DATABASE=brytakip -p 3306:3306 mysql:8
# DATABASE_URL=mysql://root:devpass@localhost:3306/brytakip
```

Sonra:
```bash
cd saas-api
npm install
npx prisma migrate dev --name init
npm run dev  # tsx watch
```

## Endpoint'ler

### Public
- `POST /api/signup` — marketing form
- `POST /api/license/verify` — uygulama açılışta
- `GET  /healthz` — uptime monitör

### Admin (Authorization: Bearer ADMIN_TOKEN)
- `GET  /api/admin/kurums?q=&plan=&limit=50` — liste + arama
- `POST /api/license/issue` — Recep lisans üretir
- `POST /api/admin/payment` — Recep ödeme kaydeder

## Sıradaki işler

- [ ] Recep hPanel adımları (1-5)
- [ ] Claude SSH deploy (6 adım yukarıda)
- [ ] Marketing'i public_html'e koy
- [ ] Tauri app'ten lisans ping'i — sonraki commit
- [ ] Hostinger SMTP ile email notification — yeni signup'ta Recep'e mail
- [ ] iyzico — Faz 3
