import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Import news service functions
import { getCompanyNewsFeed, getNewsCategories, OFFICIAL_BIST_NEWS_FEED } from '../lib/news-service.ts';

test('Company News Feed and Terminal V7 Enhancements Test Suite', async (t) => {
  await t.test('1. getCompanyNewsFeed returns all items when unfiltered', () => {
    const feed = getCompanyNewsFeed();
    assert.equal(feed.length, OFFICIAL_BIST_NEWS_FEED.length);
    assert.ok(feed.length >= 10, 'Expected at least 10 news items');
  });

  await t.test('2. getCompanyNewsFeed filters by category accurately', () => {
    const divFeed = getCompanyNewsFeed({ category: 'DIVIDEND' });
    assert.ok(divFeed.length >= 1, 'Expected at least 1 dividend news item');
    assert.ok(divFeed.every(item => item.category === 'DIVIDEND'));

    const contractFeed = getCompanyNewsFeed({ category: 'CONTRACT' });
    assert.ok(contractFeed.length >= 2, 'Expected contracts in news feed');
    assert.ok(contractFeed.every(item => item.category === 'CONTRACT'));
  });

  await t.test('3. getCompanyNewsFeed filters by ticker case-insensitively', () => {
    const thyaoNews = getCompanyNewsFeed({ tickers: ['thyao'] });
    assert.ok(thyaoNews.length >= 1);
    assert.equal(thyaoNews[0].ticker, 'THYAO');

    const multiNews = getCompanyNewsFeed({ tickers: ['TUPRS', 'FROTO'] });
    assert.ok(multiNews.length >= 2);
    assert.ok(multiNews.every(item => ['TUPRS', 'FROTO'].includes(item.ticker)));
  });

  await t.test('4. getNewsCategories aggregates count correctly matching total', () => {
    const categories = getNewsCategories();
    assert.ok(categories.length >= 6);
    const allCat = categories.find(c => c.id === 'ALL');
    assert.ok(allCat);
    assert.equal(allCat.count, OFFICIAL_BIST_NEWS_FEED.length);
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
