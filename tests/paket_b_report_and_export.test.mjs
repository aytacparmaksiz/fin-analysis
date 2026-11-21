import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatSignedPct,
  withTurkishPctSuffix,
  formatCompactAmount,
  buildForensicRedFlagsSection,
  buildCanonicalThesisVerdict,
  syncReportTextWithValuation,
  calculateDuPont5Step,
  generateAlgorithmicReportFallback,
  calculateSectorScore
} from '../lib/valuation.ts';
import { synthesizeInvestmentThesis } from '../lib/investment-thesis-synthesizer.ts';
import { parseNumericScore, formatCanonicalScore, formatAnalysisDate } from '../lib/report-resolver.ts';
import { generateFullAuditMarkdown } from '../lib/export-markdown.ts';

describe('Paket B Regression Suite: Report Text, Thesis Synthesizer, Resolver & Markdown Export', () => {
  it('1. formatSignedPct, withTurkishPctSuffix & formatCompactAmount grammar and scale safety', () => {
    assert.equal(formatSignedPct(-12.54), '-%12.5');
    assert.equal(formatSignedPct(15.0, 1, true), '+%15.0');
    assert.equal(formatSignedPct(0), '%0.0');
    assert.equal(formatSignedPct(null), 'Veri Yok');

    assert.equal(withTurkishPctSuffix(706.7, 'poss', 1), "%706.7'si");
    assert.equal(withTurkishPctSuffix(822.8, 'poss', 1), "%822.8'i");
    assert.equal(withTurkishPctSuffix(50, 'poss', 0), "%50'si");
    assert.equal(withTurkishPctSuffix(60, 'poss', 0), "%60'ı");
    assert.equal(withTurkishPctSuffix(100, 'poss', 0), "%100'ü");
    assert.equal(withTurkishPctSuffix(75, 'acc', 0), "%75'ini");
    assert.equal(withTurkishPctSuffix(60, 'dat', 0), "%60'ına");

    assert.equal(formatCompactAmount(-500_000_000, 'TRY', 'long'), '-500.0 Milyon TL');
    assert.equal(formatCompactAmount(250_000, 'TRY', 'long'), '250 Bin TL');
    assert.equal(formatCompactAmount(1_250_000_000, 'USD', 'short'), '1.25 Mr USD');
    assert.ok(!formatCompactAmount(-450_000, 'TRY', 'long').includes('0.00 Milyar'));
  });

  it('2. syncReportTextWithValuation preserves Hesaplanan case, syncs activePrice, score, verdict, bearDiffPct, +-% and is 100% idempotent', () => {
    const legacyReport = `
## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ

RIM TEZİ **Temel Yatırım Tezi:** hesapladığı **268,48 TL** adil değer, güncel **100,00 TL** piyasa fiyatına göre **%168.5 getiri potansiyeli** barındırmaktadır. Şirket yatırımcıya **asimetrik bir yükseliş fırsatı sunduğu değerlendirilmektedir (Güçlü Alım Tezi / Olumlu)**.

**Finansal Sağlık Skoru:** Şirket 100 üzerinden **85** puan alarak sektörel finansal dayanıklılık ve sermaye verimliliği kriterlerini güçlü şekilde sağlamıştır.

## IV. SERMAYE MALİYETİ (WACC) VE DEĞERLEME MODELİ
**Adil Değer:** **268,48 TL**
- Reel EVA makası (+-%67.5) düzeyindedir.

## V. DEĞER SÜRÜCÜLERİ
- **Ayı Senaryosu (Taban):** **180,00 TL**
- **Baz Senaryo (Adil Değer):** **268,48 TL**
- **Boğa Senaryosu (Tavan):** **340,00 TL**
Mevcut **100,00 TL** piyasa fiyatı bu tabanın **%2469900 üzerinde** seyretmektedir.

## VI. YATIRIM RİSKLERİ, KATALİZÖRLER VE NİHAİ KARAR
### Analist Kararı: **[AL]**
Hesaplanan **268,48 TL** adil değer, güncel **100,00 TL** piyasa fiyatına göre **%168.5 getiri potansiyeli** barındırmaktadır. (Güçlü Alım Tezi / Olumlu).
`.trim();

    const valuation = {
      ticker: 'CMBTN',
      fair_value: 20.00,
      bear_price: 2.00,
      bull_price: 28.00,
      current_price: 98.00,
      discount_pct: -390.0,
      final_decision: 'ALMA',
      is_value_trap: true,
      value_trap_reasons: ['Negatif özkaynak ve operasyonel zarar'],
    };
    const scoreResult = { totalScore: 34, sector: 'INDUSTRIAL', breakdown: [], anomalies: [] };
    const drivers = {
      revenue_growth: { value: -12.5 },
      margin: { value: -4.2 },
    };

    const s1 = syncReportTextWithValuation(legacyReport, valuation, scoreResult, drivers, 105.00, {
      sector: 'INDUSTRIAL',
      financial_history: [{ period: '2026/09', roic: 0, real_wacc: 14.5, gross_margin: -5.0, roe: -20.0, net_debt: 500_000_000, ebitda: -10_000_000 }],
    });
    const s2 = syncReportTextWithValuation(s1, valuation, scoreResult, drivers, 105.00, {
      sector: 'INDUSTRIAL',
      financial_history: [{ period: '2026/09', roic: 0, real_wacc: 14.5, gross_margin: -5.0, roe: -20.0, net_debt: 500_000_000, ebitda: -10_000_000 }],
    });

    assert.equal(s1, s2, 'syncReportTextWithValuation must be 100% idempotent');
    assert.ok(!s1.includes('RIM TEZİ **Temel Yatırım Tezi:**'), 'Must strip truncated RIM TEZİ prefix');
    assert.ok(!s1.includes('**Temel Yatırım Tezi:** hesapladığı'), 'Must never leave lowercase hesapladığı after Temel Yatırım Tezi');
    assert.ok(s1.includes('**Temel Yatırım Tezi:** Hesaplanan'), 'Must capitalize Hesaplanan cleanly');
    assert.ok(s1.includes('**105,00 TL**'), 'Must refresh stale 100,00 TL market price to activePrice 105,00 TL');
    assert.ok(!s1.includes('Güçlü Alım Tezi / Olumlu'), 'ALMA report must not retain Güçlü Alım Tezi');
    assert.ok(s1.includes('100 üzerinden **34** puan'), 'Must update health score summary to 34');
    assert.ok(s1.includes('**Adil Değer:** **20,00 TL**'), 'Must sync bold Adil Değer header');
    assert.ok(s1.includes('-%67.5') && !s1.includes('+-%67.5'), 'Must fix +-% to -%');
    assert.ok(!s1.includes('%2469900') && s1.includes('>%500 üzerinde'), 'Must cap extreme bearDiffPct');
    assert.ok(s1.includes('-%12.5') && s1.includes('-%4.2'), 'Section V must use drivers param, not hardcoded 20.0');
    assert.ok(s1.includes('Analist Kararı: **[ALMA]**'), 'Decision header must be synced to [ALMA]');
    assert.ok(s1.includes('Neden "ALMA" Verildi?'), 'Overpriced ALMA must emit ALMA justification block');
  });

  it('3. buildForensicRedFlagsSection handles roic===0, grossMargin<=0, scale Bin TL, and omits taşeron on non-TECH', () => {
    const block = buildForensicRedFlagsSection({
      ticker: 'INDST',
      valuation: { discount_pct: 32.0, fair_value: 50, bear_price: 35, final_decision: 'NÖTR' },
      optimization: { finalDecision: 'NÖTR' },
      scoreResult: { totalScore: 55, sector: 'INDUSTRIAL', anomalies: [], breakdown: [] },
      extractedData: { sector: 'INDUSTRIAL', currency: 'TRY' },
      latestItem: {
        is_thousands: true,
        net_debt: 250_000, // 250M TL in Bin TL
        financial_debt: 350_000,
        cash: 100_000,
        ebitda: 80_000,
        net_income: 50_000,
        operating_cash_flow: -20_000,
        roic: 0,
        real_wacc: 15.0,
        gross_margin: -3.5,
      },
    });

    assert.ok(block.includes('Negatif EVA Makası'), 'roic===0 must still trigger Negatif EVA when wacc>0');
    assert.ok(block.includes('Negatif Brüt Kâr Marjı'), 'grossMargin<=0 must be reported instead of skipped');
    assert.ok(!block.includes('taşeron'), 'Industrial sector must not emit donanım/ticaret ve taşeron');
    assert.ok(!block.includes('**0 Milyon TL') && !block.includes(' 0 Milyon TL'), 'Must respect is_thousands scale so 250_000 does not become 0 Milyon TL');
    assert.ok(block.includes('250.0 Milyon TL') || block.includes('250 Milyon TL'), 'Must display 250M TL cleanly');
  });

  it('4. calculateSectorScore UTILITIES_TELCO emits x without %4.2x unit collision and calculateDuPont5Step emits no (%null)/(nullx)', () => {
    const utilScore = calculateSectorScore({
      ticker: 'UTILX',
      financial_history: [{
        period: '2026/12',
        revenue: 10_000_000_000,
        gross_profit: 3_000_000_000,
        operating_profit: 2_000_000_000,
        ebitda: 3_000_000_000,
        net_income: 500_000_000,
        net_debt: 12_600_000_000, // 4.2x
        operating_cash_flow: 1_500_000_000,
        free_cash_flow: 200_000_000,
        ebitda_margin: 30,
        roic: 12,
        real_wacc: 10,
      }],
    }, 'UTILITIES_TELCO');
    const debtRow = utilScore.breakdown.find(b => b.reason.includes('Yüksek Borçluluk'));
    assert.ok(debtRow && !debtRow.reason.includes('%4.2x') && debtRow.reason.includes('4.2x'), `Must not emit %4.2x: ${debtRow?.reason}`);

    const insDupont = calculateDuPont5Step({
      period: '2026/09',
      net_income: 500_000_000,
      equity: 2_000_000_000,
      // omit revenue & total_assets so ebitMargin & financialLeverage are null
    }, 'INSURANCE');
    assert.ok(!insDupont.driverSummary.includes('null'), `INSURANCE DuPont must not leak null: ${insDupont.driverSummary}`);

    const bankDupont = calculateDuPont5Step({
      period: '2026/09',
      net_income: 1_000_000_000,
      equity: 4_000_000_000,
    }, 'BANKING');
    assert.ok(!bankDupont.driverSummary.includes('null'), `BANKING DuPont must not leak null: ${bankDupont.driverSummary}`);
  });

  it('5. generateAlgorithmicReportFallback enforces parsePeriodSortKey, preserves 0% growth, avoids synthetic numbers, flags negative OCF, and respects BANKING', () => {
    const balsuReport = generateAlgorithmicReportFallback({
      ticker: 'BALSU',
      sector: 'INDUSTRIAL',
      sectorDef: { title: 'Gıda İşleme' },
      price: '120.00',
      valuation: { fair_value: 95.0, bear_price: 2.0, bull_price: 130.0, discount_pct: -26.3, valuation_model_name: 'FD/FAVÖK', margin_of_safety_status: 'UNSAFE' },
      drivers: { revenue_growth: { value: 0 }, net_income_growth: { value: -15.0 }, target_multiple: { value: '6,5x' } },
      scoreResult: { totalScore: 52, breakdown: [] },
      optimization: { finalDecision: 'NÖTR', conditionalWarnings: [] },
      currentDateStr: '2026-11-20',
      extractedData: {
        currency: 'TRY',
        financial_history: [
          { period: '2026/09', net_income: 260_000_000, operating_cash_flow: -780_000_000, free_cash_flow: -900_000_000, ebitda_margin: -5.0 },
          { period: '2026/03', net_income: 50_000_000, operating_cash_flow: 40_000_000 },
        ],
      },
    });

    assert.ok(!balsuReport.includes('15.64') && !balsuReport.includes('49.3'), 'Must never invent synthetic fallback ROIC/WACC');
    assert.ok(balsuReport.includes('%0.0'), 'Must preserve 0% revenue growth instead of || 20.0');
    assert.ok(!balsuReport.includes('tahakkuk kalitesi sektör standartlarıyla uyumludur'), 'Negative OCF (-780M) must not praise cash quality');
    assert.ok(balsuReport.includes('negatif OCF'), 'Must flag negative OCF explicitly');
    assert.ok(balsuReport.includes('>%500 üzerinde') && !balsuReport.includes('sınırlı / Olumlu'), 'Must cap extreme bear ratio');

    const bankReport = generateAlgorithmicReportFallback({
      ticker: 'GARAN',
      sector: 'BANKING',
      sectorDef: { title: 'Bankacılık' },
      price: '144.50',
      valuation: { fair_value: 193.54, bear_price: 140.0, bull_price: 230.0, discount_pct: 25.3, valuation_model_name: 'Gordon PD/DD', margin_of_safety_status: 'SAFE' },
      drivers: { revenue_growth: { value: 30 }, net_income_growth: { value: 25 }, target_multiple: { value: '1,2x' } },
      scoreResult: { totalScore: 81, breakdown: [] },
      optimization: { finalDecision: 'NÖTR', conditionalWarnings: [] },
      currentDateStr: '2026-11-20',
      extractedData: {
        currency: 'TRY',
        financial_history: [{ period: '2026/09', net_income: 123_760_000_000, capex: 11_120_000_000, roe: 32.0 }],
      },
    });
    assert.ok(bankReport.includes('BDDK') && !bankReport.includes('Maddi duran varlık yatırımları'), 'BANKING report must use BDDK capital narrative, not industrial CapEx/FCF template');
  });

  it('6. synthesizeInvestmentThesis null-safety, -₺500 Mn sign, +%-12 prevention, PD/DD premium, and zero synthetic defaults', () => {
    const nullFvDossier = synthesizeInvestmentThesis({
      ticker: 'NULLTEST',
      decision: 'NÖTR',
      currentSector: 'INDUSTRIAL',
      officialSectorName: 'Sanayi',
      currentPrice: '1.250,50',
      fairValue: null,
      discountPct: null,
      latestData: {
        revenue: 1_000_000_000,
        ebitda: 200_000_000,
        net_income: 0,
        operating_cash_flow: 50_000_000,
        free_cash_flow: -500_000_000,
        equity: 500_000_000,
      },
      isTms29: true,
      companyMultiplesData: {
        multiples: { pb: { companyValue: 3.5 }, evEbitda: { companyValue: -1 } },
        benchmark: { pbMedian: 1.5, evEbitdaMedian: 6.0, peMedian: 9.0 },
      },
      drivers: {
        revenue_growth: { label: 'Satış', value: -12 },
        net_income_growth: { label: 'Net Kâr', value: -20 },
        target_multiple: { label: 'Hedef', value: '6,0x' },
      },
    });

    const json = JSON.stringify(nullFvDossier);
    assert.ok(!json.includes('NaN'), `Must not emit NaN: ${json}`);
    assert.ok(!json.includes('₺-'), `Must format -₺500 Mn before currency symbol: ${json}`);
    assert.ok(json.includes('-₺500 Mn'), 'Must include -₺500 Mn for -500M FCF');
    assert.ok(!json.includes('+%-') && !json.includes('+-%'), `Must not emit +%- or +-%; got ${json}`);
    assert.ok(!json.includes('%-'), `Must not emit %-; got ${json}`);
    assert.ok(!json.includes('net kârının') || !json.includes('120'), 'netIncome===0 must not claim net kârının %120 üzerinde');
    assert.ok(!json.includes('4.7') && !json.includes('4.50x'), 'Must not invent synthetic wacc=4.7 or nb/ebitda=4.5x');
    assert.ok(nullFvDossier.sectoralComparisonBadges[1].verdict.includes('primli'), 'compPb=3.5 > secPb=1.5 must show primli, not dengeli');
    assert.ok(!json.includes('hasılat direnci'), 'Negative revenue growth (-12%) must not be called hasılat direnci');
  });

  it('7. parseNumericScore, formatCanonicalScore & generateFullAuditMarkdown handle scores, empty strings, USD currency, BANKING, debt sums, and no fake lots', () => {
    assert.equal(parseNumericScore('76/100'), 76);
    assert.equal(parseNumericScore('76'), 76);
    assert.equal(parseNumericScore(0), 0);
    assert.equal(parseNumericScore(''), null);
    assert.equal(formatCanonicalScore('76/100'), '76/100');
    assert.equal(formatCanonicalScore(0), '0/100');
    assert.equal(formatAnalysisDate('2026-11-20T18:00:00.000Z').includes('2026'), true);

    const bankMd = generateFullAuditMarkdown({
      id: 'gar1',
      ticker: 'GARAN',
      price: '144.50',
      fairValue: '193.54',
      createdAt: '2026-11-20T12:00:00Z',
      period: '', // should fallback to latest hist 2026/09, NOT '2026/06'
      decision: 'NÖTR',
      score: '81/100',
      sector: 'BANKING',
      report: '## I. ÖZET',
      extractedData: {
        currency: 'USD',
        reporting_period: '2026/09',
        // omit shares_outstanding -> should NOT invent 100M lots in BÖLÜM 6
        financial_history: [
          {
            period: '2026/09',
            interest_income: 50_000_000,
            net_interest_income: 20_000_000,
            total_operating_income: 30_000_000,
            operating_profit: 12_000_000,
            net_income: 9_000_000,
            equity: 40_000_000,
            total_assets: 400_000_000,
            short_term_debt: 3_000_000,
            long_term_debt: 7_000_000,
            ebitda_margin: '', // empty string MUST render '—', NOT '%0.0'
            leverage_ratio: 90.0,
          },
        ],
      },
    });

    assert.ok(bankMd.includes('**Raporlama Dönemi:** 2026/09'), 'Must resolve latest period instead of hardcoded 2026/06');
    assert.ok(!bankMd.includes('81/100 / 100') && bankMd.includes('81 / 100'), 'Must not emit double /100');
    assert.ok(bankMd.includes('(Bin USD)') && !bankMd.includes('(Bin TRY)'), 'Must use actual USD currency label');
    assert.ok(bankMd.includes('| Net Faiz Geliri | 20.000 |'), 'Must render BANKING income statement rows');
    assert.ok(bankMd.includes('| Finansal Borçlar (Kısa + Uzun) | 10.000 |'), 'Must sum short_term_debt + long_term_debt');
    assert.ok(bankMd.includes('| FAVÖK Marjı | — |'), 'Empty string must render — instead of %0.0');
    assert.ok(bankMd.includes('Kaldıraç Oranı (Toplam Borç / Toplam Varlıklar)'), 'Must use Total Assets denominator label');
    assert.ok(bankMd.includes('güncel fiyat veya doğrulanmış pay adedi verisi eksiktir'), 'Must not invent 100M lots or 100 TL price');
  });
});
