# Gün Çizelgesi — Birey/Personel Filtresi — Tasarım Belgesi

> **Durum:** Onaylandı (tasarım)
> **Tarih:** 2026-06-18
> **Bağlam:** Seans Takvimi C görünümüne (`/takvim/[date]`) küçük bir ekleme. Ana özellik: `docs/superpowers/specs/2026-06-18-seans-takvimi-design.md`.

## Amaç

Günlük zaman çizelgesinde (C) gösterilen kişileri **Birey / Personel** olarak süzebilmek. A ay ısı haritası değişmez — ısı rengi ve gün sayıları **yalnız öğrenci (birey) sayısı** üzerinden kalır (zaten öyle).

## Kapsam

- **Yalnız `frontend/pages/takvim/[date].vue`.** Backend, A ekranı, `DayTimeline.vue` değişmez.
- Veri zaten elde: C, `GET /api/snapshot?date=` ile **tüm** presence'ı (öğrenci + personel) çekiyor. Filtre **client-side** — yeni uç/çağrı yok.

## Davranış

1. Özet satırının altına segment kontrol: **`Hepsi · Birey · Personel`** — anasayfadaki (`index.vue`) mevcut filtreyle aynı etiketler ve pill stili. Varsayılan **Hepsi** (bugünkü davranış: herkes görünür).
2. Seçim, `DayTimeline`'a geçen seans listesini `individual_type`'a göre süzer:
   - Hepsi → hepsi (type 1 + 2)
   - Birey → yalnız `individual_type === 1`
   - Personel → yalnız `individual_type === 2`
3. Üst özet satırı seçime uyum sağlar:
   - **Hepsi** → `N öğrenci · M ders · K personel`
   - **Birey** → `N öğrenci · M ders`
   - **Personel** → `K personel`
   (Öğrenci sayısı ve ders yalnız birey için; personelde ders yok — mevcut kurala uygun.)
4. Boş durum filtreye göre: `DayTimeline` zaten boş listede "Bu gün hareket kaydı yok" gösteriyor; filtre sonucu boşsa aynı bileşen bu mesajı verir (kabul edilebilir) — istenirse "Bu filtrede kayıt yok"a çevrilebilir.
5. Filtre seçimi sayfa-yerel `ref` (gün değişince/sayfadan çıkınca sıfırlanır). Kalıcılık yok (YAGNI).

## Felsefe & tutarlılık

- Salt-okunur korunur; yalnız görünüm süzme.
- Etiketler/segment stili anasayfadaki filtreyle birebir (Hepsi/Birey/Personel).
- A ısı haritası ve backend dokunulmaz.

## Dosya değişikliği

- `frontend/pages/takvim/[date].vue` — `filter` ref'i, segment kontrol şablonu, `visibleSessions` computed (mevcut `sessions`'ı süzer), özet satırının filtreye göre uyarlanması. `DayTimeline :sessions="visibleSessions"` alır.

## Doğrulama

- `cd frontend && npm run build` hatasız.
- Preview (mock veriyle): Hepsi=8 blok (7 öğrenci + 1 personel), Birey=7 öğrenci bloğu (personel gizli), Personel=1 personel bloğu; özet satırı her seçimde doğru; segment aktif-sekme vurgusu çalışır; dark mode + mobil okunur.
