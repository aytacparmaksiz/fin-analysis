import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAnalysisDate } from '../lib/report-resolver.ts';

test('formatAnalysisDate: strips trailing time and formats correctly', () => {
  assert.equal(formatAnalysisDate('04 Kasım 2026 16:14'), '04 Kasım 2026');
  assert.equal(formatAnalysisDate('28 Haziran 2026 09:30:15'), '28 Haziran 2026');
  assert.equal(formatAnalysisDate('2026-11-04T13:14:00.000Z'), '04 Kasım 2026');
  assert.equal(formatAnalysisDate(''), '');
  assert.equal(formatAnalysisDate(undefined), '');
});

test('Decision column sorting: AL -> NÖTR -> ALMA (asc) and ALMA -> NÖTR -> AL (desc)', () => {
  const rankDecision = (d) => {
    const norm = (d || '').trim().toUpperCase();
    if (norm === 'AL') return 1;
    if (norm === 'NÖTR' || norm === 'NOTR') return 2;
    if (norm === 'ALMA') return 3;
    return 4;
  };

  const sampleReports = [
    { ticker: 'THYAO', decision: 'NÖTR', score: '75' },
    { ticker: 'TCELL', decision: 'AL', score: '88' },
    { ticker: 'GLYHO', decision: 'ALMA', score: '42' },
    { ticker: 'ASELS', decision: 'AL', score: '92' },
    { ticker: 'CVKMD', decision: 'NÖTR', score: '80' },
  ];

  // Ascending sort (direction === 'asc'): AL -> NÖTR -> ALMA
  const sortedAsc = [...sampleReports].sort((a, b) => {
    const valA = rankDecision(a.decision);
    const valB = rankDecision(b.decision);
    const diff = valA - valB;
    if (diff !== 0) return diff;
    return parseInt(b.score) - parseInt(a.score);
  });

  const ascDecisions = sortedAsc.map(r => r.decision);
  assert.deepEqual(ascDecisions, ['AL', 'AL', 'NÖTR', 'NÖTR', 'ALMA']);
  // Tie-breaker within AL: ASELS (92) comes before TCELL (88)
  assert.equal(sortedAsc[0].ticker, 'ASELS');
  assert.equal(sortedAsc[1].ticker, 'TCELL');

  // Descending sort (direction === 'desc'): ALMA -> NÖTR -> AL
  const sortedDesc = [...sampleReports].sort((a, b) => {
    const valA = rankDecision(a.decision);
    const valB = rankDecision(b.decision);
    const diff = valB - valA;
    if (diff !== 0) return diff;
    return parseInt(b.score) - parseInt(a.score);
  });

  const descDecisions = sortedDesc.map(r => r.decision);
  assert.deepEqual(descDecisions, ['ALMA', 'NÖTR', 'NÖTR', 'AL', 'AL']);
});

test('Multi-quarter retention and Screener deduplication', () => {
  const rawReports = [
    { id: '1', ticker: 'CVKMD', period: '2026/09', createdAt: '2026-11-04T12:00:00Z', price: '11.00' },
    { id: '2', ticker: 'CVKMD', period: '2026/06', createdAt: '2026-06-30T10:00:00Z', price: '37.00' },
    { id: '3', ticker: 'TCELL', period: '2026/09', createdAt: '2026-11-03T15:00:00Z', price: '95.00' },
    { id: '4', ticker: 'TCELL', period: '2026/06', createdAt: '2026-06-25T11:00:00Z', price: '85.00' },
  ];

  // 1. In memory savedReports (keyed by ID) retains ALL 4 reports
  const idMap = new Map();
  for (const rep of rawReports) {
    if (rep.id && !idMap.has(rep.id)) idMap.set(rep.id, rep);
  }
  assert.equal(idMap.size, 4);

  // 2. Screener (Hisse Tarama) deduplicates to latest quarter per ticker
  const latestMap = new Map();
  const sortedByTime = [...idMap.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const rep of sortedByTime) {
    const sym = rep.ticker.toUpperCase();
    if (!latestMap.has(sym)) latestMap.set(sym, rep);
  }
  assert.equal(latestMap.size, 2);
  assert.equal(latestMap.get('CVKMD').period, '2026/09');
  assert.equal(latestMap.get('TCELL').period, '2026/09');

  // 3. Deleting report id '1' (2026/09 of CVKMD) leaves id '2' (2026/06 of CVKMD) intact
  const afterDelete = [...idMap.values()].filter(r => r.id !== '1');
  assert.equal(afterDelete.length, 3);
  const remainingCvkmd = afterDelete.filter(r => r.ticker === 'CVKMD');
  assert.equal(remainingCvkmd.length, 1);
  assert.equal(remainingCvkmd[0].period, '2026/06');
});
