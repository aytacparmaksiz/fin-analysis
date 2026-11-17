import { NextResponse } from 'next/server';
import { fetchAndAnalyzeKapQualitativeAudit, isKapQualitativeSupported } from '@/lib/kap-report-service';
import { isValidTicker } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = (searchParams.get('ticker') || '').toUpperCase().trim();

    if (!isValidTicker(ticker)) {
      return NextResponse.json({ success: false, message: 'Geçersiz hisse kodu.' }, { status: 400 });
    }

    if (!isKapQualitativeSupported(ticker)) {
      return NextResponse.json({ success: true, supported: false, audit: null });
    }

    const audit = await fetchAndAnalyzeKapQualitativeAudit(ticker);
    return NextResponse.json({
      success: true,
      supported: true,
      audit
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || 'KAP kalitatif taraması yapılamadı.' },
      { status: 500 }
    );
  }
}
