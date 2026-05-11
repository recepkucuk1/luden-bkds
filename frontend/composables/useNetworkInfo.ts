/**
 * useNetworkInfo — Mac/PC'nin LAN IP'lerini backend'den alır.
 *
 * Kullanım: kullanıcıya "telefondan şu adrese gidin: http://192.168.X.X:8787"
 * şeklinde göstermek için. Localhost-only endpoint (telefondan çağrılmaz).
 *
 * Bilgisayar başına genelde 1 LAN IP olur (Wi-Fi en0). Birden fazla varsa
 * (Wi-Fi + Ethernet veya VPN) hepsi döner, UI ilk geçerli olanı belirgin
 * gösterir.
 */
export const useNetworkInfo = () => {
  const { backendUrl } = useBkds();
  const urls = useState<string[]>('luden-network-urls', () => []);
  const loading = useState<boolean>('luden-network-loading', () => false);

  const refresh = async () => {
    loading.value = true;
    try {
      const r = await $fetch<{ port: number; urls: string[] }>(
        `${backendUrl}/api/network/info`,
      );
      urls.value = r.urls;
    } catch {
      // Localhost değiliz veya backend hazır değil — sessizce geç
    } finally {
      loading.value = false;
    }
  };

  // Tek bir "tercih edilen" URL — UI'da büyük göstermek için
  const primaryUrl = computed(() => urls.value[0] ?? null);

  return { urls, primaryUrl, loading, refresh };
};
