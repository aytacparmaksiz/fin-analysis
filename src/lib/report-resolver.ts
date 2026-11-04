import { getSupabase, isSupabaseConfigured } from './supabase.ts';
import type { SectorType } from './sectors.ts';

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

/**
 * Dinamik rotalar ve SSR için ticker'a ait raporu çözer (Yalnızca gerçek Supabase kayıtları).
 */
export async function getReportForTicker(ticker: string): Promise<SavedReport | null> {
  const norm = (ticker || '').trim().toUpperCase();
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
        .limit(1);

      if (!error && data && data.length > 0) {
        const row = data[0];
        return {
          id: row.id,
          ticker: row.ticker,
          price: row.price,
          fairValue: row.fair_value,
          createdAt: row.created_at,
          period: row.period,
          report: row.report,
          decision: row.decision,
          score: row.score,
          sector: row.sector,
          extractedData: row.extracted_data,
        };
      }
    }
  } catch (err) {
    console.warn('[getReportForTicker] Supabase kontrolü hatası:', err);
  }

  return null;
}
