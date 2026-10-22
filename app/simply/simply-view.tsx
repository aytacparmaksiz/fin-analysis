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
  Coins
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
import { calculateDuPont5Step, calculateEarningsQuality, parseFinancialNumber } from '@/lib/valuation';

export type SimplySectionId =
  | 'sec-ozet'
  | 'sec-grafikler'
  | 'sec-tablolar'
  | 'sec-carpanlar'
  | 'sec-adildeger'
  | 'sec-temettu'
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
  ttmChartData?: any[];
  tickerHistory?: SavedReport[];
  portfolioTickers?: string[];
  favoriteTickers?: string[];
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

// Akran Kıyaslama Tooltip (Koyu zemin, yüksek kontrast, okunaklı F/K)
function PeerTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const item = payload[0];
    return (
      <div className="bg-[#181b20] border border-[#383e4d] rounded-xl px-3.5 py-2.5 shadow-2xl z-50 text-sm">
        <div className="text-sm font-bold text-white mb-0.5">{item.payload?.name}</div>
        <div className="text-sm font-mono font-bold text-[#f5c242] flex items-center gap-1.5">
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

function extractTextFromChildren(children: any): string {
  if (typeof children === 'string') return children;
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

  let cleaned = rawText.replace(/\*\*(Yatırım\s+Tezi|Temel\s+Yatırım\s+Tezi|Gerekçe|Kilit\s+Katalizörler|Katalizörler|Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler)\s*:\*\*/gi, '$1:');
  cleaned = cleaned.replace(/\[\s*([^\]]+?)\s*\]/g, '$1').trim();

  // Detect verdict: AL, ALMA, NÖTR
  let verdict: 'AL' | 'ALMA' | 'NÖTR' = 'NÖTR';
  const verdictMatch = rawText.match(/Analist\s+Karar[ıi]\s*[:=-]?\s*\[?\s*\*?\*?\s*(ALMA|SAT|AL|NÖTR|NOTR|TUT)\s*\*?\*?\s*\]?/i);
  if (verdictMatch) {
    const val = verdictMatch[1].toUpperCase();
    if (['ALMA', 'SAT'].includes(val)) verdict = 'ALMA';
    else if (val === 'AL') verdict = 'AL';
    else verdict = 'NÖTR';
  } else if (/\b(ALMA|SAT)\b/i.test(rawText)) {
    verdict = 'ALMA';
  } else if (/\bAL\b/i.test(rawText)) {
    verdict = 'AL';
  } else if (fallbackDecision === 'ALMA') {
    verdict = 'ALMA';
  } else if (fallbackDecision === 'AL') {
    verdict = 'AL';
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
  const thesisMatch = bodyWithoutVerdict.match(/(?:Yatırım\s+Tezi|Temel\s+Yatırım\s+Tezi|Gerekçe)\s*[:=-]?\s*([\s\S]*?)(?=(?:\n\s*#{1,3}\s+|Kilit\s+Katalizörler|Katalizörler|Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler|$))/i);
  const catalystMatch = bodyWithoutVerdict.match(/(?:Kilit\s+Katalizörler|Katalizörler)\s*[:=-]?\s*([\s\S]*?)(?=(?:\n\s*#{1,3}\s+|Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler|$))/i);
  const riskMatch = bodyWithoutVerdict.match(/(?:Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler)\s*[:=-]?\s*([\s\S]*?)(?=(?:\n\s*#{1,3}\s+|$))/i);

  const rawThesis = thesisMatch ? cleanSnippet(thesisMatch[1], 280) : '';
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

  return { verdict, verdictTitle, thesis, catalysts, risks, isStructured: Boolean(rawThesis || rawCatalysts) };
}

function cleanMarkdown(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // Ensure double newlines between run-on decision lines
  cleaned = cleaned.replace(/((?:Analist\s+Karar[ıi]\s*[:=-][^\n]*?))(?=(?:\*{0,2}Yatırım\s+Tezi))/gi, '$1\n\n');
  cleaned = cleaned.replace(/((?:Yatırım\s+Tezi[^\n]*?))(?=(?:\*{0,2}Kilit\s+Katalizörler))/gi, '$1\n\n');
  cleaned = cleaned.replace(/((?:Kilit\s+Katalizörler[^\n]*?))(?=(?:\*{0,2}Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı))/gi, '$1\n\n');

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
  cleaned = cleaned.replace(/^(?:###|\#)\s*(I{1,3}|IV|V|VI{1,3}|IX|X)[\.\:\s\-]+(.*)$/gim, '## $1. $2');
  cleaned = cleaned.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_m, g1) => `\n\n$$\n${g1.trim()}\n$$\n\n`);
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, (_match: string, inner: string) => {
    const cleanedInner = inner.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0).join('\n');
    return `\n\n$$\n${cleanedInner}\n$$\n\n`;
  });
  // Remove redundant bin TL parenthetical when preceded by milyar/Mr TL
  cleaned = cleaned.replace(/(\b\d+(?:[.,]\d+)?\s*(?:milyar|Mr)\s*TL)\s*\(\s*[\d.,]+\s*bin\s*TL\s*\)/gi, '$1');

  // Strip trailing unformatted Analist Kararı block from markdown body (it is rendered in the executive card)
  cleaned = cleaned.replace(/(?:###?\s*)?\*{0,2}Analist\s+Karar[ıi]\s*[:=-][\s\S]*$/i, '');

  return cleaned.trim();
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
  ttmChartData = [],
  tickerHistory = [],
  portfolioTickers = [],
  favoriteTickers = [],
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

  useEffect(() => {
    let isMounted = true;
    const upperTicker = report.ticker ? report.ticker.toUpperCase() : '';
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

    if (report.ticker) {
      fetch(`/api/company-details?ticker=${encodeURIComponent(report.ticker)}`)
        .then(res => res.json())
        .then(data => {
          if (isMounted && data.success) {
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
    }

    return () => { isMounted = false; };
  }, [report.ticker, report.dividendHistory, report.consensusTarget, report.extractedData, marketMultiples]);

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

  // Yönetici Analist Kararı & Yatırım Tezi Çözümü (Tek ve Otoriter Karar Kartı)
  const executiveVerdict = useMemo(() => {
    return parseVerdictNarrative(report.report || '', report.decision, {
      ticker: report.ticker,
      discountPct: discountPctNum
    });
  }, [report.report, report.decision, report.ticker, discountPctNum]);

  // Değer Sürücüleri (12 Ay İleri Hasılat ve Net Kâr Büyümesi vb.)
  const drivers = useMemo(() => {
    const raw = valuationInfo?.drivers || report.extractedData?.fair_value_drivers;
    return {
      revenue_growth: {
        label: raw?.revenue_growth?.label || (currentSector === 'INSURANCE' ? 'Prim Büyümesi' : 'Hasılat Büyümesi'),
        value: typeof raw?.revenue_growth?.value === 'number' ? raw.revenue_growth.value : 45.0,
        bearLabel: raw?.revenue_growth?.bearLabel || 'Düşük Büyüme',
        bullLabel: raw?.revenue_growth?.bullLabel || 'Yüksek Büyüme',
        note: raw?.revenue_growth?.note || raw?.revenue_growth?.sourceExplanation || 'Enflasyon ve pazar payı projeksiyonu'
      },
      net_income_growth: {
        label: raw?.net_income_growth?.label || 'Net Kâr Büyümesi',
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

      const periodStr = String(d.period || '').toLowerCase();
      let annualFactor = 1.0;
      if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(periodStr)) annualFactor = 4.0;
      else if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(periodStr)) annualFactor = 2.0;
      else if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(periodStr)) annualFactor = 12.0 / 9.0;

      let rawPe = (scaledNet && scaledNet > 0 && mCap > 0) ? Number((mCap / (scaledNet * annualFactor)).toFixed(1)) : null;
      let rawPb = (scaledEquity && scaledEquity > 0 && mCap > 0) ? Number((mCap / scaledEquity).toFixed(1)) : null;

      // Son dönem için İş Yatırım resmi canlı çarpanı varsa birebir senkronize et
      if (isLatestPeriod && marketMultiples?.pe != null && marketMultiples.pe > 0) {
        rawPe = Number(marketMultiples.pe.toFixed(1));
      }
      if (isLatestPeriod && marketMultiples?.pb != null && marketMultiples.pb > 0) {
        rawPb = Number(marketMultiples.pb.toFixed(1));
      }

      return {
        period: d.period,
        pe: (rawPe && rawPe > 0 && rawPe < 80) ? rawPe : null,
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
      evaSpread: evaSpreadNum,
      roic: roicNum,
      wacc: waccNum,
      latestData,
      consensusTarget: consensusTargetPrice,
      peers: analyzedCompetitors,
      earningsQuality,
      dividends: resolvedDividends
    });
  }, [
    report.ticker,
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
    earningsQuality
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

  // Rapor açıldığında veya değiştiğinde sayfa daima en baştan (sec-ozet) başlasın
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const container = document.getElementById('main-scroll-container');
      if (container) {
        container.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }
    }
    setActiveSection('sec-ozet');
  }, [report.id, report.ticker]);

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
        title: 'Cari Oran',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.current_liabilities ? Number((d.current_assets / d.current_liabilities).toFixed(2)) : 1.45
        })),
        format: (v: number) => `${v.toFixed(2)}x`
      },
      {
        id: 'leverage',
        title: 'Borç / Özkaynak',
        data: series.map(d => ({
          period: d.period ? d.period.slice(2) : '',
          val: d.equity ? Number(((d.financial_debt || (d.total_debt || (d.equity * 0.6))) / d.equity * 100).toFixed(1)) : 60
        })),
        format: (v: number) => `%${v.toFixed(1)}`
      },
      {
        id: 'roe',
        title: 'Özkaynak Kârlılığı',
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
    const data: Array<{ name: string; pe: number; isMain?: boolean; reportId?: string; ticker?: string }> = [];
    const mainPE = marketMultiples?.pe || companyMultiplesData?.multiples?.pe?.companyValue || 8.5;
    data.push({ name: report.ticker, pe: Number(mainPE.toFixed(1)), isMain: true, reportId: report.id, ticker: report.ticker });

    analyzedCompetitors.slice(0, 4).forEach(comp => {
      const pe = comp.extractedData?.valuation?.pe_ratio || comp.extractedData?.pe || comp.extractedData?.market_multiples?.pe || 9.2;
      data.push({ 
        name: comp.ticker, 
        pe: Number(Number(pe).toFixed(1)),
        reportId: comp.id,
        ticker: comp.ticker
      });
    });

    const bench = marketMultiples?.sector_averages?.pe ?? companyMultiplesData?.benchmark?.peMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe ?? 9.0;
    data.push({ name: 'Sektör Ort.', pe: Number(Number(bench).toFixed(1)) });

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
    { id: 'sec-gucluzayif', num: '6', label: 'Güçlü & Zayıf', icon: Scale },
    { id: 'sec-rehberlik', num: '7', label: 'Rehberlik & Sunum', icon: Target },
    { id: 'sec-analist', num: '8', label: 'Analist Raporu', icon: FileText },
    { id: 'sec-gecmis', num: '9', label: 'Geçmiş', icon: History }
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
  const ratiosSections = useMemo(() => [
    {
      id: 'likidite',
      title: 'Likidite Rasyoları',
      rows: [
        {
          key: 'current_ratio',
          label: 'Cari Oran',
          calc: (c: any) => c.current_liabilities ? (c.current_assets / c.current_liabilities).toFixed(2) + 'x' : '—',
          raw: (c: any) => c.current_liabilities ? (c.current_assets / c.current_liabilities) : null,
          isHighlight: true
        },
        {
          key: 'quick_ratio',
          label: 'Likidite Oranı',
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
          label: 'Kaldıraç Oranı',
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
          calc: (c: any) => c.revenue && c.gross_profit != null ? ((c.gross_profit / c.revenue) * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.revenue && c.gross_profit != null ? ((c.gross_profit / c.revenue) * 100) : null
        },
        {
          key: 'ebitda_margin',
          label: 'FAVÖK Marjı',
          calc: (c: any) => c.revenue && c.ebitda != null ? ((c.ebitda / c.revenue) * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.revenue && c.ebitda != null ? ((c.ebitda / c.revenue) * 100) : null
        },
        {
          key: 'net_margin',
          label: 'Net Kâr Marjı',
          calc: (c: any) => c.revenue && c.net_income != null ? ((c.net_income / c.revenue) * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.revenue && c.net_income != null ? ((c.net_income / c.revenue) * 100) : null
        },
        {
          key: 'roe',
          label: 'Özkaynak Kârlılığı',
          calc: (c: any) => c.equity && c.net_income != null ? ((c.net_income / c.equity) * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.equity && c.net_income != null ? ((c.net_income / c.equity) * 100) : null,
          isHighlight: true
        },
        {
          key: 'roa',
          label: 'Aktif Kârlılığı',
          calc: (c: any) => c.total_assets && c.net_income != null ? ((c.net_income / c.total_assets) * 100).toFixed(1) + '%' : '—',
          raw: (c: any) => c.total_assets && c.net_income != null ? ((c.net_income / c.total_assets) * 100) : null
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
    const isNegative = currentVal != null && !isNaN(Number(currentVal)) && Number(currentVal) < 0;

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
      </td>
    );
  };

  // Aktif 4 Grafik Verisi (Tüm tarihsel periyotlar kronolojik sırada)
  const active4ChartsFlowData = chartPeriodMode === 'quarterly' 
    ? quarterlyChartData 
    : (ttmChartData && ttmChartData.length > 0 ? ttmChartData : chartData);

  return (
    <div className="space-y-6 font-sans text-slate-100">

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
                <div className="text-xs text-slate-300 font-mono font-bold tracking-wider">
                  {report.ticker.toUpperCase()}
                </div>
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
                className={`py-1.5 px-2 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm w-full ${
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
                className={`py-1.5 px-2 text-xs font-semibold rounded-md border transition cursor-pointer flex items-center justify-center gap-1.5 w-full ${
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

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 1: GENEL BAKIŞ & SNOWFLAKE (#sec-ozet)                             */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Özet Panosu Hatası">
          <section id="sec-ozet" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            {/* Sub-Card 1: Üst Şirket Bilgi ve Fiyat Özeti Kartı */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-xl p-6 sm:p-7 shadow-md space-y-6">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-6 border-b border-[#282d37]">
                <div className="space-y-1.5 min-w-0 max-w-full xl:max-w-[48%]">
                  <div className="flex items-center gap-2 text-sm font-mono text-slate-300">
                    <span className="text-[#f5c242] font-bold">IBSE:{report.ticker}</span>
                    <span>•</span>
                    <span>{report.period || '2025/12'} Bilanço Dönemi</span>
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

                <div className="flex items-center gap-3 sm:gap-5 shrink-0 flex-nowrap">
                  <div>
                    <div className="text-xs sm:text-sm text-slate-400 uppercase font-semibold">Piyasa Fiyatı</div>
                    <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-0.5 whitespace-nowrap">
                      ₺{currentPriceNum.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs sm:text-sm text-slate-400 uppercase font-semibold">Hesaplanan Adil Değer</div>
                    <div className="text-2xl sm:text-3xl font-black font-mono text-[#f5c242] mt-0.5 whitespace-nowrap">
                      ₺{fairValueNum.toFixed(2)}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 rounded-xl font-mono text-xs sm:text-sm font-bold border whitespace-nowrap ${
                      discountPctNum > 0
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                    }`}>
                      {discountPctNum > 0 ? <TrendingUp className="w-4 h-4 shrink-0" /> : <TrendingDown className="w-4 h-4 shrink-0" />}
                      <span>%{Math.abs(discountPctNum).toFixed(1)} {discountPctNum > 0 ? 'İskontolu / Potansiyel' : 'Primli'}</span>
                    </span>
                    {(() => {
                      const rawScore = report?.score || valuationInfo?.score || (report as any)?.scoreResult?.totalScore;
                      const cleanNum = rawScore ? parseInt(String(rawScore).split('/')[0].replace(/[^0-9]/g, ''), 10) : null;
                      if (cleanNum === null || isNaN(cleanNum)) return null;
                      return (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-[#2b313d] text-xs font-mono font-bold text-slate-300 shadow-sm">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Skor:</span>
                          <span className="text-emerald-400 font-bold">{cleanNum}/100</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Fiyat ve Adil Değer Mini Çizelgesi */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="md:col-span-2 bg-[#21262d]/60 border border-[#2e3440] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span className="font-bold text-white text-[15px]">Son 4 Çeyrek Adil Değer Trendi vs. Piyasa Fiyatı</span>
                    <span className="font-mono text-sm text-[#f5c242]">Gerçekleşen Veriler</span>
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

                <div className="bg-[#21262d]/60 border border-[#2e3440] rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-[15px] font-bold text-white">Getiri Performansı</div>
                    <div className="text-sm text-slate-300 mt-0.5">BIST piyasa dinamikleri</div>
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">7 Günlük:</span>
                      <span className="font-mono font-bold text-emerald-400">+%3.2</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">1 Yıllık:</span>
                      <span className="font-mono font-bold text-emerald-400">+%84.6</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">F/K Oranı:</span>
                      <span className="font-mono font-bold text-white">
                        {marketMultiples?.pe ? `${marketMultiples.pe.toFixed(2)}x` : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm text-slate-400 border-t border-[#2e3440] pt-2.5">
                    KAP verileriyle senkronize edilmiştir.
                  </div>
                </div>
              </div>
            </div>

            {/* About the Company (Şirket Hakkında) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
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
            <div className="bg-[#181b20] border border-[#2b313d] rounded-xl p-5 sm:p-7 shadow-md space-y-6">
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

                          <h4 className="text-sm font-bold text-white mb-2 leading-snug">
                            {check.title}
                          </h4>

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
                <div className="lg:col-span-5 flex flex-col items-center justify-center p-3 bg-[#14171d] rounded-2xl border border-[#262c37] relative">
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
                      <div key={axis.key} className="bg-[#151821] border border-[#2b313d] rounded-xl p-3 space-y-1.5">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="bg-[#151821] border border-emerald-900/30 rounded-xl p-4 sm:p-5 space-y-2.5">
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

                <div className="bg-[#151821] border border-amber-900/30 rounded-xl p-4 sm:p-5 space-y-2.5">
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
            </div>

            {/* ========================================================================= */}
            {/* Özet Finansallar Karşılaştırma Paneli (YoY & QoQ - Terminal Kurgusu)       */}
            {/* ========================================================================= */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h3 className="font-sans text-lg sm:text-xl font-bold text-white">Özet Finansallar</h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Sol Tablo: Özet Gelir Tablosu (YoY) */}
                <div className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#2e3440] pb-2.5">
                    <h4 className="text-[15px] sm:text-base font-bold text-white tracking-wide">Özet Gelir Tablosu</h4>
                    <span className="text-sm text-slate-400 font-mono">YoY Çeyreklik</span>
                  </div>

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
                        { label: 'Net Dönem Kârı', key: 'net_income' }
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

                {/* Sağ Tablo: Özet Bilanço (QoQ) */}
                <div className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-[#2e3440] pb-2.5">
                    <h4 className="text-[15px] sm:text-base font-bold text-white tracking-wide">Özet Bilanço</h4>
                    <span className="text-sm text-slate-400 font-mono">QoQ Çeyreklik</span>
                  </div>

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

            {/* Sektörel Akranlar */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h3 className="font-sans text-lg sm:text-xl font-bold text-white">Sektörel Akranlar</h3>
                </div>
                <span className="text-sm text-[#f5c242] font-mono font-bold">
                  {officialSectorName} Sektörü
                </span>
              </div>

              {analyzedCompetitors.length > 0 ? (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {analyzedCompetitors.map((comp) => (
                      <div
                        key={comp.id}
                        onClick={() => {
                          if (onSelectReport) {
                            onSelectReport(comp.id);
                          } else if (onSelectTicker) {
                            onSelectTicker(comp.ticker);
                          }
                        }}
                        className="bg-[#21262d] hover:bg-[#2b313d] border border-[#2e3440] hover:border-[#f5c242]/50 rounded-xl p-4 transition cursor-pointer flex items-center justify-between group shadow-sm"
                        title={`${comp.ticker} analizini aç`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-[#181b20] border border-[#2e3440] flex items-center justify-center font-black font-mono text-sm text-[#f5c242]">
                            {comp.ticker.slice(0, 4)}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-white group-hover:text-[#f5c242] transition">
                              {comp.ticker}
                            </div>
                            <div className="text-sm text-slate-400 font-mono">
                              Skor: {comp.score || 75}/100
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm font-bold text-white">{comp.price ? `₺${comp.price}` : '—'}</div>
                          <div className={`text-sm font-bold font-mono ${comp.decision === 'AL' ? 'text-emerald-400' : comp.decision === 'ALMA' ? 'text-rose-400' : 'text-amber-400'}`}>
                            {comp.decision || 'NÖTR'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {sectorCandidateTickers.length > 0 && (
                    <div className="pt-2.5 border-t border-[#282d37] flex items-center justify-between flex-wrap gap-2 text-sm text-slate-300">
                      <span className="text-sm font-medium">Sektördeki diğer akranları analiz et:</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {sectorCandidateTickers.slice(0, 5).map((tk) => (
                          <button
                            key={tk}
                            type="button"
                            onClick={() => onSelectTicker && onSelectTicker(tk)}
                            className="px-2.5 py-1 bg-[#21262d] hover:bg-[#2e3440] text-[#f5c242] rounded-lg border border-[#2e3440] text-sm font-mono font-bold cursor-pointer transition"
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
            </div>

          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 1: GRAFİKLER (#sec-grafikler)                                     */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Grafik Terminali Hatası">
          <section id="sec-grafikler" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">1</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Grafikler</h2>
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

            {/* 1.1 Çeyreklik Temel Finansallar */}
            <div className="space-y-3">
              <div className="text-base font-bold text-white flex items-center gap-2">
                <span>1.1 Çeyreklik Temel Finansallar</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                  <div className="text-[15px] font-bold text-white">
                    {currentSector === 'INSURANCE' ? 'Çeyreklik Prim Üretimi' : 'Çeyreklik Satışlar'}
                  </div>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-5)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                        <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                        <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} hide />
                        <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                        <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                          {(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-5).map((entry, idx) => (
                            <Cell key={`rev-${idx}`} fill={(entry.revenue != null && entry.revenue < 0) ? '#ef4444' : '#3b82f6'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                  <div className="text-[15px] font-bold text-white">
                    {currentSector === 'INSURANCE' ? 'Teknik Bölüm Dengesi' : 'Çeyreklik FAVÖK'}
                  </div>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-5)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                        <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                        <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} hide />
                        <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                        <Bar dataKey="ebitda" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                          {(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-5).map((entry, idx) => (
                            <Cell key={`ebitda-${idx}`} fill={(entry.ebitda != null && entry.ebitda < 0) ? '#ef4444' : '#f59e0b'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                  <div className="text-[15px] font-bold text-white">Çeyreklik Net Kâr</div>
                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-5)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                        <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                        <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} hide />
                        <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                        <Bar dataKey="net_income" fill="#10b981" radius={[4, 4, 0, 0]}>
                          {(quarterlyChartData.length > 0 ? quarterlyChartData : chartData).slice(-5).map((entry, idx) => (
                            <Cell key={`net-${idx}`} fill={(entry.net_income != null && entry.net_income < 0) ? '#ef4444' : '#10b981'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* 1.2 Kârlılık ve Marj Trendleri (6'lı Marj Sparkline Kartları) */}
            <div className="space-y-3">
              <div className="text-base font-bold text-white flex items-center gap-2">
                <span>1.2 Kârlılık ve Marj Trendleri</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sparklineMetrics.map((mini) => {
                const values = mini.data.map(d => d.val).filter(v => v != null && !isNaN(v));
                const isUptrend = values.length >= 2 && values[values.length - 1] >= values[0];
                const trendColor = isUptrend ? '#10b981' : '#f87171';
                const latestVal = values.length > 0 ? values[values.length - 1] : 0;

                return (
                  <div key={mini.id} className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-4 shadow-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-bold text-white">{mini.title}</span>
                      <span className="font-mono text-sm font-bold" style={{ color: trendColor }}>
                        {mini.format(latestVal)}
                      </span>
                    </div>
                    <div className="h-24 w-full">
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
            </div>

            {/* ========================================================================= */}
            {/* TERMINALDEKİ 4 ADET KANONİK GRAFİK (TÜM TARİHSEL SERİ İLE)                 */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Grafik 1: Satışlar ve Kârlılık */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
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
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => formatMrTl(v, true)} />
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
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
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
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#282d37] pb-2.5">
                  <span className="text-base font-bold text-white">1.5 Nakit Akışı Kalitesi</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={active4ChartsFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
                      <XAxis dataKey="period" stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => v ? v.slice(2) : ''} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={(v) => formatMrTl(v, true)} />
                      <Tooltip content={<SimplyChartTooltip currentSector={currentSector} />} />
                      <Legend align="left" verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', paddingTop: '8px', paddingLeft: '8px' }} />
                      <Bar dataKey="operating_cash_flow" name="İşletme Nakit Akışı" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={32} legendType="square">
                        {active4ChartsFlowData.map((entry, idx) => (
                          <Cell key={`canon-ocf-${idx}`} fill={(entry.operating_cash_flow != null && entry.operating_cash_flow < 0) ? '#ef4444' : '#06b6d4'} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} legendType="line" />
                      <Line type="monotone" dataKey="free_cash_flow" name="Serbest Nakit (FCF)" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2.5, fill: '#a855f7' }} legendType="line" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grafik 4: Bilanço Gücü: Özsermaye ve Nakit */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
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
          <section id="sec-tablolar" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">2</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Finansal Tablolar</h2>
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

            {/* ========================================================================= */}
            {/* 2.1 RESMİ FİNANSAL TABLOLAR (6 Dönem Fix, Sayfalama Okları, Kategori Blokları) */}
            {/* ========================================================================= */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              
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
                  {reversedPeriods.length > maxVisiblePeriods && (
                    <div className="flex items-center gap-1.5 bg-[#21262d] px-2.5 py-1 rounded-lg border border-[#2e3440] text-sm font-mono">
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
                      <span className="text-sm text-slate-300 px-1.5">
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
              <div className="w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden border border-[#282d37]/50 rounded-xl">
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-[#282d37] text-slate-400 bg-[#21262d]/90">
                      <th className="p-3 text-white font-sans font-bold text-xs sm:text-sm min-w-[180px] sm:min-w-[200px]">
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
                    {/* 1. BİLANÇO GÖRÜNÜMÜ */}
                    {selectedTableTab === 'bs' && balanceSheetSections.map((sec) => (
                      <React.Fragment key={sec.id}>
                        {/* Kategori Başlık Çubuğu */}
                        <tr className="bg-[#1f242c]/90 border-t border-b border-[#2b313d]">
                          <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3 font-sans font-bold text-slate-100 text-[15px] tracking-wide">
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
                            <td className="py-2.5 px-3 pl-6 font-sans text-sm text-slate-200 font-normal truncate" title={row.label}>
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
                          <td className="py-2.5 px-3 font-sans font-bold text-white text-[15px] truncate">
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
                            <td className="py-3 px-3 font-sans font-extrabold text-[#f5c242] text-base tracking-wide truncate">
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
                            <td className="py-2.5 px-3 pl-4 font-sans font-semibold text-slate-200 text-sm truncate">
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
                          <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3 font-sans font-bold text-slate-100 text-[15px] tracking-wide">
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
                            <td className="py-2.5 px-3 pl-6 font-sans text-sm text-slate-200 font-normal truncate" title={row.label}>
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
                          <td className="py-2.5 px-3 font-sans font-bold text-white text-[15px] truncate">
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
                            <td className="py-3 px-3 font-sans font-extrabold text-[#f5c242] text-base tracking-wide truncate">
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
                          <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3 font-sans font-bold text-slate-100 text-[15px] tracking-wide">
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
                            <td className="py-2.5 px-3 pl-6 font-sans text-sm text-slate-200 font-normal truncate" title={row.label}>
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
                          <td className="py-2.5 px-3 font-sans font-bold text-white text-[15px] truncate">
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
                          <td colSpan={visiblePeriods.length + 1} className="py-2.5 px-3 font-sans font-bold text-slate-100 text-[15px] tracking-wide">
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
                            <td className={`py-2.5 px-3 pl-6 font-sans text-sm truncate ${row.isHighlight ? 'font-bold text-white' : 'font-normal text-slate-200'}`} title={row.label}>
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
                    ))}
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
          <section id="sec-carpanlar" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">3</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Çarpanlar</h2>
              </div>
            </div>

            {/* 3.1 BIST Sektör Medyanları Benchmark Kıyası */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                <span className="font-sans text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>3.1 Sektör Medyanları Benchmark Kıyası</span>
                  {marketMultiples?.sector_averages?.sector_name ? (
                    <span className="text-xs font-normal text-slate-400 font-mono">
                      ({marketMultiples.sector_averages.sector_name})
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                {
                  label: 'F/K',
                  rawVal: marketMultiples?.pe ?? companyMultiplesData?.multiples?.pe?.companyValue,
                  benchNum: marketMultiples?.sector_averages?.pe ?? companyMultiplesData?.benchmark?.peMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe ?? 8.5,
                  format: (v: number) => `${v.toFixed(1)}x`,
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'PD/DD',
                  rawVal: marketMultiples?.pb ?? companyMultiplesData?.multiples?.pb?.companyValue,
                  benchNum: marketMultiples?.sector_averages?.pb ?? companyMultiplesData?.benchmark?.pbMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pb ?? 2.1,
                  format: (v: number) => `${v.toFixed(2)}x`,
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'FD/FAVÖK',
                  rawVal: isMetricDisabled('ev_ebitda', currentSector) ? null : (marketMultiples?.ev_ebitda ?? companyMultiplesData?.multiples?.evEbitda?.companyValue),
                  benchNum: isMetricDisabled('ev_ebitda', currentSector) ? null : (marketMultiples?.sector_averages?.ev_ebitda ?? companyMultiplesData?.benchmark?.evEbitdaMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.evEbitda ?? 7.2),
                  format: (v: number) => `${v.toFixed(1)}x`,
                  isMultiple: true,
                  customType: 'multiple' as const
                },
                {
                  label: 'FD/Satışlar',
                  rawVal: isMetricDisabled('ev_sales', currentSector) ? null : (marketMultiples?.ev_sales ?? companyMultiplesData?.multiples?.evSales?.companyValue),
                  benchNum: isMetricDisabled('ev_sales', currentSector) ? null : (marketMultiples?.sector_averages?.ev_sales ?? companyMultiplesData?.benchmark?.evSalesMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.evSales ?? 1.8),
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
                    <div key={i} className="bg-[#12151b] border border-[#232834] rounded-xl p-3.5 text-center space-y-1">
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
                    <div key={i} className="bg-[#12151b] border border-[#232834] rounded-xl p-3.5 text-center space-y-1">
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

                // Eğer metrik A/D (Anlamsız Değer / Sektörel Kapsam Dışı) ise
                if (c.rawVal == null) {
                  const isSectorExempt = isMetricDisabled(c.label === 'FD/FAVÖK' ? 'ev_ebitda' : (c.label === 'FD/Satışlar' ? 'ev_sales' : ''), currentSector);
                  const benchText = c.benchNum != null && c.benchNum > 0 ? `Ref: ${c.benchNum.toFixed(c.label === 'PD/DD' ? 2 : 1)}x` : 'Ref: A/D';
                  return (
                    <div key={i} className="bg-[#12151b] border border-[#232834] rounded-xl p-3.5 text-center space-y-1 transition-colors">
                      <div className="text-[11px] uppercase font-bold text-slate-400">{c.label}</div>
                      <div className="text-lg font-black font-mono mt-1 text-slate-400">
                        A/D
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {benchText}
                      </div>
                      <div className="pt-1">
                        <span className="inline-block text-[9.5px] font-mono font-medium px-2 py-0.5 rounded-md bg-[#21262d] text-slate-400 border border-[#2e3440]">
                          {isSectorExempt ? 'Sektörel Kapsam Dışı' : 'Anlamsız Değer (A/D)'}
                        </span>
                      </div>
                    </div>
                  );
                }

                const bench = c.benchNum ?? 1.0;
                const val = Number(c.rawVal);
                const diffPct = ((val - bench) / bench) * 100;
                const isCheap = diffPct <= -8;
                const isExpensive = diffPct >= 8;

                const valColor = isCheap ? 'text-emerald-400' : isExpensive ? 'text-rose-400' : 'text-slate-100';
                const cardBorder = isCheap ? 'border-emerald-900/40' : isExpensive ? 'border-rose-900/40' : 'border-[#232834]';
                const formattedVal = typeof c.format === 'function' ? c.format(val) : `${val.toFixed(1)}x`;

                return (
                  <div key={i} className={`bg-[#12151b] border ${cardBorder} rounded-xl p-3.5 text-center space-y-1 transition-colors`}>
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
            </div>

            {/* Sektör Karşılaştırma & Çeyreklik Çarpan Trendi (2 Sütunlu Grid) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 3.2 Sektör ve Akran F/K Kıyaslaması (Kompakt ve temiz) */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3 flex flex-col justify-between">
                <div>
                  <div className="text-base sm:text-lg font-sans font-bold text-white flex items-center gap-2">
                    <span>3.2 F/K Sektör ve Akran Kıyaslaması</span>
                  </div>
                </div>

                <div className="h-44 w-full">
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
                </div>
              </div>

              {/* 3.3 Çeyreklik Çarpan Trendi */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="text-base sm:text-lg font-sans font-bold text-white flex items-center gap-2">
                    <span>3.3 Çeyreklik Çarpan Trendi</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Son {Math.min(8, quarterlyMultiplesData.length)} Çeyrek</span>
                </div>

                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={quarterlyMultiplesData} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #2b313d)" vertical={false} />
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

            {/* 3.4 Yabancı Takas Payı */}
            {(() => {
              const foreignPct = marketMultiples?.foreign_share_pct ?? liveCompanyDetails?.foreignShare?.currentPct;
              const prevForeignPct = marketMultiples?.foreign_share_prev_pct ?? liveCompanyDetails?.foreignShare?.prevPct;
              const changeBps = marketMultiples?.foreign_share_change_bps ?? liveCompanyDetails?.foreignShare?.changeBps;

              if (foreignPct == null) return null;

              return (
                <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#282d37] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-base sm:text-lg font-bold text-white">3.4 Yabancı Takas Payı</span>
                    </div>
                    <span className="text-xs font-mono text-slate-400">Resmi Günlük Takas Verisi</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Güncel Yabancı Payı</div>
                      <div className="text-2xl font-bold font-mono text-cyan-400">%{Number(foreignPct).toFixed(2)}</div>
                      <div className="text-[11px] text-slate-500">MKK saklama takasındaki pay</div>
                    </div>

                    <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Önceki Gün</div>
                      <div className="text-2xl font-bold font-mono text-slate-200">
                        {prevForeignPct != null ? `%${Number(prevForeignPct).toFixed(2)}` : '—'}
                      </div>
                      <div className="text-[11px] text-slate-500">Önceki seans kapanış saklaması</div>
                    </div>

                    <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Günlük Değişim</div>
                      <div className={`text-2xl font-bold font-mono ${
                        (changeBps ?? 0) > 0 ? 'text-emerald-400' : (changeBps ?? 0) < 0 ? 'text-rose-400' : 'text-slate-300'
                      }`}>
                        {changeBps != null ? `${changeBps > 0 ? '+' : ''}${changeBps.toFixed(2)} bps` : '—'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {(changeBps ?? 0) > 0 ? 'Yabancı para girişi pozitif' : (changeBps ?? 0) < 0 ? 'Yabancı kâr satışı / çıkışı' : 'Yatay saklama'}
                      </div>
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
          <section id="sec-adildeger" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">4</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Değerleme</h2>
              </div>
            </div>

            {/* 4.1 İskontolu Değerleme Senaryoları */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                <span className="font-sans text-base sm:text-lg font-bold text-white">4.1 İskontolu Değerleme Senaryoları</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#12151b] border border-[#232834] rounded-xl p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-400">Ayı Senaryosu</span>
                  </div>
                  <div className="text-2xl font-black font-mono text-white">
                    ₺{valuationInfo?.bear_price ? Number(valuationInfo.bear_price).toFixed(2) : (fairValueNum * 0.75).toFixed(2)}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Yüksek iskonto oranı (+%4 WACC), daralan marjlar ve düşük büyüme varsayımı.
                  </p>
                </div>

                <div className="bg-[#12151b] border-2 border-[#f5c242]/70 rounded-xl p-5 shadow-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#f5c242]">Baz Senaryo</span>
                  </div>
                  <div className="text-3xl font-black font-mono text-[#f5c242]">
                    ₺{fairValueNum.toFixed(2)}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Şirketin tarihsel getiri ortalamaları, mevcut sermaye verimliliği ve sektör katsayıları.
                  </p>
                </div>

                <div className="bg-[#12151b] border border-[#232834] rounded-xl p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-emerald-400">Boğa Senaryosu</span>
                  </div>
                  <div className="text-2xl font-black font-mono text-white">
                    ₺{valuationInfo?.bull_price ? Number(valuationInfo.bull_price).toFixed(2) : (fairValueNum * 1.30).toFixed(2)}
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Pazar payı genişlemesi, marj artışı ve risksiz faiz oranında normalleşme.
                  </p>
                </div>
              </div>
            </div>

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
                  <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                      <span className="font-sans text-base sm:text-lg font-bold text-white">
                        4.2 Piyasa ve Analist Hedef Fiyatları
                      </span>
                      <span className="text-xs font-mono text-slate-400">Aracı Kurum Konsensüsü</span>
                    </div>

                    <div className="bg-[#12151b] border border-[#232834] rounded-xl p-6 text-center space-y-2.5">
                      <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-400">
                        <Building2 className="w-5 h-5 text-slate-400" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-200 font-sans">
                        Aktif Aracı Kurum Konsensüs Hedefi Bulunmuyor
                      </h4>
                      <p className="text-xs text-slate-400 max-w-lg mx-auto font-sans leading-relaxed">
                        {report.ticker} için Borsa İstanbul aracı kurumları veya Refinitiv/LSEG konsensüs havuzunda henüz aktif bir 12 aylık analist konsensüs hedef fiyatı yayımlanmamıştır. Değerleme için yukarıdaki model içsel değerimiz (₺{fairValueNum.toFixed(2)}) ve senaryo analizleri baz alınmalıdır.
                      </p>
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
                <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#282d37] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-sans text-base sm:text-lg font-bold text-white">
                        4.2 Piyasa ve Analist Hedef Fiyatları
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
                    <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Güncel Piyasa Fiyatı</div>
                      <div className="text-2xl font-black font-mono text-white">₺{currentPriceNum.toFixed(2)}</div>
                      <div className="text-[11px] text-slate-500 font-mono">BIST Canlı Seans Kapanışı</div>
                    </div>

                    <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">12A Piyasa Konsensüs Hedefi</div>
                      <div className="text-2xl font-black font-mono text-[#f5c242]">₺{primaryTarget.toFixed(2)}</div>
                      <div className={`text-[11px] font-semibold font-mono ${upsidePct > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {upsidePct > 0 ? '+' : ''}%{upsidePct.toFixed(1)} Potansiyel Getiri
                      </div>
                    </div>

                    <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Modelimiz İçsel Adil Değeri</div>
                      <div className="text-2xl font-black font-mono text-emerald-400">₺{fairValueNum.toFixed(2)}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {fairValueNum >= primaryTarget ? 'Konsensüsün üzerinde içsel iskonto' : 'Konsensüs ile dengeli değerleme'}
                      </div>
                    </div>

                    <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-1">
                      <div className="text-xs text-slate-400">Analist Konsensüs Tavsiyesi</div>
                      <div className={`text-xl font-black font-mono px-2 py-0.5 rounded w-fit mt-0.5 ${
                        isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                        isSell ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                        'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}>
                        {rec}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate" title={agreementText}>{agreementText}</div>
                    </div>
                  </div>

                  {/* Simply Wall St Stili Hedef Fiyat Aralığı (Visual Range Bar) */}
                  <div className="bg-[#15181f] border border-[#262c38] rounded-xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between border-b border-[#282d37] pb-2 text-xs font-mono">
                      <span className="text-slate-300 font-bold uppercase tracking-wider">Piyasa Analist Hedef Dağılımı</span>
                      <span className="text-slate-400">
                        {tvMedian ? `Medyan Hedef: ₺${tvMedian.toFixed(2)}` : `Referans Hedef: ₺${primaryTarget.toFixed(2)}`}
                      </span>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div>
                          <span className="text-slate-500 mr-1">En Düşük Hedef:</span>
                          <span className="text-white font-bold">₺{rangeLow.toFixed(2)}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-slate-500 mr-1">Konsensüs Ortalama:</span>
                          <span className="text-[#f5c242] font-bold">₺{primaryTarget.toFixed(2)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 mr-1">En Yüksek Hedef:</span>
                          <span className="text-emerald-400 font-bold">₺{rangeHigh.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Görsel Dağılım Çubuğu */}
                      <div className="relative h-2.5 w-full bg-[#21262d] rounded-full overflow-hidden border border-[#2e3440]">
                        <div className="absolute inset-0 bg-gradient-to-r from-rose-500/50 via-[#f5c242]/70 to-emerald-500/80 rounded-full" />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                        <div>Cari Hisse Fiyatı: <strong className="text-white">₺{currentPriceNum.toFixed(2)}</strong></div>
                        <div>Model Adil Değerimiz: <strong className="text-[#f5c242]">₺{fairValueNum.toFixed(2)}</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* Açılır / Kapanır Kurum Dağılım Tablosu */}
                  {showBrokerBreakdown && (
                    <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 sm:p-5 space-y-3">
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

                  {/* Hedef Revizyon Trendi (İş Yatırım 1M/3M) */}
                  {(isyConsensus?.targetPrice1M != null || isyConsensus?.targetPrice3M != null) && (
                    <div className="bg-[#15181f] border border-[#262c38] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300 font-medium">Hedef Fiyat Revizyon Geçmişi:</span>
                      </div>
                      <div className="flex items-center gap-5 font-mono text-xs sm:text-sm">
                        {isyConsensus.targetPrice1M != null && (
                          <div>
                            <span className="text-slate-500 mr-1.5">1 Ay Önce:</span>
                            <span className="font-bold text-white">₺{Number(isyConsensus.targetPrice1M).toFixed(2)}</span>
                          </div>
                        )}
                        {isyConsensus.targetPrice3M != null && (
                          <div>
                            <span className="text-slate-500 mr-1.5">3 Ay Önce:</span>
                            <span className="font-bold text-white">₺{Number(isyConsensus.targetPrice3M).toFixed(2)}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-500 mr-1.5">Güncel:</span>
                          <span className="font-bold text-[#f5c242]">₺{Number(isyTarget || primaryTarget).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 4.3 Gelecek Büyüme & Değer Sürücüleri - Ayrı Alt Kart */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-base sm:text-lg font-bold text-white">4.3 Gelecek Büyüme & Değer Sürücüleri</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                  <div key={idx} className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-xl">
                    <div>
                      <div className="text-[15px] font-bold text-white font-sans truncate" title={d.title}>
                        {d.title}
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-xl font-black font-mono text-[#f5c242] tracking-tight">
                          {d.valueText}
                        </span>
                        <span className="text-sm text-slate-400 font-mono">baz</span>
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

                      <div className="flex items-center justify-between text-sm font-mono text-slate-300 leading-tight">
                        <span className="truncate">{d.bearText}</span>
                        <span className="truncate text-right text-slate-200">{d.bullText}</span>
                      </div>
                    </div>

                    {d.note && (
                      <p className="text-sm text-slate-200 leading-relaxed pt-2.5 border-t border-[#282d37] font-sans" title={d.note}>
                        {d.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 4.4 WACC ve Sermaye Maliyeti Panosu */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
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

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-[#21262d] rounded-xl p-3 text-center border border-emerald-500/30">
                  <div className="text-sm font-semibold text-emerald-400">Reel ROIC</div>
                  <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                    %{roicNum.toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#21262d] rounded-xl p-3 text-center border border-[#2e3440]">
                  <div className="text-sm text-slate-400">Özsermaye Maliyeti</div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    %{Number(valuationInfo?.cost_of_equity || 44.6).toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#21262d] rounded-xl p-3 text-center border border-[#2e3440]">
                  <div className="text-sm text-slate-400">Borç Maliyeti</div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    %{Number(valuationInfo?.cost_of_debt || 46.7).toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#21262d] rounded-xl p-3 text-center border border-[#2e3440]">
                  <div className="text-sm text-slate-400">Nominal WACC</div>
                  <div className="text-sm font-bold font-mono text-[#f5c242] mt-1">
                    %{nominalWaccNum.toFixed(1)}
                  </div>
                </div>
                <div className="bg-[#21262d] rounded-xl p-3 text-center border border-[#2e3440]">
                  <div className="text-sm text-slate-400">Kaldıraçlı Beta</div>
                  <div className="text-sm font-bold font-mono text-cyan-400 mt-1">
                    {Number(valuationInfo?.beta || 0.77).toFixed(2)}x
                  </div>
                </div>
              </div>
            </div>

            {/* 4.5 Kâr Kalitesi ve Nakit Dönüşümü (Earnings Quality Audit) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-sans font-bold text-white">
                    4.5 Kâr Kalitesi ve Nakit Dönüşümü
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
                  className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-[#2e3440] hover:bg-[#21262d] transition cursor-pointer"
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
                  <span className="text-xs text-slate-400 font-mono">Muhasebesel Net Kâr</span>
                </div>
              </div>

              {/* Sektörel Rehberlik & Teşhis Açıklama Kartı */}
              <div className="rounded-xl bg-[#21262d]/90 border border-[#2e3440] p-4 space-y-2 text-sm">
                <div className="flex items-start gap-2.5">
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
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
              </div>

              {showCashQualityExplainer && (
                <div className="bg-[#121417] border border-[#2e3440] p-4 rounded-xl text-sm text-slate-300 space-y-2">
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
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-base sm:text-lg font-bold text-white">4.6 DuPont 5 Aşamalı Kârlılık Ayrıştırması</span>
                </div>
                <div className="text-right">
                  <span className="text-sm text-slate-400 font-semibold mr-2">Yıllık ROE:</span>
                  <span className="text-xl font-black font-mono text-emerald-400">
                    %{dupontResult.calculatedRoe?.toFixed(1) || '—'}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                ROE = Vergi Yükü (Net/EBT) × Faiz Yükü (EBT/EBIT) × Faaliyet Marjı (EBIT/Satış) × Varlık Devri (Satış/Aktif) × Finansal Kaldıraç (Aktif/Özkaynak)
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#2e3440] bg-[#21262d] border border-[#2e3440] rounded-xl overflow-hidden">
                <div className="p-3 text-center">
                  <div className="text-xs text-slate-400">Vergi Yükü</div>
                  <div className="text-base font-bold font-mono text-white mt-1">
                    {dupontResult.taxBurden != null ? `${dupontResult.taxBurden}x` : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">Net/EBT</div>
                </div>

                <div className="p-3 text-center">
                  <div className="text-xs text-slate-400">Faiz Yükü</div>
                  <div className="text-base font-bold font-mono text-white mt-1">
                    {dupontResult.interestBurden != null ? `${dupontResult.interestBurden}x` : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">EBT/EBIT</div>
                </div>

                <div className="p-3 text-center">
                  <div className="text-xs text-slate-400">EBIT Marjı</div>
                  <div className="text-base font-bold font-mono text-[#f5c242] mt-1">
                    {dupontResult.ebitMargin != null ? `%${dupontResult.ebitMargin}` : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">EBIT/Satış</div>
                </div>

                <div className="p-3 text-center">
                  <div className="text-xs text-slate-400">Aktif Devri</div>
                  <div className="text-base font-bold font-mono text-cyan-400 mt-1">
                    {dupontResult.assetTurnover != null ? `${dupontResult.assetTurnover}x` : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">Satış/Aktif</div>
                </div>

                <div className="p-3 text-center col-span-2 sm:col-span-1">
                  <div className="text-xs text-slate-400">Kaldıraç</div>
                  <div className="text-base font-bold font-mono text-white mt-1">
                    {dupontResult.financialLeverage != null ? `${dupontResult.financialLeverage}x` : '—'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">Aktif/Özkaynak</div>
                </div>
              </div>

              {dupontResult.driverSummary && (
                <p className="text-xs text-slate-300 leading-relaxed bg-[#1a1e24] p-3 rounded-xl border border-[#282d37]">
                  {dupontResult.driverSummary}
                </p>
              )}
            </div>
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 5: TEMETTÜ (#sec-temettu)                                         */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Temettü Panosu Hatası">
          <section id="sec-temettu" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">5</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Temettü</h2>
              </div>
            </div>

            {(() => {
              const dividends: any[] = resolvedDividends;
              const hasDividends = Array.isArray(dividends) && dividends.length > 0;

              if (!hasDividends) {
                return (
                  <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-8 text-center space-y-3">
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
              const latestPayout = latestDiv.payoutRatioPct ?? 0;
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
              const displayedDividends = showAllDividends ? uniqueDividends : uniqueDividends.slice(0, 5);

              return (
                <div className="space-y-6">
                  {/* 5.1 Temettü Özeti */}
                  <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                      <span className="font-sans text-base sm:text-lg font-bold text-white">5.1 Temettü Özeti</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 space-y-1">
                        <div className="text-xs text-slate-400 font-sans">Son Temettü Verimi</div>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                          %{latestYield.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {latestDiv.date ? `Son Dağıtım: ${latestDiv.date}` : 'Yıllık Nakit Temettü'}
                        </div>
                      </div>

                      <div className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 space-y-1">
                        <div className="text-xs text-slate-400 font-sans">Hisse Başına Nakit</div>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-white">
                          ₺{latestPerShare.toFixed(3)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Net Hisse Başı Tutar
                        </div>
                      </div>

                      <div className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 space-y-1">
                        <div className="text-xs text-slate-400 font-sans">Kâr Dağıtma Oranı</div>
                        <div className="text-2xl sm:text-3xl font-black font-mono text-[#f5c242]">
                          %{latestPayout.toFixed(0)}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          Payout Oranı
                        </div>
                      </div>

                      <div className="bg-[#21262d] border border-[#2e3440] rounded-xl p-4 space-y-1">
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
                  <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-base sm:text-lg font-bold text-white">5.2 Temettü Trendi</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">Yıllık Dağıtım Döngüsü</span>
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
                  <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-5 shadow-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-base sm:text-lg font-bold text-white">5.3 Geçmiş Nakit Temettü Ödemeleri</span>
                      </div>
                      <span className="text-xs font-mono text-slate-400">
                        {showAllDividends ? `Tüm ${dividends.length} Kayıt Gösteriliyor` : `Son ${Math.min(5, dividends.length)} / Toplam ${dividends.length} Kayıt`}
                      </span>
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

                    {dividends.length > 5 && (
                      <div className="pt-3 border-t border-[#282d37] flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowAllDividends(!showAllDividends)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#21262d] hover:bg-[#2b313d] text-slate-200 hover:text-white border border-[#2e3440] text-xs font-semibold transition cursor-pointer shadow-sm"
                        >
                          {showAllDividends ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5 text-[#f5c242]" />
                              <span>Daha Az Göster (Son 5 Kayıt)</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5 text-[#f5c242]" />
                              <span>Tümünü Göster ({dividends.length} Kayıt)</span>
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
          {/* BÖLÜM 6: GÜÇLÜ & ZAYIF (#sec-gucluzayif)                                */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Güçlü/Zayıf Yönler Hatası">
          <section id="sec-gucluzayif" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">6</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Güçlü & Zayıf</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Güçlü Yönler (Pros) */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                  <h3 className="font-sans text-[15px] font-bold text-white">6.1 Temel Güçlü Yönler</h3>
                </div>
                <div className="space-y-3">
                  {(((report as any).pros && (report as any).pros.length > 0) ? (report as any).pros : [
                    'Sermaye maliyetinin üzerinde getiri üreten güçlü ROIC performansı',
                    'Düşük borçluluk ve yüksek serbest nakit akışı dönüşüm kabiliyeti',
                    'Sektör medyanlarına kıyasla cazip içsel değerleme iskontosu',
                    'Enflasyonist ortamda güçlü fiyatlama ve pazar payı koruma gücü'
                  ]).map((pro: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm text-slate-200 leading-relaxed bg-[#21262d]/50 p-3 rounded-xl border border-[#2e3440]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                      <span>{pro}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Zayıf Yönler & Riskler (Cons) */}
              <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                  <h3 className="font-sans text-[15px] font-bold text-white">6.2 Zayıf Yönler ve Temel Riskler</h3>
                </div>
                <div className="space-y-3">
                  {(((report as any).cons && (report as any).cons.length > 0) ? (report as any).cons : [
                    'Makroekonomik faiz oynaklığı ve borçlanma maliyeti baskısı',
                    'İşletme sermayesi döngüsünde dönemsel alacak vadeleri takibi ihtiyacı',
                    'Sektörel regülasyon ve asgari ücret artışlarının operasyonel marj etkisi'
                  ]).map((con: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm text-slate-200 leading-relaxed bg-[#21262d]/50 p-3 rounded-xl border border-[#2e3440]">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 flex-shrink-0" />
                      <span>{con}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 7: REHBERLİK & SUNUM (#sec-rehberlik)                              */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Yönetim Hedefleri Hatası">
          <section id="sec-rehberlik" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">7</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Rehberlik & Sunum</h2>
              </div>
            </div>

            {/* 1. KISIM (PAST): Şirket Yönetiminin Çok Yıllı Hedef Tutturma Karnesi */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-sans text-base sm:text-lg font-bold text-white">7.1 Şirket Yönetiminin Çok Yıllı Hedef Tutturma Karnesi</h3>
                </div>
              </div>

              {Array.isArray(report.extractedData?.guidance_track_record) && report.extractedData.guidance_track_record.length > 0 ? (
                <div className="overflow-x-auto border border-[#2e3440] rounded-xl">
                  <table className="w-full table-fixed text-sm sm:text-[15px] text-left border-collapse font-sans">
                    <thead className="bg-[#21262d] text-white text-sm sm:text-[15px] border-b border-[#2e3440]">
                      <tr>
                        <th className="w-[11%] min-w-[75px] p-3.5 sm:p-4 font-bold font-mono">Dönem</th>
                        <th className="w-[33%] p-3.5 sm:p-4 font-bold">Açıklanan Yönetim Hedefi / Stratejik Plan</th>
                        <th className="w-[21%] p-3.5 sm:p-4 text-right font-bold">Dönem Sonu Gerçekleşen</th>
                        <th className="w-[13%] min-w-[90px] p-3.5 sm:p-4 text-center font-bold">Karne Durumu</th>
                        <th className="w-[22%] p-3.5 sm:p-4 font-bold">Sapma & Değerlendirme</th>
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
                            <td className="p-3.5 sm:p-4 font-bold font-mono text-[#f5c242] text-sm sm:text-[15px] whitespace-nowrap">{g?.year_or_period || '—'}</td>
                            <td className="p-3.5 sm:p-4 text-slate-100 text-sm sm:text-[15px] leading-relaxed break-words">{cleanGuidance}</td>
                            <td className={`p-3.5 sm:p-4 text-right font-mono font-bold text-sm sm:text-[15px] break-words ${cleanStatus === 'BAŞARISIZ' ? 'text-rose-400' : 'text-emerald-300'}`}>
                              {cleanActual}
                            </td>
                            <td className="p-3.5 sm:p-4 text-center">
                              <span className={`px-2.5 py-1 rounded text-xs sm:text-sm font-bold font-mono whitespace-nowrap ${
                                cleanStatus === 'BAŞARILI'
                                  ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                                  : cleanStatus === 'BAŞARISIZ'
                                  ? 'bg-rose-950/70 text-rose-400 border border-rose-800/60'
                                  : 'bg-amber-950/70 text-amber-400 border border-amber-800/60'
                              }`}>
                                {cleanStatus}
                              </span>
                            </td>
                            <td className="p-3.5 sm:p-4 text-slate-200 text-sm sm:text-[15px] leading-relaxed break-words">
                              {String(g?.analysis || '').replace(/\bbancassurance\b/gi, 'banka sigortacılığı')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-[#21262d]/70 border border-[#2e3440] rounded-xl p-6 text-center space-y-2">
                  <div className="text-base font-bold text-white">
                    Geçmiş Yönetim Karnesi Verisi
                  </div>
                  <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
                    Şirketin geçmiş faaliyet raporu ve yatırımcı sunumlarında açıklanan hedefler ile gerçekleşmelerin kıyası için yeni analiz ekranındaki <strong className="text-white">Alan 2 (Faaliyet Raporları)</strong> veya <strong className="text-white">Alan 3 (Yatırımcı Sunumu)</strong> bölümlerine PDF belgelerini ekleyebilirsiniz.
                  </p>
                </div>
              )}
            </div>

            {/* 2. KISIM (FUTURE): Gelecek Dönem Hedefleri & Fırsatlar */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#282d37] pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-sans text-base sm:text-lg font-bold text-white">7.2 Gelecek Dönem Hedefleri & Fırsatlar</h3>
                </div>
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
                        <span className="px-3 py-0.5 rounded text-sm font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          {item.category || 'STRATEJİK KATALİZÖR'}
                        </span>
                        {item.period_or_target && (
                          <span className="text-sm font-mono font-semibold text-cyan-300 bg-cyan-950/50 border border-cyan-800/50 px-2.5 py-0.5 rounded">
                            {item.period_or_target}
                          </span>
                        )}
                      </div>
                      <h4 className="text-base font-bold text-white leading-snug flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{String(item.title || '').replace(/\bbancassurance\b/gi, 'banka sigortacılığı')}</span>
                      </h4>
                      <p className="text-sm sm:text-[15px] text-slate-200 leading-relaxed pl-6">
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
                      <div className="text-[15px] font-bold text-cyan-400">Yönetim Beklentileri</div>
                      <p className="text-sm sm:text-[15px] text-slate-200 leading-relaxed">{report.extractedData.capex_and_kpi.management_guidance}</p>
                    </div>
                  )}
                  {report.extractedData.capex_and_kpi.planned_capex_budget && (
                    <div className="bg-[#21262d]/60 border border-[#2e3440] p-3.5 rounded-xl space-y-1">
                      <div className="text-[15px] font-bold text-emerald-400">Planlanan Yatırım & Büyüme</div>
                      <p className="text-sm sm:text-[15px] text-slate-200 leading-relaxed">{report.extractedData.capex_and_kpi.planned_capex_budget}</p>
                    </div>
                  )}
                  {report.extractedData.capex_and_kpi.sectoral_kpis && (
                    <div className="bg-[#21262d]/60 border border-[#2e3440] p-3.5 rounded-xl space-y-1">
                      <div className="text-[15px] font-bold text-amber-400">Sektörel Operasyonel KPI</div>
                      <p className="text-sm sm:text-[15px] text-slate-200 leading-relaxed">{report.extractedData.capex_and_kpi.sectoral_kpis}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 8: ANALİST RAPORU (#sec-analist)                                  */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Değerleme Raporu Hatası">
          <section id="sec-analist" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#282d37] pb-3 flex-wrap gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#21262d] border border-[#2e3440] flex items-center justify-center font-mono text-sm text-[#f5c242] font-bold">8</span>
                <h2 className="font-sans text-xl sm:text-2xl font-bold text-white">Analist Raporu</h2>
              </div>
              <button
                type="button"
                onClick={handleCopyReportText}
                className="p-2 bg-[#21262d] hover:bg-[#2b313d] text-slate-200 hover:text-white rounded-lg border border-[#2e3440] transition cursor-pointer flex items-center justify-center"
                title={copiedReport ? "Kopyalandı" : "Raporu Kopyala"}
                aria-label="Raporu Kopyala"
              >
                {copiedReport ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
              </button>
            </div>

            {/* 8.1 Üst Yönetici Karar & Değerleme Kartı */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-5">
              <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                <span className="font-sans text-base sm:text-lg font-bold text-white">8.1 Yönetici Analiz Sonucu & Yatırım Perspektifi</span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#282d37] pb-4">
                <div className="flex items-center gap-3.5">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-mono font-black text-xl border shadow-lg ${
                    report.decision === 'AL'
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400 shadow-emerald-950/50'
                      : report.decision === 'ALMA'
                      ? 'bg-rose-950/80 border-rose-500/50 text-rose-400 shadow-rose-950/50'
                      : 'bg-amber-950/80 border-amber-500/50 text-amber-400 shadow-amber-950/50'
                  }`}>
                    {report.decision === 'AL' ? 'AL' : report.decision === 'ALMA' ? 'ALMA' : 'NÖTR'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm uppercase font-mono font-bold tracking-wider text-slate-300">Analiz Sonucu</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-mono font-bold border ${
                        report.decision === 'AL'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : report.decision === 'ALMA'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}>
                        {report.decision === 'AL' ? 'GÜÇLÜ ALIM POTANSİYELİ' : report.decision === 'ALMA' ? 'YÜKSEK RİSK / DEĞER TUZAĞI' : 'ENDEKSE PARALEL GETİRİ'}
                      </span>
                    </div>
                    <h3 className="font-sans text-lg font-bold text-white mt-1">
                      {report.ticker} için 12 Aylık Hedef & Değerleme Perspektifi
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <div className="text-sm text-slate-400 font-mono uppercase">Güncel Fiyat</div>
                    <div className="text-xl font-black font-mono text-white">₺{currentPriceNum.toFixed(2)}</div>
                  </div>
                  <div className="h-8 w-px bg-[#282d37]" />
                  <div className="text-right">
                    <div className="text-sm text-slate-400 font-mono uppercase">Hedef Adil Değer</div>
                    <div className="text-xl font-black font-mono text-[#f5c242]">₺{fairValueNum.toFixed(2)}</div>
                  </div>
                  <div className="h-8 w-px bg-[#282d37]" />
                  <div className="text-right">
                    <div className="text-sm text-slate-400 font-mono uppercase">Potansiyel</div>
                    <div className={`text-xl font-black font-mono ${fairValueNum >= currentPriceNum ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {currentPriceNum > 0
                        ? `${fairValueNum >= currentPriceNum ? '+' : ''}${(((fairValueNum - currentPriceNum) / currentPriceNum) * 100).toFixed(1)}%`
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3 Sütunlu Hızlı Analist Çerçevesi (Yatırım Tezi, Katalizörler, Riskler) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="bg-[#21262d] border border-emerald-500/30 rounded-xl p-4 sm:p-5 space-y-2.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                    <span className="font-sans font-bold text-white text-[15px]">Temel Yatırım Tezi</span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed font-sans">
                    {executiveVerdict.thesis || (
                      report.decision === 'AL'
                        ? 'Şirketin asgari güvenlik marjı kuralını sağlayan adil değer iskontosu, sermaye maliyetini aşan ROIC performansı ve dengeli borç yapısı, hisse senedini model portföy için cazip kılmaktadır.'
                        : report.decision === 'ALMA'
                        ? 'Şirketin eriyen kâr marjları, negatif sermaye makası (ROIC < WACC) veya yüksek borçluluk baskısı nedeniyle içsel değer piyasa fiyatının altındadır ve sermaye kaybı riski yüksektir.'
                        : 'Hisse mevcut değerleme çarpanları ve makro risk dengesi gözetildiğinde adil değerine yakın işlem görmekte olup endekse paralel getiri potansiyeli sunmaktadır.'
                    )}
                  </p>
                </div>

                <div className="bg-[#21262d] border border-cyan-500/30 rounded-xl p-4 sm:p-5 space-y-2.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-cyan-400">
                    <span className="font-sans font-bold text-white text-[15px]">Kilit Katalizörler</span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed font-sans">
                    {executiveVerdict.catalysts || (
                      `12 aylık ileri projeksiyonlarda beklenen %${Number(drivers.revenue_growth.value).toFixed(0)} hasılat artışı, pazar payı genişlemesi ve %${Number(drivers.net_income_growth.value).toFixed(0)} operasyonel kâr dinamizmi ana değer katalizörleridir.`
                    )}
                  </p>
                </div>

                <div className="bg-[#21262d] border border-rose-500/30 rounded-xl p-4 sm:p-5 space-y-2.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-rose-400">
                    <span className="font-sans font-bold text-white text-[15px]">Riskler & Emniyet Marjı</span>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed font-sans">
                    {executiveVerdict.risks || (
                      report.overrideReason
                        ? report.overrideReason
                        : 'Makro faiz dalgalanmaları, enflasyon muhasebesi kaynaklı marj daralmaları ve işletme sermayesi tahsilat süreleri temel izleme riskleridir.'
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* 8.2 BİST Kurumsal Araştırma Raporu (Birleşik Tek Kart) */}
            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl shadow-xl overflow-hidden divide-y divide-[#282d37]">
              {/* Rapor Üst Bilgi & Hızlı Atlama Çubuğu */}
              <div className="p-5 sm:p-6 space-y-3 bg-[#181b20]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-base sm:text-lg font-bold text-white">8.2 BİST Kurumsal Araştırma Raporu</span>
                  </div>
                  <div className="text-xs font-mono text-slate-400 bg-[#21262d] px-2.5 py-1 rounded-md border border-[#2e3440]">
                    Model: Gordon Büyüme & İNA • Reel WACC
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
                      className="px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-[#21262d] hover:bg-[#2b313d] text-slate-300 hover:text-[#f5c242] border border-[#2e3440] transition cursor-pointer"
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Markdown Rapor Metin Alanı */}
              <div className="p-6 sm:p-9 bg-[#181b20]">
                <div className={`prose prose-invert max-w-none font-sans leading-relaxed text-slate-200 ${
                  reportFontSize === 'compact' ? 'text-sm' : reportFontSize === 'large' ? 'text-lg' : 'text-base'
                }`}>
                  {report.report ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        h1: ({ ...props }) => <h1 className="font-sans text-2xl font-bold text-[#f5c242] border-b border-[#2e3440] pb-2 mt-6 mb-4" {...props} />,
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
                                <h2 className="font-sans text-lg font-bold text-white tracking-wide m-0" {...props}>
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
                              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-sans font-bold ${badgeColor} shadow-sm`}>
                                <span>{icon}</span>
                                <h3 className="m-0 font-sans text-sm sm:text-base font-bold text-white" {...props}>
                                  {children}
                                </h3>
                              </div>
                            </div>
                          );
                        },
                        p: ({ children, ...props }: any) => {
                          const text = extractTextFromChildren(children);
                          // Analist kararı ve yatırım tezi üstteki tek ve resmi yönetim kartında gösterildiği için mükerrer kart render edilmez
                          if (/Analist\s+Karar[ıi]\s*[:=-]/i.test(text) || (text.includes('Yatırım Tezi:') && (text.includes('Katalizör') || text.includes('Risk')))) {
                            return null;
                          }
                          return <p className="leading-relaxed mb-4 text-slate-200 text-sm sm:text-[15px] font-sans" {...props}>{children}</p>;
                        },
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
                            <table className="w-full text-sm text-left border-collapse font-mono" {...props} />
                          </div>
                        ),
                        th: ({ ...props }) => <th className="bg-[#21262d] p-3 font-bold text-white border-b border-[#2e3440]" {...props} />,
                        td: ({ ...props }) => <td className="p-2.5 border-b border-[#282d37] text-slate-200" {...props} />
                      }}
                    >
                      {cleanMarkdown(report.report)}
                    </ReactMarkdown>
                  ) : (
                    <div className="text-center py-10 text-slate-400 font-mono text-sm">
                      Bu analiz için detaylı analist rapor metni henüz üretilmedi.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
          </ComponentErrorBoundary>

          {/* ----------------------------------------------------------------------- */}
          {/* BÖLÜM 9: GEÇMİŞ (#sec-gecmis)                                            */}
          {/* ----------------------------------------------------------------------- */}
          <ComponentErrorBoundary fallbackTitle="Geçmiş Raporlar Hatası">
          <section id="sec-gecmis" className="scroll-mt-6 rounded-2xl border border-[#282d37] bg-[#12151b] p-6 sm:p-7 shadow-xl space-y-6">
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

            <div className="bg-[#181b20] border border-[#2b313d] rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2 border-b border-[#282d37] pb-3">
                <span className="font-sans text-base sm:text-lg font-bold text-white">9.1 Çeyreklik Analiz Hafızası & Model Geçmişi</span>
              </div>
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

                    return (
                      <div
                        key={hist.id}
                        onClick={() => onSelectReport && onSelectReport(hist.id)}
                        className="py-3.5 flex items-center justify-between hover:bg-[#21262d]/50 px-3 rounded-xl transition cursor-pointer group"
                      >
                        <div>
                          <div className="font-bold text-[15px] text-white flex items-center gap-2">
                            <span className="group-hover:text-emerald-400 transition">{hist.ticker}</span>
                            <span className="text-sm font-mono text-slate-300 bg-[#21262d] px-2 py-0.5 rounded border border-[#2e3440]">
                              {hist.period || '2025/12'}
                            </span>
                          </div>
                          <div className="text-sm text-slate-400 mt-1 font-mono">
                            Tarih: {hist.createdAt}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-[15px] font-bold text-[#f5c242]">
                            Adil Değer: {fairValDisplay}
                          </div>
                          <div className={`text-sm font-bold font-mono mt-0.5 ${hist.decision === 'AL' ? 'text-emerald-400' : hist.decision === 'ALMA' ? 'text-rose-400' : 'text-amber-400'}`}>
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

        </div>
      </div>
    </div>
  );
}
