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

export interface AnalysisHistorySnapshot {
  id: string;
  period: string | null;
  createdAt: string;
  price: string;
  fairValue: string | null;
  discountPct: number | null;
  score: string | null;
  decision: string | null;
}

function parseSnapshotTimeMs(raw?: string | null): number {
  if (!raw) return 0;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Ham Supabase satırını, SavedReport nesnesini veya mevcut özet kaydı ~180 baytlık
 * kompakt `AnalysisHistorySnapshot` formatına dönüştürür.
 */
export function toAnalysisHistorySnapshot(item: any): AnalysisHistorySnapshot | null {
  if (!item || typeof item !== 'object') return null;
  const ed = item.extractedData ?? item.extracted_data ?? {};
  const val = ed?.valuation ?? item.valuation ?? {};
  const opt = ed?.optimization ?? {};

  const periodStr = String(item.period || ed?.reporting_period || '').trim();
  const createdAt = String(
    item.createdAt || item.created_at || ed?.saved_at || item.updatedAt || item.updated_at || ''
  ).trim();
  const rawId = String(item.id || '').trim();
  const id = rawId || `${periodStr || 'NA'}_${createdAt || '0'}`;

  const priceNum = parseFinancialNumber(item.price ?? ed?.current_price ?? val?.current_price);
  const priceStr =
    priceNum !== null && priceNum > 0
      ? priceNum.toFixed(2)
      : item.price != null
      ? String(item.price).trim()
      : '';

  const fvRaw =
    item.fairValue ??
    item.fair_value ??
    val?.fair_value ??
    val?.composite_fair_value ??
    ed?.fair_value ??
    ed?.target_price;
  const fvNum = parseFinancialNumber(fvRaw);
  const fairValueStr =
    fvNum !== null && fvNum > 0
      ? fvNum.toFixed(2)
      : fvRaw != null && String(fvRaw).trim() !== '' && String(fvRaw).trim() !== '—'
      ? String(fvRaw).trim()
      : null;

  const discRaw = parseFinancialNumber(item.discountPct ?? val?.discount_pct);
  const discountPct =
    discRaw !== null
      ? Number(discRaw.toFixed(1))
      : priceNum !== null && priceNum > 0 && fvNum !== null && fvNum > 0
      ? Number((((fvNum - priceNum) / priceNum) * 100).toFixed(1))
      : null;

  const scoreStr =
    formatCanonicalScore(item.score ?? val?.score ?? opt?.score ?? ed?.scoreResult?.totalScore) ||
    (item.score != null && String(item.score).trim() !== '' ? String(item.score).trim() : null);

  const decRaw = String(
    item.decision || opt?.finalDecision || val?.final_decision || val?.decision || ''
  )
    .trim()
    .toUpperCase();
  const decision = decRaw || null;

  if (!priceStr && !fairValueStr && !scoreStr && !decision) {
    return null;
  }

  return {
    id,
    period: periodStr || null,
    createdAt,
    price: priceStr,
    fairValue: fairValueStr,
    discountPct,
    score: scoreStr,
    decision,
  };
}

/**
 * Eski rapor(lar) silinmeden önce skor, adil değer, fiyat, karar ve tarih bilgilerini
 * kompakt `analysis_history` dizisinde birleştirir, mükerrerleri temizler ve en güncel 24 kaydı tutar.
 */
export function mergeAnalysisHistorySnapshots(
  existingRecords: any[],
  incomingReport?: any,
  maxEntries = 24
): AnalysisHistorySnapshot[] {
  const activeId = String(incomingReport?.id || '').trim();
  const byId = new Map<string, AnalysisHistorySnapshot>();

  const ingest = (raw: any) => {
    const snap = toAnalysisHistorySnapshot(raw);
    if (!snap) return;
    if (activeId && snap.id === activeId) return;
    const prev = byId.get(snap.id);
    if (!prev || parseSnapshotTimeMs(snap.createdAt) >= parseSnapshotTimeMs(prev.createdAt)) {
      byId.set(snap.id, snap);
    }
  };

  for (const rec of Array.isArray(existingRecords) ? existingRecords : []) {
    if (!rec) continue;
    const nested = rec.extractedData?.analysis_history ?? rec.extracted_data?.analysis_history;
    if (Array.isArray(nested)) {
      for (const s of nested) ingest(s);
    }
    const recId = String(rec.id || '').trim();
    if (!activeId || recId !== activeId) {
      ingest(rec);
    }
  }

  const incomingNested =
    incomingReport?.extractedData?.analysis_history ?? incomingReport?.extracted_data?.analysis_history;
  if (Array.isArray(incomingNested)) {
    for (const s of incomingNested) ingest(s);
  }

  const sorted = Array.from(byId.values()).sort((a, b) => {
    const tDiff = parseSnapshotTimeMs(b.createdAt) - parseSnapshotTimeMs(a.createdAt);
    if (tDiff !== 0) return tDiff;
    return parsePeriodSortKey(b.period || '') - parsePeriodSortKey(a.period || '');
  });

  // Aynı gün içinde birebir aynı rakamlarla oluşmuş mükerrer kayıtları tekilleştir
  const dedupedFingerprints = new Set<string>();
  const cleanList: AnalysisHistorySnapshot[] = [];
  for (const item of sorted) {
    const dayKey = (item.createdAt || '').slice(0, 10);
    const fp = `${item.period || ''}|${dayKey}|${item.price}|${item.fairValue || ''}|${item.score || ''}|${item.decision || ''}`;
    if (dedupedFingerprints.has(fp)) continue;
    dedupedFingerprints.add(fp);
    cleanList.push(item);
    if (cleanList.length >= maxEntries) break;
  }

  return cleanList;
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
        .limit(3);

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
