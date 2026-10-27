import { fetchAndAnalyzeBistCompany } from '../lib/bist-service.ts';
import { computeSnowflakeAnalysis } from '../lib/snowflake.ts';

async function main() {
  console.log('Fetching MPARK data...');
  const data = await fetchAndAnalyzeBistCompany('MPARK', { forceRefresh: false });

  console.log('\n=== MPARK BASIC INFO ===');
  console.log('Ticker:', data.ticker);
  console.log('Company:', data.company_name);
  console.log('Current Price:', data.current_price);
  console.log('Share Count:', data.share_count);
  console.log('Market Cap:', (data.current_price || 0) * (data.share_count || 0));

  console.log('\n=== VALUATION ===');
  console.log('Fair Value:', data.valuation?.fair_value);
  console.log('Discount %:', data.valuation?.discount_pct);
  console.log('Final Decision:', data.valuation?.final_decision);

  console.log('\n=== UNIFIED METRICS ===');
  console.log('YoY Revenue Growth:', data.unified_metrics?.growth?.revenueGrowthYoY);
  console.log('YoY Net Income Growth:', data.unified_metrics?.growth?.netIncomeGrowthYoY);
  console.log('P/E:', data.unified_metrics?.valuation?.pe);
  console.log('P/B:', data.unified_metrics?.valuation?.pb);
  console.log('ROE:', data.unified_metrics?.margins?.roe);
  console.log('Current Ratio:', data.unified_metrics?.liquidity?.currentRatio);

  const sf = computeSnowflakeAnalysis({
    ticker: data.ticker,
    sector: data.sector,
    currentPrice: data.current_price,
    fairValue: data.valuation?.fair_value,
    discountPct: data.valuation?.discount_pct,
    marketMultiples: data.market_multiples,
    companyMultiples: undefined,
    financialHistory: data.financial_history,
    valuationDrivers: data.drivers,
    unifiedMetrics: data.unified_metrics,
    latestData: data.financial_history?.[data.financial_history.length - 1],
    consensusTarget: data.consensus_target?.targetPrice,
    dividends: data.dividend_history
  });

  console.log('\n=== SNOWFLAKE SCORES ===');
  console.log(`Total Score: ${sf.totalScore} / 30 (${sf.percentage}%)`);
  
  for (const [key, axis] of Object.entries(sf.axes)) {
    console.log(`\n======================================================`);
    console.log(`🎯 EKSEN: [${key.toUpperCase()}] ${axis.label} (${axis.score}/6)`);
    console.log(`======================================================`);
    for (const c of axis.checks) {
      console.log(`[${c.passed ? '✓ PASS' : '✗ FAIL'}] ${c.title} (ID: ${c.id})`);
      console.log(`      Gerçekleşen: ${c.metricValue}`);
      console.log(`      Eşik:        ${c.threshold}`);
      console.log(`      Açıklama:    ${c.detail}`);
    }
  }

  console.log('\n=== REWARDS ===');
  for (const r of sf.rewards) console.log('+', r);

  console.log('\n=== RISKS ===');
  for (const r of sf.risks) console.log('-', r);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
