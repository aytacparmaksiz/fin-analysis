import { NextResponse } from 'next/server';
import { getMarketCockpitOverview } from '@/lib/cockpit-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const data = await getMarketCockpitOverview(refresh);
    return NextResponse.json({
      success: true,
      ...data
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
        agenda: []
      },
      { status: 500 }
    );
  }
}
