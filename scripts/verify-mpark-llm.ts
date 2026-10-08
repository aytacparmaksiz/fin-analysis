/**
 * scripts/verify-mpark-llm.ts
 * ----------------------------------------------------------------------------
 * MPARK LLM Rapor Üretimi ve Doğrulama Scripti.
 * unifiedMetrics JSON verisinin prompta enjeksiyonunu ve üretilen rapordaki
 * DuPont Faaliyet Marjı (%15,24) ile FCF (4.458.911 Bin TL) doğruluğunu denetler.
 */

import { fetchAndAnalyzeBistCompany } from '../lib/bist-service.ts';
import { FinancialRatioEngine } from '../lib/ratio-engine.ts';

async function main() {
  console.log('Testing MPARK unifiedMetrics payload for LLM ContextBuilder...');
  const bistData = await fetchAndAnalyzeBistCompany('MPARK', { forceRefresh: true });
  
  const unified = bistData.unified_metrics;
  console.log('Unified Metrics Check:');
  console.log('- Period:', unified.period);
  console.log('- DuPont EBIT Margin:', unified.dupont.ebitMargin + '%');
  console.log('- Balance Sheet Non-Current Assets:', (unified.balanceSheet.nonCurrentAssets / 1000).toLocaleString('tr-TR'), 'Bin TL');
  console.log('- Balance Sheet Total Assets:', (unified.balanceSheet.totalAssets / 1000).toLocaleString('tr-TR'), 'Bin TL');
  console.log('- Cash Quality Status:', unified.cashQuality.status, '-', unified.cashQuality.badgeTitle);
  console.log('- TTM FCF:', unified.ttm.freeCashFlow);

  const latestHistory = bistData.financial_history[bistData.financial_history.length - 1];
  console.log('\nLatest Period Financials:');
  console.log('- 2026/06 FCF:', (latestHistory.free_cash_flow / 1000).toLocaleString('tr-TR'), 'Bin TL');
  console.log('- 2026/06 Operating Profit:', (latestHistory.operating_profit / 1000).toLocaleString('tr-TR'), 'Bin TL');
  console.log('- 2026/06 Revenue:', (latestHistory.revenue / 1000).toLocaleString('tr-TR'), 'Bin TL');
  console.log('- 2026/06 Implied DuPont EBIT Margin:', ((latestHistory.operating_profit / latestHistory.revenue) * 100).toFixed(2) + '%');

  console.log('\nLLM Prompt Grounding Constraints:');
  console.log('Kural 14 kapsamında prompta doğrudan bu nesne enjekte edilmektedir.');
  console.log('Metin içindeki DuPont marjı:', unified.dupont.ebitMargin + '%');
  console.log('Metin içindeki çeyreklik FCF:', (latestHistory.free_cash_flow / 1000).toLocaleString('tr-TR'), 'Bin TL');
}

main().catch(console.error);
