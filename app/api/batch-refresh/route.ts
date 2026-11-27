import { NextResponse } from 'next/server';
import { getSupabaseForAuthorizedWrite, isSupabaseConfigured } from '@/lib/supabase';
import {
  authorizeApiMutation,
  checkRateLimit,
  isValidTicker,
  normalizeTicker,
  readBoundedJsonBody,
} from '@/lib/security';
import { fetchAndAnalyzeBistCompany } from '@/lib/bist-service';
import {
  generateAlgorithmicReportFallback,
  parsePeriodSortKey,
  syncReportTextWithValuation,
} from '@/lib/valuation';
import { SECTOR_DEFINITIONS, detectSector, type SectorType } from '@/lib/sectors';
import { mergeAnalysisHistorySnapshots, type SavedReport } from '@/lib/report-resolver';
import { computeReportChangeAttribution } from '@/lib/batch-delta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
};

const MAX_BATCH_TICKERS = 5;
const BATCH_CONCURRENCY = 2;

export async function POST(req: Request) {
  try {
    const rl = checkRateLimit(req, 'batch_refresh', 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Toplu güncelleme hız sınırına ulaşıldı. Lütfen kısa süre bekleyin.',
          retryAfter: rl.retryAfterSec,
        },
        { status: 429, headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const auth = authorizeApiMutation(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.reason || 'Yetkisiz toplu güncelleme isteği.' },
        { status: auth.status, headers: NO_STORE_HEADERS }
      );
    }

    const parsedBody = await readBoundedJsonBody<any>(req, 65_536);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { success: false, error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const rawTickers = parsedBody.data?.tickers;
    if (!Array.isArray(rawTickers) || rawTickers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'En az 1 geçerli hisse kodu gönderilmelidir.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const normalizedTickers = Array.from(
      new Set(rawTickers.map((t: unknown) => normalizeTicker(String(t || ''))).filter(Boolean))
    );

    if (normalizedTickers.length === 0 || normalizedTickers.length > MAX_BATCH_TICKERS) {
      return NextResponse.json(
        {
          success: false,
          error: `Tek seferde en fazla ${MAX_BATCH_TICKERS} hisse güncellenebilir.`,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const invalidTicker = normalizedTickers.find((t) => !isValidTicker(t));
    if (invalidTicker) {
      return NextResponse.json(
        { success: false, error: `Geçersiz hisse kodu: ${invalidTicker}` },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const onlyNewQuarter = parsedBody.data?.onlyNewQuarter !== false;
    const supabase = getSupabaseForAuthorizedWrite();
    const isCloud = Boolean(supabase && isSupabaseConfigured());
    const currentDateStr = new Date().toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const processSingleTicker = async (cleanTicker: string, idx: number) => {
      try {
        let existingRow: any = null;
        if (isCloud && supabase) {
          const existingRes = await supabase
            .from('valuation_reports')
            .select('id, ticker, period, price, decision, score, created_at, updated_at, extracted_data')
            .eq('ticker', cleanTicker)
            .order('updated_at', { ascending: false })
            .limit(3);

          if (!existingRes.error && Array.isArray(existingRes.data) && existingRes.data.length > 0) {
            const sortedExisting = [...existingRes.data].sort(
              (a, b) =>
                parsePeriodSortKey(String(b.period || '')) -
                  parsePeriodSortKey(String(a.period || '')) ||
                (Date.parse(String(b.updated_at || b.created_at || '')) || 0) -
                  (Date.parse(String(a.updated_at || a.created_at || '')) || 0)
            );
            existingRow = sortedExisting[0];
          }
        }

        const bistData: any = await fetchAndAnalyzeBistCompany(cleanTicker, {
          forceRefresh: true,
          skipYahoo: true,
        });

        if (
          !bistData ||
          !Array.isArray(bistData.financial_history) ||
          bistData.financial_history.length === 0
        ) {
          return {
            ticker: cleanTicker,
            status: 'FAILED' as const,
            error: 'Mali tablo verisi alınamadı.',
          };
        }

        const fetchedPeriod = String(
          bistData.reporting_period ||
            bistData.financial_history[bistData.financial_history.length - 1]?.period ||
            ''
        ).trim();
        const existingPeriod = String(
          existingRow?.period || existingRow?.extracted_data?.reporting_period || ''
        ).trim();

        if (
          onlyNewQuarter &&
          existingRow &&
          fetchedPeriod &&
          existingPeriod &&
          parsePeriodSortKey(fetchedPeriod) <= parsePeriodSortKey(existingPeriod)
        ) {
          return {
            ticker: cleanTicker,
            status: 'SKIPPED_SAME_PERIOD' as const,
            period: existingPeriod,
            prevPeriod: existingPeriod,
            newPeriod: fetchedPeriod,
          };
        }

        const existingExt = existingRow?.extracted_data || {};
        const sector: SectorType =
          bistData.sector || detectSector(cleanTicker, bistData.company_name);
        const sectorDef = SECTOR_DEFINITIONS[sector] || SECTOR_DEFINITIONS.INDUSTRIAL;

        // Var olan kalitatif zenginleştirmeleri koru
        const preservedFields: Record<string, any> = {};
        for (const qKey of [
          'qualitative_risk_audit',
          'guidance_track_record',
          'management_quality',
          'strengths',
          'weaknesses',
          'official_sector_name',
        ]) {
          if (existingExt[qKey] !== undefined && bistData[qKey] === undefined) {
            preservedFields[qKey] = existingExt[qKey];
          }
        }

        const activePriceNum = Number(bistData.current_price || 0);
        const activePriceStr =
          Number.isFinite(activePriceNum) && activePriceNum > 0
            ? String(activePriceNum)
            : String(existingRow?.price || '');

        const valuation = bistData.valuation || {};
        const drivers = bistData.drivers || {};
        const scoreResult = bistData.scoreResult || { totalScore: 50, breakdown: [] };
        const optimization = bistData.optimization || {};
        const finalDecision = (
          optimization.finalDecision ||
          valuation.final_decision ||
          valuation.decision ||
          'NÖTR'
        ) as 'AL' | 'ALMA' | 'NÖTR';

        const enrichedCurrData = {
          ...bistData,
          ...preservedFields,
          sector,
        };

        const periodDelta = computeReportChangeAttribution({
          ticker: cleanTicker,
          sector,
          prevReport: existingRow,
          currData: enrichedCurrData,
          currPrice: activePriceStr,
          currDecision: finalDecision,
          currScore: scoreResult.totalScore,
          currFairValue: valuation.fair_value,
        });

        let reportText = generateAlgorithmicReportFallback({
          ticker: cleanTicker,
          sector,
          sectorDef,
          price: activePriceStr,
          valuation,
          drivers,
          scoreResult,
          optimization,
          currentDateStr,
          extractedData: enrichedCurrData,
          unifiedMetrics: bistData.unified_metrics,
        });

        reportText = syncReportTextWithValuation(
          reportText,
          valuation,
          scoreResult,
          drivers,
          Number(activePriceStr) || undefined,
          enrichedCurrData
        );

        const nowIso = new Date().toISOString();
        const newId = String(Date.now() + idx * 17);
        const scoreStr = `${Math.max(0, Math.min(100, Math.round(Number(scoreResult.totalScore ?? 50))))}/100`;
        const fvNum = Number(valuation.fair_value || 0);

        const cleanExtractedData: Record<string, any> = {
          ...enrichedCurrData,
          sector,
          current_price: activePriceStr,
          reporting_period: fetchedPeriod,
          saved_at: nowIso,
          ...(periodDelta ? { period_delta: periodDelta } : {}),
        };
        delete cleanExtractedData.scoreResult;
        delete cleanExtractedData.score_result;
        delete cleanExtractedData.fair_value_drivers;

        const analysisHistory = mergeAnalysisHistorySnapshots(
          existingRow ? [existingRow] : [],
          {
            id: newId,
            ticker: cleanTicker,
            period: fetchedPeriod,
            createdAt: nowIso,
            price: activePriceStr,
            fairValue: fvNum > 0 ? fvNum.toFixed(2) : null,
            score: scoreStr,
            decision: finalDecision,
            extractedData: cleanExtractedData,
          }
        );

        if (analysisHistory.length > 0) {
          cleanExtractedData.analysis_history = analysisHistory;
        }

        if (isCloud && supabase) {
          const payload = {
            id: newId,
            ticker: cleanTicker,
            price: activePriceStr.slice(0, 32),
            created_at: nowIso,
            period: fetchedPeriod.slice(0, 32),
            report: reportText,
            decision: finalDecision,
            score: scoreStr.slice(0, 16),
            extracted_data: cleanExtractedData,
            updated_at: nowIso,
          };

          const { error: upsertErr } = await supabase
            .from('valuation_reports')
            .upsert(payload, { onConflict: 'id' });

          if (upsertErr) {
            return {
              ticker: cleanTicker,
              status: 'FAILED' as const,
              error: `Veritabanı yazma hatası: ${upsertErr.message}`,
            };
          }

          try {
            await supabase
              .from('valuation_reports')
              .delete()
              .eq('ticker', cleanTicker)
              .neq('id', newId);
          } catch {}
        }

        const savedReport: SavedReport = {
          id: newId,
          ticker: cleanTicker,
          price: activePriceStr,
          fairValue: fvNum > 0 ? fvNum.toFixed(2) : undefined,
          createdAt: nowIso,
          updatedAt: nowIso,
          period: fetchedPeriod || undefined,
          report: reportText,
          decision: finalDecision,
          rawDecision: optimization.rawDecision,
          overrideReason: optimization.overrideReason,
          score: scoreStr,
          sector,
          extractedData: cleanExtractedData,
          marginOfSafetyStatus: optimization.marginOfSafetyStatus,
          conditionalWarnings: optimization.conditionalWarnings,
          isGreyZone: optimization.isGreyZone,
          isValueTrap: valuation.is_value_trap,
          valueTrapSeverity: valuation.value_trap_severity,
          valueTrapReasons: valuation.value_trap_reasons,
          fairValueTrend: valuation.fair_value_trend,
          dividendHistory: bistData.dividend_history,
          consensusTarget: bistData.consensus_target,
        };

        return {
          ticker: cleanTicker,
          status: 'UPDATED' as const,
          prevPeriod: existingPeriod || null,
          newPeriod: fetchedPeriod,
          report: savedReport,
          attribution: periodDelta,
        };
      } catch (err: any) {
        return {
          ticker: cleanTicker,
          status: 'FAILED' as const,
          error: err?.message ? String(err.message).slice(0, 160) : 'Beklenmeyen analiz hatası.',
        };
      }
    };

    const results: any[] = [];
    for (let i = 0; i < normalizedTickers.length; i += BATCH_CONCURRENCY) {
      const slice = normalizedTickers.slice(i, i + BATCH_CONCURRENCY);
      const settled = await Promise.all(
        slice.map((sym, offset) => processSingleTicker(sym, i + offset))
      );
      results.push(...settled);
    }

    return NextResponse.json(
      {
        success: true,
        isCloudConfigured: isCloud,
        results,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err: any) {
    console.error('[POST /api/batch-refresh] Hata:', err);
    return NextResponse.json(
      { success: false, error: 'Toplu güncelleme sırasında sunucu hatası oluştu.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
