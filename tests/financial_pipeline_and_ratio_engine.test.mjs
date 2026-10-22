import test from 'node:test';
import assert from 'node:assert/strict';

import { IsYatirimApiAdapter } from '../lib/isyatirim-adapter.ts';
import { FinancialDataValidator } from '../lib/financial-validator.ts';
import { FinancialRatioEngine, computeFinancialChange } from '../lib/ratio-engine.ts';
import { calculateDuPont5Step, detectValueTrap, computeFairValueTrend, computeSectorValuationAndDrivers } from '../lib/valuation.ts';

test('Financial Pipeline & Ratio Engine Architecture Test Suite', async (t) => {

  await t.test('1. IsYatirimApiAdapter: TFRS-compliant Esas Faaliyet Kârı Mapping (3HACA vs 3H)', () => {
    // Ham İş Yatırım XI_29 periyot sözlüğü simülasyonu
    const mockDict = {
      'code_3C': 100_000_000, // Satışlar
      'code_3D': 30_000_000,  // Brüt Kâr
      'code_3H': 15_000_000,  // Ham Net Faaliyet Kârı (Sadece Brüt Kâr - Faaliyet Gid.)
      'code_3DD': 5_000_000,  // Diğer Faaliyet Gelirleri
      'code_3DE': 2_000_000,  // Diğer Faaliyet Giderleri
      'code_3HACA': 18_000_000, // TFRS Esas Faaliyet Kârı (FAALİYET KARI / Finansman Gideri Öncesi)
      'code_1A': 40_000_000,  // Dönen Varlıklar
      'code_1AK': 60_000_000, // Top-level Duran Varlıklar
      'code_1Z': 100_000_000, // Toplam Aktifler
      'code_2A': 30_000_000,  // Kısa Vadeli Yükümlülükler
      'code_2B': 20_000_000,  // Uzun Vadeli Yükümlülükler
      'code_2N': 50_000_000,  // Özkaynaklar
      'code_2NA': 10_000_000, // Ödenmiş Sermaye
      'code_4C': 22_000_000,  // Resmi İşletme Faaliyetlerinden Net Nakit (OCF)
      'code_4CB': 14_000_000, // Resmi Serbest Nakit Akım (FCF)
      'code_3Z': 12_000_000   // Net Dönem Kârı
    };

    const mapped = IsYatirimApiAdapter.mapPeriodDictionary('2026/06', mockDict, {
      ticker: 'TEST',
      sector: 'INDUSTRIAL'
    });

    // Kural 1: Esas Faaliyet Kârı kesinlikle 3HACA (18 Mn) olmalı, 3H (15 Mn) olmamalı!
    assert.equal(mapped.operating_profit, 18_000_000, 'operating_profit must equal 3HACA (18 Mn), NOT raw 3H');
    assert.equal(mapped.operating_income, 18_000_000);

    // Kural 2: Duran Varlıklar top-level 1AK doğrudan alınmalı (60 Mn)
    assert.equal(mapped.non_current_assets, 60_000_000);
    assert.equal(mapped.total_assets, 100_000_000);

    // Kural 3: Resmi OCF ve FCF doğrudan alınmalı
    assert.equal(mapped.operating_cash_flow, 22_000_000);
    assert.equal(mapped.free_cash_flow, 14_000_000);
    assert.equal(mapped.capex, 8_000_000); // |22 - 14| = 8 Mn
  });

  await t.test('2. IsYatirimApiAdapter: Fallback to 3H + 3DD - 3DE when 3HACA is missing', () => {
    const mockDict = {
      'code_3C': 50_000_000,
      'code_3D': 20_000_000,
      'code_3H': 10_000_000, // Raw operating profit
      'code_3DD': 4_000_000,  // Other op income
      'code_3DE': 1_500_000,  // Other op expense
      'code_1A': 25_000_000,
      'code_1AK': 35_000_000,
      'code_1Z': 60_000_000
    };

    const mapped = IsYatirimApiAdapter.mapPeriodDictionary('2026/06', mockDict, {
      ticker: 'TEST',
      sector: 'INDUSTRIAL'
    });

    // 10 + 4 - 1.5 = 12.5 Mn
    assert.equal(mapped.operating_profit, 12_500_000);
  });

  await t.test('3. FinancialDataValidator: Validates Aktif Toplamı == Dönen + Duran and Pasif Denkliği', () => {
    const invalidItem = {
      period: '2026/06',
      revenue: 100_000,
      gross_profit: 30_000,
      operating_profit: 15_000,
      net_income: 10_000,
      current_assets: 34_000_000,
      non_current_assets: 64_000_000,
      total_assets: 132_000_000, // HATA: Duran yerine Toplam Aktif eklenip 132 yapılmış (Vestel örneği!)
      current_liabilities: 40_000_000,
      long_term_liabilities: 30_000_000,
      equity: 28_000_000
    };

    const report = FinancialDataValidator.validateItem(invalidItem, 'INDUSTRIAL');

    // Validator tutarsızlığı tespit etmeli ve Dönen + Duran toplamına (98 Mn) iyileştirmeli (Self-Healing)
    assert.ok(report.warnings.length > 0);
    assert.equal(report.reconciledItem.total_assets, 98_000_000);
  });

  await t.test('4. FinancialRatioEngine: Single Source of Truth Metrics Calculation', () => {
    const history = [
      {
        period: '2025/06',
        revenue: 80_000_000,
        gross_profit: 24_000_000,
        operating_profit: 12_000_000,
        ebitda: 15_000_000,
        net_income: 9_000_000,
        current_assets: 30_000_000,
        non_current_assets: 50_000_000,
        total_assets: 80_000_000,
        current_liabilities: 25_000_000,
        long_term_liabilities: 15_000_000,
        equity: 40_000_000,
        cash_and_equivalents: 8_000_000,
        short_term_debt: 10_000_000,
        long_term_debt: 10_000_000,
        operating_cash_flow: 11_000_000,
        free_cash_flow: 7_000_000
      },
      {
        period: '2026/06',
        revenue: 120_000_000,
        gross_profit: 36_000_000,
        operating_profit: 20_000_000,
        ebitda: 25_000_000,
        net_income: 16_000_000,
        current_assets: 45_000_000,
        non_current_assets: 65_000_000,
        total_assets: 110_000_000,
        current_liabilities: 30_000_000,
        long_term_liabilities: 20_000_000,
        equity: 60_000_000,
        cash_and_equivalents: 15_000_000,
        short_term_debt: 12_000_000,
        long_term_debt: 15_000_000,
        operating_cash_flow: 20_000_000,
        free_cash_flow: 14_000_000
      }
    ];

    const metrics = FinancialRatioEngine.computeMetrics({
      ticker: 'KOD',
      history,
      currentPrice: 50,
      shareCount: 2_000_000, // Market Cap = 100 Mn TL
      sector: 'INDUSTRIAL',
      currency: 'TRY'
    });

    // 1. Piyasa Değeri ve Net Borç
    assert.equal(metrics.valuation.marketCap, 100_000_000);
    // Net Borç = (12 + 15) - 15 = 12 Mn TL
    assert.equal(metrics.balanceSheet.netDebt, 12_000_000);
    // Firma Değeri = 100 + 12 = 112 Mn TL
    assert.equal(metrics.valuation.enterpriseValue, 112_000_000);

    // 2. Kârlılık ve Marjlar
    assert.ok(metrics.margins.operatingMargin !== null);
    assert.ok(metrics.margins.ebitdaMargin !== null);
    assert.ok(metrics.margins.roe !== null);
    assert.ok(metrics.margins.roic !== null);

    // 3. Kâr Kalitesi & Nakit Akışı Teşhisi
    assert.equal(metrics.cashQuality.status, 'EXCELLENT');
    assert.ok(metrics.cashQuality.cashConversionRatio !== null && metrics.cashQuality.cashConversionRatio > 1.0);

    // 4. DuPont 5-Aşamalı Ayrıştırma
    assert.ok(metrics.dupont !== null);
    assert.ok(metrics.dupont.calculatedRoe > 0);
  });

  await t.test('5. TTM Standard: Exact formula TTM = (2026/06) + (2025/12) - (2025/06)', () => {
    const series = [
      { period: '2025/06', revenue: 500, net_income: 50 },
      { period: '2025/12', revenue: 1200, net_income: 140 },
      { period: '2026/06', revenue: 700, net_income: 90 }
    ];

    const ttm = FinancialRatioEngine.calculateTtmFinancials(series, series[2], 'INDUSTRIAL', 1.0);
    // TTM revenue = 700 + 1200 - 500 = 1400
    assert.equal(ttm.revenue, 1400);
    // TTM net income = 90 + 140 - 50 = 180
    assert.equal(ttm.netIncome, 180);
    assert.equal(ttm.isAnnualizedFallback, false);

    // Year-end period (2025/12) directly uses year-end data
    const ttmYearEnd = FinancialRatioEngine.calculateTtmFinancials(series, series[1], 'INDUSTRIAL', 1.0);
    assert.equal(ttmYearEnd.revenue, 1200);
    assert.equal(ttmYearEnd.netIncome, 140);
    assert.equal(ttmYearEnd.isAnnualizedFallback, false);
  });

  await t.test('6. computeFinancialChange: Zarardan Kâra Geçiş ve Negatif Taban Büyüme Semantiği', () => {
    // 1. Zarardan kâra geçiş -> "Kâra Geçti" (Yeşil)
    const toProfit = computeFinancialChange(528_000_000, -1_900_000_000, 'PROFIT');
    assert.equal(toProfit.formattedLabel, 'Kâra Geçti');
    assert.equal(toProfit.badgeColor, 'green');
    assert.equal(toProfit.isTextStatus, true);

    // 2. Kârdan zarara geçiş -> "Zarara Geçti" (Kırmızı)
    const toLoss = computeFinancialChange(-200_000, 500_000, 'PROFIT');
    assert.equal(toLoss.formattedLabel, 'Zarara Geçti');
    assert.equal(toLoss.badgeColor, 'red');
    assert.equal(toLoss.isTextStatus, true);

    // 3. İki dönem de negatif - Zarar Azaldı (-100 -> -50) -> "Zarar Azaldı (%50)" (Yeşil)
    const lossReduced = computeFinancialChange(-50_000, -100_000, 'PROFIT');
    assert.equal(lossReduced.formattedLabel, 'Zarar Azaldı (%50)');
    assert.equal(lossReduced.badgeColor, 'green');
    assert.equal(lossReduced.isTextStatus, true);

    // 4. İki dönem de negatif - Zarar Arttı (-50 -> -100) -> "Zarar Arttı (%100)" (Kırmızı)
    const lossIncreased = computeFinancialChange(-100_000, -50_000, 'PROFIT');
    assert.equal(lossIncreased.formattedLabel, 'Zarar Arttı (%100)');
    assert.equal(lossIncreased.badgeColor, 'red');
    assert.equal(lossIncreased.isTextStatus, true);
  });

  await t.test('7. computeFinancialChange: Net Borç Semantiği (Borç Azalışı = YEŞİL, Borç Artışı = KIRMIZI)', () => {
    // 1. Borç azaldı (1000 -> 500: -50%) -> KESİNLİKLE YEŞİL!
    const debtReduced = computeFinancialChange(500, 1000, 'DEBT');
    assert.equal(debtReduced.formattedLabel, '-%50');
    assert.equal(debtReduced.badgeColor, 'green');

    // 2. Borç arttı (500 -> 1000: +100%) -> KESİNLİKLE KIRMIZI!
    const debtIncreased = computeFinancialChange(1000, 500, 'DEBT');
    assert.equal(debtIncreased.formattedLabel, '+%100');
    assert.equal(debtIncreased.badgeColor, 'red');

    // 3. Borçtan net nakde geçiş (500 -> -200) -> "Net Nakde Geçti" (Yeşil)
    const toNetCash = computeFinancialChange(-200, 500, 'DEBT');
    assert.equal(toNetCash.formattedLabel, 'Net Nakde Geçti');
    assert.equal(toNetCash.badgeColor, 'green');

    // 4. Net nakitten borca geçiş (-200 -> 300) -> "Net Borca Geçti" (Kırmızı)
    const toNetDebt = computeFinancialChange(300, -200, 'DEBT');
    assert.equal(toNetDebt.formattedLabel, 'Net Borca Geçti');
    assert.equal(toNetDebt.badgeColor, 'red');

    // 5. Nötr büyüklük (Toplam Varlıklar 100 -> 150) -> neutral renk
    const assetsChange = computeFinancialChange(150, 100, 'NEUTRAL');
    assert.equal(assetsChange.badgeColor, 'neutral');
  });

  await t.test('8. DuPont 5-Step Identity assertion with mapped EBT', () => {
    const item = {
      period: '2026/06',
      revenue: 100_000,
      ebit: 15_000,
      ebt: 12_000,
      net_income: 9_000,
      total_assets: 80_000,
      equity: 40_000,
      sector: 'INDUSTRIAL'
    };

    const dupont = calculateDuPont5Step(item);
    assert.ok(dupont.hasData);
    // Tax Burden = Net Income / EBT = 9000 / 12000 = 0.75
    assert.equal(dupont.taxBurden, 0.75);
    // Interest Burden = EBT / EBIT = 12000 / 15000 = 0.8
    assert.equal(dupont.interestBurden, 0.8);
    // Tax Burden * Interest Burden = 0.75 * 0.8 = 0.6 = Net Income / EBIT (9000 / 15000)
    const product = Number((dupont.taxBurden * dupont.interestBurden).toFixed(3));
    assert.equal(product, 0.6);
  });

  await t.test('9. detectValueTrap: Detects Value Trap when paper discount >= 20% with ROIC < WACC and margin erosion', () => {
    const history = [
      {
        period: '2025/09',
        revenue: 100_000,
        ebitda: 20_000,
        net_income: 12_000,
        equity: 80_000,
        net_debt: 60_000,
        roic: 14.0,
        benchmark_wacc: 28.0
      },
      {
        period: '2025/12',
        revenue: 105_000,
        ebitda: 15_000,
        net_income: 8_000,
        equity: 85_000,
        net_debt: 70_000,
        roic: 8.0,
        benchmark_wacc: 28.0
      },
      {
        period: '2026/03',
        revenue: 110_000,
        ebitda: 11_000,
        net_income: 3_000,
        equity: 88_000,
        net_debt: 85_000,
        roic: -2.5,
        benchmark_wacc: 28.0,
        free_cash_flow: -5_000
      }
    ];

    // Fiyat 100 TL, Adil Değer 140 TL (%40 kağıt üzerinde iskonto)
    const result = detectValueTrap(history, 100, 140, 'INDUSTRIAL');
    assert.equal(result.isValueTrap, true, 'Must flag isValueTrap = true');
    assert.ok(result.severity === 'HIGH' || result.severity === 'CRITICAL');
    assert.ok(result.reasons.length >= 2, 'Must have at least 2 red flag reasons');
    assert.match(result.warningTitle, /DEĞER TUZAĞI/i);
  });

  await t.test('10. computeFairValueTrend: Calculates chronological quarterly fair values without NaN or null', () => {
    const full = { roe: 15, roic: 20, wacc: 28, current_ratio: 1.4 };
    const history = [
      { period: '2025/06', revenue: 80_000, ebitda: 16_000, net_income: 9_000, equity: 60_000, net_debt: 20_000, ...full },
      { period: '2025/09', revenue: 88_000, ebitda: 17_000, net_income: 10_000, equity: 68_000, net_debt: 22_000, ...full },
      { period: '2025/12', revenue: 95_000, ebitda: 18_000, net_income: 11_000, equity: 75_000, net_debt: 24_000, ...full },
      { period: '2026/03', revenue: 100_000, ebitda: 19_000, net_income: 12_000, equity: 82_000, net_debt: 25_000, ...full }
    ];

    const trend = computeFairValueTrend(history, 'INDUSTRIAL', 10_000, undefined, undefined, 6.0);
    assert.ok(trend.length >= 2, 'Should compute trend points');
    for (const pt of trend) {
      assert.ok(pt.fairValue > 0, `fairValue must be positive, got ${pt.fairValue}`);
      assert.ok(!isNaN(pt.fairValue), 'fairValue must not be NaN');
      assert.ok(pt.period.length > 0, 'period must be non-empty');
    }

    // Sıfır sentetik veri: ROIC/WACC/ROE ve hedef çarpan yoksa dönem için değer UYDURULMAZ.
    const bare = history.map(({ period, revenue, ebitda, net_income, equity, net_debt }) => ({ period, revenue, ebitda, net_income, equity, net_debt }));
    const bareTrend = computeFairValueTrend(bare, 'INDUSTRIAL', 10_000);
    assert.equal(bareTrend.length, 0, 'Eksik girdide adil değer noktası üretilmemeli');
  });

  await t.test('11. computeSectorValuationAndDrivers: Applies EVA haircut and debt distress penalty on distressed value-destroying companies', () => {
    const extractedData = {
      ticker: 'DISTRESSED',
      sector: 'INDUSTRIAL',
      share_count: 10_000_000,
      currency: 'TRY',
      financial_history: [
        {
          period: '2026/06',
          revenue: 100_000_000,
          ebitda: 10_000_000,
          net_income: 2_000_000,
          equity: 30_000_000,
          net_debt: 95_000_000, // Net Debt / EBITDA(annualized 20M) = 4.75x (> 4.0x threshold!)
          roic: -5.0, // ROIC negative (< WACC)
          wacc: 30.0,
          operating_cash_flow: -3_000_000,
          free_cash_flow: -8_000_000
        }
      ]
    };

    const res = computeSectorValuationAndDrivers({
      extractedData,
      sector: 'INDUSTRIAL',
      marketPrice: 20.0
    });

    assert.equal(res.valuation.eva_haircut_applied, true, 'EVA haircut must be applied for ROIC < 0');
    assert.ok(res.valuation.eva_discount_pct && res.valuation.eva_discount_pct > 0, 'EVA discount pct must be > 0');
    assert.ok(res.valuation.debt_distress_discount_pct && res.valuation.debt_distress_discount_pct > 0, 'Debt distress discount pct must be > 0');
  });
});
