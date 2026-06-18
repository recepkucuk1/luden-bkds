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
