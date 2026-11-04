import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeSectorValuationAndDrivers,
  detectValueTrap,
  optimizeFinalDecision,
  calculateSectorScore
} from '../lib/valuation.ts';

test('CANTE & Chronic Loss-Making Distressed Valuation Test Suite', async (t) => {
  // CANTE 2026/06 Real Financial Data
  const canteHistory = [
    {
      period: '2025/09',
      revenue: 4564993481,
      ebitda: 1684230155,
      gross_profit: 328285054,
      operating_profit: -367304121,
      net_income: -2994865246,
      equity: 26397019949,
      net_debt: -246421728,
      roe: -14.16,
      roic: 1.01
    },
    {
      period: '2025/12',
      revenue: 7254030032,
      ebitda: 2551722969,
      gross_profit: 454925175,
      operating_profit: -1004233725,
      net_income: -2011965894,
      equity: 32894895438,
      net_debt: 197711428,
      roe: -6.12,
      roic: 0.38
    },
    {
      period: '2026/03',
      revenue: 1861038222,
      ebitda: 655933594,
      gross_profit: -59394147,
      operating_profit: -285935580,
      net_income: -1034788349,
      equity: 31307114865,
      net_debt: -1479648346,
      roe: -8.79,
      roic: 0.38
    },
    {
      period: '2026/06',
      revenue: 3783563339,
      ebitda: 1212613794,
      gross_profit: -116768381,
      operating_profit: -567215924,
      net_income: -2899038447,
      equity: 31726421342,
      net_debt: -1566629094,
      paid_in_capital: 10000000000,
      roe: -9.57,
      roic: -2.92,
      benchmark_wacc: 13.8,
      operating_cash_flow: 130000000
    }
  ];

  const latest = canteHistory[canteHistory.length - 1];

  await t.test('1. detectValueTrap flags CANTE as a Value Trap despite cash from rights offering', () => {
    const vt = detectValueTrap(canteHistory, 0.96, 2.56, 'UTILITIES_TELCO', latest);
    assert.equal(vt.isValueTrap, true, 'CANTE must be flagged as a Value Trap');
    assert.ok(vt.severity === 'CRITICAL' || vt.severity === 'HIGH', 'Severity must be HIGH or CRITICAL');
    assert.ok(vt.reasons.some(r => r.includes('Brüt Satış Zararı') || r.includes('Esas Faaliyet Zararı') || r.includes('Özkaynak Erozyonu')), 'Must cite operating/gross losses');
  });

  await t.test('2. calculateSectorScore penalizes gross loss and operating loss (score cannot be 90/100)', () => {
    const scoreRes = calculateSectorScore({
      ticker: 'CANTE',
      financial_history: canteHistory
    }, 'UTILITIES_TELCO');
    assert.ok(scoreRes.totalScore <= 35, `Score must be penalized under 35 (was ${scoreRes.totalScore})`);
    assert.ok(scoreRes.anomalies.length > 0, 'Anomalies must be recorded for gross/operating loss');
  });

  await t.test('3. optimizeFinalDecision strictly blocks AL decision for CANTE and overrides to ALMA/NÖTR', () => {
    const opt = optimizeFinalDecision({
      rawDecision: 'AL',
      score: 45,
      valuation: {
        fair_value: 1.20,
        current_price: 0.96,
        discount_pct: 25.0,
        is_value_trap: true,
        value_trap_severity: 'CRITICAL',
        value_trap_reasons: ['Brüt Satış Zararı', 'Esas Faaliyet Zararı']
      },
      marketPrice: 0.96,
      fairValue: 1.20,
      latestData: latest,
      financialHistory: canteHistory,
      sector: 'UTILITIES_TELCO'
    });

    assert.notEqual(opt.finalDecision, 'AL', 'CANTE cannot receive an AL recommendation under chronic losses');
    assert.equal(opt.finalDecision, 'ALMA', 'Value trap with severe operating loss must be overridden to ALMA');
    assert.equal(opt.overrideApplied, true);
  });

  await t.test('4. computeSectorValuationAndDrivers executes Distressed Model for CANTE instead of healthy multiples', () => {
    const result = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'CANTE',
        sector: 'UTILITIES_TELCO',
        official_sector_name: 'Elektrik Üretim',
        currency: 'TRY',
        share_count: 10000000000,
        financial_history: canteHistory,
        valuation: { current_price: 0.96 }
      },
      sector: 'UTILITIES_TELCO',
      marketPrice: 0.96
    });

    assert.ok(result.valuation.fair_value !== null);
    assert.notEqual(result.optimization.finalDecision, 'AL', 'Final decision must NOT be AL');
    assert.ok(result.scoreResult.totalScore < 60, 'Score must be < 60');
    assert.ok(result.valuation.bear_price < result.valuation.fair_value, 'Bear price < Fair value');
    assert.ok(result.valuation.fair_value < result.valuation.bull_price, 'Fair value < Bull price');
  });
});
