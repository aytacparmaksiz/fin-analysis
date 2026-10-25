import test from 'node:test';
import assert from 'node:assert/strict';
import { computeIndustrialFairValue } from '../lib/valuation.ts';

test('AKSEN Exact Financial Pipeline & Weighted Fair Value Audit', async (t) => {
  await t.test('1. Exact hybrid weights with EV <= Debt Bridge yields 11.79 TL', () => {
    // AKSEN 2026/06 birebir gerçek finansal tablo girdileri:
    const inputs = {
      ebitdaFull: 15362587790,        // TTM FAVÖK (2026/06 7.65B + 2025/12 15.17B - 2025/06 7.46B)
      netFull: 4121596945,           // TTM Net Kâr (2026/06 1.17B + 2025/12 4.30B - 2025/06 1.35B)
      totalEquityFull: 68551509176,   // 2026/06 Ana Ortaklık Özkaynakları
      netDebt: 59468623746,           // Finansal Borçlar (63.35B) - Nakit (3.87B)
      leaseLiabilities: 0,            // TFRS 16 Kira Borcu (Sanayi/Enerji ayrımı)
      minorityInterests: 6257713495,  // Azınlık Payları
      effectiveShareCount: 1226338236,// Ödenmiş Sermaye / Pay Adedi
      targetMultipleNum: 5.6,         // Elektrik Üretim Hedef FD/FAVÖK Çarpanı
      clampedRevGrowth: -0.246,       // 2025/06 -> 2026/06 YoY Hasılat Büyümesi (-%24.6)
      clampedNetGrowth: -0.133,       // 2025/06 -> 2026/06 YoY Net Kâr Büyümesi (-%13.3)
      currentRoic: 6.6,
      currentWacc: 5.2,
      roe: 6.01,
      currentRatio: 0.61
    };

    const res = computeIndustrialFairValue(inputs);

    // 1. İleri Firma Değeri: 15.362B * (1 - 0.246) * 5.6 = 64.866.990.684 TL
    assert.equal(Math.round(res.enterpriseVal), 64866990684, 'İleri Firma Değeri (EV) formülü doğrulanmalıdır');

    // 2. Borç Köprüsü: 59.468B + 6.257B = 65.726.337.241 TL
    assert.equal(res.totalDebtBridge, 65726337241, 'Borç köprüsü net borç ve azınlık paylarının toplamı olmalıdır');

    // 3. EV <= Debt Bridge Çöküşü: 64.866B <= 65.726B -> Operasyonel Hisse Değeri 0.00 TL
    assert.equal(res.evEbitdaPerShare, 0, 'EV borç köprüsünü aşamadığında operasyonel hisse başı değer 0 olmalıdır');

    // 4. Diğer Bileşenler:
    // P/E: 4.121B * (1 - 0.133) * 7.55 / 1.226B pay = 22.029 TL
    // P/B: 55.90 TL defter değeri * 0.374 = 20.941 TL
    assert.equal(Number(res.pePerShare.toFixed(2)), 22.03, 'P/E bileşeni doğrulanmalıdır');
    assert.equal(Number(res.pbPerShare.toFixed(2)), 20.94, 'P/B bileşeni doğrulanmalıdır');

    // 5. Uçurum Etkisiz Normalizasyon:
    // EV Borç Köprüsünün altında kaldığı için (evEbitdaPerShare === 0),
    // 0 TL bileşene yapay %45 ağırlık verip değeri 11.79 TL'ye seyreltmek yerine;
    // geçerli kalan P/E (22.029 TL, %25) ve P/B (20.941 TL, %30) ağırlıkları normalize edilir:
    // (22.029069 * 25/55) + (20.941200 * 30/55) = 21.4355 TL -> 21.44 TL
    assert.equal(res.fairValue, 21.44, 'Geçerli bileşenlerin normalize ağırlıklı toplamı tam olarak 21.44 TL olmalıdır');
  });

  await t.test('2. Debt Bridge Invariance: No double counting of lease liabilities in net debt', () => {
    const inputs = {
      ebitdaFull: 1000,
      netFull: 200,
      totalEquityFull: 1000,
      netDebt: 300,
      leaseLiabilities: 50,
      minorityInterests: 20,
      effectiveShareCount: 100,
      targetMultipleNum: 5.0,
      clampedRevGrowth: 0,
      clampedNetGrowth: 0,
      currentRoic: 10,
      currentWacc: 8,
      roe: 15,
      currentRatio: 1.2
    };
    const res = computeIndustrialFairValue(inputs);
    assert.equal(res.totalDebtBridge, 370, 'totalDebtBridge = netDebt + leaseLiabilities + minorityInterests');
  });
});
