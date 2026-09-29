import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import { 
  extractValuationFromReportText, 
  computeSectorValuationAndDrivers,
  parseFinancialNumber,
  safeDivide,
  safeGrowthRate,
  safeMargin,
  safeRoe,
  homogenizeTms29Series,
  calculateSectorScore,
  optimizeFinalDecision
} from '../lib/valuation.ts';
import { AGESA_SAMPLE_DATA } from '../lib/sample-data.ts';

// Preprocess function extracted from app/page.tsx
function preprocessReportMarkdown(text) {
  if (!text) return '';

  let cleaned = text;

  // 1. Convert \[ ... \] to $$ ... $$
  cleaned = cleaned.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_m, g1) => `\n\n$$\n${g1.trim()}\n$$\n\n`);
  cleaned = cleaned.replace(/\\\[([\s\S]*?)\\\]/g, (_m, g1) => `\n\n$$\n${g1.trim()}\n$$\n\n`);

  // 2. Convert standalone "$" lines or lines starting with "-> $" or "> $" or "- $"
  cleaned = cleaned.replace(/(?:^|\n)\s*(?:[-*]\s*)?(?:->\s*|>\s*)?\$\s*(?=\r?\n|$)/g, () => '\n$$');

  // 3. Convert single dollar math containing LaTeX commands (\text, \frac, etc.) or leading -> $ into $$
  cleaned = cleaned.replace(/(?:->\s*|>\s*)?\$(?!\$)\s*([^\n$]*\\[a-zA-Z]+[^\n$]*?)\s*\$/g, (_m, g1) => {
    return `\n\n$$\n${g1.trim()}\n$$\n\n`;
  });

  // 4. Clean inside $$ ... $$: ensure no internal blank lines break CommonMark math block
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, (_match, inner) => {
    const cleanedInner = inner
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
    return `\n\n$$\n${cleanedInner}\n$$\n\n`;
  });

  // 5. Inline LaTeX conversions: \( \text{...} \)
  cleaned = cleaned.replace(/\\\((\s*\\text\{.*?\}\s*)\\\)/g, (_m, g1) => `\n\n$$${g1}$$\n\n`);
  cleaned = cleaned.replace(/\\\((\s*\\frac\{.*?\}\{.*?\}\s*)\\\)/g, (_m, g1) => `\n\n$$${g1}$$\n\n`);
  cleaned = cleaned.replace(/\\\((.*?)\\\)/g, '$1');

  // 6. Normalise spacing around $$ blocks
  cleaned = cleaned.replace(/\n{3,}\$\$/g, () => '\n\n$$');
  cleaned = cleaned.replace(/\$\$\n{3,}/g, () => '$$\n\n');

  return cleaned.trim();
}

function calculateDriverPin(type, value, sector, targetNum) {
  if (value === null || value === undefined || isNaN(value)) return 50;

  if (type === 'rev') {
    if (value <= -20) return 10;
    if (value >= 150) return 92;
    if (value <= 0) return Math.round(10 + ((value + 20) / 20) * 15);
    if (value <= 40) return Math.round(25 + (value / 40) * 25);
    if (value <= 80) return Math.round(50 + ((value - 40) / 40) * 25);
    return Math.round(75 + ((value - 80) / 70) * 17);
  }

  if (type === 'net') {
    if (value <= -30) return 10;
    if (value >= 200) return 92;
    if (value <= 0) return Math.round(10 + ((value + 30) / 30) * 18);
    if (value <= 40) return Math.round(28 + (value / 40) * 22);
    if (value <= 100) return Math.round(50 + ((value - 40) / 60) * 25);
    return Math.round(75 + ((value - 100) / 100) * 17);
  }

  if (type === 'margin') {
    if (sector === 'INSURANCE') {
      if (value <= 75) return 92;
      if (value >= 115) return 10;
      if (value <= 88) return Math.round(92 - ((value - 75) / 13) * 24);
      if (value <= 98) return Math.round(68 - ((value - 88) / 10) * 25);
      return Math.round(43 - ((value - 98) / 17) * 33);
    } else {
      if (value <= 5) return 15;
      if (value >= 40) return 90;
      return Math.round(15 + ((value - 5) / 35) * 75);
    }
  }

  if (type === 'multiple') {
    const num = targetNum || value;
    if (num <= 1.0) return 25;
    if (num >= 5.0) return 85;
    return Math.round(25 + ((num - 1.0) / 4.0) * 60);
  }

  return 50;
}

describe('Item 6 & 7: Valuation extraction and consistency', () => {
  it('correctly extracts Adil Değer 411.62 TL and avoids capturing unrelated 633.26 TL formula', () => {
    const reportText = `
### 3. Nakit Akış Kalitesi ve Hissedar Kazancı
Hissedar Kazancı formülü:
$$
\\text{Hissedar Kazancı} = 1000 - 366.74 = \\mathbf{633.26\\text{ TL}}
$$

### 5. İleriye Dönük Analiz ve İskonto (Valuation)
Gordon Büyüme Modeli:
$$
\\text{Adil Değer} = \\mathbf{411.62\\text{ TL}}
$$
- Adil Değer: 411.62 TL
- Ayı Senaryosu Taban Fiyatı: 308.70 TL
- Boğa Senaryosu Tavan Fiyatı: 514.50 TL
`;

    const result = extractValuationFromReportText(reportText, 230);
    assert.ok(result);
    assert.equal(result.fair_value, 411.62, 'Fair value must match 411.62 TL and not 633.26 TL');
    assert.equal(result.bear_price, 308.70, 'Bear price must match 308.70 TL');
    assert.equal(result.bull_price, 514.50, 'Bull price must match 514.50 TL');
  });

  it('rejects multiplier contamination (1.38 TL / 2.3 TL) and applies realistic defaults', () => {
    const reportWithMultipleLeak = `
### 5. Değerleme
- Adil Değer: 633.26 TL
- Ayı Senaryosu Taban Fiyatı: 1.38 TL
- Boğa Senaryosu Tavan Fiyatı: 2.30 TL
`;

    const result = extractValuationFromReportText(reportWithMultipleLeak, 230);
    assert.ok(result);
    assert.equal(result.fair_value, 633.26);
    // 1.38 TL is a P/B multiple, not a realistic share price!
    assert.ok(result.bear_price >= 400, `Bear price must be realistic (~474 TL), got: ${result.bear_price}`);
    assert.ok(result.bull_price >= 700, `Bull price must be realistic (~791 TL), got: ${result.bull_price}`);
  });

  it('extracts compound LaTeX formulas with final bold answer', () => {
    const reportText = `
$$
\\text{Muhafazakar Adil Değer} = 154,58 \\text{ TL} \\times (1 - 0,30) = \\mathbf{108,20\\text{ TL}}
$$
`;
    const result = extractValuationFromReportText(reportText, 100);
    assert.ok(result);
    assert.equal(result.fair_value, 108.20);
  });
});

describe('Item 8: Driver pin positioning and text truncation', () => {
  it('positions +357.3% net income growth in the high Bullish zone (>= 90%)', () => {
    const pin = calculateDriverPin('net', 357.3);
    assert.equal(pin, 92, 'Growth of +357% must place pin at 92% (deep Bull zone)');
  });

  it('positions insurance combined ratio correctly (low is good)', () => {
    const goodPin = calculateDriverPin('margin', 88.4, 'INSURANCE');
    assert.ok(goodPin >= 60, `Combined ratio of 88.4% must be bullish/positive (got: ${goodPin})`);

    const badPin = calculateDriverPin('margin', 110.0, 'INSURANCE');
    assert.ok(badPin <= 25, `Combined ratio of 110% must be bearish (got: ${badPin})`);
  });
});

describe('Item 11: LaTeX Markdown preprocessing and KaTeX rendering', () => {
  it('properly converts broken user report formulas into valid KaTeX blocks', () => {
    const brokenText = `-> $

\\text{EVA Spread} = \\text{ROIC} - \\text{WACC}

$

Hissedar Kazancı (Owner's Earnings) Hesaplaması (2025 Tam Yıl):
$

\\text{Owner's Earnings} = \\text{İşletme Nakit Akışı} - \\text{Bakım CAPEX}

$

$

\\text{Owner's Earnings (2025)} = 10.450.098.959 \\text{ TL} - 363.974.221 \\text{ TL} = \\mathbf{10.086.124.738\\text{ TL}}

$

Hissedar Kazancı (2026/06 - 6 Aylık):
$

\\text{Owner's Earnings (2026/06)} = 6.636.234.494 \\text{ TL} - 122.601.929 \\text{ TL} = \\mathbf{6.513.632.565\\text{ TL}}

$`;

    const preprocessed = preprocessReportMarkdown(brokenText);
    const html = renderToString(
      React.createElement(ReactMarkdown, {
        remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: false }]],
        rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }]],
        children: preprocessed,
      })
    );

    const katexCount = (html.match(/class="katex"/g) || []).length;
    assert.equal(katexCount, 4, 'All 4 math formulas must be parsed and rendered with KaTeX');
  });

  it('handles single-dollar formulas containing LaTeX commands', () => {
    const singleDollar = `$ \\text{Hedef PD/DD} = \\frac{\\text{ROE} - g}{\\text{Ke} - g} $`;
    const preprocessed = preprocessReportMarkdown(singleDollar);
    const html = renderToString(
      React.createElement(ReactMarkdown, {
        remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: false }]],
        rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }]],
        children: preprocessed,
      })
    );

    assert.ok(html.includes('class="katex"'), 'Single dollar LaTeX must be converted and rendered with KaTeX');
  });
});

describe('Item 9 & 10: Dynamic Ratios per Period (no hardcoded static duplicates)', () => {
  it('computes distinct ratios per historical period rather than returning identical defaults', () => {
    const history = AGESA_SAMPLE_DATA.financial_history;
    assert.ok(history.length >= 6);

    const roeList = history.map(h => h.roe);
    const roeUnique = new Set(roeList);
    assert.ok(roeUnique.size > 1, `ROE across quarters must vary dynamically, got: ${roeList.join(', ')}`);

    const currentRatioList = history.map(h => h.current_ratio);
    const crUnique = new Set(currentRatioList);
    assert.ok(crUnique.size > 1, `Current Ratio across quarters must vary dynamically, got: ${currentRatioList.join(', ')}`);

    const combRatioList = history.map(h => h.combined_ratio);
    const combUnique = new Set(combRatioList);
    assert.ok(combUnique.size > 1, `Combined ratio across quarters must vary dynamically, got: ${combRatioList.join(', ')}`);
  });

  it('computes smart YoY and CAGR in computeSectorValuationAndDrivers', () => {
    const result = computeSectorValuationAndDrivers(AGESA_SAMPLE_DATA, '118.50', 'INSURANCE');
    assert.ok(result.drivers.revenue_growth.value > 0);
    assert.ok(result.drivers.net_income_growth.value > 0);
    // Explanations must clearly state the periods compared
    assert.ok(result.drivers.revenue_growth.sourceExplanation.includes('2025') || result.drivers.revenue_growth.sourceExplanation.includes('Son Dönem'));
    assert.ok(result.drivers.net_income_growth.sourceExplanation.includes('2025') || result.drivers.net_income_growth.sourceExplanation.includes('Son Dönem'));
  });

  it('uses Net Aktif Değeri (NAD / SOTP) valuation model for HOLDING sector without EBITDA', () => {
    const holdingData = {
      financial_history: [
        {
          period: '2025/12',
          equity: 100000000000,
          net_debt: -5000000000,
          ebitda: 15000000000,
          shares_count: 2000000000,
          holding_discount: 30.0
        }
      ]
    };
    const result = computeSectorValuationAndDrivers(holdingData, '45.00', 'HOLDING');
    assert.ok(result.valuation);
    assert.ok(
      result.valuation.valuation_model_name.includes('Net Aktif Değeri') ||
      result.valuation.valuation_model_name.includes('NAD') ||
      result.valuation.valuation_model_name.includes('SOTP'),
      `Model name should be NAD/SOTP, got ${result.valuation.valuation_model_name}`
    );
    // Fair value should be positive and derived from NAV per share
    assert.ok(result.valuation.fair_value > 0);
  });
});

describe('Dikey 1: Veri Okuma, Sayı Ayrıştırma & OCR Validasyonları', () => {
  it('correctly parses negative balances in parentheses: (1.234) and ( 1.234,50 )', () => {
    assert.equal(parseFinancialNumber('(1.234)'), -1234);
    assert.equal(parseFinancialNumber('(1.234,50)'), -1234.5);
    assert.equal(parseFinancialNumber('( 5.678,90 )'), -5678.9);
    assert.equal(parseFinancialNumber('(15%)'), -15);
  });

  it('correctly parses trailing minus formats: 1.234- and 1.234,50-', () => {
    assert.equal(parseFinancialNumber('1.234-'), -1234);
    assert.equal(parseFinancialNumber('1.234,50-'), -1234.5);
    assert.equal(parseFinancialNumber('45,2%-'), -45.2);
  });

  it('correctly handles Turkish (dot thousands, comma decimal) and International formats', () => {
    assert.equal(parseFinancialNumber('1.234.567,89'), 1234567.89);
    assert.equal(parseFinancialNumber('-1.234.567,89'), -1234567.89);
    assert.equal(parseFinancialNumber('1,234,567.89'), 1234567.89);
    assert.equal(parseFinancialNumber('1234,56 TL'), 1234.56);
    assert.equal(parseFinancialNumber('₺ 9.876,54'), 9876.54);
    assert.equal(parseFinancialNumber('$ 1,500.25'), 1500.25);
  });

  it('correctly parses negative numbers with currency symbols and spaces', () => {
    assert.equal(parseFinancialNumber('(1.234) TL'), -1234);
    assert.equal(parseFinancialNumber('TL (1.234)'), -1234);
    assert.equal(parseFinancialNumber('( 1.234,50 ) TL'), -1234.5);
    assert.equal(parseFinancialNumber('1.234- TL'), -1234);
    assert.equal(parseFinancialNumber('1.234 TL -'), -1234);
    assert.equal(parseFinancialNumber('1 234 567,89'), 1234567.89);
    assert.equal(parseFinancialNumber('1 234 567'), 1234567);
  });

  it('safely handles empty, dash, null, and non-numeric placeholders', () => {
    assert.equal(parseFinancialNumber('-'), null);
    assert.equal(parseFinancialNumber('—'), null);
    assert.equal(parseFinancialNumber('–'), null);
    assert.equal(parseFinancialNumber('N/A'), null);
    assert.equal(parseFinancialNumber(''), null);
    assert.equal(parseFinancialNumber(null), null);
    assert.equal(parseFinancialNumber(undefined), null);
  });

  it('homogenizes TMS 29 inflation accounting across historical series', () => {
    const rawHistory = [
      { period: '2022/12', revenue: 1000 },
      { period: '2023/12', revenue: 1500 },
      { period: '2024/03', revenue: 2000 },
      { period: '2024/06', revenue: 2500 }
    ];
    const { homogenizedHistory, hasTms29Adjustment, tms29TransitionPeriod, tms29Warnings } = homogenizeTms29Series(rawHistory);
    assert.equal(hasTms29Adjustment, true);
    assert.equal(tms29TransitionPeriod, '2023/12');
    assert.equal(homogenizedHistory[0].is_tms29, false);
    assert.equal(homogenizedHistory[1].is_tms29, true);
    assert.equal(homogenizedHistory[2].is_tms29, true);
    assert.ok(tms29Warnings.length > 0);
  });

  it('handles reverse-ordered history in homogenizeTms29Series and correctly sorts', () => {
    const reversedHistory = [
      { period: '2024/06', revenue: 2500 },
      { period: '2024/03', revenue: 2000 },
      { period: '2023/12', revenue: 1500 },
      { period: '2022/12', revenue: 1000 }
    ];
    const { hasTms29Adjustment, tms29TransitionPeriod, tms29Warnings } = homogenizeTms29Series(reversedHistory, 'INDUSTRIAL');
    assert.equal(hasTms29Adjustment, true);
    assert.equal(tms29TransitionPeriod, '2023/12');
    assert.ok(tms29Warnings.length > 0);
  });

  it('exempts Banking and Insurance sectors from TMS 29 per BDDK/SEDDK regulation', () => {
    const bankHistory = [
      { period: '2022/12', revenue: 1000 },
      { period: '2023/12', revenue: 1500 },
      { period: '2024/06', revenue: 2500 }
    ];
    const { hasTms29Adjustment, tms29Warnings } = homogenizeTms29Series(bankHistory, 'BANKING');
    assert.equal(hasTms29Adjustment, false);
    assert.equal(tms29Warnings.length, 0);
  });
});

describe('Dikey 2: Matematiksel & Finansal Model Düzeltmeleri', () => {
  it('safeGrowthRate handles negative previous base without sign inversion (turnarounds)', () => {
    // Zarardan kâra geçiş: Önceki net kâr -100, güncel net kâr +150
    // Klasik formül (150 - (-100)) / (-100) = -250% verir (YANLIŞ!)
    // Standart kurumsal finans formülü: (curr - prev) / |prev| * 100 = +250% (DOĞRU!)
    const growth = safeGrowthRate(150, -100);
    assert.equal(growth, 250.0, 'Turnaround from loss to profit must be positive growth');

    // Zarar artışı: Önceki -100, güncel -150 => ( -150 - (-100) ) / 100 * 100 = -50%
    const worsening = safeGrowthRate(-150, -100);
    assert.equal(worsening, -50.0, 'Deepening loss must be negative growth');

    // Sıfır tabanı
    assert.equal(safeGrowthRate(100, 0), 100.0);
    assert.equal(safeGrowthRate(-100, 0), -100.0);
    assert.equal(safeGrowthRate(null, 100), null);
  });

  it('safeRoe traps double-negative bug and triggers TTK 376 insolvency guard', () => {
    // Çift negatif tuzak: Hem net kâr negatif (-500) hem özkaynak negatif (-1000)
    // Standart bölme -500 / -1000 = +50% (SAHTE MÜKEMMEL ROE!)
    const trapped = safeRoe(-500, -1000);
    assert.equal(trapped.roe, null, 'Negative equity must never return a positive ROE');
    assert.equal(trapped.isInsolvent, true, 'Negative equity must be flagged as insolvent under TTK 376');
    assert.ok(trapped.warning?.includes('TTK 376'));

    // Normal kârlılık: Net kâr 250, Özkaynak 1000 => ROE %25
    const normal = safeRoe(250, 1000);
    assert.equal(normal.roe, 25.0);
    assert.equal(normal.isInsolvent, false);

    // Normal zarar pozitif özkaynak: Net kâr -150, Özkaynak 1000 => ROE -%15
    const loss = safeRoe(-150, 1000);
    assert.equal(loss.roe, -15.0);
    assert.equal(loss.isInsolvent, false);
  });

  it('safeMargin and safeDivide protect against divide-by-zero and invalid bounds', () => {
    assert.equal(safeDivide(100, 0), null);
    assert.equal(safeMargin(50, 0), null);
    assert.equal(safeMargin(50, -100), null);
    assert.equal(safeMargin(25, 100), 25.0);
  });
});

describe('Dikey 3: Sektörel Puanlama & Anomali Tespiti', () => {
  it('detects window-dressing (makyajlı bilanço) when Net Income > 0 but OCF < 0', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          net_income: 500000,
          operating_cash_flow: -200000,
          roe: 18.0,
          roic: 14.0,
          wacc: 35.0,
          net_debt: 2000000,
          ebitda: 400000,
          current_ratio: 1.2
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'INDUSTRIAL');
    assert.ok(scoreResult.anomalies.length > 0, 'Must detect cash flow divergence anomaly');
    const cashAnomaly = scoreResult.anomalies.find(a => a.includes('Makyajlı Bilanço') || a.includes('İşletme Nakit Akışı'));
    assert.ok(cashAnomaly, 'Anomaly for Makyajlı Bilanço / OCF must exist');
  });

  it('scores Insurance sector with combined ratio and ROE weights', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          combined_ratio: 86.5,
          roe: 48.0,
          net_income: 1200000,
          operating_cash_flow: 1500000
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'INSURANCE');
    assert.ok(scoreResult.totalScore >= 70, `Insurance company with 86.5% combined ratio and 48% ROE should score >= 70, got ${scoreResult.totalScore}`);
    assert.equal(scoreResult.sector, 'INSURANCE');
  });

  it('scores Banking sector with CAR, NPL and ROE', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          car_ratio: 18.5,
          npl_ratio: 1.8,
          roe: 38.0,
          net_interest_income: 5000000
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'BANKING');
    assert.ok(scoreResult.totalScore >= 70, `Bank with strong CAR and low NPL should score high, got ${scoreResult.totalScore}`);
    assert.equal(scoreResult.sector, 'BANKING');
  });

  it('penalizes failing bank with low CAR and high NPL', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          car_ratio: 7.5,
          npl_ratio: 16.0,
          roe: 6.0,
          net_interest_income: 100000
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'BANKING');
    assert.ok(scoreResult.totalScore < 45, `Failing bank should score low (< 45), got ${scoreResult.totalScore}`);
    assert.ok(scoreResult.anomalies.length > 0, 'Failing bank must have anomalies');
  });

  it('scores Holding sector based on Net Aktif Değeri, solo debt, and dividend flow', () => {
    const rawData = {
      financial_history: [
        {
          period: '2024/12',
          equity: 5000000,
          net_debt: -500000,
          dividends_paid: 200000
        },
        {
          period: '2025/12',
          equity: 8000000,
          net_debt: -1000000, // Net cash
          dividends_paid: 400000,
          operating_cash_flow: 600000,
          holding_discount: 35.0
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'HOLDING');
    assert.ok(scoreResult.totalScore >= 75, `Healthy holding with net cash and strong NAV growth should score high, got ${scoreResult.totalScore}`);
    assert.equal(scoreResult.sector, 'HOLDING');
  });
});

describe('Dikey 4: Nihai Karar Optimizasyonu & Yanıltıcı AL Filtresi', () => {
  it('overrides AL to ALMA when Net Debt / EBITDA exceeds safe leverage threshold (> 4.0x)', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          net_income: 100000,
          operating_cash_flow: 80000,
          net_debt: 5000000,
          ebitda: 1000000 // Net Debt / EBITDA = 5.0x (> 4.0x)
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'INDUSTRIAL');
    const opt = optimizeFinalDecision({
      rawDecision: 'AL',
      marketPrice: 100,
      fairValue: 150, // 50% discount theoretically
      scoreResult,
      sector: 'INDUSTRIAL'
    });

    assert.notEqual(opt.finalDecision, 'AL', 'High leverage company must not receive AL');
    assert.ok(opt.overrideReason?.includes('Borçluluk'), `Override reason must cite leverage: ${opt.overrideReason}`);
  });

  it('overrides AL to ALMA for Industrial when EBITDA is negative with net debt', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          net_income: -200000,
          operating_cash_flow: 50000,
          net_debt: 3000000,
          ebitda: -50000
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'INDUSTRIAL');
    const opt = optimizeFinalDecision({
      rawDecision: 'AL',
      marketPrice: 50,
      fairValue: 100,
      scoreResult,
      sector: 'INDUSTRIAL'
    });

    assert.equal(opt.finalDecision, 'ALMA');
    assert.ok(opt.overrideReason?.includes('Operasyonel Zarar ve Borçluluk'));
  });

  it('overrides AL to ALMA for Banking when CAR < 12% or NPL > 6%', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          car_ratio: 10.5, // Below 12%
          npl_ratio: 3.0,
          roe: 25.0
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'BANKING');
    const opt = optimizeFinalDecision({
      rawDecision: 'AL',
      marketPrice: 20,
      fairValue: 40,
      scoreResult,
      sector: 'BANKING'
    });

    assert.equal(opt.finalDecision, 'ALMA');
    assert.ok(opt.overrideReason?.includes('Sermaye Yeterlilik'));
  });

  it('overrides AL to ALMA for Insurance when combined ratio > 102%', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          combined_ratio: 108.5,
          roe: 25.0
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'INSURANCE');
    const opt = optimizeFinalDecision({
      rawDecision: 'AL',
      marketPrice: 50,
      fairValue: 80,
      scoreResult,
      sector: 'INSURANCE'
    });

    assert.equal(opt.finalDecision, 'ALMA');
    assert.ok(opt.overrideReason?.includes('Teknik Faaliyet Zararı'));
  });

  it('overrides AL to ALMA for Holding when solo net debt to equity > 0.6x', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          net_debt: 7000000,
          equity: 10000000 // 0.7x
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'HOLDING');
    const opt = optimizeFinalDecision({
      rawDecision: 'AL',
      marketPrice: 100,
      fairValue: 200,
      scoreResult,
      sector: 'HOLDING'
    });

    assert.equal(opt.finalDecision, 'ALMA');
    assert.ok(opt.overrideReason?.includes('Solo Holding'));
  });

  it('overrides AL to ALMA when cash flow is negative (makyajlı kâr)', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          net_income: 1000000,
          operating_cash_flow: -500000, // Makyajlı kâr!
          net_debt: 1000000,
          ebitda: 1200000
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'INDUSTRIAL');
    const opt = optimizeFinalDecision({
      rawDecision: 'AL',
      marketPrice: 80,
      fairValue: 120,
      scoreResult,
      sector: 'INDUSTRIAL'
    });

    assert.notEqual(opt.finalDecision, 'AL', 'Fake profit with negative OCF must not receive AL');
    assert.ok(
      opt.overrideReason?.toLowerCase().includes('nakit akışı') ||
      opt.overrideReason?.includes('Makyajlı Bilanço') ||
      opt.overrideReason?.includes('OCF'),
      `Override reason must cite cash flow or window dressing: ${opt.overrideReason}`
    );
  });

  it('overrides AL to NÖTR when margin of safety is insufficient (< 25%)', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          net_income: 1000000,
          operating_cash_flow: 1200000,
          net_debt: 500000,
          ebitda: 1500000
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'INDUSTRIAL');
    const opt = optimizeFinalDecision({
      rawDecision: 'AL',
      marketPrice: 100,
      fairValue: 110, // Sadece %10 iskonto!
      scoreResult,
      sector: 'INDUSTRIAL'
    });

    assert.equal(opt.finalDecision, 'NÖTR', 'Insufficient margin of safety must downgrade AL to NÖTR');
    assert.equal(opt.marginOfSafetyStatus, 'UNSAFE');
  });

  it('approves AL when Margin of Safety >= 25%, OCF > 0, Net Debt/EBITDA <= 4.0, and ROIC > WACC', () => {
    const rawData = {
      financial_history: [
        {
          period: '2025/12',
          net_income: 2000000,
          operating_cash_flow: 2500000,
          net_debt: 1000000,
          ebitda: 3000000,
          roic: 45.0,
          wacc: 35.0,
          current_ratio: 1.6
        }
      ]
    };
    const scoreResult = calculateSectorScore(rawData, 'INDUSTRIAL');
    const opt = optimizeFinalDecision({
      rawDecision: 'AL',
      marketPrice: 100,
      fairValue: 145, // %45 iskonto
      scoreResult,
      sector: 'INDUSTRIAL'
    });

    assert.equal(opt.finalDecision, 'AL', 'Strong fundamentals and ample margin of safety must remain AL');
    assert.equal(opt.marginOfSafetyStatus, 'SAFE');
    assert.equal(opt.overrideReason, undefined);
  });
});


