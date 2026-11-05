import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSectorValuationAndDrivers, calculateSectorScore } from '../lib/valuation.ts';

describe('Systemic Valuation & Decision Harmonization Audit Suite', () => {

  it('1. DOAS (Automotive Value Trap): Fair value is deflated, discount is negative/neutral, decision ALMA', () => {
    const doasData = {
      ticker: 'DOAS',
      sector: 'INDUSTRIAL',
      current_price: 131.40,
      share_count: 220000000,
      paid_in_capital: 220000000,
      financial_history: [
        {
          period: '2025/06',
          revenue: 100000000000,
          ebitda: 12000000000,
          net_income: 8000000000,
          equity: 65000000000,
          roe: 25.0,
          roic: 22.0
        },
        {
          period: '2026/06',
          revenue: 113143951000,
          operating_profit: 4856475000,
          ebit: 4856475000,
          ebitda: 6000000000,
          net_income: 2356360000,
          equity: 74341347000,
          net_debt: 28449530000,
          operating_cash_flow: -500000000,
          roe: 4.48,
          roic: 7.08,
          wacc: 16.7,
          benchmark_wacc: 16.7
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(doasData, 131.40);
    assert.equal(res.valuation.final_decision, 'ALMA');
    assert.equal(res.valuation.is_value_trap, true);
    // Fair value must be deflated around market price, NOT 220 TL (+68%)!
    assert.ok(res.valuation.fair_value <= 135.0, `DOAS fair value (${res.valuation.fair_value}) must be compressed <= 135 TL`);
    assert.ok(res.valuation.discount_pct <= 5.0, `DOAS discount (${res.valuation.discount_pct}) must be <= 5%`);
  });

  it('2. KATMR (Critical Value Trap): Deflates paper upside from +175% to realistic distressed value', () => {
    const katmrData = {
      ticker: 'KATMR',
      sector: 'INDUSTRIAL',
      current_price: 1.19,
      share_count: 1050000000,
      paid_in_capital: 1050000000,
      financial_history: [
        {
          period: '2025/06',
          revenue: 1200000000,
          operating_profit: 400000000,
          ebitda: 450000000,
          net_income: 300000000,
          equity: 8000000000,
          roe: 18.0,
          roic: 16.0
        },
        {
          period: '2026/06',
          revenue: 1558895376,
          operating_profit: 449826025,
          ebitda: 500000000,
          net_income: 318919663,
          equity: 10500128155,
          net_debt: 2188705263,
          operating_cash_flow: -100000000,
          roe: 6.33,
          roic: 4.91,
          wacc: 17.8,
          benchmark_wacc: 17.8
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(katmrData, 1.19);
    assert.equal(res.valuation.final_decision, 'ALMA');
    assert.equal(res.valuation.is_value_trap, true);
    // Fair value must be significantly deflated from 3.28 TL
    assert.ok(res.valuation.fair_value <= 2.30, `KATMR fair value (${res.valuation.fair_value}) must be <= 2.30 TL`);
  });

  it('3. PAHOL (Loss-Making Holding): Net loss of -1.53B TL gets ALMA, score <= 45, multiple 0.35x', () => {
    const paholData = {
      ticker: 'PAHOL',
      sector: 'HOLDING',
      current_price: 0.74,
      share_count: 19800000000,
      paid_in_capital: 19800000000,
      financial_history: [
        {
          period: '2025/09',
          equity: 40000000000,
          net_income: 500000000
        },
        {
          period: '2026/09',
          revenue: 250103051,
          operating_profit: -227939957,
          ebit: -227939957,
          net_income: -1535107416,
          equity: 47881083733,
          parent_equity: 47881083733,
          net_debt: -52154605207,
          roe: -3.2,
          holding_discount: 69.0
        }
      ]
    };

    const scoreRes = calculateSectorScore(paholData, 'HOLDING');
    assert.ok(scoreRes.totalScore <= 45, `PAHOL score (${scoreRes.totalScore}) must be <= 45 due to severe net loss`);

    const res = computeSectorValuationAndDrivers(paholData, 0.74);
    assert.equal(res.valuation.final_decision, 'ALMA', 'Loss-making holding must receive ALMA, never AL');
    assert.ok(res.valuation.fair_value <= 1.05, `PAHOL fair value (${res.valuation.fair_value}) must reflect distressed holding discount (0.35x NAV)`);
  });

  it('4. ECZYT (Distressed Conglomerate): Net loss of -831M TL and ROE -2.4% receives ALMA and <= 110 TL fair value', () => {
    const eczytData = {
      ticker: 'ECZYT',
      sector: 'HOLDING',
      current_price: 160.80,
      share_count: 108000000,
      paid_in_capital: 108000000,
      financial_history: [
        {
          period: '2026/09',
          revenue: 0,
          operating_profit: 55434580,
          ebit: 55434580,
          net_income: -831342623,
          equity: 33057386566,
          parent_equity: 33057386566,
          net_debt: -11195537028,
          roe: -2.42,
          holding_discount: 47.0
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(eczytData, 160.80);
    assert.equal(res.valuation.final_decision, 'ALMA', 'ECZYT must receive ALMA due to net losses and negative ROE');
    assert.ok(res.valuation.fair_value <= 120.0, `ECZYT fair value (${res.valuation.fair_value}) must be <= 120 TL (discounted P/NAV)`);
  });

  it('5. SNGYO (Low-Yield REIT): Multiple drops to 0.32x NAV, eliminating phantom 12.48 TL (+426%) target', () => {
    const sngyoData = {
      ticker: 'SNGYO',
      sector: 'REIT',
      current_price: 2.37,
      share_count: 4400000000,
      paid_in_capital: 4400000000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 3460498553,
          operating_profit: 1266321450,
          ebitda: 1300000000,
          net_income: 162822765,
          equity: 55729881980,
          net_debt: 4990483026,
          roe: -0.46
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(sngyoData, 2.37);
    assert.equal(res.valuation.final_decision, 'NÖTR');
    assert.ok(res.valuation.fair_value <= 6.0, `SNGYO fair value (${res.valuation.fair_value}) must be calibrated <= 6.0 TL`);
  });

  it('6. EKGYO (Low-ROE REIT): ROE of 0.23% scales multiple to 0.35x, balancing decision to NÖTR', () => {
    const ekgyoData = {
      ticker: 'EKGYO',
      sector: 'REIT',
      current_price: 17.49,
      share_count: 3800000000,
      paid_in_capital: 3800000000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 51262860000,
          operating_profit: 12866723000,
          ebitda: 13000000000,
          net_income: 2981907000,
          equity: 154331604000,
          net_debt: 22044912000,
          roe: 0.23
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(ekgyoData, 17.49);
    assert.equal(res.valuation.final_decision, 'NÖTR', 'EKGYO must be balanced to NÖTR given minimal 0.23% ROE');
    assert.ok(res.valuation.fair_value <= 18.0, `EKGYO fair value (${res.valuation.fair_value}) must be <= 18 TL`);
  });

  it('7. AKFYE (Renewable Energy): Treats company as competitive renewable generator, not regulated monopoly grid', () => {
    const akfyeData = {
      ticker: 'AKFYE',
      sector: 'UTILITIES_TELCO',
      current_price: 2.94,
      share_count: 10160000000,
      paid_in_capital: 10160000000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 3424273000,
          operating_profit: 301598000,
          ebitda: 2500000000,
          net_income: 1404378000,
          equity: 69123548000,
          net_debt: 11345436000,
          roe: 4.28,
          roic: 2.47
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(akfyeData, 2.94);
    assert.equal(res.valuation.valuation_model_name, 'Uluslararası Enerji Üretim & Altyapı Değerleme Modeli (Kurulu Güç & PPA Nakit Akışı)');
    assert.ok(res.valuation.fair_value <= 4.50, `AKFYE fair value (${res.valuation.fair_value}) must be <= 4.50 TL (Gordon justified multiple)`);
  });

  it('8. DGATE (Computer Hardware Wholesale): Uses official 0002 wholesale multiples, eliminating phantom 1820 TL target', () => {
    const dgateData = {
      ticker: 'DGATE',
      sector: 'TECH',
      current_price: 45.60,
      share_count: 30000000,
      paid_in_capital: 30000000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 9991485490,
          gross_profit: 804206851,
          operating_profit: 535135154,
          ebitda: 586205560,
          net_income: 51104756,
          equity: 436749231,
          net_debt: -120779489,
          financing_expenses: -471179556,
          roe: 26.0
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(dgateData, 45.60);
    assert.ok(res.valuation.formula_display.includes('FD/Satışlar (0,10x)') || res.valuation.formula_display.includes('FD/Satışlar (0,09x)'), 'Must use ~0.10x wholesale EV/Sales, NOT SaaS 2.5x!');
    assert.ok(res.valuation.fair_value <= 65.0, `DGATE fair value (${res.valuation.fair_value}) must be <= 65 TL (never 1820 TL!)`);
    assert.ok(res.valuation.fair_value >= 40.0, `DGATE fair value (${res.valuation.fair_value}) must be >= 40 TL`);
    assert.equal(res.valuation.final_decision, 'NÖTR', 'DGATE must be evaluated as NÖTR near its market price');
  });

  it('9. ARASE (Regulated Electricity Distribution): Uses EPDK RAB & interest-adjusted EV, eliminating 329 TL FD/FAVÖK balloon', () => {
    const araseData = {
      ticker: 'ARASE',
      sector: 'UTILITIES_TELCO',
      current_price: 77.00,
      share_count: 250000000,
      paid_in_capital: 250000000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 19836730000,
          operating_profit: 5655100000,
          ebitda: 5875840000,
          net_income: 1589220000,
          equity: 24583420000,
          net_debt: 942955724,
          financing_expenses: -3267020000,
          roe: 13.2
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(araseData, 77.00);
    assert.ok(res.valuation.formula_display.includes('RAB PD/DD'), 'Must use EPDK RAB PD/DD in regulated electricity distribution');
    assert.ok(res.valuation.fair_value <= 145.0, `ARASE fair value (${res.valuation.fair_value}) must be <= 145 TL (never 221 TL!)`);
    assert.ok(res.valuation.fair_value >= 95.0, `ARASE fair value (${res.valuation.fair_value}) must be >= 95 TL`);
  });

});
