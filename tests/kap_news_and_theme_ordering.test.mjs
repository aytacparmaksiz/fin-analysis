import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { getKapCompanyDisclosuresUrl, getKapCompanySummaryUrl, getKapOid } from '../lib/kap-mapping.ts';
import { OFFICIAL_BIST_NEWS_FEED, getCompanyNewsFeed, fetchLiveBistNewsFeed } from '../lib/news-service.ts';
import { categorizeCompany, THEME_CANONICAL_ORDER } from '../lib/company-categorizer.ts';
import { getCompanySectorDisplayName } from '../lib/sectors.ts';

test('1. KAP URL and Official News Feed Integrity', async () => {
  // Test THYAO KAP OID
  const thyaoOid = getKapOid('THYAO');
  assert.equal(thyaoOid, '4028e4a140f2ed720140f376bebb01a7', 'THYAO must map to official KAP member OID');

  const thyaoUrl = getKapCompanyDisclosuresUrl('THYAO');
  assert.equal(thyaoUrl, 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a140f2ed720140f376bebb01a7');

  // Verify zero mock data rule
  const emptyFeed = await fetchLiveBistNewsFeed();
  assert.equal(emptyFeed.length, 0, 'Must return empty array when no analyzed tickers provided (Zero Mock Data)');

  // Verify live feed parser works for analyzed companies
  const liveFeed = await fetchLiveBistNewsFeed({ tickers: ['THYAO', 'ASELS'] });
  assert.ok(liveFeed.length >= 1, 'Live feed must return real BIST KAP items for analyzed tickers');
  liveFeed.forEach(item => {
    assert.ok(item.ticker, 'Live item must have ticker');
    assert.ok(item.title, 'Live item must have title');
    assert.ok(
      item.url.startsWith('https://www.kap.org.tr/tr/sirket-bildirimleri/') ||
      item.url.startsWith('https://www.kap.org.tr/tr/Bildirim/'),
      'Live item must have valid KAP URL'
    );
    assert.ok(!item.url.includes('/ozet/thyao'), 'Must never have invalid /ozet/ticker url');
  });
});

test('2. Theme Canonical Ordering Consistency', () => {
  // Mock company that triggers multiple themes (Defensive, Cash Cow, Growth, High ROIC)
  const mockReport = {
    id: 'mock-1',
    ticker: 'THYAO',
    price: '290',
    fairValue: '380',
    decision: 'AL',
    createdAt: new Date().toISOString(),
    report: 'test report',
    extractedData: {
      fair_value_drivers: {
        revenue_growth: { value: 45.0 },
      },
      financial_history: [
        {
          period: '2025/12',
          revenue: 1000000,
          ebitda: 200000,
          net_income: 150000,
          roe: 32,
          roic: 22,
          net_debt: -250000,
          free_cash_flow: 85000,
          operating_cash_flow: 140000
        }
      ]
    }
  };

  const matches = categorizeCompany(mockReport);
  assert.equal(matches.length, 4, 'Should match 4 themes');
  assert.deepEqual(
    matches.map(m => m.shortLabel),
    ['Nakit Kalesi', 'Nakit Akışı', 'Hızlı Büyüme', 'Yüksek ROIC'],
    'Themes must follow the exact canonical order requested by user'
  );
});

test('3. Sector Display Resolution (Never bare BIST)', () => {
  assert.equal(getCompanySectorDisplayName('THYAO'), 'Havacılık');
  assert.equal(getCompanySectorDisplayName('PGSUS'), 'Havacılık');
  assert.equal(getCompanySectorDisplayName('FROTO'), 'Otomotiv');
  assert.equal(getCompanySectorDisplayName('TOASO'), 'Otomotiv');
  assert.equal(getCompanySectorDisplayName('ASELS'), 'Savunma');
  assert.equal(getCompanySectorDisplayName('TUPRS'), 'Petrol');
  assert.equal(getCompanySectorDisplayName('EREGL'), 'Demir-Çelik Temel');
  assert.equal(getCompanySectorDisplayName('SISE'), 'Cam Sanayii');
  assert.equal(getCompanySectorDisplayName('BIMAS'), 'Gıda & Ticaret Perakende');
  assert.equal(getCompanySectorDisplayName('AGESA'), 'Sigortacılık');
  assert.equal(getCompanySectorDisplayName('GARAN'), 'Bankacılık');
  assert.equal(getCompanySectorDisplayName('EKGYO'), 'GYO');
  assert.equal(getCompanySectorDisplayName('KCHOL'), 'Holding');
  assert.equal(getCompanySectorDisplayName('TCELL'), 'İletişim');
  assert.equal(getCompanySectorDisplayName('LOGO'), 'Teknoloji');
  assert.equal(getCompanySectorDisplayName('MPARK'), 'Sağlık ve İlaç');

  // Generic fallback tests
  assert.equal(getCompanySectorDisplayName('UNKNOWN', 'TECH'), 'Teknoloji & Yazılım');
  assert.equal(getCompanySectorDisplayName('UNKNOWN', 'BANKING'), 'Bankacılık');
  assert.notEqual(getCompanySectorDisplayName('UNKNOWN', 'BIST'), 'BIST');
});

test('4. UI Cleanliness: Text Removal and Parity', () => {
  const pageRoot = fs.readFileSync('app/page.tsx', 'utf-8');
  const pageSrc = fs.readFileSync('src/app/page.tsx', 'utf-8');

  const forbiddenText = 'Birden fazla temaya tıklayarak kesişim (AND) filtrelemesi uygulayabilirsiniz';
  assert.ok(!pageRoot.includes(forbiddenText), 'Root page must not contain kesişim filter info text');
  assert.ok(!pageSrc.includes(forbiddenText), 'Src page must not contain kesişim filter info text');

  assert.equal(pageRoot, pageSrc, 'app/page.tsx and src/app/page.tsx must have 100% parity');
});
