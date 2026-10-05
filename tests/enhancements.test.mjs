import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateEarningsQuality,
  calculateDuPont5Step,
  calculateFxSensitivity,
  calculateConsensusComparison,
  calculateCompanyMultiples,
  SECTOR_MULTIPLE_BENCHMARKS,
  enrichAndSanitizeFinancialHistory
} from '../lib/valuation.ts';

describe('Enhancements Test Suite (Items 1, 2, 3, 5, 6)', () => {

  describe('Item 1: Earnings Quality & Cash Conversion Audit (calculateEarningsQuality)', () => {
    it('detects Sloan High Accrual Warning when Sloan Ratio > +0.10', () => {
      // Net Profit: 250, OCF: 50, Total Assets: 1000 => Sloan = (250 - 50) / 1000 = 0.20 (+20%)
      const result = calculateEarningsQuality({
        net_income: 250,
        operating_cash_flow: 50,
        total_assets: 1000
      });

      assert.equal(result.hasData, true);
      assert.equal(result.sloanAccrualRatio, 0.2);
      assert.match(result.sloanAssessment, /Yüksek Tahakkuk Uyarısı/);
      assert.match(result.sloanAssessment, /Bilanço Makyajı/);
    });

    it('identifies Excellent Cash Quality when conversion ratio >= 1.0', () => {
      // Net Profit: 100, OCF: 130, Total Assets: 2000 => conversion = 130.0%, Sloan = -0.015
      const result = calculateEarningsQuality({
        net_income: 100,
        operating_cash_flow: 130,
        total_assets: 2000
      });

      assert.equal(result.hasData, true);
      assert.equal(result.cashConversionRatio, 130.0);
      assert.equal(result.status, 'EXCELLENT');
      assert.match(result.statusTitle, /Mükemmel Nakit Kalitesi/);
      assert.match(result.guidanceText, /Sıcak Nakde Dönüşüyor/i);
    });

    it('identifies Reasonable Cash Quality when conversion ratio is between 0.70 and 1.0', () => {
      // Net Profit: 100, OCF: 80, Total Assets: 2000 => conversion = 80.0%, Sloan = 0.01
      const result = calculateEarningsQuality({
        net_income: 100,
        operating_cash_flow: 80,
        total_assets: 2000
      });

      assert.equal(result.hasData, true);
      assert.equal(result.cashConversionRatio, 80.0);
      assert.equal(result.status, 'MODERATE');
      assert.match(result.statusTitle, /Makul Nakit Kalitesi/);
    });

    it('identifies Weak Cash Conversion when conversion ratio is between 0 and 0.70', () => {
      // Net Profit: 100, OCF: 40, Total Assets: 10000 => conversion = 40.0%, Sloan = 0.006
      const result = calculateEarningsQuality({
        net_income: 100,
        operating_cash_flow: 40,
        total_assets: 10000
      });

      assert.equal(result.hasData, true);
      assert.equal(result.cashConversionRatio, 40.0);
      assert.equal(result.status, 'CRITICAL_RISK');
      assert.match(result.statusTitle, /Zayıf Nakit Dönüşümü/);
      assert.match(result.guidanceText, /Kağıt üzerinde kalıyor/i);
    });

    it('identifies Critical Cash Risk when OCF <= 0 while Net Income > 0', () => {
      // Net Profit: 100, OCF: -30, Total Assets: 1000 => conversion = -30.0%, Sloan = 0.13
      const result = calculateEarningsQuality({
        net_income: 100,
        operating_cash_flow: -30,
        total_assets: 1000
      });

      assert.equal(result.hasData, true);
      assert.equal(result.status, 'CRITICAL_RISK');
      assert.match(result.statusTitle, /Kritik Nakit Riski/);
      assert.match(result.guidanceText, /Nakit Yakılıyor/i);
    });

    it('handles Double Negative case when both OCF < 0 and Net Income < 0', () => {
      const result = calculateEarningsQuality({
        net_income: -50,
        operating_cash_flow: -80,
        total_assets: 1000
      });

      assert.equal(result.hasData, true);
      assert.equal(result.status, 'DOUBLE_NEGATIVE');
      assert.match(result.statusTitle, /Zarar ve Negatif Nakit Akışı/);
      assert.match(result.guidanceText, /hem muhasebe zararı yazmakta hem de faaliyetlerinden nakit yakmaktadır/);
    });

    it('handles missing or zero data gracefully', () => {
      const result = calculateEarningsQuality(null);
      assert.equal(result.hasData, false);
      assert.equal(result.status, 'INSUFFICIENT_DATA');
      assert.equal(result.cashConversionRatio, null);
    });
  });

  describe('Item 2: Company-Specific Live Effective Kd & WACC Blending', () => {
    it('calculates effective borrowing rate Kd from financial statements and blends with macro rate', () => {
      const history = [
        {
          period: '2023/12',
          revenue: 5000,
          net_income: 500,
          interest_expenses: 200,
          short_term_financial_debt: 600,
          long_term_financial_debt: 400
        },
        {
          period: '2024/12',
          revenue: 6000,
          net_income: 600,
          interest_expenses: 400,
          short_term_financial_debt: 500,
          long_term_financial_debt: 500
        }
      ];

      const sanitized = enrichAndSanitizeFinancialHistory(history, 'sanayi');
      const latest = sanitized[sanitized.length - 1];

      assert.ok(latest.effective_kd !== undefined, 'effective_kd should be defined');
      assert.match(latest.kd_source, /Şirket Finansal Giderlerinden Dinamik Türetildi/);
      // For 2024/12: interest = 400, avg debt = 1000 => rawKd = 40.0%.
      // preTaxKd benchmark for 2024 is 50.0%.
      // blended = 0.70 * 40 + 0.30 * 50 = 43.0%.
      assert.equal(latest.effective_kd, 43.0);
      assert.equal(latest.company_specific_kd, 40);
    });

    it('falls back to macro rate when financial debt is zero or interest expense is missing', () => {
      const history = [
        {
          period: '2024/12',
          revenue: 5000,
          net_income: 500
        }
      ];

      const sanitized = enrichAndSanitizeFinancialHistory(history, 'sanayi');
      const latest = sanitized[sanitized.length - 1];

      assert.match(latest.kd_source, /BIST Sektörel \/ Makro/);
      assert.equal(latest.effective_kd, 50.0);
    });
  });

  describe('Item 3A: DuPont 5-Step Profitability Decomposition (calculateDuPont5Step)', () => {
    it('correctly calculates all 5 steps and matches mathematical ROE', () => {
      // Net Income: 140, EBT: 200, EBIT: 250, Revenue: 2000, Total Assets: 1000, Equity: 400
      // 1. Tax Burden = 140 / 200 = 0.70
      // 2. Interest Burden = 200 / 250 = 0.80
      // 3. EBIT Margin = 250 / 2000 = 0.125 (12.5%)
      // 4. Asset Turnover = 2000 / 1000 = 2.0x
      // 5. Financial Leverage = 1000 / 400 = 2.5x
      // Product = 0.70 * 0.80 * 0.125 * 2.0 * 2.5 = 0.35 (35.0% ROE)
      // Direct ROE = 140 / 400 = 35.0%
      const item = {
        net_income: 140,
        ebt: 200,
        ebit: 250,
        revenue: 2000,
        total_assets: 1000,
        equity: 400
      };

      const dupont = calculateDuPont5Step(item);
      assert.equal(dupont.hasData, true);
      assert.equal(dupont.taxBurden, 0.7);
      assert.equal(dupont.interestBurden, 0.8);
      assert.equal(dupont.ebitMargin, 12.5);
      assert.equal(dupont.assetTurnover, 2.0);
      assert.equal(dupont.financialLeverage, 2.5);
      assert.equal(dupont.calculatedRoe, 35.0);
      assert.match(dupont.driverSummary, /varlık devir hızı|dengeli/);
    });

    it('falls back to operating_income or gross_profit when ebit is missing', () => {
      const item = {
        net_income: 100,
        ebt: 120,
        operating_income: 150,
        revenue: 1000,
        total_assets: 800,
        equity: 400
      };

      const dupont = calculateDuPont5Step(item);
      assert.equal(dupont.hasData, true);
      assert.ok(dupont.ebitMargin > 0);
    });
  });

  describe('Item 3B: FX Sensitivity Analysis (calculateFxSensitivity)', () => {
    it('calculates shock matrix for long foreign exchange position', () => {
      const item = {
        fx_assets: 1500,
        fx_liabilities: 500,
        net_income: 200,
        ebt: 250
      };

      const fx = calculateFxSensitivity(item);
      assert.equal(fx.netFxPosition, 1000);
      assert.equal(fx.positionType, 'LONG');
      assert.equal(fx.matrix.length, 5);

      // +10% shock on +1000 net FX = +100 TL impact
      const p10 = fx.matrix.find(s => s.shockPct === 10);
      assert.ok(p10);
      assert.equal(p10.fxGainLossTl, 100);
      assert.equal(p10.ebtImpactPct, 40); // 100 / 250 * 100 = 40%

      // -20% shock on +1000 net FX = -200 TL impact
      const m20 = fx.matrix.find(s => s.shockPct === -20);
      assert.ok(m20);
      assert.equal(m20.fxGainLossTl, -200);
      assert.equal(m20.ebtImpactPct, -80);
    });

    it('calculates shock matrix for short foreign exchange position', () => {
      const item = {
        net_fx_position: -500,
        ebt: 200
      };

      const fx = calculateFxSensitivity(item);
      assert.equal(fx.netFxPosition, -500);
      assert.equal(fx.positionType, 'SHORT');

      // +10% shock on -500 net FX = -50 TL impact (loss on depreciation)
      const p10 = fx.matrix.find(s => s.shockPct === 10);
      assert.ok(p10);
      assert.equal(p10.fxGainLossTl, -50);
      assert.equal(p10.ebtImpactPct, -25); // -50 / 200 * 100 = -25%
    });
  });

  describe('Item 3C: Consensus Target Price Comparison (calculateConsensusComparison)', () => {
    it('accurately compares Model Fair Value, Market Price, and Consensus Price', () => {
      // Model Fair Value: 150 TL, Current Price: 100 TL, Consensus: 120 TL
      const comp = calculateConsensusComparison(150, 100, 120);

      assert.equal(comp.hasConsensus, true);
      assert.equal(comp.modelUpsidePct, 50.0);       // (150 - 100) / 100 = +50%
      assert.equal(comp.consensusUpsidePct, 20.0);   // (120 - 100) / 100 = +20%
      assert.equal(comp.spreadVsConsensusPct, 25.0); // (150 - 120) / 120 = +25%
      assert.equal(comp.divergenceBadge, 'MORE_BULLISH');
      assert.match(comp.evaluationText, /daha iyimser bir değerleme/);
    });

    it('detects conservative stance when Model Fair Value is below Consensus', () => {
      // Model: 110 TL, Current: 100 TL, Consensus: 140 TL -> spread = (110 - 140) / 140 = -21.4%
      const comp = calculateConsensusComparison(110, 100, 140);

      assert.equal(comp.hasConsensus, true);
      assert.equal(comp.divergenceBadge, 'MORE_CONSERVATIVE');
      assert.match(comp.evaluationText, /daha muhafazakar/);
    });

    it('detects aligned valuation when Model is within +/- 12% of Consensus', () => {
      const comp = calculateConsensusComparison(102, 100, 100);
      assert.equal(comp.divergenceBadge, 'ALIGNED');
      assert.match(comp.evaluationText, /yüksek uyum/);
    });
  });

  describe('Item 6: Valuation Multiples & Sector Benchmarks (calculateCompanyMultiples)', () => {
    it('computes company multiples and compares against sector benchmarks', () => {
      const item = {
        net_income: 1000,
        equity: 4000,
        ebitda: 1500,
        revenue: 10000,
        net_debt: 1500
      };
      // Shares: 100, Current Price: 50 TL => Market Cap = 5,000 TL
      // Net Debt = 1,500 TL
      // EV = 5,000 + 1,500 = 6,500 TL
      // P/E = 5,000 / 1000 = 5.0x
      // P/B = 5,000 / 4000 = 1.25x
      // EV/EBITDA = 6,500 / 1500 = 4.33x
      // EV/Sales = 6,500 / 10000 = 0.65x
      const result = calculateCompanyMultiples(item, 50, 100, 'INDUSTRIAL');

      assert.equal(result.multiples.pe.companyValue, 5.0);
      assert.equal(result.multiples.pb.companyValue, 1.25);
      assert.equal(result.multiples.evEbitda.companyValue, 4.33);
      assert.equal(result.multiples.evSales.companyValue, 0.65);

      // Verify benchmark existence
      assert.ok(result.benchmark);
      assert.equal(result.benchmark.peMedian, SECTOR_MULTIPLE_BENCHMARKS.INDUSTRIAL.peMedian);

      // Verify comparisons and implied prices are calculated
      assert.ok(result.multiples.pe.diffPct !== null);
      assert.ok(result.multiples.pe.impliedPrice !== null);
      assert.ok(result.multiples.pb.impliedPrice !== null);
      assert.ok(result.multiples.evEbitda.impliedPrice !== null);
    });

    it('falls back to default sector benchmark if sector is unknown', () => {
      const item = { net_income: 100, equity: 500 };
      const result = calculateCompanyMultiples(item, 10, 50, 'UNKNOWN_SECTOR');
      assert.equal(result.benchmark.sectorName, SECTOR_MULTIPLE_BENCHMARKS.INDUSTRIAL.sectorName);
    });
  });
});
