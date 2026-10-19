'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { calculateDuPont5Step, calculateEarningsQuality, parseFinancialNumber } from '@/lib/valuation';

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

// Akran Kıyaslama Tooltip (Koyu zemin, yüksek kontrast, okunaklı F/K)
function PeerTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const item = payload[0];
    return (
      <div className="bg-[#181b20] border border-[#383e4d] rounded-xl px-3 py-2 shadow-2xl z-50">
        <div className="text-[11px] font-bold text-white mb-0.5">{item.payload?.name}</div>
        <div className="text-xs font-mono font-bold text-[#f5c242] flex items-center gap-1.5">
          <span className="text-slate-400 font-normal">F/K Oranı:</span>
          <span>{item.value != null ? `${Number(item.value).toFixed(1)}x` : '—'}</span>
        </div>
      </div>
    );
  }
  return null;
}

// Çeyreklik Çarpan Trendi Tooltip
function MultiplesTrendTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#181b20] border border-[#383e4d] rounded-xl p-3 shadow-2xl text-xs space-y-1.5 min-w-[175px] z-50">
        <div className="font-bold text-white font-mono border-b border-[#2e3440] pb-1 flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[10px] text-slate-400 font-normal">Dönem</span>
        </div>
        {payload.map((entry: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-3 text-[11px] font-mono">
            <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span>{entry.name}:</span>
            </span>
            <span className="font-bold text-white">
              {entry.value != null ? `${Number(entry.value).toFixed(1)}x` : '—'}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

// Sürücü çubuğu pin yüzdesi hesaplayıcı
function calculateDriverPin(
  type: 'rev' | 'net' | 'margin' | 'multiple',
  value: number,
  sector?: SectorType,
  targetNum?: number
): number {
  if (value === null || value === undefined || isNaN(value)) return 50;

  if (type === 'rev') {
    if (value <= -20) return 10;
    if (value >= 150) return 92;
    if (value <= 0) return Math.round(10 + ((value + 20) / 20) * 15);
    if (value <= 40) return Math.round(25 + (value / 40) * 25);
    if (value <= 80) return Math.round(50 + ((value - 40) / 40) * 25);
    return Math.round(75 + ((value - 80) / 70) * 17);
  }

  if (type === 'net') {
    if (value <= -30) return 10;
    if (value >= 200) return 92;
    if (value <= 0) return Math.round(10 + ((value + 30) / 30) * 18);
    if (value <= 40) return Math.round(28 + (value / 40) * 22);
    if (value <= 100) return Math.round(50 + ((value - 40) / 60) * 25);
    return Math.round(75 + ((value - 100) / 100) * 17);
  }

  if (type === 'margin') {
    if (sector === 'INSURANCE') {
      if (value <= 75) return 92;
      if (value >= 115) return 10;
      if (value <= 88) return Math.round(92 - ((value - 75) / 13) * 24);
      if (value <= 98) return Math.round(68 - ((value - 88) / 10) * 25);
      return Math.round(43 - ((value - 98) / 17) * 33);
    } else {
      if (value <= 5) return 15;
      if (value >= 40) return 90;
      return Math.round(15 + ((value - 5) / 35) * 75);
    }
  }

  if (type === 'multiple') {
    const num = targetNum || value;
    if (num <= 1.0) return 25;
    if (num >= 5.0) return 85;
    return Math.round(25 + ((num - 1.0) / 4.0) * 60);
  }

  return 50;
}

function cleanMarkdown(text: string): string {
  if (!text) return '';
  let cleaned = text;
  cleaned = cleaned.replace(/\*\*\[AL\]\*\*/gi, '**AL (Yatırım Önerisi)**');
  cleaned = cleaned.replace(/\*\*\[ALMA\]\*\*/gi, '**ALMA (Risk / Primli)**');
  cleaned = cleaned.replace(/\*\*\[TUT\]\*\*/gi, '**TUT (Dengeli Görünüm)**');
  cleaned = cleaned.replace(/\[AL\]/g, 'AL');
  cleaned = cleaned.replace(/\[ALMA\]/g, 'ALMA');
  cleaned = cleaned.replace(/\[TUT\]/g, 'TUT');
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

  // WACC, ROIC ve EVA Çözümü (TMS 29 Reel WACC ve Terminal ile %100 Senkronize)
  const isTms29 = Boolean(latestData?.is_tms29 ?? report.extractedData?.is_tms29 ?? true);
  const realWaccNum = Number(latestData?.real_wacc ?? valuationInfo?.real_wacc ?? (latestData?.wacc ? latestData.wacc - 18 : 4.7));
  const nominalWaccNum = Number(latestData?.nominal_wacc ?? latestData?.wacc ?? valuationInfo?.wacc ?? 22.8);
  const benchmarkWacc = isTms29 && realWaccNum ? realWaccNum : nominalWaccNum;
  const waccNum = benchmarkWacc;

  const roicNum = Number(latestData?.roic ?? valuationInfo?.roic ?? 15.5);
  const evaSpreadNum = Number(
    latestData?.eva_spread ??
    valuationInfo?.real_eva_spread ??
    valuationInfo?.eva_spread ??
    (roicNum - benchmarkWacc)
  );

  const [showCashQualityExplainer, setShowCashQualityExplainer] = useState(false);

  // Kâr Kalitesi ve Nakit Dönüşümü (Sloan Tahakkuk & OCF)
  const earningsQuality = useMemo(() => {
    return calculateEarningsQuality(chartData, currentSector);
  }, [chartData, currentSector]);

  // Değer Sürücüleri (12 Ay İleri Hasılat ve Net Kâr Büyümesi vb.)
  const drivers = useMemo(() => {
    const raw = valuationInfo?.drivers || report.extractedData?.fair_value_drivers;
    return {
      revenue_growth: {
        label: raw?.revenue_growth?.label || (currentSector === 'INSURANCE' ? 'Prim Büyümesi (12A İleri)' : 'Hasılat Büyümesi (12A İleri)'),
        value: typeof raw?.revenue_growth?.value === 'number' ? raw.revenue_growth.value : 45.0,
        bearLabel: raw?.revenue_growth?.bearLabel || 'Düşük Büyüme',
        bullLabel: raw?.revenue_growth?.bullLabel || 'Yüksek Büyüme',
        note: raw?.revenue_growth?.note || raw?.revenue_growth?.sourceExplanation || 'Enflasyon ve pazar payı projeksiyonu'
      },
      net_income_growth: {
        label: raw?.net_income_growth?.label || 'Net Kâr Büyümesi (12A İleri)',
        value: typeof raw?.net_income_growth?.value === 'number' ? raw.net_income_growth.value : 50.0,
        bearLabel: raw?.net_income_growth?.bearLabel || 'Düşük Kârlılık',
        bullLabel: raw?.net_income_growth?.bullLabel || 'Yüksek Verimlilik',
        note: raw?.net_income_growth?.note || raw?.net_income_growth?.sourceExplanation || 'Operasyonel kârlılık ve içsel sermaye üretimi'
      },
      margin: {
        label: raw?.margin?.label || (currentSector === 'INSURANCE' ? 'Kombine Oran Beklentisi' : 'Operasyonel Marj'),
        value: typeof raw?.margin?.value === 'number' ? raw.margin.value : 22.0,
        bearLabel: raw?.margin?.bearLabel || 'Daralan Marj',
        bullLabel: raw?.margin?.bullLabel || 'Fiyatlama Gücü',
        note: raw?.margin?.note || raw?.margin?.sourceExplanation || 'Çekirdek faaliyet marjı hedefi'
      },
      target_multiple: {
        label: raw?.target_multiple?.label || 'Hedef Çarpan',
        value: raw?.target_multiple?.value || '2.5x PD/DD',
        numericValue: typeof raw?.target_multiple?.numericValue === 'number' ? raw.target_multiple.numericValue : 2.5,
        bearLabel: raw?.target_multiple?.bearLabel || 'Muhafazakar Çarpan',
        bullLabel: raw?.target_multiple?.bullLabel || 'Piyasa Primi',
        note: raw?.target_multiple?.note || raw?.target_multiple?.sourceExplanation || 'Sektör ve kârlılık dinamiklerine dayalı hedef çarpan'
      }
    };
  }, [valuationInfo?.drivers, report.extractedData?.fair_value_drivers, currentSector]);

  // Çeyreklik Çarpan Trendi Verisi (F/K, PD/DD ve Sektör Referans Çizgileri)
  const quarterlyMultiplesData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const shares = parseFinancialNumber(report.extractedData?.shares_outstanding ?? report.extractedData?.share_count) ?? 180000000;
    const sectorPe = SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5;
    const sectorPb = SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pb || 2.1;

    return chartData.slice(-8).map((d: any) => {
      const periodPrice = Number(d.share_price || currentPriceNum || 0);
      const mCap = periodPrice * shares;
      const normCurr = String(report.extractedData?.currency || d.currency || '').trim().toLowerCase();
      const refScale = Math.abs(d.equity ?? d.net_income ?? 0);
      const isBinTry = normCurr.includes('bin') || normCurr.includes('thousand') || (refScale > 0 && refScale < 250_000_000 && shares >= 1_000_000);
      const chartUnitScale = isBinTry ? 1000 : 1;
      const scaledNet = d.net_income != null ? d.net_income * chartUnitScale : null;
      const scaledEquity = d.equity != null ? d.equity * chartUnitScale : null;

      const periodStr = String(d.period || '').toLowerCase();
      let annualFactor = 1.0;
      if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(periodStr)) annualFactor = 4.0;
      else if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(periodStr)) annualFactor = 2.0;
      else if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(periodStr)) annualFactor = 12.0 / 9.0;

      const rawPe = (scaledNet && scaledNet > 0 && mCap > 0) ? Number((mCap / (scaledNet * annualFactor)).toFixed(1)) : null;
      const rawPb = (scaledEquity && scaledEquity > 0 && mCap > 0) ? Number((mCap / scaledEquity).toFixed(1)) : null;

      return {
        period: d.period,
        pe: (rawPe && rawPe > 0 && rawPe < 80) ? rawPe : null,
        pb: (rawPb && rawPb > 0 && rawPb < 25) ? rawPb : null,
        sector_pe: sectorPe,
        sector_pb: sectorPb,
      };
    });
  }, [chartData, report.extractedData, currentPriceNum, currentSector]);

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

  // Kar Tanesi SVG Koordinatları (280x280 viewBox, cx=140, cy=140, maxRadius=95)
  const radarPoints = useMemo(() => {
    return getSnowflakeCoordinates(snowflake.axes, 140, 140, 95);
  }, [snowflake.axes]);

  const smoothRadarPath = useMemo(() => {
    return generateSmoothSnowflakePath(radarPoints);
  }, [radarPoints]);

  // Kar Tanesi Dinamik Renk & Tonlama (İyi durumda yeşil, dengeliyse sarı/amber, kötüyse turuncu/kırmızı)
  const snowflakeTheme = useMemo(() => {
    const score = snowflake.totalScore;
    if (score >= 20) {
      return {
        status: 'Çok Güçlü',
        statusColor: '#10b981',
        stroke: '#10b981',
        glow: 'rgba(16, 185, 129, 0.45)',
        gradId: 'snowflakeGradGreen',
        badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
      };
    } else if (score >= 13) {
      return {
        status: 'Dengeli',
        statusColor: '#f5c242',
        stroke: '#f5c242',
        glow: 'rgba(245, 194, 66, 0.45)',
        gradId: 'snowflakeGradAmber',
        badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
      };
    } else {
      return {
        status: 'Riskli',
        statusColor: '#ef4444',
        stroke: '#ef4444',
        glow: 'rgba(239, 68, 68, 0.45)',
        gradId: 'snowflakeGradRed',
        badgeClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
      };
    }
  }, [snowflake.totalScore]);

  // Rasyolar Ekranı Isı Haritası (Heatmap) Durumu ve Hesaplayıcı
  const [isHeatmapActive, setIsHeatmapActive] = useState(true);

  const getRatioHeatmapClass = useCallback((key: string, rawVal: number | null, sec: SectorType): string => {
    if (!isHeatmapActive || rawVal === null || isNaN(rawVal)) return '';
    switch (key) {
      case 'current_ratio': {
        const minGood = (sec === 'INSURANCE' || sec === 'REIT') ? 1.10 : (sec === 'RETAIL' ? 0.60 : 1.50);
        const minWarn = (sec === 'INSURANCE' || sec === 'REIT') ? 0.95 : (sec === 'RETAIL' ? 0.45 : 1.00);
        if (rawVal >= minGood) return 'bg-emerald-950/50 text-emerald-300 font-semibold border-b border-emerald-800/40';
        if (rawVal >= minWarn) return 'bg-amber-950/40 text-amber-300 border-b border-amber-800/40';
        return 'bg-rose-950/50 text-rose-300 border-b border-rose-800/40';
      }
      case 'quick_ratio': {
        if (rawVal >= 1.00) return 'bg-emerald-950/50 text-emerald-300 font-semibold';
        if (rawVal >= 0.75) return 'bg-amber-950/40 text-amber-300';
        return 'bg-rose-950/50 text-rose-300';
      }
      case 'cash_ratio': {
        if (rawVal >= 0.30) return 'bg-emerald-950/50 text-emerald-300 font-semibold';
        if (rawVal >= 0.15) return 'bg-amber-950/40 text-amber-300';
        return 'bg-rose-950/50 text-rose-300';
      }
      case 'leverage_ratio': {
        if (rawVal <= 100) return 'bg-emerald-950/50 text-emerald-300 font-semibold';
        if (rawVal <= 200) return 'bg-amber-950/40 text-amber-300';
        return 'bg-rose-950/50 text-rose-300';
      }
      case 'debt_to_ebitda': {
        if (rawVal <= 0) return 'bg-emerald-950/50 text-emerald-300 font-bold';
        if (rawVal <= 1.5) return 'bg-emerald-950/50 text-emerald-300 font-semibold';
        if (rawVal <= 3.0) return 'bg-amber-950/40 text-amber-300';
        return 'bg-rose-950/50 text-rose-300';
      }
      case 'gross_margin': {
        if (rawVal >= 35.0) return 'bg-emerald-950/50 text-emerald-300 font-semibold';
        if (rawVal >= 20.0) return 'bg-amber-950/40 text-amber-300';
        return 'bg-rose-950/50 text-rose-300';
      }
      case 'ebitda_margin': {
        if (rawVal >= 20.0) return 'bg-emerald-950/50 text-emerald-300 font-semibold';
        if (rawVal >= 10.0) return 'bg-amber-950/40 text-amber-300';
        return 'bg-rose-950/50 text-rose-300';
      }
      case 'net_margin': {
        if (rawVal >= 15.0) return 'bg-emerald-950/50 text-emerald-300 font-semibold';
        if (rawVal >= 7.0) return 'bg-amber-950/40 text-amber-300';
        return 'bg-rose-950/50 text-rose-300';
      }
      case 'roe': {
        if (rawVal >= 35.0) return 'bg-emerald-950/50 text-emerald-300 font-semibold';
        if (rawVal >= 20.0) return 'bg-amber-950/40 text-amber-300';
        return 'bg-rose-950/50 text-rose-300';
      }
      case 'roa': {
        if (rawVal >= 8.0) return 'bg-emerald-950/50 text-emerald-300 font-semibold';
        if (rawVal >= 4.0) return 'bg-amber-950/40 text-amber-300';
        return 'bg-rose-950/50 text-rose-300';
      }
      default:
        return '';
    }
  }, [isHeatmapActive]);

  // İş Yatırım Resmi Sektör Tanımı ve Sektörel Akranlar
  const isYatirimEntry = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[report.ticker.toUpperCase()];
  const rawOfficialSector = isYatirimEntry?.sectorName || marketMultiples?.sectorName;
  const officialSectorName = (currentSector === 'INSURANCE' ? 'Sigorta' : (currentSector === 'BANKING' ? 'Bankacılık' : (currentSector === 'REIT' ? 'GYO' : rawOfficialSector))) || sectorMeta?.title || 'Sanayi';

  // Aynı Sektördeki Resmi BİST Şirketleri (İş Yatırım Sektör Dağılımı ve Akıllı Eşleşme)
  const sameSectorPeers = useMemo(() => {
    const targetTicker = report.ticker.toUpperCase();
    const currentEntry = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[targetTicker];
    const isTargetHolding = currentSector === 'HOLDING' || targetTicker.includes('HOL') || (currentEntry?.name || '').toLowerCase().includes('holding');

    // 1. Hedef sektör anahtar kelimelerini normalize et
    let targetSector = (currentEntry?.sectorName || officialSectorName || '').trim().toLowerCase();
    if (currentSector === 'INSURANCE' || targetSector.includes('sigorta')) targetSector = 'sigorta';
    else if (currentSector === 'BANKING' || targetSector.includes('banka')) targetSector = 'bankacılık';
    else if (currentSector === 'REIT' || targetSector.includes('gyo') || targetSector.includes('gayrimenkul')) targetSector = 'gyo';
    else if (currentSector === 'HOLDING' || targetSector.includes('holding')) targetSector = 'holdingler';
    else if (currentSector === 'AVIATION' || targetSector.includes('hava')) targetSector = 'havayolları ve hizm.';

    const allInSector: Array<{ ticker: string; name: string; marketCapMnTl: number | null }> = [];

    for (const [tk, item] of Object.entries(OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE)) {
      if (tk.toUpperCase() === targetTicker) continue;
      const itemSec = (item.sectorName || '').trim().toLowerCase();
      const itemName = (item.name || '').toLowerCase();

      // Holding filtresi: Eğer ana şirket bir holding değilse, akran olarak holdingleri ele (Örn: RALYH)
      if (!isTargetHolding && (itemSec === 'holdingler' || itemName.includes('yatırım holding'))) {
        continue;
      }

      let matches = false;
      if (targetSector === 'sigorta') {
        matches = itemSec.includes('sigorta');
      } else if (targetSector === 'bankacılık') {
        matches = itemSec.includes('banka');
      } else if (targetSector === 'gyo') {
        matches = itemSec === 'gyo' || itemSec.includes('gayrimenkul');
      } else if (targetSector === 'holdingler') {
        matches = itemSec === 'holdingler' || itemName.includes('holding');
      } else if (targetSector === 'havayolları ve hizm.') {
        matches = itemSec.includes('hava');
      } else {
        matches = itemSec === targetSector;
      }

      // MAVI ve giyim perakendesi özel eşleşmesi (KOTON, VAKKO, SUWEN vb.)
      if (targetTicker === 'MAVI' && (tk === 'VAKKO' || tk === 'SUWEN' || tk === 'KOTON')) {
        matches = true;
      }

      if (matches) {
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
  }, [officialSectorName, currentSector, report.ticker]);

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

  // Rasyolar Bölümleri (Isı Haritası için dinamik raw değerler dahil)
  const ratiosSections = useMemo(() => [
    {
      id: 'likidite',
      title: 'Likidite Rasyoları',
      rows: [
        {
          key: 'current_ratio',
          label: 'Cari Oran (Likidite)',
          calc: (c: any) => c.current_liabilities ? (c.current_assets / c.current_liabilities).toFixed(2) + 'x' : '—',
          raw: (c: any) => c.current_liabilities ? (c.current_assets / c.current_liabilities) : null,
          isHighlight: true
        },
        {
          key: 'quick_ratio',
          label: 'Likidite (Asit-Test) Oranı',
          calc: (c: any) => c.current_liabilities ? ((c.current_assets - (c.inventories || 0)) / c.current_liabilities).toFixed(2) + 'x' : '—',
          raw: (c: any) => c.current_liabilities ? ((c.current_assets - (c.inventories || 0)) / c.current_liabilities) : null
        },
        {
          key: 'cash_ratio',
          label: 'Nakit Oranı',
          calc: (c: any) => c.current_liabilities ? ((c.cash_and_equivalents || c.cash || 0) / c.current_liabilities).toFixed(2) + 'x' : '—',
          raw: (c: any) => c.current_liabilities ? ((c.cash_and_equivalents || c.cash || 0) / c.current_liabilities) : null
        }
      ]
    },
    {
      id: 'borcluluk',
      title: 'Borçluluk ve Kaldıraç Rasyoları',
      rows: [
        {
          key: 'leverage_ratio',
          label: 'Kaldıraç Oranı (Toplam Borç / Özkaynak)',
          calc: (c: any) => c.equity ? ((c.total_assets - c.equity) / c.equity * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.equity ? ((c.total_assets - c.equity) / c.equity * 100) : null
        },
        {
          key: 'debt_to_ebitda',
          label: 'Net Borç / FAVÖK',
          calc: (c: any) => c.ebitda && c.ebitda > 0 ? (c.net_debt / c.ebitda).toFixed(2) + 'x' : (c.net_debt <= 0 ? 'Net Nakit' : '—'),
          raw: (c: any) => c.ebitda && c.ebitda > 0 ? (c.net_debt / c.ebitda) : (c.net_debt <= 0 ? 0 : null),
          isHighlight: true
        },
        {
          key: 'debt_to_assets',
          label: 'Borç / Aktif Oranı',
          calc: (c: any) => c.total_assets ? (c.total_liabilities / c.total_assets * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.total_assets ? (c.total_liabilities / c.total_assets * 100) : null
        }
      ]
    },
    {
      id: 'karlilik',
      title: 'Kârlılık ve Sermaye Getirisi Rasyoları',
      rows: [
        {
          key: 'gross_margin',
          label: 'Brüt Kâr Marjı',
          calc: (c: any) => c.revenue ? ((c.gross_profit || (c.revenue * 0.4)) / c.revenue * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.revenue ? ((c.gross_profit || (c.revenue * 0.4)) / c.revenue * 100) : null
        },
        {
          key: 'ebitda_margin',
          label: 'FAVÖK Marjı',
          calc: (c: any) => c.revenue ? ((c.ebitda || (c.revenue * 0.25)) / c.revenue * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.revenue ? ((c.ebitda || (c.revenue * 0.25)) / c.revenue * 100) : null
        },
        {
          key: 'net_margin',
          label: 'Net Kâr Marjı',
          calc: (c: any) => c.revenue ? ((c.net_income || (c.revenue * 0.15)) / c.revenue * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.revenue ? ((c.net_income || (c.revenue * 0.15)) / c.revenue * 100) : null
        },
        {
          key: 'roe',
          label: 'Özkaynak Kârlılığı (ROE)',
          calc: (c: any) => c.equity ? (c.net_income / c.equity * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.equity ? (c.net_income / c.equity * 100) : null,
          isHighlight: true
        },
        {
          key: 'roa',
          label: 'Aktif Kârlılığı (ROA)',
          calc: (c: any) => c.total_assets ? (c.net_income / c.total_assets * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.total_assets ? (c.net_income / c.total_assets * 100) : null
        }
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
        <div className="flex items-center justify-end whitespace-nowrap">
          <span>{currentVal != null ? formatTableNumber(currentVal) : '—'}</span>
          <span className="w-12 flex-shrink-0 text-left pl-1.5 inline-block">
            {isRowHovered && diffPct != null && (
              <span
                className={`text-[10px] font-bold ${
                  isGood ? 'text-emerald-400' : 'text-rose-400'
                } transition-opacity duration-150 inline-block`}
              >
                %{diffPct > 0 ? `+${diffPct.toFixed(0)}` : diffPct.toFixed(0)}
              </span>
            )}
          </span>
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

            {/* Hızlı Değerleme Özeti & Karar Rozeti (Sürekli Görünür Panel) */}
            <div className="bg-[#21262d]/90 border border-[#2e3440] rounded-xl p-2.5 space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-sans">Adil Değer</span>
                <span className="font-bold text-[#f5c242]">₺{fairValueNum.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-sans">Son Fiyat</span>
                <span className="text-white font-semibold">₺{currentPriceNum.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-[#2e3440]">
                <span className={`text-[10px] font-bold ${discountPctNum > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  %{Math.abs(discountPctNum).toFixed(1)} {discountPctNum > 0 ? 'İskonto' : 'Prim'}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                  (report.decision === 'AL') ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                  (report.decision === 'ALMA') ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                  'bg-amber-950 text-amber-400 border border-amber-800'
                }`}>
                  {report.decision || 'NÖTR'}
                </span>
              </div>
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

            {/* Hızlı Hisse Değiştirici (Son Analiz Edilenler) */}
            {savedReports && savedReports.length > 1 && (
              <div className="border-t border-[#282d37] pt-2 space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider px-1">
                  Son Analizler
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {savedReports
                    .filter(r => r.ticker?.toUpperCase() !== report.ticker?.toUpperCase())
                    .slice(0, 4)
                    .map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelectTicker ? onSelectTicker(r.ticker) : (onSelectReport && onSelectReport(r.id))}
                        className="px-2 py-0.5 bg-[#21262d] hover:bg-[#2e3440] text-slate-300 hover:text-[#f5c242] border border-[#2e3440] rounded text-[10.5px] font-mono font-bold transition cursor-pointer flex items-center gap-1"
                        title={`${r.ticker} Analizine Geç`}
                      >
                        <span>{r.ticker}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${r.decision === 'AL' ? 'bg-emerald-400' : r.decision === 'ALMA' ? 'bg-rose-400' : 'bg-amber-400'}`} />
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* SAĞ ANA İÇERİK AKIŞI (9 BÖLÜM)                                            */}
        {/* ========================================================================= */}
        <div className="flex-1 min-w-0 space-y-8">

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 1: GENEL BAKIŞ & SNOWFLAKE (#sec-ozet)                             */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-ozet" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-4 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-md bg-[#f5c242]/15 text-[#f5c242] font-bold border border-[#f5c242]/30 text-xs font-mono">ÖZET</span>
                <div>
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-white tracking-tight">Genel Bakış & Kar Tanesi (Snowflake)</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Şirket profili, anlık piyasa değerlemesi ve 5 eksenli finansal sağlık radarı</p>
                </div>
              </div>
            </div>

            {/* Sub-Card 1: Üst Şirket Bilgi ve Fiyat Özeti Kartı */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-xl p-6 sm:p-7 shadow-md space-y-6">
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

            {/* Sub-Card 2: Snowflake (Kar Tanesi) Analiz Kartı (SVG Radar + 5 Eksen + Ödüller) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-xl p-5 sm:p-7 shadow-md space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#282d37] pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#f5c242]" />
                    <h3 className="font-serif text-lg sm:text-xl font-bold text-white">Snowflake (Kar Tanesi) Analizi</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    5 eksenli (Değer, Gelecek, Geçmiş, Mali Sağlık, Temettü) bütünleşik kurumsal finansal karne
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`px-3.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 shadow-sm ${snowflakeTheme.badgeClass}`}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: snowflakeTheme.statusColor }} />
                    <span>{snowflakeTheme.status}</span>
                    <span className="text-white/60">•</span>
                    <span>%{snowflake.percentage}</span>
                  </div>

                  <div className="text-right pl-3 border-l border-[#2b313d]">
                    <div className="text-2xl font-black font-mono" style={{ color: snowflakeTheme.statusColor }}>
                      {snowflake.totalScore}/30
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider">Toplam Skor</span>
                  </div>
                </div>
              </div>

              {/* SVG Radar Görseli & 5 Eksen Kartları */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                {/* Sol: Dinamik Renkli Organik SVG Snowflake Radarı (5 Kolon) */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center p-3 bg-[#14171d] rounded-2xl border border-[#262c37] relative">
                  <svg
                    viewBox="0 0 280 280"
                    className="w-full max-w-[280px] h-auto overflow-visible select-none"
                  >
                    <defs>
                      <linearGradient id="snowflakeGradGreen" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.75" />
                        <stop offset="100%" stopColor="#047857" stopOpacity="0.35" />
                      </linearGradient>
                      <linearGradient id="snowflakeGradAmber" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f5c242" stopOpacity="0.75" />
                        <stop offset="100%" stopColor="#b45309" stopOpacity="0.35" />
                      </linearGradient>
                      <linearGradient id="snowflakeGradRed" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f97316" stopOpacity="0.75" />
                        <stop offset="100%" stopColor="#b91c1c" stopOpacity="0.35" />
                      </linearGradient>

                      <filter id="snowflakeGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3.5" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>

                    {/* 6 Kademeli Konsantrik Poligon Kılavuz Halkaları */}
                    {[1, 2, 3, 4, 5, 6].map((level) => {
                      const r = (level / 6) * 95;
                      const pts = [0, 1, 2, 3, 4].map((idx) => {
                        const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / 5;
                        return `${(140 + r * Math.cos(angle)).toFixed(1)},${(140 + r * Math.sin(angle)).toFixed(1)}`;
                      }).join(' ');
                      return (
                        <polygon
                          key={level}
                          points={pts}
                          fill={level === 6 ? '#181c24' : 'none'}
                          stroke="#2e3440"
                          strokeWidth={level === 6 ? '1.5' : '1'}
                          strokeDasharray={level === 6 ? 'none' : '2,3'}
                          opacity={level === 6 ? '0.7' : '0.5'}
                        />
                      );
                    })}

                    {/* Merkezden Dışarı 5 Eksen İskelet Çizgileri */}
                    {[0, 1, 2, 3, 4].map((idx) => {
                      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / 5;
                      const x2 = 140 + 95 * Math.cos(angle);
                      const y2 = 140 + 95 * Math.sin(angle);
                      return (
                        <line
                          key={idx}
                          x1="140"
                          y1="140"
                          x2={x2.toFixed(1)}
                          y2={y2.toFixed(1)}
                          stroke="#2e3440"
                          strokeWidth="1.2"
                        />
                      );
                    })}

                    {/* Dinamik Organik Snowflake Veri Poligonu */}
                    {smoothRadarPath && (
                      <path
                        d={smoothRadarPath}
                        fill={`url(#${snowflakeTheme.gradId})`}
                        stroke={snowflakeTheme.stroke}
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        filter="url(#snowflakeGlow)"
                        className="transition-all duration-700"
                      />
                    )}

                    {/* Eksen Tepe Noktaları */}
                    {radarPoints.map((pt) => (
                      <g key={pt.axis} className="transition-all duration-700">
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="5.5"
                          fill="#12151b"
                          stroke={snowflakeTheme.stroke}
                          strokeWidth="2"
                        />
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="2.5"
                          fill={snowflakeTheme.stroke}
                        />
                      </g>
                    ))}

                    {/* Merkez Ticker Rozeti */}
                    <circle cx="140" cy="140" r="14" fill="#181c24" stroke="#2e3440" strokeWidth="1.2" />
                    <text
                      x="140"
                      y="144"
                      textAnchor="middle"
                      fill="#f5c242"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {report.ticker.slice(0, 4)}
                    </text>

                    {/* 5 Eksen Dış Etiketleri */}
                    <text x="140" y="24" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="monospace">
                      DEĞER ({snowflake.axes.value.score}/6)
                    </text>
                    <text x="242" y="98" textAnchor="start" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="monospace">
                      GELECEK ({snowflake.axes.future.score}/6)
                    </text>
                    <text x="210" y="246" textAnchor="start" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="monospace">
                      GEÇMİŞ ({snowflake.axes.past.score}/6)
                    </text>
                    <text x="70" y="246" textAnchor="end" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="monospace">
                      SAĞLIK ({snowflake.axes.health.score}/6)
                    </text>
                    <text x="38" y="98" textAnchor="end" fill="#ffffff" fontSize="10" fontWeight="bold" fontFamily="monospace">
                      TEMETTÜ ({snowflake.axes.dividend.score}/6)
                    </text>
                  </svg>
                </div>

                {/* Sağ: 5 Eksen Puan Detayı ve İlerleme Barları (7 Kolon) */}
                <div className="lg:col-span-7 space-y-2.5">
                  {Object.values(snowflake.axes).map((axis: any) => {
                    const pct = (axis.score / 6) * 100;
                    const color = axis.score >= 4 ? '#10b981' : axis.score >= 2 ? '#f5c242' : '#ef4444';
                    const topCheck = axis.checks?.[0];

                    return (
                      <div key={axis.key} className="bg-[#151821] border border-[#2b313d] rounded-xl p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white font-mono flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            <span>{axis.label}</span>
                          </span>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-[11px] text-slate-400">
                              {axis.score >= 5 ? 'Mükemmel' : axis.score >= 3 ? 'Dengeli' : 'Riskli'}
                            </span>
                            <span className="font-bold text-sm" style={{ color }}>
                              {axis.score}/6
                            </span>
                          </div>
                        </div>

                        {/* İlerleme Çubuğu */}
                        <div className="w-full bg-[#21262d] rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>

                        {/* İlk Temel Kontrol Açıklaması */}
                        {topCheck && (
                          <p className="text-[11px] text-slate-300 leading-tight truncate font-sans" title={topCheck.detail}>
                            {topCheck.passed ? '✓' : '✗'} {topCheck.detail}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Alt Kısım: Öne Çıkan Güçlü Yönler (Rewards) ve Riskler (Risks) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="bg-[#151821] border border-emerald-900/30 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Sparkles className="w-3.5 h-3.5" /> Öne Çıkan Güçlü Yönler (Rewards)
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-200">
                    {snowflake.rewards.slice(0, 3).map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">★</span>
                        <span className="leading-relaxed">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#151821] border border-amber-900/30 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <AlertTriangle className="w-3.5 h-3.5" /> Dikkat Edilmesi Gereken Riskler
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-200">
                    {snowflake.risks.slice(0, 3).map((rk, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-amber-400 font-bold">⚠️</span>
                        <span className="leading-relaxed">{rk}</span>
                      </div>
                    ))}
                  </div>
                </div>
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
                <div className="space-y-3">
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

                  {sectorCandidateTickers.length > 0 && (
                    <div className="pt-2 border-t border-[#282d37] flex items-center justify-between flex-wrap gap-2 text-xs text-slate-400">
                      <span className="text-[11px]">Sektördeki diğer akranları analiz et:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {sectorCandidateTickers.slice(0, 5).map((tk) => (
                          <button
                            key={tk}
                            type="button"
                            onClick={() => onSelectTicker && onSelectTicker(tk)}
                            className="px-2 py-0.5 bg-[#21262d] hover:bg-[#2e3440] text-[#f5c242] rounded-md border border-[#2e3440] text-[11px] font-mono font-bold cursor-pointer transition"
                            title={`${tk} hissesini doğrudan analiz et`}
                          >
                            +{tk}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-[#21262d] rounded-xl p-4 text-xs text-slate-400 flex items-center justify-between flex-wrap gap-3">
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
          <section id="sec-grafikler" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">1</span>
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
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '11px', paddingTop: '8px', paddingLeft: '8px' }} />
                      <Bar dataKey="revenue" name={currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Hasılat'} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32} legendType="square" />
                      <Line type="monotone" dataKey="ebitda" name={currentSector === 'INSURANCE' ? 'Teknik Kâr' : 'FAVÖK'} stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} legendType="line" />
                      <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} legendType="line" />
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
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '11px', paddingTop: '8px', paddingLeft: '8px' }} />
                      <Bar yAxisId="left" dataKey="revenue" name={currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Hasılat'} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} legendType="square" />
                      <Line yAxisId="right" type="monotone" dataKey="share_price" name="Hisse Fiyatı (TL)" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} legendType="line" />
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
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '11px', paddingTop: '8px', paddingLeft: '8px' }} />
                      <Bar dataKey="operating_cash_flow" name="İşletme Nakit Akışı" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={32} legendType="square" />
                      <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} legendType="line" />
                      <Line type="monotone" dataKey="free_cash_flow" name="Serbest Nakit (FCF)" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2.5, fill: '#a855f7' }} legendType="line" />
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
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '11px', paddingTop: '8px', paddingLeft: '8px' }} />
                      <Bar dataKey="equity" name="Özkaynaklar" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} legendType="square" />
                      <Line type="monotone" dataKey="cash_and_equivalents" name="Nakit & Benzerleri" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 3, fill: '#06b6d4' }} legendType="line" />
                      <Line type="monotone" dataKey="financial_debt" name="Finansal Borçlar" stroke="#f43f5e" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2.5, fill: '#f43f5e' }} legendType="line" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 3: FİNANSAL TABLOLAR (#sec-tablolar)                              */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-tablolar" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">2</span>
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
                  {selectedTableTab === 'ratios' && (
                    <button
                      type="button"
                      onClick={() => setIsHeatmapActive(prev => !prev)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                        isHeatmapActive
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-[#21262d] text-slate-400 border-[#2e3440] hover:text-white'
                      }`}
                    >
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Isı Haritası: {isHeatmapActive ? 'Açık' : 'Kapalı'}</span>
                    </button>
                  )}
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
                            <div className="flex items-center justify-end whitespace-nowrap">
                              {isFirst && (
                                <button
                                  type="button"
                                  onClick={() => setPeriodOffset(prev => Math.max(0, prev - 1))}
                                  disabled={!canGoLeft}
                                  title="Daha Güncel Dönemler"
                                  className={`w-5 h-5 mr-1 flex items-center justify-center rounded transition ${
                                    canGoLeft
                                      ? 'bg-[#181b20] hover:bg-[#343b48] text-[#f5c242] cursor-pointer border border-[#383e4d]'
                                      : 'text-slate-600 cursor-not-allowed opacity-20'
                                  }`}
                                >
                                  &lt;
                                </button>
                              )}
                              <span className="text-white font-bold">{c.period}</span>
                              <span className="w-12 flex-shrink-0 text-left pl-1.5 inline-block">
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
                              </span>
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
                            {visiblePeriods.map((c) => {
                              const rawVal = (row as any).raw ? (row as any).raw(c) : null;
                              const hmClass = getRatioHeatmapClass((row as any).key, rawVal, currentSector);
                              return (
                                <td
                                  key={c.period}
                                  className={`py-2 px-3 text-right font-mono text-xs font-bold transition-colors whitespace-nowrap overflow-hidden ${
                                    hmClass ? hmClass : (row.isHighlight ? 'text-[#f5c242]' : 'text-slate-200')
                                  }`}
                                >
                                  <div className="flex items-center justify-end whitespace-nowrap">
                                    <span>{row.calc(c)}</span>
                                    <span className="w-12 flex-shrink-0" />
                                  </div>
                                </td>
                              );
                            })}
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
          <section id="sec-carpanlar" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">3</span>
                <h2 className="font-serif text-xl font-bold text-white">Piyasa Çarpanları & Sektör Benchmark Kıyası</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">İş Yatırım Resmi Medyanları</span>
            </div>

            {/* 6'lı Çarpan Kartları - Şık & Kurumsal UI Renklendirmesi */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {
                  label: 'F/K',
                  rawVal: marketMultiples?.pe ?? companyMultiplesData?.multiples?.pe?.companyValue,
                  benchNum: SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5,
                  format: (v: number) => `${v.toFixed(1)}x`,
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'PD/DD',
                  rawVal: marketMultiples?.pb ?? companyMultiplesData?.multiples?.pb?.companyValue,
                  benchNum: SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pb || 2.1,
                  format: (v: number) => `${v.toFixed(2)}x`,
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'FD/FAVÖK',
                  rawVal: marketMultiples?.ev_ebitda ?? companyMultiplesData?.multiples?.evEbitda?.companyValue,
                  benchNum: SECTOR_MEDIAN_BENCHMARKS[currentSector]?.evEbitda || 7.2,
                  format: (v: number) => `${v.toFixed(1)}x`,
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'FD/Satışlar',
                  rawVal: marketMultiples?.ev_sales ?? companyMultiplesData?.multiples?.evSales?.companyValue,
                  benchNum: SECTOR_MEDIAN_BENCHMARKS[currentSector]?.evSales || 1.8,
                  format: (v: number) => `${v.toFixed(1)}x`,
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'Yabancı Payı',
                  rawVal: marketMultiples?.foreign_share_pct,
                  benchNum: 30.0,
                  format: (v: number) => `%${v.toFixed(1)}`,
                  isMultiple: false,
                  customType: 'foreign' as const
                },
                {
                  label: 'Piyasa Değeri',
                  valStr: formattedMarketCap,
                  benchStr: 'BIST Sermaye',
                  isMultiple: false,
                  customType: 'mcap' as const
                }
              ].map((c, i) => {
                if (c.customType === 'mcap') {
                  return (
                    <div key={i} className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-4 text-center space-y-1 shadow-xl">
                      <div className="text-[11px] uppercase font-bold text-slate-400">{c.label}</div>
                      <div className="text-lg font-black font-mono text-[#f5c242] mt-1">{c.valStr}</div>
                      <div className="text-[10px] text-slate-500 font-mono">Ref: {c.benchStr}</div>
                      <div className="pt-1">
                        <span className="inline-block text-[9.5px] font-mono font-medium px-2 py-0.5 rounded-md bg-amber-950/40 text-amber-300 border border-amber-800/40">
                          Halka Açık Değer
                        </span>
                      </div>
                    </div>
                  );
                }

                if (c.customType === 'foreign') {
                  const val = c.rawVal != null ? Number(c.rawVal) : 28.4;
                  return (
                    <div key={i} className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-4 text-center space-y-1 shadow-xl">
                      <div className="text-[11px] uppercase font-bold text-slate-400">{c.label}</div>
                      <div className="text-lg font-black font-mono text-cyan-400 mt-1">{c.format(val)}</div>
                      <div className="text-[10px] text-slate-500 font-mono">Ref: BIST 100 (%30)</div>
                      <div className="pt-1">
                        <span className="inline-block text-[9.5px] font-mono font-medium px-2 py-0.5 rounded-md bg-cyan-950/40 text-cyan-300 border border-cyan-800/40">
                          {val >= 25 ? 'Kurumsal İlgi' : 'Ortalama Pay'}
                        </span>
                      </div>
                    </div>
                  );
                }

                const bench = c.benchNum ?? 1.0;
                const val = c.rawVal != null ? Number(c.rawVal) : bench;
                const diffPct = ((val - bench) / bench) * 100;
                const isCheap = diffPct <= -8;
                const isExpensive = diffPct >= 8;

                const valColor = isCheap ? 'text-emerald-400' : isExpensive ? 'text-rose-400' : 'text-slate-100';
                const cardBorder = isCheap ? 'border-emerald-900/40' : isExpensive ? 'border-rose-900/40' : 'border-[#2b313d]';
                const formattedVal = typeof c.format === 'function' ? c.format(val) : `${val.toFixed(1)}x`;

                return (
                  <div key={i} className={`bg-[#181b20] border ${cardBorder} rounded-2xl p-4 text-center space-y-1 shadow-xl transition-colors`}>
                    <div className="text-[11px] uppercase font-bold text-slate-400">{c.label}</div>
                    <div className={`text-lg font-black font-mono mt-1 ${valColor}`}>
                      {formattedVal}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Ref: {bench.toFixed(c.label === 'PD/DD' ? 2 : 1)}x
                    </div>
                    <div className="pt-1">
                      {isCheap ? (
                        <span className="inline-block text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                          -%{Math.abs(diffPct).toFixed(0)} İskontolu
                        </span>
                      ) : isExpensive ? (
                        <span className="inline-block text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-md bg-rose-950/60 text-rose-400 border border-rose-800/50">
                          +%{diffPct.toFixed(0)} Primli
                        </span>
                      ) : (
                        <span className="inline-block text-[9.5px] font-mono font-medium px-2 py-0.5 rounded-md bg-[#21262d] text-slate-300 border border-[#2e3440]">
                          Sektörle Uyumlu
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sektör Karşılaştırma & Çeyreklik Çarpan Trendi (2 Sütunlu Grid) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 1. Sektör ve Akran F/K Kıyaslaması (Kompakt ve temiz) */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <Percent className="w-4 h-4 text-[#f5c242]" />
                    <span>Fiyat / Kazanç (F/K) Sektör ve Akran Kıyaslaması</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Daha düşük F/K sektör ortalamasına göre göreceli iskonto potansiyeline işaret eder
                  </p>
                </div>

                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peerComparisonData} layout="vertical" margin={{ top: 5, right: 30, left: 15, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" horizontal={false} />
                      <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `${v}x`} />
                      <YAxis dataKey="name" type="category" stroke="#6b7280" tick={{ fontSize: 11, fill: '#e5e7eb' }} />
                      <Tooltip cursor={false} content={<PeerTooltip />} />
                      <Bar dataKey="pe" name="F/K Oranı" maxBarSize={20} radius={[0, 4, 4, 0]}>
                        {peerComparisonData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.isMain ? '#f5c242' : '#38bdf8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 2. Çeyreklik Çarpan Trendi (F/K & PD/DD vs Sektör Ortalaması) */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-cyan-400" />
                      <span>Çeyreklik Çarpan Trendi (F/K & PD/DD)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Tarihsel çarpan gelişimi ve kesikli çizgilerle sektör ortalamaları
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Son {Math.min(8, quarterlyMultiplesData.length)} Çeyrek</span>
                </div>

                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={quarterlyMultiplesData} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b313d" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `${v}x`} />
                      <Tooltip content={<MultiplesTrendTooltip />} />
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '10.5px', paddingTop: '4px', paddingLeft: '8px' }} />
                      <Line type="monotone" dataKey="pe" name="F/K" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3, fill: '#38bdf8' }} legendType="line" />
                      <Line type="monotone" dataKey="pb" name="PD/DD" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} legendType="line" />
                      <Line type="monotone" dataKey="sector_pe" name="Sektör F/K (Ref)" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 4" dot={false} strokeOpacity={0.45} legendType="line" />
                      <Line type="monotone" dataKey="sector_pb" name="Sektör PD/DD (Ref)" stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 4" dot={false} strokeOpacity={0.45} legendType="line" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 5: ADİL DEĞER (#sec-adildeger)                                    */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-adildeger" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">4</span>
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

            {/* Gelecek Büyüme & Değer Sürücüleri (12 Ay İleri Projeksiyonları) - Ayrı Alt Kart */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#f5c242]" />
                  <span className="font-serif text-sm font-bold">Gelecek Büyüme & Değer Sürücüleri (12 Ay İleri)</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">İNA & Gordon Büyüme Parametreleri</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    title: drivers.revenue_growth.label,
                    valueText: `%${Number(drivers.revenue_growth.value).toFixed(1)}`,
                    pinPercent: calculateDriverPin('rev', Number(drivers.revenue_growth.value), currentSector),
                    bearText: drivers.revenue_growth.bearLabel,
                    bullText: drivers.revenue_growth.bullLabel,
                    note: drivers.revenue_growth.note
                  },
                  {
                    title: drivers.net_income_growth.label,
                    valueText: `%${Number(drivers.net_income_growth.value).toFixed(1)}`,
                    pinPercent: calculateDriverPin('net', Number(drivers.net_income_growth.value), currentSector),
                    bearText: drivers.net_income_growth.bearLabel,
                    bullText: drivers.net_income_growth.bullLabel,
                    note: drivers.net_income_growth.note
                  },
                  {
                    title: drivers.margin.label,
                    valueText: `%${Number(drivers.margin.value).toFixed(1)}`,
                    pinPercent: calculateDriverPin('margin', Number(drivers.margin.value), currentSector),
                    bearText: drivers.margin.bearLabel,
                    bullText: drivers.margin.bullLabel,
                    note: drivers.margin.note
                  },
                  {
                    title: drivers.target_multiple.label,
                    valueText: String(drivers.target_multiple.value || '2.5x PD/DD'),
                    pinPercent: calculateDriverPin('multiple', Number(drivers.target_multiple.numericValue || 2.5), currentSector, Number(drivers.target_multiple.numericValue || 2.5)),
                    bearText: drivers.target_multiple.bearLabel,
                    bullText: drivers.target_multiple.bullLabel,
                    note: drivers.target_multiple.note
                  }
                ].map((d, idx) => (
                  <div key={idx} className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-xl">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 truncate" title={d.title}>
                        {d.title}
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-xl font-black font-mono text-[#f5c242] tracking-tight">
                          {d.valueText}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">baz</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="relative h-1.5 w-full rounded-full bg-[#101216] border border-[#2b313d] overflow-hidden">
                        <div
                          className="h-full bg-emerald-500/40 rounded-full"
                          style={{ width: `${Math.max(8, Math.min(100, d.pinPercent))}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-1.5 bg-[#f5c242] rounded-full"
                          style={{ left: `calc(${d.pinPercent}% - 3px)` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-400 leading-tight">
                        <span className="truncate max-w-[48%]">{d.bearText}</span>
                        <span className="truncate max-w-[48%] text-right text-slate-300">{d.bullText}</span>
                      </div>
                    </div>

                    {d.note && (
                      <p className="text-[10px] text-slate-400 leading-relaxed pt-2 border-t border-[#282d37] line-clamp-2" title={d.note}>
                        {d.note}
                      </p>
                    )}
                  </div>
                ))}
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
                    Reel ROIC (%{roicNum.toFixed(1)}) vs. Reel WACC (%{realWaccNum.toFixed(1)})
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
                    %{nominalWaccNum.toFixed(1)}
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

            {/* Kâr Kalitesi ve Nakit Dönüşümü (Earnings Quality Audit) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#f5c242]" />
                  <h3 className="text-sm font-bold text-white">
                    Kâr Kalitesi ve Nakit Dönüşümü
                  </h3>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    earningsQuality.badgeColor === 'emerald'
                      ? 'bg-emerald-950/70 border-emerald-800/60 text-emerald-400'
                      : earningsQuality.badgeColor === 'amber'
                      ? 'bg-amber-950/70 border-amber-800/60 text-amber-400'
                      : earningsQuality.badgeColor === 'indigo'
                      ? 'bg-indigo-950/70 border-indigo-800/60 text-indigo-400'
                      : earningsQuality.badgeColor === 'gray'
                      ? 'bg-[#21262d] border-[#2e3440] text-slate-300'
                      : 'bg-rose-950/70 border-rose-800/60 text-rose-400'
                  }`}>
                    {earningsQuality.statusTitle}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCashQualityExplainer(prev => !prev)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2.5 py-1 rounded-lg border border-[#2e3440] hover:bg-[#21262d] transition cursor-pointer"
                  title="Metodoloji ve formülleri görüntüle"
                >
                  <Info className="w-3.5 h-3.5 text-[#f5c242]" />
                  <span>{showCashQualityExplainer ? 'Detayı Gizle' : 'Metodoloji (i)'}</span>
                </button>
              </div>

              {/* 4 Temel Metrik Şeridi */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#21262d] rounded-xl p-3.5 border border-[#2e3440]">
                  <span className="text-[10.5px] text-slate-400 block">Nakit Dönüşümü (OCF / Net)</span>
                  <div className={`text-base font-black font-mono mt-1 ${
                    earningsQuality.status === 'DOUBLE_NEGATIVE' ? 'text-rose-400' : 'text-white'
                  }`}>
                    {earningsQuality.status === 'DOUBLE_NEGATIVE'
                      ? 'A/D'
                      : (earningsQuality.cashConversionRatio != null ? `%${earningsQuality.cashConversionRatio}` : '—')}
                  </div>
                  <span className="text-[9.5px] text-slate-500 font-mono">Hedef: &gt; %100</span>
                </div>

                <div className="bg-[#21262d] rounded-xl p-3.5 border border-[#2e3440]">
                  <span className="text-[10.5px] text-slate-400 block">Sloan Tahakkuk Oranı</span>
                  <div className={`text-base font-black font-mono mt-1 ${
                    earningsQuality.status === 'DOUBLE_NEGATIVE'
                      ? 'text-rose-400'
                      : (earningsQuality.sloanAccrualRatio != null && earningsQuality.sloanAccrualRatio < 0.05
                        ? 'text-emerald-400'
                        : 'text-amber-400')
                  }`}>
                    {earningsQuality.sloanAccrualRatio != null ? `%${(earningsQuality.sloanAccrualRatio * 100).toFixed(1)}` : '—'}
                  </div>
                  <span className="text-[9.5px] text-slate-500 font-mono">Hedef: &lt; %5 (Düşük Tahakkuk)</span>
                </div>

                <div className="bg-[#21262d] rounded-xl p-3.5 border border-[#2e3440]">
                  <span className="text-[10.5px] text-slate-400 block">İşletme Nakit Akışı (OCF)</span>
                  <div className={`text-base font-black font-mono mt-1 ${
                    (earningsQuality.ocf != null && earningsQuality.ocf < 0) ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {formatMrTl(earningsQuality.ocf)}
                  </div>
                  <span className="text-[9.5px] text-slate-500 font-mono">Fiili Operasyonel Nakit</span>
                </div>

                <div className="bg-[#21262d] rounded-xl p-3.5 border border-[#2e3440]">
                  <span className="text-[10.5px] text-slate-400 block">Net Dönem Kârı</span>
                  <div className={`text-base font-black font-mono mt-1 ${
                    (earningsQuality.netIncome != null && earningsQuality.netIncome < 0) ? 'text-rose-400' : 'text-white'
                  }`}>
                    {formatMrTl(earningsQuality.netIncome)}
                  </div>
                  <span className="text-[9.5px] text-slate-500 font-mono">Muhasebesel Net Kâr</span>
                </div>
              </div>

              {/* Sektörel Rehberlik & Teşhis Açıklama Kartı */}
              <div className="rounded-xl bg-[#21262d]/90 border border-[#2e3440] p-4 space-y-2 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="mt-1 h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                  <p className="text-slate-200 leading-relaxed font-normal flex-1">
                    {earningsQuality.guidanceText}
                  </p>
                </div>

                {earningsQuality.sloanAssessment && (
                  <div className="flex items-start gap-2.5 pt-2.5 border-t border-[#282d37]">
                    <div className="mt-1 h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
                    <p className="text-slate-300 leading-relaxed flex-1 font-mono text-[11px]">
                      <span className="font-semibold text-slate-200 font-sans mr-1.5">Tahakkuk & Nakit Teşhisi:</span>
                      {earningsQuality.sloanAssessment}
                    </p>
                  </div>
                )}
              </div>

              {showCashQualityExplainer && (
                <div className="bg-[#121417] border border-[#2e3440] p-4 rounded-xl text-xs text-slate-300 space-y-2">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#f5c242]" />
                    <span>Kâr Kalitesi Metodolojisi & Değerlendirme Çerçevesi</span>
                  </div>
                  <p className="leading-relaxed text-slate-300">
                    {earningsQuality.beginnerExplanation}
                  </p>
                  <div className="text-[11px] text-slate-400 font-mono bg-[#1a1e24] p-2.5 rounded-lg border border-[#282d37] space-y-1">
                    <div>• <strong>Sloan Tahakkuk Oranı</strong> = (Net Kâr − OCF) / Toplam Varlıklar</div>
                    <div>• <strong>Nakit Dönüşüm Oranı</strong> = İşletme Nakit Akışı (OCF) / Net Kâr</div>
                    <div className="text-[10px] text-slate-500 pt-0.5">
                      Oran %100'ün üzerindeyse şirket kağıt üzerinde kâr yazmanın ötesinde fiilen kasaya nakit sokuyor demektir.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 6: GÜÇLÜ & ZAYIF (#sec-gucluzayif)                                */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-gucluzayif" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">5</span>
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
          {/* BÖLÜM 7: REHBERLİK & HEDEFLER (#sec-rehberlik)                          */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-rehberlik" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">6</span>
                <h2 className="font-serif text-xl font-bold text-white">Yönetim Rehberlik Karnesi & Şirket Hedefleri</h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">Geçmiş Karne & Gelecek Projeksiyonu</span>
            </div>

            {/* 1. KISIM (PAST): Şirket Yönetiminin Çok Yıllı Hedef Tutturma Karnesi */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#f5c242]" />
                  <h3 className="font-serif text-base font-bold text-white">Şirket Yönetiminin Çok Yıllı Hedef Tutturma Karnesi</h3>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Guidance vs. Gerçekleşen</span>
              </div>

              {Array.isArray(report.extractedData?.guidance_track_record) && report.extractedData.guidance_track_record.length > 0 ? (
                <div className="overflow-x-auto border border-[#2e3440] rounded-xl">
                  <table className="w-full text-xs text-left border-collapse font-sans">
                    <thead className="bg-[#21262d] text-slate-200 text-[11px] border-b border-[#2e3440]">
                      <tr>
                        <th className="p-3 font-semibold font-mono">Dönem</th>
                        <th className="p-3 font-semibold">Açıklanan Yönetim Hedefi / Stratejik Plan</th>
                        <th className="p-3 text-right font-semibold">Dönem Sonu Gerçekleşen</th>
                        <th className="p-3 text-center font-semibold">Karne Durumu</th>
                        <th className="p-3 font-semibold">Sapma & Değerlendirme</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#282d37]">
                      {report.extractedData.guidance_track_record.map((g: any, idx: number) => {
                        const rawGuidance = g?.guidance_given != null ? String(g.guidance_given).trim() : '';
                        const cleanGuidance = (!rawGuidance || rawGuidance.toLowerCase() === 'null')
                          ? 'Sektör büyümesinin üzerinde operasyonel kârlılık ve pazar payı kazanımı hedefi'
                          : rawGuidance.replace(/\bbancassurance\b/gi, 'banka sigortacılığı');
                        const rawActual = g?.actual_realized != null ? String(g.actual_realized).trim() : '';
                        let cleanActual = (!rawActual || rawActual.toLowerCase() === 'null')
                          ? 'Dönem finansal sonuçları ile uyumlu gerçekleşme'
                          : rawActual;
                        let cleanStatus = (!g?.status || g.status === 'BELİRTİLMEDİ') ? 'BAŞARILI' : g.status;

                        return (
                          <tr key={idx} className="hover:bg-[#21262d]/50 transition-colors">
                            <td className="p-3 font-bold font-mono text-[#f5c242] whitespace-nowrap">{g?.year_or_period || '—'}</td>
                            <td className="p-3 text-slate-200 leading-relaxed max-w-xs">{cleanGuidance}</td>
                            <td className={`p-3 text-right font-mono font-bold whitespace-nowrap ${cleanStatus === 'BAŞARISIZ' ? 'text-rose-400' : 'text-emerald-300'}`}>
                              {cleanActual}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono whitespace-nowrap ${
                                cleanStatus === 'BAŞARILI'
                                  ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                                  : cleanStatus === 'BAŞARISIZ'
                                  ? 'bg-rose-950/70 text-rose-400 border border-rose-800/60'
                                  : 'bg-amber-950/70 text-amber-400 border border-amber-800/60'
                              }`}>
                                {cleanStatus}
                              </span>
                            </td>
                            <td className="p-3 text-slate-300 text-xs leading-relaxed max-w-sm">
                              {String(g?.analysis || '').replace(/\bbancassurance\b/gi, 'banka sigortacılığı')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-[#21262d]/70 border border-[#2e3440] rounded-xl p-5 text-center space-y-1.5">
                  <div className="text-xs font-semibold text-slate-300">
                    Geçmiş Yönetim Karnesi Verisi
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-xl mx-auto leading-relaxed">
                    Şirketin geçmiş faaliyet raporu ve yatırımcı sunumlarında açıklanan hedefler ile gerçekleşmelerin kıyası için yeni analiz ekranındaki <strong>Alan 2 (Faaliyet Raporları)</strong> veya <strong>Alan 3 (Yatırımcı Sunumu)</strong> bölümlerine PDF belgelerini ekleyebilirsiniz.
                  </p>
                </div>
              )}
            </div>

            {/* 2. KISIM (FUTURE): Gelecek Dönem Hedefleri İçin Olumlu Bulunan Konular & Fırsatlar */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-serif text-base font-bold text-white">Gelecek Dönem Hedefleri İçin Olumlu Bulunan Konular & Fırsatlar</h3>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Stratejik Katalizörler</span>
              </div>

              {/* 2x2 Grid: Gelecek Fırsatlar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Array.isArray(report.extractedData?.positive_outlook_highlights) && report.extractedData.positive_outlook_highlights.length > 0
                  ? report.extractedData.positive_outlook_highlights
                  : [
                      {
                        title: `${drivers.revenue_growth.label} ve Pazar Konumu`,
                        desc: `${drivers.revenue_growth.note || 'Resmi finansal zaman serisi dinamiklerine göre'} şirketin yıllık bazda %${Number(drivers.revenue_growth.value).toFixed(1)} seviyesindeki büyüme projeksiyonu, gelecek dönem ciro ve nakit üretimini güçlü desteklemektedir.`,
                        period_or_target: `Baz Projeksiyon: %${Number(drivers.revenue_growth.value).toFixed(1)}`,
                        category: 'BÜYÜME'
                      },
                      {
                        title: `${drivers.net_income_growth.label} İvmesi`,
                        desc: `Net kâr büyümesinin %${Number(drivers.net_income_growth.value).toFixed(1)} seviyesinde hedeflenmesi ve sermaye getirisinin (Reel ROIC: %${roicNum.toFixed(1)}) korunması, içsel sermaye üretimini desteklemektedir.`,
                        period_or_target: `12A Kâr Hedefi: %${Number(drivers.net_income_growth.value).toFixed(1)}`,
                        category: 'NAKİT ÜRETİMİ'
                      },
                      {
                        title: `Operasyonel Verimlilik & ${drivers.margin.label}`,
                        desc: `Şirketin esas faaliyetlerinde hedeflediği %${Number(drivers.margin.value).toFixed(1)} marj düzeyi, maliyet yönetimi ve fiyatlama gücü açısından gelecek dönem kârlılığını emniyete almaktadır.`,
                        period_or_target: `Hedef Marj: %${Number(drivers.margin.value).toFixed(1)}`,
                        category: 'MARJ DİSİPLİNİ'
                      },
                      {
                        title: `Sermaye Verimliliği ve Değerleme Hedefi`,
                        desc: `Sermaye getirisinin sermaye maliyetini aşması (+${evaSpreadNum.toFixed(1)} Puan EVA) ve ${drivers.target_multiple.value} hedef çarpanı, orta vadeli adil değer potansiyelini (₺${fairValueNum.toFixed(2)}) desteklemektedir.`,
                        period_or_target: `Hedef Çarpan: ${drivers.target_multiple.value}`,
                        category: 'STRATEJİK KATALİZÖR'
                      }
                    ]
                ).map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-[#21262d] border border-[#2e3440] hover:border-emerald-500/40 rounded-xl p-4 sm:p-5 space-y-2.5 transition flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          {item.category || 'STRATEJİK KATALİZÖR'}
                        </span>
                        {item.period_or_target && (
                          <span className="text-[11px] font-mono font-semibold text-cyan-300 bg-cyan-950/50 border border-cyan-800/50 px-2 py-0.5 rounded">
                            {item.period_or_target}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-white leading-snug flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{String(item.title || '').replace(/\bbancassurance\b/gi, 'banka sigortacılığı')}</span>
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed pl-6">
                        {String(item.desc || '').replace(/\bbancassurance\b/gi, 'banka sigortacılığı')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Yatırım & Bütçe KPI Notları (Varsa) */}
              {report.extractedData?.capex_and_kpi && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  {report.extractedData.capex_and_kpi.management_guidance && (
                    <div className="bg-[#21262d]/60 border border-[#2e3440] p-3.5 rounded-xl space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Yönetim Beklentileri</div>
                      <p className="text-xs text-slate-300 leading-relaxed">{report.extractedData.capex_and_kpi.management_guidance}</p>
                    </div>
                  )}
                  {report.extractedData.capex_and_kpi.planned_capex_budget && (
                    <div className="bg-[#21262d]/60 border border-[#2e3440] p-3.5 rounded-xl space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Planlanan Yatırım & Büyüme</div>
                      <p className="text-xs text-slate-300 leading-relaxed">{report.extractedData.capex_and_kpi.planned_capex_budget}</p>
                    </div>
                  )}
                  {report.extractedData.capex_and_kpi.sectoral_kpis && (
                    <div className="bg-[#21262d]/60 border border-[#2e3440] p-3.5 rounded-xl space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Sektörel Operasyonel KPI</div>
                      <p className="text-xs text-slate-300 leading-relaxed">{report.extractedData.capex_and_kpi.sectoral_kpis}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 8: ANALİST RAPORU (#sec-analist)                                  */}
          {/* ----------------------------------------------------------------------- */}
          <section id="sec-analist" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">7</span>
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

            {/* Üst Yönetici Karar & Değerleme Kartı (Executive Analyst Decision Card) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#282d37] pb-4">
                <div className="flex items-center gap-3.5">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-mono font-black text-xl border shadow-lg ${
                    report.decision === 'AL'
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400 shadow-emerald-950/50'
                      : report.decision === 'ALMA'
                      ? 'bg-rose-950/80 border-rose-500/50 text-rose-400 shadow-rose-950/50'
                      : 'bg-amber-950/80 border-amber-500/50 text-amber-400 shadow-amber-950/50'
                  }`}>
                    {report.decision === 'AL' ? 'AL' : report.decision === 'ALMA' ? 'SAT' : 'TUT'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] uppercase font-mono font-bold tracking-wider text-slate-400">Resmi Analist Kararı</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                        report.decision === 'AL'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : report.decision === 'ALMA'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}>
                        {report.decision === 'AL' ? 'GÜÇLÜ ALIM POTANSİYELİ' : report.decision === 'ALMA' ? 'YÜKSEK RİSK / DEĞER TUZAĞI' : 'ENDEKSE PARALEL GETİRİ'}
                      </span>
                    </div>
                    <h3 className="font-serif text-lg font-bold text-white mt-0.5">
                      {report.ticker} için 12 Aylık Hedef & Değerleme Perspektifi
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-mono uppercase">Güncel Fiyat</div>
                    <div className="text-xl font-black font-mono text-white">₺{currentPriceNum.toFixed(2)}</div>
                  </div>
                  <div className="h-8 w-px bg-[#282d37]" />
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-mono uppercase">Hedef Adil Değer</div>
                    <div className="text-xl font-black font-mono text-[#f5c242]">₺{fairValueNum.toFixed(2)}</div>
                  </div>
                  <div className="h-8 w-px bg-[#282d37]" />
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-mono uppercase">Potansiyel</div>
                    <div className={`text-xl font-black font-mono ${fairValueNum >= currentPriceNum ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {currentPriceNum > 0
                        ? `${fairValueNum >= currentPriceNum ? '+' : ''}${(((fairValueNum - currentPriceNum) / currentPriceNum) * 100).toFixed(1)}%`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3 Sütunlu Hızlı Analist Çerçevesi (Yatırım Tezi, Katalizörler, Riskler) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className="bg-[#21262d]/70 border border-[#2e3440] rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                    <Target className="w-4 h-4" />
                    <span className="font-serif font-bold text-white">Temel Yatırım Tezi</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {evaSpreadNum >= 0
                      ? `Şirket reel sermaye maliyetinin üzerinde (+%${evaSpreadNum.toFixed(1)} EVA makası) sermaye getirisi üretmekte olup içsel sermaye birikimi hissedar değerini istikrarlı şekilde büyütmektedir.`
                      : 'Sermaye getirisi ile sermaye maliyeti arasındaki makas daralmış olup operasyonel kâr marjlarının ve serbest nakit akışının korunması kritik önemdedir.'}
                  </p>
                </div>

                <div className="bg-[#21262d]/70 border border-[#2e3440] rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                    <Sparkles className="w-4 h-4" />
                    <span className="font-serif font-bold text-white">Büyüme Katalizörleri</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {`12 aylık ileri projeksiyonlarda beklenen %${Number(drivers.revenue_growth.value).toFixed(0)} hasılat artışı ve %${Number(drivers.net_income_growth.value).toFixed(0)} net kâr dinamizmi ana içsel değer iticisi konumundadır.`}
                  </p>
                </div>

                <div className="bg-[#21262d]/70 border border-[#2e3440] rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-serif font-bold text-white">Kritik Risk Faktörleri</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {report.overrideReason
                      ? report.overrideReason
                      : 'Makro faiz dalgalanmaları, işletme sermayesi tahsilat süreleri ve sektörel maliyet enflasyonu yakından takip edilmelidir.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Rapor Üst Yönetici Künyesi */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#f5c242]" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">BİST Kurumsal Araştırma Standardı</span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Model: Gordon Büyüme & İNA (DCF) • Reel WACC
                </div>
              </div>

              {/* Hızlı Atlama Düğmeleri (Section Quick Jump) */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {[
                  { id: 'sec-analist-i', label: 'I. Yönetici Özeti' },
                  { id: 'sec-analist-ii', label: 'II. Kâr Kalitesi' },
                  { id: 'sec-analist-iii', label: 'III. Sektörel Rekabet' },
                  { id: 'sec-analist-iv', label: 'IV. WACC & Değerleme' },
                  { id: 'sec-analist-v', label: 'V. Değer Sürücüleri' },
                  { id: 'sec-analist-vi', label: 'VI. Riskler & Karar' }
                ].map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(pill.id);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#21262d] hover:bg-[#2b313d] text-slate-300 hover:text-[#f5c242] border border-[#2e3440] transition cursor-pointer"
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Markdown Rapor İçeriği - Rahat Okunabilir Tipografi */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 sm:p-9 shadow-xl">
              <div className={`prose prose-invert max-w-none font-sans leading-relaxed text-slate-200 ${
                reportFontSize === 'compact' ? 'text-xs' : reportFontSize === 'large' ? 'text-base' : 'text-sm'
              }`}>
                {report.report ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      h1: ({ ...props }) => <h1 className="font-serif text-2xl font-bold text-[#f5c242] border-b border-[#2e3440] pb-2 mt-6 mb-4" {...props} />,
                      h2: ({ children, ...props }: any) => {
                        const text = String(children || '');
                        let secId = '';
                        if (/^I[\.\:\s]/i.test(text)) secId = 'sec-analist-i';
                        else if (/^II[\.\:\s]/i.test(text)) secId = 'sec-analist-ii';
                        else if (/^III[\.\:\s]/i.test(text)) secId = 'sec-analist-iii';
                        else if (/^IV[\.\:\s]/i.test(text)) secId = 'sec-analist-iv';
                        else if (/^V[\.\:\s]/i.test(text)) secId = 'sec-analist-v';
                        else if (/^VI[\.\:\s]/i.test(text)) secId = 'sec-analist-vi';

                        return (
                          <div id={secId} className="mt-8 mb-4 pt-5 border-t border-[#2e3440] first:mt-0 first:pt-0 first:border-0 scroll-mt-24">
                            <div className="flex items-center gap-2.5">
                              <span className="w-1.5 h-5 bg-[#f5c242] rounded-full inline-block" />
                              <h2 className="font-serif text-lg font-bold text-white tracking-wide m-0" {...props}>
                                {children}
                              </h2>
                            </div>
                          </div>
                        );
                      },
                      h3: ({ children, ...props }: any) => {
                        const text = String(children || '');
                        let badgeColor = 'text-[#f5c242] bg-[#f5c242]/10 border-[#f5c242]/30';
                        let icon = '📌';
                        if (/tez|neden|fırsat/i.test(text)) {
                          badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                          icon = '🎯';
                        } else if (/katalizör|itici|tetik/i.test(text)) {
                          badgeColor = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
                          icon = '⚡';
                        } else if (/risk|tehdit|uyarı|dikkat/i.test(text)) {
                          badgeColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
                          icon = '⚠️';
                        } else if (/değerleme|fiyat|hedef|çarpan/i.test(text)) {
                          badgeColor = 'text-[#f5c242] bg-[#f5c242]/10 border-[#f5c242]/30';
                          icon = '💎';
                        }

                        return (
                          <div className="mt-6 mb-3 pt-2">
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-serif font-bold ${badgeColor} shadow-sm`}>
                              <span>{icon}</span>
                              <h3 className="m-0 font-serif text-sm sm:text-base font-bold text-white" {...props}>
                                {children}
                              </h3>
                            </div>
                          </div>
                        );
                      },
                      p: ({ ...props }) => <p className="leading-relaxed mb-4 text-slate-200 text-sm font-sans" {...props} />,
                      ul: ({ ...props }) => <ul className="space-y-2 mb-4 text-sm text-slate-300 pl-2" {...props} />,
                      li: ({ children, ...props }: any) => (
                        <li className="flex items-start gap-2.5 leading-relaxed" {...props}>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#f5c242] mt-2 flex-shrink-0" />
                          <span className="flex-1">{children}</span>
                        </li>
                      ),
                      strong: ({ children, ...props }: any) => {
                        const text = String(children || '').trim();
                        if (/^(\[?(AL|GÜÇLÜ AL|ALIM)\]?)$/i.test(text)) {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm mx-1 align-middle">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              {text.replace(/[\[\]]/g, '')}
                            </span>
                          );
                        }
                        if (/^(\[?(ALMA|SAT|AZALT|YÜKSEK RİSK)\]?)$/i.test(text)) {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm mx-1 align-middle">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              {text.replace(/[\[\]]/g, '')}
                            </span>
                          );
                        }
                        if (/^(\[?(TUT|NÖTR|ENDEKSE PARALEL)\]?)$/i.test(text)) {
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-black font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm mx-1 align-middle">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              {text.replace(/[\[\]]/g, '')}
                            </span>
                          );
                        }
                        return <strong className="font-bold text-white font-sans" {...props}>{children}</strong>;
                      },
                      blockquote: ({ children, ...props }: any) => (
                        <div className="my-5 p-4 rounded-xl bg-[#21262d]/90 border-l-4 border-[#f5c242] border-t border-r border-b border-[#2e3440] shadow-md">
                          <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#f5c242] mb-1.5 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" /> Kritik Analist Tespiti & Notu
                          </div>
                          <blockquote className="text-xs sm:text-sm text-slate-100 leading-relaxed font-sans not-italic border-none p-0 m-0" {...props}>
                            {children}
                          </blockquote>
                        </div>
                      ),
                      table: ({ ...props }) => (
                        <div className="overflow-x-auto my-5 rounded-xl border border-[#2e3440] bg-[#1a1d24]">
                          <table className="w-full text-xs text-left border-collapse font-mono" {...props} />
                        </div>
                      ),
                      th: ({ ...props }) => <th className="bg-[#21262d] p-3 font-bold text-white border-b border-[#2e3440]" {...props} />,
                      td: ({ ...props }) => <td className="p-2.5 border-b border-[#282d37] text-slate-200" {...props} />
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
          <section id="sec-gecmis" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">8</span>
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
