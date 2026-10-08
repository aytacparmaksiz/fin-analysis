/**
 * FinancialRatioEngine (FinancialMetricsService)
 * ----------------------------------------------------------------------------
 * Tek Doğruluk Kaynağı (Single Source of Truth - Centralized Calculation Engine)
 * 
 * Tüm BIST sektörleri için:
 * 1. TTM (Son 12 Ay) Gelir Tablosu ve Nakit Akışı Kümülasyonu
 * 2. Net Borç, Piyasa Değeri, Firma Değeri (EV)
 * 3. Değerleme Çarpanları (F/K, PD/DD, FD/FAVÖK, FD/Satışlar, FCF Verimi)
 * 4. Kârlılık ve Marjlar (Brüt Marj, Faaliyet Marjı/EBIT %, FAVÖK Marjı, Net Marj)
 * 5. Sermaye Verimliliği (ROIC, WACC, EVA Spread, ROE, ROA)
 * 6. Likidite ve Kaldıraç (Cari Oran, Likidite, Nakit Oran, Net Borç/FAVÖK)
 * 7. Kâr Kalitesi & Nakit Akışı Teşhisi (Nakit Dönüşümü, Sloan Tahakkuk)
 * 8. Karşılaştırmalı Büyüme Oranları (YoY Satış, FAVÖK, Net Kâr Büyümesi)
 */

import type { SectorType } from './sectors.ts';
import type { FinancialHistoryItem } from './bist-service.ts';
import { 
  parseFinancialNumber, 
  getAnnualizationFactor, 
  calculateDuPont5Step, 
  type Dupont5StepResult,
  type DuPont5StepResult,
  SECTOR_MULTIPLE_BENCHMARKS
} from './valuation.ts';
import { IsYatirimApiAdapter } from './isyatirim-adapter.ts';

export interface TtmFinancials {
  revenue: number | null;
  grossProfit: number | null;
  operatingProfit: number | null;
  ebitda: number | null;
  netIncome: number | null;
  operatingCashFlow: number | null;
  freeCashFlow: number | null;
  capex: number | null;
  periodCount: number;
  isAnnualizedFallback: boolean;
}

export interface BalanceSheetMetrics {
  currentAssets: number | null;
  nonCurrentAssets: number | null;
  totalAssets: number | null;
  currentLiabilities: number | null;
  longTermLiabilities: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  paidInCapital: number | null;
  cashAndEquivalents: number | null;
  financialInvestments: number | null;
  shortTermDebt: number | null;
  longTermDebt: number | null;
  financialDebt: number | null;
  netDebt: number | null;
  workingCapital: number | null;
  investedCapital: number | null;
}

export interface ValuationMultiples {
  marketCap: number | null;
  enterpriseValue: number | null;
  pe: number | null;
  pb: number | null;
  evEbitda: number | null;
  evSales: number | null;
  fcfYield: number | null;
}

export interface ProfitabilityAndMargins {
  grossMargin: number | null;
  operatingMargin: number | null;
  ebitdaMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
  roic: number | null;
  wacc: number | null;
  evaSpread: number | null;
}

export interface LiquidityAndLeverage {
  currentRatio: number | null;
  quickRatio: number | null;
  cashRatio: number | null;
  debtToEquity: number | null;
  netDebtToEbitda: number | null;
  financialLeverage: number | null;
}

export interface CashQualityDiagnosis {
  cashConversionRatio: number | null; // OCF / Net Kâr
  sloanAccrualRatio: number | null; // (Net Kâr - OCF) / Toplam Varlıklar
  status: 'EXCELLENT' | 'MODERATE' | 'CRITICAL_RISK' | 'LOSS_BUFFER' | 'NA';
  badgeTitle: string;
  evaluationText: string;
}

export interface UnifiedFinancialMetrics {
  ticker: string;
  period: string;
  sector: SectorType;
  currency: string;
  unitScale: number; // Bin TRY için 1000, Tam TL için 1
  ttm: TtmFinancials;
  balanceSheet: BalanceSheetMetrics;
  valuation: ValuationMultiples;
  margins: ProfitabilityAndMargins;
  liquidity: LiquidityAndLeverage;
  cashQuality: CashQualityDiagnosis;
  dupont: DuPont5StepResult;
  growth: {
    revenueGrowthYoY: number | null;
    operatingProfitGrowthYoY: number | null;
    ebitdaGrowthYoY: number | null;
    netIncomeGrowthYoY: number | null;
    comparisonNote: string;
  };
}

export class FinancialRatioEngine {
  /**
   * Tüm finansal tablolardan ve zaman serisinden merkezi tekil metrik setini üretir.
   */
  public static computeMetrics({
    ticker,
    history,
    currentPrice,
    shareCount,
    sector = 'INDUSTRIAL',
    marketMultiples,
    currency = 'TRY'
  }: {
    ticker: string;
    history: FinancialHistoryItem[];
    currentPrice: number;
    shareCount: number;
    sector?: SectorType;
    marketMultiples?: any;
    currency?: string;
  }): UnifiedFinancialMetrics {
    const sorted = [...(history || [])].sort((a, b) => (a.period || '').localeCompare(b.period || ''));
    const latest = sorted.length > 0 ? sorted[sorted.length - 1] : ({} as FinancialHistoryItem);
    const prevYearItem = sorted.length > 4 ? sorted[sorted.length - 5] : (sorted.length > 1 ? sorted[0] : null);

    const safeShares = (shareCount && shareCount > 0) ? shareCount : 100000000;
    const safePrice = (currentPrice && currentPrice > 0) ? currentPrice : 1.0;

    // Ölçek normalizasyonu (Bin TRY vs Tam TL)
    const normCurr = String(currency || latest?.currency || '').trim().toLowerCase();
    const eqSample = Math.abs(latest?.equity ?? 0);
    const revSample = Math.abs(latest?.revenue ?? latest?.gross_written_premiums ?? 0);
    const paidCapSample = Math.abs(latest?.paid_in_capital ?? 0);

    const isClearlyThousands =
      (paidCapSample > 0 && paidCapSample < 10_000_000 && safeShares >= 5_000_000) ||
      (eqSample > 0 && eqSample < 250_000_000 && (revSample === 0 || revSample < 250_000_000) && safeShares >= 1_000_000);

    const isAlreadyTamTl = (eqSample >= 250_000_000) || 
                           (revSample >= 250_000_000) ||
                           (normCurr === 'tl' || normCurr === 'try' || normCurr.includes('tam'));

    const unitScale = (!isAlreadyTamTl && (normCurr.includes('bin') || normCurr.includes('thousand') || isClearlyThousands)) ? 1000 : 1;

    // 1. TTM (Trailing Twelve Months) Hesaplaması
    const ttm = this.calculateTtmFinancials(sorted, latest, sector, unitScale);

    // 2. Bilanço & Sermaye Metrikleri (Tam TL cinsine normalize edilmiş)
    const curAssets = latest?.current_assets != null ? latest.current_assets * unitScale : null;
    const nonCurAssets = latest?.non_current_assets != null ? latest.non_current_assets * unitScale : null;
    const totAssets = latest?.total_assets != null ? latest.total_assets * unitScale : ((curAssets || 0) + (nonCurAssets || 0) || null);

    const curLiab = latest?.current_liabilities != null ? latest.current_liabilities * unitScale : null;
    const ltLiab = latest?.long_term_liabilities != null ? latest.long_term_liabilities * unitScale : null;
    const totLiab = latest?.total_liabilities != null ? latest.total_liabilities * unitScale : ((curLiab || 0) + (ltLiab || 0) || null);

    const equityTl = latest?.equity != null ? latest.equity * unitScale : null;
    const paidCapTl = latest?.paid_in_capital != null ? latest.paid_in_capital * unitScale : null;
    const cashTl = latest?.cash_and_equivalents != null ? latest.cash_and_equivalents * unitScale : null;
    const finInvestTl = latest?.financial_assets_insured != null ? latest.financial_assets_insured * unitScale : null;

    const stDebtTl = latest?.short_term_debt != null ? latest.short_term_debt * unitScale : null;
    const ltDebtTl = latest?.long_term_debt != null ? latest.long_term_debt * unitScale : null;
    const finDebtTl = latest?.financial_debt != null ? latest.financial_debt * unitScale : (((stDebtTl || 0) + (ltDebtTl || 0)) || null);

    let netDebtTl: number | null = null;
    if (finDebtTl !== null || cashTl !== null) {
      netDebtTl = (finDebtTl || 0) - (cashTl || 0) - (finInvestTl || 0);
    } else if (latest?.net_debt != null) {
      netDebtTl = latest.net_debt * unitScale;
    }

    const workingCapital = (curAssets !== null && curLiab !== null) ? curAssets - curLiab : null;
    const investedCapital = (equityTl !== null && netDebtTl !== null) ? Math.max(0, equityTl + netDebtTl) : null;

    const balanceSheet: BalanceSheetMetrics = {
      currentAssets: curAssets,
      nonCurrentAssets: nonCurAssets,
      totalAssets: totAssets,
      currentLiabilities: curLiab,
      longTermLiabilities: ltLiab,
      totalLiabilities: totLiab,
      equity: equityTl,
      paidInCapital: paidCapTl,
      cashAndEquivalents: cashTl,
      financialInvestments: finInvestTl,
      shortTermDebt: stDebtTl,
      longTermDebt: ltDebtTl,
      financialDebt: finDebtTl,
      netDebt: netDebtTl,
      workingCapital,
      investedCapital
    };

    // 3. Değerleme Çarpanları
    const marketCap = safePrice * safeShares;
    const enterpriseValue = netDebtTl !== null ? marketCap + netDebtTl : marketCap;

    const pe = marketMultiples?.pe ?? (ttm.netIncome && ttm.netIncome > 0 ? Number((marketCap / ttm.netIncome).toFixed(2)) : null);
    const pb = marketMultiples?.pb ?? (equityTl && equityTl > 0 ? Number((marketCap / equityTl).toFixed(2)) : null);
    const evEbitda = marketMultiples?.evEbitda ?? marketMultiples?.ev_ebitda ?? (ttm.ebitda && ttm.ebitda > 0 ? Number((enterpriseValue / ttm.ebitda).toFixed(2)) : null);
    const evSales = marketMultiples?.evSales ?? marketMultiples?.ev_sales ?? (ttm.revenue && ttm.revenue > 0 ? Number((enterpriseValue / ttm.revenue).toFixed(2)) : null);
    const fcfYield = (ttm.freeCashFlow && marketCap > 0) ? Number(((ttm.freeCashFlow / marketCap) * 100).toFixed(1)) : null;

    const valuation: ValuationMultiples = {
      marketCap,
      enterpriseValue,
      pe,
      pb,
      evEbitda,
      evSales,
      fcfYield
    };

    // 4. Kârlılık & Marjlar
    const grossMargin = (ttm.grossProfit !== null && ttm.revenue !== null && ttm.revenue > 0)
      ? Number(((ttm.grossProfit / ttm.revenue) * 100).toFixed(1))
      : parseFinancialNumber(latest?.gross_margin);

    const operatingMargin = (ttm.operatingProfit !== null && ttm.revenue !== null && ttm.revenue > 0)
      ? Number(((ttm.operatingProfit / ttm.revenue) * 100).toFixed(1))
      : parseFinancialNumber(latest?.operating_margin);

    const ebitdaMargin = (ttm.ebitda !== null && ttm.revenue !== null && ttm.revenue > 0)
      ? Number(((ttm.ebitda / ttm.revenue) * 100).toFixed(1))
      : parseFinancialNumber(latest?.ebitda_margin);

    const netMargin = (ttm.netIncome !== null && ttm.revenue !== null && ttm.revenue > 0)
      ? Number(((ttm.netIncome / ttm.revenue) * 100).toFixed(1))
      : parseFinancialNumber(latest?.net_margin);

    const roe = (ttm.netIncome !== null && equityTl !== null && equityTl > 0)
      ? Number(((ttm.netIncome / equityTl) * 100).toFixed(1))
      : parseFinancialNumber(latest?.roe);

    const roa = (ttm.netIncome !== null && totAssets !== null && totAssets > 0)
      ? Number(((ttm.netIncome / totAssets) * 100).toFixed(1))
      : parseFinancialNumber(latest?.roa);

    const taxRate = sector === 'REIT' ? 0 : (sector === 'INSURANCE' || sector === 'BANKING' ? 0.30 : 0.25);
    let roic: number | null = null;
    if (ttm.operatingProfit !== null && investedCapital !== null && investedCapital > 0) {
      const nopat = ttm.operatingProfit * (1 - taxRate);
      roic = Number(((nopat / investedCapital) * 100).toFixed(1));
    } else {
      roic = parseFinancialNumber(latest?.roic);
    }

    const wacc = parseFinancialNumber(latest?.wacc) ?? (sector === 'INSURANCE' ? 35.1 : 29.6);
    const evaSpread = (roic !== null && wacc !== null) ? Number((roic - wacc).toFixed(1)) : null;

    const margins: ProfitabilityAndMargins = {
      grossMargin,
      operatingMargin,
      ebitdaMargin,
      netMargin,
      roe,
      roa,
      roic,
      wacc,
      evaSpread
    };

    // 5. Likidite ve Kaldıraç
    const currentRatio = (curAssets !== null && curLiab !== null && curLiab > 0)
      ? Number((curAssets / curLiab).toFixed(2))
      : parseFinancialNumber(latest?.current_ratio);

    const inventoriesTl = latest?.inventories != null ? latest.inventories * unitScale : 0;
    const quickRatio = (curAssets !== null && curLiab !== null && curLiab > 0)
      ? Number(((curAssets - inventoriesTl) / curLiab).toFixed(2))
      : parseFinancialNumber(latest?.quick_ratio);

    const cashRatio = (cashTl !== null && curLiab !== null && curLiab > 0)
      ? Number((cashTl / curLiab).toFixed(2))
      : parseFinancialNumber(latest?.cash_ratio);

    const debtToEquity = (finDebtTl !== null && equityTl !== null && equityTl > 0)
      ? Number((finDebtTl / equityTl).toFixed(2))
      : parseFinancialNumber(latest?.leverage_ratio);

    const netDebtToEbitda = (netDebtTl !== null && ttm.ebitda !== null && ttm.ebitda > 0)
      ? Number((netDebtTl / ttm.ebitda).toFixed(1))
      : null;

    const financialLeverage = (totAssets !== null && equityTl !== null && equityTl > 0)
      ? Number((totAssets / equityTl).toFixed(2))
      : null;

    const liquidity: LiquidityAndLeverage = {
      currentRatio,
      quickRatio,
      cashRatio,
      debtToEquity,
      netDebtToEbitda,
      financialLeverage
    };

    // 6. Kâr Kalitesi & Nakit Akışı Teşhisi
    const cashQuality = this.diagnoseCashQuality(ttm.operatingCashFlow, ttm.netIncome, totAssets);

    // 7. DuPont 5-Aşamalı Kârlılık Ayrıştırması
    const dupont = calculateDuPont5Step(latest, prevYearItem, sector);

    // 8. Karşılaştırmalı Büyüme (YoY)
    const priorComparison = IsYatirimApiAdapter.computePriorPeriodComparison(sorted, latest.period);

    return {
      ticker,
      period: latest.period || 'SON',
      sector,
      currency,
      unitScale,
      ttm,
      balanceSheet,
      valuation,
      margins,
      liquidity,
      cashQuality,
      dupont,
      growth: {
        revenueGrowthYoY: priorComparison?.revenueGrowthYoY ?? null,
        operatingProfitGrowthYoY: priorComparison?.operatingProfitGrowthYoY ?? null,
        ebitdaGrowthYoY: priorComparison?.ebitdaGrowthYoY ?? null,
        netIncomeGrowthYoY: priorComparison?.netIncomeGrowthYoY ?? null,
        comparisonNote: priorComparison?.isRestatedTms29
          ? 'Yeniden endekslenmiş TMS 29 karşılaştırmalı reel büyüme oranları'
          : 'Nominal YoY karşılaştırma'
      }
    };
  }

  /**
   * TTM (Son 12 Ay) akış büyüklüklerini standart TTM formülü ile hesaplar:
   * TTM = (Cari Ara Dönem) + (Önceki Yıl Yıl Sonu) - (Önceki Yılın Eşleşen Ara Dönemi)
   * Eğer cari dönem yıl sonu (YYYY/12) ise doğrudan o dönem kullanılır.
   * Eğer geçmiş dönem verileri eksikse (örn. yeni halka arz), annualFactor ile fallback yapılır.
   */
  public static calculateTtmFinancials(
    sortedSeries: FinancialHistoryItem[],
    latest: FinancialHistoryItem,
    sector: SectorType,
    unitScale: number
  ): TtmFinancials {
    const annualFactor = getAnnualizationFactor(latest.period);
    const isYearEnd = String(latest.period || '').endsWith('12');

    const periodStr = String(latest.period || '');
    const parts = periodStr.split('/');
    const currentYear = parts.length === 2 ? parseInt(parts[0], 10) : NaN;
    const currentQuarter = parts.length === 2 ? parts[1] : '';

    let prevYearEndItem: FinancialHistoryItem | undefined;
    let prevMatchingItem: FinancialHistoryItem | undefined;

    if (!isYearEnd && !isNaN(currentYear) && currentQuarter) {
      const prevYear = currentYear - 1;
      const prevYearEndPeriod = `${prevYear}/12`;
      const prevMatchingPeriod = `${prevYear}/${currentQuarter}`;

      prevYearEndItem = sortedSeries.find(i => i.period === prevYearEndPeriod);
      prevMatchingItem = sortedSeries.find(i => i.period === prevMatchingPeriod);
    }

    let isFallback = !isYearEnd && (!prevYearEndItem || !prevMatchingItem);

    const computeTtmMetric = (
      getter: (item: FinancialHistoryItem) => number | null | undefined
    ): number | null => {
      const currVal = getter(latest) ?? null;
      if (currVal === null || currVal === undefined) return null;

      if (isYearEnd) {
        return Math.round(currVal * unitScale);
      }

      if (prevYearEndItem && prevMatchingItem) {
        const prevEndVal = getter(prevYearEndItem) ?? null;
        const prevMatchVal = getter(prevMatchingItem) ?? null;

        if (prevEndVal !== null && prevMatchVal !== null) {
          // Standart TTM Formülü: Cari + Önceki Yıl Sonu - Önceki Yıl Eşleşen Çeyrek
          const ttmRaw = currVal + prevEndVal - prevMatchVal;
          return Math.round(ttmRaw * unitScale);
        }
      }

      // Fallback: Yıllıklandırma katsayısı
      return Math.round(currVal * unitScale * annualFactor);
    };

    return {
      revenue: computeTtmMetric(i => i.revenue ?? i.gross_written_premiums),
      grossProfit: computeTtmMetric(i => i.gross_profit),
      operatingProfit: computeTtmMetric(i => i.operating_profit ?? i.technical_profit),
      ebitda: computeTtmMetric(i => i.ebitda ?? i.technical_profit),
      netIncome: computeTtmMetric(i => i.net_income),
      operatingCashFlow: computeTtmMetric(i => i.operating_cash_flow),
      freeCashFlow: computeTtmMetric(i => i.free_cash_flow),
      capex: computeTtmMetric(i => i.capex),
      periodCount: sortedSeries.length,
      isAnnualizedFallback: isFallback
    };
  }

  /**
   * Nakit Akış & Kâr Kalitesi Teşhisi
   */
  public static diagnoseCashQuality(
    ocfTl: number | null,
    netIncomeTl: number | null,
    totalAssetsTl: number | null
  ): CashQualityDiagnosis {
    if (ocfTl === null || netIncomeTl === null) {
      return {
        cashConversionRatio: null,
        sloanAccrualRatio: null,
        status: 'NA',
        badgeTitle: 'Veri Yetersiz',
        evaluationText: 'Nakit akış veya net kâr verisi eksik olduğu için kâr kalitesi hesaplanamadı.'
      };
    }

    const cashConversion = netIncomeTl !== 0 ? Number((ocfTl / Math.abs(netIncomeTl)).toFixed(2)) : null;
    const sloanAccrual = (totalAssetsTl && totalAssetsTl > 0)
      ? Number(((netIncomeTl - ocfTl) / totalAssetsTl).toFixed(3))
      : null;

    if (ocfTl >= netIncomeTl && netIncomeTl > 0) {
      return {
        cashConversionRatio: cashConversion,
        sloanAccrualRatio: sloanAccrual,
        status: 'EXCELLENT',
        badgeTitle: '🌟 Yüksek Kâr Kalitesi',
        evaluationText: `Kâr kağıt üzerinde kalmamış, doğrudan kasaya nakit girişi sağlanmıştır (Nakit Dönüşümü: %${Math.round((cashConversion || 1) * 100)}). Tahsilat kabiliyeti ve bilanço sağlığı güçlüdür.`
      };
    }

    if (ocfTl > 0 && ocfTl < netIncomeTl && netIncomeTl > 0) {
      return {
        cashConversionRatio: cashConversion,
        sloanAccrualRatio: sloanAccrual,
        status: 'MODERATE',
        badgeTitle: '⚠️ Ilımlı Nakit Dönüşümü',
        evaluationText: `Kârın bir kısmı ticari alacak veya stoklarda bağlanmıştır (Nakit Dönüşümü: %${Math.round((cashConversion || 0) * 100)}). Çalışma sermayesi döngüsü izlenmelidir.`
      };
    }

    if (ocfTl <= 0 && netIncomeTl > 0) {
      return {
        cashConversionRatio: cashConversion,
        sloanAccrualRatio: sloanAccrual,
        status: 'CRITICAL_RISK',
        badgeTitle: '🚨 Kritik Kâr Kalitesi Riski',
        evaluationText: `Şirket bilançoda net kâr açıklamasına rağmen operasyonel faaliyetlerinden nakit üretememiştir (OCF negatif). Kârın büyük kısmı gayrinakdi tahakkuk veya TMS 29 parasal kârdan kaynaklanmaktadır; likidite baskısı oluşabilir.`
      };
    }

    return {
      cashConversionRatio: cashConversion,
      sloanAccrualRatio: sloanAccrual,
      status: 'LOSS_BUFFER',
      badgeTitle: '💡 Nakit Tamponlu Zarar',
      evaluationText: `Muhasebesel net zarar bulunmasına rağmen operasyonel nakit akışı pozitiftir. Şirketin ana operasyonu nakit üretmeye devam etmektedir.`
    };
  }
}

export type FinancialMetricSemantics = 
  | 'REVENUE' 
  | 'PROFIT' 
  | 'MARGIN' 
  | 'DEBT' 
  | 'LEVERAGE' 
  | 'NEUTRAL';

export interface FinancialChangeResult {
  percentChange: number | null;
  formattedLabel: string;
  badgeColor: 'green' | 'red' | 'neutral';
  badgeClass: string;
  isTextStatus: boolean;
  arrow: '↑' | '↓' | '—';
}

/**
 * Platform Geneli Standart Finansal Değişim ve Renk Semantiği Hesaplayıcı
 * 
 * Kurallar:
 * 1. Marj / Puan: + fark = yeşil, - fark = kırmızı.
 * 2. Borç (DEBT/LEVERAGE): Borç azalışı (-) KESİNLİKLE YEŞİL, Borç artışı (+) KESİNLİKLE KIRMIZI.
 *    Net nakde geçiş = Yeşil, Net borca geçiş = Kırmızı.
 * 3. Kâr/Zarar (PROFIT): 
 *    - Önceki negatif, cari pozitif -> "Kâra Geçti" (Yeşil)
 *    - Önceki pozitif, cari negatif -> "Zarara Geçti" (Kırmızı)
 *    - İkisi de negatif: Zarar azaldıysa "Zarar Azaldı (%X)" (Yeşil), arttıysa "Zarar Arttı (%X)" (Kırmızı).
 * 4. Nötr (NEUTRAL): Toplam Varlıklar, Sermaye -> Nötr/Slate rozet rengi.
 */
export function computeFinancialChange(
  current: number | null | undefined,
  previous: number | null | undefined,
  semantics: FinancialMetricSemantics = 'PROFIT',
  isMargin = false
): FinancialChangeResult {
  if (current === null || current === undefined || isNaN(current) ||
      previous === null || previous === undefined || isNaN(previous)) {
    return {
      percentChange: null,
      formattedLabel: '—',
      badgeColor: 'neutral',
      badgeClass: 'text-slate-400 bg-slate-800/40 border-slate-700/50',
      isTextStatus: false,
      arrow: '—'
    };
  }

  // 1. MARJ / PUAN DEĞİŞİMİ
  if (isMargin || semantics === 'MARGIN') {
    const diff = Number((current - previous).toFixed(1));
    const isGood = diff >= 0;
    return {
      percentChange: diff,
      formattedLabel: `${diff > 0 ? '+' : ''}${diff.toFixed(1)} puan`,
      badgeColor: diff === 0 ? 'neutral' : (isGood ? 'green' : 'red'),
      badgeClass: diff === 0 
        ? 'text-slate-400 bg-slate-800/40 border-slate-700/50' 
        : (isGood ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50' : 'text-rose-400 bg-rose-950/40 border-rose-800/50'),
      isTextStatus: false,
      arrow: diff > 0 ? '↑' : (diff < 0 ? '↓' : '—')
    };
  }

  // 2. BORÇ / LEVERAGE SEMANTİĞİ (Net Borç Azalışı = YEŞİL, Artışı = KIRMIZI)
  if (semantics === 'DEBT' || semantics === 'LEVERAGE') {
    // Net Borçtan Net Nakde Geçiş
    if (previous > 0 && current <= 0) {
      return {
        percentChange: null,
        formattedLabel: 'Net Nakde Geçti',
        badgeColor: 'green',
        badgeClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50',
        isTextStatus: true,
        arrow: '↓'
      };
    }
    // Net Nakitten Net Borca Geçiş
    if (previous <= 0 && current > 0) {
      return {
        percentChange: null,
        formattedLabel: 'Net Borca Geçti',
        badgeColor: 'red',
        badgeClass: 'text-rose-400 bg-rose-950/40 border-rose-800/50',
        isTextStatus: true,
        arrow: '↑'
      };
    }
    // İkisi de Net Nakit (negatif borç)
    if (previous < 0 && current < 0) {
      if (current < previous) {
        // Nakit pozisyonu daha da güçlendi (örn. -100'den -200'e)
        const pct = Math.round(((Math.abs(current) - Math.abs(previous)) / Math.abs(previous)) * 100);
        return {
          percentChange: pct,
          formattedLabel: `Net Nakit Arttı (%${pct})`,
          badgeColor: 'green',
          badgeClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50',
          isTextStatus: true,
          arrow: '↓'
        };
      } else if (current > previous) {
        // Nakit pozisyonu eridi (örn. -200'den -100'e)
        const pct = Math.round(((Math.abs(previous) - Math.abs(current)) / Math.abs(previous)) * 100);
        return {
          percentChange: -pct,
          formattedLabel: `Net Nakit Azaldı (%${pct})`,
          badgeColor: 'red',
          badgeClass: 'text-rose-400 bg-rose-950/40 border-rose-800/50',
          isTextStatus: true,
          arrow: '↑'
        };
      } else {
        return {
          percentChange: 0,
          formattedLabel: '%0',
          badgeColor: 'neutral',
          badgeClass: 'text-slate-400 bg-slate-800/40 border-slate-700/50',
          isTextStatus: false,
          arrow: '—'
        };
      }
    }

    // İkisi de pozitif Net Borç (veya borç > 0)
    if (previous === 0) {
      return {
        percentChange: 100,
        formattedLabel: '+%100',
        badgeColor: current > 0 ? 'red' : 'neutral',
        badgeClass: current > 0 ? 'text-rose-400 bg-rose-950/40 border-rose-800/50' : 'text-slate-400 bg-slate-800/40 border-slate-700/50',
        isTextStatus: false,
        arrow: current > 0 ? '↑' : '—'
      };
    }

    const pct = Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
    // Borç AZALDI ise (pct < 0) -> YEŞİL!
    // Borç ARTTI ise (pct > 0) -> KIRMIZI!
    const isGood = pct < 0;
    return {
      percentChange: pct,
      formattedLabel: `${pct > 0 ? '+' : (pct < 0 ? '-' : '')}%${Math.abs(Math.round(pct))}`,
      badgeColor: pct === 0 ? 'neutral' : (isGood ? 'green' : 'red'),
      badgeClass: pct === 0
        ? 'text-slate-400 bg-slate-800/40 border-slate-700/50'
        : (isGood ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50' : 'text-rose-400 bg-rose-950/40 border-rose-800/50'),
      isTextStatus: false,
      arrow: pct > 0 ? '↑' : (pct < 0 ? '↓' : '—')
    };
  }

  // 3. NÖTR BÜYÜKLÜKLER (Varlıklar, Ödenmiş Sermaye)
  if (semantics === 'NEUTRAL') {
    if (previous === 0) {
      return {
        percentChange: null,
        formattedLabel: current !== 0 ? '+%100' : '%0',
        badgeColor: 'neutral',
        badgeClass: 'text-slate-400 bg-slate-800/40 border-slate-700/50',
        isTextStatus: false,
        arrow: current > 0 ? '↑' : (current < 0 ? '↓' : '—')
      };
    }
    const pct = Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
    return {
      percentChange: pct,
      formattedLabel: `${pct > 0 ? '+' : (pct < 0 ? '-' : '')}%${Math.abs(Math.round(pct))}`,
      badgeColor: 'neutral',
      badgeClass: 'text-slate-400 bg-slate-800/40 border-slate-700/50',
      isTextStatus: false,
      arrow: pct > 0 ? '↑' : (pct < 0 ? '↓' : '—')
    };
  }

  // 4. GELİR VE KÂR/ZARAR SEMANTİĞİ (PROFIT & REVENUE)
  // A. Önceki Dönem Negatif, Cari Dönem Pozitif (Zarardan Kâra Geçiş)
  if (previous < 0 && current > 0) {
    return {
      percentChange: null,
      formattedLabel: 'Kâra Geçti',
      badgeColor: 'green',
      badgeClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50',
      isTextStatus: true,
      arrow: '↑'
    };
  }

  // B. Önceki Dönem Pozitif, Cari Dönem Negatif (Kârdan Zarara Geçiş)
  if (previous > 0 && current < 0) {
    return {
      percentChange: null,
      formattedLabel: 'Zarara Geçti',
      badgeColor: 'red',
      badgeClass: 'text-rose-400 bg-rose-950/40 border-rose-800/50',
      isTextStatus: true,
      arrow: '↓'
    };
  }

  // C. İki Dönem de Negatif (Zarar Durumu)
  if (previous < 0 && current < 0) {
    const absCurr = Math.abs(current);
    const absPrev = Math.abs(previous);
    if (absCurr < absPrev) {
      // Zarar Azaldı (Örn: -100 -> -50) => İyileşme (YEŞİL)
      const pct = Math.round(((absPrev - absCurr) / absPrev) * 100);
      return {
        percentChange: pct,
        formattedLabel: `Zarar Azaldı (%${pct})`,
        badgeColor: 'green',
        badgeClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50',
        isTextStatus: true,
        arrow: '↑'
      };
    } else if (absCurr > absPrev) {
      // Zarar Arttı (Örn: -50 -> -100) => Kötüleşme (KIRMIZI)
      const pct = Math.round(((absCurr - absPrev) / absPrev) * 100);
      return {
        percentChange: -pct,
        formattedLabel: `Zarar Arttı (%${pct})`,
        badgeColor: 'red',
        badgeClass: 'text-rose-400 bg-rose-950/40 border-rose-800/50',
        isTextStatus: true,
        arrow: '↓'
      };
    } else {
      return {
        percentChange: 0,
        formattedLabel: 'Değişmedi',
        badgeColor: 'neutral',
        badgeClass: 'text-slate-400 bg-slate-800/40 border-slate-700/50',
        isTextStatus: true,
        arrow: '—'
      };
    }
  }

  // D. Sıfır Tabanı
  if (previous === 0) {
    if (current > 0) {
      return {
        percentChange: 100,
        formattedLabel: semantics === 'PROFIT' ? 'Kâra Geçti' : '+%100',
        badgeColor: 'green',
        badgeClass: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50',
        isTextStatus: semantics === 'PROFIT',
        arrow: '↑'
      };
    } else if (current < 0) {
      return {
        percentChange: -100,
        formattedLabel: semantics === 'PROFIT' ? 'Zarara Geçti' : '-%100',
        badgeColor: 'red',
        badgeClass: 'text-rose-400 bg-rose-950/40 border-rose-800/50',
        isTextStatus: semantics === 'PROFIT',
        arrow: '↓'
      };
    } else {
      return {
        percentChange: 0,
        formattedLabel: '%0',
        badgeColor: 'neutral',
        badgeClass: 'text-slate-400 bg-slate-800/40 border-slate-700/50',
        isTextStatus: false,
        arrow: '—'
      };
    }
  }

  // E. İki Dönem de Pozitif (Standart % Büyüme)
  const pct = Number((((current - previous) / previous) * 100).toFixed(1));
  const isGood = pct > 0;
  return {
    percentChange: pct,
    formattedLabel: `${pct > 0 ? '+' : (pct < 0 ? '-' : '')}%${Math.abs(Math.round(pct))}`,
    badgeColor: pct === 0 ? 'neutral' : (isGood ? 'green' : 'red'),
    badgeClass: pct === 0
      ? 'text-slate-400 bg-slate-800/40 border-slate-700/50'
      : (isGood ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50' : 'text-rose-400 bg-rose-950/40 border-rose-800/50'),
    isTextStatus: false,
    arrow: pct > 0 ? '↑' : (pct < 0 ? '↓' : '—')
  };
}
