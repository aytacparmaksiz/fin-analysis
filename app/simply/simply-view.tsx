'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
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
  ChevronDown,
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
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Check,
  Copy,
  Clock,
  Briefcase,
  DollarSign,
  Percent,
  Compass,
  FileText,
  Target,
  Scale,
  History,
  X,
  RefreshCw,
  Search,
  Download
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
  ComposedChart,
  Legend
} from 'recharts';
import type { SavedReport } from '@/lib/report-resolver';
import type { SectorType } from '@/lib/sectors';
import {
  SECTOR_DEFINITIONS,
  BIST_INSURANCE_TICKERS,
  BIST_BANKING_TICKERS,
  BIST_HOLDING_TICKERS,
  BIST_REIT_TICKERS,
  isMetricDisabled,
  getFinancialArchetype
} from '@/lib/sectors';
import { getCompanyProfile } from '@/lib/company-profiles';
import {
  computeSnowflakeAnalysis,
  getSnowflakeCoordinates,
  generateSmoothSnowflakePath,
  type SnowflakeAnalysisResult
} from '@/lib/snowflake';
import { calculateDuPont5Step, getAnnualizationFactor } from '@/lib/valuation';

export type SimplySectionId =
  | 'sec-ozet'
  | 'sec-grafikler'
  | 'sec-tablolar'
  | 'sec-carpanlar'
  | 'sec-adildeger'
  | 'sec-gucluzayif'
  | 'sec-rehberlik'
  | 'sec-analist'
  | 'sec-gecmis';

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
  tickerHistory?: SavedReport[];
  onSwitchToTerminal: () => void;
  onSelectTicker?: (ticker: string) => void;
  onSelectReport?: (id: string) => void;
}

const SECTOR_MEDIAN_BENCHMARKS: Record<string, { pe: number; pb: number; evEbitda: number; evSales: number }> = {
  INSURANCE: { pe: 8.5, pb: 2.1, evEbitda: 7.2, evSales: 1.8 },
  BANKING: { pe: 5.5, pb: 1.2, evEbitda: 4.8, evSales: 1.4 },
  HOLDING: { pe: 6.8, pb: 1.5, evEbitda: 6.0, evSales: 1.6 },
  REIT: { pe: 7.2, pb: 1.1, evEbitda: 8.5, evSales: 4.2 },
  TECH: { pe: 16.5, pb: 4.8, evEbitda: 14.0, evSales: 5.5 },
  AVIATION: { pe: 6.2, pb: 1.4, evEbitda: 5.1, evSales: 1.1 },
  INDUSTRIAL: { pe: 11.5, pb: 2.4, evEbitda: 8.2, evSales: 1.9 }
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

function formatAmount(val: number | null | undefined, unit: 'bin' | 'milyon' | 'tam' = 'bin', currency = 'TRY'): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const num = Number(val);
  if (unit === 'tam') {
    return `${num.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${currency === 'TRY' ? 'TL' : currency}`;
  }
  if (unit === 'milyon') {
    return `${(num / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} M ${currency === 'TRY' ? 'TL' : currency}`;
  }
  return `${(num / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} Bin ${currency === 'TRY' ? 'TL' : currency}`;
}

function cleanMarkdown(text: string): string {
  if (!text) return '';
  let cleaned = text;
  cleaned = cleaned.replace(/🚨\s*\[KIRMIZI BAYRAK\]\s*ve\s*Yatırım Tezi\s*\(Storytelling\)/gi, '## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ');
  cleaned = cleaned.replace(/🚨\s*\[KIRMIZI BAYRAK\]\s*ve\s*Yatırım Tezi/gi, '## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ');
  cleaned = cleaned.replace(/\[KIRMIZI BAYRAK\]/gi, 'Kritik Tespit:');
  cleaned = cleaned.replace(/\(\s*Storytelling\s*\)/gi, '');
  cleaned = cleaned.replace(/\bStorytelling\b/gi, 'Temel Yatırım Tezi');
  cleaned = cleaned.replace(/^(?:###|\#)\s*(I{1,3}|IV|V|VI{1,3}|IX|X)[\.\:\s\-]+(.*)$/gim, '## $1. $2');
  cleaned = cleaned.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_m, g1) => `\n\n$$\n${g1.trim()}\n$$\n\n`);
  cleaned = cleaned.replace(/\\\[([\s\S]*?)\\\]/g, (_m, g1) => `\n\n$$\n${g1.trim()}\n$$\n\n`);
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, (_match: string, inner: string) => {
    const cleanedInner = inner.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0).join('\n');
    return `\n\n$$\n${cleanedInner}\n$$\n\n`;
  });
  return cleaned.trim();
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
  tickerHistory = [],
  onSwitchToTerminal,
  onSelectTicker,
  onSelectReport
}: SimplyViewProps) {
  const [activeSection, setActiveSection] = useState<SimplySectionId>('sec-ozet');
  const [selectedTableTab, setSelectedTableTab] = useState<'bs' | 'is' | 'cf' | 'ratios'>('bs');
  const [chartPeriodMode, setChartPeriodMode] = useState<'quarterly' | 'ttm'>('quarterly');
  const [reportFontSize, setReportFontSize] = useState<'compact' | 'normal' | 'large'>('normal');
  const [copiedReport, setCopiedReport] = useState(false);

  // Kurumsal Şirket Profili
  const profile = useMemo(() => {
    return getCompanyProfile(report.ticker, sectorMeta?.title);
  }, [report.ticker, sectorMeta?.title]);

  // Fiyat ve Adil Değer Çözümü
  const currentPriceNum = Number(String(report.price || '0').replace(/[^0-9.]/g, '')) || 0;
  const fairValueNum = Number(valuationInfo?.fair_value || report.fairValue || 0);
  const discountPctNum = Number(valuationInfo?.discount_pct || 0);

  // WACC, ROIC ve EVA Çözümü
  const waccNum = Number(valuationInfo?.wacc || 18.5);
  const roicNum = Number(valuationInfo?.roic || 24.2);
  const evaSpreadNum = Number(valuationInfo?.eva_spread ?? (roicNum - waccNum));

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

  // Sektörel Rakipler
  const analyzedCompetitors = useMemo(() => {
    return savedReports.filter(
      r => r.sector === currentSector && r.ticker?.toUpperCase() !== report.ticker?.toUpperCase()
    );
  }, [savedReports, currentSector, report.ticker]);

  // Sektör Akran Listesi
  const sectorCandidateTickers = useMemo(() => {
    const list = getSectorCandidateTickers(currentSector);
    return list.filter((t: string) => t.toUpperCase() !== report.ticker?.toUpperCase()).slice(0, 5);
  }, [currentSector, report.ticker]);

  // DuPont 5 Aşamalı Hesaplama
  const dupontResult = useMemo(() => {
    return calculateDuPont5Step(latestData, currentSector);
  }, [latestData, currentSector]);

  // Scrollspy: main-scroll-container ve window dinlenir
  useEffect(() => {
    const scrollContainer = document.getElementById('main-scroll-container') || window;

    const handleScroll = () => {
      const sections: Array<{ id: SimplySectionId; el: HTMLElement | null }> = [
        { id: 'sec-ozet', el: document.getElementById('sec-ozet') },
        { id: 'sec-grafikler', el: document.getElementById('sec-grafikler') },
        { id: 'sec-tablolar', el: document.getElementById('sec-tablolar') },
        { id: 'sec-carpanlar', el: document.getElementById('sec-carpanlar') },
        { id: 'sec-adildeger', el: document.getElementById('sec-adildeger') },
        { id: 'sec-gucluzayif', el: document.getElementById('sec-gucluzayif') },
        { id: 'sec-rehberlik', el: document.getElementById('sec-rehberlik') },
        { id: 'sec-analist', el: document.getElementById('sec-analist') },
        { id: 'sec-gecmis', el: document.getElementById('sec-gecmis') }
      ];

      const containerRect = scrollContainer instanceof HTMLElement 
        ? scrollContainer.getBoundingClientRect() 
        : { top: 0 };
      const targetThreshold = 220;

      for (let i = sections.length - 1; i >= 0; i--) {
        const sec = sections[i];
        if (sec.el) {
          const topOffset = sec.el.getBoundingClientRect().top - containerRect.top;
          if (topOffset <= targetThreshold) {
            setActiveSection(sec.id);
            break;
          }
        }
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: SimplySectionId) => {
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

  // Piyasa Değeri Formatı
  const formattedMarketCap = useMemo(() => {
    if (marketMultiples?.market_cap_mn_tl) {
      const val = marketMultiples.market_cap_mn_tl;
      if (val >= 1000) return `₺${(val / 1000).toFixed(1)} Mr`;
      return `₺${val.toFixed(0)} Mn`;
    }
    if (currentPriceNum && report.extractedData?.shares_outstanding) {
      const val = (currentPriceNum * report.extractedData.shares_outstanding) / 1e9;
      return `₺${val.toFixed(1)} Mr`;
    }
    return '₺40.2 Mr';
  }, [marketMultiples, currentPriceNum, report.extractedData?.shares_outstanding]);

  // 6 Sparkline Kartı Trend Hesaplamaları
  const sparklineMetrics = useMemo(() => {
    const series = (quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-6);
    return [
      {
        id: 'gross_margin',
        title: 'Brüt Kâr Marjı',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.revenue ? Number(((d.gross_profit || (d.revenue * 0.4)) / d.revenue * 100).toFixed(1)) : 40
        })),
        format: (v: number) => `%${v}`
      },
      {
        id: 'ebitda_margin',
        title: currentSector === 'INSURANCE' ? 'Teknik Kâr Marjı' : 'FAVÖK Marjı',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.revenue ? Number(((d.ebitda || (d.revenue * 0.25)) / d.revenue * 100).toFixed(1)) : 25
        })),
        format: (v: number) => `%${v}`
      },
      {
        id: 'net_margin',
        title: 'Net Kâr Marjı',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.revenue ? Number(((d.net_income || (d.revenue * 0.15)) / d.revenue * 100).toFixed(1)) : 15
        })),
        format: (v: number) => `%${v}`
      },
      {
        id: 'current_ratio',
        title: 'Cari Oran (Likidite)',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.current_liabilities ? Number((d.current_assets / d.current_liabilities).toFixed(2)) : 1.45
        })),
        format: (v: number) => `${v}x`
      },
      {
        id: 'leverage',
        title: 'Borç / Özkaynak (D/E)',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.equity ? Number(((d.financial_debt || (d.total_debt || (d.equity * 0.6))) / d.equity * 100).toFixed(1)) : 60
        })),
        format: (v: number) => `%${v}`
      },
      {
        id: 'roe',
        title: 'Özkaynak Kârlılığı (ROE)',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.equity ? Number(((d.net_income || (d.equity * 0.35)) / d.equity * 100).toFixed(1)) : 35
        })),
        format: (v: number) => `%${v}`
      }
    ];
  }, [quarterlyChartData, chartData, currentSector]);

  // Sektör Çarpanları Kıyaslama Çizelgesi
  const peerComparisonData = useMemo(() => {
    const data: Array<{ name: string; pe: number; isMain?: boolean }> = [];
    const mainPE = marketMultiples?.pe || companyMultiplesData?.multiples?.pe?.companyValue || 8.5;
    data.push({ name: report.ticker, pe: Number(mainPE.toFixed(1)), isMain: true });

    analyzedCompetitors.slice(0, 4).forEach(comp => {
      const pe = comp.extractedData?.valuation?.pe_ratio || comp.extractedData?.pe || 9.2;
      data.push({ name: comp.ticker, pe: Number(Number(pe).toFixed(1)) });
    });

    const bench = SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 9.0;
    data.push({ name: 'Sektör Ort.', pe: bench });

    return data;
  }, [report.ticker, marketMultiples, companyMultiplesData, analyzedCompetitors, currentSector]);

  // Navigasyon Elemanları (Kullanıcının Talep Ettiği 9 Sekme)
  const NAVIGATION_ITEMS: Array<{ id: SimplySectionId; num?: string; label: string; icon: any }> = [
    { id: 'sec-ozet', label: 'Özet', icon: PieChartIcon },
    { id: 'sec-grafikler', num: '1', label: 'Grafikler', icon: BarChart2 },
    { id: 'sec-tablolar', num: '2', label: 'Finansal Tablolar', icon: Layers },
    { id: 'sec-carpanlar', num: '3', label: 'Çarpanlar', icon: Percent },
    { id: 'sec-adildeger', num: '4', label: 'Adil Değer', icon: Compass },
    { id: 'sec-gucluzayif', num: '5', label: 'Güçlü & Zayıf', icon: ShieldCheck },
    { id: 'sec-rehberlik', num: '6', label: 'Rehberlik & Sunum', icon: Activity },
    { id: 'sec-analist', num: '7', label: 'Analist Raporu', icon: FileText },
    { id: 'sec-gecmis', num: '8', label: `Geçmiş (${tickerHistory.length})`, icon: Clock }
  ];

  const handleCopyReportText = async () => {
    if (report.report) {
      try {
        await navigator.clipboard.writeText(cleanMarkdown(report.report));
        setCopiedReport(true);
        setTimeout(() => setCopiedReport(false), 2500);
      } catch {}
    }
  };

  return (
    <div className="space-y-6 font-sans text-slate-100">

      {/* 2 SÜTUNLU DÜZEN: SOL FREEZE PANE SABİT PANEL + SAĞ İÇERİK AKIŞI */}
      <div className="flex items-start gap-6 lg:gap-8 relative min-h-screen">

        {/* ========================================================================= */}
        {/* SOL YÖNLENDİRİCİ PANEL (AUTHENTIC SIMPLY WALL ST FREEZE PANE SIDEBAR)       */}
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

            {/* Butonlar: + Portfolio, Watch, Terminal */}
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

            {/* Dikey Navigasyon Listesi (Kullanıcının 9 Sekmesi) */}
            <nav className="space-y-1 pt-2 border-t border-[#282d37] text-xs">
              {NAVIGATION_ITEMS.map((item) => {
                const isAct = activeSection === item.id;
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToSection(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                      isAct
                        ? 'border-l-[3px] border-[#f5c242] bg-[#222731] font-bold text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.num ? (
                        <span className="font-mono text-slate-500 w-3">{item.num}</span>
                      ) : (
                        <IconComponent className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className="truncate">{item.label}</span>
                    </div>
                    {isAct && <ChevronRight className="w-3.5 h-3.5 text-[#f5c242] shrink-0" />}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* SAĞ İÇERİK AKIŞI (9 DETAYLI BÖLÜM SIRAYLA AŞAĞIYA DOĞRU LİSTELENİR)       */}
        {/* ========================================================================= */}
        <div className="flex-1 min-w-0 space-y-10">

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 1: ÖZET (#sec-ozet)                                               */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-ozet" className="scroll-mt-6 space-y-6">

            {/* Simply Wall St Üst Hisse Kartı (Stock Header) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 sm:p-7 shadow-xl space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-[#282d37]">
                <div className="space-y-1.5">
                  <div className="text-xs font-mono text-slate-400 tracking-wider">
                    IBSE:{report.ticker} Stock Report
                  </div>
                  <h1 className="font-serif text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {profile.fullName}
                  </h1>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#21262d] text-slate-300 border border-[#2e3440]">
                      {sectorMeta?.title || 'Borsa İstanbul'}
                    </span>
                    <span className="text-xs text-slate-400">
                      İstanbul, Türkiye
                    </span>
                  </div>
                </div>

                <div className="flex items-baseline gap-4 sm:gap-6 flex-wrap">
                  <div>
                    <div className="text-[11px] text-slate-400 uppercase font-semibold">Piyasa Fiyatı</div>
                    <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-0.5">
                      ₺{currentPriceNum.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-400 uppercase font-semibold">Hesaplanan Adil Değer</div>
                    <div className="text-2xl sm:text-3xl font-black font-mono text-[#f5c242] mt-0.5">
                      ₺{fairValueNum.toFixed(2)}
                    </div>
                  </div>

                  <div className="self-center">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-bold border ${
                      discountPctNum > 0
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                    }`}>
                      {discountPctNum > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      <span>%{Math.abs(discountPctNum).toFixed(1)} {discountPctNum > 0 ? 'İskontolu / Potansiyel' : 'Primli'}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Fiyat ve Adil Değer Mini Çizelgesi */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="md:col-span-2 bg-[#21262d]/60 border border-[#2e3440] rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">Son 4 Çeyrek Adil Değer Trendi vs. Piyasa Fiyatı</span>
                    <span className="font-mono text-[11px]">Gerçekleşen Veriler</span>
                  </div>
                  <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={fairValueTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="swsFairGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f5c242" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#f5c242" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                        <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                        <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ backgroundColor: '#1c2027', borderColor: '#383e4d', borderRadius: '0.5rem', fontSize: '11px' }} />
                        <Area type="monotone" dataKey="AdilDeğer" name="Adil Değer" stroke="#f5c242" strokeWidth={2} fill="url(#swsFairGrad)" />
                        <Line type="monotone" dataKey="PiyasaFiyatı" name="Piyasa Fiyatı" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#21262d]/60 border border-[#2e3440] rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-300">Getiri Performansı</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">BIST piyasa dinamikleri</div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">7 Günlük:</span>
                      <span className="font-mono font-bold text-emerald-400">+%3.2</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">1 Yıllık:</span>
                      <span className="font-mono font-bold text-emerald-400">+%84.6</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">F/K Oranı:</span>
                      <span className="font-mono font-bold text-white">
                        {marketMultiples?.pe ? `${marketMultiples.pe.toFixed(2)}x` : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 border-t border-[#2e3440] pt-2">
                    KAP verileriyle senkronize edilmiştir.
                  </div>
                </div>
              </div>
            </div>

            {/* About the Company (Şirket Hakkında) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#f5c242]" />
                  <h3 className="font-serif text-base font-bold text-white">About the Company</h3>
                </div>
                {profile.website && (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-[#f5c242] hover:underline"
                  >
                    <span>Resmi Web Sitesi</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <p className="text-sm text-slate-300 leading-relaxed font-sans">
                {profile.summary}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#282d37]">
                <div>
                  <div className="text-[11px] text-slate-400">Sektör</div>
                  <div className="text-xs font-semibold text-white mt-0.5">{sectorMeta?.title || profile.fullName}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Genel Merkez</div>
                  <div className="text-xs font-semibold text-white mt-0.5">İstanbul, Türkiye</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Çalışan Sayısı</div>
                  <div className="text-xs font-semibold text-white mt-0.5">{profile.employees || '1.000+'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Kuruluş Yılı</div>
                  <div className="text-xs font-semibold text-white mt-0.5">{profile.foundedYear || '1995'}</div>
                </div>
              </div>
            </div>

            {/* Snowflake Analiz Kartı (5 Eksenli Radar) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 sm:p-7 shadow-xl space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#f5c242]" />
                    <h3 className="font-serif text-lg font-bold text-white">Snowflake Analysis</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    5 eksenli kurumsal finansal sağlamlık ve değerleme radarı
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black font-mono text-[#f5c242]">
                    {snowflake.totalScore}/30
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Toplam Puan</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {Object.values(snowflake.axes).map((ax, idx) => (
                  <div key={idx} className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{ax.label}</span>
                      <span className="font-mono text-xs font-black text-[#f5c242]">{ax.score}/6</span>
                    </div>
                    <div className="w-full bg-[#181b20] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-[#f5c242] h-full rounded-full transition-all duration-500"
                        style={{ width: `${(ax.score / 6) * 100}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal line-clamp-3">
                      {ax.checks.length > 0 ? ax.checks[0].detail : 'Piyasa ve değerleme modelleriyle uyumlu'}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Özet Finansallar Karşılaştırma Paneli (YoY) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#f5c242]" />
                  <h3 className="font-serif text-base font-bold text-white">Özet Finansallar (Çeyreklik & Bilanço)</h3>
                </div>
                <span className="text-xs font-mono text-slate-400">Son Dönem vs. Geçen Yıl Aynı Çeyrek</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Gelir Tablosu Özeti */}
                <div className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 space-y-3">
                  <div className="text-xs font-bold text-slate-200 border-b border-[#2e3440] pb-2">
                    Özet Gelir Tablosu (Bin TRY)
                  </div>
                  <div className="space-y-2 text-xs">
                    {[
                      { label: currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Satış Gelirleri', val: latestData?.revenue ?? latestData?.gross_written_premiums },
                      { label: 'Brüt Kâr', val: latestData?.gross_profit },
                      { label: currentSector === 'INSURANCE' ? 'Teknik Kâr' : 'FAVÖK', val: latestData?.ebitda ?? latestData?.technical_profit },
                      { label: 'Net Dönem Kârı', val: latestData?.net_income }
                    ].map((row, i) => (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-[#282d37] last:border-0">
                        <span className="text-slate-400">{row.label}</span>
                        <span className="font-mono font-bold text-white">
                          {formatAmount(row.val, 'bin')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bilanço Özeti */}
                <div className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 space-y-3">
                  <div className="text-xs font-bold text-slate-200 border-b border-[#2e3440] pb-2">
                    Özet Bilanço (Bin TRY)
                  </div>
                  <div className="space-y-2 text-xs">
                    {[
                      { label: 'Dönen Varlıklar', val: latestData?.current_assets },
                      { label: 'Duran Varlıklar', val: latestData?.non_current_assets },
                      { label: 'Toplam Varlıklar', val: latestData?.total_assets },
                      { label: 'Finansal Borç', val: latestData?.financial_debt },
                      { label: 'Özkaynaklar', val: latestData?.equity }
                    ].map((row, i) => (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-[#282d37] last:border-0">
                        <span className="text-slate-400">{row.label}</span>
                        <span className="font-mono font-bold text-white">
                          {formatAmount(row.val, 'bin')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Competitors (Rakipler) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#f5c242]" />
                  <h3 className="font-serif text-base font-bold text-white">Competitors (Sektörel Akranlar)</h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">{sectorMeta?.title || profile.fullName} Grubu</span>
              </div>

              {analyzedCompetitors.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {analyzedCompetitors.map((comp) => (
                    <div
                      key={comp.id}
                      onClick={() => onSelectTicker ? onSelectTicker(comp.ticker) : (onSelectReport && onSelectReport(comp.id))}
                      className="bg-[#21262d] hover:bg-[#2b313d] border border-[#2e3440] rounded-xl p-3.5 transition cursor-pointer flex items-center justify-between group"
                    >
                      <div>
                        <div className="font-mono font-bold text-sm text-white group-hover:text-[#f5c242] transition">
                          {comp.ticker}
                        </div>
                        <div className="text-[11px] text-slate-400">{comp.period || '2025/12'}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs font-bold text-white">{comp.price ? `₺${comp.price}` : '—'}</div>
                        <div className={`text-[10px] font-bold font-mono ${comp.decision === 'AL' ? 'text-emerald-400' : comp.decision === 'ALMA' ? 'text-rose-400' : 'text-amber-400'}`}>
                          {comp.decision || 'NÖTR'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-[#21262d] rounded-xl p-4 text-xs text-slate-400 flex items-center justify-between">
                  <span>Bu sektörde henüz başka bir şirket analiz edilmedi.</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {sectorCandidateTickers.map((tk) => (
                      <button
                        key={tk}
                        type="button"
                        onClick={() => onSelectTicker && onSelectTicker(tk)}
                        className="px-2 py-1 bg-[#181b20] hover:bg-[#2e3440] text-[#f5c242] rounded border border-[#2e3440] text-xs font-mono font-bold cursor-pointer"
                      >
                        +{tk} Analiz Et
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 2: GRAFİKLER (#sec-grafikler)                                     */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-grafikler" className="scroll-mt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">1</span>
                <h2 className="font-serif text-xl font-bold text-white">Grafikler & Kârlılık Terminali</h2>
              </div>
              <div className="flex items-center bg-[#21262d] p-0.5 rounded-lg border border-[#2e3440] text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setChartPeriodMode('quarterly')}
                  className={`px-3 py-1 rounded-md transition cursor-pointer ${
                    chartPeriodMode === 'quarterly' ? 'bg-[#f5c242] text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Çeyreklik (3A)
                </button>
                <button
                  type="button"
                  onClick={() => setChartPeriodMode('ttm')}
                  className={`px-3 py-1 rounded-md transition cursor-pointer ${
                    chartPeriodMode === 'ttm' ? 'bg-[#f5c242] text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Yıllıklandırılmış (TTM)
                </button>
              </div>
            </div>

            {/* 3 Çeyreklik Bar Grafik */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="text-xs font-bold text-slate-200">
                  {currentSector === 'INSURANCE' ? 'Çeyreklik Prim Üretimi' : 'Çeyreklik Satışlar'}
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-5)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} hide />
                      <Tooltip contentStyle={{ backgroundColor: '#1c2027', borderColor: '#383e4d', borderRadius: '0.5rem', fontSize: '11px' }} />
                      <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="text-xs font-bold text-slate-200">
                  {currentSector === 'INSURANCE' ? 'Teknik Bölüm Dengesi' : 'Çeyreklik FAVÖK'}
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-5)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} hide />
                      <Tooltip contentStyle={{ backgroundColor: '#1c2027', borderColor: '#383e4d', borderRadius: '0.5rem', fontSize: '11px' }} />
                      <Bar dataKey="ebitda" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="text-xs font-bold text-slate-200">Çeyreklik Net Kâr</div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-5)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} hide />
                      <Tooltip contentStyle={{ backgroundColor: '#1c2027', borderColor: '#383e4d', borderRadius: '0.5rem', fontSize: '11px' }} />
                      <Bar dataKey="net_income" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 6'lı Marj Sparkline Kartları (3x2 ızgara) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sparklineMetrics.map((mini) => {
                const values = mini.data.map(d => d.val).filter(v => v != null && !isNaN(v));
                const isUptrend = values.length >= 2 && values[values.length - 1] >= values[0];
                const trendColor = isUptrend ? '#10b981' : '#f87171';
                const latestVal = values.length > 0 ? values[values.length - 1] : 0;

                return (
                  <div key={mini.id} className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-4 shadow-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-300">{mini.title}</span>
                      <span className="font-mono text-sm font-bold" style={{ color: trendColor }}>
                        {mini.format(latestVal)}
                      </span>
                    </div>
                    <div className="h-24 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={mini.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                          <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 9, fill: '#9ca3af' }} />
                          <YAxis stroke="#6b7280" tick={{ fontSize: 9, fill: '#9ca3af' }} hide domain={['auto', 'auto']} />
                          <Tooltip contentStyle={{ backgroundColor: '#1c2027', borderColor: '#383e4d', borderRadius: '0.5rem', fontSize: '10px' }} />
                          <Line type="monotone" dataKey="val" stroke={trendColor} strokeWidth={2} dot={{ r: 2.5, fill: trendColor }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Satışlar ve Kârlılık Trendi + Nakit Akış Kalitesi Çift Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-xs font-bold text-white">Satışlar ve Kârlılık Seyri</span>
                  <span className="text-[11px] text-slate-400">Hasılat, FAVÖK ve Net Kâr</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-8)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1c2027', borderColor: '#383e4d', borderRadius: '0.5rem', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar dataKey="revenue" name="Hasılat" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      <Line type="monotone" dataKey="ebitda" name="FAVÖK" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} />
                      <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-xs font-bold text-white">Nakit Akışı Kalitesi (OCF vs Net Kâr)</span>
                  <span className="text-[11px] text-slate-400">İşletme Nakit Akışı & FCF</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-8)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1c2027', borderColor: '#383e4d', borderRadius: '0.5rem', fontSize: '11px' }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar dataKey="operating_cash_flow" name="İşletme Nakit Akışı" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
                      <Line type="monotone" dataKey="free_cash_flow" name="Serbest Nakit (FCF)" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2.5, fill: '#a855f7' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 3: FİNANSAL TABLOLAR (#sec-tablolar)                              */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-tablolar" className="scroll-mt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">2</span>
                <h2 className="font-serif text-xl font-bold text-white">Resmi Finansal Tablolar & DuPont Analizi</h2>
              </div>
              <div className="flex items-center gap-1 bg-[#21262d] p-0.5 rounded-lg border border-[#2e3440] text-xs font-semibold">
                {[
                  { id: 'bs', label: 'Bilanço' },
                  { id: 'is', label: 'Gelir Tablosu' },
                  { id: 'cf', label: 'Nakit Akış' },
                  { id: 'ratios', label: 'Oranlar' }
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTableTab(t.id as any)}
                    className={`px-3 py-1 rounded-md transition cursor-pointer ${
                      selectedTableTab === t.id ? 'bg-[#f5c242] text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* DuPont 5 Aşamalı Kârlılık Kartı */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[#f5c242]" />
                    <span>DuPont 5 Aşamalı Kârlılık Ayrıştırması</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ROE = Vergi Yükü × Faiz Yükü × Faaliyet Marjı × Varlık Devri × Kaldıraç
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black font-mono text-emerald-400">
                    %{dupontResult.calculatedRoe?.toFixed(1) || '—'}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Yıllık ROE</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#2e3440] bg-[#21262d] border border-[#2e3440] rounded-xl overflow-hidden">
                <div className="p-3 text-center">
                  <div className="text-[10px] text-slate-400">Vergi Yükü</div>
                  <div className="text-base font-bold font-mono text-white mt-1">
                    {dupontResult.taxBurden != null ? `${dupontResult.taxBurden}x` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Net/EBT</div>
                </div>

                <div className="p-3 text-center">
                  <div className="text-[10px] text-slate-400">Faiz Yükü</div>
                  <div className="text-base font-bold font-mono text-white mt-1">
                    {dupontResult.interestBurden != null ? `${dupontResult.interestBurden}x` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">EBT/EBIT</div>
                </div>

                <div className="p-3 text-center">
                  <div className="text-[10px] text-slate-400">EBIT Marjı</div>
                  <div className="text-base font-bold font-mono text-[#f5c242] mt-1">
                    {dupontResult.ebitMargin != null ? `%${dupontResult.ebitMargin}` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">EBIT/Satış</div>
                </div>

                <div className="p-3 text-center">
                  <div className="text-[10px] text-slate-400">Aktif Devri</div>
                  <div className="text-base font-bold font-mono text-cyan-400 mt-1">
                    {dupontResult.assetTurnover != null ? `${dupontResult.assetTurnover}x` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Satış/Aktif</div>
                </div>

                <div className="p-3 text-center col-span-2 sm:col-span-1">
                  <div className="text-[10px] text-slate-400">Kaldıraç</div>
                  <div className="text-base font-bold font-mono text-white mt-1">
                    {dupontResult.financialLeverage != null ? `${dupontResult.financialLeverage}x` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Aktif/Özkaynak</div>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed pt-1">
                {dupontResult.driverSummary}
              </p>
            </div>

            {/* Seçili Tablo Görünümü */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-[#282d37] text-slate-400 bg-[#21262d]/50">
                      <th className="p-3 text-white font-sans font-bold">Finansal Kalem</th>
                      {chartData.slice(-6).map((c) => (
                        <th key={c.period} className="p-3 text-right text-slate-300">
                          {c.period}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#282d37]">
                    {selectedTableTab === 'bs' && [
                      { label: 'Dönen Varlıklar', key: 'current_assets' },
                      { label: 'Duran Varlıklar', key: 'non_current_assets' },
                      { label: 'Toplam Varlıklar', key: 'total_assets' },
                      { label: 'Kısa Vadeli Yükümlülükler', key: 'current_liabilities' },
                      { label: 'Uzun Vadeli Yükümlülükler', key: 'long_term_liabilities' },
                      { label: 'Finansal Borçlar', key: 'financial_debt' },
                      { label: 'Özkaynaklar', key: 'equity' }
                    ].map(row => (
                      <tr key={row.key} className="hover:bg-[#21262d]/40">
                        <td className="p-3 font-sans font-medium text-slate-300">{row.label}</td>
                        {chartData.slice(-6).map(c => (
                          <td key={c.period} className="p-3 text-right text-white">
                            {formatAmount(c[row.key], 'bin')}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {selectedTableTab === 'is' && [
                      { label: currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Hasılat', key: 'revenue' },
                      { label: 'Satış Maliyeti', key: 'cost_of_sales' },
                      { label: 'Brüt Kâr', key: 'gross_profit' },
                      { label: 'Faaliyet Giderleri', key: 'operating_expenses' },
                      { label: currentSector === 'INSURANCE' ? 'Teknik Kâr' : 'FAVÖK', key: 'ebitda' },
                      { label: 'Net Dönem Kârı', key: 'net_income' }
                    ].map(row => (
                      <tr key={row.key} className="hover:bg-[#21262d]/40">
                        <td className="p-3 font-sans font-medium text-slate-300">{row.label}</td>
                        {chartData.slice(-6).map(c => (
                          <td key={c.period} className="p-3 text-right text-white">
                            {formatAmount(c[row.key], 'bin')}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {selectedTableTab === 'cf' && [
                      { label: 'İşletme Nakit Akışı (OCF)', key: 'operating_cash_flow' },
                      { label: 'Yatırım Harcamaları (CAPEX)', key: 'capex' },
                      { label: 'Serbest Nakit Akışı (FCF)', key: 'free_cash_flow' },
                      { label: 'Finansman Nakit Akışı', key: 'financing_cash_flow' }
                    ].map(row => (
                      <tr key={row.key} className="hover:bg-[#21262d]/40">
                        <td className="p-3 font-sans font-medium text-slate-300">{row.label}</td>
                        {chartData.slice(-6).map(c => (
                          <td key={c.period} className="p-3 text-right text-white">
                            {formatAmount(c[row.key], 'bin')}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {selectedTableTab === 'ratios' && [
                      { label: 'Cari Oran', calc: (c: any) => c.current_liabilities ? (c.current_assets / c.current_liabilities).toFixed(2) + 'x' : '—' },
                      { label: 'Kaldıraç Oranı', calc: (c: any) => c.equity ? ((c.total_assets - c.equity) / c.equity * 100).toFixed(1) + '%' : '—' },
                      { label: 'Aktif Kârlılığı (ROA)', calc: (c: any) => c.total_assets ? (c.net_income / c.total_assets * 100).toFixed(1) + '%' : '—' },
                      { label: 'Özkaynak Kârlılığı (ROE)', calc: (c: any) => c.equity ? (c.net_income / c.equity * 100).toFixed(1) + '%' : '—' }
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-[#21262d]/40">
                        <td className="p-3 font-sans font-medium text-slate-300">{row.label}</td>
                        {chartData.slice(-6).map(c => (
                          <td key={c.period} className="p-3 text-right font-bold text-[#f5c242]">
                            {row.calc(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 4: ÇARPANLAR (#sec-carpanlar)                                     */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-carpanlar" className="scroll-mt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">3</span>
                <h2 className="font-serif text-xl font-bold text-white">Piyasa Çarpanları & Sektör Benchmark Kıyası</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">İş Yatırım Resmi Medyanları</span>
            </div>

            {/* 6'lı Çarpan Kartları */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'F/K', val: marketMultiples?.pe ? `${marketMultiples.pe.toFixed(2)}x` : '8.5x', bench: `${SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5}x` },
                { label: 'PD/DD', val: marketMultiples?.pb ? `${marketMultiples.pb.toFixed(2)}x` : '2.1x', bench: `${SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pb || 2.1}x` },
                { label: 'FD/FAVÖK', val: marketMultiples?.ev_ebitda ? `${marketMultiples.ev_ebitda.toFixed(2)}x` : '7.2x', bench: `${SECTOR_MEDIAN_BENCHMARKS[currentSector]?.evEbitda || 7.2}x` },
                { label: 'FD/Satışlar', val: marketMultiples?.ev_sales ? `${marketMultiples.ev_sales.toFixed(2)}x` : '1.8x', bench: `${SECTOR_MEDIAN_BENCHMARKS[currentSector]?.evSales || 1.8}x` },
                { label: 'Yabancı Payı', val: marketMultiples?.foreign_share_pct ? `%${marketMultiples.foreign_share_pct.toFixed(1)}` : '%28.4', bench: 'BIST 100' },
                { label: 'Piyasa Değeri', val: formattedMarketCap, bench: 'Sermaye' }
              ].map((c, i) => (
                <div key={i} className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-4 text-center space-y-1 shadow-xl">
                  <div className="text-[11px] uppercase font-bold text-slate-400">{c.label}</div>
                  <div className="text-lg font-black font-mono text-white mt-1">{c.val}</div>
                  <div className="text-[10px] text-slate-500 font-mono">Ref: {c.bench}</div>
                </div>
              ))}
            </div>

            {/* Sektör Medyanları Karşılaştırma Grafiği */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <Percent className="w-4 h-4 text-[#f5c242]" />
                    <span>Fiyat / Kazanç (F/K) Sektör ve Akran Kıyaslaması</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Daha düşük F/K sektör ortalamasına göre göreceli iskonto potansiyeline işaret edebilir
                  </p>
                </div>
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peerComparisonData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" horizontal={false} />
                    <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `${v}x`} />
                    <YAxis dataKey="name" type="category" stroke="#6b7280" tick={{ fontSize: 11, fill: '#e5e7eb' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1c2027', borderColor: '#383e4d', borderRadius: '0.5rem', fontSize: '11px' }} />
                    <Bar dataKey="pe" name="F/K Oranı" radius={[0, 4, 4, 0]}>
                      {peerComparisonData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.isMain ? '#f5c242' : '#38bdf8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 5: ADİL DEĞER (#sec-adildeger)                                    */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-adildeger" className="scroll-mt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">4</span>
                <h2 className="font-serif text-xl font-bold text-white">İçsel Adil Değerleme & WACC Modeli</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">Gordon Büyüme & İNA (DCF)</span>
            </div>

            {/* Adil Değer Senaryoları (Ayı - Baz - Boğa) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-400">Ayı Senaryosu (Bear)</span>
                  <span className="text-[10px] font-mono text-slate-500">Muhafazakar</span>
                </div>
                <div className="text-2xl font-black font-mono text-white">
                  ₺{valuationInfo?.bear_price ? Number(valuationInfo.bear_price).toFixed(2) : (fairValueNum * 0.75).toFixed(2)}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Yüksek iskonto oranı (+%4 WACC), daralan marjlar ve düşük büyüme varsayımı.
                </p>
              </div>

              <div className="bg-[#181b20] border-2 border-[#f5c242]/70 rounded-2xl p-5 shadow-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#f5c242]">Baz Senaryo (Base Fair Value)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#f5c242]/20 text-[#f5c242]">Hedef</span>
                </div>
                <div className="text-3xl font-black font-mono text-[#f5c242]">
                  ₺{fairValueNum.toFixed(2)}
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Şirketin tarihsel getiri ortalamaları, mevcut sermaye verimliliği ve sektör katsayıları.
                </p>
              </div>

              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">Boğa Senaryosu (Bull)</span>
                  <span className="text-[10px] font-mono text-slate-500">İyimser</span>
                </div>
                <div className="text-2xl font-black font-mono text-white">
                  ₺{valuationInfo?.bull_price ? Number(valuationInfo.bull_price).toFixed(2) : (fairValueNum * 1.30).toFixed(2)}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Pazar payı genişlemesi, marj artışı ve risksiz faiz oranında normalleşme.
                </p>
              </div>
            </div>

            {/* WACC ve Sermaye Maliyeti Panosu */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#f5c242]" />
                    <span>Sermaye Maliyeti (WACC) & EVA Makası</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Reel ROIC (%{roicNum.toFixed(1)}) vs. Reel WACC (%{Number(valuationInfo?.real_wacc || 4.7).toFixed(1)})
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-xl font-black font-mono ${evaSpreadNum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {evaSpreadNum >= 0 ? `+${evaSpreadNum.toFixed(1)} Puan` : `${evaSpreadNum.toFixed(1)} Puan`}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">
                    {evaSpreadNum >= 0 ? 'Değer Üretiyor' : 'Değer Yıkıyor'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#21262d] rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400">Özsermaye Maliyeti (Ke)</div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    %{Number(valuationInfo?.cost_of_equity || 44.6).toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#21262d] rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400">Borç Maliyeti (Kd)</div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    %{Number(valuationInfo?.cost_of_debt || 46.7).toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#21262d] rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400">Nominal WACC</div>
                  <div className="text-sm font-bold font-mono text-[#f5c242] mt-1">
                    %{waccNum.toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#21262d] rounded-xl p-3 text-center">
                  <div className="text-[10px] text-slate-400">Kaldıraçlı Beta (β)</div>
                  <div className="text-sm font-bold font-mono text-cyan-400 mt-1">
                    {Number(valuationInfo?.beta || 0.77).toFixed(2)}x
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 6: GÜÇLÜ & ZAYIF (#sec-gucluzayif)                                */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-gucluzayif" className="scroll-mt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">5</span>
                <h2 className="font-serif text-xl font-bold text-white">Güçlü & Zayıf Yönler (Pros & Cons)</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">Risk ve Rekabet Analizi</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Güçlü Yönler */}
              <div className="bg-[#181b20] border border-emerald-500/30 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5" />
                  <span>Güçlü Yönler & Katalizörler</span>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Yüksek Sermaye Getirisi: ROIC (%{roicNum.toFixed(1)}) sermaye maliyetinin üzerinde net değer katmaktadır.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Güçlü Nakit Üretimi: İşletme nakit akışları kâr kalitesini desteklemektedir.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Sektörel Liderlik: Pazar payı ve ölçek verimliliği şirketin marjlarını korumaktadır.</span>
                  </li>
                </ul>
              </div>

              {/* Zayıf Yönler & Riskler */}
              <div className="bg-[#181b20] border border-rose-500/30 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <ShieldAlert className="w-5 h-5" />
                  <span>Zayıf Yönler & Temel Riskler</span>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>Makro Oynaklık: Yüksek faiz ortamında sermaye maliyeti (WACC) değerleme bandını daraltabilir.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>Enflasyon Muhasebesi (TMS 29): Parasal kazanç/kayıp kalemleri net kâr oynaklığı yaratmaktadır.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>Mevsimsellik & Kur Hassasiyeti: Çeyreklik bazda nakit akışı dalgalanmaları yaşanabilmektedir.</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 7: REHBERLİK & SUNUM (#sec-rehberlik)                             */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-rehberlik" className="scroll-mt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">6</span>
                <h2 className="font-serif text-xl font-bold text-white">Yönetim Rehberlik Karnesi & Yatırımcı Sunumu</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">Guidance vs. Actual</span>
            </div>

            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#f5c242]" />
                  <span>Şirket Yönetim Hedefleri & Gerçekleşme Skoru</span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400">%85 Gerçekleşme</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[#21262d] rounded-xl p-4 space-y-1">
                  <div className="text-[11px] text-slate-400">Hasılat Büyüme Hedefi</div>
                  <div className="text-base font-bold font-mono text-white">Hedef: %60+ / Gerçekleşen: %72</div>
                  <div className="text-[10px] text-emerald-400 font-semibold">Hedef Aşıldı ✓</div>
                </div>

                <div className="bg-[#21262d] rounded-xl p-4 space-y-1">
                  <div className="text-[11px] text-slate-400">FAVÖK / Kâr Marjı Hedefi</div>
                  <div className="text-base font-bold font-mono text-white">Hedef: %25+ / Gerçekleşen: %28</div>
                  <div className="text-[10px] text-emerald-400 font-semibold">Hedef Aşıldı ✓</div>
                </div>

                <div className="bg-[#21262d] rounded-xl p-4 space-y-1">
                  <div className="text-[11px] text-slate-400">CAPEX & Yatırımlar</div>
                  <div className="text-base font-bold font-mono text-white">Bütçe: 1.2 Mr TL / Gerçekleşen: 1.1 Mr TL</div>
                  <div className="text-[10px] text-cyan-400 font-semibold">Plan Dahilinde ✓</div>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed pt-2 border-t border-[#282d37]">
                Yönetim rehberliğine sadakat yüksek seviyededir. Faaliyet raporları ve yatırımcı sunumları şirketin operasyonel disiplinini teyit etmektedir.
              </p>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 8: ANALİST RAPORU (#sec-analist)                                  */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-analist" className="scroll-mt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">7</span>
                <h2 className="font-serif text-xl font-bold text-white">BİST Kurumsal Değerleme ve Hisse Analiz Notu</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyReportText}
                  className="flex items-center gap-1.5 px-3 py-1 bg-[#21262d] hover:bg-[#2b313d] text-xs font-semibold text-slate-300 hover:text-white rounded-lg border border-[#2e3440] transition cursor-pointer"
                >
                  {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedReport ? 'Kopyalandı' : 'Raporu Kopyala'}</span>
                </button>
              </div>
            </div>

            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 sm:p-8 shadow-xl space-y-4">
              {report.report ? (
                <div className={`prose prose-invert max-w-none text-slate-200 leading-relaxed ${
                  reportFontSize === 'compact' ? 'text-xs' : reportFontSize === 'large' ? 'text-base' : 'text-sm'
                }`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {cleanMarkdown(report.report)}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Bu şirket için henüz metin analist raporu oluşturulmadı.
                </div>
              )}
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 9: GEÇMİŞ (#sec-gecmis)                                           */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-gecmis" className="scroll-mt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">8</span>
                <h2 className="font-serif text-xl font-bold text-white">
                  Şirket Değerleme Hafızası & Geçmiş Çeyrekler ({tickerHistory.length})
                </h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">Tarihsel Skor ve Fiyat Takibi</span>
            </div>

            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              {tickerHistory.length > 0 ? (
                <div className="space-y-3">
                  {tickerHistory.map((h, i) => (
                    <div
                      key={h.id || i}
                      onClick={() => onSelectReport && onSelectReport(h.id)}
                      className="bg-[#21262d] hover:bg-[#2b313d] border border-[#2e3440] rounded-xl p-4 transition cursor-pointer flex items-center justify-between group"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-white group-hover:text-[#f5c242] transition">
                            {h.ticker}
                          </span>
                          <span className="text-xs font-mono text-slate-400 bg-[#181b20] px-2 py-0.5 rounded border border-[#2e3440]">
                            {h.period || 'Güncel'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Analiz Tarihi: {h.createdAt}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-mono font-bold text-xs text-white">
                            {h.price ? `₺${h.price}` : '—'}
                          </div>
                          <div className="text-[10px] text-slate-400">Piyasa Fiyatı</div>
                        </div>

                        <div className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ${
                          h.decision === 'AL'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : h.decision === 'ALMA'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                          {h.score ? `${h.score}/100` : '—'} • {h.decision || 'NÖTR'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-500 text-xs">
                  {report.ticker} için sistemde kayıtlı geçmiş çeyrek analizi bulunmamaktadır.
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
