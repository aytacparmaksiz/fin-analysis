import { NextResponse } from 'next/server';
import { fetchLiveBistNewsFeed, fetchSingleKapDisclosureDetail } from '@/lib/news-service';
import { normalizeTicker, isValidTicker, checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

const MAX_FEED_TICKERS = 25;
const MAX_FEED_LIMIT = 100;

export async function GET(request: Request) {
  try {
    const rl = checkRateLimit(request, 'feed', 90, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, count: 0, feed: [], error: 'Çok fazla haber akışı isteği gönderildi.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const { searchParams } = new URL(request.url);

    // Tekil KAP bildirimi talep anında (on-demand) tam metin & özet zenginleştirme
    const kapIdParam = searchParams.get('kapId');
    if (kapIdParam) {
      const cleanKapId = kapIdParam.trim();
      if (!/^\d{5,9}$/.test(cleanKapId)) {
        return NextResponse.json(
          { success: false, error: 'Geçersiz KAP bildirim numarası.' },
          { status: 400 }
        );
      }
      const rawTicker = searchParams.get('ticker') || '';
      const cleanTicker = normalizeTicker(rawTicker);
      if (!isValidTicker(cleanTicker)) {
        return NextResponse.json(
          { success: false, error: 'Geçersiz hisse kodu parametresi.' },
          { status: 400 }
        );
      }
      const detail = await fetchSingleKapDisclosureDetail({
        kapId: cleanKapId,
        ticker: cleanTicker,
        rawTitle: (searchParams.get('subject') || '').slice(0, 240),
        kapSummary: (searchParams.get('summary') || '').slice(0, 320),
      });
      return NextResponse.json({
        success: Boolean(detail),
        detail,
        timestamp: new Date().toISOString(),
      });
    }

    const category = searchParams.get('category') || undefined;
    const tickersParam = searchParams.get('tickers');
    const singleTicker = searchParams.get('ticker');
    const forceRefresh = searchParams.get('force') === '1';
    const limitParam = searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : NaN;
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(MAX_FEED_LIMIT, Math.max(1, parsedLimit))
      : undefined;

    let rawTickers: string[] = [];
    if (tickersParam) {
      rawTickers = tickersParam.split(',').map((t) => t.trim()).filter(Boolean);
    } else if (singleTicker) {
      rawTickers = [singleTicker.trim()].filter(Boolean);
    }

    // Yalnızca kullanıcının analiz ettiği şirketlerin bildirimleri çekilir
    if (rawTickers.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        feed: [],
        message: 'Analiz edilen şirket bulunmuyor.',
        timestamp: new Date().toISOString(),
      });
    }

    const validTickers: string[] = [];
    const seen = new Set<string>();
    for (const raw of rawTickers) {
      const clean = normalizeTicker(raw);
      if (!isValidTicker(clean)) {
        return NextResponse.json(
          { success: false, count: 0, feed: [], error: `Geçersiz hisse kodu parametresi: ${raw.slice(0, 20)}` },
          { status: 400 }
        );
      }
      if (!seen.has(clean)) {
        seen.add(clean);
        validTickers.push(clean);
      }
    }

    const tickers = validTickers.slice(0, MAX_FEED_TICKERS);

    const feed = await fetchLiveBistNewsFeed({
      tickers,
      category,
      limit,
      forceRefresh,
    });

    return NextResponse.json({
      success: true,
      count: feed.length,
      feed,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[API /api/feed] Hata:', error);
    const errMsg = error instanceof Error ? error.message : 'Haber akışı alınamadı.';
    return NextResponse.json(
      {
        success: false,
        count: 0,
        feed: [],
        error: errMsg,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
