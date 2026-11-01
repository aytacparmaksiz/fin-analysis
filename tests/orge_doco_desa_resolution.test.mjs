import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enrichAndSanitizeFinancialHistory,
  computeSectorValuationAndDrivers,
  calculateCompanyMultiples
} from '../lib/valuation.ts';
import {
  resolveBistCompanyMeta,
  KNOWN_BIST_DIRECTORY
} from '../lib/bist-service.ts';
import {
  isElectricalEquipmentSector
} from '../lib/sectors.ts';

test('ORGE: capital split and post-split shareCount calibration', async (t) => {
  await t.test('resolves ORGE meta with 400M shares', () => {
    const meta = resolveBistCompanyMeta('ORGE');
    assert.equal(meta.ticker, 'ORGE');
    assert.equal(meta.shareCount, 400000000);
  });

  await t.test('isElectricalEquipmentSector recognizes ORGE even without official sector string', () => {
    assert.equal(isElectricalEquipmentSector('', 'ORGE'), true);
    assert.equal(isElectricalEquipmentSector('Elektrik Enerji Ürt.Teçh/Tesis Kurulum', 'ORGE'), true);
  });

  await t.test('computeSectorValuationAndDrivers prioritizes live 400M shareCount over stale 80M balance sheet capital', () => {
    const mockOrgeHistory = [
      {
        period: '2026/06',
        revenue: 2597519683,
        ebitda: 1560458709,
        net_income: 478166626,
        net_income_ttm: 989743308,
        equity: 5205533687,
        total_assets: 8512771081,
        net_debt: -389017699,
        paid_in_capital: 80000000 // Stale balance sheet line item before bonus issue
      }
    ];

    const valResult = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'ORGE',
        sector: 'INDUSTRIAL',
        currency: 'TRY',
        share_count: 400000000, // Live official market multiples capital
        financial_history: mockOrgeHistory,
        valuation: { current_price: 18.60 }
      },
      sector: 'INDUSTRIAL',
      marketPrice: 18.60
    });

    assert.ok(valResult.valuation.fair_value !== null);
    // With 400M shares, fair value is ~85.83 TL on single mock period (NOT ~338.31 TL)
    assert.ok(valResult.valuation.fair_value < 100.0, `Fair value (${valResult.valuation.fair_value}) must be realistic and calibrated with 400M shares`);
    assert.ok(valResult.valuation.fair_value > 30.0, `Fair value (${valResult.valuation.fair_value}) must reflect strong operating margins and net cash`);
    assert.equal(valResult.valuation.fair_value, 85.83);
  });
});

test('DOCO: dual-listed UFRS_A financial group auto-discovery and resolution', async (t) => {
  await t.test('resolves DOCO with UFRS_A group in KNOWN_BIST_DIRECTORY and resolveBistCompanyMeta', () => {
    assert.equal(KNOWN_BIST_DIRECTORY.DOCO.financialGroup, 'UFRS_A');
    const meta = resolveBistCompanyMeta('DOCO');
    assert.equal(meta.ticker, 'DOCO');
    assert.equal(meta.financialGroup, 'UFRS_A');
    assert.equal(meta.shareCount, 10983460);
  });

  await t.test('resolveBistCompanyMeta handles .IS suffix and case insensitivity for DOCO', () => {
    const metaWithSuffix = resolveBistCompanyMeta('doco.is');
    assert.equal(metaWithSuffix.ticker, 'DOCO');
    assert.equal(metaWithSuffix.financialGroup, 'UFRS_A');
    assert.equal(metaWithSuffix.shareCount, 10983460);
  });

  await t.test('computeSectorValuationAndDrivers prioritizes live 10.98M shareCount over 1.16B nominal balance sheet capital', () => {
    const docoLatestItem = {
      period: '2026/03',
      revenue: 33901336923,
      ebitda: 4131875579,
      net_income: 1645147496,
      equity: 27392154734,
      total_assets: 72928778482,
      net_debt: -1053769010,
      paid_in_capital: 1166312602 // Raw balance sheet nominal translated capital
    };

    const valResult = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'DOCO',
        sector: 'AVIATION',
        currency: 'TRY',
        share_count: 10983460, // Real official Austrian dual-listed share count
        financial_history: [docoLatestItem],
        valuation: { current_price: 11652.50 }
      },
      sector: 'AVIATION',
      marketPrice: 11652.50
    });

    assert.ok(valResult.valuation.fair_value !== null);
    // Fair value must be calibrated with ~11M shares (~8,000 - 14,000 TL), NOT 79.49 TL!
    assert.ok(valResult.valuation.fair_value > 5000.0, `DOCO fair value (${valResult.valuation.fair_value}) must NOT be divided by 1.16B shares`);
    assert.ok(valResult.valuation.fair_value < 20000.0, `DOCO fair value (${valResult.valuation.fair_value}) must be realistic around market price`);
    assert.equal(valResult.valuation.fair_value, 8202.88);
  });
});

test('DESA: unit scale preservation and 1000x outlier spike healing', async (t) => {
  await t.test('does not falsely multiply historical small-cap quarters by 1000 when adjacent quarters are in Tam TL', () => {
    const desaHistory = [
      { period: '2021/12', revenue: 432405300, ebitda: 103648821, equity: 207950699, net_income: 46351875 },
      { period: '2022/03', revenue: 191862414, ebitda: 38517877, equity: 227225781, net_income: 21316966 },
      { period: '2022/06', revenue: 461578742, ebitda: 105555526, equity: 273667157, net_income: 68362407 },
      { period: '2026/06', revenue: 2352641708, ebitda: 575962039, equity: 4744193715, net_income: 204704964 }
    ];

    const sanitized = enrichAndSanitizeFinancialHistory({
      ticker: 'DESA',
      sector: 'INDUSTRIAL',
      currency: 'TRY',
      financial_history: desaHistory
    });

    const p2203 = sanitized.financial_history.find(p => p.period === '2022/03');
    assert.ok(p2203, '2022/03 period must exist');
    assert.equal(p2203.revenue, 191862414, '2022/03 revenue must remain ~191.8M TL, NOT 191.8B TL');
    assert.equal(p2203.equity, 227225781, '2022/03 equity must remain ~227.2M TL, NOT 227.2B TL');
    assert.equal(p2203.ebitda, 38517877, '2022/03 ebitda must remain ~38.5M TL');
  });

  await t.test('cross-period outlier healer detects and divides 1000x corrupted upstream periods', () => {
    const corruptedHistory = [
      { period: '2021/12', revenue: 432405300, equity: 207950699 },
      { period: '2022/03', revenue: 191862414000, equity: 227225781000, minority_interests: 50000000000 }, // Corrupted 1000x jump
      { period: '2022/06', revenue: 461578742, equity: 273667157 }
    ];

    const sanitized = enrichAndSanitizeFinancialHistory({
      ticker: 'DESA',
      sector: 'INDUSTRIAL',
      currency: 'TRY',
      financial_history: corruptedHistory
    });

    const p2203 = sanitized.financial_history.find(p => p.period === '2022/03');
    assert.equal(p2203.revenue, 191862414, 'Corrupted 191.8B revenue must be healed to 191.8M');
    assert.equal(p2203.equity, 227225781, 'Corrupted 227.2B equity must be healed to 227.2M');
    assert.equal(p2203.minority_interests, 50000000, 'Corrupted 50B minority interests must be healed to 50M');
  });

  await t.test('consecutive historical Bin TL quarters (<0.005 of series maximum) are correctly converted to Tam TL', () => {
    const historyWithConsecutiveBin = [
      { period: '2020/09', revenue: 100000, equity: 150000 }, // Bin TL
      { period: '2020/12', revenue: 120000, equity: 180000 }, // Bin TL
      { period: '2026/06', revenue: 2352641708, equity: 4744193715 } // Modern Tam TL (4.7B)
    ];

    const sanitized = enrichAndSanitizeFinancialHistory({
      ticker: 'DESA',
      sector: 'INDUSTRIAL',
      currency: 'TRY',
      financial_history: historyWithConsecutiveBin
    });

    const p2009 = sanitized.financial_history.find(p => p.period === '2020/09');
    const p2012 = sanitized.financial_history.find(p => p.period === '2020/12');
    assert.equal(p2009.equity, 150000000, '2020/09 equity must be scaled from 150K to 150M TL');
    assert.equal(p2012.equity, 180000000, '2020/12 equity must be scaled from 180K to 180M TL');
  });
});

test('Universal 630+ BIST Sector & Corporate Action Architecture', async (t) => {
  await t.test('dynamically recognizes all 18 electrical equipment companies via official sector without hardcoding', async () => {
    const electricalEquipmentTickers = [
      'ALFAS', 'ASTOR', 'BETAE', 'CWENE', 'EMKEL', 'EUPWR',
      'GESAN', 'KLYPV', 'KONTR', 'MAGEN', 'MASFN', 'MOGAN',
      'NATEN', 'ORGE',  'SARAE', 'SAYAS', 'SMRTG', 'ULUSE'
    ];

    for (const ticker of electricalEquipmentTickers) {
      assert.equal(
        isElectricalEquipmentSector('', ticker),
        true,
        `${ticker} must dynamically match electrical equipment sector without manual hardcoded patches`
      );
    }
  });

  await t.test('computeSectorValuationAndDrivers self-heals stale balance sheet capital for ORGE even when share_count is omitted', () => {
    const mockOrgeHistory = [
      {
        period: '2026/06',
        revenue: 2597519683,
        ebitda: 1560458709,
        net_income: 478166626,
        net_income_ttm: 989743308,
        equity: 5205533687,
        total_assets: 8512771081,
        net_debt: -389017699,
        paid_in_capital: 80000000 // Stale balance sheet capital from pre-split Q2
      }
    ];

    // OMIT share_count deliberately
    const valResult = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'ORGE',
        financial_history: mockOrgeHistory,
        valuation: { current_price: 18.60 }
      },
      marketPrice: 18.60
    });

    assert.ok(valResult.valuation.fair_value !== null);
    // Fair value must be 85.83 TL (NOT ~338 TL!)
    assert.equal(valResult.valuation.fair_value, 85.83, 'Must automatically cross-reference 400M live shares from official baseline and prevent 5x split distortion');
  });
});


