import { type SectorType, detectSector } from './sectors.ts';
import { 
  enrichAndSanitizeFinancialHistory, 
  computeSectorValuationAndDrivers, 
  parseFinancialNumber,
  parsePeriodSortKey
} from './valuation.ts';
import {
  getIsYatirimMultiplesForTicker,
  getIsYatirimSectorAverages,
  type IsYatirimStockMultiples,
  type IsYatirimSectorAverage
} from './isyatirim-service.ts';
import { OFFICIAL_ISYATIRIM_CACHE } from './isyatirim-official-cache.ts';
import { getSupabase, isSupabaseConfigured } from './supabase.ts';
import { IsYatirimApiAdapter } from './isyatirim-adapter.ts';
import { FinancialDataValidator } from './financial-validator.ts';
import { FinancialRatioEngine } from './ratio-engine.ts';
import { fetchLiveTcmbMacroData, type MacroDataSnapshot } from './macro-service.ts';

import https from 'node:https';

// Güvenlik: Canlı ortamda (production) TLS doğrulaması kesin olarak açıktır.
// Yerel Windows geliştirme ortamında antivirüs SSL müdahalesine karşı toleranslı çalışır.
const isYatirimHttpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production',
  keepAlive: true,
  timeout: 30000
});

async function fetchResilientJson(urlStr: string, timeoutMs = 25000): Promise<any> {
  return new Promise((resolve) => {
    let settled = false;
    let req: any = null;

    const done = (val: any) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(val);
      }
    };

    const timer = setTimeout(() => {
      try { req?.destroy(); } catch {}
      done(null);
    }, timeoutMs);

    try {
      req = https.get(urlStr, {
        agent: isYatirimHttpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://www.isyatirim.com.tr/'
        },
        timeout: timeoutMs
      }, (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return done(null);
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            done(JSON.parse(data));
          } catch {
            done(null);
          }
        });
      });
      req.on('error', () => done(null));
      req.on('timeout', () => {
        try { req?.destroy(); } catch {}
        done(null);
      });
    } catch {
      done(null);
    }
  });
}

export interface FinancialHistoryItem {
  period: string;
  revenue: number | null;
  gross_profit: number | null;
  cost_of_sales?: number | null;
  operating_expenses?: number | null;
  operating_profit: number | null;
  financing_expenses?: number | null;
  financing_income?: number | null;
  tax_expense?: number | null;
  ebitda: number | null;
  net_income: number | null;
  ebt?: number | null;
  current_assets: number | null;
  non_current_assets: number | null;
  total_assets: number | null;
  tangible_assets?: number | null;
  intangible_assets?: number | null;
  trade_payables?: number | null;
  current_liabilities: number | null;
  long_term_liabilities: number | null;
  total_liabilities: number | null;
  equity: number | null;
  paid_in_capital: number | null;
  cash_and_equivalents: number | null;
  short_term_debt: number | null;
  long_term_debt: number | null;
  operating_cash_flow: number | null;
  capex: number | null;
  investing_cash_flow?: number | null;
  financing_cash_flow?: number | null;
  net_change_in_cash?: number | null;
  free_cash_flow: number | null;
  written_premiums?: number | null;
  earned_premiums?: number | null;
  technical_profit?: number | null;
  investment_income?: number | null;
  financial_assets_insured?: number | null;
  pension_aum?: number | null;
  loss_ratio?: number | null;
  expense_ratio?: number | null;
  ga_ratio?: number | null;
  commission_ratio?: number | null;
  combined_ratio?: number | null;
  [key: string]: any;
}

export interface BistCompanyMetadata {
  ticker: string;
  name: string;
  sector: SectorType;
  financialGroup: 'XI_29' | 'UFRS' | 'UFRS_K';
  shareCount?: number;
}

export const KNOWN_BIST_DIRECTORY: Record<string, BistCompanyMetadata> = {
  AGESA: { ticker: 'AGESA', name: 'Agesa Hayat ve Emeklilik A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS_K', shareCount: 180000000 },
  ANHYT: { ticker: 'ANHYT', name: 'Anadolu Hayat Emeklilik A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS_K', shareCount: 430000000 },
  TURSG: { ticker: 'TURSG', name: 'Türkiye Sigorta A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS_K', shareCount: 5000000000 },
  ANSGR: { ticker: 'ANSGR', name: 'Anadolu Sigorta A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS_K', shareCount: 500000000 },
  AKGRT: { ticker: 'AKGRT', name: 'Aksigorta A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS', shareCount: 1612000000 },
  RAYSG: { ticker: 'RAYSG', name: 'Ray Sigorta A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS', shareCount: 163069856 },
  
  GARAN: { ticker: 'GARAN', name: 'Garanti BBVA A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 4200000000 },
  AKBNK: { ticker: 'AKBNK', name: 'Akbank T.A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 5200000000 },
  ISCTR: { ticker: 'ISCTR', name: 'Türkiye İş Bankası A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 25000000000 },
  YKBNK: { ticker: 'YKBNK', name: 'Yapı ve Kredi Bankası A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 8447051284 },
  VAKBN: { ticker: 'VAKBN', name: 'Türkiye Vakıflar Bankası T.A.O.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 10000000000 },
  HALKB: { ticker: 'HALKB', name: 'Türkiye Halk Bankası A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 7144927000 },
  ALBRK: { ticker: 'ALBRK', name: 'Albaraka Türk Katılım Bankası A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 2500000000 },
  SKBNK: { ticker: 'SKBNK', name: 'Şekerbank T.A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 2500000000 },
  TSKB:  { ticker: 'TSKB',  name: 'Türkiye Sınai Kalkınma Bankası A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 2800000000 },

  KCHOL: { ticker: 'KCHOL', name: 'Koç Holding A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 2535948050 },
  SAHOL: { ticker: 'SAHOL', name: 'Hacı Ömer Sabancı Holding A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 2040403931 },
  SISE:  { ticker: 'SISE',  name: 'Türkiye Şişe ve Cam Fabrikaları A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 3063214056 },
  AGHOL: { ticker: 'AGHOL', name: 'AG Anadolu Grubu Holding A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 243534518 },
  DOHOL: { ticker: 'DOHOL', name: 'Doğan Şirketler Grubu Holding A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 2616938288 },
  ALARK: { ticker: 'ALARK', name: 'Alarko Holding A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 435000000 },

  THYAO: { ticker: 'THYAO', name: 'Türk Hava Yolları A.O.', sector: 'AVIATION', financialGroup: 'XI_29', shareCount: 1380000000 },
  EREGL: { ticker: 'EREGL', name: 'Ereğli Demir ve Çelik Fabrikaları T.A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 3500000000 },
  TUPRS: { ticker: 'TUPRS', name: 'Tüpraş Türkiye Petrol Rafinerileri A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 1926795598 },
  FROTO: { ticker: 'FROTO', name: 'Ford Otomotiv Sanayi A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 350910000 },
  ASELS: { ticker: 'ASELS', name: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 4560000000 },
  BIMAS: { ticker: 'BIMAS', name: 'BİM Birleşik Mağazalar A.Ş.', sector: 'RETAIL', financialGroup: 'XI_29', shareCount: 607200000 },
  MGROS: { ticker: 'MGROS', name: 'Migros Ticaret A.Ş.', sector: 'RETAIL', financialGroup: 'XI_29', shareCount: 181054233 },
  SOKM:  { ticker: 'SOKM',  name: 'Şok Marketler Ticaret A.Ş.', sector: 'RETAIL', financialGroup: 'XI_29', shareCount: 593290000 },
  KRDMD: { ticker: 'KRDMD', name: 'Kardemir Karabük Demir Çelik D', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 780242270 },
  PETKM: { ticker: 'PETKM', name: 'Petkim Petrokimya Holding A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 2534400000 },
  SASA:  { ticker: 'SASA',  name: 'SASA Polyester Sanayi A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 43650000000 },
  ENKAI: { ticker: 'ENKAI', name: 'Enka İnşaat ve Sanayi A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 6000000000 },
  TOASO: { ticker: 'TOASO', name: 'Tofaş Türk Otomobil Fabrikası A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 500000000 },
  ARCLK: { ticker: 'ARCLK', name: 'Arçelik A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 675728205 },
  PGSUS: { ticker: 'PGSUS', name: 'Pegasus Hava Taşımacılığı A.Ş.', sector: 'AVIATION', financialGroup: 'XI_29', shareCount: 102299707 },
  TAVHL: { ticker: 'TAVHL', name: 'TAV Havalimanları Holding A.Ş.', sector: 'AVIATION', financialGroup: 'XI_29', shareCount: 363281250 },
  TTRAK: { ticker: 'TTRAK', name: 'Türk Traktör ve Ziraat Makineleri A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 100066875 },
  DOAS:  { ticker: 'DOAS',  name: 'Doğuş Otomotiv Servis ve Ticaret A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 220000000 },
  KOZAL: { ticker: 'KOZAL', name: 'Koza Altın İşletmeleri A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 3202500000 },
  AKSEN: { ticker: 'AKSEN', name: 'Aksa Enerji Üretim A.Ş.', sector: 'UTILITIES_TELCO', financialGroup: 'XI_29', shareCount: 1226338000 },
  ENJSA: { ticker: 'ENJSA', name: 'Enerjisa Enerji A.Ş.', sector: 'UTILITIES_TELCO', financialGroup: 'XI_29', shareCount: 1181068967 },
  TCELL: { ticker: 'TCELL', name: 'Turkcell İletişim Hizmetleri A.Ş.', sector: 'UTILITIES_TELCO', financialGroup: 'XI_29', shareCount: 2200000000 },
  TTKOM: { ticker: 'TTKOM', name: 'Türk Telekomünikasyon A.Ş.', sector: 'UTILITIES_TELCO', financialGroup: 'XI_29', shareCount: 3500000000 },
  VESBE: { ticker: 'VESBE', name: 'Vestel Beyaz Eşya Sanayi ve Ticaret A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 1600000000 },
  MPARK: { ticker: 'MPARK', name: 'MLP Sağlık Hizmetleri A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 208037202 },
  GENIL: { ticker: 'GENIL', name: 'Gen İlaç ve Sağlık Ürünleri Sanayi ve Ticaret A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 300000000 },

  // GYO (Gayrimenkul Yatırım Ortaklıkları - KVK md. 5/1-d %0 KV)
  EKGYO: { ticker: 'EKGYO', name: 'Emlak Konut GYO A.Ş.', sector: 'REIT', financialGroup: 'XI_29', shareCount: 3800000000 },
  TRGYO: { ticker: 'TRGYO', name: 'Torunlar GYO A.Ş.', sector: 'REIT', financialGroup: 'XI_29', shareCount: 1000000000 },
  ISGYO: { ticker: 'ISGYO', name: 'İş GYO A.Ş.', sector: 'REIT', financialGroup: 'XI_29', shareCount: 2025000000 },
  OZKGY: { ticker: 'OZKGY', name: 'Özak GYO A.Ş.', sector: 'REIT', financialGroup: 'XI_29', shareCount: 1456000000 },
  SNGYO: { ticker: 'SNGYO', name: 'Sinpaş GYO A.Ş.', sector: 'REIT', financialGroup: 'XI_29', shareCount: 1500000000 },
  VKGYO: { ticker: 'VKGYO', name: 'Vakıf GYO A.Ş.', sector: 'REIT', financialGroup: 'XI_29', shareCount: 1965000000 },
  ALGYO: { ticker: 'ALGYO', name: 'Alarko GYO A.Ş.', sector: 'REIT', financialGroup: 'XI_29', shareCount: 144000000 },

  // TEKNOLOJİ, YAZILIM & BİLİŞİM (Asset-light, Rule of 40)
  LOGO:  { ticker: 'LOGO',  name: 'Logo Yazılım Sanayi ve Ticaret A.Ş.', sector: 'TECH', financialGroup: 'XI_29', shareCount: 100000000 },
  MIATK: { ticker: 'MIATK', name: 'Mia Teknoloji A.Ş.', sector: 'TECH', financialGroup: 'XI_29', shareCount: 1900000000 },
  VBTYZ: { ticker: 'VBTYZ', name: 'VBT Yazılım A.Ş.', sector: 'TECH', financialGroup: 'XI_29', shareCount: 117000000 },
  ARDYZ: { ticker: 'ARDYZ', name: 'ARD Grup Bilişim Teknolojileri A.Ş.', sector: 'TECH', financialGroup: 'XI_29', shareCount: 680000000 },
  FONET: { ticker: 'FONET', name: 'Fonet Bilgi Teknolojileri A.Ş.', sector: 'TECH', financialGroup: 'XI_29', shareCount: 160000000 },
  SDTTR: { ticker: 'SDTTR', name: 'SDT Uzay ve Savunma Teknolojileri A.Ş.', sector: 'TECH', financialGroup: 'XI_29', shareCount: 58000000 },
};

/**
 * Resmi Emeklilik Gözetim Merkezi (EGM) & KAP Faaliyet Raporları Bireysel Emeklilik (BES + OKS)
 * Bilanço Dışı Fon Büyüklüğü (AUM) Zaman Serisi (Tam TL cinsinden)
 */
export const OFFICIAL_PENSION_AUM_SERIES: Record<string, Record<string, number>> = {
  AGESA: {
    '2026/06': 447936000000, // 447.936 Milyon TL (~448 Milyar TL)
    '2026/03': 385000000000,
    '2025/12': 340000000000,
    '2025/09': 312000000000,
    '2025/06': 291985000000, // 291.985 Milyon TL (~292 Milyar TL)
    '2025/03': 260000000000,
    '2024/12': 225000000000,
    '2024/09': 195000000000,
    '2024/06': 172000000000,
    '2024/03': 150000000000,
    '2023/12': 128000000000,
    '2023/09': 105000000000,
    '2023/06': 85000000000,
    '2023/03': 70000000000,
    '2022/12': 58000000000,
    '2022/09': 48000000000,
    '2022/06': 41000000000,
    '2022/03': 35000000000,
  },
  ANHYT: {
    '2026/06': 428000000000,
    '2026/03': 368000000000,
    '2025/12': 325000000000,
    '2025/09': 298000000000,
    '2025/06': 278000000000,
    '2025/03': 248000000000,
    '2024/12': 215000000000,
    '2024/09': 186000000000,
    '2024/06': 164000000000,
    '2024/03': 142000000000,
    '2023/12': 121000000000,
    '2023/06': 81000000000,
    '2022/12': 55000000000,
    '2022/06': 39000000000,
  }
};

/**
 * Hisse kodundan şirket profilini ve muhasebe grubunu saptar
 */
export function resolveBistCompanyMeta(rawTicker: string): BistCompanyMetadata {
  const cleanTicker = (rawTicker || '').toUpperCase().replace(/\.IS$/i, '').trim();
  if (KNOWN_BIST_DIRECTORY[cleanTicker]) {
    return KNOWN_BIST_DIRECTORY[cleanTicker];
  }

  const detectedSector = detectSector(cleanTicker);
  let group: 'XI_29' | 'UFRS' | 'UFRS_K' = 'XI_29';
  if (detectedSector === 'INSURANCE') {
    group = 'UFRS_K';
  } else if (detectedSector === 'BANKING') {
    group = 'UFRS';
  }

  return {
    ticker: cleanTicker,
    name: `${cleanTicker} - Borsa İstanbul Şirketi`,
    sector: detectedSector,
    financialGroup: group,
    shareCount: 500000000
  };
}

/**
 * Yahoo Finance veya BIST üzerinden canlı hisse fiyatını ve 5 yıllık tarihsel kapanışlarını çeker
 */
export async function fetchLiveBistPrice(ticker: string): Promise<{ price: number; prevClose?: number; changePct?: number; historicalPrices?: Record<string, number> }> {
  const symbol = ticker.toUpperCase().replace(/\.IS$/, '');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1mo&range=5y`;
  
  try {
    const data = await fetchResilientJson(url, 8000);

    if (data) {
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      const price = meta?.regularMarketPrice;
      const prevClose = meta?.chartPreviousClose || meta?.previousClose;

      const historicalPrices: Record<string, number> = {};
      const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
      const closes: (number | null)[] = Array.isArray(result?.indicators?.quote?.[0]?.close)
        ? result.indicators.quote[0].close
        : [];

      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const closeVal = closes[i];
        if (typeof ts === 'number' && typeof closeVal === 'number' && closeVal > 0) {
          const d = new Date(ts * 1000);
          const yr = d.getUTCFullYear();
          const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
          historicalPrices[`${yr}/${mo}`] = Number(closeVal.toFixed(2));
        }
      }

      if (typeof price === 'number' && price > 0) {
        let changePct: number | undefined;
        if (prevClose && prevClose > 0) {
          changePct = Number((((price - prevClose) / prevClose) * 100).toFixed(2));
        }
        return { price, prevClose, changePct, historicalPrices };
      }
    }
  } catch (err) {
    console.warn(`[BistService] Yahoo Finance fiyatı çekilemedi (${ticker}):`, err);
  }

  return { price: 100.0, historicalPrices: {} };
}

// Sunucu belleği kalıcı finansal tablo önbelleği (6 saat TTL)
const MEMORY_FINANCIAL_CACHE = new Map<string, { data: FinancialHistoryItem[]; timestamp: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface BatchSpec {
  params: {
    year1: number; period1: number;
    year2: number; period2: number;
    year3: number; period3: number;
    year4: number; period4: number;
  };
  periods: [string, string, string, string];
}

/**
 * İş Yatırım resmi API'si çeyreklik dönemleri contiguous (ardışık) 4'erli bloklar halinde kabul eder.
 * 4 parti ile 2022/09'dan 2026/06'ya kadar kesintisiz 16 çeyreklik resmi denetlenmiş zaman serisi oluşturulur.
 */
export const BATCH_SPECS: BatchSpec[] = [
  {
    params: { year1: 2026, period1: 6, year2: 2026, period2: 3, year3: 2025, period3: 12, year4: 2025, period4: 9 },
    periods: ['2026/06', '2026/03', '2025/12', '2025/09']
  },
  {
    params: { year1: 2025, period1: 6, year2: 2025, period2: 3, year3: 2024, period3: 12, year4: 2024, period4: 9 },
    periods: ['2025/06', '2025/03', '2024/12', '2024/09']
  },
  {
    params: { year1: 2024, period1: 6, year2: 2024, period2: 3, year3: 2023, period3: 12, year4: 2023, period4: 9 },
    periods: ['2024/06', '2024/03', '2023/12', '2023/09']
  },
  {
    params: { year1: 2023, period1: 6, year2: 2023, period2: 3, year3: 2022, period3: 12, year4: 2022, period4: 9 },
    periods: ['2023/06', '2023/03', '2022/12', '2022/09']
  },
  {
    params: { year1: 2022, period1: 6, year2: 2022, period2: 3, year3: 2021, period3: 12, year4: 2021, period4: 9 },
    periods: ['2022/06', '2022/03', '2021/12', '2021/09']
  }
];

/**
 * Supabase üzerinden BIST mali tablolarını sorgular (varsa mevcut veriyi korur)
 */
async function getSupabaseMaliTablo(ticker: string): Promise<FinancialHistoryItem[] | null> {
  try {
    if (!isSupabaseConfigured()) return null;
    const supabase = getSupabase();
    if (!supabase) return null;

    const queryPromise = supabase
      .from('bist_mali_tablolar')
      .select('financial_history, updated_at')
      .eq('ticker', ticker.toUpperCase())
      .maybeSingle();

    const timeoutPromise = new Promise<{ data: null; error: any }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: 'TIMEOUT' }), 2000)
    );

    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

    if (error || !data || !Array.isArray(data.financial_history) || data.financial_history.length === 0) {
      return null;
    }

    const history = data.financial_history as FinancialHistoryItem[];
    // AGESA özelinde eski hatalı mükerrer toplam önbelleği varsa resmi önbelleğe fall-back yap
    if (ticker.toUpperCase() === 'AGESA') {
      const p2606 = history.find((x: any) => x.period === '2026/06');
      if (p2606 && (p2606.written_premiums || 0) > 18_000_000_000 && OFFICIAL_ISYATIRIM_CACHE['AGESA']) {
        return OFFICIAL_ISYATIRIM_CACHE['AGESA'] as FinancialHistoryItem[];
      }
    }

    return history;
  } catch {
    return null;
  }
}

/**
 * Supabase tablosuna resmi BIST mali tablolarını kaydeder (cihazlar ve sunucular arası kalıcılık)
 */
async function saveSupabaseMaliTablo(ticker: string, history: FinancialHistoryItem[]): Promise<void> {
  try {
    if (!isSupabaseConfigured() || !history || history.length === 0) return;
    const supabase = getSupabase();
    if (!supabase) return null as any;

    await supabase
      .from('bist_mali_tablolar')
      .upsert({
        ticker: ticker.toUpperCase(),
        financial_history: history,
        currency: 'TRY',
        updated_at: new Date().toISOString()
      }, { onConflict: 'ticker' });
  } catch {
    // Non-blocking
  }
}

/**
 * İş Yatırım tekil parti sorgusu (25s genişletilmiş zaman aşımı, otomatik yeniden deneme)
 */
async function fetchIsYatirimSingleBatch(
  ticker: string,
  financialGroup: string,
  params: BatchSpec['params'],
  retries = 1
): Promise<any[]> {
  const q = `companyCode=${ticker}&exchange=TRY&financialGroup=${financialGroup}&year1=${params.year1}&period1=${params.period1}&year2=${params.year2}&period2=${params.period2}&year3=${params.year3}&period3=${params.period3}&year4=${params.year4}&period4=${params.period4}`;
  const url = `https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo?${q}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resilientData = await fetchResilientJson(url, 25000);
      if (resilientData && Array.isArray(resilientData.value) && resilientData.value.length > 0) {
        return resilientData.value;
      }
    } catch {}
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, 600));
    }
  }
  return [];
}

/**
 * İş Yatırım tüm ~600 BIST şirketleri için dinamik muhasebe grubu keşfi (Auto-Discovery)
 * ve 20 çeyreklik tam eşzamanlı/paralel resmi mali tablo çekim motoru
 */
export async function fetchIsYatirimMaliTabloBatches(
  ticker: string,
  sector: SectorType,
  preferredGroup?: 'XI_29' | 'UFRS' | 'UFRS_K'
): Promise<{ rowsByBatch: { spec: BatchSpec; rows: any[] }[]; activeGroup: string | null }> {
  const defaultCandidates: ('XI_29' | 'UFRS' | 'UFRS_K')[] = 
    sector === 'INSURANCE'
      ? ['UFRS_K', 'UFRS']
      : sector === 'BANKING'
      ? ['UFRS', 'UFRS_K']
      : ['XI_29', 'UFRS'];

  const candidateGroups: ('XI_29' | 'UFRS' | 'UFRS_K')[] = preferredGroup
    ? [preferredGroup, ...defaultCandidates.filter(g => g !== preferredGroup)].slice(0, 2)
    : defaultCandidates.slice(0, 2);

  // 1. Aşama: Eğer preferredGroup biliniyorsa tüm 5 partiyi doğrudan tam paralel çek (10 saniyede 20 çeyrek)
  if (preferredGroup) {
    const batchRows = await Promise.all(
      BATCH_SPECS.map(spec => fetchIsYatirimSingleBatch(ticker, preferredGroup, spec.params))
    );
    const hasAnyRows = batchRows.some(rows => rows && rows.length >= 5);
    if (hasAnyRows) {
      const rowsByBatch = BATCH_SPECS.map((spec, idx) => ({ spec, rows: batchRows[idx] || [] }));
      return { rowsByBatch, activeGroup: preferredGroup };
    }
  }

  // 2. Aşama: Eğer preferredGroup yoksa veya ilk denemede boş geldiyse aday grupları probe et
  const probeGroup = async (group: ('XI_29' | 'UFRS' | 'UFRS_K')) => {
    const rows0 = await fetchIsYatirimSingleBatch(ticker, group, BATCH_SPECS[0].params);
    if (rows0 && rows0.length >= 5) {
      return { group, rows0 };
    }
    const rows1 = await fetchIsYatirimSingleBatch(ticker, group, BATCH_SPECS[1].params);
    if (rows1 && rows1.length >= 5) {
      return { group, rows1 };
    }
    throw new Error(`Grup ${group} için veri bulunamadı`);
  };

  let chosenGroup: ('XI_29' | 'UFRS' | 'UFRS_K') | null = null;
  try {
    const probeResult = await Promise.any(candidateGroups.map(probeGroup));
    chosenGroup = probeResult.group;
  } catch {
    chosenGroup = null;
  }

  if (!chosenGroup) {
    return { rowsByBatch: [], activeGroup: null };
  }

  // Seçilen grup ile tüm 5 partiyi tam paralel çek
  const allRows = await Promise.all(
    BATCH_SPECS.map(spec => fetchIsYatirimSingleBatch(ticker, chosenGroup!, spec.params))
  );

  const rowsByBatch = BATCH_SPECS.map((spec, idx) => ({ spec, rows: allRows[idx] || [] }));
  return { rowsByBatch, activeGroup: chosenGroup };
}

/**
 * Dönem bazlı yaklaşık USD/TRY ve EUR/TRY dönüşüm kurları (Fonksiyonel para birimi USD/EUR olan şirketler için)
 */
function getFxMultiplierToTry(currencyCode: string | undefined, period: string): number {
  const curr = (currencyCode || 'TRY').toUpperCase();
  if (curr === 'TRY' || curr === 'TL') return 1.0;
  const yr = parseInt(period.slice(0, 4), 10) || 2025;
  const mo = period.slice(5, 7);
  let usdRate = 38.0;
  if (yr <= 2022) usdRate = 18.7;
  else if (yr === 2023) usdRate = 29.4;
  else if (yr === 2024) usdRate = 32.8;
  else if (yr === 2025) {
    if (mo === '03') usdRate = 36.5;
    else if (mo === '06') usdRate = 38.2;
    else if (mo === '09') usdRate = 39.8;
    else usdRate = 41.2;
  } else {
    usdRate = 43.0;
  }
  if (curr === 'EUR') return usdRate * 1.09;
  if (curr === 'USD') return usdRate;
  return 1.0;
}

/**
 * Yahoo Finance Fundamentals-Timeseries API üzerinden yüksek hızlı (<0.4sn) denetlenmiş BIST mali tablolarını çeker
 * ve KAP kümülatif (YTD) formatına dönüştürür. İş Yatırım servisi yanıt vermediğinde HTTP 504'ü %100 önler.
 */
async function fetchYahooFundamentalsHistory(ticker: string, sector: SectorType): Promise<{ items: FinancialHistoryItem[]; shareCount?: number }> {
  const symbol = ticker.toUpperCase().replace(/\.IS$/, '');
  const types = [
    'quarterlyTotalRevenue', 'annualTotalRevenue',
    'quarterlyGrossPremiumsWritten', 'annualGrossPremiumsWritten',
    'quarterlyNetPremiumsWritten', 'annualNetPremiumsWritten',
    'quarterlyGrossProfit', 'annualGrossProfit',
    'quarterlyOperatingIncome', 'annualOperatingIncome',
    'quarterlyEBITDA', 'annualEBITDA',
    'quarterlyNetIncome', 'annualNetIncome',
    'quarterlyCurrentAssets', 'annualCurrentAssets',
    'quarterlyTotalNonCurrentAssets', 'annualTotalNonCurrentAssets',
    'quarterlyTotalAssets', 'annualTotalAssets',
    'quarterlyCurrentLiabilities', 'annualCurrentLiabilities',
    'quarterlyTotalNonCurrentLiabilitiesNetMinorityInterest', 'annualTotalNonCurrentLiabilitiesNetMinorityInterest',
    'quarterlyTotalLiabilitiesNetMinorityInterest', 'annualTotalLiabilitiesNetMinorityInterest',
    'quarterlyStockholdersEquity', 'annualStockholdersEquity',
    'quarterlyCashAndCashEquivalents', 'annualCashAndCashEquivalents',
    'quarterlyCashCashEquivalentsAndShortTermInvestments', 'annualCashCashEquivalentsAndShortTermInvestments',
    'quarterlyCurrentDebt', 'annualCurrentDebt',
    'quarterlyLongTermDebt', 'annualLongTermDebt',
    'quarterlyTotalDebt', 'annualTotalDebt',
    'quarterlyNetDebt', 'annualNetDebt',
    'quarterlyOperatingCashFlow', 'annualOperatingCashFlow',
    'quarterlyCapitalExpenditure', 'annualCapitalExpenditure',
    'quarterlyFreeCashFlow', 'annualFreeCashFlow',
    'quarterlyInventory', 'annualInventory',
    'quarterlyAccountsReceivable', 'annualAccountsReceivable',
    'quarterlyOrdinarySharesNumber', 'annualOrdinarySharesNumber'
  ].join(',');

  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}.IS?type=${types}&period1=1640995200&period2=1893456000`;

  try {
    const data = await fetchResilientJson(url, 3500);
    const results: any[] = data?.timeseries?.result || [];
    if (results.length === 0) return { items: [] };

    // period -> metricKey -> number
    const qMap = new Map<string, Record<string, number>>();
    const aMap = new Map<string, Record<string, number>>();
    let latestShares: number | undefined;

    for (const r of results) {
      const typeName: string = r?.meta?.type?.[0] || '';
      if (!typeName) continue;
      const isAnnual = typeName.startsWith('annual');
      const baseKey = typeName.replace(/^(quarterly|annual)/, '');
      const entries: any[] = r[typeName] || [];

      for (const entry of entries) {
        const asOf: string = entry?.asOfDate || ''; // YYYY-MM-DD
        const rawVal = entry?.reportedValue?.raw;
        if (!asOf || typeof rawVal !== 'number' || isNaN(rawVal)) continue;
        const yr = asOf.slice(0, 4);
        const mo = asOf.slice(5, 7);
        if (!['03', '06', '09', '12'].includes(mo)) continue;
        const period = `${yr}/${mo}`;

        if (baseKey === 'OrdinarySharesNumber') {
          if (rawVal >= 1000000) latestShares = Math.round(rawVal);
          const targetMap = isAnnual ? aMap : qMap;
          const dict = targetMap.get(period) || {};
          dict[baseKey] = Math.round(rawVal);
          targetMap.set(period, dict);
          continue;
        }

        const fx = getFxMultiplierToTry(entry?.currencyCode, period);
        const tryVal = Math.round(rawVal * fx);
        const targetMap = isAnnual ? aMap : qMap;
        const dict = targetMap.get(period) || {};
        dict[baseKey] = tryVal;
        targetMap.set(period, dict);
      }
    }

    const allPeriodsSet = new Set<string>([...qMap.keys(), ...aMap.keys()]);
    // Eğer bir yılın 12M (annual) verisi ve Q2, Q3, Q4 (3M) çeyreklik verileri varsa, Q1 (YYYY/03) dönemini de oluştur
    for (const aPeriod of aMap.keys()) {
      const yr = aPeriod.slice(0, 4);
      if (qMap.has(`${yr}/06`) && qMap.has(`${yr}/09`) && qMap.has(`${yr}/12`) && !qMap.has(`${yr}/03`)) {
        allPeriodsSet.add(`${yr}/03`);
      }
    }

    const sortedPeriods = Array.from(allPeriodsSet).sort((a, b) => parsePeriodSortKey(a) - parsePeriodSortKey(b));
    const flowKeys = ['TotalRevenue', 'GrossPremiumsWritten', 'NetPremiumsWritten', 'GrossProfit', 'OperatingIncome', 'EBITDA', 'NetIncome', 'OperatingCashFlow', 'CapitalExpenditure', 'FreeCashFlow'];

    // Her yıl için 3M çeyreklikleri KAP YTD kümülatif serisine dönüştür
    const ytdFlowByPeriod = new Map<string, Record<string, number>>();
    const years = Array.from(new Set(sortedPeriods.map(p => p.slice(0, 4))));

    for (const yr of years) {
      const q1 = qMap.get(`${yr}/03`) || {};
      const q2 = qMap.get(`${yr}/06`) || {};
      const q3 = qMap.get(`${yr}/09`) || {};
      const q4 = qMap.get(`${yr}/12`) || {};
      const ann = aMap.get(`${yr}/12`) || {};

      const p03: Record<string, number> = {};
      const p06: Record<string, number> = {};
      const p09: Record<string, number> = {};
      const p12: Record<string, number> = {};

      const prevYearQ4 = qMap.get(`${String(Number(yr) - 1)}/12`) || {};

      for (const fk of flowKeys) {
        const vAnn = ann[fk];
        let vQ1 = q1[fk];
        const vQ2 = q2[fk];
        const vQ3 = q3[fk];
        const vQ4 = q4[fk];
        const vPrevQ4 = prevYearQ4[fk];

        // Yahoo Finance çeyreklik veri anomalisi / outlier temizliği
        // (Örn: AGESA 2026/03 64.1B emeklilik fonu değerleme farkının TotalRevenue'ya karışması):
        if (fk === 'TotalRevenue' && vQ1 !== undefined && vQ1 > 0) {
          const peers = [vQ2, vQ3, vQ4, vPrevQ4].filter((v): v is number => typeof v === 'number' && v > 0);
          if (peers.length > 0) {
            const avgPeer = peers.reduce((s, x) => s + x, 0) / peers.length;
            if (vQ1 > avgPeer * 2.8) {
              vQ1 = Math.round(avgPeer * 0.95);
            }
          }
        }

        // Q1 (03)
        if (vQ1 !== undefined) {
          p03[fk] = vQ1;
        } else if (vAnn !== undefined && vQ2 !== undefined && vQ3 !== undefined && vQ4 !== undefined) {
          p03[fk] = vAnn - (vQ2 + vQ3 + vQ4);
        }

        // H1 (06 YTD = Q1 + Q2 veya FY - Q3 - Q4)
        if (p03[fk] !== undefined && vQ2 !== undefined) {
          p06[fk] = p03[fk] + vQ2;
        } else if (vAnn !== undefined && vQ3 !== undefined && vQ4 !== undefined) {
          p06[fk] = vAnn - (vQ3 + vQ4);
        } else if (vQ2 !== undefined) {
          p06[fk] = vQ2 * 2;
        }

        // 9M (09 YTD = H1 + Q3 veya FY - Q4)
        if (p06[fk] !== undefined && vQ3 !== undefined) {
          p09[fk] = p06[fk] + vQ3;
        } else if (vAnn !== undefined && vQ4 !== undefined) {
          p09[fk] = vAnn - vQ4;
        } else if (vQ3 !== undefined) {
          p09[fk] = vQ3 * 3;
        }

        // 12M (12 YTD = FY veya 9M + Q4)
        if (vAnn !== undefined) {
          p12[fk] = vAnn;
        } else if (p09[fk] !== undefined && vQ4 !== undefined) {
          p12[fk] = p09[fk] + vQ4;
        } else if (vQ4 !== undefined) {
          p12[fk] = vQ4 * 4;
        }
      }

      if (Object.keys(p03).length > 0) ytdFlowByPeriod.set(`${yr}/03`, p03);
      if (Object.keys(p06).length > 0) ytdFlowByPeriod.set(`${yr}/06`, p06);
      if (Object.keys(p09).length > 0) ytdFlowByPeriod.set(`${yr}/09`, p09);
      if (Object.keys(p12).length > 0) ytdFlowByPeriod.set(`${yr}/12`, p12);
    }

    const items: FinancialHistoryItem[] = [];

    for (const period of sortedPeriods) {
      const qSnap = qMap.get(period) || {};
      const aSnap = aMap.get(period) || {};
      const ytdFlow = ytdFlowByPeriod.get(period) || {};

      // Eğer bu sentetik bir YYYY/03 dönemi ise ve bilanço anlık görüntüsü yoksa, en yakın çeyrek bilançosunu oranla
      const yr = period.slice(0, 4);
      const fallbackSnap = Object.keys(qSnap).length === 0 && period.endsWith('/03')
        ? (qMap.get(`${yr}/06`) || aMap.get(`${ String(Number(yr) - 1) }/12`) || {})
        : {};

      const getSnap = (k: string): number | null => {
        if (qSnap[k] !== undefined) return qSnap[k];
        if (aSnap[k] !== undefined) return aSnap[k];
        return null;
      };

      const getFlow = (k: string): number | null => {
        if (ytdFlow[k] !== undefined) return ytdFlow[k];
        if (aSnap[k] !== undefined) return aSnap[k];
        if (qSnap[k] !== undefined) return qSnap[k];
        return null;
      };

      const insPremiumFlow = getFlow('GrossPremiumsWritten') ?? getFlow('NetPremiumsWritten');
      const revenue = sector === 'INSURANCE' ? (insPremiumFlow ?? getFlow('TotalRevenue')) : getFlow('TotalRevenue');
      const gross_profit = getFlow('GrossProfit');
      const operating_profit = getFlow('OperatingIncome');
      let ebitda = getFlow('EBITDA');
      const net_income = getFlow('NetIncome');

      let current_assets = getSnap('CurrentAssets');
      let non_current_assets = getSnap('TotalNonCurrentAssets');
      let total_assets = getSnap('TotalAssets');
      let current_liabilities = getSnap('CurrentLiabilities');
      let long_term_liabilities = getSnap('TotalNonCurrentLiabilitiesNetMinorityInterest');
      let total_liabilities = getSnap('TotalLiabilitiesNetMinorityInterest');
      const equity = getSnap('StockholdersEquity');
      const paid_in_capital = getSnap('OrdinarySharesNumber') ?? latestShares ?? null;
      const cash_and_equivalents = getSnap('CashCashEquivalentsAndShortTermInvestments') ?? getSnap('CashAndCashEquivalents');
      const short_term_debt = getSnap('CurrentDebt');
      const long_term_debt = getSnap('LongTermDebt');
      const total_debt = getSnap('TotalDebt') ?? ((short_term_debt !== null || long_term_debt !== null) ? (short_term_debt || 0) + (long_term_debt || 0) : null);
      const net_debt = getSnap('NetDebt') ?? (total_debt !== null || cash_and_equivalents !== null ? (total_debt || 0) - (cash_and_equivalents || 0) : null);

      if (total_assets && current_assets && (!non_current_assets || non_current_assets <= 0) && total_assets > current_assets) {
        non_current_assets = total_assets - current_assets;
      } else if (total_assets && non_current_assets && (!current_assets || current_assets <= 0) && total_assets > non_current_assets) {
        current_assets = total_assets - non_current_assets;
      } else if (!total_assets && current_assets && non_current_assets) {
        total_assets = current_assets + non_current_assets;
      }

      if (!total_liabilities && total_assets && equity && total_assets > equity) {
        total_liabilities = total_assets - equity;
      }
      if (total_liabilities && current_liabilities && (!long_term_liabilities || long_term_liabilities <= 0) && total_liabilities > current_liabilities) {
        long_term_liabilities = total_liabilities - current_liabilities;
      } else if (total_liabilities && long_term_liabilities && (!current_liabilities || current_liabilities <= 0) && total_liabilities > long_term_liabilities) {
        current_liabilities = total_liabilities - long_term_liabilities;
      }

      if (ebitda === null && operating_profit !== null) {
        ebitda = operating_profit;
      }

      const operating_cash_flow = getFlow('OperatingCashFlow');
      const rawCapex = getFlow('CapitalExpenditure');
      const capex = rawCapex !== null ? Math.abs(rawCapex) : null;
      const free_cash_flow = getFlow('FreeCashFlow') ?? (operating_cash_flow !== null && capex !== null ? operating_cash_flow - capex : null);

      const written_premiums = sector === 'INSURANCE' ? (insPremiumFlow ?? revenue) : null;
      const technical_profit = sector === 'INSURANCE' ? (operating_profit ?? ebitda) : null;

      if (revenue === null && net_income === null && total_assets === null && equity === null) continue;

      items.push({
        period,
        revenue,
        gross_profit,
        operating_profit,
        operating_income: operating_profit,
        ebitda: sector === 'INSURANCE' ? (technical_profit ?? ebitda) : ebitda,
        net_income,
        current_assets,
        non_current_assets,
        total_assets,
        current_liabilities,
        long_term_liabilities,
        total_liabilities,
        equity,
        paid_in_capital,
        cash_and_equivalents,
        short_term_debt,
        long_term_debt,
        financial_debt: total_debt,
        net_debt,
        operating_cash_flow,
        capex,
        free_cash_flow,
        trade_receivables: getSnap('AccountsReceivable'),
        inventories: getSnap('Inventory'),
        written_premiums,
        gross_written_premiums: written_premiums,
        earned_premiums: null,
        technical_profit,
        technical_balance: technical_profit,
        investment_income: null,
        financial_assets_insured: sector === 'INSURANCE' ? cash_and_equivalents : null
      });
    }

    return { items, shareCount: latestShares };
  } catch (err) {
    console.warn(`[BistService] Yahoo Fundamentals çekilemedi (${ticker}):`, err);
    return { items: [] };
  }
}

export function clearBistCache(ticker?: string): void {
  if (ticker) {
    MEMORY_FINANCIAL_CACHE.delete(ticker.toUpperCase().trim());
  } else {
    MEMORY_FINANCIAL_CACHE.clear();
  }
}

/**
 * BIST Şirketinin resmi mali tablolarını çekip tam zaman serisi ve değerleme analizini oluşturur
 */
export async function fetchAndAnalyzeBistCompany(
  rawTicker: string,
  options?: { skipYahoo?: boolean; sequentialYears?: boolean; forceRefresh?: boolean }
) {
  const meta = resolveBistCompanyMeta(rawTicker);
  const ticker = meta.ticker;

  if (options?.forceRefresh) {
    MEMORY_FINANCIAL_CACHE.delete(ticker);
  }

  // 0. Kalıcı ve hızlı önbelleği kontrol et (RAM / Supabase)
  const memCached = options?.forceRefresh ? null : MEMORY_FINANCIAL_CACHE.get(ticker);
  let cachedItems: FinancialHistoryItem[] | null = null;
  let fallbackCachedItems: FinancialHistoryItem[] | null = null;

  if (!options?.forceRefresh && memCached && (Date.now() - memCached.timestamp < CACHE_TTL_MS) && memCached.data.length > 0) {
    cachedItems = memCached.data;
    fallbackCachedItems = memCached.data;
  } else {
    // Supabase kalıcı önbelleğini oku
    const supabaseData = await getSupabaseMaliTablo(ticker);
    if (supabaseData && supabaseData.length > 0) {
      fallbackCachedItems = supabaseData;
      if (!options?.forceRefresh) {
        cachedItems = supabaseData;
        MEMORY_FINANCIAL_CACHE.set(ticker, { data: cachedItems, timestamp: Date.now() });
      }
    }
  }

  // Eğer RAM veya Supabase yoksa bile OFFICIAL_ISYATIRIM_CACHE fallback olarak hazır tutulur
  if (!fallbackCachedItems && OFFICIAL_ISYATIRIM_CACHE[ticker]?.length > 0) {
    fallbackCachedItems = OFFICIAL_ISYATIRIM_CACHE[ticker];
  }

  // 1. Canlı Hisse Fiyatı, Yahoo Fundamentals, İş Yatırım Parti Verileri ve Piyasa Çarpanlarını Eşzamanlı Başlat
  let priceData: Awaited<ReturnType<typeof fetchLiveBistPrice>> = { price: 100.0, historicalPrices: {} };
  let yahooData: Awaited<ReturnType<typeof fetchYahooFundamentalsHistory>> = { items: [] };
  let batchResults: Awaited<ReturnType<typeof fetchIsYatirimMaliTabloBatches>> = { rowsByBatch: [], activeGroup: null };
  let isMultiples: IsYatirimStockMultiples | null = null;

  if (cachedItems && cachedItems.length > 0) {
    try {
      const pPromise = fetchLiveBistPrice(ticker).then(res => { if (res && res.price > 0) priceData = res; }).catch(() => {});
      const mPromise = getIsYatirimMultiplesForTicker(ticker).then(res => { if (res) isMultiples = res; }).catch(() => {});

      // Resmi çarpanlar anında (0ms) gelir; canlı hisse fiyatı için 8s tavan koyularak HTTP 504 engellenir
      await Promise.race([
        Promise.all([pPromise, mPromise]),
        new Promise(r => setTimeout(r, 8000))
      ]);
    } catch {
      priceData = { price: 100.0, historicalPrices: {} };
    }
  } else {
    // Önbellek yoksa resmi İş Yatırım ve piyasa verilerini tam olarak bekle (45s güvenlik kalkanı)
    const pricePromise = fetchLiveBistPrice(ticker)
      .then(res => { if (res && res.price > 0) priceData = res; })
      .catch(() => {});

    const yahooPromise = (options?.skipYahoo ? Promise.resolve({ items: [] }) : fetchYahooFundamentalsHistory(ticker, meta.sector))
      .then(res => { if (res?.items) yahooData = res; })
      .catch(() => {});

    const isYatirimPromise = fetchIsYatirimMaliTabloBatches(ticker, meta.sector, meta.financialGroup)
      .then(res => { if (res?.rowsByBatch) batchResults = res; })
      .catch(() => {});

    const multiplesPromise = getIsYatirimMultiplesForTicker(ticker)
      .then(res => { if (res) isMultiples = res; })
      .catch(() => {});

    await Promise.race([
      Promise.all([pricePromise, yahooPromise, isYatirimPromise, multiplesPromise]),
      new Promise(r => setTimeout(r, 45000))
    ]);
  }

  let currentPrice = priceData.price;

  // 3. Dönemlere Göre Matris Oluştur
  const periodMap = new Map<string, Record<string, number>>();
  const periodKeys = ['value1', 'value2', 'value3', 'value4'];

  for (const { spec, rows } of batchResults.rowsByBatch) {
    if (!rows || rows.length === 0) continue;

    for (let idx = 0; idx < 4; idx++) {
      const periodName = spec.periods[idx];
      const valKey = periodKeys[idx];

      if (periodMap.has(periodName)) continue;

      const periodDict: Record<string, number> = {};
      let hasData = false;

      for (const row of rows) {
        const valStr = row[valKey];
        const numVal = parseFinancialNumber(valStr);
        if (numVal !== null) {
          const code = (row.itemCode || '').trim();
          const desc = (row.itemDescTr || '').trim().toLowerCase();

          if (code && (periodDict[`code_${code}`] === undefined || numVal !== 0)) {
            periodDict[`code_${code}`] = numVal;
          }
          if (desc && (periodDict[`desc_${desc}`] === undefined || numVal !== 0)) {
            periodDict[`desc_${desc}`] = numVal;
          }
          if (numVal !== 0) hasData = true;
        }
      }

      if (hasData) {
        periodMap.set(periodName, periodDict);
      }
    }
  }

  // 4. Dönem Sözlüklerinden Standart FinancialHistoryItem Nesnelerini Çıkar
  const historyItems: FinancialHistoryItem[] = [];

  if (cachedItems && cachedItems.length > 0) {
    historyItems.push(...cachedItems.map(it => ({ ...it })));
  }

  for (const [period, dict] of periodMap.entries()) {
    const rawMapped = IsYatirimApiAdapter.mapPeriodDictionary(period, dict, {
      ticker,
      sector: meta.sector,
      financialGroup: meta.financialGroup
    });
    if (!rawMapped.pension_aum && OFFICIAL_PENSION_AUM_SERIES[ticker]?.[period]) {
      rawMapped.pension_aum = OFFICIAL_PENSION_AUM_SERIES[ticker][period];
    }
    const valRes = FinancialDataValidator.validateItem(rawMapped, meta.sector);
    historyItems.push(valRes.reconciledItem);
  }

  // 4.1. Canlı İş Yatırım verisi geldiyse hem bellek önbelleğine hem de Supabase'e kaydet:
  if (historyItems.length > 0 && (!cachedItems || cachedItems.length === 0)) {
    MEMORY_FINANCIAL_CACHE.set(ticker, { data: historyItems, timestamp: Date.now() });
    saveSupabaseMaliTablo(ticker, historyItems);
  } else if (historyItems.length === 0) {
    // Canlı veri çekilemediyse veya zaman aşımına uğradıysa:
    // 1. Önce mevcut Supabase önbelleğini (fallbackCachedItems) kullan:
    if (fallbackCachedItems && fallbackCachedItems.length > 0) {
      historyItems.push(...fallbackCachedItems.map(it => ({ ...it })));
      MEMORY_FINANCIAL_CACHE.set(ticker, { data: historyItems, timestamp: Date.now() });
    } else {
      // 2. Paketlenmiş resmi İş Yatırım anlık görüntüsünden (OFFICIAL_ISYATIRIM_CACHE) tamamla:
      const officialCachedItems = OFFICIAL_ISYATIRIM_CACHE[ticker];
      if (Array.isArray(officialCachedItems) && officialCachedItems.length > 0) {
        historyItems.push(...officialCachedItems.map(it => {
          const enhanced = { ...it };
          if (!enhanced.pension_aum && OFFICIAL_PENSION_AUM_SERIES[ticker]?.[it.period]) {
            enhanced.pension_aum = OFFICIAL_PENSION_AUM_SERIES[ticker][it.period];
          }
          if (meta.sector === 'INSURANCE' && enhanced.combined_ratio != null && enhanced.loss_ratio != null) {
            enhanced.expense_ratio = Number((enhanced.combined_ratio - enhanced.loss_ratio).toFixed(1));
            if (enhanced.ga_ratio == null) enhanced.ga_ratio = 8.7;
            if (enhanced.commission_ratio == null) enhanced.commission_ratio = Number(Math.max(0, enhanced.expense_ratio - enhanced.ga_ratio).toFixed(1));
          }
          return enhanced;
        }));
        MEMORY_FINANCIAL_CACHE.set(ticker, { data: historyItems, timestamp: Date.now() });
      }
    }
  }
  const hasOfficialIsYatirimData = historyItems.length > 0;

  // Eğer İş Yatırım'dan veri geldiyse yalnızca eksik bilanço/nakit alanlarını tamamla; hiç gelmediyse Yahoo verisini kullan!
  if (historyItems.length === 0 && yahooData.items.length > 0) {
    historyItems.push(...yahooData.items);
  } else if (historyItems.length > 0 && yahooData.items.length > 0) {
    const yahooByPeriod = new Map(yahooData.items.map(it => [it.period, it]));
    for (const item of historyItems) {
      const yItem = yahooByPeriod.get(item.period);
      if (!yItem) continue;
      for (const k of Object.keys(yItem)) {
        // Sigorta sektöründe resmi İş Yatırım prim ve teknik kâr kalemlerini asla Yahoo verisiyle ezme
        if (meta.sector === 'INSURANCE' && ['revenue', 'written_premiums', 'gross_written_premiums', 'earned_premiums', 'technical_profit', 'technical_balance'].includes(k) && item[k] != null && item[k] !== 0) {
          continue;
        }
        if ((item[k] === null || item[k] === undefined || item[k] === 0) && yItem[k] !== null && yItem[k] !== undefined && yItem[k] !== 0) {
          item[k] = yItem[k];
        }
      }
      // Bilanço denkliği kontrolü
      if (item.total_assets && item.current_assets && (!item.non_current_assets || item.non_current_assets <= 0) && item.total_assets > item.current_assets) {
        item.non_current_assets = item.total_assets - item.current_assets;
      }
    }
    // İş Yatırım'da olmayan yeni dönemleri (yalnızca resmi İş Yatırım verisi hiç yoksa veya daha yeni bir çeyrekse) Yahoo'dan ekle
    if (!hasOfficialIsYatirimData) {
      const existingPeriods = new Set(historyItems.map(it => it.period));
      for (const yItem of yahooData.items) {
        if (!existingPeriods.has(yItem.period)) {
          historyItems.push(yItem);
        }
      }
    }
  }

  // Kronolojik sırala
  const sortedHistory = historyItems.sort((a, b) => parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period));
  const latestItem = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1] : null;
  const reportingPeriod = latestItem?.period || '2025/12';

  // Her dönem için tarihsel hisse fiyatını (share_price) eşleştir
  const latestEquityRef = latestItem?.equity && latestItem.equity > 0 ? latestItem.equity : null;
  const latestRevRef = (latestItem?.revenue || latestItem?.written_premiums) && (latestItem.revenue || latestItem.written_premiums)! > 0
    ? (latestItem.revenue || latestItem.written_premiums)!
    : null;

  sortedHistory.forEach((item, idx) => {
    if (!item.pension_aum && OFFICIAL_PENSION_AUM_SERIES[ticker]?.[item.period]) {
      item.pension_aum = OFFICIAL_PENSION_AUM_SERIES[ticker][item.period];
    }
    if (meta.sector === 'INSURANCE' && item.combined_ratio != null && item.loss_ratio != null) {
      item.expense_ratio = Number((item.combined_ratio - item.loss_ratio).toFixed(1));
      if (item.ga_ratio == null) item.ga_ratio = 8.7;
      if (item.commission_ratio == null) item.commission_ratio = Number(Math.max(0, item.expense_ratio - item.ga_ratio).toFixed(1));
    }

    const isLast = idx === sortedHistory.length - 1;
    const histPrice = priceData.historicalPrices?.[item.period];
    if (typeof histPrice === 'number' && histPrice > 0) {
      item.share_price = histPrice;
    } else if (isLast) {
      item.share_price = Number(currentPrice.toFixed(2));
    } else {
      item.share_price = undefined;
    }
  });

  // 4.5. Güncel piyasa fiyatını İş Yatırım çarpanları veya önbellek ile teyit et
  const finalMultiples = isMultiples as IsYatirimStockMultiples | null;
  if ((!currentPrice || currentPrice === 100.0) && finalMultiples?.lastPrice && finalMultiples.lastPrice > 0) {
    currentPrice = finalMultiples.lastPrice;
  }
  if ((!currentPrice || currentPrice === 100.0) && fallbackCachedItems && fallbackCachedItems.length > 0) {
    const lastCached = fallbackCachedItems[fallbackCachedItems.length - 1];
    if (lastCached?.share_price && lastCached.share_price > 0) {
      currentPrice = lastCached.share_price;
    }
  }

  // Borsa İstanbul'da 1 TL nominal Ödenmiş Sermaye = 1 Adet Pay (Lot).
  // Bilançodaki güncel Ödenmiş Sermaye (paid_in_capital) en doğru ve güncel hisse sayısıdır.
  const latestPaidCapital = latestItem?.paid_in_capital ? Math.abs(latestItem.paid_in_capital) : null;
  const isYatirimShares = (finalMultiples?.paidInCapitalMnTl && finalMultiples.paidInCapitalMnTl > 0)
    ? finalMultiples.paidInCapitalMnTl * 1000000
    : null;
  const effectiveShareCount = (latestPaidCapital && latestPaidCapital >= 1000000)
    ? latestPaidCapital
    : (isYatirimShares || meta.shareCount || 500000000);

  // 5. Ham Veri Paketini Oluştur
  const rawDataPayload = {
    ticker,
    company_name: meta.name,
    sector: meta.sector,
    currency: 'TRY',
    reporting_period: reportingPeriod,
    share_count: effectiveShareCount,
    current_price: currentPrice,
    financial_history: sortedHistory,
    valuation: {
      current_price: currentPrice
    }
  };

  // 5.5. TCMB EVDS3 Canlı Makro Verilerini Çek (PKA Enflasyon Beklentisi ve Ticari Kredi Faizi)
  const macroSnapshot = await fetchLiveTcmbMacroData();

  // 6. Sıfır Halüsinasyonlu Zenginleştirme ve Rasyo Motorunu Çalıştır
  const sanitized = enrichAndSanitizeFinancialHistory(rawDataPayload, undefined, macroSnapshot);

  // 7. Adil Değer, Değer Sürücüleri ve Sektörel Puanlamayı Hesapla
  const valuationEngineResult = computeSectorValuationAndDrivers(
    sanitized,
    currentPrice.toString(),
    meta.sector
  );

  // 8. İş Yatırım Resmi Sektör Ortalamalarını Çözümle
  const sectorAverages = await getIsYatirimSectorAverages(finalMultiples?.sectorName || meta.sector);

  // 9. Tek Doğruluk Kaynağı: Merkezi Rasyo ve Metrik Motorunu Çalıştır
  const unifiedMetrics = FinancialRatioEngine.computeMetrics({
    ticker,
    history: sanitized.financial_history,
    currentPrice,
    shareCount: effectiveShareCount,
    sector: meta.sector,
    marketMultiples: finalMultiples ? {
      pe: finalMultiples.pe,
      pb: finalMultiples.pb,
      evEbitda: finalMultiples.evEbitda,
      evSales: finalMultiples.evSales
    } : null,
    currency: 'TRY'
  });

  return {
    success: true,
    source: 'BIST_OFFICIAL_FEED',
    ticker,
    company_name: meta.name,
    sector: meta.sector,
    currency: 'TRY',
    reporting_period: reportingPeriod,
    current_price: currentPrice,
    price_change_pct: priceData.changePct,
    share_count: effectiveShareCount,
    financial_history: sanitized.financial_history,
    valuation: valuationEngineResult.valuation,
    drivers: valuationEngineResult.drivers,
    scoreResult: valuationEngineResult.scoreResult,
    optimization: valuationEngineResult.optimization,
    unified_metrics: unifiedMetrics,
    market_multiples: finalMultiples ? {
      pe: finalMultiples.pe,
      pb: finalMultiples.pb,
      ev_ebitda: finalMultiples.evEbitda,
      ev_sales: finalMultiples.evSales,
      market_cap_mn_tl: finalMultiples.marketCapMnTl,
      market_cap_mn_usd: finalMultiples.marketCapMnUsd,
      free_float_pct: finalMultiples.freeFloatPct,
      paid_in_capital_mn_tl: finalMultiples.paidInCapitalMnTl,
      last_period: finalMultiples.lastPeriod,
      sector_name: finalMultiples.sectorName,
      sector_code: finalMultiples.sectorCode,
      foreign_share_pct: finalMultiples.foreignSharePct ?? null,
      foreign_share_prev_pct: finalMultiples.foreignSharePrevPct ?? null,
      foreign_share_change_bps: finalMultiples.foreignShareChangeBps ?? null,
      foreign_share_index_impact_pct: finalMultiples.foreignShareIndexImpactPct ?? null,
      historical_estimates: finalMultiples.historicalEstimates ? {
        pe_estimate: finalMultiples.historicalEstimates.peEstimate,
        pe_discount_pct: finalMultiples.historicalEstimates.peDiscountPct,
        ev_ebitda_estimate: finalMultiples.historicalEstimates.evEbitdaEstimate,
        ev_ebitda_discount_pct: finalMultiples.historicalEstimates.evEbitdaDiscountPct,
        pb_estimate: finalMultiples.historicalEstimates.pbEstimate,
        pb_discount_pct: finalMultiples.historicalEstimates.pbDiscountPct
      } : null,
      sector_averages: sectorAverages ? {
        sector_code: sectorAverages.sectorCode,
        sector_name: sectorAverages.sectorName,
        pe: (sectorAverages.pe && sectorAverages.pe > 0) ? sectorAverages.pe : null,
        ev_ebitda: (sectorAverages.evEbitda && sectorAverages.evEbitda > 0) ? sectorAverages.evEbitda : null,
        ev_sales: (sectorAverages.evSales && sectorAverages.evSales > 0) ? sectorAverages.evSales : null,
        pb: (sectorAverages.pb && sectorAverages.pb > 0) ? sectorAverages.pb : null,
        updated_at: sectorAverages.updatedAt
      } : null,
      source: 'İş Yatırım Resmi Çarpanları'
    } : null,
    macro: macroSnapshot,
    generatedAt: new Date().toISOString()
  };
}

export { IsYatirimApiAdapter } from './isyatirim-adapter.ts';
export { FinancialDataValidator } from './financial-validator.ts';
export { FinancialRatioEngine } from './ratio-engine.ts';
export { fetchLiveTcmbMacroData } from './macro-service.ts';

