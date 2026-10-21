'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  Send, FileText, FileSpreadsheet, Presentation, AlertTriangle, Database, 
  RefreshCw, Printer, PlusCircle, Plus, History, Clock,
  ChevronRight, ChevronDown, UploadCloud, X, CheckCircle2, Search,
  TrendingUp, BarChart3, Target, Calendar, ArrowUpRight, ArrowDownRight, Minus,
  DollarSign, ShieldCheck, ShieldAlert, Activity, Layers, Download, Upload,
  Trophy, Award, Trash2, ArrowUpDown, Filter, Copy, Percent, PieChart, Info,
  PanelLeftClose, PanelLeftOpen, Pin, PinOff, Bookmark, Building2,
  Check, Rocket, Gem, Shield, Sun, Moon, Compass, SlidersHorizontal, Scale, ArrowRight, ArrowLeft, Sparkles,
  Briefcase, Star, Bell, User, LogOut, LayoutGrid, List, Grid, Lock, Newspaper, Radio, ExternalLink, Coins, Megaphone
} from 'lucide-react';

import LoginModal, { type UserSession } from './components/login-modal';
import SpotlightSearch from './components/spotlight-search';
import { getCompanyNewsFeed, getNewsCategories, type CompanyNewsItem } from '@/lib/news-service';
import { getKapCompanyDisclosuresUrl } from '@/lib/kap-mapping';

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
  SECTOR_ARCHETYPE_CONFIGS,
  getCompanySectorDisplayName
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
export function FairValueLogo({ className = "w-7 h-7" }: { className?: string }) {
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

  thesis = thesis.replace(/^(?:Yatırım\s+Tezi|Temel\s+Yatırım\s+Tezi|Gerekçe)\s*[:=-|]\s*/i, '').trim();
  thesis = thesis.replace(/^[:=| \t]+/, '').trim();
  if (thesis.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '').length < 8) {
    thesis = '';
  }

  catalysts = catalysts.replace(/^(?:Kilit\s+Katalizörler|Katalizörler)\s*[:=-|]\s*/i, '').trim();
  catalysts = catalysts.replace(/^[:=| \t]+/, '').trim();
  if (catalysts.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '').length < 8) {
    catalysts = '';
  }

  risks = risks.replace(/^(?:Riskler\s*(?:&|ve)\s*Emniyet\s*Marjı|Temel\s*Riskler)\s*[:=-|]\s*/i, '').trim();
  risks = risks.replace(/^[:=| \t]+/, '').trim();
  if (risks.replace(/[^a-zA-ZçğıöşüÇĞİÖŞÜ]/g, '').length < 8) {
    risks = '';
  }

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
  // Bozuk / tek başına kalmış tablo çizgilerini ve "Temel Yatırım Tezi\n|" kalıntılarını temizle
  cleaned = cleaned.replace(/(?:^|\n)\s*(?:Temel\s+Yatırım\s+Tezi|Yatırım\s+Tezi)\s*[:=-]?\s*\n\s*\|[ \t]*(?:\n|$)/gi, '\n');
  cleaned = cleaned.replace(/^\s*\|\s*$/gm, '');
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
  const [step, setStep] = useState<'input' | 'review' | 'report' | 'leaderboard' | 'themes' | 'saved'>(
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
  const [selectedThemeFilters, setSelectedThemeFilters] = useState<InvestmentThemeId[]>([]);
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

  // Analiz Edilen Şirketler Sekme & Filtre Durumu
  const [analyzedTab, setAnalyzedTab] = useState<'ALL' | 'PORTFOLIO' | 'FAVORITES' | 'AL' | 'NÖTR' | 'ALMA'>('ALL');
  const [analyzedSearch, setAnalyzedSearch] = useState('');

  // Rapor öncesi gezinti durumu (Geri butonuna basıldığında gelinen ekrana dönebilmek için)
  const [previousNavState, setPreviousNavState] = useState<{
    step: 'input' | 'review' | 'report' | 'leaderboard' | 'themes' | 'saved';
    analyzedTab: 'ALL' | 'PORTFOLIO' | 'FAVORITES' | 'AL' | 'NÖTR' | 'ALMA';
  }>({ step: 'saved', analyzedTab: 'ALL' });

  // Kullanıcı Oturum Durumu & Modallar
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);

  // Görünüm Modları (Varsayılan olarak 'list' - Tablo görünümü)
  const [discoverViewMode, setDiscoverViewMode] = useState<'cards' | 'list' | 'compact'>('list');
  const [watchlistViewMode, setWatchlistViewMode] = useState<'cards' | 'list' | 'compact'>('list');
  const [portfolioViewMode, setPortfolioViewMode] = useState<'cards' | 'list' | 'compact'>('list');
  const [portfolioDecisionFilter, setPortfolioDecisionFilter] = useState<'ALL' | 'AL' | 'NÖTR' | 'ALMA'>('ALL');
  const [newsCategoryFilter, setNewsCategoryFilter] = useState<string>('ALL');
  const [newsSearchTerm, setNewsSearchTerm] = useState<string>('');
  const [liveNewsFeed, setLiveNewsFeed] = useState<CompanyNewsItem[]>([]);
  const [selectedDisclosure, setSelectedDisclosure] = useState<CompanyNewsItem | null>(null);
  const [isFeedLoading, setIsFeedLoading] = useState<boolean>(false);
  const [lastFeedSync, setLastFeedSync] = useState<Date | null>(null);

  const refreshLiveFeed = useCallback(async () => {
    setIsFeedLoading(true);
    try {
      const analyzedTickers = savedReports
        .map(r => r.ticker)
        .filter((t): t is string => Boolean(t && t.trim()));

      if (analyzedTickers.length === 0) {
        setLiveNewsFeed([]);
        setLastFeedSync(new Date());
        setIsFeedLoading(false);
        return;
      }

      const params = new URLSearchParams({
        tickers: [...new Set(analyzedTickers)].join(','),
      });

      const res = await fetch(`/api/feed?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.feed)) {
          setLiveNewsFeed(data.feed);
          setLastFeedSync(new Date());
        }
      }
    } catch (e) {
      console.error('KAP akışı çekilemedi:', e);
    } finally {
      setIsFeedLoading(false);
    }
  }, [savedReports]);

  useEffect(() => {
    refreshLiveFeed();
  }, [refreshLiveFeed]);

  const handleDemoLogin = useCallback(() => {
    const demoSession: UserSession = {
      name: 'Demo Yatırımcı',
      email: 'demo@fairvalue.com.tr',
      initials: 'DY',
      isLoggedIn: true,
      role: 'Misafir Kullanıcı',
      loginTime: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    };
    setUserSession(demoSession);
    try {
      localStorage.setItem('fair_value_user', JSON.stringify(demoSession));
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedUser = localStorage.getItem('fair_value_user');
        if (savedUser) setUserSession(JSON.parse(savedUser));
      } catch (e) {
        console.warn('User session okuma hatası:', e);
      }
    }
  }, []);

  // Global Ctrl + K / Cmd + K Kısayolu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSpotlightOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = useCallback(() => {
    setUserSession(null);
    setIsUserMenuOpen(false);
    try {
      localStorage.removeItem('fair_value_user');
    } catch {}
  }, []);

  // Portföy ve Favoriler Listeleri (localStorage'a kalıcı kaydedilir)
  const [portfolioTickers, setPortfolioTickers] = useState<string[]>([]);
  const [favoriteTickers, setFavoriteTickers] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedPort = localStorage.getItem('fair_value_portfolio');
        if (savedPort) setPortfolioTickers(JSON.parse(savedPort));
        const savedFavs = localStorage.getItem('fair_value_favorites');
        if (savedFavs) setFavoriteTickers(JSON.parse(savedFavs));
      } catch (e) {
        console.warn('Portföy/Favori okuma hatası:', e);
      }
    }
  }, []);

  const togglePortfolio = useCallback((tickerToToggle: string) => {
    const sym = (tickerToToggle || '').trim().toUpperCase();
    if (!sym) return;
    setPortfolioTickers(prev => {
      const next = prev.includes(sym) ? prev.filter(t => t !== sym) : [...prev, sym];
      try { localStorage.setItem('fair_value_portfolio', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((tickerToToggle: string) => {
    const sym = (tickerToToggle || '').trim().toUpperCase();
    if (!sym) return;
    setFavoriteTickers(prev => {
      const next = prev.includes(sym) ? prev.filter(t => t !== sym) : [...prev, sym];
      try { localStorage.setItem('fair_value_favorites', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Tarayıcı Yolu & Sayfa Geçiş Yöneticisi (URL Navigation)
  const navigateTo = useCallback((targetStep: 'input' | 'saved' | 'themes' | 'leaderboard' | 'portfolio' | 'favorites') => {
    setError(null);
    const basePath = typeof window !== 'undefined' && window.location.pathname.startsWith('/simply') ? '/simply' : '';

    if (targetStep === 'portfolio') {
      setStep('saved');
      setAnalyzedTab('PORTFOLIO');
      if (typeof window !== 'undefined') window.history.pushState(null, '', `${basePath}/?view=portfolio`);
    } else if (targetStep === 'favorites') {
      setStep('saved');
      setAnalyzedTab('FAVORITES');
      if (typeof window !== 'undefined') window.history.pushState(null, '', `${basePath}/?view=favorites`);
    } else if (targetStep === 'saved') {
      setStep('saved');
      setAnalyzedTab('ALL');
      if (typeof window !== 'undefined') window.history.pushState(null, '', `${basePath}/?view=saved`);
    } else if (targetStep === 'themes') {
      setStep('themes');
      if (typeof window !== 'undefined') window.history.pushState(null, '', `${basePath}/?view=themes`);
    } else if (targetStep === 'leaderboard') {
      setStep('leaderboard');
      if (typeof window !== 'undefined') window.history.pushState(null, '', `${basePath}/?view=leaderboard`);
    } else if (targetStep === 'input') {
      setStep('input');
      setActiveReportId(null);
      if (typeof window !== 'undefined') window.history.pushState(null, '', `${basePath || '/'}`);
    }
  }, []);

  const openReport = useCallback((reportId: string, tickerName?: string) => {
    setStep((currentStep) => {
      if (currentStep !== 'report') {
        setPreviousNavState({ step: currentStep, analyzedTab });
      }
      return 'report';
    });
    setActiveReportId(reportId);
    const sym = tickerName || savedReports.find(r => r.id === reportId)?.ticker || '';
    if (sym && typeof window !== 'undefined') {
      const isSimply = window.location.pathname.startsWith('/simply');
      const targetPath = isSimply ? `/simply/${sym.toUpperCase()}` : `/analysis/${sym.toUpperCase()}`;
      window.history.pushState(null, '', targetPath);
    }
  }, [savedReports, analyzedTab]);

  const handleGoBack = useCallback(() => {
    if (previousNavState && previousNavState.step !== 'report') {
      setStep(previousNavState.step);
      setAnalyzedTab(previousNavState.analyzedTab);
      setActiveReportId(null);
    } else {
      setStep('saved');
      setAnalyzedTab('ALL');
      setActiveReportId(null);
    }
  }, [previousNavState]);

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

    // Doğrudan URL veya initialTicker kontrolü (/analysis/VESBE veya query params)
    let pathTicker = '';
    let queryView = '';
    let queryTicker = '';
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/(?:analysis|report|simply)\/([A-Za-z0-9_]+)/i);
      if (match && match[1]) {
        pathTicker = match[1].toUpperCase();
      }
      const sParams = new URLSearchParams(window.location.search);
      queryView = sParams.get('view') || '';
      queryTicker = (sParams.get('ticker') || '').toUpperCase();
    }
    const targetTicker = (initialTicker || pathTicker || queryTicker || '').trim().toUpperCase();

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
    } else if (queryView === 'portfolio') {
      setStep('saved');
      setAnalyzedTab('PORTFOLIO');
      setLoading(false);
    } else if (queryView === 'favorites') {
      setStep('saved');
      setAnalyzedTab('FAVORITES');
      setLoading(false);
    } else if (queryView === 'saved') {
      setStep('saved');
      setAnalyzedTab('ALL');
      setLoading(false);
    } else if (queryView === 'themes') {
      setStep('themes');
      setLoading(false);
    } else if (queryView === 'leaderboard') {
      setStep('leaderboard');
      setLoading(false);
    } else {
      // Hedef bir hisse belirtilmemişse (ana sayfa / veya /simply):
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

  // Adres Çubuğu Senkronizasyonu & Tarayıcı Geri/İleri Geçmiş Desteği
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const sParams = new URLSearchParams(window.location.search);
      const view = sParams.get('view');
      const qTicker = sParams.get('ticker');
      const match = window.location.pathname.match(/\/(?:analysis|report|simply)\/([A-Za-z0-9_]+)/i);
      const urlTicker = (match ? match[1] : qTicker || '').toUpperCase();

      if (urlTicker) {
        const found = savedReports.find(r => r.ticker?.toUpperCase() === urlTicker);
        if (found) {
          setActiveReportId(found.id);
          setStep('report');
          return;
        }
      }

      if (view === 'portfolio') {
        setStep('saved');
        setAnalyzedTab('PORTFOLIO');
      } else if (view === 'favorites') {
        setStep('saved');
        setAnalyzedTab('FAVORITES');
      } else if (view === 'saved') {
        setStep('saved');
        setAnalyzedTab('ALL');
      } else if (view === 'themes') {
        setStep('themes');
      } else if (view === 'leaderboard') {
        setStep('leaderboard');
      } else if (view === 'new' || (!view && !urlTicker)) {
        setStep('input');
        setActiveReportId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [savedReports]);

  // URL Senkronizasyonu (URL'yi sekmeler ve raporlarla senkronize tut)
  useEffect(() => {
    if (typeof window !== 'undefined' && mounted) {
      const isSimply = window.location.pathname.startsWith('/simply');
      const basePath = isSimply ? '/simply' : '';

      if (step === 'report' && activeReport?.ticker) {
        const targetPath = isSimply
          ? `/simply/${activeReport.ticker.toUpperCase()}`
          : `/analysis/${activeReport.ticker.toUpperCase()}`;
        if (window.location.pathname !== targetPath && !window.location.pathname.startsWith('/report/')) {
          window.history.pushState(null, '', targetPath);
        }
      } else if (step === 'saved') {
        const targetSearch = analyzedTab === 'PORTFOLIO' 
          ? '?view=portfolio' 
          : analyzedTab === 'FAVORITES' 
          ? '?view=favorites' 
          : '?view=saved';
        const targetFull = `${basePath}/${targetSearch}`;
        if (window.location.search !== targetSearch) {
          window.history.pushState(null, '', targetFull);
        }
      } else if (step === 'themes') {
        const targetFull = `${basePath}/?view=themes`;
        if (window.location.search !== '?view=themes') {
          window.history.pushState(null, '', targetFull);
        }
      } else if (step === 'leaderboard') {
        const targetFull = `${basePath}/?view=leaderboard`;
        if (window.location.search !== '?view=leaderboard') {
          window.history.pushState(null, '', targetFull);
        }
      } else if (step === 'input') {
        if (
          window.location.pathname.startsWith('/analysis/') ||
          window.location.pathname.startsWith('/report/') ||
          window.location.pathname.startsWith('/simply/') ||
          window.location.search.includes('view=')
        ) {
          const rootTarget = isSimply ? '/simply' : '/';
          window.history.pushState(null, '', rootTarget);
        }
      }
    }
  }, [step, activeReport?.ticker, analyzedTab, mounted]);

  const saveReport = async (newReport: SavedReport) => {
    // Aynı hissenin aynı çeyreklik dönem raporu varsa güncelle; farklı çeyrekse (örn: 2026/06 ve 2026/09) hafızada birlikte sakla
    const isSameQuarter = (a: SavedReport, b: SavedReport) => {
      const sameTicker = (a.ticker || '').trim().toUpperCase() === (b.ticker || '').trim().toUpperCase();
      const aPeriod = (a.period || '').trim().toLowerCase();
      const bPeriod = (b.period || '').trim().toLowerCase();
      if (aPeriod && bPeriod) {
        return sameTicker && aPeriod === bPeriod;
      }
      return sameTicker;
    };

    const updated = [newReport, ...savedReports.filter(r => r.id !== newReport.id && !isSameQuarter(r, newReport))];
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

    setStep((currentStep) => {
      if (currentStep !== 'report') {
        setPreviousNavState({ step: currentStep, analyzedTab });
      }
      return currentStep;
    });

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

  const handleOpenOrAnalyzeTicker = useCallback((sym: string) => {
    const cleanSym = (sym || '').trim().toUpperCase();
    if (!cleanSym) return;
    const existing = savedReports.find(r => r.ticker?.toUpperCase() === cleanSym);
    if (existing) {
      openReport(existing.id, cleanSym);
    } else {
      setTicker(cleanSym);
      handleBistDirectAnalysis(cleanSym);
    }
  }, [savedReports, openReport]);

  const renderAuthGate = (sectionTitle: string) => (
    <div className="min-h-[calc(100vh-220px)] flex flex-col justify-center items-center py-12 px-4">
      <div className="w-full max-w-md bg-[#151821] border border-[#232834] rounded-3xl p-8 sm:p-10 shadow-2xl text-center space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-[#1C202B] border border-[#2F3646] flex items-center justify-center mx-auto text-emerald-400 shadow-inner">
          <Lock className="w-6 h-6" />
        </div>
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2.5">
            ÜYELERE ÖZEL ERİŞİM
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight font-sans">
            {sectionTitle}
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-2 max-w-xs mx-auto font-sans leading-relaxed">
            Bu paneli görüntülemek ve tüm kurumsal analiz modellerine erişmek için üye girişi yapmanız gerekmektedir.
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={() => setIsLoginModalOpen(true)}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-950/40 cursor-pointer"
          >
            <User className="w-4 h-4" />
            <span>Giriş Yap / Ücretsiz Kayıt Ol</span>
          </button>
          <button
            type="button"
            onClick={handleDemoLogin}
            className="w-full py-2.5 px-4 bg-[#1C202B] hover:bg-[#232834] border border-[#2F3646] text-emerald-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Hızlı Demo Girişi (Misafir)</span>
          </button>
          <button
            type="button"
            onClick={() => navigateTo('input')}
            className="text-xs text-slate-400 hover:text-white transition cursor-pointer pt-1"
          >
            ← Ana Sayfaya Dön
          </button>
        </div>
      </div>
    </div>
  );

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
        dividend_history: data.dividend_history || enrichedExtractedData?.dividend_history || currentExtractedData?.dividend_history,
        consensus_target: data.consensus_target || enrichedExtractedData?.consensus_target || currentExtractedData?.consensus_target,
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
        dividendHistory: finalExtracted.dividend_history,
        consensusTarget: finalExtracted.consensus_target,
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

  const currentSector: SectorType = (() => {
    if (selectedSector !== 'AUTO') return selectedSector;
    const detected = detectSector(activeReport?.ticker || ticker, (activeReport as any)?.companyName || currentExtractedData?.company_name);
    if (detected && detected !== 'INDUSTRIAL') return detected;
    return activeReport?.sector || currentExtractedData?.sector || detected || 'INDUSTRIAL';
  })();

  const sectorMeta = SECTOR_DEFINITIONS[currentSector] || SECTOR_DEFINITIONS.INDUSTRIAL;

  const tickerHistory = activeReport 
    ? savedReports
        .filter(r => (r.ticker || '').trim().toUpperCase() === (activeReport.ticker || '').trim().toUpperCase())
        .sort((a, b) => (b.period || b.createdAt || '').localeCompare(a.period || a.createdAt || ''))
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
    drivers: drivers,
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
        <header className="h-14 border-b border-[#21262d] px-4 sm:px-6 flex items-center justify-between bg-[#111418] sticky top-0 z-40 print:hidden">
          {/* Sol: Logo + SimplyWallSt tarzı Navigasyon Menüsü */}
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <div 
              onClick={() => navigateTo('input')}
              role="button"
              tabIndex={0}
              title="Yeni Analiz Ekranına Dön"
              className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition select-none shrink-0"
            >
              <FairValueLogo className="w-6 h-6" />
              <span className="text-sm font-black text-white tracking-tight font-sans">
                FAIR <span className="text-emerald-400">VALUE</span>
              </span>
            </div>

            {/* Yatay Navigasyon Linkleri (Feed, Portföy, Favoriler, Discover, Screener) */}
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => navigateTo('saved')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  step === 'saved' && analyzedTab !== 'PORTFOLIO' && analyzedTab !== 'FAVORITES'
                    ? 'text-white font-bold bg-[#1e232d]'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24]'
                }`}
              >
                <span>Feed</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('portfolio')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  step === 'saved' && analyzedTab === 'PORTFOLIO'
                    ? 'text-[#f5c242] font-bold bg-[#1e232d]'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24]'
                }`}
              >
                <span>Portföy</span>
                {portfolioTickers.length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#21262d] text-[#f5c242] font-bold">
                    {portfolioTickers.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('favorites')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  step === 'saved' && analyzedTab === 'FAVORITES'
                    ? 'text-amber-400 font-bold bg-[#1e232d]'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24]'
                }`}
              >
                <span>Favoriler</span>
                {favoriteTickers.length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#21262d] text-amber-400 font-bold">
                    {favoriteTickers.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('themes')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  step === 'themes'
                    ? 'text-cyan-400 font-bold bg-[#1e232d]'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24]'
                }`}
              >
                <span>Discover</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('leaderboard')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  step === 'leaderboard'
                    ? 'text-amber-400 font-bold bg-[#1e232d]'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24]'
                }`}
              >
                <span>Screener</span>
              </button>
            </nav>
          </div>

          {/* Sağ: Arama Hapı (Ctrl K) + Bildirim + Tema + Kullanıcı Avatar / Giriş */}
          <div className="flex items-center gap-2.5">
            {/* Spotlight Arama Butonu (Ctrl + K) */}
            <button
              type="button"
              onClick={() => setIsSpotlightOpen(true)}
              className="flex items-center justify-between gap-3 bg-[#181b20] hover:bg-[#1f242c] border border-[#2b313d] hover:border-slate-500 py-1.5 px-3 rounded-full text-xs text-slate-400 transition cursor-pointer w-36 sm:w-52"
              title="Hızlı Şirket Arama (Ctrl + K)"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-slate-400 truncate">Search</span>
              </span>
              <kbd className="hidden sm:inline text-[10px] font-mono bg-[#21262d] px-1.5 py-0.5 rounded border border-[#2e3440] text-slate-400">
                Ctrl K
              </kbd>
            </button>

            {/* Bildirim Çanı */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsNotificationOpen(prev => !prev)}
                className="p-2 rounded-full hover:bg-[#1c2027] text-slate-400 hover:text-white transition cursor-pointer relative"
                title="Bildirimler"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#111418]" />
              </button>

              {isNotificationOpen && (
                <div 
                  className="absolute right-0 mt-2 w-72 bg-[#161a22] border border-[#2e3440] rounded-xl shadow-2xl p-3 z-50 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between font-bold text-white border-b border-[#282d37] pb-2">
                    <span>Sistem Bildirimleri</span>
                    <span className="text-[10px] font-mono text-emerald-400">Aktif</span>
                  </div>
                  <div className="space-y-2 text-slate-300">
                    <div className="p-2 rounded-lg bg-[#12151b] border border-[#282d37] space-y-1">
                      <div className="font-semibold text-white">BIST Resmi Çarpanları Senkronize</div>
                      <p className="text-[11px] text-slate-400">İş Yatırım 630 BIST şirketinin günlük çarpanları ve sektör ortalamaları günceldir.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tema Butonu */}
            <button
              type="button"
              onClick={toggleThemeMode}
              className="p-2 rounded-full hover:bg-[#1c2027] text-slate-400 hover:text-white transition cursor-pointer"
              title={themeMode === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
            >
              {themeMode === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {/* Kullanıcı Avatarı & Giriş Menüsü */}
            <div className="relative">
              {userSession ? (
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(prev => !prev)}
                  className="w-8 h-8 rounded-full bg-[#21262d] border border-[#383e4d] hover:border-emerald-400 text-xs font-bold text-white flex items-center justify-center transition cursor-pointer shadow-sm"
                  title={userSession.name}
                >
                  {userSession.initials}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(true)}
                  className="w-8 h-8 rounded-full bg-[#21262d] border border-[#383e4d] hover:border-emerald-400 text-xs font-bold text-slate-200 hover:text-white flex items-center justify-center transition cursor-pointer"
                  title="Giriş Yap"
                >
                  SE
                </button>
              )}

              {/* Kullanıcı Profil Menüsü Dropdown */}
              {isUserMenuOpen && userSession && (
                <div 
                  className="absolute right-0 mt-2 w-56 bg-[#161a22] border border-[#2e3440] rounded-xl shadow-2xl p-2 z-50 text-xs divide-y divide-[#282d37] animate-in fade-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-2.5">
                    <div className="font-bold text-white truncate">{userSession.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">{userSession.email}</div>
                    <div className="text-[10px] text-emerald-400 font-mono mt-1">{userSession.role}</div>
                  </div>
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => { navigateTo('portfolio'); setIsUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#21262d] text-left cursor-pointer"
                    >
                      <Briefcase className="w-3.5 h-3.5 text-[#f5c242]" />
                      <span>Portföyüm ({portfolioTickers.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { navigateTo('favorites'); setIsUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#21262d] text-left cursor-pointer"
                    >
                      <Star className="w-3.5 h-3.5 text-amber-400" />
                      <span>İzleme Listem ({favoriteTickers.length})</span>
                    </button>
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-rose-400 hover:bg-rose-500/10 text-left cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Çıkış Yap</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Yeni Analiz Butonu */}
            <button
              type="button"
              onClick={() => navigateTo('input')}
              className="hidden lg:flex items-center gap-1.5 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer ml-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Yeni Analiz</span>
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 w-full max-w-[1600px] mx-auto space-y-5">
          
          {/* ADIM 1: YENİ ANALİZ EKRANI (ŞİRKET DEĞERLEME & BİLANÇO ANALİZİ) */}
          {step === 'input' && (
            <div className="min-h-[calc(100vh-160px)] flex flex-col justify-center items-center py-6 sm:py-10 w-full">
              <div className="w-full max-w-2xl bg-[#151821] border border-[#232834] rounded-3xl shadow-2xl overflow-hidden divide-y divide-[#232834]">
                {/* Üst Bölüm: Hisse Kodu Arama & Hızlı Seçim */}
                <div className="p-6 sm:p-10 space-y-6 text-center">
                  <div className="flex flex-col items-center">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-sans">
                      Şirket Değerleme & Bilanço Analizi
                    </h1>
                    <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto mt-2 font-sans leading-relaxed">
                      Borsa İstanbul hisse kodunu girerek resmi finansal tabloları, içsel değer modellerini oluşturun.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 max-w-xl mx-auto">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                        placeholder="Hisse kodu (Örn: THYAO, TUPRS, AGESA, FROTO)"
                        className="w-full bg-[#0E1015] border border-[#2F3646] focus:border-emerald-500 rounded-xl pl-10 pr-4 py-3.5 text-sm text-white placeholder-slate-500 font-mono font-bold tracking-wider focus:outline-none transition shadow-inner"
                      />
                      {ticker && (
                        <button
                          type="button"
                          onClick={() => setTicker('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleBistDirectAnalysis()}
                      disabled={loading || !ticker.trim()}
                      className="px-7 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-40 cursor-pointer flex-shrink-0 shadow-lg shadow-emerald-950/40"
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

                  <div className="flex items-center justify-center gap-1.5 flex-wrap pt-1">
                    <span className="text-slate-500 text-xs font-medium mr-1.5 font-sans">
                      Popüler Şirketler:
                    </span>
                    {['THYAO', 'TUPRS', 'AGESA', 'FROTO', 'ASELS', 'EREGL', 'GARAN', 'BIMAS', 'SISE', 'KCHOL', 'VESBE'].map((sym) => (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => {
                          setTicker(sym);
                          handleBistDirectAnalysis(sym);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition cursor-pointer ${
                          ticker === sym
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 font-bold'
                            : 'bg-[#0E1015] hover:bg-[#1C202B] text-slate-300 border-[#232834]'
                        }`}
                      >
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Alt Bölüm: Opsiyonel PDF Doküman Entegrasyonu */}
                <div className="p-5 sm:p-7 bg-[#0E1015]/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 font-sans">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      Ek Dokümanlar (İsteğe Bağlı PDF)
                    </span>
                    {(activityFiles.length + presentationFiles.length) > 0 && (
                      <span className="text-[11px] text-emerald-400 font-mono font-bold">
                        {activityFiles.length + presentationFiles.length} PDF seçildi
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Faaliyet Raporu */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer.files) handleAddActivityFiles(e.dataTransfer.files);
                      }}
                      className="rounded-xl border border-[#232834] bg-[#0E1015] p-3.5 space-y-2 hover:border-[#2F3646] transition"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => activityInputRef.current?.click()}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activityInputRef.current?.click(); } }}
                        className="flex items-center justify-between cursor-pointer select-none text-xs text-slate-300 hover:text-white"
                      >
                        <span className="flex items-center gap-2 font-medium font-sans">
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
                        <div className="pt-2 border-t border-[#232834] max-h-20 overflow-y-auto space-y-1">
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
                      className="rounded-xl border border-[#232834] bg-[#0E1015] p-3.5 space-y-2 hover:border-[#2F3646] transition"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => presentationInputRef.current?.click()}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); presentationInputRef.current?.click(); } }}
                        className="flex items-center justify-between cursor-pointer select-none text-xs text-slate-300 hover:text-white"
                      >
                        <span className="flex items-center gap-2 font-medium font-sans">
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
                        <div className="pt-2 border-t border-[#232834] max-h-20 overflow-y-auto space-y-1">
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
                        <span className="text-slate-300 font-medium flex items-center gap-2 font-sans">
                          <RefreshCw className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                          {statusMessage || 'Veriler işleniyor...'}
                        </span>
                        <span className="font-mono text-emerald-400 font-bold">{pipelineProgress}%</span>
                      </div>
                      <div className="w-full bg-[#1C202B] rounded-full h-1.5 overflow-hidden">
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

          {/* ADIM 3: KURUMSAL HİSSE ANALİZİ (SIMPLY WALL ST MODU) */}
          {step === 'report' && activeReport && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 sm:px-5 flex flex-wrap items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleGoBack}
                    className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 text-sm font-semibold transition flex items-center gap-2 cursor-pointer"
                    title="Geri Dön"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Geri</span>
                  </button>
                  <div className="h-5 w-px bg-slate-800" />
                  <span className="text-base font-black font-mono text-white">{activeReport.ticker}</span>
                  <span className="text-sm font-mono px-2.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                    {sectorMeta.badge}
                  </span>
                  {(valuationInfo.is_value_trap || activeReport.isValueTrap) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-400 text-xs font-bold font-mono">
                      <ShieldAlert className="w-3.5 h-3.5" /> DEĞER TUZAĞI
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleCopyNotebookLM}
                    className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition cursor-pointer flex items-center justify-center"
                    title={copiedNotebookLM ? "Kopyalandı" : "Verileri Kopyala"}
                    aria-label="Verileri Kopyala"
                  >
                    {copiedNotebookLM ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-cyan-400" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteReport(activeReport.id)}
                    className="p-2 bg-slate-950 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800 transition cursor-pointer"
                    title="Raporu Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

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
                ttmChartData={ttmChartData}
                tickerHistory={tickerHistory}
                portfolioTickers={portfolioTickers}
                favoriteTickers={favoriteTickers}
                onTogglePortfolio={togglePortfolio}
                onToggleFavorite={toggleFavorite}
                onSwitchToTerminal={() => {}}
                onSelectTicker={(tk) => handleBistDirectAnalysis(tk)}
                onAnalyzeTicker={(tk) => {
                  setTicker(tk);
                  setStep('input');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onSelectReport={(id: string) => openReport(id)}
              />
            </div>
          )}

          {/* LİDERLİK & HİSSE SIRALAMA PANELİ (SCREENER) */}
          {step === 'leaderboard' && (() => {
            if (!userSession?.isLoggedIn) {
              return renderAuthGate('Hisse Sıralama Paneli');
            }

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
                    <h2 className="text-xl font-bold text-white tracking-tight font-sans">
                      Hisse Sıralama Paneli
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStep('input')}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-md font-sans"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Yeni Analiz</span>
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
                              onClick={() => openReport(item.id, item.ticker)}
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

          
          {/* YATIRIM TEMALARI & ŞİRKET RADAR PANELİ (DISCOVER) */}
          {step === 'themes' && (() => {
            if (!userSession?.isLoggedIn) {
              return renderAuthGate('Yatırım Temaları');
            }

            const allThemesList = Object.values(INVESTMENT_THEMES);
            const themeSummary = getThemeSummary(savedReports);

            // Kesişim (Intersection / AND) Filtrelemesi
            let displayedItems: Array<{ report: SavedReport; matches: CompanyThemeMatch[] }> = [];

            if (selectedThemeFilters.length === 0) {
              displayedItems = savedReports.map(report => ({
                report,
                matches: categorizeCompany(report)
              }));
            } else {
              displayedItems = savedReports
                .map(report => {
                  const matches = categorizeCompany(report);
                  const matchIds = matches.map(m => m.themeId);
                  const matchesAll = selectedThemeFilters.every(tid => matchIds.includes(tid));
                  if (!matchesAll) return null;
                  return { report, matches };
                })
                .filter((item): item is { report: SavedReport; matches: CompanyThemeMatch[] } => item !== null);
            }

            if (themeSearchTerm.trim()) {
              const q = themeSearchTerm.trim().toUpperCase();
              displayedItems = displayedItems.filter(({ report, matches }) => 
                report.ticker.toUpperCase().includes(q) ||
                getCompanySectorDisplayName(report.ticker, report.sector).toUpperCase().includes(q) ||
                ((report as any).companyName || report.extractedData?.company_name || '').toUpperCase().includes(q) ||
                matches.some(m => m.reason.toUpperCase().includes(q) || m.themeName.toUpperCase().includes(q))
              );
            }

            return (
              <div className="space-y-6">
                {/* Üst Başlık Banner */}
                <div className="bg-[#1a1e26] border border-[#2e3440] p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold font-sans text-white tracking-tight">
                      Yatırım Temaları
                    </h2>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative min-w-[220px]">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={themeSearchTerm}
                        onChange={(e) => setThemeSearchTerm(e.target.value)}
                        placeholder="Şirket veya kod ara..."
                        className="w-full bg-[#12151c] border border-[#2e3440] rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#f5c242] transition font-sans"
                      />
                    </div>

                    {/* Görünüm Değiştirici (Liste / Kartlar / Küçük Simgeler) */}
                    <div className="flex items-center bg-[#12151c] p-1 rounded-xl border border-[#2e3440] shrink-0">
                      <button
                        type="button"
                        title="Liste / Tablo Görünümü"
                        onClick={() => setDiscoverViewMode('list')}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${discoverViewMode === 'list' ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'}`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Kart Görünümü"
                        onClick={() => setDiscoverViewMode('cards')}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${discoverViewMode === 'cards' ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'}`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Küçük Simgeler (Kompakt Rozetler)"
                        onClick={() => setDiscoverViewMode('compact')}
                        className={`p-1.5 rounded-lg transition cursor-pointer ${discoverViewMode === 'compact' ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'}`}
                      >
                        <Grid className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tema Filtreleme Çipleri (TÜMÜ + Çoklu Seçim Temaları) */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
                  {/* TÜMÜ Butonu */}
                  <button
                    type="button"
                    onClick={() => setSelectedThemeFilters([])}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition whitespace-nowrap cursor-pointer border ${
                      selectedThemeFilters.length === 0
                        ? 'bg-[#f5c242] text-slate-950 border-[#f5c242] shadow-md font-bold'
                        : 'bg-[#1a1e26] text-slate-300 border-[#2e3440] hover:text-white hover:bg-[#21262d]'
                    }`}
                  >
                    <span>TÜMÜ</span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full font-bold ${
                      selectedThemeFilters.length === 0
                        ? 'bg-slate-950 text-[#f5c242]'
                        : 'bg-[#21262d] text-white border border-[#2e3440]'
                    }`}>
                      {savedReports.length}
                    </span>
                  </button>

                  {/* Çoklu Seçilebilir Tema Butonları */}
                  {allThemesList.map(theme => {
                    const count = themeSummary[theme.id as InvestmentThemeId]?.length || 0;
                    const isSelected = selectedThemeFilters.includes(theme.id as InvestmentThemeId);
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => {
                          setSelectedThemeFilters(prev => 
                            prev.includes(theme.id as InvestmentThemeId)
                              ? prev.filter(t => t !== theme.id)
                              : [...prev, theme.id as InvestmentThemeId]
                          );
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition whitespace-nowrap cursor-pointer border ${
                          isSelected
                            ? 'bg-[#f5c242] text-slate-950 border-[#f5c242] shadow-md font-bold'
                            : 'bg-[#1a1e26] text-slate-300 border-[#2e3440] hover:text-white hover:bg-[#21262d]'
                        }`}
                      >
                        {renderThemeIcon(theme.iconTag, "w-4 h-4")}
                        <span>{theme.shortLabel}</span>
                        <span className={`text-xs font-mono px-2 py-0.5 rounded-full font-bold ${
                          isSelected
                            ? 'bg-slate-950 text-[#f5c242]'
                            : count > 0 ? 'bg-[#21262d] text-white border border-[#2e3440]' : 'bg-[#12151c] text-slate-500'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Filtreleme Kriteri Bilgi Barı */}
                {selectedThemeFilters.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-[#1a1e26] border border-[#2e3440] flex items-center justify-between gap-4 text-xs font-sans text-slate-300 shadow-md">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-medium">Seçili Kapsam:</span>
                      <span className="text-white font-bold">Tüm Analiz Edilmiş Şirketler ({savedReports.length})</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-[#1a1e26] border border-[#2e3440] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shadow-md">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-400 font-medium">Seçili Kesişim ({selectedThemeFilters.length} Tema):</span>
                      {selectedThemeFilters.map(tid => {
                        const t = INVESTMENT_THEMES[tid];
                        return (
                          <span
                            key={tid}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#21262d] text-[#f5c242] border border-[#2e3440] font-mono font-bold"
                          >
                            {renderThemeIcon(t?.iconTag || 'zap', "w-3.5 h-3.5")}
                            <span>{t?.shortLabel || tid}</span>
                            <button
                              type="button"
                              onClick={() => setSelectedThemeFilters(prev => prev.filter(x => x !== tid))}
                              className="hover:text-white transition ml-1 cursor-pointer text-sm"
                              title="Kaldır"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedThemeFilters([])}
                      className="text-xs text-rose-400 hover:text-rose-300 font-bold transition cursor-pointer self-start md:self-auto font-sans"
                    >
                      Filtreleri Temizle (Tüm Şirketler)
                    </button>
                  </div>
                )}

                {/* Şirketler Görünümü: Boş Durum VEYA Seçili Görünüm Modu */}
                {displayedItems.length === 0 ? (
                  <div className="bg-[#1a1e26] border border-[#2e3440] rounded-2xl p-12 text-center text-slate-400 space-y-3">
                    <Compass className="w-12 h-12 mx-auto text-slate-600 opacity-60" />
                    <h4 className="text-base font-bold text-slate-200 font-sans">
                      Seçilen Filtre Kesişimine Uyan Şirket Bulunamadı
                    </h4>
                    <p className="text-sm text-slate-400 max-w-md mx-auto font-sans">
                      Seçtiğiniz temaların tümünü aynı anda sağlayan analiz edilmiş şirket bulunmuyor. Temaları tekil olarak deneyebilir veya filtreleri temizleyebilirsiniz.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedThemeFilters([])}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#f5c242] text-slate-950 font-bold rounded-xl text-sm transition cursor-pointer"
                    >
                      <span>Tüm Şirketleri Göster</span>
                    </button>
                  </div>
                ) : discoverViewMode === 'list' ? (
                  /* Liste / Tablo Görünümü */
                  <div className="bg-[#1a1e26] border border-[#2e3440] rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse font-sans">
                        <thead>
                          <tr className="border-b border-[#2e3440] bg-[#12151c]/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                            <th className="py-3.5 px-4">Şirket</th>
                            <th className="py-3.5 px-3">Sektör</th>
                            <th className="py-3.5 px-3 text-right">Fiyat</th>
                            <th className="py-3.5 px-3 text-right">Adil Değer</th>
                            <th className="py-3.5 px-3 text-center">Potansiyel</th>
                            <th className="py-3.5 px-3 text-center">Skor</th>
                            <th className="py-3.5 px-3 text-center">Karar</th>
                            <th className="py-3.5 px-4">Eşleşen Temalar</th>
                            <th className="py-3.5 px-4 text-center">İşlem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2e3440]/60 text-slate-300">
                          {displayedItems.map(({ report, matches }, idx) => {
                            const repVal = (report as any).valuation || report.extractedData?.valuation;
                            const fairVal = repVal?.fair_value || 0;
                            const priceNum = parseFloat(report.price || '0') || 0;
                            const discount = (fairVal > 0 && priceNum > 0)
                              ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                              : null;
                            const isAl = report.decision === 'AL';
                            const isAlma = report.decision === 'ALMA';
                            const companyName = (report as any).companyName || report.extractedData?.company_name || '';

                            return (
                              <tr
                                key={`${report.id}-table-${idx}`}
                                onClick={() => openReport(report.id, report.ticker)}
                                className="hover:bg-[#21262d] transition cursor-pointer group"
                              >
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-white group-hover:text-[#f5c242] transition">
                                      {report.ticker}
                                    </span>
                                    {companyName && (
                                      <span className="text-xs text-slate-400 truncate max-w-[160px] hidden sm:inline">
                                        {companyName}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3 font-mono text-xs text-slate-300">
                                  {getCompanySectorDisplayName(report.ticker, report.sector)}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-white">
                                  {priceNum > 0 ? `₺${priceNum.toFixed(2)}` : '—'}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                                  {fairVal > 0 ? `₺${fairVal.toFixed(2)}` : '—'}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {discount !== null ? (
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                                      discount >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                    }`}>
                                      {discount >= 0 ? `+${discount}%` : `${discount}%`}
                                    </span>
                                  ) : <span className="text-slate-500">—</span>}
                                </td>
                                <td className="py-3 px-3 text-center font-mono font-bold text-xs text-slate-200">
                                  {report.score ? `${report.score}/100` : '—'}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold border ${
                                    isAl ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                    isAlma ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                                    'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  }`}>
                                    {report.decision}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-300 max-w-[280px]">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {matches.map(m => (
                                      <span
                                        key={m.themeId}
                                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${m.badgeClass}`}
                                        title={m.reason}
                                      >
                                        {m.shortLabel}
                                      </span>
                                    ))}
                                    {matches.length === 0 && (
                                      <span className="text-slate-500 font-mono text-[11px]">Temel Analiz</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openReport(report.id, report.ticker);
                                    }}
                                    className="p-1.5 rounded-lg bg-[#21262d] hover:bg-[#f5c242] hover:text-slate-950 text-slate-300 transition cursor-pointer"
                                    title="Şirket Analizini Aç"
                                  >
                                    <ArrowUpRight className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : discoverViewMode === 'compact' ? (
                  /* Küçük Simgeler (Small Icons / Kompakt Rozetler) Görünümü */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {displayedItems.map(({ report, matches }, idx) => {
                      const repVal = (report as any).valuation || report.extractedData?.valuation;
                      const fairVal = repVal?.fair_value || 0;
                      const priceNum = parseFloat(report.price || '0') || 0;
                      const discount = (fairVal > 0 && priceNum > 0)
                        ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                        : null;
                      const isAl = report.decision === 'AL';
                      const isAlma = report.decision === 'ALMA';

                      return (
                        <div
                          key={`${report.id}-compact-${idx}`}
                          onClick={() => openReport(report.id, report.ticker)}
                          className="bg-[#1a1e26] hover:bg-[#21262d] border border-[#2e3440] hover:border-[#f5c242]/50 p-3.5 rounded-2xl transition cursor-pointer group flex flex-col justify-between space-y-2.5 shadow-md"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-black text-base text-white group-hover:text-[#f5c242] transition">
                              {report.ticker}
                            </span>
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              isAl ? 'bg-emerald-400' : isAlma ? 'bg-rose-400' : 'bg-amber-400'
                            }`} />
                          </div>

                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-slate-400 text-[11px] truncate max-w-[120px]">
                              {getCompanySectorDisplayName(report.ticker, report.sector)}
                            </span>
                            {discount !== null ? (
                              <span className={`font-bold ${discount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {discount >= 0 ? `+${discount}%` : `${discount}%`}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </div>

                          <div className="pt-2 border-t border-[#2e3440]/60 flex items-center justify-between text-[11px] font-mono">
                            <span className="text-white font-bold">{priceNum > 0 ? `₺${priceNum.toFixed(1)}` : '—'}</span>
                            {report.score ? (
                              <span className="text-slate-300 font-bold px-1.5 py-0.2 rounded bg-[#12151c] border border-[#2e3440]">
                                {report.score}p
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Kartlar Grid Görünümü */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayedItems.map(({ report, matches }, idx) => {
                      const repVal = (report as any).valuation || report.extractedData?.valuation;
                      const fairVal = repVal?.fair_value || 0;
                      const priceNum = parseFloat(report.price || '0') || 0;
                      const discount = (fairVal > 0 && priceNum > 0)
                        ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                        : null;
                      const isAl = report.decision === 'AL';
                      const isAlma = report.decision === 'ALMA';
                      const companyName = (report as any).companyName || report.extractedData?.company_name || '';

                      return (
                        <div
                          key={`${report.id}-theme-card-${idx}`}
                          className="p-5 rounded-2xl bg-[#1a1e26] border border-[#2e3440] hover:border-[#f5c242]/50 transition group flex flex-col justify-between space-y-4 shadow-lg"
                        >
                          <div className="space-y-3">
                            {/* Başlık Satırı */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-black text-white font-mono tracking-tight group-hover:text-[#f5c242] transition">
                                    {report.ticker}
                                  </span>
                                  <span className="text-xs text-slate-300 font-mono px-2 py-0.5 rounded bg-[#12151c] border border-[#2e3440]">
                                    {getCompanySectorDisplayName(report.ticker, report.sector)}
                                  </span>
                                </div>
                                {companyName && (
                                  <div className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5 font-sans">
                                    {companyName}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg font-mono border ${
                                  isAl ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                  isAlma ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                                  'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                }`}>
                                  {report.decision}
                                </span>
                                {report.score && (
                                  <span className="text-xs font-mono font-bold text-white bg-[#12151c] px-2.5 py-1 rounded-lg border border-[#2e3440]">
                                    {report.score}/100
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Fiyat & Adil Değer & Potansiyel Kutusu */}
                            <div className="grid grid-cols-3 divide-x divide-[#2e3440] py-2 px-3 bg-[#12151c] rounded-xl border border-[#2e3440] text-sm font-mono text-center">
                              <div>
                                <span className="text-slate-400 text-xs block font-sans">Fiyat</span>
                                <span className="text-white font-bold">{priceNum > 0 ? `₺${priceNum.toFixed(2)}` : '—'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block font-sans">Adil Değer</span>
                                <span className="text-emerald-400 font-bold">{fairVal > 0 ? `₺${fairVal.toFixed(2)}` : '—'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block font-sans">Potansiyel</span>
                                {discount !== null ? (
                                  <span className={`font-bold ${discount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {discount >= 0 ? `+${discount}%` : `${discount}%`}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </div>
                            </div>

                            {/* Eşleşen Temalar */}
                            {matches.length > 0 && (
                              <div className="p-3 rounded-xl bg-[#21262d] border border-[#2e3440] space-y-2">
                                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                                  Eşleşen Temalar ({matches.length})
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {matches.map(m => (
                                    <span
                                      key={m.themeId}
                                      className={`text-xs px-2 py-0.5 rounded-md border font-semibold ${m.badgeClass}`}
                                    >
                                      {m.shortLabel}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-xs text-slate-300 font-sans leading-relaxed pt-1 border-t border-[#2e3440]/60">
                                  {matches[0].reason}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* İncele Butonu */}
                          <button
                            type="button"
                            onClick={() => openReport(report.id, report.ticker)}
                            className="w-full py-2.5 bg-[#21262d] hover:bg-[#f5c242] hover:text-slate-950 text-slate-200 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 border border-[#2e3440] hover:border-[#f5c242] cursor-pointer"
                          >
                            <span>Şirket Analizini İncele</span>
                            <ArrowUpRight className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* FEED, PORTFÖY & FAVORİLER PANELLERİ */}
          {step === 'saved' && (() => {
            const isWatchlist = analyzedTab === 'FAVORITES';
            const isPortfolio = analyzedTab === 'PORTFOLIO';
            const isDashboard = !isWatchlist && !isPortfolio; // FEED PANELİ

            if (!userSession?.isLoggedIn) {
              if (isWatchlist) return renderAuthGate('Favoriler');
              if (isPortfolio) return renderAuthGate('Portföy');
              return renderAuthGate('Feed');
            }

            // ==========================================
            // 1. FEED PANELİ (KAP & BİST HABER AKIŞI)
            // ==========================================
            if (isDashboard) {
              const baseFeed = liveNewsFeed.length > 0 ? liveNewsFeed : getCompanyNewsFeed();
              const newsCategories = getNewsCategories(baseFeed);
              let newsFeed = baseFeed.filter(item => {
                if (newsCategoryFilter !== 'ALL' && item.category !== newsCategoryFilter) return false;
                return true;
              });

              if (newsSearchTerm.trim()) {
                const nq = newsSearchTerm.trim().toLowerCase();
                newsFeed = newsFeed.filter(item => 
                  item.ticker.toLowerCase().includes(nq) ||
                  item.companyName.toLowerCase().includes(nq) ||
                  item.title.toLowerCase().includes(nq) ||
                  item.summary.toLowerCase().includes(nq) ||
                  item.categoryLabel.toLowerCase().includes(nq)
                );
              }

              return (
                <div className="space-y-6">
                  {/* Feed Başlık Barı */}
                  <div className="bg-[#1a1e26] border border-[#2e3440] p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold font-sans text-white tracking-tight">
                          Feed
                        </h2>
                        {lastFeedSync && (
                          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                            Son Güncelleme: {lastFeedSync.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-300 mt-1 font-sans">
                        Analiz ettiğiniz şirketlerin resmi KAP bildirimleri ve fiyat-duyarlı finansal haber akışı.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={refreshLiveFeed}
                        disabled={isFeedLoading}
                        className="px-3 py-2 rounded-xl bg-[#12151c] hover:bg-[#21262d] border border-[#2e3440] text-xs font-sans text-slate-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                        title="KAP Bildirimlerini Yenile"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isFeedLoading ? 'animate-spin text-sky-400' : ''}`} />
                        <span>{isFeedLoading ? 'Yenileniyor...' : 'Yenile'}</span>
                      </button>

                      {/* Arama */}
                      <div className="relative min-w-[220px]">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={newsSearchTerm}
                          onChange={(e) => setNewsSearchTerm(e.target.value)}
                          placeholder="Haber veya hisse ara (Örn: THYAO)..."
                          className="w-full bg-[#12151c] border border-[#2e3440] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition font-sans"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Kategori Filtre Hapları */}
                  <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
                    {newsCategories.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setNewsCategoryFilter(cat.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer border ${
                          newsCategoryFilter === cat.id
                            ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                            : 'bg-[#12151c] text-slate-400 border-[#2e3440] hover:text-white'
                        }`}
                      >
                        <span>{cat.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 border border-[#2e3440]">
                          {cat.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Haber Kartları Akışı */}
                  {savedReports.length === 0 ? (
                    <div className="bg-[#1a1e26] border border-[#2e3440] rounded-2xl p-12 text-center text-slate-400 space-y-4">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                        <Newspaper className="w-7 h-7" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base font-bold text-white font-sans">
                          Henüz Analiz Edilmiş Şirket Bulunmuyor
                        </h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto font-sans leading-relaxed">
                          Feed panelinde yalnızca analiz ettiğiniz şirketlerin resmi KAP bildirimleri ve fiyat-duyarlı finansal gelişmeleri listelenir.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setStep('input'); setActiveReportId(null); }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition cursor-pointer font-sans shadow-lg shadow-sky-600/20"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Yeni Şirket Analiz Et</span>
                      </button>
                    </div>
                  ) : newsFeed.length === 0 ? (
                    <div className="bg-[#1a1e26] border border-[#2e3440] rounded-2xl p-12 text-center text-slate-400 space-y-3">
                      <Newspaper className="w-12 h-12 mx-auto text-slate-600 opacity-60" />
                      <h4 className="text-base font-bold text-slate-200 font-sans">
                        Yeni Bildirim Bulunmuyor
                      </h4>
                      <p className="text-sm text-slate-400 max-w-md mx-auto font-sans">
                        Analiz ettiğiniz şirketlere ait seçilen filtrede yeni bir KAP bildirimi bulunamadı.
                      </p>
                      <button
                        type="button"
                        onClick={() => { setNewsCategoryFilter('ALL'); setNewsSearchTerm(''); }}
                        className="px-4 py-2 bg-[#21262d] hover:bg-[#2e3440] text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer font-sans border border-[#2e3440]"
                      >
                        Filtreleri Sıfırla
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {newsFeed.map((item) => {
                        const iconEl = item.category === 'FINANCIALS' ? (
                          <FileText className="w-4 h-4 text-emerald-400" />
                        ) : item.category === 'DIVIDEND' ? (
                          <Coins className="w-4 h-4 text-emerald-400" />
                        ) : item.category === 'CONTRACT' ? (
                          <Briefcase className="w-4 h-4 text-emerald-400" />
                        ) : item.category === 'BUYBACK' ? (
                          <RefreshCw className="w-4 h-4 text-emerald-400" />
                        ) : item.category === 'INVESTMENT' ? (
                          <Building2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Megaphone className="w-4 h-4 text-slate-400" />
                        );

                        const iconBg = item.category === 'GENERAL'
                          ? 'bg-slate-800/60 border-slate-700/60'
                          : 'bg-emerald-500/10 border-emerald-500/30';

                        return (
                          <div
                            key={item.id}
                            onClick={() => setSelectedDisclosure(item)}
                            className="bg-[#181c24] hover:bg-[#1f242e] border border-[#2e3440] hover:border-emerald-500/40 rounded-2xl p-4 transition cursor-pointer flex items-start gap-3.5 group shadow-md"
                          >
                            {/* Sol Dairesel İkon (Image 2) */}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${iconBg}`}>
                              {iconEl}
                            </div>

                            {/* Sağ İçerik Alanı */}
                            <div className="flex-1 min-w-0 space-y-1.5">
                              {/* Üst Satır: Ticker • Kategori • Zaman • Etki Rozeti (Image 2) */}
                              <div className="flex items-center gap-2 flex-wrap text-xs">
                                <span className="font-mono font-black text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                  {item.ticker}
                                </span>
                                <span className="text-slate-500 text-xs">•</span>
                                <span className="font-sans font-medium text-slate-300 text-xs">
                                  {item.categoryLabel}
                                </span>
                                <span className="text-slate-500 text-xs">•</span>
                                <span className="font-sans text-slate-400 text-xs">
                                  {item.timeAgo}
                                </span>
                                {item.impact === 'HIGH_IMPACT' && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-sans font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                                    ⚡ Yüksek Etki
                                  </span>
                                )}
                                {item.impact === 'POSITIVE' && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-sans font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    ▲ Olumlu
                                  </span>
                                )}
                                {item.impact === 'NEGATIVE' && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-sans font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                    ▼ Olumsuz
                                  </span>
                                )}
                                {item.impact === 'NEUTRAL' && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-slate-800 text-slate-400 border border-slate-700/60">
                                    ● Nötr
                                  </span>
                                )}
                              </div>

                              {/* Başlık (Temiz, net, kurumsal başlık) */}
                              <h3 className="text-sm font-bold text-white font-sans group-hover:text-emerald-300 transition leading-snug">
                                {item.title}
                              </h3>

                              {/* Kilit Özet (Fiyat-Duyarlı Metrik Vurgulu, Başlığın Tekrarı ASLA Değil) */}
                              <p className="text-xs text-slate-400 font-sans leading-relaxed line-clamp-3">
                                {(() => {
                                  if (!item.summary) return null;
                                  const parts = item.summary.split(/(\*\*[^*]+\*\*)/g);
                                  return parts.map((part, idx) => {
                                    if (part.startsWith('**') && part.endsWith('**')) {
                                      return (
                                        <strong key={idx} className="font-bold text-white bg-slate-800/90 px-1 py-0.5 rounded border border-slate-700/60 inline-block my-0.5">
                                          {part.slice(2, -2)}
                                        </strong>
                                      );
                                    }
                                    return part;
                                  });
                                })()}
                              </p>

                              {/* Alt Bar: Doğrudan KAP & Bigpara Bildirimi Yönlendirmesi */}
                              <div className="flex items-center justify-between pt-2 border-t border-[#2e3440]/50 mt-1 flex-wrap gap-2">
                                <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>Resmi Bildirim</span>
                                </span>
                                <div className="flex items-center gap-3">
                                  {item.bigparaUrl && (
                                    <a
                                      href={item.bigparaUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 font-sans hover:underline"
                                      title="Bigpara üzerinde KAP tam metnini görüntüle"
                                    >
                                      <span>Bigpara Metni -&gt;</span>
                                    </a>
                                  )}
                                  <a
                                    href={item.kapUrl || item.url || getKapCompanyDisclosuresUrl(item.ticker)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-sky-400 hover:text-sky-300 font-sans hover:underline"
                                    title="Doğrudan KAP resmi bildirim sayfası"
                                  >
                                    <span>{item.kapId ? `KAP Bildirim #${item.kapId} ->` : 'KAP Bildirim ->'}</span>
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Detay Pop-Up Modal (Image 3) */}
                  {selectedDisclosure && (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
                      onClick={() => setSelectedDisclosure(null)}
                    >
                      <div
                        className="bg-[#12151c] border border-[#2e3440] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative flex flex-col md:flex-row gap-6 p-6 sm:p-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Kapat Butonu */}
                        <button
                          type="button"
                          onClick={() => setSelectedDisclosure(null)}
                          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white bg-[#1a1e26] border border-[#2e3440] hover:bg-[#252b36] transition cursor-pointer z-10"
                          title="Kapat"
                        >
                          <X className="w-5 h-5" />
                        </button>

                        {/* Sol / Ana Kolon (%65) */}
                        <div className="flex-1 space-y-5">
                          {/* Şirket Başlığı ve Üst Bilgi */}
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center font-black font-mono text-white text-sm shadow-md">
                              {selectedDisclosure.ticker.slice(0, 2)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-bold text-white font-sans">
                                  {selectedDisclosure.companyName}
                                </h4>
                                <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                  BIST:{selectedDisclosure.ticker}
                                </span>
                                {selectedDisclosure.impact === 'HIGH_IMPACT' && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-sans font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                                    ⚡ Yüksek Etki
                                  </span>
                                )}
                                {selectedDisclosure.impact === 'POSITIVE' && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-sans font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    ▲ Olumlu
                                  </span>
                                )}
                                {selectedDisclosure.impact === 'NEGATIVE' && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-sans font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                    ▼ Olumsuz
                                  </span>
                                )}
                                {selectedDisclosure.impact === 'NEUTRAL' && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-sans font-medium bg-slate-800 text-slate-400 border border-slate-700/60">
                                    ● Nötr
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 font-sans mt-0.5">
                                {selectedDisclosure.categoryLabel} • {selectedDisclosure.timeAgo}
                              </p>
                            </div>
                          </div>

                          {/* Büyük Başlık */}
                          <h2 className="text-xl sm:text-2xl font-bold font-sans text-white tracking-tight leading-tight">
                            {selectedDisclosure.title}
                          </h2>

                          {/* Kilit Çıkarımlar & Yapılandırılmış Maddeler (Image 3 tarzı) */}
                          <div className="space-y-3 pt-2">
                            <h5 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400">
                              Kilit Noktalar & Finansal Etki
                            </h5>
                            <div className="space-y-2.5">
                              {selectedDisclosure.keyTakeaways && selectedDisclosure.keyTakeaways.length > 0 ? (
                                selectedDisclosure.keyTakeaways.map((bullet, idx) => (
                                  <div key={idx} className="flex items-start gap-2.5 text-sm text-slate-300 leading-relaxed font-sans bg-[#181c24] p-3 rounded-xl border border-[#2e3440]/80">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 mt-2 shrink-0" />
                                    <span>
                                      {(() => {
                                        const parts = bullet.split(/(\*\*[^*]+\*\*)/g);
                                        return parts.map((part, pIdx) => {
                                          if (part.startsWith('**') && part.endsWith('**')) {
                                            return (
                                              <strong key={pIdx} className="font-bold text-white bg-slate-800/90 px-1 py-0.5 rounded border border-slate-700/60 inline-block my-0.5">
                                                {part.slice(2, -2)}
                                              </strong>
                                            );
                                          }
                                          return part;
                                        });
                                      })()}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="flex items-start gap-2.5 text-sm text-slate-300 leading-relaxed font-sans bg-[#181c24] p-3 rounded-xl border border-[#2e3440]/80">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 mt-2 shrink-0" />
                                  <span>{selectedDisclosure.summary}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Açıklama / Özet Kartı */}
                          <div className="p-4 rounded-xl bg-[#181c24] border border-[#2e3440] text-xs text-slate-300 font-sans leading-relaxed">
                            <p className="text-slate-400 text-[11px] font-mono mb-1.5 uppercase font-bold">KAP Açıklama Özeti:</p>
                            {(() => {
                              const parts = selectedDisclosure.summary.split(/(\*\*[^*]+\*\*)/g);
                              return parts.map((part, pIdx) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                  return (
                                    <strong key={pIdx} className="font-bold text-white bg-slate-800/90 px-1 py-0.5 rounded border border-slate-700/60 inline-block my-0.5">
                                      {part.slice(2, -2)}
                                    </strong>
                                  );
                                }
                                return part;
                              });
                            })()}
                          </div>

                          {/* Alt Butonlar: Doğrudan KAP & Bigpara Bağlantıları */}
                          <div className="pt-3 border-t border-[#2e3440] flex items-center gap-3 flex-wrap">
                            <a
                              href={selectedDisclosure.kapUrl || selectedDisclosure.url || getKapCompanyDisclosuresUrl(selectedDisclosure.ticker)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-sans font-bold text-xs transition cursor-pointer shadow-lg shadow-sky-600/20"
                            >
                              <span>
                                {selectedDisclosure.kapId ? `KAP Resmi Bildirimi Aç (#${selectedDisclosure.kapId})` : 'KAP Resmi Bildirimi Aç'}
                              </span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>

                            {selectedDisclosure.bigparaUrl && (
                              <a
                                href={selectedDisclosure.bigparaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-bold text-xs transition cursor-pointer shadow-lg shadow-emerald-600/20"
                              >
                                <span>Bigpara KAP Tam Metnini Oku</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                const t = selectedDisclosure.ticker;
                                setSelectedDisclosure(null);
                                handleOpenOrAnalyzeTicker(t);
                              }}
                              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a1e26] hover:bg-[#252b36] border border-[#2e3440] text-slate-200 hover:text-white font-sans font-bold text-xs transition cursor-pointer"
                            >
                              <span>{selectedDisclosure.ticker} Şirket Raporuna Git</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Sağ Yan Kolon (%35) - Şirket Kartı & İlgili Gelişmeler (Image 3) */}
                        <div className="w-full md:w-80 shrink-0 space-y-4 pt-4 md:pt-0 md:border-l md:border-[#2e3440] md:pl-6">
                          {/* Şirket Mini Değerleme Kartı */}
                          {(() => {
                            const report = savedReports.find(r => (r.ticker || '').toUpperCase() === selectedDisclosure.ticker.toUpperCase());
                            const priceNum = report ? parseFloat(report.price || '0') || 0 : 0;
                            const fairVal = report ? parseFloat(report.fairValue || '0') || 0 : 0;
                            const discount = (fairVal > 0 && priceNum > 0)
                              ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                              : null;
                            return (
                              <div className="p-4 rounded-xl bg-[#181c24] border border-[#2e3440] space-y-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="font-mono font-black text-sm text-white">
                                      {selectedDisclosure.ticker}
                                    </span>
                                    <p className="text-[11px] text-slate-400 font-sans truncate max-w-[160px]">
                                      {selectedDisclosure.companyName}
                                    </p>
                                  </div>
                                  {report?.decision && (
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold border ${
                                      report.decision === 'AL'
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                        : report.decision === 'ALMA'
                                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                    }`}>
                                      {report.decision}
                                    </span>
                                  )}
                                </div>

                                {report ? (
                                  <div className="space-y-2 pt-2 border-t border-[#2e3440]/60 text-xs">
                                    <div className="flex items-center justify-between text-slate-400">
                                      <span>Güncel Fiyat:</span>
                                      <span className="font-mono font-bold text-white">₺{report.price ?? '—'}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-slate-400">
                                      <span>Adil Değer:</span>
                                      <span className="font-mono font-bold text-emerald-400">₺{report.fairValue ?? '—'}</span>
                                    </div>
                                    {discount != null && (
                                      <div className="flex items-center justify-between text-slate-400">
                                        <span>Potansiyel:</span>
                                        <span className={`font-mono font-bold ${discount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                          {discount >= 0 ? `+%${discount}` : `-%${Math.abs(discount)}`}
                                        </span>
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const t = selectedDisclosure.ticker;
                                        setSelectedDisclosure(null);
                                        handleOpenOrAnalyzeTicker(t);
                                      }}
                                      className="w-full mt-2 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold font-sans transition cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      <span>Şirket Analizine Git</span>
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="pt-2 border-t border-[#2e3440]/60 space-y-2">
                                    <p className="text-xs text-slate-400 font-sans">
                                      Bu hisse henüz detaylı finansal analize alınmadı.
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const t = selectedDisclosure.ticker;
                                        setSelectedDisclosure(null);
                                        handleOpenOrAnalyzeTicker(t);
                                      }}
                                      className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold font-sans transition cursor-pointer"
                                    >
                                      Analiz Başlat
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Son Bildirimler / İlgili Gelişmeler Listesi */}
                          <div className="space-y-2.5">
                            <h5 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400">
                              Diğer Şirket Bildirimleri
                            </h5>
                            {(() => {
                              const otherUpdates = newsFeed.filter(n => n.id !== selectedDisclosure.id);
                              if (otherUpdates.length === 0) {
                                return (
                                  <p className="text-xs text-slate-500 font-sans">Başka bildirim bulunmuyor.</p>
                                );
                              }
                              return (
                                <div className="space-y-2">
                                  {otherUpdates.slice(0, 4).map(other => (
                                    <div
                                      key={other.id}
                                      onClick={() => setSelectedDisclosure(other)}
                                      className="p-3 rounded-xl bg-[#181c24] hover:bg-[#1f242e] border border-[#2e3440] hover:border-slate-500/50 transition cursor-pointer space-y-1 group"
                                    >
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="font-mono font-bold text-emerald-400">
                                          {other.ticker}
                                        </span>
                                        <span className="text-slate-500 font-sans">
                                          {other.timeAgo}
                                        </span>
                                      </div>
                                      <p className="text-xs font-bold text-slate-200 group-hover:text-white font-sans line-clamp-2 leading-snug">
                                        {other.title}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // ==========================================
            // 2. PORTFÖY & FAVORİLER LİSTESİ
            // ==========================================
            const portAll = savedReports.filter(r => portfolioTickers.includes((r.ticker || '').toUpperCase()));
            const portAl = portAll.filter(r => (r.decision || '').trim().toUpperCase() === 'AL');
            const portNotr = portAll.filter(r => {
              const d = (r.decision || '').trim().toUpperCase();
              return d === 'NÖTR' || d === 'NOTR';
            });
            const portAlma = portAll.filter(r => (r.decision || '').trim().toUpperCase() === 'ALMA');
            const favReports = savedReports.filter(r => favoriteTickers.includes((r.ticker || '').toUpperCase()));

            let baseList = isPortfolio
              ? (portfolioDecisionFilter === 'AL' 
                  ? portAl 
                  : portfolioDecisionFilter === 'NÖTR' 
                  ? portNotr 
                  : portfolioDecisionFilter === 'ALMA' 
                  ? portAlma 
                  : portAll)
              : favReports;

            if (analyzedSearch.trim()) {
              const q = analyzedSearch.trim().toUpperCase();
              baseList = baseList.filter(r => 
                (r.ticker || '').toUpperCase().includes(q) || 
                ((r as any).companyName || r.extractedData?.company_name || '').toUpperCase().includes(q)
              );
            }

            const sortedList = sidebarSort === 'rank' 
              ? sortReportsByScoreDesc(baseList) 
              : sortReportsByDate(baseList);

            const pageTitle = isPortfolio ? 'Portföy' : 'Favoriler';
            const pageDesc = isPortfolio
              ? 'Portföyünüze eklediğiniz hisselerin güncel değerleme modelleri, adil değer ve getiri takibi.'
              : 'Takip listenize aldığınız şirketler, potansiyel fırsatlar ve güncel rasyolar.';
            const currentViewMode = isPortfolio ? portfolioViewMode : watchlistViewMode;
            const setViewMode = isPortfolio ? setPortfolioViewMode : setWatchlistViewMode;

            return (
              <div className="space-y-6">
                {/* Üst Banner (Yedekle / Yükle / Yeni Analiz butonları tamamen kaldırıldı) */}
                <div className="bg-[#1a1e26] border border-[#2e3440] p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3.5 rounded-2xl bg-[#21262d] border border-[#2e3440]">
                      {isPortfolio ? (
                        <Briefcase className="w-7 h-7 text-[#f5c242]" />
                      ) : (
                        <Star className="w-7 h-7 text-amber-400 fill-amber-400/20" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-xl font-bold font-sans text-white tracking-tight">
                          {pageTitle}
                        </h2>
                        <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#21262d] text-emerald-400 border border-[#2e3440]">
                          {isPortfolio ? `${portAll.length} Şirket Portföyde` : `${favReports.length} Şirket Favorilerde`}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300 mt-1 font-sans">
                        {pageDesc}
                      </p>
                    </div>
                  </div>

                  {/* Görünüm Seçici (Liste / Kartlar / Küçük Simgeler) - Varsayılan: Liste */}
                  <div className="flex items-center bg-[#12151c] p-1 rounded-xl border border-[#2e3440] self-start md:self-auto">
                    <button
                      type="button"
                      title="Liste / Tablo Görünümü (Varsayılan)"
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded-lg transition cursor-pointer ${currentViewMode === 'list' ? (isPortfolio ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm' : 'bg-amber-400 text-slate-950 font-bold shadow-sm') : 'text-slate-400 hover:text-white'}`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="Kart Görünümü"
                      onClick={() => setViewMode('cards')}
                      className={`p-2 rounded-lg transition cursor-pointer ${currentViewMode === 'cards' ? (isPortfolio ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm' : 'bg-amber-400 text-slate-950 font-bold shadow-sm') : 'text-slate-400 hover:text-white'}`}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      title="Küçük Simgeler (Kompakt Rozetler)"
                      onClick={() => setViewMode('compact')}
                      className={`p-2 rounded-lg transition cursor-pointer ${currentViewMode === 'compact' ? (isPortfolio ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm' : 'bg-amber-400 text-slate-950 font-bold shadow-sm') : 'text-slate-400 hover:text-white'}`}
                    >
                      <Grid className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Filtre ve Arama Barı */}
                <div className="bg-[#1a1e26] border border-[#2e3440] p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Portföyde Karar Filtreleri (TÜMÜ, AL, NÖTR, ALMA) - Sadece portföye ekli olan şirketler */}
                  {isPortfolio ? (
                    <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
                      {[
                        { key: 'ALL', label: 'TÜMÜ', count: portAll.length, dot: 'bg-slate-400' },
                        { key: 'AL', label: 'AL', count: portAl.length, dot: 'bg-emerald-400', activeCls: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' },
                        { key: 'NÖTR', label: 'NÖTR', count: portNotr.length, dot: 'bg-amber-400', activeCls: 'border-amber-500/50 bg-amber-500/10 text-amber-300' },
                        { key: 'ALMA', label: 'ALMA', count: portAlma.length, dot: 'bg-rose-400', activeCls: 'border-rose-500/50 bg-rose-500/10 text-rose-300' },
                      ].map(tab => {
                        const isSelected = portfolioDecisionFilter === tab.key;
                        return (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setPortfolioDecisionFilter(tab.key as any)}
                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition cursor-pointer border ${
                              isSelected
                                ? tab.activeCls || 'border-[#f5c242]/50 bg-[#f5c242]/10 text-[#f5c242]'
                                : 'border-transparent text-slate-400 hover:text-white hover:bg-[#21262d]'
                            }`}
                          >
                            <span className={`w-2.5 h-2.5 rounded-full ${tab.dot}`} />
                            <span>{tab.label}</span>
                            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-[#12151c] border border-[#2e3440] text-slate-300">
                              {tab.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-300 font-sans font-semibold">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span>Favori Şirketleriniz</span>
                    </div>
                  )}

                  {/* Arama ve Sıralama */}
                  <div className="flex items-center gap-3">
                    <div className="relative min-w-[220px]">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={analyzedSearch}
                        onChange={(e) => setAnalyzedSearch(e.target.value)}
                        placeholder="Şirket veya kod ara..."
                        className="w-full bg-[#12151c] border border-[#2e3440] rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition font-sans"
                      />
                    </div>

                    <div className="flex items-center bg-[#12151c] p-1 rounded-xl border border-[#2e3440] text-sm">
                      <button
                        type="button"
                        onClick={() => setSidebarSort('rank')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer font-semibold ${
                          sidebarSort === 'rank'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Puana Göre
                      </button>
                      <button
                        type="button"
                        onClick={() => setSidebarSort('date')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer font-semibold ${
                          sidebarSort === 'date'
                            ? 'bg-[#2e3440] text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Tarihe Göre
                      </button>
                    </div>
                  </div>
                </div>

                {/* Şirketler Gösterimi (Boş Durum VEYA Seçili Görünüm Modu) */}
                {sortedList.length === 0 ? (
                  <div className="bg-[#1a1e26] border border-[#2e3440] rounded-2xl p-12 text-center text-slate-400 space-y-3">
                    <Building2 className="w-12 h-12 mx-auto text-slate-600 opacity-60" />
                    <h4 className="text-base font-bold text-slate-200 font-sans">
                      {isPortfolio 
                        ? 'Portföyünüzde Henüz Şirket Yok'
                        : 'Favori Listenizde Henüz Şirket Yok'}
                    </h4>
                    <p className="text-sm text-slate-400 max-w-md mx-auto font-sans">
                      {isPortfolio
                        ? 'Şirket analiz ekranında sol menüdeki "+ Portföy" butonuna tıklayarak hisseleri portföyünüze ekleyebilirsiniz.'
                        : 'Şirket analiz ekranında hisse kodunun yanındaki "★" butonuna tıklayarak hisseleri favori listenize alabilirsiniz.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigateTo('input')}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition cursor-pointer font-sans"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Yeni Şirket Analiz Et</span>
                    </button>
                  </div>
                ) : currentViewMode === 'list' ? (
                  /* Liste / Tablo Görünümü (Varsayılan) */
                  <div className="bg-[#1a1e26] border border-[#2e3440] rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse font-sans">
                        <thead>
                          <tr className="border-b border-[#2e3440] bg-[#12151c]/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                            <th className="py-3.5 px-4">Şirket</th>
                            <th className="py-3.5 px-3">Sektör</th>
                            <th className="py-3.5 px-3 text-right">Fiyat</th>
                            <th className="py-3.5 px-3 text-right">Adil Değer</th>
                            <th className="py-3.5 px-3 text-center">Potansiyel</th>
                            <th className="py-3.5 px-3 text-center">Skor</th>
                            <th className="py-3.5 px-3 text-center">Karar</th>
                            <th className="py-3.5 px-4 text-center">{isPortfolio ? 'Portföy' : 'Favori'}</th>
                            <th className="py-3.5 px-4 text-center">Aksiyon</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2e3440]/60 text-slate-300">
                          {sortedList.map((item) => {
                            const isAl = (item.decision || '').trim().toUpperCase() === 'AL';
                            const isAlma = (item.decision || '').trim().toUpperCase() === 'ALMA';
                            const repVal = (item as any).valuation || item.extractedData?.valuation;
                            const fairVal = parseFinancialNumber(item.fairValue ?? repVal?.composite_fair_value ?? repVal?.fair_value ?? repVal?.dcf_fair_value) || 0;
                            const priceNum = parseFloat(item.price || '0') || 0;
                            const discount = (fairVal > 0 && priceNum > 0)
                              ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                              : null;
                            const companyName = (item as any).companyName || item.extractedData?.company_name || '';

                            return (
                              <tr
                                key={item.id}
                                onClick={() => openReport(item.id, item.ticker)}
                                className="hover:bg-[#21262d] transition cursor-pointer group"
                              >
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-white group-hover:text-emerald-400 transition">
                                      {item.ticker}
                                    </span>
                                    {companyName && (
                                      <span className="text-xs text-slate-400 truncate max-w-[160px] hidden sm:inline">
                                        {companyName}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3 font-mono text-xs text-slate-300">
                                  {getCompanySectorDisplayName(item.ticker, item.sector)}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-white">
                                  {priceNum > 0 ? `₺${priceNum.toFixed(2)}` : '—'}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                                  {fairVal > 0 ? `₺${fairVal.toFixed(2)}` : '—'}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {discount !== null ? (
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                                      discount >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                    }`}>
                                      {discount >= 0 ? `+${discount}%` : `${discount}%`}
                                    </span>
                                  ) : <span className="text-slate-500">—</span>}
                                </td>
                                <td className="py-3 px-3 text-center font-mono font-bold text-xs text-slate-200">
                                  {item.score ? `${item.score}/100` : '—'}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold border ${
                                    isAl ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                                    isAlma ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                                    'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  }`}>
                                    {item.decision || 'NÖTR'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  {isPortfolio ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        togglePortfolio(item.ticker);
                                      }}
                                      className="p-1 rounded-lg text-[#f5c242] hover:text-rose-400 transition cursor-pointer"
                                      title="Portföyden Çıkar"
                                    >
                                      <Briefcase className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleFavorite(item.ticker);
                                      }}
                                      className="p-1 rounded-lg text-amber-400 hover:text-rose-400 transition cursor-pointer"
                                      title="Favorilerden Çıkar"
                                    >
                                      <Star className="w-4 h-4 fill-amber-400" />
                                    </button>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openReport(item.id, item.ticker);
                                    }}
                                    className="p-1.5 rounded-lg bg-[#21262d] hover:bg-emerald-500 hover:text-slate-950 text-slate-300 transition cursor-pointer"
                                    title="Şirket Analizini Aç"
                                  >
                                    <ArrowUpRight className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : currentViewMode === 'compact' ? (
                  /* Küçük Simgeler (Small Icons / Kompakt Rozetler) Görünümü */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {sortedList.map((item) => {
                      const isAl = (item.decision || '').trim().toUpperCase() === 'AL';
                      const isAlma = (item.decision || '').trim().toUpperCase() === 'ALMA';
                      const repVal = (item as any).valuation || item.extractedData?.valuation;
                      const fairVal = parseFinancialNumber(item.fairValue ?? repVal?.composite_fair_value ?? repVal?.fair_value ?? repVal?.dcf_fair_value) || 0;
                      const priceNum = parseFloat(item.price || '0') || 0;
                      const discount = (fairVal > 0 && priceNum > 0)
                        ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                        : null;

                      return (
                        <div
                          key={item.id}
                          onClick={() => openReport(item.id, item.ticker)}
                          className="bg-[#1a1e26] hover:bg-[#21262d] border border-[#2e3440] hover:border-emerald-500/50 p-3.5 rounded-2xl transition cursor-pointer group flex flex-col justify-between space-y-2.5 shadow-md"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-black text-base text-white group-hover:text-emerald-400 transition">
                              {item.ticker}
                            </span>
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              isAl ? 'bg-emerald-400' : isAlma ? 'bg-rose-400' : 'bg-amber-400'
                            }`} />
                          </div>

                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-slate-400 text-[11px] truncate max-w-[120px]">
                              {getCompanySectorDisplayName(item.ticker, item.sector)}
                            </span>
                            {discount !== null ? (
                              <span className={`font-bold ${discount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {discount >= 0 ? `+${discount}%` : `${discount}%`}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </div>

                          <div className="pt-2 border-t border-[#2e3440]/60 flex items-center justify-between text-[11px] font-mono">
                            <span className="text-white font-bold">{priceNum > 0 ? `₺${priceNum.toFixed(1)}` : '—'}</span>
                            {item.score ? (
                              <span className="text-slate-300 font-bold px-1.5 py-0.2 rounded bg-[#12151c] border border-[#2e3440]">
                                {item.score}p
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Standart Kartlar Grid Görünümü */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedList.map((item) => {
                      const isAl = (item.decision || '').trim().toUpperCase() === 'AL';
                      const isAlma = (item.decision || '').trim().toUpperCase() === 'ALMA';
                      const badgeCls = isAl
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : isAlma
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-400';

                      const repVal = (item as any).valuation || item.extractedData?.valuation;
                      const fairVal = parseFinancialNumber(item.fairValue ?? repVal?.composite_fair_value ?? repVal?.fair_value ?? repVal?.dcf_fair_value) || 0;
                      const priceNum = parseFloat(item.price || '0') || 0;
                      const discount = (fairVal > 0 && priceNum > 0)
                        ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                        : null;
                      const companyName = (item as any).companyName || item.extractedData?.company_name || '';
                      const inPort = portfolioTickers.includes((item.ticker || '').toUpperCase());
                      const inFav = favoriteTickers.includes((item.ticker || '').toUpperCase());

                      return (
                        <div
                          key={item.id}
                          onClick={() => openReport(item.id, item.ticker)}
                          className="bg-[#1a1e26] hover:bg-[#21262d] border border-[#2e3440] hover:border-emerald-500/50 rounded-2xl p-5 transition cursor-pointer flex flex-col justify-between space-y-4 group shadow-lg"
                        >
                          <div className="space-y-3">
                            {/* Başlık: Ticker, Şirket Adı, Karar Rozeti ve Hızlı Butonlar */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-black text-lg text-white group-hover:text-emerald-400 transition">
                                    {item.ticker}
                                  </span>
                                  {item.period && (
                                    <span className="text-xs font-mono text-slate-300 bg-[#12151c] px-2 py-0.5 rounded-md border border-[#2e3440]">
                                      {item.period}
                                    </span>
                                  )}
                                  <span className="text-xs font-mono text-slate-400 bg-[#12151c] px-2 py-0.5 rounded-md border border-[#2e3440]">
                                    {getCompanySectorDisplayName(item.ticker, item.sector)}
                                  </span>
                                </div>
                                {companyName && (
                                  <div className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5 font-sans">
                                    {companyName}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(item.ticker);
                                  }}
                                  title={inFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                    inFav
                                      ? 'bg-amber-400/20 text-amber-300 border-amber-400/50 hover:bg-amber-400/30'
                                      : 'bg-[#12151c] text-slate-400 hover:text-white border-[#2e3440] hover:bg-[#21262d]'
                                  }`}
                                >
                                  <Star className={`w-3.5 h-3.5 ${inFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePortfolio(item.ticker);
                                  }}
                                  title={inPort ? 'Portföyden Çıkar' : 'Portföye Ekle'}
                                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                    inPort
                                      ? 'bg-[#f5c242]/20 text-[#f5c242] border-[#f5c242]/50 hover:bg-[#f5c242]/30 font-bold'
                                      : 'bg-[#12151c] text-slate-400 hover:text-white border-[#2e3440] hover:bg-[#21262d]'
                                  }`}
                                >
                                  <Briefcase className="w-3.5 h-3.5" />
                                </button>

                                <div className={`px-2.5 py-1 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 ${badgeCls}`}>
                                  <span>{item.decision || 'NÖTR'}</span>
                                  <span className="w-1 h-3 bg-current opacity-30" />
                                  <span>{item.score ? `${item.score}/100` : '—'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Fiyat & Adil Değer & Potansiyel Kutusu */}
                            <div className="grid grid-cols-3 divide-x divide-[#2e3440] py-2 px-3 bg-[#12151c] rounded-xl border border-[#2e3440] text-sm font-mono text-center">
                              <div>
                                <span className="text-slate-400 text-xs block font-sans">Fiyat</span>
                                <span className="text-white font-bold">{priceNum > 0 ? `₺${priceNum.toFixed(2)}` : '—'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block font-sans">Adil Değer</span>
                                <span className="text-emerald-400 font-bold">{fairVal > 0 ? `₺${fairVal.toFixed(2)}` : '—'}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-xs block font-sans">Potansiyel</span>
                                {discount !== null ? (
                                  <span className={`font-bold ${discount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {discount >= 0 ? `+${discount}%` : `${discount}%`}
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </div>
                            </div>

                            <div className="text-xs text-slate-500 flex items-center justify-between font-mono pt-1">
                              <span>Kayıt: {item.createdAt || '—'}</span>
                            </div>
                          </div>

                          {/* Alt Aksiyon Butonları */}
                          <div className="flex items-center gap-2 pt-2 border-t border-[#2e3440]">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openReport(item.id, item.ticker);
                              }}
                              className="flex-1 py-2 bg-[#21262d] group-hover:bg-emerald-600 group-hover:text-white text-slate-200 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 border border-[#2e3440] group-hover:border-emerald-500 cursor-pointer"
                            >
                              <span>Analizi Aç</span>
                              <ArrowUpRight className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteReport(item.id, e);
                              }}
                              title="Analizi Sil"
                              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl border border-transparent hover:border-rose-500/30 transition cursor-pointer"
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

      {/* Yatırımcı Giriş & Kayıt Modalı */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={(session) => {
          setUserSession(session);
        }}
      />

      {/* Global Spotlight Arama (Ctrl + K) */}
      <SpotlightSearch
        isOpen={isSpotlightOpen}
        onClose={() => setIsSpotlightOpen(false)}
        savedReports={savedReports}
        onSelectReport={(reportId, tickerSym) => openReport(reportId, tickerSym)}
        onAnalyzeTicker={(tickerSym) => handleBistDirectAnalysis(tickerSym)}
      />

    </div>
  );
}
