import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFinancialNumber,
  computeSectorValuationAndDrivers,
  computeFairValueTrend,
  calculateCompanyMultiples,
  calculateDuPont5Step,
  detectValueTrap,
  optimizeFinalDecision,
  calculateSectorScore
} from '../lib/valuation.ts';
import { FinancialRatioEngine } from '../lib/ratio-engine.ts';
import { computeSnowflakeAnalysis as calculateSnowflake } from '../lib/snowflake.ts';
import { FinancialDataValidator } from '../lib/financial-validator.ts';
import { isMetricDisabled } from '../lib/sectors.ts';

// Deterministik PRNG (Property-Based / Fuzzing Testleri için)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('RED TEAM MATHEMATICAL AUDIT & INVARIANT TEST SUITE', async (t) => {

  // ============================================================================
  // BÖLÜM 1: KATALOGLANAN MATEMATİKSEL ZAFİYETLERİN REGRESYON TESTLERİ (VULN 01-11)
  // ============================================================================

  await t.test('VULN-01 (Kritik): diagnoseCashQuality çift negatifte (Net Zarar + Negatif OCF) LOSS_BUFFER dönmemeli', () => {
    const res = FinancialRatioEngine.diagnoseCashQuality(-150_000_000, -220_000_000, 1_000_000_000);
    assert.equal(res.status, 'CRITICAL_RISK', 'Net zarar ve negatif OCF durumunda CRITICAL_RISK dönmelidir');
    assert.equal(res.cashConversionRatio, null, 'Çift negatifte yanıltıcı nakit dönüşüm oranı (OCF/|NetKar|) hesaplanmamalıdır');
    assert.ok(
      !res.evaluationText.includes('operasyonel nakit akışı pozitiftir'),
      'Negatif OCF varken "operasyonel nakit akışı pozitiftir" mesajı üretilemez'
    );
  });

  await t.test('VULN-02 (Kritik): Snowflake TTK 376 negatif özkaynak ve zarar durumunda hayali +22% ROE / +20% CAGR atamamalı', () => {
    const bankruptHistory = [
      { period: '2022/12', revenue: 500_000, ebitda: -20_000, operating_profit: -40_000, net_income: -80_000, equity: 100_000, total_assets: 900_000, current_assets: 200_000, current_liabilities: 500_000, net_debt: 600_000, financing_expenses: 55_000, operating_cash_flow: -50_000, free_cash_flow: -90_000 },
      { period: '2023/12', revenue: 450_000, ebitda: -50_000, operating_profit: -70_000, net_income: -150_000, equity: -50_000, total_assets: 850_000, current_assets: 180_000, current_liabilities: 600_000, net_debt: 720_000, financing_expenses: 85_000, operating_cash_flow: -80_000, free_cash_flow: -120_000 },
      { period: '2024/12', revenue: 400_000, ebitda: -80_000, operating_profit: -110_000, net_income: -220_000, equity: -270_000, total_assets: 800_000, current_assets: 150_000, current_liabilities: 750_000, net_debt: 880_000, financing_expenses: 120_000, operating_cash_flow: -110_000, free_cash_flow: -160_000 },
      { period: '2025/12', revenue: 350_000, ebitda: -120_000, operating_profit: -160_000, net_income: -310_000, equity: -580_000, total_assets: 750_000, current_assets: 120_000, current_liabilities: 950_000, net_debt: 1_050_000, financing_expenses: 165_000, operating_cash_flow: -140_000, free_cash_flow: -200_000 },
    ];

    const snow = calculateSnowflake({
      ticker: 'BATIKSAN',
      sector: 'INDUSTRIAL',
      currentPrice: 10,
      fairValue: 0.5,
      financialHistory: bankruptHistory,
      latestData: bankruptHistory[3],
      multiples: { pe: -2.5, pb: -1.2, sectorPe: 8.5, sectorPb: 1.8 }
    });

    assert.equal(snow.axes.past.score, 0, `Sürekli zarar eden ve özkaynağı negatif şirketin Geçmiş skoru 0 olmalıdır (Hesaplanan: ${snow.axes.past.score})`);
    assert.ok(snow.axes.health.score <= 1, `TTK 376 teknik iflas ve yüksek borçlu şirketin Sağlık skoru <= 1 olmalıdır (Hesaplanan: ${snow.axes.health.score})`);
    assert.ok(!snow.rewards.some((r) => r.includes('Yüksek Özsermaye Kârlılığı')), 'Negatif özkaynaklı şirkete Yüksek ROE ödülü verilemez');
  });

  await t.test('VULN-03 (Kritik): TTM hesaplamasında negatif 12A kümülatif FAVÖK/Net Kâr sansürlenip (ttmVal > 0) 3A*4 ile pozitife çevrilmemeli', () => {
    // 2025/03: -40M, 2025/12: -500M (Yılın kalan 9 ayında -460M devasa zarar), 2026/03: +20M
    // Gerçek TTM FAVÖK = +20M + (-500M) - (-40M) = -440M (Negatif!)
    const history = [
      { period: '2025/03', revenue: 200_000_000, ebitda: -40_000_000, net_income: -60_000_000, equity: 800_000_000, total_assets: 2_000_000_000, paid_in_capital: 100_000_000, net_debt: 500_000_000 },
      { period: '2025/06', revenue: 450_000_000, ebitda: -150_000_000, net_income: -200_000_000, equity: 660_000_000, total_assets: 2_000_000_000, paid_in_capital: 100_000_000, net_debt: 550_000_000 },
      { period: '2025/12', revenue: 1_000_000_000, ebitda: -500_000_000, net_income: -650_000_000, equity: 300_000_000, total_assets: 1_900_000_000, paid_in_capital: 100_000_000, net_debt: 700_000_000 },
      { period: '2026/03', revenue: 250_000_000, ebitda: 20_000_000, net_income: 5_000_000, equity: 305_000_000, total_assets: 1_920_000_000, paid_in_capital: 100_000_000, net_debt: 690_000_000 }
    ];

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'ZARARSAN',
        currency: 'TRY',
        share_count: 100_000_000,
        financial_history: history
      },
      sector: 'INDUSTRIAL',
      marketPrice: 12.0
    });

    assert.ok(
      res.valuation.valuation_model_name.includes('Sıkıntılı') || res.valuation.fair_value < 3.05,
      `Gerçek TTM FAVÖK negatif (-440M TL) iken şirket kârlı FD/FAVÖK modeline sokulamaz: ${res.valuation.valuation_model_name} (FV: ${res.valuation.fair_value})`
    );

    const trend = computeFairValueTrend(history, 'INDUSTRIAL', 100_000_000, 12.0);
    const lastPoint = trend[trend.length - 1];
    assert.ok(
      lastPoint.fairValue < 3.0,
      `computeFairValueTrend son çeyrekte TTM zararı sansürleyip şişirilmiş adil değer üretmemelidir (FV: ${lastPoint.fairValue})`
    );
  });

  await t.test('VULN-04 (Kritik): computeFairValueTrend küçük ölçekli Tam TL şirketi 1000x ile çarparak patlatmamalı', () => {
    const smallCapTamTlHistory = [
      { period: '2025/03', revenue: 80_000_000, ebitda: 16_000_000, net_income: 10_000_000, equity: 150_000_000, total_assets: 300_000_000, paid_in_capital: 50_000_000, net_debt: 20_000_000 },
      { period: '2025/06', revenue: 170_000_000, ebitda: 34_000_000, net_income: 22_000_000, equity: 162_000_000, total_assets: 320_000_000, paid_in_capital: 50_000_000, net_debt: 18_000_000 },
      { period: '2025/09', revenue: 260_000_000, ebitda: 52_000_000, net_income: 35_000_000, equity: 175_000_000, total_assets: 340_000_000, paid_in_capital: 50_000_000, net_debt: 15_000_000 },
      { period: '2025/12', revenue: 360_000_000, ebitda: 72_000_000, net_income: 48_000_000, equity: 190_000_000, total_assets: 360_000_000, paid_in_capital: 50_000_000, net_debt: 10_000_000 },
    ];

    const trend = computeFairValueTrend(smallCapTamTlHistory, 'INDUSTRIAL', 50_000_000, 10.0);
    for (const pt of trend) {
      assert.ok(
        pt.fairValue > 1 && pt.fairValue < 50,
        `Tam TL olan küçük ölçekli şirkette (Aktif 360M TL, Sermaye 50M Lot) adil değer 1000x patlamamalıdır (Hesaplanan: ${pt.fairValue})`
      );
    }
  });

  await t.test('VULN-05 (Kritik): FinancialRatioEngine ve Valuation arasında ROIC Yatırılan Sermaye (Aşırı Nakit indirimi) ve TMS 29 Reel WACC uyumu', () => {
    const rawHistory = [
      {
        period: '2025/12',
        revenue: 1_000_000_000,
        ebitda: 250_000_000,
        operating_profit: 200_000_000,
        net_income: 160_000_000,
        equity: 800_000_000,
        total_assets: 1_500_000_000,
        current_assets: 700_000_000,
        current_liabilities: 300_000_000,
        short_term_debt: 50_000_000,
        long_term_debt: 100_000_000,
        cash_and_equivalents: 400_000_000, // Net nakit: 400M > 150M borç; işletme nakdi %2 ciro = 20M, aşırı nakit = 380M
        is_tms29: true,
        real_wacc: 12.5,
        wacc: 42.0,
        paid_in_capital: 100_000_000
      }
    ];

    const metrics = FinancialRatioEngine.computeMetrics({
      ticker: 'NAKITZENGINI',
      history: rawHistory,
      currentPrice: 25.0,
      shareCount: 100_000_000,
      sector: 'INDUSTRIAL',
      currency: 'TRY'
    });

    // Invested Capital = Math.max(800M * 0.5, 800M - (400M - 20M)) = 420M
    // NOPAT = 200M * (1 - 0.25) = 150M -> ROIC = 150M / 420M = %35.7
    assert.ok(metrics.margins.roic > 35.0 && metrics.margins.roic < 36.5, `Aşırı nakit düşülmüş ROIC ~%35.7 olmalıdır (Hesaplanan: ${metrics.margins.roic})`);
    // TMS 29 altında benchmark_wacc = real_wacc (12.5) olmalı -> EVA Spread = 35.7 - 12.5 = +23.2 (> 0)
    assert.ok(metrics.margins.evaSpread > 20.0, `TMS 29 altında EVA Spread Reel WACC (%12.5) üzerinden pozitif hesaplanmalıdır (Hesaplanan: ${metrics.margins.evaSpread})`);
  });

  await t.test('VULN-06 (Orta): parseFinancialNumber negatif üslü bilimsel gösterimi (1e-5) 1e5 (100000) yapmamalı', () => {
    const val1 = parseFinancialNumber('1e-5');
    const val2 = parseFinancialNumber('-2.5e-4');
    const val3 = parseFinancialNumber('1,5E+6');

    assert.ok(Math.abs(val1 - 0.00001) < 1e-10, `'1e-5' değeri 0.00001 olarak parse edilmelidir (Hesaplanan: ${val1})`);
    assert.ok(Math.abs(val2 - (-0.00025)) < 1e-10, `'-2.5e-4' değeri -0.00025 olarak parse edilmelidir (Hesaplanan: ${val2})`);
    assert.equal(val3, 1_500_000, `'1,5E+6' değeri 1500000 olarak parse edilmelidir (Hesaplanan: ${val3})`);
  });

  await t.test('VULN-07 (Orta): RETAIL (Gıda Perakendesi) negatif işletme sermayesi / cari oran 0.72x muafiyeti Snowflake ile çelişmemeli', () => {
    const retailItem = {
      period: '2025/12',
      revenue: 500_000_000_000,
      ebitda: 25_000_000_000,
      operating_profit: 18_000_000_000,
      net_income: 12_000_000_000,
      equity: 45_000_000_000,
      total_assets: 160_000_000_000,
      current_assets: 65_000_000_000,
      current_liabilities: 90_000_000_000, // Cari oran = 0.72x (Tedarikçi fonlaması)
      net_debt: -15_000_000_000, // Net nakit
      operating_cash_flow: 28_000_000_000,
      free_cash_flow: 16_000_000_000,
      roic: 32.0,
      real_wacc: 12.0,
      is_tms29: true
    };

    const snow = calculateSnowflake({
      ticker: 'BIMAS',
      sector: 'RETAIL',
      currentPrice: 500,
      fairValue: 650,
      financialHistory: [retailItem],
      latestData: retailItem,
      multiples: { pe: 12.0, pb: 3.5, sectorPe: 15.0, sectorPb: 4.0 }
    });

    const stCheck = snow.axes.health.checks.find((c) => c.id === 'short_term_liabilities');
    assert.equal(stCheck?.passed, true, 'RETAIL sektöründe 0.72x cari oran (>= 0.55x eşik) kısa vadeli yükümlülük testinden geçmelidir');
    assert.ok(!snow.risks.some((r) => r.includes('Düşük Likidite')), 'RETAIL sektöründe 0.72x cari oran için yanlış Düşük Likidite riski üretilmemelidir');
  });

  await t.test('VULN-08 (Orta): Farklı çeyrek uzunlukları (2026/03 vs 2024/12) arasında CAGR hesaplanırken akım verileri yıllıklandırılmalı', () => {
    const crossQuarterHistory = [
      { period: '2024/12', revenue: 1_000_000_000, ebitda: 200_000_000, net_income: 100_000_000, equity: 600_000_000, paid_in_capital: 100_000_000, net_debt: 100_000_000 },
      { period: '2026/03', revenue: 360_000_000, ebitda: 72_000_000, net_income: 36_000_000, equity: 750_000_000, paid_in_capital: 100_000_000, net_debt: 80_000_000 }
    ];

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'BUYUMAS',
        currency: 'TRY',
        share_count: 100_000_000,
        financial_history: crossQuarterHistory
      },
      sector: 'INDUSTRIAL',
      marketPrice: 20.0
    });

    assert.equal(res.drivers.revenue_growth.value, 20.0, `2024/12 (1000M) -> 2026/03 (360M * 4 = 1440M) 2 yıllık CAGR %20.0 olmalıdır (Hesaplanan: ${res.drivers.revenue_growth.value})`);
    assert.equal(res.drivers.net_income_growth.value, 20.0, `2024/12 (100M) -> 2026/03 (36M * 4 = 144M) 2 yıllık net kâr CAGR %20.0 olmalıdır (Hesaplanan: ${res.drivers.net_income_growth.value})`);
  });

  await t.test('VULN-11 (Düşük): FinancialDataValidator kısa/uzun vadeli yükümlülük kırılımı yokken total_liabilities üzerinden pasif denkliğini doğrulamalı', () => {
    const itemWithTotalLiabOnly = {
      period: '2025/12',
      total_assets: 1_000_000_000,
      current_assets: 400_000_000,
      non_current_assets: 600_000_000,
      current_liabilities: null,
      long_term_liabilities: null,
      total_liabilities: 600_000_000,
      equity: 400_000_000
    };

    const validation = FinancialDataValidator.validateItem(itemWithTotalLiabOnly, 'INDUSTRIAL');
    assert.equal(validation.isValid, true);
    assert.ok(
      !validation.warnings.some((w) => w.includes('[Pasif Denkliği]')),
      `total_liabilities (600M) + equity (400M) == total_assets (1000M) iken yanlış Pasif Denkliği uyarısı üretilmemelidir: ${validation.warnings.join(', ')}`
    );
  });

  // ============================================================================
  // BÖLÜM 2: 3 SEKTÖR ARKETİPİ STRES VE UÇ DURUM (EDGE-CASE) SENARYOLARI
  // ============================================================================

  await t.test('SENARYO 1 (Gıda Perakendesi - RETAIL): Yüksek Hacim / Düşük Marj (%1.4 Net) / Negatif İşletme Sermayesi (Cari Oran 0.68x)', () => {
    const retailHistory = [
      { period: '2024/12', revenue: 400_000_000_000, ebitda: 18_000_000_000, operating_profit: 11_000_000_000, net_income: 5_600_000_000, equity: 38_000_000_000, total_assets: 140_000_000_000, current_assets: 55_000_000_000, current_liabilities: 81_000_000_000, net_debt: -12_000_000_000, operating_cash_flow: 22_000_000_000, free_cash_flow: 12_000_000_000, paid_in_capital: 600_000_000, roic: 28.0, real_wacc: 11.5, is_tms29: true },
      { period: '2025/12', revenue: 520_000_000_000, ebitda: 23_400_000_000, operating_profit: 14_500_000_000, net_income: 7_280_000_000, equity: 46_000_000_000, total_assets: 175_000_000_000, current_assets: 68_000_000_000, current_liabilities: 100_000_000_000, net_debt: -18_000_000_000, operating_cash_flow: 29_000_000_000, free_cash_flow: 17_000_000_000, paid_in_capital: 600_000_000, roic: 31.0, real_wacc: 11.5, is_tms29: true }
    ];

    const metrics = FinancialRatioEngine.computeMetrics({
      ticker: 'BIMAS',
      history: retailHistory,
      currentPrice: 200,
      shareCount: 600_000_000,
      sector: 'RETAIL',
      currency: 'TRY'
    });

    // 1. Cari oran 0.68x olmasına rağmen RETAIL negatif işletme sermayesi muafiyetiyle Value Trap tetiklenmemeli
    const trap = detectValueTrap({
      pe: 16.5,
      sectorPeMedian: 18.0,
      pb: 2.6,
      sectorPbMedian: 3.2,
      roe: metrics.margins.roe,
      wacc: metrics.margins.wacc,
      roic: metrics.margins.roic,
      netDebt: metrics.balanceSheet.netDebt,
      ebitda: metrics.ttm.ebitda,
      interestCoverage: 12.0,
      currentRatio: metrics.liquidity.currentRatio,
      sector: 'RETAIL'
    });
    assert.equal(trap.isValueTrap, false, `Güçlü nakit akışlı ve net nakit pozisyonundaki perakendeci Cari Oran 0.68x yüzünden Değer Tuzağı sayılmamalıdır: ${trap.reasons.join('; ')}`);

    // 2. Nakit Kalitesi EXCELLENT olmalı (OCF 29 Milyar > Net Kâr 7.28 Milyar * 1.1)
    assert.equal(metrics.cashQuality.status, 'EXCELLENT');
  });

  await t.test('SENARYO 2 (GYO & Ağır Altyapı - REIT): Düşük Kira Cirosu / Ekspertiz Kaynaklı Yüksek Muhasebe Kârı / Negatif OCF / Yüksek LTV (%58)', () => {
    const reitHistory = [
      { period: '2024/12', revenue: 1_000_000_000, ebitda: 600_000_000, net_income: 6_500_000_000, equity: 18_000_000_000, total_assets: 40_000_000_000, current_assets: 4_000_000_000, current_liabilities: 6_000_000_000, net_debt: 20_000_000_000, operating_cash_flow: -800_000_000, free_cash_flow: -2_500_000_000, capex: 1_700_000_000, paid_in_capital: 1_000_000_000 },
      { period: '2025/12', revenue: 1_200_000_000, ebitda: 700_000_000, net_income: 8_000_000_000, equity: 21_000_000_000, total_assets: 50_000_000_000, current_assets: 4_500_000_000, current_liabilities: 7_500_000_000, net_debt: 29_000_000_000, operating_cash_flow: -1_500_000_000, free_cash_flow: -4_000_000_000, capex: 2_500_000_000, paid_in_capital: 1_000_000_000 }
    ];

    // 1. GYO için EV/EBITDA ve EV/Sales anlamsızdır ve devre dışı olmalıdır
    assert.equal(isMetricDisabled('ev_ebitda', 'REIT'), true);
    assert.equal(isMetricDisabled('ev_sales', 'REIT'), true);

    // 2. Ekspertiz kârı (+8 Milyar TL) varken OCF negatif (-1.5 Milyar TL) -> CRITICAL_RISK (Kağıt Üzerinde Kâr)
    const cq = FinancialRatioEngine.diagnoseCashQuality(-1_500_000_000, 8_000_000_000, 50_000_000_000);
    assert.equal(cq.status, 'CRITICAL_RISK', 'Ekspertiz değerleme kârı yüksek ancak OCF negatif olan GYO CRITICAL_RISK olarak teşhis edilmelidir');

    // 3. Değerleme, Sektör Skoru (LTV %58 > %50) ve Nakit Akışı Vetosu (Bilanço Makyajı) kontrolü
    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'BORCLUGYO',
        currency: 'TRY',
        share_count: 1_000_000_000,
        financial_history: reitHistory
      },
      sector: 'REIT',
      marketPrice: 10.0
    });

    assert.ok(res.scoreResult.totalScore < 75, `Yüksek LTV (%58 > %50) ve negatif OCF olan GYO skoru sınırlandırılmalıdır (Hesaplanan: ${res.scoreResult.totalScore})`);
    assert.notEqual(res.optimization.finalDecision, 'GÜÇLÜ AL');
    assert.notEqual(res.optimization.finalDecision, 'AL');
  });

  await t.test('SENARYO 3 (Havacılık & Döviz Borçlu Döngüsel - AVIATION): Q1 Kış Zararı + Q3 Yaz Kârı Mevsimselliği ve Yüksek IFRS-16 Borç Kaldıracı', () => {
    const aviationHistory = [
      { period: '2025/03', revenue: 140_000_000_000, ebitda: 12_000_000_000, operating_profit: 6_000_000_000, net_income: -3_500_000_000, equity: 420_000_000_000, total_assets: 1_100_000_000_000, net_debt: 310_000_000_000, paid_in_capital: 1_380_000_000, roic: 14.0, real_wacc: 9.5, is_foreign_currency: true, currency: 'USD' },
      { period: '2025/06', revenue: 340_000_000_000, ebitda: 48_000_000_000, operating_profit: 32_000_000_000, net_income: 22_000_000_000, equity: 450_000_000_000, total_assets: 1_150_000_000_000, net_debt: 315_000_000_000, paid_in_capital: 1_380_000_000, roic: 15.0, real_wacc: 9.5, is_foreign_currency: true, currency: 'USD' },
      { period: '2025/12', revenue: 780_000_000_000, ebitda: 110_000_000_000, operating_profit: 80_000_000_000, net_income: 65_000_000_000, equity: 510_000_000_000, total_assets: 1_250_000_000_000, net_debt: 320_000_000_000, paid_in_capital: 1_380_000_000, roic: 16.5, real_wacc: 9.5, is_foreign_currency: true, currency: 'USD' },
      { period: '2026/03', revenue: 165_000_000_000, ebitda: 14_000_000_000, operating_profit: 7_500_000_000, net_income: -4_000_000_000, equity: 506_000_000_000, total_assets: 1_260_000_000_000, net_debt: 320_000_000_000, paid_in_capital: 1_380_000_000, roic: 16.0, real_wacc: 9.5, is_foreign_currency: true, currency: 'USD' }
    ];

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'THYAO',
        currency: 'TRY',
        share_count: 1_380_000_000,
        financial_history: aviationHistory
      },
      sector: 'AVIATION',
      marketPrice: 280.0
    });

    assert.equal(res.valuation.is_insolvent, false, 'TTM FAVÖK (112 Milyar TL) sayesinde kış çeyreğinde (Q1) havacılık şirketi iflas etmiş sayılmamalıdır');
    assert.ok(
      res.valuation.fair_value !== null && res.valuation.fair_value > 250,
      `Havacılık TTM bazlı adil değer kış çeyreği yüzünden çökmemelidir (Hesaplanan FV: ${res.valuation.fair_value})`
    );
  });

  // ============================================================================
  // BÖLÜM 3: PROPERTY-BASED (FUZZING) VE MATEMATİKSEL DEĞİŞMEZLİK (INVARIANT) TESTLERİ
  // ============================================================================

  await t.test('INVARIANT A (Birim Ölçek Homojenliği): f(1000 * x, "Tam TL") === f(x, "Bin TL") (50 Rastgele Bilanço)', () => {
    const rand = mulberry32(20261022);

    for (let i = 0; i < 50; i++) {
      const shares = Math.round((50 + rand() * 500)) * 1_000_000;
      const revBin = Math.round(500_000 + rand() * 20_000_000);
      const ebitdaMargin = 0.08 + rand() * 0.25;
      const netMargin = 0.03 + rand() * 0.15;
      const ebitdaBin = Math.round(revBin * ebitdaMargin);
      const netBin = Math.round(revBin * netMargin);
      const eqBin = Math.round(revBin * (0.4 + rand() * 0.8));
      const debtBin = Math.round(ebitdaBin * (rand() * 3.5));
      const paidCapBin = Math.round(shares / 1000);
      const price = Number((10 + rand() * 200).toFixed(2));

      const itemBin = {
        period: '2025/12',
        revenue: revBin,
        ebitda: ebitdaBin,
        operating_profit: Math.round(ebitdaBin * 0.85),
        net_income: netBin,
        equity: eqBin,
        total_assets: eqBin + debtBin + Math.round(revBin * 0.2),
        current_assets: Math.round(revBin * 0.35),
        current_liabilities: Math.round(revBin * 0.25),
        net_debt: debtBin,
        paid_in_capital: paidCapBin,
        roic: 22.0,
        real_wacc: 12.0,
        is_tms29: true
      };

      const itemTam = {
        ...itemBin,
        revenue: revBin * 1000,
        ebitda: ebitdaBin * 1000,
        operating_profit: itemBin.operating_profit * 1000,
        net_income: netBin * 1000,
        equity: eqBin * 1000,
        total_assets: itemBin.total_assets * 1000,
        current_assets: itemBin.current_assets * 1000,
        current_liabilities: itemBin.current_liabilities * 1000,
        net_debt: debtBin * 1000,
        paid_in_capital: paidCapBin * 1000
      };

      const valBin = computeSectorValuationAndDrivers({
        extractedData: { ticker: 'INVTEST', currency: 'Bin TRY', share_count: shares, financial_history: [itemBin] },
        sector: 'INDUSTRIAL',
        marketPrice: price
      });

      const valTam = computeSectorValuationAndDrivers({
        extractedData: { ticker: 'INVTEST', currency: 'Tam TRY', share_count: shares, financial_history: [itemTam] },
        sector: 'INDUSTRIAL',
        marketPrice: price
      });

      assert.equal(
        valBin.valuation.fair_value,
        valTam.valuation.fair_value,
        `Deneme #${i}: Bin TL (${valBin.valuation.fair_value}) ve Tam TL (${valTam.valuation.fair_value}) içsel değerleri birebir aynı olmalıdır`
      );

      const multBin = calculateCompanyMultiples('INVTEST', 'INDUSTRIAL', itemBin, price, shares, 'TRY');
      const multTam = calculateCompanyMultiples('INVTEST', 'INDUSTRIAL', itemTam, price, shares, 'TRY');
      assert.equal(multBin.multiples.pe.companyValue, multTam.multiples.pe.companyValue, `Deneme #${i}: F/K ölçekten bağımsız olmalıdır`);
      assert.equal(multBin.multiples.pb.companyValue, multTam.multiples.pb.companyValue, `Deneme #${i}: PD/DD ölçekten bağımsız olmalıdır`);
    }
  });

  await t.test('INVARIANT B & C (Piyasa Fiyatı Bağımsızlığı & Net Borç Monotonluğu - 50 Rastgele Senaryo)', () => {
    const rand = mulberry32(99887766);

    for (let i = 0; i < 50; i++) {
      const shares = 100_000_000;
      const rev = (1_000 + Math.round(rand() * 9_000)) * 1_000_000;
      const ebitda = Math.round(rev * (0.12 + rand() * 0.20));
      const netInc = Math.round(ebitda * 0.6);
      const eq = Math.round(rev * 0.6);
      const baseDebt = Math.round(ebitda * (0.5 + rand() * 1.5));
      const higherDebt = baseDebt + Math.round(ebitda * 0.8);

      const baseItem = {
        period: '2025/12',
        revenue: rev,
        ebitda,
        net_income: netInc,
        equity: eq,
        net_debt: baseDebt,
        paid_in_capital: shares,
        roic: 20,
        real_wacc: 12,
        is_tms29: true
      };

      // Invariant B: Piyasa fiyatı 10 TL vs 5.000 TL iken Katman-1 Adil Değer değişmemeli
      const resLowPrice = computeSectorValuationAndDrivers({
        extractedData: { ticker: 'MONOTEST', currency: 'TRY', share_count: shares, financial_history: [baseItem] },
        sector: 'INDUSTRIAL',
        marketPrice: 10.0
      });
      const resHighPrice = computeSectorValuationAndDrivers({
        extractedData: { ticker: 'MONOTEST', currency: 'TRY', share_count: shares, financial_history: [baseItem] },
        sector: 'INDUSTRIAL',
        marketPrice: 5000.0
      });
      assert.equal(resLowPrice.valuation.fair_value, resHighPrice.valuation.fair_value, 'Katman 1 Adil Değer piyasa fiyatından %100 bağımsız olmalıdır');

      // Invariant C: Net borç arttığında (operasyonlar sabitken) Adil Değer asla artmamalı (dFV / dNetDebt <= 0)
      const resHigherDebt = computeSectorValuationAndDrivers({
        extractedData: {
          ticker: 'MONOTEST',
          currency: 'TRY',
          share_count: shares,
          financial_history: [{ ...baseItem, net_debt: higherDebt }]
        },
        sector: 'INDUSTRIAL',
        marketPrice: 50.0
      });

      assert.ok(
        resHigherDebt.valuation.fair_value <= resLowPrice.valuation.fair_value,
        `Deneme #${i}: Net borç arttığında adil değer artamaz (Düşük Borç FV: ${resLowPrice.valuation.fair_value}, Yüksek Borç FV: ${resHigherDebt.valuation.fair_value})`
      );
    }
  });

  await t.test('INVARIANT D & E (Sıfıra Bölünme, NaN/Infinity Bağışıklığı ve TTK 376 İflas Sınırı Fuzzing - 100 Uç Durum)', () => {
    const rand = mulberry32(13579246);
    const sectors = ['INDUSTRIAL', 'RETAIL', 'REIT', 'AVIATION', 'TECH', 'BANKING', 'INSURANCE', 'HOLDING', 'ENERGY'];
    const extremePool = [0, -0, 1, -1, 1e-8, -1e-8, 1e14, -1e14, null, undefined, '0', '-0', '(1.250,50)', '1e-5', 'N/A', '---'];

    const pickExtreme = () => extremePool[Math.floor(rand() * extremePool.length)];

    for (let i = 0; i < 100; i++) {
      const sector = sectors[i % sectors.length];
      const fuzzedItem = {
        period: i % 2 === 0 ? '2025/12' : '2026/03',
        revenue: parseFinancialNumber(pickExtreme()),
        ebitda: parseFinancialNumber(pickExtreme()),
        operating_profit: parseFinancialNumber(pickExtreme()),
        net_income: parseFinancialNumber(pickExtreme()),
        equity: parseFinancialNumber(pickExtreme()),
        total_assets: parseFinancialNumber(pickExtreme()),
        current_assets: parseFinancialNumber(pickExtreme()),
        current_liabilities: parseFinancialNumber(pickExtreme()),
        long_term_liabilities: parseFinancialNumber(pickExtreme()),
        short_term_debt: parseFinancialNumber(pickExtreme()),
        long_term_debt: parseFinancialNumber(pickExtreme()),
        cash_and_equivalents: parseFinancialNumber(pickExtreme()),
        net_debt: parseFinancialNumber(pickExtreme()),
        operating_cash_flow: parseFinancialNumber(pickExtreme()),
        free_cash_flow: parseFinancialNumber(pickExtreme()),
        paid_in_capital: parseFinancialNumber(pickExtreme()),
        roic: parseFinancialNumber(pickExtreme()),
        wacc: parseFinancialNumber(pickExtreme())
      };

      const metrics = FinancialRatioEngine.computeMetrics({
        ticker: 'FUZZ',
        history: [fuzzedItem],
        currentPrice: i % 7 === 0 ? 0 : 25.0,
        shareCount: i % 5 === 0 ? 0 : 100_000_000,
        sector,
        currency: 'TRY'
      });

      // Hiçbir sayısal alan NaN veya ±Infinity olmamalıdır
      for (const group of [metrics.ttm, metrics.balanceSheet, metrics.valuation, metrics.margins, metrics.liquidity]) {
        for (const [k, v] of Object.entries(group)) {
          if (typeof v === 'number') {
            assert.ok(Number.isFinite(v), `FinancialRatioEngine Deneme #${i} (${sector}): '${k}' alanı sonlu sayı olmalıdır (Değer: ${v})`);
          }
        }
      }

      const valRes = computeSectorValuationAndDrivers({
        extractedData: {
          ticker: 'FUZZ',
          currency: 'TRY',
          share_count: i % 5 === 0 ? 0 : 100_000_000,
          financial_history: [fuzzedItem]
        },
        sector,
        marketPrice: i % 7 === 0 ? 0 : 25.0
      });

      if (valRes.valuation.fair_value !== null) {
        assert.ok(
          Number.isFinite(valRes.valuation.fair_value) && valRes.valuation.fair_value >= 0,
          `Valuation Deneme #${i} (${sector}): fair_value sonlu ve >= 0 olmalıdır (Değer: ${valRes.valuation.fair_value})`
        );
      }

      const dupont = calculateDuPont5Step(fuzzedItem, undefined, sector, 'FUZZ');
      for (const [k, v] of Object.entries(dupont)) {
        if (typeof v === 'number') {
          assert.ok(Number.isFinite(v), `DuPont Deneme #${i} (${sector}): '${k}' alanı NaN/Infinity olmamalıdır`);
        }
      }

      const snow = calculateSnowflake({
        ticker: 'FUZZ',
        sector,
        currentPrice: 25.0,
        fairValue: valRes.valuation.fair_value ?? 0,
        financialHistory: [fuzzedItem],
        latestData: fuzzedItem
      });

      assert.ok(Number.isFinite(snow.totalScore) && snow.totalScore >= 0 && snow.totalScore <= 30, `Snowflake totalScore [0, 30] aralığında sonlu olmalıdır: ${snow.totalScore}`);
    }
  });
});
