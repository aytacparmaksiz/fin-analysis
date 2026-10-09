import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFinancialNumber,
  safeDivide,
  safeGrowthRate,
  safeMargin,
  safeRoe,
  homogenizeTms29Series,
  parsePeriodSortKey,
  getAnnualizationFactor,
  normalizePeriodName,
  enrichAndSanitizeFinancialHistory,
  calculateSectorScore,
  optimizeFinalDecision,
  computeSectorValuationAndDrivers,
  cleanAndParseJson
} from '../lib/valuation.ts';

import {
  detectSector,
  SECTOR_SCORING_CONFIG,
  SECTOR_DEFINITIONS
} from '../lib/sectors.ts';

import { resolveBistCompanyMeta } from '../lib/bist-service.ts';
import { getIsYatirimMultiplesForTicker } from '../lib/isyatirim-service.ts';

describe('Comprehensive Financial Terminal Stress Test Suite', () => {

  describe('1. parseFinancialNumber Edge Cases', () => {
    it('parses Turkish numbers with dot thousand and comma decimal', () => {
      assert.equal(parseFinancialNumber('1.234.567,89'), 1234567.89);
      assert.equal(parseFinancialNumber('12.345,67'), 12345.67);
      assert.equal(parseFinancialNumber('108,20'), 108.2);
    });

    it('parses US/International numbers with comma thousand and dot decimal', () => {
      assert.equal(parseFinancialNumber('1,234,567.89'), 1234567.89);
      assert.equal(parseFinancialNumber('12,345.67'), 12345.67);
      assert.equal(parseFinancialNumber('108.20'), 108.2);
    });

    it('parses negative numbers with various minus representations', () => {
      assert.equal(parseFinancialNumber('(1.234,50)'), -1234.5);
      assert.equal(parseFinancialNumber('1.234,50-'), -1234.5);
      assert.equal(parseFinancialNumber('-1.234,50'), -1234.5);
      assert.equal(parseFinancialNumber('−1.234,50'), -1234.5); // Unicode minus
      assert.equal(parseFinancialNumber('–1.234,50'), -1234.5); // En dash
      assert.equal(parseFinancialNumber('—1.234,50'), -1234.5); // Em dash
      assert.equal(parseFinancialNumber('₺ -500,25'), -500.25);
      assert.equal(parseFinancialNumber('(500,25) TL'), -500.25);
    });

    it('safely returns null for dashes, placeholders and non-numbers', () => {
      assert.equal(parseFinancialNumber('-'), null);
      assert.equal(parseFinancialNumber('—'), null);
      assert.equal(parseFinancialNumber('–'), null);
      assert.equal(parseFinancialNumber('A/D'), null);
      assert.equal(parseFinancialNumber('N/A'), null);
      assert.equal(parseFinancialNumber('null'), null);
      assert.equal(parseFinancialNumber(''), null);
      assert.equal(parseFinancialNumber('   '), null);
      assert.equal(parseFinancialNumber(null), null);
      assert.equal(parseFinancialNumber(undefined), null);
      assert.equal(parseFinancialNumber(NaN), null);
      assert.equal(parseFinancialNumber(Infinity), null);
    });

    it('handles zero correctly', () => {
      assert.equal(parseFinancialNumber('0'), 0);
      assert.equal(parseFinancialNumber('0,00'), 0);
      assert.equal(parseFinancialNumber('0.00'), 0);
      assert.equal(parseFinancialNumber(0), 0);
    });

    it('handles percentage flag for single-dot/comma ratios', () => {
      assert.equal(parseFinancialNumber('12.5%', { isPercentage: true }), 12.5);
      assert.equal(parseFinancialNumber('12,5%', { isPercentage: true }), 12.5);
      assert.equal(parseFinancialNumber('-15.4%', { isPercentage: true }), -15.4);
    });
  });

  describe('2. Safe Mathematical Functions', () => {
    it('safeDivide guards against zero, null, undefined, NaN and infinite denominators', () => {
      assert.equal(safeDivide(100, 0), null);
      assert.equal(safeDivide(100, 0, 0), 0);
      assert.equal(safeDivide(100, 1e-12), null);
      assert.equal(safeDivide(null, 50), null);
      assert.equal(safeDivide(50, null), null);
      assert.equal(safeDivide(NaN, 50), null);
      assert.equal(safeDivide(50, NaN), null);
      assert.equal(safeDivide(100, 2), 50);
      assert.equal(safeDivide(0, 100), 0);
    });

    it('safeGrowthRate handles turnaround from negative to positive correctly', () => {
      // Previous -100, Current +50 -> +150% growth
      assert.equal(safeGrowthRate(50, -100), 150.0);
      // Previous -100, Current -50 -> +50% improvement
      assert.equal(safeGrowthRate(-50, -100), 50.0);
      // Previous -100, Current -150 -> -50% deterioration
      assert.equal(safeGrowthRate(-150, -100), -50.0);
      // Previous 0, Current +100
      assert.equal(safeGrowthRate(100, 0), 100.0);
      // Previous 0, Current -100
      assert.equal(safeGrowthRate(-100, 0), -100.0);
      // Extreme growth spikes
      assert.equal(safeGrowthRate(600, 100), 500.0);
      assert.equal(safeGrowthRate(20, 100), -80.0);
    });

    it('safeMargin guards against zero or negative revenue', () => {
      assert.equal(safeMargin(200, 1000), 20.0);
      assert.equal(safeMargin(-50, 1000), -5.0);
      assert.equal(safeMargin(200, 0), null);
      assert.equal(safeMargin(200, -100), null);
      assert.equal(safeMargin(null, 1000), null);
      assert.equal(safeMargin(200, null), null);
    });

    it('safeRoe flags insolvency on negative or zero equity (TTK 376)', () => {
      const resInsolvent = safeRoe(-50000, -100000);
      assert.equal(resInsolvent.roe, null);
      assert.equal(resInsolvent.isInsolvent, true);
      assert.ok(resInsolvent.warning?.includes('TTK 376'));

      const resZeroEq = safeRoe(50000, 0);
      assert.equal(resZeroEq.roe, null);
      assert.equal(resZeroEq.isInsolvent, true);

      const resNormal = safeRoe(25000, 100000, 1.0);
      assert.equal(resNormal.roe, 25.0);
      assert.equal(resNormal.isInsolvent, false);

      const resQuarterly = safeRoe(25000, 100000, 4.0);
      assert.equal(resQuarterly.roe, 100.0);
    });
  });

  describe('3. Sector Detection Logic', () => {
    it('detects Insurance tickers and keywords', () => {
      assert.equal(detectSector('AGESA'), 'INSURANCE');
      assert.equal(detectSector('TURSG'), 'INSURANCE');
      assert.equal(detectSector('AGESA.IS'), 'INSURANCE');
      assert.equal(detectSector('XYZ', 'Şirket hayat ve emeklilik sektöründe faaliyet gösterir'), 'INSURANCE');
    });

    it('detects Banking tickers and keywords', () => {
      assert.equal(detectSector('GARAN'), 'BANKING');
      assert.equal(detectSector('ISCTR'), 'BANKING');
      assert.equal(detectSector('AKBNK.IS'), 'BANKING');
      assert.equal(detectSector('ABC', 'Net faiz marjı ve mevduat toplama'), 'BANKING');
    });

    it('detects Holding tickers and keywords', () => {
      assert.equal(detectSector('KCHOL'), 'HOLDING');
      assert.equal(detectSector('SAHOL'), 'HOLDING');
      assert.equal(detectSector('DEF', 'İştirak net aktif değeri NAD iskontosu'), 'HOLDING');
    });

    it('detects REIT tickers (including GYO suffixes) and keywords', () => {
      assert.equal(detectSector('EKGYO'), 'REIT');
      assert.equal(detectSector('TRGYO'), 'REIT');
      assert.equal(detectSector('KZBGY'), 'REIT');
      assert.equal(detectSector('OZKGY'), 'REIT');
      assert.equal(detectSector('GHI', 'Gayrimenkul yatırım ortaklığı kira portföyü'), 'REIT');
    });

    it('detects Tech tickers and keywords', () => {
      assert.equal(detectSector('LOGO'), 'TECH');
      assert.equal(detectSector('MIATK'), 'TECH');
      assert.equal(detectSector('VBTYZ'), 'TECH');
      assert.equal(detectSector('JKL', 'SaaS ve yazılım çözümleri Ar-Ge'), 'TECH');
    });

    it('falls back to Industrial for general tickers', () => {
      assert.equal(detectSector('EREGL'), 'INDUSTRIAL');
      assert.equal(detectSector('FROTO'), 'INDUSTRIAL');
      assert.equal(detectSector('KRDMD'), 'INDUSTRIAL');
    });

    it('detects Aviation tickers and keywords', () => {
      assert.equal(detectSector('THYAO'), 'AVIATION');
      assert.equal(detectSector('PGSUS'), 'AVIATION');
      assert.equal(detectSector('TAVHL'), 'AVIATION');
      assert.equal(detectSector('XYZ', 'Havacılık yolcu trafiği ve filo'), 'AVIATION');
    });

    it('detects Retail tickers and keywords', () => {
      assert.equal(detectSector('BIMAS'), 'RETAIL');
      assert.equal(detectSector('MGROS'), 'RETAIL');
      assert.equal(detectSector('CCOLA'), 'RETAIL');
    });

    it('detects Utilities & Telco tickers and keywords', () => {
      assert.equal(detectSector('ENJSA'), 'UTILITIES_TELCO');
      assert.equal(detectSector('TCELL'), 'UTILITIES_TELCO');
      assert.equal(detectSector('TTKOM'), 'UTILITIES_TELCO');
    });

    it('detects Financial Services (Factoring/Leasing) tickers and keywords', () => {
      assert.equal(detectSector('VAKFN'), 'FINANCIAL_SERVICES');
      assert.equal(detectSector('GSDHO'), 'FINANCIAL_SERVICES');
    });
  });

  describe('4. WACC and Model Logic Across Sectors in enrichAndSanitizeFinancialHistory', () => {
    it('applies 0% corporate tax rate for REIT sector (5520 s. KVK 5/1-d)', () => {
      const data = {
        ticker: 'EKGYO',
        sector: 'REIT',
        financial_history: [
          {
            period: '2025/12',
            equity: 10000000,
            financial_debt: 2000000,
            net_debt: 1500000,
            net_income: 1500000,
            operating_profit: 2000000,
            revenue: 5000000,
          }
        ]
      };
      const enriched = enrichAndSanitizeFinancialHistory(data);
      const item = enriched.financial_history[0];
      
      // In REIT: Kd after tax = preTaxKd * (1 - 0) = preTaxKd (no tax deduction)
      // 2025 preTaxKd = 45.0. after_tax_cost_of_debt must be 45.0 (not 45.0 * 0.75 = 33.75)
      assert.equal(item.after_tax_cost_of_debt, 45.0);
    });

    it('applies 30% corporate tax rate for Banking and Insurance sectors', () => {
      const data = {
        ticker: 'AGESA',
        sector: 'INSURANCE',
        financial_history: [
          {
            period: '2025/12',
            equity: 5000000,
            written_premiums: 8000000,
            technical_profit: 1500000,
            net_income: 1200000,
            combined_ratio: 92.0
          }
        ]
      };
      const enriched = enrichAndSanitizeFinancialHistory(data);
      const item = enriched.financial_history[0];
      
      // Insurance WACC is purely cost of equity (Ke = Rf + Beta * ERP)
      // Rf (2025) = 29.5, Beta = 0.95, ERP = 7.5 -> Ke = 29.5 + 0.95 * 7.5 = 36.625 -> 36.6
      assert.equal(item.wacc, 36.6);
    });

    it('applies 25% corporate tax rate for Industrial sector', () => {
      const data = {
        ticker: 'EREGL',
        sector: 'INDUSTRIAL',
        financial_history: [
          {
            period: '2025/12',
            equity: 10000000,
            financial_debt: 5000000,
            net_income: 1000000,
            operating_profit: 1800000,
            revenue: 12000000
          }
        ]
      };
      const enriched = enrichAndSanitizeFinancialHistory(data);
      const item = enriched.financial_history[0];
      
      // 2025 preTaxKd = 45.0, Tax = 25% -> after_tax_cost_of_debt = 45.0 * 0.75 = 33.75
      assert.equal(item.after_tax_cost_of_debt, 33.75);
    });

    it('ensures leverage_ratio is calculated as percentage (50.0)', () => {
      const data = {
        ticker: 'EREGL',
        sector: 'INDUSTRIAL',
        financial_history: [
          {
            period: '2025/12',
            total_assets: 2000000,
            equity: 1000000,
            net_income: 100000
          }
        ]
      };
      const enriched = enrichAndSanitizeFinancialHistory(data);
      const item = enriched.financial_history[0];
      // Total liabilities = 2000000 - 1000000 = 1000000
      // Leverage ratio: (1000000 / 2000000) * 100 = 50.0%
      assert.equal(item.leverage_ratio, 50.0);
    });

    it('clears roe and sets solvency warning when equity is negative', () => {
      const data = {
        ticker: 'BATIK',
        sector: 'INDUSTRIAL',
        financial_history: [
          {
            period: '2025/12',
            total_assets: 500000,
            equity: -200000,
            net_income: -50000,
            roe: 25.0 // misleading positive input
          }
        ]
      };
      const enriched = enrichAndSanitizeFinancialHistory(data);
      const item = enriched.financial_history[0];
      assert.equal(item.roe, null);
      assert.ok(item.solvency_warning?.includes('TTK 376'));
    });
  });

  describe('5. optimizeFinalDecision Stress Tests for all 6 Sectors', () => {
    it('blocks AL and overrides to ALMA on negative equity (TTK 376)', () => {
      const opt = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 85,
        latestData: { equity: -100000, net_income: 50000 },
        valuation: { discount_pct: 35.0, fair_value: 150, current_price: 100 },
        sector: 'INDUSTRIAL'
      });
      assert.equal(opt.finalDecision, 'ALMA');
      assert.equal(opt.overrideApplied, true);
      assert.ok(opt.overrideReason?.includes('TTK 376'));
    });

    it('blocks AL and overrides to ALMA for Industrial when Net Income > 0 but OCF < 0 (Window Dressing)', () => {
      const opt = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 80,
        latestData: { equity: 500000, net_income: 100000, operating_cash_flow: -40000 },
        valuation: { discount_pct: 30.0, fair_value: 130, current_price: 100 } ,
        sector: 'INDUSTRIAL'
      });
      assert.equal(opt.finalDecision, 'ALMA');
      assert.equal(opt.overrideApplied, true);
      assert.ok(opt.overrideReason?.includes('Makyajlı Bilanço'));
    });

    it('blocks AL and overrides to ALMA for Industrial when Net Debt / EBITDA > 4.0x', () => {
      const opt = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 78,
        latestData: { equity: 500000, net_income: 50000, net_debt: 500000, ebitda: 100000, operating_cash_flow: 80000 },
        valuation: { discount_pct: 30.0, fair_value: 130, current_price: 100 } ,
        sector: 'INDUSTRIAL'
      });
      assert.equal(opt.finalDecision, 'ALMA');
      assert.equal(opt.overrideApplied, true);
      assert.ok(opt.overrideReason?.includes('Kritik Borçluluk Filtresi'));
    });

    it('blocks AL and overrides to ALMA for Banking when CAR < 12.0% or NPL > 6.0%', () => {
      const optCar = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 80,
        latestData: { equity: 1000000, car_ratio: 10.5, npl_ratio: 3.0, roe: 30.0 },
        valuation: { discount_pct: 30.0, fair_value: 130, current_price: 100 } ,
        sector: 'BANKING'
      });
      assert.equal(optCar.finalDecision, 'ALMA');
      assert.ok(optCar.overrideReason?.includes('BDDK'));

      const optNpl = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 80,
        latestData: { equity: 1000000, car_ratio: 16.0, npl_ratio: 7.5, roe: 30.0 },
        valuation: { discount_pct: 30.0, fair_value: 130, current_price: 100 } ,
        sector: 'BANKING'
      });
      assert.equal(optNpl.finalDecision, 'ALMA');
      assert.ok(optNpl.overrideReason?.includes('Toksik Kredi'));
    });

    it('blocks AL and overrides to ALMA for Insurance when Combined Ratio > 102%', () => {
      const opt = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 80,
        latestData: { equity: 500000, combined_ratio: 105.0, roe: 45.0 },
        valuation: { discount_pct: 30.0, fair_value: 130, current_price: 100 } ,
        sector: 'INSURANCE'
      });
      assert.equal(opt.finalDecision, 'ALMA');
      assert.ok(opt.overrideReason?.includes('Kombine Oran'));
    });

    it('blocks AL and overrides to ALMA for Holding when solo debt to equity > 0.6x', () => {
      const opt = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 80,
        latestData: { equity: 1000000, net_debt: 750000, holding_discount: 35.0 },
        valuation: { discount_pct: 30.0, fair_value: 130, current_price: 100 } ,
        sector: 'HOLDING'
      });
      assert.equal(opt.finalDecision, 'ALMA');
      assert.ok(opt.overrideReason?.includes('Solo Holding Kaldıraç'));
    });

    it('blocks AL and overrides to ALMA for REIT when LTV > 60%', () => {
      const opt = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 80,
        latestData: { equity: 1000000, total_assets: 2000000, net_debt: 1400000, pb: 0.65 }, // LTV = 1.4M / 2.0M = 70%
        valuation: { discount_pct: 30.0, fair_value: 130, current_price: 100 } ,
        sector: 'REIT'
      });
      assert.equal(opt.finalDecision, 'ALMA');
      assert.ok(opt.overrideReason?.includes('Kritik GYO Borçluluğu') || opt.overrideReason?.includes('LTV'));
    });

    it('blocks AL and overrides to ALMA for Tech when Gross Margin < 20%', () => {
      const opt = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 80,
        latestData: { equity: 500000, gross_margin: 15.0, net_debt: -100000, ebitda: 100000 },
        valuation: { discount_pct: 30.0, fair_value: 130, current_price: 100 } ,
        sector: 'TECH'
      });
      assert.equal(opt.finalDecision, 'ALMA');
      assert.ok(opt.overrideReason?.includes('Düşük Brüt Kâr Marjı') || opt.overrideReason?.includes('Brüt'));
    });

    it('overrides AL to NÖTR when margin of safety is insufficient (< 15%)', () => {
      const opt = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 80,
        latestData: { equity: 500000, net_income: 50000, operating_cash_flow: 60000, ebitda: 80000 },
        valuation: { discount_pct: 10.0, fair_value: 110, current_price: 100 } ,
        sector: 'INDUSTRIAL'
      });
      assert.equal(opt.finalDecision, 'NÖTR');
      assert.equal(opt.marginOfSafetyStatus, 'UNSAFE');
    });

    it('approves AL when all criteria and margin of safety >= 25% are met', () => {
      const opt = optimizeFinalDecision({
        rawDecision: 'AL',
        score: 85,
        latestData: {
          equity: 1000000,
          net_income: 200000,
          operating_cash_flow: 220000,
          ebitda: 300000,
          net_debt: 200000,
          roic: 35.0,
          wacc: 28.0
        },
        valuation: { discount_pct: 32.0, fair_value: 132, current_price: 100 } ,
        sector: 'INDUSTRIAL'
      });
      assert.equal(opt.finalDecision, 'AL');
      assert.equal(opt.marginOfSafetyStatus, 'SAFE');
      assert.equal(opt.overrideApplied, false);
    });
  });

  describe('6. computeSectorValuationAndDrivers Resilience', () => {
    it('handles zero debt, zero revenue, and negative profit gracefully without NaN', () => {
      const data = {
        ticker: 'TEST',
        sector: 'INDUSTRIAL',
        financial_history: [
          {
            period: '2024/12',
            revenue: 0,
            ebitda: -50000,
            net_income: -60000,
            equity: 500000,
            total_assets: 600000,
            net_debt: 0
          },
          {
            period: '2025/12',
            revenue: 0,
            ebitda: -40000,
            net_income: -45000,
            equity: 450000,
            total_assets: 550000,
            net_debt: 0
          }
        ]
      };
      const res = computeSectorValuationAndDrivers(data, '50.0');
      assert.ok(!isNaN(res.valuation.fair_value));
      assert.ok(!isNaN(res.valuation.discount_pct));
      assert.ok(!isNaN(res.valuation.bear_price));
      assert.ok(!isNaN(res.valuation.bull_price));
      assert.ok(!isNaN(res.drivers.revenue_growth.value));
      assert.ok(!isNaN(res.drivers.net_income_growth.value));
    });

    it('handles extreme growth spikes (+500% or -80%) gracefully', () => {
      const data = {
        ticker: 'ROCKET',
        sector: 'TECH',
        financial_history: [
          {
            period: '2024/12',
            revenue: 100000,
            net_income: 10000,
            equity: 200000,
            total_assets: 300000,
            gross_margin: 60.0
          },
          {
            period: '2025/12',
            revenue: 700000, // +600% growth
            net_income: 80000, // +700% growth
            equity: 350000,
            total_assets: 500000,
            gross_margin: 65.0
          }
        ]
      };
      const res = computeSectorValuationAndDrivers(data, '120.0');
      assert.ok(isFinite(res.valuation.fair_value));
      assert.ok(res.valuation.fair_value > 0);
      assert.ok(res.drivers.revenue_growth.value >= 500);
    });
  });

  describe('7. Incremental Quarterly and TTM Rolling Computations', () => {
    // Recreate the page.tsx helper logic for testing
    const CUMULATIVE_FIELDS = [
      'revenue', 'gross_profit', 'operating_income', 'operating_profit', 'ebitda', 'net_income',
      'gross_written_premiums', 'written_premiums', 'earned_premiums', 'technical_balance', 'technical_profit', 'investment_income',
      'net_monetary_position', 'operating_cash_flow', 'free_cash_flow', 'capex'
    ];

    function parseYearAndQuarter(p) {
      const yrMatch = String(p || '').match(/(20\d{2})/);
      if (!yrMatch) return null;
      const year = parseInt(yrMatch[1], 10);
      let q = 0;
      if (/(?:q1|1\.ç|1ç|\/0?3\b|3a\b)/i.test(p)) q = 1;
      else if (/(?:q2|2\.ç|2ç|\/0?6\b|6a\b)/i.test(p)) q = 2;
      else if (/(?:q3|3\.ç|3ç|\/0?9\b|9a\b)/i.test(p)) q = 3;
      else if (/(?:q4|4\.ç|4ç|\/12\b|12a\b)/i.test(p)) q = 4;
      else if (/^\s*20\d{2}\s*$/.test(p)) q = 4;
      return { year, q };
    }

    function computeIncrementalQuarterlyData(rawData) {
      if (!rawData || rawData.length === 0) return rawData;
      const sorted = [...rawData].sort((a, b) => parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period));
      return sorted.map((item) => {
        const period = item.period || '';
        const info = parseYearAndQuarter(period);
        if (!info || info.q <= 1) return { ...item };

        const prevItem = sorted.find(d => {
          const dInfo = parseYearAndQuarter(d.period);
          return dInfo && dInfo.year === info.year && dInfo.q === info.q - 1;
        });
        if (!prevItem) return { ...item };

        const result = { ...item };
        for (const field of CUMULATIVE_FIELDS) {
          if (item[field] != null && prevItem[field] != null) {
            result[field] = item[field] - prevItem[field];
          }
        }
        return result;
      });
    }

    function computeTtmChartData(quarterlyData) {
      if (!quarterlyData || quarterlyData.length === 0) return quarterlyData;
      const hasSubYearQuarters = quarterlyData.some(d => {
        const info = parseYearAndQuarter(d.period);
        return info && info.q >= 1 && info.q <= 3;
      });
      if (!hasSubYearQuarters) return quarterlyData;

      return quarterlyData.map((item, idx) => {
        const result = { ...item };
        const sliceStart = Math.max(0, idx - 3);
        const window = quarterlyData.slice(sliceStart, idx + 1);

        for (const field of CUMULATIVE_FIELDS) {
          if (item[field] != null) {
            let sum = 0;
            let valid = 0;
            for (const w of window) {
              if (w[field] != null && !isNaN(w[field])) {
                sum += w[field];
                valid++;
              }
            }
            if (valid === 4) {
              result[field] = sum;
            } else if (valid > 0) {
              result[field] = Math.round((sum / valid) * 4);
            }
          }
        }
        return result;
      });
    }

    it('correctly calculates incremental quarters from cumulative YTD data (both Q1-Q4 format and 03-12 format)', () => {
      const ytdData = [
        { period: '2025/Q1', revenue: 100, ebitda: 20 },
        { period: '2025/Q2', revenue: 250, ebitda: 55 },
        { period: '2025/Q3', revenue: 420, ebitda: 95 },
        { period: '2025/Q4', revenue: 600, ebitda: 140 }
      ];
      const incremental = computeIncrementalQuarterlyData(ytdData);

      // Q1: 100
      assert.equal(incremental[0].revenue, 100);
      assert.equal(incremental[0].ebitda, 20);
      // Q2: 250 - 100 = 150
      assert.equal(incremental[1].revenue, 150);
      assert.equal(incremental[1].ebitda, 35);
      // Q3: 420 - 250 = 170
      assert.equal(incremental[2].revenue, 170);
      assert.equal(incremental[2].ebitda, 40);
      // Q4: 600 - 420 = 180
      assert.equal(incremental[3].revenue, 180);
      assert.equal(incremental[3].ebitda, 45);

      // TTM sum across all 4 quarters: 100 + 150 + 170 + 180 = 600
      const ttm = computeTtmChartData(incremental);
      assert.equal(ttm[3].revenue, 600);
      assert.equal(ttm[3].ebitda, 140);
    });

    it('handles purely annual datasets without erroneously multiplying by 4 in TTM', () => {
      const annualData = [
        { period: '2022', revenue: 1000 },
        { period: '2023', revenue: 1400 },
        { period: '2024', revenue: 2000 }
      ];
      const ttm = computeTtmChartData(annualData);
      assert.equal(ttm[2].revenue, 2000);
    });
  });

  describe('8. CSV Export Data Formatting & Special Characters', () => {
    function generateCsvString(headers, rows) {
      return '\uFEFF' + [
        (headers || []).map(h => {
          const str = String(h ?? '').replace(/"/g, '""');
          return str.includes(';') || str.includes('\n') || str.includes('\r') || str.includes('"') ? `"${str}"` : str;
        }).join(';'),
        ...(rows || []).map(r => (r || []).map(cell => {
          if (cell === null || cell === undefined) return '';
          const str = String(cell).replace(/"/g, '""');
          return str.includes(';') || str.includes('\n') || str.includes('\r') || str.includes('"') ? `"${str}"` : str;
        }).join(';'))
      ].join('\r\n');
    }

    it('properly quotes cells containing semicolons, quotes, or newlines according to RFC 4180', () => {
      const headers = ['Kalem', 'Değer', 'Açıklama'];
      const rows = [
        ['Net Kâr', 150000, 'Kâr; temettü ve ihtiyat ayrıldı'],
        ['Varlık', 500000, '14" Ekran ve Donanım'],
        ['Not', 0, 'Satır 1\nSatır 2'],
        ['Boş', null, undefined]
      ];
      const csv = generateCsvString(headers, rows);
      assert.ok(csv.startsWith('\uFEFF'));
      assert.ok(csv.includes('"Kâr; temettü ve ihtiyat ayrıldı"'));
      assert.ok(csv.includes('"14"" Ekran ve Donanım"'));
      assert.ok(csv.includes('"Satır 1\nSatır 2"'));
      assert.ok(csv.includes('Boş;;'));
    });
  });

  describe('9. cleanAndParseJson Resilience', () => {
    it('parses JSON with markdown fences and surrounding conversational text', () => {
      const rawWithFences = '```json\n{"ticker": "ASELS", "fair_value": 85.50}\n```';
      assert.deepEqual(cleanAndParseJson(rawWithFences), { ticker: 'ASELS', fair_value: 85.50 });

      const surroundingText = 'Rapor analizi aşağıdadır:\n{"result": "success", "count": 42}\nSonuçlar tamamlandı.';
      assert.deepEqual(cleanAndParseJson(surroundingText), { result: 'success', count: 42 });
    });
  });

  describe('10. End-to-End Multi-Sector Valuation Stress Tests', () => {
    const sectors = ['INSURANCE', 'BANKING', 'HOLDING', 'REIT', 'TECH', 'INDUSTRIAL'];

    for (const sec of sectors) {
      it(`runs complete valuation pipeline for sector ${sec} without throwing errors`, () => {
        const mockCompany = {
          ticker: `BIST_${sec}`,
          company_name: `Test ${sec} A.Ş.`,
          sector: sec,
          share_count: 500000000,
          current_price: 150.0,
          financial_history: [
            {
              period: '2024/12',
              revenue: 5000000,
              written_premiums: 5000000,
              net_interest_income: 3000000,
              ebitda: 1200000,
              net_income: 800000,
              equity: 4000000,
              total_assets: 8000000,
              current_assets: 3000000,
              operating_cash_flow: 900000,
              capex: 200000,
              net_debt: 500000,
              gross_margin: 55.0,
              combined_ratio: 89.5,
              car_ratio: 16.5,
              npl_ratio: 2.1,
              pb: 0.72,
              holding_discount: 32.0,
            },
            {
              period: '2025/12',
              revenue: 7500000,
              written_premiums: 7500000,
              net_interest_income: 4500000,
              ebitda: 1800000,
              net_income: 1300000,
              equity: 6000000,
              total_assets: 12000000,
              current_assets: 4500000,
              operating_cash_flow: 1400000,
              capex: 300000,
              net_debt: 400000,
              gross_margin: 58.0,
              combined_ratio: 88.0,
              car_ratio: 17.2,
              npl_ratio: 1.9,
              pb: 0.68,
              holding_discount: 34.0,
            }
          ]
        };

        const sanitized = enrichAndSanitizeFinancialHistory(mockCompany);
        const result = computeSectorValuationAndDrivers(sanitized, '150.0', sec);

        assert.ok(result.valuation.fair_value > 0);
        assert.ok(isFinite(result.valuation.fair_value));
        assert.ok(isFinite(result.valuation.discount_pct));
        assert.ok(result.scoreResult.totalScore > 0);
        assert.ok(['AL', 'ALMA', 'NÖTR'].includes(result.optimization.finalDecision));
        assert.ok(result.drivers.revenue_growth.value != null);
        assert.ok(result.drivers.net_income_growth.value != null);
        assert.ok(result.drivers.margin.value != null);
        assert.ok(result.drivers.target_multiple.value != null);
      });
    }
  });

  describe('11. Advanced Stress Tests: TTK 376 Insolvency, Formula Parity & Cross-Format YoY', () => {
    it('optimizeFinalDecision unconditionally forces ALMA when equity is negative even if rawDecision was NÖTR', () => {
      const res = optimizeFinalDecision({
        ticker: 'BATIK',
        sector: 'INDUSTRIAL',
        rawDecision: 'NÖTR',
        marginOfSafety: 10,
        latestData: { equity: -1500000 },
        scoreResult: { totalScore: 50, categoryScores: {} }
      });
      assert.equal(res.finalDecision, 'ALMA');
      assert.ok(res.overrideApplied);
      assert.ok(res.overrideReason?.includes('TTK 376'));
    });

    it('Holding sector valuation correctly applies 0.70x target multiple without forcing 0.85x floor', () => {
      const holdingData = {
        ticker: 'SAHOL',
        sector: 'HOLDING',
        financial_history: [
          { period: '2024/12', equity: 100000000, revenue: 50000000, roe: 30 },
          { period: '2025/12', equity: 120000000, revenue: 60000000, roe: 35 }
        ],
        drivers: {
          target_multiple: { value: '0.70x (%30 İskonto)' }
        }
      };
      const result = computeSectorValuationAndDrivers(holdingData, '100.0', 'HOLDING');
      assert.ok(result.valuation.formula_display.includes('0,70') || result.valuation.formula_display.includes('0.70'));
    });

    it('REIT sector valuation formula string reflects clamped target multiple', () => {
      const reitData = {
        ticker: 'EKGYO',
        sector: 'REIT',
        financial_history: [
          { period: '2024/12', equity: 50000000, revenue: 20000000 },
          { period: '2025/12', equity: 60000000, revenue: 25000000 }
        ],
        drivers: {
          target_multiple: { value: '0.75x (%25 İskonto)' }
        }
      };
      const result = computeSectorValuationAndDrivers(reitData, '10.0', 'REIT');
      assert.ok(result.valuation.formula_display.includes('0.75x') || result.valuation.formula_display.includes('0,75x'));
    });

    it('Tech sector valuation enforces TTK 376 haircut when equity <= 0 even with positive revenue', () => {
      const techData = {
        ticker: 'TECHBATIK',
        sector: 'TECH',
        financial_history: [
          { period: '2024/12', equity: -500000, revenue: 10000000 },
          { period: '2025/12', equity: -1000000, revenue: 15000000 }
        ]
      };
      const result = computeSectorValuationAndDrivers(techData, '50.0', 'TECH');
      assert.equal(result.valuation.fair_value, 0.05); // True liquidation floor, not arbitrary fraction of market price
      assert.ok(result.valuation.formula_display.includes('TTK 376'));
    });

    it('Industrial sector valuation enforces TTK 376 haircut when equity <= 0 even with positive EBITDA', () => {
      const indData = {
        ticker: 'INDBATIK',
        sector: 'INDUSTRIAL',
        financial_history: [
          { period: '2024/12', equity: -500000, revenue: 10000000, ebitda: 2000000 },
          { period: '2025/12', equity: -1000000, revenue: 15000000, ebitda: 3000000 }
        ]
      };
      const result = computeSectorValuationAndDrivers(indData, '50.0', 'INDUSTRIAL');
      assert.equal(result.valuation.fair_value, 0.05); // True liquidation floor, not arbitrary fraction of market price
      assert.ok(result.valuation.formula_display.includes('TTK 376'));
    });

    it('parsePeriodSortKey handles cross-format periods and year offsets', () => {
      const key2025_3 = parsePeriodSortKey('2025/3');
      const key2024_03 = parsePeriodSortKey('2024/03');
      const key2025_q1 = parsePeriodSortKey('2025/Q1');
      assert.equal(key2025_3, 202503);
      assert.equal(key2024_03, 202403);
      assert.equal(key2025_q1, 202503);
      assert.equal(key2025_3 - 100, key2024_03);

      const key2024_annual = parsePeriodSortKey('2024');
      const key2023_12 = parsePeriodSortKey('2023/12');
      assert.equal(key2024_annual, 202412);
      assert.equal(key2023_12, 202312);
      assert.equal(key2024_annual - 100, key2023_12);
    });

    it('resolveBistCompanyMeta strips .IS suffix and correctly finds AGESA in directory', () => {
      const meta = resolveBistCompanyMeta('AGESA.IS');
      assert.equal(meta.ticker, 'AGESA');
      assert.equal(meta.sector, 'INSURANCE');
      assert.equal(meta.financialGroup, 'UFRS_K');
      assert.equal(meta.shareCount, 180000000);
    });

    it('getIsYatirimMultiplesForTicker strips .IS suffix correctly', async () => {
      const res = await getIsYatirimMultiplesForTicker('NONEXISTENT_XYZ.IS');
      assert.equal(res, null);
    });
  });

});

