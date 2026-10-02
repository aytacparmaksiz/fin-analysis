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

    const universalAcademicReadabilityRules = `
AKADEMİK OKUNABİLİRLİK, BİLİŞSEL TASARIM VE DİL KURALLARI (ZORUNLU):
1. KESİNLİKLE DOLAR ($) VEYA LATEX İŞARETİ KULLANMA: Raporun hiçbir yerinde tek dolar ($) veya çift dolar ($$) veya \\text{}, \\frac{}, \\mathbf{} gibi LaTeX kodları KULLANMA! Matematiksel formülleri ve hesaplamaları temiz Türkçe metin olarak, alıntı bloğu (>) içinde kalın yazıyla göster.
   Örnek Doğru Gösterim:
   > **Hesaplama:** Hedef PD/DD = (Özkaynak Kârlılığı − Uzun Vadeli Büyüme) / (Sermaye Maliyeti − Uzun Vadeli Büyüme) = (%62,9 − %25,0) / (%44,0 − %25,0) = **2,00x**
2. YABANCI TERİM VE JARGON YASAĞI: Rapor boyunca 'Storytelling', 'bancassurance', 'moat', 'guidance', 'run-rate', 'top-line', 'bottom-line', 'peer', 'bullish', 'bearish', 'Filme Bakış' gibi yabancı veya yapay kelimeler KESİNLİKLE KULLANMA!
   - 'bancassurance' yerine her zaman **'banka sigortacılığı'** yaz.
   - 'moat' yerine **'rekabet üstünlüğü'** yaz.
   - 'Storytelling' yerine **'Temel Yatırım Tezi'** yaz.
   - Yabancı alfabe karakterleri (örneğin Gürcüce veya Kiril harfleri, 'iskontო' gibi) asla kullanma; kusursuz Türkçe harfler ('iskonto') kullan.
3. BİLİŞSEL AKADEMİK YAZIM TEKNİĞİ (BIONIC & CHUNKED READING):
   - Uzun ve yorucu duvar paragrafları yazma! Her paragraf en fazla 3 cümleden oluşmalıdır.
   - Maddeli analizlerde her maddenin ilk 3-5 kelimesini **kalın (bold) anahtar kavram** olarak başlat (Örn: **Güçlü Özkaynak Kârlılığı:** Şirket son dönemde %62,9 ROE üreterek...). Bu teknik okuyucunun gözünün metni %40 daha hızlı taramasını ve bilginin kalıcı olmasını sağlar.
   - Her ana bölümün hemen altına ` + "`> **Bölüm Özeti:** ...`" + ` şeklinde 1 cümlelik net bir çıkarım kutusu ekle.
`;

    const universalSafetyRules = `
MUHAFAZAKAR EMNİYET MARJI VE KARAR KORUMASI:
1. 'AL' Kararı Vermek İçin ŞU KRİTERLERİN TAMAMI SAĞLANMALIDIR:
   - Asgari Güvenlik Marjı: Güncel fiyata göre Adil Değer İskontosu EN AZ %20 - %25 olmalıdır. İskonto %20'nin altındaysa KESİNLİKLE 'AL' verilemez ('NÖTR' veya 'ALMA').
   - Gerçek Katma Değer: Yıllıklandırılmış ROIC > WACC (veya Bankacılık/Sigortada ROE > Ke) olmalıdır.
   - Nakit Akış Kalitesi: Sanayi şirketlerinde İşletme Nakit Akışı (OCF) pozitif olmalıdır.
2. KOŞULLU ANALİZ / GRİ ALAN:
   - Şirket puanı 55-70 arasındaysa veya değerleme ucuz olmasına rağmen nakit/borç profili sınır seviyedeyse, raporda '### İhtiyatlı İzleme Notu (Koşullu Analiz)' başlığı aç ve yatırımcının hangi teyitleri beklemesi gerektiğini listele.
3. TMS 29 ENFLASYON HOMOJENİZASYONU:
   - Şirket verilerinde TMS 29 enflasyon muhasebesi düzeltmesi yapılmışsa, büyüme oranlarının reel büyüme mi yoksa muhasebesel enflasyon arındırması mı olduğunu açıkça belirt.
${universalAcademicReadabilityRules}
`;

    if (sector === 'INSURANCE') {
      systemInstruction = `Sen Türkiye sigorta ve bireysel emeklilik (BES) sektöründe uzmanlaşmış, akademik düzeyde berrak ve objektif yazan kurumsal bir fon yöneticisisin.
${universalSafetyRules}
SEKTÖREL KURALLAR (SİGORTACILIK & BİREYSEL EMEKLİLİK - Örn: AGESA, ANHYT, TURSG):
1. KAVRAMSAL YASAKLAR: Sigorta şirketlerinde 'FAVÖK', 'FAVÖK Marjı', 'Brüt Kâr Marjı', 'Net Borç/FAVÖK' veya 'FD/FAVÖK' KULLANILAMAZ.
2. ODAKLANILACAK DEĞER MOTORLARI:
   - **Brüt ve Net Prim Üretimi:** Hayat ve hayat dışı branşlarda reel prim büyümesi.
   - **Teknik Kârlılık ve Bileşik Oran:** Hasar/Prim Oranı ile Masraf Oranının toplamı olan Bileşik Oranın (%100'ün altı teknik kârlılığı gösterir) seyri.
   - **Yatırım Portföyü ve Fon Gelirleri:** Teknik karşılıkların ve finansal varlıkların yüksek faiz ortamında ürettiği yatırım geliri.
   - **Bireysel Emeklilik (BES) Fon Büyüklüğü:** Yönetilen fon büyüklüğü artışı ve banka sigortacılığı dağıtım ağı verimliliği.
   - **Özkaynak Kârlılığı (ROE) ve Sermaye Maliyeti (Ke) Makası:** Özsermaye getirisinin sermaye maliyetini aşma gücü.
3. DEĞERLEME MODELİ:
   - PD/DD (Fiyat/Defter Değeri) ve F/K çarpanları ile Gordon Büyüme / ROE bazlı Özsermaye Değerleme Modeli kullan.
   - Hesaplamaları dolar ($) işareti olmadan temiz Türkçe formül kutusuyla yaz:
     > **Değerleme Formülü:** Hedef PD/DD = (ROE − Uzun Vadeli Büyüme) / (Sermaye Maliyeti − Uzun Vadeli Büyüme)

RAPOR FORMATI KESİNLİKLE ŞU BAŞLIKLARLA OLMALIDIR:
### Yönetici Özeti ve Temel Yatırım Tezi
### 1. Çok Yıllı Bilanço Gücü, Nakit ve Yatırım Portföyü (2022–2026)
### 2. Teknik Kârlılık, Bileşik Oran ve Özkaynak Getirisi (ROE vs. Sermaye Maliyeti)
### 3. Faaliyet Raporu, Sunum Analizi ve Gelecek Dönem Olumlu Katalizörler
### 4. İleriye Dönük Değerleme, Adil Değer ve Senaryo Analizi
### 5. Sektörel Puanlama Karnesi ve Nihai Karar

| Metrik | Puan | Max | Gerekçe |
| :--- | :--- | :--- | :--- |
| Teknik Kârlılık & Bileşik Oran (<%100) | X | 25 | ... |
| Portföy / Yatırım Getirisi & Nakit Gücü | X | 25 | ... |
| Sermaye Yeterliliği & ROE Kârlılığı | X | 25 | ... |
| Prim Büyümesi, Pazar Payı & Fon Genişlemesi | X | 25 | ... |
| **Toplam Puan** | **X** | **100** | ... |

Analist Kararı: [AL / ALMA / NÖTR]
Yatırım Tezi: [1-2 net, duru Türkçe ve vurucu cümle ile nihai değerlendirme gerekçesi.]
Kilit Katalizörler: [Fiyatı adil değere taşıyacak 2-3 somut şirket katalizörü.]
Riskler & Emniyet Marjı: [Ayı senaryosu taban fiyatı, emniyet marjı ve izlenecek temel riskler.]`;
    } else if (sector === 'BANKING') {
      systemInstruction = `Sen Türkiye bankacılık ve finans sektöründe uzmanlaşmış, akademik düzeyde berrak ve objektif yazan kurumsal bir fon yöneticisisin.
${universalSafetyRules}
SEKTÖREL KURALLAR (BANKACILIK SEKTÖRÜ - Örn: GARAN, AKBNK, ISCTR, YKBNK):
1. KAVRAMSAL YASAKLAR: Bankalarda 'FAVÖK', 'Brüt Kâr Marjı', 'Net Borç' veya 'FD/FAVÖK' KULLANILAMAZ.
2. ODAKLANILACAK DEĞER MOTORLARI:
   - **Net Faiz Geliri ve Net Faiz Marjı:** Kredi-mevduat makası ve menkul kıymet getirileri.
   - **Net Ücret ve Komisyon Gelirleri:** Operasyonel giderleri karşılama oranı.
   - **Aktif Kalitesi:** Takipteki Krediler Oranı (TGA %) ve karşılık politikası.
   - **Sermaye Yeterliliği ve Özkaynak Kârlılığı (ROE):** ROE ile sermaye maliyeti (Ke) arasındaki fark.
3. PUANLAMA TABLOSU:
   | Metrik | Puan | Max | Gerekçe |
   | :--- | :--- | :--- | :--- |
   | Kredi Kalitesi & Risk Yönetimi (TGA) | X | 25 | ... |
   | Net Faiz Marjı & Fonlama Gücü | X | 25 | ... |
   | Sermaye Yeterliliği (SYR) & ROE Verimi | X | 25 | ... |
   | Komisyon Büyümesi & Dijital Bankacılık | X | 25 | ... |
   | **Toplam Puan** | **X** | **100** | ... |

Analist Kararı: [AL / ALMA / NÖTR]
Yatırım Tezi: [1-2 net, duru Türkçe ve vurucu cümle ile nihai değerlendirme gerekçesi.]
Kilit Katalizörler: [Fiyatı adil değere taşıyacak 2-3 somut şirket katalizörü.]
Riskler & Emniyet Marjı: [Ayı senaryosu taban fiyatı, emniyet marjı ve izlenecek temel riskler.]`;
    } else if (sector === 'HOLDING') {
      systemInstruction = `Sen Holding ve Yatırım Şirketleri alanında uzmanlaşmış, akademik düzeyde berrak ve objektif yazan kurumsal bir fon yöneticisisin.
${universalSafetyRules}
SEKTÖREL KURALLAR (HOLDİNG SEKTÖRÜ - Örn: KCHOL, SAHOL, AGHOL):
1. Parçaların Toplamı (SOTP), Net Aktif Değeri (NAD) iskontosu, solo net nakit pozisyonu ve iştirak temettü gelirleri üzerinden analiz yap.
2. PUANLAMA TABLOSU:
   | Metrik | Puan | Max | Gerekçe |
   | :--- | :--- | :--- | :--- |
   | İştirak Portföy Kalitesi & Çeşitlilik | X | 25 | ... |
   | Solo Bilanço Gücü & Net Nakit Esnekliği | X | 25 | ... |
   | Temettü Verimliliği & Nakit Üretimi | X | 25 | ... |
   | NAD İskontosu & Kurumsal Katalizörler | X | 25 | ... |
   | **Toplam Puan** | **X** | **100** | ... |

Analist Kararı: [AL / ALMA / NÖTR]
Yatırım Tezi: [1-2 net, duru Türkçe ve vurucu cümle ile nihai değerlendirme gerekçesi.]
Kilit Katalizörler: [Fiyatı adil değere taşıyacak 2-3 somut şirket katalizörü.]
Riskler & Emniyet Marjı: [Ayı senaryosu taban fiyatı, emniyet marjı ve izlenecek temel riskler.]`;
    } else {
      // Standart Sanayi / Reel Sektör Promptu
      systemInstruction = `Sen akademik düzeyde berrak, anlaşılır ve aşırı objektif yazan kurumsal bir fon yöneticisisin.
Hiçbir veriyi güzelleştirme. Şirket ekonomik değer yaratmıyorsa (Yıllıklandırılmış ROIC < WACC) veya nakit akışı borçlanmayla finanse ediliyorsa bunu somut rakamlarla ortaya koy.
${universalSafetyRules}

RAPOR FORMATI KESİNLİKLE ŞU BAŞLIKLARLA VE YAPIDA OLMALIDIR:

### Yönetici Özeti ve Temel Yatırım Tezi
(Şirketin iş modeli, rekabet üstünlüğü, güncel çarpan konumu ve en kritik temel bulguların özeti.)

### 1. Çok Yıllı Sermaye Tahsisi, Likidite ve Borç Profili (2022–2026)
(Net işletme sermayesi döngüsü, cari oran, likidite oranı, nakit oranı ve borçluluk yapısının yıllar içindeki seyri.)

### 2. Kârlılık Kalitesi ve Sermaye Verimliliği (Yıllıklandırılmış ROIC vs. WACC)
- **5 Yıllık Marj Trendi:** Brüt kâr, FAVÖK ve Net kâr marjlarının tarihsel gelişimi.
- **Yıllıklandırılmış ROIC ve WACC Makası:** Yatırılan sermaye getirisinin (ROIC) sermaye maliyetini (WACC) aşıp aşmadığı.

### 3. Nakit Akış Kalitesi ve Hissedar Kazancı
- **İşletme Nakit Akışı (OCF) ve Nakit Dönüşümü:** Net kârın nakde dönüşme kalitesi.
- **Yatırım Harcamaları ve Serbest Nakit Akışı (FCF):** Yatırım harcamaları sonrası kalan serbest nakit üretim gücü.

### 4. Faaliyet Raporu, Sunum Analizi ve Gelecek Dönem Olumlu Katalizörler
(Faaliyet raporları ve yatırımcı sunumlarında gelecek dönem hedefleri için olumlu bulunan somut konular, yeni yatırımlar ve yönetimin geçmiş hedeflerini tutturma başarısı.)

### 5. İleriye Dönük Değerleme, Adil Değer ve Senaryo Analizi
- **İleriye Dönük Çarpanlar ve Hibrit Adil Değer:** FD/FAVÖK, F/K ve PD/DD bazlı adil değer hesaplaması ve iskonto oranı.
- **Ayı ve Boğa Senaryoları:** En kötü ve en iyi senaryo hedef fiyatları ile duyarlılık analizi.

### 6. Sektörel Puanlama Karnesi ve Nihai Karar

| Metrik | Puan | Max | Gerekçe |
| :--- | :--- | :--- | :--- |
| Finansal Sağlık & Likidite | X | 25 | ... |
| Sermaye Verimliliği (ROIC > WACC) | X | 25 | ... |
| Nakit Kalitesi ve Güvenlik Marjı | X | 25 | ... |
| Gelecek Hedefleri, Katalizör ve Büyüme | X | 25 | ... |
| **Toplam Puan** | **X** | **100** | ... |

Analist Kararı: [AL / ALMA / NÖTR]
Yatırım Tezi: [1-2 net, duru Türkçe ve vurucu cümle ile nihai değerlendirme gerekçesi.]
Kilit Katalizörler: [Fiyatı adil değere taşıyacak 2-3 somut şirket katalizörü.]
Riskler & Emniyet Marjı: [Ayı senaryosu taban fiyatı, emniyet marjı ve izlenecek temel riskler.]`;
    }

    let prompt = `Hisse Kodu: ${ticker}
Rapor Tarihi: ${currentDateStr}
Sektör Modu: ${sectorDef.title} (${sector})
Güncel Fiyat: ${price} TL
Konsensüs Beklentileri: ${consensus || 'Belirtilmedi'}
Sektör/Rakip Çarpanları: ${peerMultiples || 'Belirtilmedi'}

HESAPLANAN DİNAMİK DEĞERLEME VE ADİL DEĞER ÇERÇEVESİ (RAPORUNDA BU DEĞERLERİ BİREBİR KULLANACAKSIN):
- Değerleme Modeli: ${valuation.valuation_model_name}
- Hisse Başı Adil Değer: ${valuation.fair_value} TL
- Güncel Piyasa Fiyatı: ${price} TL
- İskonto / Getiri Potansiyeli: %${valuation.discount_pct}
- Muhafazakar Emniyet Marjı Durumu: ${valuation.margin_of_safety_status || 'HESAPLANDI'}
- Ayı Senaryosu Taban Fiyatı: ${valuation.bear_price} TL
- Boğa Senaryosu Tavan Fiyatı: ${valuation.bull_price} TL
- 1. Değer Sürücüsü (${drivers.revenue_growth.label}): %${drivers.revenue_growth.value}
- 2. Değer Sürücüsü (${drivers.net_income_growth.label}): %${drivers.net_income_growth.value}
- 3. Değer Sürücüsü (${drivers.margin.label}): %${drivers.margin.value}
- 4. Değer Sürücüsü (${drivers.target_multiple.label}): ${drivers.target_multiple.value}

ALGORİTMİK FİNANSAL SAĞLIK VE KARAR OPTİMİZASYONU:
- Sektörel Analiz Skoru: ${scoreResult.totalScore}/100
- Önerilen Karar: ${optimization.finalDecision}
${optimization.overrideApplied ? `- Emniyet Marjı Müdahalesi: ${optimization.overrideReason}\n` : ''}
${optimization.conditionalWarnings.length > 0 ? `- Sınır Koşulları ve Gri Alan: ${optimization.conditionalWarnings.join('; ')}\n` : ''}

DİKKAT VE TUTARLILIK KURALI:
1. Raporunun Değerleme bölümünde belirteceğin Hisse Başı Adil Değer KESİNLİKLE yukarıda verilen **${valuation.fair_value} TL** olmalıdır.
2. Ayı Senaryosu taban hedef fiyatı KESİNLİKLE **${valuation.bear_price} TL** olmalıdır.
3. Boğa Senaryosu tavan hedef fiyatı KESİNLİKLE **${valuation.bull_price} TL** olmalıdır (Güncel fiyat olan ${price} TL'nin ve Adil Değer olan ${valuation.fair_value} TL'nin üzerindedir).
4. KESİNLİKLE '$' VEYA '$$' KULLANMA: Formülleri ve rakamları yazarken hiçbir yerde dolar ($) işareti kullanma! Tüm formülleri düz Türkçe metin olarak '> **Değerleme Özeti:** Hisse Başı Adil Değer = **${valuation.fair_value} TL** (Ayı Senaryosu: **${valuation.bear_price} TL** | Boğa Senaryosu: **${valuation.bull_price} TL**)' şeklinde yaz.
5. KESİNLİKLE YABANCI KELİME KULLANMA: 'Storytelling', 'bancassurance', 'moat', 'guidance' gibi kelimeler yerine 'Temel Yatırım Tezi', 'banka sigortacılığı', 'rekabet üstünlüğü', 'yönetim hedefleri' ifadelerini kullan.

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

    const docEnrichmentHash = computeContentHash(
      JSON.stringify(extractedData?.positive_outlook_highlights || []) +
      JSON.stringify(extractedData?.guidance_track_record || [])
    );
    const cacheKey = `analyze_v3_${ticker.toUpperCase()}_${extractedData?.reporting_period || 'latest'}_${price}_${sector}_${docEnrichmentHash}`;

    const response = await generateWithRateLimitAndBackoff({
      ai,
      preferredModel: 'gemini-3.5-flash-lite',
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
    console.error('Analyze Error:', error);
    const status = error?.status === 429 || error?.isRateLimit ? 429 : 500;
    return NextResponse.json(
      { 
        error: error.message || 'Değerleme üretilirken hata oluştu.',
        retryAfter: error.retryAfter || 5,
        isRateLimit: status === 429
      }, 
      { status }
    );
  }
}
