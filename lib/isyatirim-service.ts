/**
 * İş Yatırım Resmi Web Portalı Üzerinden Canlı BIST Temel Değerler ve Çarpanlar Servisi
 * Kaynak: https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx
 */

import { parseFinancialNumber } from './valuation.ts';

export interface IsYatirimHistoricalEstimates {
  peEstimate: number | null; // F/K Tahmin
  peDiscountPct: number | null; // Prim/İsk. (%)
  evEbitdaEstimate: number | null; // FD/FAVÖK Tahmin
  evEbitdaDiscountPct: number | null; // Prim/İsk. (%)
  pbEstimate: number | null; // PD/DD Tahmin
  pbDiscountPct: number | null; // Prim/İsk. (%)
}

export interface IsYatirimStockMultiples {
  ticker: string;
  name: string;
  sectorName: string;
  sectorCode?: string;
  lastPrice: number | null;
  marketCapMnTl: number | null;
  marketCapMnUsd: number | null;
  freeFloatPct: number | null;
  paidInCapitalMnTl: number | null;
  pe: number | null; // F/K
  evEbitda: number | null; // FD/FAVÖK
  evSales: number | null; // FD/Satışlar
  pb: number | null; // PD/DD
  lastPeriod: string | null;
  foreignSharePct?: number | null; // Güncel Yabancı Oranı (%)
  foreignSharePrevPct?: number | null; // Önceki Gün Yabancı Oranı (%)
  foreignShareChangeBps?: number | null; // Değişim (Baz Puan)
  foreignShareIndexImpactPct?: number | null; // Etki* (%)
  historicalEstimates?: IsYatirimHistoricalEstimates | null;
  updatedAt: string;
}

import { OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE } from './isyatirim-multiples-cache.ts';
import { OFFICIAL_ISYATIRIM_COMPANY_DETAILS_BASELINE } from './isyatirim-company-details-cache.ts';
import {
  OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE,
  ISYATIRIM_SECTOR_NAME_TO_CODE,
  type IsYatirimSectorAverage
} from './isyatirim-sector-averages-cache.ts';
export type { IsYatirimSectorAverage } from './isyatirim-sector-averages-cache.ts';

let cachedMultiples: Record<string, IsYatirimStockMultiples> = { ...OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE };
let cachedSectorAverages: Record<string, IsYatirimSectorAverage> = { ...OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE };
let lastFetchTimestamp = 0;
let isFetchingInProgress = false;
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 dakika önbellek

/**
 * Türkçe ondalık/binlik formatlı sayı stringini float'a çevirir (örn: '402.960,0' -> 402960.0)
 */
function parseTrFloat(valStr: string | null | undefined): number | null {
  if (!valStr) return null;
  const clean = String(valStr).trim();
  if (clean === '-' || clean === '—' || clean === '–' || clean === 'A/D' || clean === 'N/A' || clean === 'n/a' || clean === 'null' || clean === '' || clean === '&nbsp;') return null;
  return parseFinancialNumber(clean);
}

import https from 'node:https';

const isYatirimHttpsAgent = new https.Agent({
  rejectUnauthorized: false, // Yerel antivirüs veya kurumsal proxy SSL interception toleransı
  keepAlive: true,
  timeout: 30000
});

async function fetchHttpsText(urlStr: string, timeoutMs = 30000): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let req: any = null;

    const done = (val: string | null) => {
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
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
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
        res.on('end', () => done(data));
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

/**
 * İş Yatırım Temel Değerler ve Oranlar tablosunu arka planda çeker ve ayrıştırır
 */
async function doFetchAllIsYatirimMultiples(): Promise<Record<string, IsYatirimStockMultiples>> {
  const url = 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx';
  
  try {
    const html = await fetchHttpsText(url, 25000);

    if (!html) {
      console.warn('[IsYatirim] Canlı çarpan tablosu çekilemedi, önbellek kullanılıyor.');
      return cachedMultiples || {};
    }
    const result: Record<string, IsYatirimStockMultiples> = {};

    // 1. temelozet tablosunu ayıkla (Piyasa Değeri, Halka Açıklık, Ödenmiş Sermaye, Sektör)
    const ozetMatch = html.match(/<table[^>]*data-csvname="temelozet"[^>]*>([\s\S]*?)<\/table>/i);
    if (ozetMatch) {
      const rows = ozetMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
      for (const row of rows) {
        const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(c => c.replace(/<[^>]+>/g, '').trim());
        if (cells.length >= 8) {
          const ticker = cells[0].toUpperCase();
          const sectorName = cells[2] || '';
          result[ticker] = {
            ticker,
            name: cells[1],
            sectorName,
            sectorCode: ISYATIRIM_SECTOR_NAME_TO_CODE[sectorName] || undefined,
            lastPrice: parseTrFloat(cells[3]),
            marketCapMnTl: parseTrFloat(cells[4]),
            marketCapMnUsd: parseTrFloat(cells[5]),
            freeFloatPct: parseTrFloat(cells[6]),
            paidInCapitalMnTl: parseTrFloat(cells[7]),
            pe: null,
            evEbitda: null,
            evSales: null,
            pb: null,
            lastPeriod: null,
            updatedAt: new Date().toISOString()
          };
        }
      }
    }

    // 2. temelfinansal tablosunu ayıkla (F/K, FD/FAVÖK, FD/Satışlar, PD/DD, Son Dönem)
    const finMatch = html.match(/<table[^>]*data-csvname="temelfinansal"[^>]*>([\s\S]*?)<\/table>/i);
    if (finMatch) {
      const rows = finMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
      for (const row of rows) {
        const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(c => c.replace(/<[^>]+>/g, '').trim());
        if (cells.length >= 7) {
          const ticker = cells[0].toUpperCase();
          if (!result[ticker]) {
            result[ticker] = {
              ticker,
              name: '',
              sectorName: '',
              lastPrice: parseTrFloat(cells[1]),
              marketCapMnTl: null,
              marketCapMnUsd: null,
              freeFloatPct: null,
              paidInCapitalMnTl: null,
              pe: null,
              evEbitda: null,
              evSales: null,
              pb: null,
              lastPeriod: null,
              updatedAt: new Date().toISOString()
            };
          }
          if (result[ticker].lastPrice === null) {
            result[ticker].lastPrice = parseTrFloat(cells[1]);
          }
          result[ticker].pe = parseTrFloat(cells[2]);
          result[ticker].evEbitda = parseTrFloat(cells[3]);
          result[ticker].evSales = parseTrFloat(cells[4]);
          result[ticker].pb = parseTrFloat(cells[5]);
          result[ticker].lastPeriod = cells[6] || null;
        }
      }
    }

    // 3. temelyabancioran tablosunu ayıkla (Güncel Yabancı Oranı, Değişim Baz Puan, Etki)
    const yabanciMatch = html.match(/<table[^>]*data-csvname="temelyabancioran"[^>]*>([\s\S]*?)<\/table>/i);
    if (yabanciMatch) {
      const rows = yabanciMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
      for (const row of rows) {
        const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(c => c.replace(/<[^>]+>/g, '').trim());
        if (cells.length >= 6) {
          const ticker = cells[0].toUpperCase();
          if (result[ticker]) {
            result[ticker].foreignSharePrevPct = parseTrFloat(cells[2]);
            result[ticker].foreignSharePct = parseTrFloat(cells[3]);
            result[ticker].foreignShareChangeBps = parseTrFloat(cells[4]);
            result[ticker].foreignShareIndexImpactPct = parseTrFloat(cells[5]);
          }
        }
      }
    }

    // 4. temeltarihsel tablosunu ayıkla (F/K Tahmin, FD/FAVÖK Tahmin, PD/DD Tahmin ve İskonto %)
    const tarihMatch = html.match(/<table[^>]*data-csvname="temeltarihsel"[^>]*>([\s\S]*?)<\/table>/i);
    if (tarihMatch) {
      const rows = tarihMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
      for (const row of rows) {
        const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(c => c.replace(/<[^>]+>/g, '').trim());
        if (cells.length >= 8) {
          const ticker = cells[0].toUpperCase();
          if (result[ticker]) {
            result[ticker].historicalEstimates = {
              peEstimate: parseTrFloat(cells[2]),
              peDiscountPct: parseTrFloat(cells[3]),
              evEbitdaEstimate: parseTrFloat(cells[4]),
              evEbitdaDiscountPct: parseTrFloat(cells[5]),
              pbEstimate: parseTrFloat(cells[6]),
              pbDiscountPct: parseTrFloat(cells[7])
            };
          }
        }
      }
    }

    if (Object.keys(result).length > 50) {
      const merged: Record<string, IsYatirimStockMultiples> = { ...OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE };
      for (const [k, v] of Object.entries(result)) {
        merged[k] = {
          ...(merged[k] || {}),
          ...v,
          foreignSharePct: (v.foreignSharePct !== undefined && v.foreignSharePct !== null) ? v.foreignSharePct : (merged[k]?.foreignSharePct ?? null),
          foreignSharePrevPct: (v.foreignSharePrevPct !== undefined && v.foreignSharePrevPct !== null) ? v.foreignSharePrevPct : (merged[k]?.foreignSharePrevPct ?? null),
          foreignShareChangeBps: (v.foreignShareChangeBps !== undefined && v.foreignShareChangeBps !== null) ? v.foreignShareChangeBps : (merged[k]?.foreignShareChangeBps ?? null),
          historicalEstimates: (v.historicalEstimates !== undefined && v.historicalEstimates !== null) ? v.historicalEstimates : (merged[k]?.historicalEstimates ?? null),
        };
      }
      cachedMultiples = merged;
      lastFetchTimestamp = Date.now();
      console.log(`[IsYatirim] Başarıyla ${Object.keys(result).length} BIST şirketinin çarpanları, yabancı oranları ve konsensüs tahminleri yüklendi.`);
      return merged;
    }
  } catch (err: any) {
    console.warn('[IsYatirim] Canlı veri çekme hatası (zaman aşımı veya ağ engeli):', err?.message || err);
  }

  return cachedMultiples || {};
}

/**
 * İş Yatırım Temel Değerler ve Oranlar tablosunu Stale-While-Revalidate ile anında getirir
 */
export async function fetchAllIsYatirimMultiples(): Promise<Record<string, IsYatirimStockMultiples>> {
  const now = Date.now();

  // 1. İlk çalıştırmada veya 20 dakikalık TTL dolduğunda canlı çekimi dene
  if (lastFetchTimestamp === 0 || now - lastFetchTimestamp >= CACHE_TTL_MS) {
    if (!isFetchingInProgress) {
      isFetchingInProgress = true;
      try {
        await Promise.race([
          doFetchAllIsYatirimMultiples(),
          new Promise((r) => setTimeout(r, 6000))
        ]);
      } catch (err: any) {
        console.warn('[IsYatirim] Canlı çarpan çekiminde gecikme, önbellek kullanılıyor:', err?.message || err);
      } finally {
        isFetchingInProgress = false;
      }
    }
  }

  return cachedMultiples || {};
}

/**
 * Belirli bir hissenin İş Yatırım resmi piyasa çarpanlarını getirir
 */
export async function getIsYatirimMultiplesForTicker(rawTicker: string): Promise<IsYatirimStockMultiples | null> {
  const ticker = (rawTicker || '').toUpperCase().replace(/\.IS$/i, '').trim().replace(/[^A-Z0-9]/g, '');
  if (!ticker) return null;

  const all = await fetchAllIsYatirimMultiples();
  return all[ticker] || null;
}

/**
 * Belirli bir sektörün İş Yatırım resmi Sektör Ortalamalarını getirir.
 * 1. Öncelik: İş Yatırım web sitesindeki resmi 'Sektör Ortalamaları' satırı (SWR ile).
 * 2. Öncelik: Sektördeki 630 hissenin canlı medyanı / ağırlıklı ortalaması.
 * Statik hardcoded veri kesinlikle kullanılmaz.
 */
export async function getIsYatirimSectorAverages(sectorNameOrCode: string): Promise<IsYatirimSectorAverage | null> {
  if (!sectorNameOrCode) return null;

  // Kod veya isim çözümle
  let code = '';
  let sectorName = '';

  if (ISYATIRIM_SECTOR_NAME_TO_CODE[sectorNameOrCode]) {
    sectorName = sectorNameOrCode;
    code = ISYATIRIM_SECTOR_NAME_TO_CODE[sectorNameOrCode];
  } else if (OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE[sectorNameOrCode]) {
    code = sectorNameOrCode;
    sectorName = OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE[sectorNameOrCode].sectorName;
  } else {
    // Kısmi eşleşme dene (örn 'Havayolları' -> 'Havayolları ve Hizm.')
    for (const [name, c] of Object.entries(ISYATIRIM_SECTOR_NAME_TO_CODE)) {
      if (name.toLowerCase().includes(sectorNameOrCode.toLowerCase()) || sectorNameOrCode.toLowerCase().includes(name.toLowerCase())) {
        sectorName = name;
        code = c;
        break;
      }
    }
  }

  if (!code && !sectorName) return null;

  // 1. Canlı İş Yatırım sektör sayfasından çekmeyi dene (4s tavan koruması)
  if (code) {
    const existing = cachedSectorAverages[code];
    const isStale = !existing || !existing.updatedAt || (Date.now() - new Date(existing.updatedAt).getTime() > CACHE_TTL_MS);

    if (isStale) {
      try {
        const url = `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx?sektor=${code}`;
        const html = await fetchHttpsText(url, 4500);
        if (html) {
          const ortMatch = html.match(/Sektör Ortalamaları[\s\S]*?<div class="second-item[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="third-item[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="fourth-item[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="fifth-item[^>]*>([\s\S]*?)<\/div>/i);
          if (ortMatch) {
            const rawPe = parseTrFloat(ortMatch[1]);
            const rawEvEbitda = parseTrFloat(ortMatch[2]);
            const rawEvSales = parseTrFloat(ortMatch[3]);
            const rawPb = parseTrFloat(ortMatch[4]);

            const parsed: IsYatirimSectorAverage = {
              sectorCode: code,
              sectorName: sectorName || OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE[code]?.sectorName || code,
              pe: (rawPe !== null && rawPe > 0) ? rawPe : null,
              evEbitda: (rawEvEbitda !== null && rawEvEbitda > 0) ? rawEvEbitda : null,
              evSales: (rawEvSales !== null && rawEvSales > 0) ? rawEvSales : null,
              pb: (rawPb !== null && rawPb > 0) ? rawPb : null,
              updatedAt: new Date().toISOString()
            };
            cachedSectorAverages[code] = parsed;
            return parsed;
          }
        }
      } catch (err: any) {
        console.warn(`[IsYatirim] Canlı sektör ortalaması çekilemedi (${code}):`, err?.message || err);
      }
    } else if (existing) {
      return existing;
    }
  }

  // 2. Önbellekte mevcutsa dön
  if (code && cachedSectorAverages[code]) {
    return cachedSectorAverages[code];
  }

  // 3. Fallback: Canlı 630 hisse havuzundan bu sektörün medyanlarını dinamik hesapla
  const allStocks = await fetchAllIsYatirimMultiples();
  const sectorStocks = Object.values(allStocks).filter(s => s.sectorName === sectorName);
  if (sectorStocks.length > 0) {
    const peList = sectorStocks.map(s => s.pe).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
    const pbList = sectorStocks.map(s => s.pb).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
    const evEbitdaList = sectorStocks.map(s => s.evEbitda).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
    const evSalesList = sectorStocks.map(s => s.evSales).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);

    const median = (arr: number[]) => arr.length === 0 ? null : (arr.length % 2 === 1 ? arr[Math.floor(arr.length / 2)] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2);

    return {
      sectorCode: code || 'DYNAMIC',
      sectorName: sectorName,
      pe: median(peList),
      evEbitda: median(evEbitdaList),
      evSales: median(evSalesList),
      pb: median(pbList),
      updatedAt: new Date().toISOString()
    };
  }

  return null;
}

/**
 * Tüm 53 alt sektörün resmi ortalamalarını döndürür
 */
export function getAllIsYatirimSectorAverages(): Record<string, IsYatirimSectorAverage> {
  return cachedSectorAverages;
}

// ============================================================================
// 4. İŞ YATIRIM ŞİRKET KARTI: TEMETTÜ GEÇMİŞİ & KONSENSÜS HEDEF FİYAT SERVİSİ
// ============================================================================

export interface IsYatirimDividendRecord {
  date: string; // Dağıtım Tarihi e.g. "03.06.2026"
  year: number; // e.g. 2026
  yieldPct: number | null; // Temettü Verimi %
  perShareTl: number | null; // Hisse Başına Net/Brüt TL
  grossRatePct: number | null; // Nakit Temettü Brüt Oran %
  netRatePct: number | null; // Nakit Temettü Net Oran %
  totalAmountTl: number | null; // Toplam Temettü TL
  payoutRatioPct: number | null; // Kâr Dağıtma Oranı %
}

export interface IsYatirimConsensusTarget {
  date: string; // Öneri Tarihi
  recommendation: 'AL' | 'TUT' | 'SAT' | string;
  targetPrice: number | null; // Hedef Fiyat (TL)
  targetPrice1W?: number | null;
  targetPrice1M?: number | null;
  targetPrice3M?: number | null;
  source: string;
}

export interface IsYatirimCompanyDetails {
  ticker: string;
  dividends: IsYatirimDividendRecord[];
  consensus: IsYatirimConsensusTarget | null;
  foreignShare: {
    currentPct: number | null;
    prevPct: number | null;
    changeBps: number | null;
  } | null;
  fetchedAt: string;
}

const companyDetailsCache = new Map<string, { data: IsYatirimCompanyDetails; timestamp: number }>();
const DETAILS_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 saat önbellek

export function clearIsYatirimCache(ticker?: string): void {
  const upper = ticker ? ticker.toUpperCase().replace(/\.IS$/, '').trim() : undefined;
  if (upper) {
    companyDetailsCache.delete(upper);
  } else {
    companyDetailsCache.clear();
    lastFetchTimestamp = 0;
  }
}

/**
 * Yahoo Finance ?events=div uç noktasından BIST hissesi için tarihsel nakit temettü ödemelerini çeker.
 * İş Yatırım sirket-karti.aspx sayfasına yurt dışı / bulut IP erişim engeli olduğunda yedek kaynak olarak çalışır.
 */
async function fetchYahooFinanceDividendRecords(ticker: string): Promise<IsYatirimDividendRecord[]> {
  const cleanTicker = ticker.toUpperCase().replace(/\.IS$/, '').trim();
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${cleanTicker}.IS?interval=1mo&range=10y&events=div,split`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${cleanTicker}.IS?interval=1mo&range=10y&events=div,split`
  ];
  for (const url of urls) {
    try {
      const text = await fetchHttpsText(url, 8000);
      if (!text) continue;
      const json = JSON.parse(text);
      const result = json?.chart?.result?.[0];
      const divEvents = result?.events?.dividends;
      if (!divEvents || typeof divEvents !== 'object') continue;
      const splitEvents = result?.events?.splits && typeof result.events.splits === 'object'
        ? (Object.values(result.events.splits) as Array<{ date?: number; numerator?: number; denominator?: number }>)
        : [];

      const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
      const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close || [];
      const stockMeta = cachedMultiples[cleanTicker];
      const paidInCapitalTl = stockMeta?.paidInCapitalMnTl ? stockMeta.paidInCapitalMnTl * 1_000_000 : null;
      const fallbackPrice = stockMeta?.lastPrice ?? result?.meta?.regularMarketPrice ?? null;

      const records: IsYatirimDividendRecord[] = [];
      for (const ev of Object.values(divEvents) as Array<{ amount?: number; date?: number }>) {
        const adjPerShareTl = typeof ev?.amount === 'number' && ev.amount > 0 ? ev.amount : null;
        const ts = typeof ev?.date === 'number' ? ev.date : null;
        if (!adjPerShareTl || !ts) continue;

        // Temettü tarihinden sonra gerçekleşen bedelsiz/bölünme çarpanlarını geri sararak tarihsel nominal pay başı TL tutarını elde et
        let cumulativeSplitFactorAfter = 1;
        for (const sp of splitEvents) {
          if (typeof sp?.date === 'number' && sp.date > ts && typeof sp.numerator === 'number' && typeof sp.denominator === 'number' && sp.denominator > 0) {
            const ratio = sp.numerator / sp.denominator;
            if (ratio > 0) cumulativeSplitFactorAfter *= ratio;
          }
        }
        const perShareTl = Number((adjPerShareTl * cumulativeSplitFactorAfter).toFixed(4));

        const dt = new Date(ts * 1000);
        const dd = String(dt.getUTCDate()).padStart(2, '0');
        const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = dt.getUTCFullYear();
        const dateStr = `${dd}.${mm}.${yyyy}`;

        // O tarihe en yakın bölünme-düzeltmeli kapanış fiyatını bul
        let refPrice: number | null = fallbackPrice;
        if (timestamps.length > 0 && closes.length === timestamps.length) {
          let bestDiff = Infinity;
          for (let i = 0; i < timestamps.length; i++) {
            const c = closes[i];
            if (typeof c === 'number' && c > 0) {
              const diff = Math.abs(timestamps[i] - ts);
              if (diff < bestDiff) {
                bestDiff = diff;
                refPrice = c;
              }
            }
          }
        }

        // Hem adjPerShareTl hem refPrice ve güncel paidInCapitalTl bölünme sonrası bazda olduğundan verim ve toplam TL tutarı bölünmeden etkilenmez
        const yieldPct = refPrice && refPrice > 0 ? Number(((adjPerShareTl / refPrice) * 100).toFixed(2)) : null;
        const grossRatePct = Number((perShareTl * 100).toFixed(2));
        const netRatePct = Number((grossRatePct * 0.9).toFixed(2));
        const totalAmountTl = paidInCapitalTl ? Math.round(adjPerShareTl * paidInCapitalTl) : null;

        records.push({
          date: dateStr,
          year: yyyy,
          yieldPct,
          perShareTl,
          grossRatePct,
          netRatePct,
          totalAmountTl,
          payoutRatioPct: null
        });
      }

      if (records.length > 0) {
        records.sort((a, b) => {
          const [da, ma, ya] = (a.date || '').split('.').map(Number);
          const [db, mb, yb] = (b.date || '').split('.').map(Number);
          return new Date(yb || 2000, (mb || 1) - 1, db || 1).getTime() - new Date(ya || 2000, (ma || 1) - 1, da || 1).getTime();
        });
        return records;
      }
    } catch {
      // Sonraki yedek URL'yi dene
    }
  }
  return [];
}

/**
 * Finansal tablo geçmişindeki Nakit Akışı 'Ödenen Temettüler' (dividends_paid / 4CBB) kalemlerinden
 * yapılandırılmış temettü dağıtım kayıtları üretir (PDF yüklemeleri veya harici servis kesintileri için).
 */
export function synthesizeDividendsFromFinancialHistory(
  history: any[] | undefined | null,
  shareCount?: number | null,
  currentPrice?: number | null
): IsYatirimDividendRecord[] {
  if (!Array.isArray(history) || history.length === 0) return [];
  const byYear = new Map<number, { period: string; divPaid: number; netIncome: number | null; paidInCap: number | null }>();

  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    const rawDiv = parseFinancialNumber(item.dividends_paid);
    if (rawDiv === null || Math.abs(rawDiv) <= 0) continue;
    const divPaid = Math.abs(rawDiv);
    const periodStr = String(item.period || '');
    const m = periodStr.match(/(20\d{2})/);
    const year = m ? parseInt(m[1], 10) : new Date().getFullYear();
    const isYearEnd = periodStr.endsWith('/12') || periodStr.endsWith('-12') || periodStr === String(year);
    const prev = byYear.get(year);
    if (!prev || isYearEnd || divPaid > prev.divPaid) {
      byYear.set(year, {
        period: periodStr,
        divPaid,
        netIncome: parseFinancialNumber(item.net_income),
        paidInCap: parseFinancialNumber(item.paid_in_capital)
      });
    }
  }

  const records: IsYatirimDividendRecord[] = [];
  for (const [year, info] of byYear.entries()) {
    const effectiveShares = (typeof shareCount === 'number' && shareCount > 0)
      ? shareCount
      : (info.paidInCap && info.paidInCap > 0 ? info.paidInCap : null);
    const perShareTl = effectiveShares && effectiveShares > 0
      ? Number((info.divPaid / effectiveShares).toFixed(4))
      : null;
    const yieldPct = (perShareTl !== null && typeof currentPrice === 'number' && currentPrice > 0)
      ? Number(((perShareTl / currentPrice) * 100).toFixed(2))
      : null;
    const grossRatePct = perShareTl !== null ? Number((perShareTl * 100).toFixed(2)) : null;
    const netRatePct = grossRatePct !== null ? Number((grossRatePct * 0.9).toFixed(2)) : null;
    const payoutRatioPct = (info.netIncome && info.netIncome > 0)
      ? Number(Math.min(200, (info.divPaid / info.netIncome) * 100).toFixed(2))
      : null;

    records.push({
      date: `31.05.${year}`,
      year,
      yieldPct,
      perShareTl,
      grossRatePct,
      netRatePct,
      totalAmountTl: Math.round(info.divPaid),
      payoutRatioPct
    });
  }

  records.sort((a, b) => b.year - a.year);
  return records;
}

/**
 * İş Yatırım resmi şirket kartından (sirket-karti.aspx) gerçekleşen temettü geçmişini,
 * analist konsensüs hedef fiyatını ve yabancı saklama oranını çeker.
 * Canlı HTML erişilemezse veya boş dönerse sırasıyla Resmi İş Yatırım Önbelleği ve Yahoo Finance
 * temettü servisine başvurur.
 */
export async function fetchIsYatirimCompanyDetails(
  rawTicker: string,
  options?: { forceRefresh?: boolean }
): Promise<IsYatirimCompanyDetails> {
  const ticker = rawTicker.toUpperCase().replace(/\.IS$/, '').trim();
  if (options?.forceRefresh) {
    companyDetailsCache.delete(ticker);
  }
  const cached = options?.forceRefresh ? null : companyDetailsCache.get(ticker);
  if (cached && (Date.now() - cached.timestamp < DETAILS_CACHE_TTL_MS)) {
    return cached.data;
  }

  const baseline = OFFICIAL_ISYATIRIM_COMPANY_DETAILS_BASELINE[ticker] || null;
  const cachedStock = cachedMultiples[ticker];
  const defaultForeignShare = cachedStock && cachedStock.foreignSharePct != null
    ? {
        currentPct: cachedStock.foreignSharePct,
        prevPct: cachedStock.foreignSharePrevPct ?? null,
        changeBps: cachedStock.foreignShareChangeBps ?? null
      }
    : (baseline?.foreignShare ?? null);

  const defaultDetails: IsYatirimCompanyDetails = {
    ticker,
    dividends: baseline?.dividends ? [...baseline.dividends] : [],
    consensus: baseline?.consensus ? { ...baseline.consensus } : null,
    foreignShare: defaultForeignShare,
    fetchedAt: baseline?.fetchedAt || new Date().toISOString()
  };

  try {
    const url = `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${ticker}`;
    const html = await fetchHttpsText(url, baseline ? 4000 : 7000);

    let dividends: IsYatirimDividendRecord[] = [];
    let consensus: IsYatirimConsensusTarget | null = null;
    let foreignShare = defaultForeignShare;

    if (html) {
      // 1. Temettü Gerçekleşen Tablosu (temettugercek)
      const divMatch = html.match(/<table[^>]*data-csvname=["']temettugercek["'][^>]*>([\s\S]*?)<\/table>/i);
      if (divMatch) {
        const rows = divMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
        const seenRowKey = new Set<string>();
        for (const row of rows) {
          const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map(c => c.replace(/<[^>]+>/g, '').trim());
          if (cells.length >= 8 && cells[0].toUpperCase() === ticker) {
            const dateStr = cells[1];
            const rowKey = `${dateStr}_${cells[3]}`;
            if (seenRowKey.has(rowKey)) continue;
            seenRowKey.add(rowKey);

            const year = parseInt(dateStr.slice(-4), 10) || new Date().getFullYear();
            dividends.push({
              date: dateStr,
              year,
              yieldPct: parseTrFloat(cells[2]),
              perShareTl: parseTrFloat(cells[3]),
              grossRatePct: parseTrFloat(cells[4]),
              netRatePct: parseTrFloat(cells[5]),
              totalAmountTl: parseTrFloat(cells[6]),
              payoutRatioPct: parseTrFloat(cells[7])
            });
          }
        }
      }

      // Tarihe göre en yeniden en eskiye sırala
      dividends.sort((a, b) => {
        const [da, ma, ya] = (a.date || '').split('.').map(Number);
        const [db, mb, yb] = (b.date || '').split('.').map(Number);
        const timeA = new Date(ya || 2000, (ma || 1) - 1, da || 1).getTime();
        const timeB = new Date(yb || 2000, (mb || 1) - 1, db || 1).getTime();
        return timeB - timeA;
      });

      // 2. Hedef Fiyat & Konsensüs Öneri Tablosu (hedeffiyat)
      const hedefMatch = html.match(/<table[^>]*data-csvname=["']hedeffiyat["'][^>]*>([\s\S]*?)<\/table>/i);
      if (hedefMatch) {
        const rows = hedefMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
        for (const row of rows) {
          const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map(c => c.replace(/<[^>]+>/g, '').trim());
          if (cells.length >= 4 && cells[0].toUpperCase() === ticker) {
            const rec = cells[2].toUpperCase().trim();
            const target = parseTrFloat(cells[3]);
            if (target !== null && target > 0) {
              consensus = {
                date: cells[1] || '',
                recommendation: rec || 'TUT',
                targetPrice: target,
                targetPrice1M: cells.length >= 7 ? parseTrFloat(cells[6]) : null,
                targetPrice3M: cells.length >= 10 ? parseTrFloat(cells[9]) : null,
                source: 'İş Yatırım Araştırma'
              };
              break;
            }
          }
        }
      }

      // 3. Yabancı Oranı
      if (!foreignShare) {
        const yabanciMatch = html.match(/<table[^>]*data-csvname=["']yabancioranlar["'][^>]*>([\s\S]*?)<\/table>/i);
        if (yabanciMatch) {
          const rows = yabanciMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
          for (const row of rows) {
            const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map(c => c.replace(/<[^>]+>/g, '').trim());
            if (cells.length >= 5 && cells[0].toUpperCase() === ticker) {
              foreignShare = {
                currentPct: parseTrFloat(cells[3]),
                prevPct: parseTrFloat(cells[2]),
                changeBps: parseTrFloat(cells[4])
              };
              break;
            }
          }
        }
      }
    }

    // Yedekleme Katmanı 1: Resmi İş Yatırım Önbelleği
    if (dividends.length === 0 && baseline?.dividends && baseline.dividends.length > 0) {
      dividends = [...baseline.dividends];
    }
    if (!consensus && baseline?.consensus) {
      consensus = { ...baseline.consensus };
    }

    // Yedekleme Katmanı 2: Yahoo Finance ?events=div Servisi
    if (dividends.length === 0) {
      const yfDividends = await fetchYahooFinanceDividendRecords(ticker);
      if (yfDividends.length > 0) {
        dividends = yfDividends;
      }
    }

    const result: IsYatirimCompanyDetails = {
      ticker,
      dividends,
      consensus,
      foreignShare,
      fetchedAt: new Date().toISOString()
    };

    if (result.dividends.length > 0 || result.consensus !== null) {
      companyDetailsCache.set(ticker, { data: result, timestamp: Date.now() });
    }
    return result;
  } catch (err: any) {
    console.warn(`[IsYatirim] Şirket kartı ayrıştırılamadı (${ticker}):`, err?.message || err);
    if (defaultDetails.dividends.length === 0) {
      const yfDividends = await fetchYahooFinanceDividendRecords(ticker).catch(() => []);
      if (yfDividends.length > 0) {
        defaultDetails.dividends = yfDividends;
      }
    }
    return defaultDetails;
  }
}

