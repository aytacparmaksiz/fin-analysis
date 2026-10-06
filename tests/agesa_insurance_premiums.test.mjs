import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichAndSanitizeFinancialHistory,
  computeSectorValuationAndDrivers,
  calculateCompanyMultiples,
  calculateDuPont5Step,
} from '../lib/valuation.ts';

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

  await t.test('fixes AGESA 15.448.698 Bin TRY scale, 0.2% technical margin, 0.5 TL fair value, 0.28 TL implied price, and 45x DuPont AUM explanation', () => {
    // Scenario: BIST API loaded container with currency='TRY' (Tam TL), and latest period was in Bin TRY (15,448,698)
    // and had 3C non-life technical profit (~30,897 Bin TRY = 0.2% of premiums)
    const mixedAgesaData = {
      ticker: 'AGESA',
      sector: 'INSURANCE',
      currency: 'TRY',
      current_price: 230,
      shares_outstanding: 180000000,
      financial_history: [
        {
          period: '2024/12',
          written_premiums: 14122502000,
          revenue: 14122502000,
          technical_profit: 2950000000,
          net_income: 3600000000,
          equity: 10090450000,
          total_assets: 453400000000,
        },
        {
          period: '2026/06',
          // Period in Bin TRY inside a 'TRY' container!
          written_premiums: 15448698,
          gross_written_premiums: 15448698,
          revenue: 15448698,
          technical_profit: 30897, // Buggy 0.2% non-life 3C line
          technical_balance: 30897,
          net_income: 4432668,
          equity: 12716575,
          total_assets: 526711580,
        }
      ]
    };

    const sanitized = enrichAndSanitizeFinancialHistory(mixedAgesaData);
    const latest = sanitized.financial_history[1];

    // 1. Scale check: in 'TRY' container, 15,448,698 Bin TRY must be scaled up to 15,448,698,000 Tam TL
    // So when UI divides by 1000 for "Bin TRY" display, it shows 15.448.698 (Bin TRY), NEVER 15.449!
    assert.equal(latest.written_premiums, 15448698000);
    assert.equal(Math.round(latest.written_premiums / 1000), 15448698);

    // 2. Technical margin check: rescued from 0.2% to ~23.5%
    const techMarginPct = (latest.technical_profit / latest.written_premiums) * 100;
    assert.ok(techMarginPct > 15 && techMarginPct < 30, `Expected realistic technical margin ~23.5%, got ${techMarginPct}%`);

    // 3. Fair value check: must be ~280-400 TL, NEVER 0.5 TL
    const valResult = computeSectorValuationAndDrivers(sanitized, 'INSURANCE');
    assert.ok(valResult.valuation.fair_value > 250, `Expected fair value > 250 TL, got ${valResult.valuation.fair_value}`);

    // 4. Multiples Median Implied Price check: must be > 150 TL, NEVER 0.28 TL
    const multResult = calculateCompanyMultiples(latest, 230, 180000000, 'INSURANCE', null, 'TRY');
    assert.ok(multResult.multiples.pe.impliedPrice > 200, `Expected PE impliedPrice > 200 TL, got ${multResult.multiples.pe.impliedPrice}`);
    assert.ok(multResult.multiples.pb.impliedPrice > 150, `Expected PB impliedPrice > 150 TL, got ${multResult.multiples.pb.impliedPrice}`);

    // 5. DuPont 5-Step check: financialLeverage ~43.0x-45.0x is explained as Emeklilik Yatırım Fonları (AUM), not debt!
    const dupont = calculateDuPont5Step(latest, sanitized.financial_history[0], 'INSURANCE');
    assert.ok(dupont.financialLeverage > 35 && dupont.financialLeverage < 50, `Expected AUM multiplier ~41-45x, got ${dupont.financialLeverage}`);
    assert.ok(dupont.driverSummary.toLowerCase().includes('emeklilik yatırım fonları (aum)'), `Expected AUM explanation in DuPont summary, got: ${dupont.driverSummary}`);
  });

  await t.test('verifies OFFICIAL_ISYATIRIM_CACHE for AGESA matches exact İş Yatırım last 4 quarters (15.448.697.576, 7.051.153.447, 24.073.963.541, 17.196.901.939)', async () => {
    const { OFFICIAL_ISYATIRIM_CACHE } = await import('../lib/isyatirim-official-cache.ts');
    const agesaHistory = OFFICIAL_ISYATIRIM_CACHE['AGESA'];
    assert.ok(Array.isArray(agesaHistory) && agesaHistory.length >= 16, 'Expected AGESA history in OFFICIAL_ISYATIRIM_CACHE');
    const last4 = agesaHistory.slice(-4);
    assert.deepEqual(
      last4.map(x => ({ period: x.period, written_premiums: x.written_premiums })),
      [
        { period: '2025/09', written_premiums: 17196901939 },
        { period: '2025/12', written_premiums: 24073963541 },
        { period: '2026/03', written_premiums: 7051153447 },
        { period: '2026/06', written_premiums: 15448697576 }
      ]
    );
  });
});

