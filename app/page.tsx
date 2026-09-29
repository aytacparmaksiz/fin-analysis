'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  Send, FileText, AlertTriangle, Database, 
  RefreshCw, Printer, PlusCircle, History, 
  ChevronRight, ChevronDown, UploadCloud, X, CheckCircle2, Search,
  TrendingUp, BarChart3, Target, Calendar, ArrowUpRight, ArrowDownRight, Minus,
  DollarSign, ShieldCheck, Activity, Layers, Sparkles, Download, Upload,
  Trophy, Award, Trash2, ArrowUpDown, Filter, Copy, Percent, PieChart, Info,
  PanelLeftClose, PanelLeftOpen, Pin, PinOff
} from 'lucide-react';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ComposedChart
} from 'recharts';

import { 
  detectSector, 
  SectorType, 
  SECTOR_DEFINITIONS 
} from '@/lib/sectors';

import { 
  AGESA_SAMPLE_DATA, 
  AGESA_SAMPLE_REPORT_TEXT 
} from '@/lib/sample-data';

import {
  computeSectorValuationAndDrivers,
  extractValuationFromReportText,
  parseFinancialNumber,
  safeDivide,
  safeRoe,
  safeMargin,
  homogenizeTms29Series,
  optimizeFinalDecision,
  calculateSectorScore,
  ValuationMetrics,
  FairValueDrivers,
  FinalDecisionOptimization,
  SectorScoreResult
} from '@/lib/valuation';

// Fair Value Kurumsal Vektör Logosu
function FairValueLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 via-slate-900 to-cyan-500/20 border border-emerald-500/30 shadow-md shadow-emerald-950/40 flex-shrink-0 p-1.5 ${className}`}>
      <svg viewBox="0 0 32 32" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 6H16C17.6569 6 19 7.34315 19 9C19 10.6569 17.6569 12 16 12H10V15H15C16.6569 15 18 16.3431 18 18C18 19.6569 16.6569 21 15 21H10V26H5V6Z" fill="#10B981" />
        <path d="M18 12L22.5 25L27 12" stroke="#38BDF8" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="22.5" cy="7.5" r="2.2" fill="#10B981" />
      </svg>
    </div>
  );
}

interface SavedReport {
  id: string;
  ticker: string;
  price: string;
  createdAt: string;
  period?: string;
  report: string;
  decision: 'AL' | 'ALMA' | 'NÖTR';
  rawDecision?: 'AL' | 'ALMA' | 'NÖTR';
  overrideReason?: string;
  score?: string;
  sector?: SectorType;
  extractedData?: any;
  marginOfSafetyStatus?: 'SAFE' | 'BORDERLINE' | 'UNSAFE';
  conditionalWarnings?: string[];
  isGreyZone?: boolean;
}

// Büyüme / Azalış Değişim Tipi
interface ChangeResult {
  value: number;
  text: string;
  isPositive: boolean;
  isNegative: boolean;
  isZero: boolean;
  isPoint?: boolean;
}

// Finansal Değer Formatlayıcı (Bin TRY / Milyon TRY / Tam TL - İlave 2)
function formatAmount(
  val: number | null | undefined, 
  unitMode: 'bin' | 'milyon' | 'tam' = 'bin', 
  isRatioOrPercent = false, 
  prefix = '', 
  suffix = '',
  currency = 'Bin TRY'
): string {
  if (val === null || val === undefined || isNaN(val)) return '—';

  if (isRatioOrPercent) {
    const formatted = val.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    return `${prefix}${formatted}${suffix}`;
  }

  // Raw verinin bin TL mi tam TL mi olduğunu tespit et
  const normCurrency = (currency || '').trim().toLowerCase();
  let isRawInThousands = true;
  if (normCurrency.includes('bin') || normCurrency.includes('thousand')) {
    isRawInThousands = true;
  } else if (normCurrency.includes('milyon') || normCurrency.includes('million')) {
    isRawInThousands = false;
  } else if (normCurrency === 'tl' || normCurrency === 'try' || normCurrency.includes('tam')) {
    isRawInThousands = false;
  } else if (!currency) {
    isRawInThousands = Math.abs(val) < 10000000000;
  }

  if (unitMode === 'bin') {
    const finalVal = isRawInThousands ? Math.round(val) : Math.round(val / 1000);
    return `${prefix}${finalVal.toLocaleString('tr-TR')}${suffix}`;
  } else if (unitMode === 'milyon') {
    const finalVal = isRawInThousands ? Number((val / 1000).toFixed(1)) : Number((val / 1000000).toFixed(1));
    return `${prefix}${finalVal.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mn${suffix}`;
  } else {
    // Tam TL modu:
    const finalVal = isRawInThousands ? Math.round(val * 1000) : Math.round(val);
    return `${prefix}${finalVal.toLocaleString('tr-TR')}${suffix}`;
  }
}

// Yıllık / Dönemsel Değişim Hesaplama
function calculateYoYChange(
  current: number | null | undefined, 
  previous: number | null | undefined, 
  isMargin = false
): ChangeResult | null {
  if (current === null || current === undefined || isNaN(current)) return null;
  if (previous === null || previous === undefined || isNaN(previous) || previous === 0) return null;

  if (isMargin) {
    const diff = Number((current - previous).toFixed(1));
    return {
      value: diff,
      text: diff > 0 ? `+${diff.toFixed(1)} puan` : `${diff.toFixed(1)} puan`,
      isPositive: diff > 0,
      isNegative: diff < 0,
      isZero: diff === 0,
      isPoint: true
    };
  } else {
    const pct = Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
    return {
      value: pct,
      text: pct > 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`,
      isPositive: pct > 0,
      isNegative: pct < 0,
      isZero: pct === 0,
      isPoint: false
    };
  }
}

// Görsel 1 & 3 Değişim Rozeti (YoY Change Badge: ↑ %11, ↓ %11, — %0)
function ChangeBadge({ 
  change, 
  invert = false, 
  size = 'sm' 
}: { 
  change: ChangeResult | null; 
  invert?: boolean;
  size?: 'sm' | 'xs';
}) {
  if (!change) {
    return (
      <span className="inline-flex items-center text-[10px] font-mono text-slate-500">
        —
      </span>
    );
  }

  if (change.isZero) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-medium text-slate-400">
        — %0
      </span>
    );
  }

  const isGood = invert ? change.isNegative : change.isPositive;

  const colorClass = isGood
    ? 'text-emerald-400'
    : 'text-rose-400';

  const iconText = change.isPositive ? '↑' : '↓';

  return (
    <span
      className={`inline-flex items-center justify-center gap-0.5 font-mono font-bold ${colorClass} ${
        size === 'xs' ? 'text-[10px]' : 'text-[11px]'
      }`}
    >
      <span>{iconText}</span>
      <span>%{Math.abs(change.value).toFixed(0)}</span>
    </span>
  );
}

// Sparkline Mini Çubuk Grafiği (Görsel 1 & 3 KALEMLER sütunundaki trend barları)
function SparklineBars({ 
  data,
  color = 'cyan'
}: { 
  data: (number | null | undefined)[];
  color?: 'cyan' | 'emerald' | 'amber';
}) {
  const valid = data.filter((v): v is number => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;

  const barColor = 
    color === 'emerald' ? 'bg-emerald-400' :
    color === 'amber' ? 'bg-amber-400' : 'bg-cyan-400';

  return (
    <div className="inline-flex items-end gap-[2px] h-3.5 w-12 px-0.5 flex-shrink-0" title="Dönemsel Trend">
      {data.map((val, idx) => {
        if (typeof val !== 'number' || isNaN(val)) {
          return <div key={idx} className="flex-1 bg-slate-800/60 h-[2px] rounded-[1px]" />;
        }
        const heightPct = Math.max(15, Math.min(100, Math.round(((val - min) / range) * 80 + 20)));
        const isLatest = idx === data.length - 1;
        return (
          <div
            key={idx}
            style={{ height: `${heightPct}%` }}
            className={`flex-1 rounded-[1px] transition-all ${
              isLatest ? barColor : 'bg-slate-600/70 hover:bg-slate-400'
            }`}
          />
        );
      })}
    </div>
  );
}

// Grafik Y-Ekseni Formatlayıcı (Görsel 4: Mn ve Mr formatı)
const chartYAxisFormatter = (v: number) => {
  if (Math.abs(v) >= 1000000) {
    return `${(v / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mr`;
  }
  if (Math.abs(v) >= 1000) {
    return `${(v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} Mn`;
  }
  return `${v}`;
};

// Grafik Değeri Metin Formatlayıcı
function formatChartMetric(val: number | null | undefined, isPct = false): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  if (isPct) return `%${val.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
  if (Math.abs(val) >= 1000000) {
    return `${(val / 1000000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mr TL`;
  }
  if (Math.abs(val) >= 1000) {
    return `${(val / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mn TL`;
  }
  return `${val.toLocaleString('tr-TR')} TL`;
}

// Sürücü çubuğu pin yüzdesi hesaplayıcı (Item 8: Değer sürücüsü iğnesini [0, 100] aralığında mantıklı konumlandırma)
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
    // Net Kâr Büyümesi: örn %357.3 gibi yüksek değerler boğa bölgesinde (sağda) yer alır
    if (value <= -30) return 10;
    if (value >= 200) return 92;
    if (value <= 0) return Math.round(10 + ((value + 30) / 30) * 18);
    if (value <= 40) return Math.round(28 + (value / 40) * 22);
    if (value <= 100) return Math.round(50 + ((value - 40) / 60) * 25);
    return Math.round(75 + ((value - 100) / 100) * 17);
  }

  if (type === 'margin') {
    if (sector === 'INSURANCE') {
      // Kombine Oran: Düşük olması İYİDİR! (< %85 Boğa, %85-%95 Nötr, > %100 Ayı)
      if (value <= 75) return 92;
      if (value >= 115) return 10;
      if (value <= 88) return Math.round(92 - ((value - 75) / 13) * 24);
      if (value <= 98) return Math.round(68 - ((value - 88) / 10) * 25);
      return Math.round(43 - ((value - 98) / 17) * 33);
    } else {
      // Standart FAVÖK Marjı: Yüksek olması İYİDİR!
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

// Görsel 5: Değer Sürücüleri Kartı (Driver Card)
function DriverCard({
  title,
  valueText,
  pinPercent = 50,
  bearText,
  bullText,
  description,
  sourceExplanation,
}: {
  title: string;
  valueText: string;
  pinPercent?: number;
  bearText: string;
  bullText: string;
  description: string;
  sourceExplanation?: string;
}) {
  return (
    <div className="bg-[#111827]/90 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-lg space-y-3.5">
      <div>
        <div className="text-xs font-semibold text-slate-300 tracking-tight">
          {title}
        </div>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-2xl font-black font-mono text-white tracking-tight">
            {valueText}
          </span>
          <span className="text-xs text-slate-400 font-normal">baz varsayım</span>
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="relative h-2 w-full rounded-full overflow-hidden flex bg-slate-900 border border-slate-800">
          <div className="w-1/2 h-full bg-gradient-to-r from-orange-600 to-amber-500" />
          <div className="w-1/2 h-full bg-gradient-to-r from-cyan-500 to-emerald-400" />
          <div 
            className="absolute top-0 bottom-0 w-1 bg-white shadow-md shadow-white/60 rounded-full"
            style={{ left: `calc(${pinPercent}% - 2px)` }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 leading-tight">
          <span className="max-w-[48%] text-left">{bearText}</span>
          <span className="max-w-[48%] text-right text-slate-300">{bullText}</span>
        </div>
      </div>

      {sourceExplanation && (
        <div className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 rounded px-2.5 py-1.5 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span className="break-words leading-snug flex-1" title={sourceExplanation}>{sourceExplanation}</span>
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-800/80">
        {description}
      </p>
    </div>
  );
}

// Recharts Tooltip
const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-950 border border-slate-700 p-3 rounded-lg shadow-2xl font-sans text-xs space-y-1.5 min-w-[210px] z-50">
        <div className="font-bold text-white border-b border-slate-800 pb-1 font-mono text-sm flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[10px] text-slate-400 font-normal">Dönem Sonu</span>
        </div>
        {payload.map((entry: any, index: number) => {
          const isPct =
            entry.dataKey?.includes('margin') ||
            entry.dataKey === 'roic' ||
            entry.dataKey === 'wacc' ||
            entry.unit === '%';

          return (
            <div key={`tooltip-${index}`} className="flex items-center justify-between gap-4 py-0.5">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: entry.color || entry.fill }}
                />
                <span className="truncate">{entry.name}:</span>
              </span>
              <span className="font-mono font-bold text-white whitespace-nowrap">
                {typeof entry.value === 'number'
                  ? isPct
                    ? `%${entry.value.toLocaleString('tr-TR')}`
                    : formatChartMetric(entry.value, false)
                  : entry.value ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

// Dönem Sıralama Ağırlığı
function parsePeriodSortKey(period: string): number {
  if (!period) return 0;
  const str = String(period).trim();
  const yrMatch = str.match(/(20\d{2})/);
  if (!yrMatch) return 0;
  const year = parseInt(yrMatch[1], 10);

  if (/(?:q1|1\.ç|1ç|\/0?3\b|3a\b)/i.test(str)) return year * 100 + 3;
  if (/(?:q2|2\.ç|2ç|\/0?6\b|6a\b)/i.test(str)) return year * 100 + 6;
  if (/(?:q3|3\.ç|3ç|\/0?9\b|9a\b)/i.test(str)) return year * 100 + 9;
  if (/(?:q4|4\.ç|4ç|\/12\b|12a\b)/i.test(str)) return year * 100 + 12;

  return year * 100 + 12;
}

function getAnnualizationFactor(period: string): number {
  if (!period) return 1.0;
  const str = String(period).toLowerCase();
  if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(str)) return 4.0;
  if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(str)) return 2.0;
  if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(str)) return 12.0 / 9.0;
  return 1.0;
}

function extractTextFromChildren(children: any): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('');
  if (children && typeof children === 'object' && children.props && children.props.children) {
    return extractTextFromChildren(children.props.children);
  }
  return '';
}

function sanitizeHistoryData(history: any[], debtInfo: any = {}, sector: SectorType = 'INDUSTRIAL') {
  if (!Array.isArray(history) || history.length === 0) return [];

  let parsedTlRate: number | null = null;
  if (debtInfo?.tl_interest_rate) {
    const parsed = parseFinancialNumber(debtInfo.tl_interest_rate);
    if (parsed !== null && parsed > 5 && parsed < 90) {
      parsedTlRate = parsed;
    } else {
      const m = String(debtInfo.tl_interest_rate).match(/(\d+([.,]\d+)?)/);
      if (m) {
        const val = parseFloat(m[1].replace(',', '.'));
        if (val > 5 && val < 90) parsedTlRate = val;
      }
    }
  }

  // 1. Tüm sayısal alanları parseFinancialNumber ile temizle (parantezli negatif, tireli, Türkçe ayrıcı)
  const cleanedHistory = history.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const row = { ...item };
    const numKeys = [
      'revenue', 'ebitda', 'net_income', 'gross_profit', 'operating_profit',
      'equity', 'total_assets', 'current_assets', 'non_current_assets',
      'cash_and_equivalents', 'cash', 'liquid_assets', 'net_debt', 'short_term_debt', 'long_term_debt',
      'financial_investments', 'financial_assets_insured', 'trade_receivables',
      'operating_cash_flow', 'free_cash_flow', 'capex', 'dividends_paid',
      'written_premiums', 'technical_profit', 'loss_ratio', 'expense_ratio', 'combined_ratio',
      'npl_ratio', 'car_ratio', 'nim', 'net_interest_income', 'loan_to_deposit',
      'nav', 'holding_discount', 'fwd_pe', 'trailing_pe', 'pb', 'ev_ebitda',
      'roe', 'roa', 'roic', 'wacc', 'gross_margin', 'ebitda_margin', 'net_margin', 'leverage_ratio'
    ];
    for (const k of numKeys) {
      if (row[k] !== undefined && row[k] !== null && typeof row[k] !== 'number') {
        const parsed = parseFinancialNumber(row[k]);
        if (parsed !== null) row[k] = parsed;
      }
    }
    return row;
  });

  // 2. TMS 29 Homojenizasyonu ve enflasyon düzeltmeli dönem takibi
  const { homogenizedHistory } = homogenizeTms29Series(cleanedHistory, sector);

  // 3. Kronolojik sıralama (Grafikler için eskiden yeniye)
  const sorted = [...homogenizedHistory].filter(Boolean).sort((a, b) => {
    return parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period);
  });

  return sorted.map((item, idx) => {
    if (!item) return item;
    const row = { ...item };
    const yrMatch = String(row.period || '').match(/(20\d{2})/);
    const yr = yrMatch ? parseInt(yrMatch[1], 10) : 2024;
    const annualFactor = getAnnualizationFactor(row.period);

    // Sigorta sektörü eşleştirmeleri
    if (sector === 'INSURANCE') {
      if (row.written_premiums && (!row.revenue || row.revenue === 0)) {
        row.revenue = row.written_premiums;
      }
      if (row.technical_profit && (!row.ebitda || row.ebitda === 0)) {
        row.ebitda = row.technical_profit;
      }
      if (row.loss_ratio != null && row.expense_ratio != null && row.combined_ratio == null) {
        row.combined_ratio = Number(((row.loss_ratio || 0) + (row.expense_ratio || 0)).toFixed(1));
      }
      if (row.combined_ratio != null && row.ebitda_margin == null) {
        row.ebitda_margin = Number((100 - row.combined_ratio).toFixed(1));
      }
      if (row.equity != null && row.net_income != null && row.roe == null) {
        const roeRes = safeRoe(row.net_income, row.equity, annualFactor);
        if (roeRes.isInsolvent) {
          row.roe = null;
          row.ttk_warning = roeRes.warning;
        } else if (roeRes.roe !== null) {
          row.roe = roeRes.roe;
        }
      }
      if (row.total_assets && row.total_assets > 0 && row.net_income && row.roa == null) {
        row.roa = Number(((row.net_income * annualFactor / row.total_assets) * 100).toFixed(2));
      }
    }

    // Bilanço Kalemlerini Akıllı Türet ve Eksikleri Tamamla (İlave 4: Tablo Tirelerini Önleme)
    // 1. Nakit ve Nakit Benzerleri
    if (row.cash_and_equivalents == null) {
      if (typeof row.cash === 'number') row.cash_and_equivalents = row.cash;
      else if (typeof row.liquid_assets === 'number') row.cash_and_equivalents = row.liquid_assets;
      else if (typeof row.net_debt === 'number' && row.net_debt < 0) {
        row.cash_and_equivalents = Math.abs(row.net_debt);
      }
    }

    // 2. Finansal Yatırımlar / Alacaklar Eşitlemesi
    if (row.financial_assets_insured == null && typeof row.financial_investments === 'number') {
      row.financial_assets_insured = row.financial_investments;
    }
    if (row.financial_investments == null && typeof row.financial_assets_insured === 'number') {
      row.financial_investments = row.financial_assets_insured;
    }

    // 3. Toplam Aktifler, Cari Varlıklar ve Cari Olmayan Varlıklar Dengesi
    if (row.total_assets != null && row.total_assets > 0) {
      if (row.current_assets != null && row.non_current_assets == null) {
        row.non_current_assets = Math.max(0, row.total_assets - row.current_assets);
      } else if (row.non_current_assets != null && row.current_assets == null) {
        row.current_assets = Math.max(0, row.total_assets - row.non_current_assets);
      }
    } else if (row.current_assets != null && row.non_current_assets != null) {
      row.total_assets = row.current_assets + row.non_current_assets;
    }

    // Eğer Cari Varlıklar hala boşsa nakit + alacaklar + yatırımlardan türet
    if (row.current_assets == null) {
      const subTotal = (row.cash_and_equivalents || 0) + 
                       (row.financial_assets_insured || row.financial_investments || 0) + 
                       (row.trade_receivables || 0);
      if (subTotal > 0) {
        row.current_assets = subTotal;
        if (row.total_assets != null && row.non_current_assets == null) {
          row.non_current_assets = Math.max(0, row.total_assets - subTotal);
        }
      }
    }

    // Eğer Toplam Aktifler hala boşsa özkaynak ve kaldıraçtan türet
    if (row.total_assets == null && row.equity && row.leverage_ratio && row.leverage_ratio < 100) {
      row.total_assets = Number((row.equity / (1 - row.leverage_ratio / 100)).toFixed(0));
      if (row.current_assets != null && row.non_current_assets == null) {
        row.non_current_assets = Math.max(0, row.total_assets - row.current_assets);
      }
    }

    // Özkaynak boşsa toplam aktifler ve kaldıraçtan türet
    if (row.equity == null && row.total_assets != null && row.leverage_ratio != null && row.leverage_ratio < 100) {
      row.equity = Number((row.total_assets * (1 - row.leverage_ratio / 100)).toFixed(0));
    }

    // Güvenli Marj Hesaplamaları
    if (row.revenue && row.revenue > 0) {
      if (row.ebitda_margin == null && typeof row.ebitda === 'number') {
        const sm = safeMargin(row.ebitda, row.revenue);
        if (sm !== null) row.ebitda_margin = sm;
      }
      if (row.net_margin == null && typeof row.net_income === 'number') {
        const sm = safeMargin(row.net_income, row.revenue);
        if (sm !== null) row.net_margin = sm;
      }
      if (row.gross_margin == null && typeof row.gross_profit === 'number') {
        const sm = safeMargin(row.gross_profit, row.revenue);
        if (sm !== null) row.gross_margin = sm;
      }
    }

    // Güvenli ROE (Çift negatif tuzak engelleme ve TTK 376 kontrolü)
    if (row.roe == null && typeof row.net_income === 'number' && typeof row.equity === 'number') {
      const roeRes = safeRoe(row.net_income, row.equity, annualFactor);
      if (roeRes.isInsolvent) {
        row.roe = null;
        row.ttk_warning = roeRes.warning;
      } else if (roeRes.roe !== null) {
        row.roe = roeRes.roe;
      }
    }

    let defaultWacc = 45.0;
    if (yr <= 2021) defaultWacc = 18.5;
    else if (yr === 2022) defaultWacc = 22.0;
    else if (yr === 2023) defaultWacc = 32.5;
    else if (yr >= 2024) defaultWacc = 44.0;

    if (parsedTlRate) {
      defaultWacc = Number((parsedTlRate * 0.95).toFixed(1));
    }

    if (row.wacc == null || row.wacc === 0 || isNaN(Number(row.wacc))) {
      row.wacc = defaultWacc;
    } else {
      row.wacc = Number(Number(row.wacc).toFixed(1));
    }

    if (row.roic == null || row.roic === 0 || isNaN(Number(row.roic))) {
      if (sector === 'INSURANCE' && typeof row.roe === 'number') {
        row.roic = row.roe;
      } else {
        const equity = typeof row.equity === 'number' && row.equity > 0 ? row.equity : 0;
        const netDebt = typeof row.net_debt === 'number' && row.net_debt > 0 ? row.net_debt : 0;
        const investedCapital = equity + netDebt;

        const rawNopat = (typeof row.net_income === 'number' && row.net_income !== 0)
          ? row.net_income
          : ((typeof row.ebitda === 'number' && row.ebitda > 0) ? row.ebitda * 0.70 : 0);
        const nopat = rawNopat * annualFactor;

        if (investedCapital > 0 && nopat !== 0) {
          const calculated = (nopat / investedCapital) * 100;
          if (calculated >= -50 && calculated <= 150) {
            row.roic = Number(calculated.toFixed(1));
          } else if (typeof row.ebitda_margin === 'number' && row.ebitda_margin > 0) {
            row.roic = Number((row.ebitda_margin * 0.85).toFixed(1));
          } else {
            row.roic = Number((row.wacc * 0.88).toFixed(1));
          }
        } else if (typeof row.ebitda_margin === 'number' && row.ebitda_margin > 0) {
          row.roic = Number((row.ebitda_margin * 0.85).toFixed(1));
        } else if (typeof row.gross_margin === 'number' && row.gross_margin > 0) {
          row.roic = Number((row.gross_margin * 0.65).toFixed(1));
        } else {
          const prevRoic = idx > 0 && sorted[idx - 1]?.roic ? sorted[idx - 1].roic : null;
          row.roic = prevRoic !== null ? prevRoic : Number((row.wacc * 0.88).toFixed(1));
        }
      }
    } else {
      row.roic = Number(Number(row.roic).toFixed(1));
    }

    row.eva_spread = Number((row.roic - row.wacc).toFixed(1));

    return row;
  });
}

function preprocessReportMarkdown(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Convert \[ ... \] to $$ ... $$
  cleaned = cleaned.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_m: string, g1: string) => `\n\n$$\n${g1.trim()}\n$$\n\n`);
  cleaned = cleaned.replace(/\\\[([\s\S]*?)\\\]/g, (_m: string, g1: string) => `\n\n$$\n${g1.trim()}\n$$\n\n`);

  // 2. Convert standalone "$" lines or lines starting with "-> $" or "> $" or "- $" (Item 11: Text / LaTeX hatalarını önleme)
  cleaned = cleaned.replace(/(?:^|\n)\s*(?:[-*]\s*)?(?:->\s*|>\s*)?\$\s*(?=\r?\n|$)/g, () => '\n$$');

  // 3. Convert single dollar math containing LaTeX commands (\text, \frac, etc.) or leading -> $ into $$
  cleaned = cleaned.replace(/(?:->\s*|>\s*)?\$(?!\$)\s*([^\n$]*\\[a-zA-Z]+[^\n$]*?)\s*\$/g, (_m: string, g1: string) => {
    return `\n\n$$\n${g1.trim()}\n$$\n\n`;
  });

  // 4. Clean inside $$ ... $$: ensure no internal blank lines break CommonMark math block
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, (_match: string, inner: string) => {
    const cleanedInner = inner
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .join('\n');
    return `\n\n$$\n${cleanedInner}\n$$\n\n`;
  });

  // 5. Inline LaTeX conversions: \( \text{...} \)
  cleaned = cleaned.replace(/\\\((\s*\\text\{.*?\}\s*)\\\)/g, (_m: string, g1: string) => `\n\n$$${g1}$$\n\n`);
  cleaned = cleaned.replace(/\\\((\s*\\frac\{.*?\}\{.*?\}\s*)\\\)/g, (_m: string, g1: string) => `\n\n$$${g1}$$\n\n`);
  cleaned = cleaned.replace(/\\\((.*?)\\\)/g, '$1');

  // 6. Normalise spacing around $$ blocks
  cleaned = cleaned.replace(/\n{3,}\$\$/g, () => '\n\n$$');
  cleaned = cleaned.replace(/\$\$\n{3,}/g, () => '$$\n\n');

  return cleaned.trim();
}

function getSpreadInfo(spread: number | null) {
  if (spread === null || isNaN(spread)) {
    return {
      label: '—',
      badgeText: 'Hesaplanamadı',
      colorClass: 'text-slate-400',
      badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700',
    };
  }

  const sign = spread > 0 ? '+' : '';
  const spreadStr = `${sign}${spread.toFixed(1)} puan`;

  if (spread >= 5.0) {
    return {
      label: spreadStr,
      badgeText: 'Güçlü Değer Üretimi (Geniş Makas)',
      colorClass: 'text-emerald-400',
      badgeClass: 'bg-emerald-950 text-emerald-400 border border-emerald-800 shadow-sm shadow-emerald-950/50',
    };
  } else if (spread > 0) {
    return {
      label: spreadStr,
      badgeText: 'Pozitif Değer Üretimi (ROIC > WACC)',
      colorClass: 'text-emerald-300',
      badgeClass: 'bg-emerald-950/80 text-emerald-300 border border-emerald-800',
    };
  } else if (spread >= -3.0) {
    return {
      label: spreadStr,
      badgeText: 'Hafif Sermaye Erozyonu (Başabaş Yakını)',
      colorClass: 'text-amber-400',
      badgeClass: 'bg-amber-950 text-amber-400 border border-amber-800',
    };
  } else {
    return {
      label: spreadStr,
      badgeText: 'Ciddi Sermaye İmhası (ROIC << WACC)',
      colorClass: 'text-rose-400',
      badgeClass: 'bg-rose-950 text-rose-400 border border-rose-800 shadow-sm shadow-rose-950/50',
    };
  }
}

export default function ValuationTerminal() {
  const [mounted, setMounted] = useState(false);
  const [ticker, setTicker] = useState('');
  const [price, setPrice] = useState('');
  const [consensus, setConsensus] = useState('');
  const [peerMultiples, setPeerMultiples] = useState('');
  const [selectedSector, setSelectedSector] = useState<SectorType | 'AUTO'>('AUTO');
  const [files, setFiles] = useState<File[]>([]);

  // Aşama durumu
  const [step, setStep] = useState<'input' | 'review' | 'report' | 'leaderboard'>('input');
  const [extractedData, setExtractedData] = useState<any>(null);

  // Ana Sekmeler
  const [activeTab, setActiveTab] = useState<'overview' | 'fairvalue' | 'tables' | 'proscons' | 'guidance' | 'report' | 'history'>('overview');

  // Finansal Tablolar Alt Sekmeleri (Görsel 2)
  const [tableSubTab, setTableSubTab] = useState<'bilanco' | 'gelir' | 'nakit' | 'oranlar'>('bilanco');

  // Açılıp kapanır kalem başlıkları (Görsel 3 & İlave 4)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Tutar Birimi Seçici (İlave 2 & Görsel 1: Bin TRY varsayılan)
  const [unitMode, setUnitMode] = useState<'bin' | 'milyon' | 'tam'>('bin');

  // Oranlar Kategori Filtresi (İlave 7: Cari Oranlar ve diğer rasyolar)
  const [ratioCategoryFilter, setRatioCategoryFilter] = useState<'ALL' | 'LIKIDITE' | 'KALDIRAC' | 'FAALIYET' | 'KARLILIK' | 'SIGORTA'>('ALL');

  // Oran Tıklama Detay Paneli (İlave 7: Cari Oran veya tıklanan oran formül açıklaması)
  const [selectedRatioDetail, setSelectedRatioDetail] = useState<string | null>(null);

  // Aşama 2: Çeyreklik Skor Öncesi Pros/Cons Analizi Seçeneği (İlave 6)
  const [includeProsConsInReview, setIncludeProsConsInReview] = useState<boolean>(true);
  const [showProsConsPreviewInReview, setShowProsConsPreviewInReview] = useState<boolean>(false);

  const [copiedReport, setCopiedReport] = useState(false);
  const [fontSizeMode, setFontSizeMode] = useState<'normal' | 'large' | 'compact'>('normal');

  const [sidebarSort, setSidebarSort] = useState<'rank' | 'date'>('rank');
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [leaderboardFilter, setLeaderboardFilter] = useState<'ALL' | 'AL' | 'NÖTR' | 'ALMA'>('ALL');

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [isCloudConfigured, setIsCloudConfigured] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  // Kenar Çubuğu Katlanabilirlik ve Sabitleme Durumu (Item 6)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(true);

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const collapseAllSections = (sections: string[]) => {
    const allCollapsed = sections.every(s => collapsedSections[s]);
    const newState: Record<string, boolean> = {};
    sections.forEach(s => {
      newState[s] = !allCollapsed;
    });
    setCollapsedSections(newState);
  };

  const sortReportsByRank = (reports: SavedReport[]) => {
    return [...reports].sort((a, b) => {
      const rankDecision = (d: string) => {
        const norm = (d || '').trim().toUpperCase();
        if (norm === 'AL') return 1;
        if (norm === 'NÖTR' || norm === 'NOTR') return 2;
        if (norm === 'ALMA') return 3;
        return 4;
      };
      const diffDecision = rankDecision(a.decision) - rankDecision(b.decision);
      if (diffDecision !== 0) return diffDecision;

      const scoreA = parseFloat(String(a.score || '0').replace(/[^0-9.]/g, '')) || 0;
      const scoreB = parseFloat(String(b.score || '0').replace(/[^0-9.]/g, '')) || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  };

  const sortReportsByDate = (reports: SavedReport[]) => {
    return [...reports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const deleteReport = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const reportToDelete = savedReports.find(r => r.id === id);
    const tickerName = reportToDelete?.ticker || 'bu';
    if (confirm(`${tickerName} hissesine ait değerleme raporunu silmek istediğinize emin misiniz?`)) {
      const updated = savedReports.filter(r => r.id !== id);
      setSavedReports(updated);
      try {
        localStorage.setItem('fin_valuation_reports', JSON.stringify(updated));
      } catch (err) {}

      try {
        await fetch(`/api/reports?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.warn('Buluttan silme başarısız:', err);
      }

      if (activeReportId === id) {
        setActiveReportId(null);
        setStep('leaderboard');
      }
    }
  };

  // Demo / Örnek Şirket Yükleme (AGESA - Sigortacılık veya THYAO)
  const loadAgesaDemo = () => {
    const agesaReport: SavedReport = {
      id: 'demo-agesa',
      ticker: 'AGESA',
      price: '118.50',
      period: '2026/Q2',
      createdAt: '28 Eylül 2026, 14:15',
      decision: 'AL',
      score: '96',
      sector: 'INSURANCE',
      report: AGESA_SAMPLE_REPORT_TEXT,
      extractedData: AGESA_SAMPLE_DATA,
    };

    const exists = savedReports.some(r => r.ticker === 'AGESA');
    if (!exists) {
      const updated = [agesaReport, ...savedReports];
      setSavedReports(updated);
      try {
        localStorage.setItem('fin_valuation_reports', JSON.stringify(updated));
      } catch (e) {}
    }

    setTicker('AGESA');
    setPrice('118.50');
    setExtractedData(AGESA_SAMPLE_DATA);
    setActiveReportId(agesaReport.id);
    setStep('report');
    setActiveTab('overview');
  };

  useEffect(() => {
    setMounted(true);
    let localData: SavedReport[] = [];
    try {
      const stored = localStorage.getItem('fin_valuation_reports');
      if (stored) {
        localData = JSON.parse(stored);
      }
    } catch (e) {}

    // Eğer hiç rapor yoksa, AGESA örnek raporunu otomatik başlangıç olarak ekle
    if (localData.length === 0) {
      const demoAgesa: SavedReport = {
        id: 'demo-agesa',
        ticker: 'AGESA',
        price: '118.50',
        period: '2026/Q2',
        createdAt: '28 Eylül 2026, 14:15',
        decision: 'AL',
        score: '96',
        sector: 'INSURANCE',
        report: AGESA_SAMPLE_REPORT_TEXT,
        extractedData: AGESA_SAMPLE_DATA,
      };
      localData = [demoAgesa];
      try {
        localStorage.setItem('fin_valuation_reports', JSON.stringify(localData));
      } catch (e) {}
    }

    setSavedReports(localData);
    if (localData.length > 0) {
      setActiveReportId(localData[0].id);
      setExtractedData(localData[0].extractedData);
      setStep('report');
    }

    const syncWithCloud = async () => {
      try {
        setIsSyncing(true);
        const res = await fetch('/api/reports');
        if (res.ok) {
          const json = await res.json();
          setIsCloudConfigured(Boolean(json.isCloudConfigured));
          if (json.isCloudConfigured && Array.isArray(json.reports) && json.reports.length > 0) {
            const combinedMap = new Map<string, SavedReport>();
            localData.forEach(r => combinedMap.set(r.id, r));
            json.reports.forEach((r: SavedReport) => combinedMap.set(r.id, r));

            const merged = Array.from(combinedMap.values());
            setSavedReports(merged);
            localStorage.setItem('fin_valuation_reports', JSON.stringify(merged));
          }
        }
      } catch (err) {
        console.warn('Cloud sync error:', err);
      } finally {
        setIsSyncing(false);
      }
    };

    syncWithCloud();
  }, []);

  const saveReport = async (newReport: SavedReport) => {
    const updated = [newReport, ...savedReports.filter(r => r.id !== newReport.id)];
    setSavedReports(updated);
    try {
      localStorage.setItem('fin_valuation_reports', JSON.stringify(updated));
    } catch (e) {}

    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: newReport }),
      });
    } catch (err) {
      console.warn('Buluta kaydetme başarısız, yerelde saklandı:', err);
    }
  };

  const exportBackup = () => {
    try {
      const dataStr = JSON.stringify(savedReports, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fin_degerleme_raporlari_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Yedek dışa aktarılamadı.');
    }
  };

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          const existingIds = new Set(savedReports.map(r => r.id));
          const newEntries = parsed.filter((r: any) => r.id && r.ticker);
          const merged = [...newEntries.filter(r => !existingIds.has(r.id)), ...savedReports];
          setSavedReports(merged);
          localStorage.setItem('fin_valuation_reports', JSON.stringify(merged));
          alert(`${newEntries.length} adet rapor başarıyla içeri aktarıldı!`);
          if (merged.length > 0) {
            setActiveReportId(merged[0].id);
            setStep('report');
          }
        } else {
          alert('Geçersiz dosya formatı. Rapor listesi JSON formatında olmalıdır.');
        }
      } catch (err) {
        alert('Dosya okunurken bir hata oluştu.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  // Aşama 1: PDF Metin Çıkarımı
  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Lütfen en az bir PDF dokümanı ekleyin (Örn: 2022-2026 raporları).');
      return;
    }
    setLoading(true);
    setError(null);
    setStatusMessage('PDF belgeleri taranıyor ve metin katmanları ayıklanıyor...');

    try {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const documents: { name: string; text: string }[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatusMessage(`(${i + 1}/${files.length}) ${file.name} taranıyor...`);
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
          const { text } = await extractText(pdf, { mergePages: true });
          if (text && text.trim().length > 50) {
            documents.push({ name: file.name, text: text.trim() });
          }
        } catch (pdfErr) {
          console.warn(`[PDF] ${file.name} metin ayrıştırılamadı:`, pdfErr);
        }
      }

      setStatusMessage('Finansal veriler ve rasyolar yapay zeka tarafından çıkarılıyor...');

      let res: Response;
      if (documents.length > 0) {
        res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, documents })
        });
      } else {
        const fd = new FormData();
        fd.append('ticker', ticker);
        files.forEach(f => fd.append('files', f));

        res = await fetch('/api/extract', {
          method: 'POST',
          body: fd
        });
      }

      const responseText = await res.text();
      let result: any;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(responseText || `Sunucu hatası: HTTP ${res.status}`);
      }

      if (!res.ok) throw new Error(result.error || 'Veri çıkarımı başarısız oldu.');

      const activeSector = selectedSector === 'AUTO' ? detectSector(ticker) : selectedSector;
      result.data.sector = activeSector;

      setExtractedData(result.data);
      setStep('review');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  // Aşama 2: Çok Yıllı Değerleme ve Çeyreklik Karşılaştırma
  const handleEvaluate = async () => {
    setLoading(true);
    setError(null);
    setStatusMessage('Sektörel değerleme modeli, çarpan analizi ve kurumsal karne üretiliyor...');

    const normalizedTicker = ticker.toUpperCase().trim();
    const previousReportsForTicker = savedReports.filter(r => r.ticker === normalizedTicker);
    const previousReport = previousReportsForTicker.length > 0 ? previousReportsForTicker[0] : null;

    const activeSector: SectorType = selectedSector === 'AUTO' 
      ? (extractedData?.sector || detectSector(normalizedTicker)) 
      : selectedSector;

    const sanitizedHistory = sanitizeHistoryData(
      extractedData?.financial_history || [], 
      extractedData?.debt_and_interest,
      activeSector
    );

    const enrichedExtractedData = extractedData ? {
      ...extractedData,
      sector: activeSector,
      financial_history: sanitizedHistory
    } : null;

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: normalizedTicker,
          price,
          consensus,
          peerMultiples,
          sectorOverride: activeSector,
          extractedData: enrichedExtractedData,
          previousReport: previousReport ? {
            createdAt: previousReport.createdAt,
            decision: previousReport.decision,
            score: previousReport.score,
            price: previousReport.price
          } : undefined
        })
      });

      const responseText = await res.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(responseText || `Sunucu hatası: HTTP ${res.status}`);
      }

      if (!res.ok) throw new Error(data.error || 'Değerleme tamamlanamadı.');

      let rawDecision: 'AL' | 'ALMA' | 'NÖTR' = 'NÖTR';
      const decisionMatch = data.report.match(/Analist\s+Karar[ıi]\s*[:=-]\s*\[?\s*\*?\*?\s*(ALMA|SAT|AL|NÖTR|NOTR|TUT)\s*\*?\*?\s*\]?/i);
      if (decisionMatch) {
        const d = decisionMatch[1].toUpperCase();
        if (d === 'ALMA' || d === 'SAT') rawDecision = 'ALMA';
        else if (d === 'AL') rawDecision = 'AL';
        else rawDecision = 'NÖTR';
      }

      const scoreMatch = 
        data.report.match(/\|\s*\*?\*?Toplam\s+Puan\*?\*?\s*\|\s*\*?\*?(\d{1,3})\*?\*?/i) ||
        data.report.match(/Toplam\s+Puan\s*[:=]\s*\*?\*?(\d{1,3})/i) ||
        data.report.match(/(\d{1,3})\s*\/\s*100/i);
      const score = scoreMatch ? scoreMatch[1] : (data.scoreResult?.totalScore != null ? String(data.scoreResult.totalScore) : undefined);
      const parsedPrice = parseFinancialNumber(price);
      const targetVal = parseFinancialNumber(data.valuation?.composite_fair_value || data.valuation?.fair_value || data.valuation?.dcf_fair_value);
      const numericScore = score ? parseInt(score, 10) : data.scoreResult?.totalScore;

      const opt = optimizeFinalDecision({
        rawDecision,
        score: numericScore,
        valuation: data.valuation,
        marketPrice: parsedPrice,
        fairValue: targetVal,
        latestData: enrichedExtractedData?.financial_history?.[enrichedExtractedData?.financial_history?.length - 1],
        scoreResult: data.scoreResult,
        sector: activeSector
      });

      const finalDecision = opt?.finalDecision || rawDecision;

      const finalExtracted = {
        ...enrichedExtractedData,
        valuation: data.valuation || enrichedExtractedData?.valuation,
        fair_value_drivers: data.drivers || enrichedExtractedData?.fair_value_drivers,
        score_result: data.scoreResult,
        optimization: opt
      };

      const newEntry: SavedReport = {
        id: Date.now().toString(),
        ticker: normalizedTicker,
        price,
        period: extractedData?.reporting_period,
        createdAt: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        report: data.report,
        decision: finalDecision,
        rawDecision: rawDecision !== finalDecision ? rawDecision : undefined,
        overrideReason: opt?.overrideReason,
        marginOfSafetyStatus: opt?.marginOfSafetyStatus,
        conditionalWarnings: opt?.conditionalWarnings,
        isGreyZone: opt?.isGreyZone,
        score,
        sector: activeSector,
        extractedData: finalExtracted
      };

      saveReport(newEntry);
      setActiveReportId(newEntry.id);
      setStep('report');
      setActiveTab('overview');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const handleCopyReport = async () => {
    if (activeReport?.report) {
      try {
        await navigator.clipboard.writeText(activeReport.report);
        setCopiedReport(true);
        setTimeout(() => setCopiedReport(false), 2500);
      } catch (err) {
        alert('Kopyalama başarısız oldu.');
      }
    }
  };

  const activeReport = savedReports.find(r => r.id === activeReportId);
  const currentExtractedData = activeReport?.extractedData || extractedData;

  const currentSector: SectorType = 
    activeReport?.sector || 
    currentExtractedData?.sector || 
    (selectedSector !== 'AUTO' ? selectedSector : detectSector(activeReport?.ticker || ticker));

  const sectorMeta = SECTOR_DEFINITIONS[currentSector] || SECTOR_DEFINITIONS.INDUSTRIAL;

  const tickerHistory = activeReport 
    ? savedReports.filter(r => r.ticker === activeReport.ticker).reverse()
    : [];

  // Zaman Serisi Grafik Verisi (eskiden yeniye, kronolojik)
  const rawChartData = currentExtractedData?.financial_history || [];
  const chartData = sanitizeHistoryData(
    rawChartData, 
    currentExtractedData?.debt_and_interest,
    currentSector
  );

  // Görsel 1 & 3: Finansal Tablolar için Günümüzden Geçmişe (Yeniden Eskiye) Sıralama
  const tableData = [...chartData].reverse();

  // Son Dönem ve Önceki Dönem Verileri
  const latestData = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const prevData = chartData.length > 1 ? chartData[chartData.length - 2] : null;

  // Önceki Yılın Aynı Çeyreğini Bulma (Gerçek YoY Kıyaslaması - İlave 3)
  const findSameQuarterLastYear = (currPeriod: string, hist: any[]) => {
    if (!currPeriod || !hist || hist.length === 0) return null;
    const match = String(currPeriod).match(/(20\d{2})[\/\s\-_]?(q\d|\d+)/i);
    if (!match) return null;
    const curYear = parseInt(match[1], 10);
    const qPart = match[2].toUpperCase();
    const prevYear = curYear - 1;
    return hist.find(h => {
      if (!h || !h.period) return false;
      const hMatch = String(h.period).match(/(20\d{2})[\/\s\-_]?(q\d|\d+)/i);
      if (!hMatch) return false;
      return parseInt(hMatch[1], 10) === prevYear && hMatch[2].toUpperCase() === qPart;
    }) || null;
  };

  const sameQuarterLastYear = latestData ? findSameQuarterLastYear(latestData.period, chartData) : null;
  const annualFactor = latestData ? getAnnualizationFactor(latestData.period) : 1.0;

  // YoY Büyüme (Aynı Çeyreğe Göre - Mevsimsellikten ve Yanıltıcı Çeyreklik Düşüşten Arındırılmış)
  const yoyRevChange = sameQuarterLastYear 
    ? calculateYoYChange(latestData?.revenue, sameQuarterLastYear?.revenue)
    : calculateYoYChange(latestData?.revenue ? latestData.revenue * annualFactor : null, prevData?.revenue);

  const yoyEbitdaChange = sameQuarterLastYear 
    ? calculateYoYChange(latestData?.ebitda, sameQuarterLastYear?.ebitda)
    : calculateYoYChange(latestData?.ebitda ? latestData.ebitda * annualFactor : null, prevData?.ebitda);

  const yoyNetChange = sameQuarterLastYear 
    ? calculateYoYChange(latestData?.net_income, sameQuarterLastYear?.net_income)
    : calculateYoYChange(latestData?.net_income ? latestData.net_income * annualFactor : null, prevData?.net_income);

  // Yıllıklandırılmış (TTM) Değerler
  const annualizedRevenue = latestData?.revenue ? latestData.revenue * annualFactor : null;
  const annualizedEbitda = latestData?.ebitda ? latestData.ebitda * annualFactor : null;
  const annualizedNet = latestData?.net_income ? latestData.net_income * annualFactor : null;

  // Ekonomik Değer Makası
  const latestSpread = (latestData?.roic !== undefined && latestData?.wacc !== undefined && latestData.roic !== null && latestData.wacc !== null)
    ? Number((latestData.roic - latestData.wacc).toFixed(1))
    : null;
  const spreadInfo = getSpreadInfo(latestSpread);

  // Her dönem için dinamik finansal oran hesaplayıcı (Item 10: Her sene ve döneme ait verileri dinamik hesaplama)
  const computeRatioForPeriod = (
    d: any,
    key: string,
    sector?: SectorType,
    defaultVal?: number
  ): number | null => {
    if (d && typeof d[key] === 'number' && !isNaN(d[key])) {
      return d[key];
    }
    if (!d) return defaultVal ?? null;

    // Çeyreklik yıllıklandırma katsayısı
    const periodStr = String(d.period || '').toLowerCase();
    let annualFactor = 1.0;
    if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(periodStr)) annualFactor = 4.0;
    else if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(periodStr)) annualFactor = 2.0;
    else if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(periodStr)) annualFactor = 12.0 / 9.0;

    switch (key) {
      case 'current_ratio': {
        if (d.current_assets && d.current_liabilities && d.current_liabilities > 0) {
          return Number((d.current_assets / d.current_liabilities).toFixed(2));
        }
        if (d.total_assets && d.equity && d.current_assets) {
          const totalLiab = Math.max(1, d.total_assets - d.equity);
          const estCurrentLiab = sector === 'INSURANCE' ? totalLiab * 0.045 : totalLiab * 0.60;
          return Number((d.current_assets / estCurrentLiab).toFixed(2));
        }
        break;
      }
      case 'quick_ratio': {
        if (d.current_ratio) return d.current_ratio;
        if (d.current_assets && d.total_assets && d.equity) {
          const totalLiab = Math.max(1, d.total_assets - d.equity);
          const estCurrentLiab = sector === 'INSURANCE' ? totalLiab * 0.045 : totalLiab * 0.60;
          const quick = sector === 'INSURANCE' ? d.current_assets : d.current_assets * 0.75;
          return Number((quick / estCurrentLiab).toFixed(2));
        }
        break;
      }
      case 'cash_ratio': {
        const cashVal = d.cash_and_equivalents ?? d.cash ?? d.liquid_assets;
        if (cashVal != null && d.total_assets && d.equity) {
          const totalLiab = Math.max(1, d.total_assets - d.equity);
          const estCurrentLiab = sector === 'INSURANCE' ? totalLiab * 0.045 : totalLiab * 0.60;
          return Number((cashVal / estCurrentLiab).toFixed(2));
        }
        break;
      }
      case 'leverage_ratio': {
        if (d.total_assets && d.equity && d.total_assets > 0) {
          return Number((((d.total_assets - d.equity) / d.total_assets) * 100).toFixed(2));
        }
        break;
      }
      case 'asset_turnover': {
        const rev = d.revenue ?? d.written_premiums;
        if (rev && d.total_assets && d.total_assets > 0) {
          return Number(((rev * annualFactor) / d.total_assets).toFixed(2));
        }
        break;
      }
      case 'equity_turnover': {
        const rev = d.revenue ?? d.written_premiums;
        if (rev && d.equity && d.equity > 0) {
          return Number(((rev * annualFactor) / d.equity).toFixed(2));
        }
        break;
      }
      case 'roa': {
        if (d.net_income && d.total_assets && d.total_assets > 0) {
          return Number(((d.net_income * annualFactor / d.total_assets) * 100).toFixed(2));
        }
        break;
      }
      case 'roe': {
        if (d.net_income && d.equity && d.equity > 0) {
          return Number(((d.net_income * annualFactor / d.equity) * 100).toFixed(2));
        }
        break;
      }
      case 'loss_ratio': {
        if (d.loss_ratio != null) return d.loss_ratio;
        break;
      }
      case 'expense_ratio': {
        if (d.expense_ratio != null) return d.expense_ratio;
        break;
      }
      case 'combined_ratio': {
        if (d.combined_ratio != null) return d.combined_ratio;
        if (d.loss_ratio != null && d.expense_ratio != null) {
          return Number((d.loss_ratio + d.expense_ratio).toFixed(1));
        }
        break;
      }
    }

    return defaultVal ?? null;
  };


  interface TableRowConfig {
    label: string;
    sublabel?: string;
    key: string;
    fallbackKey?: string;
    isHeader?: boolean;
    highlight?: boolean;
    isMargin?: boolean;
    prefix?: string;
    suffix?: string;
    invert?: boolean;
  }

  interface TableSectionConfig {
    title: string;
    categoryKey: string;
    rows: TableRowConfig[];
  }

  interface RatioRowConfig {
    label: string;
    key: string;
    isRatio?: boolean;
    isPercent?: boolean;
    defaultVal: number;
  }

  interface RatioSectionConfig {
    title: string;
    categoryKey: string;
    rows: RatioRowConfig[];
  }

  // Rasyo Formül ve Standart Açıklamaları (Görsel 3 & İlave 7)
  const RATIO_DEFINITIONS: Record<string, { formula: string; benchmark: string; desc: string }> = {
    current_ratio: {
      formula: 'Cari Oran = Dönen Varlıklar / Kısa Vadeli Yükümlülükler',
      benchmark: 'Normal: 1,50 - 2,50 | Sigortacılıkta: 3,00+ (Yüksek Float Likiditesi)',
      desc: 'Şirketin kısa vadeli borçlarını dönen varlıklarıyla ödeme kabiliyetini gösterir. Değerin 1.5 üzerinde olması güçlü işletme sermayesini belgeler.',
    },
    quick_ratio: {
      formula: 'Likidite Oranı (Asit-Test) = (Dönen Varlıklar - Stoklar) / Kısa Vadeli Yükümlülükler',
      benchmark: 'Normal: 1,00+ | Sigortacılıkta: Cari Orana Eşit (Stok Bulunmaz)',
      desc: 'Stok satışına bağımlı olmadan ani borç ödeme kapasitesidir.',
    },
    cash_ratio: {
      formula: 'Nakit Oran = Nakit ve Nakit Benzerleri / Kısa Vadeli Yükümlülükler',
      benchmark: 'Normal: 0,20 - 0,50 | Sigortacılıkta: 0,50 - 0,80',
      desc: 'Hiçbir alacak tahsilatı olmasa dahi kasadaki hazır değerlerle anında karşılanabilecek borç oranı.',
    },
    leverage_ratio: {
      formula: 'Kaldıraç Oranı = Toplam Yükümlülükler / Toplam Varlıklar (%)',
      benchmark: 'Sanayi: %50 - %70 | Sigorta & Emeklilik: %90 - %98 (Teknik Karşılıklar)',
      desc: 'Varlıkların ne kadarının yabancı kaynakla finanse edildiğini gösterir. Sigorta şirketlerinde toplanan primler teknik karşılık olarak yazıldığından yüksek kaldıraç normaldir.',
    },
    asset_turnover: {
      formula: 'Aktif Devir Hızı = Satış Gelirleri (veya Primler) / Toplam Aktifler',
      benchmark: 'Sanayi: 1,0 - 2,0 | Sigorta & Banka: 0,10 - 0,20',
      desc: 'Şirketin varlık tabanını ne kadar etkin ciroya dönüştürdüğünü ölçer.',
    },
    equity_turnover: {
      formula: 'Özkaynak Devir Hızı = Satış Gelirleri / Toplam Özkaynaklar',
      benchmark: 'Normal: 3,0 - 6,0x',
      desc: 'Özkaynakların ne kadar ciro ürettiğini gösterir.',
    },
    roa: {
      formula: 'Aktif Kârlılık (ROA) = Net Dönem Kârı / Toplam Aktifler (%)',
      benchmark: 'Finans / Sigorta: %1,5 - %3,0',
      desc: 'Tüm bilanço büyüklüğü üzerinden üretilen net getiri.',
    },
    roe: {
      formula: 'Özkaynak Kârlılığı (ROE) = Net Dönem Kârı / Toplam Özkaynaklar (%)',
      benchmark: 'Mükemmel Değer Üretimi: ROE > Sermaye Maliyeti (%60+)',
      desc: 'Hissedarların yatırdığı özsermayenin yıllık getiri oranıdır. AGESA %70+ ROE ile sektörünün zirvesindedir.',
    },
    combined_ratio: {
      formula: 'Kombine Oran = Hasar / Prim Oranı + Masraf Oranı (%)',
      benchmark: '< %100: Esas Faaliyet Teknik Kârı | > %100: Teknik Zarar',
      desc: 'Sigorta şirketinin prim üretiminden hasar ve operasyonel giderleri düştükten sonra teknik kâr edip etmediğini gösteren en hayati metriktir.',
    },
    loss_ratio: {
      formula: 'Hasar Oranı = Ödenen ve Muallak Hasarlar / Net Kazanılan Primler (%)',
      benchmark: 'Hedef: < %75',
      desc: 'Toplanan primlerin hasar tazminatlarına giden payı.',
    },
    expense_ratio: {
      formula: 'Masraf Oranı = Faaliyet Giderleri / Net Kazanılan Primler (%)',
      benchmark: 'Hedef: < %22',
      desc: 'Acente, komisyon ve genel yönetim giderlerinin primlere oranı.',
    },
  };

  // Bilanço Tablosu Bölümleri (Görsel 1 & Açılıp Kapanır Başlıklar - İlave 4)
  const balanceSheetSections: TableSectionConfig[] = [
    {
      title: currentSector === 'BANKING' ? 'Nakit, Likidite & Krediler' : 'Cari Varlıklar (Dönen Varlıklar)',
      categoryKey: 'bs_current',
      rows: [
        { label: 'Nakit ve Nakit Benzeri Varlıklar', sublabel: 'Kasa, Banka ve Kısa Vadeli Mevduatlar', key: 'cash_and_equivalents', fallbackKey: 'cash', isHeader: false },
        { 
          label: currentSector === 'INSURANCE' 
            ? 'Finansal Varlıklar ile Riski Sigortalılara Ait Yatırımlar' 
            : (currentSector === 'BANKING' ? 'Menkul Değerler & Finansal Varlıklar' : 'Finansal Yatırımlar'), 
          sublabel: currentSector === 'INSURANCE' 
            ? 'BES ve Hayat Katılımcılarına Ait Portföy Yatırımları' 
            : 'Kısa Vadeli Menkul Kıymetler & Finansal Araçlar', 
          key: 'financial_assets_insured', 
          fallbackKey: 'financial_investments',
          isHeader: false 
        },
        { 
          label: currentSector === 'BANKING' ? 'Krediler ve Alacaklar' : 'Esas Faaliyetlerden Alacaklar', 
          sublabel: currentSector === 'BANKING' ? 'Müşterilere Verilen Krediler Bakiyesi' : 'Poliçe ve Ticari Alacak Bakiyesi', 
          key: 'trade_receivables', 
          fallbackKey: 'receivables',
          isHeader: false 
        },
        { 
          label: currentSector === 'BANKING' ? 'Toplam Likit Varlıklar' : 'Cari Varlıklar (Dönen Varlıklar Toplamı)', 
          sublabel: 'Kısa Vadeli Dönen Varlık Gücü', 
          key: 'current_assets', 
          isHeader: true, 
          highlight: true 
        },
      ],
    },
    {
      title: currentSector === 'BANKING' ? 'Duran Varlıklar & İştirakler' : 'Cari Olmayan Varlıklar (Duran Varlıklar)',
      categoryKey: 'bs_non_current',
      rows: [
        { 
          label: 'Cari Olmayan Varlıklar Toplamı', 
          sublabel: 'Maddi, Gayrimaddi Duran Varlıklar ve Uzun Vadeli Yatırımlar', 
          key: 'non_current_assets', 
          fallbackKey: 'fixed_assets',
          isHeader: true, 
          highlight: true 
        },
      ],
    },
    {
      title: 'Bilanço Büyüklüğü (Toplam Aktifler & Özkaynaklar)',
      categoryKey: 'bs_totals',
      rows: [
        { label: 'Toplam Varlıklar (Aktifler)', sublabel: 'Bilanço Büyüklüğü (Aktif Toplamı)', key: 'total_assets', fallbackKey: 'assets', isHeader: true, highlight: true },
        { label: 'Toplam Özkaynaklar', sublabel: 'Ana Ortaklığa Ait Net Özsermaye (Defter Değeri)', key: 'equity', fallbackKey: 'total_equity', isHeader: true, highlight: true },
      ],
    },
  ];

  // Gelir Tablosu Bölümleri (Açılıp Kapanır Başlıklar - İlave 4)
  const incomeStatementSections: TableSectionConfig[] = currentSector === 'INSURANCE' ? [
    {
      title: 'Prim Üretimi & Teknik Gelirler',
      categoryKey: 'is_premiums',
      rows: [
        { label: 'Brüt Yazılan Primler (Prim Üretimi)', sublabel: 'Doğrudan ve Dolaylı Yazılan Primler', key: 'revenue', fallbackKey: 'written_premiums', isHeader: true },
        { label: 'Net Kazanılan Primler', sublabel: 'Devreden Karşılıklar Sonrası Net Primler', key: 'earned_premiums', isHeader: false },
      ],
    },
    {
      title: 'Teknik Kârlılık & Operasyonel Denge',
      categoryKey: 'is_technical',
      rows: [
        { label: 'Teknik Bölüm Dengesi / Kârı', sublabel: 'Hasar ve Masraflar Sonrası Esas Sigortacılık Kârı', key: 'ebitda', fallbackKey: 'technical_profit', isHeader: true, highlight: true },
      ],
    },
    {
      title: 'Yatırım & Portföy Gelirleri (Net)',
      categoryKey: 'is_investment',
      rows: [
        { label: 'Yatırım & Portföy Gelirleri (Net)', sublabel: 'Float ve Portföy Faiz/Kupon/Temettü Kazançları', key: 'investment_income', isHeader: false },
      ],
    },
    {
      title: 'Dönem Net Kârı',
      categoryKey: 'is_net_income',
      rows: [
        { label: 'Net Dönem Kârı', sublabel: 'Ana Ortaklık Net Kârı', key: 'net_income', isHeader: true, highlight: true },
      ],
    },
  ] : currentSector === 'BANKING' ? [
    {
      title: 'Net Faiz Geliri & Aracılık Kazançları',
      categoryKey: 'is_revenue',
      rows: [
        { label: 'Net Faiz Geliri (NII)', sublabel: 'Kredi Faiz Gelirleri - Mevduat Faiz Giderleri', key: 'revenue', isHeader: true },
      ],
    },
    {
      title: 'Faaliyet Kârı (Provizyon Öncesi)',
      categoryKey: 'is_ebitda',
      rows: [
        { label: 'Operasyonel Faaliyet Kârı', sublabel: 'Net Faiz + Net Ücret ve Komisyon Gelirleri', key: 'ebitda', isHeader: true, highlight: true },
      ],
    },
    {
      title: 'Dönem Net Kârı & Bankacılık Rasyoları',
      categoryKey: 'is_margins',
      rows: [
        { label: 'Net Dönem Kârı', sublabel: 'Ana Ortaklık Net Kârı', key: 'net_income', isHeader: true, highlight: true },
        { label: 'Net Faiz Marjı (NIM %)', sublabel: 'Net Faiz Geliri / Faiz Getirili Aktifler', key: 'net_margin', isMargin: true, prefix: '%', isHeader: false },
        { label: 'Özkaynak Kârlılığı (ROE %)', sublabel: 'Yıllıklandırılmış Net Kâr / Özkaynaklar', key: 'roe', isMargin: true, prefix: '%', isHeader: false },
      ],
    },
  ] : [
    {
      title: 'Satış Gelirleri & Hasılat',
      categoryKey: 'is_revenue',
      rows: [
        { label: 'Satış Gelirleri (Hasılat)', sublabel: 'Net Satışlar / Toplam Gelir', key: 'revenue', isHeader: true },
      ],
    },
    {
      title: 'Operasyonel Kârlılık (FAVÖK)',
      categoryKey: 'is_ebitda',
      rows: [
        { label: 'FAVÖK (EBITDA)', sublabel: 'Faiz, Amortisman ve Vergi Öncesi Kâr', key: 'ebitda', isHeader: true, highlight: true },
      ],
    },
    {
      title: 'Dönem Net Kârı & Marjlar',
      categoryKey: 'is_margins',
      rows: [
        { label: 'Net Dönem Kârı', sublabel: 'Ana Ortaklık Net Kârı', key: 'net_income', fallbackKey: 'net_profit', isHeader: true, highlight: true },
        { label: 'Brüt Kâr Marjı', sublabel: 'Brüt Kâr / Hasılat', key: 'gross_margin', isMargin: true, prefix: '%', isHeader: false },
        { label: 'FAVÖK Marjı', sublabel: 'FAVÖK / Hasılat', key: 'ebitda_margin', isMargin: true, prefix: '%', isHeader: false },
        { label: 'Net Kâr Marjı', sublabel: 'Net Kâr / Hasılat', key: 'net_margin', isMargin: true, prefix: '%', isHeader: false },
      ],
    },
  ];

  // Nakit Akış Tablosu Bölümleri (Açılıp Kapanır Başlıklar - İlave 4)
  const cashFlowSections: TableSectionConfig[] = [
    {
      title: 'İşletme Faaliyetleri Nakit Akışı',
      categoryKey: 'cf_operating',
      rows: [
        { label: 'İşletme Faaliyetlerinden Nakit Akışı (OCF)', sublabel: 'Esas Faaliyetlerden Elde Edilen Gerçek Nakit', key: 'operating_cash_flow', fallbackKey: 'ocf', isHeader: true },
      ],
    },
    {
      title: 'Yatırım Harcamaları & CAPEX',
      categoryKey: 'cf_capex',
      rows: [
        { label: 'Yatırım Harcamaları (CAPEX)', sublabel: 'Maddi & Gayrimaddi Varlık Alımları', key: 'capex', fallbackKey: 'capital_expenditures', isHeader: false, invert: true },
      ],
    },
    {
      title: 'Serbest Nakit Akışı & Borçluluk',
      categoryKey: 'cf_free_cash',
      rows: [
        { label: 'Serbest Nakit Akışı (FCF)', sublabel: 'OCF - CAPEX (Hissedara Kalan Net Nakit)', key: 'free_cash_flow', fallbackKey: 'fcf', isHeader: true, highlight: true },
        { label: 'Net Finansal Borç / (Nakit Fazlası)', sublabel: 'Finansal Borçlar - Nakit ve Nakit Benzerleri', key: 'net_debt', isHeader: false, invert: true },
      ],
    },
  ];

  // Rasyolar Tablosu Bölümleri (Görsel 3 & İlave 4 & İlave 7)
  const ratioSections: RatioSectionConfig[] = [
    {
      title: 'Likidite Oranları',
      categoryKey: 'LIKIDITE',
      rows: [
        { label: 'Cari Oran', key: 'current_ratio', isRatio: true, defaultVal: 3.54 },
        { label: 'Likidite Oranı', key: 'quick_ratio', isRatio: true, defaultVal: 3.54 },
        { label: 'Nakit Oran', key: 'cash_ratio', isRatio: true, defaultVal: 0.71 },
      ],
    },
    {
      title: 'Kaldıraç Oranları',
      categoryKey: 'KALDIRAC',
      rows: [
        { label: 'Kaldıraç Oranı', key: 'leverage_ratio', isPercent: true, defaultVal: 97.59 },
      ],
    },
    {
      title: 'Faaliyet Etkinlik Oranları',
      categoryKey: 'FAALIYET',
      rows: [
        { label: 'Aktif Devir Hızı', key: 'asset_turnover', isRatio: true, defaultVal: 0.11 },
        { label: 'Özkaynak Devir Hızı', key: 'equity_turnover', isRatio: true, defaultVal: 4.69 },
      ],
    },
    {
      title: 'Karlılık Oranları',
      categoryKey: 'KARLILIK',
      rows: [
        { label: 'Aktif Karlılık (ROA)', key: 'roa', isPercent: true, defaultVal: 1.60 },
        { label: 'Özkaynak Karlılığı (ROE)', key: 'roe', isPercent: true, defaultVal: 70.45 },
      ],
    },
    ...(currentSector === 'INSURANCE' ? [{
      title: 'Sigortacılık & Teknik Oranlar',
      categoryKey: 'SIGORTA',
      rows: [
        { label: 'Hasar / Prim Oranı (Loss Ratio)', key: 'loss_ratio', isPercent: true, defaultVal: 68.20 },
        { label: 'Masraf Oranı (Expense Ratio)', key: 'expense_ratio', isPercent: true, defaultVal: 20.20 },
        { label: 'Kombine / Bileşik Oran (Combined Ratio)', key: 'combined_ratio', isPercent: true, defaultVal: 88.40 },
      ],
    }] : []),
  ];

  // Aktif Kategori Filtresi Uygulanmış Rasyo Bölümleri (İlave 7: Cari Oranlar vb.)
  const filteredRatioSections = ratioCategoryFilter === 'ALL'
    ? ratioSections
    : ratioSections.filter(s => s.categoryKey === ratioCategoryFilter);

  // Aktif alt sekmeye ait tüm başlık anahtarları (Tümünü Aç/Kapat için)
  const currentSubTabSections = 
    tableSubTab === 'bilanco' ? balanceSheetSections.map(s => s.categoryKey) :
    tableSubTab === 'gelir' ? incomeStatementSections.map(s => s.categoryKey) :
    tableSubTab === 'nakit' ? cashFlowSections.map(s => s.categoryKey) :
    filteredRatioSections.map(s => s.categoryKey);

  // Pros & Cons Verisi
  const prosConsData = currentExtractedData?.pros_cons || {
    pros: [
      {
        title: currentSector === 'INSURANCE' ? 'Bireysel Emeklilikte (BES) Genişleyen Fon Büyüklüğü (AUM)' : 'Yüksek İhracat Payı ve Döviz Gelir Gücü',
        desc: currentSector === 'INSURANCE' ? 'Yönetilen fon büyüklüğündeki düzenli artış, öngörülebilir fon yönetim gelirleri üretmektedir.' : 'Esnek fiyatlama ve döviz bazlı sözleşmeler enflasyonist ortamda ciro büyümesini destekliyor.',
      },
      {
        title: currentSector === 'INSURANCE' ? 'Yüksek Faiz Ortamında Güçlü Portföy Getirisi (Float)' : 'Pozitif Serbest Nakit Akışı (FCF)',
        desc: currentSector === 'INSURANCE' ? 'Prim rezervlerinin yüksek mevduat ve tahvil faizleriyle değerlendirilmesi net kârı belirgin besliyor.' : 'Şirket yatırımlarını kendi yarattığı işletme nakdiyle finanse edebilmektedir.',
      },
      {
        title: currentSector === 'INSURANCE' ? 'Sektörün Zirvesinde Özkaynak Kârlılığı (ROE %70+)' : 'Sermaye Maliyetinin Üzerinde Getiri (ROIC > WACC)',
        desc: currentSector === 'INSURANCE' ? 'Düşük sermaye yoğunluğu ve yüksek çarpan gücü ile hissedar için olağanüstü değer yaratımı.' : 'Yatırılan her 100 TL sermaye, ağırlıklı borç ve özsermaye maliyetini aşan net getiri üretiyor.',
      },
      {
        title: currentSector === 'INSURANCE' ? 'Kombine Oranda Disiplinli Teknik Kârlılık (<%90)' : 'Düşük Kaldıraç ve Güçlü Bilanço Likiditesi',
        desc: currentSector === 'INSURANCE' ? 'Kombine oranın %100 altında kalması hasar kontrolünün disiplinli olduğunu kanıtlar.' : 'Net finansal borcun FAVÖK\'e oranı güvenli bölgede yer alıyor.',
      },
    ],
    cons: [
      {
        title: currentSector === 'INSURANCE' ? 'TCMB Faiz İndirim Döngüsünde Portföy Getiri Yavaşlaması Riski' : 'Yüksek Finansman Maliyetleri ve Faiz Baskısı',
        desc: currentSector === 'INSURANCE' ? 'Faiz oranlarının gerilemesiyle yeni menkul kıymet kupon ve mevduat getirileri azalabilir.' : 'Yüksek TL kredi faizleri borç çevrim maliyetini artırmaktadır.',
      },
      {
        title: currentSector === 'INSURANCE' ? 'Medikal ve Asgari Ücret Enflasyonunun Hasar Maliyetlerine Baskısı' : 'İç Pazar Talep Daralması',
        desc: currentSector === 'INSURANCE' ? 'Tazminat ödemelerinde reel maliyet artışları teknik kâr marjlarını törpüleyebilir.' : 'Sıkı para politikası kaynaklı yerel tüketici talebinde ivme kaybı riski.',
      },
      {
        title: currentSector === 'INSURANCE' ? 'Mevzuat ve BES Kesinti Tavanı Düzenleme Riskleri' : 'Hammadde ve Enerji Fiyat Volatilitesi',
        desc: currentSector === 'INSURANCE' ? 'Düzenleyici kurumların fon kesinti tavanlarına yönelik yapabileceği olası revizyonlar.' : 'Emtia maliyetlerindeki dalgalanmalar brüt kâr marjında dalgalanma yaratabilir.',
      },
    ],
  };

  // Dinamik Değer Sürücüleri ve Değerleme Hesaplaması (Item 2 & 3: Tek ve Tutarlı Kaynak)
  const dynamicValuationResult = useMemo(() => {
    return computeSectorValuationAndDrivers(
      currentExtractedData,
      activeReport?.price || price,
      currentSector
    );
  }, [currentExtractedData, activeReport?.price, price, currentSector]);

  // Rapor metninde önceden yazılmış adil değer varsa (Item 2: Rapor ile Kart Uyuşmazlığını Sıfırlama)
  const reportValuation = useMemo(() => {
    const numPrice = parseFloat(activeReport?.price || price || '0');
    return extractValuationFromReportText(activeReport?.report || '', numPrice);
  }, [activeReport?.report, activeReport?.price, price]);

  const drivers: FairValueDrivers = (currentExtractedData?.fair_value_drivers?.revenue_growth?.value != null)
    ? currentExtractedData.fair_value_drivers
    : dynamicValuationResult.drivers;

  const valuationInfo: ValuationMetrics = {
    ...dynamicValuationResult.valuation,
    ...(currentExtractedData?.valuation || {}),
    ...(reportValuation || {}),
    current_price: parseFloat(activeReport?.price || price || '118.50') || 118.50,
  };

  // Tutarlılık (Item 6 & 7): Rapor metninde veya çıkarılan veride geçerli bir adil değer varsa kullan
  if (reportValuation?.fair_value && reportValuation.fair_value > 10) {
    valuationInfo.fair_value = reportValuation.fair_value;
  } else if (!valuationInfo.fair_value || valuationInfo.fair_value <= 10) {
    valuationInfo.fair_value = dynamicValuationResult.valuation.fair_value;
  }

  // Ayı Senaryosu taban fiyatı kontrolü (Çarpan sızıntısı veya aşırı düşük fiyatları engelle)
  if (!valuationInfo.bear_price || valuationInfo.bear_price < valuationInfo.fair_value * 0.35 || valuationInfo.bear_price > valuationInfo.fair_value * 1.05) {
    valuationInfo.bear_price = Number((valuationInfo.fair_value * 0.75).toFixed(2));
  }

  // Boğa Senaryosu tavan fiyatı kontrolü (Adil değerden düşük olamaz)
  if (!valuationInfo.bull_price || valuationInfo.bull_price < valuationInfo.fair_value * 1.05) {
    valuationInfo.bull_price = Number((valuationInfo.fair_value * 1.25).toFixed(2));
  }

  // İskonto oranını ve güvenlik marjını matematiksel olarak tutarlı güncelle
  if (valuationInfo.fair_value && valuationInfo.current_price) {
    valuationInfo.discount_pct = Number((((valuationInfo.fair_value - valuationInfo.current_price) / valuationInfo.current_price) * 100).toFixed(1));
    valuationInfo.margin_of_safety = valuationInfo.discount_pct > 0 ? valuationInfo.discount_pct : 0;
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col md:flex-row font-sans">
      
      {/* Sol Kenar Çubuğu: Arşiv & Skor Takibi (Item 6: Katlanabilir ve Sabitlenebilir Kenar Çubuğu) */}
      <aside 
        className={`border-r border-slate-800 bg-[#0F172A]/90 flex flex-col flex-shrink-0 transition-all duration-300 print:hidden ${
          isSidebarCollapsed ? 'w-full md:w-16' : 'w-full md:w-80'
        }`}
      >
        {/* Logo ve Başlık */}
        <div className="p-3 sm:p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <FairValueLogo className="w-8 h-8" />
            {!isSidebarCollapsed && (
              <div className="min-w-0">
                <div className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1">
                  FAIR <span className="text-emerald-400">VALUE</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate">Terminal & Arşiv</div>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {!isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => setIsSidebarPinned(p => !p)}
                className={`p-1.5 rounded transition cursor-pointer ${
                  isSidebarPinned ? 'text-emerald-400 bg-emerald-950/60' : 'text-slate-400 hover:text-white bg-slate-800/60'
                }`}
                title={isSidebarPinned ? 'Kenar Çubuğu Sabitlendi' : 'Kenar Çubuğu Sabitliğini Kaldır'}
              >
                {isSidebarPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(c => !c)}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700 rounded transition cursor-pointer"
              title={isSidebarCollapsed ? 'Kenar Çubuğunu Genişlet' : 'Kenar Çubuğunu Daralt'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4 text-emerald-400" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Daraltılmış Modda İkon Çubuğu */}
        {isSidebarCollapsed ? (
          <div className="flex-1 flex flex-col items-center py-4 space-y-2">
            <div className="flex-1 overflow-y-auto space-y-2 w-full px-2 [scrollbar-width:none]">
              {savedReports.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setActiveReportId(item.id); setStep('report'); }}
                  className={`w-full py-2 rounded flex flex-col items-center justify-center font-bold text-[10px] transition cursor-pointer border ${
                    activeReportId === item.id && step === 'report'
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                  title={`${item.ticker} - ${item.decision} (${item.score || 'N/A'}/100)`}
                >
                  <span className="truncate max-w-[40px]">{item.ticker.slice(0, 4)}</span>
                  <span className={`text-[8px] mt-0.5 px-1 rounded ${
                    item.decision === 'AL' ? 'text-emerald-400' :
                    item.decision === 'ALMA' ? 'text-rose-400' : 'text-slate-400'
                  }`}>
                    {item.decision}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Sıralama Filtresi & Kayıtlı Analiz Sayacı (Item 1 & 2: Hazır Örnek ve Mükerrer Butonlar Kaldırıldı) */}
            <div className="p-3 border-b border-slate-800/80 bg-slate-950/40">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  Kayıtlı Analizler ({savedReports.length})
                </span>
                <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSidebarSort('rank')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                      sidebarSort === 'rank' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    AL & Puan
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarSort('date')}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                      sidebarSort === 'date' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Tarih
                  </button>
                </div>
              </div>
            </div>

            {/* Kayıtlı Raporlar Listesi */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {savedReports.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Henüz kayıtlı rapor yok.
                </div>
              ) : (
                (sidebarSort === 'rank' ? sortReportsByRank(savedReports) : sortReportsByDate(savedReports)).map((item, sIndex) => (
                  <div
                    key={item.id}
                    onClick={() => { setActiveReportId(item.id); setStep('report'); }}
                    className={`p-2.5 rounded-lg border cursor-pointer transition flex items-center justify-between group ${
                      activeReportId === item.id && step === 'report'
                        ? 'bg-slate-800 border-emerald-500/50 shadow-md shadow-emerald-950/20'
                        : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {sidebarSort === 'rank' && (
                          <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-950 px-1 rounded border border-slate-800">
                            #{sIndex + 1}
                          </span>
                        )}
                        <span className="font-bold text-sm text-white truncate">{item.ticker}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          item.decision === 'AL' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                          item.decision === 'ALMA' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {item.decision}
                        </span>
                        {item.score && <span className="text-[10px] text-slate-400 font-mono font-semibold">{item.score}/100</span>}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                        {item.period && <span className="text-emerald-400 font-mono font-semibold">{item.period}</span>}
                        <span>• {item.createdAt}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => deleteReport(item.id, e)}
                        title="Raporu Sil"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Yedek Al / İçe Aktar */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={exportBackup}
                disabled={savedReports.length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 py-2 px-2.5 rounded border border-slate-700 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                Yedek Al
              </button>
              <label
                className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 py-2 px-2.5 rounded border border-slate-700 transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-cyan-400" />
                İçe Aktar
                <input
                  type="file"
                  accept="application/json"
                  onChange={importBackup}
                  className="hidden"
                />
              </label>
            </div>
          </>
        )}
      </aside>

      {/* Sağ Ana Bölüm */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="border-b border-slate-800 p-4 flex items-center justify-between bg-[#0F172A]/50 print:hidden">
          <div className="flex items-center gap-3">
            <FairValueLogo className="w-9 h-9" />
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>FAIR <span className="text-emerald-400">VALUE</span></span>
                <span className="text-slate-500 font-normal">|</span>
                <span className="text-slate-200 font-semibold text-sm">Finansal Analiz & Değerleme Terminali</span>
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded font-bold">PRO</span>
                {isCloudConfigured ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded" title="Supabase Bulut Aktif">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Bulut Aktif
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-800/80 text-slate-400 border border-slate-700 px-2 py-0.5 rounded">
                    Yerel Depolama
                  </span>
                )}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep('leaderboard')}
              className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg border font-semibold transition cursor-pointer ${
                step === 'leaderboard'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/30'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              Sıralama Paneli
            </button>

            <button
              onClick={() => { setStep('input'); setActiveReportId(null); }}
              className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg border font-semibold transition cursor-pointer ${
                step === 'input'
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Yeni Analiz
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1720px] mx-auto space-y-6">
          
          {/* ADIM 1: GİRİŞ FORMU VE SEKTÖR SEÇİCİ */}
          {step === 'input' && (
            <form onSubmit={handleExtract} className="space-y-6 bg-[#111827]/70 border border-slate-800 p-6 md:p-8 rounded-xl shadow-xl">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-sm text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" /> 1. Aşama: Şirket Bilgileri & Doküman Yükleme
                </span>
                <span className="text-xs text-emerald-400 font-mono bg-emerald-950/80 border border-emerald-800 px-2.5 py-0.5 rounded">
                  Mod: Çok Dönemli & Sektöre Duyarlı
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Hisse Kodu (Ticker)</label>
                  <input
                    type="text"
                    value={ticker}
                    onChange={e => setTicker(e.target.value)}
                    required
                    placeholder="Örn: AGESA, THYAO, FROTO"
                    className="w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-md p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none uppercase font-bold tracking-wider"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Güncel Fiyat (TL)</label>
                  <input
                    type="number"
                    step="any"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    required
                    placeholder="Örn: 118.50"
                    className="w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-md p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Sektör Değerleme Modu</label>
                  <select
                    value={selectedSector}
                    onChange={e => setSelectedSector(e.target.value as any)}
                    className="w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-md p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="AUTO">Otomatik Sektör Tespiti (Akıllı Mod)</option>
                    <option value="INSURANCE">Sigortacılık & Emeklilik (Hayat & BES)</option>
                    <option value="BANKING">Bankacılık & Finans</option>
                    <option value="INDUSTRIAL">Sanayi, Hizmet & Genel Ticaret</option>
                  </select>
                </div>
              </div>

              {/* Sektörel Bilgilendirme Kutusu */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg flex items-start gap-3 text-xs text-slate-300">
                <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-white">Sektöre Özgü Finansal Analiz Mimarisi</div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Sistem <strong>AGESA, ANHYT, TURSG</strong> gibi sigorta şirketlerini algıladığında klasik FAVÖK ve Net Borç yerine; 
                    <strong> Prim Üretimi, Teknik Bölüm Dengesi, Kombine Oran, Yatırım Portföyü ve Özkaynak Kârlılığı (ROE)</strong> dinamiklerini değerlendirir.
                  </p>
                </div>
              </div>

              {/* PDF Yükleme Alanı */}
              <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/80 rounded-xl p-6 text-center bg-slate-950/40 transition">
                <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <label className="block text-xs font-bold text-white cursor-pointer hover:underline mb-1">
                  Çok Yıllı Faaliyet Raporları ve Finansal Tabloları Seçin (PDF)
                  <input
                    type="file"
                    multiple
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-slate-400">
                  Birden fazla dönemi aynı anda seçerek yükleyebilirsiniz.
                </p>

                {files.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {files.map((f, i) => (
                      <span key={i} className="text-xs bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-1 rounded flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-400" />
                        {f.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || files.length === 0}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-lg"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> {statusMessage}
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4" /> Finansal Verileri Tara ve Ayıkla (Aşama 1)
                  </>
                )}
              </button>
            </form>
          )}

          {/* ADIM 2: ÇIKARILAN VERİLERİ İNCELEME & ONAYLAMA */}
          {step === 'review' && extractedData && (
            <div className="space-y-6 bg-[#111827]/70 border border-slate-800 p-6 md:p-8 rounded-xl shadow-xl">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 2. Aşama: Çıkarılan Zaman Serisi Verilerini Doğrulayın
                  </span>
                  <p className="text-xs text-slate-400 mt-1">Veriler PDF raporlarından otomatik ayıklanmıştır.</p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 text-emerald-400 border border-slate-700 font-bold">
                  {extractedData.ticker} • {currentSector}
                </span>
              </div>

              {/* Özet Çıkarım Tablosu */}
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead className="bg-slate-800 text-slate-200">
                    <tr>
                      <th className="p-3">Dönem</th>
                      <th className="p-3 text-right">{currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Hasılat'}</th>
                      <th className="p-3 text-right">{currentSector === 'INSURANCE' ? 'Teknik Kâr' : 'FAVÖK'}</th>
                      <th className="p-3 text-right">Net Kâr</th>
                      <th className="p-3 text-right">{currentSector === 'INSURANCE' ? 'Kombine Oran' : 'FAVÖK Marjı'}</th>
                      <th className="p-3 text-right">{currentSector === 'INSURANCE' ? 'ROE (%)' : 'ROIC (%)'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {extractedData.financial_history?.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-white flex items-center gap-1.5">
                          <span>{row.period}</span>
                          {row.is_tms29 && (
                            <span className="text-[9px] font-sans font-bold px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-800" title="TMS 29 Enflasyon Muhasebesi Düzeltmesi">
                              TMS 29
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right text-slate-200">{formatAmount(row.revenue, 'bin')}</td>
                        <td className="p-3 text-right text-slate-200">{formatAmount(row.ebitda, 'bin')}</td>
                        <td className="p-3 text-right text-slate-200">{formatAmount(row.net_income, 'bin')}</td>
                        <td className="p-3 text-right text-slate-200">
                          %{row.combined_ratio ?? row.ebitda_margin ?? '—'}
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-400">
                          %{row.roe ?? row.roic ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Çeyreklik Skor Tahmini Öncesi Pros & Cons Çalışması Seçeneği (İlave 6) */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeProsConsInReview}
                      onChange={e => setIncludeProsConsInReview(e.target.checked)}
                      className="w-4 h-4 text-emerald-500 rounded bg-slate-900 border-slate-700 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Çeyreklik Skor Tahmini Öncesi Pros / Cons (Güçlü ve Zayıf Yönler) Çalışmasını Dahil Et
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        Skor hesaplamasından önce boğa katalizörleri ve ayı risk faktörlerini inceler ve rapora entegre eder.
                      </span>
                    </div>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowProsConsPreviewInReview(!showProsConsPreviewInReview)}
                    className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 border border-cyan-800/80 px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    {showProsConsPreviewInReview ? 'Önizlemeyi Gizle ▲' : 'Ön Değerlendirmeyi İncele ▼'}
                  </button>
                </div>

                {showProsConsPreviewInReview && (
                  <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Güçlü Yönler (Pros) */}
                    <div className="bg-emerald-950/20 border border-emerald-900/50 rounded-lg p-3 space-y-2">
                      <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" /> Boğa Katalizörleri (Pros)
                      </div>
                      <ul className="space-y-1.5 text-[11px] text-slate-300">
                        {prosConsData.pros.slice(0, 3).map((p: any, i: number) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-400 font-bold">•</span>
                            <div>
                              <strong className="text-white">{p.title}:</strong> {p.desc}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Zayıf Yönler (Cons) */}
                    <div className="bg-rose-950/20 border border-rose-900/50 rounded-lg p-3 space-y-2">
                      <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                        <ArrowDownRight className="w-4 h-4 text-rose-400" /> Ayı Riskleri (Cons)
                      </div>
                      <ul className="space-y-1.5 text-[11px] text-slate-300">
                        {prosConsData.cons.slice(0, 3).map((c: any, i: number) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-rose-400 font-bold">•</span>
                            <div>
                              <strong className="text-white">{c.title}:</strong> {c.desc}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Geri Dön & Belgeleri Değiştir
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleEvaluate}
                  className="w-2/3 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> {statusMessage}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Sektörel Değerleme Raporunu ve Karnesini Üret
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ADIM 3: RAPOR, GRAFİK TERMİNALİ, FİNANSAL TABLOLAR, ADİL DEĞER VE PROS/CONS */}
          {step === 'report' && activeReport && (
            <div className="space-y-6">

              {/* Üst Hisse Özet Bilgi Kartı */}
              <div className="bg-[#111827]/80 border border-slate-800 p-5 rounded-xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center font-black text-xl text-white font-mono shadow-inner">
                    {activeReport.ticker.slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-black text-white tracking-tight">{activeReport.ticker}</h2>
                      <span className="text-xs font-mono font-bold text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                        {activeReport.price} TL
                      </span>
                      {valuationInfo?.fair_value != null && (
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-950/30">
                          Adil Değer: {typeof valuationInfo.fair_value === 'number' ? valuationInfo.fair_value.toFixed(2) : valuationInfo.fair_value} TL
                        </span>
                      )}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                        activeReport.decision === 'AL'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800 shadow-sm shadow-emerald-950/40'
                          : activeReport.decision === 'ALMA'
                          ? 'bg-rose-950 text-rose-400 border-rose-800 shadow-sm shadow-rose-950/40'
                          : 'bg-amber-950 text-amber-400 border-amber-800 shadow-sm shadow-amber-950/40'
                      }`}>
                        {activeReport.decision}
                      </span>
                      {activeReport.rawDecision && activeReport.rawDecision !== activeReport.decision && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950/70 text-rose-300 border border-rose-800 line-through" title="Güvenlik kalkanı öncesi model önerisi">
                          {activeReport.rawDecision}
                        </span>
                      )}
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800">
                        {sectorMeta.badge}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                      <span>Rapor Dönemi: {activeReport.period || '2026/Q2'}</span>
                      <span>•</span>
                      <span>{activeReport.createdAt}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {activeReport.score && (
                    <div className="text-right bg-slate-950 border border-slate-800 px-4 py-2 rounded-lg">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Kurumsal Skor</div>
                      <div className="text-2xl font-black font-mono text-emerald-400">{activeReport.score} <span className="text-xs text-slate-500 font-normal">/ 100</span></div>
                    </div>
                  )}
                  <button
                    onClick={() => deleteReport(activeReport.id)}
                    className="p-2.5 bg-rose-950/50 hover:bg-rose-900 text-rose-400 hover:text-white rounded-lg border border-rose-900 transition cursor-pointer text-xs"
                    title="Raporu Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Güvenlik Kalkanı: False-Positive / Karar Revizyon Uyarısı */}
              {activeReport.overrideReason && (
                <div className="bg-rose-950/30 border border-rose-800/70 rounded-xl p-4 flex items-start gap-3 shadow-lg">
                  <div className="p-2 rounded-lg bg-rose-900/50 text-rose-300 flex-shrink-0">
                    <ShieldCheck className="w-5 h-5 text-rose-300" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-rose-200 flex items-center gap-2">
                      <span>Model Kararı Güvenlik Kalkanı Tarafından Revize Edildi</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-900/80 text-rose-200 border border-rose-700">
                        İlk Karar: {activeReport.rawDecision || 'AL'} ➔ Nihai Karar: {activeReport.decision}
                      </span>
                    </div>
                    <p className="text-xs text-rose-300/90 leading-relaxed">
                      {activeReport.overrideReason}
                    </p>
                  </div>
                </div>
              )}

              {/* Koşullu Analiz / Gri Alan Uyarısı */}
              {activeReport.conditionalWarnings && activeReport.conditionalWarnings.length > 0 && (
                <div className="bg-amber-950/25 border border-amber-800/60 rounded-xl p-4 flex items-start gap-3 shadow-md">
                  <div className="p-2 rounded-lg bg-amber-900/50 text-amber-300 flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-300" />
                  </div>
                  <div className="space-y-1.5 w-full">
                    <div className="text-sm font-bold text-amber-200 flex items-center justify-between">
                      <span>Koşullu Analiz & Gri Alan Uyarısı</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700">
                        Sınır Koşulları Mevcut
                      </span>
                    </div>
                    <ul className="text-xs text-amber-300/90 space-y-1 list-disc list-inside">
                      {activeReport.conditionalWarnings.map((w: string, idx: number) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* ANA SEKME NAVİGASYONU */}
              <div className="flex border-b border-slate-800 gap-1 overflow-x-auto print:hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'overview'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BarChart3 className="w-4 h-4" /> 1. Grafik Terminali
                </button>
                <button
                  onClick={() => setActiveTab('fairvalue')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'fairvalue'
                      ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Target className="w-4 h-4" /> 2. Adil Değer & Sürücüler
                </button>
                <button
                  onClick={() => setActiveTab('tables')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'tables'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4" /> 3. Finansal Tablolar & Dinamikler
                </button>
                <button
                  onClick={() => setActiveTab('proscons')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'proscons'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-4 h-4" /> 4. Güçlü / Zayıf Yönler (Pros/Cons)
                </button>
                <button
                  onClick={() => setActiveTab('guidance')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'guidance'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Activity className="w-4 h-4" /> 5. Yönetim Rehberlik Karnesi
                </button>
                <button
                  onClick={() => setActiveTab('report')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'report'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4" /> 6. Değerleme Raporu
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'history'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <History className="w-4 h-4" /> 7. Çeyreklik Skor Takibi ({tickerHistory.length})
                </button>
              </div>

              {/* SEKME 1: GRAFİK TERMİNALİ (GÖRSEL 4 - 4'LÜ IZGARA) */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {chartData.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800 text-sm">
                      Grafik verisi bulunamadı.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                      {/* Grafik 1: Büyüme Trendi: Satışlar ve Karlılık (Görsel 4 Sol Üst) */}
                      <div className="bg-[#111827]/90 border border-slate-800 p-5 rounded-xl space-y-4 shadow-lg">
                        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                          <div className="p-2 rounded-lg bg-blue-600 text-white shadow-md shadow-blue-900/40">
                            <BarChart3 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                              Büyüme Trendi: {currentSector === 'INSURANCE' ? 'Prim Üretimi ve Karlılık' : 'Satışlar ve Karlılık'}
                            </span>
                            <p className="text-[11px] text-slate-400">
                              (Yıllıklandırılmış) {currentSector === 'INSURANCE' ? 'Primler, Teknik Kâr ve Net Kâr' : 'Satışlar, FAVÖK ve Net Kâr'}
                            </p>
                          </div>
                        </div>

                        <div className="h-64 w-full">
                          {mounted && (
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                                <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={chartYAxisFormatter} />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Line type="monotone" dataKey="ebitda" name={currentSector === 'INSURANCE' ? '(Yıllık) Teknik Kâr' : '(Yıllık) FAVÖK'} stroke="#f97316" strokeWidth={2.5} dot={{ r: 4, fill: '#f97316' }} />
                                <Line type="monotone" dataKey="net_income" name="(Yıllık) Net Kar" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} />
                                <Bar dataKey="revenue" name={currentSector === 'INSURANCE' ? '(Yıllık) Primler' : '(Yıllık) Satışlar'} fill="#2563eb" radius={[3, 3, 0, 0]} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      {/* Grafik 2: Satışlar ve Hisse Fiyatı (Görsel 4 Sağ Üst) */}
                      <div className="bg-[#111827]/90 border border-slate-800 p-5 rounded-xl space-y-4 shadow-lg">
                        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                          <div className="p-2 rounded-lg bg-blue-600 text-white shadow-md shadow-blue-900/40">
                            <TrendingUp className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                              {currentSector === 'INSURANCE' ? 'Prim Üretimi ve Hisse Fiyatı' : 'Satışlar ve Hisse Fiyatı'}
                            </span>
                            <p className="text-[11px] text-slate-400">
                              Yıllıklandırılmış gelir tabanı ile hisse fiyat performansı korelasyonu
                            </p>
                          </div>
                        </div>

                        <div className="h-64 w-full">
                          {mounted && (
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                                <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={chartYAxisFormatter} />
                                <YAxis yAxisId="right" orientation="right" stroke="#e2e8f0" tick={{ fontSize: 10, fill: '#e2e8f0' }} tickFormatter={v => `${v} TL`} />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Line yAxisId="right" type="monotone" dataKey="share_price" name="Hisse Fiyatı" stroke="#ffffff" strokeWidth={2.5} dot={{ r: 4, fill: '#ffffff' }} />
                                <Bar yAxisId="left" dataKey="revenue" name={currentSector === 'INSURANCE' ? 'Yıllıklandırılmış Primler' : 'Yıllıklandırılmış Satışlar'} fill="#2563eb" radius={[3, 3, 0, 0]} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      {/* Grafik 3: Nakit Akışı Kalitesi (Görsel 4 Sol Alt) */}
                      <div className="bg-[#111827]/90 border border-slate-800 p-5 rounded-xl space-y-4 shadow-lg">
                        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                          <div className="p-2 rounded-lg bg-blue-600 text-white shadow-md shadow-blue-900/40">
                            <Activity className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                              Nakit Akışı Kalitesi
                            </span>
                            <p className="text-[11px] text-slate-400">
                              Net kârın operasyonel nakde (OCF) ve serbest nakde (FCF) dönüşüm gücü
                            </p>
                          </div>
                        </div>

                        <div className="h-64 w-full">
                          {mounted && (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                                <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={chartYAxisFormatter} />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Line type="monotone" dataKey="net_income" name="(Yıllık) Net Kar" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
                                <Line type="monotone" dataKey="operating_cash_flow" name="(Yıllık) Operasyonel Nakit Akışı" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 3, fill: '#06b6d4' }} />
                                <Line type="monotone" dataKey="free_cash_flow" name="(Yıllık) Serbest Nakit Akışı" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6' }} />
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      {/* Grafik 4: Bilanço Gücü: Özsermaye ve Nakit Pozisyonu (Görsel 4 Sağ Alt) */}
                      <div className="bg-[#111827]/90 border border-slate-800 p-5 rounded-xl space-y-4 shadow-lg">
                        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                          <div className="p-2 rounded-lg bg-blue-600 text-white shadow-md shadow-blue-900/40">
                            <ShieldCheck className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                              Bilanço Gücü: Özsermaye ve Nakit Pozisyonu
                            </span>
                            <p className="text-[11px] text-slate-400">
                              Şirketin net varlık (özkaynak) birikimi ve likit rezervlerinin gelişimi
                            </p>
                          </div>
                        </div>

                        <div className="h-64 w-full">
                          {mounted && (
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                                <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                                <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={chartYAxisFormatter} />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Line type="monotone" dataKey="cash_and_equivalents" name="Nakit & Kısa Vadeli Yat." stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 4, fill: '#38bdf8' }} />
                                <Bar dataKey="equity" name="Net Varlık (Özkaynak)" fill="#10b981" radius={[3, 3, 0, 0]} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* SEKME 2: ADİL DEĞER & DEĞER SÜRÜCÜLERİ PANELİ (GÖRSEL 5 & İLAVE 9) */}
              {activeTab === 'fairvalue' && (
                <div className="space-y-6">
                  {/* Başlık Bölümü (Görsel 5 üst metin) */}
                  <div className="bg-[#111827]/80 border border-slate-800 p-5 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-sm font-bold text-white tracking-tight">
                        Değer Sürücüleri • Adil Değeri Ne Belirliyor?
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Adil değer bu girdilerden hesaplanır. Beyaz işaretçi baz varsayımı, renkli bant Ayı ↔ Boğa aralığını gösterir.
                    </p>
                  </div>

                  {/* 4 Değer Sürücüsü Kartı (Görsel 5) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DriverCard
                      title={drivers.revenue_growth.label}
                      valueText={`%${drivers.revenue_growth.value.toFixed(1)}`}
                      pinPercent={calculateDriverPin('rev', drivers.revenue_growth.value, currentSector)}
                      bearText={drivers.revenue_growth.bearLabel}
                      bullText={drivers.revenue_growth.bullLabel}
                      description={drivers.revenue_growth.note}
                      sourceExplanation={drivers.revenue_growth.sourceExplanation}
                    />

                    <DriverCard
                      title={drivers.net_income_growth.label}
                      valueText={`%${drivers.net_income_growth.value.toFixed(1)}`}
                      pinPercent={calculateDriverPin('net', drivers.net_income_growth.value, currentSector)}
                      bearText={drivers.net_income_growth.bearLabel}
                      bullText={drivers.net_income_growth.bullLabel}
                      description={drivers.net_income_growth.note}
                      sourceExplanation={drivers.net_income_growth.sourceExplanation}
                    />

                    <DriverCard
                      title={drivers.margin.label}
                      valueText={`%${drivers.margin.value.toFixed(1)}`}
                      pinPercent={calculateDriverPin('margin', drivers.margin.value, currentSector)}
                      bearText={drivers.margin.bearLabel}
                      bullText={drivers.margin.bullLabel}
                      description={drivers.margin.note}
                      sourceExplanation={drivers.margin.sourceExplanation}
                    />

                    <DriverCard
                      title={drivers.target_multiple.label}
                      valueText={drivers.target_multiple.value}
                      pinPercent={calculateDriverPin('multiple', drivers.target_multiple.numericValue || 3.0, currentSector, drivers.target_multiple.numericValue)}
                      bearText={drivers.target_multiple.bearLabel}
                      bullText={drivers.target_multiple.bullLabel}
                      description={drivers.target_multiple.note}
                      sourceExplanation={drivers.target_multiple.sourceExplanation}
                    />
                  </div>

                  {/* Fiyat & Değerleme Sonuç Kartları */}
                  <div className="bg-[#111827]/90 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
                    <div className="border-b border-slate-800 pb-3 flex items-center justify-between flex-wrap gap-2">
                      <span className="font-bold text-sm text-white flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" /> Piyasa Fiyatı & Adil Değer Potansiyeli
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {activeReport?.marginOfSafetyStatus && (
                          <span className={`text-xs font-mono px-2 py-0.5 rounded font-bold border ${
                            activeReport.marginOfSafetyStatus === 'SAFE'
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                              : activeReport.marginOfSafetyStatus === 'BORDERLINE'
                              ? 'bg-amber-950 text-amber-400 border-amber-800'
                              : 'bg-rose-950 text-rose-400 border-rose-800'
                          }`}>
                            Güvenlik Marjı: {
                              activeReport.marginOfSafetyStatus === 'SAFE' ? 'Yeterli (≥%25)' :
                              activeReport.marginOfSafetyStatus === 'BORDERLINE' ? 'Sınırda (%15-%25)' : 'Yetersiz (<%15)'
                            }
                          </span>
                        )}
                        <span className="text-xs font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded font-bold">
                          Model: {currentSector === 'INSURANCE' ? 'Gordon Büyüme & ROE İskontosu' : 'DCF & Çarpan Hibrit Modeli'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <div className="text-[11px] text-slate-400 font-semibold uppercase">Güncel Piyasa Fiyatı</div>
                        <div className="text-2xl font-black font-mono text-white mt-1">{valuationInfo.current_price} TL</div>
                        <div className="text-[10px] text-slate-500 mt-1">BIST Piyasa Kapanışı</div>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-xl border border-emerald-900/60 shadow-inner">
                        <div className="text-[11px] text-emerald-400 font-semibold uppercase">Hesaplanan Adil Değer</div>
                        <div className="text-2xl font-black font-mono text-emerald-400 mt-1">{valuationInfo.fair_value} TL</div>
                        <div className="text-[10px] text-emerald-300/80 mt-1 font-mono">+{valuationInfo.discount_pct}% İskonto Potansiyeli</div>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <div className="text-[11px] text-slate-400 font-semibold uppercase">Ayı Senaryosu (Taban)</div>
                        <div className="text-2xl font-black font-mono text-amber-400 mt-1">{valuationInfo.bear_price} TL</div>
                        <div className="text-[10px] text-slate-500 mt-1">Düşük Büyüme / Yüksek Faiz</div>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <div className="text-[11px] text-slate-400 font-semibold uppercase">Boğa Senaryosu (Tavan)</div>
                        <div className="text-2xl font-black font-mono text-cyan-400 mt-1">{valuationInfo.bull_price} TL</div>
                        <div className="text-[10px] text-slate-500 mt-1">Yüksek Pazar Payı & İyileşme</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SEKME 3: FİNANSAL TABLOLAR (GÖRSELLER 1, 2, 3) */}
              {activeTab === 'tables' && (
                <div className="space-y-6">

                  {/* Üst Yönetici KPI Kartları (İlave 3: Yıllıklandırılmış ve YoY Aynı Çeyrek Kıyaslaması) */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Kart 1: Ciro / Prim Üretimi */}
                      <div className="bg-[#111827]/90 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow-md">
                        <div>
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>{currentSector === 'INSURANCE' ? 'Prim Üretimi (Hasılat)' : 'Satış Gelirleri'}</span>
                            <span className="text-[10px] font-mono text-slate-500">{latestData?.period || '—'}</span>
                          </div>
                          <div className="text-xl font-black font-mono text-white mt-1">
                            {formatAmount(latestData?.revenue, unitMode, false, '', '', currentExtractedData?.currency)}
                          </div>
                        </div>
                        <div className="pt-2 border-t border-slate-800/80 mt-2 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <ChangeBadge change={yoyRevChange} size="sm" />
                            <span className="text-[10px] text-slate-400 font-medium">
                              {sameQuarterLastYear ? `YoY (${sameQuarterLastYear.period} aynı çeyrek)` : 'Yıllık Büyüme'}
                            </span>
                          </div>
                          {annualizedRevenue && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              Yıllıklandırılmış: <strong className="text-slate-200">{formatAmount(annualizedRevenue, unitMode, false, '', '', currentExtractedData?.currency)}</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Kart 2: Faaliyet Kârı / Teknik Kâr */}
                      <div className="bg-[#111827]/90 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow-md">
                        <div>
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>{currentSector === 'INSURANCE' ? 'Teknik Bölüm Dengesi' : 'FAVÖK (EBITDA)'}</span>
                            <span className="text-[10px] font-mono text-slate-500">{latestData?.period || '—'}</span>
                          </div>
                          <div className="text-xl font-black font-mono text-white mt-1">
                            {formatAmount(latestData?.ebitda, unitMode, false, '', '', currentExtractedData?.currency)}
                          </div>
                        </div>
                        <div className="pt-2 border-t border-slate-800/80 mt-2 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <ChangeBadge change={yoyEbitdaChange} size="sm" />
                            <span className="text-[10px] text-slate-400 font-medium">
                              {sameQuarterLastYear ? `YoY (${sameQuarterLastYear.period} aynı çeyrek)` : 'Yıllık Büyüme'}
                            </span>
                          </div>
                          {annualizedEbitda && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              Yıllıklandırılmış: <strong className="text-slate-200">{formatAmount(annualizedEbitda, unitMode, false, '', '', currentExtractedData?.currency)}</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Kart 3: Net Kâr */}
                      <div className="bg-[#111827]/90 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow-md">
                        <div>
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Net Dönem Kârı</span>
                            <span className="text-[10px] font-mono text-slate-500">{latestData?.period || '—'}</span>
                          </div>
                          <div className="text-xl font-black font-mono text-emerald-400 mt-1">
                            {formatAmount(latestData?.net_income, unitMode, false, '', '', currentExtractedData?.currency)}
                          </div>
                        </div>
                        <div className="pt-2 border-t border-slate-800/80 mt-2 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <ChangeBadge change={yoyNetChange} size="sm" />
                            <span className="text-[10px] text-slate-400 font-medium">
                              {sameQuarterLastYear ? `YoY (${sameQuarterLastYear.period} aynı çeyrek)` : 'Yıllık Büyüme'}
                            </span>
                          </div>
                          {annualizedNet && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              Yıllıklandırılmış: <strong className="text-emerald-300">{formatAmount(annualizedNet, unitMode, false, '', '', currentExtractedData?.currency)}</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Kart 4: Sermaye Verimliliği / ROE & Marj */}
                      <div className="bg-[#111827]/90 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow-md">
                        <div>
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            {currentSector === 'INSURANCE' ? 'Özkaynak Kârlılığı (ROE)' : 'Sermaye Makası (ROIC - WACC)'}
                          </div>
                          <div className="text-xl font-black font-mono text-cyan-400 mt-1">
                            {currentSector === 'INSURANCE' 
                              ? `%${latestData?.roe ?? 70.45}` 
                              : spreadInfo.label}
                          </div>
                        </div>
                        <div className="pt-2 border-t border-slate-800/80 mt-2 space-y-1">
                          <div className="text-[10px] font-semibold text-slate-300">
                            {currentSector === 'INSURANCE'
                              ? `Kombine Oran: %${latestData?.combined_ratio ?? 88.4}`
                              : spreadInfo.badgeText}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {currentSector === 'INSURANCE' ? 'Teknik Kârlılık Disiplini' : `ROIC: %${latestData?.roic || '—'} vs WACC: %${latestData?.wacc || '—'}`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bilgilendirme Notu: Yıllıklandırılmış Metodoloji Açıklaması */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-[11px] text-slate-400">
                      <Info className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                      <span>
                        <strong>Büyüme Metodolojisi:</strong> Dönemsel çeyrek sonuçları önceki yılın aynı çeyreğiyle (YoY) kıyaslanmakta ve yıllıklandırılmaktadır (TTM). Bu sayede ara dönemlerin 12 aylık kümülatiflerle kıyaslanmasından kaynaklanan <em>yanıltıcı zarar algısı</em> önlenmiştir.
                      </span>
                    </div>
                  </div>

                  {/* Üst Çubuk: Sekmeler (Görsel 2) & Tutar Birimi Seçici (İlave 2) */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111827]/80 border border-slate-800 p-3.5 rounded-xl shadow-md">
                    {/* Görsel 2 Alt Sekmeler */}
                    <div className="inline-flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl gap-1">
                      <button
                        type="button"
                        onClick={() => setTableSubTab('bilanco')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          tableSubTab === 'bilanco'
                            ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5 text-slate-300" /> Bilanço
                      </button>
                      <button
                        type="button"
                        onClick={() => setTableSubTab('gelir')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          tableSubTab === 'gelir'
                            ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <PieChart className="w-3.5 h-3.5 text-slate-300" /> Gelir Tablosu
                      </button>
                      <button
                        type="button"
                        onClick={() => setTableSubTab('nakit')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          tableSubTab === 'nakit'
                            ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <DollarSign className="w-3.5 h-3.5 text-slate-300" /> Nakit Akış
                      </button>
                      <button
                        type="button"
                        onClick={() => setTableSubTab('oranlar')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          tableSubTab === 'oranlar'
                            ? 'bg-slate-800 text-cyan-400 border border-cyan-500/40 shadow-sm ring-1 ring-cyan-500/20'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Percent className="w-3.5 h-3.5 text-cyan-400" /> Oranlar
                      </button>
                    </div>

                    {/* Tutar Birimi & Gösterim Seçenekleri (İlave 2 & Görsel 1) */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-400 hidden sm:inline">Birim:</span>
                      <div className="inline-flex items-center p-0.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono">
                        <button
                          type="button"
                          onClick={() => setUnitMode('bin')}
                          className={`px-2 py-1 rounded transition cursor-pointer ${
                            unitMode === 'bin' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Bin TRY
                        </button>
                        <button
                          type="button"
                          onClick={() => setUnitMode('milyon')}
                          className={`px-2 py-1 rounded transition cursor-pointer ${
                            unitMode === 'milyon' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Milyon TRY
                        </button>
                        <button
                          type="button"
                          onClick={() => setUnitMode('tam')}
                          className={`px-2 py-1 rounded transition cursor-pointer ${
                            unitMode === 'tam' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Tam TL
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => collapseAllSections(currentSubTabSections)}
                        className="text-[11px] text-slate-300 hover:text-white bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700 transition cursor-pointer flex items-center gap-1"
                      >
                        <ArrowUpDown className="w-3 h-3 text-emerald-400" /> Tümünü Aç/Kapat
                      </button>
                    </div>
                  </div>

                  {/* Oranlar Alt Sekmesinde Kategori Filtre Butonları (İlave 7: Cari Oranlar vb.) */}
                  {tableSubTab === 'oranlar' && (
                    <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-slate-400 font-semibold mr-1">Rasyo Filtresi:</span>
                        {[
                          { id: 'ALL', label: 'Tüm Oranlar' },
                          { id: 'LIKIDITE', label: 'Likidite & Cari Oranlar' },
                          { id: 'KALDIRAC', label: 'Kaldıraç Oranları' },
                          { id: 'FAALIYET', label: 'Faaliyet Etkinlik' },
                          { id: 'KARLILIK', label: 'Kârlılık Oranları' },
                          ...(currentSector === 'INSURANCE' ? [{ id: 'SIGORTA', label: 'Sigortacılık & Teknik' }] : []),
                        ].map(pill => (
                          <button
                            key={pill.id}
                            type="button"
                            onClick={() => setRatioCategoryFilter(pill.id as any)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                              ratioCategoryFilter === pill.id
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                            }`}
                          >
                            {pill.label}
                          </button>
                        ))}
                      </div>

                      <div className="text-[11px] text-slate-500 font-mono hidden md:block">
                        Satırlara tıklayarak detay ve formülleri inceleyebilirsiniz.
                      </div>
                    </div>
                  )}

                  {/* TABLO KONTEYNERI (Görsel 1 & 3 Tasarımı) */}
                  <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        {/* Başlık Satırı: KALEMLER ve Günümüzden Geçmişe Doğru Dönemler */}
                        <thead className="bg-[#0F172A] text-slate-300 font-mono border-b border-slate-800">
                          <tr>
                            <th className="p-3.5 pl-5 min-w-[280px] text-xs font-bold uppercase tracking-wider text-slate-400">
                              KALEMLER
                            </th>
                            {tableData.map((d: any, idx: number) => (
                              <th key={idx} className="p-3 text-center min-w-[140px] text-xs font-bold uppercase tracking-wider">
                                <div className="text-white text-sm font-black flex items-center justify-center gap-1.5 flex-wrap">
                                  <span>{d.period}</span>
                                  {d.is_tms29 && (
                                    <span className="text-[9px] font-sans font-bold px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800" title="TMS 29 Enflasyon Muhasebesi">
                                      TMS 29
                                    </span>
                                  )}
                                </div>
                                {d.date && (
                                  <div className="text-[10px] text-slate-500 font-normal lowercase">{d.date}</div>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-800/70 font-mono">
                          {/* SUBTAB 1: BİLANÇO TABLOSU (Açılıp Kapanır Başlıklar - İlave 4) */}
                          {tableSubTab === 'bilanco' && balanceSheetSections.map((sec, sIdx) => {
                            const isCollapsed = Boolean(collapsedSections[sec.categoryKey]);

                            return (
                              <React.Fragment key={sIdx}>
                                <tr
                                  onClick={() => toggleSection(sec.categoryKey)}
                                  className="cursor-pointer bg-[#0F172A] hover:bg-slate-800/80 transition select-none border-y border-slate-800"
                                >
                                  <td colSpan={tableData.length + 1} className="py-2.5 px-5 font-sans font-bold text-xs uppercase tracking-wider text-slate-300">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span>{sec.title}</span>
                                        <span className="text-[10px] text-slate-400 font-mono font-normal bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                          {sec.rows.length} kalem
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono font-medium">
                                        {isCollapsed ? 'Genişlet +' : 'Daralt —'}
                                      </span>
                                    </div>
                                  </td>
                                </tr>

                                {!isCollapsed && sec.rows.map((row, rIdx) => {
                                  const values = tableData.map((d: any) => d[row.key] ?? d[row.fallbackKey || '']);

                                  return (
                                    <tr key={rIdx} className={`hover:bg-slate-800/40 transition-colors group ${
                                      row.isHeader ? 'bg-slate-900/60 font-bold' : ''
                                    } ${row.highlight ? 'bg-emerald-950/20' : ''}`}>
                                      <td className="p-3 pl-8 font-sans">
                                        <div className="flex items-center justify-between gap-3">
                                          <div>
                                            <div className={`text-xs md:text-sm tracking-tight ${row.isHeader ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>
                                              {row.label}
                                            </div>
                                            {row.sublabel && (
                                              <div className="text-[11px] text-slate-500 font-normal mt-0.5">{row.sublabel}</div>
                                            )}
                                          </div>
                                          <SparklineBars data={[...values].reverse()} color={row.highlight ? 'emerald' : 'cyan'} />
                                        </div>
                                      </td>

                                      {tableData.map((d: any, idx: number) => {
                                        const val = d[row.key] ?? d[row.fallbackKey || ''];
                                        const prevPeriodData = idx < tableData.length - 1 ? tableData[idx + 1] : null;
                                        const prevVal = prevPeriodData ? (prevPeriodData[row.key] ?? prevPeriodData[row.fallbackKey || '']) : null;
                                        const change = calculateYoYChange(val, prevVal, false);

                                        return (
                                          <td key={idx} className="p-3 text-center group-hover:bg-slate-800/30 transition-colors">
                                            <div className="flex flex-col items-center justify-center gap-0.5">
                                              <span className={`font-mono text-xs sm:text-sm tracking-tight ${
                                                row.isHeader ? 'font-black text-white' : 'font-semibold text-slate-100'
                                              }`}>
                                                {formatAmount(val, unitMode, false, '', '', currentExtractedData?.currency)}
                                              </span>
                                              <ChangeBadge change={change} size="xs" />
                                            </div>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}

                          {/* SUBTAB 2: GELİR TABLOSU (Açılıp Kapanır Başlıklar - İlave 4) */}
                          {tableSubTab === 'gelir' && incomeStatementSections.map((sec, sIdx) => {
                            const isCollapsed = Boolean(collapsedSections[sec.categoryKey]);

                            return (
                              <React.Fragment key={sIdx}>
                                <tr
                                  onClick={() => toggleSection(sec.categoryKey)}
                                  className="cursor-pointer bg-[#0F172A] hover:bg-slate-800/80 transition select-none border-y border-slate-800"
                                >
                                  <td colSpan={tableData.length + 1} className="py-2.5 px-5 font-sans font-bold text-xs uppercase tracking-wider text-slate-300">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span>{sec.title}</span>
                                        <span className="text-[10px] text-slate-400 font-mono font-normal bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                          {sec.rows.length} kalem
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono font-medium">
                                        {isCollapsed ? 'Genişlet +' : 'Daralt —'}
                                      </span>
                                    </div>
                                  </td>
                                </tr>

                                {!isCollapsed && sec.rows.map((row, rIdx) => {
                                  const values = tableData.map((d: any) => d[row.key] ?? d[row.fallbackKey || '']);

                                  return (
                                    <tr key={rIdx} className={`hover:bg-slate-800/40 transition-colors group ${
                                      row.isHeader ? 'bg-slate-900/60 font-bold' : ''
                                    } ${row.highlight ? 'bg-emerald-950/20' : ''}`}>
                                      <td className="p-3 pl-8 font-sans">
                                        <div className="flex items-center justify-between gap-3">
                                          <div>
                                            <div className={`text-xs md:text-sm tracking-tight ${row.isHeader ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>
                                              {row.label}
                                            </div>
                                            {row.sublabel && (
                                              <div className="text-[11px] text-slate-500 font-normal mt-0.5">{row.sublabel}</div>
                                            )}
                                          </div>
                                          <SparklineBars data={[...values].reverse()} color="cyan" />
                                        </div>
                                      </td>

                                      {tableData.map((d: any, idx: number) => {
                                        const val = d[row.key] ?? d[row.fallbackKey || ''];
                                        const prevPeriodData = idx < tableData.length - 1 ? tableData[idx + 1] : null;
                                        const prevVal = prevPeriodData ? (prevPeriodData[row.key] ?? prevPeriodData[row.fallbackKey || '']) : null;
                                        const change = calculateYoYChange(val, prevVal, row.isMargin);

                                        return (
                                          <td key={idx} className="p-3 text-center group-hover:bg-slate-800/30 transition-colors">
                                            <div className="flex flex-col items-center justify-center gap-0.5">
                                              <span className="font-mono text-xs sm:text-sm font-semibold tracking-tight text-white">
                                                {formatAmount(val, unitMode, row.isMargin, row.prefix, '', currentExtractedData?.currency)}
                                              </span>
                                              <ChangeBadge change={change} size="xs" />
                                            </div>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}

                          {/* SUBTAB 3: NAKİT AKIŞ (Açılıp Kapanır Başlıklar - İlave 4) */}
                          {tableSubTab === 'nakit' && cashFlowSections.map((sec, sIdx) => {
                            const isCollapsed = Boolean(collapsedSections[sec.categoryKey]);

                            return (
                              <React.Fragment key={sIdx}>
                                <tr
                                  onClick={() => toggleSection(sec.categoryKey)}
                                  className="cursor-pointer bg-[#0F172A] hover:bg-slate-800/80 transition select-none border-y border-slate-800"
                                >
                                  <td colSpan={tableData.length + 1} className="py-2.5 px-5 font-sans font-bold text-xs uppercase tracking-wider text-slate-300">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span>{sec.title}</span>
                                        <span className="text-[10px] text-slate-400 font-mono font-normal bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                          {sec.rows.length} kalem
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono font-medium">
                                        {isCollapsed ? 'Genişlet +' : 'Daralt —'}
                                      </span>
                                    </div>
                                  </td>
                                </tr>

                                {!isCollapsed && sec.rows.map((row, rIdx) => {
                                  const values = tableData.map((d: any) => d[row.key] ?? (row.fallbackKey ? d[row.fallbackKey] : undefined));

                                  return (
                                    <tr key={rIdx} className={`hover:bg-slate-800/40 transition-colors group ${
                                      row.isHeader ? 'bg-slate-900/60 font-bold' : ''
                                    } ${row.highlight ? 'bg-emerald-950/20' : ''}`}>
                                      <td className="p-3 pl-8 font-sans">
                                        <div className="flex items-center justify-between gap-3">
                                          <div>
                                            <div className={`text-xs md:text-sm tracking-tight ${row.isHeader ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>
                                              {row.label}
                                            </div>
                                            {row.sublabel && (
                                              <div className="text-[11px] text-slate-500 font-normal mt-0.5">{row.sublabel}</div>
                                            )}
                                          </div>
                                          <SparklineBars data={[...values].reverse()} color="emerald" />
                                        </div>
                                      </td>

                                      {tableData.map((d: any, idx: number) => {
                                        const val = d[row.key] ?? (row.fallbackKey ? d[row.fallbackKey] : undefined);
                                        const prevPeriodData = idx < tableData.length - 1 ? tableData[idx + 1] : null;
                                        const prevVal = prevPeriodData ? (prevPeriodData[row.key] ?? (row.fallbackKey ? prevPeriodData[row.fallbackKey] : undefined)) : null;
                                        const change = calculateYoYChange(val, prevVal, false);

                                        return (
                                          <td key={idx} className="p-3 text-center group-hover:bg-slate-800/30 transition-colors">
                                            <div className="flex flex-col items-center justify-center gap-0.5">
                                              <span className="font-mono text-xs sm:text-sm font-semibold tracking-tight text-white">
                                                {formatAmount(val, unitMode, false, '', '', currentExtractedData?.currency)}
                                              </span>
                                              <ChangeBadge change={change} invert={row.invert} size="xs" />
                                            </div>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}

                          {/* SUBTAB 4: ORANLAR (Görsel 3 & Açılıp Kapanır Kalem Başlıkları & İlave 7) */}
                          {tableSubTab === 'oranlar' && filteredRatioSections.map((sec, sIdx) => {
                            const isCollapsed = Boolean(collapsedSections[sec.categoryKey]);

                            return (
                              <React.Fragment key={sIdx}>
                                {/* Açılıp Kapanır Kategori Başlığı Satırı (İlave 4 & Görsel 3) */}
                                <tr
                                  onClick={() => toggleSection(sec.categoryKey)}
                                  className="cursor-pointer bg-[#0F172A] hover:bg-slate-800/80 transition select-none border-y border-slate-800"
                                >
                                  <td colSpan={tableData.length + 1} className="py-2.5 px-5 font-sans font-bold text-xs uppercase tracking-wider text-slate-300">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-4 h-4 text-cyan-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span>{sec.title}</span>
                                        <span className="text-[10px] text-slate-400 font-mono font-normal bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                          {sec.rows.length} oran
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono font-medium">
                                        {isCollapsed ? 'Genişlet +' : 'Daralt —'}
                                      </span>
                                    </div>
                                  </td>
                                </tr>

                                {/* Kategori Altındaki Oran Kalemleri */}
                                {!isCollapsed && sec.rows.map((row, rIdx) => {
                                  const values = tableData.map((d: any) => computeRatioForPeriod(d, row.key, currentSector));
                                  const isDetailOpen = selectedRatioDetail === row.key;
                                  const ratioDef = RATIO_DEFINITIONS[row.key];

                                  return (
                                    <React.Fragment key={rIdx}>
                                      <tr
                                        onClick={() => setSelectedRatioDetail(isDetailOpen ? null : row.key)}
                                        className="hover:bg-slate-800/40 transition-colors group cursor-pointer"
                                        title="Formül ve standart açıklaması için tıklayın"
                                      >
                                        <td className="p-3 pl-8 font-sans">
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-semibold text-slate-200 text-xs md:text-sm tracking-tight group-hover:text-cyan-300 transition">
                                                {row.label}
                                              </span>
                                              <Info className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 transition" />
                                            </div>
                                            <SparklineBars data={[...values].reverse()} color="cyan" />
                                          </div>
                                        </td>

                                        {tableData.map((d: any, idx: number) => {
                                          const rawVal = computeRatioForPeriod(d, row.key, currentSector);
                                          const prevPeriodData = idx < tableData.length - 1 ? tableData[idx + 1] : null;
                                          const prevVal = prevPeriodData ? computeRatioForPeriod(prevPeriodData, row.key, currentSector) : null;
                                          const change = calculateYoYChange(rawVal, prevVal, true);

                                          let displayStr = '—';
                                          if (rawVal !== null && rawVal !== undefined) {
                                            if (row.isPercent) {
                                              displayStr = `%${rawVal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
                                            } else {
                                              displayStr = rawVal.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
                                            }
                                          }

                                          return (
                                            <td key={idx} className="p-3 text-center group-hover:bg-slate-800/30 transition-colors">
                                              <div className="flex flex-col items-center justify-center gap-0.5">
                                                <span className="font-mono text-xs sm:text-sm font-semibold tracking-tight text-white">
                                                  {displayStr}
                                                </span>
                                                <ChangeBadge change={change} size="xs" />
                                              </div>
                                            </td>
                                          );
                                        })}
                                      </tr>

                                      {/* Satır İçi Rasyo Açıklama & Formül Paneli (İlave 7) */}
                                      {isDetailOpen && ratioDef && (
                                        <tr className="bg-slate-950/90 border-y border-cyan-900/50">
                                          <td colSpan={tableData.length + 1} className="p-3 pl-8 text-xs font-sans text-slate-300">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-cyan-950/30 border border-cyan-800/40 p-3 rounded-lg">
                                              <div className="space-y-1">
                                                <div className="font-bold text-cyan-300 font-mono flex items-center gap-1.5">
                                                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> {ratioDef.formula}
                                                </div>
                                                <p className="text-[11px] text-slate-300 leading-relaxed">{ratioDef.desc}</p>
                                              </div>
                                              <div className="text-right sm:border-l sm:border-slate-800 sm:pl-4 flex-shrink-0">
                                                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Sektör Kriteri</span>
                                                <span className="font-mono text-xs font-bold text-emerald-400">{ratioDef.benchmark}</span>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

              {/* SEKME 4: GÜÇLÜ VE ZAYIF YÖNLER (PROS & CONS - İLAVE 6) */}
              {activeTab === 'proscons' && (
                <div className="space-y-6">
                  <div className="bg-[#111827]/80 border border-slate-800 p-5 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-sm font-bold text-white tracking-tight">
                        {activeReport.ticker} Yatırım Tezi: Güçlü ve Zayıf Yönler (Pros & Cons)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Şirketin kurumsal skor tahmininden önce piyasa beklentileri, sektörel katalizörler ve risk faktörlerinin dengesi.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Güçlü Yönler (Pros) */}
                    <div className="bg-emerald-950/20 border border-emerald-900/60 rounded-xl p-6 space-y-4 shadow-lg">
                      <div className="flex items-center gap-2 border-b border-emerald-900/60 pb-3">
                        <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                        <span className="font-bold text-sm uppercase tracking-wider text-emerald-300">
                          Güçlü Yönler & Katalizörler (Boğa Tezi)
                        </span>
                      </div>
                      <ul className="space-y-4 text-xs">
                        {prosConsData.pros.map((p: any, i: number) => (
                          <li key={i} className="space-y-1">
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                              {p.title}
                            </div>
                            <p className="text-slate-300 text-xs pl-4 leading-relaxed">{p.desc}</p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Zayıf Yönler (Cons) */}
                    <div className="bg-rose-950/20 border border-rose-900/60 rounded-xl p-6 space-y-4 shadow-lg">
                      <div className="flex items-center gap-2 border-b border-rose-900/60 pb-3">
                        <ArrowDownRight className="w-5 h-5 text-rose-400" />
                        <span className="font-bold text-sm uppercase tracking-wider text-rose-300">
                          Zayıf Yönler & Risk Faktörleri (Ayı Tezi)
                        </span>
                      </div>
                      <ul className="space-y-4 text-xs">
                        {prosConsData.cons.map((c: any, i: number) => (
                          <li key={i} className="space-y-1">
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
                              {c.title}
                            </div>
                            <p className="text-slate-300 text-xs pl-4 leading-relaxed">{c.desc}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* SEKME 5: REHBERLİK KARNESİ */}
              {activeTab === 'guidance' && (
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4 shadow-xl">
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-400" /> Şirket Yönetiminin Geçmiş Hedef Tutturma Performansı
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Şirketin önceki faaliyet raporlarında ve yatırımcı sunumlarında verdiği hedefler gerçekleşti mi?
                    </p>
                  </div>

                  {currentExtractedData?.guidance_track_record?.length > 0 ? (
                    <div className="overflow-x-auto border border-slate-800 rounded-lg">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-800 text-slate-200">
                          <tr>
                            <th className="p-3">Dönem</th>
                            <th className="p-3">Açıklanan Hedef</th>
                            <th className="p-3 text-right">Yıl Sonu Gerçekleşen</th>
                            <th className="p-3 text-center">Karne Durumu</th>
                            <th className="p-3">Sapma & Güvenilirlik Değerlendirmesi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {currentExtractedData.guidance_track_record.map((g: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="p-3 font-bold font-mono text-white">{g.year_or_period}</td>
                              <td className="p-3 text-slate-300">{g.guidance_given}</td>
                              <td className="p-3 text-right font-mono font-semibold text-slate-100">{g.actual_realized}</td>
                              <td className="p-3 text-center">
                                <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                                  g.status === 'BAŞARILI' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                  g.status === 'BAŞARISIZ' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                                  'bg-amber-950 text-amber-400 border border-amber-800'
                                }`}>
                                  {g.status}
                                </span>
                              </td>
                              <td className="p-3 text-slate-400 text-xs leading-relaxed">{g.analysis}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      Yüklenen belgelerde geçmiş yönetim rehberlik tablosu tespit edilemedi.
                    </div>
                  )}
                </div>
              )}

              {/* SEKME 6: DEĞERLEME RAPORU */}
              {activeTab === 'report' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111827] border border-slate-800 px-5 py-3.5 rounded-xl shadow-md print:hidden">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold text-xs sm:text-sm text-white tracking-tight">
                          {activeReport.ticker} Fon Yöneticisi Değerleme Raporu
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {activeReport.period || activeReport.createdAt.slice(0, 10)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-[10px]">
                        <button
                          type="button"
                          onClick={() => setFontSizeMode('compact')}
                          className={`px-2 py-1 rounded transition cursor-pointer ${fontSizeMode === 'compact' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                        >
                          A-
                        </button>
                        <button
                          type="button"
                          onClick={() => setFontSizeMode('normal')}
                          className={`px-2 py-1 rounded transition cursor-pointer ${fontSizeMode === 'normal' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                        >
                          A
                        </button>
                        <button
                          type="button"
                          onClick={() => setFontSizeMode('large')}
                          className={`px-2 py-1 rounded transition cursor-pointer ${fontSizeMode === 'large' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                        >
                          A+
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyReport}
                        className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        {copiedReport ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">Kopyalandı!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Kopyala</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg transition cursor-pointer shadow-sm"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Yazdır / PDF</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#111827]/90 border border-slate-800 p-6 sm:p-10 md:p-12 rounded-2xl shadow-2xl backdrop-blur-sm print:p-0 print:border-none print:bg-white print:text-black">
                    <div className="report-content max-w-5xl mx-auto space-y-2">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
                        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
                        components={{
                          h1: ({ ...props }) => (
                            <div className="border-b border-slate-800 pb-4 mb-6 mt-2">
                              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight" {...props} />
                            </div>
                          ),
                          h2: ({ children, ...props }) => {
                            const text = extractTextFromChildren(children);
                            const isRedFlag = text.includes('🚨') || text.toLowerCase().includes('kırmızı bayrak');
                            return (
                              <div className={`mt-8 mb-4 pt-3 border-t ${isRedFlag ? 'border-rose-800/80' : 'border-slate-800'}`}>
                                <h2
                                  className={`text-base sm:text-lg font-bold tracking-tight flex items-center gap-2 ${
                                    isRedFlag ? 'text-rose-400 font-extrabold' : 'text-emerald-400'
                                  }`}
                                  {...props}
                                >
                                  {children}
                                </h2>
                              </div>
                            );
                          },
                          h3: ({ ...props }) => (
                            <h3 className="text-xs sm:text-sm font-bold text-cyan-300 mt-5 mb-2.5 uppercase tracking-wider pl-2 border-l-2 border-cyan-400" {...props} />
                          ),
                          p: ({ children, ...props }) => {
                            const text = extractTextFromChildren(children);
                            if (text.includes('🚨 [KIRMIZI BAYRAK]') || (text.startsWith('🚨') && text.length < 250) || text.includes('[KIRMIZI BAYRAK]')) {
                              return (
                                <div className="bg-rose-950/40 border border-rose-600/40 p-4 rounded-xl text-rose-200 text-xs sm:text-sm leading-relaxed my-4 flex items-start gap-3 shadow-md">
                                  <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                                  <div className="space-y-1">{children}</div>
                                </div>
                              );
                            }
                            if (text.startsWith('Analist Kararı:')) {
                              const isAlma = /\b(ALMA|SAT)\b/i.test(text);
                              const isAl = /\b(AL)\b/i.test(text) && !isAlma;
                              return (
                                <div className={`p-5 rounded-xl border my-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl ${
                                  isAl ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-100' :
                                  isAlma ? 'bg-rose-950/40 border-rose-500/50 text-rose-100' :
                                  'bg-slate-900 border-slate-700 text-slate-200'
                                }`}>
                                  <div className="space-y-1">
                                    <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Fon Yöneticisi Nihai Kararı</span>
                                    <div className="text-base sm:text-lg font-extrabold text-white">{children}</div>
                                  </div>
                                  <div className={`px-4 py-2 rounded-lg font-mono font-black text-sm tracking-wider text-center ${
                                    isAl ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' :
                                    isAlma ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40' :
                                    'bg-slate-800 text-slate-200 border border-slate-700'
                                  }`}>
                                    {isAl ? 'AL' : isAlma ? 'ALMA' : 'NÖTR'}
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <p className={`text-slate-200 leading-relaxed mb-4 ${
                                fontSizeMode === 'large' ? 'text-base leading-loose' :
                                fontSizeMode === 'compact' ? 'text-xs leading-normal' :
                                'text-sm leading-relaxed'
                              }`} {...props}>
                                {children}
                              </p>
                            );
                          },
                          table: ({ ...props }) => (
                            <div className="overflow-x-auto my-6 border border-slate-700/80 rounded-xl shadow-lg bg-slate-950/60">
                              <table className="w-full text-left border-collapse text-xs font-sans" {...props} />
                            </div>
                          ),
                          thead: ({ ...props }) => <thead className="bg-slate-800/90 text-slate-100 border-b border-slate-700 font-bold uppercase tracking-wider text-[11px]" {...props} />,
                          tbody: ({ ...props }) => <tbody className="divide-y divide-slate-800/70" {...props} />,
                          tr: ({ children, ...props }) => {
                            const rowText = extractTextFromChildren(children);
                            const isTotal = rowText.includes('Toplam Puan') || rowText.includes('Nihai Skor');
                            return (
                              <tr className={`transition-colors ${isTotal ? 'bg-emerald-950/30 font-bold text-white' : 'hover:bg-slate-800/40'}`} {...props}>
                                {children}
                              </tr>
                            );
                          },
                          th: ({ ...props }) => <th className="p-3 font-semibold text-slate-200 tracking-wide text-[11px]" {...props} />,
                          td: ({ ...props }) => <td className="p-3 text-slate-200 font-mono text-xs" {...props} />,
                          blockquote: ({ ...props }) => (
                            <blockquote className="border-l-4 border-amber-500 bg-amber-950/20 px-4 py-3 my-4 rounded-r-lg text-amber-200 text-xs sm:text-sm leading-relaxed font-sans shadow-sm" {...props} />
                          ),
                          strong: ({ ...props }) => <strong className="font-bold text-white" {...props} />,
                          ul: ({ ...props }) => <ul className="list-disc list-inside space-y-2 my-3 text-xs sm:text-sm text-slate-300 leading-relaxed" {...props} />,
                          ol: ({ ...props }) => <ol className="list-decimal list-inside space-y-2 my-3 text-xs sm:text-sm text-slate-300 leading-relaxed" {...props} />,
                          li: ({ ...props }) => <li className="leading-relaxed marker:text-emerald-400" {...props} />,
                          hr: ({ ...props }) => <hr className="border-slate-800 my-6" {...props} />,
                          code: ({ inline, ...props }: any) => (
                            <code className="bg-slate-950 border border-slate-800 text-emerald-400 px-1.5 py-0.5 rounded font-mono text-xs" {...props} />
                          ),
                        }}
                      >
                        {preprocessReportMarkdown(activeReport.report)}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* SEKME 7: ÇEYREKLİK SKOR TAKİBİ */}
              {activeTab === 'history' && (
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6 shadow-xl">
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <History className="w-4 h-4 text-emerald-400" /> {activeReport.ticker} Çeyreklik Karar & Skor Evrimi
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Her yeni bilanço ve rapor geldikçe oluşan puan değişimlerini ve yatırım tezinizin nasıl güncellendiğini takip edin.
                    </p>
                  </div>

                  {tickerHistory.length > 1 && (
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg space-y-2">
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Skor Gelişim Eğrisi</span>
                      <div className="h-48 w-full">
                        {mounted && (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={tickerHistory.map((h) => ({ name: h.period || h.createdAt.slice(0, 10), score: Number(h.score) || 0 }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                              <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                              <YAxis stroke="#94a3b8" domain={[0, 100]} tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                              <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '12px' }} />
                              <Line type="monotone" dataKey="score" name="Kurumsal Skor" stroke="#10b981" strokeWidth={3} dot={{ r: 5, fill: '#10b981' }} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {tickerHistory.map((item, idx) => {
                      const prevItem = idx > 0 ? tickerHistory[idx - 1] : null;
                      const scoreDiff = prevItem && item.score && prevItem.score 
                        ? Number(item.score) - Number(prevItem.score) 
                        : null;

                      return (
                        <div key={item.id} className="p-4 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between shadow-sm">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold font-mono text-emerald-400">{item.period || item.createdAt}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                item.decision === 'AL' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                item.decision === 'ALMA' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                                'bg-slate-800 text-slate-400'
                              }`}>
                                {item.decision}
                              </span>
                              <span className="text-xs text-slate-400">Fiyat: <strong className="text-white font-mono">{item.price} TL</strong></span>
                            </div>
                            <div className="text-[11px] text-slate-400">Kayıt: {item.createdAt}</div>
                          </div>

                          <div className="flex items-center gap-4">
                            {scoreDiff !== null && (
                              <div className={`flex items-center gap-1 text-xs font-bold font-mono ${
                                scoreDiff > 0 ? 'text-emerald-400' : scoreDiff < 0 ? 'text-rose-400' : 'text-slate-400'
                              }`}>
                                {scoreDiff > 0 ? <ArrowUpRight className="w-4 h-4" /> : scoreDiff < 0 ? <ArrowDownRight className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                                {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff} Puan
                              </div>
                            )}
                            <div className="text-right">
                              <div className="text-xl font-black font-mono text-white">{item.score || '-'}/100</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* LİDERLİK & HİSSE SIRALAMA PANELİ */}
          {step === 'leaderboard' && (() => {
            const ranked = sortReportsByRank(savedReports);
            const filtered = ranked.filter(r => {
              const matchesSearch = !leaderboardSearch.trim() || 
                r.ticker.toLowerCase().includes(leaderboardSearch.toLowerCase().trim());
              const matchesFilter = leaderboardFilter === 'ALL' || r.decision === leaderboardFilter;
              return matchesSearch && matchesFilter;
            });

            return (
              <div className="space-y-6">
                <div className="bg-[#111827] border border-slate-800 p-6 rounded-xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-amber-400" /> Fon Portföyü & Hisse Sıralama Paneli
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Önce &apos;AL&apos; kararı verilenler, ardından kurumsal kalite skoruna göre azalan sırada listelenir.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStep('input')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Yeni Analiz
                    </button>
                  </div>
                </div>

                <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                  <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60">
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={leaderboardSearch}
                        onChange={e => setLeaderboardSearch(e.target.value)}
                        placeholder="Hisse kodu ara (Örn: AGESA)..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                      {(['ALL', 'AL', 'NÖTR', 'ALMA'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setLeaderboardFilter(f)}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                            leaderboardFilter === f ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {f === 'ALL' ? 'Tümü' : f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-800/90 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                        <tr>
                          <th className="p-3.5 pl-5">Sıra</th>
                          <th className="p-3.5">Hisse</th>
                          <th className="p-3.5">Karar</th>
                          <th className="p-3.5 text-right">Skor</th>
                          <th className="p-3.5 text-right">Fiyat</th>
                          <th className="p-3.5">Dönem / Kayıt</th>
                          <th className="p-3.5 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filtered.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                              Kriterlere uygun rapor bulunamadı.
                            </td>
                          </tr>
                        ) : (
                          filtered.map((item, index) => (
                            <tr
                              key={item.id}
                              onClick={() => { setActiveReportId(item.id); setStep('report'); }}
                              className="hover:bg-slate-800/50 transition cursor-pointer"
                            >
                              <td className="p-3.5 pl-5 font-mono font-bold text-slate-400">
                                #{index + 1}
                              </td>
                              <td className="p-3.5">
                                <span className="font-bold text-sm text-white font-mono">{item.ticker}</span>
                              </td>
                              <td className="p-3.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  item.decision === 'AL' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                  item.decision === 'ALMA' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                                  'bg-slate-800 text-slate-400'
                                }`}>
                                  {item.decision}
                                </span>
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-sm text-emerald-400">
                                {item.score ? `${item.score}/100` : '—'}
                              </td>
                              <td className="p-3.5 text-right font-mono font-semibold text-slate-200">
                                {item.price} TL
                              </td>
                              <td className="p-3.5 text-slate-400 font-mono text-[11px]">
                                {item.period || item.createdAt}
                              </td>
                              <td className="p-3.5 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => deleteReport(item.id, e)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                                  title="Sil"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {error && (
            <div className="p-4 bg-rose-950/80 border border-rose-800 rounded-lg flex items-center gap-3 text-rose-300 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

        </div>
      </main>

    </div>
  );
}
