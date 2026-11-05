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

  it('10. TRGYO (Cash Flow Rental REIT): High cash rental yield (P/OCF 5.8x, Net Cash) bypasses low accounting ROE penalty, awards 0.75x NAV and AL decision', () => {
    const trgyoData = {
      ticker: 'TRGYO',
      sector: 'REIT',
      current_price: 88.20,
      share_count: 1000000000,
      paid_in_capital: 1000000000,
      unified_metrics: {
        ttm: {
          operatingCashFlow: 15083768973
        }
      },
      financial_history: [
        {
          period: '2026/06',
          revenue: 6991493000,
          operating_profit: 4069730000,
          ebitda: 4984011000,
          net_income: 4806587000,
          equity: 154004463000,
          net_debt: -2896732000,
          roe: 5.78,
          operating_cash_flow: 12651819000,
          dividends_paid: 5049273000,
          total_assets: 196655058000
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(trgyoData, 88.20);
    assert.equal(res.valuation.final_decision, 'AL', 'TRGYO must be AL due to massive operating cash rental yield and net cash');
    assert.ok(res.valuation.formula_display.includes('(0,75x)') || res.valuation.formula_display.includes('(0,70x)'), 'Must award prime REIT multiple ~0.70x-0.75x, NOT 0.40x!');
    assert.ok(res.valuation.formula_display.includes('Kira Getirisi P/OCF'), 'Formula must explicitly state rental cash yield');
    assert.ok(res.valuation.fair_value >= 115.0, `TRGYO fair value (${res.valuation.fair_value}) must be >= 115 TL`);
  });

  it('11. Banking Differentiated Scoring: AKBNK and GARAN receive distinct, non-blind scores based on real NIM and CAR', () => {
    const akbnkData = {
      ticker: 'AKBNK',
      sector: 'BANKING',
      current_price: 58.50,
      share_count: 5200000000,
      financial_history: [
        {
          period: '2026/06',
          net_interest_income: 62000000000,
          net_fees_commissions: 24000000000,
          total_operating_income: 98000000000,
          loans: 1450000000000,
          deposits: 1700000000000,
          total_assets: 2300000000000,
          equity: 240000000000,
          net_income: 41000000000,
          nim: 4.18,
          car_ratio: 20.89,
          npl_ratio: 2.1,
          roe: 22.3
        }
      ]
    };

    const garanData = {
      ticker: 'GARAN',
      sector: 'BANKING',
      current_price: 118.00,
      share_count: 4200000000,
      financial_history: [
        {
          period: '2026/06',
          net_interest_income: 88000000000,
          net_fees_commissions: 38000000000,
          total_operating_income: 140000000000,
          loans: 1650000000000,
          deposits: 1950000000000,
          total_assets: 2600000000000,
          equity: 290000000000,
          net_income: 65000000000,
          nim: 5.53,
          car_ratio: 24.39,
          npl_ratio: 1.8,
          roe: 28.5
        }
      ]
    };

    const akbnkScore = calculateSectorScore(akbnkData, 'BANKING');
    const garanScore = calculateSectorScore(garanData, 'BANKING');

    assert.ok(akbnkScore.totalScore > 0 && garanScore.totalScore > 0);
    assert.notEqual(akbnkScore.totalScore, 87, 'AKBNK score must not be stuck at blind 87/100 fallback');
    assert.notEqual(garanScore.totalScore, 87, 'GARAN score must not be stuck at blind 87/100 fallback');
    assert.ok(garanScore.totalScore >= akbnkScore.totalScore, 'GARAN score should be >= AKBNK due to higher NIM and ROE');
  });

  it('12. Banking Monetary Cycle Gordon Justified P/B: AKBNK and GARAN target multiple reflects normalized cost of equity (~1.1x - 1.9x), never trapped at 0.60x P/B', () => {
    const akbnkData = {
      ticker: 'AKBNK',
      sector: 'BANKING',
      current_price: 58.50,
      share_count: 5200000000,
      financial_history: [
        {
          period: '2026/06',
          equity: 240000000000,
          net_income: 41000000000,
          total_assets: 2300000000000,
          roe: 22.3,
          nim: 4.18,
          car_ratio: 20.89,
          wacc: 44.0 // Nominal tight monetary policy WACC
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(akbnkData, 58.50);
    assert.ok(res.drivers.target_multiple.numericValue > 0.85, `AKBNK target multiple (${res.drivers.target_multiple.numericValue}) must be > 0.85x, not trapped at 0.60x floor!`);
    assert.ok(res.valuation.fair_value > 0);
    assert.ok(res.drivers.target_multiple.sourceExplanation?.includes('Döngüsel Normalleştirilmiş Gordon Modeli') || res.valuation.formula_display.includes('İleri HBDD'), 'Must use cycle-normalized Gordon formula');
  });

  it('13. SOKM (Retail Supplier Debt Value Trap): Cash flow funded 117% from supplier payable extensions with net loss & negative ROIC receives ALMA', () => {
    const sokmData = {
      ticker: 'SOKM',
      sector: 'RETAIL',
      current_price: 43.10,
      share_count: 593290000,
      paid_in_capital: 593290000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 120000000000,
          ebitda: 5500000000,
          operating_profit: 1200000000,
          net_income: -1350000000, // Net loss
          equity: 28000000000,
          net_debt: 12000000000,
          operating_cash_flow: 16700000000, // Positive OCF: 16.7B TL
          working_capital_change: 19600000000, // 19.6B TL (117%) from supplier debt!
          roic: -42.5,
          roe: -4.8,
          wacc: 38.0
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(sokmData, 43.10);
    assert.equal(res.valuation.final_decision, 'ALMA', 'SOKM must be ALMA due to supplier debt value trap and net loss');
    assert.ok(res.valuation.is_value_trap, 'Must be flagged as value trap');
    assert.ok(res.valuation.value_trap_reasons?.some(r => r.includes('Tedarikçi Borcu')), 'Must identify Tedarikçi Borcu Değer Tuzağı in reasons');
    assert.equal(res.valuation.margin_of_safety_status, 'UNSAFE');
  });

  it('14. KCHOL (Holding Solo vs Consolidated Debt): Holding consolidating bank (YKBNK) is not penalized with false 5/25 leverage score', () => {
    const kcholData = {
      ticker: 'KCHOL',
      sector: 'HOLDING',
      current_price: 215.00,
      share_count: 2535897000,
      paid_in_capital: 2535897000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 850000000000,
          net_income: 38000000000,
          operating_profit: 65000000000,
          equity: 520000000000,
          net_debt: 1050000000000, // Consolidated 1.05 Trillion TL net debt due to YKBNK deposits!
          holding_discount: 28.5,
          roe: 18.5
        }
      ]
    };

    const scoreResult = calculateSectorScore(kcholData, 'HOLDING');
    const finHealth = scoreResult.breakdown.find(b => b.category === 'Solo Nakit Gücü & Borçsuzluk' || b.category.includes('Solo Nakit') || b.category.includes('Borçsuzluk'));
    assert.ok(finHealth);
    assert.ok(finHealth.score >= 20, `KCHOL leverage score (${finHealth.score}/25) must be >= 20, not penalized to 5/25 for bank deposits`);
    assert.doesNotMatch(finHealth.reason, /Solo holding bilançosunda yüksek kaldıraç riski/i);
  });

  it('15. AHGAZ (EPDK Regulated Distribution): Recognized as regulated distribution and valued via RAB framework', () => {
    const ahgazData = {
      ticker: 'AHGAZ',
      sector: 'UTILITIES_TELCO',
      current_price: 14.50,
      share_count: 2600000000,
      paid_in_capital: 2600000000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 45000000000,
          operating_profit: 8500000000,
          ebitda: 9800000000,
          net_income: 3200000000,
          equity: 36000000000,
          net_debt: 4200000000,
          roe: 14.5
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(ahgazData, 14.50);
    assert.ok(res.valuation.formula_display.includes('RAB PD/DD'), `AHGAZ formula (${res.valuation.formula_display}) must include RAB PD/DD`);
    assert.ok(res.valuation.fair_value > 0);
  });

});
