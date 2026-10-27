import { fetchAndAnalyzeBistCompany } from '../lib/bist-service.ts';
import { computeSnowflakeAnalysis } from '../lib/snowflake.ts';

async function main() {
  console.log('Fetching TRGYO data...');
  const data = await fetchAndAnalyzeBistCompany('TRGYO', { forceRefresh: false });

  console.log('\n=== TRGYO BASIC INFO ===');
  console.log('Ticker:', data.ticker);
  console.log('Company:', data.company_name);
  console.log('Sector:', data.sector);
  console.log('Reporting Period:', data.reporting_period);
  console.log('Current Price:', data.current_price);
  console.log('Share Count:', data.share_count);
  console.log('Market Cap:', (data.current_price || 0) * (data.share_count || 0));

  console.log('\n=== MARKET MULTIPLES ===');
  console.log(JSON.stringify(data.market_multiples, null, 2));

  console.log('\n=== VALUATION ===');
  console.log('Fair Value:', data.valuation?.fair_value);
  console.log('Discount %:', data.valuation?.discount_pct);
  console.log('Final Decision:', data.valuation?.final_decision);
  console.log('Model Name:', data.valuation?.valuation_model_name);

  console.log('\n=== UNIFIED METRICS ===');
  console.log('TTM:', JSON.stringify(data.unified_metrics?.ttm, null, 2));
  console.log('Balance Sheet:', JSON.stringify(data.unified_metrics?.balanceSheet, null, 2));
  console.log('Valuation Multiples:', JSON.stringify(data.unified_metrics?.valuation, null, 2));
  console.log('Margins:', JSON.stringify(data.unified_metrics?.margins, null, 2));
  console.log('Liquidity:', JSON.stringify(data.unified_metrics?.liquidity, null, 2));
  console.log('Cash Quality:', JSON.stringify(data.unified_metrics?.cashQuality, null, 2));
  console.log('DuPont:', JSON.stringify(data.unified_metrics?.dupont, null, 2));
  console.log('Growth:', JSON.stringify(data.unified_metrics?.growth, null, 2));

  console.log('\n=== COMPUTING SNOWFLAKE ===');
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
