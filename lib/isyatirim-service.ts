/**
 * İş Yatırım Resmi Web Portalı Üzerinden Canlı BIST Temel Değerler ve Çarpanlar Servisi
 * Kaynak: https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx
 */

import { parseFinancialNumber } from './valuation.ts';

export interface IsYatirimStockMultiples {
  ticker: string;
  name: string;
  sectorName: string;
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
  updatedAt: string;
}

let cachedMultiples: Record<string, IsYatirimStockMultiples> | null = null;
let lastFetchTimestamp = 0;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 saat önbellek

/**
 * Türkçe ondalık/binlik formatlı sayı stringini float'a çevirir (örn: '402.960,0' -> 402960.0)
 */
function parseTrFloat(valStr: string | null | undefined): number | null {
  if (!valStr) return null;
  const clean = String(valStr).trim();
  if (clean === '-' || clean === '—' || clean === '–' || clean === 'A/D' || clean === 'N/A' || clean === 'n/a' || clean === 'null' || clean === '') return null;
  return parseFinancialNumber(clean);
}

import https from 'node:https';

const isYatirimHttpsAgent = new https.Agent({
  rejectUnauthorized: false, // Yerel antivirüs veya kurumsal proxy SSL interception toleransı
  keepAlive: true,
  timeout: 7500
});

async function fetchHttpsText(urlStr: string, timeoutMs = 7500): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = https.get(urlStr, {
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
          return resolve(null);
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * İş Yatırım Temel Değerler ve Oranlar tablosunu çeker ve tüm hisseleri ayrıştırır
 */
export async function fetchAllIsYatirimMultiples(): Promise<Record<string, IsYatirimStockMultiples>> {
  const now = Date.now();
  if (cachedMultiples && (now - lastFetchTimestamp < CACHE_TTL_MS)) {
    return cachedMultiples;
  }

  const url = 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx';
  
  try {
    let html = await fetchHttpsText(url, 7500);
    if (!html) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: AbortSignal.timeout(6000),
        next: { revalidate: 3600 }
      });
      if (res.ok) {
        html = await res.text();
      }
    }

    if (!html) {
      console.warn('[IsYatirim] Canlı çarpan tablosu çekilemedi, önbellek kullanılıyor.');
      return cachedMultiples || {};
    }
    const result: Record<string, IsYatirimStockMultiples> = {};

    // 1. temelozet tablosunu ayıkla (Piyasa Değeri, Halka Açıklık, Ödenmiş Sermaye)
    // <table ... data-csvname="temelozet" ...>
    const ozetMatch = html.match(/<table[^>]*data-csvname="temelozet"[^>]*>([\s\S]*?)<\/table>/i);
    if (ozetMatch) {
      const rows = ozetMatch[1].match(/<tr[\s\S]*?<\/tr>/gi) || [];
      for (const row of rows) {
        const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(c => c.replace(/<[^>]+>/g, '').trim());
        if (cells.length >= 8) {
          const ticker = cells[0].toUpperCase();
          result[ticker] = {
            ticker,
            name: cells[1],
            sectorName: cells[2],
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
    // <table ... data-csvname="temelfinansal" ...>
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

    if (Object.keys(result).length > 50) {
      cachedMultiples = result;
      lastFetchTimestamp = now;
      console.log(`[IsYatirim] Başarıyla ${Object.keys(result).length} BIST şirketinin çarpanları yüklendi.`);
      return result;
    }
  } catch (err: any) {
    console.warn('[IsYatirim] Canlı veri çekme hatası (zaman aşımı veya ağ engeli):', err?.message || err);
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
