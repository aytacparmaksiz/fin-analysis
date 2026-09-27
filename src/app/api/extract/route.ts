import { GoogleGenAI, Type, Schema } from '@google/genai';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const runtime = 'nodejs';
export const maxDuration = 300; // Çoklu ve hacimli PDF grupları için süreyi 5 dakikaya genişletiyoruz

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

async function generateWithFallback(ai: GoogleGenAI, baseParams: any) {
  let lastError: any;
  for (const model of CANDIDATE_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent({
          ...baseParams,
          model,
        });
      } catch (err: any) {
        lastError = err;
        console.warn(`[Extract] Model ${model} (Deneme ${attempt + 1}) yanıt vermedi:`, err?.status || err?.message);
        if (err?.status === 503 || err?.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        } else {
          break;
        }
      }
    }
  }
  throw lastError;
}

function mergeExtractedData(results: any[]) {
  if (!results || results.length === 0) return {};
  if (results.length === 1) return results[0];

  const merged: any = {
    ticker: '',
    currency: '',
    reporting_period: '',
    share_count: '',
    financial_history: [],
    guidance_track_record: [],
    balance_sheet_summary: [],
    debt_and_interest: {},
    capex_and_kpi: {},
  };

  const periodMap = new Map<string, any>();
  const guidanceMap = new Map<string, any>();

  for (const r of results) {
    if (!r) continue;
    if (r.ticker && !merged.ticker) merged.ticker = r.ticker;
    if (r.currency && !merged.currency) merged.currency = r.currency;
    if (r.share_count && !merged.share_count) merged.share_count = r.share_count;

    if (r.reporting_period) {
      if (!merged.reporting_period || String(r.reporting_period) > String(merged.reporting_period)) {
        merged.reporting_period = r.reporting_period;
        if (r.debt_and_interest) merged.debt_and_interest = r.debt_and_interest;
        if (r.capex_and_kpi) merged.capex_and_kpi = r.capex_and_kpi;
        if (r.currency) merged.currency = r.currency;
      }
    }

    if (Array.isArray(r.financial_history)) {
      for (const item of r.financial_history) {
        if (!item || !item.period) continue;
        const key = String(item.period).trim();
        if (periodMap.has(key)) {
          const existing = periodMap.get(key);
          periodMap.set(key, { ...existing, ...item });
        } else {
          periodMap.set(key, { ...item });
        }
      }
    }

    if (Array.isArray(r.guidance_track_record)) {
      for (const g of r.guidance_track_record) {
        if (!g || !g.year_or_period) continue;
        const key = `${g.year_or_period}_${(g.guidance_given || '').slice(0, 30)}`;
        if (!guidanceMap.has(key)) {
          guidanceMap.set(key, g);
        }
      }
    }

    if (Array.isArray(r.balance_sheet_summary)) {
      for (const b of r.balance_sheet_summary) {
        if (b && b.metric && !merged.balance_sheet_summary.some((x: any) => x.metric === b.metric)) {
          merged.balance_sheet_summary.push(b);
        }
      }
    }
  }

  merged.financial_history = Array.from(periodMap.values()).sort((a, b) => {
    return String(a.period).localeCompare(String(b.period), undefined, { numeric: true });
  });

  merged.guidance_track_record = Array.from(guidanceMap.values()).sort((a, b) => {
    return String(a.year_or_period).localeCompare(String(b.year_or_period), undefined, { numeric: true });
  });

  return merged;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const ticker = formData.get('ticker') as string;
    const pdfFiles = formData.getAll('files') as File[];

    if (!ticker || pdfFiles.length === 0) {
      return NextResponse.json({ error: 'Hisse kodu ve en az bir PDF yüklenmelidir.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY eksik.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    // 1. Token Sınırını (1,048,576 Token) Aşmamak İçin Akıllı Gruplama (Batching)
    // 8 veya daha fazla PDF tek seferde gönderildiğinde 1M token sınırını aşar.
    // Dosyaları 2'şerli güvenli paketlere ayırıp bağımsız çıkarıyor ve sonuçları birleştiriyoruz.
    const BATCH_SIZE = pdfFiles.length > 5 ? 2 : (pdfFiles.length > 2 ? 2 : pdfFiles.length);
    const fileBatches: File[][] = [];
    for (let i = 0; i < pdfFiles.length; i += BATCH_SIZE) {
      fileBatches.push(pdfFiles.slice(i, i + BATCH_SIZE));
    }

    const extractionSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        ticker: { type: Type.STRING },
        currency: { type: Type.STRING, description: 'Raporlanan para birimi (Örn: Milyon TL, Bin TL, TL)' },
        reporting_period: { type: Type.STRING, description: 'En güncel dönem (Örn: 2026/06 veya 2026/12)' },
        share_count: { type: Type.STRING, description: 'Ödenmiş sermaye / hisse adedi' },

        financial_history: {
          type: Type.ARRAY,
          description: 'İncelenen raporlara ait finansal zaman serisi verileri',
          items: {
            type: Type.OBJECT,
            properties: {
              period: { type: Type.STRING, description: 'Dönem veya Yıl (Örn: 2022, 2023, 2024, 2025, 2026)' },
              revenue: { type: Type.NUMBER, description: 'Net Satış Gelirleri / Hasılat' },
              ebitda: { type: Type.NUMBER, description: 'FAVÖK' },
              net_income: { type: Type.NUMBER, description: 'Net Dönem Kârı' },
              gross_margin: { type: Type.NUMBER, description: 'Brüt Kâr Marjı (%)' },
              ebitda_margin: { type: Type.NUMBER, description: 'FAVÖK Marjı (%)' },
              net_margin: { type: Type.NUMBER, description: 'Net Kâr Marjı (%)' },
              operating_cash_flow: { type: Type.NUMBER, description: 'İşletme Faaliyetlerinden Nakit Akışı (OCF)' },
              capex: { type: Type.NUMBER, description: 'Yatırım Harcamaları (CAPEX)' },
              free_cash_flow: { type: Type.NUMBER, description: 'Serbest Nakit Akışı (FCF)' },
              net_debt: { type: Type.NUMBER, description: 'Net Finansal Borç' },
              roic: { type: Type.NUMBER, description: 'Yatırılan Sermaye Getirisi (ROIC %)' },
              wacc: { type: Type.NUMBER, description: 'Ağırlıklı Ortalama Sermaye Maliyeti (WACC %)' },
              equity: { type: Type.NUMBER, description: 'Toplam Özkaynaklar' },
            },
            required: ['period', 'revenue', 'ebitda', 'net_income'],
          },
        },

        guidance_track_record: {
          type: Type.ARRAY,
          description: 'Şirketin geçmiş yıllarda sunduğu hedefler/rehberlikler ve gerçekleşme oranları',
          items: {
            type: Type.OBJECT,
            properties: {
              year_or_period: { type: Type.STRING, description: 'Hedef dönemi (Örn: 2023, 2024, 2025)' },
              guidance_given: { type: Type.STRING, description: 'Yönetimin açıkladığı ciro, marj veya satış adedi hedefi' },
              actual_realized: { type: Type.STRING, description: 'Yıl sonunda gerçekleşen sonuç' },
              status: { type: Type.STRING, description: 'BAŞARILI, KISMEN, BAŞARISIZ veya BELİRTİLMEDİ' },
              analysis: { type: Type.STRING, description: 'Sapmanın nedeni ve yönetimin vaat tutma karnesi' },
            },
            required: ['year_or_period', 'guidance_given', 'actual_realized', 'status'],
          },
        },

        balance_sheet_summary: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              metric: { type: Type.STRING },
              val_latest: { type: Type.STRING },
              val_prev_year: { type: Type.STRING },
              page_ref: { type: Type.STRING, description: 'Verinin bulunduğu sayfa no / dipnot no' },
            },
            required: ['metric', 'val_latest'],
          },
        },

        debt_and_interest: {
          type: Type.OBJECT,
          properties: {
            short_term_debt_ratio: { type: Type.STRING, description: 'Kısa vadeli borç payı (%)' },
            long_term_debt_ratio: { type: Type.STRING, description: 'Uzun vadeli borç payı (%)' },
            tl_interest_rate: { type: Type.STRING, description: 'TL kredi efektif faizi' },
            fx_interest_rate: { type: Type.STRING, description: 'Döviz kredi efektif faizi' },
            ttm_favok: { type: Type.STRING, description: 'Son 4 Çeyreklik FAVÖK' },
            page_ref: { type: Type.STRING },
          },
        },

        capex_and_kpi: {
          type: Type.OBJECT,
          properties: {
            maintenance_capex: { type: Type.STRING, description: 'İdame CAPEX' },
            growth_capex: { type: Type.STRING, description: 'Büyüme CAPEX' },
            management_guidance: { type: Type.STRING, description: 'Gelecek dönem yönetici rehberliği' },
            planned_capex_budget: { type: Type.STRING, description: 'Planlanan büyük yatırım bütçesi' },
            sectoral_kpis: { type: Type.STRING, description: 'Sektörel KPI incelemesi' },
            sensitivity_summary: { type: Type.STRING, description: 'Duyarlılık analizi özeti' },
          },
        },
      },
      required: ['ticker', 'reporting_period', 'financial_history'],
    };

    const systemInstruction = `Sen katı, sıfır toleranslı ve zaman serisi (multi-year) analizi yapabilen kıdemli bir Finansal Veri Çıkarım motorusun.
GÖREVİN:
Yüklenen finansal raporları tarayarak finansal kalemleri, marjları, borç profillerini ve varsa geçmiş hedef/rehberlikleri birebir çıkarmaktır.

KURALLAR:
1. Zaman serisi (financial_history) dizisinde bulunan tüm yılları eksiksiz doldur.
2. 'guidance_track_record' kısmında: Şirketin geçmiş yıllarda yatırımcılara sunduğu hedefleri ve gerçekleşme durumunu tara.
3. KESİNLİKLE TAHMİN YAPMA, ASLA HALÜSİNASYON GÖRME.`;

    const batchResults: any[] = [];

    // Her paketi bağımsız olarak işle
    for (let bIndex = 0; bIndex < fileBatches.length; bIndex++) {
      const currentBatch = fileBatches[bIndex];
      const tempFilePaths: string[] = [];
      const uploadedGoogleFiles: any[] = [];
      const fileParts: any[] = [];

      try {
        console.log(`[Extract] Paket ${bIndex + 1}/${fileBatches.length} işleniyor (${currentBatch.length} PDF)...`);

        for (const file of currentBatch) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const tempPath = path.join(os.tmpdir(), `${Date.now()}_${bIndex}_${file.name}`);
          fs.writeFileSync(tempPath, buffer);
          tempFilePaths.push(tempPath);

          const uploadResult = await ai.files.upload({
            file: tempPath,
            config: {
              mimeType: 'application/pdf',
            },
          });

          let fileObj = uploadResult;
          while (fileObj.state === 'PROCESSING') {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            fileObj = await ai.files.get({ name: uploadResult.name! });
          }

          uploadedGoogleFiles.push(fileObj);

          fileParts.push({
            fileData: {
              fileUri: fileObj.uri!,
              mimeType: fileObj.mimeType || 'application/pdf',
            },
          });
        }

        const userPrompt = `Şirket: ${ticker}. 
Ekteki belgeleri incele (Paket ${bIndex + 1}/${fileBatches.length}):
1. Belgede yer alan tüm dönemlere ait Hasılat, FAVÖK, Net Kâr, Marjlar, Nakit Akışları ve ROIC/WACC verilerini çıkar.
2. Varsa geçmiş yönetim hedeflerini (guidance) ve gerçekleşmelerini çıkar.`;

        const response = await generateWithFallback(ai, {
          contents: [...fileParts, userPrompt],
          config: {
            systemInstruction,
            temperature: 0.0,
            responseMimeType: 'application/json',
            responseSchema: extractionSchema,
          },
        });

        const parsedData = JSON.parse(response.text || '{}');
        batchResults.push(parsedData);
      } catch (batchError: any) {
        console.error(`[Extract] Paket ${bIndex + 1} işlenirken hata:`, batchError);
      } finally {
        // Geçici yerel ve Google dosyalarını her paketten sonra hemen silerek kota şişmesini önle
        for (const p of tempFilePaths) {
          if (fs.existsSync(p)) {
            try {
              fs.unlinkSync(p);
            } catch (e) {}
          }
        }
        for (const gf of uploadedGoogleFiles) {
          try {
            if (gf?.name) {
              const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
              await client.files.delete({ name: gf.name });
            }
          } catch (e) {}
        }
      }
    }

    if (batchResults.length === 0) {
      return NextResponse.json({ error: 'Yüklenen PDF belgelerinden veri çıkarılamadı.' }, { status: 500 });
    }

    // Çıkarılan tüm paketleri tek bir kronolojik zaman serisinde birleştir
    const finalData = mergeExtractedData(batchResults);
    return NextResponse.json({ success: true, data: finalData });

  } catch (error: any) {
    console.error('Extraction Error:', error);
    return NextResponse.json({ error: error.message || 'Veri çıkarımı başarısız oldu.' }, { status: 500 });
  }
}
