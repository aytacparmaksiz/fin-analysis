import { OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE } from '../lib/isyatirim-multiples-cache.ts';
import { OFFICIAL_ISYATIRIM_CACHE } from '../lib/isyatirim-official-cache.ts';
import { mapIsYatirimSectorToValuationSector, detectSector } from '../lib/sectors.ts';
import { FinancialRatioEngine } from '../lib/ratio-engine.ts';
import { computeSnowflakeAnalysis } from '../lib/snowflake.ts';
import { calculateDuPont5Step, calculateCompanyMultiples, computeSectorValuationAndDrivers, enrichAndSanitizeFinancialHistory, calculateValuationSensitivityMatrix } from '../lib/valuation.ts';
import { InvariantSentinel } from '../lib/invariant-sentinel.ts';

// 53 Sektörün her birinden en az 2 hisse seçimi
const bySector = {};
for (const [ticker, m] of Object.entries(OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE)) {
  const s = m.sectorName || 'Diğer';
  if (!bySector[s]) bySector[s] = [];
  bySector[s].push(ticker);
}

const selectedStocks = [];
for (const [sectorName, tickers] of Object.entries(bySector)) {
  const sorted = [...tickers].sort((a, b) => {
    const hasA = OFFICIAL_ISYATIRIM_CACHE[a] ? 1 : 0;
    const hasB = OFFICIAL_ISYATIRIM_CACHE[b] ? 1 : 0;
    return hasB - hasA;
  });
  const countToPick = Math.max(2, Math.min(2, sorted.length));
  for (let i = 0; i < countToPick; i++) {
    selectedStocks.push({ sectorName, ticker: sorted[i] });
  }
}

console.log(`\n================================================================================`);
console.log(`🚀 53 SEKTÖR & ${selectedStocks.length} HİSSE İÇİN ÇOK BOYUTLU MATEMATİKSEL DENETİM BAŞLATILIYOR`);
console.log(`================================================================================\n`);

function buildFinancialHistoryForTicker(ticker, mBaseline, sectorType) {
  if (OFFICIAL_ISYATIRIM_CACHE[ticker] && OFFICIAL_ISYATIRIM_CACHE[ticker].length > 0) {
    return OFFICIAL_ISYATIRIM_CACHE[ticker].map(item => ({ ...item }));
  }

  const price = mBaseline.lastPrice > 0 ? mBaseline.lastPrice : 25.0;
  const mcap = (mBaseline.marketCapMnTl && mBaseline.marketCapMnTl > 0) ? mBaseline.marketCapMnTl * 1_000_000 : 5_000_000_000;
  const shareCount = (mBaseline.paidInCapitalMnTl && mBaseline.paidInCapitalMnTl > 0) ? mBaseline.paidInCapitalMnTl * 1_000_000 : Math.round(mcap / price);
  const pe = (mBaseline.pe && mBaseline.pe > 0) ? mBaseline.pe : 8.5;
  const pb = (mBaseline.pb && mBaseline.pb > 0) ? mBaseline.pb : 1.8;
  const evEbitda = (mBaseline.evEbitda && mBaseline.evEbitda > 0) ? mBaseline.evEbitda : 6.5;
  const evSales = (mBaseline.evSales && mBaseline.evSales > 0) ? mBaseline.evSales : 1.2;

  const ttmNet = Math.round(mcap / pe);
  const ttmRev = Math.round(mcap / evSales);
  const ttmEbitda = Math.round(mcap / evEbitda);
  const equity = Math.round(mcap / pb);
  const netDebt = Math.round(mcap * 0.15);
  const totalAssets = Math.round(equity * 2.2);
  const curAssets = Math.round(totalAssets * 0.45);
  const curLiab = Math.round(totalAssets * 0.35);
  const totalLiab = totalAssets - equity;
  const cash = Math.round(curAssets * 0.25);
  const finDebt = cash + netDebt;
  const ocf = Math.round(ttmNet * 1.15);

  return [
    {
      period: '2025/06',
      revenue: Math.round(ttmRev * 0.48),
      gross_profit: Math.round(ttmRev * 0.48 * 0.28),
      ebitda: Math.round(ttmEbitda * 0.48),
      operating_profit: Math.round(ttmEbitda * 0.48 * 0.85),
      net_income: Math.round(ttmNet * 0.48),
      operating_cash_flow: Math.round(ocf * 0.48),
      current_assets: Math.round(curAssets * 0.90),
      total_assets: Math.round(totalAssets * 0.90),
      current_liabilities: Math.round(curLiab * 0.90),
      total_liabilities: Math.round(totalLiab * 0.90),
      equity: Math.round(equity * 0.92),
      paid_in_capital: shareCount,
      cash_and_equivalents: Math.round(cash * 0.90),
      net_debt: Math.round(netDebt * 0.95),
      financial_debt: Math.round(finDebt * 0.95),
      wacc: 32.0,
      real_wacc: 14.5,
      is_tms29: true
    },
    {
      period: '2025/12',
      revenue: Math.round(ttmRev * 0.95),
      gross_profit: Math.round(ttmRev * 0.95 * 0.28),
      ebitda: Math.round(ttmEbitda * 0.95),
      operating_profit: Math.round(ttmEbitda * 0.95 * 0.85),
      net_income: Math.round(ttmNet * 0.95),
      operating_cash_flow: Math.round(ocf * 0.95),
      current_assets: Math.round(curAssets * 0.95),
      total_assets: Math.round(totalAssets * 0.95),
      current_liabilities: Math.round(curLiab * 0.95),
      total_liabilities: Math.round(totalLiab * 0.95),
      equity: Math.round(equity * 0.96),
      paid_in_capital: shareCount,
      cash_and_equivalents: Math.round(cash * 0.95),
      net_debt: Math.round(netDebt * 0.98),
      financial_debt: Math.round(finDebt * 0.98),
      wacc: 32.0,
      real_wacc: 14.5,
      is_tms29: true
    },
    {
      period: '2026/03',
      revenue: Math.round(ttmRev * 0.26),
      gross_profit: Math.round(ttmRev * 0.26 * 0.29),
      ebitda: Math.round(ttmEbitda * 0.26),
      operating_profit: Math.round(ttmEbitda * 0.26 * 0.86),
      net_income: Math.round(ttmNet * 0.26),
      operating_cash_flow: Math.round(ocf * 0.27),
      current_assets: Math.round(curAssets * 0.98),
      total_assets: Math.round(totalAssets * 0.98),
      current_liabilities: Math.round(curLiab * 0.98),
      total_liabilities: Math.round(totalLiab * 0.98),
      equity: Math.round(equity * 0.98),
      paid_in_capital: shareCount,
      cash_and_equivalents: Math.round(cash * 0.98),
      net_debt: Math.round(netDebt * 0.99),
      financial_debt: Math.round(finDebt * 0.99),
      wacc: 32.0,
      real_wacc: 14.5,
      is_tms29: true
    },
    {
      period: '2026/06',
      revenue: ttmRev,
      gross_profit: Math.round(ttmRev * 0.30),
      ebitda: ttmEbitda,
      operating_profit: Math.round(ttmEbitda * 0.88),
      net_income: ttmNet,
      operating_cash_flow: ocf,
      current_assets: curAssets,
      total_assets: totalAssets,
      current_liabilities: curLiab,
      total_liabilities: totalLiab,
      equity: equity,
      paid_in_capital: shareCount,
      cash_and_equivalents: cash,
      net_debt: netDebt,
      financial_debt: finDebt,
      wacc: 32.0,
      real_wacc: 14.5,
      is_tms29: true
    }
  ];
}

const discrepancies = [];
let totalAudited = 0;

for (const { sectorName, ticker } of selectedStocks) {
  totalAudited++;
  const mBaseline = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[ticker] || {
    ticker,
    name: ticker,
    sectorName,
    lastPrice: 20.0,
    marketCapMnTl: 2000,
    paidInCapitalMnTl: 100,
    pe: 8.0,
    pb: 1.5,
    evEbitda: 6.0,
    evSales: 1.1
  };

  const sectorType = mapIsYatirimSectorToValuationSector(sectorName);
  const rawHistory = buildFinancialHistoryForTicker(ticker, mBaseline, sectorType);
  const price = mBaseline.lastPrice > 0 ? mBaseline.lastPrice : 20.0;
  const shareCount = (mBaseline.paidInCapitalMnTl && mBaseline.paidInCapitalMnTl > 0)
    ? mBaseline.paidInCapitalMnTl * 1_000_000
    : 100_000_000;

  // 1. Zenginleştirme
  const rawPayload = {
    ticker,
    company_name: mBaseline.name || ticker,
    sector: sectorType,
    currency: 'TRY',
    reporting_period: rawHistory[rawHistory.length - 1].period,
    share_count: shareCount,
    current_price: price,
    financial_history: rawHistory,
    valuation: { current_price: price }
  };
  const sanitized = enrichAndSanitizeFinancialHistory(rawPayload);

  // 2. Merkezi Rasyo Motoru (Tek Doğruluk Kaynağı)
  const unified = FinancialRatioEngine.computeMetrics({
    ticker,
    history: sanitized.financial_history,
    currentPrice: price,
    shareCount,
    sector: sectorType,
    marketMultiples: {
      pe: mBaseline.pe,
      pb: mBaseline.pb,
      evEbitda: mBaseline.evEbitda,
      evSales: mBaseline.evSales
    }
  });

  // 3. Değerleme & Sürücüler
  const valRes = computeSectorValuationAndDrivers(sanitized, price.toString(), sectorType);

  // 4. Çarpanlar
  const companyMultiples = calculateCompanyMultiples(
    sanitized.financial_history,
    price,
    shareCount,
    sectorType,
    { pe: mBaseline.pe, pb: mBaseline.pb, ev_ebitda: mBaseline.evEbitda, ev_sales: mBaseline.evSales, sector_name: sectorName },
    'TRY',
    null,
    sanitized.financial_history
  );

  // 5. DuPont 5-Aşamalı
  const dupont = calculateDuPont5Step(
    sanitized.financial_history[sanitized.financial_history.length - 1],
    sanitized.financial_history.length > 1 ? sanitized.financial_history[sanitized.financial_history.length - 2] : null,
    sectorType
  );

  // 6. Snowflake
  const sf = computeSnowflakeAnalysis({
    ticker,
    sector: sectorType,
    currentPrice: price,
    fairValue: valRes.valuation?.fair_value || 10,
    discountPct: valRes.valuation?.discount_pct || 0,
    marketMultiples: {
      pe: mBaseline.pe,
      pb: mBaseline.pb,
      evEbitda: mBaseline.evEbitda,
      evSales: mBaseline.evSales
    },
    companyMultiples,
    financialHistory: sanitized.financial_history,
    valuationDrivers: valRes.drivers,
    unifiedMetrics: unified,
    latestData: sanitized.financial_history[sanitized.financial_history.length - 1],
    dupontResult: dupont
  });

  // =========================================================================
  // ÇAPRAZ ÇELİŞKİ DENETİMLERİ (SAPMA > %1 KONTROLÜ)
  // =========================================================================

  // DENETİM 1: ROE (DuPont vs Unified Margins vs Snowflake)
  const dupontRoe = unified.dupont.calculatedRoe;
  const marginsRoe = unified.margins.roe;
  const sfRoeCheck = sf.axes.past.checks.find(c => c.id === 'high_historical_roe');
  const sfRoeVal = sfRoeCheck ? parseFloat(sfRoeCheck.metricValue.replace(/[^0-9.-]/g, '')) : null;

  if (dupontRoe != null && marginsRoe != null && Math.abs(dupontRoe - marginsRoe) > 1.0) {
    discrepancies.push({
      ticker,
      sectorName,
      metric: 'ROE (DuPont vs Unified Margins)',
      valA: `DuPont: %${dupontRoe}`,
      valB: `Unified Margins: %${marginsRoe}`,
      deviationPct: Math.abs(dupontRoe - marginsRoe).toFixed(2),
      rootCause: 'DuPont tek çeyrek yıllıklandırması vs TTM Net Kâr yıllıklandırma uyumsuzluğu'
    });
  }

  if (sfRoeVal != null && marginsRoe != null && Math.abs(sfRoeVal - marginsRoe) > 1.0) {
    discrepancies.push({
      ticker,
      sectorName,
      metric: 'ROE (Snowflake vs Unified Margins)',
      valA: `Snowflake: %${sfRoeVal}`,
      valB: `Unified Margins: %${marginsRoe}`,
      deviationPct: Math.abs(sfRoeVal - marginsRoe).toFixed(2),
      rootCause: 'Snowflake ROE kartı Unified ROE ile senkronize değil'
    });
  }

  // DENETİM 2: F/K veya GYO için PD/DD Çarpan Uyumu
  const isReit = sectorType === 'REIT';
  if (isReit) {
    const truePb = unified.valuation.pb ?? mBaseline.pb;
    const sfPbCheck = sf.axes.value.checks.find(c => c.id === 'pe_vs_peers');
    const sfPbVal = sfPbCheck ? parseFloat(sfPbCheck.metricValue.replace(/[^0-9.-]/g, '')) : null;
    if (truePb != null && sfPbVal != null && Math.abs(truePb - sfPbVal) > 0.05) {
      const dev = Math.abs((sfPbVal - truePb) / truePb) * 100;
      if (dev > 1.0) {
        discrepancies.push({
          ticker,
          sectorName,
          metric: 'PD/DD (Snowflake vs Unified Valuation)',
          valA: `Snowflake: ${sfPbVal}x`,
          valB: `Unified: ${truePb}x`,
          deviationPct: dev.toFixed(2),
          rootCause: 'GYO PD/DD çarpanı piyasa baseline veya özkaynak ile uyuşmuyor'
        });
      }
    }
  } else {
    const truePe = unified.valuation.pe ?? mBaseline.pe;
    const sfPeCheck = sf.axes.value.checks.find(c => c.id === 'pe_vs_peers');
    const sfPeVal = sfPeCheck ? parseFloat(sfPeCheck.metricValue.replace(/[^0-9.-]/g, '')) : null;
    if (truePe != null && sfPeVal != null && truePe > 0 && Math.abs(truePe - sfPeVal) > 0.1) {
      const dev = Math.abs((sfPeVal - truePe) / truePe) * 100;
      if (dev > 1.0) {
        discrepancies.push({
          ticker,
          sectorName,
          metric: 'F/K (Snowflake vs Unified Valuation)',
          valA: `Snowflake: ${sfPeVal}x`,
          valB: `Unified: ${truePe}x`,
          deviationPct: dev.toFixed(2),
          rootCause: 'F/K çarpanı kümülatif net kâr vs TTM net kâr ayrışması'
        });
      }
    }
  }

  // DENETİM 3: Net Kâr Büyümesi (Gelir Tablosu YoY vs Snowflake)
  const trueProfitGrowth = unified.growth.netIncomeGrowthYoY;
  const sfSavingsCheck = sf.axes.future.checks.find(c => c.id === 'earnings_vs_savings');
  const sfSavingsVal = sfSavingsCheck ? parseFloat(sfSavingsCheck.metricValue.replace(/[^0-9.-]/g, '')) : null;
  if (trueProfitGrowth != null && sfSavingsVal != null && Math.abs(trueProfitGrowth - sfSavingsVal) > 1.0) {
    discrepancies.push({
      ticker,
      sectorName,
      metric: 'Net Kâr Büyümesi YoY (Snowflake vs Gelir Tablosu)',
      valA: `Snowflake: %+${sfSavingsVal}%`,
      valB: `Gelir Tablosu: %+${trueProfitGrowth}%`,
      deviationPct: Math.abs(trueProfitGrowth - sfSavingsVal).toFixed(2),
      rootCause: 'Snowflake Gelecek kâr büyümesi, gerçekleşen gelir tablosu YoY büyümesiyle senkronize değil'
    });
  }

  // DENETİM 4: Net Borç / FAVÖK (Unified vs Snowflake)
  if (sectorType !== 'BANKING' && sectorType !== 'INSURANCE') {
    const trueNdEbitda = unified.liquidity.netDebtToEbitda;
    const sfDebtCheck = sf.axes.health.checks.find(c => c.id === 'debt_level');
    const sfDebtVal = sfDebtCheck && sfDebtCheck.metricValue.includes('Net Borç / FAVÖK')
      ? parseFloat(sfDebtCheck.metricValue.replace(/[^0-9.-]/g, ''))
      : null;
    if (trueNdEbitda != null && sfDebtVal != null && Math.abs(trueNdEbitda - sfDebtVal) > 0.1) {
      const dev = trueNdEbitda !== 0 ? Math.abs((sfDebtVal - trueNdEbitda) / trueNdEbitda) * 100 : 100;
      if (dev > 1.0) {
        discrepancies.push({
          ticker,
          sectorName,
          metric: 'Net Borç / FAVÖK (Snowflake vs Unified)',
          valA: `Snowflake: ${sfDebtVal}x`,
          valB: `Unified: ${trueNdEbitda}x`,
          deviationPct: dev.toFixed(2),
          rootCause: 'Net Borç / FAVÖK çarpanı TTM FAVÖK yerine tek çeyreklik EBITDA ile hesaplanmış'
        });
      }
    }
  }

  // DENETİM 5: Fisher Reel WACC Denklemi: (1 + WaccNom) = (1 + WaccReal) * (1 + ExpInf)
  // Kurumsal İlke: Fisher reel dönüşümü TMS 29 enflasyon muhasebesine tabi veya döviz bazlı şirketler için geçerlidir
  const latestItem = sanitized.financial_history[sanitized.financial_history.length - 1];
  const isTms29OrForeign = latestItem.is_tms29 || sectorType === 'AVIATION' || latestItem.is_foreign_currency;
  if (isTms29OrForeign && latestItem.nominal_wacc && latestItem.real_wacc && latestItem.expected_inflation) {
    const leftSide = 1 + latestItem.nominal_wacc / 100;
    const rightSide = (1 + latestItem.real_wacc / 100) * (1 + latestItem.expected_inflation / 100);
    const fisherDiff = Math.abs(leftSide - rightSide);
    if (fisherDiff > 0.015) {
      discrepancies.push({
        ticker,
        sectorName,
        metric: 'Fisher Reel WACC Denklemi',
        valA: `Sol Taraf (1+WaccNom): ${leftSide.toFixed(4)}`,
        valB: `Sağ Taraf (1+WaccReal)*(1+Inf): ${rightSide.toFixed(4)}`,
        deviationPct: (fisherDiff * 100).toFixed(2),
        rootCause: 'Fisher denklemi reel WACC dönüşümünde yuvarlama veya formül sapması'
      });
    }
  }

  // DENETİM 6: İNA Duyarlılık Matrisi Tekillik ve Monotonluk Denetimi
  if (valRes.valuation?.fair_value && valRes.valuation.fair_value > 0) {
    const sens = calculateValuationSensitivityMatrix({
      baseFairValue: valRes.valuation.fair_value,
      currentPrice: price,
      baseWacc: latestItem.nominal_wacc || 30.0,
      baseGrowth: 15.0
    });
    for (const row of sens.matrix) {
      for (const cell of row) {
        if (cell.fairValue !== null && (isNaN(cell.fairValue) || cell.fairValue <= 0 || !isFinite(cell.fairValue))) {
          discrepancies.push({
            ticker,
            sectorName,
            metric: 'İNA Duyarlılık Matrisi Tekillik',
            valA: `Hücre Değeri: ${cell.fairValue}`,
            valB: 'Pozitif Sonlu Sayı Bekleniyor',
            deviationPct: '100',
            rootCause: 'WACC <= g sınırında payda patlaması veya NaN korumasızlığı'
          });
        }
      }
    }
  }
}

console.log(`\n================================================================================`);
console.log(`📊 DENETİM SONUÇ RAPORU: ${totalAudited} HİSSE VE 53 SEKTÖR`);
console.log(`================================================================================\n`);

if (discrepancies.length === 0) {
  console.log(`✅ KUSURSUZ: Çelişen hiçbir matematiksel sapma (> %1) bulunamadı!`);
} else {
  console.log(`🚨 DİKKAT: Toplam ${discrepancies.length} adet çelişki tespit edildi!\n`);
  const fisherDiscrepancies = discrepancies.filter(d => d.metric.includes('Fisher'));
  if (fisherDiscrepancies.length > 0) {
    console.log('--- FİSHER REEL WACC SAPMALARI ---');
    console.table(fisherDiscrepancies);
  }
  console.log('--- İLK 30 GENEL SAPMA ---');
  console.table(discrepancies.slice(0, 30));
}

// Ortak kök neden analizi
const rootCauses = {};
for (const d of discrepancies) {
  rootCauses[d.rootCause] = (rootCauses[d.rootCause] || 0) + 1;
}
console.log('\n=== ORTAK KÖK NEDENLER DAĞILIMI ===');
for (const [cause, count] of Object.entries(rootCauses)) {
  console.log(`- [${count} hisse]: ${cause}`);
}
