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
