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
import { parsePeriodSortKey } from '@/lib/valuation';
import { mergeAnalysisHistorySnapshots } from '@/lib/report-resolver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
};

// Sunucu İçi Önbellek (In-Memory Cache): Supabase Egress kotasını ve statement-timeout riskini korur
let cachedReportsResponse: {
  data: { reports: any[]; activeIds?: string[]; isCloudConfigured: boolean };
  timestamp: number;
} | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 dakika önbellek (POST/DELETE anında yerinde güncellenir)

function extractTimestampMs(row: any): number {
  const upd = Date.parse(String(row?.updated_at || row?.updatedAt || row?.extractedData?.saved_at || row?.extracted_data?.saved_at || ''));
  if (Number.isFinite(upd)) return upd;
  const crt = Date.parse(String(row?.created_at || row?.createdAt || ''));
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

async function fetchReportChunksByIds(supabase: any, targetIds: string[]): Promise<{ rowById: Map<string, any>; error: any }> {
  const chunkSize = 25;
  const idChunks: string[][] = [];
  for (let i = 0; i < targetIds.length; i += chunkSize) {
    idChunks.push(targetIds.slice(i, i + chunkSize));
  }

  const rowById = new Map<string, any>();
  let fetchError: any = null;
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

  return { rowById, error: fetchError };
}

// GET: Değerleme raporlarını buluttan, delta farkıyla (?since=) veya ticker/id bazında çek
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
    const rawIds = url.searchParams.get('ids');
    const rawSince = url.searchParams.get('since');

    const supabase = getSupabase();
    const isConfigured = Boolean(supabase && isSupabaseConfigured());
    const now = Date.now();
    const isCacheWarm = Boolean(cachedReportsResponse && now - cachedReportsResponse.timestamp < CACHE_TTL_MS);

    // A. Tekil hisse sorgusu (?ticker=XYZ)
    if (requestedTicker !== null) {
      if (!isValidTicker(requestedTicker)) {
        return NextResponse.json(
          { success: false, message: 'Geçersiz veya zararlı karakter içeren hisse kodu formatı.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      if (isCacheWarm && cachedReportsResponse) {
        const cachedMatch = cachedReportsResponse.data.reports.find(
          (r) => normalizeTicker(r.ticker) === requestedTicker && r.report
        );
        if (cachedMatch) {
          return NextResponse.json(
            { success: true, report: cachedMatch, source: 'memory-cache' },
            { headers: { ...NO_STORE_HEADERS, 'X-Cache': 'HIT' } }
          );
        }
      }

      if (isConfigured && supabase) {
        const { data, error } = await supabase
          .from('valuation_reports')
          .select('*')
          .eq('ticker', requestedTicker)
          .order('updated_at', { ascending: false })
          .limit(3);

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

    // B. Belirli eksik ID listesi sorgusu (?ids=id1,id2,...) — Kısmi IndexedDB onarımı için
    if (rawIds !== null) {
      const idList = rawIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (idList.length === 0 || idList.length > 50 || idList.some((id) => !isValidReportId(id))) {
        return NextResponse.json(
          { success: false, message: 'Geçersiz rapor ID listesi.' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      if (!supabase || !isConfigured) {
        return NextResponse.json(
          { reports: [], isCloudConfigured: false },
          { headers: NO_STORE_HEADERS }
        );
      }

      if (isCacheWarm && cachedReportsResponse) {
        const byId = new Map(cachedReportsResponse.data.reports.map((r) => [String(r.id), r]));
        if (idList.every((id) => byId.has(id))) {
          return NextResponse.json(
            { reports: idList.map((id) => byId.get(id)), isCloudConfigured: true },
            { headers: { ...NO_STORE_HEADERS, 'X-Cache': 'HIT' } }
          );
        }
      }

      const { rowById, error } = await fetchReportChunksByIds(supabase, idList);
      if (error) {
        return NextResponse.json(
          { reports: [], isCloudConfigured: true, error: 'Seçili raporlar getirilirken hata oluştu.' },
          { status: 500, headers: NO_STORE_HEADERS }
        );
      }
      const matched = idList.map((id) => rowById.get(id)).filter(Boolean).map(mapRowToReport);
      return NextResponse.json(
        { reports: matched, isCloudConfigured: true },
        { headers: NO_STORE_HEADERS }
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

    let sinceMs: number | null = null;
    if (rawSince) {
      const asNum = Number(rawSince);
      const parsed = Number.isFinite(asNum) && asNum > 0 ? asNum : Date.parse(rawSince);
      if (Number.isFinite(parsed) && parsed > 0) {
        sinceMs = parsed;
      }
    }

    // 1. Sunucu İçi Önbellek (In-Memory Cache — Tam veya Delta yanıtı 0 Supabase Egress ile döner):
    if (isCacheWarm && cachedReportsResponse) {
      if (sinceMs !== null) {
        const activeIds = cachedReportsResponse.data.reports.map((r) => String(r.id));
        const deltaReports = cachedReportsResponse.data.reports.filter(
          (r) => extractTimestampMs(r) > sinceMs
        );
        return NextResponse.json(
          {
            reports: deltaReports,
            activeIds,
            isDelta: true,
            isCloudConfigured: true,
          },
          { headers: { ...NO_STORE_HEADERS, 'X-Cache': 'HIT-DELTA' } }
        );
      }

      return NextResponse.json(cachedReportsResponse.data, {
        headers: {
          ...NO_STORE_HEADERS,
          'X-Cache': 'HIT',
        },
      });
    }

    // 2. İki Aşamalı Hızlı İndeksli Çekim (2-Phase Indexed Primary-Key Fetch):
    // Aşama 2A: Yalnızca ~18 KB üst-veri (id, ticker, period, created_at, updated_at) çekilir.
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

    // Her şirket (ticker) için YALNIZCA en güncel tekil satırı seç (eski rapor özetleri analysis_history içindedir):
    const sortedMeta = [...(metaRows || [])].sort(
      (a, b) =>
        parsePeriodSortKey(String(b.period || '')) - parsePeriodSortKey(String(a.period || '')) ||
        extractTimestampMs(b) - extractTimestampMs(a)
    );
    const winningMetaRows: any[] = [];
    const seenTickers = new Set<string>();
    for (const row of sortedMeta) {
      const t = normalizeTicker(row.ticker);
      if (!t || !row.id) continue;
      if (!seenTickers.has(t)) {
        seenTickers.add(t);
        winningMetaRows.push(row);
      }
    }
    const winningIds = winningMetaRows.map((r) => String(r.id));

    // Delta Senkronizasyonu (?since=): Değişmeyen 329 satırın 33 MB gövdesini bir daha ASLA indirme!
    if (sinceMs !== null) {
      const changedIds = winningMetaRows
        .filter((r) => extractTimestampMs(r) > sinceMs)
        .map((r) => String(r.id));

      if (changedIds.length === 0) {
        return NextResponse.json(
          {
            reports: [],
            activeIds: winningIds,
            isDelta: true,
            isCloudConfigured: true,
          },
          { headers: { ...NO_STORE_HEADERS, 'X-Cache': 'DELTA-EMPTY' } }
        );
      }

      const { rowById, error: deltaErr } = await fetchReportChunksByIds(supabase, changedIds);
      if (deltaErr) {
        return NextResponse.json(
          {
            reports: [],
            isCloudConfigured: true,
            error: 'Güncel rapor farkları getirilirken veritabanı hatası oluştu.',
          },
          { status: 500, headers: NO_STORE_HEADERS }
        );
      }

      const changedReports = changedIds
        .map((id) => rowById.get(id))
        .filter(Boolean)
        .map(mapRowToReport);

      return NextResponse.json(
        {
          reports: changedReports,
          activeIds: winningIds,
          isDelta: true,
          isCloudConfigured: true,
        },
        { headers: { ...NO_STORE_HEADERS, 'X-Cache': 'DELTA-PARTIAL' } }
      );
    }

    // Aşama 2B (Tam İlk Kurulum Çekimi): Tekilleştirilmiş kazanan ID'leri çek ve önbelleğe al:
    const { rowById, error: chunkErr } = await fetchReportChunksByIds(supabase, winningIds);
    if (chunkErr) {
      console.error('Supabase chunk fetch error:', chunkErr);
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

    const responsePayload = { reports, activeIds: winningIds, isCloudConfigured: true };
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

    const cleanPeriod = report.period ? String(report.period).trim().slice(0, 32) : '';

    // 1. Mevcut hisse kayıtlarını sorgulayıp eski rapor(lar)ın skor/adil değer/fiyat özetini koru:
    let existingTickerRows: any[] = [];
    try {
      const existingRes = await supabase
        .from('valuation_reports')
        .select('id, ticker, period, price, decision, score, created_at, updated_at, extracted_data')
        .eq('ticker', cleanTicker);
      if (!existingRes.error && Array.isArray(existingRes.data)) {
        existingTickerRows = existingRes.data;
      }
    } catch {}

    // 2. Extracted data optimizasyonu: gereksiz kopyaları (scoreResult, fair_value_drivers) temizle, geçmiş özetini göm:
    let cleanExtractedData: Record<string, any> | null =
      report.extractedData && typeof report.extractedData === 'object' ? report.extractedData : null;
    if (cleanExtractedData) {
      const { scoreResult, score_result, ...restExtracted } = cleanExtractedData;
      cleanExtractedData = { ...restExtracted };
      if (cleanExtractedData.drivers && cleanExtractedData.fair_value_drivers) {
        delete cleanExtractedData.fair_value_drivers;
      }
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

    const mergedHistory = mergeAnalysisHistorySnapshots(existingTickerRows, {
      ...report,
      id: cleanId,
      ticker: cleanTicker,
      period: cleanPeriod,
      extractedData: cleanExtractedData,
    });
    if (mergedHistory.length > 0) {
      cleanExtractedData = {
        ...(cleanExtractedData || {}),
        analysis_history: mergedHistory,
      };
    }

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

    // 3. Tekil aktif rapor kuralı: Eski tüm rapor gövdelerini sil (skor/adil değer özetleri analysis_history içinde korunur):
    try {
      await supabase
        .from('valuation_reports')
        .delete()
        .eq('ticker', cleanTicker)
        .neq('id', cleanId);
    } catch (cleanupErr) {
      console.warn('Eski hisse raporu temizliği hatası (kritik değil):', cleanupErr);
    }

    // 4. Sunucu önbelleğini sıfırlamak yerine yerinde güncelle (33 MB tam tablo yeniden indirmesini önler):
    if (cachedReportsResponse) {
      const mappedNew = mapRowToReport(payload);
      const nextList = [
        mappedNew,
        ...cachedReportsResponse.data.reports.filter(
          (r) => normalizeTicker(r.ticker) !== cleanTicker && String(r.id) !== cleanId
        ),
      ];
      cachedReportsResponse = {
        data: {
          reports: nextList,
          activeIds: nextList.map((r) => String(r.id)),
          isCloudConfigured: true,
        },
        timestamp: Date.now(),
      };
    }

    return NextResponse.json(
      { success: true, isCloudConfigured: true, analysis_history: mergedHistory },
      { headers: NO_STORE_HEADERS }
    );
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

    if (cachedReportsResponse && (cleanId || cleanTicker)) {
      const nextList = cachedReportsResponse.data.reports.filter((r) => {
        if (cleanId && cleanTicker) {
          return !(String(r.id) === cleanId && normalizeTicker(r.ticker) === cleanTicker);
        }
        if (cleanId) return String(r.id) !== cleanId;
        if (cleanTicker) return normalizeTicker(r.ticker) !== cleanTicker;
        return true;
      });
      cachedReportsResponse = {
        data: {
          reports: nextList,
          activeIds: nextList.map((r) => String(r.id)),
          isCloudConfigured: true,
        },
        timestamp: Date.now(),
      };
    } else {
      cachedReportsResponse = null;
    }

    return NextResponse.json({ success: true, isCloudConfigured: true }, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    console.error('DELETE /api/reports handler error:', err);
    return NextResponse.json(
      { success: false, error: 'Silme işlemi sırasında sunucu hatası oluştu.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
