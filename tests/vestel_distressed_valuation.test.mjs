import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSectorValuationAndDrivers,
  calculateSectorScore,
  optimizeFinalDecision,
  calculateEarningsQuality
} from '../lib/valuation.ts';

describe('VESBE & Distressed Loss-Making Valuation Stress Test Suite', () => {
  // Official Vestel Beyaz Eşya (VESBE) 2026/06 6-Month interim report figures:
  const vesbeExtractedData = {
    company_name: 'Vestel Beyaz Eşya Sanayi ve Ticaret A.Ş.',
    ticker: 'VESBE',
    currency: 'TRY',
    shares_outstanding: 1600000000, // 1.6 Billion shares (split-adjusted)
    financial_history: [
      {
        period: '2025/12',
        revenue: 65000000,
        ebitda: 3500000,
        net_income: 1200000,
        equity: 27000000,
        net_debt: 21000000,
        operating_cash_flow: 1800000,
        free_cash_flow: 200000,
        total_assets: 55000000,
        current_assets: 28000000,
        current_liabilities: 24000000,
        current_ratio: 1.16,
        roe: 4.4,
        ebitda_margin: 5.4,
        roic: 6.2,
        wacc: 32.0,
      },
      {
        period: '2026/06',
        revenue: 34127000,
        ebitda: -623445, // Official negative EBITDA: -623.44 Mn TL
        operating_income: -1150000,
        net_income: -2277301, // Official net loss: -2.28 Mr TL
        operating_cash_flow: -2540000, // Official OCF: -2.54 Mr TL (cash burning)
        free_cash_flow: -3100000,
        equity: 28000000, // ~28 Mr TL
        net_debt: 26229065, // Official Net Debt: 26.23 Mr TL
        total_assets: 58000000,
        current_assets: 29000000,
        current_liabilities: 27000000,
        current_ratio: 1.07,
        roe: -11.2, // Negative ROE
        ebitda_margin: -1.8,
        roic: -4.5,
        wacc: 35.0,
      }
    ],
    marketMultiples: {
      pe: null,
      pb: 0.23,
      ev_ebitda: null,
      ev_sales: 0.45,
      free_float_pct: 17.5,
      market_cap_mn_tl: 6448
    }
  };

  const marketPrice = 4.03; // BIST live split-adjusted market price

  it('1. Methodological Fix: Does NOT apply EV/EBITDA multiple when EBITDA <= 0 and switches to Distressed Asset Turnaround Model', () => {
    const result = computeSectorValuationAndDrivers({
      extractedData: vesbeExtractedData,
      sector: 'INDUSTRIAL',
      marketPrice
    });

    const { drivers, valuation } = result;

    // Target multiple must NOT be FD/FAVÖK
    assert.doesNotMatch(drivers.target_multiple.value, /FD\/FAVÖK/i);
    assert.match(drivers.target_multiple.value, /İskontolu PD\/DD/i);
    assert.match(drivers.target_multiple.sourceExplanation, /Negatif FAVÖK .* nedeniyle FD\/FAVÖK çarpanı uygulanamaz/i);

    // Valuation model name must reflect distressed turnaround asset discount
    assert.match(valuation.valuation_model_name, /Sıkıntılı Şirket \/ Varlık Tabanı İskonto Modeli/i);
    assert.match(valuation.formula_display || '', /Operasyonel Zarar \(FAVÖK ≤ 0\)/i);
  });

  it('2. Debt Ratio Fix: Net Borç / FAVÖK is NEVER hardcoded to 99.0x when EBITDA is negative', () => {
    const scoreResult = calculateSectorScore(vesbeExtractedData, 'INDUSTRIAL');

    const cat1 = scoreResult.breakdown.find(b => b.category === 'Finansal Sağlık & Likidite');
    assert.ok(cat1);
    assert.equal(cat1.status, 'danger');
    assert.equal(cat1.score, 2); // Severely penalized

    // Must NOT contain 99.0x or 99x!
    assert.doesNotMatch(cat1.reason, /99\.0x/i);
    assert.doesNotMatch(cat1.reason, /99x/i);
    assert.match(cat1.reason, /Net Borç\/FAVÖK: Negatif \/ Anlamsız/i);
    assert.match(cat1.reason, /Kritik Borç & Operasyonel Zarar Riski/i);

    // Anomaly must be registered
    assert.ok(scoreResult.anomalies.some(a => a.includes('Operasyonel Borç Riski')));
  });

  it('3. Double Negative Cash Flow Fix: OCF < 0 and Net Loss < 0 returns null conversion ratio instead of +111.7%', () => {
    const eqResult = calculateEarningsQuality(vesbeExtractedData.financial_history, 'INDUSTRIAL');

    assert.equal(eqResult.hasData, true);
    // Dividing -2540000 by -2277301 must NEVER result in +111.7%
    assert.equal(eqResult.cashConversionRatio, null);
    assert.equal(eqResult.status, 'DOUBLE_NEGATIVE');
    assert.equal(eqResult.badgeColor, 'rose');
    assert.match(eqResult.statusTitle, /Zarar ve Negatif Nakit Akışı/i);
    assert.match(eqResult.guidanceText, /Nakit Dönüşüm Oranı uygulanamaz \(N\/A\)/i);
    // Sloan assessment must NEVER claim "sağlıklı bir denge içindedir" when burning cash and posting net losses!
    assert.match(eqResult.sloanAssessment, /Çift Yönlü Zarar ve Nakit Yakımı/i);
    assert.doesNotMatch(eqResult.sloanAssessment, /sağlıklı bir denge/i);
  });

  it('4. Decision & Pure Fair Value Consistency: Model calculates authentic math without arbitrary curPrice clamping, and formula matches 100%', () => {
    const result = computeSectorValuationAndDrivers({
      extractedData: vesbeExtractedData,
      sector: 'INDUSTRIAL',
      marketPrice
    });

    const { valuation, optimization, scoreResult } = result;

    // Company has severe operational loss, negative cash flow, and high debt
    assert.equal(optimization.finalDecision, 'ALMA');
    assert.ok(scoreResult.totalScore < 40);

    // Fair value is pure mathematical model calculation (never clamped by curPrice * 0.85)
    assert.equal(valuation.margin_of_safety, 0);
    assert.equal(valuation.margin_of_safety_status, 'UNSAFE');
    assert.match(valuation.boundary_warning || '', /Sermaye Kaybı & Risk Uyarısı/i);

    // Formula display and fair_value must match 100% with zero discrepancy (resolving 8.45 TL vs 3.31 TL bug)
    assert.ok(valuation.formula_display.includes(`${valuation.fair_value.toFixed(2).replace('.', ',')} TL`));
  });
});
