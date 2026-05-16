/**
 * useIndividualFilter — kullanıcının "sadece görmek istediği bireyler" listesi.
 *
 * - Tamamen client-side (localStorage). Backend etkilenmez.
 * - Her telefon/cihaza özel; eşli her cihaz kendi seçimini yapar.
 * - Boş set = filtre KAPALI (tüm bireyler görünür).
 * - Dolu set = sadece o UUID'ler görünür.
 *
 * KVKK notu: bu UI-only bir filtredir. Veri telefona yine ulaşır,
 * sadece görünmez. Gerçek izin kontrolü gerektiğinde server-side
 * (device token başına filter) eklemek lazım.
 */

const STORAGE_KEY = 'bry.filter.individuals';

export const useIndividualFilter = () => {
  // useState ile reactive — tüm component'ler aynı kaynak
  const selectedUuids = useState<Set<string>>('bry-individual-filter', () => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });

  // Boş set = filtre kapalı (tüm bireyler görünür)
  const isEnabled = computed(() => selectedUuids.value.size > 0);
  const selectedCount = computed(() => selectedUuids.value.size);

  function persist() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selectedUuids.value)));
    } catch {/* quota? sessizce geç */}
  }

  function toggle(uuid: string) {
    const next = new Set(selectedUuids.value);
    if (next.has(uuid)) next.delete(uuid);
    else next.add(uuid);
    selectedUuids.value = next;
    persist();
  }

  function setAll(uuids: string[]) {
    selectedUuids.value = new Set(uuids);
    persist();
  }

  function clear() {
    selectedUuids.value = new Set();
    persist();
  }

  function isSelected(uuid: string): boolean {
    return selectedUuids.value.has(uuid);
  }

  /**
   * Filtreyi uygula — boş set ise tüm liste döner.
   * `getUuid` fonksiyonu liste item'ından UUID'yi çeker.
   */
  function applyFilter<T>(items: T[], getUuid: (item: T) => string): T[] {
    if (selectedUuids.value.size === 0) return items;
    return items.filter((it) => selectedUuids.value.has(getUuid(it)));
  }

  return {
    selectedUuids,
    isEnabled,
    selectedCount,
    toggle,
    setAll,
    clear,
    isSelected,
    applyFilter,
  };
};
