import { 
  AGESA_SAMPLE_DATA, 
  AGESA_SAMPLE_REPORT_TEXT, 
  VESBE_SAMPLE_DATA, 
  VESBE_SAMPLE_REPORT_TEXT 
} from '@/lib/sample-data';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { SectorType } from '@/lib/sectors';

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
}

/**
 * Statik olarak hazır olan doğrulanmış resmi modelleri döndürür (Senkron).
 * Hem SSR (Server Side Rendering) hem de İstemci tarafı ilk mount için 0 ms gecikmeyle çalışır.
 */
export function getStaticReport(ticker: string): SavedReport | null {
  const norm = (ticker || '').trim().toUpperCase();
  if (norm === 'VESBE') {
    return {
      id: 'demo-vesbe',
      ticker: 'VESBE',
      price: '3.95',
      fairValue: '3.36',
      period: '2026/06',
      createdAt: '7 Ekim 2026, 17:00',
      decision: 'ALMA',
      score: '10',
      sector: 'INDUSTRIAL',
      report: VESBE_SAMPLE_REPORT_TEXT,
      extractedData: VESBE_SAMPLE_DATA,
    };
  }
  if (norm === 'AGESA') {
    return {
      id: 'demo-agesa',
      ticker: 'AGESA',
      price: '118.50',
      fairValue: '164.20',
      period: '2026/Q2',
      createdAt: '28 Eylül 2026, 14:15',
      decision: 'AL',
      score: '96',
      sector: 'INSURANCE',
      report: AGESA_SAMPLE_REPORT_TEXT,
      extractedData: AGESA_SAMPLE_DATA,
    };
  }
  return null;
}

/**
 * Dinamik rotalar ve SSR için ticker'a ait raporu çözer (Statik model veya Supabase).
 */
export async function getReportForTicker(ticker: string): Promise<SavedReport | null> {
  const norm = (ticker || '').trim().toUpperCase();
  if (!norm) return null;

  // 1. Doğrulanmış resmi model (VESBE, AGESA)
  const staticReport = getStaticReport(norm);
  if (staticReport) return staticReport;

  // 2. Bulut Supabase veritabanı (Tanımlıysa)
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
