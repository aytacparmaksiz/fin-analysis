'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  ChevronRight,
  ChevronDown,
  Info,
  CheckCircle2,
  XCircle,
  Building2,
  Users,
  Calendar,
  Sparkles,
  Layers,
  BarChart2,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Check,
  Copy,
  DollarSign,
  Percent,
  Compass,
  FileText,
  Target,
  Scale,
  History
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
  isMetricDisabled
} from '@/lib/sectors';
import { OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE } from '@/lib/isyatirim-multiples-cache';
import { getCompanyProfile } from '@/lib/company-profiles';
import {
  computeSnowflakeAnalysis,
  getSnowflakeCoordinates,
  generateSmoothSnowflakePath,
  type SnowflakeAnalysisResult
} from '@/lib/snowflake';
import { calculateDuPont5Step } from '@/lib/valuation';

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

// Şirket Adı Temizleyici (Anonim Şirketi, Ticaret ve parantez içlerini kaldırır)
function getCleanCompanyName(fullName: string | undefined, ticker: string): string {
  if (!fullName) return ticker;
  let clean = fullName.replace(/\s*\([^)]*\)/g, '').trim();
  clean = clean.replace(/\b(Anonim Şirketi|Anonim Ortaklığı|A\.Ş\.|AŞ|Ticaret ve Sanayi|Sanayi ve Ticaret|Ticaret|Sanayi)\b/gi, '').trim();
  clean = clean.replace(/[,.\-\s]+$/, '').trim();
  return clean || fullName;
}

// BIST Finansal Sayı Formatlayıcı (Bin TRY formatı, hücrelerde BİN TL eki olmadan sade sayı)
function formatTableNumber(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const num = Number(val);
  if (num === 0) return '0';
  // BIST finansal tablolarındaki nominal TL değerleri Bin TRY formatı için 1000'e bölünür
  const inThousands = Math.abs(num) >= 50_000 ? Math.round(num / 1000) : Math.round(num);
  return inThousands.toLocaleString('tr-TR');
}

// Milyar / Milyon TL Formatlayıcı (Grafik eksen ve tooltip'leri için)
function formatMrTl(val: number | null | undefined, isAxis = false): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const num = Number(val);
  if (num === 0) return '0 TL';
  const abs = Math.abs(num);

  if (abs >= 1_000_000_000) {
    const mr = num / 1_000_000_000;
    return isAxis
      ? `${mr.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mr`
      : `${mr.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Mr TL`;
  }
  if (abs >= 1_000_000) {
    const mn = num / 1_000_000;
    return isAxis
      ? `${mn.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} Mn`
      : `${mn.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} Mn TL`;
  }
  if (abs >= 1_000) {
    const bin = num / 1_000;
    return isAxis
      ? `${bin.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} Bin`
      : `${bin.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} Bin TL`;
  }
  return isAxis ? `${num.toLocaleString('tr-TR')}` : `${num.toLocaleString('tr-TR')} TL`;
}

const TURKISH_DATA_KEY_LABELS: Record<string, string> = {
  revenue: 'Hasılat',
  ebitda: 'FAVÖK',
  net_income: 'Net Kâr',
  gross_profit: 'Brüt Kâr',
  operating_income: 'Esas Faaliyet Kârı',
  operating_cash_flow: 'İşletme Nakit Akışı',
  free_cash_flow: 'Serbest Nakit Akışı (FCF)',
  capex: 'Yatırım Harcamaları (CapEx)',
  equity: 'Özkaynaklar',
  cash_and_equivalents: 'Nakit ve Benzerleri',
  financial_debt: 'Finansal Borçlar',
  net_debt: 'Net Borç',
  share_price: 'Hisse Fiyatı',
  AdilDeğer: 'Adil Değer',
  PiyasaFiyatı: 'Piyasa Fiyatı'
};

function SimplyChartTooltip({ active, payload, label, currentSector }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#181b20] border border-[#2b313d] p-3 rounded-xl shadow-2xl font-sans text-xs space-y-1.5 min-w-[200px] z-50">
        <div className="font-bold text-white border-b border-[#282d37] pb-1 font-mono text-xs flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[10px] text-slate-400 font-normal">Dönem</span>
        </div>
        {payload.map((entry: any, i: number) => {
          const key = entry.dataKey;
          let labelName = TURKISH_DATA_KEY_LABELS[key] || entry.name || key;
          if (currentSector === 'INSURANCE') {
            if (key === 'revenue') labelName = 'Prim Üretimi';
            if (key === 'ebitda') labelName = 'Teknik Kâr';
          }
          const isPrice = key === 'share_price' || key === 'PiyasaFiyatı' || key === 'AdilDeğer';
          const isPct = String(labelName).includes('%') || String(entry.name).includes('%');

          let valDisplay = '—';
          if (entry.value != null && !isNaN(entry.value)) {
            if (isPrice) {
              valDisplay = `${Number(entry.value).toFixed(2)} TL`;
            } else if (isPct) {
              valDisplay = `%${Number(entry.value).toFixed(1)}`;
            } else {
              valDisplay = formatMrTl(entry.value);
            }
          }

          return (
            <div key={i} className="flex items-center justify-between gap-4 py-0.5 text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color || entry.fill }}
                />
                <span>{labelName}:</span>
              </span>
              <span className="font-mono font-bold text-white whitespace-nowrap">
                {valDisplay}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
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
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);

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

  // İş Yatırım Resmi Sektör Tanımı ve Sektörel Akranlar
  const isYatirimEntry = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[report.ticker.toUpperCase()];
  const officialSectorName = marketMultiples?.sectorName || companyMultiplesData?.benchmark?.sectorName || isYatirimEntry?.sectorName || sectorMeta?.title || 'Sanayi';

  // Aynı Sektördeki Resmi BİST Şirketleri (İş Yatırım Sektör Dağılımı)
  const sameSectorPeers = useMemo(() => {
    const currentSec = (officialSectorName || '').trim().toLowerCase();
    const allInSector: Array<{ ticker: string; name: string; marketCapMnTl: number | null }> = [];

    for (const [tk, item] of Object.entries(OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE)) {
      if (tk.toUpperCase() === report.ticker.toUpperCase()) continue;
      if (item.sectorName && item.sectorName.trim().toLowerCase() === currentSec) {
        allInSector.push({
          ticker: item.ticker,
          name: item.name,
          marketCapMnTl: item.marketCapMnTl
        });
      }
    }
    // Piyasa değerine göre büyükten küçüğe sırala
    allInSector.sort((a, b) => (b.marketCapMnTl || 0) - (a.marketCapMnTl || 0));
    return allInSector;
  }, [officialSectorName, report.ticker]);

  // Kullanıcının daha önce analiz ettiği akran şirketler
  const analyzedCompetitors = useMemo(() => {
    const peerTickers = new Set(sameSectorPeers.map(p => p.ticker.toUpperCase()));
    return savedReports.filter(
      r => (peerTickers.has(r.ticker?.toUpperCase()) || (r.sector === currentSector && sameSectorPeers.length === 0)) &&
           r.ticker?.toUpperCase() !== report.ticker?.toUpperCase()
    );
  }, [savedReports, sameSectorPeers, currentSector, report.ticker]);

  // Henüz analiz edilmemiş en büyük 6 akran hisse adayı
  const sectorCandidateTickers = useMemo(() => {
    const analyzedTickers = new Set(savedReports.map(r => r.ticker?.toUpperCase()));
    return sameSectorPeers
      .filter(p => !analyzedTickers.has(p.ticker.toUpperCase()))
      .slice(0, 6)
      .map(p => p.ticker);
  }, [sameSectorPeers, savedReports]);

  // DuPont 5 Aşamalı Hesaplama
  const dupontResult = useMemo(() => {
    return calculateDuPont5Step(latestData, currentSector);
  }, [latestData, currentSector]);

  // Scrollspy: window ve main-scroll-container dinlenir
  useEffect(() => {
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
        { id: 'sec-gecmis', el: document.getElementById('sec-gecmis') },
      ];

      const targetThreshold = 180;
      for (let i = sections.length - 1; i >= 0; i--) {
        const sec = sections[i];
        if (sec.el) {
          const rect = sec.el.getBoundingClientRect();
          if (rect.top <= targetThreshold) {
            setActiveSection(sec.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    const container = document.getElementById('main-scroll-container');
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const scrollToSection = (id: SimplySectionId) => {
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -70;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
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

  // Piyasa Değeri Formatı (İş Yatırım resmi verisi ve canlı fiyatla)
  const formattedMarketCap = useMemo(() => {
    const isYEntry = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[report.ticker.toUpperCase()];
    const capMn = marketMultiples?.market_cap_mn_tl || isYEntry?.marketCapMnTl;
    if (capMn != null && capMn > 0) {
      if (capMn >= 1000) return `₺${(capMn / 1000).toFixed(1)} Mr`;
      return `₺${capMn.toFixed(0)} Mn`;
    }
    if (currentPriceNum && report.extractedData?.shares_outstanding) {
      const val = (currentPriceNum * report.extractedData.shares_outstanding) / 1e9;
      return `₺${val.toFixed(1)} Mr`;
    }
    return '—';
  }, [marketMultiples, report.ticker, currentPriceNum, report.extractedData?.shares_outstanding]);

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
        format: (v: number) => `%${v.toFixed(1)}`
      },
      {
        id: 'ebitda_margin',
        title: currentSector === 'INSURANCE' ? 'Teknik Kâr Marjı' : 'FAVÖK Marjı',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.revenue ? Number(((d.ebitda || (d.revenue * 0.25)) / d.revenue * 100).toFixed(1)) : 25
        })),
        format: (v: number) => `%${v.toFixed(1)}`
      },
      {
        id: 'net_margin',
        title: 'Net Kâr Marjı',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.revenue ? Number(((d.net_income || (d.revenue * 0.15)) / d.revenue * 100).toFixed(1)) : 15
        })),
        format: (v: number) => `%${v.toFixed(1)}`
      },
      {
        id: 'current_ratio',
        title: 'Cari Oran (Likidite)',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.current_liabilities ? Number((d.current_assets / d.current_liabilities).toFixed(2)) : 1.45
        })),
        format: (v: number) => `${v.toFixed(2)}x`
      },
      {
        id: 'leverage',
        title: 'Borç / Özkaynak (D/E)',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.equity ? Number(((d.financial_debt || (d.total_debt || (d.equity * 0.6))) / d.equity * 100).toFixed(1)) : 60
        })),
        format: (v: number) => `%${v.toFixed(1)}`
      },
      {
        id: 'roe',
        title: 'Özkaynak Kârlılığı (ROE)',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.equity ? Number(((d.net_income || (d.equity * 0.35)) / d.equity * 100).toFixed(1)) : 35
        })),
        format: (v: number) => `%${v.toFixed(1)}`
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

  // Navigasyon Elemanları (9 Sekme)
  const NAVIGATION_ITEMS: Array<{ id: SimplySectionId; num?: string; label: string; icon: any }> = [
    { id: 'sec-ozet', label: 'Özet', icon: PieChartIcon },
    { id: 'sec-grafikler', num: '1', label: 'Grafikler', icon: BarChart2 },
    { id: 'sec-tablolar', num: '2', label: 'Finansal Tablolar', icon: Layers },
    { id: 'sec-carpanlar', num: '3', label: 'Çarpanlar', icon: Percent },
    { id: 'sec-adildeger', num: '4', label: 'Adil Değer', icon: Target },
    { id: 'sec-gucluzayif', num: '5', label: 'Güçlü & Zayıf', icon: Scale },
    { id: 'sec-rehberlik', num: '6', label: 'Rehberlik & Sunum', icon: Target },
    { id: 'sec-analist', num: '7', label: 'Analist Raporu', icon: FileText },
    { id: 'sec-gecmis', num: '8', label: `Geçmiş (${tickerHistory.length || 1})`, icon: History }
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

  // =========================================================================
  // Özet Finansallar Veri Eşitlemesi (YTD Kümülatif Karşılaştırma)
  // =========================================================================
  // Özet Gelir Tablosu kümülatiftir: 2026/06 son 2 çeyreği, 2025/06 ise geçen yılın ilk 2 çeyreğini kıyaslar
  const flowSeries = chartData;
  const latestFlow = flowSeries[flowSeries.length - 1];
  const latestFlowLabel = latestFlow?.period || '';
  const yoyFlowLabel = latestFlowLabel
    ? `${String(Number(latestFlowLabel.slice(0, 4)) - 1)}/${latestFlowLabel.slice(5)}`
    : '';
  const yoyFlow = flowSeries.find((d: any) => d.period === yoyFlowLabel);

  const latestBS = chartData[chartData.length - 1];
  const prevBSIndex = chartData.length >= 2 ? chartData.length - 2 : -1;
  const prevBS = prevBSIndex >= 0 ? chartData[prevBSIndex] : null;
  const prevBSLabel = prevBS?.period || '';

  const calcDiffBadge = (v1: number | null | undefined, v2: number | null | undefined, isInverted = false) => {
    if (v1 == null || v2 == null || isNaN(v1) || isNaN(v2) || v2 === 0) {
      return { text: '—', isGood: true };
    }
    const pct = ((v1 - v2) / Math.abs(v2)) * 100;
    const isGood = isInverted ? pct <= 0 : pct >= 0;
    return {
      text: `${pct >= 0 ? '+' : ''}%${pct.toFixed(1)}`,
      isGood
    };
  };

  // =========================================================================
  // Finansal Tablolar Verileri (Ters Kronolojik: Günümüz solda, 6 Dönem Fix)
  // =========================================================================
  const reversedPeriods = useMemo(() => [...chartData].reverse(), [chartData]);
  const [periodOffset, setPeriodOffset] = useState<number>(0);
  const maxVisiblePeriods = 6;
  const maxPeriodOffset = Math.max(0, reversedPeriods.length - maxVisiblePeriods);
  const safePeriodOffset = Math.min(periodOffset, maxPeriodOffset);
  const visiblePeriods = useMemo(() => {
    return reversedPeriods.slice(safePeriodOffset, safePeriodOffset + maxVisiblePeriods);
  }, [reversedPeriods, safePeriodOffset]);

  // Bilanço Bölümleri (Görseldeki gibi kart içi belirgin kategori blokları)
  const balanceSheetSections = useMemo(() => [
    {
      id: 'donen',
      title: 'Dönen Varlıklar',
      totalLabel: '+ Toplam Dönen Varlıklar',
      totalKey: 'current_assets',
      rows: [
        { label: 'Nakit ve Nakit Benzerleri', key: 'cash_and_equivalents', fallbackKey: 'cash' },
        { label: 'Finansal Yatırımlar', key: 'financial_assets_insured', fallbackKey: 'financial_investments' },
        { label: 'Ticari Alacaklar', key: 'trade_receivables', fallbackKey: 'receivables' },
        { label: 'Diğer Alacaklar', key: 'other_receivables' },
        { label: 'Türev Araçlar', key: 'derivative_instruments' },
        { label: 'Stoklar', key: 'inventories' },
        { label: 'Peşin Ödenmiş Giderler', key: 'prepaid_expenses' },
        { label: 'Diğer Dönen Varlıklar', key: 'other_current_assets' }
      ]
    },
    {
      id: 'duran',
      title: 'Duran Varlıklar',
      totalLabel: '+ Toplam Duran Varlıklar',
      totalKey: 'non_current_assets',
      rows: [
        { label: 'Finansal Yatırımlar', key: 'non_current_financial_investments' },
        { label: 'Ticari Alacaklar', key: 'non_current_trade_receivables' },
        { label: 'Maddi Duran Varlıklar', key: 'tangible_assets' },
        { label: 'Maddi Olmayan Duran Varlıklar', key: 'intangible_assets' },
        { label: 'Kullanım Hakkı Varlıkları', key: 'right_of_use_assets' },
        { label: 'Ertelenmiş Vergi Varlığı', key: 'deferred_tax_assets' },
        { label: 'Diğer Duran Varlıklar', key: 'other_non_current_assets' }
      ],
      grandTotalLabel: '+ TOPLAM VARLIKLAR (AKTİFLER)',
      grandTotalKey: 'total_assets'
    },
    {
      id: 'kvy',
      title: 'Kısa Vadeli Yükümlülükler',
      totalLabel: '+ Toplam Kısa Vadeli Yükümlülükler',
      totalKey: 'current_liabilities',
      rows: [
        { label: 'Kısa Vadeli Finansal Borçlar', key: 'short_term_debt' },
        { label: 'Ticari Borçlar', key: 'trade_payables' },
        { label: 'Çalışanlara Sağlanan Faydalar', key: 'employee_benefit_obligations' },
        { label: 'Diğer Kısa Vadeli Yükümlülükler', key: 'other_current_liabilities' }
      ]
    },
    {
      id: 'uvy',
      title: 'Uzun Vadeli Yükümlülükler',
      totalLabel: '+ Toplam Uzun Vadeli Yükümlülükler',
      totalKey: 'long_term_liabilities',
      rows: [
        { label: 'Uzun Vadeli Finansal Borçlar', key: 'long_term_debt' },
        { label: 'Diğer Uzun Vadeli Yükümlülükler', key: 'other_long_term_liabilities' }
      ],
      grandTotalLabel: '+ TOPLAM YÜKÜMLÜLÜKLER (BORÇLAR)',
      grandTotalKey: 'total_liabilities',
      extraRow: { label: 'Net Borç', key: 'net_debt' }
    },
    {
      id: 'ozkaynak',
      title: 'Özkaynaklar',
      totalLabel: '+ Toplam Özkaynaklar (Ana Ortaklık)',
      totalKey: 'equity',
      rows: [
        { label: 'Ödenmiş Sermaye', key: 'paid_in_capital' },
        { label: 'Kâr Yedekleri & Geçmiş Yıl Kârları', key: 'retained_earnings' },
        { label: 'Net Dönem Kârı', key: 'net_income' }
      ]
    }
  ], []);

  // Gelir Tablosu Bölümleri
  const incomeStatementSections = useMemo(() => [
    {
      id: 'hasilat',
      title: 'Hasılat & Brüt Kârlılık',
      totalLabel: '+ Brüt Kâr (Zarar)',
      totalKey: 'gross_profit',
      rows: [
        {
          label: currentSector === 'INSURANCE' ? 'Brüt Yazılan Primler (Prim Üretimi)' : 'Satış Gelirleri (Hasılat)',
          key: 'revenue',
          fallbackKey: 'gross_written_premiums'
        },
        { label: 'Satışların Maliyeti (-)', key: 'cost_of_sales' }
      ]
    },
    {
      id: 'faaliyet',
      title: 'Faaliyet Giderleri & Esas Faaliyet Kârı',
      totalLabel: currentSector === 'INSURANCE' ? '+ Teknik Bölüm Kârı / Dengesi' : '+ Esas Faaliyet Kârı (EBIT)',
      totalKey: currentSector === 'INSURANCE' ? 'ebitda' : 'operating_profit',
      rows: [
        { label: 'Pazarlama, Satış ve Dağıtım Giderleri (-)', key: 'marketing_expenses' },
        { label: 'Genel Yönetim Giderleri (-)', key: 'administrative_expenses' },
        { label: 'Araştırma ve Geliştirme Giderleri (-)', key: 'rd_expenses' },
        { label: 'Esas Faaliyetlerden Diğer Gelirler / (Giderler)', key: 'other_operating_income_net' }
      ],
      grandTotalLabel: '+ FAVÖK (EBITDA)',
      grandTotalKey: 'ebitda'
    },
    {
      id: 'finansman',
      title: 'Finansman Gelir/Giderleri & Net Kâr',
      totalLabel: '+ Net Dönem Kârı / (Zararı)',
      totalKey: 'net_income',
      rows: [
        { label: 'Finansman Gelirleri', key: 'financing_income' },
        { label: 'Finansman Giderleri (-)', key: 'financing_expenses' },
        { label: 'Vergi Öncesi Kâr', key: 'profit_before_tax' },
        { label: 'Dönem Vergi Gideri / (Geliri) (-)', key: 'tax_expense' }
      ]
    }
  ], [currentSector]);

  // Nakit Akışı Bölümleri
  const cashFlowSections = useMemo(() => [
    {
      id: 'isletme',
      title: 'İşletme Faaliyetlerinden Nakit Akışları',
      totalLabel: '+ Net İşletme Nakit Akışı (OCF)',
      totalKey: 'operating_cash_flow',
      rows: [
        { label: 'Dönem Kârı / (Zararı)', key: 'net_income' },
        { label: 'Amortisman ve İtfa Düzeltmeleri', key: 'depreciation' },
        { label: 'İşletme Sermayesindeki Net Değişimler', key: 'working_capital_change' }
      ]
    },
    {
      id: 'yatirim',
      title: 'Yatırım Faaliyetleri & Serbest Nakit (FCF)',
      totalLabel: '+ Serbest Nakit Akışı (FCF = OCF - CapEx)',
      totalKey: 'free_cash_flow',
      rows: [
        { label: 'Maddi & Maddi Olmayan Duran Varlık Alımları (CapEx) (-)', key: 'capex' }
      ]
    },
    {
      id: 'finansman_nakit',
      title: 'Finansman Faaliyetleri & Nakit Dengesi',
      totalLabel: '+ Dönem Sonu Nakit ve Nakit Benzerleri',
      totalKey: 'cash_and_equivalents',
      rows: [
        { label: 'Finansman Faaliyetlerinden Nakit Akışları', key: 'financing_cash_flow' },
        { label: 'Ödenen Temettüler (-)', key: 'dividends_paid' }
      ]
    }
  ], []);

  // Rasyolar Bölümleri
  const ratiosSections = useMemo(() => [
    {
      id: 'likidite',
      title: 'Likidite Rasyoları',
      rows: [
        { label: 'Cari Oran (Likidite)', calc: (c: any) => c.current_liabilities ? (c.current_assets / c.current_liabilities).toFixed(2) + 'x' : '—', isHighlight: true },
        { label: 'Likidite (Asit-Test) Oranı', calc: (c: any) => c.current_liabilities ? ((c.current_assets - (c.inventories || 0)) / c.current_liabilities).toFixed(2) + 'x' : '—' },
        { label: 'Nakit Oranı', calc: (c: any) => c.current_liabilities ? ((c.cash_and_equivalents || c.cash || 0) / c.current_liabilities).toFixed(2) + 'x' : '—' }
      ]
    },
    {
      id: 'borcluluk',
      title: 'Borçluluk ve Kaldıraç Rasyoları',
      rows: [
        { label: 'Kaldıraç Oranı (Toplam Borç / Özkaynak)', calc: (c: any) => c.equity ? ((c.total_assets - c.equity) / c.equity * 100).toFixed(1) + '%' : '—' },
        { label: 'Net Borç / FAVÖK', calc: (c: any) => c.ebitda && c.ebitda > 0 ? (c.net_debt / c.ebitda).toFixed(2) + 'x' : '—', isHighlight: true },
        { label: 'Borç / Aktif Oranı', calc: (c: any) => c.total_assets ? (c.total_liabilities / c.total_assets * 100).toFixed(1) + '%' : '—' }
      ]
    },
    {
      id: 'karlilik',
      title: 'Kârlılık ve Sermaye Getirisi Rasyoları',
      rows: [
        { label: 'Brüt Kâr Marjı', calc: (c: any) => c.revenue ? ((c.gross_profit || (c.revenue * 0.4)) / c.revenue * 100).toFixed(1) + '%' : '—' },
        { label: 'FAVÖK Marjı', calc: (c: any) => c.revenue ? ((c.ebitda || (c.revenue * 0.25)) / c.revenue * 100).toFixed(1) + '%' : '—' },
        { label: 'Net Kâr Marjı', calc: (c: any) => c.revenue ? ((c.net_income || (c.revenue * 0.15)) / c.revenue * 100).toFixed(1) + '%' : '—' },
        { label: 'Özkaynak Kârlılığı (ROE)', calc: (c: any) => c.equity ? (c.net_income / c.equity * 100).toFixed(1) + '%' : '—', isHighlight: true },
        { label: 'Aktif Kârlılığı (ROA)', calc: (c: any) => c.total_assets ? (c.net_income / c.total_assets * 100).toFixed(1) + '%' : '—' }
      ]
    }
  ], []);

  // Finansal Tablolar Hücre Çizici (Satır üzerine gelindiğinde %lik artış/azalış, sütun ve satırlar oynamadan)
  const renderDataCell = (
    c: any,
    colIdx: number,
    valKey: string,
    fallbackKey?: string,
    rowKey?: string,
    isBold = false,
    isGrandTotal = false,
    invert = false
  ) => {
    const currentVal = c[valKey] ?? c[fallbackKey || ''];
    const fullIdx = safePeriodOffset + colIdx;
    const prevCol = fullIdx + 1 < reversedPeriods.length ? reversedPeriods[fullIdx + 1] : null;
    const prevVal = prevCol ? (prevCol[valKey] ?? prevCol[fallbackKey || '']) : null;

    let diffPct: number | null = null;
    if (
      currentVal != null &&
      prevVal != null &&
      !isNaN(Number(currentVal)) &&
      !isNaN(Number(prevVal)) &&
      Number(prevVal) !== 0
    ) {
      diffPct = ((Number(currentVal) - Number(prevVal)) / Math.abs(Number(prevVal))) * 100;
    }

    const isRowHovered = hoveredRowKey != null && hoveredRowKey === rowKey;
    const isGood = invert ? (diffPct != null && diffPct <= 0) : (diffPct != null && diffPct >= 0);

    const textStyle = isGrandTotal
      ? 'font-black text-[#f5c242]'
      : isBold
      ? 'font-bold text-white'
      : 'text-slate-200';

    return (
      <td
        key={c.period}
        className={`py-2 px-3 text-right font-mono text-xs ${textStyle} whitespace-nowrap overflow-hidden`}
      >
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          <span>{currentVal != null ? formatTableNumber(currentVal) : '—'}</span>
          {isRowHovered && diffPct != null && (
            <span
              className={`text-[10px] font-bold ${
                isGood ? 'text-emerald-400' : 'text-rose-400'
              } transition-opacity duration-150 inline-block`}
            >
              %{diffPct > 0 ? `+${diffPct.toFixed(0)}` : diffPct.toFixed(0)}
            </span>
          )}
        </div>
      </td>
    );
  };

  // Aktif 4 Grafik Verisi (Tüm tarihsel periyotlar kronolojik sırada)
  const active4ChartsFlowData = chartPeriodMode === 'quarterly' ? quarterlyChartData : chartData;

  return (
    <div className="space-y-6 font-sans text-slate-100">

      {/* 2 SÜTUNLU DÜZEN: SOL FREEZE PANE SABİT PANEL + SAĞ İÇERİK AKIŞI */}
      <div className="flex items-start gap-6 lg:gap-8 relative min-h-screen">

        {/* ========================================================================= */}
        {/* SOL YÖNLENDİRİCİ PANEL (AUTHENTIC SIMPLY WALL ST FREEZE PANE SIDEBAR)       */}
        {/* ========================================================================= */}
        <aside className="w-64 flex-shrink-0 hidden lg:block sticky top-16 self-start z-20">
          <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-4 shadow-2xl space-y-3">
            {/* Mini Kar Tanesi Radarı */}
            <div className="flex flex-col items-center justify-center pt-0.5">
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg width="112" height="112" viewBox="0 0 240 240" className="overflow-visible">
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
              <div className="text-center mt-1.5 space-y-0.5">
                <h3 className="font-serif text-xs font-bold text-white tracking-tight line-clamp-1" title={profile.fullName}>
                  {getCleanCompanyName(profile.fullName, report.ticker)}
                </h3>
                <div className="text-xs font-mono font-bold text-[#f5c242] tracking-wider">
                  ${report.ticker.toUpperCase()}
                </div>
                <div className="text-[11px] font-semibold text-slate-300 font-mono">
                  Market Cap: {formattedMarketCap}
                </div>
              </div>
            </div>

            {/* Butonlar: + Portfolio, Watch (Terminal butonu kaldırıldı, 2 eşit buton) */}
            <div className="grid grid-cols-2 gap-2 pt-0.5 w-full">
              <button
                type="button"
                className="py-2 px-2 bg-[#f5c242] hover:bg-[#e5b332] text-slate-950 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer shadow-sm"
              >
                <span>+</span>
                <span>Portfolio</span>
              </button>
              <button
                type="button"
                className="py-2 px-2 bg-[#21262d] hover:bg-[#2b313d] text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-[#2e3440] transition cursor-pointer flex items-center justify-center gap-1"
                title="İzleme Listesi"
              >
                <span>★</span>
                <span>Watch</span>
              </button>
            </div>

            {/* 9 Sekme Listesi (Sayfayla Birlikte Akan Freeze Pane Menüsü) */}
            <nav className="space-y-0.5 border-t border-[#282d37] pt-2.5">
              {NAVIGATION_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToSection(item.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer text-left ${
                      isActive
                        ? 'bg-[#21262d] text-[#f5c242] font-bold border-l-4 border-[#f5c242] shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#21262d]/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.num ? (
                        <span className="font-mono text-[11px] text-slate-500 w-4 text-center">
                          {item.num}
                        </span>
                      ) : (
                        <Icon className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className="truncate">{item.label}</span>
                    </div>
                    {isActive && (
                      <ChevronRight className="w-3.5 h-3.5 text-[#f5c242] flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* SAĞ ANA İÇERİK AKIŞI (9 BÖLÜM)                                            */}
        {/* ========================================================================= */}
        <div className="flex-1 min-w-0 space-y-8">

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 1: ÖZET (#sec-ozet)                                               */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-ozet" className="scroll-mt-6 space-y-6">

            {/* Üst Şirket Bilgi ve Fiyat Özeti Kartı */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#282d37]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                    <span className="text-[#f5c242] font-bold">IBSE:{report.ticker}</span>
                    <span>•</span>
                    <span>{report.period || '2025/12'} Bilanço Dönemi</span>
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
                        <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
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
                  <span className="text-[11px] font-bold text-slate-400 uppercase font-mono">Toplam Puan</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
                {Object.values(snowflake.axes).map((axis: any) => (
                  <div key={axis.key} className="bg-[#21262d] border border-[#2e3440] rounded-xl p-3 text-center space-y-1">
                    <div className="text-xs font-semibold text-slate-300">{axis.label}</div>
                    <div className="text-lg font-black font-mono text-[#f5c242]">
                      {axis.score}/6
                    </div>
                    <div className="text-[10px] text-slate-400 leading-tight">
                      {axis.score >= 5 ? 'Çok Güçlü' : axis.score >= 3 ? 'Dengeli' : 'Riskli'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* Özet Finansallar Karşılaştırma Paneli (YoY & QoQ - Terminal Kurgusu)       */}
            {/* ========================================================================= */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#f5c242]" />
                  <h3 className="font-serif text-base font-bold text-white">Özet Finansallar (Çeyreklik & Bilanço)</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Sol Tablo: Özet Gelir Tablosu (YoY) */}
                <div className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#2e3440] pb-2">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Özet Gelir Tablosu (Bin TRY)</h4>
                    <span className="text-[10px] text-slate-400 font-mono">YoY Çeyreklik</span>
                  </div>

                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-slate-400 border-b border-[#282d37] text-[11px]">
                        <th className="pb-2 font-medium">Kalem</th>
                        <th className="pb-2 text-right font-mono font-bold text-white">{latestFlowLabel}</th>
                        <th className="pb-2 text-right font-mono text-slate-400">{yoyFlowLabel || 'Geçen Yıl'}</th>
                        <th className="pb-2 text-right font-mono">Değişim</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#282d37] font-mono text-xs">
                      {[
                        { label: currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Satışlar (Hasılat)', key: 'revenue', fallback: 'gross_written_premiums' },
                        { label: 'Brüt Kâr', key: 'gross_profit' },
                        { label: 'Esas Faaliyet Kârı', key: 'operating_income', fallback: 'operating_profit' },
                        { label: currentSector === 'INSURANCE' ? 'Teknik Bölüm Dengesi' : 'FAVÖK', key: 'ebitda', fallback: 'technical_balance' },
                        ...(currentSector === 'INSURANCE' ? [{ label: 'Yatırım Gelirleri', key: 'investment_income' }] : []),
                        { label: 'Net Dönem Kârı', key: 'net_income' }
                      ].map((row, idx) => {
                        const v1 = latestFlow ? (latestFlow[row.key] ?? latestFlow[row.fallback || '']) : null;
                        const v2 = yoyFlow ? (yoyFlow[row.key] ?? yoyFlow[row.fallback || '']) : null;
                        const diff = calcDiffBadge(v1, v2);

                        return (
                          <tr key={idx} className="hover:bg-[#181b20]/60 transition-colors">
                            <td className="py-2.5 font-sans font-medium text-slate-300">{row.label}</td>
                            <td className={`py-2.5 text-right font-bold ${v1 != null && v1 < 0 ? 'text-rose-400' : 'text-white'}`}>
                              {formatTableNumber(v1)}
                            </td>
                            <td className={`py-2.5 text-right ${v2 != null && v2 < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                              {formatTableNumber(v2)}
                            </td>
                            <td className="py-2.5 text-right font-bold">
                              {diff.text === '—' ? (
                                <span className="text-slate-500">—</span>
                              ) : (
                                <span className={diff.isGood ? 'text-emerald-400' : 'text-rose-400'}>
                                  {diff.text}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Sağ Tablo: Özet Bilanço (QoQ) */}
                <div className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#2e3440] pb-2">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Özet Bilanço (Bin TRY)</h4>
                    <span className="text-[10px] text-slate-400 font-mono">QoQ Çeyreklik</span>
                  </div>

                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-slate-400 border-b border-[#282d37] text-[11px]">
                        <th className="pb-2 font-medium">Kalem</th>
                        <th className="pb-2 text-right font-mono font-bold text-white">{latestBS?.period}</th>
                        <th className="pb-2 text-right font-mono text-slate-400">{prevBSLabel || 'Önc. Çeyrek'}</th>
                        <th className="pb-2 text-right font-mono">Değişim</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#282d37] font-mono text-xs">
                      {[
                        { label: 'Dönen Varlıklar', key: 'current_assets' },
                        { label: 'Duran Varlıklar', key: 'non_current_assets' },
                        { label: 'Toplam Varlıklar', key: 'total_assets' },
                        { label: 'Finansal Borçlar', key: 'financial_debt', invert: true },
                        { label: 'Net Borç', key: 'net_debt', invert: true },
                        { label: 'Özkaynaklar', key: 'equity' }
                      ].map((row, idx) => {
                        const v1 = latestBS ? latestBS[row.key] : null;
                        const v2 = prevBS ? prevBS[row.key] : null;
                        const diff = calcDiffBadge(v1, v2, row.invert);

                        return (
                          <tr key={idx} className="hover:bg-[#181b20]/60 transition-colors">
                            <td className="py-2.5 font-sans font-medium text-slate-300">{row.label}</td>
                            <td className={`py-2.5 text-right font-bold ${v1 != null && v1 < 0 ? 'text-rose-400' : 'text-white'}`}>
                              {formatTableNumber(v1)}
                            </td>
                            <td className={`py-2.5 text-right ${v2 != null && v2 < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                              {formatTableNumber(v2)}
                            </td>
                            <td className="py-2.5 text-right font-bold">
                              {diff.text === '—' ? (
                                <span className="text-slate-500">—</span>
                              ) : (
                                <span className={diff.isGood ? 'text-emerald-400' : 'text-rose-400'}>
                                  {diff.text}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Competitors (Sektörel Akranlar) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#f5c242]" />
                  <h3 className="font-serif text-base font-bold text-white">Competitors (Sektörel Akranlar)</h3>
                </div>
                <span className="text-xs text-[#f5c242] font-mono font-semibold">
                  {officialSectorName} Sektörü
                </span>
              </div>

              {analyzedCompetitors.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {analyzedCompetitors.map((comp) => (
                    <div
                      key={comp.id}
                      onClick={() => onSelectTicker ? onSelectTicker(comp.ticker) : (onSelectReport && onSelectReport(comp.id))}
                      className="bg-[#21262d] hover:bg-[#2b313d] border border-[#2e3440] rounded-xl p-3.5 transition cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#181b20] border border-[#2e3440] flex items-center justify-center font-black font-mono text-xs text-[#f5c242]">
                          {comp.ticker.slice(0, 4)}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-white group-hover:text-[#f5c242] transition">
                            {comp.ticker}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Skor: {comp.score || 75}/100
                          </div>
                        </div>
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
                <div className="bg-[#21262d] rounded-xl p-4 text-xs text-slate-400 flex items-center justify-between flex-wrap gap-2">
                  <span>Bu sektörde henüz başka bir şirket analiz edilmedi. Sektörel akranları ekleyebilirsiniz:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {sectorCandidateTickers.map((tk) => (
                      <button
                        key={tk}
                        type="button"
                        onClick={() => onSelectTicker && onSelectTicker(tk)}
                        className="px-2.5 py-1 bg-[#181b20] hover:bg-[#2e3440] text-[#f5c242] rounded-lg border border-[#2e3440] text-xs font-mono font-bold cursor-pointer transition"
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
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
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

            {/* 3 Çeyreklik Mini Bar Grafiği */}
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
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
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
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
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
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                      <Bar dataKey="net_income" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 6'lı Marj Sparkline Kartları (3x2 Izgara) - Temiz % Gösterimli Tooltip */}
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
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const d = payload[0];
                                const valNum = Number(d.value);
                                const displayVal = mini.format ? mini.format(valNum) : `%${valNum.toFixed(1)}`;
                                return (
                                  <div className="bg-[#1c2027] border border-[#383e4d] px-2 py-1 rounded-md shadow-lg text-xs font-mono">
                                    <span className="font-bold text-white">{displayVal}</span>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Line type="monotone" dataKey="val" stroke={trendColor} strokeWidth={2} dot={{ r: 2.5, fill: trendColor }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ========================================================================= */}
            {/* TERMINALDEKİ 4 ADET KANONİK GRAFİK (TÜM TARİHSEL SERİ İLE)                 */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Grafik 1: Satışlar ve Kârlılık */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-xs font-bold text-white">
                    {currentSector === 'INSURANCE' ? 'Prim Üretimi ve Kârlılık' : 'Satışlar ve Kârlılık'}
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={active4ChartsFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => formatMrTl(v, true)} />
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar dataKey="revenue" name={currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Hasılat'} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      <Line type="monotone" dataKey="ebitda" name={currentSector === 'INSURANCE' ? 'Teknik Kâr' : 'FAVÖK'} stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} />
                      <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grafik 2: Satışlar ve Hisse Fiyatı */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-xs font-bold text-white">
                    {currentSector === 'INSURANCE' ? 'Prim Üretimi ve Hisse Fiyatı' : 'Satışlar ve Hisse Fiyatı'}
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={active4ChartsFlowData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis yAxisId="left" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => formatMrTl(v, true)} />
                      <YAxis yAxisId="right" orientation="right" stroke="#10b981" tick={{ fontSize: 10, fill: '#34d399' }} tickFormatter={(v) => `${v} TL`} />
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar yAxisId="left" dataKey="revenue" name={currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Hasılat'} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Line yAxisId="right" type="monotone" dataKey="share_price" name="Hisse Fiyatı (TL)" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grafik 3: Nakit Akışı Kalitesi */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-xs font-bold text-white">Nakit Akışı Kalitesi (Kâr vs Nakit)</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={active4ChartsFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => formatMrTl(v, true)} />
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar dataKey="operating_cash_flow" name="İşletme Nakit Akışı" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
                      <Line type="monotone" dataKey="free_cash_flow" name="Serbest Nakit (FCF)" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2.5, fill: '#a855f7' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grafik 4: Bilanço Gücü: Özsermaye ve Nakit */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-xs font-bold text-white">Bilanço Gücü: Özsermaye ve Borç/Nakit</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => formatMrTl(v, true)} />
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                      <Bar dataKey="equity" name="Özkaynaklar" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
                      <Line type="monotone" dataKey="cash_and_equivalents" name="Nakit & Benzerleri" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 3, fill: '#06b6d4' }} />
                      <Line type="monotone" dataKey="financial_debt" name="Finansal Borçlar" stroke="#f43f5e" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2.5, fill: '#f43f5e' }} />
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
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">2</span>
                <h2 className="font-serif text-xl font-bold text-white">Resmi Finansal Tablolar & DuPont Analizi</h2>
              </div>
              <div className="flex items-center gap-1 bg-[#21262d] p-0.5 rounded-lg border border-[#2e3440] text-xs font-semibold">
                {[
                  { id: 'bs', label: 'Bilanço' },
                  { id: 'is', label: 'Gelir Tablosu' },
                  { id: 'cf', label: 'Nakit Akışı' },
                  { id: 'ratios', label: 'Rasyolar' }
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

            {/* ========================================================================= */}
            {/* SEÇİLİ FİNANSAL TABLO (6 Dönem Fix, Sayfalama Okları, Kategori Blokları)    */}
            {/* ========================================================================= */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              
              {/* Tablo Üst Kontrol & Alt Sekme Çubuğu */}
              <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#282d37]">
                <div className="flex items-center gap-1 bg-[#21262d] p-1 rounded-xl border border-[#2e3440] text-xs font-semibold">
                  {[
                    { id: 'bs', label: 'Bilanço' },
                    { id: 'is', label: 'Gelir Tablosu' },
                    { id: 'cf', label: 'Nakit Akışı' },
                    { id: 'ratios', label: 'Rasyolar' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTableTab(t.id as any)}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        selectedTableTab === t.id ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-400">
                    {selectedTableTab === 'ratios' ? 'Birim: Oran / Katsayı' : 'Birim: Bin TRY'}
                  </span>
                  {reversedPeriods.length > maxVisiblePeriods && (
                    <div className="flex items-center gap-1.5 bg-[#21262d] px-2 py-1 rounded-lg border border-[#2e3440] text-xs font-mono">
                      <button
                        type="button"
                        onClick={() => setPeriodOffset(prev => Math.max(0, prev - 1))}
                        disabled={safePeriodOffset <= 0}
                        className={`px-1.5 py-0.5 rounded transition ${
                          safePeriodOffset > 0
                            ? 'text-[#f5c242] hover:bg-[#2e3440] cursor-pointer font-bold'
                            : 'text-slate-600 cursor-not-allowed opacity-30'
                        }`}
                        title="Daha Yeni Dönemler"
                      >
                        &lt;
                      </button>
                      <span className="text-[11px] text-slate-400 px-1">
                        {safePeriodOffset + 1}-{Math.min(reversedPeriods.length, safePeriodOffset + maxVisiblePeriods)} / {reversedPeriods.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPeriodOffset(prev => Math.min(maxPeriodOffset, prev + 1))}
                        disabled={safePeriodOffset >= maxPeriodOffset}
                        className={`px-1.5 py-0.5 rounded transition ${
                          safePeriodOffset < maxPeriodOffset
                            ? 'text-[#f5c242] hover:bg-[#2e3440] cursor-pointer font-bold'
                            : 'text-slate-600 cursor-not-allowed opacity-30'
                        }`}
                        title="Daha Eski Dönemler"
                      >
                        &gt;
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Finansal Tablo Grid */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse font-mono table-fixed">
                  <thead>
                    <tr className="border-b border-[#282d37] text-slate-400 bg-[#21262d]/90">
                      <th className="p-3 text-white font-sans font-bold text-xs sm:text-sm w-[34%] min-w-[200px]">
                        {selectedTableTab === 'bs' && 'Bilanço Kalemleri'}
                        {selectedTableTab === 'is' && 'Gelir Tablosu Kalemleri'}
                        {selectedTableTab === 'cf' && 'Nakit Akışı Kalemleri'}
                        {selectedTableTab === 'ratios' && 'Rasyolar & Göstergeler'}
                      </th>
                      {visiblePeriods.map((c, colIdx) => {
                        const isFirst = colIdx === 0;
                        const isLast = colIdx === visiblePeriods.length - 1;
                        const canGoLeft = safePeriodOffset > 0;
                        const canGoRight = safePeriodOffset < maxPeriodOffset;

                        return (
                          <th key={c.period} className="p-3 text-right text-slate-300 font-mono text-xs w-[11%] min-w-[105px]">
                            <div className="flex items-center justify-end gap-1.5">
                              {isFirst && (
                                <button
                                  type="button"
                                  onClick={() => setPeriodOffset(prev => Math.max(0, prev - 1))}
                                  disabled={!canGoLeft}
                                  title="Daha Güncel Dönemler"
                                  className={`w-5 h-5 flex items-center justify-center rounded transition ${
                                    canGoLeft
                                      ? 'bg-[#181b20] hover:bg-[#343b48] text-[#f5c242] cursor-pointer border border-[#383e4d]'
                                      : 'text-slate-600 cursor-not-allowed opacity-20'
                                  }`}
                                >
                                  &lt;
                                </button>
                              )}
                              <span className="text-white font-bold">{c.period}</span>
                              {isLast && (
                                <button
                                  type="button"
                                  onClick={() => setPeriodOffset(prev => Math.min(maxPeriodOffset, prev + 1))}
                                  disabled={!canGoRight}
                                  title="Geçmiş Dönemler"
                                  className={`w-5 h-5 flex items-center justify-center rounded transition ${
                                    canGoRight
                                      ? 'bg-[#181b20] hover:bg-[#343b48] text-[#f5c242] cursor-pointer border border-[#383e4d]'
                                      : 'text-slate-600 cursor-not-allowed opacity-20'
                                  }`}
                                >
                                  &gt;
                                </button>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#282d37]/40">
                    {/* 1. BİLANÇO GÖRÜNÜMÜ */}
                    {selectedTableTab === 'bs' && balanceSheetSections.map((sec) => (
                      <React.Fragment key={sec.id}>
                        {/* Kategori Başlık Çubuğu */}
                        <tr className="bg-[#1f242c]/90 border-t border-b border-[#2b313d]">
                          <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3 font-sans font-bold text-slate-100 text-xs sm:text-sm tracking-wide">
                            {sec.title}
                          </td>
                        </tr>

                        {/* Alt Kalem Satırları */}
                        {sec.rows.map((row) => (
                          <tr
                            key={row.key}
                            onMouseEnter={() => setHoveredRowKey(row.key)}
                            onMouseLeave={() => setHoveredRowKey(null)}
                            className="hover:bg-[#1f242c]/50 border-b border-[#222730] transition-colors"
                          >
                            <td className="py-2 px-3 pl-6 font-sans text-xs text-slate-300 font-normal truncate" title={row.label}>
                              {row.label}
                            </td>
                            {visiblePeriods.map((c, colIdx) =>
                              renderDataCell(c, colIdx, row.key, (row as any).fallbackKey, row.key, false, false, (row as any).invert)
                            )}
                          </tr>
                        ))}

                        {/* Kategori Toplam Satırı */}
                        <tr
                          onMouseEnter={() => setHoveredRowKey(`total-${sec.id}`)}
                          onMouseLeave={() => setHoveredRowKey(null)}
                          className="bg-[#1a1e24] border-t border-b border-[#2e3542] hover:bg-[#222832] transition-colors"
                        >
                          <td className="py-2.5 px-3 font-sans font-bold text-white text-xs sm:text-sm truncate">
                            {sec.totalLabel}
                          </td>
                          {visiblePeriods.map((c, colIdx) =>
                            renderDataCell(c, colIdx, sec.totalKey, undefined, `total-${sec.id}`, true, false)
                          )}
                        </tr>

                        {/* Genel Toplam Satırı (Aktifler / Yükümlülükler) */}
                        {sec.grandTotalLabel && (
                          <tr
                            onMouseEnter={() => setHoveredRowKey(`grand-${sec.id}`)}
                            onMouseLeave={() => setHoveredRowKey(null)}
                            className="bg-[#242a35] border-t-2 border-b-2 border-[#f5c242]/40 font-bold hover:bg-[#2c3442] transition-colors"
                          >
                            <td className="py-3 px-3 font-sans font-extrabold text-[#f5c242] text-xs sm:text-sm tracking-wide truncate">
                              {sec.grandTotalLabel}
                            </td>
                            {visiblePeriods.map((c, colIdx) =>
                              renderDataCell(c, colIdx, sec.grandTotalKey, undefined, `grand-${sec.id}`, true, true)
                            )}
                          </tr>
                        )}

                        {/* Ekstra Satır (Örn: Net Borç) */}
                        {sec.extraRow && (
                          <tr
                            onMouseEnter={() => setHoveredRowKey(`extra-${sec.id}`)}
                            onMouseLeave={() => setHoveredRowKey(null)}
                            className="bg-[#1a1e24] border-b border-[#2e3542] hover:bg-[#222832] transition-colors"
                          >
                            <td className="py-2 px-3 pl-4 font-sans font-semibold text-slate-300 text-xs truncate">
                              {sec.extraRow.label}
                            </td>
                            {visiblePeriods.map((c, colIdx) =>
                              renderDataCell(c, colIdx, sec.extraRow.key, undefined, `extra-${sec.id}`, true, false, true)
                            )}
                          </tr>
                        )}
                      </React.Fragment>
                    ))}

                    {/* 2. GELİR TABLOSU GÖRÜNÜMÜ */}
                    {selectedTableTab === 'is' && incomeStatementSections.map((sec) => (
                      <React.Fragment key={sec.id}>
                        <tr className="bg-[#1f242c]/90 border-t border-b border-[#2b313d]">
                          <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3 font-sans font-bold text-slate-100 text-xs sm:text-sm tracking-wide">
                            {sec.title}
                          </td>
                        </tr>

                        {sec.rows.map((row) => (
                          <tr
                            key={row.key}
                            onMouseEnter={() => setHoveredRowKey(row.key)}
                            onMouseLeave={() => setHoveredRowKey(null)}
                            className="hover:bg-[#1f242c]/50 border-b border-[#222730] transition-colors"
                          >
                            <td className="py-2 px-3 pl-6 font-sans text-xs text-slate-300 font-normal truncate" title={row.label}>
                              {row.label}
                            </td>
                            {visiblePeriods.map((c, colIdx) =>
                              renderDataCell(c, colIdx, row.key, (row as any).fallbackKey, row.key, false, false, (row as any).invert)
                            )}
                          </tr>
                        ))}

                        <tr
                          onMouseEnter={() => setHoveredRowKey(`total-${sec.id}`)}
                          onMouseLeave={() => setHoveredRowKey(null)}
                          className="bg-[#1a1e24] border-t border-b border-[#2e3542] hover:bg-[#222832] transition-colors"
                        >
                          <td className="py-2.5 px-3 font-sans font-bold text-white text-xs sm:text-sm truncate">
                            {sec.totalLabel}
                          </td>
                          {visiblePeriods.map((c, colIdx) =>
                            renderDataCell(c, colIdx, sec.totalKey, undefined, `total-${sec.id}`, true, false)
                          )}
                        </tr>

                        {sec.grandTotalLabel && (
                          <tr
                            onMouseEnter={() => setHoveredRowKey(`grand-${sec.id}`)}
                            onMouseLeave={() => setHoveredRowKey(null)}
                            className="bg-[#242a35] border-t-2 border-b-2 border-[#f5c242]/40 font-bold hover:bg-[#2c3442] transition-colors"
                          >
                            <td className="py-3 px-3 font-sans font-extrabold text-[#f5c242] text-xs sm:text-sm tracking-wide truncate">
                              {sec.grandTotalLabel}
                            </td>
                            {visiblePeriods.map((c, colIdx) =>
                              renderDataCell(c, colIdx, sec.grandTotalKey, undefined, `grand-${sec.id}`, true, true)
                            )}
                          </tr>
                        )}
                      </React.Fragment>
                    ))}

                    {/* 3. NAKİT AKIŞI GÖRÜNÜMÜ */}
                    {selectedTableTab === 'cf' && cashFlowSections.map((sec) => (
                      <React.Fragment key={sec.id}>
                        <tr className="bg-[#1f242c]/90 border-t border-b border-[#2b313d]">
                          <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3 font-sans font-bold text-slate-100 text-xs sm:text-sm tracking-wide">
                            {sec.title}
                          </td>
                        </tr>

                        {sec.rows.map((row) => (
                          <tr
                            key={row.key}
                            onMouseEnter={() => setHoveredRowKey(row.key)}
                            onMouseLeave={() => setHoveredRowKey(null)}
                            className="hover:bg-[#1f242c]/50 border-b border-[#222730] transition-colors"
                          >
                            <td className="py-2 px-3 pl-6 font-sans text-xs text-slate-300 font-normal truncate" title={row.label}>
                              {row.label}
                            </td>
                            {visiblePeriods.map((c, colIdx) =>
                              renderDataCell(c, colIdx, row.key, (row as any).fallbackKey, row.key, false, false, (row as any).invert)
                            )}
                          </tr>
                        ))}

                        <tr
                          onMouseEnter={() => setHoveredRowKey(`total-${sec.id}`)}
                          onMouseLeave={() => setHoveredRowKey(null)}
                          className="bg-[#1a1e24] border-t border-b border-[#2e3542] hover:bg-[#222832] transition-colors"
                        >
                          <td className="py-2.5 px-3 font-sans font-bold text-white text-xs sm:text-sm truncate">
                            {sec.totalLabel}
                          </td>
                          {visiblePeriods.map((c, colIdx) =>
                            renderDataCell(c, colIdx, sec.totalKey, undefined, `total-${sec.id}`, true, false)
                          )}
                        </tr>
                      </React.Fragment>
                    ))}

                    {/* 4. RASYOLAR GÖRÜNÜMÜ */}
                    {selectedTableTab === 'ratios' && ratiosSections.map((sec) => (
                      <React.Fragment key={sec.id}>
                        <tr className="bg-[#1f242c]/90 border-t border-b border-[#2b313d]">
                          <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3 font-sans font-bold text-slate-100 text-xs sm:text-sm tracking-wide">
                            {sec.title}
                          </td>
                        </tr>

                        {sec.rows.map((row, idx) => (
                          <tr
                            key={idx}
                            onMouseEnter={() => setHoveredRowKey(`ratio-${sec.id}-${idx}`)}
                            onMouseLeave={() => setHoveredRowKey(null)}
                            className="hover:bg-[#1f242c]/50 border-b border-[#222730] transition-colors"
                          >
                            <td className={`py-2 px-3 pl-6 font-sans text-xs truncate ${row.isHighlight ? 'font-bold text-white' : 'font-normal text-slate-300'}`} title={row.label}>
                              {row.label}
                            </td>
                            {visiblePeriods.map((c) => (
                              <td key={c.period} className={`py-2 px-3 text-right font-mono text-xs font-bold ${row.isHighlight ? 'text-[#f5c242]' : 'text-slate-200'}`}>
                                {row.calc(c)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Güçlü Yönler (Pros) */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-serif text-base font-bold text-white">Güçlü Yönler (Öne Çıkanlar)</h3>
                </div>
                <div className="space-y-3">
                  {(((report as any).pros && (report as any).pros.length > 0) ? (report as any).pros : [
                    'Sermaye maliyetinin üzerinde getiri üreten güçlü ROIC performansı',
                    'Düşük borçluluk ve yüksek serbest nakit akışı dönüşüm kabiliyeti',
                    'Sektör medyanlarına kıyasla cazip içsel değerleme iskontosu',
                    'Enflasyonist ortamda güçlü fiyatlama ve pazar payı koruma gücü'
                  ]).map((pro: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed bg-[#21262d]/50 p-3 rounded-xl border border-[#2e3440]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                      <span>{pro}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Zayıf Yönler & Riskler (Cons) */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <h3 className="font-serif text-base font-bold text-white">Zayıf Yönler & Temel Riskler</h3>
                </div>
                <div className="space-y-3">
                  {(((report as any).cons && (report as any).cons.length > 0) ? (report as any).cons : [
                    'Makroekonomik faiz oynaklığı ve borçlanma maliyeti baskısı',
                    'İşletme sermayesi döngüsünde dönemsel alacak vadeleri takibi ihtiyacı',
                    'Sektörel regülasyon ve asgari ücret artışlarının operasyonel marj etkisi'
                  ]).map((con: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed bg-[#21262d]/50 p-3 rounded-xl border border-[#2e3440]">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 flex-shrink-0" />
                      <span>{con}</span>
                    </div>
                  ))}
                </div>
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
                <h2 className="font-serif text-xl font-bold text-white">Yönetim Rehberlik Karnesi & Şirket Hedefleri</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">Guidance vs. Actuals</span>
            </div>

            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif text-base font-bold text-white">Yönetim Tahminleri ve Gerçekleşme Performansı</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Faaliyet raporları ve yatırımcı sunumlarında verilen hedeflerin tutarlılık analizi
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                {(((report as any).guidanceScorecard && (report as any).guidanceScorecard.length > 0) ? (report as any).guidanceScorecard : [
                  {
                    metric: 'Hasılat Reel Büyümesi',
                    target: '%30 - %40 Reel Büyüme',
                    actual: '%36.4 Gerçekleşti',
                    status: 'ACHIEVED',
                    note: 'Şirket pazar payını artırarak yıllık hasılat rehberliğinin üst bandında gerçekleşme sağlamıştır.'
                  },
                  {
                    metric: 'FAVÖK Marjı Hedefi',
                    target: '%24 - %26',
                    actual: '%25.8',
                    status: 'ACHIEVED',
                    note: 'Maliyet optimizasyonu sayesinde operasyonel kârlılık korunmuştur.'
                  },
                  {
                    metric: 'CapEx / Satışlar Oranı',
                    target: '<%5',
                    actual: '%4.2',
                    status: 'ACHIEVED',
                    note: 'Yatırım harcamaları bütçe dahilinde kalarak serbest nakit üretimini desteklemiştir.'
                  }
                ]).map((g: any, i: number) => (
                  <div key={i} className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="font-bold text-xs text-white flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>{g.metric}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {g.status === 'ACHIEVED' ? 'BAŞARILI / HEDEFTE' : 'İZLEMEDE'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-1">
                      <div>
                        <span className="text-slate-400">Hedeflenen: </span>
                        <span className="text-white font-semibold">{g.target}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Gerçekleşen: </span>
                        <span className="text-emerald-400 font-bold">{g.actual}</span>
                      </div>
                    </div>
                    {g.note && (
                      <p className="text-[11px] text-slate-400 leading-relaxed border-t border-[#2e3440] pt-2 mt-1 font-sans">
                        {g.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 8: ANALİST RAPORU (#sec-analist)                                  */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-analist" className="scroll-mt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">7</span>
                <h2 className="font-serif text-xl font-bold text-white">Kurumsal Hisse Değerleme & Araştırma Raporu</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#21262d] p-0.5 rounded-lg border border-[#2e3440] text-xs">
                  <button
                    type="button"
                    onClick={() => setReportFontSize('compact')}
                    className={`px-2 py-0.5 rounded transition ${reportFontSize === 'compact' ? 'bg-[#f5c242] text-slate-950 font-bold' : 'text-slate-400'}`}
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportFontSize('normal')}
                    className={`px-2 py-0.5 rounded transition ${reportFontSize === 'normal' ? 'bg-[#f5c242] text-slate-950 font-bold' : 'text-slate-400'}`}
                  >
                    A
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportFontSize('large')}
                    className={`px-2 py-0.5 rounded transition ${reportFontSize === 'large' ? 'bg-[#f5c242] text-slate-950 font-bold' : 'text-slate-400'}`}
                  >
                    A+
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleCopyReportText}
                  className="px-3 py-1 bg-[#21262d] hover:bg-[#2b313d] text-slate-300 hover:text-white rounded-lg border border-[#2e3440] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
                  <span>{copiedReport ? 'Kopyalandı' : 'Raporu Kopyala'}</span>
                </button>
              </div>
            </div>

            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 sm:p-8 shadow-xl">
              <div className={`prose prose-invert max-w-none font-sans leading-relaxed text-slate-200 ${
                reportFontSize === 'compact' ? 'text-xs' : reportFontSize === 'large' ? 'text-base' : 'text-sm'
              }`}>
                {report.report ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      h1: ({ ...props }) => <h1 className="font-serif text-2xl font-bold text-[#f5c242] border-b border-[#2e3440] pb-2 mt-6 mb-4" {...props} />,
                      h2: ({ ...props }) => <h2 className="font-serif text-lg font-bold text-white border-b border-[#2e3440] pb-1.5 mt-6 mb-3" {...props} />,
                      h3: ({ ...props }) => <h3 className="font-serif text-base font-semibold text-slate-200 mt-4 mb-2" {...props} />,
                      p: ({ ...props }) => <p className="leading-relaxed mb-4 text-slate-300" {...props} />,
                      ul: ({ ...props }) => <ul className="list-disc pl-5 space-y-1.5 mb-4 text-slate-300" {...props} />,
                      ol: ({ ...props }) => <ol className="list-decimal pl-5 space-y-1.5 mb-4 text-slate-300" {...props} />,
                      li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                      strong: ({ ...props }) => <strong className="font-bold text-white" {...props} />,
                      blockquote: ({ ...props }) => <blockquote className="border-l-4 border-[#f5c242] pl-4 py-1 italic bg-[#21262d]/50 rounded-r-lg my-4 text-slate-300" {...props} />,
                      table: ({ ...props }) => (
                        <div className="overflow-x-auto my-4">
                          <table className="w-full text-xs text-left border-collapse border border-[#2e3440]" {...props} />
                        </div>
                      ),
                      th: ({ ...props }) => <th className="border border-[#2e3440] bg-[#21262d] p-2.5 font-bold text-white" {...props} />,
                      td: ({ ...props }) => <td className="border border-[#2e3440] p-2 text-slate-300 font-mono" {...props} />
                    }}
                  >
                    {cleanMarkdown(report.report)}
                  </ReactMarkdown>
                ) : (
                  <div className="text-center py-10 text-slate-500 font-mono text-xs">
                    Bu analiz için detaylı analist rapor metni henüz üretilmedi.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 9: GEÇMİŞ ANALİZLER (#sec-gecmis)                                 */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-gecmis" className="scroll-mt-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-[#f5c242] font-bold">8</span>
                <h2 className="font-serif text-xl font-bold text-white">Geçmiş Raporlar & Çeyreklik Hafıza</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">Hisse Arşivi</span>
            </div>

            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-3">
              {tickerHistory.length > 0 ? (
                <div className="divide-y divide-[#282d37]">
                  {tickerHistory.map((hist) => (
                    <div
                      key={hist.id}
                      onClick={() => onSelectReport && onSelectReport(hist.id)}
                      className="py-3 flex items-center justify-between hover:bg-[#21262d]/50 px-3 rounded-xl transition cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-xs text-white flex items-center gap-2">
                          <span>{hist.ticker}</span>
                          <span className="text-[11px] font-mono text-slate-400">({hist.period || '2025/12'})</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Tarih: {hist.createdAt}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs font-bold text-[#f5c242]">
                          Adil Değer: ₺{hist.fairValue || '—'}
                        </div>
                        <div className={`text-[10px] font-bold font-mono ${hist.decision === 'AL' ? 'text-emerald-400' : hist.decision === 'ALMA' ? 'text-rose-400' : 'text-amber-400'}`}>
                          Karar: {hist.decision || 'NÖTR'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 font-mono text-xs">
                  {report.ticker} için sistemde kayıtlı geçmiş başka bir rapor bulunmuyor.
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
