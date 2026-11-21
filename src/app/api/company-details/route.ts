import { NextResponse } from 'next/server';
import { fetchIsYatirimCompanyDetails } from '@/lib/isyatirim-service';
import { fetchTradingViewConsensus } from '@/lib/tradingview-service';
import { normalizeTicker, isValidTicker, checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const rl = checkRateLimit(req, 'company_details', 120, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Çok fazla şirket detay isteği gönderildi.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawTicker = searchParams.get('ticker') || searchParams.get('symbol') || '';

    const cleanTicker = normalizeTicker(rawTicker);
    if (!isValidTicker(cleanTicker)) {
      return NextResponse.json(
        { error: 'Lütfen geçerli bir BIST hisse kodu belirtin.' },
        { status: 400 }
      );
    }

    const isRefresh = searchParams.get('refresh') === 'true' || searchParams.get('forceRefresh') === 'true';

    const [detailsResult, tvResult] = await Promise.allSettled([
      fetchIsYatirimCompanyDetails(cleanTicker, { forceRefresh: isRefresh }),
      fetchTradingViewConsensus(cleanTicker, { forceRefresh: isRefresh }),
    ]);

    const details = detailsResult.status === 'fulfilled' ? detailsResult.value : null;
    const tvConsensus = tvResult.status === 'fulfilled' ? tvResult.value : null;

    return NextResponse.json(
      {
        success: true,
        ...(details || { ticker: cleanTicker, dividends: [], consensus: null, foreignShare: null }),
        tvConsensus,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('[API /api/company-details] Hata:', error);
    return NextResponse.json(
      { error: 'Şirket temettü ve konsensüs verileri çekilemedi.' },
      { status: 500 }
    );
  }
}
