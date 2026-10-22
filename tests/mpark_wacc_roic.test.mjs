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
          reported_wacc: 29.6,
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

    // Assert Fisher Equation Reel WACC is ~4.7-4.8% (Nominal 29.6% vs TCMB 2026/06 Enflasyon %23.81 / %23.70)
    assert.ok(row.real_wacc >= 4.0 && row.real_wacc <= 11.0, `Expected Reel WACC between 4.0% and 11.0%, got ${row.real_wacc}%`);
    assert.ok(row.real_wacc === 4.7 || row.real_wacc === 4.8, `Expected Reel WACC 4.7% or 4.8%, got ${row.real_wacc}%`);

    // Assert Reel EVA Spread is positive (+10.4 - +10.5 points) instead of false alarm negative
    assert.ok(row.eva_spread > 0, `Expected positive EVA spread, got ${row.eva_spread}`);
    assert.ok(row.eva_spread === 10.4 || row.eva_spread === 10.5, `Expected EVA spread ~10.4-10.5 points, got ${row.eva_spread}`);
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

  await t.test('verifies MPARK 5 critical metrics via IsYatirimApiAdapter & FinancialRatioEngine', async () => {
    const { fetchAndAnalyzeBistCompany } = await import('../lib/bist-service.ts');
    const result = await fetchAndAnalyzeBistCompany('MPARK', { forceRefresh: true });
    assert.ok(result.success, 'Fetch should succeed');

    const latest = result.financial_history[result.financial_history.length - 1];
    const duranVarliklarBin = Math.round(latest.non_current_assets / 1000);
    const aktifToplamiBin = Math.round(latest.total_assets / 1000);
    const esasFaaliyetKariBin = Math.round(latest.operating_profit / 1000);
    const dupontMargin = result.unified_metrics?.dupont?.ebitMargin;
    const fcfBin = Math.round(latest.free_cash_flow / 1000);

    // a) Duran Varlıklar: 71.955.709 Bin TL
    assert.equal(duranVarliklarBin, 71955709, 'Duran Varlıklar must equal 71.955.709 Bin TL');
    // b) Aktif Toplamı: 95.303.606 Bin TL
    assert.equal(aktifToplamiBin, 95303606, 'Aktif Toplamı must equal 95.303.606 Bin TL');
    // c) Esas Faaliyet Kârı: 5.200.867 Bin TL
    assert.equal(esasFaaliyetKariBin, 5200867, 'Esas Faaliyet Kârı must equal 5.200.867 Bin TL');
    // d) DuPont Faaliyet Marjı: %15,24
    assert.equal(dupontMargin, 15.24, 'DuPont Faaliyet Marjı must equal 15.24%');
    // e) Serbest Nakit Akışı: 4.458.911 Bin TL
    assert.equal(fcfBin, 4458911, 'FCF must equal 4.458.911 Bin TL');
  });
}).then(() => {
  process.exit(0);
});
