import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichAndSanitizeFinancialHistory, calculateSectorScore, optimizeFinalDecision } from '../lib/valuation.ts';

test('MPARK (MLP Care) WACC, ROIC, and TMS 29 Fisher Alignment Test Suite', async (t) => {
  await t.test('calculates correct ROIC of 15.20% (ex-TFRS 16) and 13.08% (inc-TFRS 16)', () => {
    const mparkData = {
      ticker: 'MPARK',
      sector: 'INDUSTRIAL',
      financial_history: [
        {
          period: '2026/06', // 6-month period (factor = 2)
          operating_profit: 5200867,
          equity: 46379086,
          net_debt: 4936903,
          financial_debt: 8500000,
          cash_and_equivalents: 3563097,
          lease_liabilities: 8300011,
          total_assets: 75200000,
          current_liabilities: 18000000,
          is_tms29: true,
        }
      ]
    };

    const enriched = enrichAndSanitizeFinancialHistory(mparkData);
    const row = enriched.financial_history[0];

    // Assert ROIC matches NotebookLM & Deloitte KAP audit figures (15.20%)
    assert.equal(row.roic, 15.20, `Expected ROIC 15.20%, got ${row.roic}%`);
    assert.ok(Math.abs(row.roic_tfrs16 - 13.08) <= 0.02, `Expected ROIC (TFRS 16) ~13.08%, got ${row.roic_tfrs16}%`);

    // Assert Healthcare defensive WACC capped at 29.6% (Deloitte audit discount rate)
    assert.equal(row.nominal_wacc, 29.6, `Expected Nominal WACC 29.6%, got ${row.nominal_wacc}%`);

    // Assert Fisher Equation Reel WACC is between 9.0% and 11.0% (9.8%)
    assert.ok(row.real_wacc >= 9.0 && row.real_wacc <= 11.0, `Expected Reel WACC between 9.0% and 11.0%, got ${row.real_wacc}%`);
    assert.equal(row.real_wacc, 9.8);

    // Assert Reel EVA Spread is positive (+5.4 points) instead of false alarm negative
    assert.ok(row.eva_spread > 0, `Expected positive EVA spread, got ${row.eva_spread}`);
    assert.equal(row.eva_spread, 5.4, `Expected EVA spread +5.4 points, got ${row.eva_spread}`);
  });

  await t.test('calculateSectorScore rewards positive Real EVA under TMS 29', () => {
    const mparkPayload = {
      sector: 'INDUSTRIAL',
      financial_history: [
        {
          period: '2026/06',
          operating_profit: 5200867,
          equity: 46379086,
          net_debt: 4936903,
          total_assets: 75200000,
          ebitda: 6500000,
          operating_cash_flow: 5000000,
          free_cash_flow: 3500000,
          roic: 15.20,
          wacc: 29.6,
          nominal_wacc: 29.6,
          real_wacc: 9.8,
          eva_spread: 5.4,
          is_tms29: true,
        }
      ]
    };

    const scoreResult = calculateSectorScore(mparkPayload, 'INDUSTRIAL');
    const capitalCategory = scoreResult.breakdown.find(b => b.category.includes('Sermaye Verimliliği'));

    assert.ok(capitalCategory, 'Sermaye Verimliliği category should exist');
    assert.equal(capitalCategory.status, 'good', 'Should have "good" status due to +5.4 Real EVA spread');
    assert.ok(scoreResult.anomalies.every(a => !a.includes('Negatif EVA')), 'Should not have Negatif EVA anomaly');
  });

  await t.test('optimizeFinalDecision does not override positive Real EVA companies to NÖTR', () => {
    const optimization = optimizeFinalDecision({
      rawDecision: 'AL',
      score: 82,
      discount: 30,
      valuation: { current_price: 250, fair_value: 350, discount_pct: 40 },
      latestData: {
        equity: 46379086,
        net_debt: 4936903,
        ebitda: 6500000,
        operating_cash_flow: 5000000,
        net_income: 4200000,
        roic: 15.20,
        wacc: 29.6,
        nominal_wacc: 29.6,
        real_wacc: 9.8,
        eva_spread: 5.4,
        is_tms29: true,
      },
      sector: 'INDUSTRIAL'
    });

    assert.equal(optimization.finalDecision, 'AL', `Expected AL decision, got ${optimization.finalDecision}`);
    assert.equal(optimization.overrideApplied, false, 'No false-positive override should be applied');
  });
});
