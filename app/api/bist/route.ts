import { NextRequest, NextResponse } from 'next/server';
import { fetchAndAnalyzeBistCompany } from '@/lib/bist-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('ticker') || searchParams.get('symbol') || '';

    if (!ticker.trim()) {
      return NextResponse.json(
        { error: 'Lütfen geçerli bir BIST hisse kodu belirtin (Örn: AGESA, THYAO, EREGL).' },
        { status: 400 }
      );
    }

    const cleanTicker = ticker.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    const isRefresh = searchParams.get('refresh') === 'true';
    const result = await fetchAndAnalyzeBistCompany(cleanTicker, { forceRefresh: isRefresh });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (error: any) {
    console.error('[API /api/bist] Hata:', error);
    return NextResponse.json(
      {
        error: error.message || 'BIST resmi verileri çekilirken beklenmeyen bir hata oluştu.',
        ticker: req.nextUrl.searchParams.get('ticker')
      },
      { status: 500 }
    );
  }
}
