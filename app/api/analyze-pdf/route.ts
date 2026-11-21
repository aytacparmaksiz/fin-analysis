import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  generateWithRateLimitAndBackoff,
  computeContentHash,
} from '@/lib/gemini';
import {
  normalizeTicker,
  isValidTicker,
  authorizeApiMutation,
  checkRateLimit,
  sanitizePromptInput,
} from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_PDF_FILES = 5;
const MAX_SINGLE_PDF_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_PDF_BYTES = 30 * 1024 * 1024;

export async function POST(req: Request) {
  const tempFilePaths: string[] = [];
  const uploadedGoogleFiles: any[] = [];
  const fileParts: any[] = [];

  try {
    const rl = checkRateLimit(req, 'analyze_pdf', 15, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Çok fazla PDF analiz isteği gönderildi. Lütfen bekleyin.', retryAfter: rl.retryAfterSec, isRateLimit: true },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
      );
    }

    const auth = authorizeApiMutation(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.reason || 'Yetkisiz işlem.' },
        { status: auth.status }
      );
    }

    const formData = await req.formData();
    const rawTicker = (formData.get('ticker') as string) || '';
    const cleanTicker = normalizeTicker(rawTicker);
    const price = String(formData.get('price') || '').trim();
    const consensus = sanitizePromptInput(formData.get('consensus'), 1500) || 'Belirtilmedi';
    const peerMultiples = sanitizePromptInput(formData.get('peerMultiples'), 1500) || 'Belirtilmedi';

    const pdfFiles = formData.getAll('files') as File[];

    if (!isValidTicker(cleanTicker) || !price || pdfFiles.length === 0) {
      return NextResponse.json(
        { error: 'Geçerli hisse kodu, güncel fiyat ve en az bir PDF belgesi zorunludur.' },
        { status: 400 }
      );
    }

    const parsedPrice = Number(price.replace(',', '.'));
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return NextResponse.json(
        { error: 'Geçerli bir pozitif hisse fiyatı gereklidir.' },
        { status: 400 }
      );
    }

    if (pdfFiles.length > MAX_PDF_FILES) {
      return NextResponse.json(
        { error: `Tek seferde en fazla ${MAX_PDF_FILES} adet PDF yüklenebilir.` },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY bulunamadı.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const contentHasher = crypto.createHash('sha256');
    let totalBytes = 0;

    // 1. Dosya boyutlarını doğrula, SHA-256 hash üret ve Gemini File API'ye yükle
    const bufferedFiles: Array<{ file: File; buffer: Buffer }> = [];
    for (const file of pdfFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > MAX_SINGLE_PDF_BYTES) {
        return NextResponse.json(
          { error: `Dosya boyutu sınırı aşıldı (${file.name}, maks 15 MB).` },
          { status: 413 }
        );
      }
      totalBytes += buffer.length;
      if (totalBytes > MAX_TOTAL_PDF_BYTES) {
        return NextResponse.json(
          { error: 'Toplam PDF dosya boyutu 30 MB sınırını aşıyor.' },
          { status: 413 }
        );
      }
      contentHasher.update(buffer);
      bufferedFiles.push({ file, buffer });
    }

    for (const { file, buffer } of bufferedFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const tempPath = path.join(os.tmpdir(), `${Date.now()}_${safeName}`);
      fs.writeFileSync(tempPath, buffer);
      tempFilePaths.push(tempPath);

      const uploadResult = await ai.files.upload({
        file: tempPath,
        config: {
          mimeType: 'application/pdf',
        },
      });

      let fileObj = uploadResult;
      let pollAttempts = 0;
      while (fileObj.state === 'PROCESSING' && pollAttempts < 10) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        fileObj = await ai.files.get({ name: uploadResult.name! });
        pollAttempts++;
      }

      uploadedGoogleFiles.push(fileObj);

      if (fileObj.state !== 'ACTIVE' || !fileObj.uri) {
        const err: any = new Error(
          fileObj.state === 'PROCESSING'
            ? `PDF işleme süresi doldu (${file.name}).`
            : `PDF dosyası işlenemedi (${file.name}, durum: ${fileObj.state || 'UNKNOWN'}).`
        );
        err.status = fileObj.state === 'PROCESSING' ? 504 : 502;
        throw err;
      }

      fileParts.push({
        fileData: {
          fileUri: fileObj.uri,
          mimeType: fileObj.mimeType || 'application/pdf',
        },
      });
    }

    // 2. Fon Yöneticisi Değerleme Direktifi
    const currentDateStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

    const systemInstruction = `Sen acımasız, aşırı objektif ve kurumsal bir fon yöneticisisin. 
Hiçbir finansal veriyi güzelleştirme (sugarcoating yapma).
Yüklenen finansal raporlar, faaliyet raporları ve yatırımcı sunumlarını doğrudan analiz et.

GÖREVİN:
1. Aşama: Yüklenen belgelerden Bilanço ve Likidite, Gelir Tablosu/Nakit Akışı (OCF, CAPEX ayrımı, TTM FAVÖK, Borç profili) ve Gelecek Projeksiyonlarını eksiksiz çıkar.
2. Aşama: Bu verileri acımasız filtrelerinden, ROIC vs WACC makasından (özellikle 2024 ve sonrası için artan sermaye maliyeti karşısında değer üretimi), Owner's Earnings (Buffett modeli) ve DCF modelinden geçir.
3. Aşama: Matematiksel formülleri (DCF, NAV İskontosu, Bear Case Taban Fiyatı, EVA Makası) temiz KaTeX display formatında tek başına ayrı satırlarda sun:
   $$
   \\text{Muhafazakar Adil Değer} = 154,58 \\text{ TL} \\times (1 - 0,30) = \\mathbf{108,20\\text{ TL}}
   $$
   Formül içi yüzdelerde \\% kullan. Asla bozuk veya yarım LaTeX etiketleri bırakma.

RAPOR FORMATINI KESİNLİKLE ŞU YAPIDA VE TABULAR FORMDA SUN:

${currentDateStr} - [HİSSE KODU] Kapsamlı Kurumsal Değerleme Raporu

Piyasa Özeti:
- Güncel Fiyat:
- Piyasa Değeri:
- Firma Değeri (EV):

🚨 [KIRMIZI BAYRAK] ve Yatırım Tezi (Temel Tez)
(Şirketin iş modeli, rekabet avantajı ve tablolarda gizlenen majör riskler/fırsatlar.)

1. Sermaye Tahsisi, Likidite ve Borç Profili
(Net nakit döngüsü, borçların vade/faiz profili ve kriz likidite analizi.)

2. Kârlılık Kalitesi ve Değer Yaratımı (ROIC vs. WACC)
- Brüt / FAVÖK / Net Marj Trendi (Geçmiş 3 Yıl)
- DuPont Analizi ve ROE
- Operasyonel ROIC ve WACC Makası (Ekonomik kâr üretimi var mı, yoksa sermaye mi yok ediliyor?)
- Sektörel KPI İncelemesi

3. Nakit Akış Kalitesi ve Hissedar Kazancı (Owner's Earnings)
- İşletme Nakit Akışı (OCF) ve Nakit Dönüşüm Oranı
- CAPEX Ayrıştırması (Maintenance vs Growth CAPEX)
- Hissedar Kazancı (Owner's Earnings) ve Gerçek FCF

4. İleriye Dönük Analiz ve İskonto (Valuation)
- İleriye Dönük (Forward) EV/EBITDA
- DCF ve Çarpan Bazlı Adil Değer (Fair Value) ve İskonto Oranı

5. Ayı Senaryosu (Bear Case) ve Duyarlılık Analizi
(Faiz, kur şokları ve en kötü senaryoda taban hedef fiyat.)

6. Nihai Puanlama ve Analist Kararı
| Metrik | Puan | Max | Gerekçe |
| :--- | :--- | :--- | :--- |
| Finansal Sağlık & Likidite | X | 25 | ... |
| Sermaye Verimliliği (ROIC > WACC) | X | 25 | ... |
| Nakit Kalitesi ve Güvenlik Marjı | X | 25 | ... |
| Katalizör ve Büyüme (Growth CAPEX) | X | 25 | ... |
| **Toplam Puan** | **X** | **100** | ... |

Analist Kararı: [AL / ALMA / NÖTR] (Net ve tavizsiz karar)`;

    const promptText = `Hisse Kodu: ${cleanTicker}
Güncel Fiyat: ${parsedPrice} TL
Konsensüs Beklentileri:
<USER_SUPPLIED_DATA>${consensus}</USER_SUPPLIED_DATA>
Sektör/Rakip Çarpanları:
<USER_SUPPLIED_DATA>${peerMultiples}</USER_SUPPLIED_DATA>

Ekteki PDF dokümanlarını (Finansal Tablolar, Dipnotlar, Faaliyet Raporları ve Sunumlar) kullanarak analizi gerçekleştir ve nihai değerleme raporunu oluştur.`;

    const pdfHash = contentHasher.digest('hex').slice(0, 16);
    const metaHash = computeContentHash(`${consensus}|${peerMultiples}`);
    const cacheKey = `analyze_pdf_v2_${cleanTicker}_${parsedPrice}_${pdfHash}_${metaHash}`;

    const response = await generateWithRateLimitAndBackoff({
      ai,
      preferredModel: 'gemini-3.5-flash-lite',
      baseParams: {
        contents: [...fileParts, promptText],
        config: {
          systemInstruction,
          temperature: 0.1,
        },
      },
      cacheKey,
    });

    return NextResponse.json({ report: response.text });
  } catch (error: any) {
    console.error('PDF Analiz Hatası:', error);
    const status =
      error?.status === 429 || error?.isRateLimit
        ? 429
        : error?.status === 502 || error?.status === 504
        ? error.status
        : 500;
    return NextResponse.json(
      {
        error: error.message || 'PDF analiz edilirken hata oluştu.',
        retryAfter: error.retryAfter || 5,
        isRateLimit: status === 429,
      },
      { status }
    );
  } finally {
    for (const p of tempFilePaths) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    }
    for (const gf of uploadedGoogleFiles) {
      try {
        if (gf?.name && process.env.GEMINI_API_KEY) {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          await ai.files.delete({ name: gf.name });
        }
      } catch {}
    }
  }
}
