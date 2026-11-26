import { NextResponse } from 'next/server';
import { getSupabase, getSupabaseForAuthorizedWrite, isSupabaseConfigured } from '@/lib/supabase';
import {
  normalizeTicker,
  isValidTicker,
  isValidReportId,
  validateDeleteReportParams,
  authorizeApiMutation,
  checkRateLimit,
  readBoundedJsonBody,
} from '@/lib/security';
import { clearBistCache } from '@/lib/bist-service';
import { clearIsYatirimCache } from '@/lib/isyatirim-service';
import { parsePeriodSortKey, normalizePeriodName } from '@/lib/valuation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
};

// Sunucu İçi Önbellek (In-Memory Cache): PostgreSQL statement-timeout ve gereksiz sorguları önler
let cachedReportsResponse: { data: { reports: any[]; isCloudConfigured: boolean }; timestamp: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 saniye önbellek

function extractTimestampMs(row: any): number {
  const upd = Date.parse(String(row?.updated_at || ''));
  if (Number.isFinite(upd)) return upd;
  const crt = Date.parse(String(row?.created_at || ''));
  if (Number.isFinite(crt)) return crt;
  return 0;
}

function mapRowToReport(row: any) {
  return {
    id: row.id,
    ticker: row.ticker,
    price: row.price,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
    period: row.period,
    report: row.report,
    decision: row.decision,
    score: row.score,
    fairValue: row.fair_value ?? row.extracted_data?.valuation?.fair_value ?? null,
    sector: row.sector ?? row.extracted_data?.sector ?? null,
    extractedData: row.extracted_data,
  };
}

// GET: Değerleme raporlarını buluttan veya ticker bazında çek
export async function GET(req: Request) {
  try {
    const rl = checkRateLimit(req, 'reports_get', 120, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, message: 'Çok fazla istek gönderildi.' },
        { status: 429, headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const url = new URL(req.url);
    const rawTicker = url.searchParams.get('ticker');
    const requestedTicker = rawTicker !== null ? normalizeTicker(rawTicker) : null;

    const supabase = getSupabase();
    const isConfigured = Boolean(supabase && isSupabaseConfigured());

    if (requestedTicker !== null) {
      if (!isValidTicker(requestedTicker)) {
        return NextResponse.json(
          { success: false, message: 'Geçersiz veya zararlı karakter içeren hisse kodu formatı.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      if (isConfigured && supabase) {
        const { data, error } = await supabase
          .from('valuation_reports')
          .select('*')
          .eq('ticker', requestedTicker)
          .order('updated_at', { ascending: false })
          .limit(20);

        if (error) {
          console.error('[Reports] Tekil hisse sorgu hatası:', error);
          return NextResponse.json(
            { success: false, message: 'Veritabanı sorgu hatası oluştu.' },
            { status: 500, headers: NO_STORE_HEADERS }
          );
        }

        if (data && data.length > 0) {
          const sorted = [...data].sort(
            (a, b) =>
              parsePeriodSortKey(String(b.period || '')) - parsePeriodSortKey(String(a.period || '')) ||
              extractTimestampMs(b) - extractTimestampMs(a)
          );
          const report = mapRowToReport(sorted[0]);
          return NextResponse.json(
            { success: true, report, source: 'cloud' },
            { headers: NO_STORE_HEADERS }
          );
        }
      }

      return NextResponse.json(
        { success: false, message: `${requestedTicker} için kayıtlı rapor bulunamadı.` },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (!supabase || !isConfigured) {
      return NextResponse.json(
        {
          reports: [],
          isCloudConfigured: false,
          message: 'Supabase ortam değişkenleri henüz tanımlanmamış. Yerel önbellek kullanılıyor.',
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // 1. Sunucu İçi Önbellek (In-Memory Cache):
    const now = Date.now();
    if (cachedReportsResponse && now - cachedReportsResponse.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cachedReportsResponse.data, {
        headers: {
          ...NO_STORE_HEADERS,
          'X-Cache': 'HIT',
        },
      });
    }

    // 2. İki Aşamalı Hızlı İndeksli Çekim (2-Phase Indexed Primary-Key Fetch):
    // Aşama 2A: Sadece hafif üst-veriyi (id, ticker, period, created_at, updated_at) çekip bellekte tekilleştiririz (~150ms).
    // Böylece Postgres'te 40MB+ JSONB/Markdown üzerinde indekssiz ORDER BY updated_at sıralamasından kaynaklanan 57014 statement_timeout önlenir.
    let metaRows: any[] | null = null;
    let fetchError: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const metaRes = await supabase
        .from('valuation_reports')
        .select('id, ticker, period, created_at, updated_at');
      metaRows = metaRes.data;
      fetchError = metaRes.error;
      if (!fetchError) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    if (fetchError) {
      console.error('Supabase metadata fetch error:', fetchError);
      if (cachedReportsResponse && cachedReportsResponse.data.reports.length > 0) {
        return NextResponse.json(cachedReportsResponse.data, {
          headers: { ...NO_STORE_HEADERS, 'X-Cache': 'STALE' },
        });
      }
      return NextResponse.json(
        {
          reports: [],
          isCloudConfigured: true,
          error: 'Raporlar getirilirken veritabanı hatası oluştu.',
        },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    // (ticker, period) bileşik anahtarı ile çok çeyrekli geçmişi koruyarak hafif üst-veride tekilleştir:
    const sortedMeta = [...(metaRows || [])].sort(
      (a, b) =>
        parsePeriodSortKey(String(b.period || '')) - parsePeriodSortKey(String(a.period || '')) ||
        extractTimestampMs(b) - extractTimestampMs(a)
    );
    const winningIds: string[] = [];
    const seenCompositeKeys = new Set<string>();
    for (const row of sortedMeta) {
      const t = normalizeTicker(row.ticker);
      if (!t || !row.id) continue;
      const pRaw = String(row.period || '').trim();
      const pNorm = pRaw ? normalizePeriodName(pRaw) : '';
      const compositeKey = `${t}::${pNorm || '__LATEST__'}`;
      if (!seenCompositeKeys.has(compositeKey)) {
        seenCompositeKeys.add(compositeKey);
        winningIds.push(String(row.id));
      }
    }

    // Aşama 2B: Sadece tekilleştirilmiş kazanan ID'leri Primary Key indeksinden paralel dilimler halinde çek:
    const chunkSize = 25;
    const idChunks: string[][] = [];
    for (let i = 0; i < winningIds.length; i += chunkSize) {
      idChunks.push(winningIds.slice(i, i + chunkSize));
    }

    const rowById = new Map<string, any>();
    const concurrency = 3;
    for (let i = 0; i < idChunks.length; i += concurrency) {
      const batch = idChunks.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (chunk) => {
          let chunkData: any[] | null = null;
          let chunkErr: any = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            const res = await supabase
              .from('valuation_reports')
              .select('*')
              .in('id', chunk);
            chunkData = res.data;
            chunkErr = res.error;
            if (!chunkErr) break;
            await new Promise((r) => setTimeout(r, 300));
          }
          if (chunkErr) {
            console.error('[Reports] Primary-key dilim çekim hatası:', chunkErr);
            throw chunkErr;
          }
          return chunkData || [];
        })
      ).catch((err) => {
        fetchError = err;
        return null;
      });

      if (!batchResults) break;
      for (const rows of batchResults) {
        for (const r of rows) {
          if (r && r.id != null) {
            rowById.set(String(r.id), r);
          }
        }
      }
    }

    if (fetchError) {
      console.error('Supabase chunk fetch error:', fetchError);
      if (cachedReportsResponse && cachedReportsResponse.data.reports.length > 0) {
        return NextResponse.json(cachedReportsResponse.data, {
          headers: { ...NO_STORE_HEADERS, 'X-Cache': 'STALE' },
        });
      }
      return NextResponse.json(
        {
          reports: [],
          isCloudConfigured: true,
          error: 'Raporlar getirilirken veritabanı hatası oluştu.',
        },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const orderedWinningRows = winningIds
      .map((id) => rowById.get(id))
      .filter((r): r is any => Boolean(r));

    const reports = orderedWinningRows.map(mapRowToReport);

    const responsePayload = { reports, isCloudConfigured: true };
    cachedReportsResponse = { data: responsePayload, timestamp: now };

    return NextResponse.json(responsePayload, {
      headers: {
        ...NO_STORE_HEADERS,
        'X-Cache': 'MISS',
      },
    });
  } catch (err: any) {
    console.error('GET /api/reports handler error:', err);
    return NextResponse.json(
      {
        reports: [],
        isCloudConfigured: false,
        error: 'Raporlar yüklenirken sunucu hatası oluştu.',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// POST: Yeni değerleme raporunu buluta kaydet / güncelle
export async function POST(req: Request) {
  try {
    const rl = checkRateLimit(req, 'reports_post', 60, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, message: 'Çok fazla kayıt isteği gönderildi. Lütfen bekleyin.' },
        { status: 429, headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const auth = authorizeApiMutation(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, message: auth.reason || 'Yetkisiz işlem.' },
        { status: auth.status, headers: NO_STORE_HEADERS }
      );
    }

    const parsedBody = await readBoundedJsonBody<any>(req, 1_048_576);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { success: false, message: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const body = parsedBody.data;
    const report = body?.report || body;

    if (!report || !report.id || !report.ticker) {
      return NextResponse.json(
        { success: false, message: 'Geçersiz rapor verisi.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const cleanId = String(report.id).trim();
    const cleanTicker = normalizeTicker(report.ticker);

    if (!isValidReportId(cleanId)) {
      return NextResponse.json(
        { success: false, message: 'Geçersiz rapor ID formatı.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!isValidTicker(cleanTicker)) {
      return NextResponse.json(
        { success: false, message: 'Geçersiz hisse kodu formatı.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (typeof report.report === 'string' && report.report.length > 500000) {
      return NextResponse.json(
        { success: false, message: 'Rapor metni izin verilen maksimum boyutu aşıyor.' },
        { status: 413, headers: NO_STORE_HEADERS }
      );
    }

    const supabase = getSupabaseForAuthorizedWrite();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json(
        {
          success: false,
          isCloudConfigured: false,
          message: 'Supabase yapılandırılmamış, tarayıcı yerel belleğine kaydedildi.',
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Extracted data optimizasyonu: gereksiz scoreResult kopyalarını temizle, fairValue ve sector'ü güvenle göm
    let cleanExtractedData: Record<string, any> | null =
      report.extractedData && typeof report.extractedData === 'object' ? report.extractedData : null;
    if (cleanExtractedData) {
      const { scoreResult, score_result, ...restExtracted } = cleanExtractedData;
      cleanExtractedData = { ...restExtracted };
      if (report.sector && !cleanExtractedData.sector) {
        cleanExtractedData.sector = String(report.sector).slice(0, 32);
      }
      if (report.fairValue != null && !cleanExtractedData.valuation?.fair_value) {
        cleanExtractedData.valuation = {
          ...(cleanExtractedData.valuation || {}),
          fair_value: report.fairValue,
        };
      }
    } else if (report.sector || report.fairValue != null) {
      cleanExtractedData = {
        ...(report.sector ? { sector: String(report.sector).slice(0, 32) } : {}),
        ...(report.fairValue != null ? { valuation: { fair_value: report.fairValue } } : {}),
      };
    }

    const cleanPeriod = report.period ? String(report.period).trim().slice(0, 32) : '';
    const payload = {
      id: cleanId,
      ticker: cleanTicker,
      price: report.price ? String(report.price).slice(0, 32) : '',
      created_at: report.createdAt || new Date().toISOString(),
      period: cleanPeriod,
      report: report.report || '',
      decision: report.decision || 'NÖTR',
      score: report.score ? String(report.score).slice(0, 16) : '',
      extracted_data: cleanExtractedData,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('valuation_reports')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return NextResponse.json(
        { success: false, error: 'Rapor kaydedilirken veritabanı hatası oluştu.', isCloudConfigured: true },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    // Dönem bazlı tekillik: yalnızca aynı (ticker, period) çakışmasını temizle; diğer çeyrek geçmişini koru!
    if (cleanPeriod) {
      try {
        await supabase
          .from('valuation_reports')
          .delete()
          .eq('ticker', cleanTicker)
          .eq('period', cleanPeriod)
          .neq('id', cleanId);
      } catch (cleanupErr) {
        console.warn('Aynı dönem mükerrer kayıt temizliği hatası (kritik değil):', cleanupErr);
      }
    }

    cachedReportsResponse = null;
    return NextResponse.json({ success: true, isCloudConfigured: true }, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    console.error('POST /api/reports handler error:', err);
    return NextResponse.json(
      { success: false, error: 'Rapor kaydedilirken sunucu hatası oluştu.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

// DELETE: Raporu buluttan güvenli ve kesin eşleşme ile sil
export async function DELETE(req: Request) {
  try {
    const rl = checkRateLimit(req, 'reports_delete', 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, message: 'Çok fazla silme isteği gönderildi. Lütfen bekleyin.' },
        { status: 429, headers: { ...NO_STORE_HEADERS, 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawId = searchParams.get('id');
    const rawTicker = searchParams.get('ticker');

    const validation = validateDeleteReportParams(rawId, rawTicker);
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, message: validation.error || 'Geçersiz parametre.' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const auth = authorizeApiMutation(req, {
      requireAdminTokenForBulk: true,
      isBulkAction: !validation.cleanId,
    });
    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, message: auth.reason || 'Yetkisiz silme işlemi.' },
        { status: auth.status, headers: NO_STORE_HEADERS }
      );
    }

    const { cleanId, cleanTicker } = validation;

    if (cleanTicker) {
      try {
        await clearBistCache(cleanTicker);
        clearIsYatirimCache(cleanTicker);
      } catch {}
    }

    const supabase = getSupabaseForAuthorizedWrite();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json(
        {
          success: true,
          isCloudConfigured: false,
          message: 'Supabase aktif değil, işlem sadece yerel bellekten silindi.',
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    // Kesin Eşleşme (.eq) ile silme — asla .ilike kullanılmaz:
    let error = null;

    if (cleanId && cleanTicker) {
      const res = await supabase
        .from('valuation_reports')
        .delete()
        .eq('id', cleanId)
        .eq('ticker', cleanTicker);
      if (res.error) error = res.error;
    } else if (cleanId) {
      const res = await supabase
        .from('valuation_reports')
        .delete()
        .eq('id', cleanId);
      if (res.error) error = res.error;
    } else if (cleanTicker) {
      const res = await supabase
        .from('valuation_reports')
        .delete()
        .eq('ticker', cleanTicker);
      if (res.error) error = res.error;
    }

    if (error) {
      console.error('Supabase delete error:', error);
      return NextResponse.json(
        { success: false, error: 'Kayıt silinirken veritabanı hatası oluştu.', isCloudConfigured: true },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    cachedReportsResponse = null;
    return NextResponse.json({ success: true, isCloudConfigured: true }, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    console.error('DELETE /api/reports handler error:', err);
    return NextResponse.json(
      { success: false, error: 'Silme işlemi sırasında sunucu hatası oluştu.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
