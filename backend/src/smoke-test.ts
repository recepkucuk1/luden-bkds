/**
 * Smoke test — INNOVA'ya gerçekten login olabiliyor muyuz?
 *
 * Çalıştırmak için:
 *   1. .env.example'ı .env olarak kopyalayın ve şifrenizi yazın
 *   2. npm install
 *   3. npm run smoke
 *
 * Beklenen çıktı: "✓ Login OK", "✓ Bugünkü özet (X kayıt)", vs.
 */

import 'dotenv/config';
import { InnovaBryAdapter } from './adapters/innova.js';

const required = ['INNOVA_BASE_URL', 'INNOVA_USERNAME', 'INNOVA_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`✗ Eksik environment variable: ${key}`);
    console.error('  .env dosyanızı kontrol edin');
    process.exit(1);
  }
}

const adapter = new InnovaBryAdapter({
  baseUrl: process.env.INNOVA_BASE_URL!,
  username: process.env.INNOVA_USERNAME!,
  password: process.env.INNOVA_PASSWORD!,
});

console.log('→ INNOVA BRY smoke test başlıyor...');
console.log(`  Sunucu: ${process.env.INNOVA_BASE_URL}`);
console.log(`  Kullanıcı: ${process.env.INNOVA_USERNAME}`);
console.log('');

try {
  // 1. Login + bugünkü özet
  console.log('→ Bugünkü aktivite özeti çekiliyor...');
  const summary = await adapter.getTodayActivitySummary({ pageSize: 5 });
  console.log(`✓ Login başarılı, ${summary.count} birey bugün hareket etmiş`);
  console.log(`  İlk ${summary.results.length} kayıt alındı`);
  console.log('');

  if (summary.results.length === 0) {
    console.log('  (Bugün hiç hareket yok — test buraya kadar)');
    process.exit(0);
  }

  // 2. İlk bireyin meta bilgisi
  const firstUuid = summary.results[0].individual_uuid;
  console.log(`→ Birey detay alınıyor (${firstUuid.slice(0, 8)}...)`);
  const individual = await adapter.getIndividual(firstUuid);
  console.log(`✓ Birey: ${individual.full_name} (${individual.gender}, ${individual.birth_date})`);
  console.log('');

  // 3. Bireyin tüm aktiviteleri (içeride mi hesaplaması için)
  console.log(`→ Bireyin bugünkü tüm aktiviteleri çekiliyor...`);
  const activities = await adapter.getIndividualActivities(firstUuid);
  console.log(`✓ ${activities.count} aktivite bulundu`);

  if (activities.results.length > 0) {
    // İlk = en yeni (DRF default ordering oluyor genelde, kontrol için göster)
    const last = activities.results[0];
    const isPresent = last.activity_type === 'entry';
    console.log(`  Son hareket: ${last.activity_type} @ ${last.activity_time}`);
    console.log(`  → Şu an: ${isPresent ? '🟢 İÇERİDE' : '⚪ DIŞARIDA'}`);
  }
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Tüm testler geçti. Adapter çalışıyor.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
} catch (err) {
  console.error('');
  console.error('✗ Test başarısız:');
  console.error(`  ${err instanceof Error ? err.message : err}`);
  console.error('');
  console.error('Olası sebepler:');
  console.error('  • Mac aynı yerel ağda mı?');
  console.error('  • BRY sunucusu (yerel ağda port 3000) açık mı?');
  console.error('  • .env dosyasındaki şifre doğru mu?');
  process.exit(1);
}
