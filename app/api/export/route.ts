import { NextResponse } from 'next/server';
import { getReportForTicker } from '@/lib/report-resolver';
import { generateFullAuditMarkdown } from '@/lib/export-markdown';
import { normalizeTicker, isValidTicker, checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const rl = checkRateLimit(req, 'export', 60, 60_000);
    if (!rl.allowed) {
      return new NextResponse('Çok fazla dışa aktarma isteği gönderildi.', {
        status: 429,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Retry-After': String(rl.retryAfterSec),
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const { searchParams } = new URL(req.url);
    const rawTicker = searchParams.get('ticker') || searchParams.get('symbol') || '';
    const cleanTicker = normalizeTicker(rawTicker);

    if (!isValidTicker(cleanTicker)) {
      return new NextResponse('Lütfen geçerli bir hisse kodu belirtin. Örn: /api/export?ticker=VESBE', {
        status: 400,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const report = await getReportForTicker(cleanTicker);

    if (!report) {
      return new NextResponse(`# ${cleanTicker} — Kayıtlı Rapor Bulunamadı\n\nBu hisse kodu için henüz bir değerleme raporu oluşturulmamış.`, {
        status: 404,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const md = generateFullAuditMarkdown(report);

    return new NextResponse(md, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="${cleanTicker}_audit_report.md"`,
      },
    });
  } catch (error: any) {
    console.error('[API /api/export] Hata:', error);
    return new NextResponse('Hata oluştu: Rapor dışa aktarılırken bir sorun oluştu.', {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  }
}
