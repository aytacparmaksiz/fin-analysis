import test from 'node:test';
import assert from 'node:assert/strict';
import { computeIndustrialFairValue } from '../lib/valuation.ts';

test('CapEx Transition & Normalized Cycle Valuation Framework Audit (FROTO / Craiova Model)', async (t) => {
  await t.test('1. FROTO Normalized Mid-Cycle Capacity Fair Value Audit', () => {
    // FROTO 2026/06 gerçek finansal tablo ve normalleştirilmiş döngü girdileri:
    // Hasılat: ~854 Milyar TL (TTM)
    // Tarihsel Medyan FAVÖK Marjı: %8.85
    // Güncel TTM Marjı: %5.16 (Craiova entegrasyonu ve döngüsel dip nedeniyle sıkışmış)
    // Normalleştirilmiş Marj: 0.35 * 5.16% + 0.65 * 8.85% = %7.56
    // Normalleştirilmiş FAVÖK: 854B * 7.56% = 64.56B TL
    // Normalleştirilmiş Net Kâr: 64.56B * 0.58 = 37.45B TL
    // Ana Ortaklık Özkaynakları: 179.19B TL
    // Net Finansal Borç (Craiova yatırım borcu dahil): 111.34B TL
    // Ödenmiş Sermaye / Pay Adedi: 3.509.100.000 adet (3.509B)
    const inputs = {
      ebitdaFull: 64562400000,
      netFull: 37446192000,
      totalEquityFull: 179191213000,
      netDebt: 111340913000,
      leaseLiabilities: 0,
      minorityInterests: 0,
      effectiveShareCount: 3509100000,
      targetMultipleNum: 8.0,
      clampedRevGrowth: 0.04,
      clampedNetGrowth: 0.05,
      currentRoic: 9.7,
      currentWacc: 29.6,
      roe: 22.6,
      currentRatio: 1.15,
      isCapExTransitionPhase: true
    };

    const res = computeIndustrialFairValue(inputs);

    // 1. Borç Köprüsü tam düşülmelidir: 111.34 Milyar TL Net Borç %100 düşülmelidir (borç affı yoktur).
    assert.equal(res.totalDebtBridge, 111340913000, 'Tam net borç köprüsü eksiksiz düşülmelidir');

    // 2. EVA Haircut geçici yatırım döneminde bypass edilmelidir (henüz devreye giren tesis için çifte ceza verilmez).
    assert.equal(res.evaHaircutApplied, false, 'Büyük yatırım evresinde geçici ROIC baskısı nedeniyle EVA kesintisi uygulanmamalıdır');

    // 3. 12A İleri FAVÖK hisse başı değeri doğrulanmalıdır:
    // İleri FAVÖK: 64.5624B * 1.04 = 67.144896B TL
    // Firma Değeri: 67.144896B * 8.0 = 537.159B TL
    // Özkaynak: 537.159B - 111.341B = 425.818B TL
    // Hisse Başı: 425.818B / 3.5091B = ~121.35 TL
    assert.ok(res.evEbitdaPerShare > 120 && res.evEbitdaPerShare < 125, `EV/EBITDA hisse başı ~121 TL olmalı (bulunan: ${res.evEbitdaPerShare})`);

    // 4. Hibrit Adil Değer: Kurumsal aracı kurum konsensüsü (136-152 TL) bandında olmalıdır.
    assert.ok(res.fairValue !== null && res.fairValue >= 120 && res.fairValue <= 145, `Adil değer kurumsal bantta olmalı (bulunan: ${res.fairValue})`);

    // 5. Formül çıktısı 'Yatırım Evresi & Normalleştirilmiş Kapasite Modeli' notunu içermelidir.
    assert.ok(res.formulaStr.includes('Yatırım Evresi & Normalleştirilmiş Kapasite Modeli'), 'Formül şeffaf etiket taşımalıdır');
  });
});
