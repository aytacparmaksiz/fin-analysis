import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseNumericScore, formatCanonicalScore, formatAnalysisDate } from '../lib/report-resolver.ts';
import { parseFinancialNumber, parsePeriodSortKey } from '../lib/valuation.ts';

const ROOT = process.cwd();
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha256 = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');

describe('Paket C Regression Suite: Frontend, Hyperlinks, State Isolation & UI/UX', () => {
  it('1. src/app/ and app/ byte-for-byte SHA-256 parity for all 10 edited Paket C files', () => {
    const relFiles = [
      'page.tsx',
      'globals.css',
      'simply/simply-view.tsx',
      'simply/snowflake-radar.tsx',
      'components/market-cockpit.tsx',
      'components/spotlight-search.tsx',
      'components/login-modal.tsx',
      'simply/[ticker]/page.tsx',
      'report/[ticker]/page.tsx',
      'analysis/[ticker]/page.tsx',
    ];
    for (const rel of relFiles) {
      const hSrc = sha256(`src/app/${rel}`);
      const hApp = sha256(`app/${rel}`);
      assert.equal(hSrc, hApp, `Mirror mismatch for ${rel}`);
    }
  });

  it('2. KRİTİK-09: score parsing treats 0 as valid, strips /100 cleanly, eliminates 76100 & Xp raw badge bugs', () => {
    assert.equal(parseNumericScore(0), 0);
    assert.equal(parseNumericScore('0/100'), 0);
    assert.equal(parseNumericScore('76/100'), 76);
    assert.equal(parseNumericScore('76'), 76);
    assert.equal(formatCanonicalScore(0), '0/100');
    assert.equal(formatCanonicalScore('76'), '76/100');

    const pageSrc = readSrc('src/app/page.tsx');
    assert.ok(!pageSrc.includes("String(a.score || '0').replace(/[^0-9.]/g, '')"), '76100 score concatenation bug must be removed');
    assert.ok(!pageSrc.includes('{report.score}p'), '{report.score}p must be replaced with numeric score');
    assert.ok(!pageSrc.includes('{item.score}p'), '{item.score}p must be replaced with numeric score');
    assert.ok(pageSrc.includes('parseNumericScore'), 'page.tsx must use parseNumericScore');

    const cockpitSrc = readSrc('src/app/components/market-cockpit.tsx');
    assert.ok(cockpitSrc.includes('formatCanonicalScore(rep.score)'), 'market-cockpit must format rep.score canonically');

    const simplySrc = readSrc('src/app/simply/simply-view.tsx');
    assert.ok(!simplySrc.includes('isNaN(auditScore) || auditScore <= 0'), '0 score must not trigger falsy fallback in 8.2');
    assert.ok(!simplySrc.includes('Number.isFinite(parsedSc) && parsedSc > 0 ? parsedSc : 65'), '0 score must not trigger falsy 65 fallback in probabilisticEdge');
  });

  it('3. KRİTİK-10 & YÜKSEK-11 & YÜKSEK-12: Hyperlinks, accordion IDs, insurance EBITDA uniqueness, rAF & cleanMarkdown $$', () => {
    const simplySrc = readSrc('src/app/simply/simply-view.tsx');
    assert.ok(!simplySrc.includes("accordionSecId: 'yukumluluk'"), 'Non-existent accordionSecId yukumluluk must be removed');
    assert.ok(!simplySrc.includes("highlightId: 'fin-row-financial_debt'"), 'Non-existent fin-row-financial_debt must be removed');
    assert.ok(simplySrc.includes("accordionSecIds: ['kvy', 'uvy']"), 'Finansal Borçlar must expand kvy and uvy');
    assert.ok(simplySrc.includes("accordionSecId: 'ozkaynak'"), 'Özkaynak must expand ozkaynak');
    assert.ok(simplySrc.includes("highlightId: 'fin-row-debt_to_ebitda'"), 'Net Borç / FAVÖK must route directly to ratios table');
    assert.ok(simplySrc.includes("grandTotalKey: currentSector === 'INSURANCE' ? undefined : 'ebitda'"), 'INSURANCE must not emit duplicate fin-row-ebitda');
    assert.ok(simplySrc.includes('sec.grandTotalLabel && sec.grandTotalKey && ('), 'grandTotal row must guard sec.grandTotalKey');
    assert.ok(simplySrc.includes('id={`fin-row-${row.key}`}'), 'ratios rows must have DOM id for cross-reference highlighting');
    assert.ok(simplySrc.includes('window.requestAnimationFrame') && !simplySrc.includes('}, 110);'), 'rAF must replace 110ms setTimeout race condition');
    assert.ok(simplySrc.includes(String.raw`\$\$`), 'cleanMarkdown regex must escape $$');
    assert.ok(!simplySrc.includes('scroll-mt-6'), 'All section targets must exceed sticky header height (scroll-mt-28)');

    const radarSrc = readSrc('src/app/simply/snowflake-radar.tsx');
    assert.ok(radarSrc.includes("sectionId: 'sec-adildeger'") && !radarSrc.includes("sectionId: 'sec-rehberlik'"), 'future axis must map to sec-adildeger');
    assert.ok(radarSrc.includes("sectionId: 'sec-grafikler'") && !radarSrc.includes("sectionId: 'sec-gecmis'"), 'past axis must map to sec-grafikler');
    assert.ok(radarSrc.includes('useId') && !radarSrc.includes('id="sfGlow"'), 'SnowflakeRadar must scope SVG IDs per instance');
    assert.ok(radarSrc.includes('.slice(0, 5)') && !radarSrc.includes('.slice(0, 4)'), '5-letter BIST tickers must not be truncated');
  });

  it('4. KRİTİK-11 & KRİTİK-12: State isolation, SimplyView key, AbortController, loadingKapQual reset & price/PDF leak guards', () => {
    const pageSrc = readSrc('src/app/page.tsx');
    const simplySrc = readSrc('src/app/simply/simply-view.tsx');

    assert.ok(pageSrc.includes('key={activeReport.id}'), 'SimplyView must be keyed by activeReport.id');
    assert.ok(pageSrc.includes('initialTab={activeTab}'), 'SimplyView must receive initialTab');
    assert.ok(!pageSrc.includes('setStep((currentStep) => {\n      if (currentStep !== \'report\') {\n        setPreviousNavState'), 'setStep updater must not trigger nested setPreviousNavState');
    assert.ok(pageSrc.includes('setPrice(targetReport?.price || \'\')'), 'openReport must reset price even when targetReport.price is empty');
    assert.ok(pageSrc.includes('if (!isSameFormTicker) {') && pageSrc.includes('setActivityFiles([])'), 'handleBistDirectAnalysis must clear previous uploaded PDFs across tickers');

    assert.ok(simplySrc.includes('new AbortController()'), 'SimplyView live fetch effect must use AbortController');
    assert.ok(simplySrc.includes('setLoadingKapQual(false);'), 'SimplyView must reset loadingKapQual at effect start');
    assert.ok(simplySrc.includes('setPeriodOffset(0)') && simplySrc.includes('setSelectedTableTab(\'bs\')') && simplySrc.includes('setIsCapAllocExpanded(false)'), 'SimplyView reset effect must clear table/accordion/sector states');
  });

  it('5. YÜKSEK-13..19 & ORTA-09..10: Parse safety, no synthetic fallbacks, theme CSS, popstate, .IS routes & modals', () => {
    assert.equal(parseFinancialNumber('145.50 TL'), 145.5);
    assert.equal(parseFinancialNumber('1.250,50'), 1250.5);
    assert.equal(parsePeriodSortKey('2026/09'), 202609);
    assert.ok(formatAnalysisDate('2026-11-21T06:00:00.000Z').length >= 4);

    const simplySrc = readSrc('src/app/simply/simply-view.tsx');
    assert.ok(!simplySrc.includes('Math.abs(num) >= 50_000'), 'formatTableNumber must use consistent Bin TRY /1000 scaling');
    assert.ok(!simplySrc.includes('d.revenue * 0.4') && !simplySrc.includes('d.equity * 0.6'), 'sparklineMetrics must not synthesize fake 40%/60% fallbacks');
    assert.ok(!simplySrc.includes('marketMultiples?.pe || 8.5') && !simplySrc.includes('pe || 9.2'), 'peerComparisonData must not invent 8.5x/9.2x PE multiples');
    assert.ok(!simplySrc.includes('c.rawVal != null ? Number(c.rawVal) : 35.0'), 'Free float card must not invent fake 35.0%');
    assert.ok(simplySrc.includes('const canonicalBearPrice = useMemo'), '4.1, 7.1 and 8.2 must share canonicalBearPrice');

    const pageSrc = readSrc('src/app/page.tsx');
    assert.ok(pageSrc.includes('ComponentErrorBoundary fallbackTitle="Piyasa Kokpiti Hatası"'), 'MarketCockpit must be wrapped in ComponentErrorBoundary');
    assert.ok(pageSrc.includes("createdAt: new Date().toISOString()"), 'handleEvaluate must save createdAt in ISO-8601 format');
    assert.ok(pageSrc.includes("[sec]: prev[sec] === undefined ? true : !prev[sec]"), 'toggleSector must expand on first click');
    assert.ok(pageSrc.includes('isHandlingPopStateRef'), 'popstate handling must preserve browser forward history');
    assert.ok(pageSrc.includes('{deduplicatedForThemes.length}'), 'Themes TÜMÜ badge must show deduplicated company count');

    const cockpitSrc = readSrc('src/app/components/market-cockpit.tsx');
    assert.ok(cockpitSrc.includes('hasExternalUrl') && !cockpitSrc.includes("news.kapUrl || news.url || '#'"), 'Invalid news links must not render href="#"');
    assert.ok(cockpitSrc.includes("!favoriteTickers.some(t => t.toUpperCase() === clean)"), 'Cockpit + Ekle must not silently remove existing favorites');

    const spotlightSrc = readSrc('src/app/components/spotlight-search.tsx');
    assert.ok(spotlightSrc.includes('parsePeriodSortKey') && spotlightSrc.includes('savedTickerSet') && spotlightSrc.includes("scrollIntoView({ block: 'nearest' })"));

    const loginSrc = readSrc('src/app/components/login-modal.tsx');
    assert.ok(loginSrc.includes("sessionStorage.setItem('fair_value_user'") && loginSrc.includes('infoMessage') && loginSrc.includes("'demo@fairvalue.com.tr'"));

    for (const r of ['simply', 'report', 'analysis']) {
      const routeSrc = readSrc(`src/app/${r}/[ticker]/page.tsx`);
      assert.ok(routeSrc.includes(".replace(/\\.IS$/i, '')"), `${r}/[ticker]/page.tsx must strip .IS suffix`);
    }

    const cssSrc = readSrc('src/app/globals.css');
    for (const hex of ['bg-[#101319]', 'bg-[#161a23]', 'bg-[#1d222e]', 'bg-[#111419]', 'bg-[#13161b]', 'bg-[#242a38]', 'bg-[#191d26]', 'bg-[#131720]', 'bg-[#161a22]']) {
      assert.ok(cssSrc.includes(hex), `globals.css light theme must override ${hex}`);
    }
  });
});
