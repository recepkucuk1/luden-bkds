/**
 * MEB özel eğitim ders saati hesaplamaları
 *
 * MEB ödeneği bireyin kurumda geçirdiği süreye göre ders sayısı olarak hesaplanır:
 *  - 0-39 dk    → 0 ders (ödenek yok)
 *  - 40-89 dk   → 1 ders (40 dk)
 *  - 90-139 dk  → 2 ders (40+10+40)
 *  - 140+ dk    → 3 ders (40+10+40+10+40, MAX)
 *
 * Aralarda 10 dakika teneffüs olduğu varsayılır.
 */

export interface LessonResult {
  lessons: 0 | 1 | 2 | 3;
  totalMinutes: number;
  isOngoing: boolean;
  minutesToNextLesson: number | null;
}

const LESSON_THRESHOLDS = [40, 90, 140] as const;

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

  let minutesToNextLesson: number | null = null;
  if (lessons < 3) {
    const nextThreshold = LESSON_THRESHOLDS[lessons];
    minutesToNextLesson = nextThreshold - totalMinutes;
  }

  return {
    lessons,
    totalMinutes,
    isOngoing: !lastExit,
    minutesToNextLesson,
  };
}

/**
 * "9s 58dk" / "58dk" / "0dk" gibi kompakt format
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return '0dk';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}dk`;
  if (m === 0) return `${h}s`;
  return `${h}s ${m}dk`;
}

/**
 * Aktivite listesinden ilk giriş ve son çıkışı çıkar.
 * (Aktivite tipi entry/exit, activity_time ISO string)
 */
export function extractDayBookends(
  activities: Array<{ activity_type: 'entry' | 'exit'; activity_time: string }>,
): { firstEntry: string | null; lastExit: string | null } {
  if (activities.length === 0) return { firstEntry: null, lastExit: null };

  // Sort ASC by time (eski → yeni)
  const sorted = [...activities].sort((a, b) =>
    a.activity_time.localeCompare(b.activity_time),
  );

  const firstEntry = sorted.find((a) => a.activity_type === 'entry')?.activity_time ?? null;

  // Son aktivite — eğer entry ise hâlâ içeride
  const last = sorted[sorted.length - 1];
  const lastExit = last.activity_type === 'exit' ? last.activity_time : null;

  return { firstEntry, lastExit };
}
