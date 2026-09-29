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
  computeSectorValuationAndDrivers 
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
});

