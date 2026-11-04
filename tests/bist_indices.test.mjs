import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isBist30,
  isBist50,
  isBist100,
  isBistNon100,
  getBistIndexCategory,
  getBistIndexBadge,
  matchesIndexFilter,
  OFFICIAL_BIST_30_TICKERS,
  OFFICIAL_BIST_50_TICKERS,
  OFFICIAL_BIST_100_TICKERS
} from '../lib/bist-indices.ts';

test('BIST Index Architecture & Screener Filtering Tests', async (t) => {
  await t.test('BIST 30 count and major constituents check', () => {
    assert.equal(OFFICIAL_BIST_30_TICKERS.length, 30);
    assert.equal(isBist30('THYAO'), true);
    assert.equal(isBist30('GARAN'), true);
    assert.equal(isBist30('AKBNK'), true);
    assert.equal(isBist30('TCELL'), true);
    assert.equal(isBist30('TUPRS'), true);
    assert.equal(isBist30('BIMAS'), true);
    assert.equal(isBist30('DOCO'), false); // Not in BIST 30
  });

  await t.test('BIST 50 constituents include BIST 30 plus mid-caps', () => {
    assert.equal(OFFICIAL_BIST_50_TICKERS.length, 50);
    assert.equal(isBist50('THYAO'), true);
    assert.equal(isBist50('ULKER'), true);
    assert.equal(isBist50('TURSG'), true);
    assert.equal(isBist50('HALKB'), true);
    assert.equal(isBist50('CVKMD'), true);
  });

  await t.test('BIST 100 constituents and non-100 classification', () => {
    assert.ok(OFFICIAL_BIST_100_TICKERS.length >= 100);
    assert.equal(isBist100('THYAO'), true);
    assert.equal(isBist100('AGESA'), false); // AGESA is outside BIST 100
    assert.equal(isBistNon100('AGESA'), true);
    assert.equal(isBistNon100('ORGE'), true);
    assert.equal(isBistNon100('DESA'), true);
    assert.equal(isBistNon100('THYAO'), false);
  });

  await t.test('matchesIndexFilter correctly filters across all 5 index modes', () => {
    // Mode: ALL
    assert.equal(matchesIndexFilter('THYAO', 'ALL'), true);
    assert.equal(matchesIndexFilter('AGESA', 'ALL'), true);
    assert.equal(matchesIndexFilter('ORGE', 'ALL'), true);

    // Mode: BIST30
    assert.equal(matchesIndexFilter('THYAO', 'BIST30'), true);
    assert.equal(matchesIndexFilter('AGESA', 'BIST30'), false);

    // Mode: BIST50
    assert.equal(matchesIndexFilter('THYAO', 'BIST50'), true);
    assert.equal(matchesIndexFilter('ULKER', 'BIST50'), true);
    assert.equal(matchesIndexFilter('ORGE', 'BIST50'), false);

    // Mode: BIST100
    assert.equal(matchesIndexFilter('THYAO', 'BIST100'), true);
    assert.equal(matchesIndexFilter('VESTL', 'BIST100'), true);
    assert.equal(matchesIndexFilter('ORGE', 'BIST100'), false);

    // Mode: BIST_NON100
    assert.equal(matchesIndexFilter('THYAO', 'BIST_NON100'), false);
    assert.equal(matchesIndexFilter('ORGE', 'BIST_NON100'), true);
    assert.equal(matchesIndexFilter('AGESA', 'BIST_NON100'), true);
    assert.equal(matchesIndexFilter('DESA', 'BIST_NON100'), true);
  });

  await t.test('getBistIndexBadge provides distinct tags and Tailwind classes', () => {
    const b30 = getBistIndexBadge('THYAO');
    assert.equal(b30.label, 'BIST 30');
    assert.ok(b30.badgeClass.includes('indigo'));

    const b100 = getBistIndexBadge('VESTL');
    assert.equal(b100.label, 'BIST 100');
    assert.ok(b100.badgeClass.includes('sky') || b100.badgeClass.includes('cyan'));

    const non100 = getBistIndexBadge('ORGE');
    assert.equal(non100.label, 'BIST 100 Dışı');
    assert.ok(non100.badgeClass.includes('slate'));
  });
});
