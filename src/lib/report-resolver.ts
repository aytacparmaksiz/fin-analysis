import { getSupabase, isSupabaseConfigured } from './supabase.ts';
import type { SectorType } from './sectors.ts';
import { detectSector } from './sectors.ts';
import { parsePeriodSortKey, parseFinancialNumber } from './valuation.ts';

export interface SavedReport {
  id: string;
  ticker: string;
  price: string;
  fairValue?: string;
  createdAt: string;
  period?: string;
  report: string;
  decision: 'AL' | 'ALMA' | 'NÖTR';
  rawDecision?: 'AL' | 'ALMA' | 'NÖTR';
  overrideReason?: string;
  score?: string;
  sector?: SectorType;
  extractedData?: any;
  marginOfSafetyStatus?: 'SAFE' | 'BORDERLINE' | 'UNSAFE';
  conditionalWarnings?: string[];
  isGreyZone?: boolean;
  isValueTrap?: boolean;
  valueTrapSeverity?: 'NONE' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  valueTrapReasons?: string[];
  fairValueTrend?: any[];
  dividendHistory?: any[];
  consensusTarget?: any;
  updatedAt?: string;
}

/**
 * Skor string veya sayılarını ("76/100", "76", 0, 82) güvenli sayıya çevirir.
 * `'76/100'` asla `'76100'` yapılmaz ve `0` geçerli skor olarak korunur.
 */
export function parseNumericScore(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const str = String(raw).trim();
  if (!str) return null;
  const head = str.split('/')[0]?.trim() || '';
  if (!head) return null;
  const cleaned = head.replace(',', '.').replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Skoru kanonik `"X/100"` formatına normalize eder.
 */
export function formatCanonicalScore(raw: unknown): string {
  const num = parseNumericScore(raw);
  if (num === null) return '';
  const clamped = Math.max(0, Math.min(100, Math.round(num)));
  return `${clamped}/100`;
}

/**
 * Rapor oluşturulma tarihini sadeleştirir ve saat bilgisini ayıklar.
 * Örn: "04 Kasım 2026 16:14" -> "04 Kasım 2026"
 * veya ISO string -> "04 Kasım 2026"
 */
export function formatAnalysisDate(rawDate?: string): string {
  if (!rawDate) return '';
  const cleaned = rawDate.replace(/\s+\d{1,2}:\d{2}(?::\d{2})?$/, '').trim();
  if (cleaned.includes('T') || cleaned.match(/^\d{4}-\d{2}-\d{2}/)) {
    try {
      const d = new Date(cleaned);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
      }
    } catch {}
  }
  return cleaned;
}

/**
 * Statik olarak hazır model döndürmez; kullanıcı veya veritabanı haricinde suni rapor üretilmesini engeller.
 */
export function getStaticReport(_ticker?: string): SavedReport | null {
  return null;
}

function resolveRowCanonicalPeriod(row: any): string {
  const direct = String(row?.period || '').trim();
  const ed = row?.extracted_data || {};
  const repPeriod = String(ed?.reporting_period || '').trim();
  const umPeriod = String(ed?.unified_metrics?.period || '').trim();
  const hist: any[] = Array.isArray(ed?.financial_history) ? ed.financial_history : [];
  let latestHistPeriod = '';
  let maxHistKey = -1;
  for (const h of hist) {
    const p = String(h?.period || '').trim();
    const k = parsePeriodSortKey(p);
    if (p && k > maxHistKey) {
      maxHistKey = k;
      latestHistPeriod = p;
    }
  }
  const candidates = [direct, repPeriod, latestHistPeriod, umPeriod].filter(Boolean);
  if (candidates.length === 0) return '';
  candidates.sort((a, b) => parsePeriodSortKey(b) - parsePeriodSortKey(a));
  return candidates[0];
}

/**
 * Dinamik rotalar ve SSR için ticker'a ait raporu çözer (Yalnızca gerçek Supabase kayıtları).
 * Dönem sıralaması `parsePeriodSortKey` ile yapılır; tüm `SavedReport` alanları tam map'lenir.
 */
export async function getReportForTicker(ticker: string): Promise<SavedReport | null> {
  const norm = (ticker || '').trim().toUpperCase().replace(/\.IS$/i, '');
  if (!norm) return null;

  // Bulut Supabase veritabanı (Tanımlıysa)
  try {
    const supabase = getSupabase();
    if (supabase && isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('valuation_reports')
        .select('*')
        .eq('ticker', norm)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (!error && data && data.length > 0) {
        const sortedRows = [...data].sort((a: any, b: any) => {
          const pDiff = parsePeriodSortKey(resolveRowCanonicalPeriod(b)) - parsePeriodSortKey(resolveRowCanonicalPeriod(a));
          if (pDiff !== 0) return pDiff;
          const ua = a?.updated_at ? new Date(a.updated_at).getTime() : 0;
          const ub = b?.updated_at ? new Date(b.updated_at).getTime() : 0;
          return ub - ua;
        });

        const row = sortedRows[0];
        const ed = row.extracted_data || {};
        const val = ed.valuation || {};
        const opt = ed.optimization || {};
        const canonicalPeriod = resolveRowCanonicalPeriod(row);
        const fvRaw = row.fair_value ?? val.fair_value ?? ed.fair_value ?? ed.target_price;
        const fvNum = parseFinancialNumber(fvRaw);
        const fairValueStr = fvNum !== null ? fvNum.toFixed(2) : (fvRaw != null ? String(fvRaw) : undefined);
        const resolvedSector = (row.sector || ed.sector || detectSector(row.ticker, ed.company_name)) as SectorType;
        const canonicalScore = formatCanonicalScore(row.score ?? ed.scoreResult?.totalScore ?? val.scoreResult?.totalScore) || (row.score != null ? String(row.score) : undefined);
        const rawDec = opt.rawDecision ?? val.raw_decision;
        const marginStatus = opt.marginOfSafetyStatus ?? val.margin_of_safety_status;

        return {
          id: row.id,
          ticker: row.ticker,
          price: row.price != null ? String(row.price) : (ed.current_price != null ? String(ed.current_price) : ''),
          fairValue: fairValueStr,
          createdAt: row.created_at || ed.generatedAt || '',
          period: canonicalPeriod || undefined,
          report: row.report || '',
          decision: row.decision || val.final_decision || 'NÖTR',
          rawDecision: rawDec,
          overrideReason: opt.overrideReason ?? val.override_reason,
          score: canonicalScore,
          sector: resolvedSector,
          extractedData: ed,
          marginOfSafetyStatus: marginStatus,
          conditionalWarnings: Array.isArray(opt.conditionalWarnings) ? opt.conditionalWarnings : (Array.isArray(val.conditional_warnings) ? val.conditional_warnings : undefined),
          isGreyZone: opt.isGreyZone ?? val.is_grey_zone,
          isValueTrap: opt.isValueTrap ?? val.is_value_trap,
          valueTrapSeverity: opt.valueTrapSeverity ?? val.value_trap_severity,
          valueTrapReasons: Array.isArray(opt.valueTrapReasons) ? opt.valueTrapReasons : (Array.isArray(val.value_trap_reasons) ? val.value_trap_reasons : undefined),
          fairValueTrend: Array.isArray(ed.fair_value_trend) ? ed.fair_value_trend : undefined,
          dividendHistory: Array.isArray(ed.dividend_history) ? ed.dividend_history : undefined,
          consensusTarget: ed.consensus_target ?? undefined,
          updatedAt: row.updated_at || undefined,
        };
      }
    }
  } catch (err) {
    console.warn('[getReportForTicker] Supabase kontrolü hatası:', err);
  }

  return null;
}
