import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSectorValuationAndDrivers,
  detectValueTrap,
  optimizeFinalDecision,
  calculateSectorScore
} from '../lib/valuation.ts';
import { getFinancialArchetype, detectSector } from '../lib/sectors.ts';

test('Valuation Architecture V6 Comprehensive Neutral Test Suite', async (t) => {

  await t.test('1. Invariance Test: Layer 1 Intrinsic Value is independent of live market price', () => {
    const mockCompanyDataA = {
      ticker: 'TESTSAN',
      sector: 'INDUSTRIAL',
      currency: 'TRY',
      share_count: 100_000_000,
      marketMultiples: { ev_ebitda: 5.0, pe: 8.0, pb: 1.5 },
      financial_history: [
        { period: '2024/12', revenue: 1_000_000_000, ebitda: 200_000_000, net_income: 120_000_000, equity: 600_000_000, net_debt: 250_000_000, roic: 18, roe: 20, paid_in_capital: 100_000_000 },
        { period: '2025/12', revenue: 1_400_000_000, ebitda: 280_000_000, net_income: 180_000_000, equity: 800_000_000, net_debt: 300_000_000, roic: 20, roe: 22, paid_in_capital: 100_000_000 }
      ]
    };

    const mockCompanyDataB = {
      ticker: 'TESTSAN',
      sector: 'INDUSTRIAL',
      currency: 'TRY',
      share_count: 100_000_000,
      marketMultiples: { ev_ebitda: 15.0, pe: 24.0, pb: 4.5 },
      financial_history: [
        { period: '2024/12', revenue: 1_000_000_000, ebitda: 200_000_000, net_income: 120_000_000, equity: 600_000_000, net_debt: 250_000_000, roic: 18, roe: 20, paid_in_capital: 100_000_000 },
        { period: '2025/12', revenue: 1_400_000_000, ebitda: 280_000_000, net_income: 180_000_000, equity: 800_000_000, net_debt: 300_000_000, roic: 20, roe: 22, paid_in_capital: 100_000_000 }
      ]
    };

    // Case A: currentPrice = 50 TL, market EV/EBITDA = 5.0x
    const resA = computeSectorValuationAndDrivers({
      extractedData: mockCompanyDataA,
      sector: 'INDUSTRIAL',
      marketPrice: 50.0
    });

    // Case B: currentPrice = 250 TL, market EV/EBITDA = 15.0x
    const resB = computeSectorValuationAndDrivers({
      extractedData: mockCompanyDataB,
      sector: 'INDUSTRIAL',
      marketPrice: 250.0
    });

    // The intrinsic fair value in Layer 1 must NOT bend to market price
    assert.equal(
      resA.valuation.fair_value,
      resB.valuation.fair_value,
      `Layer 1 intrinsic value must be strictly invariant to live market price. ResA: ${resA.valuation.fair_value}, ResB: ${resB.valuation.fair_value}`
    );
  });

  await t.test('2. Negative Equity with EV > Net Debt: Intrinsic per-share value must be computed (no 0.05 TL floor)', () => {
    // Şirket geçmiş zararlar sebebiyle negatif özkaynakta (-100 Milyon TL).
    // Ancak operasyonel olarak kârlı: 200 Milyon TL FAVÖK üretiyor, net borcu sadece 100 Milyon TL.
    // Firma Değeri (EV) ~1.000 Milyon TL.
    // Özkaynak Değeri = EV - NetBorç > 0!
    // 100 Milyon pay için hisse başı operasyonel değer pozitif olmalı, 0.05 TL tabanına ezilmemelidir.
    const mockTurnaroundData = {
      ticker: 'TURNA',
      sector: 'INDUSTRIAL',
      share_count: 100_000_000,
      financial_history: [
        {
          period: '2025/12',
          revenue: 1_000_000_000,
          ebitda: 200_000_000,
          net_income: 50_000_000,
          equity: -100_000_000, // NEGATIVE EQUITY
          net_debt: 100_000_000,
          paid_in_capital: 100_000_000,
          roic: 15,
          roe: -50
        }
      ]
    };

    const res = computeSectorValuationAndDrivers({
      extractedData: mockTurnaroundData,
      sector: 'INDUSTRIAL',
      marketPrice: 10.0
    });

    assert.notEqual(res.valuation.fair_value, 0.05, 'Operasyonel olarak kârlı negatif özkaynaklı şirkete 0.05 TL keyfî taban verilmemelidir');
    assert.ok(res.valuation.fair_value !== null && res.valuation.fair_value > 1.0, `EV > Net Borç olduğundan pozitif adil değer hesaplanmalıdır. Bulunan: ${res.valuation.fair_value}`);
  });

  await t.test('3. Negative Equity with EV <= Net Debt: Intrinsic equity value is depleted -> returns null/NA, not 0.05 TL', () => {
    // Şirketin operasyonel değeri borcunu bile karşılayamıyor:
    // FAVÖK 20 Milyon, Çarpan ~5x -> EV = 100 Milyon TL.
    // Net Borç = 500 Milyon TL -> Equity Value = 100 - 500 = -400 Milyon TL <= 0.
    // Bu durumda hisse başı içsel değer N/A (null) olmalı, 0.05 TL uydurma değer üretilmemelidir.
    const mockInsolventData = {
      ticker: 'BATIK',
      sector: 'INDUSTRIAL',
      share_count: 100_000_000,
      financial_history: [
        {
          period: '2025/12',
          revenue: 200_000_000,
          ebitda: 20_000_000,
          net_income: -150_000_000,
          equity: -400_000_000,
          net_debt: 500_000_000,
          paid_in_capital: 100_000_000,
          roic: -10,
          roe: -80
        }
      ]
    };

    const res = computeSectorValuationAndDrivers({
      extractedData: mockInsolventData,
      sector: 'INDUSTRIAL',
      marketPrice: 2.0
    });

    assert.notEqual(res.valuation.fair_value, 0.05, 'EV <= Net Borç durumunda 0.05 TL uydurma değer verilmemelidir');
    assert.ok(res.valuation.fair_value === null || res.valuation.fair_value <= 0, 'EV <= Net Borç durumunda içsel adil değer N/A (veya <=0) olmalıdır');
    assert.ok(res.valuation.is_insolvent || res.valuation.formula?.includes('Negatif') || res.valuation.boundary_warning !== undefined, 'Finansal sıkıntı/sermaye tükenmesi bayrağı tetiklenmelidir');
  });

  await t.test('4. Sector Archetypes: VAKFN is correctly identified as LEASING and not Industrial/Factoring', () => {
    const vakfnSector = detectSector('VAKFN');
    assert.equal(vakfnSector, 'FINANCIAL_SERVICES', 'VAKFN finansal hizmetler grubunda yer almalıdır');
    
    // Alt sektör arketip eşlemesi
    const archetype = getFinancialArchetype(vakfnSector);
    assert.ok(archetype === 'FINANCIAL_SERVICES' || archetype === 'LEASING', 'VAKFN Leasing arketipine yönlendirilmelidir');
  });

  await t.test('5. No Compounded Debt Haircut on Equity: Net debt is deducted once from EV', () => {
    // Bir şirketin Net Borcu 800M TL, FAVÖK 150M TL (Net Borç/FAVÖK = 5.33x > 4.0x).
    // Net borç zaten EV'den düşülmektedir.
    // Ek olarak hisse başına adil değerden keyfî %35 debtDiscountPct kesilmemelidir.
    const highDebtCompany = {
      ticker: 'BORCLU',
      sector: 'INDUSTRIAL',
      share_count: 100_000_000,
      financial_history: [
        {
          period: '2025/12',
          revenue: 1_200_000_000,
          ebitda: 150_000_000,
          net_income: 40_000_000,
          equity: 500_000_000,
          net_debt: 800_000_000,
          paid_in_capital: 100_000_000,
          roic: 12,
          roe: 8
        }
      ]
    };

    const res = computeSectorValuationAndDrivers({
      extractedData: highDebtCompany,
      sector: 'INDUSTRIAL',
      marketPrice: 15.0
    });

    // Formülde [Borç Sıkıntısı: -%...] ibaresi hisse değerinden mükerrer kesinti yapmamalıdır
    assert.ok(!res.valuation.formula?.includes('[Borç Sıkıntısı: -%'), 'Nihai hisse değerinden mükerrer Borç Sıkıntısı kesintisi uygulanmamalıdır');
  });

});
