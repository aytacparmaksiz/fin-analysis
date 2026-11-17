import { NextResponse } from 'next/server';
import { getCockpitCardData, type CockpitChartRange } from '@/lib/cockpit-service';
import { isValidTicker } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_RANGES = new Set<CockpitChartRange>(['1G', '1H', '1A', '1Y']);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawTicker = (searchParams.get('ticker') || '').toUpperCase().trim();
    const rawRange = (searchParams.get('range') || '1G').toUpperCase().trim() as CockpitChartRange;
    const range: CockpitChartRange = ALLOWED_RANGES.has(rawRange) ? rawRange : '1G';

    if (!isValidTicker(rawTicker)) {
      return NextResponse.json(
        { success: false, message: 'Geçersiz hisse kodu formatı.' },
        { status: 400 }
      );
    }

    const card = await getCockpitCardData(rawTicker, range);
    if (!card) {
      return NextResponse.json(
        { success: false, message: `${rawTicker} için kart verisi bulunamadı.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      card
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'Hisse kartı verisi alınamadı.' },
      { status: 500 }
    );
  }
}
