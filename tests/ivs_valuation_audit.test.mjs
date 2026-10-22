import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeSectorValuationAndDrivers,
  calculateValuationSensitivityMatrix,
  calculateCompanyMultiples,
  getDamodaranUnleveredBeta,
  enrichAndSanitizeFinancialHistory
} from '../lib/valuation.ts';
import { isMetricDisabled } from '../lib/sectors.ts';
import { FinancialDataValidator } from '../lib/financial-validator.ts';

test('IVS & IFRS 13 VALUATION ENGINE AUDIT & INVARIANT TEST SUITE', async (t) => {

  // ============================================================================
  // BÖLÜM 1: MATEMATİKSEL SINIR ŞARTLARI & TEKİLLİK (INVARIANT CHECKS)
  // ============================================================================

  await t.test('INVARIANT 1: WACC <= g Singularity Boundary in Sensitivity Engine and Gordon Model', async (t) => {
    // A. Sensitivity Engine WACC <= g tekillik kontrolü
    const sensResult = calculateValuationSensitivityMatrix({
      baseWacc: 16.0,
      baseGrowth: 15.0,
      currentPrice: 50.0,
      baseFairValue: 65.0,
      waccDeltas: [-3.0, -1.0, 0, 1.0, 3.0], // WACC: [13.0, 15.0, 16.0, 17.0, 19.0]
      growthDeltas: [-1.0, 0, 1.0, 2.0]     // Growth: [14.0, 15.0, 16.0, 17.0]
    });

    assert.ok(sensResult.hasSingularity, 'WACC <= g durumunda hasSingularity true olmalıdır');
    assert.ok(sensResult.singularityCount > 0, 'Tekil hücre sayısı sıfırdan büyük olmalıdır');

    // WACC = 13.0, Growth = 14.0 (WACC < g) hücresi
    const cellWacc13G14 = sensResult.matrix[0][0]; // w=13.0, g=14.0
    assert.equal(cellWacc13G14.isValid, false, 'WACC < g olan hücre geçersiz (isValid: false) olmalıdır');
    assert.equal(cellWacc13G14.isSingularity, true, 'isSingularity true olmalıdır');
    assert.equal(cellWacc13G14.fairValue, null, 'WACC < g hücresinde adil değer hesaplanamaz (null)');
    assert.equal(cellWacc13G14.status, 'WACC_LE_G_SINGULARITY');

    // WACC = 15.0, Growth = 15.0 (WACC == g) hücresi
    const cellWacc15G15 = sensResult.matrix[1][1]; // w=15.0, g=15.0
    assert.equal(cellWacc15G15.isValid, false, 'WACC == g durumunda payda sıfıra bölündüğünden geçersiz olmalıdır');
    assert.equal(cellWacc15G15.fairValue, null);

    // B. computeSectorValuationAndDrivers Gordon Modeli Ke <= g Sınır Uyarısı
    // Sigortacılıkta g = %18.0. Eğer şirketin WACC/Ke'si %15 olarak girilirse Ke <= g ihlali oluşur.
    const lowKeInsuranceHistory = [
      {
        period: '2025/12',
        revenue: 5_000_000_000,
        written_premiums: 5_000_000_000,
        net_income: 800_000_000,
        equity: 2_000_000_000,
        total_assets: 8_000_000_000,
        paid_in_capital: 200_000_000,
        roe: 40.0,
        wacc: 15.0 // Ke = 15.0% < g = 18.0%!
      }
    ];

    const valRes = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'LOWKE',
        sector: 'INSURANCE',
        currency: 'TRY',
        share_count: 200_000_000,
        financial_history: lowKeInsuranceHistory
      },
      sector: 'INSURANCE',
      marketPrice: 25.0
    });

    assert.ok(
      valRes.valuation.boundary_warning?.includes('Ke <= g') || valRes.valuation.boundary_warning?.includes('Sermaye maliyeti'),
      `Ke <= g sınır şartı ihlal edildiğinde model boundary_warning üretmelidir (Mevcut: ${valRes.valuation.boundary_warning})`
    );
  });

  await t.test('INVARIANT 2: Underwater Equity (Enterprise Value <= Net Debt) and Insolvency Handling', async (t) => {
    // Durum A: Pozitif Muhasebesel Özkaynak var, fakat operasyonel Firma Değeri Net Borcun altında (EV <= Net Borç)
    // EBITDA = 20M TL. 6.0x çarpanla EV = 120M TL. Ancak Net Borç = 250M TL!
    const underwaterHistory = [
      {
        period: '2025/12',
        revenue: 300_000_000,
        ebitda: 20_000_000,
        net_income: 5_000_000,
        equity: 50_000_000, // Muhasebe defter değeri pozitif
        net_debt: 250_000_000, // Aşırı yüksek borç: EV (120M) < Net Borç (250M)
        paid_in_capital: 50_000_000,
        total_assets: 400_000_000
      }
    ];

    const underwaterRes = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'BORCLU',
        sector: 'INDUSTRIAL',
        currency: 'TRY',
        share_count: 50_000_000,
        financial_history: underwaterHistory
      },
      sector: 'INDUSTRIAL',
      marketPrice: 3.0
    });

    assert.ok(
      underwaterRes.valuation.boundary_warning?.includes('EV <= Net Borç') || underwaterRes.valuation.debt_distress_discount_pct !== undefined,
      `EV <= Net Borç durumunda model borç sıkıntısı uyarısı veya indirimi uygulamalıdır (Mevcut: ${underwaterRes.valuation.boundary_warning})`
    );
    // Borç aşınması ve 0 TL operasyonel özkaynak payı yansıtılmış olmalıdır:
    // Model 0 TL EV/EBITDA payını %45 ağırlıkla dahil ettiği için hisse başı adil değer baskılanmalıdır (<= 0.50 TL)
    assert.ok(underwaterRes.valuation.fair_value <= 0.50, `EV <= Net Borç durumunda adil değer borç yükünü yansıtmalıdır (Mevcut: ${underwaterRes.valuation.fair_value})`);

    // Durum B: Tamamen batık şirket (Özkaynak <= 0 VE EV <= Net Borç)
    const insolventHistory = [
      {
        period: '2025/12',
        revenue: 200_000_000,
        ebitda: 5_000_000,
        net_income: -80_000_000,
        equity: -100_000_000, // Negatif özkaynak
        net_debt: 300_000_000, // EV ~30M << 300M Net Borç
        paid_in_capital: 50_000_000,
        total_assets: 250_000_000
      }
    ];

    const insolventRes = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'BATIK',
        sector: 'INDUSTRIAL',
        currency: 'TRY',
        share_count: 50_000_000,
        financial_history: insolventHistory
      },
      sector: 'INDUSTRIAL',
      marketPrice: 1.0
    });

    assert.equal(insolventRes.valuation.is_insolvent, true, 'Özkaynak negatif ve EV <= Net Borç şirket insolvent olarak işaretlenmelidir');
    assert.equal(insolventRes.valuation.fair_value, null, 'Batık şirkete pozitif içsel hisse değeri verilemez (null olmalıdır)');
    assert.ok(insolventRes.valuation.formula_display.includes('N/A'));
  });

  await t.test('INVARIANT 3: Systematic Risk / Beta <= 0 Boundary Condition and CAPM Cost of Equity Floor', async (t) => {
    // CAPM aksiyomu: Ke = Rf + Beta * ERP. Faal bir şirkette Beta <= 0 olamaz.
    // Eğer Beta <= 0 olursa Ke <= Rf olur (devlet tahvilinden daha düşük beklenen getiri anomalisi).
    const testItem = {
      ticker: 'TESTCO',
      sector: 'INDUSTRIAL',
      equity: 500_000_000,
      financial_debt: 100_000_000,
      total_assets: 1_000_000_000,
      currency: 'TRY',
      beta: -0.40 // Anormal negatif beta girdisi
    };

    enrichAndSanitizeFinancialHistory([testItem], 'INDUSTRIAL');

    // leveredBeta asgari operasyonel taban olan 0.25'e kenetlenmelidir
    assert.equal(testItem.beta, 0.25, `Beta <= 0 (-0.40) girildiğinde asgari taban 0.25'e kenetlenmelidir (Mevcut: ${testItem.beta})`);
    assert.ok(testItem.cost_of_equity > testItem.risk_free_rate, `CAPM gereği Ke (${testItem.cost_of_equity}) > Rf (${testItem.risk_free_rate}) olmalıdır`);
  });

  // ============================================================================
  // BÖLÜM 2: SEKTÖREL ADAPTASYON & DEĞERLEME YÖNTEMİ SEÇİMİ
  // ============================================================================

  await t.test('SECTOR RULE 1: Banking & Financial Services DCF vs. DDM Standard', () => {
    // Bankacılık ve Sigortacılıkta FCFF/DCF ve EV/EBITDA finansal olarak anlamsızdır.
    assert.equal(isMetricDisabled('ev_ebitda', 'BANKING'), true, 'Bankacılıkta EV/EBITDA devre dışı olmalıdır');
    assert.equal(isMetricDisabled('ev_sales', 'BANKING'), true, 'Bankacılıkta EV/Sales devre dışı olmalıdır');
    assert.equal(isMetricDisabled('net_debt', 'BANKING'), true, 'Bankacılıkta Net Borç devre dışı olmalıdır');

    assert.equal(isMetricDisabled('ev_ebitda', 'INSURANCE'), true, 'Sigortacılıkta EV/EBITDA devre dışı olmalıdır');
    assert.equal(isMetricDisabled('net_debt', 'INSURANCE'), true, 'Sigortacılıkta Net Borç devre dışı olmalıdır');

    assert.equal(isMetricDisabled('ev_ebitda', 'FINANCIAL_SERVICES'), true, 'Finansal Hizmetlerde EV/EBITDA devre dışı olmalıdır');

    // Bankacılık değerleme motoru testi: DDM / Gordon PB Modeli çalışmalıdır
    const bankHistory = [
      {
        period: '2025/12',
        revenue: 120_000_000_000,
        net_income: 35_000_000_000,
        equity: 150_000_000_000,
        total_assets: 1_200_000_000_000,
        paid_in_capital: 4_200_000_000,
        roe: 28.5,
        wacc: 38.0
      }
    ];

    const bankVal = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'GARAN',
        sector: 'BANKING',
        currency: 'TRY',
        share_count: 4_200_000_000,
        financial_history: bankHistory
      },
      sector: 'BANKING',
      marketPrice: 110.0
    });

    assert.ok(
      bankVal.valuation.valuation_model_name.includes('Gordon') || bankVal.valuation.valuation_model_name.includes('Defter Değeri'),
      `Bankacılık modeli Gordon / Defter Değeri olmalıdır: ${bankVal.valuation.valuation_model_name}`
    );
    assert.ok(bankVal.valuation.fair_value > 0, 'Bankacılık adil değeri pozitif olmalıdır');
  });

  await t.test('SECTOR RULE 1B: Banking & Insurance Gordon Growth Bounded by Internal ROE (g <= ROE) and Distressed Floor', () => {
    // 1. Durum: Negatif ROE (Operasyonel Zarar Eden Banka)
    // Bankanın ROE'si -15.0%. Gordon modeli g = %20 büyüme varsayamaz; boundary_warning üretilmeli ve sıkıntılı P/B tabanı (<=0.40x) uygulanmalıdır.
    const lossBankHistory = [
      {
        period: '2025/12',
        revenue: 50_000_000_000,
        net_income: -15_000_000_000,
        equity: 100_000_000_000,
        total_assets: 800_000_000_000,
        paid_in_capital: 4_000_000_000,
        roe: -15.0,
        wacc: 35.0
      }
    ];

    const lossBankVal = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'ZARARBANK',
        sector: 'BANKING',
        currency: 'TRY',
        share_count: 4_000_000_000,
        financial_history: lossBankHistory
      },
      sector: 'BANKING',
      marketPrice: 15.0
    });

    assert.ok(
      lossBankVal.valuation.boundary_warning?.includes('Gordon Büyüme Modeli uygulanamaz') || lossBankVal.valuation.boundary_warning?.includes('ROE'),
      `Negatif ROE bankası için Gordon uyarı mekanizması çalışmalıdır (Mevcut: ${lossBankVal.valuation.boundary_warning})`
    );
    assert.ok(
      lossBankVal.drivers.target_multiple.numericValue <= 0.40,
      `Zarar eden bankanın hak edilen PD/DD çarpanı sıkıntılı tabanında (<= 0.40x) olmalıdır (Mevcut: ${lossBankVal.drivers.target_multiple.numericValue})`
    );

    // 2. Durum: Düşük Kârlı Banka (ROE = 10.0% < Macro g = 20.0%)
    // Sürekli sermaye enjeksiyonu olmaksızın g, ROE'yi aşamaz. Model g'yi <= 7.0%'ye bağlamalı ve hak edilen P/B < 1.0x olmalıdır.
    const lowRoeBankHistory = [
      {
        period: '2025/12',
        revenue: 60_000_000_000,
        net_income: 10_000_000_000,
        equity: 100_000_000_000,
        total_assets: 800_000_000_000,
        paid_in_capital: 4_000_000_000,
        roe: 10.0,
        wacc: 35.0
      }
    ];

    const lowRoeBankVal = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'DUSUKBANK',
        sector: 'BANKING',
        currency: 'TRY',
        share_count: 4_000_000_000,
        financial_history: lowRoeBankHistory
      },
      sector: 'BANKING',
      marketPrice: 20.0
    });

    assert.ok(
      lowRoeBankVal.drivers.target_multiple.numericValue < 1.0,
      `Sermaye maliyetinin altında getiri üreten bankanın hak edilen PD/DD çarpanı < 1.0x iskonto olmalıdır (Mevcut: ${lowRoeBankVal.drivers.target_multiple.numericValue})`
    );
  });

  await t.test('SECTOR RULE 2: Distressed Turnaround with Negative EBITDA (Vestel/Sanayi)', () => {
    // Negatif FAVÖK durumunda FD/FAVÖK çarpanı uygulanamaz (N/A).
    // Varlık tabanlı İskontolu Sıkıntılı Defter Değeri Modeli devreye girmelidir.
    const distressedHistory = [
      {
        period: '2025/12',
        revenue: 80_000_000_000,
        ebitda: -3_500_000_000, // Operasyonel zarar
        net_income: -12_000_000_000,
        equity: 25_000_000_000,
        net_debt: 45_000_000_000,
        paid_in_capital: 2_000_000_000,
        total_assets: 100_000_000_000,
        current_assets: 40_000_000_000,
        current_liabilities: 50_000_000_000
      }
    ];

    const distRes = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'DISTRESSEDCO',
        sector: 'INDUSTRIAL',
        currency: 'TRY',
        share_count: 2_000_000_000,
        financial_history: distressedHistory
      },
      sector: 'INDUSTRIAL',
      marketPrice: 8.50
    });

    assert.ok(
      distRes.valuation.valuation_model_name.includes('Sıkıntılı') || distRes.valuation.valuation_model_name.includes('Varlık Tabanı'),
      `Negatif FAVÖK şirketi Sıkıntılı Şirket / Varlık Tabanı modeline sokulmalıdır: ${distRes.valuation.valuation_model_name}`
    );
    assert.ok(distRes.drivers.target_multiple.numericValue < 1.0, 'Sıkıntılı şirket hak edilen PD/DD çarpanı < 1.0x olmalıdır');
  });

  // ============================================================================
  // BÖLÜM 3: ÇARPAN ANALİZİ & AYKIRI DEĞER (OUTLIER) NORMALİZASYONU
  // ============================================================================

  await t.test('MULTIPLES AUDIT: Sector Benchmarks Use Medians to Immunize Against Outliers', () => {
    const compMultiples = calculateCompanyMultiples(
      {
        period: '2025/12',
        revenue: 10_000_000_000,
        ebitda: 2_000_000_000,
        net_income: 1_200_000_000,
        equity: 6_000_000_000,
        net_debt: 1_000_000_000,
        paid_in_capital: 500_000_000
      },
      25.0,
      500_000_000,
      'INDUSTRIAL'
    );

    // Sektör karşılaştırma çarpanları medyan tabanlı olmalı, aşırı uç ortalamalardan etkilenmemelidir
    assert.ok(compMultiples.benchmark.peMedian > 0 && compMultiples.benchmark.peMedian < 50, 'F/K medyanı makul aralıkta olmalıdır');
    assert.ok(compMultiples.benchmark.pbMedian > 0 && compMultiples.benchmark.pbMedian < 15, 'PD/DD medyanı makul aralıkta olmalıdır');
    assert.ok(compMultiples.benchmark.evEbitdaMedian !== null && compMultiples.benchmark.evEbitdaMedian > 0, 'FD/FAVÖK medyanı pozitif olmalıdır');

    // Negatif kâr durumunda çarpan durumu NA ve rose rozet olmalıdır
    const lossMultiples = calculateCompanyMultiples(
      {
        period: '2025/12',
        revenue: 10_000_000_000,
        ebitda: -500_000_000,
        net_income: -800_000_000,
        equity: 4_000_000_000,
        net_debt: 2_000_000_000,
        paid_in_capital: 500_000_000
      },
      10.0,
      500_000_000,
      'INDUSTRIAL'
    );

    assert.equal(lossMultiples.multiples.pe.status, 'NA');
    assert.equal(lossMultiples.multiples.pe.badgeColor, 'rose');
    assert.equal(lossMultiples.multiples.evEbitda.status, 'NA');
  });

  // ============================================================================
  // BÖLÜM 4: FISHER REEL WACC DOĞRULAMASI (TMS 29 UYUMU)
  // ============================================================================

  await t.test('FISHER EQUATION AUDIT: Exact Multiplicative vs Linear Approximation Precision', () => {
    // Fisher Formülü: (1 + WACC_real) = (1 + WACC_nom) / (1 + inflation)
    // Örnek: Nominal WACC = %42.0, Enflasyon = %25.0
    // Doğru Fisher Reel WACC = ((1.42 / 1.25) - 1) * 100 = %13.6
    // Hatalı Lineer Yaklaşım = 42.0 - 25.0 = %17.0 (3.4 puanlık devasa hata!)
    const nominalWacc = 42.0;
    const inflation = 25.0;
    const exactRealWacc = Number((((1 + nominalWacc / 100) / (1 + inflation / 100) - 1) * 100).toFixed(1));
    const linearRealWacc = nominalWacc - inflation;

    assert.equal(exactRealWacc, 13.6, 'Fisher Reel WACC %13.6 çıkmalıdır');
    assert.ok(Math.abs(exactRealWacc - linearRealWacc) > 3.0, 'Yüksek enflasyonda lineer yaklaşım 3 puandan fazla sapma yaratır');

    // Modelin TMS 29 zenginleştirmesi ile Fisher Reel WACC'yi tam hesapladığını test et
    const tms29HistoryItem = {
      period: '2025/12',
      revenue: 1_000_000_000,
      ebitda: 200_000_000,
      net_income: 100_000_000,
      equity: 500_000_000,
      financial_debt: 200_000_000,
      total_assets: 1_000_000_000,
      currency: 'TRY',
      is_tms29: true
    };

    enrichAndSanitizeFinancialHistory([tms29HistoryItem], 'INDUSTRIAL', {
      policyRate12m: 35.0,
      policyRateYearEnd: 30.0,
      usdTry12m: 42.0,
      gdpGrowth: 3.5,
      commercialLoanRate: 48.0,
      depositRate3m: 45.0,
      creditDepositSpread: 3.0,
      capacityUtilizationRate: 75.0,
      capacityUtilizationDate: '2026-03',
      housingPriceIndex: 150.0,
      housingPriceAnnualChange: 30.0,
      housingPriceDate: '2026-03',
      source: 'TCMB'
    });

    assert.ok(tms29HistoryItem.real_wacc !== null, 'TMS 29 bilançoları için real_wacc türetilmelidir');
    assert.ok(tms29HistoryItem.real_wacc < tms29HistoryItem.nominal_wacc, 'Reel WACC nominal WACC değerinden düşük olmalıdır');
  });

  // ============================================================================
  // BÖLÜM 5: VALUATION OBJECT SENSITIVITY MATRIX ENTEGRASYONU
  // ============================================================================

  await t.test('SENSITIVITY MATRIX INTEGRATION: Valuation Metrics includes dynamic sensitivity matrix', () => {
    const history = [
      {
        period: '2025/12',
        revenue: 10_000_000_000,
        ebitda: 2_500_000_000,
        net_income: 1_800_000_000,
        equity: 8_000_000_000,
        total_assets: 15_000_000_000,
        paid_in_capital: 1_000_000_000,
        net_debt: 2_000_000_000
      }
    ];

    const res = computeSectorValuationAndDrivers({
      extractedData: {
        ticker: 'SANAYI',
        sector: 'INDUSTRIAL',
        currency: 'TRY',
        share_count: 1_000_000_000,
        financial_history: history
      },
      sector: 'INDUSTRIAL',
      marketPrice: 20.0
    });

    assert.ok(res.valuation.sensitivity_matrix !== undefined, 'ValuationMetrics sensitivity_matrix nesnesi içermelidir');
    assert.equal(res.valuation.sensitivity_matrix.waccRange.length, 5, 'WACC ekseni 5 nokta içermelidir');
    assert.equal(res.valuation.sensitivity_matrix.growthRange.length, 5, 'Büyüme ekseni 5 nokta içermelidir');
    assert.equal(res.valuation.sensitivity_matrix.matrix.length, 5, 'Matris 5 satır içermelidir');
    assert.equal(res.valuation.sensitivity_matrix.matrix[0].length, 5, 'Matris her satırda 5 sütun içermelidir');
  });

  // ============================================================================
  // BÖLÜM 6: NAKİT AKIŞ & CAPEX YÖNÜ VE ELDEN ÇIKARMA (DISINVESTMENT) DOĞRULAMASI
  // ============================================================================

  await t.test('INVARIANT 4: CapEx & Cash Flow Disinvestment Direction Guard', () => {
    // Şirket varlık satışı yaparak FCF > OCF üretmiştir:
    // OCF = 100M TL, FCF = 150M TL (50M TL net varlık elden çıkarma / disinvestment).
    // Finansal muhasebede CapEx = OCF - FCF = -50M TL (net elden çıkarma).
    // Math.abs kullanılması bu satışı +50M TL CapEx harcaması olarak yanlış gösterir.
    // Düzeltilmiş model CapEx'i 0 (veya net satış) olarak almalı, hayali nakit çıkışı üretmemelidir.
    const validationResult = FinancialDataValidator.validateItem({
      period: '2025/12',
      revenue: 500_000_000,
      cost_of_sales: -300_000_000,
      gross_profit: 200_000_000,
      operating_cash_flow: 100_000_000,
      free_cash_flow: 150_000_000 // FCF > OCF
    }, 'INDUSTRIAL');

    assert.equal(
      validationResult.reconciledItem.capex,
      0,
      `FCF > OCF olduğunda şirket net varlık elden çıkarmıştır; CapEx harcaması 0 TL olmalıdır (Mevcut: ${validationResult.reconciledItem.capex})`
    );
  });

});
