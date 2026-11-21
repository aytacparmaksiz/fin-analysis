import { NextResponse } from 'next/server';
import { getMarketCockpitOverview } from '@/lib/cockpit-service';
import { checkRateLimit } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rl = checkRateLimit(request, 'cockpit', 120, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, message: 'Çok fazla piyasa kokpiti isteği gönderildi.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const data = await getMarketCockpitOverview(refresh);
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: error?.message || 'Piyasa kokpiti verileri alınamadı.',
        indices: [],
        allTickers: [],
        quotesMap: {},
        topGainers: [],
        topLosers: [],
        topSectors: [],
        agenda: [],
      },
      { status: 500 }
    );
  }
}
