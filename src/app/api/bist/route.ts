import { NextRequest, NextResponse } from 'next/server';
import { fetchAndAnalyzeBistCompany } from '@/lib/bist-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TICKER_REGEX = /^[A-Z0-9]{2,10}$/;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawTicker = searchParams.get('ticker') || searchParams.get('symbol') || '';

    const cleanTicker = rawTicker.toUpperCase().trim();
    if (!cleanTicker || !TICKER_REGEX.test(cleanTicker)) {
      return NextResponse.json(
        { error: 'Lütfen geçerli bir BIST hisse kodu belirtin (Örn: AGESA, THYAO, EREGL).' },
        { status: 400 }
      );
    }

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
        error: 'BIST resmi verileri çekilirken beklenmeyen bir hata oluştu.',
      },
      { status: 500 }
    );
  }
}
