import test from 'node:test';
import assert from 'node:assert/strict';

import { USER_OFFICIAL_BIST_COMPANY_SECTORS } from '../lib/user-sectors-cache.ts';
import {
  detectSector,
  isAutomotiveSector,
  isTourismHospitalitySector,
  isTransportationLogisticsSector,
  isRetailFloatSector,
  isTextileSector,
  isPaperStationeryPackagingSector,
} from '../lib/sectors.ts';
import { OFFICIAL_53_SECTOR_CONFIGS } from '../lib/sector-definitions-53.ts';
import { calculateSectorScore, computeSectorValuationAndDrivers } from '../lib/valuation.ts';

test('53-Sector Architecture & Zero-Mismatch Routing Audit Suite', async (t) => {
  await t.test('1. Ticker Discrepancy Fixes: KARTN, TEZOL, AYCES, DESA, MAVI, SUWEN route to their exact official sectors', () => {
    // KARTN (Kartonsan): Official is Kağıt Ürünleri
    const kartnOff = USER_OFFICIAL_BIST_COMPANY_SECTORS['KARTN']?.sector;
    assert.equal(kartnOff, 'Kağıt Ürünleri');
    assert.equal(isAutomotiveSector(kartnOff, 'KARTN'), false, 'KARTN must NOT be Automotive');
    assert.equal(isPaperStationeryPackagingSector(kartnOff, 'KARTN'), true, 'KARTN must be Paper/Packaging');

    // TEZOL (Europap Tezol): Official is Kağıt Ürünleri
    const tezolOff = USER_OFFICIAL_BIST_COMPANY_SECTORS['TEZOL']?.sector;
    assert.equal(tezolOff, 'Kağıt Ürünleri');
    assert.equal(isTourismHospitalitySector(tezolOff, 'TEZOL'), false, 'TEZOL must NOT be Tourism');
    assert.equal(isPaperStationeryPackagingSector(tezolOff, 'TEZOL'), true, 'TEZOL must be Paper/Packaging');

    // AYCES (Altınyunus Çeşme): Official is Turizm
    const aycesOff = USER_OFFICIAL_BIST_COMPANY_SECTORS['AYCES']?.sector;
    assert.equal(aycesOff, 'Turizm');
    assert.equal(isTransportationLogisticsSector(aycesOff, 'AYCES'), false, 'AYCES must NOT be Logistics');
    assert.equal(isTourismHospitalitySector(aycesOff, 'AYCES'), true, 'AYCES must be Tourism');

    // DESA, MAVI, SUWEN: Fashion apparel officially in Deri Giyim and Tekstil Entegre
    const desaOff = USER_OFFICIAL_BIST_COMPANY_SECTORS['DESA']?.sector;
    assert.equal(isRetailFloatSector(desaOff, 'DESA'), false, 'DESA must NOT be Retail Float');
    assert.equal(isTextileSector(desaOff, 'DESA'), true, 'DESA must be Textile/Leather');

    const maviOff = USER_OFFICIAL_BIST_COMPANY_SECTORS['MAVI']?.sector;
    assert.equal(isRetailFloatSector(maviOff, 'MAVI'), false, 'MAVI must NOT be Retail Float');
    assert.equal(isTextileSector(maviOff, 'MAVI'), true, 'MAVI must be Textile Entegre');

    const suwenOff = USER_OFFICIAL_BIST_COMPANY_SECTORS['SUWEN']?.sector;
    assert.equal(isRetailFloatSector(suwenOff, 'SUWEN'), false, 'SUWEN must NOT be Retail Float');
    assert.equal(isTextileSector(suwenOff, 'SUWEN'), true, 'SUWEN must be Textile Entegre');

    // KTLEV (Katılımevim): Regulated savings finance company mapped to FINANCIAL_SERVICES
    assert.equal(detectSector('KTLEV'), 'FINANCIAL_SERVICES');
  });

  await t.test('2. Valuation Model Routing Integrity: KARTN and TEZOL get Paper model, AYCES gets Tourism model', () => {
    const dummyFinancials = {
      financial_history: [
        { period: '2025/12', ebitda: 500e6, revenue: 3000e6, net_income: 300e6, equity: 2000e6, net_debt: 200e6 }
      ],
      shares_count: 100e6,
    };

    const kartnVal = computeSectorValuationAndDrivers({
      ...dummyFinancials,
      ticker: 'KARTN',
      official_sector_name: 'Kağıt Ürünleri'
    });
    assert.ok(
      kartnVal.valuation.valuation_model_name.includes('Kağıt') || kartnVal.valuation.valuation_model_name.includes('İmalat'),
      `KARTN should have paper/packaging model, got: ${kartnVal.valuation.valuation_model_name}`
    );
    assert.ok(
      !kartnVal.valuation.valuation_model_name.includes('Otomotiv'),
      'KARTN model must not be Automotive'
    );

    const aycesVal = computeSectorValuationAndDrivers({
      ...dummyFinancials,
      ticker: 'AYCES',
      official_sector_name: 'Turizm'
    });
    assert.ok(
      aycesVal.valuation.valuation_model_name.includes('Turizm') || aycesVal.valuation.valuation_model_name.includes('Konaklama'),
      `AYCES should have tourism model, got: ${aycesVal.valuation.valuation_model_name}`
    );
    assert.ok(
      !aycesVal.valuation.valuation_model_name.includes('Ulaştırma') && !aycesVal.valuation.valuation_model_name.includes('Lojistik'),
      'AYCES model must not be Logistics'
    );
  });

  await t.test('3. Bilgisayar Toptancılığı Scoring: INDES/DGATE distributor is not penalized by SaaS %55 gross margin', () => {
    const distributorData = {
      ticker: 'INDES',
      official_sector_name: 'Bilgisayar Toptancılığı',
      financial_history: [
        { period: '2024/12', revenue: 20000e6, net_income: 600e6 },
        {
          period: '2025/12',
          revenue: 28000e6, // +40% growth
          gross_margin: 6.2, // normal hardware distributor margin
          net_margin: 2.8,   // healthy net margin for distribution
          current_ratio: 1.35,
          quick_ratio: 0.95,
          net_debt: -500e6,  // net cash
          roe: 28.5,
          operating_cash_flow: 800e6,
          free_cash_flow: 600e6,
        }
      ]
    };

    const score = calculateSectorScore(distributorData, 'TECH', 'Bilgisayar Toptancılığı');
    assert.ok(score.totalScore >= 75, `Healthy IT distributor should score >= 75, got: ${score.totalScore}`);
    assert.equal(score.breakdown[0].category, 'İşletme Sermayesi & Nakit Dönüşüm Süresi');
    assert.equal(score.breakdown[1].category, 'Hasılat Büyümesi & Bayi Yaygınlığı');
    assert.equal(score.breakdown[2].category, 'Net Marj & Kur Riski Yönetimi');
    assert.equal(score.breakdown[3].category, 'Sermaye Verimliliği (ROIC & ROE)');
    assert.equal(score.breakdown[1].status, 'good', 'High revenue growth should be good');
    assert.equal(score.breakdown[2].status, 'good', 'Net cash should be good');
  });

  await t.test('4. Aracı Kurumlar Scoring: ISMEN brokerage firm gets brokerage categories, not NPL loans', () => {
    const ismenData = {
      ticker: 'ISMEN',
      official_sector_name: 'Aracı Kurumlar',
      financial_history: [
        { period: '2024/12', revenue: 5000e6, net_income: 2000e6 },
        {
          period: '2025/12',
          revenue: 8000e6,
          equity: 12000e6,
          total_assets: 30000e6,
          roe: 48.0,
          net_income: 4000e6,
        }
      ]
    };

    const score = calculateSectorScore(ismenData, 'FINANCIAL_SERVICES', 'Aracı Kurumlar');
    assert.ok(score.totalScore >= 80, `Elite brokerage firm should score >= 80, got: ${score.totalScore}`);
    assert.equal(score.breakdown[0].category, 'BIST İşlem Hacmi & Pazar Payı');
    assert.equal(score.breakdown[1].category, 'Komisyon & Kredili Faiz Marjı');
    assert.equal(score.breakdown[2].category, 'Sermaye Yeterliliği & Özkaynak Tamponu');
    assert.equal(score.breakdown[3].category, 'Portföy Yönetimi (AUM) & ROE');
    assert.ok(!score.breakdown[0].reason.includes('NPL'), 'Must not mention bank NPL');
  });

  await t.test('5. 53-Sector Category Alignment: No INDUSTRIAL sector has debt metric in slot 3 and margin in slot 0', () => {
    for (const [secName, cfg] of Object.entries(OFFICIAL_53_SECTOR_CONFIGS)) {
      if (cfg.valuationSector === 'INDUSTRIAL' && secName !== 'Diğer') {
        const cats = cfg.scoring.categories;
        // Slot 0 must be Balance Sheet / Debt / Net Cash / Liquidity
        const slot0IsDebt = cats[0].key.includes('debt') || cats[0].key.includes('balance') || cats[0].key.includes('likidite') || cats[0].key.includes('borc') || cats[0].key.includes('faiz') || cats[0].key.includes('cash') || cats[0].name.includes('Borç') || cats[0].name.includes('Bilanço') || cats[0].name.includes('Likidite') || cats[0].name.includes('Kaldıraç') || cats[0].name.includes('Finansal') || cats[0].name.includes('Nakit');
        assert.ok(
          slot0IsDebt,
          `Sector ${secName} slot 0 must be Debt/Balance Sheet, got: ${cats[0].name} (${cats[0].key})`
        );
      }
    }
  });
});
