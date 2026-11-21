import { NextResponse } from 'next/server';
import { fetchLiveBistNewsFeed } from '@/lib/news-service';
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
    const category = searchParams.get('category') || undefined;
    const tickersParam = searchParams.get('tickers');
    const singleTicker = searchParams.get('ticker');
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
    });

    return NextResponse.json({
      success: true,
      count: feed.length,
      feed,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[API /api/feed] Hata:', error);
    return NextResponse.json(
      {
        success: false,
        count: 0,
        feed: [],
        error: error?.message || 'Haber akışı alınamadı.',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
