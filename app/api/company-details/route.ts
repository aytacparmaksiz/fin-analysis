import { NextRequest, NextResponse } from 'next/server';
import { fetchIsYatirimCompanyDetails } from '@/lib/isyatirim-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const TICKER_REGEX = /^[A-Z0-9]{2,10}$/;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawTicker = searchParams.get('ticker') || searchParams.get('symbol') || '';

    const cleanTicker = rawTicker.toUpperCase().trim();
    if (!cleanTicker || !TICKER_REGEX.test(cleanTicker)) {
      return NextResponse.json(
        { error: 'Lütfen geçerli bir BIST hisse kodu belirtin.' },
        { status: 400 }
      );
    }

    const details = await fetchIsYatirimCompanyDetails(cleanTicker);

    return NextResponse.json({
      success: true,
      ...details
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
      }
    });
  } catch (error: any) {
    console.error('[API /api/company-details] Hata:', error);
    return NextResponse.json(
      { error: 'Şirket temettü ve konsensüs verileri çekilemedi.' },
      { status: 500 }
    );
  }
}
