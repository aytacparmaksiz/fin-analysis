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
}

export const DEFAULT_PORTFOLIO_ARCHITECT_CONFIG: PortfolioArchitectConfig = {
  targetCount: 12,
  maxSectorWeightPct: 20,
  maxSingleStockWeightPct: 12,
  minOcfConversionPct: 80,
  maxWcShareOfOcfPct: 65,
  minEbitdaMarginPct: 8,
  minFreeFloatPct: 0,
  deduplicateGroupHoldings: true,
  includeHighQualityNeutralCount: 2,
  rotationTakeProfitUpsideThresholdPct: 12,
};

const CONSOLIDATED_GROUP_MAP: Record<string, string> = {
  TRENJ: 'KOZA_TR_GRUP',
  TRMET: 'KOZA_TR_GRUP',
  TRALT: 'KOZA_TR_GRUP',
};

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
  fairValue: number;
  upsidePct: number;
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
  isBankOrInsurance: boolean;
  isValueTrap: boolean;
  isStalePeriod: boolean;
  groupKey: string | null;
  compositeRankScore: number;
  recommendedWeightPct: number;
  inCurrentPortfolio: boolean;
  filterReasons: string[];
  cautionNotes: string[];
  roleSummary: string;
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
  sectorBreakdown: PortfolioSectorSlice[];
  weightedAvgUpsidePct: number | null;
  weightedAvgScore: number | null;
  weightedAvgEvaPct: number | null;
  rotationSignals: {
    rotateOut: PortfolioRotationOutItem[];
    hold: PortfolioRotationHoldItem[];
    rotateIn: ForensicPortfolioCandidate[];
  };
}

function round1(val: number): number {
  return Number(val.toFixed(1));
}

function resolveCandidateFromReport(
  rep: SavedReport,
  portfolioSet: Set<string>,
  maxUniversePeriodKey: number
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

  const isy = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[ticker];
  const price = parseFinancialNumber(rep.price) ?? isy?.lastPrice ?? 0;
  const fairValue = parseFinancialNumber(rep.fairValue ?? val.fair_value) ?? 0;
  const upsidePct = price > 0 && fairValue > 0 ? round1(((fairValue - price) / price) * 100) : 0;
  const score = parseNumericScore(rep.score ?? val.score) ?? 0;
  const rawDec = String(rep.decision || val.final_decision || 'NÖTR').trim().toUpperCase();
  const decision: 'AL' | 'NÖTR' | 'ALMA' =
    rawDec === 'AL' ? 'AL' : rawDec === 'ALMA' ? 'ALMA' : 'NÖTR';

  const history = Array.isArray(ext.financial_history) ? ext.financial_history : [];
  const latest = history.length > 0 ? history[history.length - 1] : {};
  const period = String(rep.period || ext.reporting_period || latest?.period || '');
  const periodSortKey = parsePeriodSortKey(period);
  const maxYear = Math.floor(maxUniversePeriodKey / 100);
  const repYear = Math.floor(periodSortKey / 100);
  const isStalePeriod = maxYear >= 2025 && repYear > 2000 && maxYear - repYear >= 2;

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
  const isValueTrap = Boolean(rep.isValueTrap ?? val.is_value_trap);
  const groupKey = CONSOLIDATED_GROUP_MAP[ticker] || null;

  // Kurumsal Çok Boyutlu Sıralama Puanı
  const cappedUpside = Math.max(-20, Math.min(130, upsidePct));
  const cappedEva = Math.max(-10, Math.min(35, evaSpreadPct ?? 0));
  const cashBonus = isNetCash ? 5 : netDebtToEbitda != null && netDebtToEbitda > 2.5 ? -8 : 0;
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
    fairValue,
    upsidePct,
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
    isBankOrInsurance,
    isValueTrap,
    isStalePeriod,
    groupKey,
    compositeRankScore,
    recommendedWeightPct: 0,
    inCurrentPortfolio: portfolioSet.has(ticker),
    filterReasons: [],
    cautionNotes: [],
    roleSummary: '',
  };
}

export function buildForensicPortfolioPlan(
  reports: SavedReport[],
  currentPortfolioTickers: string[],
  partialConfig?: Partial<PortfolioArchitectConfig>
): ForensicPortfolioPlan {
  const config: PortfolioArchitectConfig = {
    ...DEFAULT_PORTFOLIO_ARCHITECT_CONFIG,
    ...(partialConfig || {}),
  };

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

  const candidates = uniqueReports.map(r => resolveCandidateFromReport(r, portfolioSet, maxPeriodKey));

  const rawAl = candidates
    .filter(c => c.decision === 'AL')
    .sort((a, b) => b.compositeRankScore - a.compositeRankScore);
  const rawNotr = candidates
    .filter(c => c.decision === 'NÖTR')
    .sort((a, b) => b.compositeRankScore - a.compositeRankScore);
  const rawAlma = candidates.filter(c => c.decision === 'ALMA');

  // Konsolide grup liderini belirle (TRENJ vs TRMET gibi aynı grubu paylaşanlardan yalnızca en yüksek sıralıyı tut)
  const chosenGroupLeader = new Map<string, string>();
  if (config.deduplicateGroupHoldings) {
    for (const c of rawAl) {
      if (!c.groupKey) continue;
      if (!chosenGroupLeader.has(c.groupKey)) {
        chosenGroupLeader.set(c.groupKey, c.ticker);
      }
    }
  }

  const tier1CoreAl: ForensicPortfolioCandidate[] = [];
  const tier2SatelliteAl: ForensicPortfolioCandidate[] = [];
  const tier3FilteredAl: ForensicPortfolioCandidate[] = [];

  for (const cand of rawAl) {
    const filterReasons: string[] = [];
    const cautionNotes: string[] = [];

    if (cand.isValueTrap) {
      filterReasons.push('Değer tuzağı bayrağı aktif');
    }
    if (cand.isStalePeriod) {
      filterReasons.push(`Bayat bilanço dönemi (${cand.period})`);
    }
    if (
      config.deduplicateGroupHoldings &&
      cand.groupKey &&
      chosenGroupLeader.get(cand.groupKey) &&
      chosenGroupLeader.get(cand.groupKey) !== cand.ticker
    ) {
      filterReasons.push(
        `Konsolide grup çift sayımı (${chosenGroupLeader.get(cand.groupKey)} ile aynı konsolide mali yapı)`
      );
    }
    if (!cand.isBankOrInsurance) {
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

    cand.filterReasons = filterReasons;

    if (filterReasons.length > 0) {
      cand.tier = 'TIER_3_FILTERED';
      cand.roleSummary = 'Adli Stres Filtresine Takıldı';
      tier3FilteredAl.push(cand);
      continue;
    }

    // İkincil Uyarılar (Tier-1 vs Tier-2 ayrımı: yüksek kaldıraç, çok düşük cari oran, sınırda EVA < 1 veya grup temsilciliği)
    if (!cand.isBankOrInsurance && cand.netDebtToEbitda !== null && cand.netDebtToEbitda > 2.5) {
      cautionNotes.push(`Yüksek kaldıraç (Net Borç/FAVÖK ${cand.netDebtToEbitda}x)`);
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
    if (!cand.isBankOrInsurance && cand.ocfConversionPct !== null && cand.ocfConversionPct < 60) {
      trapReasons.push(`Zayıf nakit dönüşümü (%${cand.ocfConversionPct})`);
    }
    if (!cand.isBankOrInsurance && cand.wcShareOfOcfPct !== null && cand.wcShareOfOcfPct >= 70) {
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
      (cand.isBankOrInsurance || cand.ocfConversionPct === null || cand.ocfConversionPct >= 75);

    if (isQualityNeutral) {
      cand.tier = 'A_PLUS_NEUTRAL';
      cand.roleSummary = `A+ Kalite (Skor ${cand.score}) • Dar İskonto (+%${cand.upsidePct})`;
      tierANeutralCandidates.push(cand);
    }
  }

  neutralValueTraps.sort((a, b) => b.upsidePct - a.upsidePct);

  // Model Portföy Seçimi (Sektör ve Grup Çeşitlendirme Kurallarıyla)
  const selectedHoldings: ForensicPortfolioCandidate[] = [];
  const selectedNeutralSlots = Math.min(config.includeHighQualityNeutralCount, tierANeutralCandidates.length);
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
  // A+ Kalite NÖTR kontenjanını ekle
  if (selectedNeutralSlots > 0) {
    trySelect(tierANeutralCandidates, selectedHoldings.length + selectedNeutralSlots, true);
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
  for (let iter = 0; iter < 5; iter++) {
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
            return w + (excess * w) / uncappedWeightSum;
          }
          return w;
        });
      }
    }
  }

  // %100'e temiz yuvarla
  const finalSum = weights.reduce((a, b) => a + b, 0);
  if (finalSum > 0) {
    weights = weights.map(w => round1((w / finalSum) * 100));
    const roundedSum = weights.reduce((a, b) => a + b, 0);
    if (weights.length > 0 && Math.abs(100 - roundedSum) >= 0.05) {
      weights[0] = round1(weights[0] + (100 - roundedSum));
    }
  }

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
    } else if (cand.tier === 'TIER_3_FILTERED') {
      outReason = cand.filterReasons[0] || '4 Boyutlu Adli Stres filtresinden düştü';
      severity = 'HIGH';
    } else if (cand.tier === 'TRAP_NEUTRAL') {
      outReason = cand.filterReasons[0] || 'NÖTR havuzunda adli kusur tespit edildi';
      severity = 'HIGH';
    } else if (cand.upsidePct < config.rotationTakeProfitUpsideThresholdPct) {
      outReason = `Adil değerine yaklaştı (Kalan potansiyel ${cand.upsidePct >= 0 ? '+' : ''}%${cand.upsidePct} < %${config.rotationTakeProfitUpsideThresholdPct} eşiği) — Kâr Al / Rotasyon`;
      severity = cand.upsidePct <= 0 ? 'HIGH' : 'MEDIUM';
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

  return {
    config,
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
    sectorBreakdown,
    weightedAvgUpsidePct,
    weightedAvgScore,
    weightedAvgEvaPct,
    rotationSignals: {
      rotateOut,
      hold,
      rotateIn: rotateInPool,
    },
  };
}
