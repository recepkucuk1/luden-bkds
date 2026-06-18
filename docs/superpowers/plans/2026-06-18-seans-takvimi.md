# Seans Takvimi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gelen öğrencilerin seanslarını üç katmanlı, salt-okunur bir takvim arayüzüyle görselleştirmek — A (ay ısı haritası) → C (gün zaman çizelgesi) → B (kişi devam takvimi).

**Architecture:** Backend, mevcut `getSnapshot({date})` (C için) üstüne, ayın gün-özetlerini cache'leyen bir katman ve iki yalın uç ekler (A ve B). Frontend, pür tarih/ısı/lane mantığını `utils/calendar.ts`'e koyar (birim testli), bunu `MonthGrid` + `DayTimeline` bileşenleri ve `/takvim` rotalarıyla render eder. Tüm görünümler salt-okunur ve KVKK gereği minimum PII taşır.

**Tech Stack:** Backend — Fastify + TypeScript (ESM, NodeNext), test: `tsx` + `node:assert`. Frontend — Nuxt 3 (SPA), Tailwind, test: `vitest` (yalnız pür util'ler). Tasarım belgesi: `docs/superpowers/specs/2026-06-18-seans-takvimi-design.md`.

---

## Test Stratejisi (neden böyle)

Repoda otomatik test altyapısı **yok** (backend'de yalnız canlı-INNOVA gerektiren `smoke-test.ts`). Bu yüzden:

- **Backend pür mantık** (gün-özeti toplama, öğrenci sayımı, ders toplamı, kişi filtresi) → sahte adapter+cache enjekte edilerek `node:assert` ile test edilir, `tsx` ile çalıştırılır (yeni bağımlılık yok; repo zaten `tsx` kullanıyor). Ağ gerekmez.
- **Frontend pür util** (ay matrisi, ay kaydırma, gelecek-ay koruması, ısı seviyesi, lane atama, ISO→TR dakika) → `vitest` ile test edilir (Nuxt runtime'a ihtiyaç duymayan saf fonksiyonlar).
- **Bileşenler/sayfalar** (görsel/etkileşim) → preview ile doğrulanır. Gerçek veriyle nihai görsel doğrulama, yapılandırılmış bir BRY bağlantısı gerektirir (kullanıcının INNOVA'sı); pür mantık çevrimdışı testlerle kapsanır.

---

## File Structure

**Backend:**
- `backend/src/services/presence.ts` — *(değiştir)* yeni tipler + `getMonthSummaries` (private, ay cache), `getCalendarMonth`, `getIndividualMonth`.
- `backend/src/services/calendar.test.ts` — *(oluştur)* sahte bağımlılıklarla birim test (tsx/assert).
- `backend/src/routes/index.ts` — *(değiştir)* `GET /api/calendar/month`, `GET /api/calendar/individual/:uuid`.
- `backend/package.json` — *(değiştir)* `"test"` script.

**Frontend:**
- `frontend/utils/calendar.ts` — *(oluştur)* pür tarih/ısı/lane yardımcıları (Nuxt auto-import).
- `frontend/utils/calendar.test.ts` — *(oluştur)* vitest birim testleri.
- `frontend/vitest.config.ts` — *(oluştur)* vitest yapılandırması.
- `frontend/composables/useCalendar.ts` — *(oluştur)* fetch sarmalayıcıları + tipler + hata insancıllaştırma.
- `frontend/components/MonthGrid.vue` — *(oluştur)* A ve B'nin paylaştığı ay ızgarası tabanı.
- `frontend/components/DayTimeline.vue` — *(oluştur)* C zaman ekseni + lane yerleşimi.
- `frontend/components/IndividualCalendar.vue` — *(oluştur)* B; birey sayfasına gömülür.
- `frontend/pages/takvim/index.vue` — *(oluştur)* A ekranı.
- `frontend/pages/takvim/[date].vue` — *(oluştur)* C ekranı.
- `frontend/pages/individual/[uuid].vue` — *(değiştir)* "Devam takvimi" bölümü ekle.
- `frontend/components/AppHeader.vue` — *(değiştir)* takvim ikon-linki.
- `frontend/package.json` — *(değiştir)* `vitest` devDep + `"test"` script.
- `frontend/tailwind.config.js` — *(değiştir)* `content`'e `utils/` + `composables/` ekle (ısı class'ları purge olmasın).

---

## Task 1: Backend — ay-özeti cache + ay genel görünümü (A verisi)

**Files:**
- Modify: `backend/src/services/presence.ts` (PresenceService sınıfının içine, `getMonthlyReport`'tan sonra)
- Create: `backend/src/services/calendar.test.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: `package.json`'a test script ekle**

`backend/package.json` içindeki `"scripts"` bloğunu şu hale getir (yalnız `"test"` satırı eklenir):

```json
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "smoke": "tsx src/smoke-test.ts",
    "test": "tsx src/services/calendar.test.ts"
  },
```

- [ ] **Step 2: Başarısız testi yaz**

Create `backend/src/services/calendar.test.ts`:

```ts
/**
 * Takvim toplama mantığı birim testleri (çevrimdışı — sahte adapter+cache).
 * Çalıştır: npm run test  (backend/ içinde)
 */
import assert from 'node:assert/strict';
import { PresenceService } from './presence.js';
import type { InnovaDailySummary, InnovaIndividual } from '../types/innova.js';

// ─── Sahte veri ───────────────────────────────────────────
function ind(uuid: string, type: number): InnovaIndividual {
  return {
    uuid,
    full_name: `AD-${uuid}`,
    identity_number: '*******1196',
    individual_type: type,
    gender: 'Erkek',
    birth_date: '2015-01-01',
    disability_code: 'X',
  };
}

const META: Record<string, InnovaIndividual> = {
  A: ind('A', 1), // öğrenci
  B: ind('B', 1), // öğrenci
  S: ind('S', 2), // personel
};

// each-individual summary: gün → satırlar
const DAY_SUMMARIES: Record<string, InnovaDailySummary[]> = {
  '2025-03-03': [
    { individual_uuid: 'A', has_manuel_match: false, first_entry: '2025-03-03T09:00:00+03:00', last_exit: '2025-03-03T10:35:00+03:00' }, // 95dk → 2 ders
    { individual_uuid: 'B', has_manuel_match: true,  first_entry: '2025-03-03T09:00:00+03:00', last_exit: '2025-03-03T09:45:00+03:00' }, // 45dk → 1 ders
    { individual_uuid: 'S', has_manuel_match: false, first_entry: '2025-03-03T08:00:00+03:00', last_exit: '2025-03-03T16:00:00+03:00' }, // personel → hariç
  ],
  '2025-03-04': [
    { individual_uuid: 'A', has_manuel_match: false, first_entry: '2025-03-04T09:00:00+03:00', last_exit: '2025-03-04T09:00:00+03:00' }, // sahte çıkış → lastExit null, 0 ders
  ],
};

const fakeAdapter = {
  async getTodayActivitySummary(opts?: { date?: string }) {
    const results = DAY_SUMMARIES[opts?.date ?? ''] ?? [];
    return { count: results.length, next: null, previous: null, results };
  },
};

const fakeCache = {
  async getIndividuals(uuids: string[]) {
    const m = new Map<string, InnovaIndividual>();
    for (const u of uuids) if (META[u]) m.set(u, META[u]);
    return m;
  },
  async getIndividual(uuid: string) {
    if (!META[uuid]) throw new Error('yok');
    return META[uuid];
  },
};

const svc = new PresenceService(fakeAdapter as any, fakeCache as any);

// ─── getCalendarMonth ─────────────────────────────────────
{
  const res = await svc.getCalendarMonth('2025-03');
  assert.equal(res.month, '2025-03');
  assert.equal(res.days.length, 31, 'Mart 31 gün');
  assert.equal(res.days[0].date, '2025-03-01');
  assert.equal(res.days[30].date, '2025-03-31');

  const d3 = res.days.find((d) => d.date === '2025-03-03')!;
  assert.equal(d3.students, 2, 'personel sayıma girmez → 2 öğrenci');
  assert.equal(d3.lessons, 3, '2 + 1 = 3 ders');
  assert.equal(d3.isToday, false);

  const d4 = res.days.find((d) => d.date === '2025-03-04')!;
  assert.equal(d4.students, 1);
  assert.equal(d4.lessons, 0, 'sahte çıkış → süre 0 → 0 ders');

  const d1 = res.days.find((d) => d.date === '2025-03-01')!;
  assert.equal(d1.students, 0);
  assert.equal(d1.lessons, 0);
  console.log('✓ getCalendarMonth');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✓ Task 1 testleri geçti');
```

- [ ] **Step 3: Testi çalıştır, başarısız olduğunu gör**

Run: `cd backend && npm test`
Expected: FAIL — `svc.getCalendarMonth is not a function` (henüz yazılmadı).

- [ ] **Step 4: Tipleri ve metodları ekle**

`backend/src/services/presence.ts` içinde, `PresenceService` sınıfının **dışında** (ör. `WeekStats` arayüzünün altına) şu tipleri ekle:

```ts
export interface CalendarMonthDay {
  date: string;       // YYYY-MM-DD (TR günü)
  students: number;   // o gün gelen, individual_type===1 olan benzersiz birey sayısı
  lessons: number;    // o gün öğrencilerin toplam ders sayısı
  isToday: boolean;
}

export interface CalendarMonthPayload {
  month: string;      // YYYY-MM
  today: string;      // YYYY-MM-DD (TR)
  days: CalendarMonthDay[];
}

export interface IndividualMonthDay {
  date: string;
  lessons: number;
  firstEntry: string;
  lastExit: string | null;
  durationMinutes: number | null;
}

export interface IndividualMonthPayload {
  uuid: string;
  month: string;
  fullName: string;
  individualType: number;
  days: IndividualMonthDay[];  // yalnız geldiği günler
}
```

`PresenceService` sınıfının **içine** (mevcut `getMonthlyReport` metodundan sonra) şu private alanı ve metodları ekle:

```ts
  /**
   * Ay-bazlı gün-özeti cache'i. Geçmiş ay → süresiz (veri değişmez);
   * geçerli ay → 60 sn TTL (bugün canlı değişir).
   */
  private monthSummariesCache = new Map<
    string,
    { fetchedAt: number; perDay: Map<string, InnovaDailySummary[]> }
  >();

  private async getMonthSummaries(month: string): Promise<Map<string, InnovaDailySummary[]>> {
    const today = turkishToday();
    const currentMonth = today.slice(0, 7);
    const isPast = month < currentMonth;
    const cached = this.monthSummariesCache.get(month);
    if (cached && (isPast || Date.now() - cached.fetchedAt < 60_000)) {
      return cached.perDay;
    }

    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    const lastDay = new Date(year, monthNum, 0).getDate();

    const dates: string[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${yearStr}-${monthStr.padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      if (dateStr > today) break; // gelecek günler çekilmez
      dates.push(dateStr);
    }

    const summaries = await Promise.all(
      dates.map((date) =>
        this.adapter
          .getTodayActivitySummary({
            pageSize: 200,
            date: isTodayInTurkey(date) ? undefined : date,
          })
          .then((r) => r.results)
          .catch(() => [] as InnovaDailySummary[]),
      ),
    );

    const perDay = new Map<string, InnovaDailySummary[]>();
    dates.forEach((date, i) => perDay.set(date, summaries[i]));
    this.monthSummariesCache.set(month, { fetchedAt: Date.now(), perDay });
    return perDay;
  }

  /**
   * A görünümü: ay içindeki her gün için öğrenci sayısı + ders toplamı.
   * PII içermez (isim yok). Yalnız date <= bugün günler döner.
   */
  async getCalendarMonth(month: string): Promise<CalendarMonthPayload> {
    const perDay = await this.getMonthSummaries(month);
    const today = turkishToday();

    const allUuids = new Set<string>();
    for (const list of perDay.values()) {
      for (const r of list) allUuids.add(r.individual_uuid);
    }
    const individuals = await this.cache.getIndividuals([...allUuids]);

    const days: CalendarMonthDay[] = [];
    const sortedDates = [...perDay.keys()].sort((a, b) => a.localeCompare(b));
    for (const date of sortedDates) {
      const list = perDay.get(date) ?? [];
      let students = 0;
      let lessons = 0;
      for (const r of list) {
        const ind = individuals.get(r.individual_uuid);
        if (!ind || ind.individual_type !== 1) continue; // yalnız öğrenci
        students++;
        const firstEntry = r.first_entry || null;
        let lastExit: string | null = r.last_exit || null;
        if (lastExit && firstEntry && lastExit === firstEntry) lastExit = null;
        if (firstEntry) {
          const reference = lastExit
            ? new Date(lastExit).getTime()
            : new Date(firstEntry).getTime();
          lessons += calculateLessons(firstEntry, lastExit, reference).lessons;
        }
      }
      days.push({ date, students, lessons, isToday: date === today });
    }

    return { month, today, days };
  }
```

> Not: `getMonthSummaries` private `InnovaDailySummary` tipini kullanır — dosya başındaki mevcut `import type { ... InnovaDailySummary ... }` satırında bu tip zaten var (kontrol et; yoksa ekle).

- [ ] **Step 5: Testi çalıştır, geçtiğini gör**

Run: `cd backend && npm test`
Expected: PASS — `✓ getCalendarMonth`, `✓ Task 1 testleri geçti`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/presence.ts backend/src/services/calendar.test.ts backend/package.json
git commit -m "feat(takvim): ay-özeti cache + getCalendarMonth (A verisi)"
```

---

## Task 2: Backend — kişi devam ayı (B verisi)

**Files:**
- Modify: `backend/src/services/presence.ts` (PresenceService içine, `getCalendarMonth`'tan sonra)
- Modify: `backend/src/services/calendar.test.ts` (yeni assert bloğu)

- [ ] **Step 1: Başarısız testi ekle**

`backend/src/services/calendar.test.ts` içinde, `getCalendarMonth` bloğundan sonra ve son `console.log('━━━...')` satırından **önce** şu bloğu ekle:

```ts
// ─── getIndividualMonth ───────────────────────────────────
{
  const res = await svc.getIndividualMonth('A', '2025-03');
  assert.equal(res.uuid, 'A');
  assert.equal(res.fullName, 'AD-A');
  assert.equal(res.individualType, 1);
  assert.equal(res.days.length, 2, 'A yalnız 2 gün geldi');

  const d3 = res.days.find((d) => d.date === '2025-03-03')!;
  assert.equal(d3.lessons, 2);
  assert.equal(d3.durationMinutes, 95);
  assert.equal(d3.lastExit, '2025-03-03T10:35:00+03:00');

  const d4 = res.days.find((d) => d.date === '2025-03-04')!;
  assert.equal(d4.lessons, 0);
  assert.equal(d4.lastExit, null, 'sahte çıkış → null');
  assert.equal(d4.durationMinutes, null);
  console.log('✓ getIndividualMonth');
}
```

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

Run: `cd backend && npm test`
Expected: FAIL — `svc.getIndividualMonth is not a function`.

- [ ] **Step 3: Metodu ekle**

`backend/src/services/presence.ts` içinde, `getCalendarMonth` metodundan sonra:

```ts
  /**
   * B görünümü: tek bireyin ay içinde geldiği günler + ders/süre.
   * Yalnız geldiği günler döner; gelmediği günleri frontend boş bırakır.
   * Yalnız bakılan kişinin maskeli adını taşır — TC/engel kodu yok.
   */
  async getIndividualMonth(uuid: string, month: string): Promise<IndividualMonthPayload> {
    const perDay = await this.getMonthSummaries(month);
    const ind = await this.cache.getIndividual(uuid).catch(() => null);
    const individualType = ind?.individual_type ?? 1;

    const days: IndividualMonthDay[] = [];
    const sortedDates = [...perDay.keys()].sort((a, b) => a.localeCompare(b));
    for (const date of sortedDates) {
      const r = (perDay.get(date) ?? []).find((x) => x.individual_uuid === uuid);
      if (!r) continue; // o gün gelmedi
      const firstEntry = r.first_entry || null;
      if (!firstEntry) continue;
      let lastExit: string | null = r.last_exit || null;
      if (lastExit && lastExit === firstEntry) lastExit = null;

      const durationMinutes = lastExit
        ? Math.max(0, Math.floor((new Date(lastExit).getTime() - new Date(firstEntry).getTime()) / 60000))
        : null;

      let lessons = 0;
      if (individualType === 1) {
        const reference = lastExit
          ? new Date(lastExit).getTime()
          : new Date(firstEntry).getTime();
        lessons = calculateLessons(firstEntry, lastExit, reference).lessons;
      }

      days.push({ date, lessons, firstEntry, lastExit, durationMinutes });
    }

    return {
      uuid,
      month,
      fullName: ind?.full_name ?? '—',
      individualType,
      days,
    };
  }
```

- [ ] **Step 4: Testi çalıştır, geçtiğini gör**

Run: `cd backend && npm test`
Expected: PASS — `✓ getCalendarMonth`, `✓ getIndividualMonth`, `✓ Task 1 testleri geçti`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/presence.ts backend/src/services/calendar.test.ts
git commit -m "feat(takvim): getIndividualMonth (B verisi)"
```

---

## Task 3: Backend — takvim uçları (route)

**Files:**
- Modify: `backend/src/routes/index.ts` (`/api/weekly-comparison` route'undan sonra)

- [ ] **Step 1: Route'ları ekle**

`backend/src/routes/index.ts` içinde, `app.get('/api/weekly-comparison', ...)` bloğundan sonra şunu ekle:

```ts
  // ─── Takvim: ay genel görünümü (A) ────────────────────────
  // `?month=YYYY-MM` opsiyonel — verilmezse bu ay. PII içermez.
  app.get<{ Querystring: { month?: string } }>('/api/calendar/month', async (req, reply) => {
    if (!requireConfig(reply)) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
    const month = req.query?.month ?? today.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return reply.code(400).send({ error: 'month YYYY-MM formatında olmalı' });
    }
    try {
      const data = await presence.getCalendarMonth(month);
      const past = month < today.slice(0, 7);
      reply.header('Cache-Control', past ? 'private, max-age=86400' : 'private, max-age=60');
      return data;
    } catch (err) {
      app.log.error({ err, month }, 'calendar month failed');
      return reply.code(502).send({ error: 'INNOVA bağlantısı kurulamadı' });
    }
  });

  // ─── Takvim: kişi devam ayı (B) ───────────────────────────
  // `?month=YYYY-MM` opsiyonel. Yalnız bakılan kişinin maskeli adını taşır.
  app.get<{ Params: { uuid: string }; Querystring: { month?: string } }>(
    '/api/calendar/individual/:uuid',
    async (req, reply) => {
      if (!requireConfig(reply)) return;
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
      const month = req.query?.month ?? today.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return reply.code(400).send({ error: 'month YYYY-MM formatında olmalı' });
      }
      try {
        const data = await presence.getIndividualMonth(req.params.uuid, month);
        const past = month < today.slice(0, 7);
        reply.header('Cache-Control', past ? 'private, max-age=86400' : 'private, max-age=60');
        return data;
      } catch (err) {
        app.log.error({ err, uuid: req.params.uuid, month }, 'calendar individual failed');
        return reply.code(502).send({ error: 'INNOVA bağlantısı kurulamadı' });
      }
    },
  );
```

- [ ] **Step 2: TypeScript derlemesini doğrula**

Run: `cd backend && npm run build`
Expected: Hatasız derleme (exit 0). `dist/` üretilir.

- [ ] **Step 3: (Opsiyonel, yapılandırılmış BRY varsa) elle doğrula**

Yapılandırılmış BRY ile dev sunucu çalışırken (`npm run dev`), localhost'tan:
```bash
curl -s "http://localhost:8787/api/calendar/month" | head -c 300
```
Expected: `{"month":"...","today":"...","days":[...]}` JSON. (BRY yapılandırılmamışsa 503 `needsSetup` — beklenen.)

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/index.ts
git commit -m "feat(takvim): /api/calendar/month + /api/calendar/individual uçları"
```

---

## Task 4: Frontend — pür util'ler + vitest

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/tailwind.config.js`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/utils/calendar.ts`
- Create: `frontend/utils/calendar.test.ts`

- [ ] **Step 1: vitest'i ekle**

Run: `cd frontend && npm install -D vitest@^2.0.0`

`frontend/package.json` `"scripts"` bloğuna `"test"` ekle:

```json
  "scripts": {
    "dev": "nuxt dev --host 0.0.0.0",
    "build": "nuxt build",
    "generate": "nuxt generate",
    "preview": "nuxt preview --host 0.0.0.0",
    "postinstall": "nuxt prepare",
    "test": "vitest run"
  },
```

- [ ] **Step 2: vitest config oluştur**

Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['utils/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Başarısız testi yaz**

Create `frontend/utils/calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  daysInMonth,
  leadingBlanks,
  monthMatrix,
  shiftMonth,
  isFutureMonth,
  heatLevel,
  assignLanes,
  axisRange,
  isoToTrMinutes,
} from './calendar';

describe('ay matrisi', () => {
  it('daysInMonth', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  it('leadingBlanks — 1 Ocak 2026 Perşembe → 3 boşluk (Pzt başlangıç)', () => {
    expect(leadingBlanks(2026, 1)).toBe(3);
  });

  it('monthMatrix — boşluklar + günler + 7 katı uzunluk', () => {
    const cells = monthMatrix(2026, 1);
    expect(cells.length % 7).toBe(0);
    expect(cells.length).toBe(35);
    expect(cells[0].date).toBeNull();
    expect(cells[2].date).toBeNull();
    expect(cells[3].day).toBe(1);
    expect(cells[3].date).toBe('2026-01-01');
    expect(cells[33].day).toBe(31);
    expect(cells[34].date).toBeNull();
  });
});

describe('ay gezinme', () => {
  it('shiftMonth yıl sınırı', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 2)).toEqual({ year: 2027, month: 2 });
  });

  it('isFutureMonth', () => {
    expect(isFutureMonth(2026, 7, '2026-06-18')).toBe(true);
    expect(isFutureMonth(2026, 6, '2026-06-18')).toBe(false);
    expect(isFutureMonth(2026, 5, '2026-06-18')).toBe(false);
  });
});

describe('ısı seviyesi', () => {
  it('orana göre 0-4', () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(2, 10)).toBe(1);
    expect(heatLevel(3, 10)).toBe(2);
    expect(heatLevel(6, 10)).toBe(3);
    expect(heatLevel(10, 10)).toBe(4);
    expect(heatLevel(5, 0)).toBe(0);
  });
});

describe('zaman çizelgesi', () => {
  it('assignLanes — çakışanlar ayrı şeride', () => {
    const s = [
      { startMin: 540, endMin: 600 },
      { startMin: 570, endMin: 630 },
      { startMin: 600, endMin: 660 },
    ];
    expect(assignLanes(s)).toEqual([0, 1, 0]);
  });

  it('axisRange — en az 08-18, veri taşarsa genişler', () => {
    expect(axisRange([])).toEqual({ startHour: 8, endHour: 18 });
    expect(axisRange([{ startMin: 540, endMin: 600 }])).toEqual({ startHour: 8, endHour: 18 });
    expect(axisRange([{ startMin: 360, endMin: 1200 }])).toEqual({ startHour: 6, endHour: 20 });
  });

  it('isoToTrMinutes — TR saat dilimine çevirir', () => {
    expect(isoToTrMinutes('2026-06-03T09:30:00+03:00')).toBe(570);
    expect(isoToTrMinutes('2026-06-03T06:00:00+00:00')).toBe(540);
  });
});
```

- [ ] **Step 4: Testi çalıştır, başarısız olduğunu gör**

Run: `cd frontend && npm test`
Expected: FAIL — `Failed to resolve import './calendar'` veya fonksiyonlar tanımsız.

- [ ] **Step 5: Util'leri yaz**

Create `frontend/utils/calendar.ts`:

```ts
/**
 * Takvim için pür yardımcılar (Nuxt auto-import).
 * Tarih hesapları UTC tabanlı yapılır (TZ kaymasını önlemek için);
 * gün string'leri her zaman TR günü (YYYY-MM-DD) varsayılır.
 */

export interface MonthCell {
  date: string | null; // YYYY-MM-DD (ay içi günler) ya da null (boşluk)
  day: number | null;
}

const WEEKDAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export function weekdayLabels(): string[] {
  return WEEKDAYS_TR;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Pzt başlangıçlı haftada, ayın 1'inden önceki boş hücre sayısı (0-6). */
export function leadingBlanks(year: number, month: number): number {
  const dow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Paz..6=Cmt
  return (dow + 6) % 7;
}

export function monthMatrix(year: number, month: number): MonthCell[] {
  const lead = leadingBlanks(year, month);
  const total = daysInMonth(year, month);
  const cells: MonthCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= total; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ date, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
  return cells;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isFutureMonth(year: number, month: number, todayStr: string): boolean {
  return monthKey(year, month) > todayStr.slice(0, 7);
}

export function formatMonthTr(year: number, month: number): string {
  const d = new Date(`${monthKey(year, month)}-01T12:00:00+03:00`);
  return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
}

export function formatDayTr(date: string): string {
  const d = new Date(`${date}T12:00:00+03:00`);
  return d.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Istanbul',
  });
}

export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  const r = count / max;
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

/** Statik Tailwind class string'leri (purge için literal olmalı). */
const HEAT_CLASSES: Record<number, string> = {
  0: 'bg-gray-50 dark:bg-gray-800/40 text-gray-400 dark:text-gray-600',
  1: 'bg-brand-50 text-brand',
  2: 'bg-brand-100 text-brand',
  3: 'bg-brand-light text-white',
  4: 'bg-brand text-white',
};
export function heatClasses(level: number): string {
  return HEAT_CLASSES[level] ?? HEAT_CLASSES[0];
}

/** ISO zaman → gün içi TR dakika (00:00'dan itibaren). */
export function isoToTrMinutes(iso: string): number {
  const s = new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Istanbul',
  });
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** Çakışan seansları en az sayıda şeride (lane) yerleştir; giriş sırasına göre indeks başına lane no döner. */
export function assignLanes(sessions: Array<{ startMin: number; endMin: number }>): number[] {
  const order = sessions
    .map((_, i) => i)
    .sort((a, b) => sessions[a].startMin - sessions[b].startMin || sessions[a].endMin - sessions[b].endMin);
  const laneEnds: number[] = [];
  const lanes: number[] = new Array(sessions.length).fill(0);
  for (const i of order) {
    let placed = false;
    for (let l = 0; l < laneEnds.length; l++) {
      if (sessions[i].startMin >= laneEnds[l]) {
        lanes[i] = l;
        laneEnds[l] = sessions[i].endMin;
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes[i] = laneEnds.length;
      laneEnds.push(sessions[i].endMin);
    }
  }
  return lanes;
}

/** Eksen aralığı — en az 08-18, veri dışına taşarsa genişler (saat cinsinden). */
export function axisRange(sessions: Array<{ startMin: number; endMin: number }>): { startHour: number; endHour: number } {
  if (sessions.length === 0) return { startHour: 8, endHour: 18 };
  let minM = Infinity;
  let maxM = -Infinity;
  for (const s of sessions) {
    if (s.startMin < minM) minM = s.startMin;
    if (s.endMin > maxM) maxM = s.endMin;
  }
  const startHour = Math.max(0, Math.min(8, Math.floor(minM / 60)));
  const endHour = Math.min(24, Math.max(18, Math.ceil(maxM / 60)));
  return { startHour, endHour };
}

/** C zaman çizelgesi seans bloğu. (Vue `<script setup>` export edemediği için tip burada.) */
export interface SessionInput {
  uuid: string;
  name: string;   // maskeli
  type: number;
  startMin: number;
  endMin: number;
  ongoing: boolean;
  lessons: number;
}
```

- [ ] **Step 6: Testi çalıştır, geçtiğini gör**

Run: `cd frontend && npm test`
Expected: PASS — tüm testler yeşil.

- [ ] **Step 7: Tailwind content'e utils + composables ekle**

`frontend/tailwind.config.js` `content` dizisini şu hale getir (ısı renkleri `utils/calendar.ts` içindeki literal class string'lerinde olduğu için Tailwind'in bu klasörü taraması şart — yoksa purge edilir):

```js
  content: [
    './components/**/*.{vue,js,ts}',
    './composables/**/*.{js,ts}',
    './utils/**/*.{js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './app.vue',
  ],
```

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/utils/calendar.ts frontend/utils/calendar.test.ts frontend/tailwind.config.js
git commit -m "feat(takvim): pür takvim util'leri + vitest + tailwind content"
```

---

## Task 5: Frontend — useCalendar composable

**Files:**
- Create: `frontend/composables/useCalendar.ts`

- [ ] **Step 1: Composable'ı yaz**

Create `frontend/composables/useCalendar.ts`:

```ts
/**
 * Takvim uçlarına fetch sarmalayıcıları.
 * useBkds'ten backendUrl + authHeaders'ı kullanır (anasayfayla aynı auth modeli).
 */

export interface CalendarMonthDay {
  date: string;
  students: number;
  lessons: number;
  isToday: boolean;
}
export interface CalendarMonthPayload {
  month: string;
  today: string;
  days: CalendarMonthDay[];
}
export interface IndividualMonthDay {
  date: string;
  lessons: number;
  firstEntry: string;
  lastExit: string | null;
  durationMinutes: number | null;
}
export interface IndividualMonthPayload {
  uuid: string;
  month: string;
  fullName: string;
  individualType: number;
  days: IndividualMonthDay[];
}

export const useCalendar = () => {
  const { backendUrl, authHeaders } = useBkds();

  const fetchMonth = (month: string) =>
    $fetch<CalendarMonthPayload>(`${backendUrl}/api/calendar/month`, {
      query: { month },
      headers: authHeaders(),
    });

  const fetchIndividualMonth = (uuid: string, month: string) =>
    $fetch<IndividualMonthPayload>(`${backendUrl}/api/calendar/individual/${uuid}`, {
      query: { month },
      headers: authHeaders(),
    });

  /** Fetch hatasını insancıl Türkçe mesaja çevir (anasayfadaki desenle uyumlu). */
  const humanizeError = (e: any): string => {
    const status = e?.response?.status ?? e?.statusCode;
    const be = e?.data?.error;
    if (status === 502) return be ?? 'BRY sunucusuna ulaşılamıyor. Sunucu açık mı, aynı ağda mısınız?';
    if (status === 503) return 'BRY yapılandırılmamış.';
    if (status === 401) return 'Cihaz eşleştirmesi gerekli.';
    return be ?? e?.message ?? 'Beklenmedik bir hata oluştu';
  };

  return { fetchMonth, fetchIndividualMonth, humanizeError };
};
```

- [ ] **Step 2: Derleme/sözdizimi doğrula**

Run: `cd frontend && npx vue-tsc --noEmit composables/useCalendar.ts 2>/dev/null || echo "vue-tsc yok — Task 10 build'inde doğrulanacak"`
Expected: Hata yoksa sessiz; vue-tsc kurulu değilse not basılır (sorun değil, nihai `nuxt build` doğrular).

- [ ] **Step 3: Commit**

```bash
git add frontend/composables/useCalendar.ts
git commit -m "feat(takvim): useCalendar composable"
```

---

## Task 6: Frontend — MonthGrid bileşeni

**Files:**
- Create: `frontend/components/MonthGrid.vue`

- [ ] **Step 1: Bileşeni yaz**

Create `frontend/components/MonthGrid.vue`:

```vue
<script setup lang="ts">
/**
 * Ay ızgarası tabanı — A ve B'nin paylaştığı sunum bileşeni.
 * Hücre içeriğini parent `#cell` slot'u ile verir; ay durumunu parent tutar.
 */
const props = defineProps<{
  year: number;
  month: number;
  today: string; // YYYY-MM-DD (TR)
}>();

const emit = defineEmits<{ (e: 'prev'): void; (e: 'next'): void }>();

const weekdays = weekdayLabels();
const cells = computed(() => monthMatrix(props.year, props.month));
const label = computed(() => formatMonthTr(props.year, props.month));
const nextDisabled = computed(() => {
  const n = shiftMonth(props.year, props.month, 1);
  return isFutureMonth(n.year, n.month, props.today);
});
</script>

<template>
  <div>
    <div class="px-4 flex items-center justify-between mb-3">
      <button
        type="button"
        class="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label="Önceki ay"
        @click="emit('prev')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <span class="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{{ label }}</span>
      <button
        type="button"
        :disabled="nextDisabled"
        class="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:hover:bg-gray-100 dark:disabled:hover:bg-gray-800"
        aria-label="Sonraki ay"
        @click="emit('next')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>

    <div class="px-4">
      <div class="grid grid-cols-7 gap-1 mb-1">
        <div v-for="w in weekdays" :key="w" class="text-center text-[11px] text-gray-400 dark:text-gray-500">
          {{ w }}
        </div>
      </div>
      <div class="grid grid-cols-7 gap-1">
        <template v-for="(cell, i) in cells" :key="i">
          <div v-if="!cell.date" />
          <slot
            v-else
            name="cell"
            :cell="cell"
            :is-today="cell.date === today"
            :is-future="cell.date > today"
            :is-weekend="i % 7 >= 5"
          />
        </template>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/MonthGrid.vue
git commit -m "feat(takvim): MonthGrid bileşeni"
```

---

## Task 7: Frontend — A ekranı (`/takvim`) + AppHeader linki

**Files:**
- Create: `frontend/pages/takvim/index.vue`
- Modify: `frontend/components/AppHeader.vue`

- [ ] **Step 1: AppHeader'a takvim ikonu ekle**

`frontend/components/AppHeader.vue` içinde, `<NuxtLink to="/istatistik" ...>` bloğunun **önüne** şunu ekle:

```vue
        <NuxtLink
          to="/takvim"
          class="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
          aria-label="Seans Takvimi"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>
          </svg>
        </NuxtLink>
```

- [ ] **Step 2: A sayfasını yaz**

Create `frontend/pages/takvim/index.vue`:

```vue
<script setup lang="ts">
import type { CalendarMonthPayload, CalendarMonthDay } from '~/composables/useCalendar';

const { fetchMonth, humanizeError } = useCalendar();

const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
const [ty, tm] = todayStr.split('-').map(Number);
const year = ref(ty);
const month = ref(tm);

const data = ref<CalendarMonthPayload | null>(null);
const pending = ref(false);
const error = ref<string | null>(null);

const dayMap = computed(() => {
  const m = new Map<string, CalendarMonthDay>();
  data.value?.days.forEach((d) => m.set(d.date, d));
  return m;
});
const maxStudents = computed(() =>
  Math.max(1, ...(data.value?.days.map((d) => d.students) ?? [0])),
);

async function load() {
  pending.value = true;
  error.value = null;
  try {
    data.value = await fetchMonth(monthKey(year.value, month.value));
  } catch (e: any) {
    error.value = humanizeError(e);
  } finally {
    pending.value = false;
  }
}

function go(delta: number) {
  const s = shiftMonth(year.value, month.value, delta);
  if (delta > 0 && isFutureMonth(s.year, s.month, todayStr)) return;
  year.value = s.year;
  month.value = s.month;
  load();
}

onMounted(load);
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 pb-8">
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 pt-[env(safe-area-inset-top)]">
      <div class="px-4 py-3 flex items-center gap-3">
        <NuxtLink to="/" class="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800" aria-label="Geri">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </NuxtLink>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">BRY Takip</p>
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100">Seans Takvimi</h1>
        </div>
      </div>
    </header>

    <div class="mt-4">
      <MonthGrid :year="year" :month="month" :today="todayStr" @prev="go(-1)" @next="go(1)">
        <template #cell="{ cell, isToday, isFuture, isWeekend }">
          <component
            :is="isFuture ? 'div' : NuxtLink"
            :to="isFuture ? undefined : `/takvim/${cell.date}`"
            class="aspect-square rounded-lg flex flex-col items-center justify-center select-none"
            :class="[
              isFuture
                ? 'bg-transparent text-gray-300 dark:text-gray-700'
                : heatClasses(heatLevel(dayMap.get(cell.date!)?.students ?? 0, maxStudents)),
              isToday ? 'ring-2 ring-brand ring-offset-1 dark:ring-offset-gray-900' : '',
              isWeekend && !dayMap.get(cell.date!)?.students ? 'opacity-60' : '',
            ]"
          >
            <span class="text-[10px] leading-none opacity-70">{{ cell.day }}</span>
            <span v-if="!isFuture && dayMap.get(cell.date!)?.students" class="text-sm font-semibold leading-tight mt-0.5">
              {{ dayMap.get(cell.date!)!.students }}
            </span>
          </component>
        </template>
      </MonthGrid>
    </div>

    <!-- Lejant -->
    <div class="px-4 mt-4 flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
      <span>az</span>
      <span class="w-4 h-3 rounded-sm bg-brand-50" />
      <span class="w-4 h-3 rounded-sm bg-brand-100" />
      <span class="w-4 h-3 rounded-sm bg-brand-light" />
      <span class="w-4 h-3 rounded-sm bg-brand" />
      <span>çok</span>
      <span class="ml-auto">öğrenci / gün</span>
    </div>

    <!-- Durumlar -->
    <div v-if="pending && !data" class="px-4 mt-4">
      <div class="grid grid-cols-7 gap-1">
        <div v-for="i in 35" :key="i" class="aspect-square rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    </div>
    <div v-else-if="error" class="mx-4 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
      <p class="font-medium">Takvim yüklenemedi</p>
      <p class="text-[11px] mt-0.5 opacity-80">{{ error }}</p>
      <button class="underline mt-1" @click="load">Tekrar dene</button>
    </div>
  </div>
</template>
```

> Not: `<component :is>` ile NuxtLink kullanımı için script'te `NuxtLink`'i çözülebilir kılmak gerekir. Nuxt'ta `NuxtLink` global bir bileşendir; `<component :is="NuxtLink">` için script setup'ta `const NuxtLink = resolveComponent('NuxtLink')` ekle. Bunu `<script setup>` sonuna ekle:

```ts
const NuxtLink = resolveComponent('NuxtLink');
```

- [ ] **Step 3: Preview ile doğrula**

Dev sunucuyu başlat (preview aracıyla) ve `/takvim`'e git. Doğrula:
- Hafta başlıkları Pzt→Paz, ay etiketi doğru, ‹ › ile ay değişiyor, sonraki ay (gelecek) butonu pasif.
- Yapılandırılmış BRY varsa: dolu günler ısı rengiyle + öğrenci sayısıyla görünür; bir güne dokununca `/takvim/<tarih>`'e gider.
- BRY yoksa: hata kutusu Türkçe görünür (çökme yok).
- Dark mode'da okunur (preview_resize ile veya tema toggle).

- [ ] **Step 4: Commit**

```bash
git add frontend/pages/takvim/index.vue frontend/components/AppHeader.vue
git commit -m "feat(takvim): A ay ısı haritası ekranı + AppHeader linki"
```

---

## Task 8: Frontend — C gün zaman çizelgesi (`/takvim/[date]`)

**Files:**
- Create: `frontend/components/DayTimeline.vue`
- Create: `frontend/pages/takvim/[date].vue`

- [ ] **Step 1: DayTimeline bileşenini yaz**

Create `frontend/components/DayTimeline.vue`:

```vue
<script setup lang="ts">
/**
 * Tek günün seans zaman çizelgesi. Her seans giriş→çıkış bloğu;
 * çakışanlar yan şeritlerde. Bloğa dokun → birey sayfası.
 */
import type { SessionInput } from '~/utils/calendar';

const props = defineProps<{ sessions: SessionInput[] }>();
const { initials } = useFormatters();

const HOUR_HEIGHT = 54; // px
const lanes = computed(() => assignLanes(props.sessions));
const range = computed(() => axisRange(props.sessions));
const laneCount = computed(() => Math.max(1, ...lanes.value.map((l) => l + 1)));
const totalHeight = computed(() => (range.value.endHour - range.value.startHour) * HOUR_HEIGHT);
const hours = computed(() => {
  const out: number[] = [];
  for (let h = range.value.startHour; h <= range.value.endHour; h++) out.push(h);
  return out;
});

function topPx(s: SessionInput): number {
  return ((s.startMin - range.value.startHour * 60) / 60) * HOUR_HEIGHT;
}
function heightPx(s: SessionInput): number {
  return Math.max(20, ((s.endMin - s.startMin) / 60) * HOUR_HEIGHT);
}
function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
</script>

<template>
  <div v-if="sessions.length === 0" class="mx-4 p-6 bg-gray-50 dark:bg-gray-800 rounded-xl text-center text-sm text-gray-500 dark:text-gray-400">
    Bu gün hareket kaydı yok
  </div>

  <div v-else class="px-4 flex gap-2" :style="{ height: totalHeight + 'px' }">
    <!-- Saat ekseni -->
    <div class="relative w-10 flex-none">
      <div
        v-for="h in hours"
        :key="h"
        class="absolute right-1 text-[10px] text-gray-400 dark:text-gray-500 -translate-y-1/2"
        :style="{ top: ((h - range.startHour) * HOUR_HEIGHT) + 'px' }"
      >
        {{ String(h).padStart(2, '0') }}:00
      </div>
    </div>

    <!-- Şeritler -->
    <div class="relative flex-1">
      <!-- Saat çizgileri -->
      <div
        v-for="h in hours"
        :key="'l' + h"
        class="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-800"
        :style="{ top: ((h - range.startHour) * HOUR_HEIGHT) + 'px' }"
      />
      <!-- Seans blokları -->
      <NuxtLink
        v-for="(s, i) in sessions"
        :key="s.uuid + i"
        :to="`/individual/${s.uuid}`"
        class="absolute rounded-md px-1.5 py-1 overflow-hidden border bg-brand-50 border-brand-100 active:opacity-80"
        :style="{
          top: topPx(s) + 'px',
          height: heightPx(s) + 'px',
          left: `calc(${(lanes[i] / laneCount) * 100}% + 2px)`,
          width: `calc(${100 / laneCount}% - 4px)`,
        }"
      >
        <p class="text-[11px] font-medium text-brand leading-tight truncate">{{ s.name }}</p>
        <p class="text-[10px] text-brand/80 leading-tight truncate">
          {{ fmt(s.startMin) }}<span v-if="!s.ongoing">–{{ fmt(s.endMin) }}</span><span v-else> · sürüyor</span>
          <span v-if="s.type === 1"> · {{ s.lessons }} ders</span>
        </p>
      </NuxtLink>
    </div>
  </div>
</template>
```

> Not: `initials` import edildi ama mevcut tasarımda blok maskeli tam adı gösteriyor; `initials` ileride dar bloklar için kullanılabilir. Kullanılmazsa import satırını sil (lint temizliği). Şimdilik blok adı `s.name` gösteriyor.

- [ ] **Step 2: C sayfasını yaz**

Create `frontend/pages/takvim/[date].vue`:

```vue
<script setup lang="ts">
import { lessonsFromMinutes } from '~/composables/useLessons';
import type { Snapshot } from '~/composables/useBkds';
import type { SessionInput } from '~/utils/calendar';

const route = useRoute();
const { backendUrl, authHeaders } = useBkds();

const date = computed(() => route.params.date as string);
const valid = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(date.value));
const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
const isToday = computed(() => date.value === todayStr);

const snap = ref<Snapshot | null>(null);
const pending = ref(false);
const error = ref<string | null>(null);

async function load() {
  if (!valid.value) {
    error.value = 'Geçersiz tarih';
    return;
  }
  pending.value = true;
  error.value = null;
  try {
    snap.value = await $fetch<Snapshot>(`${backendUrl}/api/snapshot?date=${date.value}`, {
      headers: authHeaders(),
    });
  } catch (e: any) {
    const status = e?.response?.status ?? e?.statusCode;
    error.value =
      status === 502
        ? (e?.data?.error ?? 'BRY sunucusuna ulaşılamıyor.')
        : (e?.data?.error ?? e?.message ?? 'Gün yüklenemedi');
  } finally {
    pending.value = false;
  }
}

const sessions = computed<SessionInput[]>(() => {
  const list = snap.value?.presence ?? [];
  return list
    .filter((p) => p.firstEntry)
    .map((p) => {
      const ongoing = !p.lastExit;
      const endIso = p.lastExit
        ? p.lastActivity.activity_time
        : isToday.value
          ? new Date().toISOString()
          : p.lastActivity.activity_time;
      const startMin = isoToTrMinutes(p.firstEntry!);
      const endMin = Math.max(startMin + 5, isoToTrMinutes(endIso));
      const lessons = p.individual.individual_type === 1
        ? lessonsFromMinutes(Math.max(0, endMin - startMin)).lessons
        : 0;
      return {
        uuid: p.individual.uuid,
        name: p.individual.full_name,
        type: p.individual.individual_type,
        startMin,
        endMin,
        ongoing,
        lessons,
      };
    });
});

const studentCount = computed(() => sessions.value.filter((s) => s.type === 1).length);
const lessonTotal = computed(() => sessions.value.reduce((sum, s) => sum + s.lessons, 0));

onMounted(load);
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900 pb-8">
    <header class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 pt-[env(safe-area-inset-top)]">
      <div class="px-4 py-3 flex items-center gap-3">
        <NuxtLink to="/takvim" class="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800" aria-label="Takvime dön">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </NuxtLink>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Gün</p>
          <h1 class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate capitalize">
            {{ valid ? formatDayTr(date) : 'Geçersiz tarih' }}
          </h1>
        </div>
      </div>
    </header>

    <div v-if="snap" class="px-4 mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
      <span><strong class="text-gray-900 dark:text-gray-100">{{ studentCount }}</strong> öğrenci</span>
      <span><strong class="text-gray-900 dark:text-gray-100">{{ lessonTotal }}</strong> ders</span>
    </div>

    <div v-if="pending && !snap" class="px-4 mt-4 space-y-2">
      <div v-for="i in 6" :key="i" class="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
    </div>
    <div v-else-if="error" class="mx-4 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
      <p class="font-medium">Gün yüklenemedi</p>
      <p class="text-[11px] mt-0.5 opacity-80">{{ error }}</p>
      <button class="underline mt-1" @click="load">Tekrar dene</button>
    </div>
    <div v-else-if="snap" class="mt-4">
      <DayTimeline :sessions="sessions" />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Preview ile doğrula**

`/takvim`'den bir güne dokun (veya doğrudan `/takvim/<bilinen-tarih>`'e git). Doğrula:
- Üstte gün başlığı + "N öğrenci · M ders".
- Saat ekseni soldan, seans blokları doğru saatlerde; çakışan seanslar yan yana (lane).
- Bloğa dokununca `/individual/<uuid>`'a gider.
- Veri yoksa "Bu gün hareket kaydı yok"; hata Türkçe.
- Mobil genişlikte (preview_resize ~380px) okunur.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/DayTimeline.vue frontend/pages/takvim/[date].vue
git commit -m "feat(takvim): C gün zaman çizelgesi ekranı"
```

---

## Task 9: Frontend — B kişi devam takvimi (birey sayfasında)

**Files:**
- Create: `frontend/components/IndividualCalendar.vue`
- Modify: `frontend/pages/individual/[uuid].vue`

- [ ] **Step 1: IndividualCalendar bileşenini yaz**

Create `frontend/components/IndividualCalendar.vue`:

```vue
<script setup lang="ts">
/**
 * B — tek bireyin ay devam takvimi. Geldiği günler ders rozetiyle dolu,
 * gelmediği (geçmiş hafta içi) günler kesik çizgili.
 */
import type { IndividualMonthPayload, IndividualMonthDay } from '~/composables/useCalendar';

const props = defineProps<{ uuid: string }>();
const { fetchIndividualMonth, humanizeError } = useCalendar();

const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
const [ty, tm] = todayStr.split('-').map(Number);
const year = ref(ty);
const month = ref(tm);

const data = ref<IndividualMonthPayload | null>(null);
const pending = ref(false);
const error = ref<string | null>(null);

const dayMap = computed(() => {
  const m = new Map<string, IndividualMonthDay>();
  data.value?.days.forEach((d) => m.set(d.date, d));
  return m;
});
const attendedCount = computed(() => data.value?.days.length ?? 0);
const lessonTotal = computed(() => data.value?.days.reduce((s, d) => s + d.lessons, 0) ?? 0);

async function load() {
  pending.value = true;
  error.value = null;
  try {
    data.value = await fetchIndividualMonth(props.uuid, monthKey(year.value, month.value));
  } catch (e: any) {
    error.value = humanizeError(e);
  } finally {
    pending.value = false;
  }
}

function go(delta: number) {
  const s = shiftMonth(year.value, month.value, delta);
  if (delta > 0 && isFutureMonth(s.year, s.month, todayStr)) return;
  year.value = s.year;
  month.value = s.month;
  load();
}

watch(() => props.uuid, load);
onMounted(load);
</script>

<template>
  <section class="mt-5">
    <div class="px-4 mb-2 flex items-center justify-between">
      <h2 class="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
        Devam takvimi
      </h2>
      <span v-if="data" class="text-[11px] text-gray-400 dark:text-gray-500">
        {{ attendedCount }} gün · {{ lessonTotal }} ders
      </span>
    </div>

    <MonthGrid :year="year" :month="month" :today="todayStr" @prev="go(-1)" @next="go(1)">
      <template #cell="{ cell, isToday, isFuture, isWeekend }">
        <div
          class="aspect-square rounded-lg flex flex-col items-center justify-center select-none"
          :class="[
            dayMap.get(cell.date!)
              ? 'bg-brand-50 text-brand'
              : isFuture
                ? 'text-gray-300 dark:text-gray-700'
                : isWeekend
                  ? 'text-gray-300 dark:text-gray-600'
                  : 'border border-dashed border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600',
            isToday ? 'ring-2 ring-brand ring-offset-1 dark:ring-offset-gray-900' : '',
          ]"
        >
          <span class="text-[10px] leading-none opacity-70">{{ cell.day }}</span>
          <span v-if="dayMap.get(cell.date!)" class="text-[10px] font-semibold leading-tight mt-0.5">
            {{ dayMap.get(cell.date!)!.lessons }}d
          </span>
          <span v-else-if="!isFuture && !isWeekend" class="text-[10px] leading-tight mt-0.5">—</span>
        </div>
      </template>
    </MonthGrid>

    <div v-if="pending && !data" class="px-4 mt-3 grid grid-cols-7 gap-1">
      <div v-for="i in 35" :key="i" class="aspect-square rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
    </div>
    <div v-else-if="error" class="mx-4 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
      {{ error }}
      <button class="underline ml-2" @click="load">Tekrar dene</button>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Birey sayfasına bölümü göm**

`frontend/pages/individual/[uuid].vue` içinde, "Bugünkü aktiviteler" `<section>`'ından **önce** (yani `<!-- Bugünkü aktiviteler -->` yorumunun hemen üstüne) şunu ekle:

```vue
      <!-- Devam takvimi (B) -->
      <IndividualCalendar :uuid="uuid" />

```

- [ ] **Step 3: Preview ile doğrula**

Bir birey sayfasına git (`/individual/<uuid>` — C'deki bir bloktan ya da bireyler listesinden). Doğrula:
- "Devam takvimi" bölümü görünür; üstte "X gün · Y ders".
- Geldiği günler dolu + ders rozeti; gelmediği hafta içi günler kesik çizgili "—"; hafta sonu/gelecek soluk.
- Ay ‹ › ile değişiyor, gelecek ay pasif.
- Farklı bireye geçince (`watch uuid`) yeniden yükleniyor.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/IndividualCalendar.vue frontend/pages/individual/[uuid].vue
git commit -m "feat(takvim): B kişi devam takvimi (birey sayfasına gömülü)"
```

---

## Task 10: Bütünleşik doğrulama + derleme

**Files:** (yalnız doğrulama; kod değişikliği yoksa düzeltme yap)

- [ ] **Step 1: Birim testlerinin tümünü çalıştır**

Run: `cd backend && npm test`
Expected: PASS (getCalendarMonth + getIndividualMonth).

Run: `cd frontend && npm test`
Expected: PASS (tüm util testleri).

- [ ] **Step 2: Üretim derlemesi (typecheck dahil)**

Run: `cd backend && npm run build`
Expected: Hatasız (tsc).

Run: `cd frontend && npm run build`
Expected: Hatasız (Nuxt build — template/TS hatalarını yakalar).

> Derleme TS/template hatası verirse ilgili task'a dön, düzelt, yeniden derle.

- [ ] **Step 3: Uçtan uca akışı preview ile doğrula (yapılandırılmış BRY ile)**

Dev sunucu + yapılandırılmış BRY ile:
- Anasayfa header'ında takvim ikonu → `/takvim` (A).
- A: ay ısı haritası doğru sayıları gösteriyor; ay gezinme çalışıyor; gelecek ay pasif.
- A'da bir güne dokun → C: o günün seans blokları, çakışmalar yan yana, özet sayılar doğru.
- C'de bir bloğa dokun → birey sayfası → "Devam takvimi" (B) o bireyin ayını gösteriyor.
- Geri navigasyonu (B→C→A) doğal çalışıyor.

- [ ] **Step 4: Responsive + dark mode**

- preview_resize ile ~380px (telefon) ve ~768px: üç görünüm de okunur, taşma yok.
- Dark mode: ısı renkleri, bloklar, kesik çizgili hücreler ve metin kontrastı okunur.

- [ ] **Step 5: KVKK sözleşme kontrolü (elle)**

Yapılandırılmış BRY ile:
```bash
curl -s "http://localhost:8787/api/calendar/month" | grep -o "identity_number\|disability_code" || echo "✓ ay ucunda PII yok"
```
Expected: `✓ ay ucunda PII yok` (ay ucu isim/TC/engel kodu taşımaz).

- [ ] **Step 6: Bilinen kısıt notunu doğrula**

Tasarım belgesindeki kısıtların kodla tutarlı olduğunu teyit et: ay ucu `date <= today` döner (gelecek gün yok); `students` yalnız `individual_type===1`; ay cache geçmiş ay süresiz / geçerli ay 60 sn. (Bunlar Task 1-3 testleri + route Cache-Control ile sağlanır.)

---

## Self-Review (plan yazarı tarafından tamamlandı)

- **Spec kapsamı:** A → Task 1,4,6,7; C → Task 2(snapshot mevcut),8; B → Task 2,9; navigasyon/AppHeader → Task 7,8,9; veri katmanı + cache → Task 1,2,3; KVKK minimum PII → Task 1,2,3 + Task 10 Step 5; durumlar (yükleniyor/boş/hata) → Task 7,8,9; mobile/dark → Task 10. Tüm spec maddeleri bir task'a bağlandı.
- **Placeholder taraması:** "TBD/TODO" yok; her kod adımı tam kod içerir.
- **Tip tutarlılığı:** `CalendarMonthPayload/CalendarMonthDay/IndividualMonthPayload/IndividualMonthDay` backend (presence.ts) ve frontend (useCalendar.ts) arasında birebir aynı alanlarla tanımlı; `SessionInput` DayTimeline'da export edilip [date].vue'de import ediliyor; `assignLanes/axisRange/heatLevel/monthMatrix/shiftMonth/isFutureMonth/monthKey/isoToTrMinutes/formatDayTr/formatMonthTr/weekdayLabels/heatClasses` util'leri tanımlandıkları yerde (calendar.ts) mevcut ve kullanım yerlerinde auto-import.
```
