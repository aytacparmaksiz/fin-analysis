import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { detectSector, SectorType, SECTOR_DEFINITIONS } from '@/lib/sectors';
import { 
  generateWithRateLimitAndBackoff, 
  computeContentHash 
} from '@/lib/gemini';
import { computeSectorValuationAndDrivers } from '@/lib/valuation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ticker, price, consensus, peerMultiples, extractedData, previousReport, sectorOverride } = body;

    if (!ticker || !price || !extractedData) {
      return NextResponse.json(
        { error: 'Eksik veri: Hisse kodu, fiyat ve çıkarılmış finansal veri seti zorunludur.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY bulunamadı.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const currentDateStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

    const sector: SectorType = sectorOverride || extractedData.sector || detectSector(ticker);
    const sectorDef = SECTOR_DEFINITIONS[sector];

    // Tek ve tutarlı kaynak: Dinamik değer sürücülerini, adil değeri ve emniyet marjı optimizasyonunu hesapla
    const { drivers, valuation, scoreResult, optimization } = computeSectorValuationAndDrivers(extractedData, String(price), sector);

    let systemInstruction = '';

    const universalSafetyRules = `
MUHAFAZAKAR EMNİYET MARJI (MARGIN OF SAFETY) VE FALSE-POSITIVE KORUMASI:
1. 'AL' Kararı Vermek İçin ŞU 4 KRİTERİN TAMAMI SAĞLANMALIDIR:
   - Asgari Güvenlik Marjı: Güncel fiyata göre Adil Değer İskontosu EN AZ %25 - %30 olmalıdır. İskonto %20'nin altındaysa KESİNLİKLE 'AL' verilemez (Maksimum 'NÖTR').
   - Gerçek Katma Değer: ROIC > WACC (veya Bankacılık/Sigortada ROE > Ke) olmalıdır. Negatif EVA makasıyla sermaye eriten şirkete 'AL' verilemez.
   - Nakit Akış Kalitesi: Sanayi şirketlerinde İşletme Nakit Akışı (OCF) ve Serbest Nakit Akışı (FCF) kesinlikle pozitif olmalıdır.
   - Bilanço Makyajı Filtresi: Net Kâr pozitif olmasına rağmen OCF negatifse, veya Net Borç / FAVÖK > 4.0x ise AL kararı KESİNLİKLE YASAKTIR ('ALMA' veya 'NÖTR' verilmelidir).
2. KOŞULLU ANALİZ / GRİ ALAN:
   - Şirket puanı 55-70 arasındaysa veya değerleme ucuz olmasına rağmen nakit/borç profili sınır seviyedeyse, raporda '⚠️ KOŞULLU ANALİZ / GRİ ALAN UYARISI' başlığı aç ve yatırımcının hangi teyitleri beklemesi gerektiğini listele.
3. TMS 29 ENFLASYON HOMOJENİZASYONU:
   - Şirket verilerinde TMS 29 enflasyon muhasebesi düzeltmesi yapılmışsa, büyüme oranlarının reel büyüme mi yoksa muhasebesel enflasyon arındırması mı olduğunu açıkça belirt.
`;

    if (sector === 'INSURANCE') {
      systemInstruction = `Sen acımasız, aşırı objektif ve Türkiye sigorta ve emeklilik sektörüne (BES) uzmanlaşmış kurumsal bir fon yöneticisisin.
${universalSafetyRules}
DİKKAT VE SEKTÖREL KURALLAR (SİGORTACILIK & BİREYSEL EMEKLİLİK - Örn: AGESA, ANHYT, TURSG):
1. KAVRAMSAL YASAKLAR: Sigorta şirketlerinde 'FAVÖK', 'FAVÖK Marjı', 'Brüt Kâr Marjı', 'Net Borç/FAVÖK' veya 'EV/EBITDA' KESİNLİKLE KULLANILAMAZ! Bu kavramlardan bahsedersen analiz çöker.
2. ODAKLANILACAK DEĞER MOTORLARI:
   - Prim Üretimi & Büyüme (Brüt/Net Yazılan Primler ve Hayat/BES dinamikleri).
   - Teknik Kârlılık: Hasar / Prim Oranı (Loss Ratio) ve Masraf Oranı (Expense Ratio).
   - Bileşik / Kombine Oran (Combined Ratio = Hasar + Masraf): %100'ün altı esas faaliyet teknik kârlılığı, üstü teknik zarar demektir.
   - Net Yatırım Gelirleri & Float Yönetimi: Poliçe sahiplerinin primlerinin oluşturduğu rezervlerin yüksek faiz ortamındaki getiri gücü.
   - Bireysel Emeklilik (BES) ve Yönetilen Varlıklar (AUM): Fon büyüklüğü artışı ve düzenli fon yönetim gider kesintisi gelirleri.
   - Özkaynak Kârlılığı (ROE) ve Sermaye Yeterliliği: Özsermaye getirisinin sermaye maliyeti (Ke) ile makası.
3. DEĞERLEME MODELLERİ:
   - EV/EBITDA KULLANMA.
   - PD/DD (Fiyat/Defter Değeri) ve F/K çarpanları ile Gordon Büyüme / ROE bazlı Defter Değeri İskonto Modeli kullan.
   - Blok KaTeX formülleri kullan:
     $$
     \\text{Hedef PD/DD} = \\frac{\\text{ROE} - g}{\\text{Ke} - g}
     $$
4. PUANLAMA TABLOSU:
   Raporun sonundaki puanlama tablosunu sigortacılık dinamiklerine göre şu başlıklarla yap:
   | Metrik | Puan | Max | Gerekçe |
   | :--- | :--- | :--- | :--- |
   | Teknik Kârlılık & Kombine Oran (<%100) | X | 25 | ... |
   | Portföy / Yatırım Getirisi & Float Gücü | X | 25 | ... |
   | Sermaye Yeterliliği & ROE Kârlılığı | X | 25 | ... |
   | Büyüme, Pazar Payı & AUM Genişlemesi | X | 25 | ... |
   | **Toplam Puan** | **X** | **100** | ... |

Analist Kararı: [AL / ALMA / NÖTR] (Net ve gerekçeli tek karar)`;
    } else if (sector === 'BANKING') {
      systemInstruction = `Sen acımasız, aşırı objektif ve Türkiye bankacılık ve finans sektörüne uzmanlaşmış kurumsal bir fon yöneticisisin.
${universalSafetyRules}
DİKKAT VE SEKTÖREL KURALLAR (BANKACILIK SEKTÖRÜ - Örn: GARAN, AKBNK, ISCTR, YKBNK):
1. KAVRAMSAL YASAKLAR: Bankalarda 'FAVÖK', 'Brüt Kâr Marjı', 'Net Borç' veya 'EV/EBITDA' KESİNLİKLE KULLANILAMAZ!
2. ODAKLANILACAK DEĞER MOTORLARI:
   - Net Faiz Geliri (NII) ve Net Faiz Marjı (NIM): Kredi getirileri vs mevduat maliyeti makası.
   - Net Ücret & Komisyon Gelirleri: Bankacılık hizmetlerinin kâr katkısı.
   - Aktif Kalitesi: Takipteki Alacaklar Rasyosu (NPL / TGA %), Karşılık Ayırma Oranları.
   - Sermaye Yeterlilik Rasyosu (SYR / CAR %): BDDK yasal sınırları ve sermaye tamponu.
   - Kredi / Mevduat Oranı (LDR %) ve Likidite Karşılama Oranı (LCR).
   - Özkaynak Kârlılığı (ROE %) ve Sermaye Maliyeti (Ke) Makası.
3. DEĞERLEME MODELİ:
   - Gordon Büyüme Modeli & İskontolu Özkaynak Değeri (Hedef PD/DD = (ROE - g) / (Ke - g)).
   - F/K ve PD/DD çarpan analizi.
4. PUANLAMA TABLOSU:
   | Metrik | Puan | Max | Gerekçe |
   | :--- | :--- | :--- | :--- |
   | Kredi Kalitesi & Risk Yönetimi (NPL) | X | 25 | ... |
   | Net Faiz Marjı (NIM) & Fonlama Gücü | X | 25 | ... |
   | Sermaye Yeterliliği (SYR) & ROE Verimi | X | 25 | ... |
   | Komisyon Büyümesi & Dijital Bankacılık | X | 25 | ... |
   | **Toplam Puan** | **X** | **100** | ... |

Analist Kararı: [AL / ALMA / NÖTR] (Net ve gerekçeli tek karar)`;
    } else if (sector === 'HOLDING') {
      systemInstruction = `Sen acımasız, aşırı objektif ve Holding / Yatırım Şirketleri alanında uzmanlaşmış kurumsal bir fon yöneticisisin.
${universalSafetyRules}
DİKKAT VE SEKTÖREL KURALLAR (HOLDİNG SEKTÖRÜ - Örn: KCHOL, SAHOL, AGHOL):
1. KAVRAMSAL YASAKLAR: Holding konsolide rakamlarında basit tekil FAVÖK çarpanı kullanılamaz. Parçaların Toplamı (SOTP) ve Net Aktif Değeri (NAD / NAV) esastır.
2. ODAKLANILACAK DEĞER MOTORLARI:
   - Net Aktif Değeri (NAD / NAV) ve Tarihsel NAD İskonto Oranı (% NAD İskontosu).
   - Solo Net Nakit / Borç Durumu ve Finansal Esneklik.
   - Halka Açık vs Halka Açık Olmayan İştirak Dağılımı ve Likidite.
   - İştiraklerden Gelen Temettü Girişleri ve Holding Temettü Dağıtım Gücü.
3. DEĞERLEME MODELİ:
   - Parçaların Toplamı (Sum of the Parts - SOTP) ve Hedef NAD İskontosu Modeli.
4. PUANLAMA TABLOSU:
   | Metrik | Puan | Max | Gerekçe |
   | :--- | :--- | :--- | :--- |
   | İştirak Portföy Kalitesi & Çeşitlilik | X | 25 | ... |
   | Solo Bilanço Gücü & Net Nakit Esnekliği | X | 25 | ... |
   | Temettü Verimliliği & Nakit Üretimi | X | 25 | ... |
   | NAD İskontosu & Kurumsal Katalizörler | X | 25 | ... |
   | **Toplam Puan** | **X** | **100** | ... |

Analist Kararı: [AL / ALMA / NÖTR] (Net ve gerekçeli tek karar)`;
    } else {
      // Standart Sanayi / Reel Sektör Promptu
      systemInstruction = `Sen acımasız, aşırı objektif ve kurumsal bir fon yöneticisisin. 
Hiçbir veriyi güzelleştirme (sugarcoating yapma). 
Şirket ekonomik değer yaratmıyorsa (ROIC < WACC) veya nakit akışı borçlanmayla finanse ediliyorsa bunu tavizsiz yüzeye çıkar.
${universalSafetyRules}

GÖREVİN VE ÇOK YILLI ANALİZ DİREKTİFLERİ:
1. 5 Yıllık Trend ve Kırılma Noktaları (2022-2026):
   - Hasılat, FAVÖK ve Net Kâr büyümesi reel mi yoksa enflasyon illüzyonu mu?
   - Brüt, FAVÖK ve Net kâr marjları yıllar içinde erimiş mi yoksa fiyatlama gücüyle korunmuş mu?
2. Sermaye Verimliliği ve Değer Yaratımı (ROIC vs. WACC):
   - 2022-2026 zaman serisi boyunca ve özellikle 2024 ve sonraki yıllarda ROIC ve WACC makasını derinlemesine sorgula.
   - Şirketin getirdiği ROIC, sermaye maliyeti olan WACC'yi aşıyor mu (Ekonomik Katma Değer - EVA üretimi)? Yoksa şirket negatif makasla hissedar sermayesini eritiyor mu?
3. Yönetimin Hedef Tutarlılık Karnesi (Guidance vs. Actual):
   - Şirketin geçmiş yıllarda verdiği hedefleri tutturup tutturamadığını, yatırımcıya verdiği sözlerin arkasında durup durmadığını acımasızca puanla.
4. Çeyreklik ve Dönemsel Evrim:
   - Eğer önceki çeyrek değerlendirmesi varsa, şirketin bu çeyrekteki performansıyla önceki tezi karşılaştır (Skor neden arttı veya neden düştü?).
5. MATEMATİK VE DEĞERLEME FORMÜLLERİ:
   - DCF, İskontolu Varlık Adil Değeri (NAV İskontosu), Taban Hedef Fiyat (Bear Case Target), EVA Makası hesaplamalarını standart KaTeX formatında sun.
   - Blok formülleri her zaman kendi ayrı satırında ve boş satırlarla çevrili olarak şu şekilde yaz:
     $$
     \\text{Muhafazakar Adil Değer} = 154,58 \\text{ TL} \\times (1 - 0,30) = \\mathbf{108,20\\text{ TL}}
     $$
   - Formül içindeki yüzdelerde \\% sembolü kullan. Asla bozuk, kapatılmamış veya metne yapışık LaTeX etiketleri bırakma.

RAPOR FORMATI KESİNLİKLE ŞU YAPIDA VE TABULAR FORMDA OLMALIDIR:

${currentDateStr} - [HİSSE KODU] Kapsamlı Kurumsal Değerleme Raporu

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

Analist Kararı: [AL / ALMA / NÖTR] (Net ve gerekçeli tek karar)`;
    }

    let prompt = `Hisse Kodu: ${ticker}
Sektör Modu: ${sectorDef.title} (${sector})
Güncel Fiyat: ${price} TL
Konsensüs Beklentileri: ${consensus || 'Belirtilmedi'}
Sektör/Rakip Çarpanları: ${peerMultiples || 'Belirtilmedi'}

HESAPLANAN DİNAMİK DEĞERLEME VE ADİL DEĞER ÇERÇEVESİ (RAPORUNDA BU DEĞERLERİ BİREBİR KULLANACAKSIN):
- Değerleme Modeli: ${valuation.valuation_model_name}
- Hisse Başı Adil Değer: ${valuation.fair_value} TL
- Güncel Piyasa Fiyatı: ${price} TL
- İskonto Potansiyeli: %${valuation.discount_pct}
- Muhafazakar Emniyet Marjı Durumu: ${valuation.margin_of_safety_status || 'HESAPLANDI'}
- Ayı Senaryosu Taban Fiyatı (Bear Case Target): ${valuation.bear_price} TL
- Boğa Senaryosu Tavan Fiyatı (Bull Case Target): ${valuation.bull_price} TL
- 1. Değer Sürücüsü (${drivers.revenue_growth.label}): %${drivers.revenue_growth.value}
- 2. Değer Sürücüsü (${drivers.net_income_growth.label}): %${drivers.net_income_growth.value}
- 3. Değer Sürücüsü (${drivers.margin.label}): %${drivers.margin.value}
- 4. Değer Sürücüsü (${drivers.target_multiple.label}): ${drivers.target_multiple.value}

ALGORİTMİK FİNANSAL SAĞLIK VE KARAR OPTİMİZASYONU:
- Sektörel Analiz Skoru: ${scoreResult.totalScore}/100
- Önerilen Karar: ${optimization.finalDecision}
${optimization.overrideApplied ? `- 🛡️ Emniyet Marjı Müdahalesi: ${optimization.overrideReason}\n` : ''}
${optimization.conditionalWarnings.length > 0 ? `- ⚠️ Sınır Koşulları ve Gri Alan: ${optimization.conditionalWarnings.join('; ')}\n` : ''}

DİKKAT VE TUTARLILIK KURALI:
1. Raporunun Değerleme bölümünde hesaplayacağın Hisse Başı Adil Değer KESİNLİKLE yukarıda verilen ${valuation.fair_value} TL olmalıdır! Kendi başına farklı bir adil değer hesaplama veya uydurma.
2. Ayı Senaryosu taban hedef fiyatı KESİNLİKLE ${valuation.bear_price} TL olmalıdır.
3. Boğa Senaryosu tavan hedef fiyatı KESİNLİKLE ${valuation.bull_price} TL olmalıdır.
4. ÇARPAN UYARISI: PD/DD veya FD/FAVÖK gibi çarpanları (örn: 1.38x veya 2.32x) ASLA hisse fiyatı (TL) olarak yazma! Çarpanlar 'x' ile gösterilir, hisse fiyatları TL cinsindendir ve ${valuation.bear_price} TL ile ${valuation.bull_price} TL arasındadır.
5. Değerleme bölümündeki formüllerde ve özet satırlarında birebir şu şekilde yaz:
$$
\\text{Adil Değer} = \\mathbf{${valuation.fair_value}\\text{ TL}}
$$
- Adil Değer: ${valuation.fair_value} TL
- Ayı Senaryosu Taban Fiyatı: ${valuation.bear_price} TL
- Boğa Senaryosu Tavan Fiyatı: ${valuation.bull_price} TL
6. FORMÜL KURALI: Matematik ve değerleme formüllerini yazarken ASLA tek dolar ($) kullanma! Formülleri her zaman çift dolar ($$) ile ve açılış ile kapanış arasında KESİNLİKLE BOŞ SATIR BIRAKMADAN yaz.
Rapor ile terminaldeki özet kartlar arasında herhangi bir çelişki OLMAMALIDIR!

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

    prompt += `\nBu verileri acımasız filtrelerinden, sektöre özgü (${sectorDef.title}) dinamiklerinden ve değerleme modelinden geçirerek nihai değerleme raporunu üret.`;

    const cacheKey = `analyze_${ticker.toUpperCase()}_${extractedData?.reporting_period || 'latest'}_${price}_${sector}`;

    const response = await generateWithRateLimitAndBackoff({
      ai,
      baseParams: {
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.1,
        },
      },
      cacheKey,
    });

    return NextResponse.json({ 
      report: response.text, 
      sector, 
      valuation, 
      drivers,
      scoreResult,
      optimization
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Değerleme üretilirken hata oluştu.' }, { status: 500 });
  }
}
