import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichAndSanitizeFinancialHistory,
  calculateSectorScore,
  detectValueTrap,
  computeFairValueTrend,
  computeTtmEbitdaFromHistory,
  optimizeFinalDecision
} from '../lib/valuation.ts';

test('TTM & Foreign WACC Architecture Comprehensive Test Suite', async (t) => {
  await t.test('1. Mathematical Verification of User THYAO TTM Calculation', () => {
    // Cari Ara Dönem: 2026/06 (-5 Mr TL)
    // Önceki Yıl Sonu: 2025/12 (115 Mr TL)
    // Önceki Yıl Eşleşen Dönem: 2025/06 (33.5 Mr TL)
    const q2_2026_ebit = -5_000_000_000;
    const fy_2025_ebit = 115_000_000_000;
    const q2_2025_ebit = 33_500_000_000;

    const ttmEbit = q2_2026_ebit + fy_2025_ebit - q2_2025_ebit;
    assert.equal(ttmEbit, 76_500_000_000, 'TTM Faaliyet Kârı (EBIT) tam 76.5 Mr TL olmalıdır');

    const ttmDepreciation = 127_200_000_000;
    const ttmEbitda = ttmEbit + ttmDepreciation;
    assert.equal(ttmEbitda, 203_700_000_000, 'TTM FAVÖK tam 203.7 Mr TL olmalıdır');

    const grossFinancialDebt = 833_888_000_000;
    const grossDebtToEbitda = grossFinancialDebt / ttmEbitda;
    assert.equal(Number(grossDebtToEbitda.toFixed(2)), 4.09, 'Brüt Finansal Borç / FAVÖK tam 4.09x çıkmalıdır');

    // Nakit ve nakit benzerleri (~214 Mr TL) düşüldüğünde Net Borç
    const cashAndEquivalents = 213_888_000_000;
    const netDebt = grossFinancialDebt - cashAndEquivalents;
    const netDebtToEbitda = netDebt / ttmEbitda;
    assert.equal(netDebt, 620_000_000_000, 'Net Finansal Borç 620 Mr TL olmalıdır');
    assert.equal(Number(netDebtToEbitda.toFixed(2)), 3.04, 'Net Borç / TTM FAVÖK 3.04x olmalıdır (4.0x emniyet sınırının altında)');
  });

  await t.test('2. detectValueTrap enforces TTM EBITDA instead of raw interim EBITDA', () => {
    // Şirketin ara dönem (2026/06) 6 aylık FAVÖK'ü 100 Mr TL, ancak TTM FAVÖK'ü 200 Mr TL
    // Net Borç 620 Mr TL
    // Eğer ham FAVÖK (100 Mr) kullanılsaydı: 620 / 100 = 6.2x (> 4.0x) -> False Positive Değer Tuzağı!
    // TTM FAVÖK (200 Mr) kullanıldığında: 620 / 200 = 3.1x (<= 4.0x) -> Sağlıklı, değer tuzağı tetiklenmez.
    const history = [
      { period: '2025/06', revenue: 500_000_000_000, ebitda: 80_000_000_000, net_debt: 600_000_000_000, roic: 12 },
      { period: '2025/12', revenue: 1_000_000_000_000, ebitda: 180_000_000_000, net_debt: 610_000_000_000, roic: 14 },
      { period: '2026/06', revenue: 600_000_000_000, ebitda: 100_000_000_000, net_debt: 620_000_000_000, roic: 15 }
    ];

    const result = detectValueTrap(history, 100, 150, 'AVIATION');
    const hasLeverageReason = result.reasons.some(r => r.includes('Kritik Borçluluk Baskısı'));
    assert.equal(hasLeverageReason, false, 'TTM FAVÖK ile Net Borç/FAVÖK 3.1x olduğundan borç tuzağı tetiklenmemelidir');
  });

  await t.test('3. detectValueTrap prevents false margin collapse on seasonal quarters (discrete quarterly margins)', () => {
    // Havacılık gibi mevsimsel şirketlerde Q1 kış döneminde marj düşer, Q3 yazın zirve yapar.
    // 2024/12 (12A kümülatif marj: %25), 2025/03 (3A kış marjı: %15), 2025/06 (6A kümülatif marj: %18)
    // Ham kümülatif seriyi ardışık çeyrek gibi kıyaslamak yapay marj çöküşü yaratmamalıdır.
    const seasonalHistory = [
      { period: '2024/12', revenue: 100_000, ebitda: 25_000, net_debt: 50_000, roic: 15 },
      { period: '2025/03', revenue: 20_000, ebitda: 3_000, net_debt: 50_000, roic: 14 },
      { period: '2025/06', revenue: 50_000, ebitda: 9_000, net_debt: 50_000, roic: 15 }
    ];

    const result = detectValueTrap(seasonalHistory, 100, 150, 'AVIATION');
    const hasErosionReason = result.reasons.some(r => r.includes('Aralıksız Marj Daralması'));
    assert.equal(hasErosionReason, false, 'Mevsimsel kış çeyreği aralıksız marj daralması olarak işaretlenmemelidir');
  });

  await t.test('4. calculateSectorScore uses TTM EBITDA in Aviation, Utilities, and Industrial sectors', () => {
    const aviationData = {
      ticker: 'THYAO',
      sector: 'AVIATION',
      financial_history: [
        { period: '2025/06', ebitda: 80_000_000_000, revenue: 500_000_000_000 },
        { period: '2025/12', ebitda: 180_000_000_000, revenue: 1_000_000_000_000 },
        { period: '2026/06', ebitda: 100_000_000_000, revenue: 600_000_000_000, net_debt: 620_000_000_000 }
      ]
    };

    const ttmEbitda = computeTtmEbitdaFromHistory(aviationData.financial_history, aviationData.financial_history[2]);
    assert.equal(ttmEbitda, 200_000_000_000, 'TTM FAVÖK: 100 + 180 - 80 = 200 Mr TL olmalıdır');

    const scoreRes = calculateSectorScore(aviationData, 'AVIATION');
    const debtCat = scoreRes.breakdown.find(b => b.category.includes('Döviz Borçluluğu') || b.category.includes('Borç'));
    assert.ok(debtCat, 'Borçluluk kategorisi bulunmalıdır');
    // Net Borç 620 / TTM FAVÖK 200 = 3.1x. Bu da 2.5 - 3.8 aralığında "Sağlıklı Döviz Borçluluğu" (19 puan) üretir
    assert.ok(debtCat.reason.includes('3.1x'), `Sebep metninde TTM çarpan 3.1x yer almalıdır, bulundu: ${debtCat.reason}`);
    assert.equal(debtCat.status, 'good', '3.1x Net Borç / TTM FAVÖK havacılıkta sağlıklı (good) kabul edilmelidir');
  });

  await t.test('5. computeFairValueTrend does not unfairly apply debt haircut in interim quarters', () => {
    const history = [
      { period: '2024/12', revenue: 1_000_000_000, ebitda: 200_000_000, equity: 500_000_000, net_debt: 400_000_000, share_price: 50, roe: 20, roic: 18, wacc: 28, current_ratio: 1.3, net_income: 100_000_000 },
      { period: '2025/06', revenue: 600_000_000, ebitda: 110_000_000, equity: 550_000_000, net_debt: 420_000_000, share_price: 55, roe: 22, roic: 19, wacc: 28, current_ratio: 1.3, net_income: 100_000_000 },
      { period: '2025/12', revenue: 1_200_000_000, ebitda: 240_000_000, equity: 600_000_000, net_debt: 450_000_000, share_price: 60, roe: 24, roic: 20, wacc: 28, current_ratio: 1.3, net_income: 100_000_000 },
      { period: '2026/06', revenue: 700_000_000, ebitda: 130_000_000, equity: 660_000_000, net_debt: 480_000_000, share_price: 65, roe: 25, roic: 21, wacc: 28, current_ratio: 1.3, net_income: 100_000_000 }
    ];

    const trend = computeFairValueTrend(history, 'INDUSTRIAL', 100_000_000, 65, 80, 6.0);
    assert.equal(trend.length, 4, 'Son 4 çeyrek trend noktası hesaplanmalıdır');
    // Her çeyrekte adil değer pozitif ve stabil seyretmeli, yapay erozyon (isEroding) olmamalıdır
    const hasErosion = trend.some(p => p.isEroding === true);
    assert.equal(hasErosion, false, 'Sağlıklı TTM EBITDA sayesinde yapay adil değer erozyonu oluşmamalıdır');
  });

  await t.test('6. enrichAndSanitizeFinancialHistory handles 3DF FX operating loss fallback and foreign currency Fisher WACC', () => {
    const thyaoData = {
      ticker: 'THYAO',
      sector: 'AVIATION',
      currency: 'USD',
      financial_history: [
        {
          period: '2025/06',
          revenue: 10_000_000_000,
          gross_profit: 2_500_000_000,
          operating_profit: 1_200_000_000,
          net_income: 1_000_000_000,
          equity: 15_000_000_000,
          net_debt: 8_000_000_000,
          is_tms29: false
        },
        {
          period: '2025/12',
          revenue: 22_000_000_000,
          gross_profit: 5_500_000_000,
          operating_profit: 3_000_000_000,
          net_income: 2_600_000_000,
          equity: 17_000_000_000,
          net_debt: 8_200_000_000,
          is_tms29: false
        },
        {
          period: '2026/06',
          revenue: 12_000_000_000,
          gross_profit: 3_000_000_000,
          operating_expenses: 1_000_000_000, // Çekirdek faaliyet kârı = 2_000_000_000
          operating_profit: -500_000_000, // Esas faaliyetlerden diğer giderler (kur farkı / 3DF) nedeniyle negatif
          net_income: 1_800_000_000, // Güçlü net kâr
          equity: 20_000_000_000,
          net_debt: 8_500_000_000,
          is_tms29: false
        }
      ]
    };

    const sanitized = enrichAndSanitizeFinancialHistory(thyaoData, 'AVIATION');
    const latestItem = sanitized.financial_history[2];

    // 1) ROIC kur farkı nedeniyle negatif kilitlenmemeli, pozitif olmalıdır
    assert.ok(latestItem.roic > 0, `ROIC pozitif olmalıdır, hesaplanan: ${latestItem.roic}%`);

    // 2) THYAO USD fonksiyonel para birimine sahip olduğu için beklenen enflasyon ABD %2.5 olmalıdır (Türkiye %18 değil)
    assert.equal(latestItem.expected_inflation, 2.5, 'USD fonksiyonel para birimi için enflasyon %2.5 olmalıdır');

    // 3) Reel WACC Türkiye TÜFE'si (%18-%36) çıkarılarak yapay eksiye düşmemelidir
    assert.ok(latestItem.real_wacc > 4.0 && latestItem.real_wacc < 12.0, `USD Reel WACC makul pozitif aralıkta olmalıdır, hesaplanan: ${latestItem.real_wacc}%`);
    assert.ok(latestItem.benchmark_wacc > 4.0, `Benchmark WACC sağlıklı olmalıdır, hesaplanan: ${latestItem.benchmark_wacc}%`);
  });

  await t.test('7. computeTtmEbitdaFromHistory annualizes single-period interim history (IPOs)', () => {
    // 6 aylık tek çeyrek (yeni halka arz): 100 Mr * 2.0 = 200 Mr olmalıdır
    const singleQ2 = [{ period: '2026/06', ebitda: 100_000_000_000 }];
    const ttmQ2 = computeTtmEbitdaFromHistory(singleQ2, singleQ2[0]);
    assert.equal(ttmQ2, 200_000_000_000, '6A ara dönem yıllıklandırma katsayısı 2.0x ile çarpılmalıdır');

    // 3 aylık tek çeyrek: 50 Mr * 4.0 = 200 Mr olmalıdır
    const singleQ1 = [{ period: '2026/03', ebitda: 50_000_000_000 }];
    const ttmQ1 = computeTtmEbitdaFromHistory(singleQ1, singleQ1[0]);
    assert.equal(ttmQ1, 200_000_000_000, '3A ara dönem yıllıklandırma katsayısı 4.0x ile çarpılmalıdır');

    // Yıl sonu: düz çarpma yapılmaz, ham değer korunmalıdır
    const singleQ4 = [{ period: '2025/12', ebitda: 300_000_000_000 }];
    const ttmQ4 = computeTtmEbitdaFromHistory(singleQ4, singleQ4[0]);
    assert.equal(ttmQ4, 300_000_000_000, 'Yıl sonu dönemi 1.0x olarak korunmalıdır');
  });

  await t.test('8. computeTtmEbitdaFromHistory preserves genuine negative TTM EBITDA and flags operational loss in detectValueTrap', () => {
    // Şirket cari 2026/06'da 50 Mr kâr etti, ancak önceki 2025/12: 100 Mr, 2025/06: 160 Mr
    // TTM = 50 + 100 - 160 = -10 Mr TL (Operasyonel Zarar!)
    const lossHistory = [
      { period: '2025/06', ebitda: 160, revenue: 500, net_debt: 200, roic: 15 },
      { period: '2025/12', ebitda: 100, revenue: 1000, net_debt: 200, roic: 15 },
      { period: '2026/06', ebitda: 50, revenue: 500, net_debt: 200, roic: 15 }
    ];

    const ttmLoss = computeTtmEbitdaFromHistory(lossHistory, lossHistory[2]);
    assert.equal(ttmLoss, -10, 'Negatif TTM FAVÖK (-10) yapay pozitif yıllıklandırmaya çevrilmemeli, korunmalıdır');

    const vtResult = detectValueTrap(lossHistory, 50, 100, 'INDUSTRIAL');
    const hasOpLossReason = vtResult.reasons.some(r => r.includes('Borçlu Şirkette Operasyonel Zarar'));
    assert.equal(hasOpLossReason, true, 'Negatif TTM FAVÖK ve borçluluk durumunda operasyonel zarar tuzağı tetiklenmelidir');
  });

  await t.test('9. detectValueTrap captures quarterly discrete margin collapse even with negative quarterly EBITDA', () => {
    // 2025/12: 1000 ciro, 200 favök (%20 marj)
    // 2026/03: 300 ciro, 60 favök (%20 marj)
    // 2026/06: 600 kümülatif ciro, 40 kümülatif favök
    // Discrete Q2: Ciro = 300, FAVÖK = -20 (Marj: -%6.67) -> Marj %20'den -%6.67'ye 26.7 puan çökmüştür!
    const collapseHistory = [
      { period: '2025/12', revenue: 1000, ebitda: 200, roic: 15 },
      { period: '2026/03', revenue: 300, ebitda: 60, roic: 15 },
      { period: '2026/06', revenue: 600, ebitda: 40, roic: 15 }
    ];

    const result = detectValueTrap(collapseHistory, 50, 100, 'INDUSTRIAL');
    const hasMarginDrop = result.reasons.some(r => r.includes('Sert Marj Kaybı') || r.includes('Marj'));
    assert.equal(hasMarginDrop, true, 'Çeyreklik operasyonel marj çöküşü (26.7 puan daralma) tespit edilmelidir');
  });

  await t.test('10. optimizeFinalDecision enforces TTM EBITDA and prevents false ALMA override for interim companies', () => {
    // Havacılık şirketi (THYAO): Q2 6 aylık ham FAVÖK 100 Mr, TTM FAVÖK 200 Mr, Net Borç 620 Mr
    // Ham FAVÖK kullanılırsa 620 / 100 = 6.2x (> 4.8x) -> False ALMA!
    // TTM FAVÖK kullanılırsa 620 / 200 = 3.1x (<= 4.8x) -> AL kararı korunur!
    const history = [
      { period: '2025/06', ebitda: 80_000_000_000, revenue: 500_000_000_000 },
      { period: '2025/12', ebitda: 180_000_000_000, revenue: 1_000_000_000_000 },
      { period: '2026/06', ebitda: 100_000_000_000, revenue: 600_000_000_000, net_debt: 620_000_000_000 }
    ];

    const opt = optimizeFinalDecision({
      rawDecision: 'AL',
      score: 82,
      latestData: history[2],
      financialHistory: history,
      sector: 'AVIATION',
      fairValue: 150,
      marketPrice: 100
    });

    assert.equal(opt.finalDecision, 'AL', 'TTM FAVÖK kaldıracı 3.1x olduğundan AL kararı ALMA olarak bozulmamalıdır');
    const hasFalseDebtFlag = opt.safetyFlags.some(f => f.includes('Aşırı Filo Borçluluğu'));
    assert.equal(hasFalseDebtFlag, false, 'Hatalı borç güvenlik bayrağı üretilmemelidir');
  });
});
