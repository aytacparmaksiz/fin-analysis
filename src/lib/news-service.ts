import { getKapCompanyDisclosuresUrl } from './kap-mapping.ts';
import { COMPANY_PROFILES } from './company-profiles.ts';

export interface CompanyNewsItem {
  id: string;
  ticker: string;
  companyName: string;
  title: string;
  summary: string;
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
 * Sistemde sahte, varsayımsal veya hardcoded bildirimler bulunmaz.
 * Feed yalnızca kullanıcının analiz ettiği BİST şirketlerinin gerçek KAP bildirimlerini içerir.
 */
export const OFFICIAL_BIST_NEWS_FEED: CompanyNewsItem[] = [];

// Bellek içi canlı bildirim önbelleği (Key: tickers_category, TTL: 60 saniye)
const liveFeedCache = new Map<string, { timestamp: number; items: CompanyNewsItem[] }>();
const CACHE_TTL_MS = 60 * 1000;

const KNOWN_COMPANY_NAMES: Record<string, string> = {
  THYAO: 'Türk Hava Yolları A.O.',
  ASELS: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.',
  FROTO: 'Ford Otomotiv Sanayi A.Ş.',
  TUPRS: 'Tüpraş Türkiye Petrol Rafinerileri A.Ş.',
  SISE: 'Türkiye Şişe ve Cam Fabrikaları A.Ş.',
  BIMAS: 'BİM Birleşik Mağazalar A.Ş.',
  EREGL: 'Ereğli Demir ve Çelik Fabrikaları T.A.Ş.',
  AGESA: 'AgeSA Hayat ve Emeklilik A.Ş.',
  GARAN: 'Türkiye Garanti Bankası A.Ş.',
  AKBNK: 'Akbank T.A.Ş.',
  ISCTR: 'Türkiye İş Bankası A.Ş.',
  YKBNK: 'Yapı ve Kredi Bankası A.Ş.',
  VAKBN: 'Türkiye Vakıflar Bankası T.A.O.',
  EKGYO: 'Emlak Konut Gayrimenkul Yatırım Ortaklığı A.Ş.',
  KCHOL: 'Koç Holding A.Ş.',
  SAHOL: 'Hacı Ömer Sabancı Holding A.Ş.',
  LOGO: 'Logo Yazılım Sanayi ve Ticaret A.Ş.',
  MPARK: 'MLP Sağlık Hizmetleri A.Ş.',
  TCELL: 'Turkcell İletişim Hizmetleri A.Ş.',
  TTKOM: 'Türk Telekomünikasyon A.Ş.',
  TOASO: 'Tofaş Türk Otomobil Fabrikası A.Ş.',
  PGSUS: 'Pegasus Hava Taşımacılığı A.Ş.',
  TAVHL: 'TAV Havalimanları Holding A.Ş.',
  MGROS: 'Migros Ticaret A.Ş.',
  SOKM: 'Şok Marketler Ticaret A.Ş.',
  KRDMD: 'Kardemir Karabük Demir Çelik Sanayi ve Ticaret A.Ş.',
  KOZAL: 'Koza Altın İşletmeleri A.Ş.',
  PETKM: 'Petkim Petrokimya Holding A.Ş.',
  ENJSA: 'Enerjisa Enerji A.Ş.',
  AKSEN: 'Aksen Enerji Üretim A.Ş.',
  ARCLK: 'Arçelik A.Ş.',
  VESBE: 'Vestel Beyaz Eşya Sanayi ve Ticaret A.Ş.',
  TRGYO: 'Torunlar GYO A.Ş.',
  ISGYO: 'İş GYO A.Ş.',
  ALARK: 'Alarko Holding A.Ş.',
  AGHOL: 'AG Anadolu Grubu Holding A.Ş.'
};

export function getCompanyName(ticker: string): string {
  const norm = ticker.toUpperCase().trim();
  if (KNOWN_COMPANY_NAMES[norm]) return KNOWN_COMPANY_NAMES[norm];
  if (COMPANY_PROFILES[norm]?.fullName) return COMPANY_PROFILES[norm].fullName;
  return `${norm} Borsa İstanbul`;
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
 * Fiyat-duyarlı (price-sensitive) metrikleri kalın (**...**) vurgular:
 * - Parasal tutarlar: 120 milyon dolar, 34,50 TL, 150.000.000 USD, 2,4 milyar euro
 * - Oranlar: %15,4, %0,81, %25
 * - Pay ve lot: 36.532 adet, 3.469.200 nominal lot
 */
export function formatPriceSensitiveText(text: string): string {
  if (!text) return '';
  let res = text;
  // Parasal ve adet metrikleri
  res = res.replace(/(\b\d+([.,]\d+)?\s*(milyon|milyar|bin)?\s*(TL|TRY|USD|EUR|dolar|avro|euro|adet|lot|nominal)\b)/gi, '**$1**');
  // Yüzdeler
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
  if (combined.includes('finansal') || combined.includes('bilanço') || combined.includes('net kâr') || combined.includes('faaliyet sonuç') || combined.includes('hasılat')) {
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

    // 1. Ek Açıklamalar alanı (KAP resmi açıklama metni)
    const ekIdx = html.indexOf('Ek Açıklamalar');
    if (ekIdx !== -1) {
      const rawChunk = html.slice(ekIdx, ekIdx + 1200);
      return cleanHtmlText(rawChunk.replace(/^Ek Açıklamalar\s*(?:<br\s*\/?>)*/i, '')).slice(0, 450);
    }

    // 2. Özet Bilgi alanı
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
  // Analiz edilen şirket kodu yoksa asla mock veri dönme, boş dizi dön
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
        const timeoutId = setTimeout(() => controller.abort(), 4000);

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

    // Eşleşen bildirimlerin detay sayfalarından Ek Açıklamalar gövdesini çek
    for (const matchItem of streamMatches.slice(0, 6)) {
      try {
        const bodyText = await fetchBigparaArticleBody(matchItem.articleUrl);
        const cleanTitle = matchItem.rawTitle
          .replace(/\*\*\*([A-Z0-9]+)\*\*\*\s*/i, '')
          .replace(/\s*\([^\)]*\)\s*$/i, '')
          .trim();

        const { category, categoryLabel, impact } = categorizeDisclosure(matchItem.rawTitle, bodyText);
        const content = bodyText || cleanTitle;
        const highlightedSummary = formatPriceSensitiveText(content);

        gatheredItems.push({
          id: `kap-stream-${matchItem.articleId}`,
          ticker: matchItem.ticker,
          companyName: getCompanyName(matchItem.ticker),
          title: cleanTitle || matchItem.rawTitle,
          summary: highlightedSummary,
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
      const q = `${ticker} ("KAP" OR "Kamuyu Aydınlatma") ("sözleşme" OR "milyon" OR "milyar" OR "ihale" OR "temettü" OR "bilanço" OR "kâr" OR "yatırım" OR "geri alım" OR "hisse")`;
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

      for (const item of items) {
        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
        const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        if (!titleMatch) continue;

        const rawTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        const cleanTitle = rawTitle.replace(/\s*-\s*[^-]+$/, '').trim();
        const pubDate = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();

        if (!cleanTitle.toUpperCase().includes(ticker.toUpperCase())) continue;

        // Daha önce Bigpara akışından eklenmişse çift kayıt oluşturma
        const isDuplicate = gatheredItems.some(
          g => g.ticker === ticker && g.title.toLowerCase() === cleanTitle.toLowerCase()
        );
        if (isDuplicate) continue;

        const { category, categoryLabel, impact } = categorizeDisclosure(cleanTitle);
        const timeAgo = calculateTimeAgo(pubDate);
        const highlightedSummary = formatPriceSensitiveText(cleanTitle);

        tickerResults.push({
          id: `kap-rss-${ticker}-${tickerResults.length + 1}`,
          ticker,
          companyName: getCompanyName(ticker),
          title: cleanTitle,
          summary: highlightedSummary,
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
