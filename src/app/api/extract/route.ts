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

function parsePeriodSortKey(period: string): number {
  if (!period) return 0;
  const str = String(period).trim();
  const yrMatch = str.match(/(20\d{2})/);
  if (!yrMatch) return 0;
  const year = parseInt(yrMatch[1], 10);

  if (/(?:q1|1\.ç|1ç|\/0?3\b|3a\b)/i.test(str)) return year * 100 + 3;
  if (/(?:q2|2\.ç|2ç|\/0?6\b|6a\b)/i.test(str)) return year * 100 + 6;
  if (/(?:q3|3\.ç|3ç|\/0?9\b|9a\b)/i.test(str)) return year * 100 + 9;
  if (/(?:q4|4\.ç|4ç|\/12\b|12a\b)/i.test(str)) return year * 100 + 12;

  return year * 100 + 12;
}

function getAnnualizationFactor(period: string): number {
  if (!period) return 1.0;
  const str = String(period).toLowerCase();
  if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(str)) return 4.0;
  if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(str)) return 2.0;
  if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(str)) return 12.0 / 9.0;
  return 1.0;
}

function enrichAndSanitizeFinancialHistory(data: any) {
  if (!data || !Array.isArray(data.financial_history)) return data;

  const debtInfo = data.debt_and_interest || {};

  // Varsa TL borçlanma faizini tespit et
  let parsedTlRate: number | null = null;
  if (debtInfo.tl_interest_rate) {
    const m = String(debtInfo.tl_interest_rate).match(/(\d+([.,]\d+)?)/);
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (val > 5 && val < 90) parsedTlRate = val;
    }
  }

  // Kronolojik sıralama
  const history = [...data.financial_history].filter(Boolean).sort((a, b) => {
    return parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period);
  });

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    if (!item) continue;

    // Yıl tespiti
    const yrMatch = String(item.period || '').match(/(20\d{2})/);
    const yr = yrMatch ? parseInt(yrMatch[1], 10) : 2024;

    // Eksik marjları hesapla
    if (item.revenue && item.revenue > 0) {
      if (item.ebitda_margin == null && typeof item.ebitda === 'number') {
        item.ebitda_margin = Number(((item.ebitda / item.revenue) * 100).toFixed(1));
      }
      if (item.net_margin == null && typeof item.net_income === 'number') {
        item.net_margin = Number(((item.net_income / item.revenue) * 100).toFixed(1));
      }
      if (item.gross_margin == null && typeof item.gross_profit === 'number') {
        item.gross_margin = Number(((item.gross_profit / item.revenue) * 100).toFixed(1));
      }
    }

    // 1. Gerçekçi Türkiye piyasa WACC tabanı (TCMB ve faiz ortamı)
    let defaultWacc = 45.0; // 2024-2026 yüksek faiz ortamı varsayılanı
    if (yr <= 2021) defaultWacc = 18.5;
    else if (yr === 2022) defaultWacc = 22.0;
    else if (yr === 2023) defaultWacc = 32.5;
    else if (yr >= 2024) defaultWacc = 44.0;

    if (parsedTlRate) {
      defaultWacc = Number((parsedTlRate * 0.95).toFixed(1));
    }

    // WACC boş, 0 veya geçersizse tamamla
    if (item.wacc == null || item.wacc === 0 || isNaN(Number(item.wacc))) {
      item.wacc = defaultWacc;
    } else {
      item.wacc = Number(Number(item.wacc).toFixed(1));
    }

    // 2. ROIC boş, 0 veya geçersizse finansal tablolardan türet
    if (item.roic == null || item.roic === 0 || isNaN(Number(item.roic))) {
      const equity = typeof item.equity === 'number' && item.equity > 0 ? item.equity : 0;
      const netDebt = typeof item.net_debt === 'number' && item.net_debt > 0 ? item.net_debt : 0;
      const investedCapital = equity + netDebt;

      const annualFactor = getAnnualizationFactor(item.period);
      const rawNopat = (typeof item.net_income === 'number' && item.net_income !== 0)
        ? item.net_income
        : ((typeof item.ebitda === 'number' && item.ebitda > 0) ? item.ebitda * 0.70 : 0);
      const nopat = rawNopat * annualFactor;

      if (investedCapital > 0 && nopat !== 0) {
        const calculated = (nopat / investedCapital) * 100;
        if (calculated >= -50 && calculated <= 150) {
          item.roic = Number(calculated.toFixed(1));
        } else if (typeof item.ebitda_margin === 'number' && item.ebitda_margin > 0) {
          item.roic = Number((item.ebitda_margin * 0.85).toFixed(1));
        } else {
          item.roic = Number((item.wacc * 0.88).toFixed(1));
        }
      } else if (typeof item.ebitda_margin === 'number' && item.ebitda_margin > 0) {
        item.roic = Number((item.ebitda_margin * 0.85).toFixed(1));
      } else if (typeof item.gross_margin === 'number' && item.gross_margin > 0) {
        item.roic = Number((item.gross_margin * 0.65).toFixed(1));
      } else {
        const prevRoic = i > 0 && history[i - 1]?.roic ? history[i - 1].roic : null;
        item.roic = prevRoic !== null ? prevRoic : Number((item.wacc * 0.88).toFixed(1));
      }
    } else {
      item.roic = Number(Number(item.roic).toFixed(1));
    }

    item.eva_spread = Number((item.roic - item.wacc).toFixed(1));
  }

  data.financial_history = history;
  return data;
}

function mergeExtractedData(results: any[]) {
  if (!results || results.length === 0) return {};
  if (results.length === 1) return enrichAndSanitizeFinancialHistory(results[0]);

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
    return parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period);
  });

  merged.guidance_track_record = Array.from(guidanceMap.values()).sort((a, b) => {
    return String(a.year_or_period).localeCompare(String(b.year_or_period), undefined, { numeric: true });
  });

  return enrichAndSanitizeFinancialHistory(merged);
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let ticker = '';
    let documents: { name: string; text: string }[] = [];
    let pdfFiles: File[] = [];

    if (contentType.includes('application/json')) {
      const json = await req.json();
      ticker = json.ticker || '';
      documents = json.documents || [];
    } else {
      const formData = await req.formData();
      ticker = formData.get('ticker') as string;
      pdfFiles = formData.getAll('files') as File[];
    }

    if (!ticker || (documents.length === 0 && pdfFiles.length === 0)) {
      return NextResponse.json({ error: 'Hisse kodu ve en az bir PDF/doküman gereklidir.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY eksik.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

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
              roic: { type: Type.NUMBER, description: 'Yatırılan Sermaye Getirisi (ROIC % - 2024, 2025 ve sonrası dahil her dönem için hesaplanmalıdır. Raporda doğrudan yoksa NOPAT / Yatırılan Sermaye ile hesapla)' },
              wacc: { type: Type.NUMBER, description: 'Ağırlıklı Ortalama Sermaye Maliyeti (WACC % - 2024, 2025 ve sonrası dahil her dönem için hesaplanmalıdır. Raporda yoksa dönemin faiz koşulları ve borç faizinden hesapla)' },
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

    const systemInstruction = `Sen katı, rasyonel ve zaman serisi (multi-year) analizi yapabilen kıdemli bir Finansal Veri Çıkarım motorusun.
GÖREVİN:
Yüklenen finansal raporları tarayarak finansal kalemleri, marjları, borç profillerini ve geçmiş hedef/rehberlikleri birebir çıkarmaktır.

KURALLAR:
1. Zaman serisi (financial_history) dizisinde bulunan tüm yılları (özellikle 2024, 2025, 2026 gibi güncel dönemleri) eksiksiz doldur.
2. ROIC ve WACC ZORUNLULUĞU: Şirket raporlarında veya sunumlarında ROIC ve WACC doğrudan yazmıyorsa dahi, tablolardaki NOPAT (veya Net Kâr / Faaliyet Kârı) ve Yatırılan Sermaye (Özkaynak + Net Borç) verilerinden her dönem (özellikle 2024 ve sonrası) için ROIC oranını hesapla. WACC için ise şirketin borçlanma faiz oranı ve dönemin Türkiye piyasa gösterge faizlerini (2024-2026 için %42-%48 bandı) dikkate alarak gerçekçi bir WACC oranı belirle. Asla 0 veya boş bırakma.
3. 'guidance_track_record' kısmında: Şirketin geçmiş yıllarda yatırımcılara sunduğu hedefleri ve gerçekleşme durumunu eksiksiz tara.
4. KESİNLİKLE RASTGELE SAYI UYDURMA, çıkarımlarını finansal tablolardaki verilere ve standart finans matematiğine dayandır.`;

    const batchResults: any[] = [];

    if (documents.length > 0) {
      // 1. İstemci Tarafından Ayıklanmış Metin Dokümanları (Vercel 4.5 MB Sınırını Kesinlikle Aşmaz)
      const DOC_BATCH_SIZE = 3;
      for (let i = 0; i < documents.length; i += DOC_BATCH_SIZE) {
        const batch = documents.slice(i, i + DOC_BATCH_SIZE);
        const docTexts = batch.map((d: any) => `### RAPOR DOKÜMANI: ${d.name}\n${d.text}`).join('\n\n---\n\n');

        const userPrompt = `Şirket: ${ticker.toUpperCase()}.
Aşağıda şirkete ait yüklenen faaliyet raporları, bilançolar ve gelir tablolarının metinleri yer almaktadır (Paket ${Math.floor(i / DOC_BATCH_SIZE) + 1}/${Math.ceil(documents.length / DOC_BATCH_SIZE)}):

${docTexts}

GÖREVLER:
1. Belgede yer alan tüm dönemlere ait Hasılat (revenue), FAVÖK (ebitda), Net Kâr (net_income), Marjlar (%), Nakit Akışları (OCF, CAPEX, FCF), Net Borç (net_debt) ve ROIC/WACC verilerini eksiksiz çıkar veya hesapla (özellikle 2024 ve sonraki yıllar dahil).
2. Varsa geçmiş yönetim hedeflerini (guidance) ve gerçekleşmelerini çıkar.
3. Rakamları tam veya ondalıklı sayı olarak ver.`;

        try {
          const response = await generateWithFallback(ai, {
            contents: [userPrompt],
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
          console.error(`[Extract Text] Paket ${Math.floor(i / DOC_BATCH_SIZE) + 1} işlenirken hata:`, batchError);
        }
      }
    } else {
      // 2. Ham PDF Dosyaları (Doğrudan FormData Akışı)
      const BATCH_SIZE = pdfFiles.length > 5 ? 2 : (pdfFiles.length > 2 ? 2 : pdfFiles.length);
      const fileBatches: File[][] = [];
      for (let i = 0; i < pdfFiles.length; i += BATCH_SIZE) {
        fileBatches.push(pdfFiles.slice(i, i + BATCH_SIZE));
      }

      for (let bIndex = 0; bIndex < fileBatches.length; bIndex++) {
        const currentBatch = fileBatches[bIndex];
        const tempFilePaths: string[] = [];
        const uploadedGoogleFiles: any[] = [];
        const fileParts: any[] = [];

      try {
        console.log(`[Extract] Paket ${bIndex + 1}/${fileBatches.length} işleniyor (${currentBatch.length} PDF)...`);

        for (const file of currentBatch) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const tempPath = path.join(os.tmpdir(), `${Date.now()}_${bIndex}_${safeName}`);
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

        const userPrompt = `Şirket: ${ticker.toUpperCase()}. 
Ekteki belgeleri incele (Paket ${bIndex + 1}/${fileBatches.length}):
1. Belgede yer alan tüm dönemlere ait Hasılat (revenue), FAVÖK (ebitda), Net Kâr (net_income), Marjlar (%), Nakit Akışları (OCF, CAPEX, FCF), Net Borç (net_debt) ve ROIC/WACC verilerini eksiksiz çıkar veya hesapla (özellikle 2024 ve sonraki yıllar dahil).
2. Varsa geçmiş yönetim hedeflerini (guidance) ve gerçekleşmelerini çıkar.
3. Rakamları tam veya ondalıklı sayı olarak ver.`;

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
