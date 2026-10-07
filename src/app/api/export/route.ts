import { NextRequest, NextResponse } from 'next/server';
import { getReportForTicker } from '@/lib/report-resolver';
import { generateFullAuditMarkdown } from '@/lib/export-markdown';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('ticker') || searchParams.get('symbol') || '';

    if (!ticker.trim()) {
      return new NextResponse('Lütfen geçerli bir hisse kodu belirtin. Örn: /api/export?ticker=VESBE', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    const cleanTicker = ticker.toUpperCase().trim();
    const report = await getReportForTicker(cleanTicker);

    if (!report) {
      return new NextResponse(`# ${cleanTicker} — Kayıtlı Rapor Bulunamadı\n\nBu hisse kodu için henüz bir değerleme raporu oluşturulmamış.`, {
        status: 404,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
      });
    }

    const md = generateFullAuditMarkdown(report);

    return new NextResponse(md, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300',
      }
    });
  } catch (error: any) {
    return new NextResponse(`Hata oluştu: ${error.message || 'Bilinmeyen hata'}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
