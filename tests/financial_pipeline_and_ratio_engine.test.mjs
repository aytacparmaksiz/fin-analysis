import test from 'node:test';
import assert from 'node:assert/strict';

import { IsYatirimApiAdapter } from '../lib/isyatirim-adapter.ts';
import { FinancialDataValidator } from '../lib/financial-validator.ts';
import { FinancialRatioEngine } from '../lib/ratio-engine.ts';

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
});
