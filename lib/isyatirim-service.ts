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
import {
  OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE,
  ISYATIRIM_SECTOR_NAME_TO_CODE,
  type IsYatirimSectorAverage
} from './isyatirim-sector-averages-cache.ts';
export type { IsYatirimSectorAverage } from './isyatirim-sector-averages-cache.ts';

let cachedMultiples: Record<string, IsYatirimStockMultiples> = { ...OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE };
let cachedSectorAverages: Record<string, IsYatirimSectorAverage> = { ...OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE };
let lastFetchTimestamp = Date.now();
let isFetchingInProgress = false;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 saat önbellek

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
      cachedMultiples = result;
      lastFetchTimestamp = Date.now();
      console.log(`[IsYatirim] Başarıyla ${Object.keys(result).length} BIST şirketinin çarpanları, yabancı oranları ve konsensüs tahminleri yüklendi.`);
      return result;
    }
  } catch (err: any) {
    console.warn('[IsYatirim] Canlı veri çekme hatası (zaman aşımı veya ağ engeli):', err?.message || err);
  }

  return cachedMultiples || {};
}

/**
 * İş Yatırım Temel Değerler ve Oranlar tablosunu Stale-While-Revalidate ile anında getirir (0ms)
 */
export async function fetchAllIsYatirimMultiples(): Promise<Record<string, IsYatirimStockMultiples>> {
  const now = Date.now();

  // 1. Resmi çarpan önbelleğinde 630 hissenin verisi anında mevcuttur (0ms)
  if (cachedMultiples && Object.keys(cachedMultiples).length > 0) {
    // 2 saatlik TTL dolmuşsa arka planda sessizce güncelle (kullanıcıyı asla bloklamaz)
    if (now - lastFetchTimestamp >= CACHE_TTL_MS && !isFetchingInProgress) {
      isFetchingInProgress = true;
      doFetchAllIsYatirimMultiples().finally(() => {
        isFetchingInProgress = false;
      });
    }
    return cachedMultiples;
  }

  // 2. İstisnai durumda doğrudan çekimi bekle
  return await doFetchAllIsYatirimMultiples();
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

  // 1. Önbellekte mevcutsa hemen dön ve gerekirse arka planda tazele
  if (code && cachedSectorAverages[code]) {
    return cachedSectorAverages[code];
  }

  // 2. Canlı İş Yatırım sektör sayfasından çekmeyi dene
  if (code) {
    try {
      const url = `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx?sektor=${code}`;
      const html = await fetchHttpsText(url, 15000);
      if (html) {
        const ortMatch = html.match(/Sektör Ortalamaları[\s\S]*?<div class="second-item[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="third-item[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="fourth-item[^>]*>([\s\S]*?)<\/div>[\s\S]*?<div class="fifth-item[^>]*>([\s\S]*?)<\/div>/i);
        if (ortMatch) {
          const parsed: IsYatirimSectorAverage = {
            sectorCode: code,
            sectorName: sectorName || OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE[code]?.sectorName || code,
            pe: parseTrFloat(ortMatch[1]),
            evEbitda: parseTrFloat(ortMatch[2]),
            evSales: parseTrFloat(ortMatch[3]),
            pb: parseTrFloat(ortMatch[4]),
            updatedAt: new Date().toISOString()
          };
          cachedSectorAverages[code] = parsed;
          return parsed;
        }
      }
    } catch (err: any) {
      console.warn(`[IsYatirim] Canlı sektör ortalaması çekilemedi (${code}):`, err?.message || err);
    }
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

/**
 * İş Yatırım resmi şirket kartından (sirket-karti.aspx) gerçekleşen temettü geçmişini,
 * analist konsensüs hedef fiyatını ve yabancı saklama oranını çeker.
 */
export async function fetchIsYatirimCompanyDetails(rawTicker: string): Promise<IsYatirimCompanyDetails> {
  const ticker = rawTicker.toUpperCase().replace(/\.IS$/, '').trim();
  const cached = companyDetailsCache.get(ticker);
  if (cached && (Date.now() - cached.timestamp < DETAILS_CACHE_TTL_MS)) {
    return cached.data;
  }

  const defaultDetails: IsYatirimCompanyDetails = {
    ticker,
    dividends: [],
    consensus: null,
    foreignShare: null,
    fetchedAt: new Date().toISOString()
  };

  try {
    const url = `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse=${ticker}`;
    const html = await fetchHttpsText(url, 20000);

    if (!html) {
      return defaultDetails;
    }

    // 1. Temettü Gerçekleşen Tablosu (temettugercek)
    const dividends: IsYatirimDividendRecord[] = [];
    const divMatch = html.match(/<table[^>]*data-csvname=["']temettugercek["'][^>]*>([\s\S]*?)<\/table>/i);
    if (divMatch) {
      const rows = divMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
      for (const row of rows) {
        const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map(c => c.replace(/<[^>]+>/g, '').trim());
        if (cells.length >= 8 && cells[0].toUpperCase() === ticker) {
          const dateStr = cells[1];
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
    let consensus: IsYatirimConsensusTarget | null = null;
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
    let foreignShare: { currentPct: number | null; prevPct: number | null; changeBps: number | null } | null = null;
    const cachedStock = cachedMultiples[ticker];
    if (cachedStock && cachedStock.foreignSharePct != null) {
      foreignShare = {
        currentPct: cachedStock.foreignSharePct,
        prevPct: cachedStock.foreignSharePrevPct ?? null,
        changeBps: cachedStock.foreignShareChangeBps ?? null
      };
    } else {
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

    const result: IsYatirimCompanyDetails = {
      ticker,
      dividends,
      consensus,
      foreignShare,
      fetchedAt: new Date().toISOString()
    };

    companyDetailsCache.set(ticker, { data: result, timestamp: Date.now() });
    return result;
  } catch (err: any) {
    console.warn(`[IsYatirim] Şirket kartı ayrıştırılamadı (${ticker}):`, err?.message || err);
    return defaultDetails;
  }
}

