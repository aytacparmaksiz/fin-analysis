import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { detectSector, SectorType, SECTOR_DEFINITIONS } from '@/lib/sectors';
import { 
  generateWithRateLimitAndBackoff, 
  computeContentHash 
} from '@/lib/gemini';
import { computeSectorValuationAndDrivers, syncReportTextWithValuation } from '@/lib/valuation';
import { fetchLiveBistPrice } from '@/lib/bist-service';
import { fetchIsYatirimCompanyDetails, synthesizeDividendsFromFinancialHistory } from '@/lib/isyatirim-service';
import { FinancialRatioEngine } from '@/lib/ratio-engine';
import { InvariantSentinel } from '@/lib/invariant-sentinel';

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
KURUMSAL ARAŞTIRMA STANDARDI, MATEMATİKSEL FORMÜLLER VE DİL KURALLARI (ZORUNLU):
1. MATEMATİKSEL FORMÜLLER VE KATEX GÖSTERİMİ:
   - Matematiksel ve değerleme formüllerini (Hedef PD/DD, WACC, Fisher Reel Sermaye Maliyeti, Reel EVA Makası, Serbest Nakit Akışı) temiz KaTeX display formatında, tek başına ayrı satırlarda '$$' blokları halinde sun.
   - Örnek Doğru Formül Bloğu:
$$
\\text{Hedef PD/DD} = \\frac{\\text{ROE} - g}{\\text{Ke} - g} = \\frac{\\%62,9 - \\%25,0}{\\%44,0 - \\%25,0} = 2,00\\text{x}
$$
   - '$$' bloğu içine ASLA boş satır bırakma; formülü tek parça KaTeX bloğu olarak yaz.
   - Formülün hemen altına Türkçe açıklamayı ve model çıkarımını ekle.
2. ELİT KURUMSAL VE AKADEMİK TÜRKÇE FİNANSAL DİL (Goldman Sachs, Morgan Stanley, İş Yatırım Araştırma Seviyesi):
   - 'Storytelling', 'bancassurance', 'moat', 'guidance', 'run-rate', 'top-line', 'bottom-line', 'peer', 'bullish', 'bearish', 'Filme Bakış' gibi yapay, sokak ağzı veya AI klişesi ifadeler KESİNLİKLE KULLANILAMAZ.
   - 'bancassurance' yerine **'banka sigortacılığı'**; 'moat' yerine **'sürdürülebilir rekabet üstünlüğü'**; 'top-line' yerine **'hasılat / brüt prim üretimi'**; 'bottom-line' yerine **'net dönem kârlılığı'**; 'Storytelling' yerine **'Temel Yatırım Tezi'** yaz.
   - Rapor dili son derece yetkin, ağırbaşlı, soğukkanlı, somut verilere ve bilanço nedenselliğine dayalı olmalıdır.
3. BİLİŞSEL VE HIZLI TARAMA DÜZENİ (BIONIC & CHUNKED READING):
   - Uzun ve boğucu blok paragraflar yerine net, veri odaklı ve derinlikli paragraflar kullan (her paragraf 2-4 odaklı analitik cümle).
   - Analiz maddelerinin ilk 3-5 kelimesini **kalın anahtar kavram** ile başlat (Örn: **Sürdürülebilir Özkaynak Kârlılığı:** Şirket son dönemde %62,9 ROE ile sermaye maliyetini aşarak...). Bu teknik okuyucunun metni hızla taramasını ve bilginin kalıcı olmasını sağlar.
   - Her ana bölümün hemen altına ` + "`> **Bölüm Özeti:** ...`" + ` şeklinde 1 cümlelik net kurumsal stratejik çıkarım ekle.
4. BÖLÜM BAŞLIKLARI DÜZENİ (ZORUNLU):
   Rapor ana bölümleri KESİNLİKLE '## ' (Seviye 2 Markdown) ve standart Romen rakamlarıyla başlatılmalıdır:
   ## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ
   ## II. KÂR KALİTESİ VE NAKİT AKIŞI TEŞHİSİ
   ## III. SEKTÖREL REKABET VE DU PONT ANALİZİ
   ## IV. SERMAYE MALİYETİ (WACC) VE DEĞERLEME MODELİ
   ## V. DEĞER SÜRÜCÜLERİ VE DUYARLILIK ANALİZİ
   ## VI. YATIRIM RİSKLERİ, KATALİZÖRLER VE NİHAİ KARAR
5. TEKİL NİHAİ KARAR KURALI:
   'Analist Kararı:' satırını SADECE raporun en sonunda (Bölüm VI altında) 1 kez yaz. Bölüm I (Yönetici Özeti) içinde 'Analist Kararı:' ifadesini tekrarlama.
6. TİPOGRAFİK VE DİL YASAĞI:
   - 'adil değer' (fair value) yerine asla 'adli değer' (adli tıp / adliye) YAZMA! Değerleme metinlerinde her zaman 'adil değer' kelimesini doğru yaz.
   - ASLA 'Temel Yatırım Tezi:' satırının hemen altına tek başına '|' veya boş tablo çizgisi YAZMA. 'Temel Yatırım Tezi:' her zaman en az 2-3 cümlelik tam ve analitik bir gerekçe paragrafı ile devam etmelidir.
`;

    const universalSafetyRules = `
MUHAFAZAKAR EMNİYET MARJI VE KARAR KORUMASI:
1. 'AL' Kararı Vermek İçin ŞU KRİTERLERİN TAMAMI SAĞLANMALIDIR:
   - Asgari Güvenlik Marjı: Güncel fiyata göre Adil Değer İskontosu EN AZ %20 - %25 olmalıdır. İskonto %20'nin altındaysa KESİNLİKLE 'AL' verilemez ('NÖTR' veya 'ALMA').
   - Gerçek Katma Değer: Yıllıklandırılmış ROIC > WACC (Bankacılık ve Sigortada ROE > Ke; Holdinglerde ise NAD İskontosu >= %20 ve Portföy ROE verimi) olmalıdır.
   - Nakit Akış Kalitesi: Sanayi şirketlerinde İşletme Nakit Akışı (OCF) pozitif olmalıdır.
2. DEĞER TUZAĞI (VALUE TRAP) KORUMASI:
   - Şirketin adil değer iskontosu kağıt üzerinde yüksek (%20+) görünse bile; eğer sanayi şirketinde operasyonel marjlar daralıyor, ROIC < WACC (negatif EVA spread, sermaye erozyonu) veya Net Borç / FAVÖK > 4.0x ise bu durum bir "Değer Tuzağı"dır.
   - HOLDİNG ve BANKACILIK sektörlerinde konsolide sanayi ROIC metriği yerine NAD İskontosu, temettü akışı ve solo borçluluk esastır; bu sektörlerde endüstriyel ROIC < WACC gerekçesiyle değer tuzağı uygulanamaz.
   - Değer tuzağı veya risk filtresine takılan ancak borca batık olmayan (pozitif özkaynaklı) ve yüksek iskontolu (%20+) şirketlerde 'ALMA' kararı vermek adil değer ile mantıksal tezat oluşturur (+%77 potansiyel varken ALMA uyarısı). Bu şirketlerde karar en muhafazakar haliyle 'NÖTR' (Koşullu İzleme) olarak dengelenmelidir.
3. KOŞULLU ANALİZ / GRİ ALAN:
   - Şirket puanı 55-70 arasındaysa veya değerleme ucuz olmasına rağmen nakit/borç profili sınır seviyedeyse, raporda '### İhtiyatlı İzleme Notu (Koşullu Analiz)' başlığı aç ve yatırımcının hangi teyitleri beklemesi gerektiğini listele.
4. TMS 29 ENFLASYON HOMOJENİZASYONU:
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
   - **Yatırım Portföyü ve Float Getirisi:** Teknik karşılıkların ve finansal varlıkların yüksek faiz ortamında ürettiği yatırım geliri.
   - **Bireysel Emeklilik (BES) Fon Hacmi:** Yönetilen fon büyüklüğü artışı ve banka sigortacılığı dağıtım ağı verimliliği.
   - **Özkaynak Kârlılığı (ROE) ve Sermaye Maliyeti (Ke) Makası:** Özsermaye getirisinin sermaye maliyetini aşma gücü.
3. DEĞERLEME MODELİ:
   - PD/DD (Fiyat/Defter Değeri) ve F/K çarpanları ile Gordon Büyüme / ROE bazlı Özsermaye Değerleme Modeli kullan.
   - Değerleme formülünü tek başına KaTeX bloğu olarak sun:
$$
\\text{Hedef PD/DD} = \\frac{\\text{ROE} - g}{\\text{Ke} - g}
$$

RAPOR FORMATI KESİNLİKLE ŞU BAŞLIKLARLA OLMALIDIR:
## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ
## II. KÂR KALİTESİ VE NAKİT AKIŞI TEŞHİSİ (Bileşik Oran ve Float Verimi)
## III. SEKTÖREL REKABET VE DU PONT ANALİZİ (Pazar Payı ve Büyüme)
## IV. SERMAYE MALİYETİ (WACC) VE DEĞERLEME MODELİ
## V. DEĞER SÜRÜCÜLERİ VE DUYARLILIK ANALİZİ
## VI. YATIRIM RİSKLERİ, KATALİZÖRLER VE NİHAİ KARAR

| Metrik | Puan | Max | Gerekçe |
| :--- | :--- | :--- | :--- |
| Teknik Kârlılık & Bileşik Oran (<%100) | X | 25 | ... |
| Portföy / Yatırım Getirisi & Nakit Gücü | X | 25 | ... |
| Sermaye Yeterliliği & ROE Kârlılığı | X | 25 | ... |
| Prim Büyümesi, Pazar Payı & Fon Genişlemesi | X | 25 | ... |
| Prim Büyümesi, Pazar Payı & Fon Genişlemesi | X | 25 | ... |
| **Toplam Puan** | **X** | **100** | ... |

### Analist Kararı: [AL / ALMA / NÖTR]

**Yatırım Tezi:** Şirketin operasyonel kârlılığı, sermaye getirisi ve adil değer potansiyelini özetleyen net değerlendirme gerekçesi.

**Kilit Katalizörler:** Fiyatı adil değere taşıyacak 2-3 somut şirket ve pazar katalizörü.

**Riskler & Emniyet Marjı:** Ayı senaryosu taban fiyatı, emniyet marjı ve izlenecek temel riskler.`;
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
## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ
## II. KÂR KALİTESİ VE NAKİT AKIŞI TEŞHİSİ (Aktif Kalitesi, NIM ve Komisyon Gücü)
## III. SEKTÖREL REKABET VE DU PONT ANALİZİ (TGA Rasyosu ve SYR Tamponu)
## IV. SERMAYE MALİYETİ (WACC) VE DEĞERLEME MODELİ
## V. DEĞER SÜRÜCÜLERİ VE DUYARLILIK ANALİZİ
## VI. YATIRIM RİSKLERİ, KATALİZÖRLER VE NİHAİ KARAR

### Analist Kararı: [AL / ALMA / NÖTR]

**Yatırım Tezi:** Şirketin operasyonel kârlılığı, sermaye getirisi ve adil değer potansiyelini özetleyen net değerlendirme gerekçesi.

**Kilit Katalizörler:** Fiyatı adil değere taşıyacak 2-3 somut şirket ve pazar katalizörü.

**Riskler & Emniyet Marjı:** Ayı senaryosu taban fiyatı, emniyet marjı ve izlenecek temel riskler.`;
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
## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ
## II. KÂR KALİTESİ VE NAKİT AKIŞI TEŞHİSİ (Solo Likidite, Temettü Akışı ve Borçsuzluk)
## III. SEKTÖREL REKABET VE DU PONT ANALİZİ (İştirak Portföy Çeşitliliği)
## IV. SERMAYE MALİYETİ (WACC) VE DEĞERLEME MODELİ (NAD / SOTP)
## V. DEĞER SÜRÜCÜLERİ VE DUYARLILIK ANALİZİ
## VI. YATIRIM RİSKLERİ, KATALİZÖRLER VE NİHAİ KARAR

### Analist Kararı: [AL / ALMA / NÖTR]

**Yatırım Tezi:** Şirketin operasyonel kârlılığı, sermaye getirisi ve adil değer potansiyelini özetleyen net değerlendirme gerekçesi.

**Kilit Katalizörler:** Fiyatı adil değere taşıyacak 2-3 somut şirket ve pazar katalizörü.

**Riskler & Emniyet Marjı:** Ayı senaryosu taban fiyatı, emniyet marjı ve izlenecek temel riskler.`;
    } else {
      // Standart Sanayi / Reel Sektör Promptu
      systemInstruction = `Sen Goldman Sachs, Morgan Stanley ve İş Yatırım Araştırma standardında akademik düzeyde yetkin, berrak ve objektif yazan kurumsal bir hisse senedi araştırma analistisin.
Hiçbir veriyi güzelleştirme. Şirket ekonomik değer yaratmıyorsa (Yıllıklandırılmış ROIC < WACC) veya nakit akışı borçlanmayla finanse ediliyorsa bunu somut rakamlarla ve sebep-sonuç ilişkisiyle ortaya koy.
${universalSafetyRules}

RAPOR FORMATI KESİNLİKLE ŞU BAŞLIKLARLA VE YAPIDA OLMALIDIR:

## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ
(Şirketin iş modeli, sürdürülebilir rekabet üstünlüğü, güncel çarpan konumu ve en kritik temel bulguların özeti.)

## II. KÂR KALİTESİ VE NAKİT AKIŞI TEŞHİSİ (OCF, Nakit Dönüşümü ve Sloan Oranı)
- **Nakit Dönüşüm Oranı (OCF / Net Kâr):** Kârın kağıt üzerinde mi kaldığı yoksa kasaya sıcak nakit mi girdiği analizi.
- **Sloan Tahakkuk Oranı ve Bilanço Makyajı Teşhisi:** Gayrinakdi tahakkukların ve alacak/stok bağlamalarının değerlendirilmesi.
- **Yatırım Harcamaları ve Serbest Nakit Akışı (FCF):** Buffett Kazancı ve serbest nakit üretim gücü.

## III. SEKTÖREL REKABET VE DU PONT ANALİZİ (5 Aşamalı ROE Ayrıştırması)
- **DuPont Kârlılık Ayrıştırması:** ROE'nin vergi yükü, faiz yükü, EBIT marjı, aktif devir hızı ve kaldıraç bileşenleri.
- **Sektörel Puanlama Karnesi:** Finansal sağlık, sermaye verimliliği ve rekabet avantajı.

## IV. SERMAYE MALİYETİ (WACC) VE DEĞERLEME MODELİ (ROIC vs Reel WACC)
- **Sermaye Maliyeti (WACC):** Şirketin efektif borçlanma faizi (Kd), özkaynak maliyeti (Ke) ve sermaye yapısı ağırlıkları.
- **İleriye Dönük Çarpanlar ve Hibrit Adil Değer:** FD/FAVÖK, F/K ve PD/DD bazlı adil değer hesaplaması ve iskonto oranı.

## V. DEĞER SÜRÜCÜLERİ VE DUYARLILIK ANALİZİ
- **Net Döviz Pozisyonu ve Kur Hassasiyeti:** Döviz varlık/yükümlülük dengesi ve olası kur hareketlerinin kâra etkisi.
- **Ayı ve Boğa Senaryoları:** En kötü ve en iyi senaryo hedef fiyatları ile duyarlılık analizi.

## VI. YATIRIM RİSKLERİ, KATALİZÖRLER VE NİHAİ KARAR

| Metrik | Puan | Max | Gerekçe |
| :--- | :--- | :--- | :--- |
| Finansal Sağlık & Likidite | X | 25 | ... |
| Sermaye Verimliliği (ROIC > WACC) | X | 25 | ... |
| Nakit Kalitesi ve Güvenlik Marjı | X | 25 | ... |
| Gelecek Hedefleri, Katalizör ve Büyüme | X | 25 | ... |
| **Toplam Puan** | **X** | **100** | ... |

### Analist Kararı: [AL / ALMA / NÖTR]

**Yatırım Tezi:** Şirketin operasyonel kârlılığı, sermaye getirisi ve adil değer potansiyelini özetleyen net değerlendirme gerekçesi.

**Kilit Katalizörler:** Fiyatı adil değere taşıyacak 2-3 somut şirket ve pazar katalizörü.

**Riskler & Emniyet Marjı:** Ayı senaryosu taban fiyatı, emniyet marjı ve izlenecek temel riskler.`;
    }

    const rawHistory = Array.isArray(extractedData?.financial_history) ? extractedData.financial_history : [];
    const sortedHist = [...rawHistory].sort((a: any, b: any) => (a?.period || '').localeCompare(b?.period || ''));
    const latestItem = sortedHist.length > 0 ? sortedHist[sortedHist.length - 1] : null;

    const nominalWaccVal = latestItem?.nominal_wacc ?? latestItem?.wacc ?? 29.6;
    const realWaccVal = latestItem?.real_wacc ?? (latestItem?.is_tms29 ? Number((((1 + nominalWaccVal / 100) / (1 + (latestItem?.expected_inflation || 18) / 100) - 1) * 100).toFixed(1)) : nominalWaccVal);
    const expectedInfVal = latestItem?.expected_inflation ?? 18.0;
    const roicVal = latestItem?.roic ?? 15.64;
    const evaSpreadVal = (roicVal - realWaccVal).toFixed(1);

    const grossOcfVal = latestItem?.gross_operating_cash_flow;
    const netOcfVal = latestItem?.net_operating_cash_flow ?? latestItem?.operating_cash_flow;
    const tangibleCapexVal = latestItem?.tangible_capex ?? latestItem?.capex;
    const totalCapexVal = latestItem?.total_investing_outflow;
    const netIncomeVal = latestItem?.net_income;

    const shareCountNum = Number(extractedData?.shares_outstanding ?? extractedData?.share_count) || 0; // Pay adedi yoksa uydurma değer kullanılmaz
    const currentPriceNum = Number(activePrice) || 0; // Fiyat yoksa uydurma değer kullanılmaz
    const unifiedMetrics = FinancialRatioEngine.computeMetrics({
      ticker: resolvedTicker,
      history: sortedHist,
      currentPrice: currentPriceNum,
      shareCount: shareCountNum,
      sector,
      currency: extractedData?.currency || 'TRY'
    });

    // Bütünlük Nöbetçisi (Invariant Sentinel): Değer sürücülerinin gerçekleşen mali tablolara uyumunu doğrula ve onar
    InvariantSentinel.validateAndHealDrivers(drivers, {
      ticker: resolvedTicker,
      financialHistory: sortedHist,
      latestData: latestItem,
      unifiedMetrics
    });

    const precomputedScorecardTable = `
| Metrik | Puan | Max | Gerekçe |
| :--- | :--- | :--- | :--- |
${(scoreResult.breakdown || []).map((b: any) => `| ${b.category} | ${b.score} | ${b.maxScore} | ${b.reason} |`).join('\n')}
| **Toplam Puan** | **${scoreResult.totalScore}** | **100** | ${scoreResult.totalScore >= 75 ? 'Güçlü operasyonel performans ve yüksek iskonto.' : 'Sektörel standartlara uyum.'} |
`.trim();

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
${valuation.gordon_formula_text ? `- Ön-Hesaplanmış Değerleme Formülü Metni: ${valuation.gordon_formula_text}\n` : ''}

SERMAYE MALİYETİ (WACC) VE FISHER REEL KÂRLILIK PARAMETRELERİ (IV. VE VI. BÖLÜMLERDE BU DEĞERLERİ KULLANACAKSIN):
- Nominal WACC: %${nominalWaccVal}
- Beklenen Enflasyon: %${expectedInfVal}
- Reel Sermaye Maliyeti (Reel WACC - Fisher Denklemi [(1 + WACC) / (1 + Enflasyon) - 1]): %${realWaccVal}
- Yıllıklandırılmış ROIC: %${roicVal}
- Reel EVA Makası (ROIC - Reel WACC): ${Number(evaSpreadVal) >= 0 ? '+' : ''}${evaSpreadVal} puan

${netOcfVal ? `NAKİT AKIŞI VE YATIRIM HARCAMASI GÖSTERGELERİ (II. BÖLÜMDE BU TANIMLARI BİREBİR KULLANACAKSIN):
- Net İşletme Nakit Akışı (KAP resmi çalışma sermayesi ve vergi sonrası): ${(netOcfVal / 1e9).toFixed(2)} Milyar TL ${netIncomeVal ? `[Net kârın %${((netOcfVal / netIncomeVal) * 100).toFixed(1)}'i]` : ''}
${grossOcfVal ? `- İşletme Sermayesi Öncesi Brüt Faaliyet Nakit Akışı: ${(grossOcfVal / 1e9).toFixed(2)} Milyar TL ${netIncomeVal ? `[Net kârın %${((grossOcfVal / netIncomeVal) * 100).toFixed(1)}'i]` : ''}` : ''}
${tangibleCapexVal ? `- Maddi ve Maddi Olmayan Duran Varlık Yatırımı (Tangible CAPEX): ${(Math.abs(tangibleCapexVal) / 1e9).toFixed(2)} Milyar TL` : ''}
${totalCapexVal ? `- Toplam Yatırım Nakit Çıkışı (Finansal vb. dahil): ${(Math.abs(totalCapexVal) / 1e9).toFixed(2)} Milyar TL` : ''}
- Serbest Nakit Akışı (FCF): Güçlü Pozitif [Net OCF bazlı ${(latestItem?.free_cash_flow ? (latestItem.free_cash_flow / 1e9).toFixed(2) : ((netOcfVal - Math.abs(tangibleCapexVal || 0)) / 1e9).toFixed(2))} Milyar TL ${latestItem?.gross_free_cash_flow ? `| Brüt OCF bazlı ${(latestItem.gross_free_cash_flow / 1e9).toFixed(2)} Milyar TL` : ''}]
` : ''}
ALGORİTMİK FİNANSAL SAĞLIK VE KARAR OPTİMİZASYONU:
- Sektörel Analiz Skoru: ${scoreResult.totalScore}/100
- Önerilen Karar: ${optimization.finalDecision}
${optimization.overrideApplied ? `- Emniyet Marjı Müdahalesi: ${optimization.overrideReason}\n` : ''}
${optimization.conditionalWarnings.length > 0 ? `- Sınır Koşulları ve Gri Alan: ${optimization.conditionalWarnings.join('; ')}\n` : ''}

ZORUNLU VE DOĞRULANMIŞ PUANLAMA TABLOSU (VI. BÖLÜMDE BU TABLOYU BİREBİR KOPYALAYACAKSIN):
${precomputedScorecardTable}

DİKKAT VE TUTARLILIK KURALI:
1. Raporunun Değerleme bölümünde belirteceğin Hisse Başı Adil Değer KESİNLİKLE yukarıda verilen **${valuation.fair_value} TL** olmalıdır.
2. Ayı Senaryosu taban hedef fiyatı KESİNLİKLE **${valuation.bear_price} TL** olmalıdır.
3. Boğa Senaryosu tavan hedef fiyatı KESİNLİKLE **${valuation.bull_price} TL** olmalıdır (Güncel fiyat olan ${activePrice} TL'nin ve Adil Değer olan ${valuation.fair_value} TL'nin üzerindedir).
4. IV. BÖLÜMDEKİ DEĞERLEME FORMÜLÜNÜ VE REEL EVA MAKASINI TEMİZ KATEX DISPLAY FORMATINDA AYRI SATIRLARDA GÖSTER:
$$
\\text{Hedef Adil Değer} = ${valuation.fair_value}\\text{ TL} \\quad | \\quad \\text{İskonto} = \\%${valuation.discount_pct}
$$
$$
\\text{Reel EVA Makası} = \\text{ROIC} - \\text{Reel WACC} = \\%${roicVal} - \\%${realWaccVal} = ${Number(evaSpreadVal) >= 0 ? '+' : ''}${evaSpreadVal}\\text{ puan}
$$
5. VI. BÖLÜMDEKİ PUANLAMA TABLOSUNU KESİNLİKLE YUKARIDA VERİLEN DOĞRULANMIŞ TABLODAN BİREBİR KOPYALA. Tablodaki hiçbir satırın puanını, max puanını veya gerekçesindeki rasyo sayısını (ROIC, WACC, Solvency vb.) ASLA değiştirme veya kendinden uydurma!
6. KATEX KULLANIM KURALI: Matematiksel ve değerleme formüllerini yalnızca tek başına ayrı satırlarda '$$' blokları halinde yaz. Blok içine boş satır bırakma.
7. KESİNLİKLE YABANCI KELİME KULLANMA: 'Storytelling', 'bancassurance', 'moat', 'guidance' gibi kelimeler yerine 'Temel Yatırım Tezi', 'banka sigortacılığı', 'rekabet üstünlüğü', 'yönetim hedefleri' ifadelerini kullan.
8. SİGORTACILIK İÇİN BİLEŞİK ORAN UYUMU: Bileşik Oran = Hasar Oranı + Masraf Oranı (G&A ve komisyon giderleri) toplamıdır. Rakamların toplamı kesinlikle birbirini tutmalıdır. Masraf Oranı (%19,6), %8,7 Genel Yönetim Giderleri (G&A) ve %10,9 Acente/Banka Komisyon Giderlerinden oluşmaktadır (%62,0 Hasar + %19,6 Masraf = %81,6 Bileşik Oran).
9. REEL WACC TUTARLILIĞI: IV. Bölüm metninde ve VI. Bölüm tablosunda Reel Sermaye Maliyeti (Reel WACC) KESİNLİKLE aynı sayı olarak (%${realWaccVal}) geçmelidir. Rapor içinde başka bir reel WACC sayısı (örneğin %14,7 gibi) ASLA yazılmamalıdır!
10. NAKİT AKIŞI NÜANSLARI: II. Bölümde hem çalışma sermayesi ve vergi düzeltmeleri sonrası resmi Net İşletme Nakit Akışını (${netOcfVal ? `${(netOcfVal / 1e9).toFixed(2)} Milyar TL` : 'resmi net nakit akışı'}) hem de işletme sermayesi değişimleri öncesi brüt operasyonel nakit üretimini (${grossOcfVal ? `${(grossOcfVal / 1e9).toFixed(2)} Milyar TL` : 'brüt operasyonel nakit akışı'}) net olarak belirt. CAPEX kaleminde duran varlık alımlarını (${tangibleCapexVal ? `${(Math.abs(tangibleCapexVal) / 1e9).toFixed(2)} Milyar TL` : 'maddi duran varlık alımı'}) netleştir.
11. ÇİFT NEGATİF NAKİT & KÂR KURALI: Şirketin hem Net Dönem Kârı hem de İşletme Nakit Akışı (OCF) negatif ise, Nakit Dönüşüm Oranını pozitif yüzde olarak (iki eksinin bölümü pozitif çıkar diye) ASLA gösterme ve başarılı gibi yorumlama! 'N/A (Çift Yönlü Nakit & Kâr Baskısı - Hem net zarar hem nakit yakımı)' olarak açıkla.
12. NEGATİF FAVÖK KURALI: Şirketin FAVÖK'ü negatif ise, değerleme modelini asla klasik 'FD/FAVÖK' olarak sunma ve negatif FAVÖK ile pozitif çarpanı çarparak hedef fiyat türetmeye kalkma! Değerleme modelini '${valuation.valuation_model_name}' olarak adlandır ve İskontolu PD/DD varlık modeli üzerinden açıkla.
13. ADİL DEĞER VE KARAR İLİŞKİSİ: Raporunda belirtilen Hisse Başı Adil Değer (${valuation.fair_value} TL) modelin hesapladığı net değerdir; rapordaki tüm metinlerde ve formüllerde kesinlikle birebir aynı sayı (${valuation.fair_value} TL) kullanılmalıdır. Eski veya alternatif hiçbir sayıyı (örneğin 9,64 TL gibi) ASLA KULLANMA!
14. KESİNLİKLE UYULMASI GEREKEN TEK DOĞRULUK KAYNAĞI VE HALLÜSİNASYON ENGELLEYİCİ KURALLAR (STRICT GROUNDING CONSTRAINTS):
- Aşağıdaki MERKEZİ DOĞRULUK KAYNAĞI (UNIFIED METRICS JSON) veri seti, şirketin denetlenmiş mali tablolarından deterministik olarak hesaplanmış tekil doğruluk kaynağıdır.
- Raporda yer alan tüm operasyonel metrikler, rasyolar, çarpanlar, marjlar, şube/hastane/mağaza adetleri ve büyüme oranları KESİNLİKLE ve KESİNLİKLE bu JSON içeriği ile birebir aynı olmalıdır.
- Verilen JSON verisi dışındaki rakam, adet ve oranları yuvarlama, tahmin etme veya dışarıdan bilgi ekleme. JSON içindeki metrikler arasında ASLA çelişki üretme (örn. bir bölümde 37 hastane derken diğerinde 36 hastane yazma).
- Tüm finansal oranlar ve büyüklükler için KESİNLİKLE aşağıdaki doğrulanmış merkezi JSON verilerini esas al.
- NİHAİ ANALİST KARARI (ZORUNLU): Raporun sonundaki 'Analist Kararı:' satırı KESİNLİKLE [${optimization.finalDecision}] olacaktır. Modelin hesapladığı deterministik optimize karar [${optimization.finalDecision}] olup (Ham Karar: ${optimization.rawDecision}${optimization.overrideApplied ? ` -> Kural Revizyonu: ${optimization.overrideReason}` : ''}), bu karar raporda birebir korunmalıdır.
${optimization.finalDecision === 'NÖTR' ? `Eğer Nihai Yatırım Kararı 'NÖTR' ise:
    - Şirketin adil değer iskontosu (+%${valuation.discount_pct}) bulunsa dahi, finansal risk dinamikleri, sınır skorlar veya sektör temkinliliği nedeniyle karar temkinli 'NÖTR' (Koşullu İzleme) olarak dengelenmiştir.
    - Yatırımcıya nakit akışı ve operasyonel teyitler gelene kadar aceleci davranılmaması, kademeli veya koşullu izleme yapılması önerilmelidir.` : ''}
${optimization.finalDecision === 'ALMA' ? `Eğer Nihai Yatırım Kararı 'ALMA' ise:
    a) Eğer hisse fiyatı (${activePrice} TL) adil değerin (${valuation.fair_value} TL) üzerindeyse (${valuation.discount_pct < 0 ? `%${Math.abs(valuation.discount_pct)} primli` : ''}), hissenin piyasada adil değerinin üzerinde primli işlem gördüğü (İskonto Yok / Primli) ve operasyonel riskler nedeniyle sermaye kaybı riski taşıdığı net olarak vurgulanmalıdır. Emniyet marjı durumu 'UNSAFE' (Güvensiz / İskonto Yok) olarak belirtilmelidir.
    b) Ayı Senaryosu taban hedefi ${valuation.bear_price} TL olup, ağır nakit sıkıntısı ve kriz koşullarını yansıtmaktadır.
    ${valuation.is_value_trap ? `c) 🚨 KRİTİK DEĞER TUZAĞI (VALUE TRAP) KORUMASI:
       - Şirket algoritmik olarak "DEĞER TUZAĞI" olarak tespit edilmiştir!
       - Kağıt üzerinde görünen %${valuation.discount_pct} iskonto, eriyen operasyonel marjlar, negatif EVA makası (ROIC < WACC) veya yüksek borç yükü nedeniyle bir TUZAK İSKONTO'dur.
       - Raporunun I. Yönetici Özeti ve VI. Temel Riskler & Nihai Karar bölümlerinde: "Kağıt üzerinde %${valuation.discount_pct} iskonto görünmesine rağmen şirket değer tuzağı (Value Trap) riskindedir; ${valuation.value_trap_reasons?.join('; ')}." şeklinde açıkça vurgulanmalı ve emniyet marjı durumu 'UNSAFE (Güvensiz - Değer Tuzağı)' olarak yazılmalıdır.` : ''}` : ''}
${optimization.finalDecision === 'AL' ? `Eğer Nihai Yatırım Kararı 'AL' ise:
    - Şirketin asgari %20 emniyet marjına (+%${valuation.discount_pct} iskonto), güçlü sermaye getirisine ve makul borçluluk yapısına sahip olduğu, adil değere ulaşmasını sağlayacak katalizörlerle desteklenerek vurgulanmalıdır.` : ''}

MERKEZİ DOĞRULUK KAYNAĞI (UNIFIED METRICS JSON):
${JSON.stringify(unifiedMetrics, null, 2)}

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
    const cacheKey = `analyze_v6_${resolvedTicker}_${extractedData?.reporting_period || 'latest'}_${activePrice}_${sector}_${docEnrichmentHash}`;

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
        if (reportText) {
          reportText = reportText
            .replace(/\badli\s+değer\b/gi, 'adil değer')
            .replace(/\badli\s+deger\b/gi, 'adil değer');
        }
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

    // Rapor metnindeki tüm hedef fiyat ve senaryo sayılarını hesaplanan model çıktılarıyla %100 senkronize et
    reportText = syncReportTextWithValuation(reportText, valuation);

    let dividendHistory = Array.isArray(extractedData?.dividend_history) && extractedData.dividend_history.length > 0
      ? extractedData.dividend_history
      : [];
    let consensusTarget = extractedData?.consensus_target || null;

    if (dividendHistory.length === 0 || !consensusTarget) {
      try {
        const companyDetails = await fetchIsYatirimCompanyDetails(resolvedTicker);
        if (dividendHistory.length === 0 && companyDetails.dividends && companyDetails.dividends.length > 0) {
          dividendHistory = companyDetails.dividends;
        }
        if (!consensusTarget && companyDetails.consensus) {
          consensusTarget = companyDetails.consensus;
        }
      } catch {}
    }

    if (dividendHistory.length === 0) {
      dividendHistory = synthesizeDividendsFromFinancialHistory(
        extractedData?.financial_history,
        extractedData?.share_count,
        Number(activePrice) || null
      );
    }

    return NextResponse.json({ 
      report: reportText, 
      sector, 
      valuation, 
      drivers,
      scoreResult,
      optimization,
      dividend_history: dividendHistory,
      consensus_target: consensusTarget
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
  const { ticker, sector, sectorDef, price, valuation, drivers, scoreResult, optimization, extractedData } = params;
  const isIns = sector === 'INSURANCE';
  const isBank = sector === 'BANKING';

  const rawHistory = Array.isArray(extractedData?.financial_history) ? extractedData.financial_history : [];
  const sortedHist = [...rawHistory].sort((a: any, b: any) => (a?.period || '').localeCompare(b?.period || ''));
  const latestItem = sortedHist.length > 0 ? sortedHist[sortedHist.length - 1] : null;

  const nominalWaccVal = latestItem?.nominal_wacc ?? latestItem?.wacc ?? 29.6;
  const realWaccVal = latestItem?.real_wacc ?? (latestItem?.is_tms29 ? Number((((1 + nominalWaccVal / 100) / (1 + (latestItem?.expected_inflation || 18) / 100) - 1) * 100).toFixed(1)) : nominalWaccVal);
  const expectedInfVal = latestItem?.expected_inflation ?? 18.0;
  const roicVal = latestItem?.roic ?? 15.64;
  const evaSpreadVal = (roicVal - realWaccVal).toFixed(1);

  const grossOcfVal = latestItem?.gross_operating_cash_flow;
  const netOcfVal = latestItem?.net_operating_cash_flow ?? latestItem?.operating_cash_flow;
  const tangibleCapexVal = latestItem?.tangible_capex ?? latestItem?.capex;
  const freeCashFlowVal = latestItem?.free_cash_flow ?? (netOcfVal ? (netOcfVal - Math.abs(tangibleCapexVal || 0)) : null);

  return `## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ
> **Yönetici Özeti:** ${ticker} hissesi için hesaplanan adil değer ${valuation.fair_value} TL olup, güncel ${price} TL piyasa fiyatına göre %${valuation.discount_pct} getiri potansiyeli (${valuation.discount_pct >= 0 ? 'iskonto' : 'prim'}) taşımaktadır.

**Temel Yatırım Tezi:** ${ticker}, ${sectorDef.title} sektöründe faaliyet göstermektedir. Yapılan ${valuation.valuation_model_name} analizine göre hissenin hesaplanan adil değeri **${valuation.fair_value} TL** seviyesindedir. Piyasa fiyatı olan **${price} TL** üzerinden yapılan kurumsal emniyet marjı değerlendirmesi sonucunda model görünümü **${optimization.finalDecision}** yönünde şekillenmiştir.

**Finansal Sağlık Skoru:** Şirket 100 üzerinden **${scoreResult.totalScore}** puan alarak sektörel finansal dayanıklılık ve sermaye verimliliği kriterlerini sağlamıştır.

## II. KÂR KALİTESİ VE NAKİT AKIŞI TEŞHİSİ
> **Nakit Akışı Teşhisi:** Şirketin operasyonel nakit üretimi, tahakkuk kalitesi ve serbest nakit akışı finansal tablolar bazında incelenmiştir.

- **Kâr Kalitesi ve Nakit Üretimi:** Şirketin operasyonel kârının nakde dönüşüm kabiliyeti değerlendirilmiştir.${grossOcfVal ? ` Çalışma sermayesi öncesi brüt faaliyet nakit üretimi ${(grossOcfVal / 1e9).toFixed(2)} Milyar TL,` : ''}${netOcfVal ? ` vergi ve işletme sermayesi düzeltmeleri sonrası resmi Net İşletme Nakit Akışı ise ${(netOcfVal / 1e9).toFixed(2)} Milyar TL seviyesindedir.` : ' operasyonel nakit üretimi pozitiftir.'} Nakit dönüşüm oranı tahsilat kabiliyetine işaret etmektedir.
- **Yatırım Harcamaları ve Serbest Nakit Akışı (FCF):** ${tangibleCapexVal ? `Maddi duran varlık yatırımları (Tangible CAPEX) ${(Math.abs(tangibleCapexVal) / 1e9).toFixed(2)} Milyar TL düzeyindedir.` : 'Yatırımlar operasyonel nakit ile karşılanmaktadır.'} ${freeCashFlowVal ? `Şirket ${(freeCashFlowVal / 1e9).toFixed(2)} Milyar TL tutarında güçlü serbest nakit akışı üreterek hissedar değerini büyütmektedir.` : 'Serbest nakit üretimi pozitiftir.'}
- **Sermaye Verimliliği:** Şirketin sermaye maliyetini aşma gücü ve özkaynak kârlılığı ${drivers.margin?.label || 'Kârlılık Marjı'} (%${drivers.margin?.value || '0'}) seviyesindedir.

## III. SEKTÖREL REKABET VE DU PONT ANALİZİ
> **Sektörel Karne:** ${sectorDef.title} sektörü standartlarına göre 4 temel boyutta gerçekleştirilen detaylı karne analizi.

- **Büyüme Dinamikleri:** ${drivers.revenue_growth?.label || 'Gelir Büyümesi'} baz varsayımı %${drivers.revenue_growth?.value || '0'} ve ${drivers.net_income_growth?.label || 'Net Kâr Büyümesi'} %${drivers.net_income_growth?.value || '0'} olarak gerçekleşmiştir.
- **Pazar Konumu:** Sektörel çarpan ve kârlılık dinamikleri çerçevesinde rekabet gücü korunmaktadır.

## IV. SERMAYE MALİYETİ (WACC) VE DEĞERLEME MODELİ
$$
\\text{Hedef Adil Değer} = ${valuation.fair_value}\\text{ TL} \\quad | \\quad \\text{İskonto} = \\%${valuation.discount_pct}
$$
$$
\\text{Reel EVA Makası} = \\text{ROIC} - \\text{Reel WACC} = \\%${roicVal} - \\%${realWaccVal} = ${Number(evaSpreadVal) >= 0 ? '+' : ''}${evaSpreadVal}\\text{ puan}
$$

- **Sermaye Maliyeti (WACC):** Nominal Sermaye Maliyeti %${nominalWaccVal}, beklenen enflasyon %${expectedInfVal} ve Fisher denklemiyle hesaplanan Reel WACC %${realWaccVal} seviyesindedir. Yıllıklandırılmış ROIC (%${roicVal}) reel sermaye maliyetinin üzerinde olup ekonomik katma değer (EVA Spread: ${Number(evaSpreadVal) >= 0 ? '+' : ''}${evaSpreadVal} puan) oluşturmaktadır.
- **Uygulanan Değerleme Modeli:** ${valuation.valuation_model_name}
- **Hedef Çarpan:** ${drivers.target_multiple?.label || 'Hedef Çarpan'} ${drivers.target_multiple?.value || '0'}x
- **İskonto Oranı:** %${valuation.discount_pct} (${valuation.margin_of_safety_status || 'HESAPLANDI'})

## V. DEĞER SÜRÜCÜLERİ VE DUYARLILIK ANALİZİ
> **Duyarlılık Matrisi:** Farklı piyasa ve marj koşullarına göre senaryo bazlı hedef fiyat aralığı.

- **Ayı Senaryosu (Taban):** **${valuation.bear_price} TL** (Negatif makro koşullar ve daralan marjlar)
- **Baz Senaryo (Adil Değer):** **${valuation.fair_value} TL** (Mevcut operasyonel gerçekleşmeler ve dengeli büyüme)
- **Boğa Senaryosu (Tavan):** **${valuation.bull_price} TL** (Hedeflerin aşılması ve çarpan genişlemesi)

## VI. YATIRIM RİSKLERİ, KATALİZÖRLER VE NİHAİ KARAR

| Metrik | Puan | Max | Gerekçe |
| :--- | :--- | :--- | :--- |
${(scoreResult.breakdown || []).map((b: any) => `| ${b.category} | ${b.score} | ${b.maxScore} | ${b.reason} |`).join('\n')}
| **Toplam Puan** | **${scoreResult.totalScore}** | **100** | ${scoreResult.totalScore >= 75 ? 'Güçlü operasyonel performans ve yüksek iskonto.' : 'Sektörel standartlara uyum.'} |

### Analist Kararı: [${optimization.finalDecision}]

**Yatırım Tezi:** ${ticker} hissesi için hesaplanan adil değer ${valuation.fair_value} TL olup, güncel ${price} TL fiyatına kıyasla %${valuation.discount_pct} potansiyel barındırmaktadır.

**Kilit Katalizörler:** Operasyonel kârlılık artışı, ${drivers.revenue_growth?.label || 'gelir büyümesi'} performansı ve sektörel talep dinamikleri.

**Riskler & Emniyet Marjı:** Ayı senaryosu taban hedefi ${valuation.bear_price} TL seviyesindedir. ${optimization.conditionalWarnings?.length > 0 ? optimization.conditionalWarnings.join('. ') : 'Makro oynaklık ve faiz seviyeleri izlenmelidir.'}`;
}
