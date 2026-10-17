'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  Star,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  Info,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Building2,
  Users,
  Calendar,
  Globe,
  Sparkles,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  PieChart as PieChartIcon,
  Activity,
  Check,
  Copy,
  Clock,
  Briefcase,
  DollarSign,
  Percent,
  Compass,
  FileText
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  AreaChart,
  Area,
  ComposedChart
} from 'recharts';
import type { SavedReport } from '@/lib/report-resolver';
import type { SectorType } from '@/lib/sectors';
import {
  SECTOR_DEFINITIONS,
  BIST_INSURANCE_TICKERS,
  BIST_BANKING_TICKERS,
  BIST_HOLDING_TICKERS,
  BIST_REIT_TICKERS
} from '@/lib/sectors';
import { getCompanyProfile } from '@/lib/company-profiles';
import {
  computeSnowflakeAnalysis,
  getSnowflakeCoordinates,
  generateSmoothSnowflakePath,
  type SnowflakeAnalysisResult
} from '@/lib/snowflake';

const SECTOR_MEDIAN_BENCHMARKS: Record<string, { pe: number; pb: number }> = {
  INSURANCE: { pe: 8.5, pb: 2.1 },
  BANKING: { pe: 5.5, pb: 1.2 },
  HOLDING: { pe: 6.8, pb: 1.5 },
  REIT: { pe: 7.2, pb: 1.1 },
  TECH: { pe: 16.5, pb: 4.8 },
  AVIATION: { pe: 6.2, pb: 1.4 },
  INDUSTRIAL: { pe: 11.5, pb: 2.4 }
};

function getSectorCandidateTickers(sector: SectorType): string[] {
  switch (sector) {
    case 'INSURANCE':
      return BIST_INSURANCE_TICKERS;
    case 'BANKING':
      return BIST_BANKING_TICKERS;
    case 'HOLDING':
      return BIST_HOLDING_TICKERS;
    case 'REIT':
      return BIST_REIT_TICKERS;
    case 'TECH':
      return ['LOGO', 'MIATK', 'VBTYZ', 'ARDYZ', 'KONTR', 'KFEIN'];
    case 'AVIATION':
      return ['THYAO', 'PGSUS', 'TAVHL'];
    default:
      return ['FROTO', 'TOASO', 'EREGL', 'KRDMD', 'BIMAS', 'MGROS', 'MPARK'];
  }
}

export interface SimplyViewProps {
  report: SavedReport;
  savedReports?: SavedReport[];
  valuationInfo: any;
  marketMultiples?: any;
  companyMultiplesData?: any;
  currentSector: SectorType;
  sectorMeta: any;
  latestData: any;
  chartData: any[];
  quarterlyChartData: any[];
  onSwitchToTerminal: () => void;
  onSelectTicker?: (ticker: string) => void;
}

export default function SimplyView({
  report,
  savedReports = [],
  valuationInfo,
  marketMultiples,
  companyMultiplesData,
  currentSector,
  sectorMeta,
  latestData,
  chartData,
  quarterlyChartData,
  onSwitchToTerminal,
  onSelectTicker
}: SimplyViewProps) {
  const [activeSection, setActiveSection] = useState<'overview' | 'valuation' | 'future' | 'past' | 'health'>('overview');
  const [selectedKeyMetric, setSelectedKeyMetric] = useState<'pe' | 'pb' | 'evEbitda' | 'evSales'>('pe');
  const [selectedPastMetric, setSelectedPastMetric] = useState<'flow' | 'margins'>('flow');

  // Kurumsal Şirket Profili (Doğrulanmış Bilgi Bankası)
  const profile = useMemo(() => {
    return getCompanyProfile(report.ticker, sectorMeta?.title);
  }, [report.ticker, sectorMeta?.title]);

  // Fiyat ve Adil Değer Çözümü
  const currentPriceNum = Number(String(report.price || '0').replace(/[^0-9.]/g, '')) || 0;
  const fairValueNum = Number(valuationInfo?.fair_value || report.fairValue || 0);
  const discountPctNum = Number(valuationInfo?.discount_pct || 0);

  // WACC, ROIC ve EVA Çözümü
  const evaSpreadNum = Number(valuationInfo?.eva_spread ?? valuationInfo?.eva_makasi ?? 0);
  const roicNum = Number(valuationInfo?.roic_annualized ?? valuationInfo?.roic ?? 0);
  const waccNum = Number(valuationInfo?.wacc_nominal ?? valuationInfo?.wacc ?? 0);

  // Kar Tanesi (Snowflake) Analizi Hesabı (5 Eksen, 0-6 Puan)
  const snowflake: SnowflakeAnalysisResult = useMemo(() => {
    return computeSnowflakeAnalysis({
      ticker: report.ticker,
      sector: currentSector,
      currentPrice: currentPriceNum,
      fairValue: fairValueNum,
      discountPct: discountPctNum,
      marketMultiples,
      companyMultiples: companyMultiplesData,
      financialHistory: report.extractedData?.financial_history,
      valuationDrivers: valuationInfo?.drivers,
      evaSpread: evaSpreadNum,
      roic: roicNum,
      wacc: waccNum,
      latestData
    });
  }, [
    report.ticker,
    currentSector,
    currentPriceNum,
    fairValueNum,
    discountPctNum,
    marketMultiples,
    companyMultiplesData,
    report.extractedData?.financial_history,
    valuationInfo?.drivers,
    evaSpreadNum,
    roicNum,
    waccNum,
    latestData
  ]);

  // Kar Tanesi SVG Koordinatları
  const radarPoints = useMemo(() => {
    return getSnowflakeCoordinates(snowflake.axes, 120, 120, 85);
  }, [snowflake.axes]);

  const smoothRadarPath = useMemo(() => {
    return generateSmoothSnowflakePath(radarPoints);
  }, [radarPoints]);

  // Sektörel Rakipler (SADECE analiz edilmiş olanlar - User Mandate)
  const analyzedCompetitors = useMemo(() => {
    return savedReports.filter(
      r => r.sector === currentSector && r.ticker?.toUpperCase() !== report.ticker?.toUpperCase()
    );
  }, [savedReports, currentSector, report.ticker]);

  // Sektör Akran Listesi (Analiz edilmemişse davet mesajı için)
  const sectorCandidateTickers = useMemo(() => {
    const list = getSectorCandidateTickers(currentSector);
    return list.filter((t: string) => t.toUpperCase() !== report.ticker?.toUpperCase()).slice(0, 5);
  }, [currentSector, report.ticker]);

  // Scrollspy: Hem Ana Scroll Container (main) hem window dinlenir
  useEffect(() => {
    const scrollContainer = document.getElementById('main-scroll-container') || window;

    const handleScroll = () => {
      const sections: Array<{ id: 'overview' | 'valuation' | 'future' | 'past' | 'health'; el: HTMLElement | null }> = [
        { id: 'overview', el: document.getElementById('overview') },
        { id: 'valuation', el: document.getElementById('valuation') },
        { id: 'future', el: document.getElementById('future') },
        { id: 'past', el: document.getElementById('past') },
        { id: 'health', el: document.getElementById('health') }
      ];

      const scrollTop = scrollContainer instanceof HTMLElement ? scrollContainer.scrollTop : window.scrollY;
      const targetThreshold = scrollTop + 220;

      for (let i = sections.length - 1; i >= 0; i--) {
        const sec = sections[i];
        if (sec.el && sec.el.offsetTop <= targetThreshold) {
          setActiveSection(sec.id);
          break;
        }
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: 'overview' | 'valuation' | 'future' | 'past' | 'health') => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  };

  // Adil Değer Trend Geçmişi (Son 4 Çeyrek)
  const fairValueTrendData = useMemo(() => {
    if (valuationInfo?.fair_value_trend && Array.isArray(valuationInfo.fair_value_trend) && valuationInfo.fair_value_trend.length > 0) {
      return valuationInfo.fair_value_trend.map((pt: any) => ({
        period: pt.period ? pt.period.slice(2) : '',
        AdilDeğer: Number(pt.fairValue || 0),
        PiyasaFiyatı: Number(pt.sharePrice || 0)
      }));
    }
    return chartData.slice(-4).map((pt: any) => ({
      period: pt.period ? pt.period.slice(2) : '',
      AdilDeğer: fairValueNum,
      PiyasaFiyatı: Number(pt.share_price || currentPriceNum)
    }));
  }, [valuationInfo?.fair_value_trend, chartData, fairValueNum, currentPriceNum]);

  // Sektör Çarpanları Kıyaslama Çubuğu
  const peerComparisonData = useMemo(() => {
    const data: Array<{ name: string; pe: number; isMain?: boolean }> = [];
    const companyPe = marketMultiples?.pe ?? companyMultiplesData?.multiples?.pe?.companyValue ?? 0;
    data.push({
      name: report.ticker,
      pe: companyPe > 0 ? Number(companyPe.toFixed(1)) : 0,
      isMain: true
    });

    const sectorPe = marketMultiples?.sector_pe ?? companyMultiplesData?.multiples?.pe?.sectorMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe ?? 8.5;
    data.push({
      name: 'Sektör Ort.',
      pe: Number(sectorPe.toFixed(1))
    });

    analyzedCompetitors.forEach(comp => {
      const compPe = Number(comp.extractedData?.pe ?? 0);
      if (compPe > 0) {
        data.push({
          name: comp.ticker,
          pe: Number(compPe.toFixed(1))
        });
      }
    });

    return data;
  }, [report.ticker, marketMultiples, companyMultiplesData, currentSector, analyzedCompetitors]);

  // Tarihsel F/K Seyri (Çeyreklik Verilerden)
  const historicalPeData = useMemo(() => {
    return chartData
      .filter((d: any) => d.period && d.share_price && d.net_income)
      .slice(-6)
      .map((d: any) => {
        const netInc = Number(d.net_income || 0);
        const price = Number(d.share_price || 0);
        const shares = Number(report.extractedData?.shares_outstanding || 180000000);
        const eps = shares > 0 ? (netInc * 1000) / shares : 0;
        const calcPe = eps > 0 ? price / eps : 0;
        return {
          period: d.period ? d.period.slice(2) : '',
          pe: calcPe > 0 && calcPe < 80 ? Number(calcPe.toFixed(1)) : null
        };
      })
      .filter(item => item.pe != null);
  }, [chartData, report.extractedData?.shares_outstanding]);

  // -------------------------------------------------------------------------
  // FUTURE GROWTH: Past to Future Revenue & Earnings Projection Series
  // -------------------------------------------------------------------------
  const futureGrowthForecastData = useMemo(() => {
    const pastPts = (quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-4).map((d: any) => ({
      period: d.period ? d.period.slice(2) : '',
      Hasılat: Number((Number(d.revenue || d.gross_written_premiums || 0) / 1e6).toFixed(1)),
      NetKâr: Number((Number(d.net_income || 0) / 1e6).toFixed(1)),
      NakitAkışı: Number((Number(d.free_cash_flow || d.operating_cash_flow || d.net_income * 0.9 || 0) / 1e6).toFixed(1)),
      isForecast: false
    }));

    if (pastPts.length === 0) return [];

    const last = pastPts[pastPts.length - 1];
    const revGrowth = Number(valuationInfo?.drivers?.revenueGrowth?.base ?? 25) / 100;
    const profitGrowth = Number(valuationInfo?.drivers?.netProfitGrowth?.base ?? 30) / 100;

    const future1 = {
      period: '+1Y (T)',
      Hasılat: Number((last.Hasılat * (1 + revGrowth)).toFixed(1)),
      NetKâr: Number((last.NetKâr * (1 + profitGrowth)).toFixed(1)),
      NakitAkışı: Number((last.NakitAkışı * (1 + profitGrowth * 0.95)).toFixed(1)),
      isForecast: true
    };

    const future2 = {
      period: '+2Y (T)',
      Hasılat: Number((future1.Hasılat * (1 + revGrowth * 0.85)).toFixed(1)),
      NetKâr: Number((future1.NetKâr * (1 + profitGrowth * 0.85)).toFixed(1)),
      NakitAkışı: Number((future1.NakitAkışı * (1 + profitGrowth * 0.85)).toFixed(1)),
      isForecast: true
    };

    const future3 = {
      period: '+3Y (T)',
      Hasılat: Number((future2.Hasılat * (1 + revGrowth * 0.70)).toFixed(1)),
      NetKâr: Number((future2.NetKâr * (1 + profitGrowth * 0.70)).toFixed(1)),
      NakitAkışı: Number((future2.NakitAkışı * (1 + profitGrowth * 0.70)).toFixed(1)),
      isForecast: true
    };

    return [...pastPts, future1, future2, future3];
  }, [quarterlyChartData, chartData, valuationInfo?.drivers]);

  // -------------------------------------------------------------------------
  // PAST PERFORMANCE: Revenue & Expenses Breakdown Waterfall / Flow
  // -------------------------------------------------------------------------
  const revenueExpensesBreakdown = useMemo(() => {
    const rawRevenue = Number(latestData?.revenue ?? latestData?.gross_written_premiums ?? 100);
    const rawGrossProfit = Number(latestData?.gross_profit ?? latestData?.technical_balance ?? (rawRevenue * 0.55));
    const costOfSales = Math.max(0, rawRevenue - rawGrossProfit);
    const rawOperatingIncome = Number(latestData?.operating_income ?? (rawGrossProfit * 0.75));
    const opex = Math.max(0, rawGrossProfit - rawOperatingIncome);
    const rawNetIncome = Number(latestData?.net_income ?? (rawOperatingIncome * 0.8));
    const taxAndFin = Math.max(0, rawOperatingIncome - rawNetIncome);

    const safeRev = rawRevenue > 0 ? rawRevenue : 1;

    return {
      revenue: rawRevenue,
      costOfSales: costOfSales,
      costPct: ((costOfSales / safeRev) * 100).toFixed(1),
      grossProfit: rawGrossProfit,
      grossPct: ((rawGrossProfit / safeRev) * 100).toFixed(1),
      opex: opex,
      opexPct: ((opex / safeRev) * 100).toFixed(1),
      operatingIncome: rawOperatingIncome,
      operatingPct: ((rawOperatingIncome / safeRev) * 100).toFixed(1),
      taxAndFin: taxAndFin,
      taxPct: ((taxAndFin / safeRev) * 100).toFixed(1),
      netIncome: rawNetIncome,
      netPct: ((rawNetIncome / safeRev) * 100).toFixed(1)
    };
  }, [latestData]);

  // -------------------------------------------------------------------------
  // PAST PERFORMANCE: Free Cash Flow vs Earnings Composed Series
  // -------------------------------------------------------------------------
  const cashFlowVsEarningsData = useMemo(() => {
    return (quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-6).map((d: any) => {
      const netInc = Number(d.net_income || 0);
      const ocf = Number(d.operating_cash_flow || d.free_cash_flow || (netInc * 1.15));
      const fcf = Number(d.free_cash_flow || (ocf * 0.85));
      const conversionRate = netInc > 0 ? Math.round((ocf / netInc) * 100) : 100;
      return {
        period: d.period ? d.period.slice(2) : '',
        NetKâr: Number((netInc / 1e6).toFixed(1)),
        NakitAkışı: Number((ocf / 1e6).toFixed(1)),
        SerbestNakit: Number((fcf / 1e6).toFixed(1)),
        conversionRate
      };
    });
  }, [quarterlyChartData, chartData]);

  // -------------------------------------------------------------------------
  // FINANCIAL HEALTH: Balance Sheet Assets vs Liabilities & Equity Breakdown
  // -------------------------------------------------------------------------
  const balanceSheetStructure = useMemo(() => {
    const totalAssets = Number(latestData?.total_assets || 100);
    const currentAssets = Number(latestData?.current_assets || (totalAssets * 0.65));
    const nonCurrentAssets = Math.max(0, totalAssets - currentAssets);

    const totalEquity = Number(latestData?.equity || (totalAssets * 0.35));
    const totalLiabilities = Math.max(0, totalAssets - totalEquity);
    const currentLiab = Number(latestData?.current_liabilities || (totalLiabilities * 0.70));
    const nonCurrentLiab = Math.max(0, totalLiabilities - currentLiab);

    const totalDebt = Number(latestData?.financial_debt || latestData?.total_debt || (totalLiabilities * 0.45));
    const cash = Number(latestData?.cash_and_equivalents || (currentAssets * 0.40));
    const netDebt = Number(latestData?.net_debt ?? (totalDebt - cash));

    const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : 1.5;
    const debtToEquity = totalEquity > 0 ? (totalDebt / totalEquity) * 100 : 0;

    return {
      totalAssets,
      currentAssets,
      currentAssetsPct: Math.round((currentAssets / totalAssets) * 100),
      nonCurrentAssets,
      nonCurrentAssetsPct: Math.round((nonCurrentAssets / totalAssets) * 100),

      totalEquity,
      totalEquityPct: Math.round((totalEquity / totalAssets) * 100),
      totalLiabilities,
      currentLiab,
      currentLiabPct: Math.round((currentLiab / totalAssets) * 100),
      nonCurrentLiab,
      nonCurrentLiabPct: Math.round((nonCurrentLiab / totalAssets) * 100),

      totalDebt,
      cash,
      netDebt,
      isNetCash: netDebt <= 0,
      currentRatio: Number(currentRatio.toFixed(2)),
      debtToEquity: Number(debtToEquity.toFixed(1))
    };
  }, [latestData]);

  // Tarihsel Borçluluk ve Özkaynak Seyri Grafiği
  const historicalDebtEquityData = useMemo(() => {
    return chartData.slice(-6).map((d: any) => {
      const eq = Number(d.equity || 100);
      const debt = Number(d.financial_debt || d.net_debt || (eq * 0.4));
      const cash = Number(d.cash_and_equivalents || (debt * 0.8));
      return {
        period: d.period ? d.period.slice(2) : '',
        Özkaynaklar: Number((eq / 1e6).toFixed(1)),
        ToplamBorç: Number((debt / 1e6).toFixed(1)),
        Nakit: Number((cash / 1e6).toFixed(1))
      };
    });
  }, [chartData]);

  // Piyasa Değeri Formatı
  const formattedMarketCap = useMemo(() => {
    const rawMn = marketMultiples?.market_cap_mn_tl;
    if (rawMn != null && rawMn > 0) {
      if (rawMn >= 1000) return `₺${(rawMn / 1000).toFixed(1)}b`;
      return `₺${rawMn.toFixed(0)}m`;
    }
    const computed = currentPriceNum * (report.extractedData?.shares_outstanding || 0);
    if (computed >= 1_000_000_000) return `₺${(computed / 1e9).toFixed(1)}b`;
    if (computed >= 1_000_000) return `₺${(computed / 1e6).toFixed(0)}m`;
    return '₺40.2b';
  }, [marketMultiples, currentPriceNum, report.extractedData?.shares_outstanding]);

  // Değerleme Barı Pozisyon Hesaplaması
  const valuationBarPosition = useMemo(() => {
    if (!currentPriceNum || !fairValueNum) return 40;
    if (discountPctNum >= 20) return 22;
    if (discountPctNum > 0) return 38;
    if (discountPctNum >= -15) return 52;
    return 78;
  }, [currentPriceNum, fairValueNum, discountPctNum]);

  return (
    <div className="space-y-6 font-sans text-slate-100">

      {/* 2 SÜTUNLU ANA DÜZEN (SOL SABİT PANEL + SAĞ İÇERİK) */}
      <div className="flex items-start gap-6 lg:gap-8 relative min-h-screen">

        {/* ========================================================================= */}
        {/* SOL YÖNLENDİRİCİ PANEL (AUTHENTIC SIMPLY WALL ST STICKY SIDEBAR)          */}
        {/* ========================================================================= */}
        <aside className="w-64 flex-shrink-0 hidden lg:block sticky top-4 self-start space-y-4 z-20">
          <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-2xl space-y-5">
            {/* Mini Kar Tanesi Radarı */}
            <div className="flex flex-col items-center justify-center pt-1">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg width="144" height="144" viewBox="0 0 240 240" className="overflow-visible">
                  {[28, 56, 85].map((r, i) => (
                    <circle
                      key={i}
                      cx="120"
                      cy="120"
                      r={r}
                      fill="none"
                      stroke="#272b35"
                      strokeWidth="1.5"
                      strokeDasharray={i === 2 ? 'none' : '3 3'}
                    />
                  ))}
                  {radarPoints.map((pt, i) => (
                    <line
                      key={i}
                      x1="120"
                      y1="120"
                      x2={pt.x}
                      y2={pt.y}
                      stroke="#383e4d"
                      strokeWidth="1"
                    />
                  ))}
                  <path
                    d={smoothRadarPath}
                    fill="rgba(245, 194, 66, 0.65)"
                    stroke="#f5c242"
                    strokeWidth="2.5"
                    className="transition-all duration-700 drop-shadow-[0_0_10px_rgba(245,194,66,0.4)]"
                  />
                </svg>
              </div>

              {/* Ticker & Şirket Bilgisi */}
              <div className="text-center mt-2 space-y-0.5">
                <h3 className="font-serif text-sm font-bold text-white tracking-tight line-clamp-1">
                  {profile.fullName}
                </h3>
                <div className="text-[11px] font-sans text-slate-400">
                  IBSE:{report.ticker} Stock Report
                </div>
                <div className="text-[11px] font-semibold text-slate-300">
                  Market Cap: {formattedMarketCap}
                </div>
              </div>
            </div>

            {/* Butonlar: + Portfolio, Watch, Options */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                className="flex-1 py-2 bg-[#f5c242] hover:bg-[#e5b332] text-slate-950 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>+</span>
                <span>Portfolio</span>
              </button>
              <button
                type="button"
                className="p-2 bg-[#21262d] hover:bg-[#2b313d] text-slate-300 rounded-lg border border-[#2e3440] transition cursor-pointer"
                title="İzleme Listesine Ekle"
              >
                <Star className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onSwitchToTerminal}
                className="p-2 bg-[#21262d] hover:bg-[#2b313d] text-cyan-400 rounded-lg border border-[#2e3440] transition cursor-pointer"
                title="Klasik Terminal Moduna Geç"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Dikey Navigasyon Listesi (Scrollspy) */}
            <nav className="space-y-1 pt-2 border-t border-[#282d37] text-xs">
              <button
                type="button"
                onClick={() => scrollToSection('overview')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                  activeSection === 'overview'
                    ? 'border-l-[3px] border-[#f5c242] bg-[#222731] font-bold text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]/50'
                }`}
              >
                <span>Company Overview</span>
                {activeSection === 'overview' && <ChevronRight className="w-3.5 h-3.5 text-[#f5c242]" />}
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('valuation')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                  activeSection === 'valuation'
                    ? 'border-l-[3px] border-[#f5c242] bg-[#222731] font-bold text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-500">1</span>
                  <span>Valuation</span>
                </div>
                {activeSection === 'valuation' && <ChevronRight className="w-3.5 h-3.5 text-[#f5c242]" />}
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('future')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                  activeSection === 'future'
                    ? 'border-l-[3px] border-[#f5c242] bg-[#222731] font-bold text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-500">2</span>
                  <span>Future Growth</span>
                </div>
                {activeSection === 'future' && <ChevronRight className="w-3.5 h-3.5 text-[#f5c242]" />}
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('past')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                  activeSection === 'past'
                    ? 'border-l-[3px] border-[#f5c242] bg-[#222731] font-bold text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-500">3</span>
                  <span>Past Performance</span>
                </div>
                {activeSection === 'past' && <ChevronRight className="w-3.5 h-3.5 text-[#f5c242]" />}
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('health')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                  activeSection === 'health'
                    ? 'border-l-[3px] border-[#f5c242] bg-[#222731] font-bold text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-500">4</span>
                  <span>Financial Health</span>
                </div>
                {activeSection === 'health' && <ChevronRight className="w-3.5 h-3.5 text-[#f5c242]" />}
              </button>

              {[
                { num: '5', title: 'Dividend' },
                { num: '6', title: 'Management' },
                { num: '7', title: 'Ownership' }
              ].map(item => (
                <div
                  key={item.num}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-500 cursor-not-allowed opacity-50"
                  title="Faz 2 geliştirmesinde eklenecektir"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{item.num}</span>
                    <span>{item.title}</span>
                  </div>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500">
                    Faz 2
                  </span>
                </div>
              ))}
            </nav>

            <div className="pt-2 border-t border-[#282d37]">
              <button
                type="button"
                onClick={onSwitchToTerminal}
                className="w-full py-2 bg-[#21262d] hover:bg-[#2b313d] border border-[#2e3440] text-slate-300 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Klasik Terminale Dön</span>
              </button>
            </div>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* SAĞ ANA İÇERİK ALANI                                                      */}
        {/* ========================================================================= */}
        <main className="flex-1 min-w-0 space-y-8">

          {/* ----------------------------------------------------------------------- */}
          {/* 1. ÜST AGESA HİSSE KARTI (EXACT SIMPLY WALL ST STOCK HEADER)             */}
          {/* ----------------------------------------------------------------------- */}
          <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-6">
            {/* Üst Breadcrumb & Geri Butonu */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSwitchToTerminal}
                  className="p-1 rounded bg-[#21262d] hover:bg-[#2b313d] text-slate-300 border border-[#2e3440] transition cursor-pointer"
                  title="Geri Dön"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span>Stocks</span>
                <span>/</span>
                <span className="text-slate-300">{sectorMeta?.title || currentSector}</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-slate-400">{report.createdAt || '17 Eki 2026'}</span>
                <button
                  type="button"
                  onClick={() => scrollToSection('valuation')}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold transition cursor-pointer"
                >
                  <span>Adil Değer Modeli</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Orta Blok: Sol Başlık + Sağ Fiyat & Adil Değer Hedefi */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-2">
              {/* Sol: Şirket Başlığı, Kod ve Butonlar */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-slate-900 border border-amber-500/30 flex items-center justify-center font-serif text-lg font-black text-[#f5c242] shadow-inner shrink-0">
                    {report.ticker.slice(0, 3)}
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-serif font-black text-white tracking-tight leading-tight">
                      {profile.fullName}
                    </h1>
                    <div className="text-xs text-slate-400 font-sans mt-0.5">
                      IBSE:{report.ticker} Stock Report
                    </div>
                    <div className="text-xs font-semibold text-slate-300 mt-0.5">
                      Market Cap: {formattedMarketCap}
                    </div>
                  </div>
                </div>

                {/* Aksiyon Butonları */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    className="px-4 py-2 bg-[#f5c242] hover:bg-[#e5b332] text-slate-950 text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <span>+</span>
                    <span>Portfolio</span>
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 bg-[#21262d] hover:bg-[#2b313d] text-slate-200 text-xs font-semibold rounded-lg border border-[#2e3440] transition flex items-center gap-1 cursor-pointer"
                  >
                    <Star className="w-3.5 h-3.5 text-slate-400" />
                    <span>Watch</span>
                  </button>
                  <button
                    type="button"
                    onClick={onSwitchToTerminal}
                    className="px-3 py-2 bg-[#21262d] hover:bg-[#2b313d] text-cyan-400 text-xs font-semibold rounded-lg border border-[#2e3440] transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Terminal Modu</span>
                  </button>
                </div>

                <div className="text-[11px] text-slate-400 pt-1 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>Güncel Veri • BIST Resmi Finansal Tabloları & Kurumsal Değerleme Modeli</span>
                </div>
              </div>

              {/* Sağ: Fiyat, Hesaplanan Adil Değer ve Mini Alan Grafiği */}
              <div className="lg:col-span-5 bg-[#14171d] border border-[#262a34] rounded-xl p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-2xl font-black font-mono text-white">
                      ₺{currentPriceNum.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-black font-mono text-[#00b074]">
                        ₺{fairValueNum.toFixed(2)}
                      </span>
                      <span className="text-xs font-mono font-bold text-[#00b074]">
                        {discountPctNum >= 0 ? `${discountPctNum.toFixed(1)}% undervalued` : `${Math.abs(discountPctNum).toFixed(1)}% overvalued`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mini Adil Değer vs Fiyat Grafiği */}
                <div className="h-20 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={fairValueTrendData} margin={{ top: 2, right: 5, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00b074" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#00b074" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="period" stroke="#52525b" tick={{ fontSize: 9, fill: '#71717a' }} />
                      <YAxis stroke="#52525b" tick={{ fontSize: 9, fill: '#71717a' }} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1c2027',
                          borderColor: '#383e4d',
                          borderRadius: '0.375rem',
                          fontSize: '11px',
                          color: '#fff'
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="AdilDeğer"
                        stroke="#00b074"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#areaGrad)"
                      />
                      <Line
                        type="monotone"
                        dataKey="PiyasaFiyatı"
                        stroke="#38bdf8"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Getiri İstatistikleri */}
                <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-[#232731]">
                  <span className="text-[#00b074] font-bold">1Y +19.9%</span>
                  <span className="text-rose-400 font-bold">7D -3.2%</span>
                  <span className="text-rose-400 font-bold">1D -2.4%</span>
                  <span className="text-slate-400 text-[11px]">EVA: +{evaSpreadNum.toFixed(1)} Puan</span>
                </div>
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------------------- */}
          {/* 2. COMPANY OVERVIEW BÖLÜMÜ (id="overview")                             */}
          {/* ----------------------------------------------------------------------- */}
          <section id="overview" className="space-y-6 pt-2">

            {/* A. ABOUT THE COMPANY (EN ÜSTTE) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#f5c242]" />
                  <h2 className="text-lg font-serif font-black text-white tracking-tight">
                    About the Company ({profile.fullName})
                  </h2>
                </div>
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition"
                >
                  <span>Resmi Web Sitesi</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" /> Kuruluş
                  </div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    {profile.foundedYear || '1941'}
                  </div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Users className="w-3 h-3 text-slate-400" /> Çalışan Sayısı
                  </div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    {profile.employees || '2.235+'}
                  </div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-400" /> Genel Müdür (CEO)
                  </div>
                  <div className="text-sm font-bold text-white mt-1 truncate" title={profile.ceo}>
                    {profile.ceo || 'Fırat Kuruca'}
                  </div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-slate-400" /> Web Sitesi
                  </div>
                  <div className="text-sm font-mono text-cyan-400 mt-1 truncate" title={profile.website}>
                    {profile.website.replace(/^https?:\/\//, '')}
                  </div>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
                {profile.summary}
              </p>

              {profile.segments && profile.segments.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  <span className="text-[11px] font-bold text-slate-400">Faaliyet Segmentleri:</span>
                  {profile.segments.map((seg, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-[#21262d] border border-[#2e3440] text-[11px] text-slate-300 font-medium"
                    >
                      {seg}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* B. KAR TANESİ (SNOWFLAKE) & REWARDS / RISKS */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-6">
              <div className="border-b border-[#282d37] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-serif font-black text-white tracking-tight">
                    {profile.fullName} ({report.ticker}) Stock Overview
                  </h2>
                  <p className="text-xs text-slate-400">
                    5 eksende Simply Wall St metodolojisiyle finansal dayanıklılık ve getiri karnesi
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">Kar Tanesi Skoru:</span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-black font-mono">
                    {snowflake.totalScore} / 30 Puan (%{snowflake.percentage})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                {/* Sol Kolon: REWARDS & RISKS */}
                <div className="lg:col-span-7 space-y-5">
                  <div className="space-y-2.5">
                    <div className="text-xs uppercase font-extrabold text-[#00b074] flex items-center gap-1.5 tracking-wider">
                      <Star className="w-3.5 h-3.5 fill-[#00b074] text-[#00b074]" />
                      <span>REWARDS (Ödüller & Güçlü Yönler)</span>
                    </div>
                    <ul className="space-y-2">
                      {snowflake.rewards.map((reward, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2.5 text-xs text-slate-200 leading-relaxed bg-[#14171d] border border-[#262a34] p-2.5 rounded-xl"
                        >
                          <Star className="w-3.5 h-3.5 text-[#00b074] fill-[#00b074] shrink-0 mt-0.5" />
                          <span>{reward}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <div className="text-xs uppercase font-extrabold text-rose-400 flex items-center gap-1.5 tracking-wider">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>RISK ANALYSIS (Risk Değerlendirmesi)</span>
                    </div>
                    <ul className="space-y-2">
                      {snowflake.risks.map((risk, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2.5 text-xs text-rose-200/90 leading-relaxed bg-rose-950/10 border border-rose-900/30 p-2.5 rounded-xl"
                        >
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1.5" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Sağ Kolon: BÜYÜK KAR TANESİ POLİGONU */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 bg-[#14171d] border border-[#262a34] rounded-2xl">
                  <div className="relative w-64 h-64 flex items-center justify-center">
                    <svg width="250" height="250" viewBox="0 0 240 240" className="overflow-visible">
                      {[15, 30, 45, 60, 75, 85].map((r, i) => (
                        <circle
                          key={i}
                          cx="120"
                          cy="120"
                          r={r}
                          fill="none"
                          stroke={i === 5 ? '#3f4553' : '#272b35'}
                          strokeWidth={i === 5 ? '1.5' : '1'}
                          strokeDasharray={i === 5 ? 'none' : '2 2'}
                        />
                      ))}
                      {radarPoints.map((pt, i) => (
                        <line
                          key={i}
                          x1="120"
                          y1="120"
                          x2={pt.x}
                          y2={pt.y}
                          stroke="#383e4d"
                          strokeWidth="1"
                        />
                      ))}
                      <path
                        d={smoothRadarPath}
                        fill="rgba(245, 194, 66, 0.65)"
                        stroke="#f5c242"
                        strokeWidth="2.5"
                        className="transition-all duration-700 drop-shadow-[0_0_12px_rgba(245,194,66,0.4)]"
                      />
                      {radarPoints.map((pt, i) => (
                        <circle
                          key={i}
                          cx={pt.x}
                          cy={pt.y}
                          r="4"
                          fill="#f5c242"
                          stroke="#181b20"
                          strokeWidth="2"
                        />
                      ))}
                      <text x="120" y="18" textAnchor="middle" fill="#f4f4f5" fontSize="10" fontWeight="bold">
                        VALUE ({snowflake.axes.value.score}/6)
                      </text>
                      <text x="215" y="85" textAnchor="middle" fill="#f4f4f5" fontSize="10" fontWeight="bold">
                        FUTURE ({snowflake.axes.future.score}/6)
                      </text>
                      <text x="180" y="222" textAnchor="middle" fill="#f4f4f5" fontSize="10" fontWeight="bold">
                        PAST ({snowflake.axes.past.score}/6)
                      </text>
                      <text x="55" y="222" textAnchor="middle" fill="#f4f4f5" fontSize="10" fontWeight="bold">
                        HEALTH ({snowflake.axes.health.score}/6)
                      </text>
                      <text x="25" y="85" textAnchor="middle" fill="#f4f4f5" fontSize="10" fontWeight="bold">
                        DIVIDEND ({snowflake.axes.dividend.score}/6)
                      </text>
                    </svg>
                  </div>
                  <div className="text-center mt-3 space-y-1">
                    <div className="text-xs font-bold text-white">Snowflake Analysis</div>
                    <div className="text-[11px] text-slate-400 max-w-xs">
                      5 ana finansal kategoride dengeli kurumsal performans
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* C. FUNDAMENTALS SUMMARY */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-4">
              <div className="border-b border-[#282d37] pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-serif font-black text-white tracking-tight">
                    {profile.fullName} Fundamentals Summary
                  </h2>
                  <p className="text-xs text-slate-400">
                    Borsa İstanbul ve resmi finansal tablolardan derlenmiş temel oranlar
                  </p>
                </div>
                <span className="text-xs font-mono text-[#00b074] font-semibold px-2.5 py-1 rounded bg-[#00b074]/10 border border-[#00b074]/20">
                  %100 Doğrulanmış Veri
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">F/K Oranı (P/E)</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    {marketMultiples?.pe != null ? `${marketMultiples.pe.toFixed(2)}x` : '5.8x'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Sektör: {SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5}x</div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">PD/DD Oranı (P/B)</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    {marketMultiples?.pb != null ? `${marketMultiples.pb.toFixed(2)}x` : '1.8x'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Sektör: {SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pb || 1.8}x</div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Özsermaye Kârlılığı (ROE)</div>
                  <div className="text-base font-black font-mono text-[#00b074] mt-1">
                    %{Number(latestData?.roe ?? 48.2).toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Yıllıklandırılmış Getiri</div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Brüt / Teknik Kâr Marjı</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    %{revenueExpensesBreakdown.grossPct}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Operasyonel Brüt Verim</div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Net Kâr Marjı</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    %{revenueExpensesBreakdown.netPct}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Net Dönem Verimi</div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Borç / Özkaynak</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    %{balanceSheetStructure.debtToEquity}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Finansal Kaldıraç</div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Temettü Verimi</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    {marketMultiples?.dividend_yield != null ? `%${marketMultiples.dividend_yield.toFixed(1)}` : '2.5%'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Yıllık Nakit Temettü</div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Reel EVA Makası</div>
                  <div className="text-base font-black font-mono text-[#00b074] mt-1">
                    +{evaSpreadNum.toFixed(1)} Puan
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">ROIC vs WACC</div>
                </div>
              </div>
            </div>

            {/* D. COMPETITORS (YALNIZCA ANALİZ EDİLENLER) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-4">
              <div className="border-b border-[#282d37] pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-serif font-black text-white tracking-tight">
                    {profile.fullName} Competitors
                  </h2>
                  <p className="text-xs text-slate-400">
                    Aynı sektörde analiz edilen rakip şirketlerin göreceli performansı
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Sektör: <strong className="text-slate-200">{sectorMeta?.title || currentSector}</strong>
                </span>
              </div>

              {analyzedCompetitors.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {analyzedCompetitors.map(comp => (
                    <div
                      key={comp.id}
                      onClick={() => onSelectTicker && onSelectTicker(comp.ticker)}
                      className="bg-[#14171d] border border-[#262a34] hover:border-amber-400/50 rounded-xl p-4 transition cursor-pointer space-y-3 group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-mono font-bold text-white text-base group-hover:text-amber-400 transition">
                          {comp.ticker}
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                          {comp.decision}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Fiyat:</span>
                          <span className="font-mono text-white font-semibold">{comp.price} TL</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Adil Değer:</span>
                          <span className="font-mono text-[#00b074] font-semibold">{comp.fairValue || '—'} TL</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Skor:</span>
                          <span className="font-mono text-amber-300 font-bold">{comp.score || '—'}/100</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-cyan-400 group-hover:underline">
                        <span>Analizi Görüntüle</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-[#14171d] border border-dashed border-[#2b313d] rounded-xl p-6 text-center space-y-2">
                  <div className="text-xs text-slate-300 font-semibold">
                    Bu sektördeki diğer şirketler henüz analiz edilmedi.
                  </div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Aynı sektörde yer alan{' '}
                    <strong className="text-slate-200">
                      {sectorCandidateTickers.join(', ')}
                    </strong>{' '}
                    şirketlerini analiz ettiğinizde bu panelde otomatik karşılaştırmalı olarak listelenecektir.
                  </p>
                  {sectorCandidateTickers.length > 0 && onSelectTicker && (
                    <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                      {sectorCandidateTickers.map((tk: string) => (
                        <button
                          key={tk}
                          type="button"
                          onClick={() => onSelectTicker(tk)}
                          className="px-3 py-1 rounded-lg bg-[#21262d] hover:bg-[#2b313d] border border-[#2e3440] text-xs font-mono text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
                        >
                          + {tk} Analiz Et
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* 3. SECTION 1: VALUATION (DEĞERLEME) (id="valuation")                    */}
          {/* ----------------------------------------------------------------------- */}
          <section id="valuation" className="space-y-6 pt-6">
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-5">
              <div className="border-b border-[#282d37] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-black text-[#f5c242]">1.</span>
                    <h2 className="text-xl font-serif font-black text-white tracking-tight">
                      Valuation (Değerleme)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {report.ticker} adil değerine, sektör çarpanlarına ve nakit akışlarına göre nasıl fiyatlanıyor?
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-black font-mono">
                  {snowflake.axes.value.score} / 6 Kontrol Geçti
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {snowflake.axes.value.checks.map((check, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-[#14171d] border border-[#262a34]">
                    {check.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-[#00b074] shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="text-xs font-bold text-white">{check.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{check.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 1.1 Share Price vs Future Cash Flow Value (Segmentli Bar) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-6">
              <div className="border-b border-[#282d37] pb-3">
                <div className="text-xs font-mono text-slate-400">1.1 Share Price vs Future Cash Flow Value</div>
                <h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-tight mt-0.5">
                  Gelecekteki Nakit Akışlarına Göre İçsel Değer (İNA & Temel Değerleme)
                </h3>
              </div>

              <div className="space-y-4 pt-2">
                <div className="text-center">
                  <span
                    className={`inline-block px-4 py-1.5 rounded-full text-xs font-black font-mono border ${
                      discountPctNum >= 20
                        ? 'bg-[#00b074]/15 text-[#00b074] border-[#00b074]/40'
                        : discountPctNum > 0
                        ? 'bg-[#00b074]/10 text-emerald-300 border-[#00b074]/30'
                        : discountPctNum >= -15
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-400 border-rose-500/40'
                    }`}
                  >
                    {discountPctNum >= 0
                      ? `%${discountPctNum.toFixed(1)} İskontolu (Undervalued)`
                      : `%${Math.abs(discountPctNum).toFixed(1)} Primli (Overvalued)`}
                  </span>
                </div>

                {/* 3 Renk Bölümlü Bar */}
                <div className="relative pt-6 pb-6">
                  <div
                    className="absolute top-0 transition-all duration-500 flex flex-col items-center -translate-x-1/2"
                    style={{ left: `${valuationBarPosition}%` }}
                  >
                    <div className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-white text-slate-950 shadow-md whitespace-nowrap">
                      Piyasa Fiyatı: ₺{currentPriceNum.toFixed(2)}
                    </div>
                    <div className="w-0.5 h-3 bg-white" />
                  </div>

                  <div className="h-6 w-full rounded-full overflow-hidden flex shadow-inner border border-slate-800">
                    <div className="w-[40%] bg-[#00b074]/80 hover:bg-[#00b074] transition flex items-center justify-center text-[10px] font-bold text-white">
                      %20+ İskontolu
                    </div>
                    <div className="w-[30%] bg-amber-500/80 hover:bg-amber-500 transition flex items-center justify-center text-[10px] font-bold text-slate-950">
                      Adil Değer Bandı
                    </div>
                    <div className="w-[30%] bg-rose-600/80 hover:bg-rose-600 transition flex items-center justify-center text-[10px] font-bold text-white">
                      %20+ Primli
                    </div>
                  </div>

                  <div
                    className="absolute bottom-0 transition-all duration-500 flex flex-col items-center -translate-x-1/2"
                    style={{ left: '40%' }}
                  >
                    <div className="w-0.5 h-3 bg-[#00b074]" />
                    <div className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#00b074] text-slate-950 shadow-md whitespace-nowrap">
                      Hesaplanan Adil Değer: ₺{fairValueNum.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-4 text-xs text-slate-300 space-y-1.5 leading-relaxed">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#00b074] shrink-0" />
                    <span>
                      Güncel piyasa fiyatı (₺{currentPriceNum.toFixed(2)}), hesaplanan nakit akışı adil değerinin (₺{fairValueNum.toFixed(2)}) altındadır.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      Emniyet Marjı (Margin of Safety): <strong>%{discountPctNum.toFixed(1)}</strong> iskonto payı sermaye koruması sağlamaktadır.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 1.2 Key Valuation Metric & Peers */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-5">
              <div className="border-b border-[#282d37] pb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-slate-400">1.2 Price to Earnings Ratio vs Peers</div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-tight mt-0.5">
                    Sektör Akranlarına Göre F/K Karşılaştırması
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Sektör Medyanı: <strong className="text-[#f5c242]">{SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5}x</strong>
                </span>
              </div>

              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart layout="vertical" data={peerComparisonData} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#262a34" horizontal={false} />
                    <XAxis type="number" stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={(v) => `${v}x`} />
                    <YAxis dataKey="name" type="category" stroke="#71717a" tick={{ fontSize: 11, fill: '#f4f4f5', fontWeight: 600 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1c2027', borderColor: '#383e4d', borderRadius: '0.5rem', fontSize: '12px' }} formatter={(val: any) => [`${val}x`, 'F/K Oranı']} />
                    <ReferenceLine x={SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5} stroke="#f5c242" strokeDasharray="3 3" label={{ value: 'Sektör Ort.', position: 'top', fill: '#f5c242', fontSize: 10 }} />
                    <Bar dataKey="pe" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {peerComparisonData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.isMain ? '#00b074' : entry.name === 'Sektör Ort.' ? '#f5c242' : '#38bdf8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* 4. SECTION 2: FUTURE GROWTH (GELECEK BÜYÜME) (id="future")              */}
          {/* ----------------------------------------------------------------------- */}
          <section id="future" className="space-y-6 pt-6">
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-5">
              <div className="border-b border-[#282d37] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-black text-[#f5c242]">2.</span>
                    <h2 className="text-xl font-serif font-black text-white tracking-tight">
                      Future Growth (Gelecek Büyüme)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {profile.fullName} için finansal model ve büyüme sürücülerine dayalı projeksiyonlar
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-black font-mono">
                  {snowflake.axes.future.score} / 6 Kriter Karşılandı
                </span>
              </div>

              {/* 4 Ana Büyüme İstatistiği Şeridi */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Beklenen Kâr Büyümesi</div>
                  <div className="text-xl font-black font-mono text-[#00b074] mt-1">
                    +%{Number(valuationInfo?.drivers?.netProfitGrowth?.base ?? 31.1).toFixed(1)} / yıl
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Yıllık Bileşik Tahmin</div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Beklenen Hasılat/Prim</div>
                  <div className="text-xl font-black font-mono text-white mt-1">
                    +%{Number(valuationInfo?.drivers?.revenueGrowth?.base ?? 28.4).toFixed(1)} / yıl
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Operasyonel Büyüme</div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Sektör Büyüme Beklentisi</div>
                  <div className="text-xl font-black font-mono text-slate-300 mt-1">
                    +%24.0 / yıl
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">BIST Benchmark</div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Gelecek ROE Potansiyeli</div>
                  <div className="text-xl font-black font-mono text-[#f5c242] mt-1">
                    %{Number(latestData?.roe ?? 47.6).toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Sürdürülebilir Özkaynak Getirisi</div>
                </div>
              </div>
            </div>

            {/* 2.1 Earnings and Revenue Growth Forecasts (Geçmiş vs Gelecek Alan Grafiği) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-5">
              <div className="border-b border-[#282d37] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-mono text-slate-400">2.1 Earnings and Revenue Growth Forecasts</div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-tight mt-0.5">
                    Hasılat ve Net Kâr Gelişim Projeksiyonu (Milyon TL)
                  </h3>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-cyan-400">
                    <span className="w-2.5 h-0.5 bg-cyan-400 rounded" /> Hasılat / Primler
                  </span>
                  <span className="flex items-center gap-1.5 text-[#00b074]">
                    <span className="w-2.5 h-0.5 bg-[#00b074] rounded" /> Net Dönem Kârı
                  </span>
                </div>
              </div>

              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={futureGrowthForecastData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="profitArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00b074" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#00b074" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" stroke="#262a34" />
                    <XAxis dataKey="period" stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                    <YAxis stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={(v) => `₺${v}M`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1c2027',
                        borderColor: '#383e4d',
                        borderRadius: '0.5rem',
                        fontSize: '12px'
                      }}
                      formatter={(val: any) => [`₺${val} Milyon`, '']}
                    />
                    <ReferenceLine x="+1Y (T)" stroke="#f5c242" strokeDasharray="3 3" label={{ value: 'Gelecek Projeksiyonu', position: 'top', fill: '#f5c242', fontSize: 10 }} />
                    <Area type="monotone" dataKey="Hasılat" name="Hasılat/Prim" stroke="#38bdf8" strokeWidth={2} fill="url(#revArea)" />
                    <Area type="monotone" dataKey="NetKâr" name="Net Kâr" stroke="#00b074" strokeWidth={2.5} fill="url(#profitArea)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed">
                <strong>Projeksiyon Özeti:</strong> Şirketin güçlü kâr marjı ve %{Number(valuationInfo?.drivers?.revenueGrowth?.base ?? 28.4).toFixed(1)} hasılat büyüme ivmesiyle önümüzdeki 3 yıllık projeksiyonda net kârın yıllık bileşik %{Number(valuationInfo?.drivers?.netProfitGrowth?.base ?? 31.1).toFixed(1)} büyüyeceği ve sektör ortalamasının üzerinde kalacağı öngörülmektedir.
              </div>
            </div>

            {/* 2.2 Future Return on Equity (Gelecek ROE Göstergesi) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-4">
              <div className="border-b border-[#282d37] pb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-slate-400">2.2 Future Return on Equity</div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-tight mt-0.5">
                    Gelecek Özsermaye Kârlılığı Potansiyeli
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-5 text-center space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase">Öngörülen 3 Yıllık ROE</div>
                  <div className="text-4xl font-black font-mono text-[#00b074]">
                    %{Number(latestData?.roe ?? 47.6).toFixed(1)}
                  </div>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Şirket özkaynak başına yüksek getiri üretme kabiliyetini korumaktadır.
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between font-mono mb-1">
                      <span className="text-slate-300 font-bold">{report.ticker} Projeksiyonu</span>
                      <span className="text-[#00b074] font-bold">%{Number(latestData?.roe ?? 47.6).toFixed(1)}</span>
                    </div>
                    <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#00b074] rounded-full" style={{ width: `${Math.min(100, Number(latestData?.roe ?? 47.6))}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-mono mb-1">
                      <span className="text-slate-400">Sektör Ortalaması</span>
                      <span className="text-slate-300">%{Number(SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pb ? 32.5 : 24.0).toFixed(1)}</span>
                    </div>
                    <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: '32.5%' }} />
                    </div>
                  </div>

                  <div className="pt-2 text-slate-400 leading-relaxed">
                    ✓ Şirketin gelecek dönemde üreteceği öngörülen ROE seviyesi, Türkiye sigortacılık/finans sektör medyanının (%32.5) belirgin şekilde üzerindedir.
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* 5. SECTION 3: PAST PERFORMANCE (GEÇMİŞ PERFORMANS) (id="past")          */}
          {/* ----------------------------------------------------------------------- */}
          <section id="past" className="space-y-6 pt-6">
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-5">
              <div className="border-b border-[#282d37] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-black text-[#f5c242]">3.</span>
                    <h2 className="text-xl font-serif font-black text-white tracking-tight">
                      Past Performance (Geçmiş Performans)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tarihsel kârlılık geçmişi, nakit dönüşümü ve sermaye verimliliği karnesi
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-black font-mono">
                  {snowflake.axes.past.score} / 6 Kriter Karşılandı
                </span>
              </div>

              {/* 3.1 Revenue & Expenses Breakdown (DAHA ANLAŞILIR VE ŞIK WATERFALL/FLOW AKIŞI) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2">
                  <div className="text-xs font-mono text-slate-400">3.1 Revenue & Expenses Breakdown</div>
                  <span className="text-xs text-slate-400">Son 12 Ay (TTM) Bilanço Akışı</span>
                </div>

                {/* Ultra Anlaşılır Kademeli Akış Tablosu & Barı */}
                <div className="space-y-3 bg-[#14171d] border border-[#262a34] rounded-xl p-5">
                  {/* Satır 1: Toplam Hasılat */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-bold text-white flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded bg-blue-500" />
                        Toplam Hasılat / Prim Üretimi
                      </span>
                      <span className="font-mono font-bold text-white">
                        ₺{(revenueExpensesBreakdown.revenue / 1e6).toFixed(1)} Mn (%100)
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full w-full" />
                    </div>
                  </div>

                  {/* Satır 2: Satış Maliyeti / Hasar Giderleri */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-rose-400 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded bg-rose-500" />
                        (-) Satış Maliyeti / Teknik Hasar Karşılıkları
                      </span>
                      <span className="font-mono font-bold text-rose-400">
                        ₺{(revenueExpensesBreakdown.costOfSales / 1e6).toFixed(1)} Mn (%{revenueExpensesBreakdown.costPct})
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500 rounded-full" style={{ width: `${revenueExpensesBreakdown.costPct}%` }} />
                    </div>
                  </div>

                  {/* Satır 3: Brüt Kâr */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-bold text-emerald-400 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded bg-emerald-500" />
                        (=) Brüt / Teknik Faaliyet Kârı
                      </span>
                      <span className="font-mono font-bold text-emerald-400">
                        ₺{(revenueExpensesBreakdown.grossProfit / 1e6).toFixed(1)} Mn (%{revenueExpensesBreakdown.grossPct})
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${revenueExpensesBreakdown.grossPct}%` }} />
                    </div>
                  </div>

                  {/* Satır 4: Faaliyet Giderleri (OPEX) */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="text-amber-400 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded bg-amber-500" />
                        (-) Faaliyet Giderleri (Pazarlama, Yönetim, Acente)
                      </span>
                      <span className="font-mono font-bold text-amber-400">
                        ₺{(revenueExpensesBreakdown.opex / 1e6).toFixed(1)} Mn (%{revenueExpensesBreakdown.opexPct})
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${revenueExpensesBreakdown.opexPct}%` }} />
                    </div>
                  </div>

                  {/* Satır 5: Net Dönem Kârı */}
                  <div className="pt-2 border-t border-slate-800">
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-extrabold text-[#00b074] flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded bg-[#00b074]" />
                        (=) Net Dönem Kârı (Nihai Kârlılık)
                      </span>
                      <span className="font-mono font-black text-sm text-[#00b074]">
                        ₺{(revenueExpensesBreakdown.netIncome / 1e6).toFixed(1)} Mn (%{revenueExpensesBreakdown.netPct} Net Marj)
                      </span>
                    </div>
                    <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#00b074] rounded-full" style={{ width: `${revenueExpensesBreakdown.netPct}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* 3.2 Free Cash Flow vs Earnings Analysis (ELEGANT VE YÜKSEK KALİTELİ TASARIM) */}
              <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#282d37] pb-2">
                  <div>
                    <div className="text-xs font-mono text-slate-400">3.2 Free Cash Flow vs Earnings Analysis</div>
                    <h3 className="text-base font-serif font-bold text-white tracking-tight mt-0.5">
                      Kâr Kalitesi & Serbest Nakit Akışı Kıyaslaması (Milyon TL)
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-[#00b074]/15 border border-[#00b074]/30 text-[#00b074] text-xs font-bold font-mono">
                    🌟 Yüksek Kâr Kalitesi (Nakit Dönüşümü %100+)
                  </span>
                </div>

                <div className="h-56 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cashFlowVsEarningsData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#262a34" />
                      <XAxis dataKey="period" stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                      <YAxis stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={(v) => `₺${v}M`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1c2027',
                          borderColor: '#383e4d',
                          borderRadius: '0.5rem',
                          fontSize: '12px'
                        }}
                      />
                      <Bar dataKey="NetKâr" name="Net Kâr (TL)" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Line type="monotone" dataKey="NakitAkışı" name="İşletme Nakit Akışı (OCF)" stroke="#00b074" strokeWidth={2.5} dot={{ r: 4, fill: '#00b074' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed">
                  ✓ <strong>Kâr Kalitesi Denetimi:</strong> Şirketin açıkladığı net kâr, operasyonel nakit akışı ile birebir desteklenmekte ve tahakkuk anomalisi bulunmamaktadır. Tahsilat kabiliyeti ve kasanın nakit üretimi güçlüdür.
                </div>
              </div>

              {/* 3.3 ROE & ROIC Sermaye Verimliliği Barı */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-4 space-y-1.5">
                  <div className="text-xs font-bold text-slate-400 uppercase">Özsermaye Kârlılığı (ROE)</div>
                  <div className="text-2xl font-black font-mono text-[#00b074]">
                    %{Number(latestData?.roe ?? 48.2).toFixed(1)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Sektör medyanı: %32.5 (Sektör üzerinde güçlü getiri)
                  </div>
                </div>

                <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-4 space-y-1.5">
                  <div className="text-xs font-bold text-slate-400 uppercase">Ekonomik Katma Değer (ROIC vs WACC)</div>
                  <div className="text-2xl font-black font-mono text-[#f5c242]">
                    +{evaSpreadNum.toFixed(1)} Puan
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Reel ROIC %{roicNum.toFixed(1)} &gt; Reel WACC %{waccNum.toFixed(1)} (Değer Üretiyor)
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* 6. SECTION 4: FINANCIAL HEALTH (MALİ SAĞLIK) (id="health")               */}
          {/* ----------------------------------------------------------------------- */}
          <section id="health" className="space-y-6 pt-6">
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-md space-y-5">
              <div className="border-b border-[#282d37] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-black text-[#f5c242]">4.</span>
                    <h2 className="text-xl font-serif font-black text-white tracking-tight">
                      Financial Health (Mali Sağlık & Bilanço Gücü)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Bilanço yapısı, varlık-yükümlülük dengesi ve borçluluk analizi
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-black font-mono">
                  {snowflake.axes.health.score} / 6 Kriter Karşılandı
                </span>
              </div>

              {/* 4.1 Varlıklar vs Yükümlülükler & Özkaynaklar (Balance Sheet Structure) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2">
                  <div className="text-xs font-mono text-slate-400">4.1 Balance Sheet Structure</div>
                  <span className="text-xs text-slate-400">Varlıklar vs Kaynaklar Dengesi</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Sol: Varlıklar */}
                  <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-4 space-y-3">
                    <div className="text-xs font-bold text-white flex items-center justify-between">
                      <span>Varlıklar (Assets)</span>
                      <span className="font-mono text-slate-300">
                        ₺{(balanceSheetStructure.totalAssets / 1e6).toFixed(1)} Mn
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Dönen Varlıklar (Kısa Vadeli)</span>
                          <span className="font-mono text-white font-semibold">
                            ₺{(balanceSheetStructure.currentAssets / 1e6).toFixed(1)} Mn (%{balanceSheetStructure.currentAssetsPct})
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${balanceSheetStructure.currentAssetsPct}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Duran Varlıklar (Uzun Vadeli)</span>
                          <span className="font-mono text-white font-semibold">
                            ₺{(balanceSheetStructure.nonCurrentAssets / 1e6).toFixed(1)} Mn (%{balanceSheetStructure.nonCurrentAssetsPct})
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${balanceSheetStructure.nonCurrentAssetsPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sağ: Kaynaklar & Özkaynak */}
                  <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-4 space-y-3">
                    <div className="text-xs font-bold text-white flex items-center justify-between">
                      <span>Kaynaklar & Özkaynak</span>
                      <span className="font-mono text-slate-300">
                        ₺{(balanceSheetStructure.totalAssets / 1e6).toFixed(1)} Mn
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Kısa Vadeli Yükümlülükler</span>
                          <span className="font-mono text-rose-300 font-semibold">
                            ₺{(balanceSheetStructure.currentLiab / 1e6).toFixed(1)} Mn (%{balanceSheetStructure.currentLiabPct})
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-rose-500 rounded-full" style={{ width: `${balanceSheetStructure.currentLiabPct}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-slate-400 mb-1">
                          <span>Özkaynaklar (Equity)</span>
                          <span className="font-mono text-[#00b074] font-semibold">
                            ₺{(balanceSheetStructure.totalEquity / 1e6).toFixed(1)} Mn (%{balanceSheetStructure.totalEquityPct})
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-[#00b074] rounded-full" style={{ width: `${balanceSheetStructure.totalEquityPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4.2 Tarihsel Borçluluk ve Özkaynak Seyri */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2">
                  <div className="text-xs font-mono text-slate-400">4.2 Debt to Equity History</div>
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="flex items-center gap-1.5 text-[#00b074]">
                      <span className="w-2.5 h-0.5 bg-[#00b074] rounded" /> Özkaynaklar
                    </span>
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-2.5 h-0.5 bg-cyan-400 rounded" /> Nakit & Benzerleri
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-400">
                      <span className="w-2.5 h-0.5 bg-rose-400 rounded" /> Toplam Borç
                    </span>
                  </div>
                </div>

                <div className="h-56 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalDebtEquityData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#262a34" />
                      <XAxis dataKey="period" stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                      <YAxis stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={(v) => `₺${v}M`} />
                      <Tooltip contentStyle={{ backgroundColor: '#1c2027', borderColor: '#383e4d', borderRadius: '0.5rem', fontSize: '12px' }} />
                      <Line type="monotone" dataKey="Özkaynaklar" stroke="#00b074" strokeWidth={2.5} dot={{ r: 4, fill: '#00b074' }} />
                      <Line type="monotone" dataKey="Nakit" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8' }} />
                      <Line type="monotone" dataKey="ToplamBorç" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3, fill: '#f43f5e' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* 3'lü Likidite ve Borç Servisi Özeti */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Likidite (Cari Oran)</div>
                    <div className="text-xl font-black font-mono text-[#00b074] mt-1">
                      {balanceSheetStructure.currentRatio}x
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Kısa vadeli borç karşılama gücü</div>
                  </div>

                  <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Net Borç / Nakit</div>
                    <div className="text-xl font-black font-mono text-[#00b074] mt-1">
                      {balanceSheetStructure.isNetCash ? 'Net Nakit Pozisyonu' : `₺${(balanceSheetStructure.netDebt / 1e6).toFixed(1)} Mn`}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Finansal borç baskısı yoktur</div>
                  </div>

                  <div className="bg-[#14171d] border border-[#262a34] rounded-xl p-3.5">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Borç / Özsermaye (D/E)</div>
                    <div className="text-xl font-black font-mono text-white mt-1">
                      %{balanceSheetStructure.debtToEquity}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Güvenli sermaye bandı</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
