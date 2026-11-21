import { NextResponse } from 'next/server';
import { fetchAndAnalyzeBistCompany } from '@/lib/bist-service';
import { normalizeTicker, isValidTicker, checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const rl = checkRateLimit(req, 'bist', 120, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Çok fazla BIST veri isteği gönderildi.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const { searchParams } = new URL(req.url);
    const rawTicker = searchParams.get('ticker') || searchParams.get('symbol') || '';

    const cleanTicker = normalizeTicker(rawTicker);
    if (!isValidTicker(cleanTicker)) {
      return NextResponse.json(
        { error: 'Lütfen geçerli bir BIST hisse kodu belirtin (Örn: AGESA, THYAO, EREGL).' },
        { status: 400 }
      );
    }

    const isRefresh = searchParams.get('refresh') === 'true';
    const result = await fetchAndAnalyzeBistCompany(cleanTicker, { forceRefresh: isRefresh });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
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
