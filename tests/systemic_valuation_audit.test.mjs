import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeSectorValuationAndDrivers, calculateSectorScore, calculateDuPont5Step, analyzeRelatedPartyAndCapitalAllocationRisk, isTfrs10InvestmentEntity, optimizeFinalDecision, detectValueTrap, evaluateValueTrap, syncReportTextWithValuation, calculateProbabilisticExpectedValue, calculateFundamentalMomentum, calculateEarningsQuality, calculateCompanyMultiples, resolveCoreOperatingAdjustment, buildForensicRedFlagsSection } from '../lib/valuation.ts';
import { synthesizeInvestmentThesis } from '../lib/investment-thesis-synthesizer.ts';
import { AGESA_SAMPLE_REPORT_TEXT, VESBE_SAMPLE_REPORT_TEXT } from '../lib/sample-data.ts';
import { computeSnowflakeAnalysis } from '../lib/snowflake.ts';
import { IsYatirimApiAdapter } from '../lib/isyatirim-adapter.ts';
import { detectSector } from '../lib/sectors.ts';
import { FinancialRatioEngine, computeFinancialChange } from '../lib/ratio-engine.ts';
import { InvariantSentinel } from '../lib/invariant-sentinel.ts';

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

  it('16. DuPont 5-Step Banking Integrity: Bank deposit interest expense is not subtracted twice from EBIT', () => {
    const bankItem = {
      ticker: 'AKBNK',
      sector: 'BANKING',
      net_income: 15000000000,
      total_operating_income: 45000000000,
      operating_profit: 20000000000,
      interest_expense: 50000000000,
      total_assets: 1200000000000,
      equity: 150000000000
    };
    const dupont = calculateDuPont5Step(bankItem, 'BANKING');
    assert.equal(dupont.hasData, true);
    assert.ok(dupont.taxBurden !== null && dupont.taxBurden > 0.5, `Tax burden (${dupont.taxBurden}) must be positive bank tax rate (~0.70x)`);
    assert.ok(dupont.interestBurden !== null && dupont.interestBurden > 0.9, `Interest/Provision burden (${dupont.interestBurden}) must be > 0.9x`);
    assert.ok(dupont.calculatedRoe !== null && dupont.calculatedRoe > 0, `Bank calculated ROE must be positive (${dupont.calculatedRoe}%)`);
    assert.ok(dupont.driverSummary.includes('Bankacılık'), 'Driver summary must reflect banking context');
  });

  it('17. DGATE (Computer Hardware Wholesale): Low gross margin (~6.8%) does not trigger SaaS gm < 20% penalty', () => {
    const dgateData = {
      ticker: 'DGATE',
      sector: 'TECH',
      official_sector_name: 'Bilgisayar Toptancılığı',
      current_price: 35.0,
      share_count: 30000000,
      paid_in_capital: 30000000,
      financial_history: [
        {
          period: '2025/06',
          revenue: 2000000000,
          net_income: 30000000
        },
        {
          period: '2026/06',
          revenue: 2600000000,
          gross_margin: 6.8,
          operating_profit: 110000000,
          ebitda: 120000000,
          net_income: 45000000,
          equity: 400000000,
          net_debt: 50000000,
          current_ratio: 1.25,
          operating_cash_flow: 60000000,
          roe: 22.0,
          roic: 18.0
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(dgateData, 35.0);
    assert.notEqual(res.valuation.final_decision, 'ALMA', 'DGATE must not be overridden to ALMA due to 6.8% gross margin');
    assert.ok(!res.valuation.safety_flags?.some(f => f.includes('Düşük Teknoloji Brüt Marjı')), 'Must not flag SaaS low gross margin');
    const scoreRes = calculateSectorScore(dgateData, 'TECH', 'Bilgisayar Toptancılığı');
    assert.ok(scoreRes.breakdown.some(b => b.reason.includes('Çalışma Sermayesi') || b.reason.includes('distribütör') || b.reason.includes('toptancı')), 'Must use wholesale distributor scoring');
  });

  it('18. DOHOL & AGHOL (Conglomerate Solo vs Consolidated Debt): Consolidating holding debt does not trigger false ALMA', () => {
    const doholData = {
      ticker: 'DOHOL',
      sector: 'HOLDING',
      current_price: 15.20,
      share_count: 2616938288,
      paid_in_capital: 2616938288,
      financial_history: [
        {
          period: '2026/06',
          revenue: 95000000000,
          operating_profit: 12000000000,
          net_income: 8500000000,
          equity: 65000000000,
          net_debt: 85000000000, // Consolidated debt of industrial/energy subs
          holding_discount: 32.0,
          roe: 19.5
        }
      ]
    };

    const scoreResult = calculateSectorScore(doholData, 'HOLDING');
    const finHealth = scoreResult.breakdown.find(b => b.category.includes('Solo Nakit') || b.category.includes('Borçsuzluk'));
    assert.ok(finHealth);
    assert.ok(finHealth.score >= 20, `DOHOL leverage score (${finHealth.score}/25) must recognize holding structure`);
  });

  it('19. Comprehensive Multi-Sector 18-Company Stress Test: All sectors compute valid valuations without runtime exceptions', () => {
    const multiSectorCompanies = [
      // Banking
      { ticker: 'ISCTR', sector: 'BANKING', current_price: 13.50, share_count: 10000000000, paid_in_capital: 10000000000, financial_history: [{ period: '2026/06', total_operating_income: 80000000000, net_income: 30000000000, equity: 280000000000, roe: 24.5, nim: 4.0, car_ratio: 18.5 }] },
      // Insurance
      { ticker: 'TURSG', sector: 'INSURANCE', current_price: 75.00, share_count: 1161523363, paid_in_capital: 1161523363, financial_history: [{ period: '2026/06', written_premiums: 45000000000, technical_balance: 6000000000, net_income: 8000000000, equity: 25000000000, roe: 38.0, combined_ratio: 92.5 }] },
      { ticker: 'AGESA', sector: 'INSURANCE', current_price: 115.00, share_count: 180000000, paid_in_capital: 180000000, financial_history: [{ period: '2026/06', written_premiums: 12000000000, technical_balance: 2500000000, net_income: 3200000000, equity: 8500000000, roe: 45.0, combined_ratio: 88.0 }] },
      // Retail
      { ticker: 'BIMAS', sector: 'RETAIL', current_price: 520.00, share_count: 607200000, paid_in_capital: 607200000, financial_history: [{ period: '2026/06', revenue: 450000000000, ebitda: 32000000000, net_income: 18000000000, equity: 85000000000, net_debt: -12000000000, operating_cash_flow: 35000000000, working_capital_change: 8000000000, roic: 32.0, roe: 36.0 }] },
      { ticker: 'MGROS', sector: 'RETAIL', current_price: 490.00, share_count: 181054233, paid_in_capital: 181054233, financial_history: [{ period: '2026/06', revenue: 260000000000, ebitda: 18000000000, net_income: 9000000000, equity: 48000000000, net_debt: -6000000000, operating_cash_flow: 20000000000, roic: 28.0, roe: 30.0 }] },
      // Heavy / Steel
      { ticker: 'EREGL', sector: 'INDUSTRIAL', current_price: 48.00, share_count: 3500000000, paid_in_capital: 3500000000, financial_history: [{ period: '2026/06', revenue: 180000000000, ebitda: 28000000000, net_income: 14000000000, equity: 220000000000, net_debt: 65000000000, roic: 11.0, roe: 12.0 }] },
      { ticker: 'KRDMD', sector: 'INDUSTRIAL', current_price: 26.50, share_count: 780299698, paid_in_capital: 780299698, financial_history: [{ period: '2026/06', revenue: 42000000000, ebitda: 5800000000, net_income: 2600000000, equity: 35000000000, net_debt: 8000000000, roic: 9.5, roe: 10.2 }] },
      // Petrochemical & Energy
      { ticker: 'TUPRS', sector: 'INDUSTRIAL', current_price: 155.00, share_count: 1926795598, paid_in_capital: 1926795598, financial_history: [{ period: '2026/06', revenue: 680000000000, ebitda: 55000000000, net_income: 32000000000, equity: 180000000000, net_debt: -15000000000, roic: 26.0, roe: 28.0 }] },
      { ticker: 'SISE', sector: 'INDUSTRIAL', current_price: 42.00, share_count: 3063214056, paid_in_capital: 3063214056, financial_history: [{ period: '2026/06', revenue: 190000000000, ebitda: 31000000000, net_income: 12000000000, equity: 160000000000, net_debt: 75000000000, roic: 12.5, roe: 13.0 }] },
      { ticker: 'PETKM', sector: 'INDUSTRIAL', current_price: 18.20, share_count: 2534400000, paid_in_capital: 2534400000, financial_history: [{ period: '2026/06', revenue: 75000000000, ebitda: 4500000000, net_income: 1200000000, equity: 55000000000, net_debt: 28000000000, roic: 4.5, roe: 5.0 }] },
      // Conglomerates
      { ticker: 'SAHOL', sector: 'HOLDING', current_price: 92.00, share_count: 2040403931, paid_in_capital: 2040403931, financial_history: [{ period: '2026/06', revenue: 220000000000, operating_profit: 35000000000, net_income: 18000000000, equity: 190000000000, net_debt: 350000000000, holding_discount: 35.0, roe: 21.0 }] },
      { ticker: 'AGHOL', sector: 'HOLDING', current_price: 310.00, share_count: 243534518, paid_in_capital: 243534518, financial_history: [{ period: '2026/06', revenue: 380000000000, operating_profit: 42000000000, net_income: 14000000000, equity: 120000000000, net_debt: 110000000000, holding_discount: 28.0, roe: 23.5 }] },
      // Regulated Utilities
      { ticker: 'ENJSA', sector: 'UTILITIES_TELCO', official_sector_name: 'Elektrik Dağıtım', current_price: 62.00, share_count: 1181068967, paid_in_capital: 1181068967, financial_history: [{ period: '2026/06', revenue: 150000000000, operating_profit: 22000000000, ebitda: 26000000000, net_income: 8500000000, equity: 75000000000, net_debt: 45000000000, roe: 22.0 }] },
      // Technology
      { ticker: 'INDES', sector: 'TECH', official_sector_name: 'Bilgisayar Toptancılığı', current_price: 8.50, share_count: 882000000, paid_in_capital: 882000000, financial_history: [{ period: '2026/06', revenue: 45000000000, gross_margin: 5.5, operating_profit: 1800000000, ebitda: 2000000000, net_income: 850000000, equity: 6500000000, net_debt: 1200000000, current_ratio: 1.20, operating_cash_flow: 900000000, roe: 20.5 }] },
      { ticker: 'LOGO', sector: 'TECH', current_price: 110.00, share_count: 100000000, paid_in_capital: 100000000, financial_history: [{ period: '2026/06', revenue: 3500000000, gross_margin: 82.0, ebitda: 1400000000, net_income: 950000000, equity: 3200000000, net_debt: -450000000, roe: 38.0 }] },
      // Aviation
      { ticker: 'THYAO', sector: 'AVIATION', current_price: 295.00, share_count: 1380000000, paid_in_capital: 1380000000, financial_history: [{ period: '2026/06', revenue: 750000000000, ebitda: 175000000000, net_income: 65000000000, equity: 580000000000, net_debt: 280000000000, roic: 14.5, roe: 18.0 }] },
      { ticker: 'PGSUS', sector: 'AVIATION', current_price: 240.00, share_count: 500000000, paid_in_capital: 500000000, financial_history: [{ period: '2026/06', revenue: 125000000000, ebitda: 38000000000, net_income: 16000000000, equity: 85000000000, net_debt: 65000000000, roic: 16.0, roe: 22.0 }] },
      // Healthcare
      { ticker: 'MPARK', sector: 'HEALTHCARE', current_price: 330.00, share_count: 208037202, paid_in_capital: 208037202, financial_history: [{ period: '2026/06', revenue: 32000000000, ebitda: 8500000000, net_income: 3800000000, equity: 18000000000, net_debt: 9500000000, roic: 22.0, roe: 28.0 }] }
    ];

    for (const comp of multiSectorCompanies) {
      const res = computeSectorValuationAndDrivers(comp, comp.current_price);
      assert.ok(res.valuation != null, `${comp.ticker} must produce a valuation object`);
      assert.ok(typeof res.valuation.fair_value === 'number' && !isNaN(res.valuation.fair_value), `${comp.ticker} fair value must be a valid number, got ${res.valuation.fair_value}`);
      assert.ok(res.valuation.fair_value > 0, `${comp.ticker} fair value must be positive, got ${res.valuation.fair_value}`);
      assert.ok(['AL', 'ALMA', 'NÖTR'].includes(res.valuation.final_decision), `${comp.ticker} decision must be AL/ALMA/NÖTR, got ${res.valuation.final_decision}`);
    }
  });

  it('20. ATATP (Tech Data Integrity & Real Rule of 40): Separates non-current financial investment (1BC: 7.04B) from cash, uses real FCF in Rule of 40, and applies minority interests', () => {
    // 1. Adapter mapping test: 1AB (short-term) is 0, 1BC (non-current) is 7.04B
    const mockDict = {
      code_1A: 1437456433,
      code_1AA: 462086452,
      desc_nakit_ve_nakit_benzerleri: 462086452,
      code_1AB: 0,
      desc_finansal_yatirimlar: 7039214187,
      code_1BC: 7039214187,
      code_2AA: 26215999,
      code_2BA: 44411329,
      code_3C: 3665488134,
      desc_satis_gelirleri: 3665488134,
      code_3Z: 1340871160,
      code_4C: 559440738,
      code_4CB: 76578357
    };

    const mapped = IsYatirimApiAdapter.mapPeriodDictionary('2026/06', mockDict, { ticker: 'ATATP', sector: 'TECH' });
    assert.equal(mapped.financial_investments, 0, 'Short-term financial investments (1AB) must be 0, not polluted by 1BC');
    assert.equal(mapped.non_current_financial_investments, 7039214187, 'Non-current financial investments (1BC) must be 7.04B');
    assert.equal(mapped.net_debt, -391459124, 'Net debt must be -391.46M TL (real net cash), not -7.43B TL');

    // 2. Valuation and Rule of 40 test
    const atatpData = {
      ticker: 'ATATP',
      sector: 'TECH',
      current_price: 206.10,
      share_count: 93800000,
      paid_in_capital: 93800000,
      financial_history: [
        {
          period: '2025/06',
          revenue: 3755911808,
          operating_profit: 2641115833,
          net_income: 1424882058,
          equity: 3170728807,
          roe: 46.8
        },
        {
          period: '2026/06',
          revenue: 3665488134,
          gross_margin: 87.3,
          ebitda: 2729492791,
          ebitda_margin: 74.5,
          net_income: 1340871160,
          operating_cash_flow: 559440738,
          free_cash_flow: 76578357,
          equity: 6416509467,
          minority_interests: 3868185316,
          non_controlling_interests: 3868185316,
          net_debt: -391459124,
          roe: 41.78,
          roic: 54.53
        }
      ]
    };

    const scoreRes = calculateSectorScore(atatpData, 'TECH');
    const r40Item = scoreRes.breakdown.find(b => b.category.includes('Rule of 40'));
    assert.ok(r40Item, 'Must have Rule of 40 category');
    assert.ok(r40Item.reason.includes('Tahakkuk Riski') || r40Item.reason.includes('Zayıf'), `Rule of 40 score reason must reflect weak cash conversion: ${r40Item.reason}`);
    assert.ok(r40Item.score <= 14, `Rule of 40 score (${r40Item.score}/25) must be penalised due to negative growth + 2.1% FCF margin`);

    const valRes = computeSectorValuationAndDrivers(atatpData, 206.10);
    assert.ok(valRes.valuation.fair_value < 350, `Fair value must be deflated and realistic (got ${valRes.valuation.fair_value} TL, was 404 TL)`);
    assert.equal(valRes.valuation.final_decision, 'NÖTR', 'Decision must be NÖTR (not false AL) due to deflated multiple and bridge');
  });

  it('21. Related-Party & Shadow Holding Audit Engine (Grup İçi Sermaye Aktarımı & Gölge Holdingleşme Dedektörü): Flags all 4 indicators on ATATP and exempts Holding companies', () => {
    const atatpLatest = {
      period: '2026/06',
      revenue: 3665488134,
      net_income: 1340871160,
      minority_net_income: 1201429107,
      consolidated_net_income: 2542300267,
      investment_income: 42233752,
      total_assets: 11048966888,
      non_current_financial_investments: 7039214187,
      equity: 6416509467,
      parent_equity: 6416509467,
      minority_interests: 3868185316,
      total_equity: 10284694783,
      gross_operating_cash_flow: 2950194559,
      working_capital_change: -2427571882,
      operating_cash_flow: 559440738,
      free_cash_flow: 76578357
    };

    const audit = analyzeRelatedPartyAndCapitalAllocationRisk(atatpLatest, 'TECH');
    assert.equal(audit.isRiskDetected, true, 'Must detect capital allocation & shadow holding risk on ATATP');
    assert.equal(audit.severity, 'CRITICAL', 'Severity must be CRITICAL with 4/4 indicators triggered');
    assert.equal(audit.triggeredCount, 4, 'All 4 quantitative forensic indicators must trigger on ATATP');
    assert.ok(audit.nonCurrentFinInvRatioAssets >= 60, `Non-current financial investments ratio to assets must be ~63.7% (got ${audit.nonCurrentFinInvRatioAssets}%)`);
    assert.ok(audit.annualizedInvYieldPct < 2.0, `Annualized investment yield must be ~1.2% (got ${audit.annualizedInvYieldPct}%)`);
    assert.ok(audit.minorityProfitLeakagePct >= 45.0, `Minority profit leakage must be ~47.3% (got ${audit.minorityProfitLeakagePct}%)`);
    assert.ok(audit.wcCashDrainPct >= 80.0, `Working capital cash drain must be ~82.3% (got ${audit.wcCashDrainPct}%)`);

    // Holding companies must be exempt from shadow holding penalty
    const holdingAudit = analyzeRelatedPartyAndCapitalAllocationRisk(atatpLatest, 'HOLDING');
    assert.equal(holdingAudit.isRiskDetected, false, 'Holding sector must be exempt from shadow holding penalty');
  });

  it('22. ESCOM (TFRS 10 Tech Venture / Investment Entity): Distinguishes investment entity from related-party risk, eliminates fake %69930 Rule of 40, and values via P/NAV', () => {
    const escomLatest = {
      period: '2026/09',
      revenue: 1275352396,
      cost_of_sales: 0,
      gross_margin: 100,
      inventories: 0,
      trade_receivables: 0,
      net_income: 461758380,
      operating_cash_flow: -362349,
      free_cash_flow: -362001,
      total_assets: 4673818687,
      non_current_financial_investments: 4629663693,
      equity: 4591067409,
      parent_equity: 4591067409,
      minority_interests: 0,
      net_debt: -1183974,
      roe: 9.93,
      roic: 10.1
    };

    const escomData = {
      ticker: 'ESCOM',
      sector: 'TECH',
      current_price: 3.56,
      share_count: 704800000,
      paid_in_capital: 704800000,
      financial_history: [
        {
          period: '2025/09',
          revenue: 1821000,
          net_income: -120000000,
          equity: 4100000000,
          roe: -3.0
        },
        escomLatest
      ]
    };

    assert.equal(isTfrs10InvestmentEntity(escomLatest, 'ESCOM'), true, 'Must detect ESCOM as a TFRS 10 Investment Entity');

    const audit = analyzeRelatedPartyAndCapitalAllocationRisk(escomLatest, 'TECH');
    assert.equal(audit.isRiskDetected, false, 'Must NOT accuse TFRS 10 investment entity of related-party shadow holding risk');
    assert.equal(audit.isInvestmentEntity, true, 'Must flag as TFRS 10 Investment Entity');
    assert.equal(audit.haircutPct, 0, 'Must not apply extra shadow holding haircut on top of P/NAV model');

    const scoreRes = calculateSectorScore(escomData, 'TECH');
    assert.ok(scoreRes.totalScore <= 65, `ESCOM score (${scoreRes.totalScore}/100) must reflect non-cash revaluation and low ROE, not 77/100 SaaS score`);
    const firstCat = scoreRes.breakdown[0];
    assert.ok(!firstCat.reason.includes('69930'), `Must not produce fake %69930 Rule of 40 reason: ${firstCat.reason}`);
    assert.ok(firstCat.reason.includes('TFRS 10') || firstCat.reason.includes('Gayrinakdi'), `Must explain TFRS 10 non-cash revaluation: ${firstCat.reason}`);

    const valRes = computeSectorValuationAndDrivers(escomData, 3.56);
    assert.ok(valRes.valuation.valuation_model_name.includes('TFRS 10'), `Must use TFRS 10 P/NAV model: ${valRes.valuation.valuation_model_name}`);
    assert.ok(valRes.valuation.fair_value >= 3.80 && valRes.valuation.fair_value <= 5.20, `ESCOM fair value must be P/NAV based (~4.42 TL), not inflated 10.24 TL EV/Sales (got ${valRes.valuation.fair_value} TL)`);
    assert.equal(valRes.valuation.final_decision, 'NÖTR', 'ESCOM decision must be NÖTR due to non-cash OCF');
  });

  it('23. Kurumsal Yatırım Tezi Sentezleyicisi (8.1 Panel): Synthesizes multi-criteria why-buy, sectoral edge, 4 pillars, and thesis breakers', () => {
    const maviDossier = synthesizeInvestmentThesis({
      ticker: 'MAVI',
      decision: 'AL',
      currentSector: 'RETAIL',
      officialSectorName: 'Giyim ve Tekstil Perakendeciliği',
      currentPrice: 82.0,
      fairValue: 118.5,
      discountPct: 30.8,
      latestData: {
        revenue: 34_000_000_000,
        gross_profit: 17_500_000_000,
        ebitda: 7_200_000_000,
        net_income: 3_600_000_000,
        operating_cash_flow: 5_100_000_000,
        free_cash_flow: 4_000_000_000,
        equity: 11_000_000_000,
        total_assets: 21_000_000_000,
        net_debt: -3_200_000_000,
        current_assets: 14_000_000_000,
        current_liabilities: 9_000_000_000,
        trade_payables: 6_500_000_000,
        trade_receivables: 1_200_000_000,
        inventories: 5_000_000_000
      },
      roic: 26.4,
      wacc: 4.8,
      evaSpread: 21.6,
      isTms29: true,
      sameSectorPeers: [
        { ticker: 'VAKKO', name: 'Vakko', marketCapMnTl: 15000 },
        { ticker: 'SUWEN', name: 'Suwen', marketCapMnTl: 5000 }
      ]
    });

    assert.equal(maviDossier.decisionMode, 'AL');
    assert.equal(maviDossier.pillars.length, 4, 'Must synthesize 4 core conviction pillars');
    assert.equal(maviDossier.standoutHighlights.length, 4, 'Must synthesize 4 standout highlights');
    assert.equal(maviDossier.sectoralComparisonBadges.length, 4, 'Must synthesize 4 sectoral comparison badges');
    assert.equal(maviDossier.catalysts.length, 3, 'Must provide 3 concrete catalysts');
    assert.equal(maviDossier.thesisBreakers.length, 3, 'Must provide 3 forensic thesis breakers');
    assert.ok(maviDossier.whyActionParagraphs.length >= 2, 'Must provide multi-paragraph synthesized investment thesis');
    assert.ok(maviDossier.sectoralEdgeNarrative.includes('VAKKO'), 'Must reference sector peers in sectoral edge narrative');
  });

  it('24. ZOREN (Chronic Utility Loss-Maker & Stale 2005 Dividend): Snowflake Dividend 0/6, Sector Score <= 35, Value Trap = true, Decision ALMA', () => {
    const zorenData = {
      ticker: 'ZOREN',
      sector: 'UTILITIES_TELCO',
      official_sector_name: 'Elektrik Üretim',
      current_price: 1.77,
      share_count: 5_000_000_000,
      paid_in_capital: 5_000_000_000,
      financial_history: [
        {
          period: '2025/06',
          revenue: 16_500_000_000,
          gross_profit: 4_778_638_000,
          operating_profit: 2_100_000_000,
          ebitda: 5_200_000_000,
          ebitda_margin: 31.5,
          net_income: -4_502_522_000,
          equity: 54_000_000_000,
          net_debt: 52_000_000_000,
          operating_cash_flow: 3_100_000_000,
          free_cash_flow: -2_400_000_000,
          roe: -14.2,
          roic: 1.2,
          real_wacc: 8.6,
          eva_spread: -7.4,
          is_tms29: true
        },
        {
          period: '2026/06',
          revenue: 11_368_500_000,
          gross_profit: 1_994_262_000,
          operating_profit: 420_000_000,
          ebitda: 3_650_000_000,
          ebitda_margin: 32.1,
          financing_expenses: -6_800_000_000,
          net_income: -8_033_804_000,
          equity: 48_300_000_000,
          net_debt: 58_500_000_000,
          operating_cash_flow: 2_200_000_000,
          free_cash_flow: -3_500_000_000,
          capex: -5_700_000_000,
          roe: -16.6,
          roic: -0.8,
          real_wacc: 8.6,
          eva_spread: -9.4,
          is_tms29: true
        }
      ]
    };

    const scoreRes = calculateSectorScore(zorenData, 'UTILITIES_TELCO');
    assert.ok(scoreRes.totalScore <= 35, `ZOREN sector score (${scoreRes.totalScore}) must be <= 35 due to -8.03B net loss, -58.3% gross profit collapse and -9.4 EVA`);
    assert.equal(scoreRes.suggestedDecision, 'ALMA', 'ZOREN suggestedDecision must be ALMA');

    const valRes = computeSectorValuationAndDrivers(zorenData, 1.77, 'UTILITIES_TELCO');
    assert.equal(valRes.valuation.is_value_trap, true, 'ZOREN must be flagged as a value trap');
    assert.ok(valRes.valuation.fair_value < 1.77, `ZOREN fair value (${valRes.valuation.fair_value}) must not exceed current price (1.77 TL) when net debt swallows EV and ROE is -16.6%`);
    assert.equal(valRes.valuation.final_decision, 'ALMA', 'ZOREN computed decision must be ALMA');

    const optDecision = optimizeFinalDecision({
      rawDecision: scoreRes.suggestedDecision,
      score: scoreRes.totalScore,
      valuation: valRes.valuation,
      latestData: zorenData.financial_history[1],
      sector: 'UTILITIES_TELCO',
      financialHistory: zorenData.financial_history
    });
    assert.equal(optDecision.finalDecision, 'ALMA', 'ZOREN final optimized decision must be ALMA');

    const snow = computeSnowflakeAnalysis({
      ticker: 'ZOREN',
      sector: 'UTILITIES_TELCO',
      currentPrice: 1.77,
      fairValue: valRes.valuation.fair_value,
      discountPct: valRes.valuation.discount_pct,
      financialHistory: zorenData.financial_history,
      latestData: zorenData.financial_history[1],
      dividends: [
        { year: 2005, date: '2005-05-25', perShareTl: 0.08, yieldPct: 4.2, payoutRatioPct: 35.0 }
      ],
      roic: -0.8,
      wacc: 8.6,
      evaSpread: -9.4
    });

    assert.equal(snow.axes.dividend.score, 0, `ZOREN with only a single 2005 dividend and -8.03B net loss must score 0/6 on Dividend axis, got ${snow.axes.dividend.score}/6`);
  });

  test('25. Cross-Sector Forensic Stress Audit: Chronic Loss, Negative ROE & Heavy Debt Across Retail, Healthcare & Agro-Chem Must Never Receive Artificial EV Floors or High P/B Multiples', () => {
    const buildDistressedSectorMock = (ticker, officialSector) => ({
      ticker,
      company_name: `${ticker} Sanayi ve Ticaret A.Ş.`,
      official_sector: officialSector,
      current_price: 12.50,
      share_count: 1_000_000_000,
      paid_in_capital: 1_000_000_000,
      financial_history: [
        {
          period: '2025/12',
          revenue: 24_000_000_000,
          gross_profit: 5_200_000_000,
          operating_profit: 1_800_000_000,
          ebitda: 2_600_000_000,
          ebitda_margin: 10.8,
          net_income: -1_900_000_000,
          equity: 14_000_000_000,
          net_debt: 22_000_000_000,
          operating_cash_flow: 400_000_000,
          free_cash_flow: -1_500_000_000,
          roe: -13.5,
          roic: 1.5,
          real_wacc: 9.0,
          eva_spread: -7.5,
          is_tms29: true
        },
        {
          period: '2026/12',
          revenue: 18_000_000_000,
          gross_profit: 2_800_000_000,
          operating_profit: 350_000_000,
          ebitda: 1_400_000_000,
          ebitda_margin: 7.8,
          financing_expenses: -4_200_000_000,
          net_income: -3_400_000_000,
          equity: 10_600_000_000,
          net_debt: 25_500_000_000,
          operating_cash_flow: -200_000_000,
          free_cash_flow: -2_100_000_000,
          capex: -1_900_000_000,
          roe: -32.1,
          roic: -1.8,
          real_wacc: 9.0,
          eva_spread: -10.8,
          is_tms29: true
        }
      ]
    });

    const cases = [
      { ticker: 'DIST_RET', officialSector: 'Perakande - Ticaret', engineSector: 'RETAIL' },
      { ticker: 'DIST_HLTH', officialSector: 'Sağlık ve İlaç', engineSector: 'HEALTHCARE' },
      { ticker: 'DIST_AGRO', officialSector: 'Tarım Kimyasalları', engineSector: 'INDUSTRIAL' },
      { ticker: 'DIST_TECH_WH', officialSector: 'Bilgisayar Toptancılığı', engineSector: 'TECH' },
      { ticker: 'DIST_DEF', officialSector: 'Savunma', engineSector: 'INDUSTRIAL' },
      { ticker: 'DIST_AVIA', officialSector: 'Hava Yolu ve Hizmetleri', engineSector: 'AVIATION' },
      { ticker: 'DIST_REIT', officialSector: 'Gayrimenkul Yatırım Ortaklığı', engineSector: 'REIT' },
      { ticker: 'DIST_BANK', officialSector: 'Bankacılık', engineSector: 'BANKING' },
      { ticker: 'DIST_INS', officialSector: 'Sigorta', engineSector: 'INSURANCE' }
    ];

    for (const c of cases) {
      const mockData = buildDistressedSectorMock(c.ticker, c.officialSector);
      const scoreRes = calculateSectorScore(mockData, c.engineSector);
      assert.ok(scoreRes.totalScore <= 38, `${c.ticker} (${c.officialSector}) score (${scoreRes.totalScore}) must be <= 38 under severe net loss and negative ROE`);
      assert.equal(scoreRes.suggestedDecision, 'ALMA', `${c.ticker} suggestedDecision must be ALMA`);

      const valRes = computeSectorValuationAndDrivers(mockData, 12.50, c.engineSector);
      assert.ok(valRes.valuation.fair_value < 5.0, `${c.ticker} (${c.officialSector}) fair value (${valRes.valuation.fair_value}) must not be inflated by artificial EV floor or sector P/B when net debt > EV and ROE is -32.1%`);
      assert.equal(valRes.valuation.final_decision, 'ALMA', `${c.ticker} final_decision must be ALMA`);
    }
  });

  it('26. BERA (Holding Dead-Code Elimination & Unprofitable Asset Trap): ROE 0.09%, EVA -11.6, P/E 215.8x applies 0.45x P/NAV (not 0.70x) and blocks AL decision', () => {
    const beraData = {
      ticker: 'BERA',
      sector: 'HOLDING',
      official_sector_name: 'Holding ve Yatırım Şirketleri',
      current_price: 10.27,
      share_count: 683200000,
      paid_in_capital: 683200000,
      financial_history: [
        {
          period: '2025/09',
          revenue: 15810000000,
          gross_profit: 3950000000,
          operating_profit: 2900000000,
          ebitda: 3556000000,
          net_income: 32300000,
          equity: 36800000000,
          parent_equity: 36800000000,
          net_debt: -2100000000,
          roe: 0.12
        },
        {
          period: '2026/09',
          revenue: 17752510464,
          gross_profit: 3829463040,
          operating_profit: 2175922944,
          ebitda: 2591866112,
          net_income: 24380829,
          equity: 37039580224,
          parent_equity: 37039580224,
          net_debt: -2374948096,
          operating_cash_flow: 3145000000,
          roe: 0.09,
          roic: 4.28,
          real_wacc: 15.88,
          eva_spread: -11.6,
          is_tms29: true,
          holding_discount: 81.1
        }
      ]
    };

    const res = computeSectorValuationAndDrivers(beraData, 10.27, 'HOLDING');
    assert.equal(res.drivers.target_multiple.numericValue, 0.45, `BERA target multiple (${res.drivers.target_multiple.numericValue}) must execute roe < 10.0 branch (0.45x), NOT short-circuit to 0.70x`);
    assert.ok(res.valuation.fair_value <= 25.0, `BERA fair value (${res.valuation.fair_value}) must be ~24.40 TL (0.45x P/NAV), never 38.64 TL (0.70x)`);
    assert.equal(res.valuation.is_value_trap, true, 'BERA must be flagged as an Unprofitable Asset Trap / Value Trap');
    assert.ok((res.valuation.value_trap_reasons || []).length >= 3, 'BERA must have >= 3 concrete forensic value trap reasons');
    assert.notEqual(res.valuation.final_decision, 'AL', 'BERA must NEVER receive AL decision with 0.09% ROE, -11.6 EVA and 215.8x P/E');
    assert.equal(res.valuation.final_decision, 'NÖTR', 'BERA decision must be capped at NÖTR');

    const rawReport = `### VI. Temel Riskler, Katalizörler ve Nihai Karar\nAnalist Kararı: **[AL]**\nHesaplanan **38.64 TL** adil değer ile cazip görünmektedir.`;
    const synced = syncReportTextWithValuation(rawReport, res.valuation, res.scoreResult, res.drivers, 10.27, beraData);
    assert.ok(synced.includes('Analist Kararı: **[NÖTR]**'), 'Synced report header must be updated to [NÖTR]');
    assert.ok(!synced.includes('Analist Kararı: **[AL]**'), 'Synced report must not retain contradictory [AL] decision');
    assert.ok(synced.includes('Neden "AL" Verilmedi?') || synced.includes('Neden AL Verilmedi?') || synced.includes('Değer Tuzağı'), 'Synced report must include forensic bear case & value trap reasons');
  });

  it('27. RGYAS (Thesis Synthesizer Sign & Logic Integrity): Negative EVA (-9.6) and weak cash conversion (18%) never produce +-9.6 or value-creation claims', () => {
    const rgyasDossier = synthesizeInvestmentThesis({
      ticker: 'RGYAS',
      decision: 'AL',
      currentSector: 'REIT',
      officialSectorName: 'Gayrimenkul Yatırım Ortaklığı',
      currentPrice: 120.0,
      fairValue: 165.0,
      discountPct: 37.5,
      latestData: {
        revenue: 8500000000,
        gross_profit: 5800000000,
        ebitda: 5200000000,
        net_income: 12000000000,
        operating_cash_flow: 2160000000,
        free_cash_flow: 1500000000,
        equity: 95000000000,
        total_assets: 110000000000,
        net_debt: -4500000000
      },
      roic: 7.9,
      wacc: 17.5,
      evaSpread: -9.6,
      isTms29: true,
      earningsQuality: {
        cashConversionRatio: 18.0
      }
    });

    const fullText = JSON.stringify(rgyasDossier);
    assert.ok(!fullText.includes('+-9.6') && !fullText.includes('+-%') && !fullText.includes('+% -'), `Must never contain malformed double sign +-9.6 in dossier: ${fullText}`);
    assert.ok(!rgyasDossier.whyActionParagraphs.join(' ').includes('reel sermaye maliyetinin üzerinde'), 'Negative EVA must never claim ROIC is above WACC');
    assert.ok(!rgyasDossier.whyActionParagraphs.join(' ').includes('gerçek ekonomik değer yaratmasıdır'), 'Negative EVA must never claim positive economic value creation');
    assert.ok(rgyasDossier.whyActionParagraphs.join(' ').includes('-9.6 puan negatif EVA makası'), 'Must explicitly state -9.6 puan negatif EVA makası');
    assert.ok(!rgyasDossier.whyActionParagraphs.join(' ').includes('tahakkuk riskinden ayrışmaktadır'), '18% cash conversion must not claim separation from accrual risk');
    const cashHighlight = rgyasDossier.standoutHighlights.find(h => h.tag === 'NAKİT AKIŞ KALİTESİ');
    assert.ok(cashHighlight && !cashHighlight.title.includes('Güçlü İşletme Nakit Üretimi'), `18% cash conversion must not be labeled Güçlü İşletme Nakit Üretimi: ${cashHighlight?.title}`);
  });

  it('28. TCKRC (State Pollution Isolation & Sync Idempotency): Frontend sector state is isolated per report and syncReportTextWithValuation is idempotent', () => {
    const pageSource = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    const simplySource = fs.readFileSync(new URL('../app/simply/simply-view.tsx', import.meta.url), 'utf8');

    assert.ok(!pageSource.includes("if (selectedSector !== 'AUTO') return selectedSector;"), 'app/page.tsx must not allow manual upload selectedSector to override activeReport sector');
    assert.ok(!pageSource.includes('if (bistData.sector) {\n        setSelectedSector(bistData.sector);\n      }'), 'handleBistDirectAnalysis must not pollute selectedSector state');
    assert.ok(simplySource.includes('const currentSector: SectorType = useMemo('), 'SimplyView must derive currentSector directly from report.extractedData.sector / detectSector(report.ticker)');

    const tckrcVal = {
      current_price: 92.65,
      fair_value: 46.84,
      discount_pct: -49.4,
      margin_of_safety: 0,
      margin_of_safety_status: 'UNSAFE',
      final_decision: 'ALMA',
      is_value_trap: false,
      value_trap_reasons: []
    };
    const staleReport = `### V. Değerleme\nİndirgenmiş nakit akışı ve çarpan analizimiz sonucunda hesaplanan adil değer **268.48 TL** seviyesindedir ve cari piyasa fiyatına göre **%114.8 getiri potansiyeli** taşımaktadır.\n### VI. Temel Riskler, Katalizörler ve Nihai Karar\nAnalist Kararı: **[AL]**`;
    const sync1 = syncReportTextWithValuation(staleReport, tckrcVal);
    const sync2 = syncReportTextWithValuation(sync1, tckrcVal);
    assert.ok(sync1.includes('**46.84 TL**'), 'Must replace stale 268.48 TL fair value with 46.84 TL');
    assert.ok(!sync1.includes('268.48 TL'), 'Must not leave stale 268.48 TL in report text');
    assert.ok(sync1.includes('Analist Kararı: **[ALMA]**'), 'Must update decision to [ALMA]');
    assert.equal(sync1, sync2, 'syncReportTextWithValuation must be 100% idempotent across repeated invocations');
  });

  it('29. All 53 Official Sectors Value Trap & General Asset Trap Coverage: Enforces sector-specific traps and sector-independent General Asset Trap Rule', () => {
    // 1) Banking Negative Real ROE & NPL Trap
    const bankTrap = evaluateValueTrap(
      [{ period: '2026/06', net_income: 2000000000, equity: 40000000000, roe: 10.5, npl_ratio: 5.8, car_ratio: 12.5, expected_inflation: 25.0 }],
      10.0, 15.0, 'BANKING'
    );
    assert.equal(bankTrap.isValueTrap, true, 'Bank with ROE 10.5% < Inflation 25% and NPL 5.8% must be flagged as Value Trap');
    assert.ok(bankTrap.reasons.some(r => r.includes('Negatif Reel Özsermaye Kârlılığı') || r.includes('NPL')));

    // 2) Insurance Combined Ratio > 105% & Negative Technical Balance Trap
    const insTrap = evaluateValueTrap(
      [{ period: '2026/06', net_income: 500000000, equity: 5000000000, roe: 18.0, combined_ratio: 108.5, technical_balance: -420000000 }],
      20.0, 30.0, 'INSURANCE'
    );
    assert.equal(insTrap.isValueTrap, true, 'Insurance company with Combined Ratio 108.5% > 105% and Technical Balance < 0 must be flagged as Value Trap');
    assert.ok(insTrap.reasons.some(r => r.includes('Birleşik Oran Tuzağı')));
    assert.ok(insTrap.reasons.some(r => r.includes('Negatif Teknik Denge')));

    // 3) Cyclical Commodity Peak Margin Trap
    const cycTrap = evaluateValueTrap(
      [{ period: '2026/06', ticker: 'EREGL', official_sector_name: 'Demir-Çelik Temel', revenue: 100000000000, ebitda: 34000000000, ebitda_margin: 34.0, mid_cycle_ebitda_margin: 15.0, pe: 4.2, roic: 8.0, real_wacc: 12.0, eva_spread: -4.0 }],
      40.0, 60.0, 'INDUSTRIAL'
    );
    assert.equal(cycTrap.isValueTrap, true, 'Cyclical commodity company at peak margin (34% vs 15% mid-cycle) with P/E 4.2x must be flagged as Peak Margin Trap');
    assert.ok(cycTrap.reasons.some(r => r.includes('Döngüsel Tepe Kâr Tuzağı')));

    // 4) Tech / Software Cash Burn & Rule-of-40 Failure
    const techTrap = evaluateValueTrap(
      [{ period: '2026/06', official_sector_name: 'Yazılım ve Bilişim', revenue: 500000000, revenue_growth: 8.0, ebitda: 15000000, ebitda_margin: 3.0, net_income: -40000000, operating_cash_flow: -85000000, free_cash_flow: -110000000, roe: -6.0 }],
      15.0, 25.0, 'TECH'
    );
    assert.equal(techTrap.isValueTrap, true, 'Tech company with cash burn and Rule-of-40 = 11% < 40% must be flagged as Value Trap');
    assert.ok(techTrap.reasons.some(r => r.includes('Nakit Yakma Tuzağı')));
    assert.ok(techTrap.reasons.some(r => r.includes('Kuralı-40')));

    // 5) Sector-Independent General Asset Trap Rule (P/E > 80x, TTM ROE < Rf/4, EVA < -5 caps decision at NÖTR/ALMA)
    const generalAssetTrapOpt = optimizeFinalDecision({
      rawDecision: 'AL',
      score: 78,
      valuation: { current_price: 50.0, fair_value: 80.0, discount_pct: 60.0, is_value_trap: true, value_trap_reasons: ['Genel Varlık Tuzağı Kuralı'] },
      marketPrice: 50.0,
      fairValue: 80.0,
      latestData: { equity: 10000000000, net_income: 50000000, operating_profit: 100000000, operating_cash_flow: 120000000, roe: 2.5, roic: 3.0, real_wacc: 12.0, eva_spread: -9.0, pe: 95.0, risk_free_rate: 28.0, is_tms29: true },
      sector: 'INDUSTRIAL'
    });
    assert.notEqual(generalAssetTrapOpt.finalDecision, 'AL', 'General Asset Trap Rule must block AL regardless of sector');
    assert.equal(generalAssetTrapOpt.finalDecision, 'NÖTR', 'General Asset Trap Rule must cap decision at NÖTR');
  });

  it('30. Frontend Review & SimplyView Isolation: activeReport is null when step !== "report", handleSelectReport resets state, and Single Source of Truth decision overrides raw text regexes', () => {
    const pageSource = fs.readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    const simplySource = fs.readFileSync(new URL('../app/simply/simply-view.tsx', import.meta.url), 'utf8');

    assert.ok(pageSource.includes("if (step !== 'report') {\n      return null;\n    }"), 'activeReport useMemo must return null whenever step !== "report" to prevent stale report data leaking into review/input steps');
    assert.ok(pageSource.includes("setActiveReportId(null);\n    setTicker(targetTicker);\n    setSelectedSector('AUTO');"), 'handleBistDirectAnalysis must clear activeReportId and reset selectedSector to AUTO');
    assert.ok(pageSource.includes("setActiveReportId(null);\n    setSelectedSector('AUTO');\n    setPipelineStep(1);"), 'handleExtract must clear activeReportId and reset selectedSector to AUTO');
    assert.ok(simplySource.includes('const handleSelectReport = useCallback('), 'SimplyView must define handleSelectReport that resets local sector/view state before delegating');
    assert.ok(simplySource.includes("if (normFallback === 'AL')"), 'parseVerdictNarrative in SimplyView must prioritize ValuationState fallbackDecision over loose rawText regexes');
    assert.ok(simplySource.includes('isValueTrap: resolvedIsValueTrap'), 'SimplyView must pass resolvedIsValueTrap and resolvedValueTrapReasons into synthesizeInvestmentThesis');
  });

  it('31. Unconditional General Asset Trap Across Solvent Producers & Unpopulated P/E: F/K > 80x, TTM ROE < Rf/4, EVA < -5 triggers detectValueTrap and blocks AL even when OCF > 0 and latestData.pe is omitted', () => {
    const allEngineSectors = [
      'INDUSTRIAL', 'REIT', 'HOLDING', 'TECH', 'AVIATION', 'RETAIL',
      'BANKING', 'INSURANCE', 'HEALTHCARE', 'UTILITIES_TELCO', 'FINANCIAL_SERVICES'
    ];

    for (const sec of allEngineSectors) {
      // Case where operating_cash_flow > 0, net_debt < 0 (solvent cash producer), and pe is NOT pre-populated on latestData
      // Price = 100 TL, Shares = 100,000,000 -> Market Cap = 10,000,000,000 TL
      // Net Income = 100,000,000 TL (annual) -> Implied P/E = 100.0x (> 80x)
      // Equity = 5,000,000,000 TL -> ROE = 2.0% (< Rf/4 = 7.0%), EVA = -8.5 (< -5.0)
      const hist = [{
        period: '2026/12',
        revenue: 4000000000,
        gross_profit: 900000000,
        operating_profit: 450000000,
        ebitda: 600000000,
        net_income: 100000000,
        equity: 5000000000,
        net_debt: -500000000,
        operating_cash_flow: 480000000,
        free_cash_flow: 320000000,
        share_count: 100000000,
        shares_outstanding: 100000000,
        roe: 2.0,
        roic: 3.5,
        real_wacc: 12.0,
        eva_spread: -8.5,
        risk_free_rate: 28.0,
        current_ratio: 2.4,
        is_tms29: true
      }];

      const trapRes = evaluateValueTrap(hist, 100.0, 160.0, sec);
      assert.equal(trapRes.isValueTrap, true, `Sector ${sec} with derived P/E 100x (>80x), ROE 2.0% (<Rf/4), and EVA -8.5 (<-5) must be flagged as General Asset Trap even with positive OCF`);
      assert.ok(trapRes.reasons.some(r => r.includes('Genel Varlık Tuzağı Kuralı') || r.includes('Varlık Tuzağı') || r.includes('Reel Özsermaye')), `Sector ${sec} must include General Asset Trap reason, got: ${JSON.stringify(trapRes.reasons)}`);

      const optRes = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 82,
        valuation: { current_price: 100.0, fair_value: 160.0, discount_pct: 60.0 },
        marketPrice: 100.0,
        fairValue: 160.0,
        latestData: hist[0],
        sector: sec
      });
      assert.notEqual(optRes.finalDecision, 'AL', `Sector ${sec} must NEVER receive AL under General Asset Trap even when latestData.pe is omitted and score is 82`);
    }
  });

  it('32. Valuation Dead-Code & Formula Weight Sum Integrity: Holding has no duplicate roe < 10.0 branch and Tourism/Media/Paper formula weights sum to 100%', () => {
    const valSource = fs.readFileSync(new URL('../lib/valuation.ts', import.meta.url), 'utf8');
    const holdingRoeMatches = valSource.match(/else if \(roe !== null && roe < 10\.0\)/g) || [];
    assert.equal(holdingRoeMatches.length, 0, 'Unreachable duplicate else if (roe !== null && roe < 10.0) branch in HOLDING must be removed');

    for (const secCase of [
      { ticker: 'TRZM_TEST', official: 'Turizm', sector: 'INDUSTRIAL' },
      { ticker: 'MDYA_TEST', official: 'Medya', sector: 'INDUSTRIAL' },
      { ticker: 'KAGT_TEST', official: 'Kağıt Ürünleri', sector: 'INDUSTRIAL' }
    ]) {
      const mock = {
        ticker: secCase.ticker,
        official_sector_name: secCase.official,
        current_price: 20.0,
        share_count: 100000000,
        paid_in_capital: 100000000,
        financial_history: [{
          period: '2026/12',
          revenue: 5000000000,
          gross_profit: 1500000000,
          operating_profit: 900000000,
          ebitda: 1100000000,
          net_income: 650000000,
          equity: 3200000000,
          net_debt: 200000000,
          roe: 20.3,
          roic: 18.0,
          real_wacc: 11.0,
          eva_spread: 7.0,
          is_tms29: true
        }]
      };
      const res = computeSectorValuationAndDrivers(mock, 20.0, secCase.sector);
      const formula = res.valuation.formula_display || '';
      assert.ok(formula.includes('(%45)') && formula.includes('(%35)') && formula.includes('(%20)'), `${secCase.official} formula weights must be %45 + %35 + %20 = %100, got: ${formula}`);
      assert.ok(!formula.includes('(%15)'), `${secCase.official} formula must not contain mismatched (%15) PD/DD weight`);
    }
  });

  it('33. Section 7 (Yatırım Tezi) & Section 8 (Analiz Raporu) Split, Chapter Parser, Verdict Narrative & Negative EBITDA Breaker Integrity', () => {
    // 1. Negative EBITDA Margin in synthesizeInvestmentThesis (e.g., VESBE -1.8%)
    const vesbeThesis = synthesizeInvestmentThesis({
      ticker: 'VESBE',
      sector: 'INDUSTRIAL',
      officialSectorName: 'Dayanıklı Tüketim',
      decision: 'ALMA',
      currentPrice: 3.95,
      fairValue: 2.46,
      ebitdaMargin: -1.8,
      grossMargin: 7.3,
      netMargin: -6.7,
      roe: -11.2,
      roic: -4.5,
      wacc: 12.2,
      evaSpread: -16.7,
      netDebt: 26230000,
      ebitda: -623450,
      operatingCashFlow: -2540000,
      freeCashFlow: -3120000,
      netIncome: -2280000,
      currentRatio: 0.78,
      isValueTrap: true,
      valueTrapReasons: ['Negatif FAVÖK ve nakit yakımı']
    });

    assert.equal(vesbeThesis.sectoralComparisonBadges[1].label, 'FD / FAVÖK & PD/DD', 'Badge label must have space after ampersand');
    assert.ok(
      vesbeThesis.thesisBreakers[0].includes('Operasyonel Zarar Sarmalı') && !vesbeThesis.thesisBreakers[0].includes('%5 eşiğinin altına sarkması'),
      `Negative EBITDA margin (-1.8%) must not claim dropping below +5% threshold; got: ${vesbeThesis.thesisBreakers[0]}`
    );

    // 2. Low positive EBITDA Margin (e.g. 4.0%) scales threshold below 4.0% instead of clamping to 5.0%
    const lowMarginThesis = synthesizeInvestmentThesis({
      ticker: 'LOWM',
      sector: 'INDUSTRIAL',
      decision: 'NÖTR',
      currentPrice: 10,
      fairValue: 11,
      ebitdaMargin: 4.0,
      grossMargin: 12.0,
      netMargin: 1.5,
      roe: 12.0,
      roic: 10.0,
      wacc: 11.0,
      evaSpread: -1.0
    });
    assert.ok(
      lowMarginThesis.thesisBreakers[0].includes('%2.8 eşiğinin altına sarkması'),
      `4.0% EBITDA margin must set breaker threshold below 4.0% (2.8%), got: ${lowMarginThesis.thesisBreakers[0]}`
    );

    // 3. Verify simply-view.tsx mirror parity and Section 7 / 8 / 9 structure
    const appSimply = fs.readFileSync(new URL('../app/simply/simply-view.tsx', import.meta.url), 'utf8');
    const srcSimply = fs.readFileSync(new URL('../src/app/simply/simply-view.tsx', import.meta.url), 'utf8');
    const libSynth = fs.readFileSync(new URL('../lib/investment-thesis-synthesizer.ts', import.meta.url), 'utf8');
    const srcSynth = fs.readFileSync(new URL('../src/lib/investment-thesis-synthesizer.ts', import.meta.url), 'utf8');

    assert.equal(appSimply, srcSimply, 'app/simply/simply-view.tsx and src/app/simply/simply-view.tsx must be 100% identical');
    assert.equal(libSynth, srcSynth, 'lib/investment-thesis-synthesizer.ts and src/lib/investment-thesis-synthesizer.ts must be 100% identical');

    assert.ok(appSimply.includes("{ id: 'sec-yatirim-tezi', num: '7', label: 'Yatırım Tezi'"), 'Nav must have 7. Yatırım Tezi');
    assert.ok(appSimply.includes("{ id: 'sec-analist', num: '8', label: 'Analiz Raporu'"), 'Nav must have 8. Analiz Raporu');
    assert.ok(appSimply.includes("{ id: 'sec-gecmis', num: '9', label: 'Geçmiş'"), 'Nav must have 9. Geçmiş');
    assert.ok(appSimply.includes('cleanMarkdown(report.report, effectiveDecision, false)'), 'handleCopyReportText must pass stripTrailingVerdict=false so copied report preserves Analyst Verdict');
    assert.ok(appSimply.includes('Emniyet\\s*(?:Marjı|Sınırları|Sınırı)'), 'parseVerdictNarrative must match Riskler & Emniyet Sınırları');
    assert.ok(appSimply.includes('Finansal\\s+Sağlık\\s+Skoru'), 'parseVerdictNarrative thesisMatch must stop before Finansal Sağlık Skoru');

    // 4. Execute cleanMarkdown, parseReportIntoChapters, and parseVerdictNarrative from simply-view.tsx on real report formats
    const cleanSnippetFn = (str, maxLen = 240) => {
      let s = str
        .replace(/^\s*[-*•>]\s*/gm, '')
        .replace(/#+\s*/g, '')
        .replace(/\*\*/g, '')
        .replace(/\n+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (s.length <= maxLen) return s;
      const cut = s.slice(0, maxLen);
      const lastPeriod = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      if (lastPeriod > maxLen * 0.55) return cut.slice(0, lastPeriod + 1).trim();
      const lastSpace = cut.lastIndexOf(' ');
      return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '…';
    };

    const parseVerdictMatch = appSimply.match(/function parseVerdictNarrative[\s\S]*?(?=\nfunction cleanMarkdown)/);
    const cleanMdMatch = appSimply.match(/function cleanMarkdown[\s\S]*?(?=\ninterface ParsedReportChapter)/);
    const parseChaptersMatch = appSimply.match(/function parseReportIntoChapters[\s\S]*?(?=\n\ninterface ErrorBoundaryProps)/);
    assert.ok(parseVerdictMatch && cleanMdMatch && parseChaptersMatch, 'Helper functions must be extractable from simply-view.tsx');

    const jsCode = [
      parseVerdictMatch[0]
        .replace(/rawText:\s*string,\s*fallbackDecision:\s*string\s*=\s*'AL',\s*context\?:\s*\{\s*ticker\?:\s*string;\s*discountPct\?:\s*number\s*\}\s*\):\s*ParsedVerdictNarrative/, 'rawText, fallbackDecision = "AL", context)')
        .replace(/let verdict:\s*'AL'\s*\|\s*'ALMA'\s*\|\s*'NÖTR'\s*=/, 'let verdict ='),
      cleanMdMatch[0]
        .replace(/text:\s*string,\s*decision\?:\s*string,\s*stripTrailingVerdict\s*=\s*true\):\s*string/, 'text, decision, stripTrailingVerdict = true)')
        .replace(/\(_match:\s*string,\s*inner:\s*string\)/, '(_match, inner)')
        .replace(/\(l:\s*string\)/g, '(l)'),
      parseChaptersMatch[0]
        .replace(/markdownText:\s*string\):\s*ParsedReportChapter\[\]/, 'markdownText)')
        .replace(/const CHAPTER_META:\s*Record<string,\s*\{\s*id:\s*string;\s*subtitle:\s*string;\s*tag:\s*string\s*\}>/, 'const CHAPTER_META')
        .replace(/const chapters:\s*ParsedReportChapter\[\]/, 'const chapters')
        .replace(/const usedRomans\s*=\s*new Set<string>\(\)/, 'const usedRomans = new Set()')
        .replace(/let introLines:\s*string\[\]/, 'let introLines')
        .replace(/let currentHeader:\s*\{\s*roman:\s*string;\s*title:\s*string\s*\}\s*\|\s*null/, 'let currentHeader')
        .replace(/let currentBodyLines:\s*string\[\]/, 'let currentBodyLines'),
      'return { parseVerdictNarrative, cleanMarkdown, parseReportIntoChapters };'
    ].join('\n\n');

    const helpers = new Function('cleanSnippet', jsCode)(cleanSnippetFn);

    // 4a. Deterministic report format from lib/valuation.ts (with Fin. Sağlık Skoru & Riskler & Emniyet Sınırları)
    const sampleDeterministicReport = `## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ
**Temel Yatırım Tezi:** Şirket güçlü nakit akışı ve pozitif EVA üretmektedir.

**Finansal Sağlık Skoru:** 84/100 (Güçlü Bilanço).

## VI. SKOR MATRİSİ VE NİHAİ KARAR
### Analist Kararı: [AL]

Şirket iskontolu işlem görmektedir.

**Kilit Katalizörler:**
- İhracat artışı ve marj genişlemesi.

**Riskler & Emniyet Sınırları:**
- Kur oynaklığı ve işletme sermayesi ihtiyacı.
- Ayı senaryosu taban fiyatı: 42,50 TL.`;

    const verdictParsed = helpers.parseVerdictNarrative(sampleDeterministicReport, 'AL', { ticker: 'TEST', discountPct: 28.5 });
    assert.equal(verdictParsed.verdict, 'AL');
    assert.ok(!verdictParsed.thesis.includes('Finansal Sağlık Skoru'), `Thesis must not leak Finansal Sağlık Skoru, got: ${verdictParsed.thesis}`);
    assert.ok(!verdictParsed.catalysts.includes('Riskler'), `Catalysts must not leak Riskler header, got: ${verdictParsed.catalysts}`);
    assert.ok(verdictParsed.risks.includes('Kur oynaklığı') && verdictParsed.risks.includes('42,50 TL'), `Risks must extract Riskler & Emniyet Sınırları, got: ${verdictParsed.risks}`);

    // 4b. Copy report (stripTrailingVerdict = false) vs Display chapters (stripTrailingVerdict = true)
    const copiedMd = helpers.cleanMarkdown(sampleDeterministicReport, 'AL', false);
    const displayMd = helpers.cleanMarkdown(sampleDeterministicReport, 'AL', true);
    assert.ok(copiedMd.includes('Analist Kararı:') && copiedMd.includes('Riskler & Emniyet Sınırları:'), 'Copied report must retain trailing Analyst Verdict and Risks');
    assert.ok(!displayMd.includes('Analist Kararı:'), 'Display markdown for 8.1 chapters must strip trailing Analyst Verdict (rendered in 8.2)');

    // 4c. AGESA_SAMPLE_REPORT_TEXT and VESBE_SAMPLE_REPORT_TEXT chapter parsing
    const agesaChapters = helpers.parseReportIntoChapters(helpers.cleanMarkdown(AGESA_SAMPLE_REPORT_TEXT, 'AL', true));
    assert.equal(agesaChapters.length, 6, `AGESA sample report must parse into 6 chapters (I..VI), got ${agesaChapters.length}`);
    assert.deepEqual(agesaChapters.map(c => c.roman), ['I', 'II', 'III', 'IV', 'V', 'VI']);
    assert.deepEqual(agesaChapters.map(c => c.id), ['sec-analist-i', 'sec-analist-ii', 'sec-analist-iii', 'sec-analist-iv', 'sec-analist-v', 'sec-analist-vi']);

    const vesbeChapters = helpers.parseReportIntoChapters(helpers.cleanMarkdown(VESBE_SAMPLE_REPORT_TEXT, 'ALMA', true));
    assert.equal(vesbeChapters.length, 6, `VESBE sample report must parse into 6 chapters (I..VI), got ${vesbeChapters.length}`);
    assert.deepEqual(vesbeChapters.map(c => c.roman), ['I', 'II', 'III', 'IV', 'V', 'VI']);

    // 4d. Arabic numbered ## 1. / ### 1. headers normalize to Roman numerals without duplicate number prefix
    const arabicMd = `### 1. YÖNETİCİ ÖZETİ\nDetay 1\n## 2. KÂR KALİTESİ\nDetay 2`;
    const arabicChapters = helpers.parseReportIntoChapters(helpers.cleanMarkdown(arabicMd, 'AL', true));
    assert.equal(arabicChapters.length, 2);
    assert.equal(arabicChapters[0].roman, 'I');
    assert.equal(arabicChapters[0].title, 'YÖNETİCİ ÖZETİ');
    assert.equal(arabicChapters[1].roman, 'II');
    assert.equal(arabicChapters[1].title, 'KÂR KALİTESİ');
  });

  it('34. Section 7 & 8 UX Enhancements: Pure Turkish Checklist Triggers (7.4), Pillar Evidence Accordion (7.3), Asymmetry Bar (7.1), Sticky Decision Bar, 7.1/8.2 De-duplication & Semantic Report Highlighting (8.1)', () => {
    // 1. Test across multiple sectors (RETAIL, INSURANCE, TECH_SW, AVIATION, INDUSTRIAL, TFRS 10) for pure Turkish checklist triggers and evidence items
    const sectorsToTest = [
      { ticker: 'MAVI', currentSector: 'RETAIL', officialSectorName: 'Perakende', decision: 'AL', currentPrice: 82, fairValue: 118.5 },
      { ticker: 'AGESA', currentSector: 'INSURANCE', officialSectorName: 'Sigorta', decision: 'AL', currentPrice: 118.5, fairValue: 164.2 },
      { ticker: 'ASELS', currentSector: 'DEFENSE', officialSectorName: 'Savunma & Teknoloji', decision: 'AL', currentPrice: 65, fairValue: 92 },
      { ticker: 'THYAO', currentSector: 'AVIATION', officialSectorName: 'Havacılık', decision: 'AL', currentPrice: 295, fairValue: 410 },
      { ticker: 'ESCOM', currentSector: 'TECH_SW', officialSectorName: 'Girişim Sermayesi', decision: 'NÖTR', currentPrice: 3.56, fairValue: 4.42, capAllocAudit: { isInvestmentEntity: true } },
      { ticker: 'VESBE', currentSector: 'INDUSTRIAL', officialSectorName: 'Dayanıklı Tüketim', decision: 'ALMA', currentPrice: 3.95, fairValue: 2.46, isValueTrap: true, valueTrapReasons: ['Negatif FAVÖK ve nakit yakımı'] }
    ];

    const bannedEnglishParens = /\(\s*(?:Float|Backlog|IPO|Re-rating|re-rating|exit\/halka arz|CapEx|CASK|pricing power)\s*\)/i;

    for (const cfg of sectorsToTest) {
      const dossier = synthesizeInvestmentThesis({
        ticker: cfg.ticker,
        decision: cfg.decision,
        currentSector: cfg.currentSector,
        officialSectorName: cfg.officialSectorName,
        currentPrice: cfg.currentPrice,
        fairValue: cfg.fairValue,
        discountPct: ((cfg.fairValue - cfg.currentPrice) / cfg.fairValue) * 100,
        latestData: {
          revenue: 15_000_000_000,
          gross_profit: 5_200_000_000,
          ebitda: 3_100_000_000,
          net_income: 2_000_000_000,
          operating_cash_flow: 2_500_000_000,
          free_cash_flow: 1_800_000_000,
          equity: 9_000_000_000,
          total_assets: 18_000_000_000,
          net_debt: -1_200_000_000
        },
        roic: 22.0,
        wacc: 12.0,
        evaSpread: 10.0,
        capAllocAudit: cfg.capAllocAudit,
        isValueTrap: cfg.isValueTrap,
        valueTrapReasons: cfg.valueTrapReasons
      });

      assert.equal(dossier.catalystChecklist.length, 3, `${cfg.ticker} must have 3 catalystChecklist items`);
      assert.ok(dossier.breakerChecklist.length >= 3, `${cfg.ticker} must have at least 3 breakerChecklist items`);
      if (cfg.isValueTrap) {
        assert.equal(dossier.breakerChecklist.length, 4, `${cfg.ticker} with valueTrapReasons must append 4th breakerChecklist item`);
      }

      for (const item of [...dossier.catalystChecklist, ...dossier.breakerChecklist]) {
        assert.ok(item.category && item.metric && item.threshold && item.period && item.text, `${cfg.ticker} checklist item must have all fields populated`);
        assert.ok(!bannedEnglishParens.test(item.text), `${cfg.ticker} checklist item text must not contain English parenthetical jargon: ${item.text}`);
      }

      for (const pillar of dossier.pillars) {
        assert.ok(pillar.shortSummary && pillar.shortSummary.length > 15, `${cfg.ticker} pillar ${pillar.id} must have a concise shortSummary`);
        assert.equal(pillar.evidenceItems.length, 3, `${cfg.ticker} pillar ${pillar.id} must have 3 structured evidenceItems`);
        for (const ev of pillar.evidenceItems) {
          assert.ok(ev.label && ev.value && ev.comment, `${cfg.ticker} pillar ${pillar.id} evidence item must have label, value, comment`);
        }
      }

      const serialized = JSON.stringify(dossier);
      assert.ok(!bannedEnglishParens.test(serialized), `${cfg.ticker} dossier must be free of English parenthetical terms: ${serialized}`);
    }

    // 2. Verify top-level property fallback & valueTrapReasons English parenthetical sanitization in synthesizeInvestmentThesis
    const trapSanitizeDossier = synthesizeInvestmentThesis({
      ticker: 'TRAP_TEST',
      sector: 'INDUSTRIAL',
      decision: 'ALMA',
      currentPrice: 10,
      fairValue: 6.5,
      ebitdaMargin: -2.0,
      grossMargin: 8.0,
      netMargin: -7.5,
      roe: -14.0,
      roic: -5.0,
      wacc: 12.0,
      evaSpread: -17.0,
      netDebt: 45_000_000,
      ebitda: -1_200_000,
      operatingCashFlow: -3_000_000,
      freeCashFlow: -4_500_000,
      netIncome: -3_500_000,
      currentRatio: 0.72,
      isValueTrap: true,
      valueTrapReasons: [
        'Genel Varlık Tuzağı Kuralı (Asset Trap): Defter değeri yüksek görünse de reel değer üretilmemektedir.',
        '**Döngüsel Tepe Kâr Tuzağı (Peak Margin):** Cari marjlar döngü ortasının üzerindedir.'
      ]
    });
    const cashPillar = trapSanitizeDossier.pillars.find(p => p.id === 'cash_fortress');
    assert.notEqual(cashPillar.metrics[1].value, 'Net Nakit', 'Top-level positive netDebt must not be misclassified as Net Nakit');
    assert.equal(cashPillar.metrics[2].value, '0.72x', 'Top-level currentRatio must be preserved');
    for (const bItem of trapSanitizeDossier.breakerChecklist) {
      assert.ok(!bItem.text.includes('(Asset Trap)') && !bItem.text.includes('(Peak Margin)') && !bItem.text.includes('**'), `breakerChecklist must strip English parentheticals and markdown asterisks: ${bItem.text}`);
    }
    assert.equal(trapSanitizeDossier.breakerChecklist[3].category, 'Genel Varlık Tuzağı Kuralı', 'Extra breakerChecklist item must extract Turkish category prefix before colon');

    // 3. Verify simply-view.tsx & valuation.ts mirror parity and Section 7 & Section 8 UI structures
    const appSimply = fs.readFileSync(new URL('../app/simply/simply-view.tsx', import.meta.url), 'utf8');
    const srcSimply = fs.readFileSync(new URL('../src/app/simply/simply-view.tsx', import.meta.url), 'utf8');
    const libVal = fs.readFileSync(new URL('../lib/valuation.ts', import.meta.url), 'utf8');
    const srcVal = fs.readFileSync(new URL('../src/lib/valuation.ts', import.meta.url), 'utf8');
    assert.equal(appSimply, srcSimply, 'app/simply/simply-view.tsx and src/app/simply/simply-view.tsx must remain 100% identical');
    assert.equal(libVal, srcVal, 'lib/valuation.ts and src/lib/valuation.ts must remain 100% identical');

    // Sticky Decision Bar in Section 7 (positioned below mobile nav top-[104px] lg:top-14)
    assert.ok(appSimply.includes('sticky top-[104px] lg:top-14 z-20'), 'Section 7 sticky bar must clear mobile sticky nav at top-[104px] lg:top-14');
    assert.ok(appSimply.includes("{ id: 'sec-yatirim-tezi-71', label: '7.1 Tez Özeti' }"), 'Section 7 must have sticky decision bar with Turkish sub-navigation');
    // Visual Opportunity & Risk Asymmetry Bar in 7.1
    assert.ok(appSimply.includes('02 • Fırsat / Risk Dengesi'), 'Section 7.1 must include Visual Opportunity & Risk Asymmetry Bar');
    assert.ok(appSimply.includes('Aşağı Yönlü Stres Alanı'), 'Section 7.1 Asymmetry Bar must include Turkish downside stress label');
    assert.ok(appSimply.includes('rawBear < currentPriceNum'), 'Section 7.1 & 8.2 must guard against bear_price >= currentPriceNum inversion');
    // 7.3 Evidence Accordion
    assert.ok(appSimply.includes('toggleThesisPillar(pillar.id)'), 'Section 7.3 must have interactive Veri Detayı accordion toggle');
    assert.ok(appSimply.includes('Veri Detayı'), 'Section 7.3 accordion must use simplified Turkish label');
    // 7.4 Measurable Checklist (3-item capped compact + expandable)
    assert.ok(appSimply.includes('7.4 Takip Kriterleri'), 'Section 7.4 must render simplified Takip Kriterleri header');
    assert.ok(appSimply.includes('synthesizedThesis.catalystChecklist'), 'Section 7.4 must render catalystChecklist');
    assert.ok(appSimply.includes('synthesizedThesis.breakerChecklist'), 'Section 7.4 must render breakerChecklist');
    assert.ok(appSimply.includes('.slice(0, 3)'), 'Section 7.4 must cap catalyst & risk lists to 3 items');
    assert.ok(appSimply.includes('toggleChecklistItem(itemKey)'), 'Section 7.4 checklist items must support compact expand/collapse toggle');
    // 7.5 KAP Findings & Section 6 Management Scorecard
    assert.ok(appSimply.includes('7.5 Faaliyet Raporu ve Dipnot Bulguları'), 'Section 7.5 must render simplified title');
    assert.ok(appSimply.includes('formatKapFindingForDisplay'), 'Section 7.5 must apply directional impact & excerpt cleanup formatter');
    assert.ok(!appSimply.includes('Denetim Durumu:'), 'Section 7.5 must not display AI-sounding Denetim Durumu banner');
    assert.ok(appSimply.includes('Yönetim Hedef Karnesi'), 'Section 6 must render Yönetim Hedef Karnesi scorecard');
    // 8.1 Semantic Highlighting, Cross-References & Refined List Typography
    assert.ok(appSimply.includes('8.1 Detaylı Analiz Raporu'), 'Section 8.1 must render simplified Detaylı Analiz Raporu title');
    assert.ok(appSimply.includes('renderSemanticEvalBadge'), 'Section 8.1 must include semantic evaluation badge renderer');
    assert.ok(appSimply.includes('resolveCrossReferenceTarget'), 'Section 8.1 must include cross-reference link resolver');
    assert.ok(appSimply.includes('border-l-2 border-[#2e3646] hover:border-[#f5c242]/80 pl-3.5 py-1'), 'Section 8.1 li items must use thin left-bordered typography instead of heavy boxes');

    // Execute combinedRegex from simply-view.tsx against Turkish cross-references, multi-dot currencies, negative currencies, and capital İ discounts
    const combinedRxMatch = appSimply.match(/const combinedRegex = (\/.*\/gi);/);
    assert.ok(combinedRxMatch, 'combinedRegex must be extractable from simply-view.tsx');
    const combinedRx = eval(combinedRxMatch[1]);
    const tokenize = (s) => [...s.matchAll(combinedRx)].map(x => ({
      full: x[0],
      type: x[1] ? 'eval' : x[2] ? 'ret' : x[3] ? 'curr' : x[4] ? 'xref' : 'metric'
    }));

    assert.deepEqual(tokenize('Piyasa Değeri: 21.330.000.000 TL'), [{ full: '21.330.000.000 TL', type: 'curr' }], 'Multi-dot currency must match in full');
    assert.deepEqual(tokenize('Sonuç: -623,45 Milyon TL zarar'), [{ full: '-623,45 Milyon TL', type: 'curr' }], 'Negative currency must retain minus sign inside match');
    assert.deepEqual(tokenize('İskonto Oranı: %38,6 İskontolu'), [{ full: '%38,6 İskontolu', type: 'ret' }], 'Turkish capital İ in İskontolu must match returnOrDiscount');
    assert.deepEqual(tokenize('Hisse %37,7 primlidir (güvenlik marjı bulunmamaktadır).'), [
      { full: '%37,7 primlidir', type: 'ret' },
      { full: '(güvenlik marjı bulunmamaktadır)', type: 'eval' }
    ], 'Agglutinative suffix -dir in primlidir must not be chopped and negative parenthetical must match');
    assert.deepEqual(tokenize('100 TL/120 TL bandında %4-6 esneme'), [
      { full: '100 TL', type: 'curr' },
      { full: '120 TL', type: 'curr' },
      { full: '%4-6', type: 'metric' }
    ], 'Slash-separated currencies and percentage ranges must tokenize cleanly');

    for (const xrefTerm of [
      'Net İşletme Nakit Akışı',
      'Serbest Nakit Akışı (FCF)',
      'Nakit dönüşüm oranı',
      'Değerleme Çarpanları',
      'İndirgenmiş Nakit Akışı',
      'Reel EVA Makası',
      'Temettü',
      'Bilanço',
      'İşletme Sermayesi',
      'FD/FAVÖK'
    ]) {
      const tokens = tokenize(`Analizde ${xrefTerm} incelenmiştir.`);
      assert.ok(tokens.some(t => t.type === 'xref' && t.full === xrefTerm), `Turkish cross-reference term "${xrefTerm}" must match as xref, got: ${JSON.stringify(tokens)}`);
    }

    // 8.2 Non-repetitive Audit & Portfolio Positioning
    assert.ok(appSimply.includes('8.2 Karar ve Portföy Özeti'), 'Section 8.2 must render simplified Karar ve Portföy Özeti title');
    assert.ok(appSimply.includes('2. Portföy Stratejisi'), 'Section 8.2 must include Portföy Stratejisi card');
  });

  it('35. Quantitative Mathematical Edge Suite (Öneri 1-5): Probabilistic E[V] & Half-Kelly, 4Q Momentum Slope, Beneish Accrual Audit, Cross-Sectional Z-Score Alpha & Historical Signal Tracker', () => {
    // 1. Öneri 1: Probabilistic E[V], Asymmetry Ratio & Half-Kelly Sizing
    const strongAlEdge = calculateProbabilisticExpectedValue({
      currentPrice: 100,
      fairValue: 145,
      bullPrice: 180,
      bearPrice: 88,
      totalScore: 82,
      evaSpread: 6.5,
      cashConversionRatio: 115,
      isNetCash: true,
      isValueTrap: false,
      decision: 'AL'
    });
    assert.ok(strongAlEdge.expectedValue > 130, `Strong AL E[V] should exceed 130 TL, got ${strongAlEdge.expectedValue}`);
    assert.ok(strongAlEdge.asymmetryRatio >= 1.8, `Strong AL asymmetry ratio should be >= 1.8, got ${strongAlEdge.asymmetryRatio}`);
    assert.ok(strongAlEdge.halfKellyWeightPct > 0 && strongAlEdge.halfKellyWeightPct <= 15.0, `Strong AL Half-Kelly should be in (0, 15.0], got ${strongAlEdge.halfKellyWeightPct}`);
    assert.equal(strongAlEdge.edgeStatus, 'STRONG_POSITIVE_EDGE', 'Strong AL must classify as STRONG_POSITIVE_EDGE');

    const trapAlmaEdge = calculateProbabilisticExpectedValue({
      currentPrice: 100,
      fairValue: 130,
      isValueTrap: true,
      decision: 'ALMA'
    });
    assert.equal(trapAlmaEdge.halfKellyWeightPct, 0, 'Value trap / ALMA must enforce 0% Half-Kelly position weight');
    assert.equal(trapAlmaEdge.edgeStatus, 'NEGATIVE_EXPECTANCY', 'Value trap / ALMA must classify as NEGATIVE_EXPECTANCY');

    // 2. Öneri 2: 4Q Fundamental Momentum & 2nd-Derivative Slope
    const turnaroundMom = calculateFundamentalMomentum(
      [
        { period: '2025/09', ebitda_margin: 8.0, roic: -2.0 },
        { period: '2025/12', ebitda_margin: 10.5, roic: 1.0 },
        { period: '2026/03', ebitda_margin: 13.0, roic: 4.5 },
        { period: '2026/06', ebitda_margin: 15.5, roic: 8.5 }
      ],
      'INDUSTRIAL',
      8.0,
      0.5
    );
    assert.ok(turnaroundMom.marginSlopePtsPerQ > 0.7, `Turnaround margin slope must exceed 0.7, got ${turnaroundMom.marginSlopePtsPerQ}`);
    assert.ok(turnaroundMom.roicSlopePtsPerQ > 1.2, `Turnaround ROIC slope must exceed 1.2, got ${turnaroundMom.roicSlopePtsPerQ}`);
    assert.equal(turnaroundMom.regime, 'TURNAROUND_ALPHA', 'Rising sub-WACC ROIC/margin slope must detect TURNAROUND_ALPHA');

    const earlyDecayMom = calculateFundamentalMomentum(
      [
        { period: '2025/09', ebitda_margin: 24.0, roic: 26.0 },
        { period: '2025/12', ebitda_margin: 21.0, roic: 22.0 },
        { period: '2026/03', ebitda_margin: 18.0, roic: 18.0 },
        { period: '2026/06', ebitda_margin: 15.0, roic: 14.0 }
      ],
      'INDUSTRIAL',
      12.5,
      1.5
    );
    assert.ok(earlyDecayMom.marginSlopePtsPerQ <= -1.2, `Early decay margin slope must be <= -1.2, got ${earlyDecayMom.marginSlopePtsPerQ}`);
    assert.ok(earlyDecayMom.roicSlopePtsPerQ <= -2.0, `Early decay ROIC slope must be <= -2.0, got ${earlyDecayMom.roicSlopePtsPerQ}`);
    assert.equal(earlyDecayMom.regime, 'EARLY_DECAY_WARNING', 'Declining positive-EVA slope must trigger EARLY_DECAY_WARNING');

    // 3. Öneri 3: Beneish DSRI/GMI/AQI & Accrual Anomaly Risk
    const beneishAudit = calculateEarningsQuality(
      [
        {
          period: '2025/06',
          revenue: 1000,
          trade_receivables: 150,
          gross_margin: 30,
          operating_cash_flow: 120,
          net_income: 100,
          total_assets: 2000
        },
        {
          period: '2026/06',
          revenue: 1100,
          trade_receivables: 260,
          gross_margin: 24,
          operating_cash_flow: 10,
          net_income: 140,
          total_assets: 2400
        }
      ],
      'INDUSTRIAL'
    );
    assert.ok(beneishAudit.dsri != null && beneishAudit.dsri > 1.25, `DSRI must detect receivable bloat > 1.25, got ${beneishAudit.dsri}`);
    assert.ok(beneishAudit.gmi != null && beneishAudit.gmi > 1.15, `GMI must detect margin deterioration > 1.15, got ${beneishAudit.gmi}`);
    assert.equal(beneishAudit.accountingRiskLevel, 'YÜKSEK', 'High DSRI & weak OCF vs profit must trigger YÜKSEK accounting risk');

    // 4. Öneri 4: Cross-Sectional Z-Score & ROIC-Regressed Residual Alpha
    const alphaMultiples = calculateCompanyMultiples(
      {
        period: '2026/06',
        net_income: 500_000_000,
        equity: 2_000_000_000,
        ebitda: 800_000_000,
        revenue: 4_000_000_000,
        roic: 18.0,
        eva_spread: 6.5
      },
      10,
      250_000_000,
      'INDUSTRIAL',
      {
        pe: 5.5,
        pb: 1.2,
        ev_ebitda: 4.2,
        sector_averages: { pe: 10.5, pb: 2.2, ev_ebitda: 7.5 }
      }
    );
    assert.ok(alphaMultiples.compositeZScore != null && alphaMultiples.compositeZScore < -0.35, `Composite Z-Score must be < -0.35, got ${alphaMultiples.compositeZScore}`);
    assert.equal(alphaMultiples.residualAlphaStatus, 'UNDERVALUED_QUALITY', 'Discounted high-ROIC stock must receive UNDERVALUED_QUALITY');

    // 5. Öneri 5 UI Strings & Dual-Directory Parity Check
    const appSimply = fs.readFileSync(new URL('../app/simply/simply-view.tsx', import.meta.url), 'utf8');
    const srcSimply = fs.readFileSync(new URL('../src/app/simply/simply-view.tsx', import.meta.url), 'utf8');
    const libSynth = fs.readFileSync(new URL('../lib/investment-thesis-synthesizer.ts', import.meta.url), 'utf8');
    const srcSynth = fs.readFileSync(new URL('../src/lib/investment-thesis-synthesizer.ts', import.meta.url), 'utf8');
    assert.equal(appSimply, srcSimply, 'app/simply/simply-view.tsx and src/app/simply/simply-view.tsx must be 100% identical');
    assert.equal(libSynth, srcSynth, 'lib/investment-thesis-synthesizer.ts and src/lib/investment-thesis-synthesizer.ts must be 100% identical');

    for (const uiMarker of [
      'Olasılık Ağırlıklı E[V]',
      'Optimal Portföy Ağırlığı (Yarı-Kelly)',
      'İvme Rejimi (2. Türev)',
      'Alacak Endeksi (DSRI):',
      'Model Sinyal Performansı',
      'Güncel Fark:'
    ]) {
      assert.ok(appSimply.includes(uiMarker), `simply-view.tsx must include quantitative edge UI marker: ${uiMarker}`);
    }
  });

  it('36. Non-Core Other Operating Income Inflation Guard (LKMNH 2026/09): strips >=50% other_operating_income_net from EBITDA/NetIncome, caps score and blocks AL when core profit is negative', () => {
    const lkmnhLikeItem = {
      period: '2026/09',
      revenue: 4_192_289_787,
      gross_profit: 718_808_506,
      administrative_expenses: -244_295_362,
      marketing_expenses: -59_207_892,
      other_operating_income_net: 1_004_181_656,
      operating_profit: 1_419_486_908,
      depreciation: 496_400_968,
      ebitda: 1_915_887_876,
      ebt: 843_620_000,
      tax_expense: 8_908_000,
      net_income: 834_712_259,
      operating_cash_flow: 480_202_595,
      net_debt: 1_701_294_775,
      equity: 3_632_823_197,
      current_ratio: 1.15,
      roe: 24.83,
      roic: 23.19,
      wacc: 39.7,
      eva_spread: 10.3,
      paid_in_capital: 216_000_000,
      ebitda_margin: 45.7,
    };

    const adj = resolveCoreOperatingAdjustment(lkmnhLikeItem, 'HEALTHCARE');
    assert.equal(adj.isNonCoreInflated, true, 'Must detect >=50% non-core other operating income');
    assert.ok(adj.ooiSharePct >= 70.0, `Expected ~70.7% share, got ${adj.ooiSharePct}`);
    assert.ok(adj.normalizedEbitda !== null && adj.normalizedEbitda < 950_000_000, `Core EBITDA must strip 1B one-off income, got ${adj.normalizedEbitda}`);
    assert.ok(adj.normalizedNetIncome !== null && adj.normalizedNetIncome < 0, `Core net income without one-off income must be negative, got ${adj.normalizedNetIncome}`);

    // Exempt sectors & normal operating items must NOT trigger
    assert.equal(resolveCoreOperatingAdjustment(lkmnhLikeItem, 'HOLDING').isNonCoreInflated, false);
    assert.equal(resolveCoreOperatingAdjustment({ ...lkmnhLikeItem, other_operating_income_net: 100_000_000 }, 'HEALTHCARE').isNonCoreInflated, false);

    const valRes = computeSectorValuationAndDrivers(
      {
        ticker: 'LKMNH',
        sector: 'HEALTHCARE',
        current_price: 10.26,
        share_count: 216_000_000,
        paid_in_capital: 216_000_000,
        financial_history: [
          { period: '2025/09', revenue: 3_834_850_827, gross_profit: 647_970_153, operating_profit: 423_563_051, ebitda: 889_759_360, net_income: 119_659_523, equity: 2_279_316_748, roe: 13.03, roic: 9.77 },
          { period: '2025/12', revenue: 5_263_619_611, gross_profit: 932_319_253, operating_profit: 653_527_320, ebitda: 1_284_654_670, net_income: 186_903_527, equity: 2_941_328_134, roe: 6.35, roic: 8.51 },
          lkmnhLikeItem,
        ],
      },
      '10.26',
      'HEALTHCARE'
    );

    assert.equal(valRes.valuation.final_decision, 'NÖTR', 'Core-loss non-core-inflated stock must not get AL');
    assert.ok(valRes.scoreResult.totalScore < 75, `Score must be capped below 75 (not 100/100), got ${valRes.scoreResult.totalScore}`);
    assert.ok(valRes.valuation.fair_value < 45, `Fair value must be core-normalized (<45 TL, not ~74 TL), got ${valRes.valuation.fair_value}`);
    assert.ok(valRes.drivers.margin.value < 35, `EBITDA margin driver must reflect core margin (<35%), got ${valRes.drivers.margin.value}`);
  });

  it('37. buildForensicRedFlagsSection: prevents false FCF shortage when CFO/FCF >> NetIncome, prioritizes overrideReason, and avoids score<75 contradiction on 87/100', () => {
    const block = buildForensicRedFlagsSection({
      ticker: 'TESTX',
      valuation: {
        fair_value: 100,
        bear_price: 80,
        discount_pct: 24.8,
        final_decision: 'NÖTR',
      },
      optimization: {
        finalDecision: 'NÖTR',
        overrideReason: 'Muhafazakar Emniyet Marjı Filtresi: İskonto potansiyeli (%24.8), kurumsal %25 AL emniyet marjı eşiğinin altında kalmıştır.',
      },
      scoreResult: {
        totalScore: 87,
        sector: 'INDUSTRIAL',
        anomalies: [],
        breakdown: [
          { category: 'İhracat Gelirleri & Kur Koruması', status: 'warning', reason: 'Sağlıklı operasyonel kârlılık (FAVÖK marjı: %18.6).' },
        ],
      },
      latestItem: {
        net_income: 980_000_000,
        operating_cash_flow: 4_500_000_000,
        free_cash_flow: 4_120_000_000,
        working_capital_change: -345_000_000,
        inventories: 8_070_000_000,
        trade_receivables: 2_780_000_000,
        net_debt: -500_000_000,
        ebitda: 2_000_000_000,
        roe: 25.0,
        roic: 22.0,
        real_wacc: 14.0,
        gross_margin: 32.0,
      },
    });

    assert.ok(block.includes('Karar Freni (Model Gerekçesi):'), 'Must include explicit overrideReason');
    assert.ok(!block.includes('Kâr Var, Sıcak Nakit Yok'), 'Must NOT emit false cash shortage when FCF=4.12B vs Net=980M');
    assert.ok(!block.includes('güçlü alım eşiğinin altında'), 'Must NOT claim 87/100 score is below threshold');
    assert.ok(!block.includes('Sağlıklı operasyonel kârlılık'), 'Must NOT leak positive-toned warning as negative reason');
  });

  it('38. Strict Negative EVA Gate (<0) & Idle Cash Capital Misallocation Alarm (Rule 11.7)', () => {
    // 1. Borderline negative EVA (-2.5 pts) in operating sector must NOT get AL (strict EVA < 0 -> NÖTR)
    const negEvaOpt = optimizeFinalDecision({
      rawDecision: 'AL',
      score: 84,
      sector: 'INDUSTRIAL',
      ticker: 'TEST_EVA',
      valuation: { fair_value: 100, current_price: 50, discount_pct: 50 },
      latestData: {
        period: '2026/09',
        equity: 1_000_000_000,
        ebitda: 300_000_000,
        net_income: 150_000_000,
        operating_cash_flow: 200_000_000,
        roic: 11.5,
        real_wacc: 14.0,
        roe: 18.0,
        net_debt: 100_000_000,
      },
    });
    assert.equal(negEvaOpt.finalDecision, 'NÖTR', 'Any negative EVA (<0) in operating sector must downgrade AL to NÖTR');
    assert.ok(negEvaOpt.overrideReason?.includes('Negatif Sermaye Makası'), 'Must explain negative EVA spread');

    // 2. Idle Cash + Minimal CapEx + Shrinking Revenue + Negative EVA (AAGYO-style) triggers Rule 11.7 even for REIT
    const idleCashOpt = optimizeFinalDecision({
      rawDecision: 'AL',
      score: 76,
      sector: 'REIT',
      ticker: 'AAGYO',
      valuation: { fair_value: 21.52, current_price: 7.36, discount_pct: 192.4 },
      latestData: {
        period: '2026/09',
        revenue: 891_000_000,
        cash_and_equivalents: 2_579_000_000,
        total_assets: 18_000_000_000,
        tangible_capex: -12_000_000,
        operating_cash_flow: 535_000_000,
        net_income: 494_000_000,
        equity: 17_731_000_000,
        net_debt: -2_629_000_000,
        roe: 5.13,
        roic: 6.06,
        real_wacc: 14.3,
        eva_spread: -8.2,
        share_count: 701_000_000,
      },
      financialHistory: [
        { period: '2025/09', revenue: 1_302_000_000 },
        { period: '2026/09', revenue: 891_000_000 },
      ],
    });
    assert.equal(idleCashOpt.finalDecision, 'NÖTR', 'Idle cash REIT with shrinking revenue and -8.2 EVA must be capped at NÖTR');
    assert.ok(idleCashOpt.conditionalWarnings.some(w => w.includes('Atıl Nakit & Yatırım Eksikliği Alarmı')), 'Must emit idle cash alarm');
  });

  it('39. Package A Forensic Audit Regression Suite: Covers KRİTİK-01..05, YÜKSEK-01/04/05/06, ORTA-04', () => {
    // 1. KRİTİK-01: ALMA decision does NOT artificially compress fair_value to currentPrice * 1.10
    const almaHolding = {
      ticker: 'TESTH',
      sector: 'HOLDING',
      current_price: 6.0,
      share_count: 100_000_000,
      paid_in_capital: 100_000_000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 5_000_000_000,
          ebitda: 1_200_000_000,
          operating_profit: 1_000_000_000,
          net_income: -450_000_000,
          equity: 5_000_000_000,
          parent_equity: 5_000_000_000,
          net_debt: -1_000_000_000,
          roe: -9.0,
          roic: -4.0,
          real_wacc: 15.0,
          eva_spread: -19.0
        }
      ]
    };
    const resAlma = computeSectorValuationAndDrivers(almaHolding, '6.0', 'HOLDING');
    assert.equal(resAlma.valuation.final_decision, 'ALMA');
    assert.equal(
      resAlma.valuation.fair_value,
      12,
      `ALMA fair_value (${resAlma.valuation.fair_value}) must equal intrinsic 12.00 TL without artificial 6.0*1.10 = 6.60 TL compression`
    );

    // 2. KRİTİK-02: FinancialRatioEngine never produces positive ROIC when EBIT < 0 and equity/IC <= 0
    const fenerLikeRatio = FinancialRatioEngine.computeMetrics({
      ticker: 'FENER',
      currentPrice: 2.13,
      shareCount: 250_000_000,
      sector: 'INDUSTRIAL',
      history: [
        {
          period: '2026/06',
          revenue: 3_200_000_000,
          operating_profit: -1_950_000_000,
          ebitda: -1_890_000_000,
          net_income: -8_080_000_000,
          equity: -6_500_000_000,
          net_debt: 4_200_000_000,
          short_term_debt: 2_500_000_000,
          long_term_debt: 2_000_000_000,
          cash_and_equivalents: 300_000_000,
          roic: 23.0
        }
      ]
    });
    assert.ok(
      fenerLikeRatio.margins.roic === null || fenerLikeRatio.margins.roic <= 0,
      `Negative EBIT + negative equity cannot produce positive ROIC (Got: ${fenerLikeRatio.margins.roic})`
    );

    // 3. KRİTİK-03 & YÜKSEK-04: Negative-EBITDA MEDIA/SPORTS delegates to Distressed & syncs target_multiple; positive-EBITDA branch eliminates zero-leg dilution
    const fenerVal = computeSectorValuationAndDrivers({
      ticker: 'FENER',
      sector: 'INDUSTRIAL',
      official_sector_name: 'Spor',
      current_price: 2.13,
      share_count: 250_000_000,
      paid_in_capital: 250_000_000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 4_500_000_000,
          operating_profit: -1_600_000_000,
          ebitda: -1_500_000_000,
          net_income: -1_200_000_000,
          equity: 3_500_000_000,
          net_debt: 1_800_000_000,
          roe: -34.0,
          roic: -15.0,
          real_wacc: 15.0,
          eva_spread: -30.0
        }
      ]
    }, '2.13');
    assert.match(fenerVal.valuation.valuation_model_name, /Sıkıntılı Şirket/);
    assert.match(fenerVal.drivers.target_multiple.value, /Hak Edilen Sıkıntılı PD\/DD/);
    const formulaPbMatch = fenerVal.valuation.formula_display.match(/\((\d+,\d+)x\)/);
    assert.ok(formulaPbMatch && fenerVal.drivers.target_multiple.value.includes(formulaPbMatch[1]),
      `Synced driver (${fenerVal.drivers.target_multiple.value}) must match formula_display (${fenerVal.valuation.formula_display})`
    );

    const zeroPeSteelVal = computeSectorValuationAndDrivers({
      ticker: 'KRDMD',
      sector: 'INDUSTRIAL',
      official_sector_name: 'Demir-Çelik Temel',
      current_price: 28.0,
      share_count: 1_000_000_000,
      paid_in_capital: 1_000_000_000,
      financial_history: [
        {
          period: '2026/06',
          revenue: 50_000_000_000,
          operating_profit: 3_500_000_000,
          ebitda: 7_500_000_000,
          net_income: -500_000_000,
          equity: 40_000_000_000,
          net_debt: 5_000_000_000,
          roe: -1.25,
          roic: 6.0,
          real_wacc: 14.0
        }
      ]
    }, '28.0');
    assert.ok(!zeroPeSteelVal.valuation.formula_display.includes('F/K'), 'Zero P/E leg must be dropped instead of diluting with 0.00 TL');

    // 4. KRİTİK-04: Negative-EVA Bank (GARAN) & low-cash-conversion REIT (RGYAS) gated to NÖTR
    const garanNegEva = optimizeFinalDecision({
      rawDecision: 'AL',
      score: 82,
      sector: 'BANKING',
      ticker: 'GARAN',
      valuation: { fair_value: 165.0, current_price: 118.0, discount_pct: 39.8 },
      marketPrice: 118.0,
      fairValue: 165.0,
      latestData: { period: '2026/06', roe: 23.8, roic: 23.8, real_wacc: 41.8, benchmark_wacc: 41.8, wacc: 41.8, equity: 290_000_000_000, net_income: 65_000_000_000 }
    });
    assert.equal(garanNegEva.finalDecision, 'NÖTR', 'Bank with ROE (23.8%) < WACC (41.8%) must be gated to NÖTR');

    const rgyasLowConv = optimizeFinalDecision({
      rawDecision: 'AL',
      score: 76,
      sector: 'REIT',
      ticker: 'RGYAS',
      valuation: { fair_value: 20.0, current_price: 12.0, discount_pct: 66.7 },
      marketPrice: 12.0,
      fairValue: 20.0,
      latestData: {
        period: '2026/06',
        total_assets: 15_000_000_000,
        equity: 12_000_000_000,
        net_debt: 1_000_000_000,
        net_income: 1_000_000_000,
        operating_cash_flow: 410_000_000,
        share_count: 1_000_000_000,
        roe: 8.5,
        roic: 4.5,
        real_wacc: 14.1,
        eva_spread: -9.6
      }
    });
    assert.equal(rgyasLowConv.finalDecision, 'NÖTR', 'REIT with 41% OCF/Net and -9.6 EVA must not bypass Rule 9');

    // 5. KRİTİK-05 & YÜKSEK-01: GOZDE-style Yatırım Ortaklığı micro revenue + negative ROE/EVA
    const gozdeMetrics = FinancialRatioEngine.computeMetrics({
      ticker: 'GOZDE',
      currentPrice: 20.0,
      shareCount: 385_000_000,
      sector: 'FINANCIAL_SERVICES',
      history: [
        { period: '2026/06', revenue: 1_000_000, gross_profit: -5_305_472_000, ebitda: -8_000_000_000, net_income: -8_410_000_000, equity: 28_000_000_000, roe: -29.1 }
      ]
    });
    assert.equal(gozdeMetrics.margins.grossMargin, null, 'Micro-revenue extreme margin (>200%) must resolve to null');
    assert.equal(gozdeMetrics.margins.netMargin, null);

    const gozdeVal = computeSectorValuationAndDrivers({
      ticker: 'GOZDE',
      sector: 'FINANCIAL_SERVICES',
      official_sector_name: 'Yatırım Ortaklıkları',
      current_price: 20.0,
      share_count: 385_000_000,
      paid_in_capital: 385_000_000,
      financial_history: [
        { period: '2026/06', revenue: 1_000_000, ebitda: -8_000_000_000, net_income: -8_410_000_000, equity: 28_000_000_000, roe: -29.1, eva_spread: -74.8, net_margin: -1657437.5, net_debt: 2_000_000_000 }
      ]
    }, '20.0');
    assert.ok(Math.abs(gozdeVal.drivers.margin.value) <= 100, `GOZDE driver margin (${gozdeVal.drivers.margin.value}) must fall back to clamped ROE`);
    assert.ok(gozdeVal.scoreResult.totalScore <= 45, `GOZDE chronic loss/negative EVA must be capped <= 45 (Got: ${gozdeVal.scoreResult.totalScore})`);

    // 6. YÜKSEK-05: InvariantSentinel clamps +%1610.8 to +%75.0 & preserves RETAIL 0.55 CR / AVIATION 4.0x ND
    const retailSf = {
      axes: {
        value: { key: 'value', label: 'Değerleme', score: 0, maxScore: 6, checks: [] },
        future: {
          key: 'future', label: 'Gelecek Büyüme', score: 0, maxScore: 6, checks: [
            { id: 'earnings_vs_savings', title: 'Tasarruf', passed: false, metricValue: '+%10.0', threshold: '>= %32.0', detail: '' }
          ]
        },
        past: { key: 'past', label: 'Geçmiş Performans', score: 0, maxScore: 6, checks: [] },
        health: {
          key: 'health', label: 'Finansal Sağlık', score: 0, maxScore: 6, checks: [
            { id: 'short_term_liabilities', title: 'Kısa Vadeli', passed: false, metricValue: 'Cari Oran: 0.40x', threshold: '>= 0.55x', detail: '' },
            { id: 'debt_level', title: 'Borçluluk', passed: false, metricValue: 'Net Borç / FAVÖK: 1.5x', threshold: '<= 4.0x', detail: '' }
          ]
        },
        dividend: { key: 'dividend', label: 'Temettü', score: 0, maxScore: 6, checks: [] }
      },
      totalScore: 0, percentage: 0, rewards: [], risks: []
    };
    const healedRetail = InvariantSentinel.validateAndHealSnowflake(JSON.parse(JSON.stringify(retailSf)), {
      ticker: 'MGROS',
      sector: 'RETAIL',
      unifiedMetrics: {
        growth: { netIncomeGrowthYoY: 1610.8 },
        liquidity: { currentRatio: 0.65, netDebtToEbitda: 3.5 }
      }
    });
    assert.equal(healedRetail.axes.future.checks[0].metricValue, '+%75.0');
    assert.equal(healedRetail.axes.health.checks[0].passed, true, 'RETAIL 0.65x >= 0.55x must pass');

    const healedAviation = InvariantSentinel.validateAndHealSnowflake(JSON.parse(JSON.stringify(retailSf)), {
      ticker: 'THYAO',
      sector: 'AVIATION',
      unifiedMetrics: { liquidity: { netDebtToEbitda: 3.5 } }
    });
    assert.equal(healedAviation.axes.health.checks[1].passed, true, 'AVIATION 3.5x <= 4.0x must pass');

    // 7. YÜKSEK-06: Sector reclassifications for ARSAN, SONME, PSDTC
    assert.equal(detectSector('ARSAN'), 'HOLDING');
    assert.equal(detectSector('SONME'), 'HOLDING');
    assert.notEqual(detectSector('PSDTC'), 'RETAIL');

    // 8. ORTA-04: Supplier-debt cash illusion & computeFinancialChange 0 -> 0
    const supplierTrap = FinancialRatioEngine.diagnoseCashQuality(1_000_000_000, -100_000_000, 5_000_000_000, 800_000_000);
    assert.equal(supplierTrap.status, 'CRITICAL_RISK');
    assert.equal(computeFinancialChange(0, 0, 'DEBT').percentChange, 0);
  });

});
