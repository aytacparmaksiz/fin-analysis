import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorizeCompany, getThemeSummary, INVESTMENT_THEMES } from '../lib/company-categorizer.ts';

test('Investment Themes and Company Categorization Engine Test Suite', async (t) => {
  await t.test('1. categorizes high growth company correctly', () => {
    const report = {
      id: 'rep-growth',
      ticker: 'GROW1',
      price: '100',
      decision: 'AL',
      extractedData: {
        fair_value_drivers: {
          revenue_growth: { value: 45.0 },
        },
        financial_history: [
          { period: '2025/12', revenue: 1000000, ebitda: 200000, net_income: 150000, roe: 32, roic: 22 }
        ],
      }
    };

    const matches = categorizeCompany(report);
    const growthMatch = matches.find(m => m.themeId === 'GROWTH');
    assert.ok(growthMatch, 'Company should be categorized as GROWTH');
    assert.ok(growthMatch.metricValue.includes('45'));
  });

  await t.test('2. categorizes deep value asset-rich company correctly', () => {
    const report = {
      id: 'rep-value',
      ticker: 'VALU1',
      price: '50',
      decision: 'AL',
      extractedData: {
        marketMultiples: { pb: 0.85 },
        financial_history: [
          { period: '2025/12', total_assets: 1000000, equity: 600000, ebitda: 50000, net_income: 30000 }
        ],
      }
    };

    const matches = categorizeCompany(report);
    const valueMatch = matches.find(m => m.themeId === 'DEEP_VALUE');
    assert.ok(valueMatch, 'Company should be categorized as DEEP_VALUE');
    assert.ok(valueMatch.metricValue.includes('0.85'));
  });

  await t.test('3. categorizes defensive cash cow with net cash position', () => {
    const report = {
      id: 'rep-defensive',
      ticker: 'DEFE1',
      price: '80',
      decision: 'AL',
      extractedData: {
        financial_history: [
          { period: '2025/12', net_debt: -250000, free_cash_flow: 85000, ebitda: 120000 }
        ],
      }
    };

    const matches = categorizeCompany(report);
    const defMatch = matches.find(m => m.themeId === 'DEFENSIVE');
    assert.ok(defMatch, 'Company should be categorized as DEFENSIVE');
  });

  await t.test('4. categorizes turnaround company transitioning from prior loss to profit', () => {
    const report = {
      id: 'rep-turn',
      ticker: 'TURN1',
      price: '30',
      decision: 'AL',
      extractedData: {
        financial_history: [
          { period: '2025/09', ebitda: -40000, net_income: -60000 },
          { period: '2025/12', ebitda: 75000, net_income: 45000 }
        ],
      }
    };

    const matches = categorizeCompany(report);
    const turnMatch = matches.find(m => m.themeId === 'TURNAROUND');
    assert.ok(turnMatch, 'Company should be categorized as TURNAROUND');
  });

  await t.test('5. categorizes high ROIC & EVA creator company correctly', () => {
    const report = {
      id: 'rep-eva',
      ticker: 'EVA1',
      price: '150',
      decision: 'AL',
      extractedData: {
        financial_history: [
          { period: '2025/12', roic: 28.5, wacc: 18.0, ebitda: 500000, net_income: 350000 }
        ],
      }
    };

    const matches = categorizeCompany(report);
    const evaMatch = matches.find(m => m.themeId === 'HIGH_ROIC');
    assert.ok(evaMatch, 'Company should be categorized as HIGH_ROIC');
    assert.ok(evaMatch.reason.includes('EVA'));
  });

  await t.test('6. getThemeSummary aggregates all reports into 6 buckets', () => {
    const reports = [
      {
        id: 'r1', ticker: 'AAA', decision: 'AL',
        extractedData: {
          fair_value_drivers: { revenue_growth: { value: 50 } },
          financial_history: [{ ebitda: 100, roe: 30, net_debt: -50, free_cash_flow: 30 }]
        }
      },
      {
        id: 'r2', ticker: 'BBB', decision: 'NÖTR',
        extractedData: {
          marketMultiples: { pb: 0.9 },
          financial_history: [{ total_assets: 1000, equity: 500 }]
        }
      }
    ];

    const summary = getThemeSummary(reports);
    assert.equal(summary.GROWTH.length, 1);
    assert.equal(summary.DEEP_VALUE.length, 1);
    assert.equal(summary.DEFENSIVE.length, 1);
  });
});
