import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeSectorValuationAndDrivers,
  syncReportTextWithValuation,
  generateAlgorithmicReportFallback,
  parsePeriodSortKey,
  parseFinancialNumber,
} from '../lib/valuation.ts';
import { FinancialRatioEngine } from '../lib/ratio-engine.ts';
import { detectSector, getSectorDefinition, getCompanySectorDisplayName } from '../lib/sectors.ts';
import { InvariantSentinel } from '../lib/invariant-sentinel.ts';
import { formatAnalysisDate, formatCanonicalScore } from '../lib/report-resolver.ts';

// Local CLI maintenance script TLS allowance (mirrors scripts/forensic_database_audit.mjs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Load .env.local
let env = {};
try {
  const envFile = fs.readFileSync(path.resolve('.env.local'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      }
    }
  }
} catch {
  env = process.env;
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  env['SUPABASE_SERVICE_ROLE_KEY'] ||
  env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials missing in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isVerifyOnly = args.includes('--verify-only');
const isDryRun = args.includes('--dry-run') || (!isApply && !isVerifyOnly);
const tickerFilter = args.find(a => a.startsWith('--ticker='))?.split('=')[1]?.toUpperCase();

const SPOT_CHECK_TICKERS = [
  'GOZDE', 'ALFAS', 'AKGRT', 'RGYAS', 'GARAN',
  'SKBNK', 'BALSU', 'PNLSN', 'CMBTN', 'ARSAN',
  'SONME', 'PSDTC', 'FENER', 'VAKKO', 'BRSAN',
];

async function fetchAllReports() {
  let idQuery = supabase
    .from('valuation_reports')
    .select('id, ticker')
    .order('ticker', { ascending: true });
  if (tickerFilter) {
    idQuery = idQuery.eq('ticker', tickerFilter);
  }
  const { data: idRows, error: idError } = await idQuery;
  if (idError) {
    throw new Error(`Supabase ID list error: ${idError.message}`);
  }

  const allIds = (idRows || []).map(r => r.id);
  const pageSize = 15;
  const rows = [];
  for (let i = 0; i < allIds.length; i += pageSize) {
    const batchIds = allIds.slice(i, i + pageSize);
    const { data, error } = await supabase
      .from('valuation_reports')
      .select('id, ticker, period, price, decision, score, extracted_data, report, created_at, updated_at')
      .in('id', batchIds);
    if (error) {
      throw new Error(`Supabase batch fetch error (${i / pageSize}): ${error.message}`);
    }
    if (data && data.length > 0) {
      rows.push(...data);
    }
  }
  rows.sort((a, b) => String(a.ticker || '').localeCompare(String(b.ticker || '')));
  return rows;
}

function getLatestPeriodFromHistory(hist) {
  if (!Array.isArray(hist) || hist.length === 0) return '';
  let best = '';
  let bestKey = -1;
  for (const h of hist) {
    const p = String(h?.period || '').trim();
    const k = parsePeriodSortKey(p);
    if (p && k > bestKey) {
      bestKey = k;
      best = p;
    }
  }
  return best;
}

function auditRecordQuality(r) {
  const ed = r.extracted_data || {};
  const val = ed.valuation || {};
  const um = ed.unified_metrics || {};
  const text = String(r.report || '');
  const hist = Array.isArray(ed.financial_history) ? ed.financial_history : [];
  const sortedHist = [...hist].sort((a, b) => parsePeriodSortKey(a?.period) - parsePeriodSortKey(b?.period));
  const latestItem = sortedHist[sortedHist.length - 1] || {};
  const fhLast = String(latestItem?.period || '').trim();
  const umPeriod = String(um?.period || '').trim();
  const repPeriod = String(ed?.reporting_period || '').trim();
  const rowPeriod = String(r.period || '').trim();
  const sec = String(ed.sector || detectSector(r.ticker, ed.company_name)).toUpperCase();

  const issues = [];
  if (!rowPeriod) issues.push('empty_period');
  if (rowPeriod && ((fhLast && rowPeriod !== fhLast) || (umPeriod && rowPeriod !== umPeriod) || (repPeriod && rowPeriod !== repPeriod))) {
    issues.push('period_mismatch');
  }
  if (!/^\d{1,3}\/100$/.test(String(r.score || ''))) {
    issues.push('non_canonical_score');
  }
  if (/(\*\*Temel\s+Yatırım\s+Tezi:\*\*|RIM\s+TEZİ)\s*hesapladığı/i.test(text) || /(^|\n)\s*hesapladığı\s+\*{0,2}\d/i.test(text)) {
    issues.push('missing_subject_hesapladigi');
  }
  if (/\(%null\)|\(nullx\)|\+-%|\+%-|%\d+(?:[.,]\d+)?x|(?:^|[\s*(])0(?:[.,]0+)?\s*(?:Milyon|Milyar)\s*TL/im.test(text)) {
    issues.push('null_or_sign_or_unit_leaks');
  }
  if (
    (r.decision !== 'AL' && /Güçlü Alım Tezi\s*\/\s*Olumlu/i.test(text)) ||
    (r.decision === 'AL' && /Neden\s*\\?"?AL\\?"?\s*Verilmedi\?/i.test(text))
  ) {
    issues.push('decision_text_contradiction');
  }
  const isOperatingSector = !['BANKING', 'INSURANCE', 'FINANCIAL_SERVICES', 'HOLDING', 'REIT'].includes(sec);
  const roicVal = parseFinancialNumber(um?.margins?.roic ?? latestItem?.roic);
  const waccVal = parseFinancialNumber(um?.margins?.wacc ?? latestItem?.real_wacc ?? latestItem?.wacc);
  if (isOperatingSector && r.decision === 'AL' && roicVal !== null && waccVal !== null && Number((roicVal - waccVal).toFixed(1)) < 0) {
    issues.push('neg_eva_al_operating');
  }
  return issues;
}

function summarizeSpotCheck(rows) {
  const byTicker = new Map(rows.map(r => [String(r.ticker || '').toUpperCase(), r]));
  console.log('\n🔎 SPOT-CHECK TABLOSU:');
  const tableRows = [];
  for (const t of SPOT_CHECK_TICKERS) {
    const r = byTicker.get(t);
    if (!r) {
      tableRows.push({ Ticker: t, Status: 'MISSING' });
      continue;
    }
    const ed = r.extracted_data || {};
    const val = ed.valuation || {};
    const um = ed.unified_metrics || {};
    const issues = auditRecordQuality(r);
    tableRows.push({
      Ticker: t,
      Period: r.period || '(EMPTY)',
      UM_Period: um.period || '-',
      Sector: `${ed.sector || '-'} (${ed.official_sector_name || '-'})`,
      Price: r.price,
      FairVal: val.fair_value ?? '-',
      Score: r.score,
      Decision: r.decision,
      Trap: Boolean(val.is_value_trap),
      Issues: issues.length > 0 ? issues.join(',') : 'OK',
    });
  }
  console.table(tableRows);
}

async function runVerifyOnly() {
  console.log('\n' + '='.repeat(85));
  console.log('🔍 PAKET B CANLI SUPABASE DOĞRULAMA DENETİMİ (--verify-only)');
  console.log('='.repeat(85));
  const rows = await fetchAllReports();
  console.log(`Toplam Canlı Rapor Sayısı: ${rows.length}`);

  const counts = {
    empty_period: 0,
    period_mismatch: 0,
    non_canonical_score: 0,
    missing_subject_hesapladigi: 0,
    null_or_sign_or_unit_leaks: 0,
    decision_text_contradiction: 0,
    neg_eva_al_operating: 0,
  };
  const affected = [];

  for (const r of rows) {
    const issues = auditRecordQuality(r);
    for (const iss of issues) {
      counts[iss] = (counts[iss] || 0) + 1;
    }
    if (issues.length > 0) {
      affected.push({ ticker: r.ticker, period: r.period, um_period: r.extracted_data?.unified_metrics?.period, score: r.score, decision: r.decision, issues });
    }
  }

  console.log('\n📊 KURAL İHLAL SAYILARI:');
  console.table(counts);
  if (affected.length > 0) {
    console.log(`\n⚠️ Sorunlu Kayıt Örnekleri (ilk 25 / toplam ${affected.length}):`);
    console.table(affected.slice(0, 25));
  } else {
    console.log('\n✅ TÜM KONTROLLERDE 0 HATA!');
  }

  summarizeSpotCheck(rows);
  return counts;
}

async function runRefresh() {
  console.log('\n' + '='.repeat(85));
  console.log(`🔄 PAKET B CANLI 329 RAPOR YENİDEN DEĞERLEME & ONARIM (${isApply ? '--apply (CANLI YAZIM)' : '--dry-run (ÖNİZLEME)'})`);
  console.log('='.repeat(85));

  const rows = await fetchAllReports();
  console.log(`Toplam Yüklenen Kayıt: ${rows.length}`);

  let computeErrors = 0;
  let dbErrors = 0;
  let updatedCount = 0;
  let regeneratedTextCount = 0;
  let syncedOnlyTextCount = 0;
  let periodFixedCount = 0;
  let scoreFormatFixedCount = 0;
  let decisionChangedCount = 0;
  const simulatedRows = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const ed = r.extracted_data || {};

    try {
      const trueSector = detectSector(r.ticker, ed.company_name) || ed.sector || 'INDUSTRIAL';
      const sectorDef = getSectorDefinition(trueSector, r.ticker);
      const officialSectorName = getCompanySectorDisplayName(r.ticker, trueSector);

      const rawHist = Array.isArray(ed.financial_history) ? ed.financial_history : [];
      const sortedHist = [...rawHist]
        .map(h => ({ ...h }))
        .sort((a, b) => parsePeriodSortKey(a?.period) - parsePeriodSortKey(b?.period));

      const curPrice = parseFinancialNumber(r.price ?? ed.current_price ?? ed.valuation?.current_price) ?? 0;

      const cleanExt = {
        ...ed,
        ticker: r.ticker,
        sector: trueSector,
        official_sector_name: officialSectorName,
        financial_history: sortedHist,
      };

      const valRes = computeSectorValuationAndDrivers(cleanExt, curPrice > 0 ? String(curPrice) : '', trueSector);

      // Re-sort after enrichAndSanitizeFinancialHistory
      if (Array.isArray(cleanExt.financial_history)) {
        cleanExt.financial_history.sort((a, b) => parsePeriodSortKey(a?.period) - parsePeriodSortKey(b?.period));
      }
      const latestEnriched = cleanExt.financial_history.length > 0
        ? cleanExt.financial_history[cleanExt.financial_history.length - 1]
        : null;

      const canonicalPeriod = String(
        latestEnriched?.period || getLatestPeriodFromHistory(cleanExt.financial_history) || ed.reporting_period || r.period || ''
      ).trim();

      const shareCount = parseFinancialNumber(
        cleanExt.shares_outstanding ?? cleanExt.share_count ?? latestEnriched?.shares_count ?? latestEnriched?.paid_in_capital
      ) ?? 0;

      const unifiedMetrics = FinancialRatioEngine.computeMetrics({
        ticker: r.ticker,
        history: cleanExt.financial_history,
        currentPrice: curPrice,
        shareCount,
        sector: trueSector,
        currency: cleanExt.currency || 'TRY',
      });

      InvariantSentinel.validateAndHealDrivers(valRes.drivers, {
        ticker: r.ticker,
        financialHistory: cleanExt.financial_history,
        latestData: latestEnriched,
        unifiedMetrics,
      });

      const newDec = valRes.optimization?.finalDecision || valRes.valuation?.final_decision || 'NÖTR';
      const newScore = formatCanonicalScore(valRes.scoreResult?.totalScore) || '50/100';

      if (canonicalPeriod && canonicalPeriod !== String(r.period || '').trim()) periodFixedCount++;
      if (!/^\d{1,3}\/100$/.test(String(r.score || ''))) scoreFormatFixedCount++;
      if (newDec !== r.decision) decisionChangedCount++;

      const valObj = {
        ...(ed.valuation || {}),
        ...valRes.valuation,
        ticker: r.ticker,
        sector: trueSector,
        final_decision: newDec,
        decision: newDec,
        override_reason: valRes.optimization?.overrideReason,
      };

      const existingReportText = String(r.report || '');
      const isEmptyOrShort = existingReportText.trim().length < 200;
      const isAlgoTemplate =
        existingReportText.includes('**Finansal Sağlık Skoru:**') ||
        existingReportText.includes('**Temel Yatırım Tezi:**') ||
        existingReportText.includes('## V. DEĞER SÜRÜCÜLERİ');
      const hasLegacyCorruption =
        existingReportText.includes('hesapladığı') ||
        /\+-%|\+%-|%\d+(?:[.,]\d+)?x|%2469900|\(%null\)|\(nullx\)|donanım\/ticaret ve taşeron/i.test(existingReportText);
      const hasPeriodStaleBody =
        Boolean(canonicalPeriod) &&
        !existingReportText.includes(canonicalPeriod) &&
        /202[3456]\/(?:03|06|09|12)/.test(existingReportText);

      let baseReportText = existingReportText;
      if (isEmptyOrShort || isAlgoTemplate || hasLegacyCorruption || hasPeriodStaleBody) {
        baseReportText = generateAlgorithmicReportFallback({
          ticker: r.ticker,
          sector: trueSector,
          sectorDef,
          price: curPrice > 0 ? curPrice.toFixed(2) : String(r.price || ''),
          valuation: valObj,
          drivers: valRes.drivers,
          scoreResult: valRes.scoreResult,
          optimization: valRes.optimization,
          currentDateStr: formatAnalysisDate(r.created_at) || new Date().toISOString().slice(0, 10),
          extractedData: cleanExt,
          unifiedMetrics,
        });
        regeneratedTextCount++;
      } else {
        syncedOnlyTextCount++;
      }

      const syncedReport = syncReportTextWithValuation(
        baseReportText,
        valObj,
        valRes.scoreResult,
        valRes.drivers,
        curPrice > 0 ? curPrice : undefined,
        cleanExt
      );

      // Strip bloated scoreResult/score_result matching POST /api/reports:236
      const { scoreResult: _dropSr, score_result: _dropSr2, ...restExt } = cleanExt;
      const updatedExtracted = {
        ...restExt,
        sector: trueSector,
        official_sector_name: officialSectorName,
        reporting_period: canonicalPeriod,
        fair_value: valRes.valuation.fair_value,
        target_price: valRes.valuation.fair_value,
        current_price: curPrice,
        drivers: valRes.drivers,
        fair_value_drivers: valRes.drivers,
        optimization: valRes.optimization,
        valuation: {
          ...valObj,
          fair_value: valRes.valuation.fair_value,
        },
        unified_metrics: unifiedMetrics,
        fair_value_trend: valRes.valuation.fair_value_trend,
      };

      const simulatedRow = {
        id: r.id,
        ticker: r.ticker,
        period: canonicalPeriod,
        price: r.price,
        decision: newDec,
        score: newScore,
        extracted_data: updatedExtracted,
        report: syncedReport,
      };
      simulatedRows.push(simulatedRow);

      if (isApply) {
        let updErr = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            const res = await supabase
              .from('valuation_reports')
              .update({
                period: canonicalPeriod,
                decision: newDec,
                score: newScore,
                extracted_data: updatedExtracted,
                report: syncedReport,
                updated_at: new Date().toISOString(),
              })
              .eq('id', r.id);
            updErr = res.error;
            if (!updErr) break;
            const isTransient = /fetch failed|timeout|ECONNRESET|ETIMEDOUT|502|503|504|network/i.test(updErr.message || '');
            if (!isTransient || attempt === 4) break;
          } catch (err) {
            updErr = { message: err?.message || String(err) };
            if (attempt === 4) break;
          }
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt * attempt));
        }

        if (updErr) {
          console.error(`   ❌ [${i + 1}/${rows.length}] ${r.ticker} Supabase UPDATE hatası:`, updErr.message);
          dbErrors++;
        } else {
          updatedCount++;
          if ((i + 1) % 30 === 0 || i === rows.length - 1) {
            console.log(`   ✅ [${i + 1}/${rows.length}] ${r.ticker} (${canonicalPeriod}) -> ${newDec} | FV: ${valRes.valuation.fair_value} | Skor: ${newScore}`);
          }
        }
      }
    } catch (err) {
      console.error(`   ❌ [${i + 1}/${rows.length}] ${r.ticker} hesaplama hatası:`, err?.message || err);
      computeErrors++;
    }
  }

  console.log('\n📋 ÖZET:');
  console.log(`- Toplam Kayıt: ${rows.length}`);
  console.log(`- Yeniden Üretilen Rapor Metni: ${regeneratedTextCount} | Sync Edilen: ${syncedOnlyTextCount}`);
  console.log(`- Düzeltilen row.period: ${periodFixedCount} | Düzeltilen score formatı: ${scoreFormatFixedCount} | Karar Değişimi: ${decisionChangedCount}`);
  console.log(`- Hesaplama Hatası: ${computeErrors} | Supabase Yazım Hatası: ${dbErrors}${isApply ? ` | Güncellenen: ${updatedCount}` : ''}`);

  summarizeSpotCheck(simulatedRows);

  if (computeErrors > 0 || dbErrors > 0) {
    process.exit(1);
  }
}

(async () => {
  if (isVerifyOnly) {
    const counts = await runVerifyOnly();
    const totalIssues = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalIssues > 0) process.exit(1);
  } else {
    await runRefresh();
  }
})().catch(err => {
  console.error('❌ Batch failure:', err);
  process.exit(1);
});
