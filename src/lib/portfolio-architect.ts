import { parseFinancialNumber, parsePeriodSortKey, getLatestReportsPerTicker, calculateEarningsQuality } from './valuation.ts';
import { detectSector, getCompanySectorDisplayName, type SectorType } from './sectors.ts';
import { OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE } from './isyatirim-multiples-cache.ts';
import { parseNumericScore, type SavedReport } from './report-resolver.ts';

export interface PortfolioArchitectConfig {
  targetCount: number;
  maxSectorWeightPct: number;
  maxSingleStockWeightPct: number;
  minOcfConversionPct: number;
  maxWcShareOfOcfPct: number;
  minEbitdaMarginPct: number;
  minFreeFloatPct: number;
  deduplicateGroupHoldings: boolean;
  includeHighQualityNeutralCount: number;
  rotationTakeProfitUpsideThresholdPct: number;
  enforceRiskFreeHurdle: boolean;
  riskFreeRatePct: number | null;
}

export const DEFAULT_PORTFOLIO_ARCHITECT_CONFIG: PortfolioArchitectConfig = {
  targetCount: 10,
  maxSectorWeightPct: 25,
  maxSingleStockWeightPct: 15,
  minOcfConversionPct: 80,
  maxWcShareOfOcfPct: 65,
  minEbitdaMarginPct: 8,
  minFreeFloatPct: 0,
  deduplicateGroupHoldings: true,
  includeHighQualityNeutralCount: 1,
  rotationTakeProfitUpsideThresholdPct: 12,
  enforceRiskFreeHurdle: true,
  riskFreeRatePct: null,
};

export type PortfolioPresetId = 'INSTITUTIONAL_10' | 'FOCUSED_8' | 'BROAD_12';

export interface PortfolioArchitectPreset {
  id: PortfolioPresetId;
  label: string;
  subtitle: string;
  config: PortfolioArchitectConfig;
}

export const PORTFOLIO_ARCHITECT_PRESETS: PortfolioArchitectPreset[] = [
  {
    id: 'INSTITUTIONAL_10',
    label: 'Kurumsal Standart',
    subtitle: '10 Hisse • Dengeli Çekirdek',
    config: { ...DEFAULT_PORTFOLIO_ARCHITECT_CONFIG },
  },
  {
    id: 'FOCUSED_8',
    label: 'Odaklı Kanaat',
    subtitle: '8 Hisse • Yüksek Alfa',
    config: {
      ...DEFAULT_PORTFOLIO_ARCHITECT_CONFIG,
      targetCount: 8,
      maxSectorWeightPct: 25,
      maxSingleStockWeightPct: 16,
      minOcfConversionPct: 85,
      includeHighQualityNeutralCount: 0,
    },
  },
  {
    id: 'BROAD_12',
    label: 'Geniş Çeşitlendirilmiş',
    subtitle: '12 Hisse • Düşük Volatilite',
    config: {
      ...DEFAULT_PORTFOLIO_ARCHITECT_CONFIG,
      targetCount: 12,
      maxSectorWeightPct: 20,
      maxSingleStockWeightPct: 12,
      minOcfConversionPct: 75,
      includeHighQualityNeutralCount: 2,
    },
  },
];

export type PortfolioTargetStatus =
  | 'ACCUMULATE'
  | 'HOLD_WATCH'
  | 'NEAR_TARGET'
  | 'TARGET_REACHED'
  | 'BELOW_RF_HURDLE'
  | 'FORENSIC_EXIT';

const CONSOLIDATED_GROUP_MAP: Record<string, string> = {
  TRENJ: 'KOZA_TR_GRUP',
  TRMET: 'KOZA_TR_GRUP',
  TRALT: 'KOZA_TR_GRUP',
};

// Ana Holding - Borsa İştirakleri Eşleşmesi (Aynı anda hem ana holding hem iştiraki AL listesinde olursa en yüksek puanlı tutulur)
const HOLDING_SUBSIDIARY_MAP: Record<string, string[]> = {
  KCHOL: ['TUPRS', 'FROTO', 'TOASO', 'TTRAK', 'ARCLK', 'YKBNK', 'AYGAZ', 'OTKAR'],
  SAHOL: ['AKBNK', 'ENJSA', 'CIMSA', 'AGESA', 'BRISA', 'KORDS', 'TKNSA'],
  AGHOL: ['MGROS', 'CCOLA', 'AEFES', 'ADEL', 'ASUZU'],
  ISCTR: ['SISE', 'ANHYT', 'ANSGR', 'TSKB', 'ISGYO', 'ISMEN'],
  DOHOL: ['GWIND', 'KAREL', 'DITAS'],
  ALARK: ['ALGYO', 'ALCAR'],
};

const NON_OPERATING_FINANCIAL_SECTORS = new Set<SectorType>([
  'BANKING',
  'INSURANCE',
  'FINANCIAL_SERVICES',
  'HOLDING',
  'REIT',
]);

export type ForensicPortfolioTier =
  | 'TIER_1_CORE'
  | 'TIER_2_SATELLITE'
  | 'TIER_3_FILTERED'
  | 'A_PLUS_NEUTRAL'
  | 'TRAP_NEUTRAL'
  | 'OTHER_NEUTRAL'
  | 'ALMA';

export interface ForensicPortfolioCandidate {
  ticker: string;
  reportId: string;
  companyName: string;
  sectorCode: SectorType;
  sectorName: string;
  period: string;
  periodSortKey: number;
  price: number;
  reportPrice: number;
  isLivePrice: boolean;
  priceDriftPct: number | null;
  fairValue: number;
  upsidePct: number;
  dividendYieldPct: number;
  totalExpectedReturnPct: number;
  score: number;
  decision: 'AL' | 'NÖTR' | 'ALMA';
  tier: ForensicPortfolioTier;
  profitableQuarters: number;
  totalQuarters: number;
  ebitdaMarginPct: number | null;
  netMarginPct: number | null;
  roicPct: number | null;
  waccPct: number | null;
  evaSpreadPct: number | null;
  ocfConversionPct: number | null;
  wcShareOfOcfPct: number | null;
  netDebtToEbitda: number | null;
  isNetCash: boolean;
  currentRatio: number | null;
  freeFloatPct: number | null;
  freeFloatMcapUsdMn: number | null;
  isBankOrInsurance: boolean;
  isNonOperatingFinancial: boolean;
  isValueTrap: boolean;
  isStalePeriod: boolean;
  groupKey: string | null;
  compositeRankScore: number;
  recommendedWeightPct: number;
  inCurrentPortfolio: boolean;
  filterReasons: string[];
  cautionNotes: string[];
  roleSummary: string;
  targetStatus: PortfolioTargetStatus;
  targetStatusLabel: string;
  fairValueProgressPct: number;
  excessReturnOverRfPct: number;
  hasForensicFailure: boolean;
}

export interface PortfolioRotationOutItem {
  candidate: ForensicPortfolioCandidate;
  severity: 'HIGH' | 'MEDIUM';
  reason: string;
  suggestedReplacement: ForensicPortfolioCandidate | null;
}

export interface PortfolioRotationHoldItem {
  candidate: ForensicPortfolioCandidate;
  statusLabel: string;
}

export interface PortfolioSectorSlice {
  sectorName: string;
  weightPct: number;
  stockCount: number;
  tickers: string[];
}

export interface ForensicPortfolioPlan {
  config: PortfolioArchitectConfig;
  effectiveRiskFreeRatePct: number;
  belowRiskFreeAlCount: number;
  totalAnalyzedCount: number;
  totalAlCount: number;
  totalNotrCount: number;
  totalAlmaCount: number;
  tier1CoreAl: ForensicPortfolioCandidate[];
  tier2SatelliteAl: ForensicPortfolioCandidate[];
  tier3FilteredAl: ForensicPortfolioCandidate[];
  tierANeutralCandidates: ForensicPortfolioCandidate[];
  neutralValueTraps: ForensicPortfolioCandidate[];
  modelPortfolio: ForensicPortfolioCandidate[];
  equityAllocationWeightPct: number;
  cashReserveWeightPct: number;
  livePricesAppliedCount: number;
  sectorBreakdown: PortfolioSectorSlice[];
  weightedAvgUpsidePct: number | null;
  weightedAvgScore: number | null;
  weightedAvgEvaPct: number | null;
  rotationSignals: {
    rotateOut: PortfolioRotationOutItem[];
    hold: PortfolioRotationHoldItem[];
    rotateIn: ForensicPortfolioCandidate[];
  };
  candidatesByTicker: Record<string, ForensicPortfolioCandidate>;
}

function round1(val: number): number {
  return Number(val.toFixed(1));
}

function round2(val: number): number {
  return Number(val.toFixed(2));
}

function resolveCandidateFromReport(
  rep: SavedReport,
  portfolioSet: Set<string>,
  maxUniversePeriodKey: number,
  livePriceMap?: Record<string, number>
): ForensicPortfolioCandidate {
  const ticker = (rep.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase();
  const ext = rep.extractedData || {};
  const val = ext.valuation || {};
  const sectorCode: SectorType =
    (rep.sector as SectorType) ||
    (ext.sector as SectorType) ||
    detectSector(ticker, ext.company_name) ||
    'INDUSTRIAL';
  const sectorName = getCompanySectorDisplayName(ticker, sectorCode);
  const companyName = String((rep as any).companyName || ext.company_name || ticker);
  const isBankOrInsurance = sectorCode === 'BANKING' || sectorCode === 'INSURANCE';
  const isNonOperatingFinancial = NON_OPERATING_FINANCIAL_SECTORS.has(sectorCode);

  const isy = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[ticker];
  const reportPrice = parseFinancialNumber(rep.price) ?? isy?.lastPrice ?? 0;
  const rawLivePrice = livePriceMap?.[ticker];
  const hasValidLivePrice =
    rawLivePrice != null && Number.isFinite(rawLivePrice) && rawLivePrice > 0;
  const price = hasValidLivePrice ? round2(rawLivePrice) : reportPrice;
  const isLivePrice = hasValidLivePrice;
  const priceDriftPct =
    hasValidLivePrice && reportPrice > 0
      ? round1(((price - reportPrice) / reportPrice) * 100)
      : null;

  const fairValue = parseFinancialNumber(rep.fairValue ?? val.fair_value) ?? 0;
  const upsidePct = price > 0 && fairValue > 0 ? round1(((fairValue - price) / price) * 100) : 0;

  const history = Array.isArray(ext.financial_history) ? ext.financial_history : [];
  const latest = history.length > 0 ? history[history.length - 1] : {};
  const period = String(rep.period || ext.reporting_period || latest?.period || '');
  const periodSortKey = parsePeriodSortKey(period);
  const maxYear = Math.floor(maxUniversePeriodKey / 100);
  const repYear = Math.floor(periodSortKey / 100);
  const isStalePeriod = maxYear >= 2025 && repYear > 2000 && maxYear - repYear >= 2;

  let rawDividendYield = parseFinancialNumber(
    ext.market_multiples?.dividend_yield ??
      val.dividend_yield ??
      (isy as any)?.dividendYield ??
      (isy as any)?.dividend_yield
  );
  if (rawDividendYield == null && Array.isArray(ext.dividends) && ext.dividends.length > 0) {
    const refYear = repYear >= 2000 ? repYear : new Date().getFullYear();
    for (const d of ext.dividends) {
      if (!d || typeof d !== 'object') continue;
      const dYear = parseFinancialNumber(d.year);
      if (dYear != null && dYear < refYear - 1) continue;
      const candidateYield = parseFinancialNumber(
        d.yieldPct ?? d.yield_pct ?? d.yield ?? d.dividend_yield ?? d.verim
      );
      if (candidateYield != null && candidateYield > 0) {
        rawDividendYield = candidateYield;
        break;
      }
      const perShareTl = parseFinancialNumber(d.perShareTl ?? d.per_share_tl);
      if (perShareTl != null && perShareTl > 0 && price > 0) {
        rawDividendYield = (perShareTl / price) * 100;
        break;
      }
    }
  }
  if (rawDividendYield == null && price > 0 && history.length > 0) {
    const currRaw = String(latest?.currency || ext.currency || 'TRY').toLowerCase();
    const isForeignReportCurr = /\b(usd|eur|gbp|dolar|euro)\b/.test(currRaw);
    if (!isForeignReportCurr) {
      const divShareCount =
        parseFinancialNumber(ext.share_count) ??
        (isy?.paidInCapitalMnTl && isy.paidInCapitalMnTl > 0 ? isy.paidInCapitalMnTl * 1_000_000 : null);
      if (divShareCount != null && divShareCount > 0) {
        let divUnitScale = 1;
        if (currRaw.includes('milyon') || currRaw.includes(' mn')) {
          divUnitScale = 1_000_000;
        } else if (currRaw.includes('bin') || currRaw.includes('thousand')) {
          divUnitScale = 1_000;
        } else {
          const paidCapSample = Math.abs(parseFinancialNumber(latest?.paid_in_capital) ?? 0);
          if (paidCapSample > 0) {
            const lotRatio = paidCapSample / divShareCount;
            if (Math.abs(lotRatio - 0.001) < 0.00025) divUnitScale = 1_000;
            else if (Math.abs(lotRatio - 0.000001) < 0.00000025) divUnitScale = 1_000_000;
          }
        }
        let rawDivPaid = Math.abs(parseFinancialNumber(latest?.dividends_paid) ?? 0);
        if (rawDivPaid <= 0 && period.endsWith('/03')) {
          for (let hi = history.length - 2; hi >= 0; hi--) {
            const hPeriod = String(history[hi]?.period || '');
            if (hPeriod.endsWith('/12')) {
              const fyDiv = Math.abs(parseFinancialNumber(history[hi]?.dividends_paid) ?? 0);
              if (fyDiv > 0) rawDivPaid = fyDiv;
              break;
            }
          }
        }
        if (rawDivPaid > 0) {
          const calcYield = ((rawDivPaid * divUnitScale) / (price * divShareCount)) * 100;
          if (Number.isFinite(calcYield) && calcYield > 0 && calcYield <= 35) {
            rawDividendYield = calcYield;
          }
        }
      }
    }
  }
  const dividendYieldPct =
    rawDividendYield != null && Number.isFinite(rawDividendYield)
      ? round1(Math.max(0, Math.min(25, rawDividendYield)))
      : 0;
  const totalExpectedReturnPct = round1(upsidePct + dividendYieldPct);

  const score = parseNumericScore(rep.score ?? val.score) ?? 0;
  const rawDec = String(rep.decision || val.final_decision || 'NÖTR').trim().toUpperCase();
  const decision: 'AL' | 'NÖTR' | 'ALMA' =
    rawDec === 'AL' ? 'AL' : rawDec === 'ALMA' ? 'ALMA' : 'NÖTR';

  const recentSeries = history.slice(-4);
  const validQuarters = recentSeries.filter((q: any) => q?.net_income != null && Number.isFinite(Number(q.net_income)));
  const profitableQuarters = validQuarters.filter((q: any) => Number(q.net_income) > 0).length;

  const rawEbitdaMargin = isBankOrInsurance
    ? parseFinancialNumber(latest?.technical_margin ?? latest?.net_margin)
    : parseFinancialNumber(latest?.ebitda_margin ?? latest?.technical_margin);
  const ebitdaMarginPct = rawEbitdaMargin != null ? round1(rawEbitdaMargin) : null;
  const rawNetMargin = parseFinancialNumber(latest?.net_margin);
  const netMarginPct = rawNetMargin != null ? round1(rawNetMargin) : null;

  const rawRoic = parseFinancialNumber(val.roic ?? latest?.roic ?? latest?.roe);
  const roicPct = rawRoic != null ? round1(rawRoic) : null;
  const rawWacc = parseFinancialNumber(val.real_wacc ?? val.wacc ?? latest?.real_wacc ?? latest?.wacc);
  const waccPct = rawWacc != null ? round1(rawWacc) : null;
  const rawEva = parseFinancialNumber(
    val.real_eva_spread ??
      val.eva_spread ??
      latest?.eva_spread ??
      (roicPct != null && waccPct != null ? roicPct - waccPct : null)
  );
  const evaSpreadPct = rawEva != null ? round1(rawEva) : null;

  const eq = calculateEarningsQuality(history, sectorCode);
  const ocfConversionPct = isBankOrInsurance
    ? null
    : eq.cashConversionRatio != null
    ? Math.round(eq.cashConversionRatio)
    : null;

  const ocf = parseFinancialNumber(latest?.operating_cash_flow);
  const wcChange = parseFinancialNumber(latest?.working_capital_change);
  const wcShareOfOcfPct =
    !isBankOrInsurance && ocf != null && ocf > 0 && wcChange != null
      ? round1((wcChange / ocf) * 100)
      : null;

  const totalDebt = parseFinancialNumber(latest?.total_debt);
  const cashEq = parseFinancialNumber(latest?.cash_and_equivalents ?? latest?.cash);
  const netDebt =
    parseFinancialNumber(latest?.net_debt) ??
    (totalDebt != null && cashEq != null ? totalDebt - cashEq : null);
  const ebitdaVal = parseFinancialNumber(latest?.ebitda);
  const netDebtToEbitda =
    !isBankOrInsurance && netDebt != null && ebitdaVal != null && ebitdaVal > 0
      ? Number((netDebt / ebitdaVal).toFixed(2))
      : null;
  const isNetCash = netDebt != null && netDebt < 0;

  const currentAssets = parseFinancialNumber(latest?.current_assets);
  const shortTermDebt = parseFinancialNumber(latest?.short_term_liabilities ?? latest?.current_liabilities);
  const currentRatio =
    parseFinancialNumber(latest?.current_ratio) ??
    (currentAssets != null && shortTermDebt != null && shortTermDebt > 0
      ? Number((currentAssets / shortTermDebt).toFixed(2))
      : null);

  const freeFloatRaw = parseFinancialNumber(
    ext.market_multiples?.free_float_pct ?? ext.free_float_pct ?? isy?.freeFloatPct
  );
  const freeFloatPct = freeFloatRaw != null ? round1(freeFloatRaw) : null;
  const rawBaseMcapUsd = parseFinancialNumber(
    ext.market_multiples?.market_cap_mn_usd ?? isy?.marketCapMnUsd
  );
  const effectiveMcapUsd =
    rawBaseMcapUsd != null && rawBaseMcapUsd > 0
      ? isLivePrice && isy?.lastPrice != null && isy.lastPrice > 0
        ? rawBaseMcapUsd * (price / isy.lastPrice)
        : rawBaseMcapUsd
      : null;
  const freeFloatMcapUsdMn =
    effectiveMcapUsd != null && freeFloatPct != null && freeFloatPct > 0
      ? round1((effectiveMcapUsd * freeFloatPct) / 100)
      : null;
  const isValueTrap = Boolean(rep.isValueTrap ?? val.is_value_trap);
  const groupKey = CONSOLIDATED_GROUP_MAP[ticker] || null;

  // Kurumsal Çok Boyutlu Sıralama Puanı
  const cappedUpside = Math.max(-20, Math.min(130, totalExpectedReturnPct));
  const cappedEva = Math.max(-10, Math.min(35, evaSpreadPct ?? 0));
  const cashBonus = isNetCash
    ? 5
    : !isNonOperatingFinancial && netDebtToEbitda != null && netDebtToEbitda > 2.5
    ? -8
    : 0;
  const compositeRankScore = round1(score * 0.5 + cappedUpside * 0.35 + cappedEva * 0.65 + cashBonus);

  return {
    ticker,
    reportId: rep.id,
    companyName,
    sectorCode,
    sectorName,
    period,
    periodSortKey,
    price,
    reportPrice,
    isLivePrice,
    priceDriftPct,
    fairValue,
    upsidePct,
    dividendYieldPct,
    totalExpectedReturnPct,
    score,
    decision,
    tier: decision === 'ALMA' ? 'ALMA' : 'OTHER_NEUTRAL',
    profitableQuarters,
    totalQuarters: validQuarters.length,
    ebitdaMarginPct,
    netMarginPct,
    roicPct,
    waccPct,
    evaSpreadPct,
    ocfConversionPct,
    wcShareOfOcfPct,
    netDebtToEbitda,
    isNetCash,
    currentRatio,
    freeFloatPct,
    freeFloatMcapUsdMn,
    isBankOrInsurance,
    isNonOperatingFinancial,
    isValueTrap,
    isStalePeriod,
    groupKey,
    compositeRankScore,
    recommendedWeightPct: 0,
    inCurrentPortfolio: portfolioSet.has(ticker),
  filterReasons: [],
    cautionNotes: [],
    roleSummary: '',
    targetStatus: 'HOLD_WATCH',
    targetStatusLabel: 'Tut • İzle',
    fairValueProgressPct:
      fairValue > 0 && price > 0 ? Math.min(100, Math.max(0, Math.round((price / fairValue) * 100))) : 0,
    excessReturnOverRfPct: 0,
    hasForensicFailure: false,
  };
}

function resolveCanonicalRiskFreeRatePct(
  uniqueReports: SavedReport[],
  maxPeriodKey: number,
  configRf: number | null | undefined
): number {
  if (configRf != null && Number.isFinite(configRf) && configRf >= 0) {
    return round1(configRf);
  }
  const freq = new Map<number, number>();
  for (const r of uniqueReports) {
    const ext = r.extractedData || {};
    const curr = String(ext.currency || 'TRY').toUpperCase();
    if (curr === 'USD' || curr === 'EUR') continue;
    const pKey = parsePeriodSortKey(String(r.period || ext.reporting_period || ''));
    if (maxPeriodKey >= 202500 && pKey > 0 && pKey < maxPeriodKey - 100) continue;
    const hist = Array.isArray(ext.financial_history) ? ext.financial_history : [];
    const last = hist.length > 0 ? hist[hist.length - 1] : null;
    const rfVal = parseFinancialNumber(last?.risk_free_rate ?? last?.rf_rate);
    if (rfVal != null && rfVal >= 15 && rfVal <= 60) {
      const rounded = round1(rfVal);
      freq.set(rounded, (freq.get(rounded) || 0) + 1);
    }
  }
  let bestRf = 38.0;
  let bestCount = 0;
  for (const [val, cnt] of freq.entries()) {
    if (cnt > bestCount) {
      bestCount = cnt;
      bestRf = val;
    }
  }
  return bestRf;
}

export function buildForensicPortfolioPlan(
  reports: SavedReport[],
  currentPortfolioTickers: string[],
  partialConfig?: Partial<PortfolioArchitectConfig>,
  livePriceMap?: Record<string, number>
): ForensicPortfolioPlan {
  const config: PortfolioArchitectConfig = {
    ...DEFAULT_PORTFOLIO_ARCHITECT_CONFIG,
    ...(partialConfig || {}),
  };

  const normalizedLivePriceMap: Record<string, number> = {};
  if (livePriceMap && typeof livePriceMap === 'object') {
    for (const [rawTk, rawPx] of Object.entries(livePriceMap)) {
      const sym = String(rawTk || '').trim().replace(/\.IS$/i, '').toUpperCase();
      const px = typeof rawPx === 'number' ? rawPx : parseFinancialNumber(rawPx);
      if (sym && px != null && Number.isFinite(px) && px > 0) {
        normalizedLivePriceMap[sym] = px;
      }
    }
  }

  const uniqueReports = getLatestReportsPerTicker(reports || []);
  const portfolioUpper = Array.from(
    new Set(
      (currentPortfolioTickers || [])
        .map(t => String(t || '').trim().replace(/\.IS$/i, '').toUpperCase())
        .filter(Boolean)
    )
  );
  const portfolioSet = new Set(portfolioUpper);

  let maxPeriodKey = 0;
  for (const r of uniqueReports) {
    const k = parsePeriodSortKey(String(r.period || r.extractedData?.reporting_period || ''));
    if (k > maxPeriodKey) maxPeriodKey = k;
  }

  const effectiveRiskFreeRatePct = resolveCanonicalRiskFreeRatePct(
    uniqueReports,
    maxPeriodKey,
    config.riskFreeRatePct
  );

  const candidates = uniqueReports.map(r => {
    const c = resolveCandidateFromReport(r, portfolioSet, maxPeriodKey, normalizedLivePriceMap);
    c.excessReturnOverRfPct = round1(c.totalExpectedReturnPct - effectiveRiskFreeRatePct);
    return c;
  });
  const livePricesAppliedCount = candidates.filter(c => c.isLivePrice).length;

  const rawAl = candidates
    .filter(c => c.decision === 'AL')
    .sort((a, b) => b.compositeRankScore - a.compositeRankScore);
  const rawNotr = candidates
    .filter(c => c.decision === 'NÖTR')
    .sort((a, b) => b.compositeRankScore - a.compositeRankScore);
  const rawAlma = candidates.filter(c => c.decision === 'ALMA');

  // 1. Geçiş: Bireysel adli stres & Rf engellerini ölç (böylece elenen bir holding sağlıklı iştirakini bloklamaz)
  const rawAlReasonsMap = new Map<string, { filterReasons: string[]; hasForensic: boolean; isBelowRf: boolean }>();
  const passingAlPool: ForensicPortfolioCandidate[] = [];

  for (const cand of rawAl) {
    const filterReasons: string[] = [];

    if (cand.isValueTrap) {
      filterReasons.push('Değer tuzağı bayrağı aktif');
    }
    if (cand.isStalePeriod) {
      filterReasons.push(`Bayat bilanço dönemi (${cand.period})`);
    }
    if (!cand.isNonOperatingFinancial) {
      if (cand.ocfConversionPct !== null && cand.ocfConversionPct < config.minOcfConversionPct) {
        filterReasons.push(
          `Zayıf nakit dönüşümü: OCF/Net Kâr %${cand.ocfConversionPct} (< %${config.minOcfConversionPct})`
        );
      }
      if (cand.wcShareOfOcfPct !== null && cand.wcShareOfOcfPct >= config.maxWcShareOfOcfPct) {
        filterReasons.push(
          `İşletme sermayesi kaynaklı nakit: WC/OCF %${cand.wcShareOfOcfPct} (≥ %${config.maxWcShareOfOcfPct})`
        );
      }
      if (cand.ebitdaMarginPct !== null && cand.ebitdaMarginPct < config.minEbitdaMarginPct) {
        filterReasons.push(
          `Dar marj tamponu: FAVÖK Marjı %${cand.ebitdaMarginPct} (< %${config.minEbitdaMarginPct})`
        );
      }
    }
    if (cand.evaSpreadPct !== null && cand.evaSpreadPct < 0) {
      filterReasons.push(`Negatif EVA makası (%${cand.evaSpreadPct})`);
    }
    if (cand.freeFloatPct !== null && cand.freeFloatPct < config.minFreeFloatPct) {
      filterReasons.push(
        `Sığ fiili dolaşım oranı (%${cand.freeFloatPct} < %${config.minFreeFloatPct})`
      );
    }

    const hasForensic = filterReasons.length > 0;
    const isBelowRf = Boolean(
      config.enforceRiskFreeHurdle && cand.totalExpectedReturnPct < effectiveRiskFreeRatePct
    );
    if (isBelowRf) {
      filterReasons.push(
        cand.dividendYieldPct > 0
          ? `Toplam beklenen getiri (+%${cand.totalExpectedReturnPct.toFixed(1)}, temettü dahil), risksiz faiz oranının (%${effectiveRiskFreeRatePct.toFixed(1)}) altında`
          : `Potansiyel getiri (+%${cand.upsidePct.toFixed(1)}), risksiz faiz oranının (%${effectiveRiskFreeRatePct.toFixed(1)}) altında`
      );
    }

    rawAlReasonsMap.set(cand.ticker, { filterReasons, hasForensic, isBelowRf });
    if (filterReasons.length === 0) {
      passingAlPool.push(cand);
    }
  }

  // 2. Geçiş: Sağlıklı adaylar arasında konsolide grup (TRENJ/TRMET) ve ana holding-iştirak tekilleştirmesi
  const chosenGroupLeader = new Map<string, string>();
  const holdingDupWinnerByLoser = new Map<string, string>();
  if (config.deduplicateGroupHoldings) {
    for (const c of passingAlPool) {
      if (!c.groupKey) continue;
      if (!chosenGroupLeader.has(c.groupKey)) {
        chosenGroupLeader.set(c.groupKey, c.ticker);
      }
    }

    const passingRankMap = new Map(passingAlPool.map((c, idx) => [c.ticker, { cand: c, rankIdx: idx }]));
    for (const [holdingTicker, subTickers] of Object.entries(HOLDING_SUBSIDIARY_MAP)) {
      const hEntry = passingRankMap.get(holdingTicker);
      if (!hEntry) continue;
      const presentSubs = subTickers
        .map(s => passingRankMap.get(s))
        .filter((x): x is { cand: ForensicPortfolioCandidate; rankIdx: number } => Boolean(x))
        .sort((a, b) => a.rankIdx - b.rankIdx);
      if (presentSubs.length === 0) continue;

      const topSub = presentSubs[0];
      if (topSub.rankIdx < hEntry.rankIdx) {
        if (!holdingDupWinnerByLoser.has(holdingTicker)) {
          holdingDupWinnerByLoser.set(holdingTicker, topSub.cand.ticker);
        }
      } else {
        for (const subEntry of presentSubs) {
          if (!holdingDupWinnerByLoser.has(subEntry.cand.ticker)) {
            holdingDupWinnerByLoser.set(subEntry.cand.ticker, holdingTicker);
          }
        }
      }
    }
  }

  const tier1CoreAl: ForensicPortfolioCandidate[] = [];
  const tier2SatelliteAl: ForensicPortfolioCandidate[] = [];
  const tier3FilteredAl: ForensicPortfolioCandidate[] = [];
  let belowRiskFreeAlCount = 0;

  for (const cand of rawAl) {
    const info = rawAlReasonsMap.get(cand.ticker)!;
    const filterReasons = [...info.filterReasons];
    const cautionNotes: string[] = [];

    if (
      config.deduplicateGroupHoldings &&
      cand.groupKey &&
      chosenGroupLeader.get(cand.groupKey) &&
      chosenGroupLeader.get(cand.groupKey) !== cand.ticker
    ) {
      filterReasons.push(
        `Konsolide grup çift sayımı (${chosenGroupLeader.get(cand.groupKey)} ile aynı konsolide mali yapı)`
      );
      info.hasForensic = true;
    }

    const dupWinner = holdingDupWinnerByLoser.get(cand.ticker);
    if (dupWinner) {
      filterReasons.push(`Holding-iştirak çift sayımı (${dupWinner} ile aynı ana grup)`);
      info.hasForensic = true;
    }

    cand.hasForensicFailure = info.hasForensic;
    if (info.isBelowRf) belowRiskFreeAlCount++;
    cand.filterReasons = filterReasons;

    if (filterReasons.length > 0) {
      cand.tier = 'TIER_3_FILTERED';
      cand.roleSummary = cand.hasForensicFailure ? 'Adli Stres Filtresine Takıldı' : 'Risksiz Faiz Eşiği Altında';
      tier3FilteredAl.push(cand);
      continue;
    }

    // İkincil Uyarılar (Tier-1 vs Tier-2 ayrımı: yüksek kaldıraç, çok düşük cari oran, sınırda EVA < 2, eksik metrik)
    if (!cand.isNonOperatingFinancial && cand.netDebtToEbitda !== null && cand.netDebtToEbitda > 2.5) {
      cautionNotes.push(`Yüksek kaldıraç (Net Borç/FAVÖK ${cand.netDebtToEbitda}x)`);
    }
    if (!cand.isNonOperatingFinancial && (cand.ocfConversionPct === null || cand.evaSpreadPct === null)) {
      cautionNotes.push('Eksik nakit akışı / EVA verisi (Çekirdek AL yerine İkincil havuzda izlenir)');
    }
    if (cand.currentRatio !== null && cand.currentRatio < 0.85) {
      cautionNotes.push(`Düşük cari oran (${cand.currentRatio}x)`);
    }
    if (cand.evaSpreadPct !== null && cand.evaSpreadPct < 2.0) {
      cautionNotes.push(`Başa baş EVA makası (+%${cand.evaSpreadPct})`);
    }
    if (cand.totalQuarters >= 4 && cand.profitableQuarters < 4) {
      cautionNotes.push(`Son 4 çeyrek kârlılık ${cand.profitableQuarters}/${cand.totalQuarters}`);
    }
    if (cand.groupKey && cand.wcShareOfOcfPct !== null && cand.wcShareOfOcfPct >= 25) {
      cautionNotes.push(`Konsolide azınlık payı & WC payı (%${cand.wcShareOfOcfPct})`);
    }
    if (cand.freeFloatMcapUsdMn !== null && cand.freeFloatMcapUsdMn < 25) {
      cautionNotes.push(`Sığ halka açık derinlik ($${cand.freeFloatMcapUsdMn}M < $25M) — kademeli emir önerilir`);
    }

    cand.cautionNotes = cautionNotes;

    if (cautionNotes.length === 0) {
      cand.tier = 'TIER_1_CORE';
      cand.roleSummary = cand.isNetCash ? 'Çekirdek AL • Net Nakit & Pozitif EVA' : 'Çekirdek AL • Tam Temiz Matris';
      tier1CoreAl.push(cand);
    } else {
      cand.tier = 'TIER_2_SATELLITE';
      cand.roleSummary = `Tamamlayıcı Uydu AL (${cautionNotes[0]})`;
      tier2SatelliteAl.push(cand);
    }
  }

  // NÖTR havuzunu 2 zıt gruba ayır: A+ Kalite NÖTR (dar iskonto) vs Tuzak NÖTR (yüksek iskonto ama adli kusur)
  const tierANeutralCandidates: ForensicPortfolioCandidate[] = [];
  const neutralValueTraps: ForensicPortfolioCandidate[] = [];

  for (const cand of rawNotr) {
    const trapReasons: string[] = [];
    if (cand.isValueTrap) trapReasons.push('Değer tuzağı bayrağı');
    if (!cand.isNonOperatingFinancial && cand.ocfConversionPct !== null && cand.ocfConversionPct < 60) {
      trapReasons.push(`Zayıf nakit dönüşümü (%${cand.ocfConversionPct})`);
    }
    if (!cand.isNonOperatingFinancial && cand.wcShareOfOcfPct !== null && cand.wcShareOfOcfPct >= 70) {
      trapReasons.push(`Tedarikçi/WC kaynaklı nakit (%${cand.wcShareOfOcfPct})`);
    }
    if (cand.evaSpreadPct !== null && cand.evaSpreadPct < 0) {
      trapReasons.push(`Negatif EVA (%${cand.evaSpreadPct})`);
    }
    if (cand.totalQuarters >= 4 && cand.profitableQuarters <= 2) {
      trapReasons.push(`İstikrarsız çeyreklik kârlılık (${cand.profitableQuarters}/${cand.totalQuarters})`);
    }

    if (trapReasons.length > 0) {
      if (cand.upsidePct >= 30 || cand.isValueTrap) {
        cand.tier = 'TRAP_NEUTRAL';
        cand.filterReasons = trapReasons;
        cand.roleSummary = 'Yüksek İskontolu Adli Tuzak';
        neutralValueTraps.push(cand);
      }
      continue;
    }

    const isQualityNeutral =
      cand.score >= 85 &&
      !cand.isStalePeriod &&
      cand.upsidePct >= 10 &&
      (cand.evaSpreadPct === null || cand.evaSpreadPct >= 2.0) &&
      (cand.isNonOperatingFinancial || cand.ocfConversionPct === null || cand.ocfConversionPct >= 75);

    if (isQualityNeutral) {
      cand.tier = 'A_PLUS_NEUTRAL';
      cand.roleSummary = `A+ Kalite (Skor ${cand.score}) • Dar İskonto (+%${cand.upsidePct})`;
      tierANeutralCandidates.push(cand);
    }
  }

  neutralValueTraps.sort((a, b) => b.upsidePct - a.upsidePct);

  // Model Portföy Seçimi (Sektör, Grup ve Risksiz Faiz Eşiği Kurallarıyla)
  const selectedHoldings: ForensicPortfolioCandidate[] = [];
  const eligibleNeutrals = config.enforceRiskFreeHurdle
    ? tierANeutralCandidates.filter(c => c.totalExpectedReturnPct >= effectiveRiskFreeRatePct)
    : tierANeutralCandidates;
  const selectedNeutralSlots = Math.min(config.includeHighQualityNeutralCount, eligibleNeutrals.length);
  const alTargetSlots = Math.max(1, config.targetCount - selectedNeutralSlots);

  const sectorSlotCap = Math.max(
    1,
    Math.floor((config.targetCount * config.maxSectorWeightPct) / 100) || 2
  );
  const sectorCountMap = new Map<string, number>();

  const trySelect = (list: ForensicPortfolioCandidate[], maxItems: number, enforceSectorCap: boolean) => {
    for (const item of list) {
      if (selectedHoldings.length >= maxItems) break;
      if (selectedHoldings.some(s => s.ticker === item.ticker)) continue;
      const curSecCount = sectorCountMap.get(item.sectorName) || 0;
      if (enforceSectorCap && curSecCount >= sectorSlotCap) continue;
      selectedHoldings.push(item);
      sectorCountMap.set(item.sectorName, curSecCount + 1);
    }
  };

  // Önce sektör tavanına uyarak Tier-1 Çekirdek AL -> ardından Tier-2 Uydu AL
  trySelect(tier1CoreAl, alTargetSlots, true);
  trySelect(tier2SatelliteAl, alTargetSlots, true);
  // Eğer sektör tavanı yüzünden hedef slot dolmadıysa ikinci geçişte kalan en güçlüleri tamamla
  if (selectedHoldings.length < alTargetSlots) {
    trySelect([...tier1CoreAl, ...tier2SatelliteAl], alTargetSlots, false);
  }
  // A+ Kalite NÖTR kontenjanını ekle (Rf eşiğini geçiyorsa)
  if (selectedNeutralSlots > 0) {
    trySelect(eligibleNeutrals, selectedHoldings.length + selectedNeutralSlots, true);
  }

  // Ağırlık Dağıtımı: Tier-1 = 1.35x, Tier-2 = 0.90x, A+ NÖTR = 0.75x baz ağırlık + tek hisse/sektör tavanı
  const rawWeights = selectedHoldings.map(item => {
    const tierMult = item.tier === 'TIER_1_CORE' ? 1.35 : item.tier === 'TIER_2_SATELLITE' ? 0.9 : 0.75;
    const scoreBoost = item.score >= 90 ? 1.08 : 1.0;
    return tierMult * scoreBoost;
  });
  const sumRaw = rawWeights.reduce((a, b) => a + b, 0);

  let weights = rawWeights.map(w => (sumRaw > 0 ? (w / sumRaw) * 100 : 0));

  // İteratif tek hisse (%maxSingleStockWeightPct) ve sektör (%maxSectorWeightPct) tavan dengelemesi
  for (let iter = 0; iter < 6; iter++) {
    let excess = 0;
    const cappedFlags = weights.map(() => false);

    // Tek hisse tavanı
    weights = weights.map((w, idx) => {
      if (w > config.maxSingleStockWeightPct) {
        excess += w - config.maxSingleStockWeightPct;
        cappedFlags[idx] = true;
        return config.maxSingleStockWeightPct;
      }
      return w;
    });

    // Sektör tavanı
    const secSums = new Map<string, number>();
    weights.forEach((w, idx) => {
      const sec = selectedHoldings[idx].sectorName;
      secSums.set(sec, (secSums.get(sec) || 0) + w);
    });
    for (const [sec, totalSecW] of secSums.entries()) {
      if (totalSecW > config.maxSectorWeightPct) {
        const ratio = config.maxSectorWeightPct / totalSecW;
        weights = weights.map((w, idx) => {
          if (selectedHoldings[idx].sectorName === sec) {
            const newW = w * ratio;
            excess += w - newW;
            cappedFlags[idx] = true;
            return newW;
          }
          return w;
        });
      }
    }

    if (excess > 0.05) {
      const uncappedWeightSum = weights.reduce((acc, w, idx) => {
        const sec = selectedHoldings[idx].sectorName;
        const secCur = selectedHoldings.reduce((sAcc, h, hIdx) => (h.sectorName === sec ? sAcc + weights[hIdx] : sAcc), 0);
        if (!cappedFlags[idx] && w < config.maxSingleStockWeightPct - 0.1 && secCur < config.maxSectorWeightPct - 0.1) {
          return acc + w;
        }
        return acc;
      }, 0);
      if (uncappedWeightSum > 0) {
        weights = weights.map((w, idx) => {
          const sec = selectedHoldings[idx].sectorName;
          const secCur = selectedHoldings.reduce((sAcc, h, hIdx) => (h.sectorName === sec ? sAcc + weights[hIdx] : sAcc), 0);
          if (!cappedFlags[idx] && w < config.maxSingleStockWeightPct - 0.1 && secCur < config.maxSectorWeightPct - 0.1) {
            const singleRoom = Math.max(0, config.maxSingleStockWeightPct - w);
            const secRoom = Math.max(0, config.maxSectorWeightPct - secCur);
            const addAmt = Math.min((excess * w) / uncappedWeightSum, singleRoom, secRoom);
            return w + addAmt;
          }
          return w;
        });
      }
    }
  }

  // Sert tavan korumalı yuvarlama: Hisse ve sektör tavanlarını ASLA aşma; boşta kalan oran Nakit / PPF Rezervi olur
  weights = weights.map(w => Math.min(w, config.maxSingleStockWeightPct));
  const finalSecSumsRaw = new Map<string, number>();
  weights.forEach((w, idx) => {
    const sec = selectedHoldings[idx].sectorName;
    finalSecSumsRaw.set(sec, (finalSecSumsRaw.get(sec) || 0) + w);
  });
  for (const [sec, totalSecW] of finalSecSumsRaw.entries()) {
    if (totalSecW > config.maxSectorWeightPct) {
      const ratio = config.maxSectorWeightPct / totalSecW;
      weights = weights.map((w, idx) => (selectedHoldings[idx].sectorName === sec ? w * ratio : w));
    }
  }

  weights = weights.map(w => Math.min(round1(config.maxSingleStockWeightPct), Math.max(0, round1(w))));

  // Yuvarlama sonrası sektör tavanı taşması varsa ilgili sektörün en büyük hissesinden 0.1'lik kırpma yap
  const uniqueSectors = Array.from(new Set(selectedHoldings.map(h => h.sectorName)));
  for (const sec of uniqueSectors) {
    let secSum = round1(
      selectedHoldings.reduce((s, h, i) => (h.sectorName === sec ? s + weights[i] : s), 0)
    );
    while (secSum > config.maxSectorWeightPct + 1e-6) {
      let bestIdx = -1;
      let bestW = 0;
      selectedHoldings.forEach((h, i) => {
        if (h.sectorName === sec && weights[i] > bestW) {
          bestW = weights[i];
          bestIdx = i;
        }
      });
      if (bestIdx === -1 || weights[bestIdx] <= 0) break;
      weights[bestIdx] = round1(Math.max(0, weights[bestIdx] - 0.1));
      secSum = round1(
        selectedHoldings.reduce((s, h, i) => (h.sectorName === sec ? s + weights[i] : s), 0)
      );
    }
  }

  let equityAllocationWeightPct = round1(weights.reduce((a, b) => a + b, 0));
  while (equityAllocationWeightPct > 100 + 1e-6 && weights.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > weights[maxIdx]) maxIdx = i;
    }
    if (weights[maxIdx] <= 0) break;
    weights[maxIdx] = round1(Math.max(0, weights[maxIdx] - 0.1));
    equityAllocationWeightPct = round1(weights.reduce((a, b) => a + b, 0));
  }

  if (equityAllocationWeightPct >= 99.5 && equityAllocationWeightPct < 100 && weights.length > 0) {
    const delta = round1(100 - equityAllocationWeightPct);
    for (let i = 0; i < weights.length; i++) {
      const sec = selectedHoldings[i].sectorName;
      const secCur = round1(
        selectedHoldings.reduce((s, h, idx) => (h.sectorName === sec ? s + weights[idx] : s), 0)
      );
      if (
        round1(weights[i] + delta) <= config.maxSingleStockWeightPct + 1e-6 &&
        round1(secCur + delta) <= config.maxSectorWeightPct + 1e-6
      ) {
        weights[i] = round1(weights[i] + delta);
        break;
      }
    }
    equityAllocationWeightPct = round1(weights.reduce((a, b) => a + b, 0));
  }

  const cashReserveWeightPct = round1(Math.max(0, 100 - equityAllocationWeightPct));

  const modelPortfolio: ForensicPortfolioCandidate[] = selectedHoldings.map((item, idx) => ({
    ...item,
    recommendedWeightPct: weights[idx] ?? 0,
  }));

  // Ağırlıkları Tier listelerine de yansıt
  const weightByTicker = new Map(modelPortfolio.map(m => [m.ticker, m.recommendedWeightPct]));
  for (const list of [tier1CoreAl, tier2SatelliteAl, tierANeutralCandidates]) {
    for (const item of list) {
      item.recommendedWeightPct = weightByTicker.get(item.ticker) ?? 0;
    }
  }

  // Tüm adaylar için hedef durumunu & adil değer ilerleme oranını sınıflandır
  for (const cand of candidates) {
    if (
      cand.decision === 'ALMA' ||
      cand.isValueTrap ||
      cand.tier === 'TRAP_NEUTRAL' ||
      cand.hasForensicFailure
    ) {
      cand.targetStatus = 'FORENSIC_EXIT';
      cand.targetStatusLabel = 'Adli Çıkış / Risk';
    } else if (cand.upsidePct <= 0) {
      cand.targetStatus = 'TARGET_REACHED';
      cand.targetStatusLabel = 'Hedefe Ulaştı • Rotasyon';
    } else if (cand.upsidePct < config.rotationTakeProfitUpsideThresholdPct) {
      cand.targetStatus = 'NEAR_TARGET';
      cand.targetStatusLabel = 'Hedefe Yaklaştı • Kâr Al';
    } else if (config.enforceRiskFreeHurdle && cand.totalExpectedReturnPct < effectiveRiskFreeRatePct) {
      cand.targetStatus = 'BELOW_RF_HURDLE';
      cand.targetStatusLabel = 'Risksiz Faiz Altı';
    } else if (cand.decision === 'AL' && cand.upsidePct >= 25) {
      cand.targetStatus = 'ACCUMULATE';
      cand.targetStatusLabel = 'İskontolu • Biriktir';
    } else {
      cand.targetStatus = 'HOLD_WATCH';
      cand.targetStatusLabel = 'Tut • İzle';
    }
    cand.fairValueProgressPct =
      cand.fairValue > 0 && cand.price > 0
        ? Math.min(100, Math.max(0, Math.round((cand.price / cand.fairValue) * 100)))
        : 0;
  }

  // modelPortfolio elemanları select sırasında spread edilmemişti ama referans eşitliğinden güncellendiyse bile garanti senkronize et
  for (const mp of modelPortfolio) {
    const src = candidates.find(c => c.ticker === mp.ticker);
    if (src) {
      mp.targetStatus = src.targetStatus;
      mp.targetStatusLabel = src.targetStatusLabel;
      mp.fairValueProgressPct = src.fairValueProgressPct;
    }
  }

  // Sektör dağılımı özeti
  const secGroup = new Map<string, { weightPct: number; tickers: string[] }>();
  for (const m of modelPortfolio) {
    const existing = secGroup.get(m.sectorName) || { weightPct: 0, tickers: [] };
    existing.weightPct = round1(existing.weightPct + m.recommendedWeightPct);
    existing.tickers.push(m.ticker);
    secGroup.set(m.sectorName, existing);
  }
  const sectorBreakdown: PortfolioSectorSlice[] = Array.from(secGroup.entries())
    .map(([sectorName, info]) => ({
      sectorName,
      weightPct: info.weightPct,
      stockCount: info.tickers.length,
      tickers: info.tickers,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);

  // Model portföy ağırlıklı ortalama metrikleri
  const totalModelW = modelPortfolio.reduce((a, m) => a + m.recommendedWeightPct, 0);
  const weightedAvgUpsidePct =
    totalModelW > 0
      ? round1(modelPortfolio.reduce((a, m) => a + m.upsidePct * m.recommendedWeightPct, 0) / totalModelW)
      : null;
  const weightedAvgScore =
    totalModelW > 0
      ? Math.round(modelPortfolio.reduce((a, m) => a + m.score * m.recommendedWeightPct, 0) / totalModelW)
      : null;
  const evaItems = modelPortfolio.filter(m => m.evaSpreadPct !== null);
  const evaWeightSum = evaItems.reduce((a, m) => a + m.recommendedWeightPct, 0);
  const weightedAvgEvaPct =
    evaWeightSum > 0
      ? round1(evaItems.reduce((a, m) => a + (m.evaSpreadPct || 0) * m.recommendedWeightPct, 0) / evaWeightSum)
      : null;

  // Rotasyon Sinyalleri (Mevcut Portföy Üzerinde)
  const candMap = new Map(candidates.map(c => [c.ticker, c]));
  const rotateInPool = modelPortfolio.filter(m => !portfolioSet.has(m.ticker));
  const usedReplacements = new Set<string>();

  const rotateOut: PortfolioRotationOutItem[] = [];
  const hold: PortfolioRotationHoldItem[] = [];

  for (const tk of portfolioUpper) {
    const cand = candMap.get(tk);
    if (!cand) continue;

    let outReason: string | null = null;
    let severity: 'HIGH' | 'MEDIUM' = 'MEDIUM';

    if (cand.decision === 'ALMA') {
      outReason = `Model kararı 'ALMA' seviyesine geriledi (Potansiyel %${cand.upsidePct})`;
      severity = 'HIGH';
    } else if (cand.isValueTrap) {
      outReason = 'Değer tuzağı bayrağı aktif (Operasyonel/Nakit kalitesi bozulması)';
      severity = 'HIGH';
    } else if (cand.tier === 'TIER_3_FILTERED' && cand.hasForensicFailure) {
      outReason = cand.filterReasons[0] || '4 Boyutlu Adli Stres filtresinden düştü';
      severity = 'HIGH';
    } else if (cand.tier === 'TRAP_NEUTRAL') {
      outReason = cand.filterReasons[0] || 'NÖTR havuzunda adli kusur tespit edildi';
      severity = 'HIGH';
    } else if (cand.upsidePct < config.rotationTakeProfitUpsideThresholdPct) {
      if (cand.upsidePct <= 0) {
        outReason = `Hedef adil değerine ulaştı/aştı (Fiyat ₺${cand.price.toFixed(2)} ≥ Adil Değer ₺${cand.fairValue.toFixed(2)}) — Kâr Realizasyonu & Rotasyon`;
        severity = 'HIGH';
      } else {
        outReason = `Adil değer hedefine yaklaştı (Kalan marj +%${cand.upsidePct.toFixed(1)} < %${config.rotationTakeProfitUpsideThresholdPct} eşiği) — Kademeli Rotasyon Hazırlığı`;
        severity = 'MEDIUM';
      }
    } else if (cand.decision === 'NÖTR' && cand.tier !== 'A_PLUS_NEUTRAL') {
      outReason = `NÖTR görünüm ve yetersiz kalite/iskonto tamponu (Skor ${cand.score})`;
      severity = 'MEDIUM';
    }

    if (outReason) {
      const replacement =
        rotateInPool.find(r => !usedReplacements.has(r.ticker) && r.sectorName !== cand.sectorName) ||
        rotateInPool.find(r => !usedReplacements.has(r.ticker)) ||
        rotateInPool[0] ||
        null;
      if (replacement) usedReplacements.add(replacement.ticker);
      rotateOut.push({
        candidate: cand,
        severity,
        reason: outReason,
        suggestedReplacement: replacement,
      });
    } else {
      const label =
        cand.tier === 'TIER_1_CORE'
          ? 'Çekirdek AL — Güçlü Tut'
          : cand.tier === 'A_PLUS_NEUTRAL'
          ? 'A+ Kalite NÖTR — Hedefe Yakın İzle'
          : 'Uydu AL — Ağırlık Kontrollü Tut';
      hold.push({ candidate: cand, statusLabel: label });
    }
  }

  const candidatesByTicker: Record<string, ForensicPortfolioCandidate> = {};
  for (const c of candidates) {
    candidatesByTicker[c.ticker] = c;
  }

  return {
    config,
    effectiveRiskFreeRatePct,
    belowRiskFreeAlCount,
    totalAnalyzedCount: candidates.length,
    totalAlCount: rawAl.length,
    totalNotrCount: rawNotr.length,
    totalAlmaCount: rawAlma.length,
    tier1CoreAl,
    tier2SatelliteAl,
    tier3FilteredAl,
    tierANeutralCandidates,
    neutralValueTraps,
    modelPortfolio,
    equityAllocationWeightPct,
    cashReserveWeightPct,
    livePricesAppliedCount,
    sectorBreakdown,
    weightedAvgUpsidePct,
    weightedAvgScore,
    weightedAvgEvaPct,
    rotationSignals: {
      rotateOut,
      hold,
      rotateIn: rotateInPool,
    },
    candidatesByTicker,
  };
}

export interface SavedPositionInput {
  shares?: number;
  currentValueTry?: number;
  customWeightPct?: number;
}

export interface CapitalAllocationInput {
  holdings: ForensicPortfolioCandidate[];
  mode: 'initial' | 'topup';
  initialCapitalTry: number;
  topUpCapitalTry: number;
  topUpStrategy: 'smart_rebalance' | 'proportional';
  savedPositions?: Record<string, SavedPositionInput>;
  maxSingleStockWeightPct?: number;
  cashReserveWeightPct?: number;
}

export interface StockCapitalAllocationRow {
  ticker: string;
  candidate: ForensicPortfolioCandidate;
  targetWeightPct: number;
  existingLots: number;
  existingValueTry: number;
  existingWeightPct: number;
  orderLots: number;
  orderAmountTry: number;
  idealOrderAmountTry: number;
  finalLots: number;
  finalValueTry: number;
  finalWeightPct: number;
  isSkippedForRotation: boolean;
  skipReason: string | null;
}

export interface CapitalAllocationPlanResult {
  mode: 'initial' | 'topup';
  topUpStrategy: 'smart_rebalance' | 'proportional';
  existingPortfolioValueTry: number;
  budgetToDeployTry: number;
  deployedAmountTry: number;
  unallocatedCashTry: number;
  cashReserveTry: number;
  finalPortfolioValueTry: number;
  impliedPortfolioFairValueTry: number;
  rows: StockCapitalAllocationRow[];
  hasSavedLots: boolean;
  warningMessage: string | null;
}

function allocateWholeLots(
  budgetTry: number,
  rawTargetAmounts: number[],
  prices: number[],
  eligibleMask: boolean[],
  baseValues?: number[],
  maxSingleStockWeightPct?: number,
  totalPortfolioValueForCapTry?: number
): number[] {
  const n = prices.length;
  const lots = new Array<number>(n).fill(0);
  if (budgetTry <= 0 || n === 0) return lots;

  for (let i = 0; i < n; i++) {
    if (!eligibleMask[i] || prices[i] <= 0 || rawTargetAmounts[i] <= 0) {
      lots[i] = 0;
    } else {
      lots[i] = Math.floor(rawTargetAmounts[i] / prices[i]);
    }
  }

  let spent = 0;
  for (let i = 0; i < n; i++) {
    spent += lots[i] * prices[i];
  }
  let remCash = Math.max(0, budgetTry - spent);

  const existingTotal = baseValues ? baseValues.reduce((a, b) => a + b, 0) : 0;
  const approxPostTotal =
    totalPortfolioValueForCapTry != null && totalPortfolioValueForCapTry > 0
      ? totalPortfolioValueForCapTry
      : existingTotal + budgetTry;
  const enforceCap =
    maxSingleStockWeightPct != null &&
    maxSingleStockWeightPct > 0 &&
    approxPostTotal > 0;
  const maxAllowedVal = enforceCap ? approxPostTotal * (maxSingleStockWeightPct / 100) : Infinity;

  for (let pass = 0; pass < 2; pass++) {
    const order = Array.from({ length: n }, (_, i) => i)
      .filter(i => eligibleMask[i] && prices[i] > 0 && prices[i] <= remCash + 1e-6)
      .sort((a, b) => {
        const remA = rawTargetAmounts[a] / prices[a] - lots[a];
        const remB = rawTargetAmounts[b] / prices[b] - lots[b];
        if (Math.abs(remB - remA) > 1e-6) return remB - remA;
        return prices[a] - prices[b];
      });

    let boughtAny = false;
    for (const i of order) {
      if (prices[i] <= remCash + 1e-6) {
        const baseV = baseValues ? baseValues[i] : 0;
        const candidateNewVal = baseV + (lots[i] + 1) * prices[i];
        if (enforceCap && candidateNewVal > maxAllowedVal) {
          continue;
        }
        lots[i] += 1;
        remCash = Math.max(0, remCash - prices[i]);
        boughtAny = true;
      }
    }
    if (!boughtAny || remCash <= 0) break;
  }

  return lots;
}

export function computeCapitalAllocationPlan(input: CapitalAllocationInput): CapitalAllocationPlanResult {
  const holdings = input.holdings || [];
  const mode = input.mode === 'topup' ? 'topup' : 'initial';
  const topUpStrategy = input.topUpStrategy === 'proportional' ? 'proportional' : 'smart_rebalance';
  const savedPositions = input.savedPositions || {};

  if (holdings.length === 0) {
    return {
      mode,
      topUpStrategy,
      existingPortfolioValueTry: 0,
      budgetToDeployTry: 0,
      deployedAmountTry: 0,
      unallocatedCashTry: 0,
      cashReserveTry: 0,
      finalPortfolioValueTry: 0,
      impliedPortfolioFairValueTry: 0,
      rows: [],
      hasSavedLots: false,
      warningMessage: null,
    };
  }

  const n = holdings.length;
  const prices = holdings.map(h => (Number.isFinite(h.price) && h.price > 0 ? h.price : 0));

  // 1. Hedef ağırlıkları çöz
  const hasCustomOverride = holdings.some(h => {
    const cw = savedPositions[h.ticker]?.customWeightPct;
    return cw != null && Number.isFinite(cw) && cw > 0;
  });
  const recSum = holdings.reduce((acc, h) => acc + (h.recommendedWeightPct || 0), 0);
  const explicitCashReservePct =
    input.cashReserveWeightPct != null && Number.isFinite(input.cashReserveWeightPct) && input.cashReserveWeightPct > 0
      ? Math.min(100, Math.max(0, round1(input.cashReserveWeightPct)))
      : 0;
  let targetWeights: number[] = [];

  if (
    !hasCustomOverride &&
    ((recSum >= 98 && recSum <= 102) || (explicitCashReservePct > 0 && recSum > 0 && recSum <= 102))
  ) {
    targetWeights = holdings.map(h => round1(h.recommendedWeightPct || 0));
  } else {
    const rawW = holdings.map(h => {
      const cw = savedPositions[h.ticker]?.customWeightPct;
      if (cw != null && Number.isFinite(cw) && cw > 0) return cw;
      const tierMult =
        h.tier === 'TIER_1_CORE'
          ? 1.35
          : h.tier === 'TIER_2_SATELLITE'
          ? 1.0
          : h.tier === 'A_PLUS_NEUTRAL'
          ? 0.85
          : h.targetStatus === 'FORENSIC_EXIT'
          ? 0.25
          : 0.65;
      const scoreBoost = h.score >= 90 ? 1.08 : 1.0;
      return tierMult * scoreBoost;
    });

    const sumR = rawW.reduce((a, b) => a + b, 0);
    let wPct = rawW.map(w => (sumR > 0 ? (w / sumR) * 100 : 100 / n));
    const singleCap = input.maxSingleStockWeightPct;
    if (singleCap != null && singleCap > 0 && n * singleCap >= 105) {
      for (let iter = 0; iter < 4; iter++) {
        let excess = 0;
        const capped = wPct.map(() => false);
        wPct = wPct.map((w, i) => {
          if (w > singleCap) {
            excess += w - singleCap;
            capped[i] = true;
            return singleCap;
          }
          return w;
        });
        if (excess > 0.05) {
          const uncappedSum = wPct.reduce((acc, w, i) => (!capped[i] && w < singleCap - 0.1 ? acc + w : acc), 0);
          if (uncappedSum > 0) {
            wPct = wPct.map((w, i) =>
              !capped[i] && w < singleCap - 0.1 ? w + (excess * w) / uncappedSum : w
            );
          }
        }
      }
    }
    targetWeights = wPct.map(w => round1(w));
    const roundedSum = targetWeights.reduce((a, b) => a + b, 0);
    if (targetWeights.length > 0 && Math.abs(100 - roundedSum) >= 0.05) {
      targetWeights[0] = round1(targetWeights[0] + (100 - roundedSum));
    }
  }

  // 2. Mod bazlı bütçe ve lot tahsisatı
  const safeInitial = Math.max(0, Number.isFinite(input.initialCapitalTry) ? input.initialCapitalTry : 0);
  const safeTopUp = Math.max(0, Number.isFinite(input.topUpCapitalTry) ? input.topUpCapitalTry : 0);

  let existingLots = new Array<number>(n).fill(0);
  let existingValues = new Array<number>(n).fill(0);
  let orderLots = new Array<number>(n).fill(0);
  let idealOrderAmounts = new Array<number>(n).fill(0);
  let skippedFlags = new Array<boolean>(n).fill(false);
  let skipReasons = new Array<string | null>(n).fill(null);
  let hasSavedLots = false;
  let warningMessage: string | null = null;
  let budgetToDeployTry = safeInitial;
  let cashReserveTry = 0;

  if (mode === 'initial') {
    budgetToDeployTry = safeInitial;
    cashReserveTry = round2(budgetToDeployTry * (explicitCashReservePct / 100));
    const equityBudgetTry = Math.max(0, round2(budgetToDeployTry - cashReserveTry));
    const eligibleMask = holdings.map((h, i) => {
      if (prices[i] <= 0) {
        skippedFlags[i] = true;
        skipReasons[i] = 'Canlı fiyat verisi eksik';
        return false;
      }
      if (h.targetStatus === 'FORENSIC_EXIT') {
        skippedFlags[i] = true;
        skipReasons[i] = h.targetStatusLabel || 'Adli Çıkış / Risk';
        return false;
      }
      return true;
    });

    const eligSumW = targetWeights.reduce((acc, w, i) => (eligibleMask[i] ? acc + w : acc), 0);
    if (eligSumW > 0 && equityBudgetTry > 0) {
      idealOrderAmounts = targetWeights.map((w, i) =>
        eligibleMask[i] ? round2(equityBudgetTry * (w / eligSumW)) : 0
      );
      orderLots = allocateWholeLots(
        equityBudgetTry,
        idealOrderAmounts,
        prices,
        eligibleMask,
        undefined,
        input.maxSingleStockWeightPct,
        budgetToDeployTry
      );
    } else if (budgetToDeployTry > 0 && equityBudgetTry <= 0) {
      warningMessage = 'Portföyün %100\'ü Nakit / PPF Rezervi olarak ayrıldı.';
    } else if (budgetToDeployTry > 0) {
      warningMessage = 'Tahsis edilebilecek geçerli fiyatlı/uygun hisse bulunamadı.';
    }
  } else {
    // mode === 'topup'
    budgetToDeployTry = safeTopUp;
    cashReserveTry = round2(budgetToDeployTry * (explicitCashReservePct / 100));
    const equityBudgetTry = Math.max(0, round2(budgetToDeployTry - cashReserveTry));
    hasSavedLots = holdings.some(h => {
      const p = savedPositions[h.ticker];
      return (p?.shares != null && p.shares > 0) || (p?.currentValueTry != null && p.currentValueTry > 0);
    });

    if (hasSavedLots) {
      for (let i = 0; i < n; i++) {
        const sp = savedPositions[holdings[i].ticker];
        const sh = sp?.shares != null && Number.isFinite(sp.shares) && sp.shares > 0 ? Math.floor(sp.shares) : 0;
        const valRaw =
          sp?.currentValueTry != null && Number.isFinite(sp.currentValueTry) && sp.currentValueTry > 0
            ? sp.currentValueTry
            : 0;
        if (sh > 0 && prices[i] > 0) {
          existingLots[i] = sh;
          existingValues[i] = round2(sh * prices[i]);
        } else if (valRaw > 0) {
          existingLots[i] = prices[i] > 0 ? Math.floor(valRaw / prices[i]) : 0;
          existingValues[i] = round2(valRaw);
        }
      }
    } else if (safeInitial > 0) {
      // Başlangıç sermayesinden baz pozisyonları simüle et
      const baseEquityTry = round2(safeInitial * (1 - explicitCashReservePct / 100));
      const baseMask = holdings.map((h, i) => prices[i] > 0 && h.targetStatus !== 'FORENSIC_EXIT');
      const baseSumW = targetWeights.reduce((acc, w, i) => (baseMask[i] ? acc + w : acc), 0);
      if (baseSumW > 0 && baseEquityTry > 0) {
        const baseTargets = targetWeights.map((w, i) => (baseMask[i] ? baseEquityTry * (w / baseSumW) : 0));
        existingLots = allocateWholeLots(
          baseEquityTry,
          baseTargets,
          prices,
          baseMask,
          undefined,
          input.maxSingleStockWeightPct,
          safeInitial
        );
        existingValues = existingLots.map((l, i) => round2(l * prices[i]));
      }
    }

    const existingTotalTry = round2(existingValues.reduce((a, b) => a + b, 0));
    const postTopUpTargetTotal = existingTotalTry + equityBudgetTry;

    const eligibleMask = holdings.map((h, i) => {
      if (prices[i] <= 0) {
        skippedFlags[i] = true;
        skipReasons[i] = 'Fiyat yok';
        return false;
      }
      if (h.targetStatus === 'FORENSIC_EXIT' || h.targetStatus === 'TARGET_REACHED') {
        skippedFlags[i] = true;
        skipReasons[i] = h.targetStatusLabel;
        return false;
      }
      if (topUpStrategy === 'smart_rebalance' && h.targetStatus === 'NEAR_TARGET') {
        skippedFlags[i] = true;
        skipReasons[i] = 'Hedefe Yakın • 0 ₺ Alım';
        return false;
      }
      return true;
    });

    const eligSumW = targetWeights.reduce((acc, w, i) => (eligibleMask[i] ? acc + w : acc), 0);
    if (eligSumW <= 0) {
      warningMessage =
        'Mevcut hisselerin tamamı hedef fiyata ulaşmış veya çıkış sinyali üretiyor. İlave nakdi dağıtmadan önce rotasyon yapmanız önerilir.';
    } else if (equityBudgetTry > 0) {
      const eligNormW = targetWeights.map((w, i) => (eligibleMask[i] ? w / eligSumW : 0));
      if (topUpStrategy === 'smart_rebalance') {
        const deficits = holdings.map((_, i) => {
          if (!eligibleMask[i]) return 0;
          const desiredFinal = postTopUpTargetTotal * eligNormW[i];
          return Math.max(0, desiredFinal - existingValues[i]);
        });
        const sumDeficit = deficits.reduce((a, b) => a + b, 0);
        idealOrderAmounts = holdings.map((_, i) => {
          if (!eligibleMask[i]) return 0;
          if (sumDeficit > 0.01) {
            return round2(equityBudgetTry * (deficits[i] / sumDeficit));
          }
          return round2(equityBudgetTry * eligNormW[i]);
        });
      } else {
        idealOrderAmounts = holdings.map((_, i) =>
          eligibleMask[i] ? round2(equityBudgetTry * eligNormW[i]) : 0
        );
      }

      orderLots = allocateWholeLots(
        equityBudgetTry,
        idealOrderAmounts,
        prices,
        eligibleMask,
        existingValues,
        input.maxSingleStockWeightPct,
        existingTotalTry + budgetToDeployTry
      );
    }
  }

  const orderAmounts = orderLots.map((l, i) => round2(l * prices[i]));
  const finalLots = existingLots.map((l, i) => l + orderLots[i]);
  const finalValues = existingValues.map((v, i) => round2(v + orderAmounts[i]));

  const existingPortfolioValueTry = round2(existingValues.reduce((a, b) => a + b, 0));
  const deployedAmountTry = round2(orderAmounts.reduce((a, b) => a + b, 0));
  const unallocatedCashTry = round2(Math.max(0, budgetToDeployTry - deployedAmountTry));
  const finalPortfolioValueTry = round2(finalValues.reduce((a, b) => a + b, 0));

  const impliedPortfolioFairValueTry = round2(
    holdings.reduce((acc, h, i) => {
      const fv = h.fairValue > 0 ? h.fairValue : prices[i];
      return acc + finalLots[i] * fv;
    }, 0)
  );

  const rows: StockCapitalAllocationRow[] = holdings.map((h, i) => ({
    ticker: h.ticker,
    candidate: h,
    targetWeightPct: targetWeights[i] ?? 0,
    existingLots: existingLots[i] ?? 0,
    existingValueTry: existingValues[i] ?? 0,
    existingWeightPct:
      existingPortfolioValueTry > 0 ? round1((existingValues[i] / existingPortfolioValueTry) * 100) : 0,
    orderLots: orderLots[i] ?? 0,
    orderAmountTry: orderAmounts[i] ?? 0,
    idealOrderAmountTry: idealOrderAmounts[i] ?? 0,
    finalLots: finalLots[i] ?? 0,
    finalValueTry: finalValues[i] ?? 0,
    finalWeightPct:
      finalPortfolioValueTry > 0 ? round1((finalValues[i] / finalPortfolioValueTry) * 100) : 0,
    isSkippedForRotation: skippedFlags[i] ?? false,
    skipReason: skipReasons[i] ?? null,
  }));

  return {
    mode,
    topUpStrategy,
    existingPortfolioValueTry,
    budgetToDeployTry,
    deployedAmountTry,
    unallocatedCashTry,
    cashReserveTry,
    finalPortfolioValueTry,
    impliedPortfolioFairValueTry,
    rows,
    hasSavedLots,
    warningMessage,
  };
}
