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

  await t.test('6. TCELL Anomaly Resolution: Eliminates false ALMA and produces AL decision with sound 95 score', () => {
    const tcellHist = OFFICIAL_ISYATIRIM_CACHE['TCELL'];
    const tcellBase = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['TCELL'];
    assert.ok(tcellHist, 'TCELL history must exist');
    assert.ok(tcellBase, 'TCELL baseline must exist');

    const price = 90.25;
    const shares = tcellBase.paidInCapitalMnTl * 1e6;
    const sector = mapIsYatirimSectorToValuationSector(tcellBase.sectorName);

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'TCELL',
        financial_history: tcellHist,
        share_count: shares,
        official_sector_name: tcellBase.sectorName
      },
      inputPriceStr: String(price),
      sector
    });

    assert.ok(res.valuation.valuation_model_name.includes('Telekomünikasyon'), `Model should be Telekomünikasyon, got ${res.valuation.valuation_model_name}`);
    assert.equal(res.valuation.is_value_trap, false, 'TCELL must not be falsely flagged as value trap');
    assert.equal(res.optimization?.finalDecision, 'AL', `TCELL must receive AL decision (got ${res.optimization?.finalDecision})`);
    assert.ok(res.valuation.fair_value > 120.0, `TCELL fair value (${res.valuation.fair_value}) should reflect robust telecom cash flows`);
  });

  await t.test('7. Cam Sanayii & Entegre Soda Külü (SISE): Activates dedicated international model and resolves false distress', () => {
    const siseHist = OFFICIAL_ISYATIRIM_CACHE['SISE'];
    const siseBase = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['SISE'];
    assert.ok(siseHist, 'SISE history must exist');

    const price = siseBase.lastPrice;
    const shares = siseBase.paidInCapitalMnTl * 1e6;
    const sector = mapIsYatirimSectorToValuationSector(siseBase.sectorName);

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'SISE',
        financial_history: siseHist,
        share_count: shares,
        official_sector_name: siseBase.sectorName
      },
      inputPriceStr: String(price),
      sector
    });

    assert.ok(res.valuation.valuation_model_name.includes('Cam Sanayii & Entegre Soda Külü'), `Model should be Cam Sanayii & Soda Külü, got ${res.valuation.valuation_model_name}`);
    assert.equal(res.valuation.is_value_trap, false, 'SISE must not be value trap');
    assert.notEqual(res.optimization?.finalDecision, 'ALMA', 'SISE must not receive false distressed ALMA rating');
    assert.ok(res.valuation.fair_value > 45.0, `SISE fair value (${res.valuation.fair_value}) should reflect soda ash & glass mid-cycle normalization`);
  });

  await t.test('8. Çelik Boru & Altyapı (BRSAN): Activates Berg Pipe & Energy Infrastructure spiral welded model', () => {
    const brsanBase = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['BRSAN'];
    assert.ok(brsanBase, 'BRSAN baseline must exist');

    const mockHistory = [
      {
        period: '2026/06',
        ebitda: 7000000000,
        revenue: 45000000000,
        net_income: 3500000000,
        equity: 42000000000,
        net_debt: 12000000000,
        operating_cash_flow: 4000000000,
        roe: 18.5
      }
    ];

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'BRSAN',
        financial_history: mockHistory,
        share_count: brsanBase.paidInCapitalMnTl * 1e6,
        official_sector_name: brsanBase.sectorName
      },
      inputPriceStr: String(brsanBase.lastPrice),
      sector: 'INDUSTRIAL'
    });

    assert.ok(res.valuation.valuation_model_name.includes('Çelik Boru'), `Model should be Çelik Boru, got ${res.valuation.valuation_model_name}`);
    assert.equal(res.valuation.is_value_trap, false, 'BRSAN must not be value trap');
    assert.ok(res.valuation.fair_value > 400.0, `BRSAN fair value (${res.valuation.fair_value}) calibrated`);
  });

  await t.test('9. Elektrik Teçhizat & Trafo (ASTOR, CWENE, EUPWR): Activates dedicated grid equipment model', () => {
    const astorBase = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['ASTOR'];
    assert.ok(astorBase, 'ASTOR baseline must exist');

    const mockHistory = [
      {
        period: '2026/06',
        ebitda: 14000000000,
        revenue: 40000000000,
        net_income: 11000000000,
        equity: 45000000000,
        net_debt: -2000000000, // Net cash
        operating_cash_flow: 8000000000,
        roe: 28.0
      }
    ];

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'ASTOR',
        financial_history: mockHistory,
        share_count: astorBase.paidInCapitalMnTl * 1e6,
        official_sector_name: astorBase.sectorName
      },
      inputPriceStr: String(astorBase.lastPrice),
      sector: 'INDUSTRIAL'
    });

    assert.ok(res.valuation.valuation_model_name.includes('Elektrik Teçhizat'), `Model should be Elektrik Teçhizat, got ${res.valuation.valuation_model_name}`);
    assert.equal(res.optimization?.finalDecision, 'AL', `ASTOR should receive AL rating (got ${res.optimization?.finalDecision})`);
  });

  await t.test('10. Meşrubat / İçecek (AEFES, CCOLA): Activates dedicated international FMCG beverage model', () => {
    const aefesBase = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE['AEFES'];
    assert.ok(aefesBase, 'AEFES baseline must exist');

    const mockHistory = [
      {
        period: '2026/06',
        ebitda: 32000000000,
        revenue: 160000000000,
        net_income: 14000000000,
        equity: 120000000000,
        net_debt: 25000000000,
        operating_cash_flow: 22000000000,
        roe: 19.0
      }
    ];

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'AEFES',
        financial_history: mockHistory,
        share_count: aefesBase.paidInCapitalMnTl * 1e6,
        official_sector_name: aefesBase.sectorName
      },
      inputPriceStr: String(aefesBase.lastPrice),
      sector: 'INDUSTRIAL'
    });

    assert.ok(res.valuation.valuation_model_name.includes('Meşrubat'), `Model should be Meşrubat, got ${res.valuation.valuation_model_name}`);
    assert.equal(res.valuation.is_value_trap, false, 'AEFES must not be value trap');
  });
});

