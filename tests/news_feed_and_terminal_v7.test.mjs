import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Import news service functions
import {
  getCompanyNewsFeed,
  getNewsCategories,
  OFFICIAL_BIST_NEWS_FEED,
  fetchLiveBistNewsFeed,
  formatPriceSensitiveText,
  calculateTimeAgo,
  categorizeDisclosure
} from '../lib/news-service.ts';

test('Company News Feed and Terminal V7 Enhancements Test Suite', async (t) => {
  await t.test('1. Zero Mock Data Principle: Feed is empty when no analyzed companies are supplied', async () => {
    // Statik mock veriler tamamen silindi
    assert.equal(OFFICIAL_BIST_NEWS_FEED.length, 0, 'No hardcoded mock data in OFFICIAL_BIST_NEWS_FEED');
    const emptyFeed = await fetchLiveBistNewsFeed();
    assert.equal(emptyFeed.length, 0, 'Must return empty array when no analyzed tickers are provided');
    const emptyWithTickers = await fetchLiveBistNewsFeed({ tickers: [] });
    assert.equal(emptyWithTickers.length, 0, 'Must return empty array for empty ticker list');
  });

  await t.test('2. Live Feed for Analyzed Tickers: Fetches real BIST disclosures when tickers provided', async () => {
    const liveItems = await fetchLiveBistNewsFeed({ tickers: ['THYAO'] });
    assert.ok(liveItems.length >= 1, 'Expected at least 1 real disclosure for THYAO');
    assert.ok(liveItems.every(item => item.ticker === 'THYAO'), 'All items must belong to THYAO');
    assert.ok(
      liveItems[0].url.startsWith('https://www.kap.org.tr/'),
      'Must point to official KAP disclosures URL'
    );
  });

  await t.test('3. Price-Sensitive Formatting: Bolds monetary amounts, percentages and lot counts', () => {
    const raw1 = '120 milyon dolar tutarında yeni sözleşme imzalandı.';
    const formatted1 = formatPriceSensitiveText(raw1);
    assert.ok(formatted1.includes('**120 milyon dolar**'), 'Must bold currency and amount');

    const raw2 = 'Net kâr yıllık bazda %40 geriledi, 118,2 Milyar TL olarak gerçekleşti.';
    const formatted2 = formatPriceSensitiveText(raw2);
    assert.ok(formatted2.includes('**%40**'), 'Must bold percentage');
    assert.ok(formatted2.includes('**118,2 Milyar TL**'), 'Must bold TL amount');

    const raw3 = '36.532 adet pay 33,33 TL ortalama fiyattan geri alındı.';
    const formatted3 = formatPriceSensitiveText(raw3);
    assert.ok(formatted3.includes('**36.532 adet**'), 'Must bold lot/share count');
    assert.ok(formatted3.includes('**33,33 TL**'), 'Must bold price');
  });

  await t.test('4. getNewsCategories aggregates count correctly matching active feed', () => {
    const sampleFeed = [
      { id: '1', ticker: 'THYAO', companyName: 'THY', title: 'T', summary: 'S', category: 'CONTRACT', categoryLabel: 'Yeni İş', source: 'KAP', publishDate: new Date().toISOString(), timeAgo: 'Yeni', impact: 'HIGH_IMPACT', url: 'https://kap' },
      { id: '2', ticker: 'FROTO', companyName: 'Ford', title: 'T', summary: 'S', category: 'DIVIDEND', categoryLabel: 'Temettü', source: 'KAP', publishDate: new Date().toISOString(), timeAgo: 'Yeni', impact: 'HIGH_IMPACT', url: 'https://kap' }
    ];
    const categories = getNewsCategories(sampleFeed);
    assert.ok(categories.length >= 6);
    const allCat = categories.find(c => c.id === 'ALL');
    assert.ok(allCat);
    assert.equal(allCat.count, 2);
    const contractCat = categories.find(c => c.id === 'CONTRACT');
    assert.equal(contractCat?.count, 1);
  });

  await t.test('5. Typography: IBM Plex Sans is enforced in globals.css (no serif font override)', () => {
    const rootCss = fs.readFileSync(path.resolve('app/globals.css'), 'utf-8');
    const srcCss = fs.readFileSync(path.resolve('src/app/globals.css'), 'utf-8');

    // Root check
    assert.ok(rootCss.includes("--font-sans: var(--font-ibm-plex-sans), 'IBM Plex Sans'"));
    assert.ok(rootCss.includes("--font-serif: var(--font-ibm-plex-sans), 'IBM Plex Sans'"));
    assert.ok(rootCss.includes("h1, h2, h3, h4, .font-serif {\n  font-family: var(--font-ibm-plex-sans), 'IBM Plex Sans'"));

    // Sync check
    assert.equal(rootCss, srcCss, 'app/globals.css and src/app/globals.css must be identical');
  });

  await t.test('6. Dual Directory Rule: app/page.tsx and src/app/page.tsx parity', () => {
    const rootPage = fs.readFileSync(path.resolve('app/page.tsx'), 'utf-8');
    const srcPage = fs.readFileSync(path.resolve('src/app/page.tsx'), 'utf-8');
    assert.equal(rootPage, srcPage, 'app/page.tsx and src/app/page.tsx must be identical');
  });

  await t.test('7. Dual Directory Rule: lib/news-service.ts and src/lib/news-service.ts parity', () => {
    const rootService = fs.readFileSync(path.resolve('lib/news-service.ts'), 'utf-8');
    const srcService = fs.readFileSync(path.resolve('src/lib/news-service.ts'), 'utf-8');
    assert.equal(rootService, srcService, 'lib/news-service.ts and src/lib/news-service.ts must be identical');
  });
});
