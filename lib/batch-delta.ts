import {
  calculateSectorScore,
  getAnnualizationFactor,
  parseFinancialNumber,
  parsePeriodSortKey,
  type SectorScoreResult,
} from './valuation.ts';
import { detectSector, type SectorType } from './sectors.ts';
import {
  parseNumericScore,
  type SavedReport,
} from './report-resolver.ts';

export interface ChangeDriverItem {
  key: string;
  label: string;
  prevFormatted: string;
  currFormatted: string;
  deltaFormatted: string;
  direction: 'IMPROVED' | 'DETERIORATED' | 'FLAT';
  magnitude: number;
  explanation: string;
}

export interface ScoreCategoryDelta {
  category: string;
  prevScore: number;
  currScore: number;
  maxScore: number;
  delta: number;
  currReason: string;
}

export interface PeriodChangeAttribution {
  comparedAt: string;
  prevPeriod: string | null;
  currPeriod: string | null;
  isNewQuarter: boolean;
  prevDecision: string | null;
  currDecision: string;
  decisionTransition: 'UPGRADED' | 'DOWNGRADED' | 'UNCHANGED';
  prevScore: number | null;
  currScore: number | null;
  scoreDelta: number | null;
  prevFairValue: number | null;
  currFairValue: number | null;
  fairValueDeltaPct: number | null;
  prevPrice: number | null;
  currPrice: number | null;
  prevUpsidePct: number | null;
  currUpsidePct: number | null;
  upsideDeltaPct: number | null;
  scoreBreakdownDeltas: ScoreCategoryDelta[];
  improvements: ChangeDriverItem[];
  deteriorations: ChangeDriverItem[];
  impactNarrative: string;
}

function decisionRank(dec?: string | null): number {
  const norm = String(dec || '').trim().toUpperCase();
  if (norm === 'AL' || norm === 'GÜÇLÜ AL') return 3;
  if (norm === 'ALMA' || norm === 'SAT' || norm === 'GÜÇLÜ SAT') return 1;
  return 2; // NÖTR / diğer
}

function formatCompactMoneyShort(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} Mr`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} Mn`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)} B`;
  return `${sign}${abs.toFixed(0)}`;
}

function resolveNetDebtToAnnualEbitda(item: any): {
  ratio: number | null;
  isNetCash: boolean;
  netDebt: number | null;
} {
  const netDebt = parseFinancialNumber(item?.net_debt);
  const ebitda = parseFinancialNumber(item?.ebitda);
  if (netDebt !== null && netDebt <= 0) {
    return { ratio: 0, isNetCash: true, netDebt };
  }
  if (netDebt !== null && ebitda !== null && ebitda > 0) {
    const annFactor = getAnnualizationFactor(item?.period);
    const annEbitda = ebitda * annFactor;
    if (annEbitda > 0) {
      return { ratio: Number((netDebt / annEbitda).toFixed(2)), isNetCash: false, netDebt };
    }
  }
  return { ratio: null, isNetCash: false, netDebt };
}

function resolveEvaNum(item: any): number | null {
  const explicit = parseFinancialNumber(item?.eva_spread);
  if (explicit !== null) return explicit;
  const roic = parseFinancialNumber(item?.roic);
  const wacc = parseFinancialNumber(
    item?.is_tms29 ? (item?.real_wacc ?? item?.benchmark_wacc ?? item?.wacc) : (item?.wacc ?? item?.real_wacc)
  );
  if (roic !== null && wacc !== null) {
    return Number((roic - wacc).toFixed(1));
  }
  return null;
}

/**
 * İki finansal dönem ve varsa önceki rapor arasında dönemsel operasyonel/adli değişimleri
 * hesaplayarak puan, karar ve adil değer üzerindeki nedensel etkiyi ayrıştırır.
 */
export function computeReportChangeAttribution(params: {
  ticker: string;
  sector?: SectorType;
  prevReport?: any | null;
  currData: any;
  currPrice?: number | string | null;
  currDecision?: string | null;
  currScore?: number | string | null;
  currFairValue?: number | string | null;
}): PeriodChangeAttribution | null {
  const { ticker, sector, prevReport, currData } = params;
  if (!currData || typeof currData !== 'object') return null;

  const cleanTicker = String(ticker || currData?.ticker || '').trim().toUpperCase();
  const resolvedSector: SectorType =
    sector || currData?.sector || detectSector(cleanTicker, currData?.company_name);

  const rawHistory: any[] = Array.isArray(currData?.financial_history) ? currData.financial_history : [];
  const sortedHistory = [...rawHistory]
    .filter((h) => h && h.period)
    .sort((a, b) => parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period));

  if (sortedHistory.length < 2 && !prevReport) {
    return null;
  }

  const currItem = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1] : null;
  const currPeriod = String(
    currItem?.period || currData?.reporting_period || currData?.unified_metrics?.period || ''
  ).trim() || null;

  const prevExt = prevReport?.extractedData ?? prevReport?.extracted_data ?? {};
  const prevRepPeriod = String(prevReport?.period || prevExt?.reporting_period || '').trim();
  const prevRepKey = parsePeriodSortKey(prevRepPeriod);
  const currPeriodKey = parsePeriodSortKey(currPeriod || '');

  // Karşılaştırılacak önceki çeyrek öğesini belirle
  let prevIdx = sortedHistory.length - 2;
  if (prevRepPeriod && currPeriodKey > 0 && prevRepKey > 0 && prevRepKey < currPeriodKey) {
    const matchedIdx = sortedHistory.findIndex((h) => parsePeriodSortKey(h.period) === prevRepKey);
    if (matchedIdx >= 0 && matchedIdx < sortedHistory.length - 1) {
      prevIdx = matchedIdx;
    }
  }
  if (prevIdx < 0 && sortedHistory.length === 0 && !prevReport) {
    return null;
  }

  const prevItem = prevIdx >= 0 ? sortedHistory[prevIdx] : null;
  const prevPeriod = prevItem?.period
    ? String(prevItem.period).trim()
    : (prevRepPeriod || null);

  if (!currPeriod && !prevPeriod) return null;

  const isNewQuarter = Boolean(
    prevPeriod &&
      currPeriod &&
      parsePeriodSortKey(currPeriod) > parsePeriodSortKey(prevPeriod)
  );

  const officialSecName = currData?.official_sector_name || prevExt?.official_sector_name;

  // Güncel ve Önceki dönem 4-kategori skor kırılımları
  let currScoreResult: SectorScoreResult | null = null;
  let prevScoreResult: SectorScoreResult | null = null;

  try {
    if (sortedHistory.length > 0) {
      currScoreResult =
        currData?.scoreResult && Array.isArray(currData.scoreResult.breakdown)
          ? currData.scoreResult
          : calculateSectorScore(
              { ...currData, ticker: cleanTicker, financial_history: sortedHistory },
              resolvedSector,
              officialSecName
            );
    }
  } catch {}

  try {
    if (prevIdx >= 0) {
      prevScoreResult = calculateSectorScore(
        {
          ...currData,
          ticker: cleanTicker,
          financial_history: sortedHistory.slice(0, prevIdx + 1),
        },
        resolvedSector,
        officialSecName
      );
    }
  } catch {}

  const currScore =
    parseNumericScore(params.currScore ?? currData?.valuation?.score ?? currScoreResult?.totalScore) ??
    null;

  // Eğer prevReport farklı döneme / farklı kimliğe aitse onun skor & adil değerini önceliklendir
  const historySnapshots: any[] = Array.isArray(currData?.analysis_history)
    ? currData.analysis_history
    : Array.isArray(prevExt?.analysis_history)
    ? prevExt.analysis_history
    : [];

  const isPrevReportDistinct = Boolean(
    prevReport &&
      ((prevRepPeriod && currPeriod && parsePeriodSortKey(prevRepPeriod) < parsePeriodSortKey(currPeriod)) ||
        (prevReport.id && currData?.id && String(prevReport.id) !== String(currData.id)))
  );

  const matchedSnapshot =
    !isPrevReportDistinct && prevPeriod
      ? historySnapshots.find((s) => String(s?.period || '').trim() === prevPeriod) || historySnapshots[0]
      : null;

  const prevScore =
    (isPrevReportDistinct ? parseNumericScore(prevReport?.score) : null) ??
    (matchedSnapshot ? parseNumericScore(matchedSnapshot.score) : null) ??
    (prevScoreResult ? prevScoreResult.totalScore : null);

  const scoreDelta =
    currScore !== null && prevScore !== null ? Math.round(currScore - prevScore) : null;

  const currFairValue = parseFinancialNumber(
    params.currFairValue ?? currData?.valuation?.fair_value ?? currData?.fair_value
  );
  const currPrice = parseFinancialNumber(
    params.currPrice ?? currData?.current_price ?? currData?.valuation?.current_price ?? currItem?.share_price
  );

  const fvTrend: any[] = Array.isArray(currData?.valuation?.fair_value_trend)
    ? currData.valuation.fair_value_trend
    : [];
  const trendMatch = prevPeriod
    ? fvTrend.find((t) => parsePeriodSortKey(t?.period || '') === parsePeriodSortKey(prevPeriod))
    : null;

  const prevFairValue =
    (isPrevReportDistinct
      ? parseFinancialNumber(
          prevReport?.fairValue ?? prevExt?.valuation?.fair_value ?? prevExt?.fair_value
        )
      : null) ??
    parseFinancialNumber(matchedSnapshot?.fairValue) ??
    parseFinancialNumber(trendMatch?.fairValue);

  const prevPrice =
    (isPrevReportDistinct
      ? parseFinancialNumber(prevReport?.price ?? prevExt?.current_price)
      : null) ??
    parseFinancialNumber(matchedSnapshot?.price) ??
    parseFinancialNumber(trendMatch?.sharePrice ?? prevItem?.share_price);

  const fairValueDeltaPct =
    currFairValue !== null && prevFairValue !== null && prevFairValue > 0
      ? Number((((currFairValue - prevFairValue) / prevFairValue) * 100).toFixed(1))
      : null;

  const currUpsidePct =
    currFairValue !== null && currPrice !== null && currPrice > 0
      ? Number((((currFairValue - currPrice) / currPrice) * 100).toFixed(1))
      : null;
  const prevUpsidePct =
    prevFairValue !== null && prevPrice !== null && prevPrice > 0
      ? Number((((prevFairValue - prevPrice) / prevPrice) * 100).toFixed(1))
      : null;
  const upsideDeltaPct =
    currUpsidePct !== null && prevUpsidePct !== null
      ? Number((currUpsidePct - prevUpsidePct).toFixed(1))
      : null;

  const currDecision = String(
    params.currDecision ||
      currData?.optimization?.finalDecision ||
      currData?.valuation?.final_decision ||
      currData?.valuation?.decision ||
      'NÖTR'
  )
    .trim()
    .toUpperCase();

  let prevDecisionRaw: string | null = isPrevReportDistinct
    ? String(prevReport?.decision || prevExt?.optimization?.finalDecision || '').trim().toUpperCase() || null
    : matchedSnapshot?.decision
    ? String(matchedSnapshot.decision).trim().toUpperCase()
    : null;

  if (!prevDecisionRaw && prevScoreResult) {
    if (prevScoreResult.suggestedDecision === 'AL' && prevUpsidePct !== null && prevUpsidePct < 20) {
      prevDecisionRaw = 'NÖTR';
    } else {
      prevDecisionRaw = prevScoreResult.suggestedDecision;
    }
  }

  let decisionTransition: 'UPGRADED' | 'DOWNGRADED' | 'UNCHANGED' = 'UNCHANGED';
  if (prevDecisionRaw) {
    const rCurr = decisionRank(currDecision);
    const rPrev = decisionRank(prevDecisionRaw);
    if (rCurr > rPrev) decisionTransition = 'UPGRADED';
    else if (rCurr < rPrev) decisionTransition = 'DOWNGRADED';
  }

  // 4-Kategori Skor Kırılım Farkları
  const scoreBreakdownDeltas: ScoreCategoryDelta[] = [];
  if (currScoreResult?.breakdown && prevScoreResult?.breakdown) {
    const len = Math.min(currScoreResult.breakdown.length, prevScoreResult.breakdown.length);
    for (let i = 0; i < len; i++) {
      const cCat = currScoreResult.breakdown[i];
      const pCat = prevScoreResult.breakdown[i];
      scoreBreakdownDeltas.push({
        category: cCat.category || pCat.category,
        prevScore: pCat.score,
        currScore: cCat.score,
        maxScore: cCat.maxScore || 25,
        delta: cCat.score - pCat.score,
        currReason: cCat.reason || '',
      });
    }
  }

  // Operasyonel & Adli Metrik İyileşme / Kötüleşme Ayrıştırması
  const improvements: ChangeDriverItem[] = [];
  const deteriorations: ChangeDriverItem[] = [];
  const isFinancialInstitution = resolvedSector === 'BANKING' || resolvedSector === 'INSURANCE';

  if (prevItem && currItem) {
    const pushSignedPctDriver = (
      key: string,
      label: string,
      prevVal: number | null,
      currVal: number | null,
      minThreshold: number,
      suffix: string,
      isBps = false
    ) => {
      if (prevVal === null || currVal === null || !Number.isFinite(prevVal) || !Number.isFinite(currVal)) return;
      const diff = currVal - prevVal;
      if (Math.abs(diff) < minThreshold) return;
      const direction: 'IMPROVED' | 'DETERIORATED' = diff > 0 ? 'IMPROVED' : 'DETERIORATED';
      const deltaFormatted = isBps
        ? `${diff > 0 ? '+' : ''}${Math.round(diff * 100)} bps`
        : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${suffix}`;
      const entry: ChangeDriverItem = {
        key,
        label,
        prevFormatted: `%${prevVal.toFixed(1)}`,
        currFormatted: `%${currVal.toFixed(1)}`,
        deltaFormatted,
        direction,
        magnitude: Math.abs(diff) + (direction === 'DETERIORATED' ? 0.1 : 0),
        explanation: `${label} ${prevPeriod || 'önceki dönem'} (%${prevVal.toFixed(1)}) → ${currPeriod || 'güncel'} (%${currVal.toFixed(1)})`,
      };
      if (direction === 'IMPROVED') improvements.push(entry);
      else deteriorations.push(entry);
    };

    if (!isFinancialInstitution) {
      pushSignedPctDriver(
        'ebitda_margin',
        'FAVÖK Marjı',
        parseFinancialNumber(prevItem.ebitda_margin),
        parseFinancialNumber(currItem.ebitda_margin),
        0.5,
        'p',
        true
      );
    }

    pushSignedPctDriver(
      'net_margin',
      'Net Kâr Marjı',
      parseFinancialNumber(prevItem.net_margin),
      parseFinancialNumber(currItem.net_margin),
      0.5,
      'p',
      true
    );

    pushSignedPctDriver(
      'roe',
      'Özkaynak Kârlılığı (ROE)',
      parseFinancialNumber(prevItem.roe),
      parseFinancialNumber(currItem.roe),
      1.0,
      'p'
    );

    if (!isFinancialInstitution) {
      pushSignedPctDriver(
        'roic',
        'Sermaye Verimliliği (ROIC)',
        parseFinancialNumber(prevItem.roic),
        parseFinancialNumber(currItem.roic),
        1.0,
        'p'
      );

      pushSignedPctDriver(
        'eva_spread',
        'Reel EVA Makası',
        resolveEvaNum(prevItem),
        resolveEvaNum(currItem),
        1.0,
        'p'
      );

      // Net Borç / FAVÖK (Borçluluk)
      const prevDebt = resolveNetDebtToAnnualEbitda(prevItem);
      const currDebt = resolveNetDebtToAnnualEbitda(currItem);
      if (prevDebt.isNetCash && !currDebt.isNetCash && currDebt.ratio !== null) {
        deteriorations.push({
          key: 'leverage',
          label: 'Net Borç / FAVÖK',
          prevFormatted: 'Net Nakit',
          currFormatted: `${currDebt.ratio.toFixed(2)}x`,
          deltaFormatted: `Net Borca Geçiş (${currDebt.ratio.toFixed(2)}x)`,
          direction: 'DETERIORATED',
          magnitude: 12 + currDebt.ratio * 4,
          explanation: `Şirket net nakit pozisyonundan ${currDebt.ratio.toFixed(2)}x Net Borç / FAVÖK seviyesine geçti.`,
        });
      } else if (!prevDebt.isNetCash && prevDebt.ratio !== null && currDebt.isNetCash) {
        improvements.push({
          key: 'leverage',
          label: 'Net Borç / FAVÖK',
          prevFormatted: `${prevDebt.ratio.toFixed(2)}x`,
          currFormatted: 'Net Nakit',
          deltaFormatted: 'Net Nakde Geçiş',
          direction: 'IMPROVED',
          magnitude: 12 + prevDebt.ratio * 4,
          explanation: `Net borçluluk ${prevDebt.ratio.toFixed(2)}x seviyesinden net nakit pozisyonuna döndü.`,
        });
      } else if (prevDebt.ratio !== null && currDebt.ratio !== null) {
        const levDiff = currDebt.ratio - prevDebt.ratio;
        if (Math.abs(levDiff) >= 0.25) {
          const isImproved = levDiff < 0;
          const levItem: ChangeDriverItem = {
            key: 'leverage',
            label: 'Net Borç / FAVÖK',
            prevFormatted: `${prevDebt.ratio.toFixed(2)}x`,
            currFormatted: `${currDebt.ratio.toFixed(2)}x`,
            deltaFormatted: `${levDiff > 0 ? '+' : ''}${levDiff.toFixed(2)}x`,
            direction: isImproved ? 'IMPROVED' : 'DETERIORATED',
            magnitude: Math.abs(levDiff) * 5,
            explanation: `Net Borç / FAVÖK ${prevDebt.ratio.toFixed(2)}x → ${currDebt.ratio.toFixed(2)}x`,
          };
          if (isImproved) improvements.push(levItem);
          else deteriorations.push(levItem);
        }
      }

      // Serbest Nakit Akışı (FCF)
      const prevFcf = parseFinancialNumber(prevItem.free_cash_flow);
      const currFcf = parseFinancialNumber(currItem.free_cash_flow);
      if (prevFcf !== null && currFcf !== null) {
        const relThreshold = Math.max(1e6, Math.abs(prevFcf) * 0.15);
        if (Math.abs(currFcf - prevFcf) >= relThreshold || (prevFcf < 0 && currFcf > 0) || (prevFcf > 0 && currFcf < 0)) {
          const isImproved = currFcf > prevFcf;
          const pctStr =
            Math.abs(prevFcf) > 1e5
              ? `${isImproved ? '+' : ''}%${Math.min(999, Math.abs(((currFcf - prevFcf) / prevFcf) * 100)).toFixed(0)}`
              : formatCompactMoneyShort(currFcf - prevFcf);
          const fcfItem: ChangeDriverItem = {
            key: 'fcf',
            label: 'Serbest Nakit Akışı',
            prevFormatted: formatCompactMoneyShort(prevFcf),
            currFormatted: formatCompactMoneyShort(currFcf),
            deltaFormatted:
              prevFcf < 0 && currFcf > 0
                ? 'Pozitife Döndü'
                : prevFcf > 0 && currFcf < 0
                ? 'Negatife Döndü'
                : pctStr,
            direction: isImproved ? 'IMPROVED' : 'DETERIORATED',
            magnitude:
              (prevFcf < 0 && currFcf > 0) || (prevFcf > 0 && currFcf < 0)
                ? 14
                : Math.min(12, Math.abs((currFcf - prevFcf) / Math.max(1, Math.abs(prevFcf))) * 5),
            explanation: `Serbest nakit akışı ${formatCompactMoneyShort(prevFcf)} → ${formatCompactMoneyShort(currFcf)}`,
          };
          if (isImproved) improvements.push(fcfItem);
          else deteriorations.push(fcfItem);
        }
      }

      // Cari Oran (Likidite)
      const prevCr = parseFinancialNumber(prevItem.current_ratio);
      const currCr = parseFinancialNumber(currItem.current_ratio);
      if (prevCr !== null && currCr !== null && Math.abs(currCr - prevCr) >= 0.15) {
        const crDiff = currCr - prevCr;
        const isImproved = crDiff > 0;
        const crItem: ChangeDriverItem = {
          key: 'current_ratio',
          label: 'Cari Oran',
          prevFormatted: `${prevCr.toFixed(2)}x`,
          currFormatted: `${currCr.toFixed(2)}x`,
          deltaFormatted: `${crDiff > 0 ? '+' : ''}${crDiff.toFixed(2)}x`,
          direction: isImproved ? 'IMPROVED' : 'DETERIORATED',
          magnitude: Math.abs(crDiff) * 3,
          explanation: `Likidite (Cari Oran) ${prevCr.toFixed(2)}x → ${currCr.toFixed(2)}x`,
        };
        if (isImproved) improvements.push(crItem);
        else deteriorations.push(crItem);
      }
    }
  }

  improvements.sort((a, b) => b.magnitude - a.magnitude);
  deteriorations.sort((a, b) => b.magnitude - a.magnitude);

  // Anlaşılır ve nedensel özet cümle üret
  const parts: string[] = [];
  if (prevPeriod && currPeriod && prevPeriod !== currPeriod) {
    parts.push(`${prevPeriod} → ${currPeriod} geçişinde`);
  } else if (currPeriod) {
    parts.push(`${currPeriod} güncellemesinde`);
  }

  if (improvements.length > 0 && deteriorations.length > 0) {
    parts.push(
      `${improvements.slice(0, 2).map((i) => `${i.label} (${i.deltaFormatted})`).join(', ')} iyileşirken; ${deteriorations.slice(0, 2).map((d) => `${d.label} (${d.deltaFormatted})`).join(', ')} zayıfladı.`
    );
  } else if (improvements.length > 0) {
    parts.push(
      `${improvements.slice(0, 2).map((i) => `${i.label} (${i.deltaFormatted})`).join(', ')} cephesinde belirgin güçlenme görüldü.`
    );
  } else if (deteriorations.length > 0) {
    parts.push(
      `${deteriorations.slice(0, 2).map((d) => `${d.label} (${d.deltaFormatted})`).join(', ')} tarafında bozulma kaydedildi.`
    );
  } else {
    parts.push('operasyonel rasyolar önceki dönemle dengeli seyretti.');
  }

  const impactBits: string[] = [];
  if (prevScore !== null && currScore !== null) {
    impactBits.push(
      scoreDelta === 0
        ? `Skor ${currScore}/100 seviyesinde korundu`
        : `Skor ${prevScore} → ${currScore} (${scoreDelta! > 0 ? '+' : ''}${scoreDelta}p)`
    );
  }
  if (prevFairValue !== null && currFairValue !== null && fairValueDeltaPct !== null) {
    impactBits.push(
      `Adil Değer ₺${prevFairValue.toFixed(2)} → ₺${currFairValue.toFixed(2)} (${fairValueDeltaPct > 0 ? '+' : ''}%${fairValueDeltaPct})`
    );
  }
  if (prevDecisionRaw && prevDecisionRaw !== currDecision) {
    impactBits.push(`Karar ${prevDecisionRaw} → ${currDecision}`);
  } else {
    impactBits.push(`Karar ${currDecision} korundu`);
  }

  const impactNarrative = `${parts.join(' ')} ${impactBits.join(' · ')}.`;

  return {
    comparedAt: new Date().toISOString(),
    prevPeriod,
    currPeriod,
    isNewQuarter,
    prevDecision: prevDecisionRaw,
    currDecision,
    decisionTransition,
    prevScore,
    currScore,
    scoreDelta,
    prevFairValue,
    currFairValue,
    fairValueDeltaPct,
    prevPrice,
    currPrice,
    prevUpsidePct,
    currUpsidePct,
    upsideDeltaPct,
    scoreBreakdownDeltas,
    improvements: improvements.slice(0, 5),
    deteriorations: deteriorations.slice(0, 5),
    impactNarrative,
  };
}

/**
 * Kayıtlı bir SavedReport üzerinde kayıtlı period_delta alanını döndürür;
 * yoksa extractedData.financial_history ve analysis_history verisinden anında türetir.
 */
export function resolveReportAttribution(report: SavedReport | null | undefined): PeriodChangeAttribution | null {
  if (!report) return null;
  const ed = report.extractedData || (report as any).extracted_data || {};
  const existing = ed?.period_delta;
  if (
    existing &&
    typeof existing === 'object' &&
    Array.isArray(existing.improvements) &&
    Array.isArray(existing.deteriorations)
  ) {
    return existing as PeriodChangeAttribution;
  }

  return computeReportChangeAttribution({
    ticker: report.ticker,
    sector: (report.sector || ed?.sector) as SectorType | undefined,
    currData: ed,
    currPrice: report.price,
    currDecision: report.decision,
    currScore: report.score,
    currFairValue: report.fairValue,
  });
}
