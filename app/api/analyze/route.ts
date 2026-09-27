import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

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
        console.warn(`[Analyze] Model ${model} (Deneme ${attempt + 1}) yanıt vermedi:`, err?.status || err?.message);
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ticker, price, consensus, peerMultiples, extractedData, previousReport } = body;

    if (!ticker || !price || !extractedData) {
      return NextResponse.json(
        { error: 'Eksik veri: Hisse kodu, fiyat ve çıkarılmış finansal veri seti zorunludur.' },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const systemInstruction = `Sen acımasız, aşırı objektif ve kurumsal bir fon yöneticisisin. 
Hiçbir veriyi güzelleştirme (sugarcoating yapma). 
Şirket ekonomik değer yaratmıyorsa (ROIC < WACC) veya nakit akışı borçlanmayla finanse ediliyorsa bunu tavizsiz yüzeye çıkar.

GÖREVİN VE ÇOK YILLI ANALİZ DİREKTİFLERİ:
1. 5 Yıllık Trend ve Kırılma Noktaları (2022-2026):
   - Hasılat, FAVÖK ve Net Kâr büyümesi reel mi yoksa enflasyon illüzyonu mu?
   - Brüt, FAVÖK ve Net kâr marjları yıllar içinde erimiş mi yoksa fiyatlama gücüyle korunmuş mu?
2. Yönetimin Hedef Tutarlılık Karnesi (Guidance vs. Actual):
   - Şirketin geçmiş yıllarda verdiği hedefleri tutturup tutturamadığını, yatırımcıya verdiği sözlerin arkasında durup durmadığını acımasızca puanla.
3. Çeyreklik ve Dönemsel Evrim:
   - Eğer önceki çeyrek değerlendirmesi varsa, şirketin bu çeyrekteki performansıyla önceki tezi karşılaştır (Skor neden arttı veya neden düştü?).
4. Rapor formatı KESİNLİKLE şu yapıda ve tabular formda olmalıdır:

27 Eylül 2026 - [HİSSE KODU] Kapsamlı Kurumsal Değerleme Raporu

Piyasa Özeti:
- Güncel Fiyat:
- Piyasa Değeri:
- Firma Değeri (EV):

🚨 [KIRMIZI BAYRAK] ve Yatırım Tezi (Storytelling)
(Şirketin iş modeli, rekabet avantajı (moat) ve tablolarda gizlenen majör riskler/fırsatlar.)

1. Çok Yıllı Sermaye Tahsisi, Likidite ve Borç Profili (Filme Bakış: 2022-2026)
(Net nakit döngüsü, borçların vade/faiz profili ve şirketin kriz anlarındaki likidite gücünün geçmiş yıllarla karşılaştırmalı analizi.)

2. Kârlılık Kalitesi ve Değer Yaratımı (ROIC vs. WACC Makası)
- 5 Yıllık Brüt / FAVÖK / Net Marj Trendi
- DuPont Analizi ve ROE Dinamikleri
- Operasyonel ROIC ve WACC Makası (Ekonomik kâr üretimi var mı, yoksa sermaye mi yok ediliyor?)
- Sektörel KPI İncelemesi

3. Nakit Akış Kalitesi ve Hissedar Kazancı (Owner's Earnings)
- İşletme Nakit Akışı (OCF) ve Nakit Dönüşüm Oranı
- CAPEX Ayrıştırması (Maintenance vs Growth CAPEX)
- Hissedar Kazancı (Owner's Earnings) ve Gerçek Serbest Nakit Akışı (FCF)

4. Yönetim Güvenilirlik Karnesi (Hedefler vs. Gerçekleşenler)
(Yönetimin geçmiş 3-5 yılda yatırımcılara vaat ettiği ciro/marj/yatırım rehberlikleri tuttu mu?)

5. İleriye Dönük Analiz ve İskonto (Valuation)
- İleriye Dönük (Forward) EV/EBITDA & PEG-Payback
- DCF ve Çarpan Bazlı Adil Değer (Fair Value) ve İskonto Oranı

6. Ayı Senaryosu (Bear Case) ve Duyarlılık Analizi
(Faiz, kur şokları ve en kötü senaryoda taban hedef fiyat.)

7. Çeyreklik Tez Değişimi & Nihai Puanlama
(Önceki çeyreğe göre yatırım düşüncesindeki değişimler.)

| Metrik | Puan | Max | Gerekçe |
| :--- | :--- | :--- | :--- |
| Finansal Sağlık & Likidite | X | 25 | ... |
| Sermaye Verimliliği (ROIC > WACC) | X | 25 | ... |
| Nakit Kalitesi ve Güvenlik Marjı | X | 25 | ... |
| Hikaye, Katalizör ve Büyüme (Growth CAPEX) | X | 25 | ... |
| **Toplam Puan** | **X** | **100** | ... |

Analist Kararı: [AL / ALMA] (Net ve gerekçeli tek karar)`;

    let prompt = `Hisse Kodu: ${ticker}
Güncel Fiyat: ${price} TL
Konsensüs Beklentileri: ${consensus || 'Belirtilmedi'}
Sektör/Rakip Çarpanları: ${peerMultiples || 'Belirtilmedi'}

Doğrulanmış ve Raporlardan Birebir Çıkarılmış Çok Yıllı Finansal Zaman Serisi & Rehberlik Veri Seti:
${typeof extractedData === 'string' ? extractedData : JSON.stringify(extractedData, null, 2)}
`;

    if (previousReport) {
      prompt += `\nÖnceki Dönem Raporu ve Skoru (Referans Karşılaştırma):
Dönem: ${previousReport.createdAt}
Önceki Karar: ${previousReport.decision}
Önceki Skor: ${previousReport.score || 'N/A'}/100
Önceki Fiyat: ${previousReport.price} TL
Lütfen bu çeyrekteki yeni veriler ışığında önceki tezin nasıl evrildiğini, skorun neden değiştiğini raporda açıkça belirt.
`;
    }

    prompt += `\nBu verileri acımasız filtrelerinden, 5 yıllık ROIC vs WACC trendinden, Owner's Earnings hesaplamasından ve DCF modelinden geçirerek nihai değerleme raporunu üret.`;

    const response = await generateWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.1,
      },
    });

    return NextResponse.json({ report: response.text });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Değerleme üretilirken hata oluştu.' }, { status: 500 });
  }
}
