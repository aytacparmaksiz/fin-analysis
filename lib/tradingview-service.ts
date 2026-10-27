import https from 'node:https';

export interface TradingViewConsensus {
  ticker: string;
  closePrice?: number | null;
  targetPriceAverage: number | null;
  targetPriceMedian: number | null;
  targetPriceHigh: number | null;
  targetPriceLow: number | null;
  recommendationMark: number | null; // 1.0 (Strong Buy) -> 5.0 (Strong Sell)
  recommendationLabel: 'GÜÇLÜ AL' | 'AL' | 'TUT' | 'SAT' | 'GÜÇLÜ SAT' | 'NÖTR';
  revenueForecastNextFq?: number | null;
  epsForecastNextFq?: number | null;
  perfW?: number | null;   // 7 Günlük Getiri (%)
  perf1M?: number | null;  // 1 Aylık Getiri (%)
  perfY?: number | null;   // 1 Yıllık Getiri (%)
  perfYtd?: number | null; // Yılbaşından Bugüne (%)
  source: string;
  fetchedAt: string;
}

const tvHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  timeout: 10000
});

const tvCache = new Map<string, { data: TradingViewConsensus | null; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 dakika önbellek

export function clearTradingViewCache(ticker?: string): void {
  const upper = ticker ? ticker.toUpperCase().replace(/\.IS$/, '').trim() : undefined;
  if (upper) {
    tvCache.delete(upper);
  } else {
    tvCache.clear();
  }
}

/**
 * TradingView BIST Scanner üzerinden Refinitiv/LSEG tarafından toplanan
 * tüm yerli/yabancı aracı kurumların konsensüs hedef fiyatlarını ve canlı getiri performansını çeker.
 */
export async function fetchTradingViewConsensus(
  rawTicker: string,
  options?: { forceRefresh?: boolean }
): Promise<TradingViewConsensus | null> {
  const ticker = rawTicker.toUpperCase().replace(/\.IS$/, '').trim();
  if (options?.forceRefresh) {
    tvCache.delete(ticker);
  }
  const cached = options?.forceRefresh ? null : tvCache.get(ticker);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const columns = [
    'name', 'close',
    'price_target_average', 'price_target_median', 'price_target_high', 'price_target_low',
    'recommendation_mark', 'revenue_forecast_next_fq', 'earnings_per_share_forecast_next_fq',
    'Perf.W', 'Perf.1M', 'Perf.Y', 'Perf.YTD'
  ];

  const postBody = JSON.stringify({
    symbols: { tickers: [`BIST:${ticker}`] },
    columns
  });

  try {
    const rawJson = await new Promise<string | null>((resolve) => {
      let settled = false;
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
      }, 7000);

      const req = https.request('https://scanner.tradingview.com/turkey/scan', {
        method: 'POST',
        agent: tvHttpsAgent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postBody),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 7000
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
      req.write(postBody);
      req.end();
    });

    if (!rawJson) {
      return null;
    }

    const parsed = JSON.parse(rawJson);
    const item = parsed?.data?.[0];
    if (!item || !Array.isArray(item.d)) {
      return null;
    }

    const d = item.d;
    const closePrice = typeof d[1] === 'number' && !isNaN(d[1]) ? Number(d[1].toFixed(2)) : null;
    const avg = typeof d[2] === 'number' && !isNaN(d[2]) && d[2] > 0 ? d[2] : null;
    const median = typeof d[3] === 'number' && !isNaN(d[3]) && d[3] > 0 ? d[3] : null;
    const high = typeof d[4] === 'number' && !isNaN(d[4]) && d[4] > 0 ? d[4] : null;
    const low = typeof d[5] === 'number' && !isNaN(d[5]) && d[5] > 0 ? d[5] : null;
    const mark = typeof d[6] === 'number' && !isNaN(d[6]) ? d[6] : null;
    const revFq = typeof d[7] === 'number' && !isNaN(d[7]) ? d[7] : null;
    const epsFq = typeof d[8] === 'number' && !isNaN(d[8]) ? d[8] : null;
    const perfW = typeof d[9] === 'number' && !isNaN(d[9]) ? Number(d[9].toFixed(2)) : null;
    const perf1M = typeof d[10] === 'number' && !isNaN(d[10]) ? Number(d[10].toFixed(2)) : null;
    const perfY = typeof d[11] === 'number' && !isNaN(d[11]) ? Number(d[11].toFixed(2)) : null;
    const perfYtd = typeof d[12] === 'number' && !isNaN(d[12]) ? Number(d[12].toFixed(2)) : null;

    const hasConsensus = avg != null || median != null || high != null || low != null;
    const hasPerf = perfW != null || perfY != null || perf1M != null;
    if (!hasConsensus && !hasPerf) {
      return null;
    }

    let recommendationLabel: 'GÜÇLÜ AL' | 'AL' | 'TUT' | 'SAT' | 'GÜÇLÜ SAT' | 'NÖTR' = 'NÖTR';
    if (mark !== null) {
      if (mark <= 1.5) recommendationLabel = 'GÜÇLÜ AL';
      else if (mark <= 2.5) recommendationLabel = 'AL';
      else if (mark <= 3.5) recommendationLabel = 'TUT';
      else if (mark <= 4.5) recommendationLabel = 'SAT';
      else recommendationLabel = 'GÜÇLÜ SAT';
    }

    const result: TradingViewConsensus = {
      ticker,
      closePrice,
      targetPriceAverage: avg ? Number(avg.toFixed(2)) : null,
      targetPriceMedian: median ? Number(median.toFixed(2)) : null,
      targetPriceHigh: high ? Number(high.toFixed(2)) : null,
      targetPriceLow: low ? Number(low.toFixed(2)) : null,
      recommendationMark: mark !== null ? Number(mark.toFixed(2)) : null,
      recommendationLabel,
      revenueForecastNextFq: revFq,
      epsForecastNextFq: epsFq,
      perfW,
      perf1M,
      perfY,
      perfYtd,
      source: 'Piyasa Konsensüsü (LSEG / Refinitiv Kurumlar Havuzu)',
      fetchedAt: new Date().toISOString()
    };

    tvCache.set(ticker, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.warn(`[TradingView] ${ticker} konsensüs verisi ayrıştırılamadı:`, err);
    return null;
  }
}
