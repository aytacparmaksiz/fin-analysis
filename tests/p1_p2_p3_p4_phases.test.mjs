import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Import modules to test
import { 
  optimizeFinalDecision, 
  calculateSectorScore, 
  detectValueTrap, 
  syncReportTextWithValuation,
  parsePeriodSortKey,
  parseFinancialNumber
} from '../lib/valuation.ts';

test('Phases P1-P2-P3-P4 Comprehensive Verification Suite', async (t) => {

  await t.test('1. Quarter Expansion & Auto-Discovery Batch Verification', () => {
    const bistContent = fs.readFileSync(path.resolve('lib/bist-service.ts'), 'utf8');
    
    // Batch 5 checks
    assert.ok(bistContent.includes('2022/06'), 'Batch must include 2022/06');
    assert.ok(bistContent.includes('2022/03'), 'Batch must include 2022/03');
    assert.ok(bistContent.includes('2021/12'), 'Batch must include 2021/12');
    assert.ok(bistContent.includes('2021/09'), 'Batch must include 2021/09');

    // Auto-discovery multi-batch probing checks
    assert.ok(
      bistContent.includes('BATCH_SPECS[0]') && bistContent.includes('BATCH_SPECS[1]'),
      'Auto-discovery must probe multiple batches to prevent delayed-reporting companies from dropping quarters'
    );

    // Period sorting
    const periods = ['2023/12', '2022/06', '2025/03', '2022/12', '2024/09', '2021/12'];
    const sorted = [...periods].sort((a, b) => parsePeriodSortKey(a) - parsePeriodSortKey(b));
    assert.deepEqual(sorted, ['2021/12', '2022/06', '2022/12', '2023/12', '2024/09', '2025/03']);
  });

  await t.test('2. P1 (Zero-Synthetic Data) Verification: No Heuristic Fabrications', () => {
    const bistContent = fs.readFileSync(path.resolve('lib/bist-service.ts'), 'utf8');
    const adapterContent = fs.readFileSync(path.resolve('lib/isyatirim-adapter.ts'), 'utf8');

    // Verify removed synthetic percentages in Yahoo fundamentals fallback
    assert.ok(!bistContent.includes('* 0.94'), 'Synthetic 0.94 multiplier must not exist');
    assert.ok(!bistContent.includes('* 0.82'), 'Synthetic 82% liability split must not exist');
    assert.ok(!bistContent.includes('* 0.65'), 'Synthetic 65% liability split must not exist');
    assert.ok(!bistContent.includes('Math.pow(0.84'), 'Synthetic 0.84 historical price decay must not exist');
    assert.ok(!bistContent.includes('* 1.15'), 'Synthetic 115% OCF multiplier must not exist');
    assert.ok(!bistContent.includes('* 0.85'), 'Synthetic 85% insurance technical profit must not exist');

    // Verify removed synthetic data in İş Yatırım adapter
    assert.ok(!adapterContent.includes('total_assets * 0.68'), 'Synthetic 68% banking current assets must not exist');
    assert.ok(!adapterContent.includes('gross_profit * 0.45'), 'Synthetic 45% operating profit must not exist');
    assert.ok(!adapterContent.includes('revenue * 0.05'), 'Synthetic 5% amortization must not exist');
    assert.ok(!adapterContent.includes('revenue * 0.04'), 'Synthetic 4% capex must not exist');
  });

  await t.test('3. P2 (Parity & Consolidation) Verification: 100% Mirror Parity', () => {
    const pairs = [
      ['lib/bist-service.ts', 'src/lib/bist-service.ts'],
      ['lib/isyatirim-service.ts', 'src/lib/isyatirim-service.ts'],
      ['lib/isyatirim-adapter.ts', 'src/lib/isyatirim-adapter.ts'],
      ['lib/valuation.ts', 'src/lib/valuation.ts'],
      ['lib/security.ts', 'src/lib/security.ts'],
      ['app/api/analyze/route.ts', 'src/app/api/analyze/route.ts'],
      ['app/page.tsx', 'src/app/page.tsx']
    ];

    for (const [f1, f2] of pairs) {
      const c1 = fs.readFileSync(path.resolve(f1), 'utf8');
      const c2 = fs.readFileSync(path.resolve(f2), 'utf8');
      assert.strictEqual(c1, c2, `Files ${f1} and ${f2} must have 100% exact parity`);
    }

    // Number precision assertions
    assert.strictEqual(parseFinancialNumber('1.234,56'), 1234.56);
    assert.strictEqual(parseFinancialNumber(null), null);
    assert.strictEqual(parseFinancialNumber('NaN'), null);
    assert.strictEqual(parseFinancialNumber('Infinity'), null);
  });

  await t.test('4. P3 (Robustness & Error Boundaries) Verification', () => {
    const pageContent = fs.readFileSync(path.resolve('app/page.tsx'), 'utf8');
    const simplyContent = fs.existsSync(path.resolve('app/simply/simply-view.tsx'))
      ? fs.readFileSync(path.resolve('app/simply/simply-view.tsx'), 'utf8')
      : '';
    const combinedContent = pageContent + simplyContent;

    assert.ok(pageContent.includes('class ComponentErrorBoundary'), 'ComponentErrorBoundary must be defined in app/page.tsx');
    assert.ok(combinedContent.includes('fallbackTitle="Özet Panosu Hatası"'), 'Özet tab must be wrapped with ErrorBoundary');
    assert.ok(combinedContent.includes('fallbackTitle="Grafik Terminali Hatası"'), 'Overview tab must be wrapped with ErrorBoundary');
    assert.ok(combinedContent.includes('fallbackTitle="Finansal Tablolar Hatası"'), 'Tables tab must be wrapped with ErrorBoundary');
    assert.ok(combinedContent.includes('fallbackTitle="Adil Değer Panosu Hatası"'), 'Fairvalue tab must be wrapped with ErrorBoundary');
    assert.ok(combinedContent.includes('fallbackTitle="Çarpan Analizi Hatası"'), 'Multiples tab must be wrapped with ErrorBoundary');
    assert.ok(combinedContent.includes('fallbackTitle="Güçlü/Zayıf Yönler Hatası"'), 'Proscons tab must be wrapped with ErrorBoundary');
    assert.ok(combinedContent.includes('fallbackTitle="Yönetim Hedefleri Hatası"'), 'Guidance tab must be wrapped with ErrorBoundary');
    assert.ok(combinedContent.includes('fallbackTitle="Değerleme Raporu Hatası"'), 'Report tab must be wrapped with ErrorBoundary');
    assert.ok(combinedContent.includes('fallbackTitle="Geçmiş Raporlar Hatası"'), 'History tab must be wrapped with ErrorBoundary');
  });

  await t.test('5. P4 (Decision Engine Harmonization - SAHOL Contradiction Resolution)', () => {
    // SAHOL Scenario:
    // Conglomerate holding with substantial NAV discount (+77.0%), positive equity (150B TRY),
    // consolidated debt within conglomerate norms (Akbank & industrials consolidated), ROIC 9.1% vs WACC 15.3%.
    const saholLatestData = {
      period: '2025/06',
      equity: 150000000000,
      net_debt: 75000000000, // Consolidated: 75B / 150B = 0.50x
      ebitda: 25000000000,
      net_income: 18000000000,
      roic: 9.1,
      benchmark_wacc: 15.3,
      holding_discount: 43.5, // 43.5% NAV discount
      nav_discount: 43.5
    };

    // 1. Value Trap Check for Holding:
    // Holding companies should NOT be falsely flagged as industrial Value Trap due to ROIC < WACC!
    const valueTrapCheck = detectValueTrap(
      [
        { period: '2024/12', ebitda: 22000000000, revenue: 120000000000, roic: 9.5 },
        { period: '2025/03', ebitda: 24000000000, revenue: 130000000000, roic: 9.3 },
        saholLatestData
      ],
      100.0,
      177.0, // +77% fair value upside
      'HOLDING',
      saholLatestData
    );
    assert.strictEqual(valueTrapCheck.isValueTrap, false, 'Solvent holding company must not be falsely flagged as Value Trap for ROIC < WACC');

    // 2. Decision Optimization Harmonization Check:
    // Even if raw LLM decision was mistakenly "ALMA", a solvent holding company with +77% upside
    // must NEVER be left as "ALMA (UNSAFE)" with false capital loss warnings.
    const valuationObj = {
      current_price: 100.0,
      fair_value: 177.0,
      discount_pct: 77.0,
      margin_of_safety: 77.0,
      margin_of_safety_status: 'SAFE',
      is_insolvent: false
    };

    const optResultAlma = optimizeFinalDecision({
      rawDecision: 'ALMA', // Contradictory raw rating
      score: 72,
      valuation: valuationObj,
      marketPrice: 100.0,
      fairValue: 177.0,
      latestData: saholLatestData,
      sector: 'HOLDING'
    });

    // Assert that the contradiction is resolved:
    assert.notStrictEqual(optResultAlma.finalDecision, 'ALMA', 'Solvent company with +77% upside must NEVER receive ALMA rating');
    assert.strictEqual(optResultAlma.finalDecision, 'NÖTR', 'Decision must be harmonized to NÖTR (Conditional Monitoring)');
    assert.strictEqual(optResultAlma.marginOfSafetyStatus, 'SAFE', 'Margin of safety status must be preserved as SAFE for 77% discount');
    assert.strictEqual(optResultAlma.marginOfSafety, 77.0, 'Margin of safety must retain the 77% discount');
    assert.ok(!valuationObj.boundary_warning?.includes('Sermaye Kaybı & Risk Uyarısı: Şirket ALMA'), 'Must NOT slap capital loss UNSAFE warning on 77% discounted solvent stock');

    // Check with rawDecision: 'AL' (Safe holding debt ratio 0.50x <= 0.60x preserves AL with SAFE margin of safety)
    const optResultAl = optimizeFinalDecision({
      rawDecision: 'AL',
      score: 82,
      valuation: { ...valuationObj },
      marketPrice: 100.0,
      fairValue: 177.0,
      latestData: saholLatestData,
      sector: 'HOLDING'
    });
    assert.strictEqual(optResultAl.finalDecision, 'AL', 'Safe holding with high score and discount preserves AL rating');
    assert.strictEqual(optResultAl.marginOfSafetyStatus, 'SAFE', 'Margin of safety status is SAFE');

    // 3. Report Text Synchronization Check:
    const mockReportText = `
### VI. Temel Riskler, Katalizörler ve Nihai Karar
Analist Kararı: [ALMA]
Yatırım Tezi: Şirket cazip görünmektedir.
`;
    const syncedReport = syncReportTextWithValuation(mockReportText, {
      ...valuationObj,
      final_decision: optResultAlma.finalDecision
    });

    assert.ok(syncedReport.includes('Analist Kararı: **[NÖTR]**'), 'Report text must synchronize to [NÖTR], eliminating contradiction');
    assert.ok(!syncedReport.includes('Analist Kararı: [ALMA]'), 'Contradictory ALMA must be replaced in report text');
  });

});
