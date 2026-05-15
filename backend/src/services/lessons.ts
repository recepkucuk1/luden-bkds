/**
 * MEB özel eğitim ders saati hesaplaması.
 *
 * Bireyin kurumda geçirdiği süreye göre ders sayısı:
 *   0-39 dk    → 0 ders (ödenek yok)
 *   40-89 dk   → 1 ders (40 dk)
 *   90-139 dk  → 2 ders (40+10+40, aralarda 10 dk teneffüs)
 *   140+ dk    → 3 ders (max)
 *
 * Frontend useLessons.ts ile aynı mantık — backend rapor üretiminde de gerekli
 * olduğu için port edildi. Değişirse iki dosyayı da güncelle.
 */

export interface LessonResult {
  lessons: 0 | 1 | 2 | 3;
  totalMinutes: number;
}

export function calculateLessons(
  firstEntry: string,
  lastExit: string | null,
  now: number = Date.now(),
): LessonResult {
  const startMs = new Date(firstEntry).getTime();
  const endMs = lastExit ? new Date(lastExit).getTime() : now;
  const totalMinutes = Math.max(0, Math.floor((endMs - startMs) / 60000));

  let lessons: 0 | 1 | 2 | 3 = 0;
  if (totalMinutes >= 140) lessons = 3;
  else if (totalMinutes >= 90) lessons = 2;
  else if (totalMinutes >= 40) lessons = 1;

  return { lessons, totalMinutes };
}
