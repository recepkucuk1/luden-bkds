/**
 * MEB özel eğitim ders saati hesaplaması.
 *
 * Bireyin kurumda <strong>fiilen içeride geçirdiği süreye</strong> göre ders sayısı:
 *   0-39 dk    → 0 ders (ödenek yok)
 *   40-89 dk   → 1 ders (40 dk)
 *   90-139 dk  → 2 ders (40+10+40, aralarda 10 dk teneffüs)
 *   140+ dk    → 3 ders (max)
 *
 * ÖNEMLİ: "İçeride süre" = giriş-çıkış çiftleri toplamı (ara çıkışlar HARİÇ).
 * Örnek: 09:00 entry → 12:00 exit → 13:00 entry → 15:00 exit
 *   firstEntry-lastExit = 6 saat  ❌ (öğle arası dahil, yanlış)
 *   insideMinutes      = 5 saat  ✅ (gerçek içeride süre)
 *
 * computeInsideMinutes() entry→exit çiftlerini eşleyip toplar.
 *
 * Frontend useLessons.ts ile aynı mantık — değişirse iki dosyayı da güncelle.
 */

export interface LessonResult {
  lessons: 0 | 1 | 2 | 3;
  totalMinutes: number;
}

/**
 * Ders sayısını dakikadan hesapla. (Tercih edilen yeni API)
 */
export function lessonsFromMinutes(minutes: number): LessonResult {
  const totalMinutes = Math.max(0, Math.floor(minutes));
  let lessons: 0 | 1 | 2 | 3 = 0;
  if (totalMinutes >= 140) lessons = 3;
  else if (totalMinutes >= 90) lessons = 2;
  else if (totalMinutes >= 40) lessons = 1;
  return { lessons, totalMinutes };
}

/**
 * Eski API — firstEntry-lastExit arası tek aralık. Geriye dönük uyumluluk
 * için bırakıldı; tercih edilen lessonsFromMinutes(insideMinutes).
 */
export function calculateLessons(
  firstEntry: string,
  lastExit: string | null,
  now: number = Date.now(),
): LessonResult {
  const startMs = new Date(firstEntry).getTime();
  const endMs = lastExit ? new Date(lastExit).getTime() : now;
  return lessonsFromMinutes((endMs - startMs) / 60000);
}

/**
 * Aktiviteleri entry→exit çiftlerine eşleyip toplam içeride dakikayı hesaplar.
 *
 * - Aktiviteler zaman olarak sıralanır (ASC)
 * - State machine: 'out' → 'in' (entry) → 'out' (exit), her tamamlanan
 *   çiftin süresi toplanır
 * - "out iken exit" veya "in iken entry" gürültüsü yoksayılır
 * - Kişi hâlâ içerideyse (son aktivite entry, hiç exit gelmemiş): caller
 *   `now` parametresi geçirir; entry → now arası eklenir
 *
 * @param activities  birey'in o günkü tüm aktiviteleri (sıralama önemli değil)
 * @param now         "hala içeride" durumunda referans alınacak zaman (ms)
 *                    Bugün için Date.now(), geçmiş gün için endOfDay
 */
export function computeInsideMinutes(
  activities: Array<{ activity_type: 'entry' | 'exit'; activity_time: string }>,
  now: number,
): number {
  if (activities.length === 0) return 0;

  const sorted = [...activities].sort((a, b) =>
    a.activity_time.localeCompare(b.activity_time),
  );

  let totalMs = 0;
  let enterMs: number | null = null;

  for (const act of sorted) {
    const t = new Date(act.activity_time).getTime();
    if (act.activity_type === 'entry') {
      // Sadece "out" durumdayken entry başlat. Üst üste entry gürültüsü yoksay
      // (ilk entry'i tut).
      if (enterMs === null) enterMs = t;
    } else {
      // exit — "in" durumdaysa süreyi topla. "out iken exit" gürültüsü yoksay.
      if (enterMs !== null) {
        totalMs += Math.max(0, t - enterMs);
        enterMs = null;
      }
    }
  }

  // Hala içerideyse (son aktivite entry, kapalı çift yok) → now'a kadar say
  if (enterMs !== null) {
    totalMs += Math.max(0, now - enterMs);
  }

  return Math.floor(totalMs / 60000);
}
