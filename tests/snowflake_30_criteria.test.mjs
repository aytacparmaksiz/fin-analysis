import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSnowflakeAnalysis,
  getSnowflakeCoordinates,
  generateSmoothSnowflakePath
} from '../lib/snowflake.ts';

test('Snowflake 30-Criteria Analysis Engine Test Suite', async (t) => {
  await t.test('1. computes 5 axes and exactly 30 deterministic checks', () => {
    const res = computeSnowflakeAnalysis({
      ticker: 'ASELS',
      sector: 'DEFENSE',
      currentPrice: 65.0,
      fairValue: 85.0,
      discountPct: 23.5,
      marketMultiples: { pe: 11.2, pb: 2.1, sector_pe: 14.5, sector_pb: 3.2, dividend_yield: 2.5 },
      financialHistory: [
        { period: '2024/12', revenue: 80000000, net_income: 18000000, equity: 60000000 },
        { period: '2025/12', revenue: 110000000, net_income: 26000000, equity: 85000000 }
      ],
      latestData: {
        current_assets: 90000000,
        current_liabilities: 45000000,
        total_assets: 140000000,
        total_liabilities: 55000000,
        net_debt: -10000000,
        financial_debt: 20000000,
        operating_cash_flow: 22000000,
        net_income: 26000000,
        equity: 85000000,
        ebitda: 32000000,
        operating_income: 28000000,
        interest_expenses: 2000000,
        dividends: [{ perShareTl: 1.25 }]
      },
      consensusTarget: 95.0,
      roic: 28.5,
      wacc: 18.0,
      evaSpread: 10.5
    });

    const axes = ['value', 'future', 'past', 'health', 'dividend'];
    let totalCheckCount = 0;
    let computedPassedCount = 0;

    for (const axisKey of axes) {
      const axis = res.axes[axisKey];
      assert.ok(axis, `Axis ${axisKey} must exist`);
      assert.strictEqual(axis.checks.length, 6, `Axis ${axisKey} must have exactly 6 checks`);
      assert.strictEqual(axis.maxScore, 6, `Axis ${axisKey} maxScore must be 6`);
      assert.strictEqual(axis.score, axis.checks.filter(c => c.passed).length, `Axis score must equal passed checks count`);
      totalCheckCount += axis.checks.length;
      computedPassedCount += axis.score;
    }

    assert.strictEqual(totalCheckCount, 30, 'Total checks across all axes must be exactly 30');
    assert.strictEqual(res.totalScore, computedPassedCount, 'Total score must equal sum of axis scores');
    assert.strictEqual(res.percentage, Math.round((res.totalScore / 30) * 100), 'Percentage must be correct');
    assert.ok(res.rewards.length >= 1, 'Must have at least 1 reward');
    assert.ok(res.risks.length >= 1, 'Must have at least 1 risk');
  });

  await t.test('2. verifies NO parentheses in axis labels or check titles', () => {
    const res = computeSnowflakeAnalysis({
      ticker: 'THYAO',
      sector: 'AVIATION',
      currentPrice: 280.0,
      fairValue: 360.0,
      discountPct: 22.2,
      latestData: {}
    });

    for (const axis of Object.values(res.axes)) {
      assert.ok(!axis.label.includes('(') && !axis.label.includes(')'), `Axis label '${axis.label}' must not contain parentheses`);
      for (const check of axis.checks) {
        assert.ok(!check.title.includes('(') && !check.title.includes(')'), `Check title '${check.title}' must not contain parentheses`);
      }
    }
  });

  await t.test('3. verifies SVG coordinates and smooth Bezier closed path', () => {
    const res = computeSnowflakeAnalysis({
      ticker: 'EREGL',
      sector: 'INDUSTRIAL',
      currentPrice: 45.0,
      fairValue: 50.0,
      discountPct: 10.0,
      latestData: {}
    });

    const coords = getSnowflakeCoordinates(res.axes, 140, 140, 95);
    assert.strictEqual(coords.length, 5, 'Must have 5 coordinate points');
    coords.forEach(pt => {
      assert.ok(Number.isFinite(pt.x), `x must be finite, got ${pt.x}`);
      assert.ok(Number.isFinite(pt.y), `y must be finite, got ${pt.y}`);
      assert.ok(!pt.label.includes('(') && !pt.label.includes(')'), `Coordinate label '${pt.label}' must not contain parentheses`);
    });

    const path = generateSmoothSnowflakePath(coords);
    assert.ok(path.startsWith('M '), 'SVG path must start with M command');
    assert.ok(path.endsWith(' Z'), 'SVG path must close with Z command');
    assert.ok(!path.includes('NaN'), 'SVG path must not contain NaN');
  });
});
