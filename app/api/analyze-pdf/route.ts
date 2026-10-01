import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { 
  generateWithRateLimitAndBackoff, 
  computeContentHash 
} from '@/lib/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const tempFilePaths: string[] = [];
  const uploadedGoogleFiles: any[] = [];
  const fileParts: any[] = [];

  try {
    const formData = await req.formData();
    const ticker = formData.get('ticker') as string;
    const price = formData.get('price') as string;
    const consensus = (formData.get('consensus') as string) || 'Belirtilmedi';
    const peerMultiples = (formData.get('peerMultiples') as string) || 'Belirtilmedi';

    // Yüklenen tüm PDF dosyalarını al
    const pdfFiles = formData.getAll('files') as File[];

    if (!ticker || !price || pdfFiles.length === 0) {
      return NextResponse.json(
        { error: 'Hisse kodu, güncel fiyat ve en az bir PDF belgesi zorunludur.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY bulunamadı.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // 1. PDF Dosyalarını Diske ve Ardından Gemini File API'ye Yükleme
    for (const file of pdfFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
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

      fileParts.push({
        fileData: {
          fileUri: fileObj.uri!,
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

🚨 [KIRMIZI BAYRAK] ve Yatırım Tezi (Storytelling)
(Şirketin iş modeli, rekabet avantajı ve tablolarda gizlenen majör riskler/fırsatlar.)

1. Sermaye Tahsisi, Likidite ve Borç Profili (Filme Bakış)
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
| Hikaye, Katalizör ve Büyüme (Growth CAPEX) | X | 25 | ... |
| **Toplam Puan** | **X** | **100** | ... |

Analist Kararı: [AL / ALMA / NÖTR] (Net ve tavizsiz karar)`;

    const promptText = `Hisse Kodu: ${ticker}
Güncel Fiyat: ${price} TL
Konsensüs Beklentileri: ${consensus}
Sektör/Rakip Çarpanları: ${peerMultiples}

Ekteki PDF dokümanlarını (Finansal Tablolar, Dipnotlar, Faaliyet Raporları ve Sunumlar) kullanarak analizi gerçekleştir ve nihai değerleme raporunu oluştur.`;

    const pdfHash = computeContentHash(pdfFiles.map(f => `${f.name}_${f.size}`).join(';'));
    const cacheKey = `analyze_pdf_${ticker.toUpperCase()}_${price}_${pdfHash}`;

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
    const status = error?.status === 429 || error?.isRateLimit ? 429 : 500;
    return NextResponse.json(
      { 
        error: error.message || 'PDF analiz edilirken hata oluştu.',
        retryAfter: error.retryAfter || 5,
        isRateLimit: status === 429
      },
      { status }
    );
  } finally {
    // 4. Sunucudaki geçici disk dosyalarını sil
    for (const p of tempFilePaths) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch (e) {
          /* ignore */
        }
      }
    }
    // Google File API'deki dosyaları temizle (kota şişmesini önler)
    for (const gf of uploadedGoogleFiles) {
      try {
        if (gf?.name) {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
          await ai.files.delete({ name: gf.name });
        }
      } catch (e) {
        /* ignore */
      }
    }
  }
}
