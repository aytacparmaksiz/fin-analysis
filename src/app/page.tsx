'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  Send, FileText, FileSpreadsheet, Presentation, AlertTriangle, Database, 
  RefreshCw, Printer, PlusCircle, Plus, History, 
  ChevronRight, ChevronDown, UploadCloud, X, CheckCircle2, Search,
  TrendingUp, BarChart3, Target, Calendar, ArrowUpRight, ArrowDownRight, Minus,
  DollarSign, ShieldCheck, ShieldAlert, Activity, Layers, Download, Upload,
  Trophy, Award, Trash2, ArrowUpDown, Filter, Copy, Percent, PieChart, Info,
  PanelLeftClose, PanelLeftOpen, Pin, PinOff, Bookmark, Building2,
  Check, Rocket, Gem, Shield, Sun, Moon, Compass, SlidersHorizontal, Scale, ArrowRight, Sparkles
} from 'lucide-react';

import SimplyView from './simply/simply-view';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
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
  SECTOR_DEFINITIONS,
  isMetricDisabled,
  getFinancialArchetype,
  SECTOR_ARCHETYPE_CONFIGS
} from '@/lib/sectors';

import { SavedReport } from '@/lib/report-resolver';
export type { SavedReport };
import { generateFullAuditMarkdown } from '@/lib/export-markdown';
import {
  categorizeCompany,
  getThemeSummary,
  INVESTMENT_THEMES,
  type InvestmentThemeId,
  type CompanyThemeMatch
} from '@/lib/company-categorizer';

import {
  computeSectorValuationAndDrivers,
  enrichAndSanitizeFinancialHistory,
  extractValuationFromReportText,
  parseFinancialNumber,
  parsePeriodSortKey,
  safeDivide,
  safeRoe,
  safeMargin,
  homogenizeTms29Series,
  optimizeFinalDecision,
  calculateSectorScore,
  calculateEarningsQuality,
  calculateDuPont5Step,
  calculateCompanyMultiples,
  SECTOR_MULTIPLE_BENCHMARKS,
  ValuationMetrics,
  FairValueDrivers,
  FinalDecisionOptimization,
  SectorScoreResult,
  EarningsQualityAudit,
  Dupont5StepResult,
  CompanyMultiplesComparison,
  cleanAndParseJson,
  syncReportTextWithValuation
} from '@/lib/valuation';
import { OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE } from '@/lib/isyatirim-sector-averages-cache';
import { 
  FinancialRatioEngine, 
  type UnifiedFinancialMetrics,
  computeFinancialChange,
  type FinancialMetricSemantics,
  type FinancialChangeResult
} from '@/lib/ratio-engine';
import { extractSmartFinancialText, extractSmartDocumentText, splitScannedPdfIntoChunks, DocumentCategory } from '@/lib/pdf-filter';

// Yatırım Teması İkonu Render Yardımcısı
function renderThemeIcon(iconTag: string, className: string = "w-3.5 h-3.5") {
  switch (iconTag) {
    case 'Rocket': return <Rocket className={className} />;
    case 'Gem': return <Gem className={className} />;
    case 'Shield': return <Shield className={className} />;
    case 'RefreshCw': return <RefreshCw className={className} />;
    case 'Zap': return <Activity className={className} />;
    case 'DollarSign': return <DollarSign className={className} />;
    default: return <Compass className={className} />;
  }
}

// Gateway Timeout, kurumsal proxy ve HTML hata sayfalarını yakalayan güvenli API yanıt ayrıştırıcısı
async function parseApiResponse(res: Response, defaultError: string, context?: 'bist' | 'extract' | 'analyze'): Promise<any> {
  const status = res.status;
  const rawText = await res.text();

  // 1. Gateway Timeout (504), Cloudflare (524), Request Timeout (408) veya Kurumsal Proxy HTML yanıtı
  const isHtml = rawText.trim().startsWith('<!DOCTYPE') || rawText.trim().startsWith('<html') || rawText.includes('<body') || rawText.includes('</html>');
  const isTimeout = status === 504 || status === 524 || status === 408 || 
                    (isHtml && (/function_invocation_timeout/i.test(rawText) ||
                                /gateway\s*time-?out/i.test(rawText) || 
                                /notification:\s*gateway_timeout/i.test(rawText)));
  const isPayloadTooLarge = status === 413 || (isHtml && (/function_payload_too_large/i.test(rawText) || /payload\s*too\s*large/i.test(rawText)));

  if (isTimeout) {
    if (context === 'bist' || /bist/i.test(defaultError)) {
      throw new Error('BIST veri sunucusu yanıt süresi aşıldı (Zaman Aşımı / HTTP 504). Lütfen birkaç saniye sonra analizi tekrar deneyin.');
    }
    if (context === 'analyze' || /değerleme/i.test(defaultError)) {
      throw new Error('Değerleme raporu hesaplama süresi aşıldı (Zaman Aşımı / HTTP 504). Lütfen analizi tekrar başlatın.');
    }
    throw new Error('Sunucu yanıt süresi aşıldı (Gateway Timeout). Lütfen sadece finansal tabloları içeren sayfaları yüklemeyi deneyin.');
  }

  if (isPayloadTooLarge) {
    throw new Error('Yüklenen dosya boyutu sunucu sınırını aştı (Payload Too Large). Lütfen daha az sayıda veya daha küçük boyutlu PDF yükleyin.');
  }

  if (isHtml) {
    throw new Error(`Sunucu veya ağ geçidi beklenmeyen bir HTML yanıtı döndürdü (HTTP ${status}). Lütfen internet bağlantınızı veya kurumsal proxy ayarlarınızı kontrol edip tekrar deneyin.`);
  }

  // 2. JSON Yanıtını Güvenli Ayrıştırma
  let parsed: any = null;
  try {
    parsed = cleanAndParseJson(rawText);
  } catch {
    if (!res.ok) {
      throw new Error(`Sunucu hatası (HTTP ${status}): ${rawText.slice(0, 150)}`);
    }
    throw new Error('Sunucudan geçersiz veri formatı alındı.');
  }

  if (!parsed || typeof parsed !== 'object') {
    if (!res.ok) {
      throw new Error(`Sunucu hatası (HTTP ${status}): ${rawText.slice(0, 150)}`);
    }
    throw new Error('Sunucudan geçersiz veri formatı alındı.');
  }

  if (!res.ok) {
    if (status === 429) {
      throw new Error(parsed?.error || 'Gemini API hız kotası aşıldı (429). Lütfen birkaç saniye sonra tekrar deneyin.');
    }
    throw new Error(parsed?.error || defaultError || `İşlem başarısız oldu (HTTP ${status}).`);
  }

  return parsed;
}

/**
 * İstemci tarafı akıllı hız sınırı koruması (Client-side Rate Limit Retry):
 * Vercel serverless fonksiyon zaman aşımını (timeout) önlemek için API 429 döndüğünde
 * bekleme istemcide güvenle yapılır ve kullanıcıya dostça durum bilgisi gösterilir.
 */
async function fetchWithClientRetry(
  requestFn: () => Promise<Response>,
  onStatusUpdate?: (msg: string) => void,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await requestFn();
    let isRetryable = res.status === 429 || res.status === 503;
    let retrySeconds = 4;

    if (!isRetryable && (res.status === 500 || res.status === 504 || res.status === 502)) {
      try {
        const clone = res.clone();
        const json = await clone.json();
        if (json?.isRateLimit || json?.retryAfter || /demand|quota|rate|busy|aborted|unavailable/i.test(json?.error || '')) {
          isRetryable = true;
          if (json?.retryAfter && typeof json.retryAfter === 'number') {
            retrySeconds = Math.max(3, Math.min(8, json.retryAfter));
          }
        }
      } catch {
        if (res.status === 504 || res.status === 502) {
          isRetryable = true;
          retrySeconds = 2;
        }
      }
    } else if (res.status === 429) {
      try {
        const clone = res.clone();
        const json = await clone.json();
        if (json?.retryAfter && typeof json.retryAfter === 'number') {
          retrySeconds = Math.max(3, Math.min(8, json.retryAfter));
        }
      } catch {}
    }

    if (isRetryable && attempt < maxRetries) {
      for (let sec = retrySeconds; sec > 0; sec--) {
        if (onStatusUpdate) {
          const reason = (res.status === 504 || res.status === 502) ? 'Sunucu bağlantısı yeniden deneniyor' : 'API hız sınırı koruması';
          onStatusUpdate(`${reason}: ${sec} sn bekleniyor...`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (onStatusUpdate) {
        onStatusUpdate('İstek yeniden gönderiliyor...');
      }
      continue;
    }
    return res;
  }
  return await requestFn();
}

// Fair Value Kurumsal Vektör Logosu
function FairValueLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center rounded-lg bg-slate-950 border border-slate-800 flex-shrink-0 p-1.5 ${className}`}>
      <svg viewBox="0 0 32 32" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 6H16C17.6569 6 19 7.34315 19 9C19 10.6569 17.6569 12 16 12H10V15H15C16.6569 15 18 16.3431 18 18C18 19.6569 16.6569 21 15 21H10V26H5V6Z" fill="#10B981" />
        <path d="M18 12L22.5 25L27 12" stroke="#38BDF8" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="22.5" cy="7.5" r="2.2" fill="#10B981" />
      </svg>
    </div>
  );
}

// Büyüme / Azalış Değişim Tipi
interface ChangeResult {
  value: number;
  text: string;
  isPositive: boolean;
  isNegative: boolean;
  isZero: boolean;
  isPoint?: boolean;
  color?: 'emerald' | 'rose' | 'slate';
  isStatusText?: boolean;
}

// Finansal Değer Formatlayıcı (Bin TRY / Milyon TRY / Tam TL)
function formatAmount(
  val: number | null | undefined, 
  unitMode: 'bin' | 'milyon' | 'tam' = 'bin', 
  isRatioOrPercent = false, 
  prefix = '', 
  suffix = '',
  currency = 'TRY'
): string {
  if (val === null || val === undefined || isNaN(val)) return '—';

  if (isRatioOrPercent) {
    const formatted = val.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    return `${prefix}${formatted}${suffix}`;
  }

  // Raw verinin bin TL mi tam TL mi olduğunu tespit et
  const normCurrency = (currency || '').trim().toLowerCase();
  let isRawInThousands = false;

  if (Math.abs(val) >= 1_000_000_000) {
    // 1 Milyar ve üzeri değerler kesinlikle Tam TL'dir (1 Milyar Bin TRY = 1 Trilyon TL)
    isRawInThousands = false;
  } else if (normCurrency.includes('bin') || normCurrency.includes('thousand')) {
    isRawInThousands = true;
  } else if (normCurrency.includes('milyon') || normCurrency.includes('million')) {
    isRawInThousands = false;
  } else if (normCurrency === 'tl' || normCurrency === 'try' || normCurrency.includes('tam')) {
    isRawInThousands = false;
  } else if (!currency) {
    isRawInThousands = false;
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

// Dosya Boyutu Formatlayıcı
function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Yıllık / Dönemsel Değişim Hesaplama (Platform Standart Finansal Semantik)
function calculateYoYChange(
  current: number | null | undefined, 
  previous: number | null | undefined, 
  isMargin = false,
  semantics?: FinancialMetricSemantics
): ChangeResult | null {
  if (current === null || current === undefined || isNaN(current)) return null;
  if (previous === null || previous === undefined || isNaN(previous)) return null;

  const resolvedSemantics: FinancialMetricSemantics = semantics ?? (isMargin ? 'MARGIN' : 'PROFIT');
  const res = computeFinancialChange(current, previous, resolvedSemantics, isMargin);

  return {
    value: res.percentChange ?? 0,
    text: res.formattedLabel,
    isPositive: res.badgeColor === 'green',
    isNegative: res.badgeColor === 'red',
    isZero: res.badgeColor === 'neutral',
    isPoint: isMargin,
    color: res.badgeColor === 'green' ? 'emerald' : (res.badgeColor === 'red' ? 'rose' : 'slate'),
    isStatusText: res.isTextStatus
  };
}

// Görsel 1 & 3 Değişim Rozeti (YoY / Dönemsel / Status Badge)
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

  if (change.isStatusText) {
    const colorClass = change.color === 'emerald'
      ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50'
      : change.color === 'rose'
      ? 'text-rose-400 bg-rose-950/40 border-rose-800/50'
      : 'text-slate-400 bg-slate-800/40 border-slate-700/50';

    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-sans font-semibold border ${colorClass} ${
        size === 'xs' ? 'text-[9px]' : 'text-[10px]'
      }`}>
        {change.text}
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

  const isGood = change.color ? change.color === 'emerald' : (invert ? change.isNegative : change.isPositive);
  const colorClass = isGood
    ? 'text-emerald-400'
    : (change.color === 'slate' ? 'text-slate-400' : 'text-rose-400');

  const iconText = change.value > 0 ? '↑' : (change.value < 0 ? '↓' : '—');

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

// Finansal Büyüklük Formatlayıcı (Bin TRY, Milyon TL, Tam TL ile %100 Kusursuz Uyumlu)
function formatFinancialScale(
  val: number | null | undefined,
  currency: string = 'Bin TRY',
  isAxis = false,
  isPct = false
): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  if (isPct) return `%${val.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;

  const norm = (currency || '').trim().toLowerCase();
  let nominalTL = val;

  if (norm.includes('bin') || norm.includes('thousand')) {
    nominalTL = val * 1000;
  } else if (norm.includes('milyon') || norm.includes('million')) {
    nominalTL = val * 1_000_000;
  } else if (norm === 'tl' || norm === 'try' || norm.includes('tam')) {
    nominalTL = val;
  } else {
    // Otomatik: Türk KAP raporlarında 10 Milyar TL altındaki değerler standart Bin TRY'dir
    nominalTL = Math.abs(val) < 10_000_000_000 ? val * 1000 : val;
  }

  const abs = Math.abs(nominalTL);

  if (abs >= 1_000_000_000) {
    const mr = nominalTL / 1_000_000_000;
    return isAxis
      ? `${mr.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mr`
      : `${mr.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Mr TL`;
  }
  if (abs >= 1_000_000) {
    const mn = nominalTL / 1_000_000;
    return isAxis
      ? `${mn.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} Mn`
      : `${mn.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mn TL`;
  }
  if (abs >= 1_000) {
    const bin = nominalTL / 1_000;
    return isAxis
      ? `${bin.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} Bin`
      : `${bin.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} Bin TL`;
  }

  return isAxis ? `${nominalTL.toLocaleString('tr-TR')}` : `${nominalTL.toLocaleString('tr-TR')} TL`;
}

// Grafik Y-Ekseni Formatlayıcı
const chartYAxisFormatter = (v: number) => formatFinancialScale(v, 'Bin TRY', true, false);

// Grafik Değeri Metin Formatlayıcı
function formatChartMetric(val: number | null | undefined, isPct = false, currency = 'Bin TRY'): string {
  return formatFinancialScale(val, currency, false, isPct);
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

// Component Error Boundary (P3 Fazı: Granüler Hata İzolasyonu)
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
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
    console.error('ComponentErrorBoundary yakaladı:', error, errorInfo);
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

// Değer Sürücüleri Kartı (Driver Card)
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
  const noteText = (description && description.trim()) || (sourceExplanation && sourceExplanation.trim()) || '';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
      <div>
        <div className="text-xs font-medium text-slate-400">
          {title}
        </div>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-xl font-bold font-mono text-white tracking-tight">
            {valueText}
          </span>
          <span className="text-[11px] text-slate-500">baz</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="relative h-1.5 w-full rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500/40 rounded-full"
            style={{ width: `${Math.max(8, Math.min(100, pinPercent))}%` }}
          />
          <div 
            className="absolute top-0 bottom-0 w-1.5 bg-emerald-400 rounded-full"
            style={{ left: `calc(${pinPercent}% - 3px)` }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 leading-tight">
          <span className="max-w-[48%] text-left truncate" title={bearText}>{bearText}</span>
          <span className="max-w-[48%] text-right text-slate-300 truncate" title={bullText}>{bullText}</span>
        </div>
      </div>

      {noteText && (
        <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-800/80 line-clamp-2" title={noteText}>
          {noteText}
        </p>
      )}
    </div>
  );
}

// Recharts Tooltip
const CustomChartTooltip = ({ active, payload, label, currency = 'Bin TRY' }: any) => {
  if (active && payload && payload.length) {
    // Mükerrer dataKey'leri (örn. Bar + Line share_price) tekilleştir
    const seenKeys = new Set<string>();
    const uniquePayload = payload.filter((entry: any) => {
      const k = `${entry.dataKey}_${entry.name}`;
      if (entry.name === 'Fiyat Trendi') return false;
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    });

    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-lg font-sans text-xs space-y-1.5 min-w-[210px] z-50">
        <div className="font-bold text-white border-b border-slate-800 pb-1 font-mono text-sm flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[10px] text-slate-400 font-normal">Dönem Sonu</span>
        </div>
        {uniquePayload.map((entry: any, index: number) => {
          const isPct =
            entry.dataKey?.includes('margin') ||
            entry.dataKey === 'roic' ||
            entry.dataKey === 'wacc' ||
            entry.dataKey === 'eva_spread' ||
            entry.unit === '%';
          const isSharePrice = entry.dataKey === 'share_price';
          const isMultiple =
            currency === 'x' ||
            entry.unit === 'x' ||
            entry.dataKey === 'pe' ||
            entry.dataKey === 'pb' ||
            entry.dataKey === 'ev_ebitda' ||
            entry.dataKey === 'ev_sales' ||
            entry.name?.includes('F/K') ||
            entry.name?.includes('PD/DD') ||
            entry.name?.includes('FD/FAVÖK') ||
            entry.name?.includes('Çarpan');

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
                {typeof entry.value === 'number' && Number.isFinite(entry.value)
                  ? isSharePrice
                    ? `${entry.value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
                    : isPct
                      ? `%${entry.value.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`
                      : isMultiple
                        ? `${entry.value.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}x`
                        : formatChartMetric(entry.value, false, currency)
                  : (entry.value !== null && entry.value !== undefined && !Number.isNaN(entry.value) ? entry.value : '—')}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};


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


// Fields that are YTD cumulative in KAP reports (income statement / cash flow)
const CUMULATIVE_FIELDS = [
  'revenue', 'gross_profit', 'operating_income', 'operating_profit', 'ebitda', 'net_income',
  'gross_written_premiums', 'written_premiums', 'earned_premiums', 'technical_balance', 'technical_profit', 'investment_income',
  'net_monetary_position', 'operating_cash_flow', 'free_cash_flow', 'capex'
];

function parseYearAndQuarter(p: string): { year: number; q: number } | null {
  const yrMatch = String(p || '').match(/(20\d{2})/);
  if (!yrMatch) return null;
  const year = parseInt(yrMatch[1], 10);
  let q = 0;
  if (/(?:q1|1\.ç|1ç|\/0?3\b|3a\b)/i.test(p)) q = 1;
  else if (/(?:q2|2\.ç|2ç|\/0?6\b|6a\b)/i.test(p)) q = 2;
  else if (/(?:q3|3\.ç|3ç|\/0?9\b|9a\b)/i.test(p)) q = 3;
  else if (/(?:q4|4\.ç|4ç|\/12\b|12a\b)/i.test(p)) q = 4;
  else if (/^\s*20\d{2}\s*$/.test(p)) q = 4;
  return { year, q };
}

function computeIncrementalQuarterlyData(rawData: any[]): any[] {
  if (!rawData || rawData.length === 0) return rawData;
  const sorted = [...rawData].sort((a, b) => parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period));

  return sorted.map((item) => {
    const period = item.period || '';
    const info = parseYearAndQuarter(period);
    if (!info) return { ...item };

    // İlgili yıl içindeki tüm önceki çeyrekleri büyükten küçüğe sıralayarak bul
    const priorInYear = sorted
      .filter(d => {
        const dInfo = parseYearAndQuarter(d.period);
        return dInfo && dInfo.year === info.year && dInfo.q < info.q;
      })
      .sort((a, b) => (parseYearAndQuarter(b.period)?.q || 0) - (parseYearAndQuarter(a.period)?.q || 0));

    const prevItem = priorInYear[0]; // Aynı yıl içindeki en yakın önceki dönem

    // Eğer aynı yıl içinde daha önceki bir çeyrek yoksa:
    if (!prevItem) {
      if (info.q <= 1) {
        // Q1 zaten 3 aylık münferit çeyrektir
        return { ...item };
      }
      if (info.q === 2) {
        // Yalnızca 6 aylık (Q2) veri mevcutsa: 3 aylık çeyreklik ortalamaya ölçeklendir
        const result: any = { ...item, _isAnnualScaled: true, _rawCumulative: { ...item } };
        for (const field of CUMULATIVE_FIELDS) {
          if (typeof item[field] === 'number') result[field] = Math.round(item[field] / 2);
        }
        return result;
      }
      if (info.q === 3) {
        // Yalnızca 9 aylık (Q3) veri mevcutsa: 3 aylık çeyreklik ortalamaya ölçeklendir
        const result: any = { ...item, _isAnnualScaled: true, _rawCumulative: { ...item } };
        for (const field of CUMULATIVE_FIELDS) {
          if (typeof item[field] === 'number') result[field] = Math.round(item[field] / 3);
        }
        return result;
      }
      if (info.q === 4 || info.q === 0) {
        // Yalnızca 12 aylık (Q4/yıllık) veri mevcutsa: 3 aylık çeyreklik ortalamaya ölçeklendir
        const result: any = { ...item, _isAnnualScaled: true, _rawCumulative: { ...item } };
        for (const field of CUMULATIVE_FIELDS) {
          if (typeof item[field] === 'number') result[field] = Math.round(item[field] / 4);
        }
        return result;
      }
      return { ...item };
    }

    // Aynı yıl içinde önceki bir dönem varsa: Farkı hesapla (True Incremental Quarter)
    const prevInfo = parseYearAndQuarter(prevItem.period);
    const quarterSpan = Math.max(1, (prevInfo ? info.q - prevInfo.q : 1));

    const result: any = { ...item, _rawCumulative: { ...item } };
    for (const field of CUMULATIVE_FIELDS) {
      if (item[field] != null && prevItem[field] != null) {
        const diff = item[field] - prevItem[field];
        // Eğer aradaki çeyrek atlanmışsa (örn. Q3 yoksa Q4 eksi Q2), çeyrek adımına böl
        const normDiff = quarterSpan > 1 ? Math.round(diff / quarterSpan) : diff;

        if ((field === 'revenue' || field === 'gross_written_premiums') && normDiff <= 0) {
          result[field] = item[field];
        } else {
          result[field] = normDiff;
        }
      }
    }
    return result;
  });
}

function computeTtmChartData(quarterlyData: any[], _rawData?: any[]): any[] {
  if (!quarterlyData || quarterlyData.length === 0) return quarterlyData;

  // Yalnızca yıllık serilerde (alt çeyreklik verisi olmayan) TTM zaten ilgili yılın tamamıdır
  const hasSubYearQuarters = quarterlyData.some(d => {
    const info = parseYearAndQuarter(d.period);
    return info && info.q >= 1 && info.q <= 3;
  });
  if (!hasSubYearQuarters) {
    return quarterlyData.map(d => (d._isAnnualScaled && d._rawCumulative ? { ...d, ...d._rawCumulative } : d));
  }

  return quarterlyData.map((item, idx) => {
    // Eğer bu dönem yıllık ölçeklendirilmiş bir dönemse, TTM değeri doğrudan orijinal 12 aylık toplamıdır
    if (item._isAnnualScaled && item._rawCumulative) {
      const res: any = { ...item };
      for (const field of CUMULATIVE_FIELDS) {
        if (item._rawCumulative[field] != null) {
          res[field] = item._rawCumulative[field];
        }
      }
      return res;
    }

    const result: any = { ...item };
    const sliceStart = Math.max(0, idx - 3);
    const window = quarterlyData.slice(sliceStart, idx + 1);

    for (const field of CUMULATIVE_FIELDS) {
      if (item[field] != null) {
        let sum = 0;
        let valid = 0;
        for (const w of window) {
          if (w[field] != null && !isNaN(w[field])) {
            sum += w[field];
            valid++;
          }
        }
        if (valid === 4) {
          result[field] = sum;
        } else if (valid > 0) {
          result[field] = Math.round((sum / valid) * 4);
        }
      }
    }
    return result;
  });
}

function exportTableToCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    const safeFilename = (filename || 'Rapor').replace(/[/\\?%*:|"<>]/g, '_').trim();
    const csvContent = '\uFEFF' + [
      (headers || []).map(h => {
        const str = String(h ?? '').replace(/"/g, '""');
        return str.includes(';') || str.includes('\n') || str.includes('\r') || str.includes('"') ? `"${str}"` : str;
      }).join(';'),
      ...(rows || []).map(r => (r || []).map(cell => {
        if (cell === null || cell === undefined) return '';
        const str = String(cell).replace(/"/g, '""');
        return str.includes(';') || str.includes('\n') || str.includes('\r') || str.includes('"') ? `"${str}"` : str;
      }).join(';'))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${safeFilename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('CSV dışa aktarım hatası:', e);
    alert('CSV dışa aktarımında hata oluştu.');
  }
}

function sanitizeHistoryData(history: any[], debtInfo: any = {}, sector: SectorType = 'INDUSTRIAL', referencePrice: number = 100, currency: string = 'Bin TRY') {
  if (!Array.isArray(history) || history.length === 0) return [];

  // enrichAndSanitizeFinancialHistory ile tam deterministik türetme ve TMS 29 homojenizasyonu
  const payload = {
    sector,
    currency: currency || 'Bin TRY',
    debt_and_interest: debtInfo,
    financial_history: history.map((it: any) => (it && typeof it === 'object' ? { ...it } : it))
  };

  const enriched = enrichAndSanitizeFinancialHistory(payload);
  const enrichedHistory: any[] = Array.isArray(enriched?.financial_history) ? enriched.financial_history : [];

  const lastRow = enrichedHistory.length > 0 ? enrichedHistory[enrichedHistory.length - 1] : null;
  const latestEquityRef = lastRow?.equity && lastRow.equity > 0 ? lastRow.equity : null;
  const latestRevRef = (lastRow?.revenue || lastRow?.written_premiums) && (lastRow.revenue || lastRow.written_premiums) > 0
    ? (lastRow.revenue || lastRow.written_premiums)
    : null;
  const basePrice = referencePrice > 0 ? referencePrice : 100;

  return enrichedHistory.map((item: any, idx: number) => {
    if (!item) return item;
    const row = { ...item };
    const annualFactor = getAnnualizationFactor(row.period);

    // TTK uyarısını solvency_warning ile eşitle
    if (row.solvency_warning && !row.ttk_warning) {
      row.ttk_warning = row.solvency_warning;
    }

    // UI Tarihsel Hisse Fiyatı (share_price) kontrolü: Boşsa özsermaye/hasılat gelişimiyle orantılı türet
    if (typeof row.share_price !== 'number' || isNaN(row.share_price) || row.share_price <= 0) {
      if (idx === enrichedHistory.length - 1) {
        row.share_price = Number(basePrice.toFixed(2));
      } else if (latestEquityRef && typeof row.equity === 'number' && row.equity > 0) {
        const ratio = Math.max(0.08, Math.min(1.5, row.equity / latestEquityRef));
        row.share_price = Number((basePrice * ratio).toFixed(2));
      } else if (latestRevRef && typeof row.revenue === 'number' && row.revenue > 0) {
        const ratio = Math.max(0.08, Math.min(1.5, (row.revenue * annualFactor) / latestRevRef));
        row.share_price = Number((basePrice * ratio).toFixed(2));
      } else {
        const stepFactor = Math.max(0.15, Math.pow(0.84, enrichedHistory.length - 1 - idx));
        row.share_price = Number((basePrice * stepFactor).toFixed(2));
      }
    }

    return row;
  });
}

interface ParsedVerdictNarrative {
  thesis: string;
  catalysts: string;
  risks: string;
  isStructured: boolean;
}

function parseVerdictNarrative(rawBody: string): ParsedVerdictNarrative {
  if (!rawBody) {
    return { thesis: '', catalysts: '', risks: '', isStructured: false };
  }

  // 1. Markdown kalınlıklarını ve etiket temizliği (**Yatırım Tezi:** -> Yatırım Tezi:)
  let cleaned = rawBody.replace(/\*\*(Yatırım\s+Tezi|Temel\s+Yatırım\s+Tezi|Gerekçe|Kilit\s+Katalizörler|Katalizörler|Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler)\s*:\*\*/gi, '$1:');

  // 2. Köşeli parantezleri temizle: [metin] -> metin
  cleaned = cleaned.replace(/\[\s*([^\]]+?)\s*\]/g, '$1').trim();

  // 3. Bölümleri ayıkla
  const thesisMatch = cleaned.match(/(?:Yatırım\s+Tezi|Temel\s+Yatırım\s+Tezi|Gerekçe)\s*:\s*([\s\S]*?)(?=(?:Kilit\s+Katalizörler|Katalizörler|Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler|$))/i);
  const catalystMatch = cleaned.match(/(?:Kilit\s+Katalizörler|Katalizörler)\s*:\s*([\s\S]*?)(?=(?:Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler|$))/i);
  const riskMatch = cleaned.match(/(?:Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı|Riskler\s*ve\s*Belirsizlikler|Temel\s*Riskler)\s*:\s*([\s\S]*?)$/i);

  let thesis = (thesisMatch ? thesisMatch[1] : (!catalystMatch && !riskMatch ? cleaned : '')).trim();
  let catalysts = (catalystMatch ? catalystMatch[1] : '').trim();
  let risks = (riskMatch ? riskMatch[1] : '').trim();

  thesis = thesis.replace(/^(?:Yatırım\s+Tezi|Gerekçe)\s*:\s*/i, '').trim();
  catalysts = catalysts.replace(/^(?:Kilit\s+Katalizörler|Katalizörler)\s*:\s*/i, '').trim();
  risks = risks.replace(/^(?:Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı|Temel\s*Riskler)\s*:\s*/i, '').trim();

  const isStructured = Boolean((thesisMatch && catalystMatch) || (thesisMatch && riskMatch) || (catalystMatch && riskMatch));

  return { thesis, catalysts, risks, isStructured };
}

function preprocessReportMarkdown(text: string, valuation?: any): string {
  if (!text) return '';

  let cleaned = text;

  // 0. Model Değerleme Çıktıları ile Metin Senkronizasyonu (Kart vs Rapor Uyuşmazlığını Sıfırlama)
  if (valuation) {
    cleaned = syncReportTextWithValuation(cleaned, valuation);
  }

  // 1. Yapay AI başlıklarını, yabancı terimleri ve bozuk karakterleri (homoglyphs) temizle
  cleaned = cleaned.replace(/🚨\s*\[KIRMIZI BAYRAK\]\s*ve\s*Yatırım Tezi\s*\(Storytelling\)/gi, '## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ');
  cleaned = cleaned.replace(/🚨\s*\[KIRMIZI BAYRAK\]\s*ve\s*Yatırım Tezi/gi, '## I. YÖNETİCİ ÖZETİ VE YATIRIM TEZİ');
  cleaned = cleaned.replace(/\[KIRMIZI BAYRAK\]/gi, 'Kritik Tespit:');
  cleaned = cleaned.replace(/\(\s*Storytelling\s*\)/gi, '');
  cleaned = cleaned.replace(/\bStorytelling\b/gi, 'Temel Yatırım Tezi');
  cleaned = cleaned.replace(/\(\s*Filme Bakış\s*:?\s*[^)]*\)/gi, '(Çok Yıllı Dönemsel Eğilim)');
  cleaned = cleaned.replace(/\bbancassurance\b/gi, 'banka sigortacılığı');
  cleaned = cleaned.replace(/\bVAFÖK\b/g, 'FAVÖK');
  // Gürcüce 'ო' (\u10DD) veya Kiril 'о' (\u043E) karakterlerini Türkçe 'o' ile değiştir ('iskontო' -> 'iskonto')
  cleaned = cleaned.replace(/iskont[\u10DD\u043E\u03BF]/gi, 'iskonto');
  cleaned = cleaned.replace(/[\u10DD]/g, 'o');

  // 2. Bölüm başlıklarını standart '## I. ...' seviyesine homojenleştir
  cleaned = cleaned.replace(/^(?:###|\#)\s*(I{1,3}|IV|V|VI{1,3}|IX|X)[\.\:\s\-]+(.*)$/gim, '## $1. $2');

  // 3. LaTeX display math bloklarını KaTeX uyumlu CommonMark formatına dönüştür
  // 3a. \[ ... \] -> $$ ... $$
  cleaned = cleaned.replace(/\\\\\[([\s\S]*?)\\\\\]/g, (_m, g1) => `\n\n$$\n${g1.trim()}\n$$\n\n`);
  cleaned = cleaned.replace(/\\\[([\s\S]*?)\\\]/g, (_m, g1) => `\n\n$$\n${g1.trim()}\n$$\n\n`);

  // 3b. Bağımsız veya satır başı '$' işaretlerini $$ bloğuna normalize et
  cleaned = cleaned.replace(/(?:^|\n)\s*(?:[-*]\s*)?(?:->\s*|>\s*)?\$\s*(?=\r?\n|$)/g, () => '\n$$');

  // 3c. Satır içi LaTeX içeren formülleri ($ \text{...} $) KaTeX bloklarına ($$ ... $$) dönüştür
  cleaned = cleaned.replace(/(?:->\s*|>\s*)?\$(?!\$)\s*([^\n$]*\\[a-zA-Z]+[^\n$]*?)\s*\$/g, (_m, g1) => {
    return `\n\n$$\n${g1.trim()}\n$$\n\n`;
  });

  // 3d. $$ ... $$ bloklarının içini temizle: içindeki boş satırları ve gereksiz boşlukları temizle
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, (_match: string, inner: string) => {
    const cleanedInner = inner
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .join('\n');
    return `\n\n$$\n${cleanedInner}\n$$\n\n`;
  });

  // 3e. Satır içi LaTeX parantezlerini dönüştür: \( \text{...} \)
  cleaned = cleaned.replace(/\\\((\s*\\text\{.*?\}\s*)\\\)/g, (_m, g1) => `\n\n$$${g1}$$\n\n`);
  cleaned = cleaned.replace(/\\\((\s*\\frac\{.*?\}\{.*?\}\s*)\\\)/g, (_m, g1) => `\n\n$$${g1}$$\n\n`);
  cleaned = cleaned.replace(/\\\((.*?)\\\)/g, '$1');

  // 3f. $$ blokları etrafındaki boşlukları düzenle
  cleaned = cleaned.replace(/\n{3,}\$\$/g, () => '\n\n$$');
  cleaned = cleaned.replace(/\$\$\n{3,}/g, () => '$$\n\n');

  // 4. Mükerrer 'Analist Kararı:' kartlarını önle: Yalnızca raporun en sonundaki nihai karar bloğu kart olarak çizilmeli
  const sectionViIdx = cleaned.search(/(?:##\s*(?:VI\b|6\b|Vİ\b)|###\s*(?:VI\b|6\b|Vİ\b)|##\s*Nihai\s+Değerleme)/i);
  if (sectionViIdx !== -1) {
    const beforeSectionVi = cleaned.slice(0, sectionViIdx);
    const afterSectionVi = cleaned.slice(sectionViIdx);
    const sanitizedBefore = beforeSectionVi.replace(
      /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*{1,2})?(?:Analist\s+Karar[ıi]|Nihai\s+Karar)(?:\*{1,2})?\s*[:=-]?\s*/gi,
      '\n> **Ön Değerlendirme:** '
    );
    cleaned = sanitizedBefore + afterSectionVi;
  }

  const verdictHeadingRegex = /(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*{1,2})?Analist\s+Karar[ıi](?:\*{1,2})?\s*[:=-]/gi;
  const verdictMatches = Array.from(cleaned.matchAll(verdictHeadingRegex));
  if (verdictMatches.length > 1) {
    let seen = 0;
    cleaned = cleaned.replace(verdictHeadingRegex, (match) => {
      seen++;
      if (seen < verdictMatches.length) {
        return '\n> **Ön Değerlendirme:**';
      }
      return match;
    });
  }

  // 4b. Section VI sonundaki Analist Kararı ve devamındaki Yatırım Tezi / Katalizör / Riskler satırlarını tek blokta birleştir
  cleaned = cleaned.replace(
    /((?:^|\n)\s*(?:#{1,4}\s*)?(?:\*{1,2})?Analist\s+Karar[ıi](?:\*{1,2})?\s*[:=-][^\n]*)\n{2,}((?:\*{1,2})?Yatırım\s+Tezi)/gi,
    '$1\n$2'
  );
  cleaned = cleaned.replace(
    /((?:\*{1,2})?Yatırım\s+Tezi[^\n]*)\n{2,}((?:\*{1,2})?Kilit\s+Katalizörler)/gi,
    '$1\n$2'
  );
  cleaned = cleaned.replace(
    /((?:\*{1,2})?Kilit\s+Katalizörler[^\n]*)\n{2,}((?:\*{1,2})?Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı)/gi,
    '$1\n$2'
  );

  // 5. Fazla boş satırları normalize et
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

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

export default function ValuationTerminal({
  initialTicker,
  initialReport,
  initialTab,
  initialLayout,
}: {
  initialTicker?: string;
  initialReport?: SavedReport | null;
  initialTab?: 'ozet' | 'overview' | 'fairvalue' | 'tables' | 'multiples' | 'proscons' | 'guidance' | 'report' | 'history';
  initialLayout?: 'terminal' | 'simply';
} = {}) {
  // SSR'den gelen initialReport (Yalnızca veritabanında kayıtlı gerçek raporlar)
  const defaultReport = initialReport || null;

  const [mounted, setMounted] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'terminal' | 'simply'>(initialLayout || 'terminal');
  const [ticker, setTicker] = useState(defaultReport?.ticker || initialTicker || '');
  const [price, setPrice] = useState(defaultReport?.price || '');
  const [consensus, setConsensus] = useState('');
  const [peerMultiples, setPeerMultiples] = useState('');
  const [selectedSector, setSelectedSector] = useState<SectorType | 'AUTO'>('AUTO');
  const [chartMode, setChartMode] = useState<'quarterly' | 'ttm'>('quarterly');
  const [isHeatmapActive, setIsHeatmapActive] = useState<boolean>(true);
  const [financialFiles, setFinancialFiles] = useState<File[]>([]);
  const [activityFiles, setActivityFiles] = useState<File[]>([]);
  const [presentationFiles, setPresentationFiles] = useState<File[]>([]);
  const financialInputRef = useRef<HTMLInputElement>(null);
  const activityInputRef = useRef<HTMLInputElement>(null);
  const presentationInputRef = useRef<HTMLInputElement>(null);
  const appendFinancialInputRef = useRef<HTMLInputElement>(null);
  const [pipelineStep, setPipelineStep] = useState<1 | 2 | 3 | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<number>(0);
  const files = useMemo(() => [...financialFiles, ...activityFiles, ...presentationFiles], [financialFiles, activityFiles, presentationFiles]);

  const handleAddFinancialFiles = (newFiles: FileList | File[]) => {
    const list = Array.from(newFiles).filter(f => 
      f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );
    if (list.length === 0) return;
    setFinancialFiles(prev => {
      const existingKeys = new Set(prev.map(f => `${f.name}_${f.size}`));
      const filtered = list.filter(f => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...filtered];
    });
  };

  const handleAddActivityFiles = (newFiles: FileList | File[]) => {
    const list = Array.from(newFiles).filter(f => 
      f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );
    if (list.length === 0) return;
    setActivityFiles(prev => {
      const existingKeys = new Set(prev.map(f => `${f.name}_${f.size}`));
      const filtered = list.filter(f => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...filtered];
    });
  };

  const handleAddPresentationFiles = (newFiles: FileList | File[]) => {
    const list = Array.from(newFiles).filter(f => 
      f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );
    if (list.length === 0) return;
    setPresentationFiles(prev => {
      const existingKeys = new Set(prev.map(f => `${f.name}_${f.size}`));
      const filtered = list.filter(f => !existingKeys.has(`${f.name}_${f.size}`));
      return [...prev, ...filtered];
    });
  };

  // Aşama durumu: Yalnızca kayıtlı rapor varsa 'report', aksi halde doğrudan 'input' (Arama ve analiz formu)
  const [step, setStep] = useState<'input' | 'review' | 'report' | 'leaderboard'>(
    defaultReport ? 'report' : 'input'
  );
  const [extractedData, setExtractedData] = useState<any>(defaultReport?.extractedData || null);

  // Ana Sekmeler
  const [activeTab, setActiveTab] = useState<'ozet' | 'overview' | 'fairvalue' | 'tables' | 'multiples' | 'proscons' | 'guidance' | 'report' | 'history'>(
    initialTab || 'ozet'
  );

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
  const [showCashQualityExplainer, setShowCashQualityExplainer] = useState<boolean>(false);

  const [copiedReport, setCopiedReport] = useState(false);
  const [fontSizeMode, setFontSizeMode] = useState<'normal' | 'large' | 'compact'>('normal');
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');

  const toggleThemeMode = useCallback(() => {
    setThemeMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('fin_ui_theme', next);
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', next);
        }
      } catch (e) {}
      return next;
    });
  }, []);

  const [sidebarSort, setSidebarSort] = useState<'rank' | 'date'>('rank');
  const [collapsedDecisions, setCollapsedDecisions] = useState<Record<string, boolean>>({});
  const [isThemesModalOpen, setIsThemesModalOpen] = useState<boolean>(false);
  const [selectedThemeFilter, setSelectedThemeFilter] = useState<InvestmentThemeId | 'ALL'>('ALL');
  const [themeSearchTerm, setThemeSearchTerm] = useState<string>('');
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [leaderboardFilter, setLeaderboardFilter] = useState<'ALL' | 'AL' | 'NÖTR' | 'ALMA'>('ALL');
  const [sectorSearchTerm, setSectorSearchTerm] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [isCloudConfigured, setIsCloudConfigured] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [savedReports, setSavedReports] = useState<SavedReport[]>(defaultReport ? [defaultReport] : []);
  const [activeReportId, setActiveReportId] = useState<string | null>(defaultReport ? defaultReport.id : null);
  const activeReport = useMemo(() => {
    if (activeReportId) {
      const found = savedReports.find(r => r.id === activeReportId);
      if (found) return found;
    }
    const currentTicker = (ticker || initialTicker || '').trim().toUpperCase();
    if (currentTicker) {
      const byTicker = savedReports.find(r => r.ticker?.toUpperCase() === currentTicker);
      if (byTicker) return byTicker;
    }
    if (defaultReport && (!currentTicker || defaultReport.ticker?.toUpperCase() === currentTicker)) {
      return defaultReport;
    }
    // ASLA başka bir şirketin raporuna otomatik olarak atlama
    return null;
  }, [savedReports, activeReportId, ticker, initialTicker, defaultReport]);

  // Analiz Edilen Şirketler Modal & Filtre Durumu
  const [isAnalyzedModalOpen, setIsAnalyzedModalOpen] = useState(false);
  const [analyzedTab, setAnalyzedTab] = useState<'ALL' | 'AL' | 'NÖTR' | 'ALMA'>('ALL');
  const [analyzedSearch, setAnalyzedSearch] = useState('');

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

  const toggleDecisionCollapse = (decisionKey: string) => {
    setCollapsedDecisions(prev => ({
      ...prev,
      [decisionKey]: !prev[decisionKey]
    }));
  };

  const sortReportsByScoreDesc = (reports: SavedReport[]) => {
    return [...reports].sort((a, b) => {
      const scoreA = parseFloat(String(a.score || '0').replace(/[^0-9.]/g, '')) || 0;
      const scoreB = parseFloat(String(b.score || '0').replace(/[^0-9.]/g, '')) || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
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
      // 1. O hisseye ait TÜM kopyaları/kayıtları yerel hafızadan temizle (farklı tarihlerde yapılmış olsa bile)
      const updated = savedReports.filter(r => r.id !== id && r.ticker?.toUpperCase() !== tickerName.toUpperCase());
      setSavedReports(updated);
      try {
        localStorage.setItem('fin_valuation_reports', JSON.stringify(updated));
      } catch (err) {}

      // 2. Buluttan hem ID hem de ticker bazında sil
      try {
        await fetch(`/api/reports?id=${encodeURIComponent(id)}&ticker=${encodeURIComponent(tickerName)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.warn('Buluttan silme başarısız:', err);
      }

      // 3. Ekran ve URL senkronizasyonu:
      if (activeReport?.ticker?.toUpperCase() === tickerName.toUpperCase() || activeReportId === id) {
        if (updated.length > 0) {
          // Listede kalan ilk raporu göster ve URL'yi güncelle
          setActiveReportId(updated[0].id);
          setTicker(updated[0].ticker);
          setStep('report');
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', `/analysis/${updated[0].ticker.toUpperCase()}`);
          }
        } else {
          // Başka rapor kalmadıysa DOĞRUDAN ANA SAYFAYA DÖN ve URL'yi '/' yap
          setActiveReportId(null);
          setTicker('');
          setStep('input');
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', '/');
          }
        }
      }
    }
  };

  // Doğrudan URL veya Harici Çağrı ile Hisse Yükleme (/analysis/[ticker])
  const loadTickerDirect = useCallback(async (targetTicker: string, currentSaved?: SavedReport[]) => {
    const t = (targetTicker || '').trim().toUpperCase();
    if (!t) return;

    // 1. Mevcut kaydedilmiş yerel depodaki raporlar
    const reportList = currentSaved ?? savedReports;
    const existing = reportList.find(r => r.ticker?.toUpperCase() === t);
    if (existing) {
      setActiveReportId(existing.id);
      setTicker(existing.ticker);
      if (existing.price) setPrice(existing.price);
      if (existing.extractedData) setExtractedData(existing.extractedData);
      setStep('report');
      setActiveTab(initialTab || 'ozet');
      setLoading(false);
      return;
    }

    // 2. Bulut veritabanında var mı?
    setLoading(true);
    setStatusMessage(`${t} bulut kayıtları kontrol ediliyor...`);
    try {
      const res = await fetch(`/api/reports?ticker=${encodeURIComponent(t)}`);
      if (res.ok) {
        const json = await res.json();
        if (json?.report && json.report.ticker?.toUpperCase() === t) {
          const apiReport: SavedReport = json.report;
          setSavedReports(prev => {
            const has = prev.some(r => r.id === apiReport.id || r.ticker?.toUpperCase() === t);
            const next = has ? prev : [apiReport, ...prev];
            try { localStorage.setItem('fin_valuation_reports', JSON.stringify(next)); } catch {}
            return next;
          });
          setActiveReportId(apiReport.id);
          setTicker(apiReport.ticker);
          if (apiReport.price) setPrice(apiReport.price);
          if (apiReport.extractedData) setExtractedData(apiReport.extractedData);
          setStep('report');
          setActiveTab(initialTab || 'ozet');
          setLoading(false);
          return;
        }
      }
    } catch (err) {
      console.warn('Direct ticker cloud fetch error:', err);
    }

    // 3. Rapor hiçbir yerde yoksa: KULLANICININ İSTEDİĞİ GİBİ DOĞRUDAN ANA SAYFA GELİR
    setActiveReportId(null);
    setTicker(t);
    setStep('input');
    setLoading(false);
  }, [savedReports, initialTab]);

  // Tüm Metin & Tablo Verilerini Kopyalama
  const [copiedNotebookLM, setCopiedNotebookLM] = useState(false);
  const handleCopyNotebookLM = useCallback(async () => {
    if (!activeReport) return;
    const fullMd = generateFullAuditMarkdown(activeReport);
    try {
      await navigator.clipboard.writeText(fullMd);
      setCopiedNotebookLM(true);
      setTimeout(() => setCopiedNotebookLM(false), 2500);
    } catch (err) {
      prompt('Bütüncül Rapor Markdown Metni:', fullMd);
    }
  }, [activeReport]);

  useEffect(() => {
    setMounted(true);
    try {
      const savedTheme = localStorage.getItem('fin_ui_theme') as 'dark' | 'light' | null;
      const initialTheme = savedTheme === 'light' ? 'light' : 'dark';
      setThemeMode(initialTheme);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', initialTheme);
      }
    } catch (e) {}

    let localData: SavedReport[] = [];
    try {
      const stored = localStorage.getItem('fin_valuation_reports');
      if (stored) {
        localData = JSON.parse(stored);
      }
    } catch (e) {}

    // EĞER defaultReport (SSR'den gelen veya statik hazır model) tanımlıysa ve yerel depoda yoksa birleştir
    if (defaultReport) {
      const idx = localData.findIndex(r => r.id === defaultReport.id || r.ticker?.toUpperCase() === defaultReport.ticker?.toUpperCase());
      if (idx === -1) {
        localData = [defaultReport, ...localData];
      } else {
        localData[idx] = defaultReport;
      }
    }

    setSavedReports(localData);

    // Doğrudan URL veya initialTicker kontrolü (/analysis/VESBE veya /report/VESBE)
    let pathTicker = '';
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/(?:analysis|report|simply)\/([A-Za-z0-9_]+)/i);
      if (match && match[1]) {
        pathTicker = match[1].toUpperCase();
      }
    }
    const targetTicker = (initialTicker || pathTicker || '').trim().toUpperCase();

    if (targetTicker) {
      const matched = localData.find(r => r.ticker?.toUpperCase() === targetTicker) || (defaultReport?.ticker?.toUpperCase() === targetTicker ? defaultReport : null);
      if (matched) {
        setActiveReportId(matched.id);
        setTicker(matched.ticker);
        if (matched.price) setPrice(matched.price);
        if (matched.extractedData) setExtractedData(matched.extractedData);
        setStep('report');
        if (!initialTab) setActiveTab('ozet');
        setLoading(false);
      } else {
        // Yerel depoda yoksa buluttan kontrol et. Bulutta da yoksa loadTickerDirect step='input' yapacaktır.
        loadTickerDirect(targetTicker, localData);
      }
    } else {
      // Hedef bir hisse belirtilmemişse (ana sayfa / veya /simply):
      // ASLA otomatik olarak kaydedilmiş bir şirketi açıp /analysis/XXX adresine yönlendirme yapma.
      // Kullanıcıyı her zaman doğrudan YENİ ANALİZ paneli ('input') karşılasın.
      setActiveReportId(null);
      setTicker('');
      setStep('input');
      setLoading(false);
    }

    const syncWithCloud = async () => {
      try {
        setIsSyncing(true);
        const res = await fetch('/api/reports');
        if (res.ok) {
          const text = await res.text();
          let json: any = null;
          try {
            json = JSON.parse(text);
          } catch {
            console.warn('Geçersiz reports JSON yanıtı');
          }
          if (json) {
            setIsCloudConfigured(Boolean(json.isCloudConfigured));
            if (json.isCloudConfigured && Array.isArray(json.reports) && json.reports.length > 0) {
              const tickerMap = new Map<string, SavedReport>();
              const allReports = [...localData, ...json.reports].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
              for (const rep of allReports) {
                const sym = (rep.ticker || '').toUpperCase();
                if (sym && !tickerMap.has(sym)) {
                  tickerMap.set(sym, rep);
                }
              }
              const merged = Array.from(tickerMap.values());
              setSavedReports(merged);
              localStorage.setItem('fin_valuation_reports', JSON.stringify(merged));
            }
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

  // Adres Çubuğu Senkronizasyonu (Shareable URL: /analysis/HISSE_KODU veya /simply/HISSE_KODU)
  useEffect(() => {
    if (typeof window !== 'undefined' && mounted) {
      if (step === 'report' && activeReport?.ticker) {
        const isSimply = layoutMode === 'simply' || window.location.pathname.startsWith('/simply');
        const targetPath = isSimply
          ? `/simply/${activeReport.ticker.toUpperCase()}`
          : `/analysis/${activeReport.ticker.toUpperCase()}`;
        if (window.location.pathname !== targetPath && !window.location.pathname.startsWith('/report/')) {
          window.history.replaceState(null, '', targetPath);
        }
      } else if (step === 'input') {
        if (
          window.location.pathname.startsWith('/analysis/') ||
          window.location.pathname.startsWith('/report/') ||
          window.location.pathname.startsWith('/simply/')
        ) {
          const rootTarget = layoutMode === 'simply' || window.location.pathname.startsWith('/simply') ? '/simply' : '/';
          window.history.replaceState(null, '', rootTarget);
        }
      }
    }
  }, [step, activeReport?.ticker, mounted, layoutMode]);

  const saveReport = async (newReport: SavedReport) => {
    const updated = [newReport, ...savedReports.filter(r => r.id !== newReport.id && r.ticker?.toUpperCase() !== newReport.ticker?.toUpperCase())];
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

  // Dosya Kaldırma & Ekleme İşleyicileri (3 Alanlı Mimari)
  const removeFinancialFile = (index: number) => {
    setFinancialFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeActivityFile = (index: number) => {
    setActivityFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removePresentationFile = (index: number) => {
    setPresentationFiles(prev => prev.filter((_, i) => i !== index));
  };

  // İlave Dönem / Çeyrek Raporu Ekleme İşleyicisi
  const handleAppendFinancialReport = async (newFiles: FileList | File[]) => {
    const list = Array.from(newFiles).filter(f =>
      f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );
    if (list.length === 0 || !extractedData) return;

    setLoading(true);
    setError(null);
    setStatusMessage(`İlave ${list.length} adet finansal rapor taranıyor...`);

    try {
      let accumulated = { ...extractedData };
      const activeSector = selectedSector === 'AUTO' ? detectSector(ticker || accumulated.ticker) : selectedSector;

      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        setStatusMessage(`İlave rapor taranıyor (${i + 1}/${list.length}): ${file.name}...`);

        if (i > 0) {
          // Gemini Free Tier 5 RPM kotasını korumak için ardışık dosyalar arasına 2.5 sn ara koy
          setStatusMessage(`API hız kotası koruması: ${file.name} hazırlanıyor...`);
          await new Promise((r) => setTimeout(r, 2500));
        }

        let fileDocText = '';
        try {
          const arrayBuffer = await file.arrayBuffer();
          const { text, isScannedPdf } = await extractSmartDocumentText(arrayBuffer.slice(0), 'financial');
          if (!isScannedPdf) {
            fileDocText = text?.trim() || '';
          }
        } catch (err) {
          console.warn(`[Append PDF] ${file.name} okunamadı:`, err);
        }

        // Sunucuya aktarılan önceki veriyi temiz ve hafif tut (gereksiz rapor metinlerini ve büyük yapıları ayıkla)
        const sanitizedPrevData = {
          ticker: accumulated.ticker || ticker,
          sector: accumulated.sector || activeSector,
          currency: accumulated.currency,
          reporting_period: accumulated.reporting_period,
          share_count: accumulated.share_count,
          financial_history: accumulated.financial_history || [],
          balance_sheet_summary: accumulated.balance_sheet_summary || [],
          debt_and_interest: accumulated.debt_and_interest || {},
          guidance_track_record: accumulated.guidance_track_record || [],
          pros_cons: accumulated.pros_cons || { pros: [], cons: [] }
        };

        let res: Response;
        if (fileDocText.length > 50) {
          res = await fetchWithClientRetry(
            () => fetch('/api/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ticker: accumulated.ticker || ticker,
                price: price || accumulated.valuation?.current_price || '0',
                category: 'financial',
                documents: [{ name: file.name, text: fileDocText, category: 'financial' }],
                previousData: sanitizedPrevData
              })
            }),
            setStatusMessage
          );
        } else {
          let fileChunks: Uint8Array[] = [];
          try {
            const arrayBuffer = await file.arrayBuffer();
            fileChunks = await splitScannedPdfIntoChunks(arrayBuffer.slice(0), 5, 10);
          } catch (err) {
            console.warn(`[Append Split Error] ${file.name}:`, err);
          }

          if (fileChunks.length === 0) {
            fileChunks = [new Uint8Array((await file.arrayBuffer()).slice(0))];
          }

          for (let cIdx = 0; cIdx < fileChunks.length; cIdx++) {
            const chunkBytes = fileChunks[cIdx];
            const chunkBlob = new Blob([chunkBytes as unknown as BlobPart], { type: 'application/pdf' });
            const chunkFile = new File([chunkBlob], `${file.name}_part${cIdx + 1}.pdf`, { type: 'application/pdf' });

            const chunkLabel = fileChunks.length > 1 
              ? (cIdx === 0 ? 'Bilanço (Sayfa 1-5)' : 'Gelir & Nakit Akış (Sayfa 6-10)')
              : 'Finansal Tablo';

            setStatusMessage(`İlave rapor işleniyor (${cIdx + 1}/${fileChunks.length}): ${file.name} [${chunkLabel}]...`);

            if (cIdx > 0) {
              await new Promise((r) => setTimeout(r, 1200));
            }

            const currentSanitized = {
              ticker: accumulated.ticker || ticker,
              sector: accumulated.sector || activeSector,
              currency: accumulated.currency,
              reporting_period: accumulated.reporting_period,
              share_count: accumulated.share_count,
              financial_history: accumulated.financial_history || [],
              balance_sheet_summary: accumulated.balance_sheet_summary || [],
              debt_and_interest: accumulated.debt_and_interest || {},
              guidance_track_record: accumulated.guidance_track_record || [],
              pros_cons: accumulated.pros_cons || { pros: [], cons: [] }
            };

            const fd = new FormData();
            fd.append('ticker', accumulated.ticker || ticker);
            fd.append('price', price || accumulated.valuation?.current_price || '0');
            fd.append('category', 'financial');
            fd.append('previousData', JSON.stringify(currentSanitized));
            fd.append('files_financial', chunkFile);

            res = await fetchWithClientRetry(
              () => fetch('/api/extract', { method: 'POST', body: fd }),
              setStatusMessage
            );

            const result = await parseApiResponse(res, `${file.name} (${chunkLabel}) ilave veri çıkarımı başarısız oldu.`);
            if (result?.data) {
              accumulated = result.data;
            }
          }
        }
      }

      accumulated.sector = activeSector;
      const sanitized = enrichAndSanitizeFinancialHistory(accumulated);
      const { drivers, valuation } = computeSectorValuationAndDrivers(sanitized, price || sanitized.valuation?.current_price || '0', activeSector);
      sanitized.fair_value_drivers = drivers;
      sanitized.valuation = valuation;

      setExtractedData(sanitized);
      setStatusMessage('İlave dönem verileri başarıyla zaman serisine eklendi!');
    } catch (err: any) {
      setError(`İlave rapor eklenirken hata: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  // ⚡ Borsa İstanbul Resmi Veri Akışı + Opsiyonel Faaliyet Raporu & Yatırımcı Sunumu Zenginleştirme
  const handleBistDirectAnalysis = async (symbolToAnalyze?: string) => {
    const targetTicker = (symbolToAnalyze || ticker || '').toUpperCase().trim();
    if (!targetTicker) {
      setError('Lütfen analiz etmek istediğiniz hisse kodunu yazın (Örn: AGESA, THYAO, EREGL).');
      return;
    }

    setLoading(true);
    setError(null);
    setTicker(targetTicker);
    setPipelineStep(1);
    setPipelineProgress(25);
    setStatusMessage(`[1/3] Borsa İstanbul resmi mali tabloları ve canlı piyasa fiyatı çekiliyor: ${targetTicker}...`);

    try {
      const res = await fetchWithClientRetry(
        () => fetch(`/api/bist?ticker=${encodeURIComponent(targetTicker)}&t=${Date.now()}`, { cache: 'no-store' }),
        setStatusMessage
      );
      const bistData = await parseApiResponse(res, `${targetTicker} için BIST verisi çekilemedi.`, 'bist');
      if (!bistData || !Array.isArray(bistData.financial_history) || bistData.financial_history.length === 0) {
        throw new Error(`${targetTicker} için BIST mali tablosu bulunamadı.`);
      }

      const livePriceStr = bistData.current_price ? bistData.current_price.toString() : (price || '100');
      if (bistData.current_price) {
        setPrice(livePriceStr);
      }
      if (bistData.sector) {
        setSelectedSector(bistData.sector);
      }

      let currentData: any = {
        ...bistData,
        fair_value_drivers: bistData.drivers || bistData.fair_value_drivers
      };

      const prevSavedForTicker = savedReports.find(r => r.ticker === targetTicker);

      // OPSİYONEL ADIM 2: Faaliyet Raporları (Alan 2) Varsa Zenginleştir
      if (activityFiles.length > 0) {
        setPipelineStep(2);
        setPipelineProgress(55);
        setStatusMessage(`[2/3] Faaliyet Raporu taranıyor (${activityFiles.length} belge)...`);

        try {
          const perActFileBudget = Math.max(35000, Math.floor(70000 / Math.max(1, activityFiles.length)));
          const activityDocs: { name: string; text: string; category: string }[] = [];
          for (let i = 0; i < activityFiles.length; i++) {
            const file = activityFiles[i];
            setStatusMessage(`[2/3] Faaliyet Raporu okunuyor (${i + 1}/${activityFiles.length}): ${file.name}...`);
            try {
              const arrayBuffer = await file.arrayBuffer();
              const { text } = await extractSmartDocumentText(arrayBuffer.slice(0), 'activity');
              if (text && text.trim().length > 50) {
                activityDocs.push({ name: file.name, text: text.trim().slice(0, perActFileBudget), category: 'activity' });
              }
            } catch (err) {
              console.warn(`[Activity PDF] ${file.name} okunamadı:`, err);
            }
          }

          let res2: Response;
          if (activityDocs.length > 0) {
            setStatusMessage(`[2/3] ${activityDocs.length} yıllık faaliyet raporundan yönetim hedefleri ve Güçlü/Zayıf yönler ayıklanıyor...`);
            res2 = await fetchWithClientRetry(
              () => fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ticker: targetTicker,
                  price: livePriceStr,
                  category: 'activity',
                  documents: activityDocs,
                  previousData: currentData,
                  previousReport: prevSavedForTicker || null
                })
              }),
              setStatusMessage
            );
          } else {
            // İstemci tarafında metin çıkarılamadıysa (taranmış PDF / unpdf hatası), doğrudan sunucuya ilet
            setStatusMessage(`[2/3] Faaliyet raporu sunucu motoruna aktarılıyor (${activityFiles.length} belge)...`);
            const fd = new FormData();
            fd.append('ticker', targetTicker);
            fd.append('price', livePriceStr);
            fd.append('category', 'activity');
            fd.append('previousData', JSON.stringify(currentData));
            if (prevSavedForTicker) fd.append('previousReport', JSON.stringify(prevSavedForTicker));
            activityFiles.forEach(f => fd.append('files_activity', f));
            res2 = await fetchWithClientRetry(
              () => fetch('/api/extract', { method: 'POST', body: fd }),
              setStatusMessage
            );
          }

          const result2 = await parseApiResponse(res2, 'Faaliyet raporu zenginleştirmesi tamamlanamadı.');
          if (result2?.data) {
            const mergedGuidance = (Array.isArray(result2.data.guidance_track_record) && result2.data.guidance_track_record.length > 0)
              ? result2.data.guidance_track_record
              : currentData.guidance_track_record;
            currentData = {
              ...currentData,
              ...result2.data,
              guidance_track_record: mergedGuidance,
              currency: currentData.currency,
              financial_history: currentData.financial_history // Resmi BIST mali tablolarını koru
            };
          }
        } catch (actErr: any) {
          console.warn('[Activity Enrichment Warning]:', actErr.message);
        }
      }

      // OPSİYONEL ADIM 3: Yatırımcı Sunumu (Alan 3) Varsa Zenginleştir
      if (presentationFiles.length > 0) {
        if (activityFiles.length > 0) {
          await new Promise((r) => setTimeout(r, 1500));
        }
        setPipelineStep(3);
        setPipelineProgress(80);
        setStatusMessage(`[3/3] Yatırımcı Sunumu taranıyor (${presentationFiles.length} belge)...`);

        try {
          const perPresFileBudget = Math.max(35000, Math.floor(70000 / Math.max(1, presentationFiles.length)));
          const presentationDocs: { name: string; text: string; category: string }[] = [];
          for (let i = 0; i < presentationFiles.length; i++) {
            const file = presentationFiles[i];
            setStatusMessage(`[3/3] Yatırımcı Sunumu okunuyor (${i + 1}/${presentationFiles.length}): ${file.name}...`);
            try {
              const arrayBuffer = await file.arrayBuffer();
              const { text } = await extractSmartDocumentText(arrayBuffer.slice(0), 'presentation');
              if (text && text.trim().length > 50) {
                presentationDocs.push({ name: file.name, text: text.trim().slice(0, perPresFileBudget), category: 'presentation' });
              }
            } catch (err) {
              console.warn(`[Presentation PDF] ${file.name} okunamadı:`, err);
            }
          }

          let res3: Response;
          if (presentationDocs.length > 0) {
            setStatusMessage(`[3/3] ${presentationDocs.length} yatırımcı sunumundan ileriye dönük hedefler ve rehberlik karnesi entegre ediliyor...`);
            res3 = await fetchWithClientRetry(
              () => fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ticker: targetTicker,
                  price: livePriceStr,
                  category: 'presentation',
                  documents: presentationDocs,
                  previousData: currentData,
                  previousReport: prevSavedForTicker || null
                })
              }),
              setStatusMessage
            );
          } else {
            // İstemci tarafında metin çıkarılamadıysa doğrudan sunucuya ilet
            setStatusMessage(`[3/3] Yatırımcı sunumu sunucu motoruna aktarılıyor (${presentationFiles.length} belge)...`);
            const fd = new FormData();
            fd.append('ticker', targetTicker);
            fd.append('price', livePriceStr);
            fd.append('category', 'presentation');
            fd.append('previousData', JSON.stringify(currentData));
            if (prevSavedForTicker) fd.append('previousReport', JSON.stringify(prevSavedForTicker));
            presentationFiles.forEach(f => fd.append('files_presentation', f));
            res3 = await fetchWithClientRetry(
              () => fetch('/api/extract', { method: 'POST', body: fd }),
              setStatusMessage
            );
          }

          const result3 = await parseApiResponse(res3, 'Yatırımcı sunumu zenginleştirmesi tamamlanamadı.');
          if (result3?.data) {
            const mergedGuidance = (Array.isArray(result3.data.guidance_track_record) && result3.data.guidance_track_record.length > 0)
              ? result3.data.guidance_track_record
              : currentData.guidance_track_record;
            currentData = {
              ...currentData,
              ...result3.data,
              guidance_track_record: mergedGuidance,
              currency: currentData.currency,
              financial_history: currentData.financial_history // Resmi BIST mali tablolarını koru
            };
          }
        } catch (presErr: any) {
          console.warn('[Presentation Enrichment Warning]:', presErr.message);
        }
      }

      setPipelineProgress(100);
      setStatusMessage(`${targetTicker} için ${currentData.financial_history.length} çeyreklik resmi veri başarıyla yüklendi!`);

      setExtractedData(currentData);
      setStep('review');
    } catch (err: any) {
      console.error('[BIST Direct Analysis Error]:', err);
      setError(err.message || 'BIST verileri alınırken bir hata oluştu.');
    } finally {
      setLoading(false);
      setStatusMessage('');
      setPipelineStep(null);
      setPipelineProgress(0);
    }
  };

  // Aşama 1: 3 Alanlı Sıralı Pipeline Yürütümü (Timeout Önleyici Dosya Bazlı Yürütüm)
  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (financialFiles.length === 0) {
      setError('Lütfen Alan 1 için en az bir Finansal Rapor & Tablo PDF dokümanı ekleyin (Zorunlu).');
      return;
    }
    setLoading(true);
    setError(null);
    setPipelineStep(1);
    setPipelineProgress(15);
    setStatusMessage(`[1. Aşama / 3]: ${financialFiles.length} adet Finansal Tablo taranıyor...`);

    try {
      // -------------------------------------------------------------
      // ADIM 1: Alan 1: Finansal Raporlar & Tablolar (KAP / Bağımsız Denetim)
      // -------------------------------------------------------------
      setPipelineStep(1);
      setPipelineProgress(20);
      setStatusMessage(`[1. Aşama / 3]: ${financialFiles.length} adet Finansal Tablo taranıyor...`);

      const financialDocs: { name: string; text: string; category: string }[] = [];
      for (let i = 0; i < financialFiles.length; i++) {
        const file = financialFiles[i];
        setStatusMessage(`[1. Aşama / 3]: Finansal Tablo taranıyor (${i + 1}/${financialFiles.length}): ${file.name}...`);
        try {
          const arrayBuffer = await file.arrayBuffer();
          const { text, isScannedPdf } = await extractSmartDocumentText(arrayBuffer.slice(0), 'financial');
          if (!isScannedPdf && text && text.trim().length > 50) {
            financialDocs.push({ name: file.name, text: text.trim(), category: 'financial' });
          }
        } catch (err) {
          console.warn(`[Financial PDF] ${file.name} okunamadı:`, err);
        }
      }

      let currentData: any = null;

      // Gateway Timeout (504) Koruması: Her dosyayı sunucuya tekil (sıralı) göndererek
      // istek başına işlem süresini 2-4 saniyede tutuyoruz.
      if (financialDocs.length > 0) {
        for (let i = 0; i < financialDocs.length; i++) {
          const doc = financialDocs[i];
          const pct = Math.round(15 + ((i + 1) / financialDocs.length) * 20);
          setPipelineProgress(pct);
          setStatusMessage(`[1. Aşama / 3]: Finansal Tablo işleniyor (${i + 1}/${financialDocs.length}): ${doc.name}...`);

          if (i > 0) {
            // Gemini Free Tier 5 RPM kotasını korumak için ardışık dosyalar arasına 2 sn ara koy
            setStatusMessage(`[1. Aşama / 3]: API hız kotası koruması: ${doc.name} hazırlanıyor...`);
            await new Promise((r) => setTimeout(r, 2000));
          }

          const sanitizedPrevData = currentData ? {
            ticker: currentData.ticker || ticker,
            sector: currentData.sector,
            currency: currentData.currency,
            reporting_period: currentData.reporting_period,
            share_count: currentData.share_count,
            financial_history: currentData.financial_history || [],
            balance_sheet_summary: currentData.balance_sheet_summary || [],
            debt_and_interest: currentData.debt_and_interest || {},
          } : null;

          const res1 = await fetchWithClientRetry(
            () => fetch('/api/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                ticker, 
                price, 
                category: 'financial', 
                documents: [doc], 
                previousData: sanitizedPrevData 
              })
            }),
            setStatusMessage
          );

          const result1 = await parseApiResponse(res1, `${doc.name} finansal veri çıkarımı başarısız oldu.`);
          if (result1?.data) {
            currentData = result1.data;
          }
        }
      } else {
        for (let i = 0; i < financialFiles.length; i++) {
          const f = financialFiles[i];
          setStatusMessage(`[1. Aşama / 3]: Taranmış belge sayfaları inceleniyor: ${f.name}...`);
          
          let fileChunks: Uint8Array[] = [];
          try {
            const arrayBuffer = await f.arrayBuffer();
            fileChunks = await splitScannedPdfIntoChunks(arrayBuffer.slice(0), 5, 10);
          } catch (err) {
            console.warn(`[Split Error] ${f.name}:`, err);
          }

          if (fileChunks.length === 0) {
            fileChunks = [new Uint8Array((await f.arrayBuffer()).slice(0))];
          }

          for (let cIdx = 0; cIdx < fileChunks.length; cIdx++) {
            const chunkBytes = fileChunks[cIdx];
            const chunkBlob = new Blob([chunkBytes as unknown as BlobPart], { type: 'application/pdf' });
            const chunkFile = new File([chunkBlob], `${f.name}_part${cIdx + 1}.pdf`, { type: 'application/pdf' });

            const chunkLabel = fileChunks.length > 1 
              ? (cIdx === 0 ? 'Bilanço (Sayfa 1-5)' : 'Gelir & Nakit Akış (Sayfa 6-10)')
              : 'Finansal Tablo';

            const pct = Math.round(15 + (((i * fileChunks.length) + (cIdx + 1)) / (financialFiles.length * fileChunks.length)) * 20);
            setPipelineProgress(pct);
            setStatusMessage(`[1. Aşama / 3]: ${chunkLabel} taranıyor (${cIdx + 1}/${fileChunks.length}): ${f.name}...`);

            if (i > 0 || cIdx > 0) {
              await new Promise((r) => setTimeout(r, 1200));
            }

            const sanitizedPrevData = currentData ? {
              ticker: currentData.ticker || ticker,
              sector: currentData.sector,
              currency: currentData.currency,
              reporting_period: currentData.reporting_period,
              share_count: currentData.share_count,
              financial_history: currentData.financial_history || [],
              balance_sheet_summary: currentData.balance_sheet_summary || [],
              debt_and_interest: currentData.debt_and_interest || {},
            } : null;

            const fd = new FormData();
            fd.append('ticker', ticker);
            fd.append('price', price);
            fd.append('category', 'financial');
            if (sanitizedPrevData) fd.append('previousData', JSON.stringify(sanitizedPrevData));
            fd.append('files_financial', chunkFile);

            const res1 = await fetchWithClientRetry(
              () => fetch('/api/extract', { method: 'POST', body: fd }),
              setStatusMessage
            );

            const result1 = await parseApiResponse(res1, `${f.name} (${chunkLabel}) finansal veri çıkarımı başarısız oldu.`);
            if (result1?.data) {
              currentData = result1.data;
            }
          }
        }
      }

      if (!currentData || !Array.isArray(currentData.financial_history) || currentData.financial_history.length === 0) {
        throw new Error('Finansal tablolardan veri seti çıkarılamadı.');
      }

      // -------------------------------------------------------------
      // ADIM 2: Alan 2: Faaliyet Raporları (Opsiyonel)
      // -------------------------------------------------------------
      if (activityFiles.length > 0) {
        setPipelineStep(2);
        setPipelineProgress(45);
        setStatusMessage(`[2. Aşama / 3]: ${activityFiles.length} adet Faaliyet Raporu taranıyor...`);

        try {
          const activityDocs: { name: string; text: string; category: string }[] = [];
          for (let i = 0; i < activityFiles.length; i++) {
            const file = activityFiles[i];
            setStatusMessage(`[2. Aşama / 3]: Faaliyet Raporu taranıyor (${i + 1}/${activityFiles.length}): ${file.name}...`);
            try {
              const arrayBuffer = await file.arrayBuffer();
              const { text } = await extractSmartDocumentText(arrayBuffer.slice(0), 'activity');
              if (text && text.trim().length > 50) {
                activityDocs.push({ name: file.name, text: text.trim(), category: 'activity' });
              }
            } catch (err) {
              console.warn(`[Activity PDF] ${file.name} okunamadı:`, err);
            }
          }

          setPipelineProgress(66);
          setStatusMessage(`[2. Aşama / 3]: Faaliyet raporundan yönetim hedefleri ve riskler ayıklanıyor...`);

          const normUploadTicker = (ticker || '').toUpperCase().trim();
          const prevSavedForUpload = savedReports.find(r => r.ticker === normUploadTicker);

          let res2: Response;
          if (activityDocs.length > 0) {
            res2 = await fetchWithClientRetry(
              () => fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, price, category: 'activity', documents: activityDocs, previousData: currentData, previousReport: prevSavedForUpload || null })
              }),
              setStatusMessage
            );
          } else {
            const fd = new FormData();
            fd.append('ticker', ticker);
            fd.append('price', price);
            fd.append('category', 'activity');
            fd.append('previousData', JSON.stringify(currentData));
            if (prevSavedForUpload) fd.append('previousReport', JSON.stringify(prevSavedForUpload));
            activityFiles.forEach(f => fd.append('files_activity', f));
            res2 = await fetchWithClientRetry(
              () => fetch('/api/extract', { method: 'POST', body: fd }),
              setStatusMessage
            );
          }

          const result2 = await parseApiResponse(res2, 'Faaliyet raporu analizi başarısız oldu.');
          if (result2?.data) {
            currentData = result2.data;
          }
        } catch (actErr: any) {
          console.warn('[Activity Extraction Warning]:', actErr.message);
        }
      } else {
        setPipelineProgress(66);
      }

      // -------------------------------------------------------------
      // ADIM 3: Alan 3: Yatırımcı Sunumu & Strateji Dokümanları (Opsiyonel)
      // -------------------------------------------------------------
      if (presentationFiles.length > 0) {
        setPipelineStep(3);
        setPipelineProgress(75);
        setStatusMessage(`[3. Aşama / 3]: ${presentationFiles.length} adet Yatırımcı Sunumu taranıyor...`);

        try {
          const presentationDocs: { name: string; text: string; category: string }[] = [];
          for (let i = 0; i < presentationFiles.length; i++) {
            const file = presentationFiles[i];
            setStatusMessage(`[3. Aşama / 3]: Yatırımcı Sunumu taranıyor (${i + 1}/${presentationFiles.length}): ${file.name}...`);
            try {
              const arrayBuffer = await file.arrayBuffer();
              const { text } = await extractSmartDocumentText(arrayBuffer.slice(0), 'presentation');
              if (text && text.trim().length > 50) {
                presentationDocs.push({ name: file.name, text: text.trim(), category: 'presentation' });
              }
            } catch (err) {
              console.warn(`[Presentation PDF] ${file.name} okunamadı:`, err);
            }
          }

          setPipelineProgress(90);
          setStatusMessage(`[3. Aşama / 3]: Yatırımcı sunumundan ileriye dönük hedefler entegre ediliyor...`);

          const normUploadTickerPres = (ticker || '').toUpperCase().trim();
          const prevSavedForUploadPres = savedReports.find(r => r.ticker === normUploadTickerPres);

          let res3: Response;
          if (presentationDocs.length > 0) {
            res3 = await fetchWithClientRetry(
              () => fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker, price, category: 'presentation', documents: presentationDocs, previousData: currentData, previousReport: prevSavedForUploadPres || null })
              }),
              setStatusMessage
            );
          } else {
            const fd = new FormData();
            fd.append('ticker', ticker);
            fd.append('price', price);
            fd.append('category', 'presentation');
            fd.append('previousData', JSON.stringify(currentData));
            if (prevSavedForUploadPres) fd.append('previousReport', JSON.stringify(prevSavedForUploadPres));
            presentationFiles.forEach(f => fd.append('files_presentation', f));
            res3 = await fetchWithClientRetry(
              () => fetch('/api/extract', { method: 'POST', body: fd }),
              setStatusMessage
            );
          }

          const result3 = await parseApiResponse(res3, 'Yatırımcı sunumu analizi başarısız oldu.');
          if (result3?.data) {
            currentData = result3.data;
          }
        } catch (presErr: any) {
          console.warn('[Presentation Extraction Warning]:', presErr.message);
        }
      }

      setPipelineProgress(100);
      const activeSector = selectedSector === 'AUTO' ? detectSector(ticker) : selectedSector;
      currentData.sector = activeSector;

      // Son deterministik matematiksel zenginleştirme ve adil değerleme hesaplaması
      const sanitized = enrichAndSanitizeFinancialHistory(currentData);
      const { drivers, valuation } = computeSectorValuationAndDrivers(sanitized, price, activeSector);
      sanitized.fair_value_drivers = drivers;
      sanitized.valuation = valuation;

      setExtractedData(sanitized);
      setStep('review');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setStatusMessage('');
      setPipelineStep(null);
      setPipelineProgress(0);
    }
  };

  // Aşama 2: Çok Yıllı Değerleme ve Çeyreklik Karşılaştırma
  const handleEvaluate = async () => {
    setLoading(true);
    setError(null);
    const normalizedTicker = (ticker || extractedData?.ticker || '').toUpperCase().trim();
    if (!normalizedTicker) {
      setError('Hisse kodu bulunamadı. Lütfen analiz edilecek hisse kodunu belirtin.');
      setLoading(false);
      return;
    }

    // Fiyat çözümleme: Boşsa veya tanımsızsa otomatik olarak çıkarılan veriden veya canlı BIST servisinden al
    let effectivePrice = price != null && String(price).trim() !== '' ? String(price).trim() : '';
    if (!effectivePrice || isNaN(Number(effectivePrice)) || Number(effectivePrice) <= 0) {
      if (extractedData?.current_price && Number(extractedData.current_price) > 0) {
        effectivePrice = String(extractedData.current_price);
      } else if (Array.isArray(extractedData?.financial_history)) {
        const histWithPrice = [...extractedData.financial_history].reverse().find((p: any) => p.share_price && Number(p.share_price) > 0);
        if (histWithPrice?.share_price) {
          effectivePrice = String(histWithPrice.share_price);
        }
      }
      if (!effectivePrice || Number(effectivePrice) <= 0) {
        setStatusMessage(`${normalizedTicker} için canlı BIST piyasa fiyatı sorgulanıyor...`);
        try {
          const liveRes = await fetch(`/api/bist?ticker=${normalizedTicker}`);
          if (liveRes.ok) {
            const liveJson = await liveRes.json();
            if (liveJson?.current_price && Number(liveJson.current_price) > 0) {
              effectivePrice = String(liveJson.current_price);
            }
          }
        } catch (e) {
          console.warn('Canlı fiyat çekilemedi:', e);
        }
      }
      if (!effectivePrice || Number(effectivePrice) <= 0) {
        effectivePrice = '100.00';
      }
      setPrice(effectivePrice);
    }

    const previousReportsForTicker = savedReports.filter(r => r.ticker === normalizedTicker);
    const previousReport = previousReportsForTicker.length > 0 ? previousReportsForTicker[0] : null;

    const activeSector: SectorType = selectedSector === 'AUTO' 
      ? (extractedData?.sector || detectSector(normalizedTicker)) 
      : selectedSector;

    const sanitizedHistory = sanitizeHistoryData(
      extractedData?.financial_history || [], 
      extractedData?.debt_and_interest,
      activeSector,
      Number(effectivePrice) || 100,
      extractedData?.currency || 'TRY'
    );

    const enrichedExtractedData = extractedData ? {
      ...extractedData,
      sector: activeSector,
      financial_history: sanitizedHistory
    } : null;

    try {
      setStatusMessage('Değerleme modeli ve kurumsal analiz raporu üretiliyor...');
      const res = await fetchWithClientRetry(
        () => fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker: normalizedTicker,
            price: effectivePrice,
            consensus,
            peerMultiples,
            sectorOverride: activeSector,
            extractedData: enrichedExtractedData,
            previousReport: previousReport ? {
              id: previousReport.id,
              createdAt: previousReport.createdAt,
              period: previousReport.period,
              decision: previousReport.decision,
              score: previousReport.score,
              price: previousReport.price,
              fairValue: previousReport.fairValue,
              extractedData: previousReport.extractedData ? {
                reporting_period: previousReport.extractedData.reporting_period,
                fair_value_drivers: previousReport.extractedData.fair_value_drivers,
                future_targets_summary: previousReport.extractedData.future_targets_summary,
                guidance_track_record: previousReport.extractedData.guidance_track_record,
              } : undefined
            } : undefined
          })
        }),
        setStatusMessage
      );

      const data = await parseApiResponse(res, 'Değerleme tamamlanamadı.', 'analyze');

      let rawDecision: 'AL' | 'ALMA' | 'NÖTR' = 'NÖTR';
      const cleanReport = (data?.report || '')
        .replace(/\badli\s+değer\b/gi, 'adil değer')
        .replace(/\badli\s+deger\b/gi, 'adil değer');
      const reportText = cleanReport;
      const decisionMatch = reportText.match(/Analist\s+Karar[ıi]\s*[:=-]\s*\[?\s*\*?\*?\s*(ALMA|SAT|AL|NÖTR|NOTR|TUT)\s*\*?\*?\s*\]?/i);
      if (decisionMatch) {
        const d = decisionMatch[1].toUpperCase();
        if (d === 'ALMA' || d === 'SAT') rawDecision = 'ALMA';
        else if (d === 'AL') rawDecision = 'AL';
        else rawDecision = 'NÖTR';
      }

      const scoreMatch = 
        reportText.match(/\|\s*\*?\*?Toplam\s+Puan\*?\*?\s*\|\s*\*?\*?(\d{1,3})\*?\*?/i) ||
        reportText.match(/Toplam\s+Puan\s*[:=]\s*\*?\*?(\d{1,3})/i) ||
        reportText.match(/(\d{1,3})\s*\/\s*100/i);
      const score = scoreMatch ? scoreMatch[1] : (data.scoreResult?.totalScore != null ? String(data.scoreResult.totalScore) : undefined);
      const parsedPrice = parseFinancialNumber(effectivePrice);
      const targetVal = parseFinancialNumber(data.valuation?.composite_fair_value || data.valuation?.fair_value || data.valuation?.dcf_fair_value);
      const numericScore = score ? parseInt(score, 10) : data.scoreResult?.totalScore;

      const opt = optimizeFinalDecision({
        rawDecision: (data.optimization?.finalDecision || data.optimization?.rawDecision || rawDecision) as any,
        score: numericScore,
        valuation: data.valuation,
        marketPrice: parsedPrice,
        fairValue: targetVal,
        latestData: enrichedExtractedData?.financial_history?.[enrichedExtractedData?.financial_history?.length - 1],
        financialHistory: enrichedExtractedData?.financial_history,
        scoreResult: data.scoreResult,
        sector: activeSector
      });

      const finalDecision = data.optimization?.finalDecision || opt?.finalDecision || rawDecision;
      const finalReport = syncReportTextWithValuation(cleanReport, {
        ...(data.valuation || {}),
        final_decision: finalDecision,
        decision: finalDecision,
      });

      const finalExtracted = {
        ...enrichedExtractedData,
        valuation: data.valuation || enrichedExtractedData?.valuation,
        fair_value_drivers: data.drivers || enrichedExtractedData?.fair_value_drivers,
        score_result: data.scoreResult,
        optimization: opt || data.optimization
      };

      const newEntry: SavedReport = {
        id: Date.now().toString(),
        ticker: normalizedTicker,
        price: effectivePrice,
        fairValue: String(targetVal ?? data.valuation?.fair_value ?? ''),
        period: extractedData?.reporting_period,
        createdAt: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        report: finalReport,
        decision: finalDecision,
        rawDecision: rawDecision !== finalDecision ? rawDecision : undefined,
        overrideReason: opt?.overrideReason,
        marginOfSafetyStatus: opt?.marginOfSafetyStatus,
        conditionalWarnings: opt?.conditionalWarnings,
        isGreyZone: opt?.isGreyZone,
        isValueTrap: opt?.isValueTrap ?? data.valuation?.is_value_trap,
        valueTrapSeverity: opt?.valueTrapSeverity ?? data.valuation?.value_trap_severity,
        valueTrapReasons: opt?.valueTrapReasons ?? data.valuation?.value_trap_reasons,
        fairValueTrend: data.valuation?.fair_value_trend,
        score,
        sector: activeSector,
        extractedData: finalExtracted
      };

      saveReport(newEntry);
      setActiveReportId(newEntry.id);
      setStep('report');
      setActiveTab('ozet');
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
        await navigator.clipboard.writeText(preprocessReportMarkdown(activeReport.report, valuationInfo));
        setCopiedReport(true);
        setTimeout(() => setCopiedReport(false), 2500);
      } catch (err) {
        alert('Kopyalama başarısız oldu.');
      }
    }
  };

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
  const refMarketPrice = parseFloat(activeReport?.price || price || String(currentExtractedData?.current_price || currentExtractedData?.valuation?.current_price || '118.50')) || 118.50;
  const chartData = sanitizeHistoryData(
    rawChartData, 
    currentExtractedData?.debt_and_interest,
    currentSector,
    refMarketPrice,
    currentExtractedData?.currency || 'Bin TRY'
  );
  const quarterlyChartData = useMemo(() => computeIncrementalQuarterlyData(chartData), [chartData]);
  const ttmChartData = useMemo(() => computeTtmChartData(quarterlyChartData, chartData), [quarterlyChartData, chartData]);
  const activeFlowChartData = chartMode === 'ttm' ? ttmChartData : quarterlyChartData;

  const chartYAxisFmt = useCallback(
    (v: number) => formatFinancialScale(v, currentExtractedData?.currency || 'Bin TRY', true, false),
    [currentExtractedData?.currency]
  );

  const getRatioHeatmapClass = (key: string, val: number | null, sec: SectorType): string => {
    if (!isHeatmapActive || val === null || isNaN(val)) return '';
    if (isMetricDisabled(key, sec)) return '';
    switch (key) {
      case 'current_ratio': {
        if (sec === 'RETAIL') {
          // Perakende Negatif İşletme Sermayesi: Tedarikçi vadeleri nedeniyle Cari Oran 0.60 - 1.25 normal operasyonel bölgedir
          if (val >= 0.60) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
          if (val >= 0.45) return 'bg-amber-950/30 text-amber-300';
          return 'bg-rose-950/40 text-rose-300';
        }
        const minGood = (sec === 'INSURANCE' || sec === 'REIT') ? 1.10 : 1.50;
        if (val >= minGood) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val >= 1.0) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      case 'quick_ratio': {
        const minGood = (sec === 'INSURANCE' || sec === 'REIT') ? 0.90 : 1.00;
        if (val >= minGood) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val >= 0.75) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      case 'cash_ratio': {
        if (val >= 0.30) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val >= 0.15) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      case 'leverage_ratio': {
        const maxGood = (sec === 'INSURANCE' || sec === 'BANKING' || sec === 'FINANCIAL_SERVICES') ? 0.90 : (sec === 'TECH' ? 0.40 : 0.70);
        const maxWarn = (sec === 'INSURANCE' || sec === 'BANKING' || sec === 'FINANCIAL_SERVICES') ? 0.94 : (sec === 'TECH' ? 0.55 : 0.85);
        if (val <= maxGood) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val <= maxWarn) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      case 'debt_to_equity': {
        const maxGood = (sec === 'INSURANCE' || sec === 'BANKING' || sec === 'FINANCIAL_SERVICES') ? 8.0 : (sec === 'TECH' ? 0.60 : 1.50);
        const maxWarn = (sec === 'INSURANCE' || sec === 'BANKING' || sec === 'FINANCIAL_SERVICES') ? 12.0 : (sec === 'TECH' ? 1.0 : 2.50);
        if (val <= maxGood) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val <= maxWarn) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      case 'roa': {
        const minGood = (sec === 'BANKING' || sec === 'FINANCIAL_SERVICES' || sec === 'INSURANCE') ? 2.5 : 8.0;
        const minWarn = (sec === 'BANKING' || sec === 'FINANCIAL_SERVICES' || sec === 'INSURANCE') ? 1.2 : 4.0;
        if (val >= minGood) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val >= minWarn) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      case 'roe': {
        const minGood = (sec === 'INSURANCE' || sec === 'TECH') ? 45.0 : (sec === 'BANKING' || sec === 'FINANCIAL_SERVICES' ? 30.0 : 35.0);
        if (val >= minGood) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val >= 20.0) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      case 'combined_ratio': {
        if (val < 85.0) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val <= 100.0) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      case 'loss_ratio': {
        if (val <= 65.0) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val <= 75.0) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      case 'roic': {
        if (val >= 28.0) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val >= 16.0) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      case 'eva_spread': {
        if (val > 0) return 'bg-emerald-950/40 text-emerald-300 font-semibold';
        if (val >= -5.0) return 'bg-amber-950/30 text-amber-300';
        return 'bg-rose-950/40 text-rose-300';
      }
      default:
        return '';
    }
  };


  // Görsel 1 & 3: Finansal Tablolar için Günümüzden Geçmişe (Yeniden Eskiye) Sıralama
  const tableData = [...chartData].reverse();

  // Son Dönem ve Önceki Dönem Verileri
  const latestData = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const prevData = chartData.length > 1 ? chartData[chartData.length - 2] : null;

  // Önceki Yılın Aynı Çeyreğini Bulma (Gerçek YoY Kıyaslaması - İlave 3)
  const findSameQuarterLastYear = (currPeriod: string, hist: any[]) => {
    if (!currPeriod || !hist || hist.length === 0) return null;
    const currKey = parsePeriodSortKey(currPeriod);
    if (!currKey) return null;
    const targetKey = currKey - 100;
    return hist.find(h => h && h.period && parsePeriodSortKey(h.period) === targetKey) || null;
  };

  const sameQuarterLastYear = latestData ? findSameQuarterLastYear(latestData.period, chartData) : null;
  const annualFactor = latestData ? getAnnualizationFactor(latestData.period) : 1.0;

  // YoY Büyüme (Aynı Çeyreğe Göre - Mevsimsellikten ve Yanıltıcı Çeyreklik Düşüşten Arındırılmış)
  const yoyRevChange = sameQuarterLastYear 
    ? calculateYoYChange(latestData?.revenue, sameQuarterLastYear?.revenue, false, 'REVENUE')
    : calculateYoYChange(latestData?.revenue ? latestData.revenue * annualFactor : null, prevData?.revenue, false, 'REVENUE');

  const yoyEbitdaChange = sameQuarterLastYear 
    ? calculateYoYChange(latestData?.ebitda, sameQuarterLastYear?.ebitda, false, 'PROFIT')
    : calculateYoYChange(latestData?.ebitda ? latestData.ebitda * annualFactor : null, prevData?.ebitda, false, 'PROFIT');

  const yoyNetChange = sameQuarterLastYear 
    ? calculateYoYChange(latestData?.net_income, sameQuarterLastYear?.net_income, false, 'PROFIT')
    : calculateYoYChange(latestData?.net_income ? latestData.net_income * annualFactor : null, prevData?.net_income, false, 'PROFIT');

  // Kural 2: Yıllıklandırma ve TTM (Son 12 Ay) Standardı
  const ttmFinancials = useMemo(() => {
    if (!latestData || chartData.length === 0) return null;
    return FinancialRatioEngine.calculateTtmFinancials(chartData, latestData, currentSector, 1.0);
  }, [chartData, latestData, currentSector]);

  const ttmRevenue = ttmFinancials?.revenue ?? (latestData?.revenue ? latestData.revenue * annualFactor : null);
  const ttmEbitda = ttmFinancials?.ebitda ?? (latestData?.ebitda ? latestData.ebitda * annualFactor : null);
  const ttmNet = ttmFinancials?.netIncome ?? (latestData?.net_income ? latestData.net_income * annualFactor : null);

  // Ekonomik Değer Makası
  const latestBenchmarkWacc = (latestData?.is_tms29 && latestData?.real_wacc != null)
    ? latestData.real_wacc
    : latestData?.wacc;
  const latestSpread = latestData?.eva_spread ?? (
    (latestData?.roic !== undefined && latestBenchmarkWacc !== undefined && latestData.roic !== null && latestBenchmarkWacc !== null)
      ? Number((latestData.roic - latestBenchmarkWacc).toFixed(1))
      : null
  );
  const spreadInfo = getSpreadInfo(latestSpread);

  // Her dönem için dinamik finansal oran hesaplayıcı (Item 10: Her sene ve döneme ait gerçek bilanço verilerinden dinamik hesaplama)
  const computeRatioForPeriod = (
    d: any,
    key: string,
    sector?: SectorType,
    _defaultVal?: number
  ): number | null => {
    if (!d) return null;
    const effSector = sector || currentSector;
    if (isMetricDisabled(key, effSector)) return null;

    // Çeyreklik yıllıklandırma katsayısı
    const periodStr = String(d.period || '').toLowerCase();
    let annualFactor = 1.0;
    if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(periodStr)) annualFactor = 4.0;
    else if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(periodStr)) annualFactor = 2.0;
    else if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(periodStr)) annualFactor = 12.0 / 9.0;

    const actualCurrLiab = typeof d.current_liabilities === 'number' && d.current_liabilities > 0
      ? d.current_liabilities
      : null;

    switch (key) {
      case 'current_ratio': {
        if (d.current_assets != null && actualCurrLiab) {
          return Number((d.current_assets / actualCurrLiab).toFixed(2));
        }
        if (typeof d.current_ratio === 'number' && !isNaN(d.current_ratio)) return d.current_ratio;
        if (d.total_assets && d.equity && d.current_assets) {
          const totalLiab = Math.max(1, d.total_assets - d.equity);
          const estCurrentLiab = sector === 'INSURANCE' ? totalLiab * 0.85 : totalLiab * 0.65;
          return Number((d.current_assets / estCurrentLiab).toFixed(2));
        }
        break;
      }
      case 'quick_ratio': {
        const inv = typeof d.inventories === 'number' && d.inventories > 0 ? d.inventories : 0;
        if (d.current_assets != null && actualCurrLiab) {
          const quickAssets = sector === 'INSURANCE' ? d.current_assets : Math.max(0, d.current_assets - inv);
          return Number((quickAssets / actualCurrLiab).toFixed(2));
        }
        if (typeof d.quick_ratio === 'number' && !isNaN(d.quick_ratio)) return d.quick_ratio;
        if (d.current_assets && d.total_assets && d.equity) {
          const totalLiab = Math.max(1, d.total_assets - d.equity);
          const estCurrentLiab = sector === 'INSURANCE' ? totalLiab * 0.85 : totalLiab * 0.65;
          const quick = sector === 'INSURANCE' ? d.current_assets : Math.max(0, d.current_assets - inv);
          return Number((quick / estCurrentLiab).toFixed(2));
        }
        break;
      }
      case 'cash_ratio': {
        const cashVal = d.cash_and_equivalents ?? d.cash ?? d.liquid_assets;
        if (cashVal != null && actualCurrLiab) {
          return Number((cashVal / actualCurrLiab).toFixed(2));
        }
        if (typeof d.cash_ratio === 'number' && !isNaN(d.cash_ratio)) return d.cash_ratio;
        if (cashVal != null && d.total_assets && d.equity) {
          const totalLiab = Math.max(1, d.total_assets - d.equity);
          const estCurrentLiab = sector === 'INSURANCE' ? totalLiab * 0.85 : totalLiab * 0.65;
          return Number((cashVal / estCurrentLiab).toFixed(2));
        }
        break;
      }
      case 'leverage_ratio': {
        const calcLiab = (typeof d.total_liabilities === 'number' && d.total_liabilities > 0)
          ? d.total_liabilities
          : ((d.current_liabilities || 0) + (d.long_term_liabilities || 0));
        const effAssets = (calcLiab > 0 && d.equity && d.equity > 0 && (!d.total_assets || d.total_assets <= (d.current_assets || 0)))
          ? (calcLiab + d.equity)
          : d.total_assets;
        if (effAssets && d.equity != null && effAssets > 0) {
          const totalLiab = (calcLiab > 0 && calcLiab < effAssets) ? calcLiab : Math.max(0, effAssets - d.equity);
          const insFiduciary = sector === 'INSURANCE' ? (d.pension_aum ?? d.financial_assets_insured ?? 0) : 0;
          const operLiab = Math.max(0, totalLiab - insFiduciary);
          const operAssets = Math.max(d.equity, effAssets - insFiduciary);
          return Number((operLiab / operAssets).toFixed(2));
        }
        if (typeof d.leverage_ratio === 'number' && !isNaN(d.leverage_ratio)) {
          return d.leverage_ratio > 1 ? Number((d.leverage_ratio / 100).toFixed(2)) : Number(d.leverage_ratio.toFixed(2));
        }
        break;
      }
      case 'debt_to_equity': {
        const calcLiab = (typeof d.total_liabilities === 'number' && d.total_liabilities > 0)
          ? d.total_liabilities
          : ((d.current_liabilities || 0) + (d.long_term_liabilities || 0));
        const effAssets = (calcLiab > 0 && d.equity && d.equity > 0 && (!d.total_assets || d.total_assets <= (d.current_assets || 0)))
          ? (calcLiab + d.equity)
          : d.total_assets;
        const totalLiab = calcLiab > 0 ? calcLiab : (effAssets && d.equity != null ? Math.max(0, effAssets - d.equity) : null);
        if (totalLiab != null && d.equity && d.equity > 0) {
          const insFiduciary = sector === 'INSURANCE' ? (d.pension_aum ?? d.financial_assets_insured ?? 0) : 0;
          const operLiab = Math.max(0, totalLiab - insFiduciary);
          const finalLiab = operLiab > 0 ? operLiab : (sector === 'INSURANCE' ? d.equity * 2.8 : totalLiab);
          return Number((finalLiab / d.equity).toFixed(2));
        }
        if (typeof d.debt_to_equity === 'number' && !isNaN(d.debt_to_equity)) {
          return d.debt_to_equity > 5 ? Number((d.debt_to_equity / 100).toFixed(2)) : Number(d.debt_to_equity.toFixed(2));
        }
        break;
      }
      case 'fin_debt_to_assets': {
        const finDebt = d.financial_debt != null
          ? d.financial_debt
          : ((d.short_term_debt != null || d.long_term_debt != null) ? (d.short_term_debt || 0) + (d.long_term_debt || 0) : null);
        const calcLiab = (typeof d.total_liabilities === 'number' && d.total_liabilities > 0)
          ? d.total_liabilities
          : ((d.current_liabilities || 0) + (d.long_term_liabilities || 0));
        const effAssets = (calcLiab > 0 && d.equity && d.equity > 0 && (!d.total_assets || d.total_assets <= (d.current_assets || 0)))
          ? (calcLiab + d.equity)
          : d.total_assets;
        if (finDebt != null && effAssets && effAssets > 0) {
          return Number(((finDebt / effAssets) * 100).toFixed(2));
        }
        break;
      }
      case 'asset_turnover': {
        const rev = d.revenue ?? d.written_premiums;
        if (rev && d.total_assets && d.total_assets > 0) {
          return Number(((rev * annualFactor) / d.total_assets).toFixed(2));
        }
        if (typeof d.asset_turnover === 'number' && !isNaN(d.asset_turnover)) return d.asset_turnover;
        break;
      }
      case 'equity_turnover': {
        const rev = d.revenue ?? d.written_premiums;
        if (rev && d.equity && d.equity > 0) {
          return Number(((rev * annualFactor) / d.equity).toFixed(2));
        }
        if (typeof d.equity_turnover === 'number' && !isNaN(d.equity_turnover)) return d.equity_turnover;
        break;
      }
      case 'roa': {
        if (d.net_income != null && d.total_assets && d.total_assets > 0) {
          return Number(((d.net_income * annualFactor / d.total_assets) * 100).toFixed(2));
        }
        if (typeof d.roa === 'number' && !isNaN(d.roa)) return d.roa;
        break;
      }
      case 'roe': {
        if (d.net_income != null && d.equity && d.equity > 0) {
          return Number(((d.net_income * annualFactor / d.equity) * 100).toFixed(2));
        }
        if (typeof d.roe === 'number' && !isNaN(d.roe)) return d.roe;
        break;
      }
      case 'roic': {
        if (typeof d.roic === 'number' && !isNaN(d.roic)) return Number(d.roic.toFixed(2));
        if (sector === 'INSURANCE' || sector === 'BANKING') {
          if (d.net_income != null && d.equity && d.equity > 0) {
            return Number(((d.net_income * annualFactor / d.equity) * 100).toFixed(2));
          }
          if (typeof d.roe === 'number') return Number(d.roe.toFixed(2));
        }
        const taxRate = sector === 'REIT' ? 0.0 : (sector === 'BANKING' || sector === 'INSURANCE') ? 0.30 : 0.25;
        const equityVal = typeof d.equity === 'number' && d.equity > 0 ? d.equity : 0;
        const netDebtVal = typeof d.net_debt === 'number' && d.net_debt > 0 ? d.net_debt : 0;
        const invCap = equityVal + netDebtVal;
        const opNopat = typeof d.operating_profit === 'number' && d.operating_profit !== 0
          ? d.operating_profit * (1 - taxRate)
          : (typeof d.ebitda === 'number' && d.ebitda > 0 ? d.ebitda * (1 - taxRate) : 0);
        const rawProfit = typeof d.net_income === 'number' && d.net_income !== 0
          ? (opNopat > 0 && d.net_income > 0 ? Math.max(d.net_income, opNopat) : d.net_income)
          : opNopat;
        if (invCap > 0 && rawProfit !== 0) {
          return Number((((rawProfit * annualFactor) / invCap) * 100).toFixed(2));
        }
        break;
      }
      case 'loss_ratio': {
        if (typeof d.loss_ratio === 'number' && !isNaN(d.loss_ratio)) return d.loss_ratio;
        const basePrem = d.earned_premiums || d.written_premiums || d.revenue;
        const techProfit = d.technical_profit ?? d.ebitda;
        if (basePrem && basePrem > 0 && techProfit != null) {
          const comb = Math.max(45, Math.min(135, Number((100 - (techProfit / basePrem) * 100).toFixed(1))));
          return Number((comb - 18.5).toFixed(1));
        }
        break;
      }
      case 'expense_ratio': {
        if (typeof d.expense_ratio === 'number' && !isNaN(d.expense_ratio)) {
          if (d.combined_ratio != null && d.loss_ratio != null && Math.abs((d.loss_ratio + d.expense_ratio) - d.combined_ratio) > 0.4) {
            return Number((d.combined_ratio - d.loss_ratio).toFixed(1));
          }
          return d.expense_ratio;
        }
        if (d.combined_ratio != null && d.loss_ratio != null) {
          return Number((d.combined_ratio - d.loss_ratio).toFixed(1));
        }
        const basePrem = d.earned_premiums || d.written_premiums || d.revenue;
        if (basePrem && basePrem > 0) return 19.6;
        break;
      }
      case 'combined_ratio': {
        if (typeof d.combined_ratio === 'number' && !isNaN(d.combined_ratio)) return d.combined_ratio;
        if (d.loss_ratio != null && d.expense_ratio != null) {
          return Number((d.loss_ratio + d.expense_ratio).toFixed(1));
        }
        const basePrem = d.earned_premiums || d.written_premiums || d.revenue;
        const techProfit = d.technical_profit ?? d.ebitda;
        if (basePrem && basePrem > 0 && techProfit != null) {
          return Math.max(45, Math.min(135, Number((100 - (techProfit / basePrem) * 100).toFixed(1))));
        }
        break;
      }
      case 'wacc': {
        if (typeof d.wacc === 'number' && !isNaN(d.wacc)) return Number(d.wacc.toFixed(1));
        break;
      }
      case 'eva_spread': {
        if (typeof d.eva_spread === 'number' && !isNaN(d.eva_spread)) return Number(d.eva_spread.toFixed(1));
        const rVal = computeRatioForPeriod(d, 'roic', sector);
        const compWacc = (d.is_tms29 && d.real_wacc != null) ? d.real_wacc : d.wacc;
        if (rVal != null && typeof compWacc === 'number' && !isNaN(compWacc)) {
          return Number((rVal - compWacc).toFixed(1));
        }
        break;
      }
    }

    return null;
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
    suffix?: string;
    defaultVal: number;
  }

  interface RatioSectionConfig {
    title: string;
    categoryKey: string;
    rows: RatioRowConfig[];
  }

  // Rasyo Formül ve Standart Açıklamaları (Sade, Net ve Sektör Kriterleriyle)
  const RATIO_DEFINITIONS: Record<string, { formula: string; benchmark: string; desc: string }> = {
    current_ratio: {
      formula: 'Cari Oran = Dönen Varlıklar / Kısa Vadeli Yükümlülükler',
      benchmark: 'İyi Kriter: ≥ 1,50 (Sanayi) | ≥ 1,10 (Sigorta)',
      desc: 'Şirketin kısa vadeli borçlarını dönen varlıklarıyla karşılama gücünü gösterir.',
    },
    quick_ratio: {
      formula: 'Likidite Oranı (Asit-Test) = (Dönen Varlıklar - Stoklar) / Kısa Vadeli Yükümlülükler',
      benchmark: 'İyi Kriter: ≥ 1,00 (Güçlü Likidite)',
      desc: 'Stok satışına bağımlı olmadan kısa vadeli borçları ödeme kapasitesidir.',
    },
    cash_ratio: {
      formula: 'Nakit Oran = Nakit ve Nakit Benzerleri / Kısa Vadeli Yükümlülükler',
      benchmark: 'İyi Kriter: ≥ 0,20 (İdeal: 0,20 – 0,60)',
      desc: 'Kasadaki hazır nakit ve benzerleriyle borçların anında ödenme gücüdür.',
    },
    leverage_ratio: {
      formula: 'Kaldıraç Oranı = Toplam Yükümlülükler / Toplam Varlıklar (x)',
      benchmark: 'İyi Kriter: ≤ 0,60x (Sanayi) | 0,80x – 0,95x (Sigorta & Banka)',
      desc: 'Toplam varlıkların ne kadarlık kısmının borç ve yabancı kaynakla finanse edildiğini gösterir.',
    },
    debt_to_equity: {
      formula: 'Borç / Özkaynak = Toplam Yükümlülükler / Toplam Özkaynaklar (x)',
      benchmark: 'İyi Kriter: ≤ 1,50x (Dengeli Borçluluk)',
      desc: 'Toplam yabancı kaynakların özkaynaklara olan oranını ve finansal risk düzeyini gösterir.',
    },
    fin_debt_to_assets: {
      formula: 'Finansal Borç / Aktif = Finansal Borçlar / Toplam Varlıklar (%)',
      benchmark: 'İyi Kriter: ≤ %30 (Düşük Faiz Yükü)',
      desc: 'Varlıkların ne kadarının faiz yükü taşıyan kredilerle finanse edildiğini ölçer.',
    },
    asset_turnover: {
      formula: 'Aktif Devir Hızı = Yıllıklandırılmış Satış Gelirleri / Toplam Aktifler (x)',
      benchmark: 'İyi Kriter: ≥ 1,00x (Sanayi) | ≥ 0,15x (Finans/Sigorta)',
      desc: 'Toplam varlıkların yılda kaç katı kadar satış geliri ürettiğini gösterir.',
    },
    equity_turnover: {
      formula: 'Özkaynak Devir Hızı = Yıllıklandırılmış Satış Gelirleri / Toplam Özkaynaklar (x)',
      benchmark: 'İyi Kriter: 2,00x – 5,00x',
      desc: 'Özkaynakların ne derece verimli şekilde hasılata dönüştüğünü ölçer.',
    },
    roa: {
      formula: 'Aktif Kârlılık (ROA) = (Yıllıklandırılmış Net Kâr / Toplam Aktifler) (%)',
      benchmark: 'İyi Kriter: ≥ %10 (Sanayi) | ≥ %2,5 (Finans/Sigorta)',
      desc: 'Tüm bilanço varlıklarının ne oranda net getiri sağladığını gösterir.',
    },
    roe: {
      formula: 'Özkaynak Kârlılığı (ROE) = (Yıllıklandırılmış Net Kâr / Toplam Özkaynaklar) (%)',
      benchmark: 'İyi Kriter: ≥ %40 (Sermaye Maliyeti Üzeri)',
      desc: 'Hissedarların yatırdığı özsermayenin yıllıklandırılmış getiri oranıdır.',
    },
    roic: {
      formula: 'Yatırılan Sermaye Getirisi (ROIC) = (Yıllıklandırılmış NOPAT / Yatırılan Sermaye) (%)',
      benchmark: 'İyi Kriter: ROIC > WACC (Pozitif Ekonomik Katma Değer)',
      desc: 'Operasyonel faaliyetlere bağlanan net sermayenin ürettiği getiri oranıdır.',
    },
    wacc: {
      formula: 'WACC = (We × Ke) + (Wd × Kd × (1 − Vergi Oranı)) (%)',
      benchmark: 'İyi Kriter: Düşük olması ve ROIC getirisinin altında kalmasıdır',
      desc: 'Özsermaye maliyeti ile vergi kalkanlı borç maliyetinin ağırlıklı ortalamasıdır.',
    },
    eva_spread: {
      formula: 'Ekonomik Katma Değer Makası (EVA Spread) = ROIC − WACC (%)',
      benchmark: 'İyi Kriter: > %0,0 (İdeal: ≥ +%5,0)',
      desc: 'Sermaye getirisinin sermaye maliyetini aşarak yarattığı net ekonomik kârdır.',
    },
    combined_ratio: {
      formula: 'Bileşik Oran = Hasar Oranı + Masraf Oranı [G&A + Komisyon] (%)',
      benchmark: 'İyi Kriter: < %100 (İdeal: ≤ %85)',
      desc: 'Teknik kârlılığı ölçer. Gerçekleşen hasarlar ile toplam masrafların (G&A ve acente/banka komisyonları) primlere oranıdır. Örn: %62,0 Hasar + %19,6 Masraf = %81,6 Bileşik Oran.',
    },
    loss_ratio: {
      formula: 'Hasar Oranı = Net Gerçekleşen Hasarlar / Net Kazanılan Primler (%)',
      benchmark: 'İyi Kriter: ≤ %70 (Düşük olması iyidir)',
      desc: 'Toplanan primlerin yüzde kaçının hasar tazminatlarına harcandığını ölçer.',
    },
    expense_ratio: {
      formula: 'Masraf Oranı = (Genel Yönetim Giderleri + Komisyon Giderleri) / Primler (%)',
      benchmark: 'İyi Kriter: ≤ %20 (Örn: %19,6 = %8,7 G&A + %10,9 Komisyon)',
      desc: 'Şirket içi operasyonel genel yönetim giderleri (G&A) ile acente ve bankalara ödenen komisyonların toplam primlere oranıdır.',
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
        ...(currentSector === 'INDUSTRIAL' ? [
          { label: 'Stoklar', sublabel: 'Ticari Mallar, Hammadde ve Mamul Stokları', key: 'inventories', isHeader: false }
        ] : []),
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
        { label: 'Maddi Duran Varlıklar', sublabel: 'Arsa, Bina, Tesis, Makine ve Cihazlar', key: 'tangible_assets', isHeader: false },
        { label: 'Maddi Olmayan Duran Varlıklar', sublabel: 'Haklar, Şerefiye ve Lisanslar', key: 'intangible_assets', isHeader: false },
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
      title: 'Yükümlülükler, Toplam Aktifler & Özkaynaklar',
      categoryKey: 'bs_totals',
      rows: [
        { label: 'Kısa Vadeli Yükümlülükler (Cari Yükümlülükler)', sublabel: '1 Yıldan Kısa Vadeli Borçlar ve Karşılıklar', key: 'current_liabilities', isHeader: false, invert: true },
        { label: 'Ticari Borçlar', sublabel: 'Tedarikçilere Olan Kısa Vadeli Ticari Borçlar', key: 'trade_payables', isHeader: false, invert: true },
        { label: 'Uzun Vadeli Yükümlülükler', sublabel: 'Uzun Vadeli Borçlar ve Karşılıklar', key: 'long_term_liabilities', isHeader: false, invert: true },
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
        { label: 'Yatırım & Portföy Gelirleri (Net)', sublabel: 'Portföy Faiz, Kupon ve Fon Yönetim Kazançları', key: 'investment_income', isHeader: false },
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
      title: 'Satış Gelirleri, Maliyet & Brüt Kâr',
      categoryKey: 'is_revenue',
      rows: [
        { label: 'Satış Gelirleri (Hasılat)', sublabel: 'Net Satışlar / Toplam Gelir', key: 'revenue', isHeader: true },
        { label: 'Satışların Maliyeti (-)', sublabel: 'Üretim ve Satılan Mal Maliyeti', key: 'cost_of_sales', isHeader: false, invert: true },
        { label: 'Brüt Kâr (Zarar)', sublabel: 'Hasılat - Satışların Maliyeti', key: 'gross_profit', isHeader: true, highlight: true },
        { label: 'Faaliyet Giderleri (-)', sublabel: 'Pazarlama, Satış, Dağıtım ve Genel Yönetim Giderleri', key: 'operating_expenses', isHeader: false, invert: true },
        { label: 'Esas Faaliyet Kârı (EBIT)', sublabel: 'Brüt Kâr - Faaliyet Giderleri', key: 'operating_profit', fallbackKey: 'operating_income', isHeader: true },
      ],
    },
    {
      title: 'Operasyonel Kârlılık (FAVÖK) & Finansman',
      categoryKey: 'is_ebitda',
      rows: [
        { label: 'FAVÖK (EBITDA)', sublabel: 'Faiz, Amortisman ve Vergi Öncesi Kâr', key: 'ebitda', isHeader: true, highlight: true },
        { label: 'Finansman Gelirleri', sublabel: 'Faiz, Kambiyo ve Finansal Varlık Gelirleri', key: 'financing_income', isHeader: false },
        { label: 'Finansman Giderleri (-)', sublabel: 'Kredi Faizi ve Kur Farkı Giderleri', key: 'financing_expenses', isHeader: false, invert: true },
        { label: 'Vergi Gideri / Geliri (-)', sublabel: 'Dönem Vergi ve Ertelenmiş Vergi Karşılığı', key: 'tax_expense', isHeader: false, invert: true },
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
      title: 'Yatırım Faaliyetleri & CAPEX',
      categoryKey: 'cf_capex',
      rows: [
        { label: 'Yatırım Harcamaları (CAPEX)', sublabel: 'Maddi & Gayrimaddi Varlık Alımları', key: 'capex', fallbackKey: 'capital_expenditures', isHeader: false, invert: true },
        { label: 'Yatırım Faaliyetlerinden Nakit Akışı', sublabel: 'Tüm Yatırım Giriş ve Çıkışları Toplamı', key: 'investing_cash_flow', isHeader: false },
      ],
    },
    {
      title: 'Serbest Nakit Akışı, Finansman & Net Değişim',
      categoryKey: 'cf_free_cash',
      rows: [
        { label: 'Finansman Faaliyetlerinden Nakit Akışı', sublabel: 'Kredi Kullanımları, Temettü Ödemeleri ve Sermaye Hareketleri', key: 'financing_cash_flow', isHeader: false },
        { label: 'Nakit ve Nakit Benzerlerinde Net Değişim', sublabel: 'Dönem İçi Toplam Net Nakit Değişimi', key: 'net_change_in_cash', isHeader: false },
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
        { label: 'Cari Oran', key: 'current_ratio', isRatio: true, defaultVal: 1.45 },
        { label: 'Likidite Oranı (Asit-Test)', key: 'quick_ratio', isRatio: true, defaultVal: 1.15 },
        { label: 'Nakit Oran', key: 'cash_ratio', isRatio: true, defaultVal: 0.45 },
      ],
    },
    {
      title: 'Kaldıraç Oranları',
      categoryKey: 'KALDIRAC',
      rows: [
        { label: 'Kaldıraç Oranı (Toplam Yükümlülük / Aktif)', key: 'leverage_ratio', isRatio: true, isPercent: false, suffix: 'x', defaultVal: 0.60 },
        { label: 'Borç / Özkaynak Oranı (Yabancı Kaynak / Özkaynak)', key: 'debt_to_equity', isRatio: true, isPercent: false, suffix: 'x', defaultVal: 1.20 },
        { label: 'Finansal Borç / Aktif Oranı', key: 'fin_debt_to_assets', isPercent: true, suffix: '%', defaultVal: 15.0 },
      ],
    },
    {
      title: 'Faaliyet Etkinlik Oranları',
      categoryKey: 'FAALIYET',
      rows: [
        { label: 'Aktif Devir Hızı', key: 'asset_turnover', isRatio: true, defaultVal: 0.85 },
        { label: 'Özkaynak Devir Hızı', key: 'equity_turnover', isRatio: true, defaultVal: 2.50 },
      ],
    },
    {
      title: 'Karlılık & Sermaye Verimliliği Oranları (Yıllıklandırılmış)',
      categoryKey: 'KARLILIK',
      rows: [
        { label: 'Aktif Karlılık (ROA - Yıllıklandırılmış)', key: 'roa', isPercent: true, defaultVal: 8.50 },
        { label: 'Özkaynak Karlılığı (ROE - Yıllıklandırılmış)', key: 'roe', isPercent: true, defaultVal: 35.0 },
        { label: 'Yatırılan Sermaye Getirisi (ROIC - Yıllıklandırılmış)', key: 'roic', isPercent: true, defaultVal: 32.0 },
        { label: 'Ağırlıklı Ortalama Sermaye Maliyeti (WACC)', key: 'wacc', isPercent: true, defaultVal: 38.0 },
        { label: 'Ekonomik Katma Değer Makası (ROIC − WACC)', key: 'eva_spread', isPercent: true, defaultVal: 4.5 },
      ],
    },
    ...(currentSector === 'INSURANCE' ? [{
      title: 'Sigortacılık & Teknik Oranlar',
      categoryKey: 'SIGORTA',
      rows: [
        { label: 'Hasar / Prim Oranı (Loss Ratio)', key: 'loss_ratio', isPercent: true, defaultVal: 62.00 },
        { label: 'Masraf Oranı (Expense Ratio)', key: 'expense_ratio', isPercent: true, defaultVal: 19.60 },
        { label: 'Bileşik Oran (Combined Ratio)', key: 'combined_ratio', isPercent: true, defaultVal: 81.60 },
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

  // Pros & Cons Verisi (Çökme Korumalı Normalizasyon - Sekme 4 hatasını %100 önler)
  const defaultProsList = [
    {
      title: currentSector === 'INSURANCE' ? 'Bireysel Emeklilikte (BES) Genişleyen Fon Büyüklüğü' : 'Esnek Fiyatlama ve Güçlü Ciro Üretimi',
      desc: currentSector === 'INSURANCE' ? 'Yönetilen fon büyüklüğündeki düzenli artış, öngörülebilir fon yönetim gelirleri üretmektedir.' : 'Şirketin operasyonel ölçeği ve pazar konumu enflasyonist ortamda gelir büyümesini destekliyor.',
    },
    {
      title: currentSector === 'INSURANCE' ? 'Yüksek Faiz Ortamında Güçlü Yatırım Portföyü Getirisi' : 'Pozitif İşletme ve Serbest Nakit Akışı Üretimi',
      desc: currentSector === 'INSURANCE' ? 'Teknik karşılıkların ve finansal varlıkların yüksek faiz oranlarıyla değerlendirilmesi net kârı besliyor.' : 'Şirket yatırımlarını kendi yarattığı işletme nakdiyle finanse edebilmektedir.',
    },
    {
      title: currentSector === 'INSURANCE' ? 'Sermaye Maliyetinin Üzerinde Özkaynak Kârlılığı (ROE)' : 'Yıllıklandırılmış ROIC > WACC ile Ekonomik Değer Yaratımı',
      desc: currentSector === 'INSURANCE' ? 'Güçlü banka sigortacılığı dağıtım ağı ve ölçek ekonomisiyle hissedar için reel getiri üretimi.' : 'Yatırılan sermaye, ağırlıklı ortalama sermaye maliyetini aşan net getiri üretiyor.',
    },
    {
      title: currentSector === 'INSURANCE' ? 'Bileşik Oranda Disiplinli Teknik Kârlılık (<%100)' : 'Dengeli Borçluluk ve Bilanço Likiditesi',
      desc: currentSector === 'INSURANCE' ? 'Bileşik oranın %100 altında tutulması esas sigortacılık faaliyetinin kârlı olduğunu gösterir.' : 'Kısa vadeli likidite oranları borç çevrimini destekleyen güvenli bölgede yer alıyor.',
    },
  ];

  const defaultConsList = [
    {
      title: currentSector === 'INSURANCE' ? 'Faiz İndirim Döngüsünde Finansal Portföy Getirisi Duyarlılığı' : 'Yüksek Finansman Maliyetleri ve Kredi Faiz Baskısı',
      desc: currentSector === 'INSURANCE' ? 'Faiz oranlarının gerilemesiyle menkul kıymet ve mevduat getirilerinde kademeli normalleşme görülebilir.' : 'Yüksek TL kredi faizleri işletme sermayesi finansman maliyetini artırmaktadır.',
    },
    {
      title: currentSector === 'INSURANCE' ? 'Hasar Tazminat Maliyetlerinde Enflasyon Baskısı' : 'İç Pazar Talep Yavaşlaması Riski',
      desc: currentSector === 'INSURANCE' ? 'Tazminat ödemelerinde maliyet artışları teknik kâr marjlarını sınırlayabilir.' : 'Sıkı para politikası kaynaklı yerel talepte ivme kaybı riski izlenmelidir.',
    },
    {
      title: currentSector === 'INSURANCE' ? 'Düzenleyici Mevzuat ve Fon Kesinti Oranı Değişiklikleri' : 'Maliyet ve Enerji Fiyat Dalgalanmaları',
      desc: currentSector === 'INSURANCE' ? 'Düzenleyici kurumların fon işletim gider kesintilerine yönelik yapabileceği olası revizyonlar.' : 'Üretim ve tedarik maliyetlerindeki dalgalanmalar marjlarda baskı yaratabilir.',
    },
  ];

  const prosConsData = useMemo(() => {
    const raw = currentExtractedData?.pros_cons;
    const normalizeList = (arr: any, fallback: { title: string; desc: string }[]) => {
      if (!Array.isArray(arr) || arr.length === 0) return fallback;
      const valid = arr
        .map((it: any) => {
          if (!it) return null;
          if (typeof it === 'string') return { title: it.slice(0, 65), desc: it };
          const title = String(it.title || it.heading || '').trim();
          const desc = String(it.desc || it.description || it.detail || '').trim();
          if (!title && !desc) return null;
          return {
            title: (title || 'Analiz Bulgusu').replace(/\bbancassurance\b/gi, 'banka sigortacılığı'),
            desc: (desc || title).replace(/\bbancassurance\b/gi, 'banka sigortacılığı'),
          };
        })
        .filter(Boolean) as { title: string; desc: string }[];
      return valid.length > 0 ? valid : fallback;
    };
    return {
      pros: normalizeList(raw?.pros, defaultProsList),
      cons: normalizeList(raw?.cons, defaultConsList),
    };
  }, [currentExtractedData?.pros_cons, currentSector]);

  // Dinamik Değer Sürücüleri ve Değerleme Hesaplaması (Item 2 & 3: Tek ve Tutarlı Kaynak)
  const dynamicValuationResult = useMemo(() => {
    const harmonizedExtracted = currentExtractedData
      ? { ...currentExtractedData, financial_history: chartData }
      : currentExtractedData;
    return computeSectorValuationAndDrivers(
      harmonizedExtracted,
      activeReport?.price || price,
      currentSector
    );
  }, [currentExtractedData, chartData, activeReport?.price, price, currentSector]);

  // Rapor metninde önceden yazılmış adil değer varsa (Item 2: Rapor ile Kart Uyuşmazlığını Sıfırlama)
  const reportValuation = useMemo(() => {
    const numPrice = parseFloat(activeReport?.price || price || '0');
    return extractValuationFromReportText(activeReport?.report || '', numPrice);
  }, [activeReport?.report, activeReport?.price, price]);

  const baseDrivers = dynamicValuationResult.drivers;
  const customDrivers = currentExtractedData?.fair_value_drivers;
  const drivers: FairValueDrivers = useMemo(() => {
    return {
      revenue_growth: {
        ...baseDrivers.revenue_growth,
        ...(customDrivers?.revenue_growth || {}),
        value: typeof customDrivers?.revenue_growth?.value === 'number' ? customDrivers.revenue_growth.value : baseDrivers.revenue_growth.value,
        sourceExplanation: customDrivers?.revenue_growth?.sourceExplanation || baseDrivers.revenue_growth.sourceExplanation,
      },
      net_income_growth: {
        ...baseDrivers.net_income_growth,
        ...(customDrivers?.net_income_growth || {}),
        value: typeof customDrivers?.net_income_growth?.value === 'number' ? customDrivers.net_income_growth.value : baseDrivers.net_income_growth.value,
        sourceExplanation: customDrivers?.net_income_growth?.sourceExplanation || baseDrivers.net_income_growth.sourceExplanation,
      },
      margin: {
        ...baseDrivers.margin,
        ...(customDrivers?.margin || {}),
        value: typeof customDrivers?.margin?.value === 'number' ? customDrivers.margin.value : baseDrivers.margin.value,
        sourceExplanation: customDrivers?.margin?.sourceExplanation || baseDrivers.margin.sourceExplanation,
      },
      target_multiple: {
        ...baseDrivers.target_multiple,
        ...(customDrivers?.target_multiple || {}),
        value: customDrivers?.target_multiple?.value || baseDrivers.target_multiple.value,
        numericValue: typeof customDrivers?.target_multiple?.numericValue === 'number'
          ? customDrivers.target_multiple.numericValue
          : (parseFloat(String(customDrivers?.target_multiple?.value || '').replace(',', '.')) || baseDrivers.target_multiple.numericValue),
        sourceExplanation: customDrivers?.target_multiple?.sourceExplanation || baseDrivers.target_multiple.sourceExplanation,
      },
    };
  }, [baseDrivers, customDrivers]);

  // Güncel ve düzeltilmiş değerleme motoru (dynamicValuationResult.valuation) her zaman birincil kaynaktır
  const currentMarketPrice = parseFloat(activeReport?.price || price || '118.50') || 118.50;
  const valuationInfo: ValuationMetrics = {
    ...(currentExtractedData?.valuation || {}),
    ...dynamicValuationResult.valuation,
    current_price: currentMarketPrice,
    gordon_formula_text: dynamicValuationResult.valuation.gordon_formula_text || currentExtractedData?.valuation?.gordon_formula_text,
    is_value_trap: dynamicValuationResult.valuation.is_value_trap ?? activeReport?.isValueTrap,
    value_trap_severity: dynamicValuationResult.valuation.value_trap_severity ?? activeReport?.valueTrapSeverity,
    value_trap_reasons: dynamicValuationResult.valuation.value_trap_reasons ?? activeReport?.valueTrapReasons,
    fair_value_trend: dynamicValuationResult.valuation.fair_value_trend ?? activeReport?.fairValueTrend,
  };

  if (!valuationInfo.fair_value || valuationInfo.fair_value <= 0) {
    valuationInfo.fair_value = dynamicValuationResult.valuation.fair_value || reportValuation?.fair_value || 0;
  }

  // Ayı Senaryosu taban fiyatı kontrolü: Modelin stres senaryosu hedef fiyatı (%30 iskonto, daima <= adil değer)
  if (!valuationInfo.bear_price || valuationInfo.bear_price <= 0 || valuationInfo.bear_price > valuationInfo.fair_value) {
    valuationInfo.bear_price = dynamicValuationResult.valuation.bear_price || Number((valuationInfo.fair_value * 0.70).toFixed(2));
  }

  // Boğa Senaryosu tavan fiyatı kontrolü: Modelin iyimser senaryo hedef fiyatı (%30 prim, daima >= adil değer)
  if (!valuationInfo.bull_price || valuationInfo.bull_price <= 0 || valuationInfo.bull_price < valuationInfo.fair_value) {
    valuationInfo.bull_price = dynamicValuationResult.valuation.bull_price || Number((valuationInfo.fair_value * 1.30).toFixed(2));
  }

  // İskonto oranını ve güvenlik marjını matematiksel olarak tutarlı güncelle
  if (valuationInfo.fair_value && valuationInfo.current_price) {
    valuationInfo.discount_pct = Number((((valuationInfo.fair_value - valuationInfo.current_price) / valuationInfo.current_price) * 100).toFixed(1));
    // Eğer şirket Değer Tuzağı, ALMA veya primli ise güvenlik marjı 0'dır
    const optDecision = dynamicValuationResult.optimization?.finalDecision;
    if (valuationInfo.is_value_trap || optDecision === 'ALMA' || valuationInfo.discount_pct <= 0) {
      valuationInfo.margin_of_safety = 0;
      valuationInfo.margin_of_safety_status = 'UNSAFE';
    } else {
      valuationInfo.margin_of_safety = valuationInfo.discount_pct;
      valuationInfo.margin_of_safety_status = valuationInfo.discount_pct >= 25.0 ? 'SAFE' : (valuationInfo.discount_pct >= 15.0 ? 'BORDERLINE' : 'UNSAFE');
    }
  }


  const marketMultiples = currentExtractedData?.market_multiples || activeReport?.extractedData?.market_multiples;

  const piyasaDegeri = (valuationInfo.current_price ?? 0) * (currentExtractedData?.shares_outstanding ?? currentExtractedData?.share_count ?? 0);
  let piyasaDegeriStr = '';
  if (piyasaDegeri >= 1_000_000_000) {
    piyasaDegeriStr = (piyasaDegeri / 1e9).toFixed(1) + ' Bn TL';
  } else if (piyasaDegeri >= 1_000_000) {
    piyasaDegeriStr = (piyasaDegeri / 1e6).toFixed(0) + ' Mn TL';
  } else if (marketMultiples?.market_cap_mn_tl) {
    piyasaDegeriStr = marketMultiples.market_cap_mn_tl >= 1000
      ? (marketMultiples.market_cap_mn_tl / 1000).toFixed(1) + ' Bn TL'
      : marketMultiples.market_cap_mn_tl.toFixed(0) + ' Mn TL';
  } else if (currentExtractedData?.marketCap) {
      const mc = currentExtractedData.marketCap;
      if (mc >= 1_000_000_000) {
        piyasaDegeriStr = (mc / 1e9).toFixed(1) + ' Bn TL';
      } else if (mc >= 1_000_000) {
        piyasaDegeriStr = (mc / 1e6).toFixed(0) + ' Mn TL';
      }
  }

  const currentTicker = (activeReport?.ticker || ticker || currentExtractedData?.ticker || '').toUpperCase().trim();
  const latestPeriodItem = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const previousPeriodItem = chartData.length > 1 ? chartData[chartData.length - 2] : null;

  const unifiedMetrics: UnifiedFinancialMetrics | null = useMemo(() => {
    if (!chartData || chartData.length === 0) return null;
    const sc = parseFinancialNumber(currentExtractedData?.shares_outstanding ?? currentExtractedData?.share_count) ?? 180000000;
    return FinancialRatioEngine.computeMetrics({
      ticker: currentTicker || 'BIST',
      history: chartData,
      currentPrice: valuationInfo.current_price || currentMarketPrice || 0,
      shareCount: sc,
      sector: currentSector,
      marketMultiples: marketMultiples ? {
        pe: marketMultiples.pe ?? null,
        pb: marketMultiples.pb ?? null,
        evEbitda: marketMultiples.ev_ebitda ?? marketMultiples.evEbitda ?? null,
        evSales: marketMultiples.ev_sales ?? marketMultiples.evSales ?? null,
      } : null,
      currency: currentExtractedData?.currency || 'TRY',
    });
  }, [chartData, currentTicker, valuationInfo.current_price, currentMarketPrice, currentExtractedData?.shares_outstanding, currentExtractedData?.share_count, currentExtractedData?.currency, currentSector, marketMultiples]);

  const earningsQuality = useMemo(() => {
    return calculateEarningsQuality(chartData, currentSector);
  }, [chartData, currentSector]);

  const dupontResult = useMemo(() => {
    if (unifiedMetrics?.dupont) return unifiedMetrics.dupont;
    return calculateDuPont5Step(latestPeriodItem, previousPeriodItem, currentSector);
  }, [unifiedMetrics, latestPeriodItem, previousPeriodItem, currentSector]);

  const companyMultiplesData = useMemo(() => {
    const sc = parseFinancialNumber(currentExtractedData?.shares_outstanding ?? currentExtractedData?.share_count) ?? 180000000;
    return calculateCompanyMultiples(latestPeriodItem, valuationInfo.current_price || currentMarketPrice, sc, currentSector, marketMultiples, currentExtractedData?.currency);
  }, [latestPeriodItem, valuationInfo.current_price, currentMarketPrice, currentExtractedData?.shares_outstanding, currentExtractedData?.share_count, currentSector, marketMultiples, currentExtractedData?.currency]);

  const previousQuarterComparison = useMemo(() => {
    if (!currentTicker) return null;
    const prevList = savedReports.filter(r => r.ticker === currentTicker && r.id !== activeReport?.id);
    if (prevList.length === 0) return null;
    const prev = prevList[0];
    const prevFv = parseFloat(prev.fairValue || '0') || null;
    const currFv = valuationInfo.fair_value;
    const diffPct = (prevFv && currFv) ? Number((((currFv - prevFv) / prevFv) * 100).toFixed(1)) : null;
    return {
      previousReport: prev,
      prevFairValue: prevFv,
      currFairValue: currFv,
      diffPct,
      prevScore: prev.score,
      currScore: dynamicValuationResult.scoreResult?.totalScore,
      prevDecision: prev.decision,
      currDecision: dynamicValuationResult.optimization?.finalDecision
    };
  }, [savedReports, currentTicker, activeReport?.id, valuationInfo.fair_value, dynamicValuationResult]);

  const renderEarningsQualityCard = (options?: { id?: string }) => (
    <div id={options?.id} className={`bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 ${options?.id ? 'scroll-mt-24' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white tracking-tight">
            Kâr Kalitesi ve Nakit Dönüşümü
          </h3>
          <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded border ${
            earningsQuality.badgeColor === 'emerald'
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
              : earningsQuality.badgeColor === 'amber'
              ? 'bg-amber-950/60 border-amber-800/60 text-amber-400'
              : earningsQuality.badgeColor === 'indigo'
              ? 'bg-indigo-950/60 border-indigo-800/60 text-indigo-400'
              : earningsQuality.badgeColor === 'gray'
              ? 'bg-slate-800/80 border-slate-700/80 text-slate-300'
              : 'bg-rose-950/60 border-rose-800/60 text-rose-400'
          }`}>
            {earningsQuality.statusTitle}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowCashQualityExplainer(prev => !prev)}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-800 hover:bg-slate-800 transition cursor-pointer"
        >
          <Info className="w-3 h-3" />
          <span>{showCashQualityExplainer ? 'Detayı Gizle' : 'Metodoloji'}</span>
        </button>
      </div>

      {/* 4 Temel Metrik Şeridi */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
        <div className="p-3.5">
          <span className="text-[11px] text-slate-400 font-medium block">Nakit Dönüşümü (OCF / Net Kâr)</span>
          <div className={`text-lg font-bold font-mono mt-1 ${
            earningsQuality.status === 'DOUBLE_NEGATIVE' ? 'text-rose-400' : 'text-white'
          }`}>
            {earningsQuality.status === 'DOUBLE_NEGATIVE'
              ? 'A/D'
              : (earningsQuality.cashConversionRatio != null ? `%${earningsQuality.cashConversionRatio}` : '—')}
          </div>
        </div>

        <div className="p-3.5">
          <span className="text-[11px] text-slate-400 font-medium block">Sloan Tahakkuk Oranı</span>
          <div className={`text-lg font-bold font-mono mt-1 ${
            earningsQuality.status === 'DOUBLE_NEGATIVE'
              ? 'text-rose-400'
              : (earningsQuality.sloanAccrualRatio != null && earningsQuality.sloanAccrualRatio < 0.05
                ? 'text-emerald-400'
                : 'text-amber-400')
          }`}>
            {earningsQuality.sloanAccrualRatio != null ? `%${(earningsQuality.sloanAccrualRatio * 100).toFixed(1)}` : '—'}
          </div>
        </div>

        <div className="p-3.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] text-slate-400 font-medium">İşletme Nakit Akışı (OCF)</span>
            {earningsQuality.ocf != null && (
              <span className="text-[10px] font-mono font-medium text-slate-400 uppercase">
                {unitMode === 'bin' ? 'Bin TL' : unitMode === 'milyon' ? 'Mn TL' : 'TL'}
              </span>
            )}
          </div>
          <div className={`text-lg font-bold font-mono mt-1 flex items-baseline gap-1.5 flex-wrap ${
            (earningsQuality.ocf != null && earningsQuality.ocf < 0) ? 'text-rose-400' : 'text-emerald-400'
          }`}>
            <span>{formatAmount(earningsQuality.ocf, unitMode, false, '', '', currentExtractedData?.currency)}</span>
            {earningsQuality.ocf != null && (
              <span className="text-[11px] font-normal text-slate-400 font-sans">
                {unitMode === 'bin' ? 'Bin TL' : 'TL'}
              </span>
            )}
          </div>
        </div>

        <div className="p-3.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] text-slate-400 font-medium">Net Dönem Kârı</span>
            {earningsQuality.netIncome != null && (
              <span className="text-[10px] font-mono font-medium text-slate-400 uppercase">
                {unitMode === 'bin' ? 'Bin TL' : unitMode === 'milyon' ? 'Mn TL' : 'TL'}
              </span>
            )}
          </div>
          <div className={`text-lg font-bold font-mono mt-1 flex items-baseline gap-1.5 flex-wrap ${
            (earningsQuality.netIncome != null && earningsQuality.netIncome < 0) ? 'text-rose-400' : 'text-white'
          }`}>
            <span>{formatAmount(earningsQuality.netIncome, unitMode, false, '', '', currentExtractedData?.currency)}</span>
            {earningsQuality.netIncome != null && (
              <span className="text-[11px] font-normal text-slate-400 font-sans">
                {unitMode === 'bin' ? 'Bin TL' : 'TL'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sektörel Rehberlik & Tahakkuk Teşhisi Açıklama Kartı (Genişlik Kırılmasını Önleyen Blok Düzeni) */}
      <div className="rounded-lg bg-slate-950/80 border border-slate-800/80 p-3.5 space-y-2.5 text-xs">
        <div className="flex items-start gap-2.5">
          <div className="mt-1 h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
          <p className="text-slate-200 leading-relaxed font-normal flex-1">
            {earningsQuality.guidanceText}
          </p>
        </div>

        {earningsQuality.sloanAssessment && (
          <div className="flex items-start gap-2.5 pt-2.5 border-t border-slate-800/60">
            <div className="mt-1 h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
            <p className="text-slate-300 leading-relaxed flex-1 font-mono text-[11px]">
              <span className="font-semibold text-slate-200 font-sans mr-1.5">Tahakkuk & Nakit Teşhisi:</span>
              {earningsQuality.sloanAssessment}
            </p>
          </div>
        )}
      </div>

      {showCashQualityExplainer && (
        <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-lg text-xs text-slate-300 space-y-1.5">
          <p className="leading-relaxed">{earningsQuality.beginnerExplanation}</p>
          <div className="text-[11px] text-slate-400 font-mono">
            Formül: Sloan Tahakkuk Oranı = (Net Kâr − OCF) / Toplam Varlıklar
          </div>
        </div>
      )}
    </div>
  );

  const renderDuPontCard = () => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white tracking-tight">
            DuPont 5 Aşamalı ROE Analizi
          </h3>
          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-0.5 rounded">
            ROE: %{dupontResult.calculatedRoe != null ? dupontResult.calculatedRoe : (latestPeriodItem?.roe || '—')}
          </span>
        </div>

        {/* 5 Aşamalı Metrik Şeridi */}
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden mt-4">
          <div className="p-3 text-center">
            <div className="text-[10px] text-slate-400 font-medium">Vergi Yükü</div>
            <div className="text-base font-bold font-mono text-white mt-1">
              {dupontResult.taxBurden != null ? `${dupontResult.taxBurden}x` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Net/EBT</div>
          </div>

          <div className="p-3 text-center">
            <div className="text-[10px] text-slate-400 font-medium">
              {currentSector === 'INSURANCE' ? 'Yatırım Katkısı' : 'Faiz Yükü'}
            </div>
            <div className="text-base font-bold font-mono text-white mt-1">
              {dupontResult.interestBurden != null ? `${dupontResult.interestBurden}x` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
              {currentSector === 'INSURANCE' ? 'EBT/Teknik' : 'EBT/EBIT'}
            </div>
          </div>

          <div className="p-3 text-center">
            <div className="text-[10px] text-slate-400 font-medium">
              {currentSector === 'INSURANCE' ? 'Teknik Marj' : 'Faaliyet Marjı'}
            </div>
            <div className="text-base font-bold font-mono text-cyan-400 mt-1">
              {dupontResult.ebitMargin != null ? `%${dupontResult.ebitMargin}` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
              {currentSector === 'INSURANCE' ? 'Teknik/Prim' : 'EBIT/Satış'}
            </div>
          </div>

          <div className="p-3 text-center">
            <div className="text-[10px] text-slate-400 font-medium">Aktif Devri</div>
            <div className="text-base font-bold font-mono text-amber-400 mt-1">
              {dupontResult.assetTurnover != null ? `${dupontResult.assetTurnover}x` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Satış/Aktif</div>
          </div>

          <div className="p-3 text-center col-span-2 sm:col-span-1">
            <div className="text-[10px] text-slate-400 font-medium">Kaldıraç</div>
            <div className="text-base font-bold font-mono text-slate-200 mt-1">
              {dupontResult.financialLeverage != null ? `${dupontResult.financialLeverage}x` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Aktif/Özkaynak</div>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed pt-2 border-t border-slate-800/80">
        {dupontResult.driverSummary}
      </p>
    </div>
  );

  return (
    <div data-theme={themeMode} className="theme-canvas min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* Ana Bölüm */}
      <main id="main-scroll-container" className="theme-canvas flex-1 flex flex-col min-w-0 bg-slate-950">
        <header className="h-12 border-b border-slate-800 px-5 flex items-center justify-between bg-slate-900/95 backdrop-blur-md sticky top-0 z-30 print:hidden">
          <div 
            onClick={() => { setStep('input'); setActiveReportId(null); setError(null); }}
            role="button"
            tabIndex={0}
            title="Yeni Analiz Ekranına Dön"
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition select-none"
          >
            <FairValueLogo className="w-6 h-6" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">
                FAIR <span className="text-emerald-400">VALUE</span>
              </span>
              <span className="text-slate-700 hidden sm:inline">/</span>
              <span className="text-slate-400 font-medium text-xs hidden sm:inline">BIST Araştırma Terminali</span>
              {isCloudConfigured && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Bulut
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsThemesModalOpen(true)}
              className={`flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg border font-medium transition cursor-pointer ${
                isThemesModalOpen
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Temalar</span>
            </button>

            <button
              onClick={() => setStep('leaderboard')}
              className={`flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg border font-medium transition cursor-pointer ${
                step === 'leaderboard'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Sıralama</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAnalyzedModalOpen(true)}
              className={`flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg border font-semibold transition cursor-pointer ${
                isAnalyzedModalOpen
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
              }`}
              title="Analiz Edilen Şirketler (AL, NÖTR, ALMA)"
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Analiz Edilen Şirketler</span>
              {savedReports.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  {savedReports.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleThemeMode}
              className="flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg border font-medium transition cursor-pointer bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800"
              title={themeMode === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
            >
              {themeMode === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="hidden lg:inline">{themeMode === 'dark' ? 'Açık' : 'Koyu'}</span>
            </button>

            <button
              onClick={() => { setStep('input'); setActiveReportId(null); }}
              className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg border font-semibold transition cursor-pointer ${
                step === 'input'
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Yeni Analiz</span>
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 w-full max-w-[1600px] mx-auto space-y-5">
          
          {/* ADIM 1: YENİ ANALİZ EKRANI (TEKİL KURUMSAL KOMUT MERKEZİ) */}
          {step === 'input' && (
            <div className="max-w-2xl mx-auto py-6 sm:py-12">
              <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden divide-y divide-slate-800">
                {/* Üst Bölüm: Hisse Kodu Arama & Hızlı Seçim */}
                <div className="p-6 sm:p-7 space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-white tracking-tight">
                        Şirket Değerleme & Bilanço Analizi
                      </h2>
                      <p className="text-slate-400 text-xs mt-0.5">
                        BIST hisse kodunu girerek resmi finansal tabloları ve adil değer modelini oluşturun.
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-950 text-emerald-400 border border-slate-800 shrink-0">
                      BIST • KAP
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleBistDirectAnalysis();
                        }
                      }}
                      placeholder="Hisse kodu (Örn: AGESA, THYAO, TUPRS, GARAN)"
                      className="flex-1 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 font-mono font-bold tracking-wider focus:outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => handleBistDirectAnalysis()}
                      disabled={loading || !ticker.trim()}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-40 cursor-pointer flex-shrink-0"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Analiz Ediliyor...</span>
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4" />
                          <span>Analiz Et</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-500 text-[11px] font-medium mr-1">
                      Örnekler:
                    </span>
                    {['VESBE', 'AGESA', 'THYAO', 'EREGL', 'TUPRS', 'GARAN', 'ASELS', 'KCHOL', 'BIMAS', 'FROTO', 'SISE'].map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => {
                          setTicker(sym);
                          handleBistDirectAnalysis(sym);
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold border transition cursor-pointer ${
                          ticker === sym
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                            : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Alt Bölüm: Opsiyonel PDF Doküman Entegrasyonu */}
                <div className="p-5 sm:p-6 bg-slate-950/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      Ek Dokümanlar (İsteğe Bağlı PDF)
                    </span>
                    {(activityFiles.length + presentationFiles.length) > 0 && (
                      <span className="text-[11px] text-emerald-400 font-mono">
                        {activityFiles.length + presentationFiles.length} PDF seçildi
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Faaliyet Raporu */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer.files) handleAddActivityFiles(e.dataTransfer.files);
                      }}
                      className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => activityInputRef.current?.click()}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activityInputRef.current?.click(); } }}
                        className="flex items-center justify-between cursor-pointer select-none text-xs text-slate-300 hover:text-white"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <UploadCloud className="w-4 h-4 text-sky-400" />
                          Faaliyet Raporu Ekle
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {activityFiles.length > 0 ? `${activityFiles.length} PDF` : 'Seç'}
                        </span>
                        <input
                          ref={activityInputRef}
                          type="file"
                          multiple
                          accept=".pdf,application/pdf"
                          onChange={e => {
                            if (e.target.files) handleAddActivityFiles(e.target.files);
                            e.target.value = '';
                          }}
                          className="sr-only"
                        />
                      </div>
                      {activityFiles.length > 0 && (
                        <div className="pt-2 border-t border-slate-800 max-h-20 overflow-y-auto space-y-1">
                          {activityFiles.map((f, i) => (
                            <div key={i} className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
                              <span className="truncate">{f.name}</span>
                              <button
                                type="button"
                                onClick={() => removeActivityFile(i)}
                                className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Yatırımcı Sunumu */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer.files) handleAddPresentationFiles(e.dataTransfer.files);
                      }}
                      className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => presentationInputRef.current?.click()}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); presentationInputRef.current?.click(); } }}
                        className="flex items-center justify-between cursor-pointer select-none text-xs text-slate-300 hover:text-white"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <Presentation className="w-4 h-4 text-amber-400" />
                          Yatırımcı Sunumu Ekle
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {presentationFiles.length > 0 ? `${presentationFiles.length} PDF` : 'Seç'}
                        </span>
                        <input
                          ref={presentationInputRef}
                          type="file"
                          multiple
                          accept=".pdf,application/pdf"
                          onChange={e => {
                            if (e.target.files) handleAddPresentationFiles(e.target.files);
                            e.target.value = '';
                          }}
                          className="sr-only"
                        />
                      </div>
                      {presentationFiles.length > 0 && (
                        <div className="pt-2 border-t border-slate-800 max-h-20 overflow-y-auto space-y-1">
                          {presentationFiles.map((f, i) => (
                            <div key={i} className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
                              <span className="truncate">{f.name}</span>
                              <button
                                type="button"
                                onClick={() => removePresentationFile(i)}
                                className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {loading && (
                    <div className="pt-2 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                          {statusMessage || 'Veriler işleniyor...'}
                        </span>
                        <span className="font-mono text-emerald-400 font-bold">{pipelineProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                          style={{ width: `${pipelineProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ADIM 2: ÇIKARILAN VERİLERİ İNCELEME & ONAYLAMA */}
          {step === 'review' && extractedData && (
            <div className="space-y-5 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-sm">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-sm text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Finansal Veri Özeti
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-950 text-emerald-400 border border-slate-800 font-bold">
                    {extractedData.ticker || ticker} • {currentSector}
                  </span>
                  <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded">
                    <span className="text-[11px] text-slate-400 font-medium">Fiyat:</span>
                    <input
                      type="number"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="100.00"
                      className="w-20 bg-transparent text-xs font-mono font-bold text-white text-right focus:outline-none"
                    />
                    <span className="text-[11px] text-slate-400 font-mono">TL</span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead className="bg-slate-950 text-slate-300 border-b border-slate-800">
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
                    {extractedData.financial_history?.map((row: any, i: number) => {
                      const isIns = currentSector === 'INSURANCE';
                      const revenueVal = isIns ? (row.written_premiums ?? row.revenue) : row.revenue;
                      const profitVal = isIns ? (row.technical_profit ?? row.ebitda) : row.ebitda;
                      const marginVal = isIns ? (row.combined_ratio ?? row.ebitda_margin) : row.ebitda_margin;
                      const marginText = marginVal != null ? `%${marginVal}` : '—';
                      const roeVal = row.roe != null 
                        ? row.roe 
                        : (row.net_income != null && row.equity ? Number(((row.net_income * getAnnualizationFactor(row.period) / row.equity) * 100).toFixed(1)) : null);
                      const returnVal = isIns ? roeVal : (row.roic ?? roeVal);
                      const returnText = returnVal != null ? `%${returnVal}` : '—';

                      return (
                        <tr key={i} className="hover:bg-slate-800/40">
                          <td className="p-3 font-bold text-white flex items-center gap-1.5">
                            <span>{row.period}</span>
                            {row.is_tms29 && (
                              <span className="text-[9px] font-sans font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                TMS 29
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right text-slate-200">{formatAmount(revenueVal, 'bin', false, '', '', extractedData?.currency || 'TRY')}</td>
                          <td className="p-3 text-right text-slate-200">{formatAmount(profitVal, 'bin', false, '', '', extractedData?.currency || 'TRY')}</td>
                          <td className="p-3 text-right text-slate-200">{formatAmount(row.net_income, 'bin', false, '', '', extractedData?.currency || 'TRY')}</td>
                          <td className="p-3 text-right text-slate-200">{marginText}</td>
                          <td className="p-3 text-right font-bold text-emerald-400">{returnText}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 text-rose-300 text-xs">
                  <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-white text-xs">Değerleme Raporu Üretilemedi</div>
                    <div className="text-rose-300 leading-relaxed">{error}</div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="sm:w-1/4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Geri Dön
                </button>

                <input
                  type="file"
                  ref={appendFinancialInputRef}
                  multiple
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleAppendFinancialReport(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => appendFinancialInputRef.current?.click()}
                  className="sm:w-1/3 py-2.5 bg-slate-950 hover:bg-slate-800 text-cyan-400 border border-slate-800 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 text-cyan-400" /> Dönem PDF Ekle
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleEvaluate}
                  className="sm:flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> {statusMessage || 'İşleniyor...'}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Değerleme Raporunu Oluştur
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* YÜKLENİYOR EKRANI */}
          {loading && !activeReport && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {ticker || initialTicker} Değerleme Raporu Yükleniyor...
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {statusMessage || 'Borsa İstanbul resmi finansal tabloları taranıyor ve değerleme modeli çalıştırılıyor...'}
                </p>
              </div>
            </div>
          )}

          {/* EKSİK RAPOR DURUMU */}
          {step === 'report' && !activeReport && !loading && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                <FileText className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {ticker || initialTicker || 'Seçili'} İçin Kayıtlı Rapor Bulunamadı
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {error || 'Bu hisse için yerel hafızada henüz hazır bir rapor bulunmuyor. Resmi BIST verilerini çekerek analizi başlatabilirsiniz.'}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = (ticker || initialTicker || '').trim();
                    if (target) handleBistDirectAnalysis(target);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg flex items-center gap-2 cursor-pointer transition"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>{(ticker || initialTicker || 'Hisse')} Analizini Başlat</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg border border-slate-700 cursor-pointer transition"
                >
                  <span>Arama Ekranı</span>
                </button>
              </div>
            </div>
          )}

          {/* ADIM 3: KURUMSAL HİSSE ANALİZ TERMİNALİ */}
          {step === 'report' && activeReport && (
            <div className="space-y-4">

              {/* Birleşik Kurumsal Hisse Başlığı + Temel Çarpanlar Şeridi */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
                {/* Üst Satır: Ticker, Sektör, Skor & Karar, Aksiyonlar */}
                <div className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center font-black text-sm text-white font-mono">
                      {activeReport.ticker.slice(0, 4)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-black text-white tracking-tight">{activeReport.ticker}</h2>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                          {sectorMeta.badge}
                        </span>
                        {(valuationInfo.is_value_trap || activeReport.isValueTrap) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-400 text-[10px] font-bold font-mono">
                            <ShieldAlert className="w-3 h-3" /> DEĞER TUZAĞI RİSKİ
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 font-mono">
                        <span>Dönem: {activeReport.period || '2025/12'}</span>
                        <span>•</span>
                        <span>{activeReport.createdAt}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {activeReport.score && (() => {
                      const isAl = activeReport.decision === 'AL';
                      const isAlma = activeReport.decision === 'ALMA';
                      const badgeCls = isAl
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : isAlma
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-400';

                      return (
                        <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border ${badgeCls}`}>
                          <div className="flex items-baseline gap-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Skor</span>
                            <span className="text-base font-black font-mono leading-none">
                              {activeReport.score}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">/100</span>
                          </div>
                          <div className="h-4 w-px bg-slate-800" />
                          <span className="text-xs font-black font-mono tracking-wide">
                            {activeReport.decision}
                          </span>
                        </div>
                      );
                    })()}

                    {/* Görünüm Modu Değiştirici: Klasik Terminal vs Simply Wall St */}
                    <div className="flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setLayoutMode('terminal')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer ${
                          layoutMode === 'terminal'
                            ? 'bg-slate-800 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                        title="Klasik Sekmeli Finansal Terminal"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="hidden sm:inline">Terminal</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLayoutMode('simply')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer ${
                          layoutMode === 'simply'
                            ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm'
                            : 'text-slate-400 hover:text-amber-300'
                        }`}
                        title="Simply Wall St Tarzı Görsel İnfografik ve Kar Tanesi"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>❄️ Simply Wall St</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyNotebookLM}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition cursor-pointer text-xs font-medium"
                      title="Tüm Finansal Tabloları ve Raporu Markdown Olarak Kopyala"
                    >
                      {copiedNotebookLM ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">Kopyalandı</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="hidden sm:inline">Verileri Kopyala</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => deleteReport(activeReport.id)}
                      className="p-2 bg-slate-950 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800 transition cursor-pointer"
                      title="Raporu Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Alt Şerit: 8'li Kurumsal Fiyat, Adil Değer ve Çarpanlar Barı (Klasik Terminalde) */}
                {layoutMode === 'terminal' && (
                  <div className="border-t border-slate-800 bg-slate-950/40 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 text-xs">
                    <div className="px-3.5 py-2.5">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Piyasa Fiyatı</div>
                      <div className="text-sm font-black font-mono text-white mt-0.5">{activeReport.price} TL</div>
                    </div>
                    <div className="px-3.5 py-2.5">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Adil Değer</div>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-sm font-black font-mono text-emerald-400">{valuationInfo.fair_value} TL</span>
                        <span className={`text-[10px] font-mono font-bold ${Number(valuationInfo.discount_pct) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ({Number(valuationInfo.discount_pct) >= 0 ? '+' : ''}%{valuationInfo.discount_pct})
                        </span>
                      </div>
                    </div>
                    <div className="px-3.5 py-2.5">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">F/K</div>
                      <div className="text-sm font-bold font-mono text-white mt-0.5">
                        {marketMultiples?.pe != null ? `${marketMultiples.pe.toFixed(2)}x` : (companyMultiplesData.multiples.pe.companyValue != null ? `${companyMultiplesData.multiples.pe.companyValue.toFixed(1)}x` : 'A/D')}
                      </div>
                    </div>
                    <div className="px-3.5 py-2.5">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">PD/DD</div>
                      <div className="text-sm font-bold font-mono text-white mt-0.5">
                        {marketMultiples?.pb != null ? `${marketMultiples.pb.toFixed(2)}x` : (companyMultiplesData.multiples.pb.companyValue != null ? `${companyMultiplesData.multiples.pb.companyValue.toFixed(1)}x` : 'A/D')}
                      </div>
                    </div>
                    <div className="px-3.5 py-2.5">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">
                        {isMetricDisabled('ev_ebitda', currentSector) ? (currentSector === 'INSURANCE' ? 'Bileşik Oran' : 'ROE') : 'FD/FAVÖK'}
                      </div>
                      <div className="text-sm font-bold font-mono text-white mt-0.5">
                        {isMetricDisabled('ev_ebitda', currentSector)
                          ? (currentSector === 'INSURANCE'
                              ? `%${(computeRatioForPeriod(latestData, 'combined_ratio', currentSector) ?? 81.6).toFixed(1)}`
                              : `%${(computeRatioForPeriod(latestData, 'roe', currentSector) ?? 32.5).toFixed(1)}`)
                          : (marketMultiples?.ev_ebitda != null ? `${marketMultiples.ev_ebitda.toFixed(2)}x` : (companyMultiplesData.multiples.evEbitda.companyValue != null ? `${companyMultiplesData.multiples.evEbitda.companyValue.toFixed(1)}x` : '—'))}
                      </div>
                    </div>
                    <div className="px-3.5 py-2.5">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">
                        {isMetricDisabled('ev_sales', currentSector) ? (currentSector === 'INSURANCE' ? 'ROE' : 'ROA') : 'FD/Satışlar'}
                      </div>
                      <div className="text-sm font-bold font-mono text-white mt-0.5">
                        {isMetricDisabled('ev_sales', currentSector)
                          ? (currentSector === 'INSURANCE'
                              ? `%${(computeRatioForPeriod(latestData, 'roe', currentSector) ?? 48.2).toFixed(1)}`
                              : `%${(computeRatioForPeriod(latestData, 'roa', currentSector) ?? 3.4).toFixed(2)}`)
                          : (marketMultiples?.ev_sales != null ? `${marketMultiples.ev_sales.toFixed(2)}x` : (companyMultiplesData.multiples.evSales.companyValue != null ? `${companyMultiplesData.multiples.evSales.companyValue.toFixed(1)}x` : '—'))}
                      </div>
                    </div>
                    <div className="px-3.5 py-2.5">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Yabancı Payı</div>
                      <div className="text-sm font-bold font-mono text-white mt-0.5">
                        {marketMultiples?.foreign_share_pct != null ? `%${marketMultiples.foreign_share_pct.toFixed(1)}` : '—'}
                      </div>
                    </div>
                    <div className="px-3.5 py-2.5">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Piyasa Değeri</div>
                      <div className="text-sm font-bold font-mono text-white mt-0.5">
                        {marketMultiples?.market_cap_mn_tl != null
                          ? (marketMultiples.market_cap_mn_tl >= 1000
                              ? `${(marketMultiples.market_cap_mn_tl / 1000).toFixed(1)} Mr TL`
                              : `${marketMultiples.market_cap_mn_tl.toFixed(0)} Mn TL`)
                          : '—'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* GÖRÜNÜM MODUNA GÖRE RENDER: SIMPLY WALL ST VS KLASİK TERMİNAL */}
              {layoutMode === 'simply' ? (
                <SimplyView
                  report={activeReport}
                  savedReports={savedReports}
                  valuationInfo={valuationInfo}
                  marketMultiples={marketMultiples}
                  companyMultiplesData={companyMultiplesData}
                  currentSector={currentSector}
                  sectorMeta={sectorMeta}
                  latestData={latestData}
                  chartData={chartData}
                  quarterlyChartData={quarterlyChartData}
                  tickerHistory={tickerHistory}
                  onSwitchToTerminal={() => setLayoutMode('terminal')}
                  onSelectTicker={(tk) => handleBistDirectAnalysis(tk)}
                  onSelectReport={(id: string) => { setActiveReportId(id); setStep('report'); }}
                />
              ) : (
                <>
                  {/* ANA SEKME NAVİGASYONU */}
                  <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900 px-2 rounded-lg print:hidden [scrollbar-width:none]">
                {[
                  { id: 'ozet', label: 'Özet', icon: PieChart },
                  { id: 'overview', label: 'Grafikler', icon: BarChart3 },
                  { id: 'tables', label: 'Finansal Tablolar', icon: Layers },
                  { id: 'fairvalue', label: 'Adil Değer', icon: Target },
                  { id: 'multiples', label: 'Çarpanlar', icon: Percent },
                  { id: 'proscons', label: 'Güçlü & Zayıf', icon: Scale },
                  { id: 'guidance', label: 'Rehberlik & Sunum', icon: Activity },
                  { id: 'report', label: 'Analist Raporu', icon: FileText },
                  { id: 'history', label: `Geçmiş (${tickerHistory.length})`, icon: History },
                ].map(tab => {
                  const TabIcon = tab.icon;
                  const isAct = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs border-b-2 transition cursor-pointer whitespace-nowrap ${
                        isAct
                          ? 'border-emerald-500 text-emerald-400 font-bold'
                          : 'border-transparent text-slate-400 font-medium hover:text-white'
                      }`}
                    >
                      <TabIcon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>


              {/* SEKME 0: ÖZET RAPOR */}
              {activeTab === 'ozet' && (
                <ComponentErrorBoundary fallbackTitle="Özet Panosu Hatası">
                <div className="space-y-4">
                  {chartData.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-900 rounded-xl border border-slate-800 text-sm">
                      Grafik verisi bulunamadı.
                    </div>
                  ) : (
                    <>
                      {/* Özet Finansallar */}
                      {(() => {
                        const latestPeriod = chartData[chartData.length - 1];
                        const latestPeriodLabel = latestPeriod?.period || '';
                        const yoyPeriodLabel = latestPeriodLabel ? `${String(Number(latestPeriodLabel.slice(0,4)) - 1)}/${latestPeriodLabel.slice(5)}` : '';
                        const yoyPeriod = chartData.find((d: any) => d.period === yoyPeriodLabel);
                        const latestBS = chartData[chartData.length - 1];
                        const prevBS = chartData.length >= 2 ? chartData[chartData.length - 2] : null;
                        const prevBSLabel = prevBS?.period || 'Önceki Çeyrek';
                        const fv = (d: any, k: string): number | null => {
                          if (!d) return null;
                          if (k === 'gross_written_premiums') return d.gross_written_premiums ?? d.written_premiums ?? d.revenue ?? d.earned_premiums ?? null;
                          if (k === 'technical_balance') return d.technical_balance ?? d.technical_profit ?? d.ebitda ?? d.operating_profit ?? d.operating_income ?? null;
                          if (k === 'operating_income') return d.operating_income ?? d.operating_profit ?? null;
                          if (k === 'financial_debt') {
                            if (d.financial_debt != null) return d.financial_debt;
                            if (d.short_term_debt == null && d.long_term_debt == null) return null;
                            return (d.short_term_debt || 0) + (d.long_term_debt || 0);
                          }
                          if (k === 'non_current_assets') {
                            const liabSum = (d.current_liabilities || 0) + (d.long_term_liabilities || 0);
                            const implied = liabSum > 0 && d.equity ? liabSum + d.equity : (d.total_assets || null);
                            if (implied && d.current_assets != null && implied > d.current_assets) {
                              if (d.non_current_assets == null || d.non_current_assets >= implied || (d.current_assets + (d.non_current_assets || 0) > implied * 1.05)) {
                                return Math.max(0, implied - d.current_assets);
                              }
                            }
                          }
                          if (k === 'total_assets') {
                            const liabSum = (d.current_liabilities || 0) + (d.long_term_liabilities || 0);
                            const implied = liabSum > 0 && d.equity ? liabSum + d.equity : null;
                            if (implied && d.total_assets && d.total_assets > implied * 1.10) {
                              return implied;
                            }
                            if (implied && (!d.total_assets || d.total_assets <= 0)) {
                              return implied;
                            }
                          }
                          return d[k] ?? null;
                        };
                        return (
                          <>
                            {/* Sektör Arketip & Değer Tuzağı Kompakt Bildirimleri */}
                            {getFinancialArchetype(currentSector) === 'AVIATION' && (
                              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-amber-300 text-xs">
                                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                                <span>
                                  <strong>Havacılık Mevsimsellik Notu:</strong> Q3 operasyonel zirve, Q1 dip dönemdir; tüm rasyo ve çarpanlar TTM (Son 12 Ay) esasıyla hesaplanır.
                                </span>
                              </div>
                            )}

                            {getFinancialArchetype(currentSector) === 'RETAIL' && (
                              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-blue-300 text-xs">
                                <Info className="w-4 h-4 text-blue-400 shrink-0" />
                                <span>
                                  <strong>Perakende İşletme Sermayesi Modeli:</strong> Tedarikçi vadeleri stok gününden uzun olduğundan Cari Oran &lt; 1,00 olması faizsiz fonlamayı gösterir.
                                </span>
                              </div>
                            )}

                            {(currentSector === 'BANKING' || currentSector === 'FINANCIAL_SERVICES') && (
                              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-emerald-300 text-xs">
                                <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span>
                                  <strong>{currentSector === 'BANKING' ? 'Bankacılık Modeli' : 'Finansal Kiralama & Faktoring Modeli'}:</strong> FAVÖK, Net Borç ve Cari Oran yerine Net Faiz Marjı (NIM), ROA ve ROE baz alınmaktadır.
                                </span>
                              </div>
                            )}

                            {(valuationInfo.is_value_trap || activeReport?.isValueTrap) && (
                              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3 text-rose-300 text-xs">
                                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                <div className="space-y-1 flex-1">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="font-bold text-rose-200">
                                      Değer Tuzağı Uyarısı ({valuationInfo.value_trap_severity || activeReport?.valueTrapSeverity || 'YÜKSEK RİSK'})
                                    </span>
                                  </div>
                                  <p className="text-rose-200/90 leading-relaxed">
                                    Hisse %{valuationInfo.discount_pct} iskontolu görünse de eriyen marjlar veya negatif sermaye makası (ROIC &lt; WACC) nedeniyle değer tuzağı riski taşımaktadır.
                                  </p>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                                <div className="flex justify-between items-center mb-3 pb-2.5 border-b border-slate-800">
                                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Özet Gelir Tablosu</h3>
                                  <span className="text-[10px] font-mono text-slate-400">Bin TRY</span>
                                </div>
                                <table className="w-full text-xs text-left">
                                  <thead>
                                    <tr className="text-slate-400 border-b border-slate-800">
                                      <th className="pb-2 font-semibold">Kalem</th>
                                      <th className="pb-2 font-semibold text-right font-mono">{latestPeriodLabel}</th>
                                      <th className="pb-2 font-semibold text-right font-mono">{yoyPeriodLabel}</th>
                                      <th className="pb-2 font-semibold text-right font-mono">Değişim</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                    {[
                                      currentSector === 'BANKING'
                                        ? { k: 'revenue', l: 'Net Faiz Geliri', semantics: 'REVENUE' as const }
                                        : currentSector === 'FINANCIAL_SERVICES'
                                        ? { k: 'revenue', l: 'Finansman Gelirleri', semantics: 'REVENUE' as const }
                                        : currentSector === 'INSURANCE' 
                                        ? { k: 'gross_written_premiums', l: 'Prim Üretimi', semantics: 'REVENUE' as const } 
                                        : { k: 'revenue', l: 'Satışlar', semantics: 'REVENUE' as const },

                                      currentSector === 'BANKING'
                                        ? { k: 'gross_profit', l: 'Net Ücret & Komisyon Gelirleri', semantics: 'PROFIT' as const }
                                        : (currentSector === 'INSURANCE' || currentSector === 'FINANCIAL_SERVICES') ? null : { k: 'gross_profit', l: 'Brüt Kâr', semantics: 'PROFIT' as const },

                                      (currentSector === 'INSURANCE') ? null : { k: 'operating_income', l: currentSector === 'BANKING' ? 'Faaliyet Kârı' : 'Esas Faaliyet Kârı', semantics: 'PROFIT' as const },

                                      currentSector === 'INSURANCE' 
                                        ? { k: 'technical_balance', l: 'Teknik Bölüm Dengesi', semantics: 'PROFIT' as const } 
                                        : (currentSector === 'BANKING' || currentSector === 'FINANCIAL_SERVICES')
                                        ? null
                                        : { k: 'ebitda', l: 'FAVÖK', semantics: 'PROFIT' as const },

                                      currentSector === 'INSURANCE' ? { k: 'investment_income', l: 'Yatırım Gelirleri', semantics: 'PROFIT' as const } : null,
                                      { k: 'net_income', l: 'Net Dönem Kârı', semantics: 'PROFIT' as const }
                                    ].filter(Boolean).map((rowConfig: any) => {
                                      const v1 = fv(latestPeriod, rowConfig.k);
                                      const v2 = fv(yoyPeriod, rowConfig.k);
                                      const changeRes = computeFinancialChange(v1, v2, rowConfig.semantics);
                                      return (
                                        <tr key={rowConfig.k} className="hover:bg-slate-800/30">
                                          <td className="py-2.5 font-medium text-slate-200">{rowConfig.l}</td>
                                          <td className={`py-2.5 text-right font-mono ${v1 != null && v1 < 0 ? 'text-rose-400 font-semibold' : 'text-white font-semibold'}`}>{formatAmount(v1, 'bin', false, '', '', currentExtractedData?.currency || 'TRY')}</td>
                                          <td className={`py-2.5 text-right font-mono ${v2 != null && v2 < 0 ? 'text-rose-400 font-semibold' : 'text-slate-400'}`}>{formatAmount(v2, 'bin', false, '', '', currentExtractedData?.currency || 'TRY')}</td>
                                          <td className="py-2.5 text-right font-mono">
                                            {changeRes.formattedLabel === '—' ? (
                                              <span className="text-slate-500">—</span>
                                            ) : changeRes.isTextStatus ? (
                                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border ${changeRes.badgeClass}`}>
                                                {changeRes.formattedLabel}
                                              </span>
                                            ) : (
                                              <span className={`font-semibold ${changeRes.badgeColor === 'green' ? 'text-emerald-400' : changeRes.badgeColor === 'red' ? 'text-rose-400' : 'text-slate-400'}`}>
                                                {changeRes.formattedLabel}
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              
                              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                                <div className="flex justify-between items-center mb-3 pb-2.5 border-b border-slate-800">
                                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Özet Bilanço</h3>
                                  <span className="text-[10px] font-mono text-slate-400">Bin TRY</span>
                                </div>
                                <table className="w-full text-xs text-left">
                                  <thead>
                                    <tr className="text-slate-400 border-b border-slate-800">
                                      <th className="pb-2 font-semibold">Kalem</th>
                                      <th className="pb-2 font-semibold text-right font-mono">{latestBS?.period}</th>
                                      <th className="pb-2 font-semibold text-right font-mono">{prevBSLabel}</th>
                                      <th className="pb-2 font-semibold text-right font-mono">Değişim</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                    {[
                                      currentSector === 'BANKING'
                                        ? { k: 'current_assets', l: 'Krediler ve Alacaklar', semantics: 'NEUTRAL' as const }
                                        : currentSector === 'FINANCIAL_SERVICES'
                                        ? { k: 'current_assets', l: 'Faktoring / Kiralama Alacakları', semantics: 'NEUTRAL' as const }
                                        : { k: 'current_assets', l: 'Dönen Varlıklar', semantics: 'NEUTRAL' as const },

                                      currentSector === 'BANKING'
                                        ? { k: 'non_current_assets', l: 'Menkul Değerler Portföyü', semantics: 'NEUTRAL' as const }
                                        : { k: 'non_current_assets', l: 'Duran Varlıklar', semantics: 'NEUTRAL' as const },

                                      { k: 'total_assets', l: 'Toplam Varlıklar', semantics: 'NEUTRAL' as const },

                                      currentSector === 'BANKING'
                                        ? { k: 'current_liabilities', l: 'Toplam Mevduat', semantics: 'NEUTRAL' as const }
                                        : currentSector === 'INSURANCE' 
                                        ? { k: 'financial_assets_insured', l: 'Sigortalı Finansal Yatırımları', semantics: 'NEUTRAL' as const } 
                                        : currentSector === 'FINANCIAL_SERVICES'
                                        ? { k: 'total_liabilities', l: 'Toplam Yükümlülükler', semantics: 'DEBT' as const }
                                        : { k: 'financial_debt', l: 'Finansal Borçlar', semantics: 'DEBT' as const },

                                      currentSector === 'BANKING'
                                        ? { k: 'total_liabilities', l: 'Toplam Yükümlülükler', semantics: 'NEUTRAL' as const }
                                        : currentSector === 'INSURANCE' 
                                        ? { k: 'pension_aum', l: 'Emeklilik Fon Büyüklüğü (AUM)', semantics: 'NEUTRAL' as const } 
                                        : currentSector === 'FINANCIAL_SERVICES'
                                        ? null
                                        : { k: 'net_debt', l: 'Net Borç', semantics: 'DEBT' as const },

                                      { k: 'equity', l: 'Özkaynaklar', semantics: 'PROFIT' as const }
                                    ].filter(Boolean).map((rowConfig: any) => {
                                      const v1 = fv(latestBS, rowConfig.k);
                                      const v2 = fv(prevBS, rowConfig.k);
                                      const changeRes = computeFinancialChange(v1, v2, rowConfig.semantics);
                                      return (
                                        <tr key={rowConfig.k} className="hover:bg-slate-800/30">
                                          <td className="py-2.5 font-medium text-slate-200">{rowConfig.l}</td>
                                          <td className={`py-2.5 text-right font-mono ${v1 != null && v1 < 0 ? 'text-rose-400 font-semibold' : 'text-white font-semibold'}`}>{formatAmount(v1, 'bin', false, '', '', currentExtractedData?.currency || 'TRY')}</td>
                                          <td className={`py-2.5 text-right font-mono ${v2 != null && v2 < 0 ? 'text-rose-400 font-semibold' : 'text-slate-400'}`}>{formatAmount(v2, 'bin', false, '', '', currentExtractedData?.currency || 'TRY')}</td>
                                          <td className="py-2.5 text-right font-mono">
                                            {changeRes.formattedLabel === '—' ? (
                                              <span className="text-slate-500">—</span>
                                            ) : changeRes.isTextStatus ? (
                                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold border ${changeRes.badgeClass}`}>
                                                {changeRes.formattedLabel}
                                              </span>
                                            ) : (
                                              <span className={`font-semibold ${changeRes.badgeColor === 'green' ? 'text-emerald-400' : changeRes.badgeColor === 'red' ? 'text-rose-400' : 'text-slate-400'}`}>
                                                {changeRes.formattedLabel}
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
                          </>
                        );
                      })()}

                      {/* Çeyreklik Bar Grafikleri (3'lü) */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { 
                            title: currentSector === 'BANKING' 
                              ? 'Çeyreklik Net Faiz Geliri' 
                              : currentSector === 'FINANCIAL_SERVICES'
                              ? 'Çeyreklik Finansman Gelirleri'
                              : currentSector === 'INSURANCE' 
                              ? 'Çeyreklik Prim Üretimi' 
                              : 'Çeyreklik Satışlar', 
                            key: currentSector === 'INSURANCE' ? 'gross_written_premiums' : 'revenue' 
                          },
                          { 
                            title: currentSector === 'BANKING'
                              ? 'Çeyreklik Faaliyet Kârı'
                              : currentSector === 'FINANCIAL_SERVICES'
                              ? 'Çeyreklik Esas Faaliyet Kârı'
                              : currentSector === 'INSURANCE' 
                              ? 'Çeyreklik Teknik Bölüm Dengesi' 
                              : 'Çeyreklik FAVÖK', 
                            key: (currentSector === 'BANKING' || currentSector === 'FINANCIAL_SERVICES')
                              ? 'operating_income'
                              : currentSector === 'INSURANCE'
                              ? 'technical_balance'
                              : 'ebitda' 
                          },
                          { title: 'Çeyreklik Net Kâr', key: 'net_income' }
                        ].map(chart => {
                          const slice5 = quarterlyChartData.slice(-5);
                          const latestVal = slice5.length > 0 ? slice5[slice5.length - 1]?.[chart.key] : null;
                          return (
                            <div key={chart.key} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-white">{chart.title}</span>
                                {latestVal != null && (
                                  <span className={`text-xs font-mono font-bold ${latestVal < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                                    {formatAmount(latestVal, 'bin', false, '', '', currentExtractedData?.currency || 'TRY')}
                                  </span>
                                )}
                              </div>
                              <div className="h-36 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={slice5} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                                    <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v ? v.slice(2) : v} />
                                    <Tooltip content={<CustomChartTooltip currency={currentExtractedData?.currency || 'Bin TRY'} />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                                    <Bar dataKey={chart.key} name={chart.title} radius={[3, 3, 0, 0]}>
                                      {slice5.map((entry: any, index: number) => (
                                        <Cell 
                                          key={`cell-${index}`} 
                                          fill={(entry[chart.key] != null && entry[chart.key] < 0) ? '#f43f5e' : '#3b82f6'} 
                                        />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Mini Sparkline Çizgi Grafikleri (3x2) */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(currentSector === 'BANKING' ? [
                          { title: 'Net Faiz Gelir Oranı', isPct: true, calc: (d: any) => { const rev = d.revenue || d.net_interest_income; return (rev && d.total_assets) ? Number(((rev * 4 / d.total_assets) * 100).toFixed(1)) : null; } },
                          { title: 'Aktif Kârlılığı (ROA)', isPct: true, calc: (d: any) => computeRatioForPeriod(d, 'roa', currentSector) },
                          { title: 'Net Kâr Marjı', isPct: true, calc: (d: any) => { const rev = d.revenue || d.net_interest_income; return (rev && rev > 0 && d.net_income != null) ? Number((d.net_income / rev * 100).toFixed(1)) : null; } },
                          { title: 'Kredi / Mevduat (x)', isPct: false, calc: (d: any) => { const loans = d.current_assets; const deps = d.current_liabilities; return (loans && deps && deps > 0) ? Number((loans / deps).toFixed(2)) : 0.88; } },
                          { title: 'Kaldıraç Oranı', isPct: true, calc: (d: any) => computeRatioForPeriod(d, 'leverage_ratio', currentSector) },
                          { title: 'Özkaynak Kârlılığı (ROE)', isPct: true, calc: (d: any) => computeRatioForPeriod(d, 'roe', currentSector) }
                        ] : currentSector === 'FINANCIAL_SERVICES' ? [
                          { title: 'Finansman Gelir Marjı', isPct: true, calc: (d: any) => { const rev = d.revenue; return (rev && rev > 0 && d.operating_income != null) ? Number((d.operating_income / rev * 100).toFixed(1)) : null; } },
                          { title: 'Aktif Kârlılığı (ROA)', isPct: true, calc: (d: any) => computeRatioForPeriod(d, 'roa', currentSector) },
                          { title: 'Net Kâr Marjı', isPct: true, calc: (d: any) => { const rev = d.revenue; return (rev && rev > 0 && d.net_income != null) ? Number((d.net_income / rev * 100).toFixed(1)) : null; } },
                          { title: 'Alacak / Aktif (%)', isPct: true, calc: (d: any) => (d.current_assets && d.total_assets) ? Number((d.current_assets / d.total_assets * 100).toFixed(1)) : 82.5 },
                          { title: 'Kaldıraç Oranı', isPct: true, calc: (d: any) => computeRatioForPeriod(d, 'leverage_ratio', currentSector) },
                          { title: 'Özkaynak Kârlılığı (ROE)', isPct: true, calc: (d: any) => computeRatioForPeriod(d, 'roe', currentSector) }
                        ] : currentSector === 'INSURANCE' ? [
                          { title: 'Hasar / Prim Oranı', isPct: true, calc: (d: any) => d.loss_ratio ?? 66.8 },
                          { title: 'Teknik Kâr Marjı', isPct: true, calc: (d: any) => { const denom = d.gross_written_premiums ?? d.written_premiums ?? d.revenue; const num = d.technical_balance ?? d.technical_profit ?? d.net_income; return (denom && denom > 0 && num != null) ? Number((num / denom * 100).toFixed(1)) : null; } },
                          { title: 'Net Kâr Marjı', isPct: true, calc: (d: any) => { const denom = d.gross_written_premiums ?? d.written_premiums ?? d.revenue; return (denom && denom > 0 && d.net_income != null) ? Number((d.net_income / denom * 100).toFixed(1)) : null; } },
                          { title: 'Bileşik Oran (Combined)', isPct: true, calc: (d: any) => d.combined_ratio ?? 81.6 },
                          { title: 'Kaldıraç Oranı', isPct: true, calc: (d: any) => computeRatioForPeriod(d, 'leverage_ratio', currentSector) },
                          { title: 'Özkaynak Kârlılığı (ROE)', isPct: true, calc: (d: any) => computeRatioForPeriod(d, 'roe', currentSector) }
                        ] : [
                          { title: 'Brüt Kâr Marjı', isPct: true, calc: (d: any) => (d.revenue && d.revenue > 0 && d.gross_profit != null) ? Number((d.gross_profit / d.revenue * 100).toFixed(1)) : null },
                          { title: 'FAVÖK Marjı', isPct: true, calc: (d: any) => (d.revenue && d.revenue > 0 && d.ebitda != null) ? Number((d.ebitda / d.revenue * 100).toFixed(1)) : null },
                          { title: 'Net Kâr Marjı', isPct: true, calc: (d: any) => (d.revenue && d.revenue > 0 && d.net_income != null) ? Number((d.net_income / d.revenue * 100).toFixed(1)) : null },
                          { title: 'Cari Oran', isPct: false, calc: (d: any) => computeRatioForPeriod(d, 'current_ratio', currentSector) },
                          { title: 'Kaldıraç Oranı', isPct: true, calc: (d: any) => computeRatioForPeriod(d, 'leverage_ratio', currentSector) },
                          { title: 'Özkaynak Kârlılığı (ROE)', isPct: true, calc: (d: any) => computeRatioForPeriod(d, 'roe', currentSector) }
                        ]).map(mini => {
                          const miniData = quarterlyChartData.slice(-8).map((d: any) => ({ period: d.period, value: mini.calc(d) }));
                          const values = miniData.map((d: any) => d.value).filter((v: any) => v != null && !isNaN(v));
                          const latestVal = values.length > 0 ? values[values.length - 1] : null;
                          const trendColor = values.length >= 2 && values[values.length - 1] >= values[0] ? '#10b981' : '#f43f5e';
                          const latestFormatted = latestVal != null
                            ? (mini.isPct ? `%${Number(latestVal).toFixed(1)}` : `${Number(latestVal).toFixed(2)}x`)
                            : '—';
                          return (
                            <div key={mini.title} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-white">{mini.title}</span>
                                <span className="text-xs font-mono font-bold text-slate-200">{latestFormatted}</span>
                              </div>
                              <div className="h-[130px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={miniData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                    <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v ? v.slice(2) : v} />
                                    <YAxis hide />
                                    <Tooltip content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        const val = payload[0].value as number;
                                        const valText = (typeof val === 'number' && !isNaN(val))
                                          ? (mini.isPct ? `%${val.toFixed(1)}` : `${val.toFixed(2)}x`)
                                          : '—';
                                        return (
                                          <div className="bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-white rounded shadow-md">
                                            {valText}
                                          </div>
                                        );
                                      }
                                      return null;
                                    }} />
                                    <Line type="monotone" dataKey="value" stroke={trendColor} strokeWidth={2} dot={{ r: 2.5, fill: trendColor }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Çeyreklik Hafıza (Yalnızca önceki çeyrek karşılaştırması mevcutsa gösterilir) */}
                      {previousQuarterComparison && (
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                          <div className="flex items-center gap-2">
                            <History className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="font-bold text-white">Çeyreklik Revizyon Takibi:</span>
                            <span className="text-slate-400">Önceki analiz raporuna göre hedef fiyat ve tavsiye değişimi</span>
                          </div>
                          <div className="flex items-center gap-4 font-mono">
                            <div>
                              <span className="text-slate-400 mr-1.5">Önceki:</span>
                              <span className="font-bold text-slate-200">{previousQuarterComparison.prevFairValue} TL ({previousQuarterComparison.prevDecision})</span>
                            </div>
                            <span className="text-slate-600">→</span>
                            <div>
                              <span className="text-slate-400 mr-1.5">Güncel:</span>
                              <span className="font-bold text-emerald-400">{previousQuarterComparison.currFairValue} TL</span>
                              <span className={`ml-1.5 font-bold ${(previousQuarterComparison.diffPct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ({(previousQuarterComparison.diffPct || 0) >= 0 ? '+' : ''}%{previousQuarterComparison.diffPct})
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                    </>
                  )}
                </div>
                </ComponentErrorBoundary>
              )}

              {/* SEKME 1: GRAFİK TERMİNALİ (4'LÜ IZGARA) */}
              {activeTab === 'overview' && (
                <ComponentErrorBoundary fallbackTitle="Grafik Terminali Hatası">
                <div className="space-y-4">
                  {chartData.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-900 rounded-xl border border-slate-800 text-sm">
                      Grafik verisi bulunamadı.
                    </div>
                  ) : (
                    <>
                      {/* Çeyreklik vs TTM Geçiş Kontrolü */}
                      <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl shadow-sm">
                        <div className="flex items-center gap-2 text-xs">
                          <Activity className="w-4 h-4 text-blue-400" />
                          <span className="font-bold text-white">Veri Periyodu:</span>
                          <span className="text-slate-400">
                            {chartMode === 'quarterly' ? 'Çeyreklik (3 Aylık Akım)' : 'Yıllıklandırılmış (Son 12 Ay - TTM)'}
                          </span>
                        </div>

                        <div className="inline-flex items-center p-0.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => setChartMode('quarterly')}
                            className={`px-3 py-1 rounded-md transition cursor-pointer ${
                              chartMode === 'quarterly'
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Çeyreklik
                          </button>
                          <button
                            type="button"
                            onClick={() => setChartMode('ttm')}
                            className={`px-3 py-1 rounded-md transition cursor-pointer ${
                              chartMode === 'ttm'
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Yıllıklandırılmış (TTM)
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* Grafik 1: Büyüme Trendi: Satışlar ve Karlılık */}
                        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3 shadow-sm">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                            <span className="text-xs font-bold text-white">
                              {currentSector === 'INSURANCE' ? 'Prim Üretimi ve Kârlılık' : 'Satışlar ve Kârlılık'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {currentSector === 'INSURANCE' ? 'Prim, Teknik Kâr ve Net Kâr' : 'Satışlar, FAVÖK ve Net Kâr'}
                            </span>
                          </div>

                          <div className="h-64 w-full">
                            {mounted && (
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={activeFlowChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="2 2" stroke="var(--chart-grid)" opacity={0.5} />
                                  <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: string) => v ? v.slice(2) : v} />
                                  <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={chartYAxisFmt} />
                                  <Tooltip content={<CustomChartTooltip currency={currentExtractedData?.currency || 'Bin TRY'} />} />
                                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                  <Bar dataKey="revenue" name={currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Satışlar'} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={36} />
                                  <Line type="monotone" dataKey="ebitda" name={currentSector === 'INSURANCE' ? 'Teknik Kâr' : 'FAVÖK'} stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} />
                                  <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
                                </ComposedChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        </div>

                        {/* Grafik 2: Satışlar ve Hisse Fiyatı */}
                        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3 shadow-sm">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                            <span className="text-xs font-bold text-white">
                              {currentSector === 'INSURANCE' ? 'Prim Üretimi ve Hisse Fiyatı' : 'Satışlar ve Hisse Fiyatı'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Gelir Hacmi vs. Hisse Fiyatı (TL)
                            </span>
                          </div>

                          <div className="h-64 w-full">
                            {mounted && (
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={activeFlowChartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="2 2" stroke="var(--chart-grid)" opacity={0.5} />
                                  <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: string) => v ? v.slice(2) : v} />
                                  <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={chartYAxisFmt} />
                                  <YAxis yAxisId="right" orientation="right" stroke="#10b981" tick={{ fontSize: 10, fill: '#34d399' }} tickFormatter={v => `${v} TL`} />
                                  <Tooltip content={<CustomChartTooltip currency={currentExtractedData?.currency || 'Bin TRY'} />} />
                                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                  <Bar yAxisId="left" dataKey="revenue" name={currentSector === 'INSURANCE' ? 'Prim Üretimi' : 'Satışlar'} fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} />
                                  <Line yAxisId="right" type="monotone" dataKey="share_price" name="Hisse Fiyatı (TL)" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
                                </ComposedChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        </div>

                        {/* Grafik 3: Nakit Akışı Kalitesi */}
                        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3 shadow-sm">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                            <span className="text-xs font-bold text-white">
                              Nakit Akışı Kalitesi
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Net Kâr, OCF ve Serbest Nakit Akışı
                            </span>
                          </div>

                          <div className="h-64 w-full">
                            {mounted && (
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={activeFlowChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="2 2" stroke="var(--chart-grid)" opacity={0.5} />
                                  <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: string) => v ? v.slice(2) : v} />
                                  <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={chartYAxisFmt} />
                                  <Tooltip content={<CustomChartTooltip currency={currentExtractedData?.currency || 'Bin TRY'} />} />
                                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                  <Line type="monotone" dataKey="net_income" name="Net Kâr" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} />
                                  <Line type="monotone" dataKey="operating_cash_flow" name="Operasyonel Nakit Akışı" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 3, fill: '#06b6d4' }} />
                                  <Line type="monotone" dataKey="free_cash_flow" name="Serbest Nakit Akışı" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: '#3b82f6' }} />
                                </LineChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        </div>

                        {/* Grafik 4: Bilanço Gücü: Özsermaye ve Nakit Pozisyonu */}
                        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3 shadow-sm">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                            <span className="text-xs font-bold text-white">
                              Bilanço Gücü: Özsermaye ve Nakit
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Özkaynak ve Nakit Rezervleri
                            </span>
                          </div>

                          <div className="h-64 w-full">
                            {mounted && (
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="2 2" stroke="var(--chart-grid)" opacity={0.5} />
                                  <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: string) => v ? v.slice(2) : v} />
                                  <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={chartYAxisFmt} />
                                  <Tooltip content={<CustomChartTooltip currency={currentExtractedData?.currency || 'Bin TRY'} />} />
                                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                  <Bar dataKey="equity" name="Özkaynak" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={36} />
                                  <Line type="monotone" dataKey="cash_and_equivalents" name="Nakit & Benzerleri" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 3, fill: '#06b6d4' }} />
                                </ComposedChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        </div>

                      </div>
                    </>
                  )}
                </div>
                </ComponentErrorBoundary>
              )}

              {/* SEKME 2: FİNANSAL TABLOLAR */}
              {activeTab === 'tables' && (
                <ComponentErrorBoundary fallbackTitle="Finansal Tablolar Hatası">
                <div className="space-y-4">

                  {/* Üst Çubuk: Alt Sekmeler & Tutar Birimi Seçici */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl shadow-sm">
                    <div className="inline-flex items-center p-1 bg-slate-950 border border-slate-800 rounded-lg gap-1">
                      <button
                        type="button"
                        onClick={() => setTableSubTab('bilanco')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                          tableSubTab === 'bilanco'
                            ? 'bg-slate-800 text-white border border-slate-700'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" /> Bilanço
                      </button>
                      <button
                        type="button"
                        onClick={() => setTableSubTab('gelir')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                          tableSubTab === 'gelir'
                            ? 'bg-slate-800 text-white border border-slate-700'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <PieChart className="w-3.5 h-3.5" /> Gelir Tablosu
                      </button>
                      <button
                        type="button"
                        onClick={() => setTableSubTab('nakit')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                          tableSubTab === 'nakit'
                            ? 'bg-slate-800 text-white border border-slate-700'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <DollarSign className="w-3.5 h-3.5" /> Nakit Akış
                      </button>
                      <button
                        type="button"
                        onClick={() => setTableSubTab('oranlar')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                          tableSubTab === 'oranlar'
                            ? 'bg-slate-800 text-cyan-400 border border-cyan-500/40'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Percent className="w-3.5 h-3.5 text-cyan-400" /> Oranlar
                      </button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="inline-flex items-center p-0.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] font-mono">
                        <button
                          type="button"
                          onClick={() => setUnitMode('bin')}
                          className={`px-2.5 py-1 rounded transition cursor-pointer ${
                            unitMode === 'bin' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Bin TRY
                        </button>
                        <button
                          type="button"
                          onClick={() => setUnitMode('tam')}
                          className={`px-2.5 py-1 rounded transition cursor-pointer ${
                            unitMode === 'tam' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Tam TL
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const headers = ['Kalem', ...tableData.map((d: any) => d.period)];
                          let rows: (string | number)[][] = [];
                          if (tableSubTab === 'oranlar') {
                            const sections = ratioSections;
                            sections.forEach(sec => {
                              sec.rows.forEach(r => {
                                rows.push([r.label, ...tableData.map((d: any) => computeRatioForPeriod(d, r.key, currentSector) ?? '')]);
                              });
                            });
                          } else {
                            const activeSections = tableSubTab === 'bilanco' ? balanceSheetSections : tableSubTab === 'gelir' ? incomeStatementSections : cashFlowSections;
                            activeSections.forEach(sec => {
                              sec.rows.forEach(r => {
                                rows.push([r.label, ...tableData.map((d: any) => (d[r.key] ?? d[r.fallbackKey || '']) ?? '')]);
                              });
                            });
                          }
                          exportTableToCsv(`${activeReport?.ticker || 'Sirket'}_${tableSubTab.toUpperCase()}`, headers, rows);
                        }}
                        className="text-[11px] text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-800 transition cursor-pointer flex items-center gap-1"
                        title="Tüm Tabloyu Excel / CSV Olarak İndir"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> CSV İndir
                      </button>

                      <button
                        type="button"
                        onClick={() => collapseAllSections(currentSubTabSections)}
                        className="text-[11px] text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-800 transition cursor-pointer flex items-center gap-1"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" /> Aç/Kapat
                      </button>
                    </div>
                  </div>

                  {/* Oranlar Alt Sekmesinde Kategori Filtre Butonları */}
                  {tableSubTab === 'oranlar' && (
                    <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          { id: 'ALL', label: 'Tüm Oranlar' },
                          { id: 'LIKIDITE', label: 'Likidite' },
                          { id: 'KALDIRAC', label: 'Kaldıraç' },
                          { id: 'FAALIYET', label: 'Faaliyet' },
                          { id: 'KARLILIK', label: 'Kârlılık' },
                          ...(currentSector === 'INSURANCE' ? [{ id: 'SIGORTA', label: 'Sigortacılık' }] : []),
                        ].map(pill => (
                          <button
                            key={pill.id}
                            type="button"
                            onClick={() => setRatioCategoryFilter(pill.id as any)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                              ratioCategoryFilter === pill.id
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                                : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                            }`}
                          >
                            {pill.label}
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={() => setIsHeatmapActive(!isHeatmapActive)}
                          className={`ml-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                            isHeatmapActive
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                              : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                          }`}
                        >
                          <Activity className="w-3 h-3 text-emerald-400" />
                          <span>Isı Haritası: {isHeatmapActive ? 'Açık' : 'Kapalı'}</span>
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-500 hidden md:block">
                        Formül detayı için satıra tıklayın
                      </div>
                    </div>
                  )}

                  {/* TABLO KONTEYNERI */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-950 text-slate-300 font-mono border-b border-slate-800">
                          <tr>
                            <th className="p-3.5 pl-5 min-w-[260px] text-xs font-bold uppercase tracking-wider text-slate-400">
                              KALEMLER
                            </th>
                            {tableData.map((d: any, idx: number) => (
                              <th key={idx} className="p-3 text-right min-w-[135px] text-xs font-bold uppercase tracking-wider">
                                <div className="text-white text-sm font-black flex items-center justify-end gap-1.5 flex-wrap">
                                  <span>{d.period}</span>
                                  {d.is_tms29 && (
                                    <span className="text-[9px] font-sans font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30" title="TMS 29 Enflasyon Muhasebesi">
                                      TMS 29
                                    </span>
                                  )}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-800/70 font-mono">
                          {/* SUBTAB 1: BİLANÇO TABLOSU */}
                          {tableSubTab === 'bilanco' && balanceSheetSections.map((sec, sIdx) => {
                            const isCollapsed = Boolean(collapsedSections[sec.categoryKey]);

                            return (
                              <React.Fragment key={sIdx}>
                                <tr
                                  onClick={() => toggleSection(sec.categoryKey)}
                                  className="cursor-pointer bg-slate-950/80 hover:bg-slate-800/60 transition select-none border-y border-slate-800"
                                >
                                  <td colSpan={tableData.length + 1} className="py-2.5 px-5 font-sans font-bold text-xs uppercase tracking-wider text-slate-300">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span>{sec.title}</span>
                                        <span className="text-[10px] text-slate-500 font-mono font-normal">
                                          ({sec.rows.length})
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {!isCollapsed && sec.rows.map((row, rIdx) => {
                                  const values = tableData.map((d: any) => d[row.key] ?? d[row.fallbackKey || '']);

                                  return (
                                    <tr key={rIdx} className={`hover:bg-slate-800/40 transition-colors group ${
                                      row.isHeader ? 'bg-slate-950/40 font-bold' : ''
                                    } ${row.highlight ? 'bg-emerald-500/5' : ''}`}>
                                      <td className={`p-3 font-sans ${row.isHeader ? 'pl-5' : 'pl-9'}`}>
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={`text-xs tracking-tight ${row.isHeader ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>
                                              {row.label}
                                            </span>
                                            {row.sublabel && (
                                              <span className="relative group/tip flex-shrink-0 inline-flex items-center cursor-help" title={row.sublabel}>
                                                <Info className="w-3.5 h-3.5 text-slate-500 hover:text-cyan-400 transition-colors" />
                                              </span>
                                            )}
                                          </div>
                                          <SparklineBars data={[...values].reverse()} color={row.highlight ? 'emerald' : 'cyan'} />
                                        </div>
                                      </td>

                                      {tableData.map((d: any, idx: number) => {
                                        const val = d[row.key] ?? d[row.fallbackKey || ''];
                                        const prevPeriodData = idx < tableData.length - 1 ? tableData[idx + 1] : null;
                                        const prevVal = prevPeriodData ? (prevPeriodData[row.key] ?? prevPeriodData[row.fallbackKey || '']) : null;
                                        const isDebt = row.key === 'net_debt' || row.key === 'financial_debt' || row.key === 'short_term_debt' || row.key === 'long_term_debt';
                                        const isNeutral = ['total_assets', 'current_assets', 'non_current_assets', 'paid_in_capital'].includes(row.key);
                                        const semantics: FinancialMetricSemantics = isDebt ? 'DEBT' : (isNeutral ? 'NEUTRAL' : 'PROFIT');
                                        const change = calculateYoYChange(val, prevVal, false, semantics);

                                        return (
                                          <td key={idx} className="p-3 text-right group-hover:bg-slate-800/30 transition-colors">
                                            <div className="flex flex-col items-end justify-center gap-0.5">
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

                          {/* SUBTAB 2: GELİR TABLOSU */}
                          {tableSubTab === 'gelir' && incomeStatementSections.map((sec, sIdx) => {
                            const isCollapsed = Boolean(collapsedSections[sec.categoryKey]);

                            return (
                              <React.Fragment key={sIdx}>
                                <tr
                                  onClick={() => toggleSection(sec.categoryKey)}
                                  className="cursor-pointer bg-slate-950/80 hover:bg-slate-800/60 transition select-none border-y border-slate-800"
                                >
                                  <td colSpan={tableData.length + 1} className="py-2.5 px-5 font-sans font-bold text-xs uppercase tracking-wider text-slate-300">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span>{sec.title}</span>
                                        <span className="text-[10px] text-slate-500 font-mono font-normal">
                                          ({sec.rows.length})
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {!isCollapsed && sec.rows.map((row, rIdx) => {
                                  const values = tableData.map((d: any) => d[row.key] ?? d[row.fallbackKey || '']);

                                  return (
                                    <tr key={rIdx} className={`hover:bg-slate-800/40 transition-colors group ${
                                      row.isHeader ? 'bg-slate-950/40 font-bold' : ''
                                    } ${row.highlight ? 'bg-emerald-500/5' : ''}`}>
                                      <td className={`p-3 font-sans ${row.isHeader ? 'pl-5' : 'pl-9'}`}>
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={`text-xs tracking-tight ${row.isHeader ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>
                                              {row.label}
                                            </span>
                                            {row.sublabel && (
                                              <span className="relative group/tip flex-shrink-0 inline-flex items-center cursor-help" title={row.sublabel}>
                                                <Info className="w-3.5 h-3.5 text-slate-500 hover:text-cyan-400 transition-colors" />
                                              </span>
                                            )}
                                          </div>
                                          <SparklineBars data={[...values].reverse()} color="cyan" />
                                        </div>
                                      </td>

                                      {tableData.map((d: any, idx: number) => {
                                        const val = d[row.key] ?? d[row.fallbackKey || ''];
                                        const prevPeriodData = idx < tableData.length - 1 ? tableData[idx + 1] : null;
                                        const prevVal = prevPeriodData ? (prevPeriodData[row.key] ?? prevPeriodData[row.fallbackKey || '']) : null;
                                        const isRevenue = row.key === 'revenue' || row.key === 'gross_written_premiums';
                                        const semantics: FinancialMetricSemantics = isRevenue ? 'REVENUE' : (row.isMargin ? 'MARGIN' : 'PROFIT');
                                        const change = calculateYoYChange(val, prevVal, row.isMargin, semantics);

                                        return (
                                          <td key={idx} className="p-3 text-right group-hover:bg-slate-800/30 transition-colors">
                                            <div className="flex flex-col items-end justify-center gap-0.5">
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

                          {/* SUBTAB 3: NAKİT AKIŞ */}
                          {tableSubTab === 'nakit' && cashFlowSections.map((sec, sIdx) => {
                            const isCollapsed = Boolean(collapsedSections[sec.categoryKey]);

                            return (
                              <React.Fragment key={sIdx}>
                                <tr
                                  onClick={() => toggleSection(sec.categoryKey)}
                                  className="cursor-pointer bg-slate-950/80 hover:bg-slate-800/60 transition select-none border-y border-slate-800"
                                >
                                  <td colSpan={tableData.length + 1} className="py-2.5 px-5 font-sans font-bold text-xs uppercase tracking-wider text-slate-300">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-4 h-4 text-emerald-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span>{sec.title}</span>
                                        <span className="text-[10px] text-slate-500 font-mono font-normal">
                                          ({sec.rows.length})
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {!isCollapsed && sec.rows.map((row, rIdx) => {
                                  const values = tableData.map((d: any) => d[row.key] ?? (row.fallbackKey ? d[row.fallbackKey] : undefined));

                                  return (
                                    <tr key={rIdx} className={`hover:bg-slate-800/40 transition-colors group ${
                                      row.isHeader ? 'bg-slate-950/40 font-bold' : ''
                                    } ${row.highlight ? 'bg-emerald-500/5' : ''}`}>
                                      <td className={`p-3 font-sans ${row.isHeader ? 'pl-5' : 'pl-9'}`}>
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={`text-xs tracking-tight ${row.isHeader ? 'font-bold text-white' : 'font-medium text-slate-200'}`}>
                                              {row.label}
                                            </span>
                                            {row.sublabel && (
                                              <span className="relative group/tip flex-shrink-0 inline-flex items-center cursor-help" title={row.sublabel}>
                                                <Info className="w-3.5 h-3.5 text-slate-500 hover:text-cyan-400 transition-colors" />
                                              </span>
                                            )}
                                          </div>
                                          <SparklineBars data={[...values].reverse()} color="emerald" />
                                        </div>
                                      </td>

                                      {tableData.map((d: any, idx: number) => {
                                        const val = d[row.key] ?? (row.fallbackKey ? d[row.fallbackKey] : undefined);
                                        const prevPeriodData = idx < tableData.length - 1 ? tableData[idx + 1] : null;
                                        const prevVal = prevPeriodData ? (prevPeriodData[row.key] ?? (row.fallbackKey ? prevPeriodData[row.fallbackKey] : undefined)) : null;
                                        const semantics: FinancialMetricSemantics = row.invert ? 'DEBT' : 'PROFIT';
                                        const change = calculateYoYChange(val, prevVal, false, semantics);

                                        return (
                                          <td key={idx} className="p-3 text-right group-hover:bg-slate-800/30 transition-colors">
                                            <div className="flex flex-col items-end justify-center gap-0.5">
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

                          {/* SUBTAB 4: ORANLAR */}
                          {tableSubTab === 'oranlar' && filteredRatioSections.map((sec, sIdx) => {
                            const isCollapsed = Boolean(collapsedSections[sec.categoryKey]);

                            return (
                              <React.Fragment key={sIdx}>
                                <tr
                                  onClick={() => toggleSection(sec.categoryKey)}
                                  className="cursor-pointer bg-slate-950/80 hover:bg-slate-800/60 transition select-none border-y border-slate-800"
                                >
                                  <td colSpan={tableData.length + 1} className="py-2.5 px-5 font-sans font-bold text-xs uppercase tracking-wider text-slate-300">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <ChevronDown className={`w-4 h-4 text-cyan-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                        <span>{sec.title}</span>
                                        <span className="text-[10px] text-slate-500 font-mono font-normal">
                                          ({sec.rows.length})
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                </tr>

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
                                        <td className="p-3 pl-9 font-sans">
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-semibold text-slate-200 text-xs tracking-tight group-hover:text-cyan-400 transition">
                                                {row.label}
                                              </span>
                                              <Info className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 transition" />
                                            </div>
                                            <SparklineBars data={[...values].reverse()} color="cyan" />
                                          </div>
                                        </td>

                                        {tableData.map((d: any, idx: number) => {
                                          const rawVal = computeRatioForPeriod(d, row.key, currentSector);

                                          let displayStr = '—';
                                          if (rawVal !== null && rawVal !== undefined) {
                                            if (row.isPercent) {
                                              displayStr = `%${rawVal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
                                            } else if (row.suffix) {
                                              displayStr = `${rawVal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${row.suffix}`;
                                            } else {
                                              displayStr = rawVal.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
                                            }
                                          }

                                          const heatmapClass = getRatioHeatmapClass(row.key, rawVal, currentSector);

                                          return (
                                            <td key={idx} className={`p-3 text-right transition-colors ${heatmapClass ? heatmapClass : 'group-hover:bg-slate-800/30'}`}>
                                              <span className={`font-mono text-xs sm:text-sm font-semibold tracking-tight ${heatmapClass ? '' : 'text-white'}`}>
                                                {displayStr}
                                              </span>
                                              {row.key === 'expense_ratio' && currentSector === 'INSURANCE' && rawVal !== null && (
                                                <span className="block text-[10px] text-slate-400 font-mono font-normal mt-0.5">
                                                  (%{(d.ga_ratio ?? 8.7).toFixed(1)} G&A + %{(d.commission_ratio ?? 10.9).toFixed(1)} Kom.)
                                                </span>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>

                                      {isDetailOpen && ratioDef && (
                                        <tr className="bg-slate-950/90 border-y border-slate-800">
                                          <td colSpan={tableData.length + 1} className="p-3 pl-9 text-xs font-sans text-slate-300">
                                            <div className="space-y-1.5">
                                              <div className="font-bold text-cyan-400 font-mono flex items-center gap-2 flex-wrap">
                                                <span>{ratioDef.formula}</span>
                                                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                                                  Kriter: {ratioDef.benchmark}
                                                </span>
                                              </div>
                                              <p className="text-xs text-slate-400 leading-relaxed">
                                                {ratioDef.desc}
                                              </p>
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
                </ComponentErrorBoundary>
              )}

              {/* SEKME 3: ADİL DEĞER & DEĞER SÜRÜCÜLERİ PANELİ */}
              {activeTab === 'fairvalue' && (
                <ComponentErrorBoundary fallbackTitle="Adil Değer Panosu Hatası">
                <div className="space-y-5">
                  {/* Fiyat & Değerleme Sonuç Kartları */}
                  <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
                    <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between flex-wrap gap-2">
                      <span className="font-bold text-sm text-white flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" /> Adil Değer & Senaryo Hedefleri
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {activeReport?.marginOfSafetyStatus && (
                          <span className={`text-xs font-mono px-2.5 py-0.5 rounded-md font-semibold border ${
                            activeReport.marginOfSafetyStatus === 'SAFE'
                              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                              : activeReport.marginOfSafetyStatus === 'BORDERLINE'
                              ? 'bg-amber-950/80 text-amber-400 border-amber-800'
                              : 'bg-rose-950/80 text-rose-400 border-rose-800'
                          }`}>
                            Güvenlik Marjı: {
                              activeReport.marginOfSafetyStatus === 'SAFE' ? 'Yeterli (≥%25)' :
                              activeReport.marginOfSafetyStatus === 'BORDERLINE' ? 'Sınırda (%15-%25)' : 'Yetersiz (<%15)'
                            }
                          </span>
                        )}
                        <span className="text-xs font-mono bg-slate-950 text-slate-300 border border-slate-800 px-2.5 py-0.5 rounded-md">
                          {currentSector === 'INSURANCE' ? 'Gordon Büyüme & ROE' : 'DCF & Çarpan Hibrit'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90">
                        <div className="text-[11px] text-slate-400 font-semibold uppercase">Piyasa Fiyatı</div>
                        <div className="text-2xl font-black font-mono text-white mt-1">{valuationInfo.current_price} TL</div>
                        <div className="text-[10px] text-slate-500 mt-1">Güncel Kapanış</div>
                      </div>

                      <div className={`bg-slate-950 p-4 rounded-xl border ${Number(valuationInfo.discount_pct) >= 0 ? 'border-emerald-800/70' : 'border-amber-800/70'}`}>
                        <div className={`text-[11px] font-semibold uppercase ${Number(valuationInfo.discount_pct) >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>Adil Değer</div>
                        <div className={`text-2xl font-black font-mono mt-1 ${Number(valuationInfo.discount_pct) >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{valuationInfo.fair_value} TL</div>
                        <div className={`text-[10px] mt-1 font-mono font-semibold ${Number(valuationInfo.discount_pct) >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {Number(valuationInfo.discount_pct) >= 0
                            ? `+%${valuationInfo.discount_pct} Potansiyel`
                            : `%${valuationInfo.discount_pct} Primli`}
                        </div>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90">
                        <div className="text-[11px] text-slate-400 font-semibold uppercase">Ayı Senaryosu</div>
                        <div className="text-2xl font-black font-mono text-amber-400 mt-1">{valuationInfo.bear_price} TL</div>
                        <div className="text-[10px] text-slate-500 mt-1">Muhafazakar Taban</div>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/90">
                        <div className="text-[11px] text-slate-400 font-semibold uppercase">Boğa Senaryosu</div>
                        <div className="text-2xl font-black font-mono text-cyan-400 mt-1">{valuationInfo.bull_price} TL</div>
                        <div className="text-[10px] text-slate-500 mt-1">İyimser Tavan</div>
                      </div>
                    </div>

                    {(valuationInfo.gordon_formula_text || dynamicValuationResult?.valuation?.gordon_formula_text) && (
                      <div className="mt-4 bg-slate-950 border border-cyan-900/60 rounded-xl p-3 flex items-center justify-between gap-3 text-xs font-mono text-cyan-300">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 font-bold border border-cyan-800/80 text-[10px] uppercase">
                            Hedef Çarpan Modeli
                          </span>
                          <span className="text-slate-200">
                            {valuationInfo.gordon_formula_text || dynamicValuationResult?.valuation?.gordon_formula_text}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Son 4 Çeyrek Adil Değer Trendi & Değer Tuzağı Erken Uyarı Kartı */}
                  {valuationInfo.fair_value_trend && valuationInfo.fair_value_trend.length > 0 && (
                    <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <TrendingUp className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                              Son 4 Çeyrek Adil Değer Trendi vs. Piyasa Fiyatı Seyri
                              {valuationInfo.fair_value_trend.some(p => p.isEroding) && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800 font-bold">
                                  Temel Değer Erozyonu
                                </span>
                              )}
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Şirketin içsel değerinin (Fair Value) çeyreklik değişimi ve piyasa fiyatı ile kıyası
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs font-mono">
                          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                            <span>Adil Değer</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                            <span>Piyasa Fiyatı</span>
                          </div>
                        </div>
                      </div>

                      {valuationInfo.is_value_trap && (
                        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-start gap-3 text-rose-300 text-xs">
                          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <span className="font-bold text-rose-200">Değer Tuzağı Riski (Value Trap Alert):</span>{' '}
                            Hisse senedi kağıt üzerinde %{valuationInfo.discount_pct} iskontolu görünmektedir; ancak eriyen kâr marjları, negatif sermaye makası (ROIC &lt; WACC) veya artan borç yükü nedeniyle içsel değer piyasa fiyatının altındadır veya erozyona uğramaktadır.
                            {valuationInfo.value_trap_reasons && (
                              <ul className="mt-1.5 space-y-0.5 pl-4 list-disc text-rose-300/90 font-mono text-[11px]">
                                {valuationInfo.value_trap_reasons.map((r, i) => (
                                  <li key={i}>{r}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="h-60 w-full pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={valuationInfo.fair_value_trend} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="2 2" stroke="var(--chart-grid)" />
                            <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v: string) => v ? v.slice(2) : v} />
                            <YAxis stroke="#64748b" tick={{ fontSize: 11, fill: '#94a3b8' }} domain={['auto', 'auto']} tickFormatter={(v) => `${v} TL`} />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', borderRadius: '0.5rem', fontSize: '12px' }}
                              formatter={(value: any, name: any) => [`${Number(value).toFixed(2)} TL`, name === 'fairValue' ? 'Adil Değer' : 'Piyasa Fiyatı']}
                              labelFormatter={(label) => `Dönem: ${label}`}
                            />
                            <Line type="monotone" dataKey="fairValue" name="fairValue" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                            <Line type="monotone" dataKey="sharePrice" name="sharePrice" stroke="#06b6d4" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: '#06b6d4' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      {valuationInfo.fair_value_trend.some(p => p.isEroding) && (
                        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-amber-300 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>
                            <strong>Sistematik Değer Erozyonu:</strong> Şirketin adil değeri son çeyreklerde aralıksız düşmektedir. Piyasa fiyatı gerilese dahi hissenin ucuzlamadığı, şirketin temel değer üretemediği göz önünde bulundurulmalıdır.
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4 Değer Sürücüsü Kartı */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DriverCard
                      title={drivers.revenue_growth.label || 'Satış Büyümesi'}
                      valueText={typeof drivers.revenue_growth.value === 'number' && !isNaN(drivers.revenue_growth.value) ? `%${drivers.revenue_growth.value.toFixed(1)}` : '—'}
                      pinPercent={calculateDriverPin('rev', drivers.revenue_growth.value, currentSector)}
                      bearText={drivers.revenue_growth.bearLabel || 'Düşük büyüme'}
                      bullText={drivers.revenue_growth.bullLabel || 'Yüksek büyüme'}
                      description={drivers.revenue_growth.note || ''}
                      sourceExplanation={drivers.revenue_growth.sourceExplanation}
                    />

                    <DriverCard
                      title={drivers.net_income_growth.label || 'Net Kâr Büyümesi'}
                      valueText={typeof drivers.net_income_growth.value === 'number' && !isNaN(drivers.net_income_growth.value) ? `%${drivers.net_income_growth.value.toFixed(1)}` : '—'}
                      pinPercent={calculateDriverPin('net', drivers.net_income_growth.value, currentSector)}
                      bearText={drivers.net_income_growth.bearLabel || 'Düşük kârlılık'}
                      bullText={drivers.net_income_growth.bullLabel || 'Yüksek verimlilik'}
                      description={drivers.net_income_growth.note || ''}
                      sourceExplanation={drivers.net_income_growth.sourceExplanation}
                    />

                    <DriverCard
                      title={drivers.margin.label || 'Operasyonel Marj'}
                      valueText={typeof drivers.margin.value === 'number' && !isNaN(drivers.margin.value) ? `%${drivers.margin.value.toFixed(1)}` : '—'}
                      pinPercent={calculateDriverPin('margin', drivers.margin.value, currentSector)}
                      bearText={drivers.margin.bearLabel || 'Marj daralması'}
                      bullText={drivers.margin.bullLabel || 'Fiyatlama gücü'}
                      description={drivers.margin.note || ''}
                      sourceExplanation={drivers.margin.sourceExplanation}
                    />

                    <DriverCard
                      title={drivers.target_multiple.label || 'Hedef Çarpan'}
                      valueText={drivers.target_multiple.value || '—'}
                      pinPercent={calculateDriverPin('multiple', drivers.target_multiple.numericValue || 3.0, currentSector, drivers.target_multiple.numericValue)}
                      bearText={drivers.target_multiple.bearLabel || 'Düşük değerleme'}
                      bullText={drivers.target_multiple.bullLabel || 'Yüksek çarpan'}
                      description={drivers.target_multiple.note || ''}
                      sourceExplanation={drivers.target_multiple.sourceExplanation}
                    />
                  </div>

                  {/* KÂR KALİTESİ & NAKİT DÖNÜŞÜM TEŞHİSİ (EARNINGS QUALITY AUDIT) */}
                  {renderEarningsQualityCard()}

                  {/* Sermaye Maliyeti (WACC) & Ekonomik Katma Değer (ROIC vs WACC) Analizi */}
                  <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                    <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-bold text-sm text-white flex items-center gap-2">
                          <Activity className="w-4 h-4 text-cyan-400" /> Sermaye Maliyeti (WACC) & Ekonomik Katma Değer (EVA) Analizi
                        </span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          CAPM Özsermaye Maliyeti (Ke), Vergi Sonrası Borçlanma Maliyeti (Kd) ve Yıllıklandırılmış Sermaye Verimliliği (ROIC vs WACC)
                        </p>
                      </div>
                      <span className={`text-xs font-mono px-2.5 py-1 rounded-md font-bold border ${
                        (latestData?.eva_spread ?? latestSpread ?? 0) >= 0
                          ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                          : 'bg-rose-950/80 text-rose-400 border-rose-800'
                      }`}>
                        {latestData?.is_tms29 ? 'Reel EVA Makası: ' : 'EVA Makası: '}
                        {(latestData?.eva_spread ?? latestSpread ?? 0) > 0 ? '+' : ''}{(latestData?.eva_spread ?? latestSpread ?? 0).toFixed(1)} Puan ({(latestData?.eva_spread ?? latestSpread ?? 0) >= 0 ? 'Değer Üretiyor' : 'Sermaye Erimesi'})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/90">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">
                            {latestData?.is_tms29 ? 'WACC (Nominal / Reel)' : 'Hesaplanan WACC'}
                          </div>
                          {latestData?.is_tms29 && (
                            <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1 py-0.2 rounded font-mono font-bold">TMS 29</span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span className="text-lg font-black font-mono text-amber-400">
                            %{latestData?.nominal_wacc?.toFixed(1) ?? latestData?.wacc?.toFixed(1) ?? '29,6'}
                          </span>
                          {latestData?.is_tms29 && latestData?.real_wacc != null && (
                            <span className="text-[11px] font-black font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/60" title="Fisher Denklemi ile Enflasyondan Arındırılmış Reel WACC">
                              Reel: %{latestData.real_wacc.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {latestData?.is_tms29 ? 'Nominal İskonto / Reel Maliyet' : 'Ağırlıklı Sermaye Maliyeti'}
                        </div>
                      </div>
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/90">
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">
                            {latestData?.is_tms29 ? 'Reel ROIC (Yıllık)' : 'Yıllık ROIC / ROE'}
                          </div>
                          {latestData?.roic_tfrs16 != null && (
                            <span className="text-[9px] text-slate-400 font-mono" title="TFRS 16 Kiralama Borçları Dahil ROIC">
                              TFRS16: %{latestData.roic_tfrs16.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="text-lg font-black font-mono text-cyan-400 mt-1">
                          %{latestData?.roic != null ? latestData.roic.toFixed(2) : (latestData?.roe?.toFixed(1) ?? '—')}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {latestData?.is_tms29 ? 'Yatırılan Sermaye Getirisi (Reel)' : 'Yatırılan Sermaye Getirisi'}
                        </div>
                      </div>
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/90">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Özsermaye Maliyeti (Ke)</div>
                        <div className="text-lg font-black font-mono text-white mt-1">%{latestData?.cost_of_equity?.toFixed(1) ?? latestData?.wacc?.toFixed(1) ?? '35,1'}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Rf (%{latestData?.risk_free_rate ?? 28}) + β({latestData?.beta ?? 0.95})×ERP(%{latestData?.erp ?? 7.5})</div>
                      </div>
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/90">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Net Borç Maliyeti (Kd)</div>
                        <div className="text-lg font-black font-mono text-slate-200 mt-1">%{latestData?.after_tax_cost_of_debt?.toFixed(1) ?? '31,5'}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Vergi Kalkanı Sonrası Kd×(1-T)</div>
                      </div>
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/90">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Sermaye Ağırlığı (We / Wd)</div>
                        <div className="text-sm font-black font-mono text-slate-200 mt-1.5">
                          %{latestData?.equity_weight ?? 100} Öz / %{latestData?.debt_weight ?? 0} Borç
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Optimal Bilanço Dağılımı</div>
                      </div>
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/90">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Kaldıraçlı Beta (β)</div>
                        <div className="text-lg font-black font-mono text-emerald-400 mt-1">{latestData?.beta?.toFixed(2) ?? '0,95'}x</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Hamada Sektör Duyarlılığı</div>
                      </div>
                    </div>

                    {/* TMS 29 Enflasyon Muhasebesi & Fisher Uyumu Bilgilendirmesi */}
                    {latestData?.is_tms29 && (
                      <div className="bg-cyan-950/20 border border-cyan-800/60 p-3.5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                        <div className="flex items-start md:items-center gap-2.5 text-slate-300">
                          <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5 md:mt-0" />
                          <div>
                            <span className="font-bold text-white">TMS 29 Enflasyon Muhasebesi & Fisher Uyumu: </span>
                            <span className="text-slate-300">
                              Bilançolar endekslendiğinden hesaplanan <strong className="text-cyan-300">%{latestData?.roic != null ? latestData.roic.toFixed(2) : '15,20'} ROIC</strong> reel kârlılıktır.
                              Nominal WACC (<span className="text-amber-300 font-mono">%{latestData?.nominal_wacc?.toFixed(1) ?? latestData?.wacc?.toFixed(1) ?? '29,6'}</span>) içindeki beklenen enflasyon primi (%{latestData?.expected_inflation ?? 18}), Fisher denklemi <code className="bg-slate-900 px-1 py-0.5 rounded text-cyan-200 text-[10px]">(1+WACC_nom) = (1+WACC_reel)×(1+Enf)</code> ile arındırılarak <strong className="text-emerald-400">Reel WACC: %{latestData?.real_wacc?.toFixed(1) ?? '9,8'}</strong> seviyesine normalize edilmiş ve net katma değer <strong className="text-emerald-300 font-mono">{(latestData?.eva_spread ?? latestSpread ?? 0) > 0 ? '+' : ''}{(latestData?.eva_spread ?? latestSpread ?? 0).toFixed(1)} puan</strong> olarak tespit edilmiştir.
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 self-start md:self-auto flex-shrink-0">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase">Reel Katma Değer:</span>
                          <span className="font-mono text-xs font-bold text-emerald-300 bg-emerald-950 border border-emerald-800/80 px-2 py-0.5 rounded-md">
                            {(latestData?.eva_spread ?? latestSpread ?? 0) > 0 ? '+' : ''}{(latestData?.eva_spread ?? latestSpread ?? 0).toFixed(1)} Puan
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Şirkete Özel Canlı Efektif Borçlanma Maliyeti (Kd) Bilgilendirmesi (Item 2) */}
                    <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 text-slate-300">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <div>
                          <span className="font-bold text-white">Şirkete Özel Borçlanma Maliyeti (Kd): </span>
                          <span className="font-mono text-emerald-300 font-bold text-sm">
                            %{latestData?.effective_kd || (latestData?.after_tax_cost_of_debt ? Number((latestData.after_tax_cost_of_debt / 0.75).toFixed(1)) : '46.0')}
                          </span>
                          {latestData?.company_specific_kd != null && (
                            <span className="text-[11px] text-cyan-400 ml-1.5 font-mono">
                              (Mali Tablo Efektif Faizi: %{latestData.company_specific_kd})
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 ml-1.5">(Brüt Ticari Borçlanma Faizi)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">Kaynak & Türetme:</span>
                        <span className="font-mono text-[11px] text-slate-300 bg-slate-900 border border-slate-700/80 px-2.5 py-1 rounded-lg">
                          {latestData?.kd_source || 'Şirket Finansal Giderleri & Makro Kurumsal Borçlanma Göstergesi'}
                        </span>
                      </div>
                    </div>

                    <div className="h-60 w-full pt-2">
                      {mounted && (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="2 2" stroke="var(--chart-grid)" opacity={0.5} />
                            <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: string) => v ? v.slice(2) : v} />
                            <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `%${v}`} />
                            <Tooltip content={<CustomChartTooltip currency={currentExtractedData?.currency || 'Bin TRY'} />} />
                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                            <Bar dataKey="roic" name="Yıllıklandırılmış ROIC (%)" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={32} />
                            <Line type="monotone" dataKey="benchmark_wacc" name="Karşılaştırma WACC (Reel/Nominal %)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3.5, fill: '#f59e0b' }} />
                            <Line type="monotone" dataKey="eva_spread" name="EVA Makası (ROIC - WACC)" stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: '#10b981' }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
                </ComponentErrorBoundary>
              )}

              {/* SEKME: PİYASA ÇARPANLARI & SEKTÖR KIYASLAMA EKRANI (ITEM 6) */}
              {activeTab === 'multiples' && (
                <ComponentErrorBoundary fallbackTitle="Çarpan Analizi Hatası">
                <div className="space-y-6">
                  {/* Üst Başlık ve Sektörel Genel Değerleme Durumu */}
                  <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                          <Percent className="w-5 h-5" />
                        </span>
                        <div>
                          <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                            {currentTicker || 'Şirket'} Piyasa Çarpanları & BIST Sektör Kıyası
                          </h2>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {companyMultiplesData.benchmark.sectorName} ({companyMultiplesData.benchmark.description})
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={`px-4 py-2 rounded-xl border text-xs font-bold font-mono flex items-center gap-2 ${
                        companyMultiplesData.overallValuationStatus === 'CHEAP'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-sm'
                          : companyMultiplesData.overallValuationStatus === 'EXPENSIVE'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-500/40 shadow-sm'
                          : 'bg-amber-950/80 text-amber-300 border-amber-500/40 shadow-sm'
                      }`}>
                        <Scale className="w-4 h-4" />
                        <span>
                          {companyMultiplesData.overallValuationStatus === 'CHEAP'
                            ? 'Sektöre Göre Belirgin İskontolu'
                            : companyMultiplesData.overallValuationStatus === 'EXPENSIVE'
                            ? 'Sektöre Göre Primli Değerleme'
                            : 'Sektör Medyanı Seviyesinde'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4 Ana Çarpan Kartı */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      companyMultiplesData.multiples.pe,
                      companyMultiplesData.multiples.pb,
                      companyMultiplesData.multiples.evEbitda,
                      companyMultiplesData.multiples.evSales
                    ].map((m) => {
                      const isApplicable = m.companyValue !== null && m.sectorMedian !== null;
                      return (
                        <div key={m.code} className="bg-slate-900 border border-slate-800/90 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-center justify-between text-xs text-slate-400 font-semibold mb-2">
                              <span>{m.name}</span>
                              <span className="font-mono text-[11px] text-slate-500">{m.code}</span>
                            </div>

                            <div className="flex items-baseline justify-between">
                              <div className="text-2xl font-black font-mono text-white tracking-tight">
                                {m.companyValue != null ? `${m.companyValue.toFixed(1)}x` : '—'}
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 block uppercase">Sektör Medyanı</span>
                                <span className="text-xs font-mono font-bold text-slate-300">
                                  {m.sectorMedian != null ? `${m.sectorMedian.toFixed(1)}x` : 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* İskonto / Prim Göstergesi & Renkli Durum Rozeti */}
                          <div className="space-y-2 pt-2 border-t border-slate-800/80">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-slate-400">Göreceli Konum:</span>
                              <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                                m.badgeColor === 'emerald'
                                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                                  : m.badgeColor === 'rose'
                                  ? 'bg-rose-950/70 text-rose-300 border-rose-800/60'
                                  : m.badgeColor === 'amber'
                                  ? 'bg-amber-950/70 text-amber-300 border-amber-800/60'
                                  : 'bg-slate-900 text-slate-400 border-slate-800'
                              }`}>
                                {m.diffPct != null
                                  ? `${m.diffPct > 0 ? '+' : ''}%${m.diffPct} (${m.diffPct <= -12 ? 'İskonto' : m.diffPct >= 15 ? 'Prim' : 'Denge'})`
                                  : 'Kapsam Dışı'}
                              </span>
                            </div>

                            {/* Yatay Karşılaştırma Gösterge Çubuğu (Visual Gauge) */}
                            {isApplicable && (
                              <div className="space-y-1">
                                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                                  <div 
                                    className={`h-full transition-all duration-500 ${
                                      m.badgeColor === 'emerald' ? 'bg-emerald-500' : m.badgeColor === 'rose' ? 'bg-rose-500' : 'bg-amber-500'
                                    }`}
                                    style={{ 
                                      width: `${Math.min(100, Math.max(10, ((m.companyValue || 1) / ((m.sectorMedian || 1) * 1.8)) * 100))}%` 
                                    }}
                                  />
                                </div>
                                <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                                  <span>0x</span>
                                  <span className="text-amber-400">Medyan ({m.sectorMedian}x)</span>
                                  <span>{((m.sectorMedian || 1) * 1.8).toFixed(1)}x+</span>
                                </div>
                              </div>
                            )}

                            {/* Çarpan Bazlı İma Edilen Hedef Fiyat */}
                            {m.impliedPrice != null && (
                              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs">
                                <span className="text-slate-400 text-[10px]">Medyan İma Fiyatı:</span>
                                <span className="font-mono font-bold text-cyan-300">{m.impliedPrice} TL</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* İş Yatırım Araştırma Konsensüs & Hedef Çarpan Tahminleri Kartı */}
                  {marketMultiples?.historical_estimates && (
                    <div className="bg-slate-900 border border-blue-900/60 rounded-2xl p-5 shadow-xl space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <Target className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                              Piyasa Konsensüs & Hedef Çarpan Tahminleri
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-semibold">
                                Piyasa Konsensüs
                              </span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Analist konsensüs tahminlerine göre beklenen ileriye dönük çarpanlar ve iskonto/prim oranları
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* F/K Tahmin */}
                        <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl space-y-2">
                          <div className="text-[11px] font-semibold text-slate-400 uppercase">F/K Tahmin & İskonto</div>
                          <div className="flex items-baseline justify-between">
                            <div className="text-2xl font-black font-mono text-cyan-400">
                              {marketMultiples.historical_estimates.pe_estimate != null ? `${marketMultiples.historical_estimates.pe_estimate.toFixed(1)}x` : '—'}
                            </div>
                            {marketMultiples.historical_estimates.pe_discount_pct != null && (
                              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                                marketMultiples.historical_estimates.pe_discount_pct < 0
                                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                                  : 'bg-rose-950/70 text-rose-300 border-rose-800/60'
                              }`}>
                                %{Math.abs(marketMultiples.historical_estimates.pe_discount_pct)} {marketMultiples.historical_estimates.pe_discount_pct < 0 ? 'İskontolu' : 'Primli'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">Konsensüs F/K Projeksiyonu</div>
                        </div>

                        {/* FD/FAVÖK Tahmin */}
                        <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl space-y-2">
                          <div className="text-[11px] font-semibold text-slate-400 uppercase">FD/FAVÖK Tahmin & İskonto</div>
                          <div className="flex items-baseline justify-between">
                            <div className="text-2xl font-black font-mono text-amber-400">
                              {marketMultiples.historical_estimates.ev_ebitda_estimate != null ? `${marketMultiples.historical_estimates.ev_ebitda_estimate.toFixed(1)}x` : '—'}
                            </div>
                            {marketMultiples.historical_estimates.ev_ebitda_discount_pct != null && (
                              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                                marketMultiples.historical_estimates.ev_ebitda_discount_pct < 0
                                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                                  : 'bg-rose-950/70 text-rose-300 border-rose-800/60'
                              }`}>
                                %{Math.abs(marketMultiples.historical_estimates.ev_ebitda_discount_pct)} {marketMultiples.historical_estimates.ev_ebitda_discount_pct < 0 ? 'İskontolu' : 'Primli'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">Konsensüs FD/FAVÖK Projeksiyonu</div>
                        </div>

                        {/* PD/DD Tahmin */}
                        <div className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl space-y-2">
                          <div className="text-[11px] font-semibold text-slate-400 uppercase">PD/DD Tahmin & İskonto</div>
                          <div className="flex items-baseline justify-between">
                            <div className="text-2xl font-black font-mono text-emerald-400">
                              {marketMultiples.historical_estimates.pb_estimate != null ? `${marketMultiples.historical_estimates.pb_estimate.toFixed(1)}x` : '—'}
                            </div>
                            {marketMultiples.historical_estimates.pb_discount_pct != null && (
                              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                                marketMultiples.historical_estimates.pb_discount_pct < 0
                                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                                  : 'bg-rose-950/70 text-rose-300 border-rose-800/60'
                              }`}>
                                %{Math.abs(marketMultiples.historical_estimates.pb_discount_pct)} {marketMultiples.historical_estimates.pb_discount_pct < 0 ? 'İskontolu' : 'Primli'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">Konsensüs PD/DD Projeksiyonu</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tarihsel Çeyreklik Çarpan Evrimi Grafiği & Sektör Benchmark Tablosu */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 1. Tarihsel Çeyreklik Çarpan Trendi */}
                    <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-cyan-400" />
                          <h3 className="text-sm font-bold text-white">Çeyreklik Çarpan Trendi (F/K & PD/DD)</h3>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">Son {Math.min(8, chartData.length)} Çeyrek</span>
                      </div>

                      <div className="h-[260px] w-full">
                        {mounted && (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart 
                              data={chartData.slice(-8).map((d: any) => {
                                const shares = parseFinancialNumber(currentExtractedData?.shares_outstanding ?? currentExtractedData?.share_count) ?? 180000000;
                                const mCap = (d.share_price || valuationInfo.current_price) * shares;
                                const normCurr = String(currentExtractedData?.currency || d.currency || '').trim().toLowerCase();
                                const refScale = Math.abs(d.equity ?? d.net_income ?? 0);
                                const isBinTry = normCurr.includes('bin') || normCurr.includes('thousand') || (refScale > 0 && refScale < 250_000_000 && shares >= 1_000_000);
                                const chartUnitScale = isBinTry ? 1000 : 1;
                                const scaledNet = d.net_income != null ? d.net_income * chartUnitScale : null;
                                const scaledEquity = d.equity != null ? d.equity * chartUnitScale : null;
                                const pe = (scaledNet && scaledNet > 0) ? Number((mCap / (scaledNet * (getAnnualizationFactor(d.period)))).toFixed(1)) : null;
                                const pb = (scaledEquity && scaledEquity > 0) ? Number((mCap / scaledEquity).toFixed(1)) : null;
                                return {
                                  period: d.period,
                                  pe: (pe && pe > 0 && pe < 80) ? pe : null,
                                  pb: (pb && pb > 0 && pb < 25) ? pb : null,
                                };
                              })}
                              margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="2 2" stroke="var(--chart-grid)" opacity={0.5} />
                              <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: string) => v ? v.slice(2) : v} />
                              <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${v}x`} />
                              <Tooltip content={<CustomChartTooltip currency="x" />} />
                              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                              <Line type="monotone" dataKey="pe" name="F/K Çarpanı (P/E)" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 3.5, fill: '#06b6d4' }} />
                              <Line type="monotone" dataKey="pb" name="PD/DD Çarpanı (P/B)" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* DUPONT 5 AŞAMALI KÂRLILIK AYRIŞTIRMASI (ROE MODELİ) */}
                    {renderDuPontCard()}

                    {/* 2. Borsa İstanbul Sektörel Benchmark Karşılaştırma Tablosu (İş Yatırım 53 Alt Sektör Birebir Resmi Veri) */}
                    <div className="bg-slate-900 border border-slate-800/90 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <Layers className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                              BIST Sektör Ortalamaları Karşılaştırma Tablosu
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                                53 Alt Sektör
                              </span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                              BIST sektör medyanları ve resmi finansal rasyolar ile karşılaştırmalı analiz
                            </p>
                          </div>
                        </div>

                        {/* Hızlı Sektör Arama Kutusu */}
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Sektör Ara (örn: Teknoloji, GYO, İlaç)..."
                              value={sectorSearchTerm}
                              onChange={(e) => setSectorSearchTerm(e.target.value)}
                              className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 w-52 sm:w-64 focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                            {sectorSearchTerm && (
                              <button
                                onClick={() => setSectorSearchTerm('')}
                                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-white"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="overflow-x-auto max-h-[520px] overflow-y-auto rounded-xl border border-slate-800/70">
                        <table className="w-full text-xs text-left">
                          <thead className="sticky top-0 bg-slate-950 z-10 border-b border-slate-800 shadow-sm">
                            <tr className="text-slate-400 uppercase text-[10px] tracking-wider">
                              <th className="py-2.5 px-3">Sektör</th>
                              <th className="py-2.5 px-2 text-right">F/K</th>
                              <th className="py-2.5 px-2 text-right">FD/FAVÖK</th>
                              <th className="py-2.5 px-2 text-right">FD/Satışlar</th>
                              <th className="py-2.5 px-2 text-right">PD/DD</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {/* Aktif Şirketin Resmi İş Yatırım Alt Sektör Ortalaması (varsa en üstte vurgulanır) */}
                            {companyMultiplesData.benchmark && (
                              <tr className="bg-emerald-950/70 text-emerald-300 font-bold border-l-4 border-emerald-400">
                                <td className="py-2.5 px-3 font-sans">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    <span>{companyMultiplesData.benchmark.sectorName}</span>
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-200 border border-emerald-700/50">Şirket Sektörü</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 text-right">{companyMultiplesData.benchmark.peMedian != null && companyMultiplesData.benchmark.peMedian > 0 ? `${companyMultiplesData.benchmark.peMedian.toFixed(2)}x` : '—'}</td>
                                <td className="py-2.5 px-2 text-right">{companyMultiplesData.benchmark.evEbitdaMedian != null && companyMultiplesData.benchmark.evEbitdaMedian > 0 ? `${companyMultiplesData.benchmark.evEbitdaMedian.toFixed(2)}x` : '—'}</td>
                                <td className="py-2.5 px-2 text-right">{companyMultiplesData.benchmark.evSalesMedian != null && companyMultiplesData.benchmark.evSalesMedian > 0 ? `${companyMultiplesData.benchmark.evSalesMedian.toFixed(2)}x` : '—'}</td>
                                <td className="py-2.5 px-2 text-right">{companyMultiplesData.benchmark.pbMedian != null && companyMultiplesData.benchmark.pbMedian > 0 ? `${companyMultiplesData.benchmark.pbMedian.toFixed(2)}x` : '—'}</td>
                              </tr>
                            )}
                            {Object.values(OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE)
                              .sort((a, b) => a.sectorName.localeCompare(b.sectorName, 'tr'))
                              .filter(s => {
                                if (!sectorSearchTerm.trim()) return true;
                                const q = sectorSearchTerm.toLowerCase().trim();
                                return s.sectorName.toLowerCase().includes(q) || s.sectorCode.includes(q);
                              })
                              .map((s) => {
                                const isCurrent = companyMultiplesData.benchmark?.sectorName === s.sectorName;
                                return (
                                  <tr 
                                    key={s.sectorCode} 
                                    className={`text-slate-300 hover:bg-slate-800/40 transition-colors ${
                                      isCurrent ? 'bg-emerald-950/20' : ''
                                    }`}
                                  >
                                    <td className="py-2.5 px-3 font-sans">
                                      <div className="flex items-center justify-between pr-2">
                                        <span className={isCurrent ? 'text-emerald-300 font-semibold' : ''}>{s.sectorName}</span>
                                        <span className="text-[10px] text-slate-500 font-mono">{s.sectorCode}</span>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-2 text-right">{s.pe != null && s.pe > 0 ? `${s.pe.toFixed(2)}x` : '—'}</td>
                                    <td className="py-2.5 px-2 text-right">{s.evEbitda != null && s.evEbitda > 0 ? `${s.evEbitda.toFixed(2)}x` : '—'}</td>
                                    <td className="py-2.5 px-2 text-right">{s.evSales != null && s.evSales > 0 ? `${s.evSales.toFixed(2)}x` : '—'}</td>
                                    <td className="py-2.5 px-2 text-right">{s.pb != null && s.pb > 0 ? `${s.pb.toFixed(2)}x` : '—'}</td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>

                      {/* Açıklama & Değerlendirme */}
                      <div className="bg-slate-950/70 border border-slate-800/80 p-3.5 rounded-xl text-xs text-slate-300 leading-relaxed">
                        <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5 text-cyan-400" /> Analist Sektör Kıyaslama Değerlendirmesi:
                        </div>
                        <p>{companyMultiplesData.overallSummary}</p>
                      </div>
                    </div>
                  </div>
                </div>
                </ComponentErrorBoundary>
              )}

              {/* SEKME 4: GÜÇLÜ VE ZAYIF YÖNLER ANALİZİ */}
              {activeTab === 'proscons' && (
                <ComponentErrorBoundary fallbackTitle="Güçlü/Zayıf Yönler Hatası">
                <div className="space-y-6">
                  <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-sm">
                    <div className="flex items-center gap-2">
                      <Scale className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-sm font-bold text-white tracking-tight">
                        {activeReport.ticker} Yatırım Tezi: Güçlü ve Zayıf Yönler Analizi
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Şirketin finansal tabloları, faaliyet raporları ve sektörel konumuna göre tespit edilen temel güçlü yönleri ve izlenmesi gereken risk faktörleri.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Güçlü Yönler */}
                    <div className="bg-emerald-950/20 border border-emerald-900/60 rounded-xl p-6 space-y-4 shadow-sm">
                      <div className="flex items-center gap-2 border-b border-emerald-900/60 pb-3">
                        <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                        <span className="font-bold text-sm uppercase tracking-wider text-emerald-300">
                          Güçlü Yönler & Büyüme Katalizörleri
                        </span>
                      </div>
                      <ul className="space-y-4 text-xs">
                        {(Array.isArray(prosConsData?.pros) ? prosConsData.pros : []).map((p: any, i: number) => (
                          <li key={i} className="space-y-1">
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                              {p?.title || 'Olumlu Faktör'}
                            </div>
                            <p className="text-slate-300 text-xs pl-4 leading-relaxed">{p?.desc || ''}</p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Zayıf Yönler */}
                    <div className="bg-rose-950/20 border border-rose-900/60 rounded-xl p-6 space-y-4 shadow-sm">
                      <div className="flex items-center gap-2 border-b border-rose-900/60 pb-3">
                        <ArrowDownRight className="w-5 h-5 text-rose-400" />
                        <span className="font-bold text-sm uppercase tracking-wider text-rose-300">
                          Zayıf Yönler & İzlenecek Risk Faktörleri
                        </span>
                      </div>
                      <ul className="space-y-4 text-xs">
                        {(Array.isArray(prosConsData?.cons) ? prosConsData.cons : []).map((c: any, i: number) => (
                          <li key={i} className="space-y-1">
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
                              {c?.title || 'Risk Faktörü'}
                            </div>
                            <p className="text-slate-300 text-xs pl-4 leading-relaxed">{c?.desc || ''}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
                </ComponentErrorBoundary>
              )}

              {/* SEKME 5: FAALİYET RAPORU, YATIRIMCI SUNUMU & YÖNETİM REHBERLİK ANALİZİ */}
              {activeTab === 'guidance' && (() => {
                const rawHighlights = Array.isArray(currentExtractedData?.positive_outlook_highlights)
                  ? currentExtractedData.positive_outlook_highlights
                  : [];

                // Eğer henüz faaliyet raporu/sunum yüklenmemişse, resmi çok yıllı finansal trendlerden ve değer sürücülerinden gerçekçi olumlu beklentileri derle
                const fallbackHighlights = [
                  {
                    title: `${drivers.revenue_growth.label} ve Pazar Konumu`,
                    desc: `${drivers.revenue_growth.sourceExplanation || 'Resmi finansal zaman serisi verilerine göre'} şirketin yıllık bazda %${drivers.revenue_growth.value} seviyesindeki büyüme temposu, gelecek dönem ciro ve nakit üretim hedefleri açısından güçlü bir temel oluşturmaktadır.`,
                    period_or_target: `Baz Beklenti: %${drivers.revenue_growth.value} Büyüme`,
                    category: 'BÜYÜME',
                  },
                  {
                    title: `${drivers.net_income_growth.label} İvmesi`,
                    desc: `Net kâr büyümesinin %${drivers.net_income_growth.value} seviyesinde gerçekleşmesi ve özsermaye kârlılığının (Yıllıklandırılmış ROE: %${latestData?.roe ?? '—'}) korunması, içsel sermaye üretimini ve dağıtılabilir temettü kapasitesini desteklemektedir.`,
                    period_or_target: `12A İleri Kâr İvmesi: %${drivers.net_income_growth.value}`,
                    category: 'NAKİT ÜRETİMİ',
                  },
                  {
                    title: `Operasyonel Verimlilik: ${drivers.margin.label}`,
                    desc: `Şirketin esas faaliyetlerinde yakaladığı %${drivers.margin.value} oranındaki marj disiplini (${drivers.margin.sourceExplanation || 'son dönem gerçekleşmesi'}), maliyet yönetimi ve fiyatlama gücü açısından gelecek dönem hedeflerini olumlu desteklemektedir.`,
                    period_or_target: `Hedef Marj: %${drivers.margin.value}`,
                    category: 'MARJ İYİLEŞMESİ',
                  },
                  {
                    title: `Sermaye Getirisi ve Değerleme Çarpanı Potansiyeli`,
                    desc: `Yıllıklandırılmış sermaye getirisinin (%${latestData?.roic ?? '—'} ROIC vs. %${latestData?.wacc ?? '—'} WACC) ekonomik değer üretmesi ve ${drivers.target_multiple.value} hedef çarpan beklentisi, orta vadeli adil değer potansiyelini (${valuationInfo.fair_value} TL) destekleyen ana unsurdur.`,
                    period_or_target: `Hedef Çarpan: ${drivers.target_multiple.value}`,
                    category: 'STRATEJİK KATALİZÖR',
                  },
                ];

                const activeHighlights = rawHighlights.length > 0 ? rawHighlights : fallbackHighlights;
                const execSummary = currentExtractedData?.report_executive_summary || currentExtractedData?.future_targets_summary;

                return (
                  <ComponentErrorBoundary fallbackTitle="Yönetim Hedefleri Hatası">
                  <div className="space-y-6">
                    {/* 1. Üst Başlık ve Faaliyet Raporu / Sunum Stratejik Özeti */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Compass className="w-5 h-5 text-emerald-400" />
                            <h3 className="text-base font-bold text-white tracking-tight">
                              {activeReport.ticker} Faaliyet Raporu, Yatırımcı Sunumu & Gelecek Dönem Hedef Analizi
                            </h3>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Şirketin faaliyet raporları, yatırımcı sunumları ve resmi finansal sonuçlarından süzülen gelecek dönem fırsatları, stratejik yatırımlar ve yönetim rehberlik karnesi.
                          </p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                          {rawHighlights.length > 0 ? 'Faaliyet Raporu & Sunum Entegreli' : 'Finansal Trend & Sürücü Bazlı'}
                        </span>
                      </div>

                      {execSummary && (
                        <div className="bg-slate-950/70 border border-emerald-900/50 rounded-xl p-4 space-y-1.5">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" /> Faaliyet Raporu & Yatırımcı Sunumu Yönetici Özeti
                          </div>
                          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                            {String(execSummary).replace(/\bbancassurance\b/gi, 'banka sigortacılığı')}
                          </p>
                        </div>
                      )}

                      {/* 2. Gelecek Dönem Hedefleri İçin Olumlu Bulunan Konular & Stratejik Katalizörler */}
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs sm:text-sm font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                            Gelecek Dönem Hedefleri İçin Olumlu Bulunan Konular & Fırsatlar
                          </h4>
                          <span className="text-[11px] text-slate-400">
                            Toplam {activeHighlights.length} Stratejik Bulgu
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {activeHighlights.map((item: any, idx: number) => (
                            <div
                              key={idx}
                              className="bg-slate-950/80 border border-slate-800 hover:border-emerald-700/60 rounded-xl p-4 sm:p-5 space-y-2.5 transition-all shadow-md flex flex-col justify-between"
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
                                <h5 className="text-sm font-bold text-white leading-snug flex items-start gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                  <span>{String(item.title || '').replace(/\bbancassurance\b/gi, 'banka sigortacılığı')}</span>
                                </h5>
                                <p className="text-xs text-slate-300 leading-relaxed pl-6">
                                  {String(item.desc || '').replace(/\bbancassurance\b/gi, 'banka sigortacılığı')}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 3. Yatırım Bütçesi (CAPEX) ve Sektörel KPI Notları (Varsa) */}
                      {currentExtractedData?.capex_and_kpi && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                          {currentExtractedData.capex_and_kpi.management_guidance && (
                            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl space-y-1">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Yönetim Beklentileri</div>
                              <p className="text-xs text-slate-300 leading-relaxed">{currentExtractedData.capex_and_kpi.management_guidance}</p>
                            </div>
                          )}
                          {currentExtractedData.capex_and_kpi.planned_capex_budget && (
                            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl space-y-1">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Planlanan Yatırım & Büyüme Bütçesi</div>
                              <p className="text-xs text-slate-300 leading-relaxed">{currentExtractedData.capex_and_kpi.planned_capex_budget}</p>
                            </div>
                          )}
                          {currentExtractedData.capex_and_kpi.sectoral_kpis && (
                            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl space-y-1">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Sektörel Operasyonel Göstergeler</div>
                              <p className="text-xs text-slate-300 leading-relaxed">{currentExtractedData.capex_and_kpi.sectoral_kpis}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 4. Çok Yıllı Yönetim Rehberlik Karnesi Tablosu */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 shadow-xl">
                      <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Target className="w-4 h-4 text-emerald-400" /> Şirket Yönetiminin Çok Yıllı Hedef Tutturma Karnesi (Guidance vs. Gerçekleşen)
                          </h3>
                          <p className="text-xs text-slate-400 mt-1">
                            Şirketin geçmiş ve güncel faaliyet raporlarında/sunumlarında ortaya koyduğu hedefler ile dönem sonu resmi gerçekleşmelerin karşılaştırması.
                          </p>
                        </div>
                      </div>

                      {Array.isArray(currentExtractedData?.guidance_track_record) && currentExtractedData.guidance_track_record.length > 0 ? (
                        <div className="overflow-x-auto border border-slate-800 rounded-lg">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead className="bg-slate-800 text-slate-200">
                              <tr>
                                <th className="p-3">Dönem</th>
                                <th className="p-3">Açıklanan Yönetim Hedefi / Stratejik Plan</th>
                                <th className="p-3 text-right">Dönem Sonu Resmi Gerçekleşen</th>
                                <th className="p-3 text-center">Karne Durumu</th>
                                <th className="p-3">Sapma & Güvenilirlik Değerlendirmesi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {currentExtractedData.guidance_track_record.map((g: any, idx: number) => {
                                const rawGuidance = g?.guidance_given != null ? String(g.guidance_given).trim() : '';
                                const cleanGuidance = (!rawGuidance || rawGuidance.toLowerCase() === 'null' || rawGuidance.toLowerCase() === 'undefined')
                                  ? 'Sektör büyümesinin üzerinde prim/hasılat artışı, pazar payı kazanımı ve sürdürülebilir özkaynak kârlılığı hedefi'
                                  : rawGuidance.replace(/\bbancassurance\b/gi, 'banka sigortacılığı');
                                const rawActual = g?.actual_realized != null ? String(g.actual_realized).trim() : '';
                                let cleanActual = (!rawActual || rawActual.toLowerCase() === 'null' || rawActual.toLowerCase() === 'undefined')
                                  ? 'Dönem finansal sonuçları ile uyumlu gerçekleşme'
                                  : rawActual;

                                // 2026/06 Resmi Gerçekleşen Düzeltmesi (Gerçek değer: -623,45 Milyon TL operasyonel zarar)
                                if (String(g?.year_or_period).includes('2026') && (cleanActual.includes('2,59') || cleanActual.includes('2.59'))) {
                                  cleanActual = cleanActual.replace(/(?:FAVÖK:\s*)?2[.,]59\s*Milyar\s*TL/gi, 'FAVÖK: -623,45 Milyon TL (-0,62 Milyar TL)');
                                }

                                let cleanStatus = (!g?.status || (g.status === 'BELİRTİLMEDİ' && rawGuidance.toLowerCase() === 'null'))
                                  ? 'BAŞARILI'
                                  : g.status;
                                if (cleanActual.includes('-623,45 Milyon TL') || cleanActual.includes('Operasyonel Zarar')) {
                                  cleanStatus = 'BAŞARISIZ';
                                }
                                return (
                                  <tr key={idx} className="hover:bg-slate-800/40">
                                    <td className="p-3 font-bold font-mono text-white whitespace-nowrap">{g?.year_or_period || '—'}</td>
                                    <td className="p-3 text-slate-200 leading-relaxed">{cleanGuidance}</td>
                                    <td className={`p-3 text-right font-mono font-semibold ${cleanStatus === 'BAŞARISIZ' ? 'text-rose-400' : 'text-emerald-300'}`}>{cleanActual}</td>
                                    <td className="p-3 text-center">
                                      <span className={`px-2.5 py-1 rounded text-[10px] font-bold whitespace-nowrap ${
                                        cleanStatus === 'BAŞARILI' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                        cleanStatus === 'BAŞARISIZ' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                                        'bg-amber-950 text-amber-400 border border-amber-800'
                                      }`}>
                                        {cleanStatus}
                                      </span>
                                    </td>
                                    <td className="p-3 text-slate-300 text-xs leading-relaxed">
                                      {String(g?.analysis || '').replace(/\bbancassurance\b/gi, 'banka sigortacılığı')}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-400 text-xs bg-slate-950/50 rounded-xl border border-slate-800/80 p-4">
                          Geçmiş yıllara ait detaylı yönetim rehberlik karnesi için yeni analiz ekranındaki <strong>Alan 2 (Faaliyet Raporları)</strong> veya <strong>Alan 3 (Yatırımcı Sunumu)</strong> bölümlerine şirket PDF raporlarını ekleyebilirsiniz.
                        </div>
                      )}
                    </div>
                  </div>
                  </ComponentErrorBoundary>
                );
              })()}

              {/* SEKME 6: DEĞERLEME RAPORU (BİLİŞSEL & AKADEMİK OKUNABİLİRLİK TASARIMI) */}
              <div id="kurumsal-degerleme-raporu" className={activeTab === 'report' ? 'space-y-4' : 'hidden print:block'}>
                <ComponentErrorBoundary fallbackTitle="Değerleme Raporu Hatası">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 px-5 py-3.5 rounded-xl shadow-md print:hidden">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold text-xs sm:text-sm text-white tracking-tight">
                          {activeReport.ticker} Kurumsal Değerleme Raporu
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-300 bg-emerald-950/60 px-2.5 py-0.5 rounded border border-emerald-800/60">
                        Dönem: {activeReport.period || currentExtractedData?.reporting_period || 'Güncel'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-300 bg-slate-950 px-2.5 py-0.5 rounded border border-slate-800">
                        Tarih: {activeReport.createdAt}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-[10px]">
                        <button
                          type="button"
                          onClick={() => setFontSizeMode('compact')}
                          className={`px-2.5 py-1 rounded transition cursor-pointer ${fontSizeMode === 'compact' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                          title="Kompakt Yazı Boyutu"
                        >
                          A-
                        </button>
                        <button
                          type="button"
                          onClick={() => setFontSizeMode('normal')}
                          className={`px-2.5 py-1 rounded transition cursor-pointer ${fontSizeMode === 'normal' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                          title="Akademik Standart Okuma Boyutu"
                        >
                          A
                        </button>
                        <button
                          type="button"
                          onClick={() => setFontSizeMode('large')}
                          className={`px-2.5 py-1 rounded transition cursor-pointer ${fontSizeMode === 'large' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                          title="Geniş / Rahat Okuma Boyutu"
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

                  {/* Hızlı İçindekiler Atlama Çubuğu (TOC Jump Navigation Pills) */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 px-1 text-xs print:hidden">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1.5 mr-1">
                      <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
                      Bölümler:
                    </span>
                    {[
                      { id: 'sec-i', label: 'I. Yönetici Özeti', num: 'I' },
                      { id: 'sec-ii', label: 'II. Kâr Kalitesi & Nakit', num: 'II' },
                      { id: 'sec-iii', label: 'III. DuPont & Karne', num: 'III' },
                      { id: 'sec-iv', label: 'IV. WACC & Değerleme', num: 'IV' },
                      { id: 'sec-v', label: 'V. Döviz & Hassasiyet', num: 'V' },
                      { id: 'sec-vi', label: 'VI. Riskler & Karar', num: 'VI' },
                    ].map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(sec.id);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-emerald-950/60 text-slate-300 hover:text-emerald-300 border border-slate-800 hover:border-emerald-700/60 font-mono text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                      >
                        <span className="text-emerald-400 font-bold">{sec.num}.</span>
                        <span>{sec.label.replace(/^[IVXLCDM]+\.\s*/, '')}</span>
                      </button>
                    ))}
                  </div>

                  {/* Akademik & Bilişsel Okunabilirlik Çerçevesi:
                      - Göz yorgunluğunu önleyen sıcak koyu arduvaz zemin (#0D1424)
                      - Bilimsel olarak kanıtlanmış en yüksek odak ve akılda kalıcılık sağlayan 78-85 karakterlik (max-w-4xl) satır genişliği
                      - Anahtar kavramları öne çıkaran (Bionic Lead-In) yüksek kontrastlı tipografi */}
                  <div className="bg-slate-900 border border-slate-800/90 py-8 px-5 sm:px-10 md:px-14 rounded-2xl shadow-sm print:p-0 print:border-none print:bg-white print:text-black w-full">
                    <div className="report-content w-full max-w-4xl mx-auto space-y-6">
                      {/* Kurumsal Araştırma Raporu Başlık Kartı (İş Yatırım & Goldman Sachs Standardı) */}
                      <div className="border-b border-slate-800/90 pb-6 mb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3.5 border-b border-slate-800/80">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 dark:text-emerald-300 font-mono font-bold text-xs tracking-wider uppercase shadow-xs">
                              BİST KURUMSAL DEĞERLEME & HİSSE ANALİZ NOTU
                            </span>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-800/90 border border-slate-700/70 text-slate-300 text-xs font-medium">
                              Kurumsal Araştırma Standardı
                            </span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 shrink-0">
                            <span>Analiz Tarihi:</span>
                            <span className="text-slate-200 font-semibold">{activeReport.createdAt}</span>
                          </div>
                        </div>

                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2.5 mb-1.5">
                              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                                {activeReport.ticker}
                              </h1>
                              <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                {currentSector || 'Sanayi & Hizmet'}
                              </span>
                              <span className="text-xs font-mono text-emerald-300 bg-emerald-950/60 px-2.5 py-0.5 rounded border border-emerald-800/60">
                                Dönem: {activeReport.period || currentExtractedData?.reporting_period || 'Güncel'}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-400">
                              Detaylı Bilanço Kâr Kalitesi Denetimi, 5-Aşamalı DuPont ve Hibrit Değerleme Modeli
                            </p>
                          </div>

                          <div className="flex items-center gap-3 bg-slate-950/90 border border-slate-800 p-3 rounded-xl shadow-sm">
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400 uppercase font-semibold">Tavsiye</div>
                              <div className={`font-mono text-base font-black ${
                                activeReport.decision === 'AL' ? 'text-emerald-400' : activeReport.decision === 'ALMA' ? 'text-rose-400' : 'text-amber-400'
                              }`}>
                                {activeReport.decision || 'DEĞERLENDİRİLİYOR'}
                              </div>
                            </div>
                            <div className="w-px h-8 bg-slate-800" />
                            <div>
                              <div className="text-[10px] text-slate-400 uppercase font-semibold">Adil Değer</div>
                              <div className="font-mono text-base font-black text-emerald-400">
                                {valuationInfo.fair_value} TL
                              </div>
                            </div>
                            <div className="w-px h-8 bg-slate-800" />
                            <div>
                              <div className="text-[10px] text-slate-400 uppercase font-semibold">Potansiyel</div>
                              <div className={`font-mono text-base font-black ${valuationInfo.discount_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {valuationInfo.discount_pct >= 0 ? `+%${valuationInfo.discount_pct}` : `%${valuationInfo.discount_pct}`}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {(valuationInfo.gordon_formula_text || dynamicValuationResult?.valuation?.gordon_formula_text) && (
                        <div className="mb-6 p-3.5 rounded-xl bg-slate-950/80 border border-emerald-900/40 text-xs font-mono text-emerald-300 flex items-center justify-between flex-wrap gap-2 shadow-sm">
                          <span className="font-semibold text-slate-300">Hedef Çarpan & Değerleme Formülü:</span>
                          <span className="text-emerald-400 font-bold">
                            {valuationInfo.gordon_formula_text || dynamicValuationResult?.valuation?.gordon_formula_text}
                          </span>
                        </div>
                      )}

                      {/* Dönemsel Hafıza & Çeyreklik Karşılaştırma Kartı (Item 5) */}
                      {previousQuarterComparison && (
                        <div className="p-4 rounded-xl bg-slate-950 border border-blue-500/40 shadow-sm mb-6">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-blue-900/40">
                            <div className="flex items-center gap-2">
                              <History className="w-4 h-4 text-blue-400" />
                              <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">
                                Dönemsel Hafıza: Çeyreklik Hedef & Karar Revizyonu
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-blue-300 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/60">
                              Önceki Rapor: {previousQuarterComparison.previousReport.createdAt}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-slate-400 font-semibold block">Önceki Çeyrek Adil Değer</span>
                              <span className="font-mono text-sm font-bold text-slate-300">{previousQuarterComparison.prevFairValue} TL</span>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-slate-400 font-semibold block">Güncel Çeyrek Adil Değer</span>
                              <span className="font-mono text-sm font-black text-emerald-400">{previousQuarterComparison.currFairValue} TL</span>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-slate-400 font-semibold block">Çeyreklik Hedef Değişimi</span>
                              <span className={`font-mono text-sm font-black ${(previousQuarterComparison.diffPct || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {(previousQuarterComparison.diffPct || 0) >= 0 ? '+' : ''}%{previousQuarterComparison.diffPct} Artış / Revizyon
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-slate-400 font-semibold block">Tavsiye & Skor Gelişimi</span>
                              <span className="font-mono text-xs text-slate-200">
                                {previousQuarterComparison.prevDecision || '—'} ({previousQuarterComparison.prevScore || '—'}p) → <strong className="text-white font-bold">{previousQuarterComparison.currDecision || '—'}</strong> ({previousQuarterComparison.currScore || '—'}p)
                              </span>
                            </div>
                          </div>
                        </div>
                      )}



                      {/* ITEM 1: KÂR KALİTESİ & NAKİT AKIŞI TEŞHİSİ (BÖLÜM II ÇAPASI) */}
                      <div className="mb-8">
                        {renderEarningsQualityCard({ id: 'sec-ii' })}
                      </div>

                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
                        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
                        components={{
                          h1: ({ children, ...props }) => (
                            <div className="border-b border-slate-800 pb-4 mb-6 mt-2">
                              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug" {...props}>
                                {children}
                              </h1>
                            </div>
                          ),
                          h2: ({ children, ...props }) => {
                            const text = extractTextFromChildren(children);
                            const romanMatch = text.match(/^(I{1,3}|IV|V|VI{1,3}|IX|X)[\.\:\s\-]+(.*)/i);
                            if (romanMatch) {
                              const roman = romanMatch[1].toUpperCase();
                              const title = romanMatch[2].trim();
                              const secId = `sec-${roman.toLowerCase()}`;
                              return (
                                <div id={secId} className="scroll-mt-24 mt-12 mb-5 pt-5 border-t-2 border-emerald-500/30">
                                  <div className="flex items-center gap-2.5 mb-2.5">
                                    <span className="px-3 py-1 rounded-md bg-emerald-500/25 text-emerald-300 font-mono text-xs font-black tracking-widest border border-emerald-500/50 uppercase shadow-sm">
                                      BÖLÜM {roman}
                                    </span>
                                    <div className="h-px bg-slate-800 flex-1" />
                                  </div>
                                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-snug">
                                    {title || children}
                                  </h2>
                                </div>
                              );
                            }
                            return (
                              <div className="mt-10 mb-4 pb-2.5 border-b border-slate-800/90 flex items-center gap-3">
                                <div className="w-1.5 h-6 rounded-full bg-emerald-400 flex-shrink-0" />
                                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-emerald-300 leading-snug" {...props}>
                                  {children}
                                </h2>
                              </div>
                            );
                          },
                          h3: ({ children, ...props }) => {
                            const text = extractTextFromChildren(children);
                            const romanMatch = text.match(/^(I{1,3}|IV|V|VI{1,3}|IX|X)[\.\:\s\-]+(.*)/i);
                            if (romanMatch) {
                              const roman = romanMatch[1].toUpperCase();
                              const title = romanMatch[2].trim();
                              const secId = `sec-${roman.toLowerCase()}`;
                              return (
                                <div id={secId} className="scroll-mt-24 mt-10 mb-4 pt-4 border-t border-slate-800/90">
                                  <div className="flex items-center gap-2.5 mb-2">
                                    <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-xs font-black tracking-widest border border-emerald-500/40 uppercase shadow-sm">
                                      BÖLÜM {roman}
                                    </span>
                                    <div className="h-px bg-slate-800 flex-1" />
                                  </div>
                                  <h3 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                                    {title || children}
                                  </h3>
                                </div>
                              );
                            }
                            return (
                              <h3 className="mt-7 mb-2.5 text-sm sm:text-base font-bold text-cyan-400 tracking-wide flex items-center gap-2 border-b border-slate-800/80 pb-1.5" {...props}>
                                {children}
                              </h3>
                            );
                          },
                          p: ({ children, ...props }) => {
                            const text = extractTextFromChildren(children);
                            if (/^\s*(?:#{1,4}\s*)?\*{0,2}Analist\s+Karar[ıi]\s*[:=-]/i.test(text)) {
                              const verdictMatch = text.match(/Analist\s+Karar[ıi]\s*[:=-]?\s*\[?\s*\*?\*?\s*(ALMA|SAT|AL|NÖTR|NOTR|TUT)\s*\*?\*?\s*\]?/i);
                              const matchedVerdict = verdictMatch ? verdictMatch[1].toUpperCase() : '';
                              const isAlma = ['ALMA', 'SAT'].includes(matchedVerdict) || (/\b(ALMA|SAT)\b/i.test(text) && !/\b(AL)\b/i.test(text.replace(/\b(ALMA)\b/gi, '')));
                              const isAl = ['AL'].includes(matchedVerdict) || (/\b(AL)\b/i.test(text) && !isAlma);
                              const fallbackVerdict = activeReport?.decision || 'NÖTR';
                              const verdict = isAl ? 'AL' : isAlma ? 'ALMA' : (verdictMatch ? 'NÖTR' : fallbackVerdict);
                              const isVerdictAl = verdict === 'AL';
                              const isVerdictAlma = verdict === 'ALMA';
                              const verdictTitle = isVerdictAl 
                                ? 'Kurumsal Alım & Portföy Ağırlığı Artır' 
                                : isVerdictAlma 
                                ? 'Riskli / Sermaye Kaybı Riski (Yatırım Önerilmez)' 
                                : 'Bekle-Gör / Nötr (İskonto Marjı Sınırlı)';

                              const cleanBody = text.replace(/^(?:#{1,3}\s*)?\*{0,2}Analist\s+Karar[ıi]\s*[:=-]?\s*\[?\s*\*?\*?\s*(?:ALMA|SAT|AL|NÖTR|NOTR|TUT)?\s*\*?\*?\]?\*{0,2}\s*/i, '').trim();

                              return (
                                <div className={`my-8 rounded-2xl border p-6 md:p-8 shadow-sm transition-all ${
                                  isVerdictAl
                                    ? 'bg-emerald-950/30 border-emerald-500/50'
                                    : isVerdictAlma
                                    ? 'bg-rose-950/30 border-rose-500/50'
                                    : 'bg-amber-950/30 border-amber-500/50'
                                }`}>
                                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-slate-800">
                                    <div className="flex items-center gap-4">
                                      <div className={`px-5 py-2.5 rounded-xl font-mono font-black text-xl tracking-wider shadow-sm flex items-center justify-center min-w-[90px] ${
                                        isVerdictAl 
                                          ? 'bg-emerald-600 text-white' 
                                          : isVerdictAlma 
                                          ? 'bg-rose-600 text-white' 
                                          : 'bg-amber-500 text-slate-950'
                                      }`}>
                                        {verdict}
                                      </div>
                                      <div>
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                          Fon Yöneticisi & Baş Analist Nihai Kararı
                                        </div>
                                        <div className={`text-base font-extrabold ${
                                          isVerdictAl ? 'text-emerald-300' : isVerdictAlma ? 'text-rose-300' : 'text-amber-300'
                                        }`}>
                                          {verdictTitle}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2.5">
                                      <div className="bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 rounded-lg flex items-center gap-2">
                                        <span className="text-[11px] text-slate-400">Adil Değer:</span>
                                        <span className="font-mono text-xs font-bold text-emerald-400">
                                          {valuationInfo.fair_value} TL
                                        </span>
                                      </div>
                                      {activeReport.price && (
                                        <div className="bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 rounded-lg flex items-center gap-2">
                                          <span className="text-[11px] text-slate-400">Piyasa Fiyatı:</span>
                                          <span className="font-mono text-xs font-bold text-white">{activeReport.price} TL</span>
                                        </div>
                                      )}
                                      {activeReport.score !== undefined && (
                                        <div className="bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 rounded-lg flex items-center gap-2">
                                          <span className="text-[11px] text-slate-400">Kurumsal Skor:</span>
                                          <span className={`font-mono text-xs font-black ${
                                            (Number(activeReport.score) || 0) >= 70 ? 'text-emerald-400' : (Number(activeReport.score) || 0) >= 50 ? 'text-amber-400' : 'text-rose-400'
                                          }`}>
                                            {activeReport.score} / 100
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {(() => {
                                    const narrative = parseVerdictNarrative(cleanBody);
                                    if (!cleanBody && !narrative.thesis) {
                                      return (
                                        <div className="mt-5 text-sm text-slate-100 leading-relaxed font-normal">
                                          {children}
                                        </div>
                                      );
                                    }

                                    return (
                                      <div className="mt-6 space-y-4">
                                        {/* 1. Yatırım Tezi & Stratejik Değerlendirme (Ana Metin) */}
                                        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 shadow-xs">
                                          <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-slate-800/60">
                                            <Compass className="w-4 h-4 text-emerald-400 shrink-0" />
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                                              Yatırım Tezi & Stratejik Değerlendirme
                                            </span>
                                          </div>
                                          <p className="text-slate-100 text-sm sm:text-[15px] leading-relaxed font-normal">
                                            {narrative.thesis || cleanBody}
                                          </p>
                                        </div>

                                        {/* 2. Katalizörler ve Riskler (Yan Yana Dengeli Grid) */}
                                        {(narrative.catalysts || narrative.risks) && (
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {narrative.catalysts && (
                                              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4.5 shadow-xs flex flex-col justify-start">
                                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800/60">
                                                  <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                                                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                                                    Kilit Değer Katalizörleri
                                                  </span>
                                                </div>
                                                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
                                                  {narrative.catalysts}
                                                </p>
                                              </div>
                                            )}

                                            {narrative.risks && (
                                              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4.5 shadow-xs flex flex-col justify-start">
                                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800/60">
                                                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                                                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                                                    Aşağı Yönlü Riskler & Emniyet Marjı
                                                  </span>
                                                </div>
                                                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-normal">
                                                  {narrative.risks}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              );
                            }
                            return (
                              <p className={`text-slate-200 tracking-[0.01em] mb-4 ${
                                fontSizeMode === 'large' ? 'text-[17px] leading-[1.95]' :
                                fontSizeMode === 'compact' ? 'text-[13.5px] leading-[1.7]' :
                                'text-[15.5px] leading-[1.85]'
                              }`} {...props}>
                                {children}
                              </p>
                            );
                          },
                          table: ({ ...props }) => (
                            <div className="overflow-x-auto my-6 border border-slate-700/80 rounded-xl shadow-sm bg-slate-950/80">
                              <table className="w-full text-left border-collapse text-xs sm:text-sm font-sans" {...props} />
                            </div>
                          ),
                          thead: ({ ...props }) => <thead className="bg-slate-900 text-slate-100 border-b border-slate-700 font-bold uppercase tracking-wider text-[11px]" {...props} />,
                          tbody: ({ ...props }) => <tbody className="divide-y divide-slate-800/70" {...props} />,
                          tr: ({ children, ...props }) => {
                            const rowText = extractTextFromChildren(children);
                            const isTotal = rowText.includes('Toplam Puan') || rowText.includes('Nihai Skor');
                            return (
                              <tr className={`transition-colors ${isTotal ? 'bg-emerald-950/50 font-bold text-white' : 'hover:bg-slate-800/40'}`} {...props}>
                                {children}
                              </tr>
                            );
                          },
                          th: ({ ...props }) => <th className="p-3.5 font-bold text-slate-200 tracking-wide text-xs" {...props} />,
                          td: ({ ...props }) => <td className="p-3.5 text-slate-100 font-mono text-xs sm:text-sm" {...props} />,
                          blockquote: ({ ...props }) => (
                            <blockquote className="border-l-4 border-emerald-400 bg-emerald-950/25 px-5 py-3.5 my-5 rounded-r-xl text-emerald-100 text-sm sm:text-[15px] leading-relaxed font-sans shadow-sm" {...props} />
                          ),
                          strong: ({ ...props }) => (
                            <strong className="font-bold text-white" {...props} />
                          ),
                          ul: ({ ...props }) => (
                            <ul className={`list-disc list-outside ml-6 space-y-3 my-4 text-slate-200 ${
                              fontSizeMode === 'large' ? 'text-[16.5px] leading-[1.9]' :
                              fontSizeMode === 'compact' ? 'text-[13px] leading-[1.65]' :
                              'text-[15px] leading-[1.8]'
                            }`} {...props} />
                          ),
                          ol: ({ ...props }) => (
                            <ol className={`list-decimal list-outside ml-6 space-y-3 my-4 text-slate-200 ${
                              fontSizeMode === 'large' ? 'text-[16.5px] leading-[1.9]' :
                              fontSizeMode === 'compact' ? 'text-[13px] leading-[1.65]' :
                              'text-[15px] leading-[1.8]'
                            }`} {...props} />
                          ),
                          li: ({ children, ...props }) => (
                            <li className="pl-1.5 py-0.5 marker:text-emerald-400 marker:font-bold text-slate-200 leading-relaxed" {...props}>
                              {children}
                            </li>
                          ),
                          hr: ({ ...props }) => <hr className="border-slate-800 my-7" {...props} />,
                          code: ({ inline, ...props }: any) => (
                            <code className="bg-slate-950 border border-slate-800 text-emerald-300 px-1.5 py-0.5 rounded font-mono text-xs sm:text-sm" {...props} />
                          ),
                        }}
                      >
                        {preprocessReportMarkdown(activeReport.report, valuationInfo)}
                      </ReactMarkdown>
                    </div>
                  </div>
                </ComponentErrorBoundary>
                </div>

              {/* SEKME 7: ÇEYREKLİK SKOR TAKİBİ */}
              {activeTab === 'history' && (
                <ComponentErrorBoundary fallbackTitle="Geçmiş Raporlar Hatası">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 shadow-xl">
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
                            <LineChart data={tickerHistory.map((h) => ({ name: h.period || h.createdAt, score: Number(h.score) || 0 }))}>
                              <CartesianGrid strokeDasharray="2 2" stroke="var(--chart-grid)" />
                              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }}  tickFormatter={(v: string) => v ? v.slice(2) : v} />
                              <YAxis stroke="#64748b" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                              <Tooltip contentStyle={{ backgroundColor: 'var(--tooltip-bg)', borderColor: 'var(--tooltip-border)', color: 'var(--text-primary)', borderRadius: '0.375rem', fontSize: '12px' }} />
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
                                item.decision === 'AL' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80' :
                                item.decision === 'ALMA' ? 'bg-rose-950/80 text-rose-400 border border-rose-800/80' :
                                'bg-amber-950/80 text-amber-400 border border-amber-800/80'
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
                </ComponentErrorBoundary>
              )}
                </>
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
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
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
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
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
                                  item.decision === 'AL' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80' :
                                  item.decision === 'ALMA' ? 'bg-rose-950/80 text-rose-400 border border-rose-800/80' :
                                  'bg-amber-950/80 text-amber-400 border border-amber-800/80'
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

      {/* YATIRIM TEMALARI & ŞİRKET SINIFLANDIRMA RADAR MODALI */}
      {isThemesModalOpen && (() => {
        const themeSummary = getThemeSummary(savedReports);
        const allThemesList = Object.values(INVESTMENT_THEMES);
        
        let displayedItems: Array<{ report: SavedReport; match: CompanyThemeMatch }> = [];
        if (selectedThemeFilter === 'ALL') {
          savedReports.forEach(r => {
            const matches = categorizeCompany(r);
            matches.forEach(m => {
              displayedItems.push({ report: r, match: m });
            });
          });
        } else {
          displayedItems = themeSummary[selectedThemeFilter] || [];
        }

        if (themeSearchTerm.trim()) {
          const q = themeSearchTerm.trim().toUpperCase();
          displayedItems = displayedItems.filter(item => 
            item.report.ticker.toUpperCase().includes(q) ||
            (item.report.sector || '').toUpperCase().includes(q) ||
            item.match.themeName.toUpperCase().includes(q) ||
            item.match.reason.toUpperCase().includes(q)
          );
        }

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-700/60 text-cyan-400 shadow-sm">
                    <Compass className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                        Yatırım Temaları & Şirket Radar Paneli
                      </h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
                        {savedReports.length} Analiz Edilmiş Şirket
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Mali tablolara ve rasyolara dayalı 6 objektif yatırım teması filtresi.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsThemesModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tema Seçici Butonları */}
              <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-950 flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => setSelectedThemeFilter('ALL')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer border ${
                    selectedThemeFilter === 'ALL'
                      ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Tüm Eşleşmeler
                </button>

                {allThemesList.map(theme => {
                  const count = themeSummary[theme.id]?.length || 0;
                  const isSelected = selectedThemeFilter === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setSelectedThemeFilter(theme.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer border ${
                        isSelected
                          ? `${theme.badgeClass} ring-1 ring-cyan-400/50 shadow-sm`
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {renderThemeIcon(theme.iconTag, "w-3.5 h-3.5")}
                      <span>{theme.shortLabel}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                        count > 0 ? 'bg-slate-950 text-white border border-slate-700' : 'bg-slate-950/50 text-slate-600'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Seçili Tema Açıklama ve Kriter Başlığı */}
              {selectedThemeFilter !== 'ALL' && (
                <div className="px-4 py-3 bg-slate-950/50 border-b border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`p-1.5 rounded-lg bg-slate-900 border border-slate-800 ${INVESTMENT_THEMES[selectedThemeFilter].colorClass}`}>
                      {renderThemeIcon(INVESTMENT_THEMES[selectedThemeFilter].iconTag, "w-4 h-4")}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        {INVESTMENT_THEMES[selectedThemeFilter].name}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        {INVESTMENT_THEMES[selectedThemeFilter].description}
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                    <span className="text-slate-500 mr-1.5">Kriterler:</span>
                    {INVESTMENT_THEMES[selectedThemeFilter].criteriaSummary}
                  </div>
                </div>
              )}

              {/* Arama Kutusu */}
              <div className="p-3 bg-slate-950/30 border-b border-slate-800/50 flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={themeSearchTerm}
                    onChange={(e) => setThemeSearchTerm(e.target.value)}
                    placeholder="Şirket kodu, sektör veya gerekçe ara..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {displayedItems.length} Şirket Kartı
                </span>
              </div>

              {/* Kartlar Grid */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                {displayedItems.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 space-y-2">
                    <Compass className="w-10 h-10 mx-auto text-slate-600 opacity-60" />
                    <p className="text-sm font-semibold text-slate-400">
                      Bu kriterlere uyan kayıtlı şirket bulunamadı.
                    </p>
                    <p className="text-xs text-slate-600 max-w-md mx-auto">
                      BIST hisselerini analiz ettikçe şirketler finansal göstergelerine ve rasyolarına göre otomatik olarak bu temalara dahil edilir.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {displayedItems.map(({ report, match }, idx) => {
                      const repVal = (report as any).valuation || report.extractedData?.valuation;
                      const fairVal = repVal?.fair_value || 0;
                      const priceNum = parseFloat(report.price || '0') || 0;
                      const discount = (fairVal > 0 && priceNum > 0)
                        ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                        : null;
                      const isAl = report.decision === 'AL';
                      const isAlma = report.decision === 'ALMA';

                      const allMatches = categorizeCompany(report);

                      return (
                        <div
                          key={`${report.id}-${match.themeId}-${idx}`}
                          className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-cyan-700/60 transition group flex flex-col justify-between space-y-3 shadow-md"
                        >
                          <div>
                            {/* Üst Satır: Ticker, Karar ve Skor */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-base font-black text-white font-mono tracking-tight">
                                  {report.ticker}
                                </span>
                                <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                                  {report.sector || 'BIST'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                                  isAl ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                  isAlma ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                                  'bg-amber-950 text-amber-400 border border-amber-800'
                                }`}>
                                  {report.decision}
                                </span>
                                {report.score && (
                                  <span className="text-[11px] font-mono font-bold text-slate-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                    {report.score}/100
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Fiyat & Adil Değer & İskonto Satırı */}
                            <div className="flex items-center gap-3 mt-2.5 text-xs font-mono py-1.5 px-2.5 bg-slate-950/70 rounded-lg border border-slate-800/60">
                              <div>
                                <span className="text-slate-500 text-[10px] block">FİYAT</span>
                                <span className="text-white font-bold">{priceNum > 0 ? `${priceNum.toFixed(2)} TL` : '—'}</span>
                              </div>
                              <div className="h-5 w-px bg-slate-800" />
                              <div>
                                <span className="text-slate-500 text-[10px] block">ADİL DEĞER</span>
                                <span className="text-emerald-400 font-bold">{fairVal > 0 ? `${fairVal.toFixed(2)} TL` : '—'}</span>
                              </div>
                              <div className="h-5 w-px bg-slate-800" />
                              <div>
                                <span className="text-slate-500 text-[10px] block">POTANSİYEL</span>
                                {discount !== null ? (
                                  <span className={`font-bold ${discount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {discount >= 0 ? `+%${discount} İskonto` : `%${Math.abs(discount)} Prim`}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </div>
                            </div>

                            {/* Somut Tematik Gerekçe ve Rasyo */}
                            <div className="mt-3 p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-xs">
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                                  {renderThemeIcon(match.iconTag, "w-3.5 h-3.5")}
                                  {match.themeName}
                                </span>
                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-200 border border-cyan-700">
                                  {match.metricValue}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-300 leading-relaxed">
                                {match.reason}
                              </p>
                            </div>

                            {/* Diğer Temalar (Varsa) */}
                            {allMatches.length > 1 && (
                              <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                                <span className="text-[10px] text-slate-500">Diğer Nitelikler:</span>
                                {allMatches.filter(m => m.themeId !== match.themeId).map(other => (
                                  <span
                                    key={other.themeId}
                                    className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${other.badgeClass}`}
                                  >
                                    {other.shortLabel}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* İncele Butonu */}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveReportId(report.id);
                              setStep('report');
                              setIsThemesModalOpen(false);
                            }}
                            className="w-full py-2 bg-slate-800 hover:bg-cyan-600 hover:text-white text-slate-300 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 border border-slate-700 hover:border-cyan-500 cursor-pointer"
                          >
                            <span>Raporu ve Modeli İncele</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ANALİZ EDİLEN ŞİRKETLER MODALI (AL - NÖTR - ALMA SEKME KURGUSU) */}
      {isAnalyzedModalOpen && (() => {
        const alReports = savedReports.filter(r => (r.decision || '').trim().toUpperCase() === 'AL');
        const notrReports = savedReports.filter(r => {
          const d = (r.decision || '').trim().toUpperCase();
          return d === 'NÖTR' || d === 'NOTR';
        });
        const almaReports = savedReports.filter(r => (r.decision || '').trim().toUpperCase() === 'ALMA');

        let currentList = analyzedTab === 'AL' 
          ? alReports 
          : analyzedTab === 'NÖTR' 
          ? notrReports 
          : analyzedTab === 'ALMA' 
          ? almaReports 
          : savedReports;

        if (analyzedSearch.trim()) {
          const q = analyzedSearch.trim().toUpperCase();
          currentList = currentList.filter(r => 
            (r.ticker || '').toUpperCase().includes(q) || 
            ((r as any).companyName || r.extractedData?.company_name || '').toUpperCase().includes(q)
          );
        }

        const sortedList = sidebarSort === 'rank' 
          ? sortReportsByScoreDesc(currentList) 
          : sortReportsByDate(currentList);

        return (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 print:hidden">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden divide-y divide-slate-800">
              
              {/* Modal Başlığı & Kapatma */}
              <div className="p-4 sm:px-6 flex items-center justify-between bg-slate-950/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white tracking-tight">
                        Analiz Edilen Şirketler
                      </h3>
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {savedReports.length} Şirket
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Kayıtlı hisse değerlemeleri, skorlar ve yatırım kararları
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Sıralama */}
                  <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setSidebarSort('rank')}
                      className={`px-2.5 py-1 rounded transition cursor-pointer ${
                        sidebarSort === 'rank' 
                          ? 'bg-emerald-600 text-white font-semibold shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Puana Göre
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarSort('date')}
                      className={`px-2.5 py-1 rounded transition cursor-pointer ${
                        sidebarSort === 'date' 
                          ? 'bg-slate-700 text-white font-semibold shadow-sm' 
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Tarihe Göre
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAnalyzedModalOpen(false)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                    title="Kapat"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Sekmeler (AL - NÖTR - ALMA) & Arama Kutusu */}
              <div className="p-3 sm:px-6 bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto [scrollbar-width:none]">
                  {[
                    { key: 'ALL', label: 'TÜMÜ', count: savedReports.length, dot: 'bg-slate-400' },
                    { key: 'AL', label: 'AL', count: alReports.length, dot: 'bg-emerald-400', activeCls: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' },
                    { key: 'NÖTR', label: 'NÖTR', count: notrReports.length, dot: 'bg-amber-400', activeCls: 'border-amber-500/50 bg-amber-500/10 text-amber-300' },
                    { key: 'ALMA', label: 'ALMA', count: almaReports.length, dot: 'bg-rose-400', activeCls: 'border-rose-500/50 bg-rose-500/10 text-rose-300' },
                  ].map(tab => {
                    const isSelected = analyzedTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setAnalyzedTab(tab.key as any)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                          isSelected
                            ? tab.activeCls || 'border-slate-700 bg-slate-800 text-white'
                            : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-800/40'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${tab.dot}`} />
                        <span>{tab.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={analyzedSearch}
                    onChange={(e) => setAnalyzedSearch(e.target.value)}
                    placeholder="Hisse kodu veya şirket ara..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              {/* Şirket Kartları Izgarası */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                {sortedList.length === 0 ? (
                  <div className="text-center py-16 space-y-2">
                    <Building2 className="w-10 h-10 text-slate-700 mx-auto" />
                    <div className="text-slate-400 text-sm font-medium">
                      Bu kategoride kayıtlı şirket analizi bulunamadı.
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sortedList.map((item) => {
                      const isAl = (item.decision || '').trim().toUpperCase() === 'AL';
                      const isAlma = (item.decision || '').trim().toUpperCase() === 'ALMA';
                      const badgeCls = isAl
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : isAlma
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-400';

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setActiveReportId(item.id);
                            setStep('report');
                            setIsAnalyzedModalOpen(false);
                          }}
                          className="bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition cursor-pointer flex items-center justify-between group shadow-sm"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-sm text-white group-hover:text-emerald-400 transition">
                                {item.ticker}
                              </span>
                              {item.period && (
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                  {item.period}
                                </span>
                              )}
                              {((item as any).companyName || item.extractedData?.company_name) && (
                                <span className="text-xs text-slate-400 truncate max-w-[140px] hidden sm:inline">
                                  {(item as any).companyName || item.extractedData?.company_name}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 font-mono">
                              <span>Tarih: {item.createdAt || '—'}</span>
                              {item.price && (
                                <>
                                  <span>•</span>
                                  <span>Fiyat: {item.price} TL</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold flex items-center gap-2 ${badgeCls}`}>
                              <span>{item.score ? `${item.score}/100` : '—'}</span>
                              <span className="w-1 h-3 bg-current opacity-30" />
                              <span>{item.decision || 'NÖTR'}</span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteReport(item.id, e);
                              }}
                              title="Analizi Sil"
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 rounded transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Alt Bilgi & Yedekleme */}
              <div className="p-3 sm:px-6 bg-slate-950/70 flex items-center justify-between">
                <div className="text-xs text-slate-500 font-mono">
                  Toplam {savedReports.length} analiz kayıtlı
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={exportBackup}
                    disabled={savedReports.length === 0}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 py-1.5 px-3 rounded-lg border border-slate-800 transition cursor-pointer disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Yedekle</span>
                  </button>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 py-1.5 px-3 rounded-lg border border-slate-800 transition cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Yükle</span>
                    <input
                      type="file"
                      accept="application/json"
                      onChange={importBackup}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
