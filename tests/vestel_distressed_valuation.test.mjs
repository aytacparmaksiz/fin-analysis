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

  const marketPrice = 3.95; // BIST live split-adjusted market price

  it('1. Methodological Fix: Does NOT apply EV/EBITDA multiple when EBITDA <= 0 and switches to Distressed Asset Turnaround Model', () => {
    const result = computeSectorValuationAndDrivers({
      extractedData: vesbeExtractedData,
      sector: 'INDUSTRIAL',
      marketPrice
    });

    const { drivers, valuation } = result;

    // Target multiple must NOT be FD/FAVÖK
    assert.doesNotMatch(drivers.target_multiple.value, /FD\/FAVÖK/i);
    assert.match(drivers.target_multiple.value, /İskontolu Sıkıntılı PD\/DD/i);
    assert.match(drivers.target_multiple.sourceExplanation, /Negatif FAVÖK ve operasyonel zarar nedeniyle FD\/FAVÖK çarpanı uygulanamaz/i);

    // Valuation model name must reflect distressed turnaround asset discount
    assert.match(valuation.valuation_model_name, /Sıkıntılı Şirket \/ Varlık Tabanı İskonto Modeli/i);
    assert.match(valuation.formula_display || '', /İskontolu Sıkıntılı PD\/DD/i);
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

  it('4. Decision & Pure Fair Value Consistency: Model calculates 3.36 TL with -14.9% discount (ALMA) and matches formula display', () => {
    const result = computeSectorValuationAndDrivers({
      extractedData: vesbeExtractedData,
      sector: 'INDUSTRIAL',
      marketPrice
    });

    const { valuation, optimization, scoreResult } = result;

    // Company has severe operational loss, negative cash flow, and high debt
    assert.equal(optimization.finalDecision, 'ALMA');
    assert.ok(scoreResult.totalScore < 40);

    // Fair value is 3.36 TL, discount is -14.9% (no discount, overvalued / ALMA)
    assert.equal(valuation.fair_value, 3.36);
    assert.equal(valuation.discount_pct, -14.9);
    assert.equal(valuation.margin_of_safety, 0);
    assert.equal(valuation.margin_of_safety_status, 'UNSAFE');
    assert.match(valuation.boundary_warning || '', /Sermaye Kaybı & Risk Uyarısı/i);

    // Formula display and fair_value must match 100% with zero discrepancy
    assert.ok(valuation.formula_display.includes('3,36 TL'));
  });

  it('5. Scenario Ordering Invariant: Bear Price (2.15 TL) < Market Price (3.95 TL) <= Fair Value (3.36 TL) <= Bull Price (5.20 TL)', () => {
    const result = computeSectorValuationAndDrivers({
      extractedData: vesbeExtractedData,
      sector: 'INDUSTRIAL',
      marketPrice
    });

    const { valuation } = result;
    assert.equal(valuation.fair_value, 3.36);
    assert.equal(valuation.bear_price, 2.15);
    assert.equal(valuation.bull_price, 5.20);

    // Bear price MUST be strictly below current market price
    assert.ok(valuation.bear_price < marketPrice, `Bear price (${valuation.bear_price}) must be strictly below market price (${marketPrice})`);
    assert.ok(valuation.bear_price <= valuation.fair_value, `Bear price (${valuation.bear_price}) must be <= fair value (${valuation.fair_value})`);
    assert.ok(valuation.bull_price >= valuation.fair_value, `Bull price (${valuation.bull_price}) must be >= fair value (${valuation.fair_value})`);
  });

  it('6. Typo Tolerance: extractValuationFromReportText successfully extracts number even if report contains "adli değer" typo', async () => {
    const { extractValuationFromReportText } = await import('../lib/valuation.ts');
    const textWithTypo = 'Sıkıntılı Şirket / Varlık Tabanı İskonto Modeli ile yapılan hesaplamalarda, hisse başına adli değer 3.36 TL olarak saptanmıştır.';
    const parsed = extractValuationFromReportText(textWithTypo, marketPrice);
    assert.ok(parsed);
    assert.equal(parsed.fair_value, 3.36);
  });
});
