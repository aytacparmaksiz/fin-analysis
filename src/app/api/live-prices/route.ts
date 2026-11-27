import { NextResponse } from 'next/server';
import { fetchAllIsYatirimMultiples } from '@/lib/isyatirim-service';
import { checkRateLimit, isValidTicker, normalizeTicker } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const rl = checkRateLimit(request, 'live-prices', 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: 'Çok fazla canlı fiyat isteği gönderildi. Lütfen kısa süre bekleyin.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const url = new URL(request.url);
    let requestedTickers: string[] | null = null;

    if (url.searchParams.has('tickers')) {
      const rawParam = (url.searchParams.get('tickers') || '').trim();
      if (!rawParam) {
        return NextResponse.json(
          { success: false, error: 'Geçerli hisse kodu belirtilmedi.' },
          { status: 400 }
        );
      }

      const tokens = rawParam
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (tokens.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Geçerli hisse kodu belirtilmedi.' },
          { status: 400 }
        );
      }
      if (tokens.length > 400) {
        return NextResponse.json(
          { success: false, error: 'Tek seferde en fazla 400 hisse sorgulanabilir.' },
          { status: 400 }
        );
      }

      const cleanSet = new Set<string>();
      for (const tok of tokens) {
        const sym = normalizeTicker(tok);
        if (!isValidTicker(sym)) {
          return NextResponse.json(
            { success: false, error: `Geçersiz hisse kodu formatı: ${tok.slice(0, 16)}` },
            { status: 400 }
          );
        }
        cleanSet.add(sym);
      }
      requestedTickers = Array.from(cleanSet);
    }

    const allMultiples = await fetchAllIsYatirimMultiples();
    const prices: Record<string, number> = {};

    if (requestedTickers) {
      for (const tk of requestedTickers) {
        const px = allMultiples?.[tk]?.lastPrice;
        if (typeof px === 'number' && Number.isFinite(px) && px > 0) {
          prices[tk] = px;
        }
      }
    } else if (allMultiples && typeof allMultiples === 'object') {
      for (const [tk, rec] of Object.entries(allMultiples)) {
        const px = rec?.lastPrice;
        if (typeof px === 'number' && Number.isFinite(px) && px > 0) {
          prices[tk] = px;
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        prices,
        count: Object.keys(prices).length,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60',
        },
      }
    );
  } catch (err: any) {
    console.error('[LivePrices] Canlı fiyat çekim hatası:', err?.message || err);
    return NextResponse.json(
      { success: false, error: 'Canlı BIST fiyatları alınırken beklenmeyen bir hata oluştu.' },
      { status: 500 }
    );
  }
}
