import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { 
  fetchLiveTcmbMacroData, 
  getExpectedInflationForPeriod, 
  OFFICIAL_TCMB_INFLATION_BASELINE 
} from '../lib/macro-service.ts';
import { enrichAndSanitizeFinancialHistory } from '../lib/valuation.ts';

test('TCMB EVDS3 Macroeconomic Service & Dynamic WACC Suite', async (t) => {
  await t.test('1. fetchLiveTcmbMacroData returns valid macro snapshot', async () => {
    const snapshot = await fetchLiveTcmbMacroData();
    assert.ok(snapshot, 'Snapshot must not be null');
    assert.equal(typeof snapshot.latestExpectedInflation, 'number');
    assert.ok(snapshot.latestExpectedInflation > 10 && snapshot.latestExpectedInflation < 60, 'Inflation must be reasonable');
    assert.ok(snapshot.latestSurveyDate, 'Must have survey date');
    assert.ok(snapshot.expectationsMap, 'Must contain expectations map');
    assert.ok(Object.keys(snapshot.expectationsMap).length >= 10, 'Must have monthly expectations');
    assert.ok(snapshot.commercialLoanRate > 30, 'Commercial loan rate must be populated');
    assert.ok(snapshot.depositRate3m > 30, '3M deposit rate must be populated');
    assert.ok(snapshot.creditDepositSpread > 10, 'Credit-deposit spread must be populated');
    assert.ok(snapshot.capacityUtilizationRate > 60, 'Capacity utilization rate (KKO) must be populated');
    assert.ok(snapshot.housingPriceIndex > 150, 'Housing price index (KFE) must be populated');
    assert.ok(snapshot.housingPriceAnnualChange > 10, 'Housing price annual change must be populated');
    assert.ok(snapshot.policyRate12m > 15, '12M policy rate expectation must be populated');
    assert.ok(snapshot.usdTry12m > 40, '12M USD/TRY expectation must be populated');
    assert.ok(snapshot.gdpGrowth > 0, 'GDP growth expectation must be populated');
  });

  await t.test('2. getExpectedInflationForPeriod resolves period-specific survey expectations', () => {
    // Pre-TMS 29 (2023 and earlier) must be 0%
    assert.equal(getExpectedInflationForPeriod('2023/12'), 0.0);
    assert.equal(getExpectedInflationForPeriod('2022/09'), 0.0);
    assert.equal(getExpectedInflationForPeriod('2021/12'), 0.0);

    // 2024 periods
    const inf2024_06 = getExpectedInflationForPeriod('2024/06');
    assert.ok(inf2024_06 > 25 && inf2024_06 < 40, `2024/06 inflation must be in range, got ${inf2024_06}`);

    // 2026 periods
    const inf2026_06 = getExpectedInflationForPeriod('2026/06');
    assert.ok(inf2026_06 > 20 && inf2026_06 < 30, `2026/06 inflation must be in range, got ${inf2026_06}`);
  });

  await t.test('3. enrichAndSanitizeFinancialHistory integrates dynamic macro snapshot', async () => {
    const macroSnapshot = await fetchLiveTcmbMacroData();
    
    const mockData = {
      ticker: 'TRGYO',
      sector: 'REIT',
      financial_history: [
        {
          period: '2026/06',
          equity: 154000000000,
          financial_debt: 12000000000,
          cash_and_equivalents: 15000000000,
          operating_profit: 4000000000,
          net_income: 4800000000,
          is_tms29: true
        }
      ]
    };

    const sanitized = enrichAndSanitizeFinancialHistory(mockData, 'REIT', macroSnapshot);
    const item = sanitized.financial_history[0];

    assert.ok(item.expected_inflation > 20, 'Expected inflation must be populated dynamically');
    assert.ok(item.nominal_wacc > 30, 'Nominal WACC must be populated');
    assert.ok(item.real_wacc < item.nominal_wacc, 'Real WACC must be lower than nominal WACC via Fisher equation');
    assert.equal(typeof item.eva_spread, 'number', 'EVA spread must be computed');
    assert.ok(item.deposit_rate_3m > 30, 'Deposit rate must be attached to history item');
    assert.ok(item.credit_deposit_spread > 10, 'Credit deposit spread must be attached to history item');
    assert.ok(item.capacity_utilization_rate > 60, 'Capacity utilization rate must be attached to history item');
    assert.ok(item.housing_price_annual_change > 10, 'Housing price annual change must be attached to history item');
  });

  await t.test('4. Dual-directory parity check for macro-service.ts and valuation.ts', () => {
    const rootMacro = path.resolve(process.cwd(), 'lib', 'macro-service.ts');
    const srcMacro = path.resolve(process.cwd(), 'src', 'lib', 'macro-service.ts');
    assert.equal(fs.readFileSync(rootMacro, 'utf8'), fs.readFileSync(srcMacro, 'utf8'), 'macro-service parity');

    const rootVal = path.resolve(process.cwd(), 'lib', 'valuation.ts');
    const srcVal = path.resolve(process.cwd(), 'src', 'lib', 'valuation.ts');
    assert.equal(fs.readFileSync(rootVal, 'utf8'), fs.readFileSync(srcVal, 'utf8'), 'valuation parity');
  });
});
