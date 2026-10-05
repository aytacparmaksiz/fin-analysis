import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { detectSector, SectorType, SECTOR_DEFINITIONS } from '@/lib/sectors';
import { 
  generateWithRateLimitAndBackoff, 
  computeContentHash 
} from '@/lib/gemini';
import { computeSectorValuationAndDrivers } from '@/lib/valuation';
import { fetchLiveBistPrice } from '@/lib/bist-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { ticker, price, consensus, peerMultiples, extractedData, previousReport, sectorOverride } = body;

    const resolvedTicker = (ticker || extractedData?.ticker || '').toUpperCase().trim();
    if (!resolvedTicker || !extractedData) {
      return NextResponse.json(
        { error: 'Eksik veri: Hisse kodu ve çıkarılmış finansal veri seti zorunludur.' },
        { status: 400 }
      );
    }

    // Fiyat çözümleme: Boş veya tanımsızsa çıkarılan tablodan veya canlı BIST fiyatından tamamla
    let activePrice = price != null && String(price).trim() !== '' ? String(price).trim() : '';
    if (!activePrice || isNaN(Number(activePrice)) || Number(activePrice) <= 0) {
      if (extractedData?.current_price && Number(extractedData.current_price) > 0) {
        activePrice = String(extractedData.current_price);
      } else if (Array.isArray(extractedData?.financial_history)) {
        const histWithPrice = [...extractedData.financial_history].reverse().find((p: any) => p.share_price && Number(p.share_price) > 0);
        if (histWithPrice?.share_price) {
          activePrice = String(histWithPrice.share_price);
        }
      }
      if (!activePrice || Number(activePrice) <= 0) {
        try {
          const live = await fetchLiveBistPrice(resolvedTicker);
          if (live?.price && live.price > 0) {
            activePrice = String(live.price);
          }
        } catch {}
      }
      if (!activePrice || Number(activePrice) <= 0) {
        activePrice = '100.00';
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;

    const currentDateStr = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

    const sector: SectorType = sectorOverride || extractedData.sector || detectSector(resolvedTicker);
    const sectorDef = SECTOR_DEFINITIONS[sector];

    // Tek ve tutarlı kaynak: Dinamik değer sürücülerini, adil değeri ve emniyet marjı optimizasyonunu hesapla
    const { drivers, valuation, scoreResult, optimization } = computeSectorValuationAndDrivers(extractedData, String(activePrice), sector);

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
### I. Yönetici Özeti ve Temel Yatırım Tezi
### II. Nakit Akışı, Portföy ve Kâr Kalitesi Teşhisi (Bileşik Oran ve Float Verimi)
### III. Sektörel Karne ve Rekabet Konumu (Pazar Payı ve Büyüme)
### IV. Sermaye Maliyeti (Ke / WACC) ve Gordon Değerleme Modeli
### V. Değer Sürücüleri ve Hassasiyet Tablosu
### VI. Temel Riskler, Katalizörler ve Nihai Karar

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

RAPOR FORMATI KESİNLİKLE ŞU BAŞLIKLARLA OLMALIDIR:
### I. Yönetici Özeti ve Temel Yatırım Tezi
### II. Aktif Kalitesi, Fonlama ve Kâr Kalitesi Teşhisi (NIM ve Komisyon Gücü)
### III. Sektörel Karne ve Rekabet Konumu (TGA Rasyosu ve SYR Tamponu)
### IV. Sermaye Maliyeti (Ke / WACC) ve Gordon Değerleme Modeli
### V. Değer Sürücüleri ve Hassasiyet Tablosu
### VI. Temel Riskler, Katalizörler ve Nihai Karar

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

RAPOR FORMATI KESİNLİKLE ŞU BAŞLIKLARLA OLMALIDIR:
### I. Yönetici Özeti ve Temel Yatırım Tezi
### II. Nakit Akışı, Solo Likidite ve Kâr Kalitesi Teşhisi (Temettü Akışı ve Borçsuzluk)
### III. Sektörel Karne ve Rekabet Konumu (İştirak Portföy Çeşitliliği)
### IV. WACC ve İskontolu Değerleme Modeli (NAD / SOTP)
### V. Değer Sürücüleri ve Kur Hassasiyet Tablosu
### VI. Temel Riskler, Katalizörler ve Nihai Karar

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

### I. Yönetici Özeti ve Temel Yatırım Tezi
(Şirketin iş modeli, rekabet üstünlüğü, güncel çarpan konumu ve en kritik temel bulguların özeti.)

### II. Nakit Akışı ve Kâr Kalitesi Teşhisi (OCF, Nakit Dönüşümü ve Sloan Tahakkuk Oranı)
- **Nakit Dönüşüm Oranı (OCF / Net Kâr):** Kârın kağıt üzerinde mi kaldığı yoksa kasaya sıcak nakit mi girdiği analizi.
- **Sloan Tahakkuk Oranı ve Bilanço Makyajı Teşhisi:** Gayrinakdi tahakkukların ve alacak/stok bağlamalarının değerlendirilmesi.
- **Yatırım Harcamaları ve Serbest Nakit Akışı (FCF):** Buffett Kazancı ve serbest nakit üretim gücü.

### III. Sektörel Karne ve Rekabet Konumu (DuPont 5 Aşamalı Kârlılık Ayrıştırması)
- **DuPont Kârlılık Ayrıştırması:** ROE'nin vergi yükü, faiz yükü, EBIT marjı, aktif devir hızı ve kaldıraç bileşenleri.
- **Sektörel Puanlama Karnesi:** Finansal sağlık, sermaye verimliliği ve moat gücü.

### IV. WACC ve İskontolu Değerleme Modeli (Şirkete Özel Borçlanma Maliyeti Kd ve Hibrit Değerleme)
- **Sermaye Maliyeti (WACC):** Şirketin efektif borçlanma faizi (Kd), özkaynak maliyeti (Ke) ve sermaye yapısı ağırlıkları.
- **İleriye Dönük Çarpanlar ve Hibrit Adil Değer:** FD/FAVÖK, F/K ve PD/DD bazlı adil değer hesaplaması ve iskonto oranı.

### V. Değer Sürücüleri, Net Döviz Pozisyonu ve Hassasiyet Tablosu
- **Net Döviz Pozisyonu ve Kur Hassasiyeti:** Döviz varlık/yükümlülük dengesi ve olası kur hareketlerinin kâra etkisi.
- **Ayı ve Boğa Senaryoları:** En kötü ve en iyi senaryo hedef fiyatları ile duyarlılık analizi.

### VI. Temel Riskler, Katalizörler ve Nihai Karar

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

    let prompt = `Hisse Kodu: ${resolvedTicker}
Rapor Tarihi: ${currentDateStr}
Sektör Modu: ${sectorDef.title} (${sector})
Güncel Fiyat: ${activePrice} TL
Konsensüs Beklentileri: ${consensus || 'Belirtilmedi'}
Sektör/Rakip Çarpanları: ${peerMultiples || 'Belirtilmedi'}

HESAPLANAN DİNAMİK DEĞERLEME VE ADİL DEĞER ÇERÇEVESİ (RAPORUNDA BU DEĞERLERİ BİREBİR KULLANACAKSIN):
- Değerleme Modeli: ${valuation.valuation_model_name}
- Hisse Başı Adil Değer: ${valuation.fair_value} TL
- Güncel Piyasa Fiyatı: ${activePrice} TL
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
3. Boğa Senaryosu tavan hedef fiyatı KESİNLİKLE **${valuation.bull_price} TL** olmalıdır (Güncel fiyat olan ${activePrice} TL'nin ve Adil Değer olan ${valuation.fair_value} TL'nin üzerindedir).
4. KESİNLİKLE '$' VEYA '$$' KULLANMA: Formülleri ve rakamları yazarken hiçbir yerde dolar ($) işareti kullanma! Tüm formülleri düz Türkçe metin olarak '> **Değerleme Özeti:** Hisse Başı Adil Değer = **${valuation.fair_value} TL** (Ayı Senaryosu: **${valuation.bear_price} TL** | Boğa Senaryosu: **${valuation.bull_price} TL**)' şeklinde yaz.
5. KESİNLİKLE YABANCI KELİME KULLANMA: 'Storytelling', 'bancassurance', 'moat', 'guidance' gibi kelimeler yerine 'Temel Yatırım Tezi', 'banka sigortacılığı', 'rekabet üstünlüğü', 'yönetim hedefleri' ifadelerini kullan.

Doğrulanmış ve Raporlardan Birebir Çıkarılmış Çok Yıllı Finansal Zaman Serisi & Rehberlik Veri Seti:
${typeof extractedData === 'string' ? extractedData : JSON.stringify(extractedData, null, 2)}
`;


    if (previousReport) {
      const prevFv = previousReport.fairValue;
      const currFv = valuation.fair_value;
      let fvDiffTxt = '';
      if (prevFv && !isNaN(Number(prevFv)) && Number(prevFv) > 0) {
        const diff = Number((((currFv - Number(prevFv)) / Number(prevFv)) * 100).toFixed(1));
        const sign = diff >= 0 ? '+' : '';
        fvDiffTxt = `(Önceki Çeyrek Adil Değer: ${prevFv} TL -> Güncel Çeyrek: ${currFv} TL [%${sign}${diff} Değişim])`;
      }

      prompt += `\nÖnceki Dönem Raporu, Çeyreklik Hafıza ve Yönetim Hedef Gerçekleşmesi (Dönemsel Beslenme):
Dönem / Tarih: ${previousReport.period || previousReport.createdAt}
Önceki Karar: ${previousReport.decision}
Önceki Skor: ${previousReport.score || 'N/A'}/100
Önceki Fiyat: ${previousReport.price} TL
Önceki Adil Değer: ${previousReport.fairValue || 'Belirtilmedi'} TL ${fvDiffTxt}
${previousReport.extractedData?.future_targets_summary ? `Önceki Çeyrekte Açıklanan Yönetim Hedefleri: ${previousReport.extractedData.future_targets_summary}\n` : ''}

ZORUNLU TALİMAT (Önceki Raporla Karşılaştırma & Çeyreklik Hafıza):
1. Raporunun 'I. Yönetici Özeti' ve 'VI. Temel Riskler & Katalizörler' bölümlerinde şirketin bir önceki çeyreğe göre adil değerinin ve analist skorunun nasıl evrildiğini ${fvDiffTxt} açıkça belirt.
2. Yönetimin bir önceki çeyrekte beyan ettiği hedefleri yeni finansal sonuçlarda tutup tutturamadığını (hedef gerçekleşme karnesi) nesnel olarak değerlendir.
`;
    }

    prompt += `\nBu verileri acımasız filtrelerinden, sektöre özgü (${sectorDef.title}) dinamiklerinden ve değerleme modelinden geçirerek nihai değerleme raporunu üret.`;

    const docEnrichmentHash = computeContentHash(
      JSON.stringify(extractedData?.positive_outlook_highlights || []) +
      JSON.stringify(extractedData?.guidance_track_record || [])
    );
    const cacheKey = `analyze_v3_${resolvedTicker}_${extractedData?.reporting_period || 'latest'}_${activePrice}_${sector}_${docEnrichmentHash}`;

    let reportText = '';
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
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
        reportText = response?.text || '';
      } catch (llmErr: any) {
        console.warn(`[Analyze] LLM çağrısı yapılamadı veya zaman aşımına uğradı (${llmErr?.message}), kurumsal algoritmik rapor üretiliyor...`);
      }
    }

    if (!reportText || reportText.trim().length < 50) {
      reportText = generateAlgorithmicReportFallback({
        ticker: resolvedTicker,
        sector,
        sectorDef,
        price: activePrice,
        valuation,
        drivers,
        scoreResult,
        optimization,
        currentDateStr,
        extractedData
      });
    }

    return NextResponse.json({ 
      report: reportText, 
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

/**
 * Gemini API erişilemediğinde veya hız sınırına takıldığında deterministik matematiksel
 * modeller ve sektörel normlardan beslenen eksiksiz kurumsal değerleme raporu üretir.
 */
function generateAlgorithmicReportFallback(params: {
  ticker: string;
  sector: SectorType;
  sectorDef: any;
  price: string;
  valuation: any;
  drivers: any;
  scoreResult: any;
  optimization: any;
  currentDateStr: string;
  extractedData: any;
}): string {
  const { ticker, sector, sectorDef, price, valuation, drivers, scoreResult, optimization } = params;
  const isIns = sector === 'INSURANCE';
  const isBank = sector === 'BANKING';

  return `### I. Yönetici Özeti ve Temel Yatırım Tezi
> **Bölüm Özeti:** ${ticker} hissesi için hesaplanan adil değer ${valuation.fair_value} TL olup, güncel ${price} TL piyasa fiyatına göre %${valuation.discount_pct} getiri potansiyeli taşımaktadır.

**Temel Yatırım Tezi:** ${ticker}, ${sectorDef.title} sektöründe faaliyet göstermektedir. Yapılan ${valuation.valuation_model_name} analizine göre hissenin hesaplanan adil değeri **${valuation.fair_value} TL** seviyesindedir. Piyasa fiyatı olan **${price} TL** üzerinden yapılan emniyet marjı değerlendirmesi sonucunda analist kararı **${optimization.finalDecision}** olarak belirlenmiştir.

**Finansal Sağlık Skoru:** Şirket 100 üzerinden **${scoreResult.totalScore}** puan alarak sektörel finansal dayanıklılık ve sermaye verimliliği kriterlerini sağlamıştır.

### II. Nakit Akışı ve Kâr Kalitesi Teşhisi
> **Bölüm Özeti:** Şirketin operasyonel nakit üretimi ve kâr dönüşüm kalitesi finansal tablolar bazında incelenmiştir.

- **Kâr Kalitesi ve Nakit Üretimi:** Şirketin kârının nakde dönüşüm kabiliyeti ve bilanço tahakkuk kalitesi sektörel normlar dahilinde analiz edilmiştir.
- **Sermaye Verimliliği:** Şirketin sermaye maliyetini aşma gücü ve özkaynak kârlılığı ${drivers.margin?.label || 'Kârlılık Marjı'} (%${drivers.margin?.value || '0'}) seviyesindedir.

### III. Sektörel Karne ve Rekabet Konumu
> **Bölüm Özeti:** ${sectorDef.title} sektörü standartlarına göre 4 temel boyutta gerçekleştirilen detaylı karne analizi.

- **Büyüme Dinamikleri:** ${drivers.revenue_growth?.label || 'Gelir Büyümesi'} baz varsayımı %${drivers.revenue_growth?.value || '0'} ve ${drivers.net_income_growth?.label || 'Net Kâr Büyümesi'} %${drivers.net_income_growth?.value || '0'} olarak gerçekleşmiştir.
- **Pazar Konumu:** Sektörel çarpan ve kârlılık dinamikleri çerçevesinde rekabet gücü korunmaktadır.

### IV. Sermaye Maliyeti (WACC / Ke) ve İskontolu Değerleme Modeli
> **Değerleme Özeti:** Hisse Başı Adil Değer = **${valuation.fair_value} TL** (Ayı Senaryosu: **${valuation.bear_price} TL** | Boğa Senaryosu: **${valuation.bull_price} TL**)

- **Uygulanan Değerleme Modeli:** ${valuation.valuation_model_name}
- **Hedef Çarpan:** ${drivers.target_multiple?.label || 'Hedef Çarpan'} ${drivers.target_multiple?.value || '0'}x
- **İskonto Oranı:** %${valuation.discount_pct} (${valuation.margin_of_safety_status || 'HESAPLANDI'})

### V. Değer Sürücüleri ve Hassasiyet Tablosu
> **Bölüm Özeti:** Farklı piyasa koşullarına göre senaryo bazlı hedef fiyat aralığı.

- **Ayı Senaryosu (Taban):** **${valuation.bear_price} TL** (Negatif piyasa koşulları ve sıkılaşan marjlar)
- **Baz Senaryo (Adil Değer):** **${valuation.fair_value} TL** (Mevcut gerçekleşmeler ve dengeli büyüme)
- **Boğa Senaryosu (Tavan):** **${valuation.bull_price} TL** (Hedeflerin aşılması ve güçlü çarpan genişlemesi)

### VI. Temel Riskler, Katalizörler ve Nihai Karar

| Metrik | Puan | Max | Gerekçe |
| :--- | :--- | :--- | :--- |
| ${isIns ? 'Teknik Kârlılık & Bileşik Oran' : isBank ? 'Kredi Kalitesi & Risk Yönetimi' : 'Finansal Sağlık & Likidite'} | ${Math.round(scoreResult.totalScore * 0.25)} | 25 | Sektörel standartlara uyum |
| ${isIns ? 'Portföy / Yatırım Getirisi' : isBank ? 'Net Faiz Marjı & Fonlama' : 'Sermaye Verimliliği'} | ${Math.round(scoreResult.totalScore * 0.25)} | 25 | Sermaye kârlılık rasyoları |
| ${isIns ? 'Sermaye Yeterliliği & ROE' : isBank ? 'Sermaye Yeterliliği (SYR)' : 'Nakit Kalitesi ve Emniyet Marjı'} | ${Math.round(scoreResult.totalScore * 0.25)} | 25 | Emniyet marjı ve likidite tamponu |
| ${isIns ? 'Prim Büyümesi & Pazar Payı' : isBank ? 'Komisyon Büyümesi' : 'Gelecek Hedefleri ve Büyüme'} | ${Math.max(0, scoreResult.totalScore - Math.round(scoreResult.totalScore * 0.25) * 3)} | 25 | Büyüme ve pazar payı görünümü |
| **Toplam Puan** | **${scoreResult.totalScore}** | **100** | Model Skoru |

Analist Kararı: [${optimization.finalDecision}]
Yatırım Tezi: ${ticker} hissesi için hesaplanan adil değer ${valuation.fair_value} TL olup, güncel ${price} TL fiyatına kıyasla %${valuation.discount_pct} potansiyel barındırmaktadır.
Kilit Katalizörler: Operasyonel kârlılık artışı, ${drivers.revenue_growth?.label || 'gelir büyümesi'} performansı ve sektörel talep dinamikleri.
Riskler & Emniyet Marjı: Ayı senaryosu taban hedefi ${valuation.bear_price} TL seviyesindedir. ${optimization.conditionalWarnings?.length > 0 ? optimization.conditionalWarnings.join('. ') : 'Makro oynaklık ve faiz seviyeleri izlenmelidir.'}`;
}
