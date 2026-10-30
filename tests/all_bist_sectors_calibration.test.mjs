import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_ISYATIRIM_CACHE } from '../lib/isyatirim-official-cache.ts';
import { OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE } from '../lib/isyatirim-multiples-cache.ts';
import { computeSectorValuationAndDrivers, detectValueTrap } from '../lib/valuation.ts';
import { mapIsYatirimSectorToValuationSector } from '../lib/sectors.ts';

test('Borsa Istanbul Comprehensive Multi-Sector Valuation & Calibration Test Suite', async (t) => {
  await t.test('1. Dayanıklı Tüketim (White Goods: ARCLK) activates dedicated mid-cycle model and prevents extreme plunge', () => {
    const history = OFFICIAL_ISYATIRIM_CACHE['ARCLK'];
    const baseline = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['ARCLK'];
    assert.ok(history, 'ARCLK history must exist in official cache');
    assert.ok(baseline, 'ARCLK baseline must exist');

    const price = baseline.lastPrice;
    const shares = (baseline.paidInCapitalMnTl || 675.7) * 1e6;
    const sector = mapIsYatirimSectorToValuationSector(baseline.sectorName);

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'ARCLK',
        financial_history: history,
        share_count: shares,
        official_sector_name: baseline.sectorName
      },
      inputPriceStr: String(price),
      sector
    });

    assert.ok(res.valuation.valuation_model_name.includes('Dayanıklı Tüketim'), `Model should be Dayanıklı Tüketim, got ${res.valuation.valuation_model_name}`);
    assert.ok(res.valuation.fair_value > 70.0, `ARCLK fair value (${res.valuation.fair_value}) should not be distressed-liquidated (<70 TL)`);
    assert.ok(res.valuation.fair_value < 160.0, `ARCLK fair value (${res.valuation.fair_value}) should not be hyper-inflated (>160 TL)`);
    const upside = ((res.valuation.fair_value - price) / price) * 100;
    assert.ok(upside > -30 && upside < 80, `ARCLK upside (${upside.toFixed(1)}%) should be calibrated without extreme swings`);
  });

  await t.test('2. Demir-Çelik (Steel: EREGL) activates cyclical trough margin protection model', () => {
    const history = OFFICIAL_ISYATIRIM_CACHE['EREGL'];
    const baseline = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['EREGL'];
    assert.ok(history, 'EREGL history must exist');
    assert.ok(baseline, 'EREGL baseline must exist');

    const price = baseline.lastPrice;
    const shares = (baseline.paidInCapitalMnTl || 3500) * 1e6;
    const sector = mapIsYatirimSectorToValuationSector(baseline.sectorName);

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'EREGL',
        financial_history: history,
        share_count: shares,
        official_sector_name: baseline.sectorName
      },
      inputPriceStr: String(price),
      sector
    });

    assert.ok(res.valuation.valuation_model_name.includes('Demir-Çelik'), `Model should be Demir-Çelik, got ${res.valuation.valuation_model_name}`);
    assert.ok(res.valuation.fair_value > 15.0 && res.valuation.fair_value < 70.0, `EREGL fair value (${res.valuation.fair_value}) in valid range`);
  });

  await t.test('3. Organize Perakende (Retail: MGROS, BIMAS) activates Float model and exempts solvent cash producer from value trap', () => {
    const history = OFFICIAL_ISYATIRIM_CACHE['MGROS'];
    const baseline = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['MGROS'];
    assert.ok(history, 'MGROS history must exist');

    const price = baseline.lastPrice;
    const shares = (baseline.paidInCapitalMnTl || 181) * 1e6;
    const sector = mapIsYatirimSectorToValuationSector(baseline.sectorName);

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'MGROS',
        financial_history: history,
        share_count: shares,
        official_sector_name: baseline.sectorName
      },
      inputPriceStr: String(price),
      sector
    });

    assert.ok(res.valuation.valuation_model_name.includes('Organize Perakende'), `Model should be Organize Perakende, got ${res.valuation.valuation_model_name}`);
    assert.equal(res.valuation.is_value_trap, false, 'MGROS with huge positive OCF must not be falsely flagged as Value Trap');
  });

  await t.test('4. Sağlık & İlaç (Healthcare: MPARK) activates TFRS 16 adjusted model and avoids false value trap', () => {
    const history = OFFICIAL_ISYATIRIM_CACHE['MPARK'];
    const baseline = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['MPARK'];
    assert.ok(history, 'MPARK history must exist');

    const price = baseline.lastPrice;
    const shares = (baseline.paidInCapitalMnTl || 208) * 1e6;
    const sector = mapIsYatirimSectorToValuationSector(baseline.sectorName);

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'MPARK',
        financial_history: history,
        share_count: shares,
        official_sector_name: baseline.sectorName
      },
      inputPriceStr: String(price),
      sector
    });

    assert.ok(res.valuation.valuation_model_name.includes('Sağlık'), `Model should be Sağlık & İlaç, got ${res.valuation.valuation_model_name}`);
    assert.equal(res.valuation.is_value_trap, false, 'MPARK with 79 score and strong cash flow must not be false Value Trap');
    assert.equal(res.optimization.finalDecision, 'AL', `MPARK should receive AL recommendation (got ${res.optimization.finalDecision})`);
  });

  await t.test('5. Holding (SAHOL) and REIT (EKGYO) NAV multiple and growth clamps prevent extreme outlier upside', () => {
    const saholHist = OFFICIAL_ISYATIRIM_CACHE['SAHOL'];
    const saholBase = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['SAHOL'];
    const saholRes = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'SAHOL',
        financial_history: saholHist,
        share_count: saholBase.paidInCapitalMnTl * 1e6,
        official_sector_name: saholBase.sectorName
      },
      inputPriceStr: String(saholBase.lastPrice),
      sector: 'HOLDING'
    });

    const saholUpside = ((saholRes.valuation.fair_value - saholBase.lastPrice) / saholBase.lastPrice) * 100;
    assert.ok(saholUpside < 75.0, `SAHOL upside should be calibrated below +75% (was ${saholUpside.toFixed(1)}%)`);

    const ekgyoHist = OFFICIAL_ISYATIRIM_CACHE['EKGYO'];
    const ekgyoBase = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['EKGYO'];
    const ekgyoRes = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'EKGYO',
        financial_history: ekgyoHist,
        share_count: ekgyoBase.paidInCapitalMnTl * 1e6,
        official_sector_name: ekgyoBase.sectorName
      },
      inputPriceStr: String(ekgyoBase.lastPrice),
      sector: 'REIT'
    });

    const ekgyoUpside = ((ekgyoRes.valuation.fair_value - ekgyoBase.lastPrice) / ekgyoBase.lastPrice) * 100;
    assert.ok(ekgyoUpside < 85.0, `EKGYO upside should be calibrated below +85% (was ${ekgyoUpside.toFixed(1)}%, previously +112%)`);
  });
});
