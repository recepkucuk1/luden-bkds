/**
 * INNOVA BRY API'sinden gelen ham veri tipleri
 * (network keşfinden çıkarıldı, gerçek alan isimleriyle birebir)
 */

export interface InnovaLoginResponse {
  access: string;   // JWT, ~28.5 dk geçerli
  refresh: string;  // 7 gün geçerli
}

export interface InnovaIndividual {
  uuid: string;
  full_name: string;           // "BÜL************ARI" gibi maskeli gelir
  identity_number: string;     // "*******1196" gibi maskeli
  individual_type: number;     // 1 = öğrenci/birey (varsayım)
  gender: 'Erkek' | 'Kadın';
  birth_date: string;          // YYYY-MM-DD
  disability_code: string;     // MEB engel kodu
}

export interface InnovaActivity {
  uuid: string;
  individual_uuid: string;
  activity_type: 'entry' | 'exit';
  activity_time: string;       // ISO 8601 +03:00
  created_at: string;
  updated_at: string;
  is_matched_manually: boolean;
  manuel_match_time: string | null;
  manual_match_similarity_score: number | null;
  roi_url: string;             // kameranın çektiği yüz fotoğrafı
}

export interface InnovaDailySummary {
  individual_uuid: string;
  has_manuel_match: boolean;
  first_entry: string;
  last_exit: string;
}

export interface InnovaPaginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Bizim app'in dışarıya sunduğu zenginleştirilmiş tipler
 */

export interface PresenceItem {
  individual: InnovaIndividual;
  lastActivity: InnovaActivity;
  todayActivityCount: number;
  // Bugünün ilk girişi ve son çıkışı (BRY summary'sinden birebir).
  // "İçeride mi/dışarıda mı" hesabı bilinçli olarak yapılmıyor — kameralar
  // bazen entry'i exit gibi okuyor; biz sadece ilk-son hareket aralığını gösteriyoruz.
  firstEntry: string | null;
  lastExit: string | null;
  // Fiilen içeride geçirilen toplam dakika — entry→exit çiftleri toplamı.
  // Ara çıkışlar (öğle arası vb.) HARİÇ. MEB ders saati buradan hesaplanır.
  // Kişi hala içerideyse: bugün için "şimdiye kadar", geçmiş için gün sonuna kadar.
  insideMinutes: number;
  // BRY summary'sinden — o gün manuel eşleştirme yapılmış mı?
  hasManualMatch: boolean;
}

export interface RecentActivityItem {
  activity: InnovaActivity;
  individual: Pick<InnovaIndividual, 'uuid' | 'full_name'>;
}
