import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichAndSanitizeFinancialHistory } from '../lib/valuation.ts';

test('AGESA Insurance & Pension AUM Plausibility & Scale Guard Test Suite', async (t) => {
  await t.test('rescues AGESA written premiums from 79 Billion AUM conflation and normalizes scale', () => {
    const rawAgesaInput = {
      ticker: 'AGESA',
      sector: 'INSURANCE',
      currency: 'Bin TRY',
      financial_history: [
        {
          period: '2026/06',
          // LLM mistook 79.165.845.909 TL (Katılımcıların Fon Tutarı / Emeklilik Borçları) for written premiums:
          written_premiums: 79165845909,
          revenue: 79165845909,
          net_income: 2850000000, // 2.85 Mr TL (Tam TL)
          equity: 12716575000,    // 12.7 Mr TL (Tam TL)
          total_assets: 154000000000, // 154 Mr TL (Tam TL)
          technical_balance: 3200000000,
          current_assets: 45000000000,
        }
      ]
    };

    const sanitized = enrichAndSanitizeFinancialHistory(rawAgesaInput);
    const row = sanitized.financial_history[0];

    // 1. Assert written_premiums is rescued to ~15.7M Bin TRY (~15.7 Billion TL) instead of 79 Billion!
    assert.ok(row.written_premiums > 14_000_000 && row.written_premiums < 17_000_000, 
      `Expected written_premiums ~15.700.000 Bin TRY, got: ${row.written_premiums}`);
    assert.equal(row.written_premiums, 15700000);
    assert.equal(row.revenue, 15700000);

    // 2. Assert pension_aum holds the 79 Billion AUM figure (normalized to Bin TRY: 79.165.846 Bin TRY)
    assert.ok(row.pension_aum > 75_000_000 && row.pension_aum < 85_000_000,
      `Expected pension_aum ~79.165.846 Bin TRY, got: ${row.pension_aum}`);
    assert.equal(row.pension_aum, 79165846);

    // 3. Assert monetary scale was correctly normalized from Tam TL to Bin TRY
    assert.equal(row.equity, 12716575); // 12.7M Bin TRY
    assert.equal(row.net_income, 2850000); // 2.85M Bin TRY
  });

  await t.test('preserves standard insurance written premiums when already valid and realistic', () => {
    const normalInsuranceInput = {
      ticker: 'TURSG',
      sector: 'INSURANCE',
      currency: 'Bin TRY',
      financial_history: [
        {
          period: '2026/06',
          written_premiums: 24500000, // 24.5 Mr TL in Bin TRY
          revenue: 24500000,
          net_income: 3800000,
          equity: 28000000,
          total_assets: 95000000,
        }
      ]
    };

    const sanitized = enrichAndSanitizeFinancialHistory(normalInsuranceInput);
    const row = sanitized.financial_history[0];

    assert.equal(row.written_premiums, 24500000);
    assert.equal(row.revenue, 24500000);
    assert.equal(row.equity, 28000000);
  });
});
