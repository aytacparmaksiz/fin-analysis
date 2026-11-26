'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  ChevronUp,
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
  History,
  Coins,
  RotateCcw,
  SlidersHorizontal,
  ArrowUp
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
  Legend,
  ReferenceLine
} from 'recharts';
import { formatAnalysisDate, parseNumericScore, type SavedReport } from '@/lib/report-resolver';
import type { SectorType } from '@/lib/sectors';
import {
  SECTOR_DEFINITIONS,
  BIST_INSURANCE_TICKERS,
  BIST_BANKING_TICKERS,
  BIST_HOLDING_TICKERS,
  BIST_REIT_TICKERS,
  detectSector,
  getSectorDefinition,
  isMetricDisabled,
  getScoreColorStyle
} from '@/lib/sectors';
import { OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE } from '@/lib/isyatirim-multiples-cache';
import { OFFICIAL_ISYATIRIM_COMPANY_DETAILS_BASELINE } from '@/lib/isyatirim-company-details-cache';
import { getCompanyProfile } from '@/lib/company-profiles';
import SnowflakeRadar from './snowflake-radar';
import {
  computeSnowflakeAnalysis,
  getSnowflakeCoordinates,
  generateSmoothSnowflakePath,
  aggregateDividendsByYear,
  synthesizeDividendsFromHistoryBrowserSafe,
  type SnowflakeAnalysisResult,
  type SnowflakeCheck
} from '@/lib/snowflake';
import { analyzeRelatedPartyAndCapitalAllocationRisk, calculateDuPont5Step, calculateEarningsQuality, calculateFundamentalMomentum, calculateProbabilisticExpectedValue, parseFinancialNumber, parsePeriodSortKey, getLatestReportsPerTicker } from '@/lib/valuation';
import { FinancialRatioEngine } from '@/lib/ratio-engine';
import { synthesizeInvestmentThesis } from '@/lib/investment-thesis-synthesizer';

export type SimplySectionId =
  | 'sec-ozet'
  | 'sec-grafikler'
  | 'sec-tablolar'
  | 'sec-carpanlar'
  | 'sec-adildeger'
  | 'sec-temettu'
  | 'sec-rehberlik'
  | 'sec-yatirim-tezi'
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
  ttmChartData?: any[];
  tickerHistory?: SavedReport[];
  portfolioTickers?: string[];
  favoriteTickers?: string[];
  initialTab?: 'ozet' | 'overview' | 'fairvalue' | 'tables' | 'multiples' | 'proscons' | 'guidance' | 'report' | 'history';
  onTogglePortfolio?: (ticker: string) => void;
  onToggleFavorite?: (ticker: string) => void;
  onSwitchToTerminal: () => void;
  onSelectTicker?: (ticker: string) => void;
  onAnalyzeTicker?: (ticker: string) => void;
  onSelectReport?: (id: string) => void;
}

const SECTOR_MEDIAN_BENCHMARKS: Record<string, { pe: number; pb: number; evEbitda: number | null; evSales: number | null }> = {
  INSURANCE: { pe: 4.59, pb: 1.78, evEbitda: null, evSales: null },
  BANKING: { pe: 5.17, pb: 1.03, evEbitda: null, evSales: null },
  HOLDING: { pe: 6.8, pb: 1.5, evEbitda: 6.0, evSales: 1.6 },
  REIT: { pe: 7.2, pb: 1.1, evEbitda: 8.5, evSales: 4.2 },
  TECH: { pe: 16.5, pb: 4.8, evEbitda: 14.0, evSales: 5.5 },
  AVIATION: { pe: 6.2, pb: 1.4, evEbitda: 5.1, evSales: 1.1 },
  HEALTHCARE: { pe: 14.2, pb: 3.8, evEbitda: 9.6, evSales: 2.1 },
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
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (!Number.isFinite(num)) return '—';
  if (num === 0) return '0';
  // BIST finansal tablolarındaki tüm değerler Tam TL'den tutarlı biçimde Bin TRY'ye çevrilir
  const inThousands = num / 1000;
  if (Math.abs(inThousands) >= 10 || Number.isInteger(inThousands)) {
    return Math.round(inThousands).toLocaleString('tr-TR');
  }
  return inThousands.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

// Eksi Değerlerde Aşırı Eksen Boşluğunu Önleyen Sıkı Eksen Tabanı Hesaplayıcı (-23 -> -25, -38 -> -40)
function calculateTightMin(minVal: number): number {
  if (minVal >= 0 || !isFinite(minVal)) return 0;
  const abs = Math.abs(minVal);
  const exp = Math.floor(Math.log10(abs));
  const base = Math.pow(10, exp);
  const normalized = abs / base;

  let targetNorm = 10;
  if (normalized <= 1.2) targetNorm = 1.25;
  else if (normalized <= 1.5) targetNorm = 1.5;
  else if (normalized <= 2.0) targetNorm = 2.0;
  else if (normalized <= 2.5) targetNorm = 2.5;
  else if (normalized <= 3.0) targetNorm = 3.0;
  else if (normalized <= 4.0) targetNorm = 4.0;
  else if (normalized <= 5.0) targetNorm = 5.0;
  else if (normalized <= 6.0) targetNorm = 6.0;
  else if (normalized <= 7.5) targetNorm = 7.5;
  else if (normalized <= 8.5) targetNorm = 8.5;
  else targetNorm = 10.0;

  return -(targetNorm * base);
}

// Çubuk grafiklerde 0 tabanını koruyarak orantısız min-kırpma yanılsamasını önler
function getZeroAnchoredBarDomain(items: any[], key: string): [number, number] {
  const vals = items
    .map((d) => Number(d?.[key]))
    .filter((v) => Number.isFinite(v));
  if (vals.length === 0) return [0, 100];
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const yMin = minVal < 0 ? calculateTightMin(minVal) : 0;
  const yMax = maxVal > 0 ? maxVal * 1.12 : 0;
  if (yMin === yMax) return [0, 100];
  return [yMin, yMax];
}

// Milyar / Milyon TL Formatlayıcı (Grafik eksen ve tooltip'leri için)
function formatMrTl(val: number | null | undefined, isAxis = false): string {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (!Number.isFinite(num)) return '—';
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
      <div className="bg-[#181b20] border border-[#2b313d] p-3.5 rounded-xl shadow-2xl font-sans text-sm space-y-2 min-w-[220px] z-50">
        <div className="font-bold text-white border-b border-[#282d37] pb-1.5 font-mono text-sm flex items-center justify-between">
          <span>{label}</span>
          <span className="text-sm text-slate-400 font-normal">Dönem</span>
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
            <div key={i} className="flex items-center justify-between gap-4 py-0.5 text-sm">
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

// Kurumsal Finansal Çeyreklik Bar Çizici (Mavi/Kırmızı Vurgulu Çizgi Başlıklı & Dengeli Asgari Gösterim)
function renderFinancialBar(props: any) {
  const { x, y, width, height, value } = props;
  if (width == null || height == null || isNaN(x) || isNaN(y)) return null;
  const numVal = Number(value);
  const isNegative = typeof value === 'number' && numVal < 0;
  const isZero = !Number.isFinite(numVal) || numVal === 0;

  // Sıfır olmayan finansal değerler için dengeli görsel taban (900M gibi pozitif çeyreklerin tabana yapışıp kaybolmasını önler)
  const minBarHeight = isZero ? 2 : 12;
  const rawAbsHeight = Math.abs(height);
  const safeHeight = Math.max(rawAbsHeight, minBarHeight);

  // Sıfır taban çizgisine kusursuz sabitleme:
  // Recharts pozitif değerlerde y'yi barın tepesi (üst), negatiflerde ise sıfır çizgisi olarak belirler.
  const baselineY = isNegative ? y : y + rawAbsHeight;
  const renderY = isNegative ? baselineY : baselineY - safeHeight;

  if (isNegative) {
    return (
      <g>
        <rect
          x={x}
          y={renderY}
          width={width}
          height={safeHeight}
          fill="#3e1d23"
          fillOpacity={0.88}
          rx={1}
        />
        <line
          x1={x}
          y1={renderY + safeHeight}
          x2={x + width}
          y2={renderY + safeHeight}
          stroke="#ef4444"
          strokeWidth={2.5}
        />
      </g>
    );
  }

  return (
    <g>
      <rect
        x={x}
        y={renderY}
        width={width}
        height={safeHeight}
        fill="#1f3354"
        fillOpacity={0.88}
        rx={1}
      />
      <line
        x1={x}
        y1={renderY}
        x2={x + width}
        y2={renderY}
        stroke="#3b82f6"
        strokeWidth={2.5}
      />
    </g>
  );
}

// Akran Kıyaslama Tooltip (Koyu zemin, yüksek kontrast, okunaklı F/K)
function PeerTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const item = payload[0];
    return (
      <div className="bg-[#181b20] border border-[#383e4d] rounded-xl px-3.5 py-2.5 shadow-2xl z-50 text-sm">
        <div className="text-sm font-bold text-white mb-0.5">{item.payload?.name}</div>
        <div className="text-sm font-mono font-bold text-[#f5c242] flex items-center gap-1.5">
          <span className="text-slate-400 font-normal">F/K Oranı:</span>
          <span>{item.value != null ? Number(item.value).toFixed(2) : '—'}</span>
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
      <div className="bg-[#181b20] border border-[#383e4d] rounded-xl p-3.5 shadow-2xl text-sm space-y-2 min-w-[190px] z-50">
        <div className="font-bold text-white font-mono border-b border-[#2e3440] pb-1 flex items-center justify-between text-sm">
          <span>{label}</span>
          <span className="text-sm text-slate-400 font-normal">Dönem</span>
        </div>
        {payload.map((entry: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-3 text-sm font-mono">
            <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span>{entry.name}:</span>
            </span>
            <span className="font-bold text-white">
              {entry.value != null ? Number(entry.value).toFixed(2) : '—'}
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

function extractTextFromChildren(children: any): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('');
  if (children && typeof children === 'object' && children.props && children.props.children) {
    return extractTextFromChildren(children.props.children);
  }
  return '';
}

interface ParsedVerdictNarrative {
  verdict: 'AL' | 'ALMA' | 'NÖTR';
  verdictTitle: string;
  thesis: string;
  catalysts: string;
  risks: string;
  isStructured: boolean;
}

function cleanSnippet(text: string, maxLen = 260): string {
  if (!text) return '';
  let s = text
    .replace(/^[\s\*\#\-\>:|]+/, '')
    .replace(/[\s\*\#\-\>:|]+$/, '')
    .replace(/###?\s+[^\n]+/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\|[^\n]+\|/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\\\([\s\S]*?\\\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  s = s.replace(/^(?:Bölüm Özeti|Yatırım Tezi|Temel Yatırım Tezi|Kilit Katalizörler|Riskler)\s*[:=-|]\s*/i, '').trim();
  s = s.replace(/^[:=| \t]+/, '').trim();

  // Yeterli harf veya anlamlı kelime yoksa (örn. sadece '|' veya '---'), geçersiz sayıp boşa çıkar
  if (s.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '').length < 8) {
    return '';
  }

  if (s.length > maxLen) {
    const dotIdx = s.indexOf('.', maxLen - 60);
    if (dotIdx > 0 && dotIdx < maxLen + 40) {
      return s.slice(0, dotIdx + 1).trim();
    }
    return s.slice(0, maxLen).trim() + '...';
  }
  return s;
}

function parseVerdictNarrative(
  rawText: string,
  fallbackDecision: string = 'AL',
  context?: { ticker?: string; discountPct?: number }
): ParsedVerdictNarrative {
  const ticker = context?.ticker || 'Şirket';
  const discountPct = context?.discountPct ?? 0;

  if (!rawText) {
    return {
      verdict: fallbackDecision === 'AL' ? 'AL' : fallbackDecision === 'ALMA' ? 'ALMA' : 'NÖTR',
      verdictTitle: fallbackDecision === 'AL'
        ? 'Kurumsal Alım & Portföy Ağırlığı Artır'
        : fallbackDecision === 'ALMA'
        ? 'Riskli / Sermaye Kaybı Riski (Yatırım Önerilmez)'
        : 'Dengeli / Endekse Paralel Getiri (Nötr)',
      thesis: fallbackDecision === 'AL'
        ? `${ticker}, modelimizin hesapladığı %${Math.abs(discountPct).toFixed(0)} iskonto payı, güçlü sermaye verimliliği ve sermaye maliyetini aşan ROIC performansı ile model portföyde alım yönünde konumlandırılmaktadır.`
        : fallbackDecision === 'ALMA'
        ? `${ticker}, daralan kâr marjları veya yüksek borçluluk baskısı nedeniyle sermaye kaybı riski taşımakta olup portföye dahil edilmesi önerilmemektedir.`
        : `${ticker}, mevcut piyasa çarpanları ve makro risk dengesi gözetildiğinde içsel değerine yakın işlem görmekte olup endekse paralel getiri sunmaktadır.`,
      catalysts: 'Hasılat büyümesi, operasyonel kâr marjı stabilitesi ve sektördeki pazar payı dinamizmi ana katalizörlerdir.',
      risks: 'Makro faiz oynaklığı, enflasyon muhasebesi marj etkileri ve çalışma sermayesi nakit dönüşüm süreleri temel risk unsurlarıdır.',
      isStructured: false
    };
  }

  let cleaned = rawText.replace(/\*\*(Yatırım\s+Tezi|Temel\s+Yatırım\s+Tezi|Gerekçe|Kilit\s+Katalizörler|Katalizörler|Riskler\s*(?:&|ve)\s*Emniyet\s*(?:Marjı|Sınırları|Sınırı)|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler)\s*:\*\*/gi, '$1:');
  cleaned = cleaned.replace(/\[\s*([^\]]+?)\s*\]/g, '$1').trim();

  // Detect verdict: AL, ALMA, NÖTR (Tekil Hakikat Kaynağı / ValuationState öncelikli)
  let verdict: 'AL' | 'ALMA' | 'NÖTR' = 'NÖTR';
  const normFallback = String(fallbackDecision || '').trim().toUpperCase();
  const verdictMatch = rawText.match(/Analist\s+Karar[ıi]\s*[:=-]?\s*\[?\s*\*?\*?\s*(ALMA|SAT|AL|NÖTR|NOTR|TUT)\s*\*?\*?\s*\]?/i);
  if (normFallback === 'AL') {
    verdict = 'AL';
  } else if (normFallback === 'ALMA' || normFallback === 'SAT') {
    verdict = 'ALMA';
  } else if (normFallback === 'NÖTR' || normFallback === 'NOTR' || normFallback === 'TUT') {
    verdict = 'NÖTR';
  } else if (verdictMatch) {
    const val = verdictMatch[1].toUpperCase();
    if (['ALMA', 'SAT'].includes(val)) verdict = 'ALMA';
    else if (val === 'AL') verdict = 'AL';
    else verdict = 'NÖTR';
  } else {
    verdict = 'NÖTR';
  }

  const verdictTitle = verdict === 'AL'
    ? 'Kurumsal Alım & Portföy Ağırlığı Artır'
    : verdict === 'ALMA'
    ? 'Riskli / Sermaye Kaybı Riski (Yatırım Önerilmez)'
    : 'Dengeli / Endekse Paralel Getiri (Nötr)';

  // Remove the "Analist Kararı: ..." prefix from body
  const bodyWithoutVerdict = cleaned.replace(/^(?:#{1,4}\s*)?\*{0,2}Analist\s+Karar[ıi]\s*[:=-]?[^\n:]*(?:\(Yatırım Önerisi\))?\*{0,2}\s*/i, '').trim();

  // Extract thesis, catalysts, risks with strict boundary that stops at any markdown headers or subsequent sections
  const thesisMatch = bodyWithoutVerdict.match(/(?:Yatırım\s+Tezi|Temel\s+Yatırım\s+Tezi|Gerekçe)\s*[:=-]?\s*([\s\S]*?)(?=(?:\n\s*\n|\n\s*#{1,3}\s+|\*{0,2}Finansal\s+Sağlık\s+Skoru|Kilit\s+Katalizörler|Katalizörler|Riskler\s*(?:&|ve)\s*Emniyet\s*(?:Marjı|Sınırları|Sınırı)|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler|$))/i);
  const unprefixedVerdictMatch = !thesisMatch
    ? cleaned.match(/Analist\s+Karar[ıi]\s*[:=-]?[^\n]*\n+([\s\S]*?)(?=(?:\n\s*#{1,3}\s+|Kilit\s+Katalizörler|Katalizörler|Riskler\s*(?:&|ve)\s*Emniyet\s*(?:Marjı|Sınırları|Sınırı)|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler|$))/i)
    : null;
  const catalystMatch = bodyWithoutVerdict.match(/(?:Kilit\s+Katalizörler|Katalizörler)\s*[:=-]?\s*([\s\S]*?)(?=(?:\n\s*#{1,3}\s+|Riskler\s*(?:&|ve)\s*Emniyet\s*(?:Marjı|Sınırları|Sınırı)|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler|$))/i);
  const riskMatch = bodyWithoutVerdict.match(/(?:Riskler\s*(?:&|ve)\s*Emniyet\s*(?:Marjı|Sınırları|Sınırı)|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler)\s*[:=-]?\s*([\s\S]*?)(?=(?:\n\s*#{1,3}\s+|$))/i);

  const rawThesis = thesisMatch
    ? cleanSnippet(thesisMatch[1], 280)
    : unprefixedVerdictMatch
    ? cleanSnippet(unprefixedVerdictMatch[1], 280)
    : '';
  const rawCatalysts = catalystMatch ? cleanSnippet(catalystMatch[1], 220) : '';
  const rawRisks = riskMatch ? cleanSnippet(riskMatch[1], 220) : '';

  const thesis = rawThesis || (
    verdict === 'AL'
      ? `${ticker}, modelimizin hesapladığı %${Math.abs(discountPct).toFixed(0)} iskonto payı, sermaye maliyetini aşan ROIC performansı ve dengeli bilanço yapısıyla portföy için cazip getiri potansiyeli sunmaktadır.`
      : verdict === 'ALMA'
      ? `${ticker}, daralan kâr marjları, negatif sermaye makası (ROIC < WACC) veya yüksek borç baskısı nedeniyle sermaye kaybı riski taşımakta olup portföye dahil edilmesi önerilmemektedir.`
      : `${ticker}, mevcut piyasa çarpanları ve makro risk dengesi gözetildiğinde adil değerine yakın işlem görmekte olup endekse paralel getiri sunmaktadır.`
  );

  const catalysts = rawCatalysts || '12 aylık ileri projeksiyonlarda hasılat artışı, pazar payı genişlemesi ve operasyonel kâr marjı stabilitesi temel değer katalizörleridir.';
  const risks = rawRisks || 'Makro faiz dalgalanmaları, enflasyon muhasebesi marj etkileri ve çalışma sermayesi nakit tahsilat süreleri temel izleme riskleridir.';

  return { verdict, verdictTitle, thesis, catalysts, risks, isStructured: Boolean(rawThesis || rawCatalysts || rawRisks) };
}

function cleanMarkdown(text: string, decision?: string, stripTrailingVerdict = true): string {
  if (!text) return '';
  let cleaned = text;

  if (decision === 'AL') {
    const nedenAlBlockRegex = /(?:^|\n)(?:[ \t]*>)+[ \t]*(?:⚠️\s*)?\*{0,2}(?:2\.\s*Adli\s+Gerçekler\s*:\s*)?Neden\s*"AL"\s*Verilmedi\?[\s\S]*?(?=(?:\n[ \t]*\n[ \t]*(?:[ \t]*>[ \t]*\*{0,2}Yönetici|##|#|\*\*))|(?:\n[ \t]*##)|$)/gi;
    cleaned = cleaned.replace(nedenAlBlockRegex, '\n\n');
  }

  // Ensure double newlines between run-on decision lines
  cleaned = cleaned.replace(/((?:Analist\s+Karar[ıi]\s*[:=-][^\n]*?))(?=(?:\*{0,2}Yatırım\s+Tezi))/gi, '$1\n\n');
  cleaned = cleaned.replace(/((?:Yatırım\s+Tezi[^\n]*?))(?=(?:\*{0,2}Kilit\s+Katalizörler))/gi, '$1\n\n');
  cleaned = cleaned.replace(/((?:Kilit\s+Katalizörler[^\n]*?))(?=(?:\*{0,2}Riskler\s*(?:&|ve)\s*Emniyet\s*(?:Marjı|Sınırları|Sınırı)))/gi, '$1\n\n');

  cleaned = cleaned.replace(/\*\*\[AL\]\*\*/gi, '**AL**');
  cleaned = cleaned.replace(/\*\*\[ALMA\]\*\*/gi, '**ALMA**');
  cleaned = cleaned.replace(/\*\*\[TUT\]\*\*/gi, '**NÖTR**');
  cleaned = cleaned.replace(/\*\*\[NÖTR\]\*\*/gi, '**NÖTR**');
  cleaned = cleaned.replace(/\[AL\]/g, 'AL');
  cleaned = cleaned.replace(/\[ALMA\]/g, 'ALMA');
  cleaned = cleaned.replace(/\[TUT\]/g, 'NÖTR');
  cleaned = cleaned.replace(/\[NÖTR\]/g, 'NÖTR');
  cleaned = cleaned.replace(/🚨\s*\[KIRMIZI BAYRAK\]\s*ve\s*Yatırım Tezi\s*\(Storytelling\)/gi, '## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ');
  cleaned = cleaned.replace(/🚨\s*\[KIRMIZI BAYRAK\]\s*ve\s*Yatırım Tezi/gi, '## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ');
  cleaned = cleaned.replace(/\[KIRMIZI BAYRAK\]/gi, 'Kritik Tespit:');
  cleaned = cleaned.replace(/\(\s*Storytelling\s*\)/gi, '');
  cleaned = cleaned.replace(/\bStorytelling\b/gi, 'Temel Yatırım Tezi');
  // Bozuk / tek başına kalmış tablo çizgilerini ve "Temel Yatırım Tezi\n|" kalıntılarını temizle
  cleaned = cleaned.replace(/(?:^|\n)\s*(?:Temel\s+Yatırım\s+Tezi|Yatırım\s+Tezi)\s*[:=-]?\s*\n\s*\|[ \t]*(?:\n|$)/gi, '\n');
  cleaned = cleaned.replace(/^\s*\|\s*$/gm, '');
  cleaned = cleaned.replace(/^(?:###|\#)\s*(I{1,3}|IV|V|VI{1,3}|IX|X|[1-9])[\.\:\s\-]+(.*)$/gim, '## $1. $2');
  // Normalize standalone numbered section headers (e.g., "\n\n1. Sigortacılık Bilanço Gücü...\n") that do not end with a period
  cleaned = cleaned.replace(/\n\n([1-9])\.\s+([A-ZÇĞİÖŞÜ][^\n.]{8,95})\n(?=\s*(?:[-*|\n]|\$\$|[A-ZÇĞİÖŞÜ]))/g, '\n\n## $2\n');
  cleaned = cleaned.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_m, g1) => `\n\n$$\n${g1.trim()}\n$$\n\n`);
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, (_match: string, inner: string) => {
    const cleanedInner = inner.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0).join('\n');
    return `\n\n$$\n${cleanedInner}\n$$\n\n`;
  });
  // Remove redundant bin TL parenthetical when preceded by milyar/Mr TL
  cleaned = cleaned.replace(/(\b\d+(?:[.,]\d+)?\s*(?:milyar|Mr)\s*TL)\s*\(\s*[\d.,]+\s*bin\s*TL\s*\)/gi, '$1');

  // Parantez içi İngilizce tanım ve kısaltmaları temizle / Türkçeleştir
  cleaned = cleaned.replace(/\s*\(\s*(?:Operating\s+Leverage|Tangible\s+CapEx|CapEx|Combined\s+Ratio|Bear\s+Case(?:\s+Target)?|Bull\s+Case(?:\s+Target)?|Distressed\s+Turnaround(?:\s+Model)?|Valuation|Asset\s+Trap|Peak\s+Margin|Cash\s+Burn|Rule\s+of\s+40|Forensic\s+Red\s+Team|Float)\s*\)/gi, '');
  cleaned = cleaned.replace(/\(\s*SAFE\s*\)/g, '(Güvenli İskonto Marjı)');
  cleaned = cleaned.replace(/\(\s*BORDERLINE\s*\)/g, '(Sınırda Güvenlik Marjı)');
  cleaned = cleaned.replace(/\(\s*UNSAFE\s*\)/g, '(Yetersiz Güvenlik Marjı)');
  cleaned = cleaned.replace(/\(\s*\*\*((?:[^*]*?(?:Olumlu|Olumsuz|Nötr|İzleme|İzlenmeli|Görünüm|görünüm|Risk|Riski|riski|Kritik|Hassasiyet|Emniyet|asimetri|fırsat)[^*]*?))\*\*\s*\)/gi, '**($1)**');

  // 1. Nakit dönüşüm oranı kuru ifadesini analitik hükme bağla (Insight ekleme)
  if (cleaned.includes('Nakit dönüşüm oranı tahsilat kabiliyetine işaret etmektedir.') && !cleaned.includes('Nakit dönüşüm oranı güçlü tahsilat kabiliyetine')) {
    cleaned = cleaned.replace(
      'Nakit dönüşüm oranı tahsilat kabiliyetine işaret etmektedir.',
      'Nakit dönüşüm oranı güçlü tahsilat kabiliyetine işaret etmekte olup operasyonel kârın kasaya girdiğini ve işletme sermayesi riskini minimize ettiğini teyit etmektedir (Likidite ve Finansal Güç Açısından Olumlu).'
    );
  }

  // 2. V. Bölüm: Sadece 3 senaryo fiyatı listeleyen kuru şablonu gerçek analitik değerlendirmeye dönüştür
  if (cleaned.includes('## V. DEĞER SÜRÜCÜLERİ') && cleaned.includes('Ayı Senaryosu (Taban)') && cleaned.includes('Boğa Senaryosu (Tavan)')) {
    cleaned = cleaned.replace(
      /##\s*V\.\s*DEĞER\s+SÜRÜCÜLERİ[\s\S]*?(?=##\s*VI\.|$)/i,
      (match) => {
        const bearMatch = match.match(/Ayı\s+Senaryosu[^\d]*(\d+(?:[.,]\d+)?\s*TL)/i);
        const bearPrice = bearMatch ? bearMatch[1] : 'Taban Hedef';

        return `## V. DEĞER SÜRÜCÜLERİ VE HASSASİYET ANALİZİ
> Şirketin içsel adil değerini belirleyen operasyonel sürücüler, marj kaldıracı ve senaryo bazlı stres testi duyarlılığı incelenmiştir.

- **1. Hasılat Büyümesi ve Talep Hassasiyeti:** Şirketin 12 aylık ileri büyüme beklentileri, maliyet enflasyonunu satış fiyatlarına yansıtabilme gücü ve pazar payı hakimiyetiyle desteklenmektedir **\(Operasyonel Büyüme Açısından Olumlu\)**.
- **2. Operasyonel Marj Kaldıracı:** Kâr marjlarındaki her 100 baz puanlık (%1,0) iyileşme veya daralma, hisse başı kârlılığı ve adil değeri yaklaşık %4-6 oranında kaldıraçlı etkilemektedir **\(Operasyonel Hassasiyet Açısından Kritik\)**.
- **3. Sermaye Maliyeti (WACC) ve Finansman Hassasiyeti:** Faiz oranlarında veya sermaye maliyetinde yaşanabilecek 100 baz puanlık oynaklık adil değer üzerinde sınırlı (%2-3) bir esneme yaratmaktadır. Şirketin likidite tamponu faiz şoklarına karşı koruma sağlamaktadır **\(Yönetilebilir Finansman Riski\)**.
- **4. Senaryo Bazlı Stres Testi ve Güvenlik Marjı Değerlendirmesi:** Ayı senaryosu taban hedefi (**${bearPrice}**), sektörde operasyonel marjların sert daraldığı ve talep şokunun yaşandığı en ağır kriz koşullarını simüle etmektedir. Mevcut piyasa fiyatının bu tabanın üzerinde seyretmesi, olumsuz makro şoklara karşı yatırımcıya koruyucu bir güvenlik tamponu sunmaktadır **\(Aşağı Yönlü Risk Emniyeti\)**.\n\n`;
      }
    );
  }

  // 3. Eski / Statik Başlıkların Dinamik Başlıklara Temizlenmesi
  cleaned = cleaned.replace(
    /(?:>\s*)?#{0,3}\s*⚠️\s*\*{0,2}2\.\s*Adli\s+Gerçekler\s*:\s*Neden\s*"AL"\s*Verilmedi\?\s*\([^)]*\)\*{0,2}/gi,
    '> ⚠️ **Neden "AL" Verilmedi?**'
  );
  cleaned = cleaned.replace(
    /(?:>\s*)?#{0,3}\s*⚠️\s*\*{0,2}2\.\s*Adli\s+Gerçekler\s*:\s*/gi,
    '> ⚠️ **Neden "AL" Verilmedi?**\n> '
  );
  cleaned = cleaned.replace(
    /(?:>\s*)?#{0,3}\s*⚠️\s*\*{0,2}Adli\s+Denetim\s*&\s*Değer\s+Tuzağı\s+Teşhisi(?:\s*\(Forensic\s+Red\s+Team\))?\s*:?\*{0,2}/gi,
    () => {
      const lower = cleaned.toLowerCase();
      if (lower.includes('gölge holding') || lower.includes('sermaye aktarım') || lower.includes('finansal yatırım')) {
        return '> ⚠️ **Gölge Holdingleşme & Sermaye Tahsisi Riski:**';
      }
      if (lower.includes('tedarikçi borcu') || lower.includes('işletme sermayesi maskeli')) {
        return '> ⚠️ **Tedarikçi Borcuyla Finanse Edilen Nakit Riski:**';
      }
      if (lower.includes('sermaye değer yıkımı') || lower.includes('özkaynak erozyonu') || lower.includes('negatif eva')) {
        return '> ⚠️ **Sermaye Verimliliği & Özkaynak Erozyonu Riski:**';
      }
      if (lower.includes('esas faaliyet zararı') || lower.includes('marj daralması')) {
        return '> ⚠️ **Operasyonel Kârlılık ve Marj Daralması Riski:**';
      }
      if (lower.includes('kaldıraç') || lower.includes('net borç')) {
        return '> ⚠️ **Kritik Borç Yükü ve Kaldıraç Riski:**';
      }
      return '> ⚠️ **Temel Finansal Riskler & Değer Tuzağı Uyarısı:**';
    }
  );

  // Strip trailing unformatted Analist Kararı block from markdown body when rendering cards (it is rendered in 8.2 executive card)
  if (stripTrailingVerdict) {
    cleaned = cleaned.replace(/(?:###?\s*)?\*{0,2}Analist\s+Karar[ıi]\s*[:=-][\s\S]*$/i, '');
  }

  return cleaned.trim();
}

interface ParsedReportChapter {
  id: string;
  roman: string;
  title: string;
  subtitle: string;
  tag: string;
  body: string;
}

function parseReportIntoChapters(markdownText: string): ParsedReportChapter[] {
  if (!markdownText || !markdownText.trim()) return [];

  const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const CHAPTER_META: Record<string, { id: string; subtitle: string; tag: string }> = {
    I: {
      id: 'sec-analist-i',
      subtitle: 'Adil Değer Sentezi, Güvenlik Marjı & Temel Yatırım Tezi',
      tag: 'Yönetici Özeti'
    },
    II: {
      id: 'sec-analist-ii',
      subtitle: 'Operasyonel Nakit Dönüşümü, Sloan Tahakkuk & Serbest Nakit Akışı',
      tag: 'Nakit & Kâr Kalitesi'
    },
    III: {
      id: 'sec-analist-iii',
      subtitle: 'Sektörel Konum, Büyüme Dinamikleri & DuPont 5 Aşamalı Karne',
      tag: 'Rekabet & DuPont'
    },
    IV: {
      id: 'sec-analist-iv',
      subtitle: 'Fisher Reel WACC, EVA Makası & İskontolu Değerleme Modeli',
      tag: 'WACC & Değerleme'
    },
    V: {
      id: 'sec-analist-v',
      subtitle: 'Operasyonel Kaldıraç, Marj Duyarlılığı & Senaryo Stres Testi',
      tag: 'Değer Sürücüleri'
    },
    VI: {
      id: 'sec-analist-vi',
      subtitle: '100 Puanlık Adli Değerleme Matrisi, Riskler & Nihai Karar',
      tag: 'Skor & Riskler'
    }
  };

  const lines = markdownText.split('\n');
  const chapters: ParsedReportChapter[] = [];
  const usedRomans = new Set<string>();
  let introLines: string[] = [];
  let currentHeader: { roman: string; title: string } | null = null;
  let currentBodyLines: string[] = [];

  const flushChapter = () => {
    if (!currentHeader) return;
    let romanKey = currentHeader.roman.toUpperCase();
    if (usedRomans.has(romanKey)) {
      romanKey = ROMAN_NUMERALS[chapters.length] || String(chapters.length + 1);
    }
    usedRomans.add(romanKey);
    const meta = CHAPTER_META[romanKey] || {
      id: `sec-analist-${romanKey.toLowerCase()}`,
      subtitle: 'Kurumsal Finansal ve Adli Değerlendirme',
      tag: `Bölüm ${romanKey}`
    };
    chapters.push({
      id: meta.id,
      roman: romanKey,
      title: currentHeader.title,
      subtitle: meta.subtitle,
      tag: meta.tag,
      body: currentBodyLines.join('\n').trim()
    });
  };

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(?:(I{1,3}|IV|V|VI{1,3}|IX|X|[1-9]|10)[\.\:\-\s]+)?(.+)$/i);
    if (h2Match) {
      if (currentHeader) {
        flushChapter();
      }
      const rawNum = h2Match[1] ? h2Match[1].toUpperCase() : '';
      let roman = '';
      if (rawNum && /^\d+$/.test(rawNum)) {
        const arabicIdx = parseInt(rawNum, 10) - 1;
        roman = ROMAN_NUMERALS[arabicIdx] || rawNum;
      } else if (rawNum) {
        roman = rawNum;
      } else {
        roman = ROMAN_NUMERALS[chapters.length] || String(chapters.length + 1);
      }
      const rawTitle = h2Match[2].trim();
      currentHeader = { roman, title: rawTitle };
      currentBodyLines = [];
      if (introLines.length > 0 && chapters.length === 0) {
        currentBodyLines.push(...introLines, '');
        introLines = [];
      }
    } else {
      if (currentHeader) {
        currentBodyLines.push(line);
      } else {
        introLines.push(line);
      }
    }
  }

  if (currentHeader) {
    flushChapter();
  }

  if (chapters.length === 0) {
    return [
      {
        id: 'sec-analist-i',
        roman: 'I',
        title: 'KURUMSAL ARAŞTIRMA VE DEĞERLEME RAPORU',
        subtitle: 'Detaylı Finansal Tablo, Nakit Akışı ve Adil Değer Analizi',
        tag: 'Tam Rapor',
        body: markdownText.trim()
      }
    ];
  }

  return chapters;
}


interface ErrorBoundaryProps {
  fallbackTitle?: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ComponentErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('SimplyView ErrorBoundary yakaladı:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-rose-950/30 border border-rose-900/60 rounded-xl p-6 text-center my-4 space-y-3">
          <div className="flex items-center justify-center gap-2 text-rose-400 font-semibold text-sm">
            <AlertTriangle className="w-5 h-5" />
            <span>{this.props.fallbackTitle || 'Bileşen Yüklenirken Bir Hata Oluştu'}</span>
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Bu bölümdeki veri görselleştirmesi sırasında beklenmeyen bir durum oluştu ancak diğer analiz sekmeleri ve raporunuz sorunsuz çalışmaya devam etmektedir.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition-colors"
          >
            Yeniden Dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function isMeaningfulKapTargetText(rawText: string): boolean {
  const s = String(rawText || '').trim();
  if (s.length < 35) return false;
  if (/000,00|\bPpt\b/i.test(s)) return false;
  if (/^[\d.,\s%\-–/()]{4,}/.test(s)) return false;
  if (/^\d{1,4}\s+[\d.,]+/.test(s)) return false;
  if (/^[a-zçğıöşü\d.,%\-\s]+/.test(s) && !/^[A-ZÇĞİÖŞÜ]/.test(s)) return false;
  if (/(?:kontrol\s+gücünün\s+olup\s+olmadığını|işbu\s+finansal\s+tablolar|karşılaştırmalı\s+olarak|bilanço\s+sonrası\s+hususlara\s+ilişkin|Girişim\s+Sermayesi\s+Yatırım\s+Ortaklığı|konsolidasyon|TMS\s+\d+|TFRS\s+\d+|IFRS)/i.test(s)) {
    return false;
  }
  const numTokens = s.match(/\b\d+(?:[.,]\d+)?%?\b/g) || [];
  const wordTokens = s.match(/[A-Za-zÇĞİÖŞÜçğıöşü]{3,}/g) || [];
  if (numTokens.length >= 5 && wordTokens.length < numTokens.length * 1.5) return false;
  return true;
}

function cleanKapExcerptForDisplay(rawExcerpt: string): string {
  let s = String(rawExcerpt || '').replace(/\s+/g, ' ').trim();
  // Kelime ortasından kesilen başlangıçları (...icaret A.Ş., ) temizle
  if (/^\.\.\.[a-zçğıöşü]/i.test(s)) {
    const commaOrDot = s.search(/(?:\.\s+|,\s+)(?=[A-ZÇĞİÖŞÜ0-9])/);
    if (commaOrDot > 0 && commaOrDot < 90) {
      s = s.slice(commaOrDot + 2).trim();
    } else {
      s = s.replace(/^\.\.\.\S*\s*/, '').trim();
    }
  }
  // Taşan alt başlıkları ve dipnot referanslarını buda
  s = s
    .replace(/\s+\d+\.\s+(?:Dönem\s+Sonrası|Önemli\s+Gelişmeler|Risk\s+Yönetimi|Sonuç|Giriş|Genel\s+Bilgiler)\b.*$/i, '')
    .replace(/\s+Not\s+\d+\s*[-–:].*$/i, '')
    .replace(/^[\d.,\s•\-–]+(?=[A-ZÇĞİÖŞÜ])/, '')
    .trim();
  if (s && !/[.!?…]$/.test(s) && s.length < 320) {
    s = s.replace(/\.\.\.$/, '').trim();
  }
  return s;
}

function formatKapFindingForDisplay(f: any) {
  const excerpt = cleanKapExcerptForDisplay(f?.excerpt || '');
  const category = String(f?.category || '');
  const rawImpact = String(f?.impact || '').trim();
  const rawTitle = String(f?.title || '').trim();
  const rawSeverity = String(f?.severity || 'INFO').toUpperCase();

  // Rakam/olgu odaklı somut başlık çıkarımı (eski önbellek kayıtlarını da iyileştirir)
  const capexMatch = excerpt.match(/(\d+(?:[.,]\d+)?\s*(?:milyar|milyon)\s*(?:TL|USD|EUR))\s*(?:tutarında\s*)?(?:yatırım\s+harcama|yatırım)/i);
  const storeMatch = excerpt.match(/(?:net\s*)?(\d+)\s*(?:adet\s*)?(?:yeni\s*)?(mağaza|şube|hastane|tesis|fabrika|merkez)/i);
  const isCleanAuditText = /(?:sınırlı\s+denetimden\s+geçmiş|aykırı\s+bir\s+husus\s+tespit\s+edilmemiş|dikkatimizi\s+çeken\s+bir\s+husus\s+bulunmamaktadır|olumlu\s+görüş|işletmenin\s+sürekliliği\s+esasına\s+göre)/i.test(excerpt);
  const hasRealAuditWarning = /(?:şartlı\s+görüş|olumsuz\s+görüş|görüş\s+bildirmekten\s+kaçınma|sürekliliğine\s+ilişkin\s+önemli\s+belirsizlik)/i.test(excerpt);

  let effectiveSeverity = rawSeverity;
  if (category === 'AUDITOR_OPINION' && isCleanAuditText && !hasRealAuditWarning) {
    effectiveSeverity = 'POSITIVE';
  } else if (effectiveSeverity === 'INFO') {
    if (/(?:yeni\s+(?:mağaza|hastane|tesis|fabrika)|yatırım\s+harcaması|kapasite\s+artışı|artış|büyüme|ihracat|yeni\s+sözleşme)/i.test(excerpt) && !/(?:iptal|gecikme|zarar|düşüş)/i.test(excerpt)) {
      effectiveSeverity = 'POSITIVE';
    } else if (/(?:aleyh|ceza|vergi\s+tarhiyat|rehin|ipotek|kefalet|ortaklardan\s+alacak)/i.test(excerpt)) {
      effectiveSeverity = 'MEDIUM';
    }
  }

  let title = rawTitle;
  if (category === 'GUIDANCE_AND_CAPEX' && (storeMatch || capexMatch)) {
    const parts: string[] = [];
    if (storeMatch) parts.push(`${storeMatch[1]} Yeni ${storeMatch[2].charAt(0).toUpperCase() + storeMatch[2].slice(1)}`);
    if (capexMatch) parts.push(`${capexMatch[1]} Yatırım Harcaması`);
    if (parts.length > 0 && (/Görünümü|Yatırım Harcaması ve Büyüme/i.test(rawTitle) || rawTitle.length < 10)) {
      title = parts.join(' • ');
    }
  } else if (category === 'AUDITOR_OPINION' && isCleanAuditText && !hasRealAuditWarning) {
    title = 'Temiz Bağımsız Denetim / İnceleme Görüşü';
  }

  // Belirsiz/kalıp "Etki" metinlerini doğrudan yatırımcı çıktısına çevir
  const isGenericImpact = !rawImpact || /kalitatif\s+dayanağını\s+oluşturur|güvenilirliği\s+ve\s+muhasebe\s+standartlarına|takyidat\s+oranını\s+ve\s+finansal\s+esnekliği|sermaye\s+tahsisi\s+şeffaflığı|karşılık\s+gideri\s+yaratma\s+potansiyeli/i.test(rawImpact);
  let impact = rawImpact;
  if (isGenericImpact) {
    if (category === 'GUIDANCE_AND_CAPEX') {
      const capNote = [storeMatch ? `${storeMatch[1]} yeni ${storeMatch[2]}` : '', capexMatch ? `${capexMatch[1]} yatırım` : ''].filter(Boolean).join(' ve ');
      impact = effectiveSeverity === 'MEDIUM'
        ? 'Olumsuz (Risk) — Operasyonel takvimdeki yavaşlama veya talep daralması önümüzdeki çeyrek ciro ve kârlılık beklentisini baskılayabilir.'
        : `Olumlu (Büyüme Fırsatı) — ${capNote ? `${capNote} adımı` : 'Kapasite ve yatırım genişlemesi'} şirketin satış hacmini büyütür ve orta vadeli ciro artışını destekler; ancak yatırım temposu kısa vadede serbest nakit akışını sınırlayabilir.`;
    } else if (category === 'AUDITOR_OPINION') {
      impact = hasRealAuditWarning
        ? 'Olumsuz (Kritik Risk) — Denetçi raporundaki şerh veya süreklilik belirsizliği bilanço güvenilirliğini doğrudan zedeler ve hisse üzerinde kalıcı iskonto gerektirir.'
        : 'Olumlu — Bağımsız denetim raporunda mali tabloları zedeleyen şerh veya olağandışı uyarı bulunmaması finansal veri güvenilirliğini doğrular.';
    } else if (category === 'LITIGATION_AND_TAX') {
      impact = effectiveSeverity === 'HIGH' || effectiveSeverity === 'MEDIUM'
        ? 'Olumsuz (Risk) — Aleyhte sonuçlanabilecek dava veya vergi cezası ek karşılık ayrılmasına ve bilançodan nakit çıkışına yol açabilir.'
        : 'Olumlu / Sınırlı Risk — Mevcut dava ve ihtilaf kayıtları şirket bilançosunu sarsacak ölçüde kritik bir karşılık baskısı göstermiyor.';
    } else if (category === 'COLLATERAL_AND_OFFBALANCE') {
      impact = effectiveSeverity === 'HIGH' || effectiveSeverity === 'MEDIUM'
        ? 'Dikkat (Bilanço Kısıtı) — Verilen rehin, ipotek ve teminatlar şirket varlıkları üzerinde yük oluşturarak yeni finansman esnekliğini daraltabilir.'
        : 'Dengeli — Bilanço dışı teminat ve rehin taahhütleri olağan ticari faaliyet sınırları içinde görünüyor.';
    } else {
      impact = effectiveSeverity === 'HIGH' || effectiveSeverity === 'MEDIUM'
        ? 'Olumsuz (Yönetişim Riski) — İlişkili taraflara yönelen alacak veya nakit akışı, şirket kaynağının ana faaliyet dışına sızma ihtimalini artırır.'
        : 'İzlenmeli — İlişkili taraf işlemleri olağan ticari çerçevede seyrediyor; vade ve faiz koşulları çeyreklik bilançolarda takip edilmeli.';
    }
  }

  let badgeText = 'OLUMLU • FIRSAT';
  let badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
  let borderLeftClass = 'border-l-emerald-400';
  if (effectiveSeverity === 'HIGH') {
    badgeText = 'OLUMSUZ • TEHLİKE';
    badgeClass = 'bg-rose-500/15 text-rose-300 border-rose-500/35';
    borderLeftClass = 'border-l-rose-500';
  } else if (effectiveSeverity === 'MEDIUM') {
    badgeText = 'DİKKAT • RİSK';
    badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/35';
    borderLeftClass = 'border-l-amber-400';
  } else if (effectiveSeverity === 'INFO') {
    badgeText = 'İZLENMELİ • BİLANÇO';
    badgeClass = 'bg-slate-700/40 text-slate-200 border-slate-600/60';
    borderLeftClass = 'border-l-slate-400';
  }

  return {
    title,
    excerpt,
    impact,
    badgeText,
    badgeClass,
    borderLeftClass
  };
}

export default function SimplyView({
  report,
  savedReports = [],
  valuationInfo,
  marketMultiples,
  companyMultiplesData,
  currentSector: rawCurrentSector,
  sectorMeta: rawSectorMeta,
  latestData,
  chartData,
  quarterlyChartData,
  ttmChartData = [],
  tickerHistory = [],
  portfolioTickers = [],
  favoriteTickers = [],
  initialTab,
  onTogglePortfolio,
  onToggleFavorite,
  onSwitchToTerminal,
  onSelectTicker,
  onAnalyzeTicker,
  onSelectReport
}: SimplyViewProps) {
  const [activeSection, setActiveSection] = useState<SimplySectionId>('sec-ozet');
  const [selectedTableTab, setSelectedTableTab] = useState<'bs' | 'is' | 'cf' | 'ratios'>('bs');
  const [chartPeriodMode, setChartPeriodMode] = useState<'quarterly' | 'ttm'>('quarterly');
  const [reportFontSize, setReportFontSize] = useState<'compact' | 'normal' | 'large'>('normal');
  const [copiedReport, setCopiedReport] = useState(false);
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [showAllDividends, setShowAllDividends] = useState(false);
  const [showBrokerBreakdown, setShowBrokerBreakdown] = useState(false);
  const [showSnowflakeChecklist, setShowSnowflakeChecklist] = useState(false);
  const [selectedSnowflakeFilter, setSelectedSnowflakeFilter] = useState<'all' | 'value' | 'future' | 'past' | 'health' | 'dividend'>('all');
  const [selectedSector, setSelectedSector] = useState<SectorType | 'AUTO'>('AUTO');
  const [simWaccDelta, setSimWaccDelta] = useState<number>(0);
  const [simMarginDelta, setSimMarginDelta] = useState<number>(0);
  const [simGrowthDelta, setSimGrowthDelta] = useState<number>(0);

  const handleSelectReport = useCallback((id: string) => {
    setSelectedSector('AUTO');
    setShowAllDividends(false);
    setShowBrokerBreakdown(false);
    setShowSnowflakeChecklist(false);
    setSelectedSnowflakeFilter('all');
    setSimWaccDelta(0);
    setSimMarginDelta(0);
    setSimGrowthDelta(0);
    if (onSelectReport) {
      onSelectReport(id);
    }
  }, [onSelectReport]);

  // Rapor bazlı izole sektör çözümlemesi:
  // Her rapor yalnızca kendi extracted_data.sector veya kanonik BIST sektörünü kullanır.
  const currentSector: SectorType = useMemo(() => {
    const validSectors: SectorType[] = [
      'INSURANCE', 'BANKING', 'HOLDING', 'REIT', 'TECH', 'INDUSTRIAL',
      'RETAIL', 'AVIATION', 'UTILITIES_TELCO', 'HEALTHCARE', 'FINANCIAL_SERVICES'
    ];
    const reportSec = (
      report.extractedData?.sector ||
      (report as any)?.extracted_data?.sector ||
      report.sector
    ) as SectorType | undefined;
    if (reportSec && validSectors.includes(reportSec)) {
      return reportSec;
    }
    const sym = (report.ticker || '').trim().toUpperCase();
    return detectSector(sym, (report as any)?.companyName || report.extractedData?.company_name) || (selectedSector !== 'AUTO' ? selectedSector : null) || rawCurrentSector || 'INDUSTRIAL';
  }, [report, rawCurrentSector, selectedSector]);

  const sectorMeta = useMemo(() => {
    const sym = (report.ticker || '').trim().toUpperCase();
    return getSectorDefinition(currentSector, sym) || rawSectorMeta;
  }, [currentSector, report.ticker, rawSectorMeta]);

  const isInPortfolio = useMemo(() => {
    return portfolioTickers.includes(report.ticker?.toUpperCase() || '');
  }, [portfolioTickers, report.ticker]);

  const isFavorite = useMemo(() => {
    return favoriteTickers.includes(report.ticker?.toUpperCase() || '');
  }, [favoriteTickers, report.ticker]);

  // Şirket Kartı: Temettü Geçmişi, Analist Konsensüs Hedef Fiyat ve MKK Yabancı Oranı
  const [liveCompanyDetails, setLiveCompanyDetails] = useState<{
    ticker?: string;
    dividends: any[];
    consensus: any;
    foreignShare: any;
    tvConsensus?: any;
  } | null>(null);

  const [liveMarketPrice, setLiveMarketPrice] = useState<number | null>(null);
  const [liveKapQualitativeAudit, setLiveKapQualitativeAudit] = useState<any>(null);
  const [loadingKapQual, setLoadingKapQual] = useState<boolean>(false);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;
    setLiveMarketPrice(null);
    setLiveKapQualitativeAudit(null);
    setLoadingKapQual(false);
    setSimWaccDelta(0);
    setSimMarginDelta(0);
    setSimGrowthDelta(0);
    const upperTicker = report.ticker ? report.ticker.replace(/\.IS$/i, '').toUpperCase().trim() : '';
    const baselineDetails = upperTicker ? OFFICIAL_ISYATIRIM_COMPANY_DETAILS_BASELINE[upperTicker] : null;
    const rawInitialDivs = (Array.isArray(report.dividendHistory) && report.dividendHistory.length > 0)
      ? report.dividendHistory
      : (Array.isArray(report.extractedData?.dividend_history) && report.extractedData.dividend_history.length > 0)
        ? report.extractedData.dividend_history
        : (baselineDetails?.dividends || []);
    const initialConsensus = report.consensusTarget || report.extractedData?.consensus_target || baselineDetails?.consensus || null;
    const initialForeign = report.extractedData?.foreign_share || (marketMultiples?.foreign_share_pct != null ? {
      currentPct: marketMultiples.foreign_share_pct,
      prevPct: marketMultiples.foreign_share_prev_pct,
      changeBps: marketMultiples.foreign_share_change_bps
    } : (baselineDetails?.foreignShare || null));

    setLiveCompanyDetails({
      ticker: upperTicker,
      dividends: rawInitialDivs,
      consensus: initialConsensus,
      foreignShare: initialForeign,
      tvConsensus: (report as any).tvConsensus || null
    });

    if (upperTicker) {
      fetch(`/api/company-details?ticker=${encodeURIComponent(upperTicker)}&refresh=true&t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal
      })
        .then(res => res.json())
        .then(data => {
          if (isMounted && !controller.signal.aborted && data.success) {
            setLiveCompanyDetails({
              ticker: upperTicker,
              dividends: (Array.isArray(data.dividends) && data.dividends.length > 0) ? data.dividends : rawInitialDivs,
              consensus: data.consensus || initialConsensus,
              foreignShare: data.foreignShare || initialForeign,
              tvConsensus: data.tvConsensus || null
            });
          }
        })
        .catch(() => {});

      fetch(`/api/cockpit/card?ticker=${encodeURIComponent(upperTicker)}&range=1G`, {
        cache: 'no-store',
        signal: controller.signal
      })
        .then(res => res.json())
        .then(data => {
          const p = parseFinancialNumber(data?.card?.price);
          if (isMounted && !controller.signal.aborted && data?.success && p != null && Number.isFinite(p) && p > 0) {
            setLiveMarketPrice(p);
          }
        })
        .catch(() => {});

      const existingAudit = report.extractedData?.valuation?.qualitative_risk_audit || report.extractedData?.qualitative_risk_audit;
      if (!existingAudit || existingAudit?.schemaVersion !== 2) {
        setLoadingKapQual(true);
        fetch(`/api/kap-audit?ticker=${encodeURIComponent(upperTicker)}`, {
          cache: 'no-store',
          signal: controller.signal
        })
          .then(res => res.json())
          .then(data => {
            if (isMounted && !controller.signal.aborted && data?.success && data?.audit) {
              setLiveKapQualitativeAudit(data.audit);
            }
          })
          .catch(() => {})
          .finally(() => {
            if (isMounted && !controller.signal.aborted) setLoadingKapQual(false);
          });
      }
    }

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [report.id, report.ticker]);

  // Kanonik Yabancı Takas Payı (3.1 Benchmark ve 3.4 Takas Paneli arasında %100 tam mutabakat)
  const canonicalForeignShare = useMemo(() => {
    const currentPct = liveCompanyDetails?.foreignShare?.currentPct ?? marketMultiples?.foreign_share_pct ?? null;
    const prevPct = liveCompanyDetails?.foreignShare?.prevPct ?? marketMultiples?.foreign_share_prev_pct ?? null;
    const changeBps = liveCompanyDetails?.foreignShare?.changeBps ?? marketMultiples?.foreign_share_change_bps ?? null;
    return {
      currentPct: currentPct != null && !isNaN(Number(currentPct)) ? Number(currentPct) : null,
      prevPct: prevPct != null && !isNaN(Number(prevPct)) ? Number(prevPct) : null,
      changeBps: changeBps != null && !isNaN(Number(changeBps)) ? Number(changeBps) : null
    };
  }, [liveCompanyDetails, marketMultiples]);

  // Kanonik Halka Açıklık Oranı (Fiili Dolaşım Oranı / Free Float)
  const canonicalFreeFloatPct = useMemo(() => {
    const raw = (liveCompanyDetails as any)?.liveMultiples?.freeFloatPct ??
      (liveCompanyDetails as any)?.freeFloatPct ??
      marketMultiples?.free_float_pct ??
      report.extractedData?.market_multiples?.free_float_pct ??
      report.extractedData?.free_float_pct ??
      report.extractedData?.free_float ??
      (report as any)?.free_float_pct ??
      null;
    if (raw != null && !isNaN(Number(raw)) && Number(raw) > 0) {
      return Number(Number(raw).toFixed(1));
    }
    return null;
  }, [liveCompanyDetails, marketMultiples, report.extractedData]);

  // Kurumsal Şirket Profili
  const profile = useMemo(() => {
    return getCompanyProfile(report.ticker, sectorMeta?.title);
  }, [report.ticker, sectorMeta?.title]);

  // Fiyat ve Adil Değer Çözümü (Üst panel canlı piyasa fiyatını yansıtır; Geçmiş paneli ise analiz anındaki fiyatı korur)
  const parsedStaticPrice = parseFinancialNumber(report.price);
  const staticReportPrice = parsedStaticPrice != null && Number.isFinite(parsedStaticPrice) && parsedStaticPrice > 0 ? parsedStaticPrice : 0;
  const currentPriceNum = (liveMarketPrice != null && Number.isFinite(liveMarketPrice) && liveMarketPrice > 0) ? liveMarketPrice : staticReportPrice;
  const parsedFairValue = parseFinancialNumber(valuationInfo?.fair_value ?? report.fairValue);
  const fairValueNum = parsedFairValue != null && Number.isFinite(parsedFairValue) && parsedFairValue > 0 ? parsedFairValue : 0;
  const parsedDiscountPct = parseFinancialNumber(valuationInfo?.discount_pct);
  const discountPctNum = parsedDiscountPct != null && Number.isFinite(parsedDiscountPct) ? parsedDiscountPct : 0;
  const canonicalBearPrice = useMemo(() => {
    const raw = parseFinancialNumber(valuationInfo?.bear_price ?? report.extractedData?.valuation?.bear_price);
    if (raw != null && Number.isFinite(raw) && raw > 0) {
      return Number(raw.toFixed(2));
    }
    if (fairValueNum > 0) return Number((fairValueNum * 0.75).toFixed(2));
    if (currentPriceNum > 0) return Number((currentPriceNum * 0.80).toFixed(2));
    return 0;
  }, [valuationInfo?.bear_price, report.extractedData?.valuation?.bear_price, fairValueNum, currentPriceNum]);
  const effectiveDecision = (
    valuationInfo?.final_decision ||
    valuationInfo?.decision ||
    (report as any)?.extractedData?.optimization?.finalDecision ||
    (report as any)?.extractedData?.valuation?.final_decision ||
    (report as any)?.extractedData?.valuation?.decision ||
    report.decision ||
    'NÖTR'
  );

  // Canlı Piyasa Getiri Performansı (TradingView BIST & Tarihsel Finansal Seriden Dinamik Çözüm)
  const priceReturns = useMemo(() => {
    const tv = liveCompanyDetails?.tvConsensus;
    const r7d = tv?.perfW != null && !isNaN(tv.perfW) ? Number(tv.perfW) : null;
    let r1y = tv?.perfY != null && !isNaN(tv.perfY) ? Number(tv.perfY) : null;

    // 1 Yıllık Getiri için ikincil fallback: Tarihsel finansal tablodaki 1 yıl önceki hisse fiyatı
    if (r1y === null && Array.isArray(chartData) && chartData.length > 3 && currentPriceNum > 0) {
      const latestP = chartData[chartData.length - 1];
      const latestKey = parsePeriodSortKey(latestP?.period);
      if (latestKey > 200000) {
        const targetKey = latestKey - 100;
        const prevYearP = chartData.find(d => parsePeriodSortKey(d?.period) === targetKey);
        const prevPrice = Number(prevYearP?.share_price || 0);
        if (prevPrice > 0) {
          r1y = Number((((currentPriceNum - prevPrice) / prevPrice) * 100).toFixed(1));
        }
      }
    }

    return {
      return7d: r7d,
      return1y: r1y,
      returnYtd: tv?.perfYtd != null && !isNaN(tv.perfYtd) ? Number(tv.perfYtd) : null
    };
  }, [liveCompanyDetails?.tvConsensus, chartData, currentPriceNum]);

  // WACC, ROIC ve EVA Çözümü (TMS 29 Reel WACC ve Terminal ile %100 Senkronize)
  const isFxFunctional = ['THYAO', 'PGSUS', 'TAVHL', 'CLEBI', 'DOCO', 'ENKAI'].includes(String(report.ticker || '').toUpperCase());
  const isTms29 = isFxFunctional ? false : Boolean(latestData?.is_tms29 ?? report.extractedData?.is_tms29 ?? true);
  const realWaccNum = Number(latestData?.real_wacc ?? valuationInfo?.real_wacc ?? (latestData?.wacc ? latestData.wacc - 18 : 11.7));
  const nominalWaccNum = Number(latestData?.nominal_wacc ?? latestData?.wacc ?? valuationInfo?.wacc ?? 42.5);
  const benchmarkWacc = isTms29 && realWaccNum ? realWaccNum : nominalWaccNum;
  const waccNum = benchmarkWacc;

  const roicNum = Number(latestData?.roic ?? valuationInfo?.roic ?? latestData?.roe ?? 0);
  const evaSpreadNum = Number(
    latestData?.eva_spread ??
    valuationInfo?.real_eva_spread ??
    valuationInfo?.eva_spread ??
    Number((roicNum - benchmarkWacc).toFixed(1))
  );

  const [showCashQualityExplainer, setShowCashQualityExplainer] = useState(false);

  // Kâr Kalitesi ve Nakit Dönüşümü (Sloan Tahakkuk & OCF)
  const earningsQuality = useMemo(() => {
    return calculateEarningsQuality(chartData, currentSector);
  }, [chartData, currentSector]);

  // Yönetici Analist Kararı & Yatırım Tezi Çözümü (Tek ve Otoriter Karar Kartı)
  const executiveVerdict = useMemo(() => {
    return parseVerdictNarrative(report.report || '', effectiveDecision, {
      ticker: report.ticker,
      discountPct: discountPctNum
    });
  }, [report.report, effectiveDecision, report.ticker, discountPctNum]);

  // Değer Sürücüleri (12 Ay İleri Hasılat ve Net Kâr Büyümesi vb.)
  const drivers = useMemo(() => {
    const raw = valuationInfo?.drivers || report.extractedData?.fair_value_drivers;

    let rawRevVal = typeof raw?.revenue_growth?.value === 'number' ? raw.revenue_growth.value : 45.0;
    let revNote = raw?.revenue_growth?.note || raw?.revenue_growth?.sourceExplanation || '';
    if (rawRevVal > 80.0) {
      rawRevVal = 75.0;
      revNote = `Aşırı baz etkisi nedeniyle kurumsal sürdürülebilir ciro büyüme tavanına (%75.0) normalize edilmiştir.`;
    } else if (!revNote || revNote.includes('Enflasyon ve pazar payı projeksiyonu')) {
      if (rawRevVal >= 55) {
        revNote = `Yıllık ciro artışı (%${rawRevVal.toFixed(1)}) yüksek enflasyon ve pazar payı kazanımlarıyla güçlü bir büyüme patikasına işaret ediyor.`;
      } else if (rawRevVal >= 30) {
        revNote = `Ciro büyümesi (%${rawRevVal.toFixed(1)}) ılımlı bir reel büyüme temposunu ve dengeli talep koşullarını yansıtıyor.`;
      } else if (rawRevVal >= 10) {
        revNote = `Ciro artışı (%${rawRevVal.toFixed(1)}) reel bazda sınırlı kalarak talep daralması veya ciro baskısına işaret ediyor.`;
      } else {
        revNote = `Cirodaki dönemsel daralma (%${rawRevVal.toFixed(1)}) sektördeki talep daralması ve hacim kaybını ortaya koyuyor.`;
      }
    }

    let rawNetVal = typeof raw?.net_income_growth?.value === 'number' ? raw.net_income_growth.value : 50.0;
    let netNote = raw?.net_income_growth?.note || raw?.net_income_growth?.sourceExplanation || '';
    if (rawNetVal > 80.0) {
      const origJump = rawNetVal;
      rawNetVal = 75.0;
      netNote = `Geçmiş dönemdeki düşük baz etkisi (+%${origJump.toFixed(1)}) nedeniyle ileriye dönük kâr büyümesi sürdürülebilir kurumsal üst sınıra (%75.0) normalize edilmiştir.`;
    } else if (rawNetVal < -60.0) {
      rawNetVal = -50.0;
      netNote = `Dönemsel sert daralma normalize edilerek değerleme tabanı %-50.0 olarak sınırlandırılmıştır.`;
    } else if (!netNote || netNote.includes('Operasyonel kârlılık ve içsel sermaye üretimi')) {
      if (rawNetVal >= 50) {
        netNote = `Net kâr büyümesi (%${rawNetVal.toFixed(1)}) operasyonel kaldıraç ve güçlü marj yönetimi ile kâr üretkenliğinin arttığını teyit ediyor.`;
      } else if (rawNetVal >= 20) {
        netNote = `Kâr üretimi (%${rawNetVal.toFixed(1)}) sermaye maliyetiyle uyumlu, istikrarlı bir içsel kârlılık artışını sürdürüyor.`;
      } else if (rawNetVal >= 0) {
        netNote = `Net kârlılık (%${rawNetVal.toFixed(1)}) enflasyonun gerisinde kalarak reel kâr marjlarında baskı altında seyrediyor.`;
      } else {
        netNote = `Net kârdaki gerileme (%${rawNetVal.toFixed(1)}) artan finansman giderleri ve operasyonel marj baskısını yansıtıyor.`;
      }
    }

    const marginVal = typeof raw?.margin?.value === 'number' ? raw.margin.value : 22.0;
    let marginNote = raw?.margin?.note || raw?.margin?.sourceExplanation || '';
    if (!marginNote || marginNote.includes('Çekirdek faaliyet marjı hedefi')) {
      if (currentSector === 'INSURANCE') {
        marginNote = marginVal <= 95
          ? `Kombine oran (%${marginVal.toFixed(1)}) teknik kârlılığın ve hasar/prim yönetiminin güçlü olduğunu gösteriyor.`
          : `Kombine oran (%${marginVal.toFixed(1)}) teknik denge baskısına işaret ederek yatırım gelirlerine bağımlılığı artırıyor.`;
      } else if (marginVal >= 25) {
        marginNote = `Operasyonel marj (%${marginVal.toFixed(1)}) şirketin sektör ortalamasının üzerinde güçlü bir fiyatlama gücüne ve kâr koruma yeteneğine sahip olduğunu gösteriyor.`;
      } else if (marginVal >= 12) {
        marginNote = `Operasyonel marj (%${marginVal.toFixed(1)}) sürdürülebilir çekirdek faaliyet verimliliği ve dengeli maliyet yapısıyla örtüşüyor.`;
      } else {
        marginNote = `Operasyonel marj (%${marginVal.toFixed(1)}) girdi maliyetleri ve rekabet baskısı nedeniyle sınırlı bir kâr tamponuna işaret ediyor.`;
      }
    }

    const multVal = raw?.target_multiple?.value || '2.5x PD/DD';
    let multNote = raw?.target_multiple?.note || raw?.target_multiple?.sourceExplanation || '';
    if (!multNote || multNote.includes('Sektör ve kârlılık dinamiklerine dayalı hedef çarpan')) {
      multNote = `Adil değer modelimiz, şirketin sermaye getirisi dinamikleri doğrultusunda ${multVal} çarpanını rasyonel denge seviyesi olarak baz almaktadır.`;
    }

    return {
      revenue_growth: {
        label: raw?.revenue_growth?.label || (currentSector === 'INSURANCE' ? 'Prim Büyümesi' : 'Hasılat Büyümesi'),
        value: rawRevVal,
        bearLabel: raw?.revenue_growth?.bearLabel || 'Düşük Büyüme',
        bullLabel: raw?.revenue_growth?.bullLabel || 'Yüksek Büyüme',
        note: revNote
      },
      net_income_growth: {
        label: raw?.net_income_growth?.label || 'Net Kâr Büyümesi',
        value: rawNetVal,
        bearLabel: raw?.net_income_growth?.bearLabel || 'Düşük Kârlılık',
        bullLabel: raw?.net_income_growth?.bullLabel || 'Yüksek Verimlilik',
        note: netNote
      },
      margin: {
        label: raw?.margin?.label || (currentSector === 'INSURANCE' ? 'Kombine Oran Beklentisi' : 'Operasyonel Marj'),
        value: marginVal,
        bearLabel: raw?.margin?.bearLabel || 'Daralan Marj',
        bullLabel: raw?.margin?.bullLabel || 'Fiyatlama Gücü',
        note: marginNote
      },
      target_multiple: {
        label: raw?.target_multiple?.label || 'Hedef Çarpan',
        value: multVal,
        numericValue: typeof raw?.target_multiple?.numericValue === 'number' ? raw.target_multiple.numericValue : 2.5,
        bearLabel: raw?.target_multiple?.bearLabel || 'Muhafazakar Çarpan',
        bullLabel: raw?.target_multiple?.bullLabel || 'Piyasa Primi',
        note: multNote
      }
    };
  }, [valuationInfo?.drivers, report.extractedData?.fair_value_drivers, currentSector]);

  // Çeyreklik Çarpan Trendi Verisi (F/K, PD/DD ve Sektör Referans Çizgileri)
  const quarterlyMultiplesData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const shares = parseFinancialNumber(report.extractedData?.shares_outstanding ?? report.extractedData?.share_count) ?? 0;
    const sectorPe = marketMultiples?.sector_averages?.pe ?? companyMultiplesData?.benchmark?.peMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe ?? 8.5;
    const sectorPb = marketMultiples?.sector_averages?.pb ?? companyMultiplesData?.benchmark?.pbMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pb ?? 2.1;

    const dataSlice = chartData.slice(-8);
    return dataSlice.map((d: any, idx: number) => {
      const isLatestPeriod = idx === dataSlice.length - 1;
      const periodPrice = Number(d.share_price || currentPriceNum || 0);
      const mCap = periodPrice * shares;
      const normCurr = String(report.extractedData?.currency || d.currency || '').trim().toLowerCase();
      const refScale = Math.abs(d.equity ?? d.net_income ?? 0);
      const isBinTry = normCurr.includes('bin') || normCurr.includes('thousand') || (refScale > 0 && refScale < 250_000_000 && shares >= 1_000_000);
      const chartUnitScale = isBinTry ? 1000 : 1;
      const scaledNet = d.net_income != null ? d.net_income * chartUnitScale : null;
      const scaledEquity = d.equity != null ? d.equity * chartUnitScale : null;

      // Kurumsal TTM Net Kâr: Son 12 aylık yuvarlanan net kâr (mevsimsellikten arındırılmış)
      let ttmNet = d.net_income_ttm ?? null;
      if (ttmNet == null && chartData && chartData.length > 0) {
        const pKey = parsePeriodSortKey(d.period);
        const yr = Math.floor(pKey / 100);
        const m = pKey % 100;
        if (m === 12 || m === 0) {
          ttmNet = d.net_income;
        } else if (yr > 2000) {
          const prevEnd = chartData.find((x: any) => parsePeriodSortKey(x.period) === (yr - 1) * 100 + 12);
          const prevMatch = chartData.find((x: any) => parsePeriodSortKey(x.period) === (yr - 1) * 100 + m);
          if (prevEnd?.net_income != null && prevMatch?.net_income != null && d.net_income != null) {
            ttmNet = d.net_income + prevEnd.net_income - prevMatch.net_income;
          }
        }
      }
      if (ttmNet == null) {
        const periodStr = String(d.period || '').toLowerCase();
        let annualFactor = 1.0;
        if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(periodStr)) annualFactor = 4.0;
        else if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(periodStr)) annualFactor = 2.0;
        else if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(periodStr)) annualFactor = 12.0 / 9.0;
        ttmNet = d.net_income != null ? d.net_income * annualFactor : null;
      }

      const scaledTtmNet = ttmNet != null ? ttmNet * chartUnitScale : null;
      let rawPe = (scaledTtmNet && scaledTtmNet > 0 && mCap > 0) ? Number((mCap / scaledTtmNet).toFixed(1)) : null;
      let rawPb = (scaledEquity && scaledEquity > 0 && mCap > 0) ? Number((mCap / scaledEquity).toFixed(1)) : null;

      // Son dönem için İş Yatırım resmi canlı çarpanı veya dinamik rasyoları senkronize et
      const liveDynPe = companyMultiplesData?.multiples?.pe?.companyValue;
      const liveDynPb = companyMultiplesData?.multiples?.pb?.companyValue;
      if (isLatestPeriod && liveDynPe != null && liveDynPe > 0) {
        rawPe = Number(liveDynPe.toFixed(1));
      } else if (isLatestPeriod && marketMultiples?.pe != null && marketMultiples.pe > 0) {
        rawPe = Number(marketMultiples.pe.toFixed(1));
      }
      if (isLatestPeriod && liveDynPb != null && liveDynPb > 0) {
        rawPb = Number(liveDynPb.toFixed(1));
      } else if (isLatestPeriod && marketMultiples?.pb != null && marketMultiples.pb > 0) {
        rawPb = Number(marketMultiples.pb.toFixed(1));
      }

      return {
        period: d.period,
        pe: (rawPe && rawPe > 0 && rawPe < 150) ? rawPe : null,
        pb: (rawPb && rawPb > 0 && rawPb < 25) ? rawPb : null,
        sector_pe: sectorPe,
        sector_pb: sectorPb,
      };
    });
  }, [chartData, report.extractedData, currentPriceNum, currentSector, marketMultiples, companyMultiplesData]);

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
  const officialSectorName = rawOfficialSector || (currentSector === 'INSURANCE' ? 'Sigorta' : (currentSector === 'BANKING' ? 'Bankacılık' : (currentSector === 'REIT' ? 'GYO' : (currentSector === 'HOLDING' ? 'Holdingler' : sectorMeta?.title || 'Sanayi'))));

  // Aynı Sektördeki Resmi BİST Şirketleri (İş Yatırım Sektör Dağılımı ve Akıllı Eşleşme)
  const sameSectorPeers = useMemo(() => {
    const targetTicker = report.ticker.toUpperCase();
    const currentEntry = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[targetTicker];
    const rawTargetSector = (currentEntry?.sectorName || rawOfficialSector || '').trim();

    // Doğrudan İş Yatırım resmi sektör adı üzerinden çalış
    let targetSector = rawTargetSector.toLowerCase();
    const isTargetHolding = targetSector === 'holdingler' || currentSector === 'HOLDING';

    const allInSector: Array<{ ticker: string; name: string; marketCapMnTl: number | null }> = [];

    for (const [tk, item] of Object.entries(OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE)) {
      if (tk.toUpperCase() === targetTicker) continue;
      const itemSec = (item.sectorName || '').trim().toLowerCase();
      const itemName = (item.name || '').toLowerCase();

      // Holding filtresi: Eğer ana şirket bir holding değilse, akran olarak holdingleri ele
      if (!isTargetHolding && (itemSec === 'holdingler' || itemName.includes('yatırım holding') || itemName.includes(' holding'))) {
        continue;
      }

      let matches = false;
      if (targetSector) {
        if (targetSector === 'holdingler') {
          matches = itemSec === 'holdingler';
        } else if (targetSector === 'sigorta') {
          matches = itemSec.includes('sigorta');
        } else if (targetSector === 'bankacılık') {
          matches = itemSec.includes('banka');
        } else if (targetSector === 'gyo') {
          matches = itemSec === 'gyo' || itemSec.includes('gayrimenkul');
        } else if (targetSector.includes('hava')) {
          matches = itemSec.includes('hava');
        } else {
          matches = itemSec === targetSector || itemSec.includes(targetSector) || targetSector.includes(itemSec);
        }
      } else {
        if (currentSector === 'INSURANCE') matches = itemSec.includes('sigorta');
        else if (currentSector === 'BANKING') matches = itemSec.includes('banka');
        else if (currentSector === 'REIT') matches = itemSec === 'gyo' || itemSec.includes('gayrimenkul');
        else if (currentSector === 'HOLDING') matches = itemSec === 'holdingler';
        else if (currentSector === 'AVIATION') matches = itemSec.includes('hava');
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
  }, [rawOfficialSector, currentSector, report.ticker]);

  // Kullanıcının daha önce analiz ettiği akran şirketler (şirket başına en güncel tek rapor, AL -> NÖTR -> ALMA ve puan sırasına göre)
  const analyzedCompetitors = useMemo(() => {
    const peerTickers = new Set(sameSectorPeers.map(p => p.ticker.toUpperCase()));
    const matching = savedReports.filter(
      r => (peerTickers.has(r.ticker?.toUpperCase()) || (r.sector === currentSector && sameSectorPeers.length === 0)) &&
           r.ticker?.toUpperCase() !== report.ticker?.toUpperCase()
    );
    const latestPerTicker = getLatestReportsPerTicker(matching);

    const decisionWeight = (dec?: string): number => {
      const d = String(dec || '').toUpperCase().trim();
      if (d === 'AL' || d === 'GÜÇLÜ AL') return 1;
      if (d === 'NÖTR' || d === 'TUT') return 2;
      if (d === 'ALMA' || d === 'SAT' || d === 'GÜÇLÜ SAT') return 3;
      return 2;
    };

    const extractScore = (sc: any): number => {
      if (typeof sc === 'number') return sc;
      if (typeof sc === 'string') {
        const m = sc.match(/\d+/);
        return m ? parseInt(m[0], 10) : 0;
      }
      return 0;
    };

    return [...latestPerTicker].sort((a, b) => {
      const scA = extractScore(a.score);
      const scB = extractScore(b.score);
      if (scA !== scB) return scB - scA;

      const wA = decisionWeight(a.decision);
      const wB = decisionWeight(b.decision);
      if (wA !== wB) return wA - wB;

      return (Number(b.price) || 0) - (Number(a.price) || 0);
    });
  }, [savedReports, sameSectorPeers, currentSector, report.ticker]);

  // Henüz analiz edilmemiş en büyük 6 akran hisse adayı
  const sectorCandidateTickers = useMemo(() => {
    const analyzedTickers = new Set(savedReports.map(r => r.ticker?.toUpperCase()));
    return sameSectorPeers
      .filter(p => !analyzedTickers.has(p.ticker.toUpperCase()))
      .slice(0, 6)
      .map(p => p.ticker);
  }, [sameSectorPeers, savedReports]);

  // DuPont 5 Aşamalı Hesaplama (Gerçek TTM Akımları ve Özkaynak Verisi ile)
  const dupontResult = useMemo(() => {
    if (!latestData) return calculateDuPont5Step(latestData, currentSector);
    let ttmMetrics: any = null;
    if (chartData && chartData.length > 0) {
      try {
        const calculatedTtm = FinancialRatioEngine.calculateTtmFinancials(chartData, latestData, currentSector, 1.0);
        if (calculatedTtm && calculatedTtm.revenue != null && calculatedTtm.netIncome != null) {
          ttmMetrics = {
            revenue: calculatedTtm.revenue,
            ebitda: calculatedTtm.ebitda,
            operatingProfit: calculatedTtm.operatingProfit,
            ebt: calculatedTtm.ebt,
            interestExpense: calculatedTtm.interestExpenses,
            netIncome: calculatedTtm.netIncome
          };
        }
      } catch (err) {
        console.warn('DuPont TTM hesaplama uyarısı:', err);
      }
    }
    return calculateDuPont5Step(latestData, currentSector, undefined, {
      ttm: ttmMetrics,
      equity: latestData.equity,
      totalAssets: latestData.total_assets
    });
  }, [latestData, chartData, currentSector]);

  // 12A Konsensüs Analist Hedef Fiyatı
  const consensusTargetPrice = useMemo(() => {
    const isy = liveCompanyDetails?.consensus || report.consensusTarget || report.extractedData?.consensus_target;
    const tv = liveCompanyDetails?.tvConsensus;
    const isyTarget = isy?.targetPrice ? Number(isy.targetPrice) : null;
    const tvAvg = tv?.targetPriceAverage ? Number(tv.targetPriceAverage) : null;
    return isyTarget || tvAvg || undefined;
  }, [liveCompanyDetails, report.consensusTarget, report.extractedData]);

  const resolvedDividends = useMemo(() => {
    const upperTicker = report.ticker ? report.ticker.toUpperCase() : '';
    if (
      (!liveCompanyDetails?.ticker || liveCompanyDetails.ticker === upperTicker) &&
      Array.isArray(liveCompanyDetails?.dividends) &&
      liveCompanyDetails.dividends.length > 0
    ) {
      return liveCompanyDetails.dividends;
    }
    if (Array.isArray(report.dividendHistory) && report.dividendHistory.length > 0) {
      return report.dividendHistory;
    }
    if (Array.isArray(report.extractedData?.dividend_history) && report.extractedData.dividend_history.length > 0) {
      return report.extractedData.dividend_history;
    }
    const baselineDivs = upperTicker ? OFFICIAL_ISYATIRIM_COMPANY_DETAILS_BASELINE[upperTicker]?.dividends : null;
    if (Array.isArray(baselineDivs) && baselineDivs.length > 0) {
      return baselineDivs;
    }
    const synthesized = synthesizeDividendsFromHistoryBrowserSafe(
      report.extractedData?.financial_history || chartData,
      Number(report.extractedData?.share_count ?? report.extractedData?.shares_outstanding ?? latestData?.paid_in_capital ?? 0) || null,
      currentPriceNum
    );
    if (synthesized.length > 0) {
      return synthesized;
    }
    return [];
  }, [liveCompanyDetails, report.dividendHistory, report.extractedData, report.ticker, chartData, latestData, currentPriceNum]);

  // Olasılık Ağırlıklı Beklenen Değer (E[V]), Asimetri Oranı & Yarı-Kelly Pozisyon Boyutlandırması
  const probabilisticEdge = useMemo(() => {
    const rawSc = valuationInfo?.score ?? report.score;
    const parsedSc = parseNumericScore(rawSc);
    const safeScore = parsedSc !== null ? parsedSc : 65;
    return calculateProbabilisticExpectedValue({
      currentPrice: currentPriceNum,
      fairValue: fairValueNum,
      bullPrice: valuationInfo?.bull_price,
      bearPrice: valuationInfo?.bear_price,
      totalScore: safeScore,
      evaSpread: evaSpreadNum,
      cashConversionRatio: earningsQuality?.cashConversionRatio,
      isNetCash: Number(latestData?.net_debt ?? 0) <= 0,
      isValueTrap: Boolean(valuationInfo?.is_value_trap),
      decision: effectiveDecision
    });
  }, [
    valuationInfo?.score,
    valuationInfo?.bull_price,
    valuationInfo?.bear_price,
    valuationInfo?.is_value_trap,
    report.score,
    currentPriceNum,
    fairValueNum,
    evaSpreadNum,
    earningsQuality?.cashConversionRatio,
    latestData?.net_debt,
    effectiveDecision
  ]);

  // 4 Çeyreklik Temel İvme & 2. Türev Marj/ROIC Eğimi
  const fundamentalMomentum = useMemo(() => {
    return calculateFundamentalMomentum(chartData, currentSector, realWaccNum, evaSpreadNum);
  }, [chartData, currentSector, realWaccNum, evaSpreadNum]);

  // Kar Tanesi (Snowflake) Analizi Hesabı (5 Eksen, 30 Deterministik Kriter, 0-6 Puan)
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
      unifiedMetrics: (report as any)?.unified_metrics ?? (report.extractedData as any)?.unified_metrics,
      evaSpread: evaSpreadNum,
      roic: roicNum,
      wacc: waccNum,
      latestData,
      consensusTarget: consensusTargetPrice,
      peers: analyzedCompetitors,
      earningsQuality,
      dividends: resolvedDividends,
      dupontResult
    });
  }, [
    report.ticker,
    (report as any)?.unified_metrics,
    report.extractedData,
    currentSector,
    currentPriceNum,
    fairValueNum,
    discountPctNum,
    marketMultiples,
    companyMultiplesData,
    report.extractedData,
    resolvedDividends,
    valuationInfo?.drivers,
    evaSpreadNum,
    roicNum,
    waccNum,
    latestData,
    consensusTargetPrice,
    analyzedCompetitors,
    earningsQuality,
    dupontResult
  ]);

  // Kurumsal Yatırım Tezi, Sektörel Ayrışma ve Fırsat Sentezi Motoru (8.1 Paneli)
  const synthesizedThesis = useMemo(() => {
    const capAlloc = valuationInfo?.capital_allocation_risk ?? analyzeRelatedPartyAndCapitalAllocationRisk(latestData, currentSector, officialSectorName);
    const rawOverrideReason =
      valuationInfo?.override_reason ||
      (report.extractedData as any)?.optimization?.overrideReason ||
      report.overrideReason;
    const resolvedOverrideReason = effectiveDecision === 'AL' ? undefined : rawOverrideReason;
    const resolvedIsValueTrap = Boolean(
      valuationInfo?.is_value_trap ??
      (report.extractedData as any)?.optimization?.isValueTrap ??
      (report.extractedData as any)?.valuation?.is_value_trap ??
      report.isValueTrap
    );
    const resolvedValueTrapReasons =
      valuationInfo?.value_trap_reasons ||
      (report.extractedData as any)?.optimization?.valueTrapReasons ||
      (report.extractedData as any)?.valuation?.value_trap_reasons ||
      report.valueTrapReasons ||
      [];

    return synthesizeInvestmentThesis({
      ticker: report.ticker,
      companyName: profile.fullName,
      decision: effectiveDecision,
      score: valuationInfo?.score ?? (report as any)?.score,
      currentSector,
      officialSectorName,
      currentPrice: currentPriceNum,
      fairValue: fairValueNum,
      discountPct: discountPctNum,
      latestData,
      chartData,
      roic: roicNum,
      wacc: waccNum,
      nominalWacc: nominalWaccNum,
      evaSpread: evaSpreadNum,
      isTms29,
      earningsQuality,
      dupontResult,
      companyMultiplesData,
      marketMultiples,
      drivers,
      capAllocAudit: capAlloc,
      sameSectorPeers,
      consensusTargetPrice,
      overrideReason: resolvedOverrideReason,
      isValueTrap: resolvedIsValueTrap,
      valueTrapReasons: resolvedValueTrapReasons,
      executiveVerdict
    });
  }, [
    report.ticker,
    profile.fullName,
    effectiveDecision,
    valuationInfo?.score,
    (report as any)?.score,
    currentSector,
    officialSectorName,
    currentPriceNum,
    fairValueNum,
    discountPctNum,
    latestData,
    chartData,
    roicNum,
    waccNum,
    nominalWaccNum,
    evaSpreadNum,
    isTms29,
    earningsQuality,
    dupontResult,
    companyMultiplesData,
    marketMultiples,
    drivers,
    valuationInfo?.capital_allocation_risk,
    valuationInfo?.override_reason,
    valuationInfo?.is_value_trap,
    valuationInfo?.value_trap_reasons,
    sameSectorPeers,
    consensusTargetPrice,
    report.overrideReason,
    report.isValueTrap,
    report.valueTrapReasons,
    report.extractedData,
    executiveVerdict
  ]);

  // Kar Tanesi SVG Koordinatları (280x280 viewBox, cx=140, cy=140, maxRadius=95)
  const radarPoints = useMemo(() => {
    return getSnowflakeCoordinates(snowflake.axes, 140, 140, 95);
  }, [snowflake.axes]);

  const smoothRadarPath = useMemo(() => {
    return generateSmoothSnowflakePath(radarPoints);
  }, [radarPoints]);

  // Kar Tanesi Dinamik Renk & Tonlama
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

  // Snowflake 30 Kriter Listesi (Tüm Eksenlerin Birleşik Dizisi)
  const allSnowflakeChecks = useMemo(() => {
    const list: Array<{
      axisKey: 'value' | 'future' | 'past' | 'health' | 'dividend';
      axisLabel: string;
      check: SnowflakeCheck;
    }> = [];
    const axes = [
      snowflake.axes.value,
      snowflake.axes.future,
      snowflake.axes.past,
      snowflake.axes.health,
      snowflake.axes.dividend
    ];
    axes.forEach(axis => {
      if (axis && Array.isArray(axis.checks)) {
        axis.checks.forEach(check => {
          list.push({ axisKey: axis.key, axisLabel: axis.label, check });
        });
      }
    });
    return list;
  }, [snowflake.axes]);

  const filteredSnowflakeChecks = useMemo(() => {
    if (selectedSnowflakeFilter === 'all') return allSnowflakeChecks;
    return allSnowflakeChecks.filter(item => item.axisKey === selectedSnowflakeFilter);
  }, [allSnowflakeChecks, selectedSnowflakeFilter]);

  const [collapsedReportChapters, setCollapsedReportChapters] = useState<Record<string, boolean>>({});
  const toggleReportChapter = useCallback((chapterId: string) => {
    setCollapsedReportChapters(prev => ({ ...prev, [chapterId]: !prev[chapterId] }));
  }, []);

  const [expandedThesisPillars, setExpandedThesisPillars] = useState<Record<string, boolean>>({});
  const toggleThesisPillar = useCallback((pillarId: string) => {
    setExpandedThesisPillars(prev => ({ ...prev, [pillarId]: !prev[pillarId] }));
  }, []);

  const [expandedChecklistItems, setExpandedChecklistItems] = useState<Record<string, boolean>>({});
  const toggleChecklistItem = useCallback((itemKey: string) => {
    setExpandedChecklistItems(prev => ({ ...prev, [itemKey]: !prev[itemKey] }));
  }, []);

  const reportChapters = useMemo(() => {
    return parseReportIntoChapters(cleanMarkdown(report.report || '', effectiveDecision));
  }, [report.report, effectiveDecision]);

  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scrollspy: window ve main-scroll-container dinlenir
  useEffect(() => {
    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) return;

      const sections: Array<{ id: SimplySectionId; el: HTMLElement | null }> = [
        { id: 'sec-ozet', el: document.getElementById('sec-ozet') },
        { id: 'sec-grafikler', el: document.getElementById('sec-grafikler') },
        { id: 'sec-tablolar', el: document.getElementById('sec-tablolar') },
        { id: 'sec-carpanlar', el: document.getElementById('sec-carpanlar') },
        { id: 'sec-adildeger', el: document.getElementById('sec-adildeger') },
        { id: 'sec-temettu', el: document.getElementById('sec-temettu') },
        { id: 'sec-rehberlik', el: document.getElementById('sec-rehberlik') },
        { id: 'sec-yatirim-tezi', el: document.getElementById('sec-yatirim-tezi') },
        { id: 'sec-analist', el: document.getElementById('sec-analist') },
        { id: 'sec-gecmis', el: document.getElementById('sec-gecmis') },
      ];

      // Sayfanın en altına ulaşıldıysa ve son bölüm (sec-gecmis) görünürdeyse onu aktif yap
      const docEl = document.documentElement;
      const isAtPageBottom = window.innerHeight + window.scrollY >= (docEl.scrollHeight || document.body.scrollHeight) - 48;
      const lastSec = sections[sections.length - 1];
      if (isAtPageBottom && lastSec?.el) {
        const lastRect = lastSec.el.getBoundingClientRect();
        if (lastRect.top < window.innerHeight) {
          setActiveSection(lastSec.id);
          return;
        }
      }

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
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
    };
  }, []);

  const [highlightedTargetId, setHighlightedTargetId] = useState<string | null>(null);
  const [pendingCrossRef, setPendingCrossRef] = useState<{ sectionId: SimplySectionId; highlightId?: string; seq: number } | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerHighlight = useCallback((targetId: string) => {
    setHighlightedTargetId(targetId);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedTargetId(null);
    }, 2800);
  }, []);

  const scrollToSection = useCallback((id: SimplySectionId) => {
    const el = document.getElementById(id);
    if (el) {
      isProgrammaticScrollRef.current = true;
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
      programmaticScrollTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 650);

      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      const yOffset = isMobile ? -112 : -76;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      setActiveSection(id);
    }
  }, []);

  const scrollToDomId = useCallback((domId: string, parentSection?: SimplySectionId) => {
    const el = document.getElementById(domId);
    if (el) {
      isProgrammaticScrollRef.current = true;
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
      programmaticScrollTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 650);

      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      const yOffset = isMobile ? -156 : -116;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      if (parentSection) {
        setActiveSection(parentSection);
      }
    }
  }, []);

  // Rapor açıldığında veya değiştiğinde sayfa daima en baştan (sec-ozet) başlasın ve geçici UI durumları sıfırlansın
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const container = document.getElementById('main-scroll-container');
      if (container) {
        container.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    }
    setActiveSection('sec-ozet');
    setSelectedSnowflakeFilter('all');
    setShowAllDividends(false);
    setShowBrokerBreakdown(false);
    setShowSnowflakeChecklist(false);
    setShowCashQualityExplainer(false);
    setHoveredRowKey(null);
    setCollapsedReportChapters({});
    setExpandedThesisPillars({});
    setExpandedChecklistItems({});
    setHighlightedTargetId(null);
    setPendingCrossRef(null);
    setPeriodOffset(0);
    setSelectedTableTab('bs');
    setCollapsedSections({});
    setSelectedSector('AUTO');
    setIsCapAllocExpanded(false);
    setShowAllPeers(false);
    setChartPeriodMode('quarterly');
  }, [report.id, report.ticker]);

  // Çapraz referans link tıklandığında tab ve akordeon render edildikten sonra rAF ile hedefe kaydır
  useEffect(() => {
    if (!pendingCrossRef) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (pendingCrossRef.highlightId && document.getElementById(pendingCrossRef.highlightId)) {
          scrollToDomId(pendingCrossRef.highlightId, pendingCrossRef.sectionId);
        } else {
          scrollToSection(pendingCrossRef.sectionId);
        }
      });
    });
    return () => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [pendingCrossRef, scrollToDomId, scrollToSection]);

  // URL rotasından (initialTab) gelen hedef sekmeye ilk açılışta kaydır
  useEffect(() => {
    if (!initialTab || initialTab === 'ozet' || initialTab === 'overview') return;
    const tabToSection: Partial<Record<NonNullable<SimplyViewProps['initialTab']>, SimplySectionId>> = {
      fairvalue: 'sec-adildeger',
      tables: 'sec-tablolar',
      multiples: 'sec-carpanlar',
      proscons: 'sec-yatirim-tezi',
      guidance: 'sec-rehberlik',
      report: 'sec-analist',
      history: 'sec-gecmis',
    };
    const targetSec = tabToSection[initialTab];
    if (!targetSec) return;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        scrollToSection(targetSec);
      });
    });
    return () => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [report.id, initialTab, scrollToSection]);

  // 8.1 Rapor İçi Anlamsal İfade Renklendirici (Tek Yazı Tipi/Boyut, Kutusuz ve Emojisiz)
  const renderSemanticEvalBadge = useCallback((phrase: string, key?: string | number) => {
    const isNegative = /(?:Olumsuz|Yüksek\s+(?:Finansal\s+)?Risk|Sermaye\s+Erozyonu|Değer\s+Tuzağı|zayıf\/olumsuz|temkinli\/olumsuz|yüksek\s+riskli|Yetersiz\s+Güvenlik\s+Marjı|güvenlik\s+marjı\s+bulunmamaktadır)/i.test(phrase);
    const isNeutral = !isNegative && /(?:Nötr|Koşullu\s+[iİ]zleme|Bekle-Gör|Dengeli(?:\s*\/\s*Ilımlı)?\s+görünüm|temkinli\s+[iİ]zlenmeli|temkinli\s+[iİ]zlenmesi\s+gereken|Yönetilebilir\s+(?:faiz|Finansman)\s+riski|Açısından\s+Kritik|Kaldıraç\s+Hassasiyeti|Yüksek\s+risk-ödül\s+asimetrisi|orta\s+vadede\s+nötr|Sınırda\s+Güvenlik\s+Marjı|Hedefin\s+Altında)/i.test(phrase);

    if (isNegative) {
      return (
        <span key={key} className="text-rose-400 font-medium">
          {phrase}
        </span>
      );
    }
    if (isNeutral) {
      return (
        <span key={key} className="text-amber-300 font-medium">
          {phrase}
        </span>
      );
    }
    return (
      <span key={key} className="text-emerald-400 font-medium">
        {phrase}
      </span>
    );
  }, []);

  // 8.1 Rapor İçi Çapraz Referans Hedef Çözümleyici
  const resolveCrossReferenceTarget = useCallback((term: string): {
    sectionId: SimplySectionId;
    label: string;
    tableTab?: 'bs' | 'is' | 'cf' | 'ratios';
    highlightId?: string;
    accordionSecId?: string;
    accordionSecIds?: string[];
  } | null => {
    // 0. Bileşik Oranlar (bölünmeden önce tam eşleşme)
    if (/Net\s+Borç\s*\/\s*(?:FAVÖK|EBITDA)/i.test(term)) {
      return {
        sectionId: 'sec-tablolar',
        tableTab: 'ratios',
        highlightId: 'fin-row-debt_to_ebitda',
        accordionSecId: 'borcluluk',
        label: 'Rasyolar Tablosu: Net Borç / FAVÖK',
      };
    }

    // 1. Nakit Akışı Tablosu Kalemleri (sekme: 'cf')
    if (/Net\s+[iİ]şletme\s+Nakit\s+Akışı|[iİ]şletme\s+Nakit\s+Akışı(?:\s*\(OCF\))?/i.test(term)) {
      return {
        sectionId: 'sec-tablolar',
        tableTab: 'cf',
        highlightId: 'fin-row-operating_cash_flow',
        accordionSecId: 'isletme',
        label: 'Nakit Akışı Tablosu: Net İşletme Nakit Akışı (OCF)',
      };
    }
    if (/Serbest\s+Nakit\s+Akışı(?:\s*\(FCF\))?/i.test(term)) {
      return {
        sectionId: 'sec-tablolar',
        tableTab: 'cf',
        highlightId: 'fin-row-free_cash_flow',
        accordionSecId: 'yatirim',
        label: 'Nakit Akışı Tablosu: Serbest Nakit Akışı (FCF)',
      };
    }
    if (/Maddi\s+Duran\s+Varlık\s+Yatırımları|Yatırım\s+Harcamaları|\bCapEx\b/i.test(term)) {
      return {
        sectionId: 'sec-tablolar',
        tableTab: 'cf',
        highlightId: 'fin-row-capex',
        accordionSecId: 'yatirim',
        label: 'Nakit Akışı Tablosu: Maddi & Maddi Olmayan Duran Varlık Alımları (CapEx)',
      };
    }
    if (/[iİ]şletme\s+[Ss]ermayesi|[Çç]alışma\s+[Ss]ermayesi/i.test(term)) {
      return {
        sectionId: 'sec-tablolar',
        tableTab: 'cf',
        highlightId: 'fin-row-working_capital_change',
        accordionSecId: 'isletme',
        label: 'Nakit Akışı Tablosu: İşletme Sermayesindeki Net Değişimler',
      };
    }

    // 2. Bilanço Tablosu Kalemleri (sekme: 'bs')
    if (/Net\s+Borç/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'bs', highlightId: 'fin-row-net_debt', accordionSecId: 'uvy', label: 'Bilanço: Net Borç' };
    }
    if (/Uzun\s+Vadeli\s+Finansal\s+Borç/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'bs', highlightId: 'fin-row-long_term_debt', accordionSecId: 'uvy', label: 'Bilanço: Uzun Vadeli Finansal Borçlar' };
    }
    if (/Kısa\s+Vadeli\s+Finansal\s+Borç|Finansal\s+Borç/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'bs', highlightId: 'fin-row-short_term_debt', accordionSecIds: ['kvy', 'uvy'], label: 'Bilanço: Finansal Borçlar' };
    }
    if (/Özkaynak|Özsermaye/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'bs', highlightId: 'fin-row-equity', accordionSecId: 'ozkaynak', label: 'Bilanço: Ana Ortaklık Özkaynakları' };
    }
    if (/Ticari\s+Alacaklar/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'bs', highlightId: 'fin-row-trade_receivables', accordionSecId: 'donen', label: 'Bilanço: Ticari Alacaklar' };
    }
    if (/Stoklar/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'bs', highlightId: 'fin-row-inventories', accordionSecId: 'donen', label: 'Bilanço: Stoklar' };
    }
    if (/Bilanço|Finansal\s+Tablolar/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'bs', highlightId: 'sec-tablolar', label: 'Bölüm 3: Bilanço & Finansal Tablolara Git' };
    }

    // 3. Gelir Tablosu Kalemleri (sekme: 'is')
    if (/Satış\s+Gelirleri|Hasılat/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'is', highlightId: 'fin-row-revenue', accordionSecId: 'hasilat', label: 'Gelir Tablosu: Satış Gelirleri (Hasılat)' };
    }
    if (/Brüt\s+Kâr/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'is', highlightId: 'fin-row-gross_profit', accordionSecId: 'hasilat', label: 'Gelir Tablosu: Brüt Kâr' };
    }
    if (/Esas\s+Faaliyet\s+Kârı|\bEBIT\b/i.test(term)) {
      return {
        sectionId: 'sec-tablolar',
        tableTab: 'is',
        highlightId: currentSector === 'INSURANCE' ? 'fin-row-ebitda' : 'fin-row-operating_profit',
        accordionSecId: 'faaliyet',
        label: currentSector === 'INSURANCE' ? 'Gelir Tablosu: Teknik Bölüm Kârı / Dengesi' : 'Gelir Tablosu: Esas Faaliyet Kârı (EBIT)'
      };
    }
    if (/\bFAVÖK\b|\bEBITDA\b/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'is', highlightId: 'fin-row-ebitda', accordionSecId: 'faaliyet', label: 'Gelir Tablosu: FAVÖK (EBITDA)' };
    }
    if (/Net\s+Dönem\s+Kârı|Net\s+Kâr/i.test(term)) {
      return { sectionId: 'sec-tablolar', tableTab: 'is', highlightId: 'fin-row-net_income', accordionSecId: 'finansman', label: 'Gelir Tablosu: Net Dönem Kârı' };
    }

    // 4. Diğer Bölüm Hedefleri
    if (/DuPont|Nakit\s+[Aa]kışı\s+[Kk]alitesi|Nakit\s+[Dd]önüşüm\s+[Oo]ranı|Sloan\s+Tahakkuk/i.test(term)) {
      return { sectionId: 'sec-grafikler', highlightId: 'sec-grafikler', label: 'Bölüm 2: Grafik, Nakit Kalitesi & DuPont Analizine Git' };
    }
    if (/Değerleme\s+Çarpanları|Sektör\s+Çarpanları|Hedef\s+Çarpan|(?:Cari\s+)?PD\/DD|(?:Cari\s+)?F\/K|FD\/FAVÖK|FD\/Satışlar/i.test(term)) {
      return { sectionId: 'sec-carpanlar', highlightId: 'sec-carpanlar', label: 'Bölüm 4: Değerleme Çarpanları & Sektör Kıyaslamasına Git' };
    }
    if (/Reel\s+WACC|Gordon\s+Büyüme\s+Modeli|[iİ]ndirgenmiş\s+Nakit\s+Akışı|Reel\s+EVA\s+Makası|Ayı\s+[Ss]enaryosu|Boğa\s+[Ss]enaryosu/i.test(term)) {
      return { sectionId: 'sec-adildeger', highlightId: 'sec-adildeger', label: 'Bölüm 5: Adil Değer & Sermaye Maliyeti Modeline Git' };
    }
    if (/Temettü|Kâr\s+Payı/i.test(term)) {
      return { sectionId: 'sec-temettu', highlightId: 'sec-temettu', label: 'Bölüm 6: Temettü Analizine Git' };
    }
    return null;
  }, [currentSector]);

  const navigateToCrossRef = useCallback((refTarget: {
    sectionId: SimplySectionId;
    tableTab?: 'bs' | 'is' | 'cf' | 'ratios';
    highlightId?: string;
    accordionSecId?: string;
    accordionSecIds?: string[];
  }) => {
    if (refTarget.tableTab) {
      setSelectedTableTab(refTarget.tableTab);
    }
    const toOpen = [
      ...(refTarget.accordionSecId ? [refTarget.accordionSecId] : []),
      ...(refTarget.accordionSecIds || [])
    ];
    if (toOpen.length > 0) {
      setCollapsedSections(prev => {
        const next = { ...prev };
        for (const accId of toOpen) {
          next[accId] = false;
        }
        return next;
      });
    }
    const targetDomId = refTarget.highlightId || refTarget.sectionId;
    triggerHighlight(targetDomId);
    setPendingCrossRef({
      sectionId: refTarget.sectionId,
      highlightId: refTarget.highlightId,
      seq: Date.now(),
    });
  }, [triggerHighlight]);

  // 8.1 Rapor Düz Metin Segmenti Zenginleştirici (Fiyatlar, Getiri/İskonto, Parantez İçi Yargılar ve Çapraz Referans Linkleri)
  const enrichPlainTextSegment = useCallback((text: string, keyPrefix = 'seg'): React.ReactNode => {
    if (!text || text.length < 2) return text;

    const combinedRegex = /(\(\s*(?:Güçlü\s+Alım\s+Tezi[^)]*|[^()]*Açısından\s+(?:Olumlu|Olumsuz|Kritik|Zayıf\/Olumsuz)[^)]*|[^()]*açısından\s+(?:olumlu|olumsuz|temkinli[^)]*|zayıf\/olumsuz)[^)]*|Aşağı\s+yönlü\s+risk\s+(?:sınırlı|emniyeti)[^)]*|Faiz\s+şoklarına\s+karşı\s+korumalı[^)]*|Nötr\s*\/[^)]*|Dengeli(?:\s*\/\s*Ilımlı)?\s+görünüm|Yönetilebilir\s+(?:faiz|Finansman)\s+riski|Operasyonel\s+Kaldıraç\s+Hassasiyeti|Yüksek\s+risk-ödül\s+asimetrisi|Kısa\s+vadede\s+temkinli[^)]*|Güvenli\s+[iİ]skonto\s+Marjı|Sınırda\s+Güvenlik\s+Marjı|Yetersiz\s+Güvenlik\s+Marjı|güvenlik\s+marjı\s+bulunmamaktadır)\s*\))|((?:(?:[+-]\s*)?%\s*[+-]?\d+(?:[.,]\d+)?\s*(?:getiri\s+potansiyeli(?:\s*\((?:[iİ]skonto|prim)\))?|yükseliş\s+potansiyeli|güvenlik\s+marjı|[iİ]skonto\s+payı|[iİ]skontolu(?:dur)?|[iİ]skonto(?:su|yla)?|potansiyel(?:i|ine|ini|dir)?|primli(?:dir)?|prim(?:i|le)?|üzerinde(?:dir)?)|[+-]\d+(?:[.,]\d+)?\s*puan(?:\s+(?:pozitif|negatif)\s+(?:ekonomik\s+katma\s+değer|EVA))?|%\s*-\d+(?:[.,]\d+)?|-\s*%\s*\d+(?:[.,]\d+)?))|((?:[+-]\s*)?(?:₺\s*\d[\d.,]*(?:\s*(?:Milyar|Milyon|Mr|Mn|Bin))?|\d[\d.,]*\s*(?:Milyar|Milyon|Mr|Mn|Bin)\s*TL\b|\d[\d.,]*\s*TL\b))|((?<![a-zA-Z0-9_çğıöşüÇĞİÖŞÜ])(?:DuPont(?:\s+5\s+[Aa]şamalı|\s+[Aa]nalizi|\s+[Aa]yrıştırması|\s+ROE|\s+[Vv]erimlilik)?|Net\s+Borç\s*\/\s*(?:FAVÖK|EBITDA)|Net\s+[iİ]şletme\s+Nakit\s+Akışı|[iİ]şletme\s+Nakit\s+Akışı(?:\s*\(OCF\))?|Serbest\s+Nakit\s+Akışı(?:\s*\(FCF\))?|Maddi\s+Duran\s+Varlık\s+Yatırımları|Yatırım\s+Harcamaları|CapEx|Nakit\s+[Aa]kışı\s+[Kk]alitesi|Nakit\s+[Dd]önüşüm\s+[Oo]ranı|Sloan\s+Tahakkuk|Net\s+Borç|Uzun\s+Vadeli\s+Finansal\s+Borç(?:ları|lar)?|Kısa\s+Vadeli\s+Finansal\s+Borç(?:ları|lar)?|Finansal\s+Borç(?:ları|lar)?|Özkaynak(?:lar|ları|ta|taki)?|Özsermaye(?:sini|si)?|Ticari\s+Alacaklar|Stoklar|Satış\s+Gelirleri|Hasılat(?:ı|ın)?|Brüt\s+Kâr(?:ı|ın)?|Esas\s+Faaliyet\s+Kârı|Net\s+Dönem\s+Kârı|Net\s+Kâr(?:ı|ın)?|FAVÖK|EBITDA|Bilanço(?:da|daki|su|sunda|sundaki)?|Finansal\s+Tablolar|[iİ]şletme\s+[Ss]ermayesi|[Çç]alışma\s+[Ss]ermayesi|Değerleme\s+Çarpanları|Sektör\s+Çarpanları|Hedef\s+Çarpan|(?:Cari\s+)?PD\/DD|(?:Cari\s+)?F\/K|FD\/FAVÖK|FD\/Satışlar|Gordon\s+Büyüme\s+Modeli|[iİ]ndirgenmiş\s+Nakit\s+Akışı|Reel\s+WACC|Reel\s+EVA\s+Makası|Ayı\s+[Ss]enaryosu(?:\s+[Tt]aban\s+(?:[Ff]iyatı|[Hh]edefi))?|Boğa\s+[Ss]enaryosu(?:\s+[Tt]avan\s+(?:[Ff]iyatı|[Hh]edefi))?|Temettü(?:\s+verimi|\s+dağıtım\s+kapasitesini)?|Kâr\s+Payı)(?![a-zA-Z0-9_çğıöşüÇĞİÖŞÜ]))|((?:\+%\d+(?:[.,]\d+)?|%\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?|(?<![a-zA-Z0-9_çğıöşüÇĞİÖŞÜ])\d+(?:[.,]\d+)?x(?![a-zA-Z0-9_çğıöşüÇĞİÖŞÜ])))/gi;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let tokenIdx = 0;

    while ((match = combinedRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const fullMatch = match[0];
      const evalParen = match[1];
      const returnOrDiscount = match[2];
      const currencyVal = match[3];
      const crossRef = match[4];
      const metricVal = match[5];
      const key = `${keyPrefix}-${tokenIdx++}`;

      if (evalParen) {
        parts.push(renderSemanticEvalBadge(fullMatch, key));
      } else if (returnOrDiscount) {
        const isNeg = /(?:^\s*-|%\s*-|prim|negatif|zarar|daralma)/i.test(fullMatch);
        parts.push(
          <span
            key={key}
            className={isNeg ? 'text-rose-400 font-medium' : 'text-emerald-400 font-medium'}
          >
            {fullMatch}
          </span>
        );
      } else if (currencyVal) {
        parts.push(
          <span key={key} className="text-[#f5c242] font-medium">
            {fullMatch}
          </span>
        );
      } else if (crossRef) {
        const refTarget = resolveCrossReferenceTarget(fullMatch);
        if (refTarget) {
          parts.push(
            <button
              key={key}
              type="button"
              onClick={() => navigateToCrossRef(refTarget)}
              title={refTarget.label}
              className="inline text-cyan-300 hover:text-[#f5c242] underline decoration-cyan-500/40 hover:decoration-[#f5c242] underline-offset-4 font-medium transition-colors cursor-pointer"
            >
              {fullMatch}
            </button>
          );
        } else {
          parts.push(fullMatch);
        }
      } else if (metricVal) {
        const isPosSigned = fullMatch.startsWith('+%');
        parts.push(
          <span key={key} className={isPosSigned ? 'text-emerald-400 font-medium' : 'text-cyan-300 font-medium'}>
            {fullMatch}
          </span>
        );
      } else {
        parts.push(fullMatch);
      }

      lastIndex = combinedRegex.lastIndex;
    }

    if (lastIndex === 0) return text;
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  }, [renderSemanticEvalBadge, resolveCrossReferenceTarget, navigateToCrossRef]);

  const enrichReportNode = useCallback((node: React.ReactNode, keyPrefix = 'rn'): React.ReactNode => {
    if (typeof node === 'string') {
      return enrichPlainTextSegment(node, keyPrefix);
    }
    if (Array.isArray(node)) {
      return node.map((child, idx) => (
        <React.Fragment key={`${keyPrefix}-${idx}`}>
          {enrichReportNode(child, `${keyPrefix}-${idx}`)}
        </React.Fragment>
      ));
    }
    if (React.isValidElement(node) && (node.props as any)?.children != null) {
      return React.cloneElement(
        node as React.ReactElement<any>,
        undefined,
        enrichReportNode((node.props as any).children, `${keyPrefix}-el`)
      );
    }
    return node;
  }, [enrichPlainTextSegment]);

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
    const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const pctOrNull = (num: unknown, den: unknown, scale = 1): number | null => {
      if (!fin(num) || !fin(den) || den <= 0) return null;
      const res = Number(((num / den) * scale).toFixed(1));
      return Number.isFinite(res) ? res : null;
    };
    return [
      {
        id: 'gross_margin',
        title: 'Brüt Kâr Marjı',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: pctOrNull(d.gross_profit, d.revenue, 100)
        })),
        format: (v: number) => Number.isFinite(v) ? `%${v.toFixed(1)}` : '—'
      },
      {
        id: 'ebitda_margin',
        title: currentSector === 'INSURANCE' ? 'Teknik Kâr Marjı' : 'FAVÖK Marjı',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: pctOrNull(d.ebitda, d.revenue, 100)
        })),
        format: (v: number) => Number.isFinite(v) ? `%${v.toFixed(1)}` : '—'
      },
      {
        id: 'net_margin',
        title: 'Net Kâr Marjı',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: pctOrNull(d.net_income, d.revenue, 100)
        })),
        format: (v: number) => Number.isFinite(v) ? `%${v.toFixed(1)}` : '—'
      },
      {
        id: 'current_ratio',
        title: 'Cari Oran',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: fin(d.current_assets) && fin(d.current_liabilities) && d.current_liabilities > 0
            ? Number((d.current_assets / d.current_liabilities).toFixed(2))
            : null
        })),
        format: (v: number) => Number.isFinite(v) ? `${v.toFixed(2)}x` : '—'
      },
      {
        id: 'leverage',
        title: 'Borç / Özkaynak',
        data: series.map(d => {
          const debtVal = fin(d.financial_debt) ? d.financial_debt : (fin(d.total_debt) ? d.total_debt : null);
          return {
            period: d.period ? d.period.slice(2) : '',
            val: pctOrNull(debtVal, d.equity, 100)
          };
        }),
        format: (v: number) => Number.isFinite(v) ? `%${v.toFixed(1)}` : '—'
      },
      {
        id: 'roe',
        title: 'Özkaynak Kârlılığı',
        data: series.map((d, idx) => {
          const isLatest = idx === series.length - 1;
          if (isLatest && dupontResult?.calculatedRoe != null && Number.isFinite(dupontResult.calculatedRoe)) {
            return {
              period: d.period ? d.period.slice(2) : '',
              val: dupontResult.calculatedRoe
            };
          }
          if (d.roe != null && Number.isFinite(Number(d.roe))) {
            return {
              period: d.period ? d.period.slice(2) : '',
              val: Number(Number(d.roe).toFixed(1))
            };
          }
          const pStr = String(d.period || '').toLowerCase();
          let f = 1.0;
          if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(pStr)) f = 4.0;
          else if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(pStr)) f = 2.0;
          else if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(pStr)) f = 12.0 / 9.0;
          const rawNet = d._rawCumulative?.net_income ?? d.net_income;
          const annNet = fin(rawNet) ? rawNet * f : null;
          return {
            period: d.period ? d.period.slice(2) : '',
            val: pctOrNull(annNet, d.equity, 100)
          };
        }),
        format: (v: number) => Number.isFinite(v) ? `%${v.toFixed(1)}` : '—'
      }
    ];
  }, [quarterlyChartData, chartData, currentSector, dupontResult]);

  // Sektör Çarpanları Kıyaslama Çizelgesi
  const peerComparisonData = useMemo(() => {
    const data: Array<{ name: string; pe: number; isMain?: boolean; reportId?: string; ticker?: string }> = [];
    const mainCand = parseFinancialNumber(companyMultiplesData?.multiples?.pe?.companyValue ?? marketMultiples?.pe);
    if (mainCand != null && Number.isFinite(mainCand) && mainCand > 0) {
      data.push({ name: report.ticker, pe: Number(mainCand.toFixed(1)), isMain: true, reportId: report.id, ticker: report.ticker });
    }

    analyzedCompetitors.slice(0, 4).forEach(comp => {
      const compPe = parseFinancialNumber(comp.extractedData?.valuation?.pe_ratio ?? comp.extractedData?.pe ?? comp.extractedData?.market_multiples?.pe);
      if (compPe != null && Number.isFinite(compPe) && compPe > 0) {
        data.push({
          name: comp.ticker,
          pe: Number(compPe.toFixed(1)),
          reportId: comp.id,
          ticker: comp.ticker
        });
      }
    });

    const bench = parseFinancialNumber(marketMultiples?.sector_averages?.pe ?? companyMultiplesData?.benchmark?.peMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe);
    if (bench != null && Number.isFinite(bench) && bench > 0) {
      data.push({ name: 'Sektör Ort.', pe: Number(bench.toFixed(1)) });
    }

    return data;
  }, [report.ticker, report.id, marketMultiples, companyMultiplesData, analyzedCompetitors, currentSector]);

  // Navigasyon Elemanları (10 Sekme)
  const NAVIGATION_ITEMS: Array<{ id: SimplySectionId; num?: string; label: string; icon: any }> = [
    { id: 'sec-ozet', label: 'Özet', icon: PieChartIcon },
    { id: 'sec-grafikler', num: '1', label: 'Grafikler', icon: BarChart2 },
    { id: 'sec-tablolar', num: '2', label: 'Finansal Tablolar', icon: Layers },
    { id: 'sec-carpanlar', num: '3', label: 'Çarpanlar', icon: Percent },
    { id: 'sec-adildeger', num: '4', label: 'Değerleme', icon: Target },
    { id: 'sec-temettu', num: '5', label: 'Temettü', icon: Coins },
    { id: 'sec-rehberlik', num: '6', label: 'Yönetim Karnesi', icon: ShieldCheck },
    { id: 'sec-yatirim-tezi', num: '7', label: 'Yatırım Tezi', icon: Compass },
    { id: 'sec-analist', num: '8', label: 'Analiz Raporu', icon: FileText },
    { id: 'sec-gecmis', num: '9', label: 'Geçmiş', icon: History }
  ];

  const handleCopyReportText = async () => {
    if (report.report) {
      try {
        await navigator.clipboard.writeText(cleanMarkdown(report.report, effectiveDecision, false));
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

  // Finansal Tablolar Kategori Akordeon Durumları (Bilanço, Gelir Tablosu, Nakit Akışı)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const toggleSectionCollapse = useCallback((secId: string) => {
    setCollapsedSections(prev => ({ ...prev, [secId]: !prev[secId] }));
  }, []);

  // Sektörel Akranlar Paneli Açılır/Kapanır Durumu
  const [isPeersOpen, setIsPeersOpen] = useState<boolean>(true);
  const [showAllPeers, setShowAllPeers] = useState<boolean>(false);

  // 4.7 Sermaye Tahsisi Adli Kriter Sinyalleri Çekmecesi
  const [isCapAllocExpanded, setIsCapAllocExpanded] = useState<boolean>(false);

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
          label: currentSector === 'INSURANCE' ? 'Brüt Yazılan Primler' : 'Satış Gelirleri',
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
        { label: 'Esas Faaliyetlerden Diğer Gelirler / (Giderler)', key: 'other_operating_income_net', fallbackKey: 'other_operating_income' }
      ],
      grandTotalLabel: currentSector === 'INSURANCE' ? undefined : '+ FAVÖK (EBITDA)',
      grandTotalKey: currentSector === 'INSURANCE' ? undefined : 'ebitda'
    },
    {
      id: 'finansman',
      title: 'Finansman Gelir/Giderleri & Net Kâr',
      totalLabel: '+ Net Dönem Kârı / (Zararı)',
      totalKey: 'net_income',
      rows: [
        { label: 'Finansman Gelirleri', key: 'financing_income' },
        { label: 'Finansman Giderleri (-)', key: 'financing_expenses' },
        { label: 'Vergi Öncesi Kâr', key: 'profit_before_tax', fallbackKey: 'ebt' },
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
        { label: 'Amortisman ve İtfa Düzeltmeleri', key: 'depreciation', fallbackKey: 'amortization' },
        { label: 'İşletme Sermayesindeki Net Değişimler', key: 'working_capital_change' }
      ]
    },
    {
      id: 'yatirim',
      title: 'Yatırım Faaliyetleri & Serbest Nakit',
      totalLabel: '+ Serbest Nakit Akışı (FCF = OCF - CapEx)',
      totalKey: 'free_cash_flow',
      rows: [
        { label: 'Maddi & Maddi Olmayan Duran Varlık Alımları (CapEx) (-)', key: 'capex', fallbackKey: 'tangible_capex' },
        { label: 'Yatırım Faaliyetlerinden Nakit Akışları', key: 'investing_cash_flow' }
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
  const ratiosSections = useMemo(() => {
    const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    const safeRatio = (num: unknown, den: unknown, scale = 1): number | null => {
      if (!isNum(num) || !isNum(den) || den <= 0) return null;
      const v = (num / den) * scale;
      return Number.isFinite(v) ? v : null;
    };
    const fmtX = (num: unknown, den: unknown): string => {
      const v = safeRatio(num, den, 1);
      return v !== null ? `${v.toFixed(2)}x` : '—';
    };
    const fmtPct = (num: unknown, den: unknown): string => {
      const v = safeRatio(num, den, 100);
      return v !== null ? `${v.toFixed(1)}%` : '—';
    };

    const sections: Array<{
      id: string;
      title: string;
      rows: Array<{
        key: string;
        label: string;
        calc: (c: any) => string;
        raw: (c: any) => number | null;
        isHighlight?: boolean;
      }>;
    }> = [
    {
      id: 'likidite',
      title: 'Likidite Rasyoları',
      rows: [
        {
          key: 'current_ratio',
          label: 'Cari Oran',
          calc: (c: any) => fmtX(c.current_assets, c.current_liabilities),
          raw: (c: any) => safeRatio(c.current_assets, c.current_liabilities),
          isHighlight: true
        },
        {
          key: 'quick_ratio',
          label: 'Likidite Oranı',
          calc: (c: any) => fmtX(isNum(c.current_assets) ? c.current_assets - (isNum(c.inventories) ? c.inventories : 0) : null, c.current_liabilities),
          raw: (c: any) => safeRatio(isNum(c.current_assets) ? c.current_assets - (isNum(c.inventories) ? c.inventories : 0) : null, c.current_liabilities)
        },
        {
          key: 'cash_ratio',
          label: 'Nakit Oranı',
          calc: (c: any) => fmtX(isNum(c.cash_and_equivalents) ? c.cash_and_equivalents : c.cash, c.current_liabilities),
          raw: (c: any) => safeRatio(isNum(c.cash_and_equivalents) ? c.cash_and_equivalents : c.cash, c.current_liabilities)
        }
      ]
    },
    {
      id: 'borcluluk',
      title: 'Borçluluk ve Kaldıraç Rasyoları',
      rows: [
        {
          key: 'leverage_ratio',
          label: 'Kaldıraç Oranı',
          calc: (c: any) => fmtPct(isNum(c.total_assets) && isNum(c.equity) ? c.total_assets - c.equity : null, c.equity),
          raw: (c: any) => safeRatio(isNum(c.total_assets) && isNum(c.equity) ? c.total_assets - c.equity : null, c.equity, 100)
        },
        {
          key: 'debt_to_ebitda',
          label: 'Net Borç / FAVÖK',
          calc: (c: any) => {
            if (isNum(c.ebitda) && c.ebitda > 0 && isNum(c.net_debt)) {
              const v = c.net_debt / c.ebitda;
              return Number.isFinite(v) ? `${v.toFixed(2)}x` : '—';
            }
            return isNum(c.net_debt) && c.net_debt <= 0 ? 'Net Nakit' : '—';
          },
          raw: (c: any) => {
            if (isNum(c.ebitda) && c.ebitda > 0 && isNum(c.net_debt)) {
              const v = c.net_debt / c.ebitda;
              return Number.isFinite(v) ? v : null;
            }
            return isNum(c.net_debt) && c.net_debt <= 0 ? 0 : null;
          },
          isHighlight: true
        },
        {
          key: 'debt_to_assets',
          label: 'Borç / Aktif Oranı',
          calc: (c: any) => fmtPct(c.total_liabilities, c.total_assets),
          raw: (c: any) => safeRatio(c.total_liabilities, c.total_assets, 100)
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
          calc: (c: any) => fmtPct(c.gross_profit, c.revenue),
          raw: (c: any) => safeRatio(c.gross_profit, c.revenue, 100)
        },
        {
          key: 'ebitda_margin',
          label: 'FAVÖK Marjı',
          calc: (c: any) => fmtPct(c.ebitda, c.revenue),
          raw: (c: any) => safeRatio(c.ebitda, c.revenue, 100)
        },
        {
          key: 'net_margin',
          label: 'Net Kâr Marjı',
          calc: (c: any) => fmtPct(c.net_income, c.revenue),
          raw: (c: any) => safeRatio(c.net_income, c.revenue, 100)
        },
        {
          key: 'roe',
          label: 'Özkaynak Kârlılığı',
          calc: (c: any) => fmtPct(c.net_income, c.equity),
          raw: (c: any) => safeRatio(c.net_income, c.equity, 100),
          isHighlight: true
        },
        {
          key: 'roa',
          label: 'Aktif Kârlılığı',
          calc: (c: any) => fmtPct(c.net_income, c.total_assets),
          raw: (c: any) => safeRatio(c.net_income, c.total_assets, 100)
        }
      ]
    }
  ];

  if (currentSector === 'REIT') {
    sections.push({
      id: 'gyo_ozel',
      title: 'GYO Portföy & Temettü Rasyoları (7524 Sayılı Kanun)',
      rows: [
        {
          key: 'noi_cap_rate',
          label: 'Kira Geliri / Portföy Verimliliği (NOI / Cap Rate)',
          calc: (c: any) => {
            const rawNoi = c.operating_profit ?? c.ebitda ?? c.operating_cash_flow;
            const portfolio = c.non_current_assets ?? c.total_assets ?? c.equity;
            if (!rawNoi || !portfolio || portfolio <= 0) return '—';
            let f = 1.0;
            if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(c.period || '')) f = 4.0;
            else if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(c.period || '')) f = 2.0;
            else if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(c.period || '')) f = 12.0 / 9.0;
            const rate = ((rawNoi * f) / portfolio) * 100;
            return `%${rate.toFixed(1)}${rate >= 6.5 ? ' (Olumlu)' : ''}`;
          },
          raw: (c: any) => {
            const rawNoi = c.operating_profit ?? c.ebitda ?? c.operating_cash_flow;
            const portfolio = c.non_current_assets ?? c.total_assets ?? c.equity;
            if (!rawNoi || !portfolio || portfolio <= 0) return null;
            let f = 1.0;
            if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(c.period || '')) f = 4.0;
            else if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(c.period || '')) f = 2.0;
            else if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(c.period || '')) f = 12.0 / 9.0;
            return ((rawNoi * f) / portfolio) * 100;
          },
          isHighlight: true
        },
        {
          key: 'reit_payout_ratio',
          label: 'Kira Temettü Dönüşüm Katsayısı (Payout Ratio)',
          calc: (c: any) => {
            const p = c.payout_ratio ?? c.payoutRatioPct ?? c.dagitmaOrani;
            if (p != null && !isNaN(Number(p))) {
              const val = Number(p);
              return `%${val.toFixed(0)}${val >= 50 ? ' (7524 SK Uyumlu: Olumlu)' : ''}`;
            }
            const yr = c.period ? c.period.slice(0, 4) : '';
            if (yr && Array.isArray(resolvedDividends)) {
              const matchDiv = resolvedDividends.find((d: any) => (d.year && String(d.year) === yr) || (d.date && d.date.includes(yr)));
              if (matchDiv?.payoutRatioPct != null) {
                const val = Number(matchDiv.payoutRatioPct);
                return `%${val.toFixed(0)}${val >= 50 ? ' (7524 SK Uyumlu: Olumlu)' : ''}`;
              }
            }
            return '—';
          },
          raw: (c: any) => {
            const p = c.payout_ratio ?? c.payoutRatioPct ?? c.dagitmaOrani;
            if (p != null && !isNaN(Number(p))) return Number(p);
            const yr = c.period ? c.period.slice(0, 4) : '';
            if (yr && Array.isArray(resolvedDividends)) {
              const matchDiv = resolvedDividends.find((d: any) => (d.year && String(d.year) === yr) || (d.date && d.date.includes(yr)));
              if (matchDiv?.payoutRatioPct != null) return Number(matchDiv.payoutRatioPct);
            }
            return null;
          },
          isHighlight: true
        }
      ]
    });
  }

  return sections;
}, [currentSector, resolvedDividends]);

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
    const isNegative = currentVal != null && !isNaN(Number(currentVal)) && Number(currentVal) < 0;

    const rowMaxAbs = visiblePeriods.reduce((maxVal: number, p: any) => {
      const raw = p?.[valKey] ?? p?.[fallbackKey || ''];
      const n = Number(raw);
      return raw != null && Number.isFinite(n) ? Math.max(maxVal, Math.abs(n)) : maxVal;
    }, 0);
    const barPct = (rowMaxAbs > 0 && currentVal != null && Number.isFinite(Number(currentVal)))
      ? Math.max(8, Math.min(100, Math.round((Math.abs(Number(currentVal)) / rowMaxAbs) * 100)))
      : 0;
    const barColorCls = isNegative
      ? 'bg-rose-400/75'
      : isGrandTotal
      ? 'bg-[#f5c242]/85'
      : isBold
      ? 'bg-emerald-400/75'
      : 'bg-sky-400/45';

    const textStyle = isGrandTotal
      ? (isNegative ? 'font-black text-rose-400' : 'font-black text-[#f5c242]')
      : isBold
      ? (isNegative ? 'font-bold text-rose-400' : 'font-bold text-white')
      : (isNegative ? 'text-rose-400 font-medium' : 'text-slate-200');

    return (
      <td
        key={c.period}
        className={`py-2 px-2 text-right font-mono text-sm ${textStyle} whitespace-nowrap`}
      >
        <div className="flex items-center justify-end whitespace-nowrap gap-1">
          <span className="tabular-nums tracking-tight font-medium">
            {currentVal != null ? formatTableNumber(currentVal) : '—'}
          </span>
          <span className="w-8 flex-shrink-0 text-left pl-0.5 inline-block">
            {isRowHovered && diffPct != null && (
              <span
                className={`text-[10px] sm:text-xs font-bold ${
                  isGood ? 'text-emerald-400' : 'text-rose-400'
                } transition-opacity duration-150 inline-block`}
              >
                %{diffPct > 0 ? `+${diffPct.toFixed(0)}` : diffPct.toFixed(0)}
              </span>
            )}
          </span>
        </div>
        {barPct > 0 && (
          <div className="w-full max-w-[78px] ml-auto mr-9 h-[2px] mt-0.5 rounded-full bg-white/[0.04] overflow-hidden flex justify-end">
            <div className={`fv-inline-sparkbar ${barColorCls}`} style={{ width: `${barPct}%` }} />
          </div>
        )}
      </td>
    );
  };

  // Aktif 4 Grafik Verisi (Tüm tarihsel periyotlar kronolojik sırada)
  const active4ChartsFlowData = chartPeriodMode === 'quarterly' 
    ? quarterlyChartData 
    : (ttmChartData && ttmChartData.length > 0 ? ttmChartData : chartData);

  // Grafik 1.3 ve 1.5 için Eksi Değerlerde Aşırı Eksen Boşluğunu Önleyen Sıkı Eksen Tabanı
  const chart13YDomain = useMemo<[number | string, number | string]>(() => {
    if (!active4ChartsFlowData || active4ChartsFlowData.length === 0) return [0, 'auto'];
    let min = 0;
    active4ChartsFlowData.forEach(d => {
      [d.revenue, d.ebitda, d.net_income].forEach(v => {
        if (typeof v === 'number' && isFinite(v)) {
          if (v < min) min = v;
        }
      });
    });
    if (min >= 0) return [0, 'auto'];
    return [calculateTightMin(min), 'auto'];
  }, [active4ChartsFlowData]);

  const chart15YDomain = useMemo<[number | string, number | string]>(() => {
    if (!active4ChartsFlowData || active4ChartsFlowData.length === 0) return [0, 'auto'];
    let min = 0;
    active4ChartsFlowData.forEach(d => {
      [d.operating_cash_flow, d.net_income, d.free_cash_flow].forEach(v => {
        if (typeof v === 'number' && isFinite(v)) {
          if (v < min) min = v;
        }
      });
    });
    if (min >= 0) return [0, 'auto'];
    return [calculateTightMin(min), 'auto'];
  }, [active4ChartsFlowData]);

  return (
    <div className="space-y-6 font-sans text-slate-100">

      {/* MOBİL VE TABLET İÇİN YATAY SABİT BÖLÜM GEZİNTİ BARI (LG:HIDDEN) */}
      <div className="lg:hidden sticky top-14 z-30 bg-[#111418]/95 backdrop-blur-md border-b border-[#21262d] -mx-4 px-4 sm:-mx-6 sm:px-6 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x shadow-md">
        {NAVIGATION_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          const IconComp = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id)}
              className={`fv-pill shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs cursor-pointer select-none ${
                isActive
                  ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm'
                  : 'bg-[#181b20] text-slate-400 hover:text-white border border-[#282d37]'
              }`}
            >
              {IconComp && <IconComp className="w-3.5 h-3.5 shrink-0 opacity-80" />}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2 SÜTUNLU DÜZEN: SOL FREEZE PANE SABİT PANEL + SAĞ İÇERİK AKIŞI */}
      <div className="flex items-start gap-6 lg:gap-8 relative min-h-screen">

        {/* ========================================================================= */}
        {/* SOL YÖNLENDİRİCİ PANEL (AUTHENTIC SIMPLY WALL ST FREEZE PANE SIDEBAR)       */}
        {/* ========================================================================= */}
        <aside className="w-60 xl:w-64 flex-shrink-0 hidden lg:block sticky top-16 self-start z-20 pl-2 lg:pl-4">
          <div className="flex flex-col space-y-3.5 select-none px-1">
            {/* Kar Tanesi Radarı (Freeze Pane Sabit Menü) */}
            <div className="flex flex-col items-center justify-center pt-0.5 w-full">
              <SnowflakeRadar
                axes={snowflake.axes}
                ticker={report.ticker}
                size={150}
                onSelectSection={(secId) => scrollToSection(secId as any)}
                showLabels={true}
              />

              {/* Ticker & Şirket Bilgisi */}
              <div className="text-center mt-2 space-y-0.5 w-full">
                <h3 className="font-sans text-[15px] font-bold text-white tracking-tight line-clamp-1" title={profile.fullName}>
                  {getCleanCompanyName(profile.fullName, report.ticker)}
                </h3>
                <div className="text-xs text-slate-400 font-sans">
                  Piyasa Değeri: {formattedMarketCap}
                </div>
              </div>
            </div>

            {/* Butonlar: + Portföy, ★ (İzleme / Favori) */}
            <div className="grid grid-cols-2 gap-2 pt-1 pb-1 w-full">
              <button
                type="button"
                onClick={() => {
                  if (onTogglePortfolio) onTogglePortfolio(report.ticker);
                }}
                className={`fv-pill py-1.5 px-2 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 cursor-pointer shadow-sm w-full ${
                  isInPortfolio
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold'
                    : 'bg-[#f5c242] hover:bg-[#e5b332] text-slate-950 font-bold'
                }`}
                title={isInPortfolio ? 'Portföyden Çıkar' : 'Portföye Ekle'}
              >
                <span>{isInPortfolio ? '✓' : '+'}</span>
                <span>Portföy</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onToggleFavorite) onToggleFavorite(report.ticker);
                }}
                className={`fv-pill py-1.5 px-2 text-xs font-semibold rounded-md border cursor-pointer flex items-center justify-center gap-1.5 w-full ${
                  isFavorite
                    ? 'bg-amber-400/20 text-amber-300 border-amber-400/50 hover:bg-amber-400/30'
                    : 'bg-[#1e2229] hover:bg-[#282e38] text-slate-400 hover:text-white border-[#2e3440]'
                }`}
                title={isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
              >
                <span className={`text-sm leading-none ${isFavorite ? 'text-amber-400 font-bold' : ''}`}>★</span>
                <span className="text-xs">{isFavorite ? 'İzleniyor' : 'İzle'}</span>
              </button>
            </div>

            {/* 10 Sekme Listesi (Arkası Kartsız, Dengeli ve Sıkışmayan Menü) */}
            <nav className="space-y-1 pt-1 border-t border-[#282d37]/40 w-full">
              {NAVIGATION_ITEMS.map((item) => {
                const isActive = activeSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToSection(item.id)}
                    className={`w-full flex items-center gap-2.5 py-1.5 px-3 rounded-md text-[13.5px] transition cursor-pointer text-left ${
                      isActive
                        ? 'bg-white/[0.06] text-white font-bold border-l-2 border-[#f5c242] pl-2.5 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04] font-medium'
                    }`}
                  >
                    {item.num && (
                      <span className="font-mono text-xs text-slate-400 w-3.5 text-left">
                        {item.num}
                      </span>
                    )}
                    <span className="truncate">{item.label}</span>
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
          {/* STICKY ŞİRKET BAĞLAM ŞERİDİ (Aşağı kaydırıldığında masaüstünde Fiyat & Adil Değer bağlamını korur) */}
          {(() => {
            const rawScore = report?.score ?? valuationInfo?.score ?? (report as any)?.scoreResult?.totalScore;
            const stickyScore = parseNumericScore(rawScore);
            const stickyUpside = (currentPriceNum > 0 && fairValueNum > 0)
              ? Number((((fairValueNum - currentPriceNum) / currentPriceNum) * 100).toFixed(1))
              : null;
            const stickyDec = String(effectiveDecision || 'NÖTR').toUpperCase();
            const isStickyAl = stickyDec === 'AL';
            const isStickyAlma = stickyDec === 'ALMA';
            return (
              <div
                data-testid="fv-sticky-context-bar"
                className={`${activeSection !== 'sec-ozet' ? 'hidden lg:flex' : 'hidden'} sticky top-14 z-30 items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#12161f]/95 backdrop-blur-md border border-[#2b3242] shadow-xl animate-in fade-in duration-150`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-xs font-black text-[#f5c242] bg-[#1b202b] px-2 py-0.5 rounded border border-[#2e3545] shrink-0">
                    {report.ticker}
                  </span>
                  <span className="text-xs font-bold text-white truncate max-w-[180px]" title={profile.fullName}>
                    {getCleanCompanyName(profile.fullName, report.ticker)}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 hidden xl:inline shrink-0">
                    • {report.period || latestData?.period || '—'}
                  </span>
                </div>

                <div className="flex items-center gap-3 font-mono text-xs shrink-0">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">Fiyat:</span>
                    <span className="font-bold text-white">{currentPriceNum > 0 ? `₺${currentPriceNum.toFixed(2)}` : '—'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">Adil Değer:</span>
                    <span className="font-bold text-[#f5c242]">{fairValueNum > 0 ? `₺${fairValueNum.toFixed(2)}` : '—'}</span>
                  </div>
                  {stickyUpside !== null && (
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                      stickyUpside >= 0
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35'
                        : 'bg-rose-500/15 text-rose-400 border-rose-500/35'
                    }`}>
                      {stickyUpside >= 0 ? `+%${stickyUpside}` : `-%${Math.abs(stickyUpside)}`}
                    </span>
                  )}
                  {stickyScore !== null && (
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#171b24] border border-[#2b3242] ${getScoreColorStyle(stickyScore).text}`}>
                      {stickyScore}/100
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                    isStickyAl ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35' :
                    isStickyAlma ? 'bg-rose-500/15 text-rose-400 border-rose-500/35' :
                    'bg-amber-500/15 text-amber-300 border-amber-500/35'
                  }`}>
                    {stickyDec}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onTogglePortfolio && (
                    <button
                      type="button"
                      onClick={() => onTogglePortfolio(report.ticker)}
                      className={`fv-pill px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                        isInPortfolio
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                          : 'bg-[#1a1f28] text-slate-300 hover:text-white border-[#2e3545]'
                      }`}
                    >
                      {isInPortfolio ? '✓ Portföyde' : '+ Portföy'}
                    </button>
                  )}
                  {onToggleFavorite && (
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(report.ticker)}
                      className={`fv-pill px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer border ${
                        isFavorite
                          ? 'bg-amber-400/20 text-amber-300 border-amber-400/50'
                          : 'bg-[#1a1f28] text-slate-400 hover:text-white border-[#2e3545]'
                      }`}
                      title={isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                    >
                      ★
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => scrollToSection('sec-ozet')}
                    className="fv-pill px-2.5 py-1 rounded-lg bg-[#1a1f28] hover:bg-[#232936] text-slate-300 hover:text-white border border-[#2e3545] text-[11px] font-sans font-semibold flex items-center gap-1 cursor-pointer"
                    title="En Üste / Özete Dön"
                  >
                    <ArrowUp className="w-3 h-3" />
                    <span>Özet</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 1: GENEL BAKIŞ & SNOWFLAKE (#sec-ozet)                             */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Özet Panosu Hatası">
          <section id="sec-ozet" className="scroll-mt-28 rounded-2xl border border-[#242a35] bg-[#101319] p-4 sm:p-7 shadow-xl space-y-6">

            {/* Mobil Kar Tanesi Radarı & Hızlı Aksiyon Kartı (lg:hidden) */}
            <div className="lg:hidden bg-[#161a23] border border-[#2a3140] rounded-xl p-4 shadow-md flex flex-col items-center text-center space-y-3">
              <SnowflakeRadar
                axes={snowflake.axes}
                ticker={report.ticker}
                size={140}
                onSelectSection={(secId) => scrollToSection(secId as any)}
                showLabels={true}
              />
              <div className="space-y-0.5">
                <h2 className="font-sans text-base font-bold text-white tracking-tight line-clamp-1">
                  {getCleanCompanyName(profile.fullName, report.ticker)}
                </h2>
                <div className="text-xs text-slate-400 font-sans">
                  Piyasa Değeri: {formattedMarketCap}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (onTogglePortfolio) onTogglePortfolio(report.ticker);
                  }}
                  className={`fv-pill py-2 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-sm w-full ${
                    isInPortfolio
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold'
                      : 'bg-[#f5c242] hover:bg-[#e5b332] text-slate-950 font-bold'
                  }`}
                  title={isInPortfolio ? 'Portföyden Çıkar' : 'Portföye Ekle'}
                >
                  <span>{isInPortfolio ? '✓' : '+'}</span>
                  <span>Portföy</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onToggleFavorite) onToggleFavorite(report.ticker);
                  }}
                  className={`fv-pill py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer flex items-center justify-center gap-1.5 w-full ${
                    isFavorite
                      ? 'bg-amber-400/20 text-amber-300 border-amber-400/50'
                      : 'bg-[#1e2229] hover:bg-[#282e38] text-slate-400 hover:text-white border-[#2e3440]'
                  }`}
                  title={isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                >
                  <span className={`text-sm leading-none ${isFavorite ? 'text-amber-400 font-bold' : ''}`}>★</span>
                  <span>{isFavorite ? 'İzleniyor' : 'İzle'}</span>
                </button>
              </div>
            </div>

            {/* Sub-Card 1: Üst Şirket Bilgi ve Fiyat Özeti Kartı */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-xl p-4 sm:p-7 shadow-md space-y-6">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-6 border-b border-[#282d37]">
                <div className="space-y-1.5 min-w-0 max-w-full xl:max-w-[48%]">
                  <div className="flex items-center gap-2 text-sm font-mono text-slate-300">
                    <span className="text-[#f5c242] font-bold">IBSE:{report.ticker}</span>
                    <span>•</span>
                    <span>{report.period || latestData?.period || '2025/12'} Bilanço Dönemi</span>
                  </div>
                  <h1 className="font-sans text-2xl sm:text-3xl font-black text-white tracking-tight truncate line-clamp-1" title={profile.fullName}>
                    {profile.fullName}
                  </h1>
                  <div className="flex items-center gap-2.5 pt-1">
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-[#21262d] text-slate-200 border border-[#2e3440]">
                      {officialSectorName ? `${officialSectorName} Sektörü` : sectorMeta?.title || 'Borsa İstanbul'}
                    </span>
                    <span className="text-sm text-slate-400">
                      İstanbul, Türkiye
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-5 w-full sm:w-auto sm:shrink-0">
                  <div>
                    <div className="text-xs sm:text-sm text-slate-400 uppercase font-semibold">Piyasa Fiyatı</div>
                    <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-0.5 whitespace-nowrap">
                      {currentPriceNum > 0 ? `₺${currentPriceNum.toFixed(2)}` : '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs sm:text-sm text-slate-400 uppercase font-semibold">Hesaplanan Adil Değer</div>
                    <div className="text-2xl sm:text-3xl font-black font-mono text-[#f5c242] mt-0.5 whitespace-nowrap">
                      {fairValueNum > 0 ? `₺${fairValueNum.toFixed(2)}` : '—'}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {(() => {
                      const isTrap = Boolean(valuationInfo?.is_value_trap);
                      const capAllocAudit = valuationInfo?.capital_allocation_risk ?? analyzeRelatedPartyAndCapitalAllocationRisk(latestData, currentSector, officialSectorName);
                      const isCapAllocRisk = Boolean(capAllocAudit?.isRiskDetected);
                      const isInvEntity = Boolean(capAllocAudit?.isInvestmentEntity);
                      const isAlma = Boolean(effectiveDecision === 'ALMA' || (report as any)?.rawDecision === 'ALMA');
                      const rawScore = report?.score ?? valuationInfo?.score ?? (report as any)?.scoreResult?.totalScore;
                      const cleanNum = parseNumericScore(rawScore);
                      
                      const upsidePct = currentPriceNum > 0 ? ((fairValueNum - currentPriceNum) / currentPriceNum) * 100 : 0;
                      const trueDiscountPct = fairValueNum > 0 ? ((fairValueNum - currentPriceNum) / fairValueNum) * 100 : 0;
                      const isNearFairValue = Math.abs(upsidePct) < 1.0;

                      // Net, şeffaf ve analitik risk rozeti ve açıklaması
                      let riskBadge: { label: string; tooltip: string; isInfo?: boolean } | null = null;
                      if (isTrap) {
                        riskBadge = {
                          label: 'Değer Tuzağı Riski',
                          tooltip: 'Hisse çarpan bazında ucuz görünse de operasyonel nakit akışı veya kâr kalitesi bozulması nedeniyle değer tuzağı riski taşımaktadır.'
                        };
                      } else if (isCapAllocRisk) {
                        riskBadge = {
                          label: 'Gölge Holdingleşme & Sermaye Tahsisi Riski',
                          tooltip: capAllocAudit.summaryText || 'Şirket esas faaliyet dışı duran finansal yatırımlara yüksek kaynak bağlamış olup serbest nakit dönüşümü zayıftır. Detaylar için Değerleme (Bölüm 4.7) paneline bakınız.'
                        };
                      } else if (isInvEntity) {
                        riskBadge = {
                          label: 'TFRS 10 İştirak & Değerleme Yapısı',
                          tooltip: capAllocAudit.summaryText || 'Şirket TFRS 10 kapsamında bir iştirak / girişim sermayesi yatırım işletmesidir; kârlar gayrinakdi portföy değerlemesinden kaynaklanmaktadır.',
                          isInfo: true
                        };
                      } else if (cleanNum !== null && cleanNum < 30) {
                        riskBadge = {
                          label: 'Düşük Temel Performans',
                          tooltip: `Sektörel analiz puanı (${cleanNum}/100) kritik seviyenin altındadır. Marj daralması veya borç baskısı nedeniyle temkinli yaklaşım önerilir.`
                        };
                      } else if (isAlma) {
                        riskBadge = {
                          label: 'Temkinli Görünüm',
                          tooltip: 'Temel bilanço göstergeleri ve sermaye verimliliği mevcut piyasa fiyatlaması karşısında alım emniyeti sunmamaktadır.'
                        };
                      }

                      return (
                        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                          {/* Risk uyarısı varsa, iskonto panelini silmeden YANINA şık bir etiket olarak eklenir */}
                          {riskBadge && (
                            <button
                              type="button"
                              onClick={() => {
                                if (document.getElementById('sec-sermaye-tahsisi')) {
                                  scrollToDomId('sec-sermaye-tahsisi', 'sec-adildeger');
                                } else {
                                  scrollToSection('sec-adildeger');
                                }
                              }}
                              title={riskBadge.tooltip}
                              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl font-sans text-xs font-bold border whitespace-nowrap shadow-sm cursor-pointer transition ${
                                riskBadge.isInfo
                                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                                  : 'border-rose-500/40 bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
                              }`}
                            >
                              <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${riskBadge.isInfo ? 'text-amber-400' : 'text-rose-400'}`} />
                              <span>{riskBadge.label}</span>
                            </button>
                          )}

                          {/* İskonto & Potansiyel Paneli - ASLA KAYBOLMAZ, HER ZAMAN EKSİKSİZ GÖSTERİLİR */}
                          <span 
                            title={fairValueNum > 0 ? `Piyasa Fiyatı: ₺${currentPriceNum.toFixed(2)} ➔ Hedef Adil Değer: ₺${fairValueNum.toFixed(2)} | Potansiyel: ${upsidePct >= 0 ? '+' : ''}%${upsidePct.toFixed(1)} | İskonto/Prim: %${Math.abs(trueDiscountPct).toFixed(1)}` : undefined}
                            className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl font-mono text-xs sm:text-sm font-bold border whitespace-nowrap shadow-sm ${
                              fairValueNum > currentPriceNum && !isNearFairValue
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                : isNearFairValue
                                ? 'bg-slate-800/80 border-slate-700/80 text-slate-300'
                                : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                            }`}
                          >
                            {fairValueNum > currentPriceNum && !isNearFairValue ? (
                              <>
                                <TrendingUp className="w-4 h-4 shrink-0 text-emerald-400" />
                                <span className="flex items-center gap-1.5">
                                  <span>+%{Math.abs(upsidePct).toFixed(1)} Potansiyel</span>
                                  <span className="text-[11px] font-normal text-emerald-400/75 border-l border-emerald-500/30 pl-1.5">
                                    %{Math.abs(trueDiscountPct).toFixed(0)} İskonto
                                  </span>
                                </span>
                              </>
                            ) : isNearFairValue ? (
                              <>
                                <span className="flex items-center gap-1.5">
                                  <span>Adil Değerinde</span>
                                  <span className="text-[11px] font-normal text-slate-400 border-l border-slate-700 pl-1.5">
                                    {upsidePct >= 0 ? '+' : ''}%{upsidePct.toFixed(1)} Fark
                                  </span>
                                </span>
                              </>
                            ) : (
                              <>
                                <TrendingDown className="w-4 h-4 shrink-0 text-rose-400" />
                                <span className="flex items-center gap-1.5">
                                  <span>-%{Math.abs(upsidePct).toFixed(1)} Potansiyel</span>
                                  <span className="text-[11px] font-normal text-rose-400/75 border-l border-rose-500/30 pl-1.5">
                                    +%{Math.abs(trueDiscountPct).toFixed(0)} Prim
                                  </span>
                                </span>
                              </>
                            )}
                          </span>
                        </div>
                      );
                    })()}
                    {(() => {
                      const rawScore = report?.score ?? valuationInfo?.score ?? (report as any)?.scoreResult?.totalScore;
                      const cleanNum = parseNumericScore(rawScore);
                      if (cleanNum === null) return null;
                      return (
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/90 border text-xs font-mono font-bold shadow-sm ${getScoreColorStyle(cleanNum).border}`}>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Skor:</span>
                          <span className={`font-bold ${getScoreColorStyle(cleanNum).text}`}>{cleanNum}/100</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Fiyat ve Adil Değer Mini Çizelgesi */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="md:col-span-2 bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span className="font-bold text-white text-[15px]">Son 4 Çeyrek Adil Değer Trendi vs. Piyasa Fiyatı</span>
                  </div>
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={fairValueTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="swsFairGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f5c242" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#f5c242" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                        <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 12, fill: '#9ca3af' }} />
                        <YAxis stroke="#6b7280" tick={{ fontSize: 12, fill: '#9ca3af' }} domain={['auto', 'auto']} />
                        <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                        <Area type="monotone" dataKey="AdilDeğer" name="Adil Değer" stroke="#f5c242" strokeWidth={2} fill="url(#swsFairGrad)" />
                        <Line type="monotone" dataKey="PiyasaFiyatı" name="Piyasa Fiyatı" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3.5, fill: '#38bdf8' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-[15px] font-bold text-white flex items-center justify-between">
                      <span>Getiri Performansı</span>
                    </div>
                    <div className="text-sm text-slate-300 mt-0.5">BIST piyasa dinamikleri</div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">7 Günlük:</span>
                      <span className={`font-mono font-bold ${
                        priceReturns.return7d === null
                          ? 'text-slate-400'
                          : priceReturns.return7d > 0
                            ? 'text-emerald-400'
                            : priceReturns.return7d < 0
                              ? 'text-rose-400'
                              : 'text-slate-200'
                      }`}>
                        {priceReturns.return7d !== null ? `${priceReturns.return7d > 0 ? '+' : ''}%${priceReturns.return7d.toFixed(1)}` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">1 Yıllık:</span>
                      <span className={`font-mono font-bold ${
                        priceReturns.return1y === null
                          ? 'text-slate-400'
                          : priceReturns.return1y > 0
                            ? 'text-emerald-400'
                            : priceReturns.return1y < 0
                              ? 'text-rose-400'
                              : 'text-slate-200'
                      }`}>
                        {priceReturns.return1y !== null ? `${priceReturns.return1y > 0 ? '+' : ''}%${priceReturns.return1y.toFixed(1)}` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">F/K Oranı:</span>
                      <span className="font-mono font-bold text-white">
                        {(companyMultiplesData?.multiples?.pe?.companyValue ?? marketMultiples?.pe) ? (companyMultiplesData?.multiples?.pe?.companyValue ?? marketMultiples.pe).toFixed(2) : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-slate-400 border-t border-[#2e3440] pt-2.5 flex items-center justify-between">
                    <span>KAP ve BIST piyasa verileri</span>
                    {priceReturns.returnYtd !== null && (
                      <span className="text-xs font-mono text-slate-300">
                        YTD: <strong className={priceReturns.returnYtd >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {priceReturns.returnYtd > 0 ? '+' : ''}%{priceReturns.returnYtd.toFixed(1)}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-Card 1B: 4 Boyutlu Adli Stres Matrisi (4-Pillar Forensic Scorecard) */}
            {(() => {
              const recentSeries = (quarterlyChartData && quarterlyChartData.length > 0 ? quarterlyChartData : chartData || []).slice(-5);
              const validProfitPoints = recentSeries.filter((p: any) => p?.net_income != null && Number.isFinite(Number(p.net_income)));
              const profitableCount = validProfitPoints.filter((p: any) => Number(p.net_income) > 0).length;
              const isInsSec = currentSector === 'INSURANCE';
              const isBankSec = currentSector === 'BANKING';
              const activeMarginVal = isInsSec
                ? parseFinancialNumber(latestData?.combined_ratio ?? latestData?.technical_margin)
                : parseFinancialNumber(latestData?.ebitda_margin ?? latestData?.net_margin);
              const p1Status = validProfitPoints.length === 0
                ? 'İZLEME'
                : profitableCount >= Math.ceil(validProfitPoints.length * 0.75) && (isInsSec || activeMarginVal == null || activeMarginVal > 8)
                ? 'SAĞLAM'
                : profitableCount >= 2
                ? 'DENGELİ'
                : 'ZAYIF';

              const evaPos = evaSpreadNum >= 0;
              const p2Status = evaPos ? 'DEĞER YARATIYOR' : evaSpreadNum >= -5 ? 'NÖTR MAKAS' : 'SERMAYE EROZYONU';

              const ocfRaw = parseFinancialNumber(latestData?.operating_cash_flow) ?? earningsQuality.ocf;
              const wcRaw = parseFinancialNumber(latestData?.working_capital_change);
              const niRaw = parseFinancialNumber(latestData?.net_income) ?? earningsQuality.netIncome;
              const isWcDebtFunded = ocfRaw != null && ocfRaw > 0 && wcRaw != null && wcRaw >= ocfRaw * 0.70 && (niRaw == null || niRaw <= 0);
              const cashConv = earningsQuality.cashConversionRatio;
              const p3Status = isWcDebtFunded
                ? 'WC / TEDARİKÇİ KAYNAKLI'
                : (ocfRaw != null && ocfRaw > 0 && (cashConv == null || cashConv >= 80))
                ? 'OPERASYONEL NAKİT'
                : (ocfRaw != null && ocfRaw > 0)
                ? 'ORTA DÖNÜŞÜM'
                : (isBankSec || isInsSec)
                ? 'MEVDUAT / TEKNİK FON'
                : 'NAKİT ÇIKIŞI';

              const totalDebtVal = parseFinancialNumber(latestData?.total_debt);
              const cashVal = parseFinancialNumber(latestData?.cash_and_equivalents ?? latestData?.cash);
              const netDebtVal = parseFinancialNumber(latestData?.net_debt) ?? (totalDebtVal != null && cashVal != null ? totalDebtVal - cashVal : null);
              const ebitdaRaw = parseFinancialNumber(latestData?.ebitda);
              const ndToEbitda = (!isBankSec && !isInsSec && netDebtVal != null && ebitdaRaw != null && ebitdaRaw > 0)
                ? Number((netDebtVal / ebitdaRaw).toFixed(2))
                : null;
              const isNetCash = netDebtVal != null && netDebtVal < 0;
              const p4Status = (isBankSec || isInsSec)
                ? 'SERMAYE YETERLİLİĞİ'
                : isNetCash
                ? 'NET NAKİT'
                : (ndToEbitda != null && ndToEbitda <= 2.5)
                ? 'KONTROLLÜ BORÇ'
                : (ebitdaRaw != null && ebitdaRaw <= 0 && netDebtVal != null && netDebtVal > 0)
                ? 'BORÇ BASKISI'
                : (ndToEbitda != null && ndToEbitda > 2.5)
                ? 'YÜKSEK KALDIRAÇ'
                : 'DENGELİ';

              const badgeCls = (tone: 'emerald' | 'amber' | 'rose') =>
                tone === 'emerald'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                  : tone === 'rose'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/35';

              return (
                <div
                  data-testid="fv-forensic-4pillar"
                  className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[#282d37] pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#f5c242]" />
                      <h3 className="font-sans text-base sm:text-lg font-bold text-white">
                        4 Boyutlu Adli Denetim Özeti
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      Kârlılık • EVA Makası • Nakit Kaynağı • Bilanço
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {/* Direk 1: Kârlılık Trendi */}
                    <div className="p-3.5 rounded-xl bg-[#11141c] border border-[#252b38] flex flex-col justify-between gap-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10.5px] font-mono uppercase font-bold text-slate-400">1. Kârlılık Trendi</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          badgeCls(p1Status === 'SAĞLAM' ? 'emerald' : p1Status === 'ZAYIF' ? 'rose' : 'amber')
                        }`}>
                          {p1Status}
                        </span>
                      </div>
                      <div className="font-mono text-sm font-black text-white">
                        {validProfitPoints.length > 0 ? `${profitableCount}/${validProfitPoints.length} Kârlı Dönem` : '—'}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1.5 border-t border-[#1e232e]">
                        <span>{isInsSec ? 'Kombine/Tek. Marj:' : 'FAVÖK / Net Marj:'}</span>
                        <span className="font-bold text-slate-200">
                          {activeMarginVal != null ? `%${activeMarginVal.toFixed(1)}` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Direk 2: Sermaye Verimliliği & EVA */}
                    <div className="p-3.5 rounded-xl bg-[#11141c] border border-[#252b38] flex flex-col justify-between gap-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10.5px] font-mono uppercase font-bold text-slate-400">2. Sermaye &amp; EVA</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          badgeCls(evaPos ? 'emerald' : evaSpreadNum >= -5 ? 'amber' : 'rose')
                        }`}>
                          {p2Status}
                        </span>
                      </div>
                      <div className={`font-mono text-sm font-black ${evaPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        EVA: {evaSpreadNum >= 0 ? `+${evaSpreadNum.toFixed(1)}%` : `${evaSpreadNum.toFixed(1)}%`}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1.5 border-t border-[#1e232e]">
                        <span>{isBankSec || isInsSec ? 'ROE' : 'ROIC'}: %{roicNum.toFixed(1)}</span>
                        <span>WACC: %{waccNum.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Direk 3: Nakit Akışı Kaynağı */}
                    <div className="p-3.5 rounded-xl bg-[#11141c] border border-[#252b38] flex flex-col justify-between gap-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10.5px] font-mono uppercase font-bold text-slate-400">3. Nakit Kaynağı</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          badgeCls(p3Status === 'OPERASYONEL NAKİT' || p3Status === 'MEVDUAT / TEKNİK FON' ? 'emerald' : p3Status.includes('TEDARİKÇİ') || p3Status === 'NAKİT ÇIKIŞI' ? 'rose' : 'amber')
                        }`}>
                          {p3Status}
                        </span>
                      </div>
                      <div className="font-mono text-sm font-black text-white">
                        {ocfRaw != null ? `OCF: ${formatTableNumber(ocfRaw)}` : 'OCF: —'}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1.5 border-t border-[#1e232e]">
                        <span>Nakit Dönüşüm:</span>
                        <span className="font-bold text-slate-200">
                          {cashConv != null ? `%${cashConv.toFixed(0)}` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Direk 4: Bilanço & Likidite */}
                    <div className="p-3.5 rounded-xl bg-[#11141c] border border-[#252b38] flex flex-col justify-between gap-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10.5px] font-mono uppercase font-bold text-slate-400">4. Bilanço Sağlığı</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          badgeCls(p4Status === 'NET NAKİT' || p4Status === 'SERMAYE YETERLİLİĞİ' || p4Status === 'KONTROLLÜ BORÇ' ? 'emerald' : p4Status === 'DENGELİ' ? 'amber' : 'rose')
                        }`}>
                          {p4Status}
                        </span>
                      </div>
                      <div className="font-mono text-sm font-black text-white">
                        {isBankSec || isInsSec
                          ? `Özkaynak: ${formatTableNumber(latestData?.equity)}`
                          : netDebtVal != null
                          ? `${isNetCash ? 'Net Nakit' : 'Net Borç'}: ${formatTableNumber(Math.abs(netDebtVal))}`
                          : '—'}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1.5 border-t border-[#1e232e]">
                        <span>{isBankSec || isInsSec ? 'Aktif Yapısı:' : 'Net Borç / FAVÖK:'}</span>
                        <span className="font-bold text-slate-200">
                          {isBankSec || isInsSec
                            ? 'Düzenlemeye Tabi'
                            : ebitdaRaw != null && ebitdaRaw <= 0
                            ? '— (Negatif FAVÖK)'
                            : ndToEbitda != null
                            ? `${ndToEbitda}x`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* About the Company (Şirket Hakkında) */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-sans text-lg font-bold text-white">Şirket Hakkında</h3>
                </div>
                {profile.website && (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm text-[#f5c242] hover:underline font-semibold"
                  >
                    <span>Resmi Web Sitesi</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <p className="text-sm sm:text-[15px] text-slate-200 leading-relaxed font-sans">
                {profile.summary}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-[#282d37]">
                <div>
                  <div className="text-sm text-slate-400 font-medium">Sektör</div>
                  <div className="text-sm font-bold text-white mt-1">{sectorMeta?.title || profile.fullName}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 font-medium">Genel Merkez</div>
                  <div className="text-sm font-bold text-white mt-1">İstanbul, Türkiye</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 font-medium">Çalışan Sayısı</div>
                  <div className="text-sm font-bold text-white mt-1">{profile.employees || '1.000+'}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-400 font-medium">Kuruluş Yılı</div>
                  <div className="text-sm font-bold text-white mt-1">{profile.foundedYear || '1995'}</div>
                </div>
              </div>
            </div>

            {/* Sub-Card 2: Snowflake Analiz Kartı (SVG Radar + 5 Eksen + 30 Kriter Listesi) */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-xl p-5 sm:p-7 shadow-md space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#282d37] pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-sans text-xl sm:text-2xl font-bold text-white">Snowflake Analizi</h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSnowflakeChecklist(prev => !prev)}
                    className="px-3.5 py-1.5 rounded-xl border border-[#3b4354] hover:border-amber-500/50 bg-[#1f242e] hover:bg-[#252c38] text-xs sm:text-sm font-medium text-slate-200 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    {showSnowflakeChecklist ? (
                      <>
                        <ChevronUp className="w-4 h-4 text-amber-400" />
                        <span>Kriter Kontrol Listesini Gizle</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 text-amber-400" />
                        <span>Kriter Kontrol Listesini Göster</span>
                      </>
                    )}
                  </button>

                  <div className={`px-4 py-2 rounded-xl border text-sm font-mono font-bold flex items-center gap-2 shadow-sm ${snowflakeTheme.badgeClass}`}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: snowflakeTheme.statusColor }} />
                    <span>{snowflakeTheme.status}</span>
                    <span className="text-white/60">•</span>
                    <span>%{snowflake.percentage}</span>
                  </div>

                  <div className="text-right pl-3 border-l border-[#2b313d]">
                    <div className="text-2xl font-black font-mono" style={{ color: snowflakeTheme.statusColor }}>
                      {snowflake.totalScore}/30
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase font-mono tracking-wider">Toplam Skor</span>
                  </div>
                </div>
              </div>

              {/* Analiz Geçmişi: yalnızca bilgi amaçlıdır, değerleme motoruna girdi OLMAZ */}
              {Array.isArray(report.extractedData?.analysis_history) && report.extractedData.analysis_history.length > 0 && (
                <details className="rounded-xl border border-[#232834] bg-[#151821] px-4 py-3 text-sm">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-400 select-none">
                    Önceki Analizler ({report.extractedData.analysis_history.length})
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="text-slate-500 text-left">
                          <th className="py-1 pr-4 font-medium">Dönem</th>
                          <th className="py-1 pr-4 font-medium">Tarih</th>
                          <th className="py-1 pr-4 font-medium">Fiyat</th>
                          <th className="py-1 pr-4 font-medium">Adil Değer</th>
                          <th className="py-1 pr-4 font-medium">Puan</th>
                          <th className="py-1 font-medium">Karar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.extractedData.analysis_history.map((h: any) => (
                          <tr key={h.id} className="border-t border-[#232834] text-slate-300">
                            <td className="py-1.5 pr-4">{h.period || '—'}</td>
                            <td className="py-1.5 pr-4">{h.createdAt ? formatAnalysisDate(h.createdAt) : '—'}</td>
                            <td className="py-1.5 pr-4">{h.price || '—'}</td>
                            <td className="py-1.5 pr-4">{h.fairValue || '—'}</td>
                            <td className="py-1.5 pr-4">{h.score || '—'}</td>
                            <td className="py-1.5">{h.decision || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* 30 Kriter Kontrol Paneli (Açılır - Kapanır Liste) */}
              {showSnowflakeChecklist && (
                <div className="p-4 sm:p-5 bg-[#14171e] rounded-xl border border-[#2b3240] space-y-4 animate-in fade-in duration-300">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242a36] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                        Kriter Kontrol Listesi
                      </span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                        {snowflake.totalScore} Başarılı / 30 Kriter
                      </span>
                    </div>

                    {/* Filtre Butonları */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { id: 'all', label: 'Tüm Kriterler' },
                        { id: 'value', label: 'Değerleme' },
                        { id: 'future', label: 'Gelecek Büyüme' },
                        { id: 'past', label: 'Geçmiş Performans' },
                        { id: 'health', label: 'Finansal Sağlık' },
                        { id: 'dividend', label: 'Temettü' },
                      ].map(btn => (
                        <button
                          key={btn.id}
                          type="button"
                          onClick={() => setSelectedSnowflakeFilter(btn.id as any)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors font-mono ${
                            selectedSnowflakeFilter === btn.id
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                              : 'bg-[#1b2029] text-slate-400 hover:text-slate-200 border border-[#2a313d]'
                          }`}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Kriter Kartları Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredSnowflakeChecks.map(({ axisKey, axisLabel, check }) => {
                      const isPassed = check.passed;
                      return (
                        <div
                          key={check.id}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isPassed
                              ? 'bg-[#121c17] border-emerald-900/40 hover:border-emerald-700/60'
                              : 'bg-[#1c1517] border-rose-950/40 hover:border-rose-800/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                              {axisLabel}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono inline-flex items-center gap-1 ${
                                isPassed
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {isPassed ? '✓ Geçti' : '✗ Geçmedi'}
                            </span>
                          </div>

                          <div className="flex items-start justify-between gap-1.5 mb-2">
                            <h4 className="text-sm font-bold text-white leading-snug">
                              {check.title}
                            </h4>
                            {check.methodology && (
                              <div className="relative group/tip flex-shrink-0">
                                <button
                                  type="button"
                                  className="w-4 h-4 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-mono flex items-center justify-center transition-colors border border-slate-700/60 shadow-sm cursor-help"
                                  aria-label="Hesaplama Metodolojisi"
                                >
                                  i
                                </button>
                                <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover/tip:block group-focus-within/tip:block w-72 p-2.5 rounded-xl bg-[#0c1017] border border-slate-700/80 shadow-2xl text-[11px] text-slate-200 z-50 pointer-events-none leading-relaxed">
                                  <div className="font-semibold text-emerald-400 mb-1 flex items-center gap-1.5 border-b border-white/5 pb-1">
                                    <span className="text-xs">📐</span> Hesaplama Metodolojisi
                                  </div>
                                  <p className="text-slate-300 font-sans">{check.methodology}</p>
                                </div>
                              </div>
                            )}
                          </div>

                          {(check.metricValue || check.threshold) && (
                            <div className="p-2 rounded bg-[#0d1015]/80 border border-white/5 text-xs font-mono space-y-1 mb-2.5">
                              {check.metricValue && (
                                <div className="flex items-center justify-between text-slate-300">
                                  <span className="text-slate-500">Gerçekleşen</span>
                                  <span className="font-semibold text-slate-200">{check.metricValue}</span>
                                </div>
                              )}
                              {check.threshold && (
                                <div className="flex items-center justify-between text-slate-400">
                                  <span className="text-slate-500">Eşik</span>
                                  <span className="text-slate-400">{check.threshold}</span>
                                </div>
                              )}
                            </div>
                          )}

                          <p className="text-xs text-slate-300 leading-relaxed font-sans">
                            {check.detail}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SVG Radar Görseli & 5 Eksen Kartları */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                {/* Sol: Dinamik Renkli Organik SVG Snowflake Radarı (5 Kolon) */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center p-3 bg-[#1d222e] rounded-2xl border border-[#323a4b] relative">
                  <SnowflakeRadar
                    axes={snowflake.axes}
                    ticker={report.ticker}
                    size={280}
                    onSelectSection={(secId) => scrollToSection(secId as any)}
                    showLabels={true}
                  />
                </div>

                {/* Sağ: 5 Eksen Puan Detayı ve İlerleme Barları (7 Kolon) */}
                <div className="lg:col-span-7 space-y-2.5">
                  {Object.values(snowflake.axes).map((axis: any) => {
                    const pct = (axis.score / 6) * 100;
                    const color = axis.score >= 4 ? '#10b981' : axis.score >= 2 ? '#f5c242' : '#ef4444';
                    const topCheck = axis.checks?.[0];

                    return (
                      <div key={axis.key} className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-bold text-white font-mono flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            <span>{axis.label}</span>
                          </span>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-sm text-slate-300">
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
                          <p className="text-sm text-slate-200 leading-normal font-sans" title={topCheck.detail}>
                            {topCheck.passed ? '✓' : '✗'} {topCheck.detail}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Alt Kısım: Öne Çıkan Güçlü Yönler ve Riskler */}
              <ComponentErrorBoundary fallbackTitle="Güçlü/Zayıf Yönler Hatası">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="bg-[#1d222e] border border-emerald-900/40 rounded-xl p-4 sm:p-5 space-y-2.5">
                  <div className="text-[15px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Sparkles className="w-4 h-4" /> Öne Çıkan Güçlü Yönler
                  </div>
                  <div className="space-y-2 text-sm text-slate-200">
                    {snowflake.rewards.slice(0, 3).map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-emerald-400 font-bold">•</span>
                        <span className="leading-relaxed">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#1d222e] border border-amber-900/40 rounded-xl p-4 sm:p-5 space-y-2.5">
                  <div className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <AlertTriangle className="w-4 h-4" /> Dikkat Edilmesi Gereken Riskler
                  </div>
                  <div className="space-y-2 text-sm text-slate-200">
                    {snowflake.risks.slice(0, 3).map((rk, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-amber-400 font-bold">⚠️</span>
                        <span className="leading-relaxed">{rk}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </ComponentErrorBoundary>
            </div>

            {/* ========================================================================= */}
            {/* Özet Finansallar Karşılaştırma Paneli (YoY & QoQ - Terminal Kurgusu)       */}
            {/* ========================================================================= */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h3 className="font-sans text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                    <span>Özet Finansallar</span>
                    <span className="text-xs font-mono font-normal text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                      (Birim: Bin TL)
                    </span>
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Sol Tablo: Özet Gelir Tablosu (YoY) */}
                <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#2e3440] pb-2.5">
                    <h4 className="text-[15px] sm:text-base font-bold text-white tracking-wide">Özet Gelir Tablosu</h4>
                    <span className="text-sm text-slate-400 font-mono">Yıllık Değişim (YoY)</span>
                  </div>

                  <div className="w-full overflow-x-auto touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <table className="w-full text-sm sm:text-[15px] text-left">
                    <thead>
                      <tr className="text-slate-300 border-b border-[#282d37] text-sm">
                        <th className="pb-2.5 font-semibold">Kalem</th>
                        <th className="pb-2.5 text-right font-mono font-bold text-white">{latestFlowLabel}</th>
                        <th className="pb-2.5 text-right font-mono text-slate-300">{yoyFlowLabel || 'Geçen Yıl'}</th>
                        <th className="pb-2.5 text-right font-mono">Değişim</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#282d37] font-mono text-sm sm:text-[15px]">
                      {[
                        { label: currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Satışlar', key: 'revenue', fallback: 'gross_written_premiums' },
                        { label: 'Brüt Kâr', key: 'gross_profit' },
                        { label: 'Esas Faaliyet Kârı', key: 'operating_income', fallback: 'operating_profit' },
                        { label: currentSector === 'INSURANCE' ? 'Teknik Bölüm Dengesi' : 'FAVÖK', key: 'ebitda', fallback: 'technical_balance' },
                        ...(currentSector === 'INSURANCE' ? [{ label: 'Yatırım Gelirleri', key: 'investment_income' }] : []),
                        { label: 'Net Dönem Kârı', key: 'net_income' },
                        { label: 'Nakit ve Nakit Benzerleri', key: 'cash_and_equivalents', fallback: 'cash' }
                      ].map((row, idx) => {
                        const v1 = latestFlow ? (latestFlow[row.key] ?? latestFlow[row.fallback || '']) : null;
                        const v2 = yoyFlow ? (yoyFlow[row.key] ?? yoyFlow[row.fallback || '']) : null;
                        const diff = calcDiffBadge(v1, v2);

                        return (
                          <tr key={idx} className="hover:bg-[#181b20]/60 transition-colors">
                            <td className="py-2.5 font-sans font-medium text-slate-200">{row.label}</td>
                            <td className={`py-2.5 text-right font-bold ${v1 != null && v1 < 0 ? 'text-rose-400' : 'text-white'}`}>
                              {formatTableNumber(v1)}
                            </td>
                            <td className={`py-2.5 text-right ${v2 != null && v2 < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
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

                {/* Sağ Tablo: Özet Bilanço (QoQ) */}
                <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#2e3440] pb-2.5">
                    <h4 className="text-[15px] sm:text-base font-bold text-white tracking-wide">Özet Bilanço</h4>
                    <span className="text-sm text-slate-400 font-mono">QoQ Çeyreklik</span>
                  </div>

                  <div className="w-full overflow-x-auto touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <table className="w-full text-sm sm:text-[15px] text-left">
                    <thead>
                      <tr className="text-slate-300 border-b border-[#282d37] text-sm">
                        <th className="pb-2.5 font-semibold">Kalem</th>
                        <th className="pb-2.5 text-right font-mono font-bold text-white">{latestBS?.period}</th>
                        <th className="pb-2.5 text-right font-mono text-slate-300">{prevBSLabel || 'Önc. Çeyrek'}</th>
                        <th className="pb-2.5 text-right font-mono">Değişim</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#282d37] font-mono text-sm sm:text-[15px]">
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
                            <td className="py-2.5 font-sans font-medium text-slate-200">{row.label}</td>
                            <td className={`py-2.5 text-right font-bold ${v1 != null && v1 < 0 ? 'text-rose-400' : 'text-white'}`}>
                              {formatTableNumber(v1)}
                            </td>
                            <td className={`py-2.5 text-right ${v2 != null && v2 < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
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
            </div>

            {/* Sektörel Akranlar (Açılır/Kapanır Panel & Karar-Puan Sıralı) */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
              <div 
                className="flex items-center justify-between cursor-pointer select-none group"
                onClick={() => setIsPeersOpen(!isPeersOpen)}
                title={isPeersOpen ? "Paneli Daralt" : "Paneli Genişlet"}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center text-[#f5c242] font-bold text-sm">
                    {analyzedCompetitors.length}
                  </div>
                  <div>
                    <h3 className="font-sans text-lg sm:text-xl font-bold text-white group-hover:text-[#f5c242] transition-colors flex items-center gap-2">
                      <span>Sektörel Akranlar</span>
                      <span className="text-xs font-mono font-medium text-slate-400 bg-[#21262d] px-2.5 py-0.5 rounded-full border border-[#2e3440]">
                        {officialSectorName}
                      </span>
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center text-slate-300 group-hover:text-[#f5c242] group-hover:border-[#f5c242]/50 transition shadow-sm">
                    {isPeersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {isPeersOpen && (
                <>
                  {analyzedCompetitors.length > 0 ? (
                    <div className="space-y-4 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {(showAllPeers ? analyzedCompetitors : analyzedCompetitors.slice(0, 3)).map((comp) => {
                          const decStr = String(comp.decision || '').toUpperCase();
                          const isBuy = decStr === 'AL' || decStr === 'GÜÇLÜ AL';
                          const isSell = decStr === 'ALMA' || decStr === 'SAT' || decStr === 'GÜÇLÜ SAT';
                          const badgeBg = isBuy 
                            ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800/60'
                            : isSell
                              ? 'bg-rose-950/70 text-rose-400 border-rose-800/60'
                              : 'bg-amber-950/70 text-amber-400 border-amber-800/60';

                          return (
                            <div
                              key={comp.id}
                              onClick={() => {
                                if (onSelectReport) {
                                  onSelectReport(comp.id);
                                } else if (onSelectTicker) {
                                  onSelectTicker(comp.ticker);
                                }
                              }}
                              className="fv-card bg-[#21262d] hover:bg-[#28303d] border border-[#2e3440] hover:border-[#f5c242]/60 rounded-xl p-4 cursor-pointer flex items-center justify-between group shadow-sm"
                              title={`${comp.ticker} detaylı analizini aç`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-[#181b20] border border-[#2e3440] group-hover:border-[#f5c242]/50 flex items-center justify-center font-black font-mono text-sm text-[#f5c242] shadow-inner transition">
                                  {comp.ticker.slice(0, 4)}
                                </div>
                                <div className="truncate">
                                  <div className="font-bold text-white group-hover:text-[#f5c242] transition flex items-center gap-2">
                                    <span>{comp.ticker}</span>
                                    {comp.score != null && (
                                      <span className="text-[11px] font-mono px-1.5 py-0.5 bg-[#181b20] text-slate-300 rounded border border-[#2e3440]">
                                        {String(comp.score).replace(/\/\s*100\s*$/i, '').trim()}/100
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                                    {comp.price ? `₺${comp.price}` : '—'}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0 pl-2">
                                <div className={`text-xs font-bold font-mono px-2.5 py-1 rounded-md border ${badgeBg} shadow-sm`}>
                                  {comp.decision || 'NÖTR'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {analyzedCompetitors.length > 3 && (
                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAllPeers(prev => !prev)}
                            className="fv-pill inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#21262d] hover:bg-[#2b313d] text-slate-200 hover:text-[#f5c242] border border-[#2e3440] text-xs font-mono font-semibold cursor-pointer"
                          >
                            {showAllPeers ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5" />
                                <span>Daha Az Göster (İlk 3)</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5" />
                                <span>Devamını Göster (+{analyzedCompetitors.length - 3} Şirket)</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {sectorCandidateTickers.length > 0 && (
                        <div className="pt-3 border-t border-[#282d37] flex items-center justify-between flex-wrap gap-2 text-sm text-slate-300">
                          <span className="text-xs sm:text-sm font-medium text-slate-400">Sektördeki diğer akranları analiz et:</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {sectorCandidateTickers.slice(0, 6).map((tk) => (
                              <button
                                key={tk}
                                type="button"
                                onClick={() => onSelectTicker && onSelectTicker(tk)}
                                className="px-2.5 py-1 bg-[#21262d] hover:bg-[#2e3440] text-[#f5c242] hover:text-white rounded-lg border border-[#2e3440] hover:border-[#f5c242]/40 text-xs font-mono font-bold cursor-pointer transition shadow-sm"
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
                    <div className="bg-[#21262d] rounded-xl p-4 text-sm text-slate-300 flex items-center justify-between flex-wrap gap-3">
                  <span>Bu sektörde henüz başka bir şirket analiz edilmedi. Sektörel akranları ekleyebilirsiniz:</span>
                      <div className="flex items-center gap-2 flex-wrap">
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
                </>
              )}
            </div>

          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 1: GRAFİKLER (#sec-grafikler)                                     */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Grafik Terminali Hatası">
          <section id="sec-grafikler" className={`scroll-mt-28 rounded-2xl border bg-[#101319] p-6 sm:p-7 shadow-xl space-y-6 transition-all ${highlightedTargetId === 'sec-grafikler' ? 'border-[#f5c242] ring-2 ring-[#f5c242]/60 animate-pulse shadow-[0_0_28px_rgba(245,194,66,0.25)]' : 'border-[#242a35]'}`}>
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">1</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Grafikler</h2>
              </div>
            </div>

            {/* 1.1 Çeyreklik Temel Finansallar */}
            {(() => {
              const barSlice = (chartPeriodMode === 'ttm' ? chartData : (quarterlyChartData.length > 0 ? quarterlyChartData : chartData)).slice(-5);
              return (
            <div className="space-y-3">
              <div className="text-base font-bold text-white flex items-center gap-2">
                <span>1.1 Çeyreklik Temel Finansallar</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Çeyreklik Satışlar */}
                <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-2xl space-y-3">
                  <div className="text-[15px] font-bold text-slate-100">
                    {chartPeriodMode === 'ttm' ? 'Yıllıklandırılmış (TTM) Satışlar' : (currentSector === 'INSURANCE' ? 'Çeyreklik Prim Üretimi' : 'Çeyreklik Satışlar')}
                  </div>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={barSlice}
                        margin={{ top: 12, right: 8, left: 8, bottom: 4 }}
                      >
                        <ReferenceLine y={0} stroke="#252a36" strokeWidth={1} />
                        <XAxis
                          dataKey="period"
                          stroke="#64748b"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                          tickFormatter={(v: string) => v ? v.replace(/\/0(\d)/, '/$1') : ''}
                        />
                        <YAxis stroke="#6b7280" hide domain={getZeroAnchoredBarDomain(barSlice, 'revenue')} />
                        <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
                        <Bar
                          dataKey="revenue"
                          shape={renderFinancialBar}
                          barSize={32}
                          maxBarSize={38}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2. Çeyreklik FAVÖK */}
                <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-2xl space-y-3">
                  <div className="text-[15px] font-bold text-slate-100">
                    {chartPeriodMode === 'ttm' ? 'Yıllıklandırılmış (TTM) FAVÖK' : (currentSector === 'INSURANCE' ? 'Teknik Bölüm Dengesi' : 'Çeyreklik FAVÖK')}
                  </div>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={barSlice}
                        margin={{ top: 12, right: 8, left: 8, bottom: 4 }}
                      >
                        <ReferenceLine y={0} stroke="#252a36" strokeWidth={1} />
                        <XAxis
                          dataKey="period"
                          stroke="#64748b"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                          tickFormatter={(v: string) => v ? v.replace(/\/0(\d)/, '/$1') : ''}
                        />
                        <YAxis stroke="#6b7280" hide domain={getZeroAnchoredBarDomain(barSlice, 'ebitda')} />
                        <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
                        <Bar
                          dataKey="ebitda"
                          shape={renderFinancialBar}
                          barSize={32}
                          maxBarSize={38}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3. Çeyreklik Net Kâr */}
                <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-2xl space-y-3">
                  <div className="text-[15px] font-bold text-slate-100">
                    {chartPeriodMode === 'ttm' ? 'Yıllıklandırılmış (TTM) Net Kâr' : 'Çeyreklik Net Kâr'}
                  </div>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={barSlice}
                        margin={{ top: 12, right: 8, left: 8, bottom: 4 }}
                      >
                        <ReferenceLine y={0} stroke="#252a36" strokeWidth={1} />
                        <XAxis
                          dataKey="period"
                          stroke="#64748b"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'monospace' }}
                          tickFormatter={(v: string) => v ? v.replace(/\/0(\d)/, '/$1') : ''}
                        />
                        <YAxis stroke="#6b7280" hide domain={getZeroAnchoredBarDomain(barSlice, 'net_income')} />
                        <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
                        <Bar
                          dataKey="net_income"
                          shape={renderFinancialBar}
                          barSize={32}
                          maxBarSize={38}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
              );
            })()}

            {/* 1.2 Kârlılık ve Marj Trendleri (6'lı Marj Sparkline Kartları) */}
            <div className="space-y-3">
              <div className="text-base font-bold text-white flex items-center gap-2">
                <span>1.2 Kârlılık ve Marj Trendleri</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sparklineMetrics.map((mini) => {
                const values = mini.data.map(d => d.val).filter((v): v is number => v != null && Number.isFinite(v));
                const isUptrend = values.length >= 2 && values[values.length - 1]! >= values[0]!;
                const trendColor = values.length === 0 ? '#94a3b8' : (isUptrend ? '#10b981' : '#f87171');
                const latestVal = values.length > 0 ? values[values.length - 1]! : null;

                return (
                  <div key={mini.id} className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-4 shadow-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-bold text-white">{mini.title}</span>
                      <span className="font-mono text-sm font-bold" style={{ color: trendColor }}>
                        {latestVal != null ? mini.format(latestVal) : '—'}
                      </span>
                    </div>
                    <div className="h-24 w-full">
                      {values.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={mini.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                          <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 9, fill: '#9ca3af' }} />
                          <YAxis stroke="#6b7280" tick={{ fontSize: 9, fill: '#9ca3af' }} hide domain={['auto', 'auto']} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const d = payload[0];
                                const valNum = Number(d.value);
                                const displayVal = Number.isFinite(valNum) ? (mini.format ? mini.format(valNum) : `%${valNum.toFixed(1)}`) : '—';
                                return (
                                  <div className="bg-[#1c2027] border border-[#383e4d] px-2 py-1 rounded-md shadow-lg text-xs font-mono">
                                    <span className="font-bold text-white">{displayVal}</span>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Line type="monotone" dataKey="val" stroke={trendColor} strokeWidth={2} dot={{ r: 2.5, fill: trendColor }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">Veri Yok</div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* TERMINALDEKİ 4 ADET KANONİK GRAFİK (TÜM TARİHSEL SERİ İLE)                 */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Grafik 1: Satışlar ve Kârlılık */}
              <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-base font-bold text-white">
                    {currentSector === 'INSURANCE' ? '1.3 Prim Üretimi ve Kârlılık' : '1.3 Satışlar ve Kârlılık'}
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={active4ChartsFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => formatMrTl(v, true)} domain={chart13YDomain} />
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', paddingTop: '8px', paddingLeft: '8px' }} />
                      <Bar dataKey="revenue" name={currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Hasılat'} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32} legendType="square">
                        {active4ChartsFlowData.map((entry, idx) => (
                          <Cell key={`canon-rev-${idx}`} fill={(entry.revenue != null && entry.revenue < 0) ? '#ef4444' : '#3b82f6'} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="ebitda" name={currentSector === 'INSURANCE' ? 'Teknik Kâr' : 'FAVÖK'} stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} legendType="line" />
                      <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} legendType="line" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grafik 2: Satışlar ve Hisse Fiyatı */}
              <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-base font-bold text-white">
                    {currentSector === 'INSURANCE' ? '1.4 Prim Üretimi ve Hisse Fiyatı' : '1.4 Satışlar ve Hisse Fiyatı'}
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={active4ChartsFlowData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis yAxisId="left" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => formatMrTl(v, true)} />
                      <YAxis yAxisId="right" orientation="right" stroke="#10b981" tick={{ fontSize: 10, fill: '#34d399' }} tickFormatter={(v) => `${v} TL`} />
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', paddingTop: '8px', paddingLeft: '8px' }} />
                      <Bar yAxisId="left" dataKey="revenue" name={currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Hasılat'} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} legendType="square">
                        {active4ChartsFlowData.map((entry, idx) => (
                          <Cell key={`canon-rev2-${idx}`} fill={(entry.revenue != null && entry.revenue < 0) ? '#ef4444' : '#3b82f6'} />
                        ))}
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="share_price" name="Hisse Fiyatı (TL)" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} legendType="line" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grafik 3: Nakit Akışı Kalitesi */}
              <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-base font-bold text-white">1.5 Nakit Akışı Kalitesi</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={active4ChartsFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => formatMrTl(v, true)} domain={chart15YDomain} />
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', paddingTop: '8px', paddingLeft: '8px' }} />
                      <Bar dataKey="operating_cash_flow" name="İşletme Nakit Akışı" fill="#0284c7" fillOpacity={0.9} radius={[3, 3, 0, 0]} maxBarSize={32} legendType="square">
                        {active4ChartsFlowData.map((entry, idx) => (
                          <Cell key={`canon-ocf-${idx}`} fill={(entry.operating_cash_flow != null && entry.operating_cash_flow < 0) ? '#f43f5e' : '#0284c7'} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} legendType="line" />
                      <Line type="monotone" dataKey="free_cash_flow" name="Serbest Nakit (FCF)" stroke="#f59e0b" strokeWidth={2.2} strokeDasharray="4 4" dot={{ r: 2.5, fill: '#f59e0b' }} legendType="line" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grafik 4: Bilanço Gücü: Özsermaye ve Nakit */}
              <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-base font-bold text-white">1.6 Bilanço Gücü: Özsermaye ve Borç/Nakit</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => formatMrTl(v, true)} />
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '11px', paddingTop: '8px', paddingLeft: '8px' }} />
                      <Bar dataKey="equity" name="Özkaynaklar" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} legendType="square">
                        {chartData.map((entry, idx) => (
                          <Cell key={`canon-equity-${idx}`} fill={(entry.equity != null && entry.equity < 0) ? '#ef4444' : '#10b981'} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="cash_and_equivalents" name="Nakit & Benzerleri" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 3, fill: '#06b6d4' }} legendType="line" />
                      <Line type="monotone" dataKey="financial_debt" name="Finansal Borçlar" stroke="#f43f5e" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2.5, fill: '#f43f5e' }} legendType="line" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 2: FİNANSAL TABLOLAR (#sec-tablolar)                              */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Finansal Tablolar Hatası">
          <section id="sec-tablolar" className={`scroll-mt-28 rounded-2xl border bg-[#101319] p-6 sm:p-7 shadow-xl space-y-6 transition-all ${highlightedTargetId === 'sec-tablolar' ? 'border-[#f5c242] ring-2 ring-[#f5c242]/60 animate-pulse shadow-[0_0_28px_rgba(245,194,66,0.25)]' : 'border-[#242a35]'}`}>
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">2</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Finansal Tablolar</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {Object.values(collapsedSections).some(Boolean) && (
                  <button
                    type="button"
                    onClick={() => setCollapsedSections({})}
                    className="text-xs font-mono text-[#f5c242] hover:text-amber-300 bg-[#21262d] hover:bg-[#2a313c] px-2.5 py-1 rounded-lg border border-[#2e3440] transition cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    Tüm Başlıkları Aç
                  </button>
                )}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 2.1 RESMİ FİNANSAL TABLOLAR (6 Dönem Fix, Sayfalama Okları, Kategori Blokları) */}
            {/* ========================================================================= */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
              
              {/* Tablo Üst Kontrol & Alt Sekme Çubuğu */}
              <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-[#282d37]">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-base sm:text-lg font-bold text-white">2.1 Çeyreklik Mali Tablolar</span>
                </div>
                <div className="flex items-center gap-1 bg-[#21262d] p-1 rounded-xl border border-[#2e3440] text-sm font-semibold">
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
                      className={`px-3.5 py-1.5 rounded-lg text-sm transition cursor-pointer ${
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
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                        isHeatmapActive
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-[#21262d] text-slate-400 border-[#2e3440] hover:text-white'
                      }`}
                    >
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Isı Haritası: {isHeatmapActive ? 'Açık' : 'Kapalı'}</span>
                    </button>
                  )}
                  <span className="text-sm font-mono text-slate-300">
                    {selectedTableTab === 'ratios' ? 'Birim: Oran / Katsayı' : 'Birim: Bin TRY'}
                  </span>

                </div>
              </div>

              {/* Finansal Tablo Grid */}
              <div className="w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden border border-[#282d37]/50 rounded-xl touch-pan-x">
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-[#282d37] text-slate-400 bg-[#21262d]/90">
                      <th className="p-3 text-white font-sans font-bold text-xs sm:text-sm min-w-[170px] sm:min-w-[200px] sticky left-0 bg-[#21262d] z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
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
                          <th key={c.period} className="py-2.5 px-2 text-right text-slate-300 font-mono text-xs min-w-[90px] sm:min-w-[105px]">
                            <div className="flex items-center justify-end whitespace-nowrap gap-1">
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
                              <span className="w-8 flex-shrink-0 text-left pl-0.5 inline-block">
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
                    {/* 1. BİLANÇO GÖRÜNÜMÜ (Açılır/Kapanır Kategoriler) */}
                    {selectedTableTab === 'bs' && balanceSheetSections.map((sec) => {
                      const isCollapsed = Boolean(collapsedSections[sec.id]);
                      return (
                        <React.Fragment key={sec.id}>
                          {/* Kategori Başlık Çubuğu (Tıklanabilir Akordeon) */}
                          <tr
                            onClick={() => toggleSectionCollapse(sec.id)}
                            className="bg-[#1f242c] hover:bg-[#282f3a] border-t border-b border-[#2b313d] cursor-pointer select-none transition-colors group"
                            title={isCollapsed ? 'Kategoriyi genişlet' : 'Kategoriyi daralt'}
                          >
                            <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <ChevronDown className={`w-4 h-4 text-[#f5c242] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
                                  <span className="font-sans font-bold text-slate-100 text-[15px] tracking-wide group-hover:text-white">
                                    {sec.title}
                                  </span>
                                  <span className="text-xs font-mono text-slate-400 bg-[#16191f] px-2 py-0.5 rounded-full border border-[#2b313d]">
                                    {sec.rows.length} kalem
                                  </span>
                                </div>
                                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition font-sans pr-2">
                                  {isCollapsed ? 'Genişlet ▼' : 'Daralt ▲'}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {!isCollapsed && (
                            <>
                              {/* Alt Kalem Satırları */}
                              {sec.rows.map((row) => (
                                <tr
                                  key={row.key}
                                  id={`fin-row-${row.key}`}
                                  onMouseEnter={() => setHoveredRowKey(row.key)}
                                  onMouseLeave={() => setHoveredRowKey(null)}
                                  onClick={() => setHoveredRowKey(prev => prev === row.key ? null : row.key)}
                                  className={`border-b border-[#222730] transition-all cursor-pointer ${
                                    highlightedTargetId === `fin-row-${row.key}`
                                      ? 'ring-2 ring-[#f5c242] bg-[#f5c242]/20 animate-pulse shadow-[0_0_20px_rgba(245,194,66,0.35)]'
                                      : 'hover:bg-[#1f242c]/50'
                                  }`}
                                >
                                  <td className={`py-2.5 px-3 pl-6 font-sans text-sm truncate min-w-[170px] sm:min-w-[200px] sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] ${
                                    highlightedTargetId === `fin-row-${row.key}` ? 'bg-[#332a12] text-[#f5c242] font-bold' : 'bg-[#181b20] text-slate-200 font-normal'
                                  }`} title={row.label}>
                                    {row.label}
                                  </td>
                                  {visiblePeriods.map((c, colIdx) =>
                                    renderDataCell(c, colIdx, row.key, (row as any).fallbackKey, row.key, false, false, (row as any).invert)
                                  )}
                                </tr>
                              ))}

                              {/* Kategori Toplam Satırı */}
                              <tr
                                id={`fin-row-${sec.totalKey}`}
                                onMouseEnter={() => setHoveredRowKey(`total-${sec.id}`)}
                                onMouseLeave={() => setHoveredRowKey(null)}
                                onClick={() => setHoveredRowKey(prev => prev === `total-${sec.id}` ? null : `total-${sec.id}`)}
                                className={`border-t border-b border-[#2e3542] transition-all cursor-pointer ${
                                  highlightedTargetId === `fin-row-${sec.totalKey}`
                                    ? 'ring-2 ring-[#f5c242] bg-[#f5c242]/25 animate-pulse shadow-[0_0_24px_rgba(245,194,66,0.4)]'
                                    : 'bg-[#1a1e24] hover:bg-[#222832]'
                                }`}
                              >
                                <td className={`py-2.5 px-3 font-sans font-bold text-[15px] truncate min-w-[170px] sm:min-w-[200px] sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] ${
                                  highlightedTargetId === `fin-row-${sec.totalKey}` ? 'bg-[#3b3014] text-[#f5c242]' : 'bg-[#1a1e24] text-white'
                                }`}>
                                  {sec.totalLabel}
                                </td>
                                {visiblePeriods.map((c, colIdx) =>
                                  renderDataCell(c, colIdx, sec.totalKey, undefined, `total-${sec.id}`, true, false)
                                )}
                              </tr>

                              {/* Genel Toplam Satırı (Aktifler / Yükümlülükler) */}
                              {sec.grandTotalLabel && sec.grandTotalKey && (
                                <tr
                                  id={`fin-row-${sec.grandTotalKey}`}
                                  onMouseEnter={() => setHoveredRowKey(`grand-${sec.id}`)}
                                  onMouseLeave={() => setHoveredRowKey(null)}
                                  onClick={() => setHoveredRowKey(prev => prev === `grand-${sec.id}` ? null : `grand-${sec.id}`)}
                                  className={`border-t-2 border-b-2 border-[#f5c242]/40 font-bold transition-all cursor-pointer ${
                                    highlightedTargetId === `fin-row-${sec.grandTotalKey}`
                                      ? 'ring-2 ring-[#f5c242] bg-[#f5c242]/30 animate-pulse shadow-[0_0_26px_rgba(245,194,66,0.45)]'
                                      : 'bg-[#242a35] hover:bg-[#2c3442]'
                                  }`}
                                >
                                  <td className="py-3 px-3 font-sans font-extrabold text-[#f5c242] text-base tracking-wide truncate min-w-[170px] sm:min-w-[200px] sticky left-0 bg-[#242a35] z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                    {sec.grandTotalLabel}
                                  </td>
                                  {visiblePeriods.map((c, colIdx) =>
                                    renderDataCell(c, colIdx, sec.grandTotalKey!, undefined, `grand-${sec.id}`, true, true)
                                  )}
                                </tr>
                              )}

                              {/* Ekstra Satır (Örn: Net Borç) */}
                              {sec.extraRow && (
                                <tr
                                  id={`fin-row-${sec.extraRow.key}`}
                                  onMouseEnter={() => setHoveredRowKey(`extra-${sec.id}`)}
                                  onMouseLeave={() => setHoveredRowKey(null)}
                                  onClick={() => setHoveredRowKey(prev => prev === `extra-${sec.id}` ? null : `extra-${sec.id}`)}
                                  className={`border-b border-[#2e3542] transition-all cursor-pointer ${
                                    highlightedTargetId === `fin-row-${sec.extraRow.key}`
                                      ? 'ring-2 ring-[#f5c242] bg-[#f5c242]/25 animate-pulse shadow-[0_0_24px_rgba(245,194,66,0.4)]'
                                      : 'bg-[#1a1e24] hover:bg-[#222832]'
                                  }`}
                                >
                                  <td className={`py-2.5 px-3 pl-4 font-sans font-semibold text-sm truncate min-w-[170px] sm:min-w-[200px] sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] ${
                                    highlightedTargetId === `fin-row-${sec.extraRow.key}` ? 'bg-[#3b3014] text-[#f5c242]' : 'bg-[#1a1e24] text-slate-200'
                                  }`}>
                                    {sec.extraRow.label}
                                  </td>
                                  {visiblePeriods.map((c, colIdx) =>
                                    renderDataCell(c, colIdx, sec.extraRow.key, undefined, `extra-${sec.id}`, true, false, true)
                                  )}
                                </tr>
                              )}
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* 2. GELİR TABLOSU GÖRÜNÜMÜ (Açılır/Kapanır Kategoriler) */}
                    {selectedTableTab === 'is' && incomeStatementSections.map((sec) => {
                      const isCollapsed = Boolean(collapsedSections[sec.id]);
                      return (
                        <React.Fragment key={sec.id}>
                          <tr
                            onClick={() => toggleSectionCollapse(sec.id)}
                            className="bg-[#1f242c] hover:bg-[#282f3a] border-t border-b border-[#2b313d] cursor-pointer select-none transition-colors group"
                            title={isCollapsed ? 'Kategoriyi genişlet' : 'Kategoriyi daralt'}
                          >
                            <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <ChevronDown className={`w-4 h-4 text-[#f5c242] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
                                  <span className="font-sans font-bold text-slate-100 text-[15px] tracking-wide group-hover:text-white">
                                    {sec.title}
                                  </span>
                                  <span className="text-xs font-mono text-slate-400 bg-[#16191f] px-2 py-0.5 rounded-full border border-[#2b313d]">
                                    {sec.rows.length} kalem
                                  </span>
                                </div>
                                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition font-sans pr-2">
                                  {isCollapsed ? 'Genişlet ▼' : 'Daralt ▲'}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {!isCollapsed && (
                            <>
                              {sec.rows.map((row) => (
                                <tr
                                  key={row.key}
                                  id={`fin-row-${row.key}`}
                                  onMouseEnter={() => setHoveredRowKey(row.key)}
                                  onMouseLeave={() => setHoveredRowKey(null)}
                                  onClick={() => setHoveredRowKey(prev => prev === row.key ? null : row.key)}
                                  className={`border-b border-[#222730] transition-all cursor-pointer ${
                                    highlightedTargetId === `fin-row-${row.key}`
                                      ? 'ring-2 ring-[#f5c242] bg-[#f5c242]/20 animate-pulse shadow-[0_0_20px_rgba(245,194,66,0.35)]'
                                      : 'hover:bg-[#1f242c]/50'
                                  }`}
                                >
                                  <td className={`py-2.5 px-3 pl-6 font-sans text-sm truncate min-w-[170px] sm:min-w-[200px] sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] ${
                                    highlightedTargetId === `fin-row-${row.key}` ? 'bg-[#332a12] text-[#f5c242] font-bold' : 'bg-[#181b20] text-slate-200 font-normal'
                                  }`} title={row.label}>
                                    {row.label}
                                  </td>
                                  {visiblePeriods.map((c, colIdx) =>
                                    renderDataCell(c, colIdx, row.key, (row as any).fallbackKey, row.key, false, false, (row as any).invert)
                                  )}
                                </tr>
                              ))}

                              <tr
                                id={`fin-row-${sec.totalKey}`}
                                onMouseEnter={() => setHoveredRowKey(`total-${sec.id}`)}
                                onMouseLeave={() => setHoveredRowKey(null)}
                                onClick={() => setHoveredRowKey(prev => prev === `total-${sec.id}` ? null : `total-${sec.id}`)}
                                className={`border-t border-b border-[#2e3542] transition-all cursor-pointer ${
                                  highlightedTargetId === `fin-row-${sec.totalKey}`
                                    ? 'ring-2 ring-[#f5c242] bg-[#f5c242]/25 animate-pulse shadow-[0_0_24px_rgba(245,194,66,0.4)]'
                                    : 'bg-[#1a1e24] hover:bg-[#222832]'
                                }`}
                              >
                                <td className={`py-2.5 px-3 font-sans font-bold text-[15px] truncate min-w-[170px] sm:min-w-[200px] sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] ${
                                  highlightedTargetId === `fin-row-${sec.totalKey}` ? 'bg-[#3b3014] text-[#f5c242]' : 'bg-[#1a1e24] text-white'
                                }`}>
                                  {sec.totalLabel}
                                </td>
                                {visiblePeriods.map((c, colIdx) =>
                                  renderDataCell(c, colIdx, sec.totalKey, undefined, `total-${sec.id}`, true, false)
                                )}
                              </tr>

                              {sec.grandTotalLabel && sec.grandTotalKey && (
                                <tr
                                  id={`fin-row-${sec.grandTotalKey}`}
                                  onMouseEnter={() => setHoveredRowKey(`grand-${sec.id}`)}
                                  onMouseLeave={() => setHoveredRowKey(null)}
                                  onClick={() => setHoveredRowKey(prev => prev === `grand-${sec.id}` ? null : `grand-${sec.id}`)}
                                  className={`border-t-2 border-b-2 border-[#f5c242]/40 font-bold transition-all cursor-pointer ${
                                    highlightedTargetId === `fin-row-${sec.grandTotalKey}`
                                      ? 'ring-2 ring-[#f5c242] bg-[#f5c242]/30 animate-pulse shadow-[0_0_26px_rgba(245,194,66,0.45)]'
                                      : 'bg-[#242a35] hover:bg-[#2c3442]'
                                  }`}
                                >
                                  <td className="py-3 px-3 font-sans font-extrabold text-[#f5c242] text-base tracking-wide truncate min-w-[170px] sm:min-w-[200px] sticky left-0 bg-[#242a35] z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                    {sec.grandTotalLabel}
                                  </td>
                                  {visiblePeriods.map((c, colIdx) =>
                                    renderDataCell(c, colIdx, sec.grandTotalKey!, undefined, `grand-${sec.id}`, true, true)
                                  )}
                                </tr>
                              )}
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* 3. NAKİT AKIŞI GÖRÜNÜMÜ (Açılır/Kapanır Kategoriler) */}
                    {selectedTableTab === 'cf' && cashFlowSections.map((sec) => {
                      const isCollapsed = Boolean(collapsedSections[sec.id]);
                      return (
                        <React.Fragment key={sec.id}>
                          <tr
                            onClick={() => toggleSectionCollapse(sec.id)}
                            className="bg-[#1f242c] hover:bg-[#282f3a] border-t border-b border-[#2b313d] cursor-pointer select-none transition-colors group"
                            title={isCollapsed ? 'Kategoriyi genişlet' : 'Kategoriyi daralt'}
                          >
                            <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <ChevronDown className={`w-4 h-4 text-[#f5c242] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
                                  <span className="font-sans font-bold text-slate-100 text-[15px] tracking-wide group-hover:text-white">
                                    {sec.title}
                                  </span>
                                  <span className="text-xs font-mono text-slate-400 bg-[#16191f] px-2 py-0.5 rounded-full border border-[#2b313d]">
                                    {sec.rows.length} kalem
                                  </span>
                                </div>
                                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition font-sans pr-2">
                                  {isCollapsed ? 'Genişlet ▼' : 'Daralt ▲'}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {!isCollapsed && (
                            <>
                              {sec.rows.map((row) => (
                                <tr
                                  key={row.key}
                                  id={`fin-row-${row.key}`}
                                  onMouseEnter={() => setHoveredRowKey(row.key)}
                                  onMouseLeave={() => setHoveredRowKey(null)}
                                  onClick={() => setHoveredRowKey(prev => prev === row.key ? null : row.key)}
                                  className={`border-b border-[#222730] transition-all cursor-pointer ${
                                    highlightedTargetId === `fin-row-${row.key}`
                                      ? 'ring-2 ring-[#f5c242] bg-[#f5c242]/20 animate-pulse shadow-[0_0_20px_rgba(245,194,66,0.35)]'
                                      : 'hover:bg-[#1f242c]/50'
                                  }`}
                                >
                                  <td className={`py-2.5 px-3 pl-6 font-sans text-sm truncate min-w-[170px] sm:min-w-[200px] sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] ${
                                    highlightedTargetId === `fin-row-${row.key}` ? 'bg-[#332a12] text-[#f5c242] font-bold' : 'bg-[#181b20] text-slate-200 font-normal'
                                  }`} title={row.label}>
                                    {row.label}
                                  </td>
                                  {visiblePeriods.map((c, colIdx) =>
                                    renderDataCell(c, colIdx, row.key, (row as any).fallbackKey, row.key, false, false, (row as any).invert)
                                  )}
                                </tr>
                              ))}

                              <tr
                                id={`fin-row-${sec.totalKey}`}
                                onMouseEnter={() => setHoveredRowKey(`total-${sec.id}`)}
                                onMouseLeave={() => setHoveredRowKey(null)}
                                onClick={() => setHoveredRowKey(prev => prev === `total-${sec.id}` ? null : `total-${sec.id}`)}
                                className={`border-t border-b border-[#2e3542] transition-all cursor-pointer ${
                                  highlightedTargetId === `fin-row-${sec.totalKey}`
                                    ? 'ring-2 ring-[#f5c242] bg-[#f5c242]/25 animate-pulse shadow-[0_0_24px_rgba(245,194,66,0.4)]'
                                    : 'bg-[#1a1e24] hover:bg-[#222832]'
                                }`}
                              >
                                <td className={`py-2.5 px-3 font-sans font-bold text-[15px] truncate min-w-[170px] sm:min-w-[200px] sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] ${
                                  highlightedTargetId === `fin-row-${sec.totalKey}` ? 'bg-[#3b3014] text-[#f5c242]' : 'bg-[#1a1e24] text-white'
                                }`}>
                                  {sec.totalLabel}
                                </td>
                                {visiblePeriods.map((c, colIdx) =>
                                  renderDataCell(c, colIdx, sec.totalKey, undefined, `total-${sec.id}`, true, false)
                                )}
                              </tr>
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {/* 4. RASYOLAR GÖRÜNÜMÜ (Açılır/Kapanır Kategoriler) */}
                    {selectedTableTab === 'ratios' && ratiosSections.map((sec) => {
                      const isCollapsed = Boolean(collapsedSections[sec.id]);
                      return (
                        <React.Fragment key={sec.id}>
                          <tr
                            onClick={() => toggleSectionCollapse(sec.id)}
                            className="bg-[#1f242c] hover:bg-[#282f3a] border-t border-b border-[#2b313d] cursor-pointer select-none transition-colors group"
                            title={isCollapsed ? 'Kategoriyi genişlet' : 'Kategoriyi daralt'}
                          >
                            <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <ChevronDown className={`w-4 h-4 text-[#f5c242] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} />
                                  <span className="font-sans font-bold text-slate-100 text-[15px] tracking-wide group-hover:text-white">
                                    {sec.title}
                                  </span>
                                  <span className="text-xs font-mono text-slate-400 bg-[#16191f] px-2 py-0.5 rounded-full border border-[#2b313d]">
                                    {sec.rows.length} oran
                                  </span>
                                </div>
                                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition font-sans pr-2">
                                  {isCollapsed ? 'Genişlet ▼' : 'Daralt ▲'}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {!isCollapsed && sec.rows.map((row, idx) => (
                            <tr
                              key={idx}
                              id={`fin-row-${row.key}`}
                              onMouseEnter={() => setHoveredRowKey(`ratio-${sec.id}-${idx}`)}
                              onMouseLeave={() => setHoveredRowKey(null)}
                              className={`border-b border-[#222730] transition-colors ${
                                highlightedTargetId === `fin-row-${row.key}`
                                  ? 'ring-2 ring-[#f5c242] bg-[#f5c242]/20 animate-pulse shadow-[0_0_20px_rgba(245,194,66,0.35)]'
                                  : 'hover:bg-[#1f242c]/50'
                              }`}
                            >
                              <td className={`py-2.5 px-3 pl-6 font-sans text-sm truncate min-w-[170px] sm:min-w-[200px] sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] ${
                                highlightedTargetId === `fin-row-${row.key}`
                                  ? 'bg-[#332a12] text-[#f5c242] font-bold'
                                  : `bg-[#181b20] ${row.isHighlight ? 'font-bold text-white' : 'font-normal text-slate-200'}`
                              }`} title={row.label}>
                                {row.label}
                              </td>
                              {visiblePeriods.map((c) => {
                                const rawVal = (row as any).raw ? (row as any).raw(c) : null;
                                const hmClass = getRatioHeatmapClass((row as any).key, rawVal, currentSector);
                                return (
                                  <td
                                    key={c.period}
                                    className={`py-2.5 px-2 text-right font-mono text-sm font-bold transition-colors whitespace-nowrap ${
                                      hmClass ? hmClass : (row.isHighlight ? 'text-[#f5c242]' : 'text-slate-200')
                                    }`}
                                  >
                                    <div className="flex items-center justify-end whitespace-nowrap gap-1">
                                      <span className="tabular-nums tracking-tight">{row.calc(c)}</span>
                                      <span className="w-8 flex-shrink-0" />
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 3: ÇARPANLAR (#sec-carpanlar)                                     */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Çarpan Analizi Hatası">
          <section id="sec-carpanlar" className={`scroll-mt-28 rounded-2xl border bg-[#101319] p-6 sm:p-7 shadow-xl space-y-6 transition-all ${highlightedTargetId === 'sec-carpanlar' ? 'border-[#f5c242] ring-2 ring-[#f5c242]/60 animate-pulse shadow-[0_0_28px_rgba(245,194,66,0.25)]' : 'border-[#242a35]'}`}>
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">3</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Çarpanlar</h2>
              </div>
            </div>

            {/* 3.1 BIST Sektör Medyanları Benchmark Kıyası */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#282d37] pb-3">
                <span className="font-sans text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>3.1 Sektör Karşılaştırması</span>
                  {marketMultiples?.sector_averages?.sector_name ? (
                    <span className="text-xs font-normal text-slate-400 font-mono">
                      ({marketMultiples.sector_averages.sector_name})
                    </span>
                  ) : null}
                </span>
                {(companyMultiplesData?.compositeZScore != null || companyMultiplesData?.residualAlphaLabel) && (
                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border ${
                    companyMultiplesData?.residualAlphaStatus === 'UNDERVALUED_QUALITY'
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                      : companyMultiplesData?.residualAlphaStatus === 'OVERVALUED'
                      ? 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                      : companyMultiplesData?.residualAlphaStatus === 'JUSTIFIED_DISCOUNT'
                      ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                      : 'bg-[#21262d] text-slate-300 border-[#2e3440]'
                  }`}>
                    {companyMultiplesData?.compositeZScore != null
                      ? `Z-Skor: ${companyMultiplesData.compositeZScore > 0 ? '+' : ''}${Number(companyMultiplesData.compositeZScore).toFixed(2)}σ`
                      : ''}
                    {companyMultiplesData?.compositeZScore != null && companyMultiplesData?.residualAlphaLabel ? ' • ' : ''}
                    {companyMultiplesData?.residualAlphaLabel || ''}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {
                  label: 'F/K',
                  rawVal: (companyMultiplesData?.multiples?.pe?.companyValue && companyMultiplesData.multiples.pe.companyValue > 0)
                    ? companyMultiplesData.multiples.pe.companyValue
                    : marketMultiples?.pe,
                  benchNum: marketMultiples?.sector_averages?.pe ?? companyMultiplesData?.benchmark?.peMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe ?? 8.5,
                  format: (v: number) => v.toFixed(2),
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'PD/DD',
                  rawVal: (companyMultiplesData?.multiples?.pb?.companyValue && companyMultiplesData.multiples.pb.companyValue > 0)
                    ? companyMultiplesData.multiples.pb.companyValue
                    : marketMultiples?.pb,
                  benchNum: marketMultiples?.sector_averages?.pb ?? companyMultiplesData?.benchmark?.pbMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pb ?? 2.1,
                  format: (v: number) => v.toFixed(2),
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'FD/FAVÖK',
                  rawVal: isMetricDisabled('ev_ebitda', currentSector) ? null : ((companyMultiplesData?.multiples?.evEbitda?.companyValue && companyMultiplesData.multiples.evEbitda.companyValue > 0)
                    ? companyMultiplesData.multiples.evEbitda.companyValue
                    : marketMultiples?.ev_ebitda),
                  benchNum: isMetricDisabled('ev_ebitda', currentSector) ? null : (marketMultiples?.sector_averages?.ev_ebitda ?? companyMultiplesData?.benchmark?.evEbitdaMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.evEbitda ?? 7.2),
                  format: (v: number) => v.toFixed(2),
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'FD/Satışlar',
                  rawVal: isMetricDisabled('ev_sales', currentSector) ? null : ((companyMultiplesData?.multiples?.evSales?.companyValue && companyMultiplesData.multiples.evSales.companyValue > 0)
                    ? companyMultiplesData.multiples.evSales.companyValue
                    : marketMultiples?.ev_sales),
                  benchNum: isMetricDisabled('ev_sales', currentSector) ? null : (marketMultiples?.sector_averages?.ev_sales ?? companyMultiplesData?.benchmark?.evSalesMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.evSales ?? 1.8),
                  format: (v: number) => v.toFixed(2),
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'Halka Açıklık',
                  rawVal: canonicalFreeFloatPct,
                  benchNum: 35.0,
                  format: (v: number) => `%${v.toFixed(1)}`,
                  isMultiple: false,
                  customType: 'float' as const
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
                    <div key={i} className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-3.5 text-center space-y-1">
                      <div className="text-xs uppercase font-bold text-slate-400">{c.label}</div>
                      <div className="text-lg font-black font-mono text-[#f5c242] mt-1">{c.valStr}</div>
                      <div className="text-[11px] text-slate-500 font-mono">Ref: {c.benchStr}</div>
                      <div className="pt-1">
                        <span className="inline-block text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-amber-950/40 text-amber-300 border border-amber-800/40">
                          Halka Açık Değer
                        </span>
                      </div>
                    </div>
                  );
                }

                if (c.customType === 'float') {
                  if (c.rawVal == null || !Number.isFinite(Number(c.rawVal))) {
                    return (
                      <div key={i} className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-3.5 text-center space-y-1">
                        <div className="text-xs uppercase font-bold text-slate-400">{c.label}</div>
                        <div className="text-lg font-black font-mono mt-1 text-slate-400">—</div>
                        <div className="text-[11px] text-slate-500 font-mono">Ref: %20–%50 Optimal</div>
                        <div className="pt-1">
                          <span className="inline-block text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-[#21262d] text-slate-400 border border-[#2e3440]">
                            Veri Yok
                          </span>
                        </div>
                      </div>
                    );
                  }
                  const val = Number(c.rawVal);
                  const isOptimal = val >= 20 && val <= 50;
                  return (
                    <div key={i} className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-3.5 text-center space-y-1">
                      <div className="text-xs uppercase font-bold text-slate-400">{c.label}</div>
                      <div className={`text-lg font-black font-mono mt-1 ${isOptimal ? 'text-emerald-400' : 'text-amber-400'}`}>{c.format(val)}</div>
                      <div className="text-[11px] text-slate-500 font-mono">Ref: %20–%50 Optimal</div>
                      <div className="pt-1">
                        <span className={`inline-block text-[11px] font-mono font-medium px-2 py-0.5 rounded-md ${
                          isOptimal ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40' : 'bg-amber-950/40 text-amber-300 border border-amber-800/40'
                        }`}>
                          {isOptimal ? 'Optimal Aralık' : val < 20 ? 'Sığ Dolaşım' : 'Yüksek Dolaşım'}
                        </span>
                      </div>
                    </div>
                  );
                }

                // Eğer metrik A/D (Anlamsız Değer / Sektörel Kapsam Dışı) ise
                if (c.rawVal == null || !Number.isFinite(Number(c.rawVal))) {
                  const isSectorExempt = isMetricDisabled(c.label === 'FD/FAVÖK' ? 'ev_ebitda' : (c.label === 'FD/Satışlar' ? 'ev_sales' : ''), currentSector);
                  const benchText = c.benchNum != null && Number.isFinite(Number(c.benchNum)) && Number(c.benchNum) > 0 ? `Ref: ${Number(c.benchNum).toFixed(2)}` : 'Ref: A/D';
                  return (
                    <div key={i} className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-3.5 text-center space-y-1 transition-colors">
                      <div className="text-xs uppercase font-bold text-slate-400">{c.label}</div>
                      <div className="text-lg font-black font-mono mt-1 text-slate-400">
                        A/D
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {benchText}
                      </div>
                      <div className="pt-1">
                        <span className="inline-block text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-[#21262d] text-slate-400 border border-[#2e3440]">
                          {isSectorExempt ? 'Sektörel Kapsam Dışı' : 'Anlamsız Değer (A/D)'}
                        </span>
                      </div>
                    </div>
                  );
                }

                const rawBench = Number(c.benchNum);
                const hasValidBench = Number.isFinite(rawBench) && rawBench > 0;
                const val = Number(c.rawVal);
                const diffPct = hasValidBench ? ((val - rawBench) / rawBench) * 100 : null;
                const isCheap = diffPct !== null && diffPct <= -8;
                const isExpensive = diffPct !== null && diffPct >= 8;

                const valColor = isCheap ? 'text-emerald-400' : isExpensive ? 'text-rose-400' : 'text-slate-100';
                const cardBorder = isCheap ? 'border-emerald-900/40' : isExpensive ? 'border-rose-900/40' : 'border-[#323a4b]';
                const formattedVal = typeof c.format === 'function' ? c.format(val) : val.toFixed(2);

                return (
                  <div key={i} className={`bg-[#1d222e] border ${cardBorder} rounded-xl p-3.5 text-center space-y-1 transition-colors`}>
                    <div className="text-xs uppercase font-bold text-slate-400">{c.label}</div>
                    <div className={`text-lg font-black font-mono mt-1 ${valColor}`}>
                      {formattedVal}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Ref: {hasValidBench ? rawBench.toFixed(2) : '—'}
                    </div>
                    <div className="pt-1">
                      {!hasValidBench || diffPct === null ? (
                        <span className="inline-block text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-[#21262d] text-slate-400 border border-[#2e3440]">
                          Referans Yok
                        </span>
                      ) : isCheap ? (
                        <span className="inline-block text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                          -%{Math.abs(diffPct).toFixed(0)} İskontolu
                        </span>
                      ) : isExpensive ? (
                        <span className="inline-block text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-rose-950/60 text-rose-400 border border-rose-800/50">
                          +%{diffPct.toFixed(0)} Primli
                        </span>
                      ) : (
                        <span className="inline-block text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-[#21262d] text-slate-300 border border-[#2e3440]">
                          Sektörle Uyumlu
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>

            {/* 3.2 GYO Portföy Verimliliği & 7524 Sayılı Kanun Temettü Uyumu */}
            {currentSector === 'REIT' && (() => {
              const rawNoi = parseFinancialNumber(latestData?.operating_profit ?? latestData?.ebitda ?? latestData?.operating_cash_flow);
              let f = 1.0;
              if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(latestData?.period || '')) f = 4.0;
              else if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(latestData?.period || '')) f = 2.0;
              else if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(latestData?.period || '')) f = 12.0 / 9.0;
              const annualizedNoi = rawNoi !== null ? rawNoi * f : null;
              const portfolio = parseFinancialNumber(latestData?.non_current_assets ?? latestData?.total_assets ?? latestData?.equity);
              const noiCapRate = (annualizedNoi !== null && annualizedNoi > 0 && portfolio !== null && portfolio > 0)
                ? Number(((annualizedNoi / portfolio) * 100).toFixed(1))
                : (valuationInfo?.reit_metrics?.noi_cap_rate ?? null);

              const latestDiv = Array.isArray(resolvedDividends) && resolvedDividends.length > 0 ? resolvedDividends[0] : null;
              const payoutRatio = latestDiv?.payoutRatioPct != null 
                ? Number(latestDiv.payoutRatioPct) 
                : (valuationInfo?.reit_metrics?.payout_ratio ?? null);

              const isNoiGood = noiCapRate !== null && noiCapRate >= 6.5;
              const isPayoutGood = payoutRatio !== null && payoutRatio >= 50.0;

              return (
                <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#282d37] pb-3 gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <span className="font-sans text-base sm:text-lg font-bold text-white">
                        3.2 GYO Portföy ve Temettü Uyumu
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Kart 1: NOI / Cap Rate */}
                    <div className={`p-4 rounded-xl border space-y-2.5 ${isNoiGood ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-[#1d222e] border-[#323a4b]'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Kira Geliri / Portföy Verimliliği (NOI / Cap Rate)
                        </span>
                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${isNoiGood ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-300'}`}>
                          {isNoiGood ? 'Olumlu (Güçlü Portföy Getirisi)' : (noiCapRate !== null ? 'Dengeli' : 'Veri Yok')}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-3">
                        <div className="text-2xl sm:text-3xl font-black font-mono text-white">
                          {noiCapRate !== null ? `%${noiCapRate}` : '—'}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          Referans Eşik: <span className="text-slate-200 font-bold">%6.5+</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed font-sans">
                        {isNoiGood 
                          ? `Sonuç: Olumlu. Yıllıklandırılmış net faaliyet kârı / kira akışı gayrimenkul portföy değerinin %${noiCapRate}'ine ulaşarak BIST GYO eşiğini (>%6.5) aşmıştır. Portföy kâğıt üstünde kalmayıp güçlü nakit üretmektedir.`
                          : (noiCapRate !== null 
                              ? `Sonuç: Dengeli. Portföy kira ve faaliyet kârı verimi %${noiCapRate} seviyesindedir.`
                              : 'Net faaliyet kârı veya duran varlık verisi henüz tam işlenmemiştir.')}
                      </p>
                    </div>

                    {/* Kart 2: Kira Temettü Dönüşüm Katsayısı */}
                    <div className={`p-4 rounded-xl border space-y-2.5 ${isPayoutGood ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-[#1d222e] border-[#323a4b]'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Kira Temettü Dönüşüm Katsayısı (Payout Ratio)
                        </span>
                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${isPayoutGood ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : (payoutRatio !== null && payoutRatio >= 25 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40')}`}>
                          {isPayoutGood ? 'Olumlu (7524 SK Uyumlu)' : (payoutRatio !== null ? 'Takip Edilmeli' : 'Kayıt Yok')}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-3">
                        <div className="text-2xl sm:text-3xl font-black font-mono text-white">
                          {payoutRatio !== null ? `%${payoutRatio}` : '—'}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          Yasal Eşik: <span className="text-slate-200 font-bold">%50.0</span> (7524 SK)
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed font-sans">
                        {isPayoutGood
                          ? `Sonuç: Olumlu. Şirket son kâr payı dağıtımında %${payoutRatio} dağıtma oranına ulaşarak 7524 Sayılı Kanun'un %50 yasal kâr payı istisna şartını sağlamıştır. Kurumlar Vergisi istisnası (%10 asgari vergi tavanıyla) tam güvencededir.`
                          : (payoutRatio !== null 
                              ? `Sonuç: Takip Edilmeli. Dağıtma oranı (%${payoutRatio}) %50 yasal istisna eşiğinin altındadır. Yıl sonuna kadar ek kâr dağıtımı yapılmazsa %30 genel kurumlar vergisi riski oluşabilir.`
                              : '7524 Sayılı Kanun gereğince GYO istisnasından faydalanmak için taşınmaz kazançlarının en az %50\'sinin Haziran sonuna kadar dağıtılması zorunludur.')}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Sektör Karşılaştırma & Çeyreklik Çarpan Trendi (2 Sütunlu Grid) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 3.2 Sektör ve Akran F/K Kıyaslaması (Kompakt ve temiz) */}
              <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-xl space-y-3 flex flex-col justify-between">
                <div>
                  <div className="text-base sm:text-lg font-sans font-bold text-white flex items-center gap-2">
                    <span>3.2 F/K Sektör ve Akran Kıyaslaması</span>
                  </div>
                </div>

                <div className="h-44 w-full">
                  {peerComparisonData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peerComparisonData} layout="vertical" margin={{ top: 5, right: 30, left: 15, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" horizontal={false} />
                      <XAxis type="number" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `${v}x`} />
                      <YAxis dataKey="name" type="category" stroke="#6b7280" tick={{ fontSize: 11, fill: '#e5e7eb' }} />
                      <Tooltip cursor={false} content={<PeerTooltip />} />
                      <Bar dataKey="pe" name="F/K Oranı" maxBarSize={20} radius={[0, 4, 4, 0]}>
                        {peerComparisonData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.isMain ? '#f5c242' : '#38bdf8'} 
                            className={entry.reportId && !entry.isMain ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}
                            onClick={() => {
                              if (!entry.isMain && entry.reportId && onSelectReport) {
                                onSelectReport(entry.reportId);
                              } else if (!entry.isMain && entry.ticker && onSelectTicker) {
                                onSelectTicker(entry.ticker);
                              }
                            }}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">
                      Sektör F/K kıyaslama verisi bulunamadı.
                    </div>
                  )}
                </div>
              </div>

              {/* 3.3 Çeyreklik Çarpan Trendi */}
              <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-xl space-y-3 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="text-base sm:text-lg font-sans font-bold text-white flex items-center gap-2">
                    <span>3.3 Çeyreklik Çarpan Trendi</span>
                  </div>
                </div>

                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={quarterlyMultiplesData} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `${v}x`} />
                      <Tooltip content={<MultiplesTrendTooltip />} />
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '10.5px', paddingTop: '4px', paddingLeft: '8px' }} />
                      <Line type="monotone" dataKey="pe" name="F/K" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3, fill: '#38bdf8' }} connectNulls={true} legendType="line" />
                      <Line type="monotone" dataKey="pb" name="PD/DD" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} connectNulls={true} legendType="line" />
                      <Line type="monotone" dataKey="sector_pe" name="Sektör F/K (Ref)" stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 4" dot={false} strokeOpacity={0.45} legendType="line" />
                      <Line type="monotone" dataKey="sector_pb" name="Sektör PD/DD (Ref)" stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 4" dot={false} strokeOpacity={0.45} legendType="line" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 3.4 Halka Açıklık Oranı (Fiili Dolaşım Oranı) */}
            {(() => {
              const floatPct = canonicalFreeFloatPct;
              if (floatPct == null) return null;

              // Finansal piyasalarda kabul gören kurumsal standartlar:
              // Optimal Aralık: %20 - %50 (Sağlıklı likidite + kurumsal fon girişi + hakim ortak sahiplik dengesi)
              // Sığ / Düşük: < %15 (Yüksek manipülasyon riski, sığ tahta, likidite kısıtı)
              // Ilımlı Düşük: %15 - %20
              // Ilımlı Yüksek: %50 - %65
              // Aşırı Dağınık: > %65 - %70 (Sahipsiz tahta riski, ana hissedar bağlılığında zayıflama)
              const isOptimal = floatPct >= 20 && floatPct <= 50;
              const isLow = floatPct < 15;
              const isBorderlineLow = floatPct >= 15 && floatPct < 20;
              const isBorderlineHigh = floatPct > 50 && floatPct <= 65;
              const isExcessive = floatPct > 65;

              const statusColor = isOptimal
                ? 'text-emerald-400'
                : (isBorderlineLow || isBorderlineHigh)
                  ? 'text-amber-400'
                  : 'text-rose-400';

              const statusBg = isOptimal
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : (isBorderlineLow || isBorderlineHigh)
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400';

              const statusLabel = isOptimal
                ? 'Optimal Likidite & Hakim Kontrol'
                : isLow
                  ? 'Sığ Tahta / Yüksek Spekülasyon Riski'
                  : isBorderlineLow
                    ? 'Ilımlı Düşük / Sınırlı Derinlik'
                    : isBorderlineHigh
                      ? 'Ilımlı Yüksek / Geniş Dolaşım'
                      : 'Aşırı Dağınık / Zayıf Ana Ortak Bağı';

              const statusDesc = isOptimal
                ? 'Fiili dolaşım oranı Borsa İstanbul ve küresel kurumsal fon normlarında ideal aralıktadır (%20–%50). Şirkette hem yeterli piyasa derinliği ve likidite bulunmakta hem de kurucu/hakim ortağın sermaye sahipliği kontrolü güçlü kalmaktadır.'
                : isLow
                  ? 'Halka açıklık oranının %15’in altında olması tahtada derinlik yetersizliğine ve yüksek volatiliteye yol açar. Az sayıda lotla fiyat manipüle edilebildiğinden spekülatif fiyatlama ve likidite kilitlenmesi riski yüksektir.'
                  : isBorderlineLow
                    ? 'Halka açıklık %15–%20 sınırındadır. BIST Yıldız Pazar normlarına yakın olsa da büyük kurumsal fonların rahat giriş-çıkış yapabilmesi için likidite derinliği takip edilmelidir.'
                    : isBorderlineHigh
                      ? 'Halka açıklık %50–%65 bandında olup piyasa likiditesi oldukça yüksektir. Ancak hakim ortağın şirket üzerindeki payı azalmaya başlamıştır.'
                      : 'Halka açıklığın %65’in üzerinde (özellikle %70+) olması, sermayenin büyük ölçüde piyasaya dağıldığını gösterir. Şirkette ana hissedar sahiplenme ve bağlılığının zayıflaması ("Sahipsiz Şirket" riski) ve yönetim kontrolü kırılganlığı doğurabilir.';

              return (
                <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#282d37] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-base sm:text-lg font-bold text-white">3.4 Halka Açıklık Oranı</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Güncel Halka Açıklık</div>
                      <div className={`text-2xl font-bold font-mono ${statusColor}`}>%{floatPct.toFixed(1)}</div>
                    </div>

                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Piyasa Standardı & Optimal Aralık</div>
                      <div className="text-2xl font-bold font-mono text-cyan-400">%20 – %50</div>
                    </div>

                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Optimal Konum Durumu</div>
                      <div className={`text-base font-bold font-mono ${statusColor} truncate mt-1`}>
                        {isOptimal ? 'Optimal Aralıkta' : floatPct < 20 ? 'Optimalin Altında (Düşük)' : 'Optimalin Üstünde (Yüksek)'}
                      </div>
                    </div>
                  </div>

                  {/* Görsel Aralık Çubuğu (Range Bar Indicator) */}
                  <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-medium">Fiili Dolaşım Skalası</span>
                    </div>

                    <div className="relative py-1">
                      <div className="relative h-3 w-full bg-[#1b2029] rounded-full overflow-hidden flex">
                        <div style={{ width: '20%' }} className="bg-rose-500/40 h-full border-r border-[#12151b]" title="Sığ Bölge (%0-%20)" />
                        <div style={{ width: '30%' }} className="bg-emerald-500/50 h-full border-r border-[#12151b]" title="Optimal Bölge (%20-%50)" />
                        <div style={{ width: '20%' }} className="bg-amber-500/40 h-full border-r border-[#12151b]" title="Geniş Bölge (%50-%70)" />
                        <div style={{ width: '30%' }} className="bg-rose-500/40 h-full" title="Aşırı Dağınık Bölge (%70-%100)" />
                      </div>
                      <div
                        style={{ left: `${Math.max(1, Math.min(99, floatPct))}%` }}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#f5c242] shadow-md pointer-events-none"
                        title={`Güncel Halka Açıklık: %${floatPct.toFixed(1)}`}
                      />
                    </div>

                    <div className="flex justify-between text-[11px] font-mono text-slate-500 pt-0.5">
                      <span>%0 (Aşırı Sığ)</span>
                      <span className="text-emerald-400 font-semibold">%20 (Optimal Tabanı)</span>
                      <span className="text-emerald-400 font-semibold">%50 (Optimal Tavanı)</span>
                      <span>%70</span>
                      <span>%100 (Tam Dağınık)</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 4: DEĞERLEME (#sec-adildeger)                                     */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Değerleme Panosu Hatası">
          <section id="sec-adildeger" className={`scroll-mt-28 rounded-2xl border bg-[#101319] p-6 sm:p-7 shadow-xl space-y-6 transition-all ${highlightedTargetId === 'sec-adildeger' ? 'border-[#f5c242] ring-2 ring-[#f5c242]/60 animate-pulse shadow-[0_0_28px_rgba(245,194,66,0.25)]' : 'border-[#242a35]'}`}>
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">4</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Değerleme</h2>
              </div>
            </div>

            {/* 4.1 İskontolu Değerleme Senaryoları */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                <span className="font-sans text-base sm:text-lg font-bold text-white">4.1 Değerleme Senaryoları</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-rose-400">Ayı Senaryosu</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-950/50 text-rose-300 border border-rose-800/40">
                      Olasılık: %{Math.round(probabilisticEdge.pBear * 100)}
                    </span>
                  </div>
                  <div className="text-2xl font-black font-mono text-white">
                    {canonicalBearPrice > 0 ? `₺${canonicalBearPrice.toFixed(2)}` : '—'}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Yüksek iskonto oranı (+%4 WACC), daralan marjlar ve düşük büyüme varsayımı.
                  </p>
                </div>

                <div className="bg-[#1d222e] border-2 border-[#f5c242]/70 rounded-xl p-5 shadow-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#f5c242]">Baz Senaryo</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950/50 text-[#f5c242] border border-[#f5c242]/35">
                      Olasılık: %{Math.round(probabilisticEdge.pBase * 100)}
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-[#f5c242]">
                    {fairValueNum > 0 ? `₺${fairValueNum.toFixed(2)}` : '—'}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Şirketin tarihsel getiri ortalamaları, mevcut sermaye verimliliği ve sektör katsayıları.
                  </p>
                </div>

                <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-emerald-400">Boğa Senaryosu</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-800/40">
                      Olasılık: %{Math.round(probabilisticEdge.pBull * 100)}
                    </span>
                  </div>
                  <div className="text-2xl font-black font-mono text-white">
                    ₺{(() => {
                      const bu = valuationInfo?.bull_price ? Number(valuationInfo.bull_price) : 0;
                      return (bu > 0 && bu > fairValueNum) ? bu.toFixed(2) : (fairValueNum * 1.25).toFixed(2);
                    })()}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Pazar payı genişlemesi, marj artışı ve risksiz faiz oranında normalleşme.
                  </p>
                </div>
              </div>

              {/* Olasılık Ağırlıklı Beklenen Değer, Asimetri & Yarı-Kelly Özet Barı */}
              <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 flex flex-col justify-between space-y-1">
                  <div className="text-xs text-slate-400 font-sans">Olasılık Ağırlıklı E[V]</div>
                  <div className="text-sm sm:text-base font-black font-mono text-white">
                    ₺{probabilisticEdge.expectedValue.toFixed(2)}{' '}
                    <span className={`text-xs font-bold ${probabilisticEdge.expectedReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ({probabilisticEdge.expectedReturnPct >= 0 ? '+' : ''}%{probabilisticEdge.expectedReturnPct.toFixed(1)})
                    </span>
                  </div>
                </div>

                <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 flex flex-col justify-between space-y-1">
                  <div className="text-xs text-slate-400 font-sans">Asimetri Oranı (Ödül/Risk)</div>
                  <div className="text-sm sm:text-base font-black font-mono">
                    <span className={
                      probabilisticEdge.edgeStatus === 'STRONG_POSITIVE_EDGE'
                        ? 'text-emerald-400'
                        : probabilisticEdge.edgeStatus === 'MODERATE_EDGE'
                        ? 'text-cyan-400'
                        : probabilisticEdge.edgeStatus === 'NEGATIVE_EXPECTANCY'
                        ? 'text-rose-400'
                        : 'text-amber-300'
                    }>
                      {probabilisticEdge.asymmetryRatio.toFixed(2)}x
                    </span>{' '}
                    <span className="text-xs font-sans font-semibold text-slate-300">
                      • {probabilisticEdge.edgeLabel}
                    </span>
                  </div>
                </div>

                <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 flex flex-col justify-between space-y-1">
                  <div className="text-xs text-slate-400 font-sans">Optimal Portföy Ağırlığı (Yarı-Kelly)</div>
                  <div className={`text-sm sm:text-base font-black font-mono ${
                    probabilisticEdge.halfKellyWeightPct > 0 ? 'text-[#f5c242]' : 'text-rose-400'
                  }`}>
                    {probabilisticEdge.halfKellyWeightPct > 0
                      ? `%${probabilisticEdge.halfKellyWeightPct.toFixed(1)}`
                      : '%0.0 (Pozisyon Önerilmez)'}
                  </div>
                </div>
              </div>
            </div>

            {/* 4.1B İnteraktif Değerleme Duyarlılık Simülatörü (What-If Analizi) */}
            {fairValueNum > 0 && (() => {
              const isModified = simWaccDelta !== 0 || simMarginDelta !== 0 || simGrowthDelta !== 0;
              const waccFactor = 1 / Math.max(0.55, 1 + simWaccDelta * 0.09);
              const marginFactor = Math.max(0.55, 1 + simMarginDelta * 0.035);
              const growthFactor = Math.max(0.7, 1 + simGrowthDelta * 0.06);
              const simulatedFairValue = Number((fairValueNum * waccFactor * marginFactor * growthFactor).toFixed(2));
              const simDiffVsBasePct = Number((((simulatedFairValue - fairValueNum) / fairValueNum) * 100).toFixed(1));
              const simUpsidePct = currentPriceNum > 0
                ? Number((((simulatedFairValue - currentPriceNum) / currentPriceNum) * 100).toFixed(1))
                : null;

              return (
                <div
                  data-testid="fv-whatif-simulator"
                  className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[#282d37] pb-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                      <span className="font-sans text-base sm:text-lg font-bold text-white">
                        4.1B İnteraktif Değerleme Duyarlılık Simülatörü (What-If)
                      </span>
                    </div>
                    {isModified && (
                      <button
                        type="button"
                        onClick={() => {
                          setSimWaccDelta(0);
                          setSimMarginDelta(0);
                          setSimGrowthDelta(0);
                        }}
                        className="fv-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1d222e] hover:bg-[#252c3b] text-xs font-mono text-slate-300 hover:text-white border border-[#323a4b] cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Varsayılanlara Sıfırla</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                    <div className="lg:col-span-7 space-y-3.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-slate-300 font-sans font-medium">İskonto Oranı (WACC) Kayması</span>
                          <span className={`font-bold ${simWaccDelta < 0 ? 'text-emerald-400' : simWaccDelta > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                            {simWaccDelta > 0 ? `+${simWaccDelta.toFixed(2)}` : simWaccDelta.toFixed(2)} puan
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-3}
                          max={3}
                          step={0.25}
                          value={simWaccDelta}
                          onChange={(e) => setSimWaccDelta(Number(e.target.value))}
                          className="w-full accent-cyan-400 cursor-pointer"
                          aria-label="WACC simülasyon sürgüsü"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-slate-300 font-sans font-medium">Operasyonel Marj / Kârlılık Farkı</span>
                          <span className={`font-bold ${simMarginDelta > 0 ? 'text-emerald-400' : simMarginDelta < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                            {simMarginDelta > 0 ? `+${simMarginDelta.toFixed(1)}` : simMarginDelta.toFixed(1)} puan
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-5}
                          max={5}
                          step={0.5}
                          value={simMarginDelta}
                          onChange={(e) => setSimMarginDelta(Number(e.target.value))}
                          className="w-full accent-emerald-400 cursor-pointer"
                          aria-label="Marj simülasyon sürgüsü"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-slate-300 font-sans font-medium">Uç Büyüme (g) &amp; Çarpan Duyarlılığı</span>
                          <span className={`font-bold ${simGrowthDelta > 0 ? 'text-emerald-400' : simGrowthDelta < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                            {simGrowthDelta > 0 ? `+${simGrowthDelta.toFixed(2)}` : simGrowthDelta.toFixed(2)} puan
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-2}
                          max={2}
                          step={0.25}
                          value={simGrowthDelta}
                          onChange={(e) => setSimGrowthDelta(Number(e.target.value))}
                          className="w-full accent-amber-400 cursor-pointer"
                          aria-label="Büyüme simülasyon sürgüsü"
                        />
                      </div>
                    </div>

                    <div className="lg:col-span-5 grid grid-cols-2 gap-3 bg-[#11141c] border border-[#252b38] rounded-xl p-4">
                      <div>
                        <div className="text-[11px] font-sans text-slate-400">Baz Adil Değer</div>
                        <div className="text-lg font-black font-mono text-slate-200 mt-0.5">
                          ₺{fairValueNum.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-sans text-slate-400">Güncel Fiyat</div>
                        <div className="text-lg font-black font-mono text-white mt-0.5">
                          {currentPriceNum > 0 ? `₺${currentPriceNum.toFixed(2)}` : '—'}
                        </div>
                      </div>
                      <div className="col-span-2 pt-3 border-t border-[#202632] flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-sans text-cyan-300 font-semibold">Simüle Edilen Adil Değer</div>
                          <div className="text-2xl font-black font-mono text-[#f5c242] mt-0.5">
                            ₺{simulatedFairValue.toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right font-mono space-y-1">
                          {simUpsidePct !== null && (
                            <div className={`px-2 py-0.5 rounded text-xs font-bold border ${
                              simUpsidePct >= 0
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35'
                                : 'bg-rose-500/15 text-rose-400 border-rose-500/35'
                            }`}>
                              {simUpsidePct >= 0 ? `+%${simUpsidePct}` : `-%${Math.abs(simUpsidePct)}`} Pot.
                            </div>
                          )}
                          {isModified && (
                            <div className={`text-[10.5px] font-bold ${simDiffVsBasePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              Baza göre {simDiffVsBasePct >= 0 ? `+${simDiffVsBasePct}%` : `${simDiffVsBasePct}%`}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 4.2 Piyasa ve Analist Hedef Fiyatları */}
            {(() => {
              const isyConsensus = liveCompanyDetails?.consensus || report.consensusTarget || report.extractedData?.consensus_target;
              const tvConsensus = liveCompanyDetails?.tvConsensus;

              const isyTarget = isyConsensus?.targetPrice ? Number(isyConsensus.targetPrice) : null;
              const tvAvg = tvConsensus?.targetPriceAverage ? Number(tvConsensus.targetPriceAverage) : null;
              const tvMedian = tvConsensus?.targetPriceMedian ? Number(tvConsensus.targetPriceMedian) : null;
              const tvHigh = tvConsensus?.targetPriceHigh ? Number(tvConsensus.targetPriceHigh) : null;
              const tvLow = tvConsensus?.targetPriceLow ? Number(tvConsensus.targetPriceLow) : null;

              const hasOfficialConsensus = Boolean((tvAvg && tvAvg > 0) || (isyTarget && isyTarget > 0));

              // Gerçek aracı kurum hedefi bulunmuyorsa kesinlikle sahte/yapay kurum veya model fallback'i üretilmez
              if (!hasOfficialConsensus) {
                return (
                  <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                      <span className="font-sans text-base sm:text-lg font-bold text-white">
                        4.2 Analist Hedef Fiyatları
                      </span>
                    </div>

                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-5 text-center space-y-2">
                      <div className="w-9 h-9 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-400">
                        <Building2 className="w-4 h-4 text-slate-400" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-200 font-sans">
                        Aktif Aracı Kurum Konsensüs Hedefi Bulunmuyor
                      </h4>
                    </div>
                  </div>
                );
              }

              const primaryTarget = tvAvg || isyTarget || 0;
              const upsidePct = currentPriceNum > 0
                ? ((primaryTarget - currentPriceNum) / currentPriceNum) * 100
                : 0;

              let rawRec = tvConsensus?.recommendationLabel || isyConsensus?.recommendation || '';
              if (!rawRec) {
                rawRec = upsidePct >= 20 ? 'AL' : upsidePct <= -10 ? 'SAT' : 'TUT';
              }
              // Potansiyel aşırı negatifken (< -15%) asla "AL" veya "ENDEKS ÜSTÜ" kalmamalı (mantık ve tezatlık koruması):
              if (upsidePct < -15.0 && (rawRec.includes('AL') || rawRec.includes('BUY') || rawRec.includes('ÜSTÜ'))) {
                rawRec = 'ENDEKS ALTI / SAT';
              }

              const rec = String(rawRec).toUpperCase().trim();
              const isBuy = rec.includes('AL') || rec.includes('BUY') || rec.includes('GÜÇLÜ');
              const isSell = rec.includes('SAT') || rec.includes('SELL');

              const agreementText = isBuy
                ? 'Pozitif Analist Beklentisi (Kurumsal Alım Eğilimi)'
                : isSell
                ? 'Temkinli / Riskli Görünüm (Satış Konsensüsü)'
                : 'Endekse Paralel / Dengeli Beklenti';

              // Görsel Aralık Bandı (Gerçek TV Tavan/Taban verisi veya İş Yatırım)
              const rangeLow = tvLow || (isyTarget ? Number((isyTarget * 0.85).toFixed(2)) : Number((primaryTarget * 0.85).toFixed(2)));
              const rangeHigh = tvHigh || (isyTarget ? Number((isyTarget * 1.15).toFixed(2)) : Number((primaryTarget * 1.15).toFixed(2)));

              // Yalnızca GERÇEK veri kaynakları listelenir (Asla sahte kurum ismi veya yapay hedef türetilmez)
              const brokerTargets: Array<{ institution: string; target: number; rec: string; source: string; date: string }> = [];

              if (isyTarget && isyTarget > 0) {
                const isyUpside = currentPriceNum > 0 ? ((isyTarget - currentPriceNum) / currentPriceNum) * 100 : 0;
                let isyRec = isyConsensus?.recommendation || (isyUpside >= 20 ? 'AL' : isyUpside <= -10 ? 'SAT' : 'TUT');
                if (isyUpside < -15 && isyRec.includes('AL')) isyRec = 'SAT';
                brokerTargets.push({
                  institution: 'İş Yatırım Araştırma',
                  target: isyTarget,
                  rec: isyRec,
                  source: 'Resmi Şirket Kartı & Model Portföy',
                  date: isyConsensus?.date || 'Güncel'
                });
              }

              if (tvAvg && tvAvg > 0) {
                brokerTargets.push({
                  institution: 'Refinitiv / LSEG Konsensüs Ortalama',
                  target: tvAvg,
                  rec: rec,
                  source: 'Yerli & Yabancı Kurumlar Ağırlıklı Ortalaması',
                  date: tvConsensus?.fetchedAt ? 'Güncel' : '12A Hedef'
                });
              }

              if (tvMedian && tvMedian > 0 && Math.abs(tvMedian - (tvAvg || 0)) > 0.05) {
                const medUpside = currentPriceNum > 0 ? ((tvMedian - currentPriceNum) / currentPriceNum) * 100 : 0;
                brokerTargets.push({
                  institution: 'Refinitiv / LSEG Medyan Analist Hedefi',
                  target: tvMedian,
                  rec: medUpside >= 15 ? 'ENDEKS ÜSTÜ' : medUpside <= -10 ? 'ENDEKS ALTI' : 'ENDEKSE PARALEL',
                  source: 'Refinitiv Analist Medyanı',
                  date: '12A Hedef'
                });
              }

              if (tvHigh && tvHigh > 0 && tvHigh !== tvAvg) {
                const highUpside = currentPriceNum > 0 ? ((tvHigh - currentPriceNum) / currentPriceNum) * 100 : 0;
                brokerTargets.push({
                  institution: 'Konsensüs En Yüksek Analist Hedefi (Tavan)',
                  target: tvHigh,
                  rec: highUpside > 15 ? 'ENDEKS ÜSTÜ' : (highUpside < -10 ? 'SAT' : 'TUT'),
                  source: 'Konsensüs Üst Bant',
                  date: '12A Hedef'
                });
              }

              if (tvLow && tvLow > 0 && tvLow !== tvAvg) {
                const lowUpside = currentPriceNum > 0 ? ((tvLow - currentPriceNum) / currentPriceNum) * 100 : 0;
                brokerTargets.push({
                  institution: 'Konsensüs En Düşük Analist Hedefi (Taban)',
                  target: tvLow,
                  rec: lowUpside < -10 ? 'ENDEKS ALTI / SAT' : 'TUT',
                  source: 'Konsensüs Taban Bant',
                  date: '12A Hedef'
                });
              }

              return (
                <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#282d37] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-base sm:text-lg font-bold text-white">
                        4.2 Analist Hedef Fiyatları
                      </span>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowBrokerBreakdown(prev => !prev)}
                        className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#21262d] hover:bg-[#2b313d] text-slate-200 hover:text-white border border-[#2e3440] transition cursor-pointer shadow-sm"
                      >
                        <span>{showBrokerBreakdown ? 'Kurum Dağılımını Gizle' : 'Kurum Dağılımını Göster'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showBrokerBreakdown ? 'rotate-180 text-[#f5c242]' : 'text-slate-400'}`} />
                      </button>
                    </div>
                  </div>

                  {/* 4'lü Özet Kart Seti */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Güncel Piyasa Fiyatı</div>
                      <div className="text-2xl font-black font-mono text-white">{currentPriceNum > 0 ? `₺${currentPriceNum.toFixed(2)}` : '—'}</div>
                    </div>

                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">12A Piyasa Konsensüs Hedefi</div>
                      <div className="text-2xl font-black font-mono text-[#f5c242]">{Number.isFinite(primaryTarget) && primaryTarget > 0 ? `₺${primaryTarget.toFixed(2)}` : '—'}</div>
                      <div className={`text-[11px] font-semibold font-mono ${upsidePct > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {Number.isFinite(upsidePct) ? `${upsidePct > 0 ? '+' : ''}%${upsidePct.toFixed(1)} Potansiyel Getiri` : '—'}
                      </div>
                    </div>

                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Modelimiz İçsel Adil Değeri</div>
                      <div className="text-2xl font-black font-mono text-emerald-400">{fairValueNum > 0 ? `₺${fairValueNum.toFixed(2)}` : '—'}</div>
                    </div>

                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Analist Konsensüs Tavsiyesi</div>
                      <div className={`text-xl font-black font-mono px-2 py-0.5 rounded w-fit mt-0.5 ${
                        isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                        isSell ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                        'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}>
                        {rec}
                      </div>
                    </div>
                  </div>

                  {/* Simply Wall St Stili Hedef Fiyat Aralığı (Visual Range Bar) */}
                  <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between border-b border-[#282d37] pb-2 text-xs font-mono">
                      <span className="text-slate-300 font-bold uppercase tracking-wider">Piyasa Analist Hedef Dağılımı</span>
                      <span className="text-slate-400">
                        {tvMedian ? `Medyan Hedef: ₺${tvMedian.toFixed(2)}` : `Konsensüs Ortalama: ₺${primaryTarget.toFixed(2)}`}
                      </span>
                    </div>

                    <div className="space-y-2.5 pt-1">
                      {/* Görsel Dağılım Çubuğu */}
                      <div className="relative h-2.5 w-full bg-[#242a38] rounded-full overflow-hidden border border-[#384152]">
                        <div className="absolute inset-0 bg-gradient-to-r from-rose-500/50 via-[#f5c242]/70 to-emerald-500/80 rounded-full" />
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono pt-0.5">
                        <div>
                          <span className="text-slate-500 mr-1.5">En Düşük Hedef:</span>
                          <span className="text-white font-bold">₺{rangeLow.toFixed(2)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 mr-1.5">En Yüksek Hedef:</span>
                          <span className="text-emerald-400 font-bold">₺{rangeHigh.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Açılır / Kapanır Kurum Dağılım Tablosu */}
                  {showBrokerBreakdown && (
                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between border-b border-[#282d37] pb-2 text-xs font-mono">
                        <span className="text-slate-200 font-bold uppercase tracking-wider">Aracı Kurum Araştırma & Hedef Fiyat Dağılımı</span>
                        <span className="text-slate-400">{brokerTargets.length} Kurum Hedefi</span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm font-mono">
                          <thead>
                            <tr className="border-b border-[#282d37] text-slate-400 text-xs">
                              <th className="py-2.5 px-3">Kurum / Aracı Kurum</th>
                              <th className="py-2.5 px-3 text-right">Hedef Fiyat</th>
                              <th className="py-2.5 px-3 text-center">Tavsiye</th>
                              <th className="py-2.5 px-3 text-right">Potansiyel Getiri</th>
                              <th className="py-2.5 px-3 text-left">Veri Kaynağı</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#232834]">
                            {brokerTargets.map((b, idx) => {
                              const potPct = currentPriceNum > 0 && b.target
                                ? ((b.target - currentPriceNum) / currentPriceNum) * 100
                                : 0;
                              const isPositive = potPct > 0;
                              const isRecBuy = b.rec.includes('AL') || b.rec.includes('ÜSTÜ');
                              const isRecSell = b.rec.includes('SAT') || b.rec.includes('ALTI');

                              return (
                                <tr key={idx} className="hover:bg-[#21262d]/50 transition">
                                  <td className="py-3 px-3 text-white font-medium font-sans flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-[#f5c242]" />
                                    <span>{b.institution}</span>
                                  </td>
                                  <td className="py-3 px-3 text-right text-[#f5c242] font-bold">
                                    ₺{Number(b.target).toFixed(2)}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                                      isRecBuy
                                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                        : isRecSell
                                        ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                                        : 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                                    }`}>
                                      {b.rec}
                                    </span>
                                  </td>
                                  <td className={`py-3 px-3 text-right font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isPositive ? '+' : ''}%{potPct.toFixed(1)}
                                  </td>
                                  <td className="py-3 px-3 text-slate-400 text-xs font-sans">
                                    {b.source}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Hedef Revizyon Trendi */}
                  {(() => {
                    const now = Date.now();
                    const validHistory = (tickerHistory || [])
                      .filter(h => h.id !== report.id && (h.createdAt || h.updatedAt || h.extractedData?.saved_at))
                      .map(h => {
                        const isoSrc = h.extractedData?.saved_at || h.updatedAt || h.createdAt || '';
                        const ts = Date.parse(String(isoSrc));
                        const ageDays = Number.isFinite(ts) ? (now - ts) / (1000 * 60 * 60 * 24) : NaN;
                        const parsedFv = parseFinancialNumber(h.fairValue);
                        const fv = parsedFv != null && Number.isFinite(parsedFv) ? parsedFv : 0;
                        return { ...h, ageDays, fv };
                      })
                      .filter(h => Number.isFinite(h.ageDays) && h.fv > 0);

                    const rep1M = validHistory.find(h => h.ageDays >= 14 && h.ageDays < 60);
                    const rep3M = validHistory.find(h => h.ageDays >= 60 && h.ageDays <= 180);

                    const curTargetNum = Number(isyTarget || primaryTarget || 0);

                    let val1M: string = '—';
                    if (rep1M && rep1M.fv > 0) {
                      val1M = `₺${rep1M.fv.toFixed(2)}`;
                    } else if (
                      isyConsensus?.targetPrice1M != null &&
                      curTargetNum > 0 &&
                      Math.abs(Number(isyConsensus.targetPrice1M) - curTargetNum) > 0.01
                    ) {
                      val1M = `₺${Number(isyConsensus.targetPrice1M).toFixed(2)}`;
                    }

                    let val3M: string = '—';
                    if (rep3M && rep3M.fv > 0) {
                      val3M = `₺${rep3M.fv.toFixed(2)}`;
                    } else if (
                      isyConsensus?.targetPrice3M != null &&
                      curTargetNum > 0 &&
                      Math.abs(Number(isyConsensus.targetPrice3M) - curTargetNum) > 0.01 &&
                      (val1M === '—' || Math.abs(Number(isyConsensus.targetPrice3M) - Number(isyConsensus.targetPrice1M)) > 0.01)
                    ) {
                      val3M = `₺${Number(isyConsensus.targetPrice3M).toFixed(2)}`;
                    }

                    return (
                      <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300 font-medium">Hedef Fiyat Revizyon Geçmişi:</span>
                        </div>
                        <div className="flex items-center gap-5 font-mono text-xs sm:text-sm">
                          <div>
                            <span className="text-slate-500 mr-1.5">3 Ay Önce:</span>
                            <span className="font-bold text-white">{val3M}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 mr-1.5">1 Ay Önce:</span>
                            <span className="font-bold text-white">{val1M}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 mr-1.5">Güncel:</span>
                            <span className="font-bold text-[#f5c242]">₺{curTargetNum.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* 4.3 Gelecek Büyüme & Değer Sürücüleri - Ayrı Alt Kart */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-base sm:text-lg font-bold text-white">4.3 Büyüme Beklentileri</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    title: drivers.revenue_growth.label,
                    valueText: `%${Number(drivers.revenue_growth.value).toFixed(1)}`,
                    pinPercent: calculateDriverPin('rev', Number(drivers.revenue_growth.value), currentSector),
                    bearText: 'Ayı: <%20',
                    bullText: 'Boğa: >%55',
                    note: drivers.revenue_growth.note
                  },
                  {
                    title: drivers.net_income_growth.label,
                    valueText: `%${Number(drivers.net_income_growth.value).toFixed(1)}`,
                    pinPercent: calculateDriverPin('net', Number(drivers.net_income_growth.value), currentSector),
                    bearText: 'Ayı: <%20',
                    bullText: 'Boğa: >%60',
                    note: drivers.net_income_growth.note
                  },
                  {
                    title: drivers.margin.label,
                    valueText: `%${Number(drivers.margin.value).toFixed(1)}`,
                    pinPercent: calculateDriverPin('margin', Number(drivers.margin.value), currentSector),
                    bearText: 'Daralan Marj',
                    bullText: 'Genişleyen Marj',
                    note: drivers.margin.note
                  },
                  {
                    title: drivers.target_multiple.label,
                    valueText: String(drivers.target_multiple.value || '2.5x PD/DD'),
                    pinPercent: calculateDriverPin('multiple', Number(drivers.target_multiple.numericValue || 2.5), currentSector, Number(drivers.target_multiple.numericValue || 2.5)),
                    bearText: 'Muhafazakar',
                    bullText: 'İyimser',
                    note: drivers.target_multiple.note
                  }
                ].map((d, idx) => (
                  <div
                    key={idx}
                    className="bg-[#1d222e] border border-[#323a4b] hover:border-[#424d64] rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-3.5 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm sm:text-[15px] font-bold text-white font-sans">
                        {d.title}
                      </div>
                      <span className="text-xl sm:text-2xl font-black font-mono text-[#f5c242] tracking-tight shrink-0">
                        {d.valueText}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="relative h-2 w-full rounded-full bg-[#131720] border border-[#2c3446] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500/35 to-emerald-400/70 rounded-full"
                          style={{ width: `${Math.max(8, Math.min(100, d.pinPercent))}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-2 bg-[#f5c242] rounded-full shadow-sm"
                          style={{ left: `calc(${d.pinPercent}% - 4px)` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>{d.bearText}</span>
                        <span className="text-slate-300">{d.bullText}</span>
                      </div>
                    </div>

                    {d.note && (
                      <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed pt-2.5 border-t border-[#222733] font-sans">
                        {d.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 4.4 WACC ve Sermaye Maliyeti Panosu */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base sm:text-lg font-sans font-bold text-white flex items-center gap-2">
                    <span>4.4 Sermaye Maliyeti ve EVA Makası</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-xl font-black font-mono ${evaSpreadNum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {evaSpreadNum >= 0 ? `+${evaSpreadNum.toFixed(1)} Puan` : `${evaSpreadNum.toFixed(1)} Puan`}
                  </div>
                  <div className="text-sm text-slate-400 font-semibold">
                    {evaSpreadNum >= 0 ? 'Değer Üretiyor' : 'Değer Yıkıyor'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-[#1d222e] rounded-xl p-3 text-center border border-emerald-500/35">
                  <div className="text-sm font-semibold text-emerald-400">Reel ROIC</div>
                  <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                    %{roicNum.toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#1d222e] rounded-xl p-3 text-center border border-amber-500/35">
                  <div className="text-sm font-semibold text-[#f5c242]">Reel WACC (Fisher)</div>
                  <div className="text-base font-bold font-mono text-[#f5c242] mt-1">
                    %{realWaccNum.toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#1d222e] rounded-xl p-3 text-center border border-[#323a4b]">
                  <div className="text-sm text-slate-400">Özsermaye Maliyeti</div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    %{Number(valuationInfo?.cost_of_equity || 44.6).toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#1d222e] rounded-xl p-3 text-center border border-[#323a4b]">
                  <div className="text-sm text-slate-400">Borç Maliyeti</div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    %{Number(valuationInfo?.cost_of_debt || 46.7).toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#1d222e] rounded-xl p-3 text-center border border-[#323a4b]">
                  <div className="text-sm text-slate-400">Nominal WACC</div>
                  <div className="text-sm font-bold font-mono text-slate-300 mt-1">
                    %{nominalWaccNum.toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#1d222e] rounded-xl p-3 text-center border border-[#323a4b]">
                  <div className="text-sm text-slate-400">Kaldıraçlı Beta</div>
                  <div className="text-sm font-bold font-mono text-cyan-400 mt-1">
                    {Number(valuationInfo?.beta || 0.77).toFixed(2)}x
                  </div>
                </div>
              </div>

              {/* 4 Çeyreklik Temel İvme & 2. Türev Eğim Şeridi */}
              <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 space-y-0.5">
                  <div className="text-xs text-slate-400 font-sans">4Ç Operasyonel Marj Eğimi</div>
                  <div className={`text-sm font-bold font-mono ${
                    fundamentalMomentum.marginSlopePtsPerQ >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {fundamentalMomentum.marginSlopePtsPerQ >= 0 ? '+' : ''}
                    {fundamentalMomentum.marginSlopePtsPerQ.toFixed(1)} Puan/Çeyrek
                  </div>
                </div>

                <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 space-y-0.5">
                  <div className="text-xs text-slate-400 font-sans">4Ç ROIC / ROE İvmesi</div>
                  <div className={`text-sm font-bold font-mono ${
                    fundamentalMomentum.roicSlopePtsPerQ >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {fundamentalMomentum.roicSlopePtsPerQ >= 0 ? '+' : ''}
                    {fundamentalMomentum.roicSlopePtsPerQ.toFixed(1)} Puan/Çeyrek
                  </div>
                </div>

                <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs text-slate-400 font-sans">İvme Rejimi (2. Türev)</div>
                    <div className="text-[11px] text-slate-400 font-sans leading-snug mt-0.5 line-clamp-1" title={fundamentalMomentum.regimeSummary}>
                      {fundamentalMomentum.quartersAnalyzed} çeyreklik eğim analizi
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold border shrink-0 ${
                    fundamentalMomentum.badgeTone === 'emerald'
                      ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                      : fundamentalMomentum.badgeTone === 'cyan'
                      ? 'bg-cyan-950/70 text-cyan-300 border-cyan-500/40'
                      : fundamentalMomentum.badgeTone === 'rose'
                      ? 'bg-rose-950/70 text-rose-300 border-rose-500/40'
                      : 'bg-amber-950/70 text-amber-300 border-amber-500/40'
                  }`}>
                    {fundamentalMomentum.regimeLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* 4.5 Kâr Kalitesi ve Nakit Dönüşümü (Earnings Quality Audit) */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-sans font-bold text-white">
                    4.5 Kâr ve Nakit Kalitesi
                  </h3>
                  <span className={`text-sm font-mono font-bold px-2.5 py-0.5 rounded border ${
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
                  className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-[#323a4b] hover:bg-[#1d222e] transition cursor-pointer"
                  title="Metodoloji ve formülleri görüntüle"
                >
                  <Info className="w-3.5 h-3.5 text-[#f5c242]" />
                  <span>{showCashQualityExplainer ? 'Detayı Gizle' : 'Metodoloji (i)'}</span>
                </button>
              </div>

              {/* 4 Temel Metrik Şeridi */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#1d222e] rounded-xl p-3.5 border border-[#323a4b]">
                  <span className="text-xs text-slate-400 block">Nakit Dönüşümü (OCF / Net)</span>
                  <div className={`text-base font-black font-mono mt-1 ${
                    earningsQuality.status === 'DOUBLE_NEGATIVE' ? 'text-rose-400' : 'text-white'
                  }`}>
                    {earningsQuality.status === 'DOUBLE_NEGATIVE'
                      ? 'A/D'
                      : (earningsQuality.cashConversionRatio != null ? `%${earningsQuality.cashConversionRatio}` : '—')}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">Hedef: &gt; %100</span>
                </div>

                <div className="bg-[#1d222e] rounded-xl p-3.5 border border-[#323a4b]">
                  <span className="text-xs text-slate-400 block">Sloan Tahakkuk Oranı</span>
                  <div className={`text-base font-black font-mono mt-1 ${
                    earningsQuality.status === 'DOUBLE_NEGATIVE'
                      ? 'text-rose-400'
                      : (earningsQuality.sloanAccrualRatio != null && earningsQuality.sloanAccrualRatio < 0.05
                        ? 'text-emerald-400'
                        : 'text-amber-400')
                  }`}>
                    {earningsQuality.sloanAccrualRatio != null ? `%${(earningsQuality.sloanAccrualRatio * 100).toFixed(1)}` : '—'}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">Hedef: &lt; %5 (Düşük Tahakkuk)</span>
                </div>

                <div className="bg-[#1d222e] rounded-xl p-3.5 border border-[#323a4b]">
                  <span className="text-xs text-slate-400 block">İşletme Nakit Akışı (OCF)</span>
                  <div className={`text-base font-black font-mono mt-1 ${
                    (earningsQuality.ocf != null && earningsQuality.ocf < 0) ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {formatMrTl(earningsQuality.ocf)}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">Fiili Operasyonel Nakit</span>
                </div>

                <div className="bg-[#1d222e] rounded-xl p-3.5 border border-[#323a4b]">
                  <span className="text-xs text-slate-400 block">Net Dönem Kârı</span>
                  <div className={`text-base font-black font-mono mt-1 ${
                    (earningsQuality.netIncome != null && earningsQuality.netIncome < 0) ? 'text-rose-400' : 'text-white'
                  }`}>
                    {formatMrTl(earningsQuality.netIncome)}
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">Muhasebesel Net Kâr</span>
                </div>
              </div>

              {/* Sektörel Rehberlik & Teşhis Açıklama Kartı */}
              <div className="rounded-xl bg-[#1d222e] border border-[#323a4b] p-4 space-y-2 text-sm">
                <div className="flex items-start gap-2.5">
                  <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                    earningsQuality.badgeColor === 'emerald'
                      ? 'bg-emerald-400'
                      : earningsQuality.badgeColor === 'amber'
                      ? 'bg-amber-400'
                      : earningsQuality.badgeColor === 'indigo'
                      ? 'bg-indigo-400'
                      : earningsQuality.badgeColor === 'gray'
                      ? 'bg-slate-400'
                      : 'bg-rose-400'
                  }`} />
                  <p className="text-slate-200 leading-relaxed font-normal flex-1 text-sm">
                    {earningsQuality.guidanceText}
                  </p>
                </div>

                {earningsQuality.sloanAssessment && (
                  <div className="flex items-start gap-2.5 pt-2.5 border-t border-[#282d37]">
                    <div className="mt-1.5 h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
                    <p className="text-slate-300 leading-relaxed flex-1 font-mono text-sm">
                      <span className="font-semibold text-slate-200 font-sans mr-1.5">Tahakkuk & Nakit Teşhisi:</span>
                      {earningsQuality.sloanAssessment}
                    </p>
                  </div>
                )}

                {currentSector !== 'BANKING' && currentSector !== 'INSURANCE' && currentSector !== 'FINANCIAL_SERVICES' && (
                  <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#282d37]">
                    <span className="px-2.5 py-1 rounded-md bg-[#161a23] border border-[#2a3140] text-[11px] font-mono text-slate-300">
                      Alacak Endeksi (DSRI):{' '}
                      <strong className={earningsQuality.dsri != null && earningsQuality.dsri > 1.25 ? 'text-rose-400' : 'text-white'}>
                        {earningsQuality.dsri != null ? earningsQuality.dsri.toFixed(2) : '—'}
                      </strong>
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-[#161a23] border border-[#2a3140] text-[11px] font-mono text-slate-300">
                      Brüt Marj Endeksi (GMI):{' '}
                      <strong className={earningsQuality.gmi != null && earningsQuality.gmi > 1.15 ? 'text-amber-300' : 'text-white'}>
                        {earningsQuality.gmi != null ? earningsQuality.gmi.toFixed(2) : '—'}
                      </strong>
                    </span>
                    <span className={`px-2.5 py-1 rounded-md border text-[11px] font-mono font-bold ${
                      earningsQuality.accountingRiskLevel === 'YÜKSEK'
                        ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                        : earningsQuality.accountingRiskLevel === 'ORTA'
                        ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                        : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    }`}>
                      Tahakkuk Riski: {earningsQuality.accountingRiskLabel || 'Temiz'}
                    </span>
                  </div>
                )}
              </div>

              {showCashQualityExplainer && (
                <div className="bg-[#242a38] border border-[#384152] p-4 rounded-xl text-sm text-slate-300 space-y-2">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#f5c242]" />
                    <span>Kâr Kalitesi Metodolojisi & Değerlendirme Çerçevesi</span>
                  </div>
                  <p className="leading-relaxed text-slate-300 text-sm">
                    {earningsQuality.beginnerExplanation}
                  </p>
                  <div className="text-sm text-slate-400 font-mono bg-[#1a1e24] p-3 rounded-lg border border-[#282d37] space-y-1">
                    <div>• <strong>Sloan Tahakkuk Oranı</strong> = (Net Kâr − OCF) / Toplam Varlıklar</div>
                    <div>• <strong>Nakit Dönüşüm Oranı</strong> = İşletme Nakit Akışı (OCF) / Net Kâr</div>
                    <div className="text-xs text-slate-400 pt-0.5">
                      Oran %100'ün üzerindeyse şirket kağıt üzerinde kâr yazmanın ötesinde fiilen kasaya nakit sokuyor demektir.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4.6 DuPont 5 Aşamalı Kârlılık Ayrıştırması */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-base sm:text-lg font-bold text-white">4.6 DuPont Kârlılık Analizi</span>
                </div>
                <div className="text-right">
                  <span className="text-sm text-slate-400 font-semibold mr-2">Yıllık ROE:</span>
                  <span className="text-xl font-black font-mono text-emerald-400">
                    {(() => {
                      const rawRoe = dupontResult.calculatedRoe ?? dupontResult.reportedRoe ?? latestData?.roe;
                      const numRoe = rawRoe != null ? Number(rawRoe) : NaN;
                      return Number.isFinite(numRoe) ? `%${numRoe.toFixed(1)}` : '—';
                    })()}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {currentSector === 'BANKING'
                  ? 'ROE = Vergi Yükü (Net/EBT) × Karşılık & Risk Yükü (EBT/Faaliyet Kârı) × Faaliyet Marjı (Kâr/Gelir) × Aktif Verimi (Gelir/Aktif) × Finansal Kaldıraç (Aktif/Özkaynak)'
                  : 'ROE = Vergi Yükü (Net/EBT) × Faiz Yükü (EBT/EBIT) × Faaliyet Marjı (EBIT/Satış) × Varlık Devri (Satış/Aktif) × Finansal Kaldıraç (Aktif/Özkaynak)'}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#323a4b] bg-[#1d222e] border border-[#323a4b] rounded-xl overflow-hidden">
                <div className="p-3 text-center">
                  <div className="text-xs text-slate-400">Vergi Yükü</div>
                  <div className="text-base font-bold font-mono text-white mt-1" title={dupontResult.taxBurden != null ? `${dupontResult.taxBurden}` : undefined}>
                    {dupontResult.taxBurden != null ? Number(dupontResult.taxBurden).toFixed(2) : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">Net/EBT</div>
                </div>

                <div className="p-3 text-center">
                  <div className="text-xs text-slate-400">
                    {currentSector === 'BANKING' ? 'Karşılık Yükü' : 'Faiz Yükü'}
                  </div>
                  <div className="text-base font-bold font-mono text-white mt-1" title={dupontResult.interestBurden != null ? `${dupontResult.interestBurden}` : undefined}>
                    {dupontResult.interestBurden != null ? Number(dupontResult.interestBurden).toFixed(2) : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {currentSector === 'BANKING' ? 'EBT/Faaliyet Kârı' : 'EBT/EBIT'}
                  </div>
                </div>

                <div className="p-3 text-center">
                  <div className="text-xs text-slate-400">
                    {currentSector === 'BANKING' ? 'Faaliyet Marjı' : 'EBIT Marjı'}
                  </div>
                  <div className="text-base font-bold font-mono text-[#f5c242] mt-1">
                    {dupontResult.ebitMargin != null ? `%${dupontResult.ebitMargin}` : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {currentSector === 'BANKING' ? 'Kâr/Toplam Gelir' : 'EBIT/Satış'}
                  </div>
                </div>

                <div className="p-3 text-center">
                  <div className="text-xs text-slate-400">
                    {currentSector === 'BANKING' ? 'Aktif Verimi' : 'Aktif Devri'}
                  </div>
                  <div className="text-base font-bold font-mono text-cyan-400 mt-1" title={dupontResult.assetTurnover != null ? `${dupontResult.assetTurnover}` : undefined}>
                    {dupontResult.assetTurnover != null ? Number(dupontResult.assetTurnover).toFixed(2) : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {currentSector === 'BANKING' ? 'Gelir/Aktif' : 'Satış/Aktif'}
                  </div>
                </div>

                <div className="p-3 text-center col-span-2 sm:col-span-1">
                  <div className="text-xs text-slate-400">Kaldıraç</div>
                  <div className="text-base font-bold font-mono text-white mt-1" title={dupontResult.financialLeverage != null ? `${dupontResult.financialLeverage}` : undefined}>
                    {dupontResult.financialLeverage != null ? Number(dupontResult.financialLeverage).toFixed(2) : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">Aktif/Özkaynak</div>
                </div>
              </div>


            </div>

            {/* 4.7 Sermaye Tahsisi, İştirak Yapısı ve İlişkili Taraf Denetimi */}
            {(() => {
              const capAlloc = valuationInfo?.capital_allocation_risk ?? analyzeRelatedPartyAndCapitalAllocationRisk(latestData, currentSector, officialSectorName);
              const indicators = capAlloc?.indicators || [];
              if (indicators.length === 0) return null;
              const isRisk = Boolean(capAlloc?.isRiskDetected);
              const isInvEntity = Boolean(capAlloc?.isInvestmentEntity);

              return (
                <div id="sec-sermaye-tahsisi" className="scroll-mt-28 bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#282d37] pb-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base sm:text-lg font-sans font-bold text-white">
                        4.7 Sermaye Tahsisi ve İştirakler
                      </h3>
                      <span className={`text-xs sm:text-sm font-mono font-bold px-2.5 py-0.5 rounded border ${
                        isInvEntity
                          ? 'bg-amber-950/70 border-amber-800/60 text-amber-300'
                          : isRisk
                            ? 'bg-rose-950/70 border-rose-800/60 text-rose-400'
                            : 'bg-emerald-950/70 border-emerald-800/60 text-emerald-400'
                      }`}>
                        {isInvEntity
                          ? 'TFRS 10 İştirak & Girişim Sermayesi Yapısı (PD/NAD)'
                          : isRisk
                            ? `Gölge Holdingleşme Riski (-%${Math.round((capAlloc.haircutPct || 0) * 100)} Değerleme İskontosu)`
                            : 'Operasyonel Sermaye Tahsisi Dengeli'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCapAllocExpanded(prev => !prev)}
                      className="flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-300 hover:text-white bg-[#21262d] hover:bg-[#2c333f] px-3 py-1.5 rounded-lg border border-[#2e3440] hover:border-[#f5c242]/40 transition cursor-pointer shadow-sm select-none"
                      title={isCapAllocExpanded ? 'Kriter detaylarını gizle' : 'Kriter detaylarını incele'}
                    >
                      <span className={capAlloc.triggeredCount > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                        {isInvEntity ? 'TFRS 10 Portföy Denetimi' : `${capAlloc.triggeredCount}/4 Adli Kriter Sinyali`}
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isCapAllocExpanded ? 'rotate-180 text-[#f5c242]' : ''}`} />
                    </button>
                  </div>

                  {/* 4 Temel Sermaye Tahsisi Metrik Şeridi */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-[#1d222e] rounded-xl p-3.5 border border-[#323a4b]">
                      <span className="text-xs text-slate-400 block">Duran Finansal Yatırım / Aktif</span>
                      <div className={`text-base font-black font-mono mt-1 ${
                        isInvEntity
                          ? 'text-amber-300'
                          : (capAlloc.nonCurrentFinInvRatioAssets != null && capAlloc.nonCurrentFinInvRatioAssets >= 30.0)
                            ? 'text-rose-400'
                            : 'text-white'
                      }`}>
                        {capAlloc.nonCurrentFinInvRatioAssets != null ? `%${capAlloc.nonCurrentFinInvRatioAssets}` : '%0'}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {isInvEntity ? 'TFRS 10 Portföy (>= %85)' : 'Normal Eşik: < %30'}
                      </span>
                    </div>

                    <div className="bg-[#1d222e] rounded-xl p-3.5 border border-[#323a4b]">
                      <span className="text-xs text-slate-400 block">Yıllık Nakit Yatırım Getirisi</span>
                      <div className={`text-base font-black font-mono mt-1 ${
                        capAlloc.annualizedInvYieldPct == null
                          ? 'text-slate-400'
                          : capAlloc.annualizedInvYieldPct < 0
                            ? 'text-rose-400'
                            : capAlloc.annualizedInvYieldPct < 5.0
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                      }`}>
                        {capAlloc.annualizedInvYieldPct != null ? `%${capAlloc.annualizedInvYieldPct}` : '—'}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">Hedef: &gt;= %5,0 Nakit Verim</span>
                    </div>

                    <div className="bg-[#1d222e] rounded-xl p-3.5 border border-[#323a4b]">
                      <span className="text-xs text-slate-400 block">Azınlık Payı Kâr / Özkaynak</span>
                      <div className={`text-base font-black font-mono mt-1 ${
                        (capAlloc.minorityProfitLeakagePct != null && capAlloc.minorityProfitLeakagePct >= 25.0) ||
                        (capAlloc.minorityEquitySharePct != null && capAlloc.minorityEquitySharePct >= 30.0)
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}>
                        {capAlloc.minorityProfitLeakagePct != null
                          ? `%${capAlloc.minorityProfitLeakagePct}`
                          : (capAlloc.minorityEquitySharePct != null ? `%${capAlloc.minorityEquitySharePct}` : '%0')}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">Hedef: &lt; %25 Azınlık Payı</span>
                    </div>

                    <div className="bg-[#1d222e] rounded-xl p-3.5 border border-[#323a4b]">
                      <span className="text-xs text-slate-400 block">Serbest Nakit Dönüşümü (FCF/Kâr)</span>
                      <div className={`text-base font-black font-mono mt-1 ${
                        capAlloc.fcfConversionPct != null && capAlloc.fcfConversionPct < 15.0
                          ? 'text-amber-400'
                          : 'text-white'
                      }`}>
                        {capAlloc.fcfConversionPct != null ? `%${capAlloc.fcfConversionPct}` : '—'}
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">Hedef: &gt;= %20 FCF/Kâr</span>
                    </div>
                  </div>

                  {/* Yönetici Teşhis ve Değerleme Etkisi Kartı */}
                  <div className="rounded-xl bg-[#1d222e] border border-[#323a4b] p-4 space-y-2 text-sm">
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        isInvEntity ? 'bg-amber-400' : isRisk ? 'bg-rose-400' : 'bg-emerald-400'
                      }`} />
                      <p className="text-slate-200 leading-relaxed font-normal flex-1 text-sm">
                        {capAlloc.summaryText || 'Şirketin bilanço ve nakit akış kalemlerinde esas faaliyet dışı finansal yatırım şişkinliği, grup içi atıl fon transferi veya yüksek azınlık kâr sızıntısı tespit edilmemiştir. Üretilen kaynak ana ortaklık operasyonlarında kalmaktadır.'}
                      </p>
                    </div>
                  </div>

                  {/* 4 Boyutlu Sermaye Tahsisi ve İlişkili Taraf Kırılımı (Tıklanınca Açılır Çekmece) */}
                  {isCapAllocExpanded && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2 border-t border-[#282d37]">
                      {indicators.map((ind: any) => {
                      const isTriggered = Boolean(ind.triggered);
                      return (
                        <div
                          key={ind.code}
                          className={`rounded-xl p-4 border flex flex-col justify-between space-y-2.5 transition ${
                            isTriggered
                              ? isInvEntity
                                ? 'bg-[#242a38] border-amber-500/35'
                                : 'bg-[#24202b] border-rose-500/35'
                              : 'bg-[#242a38] border-[#384152]'
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${
                                  isTriggered
                                    ? isInvEntity ? 'bg-amber-400' : 'bg-rose-400'
                                    : 'bg-emerald-400'
                                }`} />
                                <span className="text-xs sm:text-[13px] font-bold text-white font-sans">
                                  {ind.title}
                                </span>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold whitespace-nowrap border ${
                                isTriggered
                                  ? isInvEntity
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  : 'bg-[#21262d] text-emerald-400 border-[#2e3440]'
                              }`}>
                                {ind.metricValueStr}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed font-sans pl-4">
                              {ind.explanation}
                            </p>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-[#252a34] pl-4 text-[11px] font-mono text-slate-400">
                            <span>Referans Kriter: {ind.thresholdStr}</span>
                            <span className={
                              isTriggered
                                ? isInvEntity ? 'text-amber-400 font-semibold' : 'text-rose-400 font-semibold'
                                : 'text-emerald-400 font-semibold'
                            }>
                              {isTriggered ? (isInvEntity ? 'İştirak Yapısı' : 'Dikkat / Sinyal') : 'Uyumlu'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 5: TEMETTÜ (#sec-temettu)                                         */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Temettü Panosu Hatası">
          <section id="sec-temettu" className={`scroll-mt-28 rounded-2xl border bg-[#101319] p-6 sm:p-7 shadow-xl space-y-6 transition-all ${highlightedTargetId === 'sec-temettu' ? 'border-[#f5c242] ring-2 ring-[#f5c242]/60 animate-pulse shadow-[0_0_28px_rgba(245,194,66,0.25)]' : 'border-[#242a35]'}`}>
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">5</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Temettü</h2>
              </div>
            </div>

            {/* 7524 Sayılı Kanun GYO Yasal Temettü Uyarısı */}
            {currentSector === 'REIT' && (
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-emerald-300 font-sans">
                    7524 Sayılı Kanun Yasal Kâr Payı Dağıtım Zorunluluğu (1 Ocak 2025 Sonrası)
                  </div>
                  <p className="text-slate-300 leading-relaxed font-sans">
                    GYO’ların Kurumlar Vergisi istisnasından faydalanabilmesi için taşınmazlardan elde ettikleri kazançların <strong>en az %50'sini</strong> ortaklarına temettü olarak dağıtması yasal zorunluluktur. Bu şartı sağlayan şirketler %10 asgari kurumlar vergisi tavanında kalırken, dağıtmayanlar %30 genel vergi ve vergi ziyaı cezasına tabi tutulur.
                  </p>
                </div>
              </div>
            )}

            {(() => {
              const dividends: any[] = resolvedDividends;
              const hasDividends = Array.isArray(dividends) && dividends.length > 0;

              if (!hasDividends) {
                return (
                  <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-8 text-center space-y-3">
                    <Coins className="w-10 h-10 text-slate-500 mx-auto" />
                    <div className="text-base font-bold text-white">Geçmiş Nakit Temettü Dağıtımı Bulunmuyor</div>
                    <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                      {report.ticker} için resmi kayıtlarda nakit temettü dağıtım kaydı tespit edilmemiştir. Şirket kârını büyüme, Ar-Ge ve kapasite yatırımlarında kullanıyor veya bünyesinde tutuyor olabilir.
                    </p>
                  </div>
                );
              }

              // Çift kayıtları (HTML kazıma tekrarları) temizle
              const uniqueDividends: any[] = [];
              const seenDivKey = new Set<string>();
              for (const d of dividends) {
                const key = `${d.date || ''}_${d.perShareTl ?? d.hisseBasi ?? ''}`;
                if (!seenDivKey.has(key)) {
                  seenDivKey.add(key);
                  uniqueDividends.push(d);
                }
              }

              const latestDiv = uniqueDividends[0] || dividends[0];
              const latestYield = latestDiv.yieldPct ?? 0;
              const latestPerShare = latestDiv.perShareTl ?? 0;
              const rawPayout = Number(latestDiv.payoutRatioPct ?? 0);
              const computedPayout = (() => {
                if (rawPayout > 0) return rawPayout;
                const totDiv = Number(latestDiv.totalAmountTl ?? 0);
                const netInc = Number(latestData?.net_income_ttm ?? latestData?.net_income ?? 0);
                if (totDiv > 0 && netInc > 0) {
                  return Number(((totDiv / netInc) * 100).toFixed(1));
                }
                return 0;
              })();
              const latestPayout = computedPayout;
              const totalPayoutCount = uniqueDividends.length;

              // Yıllık Dağıtım Döngüsü (Aynı yıl içindeki taksitleri topla ve yılı tekilleştir)
              const yearlyAggMap = new Map<string, {
                tarih: string;
                fullDate: string;
                verim: number;
                hisseBasi: number;
                dagitmaOrani: number;
                count: number;
              }>();

              // Eskiden yeniye kronolojik sırayla grupla
              const reversedDivs = [...uniqueDividends].reverse();
              for (const d of reversedDivs) {
                const yr = d.year ? String(d.year) : (d.date ? d.date.slice(-4) : '');
                if (!yr || yr.length !== 4) continue;

                const itemYield = Number(d.yieldPct ?? 0);
                const itemPerShare = Number(d.perShareTl ?? 0);
                const itemPayout = Number(d.payoutRatioPct ?? 0);

                const existing = yearlyAggMap.get(yr);
                if (!existing) {
                  yearlyAggMap.set(yr, {
                    tarih: yr,
                    fullDate: d.date ? `${yr} (${d.date})` : yr,
                    verim: itemYield,
                    hisseBasi: itemPerShare,
                    dagitmaOrani: Math.min(200, itemPayout),
                    count: 1
                  });
                } else {
                  existing.count += 1;
                  existing.verim += itemYield;
                  existing.hisseBasi += itemPerShare;
                  existing.dagitmaOrani = Math.min(200, Math.max(existing.dagitmaOrani, itemPayout));
                  existing.fullDate = `${yr} (${existing.count} Dağıtım Toplamı)`;
                }
              }

              const chartDataChronological = Array.from(yearlyAggMap.values());
              const displayedDividends = showAllDividends ? uniqueDividends : uniqueDividends.slice(0, 1);

              return (
                <div className="space-y-6">
                  {/* 5.1 Temettü Özeti */}
                  <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                      <span className="font-sans text-base sm:text-lg font-bold text-white">5.1 Temettü Özeti</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                        <div className="text-xs text-slate-400 font-sans">Son Temettü Verimi</div>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                          %{latestYield.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {latestDiv.date ? `Son Dağıtım: ${latestDiv.date}` : 'Yıllık Nakit Temettü'}
                        </div>
                      </div>

                      <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                        <div className="text-xs text-slate-400 font-sans">Hisse Başına Nakit</div>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-white">
                          ₺{latestPerShare.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Net Hisse Başı Tutar
                        </div>
                      </div>

                      <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                        <div className="text-xs text-slate-400 font-sans">Kâr Dağıtma Oranı</div>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-[#f5c242]">
                          %{latestPayout.toFixed(0)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Payout Oranı
                        </div>
                      </div>

                      <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-1">
                        <div className="text-xs text-slate-400 font-sans">Temettü Sürekliliği</div>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-cyan-400">
                          {totalPayoutCount} Dağıtım
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Kayıtlı Dağıtım Sayısı
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 5.2 Temettü Trendi */}
                  <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-base sm:text-lg font-bold text-white">5.2 Temettü Trendi</span>
                      </div>
                    </div>

                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartDataChronological} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                          <XAxis dataKey="tarih" stroke="#6b7280" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                          <YAxis yAxisId="left" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => `%${v}`} />
                          <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" tick={{ fontSize: 10, fill: '#fbbf24' }} tickFormatter={(v) => `%${v}`} />
                          <Tooltip content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-[#151821] border border-[#2E3440] p-3 rounded-xl shadow-2xl text-xs space-y-1 font-mono">
                                <div className="font-bold text-white font-sans">{d.fullDate || d.tarih}</div>
                                <div className="text-emerald-400">Temettü Verimi: %{Number(d.verim).toFixed(2)}</div>
                                <div className="text-white">Hisse Başına: ₺{Number(d.hisseBasi).toFixed(4)}</div>
                                <div className="text-amber-400">Dağıtma Oranı: %{Number(d.dagitmaOrani).toFixed(1)}</div>
                              </div>
                            );
                          }} />
                          <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '11px', paddingTop: '8px', paddingLeft: '8px' }} />
                          <Bar yAxisId="left" dataKey="verim" name="Temettü Verimi (%)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                          <Line yAxisId="right" type="monotone" dataKey="dagitmaOrani" name="Dağıtma Oranı (%)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* 5.3 Geçmiş Nakit Temettü Ödemeleri */}
                  <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 shadow-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-base sm:text-lg font-bold text-white">5.3 Geçmiş Temettüler</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm font-mono">
                        <thead>
                          <tr className="border-b border-[#282d37] text-slate-400 text-xs">
                            <th className="py-2.5 px-3">Dağıtım Tarihi</th>
                            <th className="py-2.5 px-3 text-right">Temettü Verimi</th>
                            <th className="py-2.5 px-3 text-right">Hisse Başı Net TL</th>
                            <th className="py-2.5 px-3 text-right">Brüt Oran (%)</th>
                            <th className="py-2.5 px-3 text-right">Toplam Temettü (TL)</th>
                            <th className="py-2.5 px-3 text-right">Dağıtma Oranı</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#232834]">
                          {displayedDividends.map((row: any, idx: number) => (
                            <tr key={idx} className="hover:bg-[#21262d]/50 transition">
                              <td className="py-3 px-3 text-white font-medium">{row.date}</td>
                              <td className="py-3 px-3 text-right text-emerald-400 font-bold">
                                {row.yieldPct != null ? `%${Number(row.yieldPct).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-3 px-3 text-right text-white">
                                {row.perShareTl != null ? `₺${Number(row.perShareTl).toFixed(4)}` : '—'}
                              </td>
                              <td className="py-3 px-3 text-right text-slate-300">
                                {row.grossRatePct != null ? `%${Number(row.grossRatePct).toFixed(1)}` : '—'}
                              </td>
                              <td className="py-3 px-3 text-right text-slate-300">
                                {row.totalAmountTl != null ? Number(row.totalAmountTl).toLocaleString('tr-TR') + ' TL' : '—'}
                              </td>
                              <td className="py-3 px-3 text-right text-[#f5c242] font-semibold">
                                {row.payoutRatioPct != null ? `%${Number(row.payoutRatioPct).toFixed(0)}` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {uniqueDividends.length > 1 && (
                      <div className="pt-3 border-t border-[#282d37] flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowAllDividends(!showAllDividends)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#21262d] hover:bg-[#2b313d] text-slate-200 hover:text-white border border-[#2e3440] text-xs font-semibold transition cursor-pointer shadow-sm"
                        >
                          {showAllDividends ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5 text-[#f5c242]" />
                              <span>Daha Az Göster (Sadece Son Temettü)</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5 text-[#f5c242]" />
                              <span>Tüm Geçmiş Temettüleri Göster ({uniqueDividends.length} Kayıt)</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 6: YÖNETİM HEDEF KARNESİ (#sec-rehberlik)                          */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Yönetim Hedefleri Hatası">
          <section id="sec-rehberlik" className="scroll-mt-28 rounded-2xl border border-[#242a35] bg-[#101319] p-6 sm:p-7 shadow-xl space-y-6">
            {(() => {
              const qa = liveKapQualitativeAudit || valuationInfo?.qualitative_risk_audit || report.extractedData?.qualitative_risk_audit;
              const cleanKapTargets = Array.isArray(qa?.managementTargets)
                ? qa.managementTargets.filter((mt: any) => isMeaningfulKapTargetText(mt?.target))
                : [];
              const hasExplicitGuidance = Array.isArray(report.extractedData?.guidance_track_record) && report.extractedData.guidance_track_record.length > 0;

              let rows: Array<{
                period: string;
                guidance: string;
                actual: string;
                status: 'BAŞARILI' | 'KISMEN' | 'SAPMA';
                analysis: string;
              }> = [];

              if (hasExplicitGuidance) {
                rows = report.extractedData.guidance_track_record.map((g: any) => {
                  const rawGuidance = g?.guidance_given != null ? String(g.guidance_given).trim() : '';
                  const cleanGuidance = (!rawGuidance || rawGuidance.toLowerCase() === 'null')
                    ? 'Sektör büyümesinin üzerinde operasyonel kârlılık ve pazar payı kazanımı hedefi'
                    : rawGuidance.replace(/\bbancassurance\b/gi, 'banka sigortacılığı');
                  const rawActual = g?.actual_realized != null ? String(g.actual_realized).trim() : '';
                  const cleanActual = (!rawActual || rawActual.toLowerCase() === 'null')
                    ? 'Dönem finansal sonuçları ile uyumlu gerçekleşme'
                    : rawActual;
                  const rawStatus = String(g?.status || '').toUpperCase().trim();
                  const status: 'BAŞARILI' | 'KISMEN' | 'SAPMA' =
                    rawStatus === 'BAŞARISIZ' || rawStatus === 'SAPMA'
                      ? 'SAPMA'
                      : rawStatus === 'KISMEN' || rawStatus === 'KISMI'
                      ? 'KISMEN'
                      : 'BAŞARILI';
                  return {
                    period: g?.year_or_period || '—',
                    guidance: cleanGuidance,
                    actual: cleanActual,
                    status,
                    analysis: String(g?.analysis || '').replace(/\bbancassurance\b/gi, 'banka sigortacılığı')
                  };
                });
              } else {
                const currRev = Number(latestFlow?.revenue ?? latestFlow?.gross_written_premiums ?? latestData?.revenue ?? 0);
                const prevRev = Number(yoyFlow?.revenue ?? yoyFlow?.gross_written_premiums ?? 0);
                const revChgPct = prevRev > 0 ? ((currRev - prevRev) / Math.abs(prevRev)) * 100 : null;

                const currEbitda = Number(latestFlow?.ebitda ?? latestFlow?.operating_income ?? latestData?.ebitda ?? 0);
                const prevEbitda = Number(yoyFlow?.ebitda ?? yoyFlow?.operating_income ?? 0);
                const currMargin = currRev > 0 ? (currEbitda / currRev) * 100 : 0;
                const prevMargin = prevRev > 0 ? (prevEbitda / prevRev) * 100 : null;
                const marginDiff = prevMargin !== null ? currMargin - prevMargin : null;

                const cashConv = earningsQuality?.cashConversionRatio != null ? Number(earningsQuality.cashConversionRatio) : null;
                const currNetDebt = Number(latestData?.net_debt ?? 0);
                const nbEbitda = currEbitda > 0 ? currNetDebt / (currEbitda * (currRev > 0 ? 1 : 1)) : (currNetDebt <= 0 ? -0.1 : 3.5);
                const periodLabel = latestFlow?.period || report.period || 'Son Dönem';

                // 1. Büyüme & Pazar Payı Yönetimi
                const revStatus: 'BAŞARILI' | 'KISMEN' | 'SAPMA' =
                  revChgPct == null ? 'KISMEN' : revChgPct >= 30 ? 'BAŞARILI' : revChgPct >= 10 ? 'KISMEN' : 'SAPMA';
                rows.push({
                  period: `Büyüme (${periodLabel})`,
                  guidance: 'Enflasyonun üzerinde ciro büyümesi ve pazar payını korumak',
                  actual: revChgPct != null
                    ? `${revChgPct >= 0 ? '+' : ''}%${revChgPct.toFixed(1)} (${formatMrTl(currRev)})`
                    : formatMrTl(currRev),
                  status: revStatus,
                  analysis: revChgPct == null
                    ? 'Önceki yıl aynı dönem verisi eksik olduğu için yıllık büyüme eğilimi izlenmektedir.'
                    : revStatus === 'BAŞARILI'
                    ? 'Yönetim ciroyu yüksek enflasyon eşiğinin üzerinde büyüterek talep ve pazar konumunu korudu.'
                    : revStatus === 'KISMEN'
                    ? 'Nominal ciro artışı sınırlı kaldı; fiyatlama gücü ve hacim artışı yakından izlenmeli.'
                    : 'Satış hacmi reel enflasyonun belirgin gerisinde kalarak talep baskısına işaret ediyor.'
                });

                // 2. Operasyonel Marj & Maliyet Yönetimi
                const marginStatus: 'BAŞARILI' | 'KISMEN' | 'SAPMA' =
                  currMargin <= 0 ? 'SAPMA' : (marginDiff === null || marginDiff >= -1.0) ? 'BAŞARILI' : marginDiff >= -3.5 ? 'KISMEN' : 'SAPMA';
                rows.push({
                  period: `Kârlılık (${periodLabel})`,
                  guidance: 'Girdi ve işletme maliyetlerini yöneterek faaliyet marjını korumak',
                  actual: `%${currMargin.toFixed(1)} FAVÖK Marjı${marginDiff !== null ? ` (${marginDiff >= 0 ? '+' : ''}${marginDiff.toFixed(1)} puan)` : ''}`,
                  status: marginStatus,
                  analysis: currMargin <= 0
                    ? 'Şirket operasyonel zarar bölgesinde; yönetim maliyet yapısını dengelemekte zorlanıyor.'
                    : marginStatus === 'BAŞARILI'
                    ? 'Maliyet artışları satış fiyatlarına yansıtılarak operasyonel kârlılık disiplini korundu.'
                    : 'Faaliyet gideri ve maliyet baskısı marjlarda daralmaya yol açtı; fiyatlama disiplini izlenmeli.'
                });

                // 3. Yatırım & Sermaye Tahsisi (KAP Beyanı + Reel ROIC vs WACC)
                const kapTargetSnippet = cleanKapTargets[0]?.target
                  ? `${cleanKapTargets[0].target} (${cleanKapTargets[0].pageRef})`
                  : null;
                const capStatus: 'BAŞARILI' | 'KISMEN' | 'SAPMA' =
                  evaSpreadNum >= 0 ? 'BAŞARILI' : evaSpreadNum >= -3.0 ? 'KISMEN' : 'SAPMA';
                rows.push({
                  period: 'Sermaye Verimi',
                  guidance: kapTargetSnippet || `Yatırımlardan sermaye maliyeti (%${realWaccNum.toFixed(1)}) üzeri reel getiri sağlamak`,
                  actual: `Reel ROIC %${roicNum.toFixed(1)} (EVA: ${evaSpreadNum >= 0 ? `+${evaSpreadNum.toFixed(1)}` : evaSpreadNum.toFixed(1)} puan)`,
                  status: capStatus,
                  analysis: evaSpreadNum >= 0
                    ? `Yönetimin sermaye tahsisi sermaye maliyetinin üzerinde gerçek ekonomik değer yaratıyor.${kapTargetSnippet ? ' Faaliyet raporundaki yatırım icraatı ile destekleniyor.' : ''}`
                    : `Yatırılan sermaye henüz %${realWaccNum.toFixed(1)} maliyet eşiğinin altında getiri üretiyor; sermaye disiplini takip edilmeli.`
                });

                // 4. Nakit Tahsilatı & Bilanço Disiplini
                const cashStatus: 'BAŞARILI' | 'KISMEN' | 'SAPMA' =
                  (cashConv != null && cashConv >= 85 && (currNetDebt <= 0 || nbEbitda <= 2.0))
                    ? 'BAŞARILI'
                    : (cashConv != null && cashConv >= 40)
                    ? 'KISMEN'
                    : (currNetDebt <= 0 && (earningsQuality?.ocf ?? 0) > 0 ? 'BAŞARILI' : 'SAPMA');

                const cashParts: string[] = [];
                if (cashConv != null) {
                  cashParts.push(`%${cashConv} Nakit Dönüşümü`);
                } else if (earningsQuality?.ocf != null && !isNaN(earningsQuality.ocf)) {
                  cashParts.push(`${formatMrTl(earningsQuality.ocf)} OCF`);
                } else if (currentSector === 'INSURANCE') {
                  cashParts.push('Sigorta Portföyü');
                } else if (currentSector === 'BANKING') {
                  cashParts.push('Mevduat / Kredi Dengesi');
                }
                cashParts.push(currNetDebt <= 0 ? 'Net Nakit' : 'Net Borçlu');

                rows.push({
                  period: 'Nakit & Borç',
                  guidance: 'Muhasebe kârını nakde çevirmek ve borçluluğu güvenli bantta tutmak',
                  actual: cashParts.join(' • '),
                  status: cashStatus,
                  analysis: cashStatus === 'BAŞARILI'
                    ? 'Kârın sıcak nakde dönüşümü yüksek ve bilanço borç baskısından uzak yönetiliyor.'
                    : cashStatus === 'KISMEN'
                    ? 'İşletme nakit üretimi mevcut ancak alacak/stok döngüsü ve borç servisi yakından izlenmeli.'
                    : 'Kârın nakde dönüşümü zayıf veya borç yükü yüksek; işletme sermayesi disiplini bozulmuş durumda.'
                });
              }

              return (
                <>
                  <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">6</span>
                      <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Yönetim Hedef Karnesi</h2>
                    </div>
                    {qa?.activityReport?.kapUrl && (
                      <a
                        href={qa.activityReport.kapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-cyan-400 hover:text-[#f5c242] underline underline-offset-2"
                      >
                        KAP Faaliyet Raporu ({qa.activityReport.periodLabel || 'Son Dönem'})
                      </a>
                    )}
                  </div>

                  <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl">
                    <div className="overflow-x-auto border border-[#323a4b] bg-[#1d222e] rounded-xl">
                      <table className="w-full min-w-[680px] table-fixed text-sm sm:text-[15px] text-left border-collapse font-sans">
                        <thead className="bg-[#242a38] text-white text-xs sm:text-sm border-b border-[#323a4b]">
                          <tr>
                            <th className="w-[15%] min-w-[110px] p-3.5 font-bold font-mono">Alan / Dönem</th>
                            <th className="w-[29%] p-3.5 font-bold">Yönetim Beklentisi ve Hedef</th>
                            <th className="w-[21%] p-3.5 text-right font-bold">Gerçekleşen Sonuç</th>
                            <th className="w-[12%] min-w-[90px] p-3.5 text-center font-bold">Karne</th>
                            <th className="w-[23%] p-3.5 font-bold">Değerlendirme</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2b3242]">
                          {rows.map((r, idx) => (
                            <tr key={idx} className="hover:bg-[#242a38]/60 transition-colors">
                              <td className="p-3.5 font-bold font-mono text-[#f5c242] text-xs sm:text-sm whitespace-nowrap">{r.period}</td>
                              <td className="p-3.5 text-slate-200 text-xs sm:text-sm leading-relaxed break-words">{r.guidance}</td>
                              <td className={`p-3.5 text-right font-mono font-bold text-xs sm:text-sm break-words ${r.status === 'SAPMA' ? 'text-rose-400' : r.status === 'KISMEN' ? 'text-amber-300' : 'text-emerald-300'}`}>
                                {r.actual}
                              </td>
                              <td className="p-3.5 text-center">
                                <span className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono whitespace-nowrap ${
                                  r.status === 'BAŞARILI'
                                    ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                                    : r.status === 'SAPMA'
                                    ? 'bg-rose-950/70 text-rose-400 border border-rose-800/60'
                                    : 'bg-amber-950/70 text-amber-300 border border-amber-800/60'
                                }`}>
                                  {r.status}
                                </span>
                              </td>
                              <td className="p-3.5 text-slate-300 text-xs sm:text-sm leading-relaxed break-words">
                                {r.analysis}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()}
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 7: YATIRIM TEZİ (#sec-yatirim-tezi)                               */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Yatırım Tezi Panosu Hatası">
          <section id="sec-yatirim-tezi" className="scroll-mt-28 rounded-2xl border border-[#242a35] bg-[#101319] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3.5 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">7</span>
                <div>
                  <h2 className="font-sans text-xl sm:text-2xl font-bold text-white leading-tight">Yatırım Tezi</h2>
                </div>
              </div>
            </div>

            {/* Sabit Yatırım Tezi Alt-Bölüm Sekmeleri */}
            <div className="sticky top-[104px] lg:top-14 z-20 backdrop-blur-md bg-[#131720]/95 border border-[#2d3545] rounded-xl p-2 shadow-xl">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 bg-[#161a23] p-1 rounded-xl border border-[#282f3d]">
                {[
                  { id: 'sec-yatirim-tezi-71', label: '7.1 Tez Özeti' },
                  { id: 'sec-yatirim-tezi-72', label: '7.2 Sektörel Konum' },
                  { id: 'sec-yatirim-tezi-73', label: '7.3 Temel Kriterler' },
                  { id: 'sec-yatirim-tezi-74', label: '7.4 Takip Kriterleri' },
                  { id: 'sec-yatirim-tezi-75', label: '7.5 Rapor Bulguları' },
                ].map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => scrollToDomId(sub.id, 'sec-yatirim-tezi')}
                    className="w-full text-center py-1.5 px-2 rounded-lg bg-[#1c212b] hover:bg-[#252c3a] text-xs font-mono font-medium text-slate-300 hover:text-[#f5c242] hover:border-[#f5c242]/40 border border-[#2b3240] transition cursor-pointer"
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 7.1 Tez Özeti */}
            <div id="sec-yatirim-tezi-71" className="scroll-mt-28 bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-7 shadow-xl space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#282d37] pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#f5c242]/10 border border-[#f5c242]/30 flex items-center justify-center text-[#f5c242]">
                    <Compass className="w-4 h-4" />
                  </div>
                  <span className="font-sans text-base sm:text-lg font-bold text-white block leading-snug">
                    7.1 Tez Özeti
                  </span>
                </div>
              </div>

              {/* Üst Yönetici Karar, Fiyat/Potansiyel ve Tek Cümlelik Tez Özeti */}
              <div className="bg-[#1d222e] border border-[#323a4b] rounded-2xl p-4 sm:p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-mono font-black text-xl border shadow-lg shrink-0 ${
                      effectiveDecision === 'AL'
                        ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400 shadow-emerald-950/50'
                        : effectiveDecision === 'ALMA'
                        ? 'bg-rose-950/80 border-rose-500/50 text-rose-400 shadow-rose-950/50'
                        : 'bg-amber-950/80 border-amber-500/50 text-amber-400 shadow-amber-950/50'
                    }`}>
                      {effectiveDecision === 'AL' ? 'AL' : effectiveDecision === 'ALMA' ? 'ALMA' : 'NÖTR'}
                    </div>
                    <div>
                      <h3 className="font-sans text-lg sm:text-xl font-bold text-white">
                        {report.ticker} — Değerleme Özeti
                      </h3>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:gap-6 bg-[#242a38] px-4 sm:px-5 py-3 rounded-xl border border-[#384152]">
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 font-mono uppercase">Güncel Fiyat</div>
                      <div className="text-lg sm:text-xl font-black font-mono text-white mt-0.5">{currentPriceNum > 0 ? `₺${currentPriceNum.toFixed(2)}` : '—'}</div>
                    </div>
                    <div className="hidden sm:block h-8 w-px bg-[#384152]" />
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 font-mono uppercase">Adil Değer</div>
                      <div className="text-lg sm:text-xl font-black font-mono text-[#f5c242] mt-0.5">{fairValueNum > 0 ? `₺${fairValueNum.toFixed(2)}` : '—'}</div>
                    </div>
                    <div className="hidden sm:block h-8 w-px bg-[#384152]" />
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 font-mono uppercase">Potansiyel</div>
                      <div className={`text-lg sm:text-xl font-black font-mono mt-0.5 ${fairValueNum > 0 && currentPriceNum > 0 ? (fairValueNum >= currentPriceNum ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-400'}`}>
                        {fairValueNum > 0 && currentPriceNum > 0
                          ? `${fairValueNum >= currentPriceNum ? '+' : ''}${(((fairValueNum - currentPriceNum) / currentPriceNum) * 100).toFixed(1)}%`
                          : '—'}
                      </div>
                      {fairValueNum > 0 && currentPriceNum > 0 && (
                        <div className="text-[10.5px] font-mono text-slate-400 font-medium">
                          {fairValueNum >= currentPriceNum 
                            ? `%${Math.abs(((fairValueNum - currentPriceNum) / fairValueNum) * 100).toFixed(0)} İskontolu` 
                            : `%${Math.abs(((currentPriceNum - fairValueNum) / currentPriceNum) * 100).toFixed(0)} Primli`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tek Cümlelik Tez Özeti */}
                <div className={`p-4 sm:p-5 rounded-xl border-l-4 ${
                  effectiveDecision === 'AL'
                    ? 'bg-emerald-950/25 border-l-emerald-400 border border-emerald-500/30'
                    : effectiveDecision === 'ALMA'
                    ? 'bg-rose-950/25 border-l-rose-400 border border-rose-500/30'
                    : 'bg-amber-950/25 border-l-amber-400 border border-amber-500/30'
                }`}>
                  <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#f5c242] mb-1.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Tezin Özeti</span>
                  </div>
                  <p className="text-[15px] sm:text-base text-slate-100 font-normal leading-[1.8] font-sans">
                    {synthesizedThesis.headline}
                  </p>
                </div>

                {/* 4 Öne Çıkan Hızlı Analitik Sinyal Şeridi */}
                {synthesizedThesis.standoutHighlights.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                    {synthesizedThesis.standoutHighlights.slice(0, 4).map((hl, idx) => {
                      const topBorder =
                        hl.tone === 'emerald'
                          ? 'border-t-emerald-400/70'
                          : hl.tone === 'cyan'
                          ? 'border-t-cyan-400/70'
                          : hl.tone === 'amber'
                          ? 'border-t-amber-400/70'
                          : 'border-t-rose-400/70';
                      const tagColor =
                        hl.tone === 'emerald'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25'
                          : hl.tone === 'cyan'
                          ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25'
                          : hl.tone === 'amber'
                          ? 'text-amber-400 bg-amber-500/10 border-amber-500/25'
                          : 'text-rose-400 bg-rose-500/10 border-rose-500/25';

                      return (
                        <div
                          key={idx}
                          className={`bg-[#242a38] border border-[#384152] border-t-2 ${topBorder} rounded-xl p-3.5 space-y-1.5 flex flex-col justify-between shadow-sm`}
                        >
                          <div className="space-y-1.5">
                            <span className={`inline-block text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${tagColor}`}>
                              {hl.tag}
                            </span>
                            <div className="text-[13.5px] font-bold text-white leading-snug font-sans">
                              {hl.title}
                            </div>
                          </div>
                          <p className="text-xs text-slate-300 leading-[1.65] font-sans pt-1">
                            {hl.detail}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2 Sütunlu Derin Sentez: Aksiyon Gerekçesi & Fırsatın Kaynağı */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Sol Kart: Ana Yatırım Tezi */}
                <div className="bg-[#1d222e] border border-[#323a4b] rounded-2xl p-5 sm:p-6 space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2 border-b border-[#2b3242] pb-3">
                      <div className="flex items-center gap-2">
                        {effectiveDecision === 'ALMA' ? (
                          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                        ) : effectiveDecision === 'NÖTR' ? (
                          <Scale className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                        <h4 className="font-sans font-bold text-white text-[15px] sm:text-base">
                          {synthesizedThesis.whyActionTitle}
                        </h4>
                      </div>
                    </div>

                    <div className="space-y-3.5">
                      {synthesizedThesis.whyActionParagraphs.map((para, pIdx) => (
                        <div
                          key={pIdx}
                          className="bg-[#242a38] border border-[#384152] rounded-xl p-4 space-y-1.5"
                        >
                          <div className={`text-[11px] font-mono font-bold uppercase tracking-wider ${
                            effectiveDecision === 'ALMA'
                              ? 'text-rose-400'
                              : effectiveDecision === 'NÖTR'
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}>
                            {pIdx === 0 ? '01 • Bilanço ve Operasyonel Yapı' : `0${pIdx + 1} • Sermaye Getirisi ve Değerleme`}
                          </div>
                          <p className="text-sm sm:text-[14.5px] text-slate-200 leading-[1.8] font-sans">
                            {para}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sağ Kart: Piyasa Fiyatlaması ve Fırsat / Risk Dengesi */}
                <div className="bg-[#1d222e] border border-[#323a4b] rounded-2xl p-5 sm:p-6 space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b3242] pb-3">
                      <div className="flex items-center gap-2">
                        <Compass className="w-4 h-4 text-[#f5c242] shrink-0" />
                        <h4 className="font-sans font-bold text-white text-[15px] sm:text-base">
                          {synthesizedThesis.opportunitySourceTitle}
                        </h4>
                      </div>
                    </div>

                    <div className="bg-[#242a38] border border-[#384152] rounded-xl p-4 space-y-1.5">
                      <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#f5c242]">
                        01 • Piyasa Fiyatlaması
                      </div>
                      <p className="text-sm sm:text-[14.5px] text-slate-200 leading-[1.8] font-sans">
                        {synthesizedThesis.opportunitySourceNarrative}
                      </p>
                    </div>
                  </div>

                  {/* Fırsat / Risk Terazisi Kutusu */}
                  {(() => {
                    const rawBear = canonicalBearPrice;
                    const bearTargetNum = rawBear > 0 && (currentPriceNum <= 0 || rawBear < currentPriceNum)
                      ? rawBear
                      : Number(((currentPriceNum > 0 ? currentPriceNum : 10) * 0.85).toFixed(2));
                    const downsidePct = currentPriceNum > 0
                      ? Math.max(2, ((currentPriceNum - bearTargetNum) / currentPriceNum) * 100)
                      : 15;
                    const upsideRewardPct = currentPriceNum > 0 && fairValueNum > 0
                      ? ((fairValueNum - currentPriceNum) / currentPriceNum) * 100
                      : 0;
                    const absUpside = Math.max(4, Math.abs(upsideRewardPct));
                    const totalSpan = downsidePct + absUpside;
                    const leftWeight = upsideRewardPct < 0
                      ? Math.max(64, Math.min(78, Math.round((downsidePct / Math.max(totalSpan, 1)) * 100)))
                      : Math.min(78, Math.max(22, Math.round((downsidePct / Math.max(totalSpan, 1)) * 100)));
                    const rightWeight = 100 - leftWeight;
                    const rewardRiskRatio = upsideRewardPct > 0
                      ? (upsideRewardPct / Math.max(downsidePct, 4)).toFixed(1)
                      : null;

                    return (
                      <div className="bg-[#242a38] border border-[#384152] rounded-xl p-4 space-y-3.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                            02 • Fırsat / Risk Dengesi
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-bold border ${
                            upsideRewardPct >= 15
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                              : upsideRewardPct >= 0
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                          }`}>
                            {rewardRiskRatio
                              ? `${rewardRiskRatio}x Fırsat / Risk`
                              : `Primli (-%${Math.abs(upsideRewardPct).toFixed(1)})`}
                          </span>
                        </div>

                        {/* Görsel Fırsat & Risk Terazisi (Yatay Skala) */}
                        <div className="bg-[#181d27] border border-[#2d3545] rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-mono">
                            <span className="text-rose-400 font-semibold">
                              Stres Tabanı: ₺{bearTargetNum.toFixed(2)} (-%{downsidePct.toFixed(1)})
                            </span>
                            <span className="text-white font-bold">
                              Güncel: ₺{currentPriceNum.toFixed(2)}
                            </span>
                            <span className={upsideRewardPct >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                              Adil Değer: ₺{fairValueNum.toFixed(2)} ({upsideRewardPct >= 0 ? `+%${upsideRewardPct.toFixed(1)}` : `-%${Math.abs(upsideRewardPct).toFixed(1)}`})
                            </span>
                          </div>

                          <div className="relative h-3 w-full rounded-full overflow-hidden bg-[#1e232d] flex border border-[#2a3140]">
                            <div
                              style={{ width: `${leftWeight}%` }}
                              className="h-full bg-gradient-to-r from-rose-600/80 to-amber-500/70 transition-all"
                              title={`Stres Tabanı Marjı: -%${downsidePct.toFixed(1)}`}
                            />
                            <div className="w-1 h-full bg-white shadow-[0_0_8px_#fff] z-10 shrink-0" title={`Güncel Fiyat: ₺${currentPriceNum.toFixed(2)}`} />
                            <div
                              style={{ width: `${rightWeight}%` }}
                              className={`h-full transition-all ${
                                upsideRewardPct >= 0
                                  ? 'bg-gradient-to-r from-emerald-500/70 to-emerald-400/90'
                                  : 'bg-gradient-to-r from-rose-500/70 to-rose-700/90'
                              }`}
                              title={`Adil Değer Potansiyeli: ${upsideRewardPct >= 0 ? '+' : ''}%${upsideRewardPct.toFixed(1)}`}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] font-sans text-slate-400">
                            <span>Aşağı Yönlü Stres Alanı</span>
                            <span>Mevcut Denge Noktası</span>
                            <span>{upsideRewardPct >= 0 ? 'Yukarı Yönlü Değerleme Alanı' : 'Adil Değer Üzeri Prim'}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
                          <div className="bg-[#181d27] border border-[#2d3545] rounded-lg p-2.5">
                            <div className="text-xs text-slate-400 font-mono">Fiyat / Adil Değer</div>
                            <div className="text-xs sm:text-sm font-bold font-mono text-white mt-0.5">
                              ₺{currentPriceNum.toFixed(2)} → <span className="text-[#f5c242]">₺{fairValueNum.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="bg-[#181d27] border border-[#2d3545] rounded-lg p-2.5">
                            <div className="text-xs text-slate-400 font-mono">Reel EVA Makası</div>
                            <div className={`text-xs sm:text-sm font-bold font-mono mt-0.5 ${evaSpreadNum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {evaSpreadNum >= 0 ? `+${evaSpreadNum.toFixed(1)}` : evaSpreadNum.toFixed(1)} Puan
                            </div>
                          </div>
                          <div className="bg-[#181d27] border border-[#2d3545] rounded-lg p-2.5">
                            <div className="text-xs text-slate-400 font-mono">Nakit Kalitesi</div>
                            <div className="text-xs sm:text-sm font-bold font-mono text-cyan-300 mt-0.5 truncate" title={earningsQuality.statusTitle}>
                              {earningsQuality.statusTitle}
                            </div>
                          </div>
                          <div className="bg-[#181d27] border border-[#2d3545] rounded-lg p-2.5">
                            <div className="text-xs text-slate-400 font-mono">Beklenen Değer E[V] &amp; Kelly</div>
                            <div className="text-xs sm:text-sm font-bold font-mono text-[#f5c242] mt-0.5">
                              ₺{probabilisticEdge.expectedValue.toFixed(2)}{' '}
                              <span className="text-slate-300 font-normal">•</span>{' '}
                              <span className={probabilisticEdge.halfKellyWeightPct > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                %{probabilisticEdge.halfKellyWeightPct.toFixed(1)} Ağırlık
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* 7.2 Sektörel Konum */}
            <div id="sec-yatirim-tezi-72" className="scroll-mt-28 bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-7 shadow-xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#282d37] pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <h3 className="font-sans font-bold text-white text-base sm:text-lg leading-snug">
                    7.2 Sektörel Konum
                  </h3>
                </div>
              </div>

              <div className="bg-[#1d222e] border-l-4 border-l-cyan-400 border border-[#323a4b] rounded-xl p-4 sm:p-5">
                <p className="text-sm sm:text-[15px] text-slate-200 leading-[1.8] font-sans">
                  {synthesizedThesis.sectoralEdgeNarrative}
                </p>
              </div>

              {/* 4 Sektörel Kıyaslama Kartı */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {synthesizedThesis.sectoralComparisonBadges.map((b, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl p-4 border space-y-2 transition-colors ${
                      b.isAdvantage
                        ? 'bg-[#1d242e] border-emerald-500/35 hover:border-emerald-500/55'
                        : 'bg-[#1d222e] border-[#323a4b]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400 font-semibold">{b.label}</span>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        b.isAdvantage
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        {b.isAdvantage ? 'Avantajlı' : 'İzlenmeli'}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 pt-1">
                      <span className={`text-lg sm:text-xl font-black font-mono ${
                        b.isAdvantage ? 'text-emerald-400' : 'text-amber-300'
                      }`}>
                        {b.companyValue}
                      </span>
                      <span className="text-xs font-mono text-slate-400">{b.benchmarkValue}</span>
                    </div>
                    <div className={`text-xs font-medium pt-2 border-t border-[#2b3242] leading-snug ${
                      b.isAdvantage ? 'text-emerald-300' : 'text-slate-300'
                    }`}>
                      {b.verdict}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 7.3 Temel Kriterler */}
            <div id="sec-yatirim-tezi-73" className="scroll-mt-28 bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-7 shadow-xl space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#282d37] pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#f5c242]/10 border border-[#f5c242]/30 flex items-center justify-center text-[#f5c242]">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h3 className="font-sans font-bold text-white text-base sm:text-lg leading-snug">
                    7.3 Temel Kriterler
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {synthesizedThesis.pillars.map((pillar) => {
                  const tone = pillar.badgeTone || (pillar.status === 'GÜÇLÜ' ? 'positive' : pillar.status === 'DENGELİ' ? 'neutral' : 'negative');
                  const accentBorder =
                    tone === 'positive'
                      ? 'border-l-emerald-400 border-[#323a4b]'
                      : tone === 'neutral'
                      ? 'border-l-amber-400 border-[#323a4b]'
                      : 'border-l-rose-400 border-[#323a4b]';
                  const isExpanded = Boolean(expandedThesisPillars[pillar.id]);

                  return (
                    <div
                      key={pillar.id}
                      className={`bg-[#1d222e] border border-l-4 ${accentBorder} rounded-xl p-5 space-y-3.5 flex flex-col justify-between shadow-md`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-sans font-bold text-white text-[15px] sm:text-base">
                            {pillar.title}
                          </div>
                          <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold border shrink-0 ${
                            tone === 'positive'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                              : tone === 'neutral'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                              : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                          }`}>
                            {pillar.badgeText}
                          </span>
                        </div>

                        {/* Harmanlanan 3 Metrik */}
                        <div className="grid grid-cols-3 gap-2.5 bg-[#242a38] p-3 rounded-xl border border-[#384152]">
                          {pillar.metrics.map((m, mIdx) => (
                            <div key={mIdx} className="text-center">
                              <div className="text-[11px] text-slate-400 truncate font-sans">{m.label}</div>
                              <div className={`text-xs sm:text-sm font-bold font-mono mt-1 ${
                                m.isPositive ? 'text-emerald-400' : 'text-slate-100'
                              }`}>
                                {m.value}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Kısa Özet (Varsayılan Görünüm) */}
                        <p className="text-xs sm:text-[13.5px] text-slate-200 leading-[1.7] font-sans">
                          {pillar.shortSummary || pillar.narrative}
                        </p>

                        {/* Veri Detayı Açılır Katmanı (Accordion) */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => toggleThesisPillar(pillar.id)}
                            className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-lg bg-[#242a38] hover:bg-[#2b3242] border border-[#384152] text-xs font-mono font-semibold text-slate-300 hover:text-[#f5c242] transition cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              <Layers className="w-3.5 h-3.5 text-[#f5c242]" />
                              <span>Veri Detayı</span>
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-[#f5c242]">
                              <span>{isExpanded ? 'Gizle' : 'Detayı Gör'}</span>
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`} />
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="mt-3 p-3.5 rounded-xl bg-[#131720] border border-[#2b3242] space-y-3 animate-in fade-in duration-150">
                              <p className="text-xs text-slate-300 leading-[1.75] font-sans border-b border-[#242a38] pb-2.5">
                                {pillar.narrative}
                              </p>
                              {Array.isArray(pillar.evidenceItems) && pillar.evidenceItems.length > 0 && (
                                <div className="space-y-2">
                                  {pillar.evidenceItems.map((ev, evIdx) => (
                                    <div key={evIdx} className="bg-[#1d222e] border border-[#323a4b] rounded-lg px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                      <div>
                                        <div className="text-[11px] font-semibold text-slate-200 font-sans">{ev.label}</div>
                                        <div className="text-[10.5px] text-slate-400 font-sans">{ev.comment}</div>
                                      </div>
                                      <div className="text-xs font-mono font-bold text-[#f5c242] shrink-0">
                                        {ev.value}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 7.4 Takip Kriterleri */}
            <div id="sec-yatirim-tezi-74" className="scroll-mt-28 bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-7 shadow-xl space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#282d37] pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Scale className="w-4 h-4" />
                  </div>
                  <h3 className="font-sans font-bold text-white text-base sm:text-lg leading-snug">
                    7.4 Takip Kriterleri
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Sol: Olumlu Katalizörler (En fazla 3 madde, kompakt + genişletilebilir) */}
                <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-5 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-[#2b3242] pb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="font-sans font-bold text-white text-sm sm:text-[15px]">
                        Olumlu Katalizörler
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-3">
                    {(synthesizedThesis.catalystChecklist && synthesizedThesis.catalystChecklist.length > 0
                      ? synthesizedThesis.catalystChecklist
                      : synthesizedThesis.catalysts.map((cat) => ({
                          category: 'Değerleme Katalizörü',
                          metric: 'Hedef Gösterge',
                          threshold: 'Bilanço Teyidi',
                          period: 'Çeyreklik Takip',
                          text: cat
                        }))
                    ).slice(0, 3).map((item, idx) => {
                      const itemKey = `cat-${idx}`;
                      const isExpanded = Boolean(expandedChecklistItems[itemKey]);
                      return (
                        <li
                          key={idx}
                          onClick={() => toggleChecklistItem(itemKey)}
                          className="bg-[#242a38] hover:bg-[#293040] p-3.5 rounded-xl border border-[#384152] space-y-2 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded-md bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                                ✓
                              </span>
                              <span className="text-xs font-sans font-bold text-white truncate">
                                {item.category}
                              </span>
                            </div>
                            <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                              {item.threshold}
                            </span>
                          </div>
                          <p className={`text-xs sm:text-[13.5px] text-slate-200 leading-[1.65] font-sans pl-7 ${isExpanded ? '' : 'line-clamp-2'}`}>
                            {item.text}
                          </p>
                          <div className="flex items-center justify-between pl-7 text-[11px] font-mono text-slate-400">
                            <span>{isExpanded ? `Takip: ${item.period}` : ''}</span>
                            <span className="text-cyan-300 flex items-center gap-1">
                              <span>{isExpanded ? 'Küçült' : 'Detay'}</span>
                              <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`} />
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Sağ: Tezi Bozan Riskler (En fazla 3 madde, kompakt + genişletilebilir) */}
                <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-5 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-[#2b3242] pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="font-sans font-bold text-white text-sm sm:text-[15px]">
                        Tezi Bozan Riskler
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-3">
                    {(synthesizedThesis.breakerChecklist && synthesizedThesis.breakerChecklist.length > 0
                      ? synthesizedThesis.breakerChecklist
                      : synthesizedThesis.thesisBreakers.map((tb) => ({
                          category: 'Kırmızı Çizgi',
                          metric: 'Stres Göstergesi',
                          threshold: 'Kritik Sınır',
                          period: 'Çeyreklik Takip',
                          text: tb
                        }))
                    ).slice(0, 3).map((item, idx) => {
                      const itemKey = `brk-${idx}`;
                      const isExpanded = Boolean(expandedChecklistItems[itemKey]);
                      return (
                        <li
                          key={idx}
                          onClick={() => toggleChecklistItem(itemKey)}
                          className="bg-[#242a38] hover:bg-[#293040] p-3.5 rounded-xl border border-[#384152] space-y-2 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded-md bg-rose-500/15 border border-rose-500/35 text-rose-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                                !
                              </span>
                              <span className="text-xs font-sans font-bold text-white truncate">
                                {item.category}
                              </span>
                            </div>
                            <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              {item.threshold}
                            </span>
                          </div>
                          <p className={`text-xs sm:text-[13.5px] text-slate-200 leading-[1.65] font-sans pl-7 ${isExpanded ? '' : 'line-clamp-2'}`}>
                            {item.text}
                          </p>
                          <div className="flex items-center justify-between pl-7 text-[11px] font-mono text-slate-400">
                            <span>{isExpanded ? `Takip: ${item.period}` : ''}</span>
                            <span className="text-rose-300 flex items-center gap-1">
                              <span>{isExpanded ? 'Küçült' : 'Detay'}</span>
                              <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`} />
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>

            {/* 7.5 Faaliyet Raporu ve Dipnot Bulguları */}
            {(() => {
              const kapQual = liveKapQualitativeAudit || valuationInfo?.qualitative_risk_audit || report.extractedData?.qualitative_risk_audit;
              if (loadingKapQual && !kapQual) {
                return (
                  <div id="sec-yatirim-tezi-75" className="scroll-mt-28 bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-6 shadow-xl flex items-center gap-3 text-xs sm:text-sm font-mono text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                    <span>7.5 Faaliyet Raporu ve Dipnot Bulguları hazırlanıyor...</span>
                  </div>
                );
              }
              if (!kapQual || !Array.isArray(kapQual.findings) || kapQual.findings.length === 0) return null;

              return (
                <div id="sec-yatirim-tezi-75" className="scroll-mt-28 bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-7 shadow-xl space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[#282d37] pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <h3 className="font-sans font-bold text-white text-base sm:text-lg leading-snug">
                        7.5 Faaliyet Raporu ve Dipnot Bulguları
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {kapQual.activityReport?.kapUrl && (
                        <a
                          href={kapQual.activityReport.kapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-cyan-300 hover:text-[#f5c242] bg-[#1d222e] px-2.5 py-1 rounded-lg border border-[#323a4b] transition"
                        >
                          Faaliyet Raporu ({kapQual.activityReport.pageCount} syf)
                        </a>
                      )}
                      {kapQual.financialReport?.kapUrl && (
                        <a
                          href={kapQual.financialReport.kapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-slate-300 hover:text-[#f5c242] bg-[#1d222e] px-2.5 py-1 rounded-lg border border-[#323a4b] transition"
                        >
                          Finansal Dipnotlar ({kapQual.financialReport.pageCount} syf)
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Kalitatif Bulgular Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {kapQual.findings.map((f: any) => {
                      const disp = formatKapFindingForDisplay(f);

                      return (
                        <div
                          key={f.id}
                          className={`bg-[#1d222e] border border-[#323a4b] border-l-4 ${disp.borderLeftClass} rounded-xl p-4 sm:p-5 space-y-3 flex flex-col justify-between`}
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded text-[10.5px] font-mono font-bold border ${disp.badgeClass}`}>
                                {disp.badgeText}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400 bg-[#242a38] px-2 py-0.5 rounded border border-[#384152]">
                                {f.sourceDoc} • {f.pageRef}
                              </span>
                            </div>
                            <div className="text-sm sm:text-[15px] font-bold text-white font-sans leading-snug">
                              {disp.title}
                            </div>
                            {disp.excerpt && (
                              <p className="text-xs text-slate-300 leading-relaxed font-sans border-l-2 border-[#384152] pl-2.5">
                                &ldquo;{disp.excerpt}&rdquo;
                              </p>
                            )}
                          </div>
                          <div className="bg-[#242a38] border border-[#384152] rounded-lg p-3 text-xs text-slate-100 leading-relaxed font-sans">
                            <span className="text-[#f5c242] font-bold mr-1">Şirkete Etkisi:</span>
                            {disp.impact}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 8: ANALİZ RAPORU (#sec-analist)                                   */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Değerleme Raporu Hatası">
          <section id="sec-analist" className="scroll-mt-28 rounded-2xl border border-[#242a35] bg-[#101319] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3.5 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">8</span>
                <div>
                  <h2 className="font-sans text-xl sm:text-2xl font-bold text-white leading-tight">Analiz Raporu</h2>
                </div>
              </div>
            </div>

            {/* 8.1 Detaylı Analiz Raporu — Kontrol Çubuğu */}
            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#282d37] pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="font-sans text-base sm:text-lg font-bold text-white block leading-snug">
                    8.1 Detaylı Analiz Raporu
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {reportChapters.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const anyOpen = reportChapters.some(ch => !collapsedReportChapters[ch.id]);
                        if (anyOpen) {
                          const next: Record<string, boolean> = {};
                          reportChapters.forEach(ch => { next[ch.id] = true; });
                          setCollapsedReportChapters(next);
                        } else {
                          setCollapsedReportChapters({});
                        }
                      }}
                      className="px-3 py-1 rounded-lg text-xs font-mono font-semibold bg-[#21262d] hover:bg-[#2b313d] text-[#f5c242] border border-[#2e3440] transition cursor-pointer"
                    >
                      {reportChapters.some(ch => !collapsedReportChapters[ch.id]) ? 'Bölümleri Daralt' : 'Tüm Bölümleri Aç'}
                    </button>
                  )}
                </div>
              </div>

              {/* Hızlı Bölüm Atlama Düğmeleri (Quick Chapter Navigation) */}
              {reportChapters.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {reportChapters.map((ch) => {
                    const isCollapsed = Boolean(collapsedReportChapters[ch.id]);
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          setCollapsedReportChapters(prev => ({ ...prev, [ch.id]: false }));
                          window.requestAnimationFrame(() => {
                            window.requestAnimationFrame(() => {
                              scrollToDomId(ch.id, 'sec-analist');
                            });
                          });
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-[13px] font-medium border transition cursor-pointer shadow-sm ${
                          isCollapsed
                            ? 'bg-[#1d222e]/60 text-slate-400 border-[#2b3242] hover:text-slate-200 hover:border-[#384152]'
                            : 'bg-[#1d222e] hover:bg-[#242a38] text-slate-200 hover:text-[#f5c242] border-[#323a4b] hover:border-[#f5c242]/40'
                        }`}
                      >
                        <span className="font-mono font-bold text-[#f5c242]">{ch.roman}.</span>
                        <span>{ch.tag}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bölüm Kartları */}
            {report.report && reportChapters.length > 0 ? (
              <div className="space-y-5">
                {reportChapters.map((chapter) => {
                  const isCollapsed = Boolean(collapsedReportChapters[chapter.id]);

                  return (
                    <div
                      key={chapter.id}
                      id={chapter.id}
                      className="scroll-mt-28 bg-[#161a23] border border-[#2a3140] rounded-2xl shadow-xl overflow-hidden transition-all"
                    >
                      {/* Bölüm Başlık Çubuğu */}
                      <div
                        onClick={() => toggleReportChapter(chapter.id)}
                        className="bg-[#1d222e] hover:bg-[#242a38] border-b border-[#2b3242] px-5 sm:px-6 py-4 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-9 h-9 rounded-xl bg-[#f5c242]/15 border border-[#f5c242]/35 flex items-center justify-center font-mono text-sm font-black text-[#f5c242] shrink-0 shadow-sm">
                            {chapter.roman}
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-sans text-base sm:text-lg font-bold text-white tracking-wide truncate">
                              {chapter.title}
                            </h3>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0 text-[#f5c242]'}`} />
                        </div>
                      </div>

                      {/* Bölüm İçerik Alanı */}
                      {!isCollapsed && (
                        <div className="p-5 sm:p-7 bg-[#131720] space-y-5">
                          <div className="prose prose-invert prose-sm max-w-none font-sans text-sm leading-[1.8] text-slate-200">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                h1: ({ ...props }) => <h1 className="font-sans text-lg sm:text-xl font-bold text-[#f5c242] border-b border-[#2e3440] pb-2 mt-4 mb-3" {...props} />,
                                h2: ({ children, ...props }: any) => (
                                  <div className="mt-5 mb-2.5 pt-3.5 border-t border-[#262c38] first:mt-0 first:pt-0 first:border-0">
                                    <div className="flex items-center gap-2">
                                      <span className="w-1.5 h-4.5 bg-[#f5c242] rounded-full inline-block" />
                                      <h2 className="font-sans text-sm sm:text-base font-bold text-white tracking-wide m-0" {...props}>
                                        {children}
                                      </h2>
                                    </div>
                                  </div>
                                ),
                                h3: ({ children, ...props }: any) => {
                                  const text = extractTextFromChildren(children);
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
                                    <div className="mt-4 mb-2.5 pt-1">
                                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-sans font-bold ${badgeColor} shadow-sm`}>
                                        <span>{icon}</span>
                                        <h3 className="m-0 font-sans text-xs sm:text-sm font-bold text-white" {...props}>
                                          {children}
                                        </h3>
                                      </div>
                                    </div>
                                  );
                                },
                                p: ({ children, ...props }: any) => {
                                  const text = extractTextFromChildren(children);
                                  const trimmed = text.trim();
                                  const isSummaryMetaLine =
                                    trimmed.length < 220 &&
                                    /^(?:Özet\s+)?Yatırım\s+Tezi\s*:/i.test(trimmed) &&
                                    trimmed.includes('Katalizör') &&
                                    trimmed.includes('Risk');
                                  if (/^\s*Analist\s+Karar[ıi]\s*[:=-]/i.test(trimmed) || isSummaryMetaLine) {
                                    return null;
                                  }
                                  const isKeySummaryLine = /^(?:Temel Yatırım Tezi|Finansal Sağlık Skoru)\s*:/i.test(text.trim());
                                  if (isKeySummaryLine) {
                                    return (
                                      <div className="my-3 p-3.5 rounded-xl bg-[#191d26] border border-[#282f3d] shadow-sm">
                                        <p className="text-sm leading-[1.75] m-0 text-slate-200 font-sans" {...props}>
                                          {enrichReportNode(children, 'p-key')}
                                        </p>
                                      </div>
                                    );
                                  }
                                  return (
                                    <p className="text-sm leading-[1.8] mb-3 text-slate-200 font-sans" {...props}>
                                      {enrichReportNode(children, 'p')}
                                    </p>
                                  );
                                },
                                ul: ({ ...props }) => <ul className="space-y-2 my-3 text-slate-200 pl-1 list-none" {...props} />,
                                ol: ({ ...props }) => <ol className="space-y-2 my-3 text-slate-200 pl-1 list-none" {...props} />,
                                li: ({ children, ...props }: any) => (
                                  <li
                                    className="border-l-2 border-[#2e3646] hover:border-[#f5c242]/80 pl-3.5 py-1 flex items-start gap-2.5 text-sm leading-[1.8] transition-colors"
                                    {...props}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#f5c242]/85 mt-2 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">{enrichReportNode(children, 'li')}</div>
                                  </li>
                                ),
                                strong: ({ children, ...props }: any) => {
                                  const text = extractTextFromChildren(children).trim();
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

                                  // 1. Kalın Fiyat / Tutar İfadeleri (örn. **2762,17 TL**, **-623,45 Milyon TL**, **21.330.000.000 TL**)
                                  if (/^(?:[+-]\s*)?(?:₺\s*\d[\d.,]*(?:\s*(?:Milyar|Milyon|Mr|Mn|Bin))?|\d[\d.,]*\s*(?:Milyar|Milyon|Mr|Mn|Bin)?\s*TL)$/i.test(text)) {
                                    return (
                                      <span className="text-[#f5c242] font-semibold">
                                        {text}
                                      </span>
                                    );
                                  }

                                  // 2. Kalın Getiri Potansiyeli / İskonto / Prim İfadeleri (örn. **%108.0 getiri potansiyeli**)
                                  if (/^[+-]?\s*%\s*[+-]?\d+(?:[.,]\d+)?(?:\s*(?:getiri\s+potansiyeli|[iİ]skonto(?:lu)?|potansiyel|güvenlik\s+marjı|üzerinde|prim(?:li)?|\([^)]+\)))?$/i.test(text)) {
                                    const isNegativeVal = /(?:^\s*-|%\s*-|prim|zarar|daralma|UNSAFE|Yetersiz)/i.test(text);
                                    const isPositiveReturn = !isNegativeVal && /(?:getiri\s+potansiyeli|[iİ]skonto|potansiyel|güvenlik\s+marjı|üzerinde|SAFE|GÜVENLİ|Güvenli|^\s*\+|%\s*\+)/i.test(text);
                                    if (isNegativeVal) {
                                      return (
                                        <span className="text-rose-400 font-semibold">
                                          {text}
                                        </span>
                                      );
                                    }
                                    if (isPositiveReturn) {
                                      return (
                                        <span className="text-emerald-400 font-semibold">
                                          {text}
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className="text-cyan-300 font-semibold">
                                        {text}
                                      </span>
                                    );
                                  }

                                  // 3. Sonunda Parantez İçi Yargı Bulunan Kalın Cümleler (örn. **...sunduğu değerlendirilmektedir (Güçlü Alım Tezi / Olumlu)**)
                                  const trailingEvalMatch = text.match(/^(.*?)\s*(\(\s*(?:Güçlü Alım Tezi|Sermaye Koruma|Nötr|Dengeli|Aşağı yönlü|Faiz şoklarına|Yönetilebilir|Operasyonel|Yüksek risk)[^()]+\))$/i);
                                  if (trailingEvalMatch && trailingEvalMatch[1].trim().length > 0) {
                                    return (
                                      <>
                                        <strong className="font-semibold text-white font-sans">{enrichPlainTextSegment(trailingEvalMatch[1], 'str-pre')}</strong>{' '}
                                        {renderSemanticEvalBadge(trailingEvalMatch[2], 'str-eval')}
                                      </>
                                    );
                                  }

                                  // 4. Doğrudan Olumlu / Olumsuz / Nötr Yargı İfadeleri
                                  if (/(?:Güçlü Alım Tezi|Açısından Olumlu|açısından olumlu|Aşağı Yönlü Risk Emniyeti|Yüksek İskonto Emniyeti|Aşağı yönlü risk sınırlı\s*\/\s*Olumlu|Faiz şoklarına karşı korumalı\s*\/\s*Olumlu|ekonomik zenginlik yarattığını gösteren olumlu bir teyittir|oldukça olumludur|savunmacı ve olumlu bir göstergedir|hissedar değeri açısından güçlü ve olumlu|Mükemmel Kurumsal Kalite|Güvenli İskonto Marjı)/i.test(text) && !/olumsuz/i.test(text)) {
                                    return renderSemanticEvalBadge(text, 'str-pos');
                                  }
                                  if (/(?:Açısından Kritik|Operasyonel Kaldıraç Hassasiyeti|Yönetilebilir Finansman Riski|Yönetilebilir faiz riski|Nötr\s*\/\s*Koşullu [iİ]zleme|Nötr\s*\/\s*Bekle-Gör|Dengeli(?:\s*\/\s*Ilımlı)? görünüm|temkinli [iİ]zlenmeli|temkinli [iİ]zlenmesi gereken|Yüksek risk-ödül asimetrisi|orta vadede nötr\/fırsat|Sınırda Güvenlik Marjı)/i.test(text)) {
                                    return renderSemanticEvalBadge(text, 'str-neu');
                                  }
                                  if (/(?:Açısından (?:Zayıf\/)?Olumsuz|açısından (?:zayıf\/|temkinli\/)?olumsuz|Sermaye Koruma Açısından Olumsuz|Sermaye Erozyonu|Değer Tuzağı Riski|Yüksek Finansal Risk|Yetersiz Güvenlik Marjı|özkaynak erozyonuna işaret eden olumsuz bir risk|yüksek riskli ve olumsuz bir göstergedir)/i.test(text)) {
                                    return renderSemanticEvalBadge(text, 'str-neg');
                                  }

                                  // 5. Kalın Çarpan veya Skor (örn. **2,32x**, **90**)
                                  if (/^(?:\d+(?:[.,]\d+)?x(?:\s*\([^)]+\))?|\d{1,3}\/100)$/i.test(text)) {
                                    return (
                                      <span className="text-cyan-300 font-semibold">
                                        {text}
                                      </span>
                                    );
                                  }

                                  return (
                                    <strong className="font-semibold text-white font-sans" {...props}>
                                      {enrichReportNode(children, 'strong')}
                                    </strong>
                                  );
                                },
                                blockquote: ({ children, ...props }: any) => {
                                  const text = extractTextFromChildren(children);
                                  const isWarning = text.includes('⚠️') || text.includes('Adli Denetim') || text.includes('Değer Tuzağı') || text.includes('Risk') || text.includes('Fren') || text.includes('Neden "AL" Verilmedi');
                                  return (
                                    <div className={`my-4 p-4 sm:p-5 rounded-xl border-l-4 border shadow-md ${
                                      isWarning
                                        ? 'bg-rose-950/20 border-l-rose-500 border-rose-500/30'
                                        : 'bg-[#191d26] border-l-[#f5c242] border-[#282f3d]'
                                    }`}>
                                      <blockquote className="text-sm sm:text-[15px] text-slate-200 leading-[1.8] font-sans not-italic border-none p-0 m-0" {...props}>
                                        {children}
                                      </blockquote>
                                    </div>
                                  );
                                },
                                table: ({ ...props }) => (
                                  <div className="overflow-x-auto my-5 rounded-xl border border-[#2b313d] bg-[#161921] shadow-md">
                                    <table className="w-full text-sm text-left border-collapse font-sans" {...props} />
                                  </div>
                                ),
                                th: ({ ...props }) => <th className="bg-[#1e232e] px-4 py-3 font-bold text-slate-200 border-b border-[#2e3440] text-xs font-mono uppercase tracking-wider" {...props} />,
                                td: ({ children, ...props }: any) => (
                                  <td className="px-4 py-3 border-b border-[#242a36] text-slate-200 leading-relaxed text-xs sm:text-sm" {...props}>
                                    {enrichReportNode(children, 'td')}
                                  </td>
                                )
                              }}
                            >
                              {chapter.body}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-10 text-center text-slate-400 font-mono text-sm">
                Bu analiz için detaylı analist rapor metni henüz üretilmedi.
              </div>
            )}

            {/* 8.2 Nihai Analist Hükmü & Portföy Konumlandırma Özeti Kartı (7.1 ile Tekrardan Arındırılmış) */}
            {(() => {
              const rawScoreVal = valuationInfo?.score ?? (report as any)?.score ?? (report as any)?.scoreResult?.totalScore;
              const parsedAudit = parseNumericScore(rawScoreVal);
              const auditScore = parsedAudit !== null
                ? parsedAudit
                : (executiveVerdict.verdict === 'AL' ? 82 : executiveVerdict.verdict === 'ALMA' ? 42 : 64);

              const rawBear = canonicalBearPrice;
              const bearFloorPrice = rawBear > 0 && (currentPriceNum <= 0 || rawBear < currentPriceNum)
                ? rawBear
                : Number(((currentPriceNum > 0 ? currentPriceNum : 10) * 0.85).toFixed(2));

              const positioningBadge =
                executiveVerdict.verdict === 'AL'
                  ? 'Kademeli Alım & Çekirdek Portföyde Taşı'
                  : executiveVerdict.verdict === 'ALMA'
                  ? 'Nakit Koruma & Portföy Dışı Tut'
                  : 'Mevcut Pozisyonu Koru / Yeni Alım İçin Teyit Bekle';

              const positioningActionText =
                executiveVerdict.verdict === 'AL'
                  ? `${report.ticker} hissesinde güncel ₺${currentPriceNum.toFixed(2)} seviyesi ile ₺${bearFloorPrice.toFixed(2)} stres tabanı arasındaki bölge kademeli biriktirme alanı olarak değerlendirilmektedir. 12 aylık ₺${fairValueNum.toFixed(2)} hedef adil değere yakınsama sürecinde çeyreklik FAVÖK marjı ve işletme nakit dönüşümü korundukça portföy ağırlığı taşınmalıdır.`
                  : executiveVerdict.verdict === 'ALMA'
                  ? `Adli denetim bulguları ve negatif sermaye makası (${evaSpreadNum.toFixed(1)} puan EVA) nedeniyle sermaye koruma disiplini önceliklidir. Yüzeysel çarpan ucuzluğuna dayanarak pozisyon açılmamalı; olası tepki yükselişleri risk azaltımı ve nakde geçiş fırsatı olarak kullanılmalıdır.`
                  : `Hisse senedinde yeni veya agresif alım yapmak yerine mevcut ağırlığın korunması ve izleme listesinde tutulması önerilir. Portföy ağırlığını artırmak için çeyreklik bilançolarda serbest nakit akışı dönüşümünün güçlenmesi veya fiyatın ₺${bearFloorPrice.toFixed(2)} emniyet tabanına yaklaşması beklenmelidir.`;

              return (
                <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#282d37] pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-black text-xs border ${
                        executiveVerdict.verdict === 'AL'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          : executiveVerdict.verdict === 'ALMA'
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                          : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      }`}>
                        {executiveVerdict.verdict}
                      </div>
                      <span className="font-sans text-base sm:text-lg font-bold text-white block leading-snug">
                        8.2 Karar ve Portföy Özeti
                      </span>
                    </div>
                  </div>

                  {/* Üst Denetim & Pozisyonlama Özet Şeridi */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#1d222e] border border-[#323a4b] rounded-xl p-3">
                    <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 flex flex-col justify-between space-y-1">
                      <div className="text-xs font-mono text-slate-400 uppercase">Genel Skor</div>
                      <div className="text-xs sm:text-sm font-mono font-bold text-white">
                        {auditScore}/100 <span className="text-slate-500 font-normal">•</span> {executiveVerdict.verdict === 'AL' ? 'Stres Testi Onaylı' : executiveVerdict.verdict === 'ALMA' ? 'Sermaye Koruma Freni' : 'Koşullu İzleme'}
                      </div>
                    </div>
                    <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 flex flex-col justify-between space-y-1">
                      <div className="text-xs font-mono text-slate-400 uppercase">Portföy Stratejisi</div>
                      <div className={`text-xs sm:text-sm font-sans font-bold leading-snug ${
                        executiveVerdict.verdict === 'AL' ? 'text-emerald-400' : executiveVerdict.verdict === 'ALMA' ? 'text-rose-400' : 'text-amber-300'
                      }`}>
                        {positioningBadge}
                      </div>
                    </div>
                    <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 flex flex-col justify-between space-y-1">
                      <div className="text-xs font-mono text-slate-400 uppercase">Hedef & Stres Tabanı</div>
                      <div className="text-xs sm:text-sm font-mono font-bold text-white">
                        Adil: <span className="text-[#f5c242]">{fairValueNum > 0 ? `₺${fairValueNum.toFixed(2)}` : '—'}</span> <span className="text-slate-500 font-normal">•</span> Taban: <span className="text-rose-300">₺{bearFloorPrice.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 flex flex-col justify-between space-y-1">
                      <div className="text-xs font-mono text-slate-400 uppercase">Sermaye & Nakit</div>
                      <div className="text-xs sm:text-sm font-mono font-bold text-cyan-300 leading-snug break-words">
                        EVA: {evaSpreadNum >= 0 ? `+${evaSpreadNum.toFixed(1)}` : evaSpreadNum.toFixed(1)} Puan <span className="text-slate-500 font-normal">•</span> <span className="text-slate-200">{earningsQuality.statusTitle}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-mono font-bold uppercase tracking-wider text-[#f5c242] flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5" />
                        <span>1. Karar Gerekçesi</span>
                      </div>
                      <p className="text-xs sm:text-[13.5px] text-slate-200 leading-[1.75] font-sans">
                        {executiveVerdict.thesis}
                      </p>
                    </div>

                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5" />
                        <span>2. Portföy Stratejisi</span>
                      </div>
                      <p className="text-xs sm:text-[13.5px] text-slate-200 leading-[1.75] font-sans">
                        {positioningActionText}
                      </p>
                    </div>

                    <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-4 space-y-2">
                      <div className="text-xs font-mono font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>3. Kritik Riskler</span>
                      </div>
                      <p className="text-xs sm:text-[13.5px] text-slate-200 leading-[1.75] font-sans">
                        {executiveVerdict.risks}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 9: GEÇMİŞ (#sec-gecmis)                                            */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Geçmiş Raporlar Hatası">
          <section id="sec-gecmis" className="scroll-mt-28 rounded-2xl border border-[#242a35] bg-[#101319] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">9</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Geçmiş</h2>
              </div>
              {(onAnalyzeTicker || onSelectTicker) && (
                <button
                  type="button"
                  onClick={() => {
                    if (onAnalyzeTicker) onAnalyzeTicker(report.ticker);
                    else if (onSelectTicker) onSelectTicker(report.ticker);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#21262d] hover:bg-[#2b313d] text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 text-xs sm:text-sm font-semibold transition cursor-pointer shadow-sm"
                  title={`${report.ticker} için yeni bilanço dönemini analiz et`}
                >
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>{report.ticker} Yeni Çeyrek Güncelle</span>
                </button>
              )}
            </div>

            <div className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                <span className="font-sans text-base sm:text-lg font-bold text-white">9.1 Analiz Geçmişi</span>
              </div>

              {/* Öneri 5: Model Sinyal ve Alfa Takip Özeti */}
              {(() => {
                const validPriceItems = (tickerHistory || [])
                  .map(h => {
                    const p = parseFinancialNumber(h.price ?? h.extractedData?.current_price);
                    const rawTs = Date.parse(String(h?.extractedData?.saved_at || h?.updatedAt || h?.createdAt || ''));
                    return {
                      hist: h,
                      price: p,
                      ts: Number.isFinite(rawTs) ? rawTs : 0
                    };
                  })
                  .filter((x): x is { hist: SavedReport; price: number; ts: number } =>
                    x.price != null && !isNaN(x.price) && x.price > 0
                  );

                if (validPriceItems.length === 0 || currentPriceNum <= 0) return null;

                const oldestEntry = [...validPriceItems].sort(
                  (a, b) => (a.ts || Number.MAX_SAFE_INTEGER) - (b.ts || Number.MAX_SAFE_INTEGER)
                )[0];
                const oldestPrice = oldestEntry.price;
                const totalRealizedPct = ((currentPriceNum - oldestPrice) / oldestPrice) * 100;
                const oldestDec = String(oldestEntry.hist?.decision || effectiveDecision || 'NÖTR').toUpperCase();
                const isAlConfirmed = oldestDec === 'AL' && totalRealizedPct > 0;
                const isAlmaConfirmed = oldestDec === 'ALMA' && totalRealizedPct <= 0;
                const isConfirmed = isAlConfirmed || isAlmaConfirmed;

                const signalLabel = isAlConfirmed
                  ? 'Sinyal Teyitli (Pozitif Getiri)'
                  : isAlmaConfirmed
                  ? 'Sinyal Teyitli (Kayıp Koruması)'
                  : oldestDec === 'ALMA' && totalRealizedPct > 0
                  ? 'Piyasa Ayrışması (İzleniyor)'
                  : 'Takip Ediliyor';

                return (
                  <div className="bg-[#1d222e] border border-[#323a4b] rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 space-y-1">
                      <div className="text-xs text-slate-400 font-sans">İlk Analiz Fiyatı → Güncel</div>
                      <div className="text-sm font-bold font-mono text-white">
                        ₺{oldestPrice.toFixed(2)} <span className="text-slate-500">→</span>{' '}
                        <span className="text-[#f5c242]">₺{currentPriceNum.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 space-y-1">
                      <div className="text-xs text-slate-400 font-sans">Analizden Bugüne Getiri</div>
                      <div className={`text-sm font-black font-mono ${
                        totalRealizedPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {totalRealizedPct >= 0 ? '+' : ''}%{totalRealizedPct.toFixed(1)}
                      </div>
                    </div>

                    <div className="bg-[#161a23] border border-[#2a3140] rounded-lg p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs text-slate-400 font-sans">Model Sinyal Performansı</div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">İlk Karar: {oldestDec}</div>
                      </div>
                      <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold border shrink-0 ${
                        isConfirmed
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                          : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                      }`}>
                        {signalLabel}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {tickerHistory.length > 0 ? (
                <div className="divide-y divide-[#282d37]">
                  {tickerHistory.map((hist) => {
                    // Adil Değer Güvenli Çözümleyici (₺— hatasını engeller)
                    let rawFv: any = hist.fairValue;
                    if (!rawFv || rawFv === '—' || rawFv === 'null' || rawFv === 'undefined') {
                      rawFv = hist.extractedData?.valuation?.composite_fair_value ??
                              hist.extractedData?.valuation?.fair_value ??
                              hist.extractedData?.valuation?.dcf_fair_value ??
                              (hist as any).valuation?.composite_fair_value ??
                              (hist as any).valuation?.fair_value ??
                              (hist as any).valuationInfo?.fair_value;
                    }
                    if (!rawFv && hist.report) {
                      const match = hist.report.match(/(?:Hesaplanan\s+Adil\s+Değer|Adil\s+Değer)\s*[:=]\s*₺?\s*([\d\.,]+)/i);
                      if (match && match[1]) rawFv = match[1];
                    }
                    const numFv = parseFinancialNumber(rawFv);
                    const fairValDisplay = numFv != null && !isNaN(numFv) && numFv > 0
                      ? `₺${numFv.toFixed(2)}`
                      : '—';

                    const rawHistPrice = hist.price ?? hist.extractedData?.current_price;
                    const numHistPrice = parseFinancialNumber(rawHistPrice);
                    const analysisPriceDisplay = numHistPrice != null && !isNaN(numHistPrice) && numHistPrice > 0
                      ? `₺${numHistPrice.toFixed(2)}`
                      : '—';
                    const realizedReturnPct =
                      numHistPrice != null && !isNaN(numHistPrice) && numHistPrice > 0 && currentPriceNum > 0
                        ? ((currentPriceNum - numHistPrice) / numHistPrice) * 100
                        : null;

                    return (
                      <div
                        key={hist.id}
                        onClick={() => handleSelectReport(hist.id)}
                        onAuxClick={(e) => {
                          if (e.button === 1) {
                            e.preventDefault();
                            if (typeof window !== 'undefined') {
                              window.open(`/analysis/${hist.ticker.toUpperCase()}`, '_blank');
                            }
                          }
                        }}
                        className="py-3.5 flex items-center justify-between hover:bg-[#21262d]/50 px-3 rounded-xl transition cursor-pointer group"
                      >
                        <div>
                          <div className="font-bold text-[15px] text-white flex items-center gap-2">
                            <span className="group-hover:text-emerald-400 transition">{hist.ticker}</span>
                          </div>
                          <div className="text-sm text-slate-400 mt-1 font-mono">
                            {hist.period ? `${hist.period} - ` : ''}Analiz: {formatAnalysisDate(hist.createdAt)}
                          </div>
                        </div>
                        <div className="text-right space-y-0.5">
                          <div className="font-mono text-xs sm:text-[13px] font-semibold text-slate-300 flex items-center justify-end gap-2 flex-wrap">
                            <span>
                              Analiz Fiyatı: <span className="text-white">{analysisPriceDisplay}</span>
                            </span>
                            {realizedReturnPct !== null && (
                              <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${
                                realizedReturnPct >= 0
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                  : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                              }`}>
                                Güncel Fark: {realizedReturnPct >= 0 ? '+' : ''}%{realizedReturnPct.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[15px] font-bold text-[#f5c242]">
                            Adil Değer: {fairValDisplay}
                          </div>
                          <div className={`text-sm font-bold font-mono ${hist.decision === 'AL' ? 'text-emerald-400' : hist.decision === 'ALMA' ? 'text-rose-400' : 'text-amber-400'}`}>
                            Karar: {hist.decision || 'NÖTR'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 font-mono text-sm">
                  {report.ticker} için sistemde kayıtlı geçmiş başka bir rapor bulunmuyor.
                </div>
              )}
            </div>
          </section>
          </ComponentErrorBoundary>

          {/* Rapor Sonu Hızlı Yukarı Dönüş Çubuğu */}
          <div className="flex justify-center pt-2 pb-4">
            <button
              type="button"
              onClick={() => scrollToSection('sec-ozet')}
              className="px-4 py-2 rounded-xl bg-[#181b20] hover:bg-[#21262d] text-slate-300 hover:text-[#f5c242] border border-[#282d37] hover:border-[#f5c242]/40 text-xs font-mono font-semibold transition flex items-center gap-2 cursor-pointer shadow-md"
            >
              <span>↑</span>
              <span>Rapor Başına Dön (Genel Bakış & Özet)</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
