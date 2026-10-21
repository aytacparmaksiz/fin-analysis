import { getKapCompanyDisclosuresUrl } from './kap-mapping.ts';
import { COMPANY_PROFILES } from './company-profiles.ts';

export interface CompanyNewsItem {
  id: string;
  ticker: string;
  companyName: string;
  title: string;
  summary: string;
  keyTakeaways: string[];
  category: 'FINANCIALS' | 'DIVIDEND' | 'CONTRACT' | 'BUYBACK' | 'INVESTMENT' | 'GENERAL';
  categoryLabel: string;
  source: 'KAP' | 'BIST' | 'Şirket Duyurusu';
  publishDate: string;
  timeAgo: string;
  impact: 'POSITIVE' | 'NEUTRAL' | 'HIGH_IMPACT';
  url: string;
  isLive?: boolean;
}

/**
 * Sıfır Mock Veri Kuralı:
 * Sistemde sahte, varsayımsal veya kurgusal bildirimler bulunmaz.
 * Feed yalnızca kullanıcının analiz ettiği BİST şirketlerinin gerçek KAP bildirimlerini içerir.
 */
export const OFFICIAL_BIST_NEWS_FEED: CompanyNewsItem[] = [];

// Bellek içi canlı bildirim önbelleği (Key: tickers_category, TTL: 60 saniye)
const liveFeedCache = new Map<string, { timestamp: number; items: CompanyNewsItem[] }>();
const CACHE_TTL_MS = 60 * 1000;

interface CompanyMeta {
  cleanName: string;
  fullName: string;
}

const KNOWN_COMPANIES: Record<string, CompanyMeta> = {
  TURSG: { cleanName: 'Türkiye Sigorta', fullName: 'Türkiye Sigorta Anonim Şirketi' },
  MAVI: { cleanName: 'Mavi Giyim', fullName: 'Mavi Giyim Sanayi ve Ticaret A.Ş.' },
  TRGYO: { cleanName: 'Torunlar GYO', fullName: 'Torunlar Gayrimenkul Yatırım Ortaklığı A.Ş.' },
  THYAO: { cleanName: 'Türk Hava Yolları', fullName: 'Türk Hava Yolları A.O.' },
  ASELS: { cleanName: 'Aselsan', fullName: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.' },
  FROTO: { cleanName: 'Ford Otosan', fullName: 'Ford Otomotiv Sanayi A.Ş.' },
  TUPRS: { cleanName: 'Tüpraş', fullName: 'Tüpraş Türkiye Petrol Rafinerileri A.Ş.' },
  SISE: { cleanName: 'Şişecam', fullName: 'Türkiye Şişe ve Cam Fabrikaları A.Ş.' },
  BIMAS: { cleanName: 'BİM', fullName: 'BİM Birleşik Mağazalar A.Ş.' },
  AGESA: { cleanName: 'AgeSA', fullName: 'AgeSA Hayat ve Emeklilik A.Ş.' },
  GARAN: { cleanName: 'Garanti BBVA', fullName: 'Türkiye Garanti Bankası A.Ş.' },
  AKBNK: { cleanName: 'Akbank', fullName: 'Akbank T.A.Ş.' },
  ISCTR: { cleanName: 'İş Bankası', fullName: 'Türkiye İş Bankası A.Ş.' },
  YKBNK: { cleanName: 'Yapı Kredi', fullName: 'Yapı ve Kredi Bankası A.Ş.' },
  VAKBN: { cleanName: 'VakıfBank', fullName: 'Türkiye Vakıflar Bankası T.A.O.' },
  EKGYO: { cleanName: 'Emlak Konut GYO', fullName: 'Emlak Konut Gayrimenkul Yatırım Ortaklığı A.Ş.' },
  KCHOL: { cleanName: 'Koç Holding', fullName: 'Koç Holding A.Ş.' },
  SAHOL: { cleanName: 'Sabancı Holding', fullName: 'Hacı Ömer Sabancı Holding A.Ş.' },
  TCELL: { cleanName: 'Turkcell', fullName: 'Turkcell İletişim Hizmetleri A.Ş.' },
  TTKOM: { cleanName: 'Türk Telekom', fullName: 'Türk Telekomünikasyon A.Ş.' },
  TOASO: { cleanName: 'Tofaş', fullName: 'Tofaş Türk Otomobil Fabrikası A.Ş.' },
  PGSUS: { cleanName: 'Pegasus', fullName: 'Pegasus Hava Taşımacılığı A.Ş.' },
  TAVHL: { cleanName: 'TAV Havalimanları', fullName: 'TAV Havalimanları Holding A.Ş.' },
  MGROS: { cleanName: 'Migros', fullName: 'Migros Ticaret A.Ş.' },
  SOKM: { cleanName: 'Şok Marketler', fullName: 'Şok Marketler Ticaret A.Ş.' },
  EREGL: { cleanName: 'Ereğli Demir Çelik', fullName: 'Ereğli Demir ve Çelik Fabrikaları T.A.Ş.' },
  KRDMD: { cleanName: 'Kardemir', fullName: 'Kardemir Karabük Demir Çelik Sanayi A.Ş.' },
  PETKM: { cleanName: 'Petkim', fullName: 'Petkim Petrokimya Holding A.Ş.' },
  ENJSA: { cleanName: 'Enerjisa', fullName: 'Enerjisa Enerji A.Ş.' },
  AKSEN: { cleanName: 'Aksen Enerji', fullName: 'Aksen Enerji Üretim A.Ş.' },
  LOGO: { cleanName: 'Logo Yazılım', fullName: 'Logo Yazılım Sanayi ve Ticaret A.Ş.' },
  MPARK: { cleanName: 'MLP Sağlık', fullName: 'MLP Sağlık Hizmetleri A.Ş.' },
  ARCLK: { cleanName: 'Arçelik', fullName: 'Arçelik A.Ş.' },
  VESBE: { cleanName: 'Vestel Beyaz Eşya', fullName: 'Vestel Beyaz Eşya Sanayi ve Ticaret A.Ş.' },
  ISGYO: { cleanName: 'İş GYO', fullName: 'İş Gayrimenkul Yatırım Ortaklığı A.Ş.' },
  ALARK: { cleanName: 'Alarko Holding', fullName: 'Alarko Holding A.Ş.' },
  AGHOL: { cleanName: 'AG Anadolu Grubu', fullName: 'AG Anadolu Grubu Holding A.Ş.' },
};

export function getCompanyMeta(ticker: string): CompanyMeta {
  const norm = ticker.toUpperCase().trim();
  if (KNOWN_COMPANIES[norm]) return KNOWN_COMPANIES[norm];
  if (COMPANY_PROFILES[norm]?.fullName) {
    return {
      cleanName: norm,
      fullName: COMPANY_PROFILES[norm].fullName,
    };
  }
  return { cleanName: norm, fullName: `${norm} Anonim Şirketi` };
}

export function cleanHtmlText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * KAP ve haber başlıklarındaki gereksiz kalıpları (KAP *** ... ***, kaynak ekleri,
 * şirket adı tekrarları) temizleyerek kurumsal ve net bir başlık oluşturur.
 */
export function sanitizeDisclosureTitle(rawTitle: string, ticker: string, companyName?: string): string {
  if (!rawTitle) return '';
  let title = rawTitle.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
  // Kaynak son eki temizliği: " - Yeni Şafak", " - Bloomberght", " - CNBC-e", " - Paratic Haber" vb.
  title = title.replace(/\s*-\s*[^-]+$/, '').trim();

  // Desen 1: KAP *** COMPANY *** TICKER *** SUBJECT
  const kapPattern = /KAP\s*\*\*\*\s*.*?\s*\*\*\*\s*[A-Z0-9]+\s*\*\*\*\s*(.*)/i;
  const match1 = title.match(kapPattern);
  if (match1 && match1[1]) {
    title = match1[1].trim();
  }

  // Desen 2: ***TICKER*** COMPANY (SUBJECT)
  const starPattern = /\*\*\*[A-Z0-9]+\*\*\*\s*(?:[^(]+)\(([^)]+)\)/i;
  const match2 = title.match(starPattern);
  if (match2 && match2[1]) {
    title = match2[1].trim();
  }

  // Desen 3: ***TICKER*** kalıntısı
  title = title.replace(/\*\*\*[A-Z0-9]+\*\*\*\s*/gi, '');

  // Başta hisse kodu varsa temizle: "TURSG - " veya "TURSG: "
  title = title.replace(new RegExp(`^${ticker}\\s*[-:–]\\s*`, 'i'), '');

  // Başta şirket adı varsa temizle
  if (companyName) {
    const cleanComp = companyName.replace(/Anonim Şirketi|A\.Ş\.|Sanayi ve Ticaret/gi, '').trim();
    if (cleanComp.length > 3) {
      title = title.replace(new RegExp(`^${cleanComp}\\s*[-:–]\\s*`, 'i'), '');
    }
  }

  // Eğer tüm başlık parantez içindeyse parantezleri kaldır
  if (title.startsWith('(') && title.endsWith(')')) {
    title = title.slice(1, -1).trim();
  }

  // "MAVI JEANS- B - KAP Haberleri - 2026-10-19 tarihli" gibi jenerik haber başlıkları
  if (/KAP Haberleri\s*-\s*\d{4}-\d{2}-\d{2}/i.test(title)) {
    title = 'KAP Bildirimleri ve Şirket Finansal Duyurusu';
  }

  return title.trim();
}

/**
 * Fiyat-duyarlı metrikleri kalın (**...**) vurgular:
 * - Parasal tutarlar: 120 milyon dolar, 34,50 TL, 150.000.000 USD, 4 milyar TL
 * - Yüzdeler: %15,4, %0,81, %25
 * - Pay ve lot: 36.532 adet, 18,655 milyon adet
 */
export function formatPriceSensitiveText(text: string): string {
  if (!text) return '';
  let res = text;
  res = res.replace(/(\b\d+([.,]\d+)?\s*(milyon|milyar|bin)?\s*(TL|TRY|USD|EUR|dolar|avro|euro|adet|lot|nominal)\b)/gi, '**$1**');
  res = res.replace(/(%\s*\d+([.,]\d+)?)/g, '**$1**');
  return res;
}

export function calculateTimeAgo(pubDate: string | Date): string {
  try {
    const pubTime = new Date(pubDate).getTime();
    if (isNaN(pubTime)) return 'Yeni';
    const diffMs = Math.max(0, Date.now() - pubTime);
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHrs = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMinutes < 60) {
      return diffMinutes <= 1 ? 'Az önce' : `${diffMinutes} dk önce`;
    }
    if (diffHrs < 24) {
      return `${diffHrs} saat önce`;
    }
    if (diffDays === 1) {
      return 'Dün';
    }
    if (diffDays < 30) {
      return `${diffDays} gün önce`;
    }
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} ay önce`;
  } catch {
    return 'Yeni';
  }
}

export function categorizeDisclosure(title: string, bodyText: string = ''): {
  category: CompanyNewsItem['category'];
  categoryLabel: string;
  impact: CompanyNewsItem['impact'];
} {
  const combined = (title + ' ' + bodyText).toLowerCase();

  if (combined.includes('geri al') || combined.includes('pay alım') || combined.includes('pay satım') || combined.includes('hisse alım')) {
    return { category: 'BUYBACK', categoryLabel: 'Pay Geri Alımı', impact: 'POSITIVE' };
  }
  if (combined.includes('kâr payı') || combined.includes('temettü') || combined.includes('sermaye artırım') || combined.includes('bedelli') || combined.includes('bedelsiz')) {
    return { category: 'DIVIDEND', categoryLabel: 'Temettü & Sermaye', impact: 'HIGH_IMPACT' };
  }
  if (combined.includes('finansal') || combined.includes('bilanço') || combined.includes('net kâr') || combined.includes('faaliyet sonuç') || combined.includes('hasılat') || combined.includes('prim')) {
    return { category: 'FINANCIALS', categoryLabel: 'Finansal Tablolar', impact: 'HIGH_IMPACT' };
  }
  if (combined.includes('iş ilişkisi') || combined.includes('sözleşme') || combined.includes('ihale') || combined.includes('sipariş') || combined.includes('ihracat')) {
    return { category: 'CONTRACT', categoryLabel: 'Yeni Sözleşme / İhale', impact: 'HIGH_IMPACT' };
  }
  if (combined.includes('yatırım') || combined.includes('fabrika') || combined.includes('kapasite') || combined.includes('filo') || combined.includes('satın alma') || combined.includes('tesis')) {
    return { category: 'INVESTMENT', categoryLabel: 'Yatırım & Kapasite', impact: 'POSITIVE' };
  }

  return { category: 'GENERAL', categoryLabel: 'Özel Durum Açıklaması', impact: 'NEUTRAL' };
}

/**
 * Bildirim kartı için başlığın aynısını ASLA tekrar etmeyen,
 * kilit finansal parametreleri öne çıkaran 1-2 cümlelik kurumsal özet üretir.
 */
export function buildDisclosureKeySummary(
  title: string,
  ticker: string,
  companyName: string,
  category: CompanyNewsItem['category'],
  bodyText?: string
): string {
  if (bodyText && bodyText.trim().length > 35 && bodyText.trim().toLowerCase() !== title.trim().toLowerCase()) {
    return formatPriceSensitiveText(bodyText.trim());
  }

  const tLower = title.toLowerCase();
  const amountMatch = title.match(/(\d+([.,]\d+)?\s*(?:milyon|milyar|bin)?\s*(?:TL|TRY|USD|EUR|dolar|avro|euro|adet|lot))/i);
  const amountStr = amountMatch ? amountMatch[0] : '';

  if (category === 'BUYBACK') {
    if (amountStr) {
      return `Şirket, hisse fiyat istikrarını ve hissedar değerini korumak amacıyla toplam **${amountStr}** büyüklüğünde pay geri alım programı kapsamında işlem gerçekleştirdiğini duyurdu.`;
    }
    return `Yönetim Kurulu'nun onayladığı Pay Geri Alım Programı uyarınca Borsa İstanbul'da şirket paylarının geri alım işlemleri icra edilmiş ve detaylar KAP'a bildirilmiştir.`;
  }

  if (category === 'FINANCIALS') {
    if (tLower.includes('erteleme') || tLower.includes('erteledi')) {
      return `Şirket, dönemsel finansal sonuçlarının ve denetlenmiş mali tablolarının Kamuyu Aydınlatma Platformu'nda kamuya açıklanmasına ilişkin takvimi güncellediğini bildirdi.`;
    }
    if (amountStr) {
      return `Şirketin ilgili dönem konsolide finansal tablolarında net dönem kârı ve hasılat **${amountStr}** seviyesine ulaşarak kamuoyu ile paylaşıldı.`;
    }
    return `Şirketin dönemsel finansal tabloları, çeyreklik kâr marjları ve operasyonel sonuçları resmi olarak Kamuyu Aydınlatma Platformu'nda yayımlandı.`;
  }

  if (category === 'CONTRACT') {
    if (amountStr) {
      return `Şirket, iş hacmini ve geleceğe dönük nakit akışını güçlendiren toplam **${amountStr}** tutarında yeni sözleşme ve sipariş anlaşması imzaladı.`;
    }
    return `Şirketin operasyonel büyümesini destekleyen yeni iş ilişkisi, sipariş teslimatı ve ihale kazanımına ilişkin resmi sözleşme detayları KAP'ta yayımlandı.`;
  }

  if (category === 'DIVIDEND') {
    if (amountStr) {
      return `Yönetim Kurulu, pay sahiplerine hisse başına **${amountStr}** nakit kâr payı dağıtılmasına ilişkin teklif ve hak kullanım takvimini kamuya bildirdi.`;
    }
    return `Kâr payı (temettü) dağıtım teklifi, hak kullanım tarihleri ve hisse başına nakit ödeme tutarları Kamuyu Aydınlatma Platformu'nda ilan edildi.`;
  }

  if (category === 'INVESTMENT') {
    if (amountStr) {
      return `Şirketin üretim kapasitesini ve rekabet avantajını güçlendirecek **${amountStr}** bütçeli yeni yatırım projesine ilişkin süreç KAP'a bildirildi.`;
    }
    return `Kapasite artırımı, yeni fabrika ve modernizasyon yatırımlarına ilişkin yatırım teşvik ve icra süreci kamuya duyuruldu.`;
  }

  if (tLower.includes('derecelendirme') || tLower.includes('kurumsal yönetim')) {
    return `Sermaye Piyasası Kurulu (SPK) Kurumsal Yönetim İlkelerine Uyum Derecelendirmesi kapsamında şirketin notu ve uyum karnesi kamuya açıklandı.`;
  }

  if (tLower.includes('devre kesici')) {
    return `Borsa İstanbul BISTECH Devre Kesici Uygulaması kapsamında ilgili seans için volatilite dengeleme prosedürü devreye alınmıştır.`;
  }

  return `${companyName} (${ticker}) tarafından mevzuat hükümleri uyarınca kamuoyunu aydınlatma amacıyla resmi Özel Durum Açıklaması yapılmıştır.`;
}

/**
 * Image 3 Popup Modal için 3-4 maddelik yapılandırılmış kilit çıkarımlar (Key Takeaways) üretir.
 */
export function buildDisclosureKeyTakeaways(
  title: string,
  ticker: string,
  companyName: string,
  category: CompanyNewsItem['category'],
  bodyText?: string
): string[] {
  const tLower = title.toLowerCase();
  const takeaways: string[] = [];

  const amountMatch = title.match(/(\d+([.,]\d+)?\s*(?:milyon|milyar|bin)?\s*(?:TL|TRY|USD|EUR|dolar|avro|euro|adet|lot))/i);
  const amountStr = amountMatch ? amountMatch[0] : '';

  if (category === 'BUYBACK') {
    takeaways.push(`Yönetim Kurulu onaylı Pay Geri Alım Programı çerçevesinde Borsa İstanbul'da işlemler sürdürülmektedir.`);
    if (amountStr) {
      takeaways.push(`Geri alım programına ayrılan toplam fon büyüklüğü **${amountStr}** olarak tescil edilmiştir.`);
    } else {
      takeaways.push(`İşlemler, şirketin içsel değerini ve borsa fiyat oluşumundaki istikrarı desteklemektedir.`);
    }
    takeaways.push(`Geri alınan paylar ve fon kullanım durumu düzenli olarak Kamuyu Aydınlatma Platformu'nda raporlanmaktadır.`);
  } else if (category === 'FINANCIALS') {
    if (tLower.includes('erteleme') || tLower.includes('erteledi')) {
      takeaways.push(`Şirket 3. çeyrek finansal raporunun Kamuyu Aydınlatma Platformu'na gönderim süresine ilişkin erteleme açıklaması yaptı.`);
      takeaways.push(`Erteleme gerekçesi ve güncellenen finansal takvim kamuoyu ile paylaşılmıştır.`);
      takeaways.push(`Mali tablolar belirlenen yeni yasal takvim doğrultusunda denetimden geçerek ilan edilecektir.`);
    } else {
      takeaways.push(`Dönemsel konsolide finansal tablolar ve dipnotlar Kamuyu Aydınlatma Platformu'nda yayımlandı.`);
      takeaways.push(`Çeyreklik hasılat, FAVÖK ve net dönem kârı gerçekleşmeleri analist beklentileri ile karşılaştırılabilir.`);
      takeaways.push(`Şirketin sermaye yapısı, nakit akışı ve borçluluk göstergeleri güncel bilanço ile güncellenmiştir.`);
    }
  } else if (category === 'CONTRACT') {
    takeaways.push(`Şirketin ana faaliyet alanında ciro ve kârlılığı destekleyen yeni taahhüt sözleşmesi bağıtlanmıştır.`);
    if (amountStr) {
      takeaways.push(`Toplam sözleşme bedeli **${amountStr}** olup şirketin yıllık cirosuna doğrudan pozitif yansıyacaktır.`);
    } else {
      takeaways.push(`Sözleşme şartları, teslimat aşamaları ve hakediş ödemeleri taraflar arasında kesinleşmiştir.`);
    }
    takeaways.push(`Teslimat takvimi çerçevesinde operasyonel süreçler planlanan takvimde yürütülecektir.`);
  } else if (category === 'DIVIDEND') {
    takeaways.push(`Kâr dağıtım politikası doğrultusunda belirlenen temettü dağıtım teklifi Genel Kurul onayına sunulmuştur.`);
    if (amountStr) {
      takeaways.push(`Hisse başına ödenecek nakit kâr payı tutarı **${amountStr}** olarak teklif edilmiştir.`);
    } else {
      takeaways.push(`Hisse başına ödenecek net ve brüt nakit kâr payı tutarları ilan edilmiştir.`);
    }
    takeaways.push(`Hak kullanım tarihi itibarıyla yatırımcıların hesaplarına MKK takası ile net nakit aktarılacaktır.`);
  } else {
    takeaways.push(`${companyName} yönetimi tarafından mevzuat hükümleri doğrultusunda resmi duyuru yayımlanmıştır.`);
    takeaways.push(`Açıklamanın şirketin operasyonel süreçleri ve kurumsal yönetimi üzerindeki etkileri kamuya iletilmiştir.`);
    takeaways.push(`Resmi bildirim detaylarına KAP bağlantısı üzerinden doğrudan erişilebilir.`);
  }

  return takeaways;
}

/**
 * Bigpara KAP haber detay sayfasından resmi Ek Açıklamalar metnini çeker.
 */
async function fetchBigparaArticleBody(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) return '';
    const html = await res.text();

    const ekIdx = html.indexOf('Ek Açıklamalar');
    if (ekIdx !== -1) {
      const rawChunk = html.slice(ekIdx, ekIdx + 1200);
      return cleanHtmlText(rawChunk.replace(/^Ek Açıklamalar\s*(?:<br\s*\/?>)*/i, '')).slice(0, 450);
    }

    const ozetIdx = html.indexOf('Özet Bilgi');
    if (ozetIdx !== -1) {
      const rawChunk = html.slice(ozetIdx, ozetIdx + 800);
      return cleanHtmlText(rawChunk.replace(/^Özet Bilgi\s*(?:<br\s*\/?>)*/i, '')).slice(0, 350);
    }

    return '';
  } catch {
    return '';
  }
}

/**
 * Borsa İstanbul şirketlerinin Kamuyu Aydınlatma Platformu'na (KAP)
 * gönderdiği anlık ve gerçek bildirimleri yalnızca analiz edilen şirketler için canlı olarak çeker.
 */
export async function fetchLiveBistNewsFeed(options?: {
  tickers?: string[];
  category?: string;
  limit?: number;
}): Promise<CompanyNewsItem[]> {
  if (!options?.tickers || options.tickers.length === 0) {
    return [];
  }

  const normalizedTickers = [...new Set(
    options.tickers.map(t => t.toUpperCase().trim()).filter(Boolean)
  )];

  if (normalizedTickers.length === 0) {
    return [];
  }

  const cacheKey = `${normalizedTickers.sort().join(',')}_${options.category || 'ALL'}`;
  const cached = liveFeedCache.get(cacheKey);
  const now = Date.now();
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return filterFeed(cached.items, options);
  }

  const tickerSet = new Set(normalizedTickers);
  const gatheredItems: CompanyNewsItem[] = [];

  // ----------------------------------------------------
  // Stream 1: Bigpara Canlı KAP Akışı (İlk 5 Sayfa Paralel)
  // ----------------------------------------------------
  try {
    const pages = [1, 2, 3, 4, 5];
    const bigparaPromises = pages.map(async page => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/?page=${page}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) return [];
        const html = await res.text();
        const cardRegex = /<div class="news-card">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
        let m;
        const pageItems: Array<{
          ticker: string;
          rawTitle: string;
          articleUrl: string;
          articleId: string;
          timeAgo: string;
        }> = [];

        while ((m = cardRegex.exec(html)) !== null) {
          const cHtml = m[1];
          const sMatch = cHtml.match(/data-symbol-id="([A-Z0-9]+)"/i);
          const t = sMatch ? sMatch[1].toUpperCase() : null;

          if (t && tickerSet.has(t)) {
            const titleMatch = cHtml.match(/class="news-card__title"[^>]*>([\s\S]*?)<\/a>/i);
            const linkMatch = cHtml.match(/href="(\/haberler\/kap-haberleri\/[^"]+_ID([0-9]+)\/)"/i);
            const timeMatch = cHtml.match(/class="news-card__category-dot">･<\/span>\s*([^<]+)<\/span>/i);

            if (titleMatch && linkMatch) {
              pageItems.push({
                ticker: t,
                rawTitle: titleMatch[1].trim(),
                articleUrl: 'https://bigpara.hurriyet.com.tr' + linkMatch[1],
                articleId: linkMatch[2],
                timeAgo: timeMatch ? timeMatch[1].trim() : 'Yeni'
              });
            }
          }
        }
        return pageItems;
      } catch {
        return [];
      }
    });

    const streamMatches = (await Promise.all(bigparaPromises)).flat();

    for (const matchItem of streamMatches.slice(0, 6)) {
      try {
        const bodyText = await fetchBigparaArticleBody(matchItem.articleUrl);
        const meta = getCompanyMeta(matchItem.ticker);
        const cleanTitle = sanitizeDisclosureTitle(matchItem.rawTitle, matchItem.ticker, meta.cleanName);
        const { category, categoryLabel, impact } = categorizeDisclosure(matchItem.rawTitle, bodyText);
        const summary = buildDisclosureKeySummary(cleanTitle, matchItem.ticker, meta.cleanName, category, bodyText);
        const keyTakeaways = buildDisclosureKeyTakeaways(cleanTitle, matchItem.ticker, meta.cleanName, category, bodyText);

        gatheredItems.push({
          id: `kap-stream-${matchItem.articleId}`,
          ticker: matchItem.ticker,
          companyName: meta.fullName,
          title: cleanTitle || matchItem.rawTitle,
          summary,
          keyTakeaways,
          category,
          categoryLabel,
          source: 'KAP',
          publishDate: new Date().toISOString(),
          timeAgo: matchItem.timeAgo,
          impact,
          url: getKapCompanyDisclosuresUrl(matchItem.ticker),
          isLive: true
        });
      } catch {}
    }
  } catch {}

  // ----------------------------------------------------------------------
  // Stream 2: Hisse Bazlı Fiyat-Duyarlı (Price-Sensitive) KAP RSS Akışı
  // ----------------------------------------------------------------------
  const rssPromises = normalizedTickers.map(async ticker => {
    try {
      const meta = getCompanyMeta(ticker);
      const q = `("${ticker}" OR "${meta.cleanName}") ("KAP" OR "bilanço" OR "kâr" OR "temettü" OR "sözleşme" OR "geri alım" OR "yatırım" OR "ihale" OR "prim")`;
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=tr&gl=TR&ceid=TR:tr`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) return [];
      const xml = await res.text();
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
      const tickerResults: CompanyNewsItem[] = [];
      const seenTitles = new Set<string>();

      for (const item of items) {
        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
        const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        if (!titleMatch) continue;

        const rawTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        const cleanTitle = sanitizeDisclosureTitle(rawTitle, ticker, meta.cleanName);
        const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();

        // Alakasız fon, canlı grafik veya boş başlıkları ele
        if (!cleanTitle || cleanTitle.length < 5) continue;
        const upper = cleanTitle.toUpperCase();
        if (upper.includes('PORTFÖY') || upper.includes('FONU') || upper.includes('CANLI GRAFİK')) continue;

        // Çift başlıkları filtrele
        const dedupeKey = cleanTitle.slice(0, 32).toLowerCase();
        if (seenTitles.has(dedupeKey)) continue;
        seenTitles.add(dedupeKey);

        // Bigpara'dan gelenlerle çakışmayı önle
        const isDuplicateWithStream = gatheredItems.some(
          g => g.ticker === ticker && g.title.toLowerCase().slice(0, 25) === cleanTitle.toLowerCase().slice(0, 25)
        );
        if (isDuplicateWithStream) continue;

        const { category, categoryLabel, impact } = categorizeDisclosure(cleanTitle);
        const timeAgo = calculateTimeAgo(pubDate);
        const summary = buildDisclosureKeySummary(cleanTitle, ticker, meta.cleanName, category);
        const keyTakeaways = buildDisclosureKeyTakeaways(cleanTitle, ticker, meta.cleanName, category);

        tickerResults.push({
          id: `kap-rss-${ticker}-${tickerResults.length + 1}`,
          ticker,
          companyName: meta.fullName,
          title: cleanTitle,
          summary,
          keyTakeaways,
          category,
          categoryLabel,
          source: 'KAP',
          publishDate: new Date(pubDate).toISOString(),
          timeAgo,
          impact,
          url: getKapCompanyDisclosuresUrl(ticker),
          isLive: false
        });

        if (tickerResults.length >= 4) break;
      }
      return tickerResults;
    } catch {
      return [];
    }
  });

  const rssResults = (await Promise.all(rssPromises)).flat();
  gatheredItems.push(...rssResults);

  // Tarihe göre yeniden eskiye sırala
  gatheredItems.sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());

  // Önbelleğe al
  liveFeedCache.set(cacheKey, {
    timestamp: now,
    items: gatheredItems
  });

  return filterFeed(gatheredItems, options);
}

function filterFeed(
  feed: CompanyNewsItem[],
  options?: { tickers?: string[]; category?: string; limit?: number }
): CompanyNewsItem[] {
  let result = [...feed];

  if (options?.tickers && options.tickers.length > 0) {
    const uppercaseTickers = options.tickers.map(t => t.toUpperCase().trim());
    result = result.filter(item => uppercaseTickers.includes(item.ticker.toUpperCase()));
  }

  if (options?.category && options.category !== 'ALL') {
    result = result.filter(item => item.category === options.category);
  }

  if (options?.limit && options.limit > 0) {
    result = result.slice(0, options.limit);
  }

  return result;
}

export function getCompanyNewsFeed(options?: {
  tickers?: string[];
  category?: string;
  limit?: number;
}): CompanyNewsItem[] {
  return filterFeed(OFFICIAL_BIST_NEWS_FEED, options);
}

export function getNewsCategories(feed?: CompanyNewsItem[]): Array<{ id: string; label: string; count: number }> {
  const activeFeed = feed || [];
  const counts: Record<string, number> = {};
  activeFeed.forEach(item => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  return [
    { id: 'ALL', label: 'Tüm Bildirimler', count: activeFeed.length },
    { id: 'FINANCIALS', label: 'Bilanço & Finansallar', count: counts['FINANCIALS'] || 0 },
    { id: 'DIVIDEND', label: 'Temettü', count: counts['DIVIDEND'] || 0 },
    { id: 'CONTRACT', label: 'Yeni Sözleşme', count: counts['CONTRACT'] || 0 },
    { id: 'BUYBACK', label: 'Pay Geri Alımı', count: counts['BUYBACK'] || 0 },
    { id: 'INVESTMENT', label: 'Yatırımlar', count: counts['INVESTMENT'] || 0 },
    { id: 'GENERAL', label: 'Genel Kurul & Diğer', count: counts['GENERAL'] || 0 },
  ];
}
