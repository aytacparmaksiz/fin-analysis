import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { 
  AGESA_SAMPLE_DATA, AGESA_SAMPLE_REPORT_TEXT, 
  VESBE_SAMPLE_DATA, VESBE_SAMPLE_REPORT_TEXT 
} from '@/lib/sample-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET: Değerleme raporlarını buluttan veya ticker bazında çek
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const requestedTicker = url.searchParams.get('ticker')?.toUpperCase().trim();

    const supabase = getSupabase();
    const isConfigured = Boolean(supabase && isSupabaseConfigured());

    if (requestedTicker) {
      // 1. Önce Supabase'de ara
      if (isConfigured && supabase) {
        const { data, error } = await supabase
          .from('valuation_reports')
          .select('*')
          .eq('ticker', requestedTicker)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const row = data[0];
          const report = {
            id: row.id,
            ticker: row.ticker,
            price: row.price,
            createdAt: row.created_at,
            period: row.period,
            report: row.report,
            decision: row.decision,
            score: row.score,
            extractedData: row.extracted_data,
          };
          return NextResponse.json({ success: true, report, source: 'cloud' });
        }
      }

      // 2. Hazır resmi modellerde ara (VESBE, AGESA)
      if (requestedTicker === 'VESBE') {
        const vesbeReport = {
          id: 'report-vesbe',
          ticker: 'VESBE',
          price: '3.95',
          period: '2026/06',
          createdAt: '7 Ekim 2026, 17:30',
          decision: 'ALMA',
          score: '15',
          sector: 'INDUSTRIAL',
          report: VESBE_SAMPLE_REPORT_TEXT,
          extractedData: VESBE_SAMPLE_DATA,
        };
        return NextResponse.json({ success: true, report: vesbeReport, source: 'official_sample' });
      }

      if (requestedTicker === 'AGESA') {
        const agesaReport = {
          id: 'demo-agesa',
          ticker: 'AGESA',
          price: '118.50',
          period: '2026/Q2',
          createdAt: '28 Eylül 2026, 14:15',
          decision: 'AL',
          score: '96',
          sector: 'INSURANCE',
          report: AGESA_SAMPLE_REPORT_TEXT,
          extractedData: AGESA_SAMPLE_DATA,
        };
        return NextResponse.json({ success: true, report: agesaReport, source: 'official_sample' });
      }

      return NextResponse.json({ 
        success: false, 
        message: `${requestedTicker} için kayıtlı rapor bulunamadı.` 
      }, { status: 404 });
    }

    if (!supabase || !isConfigured) {
      return NextResponse.json({ 
        reports: [], 
        isCloudConfigured: false, 
        message: 'Supabase ortam değişkenleri henüz tanımlanmamış. Yerel önbellek kullanılıyor.' 
      });
    }

    const { data, error } = await supabase
      .from('valuation_reports')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Supabase fetch error:', error);
      return NextResponse.json({ 
        reports: [], 
        isCloudConfigured: true, 
        error: error.message 
      }, { status: 500 });
    }

    const reports = (data || []).map((row: any) => ({
      id: row.id,
      ticker: row.ticker,
      price: row.price,
      createdAt: row.created_at,
      period: row.period,
      report: row.report,
      decision: row.decision,
      score: row.score,
      extractedData: row.extracted_data,
    }));

    return NextResponse.json({ reports, isCloudConfigured: true });
  } catch (err: any) {
    console.error('GET /api/reports handler error:', err);
    return NextResponse.json({ 
      reports: [], 
      isCloudConfigured: false, 
      error: err?.message || 'Bilinmeyen hata' 
    }, { status: 500 });
  }
}

// POST: Yeni değerleme raporunu buluta kaydet / güncelle
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const report = body.report || body;

    if (!report || !report.id || !report.ticker) {
      return NextResponse.json({ success: false, message: 'Geçersiz rapor verisi' }, { status: 400 });
    }

    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ 
        success: false, 
        isCloudConfigured: false, 
        message: 'Supabase yapılandırılmamış, tarayıcı yerel belleğine kaydedildi.' 
      });
    }

    const payload = {
      id: report.id,
      ticker: report.ticker,
      price: report.price || '',
      created_at: report.createdAt || new Date().toLocaleString('tr-TR'),
      period: report.period || '',
      report: report.report || '',
      decision: report.decision || 'NÖTR',
      score: report.score ? String(report.score) : '',
      extracted_data: report.extractedData || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('valuation_reports')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return NextResponse.json({ success: false, error: error.message, isCloudConfigured: true }, { status: 500 });
    }

    return NextResponse.json({ success: true, isCloudConfigured: true });
  } catch (err: any) {
    console.error('POST /api/reports handler error:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

// DELETE: Raporu buluttan sil
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, message: 'Rapor ID belirtilmedi' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ 
        success: true, 
        isCloudConfigured: false, 
        message: 'Supabase aktif değil, işlem sadece yerel bellekten silindi.' 
      });
    }

    const { error } = await supabase
      .from('valuation_reports')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase delete error:', error);
      return NextResponse.json({ success: false, error: error.message, isCloudConfigured: true }, { status: 500 });
    }

    return NextResponse.json({ success: true, isCloudConfigured: true });
  } catch (err: any) {
    console.error('DELETE /api/reports handler error:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
