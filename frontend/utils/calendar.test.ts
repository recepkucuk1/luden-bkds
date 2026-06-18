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
