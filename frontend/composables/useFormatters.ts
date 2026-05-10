/**
 * Saat formatlama yardımcıları
 */

export const useFormatters = () => {
  /**
   * "2026-05-08T17:44:17.865141+03:00" → "17:44"
   */
  const toTime = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Istanbul',
    });
  };

  /**
   * "X dk önce", "az önce", "Y saat önce"
   */
  const relative = (iso: string): string => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 30) return 'az önce';
    if (diffSec < 60) return `${diffSec} sn önce`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} dk önce`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} sa önce`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay} gün önce`;
  };

  /**
   * İsmin baş harflerini al (avatar için): "BÜL****ARI" → "BÜ"
   * Maskelenmiş isimlerde * karakterleri atlayarak ilk gerçek harfleri al
   */
  const initials = (fullName: string): string => {
    if (!fullName) return '?';
    const cleaned = fullName.replace(/\*/g, '').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return cleaned.slice(0, 2).toUpperCase();
  };

  return { toTime, relative, initials };
};
