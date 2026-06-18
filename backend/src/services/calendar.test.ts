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
