import https from 'node:https';
import { OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE } from './isyatirim-multiples-cache.ts';
import { getIsYatirimMultiplesForTicker } from './isyatirim-service.ts';

const cockpitHttpsAgent = new https.Agent({
  rejectUnauthorized: true,
  keepAlive: true,
  timeout: 12000
});

export interface CockpitIndexQuote {
  symbol: string;
  label: string;
  price: number;
  prevClose: number;
  changePct: number;
  decimals: number;
}

export interface CockpitStockSummary {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  high: number | null;
  low: number | null;
  marketCapTl: number | null;
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  perf: {
    w1: number | null;
    m1: number | null;
    m3: number | null;
    m6: number | null;
    ytd: number | null;
    y1: number | null;
  };
}

export interface CockpitSectorPerf {
  sector: string;
  avgChangePct: number;
  stockCount: number;
  leaderTicker: string;
  leaderChangePct: number;
}

export interface CockpitAgendaEvent {
  id: string;
  title: string;
  country: 'TR' | 'US';
  dateIso: string;
  dayNum: string;
  monthTr: string;
  timeTr: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  importance: number;
}

export interface CockpitOverviewData {
  updatedAt: string;
  isDelayed: boolean;
  isDegraded?: boolean;
  indices: CockpitIndexQuote[];
  allTickers: Array<{ ticker: string; name: string; sector: string; price: number; changePct: number }>;
  quotesMap: Record<string, CockpitStockSummary>;
  topGainers: CockpitStockSummary[];
  topLosers: CockpitStockSummary[];
  topSectors: CockpitSectorPerf[];
  agenda: CockpitAgendaEvent[];
}

export type CockpitChartRange = '1G' | '1H' | '1A' | '1Y';

export interface CockpitCardData {
  ticker: string;
  name: string;
  sector: string;
  range: CockpitChartRange;
  price: number;
  prevClose: number;
  changePct: number;
  dayHigh: number | null;
  dayLow: number | null;
  floorPrice: number | null;
  ceilingPrice: number | null;
  points: Array<{ t: string; v: number }>;
  multiples: {
    pe: number | null;
    pb: number | null;
    evEbitda: number | null;
    marketCapTl: number | null;
  };
  perf: {
    w1: number | null;
    m1: number | null;
    m3: number | null;
    m6: number | null;
    ytd: number | null;
    y1: number | null;
  };
  updatedAt: string;
}

const TV_SECTOR_TR: Record<string, string> = {
  'Finance': 'Finans & Bankacılık',
  'Producer Manufacturing': 'Sanayi & İmalat',
  'Consumer Non-Durables': 'Dayanıksız Tüketim',
  'Consumer Durables': 'Dayanıklı Tüketim',
  'Utilities': 'Enerji & Altyapı',
  'Retail Trade': 'Perakende Ticaret',
  'Process Industries': 'Kimya & Temel Madde',
  'Non-Energy Minerals': 'Maden & Metal',
  'Transportation': 'Ulaştırma & Havacılık',
  'Technology Services': 'Yazılım & Teknoloji',
  'Electronic Technology': 'Elektronik & Savunma',
  'Commercial Services': 'Ticari Hizmetler',
  'Consumer Services': 'Turizm & Hizmet',
  'Communications': 'Telekomünikasyon',
  'Industrial Services': 'Endüstriyel Hizmetler',
  'Distribution Services': 'Toptan Dağıtım',
  'Health Technology': 'Sağlık & İlaç',
  'Health Services': 'Sağlık Hizmetleri',
  'Energy Minerals': 'Enerji & Petrol',
  'Miscellaneous': 'Holding & Diğer'
};

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function httpsJsonRequest(
  urlStr: string,
  opts: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {}
): Promise<any> {
  return new Promise((resolve) => {
    let settled = false;
    let req: http.ClientRequest | null = null;
    const timeoutMs = opts.timeoutMs ?? 9000;

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
      const u = new URL(urlStr);
      const headers: Record<string, string | number> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        ...(opts.headers || {})
      };
      if (opts.body) {
        headers['Content-Length'] = Buffer.byteLength(opts.body);
      }
      req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: opts.method || 'GET',
          agent: cockpitHttpsAgent,
          headers
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              done(null);
              return;
            }
            try {
              done(JSON.parse(data));
            } catch {
              done(null);
            }
          });
        }
      );
      req.on('error', () => done(null));
      if (opts.body) req.write(opts.body);
      req.end();
    } catch {
      done(null);
    }
  });
}

import type * as http from 'node:http';

function safeNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

async function fetchYahooIndex(symbol: string, label: string, decimals = 2): Promise<CockpitIndexQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const json = await httpsJsonRequest(url, { timeoutMs: 7000 });
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return null;

  const closes: number[] = (result?.indicators?.quote?.[0]?.close || []).filter((x: any) => typeof x === 'number' && Number.isFinite(x));
  const price = safeNum(meta.regularMarketPrice) ?? (closes.length > 0 ? closes[closes.length - 1] : null);
  const prevClose = safeNum(meta.chartPreviousClose) ?? safeNum(meta.previousClose) ?? (closes.length > 1 ? closes[closes.length - 2] : price);

  if (price == null || prevClose == null || prevClose === 0) return null;
  const changePct = ((price - prevClose) / prevClose) * 100;

  return {
    symbol: label,
    label,
    price,
    prevClose,
    changePct,
    decimals
  };
}

async function fetchTradingViewBistScanner(): Promise<CockpitStockSummary[]> {
  const body = JSON.stringify({
    filter: [{ left: 'exchange', operation: 'equal', right: 'BIST' }],
    options: { lang: 'tr' },
    columns: [
      'name',
      'description',
      'close',
      'change',
      'high',
      'low',
      'sector',
      'market_cap_basic',
      'Perf.W',
      'Perf.1M',
      'Perf.3M',
      'Perf.6M',
      'Perf.YTD',
      'Perf.Y',
      'price_earnings_ttm',
      'price_book_fq',
      'enterprise_value_ebitda_ttm'
    ],
    sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
    range: [0, 700]
  });

  const json = await httpsJsonRequest('https://scanner.tradingview.com/turkey/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    timeoutMs: 9000
  });

  if (!Array.isArray(json?.data)) return [];

  const list: CockpitStockSummary[] = [];
  for (const row of json.data) {
    const d = row?.d;
    if (!Array.isArray(d) || !d[0]) continue;
    const ticker = String(d[0]).toUpperCase().trim();
    const price = safeNum(d[2]);
    if (!ticker || price == null || price <= 0) continue;

    const rawSector = d[6] ? String(d[6]) : 'Miscellaneous';
    list.push({
      ticker,
      name: String(d[1] || ticker),
      sector: TV_SECTOR_TR[rawSector] || rawSector,
      price,
      changePct: safeNum(d[3]) ?? 0,
      high: safeNum(d[4]),
      low: safeNum(d[5]),
      marketCapTl: safeNum(d[7]),
      pe: safeNum(d[14]),
      pb: safeNum(d[15]),
      evEbitda: safeNum(d[16]),
      perf: {
        w1: safeNum(d[8]),
        m1: safeNum(d[9]),
        m3: safeNum(d[10]),
        m6: safeNum(d[11]),
        ytd: safeNum(d[12]),
        y1: safeNum(d[13])
      }
    });
  }
  return list;
}

function formatEconVal(val: unknown, unit?: string, scale?: string): string | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val);
  const s = scale && scale !== '1' ? scale : '';
  const u = unit === '%' ? '%' : '';
  return `${num.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}${s}${u}`;
}

async function fetchMacroEconomicAgenda(): Promise<CockpitAgendaEvent[]> {
  const now = new Date();
  const from = new Date(now.getTime() - 12 * 3600 * 1000).toISOString();
  const to = new Date(now.getTime() + 7 * 86400 * 1000).toISOString();
  const url = `https://economic-calendar.tradingview.com/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&countries=TR,US`;

  const json = await httpsJsonRequest(url, {
    headers: {
      'Origin': 'https://www.tradingview.com',
      'Referer': 'https://www.tradingview.com/'
    },
    timeoutMs: 8000
  });

  const rawEvents: any[] = Array.isArray(json?.result) ? json.result : [];
  if (rawEvents.length === 0) return [];

  // Önce önemli (importance >= 0) TR ve ABD verilerini önceliklendir, azsa tümünü al
  const prioritized = rawEvents.filter((ev) => (ev.importance ?? -1) >= 0);
  const pool = prioritized.length >= 6 ? prioritized : rawEvents;

  return pool
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 14)
    .map((ev, idx) => {
      const dt = new Date(ev.date);
      const trDate = new Date(dt.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
      const dayNum = String(trDate.getDate()).padStart(2, '0');
      const monthTr = TR_MONTHS[trDate.getMonth()] || '';
      const timeTr = `${String(trDate.getHours()).padStart(2, '0')}:${String(trDate.getMinutes()).padStart(2, '0')}`;
      return {
        id: String(ev.id || idx),
        title: String(ev.title || ev.indicator || 'Ekonomik Veri'),
        country: ev.country === 'TR' ? 'TR' : 'US',
        dateIso: String(ev.date),
        dayNum,
        monthTr,
        timeTr,
        actual: formatEconVal(ev.actual, ev.unit, ev.scale),
        forecast: formatEconVal(ev.forecast, ev.unit, ev.scale),
        previous: formatEconVal(ev.previous, ev.unit, ev.scale),
        importance: Number(ev.importance ?? 0)
      };
    });
}

let cachedOverview: { data: CockpitOverviewData; expiresAt: number } | null = null;

export async function getMarketCockpitOverview(forceRefresh = false): Promise<CockpitOverviewData> {
  if (!forceRefresh && cachedOverview && Date.now() < cachedOverview.expiresAt) {
    return cachedOverview.data;
  }

  const [xu100, xu030, usdtry, eurtry, scannerList, agenda] = await Promise.all([
    fetchYahooIndex('XU100.IS', 'XU100', 2),
    fetchYahooIndex('XU030.IS', 'XU030', 2),
    fetchYahooIndex('TRY=X', 'USDTRY', 4),
    fetchYahooIndex('EURTRY=X', 'EURTRY', 4),
    fetchTradingViewBistScanner(),
    fetchMacroEconomicAgenda()
  ]);

  const indices = [xu100, xu030, usdtry, eurtry].filter((x): x is CockpitIndexQuote => x !== null);

  const quotesMap: Record<string, CockpitStockSummary> = {};
  for (const s of scannerList) {
    quotesMap[s.ticker] = s;
  }

  // Fallback: Eğer scanner geçici yanıt vermezse İş Yatırım baseline listesini doldur
  const allTickers = scannerList.length > 0
    ? scannerList.map((s) => ({
        ticker: s.ticker,
        name: s.name,
        sector: s.sector,
        price: s.price,
        changePct: s.changePct
      }))
    : Object.entries(OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE).map(([ticker, m]) => ({
        ticker,
        name: ticker,
        sector: 'BIST',
        price: 0,
        changePct: 0,
        marketCap: m.marketCapMnTl ? m.marketCapMnTl * 1_000_000 : 0
      })).map(({ ticker, name, sector, price, changePct }) => ({ ticker, name, sector, price, changePct }));

  const topGainers = [...scannerList]
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 8);

  const topLosers = [...scannerList]
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, 5);

  const sectorBuckets = new Map<string, { sum: number; count: number; leaderTicker: string; leaderChg: number }>();
  for (const s of scannerList) {
    if (!s.sector) continue;
    const prev = sectorBuckets.get(s.sector) || { sum: 0, count: 0, leaderTicker: s.ticker, leaderChg: s.changePct };
    prev.sum += s.changePct;
    prev.count += 1;
    if (s.changePct > prev.leaderChg) {
      prev.leaderChg = s.changePct;
      prev.leaderTicker = s.ticker;
    }
    sectorBuckets.set(s.sector, prev);
  }

  const topSectors: CockpitSectorPerf[] = Array.from(sectorBuckets.entries())
    .filter(([, b]) => b.count >= 3)
    .map(([sector, b]) => ({
      sector,
      avgChangePct: b.sum / b.count,
      stockCount: b.count,
      leaderTicker: b.leaderTicker,
      leaderChangePct: b.leaderChg
    }))
    .sort((a, b) => b.avgChangePct - a.avgChangePct)
    .slice(0, 10);

  const isDegraded = indices.length === 0 && scannerList.length === 0;

  if (isDegraded && cachedOverview && (cachedOverview.data.indices.length > 0 || cachedOverview.data.topGainers.length > 0)) {
    return {
      ...cachedOverview.data,
      isDegraded: true,
    };
  }

  const data: CockpitOverviewData = {
    updatedAt: new Date().toISOString(),
    isDelayed: true,
    ...(isDegraded ? { isDegraded: true } : {}),
    indices,
    allTickers,
    quotesMap,
    topGainers,
    topLosers,
    topSectors,
    agenda
  };

  if (!isDegraded) {
    cachedOverview = {
      data,
      expiresAt: Date.now() + 30_000
    };
  }

  return data;
}

const cardCache = new Map<string, { data: CockpitCardData; expiresAt: number }>();
const MAX_CARD_CACHE = 250;

const RANGE_MAP: Record<CockpitChartRange, { interval: string; range: string }> = {
  '1G': { interval: '5m', range: '1d' },
  '1H': { interval: '30m', range: '5d' },
  '1A': { interval: '1d', range: '1mo' },
  '1Y': { interval: '1wk', range: '1y' }
};

export async function getCockpitCardData(rawTicker: string, range: CockpitChartRange = '1G'): Promise<CockpitCardData | null> {
  const ticker = rawTicker.toUpperCase().replace(/\.IS$/i, '').trim();
  if (!ticker) return null;

  const cacheKey = `${ticker}:${range}`;
  const cached = cardCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const { interval, range: yahooRange } = RANGE_MAP[range] || RANGE_MAP['1G'];
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}.IS?interval=${interval}&range=${yahooRange}`;

  const [yahooJson, overview, isYatirimMult] = await Promise.all([
    httpsJsonRequest(yahooUrl, { timeoutMs: 8000 }),
    getMarketCockpitOverview().catch(() => null),
    getIsYatirimMultiplesForTicker(ticker).catch(() => null)
  ]);

  const scannerQuote = overview?.quotesMap?.[ticker] || null;
  const baselineMult = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[ticker] || null;

  const result = yahooJson?.chart?.result?.[0];
  const meta = result?.meta;
  const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quoteObj = result?.indicators?.quote?.[0] || {};
  const closes: Array<number | null> = Array.isArray(quoteObj.close) ? quoteObj.close : [];
  const highs: Array<number | null> = Array.isArray(quoteObj.high) ? quoteObj.high : [];
  const lows: Array<number | null> = Array.isArray(quoteObj.low) ? quoteObj.low : [];

  const points: Array<{ t: string; v: number }> = [];
  for (let i = 0; i < timestamps.length; i++) {
    const v = closes[i];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const dt = new Date(timestamps[i] * 1000);
      const tLabel = range === '1G'
        ? dt.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })
        : dt.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit' });
      points.push({ t: tLabel, v });
    }
  }

  const validHighs = highs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const validLows = lows.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

  const lastPoint = points.length > 0 ? points[points.length - 1].v : null;
  const price = safeNum(meta?.regularMarketPrice) ?? scannerQuote?.price ?? lastPoint ?? 0;
  const prevClose = safeNum(meta?.chartPreviousClose) ?? safeNum(meta?.previousClose) ?? (scannerQuote ? scannerQuote.price / (1 + scannerQuote.changePct / 100) : price);

  const changePct = scannerQuote
    ? scannerQuote.changePct
    : prevClose > 0
      ? ((price - prevClose) / prevClose) * 100
      : 0;

  const dayHigh = safeNum(meta?.regularMarketDayHigh) ?? scannerQuote?.high ?? (validHighs.length > 0 ? Math.max(...validHighs) : null);
  const dayLow = safeNum(meta?.regularMarketDayLow) ?? scannerQuote?.low ?? (validLows.length > 0 ? Math.min(...validLows) : null);

  const floorPrice = prevClose > 0 ? Number((prevClose * 0.90).toFixed(2)) : null;
  const ceilingPrice = prevClose > 0 ? Number((prevClose * 1.10).toFixed(2)) : null;

  const pe = isYatirimMult?.pe ?? baselineMult?.pe ?? scannerQuote?.pe ?? null;
  const pb = isYatirimMult?.pb ?? baselineMult?.pb ?? scannerQuote?.pb ?? null;
  const evEbitda = isYatirimMult?.evEbitda ?? baselineMult?.evEbitda ?? scannerQuote?.evEbitda ?? null;
  const marketCapTl =
    (isYatirimMult?.marketCapMnTl ? isYatirimMult.marketCapMnTl * 1_000_000 : null) ??
    (baselineMult?.marketCapMnTl ? baselineMult.marketCapMnTl * 1_000_000 : null) ??
    scannerQuote?.marketCapTl ??
    null;

  const cardData: CockpitCardData = {
    ticker,
    name: scannerQuote?.name || meta?.shortName || ticker,
    sector: scannerQuote?.sector || 'BIST',
    range,
    price,
    prevClose,
    changePct,
    dayHigh,
    dayLow,
    floorPrice,
    ceilingPrice,
    points,
    multiples: {
      pe: pe && pe > 0 ? pe : null,
      pb: pb && pb > 0 ? pb : null,
      evEbitda: evEbitda && evEbitda > 0 ? evEbitda : null,
      marketCapTl: marketCapTl && marketCapTl > 0 ? marketCapTl : null
    },
    perf: scannerQuote?.perf || {
      w1: null,
      m1: null,
      m3: null,
      m6: null,
      ytd: null,
      y1: null
    },
    updatedAt: new Date().toISOString()
  };

  if (price > 0 || points.length > 0) {
    if (cardCache.size >= MAX_CARD_CACHE) {
      const oldestKey = cardCache.keys().next().value;
      if (oldestKey) cardCache.delete(oldestKey);
    }
    cardCache.delete(cacheKey);
    cardCache.set(cacheKey, { data: cardData, expiresAt: Date.now() + 30_000 });
  }
  return cardData;
}
