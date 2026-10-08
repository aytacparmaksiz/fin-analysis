/**
 * scripts/clear-and-verify-mpark.ts
 * ----------------------------------------------------------------------------
 * MPARK Önbellek Temizleme ve Yeni Finansal Mimari Canlı Doğrulama Scripti.
 * 
 * Doğrulanan 5 Kritik Metrik:
 * a) Duran Varlıklar: 71.955.709 Bin TL (Azınlık payı düşülmemiş resmi 1AK kalemi).
 * b) Aktif Toplamı: 95.303.606 Bin TL (Aktif = Dönen + Duran).
 * c) Esas Faaliyet Kârı: 5.200.867 Bin TL (3DF / FAALİYET KARI TFRS ana kalemi).
 * d) DuPont Faaliyet Marjı: %15,24 (%17,43 yerine).
 * e) Serbest Nakit Akışı (FCF): 4.458.911 Bin TL (4CB resmi kalemi).
 */

import { fetchAndAnalyzeBistCompany, clearBistCache } from '../lib/bist-service.ts';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase.ts';
import { FinancialRatioEngine } from '../lib/ratio-engine.ts';

async function main() {
  console.log('================================================================');
  console.log('🚀 [1/3] MPARK Önbellek Temizleme & Invalidation Başlatılıyor...');
  console.log('================================================================');

  // 1. RAM / In-Memory Cache Temizliği
  clearBistCache('MPARK');
  console.log('✅ In-Memory önbellek (MEMORY_FINANCIAL_CACHE) MPARK için sıfırlandı.');

  // 2. Supabase Önbellek Temizliği (Eğer yapılandırılmışsa)
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { error } = await supabase
          .from('bist_mali_tablolar')
          .delete()
          .eq('ticker', 'MPARK');
        if (error) {
          console.warn('⚠️ Supabase önbellek silinirken uyarı:', error.message);
        } else {
          console.log('✅ Supabase "bist_mali_tablolar" tablosundaki eski MPARK kaydı silindi.');
        }
      }
    } catch (e: any) {
      console.warn('⚠️ Supabase bağlantı uyarısı:', e.message);
    }
  } else {
    console.log('ℹ️ Supabase çevresel değişkenleri tanımlı değil; yerel bellek ve İş Yatırım API katmanı aktif.');
  }

  console.log('\n================================================================');
  console.log('⚡ [2/3] Canlı İş Yatırım & Yeni Mimari ile MPARK Re-Fetch Ediliyor...');
  console.log('================================================================');

  const result = await fetchAndAnalyzeBistCompany('MPARK', { forceRefresh: true });
  if (!result || !result.success || !Array.isArray(result.financial_history) || result.financial_history.length === 0) {
    throw new Error('MPARK canlı verileri çekilemedi!');
  }

  const latest = result.financial_history[result.financial_history.length - 1];
  const unified = result.unified_metrics;

  console.log('\n📊 CANLI SONUÇLAR (En Son Dönem: ' + latest.period + '):');

  // a) Duran Varlıklar
  const duranVarliklarBin = Math.round(latest.non_current_assets! / 1000);
  console.log(`a) Duran Varlıklar: ${duranVarliklarBin.toLocaleString('tr-TR')} Bin TL (Hedef: 71.955.709 Bin TL)`);

  // b) Aktif Toplamı
  const aktifToplamiBin = Math.round(latest.total_assets! / 1000);
  console.log(`b) Aktif Toplamı: ${aktifToplamiBin.toLocaleString('tr-TR')} Bin TL (Hedef: 95.303.606 Bin TL)`);

  // c) Esas Faaliyet Kârı
  const esasFaaliyetKariBin = Math.round(latest.operating_profit! / 1000);
  console.log(`c) Esas Faaliyet Kârı: ${esasFaaliyetKariBin.toLocaleString('tr-TR')} Bin TL (Hedef: 5.200.867 Bin TL)`);

  // d) DuPont Faaliyet Marjı
  const dupontMargin = unified?.dupont?.ebitMargin ?? Number(((latest.operating_profit! / latest.revenue!) * 100).toFixed(2));
  console.log(`d) DuPont Faaliyet Marjı: %${dupontMargin} (Hedef: %15,24)`);

  // e) Serbest Nakit Akışı (FCF)
  const fcfBin = Math.round(latest.free_cash_flow! / 1000);
  console.log(`e) Serbest Nakit Akışı (FCF): ${fcfBin.toLocaleString('tr-TR')} Bin TL (Hedef: 4.458.911 Bin TL)`);

  console.log('\n================================================================');
  console.log('🛡️ [3/3] Doğrulama Kontrolleri (Assertions):');
  console.log('================================================================');

  const errors: string[] = [];
  if (duranVarliklarBin !== 71955709) errors.push(`Duran Varlıklar uyuşmuyor: ${duranVarliklarBin} !== 71955709`);
  if (aktifToplamiBin !== 95303606) errors.push(`Aktif Toplamı uyuşmuyor: ${aktifToplamiBin} !== 95303606`);
  if (esasFaaliyetKariBin !== 5200867) errors.push(`Esas Faaliyet Kârı uyuşmuyor: ${esasFaaliyetKariBin} !== 5200867`);
  if (dupontMargin !== 15.24) errors.push(`DuPont Marjı uyuşmuyor: ${dupontMargin} !== 15.24`);
  if (fcfBin !== 4458911) errors.push(`FCF uyuşmuyor: ${fcfBin} !== 4458911`);

  if (errors.length === 0) {
    console.log('🎉 TEBRİKLER! TÜM 5 KRİTİK METRİK %100 BAŞARIYLA DOĞRULANDI!');
  } else {
    console.error('❌ Doğrulama hataları tespit edildi:', errors);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
