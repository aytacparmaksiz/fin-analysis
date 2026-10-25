import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { isValidTicker, isValidReportId, validateDeleteReportParams } from '@/lib/security';
import { clearBistCache } from '@/lib/bist-service';

export { isValidTicker, isValidReportId, validateDeleteReportParams };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET: Değerleme raporlarını buluttan veya ticker bazında çek
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const rawTicker = url.searchParams.get('ticker');
    const requestedTicker = rawTicker ? rawTicker.toUpperCase().trim() : null;

    const supabase = getSupabase();
    const isConfigured = Boolean(supabase && isSupabaseConfigured());

    if (requestedTicker !== null) {
      if (!isValidTicker(requestedTicker)) {
        return NextResponse.json(
          { success: false, message: 'Geçersiz veya zararlı karakter içeren hisse kodu formatı.' },
          { status: 400 }
        );
      }

      // 1. Önce Supabase'de ara (Kesin eşitlik ile)
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
        error: 'Raporlar getirilirken veritabanı hatası oluştu.' 
      }, { status: 500 });
    }

    const reports = (data || []).map((row: any) => ({
      id: row.id,
      ticker: row.ticker,
      price: row.price,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
      error: 'Raporlar yüklenirken sunucu hatası oluştu.' 
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
      return NextResponse.json({ success: false, message: 'Geçersiz rapor verisi.' }, { status: 400 });
    }

    const cleanId = String(report.id).trim();
    const cleanTicker = String(report.ticker).trim().toUpperCase();

    // Katı girdi doğrulaması: ID ve Ticker formatı güvenli olmalıdır
    if (!isValidReportId(cleanId)) {
      return NextResponse.json(
        { success: false, message: 'Geçersiz rapor ID formatı.' },
        { status: 400 }
      );
    }

    if (!isValidTicker(cleanTicker)) {
      return NextResponse.json(
        { success: false, message: 'Geçersiz hisse kodu formatı.' },
        { status: 400 }
      );
    }

    // DoS & Payload bloat koruması (Maksimum 500KB metin içeriği)
    if (typeof report.report === 'string' && report.report.length > 500000) {
      return NextResponse.json(
        { success: false, message: 'Rapor metni izin verilen maksimum boyutu aşıyor.' },
        { status: 413 }
      );
    }

    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ 
        success: false, 
        isCloudConfigured: false, 
        message: 'Supabase yapılandırılmamış, tarayıcı yerel belleğine kaydedildi.' 
      });
    }

    const payload = {
      id: cleanId,
      ticker: cleanTicker,
      price: report.price ? String(report.price).slice(0, 32) : '',
      created_at: report.createdAt || new Date().toLocaleString('tr-TR'),
      period: report.period ? String(report.period).slice(0, 32) : '',
      report: report.report || '',
      decision: report.decision || 'NÖTR',
      score: report.score ? String(report.score).slice(0, 16) : '',
      extracted_data: report.extractedData || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('valuation_reports')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('Supabase upsert error:', error);
      return NextResponse.json({ success: false, error: 'Rapor kaydedilirken veritabanı hatası oluştu.', isCloudConfigured: true }, { status: 500 });
    }

    return NextResponse.json({ success: true, isCloudConfigured: true });
  } catch (err: any) {
    console.error('POST /api/reports handler error:', err);
    return NextResponse.json({ success: false, error: 'Rapor kaydedilirken sunucu hatası oluştu.' }, { status: 500 });
  }
}

// DELETE: Raporu buluttan güvenli ve kesin eşleşme ile sil
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawId = searchParams.get('id');
    const rawTicker = searchParams.get('ticker');

    // 1. Fail-Safe Parametre Doğrulaması (Wildcard, zararlı karakter ve boşluk engeli)
    const validation = validateDeleteReportParams(rawId, rawTicker);
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, message: validation.error || 'Geçersiz parametre.' },
        { status: 400 }
      );
    }

    const { cleanId, cleanTicker } = validation;

    // Sunucu belleğindeki geçici finansal önbelleği (RAM cache) de temizle
    if (cleanTicker) {
      try {
        clearBistCache(cleanTicker);
      } catch {}
    }

    const supabase = getSupabase();
    if (!supabase || !isSupabaseConfigured()) {
      return NextResponse.json({ 
        success: true, 
        isCloudConfigured: false, 
        message: 'Supabase aktif değil, işlem sadece yerel bellekten silindi.' 
      });
    }

    // 2. Kesin Eşleşme (Exact Matching) ile Silme:
    // Wildcard eşleştirme KESİNLİKLE KULLANILMAZ. Yalnızca .eq() ile kesin eşitlik uygulanır.
    let error = null;

    if (cleanId && cleanTicker) {
      // Hem ID hem Ticker eşleşiyorsa sadece o spesifik kaydı sil
      const res = await supabase
        .from('valuation_reports')
        .delete()
        .eq('id', cleanId)
        .eq('ticker', cleanTicker);
      if (res.error) error = res.error;
    } else if (cleanId) {
      // Yalnızca doğrulanmış tekil ID ile sil
      const res = await supabase
        .from('valuation_reports')
        .delete()
        .eq('id', cleanId);
      if (res.error) error = res.error;
    } else if (cleanTicker) {
      // Yalnızca doğrulanmış tekil Ticker ile sil
      const res = await supabase
        .from('valuation_reports')
        .delete()
        .eq('ticker', cleanTicker);
      if (res.error) error = res.error;
    }

    if (error) {
      console.error('Supabase delete error:', error);
      return NextResponse.json({ success: false, error: 'Kayıt silinirken veritabanı hatası oluştu.', isCloudConfigured: true }, { status: 500 });
    }

    return NextResponse.json({ success: true, isCloudConfigured: true });
  } catch (err: any) {
    console.error('DELETE /api/reports handler error:', err);
    return NextResponse.json({ success: false, error: 'Silme işlemi sırasında sunucu hatası oluştu.' }, { status: 500 });
  }
}
