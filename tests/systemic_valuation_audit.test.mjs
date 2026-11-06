import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSectorValuationAndDrivers, calculateSectorScore, calculateDuPont5Step, analyzeRelatedPartyAndCapitalAllocationRisk, isTfrs10InvestmentEntity } from '../lib/valuation.ts';
import { IsYatirimApiAdapter } from '../lib/isyatirim-adapter.ts';

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

});
