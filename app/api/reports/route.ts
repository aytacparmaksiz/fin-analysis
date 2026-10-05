import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LOCAL_DATA_FILE = path.join(process.cwd(), 'data', 'reports.json');

function getLocalReports(): any[] {
  try {
    if (fs.existsSync(LOCAL_DATA_FILE)) {
      const raw = fs.readFileSync(LOCAL_DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Local reports read error:', err);
  }
  return [];
}

function saveLocalReports(reports: any[]) {
  try {
    const dir = path.dirname(LOCAL_DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(reports, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Local reports write error:', err);
  }
}

function getCredentials(req: NextRequest) {
  const customUrl = req.headers.get('x-supabase-url') || undefined;
  const customKey = req.headers.get('x-supabase-key') || undefined;
  const isConfigured = isSupabaseConfigured(customUrl, customKey);
  const client = getSupabase(customUrl, customKey);
  return { client, isConfigured, customUrl, customKey };
}

// GET: Tüm değerleme raporlarını çek (Supabase Cloud veya Yerel Sunucu Deposu)
export async function GET(req: NextRequest) {
  try {
    const { client, isConfigured } = getCredentials(req);
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    // Bağlantı testi kontrolü
    if (action === 'test-connection') {
      if (!isConfigured || !client) {
        return NextResponse.json({
          connected: false,
          message: 'Supabase URL veya API Anahtarı eksik.',
        });
      }
      try {
        const { count, error } = await client
          .from('valuation_reports')
          .select('*', { count: 'exact', head: true });

        if (error) {
          return NextResponse.json({
            connected: false,
            message: `Supabase bağlantı hatası: ${error.message}. Lütfen 'valuation_reports' tablosunun oluşturulduğundan emin olun.`,
          });
        }
        return NextResponse.json({
          connected: true,
          count: count ?? 0,
          message: 'Supabase bulut veritabanına başarıyla bağlanıldı!',
        });
      } catch (testErr: any) {
        return NextResponse.json({
          connected: false,
          message: `Bağlantı kurulamadı: ${testErr?.message || 'Bilinmeyen hata'}`,
        });
      }
    }

    // 1. Supabase Yapılandırılmışsa Buluttan Çek
    if (isConfigured && client) {
      const { data, error } = await client
        .from('valuation_reports')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        const reports = data.map((row: any) => ({
          id: row.id,
          ticker: row.ticker,
          price: row.price,
          createdAt: row.created_at,
          period: row.period,
          report: row.report,
          decision: row.decision,
          score: row.score,
          sector: row.sector || row.extracted_data?.sector || 'INDUSTRIAL',
          extractedData: row.extracted_data,
        }));

        // Yerel dosyaya da yazarak çevrimdışı yedek oluştur
        saveLocalReports(reports);

        return NextResponse.json({
          reports,
          isCloudConfigured: true,
          isServerConfigured: true,
          storageType: 'supabase',
          message: 'Raporlar Supabase bulut veritabanından çekildi.',
        });
      } else {
        console.warn('Supabase fetch error, yerel dosya deposuna geçiliyor:', error?.message);
      }
    }

    // 2. Supabase Yoksa veya Hata Aldıysa: Sunucu Dosya Deposunu (data/reports.json) Kullan
    const localReports = getLocalReports();
    return NextResponse.json({
      reports: localReports,
      isCloudConfigured: isConfigured,
      isServerConfigured: true,
      storageType: 'server-file',
      message: isConfigured 
        ? 'Bulut bağlantısı kurulamadı, sunucu yerel dosya deposu kullanıldı.' 
        : 'Supabase yapılandırılmamış. Sunucu yerel dosya deposu (data/reports.json) senkronizasyonu aktif.',
    });
  } catch (err: any) {
    console.error('GET /api/reports handler error:', err);
    const fallbackReports = getLocalReports();
    return NextResponse.json({
      reports: fallbackReports,
      isCloudConfigured: false,
      isServerConfigured: true,
      storageType: 'server-file',
      error: err?.message || 'Bilinmeyen hata',
    });
  }
}

// POST: Yeni değerleme raporunu kaydet / güncelle
export async function POST(req: NextRequest) {
  try {
    const { client, isConfigured } = getCredentials(req);
    const body = await req.json();
    const report = body.report || body;

    if (!report || !report.id || !report.ticker) {
      return NextResponse.json({ success: false, message: 'Geçersiz rapor verisi' }, { status: 400 });
    }

    // 1. Sunucu yerel dosyasına (data/reports.json) kaydet
    const localList = getLocalReports();
    const filteredLocal = localList.filter((r: any) => r.id !== report.id);
    const updatedLocal = [report, ...filteredLocal];
    saveLocalReports(updatedLocal);

    // 2. Supabase yapılandırılmışsa buluta upsert yap
    if (isConfigured && client) {
      const payload = {
        id: report.id,
        ticker: report.ticker,
        price: report.price || '',
        created_at: report.createdAt || new Date().toLocaleString('tr-TR'),
        period: report.period || '',
        report: report.report || '',
        decision: report.decision || 'NÖTR',
        score: report.score ? String(report.score) : '',
        sector: report.sector || report.extractedData?.sector || 'INDUSTRIAL',
        extracted_data: report.extractedData || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await client
        .from('valuation_reports')
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        console.error('Supabase upsert error:', error);
        return NextResponse.json({
          success: true,
          cloudSaved: false,
          serverSaved: true,
          error: error.message,
          message: 'Sunucuya kaydedildi fakat Supabase bulut senkronizasyonu başarısız oldu.',
        });
      }

      return NextResponse.json({
        success: true,
        cloudSaved: true,
        serverSaved: true,
        storageType: 'supabase',
        message: 'Rapor başarıyla Supabase bulut veritabanına ve sunucuya kaydedildi.',
      });
    }

    return NextResponse.json({
      success: true,
      cloudSaved: false,
      serverSaved: true,
      storageType: 'server-file',
      message: 'Rapor sunucu dosya deposuna kaydedildi.',
    });
  } catch (err: any) {
    console.error('POST /api/reports handler error:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

// DELETE: Raporu sil
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, message: 'Rapor ID belirtilmedi' }, { status: 400 });
    }

    const { client, isConfigured } = getCredentials(req);

    // 1. Sunucu yerel dosyasından sil
    const localList = getLocalReports();
    const updatedLocal = localList.filter((r: any) => r.id !== id);
    saveLocalReports(updatedLocal);

    // 2. Supabase yapılandırılmışsa buluttan sil
    if (isConfigured && client) {
      const { error } = await client
        .from('valuation_reports')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Supabase delete error:', error);
        return NextResponse.json({
          success: true,
          cloudDeleted: false,
          serverDeleted: true,
          error: error.message,
          message: 'Sunucudan silindi fakat Supabase bulut veritabanından silinemedi.',
        });
      }

      return NextResponse.json({
        success: true,
        cloudDeleted: true,
        serverDeleted: true,
        storageType: 'supabase',
        message: 'Rapor başarıyla hem buluttan hem sunucudan silindi.',
      });
    }

    return NextResponse.json({
      success: true,
      cloudDeleted: false,
      serverDeleted: true,
      storageType: 'server-file',
      message: 'Rapor sunucu dosya deposundan silindi.',
    });
  } catch (err: any) {
    console.error('DELETE /api/reports handler error:', err);
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
