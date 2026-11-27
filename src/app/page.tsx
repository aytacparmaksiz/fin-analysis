'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  Send, FileText, FileSpreadsheet, Presentation, AlertTriangle, Database, 
  RefreshCw, Printer, PlusCircle, Plus, History, Clock,
  ChevronRight, ChevronDown, ChevronUp, UploadCloud, X, CheckCircle2, Search,
  TrendingUp, BarChart3, Target, Calendar, ArrowUpRight, ArrowDownRight, Minus,
  DollarSign, ShieldCheck, ShieldAlert, Activity, Layers, Download, Upload,
  Trophy, Award, Trash2, ArrowUpDown, Filter, Copy, Percent, PieChart, Info,
  PanelLeftClose, PanelLeftOpen, Pin, PinOff, Bookmark, Building2,
  Check, Rocket, Gem, Shield, Sun, Moon, Compass, SlidersHorizontal, Scale, ArrowRight, ArrowLeft, Sparkles,
  Briefcase, Star, Bell, User, LogOut, LayoutGrid, List, Grid, Lock, Newspaper, Radio, ExternalLink, Coins, Megaphone
} from 'lucide-react';

import LoginModal, { type UserSession } from './components/login-modal';
import SpotlightSearch from './components/spotlight-search';
import MarketCockpit from './components/market-cockpit';
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
  getSectorDefinition,
  isMetricDisabled,
  getFinancialArchetype,
  SECTOR_ARCHETYPE_CONFIGS,
  getCompanySectorDisplayName,
  ISYATIRIM_53_OFFICIAL_SECTOR_NAMES,
  USER_OFFICIAL_BIST_COMPANY_SECTORS,
  getScoreColorStyle
} from '@/lib/sectors';

import {
  SavedReport,
  formatAnalysisDate,
  parseNumericScore,
  formatCanonicalScore,
  mergeAnalysisHistorySnapshots,
} from '@/lib/report-resolver';
import {
  resolveReportAttribution,
  type PeriodChangeAttribution,
} from '@/lib/batch-delta';
export type { SavedReport };
import { loadReportsCache, saveReportsCache } from '@/lib/report-cache';
import { parseApiResponse } from '@/lib/api-response';
import { generateFullAuditMarkdown } from '@/lib/export-markdown';
import {
  categorizeCompany,
  getThemeSummary,
  INVESTMENT_THEMES,
  type InvestmentThemeId,
  type CompanyThemeMatch
} from '@/lib/company-categorizer';
import {
  buildForensicPortfolioPlan,
  computeCapitalAllocationPlan,
  DEFAULT_PORTFOLIO_ARCHITECT_CONFIG,
  PORTFOLIO_ARCHITECT_PRESETS,
  type PortfolioArchitectConfig,
  type PortfolioPresetId,
  type ForensicPortfolioCandidate,
  type CapitalAllocationPlanResult,
  type SavedPositionInput,
  type PortfolioTargetStatus
} from '@/lib/portfolio-architect';

import {
  computeSectorValuationAndDrivers,
  enrichAndSanitizeFinancialHistory,
  extractValuationFromReportText,
  parseFinancialNumber,
  parsePeriodSortKey,
  getLatestReportsPerTicker,
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
  syncReportTextWithValuation
} from '@/lib/valuation';
import { OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE } from '@/lib/isyatirim-multiples-cache';
import { OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE } from '@/lib/isyatirim-sector-averages-cache';
import { OFFICIAL_ISYATIRIM_COMPANY_DETAILS_BASELINE } from '@/lib/isyatirim-company-details-cache';
import { 
  FinancialRatioEngine, 
  type UnifiedFinancialMetrics,
  computeFinancialChange,
  type FinancialMetricSemantics,
  type FinancialChangeResult
} from '@/lib/ratio-engine';
import { extractSmartFinancialText, extractSmartDocumentText, splitScannedPdfIntoChunks, DocumentCategory } from '@/lib/pdf-filter';
import {
  OFFICIAL_BIST_30_TICKERS,
  OFFICIAL_BIST_100_TICKERS,
  isBist30,
  isBist50,
  isBist100,
  isBistNon100,
  matchesIndexFilter,
  getBistIndexBadge,
  type LeaderboardIndexFilter
} from '@/lib/bist-indices';

/**
 * Şirketin resmi sektörüne göre tutarlı pastel/kurumsal 2 harfli monogram renk stili döndürür.
 */
function getSectorMonogramCls(ticker: string, sector?: string): string {
  const sec = (getCompanySectorDisplayName(ticker, sector) || sector || '').toLocaleUpperCase('tr-TR');
  if (/BANK|SİGORTA|SIGORTA|FİNANS|FINANS|ARACI|FACTOR|LEAS/.test(sec)) {
    return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35';
  }
  if (/YAZILIM|BİLİŞİM|BILISIM|TEKNOLOJİ|TEKNOLOJI|TELEKOM|SAVUNMA/.test(sec)) {
    return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35';
  }
  if (/PERAKENDE|GIDA|İÇECEK|ICECEK|SAĞLIK|SAGLIK|İLAÇ|ILAC|MAĞAZA/.test(sec)) {
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';
  }
  if (/ENERJİ|ENERJI|PETROL|KIMYA|KİMYA|HOLDİNG|HOLDING/.test(sec)) {
    return 'bg-sky-500/15 text-sky-300 border-sky-500/35';
  }
  return 'bg-amber-500/15 text-amber-300 border-amber-500/35';
}

/**
 * Kayıtlı analizleri (SavedReport) en son matematiksel değerleme motoru, IVS 105 standartları
 * ve resmi temettü kütüğüyle otomatik olarak uzlaştırır (reconcile).
 * Böylece motor veya formüllerde yapılan tüm güncellemeler, kullanıcının daha önce kaydettiği
 * tüm analizlerin özet kartlarına (Hisse Tarama, Akış vb.) anında ve otomatik olarak yansır.
 */
// createdAt "23 Ekim 2026 12:30" gibi yerelleştirilmiş metin olabildiğinden Date() ile ayrıştırılamaz (NaN).
// Sıralama için güvenilir zaman damgası: extractedData.saved_at (ISO) > updatedAt (bulut) > createdAt.
function reportTimestamp(r: any): number {
  const cands = [r?.extractedData?.saved_at, r?.updatedAt, r?.createdAt];
  for (const c of cands) {
    const ms = typeof c === 'string' ? Date.parse(c) : NaN;
    if (!Number.isNaN(ms)) return ms;
  }
  return 0;
}

function findLatestReportByTicker(list: SavedReport[], sym: string): SavedReport | undefined {
  const clean = (sym || '').trim().replace(/\.IS$/i, '').toUpperCase();
  if (!clean || !Array.isArray(list) || list.length === 0) return undefined;
  let best: SavedReport | undefined;
  let bestP = -1;
  let bestTs = -1;
  for (const r of list) {
    if ((r.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase() !== clean) continue;
    const p = parsePeriodSortKey(r.period || r.extractedData?.reporting_period || '');
    const ts = reportTimestamp(r);
    if (!best || p > bestP || (p === bestP && ts > bestTs)) {
      best = r;
      bestP = p;
      bestTs = ts;
    }
  }
  return best;
}

function reconcileSavedReportWithLatestEngine(rep: SavedReport): SavedReport {
  if (!rep) return rep;
  const upperTicker = (rep.ticker || '').toUpperCase();
  const baselineDivs = upperTicker ? OFFICIAL_ISYATIRIM_COMPANY_DETAILS_BASELINE[upperTicker]?.dividends : null;
  const updatedReport: SavedReport = { ...rep };

  if (Array.isArray(baselineDivs) && baselineDivs.length > 0) {
    updatedReport.dividendHistory = baselineDivs;
  }

  // 100% İş Yatırım Resmi Sektör Yetkilendirmesi (Tüm BIST Şirketleri İçin)
  const validSectorsList: SectorType[] = [
    'INSURANCE', 'BANKING', 'HOLDING', 'REIT', 'TECH', 'INDUSTRIAL',
    'RETAIL', 'AVIATION', 'UTILITIES_TELCO', 'HEALTHCARE', 'FINANCIAL_SERVICES'
  ];
  const existingSavedSector = (
    rep.extractedData?.sector ||
    (rep as any)?.extracted_data?.sector ||
    rep.sector
  ) as SectorType | undefined;
  const isOfficialBistTicker = Boolean(
    upperTicker && (USER_OFFICIAL_BIST_COMPANY_SECTORS[upperTicker] || OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[upperTicker])
  );
  const canonicalSector: SectorType = isOfficialBistTicker
    ? (detectSector(upperTicker, (rep as any)?.companyName || rep.extractedData?.company_name) || 'INDUSTRIAL')
    : (existingSavedSector && validSectorsList.includes(existingSavedSector))
      ? existingSavedSector
      : (detectSector(upperTicker, (rep as any)?.companyName || rep.extractedData?.company_name) || 'INDUSTRIAL');

  updatedReport.sector = canonicalSector;
  if (updatedReport.extractedData) {
    updatedReport.extractedData = {
      ...updatedReport.extractedData,
      sector: canonicalSector,
    };
  }

  // Sermaye Artırımı / Bedelsiz Bölünme Senkronizasyonu (Örn. ORGE 80M -> 400M)
  const isyBaseline = upperTicker ? OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[upperTicker] : null;
  if (isyBaseline?.paidInCapitalMnTl && isyBaseline.paidInCapitalMnTl > 0 && updatedReport.extractedData) {
    const liveShares = Math.round(isyBaseline.paidInCapitalMnTl * 1_000_000);
    const existingShares = Number(String(updatedReport.extractedData.share_count || '').replace(/[^0-9]/g, ''));
    if (!existingShares || Math.abs(existingShares - liveShares) / Math.min(existingShares, liveShares) > 0.05) {
      updatedReport.extractedData.share_count = String(liveShares);
      updatedReport.extractedData.shares_outstanding = liveShares;
    }
  }

  if (updatedReport.extractedData && Array.isArray(updatedReport.extractedData.financial_history) && updatedReport.extractedData.financial_history.length > 0) {
    try {
      const sanitized = enrichAndSanitizeFinancialHistory({
        ...updatedReport.extractedData,
        sector: canonicalSector,
        currency: updatedReport.extractedData.currency || 'TRY'
      });
      if (Array.isArray(sanitized?.financial_history)) {
        updatedReport.extractedData.financial_history = sanitized.financial_history;
      }
      const valRes = computeSectorValuationAndDrivers(updatedReport.extractedData, rep.price, canonicalSector);
      if (valRes?.valuation?.fair_value && valRes.valuation.fair_value > 0) {
        updatedReport.fairValue = `${valRes.valuation.fair_value.toFixed(2)} TL`;
      }
      if (valRes?.valuation && updatedReport.extractedData) {
        const syncedFinalDecision =
          valRes.optimization?.finalDecision ||
          valRes.valuation.final_decision ||
          valRes.valuation.decision ||
          updatedReport.decision;
        updatedReport.extractedData.valuation = {
          ...(updatedReport.extractedData.valuation || {}),
          ...valRes.valuation,
          final_decision: syncedFinalDecision,
          decision: syncedFinalDecision,
          override_reason: valRes.optimization?.overrideReason ?? undefined,
        };
        if (!valRes.optimization?.overrideReason) {
          delete (updatedReport.extractedData.valuation as any).override_reason;
        }
      }
      if (valRes?.optimization && updatedReport.extractedData) {
        (updatedReport.extractedData as any).optimization = valRes.optimization;
      }
      if (valRes?.drivers && updatedReport.extractedData) {
        updatedReport.extractedData.fair_value_drivers = valRes.drivers;
        updatedReport.extractedData.drivers = valRes.drivers;
      }
      if (valRes?.scoreResult?.totalScore != null) {
        updatedReport.score = `${valRes.scoreResult.totalScore}/100`;
      }
      if (valRes?.optimization?.finalDecision) {
        updatedReport.decision = valRes.optimization.finalDecision;
        updatedReport.overrideReason = valRes.optimization.overrideReason;
        updatedReport.conditionalWarnings = valRes.optimization.conditionalWarnings;
        updatedReport.isGreyZone = valRes.optimization.isGreyZone;
        updatedReport.marginOfSafetyStatus = valRes.optimization.marginOfSafetyStatus;
      }
      if (valRes?.valuation?.is_value_trap !== undefined) {
        updatedReport.isValueTrap = valRes.valuation.is_value_trap;
        updatedReport.valueTrapReasons = valRes.valuation.value_trap_reasons;
        updatedReport.valueTrapSeverity = valRes.valuation.value_trap_severity;
      }
      if (valRes?.valuation?.fair_value_trend) {
        updatedReport.fairValueTrend = valRes.valuation.fair_value_trend;
      }
      if (valRes?.valuation && updatedReport.report) {
        updatedReport.report = syncReportTextWithValuation(
          updatedReport.report,
          {
            ...(valRes.valuation || {}),
            final_decision: valRes.optimization?.finalDecision || updatedReport.decision,
            decision: valRes.optimization?.finalDecision || updatedReport.decision,
            scoreResult: valRes.scoreResult
          },
          valRes.scoreResult,
          valRes.drivers,
          parseFinancialNumber(rep.price) ?? 0,
          updatedReport.extractedData
        );
      }

      // İş Yatırım ve Piyasa Çarpanları Senkronizasyonu:
      // Eğer rapordaki market_multiples daha eski bir çeyreğe aitse veya baseline'da güncel çeyrek varsa yenile
      if (updatedReport.extractedData) {
        const ext = updatedReport.extractedData;
        const lastHistPeriod = ext.financial_history?.[ext.financial_history.length - 1]?.period;
        const repPeriodKey = parsePeriodSortKey(ext.reporting_period || lastHistPeriod || '');
        const multPeriodKey = parsePeriodSortKey(ext.market_multiples?.last_period || '');
        const baselinePeriodKey = parsePeriodSortKey(isyBaseline?.lastPeriod || '');

        if (isyBaseline && baselinePeriodKey >= repPeriodKey && (!multPeriodKey || baselinePeriodKey > multPeriodKey)) {
          ext.market_multiples = {
            ...(ext.market_multiples || {}),
            pe: isyBaseline.pe,
            pb: isyBaseline.pb,
            ev_ebitda: isyBaseline.evEbitda,
            ev_sales: isyBaseline.evSales,
            market_cap_mn_tl: isyBaseline.marketCapMnTl,
            last_period: isyBaseline.lastPeriod,
            sector_name: isyBaseline.sectorName || ext.market_multiples?.sector_name
          };
        } else if (ext.market_multiples && repPeriodKey > 0 && multPeriodKey > 0 && multPeriodKey < repPeriodKey) {
          const dynMultiples = FinancialRatioEngine.computeMetrics({
            ticker: upperTicker,
            history: ext.financial_history || [],
            currentPrice: parseFinancialNumber(rep.price) || 0,
            shareCount: Number(ext.share_count || ext.shares_outstanding || 0),
            sector: canonicalSector,
            marketMultiples: null,
            currency: ext.currency || 'TRY'
          });
          if (dynMultiples?.valuation) {
            ext.market_multiples.ev_ebitda = dynMultiples.valuation.evEbitda;
            ext.market_multiples.pe = dynMultiples.valuation.pe;
            ext.market_multiples.pb = dynMultiples.valuation.pb;
            ext.market_multiples.ev_sales = dynMultiples.valuation.evSales;
            ext.market_multiples.last_period = ext.reporting_period || lastHistPeriod;
          }
        }
      }
    } catch (err) {
      console.warn('Reconcile error for', rep.ticker, err);
    }
  }

  return updatedReport;
}

// Yatırım Teması İkonu Render Yardımcısı
function renderThemeIcon(iconTag: string, className: string = "w-3.5 h-3.5") {
  switch (iconTag) {
    case 'Rocket': return <Rocket className={className} />;
    case 'Gem': return <Gem className={className} />;
    case 'Shield': return <Shield className={className} />;
    case 'RefreshCw': return <RefreshCw className={className} />;
    case 'Zap': return <Activity className={className} />;
    case 'DollarSign': return <DollarSign className={className} />;
    case 'AlertTriangle': return <AlertTriangle className={className} />;
    default: return <Compass className={className} />;
  }
}

// 53 Resmi Sektör İçin İş Yatırım Çarpan Ortalaması Eşleştirici
const SECTOR_AVG_LIST = Object.values(OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE);
function findOfficialSectorAverage(sectorDisplayName: string) {
  const norm = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü0-9]+/g, ' ').trim();
  const target = norm(sectorDisplayName);
  if (!target) return null;
  const exact = SECTOR_AVG_LIST.find(item => norm(item.sectorName) === target);
  if (exact) return exact;
  return SECTOR_AVG_LIST.find(item => {
    const cand = norm(item.sectorName);
    return cand.length >= 3 && (target.includes(cand) || cand.includes(target));
  }) || null;
}

// Fiyat-duyarlı **kalın** metrik vurgularını React öğelerine dönüştürür
function renderHighlightedFinancialText(text: string) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong
          key={idx}
          className="font-mono font-bold text-white bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700/70 inline-block mx-0.5"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

// KAP bildirim kartları ve kök detay modalı için ortak semantik görsel kimlik çözümleyici
function getDisclosureVisualStyle(item: CompanyNewsItem) {
  const ev = item.eventType;
  if (item.impact === 'NEGATIVE' || ev === 'PENALTY') {
    return {
      icon: <ShieldAlert className="w-4 h-4 text-rose-400" />,
      iconBg: 'bg-rose-500/12 border-rose-500/35',
      accentBar: 'bg-gradient-to-b from-rose-500 to-red-600',
      topBar: 'bg-gradient-to-r from-rose-500 to-red-600',
      hoverCls: 'fv-card-rose',
      dotCls: 'bg-rose-400',
      headerTint: 'from-rose-500/12 via-rose-500/5 to-transparent border-rose-500/25',
      badgeCls: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
      badgeText: item.impactLabel || 'Olumsuz / Risk'
    };
  }
  if (ev === 'CONTRACT' || item.category === 'CONTRACT') {
    return {
      icon: <Briefcase className="w-4 h-4 text-emerald-400" />,
      iconBg: 'bg-emerald-500/12 border-emerald-500/35',
      accentBar: 'bg-gradient-to-b from-emerald-400 to-teal-500',
      topBar: 'bg-gradient-to-r from-emerald-400 to-teal-500',
      hoverCls: 'fv-card-emerald',
      dotCls: 'bg-emerald-400',
      headerTint: 'from-emerald-500/12 via-emerald-500/5 to-transparent border-emerald-500/25',
      badgeCls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
      badgeText: item.impactLabel || 'Yüksek Etki / Sözleşme'
    };
  }
  if (ev === 'DIVIDEND' || item.category === 'DIVIDEND') {
    return {
      icon: <Coins className="w-4 h-4 text-[#f5c242]" />,
      iconBg: 'bg-[#f5c242]/12 border-[#f5c242]/35',
      accentBar: 'bg-gradient-to-b from-[#f5c242] to-amber-500',
      topBar: 'bg-gradient-to-r from-[#f5c242] to-amber-500',
      hoverCls: 'fv-card-amber',
      dotCls: 'bg-[#f5c242]',
      headerTint: 'from-amber-500/12 via-amber-500/5 to-transparent border-amber-500/25',
      badgeCls: 'bg-[#f5c242]/15 text-[#f5c242] border-[#f5c242]/35',
      badgeText: item.impactLabel || 'Temettü & Sermaye'
    };
  }
  if (ev === 'BUYBACK' || item.category === 'BUYBACK') {
    return {
      icon: <RefreshCw className="w-4 h-4 text-teal-400" />,
      iconBg: 'bg-teal-500/12 border-teal-500/35',
      accentBar: 'bg-gradient-to-b from-teal-400 to-emerald-500',
      topBar: 'bg-gradient-to-r from-teal-400 to-emerald-500',
      hoverCls: 'fv-card-emerald',
      dotCls: 'bg-teal-400',
      headerTint: 'from-teal-500/12 via-teal-500/5 to-transparent border-teal-500/25',
      badgeCls: 'bg-teal-500/15 text-teal-300 border-teal-500/35',
      badgeText: item.impactLabel || 'Olumlu / Geri Alım'
    };
  }
  if (ev === 'FINANCIALS' || ev === 'OPERATIONAL' || item.category === 'FINANCIALS') {
    return {
      icon: ev === 'OPERATIONAL' ? <BarChart3 className="w-4 h-4 text-sky-400" /> : <FileText className="w-4 h-4 text-sky-400" />,
      iconBg: 'bg-sky-500/12 border-sky-500/35',
      accentBar: 'bg-gradient-to-b from-sky-400 to-blue-500',
      topBar: 'bg-gradient-to-r from-sky-400 to-blue-500',
      hoverCls: 'fv-card-sky',
      dotCls: 'bg-sky-400',
      headerTint: 'from-sky-500/12 via-sky-500/5 to-transparent border-sky-500/25',
      badgeCls: item.impact === 'HIGH_IMPACT'
        ? 'bg-sky-500/15 text-sky-300 border-sky-500/35'
        : 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30',
      badgeText: item.impactLabel || 'Finansal Sonuç'
    };
  }
  if (ev === 'INVESTMENT' || item.category === 'INVESTMENT') {
    return {
      icon: <Building2 className="w-4 h-4 text-cyan-400" />,
      iconBg: 'bg-cyan-500/12 border-cyan-500/35',
      accentBar: 'bg-gradient-to-b from-cyan-400 to-sky-500',
      topBar: 'bg-gradient-to-r from-cyan-400 to-sky-500',
      hoverCls: 'fv-card-sky',
      dotCls: 'bg-cyan-400',
      headerTint: 'from-cyan-500/12 via-cyan-500/5 to-transparent border-cyan-500/25',
      badgeCls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35',
      badgeText: item.impactLabel || 'Olumlu / Yatırım'
    };
  }
  if (ev === 'RATING') {
    return {
      icon: <Award className="w-4 h-4 text-purple-400" />,
      iconBg: 'bg-purple-500/12 border-purple-500/35',
      accentBar: 'bg-gradient-to-b from-purple-400 to-indigo-500',
      topBar: 'bg-gradient-to-r from-purple-400 to-indigo-500',
      hoverCls: 'fv-card-purple',
      dotCls: 'bg-purple-400',
      headerTint: 'from-purple-500/12 via-purple-500/5 to-transparent border-purple-500/25',
      badgeCls: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
      badgeText: item.impactLabel || 'Derecelendirme'
    };
  }
  if (ev === 'DEBT') {
    return {
      icon: <Scale className="w-4 h-4 text-indigo-400" />,
      iconBg: 'bg-indigo-500/12 border-indigo-500/35',
      accentBar: 'bg-gradient-to-b from-indigo-400 to-slate-500',
      topBar: 'bg-gradient-to-r from-indigo-400 to-slate-500',
      hoverCls: 'fv-card-purple',
      dotCls: 'bg-indigo-400',
      headerTint: 'from-indigo-500/10 via-indigo-500/4 to-transparent border-indigo-500/25',
      badgeCls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      badgeText: item.impactLabel || 'Finansman / Kupon'
    };
  }
  return {
    icon: ev === 'GOVERNANCE' ? <Shield className="w-4 h-4 text-slate-300" /> : <Megaphone className="w-4 h-4 text-slate-300" />,
    iconBg: 'bg-slate-800/80 border-slate-700/70',
    accentBar: 'bg-slate-600',
    topBar: 'bg-slate-600',
    hoverCls: 'fv-card-sky',
    dotCls: 'bg-slate-400',
    headerTint: 'from-slate-700/15 via-slate-800/5 to-transparent border-[#2e3440]',
    badgeCls: 'bg-slate-800/90 text-slate-300 border-slate-700/70',
    badgeText: item.impactLabel || 'Bilgilendirme'
  };
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
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
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
          result[field] = Math.max(0, Math.round(item[field] / Math.max(1, info.q)));
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

function sanitizeHistoryData(history: any[], debtInfo: any = {}, sector: SectorType = 'INDUSTRIAL', referencePrice: number = 100, currency: string = 'TRY') {
  if (!Array.isArray(history) || history.length === 0) return [];

  // enrichAndSanitizeFinancialHistory ile tam deterministik türetme ve TMS 29 homojenizasyonu
  const payload = {
    sector,
    currency: currency || 'TRY',
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

function formatScore(score: any): string {
  const num = parseNumericScore(score);
  if (num === null || !Number.isFinite(num)) return '—';
  return `${num}/100`;
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
  const backupFileInputRef = useRef<HTMLInputElement>(null);
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

  // Aşama durumu: Yalnızca kayıtlı rapor varsa 'report', aksi halde doğrudan 'cockpit' (Piyasa Kokpiti Ana Ekran)
  const [step, setStep] = useState<'cockpit' | 'input' | 'review' | 'report' | 'leaderboard' | 'themes' | 'saved' | 'sectors'>(
    defaultReport ? 'report' : 'cockpit'
  );
  const stepRef = useRef(step);
  stepRef.current = step;
  const isHandlingPopStateRef = useRef(false);
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
  const [leaderboardIndexFilter, setLeaderboardIndexFilter] = useState<LeaderboardIndexFilter>('ALL');
  const [leaderboardSort, setLeaderboardSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });
  const [leaderboardViewMode, setLeaderboardViewMode] = useState<'list' | 'icons'>('list');
  const [leaderboardSubTab, setLeaderboardSubTab] = useState<'SCREENER' | 'BATCH_CHANGES'>('SCREENER');
  const [batchScope, setBatchScope] = useState<'OUTDATED_QUARTER' | 'PORTFOLIO' | 'FAVORITES' | 'BIST30' | 'BIST100' | 'ALL_SAVED'>('OUTDATED_QUARTER');
  const [batchOnlyNewQuarter, setBatchOnlyNewQuarter] = useState<boolean>(true);
  const [batchChangeFilter, setBatchChangeFilter] = useState<'ALL' | 'UPGRADED' | 'DOWNGRADED' | 'SCORE_UP' | 'SCORE_DOWN'>('ALL');
  const [batchChangeSearch, setBatchChangeSearch] = useState<string>('');
  const [expandedDeltaTickers, setExpandedDeltaTickers] = useState<Record<string, boolean>>({});
  const batchAbortRef = useRef<AbortController | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    running: boolean;
    total: number;
    processed: number;
    updated: number;
    skipped: number;
    failed: number;
    currentTickers: string[];
    results: Array<{
      ticker: string;
      status: 'UPDATED' | 'SKIPPED_SAME_PERIOD' | 'FAILED';
      prevPeriod?: string | null;
      newPeriod?: string | null;
      error?: string;
    }>;
  }>({
    running: false,
    total: 0,
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    currentTickers: [],
    results: [],
  });

  const stopBatchQuarterRefresh = useCallback(() => {
    if (batchAbortRef.current) {
      batchAbortRef.current.abort();
      batchAbortRef.current = null;
    }
    setBatchProgress(prev => ({ ...prev, running: false, currentTickers: [] }));
  }, []);

  const startBatchQuarterRefresh = useCallback(async (targetTickersInput: string[]) => {
    const cleanList = Array.from(
      new Set(
        targetTickersInput
          .map(t => String(t || '').trim().replace(/\.IS$/i, '').toUpperCase())
          .filter(Boolean)
      )
    );
    if (cleanList.length === 0) return;

    if (batchAbortRef.current) {
      batchAbortRef.current.abort();
    }
    const controller = new AbortController();
    batchAbortRef.current = controller;

    setBatchProgress({
      running: true,
      total: cleanList.length,
      processed: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      currentTickers: cleanList.slice(0, 3),
      results: [],
    });

    const CHUNK_SIZE = 3;
    for (let i = 0; i < cleanList.length; i += CHUNK_SIZE) {
      if (controller.signal.aborted) break;
      const chunk = cleanList.slice(i, i + CHUNK_SIZE);
      setBatchProgress(prev => ({ ...prev, currentTickers: chunk }));

      let json: any = null;
      let chunkErrMsg = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        if (controller.signal.aborted) break;
        try {
          const res = await fetch('/api/batch-refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fin-analiz-client' },
            body: JSON.stringify({ tickers: chunk, onlyNewQuarter: batchOnlyNewQuarter }),
            signal: controller.signal,
          });
          if (res.status === 429 && attempt === 0) {
            const waitSec = Math.min(8, Math.max(2, Number(res.headers.get('retry-after') || 3)));
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }
          json = await res.json().catch(() => null);
          if (!res.ok) {
            chunkErrMsg = json?.error || `HTTP ${res.status}`;
          }
          break;
        } catch (err: any) {
          if (err?.name === 'AbortError') break;
          chunkErrMsg = err?.message || 'Ağ hatası';
        }
      }

      if (controller.signal.aborted) break;

      const chunkResults: any[] = Array.isArray(json?.results)
        ? json.results
        : chunk.map(tk => ({ ticker: tk, status: 'FAILED', error: chunkErrMsg || 'İşlem başarısız.' }));

      const updatedReports: SavedReport[] = [];
      let updCnt = 0;
      let skipCnt = 0;
      let failCnt = 0;
      const formattedItems: Array<{
        ticker: string;
        status: 'UPDATED' | 'SKIPPED_SAME_PERIOD' | 'FAILED';
        prevPeriod?: string | null;
        newPeriod?: string | null;
        error?: string;
      }> = [];

      for (const item of chunkResults) {
        if (item?.status === 'UPDATED' && item?.report) {
          updCnt++;
          updatedReports.push(reconcileSavedReportWithLatestEngine(item.report as SavedReport));
          formattedItems.push({
            ticker: item.ticker,
            status: 'UPDATED',
            prevPeriod: item.prevPeriod || null,
            newPeriod: item.newPeriod || null,
          });
        } else if (item?.status === 'SKIPPED_SAME_PERIOD') {
          skipCnt++;
          formattedItems.push({
            ticker: item.ticker,
            status: 'SKIPPED_SAME_PERIOD',
            prevPeriod: item.prevPeriod || null,
            newPeriod: item.newPeriod || null,
          });
        } else {
          failCnt++;
          formattedItems.push({
            ticker: item?.ticker || '?',
            status: 'FAILED',
            error: item?.error || chunkErrMsg || 'Güncellenemedi',
          });
        }
      }

      if (updatedReports.length > 0) {
        setSavedReports(prev => {
          const byTicker = new Map<string, SavedReport>();
          for (const r of prev) {
            const sym = (r.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase();
            if (sym) byTicker.set(sym, r);
          }
          for (const u of updatedReports) {
            const sym = (u.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase();
            if (sym) byTicker.set(sym, u);
          }
          const next = Array.from(byTicker.values());
          saveReportsCache(next);
          return next;
        });
      }

      setBatchProgress(prev => ({
        ...prev,
        processed: Math.min(prev.total, prev.processed + chunk.length),
        updated: prev.updated + updCnt,
        skipped: prev.skipped + skipCnt,
        failed: prev.failed + failCnt,
        results: [...formattedItems, ...prev.results].slice(0, 120),
      }));
    }

    if (batchAbortRef.current === controller) {
      batchAbortRef.current = null;
    }
    setBatchProgress(prev => ({ ...prev, running: false, currentTickers: [] }));
  }, [batchOnlyNewQuarter]);
  const [themesSort, setThemesSort] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({});
  const [sectorSearchTerm, setSectorSearchTerm] = useState<string>('');
  const [sectorFilterTab, setSectorFilterTab] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [sectorSortMode, setSectorSortMode] = useState<'count' | 'score' | 'upside' | 'alpha'>('count');

  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [isCloudConfigured, setIsCloudConfigured] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [savedReports, setSavedReports] = useState<SavedReport[]>(defaultReport ? [defaultReport] : []);
  const [activeReportId, setActiveReportId] = useState<string | null>(defaultReport ? defaultReport.id : null);
  const activeReport = useMemo(() => {
    if (step !== 'report') {
      return null;
    }
    if (activeReportId) {
      const found = savedReports.find(r => r.id === activeReportId);
      if (found) return found;
    }
    const currentTicker = (ticker || initialTicker || '').trim().replace(/\.IS$/i, '').toUpperCase();
    if (currentTicker) {
      const byTicker = findLatestReportByTicker(savedReports, currentTicker);
      if (byTicker) return byTicker;
    }
    if (defaultReport && currentTicker && defaultReport.ticker?.replace(/\.IS$/i, '').toUpperCase() === currentTicker) {
      return defaultReport;
    }
    // ASLA başka bir şirketin raporuna otomatik olarak atlama
    return null;
  }, [step, savedReports, activeReportId, ticker, initialTicker, defaultReport]);

  // Analiz Edilen Şirketler Sekme & Filtre Durumu
  const [analyzedTab, setAnalyzedTab] = useState<'ALL' | 'PORTFOLIO' | 'FAVORITES' | 'AL' | 'NÖTR' | 'ALMA'>('ALL');
  const [analyzedSearch, setAnalyzedSearch] = useState('');

  // Rapor öncesi gezinti durumu (Geri butonuna basıldığında gelinen ekrana dönebilmek için)
  const [previousNavState, setPreviousNavState] = useState<{
    step: 'cockpit' | 'input' | 'review' | 'report' | 'leaderboard' | 'themes' | 'saved' | 'sectors';
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
  const [favoritesDecisionFilter, setFavoritesDecisionFilter] = useState<'ALL' | 'AL' | 'NÖTR' | 'ALMA'>('ALL');
  const [savedTableSort, setSavedTableSort] = useState<{ key: 'score' | 'ticker' | 'price' | 'fairValue' | 'discount' | 'decision' | 'date'; direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });
  const [quickAddOpen, setQuickAddOpen] = useState<boolean>(false);
  const [quickAddQuery, setQuickAddQuery] = useState<string>('');
  const [newsCategoryFilter, setNewsCategoryFilter] = useState<string>('ALL');
  const [newsImpactFilter, setNewsImpactFilter] = useState<'ALL' | 'HIGH_IMPACT' | 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'>('ALL');
  const [newsSearchTerm, setNewsSearchTerm] = useState<string>('');
  const [liveNewsFeed, setLiveNewsFeed] = useState<CompanyNewsItem[]>([]);
  const [selectedDisclosure, setSelectedDisclosure] = useState<CompanyNewsItem | null>(null);
  const [isHydratingDisclosure, setIsHydratingDisclosure] = useState<boolean>(false);
  const [copiedDisclosureText, setCopiedDisclosureText] = useState<boolean>(false);
  const [isFeedLoading, setIsFeedLoading] = useState<boolean>(false);
  const [lastFeedSync, setLastFeedSync] = useState<Date | null>(null);

  // Portföy ve Favoriler Listeleri (localStorage'a kalıcı kaydedilir)
  const [portfolioTickers, setPortfolioTickers] = useState<string[]>([]);
  const [favoriteTickers, setFavoriteTickers] = useState<string[]>([]);
  const [portfolioWorkspaceTab, setPortfolioWorkspaceTab] = useState<'holdings' | 'architect'>('holdings');
  const [architectConfig, setArchitectConfig] = useState<PortfolioArchitectConfig>(DEFAULT_PORTFOLIO_ARCHITECT_CONFIG);
  const [architectTierFilter, setArchitectTierFilter] = useState<'MODEL' | 'ROTATION' | 'ALL_LAYERS' | 'NOTR_AUDIT'>('MODEL');
  const [isArchitectFiltersOpen, setIsArchitectFiltersOpen] = useState<boolean>(false);
  const [isHoldingsCapitalOpen, setIsHoldingsCapitalOpen] = useState<boolean>(true);
  const [topUpAppliedNotice, setTopUpAppliedNotice] = useState<string | null>(null);
  const [portfolioCapitalState, setPortfolioCapitalState] = useState<{
    initialCapitalTry: number;
    topUpCapitalTry: number;
    allocationMode: 'initial' | 'topup';
    topUpStrategy: 'smart_rebalance' | 'proportional';
    positions: Record<string, SavedPositionInput>;
  }>({
    initialCapitalTry: 100000,
    topUpCapitalTry: 50000,
    allocationMode: 'initial',
    topUpStrategy: 'smart_rebalance',
    positions: {},
  });

  const [livePriceMap, setLivePriceMap] = useState<Record<string, number>>({});
  const [livePriceUpdatedAt, setLivePriceUpdatedAt] = useState<string | null>(null);
  const [isRefreshingLivePrices, setIsRefreshingLivePrices] = useState<boolean>(false);
  const hasAutoFetchedLivePricesRef = useRef<boolean>(false);

  const refreshLivePrices = useCallback(async () => {
    if (isRefreshingLivePrices) return;
    const uniqueTickers = Array.from(
      new Set(
        savedReports
          .map(r => String(r.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase())
          .filter(Boolean)
      )
    );
    if (uniqueTickers.length === 0) return;
    setIsRefreshingLivePrices(true);
    try {
      const queryUrl =
        uniqueTickers.length <= 350
          ? `/api/live-prices?tickers=${encodeURIComponent(uniqueTickers.join(','))}`
          : '/api/live-prices';
      const res = await fetch(queryUrl, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && json.prices && typeof json.prices === 'object') {
        setLivePriceMap(json.prices);
        setLivePriceUpdatedAt(typeof json.updatedAt === 'string' ? json.updatedAt : new Date().toISOString());
      }
    } catch (err) {
      console.warn('[ModelPortfoy] Canlı BIST fiyat güncelleme hatası:', err);
    } finally {
      setIsRefreshingLivePrices(false);
    }
  }, [isRefreshingLivePrices, savedReports]);

  useEffect(() => {
    if (
      step === 'saved' &&
      (analyzedTab === 'PORTFOLIO' || analyzedTab === 'FAVORITES') &&
      savedReports.length > 0 &&
      !hasAutoFetchedLivePricesRef.current &&
      Object.keys(livePriceMap).length === 0
    ) {
      hasAutoFetchedLivePricesRef.current = true;
      void refreshLivePrices();
    }
  }, [step, analyzedTab, savedReports.length, livePriceMap, refreshLivePrices]);

  const forensicPortfolioPlan = useMemo(() => {
    return buildForensicPortfolioPlan(savedReports, portfolioTickers, architectConfig, livePriceMap);
  }, [savedReports, portfolioTickers, architectConfig, livePriceMap]);

  const modelAllocationPlan = useMemo(() => {
    return computeCapitalAllocationPlan({
      holdings: forensicPortfolioPlan.modelPortfolio,
      mode: portfolioCapitalState.allocationMode,
      initialCapitalTry: portfolioCapitalState.initialCapitalTry,
      topUpCapitalTry: portfolioCapitalState.topUpCapitalTry,
      topUpStrategy: portfolioCapitalState.topUpStrategy,
      savedPositions: portfolioCapitalState.positions,
      maxSingleStockWeightPct: architectConfig.maxSingleStockWeightPct,
      cashReserveWeightPct: forensicPortfolioPlan.cashReserveWeightPct,
    });
  }, [
    forensicPortfolioPlan.modelPortfolio,
    forensicPortfolioPlan.cashReserveWeightPct,
    portfolioCapitalState,
    architectConfig.maxSingleStockWeightPct,
  ]);

  const portfolioHoldingCandidates = useMemo(() => {
    const out: ForensicPortfolioCandidate[] = [];
    const seen = new Set<string>();
    for (const rawTk of portfolioTickers) {
      const sym = String(rawTk || '').trim().replace(/\.IS$/i, '').toUpperCase();
      if (!sym || seen.has(sym)) continue;
      seen.add(sym);
      const cand = forensicPortfolioPlan.candidatesByTicker[sym];
      if (cand) out.push(cand);
    }
    return out;
  }, [portfolioTickers, forensicPortfolioPlan.candidatesByTicker]);

  const holdingsAllocationPlan = useMemo(() => {
    return computeCapitalAllocationPlan({
      holdings: portfolioHoldingCandidates,
      mode: portfolioCapitalState.allocationMode,
      initialCapitalTry: portfolioCapitalState.initialCapitalTry,
      topUpCapitalTry: portfolioCapitalState.topUpCapitalTry,
      topUpStrategy: portfolioCapitalState.topUpStrategy,
      savedPositions: portfolioCapitalState.positions,
      maxSingleStockWeightPct: architectConfig.maxSingleStockWeightPct,
    });
  }, [portfolioHoldingCandidates, portfolioCapitalState, architectConfig.maxSingleStockWeightPct]);

  // Yan Yana Şirket Kıyaslama (En fazla 3 BIST Şirketi)
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState<boolean>(false);
  const toggleCompareTicker = useCallback((rawTicker: string) => {
    const clean = (rawTicker || '').toUpperCase().replace(/\.IS$/i, '').trim();
    if (!clean) return;
    setCompareTickers(prev => {
      if (prev.includes(clean)) {
        const next = prev.filter(t => t !== clean);
        if (next.length < 2) setIsCompareModalOpen(false);
        return next;
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), clean];
      }
      return [...prev, clean];
    });
  }, []);

  // KAP Detay Modalı ESC ile kapatma
  useEffect(() => {
    if (!selectedDisclosure) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDisclosure(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDisclosure]);

  // Bildirime tıklandığında modalı aç; eğer resmi tam metin henüz çekilmediyse (on-demand) KAP'tan anında zenginleştir
  const openDisclosureModal = useCallback(async (item: CompanyNewsItem) => {
    setCopiedDisclosureText(false);
    setSelectedDisclosure(item);
    if (item.fullText || !item.kapId || !/^\d{5,9}$/.test(item.kapId)) {
      setIsHydratingDisclosure(false);
      return;
    }
    setIsHydratingDisclosure(true);
    try {
      const params = new URLSearchParams({
        kapId: item.kapId,
        ticker: item.ticker,
      });
      if (item.originalSubject) params.set('subject', item.originalSubject);
      if (item.kapSummary) params.set('summary', item.kapSummary);
      const res = await fetch(`/api/feed?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const d = data?.detail;
        if (d && d.fullText) {
          const merged: CompanyNewsItem = {
            ...item,
            title: d.title || item.title,
            summary: d.summary || item.summary,
            keyTakeaways: Array.isArray(d.keyTakeaways) && d.keyTakeaways.length > 0 ? d.keyTakeaways : item.keyTakeaways,
            keyMetrics: Array.isArray(d.keyMetrics) && d.keyMetrics.length > 0 ? d.keyMetrics : item.keyMetrics,
            fullText: d.fullText,
            category: d.category || item.category,
            categoryLabel: d.categoryLabel || item.categoryLabel,
            impact: d.impact || item.impact,
            impactLabel: d.impactLabel || item.impactLabel,
            eventType: d.eventType || item.eventType,
          };
          setSelectedDisclosure(prev => (prev && prev.id === item.id ? merged : prev));
          setLiveNewsFeed(prev => prev.map(x => (x.id === item.id ? merged : x)));
        }
      }
    } catch {
      // On-demand zenginleştirme başarısız olursa mevcut özet korunur
    } finally {
      setIsHydratingDisclosure(false);
    }
  }, []);

  const prioritizedFeedTickersKey = useMemo(() => {
    const analyzed = savedReports
      .map(r => (r.ticker || '').toUpperCase().trim())
      .filter(Boolean);
    if (analyzed.length === 0) return '';
    const analyzedSet = new Set(analyzed);
    const ordered: string[] = [];
    const seen = new Set<string>();
    const addIfAnalyzed = (t: string) => {
      const sym = (t || '').toUpperCase().trim();
      if (sym && analyzedSet.has(sym) && !seen.has(sym)) {
        seen.add(sym);
        ordered.push(sym);
      }
    };
    portfolioTickers.forEach(addIfAnalyzed);
    favoriteTickers.forEach(addIfAnalyzed);
    analyzed.forEach(addIfAnalyzed);
    return ordered.join(',');
  }, [savedReports, portfolioTickers, favoriteTickers]);

  const refreshLiveFeed = useCallback(async (forceRefresh = false) => {
    setIsFeedLoading(true);
    try {
      if (!prioritizedFeedTickersKey) {
        setLiveNewsFeed([]);
        setLastFeedSync(new Date());
        setIsFeedLoading(false);
        return;
      }

      const params = new URLSearchParams({
        tickers: prioritizedFeedTickersKey,
      });
      if (forceRefresh) {
        params.set('force', '1');
      }

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
  }, [prioritizedFeedTickersKey]);

  useEffect(() => {
    refreshLiveFeed(false);
  }, [refreshLiveFeed]);

  const handleDemoLogin = useCallback(() => {
    const demoSession: UserSession = {
      name: 'Demo Yatırımcı',
      email: 'demo@fairvalue.com.tr',
      initials: 'DY',
      isLoggedIn: true,
      role: 'Misafir Yatırımcı',
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
        const savedUser = localStorage.getItem('fair_value_user') || sessionStorage.getItem('fair_value_user');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          if (parsed && typeof parsed === 'object' && typeof parsed.email === 'string') {
            setUserSession(parsed);
          }
        }
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
      sessionStorage.removeItem('fair_value_user');
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedPort = localStorage.getItem('fair_value_portfolio');
        if (savedPort) {
          const parsedPort = JSON.parse(savedPort);
          if (Array.isArray(parsedPort)) {
            setPortfolioTickers(parsedPort.filter((t): t is string => typeof t === 'string' && t.trim().length > 0));
          }
        }
        const savedFavs = localStorage.getItem('fair_value_favorites');
        if (savedFavs) {
          const parsedFavs = JSON.parse(savedFavs);
          if (Array.isArray(parsedFavs)) {
            setFavoriteTickers(parsedFavs.filter((t): t is string => typeof t === 'string' && t.trim().length > 0));
          }
        }
        const savedArchCfg = localStorage.getItem('fair_value_architect_config_v1');
        if (savedArchCfg) {
          const parsedCfg = JSON.parse(savedArchCfg);
          if (parsedCfg && typeof parsedCfg === 'object') {
            setArchitectConfig(prev => ({ ...DEFAULT_PORTFOLIO_ARCHITECT_CONFIG, ...prev, ...parsedCfg }));
          }
        }
        const savedCap = localStorage.getItem('fair_value_portfolio_capital_v1');
        if (savedCap) {
          const parsedCap = JSON.parse(savedCap);
          if (parsedCap && typeof parsedCap === 'object') {
            setPortfolioCapitalState(prev => ({
              initialCapitalTry: typeof parsedCap.initialCapitalTry === 'number' && Number.isFinite(parsedCap.initialCapitalTry) ? Math.max(0, parsedCap.initialCapitalTry) : prev.initialCapitalTry,
              topUpCapitalTry: typeof parsedCap.topUpCapitalTry === 'number' && Number.isFinite(parsedCap.topUpCapitalTry) ? Math.max(0, parsedCap.topUpCapitalTry) : prev.topUpCapitalTry,
              allocationMode: parsedCap.allocationMode === 'topup' ? 'topup' : 'initial',
              topUpStrategy: parsedCap.topUpStrategy === 'proportional' ? 'proportional' : 'smart_rebalance',
              positions: parsedCap.positions && typeof parsedCap.positions === 'object' ? parsedCap.positions : prev.positions,
            }));
          }
        }
      } catch (e) {
        console.warn('Portföy/Favori okuma hatası:', e);
      }
    }
  }, []);

  const updateArchitectConfig = useCallback((updater: PortfolioArchitectConfig | ((prev: PortfolioArchitectConfig) => PortfolioArchitectConfig)) => {
    setArchitectConfig(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem('fair_value_architect_config_v1', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const updatePortfolioCapitalState = useCallback((
    updater: (prev: {
      initialCapitalTry: number;
      topUpCapitalTry: number;
      allocationMode: 'initial' | 'topup';
      topUpStrategy: 'smart_rebalance' | 'proportional';
      positions: Record<string, SavedPositionInput>;
    }) => {
      initialCapitalTry: number;
      topUpCapitalTry: number;
      allocationMode: 'initial' | 'topup';
      topUpStrategy: 'smart_rebalance' | 'proportional';
      positions: Record<string, SavedPositionInput>;
    }
  ) => {
    setPortfolioCapitalState(prev => {
      const next = updater(prev);
      try { localStorage.setItem('fair_value_portfolio_capital_v1', JSON.stringify(next)); } catch {}
      return next;
    });
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

  const applyPortfolioSet = useCallback((tickersToApply: string[], mode: 'replace' | 'merge') => {
    const cleanList = Array.from(
      new Set(
        (tickersToApply || [])
          .map(t => String(t || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );
    if (cleanList.length === 0 && mode === 'merge') return;
    setPortfolioTickers(prev => {
      const next = mode === 'replace'
        ? cleanList
        : Array.from(new Set([...prev, ...cleanList]));
      try { localStorage.setItem('fair_value_portfolio', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const applyModelPortfolioWithLots = useCallback((allocResult: CapitalAllocationPlanResult, mode: 'replace' | 'merge') => {
    const tickers = allocResult.rows.map(r => r.ticker);
    applyPortfolioSet(tickers, mode);
    updatePortfolioCapitalState(prev => {
      const nextPositions = mode === 'replace' ? {} as Record<string, SavedPositionInput> : { ...prev.positions };
      for (const r of allocResult.rows) {
        if (mode === 'replace' || !nextPositions[r.ticker]?.shares) {
          nextPositions[r.ticker] = {
            ...(nextPositions[r.ticker] || {}),
            shares: r.finalLots,
          };
        }
      }
      return {
        ...prev,
        positions: nextPositions,
      };
    });
  }, [applyPortfolioSet, updatePortfolioCapitalState]);

  const commitTopUpToPositions = useCallback((allocResult: CapitalAllocationPlanResult) => {
    updatePortfolioCapitalState(prev => {
      const nextPositions = { ...prev.positions };
      for (const r of allocResult.rows) {
        nextPositions[r.ticker] = {
          ...(nextPositions[r.ticker] || {}),
          shares: r.finalLots,
        };
      }
      return {
        ...prev,
        initialCapitalTry: Math.round(allocResult.finalPortfolioValueTry || prev.initialCapitalTry),
        positions: nextPositions,
      };
    });
    setTopUpAppliedNotice('İlave alım lotları mevcut portföyünüze işlendi.');
    setTimeout(() => setTopUpAppliedNotice(null), 3500);
  }, [updatePortfolioCapitalState]);

  const updateHoldingShares = useCallback((rawTicker: string, rawSharesStr: string) => {
    const sym = (rawTicker || '').trim().toUpperCase();
    if (!sym) return;
    const cleaned = rawSharesStr.replace(/[^0-9]/g, '');
    const parsed = cleaned === '' ? 0 : Math.max(0, parseInt(cleaned, 10) || 0);
    updatePortfolioCapitalState(prev => ({
      ...prev,
      positions: {
        ...prev.positions,
        [sym]: {
          ...(prev.positions[sym] || {}),
          shares: parsed,
        },
      },
    }));
  }, [updatePortfolioCapitalState]);

  const swapPortfolioTicker = useCallback((removeTicker: string, addTicker?: string | null) => {
    const rem = (removeTicker || '').trim().toUpperCase();
    const add = (addTicker || '').trim().toUpperCase();
    if (!rem) return;
    setPortfolioTickers(prev => {
      const filtered = prev.filter(t => t !== rem);
      const next = add && !filtered.includes(add) ? [...filtered, add] : filtered;
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

  // Yeni Analiz Ekranını Sıfırlama (Temiz, ham başlangıç durumu)
  const resetToNewAnalysis = useCallback(() => {
    setTicker('');
    setPrice('');
    setConsensus('');
    setPeerMultiples('');
    setSelectedSector('AUTO');
    setFinancialFiles([]);
    setActivityFiles([]);
    setPresentationFiles([]);
    setPipelineStep(null);
    setPipelineProgress(0);
    setExtractedData(null);
    setActiveReportId(null);
    setError(null);
    setStep('input');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const basePath = window.location.pathname.startsWith('/simply') ? '/simply' : '';
      window.history.pushState(null, '', `${basePath || '/'}`);
    }
  }, []);

  // Tarayıcı Yolu & Sayfa Geçiş Yöneticisi (URL Navigation)
  const navigateTo = useCallback((targetStep: 'cockpit' | 'input' | 'saved' | 'themes' | 'leaderboard' | 'portfolio' | 'favorites' | 'sectors') => {
    setError(null);
    setQuickAddOpen(false);
    setQuickAddQuery('');
    const basePath = typeof window !== 'undefined' && window.location.pathname.startsWith('/simply') ? '/simply' : '';

    if (targetStep === 'cockpit') {
      setStep('cockpit');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'instant' });
        window.history.pushState(null, '', `${basePath || '/'}`);
      }
    } else if (targetStep === 'portfolio') {
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
    } else if (targetStep === 'sectors') {
      setStep('sectors');
      if (typeof window !== 'undefined') window.history.pushState(null, '', `${basePath}/?view=sectors`);
    } else if (targetStep === 'input') {
      resetToNewAnalysis();
    }
  }, [resetToNewAnalysis]);

  const openReport = useCallback((reportId: string, tickerName?: string) => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    const targetReport = savedReports.find(r => r.id === reportId);
    const sym = (tickerName || targetReport?.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase();
    // State kirliliği koruması (State Pollution Guard):
    // Önceki hissenin sektör seçimi, geçici verisi ve dönem kaydırması yeni açılan rapora taşınmamalıdır.
    setSelectedSector('AUTO');
    setExtractedData(null);
    setError(null);
    setTicker(sym);
    setPrice(targetReport?.price || '');

    if (stepRef.current !== 'report') {
      setPreviousNavState({ step: stepRef.current, analyzedTab });
    }
    setStep('report');
    setActiveReportId(reportId);
    if (sym && typeof window !== 'undefined') {
      const isSimply = window.location.pathname.startsWith('/simply');
      const targetPath = isSimply ? `/simply/${sym}` : `/analysis/${sym}`;
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
      const scoreA = parseNumericScore(a.score) ?? -1;
      const scoreB = parseNumericScore(b.score) ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return reportTimestamp(b) - reportTimestamp(a);
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

      const scoreA = parseNumericScore(a.score) ?? -1;
      const scoreB = parseNumericScore(b.score) ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;

      return reportTimestamp(b) - reportTimestamp(a);
    });
  };

  const sortReportsByDate = (reports: SavedReport[]) => {
    return [...reports].sort((a, b) => reportTimestamp(b) - reportTimestamp(a));
  };

  const deleteReport = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const reportToDelete = savedReports.find(r => r.id === id);
    const tickerName = reportToDelete?.ticker || 'bu';
    const periodName = reportToDelete?.period ? ` (${reportToDelete.period})` : '';
    if (confirm(`${tickerName}${periodName} hissesine ait değerleme raporunu silmek istediğinize emin misiniz?`)) {
      // 1. O rapordan yalnızca bu ID'ye ait kaydı yerel hafızadan temizle (aynı hissenin diğer dönem raporları KORUNUR)
      const updated = savedReports.filter(r => r.id !== id);
      setSavedReports(updated);
      saveReportsCache(updated);
      try {
        localStorage.setItem('fin_valuation_reports', JSON.stringify(updated));
      } catch (err) {}

      // 2. Buluttan (Supabase) id bazında kesin eşitlikle sil
      try {
        await fetch(`/api/reports?id=${encodeURIComponent(id)}&ticker=${encodeURIComponent(tickerName)}`, {
          method: 'DELETE',
          headers: { 'X-Requested-With': 'fin-analiz-client' },
        });
      } catch (err) {
        console.warn('Buluttan silme başarısız:', err);
      }

      // 3. Ekran ve URL senkronizasyonu:
      if (activeReport?.id === id || activeReportId === id) {
        setSelectedSector('AUTO');
        setExtractedData(null);
        const remainingOfTicker = updated.filter(r => r.ticker?.toUpperCase() === tickerName.toUpperCase());
        if (remainingOfTicker.length > 0) {
          // Aynı hisseye ait başka bir çeyrek varsa onu aç
          setActiveReportId(remainingOfTicker[0].id);
          setTicker(remainingOfTicker[0].ticker);
          setStep('report');
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', `/analysis/${remainingOfTicker[0].ticker.toUpperCase()}`);
          }
        } else if (updated.length > 0) {
          // Başka hisse raporu varsa ilkine geç
          setActiveReportId(updated[0].id);
          setTicker(updated[0].ticker);
          setStep('report');
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', `/analysis/${updated[0].ticker.toUpperCase()}`);
          }
        } else {
          // Hiç rapor kalmadıysa ana sayfaya dön
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

  // Doğrudan URL veya Harici Çağrı ile Hisse Yükleme (/analysis/VESBE)
  const loadTickerDirect = useCallback(async (targetTicker: string, currentSaved?: SavedReport[]) => {
    const t = (targetTicker || '').trim().replace(/\.IS$/i, '').toUpperCase();
    if (!t) return;

    // State kirliliği koruması: önceki hissenin sektör seçimi ve geçici verilerini sıfırla
    setSelectedSector('AUTO');
    setExtractedData(null);
    setError(null);

    // 1. Mevcut kaydedilmiş yerel depodaki raporlar
    const reportList = currentSaved ?? savedReports;
    const existing = findLatestReportByTicker(reportList, t);
    if (existing) {
      setActiveReportId(existing.id);
      setTicker(existing.ticker);
      setPrice(existing.price || '');
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
        if (json?.report && json.report.ticker?.replace(/\.IS$/i, '').toUpperCase() === t) {
          const apiReport: SavedReport = reconcileSavedReportWithLatestEngine(json.report);
          setSavedReports(prev => {
            const has = prev.some(r => r.id === apiReport.id);
            const next = has ? prev : [apiReport, ...prev];
            saveReportsCache(next);
            try { localStorage.setItem('fin_valuation_reports', JSON.stringify(next.slice(0, 30))); } catch {}
            return next;
          });
          setActiveReportId(apiReport.id);
          setTicker(apiReport.ticker);
          setPrice(apiReport.price || '');
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
    setPrice('');
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
        const parsedStored = JSON.parse(stored);
        if (Array.isArray(parsedStored)) {
          localData = parsedStored.filter((r): r is SavedReport => Boolean(r && typeof r === 'object' && typeof r.ticker === 'string'));
        }
      }
    } catch (e) {}

    // EĞER defaultReport (SSR'den gelen veya statik hazır model) tanımlıysa ve yerel depoda yoksa birleştir
    if (defaultReport) {
      const idx = localData.findIndex(r => r.id === defaultReport.id || (r.ticker?.toUpperCase() === defaultReport.ticker?.toUpperCase() && (!defaultReport.period || r.period === defaultReport.period)));
      if (idx === -1) {
        localData = [defaultReport, ...localData];
      } else {
        localData[idx] = defaultReport;
      }
    }

    localData = localData.map(reconcileSavedReportWithLatestEngine);
    setSavedReports(localData);

    // IndexedDB kalıcı önbelleğinden tam listeyi yükle (5MB localStorage kotasına takılmadan)
    const idbLoadPromise = loadReportsCache<SavedReport>()
      .then(cached => {
        if (Array.isArray(cached) && cached.length > 0) {
          const reconciled = cached.map(reconcileSavedReportWithLatestEngine);
          setSavedReports(prev => (reconciled.length >= prev.length ? reconciled : prev));
          return reconciled;
        }
        return [] as SavedReport[];
      })
      .catch(() => [] as SavedReport[]);

    // Doğrudan URL veya initialTicker kontrolü (/analysis/VESBE veya query params)
    let pathTicker = '';
    let queryView = '';
    let queryTicker = '';
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/(?:analysis|report|simply)\/([A-Za-z0-9_.]+)/i);
      if (match && match[1]) {
        pathTicker = match[1].replace(/\.IS$/i, '').toUpperCase();
      }
      const sParams = new URLSearchParams(window.location.search);
      queryView = sParams.get('view') || '';
      queryTicker = (sParams.get('ticker') || '').replace(/\.IS$/i, '').toUpperCase();
    }
    const targetTicker = (initialTicker || pathTicker || queryTicker || '').trim().replace(/\.IS$/i, '').toUpperCase();

    if (targetTicker) {
      const matched = findLatestReportByTicker(localData, targetTicker) || (defaultReport?.ticker?.replace(/\.IS$/i, '').toUpperCase() === targetTicker ? defaultReport : null);
      if (matched) {
        setActiveReportId(matched.id);
        setTicker(matched.ticker);
        setPrice(matched.price || '');
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
    } else if (queryView === 'sectors') {
      setStep('sectors');
      setLoading(false);
    } else if (queryView === 'input') {
      setStep('input');
      setLoading(false);
    } else {
      // Hedef bir hisse belirtilmemişse (Ana Sayfa):
      setActiveReportId(null);
      setTicker('');
      setStep('cockpit');
      setLoading(false);
    }

    const syncWithCloud = async () => {
      try {
        setIsSyncing(true);
        const idbList = await idbLoadPromise;
        const baseLocal = idbList.length > 0 ? idbList : localData;

        let maxLocalTs = 0;
        for (const r of baseLocal) {
          const ts = reportTimestamp(r);
          if (ts > maxLocalTs) maxLocalTs = ts;
        }

        const syncUrl =
          baseLocal.length > 0 && maxLocalTs > 0
            ? `/api/reports?since=${encodeURIComponent(new Date(maxLocalTs).toISOString())}`
            : '/api/reports';

        const res = await fetch(syncUrl);
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
            if (json.isCloudConfigured) {
              let incomingRaw: SavedReport[] = Array.isArray(json.reports) ? json.reports : [];
              let activeIdSet =
                Array.isArray(json.activeIds) && json.activeIds.length > 0
                  ? new Set<string>(json.activeIds.map(String))
                  : null;

              // Eksik aktif ID tespiti (farklı cihazdan eklenmiş veya kısmi önbellek kendi kendini onarır):
              if (json.isDelta && activeIdSet) {
                const presentIds = new Set<string>([
                  ...baseLocal.map(r => String(r.id)),
                  ...incomingRaw.map(r => String(r.id)),
                ]);
                const missingIds = Array.from(activeIdSet).filter(id => !presentIds.has(id));
                if (missingIds.length > 0 && missingIds.length <= 50) {
                  try {
                    const missRes = await fetch(`/api/reports?ids=${encodeURIComponent(missingIds.join(','))}`);
                    if (missRes.ok) {
                      const missJson = await missRes.json();
                      if (Array.isArray(missJson?.reports)) {
                        incomingRaw = [...incomingRaw, ...missJson.reports];
                      }
                    }
                  } catch {}
                } else if (missingIds.length > 50) {
                  try {
                    const fullRes = await fetch('/api/reports');
                    if (fullRes.ok) {
                      const fullJson = await fullRes.json();
                      if (Array.isArray(fullJson?.reports)) {
                        incomingRaw = fullJson.reports;
                        if (Array.isArray(fullJson.activeIds) && fullJson.activeIds.length > 0) {
                          activeIdSet = new Set<string>(fullJson.activeIds.map(String));
                        }
                      }
                    }
                  } catch {}
                }
              }

              // Hiçbir değişiklik yoksa ve yerel liste sunucuyla birebir aynıysa yeniden hesaplama yapma:
              if (
                json.isDelta &&
                incomingRaw.length === 0 &&
                activeIdSet &&
                baseLocal.length === activeIdSet.size &&
                baseLocal.every(r => activeIdSet!.has(String(r.id)))
              ) {
                return;
              }

              const cloudReconciled = incomingRaw.map(reconcileSavedReportWithLatestEngine);
              setSavedReports(prev => {
                const prevByTicker = new Map<string, SavedReport[]>();
                for (const localRep of prev) {
                  const t = (localRep.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase();
                  if (!t) continue;
                  const arr = prevByTicker.get(t) || [];
                  arr.push(localRep);
                  prevByTicker.set(t, arr);
                }

                // Her hisse için tekil aktif rapor (eski kayıtların özetleri analysis_history'ye aktarılır):
                const mergedByTicker = new Map<string, SavedReport>();
                for (const [t, list] of prevByTicker.entries()) {
                  const activeOnly = activeIdSet
                    ? list.filter(r => activeIdSet!.has(String(r.id)))
                    : list;
                  if (activeOnly.length === 0) continue;
                  const sorted = [...activeOnly].sort(
                    (a, b) =>
                      parsePeriodSortKey(b.period || b.extractedData?.reporting_period || '') -
                        parsePeriodSortKey(a.period || a.extractedData?.reporting_period || '') ||
                      reportTimestamp(b) - reportTimestamp(a)
                  );
                  const winner = sorted[0];
                  const mergedHist = mergeAnalysisHistorySnapshots(list, winner);
                  mergedByTicker.set(
                    t,
                    mergedHist.length > 0
                      ? { ...winner, extractedData: { ...(winner.extractedData || {}), analysis_history: mergedHist } }
                      : winner
                  );
                }

                for (const cloudRep of cloudReconciled) {
                  const t = (cloudRep.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase();
                  if (!t) continue;
                  const priorLocal = prevByTicker.get(t) || [];
                  const mergedHist = mergeAnalysisHistorySnapshots(priorLocal, cloudRep);
                  const enrichedCloud =
                    mergedHist.length > 0
                      ? { ...cloudRep, extractedData: { ...(cloudRep.extractedData || {}), analysis_history: mergedHist } }
                      : cloudRep;
                  const cur = mergedByTicker.get(t);
                  if (!cur || reportTimestamp(enrichedCloud) >= reportTimestamp(cur)) {
                    mergedByTicker.set(t, enrichedCloud);
                  }
                }

                const finalList = Array.from(mergedByTicker.values());
                if (finalList.length > 0) {
                  saveReportsCache(finalList);
                }
                return finalList.length > 0 ? finalList : prev;
              });
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
      isHandlingPopStateRef.current = true;
      const sParams = new URLSearchParams(window.location.search);
      const view = sParams.get('view');
      const qTicker = sParams.get('ticker');
      const match = window.location.pathname.match(/\/(?:analysis|report|simply)\/([A-Za-z0-9_.]+)/i);
      const urlTicker = (match ? match[1] : qTicker || '').replace(/\.IS$/i, '').toUpperCase();

      if (urlTicker) {
        const found = findLatestReportByTicker(savedReports, urlTicker);
        if (found) {
          setSelectedSector('AUTO');
          setExtractedData(null);
          setActiveReportId(found.id);
          setTicker(found.ticker);
          setPrice(found.price || '');
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
      } else if (view === 'sectors') {
        setStep('sectors');
      } else if (view === 'new' || view === 'input') {
        setStep('input');
        setActiveReportId(null);
      } else if (!view && !urlTicker) {
        setStep('cockpit');
        setActiveReportId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [savedReports]);

  // URL Senkronizasyonu (URL'yi sekmeler ve raporlarla senkronize tut)
  useEffect(() => {
    if (typeof window !== 'undefined' && mounted) {
      if (isHandlingPopStateRef.current) {
        isHandlingPopStateRef.current = false;
        return;
      }
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
      } else if (step === 'sectors') {
        const targetFull = `${basePath}/?view=sectors`;
        if (window.location.search !== '?view=sectors') {
          window.history.pushState(null, '', targetFull);
        }
      } else if (step === 'cockpit' || step === 'input') {
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

  // Eski şemalı (ana ortaklık özkaynağı / azınlık payı alanı olmayan) kayıtlı analizleri, PDF yüklemeden,
  // resmi BIST/İş Yatırım mali tablolarını yeniden çekerek arka planda güncel motorla yeniler.
  // Faaliyet raporu / sunum kaynaklı nitel alanlar (karne, güçlü-zayıf yönler vb.) korunur.
  const staleRefreshStarted = useRef(false);
  useEffect(() => {
    if (!mounted || staleRefreshStarted.current || savedReports.length === 0) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    const stale = savedReports.filter(r => {
      const h = r.extractedData?.financial_history;
      if (!Array.isArray(h) || h.length === 0) return false;
      const schemaStale = h[h.length - 1]?.parent_equity === undefined;
      if (!schemaStale) return false;
      let doneToday = false;
      try { doneToday = localStorage.getItem(`fv_refreshed_${r.ticker}`) === todayKey; } catch {}
      return !doneToday;
    }).slice(0, 40);
    if (stale.length === 0) return;
    staleRefreshStarted.current = true;
    (async () => {
      for (const rep of stale) {
        try {
          const res = await fetch(`/api/bist?ticker=${encodeURIComponent(rep.ticker)}&t=${Date.now()}`, { cache: 'no-store' });
          if (!res.ok) continue;
          const bist = await res.json();
          if (!bist || !Array.isArray(bist.financial_history) || bist.financial_history.length === 0) continue;
          const latestHistPeriod = bist.financial_history[bist.financial_history.length - 1]?.period;
          const nextPeriod = parsePeriodSortKey(latestHistPeriod || '') > parsePeriodSortKey(rep.period || '')
            ? latestHistPeriod
            : (rep.period || latestHistPeriod);
          const refreshed = reconcileSavedReportWithLatestEngine({
            ...rep,
            period: nextPeriod,
            price: bist.current_price ? String(bist.current_price) : rep.price,
            extractedData: {
              ...(rep.extractedData || {}),
              reporting_period: nextPeriod || rep.extractedData?.reporting_period,
              financial_history: bist.financial_history,
              shares_outstanding: bist.shares_outstanding ?? rep.extractedData?.shares_outstanding,
            },
          });
          setSavedReports(prev => {
            const next = prev.map(r => (r.id === rep.id ? refreshed : r));
            saveReportsCache(next);
            return next;
          });
          try { localStorage.setItem(`fv_refreshed_${rep.ticker}`, todayKey); } catch {}
          fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fin-analiz-client' },
            body: JSON.stringify({ report: refreshed }),
          }).catch(() => {});
        } catch (err) {
          console.warn('Kayıtlı analiz yenileme atlandı:', rep.ticker, err);
        }
      }
    })();
  }, [mounted, savedReports]);

  const saveReport = async (newReport: SavedReport) => {
    const newTickerUpper = (newReport.ticker || '').trim().toUpperCase();

    // Analiz Geçmişi (yalnızca görüntüleme): Eski rapor gövdesi silinmeden önce skor, adil değer, fiyat,
    // dönem ve karar bilgileri ~180 baytlık özet kayıt olarak yeni raporun extractedData.analysis_history alanına aktarılır.
    const sameTickerPrev = savedReports.filter(
      r => (r.ticker || '').trim().toUpperCase() === newTickerUpper && r.id !== newReport.id
    );
    const analysisHistory = mergeAnalysisHistorySnapshots(sameTickerPrev, newReport);
    if (analysisHistory.length > 0) {
      newReport = {
        ...newReport,
        extractedData: { ...(newReport.extractedData || {}), analysis_history: analysisHistory },
      };
    }

    newReport = {
      ...newReport,
      extractedData: { ...(newReport.extractedData || {}), saved_at: new Date().toISOString() },
    };

    // Tekil aktif rapor: aynı hisseye ait önceki tam raporlar bellekten düşürülür (özetleri analysis_history içindedir)
    const updated = [
      newReport,
      ...savedReports.filter(r => (r.ticker || '').trim().toUpperCase() !== newTickerUpper),
    ];
    setSavedReports(updated);
    saveReportsCache(updated);

    try {
      const postRes = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fin-analiz-client' },
        body: JSON.stringify({ report: newReport }),
      });
      if (postRes.ok) {
        const postJson = await postRes.json().catch(() => null);
        if (Array.isArray(postJson?.analysis_history) && postJson.analysis_history.length > 0) {
          setSavedReports(prev => {
            const synced = prev.map(r =>
              r.id === newReport.id
                ? { ...r, extractedData: { ...(r.extractedData || {}), analysis_history: postJson.analysis_history } }
                : r
            );
            saveReportsCache(synced);
            return synced;
          });
        }
      }
    } catch (err) {
      console.warn('Buluta kaydetme başarısız, yerelde saklandı:', err);
    }
  };

  const exportBackup = () => {
    try {
      const backupPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        reports: savedReports,
        portfolio: portfolioTickers,
        favorites: favoriteTickers,
      };
      const dataStr = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fairvalue_analiz_yedegi_${new Date().toISOString().slice(0, 10)}.json`;
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
        const reportsList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.reports) ? parsed.reports : []);
        if (reportsList.length > 0) {
          const existingIds = new Set(savedReports.map(r => r.id));
          const newEntries = reportsList.filter((r: any) => r.id && r.ticker);
          const merged = [...newEntries.filter((r: any) => !existingIds.has(r.id)), ...savedReports].map(reconcileSavedReportWithLatestEngine);
          setSavedReports(merged);
          saveReportsCache(merged);
          try {
            localStorage.setItem('fin_valuation_reports', JSON.stringify(merged));
          } catch (e) {}

          if (Array.isArray(parsed?.portfolio)) {
            const mergedPort = Array.from(new Set([...portfolioTickers, ...parsed.portfolio]));
            setPortfolioTickers(mergedPort);
            localStorage.setItem('fair_value_portfolio', JSON.stringify(mergedPort));
          }
          if (Array.isArray(parsed?.favorites)) {
            const mergedFav = Array.from(new Set([...favoriteTickers, ...parsed.favorites]));
            setFavoriteTickers(mergedFav);
            localStorage.setItem('fair_value_favorites', JSON.stringify(mergedFav));
          }

          alert(`${newEntries.length} adet analiz edilmiş şirket ve portföy listeniz başarıyla yüklendi!`);
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
              headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fin-analiz-client' },
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
              () => fetch('/api/extract', { method: 'POST', headers: { 'X-Requested-With': 'fin-analiz-client' }, body: fd }),
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
    const prevFormTicker = (ticker || '').replace(/\.IS$/i, '').toUpperCase().trim();
    const targetTicker = (symbolToAnalyze || ticker || '').replace(/\.IS$/i, '').toUpperCase().trim();
    if (!targetTicker) {
      setError('Lütfen analiz etmek istediğiniz hisse kodunu yazın (Örn: AGESA, THYAO, EREGL).');
      return;
    }

    const isSameFormTicker = !symbolToAnalyze || targetTicker === prevFormTicker;
    const activeActivityFiles = isSameFormTicker ? activityFiles : [];
    const activePresentationFiles = isSameFormTicker ? presentationFiles : [];

    if (stepRef.current !== 'report') {
      setPreviousNavState({ step: stepRef.current, analyzedTab });
    }

    setLoading(true);
    setError(null);
    setActiveReportId(null);
    setTicker(targetTicker);
    setSelectedSector('AUTO');
    if (!isSameFormTicker) {
      setPrice('');
      setFinancialFiles([]);
      setActivityFiles([]);
      setPresentationFiles([]);
    }
    setPipelineStep(1);
    setPipelineProgress(25);
    setStatusMessage(`[1/3] Borsa İstanbul resmi mali tabloları ve canlı piyasa fiyatı çekiliyor: ${targetTicker}...`);

    try {
      const res = await fetchWithClientRetry(
        () => fetch(`/api/bist?ticker=${encodeURIComponent(targetTicker)}&refresh=true&t=${Date.now()}`, { cache: 'no-store' }),
        setStatusMessage
      );
      const bistData = await parseApiResponse(res, `${targetTicker} için BIST verisi çekilemedi.`, 'bist');
      if (!bistData || !Array.isArray(bistData.financial_history) || bistData.financial_history.length === 0) {
        throw new Error(`${targetTicker} için BIST mali tablosu bulunamadı.`);
      }

      const livePriceStr = bistData.current_price ? bistData.current_price.toString() : (isSameFormTicker ? (price || '') : '');
      if (bistData.current_price) {
        setPrice(livePriceStr);
      }

      let currentData: any = {
        ...bistData,
        fair_value_drivers: bistData.drivers || bistData.fair_value_drivers
      };

      const prevSavedForTicker = findLatestReportByTicker(savedReports, targetTicker);

      // OPSİYONEL ADIM 2: Faaliyet Raporları (Alan 2) Varsa Zenginleştir
      if (activeActivityFiles.length > 0) {
        setPipelineStep(2);
        setPipelineProgress(55);
        setStatusMessage(`[2/3] Faaliyet Raporu taranıyor (${activeActivityFiles.length} belge)...`);

        try {
          const perActFileBudget = Math.max(35000, Math.floor(70000 / Math.max(1, activeActivityFiles.length)));
          const activityDocs: { name: string; text: string; category: string }[] = [];
          for (let i = 0; i < activeActivityFiles.length; i++) {
            const file = activeActivityFiles[i];
            setStatusMessage(`[2/3] Faaliyet Raporu okunuyor (${i + 1}/${activeActivityFiles.length}): ${file.name}...`);
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
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fin-analiz-client' },
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
            setStatusMessage(`[2/3] Faaliyet raporu sunucu motoruna aktarılıyor (${activeActivityFiles.length} belge)...`);
            const fd = new FormData();
            fd.append('ticker', targetTicker);
            fd.append('price', livePriceStr);
            fd.append('category', 'activity');
            fd.append('previousData', JSON.stringify(currentData));
            if (prevSavedForTicker) fd.append('previousReport', JSON.stringify(prevSavedForTicker));
            activeActivityFiles.forEach(f => fd.append('files_activity', f));
            res2 = await fetchWithClientRetry(
              () => fetch('/api/extract', { method: 'POST', headers: { 'X-Requested-With': 'fin-analiz-client' }, body: fd }),
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
      if (activePresentationFiles.length > 0) {
        if (activeActivityFiles.length > 0) {
          await new Promise((r) => setTimeout(r, 1500));
        }
        setPipelineStep(3);
        setPipelineProgress(80);
        setStatusMessage(`[3/3] Yatırımcı Sunumu taranıyor (${activePresentationFiles.length} belge)...`);

        try {
          const perPresFileBudget = Math.max(35000, Math.floor(70000 / Math.max(1, activePresentationFiles.length)));
          const presentationDocs: { name: string; text: string; category: string }[] = [];
          for (let i = 0; i < activePresentationFiles.length; i++) {
            const file = activePresentationFiles[i];
            setStatusMessage(`[3/3] Yatırımcı Sunumu okunuyor (${i + 1}/${activePresentationFiles.length}): ${file.name}...`);
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
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fin-analiz-client' },
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
            setStatusMessage(`[3/3] Yatırımcı sunumu sunucu motoruna aktarılıyor (${activePresentationFiles.length} belge)...`);
            const fd = new FormData();
            fd.append('ticker', targetTicker);
            fd.append('price', livePriceStr);
            fd.append('category', 'presentation');
            fd.append('previousData', JSON.stringify(currentData));
            if (prevSavedForTicker) fd.append('previousReport', JSON.stringify(prevSavedForTicker));
            activePresentationFiles.forEach(f => fd.append('files_presentation', f));
            res3 = await fetchWithClientRetry(
              () => fetch('/api/extract', { method: 'POST', headers: { 'X-Requested-With': 'fin-analiz-client' }, body: fd }),
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
      setStatusMessage(`${targetTicker} için ${currentData.financial_history.length} çeyreklik resmi veri yüklendi, analiz başlatılıyor...`);

      setExtractedData(currentData);
      await handleEvaluate({
        ticker: targetTicker,
        price: livePriceStr,
        extractedData: currentData
      });
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
    const cleanSym = (sym || '').trim().replace(/\.IS$/i, '').toUpperCase();
    if (!cleanSym) return;
    const existing = findLatestReportByTicker(savedReports, cleanSym);
    if (existing) {
      openReport(existing.id, cleanSym);
    } else {
      setTicker(cleanSym);
      setPrice('');
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
    setActiveReportId(null);
    setSelectedSector('AUTO');
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
              headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fin-analiz-client' },
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
              () => fetch('/api/extract', { method: 'POST', headers: { 'X-Requested-With': 'fin-analiz-client' }, body: fd }),
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

          const normUploadTicker = (ticker || '').replace(/\.IS$/i, '').toUpperCase().trim();
          const prevSavedForUpload = findLatestReportByTicker(savedReports, normUploadTicker);

          let res2: Response;
          if (activityDocs.length > 0) {
            res2 = await fetchWithClientRetry(
              () => fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fin-analiz-client' },
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
              () => fetch('/api/extract', { method: 'POST', headers: { 'X-Requested-With': 'fin-analiz-client' }, body: fd }),
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

          const normUploadTickerPres = (ticker || '').replace(/\.IS$/i, '').toUpperCase().trim();
          const prevSavedForUploadPres = findLatestReportByTicker(savedReports, normUploadTickerPres);

          let res3: Response;
          if (presentationDocs.length > 0) {
            res3 = await fetchWithClientRetry(
              () => fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fin-analiz-client' },
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
              () => fetch('/api/extract', { method: 'POST', headers: { 'X-Requested-With': 'fin-analiz-client' }, body: fd }),
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
  const handleEvaluate = async (override?: { ticker?: string; price?: string; extractedData?: any }) => {
    setLoading(true);
    setError(null);
    const activeExtractedData = override?.extractedData ?? extractedData;
    const normalizedTicker = (override?.ticker || ticker || activeExtractedData?.ticker || '').toUpperCase().trim();
    if (!normalizedTicker) {
      setError('Hisse kodu bulunamadı. Lütfen analiz edilecek hisse kodunu belirtin.');
      setLoading(false);
      return;
    }

    // Fiyat çözümleme: Boşsa veya tanımsızsa otomatik olarak çıkarılan veriden veya canlı BIST servisinden al
    let effectivePrice = override?.price != null && String(override.price).trim() !== ''
      ? String(override.price).trim()
      : price != null && String(price).trim() !== '' ? String(price).trim() : '';
    if (!effectivePrice || isNaN(Number(effectivePrice)) || Number(effectivePrice) <= 0) {
      if (activeExtractedData?.current_price && Number(activeExtractedData.current_price) > 0) {
        effectivePrice = String(activeExtractedData.current_price);
      } else if (Array.isArray(activeExtractedData?.financial_history)) {
        const histWithPrice = [...activeExtractedData.financial_history].reverse().find((p: any) => p.share_price && Number(p.share_price) > 0);
        if (histWithPrice?.share_price) {
          effectivePrice = String(histWithPrice.share_price);
        }
      }
      if (!effectivePrice || Number(effectivePrice) <= 0) {
        setStatusMessage(`${normalizedTicker} için canlı BIST piyasa fiyatı sorgulanıyor...`);
        try {
          const liveRes = await fetch(`/api/bist?ticker=${encodeURIComponent(normalizedTicker)}&refresh=true&t=${Date.now()}`, { cache: 'no-store' });
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

    const previousReport = findLatestReportByTicker(savedReports, normalizedTicker) || null;

    const activeSector: SectorType = selectedSector === 'AUTO' 
      ? (activeExtractedData?.sector || detectSector(normalizedTicker)) 
      : selectedSector;

    const sanitizedHistory = sanitizeHistoryData(
      activeExtractedData?.financial_history || [], 
      activeExtractedData?.debt_and_interest,
      activeSector,
      Number(effectivePrice) || 100,
      activeExtractedData?.currency || 'TRY'
    );

    const enrichedExtractedData = activeExtractedData ? {
      ...activeExtractedData,
      sector: activeSector,
      financial_history: sanitizedHistory
    } : null;

    try {
      setStatusMessage('Değerleme modeli ve kurumsal analiz raporu üretiliyor...');
      const res = await fetchWithClientRetry(
        () => fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fin-analiz-client' },
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
      const decisionMatch = reportText.match(/Analist\s+Karar[ıi]\s*[:=-]\s*(?:\*{0,2}\s*\[?\s*\*{0,2}\s*(ALMA|SAT|AL|NÖTR|NOTR|TUT)\s*\*{0,2}\s*\]?\s*\*{0,2})/i);
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
      const parsedPrice = parseFinancialNumber(effectivePrice);
      const targetVal = parseFinancialNumber(data.valuation?.composite_fair_value || data.valuation?.fair_value || data.valuation?.dcf_fair_value);
      const numericScore = scoreMatch
        ? parseInt(scoreMatch[1], 10)
        : (data.scoreResult?.totalScore != null ? Number(data.scoreResult.totalScore) : undefined);
      const canonicalScore = formatCanonicalScore(numericScore) || (scoreMatch ? `${scoreMatch[1]}/100` : undefined);

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
      const finalReport = syncReportTextWithValuation(
        cleanReport,
        {
          ...(data.valuation || {}),
          final_decision: finalDecision,
          decision: finalDecision,
          scoreResult: data.scoreResult,
        },
        data.scoreResult,
        data.drivers,
        parsedPrice ?? 0,
        enrichedExtractedData
      );

      const latestPeriodFromHistory = Array.isArray(enrichedExtractedData?.financial_history) && enrichedExtractedData.financial_history.length > 0
        ? enrichedExtractedData.financial_history[enrichedExtractedData.financial_history.length - 1]?.period
        : undefined;
      const resolvedPeriod = activeExtractedData?.reporting_period || latestPeriodFromHistory;

      const finalExtracted = {
        ...enrichedExtractedData,
        reporting_period: resolvedPeriod,
        dividend_history: (Array.isArray(data.dividend_history) && data.dividend_history.length > 0)
          ? data.dividend_history
          : (Array.isArray(enrichedExtractedData?.dividend_history) && enrichedExtractedData.dividend_history.length > 0)
            ? enrichedExtractedData.dividend_history
            : (previousReport?.extractedData?.dividend_history || previousReport?.dividendHistory || []),
        consensus_target: data.consensus_target || enrichedExtractedData?.consensus_target || previousReport?.extractedData?.consensus_target || previousReport?.consensusTarget,
        valuation: data.valuation || enrichedExtractedData?.valuation,
        fair_value_drivers: data.drivers || enrichedExtractedData?.fair_value_drivers,
        score_result: data.scoreResult,
        optimization: opt || data.optimization,
        qualitative_risk_audit: data.qualitative_risk_audit || data.valuation?.qualitative_risk_audit || enrichedExtractedData?.qualitative_risk_audit || null
      };

      setExtractedData(finalExtracted);

      const newEntry: SavedReport = {
        id: Date.now().toString(),
        ticker: normalizedTicker,
        price: effectivePrice,
        fairValue: String(targetVal ?? data.valuation?.fair_value ?? ''),
        period: resolvedPeriod,
        createdAt: new Date().toISOString(),
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
        score: canonicalScore,
        sector: activeSector,
        extractedData: finalExtracted
      };

      saveReport(newEntry);
      setSelectedSector('AUTO');
      setActiveReportId(newEntry.id);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
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
    const sym = (activeReport?.ticker || ticker || '').trim().toUpperCase();
    const validSectors: SectorType[] = [
      'INSURANCE', 'BANKING', 'HOLDING', 'REIT', 'TECH', 'INDUSTRIAL',
      'RETAIL', 'AVIATION', 'UTILITIES_TELCO', 'HEALTHCARE', 'FINANCIAL_SERVICES'
    ];
    const reportSector = (
      activeReport?.extractedData?.sector ||
      (activeReport as any)?.extracted_data?.sector ||
      activeReport?.sector
    ) as SectorType | undefined;

    // Kayıtlı rapor görüntülendiğinde sektör DOĞRUDAN o raporun kendi extracted_data.sector veya kanonik sektöründen alınır;
    // önceki hissenin selectedSector state'i asla yeni açılan rapora bulaşamaz.
    if (step === 'report' || activeReport) {
      if (reportSector && validSectors.includes(reportSector)) {
        return reportSector;
      }
      return detectSector(sym, (activeReport as any)?.companyName || currentExtractedData?.company_name) || 'INDUSTRIAL';
    }

    if (!activeReport && selectedSector !== 'AUTO') return selectedSector;
    if (currentExtractedData?.sector && validSectors.includes(currentExtractedData.sector as SectorType)) {
      return currentExtractedData.sector as SectorType;
    }
    return detectSector(sym, (activeReport as any)?.companyName || currentExtractedData?.company_name) || 'INDUSTRIAL';
  })();

  const activeTickerSym = (activeReport?.ticker || ticker || '').trim().toUpperCase();
  const sectorMeta = getSectorDefinition(currentSector, activeTickerSym);

  const tickerHistory = activeReport 
    ? savedReports
        .filter(r => (r.ticker || '').trim().toUpperCase() === (activeReport.ticker || '').trim().toUpperCase())
        .sort((a, b) => {
          const pDiff = parsePeriodSortKey(b.period || b.extractedData?.reporting_period || '') - parsePeriodSortKey(a.period || a.extractedData?.reporting_period || '');
          if (pDiff !== 0) return pDiff;
          return reportTimestamp(b) - reportTimestamp(a);
        })
    : [];

  // Zaman Serisi Grafik Verisi (eskiden yeniye, kronolojik)
  const rawChartData = currentExtractedData?.financial_history || [];
  const refMarketPrice = parseFinancialNumber(activeReport?.price || price || currentExtractedData?.current_price || currentExtractedData?.valuation?.current_price) ?? 0;
  const chartData = sanitizeHistoryData(
    rawChartData, 
    currentExtractedData?.debt_and_interest,
    currentSector,
    refMarketPrice,
    currentExtractedData?.currency || 'TRY'
  );
  const quarterlyChartData = useMemo(() => computeIncrementalQuarterlyData(chartData), [chartData]);
  const ttmChartData = useMemo(() => computeTtmChartData(quarterlyChartData, chartData), [quarterlyChartData, chartData]);
  const activeFlowChartData = chartMode === 'ttm' ? ttmChartData : quarterlyChartData;

  const chartYAxisFmt = useCallback(
    (v: number) => formatFinancialScale(v, currentExtractedData?.currency || 'TRY', true, false),
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
        if (typeof d.roa === 'number' && !isNaN(d.roa)) return d.roa;
        if (d.net_income != null && d.total_assets && d.total_assets > 0) {
          return Number(((d.net_income * annualFactor / d.total_assets) * 100).toFixed(2));
        }
        break;
      }
      case 'roe': {
        if (typeof d.roe === 'number' && !isNaN(d.roe)) return d.roe;
        if (d.net_income != null && d.equity && d.equity > 0) {
          return Number(((d.net_income * annualFactor / d.equity) * 100).toFixed(2));
        }
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
    const numPrice = parseFinancialNumber(activeReport?.price || price) ?? 0;
    return extractValuationFromReportText(activeReport?.report || '', numPrice);
  }, [activeReport?.report, activeReport?.price, price]);

  const baseDrivers = dynamicValuationResult.drivers;
  const customDrivers = currentExtractedData?.fair_value_drivers;
  const drivers: FairValueDrivers = useMemo(() => {
    let rawRev = typeof customDrivers?.revenue_growth?.value === 'number' ? customDrivers.revenue_growth.value : baseDrivers.revenue_growth.value;
    let revNote = customDrivers?.revenue_growth?.sourceExplanation || baseDrivers.revenue_growth.sourceExplanation;
    if (rawRev > 80.0) {
      rawRev = 75.0;
      revNote = `Aşırı baz etkisi nedeniyle kurumsal sürdürülebilir ciro büyüme tavanına (%75.0) normalize edilmiştir.`;
    }

    let rawNet = typeof customDrivers?.net_income_growth?.value === 'number' ? customDrivers.net_income_growth.value : baseDrivers.net_income_growth.value;
    let netNote = customDrivers?.net_income_growth?.sourceExplanation || baseDrivers.net_income_growth.sourceExplanation;
    if (rawNet > 80.0) {
      const origJump = rawNet;
      rawNet = 75.0;
      netNote = `Geçmiş dönemdeki düşük baz etkisi (+%${origJump.toFixed(1)}) nedeniyle ileriye dönük kâr büyümesi sürdürülebilir kurumsal üst sınıra (%75.0) normalize edilmiştir.`;
    } else if (rawNet < -60.0) {
      rawNet = -50.0;
      netNote = `Dönemsel sert daralma normalize edilerek değerleme tabanı %-50.0 olarak sınırlandırılmıştır.`;
    }

    return {
      revenue_growth: {
        ...baseDrivers.revenue_growth,
        ...(customDrivers?.revenue_growth || {}),
        value: rawRev,
        sourceExplanation: revNote,
      },
      net_income_growth: {
        ...baseDrivers.net_income_growth,
        ...(customDrivers?.net_income_growth || {}),
        value: rawNet,
        sourceExplanation: netNote,
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
  const currentMarketPrice = parseFinancialNumber(activeReport?.price || price) ?? 0;
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

  // Ayı Senaryosu taban fiyatı kontrolü: Modelin stres senaryosu hedef fiyatı (daima < adil değer)
  const rawDynBear = dynamicValuationResult.valuation?.bear_price;
  if (!valuationInfo.bear_price || valuationInfo.bear_price <= 0 || valuationInfo.bear_price >= valuationInfo.fair_value) {
    valuationInfo.bear_price = (rawDynBear && rawDynBear > 0 && rawDynBear < valuationInfo.fair_value)
      ? rawDynBear
      : Number((valuationInfo.fair_value * 0.75).toFixed(2));
  }

  // Boğa Senaryosu tavan fiyatı kontrolü: Modelin iyimser senaryo hedef fiyatı (daima > adil değer)
  const rawDynBull = dynamicValuationResult.valuation?.bull_price;
  if (!valuationInfo.bull_price || valuationInfo.bull_price <= 0 || valuationInfo.bull_price <= valuationInfo.fair_value) {
    valuationInfo.bull_price = (rawDynBull && rawDynBull > 0 && rawDynBull > valuationInfo.fair_value)
      ? rawDynBull
      : Number((valuationInfo.fair_value * 1.25).toFixed(2));
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
    const sc = parseFinancialNumber(currentExtractedData?.shares_outstanding ?? currentExtractedData?.share_count) ?? 0;
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
    const sc = parseFinancialNumber(currentExtractedData?.shares_outstanding ?? currentExtractedData?.share_count) ?? 0;
    return calculateCompanyMultiples(latestPeriodItem, valuationInfo.current_price || currentMarketPrice, sc, currentSector, marketMultiples, currentExtractedData?.currency, null, chartData);
  }, [latestPeriodItem, valuationInfo.current_price, currentMarketPrice, currentExtractedData?.shares_outstanding, currentExtractedData?.share_count, currentSector, marketMultiples, currentExtractedData?.currency, chartData]);

  const previousQuarterComparison = useMemo(() => {
    if (!currentTicker) return null;
    const prevList = savedReports
      .filter(r => r.ticker === currentTicker && r.id !== activeReport?.id)
      .sort((a, b) => {
        const pDiff = parsePeriodSortKey(b.period || b.extractedData?.reporting_period || '') - parsePeriodSortKey(a.period || a.extractedData?.reporting_period || '');
        if (pDiff !== 0) return pDiff;
        return reportTimestamp(b) - reportTimestamp(a);
      });

    const snapHistory = Array.isArray(activeReport?.extractedData?.analysis_history)
      ? activeReport.extractedData.analysis_history
      : [];
    const prev: any = prevList[0] || snapHistory[0] || null;
    if (!prev) return null;

    const prevFv = parseFinancialNumber(prev.fairValue);
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
  }, [savedReports, currentTicker, activeReport?.id, activeReport?.extractedData?.analysis_history, valuationInfo.fair_value, dynamicValuationResult]);

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
            <div className="text-xs text-slate-400 font-medium">Vergi Yükü</div>
            <div className="text-base font-bold font-mono text-white mt-1" title={dupontResult.taxBurden != null ? `${dupontResult.taxBurden}` : undefined}>
              {dupontResult.taxBurden != null ? Number(dupontResult.taxBurden).toFixed(2) : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">Net/EBT</div>
          </div>

          <div className="p-3 text-center">
            <div className="text-xs text-slate-400 font-medium">
              {currentSector === 'INSURANCE' ? 'Yatırım Katkısı' : 'Faiz Yükü'}
            </div>
            <div className="text-base font-bold font-mono text-white mt-1" title={dupontResult.interestBurden != null ? `${dupontResult.interestBurden}` : undefined}>
              {dupontResult.interestBurden != null ? Number(dupontResult.interestBurden).toFixed(2) : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
              {currentSector === 'INSURANCE' ? 'EBT/Teknik' : 'EBT/EBIT'}
            </div>
          </div>

          <div className="p-3 text-center">
            <div className="text-xs text-slate-400 font-medium">
              {currentSector === 'INSURANCE' ? 'Teknik Marj' : 'Faaliyet Marjı'}
            </div>
            <div className="text-base font-bold font-mono text-cyan-400 mt-1">
              {dupontResult.ebitMargin != null ? `%${dupontResult.ebitMargin}` : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
              {currentSector === 'INSURANCE' ? 'Teknik/Prim' : 'EBIT/Satış'}
            </div>
          </div>

          <div className="p-3 text-center">
            <div className="text-xs text-slate-400 font-medium">Aktif Devri</div>
            <div className="text-base font-bold font-mono text-amber-400 mt-1" title={dupontResult.assetTurnover != null ? `${dupontResult.assetTurnover}` : undefined}>
              {dupontResult.assetTurnover != null ? Number(dupontResult.assetTurnover).toFixed(2) : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">Satış/Aktif</div>
          </div>

          <div className="p-3 text-center col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-400 font-medium">Kaldıraç</div>
            <div className="text-base font-bold font-mono text-slate-200 mt-1" title={dupontResult.financialLeverage != null ? `${dupontResult.financialLeverage}` : undefined}>
              {dupontResult.financialLeverage != null ? Number(dupontResult.financialLeverage).toFixed(2) : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">Aktif/Özkaynak</div>
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
              onClick={() => navigateTo('cockpit')}
              role="button"
              tabIndex={0}
              title="Ana Sayfa"
              className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition select-none shrink-0"
            >
              <FairValueLogo className="w-6 h-6" />
              <span className="text-sm font-black text-white tracking-tight font-sans">
                FAIR <span className="text-emerald-400">VALUE</span>
              </span>
            </div>

            {/* Yatay Navigasyon Linkleri (Ana Sayfa, Akış, Portföy, Favoriler, Yatırım Temaları, Hisse Tarama) */}
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => navigateTo('cockpit')}
                className={`fv-pill px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 border ${
                  step === 'cockpit'
                    ? 'text-[#f5c242] font-bold bg-[#1e232d] border-[#f5c242]/30 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24] border-transparent'
                }`}
              >
                <span>Ana Sayfa</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('saved')}
                className={`fv-pill px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 border ${
                  step === 'saved' && analyzedTab !== 'PORTFOLIO' && analyzedTab !== 'FAVORITES'
                    ? 'text-sky-300 font-bold bg-[#1e232d] border-sky-400/30 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24] border-transparent'
                }`}
              >
                <span>Akış</span>
                {liveNewsFeed.some(n => n.impact === 'NEGATIVE') && (
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" title="Olumsuz / Riskli KAP Bildirimi Mevcut" />
                )}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('portfolio')}
                className={`fv-pill px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 border ${
                  step === 'saved' && analyzedTab === 'PORTFOLIO'
                    ? 'text-[#f5c242] font-bold bg-[#1e232d] border-[#f5c242]/30 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24] border-transparent'
                }`}
              >
                <span>Portföy</span>
                {portfolioTickers.length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#21262d] text-[#f5c242] font-bold">
                    {portfolioTickers.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('favorites')}
                className={`fv-pill px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 border ${
                  step === 'saved' && analyzedTab === 'FAVORITES'
                    ? 'text-amber-400 font-bold bg-[#1e232d] border-amber-400/30 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24] border-transparent'
                }`}
              >
                <span>Favoriler</span>
                {favoriteTickers.length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#21262d] text-amber-400 font-bold">
                    {favoriteTickers.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('themes')}
                className={`fv-pill px-3 py-1.5 rounded-lg cursor-pointer border ${
                  step === 'themes'
                    ? 'text-cyan-400 font-bold bg-[#1e232d] border-cyan-400/30 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24] border-transparent'
                }`}
              >
                <span>Yatırım Temaları</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('leaderboard')}
                className={`fv-pill px-3 py-1.5 rounded-lg cursor-pointer border ${
                  step === 'leaderboard'
                    ? 'text-amber-400 font-bold bg-[#1e232d] border-amber-400/30 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24] border-transparent'
                }`}
              >
                <span>Hisse Tarama</span>
              </button>

              <button
                type="button"
                onClick={() => navigateTo('sectors')}
                className={`fv-pill px-3 py-1.5 rounded-lg cursor-pointer border ${
                  step === 'sectors'
                    ? 'text-emerald-400 font-bold bg-[#1e232d] border-emerald-400/30 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-[#181c24] border-transparent'
                }`}
              >
                <span>Sektörler</span>
              </button>
            </nav>
          </div>

          {/* Sağ: Arama Hapı (Ctrl K) + Bildirim + Tema + Kullanıcı Avatar / Giriş */}
          <div className="flex items-center gap-2.5">
            {/* Spotlight Arama Butonu */}
            <button
              type="button"
              onClick={() => setIsSpotlightOpen(true)}
              className="flex items-center justify-between gap-2 bg-[#181b20] hover:bg-[#1f242c] border border-[#2b313d] hover:border-slate-500 py-1.5 px-3 rounded-full text-xs text-slate-400 transition cursor-pointer w-32 sm:w-48 group"
              title="Hızlı Şirket Arama (Ctrl+K)"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 transition shrink-0" />
                <span className="text-slate-400 group-hover:text-slate-200 transition truncate">Hisse Ara...</span>
              </span>
              <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#12151b] border border-[#2e3440] text-slate-400 shrink-0">
                Ctrl K
              </kbd>
            </button>

            {/* Bildirim Çanı (Canlı KAP & Portföy Bildirim Merkezi) */}
            {(() => {
              const portfolioSet = new Set(portfolioTickers.map(t => t.toUpperCase()));
              const favoriteSet = new Set(favoriteTickers.map(t => t.toUpperCase()));
              const baseBellFeed = liveNewsFeed.length > 0
                ? liveNewsFeed
                : getCompanyNewsFeed({
                    tickers: [...new Set(savedReports.map(r => (r.ticker || '').toUpperCase().trim()).filter(Boolean))]
                  });
              const scoredBell = [...baseBellFeed]
                .sort((a, b) => {
                  const aOwn = portfolioSet.has(a.ticker) ? 2 : favoriteSet.has(a.ticker) ? 1 : 0;
                  const bOwn = portfolioSet.has(b.ticker) ? 2 : favoriteSet.has(b.ticker) ? 1 : 0;
                  if (aOwn !== bOwn) return bOwn - aOwn;
                  const aImp = a.impact === 'NEGATIVE' ? 2 : a.impact === 'POSITIVE' ? 1 : 0;
                  const bImp = b.impact === 'NEGATIVE' ? 2 : b.impact === 'POSITIVE' ? 1 : 0;
                  return bImp - aImp;
                })
                .slice(0, 6);
              const alertCount = scoredBell.filter(n => portfolioSet.has(n.ticker) || favoriteSet.has(n.ticker) || n.impact === 'NEGATIVE').length;
              const hasNegBell = scoredBell.some(n => n.impact === 'NEGATIVE');

              return (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNotificationOpen(prev => !prev);
                      setIsUserMenuOpen(false);
                    }}
                    className="p-2 rounded-full hover:bg-[#1c2027] text-slate-400 hover:text-white transition cursor-pointer relative"
                    title="Canlı KAP & Portföy Bildirimleri"
                  >
                    <Bell className="w-4 h-4" />
                    {alertCount > 0 ? (
                      <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-mono font-black flex items-center justify-center ring-2 ring-[#111418] ${
                        hasNegBell ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-slate-950'
                      }`}>
                        {alertCount > 9 ? '9+' : alertCount}
                      </span>
                    ) : (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#111418]" />
                    )}
                  </button>

                  {isNotificationOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsNotificationOpen(false)}
                      />
                      <div 
                        className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#141820] border border-[#2e3440] rounded-2xl shadow-2xl overflow-hidden z-50 text-xs animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#101319] border-b border-[#252b36]">
                          <div className="flex items-center gap-2 font-bold text-white">
                            <Bell className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Canlı KAP &amp; Portföy Bildirimleri</span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                            {scoredBell.length} Kayıt
                          </span>
                        </div>

                        {scoredBell.length === 0 ? (
                          <div className="p-4 text-center space-y-1.5 text-slate-400">
                            <div className="font-semibold text-slate-200">Henüz aktif KAP bildirimi yok</div>
                            <p className="text-[11px] text-slate-500">Şirket analiz ettikçe resmi KAP akışı burada listelenir.</p>
                          </div>
                        ) : (
                          <div className="max-h-80 overflow-y-auto divide-y divide-[#202632]">
                            {scoredBell.map((item) => {
                              const isPort = portfolioSet.has(item.ticker);
                              const isFav = favoriteSet.has(item.ticker);
                              const dotCls = item.impact === 'NEGATIVE'
                                ? 'bg-rose-400'
                                : item.impact === 'POSITIVE'
                                ? 'bg-emerald-400'
                                : 'bg-sky-400';

                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setIsNotificationOpen(false);
                                    openDisclosureModal(item);
                                  }}
                                  className="w-full p-3 text-left hover:bg-[#1a1f29] transition cursor-pointer flex items-start gap-2.5 group"
                                >
                                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotCls}`} />
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-mono font-bold text-white text-xs group-hover:text-emerald-400 transition">
                                          {item.ticker}
                                        </span>
                                        {isPort && (
                                          <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-[#f5c242]/15 text-[#f5c242] border border-[#f5c242]/30 font-bold">
                                            Portföy
                                          </span>
                                        )}
                                        {!isPort && isFav && (
                                          <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30 font-bold">
                                            İzleme
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10px] font-mono text-slate-500 shrink-0">{item.timeAgo}</span>
                                    </div>
                                    <div className="text-[11.5px] text-slate-200 font-sans font-medium line-clamp-2 leading-snug">
                                      {item.title}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div className="p-2 bg-[#101319] border-t border-[#252b36]">
                          <button
                            type="button"
                            onClick={() => {
                              setIsNotificationOpen(false);
                              navigateTo('saved');
                            }}
                            className="w-full py-1.5 rounded-lg bg-[#191e27] hover:bg-[#222834] text-emerald-400 font-bold text-[11px] flex items-center justify-center gap-1.5 border border-[#2a3140] transition cursor-pointer"
                          >
                            <span>Tüm KAP Bildirim Akışına Git</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

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
                  onClick={() => {
                    setIsUserMenuOpen(prev => !prev);
                    setIsNotificationOpen(false);
                  }}
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
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsUserMenuOpen(false)}
                  />
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
                      <button
                        type="button"
                        onClick={() => { exportBackup(); setIsUserMenuOpen(false); }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#21262d] text-left cursor-pointer"
                        title="Analiz edilen şirketleri JSON olarak indir"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Yedeği Dışa Aktar (JSON)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { backupFileInputRef.current?.click(); setIsUserMenuOpen(false); }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#21262d] text-left cursor-pointer"
                        title="Başka bilgisayardan indirilen JSON yedeğini yükle"
                      >
                        <Upload className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Yedekten İçe Aktar (JSON)</span>
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
                </>
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

        <div className={step === 'cockpit'
          ? 'px-3 sm:px-4 py-3 pb-24 md:pb-4 w-full space-y-3'
          : 'p-3 sm:p-6 pb-24 md:pb-6 w-full max-w-[1600px] mx-auto space-y-5'
        }>

          {/* KOKPİT / RAPOR GEÇİŞLERİNDE KÜRESEL ANALİZ İLERLEME ÇUBUĞU */}
          {loading && statusMessage && step !== 'input' && (
            <div className="bg-[#151922] border border-emerald-500/40 rounded-xl p-4 flex items-center justify-between gap-4 shadow-xl animate-in fade-in duration-150">
              <div className="flex items-center gap-3 min-w-0">
                <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-mono font-bold text-emerald-400">CANLI ANALİZ MOTORU ÇALIŞIYOR</div>
                  <div className="text-xs sm:text-sm text-slate-200 truncate">{statusMessage}</div>
                </div>
              </div>
              {pipelineProgress > 0 && (
                <span className="text-xs font-mono font-bold text-[#f5c242] shrink-0">%{pipelineProgress}</span>
              )}
            </div>
          )}

          {/* KÜRESEL HATA BANNER'I */}
          {error && (
            <div className="p-4 bg-rose-950/85 border border-rose-700/70 rounded-xl flex items-center justify-between gap-3 text-rose-200 text-sm shadow-lg">
              <div className="flex items-center gap-3 min-w-0">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-400" />
                <span className="break-words">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                aria-label="Hata mesajını kapat"
                className="p-1 rounded-lg text-rose-300 hover:text-white hover:bg-rose-900/60 transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ADIM 0: PİYASA KOKPİTİ (VARSAYILAN ANA EKRAN) */}
          {step === 'cockpit' && (
            <ComponentErrorBoundary fallbackTitle="Piyasa Kokpiti Hatası">
              <MarketCockpit
                savedReports={savedReports}
                portfolioTickers={portfolioTickers}
                favoriteTickers={favoriteTickers}
                liveNewsFeed={liveNewsFeed}
                onToggleFavorite={toggleFavorite}
                onOpenTicker={handleOpenOrAnalyzeTicker}
                onOpenReport={openReport}
                onSelectDisclosure={openDisclosureModal}
              />
            </ComponentErrorBoundary>
          )}
          
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
                    {extractedData.ticker || ticker} • {getCompanySectorDisplayName(extractedData.ticker || ticker, currentSector)}
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

              <div className="overflow-x-auto touch-pan-x border border-slate-800 rounded-lg">
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead className="bg-slate-950 text-slate-300 border-b border-slate-800">
                    <tr>
                      <th className="p-3 sticky left-0 bg-slate-950 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] min-w-[130px]">Dönem</th>
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
                          <td className="p-3 font-bold text-white flex items-center gap-1.5 sticky left-0 bg-slate-900 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] min-w-[130px]">
                            <span>{row.period}</span>
                            {row.is_tms29 && (
                              <span className="text-[9px] font-sans font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
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
                  onClick={() => handleEvaluate()}
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
              <div className="flex items-center justify-between gap-3 pb-1 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="fv-pill inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-[#181b20] hover:bg-[#222731] border border-[#2b313d] rounded-lg cursor-pointer shadow-sm flex-shrink-0"
                  title="Geri Dön"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Geri Dön</span>
                </button>

                {/* Aynı hisseye ait farklı çeyrek/analiz raporları seçici (Çoklu Bilanço / Tarih Hafızası) */}
                {(() => {
                  const currentTickerUpper = (activeReport?.ticker || '').toUpperCase();
                  const tickerReports = savedReports
                    .filter(r => (r.ticker || '').toUpperCase() === currentTickerUpper)
                    .sort((a, b) => {
                      const pDiff = parsePeriodSortKey(b.period || b.extractedData?.reporting_period || '') - parsePeriodSortKey(a.period || a.extractedData?.reporting_period || '');
                      if (pDiff !== 0) return pDiff;
                      return reportTimestamp(b) - reportTimestamp(a);
                    });

                  if (tickerReports.length <= 1) return null;

                  return (
                    <div className="flex items-center gap-1.5 overflow-x-auto max-w-[55vw] sm:max-w-[65vw] py-1 no-scrollbar">
                      {tickerReports.map((r) => {
                        const isCurrent = r.id === activeReport?.id;
                        const periodText = r.period || 'Bilanço';
                        const dateText = formatAnalysisDate(r.createdAt);
                        const label = `${periodText} - Analiz: ${dateText}`;

                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => openReport(r.id, r.ticker)}
                            onAuxClick={(e) => {
                              if (e.button === 1) {
                                e.preventDefault();
                                window.open(`/analysis/${r.ticker.toUpperCase()}`, '_blank');
                              }
                            }}
                            className={`fv-pill px-2.5 py-1 text-xs font-mono rounded-lg whitespace-nowrap border cursor-pointer ${
                              isCurrent
                                ? 'bg-[#f5c242]/15 text-[#f5c242] border-[#f5c242]/50 font-bold shadow-sm'
                                : 'bg-[#181b20] text-slate-400 hover:text-white hover:bg-[#222731] border-[#2b313d]'
                            }`}
                            title={`${r.ticker} ${label}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyNotebookLM}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-[#21262d] rounded-md transition cursor-pointer"
                    title={copiedNotebookLM ? "Kopyalandı" : "Verileri Kopyala"}
                    aria-label="Verileri Kopyala"
                  >
                    {copiedNotebookLM ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReport(activeReport.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition cursor-pointer"
                    title="Raporu Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <SimplyView
                key={activeReport.id}
                report={activeReport}
                initialTab={activeTab}
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
                  resetToNewAnalysis();
                  setTicker(tk);
                  setStep('input');
                  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
                }}
                onSelectReport={(id: string) => openReport(id)}
              />
            </div>
          )}

          {/* HİSSE TARAMA & LİDERLİK SIRALAMA PANELİ */}
          {step === 'leaderboard' && (() => {
            if (!userSession?.isLoggedIn) {
              return renderAuthGate('Hisse Tarama');
            }

            // Hisse Tarama için her şirketin en güncel dönem raporunu al (şirket başına tek satır)
            const deduplicatedLatestReports = getLatestReportsPerTicker(savedReports);
            const ranked = sortReportsByRank(deduplicatedLatestReports);
            const filtered = ranked.filter(r => {
              const matchesSearch = !leaderboardSearch.trim() || 
                r.ticker.toLowerCase().includes(leaderboardSearch.toLowerCase().trim()) ||
                ((r as any).companyName || r.extractedData?.company_name || '').toLowerCase().includes(leaderboardSearch.toLowerCase().trim());
              const matchesFilter = leaderboardFilter === 'ALL' || r.decision === leaderboardFilter;
              const matchesIndex = matchesIndexFilter(r.ticker, leaderboardIndexFilter);
              return matchesSearch && matchesFilter && matchesIndex;
            });

            const indexCounts = (() => {
              let all = 0, b30 = 0, b50 = 0, b100 = 0, non100 = 0;
              for (const r of deduplicatedLatestReports) {
                all++;
                const sym = r.ticker;
                if (isBist30(sym)) b30++;
                if (isBist50(sym)) b50++;
                if (isBist100(sym)) b100++;
                if (isBistNon100(sym)) non100++;
              }
              return { all, b30, b50, b100, non100 };
            })();

            const sortedLeaderboard = [...filtered].sort((a, b) => {
              const { key, direction } = leaderboardSort;
              let valA: any = null;
              let valB: any = null;
              if (key === 'ticker') { valA = a.ticker || ''; valB = b.ticker || ''; }
              else if (key === 'decision') {
                const rankDecision = (d: string) => {
                  const norm = (d || '').trim().toUpperCase();
                  if (norm === 'AL') return 1;
                  if (norm === 'NÖTR' || norm === 'NOTR') return 2;
                  if (norm === 'ALMA') return 3;
                  return 4;
                };
                valA = rankDecision(a.decision);
                valB = rankDecision(b.decision);
              }
              else if (key === 'period') {
                valA = parsePeriodSortKey(a.period || a.extractedData?.reporting_period || '');
                valB = parsePeriodSortKey(b.period || b.extractedData?.reporting_period || '');
              }
              else if (key === 'price') { valA = parseFinancialNumber(a.price) ?? 0; valB = parseFinancialNumber(b.price) ?? 0; }
              else if (key === 'fairValue') { valA = parseFinancialNumber(a.fairValue) ?? 0; valB = parseFinancialNumber(b.fairValue) ?? 0; }
              else if (key === 'score') {
                valA = parseNumericScore(a.score) ?? -1;
                valB = parseNumericScore(b.score) ?? -1;
              }
              else if (key === 'discount') {
                const fvA = parseFinancialNumber(a.fairValue) ?? 0;
                const pA = parseFinancialNumber(a.price) ?? 0;
                valA = (fvA > 0 && pA > 0) ? ((fvA - pA) / pA) * 100 : -999;
                const fvB = parseFinancialNumber(b.fairValue) ?? 0;
                const pB = parseFinancialNumber(b.price) ?? 0;
                valB = (fvB > 0 && pB > 0) ? ((fvB - pB) / pB) * 100 : -999;
              }

              if (key === 'decision') {
                // AL-NÖTR-ALMA (asc) veya ALMA-NÖTR-AL (desc)
                const diff = direction === 'asc' ? valA - valB : valB - valA;
                if (diff !== 0) return diff;
                const scoreA = parseNumericScore(a.score) ?? -1;
                const scoreB = parseNumericScore(b.score) ?? -1;
                return scoreB - scoreA;
              }

              if (typeof valA === 'string') {
                const cmp = valA.localeCompare(valB, 'tr');
                return direction === 'asc' ? cmp : -cmp;
              } else {
                return direction === 'asc' ? (valA ?? 0) - (valB ?? 0) : (valB ?? 0) - (valA ?? 0);
              }
            });

            const handleLeaderboardSortClick = (colKey: string, isNumeric: boolean) => {
              setLeaderboardSort(prev => {
                if (prev.key === colKey) {
                  return { key: colKey, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
                }
                return { key: colKey, direction: isNumeric ? 'desc' : 'asc' };
              });
            };

            const leaderboardMetrics = (() => {
              let alCnt = 0, notrCnt = 0, almaCnt = 0;
              let sumScore = 0, scoreCnt = 0;
              let sumDisc = 0, discCnt = 0;
              let topAl: { id: string; ticker: string; discount: number } | null = null;
              for (const r of sortedLeaderboard) {
                const dec = (r.decision || '').trim().toUpperCase();
                if (dec === 'AL') alCnt++;
                else if (dec === 'ALMA') almaCnt++;
                else notrCnt++;
                const sc = parseNumericScore(r.score);
                if (sc != null) { sumScore += sc; scoreCnt++; }
                const fv = parseFinancialNumber(r.fairValue) ?? 0;
                const pr = parseFinancialNumber(r.price) ?? 0;
                if (fv > 0 && pr > 0) {
                  const d = Number((((fv - pr) / pr) * 100).toFixed(1));
                  sumDisc += d;
                  discCnt++;
                  if (dec === 'AL' && (!topAl || d > topAl.discount)) {
                    topAl = { id: r.id, ticker: r.ticker, discount: d };
                  }
                }
              }
              return {
                total: sortedLeaderboard.length,
                alCnt,
                notrCnt,
                almaCnt,
                avgScore: scoreCnt > 0 ? Math.round(sumScore / scoreCnt) : null,
                avgDiscount: discCnt > 0 ? Number((sumDisc / discCnt).toFixed(1)) : null,
                topAl
              };
            })();

            const batchScopeLists = (() => {
              const periodFreq = new Map<number, number>();
              let maxP = 0;
              for (const r of deduplicatedLatestReports) {
                const pk = parsePeriodSortKey(r.period || r.extractedData?.reporting_period || '');
                if (pk > 0) {
                  periodFreq.set(pk, (periodFreq.get(pk) || 0) + 1);
                  if (pk > maxP) maxP = pk;
                }
              }
              let dominantKey = maxP;
              const candidatesDominant = Array.from(periodFreq.entries())
                .filter(([, cnt]) => cnt >= 5)
                .sort((a, b) => b[0] - a[0]);
              if (candidatesDominant.length > 0) {
                dominantKey = candidatesDominant[0][0];
              }
              const formatKeyLabel = (k: number) => {
                if (!k || k < 200000) return '—';
                const yr = Math.floor(k / 100);
                const mo = String(k % 100).padStart(2, '0');
                return `${yr}/${mo}`;
              };

              const outdated = deduplicatedLatestReports
                .filter(r => {
                  const pk = parsePeriodSortKey(r.period || r.extractedData?.reporting_period || '');
                  return dominantKey > 0 && pk > 0 && pk < dominantKey;
                })
                .map(r => r.ticker);

              const portList = Array.from(new Set(portfolioTickers.map(t => t.toUpperCase().trim()).filter(Boolean)));
              const favList = Array.from(new Set(favoriteTickers.map(t => t.toUpperCase().trim()).filter(Boolean)));
              const bist30List = [...OFFICIAL_BIST_30_TICKERS];
              const bist100List = [...OFFICIAL_BIST_100_TICKERS];
              const allSavedList = deduplicatedLatestReports.map(r => r.ticker);

              const map: Record<typeof batchScope, string[]> = {
                OUTDATED_QUARTER: outdated,
                PORTFOLIO: portList,
                FAVORITES: favList,
                BIST30: bist30List,
                BIST100: bist100List,
                ALL_SAVED: allSavedList,
              };

              return {
                dominantPeriodLabel: formatKeyLabel(dominantKey),
                counts: {
                  OUTDATED_QUARTER: outdated.length,
                  PORTFOLIO: portList.length,
                  FAVORITES: favList.length,
                  BIST30: bist30List.length,
                  BIST100: bist100List.length,
                  ALL_SAVED: allSavedList.length,
                },
                activeTickers: map[batchScope] || [],
              };
            })();

            const attributionRows = (() => {
              const list: Array<{ report: SavedReport; delta: PeriodChangeAttribution }> = [];
              for (const r of deduplicatedLatestReports) {
                const delta = resolveReportAttribution(r);
                if (delta) list.push({ report: r, delta });
              }
              list.sort((a, b) => {
                const transWeight = (d: PeriodChangeAttribution) =>
                  d.decisionTransition === 'UNCHANGED' ? 0 : 1000;
                const scoreDiff =
                  transWeight(b.delta) +
                  Math.abs(b.delta.scoreDelta ?? 0) * 10 +
                  Math.abs(b.delta.fairValueDeltaPct ?? 0) +
                  (b.delta.improvements.length + b.delta.deteriorations.length) -
                  (transWeight(a.delta) +
                    Math.abs(a.delta.scoreDelta ?? 0) * 10 +
                    Math.abs(a.delta.fairValueDeltaPct ?? 0) +
                    (a.delta.improvements.length + a.delta.deteriorations.length));
                return scoreDiff;
              });
              return list;
            })();

            const upgradedCnt = attributionRows.filter(x => x.delta.decisionTransition === 'UPGRADED').length;
            const downgradedCnt = attributionRows.filter(x => x.delta.decisionTransition === 'DOWNGRADED').length;
            const scoreUpList = attributionRows.filter(x => (x.delta.scoreDelta ?? 0) > 0);
            const scoreDownList = attributionRows.filter(x => (x.delta.scoreDelta ?? 0) < 0);
            const avgScoreUpDelta = scoreUpList.length > 0
              ? Number((scoreUpList.reduce((s, x) => s + (x.delta.scoreDelta ?? 0), 0) / scoreUpList.length).toFixed(1))
              : null;
            const avgScoreDownDelta = scoreDownList.length > 0
              ? Number((scoreDownList.reduce((s, x) => s + (x.delta.scoreDelta ?? 0), 0) / scoreDownList.length).toFixed(1))
              : null;

            const filteredAttributionRows = attributionRows.filter(({ report, delta }) => {
              const q = batchChangeSearch.trim().toLowerCase();
              if (q) {
                const name = ((report as any).companyName || report.extractedData?.company_name || '').toLowerCase();
                if (!report.ticker.toLowerCase().includes(q) && !name.includes(q)) return false;
              }
              if (batchChangeFilter === 'UPGRADED') return delta.decisionTransition === 'UPGRADED';
              if (batchChangeFilter === 'DOWNGRADED') return delta.decisionTransition === 'DOWNGRADED';
              if (batchChangeFilter === 'SCORE_UP') return (delta.scoreDelta ?? 0) > 0;
              if (batchChangeFilter === 'SCORE_DOWN') return (delta.scoreDelta ?? 0) < 0;
              return true;
            });

            return (
              <div className="space-y-4">
                <div className="bg-[#151821] border border-[#232834] px-5 py-4 rounded-xl space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight font-sans">
                        Hisse Tarama
                      </h2>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-[#101319] text-slate-300 border border-[#232834]">
                        {leaderboardMetrics.total}
                      </span>
                      {isSyncing && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-300 bg-[#101319] border border-[#232834] px-2.5 py-0.5 rounded-md">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Senkronize ediliyor...</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {leaderboardSubTab === 'SCREENER' && (
                        <>
                          <button
                            type="button"
                            onClick={() => setLeaderboardSubTab('BATCH_CHANGES')}
                            className="fv-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Toplu Güncelle</span>
                          </button>
                          <div className="flex items-center bg-[#101319] p-0.5 rounded-lg border border-[#232834]">
                            <button
                              type="button"
                              onClick={() => setLeaderboardViewMode('list')}
                              className={`p-1.5 rounded-md cursor-pointer transition-colors ${
                                leaderboardViewMode === 'list'
                                  ? 'bg-[#222836] text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                              title="Liste Görünümü"
                            >
                              <List className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setLeaderboardViewMode('icons')}
                              className={`p-1.5 rounded-md cursor-pointer transition-colors ${
                                leaderboardViewMode === 'icons'
                                  ? 'bg-[#222836] text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                              title="Kart Görünümü"
                            >
                              <LayoutGrid className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Alt Sekmeler (Underline Tab Bar) */}
                  <div className="border-b border-[#232834] flex items-center gap-6 overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={() => setLeaderboardSubTab('SCREENER')}
                      className={`pb-2.5 text-xs whitespace-nowrap cursor-pointer border-b-2 transition-colors ${
                        leaderboardSubTab === 'SCREENER'
                          ? 'border-slate-100 text-white font-semibold'
                          : 'border-transparent text-slate-400 hover:text-slate-200 font-medium'
                      }`}
                    >
                      Tarama Listesi ({leaderboardMetrics.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaderboardSubTab('BATCH_CHANGES')}
                      className={`pb-2.5 text-xs whitespace-nowrap cursor-pointer border-b-2 transition-colors inline-flex items-center gap-2 ${
                        leaderboardSubTab === 'BATCH_CHANGES'
                          ? 'border-slate-100 text-white font-semibold'
                          : 'border-transparent text-slate-400 hover:text-slate-200 font-medium'
                      }`}
                    >
                      <span>Toplu Güncelleme &amp; Dönemsel Değişimler</span>
                      {batchProgress.running ? (
                        <span className="text-[10.5px] font-mono text-emerald-400">
                          {batchProgress.processed}/{batchProgress.total}
                        </span>
                      ) : (upgradedCnt + downgradedCnt) > 0 ? (
                        <span className="text-[10.5px] font-mono text-slate-400">
                          {upgradedCnt + downgradedCnt} karar değişimi
                        </span>
                      ) : null}
                    </button>
                  </div>
                </div>

                {leaderboardSubTab === 'SCREENER' ? (
                <>
                {/* 4'lü KPI Özet Şeridi */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="bg-[#151821] border border-[#262c38] rounded-2xl p-4 flex flex-col justify-between space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">TARANAN ŞİRKET</div>
                    <div className="text-2xl font-black font-mono text-white">{leaderboardMetrics.total}</div>
                    <div className="text-[11px] font-mono text-slate-500">BIST Güncel Bilançolar</div>
                  </div>

                  <div className="bg-[#151821] border border-[#262c38] rounded-2xl p-4 flex flex-col justify-between space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">KARAR DAĞILIMI</div>
                    <div className="flex items-center gap-2 font-mono text-xs font-bold">
                      <span className="text-emerald-400">{leaderboardMetrics.alCnt} AL</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-amber-300">{leaderboardMetrics.notrCnt} NÖTR</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-rose-400">{leaderboardMetrics.almaCnt} ALMA</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#101319] overflow-hidden flex">
                      {leaderboardMetrics.total > 0 && (
                        <>
                          <div className="h-full bg-emerald-400" style={{ width: `${(leaderboardMetrics.alCnt / leaderboardMetrics.total) * 100}%` }} />
                          <div className="h-full bg-amber-400" style={{ width: `${(leaderboardMetrics.notrCnt / leaderboardMetrics.total) * 100}%` }} />
                          <div className="h-full bg-rose-400" style={{ width: `${(leaderboardMetrics.almaCnt / leaderboardMetrics.total) * 100}%` }} />
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-[#151821] border border-[#262c38] rounded-2xl p-4 flex flex-col justify-between space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">ORTALAMA POTANSİYEL</div>
                    <div className={`text-2xl font-black font-mono ${
                      leaderboardMetrics.avgDiscount == null ? 'text-slate-400' : leaderboardMetrics.avgDiscount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {leaderboardMetrics.avgDiscount != null
                        ? `${leaderboardMetrics.avgDiscount >= 0 ? '+' : ''}%${leaderboardMetrics.avgDiscount}`
                        : '—'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      Ort. Kalite Skoru: <strong className="text-white">{leaderboardMetrics.avgScore != null ? `${leaderboardMetrics.avgScore}/100` : '—'}</strong>
                    </div>
                  </div>

                  <div className="bg-[#151821] border border-[#262c38] rounded-2xl p-4 flex flex-col justify-between space-y-2">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">EN YÜKSEK POTANSİYEL</div>
                    {leaderboardMetrics.topAl ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openReport(leaderboardMetrics.topAl!.id, leaderboardMetrics.topAl!.ticker)}
                          className="text-left group cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xl font-black font-mono text-white group-hover:text-emerald-400 transition">
                              {leaderboardMetrics.topAl.ticker}
                            </span>
                            <span className="text-sm font-black font-mono text-emerald-400">
                              +%{leaderboardMetrics.topAl.discount}
                            </span>
                          </div>
                        </button>
                        <div className="text-[11px] font-mono text-slate-500">En Yüksek AL İskontosu</div>
                      </>
                    ) : (
                      <>
                        <div className="text-xl font-black font-mono text-slate-500">—</div>
                        <div className="text-[11px] font-mono text-slate-500">AL Kararlı Fırsat Yok</div>
                      </>
                    )}
                  </div>
                </div>

                <div className="bg-[#12151c] border border-[#262c38] rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 border-b border-[#232834] flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-[#101319]">
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={leaderboardSearch}
                        onChange={e => setLeaderboardSearch(e.target.value)}
                        placeholder="Hisse kodu veya şirket ara (Örn: THYAO)..."
                        className="w-full bg-[#161a23] border border-[#2b313d] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* BIST Endeks Filtresi */}
                      <div className="flex items-center gap-1 bg-[#161a23] p-1 rounded-xl border border-[#262c38] text-xs">
                        <span className="text-[10px] uppercase font-bold text-slate-500 px-1.5 select-none hidden sm:inline">Endeks:</span>
                        {([
                          { key: 'ALL', label: 'Tümü', count: indexCounts.all, activeCls: 'bg-slate-700 text-white' },
                          { key: 'BIST30', label: 'BIST 30', count: indexCounts.b30, activeCls: 'bg-indigo-600 text-white' },
                          { key: 'BIST50', label: 'BIST 50', count: indexCounts.b50, activeCls: 'bg-cyan-600 text-white' },
                          { key: 'BIST100', label: 'BIST 100', count: indexCounts.b100, activeCls: 'bg-sky-600 text-white' },
                          { key: 'BIST_NON100', label: 'BIST 100 Dışı', count: indexCounts.non100, activeCls: 'bg-purple-600 text-white' }
                        ] as const).map(f => (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => setLeaderboardIndexFilter(f.key)}
                            className={`fv-pill px-2 py-1 rounded-lg text-[11px] font-semibold cursor-pointer flex items-center gap-1.5 ${
                              leaderboardIndexFilter === f.key ? f.activeCls : 'text-slate-400 hover:text-white'
                            }`}
                            title={`${f.label} (${f.count} hisse)`}
                          >
                            <span>{f.label}</span>
                            <span className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                              leaderboardIndexFilter === f.key ? 'bg-black/30 text-white' : 'text-slate-500'
                            }`}>
                              {f.count}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Karar Filtresi */}
                      <div className="flex items-center gap-1 bg-[#161a23] p-1 rounded-xl border border-[#262c38] text-xs">
                        <span className="text-[10px] uppercase font-bold text-slate-500 px-1.5 select-none hidden sm:inline">Karar:</span>
                        {(['ALL', 'AL', 'NÖTR', 'ALMA'] as const).map(f => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setLeaderboardFilter(f)}
                            className={`fv-pill px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                              leaderboardFilter === f
                                ? f === 'AL' ? 'bg-emerald-600 text-white'
                                  : f === 'ALMA' ? 'bg-rose-600 text-white'
                                  : f === 'NÖTR' ? 'bg-amber-600 text-white'
                                  : 'bg-slate-700 text-white'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {f === 'ALL' ? 'Tümü' : f}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {leaderboardViewMode === 'icons' ? (
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {sortedLeaderboard.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-slate-500 text-xs">
                          Kriterlere uygun kayıtlı hisse bulunamadı.
                        </div>
                      ) : (
                        sortedLeaderboard.map((item) => {
                          const fvNum = parseFinancialNumber(item.fairValue) ?? 0;
                          const prNum = parseFinancialNumber(item.price) ?? 0;
                          const discNum = (fvNum > 0 && prNum > 0) ? Number((((fvNum - prNum) / prNum) * 100).toFixed(1)) : null;
                          const isCheap = discNum != null && discNum >= 0;
                          const indexBadge = getBistIndexBadge(item.ticker);
                          const isCompared = compareTickers.includes((item.ticker || '').toUpperCase());

                          return (
                            <div
                              key={item.id}
                              onClick={() => openReport(item.id, item.ticker)}
                              onAuxClick={(e) => {
                                if (e.button === 1) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.open(`/analysis/${item.ticker.toUpperCase()}`, '_blank');
                                }
                              }}
                              className="fv-card bg-[#151821] hover:bg-[#1a1f2b] border border-[#262c38] hover:border-emerald-500/50 rounded-xl p-3.5 flex flex-col justify-between gap-3 cursor-pointer shadow-sm group select-none"
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <a
                                      href={`/analysis/${item.ticker.toUpperCase()}`}
                                      onClick={(e) => {
                                        if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
                                          e.preventDefault();
                                          openReport(item.id, item.ticker);
                                        }
                                      }}
                                      onAuxClick={(e) => {
                                        if (e.button === 1) {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          window.open(`/analysis/${item.ticker.toUpperCase()}`, '_blank');
                                        }
                                      }}
                                      className="font-mono font-black text-sm text-white group-hover:text-emerald-400 transition tracking-tight"
                                    >
                                      {item.ticker}
                                    </a>
                                    <span className={`text-[9px] font-mono px-1 py-0.5 rounded border leading-none font-bold ${indexBadge.badgeClass}`}>
                                      {indexBadge.label}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-sans truncate max-w-[95px]">
                                    {item.sector ? getCompanySectorDisplayName(item.ticker, item.sector) : 'BIST'}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleCompareTicker(item.ticker);
                                    }}
                                    className={`p-1 rounded transition cursor-pointer ${
                                      isCompared ? 'text-cyan-400 bg-cyan-500/15' : 'text-slate-500 hover:text-cyan-400 hover:bg-slate-800'
                                    }`}
                                    title={isCompared ? 'Kıyaslamadan Çıkar' : 'Yan Yana Kıyasla'}
                                  >
                                    <Scale className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(item.ticker);
                                    }}
                                    className="p-1 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition cursor-pointer"
                                    title={favoriteTickers.includes(item.ticker) ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                                  >
                                    <Star className={`w-3.5 h-3.5 ${favoriteTickers.includes(item.ticker) ? 'fill-amber-400 text-amber-400' : 'text-slate-500'}`} />
                                  </button>
                                  <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${
                                    item.decision === 'AL' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80' :
                                    item.decision === 'ALMA' ? 'bg-rose-950/80 text-rose-400 border border-rose-800/80' :
                                    'bg-amber-950/80 text-amber-400 border border-amber-800/80'
                                  }`}>
                                    {item.decision || '—'}
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-1.5 pt-2 border-t border-[#232834]">
                                <div className="flex items-center justify-between text-xs font-mono">
                                  <span className="text-slate-400 text-[11px]">Fiyat:</span>
                                  <span className="text-slate-200 font-semibold">{prNum > 0 ? `₺${prNum.toFixed(2)}` : '—'}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs font-mono">
                                  <span className="text-slate-400 text-[11px]">Adil Değer:</span>
                                  <span className="text-[#f5c242] font-bold">{fvNum > 0 ? `₺${fvNum.toFixed(2)}` : '—'}</span>
                                </div>
                                {discNum !== null && (
                                  <div className="flex items-center justify-between text-[11px] font-mono">
                                    <span className="text-slate-400">Potansiyel:</span>
                                    <span className={`font-bold ${isCheap ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {isCheap ? `+${Math.abs(discNum).toFixed(1)}%` : `-${Math.abs(discNum).toFixed(1)}%`}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-[#232834] text-[11px] font-mono">
                                <span className="text-slate-400">Skor:</span>
                                <span className={`font-bold ${getScoreColorStyle(item.score).text}`}>{formatScore(item.score)}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-[#101319] border-b border-[#232834] text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                        <tr>
                          <th className="p-3.5 pl-5">Sıra</th>
                          <th 
                            onClick={() => handleLeaderboardSortClick('ticker', false)}
                            className="p-3.5 cursor-pointer select-none hover:text-white transition group"
                            title="Hisse Koduna Göre Sırala"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span>Hisse</span>
                              {leaderboardSort.key === 'ticker' && (
                                <span className="text-[#f5c242] font-mono text-xs">{leaderboardSort.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </span>
                          </th>
                          <th 
                            onClick={() => handleLeaderboardSortClick('price', true)}
                            className="p-3.5 text-right cursor-pointer select-none hover:text-white transition group"
                            title="Fiyata Göre Sırala"
                          >
                            <span className="inline-flex items-center justify-end gap-1.5 w-full">
                              <span>Fiyat</span>
                              {leaderboardSort.key === 'price' && (
                                <span className="text-[#f5c242] font-mono text-xs">{leaderboardSort.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </span>
                          </th>
                          <th 
                            onClick={() => handleLeaderboardSortClick('fairValue', true)}
                            className="p-3.5 text-right cursor-pointer select-none hover:text-white transition group"
                            title="Adil Değere Göre Sırala"
                          >
                            <span className="inline-flex items-center justify-end gap-1.5 w-full">
                              <span>Adil Değer</span>
                              {leaderboardSort.key === 'fairValue' && (
                                <span className="text-[#f5c242] font-mono text-xs">{leaderboardSort.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </span>
                          </th>
                          <th 
                            onClick={() => handleLeaderboardSortClick('discount', true)}
                            className="p-3.5 text-center cursor-pointer select-none hover:text-white transition group"
                            title="İskonto / Prim Oranına Göre Sırala"
                          >
                            <span className="inline-flex items-center justify-center gap-1.5 w-full">
                              <span>İskonto / Prim</span>
                              {leaderboardSort.key === 'discount' && (
                                <span className="text-[#f5c242] font-mono text-xs">{leaderboardSort.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </span>
                          </th>
                          <th 
                            onClick={() => handleLeaderboardSortClick('score', true)}
                            className="p-3.5 text-right cursor-pointer select-none hover:text-white transition group"
                            title="Skora Göre Sırala"
                          >
                            <span className="inline-flex items-center justify-end gap-1.5 w-full">
                              <span>Skor</span>
                              {leaderboardSort.key === 'score' && (
                                <span className="text-[#f5c242] font-mono text-xs">{leaderboardSort.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </span>
                          </th>
                          <th 
                            onClick={() => handleLeaderboardSortClick('decision', false)}
                            className="p-3.5 text-center cursor-pointer select-none hover:text-white transition group"
                            title="Karara Göre Sırala"
                          >
                            <span className="inline-flex items-center justify-center gap-1.5 w-full">
                              <span>Karar</span>
                              {leaderboardSort.key === 'decision' && (
                                <span className="text-[#f5c242] font-mono text-xs">{leaderboardSort.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </span>
                          </th>
                          <th 
                            onClick={() => handleLeaderboardSortClick('period', false)}
                            className="p-3.5 cursor-pointer select-none hover:text-white transition group"
                            title="Döneme Göre Sırala"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span>Dönem / Kayıt</span>
                              {leaderboardSort.key === 'period' && (
                                <span className="text-[#f5c242] font-mono text-xs">{leaderboardSort.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </span>
                          </th>
                          <th className="p-3.5 text-center">FAV</th>
                          <th className="p-3.5 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1e232e]">
                        {sortedLeaderboard.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="p-8 text-center text-slate-500 text-xs">
                              Kriterlere uygun rapor bulunamadı.
                            </td>
                          </tr>
                        ) : (
                          sortedLeaderboard.map((item, index) => {
                            const fvNum = parseFinancialNumber(item.fairValue) ?? 0;
                            const prNum = parseFinancialNumber(item.price) ?? 0;
                            const discNum = (fvNum > 0 && prNum > 0) ? Number((((fvNum - prNum) / prNum) * 100).toFixed(1)) : null;
                            const barWidth = discNum !== null ? Math.max(12, Math.min(100, Math.round(Math.abs(discNum)))) : 0;
                            const isCompared = compareTickers.includes((item.ticker || '').toUpperCase());

                            return (
                            <tr
                              key={item.id}
                              onClick={() => openReport(item.id, item.ticker)}
                              onAuxClick={(e) => {
                                if (e.button === 1) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.open(`/analysis/${item.ticker.toUpperCase()}`, '_blank');
                                }
                              }}
                              className="fv-row hover:bg-[#1a1f2b] cursor-pointer"
                            >
                              <td className="p-3.5 pl-5 font-mono font-bold text-slate-400">
                                #{index + 1}
                              </td>
                              <td className="p-3.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`fv-monogram w-6 h-6 rounded-md border font-mono text-[10px] font-bold shrink-0 ${getSectorMonogramCls(item.ticker, item.sector)}`}>
                                    {(item.ticker || '').slice(0, 2)}
                                  </span>
                                  <a
                                    href={`/analysis/${item.ticker.toUpperCase()}`}
                                    onClick={(e) => {
                                      if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
                                        e.preventDefault();
                                        openReport(item.id, item.ticker);
                                      }
                                    }}
                                    onAuxClick={(e) => {
                                      if (e.button === 1) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.open(`/analysis/${item.ticker.toUpperCase()}`, '_blank');
                                      }
                                    }}
                                    className="font-bold text-sm text-white font-mono hover:text-[#f5c242] transition"
                                  >
                                    {item.ticker}
                                  </a>
                                  {(() => {
                                    const badge = getBistIndexBadge(item.ticker);
                                    return (
                                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border leading-none font-bold ${badge.badgeClass}`}>
                                        {badge.label}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="p-3.5 text-right font-mono font-semibold text-slate-200">
                                {prNum > 0 ? `₺${prNum.toFixed(2)}` : '—'}
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-[#f5c242]">
                                {fvNum > 0 ? `₺${fvNum.toFixed(2)}` : '—'}
                              </td>
                              <td className="p-3.5 text-center font-mono">
                                {discNum !== null ? (
                                  <div className="inline-flex flex-col items-center gap-1 min-w-[78px]">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                      discNum >= 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                    }`}>
                                      {discNum >= 0 ? `+${discNum}%` : `${discNum}%`}
                                    </span>
                                    <div className="w-full h-1 rounded-full bg-[#101319] overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${discNum >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                        style={{ width: `${barWidth}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : <span className="text-slate-500">—</span>}
                              </td>
                              <td className={`p-3.5 text-right font-mono font-bold text-sm ${getScoreColorStyle(item.score).text}`}>
                                {formatScore(item.score)}
                              </td>
                              <td className="p-3.5 text-center">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  item.decision === 'AL' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80' :
                                  item.decision === 'ALMA' ? 'bg-rose-950/80 text-rose-400 border border-rose-800/80' :
                                  'bg-amber-950/80 text-amber-400 border border-amber-800/80'
                                }`}>
                                  {item.decision}
                                </span>
                              </td>
                              <td className="p-3.5 text-slate-400 font-mono text-[11px]">
                                {item.period || item.createdAt}
                              </td>
                              <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(item.ticker);
                                  }}
                                  className={`p-1.5 rounded transition cursor-pointer ${
                                    favoriteTickers.includes(item.ticker)
                                      ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10'
                                      : 'text-slate-500 hover:text-amber-400 hover:bg-slate-800'
                                  }`}
                                  title={favoriteTickers.includes(item.ticker) ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                                >
                                  <Star
                                    className={`w-4 h-4 ${
                                      favoriteTickers.includes(item.ticker) ? 'fill-amber-400 text-amber-400' : 'text-slate-500'
                                    }`}
                                  />
                                </button>
                              </td>
                              <td className="p-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleCompareTicker(item.ticker);
                                    }}
                                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                      isCompared
                                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/40'
                                        : 'text-slate-400 hover:text-cyan-400 border-transparent hover:bg-slate-800'
                                    }`}
                                    title={isCompared ? 'Kıyaslamadan Çıkar' : 'Yan Yana Kıyasla'}
                                  >
                                    <Scale className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => deleteReport(item.id, e)}
                                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                                    title="Sil"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
                </>
                ) : (
                  <div className="space-y-4">
                    {/* Toplu Bilanço Güncelleme Kontrol Paneli */}
                    <div className="bg-[#151821] border border-[#232834] rounded-xl p-4 sm:p-5 space-y-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold text-white font-sans">
                            Toplu Çeyrek Bilanço Güncelleme
                          </h3>
                          <p className="text-xs text-slate-400 font-sans">
                            Seçili kapsamdaki hisseler 3&apos;erli gruplar halinde Borsa İstanbul / İş Yatırım üzerinden güncellenir. Mevcut en yoğun dönem:{' '}
                            <span className="font-mono text-slate-200">{batchScopeLists.dominantPeriodLabel}</span>.
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            disabled={batchProgress.running}
                            onClick={() => setBatchOnlyNewQuarter(v => !v)}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors disabled:opacity-50 ${
                              batchOnlyNewQuarter
                                ? 'bg-[#222836] text-white border-[#3b4458]'
                                : 'bg-[#101319] text-slate-400 hover:text-slate-200 border-[#232834]'
                            }`}
                            title="Açık olduğunda aynı bilanço dönemindeki hisseler veritabanına yeniden yazılmadan atlanır"
                          >
                            {batchOnlyNewQuarter ? 'Yalnızca Yeni Dönem Gelenler' : 'Tümünü Yeniden Hesapla'}
                          </button>

                          {batchProgress.running ? (
                            <button
                              type="button"
                              onClick={stopBatchQuarterRefresh}
                              className="px-3.5 py-1.5 rounded-lg bg-[#222836] hover:bg-[#2c3447] text-rose-400 border border-[#3b4458] text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Durdur</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={batchScopeLists.activeTickers.length === 0}
                              onClick={() => startBatchQuarterRefresh(batchScopeLists.activeTickers)}
                              className="fv-btn-primary px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Güncellemeyi Başlat ({batchScopeLists.activeTickers.length})</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Kapsam Seçici */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {([
                          { id: 'OUTDATED_QUARTER', label: 'Eski Dönemde Kalanlar', count: batchScopeLists.counts.OUTDATED_QUARTER },
                          { id: 'PORTFOLIO', label: 'Portföyüm', count: batchScopeLists.counts.PORTFOLIO },
                          { id: 'FAVORITES', label: 'Favorilerim', count: batchScopeLists.counts.FAVORITES },
                          { id: 'BIST30', label: 'BIST 30', count: batchScopeLists.counts.BIST30 },
                          { id: 'BIST100', label: 'BIST 100', count: batchScopeLists.counts.BIST100 },
                          { id: 'ALL_SAVED', label: 'Tüm Kayıtlılar', count: batchScopeLists.counts.ALL_SAVED },
                        ] as const).map(opt => (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={batchProgress.running}
                            onClick={() => setBatchScope(opt.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 ${
                              batchScope === opt.id
                                ? 'bg-[#222836] text-white border-[#3b4458]'
                                : 'bg-[#101319] text-slate-400 hover:text-slate-200 border-[#232834]'
                            }`}
                          >
                            <span>{opt.label}</span>
                            <span className="font-mono text-[11px] text-slate-400">{opt.count}</span>
                          </button>
                        ))}
                      </div>

                      {batchScope === 'OUTDATED_QUARTER' && batchScopeLists.counts.OUTDATED_QUARTER === 0 && !batchProgress.running && (
                        <p className="text-[11px] text-slate-400 font-sans">
                          Tüm kayıtlı şirketler şu an aynı dönemde ({batchScopeLists.dominantPeriodLabel}). Yeni bilanço sezonu başladığında bu sekmeden veya Portföyüm / BIST 30 / BIST 100 seçimiyle yalnızca yeni bilanço açıklayanları güncelleyebilirsiniz.
                        </p>
                      )}

                      {/* Canlı İlerleme Çubuğu */}
                      {(batchProgress.running || batchProgress.processed > 0) && (
                        <div className="p-3 rounded-lg bg-[#101319] border border-[#232834] space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                            <div className="text-slate-300">
                              {batchProgress.running
                                ? `İşleniyor: ${batchProgress.currentTickers.join(', ')}`
                                : 'Toplu güncelleme tamamlandı'}
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span className="text-slate-300">
                                {batchProgress.processed}/{batchProgress.total}
                              </span>
                              <span className="text-emerald-400 font-semibold">
                                {batchProgress.updated} güncellendi
                              </span>
                              <span className="text-slate-400">
                                {batchProgress.skipped} aynı dönem
                              </span>
                              {batchProgress.failed > 0 && (
                                <span className="text-rose-400 font-semibold">
                                  {batchProgress.failed} hata
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#151821] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-slate-200 transition-all duration-300"
                              style={{
                                width: `${batchProgress.total > 0 ? Math.round((batchProgress.processed / batchProgress.total) * 100) : 0}%`,
                              }}
                            />
                          </div>
                          {batchProgress.results.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                              {batchProgress.results.slice(0, 36).map((res, idx) => (
                                <span
                                  key={`${res.ticker}-${idx}`}
                                  title={res.error || (res.prevPeriod && res.newPeriod ? `${res.prevPeriod} → ${res.newPeriod}` : '')}
                                  className="px-2 py-0.5 rounded bg-[#151821] border border-[#232834] text-[11px] font-mono inline-flex items-center gap-1"
                                >
                                  <span className="text-white font-semibold">{res.ticker}</span>
                                  <span
                                    className={
                                      res.status === 'UPDATED'
                                        ? 'text-emerald-400'
                                        : res.status === 'FAILED'
                                        ? 'text-rose-400'
                                        : 'text-slate-500'
                                    }
                                  >
                                    {res.status === 'UPDATED' ? 'Güncel' : res.status === 'FAILED' ? 'Hata' : 'Atlandı'}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 4 Metrikli Dönemsel Değişim Özeti */}
                    <div className="bg-[#151821] border border-[#232834] rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#232834] overflow-hidden tabular-nums">
                      <div className="p-4 space-y-1">
                        <div className="text-[11px] font-sans font-medium text-slate-400">Karar Yükselenler</div>
                        <div className="text-lg font-semibold font-mono text-emerald-400">{upgradedCnt} Şirket</div>
                        <div className="text-[11px] font-sans text-slate-500">NÖTR / ALMA → AL geçişi</div>
                      </div>
                      <div className="p-4 space-y-1">
                        <div className="text-[11px] font-sans font-medium text-slate-400">Karar Düşenler</div>
                        <div className="text-lg font-semibold font-mono text-rose-400">{downgradedCnt} Şirket</div>
                        <div className="text-[11px] font-sans text-slate-500">AL → NÖTR / ALMA geçişi</div>
                      </div>
                      <div className="p-4 space-y-1">
                        <div className="text-[11px] font-sans font-medium text-slate-400">Skoru İyileşenler</div>
                        <div className="text-lg font-semibold font-mono text-emerald-400">{scoreUpList.length} Şirket</div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {avgScoreUpDelta !== null ? `Ort. +${avgScoreUpDelta} puan` : 'Veri yok'}
                        </div>
                      </div>
                      <div className="p-4 space-y-1">
                        <div className="text-[11px] font-sans font-medium text-slate-400">Skoru Gerileyenler</div>
                        <div className="text-lg font-semibold font-mono text-rose-400">{scoreDownList.length} Şirket</div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {avgScoreDownDelta !== null ? `Ort. ${avgScoreDownDelta} puan` : 'Veri yok'}
                        </div>
                      </div>
                    </div>

                    {/* Filtre ve Arama Barı */}
                    <div className="bg-[#151821] border border-[#232834] px-4 py-3 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                        {([
                          { key: 'ALL', label: `Tümü (${attributionRows.length})` },
                          { key: 'UPGRADED', label: `Karar Yükselenler (${upgradedCnt})` },
                          { key: 'DOWNGRADED', label: `Karar Düşenler (${downgradedCnt})` },
                          { key: 'SCORE_UP', label: `Skoru Artanlar (${scoreUpList.length})` },
                          { key: 'SCORE_DOWN', label: `Skoru Düşenler (${scoreDownList.length})` },
                        ] as const).map(f => (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => setBatchChangeFilter(f.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap cursor-pointer transition-colors ${
                              batchChangeFilter === f.key
                                ? 'bg-[#222836] text-white border-[#3b4458]'
                                : 'bg-[#101319] text-slate-400 hover:text-slate-200 border-transparent'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      <div className="relative w-full lg:w-64">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={batchChangeSearch}
                          onChange={e => setBatchChangeSearch(e.target.value)}
                          placeholder="Hisse veya şirket ara..."
                          className="w-full bg-[#101319] border border-[#232834] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-400 font-sans"
                        />
                        {batchChangeSearch && (
                          <button
                            type="button"
                            onClick={() => setBatchChangeSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                            aria-label="Aramayı temizle"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Dönemsel Değişim ve Değerleme Etkisi Tablosu */}
                    <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                      <div className="overflow-x-auto touch-pan-x no-scrollbar">
                        <table className="w-full text-left text-xs border-collapse font-sans">
                          <thead>
                            <tr className="border-b border-[#232834] bg-[#101319] text-[11px] font-sans font-medium text-slate-400">
                              <th className="py-2.5 px-4">Hisse</th>
                              <th className="py-2.5 px-3">Dönem Geçişi</th>
                              <th className="py-2.5 px-3 text-center">Karar Etkisi</th>
                              <th className="py-2.5 px-3 text-center">Skor Etkisi</th>
                              <th className="py-2.5 px-3 text-right">Adil Değer Etkisi</th>
                              <th className="py-2.5 px-3">Ana İyileşme / Bozulma</th>
                              <th className="py-2.5 px-4 text-right">Detay</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#232834] text-slate-200 tabular-nums">
                            {filteredAttributionRows.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                                  Seçili filtreye uyan dönemsel değişim kaydı bulunamadı.
                                </td>
                              </tr>
                            ) : (
                              filteredAttributionRows.slice(0, 100).map(({ report, delta }) => {
                                const isExpanded = !!expandedDeltaTickers[report.ticker];
                                const scoreCls =
                                  (delta.scoreDelta ?? 0) > 0
                                    ? 'text-emerald-400'
                                    : (delta.scoreDelta ?? 0) < 0
                                    ? 'text-rose-400'
                                    : 'text-slate-400';
                                const fvCls =
                                  (delta.fairValueDeltaPct ?? 0) > 0
                                    ? 'text-emerald-400'
                                    : (delta.fairValueDeltaPct ?? 0) < 0
                                    ? 'text-rose-400'
                                    : 'text-slate-400';
                                const decCls =
                                  delta.decisionTransition === 'UPGRADED'
                                    ? 'text-emerald-400'
                                    : delta.decisionTransition === 'DOWNGRADED'
                                    ? 'text-rose-400'
                                    : 'text-slate-300';

                                return (
                                  <React.Fragment key={report.id}>
                                    <tr
                                      onClick={() =>
                                        setExpandedDeltaTickers(prev => ({
                                          ...prev,
                                          [report.ticker]: !prev[report.ticker],
                                        }))
                                      }
                                      className="fv-row cursor-pointer group"
                                    >
                                      <td className="py-3 px-4">
                                        <div className="font-mono font-semibold text-sm text-white group-hover:underline">
                                          {report.ticker}
                                        </div>
                                        <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                                          {getCompanySectorDisplayName(report.ticker, report.sector)}
                                        </div>
                                      </td>
                                      <td className="py-3 px-3 font-mono text-xs text-slate-300 whitespace-nowrap">
                                        {delta.prevPeriod && delta.currPeriod && delta.prevPeriod !== delta.currPeriod
                                          ? `${delta.prevPeriod} → ${delta.currPeriod}`
                                          : delta.currPeriod || '—'}
                                      </td>
                                      <td className="py-3 px-3 text-center font-mono whitespace-nowrap">
                                        {delta.prevDecision && delta.prevDecision !== delta.currDecision ? (
                                          <span className={`font-semibold ${decCls}`}>
                                            {delta.prevDecision} → {delta.currDecision}
                                          </span>
                                        ) : (
                                          <span className="text-slate-300">{delta.currDecision} (Sabit)</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-3 text-center font-mono whitespace-nowrap">
                                        {delta.prevScore !== null && delta.currScore !== null ? (
                                          <div>
                                            <span className="text-white font-medium">
                                              {delta.prevScore} → {delta.currScore}
                                            </span>
                                            {delta.scoreDelta !== null && delta.scoreDelta !== 0 && (
                                              <span className={`ml-1.5 font-semibold ${scoreCls}`}>
                                                ({delta.scoreDelta > 0 ? `+${delta.scoreDelta}` : delta.scoreDelta})
                                              </span>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-slate-500">—</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                                        {delta.currFairValue !== null ? (
                                          <div>
                                            <div className="text-white font-medium">
                                              {delta.prevFairValue !== null
                                                ? `₺${delta.prevFairValue.toFixed(2)} → ₺${delta.currFairValue.toFixed(2)}`
                                                : `₺${delta.currFairValue.toFixed(2)}`}
                                            </div>
                                            {delta.fairValueDeltaPct !== null && (
                                              <div className={`text-[11px] font-semibold ${fvCls}`}>
                                                {delta.fairValueDeltaPct > 0 ? '+' : ''}%{delta.fairValueDeltaPct}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-slate-500">—</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-3 max-w-[260px]">
                                        <div className="space-y-0.5 text-[11px]">
                                          {delta.improvements[0] && (
                                            <div className="text-emerald-400 truncate">
                                              + {delta.improvements[0].label} ({delta.improvements[0].deltaFormatted})
                                            </div>
                                          )}
                                          {delta.deteriorations[0] && (
                                            <div className="text-rose-400 truncate">
                                              − {delta.deteriorations[0].label} ({delta.deteriorations[0].deltaFormatted})
                                            </div>
                                          )}
                                          {!delta.improvements[0] && !delta.deteriorations[0] && (
                                            <div className="text-slate-500">Yatay / Dengeli</div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                                        <div className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setExpandedDeltaTickers(prev => ({
                                                ...prev,
                                                [report.ticker]: !prev[report.ticker],
                                              }))
                                            }
                                            className="p-1.5 rounded-md bg-[#101319] hover:bg-[#222836] border border-[#232834] text-slate-300 cursor-pointer"
                                            title={isExpanded ? 'Detayı Daralt' : 'İyileşen / Kötüleşen Kalemleri Aç'}
                                          >
                                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => openReport(report.id, report.ticker)}
                                            className="p-1.5 rounded-md bg-[#101319] hover:bg-[#222836] border border-[#232834] text-slate-300 hover:text-white cursor-pointer"
                                            title="Tam Raporu Aç"
                                          >
                                            <ArrowUpRight className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>

                                    {isExpanded && (
                                      <tr className="bg-[#101319]">
                                        <td colSpan={7} className="p-4 space-y-3 border-t border-[#232834]">
                                          <p className="text-xs text-slate-300 font-sans leading-relaxed">
                                            {delta.impactNarrative}
                                          </p>
                                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
                                            <div className="p-3 rounded-lg bg-[#151821] border border-[#232834] space-y-2">
                                              <div className="font-sans font-semibold text-slate-200 text-[11px]">
                                                İyileşen Kalemler ({delta.improvements.length})
                                              </div>
                                              {delta.improvements.length === 0 ? (
                                                <div className="text-[11px] text-slate-500">Öne çıkan belirgin iyileşme yok.</div>
                                              ) : (
                                                <div className="space-y-1.5">
                                                  {delta.improvements.map(imp => (
                                                    <div key={imp.key} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                                                      <span className="text-slate-300 font-sans">{imp.label}</span>
                                                      <span className="text-emerald-400 font-semibold">
                                                        {imp.prevFormatted} → {imp.currFormatted} ({imp.deltaFormatted})
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>

                                            <div className="p-3 rounded-lg bg-[#151821] border border-[#232834] space-y-2">
                                              <div className="font-sans font-semibold text-slate-200 text-[11px]">
                                                Kötüleşen Kalemler ({delta.deteriorations.length})
                                              </div>
                                              {delta.deteriorations.length === 0 ? (
                                                <div className="text-[11px] text-slate-500">Belirgin bozulma tespit edilmedi.</div>
                                              ) : (
                                                <div className="space-y-1.5">
                                                  {delta.deteriorations.map(det => (
                                                    <div key={det.key} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                                                      <span className="text-slate-300 font-sans">{det.label}</span>
                                                      <span className="text-rose-400 font-semibold">
                                                        {det.prevFormatted} → {det.currFormatted} ({det.deltaFormatted})
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>

                                            <div className="p-3 rounded-lg bg-[#151821] border border-[#232834] space-y-2">
                                              <div className="font-sans font-semibold text-slate-200 text-[11px]">
                                                Skor &amp; Değerleme Etkisi (4 Boyut)
                                              </div>
                                              {delta.scoreBreakdownDeltas.length === 0 ? (
                                                <div className="text-[11px] text-slate-500">Alt kırılım karşılaştırması mevcut değil.</div>
                                              ) : (
                                                <div className="space-y-1.5">
                                                  {delta.scoreBreakdownDeltas.map(cat => (
                                                    <div key={cat.category} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                                                      <span className="text-slate-300 font-sans truncate max-w-[165px]">{cat.category}</span>
                                                      <span className="shrink-0">
                                                        <span className="text-slate-200">{cat.prevScore} → {cat.currScore}/{cat.maxScore}</span>
                                                        {cat.delta !== 0 && (
                                                          <span className={`ml-1 font-semibold ${cat.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            ({cat.delta > 0 ? `+${cat.delta}` : cat.delta})
                                                          </span>
                                                        )}
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                              <div className="pt-1 flex justify-end">
                                                <button
                                                  type="button"
                                                  onClick={() => openReport(report.id, report.ticker)}
                                                  className="text-[11px] font-sans font-medium text-slate-300 hover:text-white underline cursor-pointer"
                                                >
                                                  Tam Raporu Aç →
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          
          {/* BIST 53 RESMİ İŞ YATIRIM SEKTÖR VE ŞİRKET LİSTESİ PANELİ */}
          {step === 'sectors' && (() => {
            const deduplicatedSectorReports = getLatestReportsPerTicker(savedReports);
            const sectorReportsMap: Record<string, SavedReport[]> = {};

            // 53 sektörün tamamını ilklendir
            ISYATIRIM_53_OFFICIAL_SECTOR_NAMES.forEach(sec => {
              sectorReportsMap[sec] = [];
            });

            // Her hissenin en güncel raporunu resmi sektörüne ata
            deduplicatedSectorReports.forEach(rep => {
              const secName = getCompanySectorDisplayName(rep.ticker, rep.sector);
              if (!sectorReportsMap[secName]) {
                sectorReportsMap[secName] = [];
              }
              sectorReportsMap[secName].push(rep);
            });

            const sectorRichList = Object.entries(sectorReportsMap).map(([secName, reps]) => {
              const sortedReps = sortReportsByScoreDesc(reps);
              const alCount = sortedReps.filter(r => (r.decision || '').trim().toUpperCase() === 'AL').length;
              const almaCount = sortedReps.filter(r => (r.decision || '').trim().toUpperCase() === 'ALMA').length;
              const notrCount = sortedReps.length - alCount - almaCount;

              const validScores = sortedReps
                .map(r => parseNumericScore(r.score))
                .filter((s): s is number => s !== null && Number.isFinite(s));
              const avgScore = validScores.length > 0
                ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
                : null;

              const validUpsides = sortedReps
                .map(r => {
                  const fv = parseFinancialNumber(r.fairValue) ?? 0;
                  const pr = parseFinancialNumber(r.price) ?? 0;
                  return fv > 0 && pr > 0 ? ((fv - pr) / pr) * 100 : null;
                })
                .filter((u): u is number => u !== null && Number.isFinite(u));
              const avgUpside = validUpsides.length > 0
                ? Number((validUpsides.reduce((a, b) => a + b, 0) / validUpsides.length).toFixed(1))
                : null;

              const officialAvg = findOfficialSectorAverage(secName);
              return { secName, reports: sortedReps, alCount, notrCount, almaCount, avgScore, avgUpside, officialAvg };
            });

            const activeSectors = sectorRichList.filter(s => s.reports.length > 0);
            const activeSectorCount = activeSectors.length;
            const coveragePct = Math.round((activeSectorCount / Math.max(1, ISYATIRIM_53_OFFICIAL_SECTOR_NAMES.length)) * 100);

            const topScoreSector = [...activeSectors]
              .filter(s => s.avgScore !== null)
              .sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1))[0] || null;
            const topUpsideSector = [...activeSectors]
              .filter(s => s.avgUpside !== null)
              .sort((a, b) => (b.avgUpside ?? -999) - (a.avgUpside ?? -999))[0] || null;

            const filteredSectors = sectorRichList.filter(({ secName, reports }) => {
              if (sectorFilterTab === 'ACTIVE' && reports.length === 0) return false;
              if (sectorSearchTerm.trim()) {
                const q = sectorSearchTerm.toLocaleLowerCase('tr-TR').trim();
                const matchesSector = secName.toLocaleLowerCase('tr-TR').includes(q);
                const matchesCompany = reports.some(r =>
                  r.ticker.toLocaleLowerCase('tr-TR').includes(q) ||
                  ((r as any).companyName || r.extractedData?.company_name || '').toLocaleLowerCase('tr-TR').includes(q)
                );
                return matchesSector || matchesCompany;
              }
              return true;
            });

            const sortedSectorEntries = [...filteredSectors].sort((a, b) => {
              if (sectorSortMode === 'alpha') {
                return a.secName.localeCompare(b.secName, 'tr');
              }
              if (sectorSortMode === 'score') {
                const diff = (b.avgScore ?? -1) - (a.avgScore ?? -1);
                if (diff !== 0) return diff;
              } else if (sectorSortMode === 'upside') {
                const diff = (b.avgUpside ?? -999) - (a.avgUpside ?? -999);
                if (diff !== 0) return diff;
              }
              if (b.reports.length !== a.reports.length) return b.reports.length - a.reports.length;
              return a.secName.localeCompare(b.secName, 'tr');
            });

            const isSearchAutoExpanded = sectorSearchTerm.trim().length > 0 && sortedSectorEntries.length <= 5;
            const isSectorExpanded = (sec: string) =>
              isSearchAutoExpanded ? (expandedSectors[sec] !== false) : !!expandedSectors[sec];

            const toggleSector = (sec: string) => {
              if (isSearchAutoExpanded) {
                setExpandedSectors(prev => ({ ...prev, [sec]: prev[sec] === false ? true : false }));
                return;
              }
              setExpandedSectors(prev => ({
                ...prev,
                [sec]: prev[sec] === undefined ? true : !prev[sec]
              }));
            };

            const focusSector = (sec: string) => {
              setSectorSearchTerm('');
              setSectorFilterTab('ACTIVE');
              setExpandedSectors(prev => ({ ...prev, [sec]: true }));
            };

            const allVisibleExpanded = sortedSectorEntries.length > 0 && sortedSectorEntries.every(s => isSectorExpanded(s.secName));
            const toggleAllSectors = (expand: boolean) => {
              const next: Record<string, boolean> = {};
              sortedSectorEntries.forEach(s => {
                next[s.secName] = expand;
              });
              setExpandedSectors(next);
            };

            return (
              <div className="space-y-5 fv-panel-enter">
                {/* ÜST BAŞLIK & SEKTÖR RADAR KONTROL PANELİ */}
                <div className="bg-[#151821] border border-[#262c38] rounded-2xl p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                        <Layers className="w-5 h-5" />
                      </div>
                      <h2 className="text-xl font-bold text-white tracking-tight font-sans">
                        BIST Sektörler
                      </h2>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Analiz Edilmiş / Tümü */}
                      <div className="flex items-center gap-1 bg-[#101319] p-1 rounded-xl border border-[#262c38]">
                        <button
                          type="button"
                          onClick={() => setSectorFilterTab('ACTIVE')}
                          className={`fv-pill px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                            sectorFilterTab === 'ACTIVE'
                              ? 'bg-emerald-600 text-white font-bold shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Analiz Edilmiş ({activeSectorCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSectorFilterTab('ALL')}
                          className={`fv-pill px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                            sectorFilterTab === 'ALL'
                              ? 'bg-emerald-600 text-white font-bold shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Tümü (53)
                        </button>
                      </div>

                      {/* Tümünü Aç / Kapat */}
                      {sortedSectorEntries.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleAllSectors(!allVisibleExpanded)}
                          className="fv-pill px-3 py-1.5 rounded-xl bg-[#101319] hover:bg-[#1e232e] border border-[#262c38] text-xs font-medium text-slate-300 hover:text-white cursor-pointer flex items-center gap-1.5"
                        >
                          {allVisibleExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          <span>{allVisibleExpanded ? 'Daralt' : 'Tümünü Aç'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 4-KART SEKTÖR İSTİHBARAT ŞERİDİ */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="fv-kpi-card bg-[#101319] border border-[#232834] rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>SEKTÖR KAPSAMA</span>
                        <span className="text-emerald-400 font-bold">%{coveragePct}</span>
                      </div>
                      <div className="text-lg font-mono font-bold text-white">
                        {activeSectorCount} <span className="text-xs text-slate-400 font-normal">/ 53 sektör</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#1c212b] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" style={{ width: `${Math.max(3, coveragePct)}%` }} />
                      </div>
                    </div>

                    <div className="fv-kpi-card bg-[#101319] border border-[#232834] rounded-xl p-3.5 space-y-1.5">
                      <div className="text-[11px] font-mono text-slate-400">ANALİZ EDİLEN ŞİRKET</div>
                      <div className="text-lg font-mono font-bold text-white">
                        {deduplicatedSectorReports.length} <span className="text-xs text-slate-400 font-normal">tekil hisse</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        <span className="text-emerald-400 font-semibold">{deduplicatedSectorReports.filter(r => r.decision === 'AL').length} AL</span>
                        {' · '}
                        <span className="text-amber-400 font-semibold">{deduplicatedSectorReports.filter(r => r.decision !== 'AL' && r.decision !== 'ALMA').length} NÖTR</span>
                        {' · '}
                        <span className="text-rose-400 font-semibold">{deduplicatedSectorReports.filter(r => r.decision === 'ALMA').length} ALMA</span>
                      </div>
                    </div>

                    <div
                      role={topScoreSector ? 'button' : undefined}
                      tabIndex={topScoreSector ? 0 : undefined}
                      onClick={() => topScoreSector && focusSector(topScoreSector.secName)}
                      onKeyDown={(e) => {
                        if (topScoreSector && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          focusSector(topScoreSector.secName);
                        }
                      }}
                      className={`fv-kpi-card bg-[#101319] border border-[#232834] rounded-xl p-3.5 space-y-1.5 ${topScoreSector ? 'cursor-pointer hover:border-emerald-500/40' : ''}`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>EN YÜKSEK ORT. SKOR</span>
                        {topScoreSector && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      {topScoreSector ? (
                        <>
                          <div className="text-sm font-sans font-bold text-white truncate" title={topScoreSector.secName}>
                            {topScoreSector.secName}
                          </div>
                          <div className="flex items-center gap-2 text-xs font-mono">
                            <span className={`font-bold ${getScoreColorStyle(topScoreSector.avgScore).text}`}>
                              {topScoreSector.avgScore}/100
                            </span>
                            <span className="text-slate-500">({topScoreSector.reports.length} hisse)</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-500 font-mono pt-1">Henüz analiz yok</div>
                      )}
                    </div>

                    <div
                      role={topUpsideSector && topUpsideSector.avgUpside !== null ? 'button' : undefined}
                      tabIndex={topUpsideSector && topUpsideSector.avgUpside !== null ? 0 : undefined}
                      onClick={() => topUpsideSector && focusSector(topUpsideSector.secName)}
                      onKeyDown={(e) => {
                        if (topUpsideSector && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          focusSector(topUpsideSector.secName);
                        }
                      }}
                      className={`fv-kpi-card bg-[#101319] border border-[#232834] rounded-xl p-3.5 space-y-1.5 ${topUpsideSector && topUpsideSector.avgUpside !== null ? 'cursor-pointer hover:border-emerald-500/40' : ''}`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>EN YÜKSEK POTANSİYEL</span>
                        {topUpsideSector && topUpsideSector.avgUpside !== null && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      {topUpsideSector && topUpsideSector.avgUpside !== null ? (
                        <>
                          <div className="text-sm font-sans font-bold text-white truncate" title={topUpsideSector.secName}>
                            {topUpsideSector.secName}
                          </div>
                          <div className="flex items-center gap-2 text-xs font-mono">
                            <span className={`font-bold ${topUpsideSector.avgUpside >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {topUpsideSector.avgUpside >= 0 ? `+%${topUpsideSector.avgUpside}` : `-%${Math.abs(topUpsideSector.avgUpside)}`}
                            </span>
                            <span className="text-slate-500">ort. marj</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-500 font-mono pt-1">Henüz analiz yok</div>
                      )}
                    </div>
                  </div>

                  {/* ARAMA & SIRALAMA BAR */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-[#232834]">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={sectorSearchTerm}
                        onChange={(e) => setSectorSearchTerm(e.target.value)}
                        placeholder="Sektör adı, hisse kodu veya şirket ara (Örn: Bankacılık, THYAO)..."
                        className="w-full bg-[#101319] border border-[#262c38] rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                      />
                      {sectorSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setSectorSearchTerm('')}
                          aria-label="Aramayı temizle"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-500 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="text-[11px] font-mono text-slate-500 mr-1">Sırala:</span>
                      {[
                        { id: 'count', label: 'Şirket Sayısı' },
                        { id: 'score', label: 'Ort. Skor' },
                        { id: 'upside', label: 'Potansiyel' },
                        { id: 'alpha', label: 'A-Z' }
                      ].map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSectorSortMode(opt.id as any)}
                          className={`fv-pill px-2.5 py-1 rounded-lg font-medium border cursor-pointer ${
                            sectorSortMode === opt.id
                              ? 'bg-[#21262d] text-emerald-400 border-emerald-500/40 font-semibold'
                              : 'bg-[#101319] text-slate-400 border-[#232834] hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SEKTÖR AKORDİYON KARTLARI */}
                {sortedSectorEntries.length === 0 ? (
                  <div className="p-12 text-center rounded-2xl border border-[#262c38] bg-[#151821] space-y-3">
                    <Building2 className="w-12 h-12 mx-auto text-slate-600 opacity-60" />
                    <h4 className="text-base font-bold text-slate-200">Kriterlere Uygun Sektör Bulunamadı</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Arama kriterinizi temizleyebilir veya &ldquo;Tümü (53)&rdquo; sekmesine geçerek tüm resmi BIST alt sektörlerini görüntüleyebilirsiniz.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setSectorSearchTerm(''); setSectorFilterTab('ALL'); }}
                      className="fv-pill inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                    >
                      <span>Tüm 53 Sektörü Göster</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedSectorEntries.map(({ secName, reports, alCount, notrCount, almaCount, avgScore, avgUpside, officialAvg }) => {
                      const isExpanded = isSectorExpanded(secName);
                      const hasReports = reports.length > 0;
                      const alPct = hasReports ? (alCount / reports.length) * 100 : 0;
                      const notrPct = hasReports ? (notrCount / reports.length) * 100 : 0;
                      const almaPct = hasReports ? (almaCount / reports.length) * 100 : 0;

                      return (
                        <div
                          key={secName}
                          className={`bg-[#151821] border rounded-2xl overflow-hidden transition ${
                            isExpanded
                              ? 'border-emerald-500/40'
                              : 'border-[#262c38] hover:border-[#384252]'
                          }`}
                        >
                          {/* Zengin Sektör Özet Başlığı */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleSector(secName)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleSector(secName);
                              }
                            }}
                            className="py-3.5 px-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer select-none transition group hover:bg-[#1b202b]"
                          >
                            {/* Sol: İkon + Sektör Adı + İş Yatırım Resmi Çarpan Benchmarkları */}
                            <div className="flex items-start sm:items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition ${
                                hasReports
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 group-hover:bg-emerald-500/20'
                                  : 'bg-[#101319] border-[#262c38] text-slate-500'
                              }`}>
                                <Building2 className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm sm:text-[15px] font-bold text-white group-hover:text-emerald-400 transition font-sans">
                                    {secName}
                                  </span>
                                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                                    hasReports
                                      ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                                      : 'bg-[#101319] text-slate-500 border-[#262c38]'
                                  }`}>
                                    {reports.length} şirket
                                  </span>
                                </div>
                                {officialAvg && (officialAvg.pe || officialAvg.pb || officialAvg.evEbitda) && (
                                  <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-slate-400">
                                    <span className="text-slate-500">Sektör Ort:</span>
                                    {officialAvg.pe != null && (
                                      <span className="px-1.5 py-0.5 rounded bg-[#101319] border border-[#232834] text-slate-300">
                                        F/K <strong className="text-white">{officialAvg.pe.toFixed(1)}x</strong>
                                      </span>
                                    )}
                                    {officialAvg.pb != null && (
                                      <span className="px-1.5 py-0.5 rounded bg-[#101319] border border-[#232834] text-slate-300">
                                        PD/DD <strong className="text-white">{officialAvg.pb.toFixed(2)}x</strong>
                                      </span>
                                    )}
                                    {officialAvg.evEbitda != null && (
                                      <span className="px-1.5 py-0.5 rounded bg-[#101319] border border-[#232834] text-slate-300">
                                        FD/FAVÖK <strong className="text-white">{officialAvg.evEbitda.toFixed(1)}x</strong>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Sağ: Karar Dağılım Çubuğu + Ort. Skor + Ort. Potansiyel + Chevron */}
                            <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0 pl-12 lg:pl-0">
                              {hasReports && (
                                <>
                                  {/* Karar Dağılım Çubuğu */}
                                  <div className="hidden sm:flex flex-col items-end gap-1 min-w-[115px]">
                                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                                      {alCount > 0 && <span className="text-emerald-400 font-bold">{alCount} AL</span>}
                                      {notrCount > 0 && <span className="text-amber-400 font-bold">{notrCount} NÖTR</span>}
                                      {almaCount > 0 && <span className="text-rose-400 font-bold">{almaCount} ALMA</span>}
                                    </div>
                                    <div className="h-1.5 w-28 rounded-full bg-[#101319] overflow-hidden flex">
                                      {alPct > 0 && <div className="h-full bg-emerald-400" style={{ width: `${alPct}%` }} />}
                                      {notrPct > 0 && <div className="h-full bg-amber-400" style={{ width: `${notrPct}%` }} />}
                                      {almaPct > 0 && <div className="h-full bg-rose-400" style={{ width: `${almaPct}%` }} />}
                                    </div>
                                  </div>

                                  {avgScore !== null && (
                                    <div className="text-right font-mono">
                                      <div className="text-[10px] text-slate-500">ORT. SKOR</div>
                                      <div className={`text-xs font-bold ${getScoreColorStyle(avgScore).text}`}>
                                        {avgScore}/100
                                      </div>
                                    </div>
                                  )}

                                  {avgUpside !== null && (
                                    <div className="text-right font-mono min-w-[66px]">
                                      <div className="text-[10px] text-slate-500">POTANSİYEL</div>
                                      <div className={`text-xs font-bold ${avgUpside >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {avgUpside >= 0 ? `+%${avgUpside}` : `-%${Math.abs(avgUpside)}`}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}

                              <div className={`w-7 h-7 rounded-lg bg-[#101319] border border-[#262c38] flex items-center justify-center text-slate-400 group-hover:text-white group-hover:border-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-emerald-400 border-emerald-500/40' : ''}`}>
                                <ChevronDown className="w-4 h-4" />
                              </div>
                            </div>
                          </div>

                          {/* Sektöre Ait Şirket Tablosu veya Boş Durum */}
                          {isExpanded && (
                            <div className="border-t border-[#232834]">
                              {reports.length === 0 ? (
                                <div className="p-6 text-center bg-[#101319]/60 space-y-2.5">
                                  <p className="text-xs text-slate-400">
                                    Bu sektörde henüz analiz edilmiş hisse bulunmuyor.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={resetToNewAnalysis}
                                    className="fv-pill px-3.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-semibold border border-emerald-500/35 cursor-pointer"
                                  >
                                    + {secName} Sektöründe Şirket Analiz Et
                                  </button>
                                </div>
                              ) : (
                                <div className="overflow-x-auto touch-pan-x no-scrollbar">
                                  <table className="w-full text-left text-sm border-collapse font-sans">
                                    <thead>
                                      <tr className="border-b border-[#262c38] bg-[#101319] text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                                        <th className="py-3 px-4 sticky left-0 bg-[#101319] z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] min-w-[125px]">Hisse</th>
                                        <th className="py-3 px-4">Şirket Ünvanı</th>
                                        <th className="py-3 px-3 text-right">Fiyat</th>
                                        <th className="py-3 px-3 text-right">Adil Değer</th>
                                        <th className="py-3 px-4 text-center">İskonto / Prim</th>
                                        <th className="py-3 px-3 text-center">Skor</th>
                                        <th className="py-3 px-3 text-center">Karar</th>
                                        <th className="py-3 px-4 text-right">İşlem</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#232834] text-slate-300">
                                      {reports.map((rep, idx) => {
                                        const fv = parseFinancialNumber(rep.fairValue) ?? 0;
                                        const pr = parseFinancialNumber(rep.price) ?? 0;
                                        const disc = (fv > 0 && pr > 0) ? Number((((fv - pr) / pr) * 100).toFixed(1)) : null;
                                        const compName = (rep as any).companyName || rep.extractedData?.company_name || '';
                                        const symUpper = (rep.ticker || '').toUpperCase();
                                        const inPort = portfolioTickers.includes(symUpper);
                                        const inFav = favoriteTickers.includes(symUpper);

                                        return (
                                          <tr
                                            key={rep.id}
                                            onClick={() => openReport(rep.id, rep.ticker)}
                                            onAuxClick={(e) => {
                                              if (e.button === 1) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                window.open(`/analysis/${rep.ticker.toUpperCase()}`, '_blank');
                                              }
                                            }}
                                            className="fv-row cursor-pointer group"
                                          >
                                            <td className="py-3 px-4 sticky left-0 bg-[#151821] group-hover:bg-[#1c222d] z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] min-w-[125px]">
                                              <div className="flex items-center gap-2">
                                                <span className="font-mono text-[11px] text-slate-500 w-5">#{idx + 1}</span>
                                                <a
                                                  href={`/analysis/${rep.ticker.toUpperCase()}`}
                                                  onClick={(e) => {
                                                    if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
                                                      e.preventDefault();
                                                      openReport(rep.id, rep.ticker);
                                                    }
                                                  }}
                                                  onAuxClick={(e) => {
                                                    if (e.button === 1) {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      window.open(`/analysis/${rep.ticker.toUpperCase()}`, '_blank');
                                                    }
                                                  }}
                                                  className="font-mono font-bold text-white text-sm sm:text-base group-hover:text-[#f5c242] transition"
                                                >
                                                  {rep.ticker}
                                                </a>
                                                {rep.period && (
                                                  <span className="text-[10px] font-mono text-slate-500 hidden xl:inline">{rep.period}</span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-3 px-4 text-xs text-slate-300 font-sans truncate max-w-[220px]">
                                              {compName || '—'}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono font-bold text-white">
                                              {pr > 0 ? `₺${pr.toFixed(2)}` : '—'}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono font-bold text-[#f5c242]">
                                              {fv > 0 ? `₺${fv.toFixed(2)}` : '—'}
                                            </td>
                                            <td className="py-3 px-4 text-center font-mono">
                                              {disc !== null ? (
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                                  disc >= 0
                                                    ? 'bg-emerald-500/12 text-emerald-400 border-emerald-500/30'
                                                    : 'bg-rose-500/12 text-rose-400 border-rose-500/30'
                                                }`}>
                                                  {disc >= 0 ? `+${disc}%` : `${disc}%`}
                                                </span>
                                              ) : <span className="text-slate-500">—</span>}
                                            </td>
                                            <td className={`py-3 px-3 text-center font-mono font-bold text-xs ${getScoreColorStyle(rep.score).text}`}>
                                              {formatScore(rep.score)}
                                            </td>
                                            <td className="py-3 px-3 text-center font-mono">
                                              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${
                                                rep.decision === 'AL' ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80' :
                                                rep.decision === 'ALMA' ? 'bg-rose-950/80 text-rose-400 border-rose-800/80' :
                                                'bg-amber-950/80 text-amber-400 border-amber-800/80'
                                              }`}>
                                                {rep.decision || 'N/A'}
                                              </span>
                                            </td>
                                            <td className="py-3 px-4 text-right font-sans">
                                              <div className="inline-flex items-center gap-1.5">
                                                <button
                                                  type="button"
                                                  onClick={(e) => { e.stopPropagation(); toggleFavorite(rep.ticker); }}
                                                  title={inFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                                                  className={`p-1.5 rounded-lg border cursor-pointer ${
                                                    inFav
                                                      ? 'bg-amber-400/15 text-amber-300 border-amber-400/40'
                                                      : 'bg-[#101319] text-slate-500 hover:text-amber-300 border-[#262c38]'
                                                  }`}
                                                >
                                                  <Star className={`w-3.5 h-3.5 ${inFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => { e.stopPropagation(); togglePortfolio(rep.ticker); }}
                                                  title={inPort ? 'Portföyden Çıkar' : 'Portföye Ekle'}
                                                  className={`p-1.5 rounded-lg border cursor-pointer ${
                                                    inPort
                                                      ? 'bg-[#f5c242]/15 text-[#f5c242] border-[#f5c242]/40'
                                                      : 'bg-[#101319] text-slate-500 hover:text-[#f5c242] border-[#262c38]'
                                                  }`}
                                                >
                                                  <Briefcase className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    openReport(rep.id, rep.ticker);
                                                  }}
                                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#21262d] hover:bg-emerald-600 text-slate-200 hover:text-white text-xs font-semibold cursor-pointer border border-[#2e3440] hover:border-emerald-500"
                                                >
                                                  <span>İncele</span>
                                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* YATIRIM TEMALARI & ŞİRKET RADAR PANELİ (DISCOVER) */}
          {step === 'themes' && (() => {
            if (!userSession?.isLoggedIn) {
              return renderAuthGate('Yatırım Temaları');
            }

            const allThemesList = Object.values(INVESTMENT_THEMES);
            const deduplicatedForThemes = getLatestReportsPerTicker(savedReports);
            const themeSummary = getThemeSummary(deduplicatedForThemes);

            // Semantik tema görsel kimlik haritası
            const themeVisualMeta: Record<InvestmentThemeId, {
              iconBox: string;
              activeCard: string;
              barColor: string;
              topAccent: string;
              countColor: string;
              tagline: string;
              hoverCard: string;
            }> = {
              GROWTH: {
                iconBox: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35',
                activeCard: 'border-emerald-400/75 bg-emerald-500/10 ring-1 ring-emerald-400/35',
                barColor: 'bg-emerald-400',
                topAccent: 'from-emerald-500 via-teal-400 to-emerald-400',
                countColor: 'text-emerald-300',
                tagline: '≥%30 büyüme & güçlü FAVÖK',
                hoverCard: 'fv-card-emerald'
              },
              DEEP_VALUE: {
                iconBox: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/35',
                activeCard: 'border-cyan-400/75 bg-cyan-500/10 ring-1 ring-cyan-400/35',
                barColor: 'bg-cyan-400',
                topAccent: 'from-cyan-500 via-sky-400 to-cyan-300',
                countColor: 'text-cyan-300',
                tagline: 'PD/DD ≤ 1,6x · Güçlü özkaynak',
                hoverCard: 'fv-card-sky'
              },
              DEFENSIVE: {
                iconBox: 'bg-blue-500/15 text-blue-400 border-blue-500/35',
                activeCard: 'border-blue-400/75 bg-blue-500/10 ring-1 ring-blue-400/35',
                barColor: 'bg-blue-400',
                topAccent: 'from-blue-500 via-indigo-400 to-sky-400',
                countColor: 'text-blue-300',
                tagline: 'Net nakit / düşük borç kalkanı',
                hoverCard: 'fv-card-sky'
              },
              TURNAROUND: {
                iconBox: 'bg-amber-500/15 text-amber-400 border-amber-500/35',
                activeCard: 'border-amber-400/75 bg-amber-500/10 ring-1 ring-amber-400/35',
                barColor: 'bg-amber-400',
                topAccent: 'from-amber-500 via-orange-400 to-yellow-400',
                countColor: 'text-amber-300',
                tagline: 'Zarardan kâra operasyonel dönüş',
                hoverCard: 'fv-card-amber'
              },
              HIGH_ROIC: {
                iconBox: 'bg-purple-500/15 text-purple-400 border-purple-500/35',
                activeCard: 'border-purple-400/75 bg-purple-500/10 ring-1 ring-purple-400/35',
                barColor: 'bg-purple-400',
                topAccent: 'from-purple-500 via-violet-400 to-fuchsia-400',
                countColor: 'text-purple-300',
                tagline: 'ROIC > WACC · Pozitif EVA',
                hoverCard: 'fv-card-purple'
              },
              CASH_COW: {
                iconBox: 'bg-teal-500/15 text-teal-400 border-teal-500/35',
                activeCard: 'border-teal-400/75 bg-teal-500/10 ring-1 ring-teal-400/35',
                barColor: 'bg-teal-400',
                topAccent: 'from-teal-500 via-emerald-400 to-cyan-400',
                countColor: 'text-teal-300',
                tagline: 'Yüksek serbest nakit dönüşümü',
                hoverCard: 'fv-card-emerald'
              },
              AVOID: {
                iconBox: 'bg-rose-500/15 text-rose-400 border-rose-500/35',
                activeCard: 'border-rose-400/75 bg-rose-500/10 ring-1 ring-rose-400/35',
                barColor: 'bg-rose-400',
                topAccent: 'from-rose-500 via-red-400 to-orange-400',
                countColor: 'text-rose-300',
                tagline: 'Değer tuzağı / sermaye erozyonu',
                hoverCard: 'fv-card-rose'
              }
            };

            // Kesişim (Intersection / AND) Filtrelemesi
            let displayedItems: Array<{ report: SavedReport; matches: CompanyThemeMatch[] }> = [];

            if (selectedThemeFilters.length === 0) {
              displayedItems = deduplicatedForThemes.map(report => ({
                report,
                matches: categorizeCompany(report)
              }));
            } else {
              displayedItems = deduplicatedForThemes
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
              const q = themeSearchTerm.trim().toLocaleLowerCase('tr-TR');
              displayedItems = displayedItems.filter(({ report, matches }) =>
                report.ticker.toLocaleLowerCase('tr-TR').includes(q) ||
                getCompanySectorDisplayName(report.ticker, report.sector).toLocaleLowerCase('tr-TR').includes(q) ||
                ((report as any).companyName || report.extractedData?.company_name || '').toLocaleLowerCase('tr-TR').includes(q) ||
                matches.some(m => m.reason.toLocaleLowerCase('tr-TR').includes(q) || m.themeName.toLocaleLowerCase('tr-TR').includes(q))
              );
            }

            // Tüm görünüm modlarında (Liste, Kart, Kompakt) tutarlı sıralama
            const sortedThemeItems = [...displayedItems].sort((a, b) => {
              const { key, direction } = themesSort;
              let valA: any = null;
              let valB: any = null;
              if (key === 'ticker') { valA = a.report.ticker || ''; valB = b.report.ticker || ''; }
              else if (key === 'sector') {
                valA = getCompanySectorDisplayName(a.report.ticker, a.report.sector);
                valB = getCompanySectorDisplayName(b.report.ticker, b.report.sector);
              }
              else if (key === 'price') { valA = parseFinancialNumber(a.report.price) ?? 0; valB = parseFinancialNumber(b.report.price) ?? 0; }
              else if (key === 'fairValue') {
                const fvA = parseFinancialNumber((a.report as any).valuation?.fair_value ?? a.report.extractedData?.valuation?.fair_value ?? a.report.fairValue) ?? 0;
                const fvB = parseFinancialNumber((b.report as any).valuation?.fair_value ?? b.report.extractedData?.valuation?.fair_value ?? b.report.fairValue) ?? 0;
                valA = fvA; valB = fvB;
              }
              else if (key === 'discount') {
                const fvA = parseFinancialNumber((a.report as any).valuation?.fair_value ?? a.report.extractedData?.valuation?.fair_value ?? a.report.fairValue) ?? 0;
                const pA = parseFinancialNumber(a.report.price) ?? 0;
                valA = (fvA > 0 && pA > 0) ? ((fvA - pA) / pA) * 100 : -999;
                const fvB = parseFinancialNumber((b.report as any).valuation?.fair_value ?? b.report.extractedData?.valuation?.fair_value ?? b.report.fairValue) ?? 0;
                const pB = parseFinancialNumber(b.report.price) ?? 0;
                valB = (fvB > 0 && pB > 0) ? ((fvB - pB) / pB) * 100 : -999;
              }
              else if (key === 'score') {
                valA = parseNumericScore(a.report.score) ?? -1;
                valB = parseNumericScore(b.report.score) ?? -1;
              }
              else if (key === 'decision') { valA = a.report.decision || ''; valB = b.report.decision || ''; }

              if (typeof valA === 'string') {
                const cmp = valA.localeCompare(valB, 'tr');
                return direction === 'asc' ? cmp : -cmp;
              }
              return direction === 'asc' ? (valA ?? 0) - (valB ?? 0) : (valB ?? 0) - (valA ?? 0);
            });

            // Seçili küme özet istatistikleri
            const matchedAlCount = displayedItems.filter(({ report }) => (report.decision || '').trim().toUpperCase() === 'AL').length;
            const matchedScores = displayedItems
              .map(({ report }) => parseNumericScore(report.score))
              .filter((s): s is number => s !== null && Number.isFinite(s));
            const matchedAvgScore = matchedScores.length > 0
              ? Math.round(matchedScores.reduce((a, b) => a + b, 0) / matchedScores.length)
              : null;
            const matchedUpsides = displayedItems
              .map(({ report }) => {
                const repVal = (report as any).valuation || report.extractedData?.valuation;
                const fv = parseFinancialNumber(repVal?.fair_value ?? report.fairValue) ?? 0;
                const pr = parseFinancialNumber(report.price) ?? 0;
                return fv > 0 && pr > 0 ? ((fv - pr) / pr) * 100 : null;
              })
              .filter((u): u is number => u !== null && Number.isFinite(u));
            const matchedAvgUpside = matchedUpsides.length > 0
              ? Number((matchedUpsides.reduce((a, b) => a + b, 0) / matchedUpsides.length).toFixed(1))
              : null;

            return (
              <div className="space-y-5 fv-panel-enter">
                {/* Üst Başlık & Kontroller */}
                <div className="bg-[#151821] border border-[#262c38] p-5 sm:p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/12 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                      <Compass className="w-5 h-5" />
                    </div>
                    <h2 className="text-xl font-bold font-sans text-white tracking-tight">
                      Yatırım Temaları
                    </h2>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="relative flex-1 sm:flex-initial min-w-[235px]">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={themeSearchTerm}
                        onChange={(e) => setThemeSearchTerm(e.target.value)}
                        placeholder="Hisse, sektör veya tema ara..."
                        className="w-full bg-[#101319] border border-[#262c38] rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition font-sans"
                      />
                      {themeSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setThemeSearchTerm('')}
                          aria-label="Aramayı temizle"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Görünüm Değiştirici */}
                    <div className="flex items-center bg-[#101319] p-1 rounded-xl border border-[#262c38] shrink-0">
                      <button
                        type="button"
                        title="Liste / Tablo Görünümü"
                        onClick={() => setDiscoverViewMode('list')}
                        className={`fv-pill p-1.5 rounded-lg cursor-pointer ${discoverViewMode === 'list' ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'}`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Kart Görünümü"
                        onClick={() => setDiscoverViewMode('cards')}
                        className={`fv-pill p-1.5 rounded-lg cursor-pointer ${discoverViewMode === 'cards' ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'}`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Kompakt Rozet Görünümü"
                        onClick={() => setDiscoverViewMode('compact')}
                        className={`fv-pill p-1.5 rounded-lg cursor-pointer ${discoverViewMode === 'compact' ? 'bg-[#f5c242] text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'}`}
                      >
                        <Grid className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* GÖRSEL STRATEJİ TEMA KARTLARI IZGARASI (Simetrik 4x2 Kurumsal Düzen) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                  {/* TÜMÜ Strateji Kartı */}
                  {(() => {
                    const allAlCount = deduplicatedForThemes.filter(r => (r.decision || '').trim().toUpperCase() === 'AL').length;
                    const isAllSelected = selectedThemeFilters.length === 0;
                    return (
                      <button
                        type="button"
                        onClick={() => setSelectedThemeFilters([])}
                        className={`fv-card fv-card-amber relative overflow-hidden text-left p-4 pt-5 rounded-2xl border cursor-pointer flex flex-col justify-between gap-3 ${
                          isAllSelected
                            ? 'bg-[#f5c242]/12 border-[#f5c242]/75 ring-1 ring-[#f5c242]/35'
                            : 'bg-[#151821] border-[#262c38] hover:bg-[#1a1f2b]'
                        }`}
                      >
                        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#f5c242] via-amber-300 to-yellow-400" />
                        <div className="flex items-center justify-between gap-2">
                          <span className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                            isAllSelected
                              ? 'bg-[#f5c242] text-slate-950 border-[#f5c242]'
                              : 'bg-[#101319] text-[#f5c242] border-[#262c38]'
                          }`}>
                            <Sparkles className="w-4 h-4" />
                          </span>
                          <span className={`text-2xl font-black font-mono tracking-tight ${isAllSelected ? 'text-[#f5c242]' : 'text-white'}`}>
                            {deduplicatedForThemes.length}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <div className={`text-sm font-bold font-sans ${isAllSelected ? 'text-[#f5c242]' : 'text-white'}`}>
                            TÜMÜ
                          </div>
                          <div className="text-[11.5px] text-slate-400 leading-snug line-clamp-2">
                            Tüm analiz evreni
                          </div>
                        </div>
                        <div className="space-y-1.5 pt-1 border-t border-[#232834]/70">
                          <div className="h-1.5 w-full rounded-full bg-[#101319] overflow-hidden">
                            <div className="h-full bg-[#f5c242] rounded-full" style={{ width: '100%' }} />
                          </div>
                          <div className="flex items-center justify-between text-[10.5px] font-mono">
                            <span className="text-slate-400">%100</span>
                            <span className="text-emerald-400 font-bold">{allAlCount} AL</span>
                          </div>
                        </div>
                      </button>
                    );
                  })()}

                  {/* 7 Semantik Yatırım Teması Kartı */}
                  {allThemesList.map(theme => {
                    const tid = theme.id as InvestmentThemeId;
                    const themeReports = themeSummary[tid] || [];
                    const count = themeReports.length;
                    const alInTheme = themeReports.filter(x => (x.report.decision || '').trim().toUpperCase() === 'AL').length;
                    const sharePct = deduplicatedForThemes.length > 0
                      ? Math.round((count / deduplicatedForThemes.length) * 100)
                      : 0;
                    const isSelected = selectedThemeFilters.includes(tid);
                    const vis = themeVisualMeta[tid];

                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => {
                          setSelectedThemeFilters(prev =>
                            prev.includes(tid)
                              ? prev.filter(t => t !== tid)
                              : [...prev, tid]
                          );
                        }}
                        title={`${theme.name} — ${theme.criteriaSummary}`}
                        className={`fv-card ${vis.hoverCard} relative overflow-hidden text-left p-4 pt-5 rounded-2xl border cursor-pointer flex flex-col justify-between gap-3 ${
                          isSelected
                            ? vis.activeCard
                            : 'bg-[#151821] border-[#262c38] hover:bg-[#1a1f2b]'
                        }`}
                      >
                        <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${vis.topAccent}`} />
                        <div className="flex items-center justify-between gap-2">
                          <span className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${vis.iconBox}`}>
                            {renderThemeIcon(theme.iconTag, 'w-4 h-4')}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isSelected && (
                              <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </span>
                            )}
                            <span className={`text-2xl font-black font-mono tracking-tight ${
                              count > 0 ? (isSelected ? vis.countColor : 'text-white') : 'text-slate-500'
                            }`}>
                              {count}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-sm font-bold text-white font-sans truncate">
                            {theme.shortLabel}
                          </div>
                          <div className="text-[11.5px] text-slate-400 leading-snug line-clamp-2">
                            {vis.tagline}
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-1 border-t border-[#232834]/70">
                          <div className="h-1.5 w-full rounded-full bg-[#101319] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${vis.barColor}`}
                              style={{ width: `${count > 0 ? Math.max(8, sharePct) : 0}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10.5px] font-mono">
                            <span className="text-slate-400">%{sharePct}</span>
                            <span className={alInTheme > 0 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                              {alInTheme} AL
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* SEÇİLİ STRATEJİ ÖZET & METRİK ŞERİDİ */}
                <div className={`p-4 rounded-2xl bg-[#151821] border border-[#262c38] flex flex-col lg:flex-row ${selectedThemeFilters.length > 0 ? 'lg:items-center justify-between' : 'lg:items-center justify-end'} gap-3 text-xs`}>
                  {selectedThemeFilters.length > 0 && (
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {selectedThemeFilters.map(tid => {
                          const t = INVESTMENT_THEMES[tid];
                          return (
                            <span
                              key={tid}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono font-bold text-[11px] ${t?.badgeClass || 'bg-[#21262d] text-[#f5c242] border-[#2e3440]'}`}
                            >
                              {renderThemeIcon(t?.iconTag || 'Zap', 'w-3 h-3')}
                              <span>{t?.shortLabel || tid}</span>
                              <button
                                type="button"
                                onClick={() => setSelectedThemeFilters(prev => prev.filter(x => x !== tid))}
                                className="hover:text-white ml-0.5 cursor-pointer"
                                title="Kaldır"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setSelectedThemeFilters([])}
                          className="text-[11px] text-rose-400 hover:text-rose-300 font-bold cursor-pointer ml-1"
                        >
                          Temizle
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400 font-sans">
                        {selectedThemeFilters.map(tid => INVESTMENT_THEMES[tid]?.criteriaSummary).filter(Boolean).join(' • ')}
                      </div>
                    </div>
                  )}

                  {/* Eşleşen Küme KPI Özetleri & Hızlı Sıralama */}
                  <div className="flex items-center gap-3 sm:gap-4 font-mono text-[11px] shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#232834] flex-wrap">
                    <div>
                      <span className="text-slate-500 block text-[10px]">EŞLEŞEN</span>
                      <span className="text-white font-bold">{sortedThemeItems.length} şirket</span>
                    </div>
                    <div className="w-px h-6 bg-[#262c38]" />
                    <div>
                      <span className="text-slate-500 block text-[10px]">AL KARARI</span>
                      <span className="text-emerald-400 font-bold">{matchedAlCount} hisse</span>
                    </div>
                    {matchedAvgScore !== null && (
                      <>
                        <div className="w-px h-6 bg-[#262c38]" />
                        <div>
                          <span className="text-slate-500 block text-[10px]">ORT. SKOR</span>
                          <span className={`font-bold ${getScoreColorStyle(matchedAvgScore).text}`}>{matchedAvgScore}/100</span>
                        </div>
                      </>
                    )}
                    {matchedAvgUpside !== null && (
                      <>
                        <div className="w-px h-6 bg-[#262c38]" />
                        <div>
                          <span className="text-slate-500 block text-[10px]">ORT. POTANSİYEL</span>
                          <span className={`font-bold ${matchedAvgUpside >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {matchedAvgUpside >= 0 ? `+%${matchedAvgUpside}` : `-%${Math.abs(matchedAvgUpside)}`}
                          </span>
                        </div>
                      </>
                    )}
                    {discoverViewMode !== 'list' && (
                      <>
                        <div className="w-px h-6 bg-[#262c38] hidden sm:block" />
                        <div className="flex items-center gap-1 bg-[#101319] p-1 rounded-lg border border-[#262c38]">
                          {[
                            { key: 'score', label: 'Skor', dir: 'desc' as const },
                            { key: 'discount', label: 'Potansiyel', dir: 'desc' as const },
                            { key: 'ticker', label: 'A-Z', dir: 'asc' as const }
                          ].map(opt => (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setThemesSort({ key: opt.key, direction: opt.dir })}
                              className={`fv-pill px-2 py-0.5 rounded text-[10.5px] font-semibold cursor-pointer ${
                                themesSort.key === opt.key
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Şirketler Görünümü: Boş Durum VEYA Seçili Görünüm Modu */}
                {displayedItems.length === 0 ? (
                  <div className="bg-[#151821] border border-[#262c38] rounded-2xl p-12 text-center text-slate-400 space-y-3">
                    <Compass className="w-12 h-12 mx-auto text-slate-600 opacity-60" />
                    <h4 className="text-base font-bold text-slate-200 font-sans">
                      Seçilen Tema Kriterlerine Uyan Şirket Bulunamadı
                    </h4>
                    <p className="text-sm text-slate-400 max-w-md mx-auto font-sans">
                      Seçtiğiniz temaların tümünü aynı anda sağlayan analiz edilmiş şirket bulunmuyor. Temaları tekil olarak deneyebilir veya filtreleri temizleyebilirsiniz.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setSelectedThemeFilters([]); setThemeSearchTerm(''); }}
                      className="fv-pill inline-flex items-center gap-2 px-4 py-2 bg-[#f5c242] text-slate-950 font-bold rounded-xl text-sm cursor-pointer"
                    >
                      <span>Tüm Şirketleri Göster</span>
                    </button>
                  </div>
                ) : discoverViewMode === 'list' ? (
                  /* Liste / Tablo Görünümü */
                  <div className="bg-[#151821] border border-[#262c38] rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto touch-pan-x no-scrollbar">
                      <table className="w-full text-left text-sm border-collapse font-sans">
                        <thead>
                          <tr className="border-b border-[#262c38] bg-[#101319] text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                            <th
                              onClick={() => setThemesSort(p => ({ key: 'ticker', direction: p.key === 'ticker' && p.direction === 'asc' ? 'desc' : 'asc' }))}
                              className="py-3.5 px-4 cursor-pointer select-none hover:text-white transition sticky left-0 bg-[#101319] z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] min-w-[130px]"
                              title="Şirkete Göre Sırala"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <span>Şirket</span>
                                {themesSort.key === 'ticker' && (
                                  <span className="text-[#f5c242] font-mono text-xs">{themesSort.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                              </span>
                            </th>
                            <th
                              onClick={() => setThemesSort(p => ({ key: 'sector', direction: p.key === 'sector' && p.direction === 'asc' ? 'desc' : 'asc' }))}
                              className="py-3.5 px-3 cursor-pointer select-none hover:text-white transition"
                              title="Sektöre Göre Sırala"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <span>Sektör</span>
                                {themesSort.key === 'sector' && (
                                  <span className="text-[#f5c242] font-mono text-xs">{themesSort.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                              </span>
                            </th>
                            <th
                              onClick={() => setThemesSort(p => ({ key: 'price', direction: p.key === 'price' && p.direction === 'desc' ? 'asc' : 'desc' }))}
                              className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-white transition"
                              title="Fiyata Göre Sırala"
                            >
                              <span className="inline-flex items-center justify-end gap-1.5 w-full">
                                <span>Fiyat</span>
                                {themesSort.key === 'price' && (
                                  <span className="text-[#f5c242] font-mono text-xs">{themesSort.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                              </span>
                            </th>
                            <th
                              onClick={() => setThemesSort(p => ({ key: 'fairValue', direction: p.key === 'fairValue' && p.direction === 'desc' ? 'asc' : 'desc' }))}
                              className="py-3.5 px-3 text-right cursor-pointer select-none hover:text-white transition"
                              title="Adil Değere Göre Sırala"
                            >
                              <span className="inline-flex items-center justify-end gap-1.5 w-full">
                                <span>Adil Değer</span>
                                {themesSort.key === 'fairValue' && (
                                  <span className="text-[#f5c242] font-mono text-xs">{themesSort.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                              </span>
                            </th>
                            <th
                              onClick={() => setThemesSort(p => ({ key: 'discount', direction: p.key === 'discount' && p.direction === 'desc' ? 'asc' : 'desc' }))}
                              className="py-3.5 px-3 text-center cursor-pointer select-none hover:text-white transition"
                              title="Potansiyele Göre Sırala"
                            >
                              <span className="inline-flex items-center justify-center gap-1.5 w-full">
                                <span>Potansiyel</span>
                                {themesSort.key === 'discount' && (
                                  <span className="text-[#f5c242] font-mono text-xs">{themesSort.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                              </span>
                            </th>
                            <th
                              onClick={() => setThemesSort(p => ({ key: 'score', direction: p.key === 'score' && p.direction === 'desc' ? 'asc' : 'desc' }))}
                              className="py-3.5 px-3 text-center cursor-pointer select-none hover:text-white transition"
                              title="Skora Göre Sırala"
                            >
                              <span className="inline-flex items-center justify-center gap-1.5 w-full">
                                <span>Skor</span>
                                {themesSort.key === 'score' && (
                                  <span className="text-[#f5c242] font-mono text-xs">{themesSort.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                              </span>
                            </th>
                            <th
                              onClick={() => setThemesSort(p => ({ key: 'decision', direction: p.key === 'decision' && p.direction === 'asc' ? 'desc' : 'asc' }))}
                              className="py-3.5 px-3 text-center cursor-pointer select-none hover:text-white transition"
                              title="Karara Göre Sırala"
                            >
                              <span className="inline-flex items-center justify-center gap-1.5 w-full">
                                <span>Karar</span>
                                {themesSort.key === 'decision' && (
                                  <span className="text-[#f5c242] font-mono text-xs">{themesSort.direction === 'asc' ? '↑' : '↓'}</span>
                                )}
                              </span>
                            </th>
                            <th className="py-3.5 px-4">Eşleşen Temalar</th>
                            <th className="py-3.5 px-4 text-right">İşlem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#232834] text-slate-300">
                          {sortedThemeItems.map(({ report, matches }, idx) => {
                              const repVal = (report as any).valuation || report.extractedData?.valuation;
                              const fairVal = parseFinancialNumber(repVal?.fair_value ?? report.fairValue) ?? 0;
                              const priceNum = parseFinancialNumber(report.price) ?? 0;
                              const discount = (fairVal > 0 && priceNum > 0)
                                ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                                : null;
                              const isAl = report.decision === 'AL';
                              const isAlma = report.decision === 'ALMA';
                              const companyName = (report as any).companyName || report.extractedData?.company_name || '';
                              const symUpper = (report.ticker || '').toUpperCase();
                              const inPort = portfolioTickers.includes(symUpper);
                              const inFav = favoriteTickers.includes(symUpper);

                              return (
                                <tr
                                  key={`${report.id}-table-${idx}`}
                                  onClick={() => openReport(report.id, report.ticker)}
                                  onAuxClick={(e) => {
                                    if (e.button === 1) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      window.open(`/analysis/${report.ticker.toUpperCase()}`, '_blank');
                                    }
                                  }}
                                  className="fv-row cursor-pointer group"
                                >
                                  <td className="py-3 px-4 sticky left-0 bg-[#151821] group-hover:bg-[#1c222d] z-10 shadow-[2px_0_4px_rgba(0,0,0,0.3)] min-w-[130px]">
                                    <div className="flex items-center gap-2">
                                      <a
                                        href={`/analysis/${report.ticker.toUpperCase()}`}
                                        onClick={(e) => {
                                          if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
                                            e.preventDefault();
                                            openReport(report.id, report.ticker);
                                          }
                                        }}
                                        onAuxClick={(e) => {
                                          if (e.button === 1) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            window.open(`/analysis/${report.ticker.toUpperCase()}`, '_blank');
                                          }
                                        }}
                                        className="font-mono font-bold text-white group-hover:text-[#f5c242] transition"
                                      >
                                        {report.ticker}
                                      </a>
                                      {companyName && (
                                        <span className="text-xs text-slate-400 truncate max-w-[150px] hidden sm:inline">
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
                                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                                        discount >= 0
                                          ? 'bg-emerald-500/12 text-emerald-400 border-emerald-500/30'
                                          : 'bg-rose-500/12 text-rose-400 border-rose-500/30'
                                      }`}>
                                        {discount >= 0 ? `+${discount}%` : `${discount}%`}
                                      </span>
                                    ) : <span className="text-slate-500">—</span>}
                                  </td>
                                  <td className={`py-3 px-3 text-center font-mono font-bold text-xs ${getScoreColorStyle(report.score).text}`}>
                                    {formatScore(report.score)}
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
                                  <td className="py-3 px-4 text-xs text-slate-300 max-w-[300px]">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {matches.map(m => (
                                        <span
                                          key={m.themeId}
                                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${m.badgeClass}`}
                                          title={`${m.reason} (${m.metricValue})`}
                                        >
                                          {renderThemeIcon(m.iconTag, 'w-3 h-3')}
                                          <span>{m.shortLabel}</span>
                                        </span>
                                      ))}
                                      {matches.length === 0 && (
                                        <span className="text-slate-500 font-mono text-[11px]">Temel Analiz</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(report.ticker); }}
                                        title={inFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                                        className={`p-1.5 rounded-lg border cursor-pointer ${
                                          inFav
                                            ? 'bg-amber-400/15 text-amber-300 border-amber-400/40'
                                            : 'bg-[#101319] text-slate-500 hover:text-amber-300 border-[#262c38]'
                                        }`}
                                      >
                                        <Star className={`w-3.5 h-3.5 ${inFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); togglePortfolio(report.ticker); }}
                                        title={inPort ? 'Portföyden Çıkar' : 'Portföye Ekle'}
                                        className={`p-1.5 rounded-lg border cursor-pointer ${
                                          inPort
                                            ? 'bg-[#f5c242]/15 text-[#f5c242] border-[#f5c242]/40'
                                            : 'bg-[#101319] text-slate-500 hover:text-[#f5c242] border-[#262c38]'
                                        }`}
                                      >
                                        <Briefcase className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openReport(report.id, report.ticker);
                                        }}
                                        className="p-1.5 rounded-lg bg-[#21262d] hover:bg-[#f5c242] hover:text-slate-950 text-slate-300 cursor-pointer border border-[#2e3440]"
                                        title="Şirket Analizini Aç"
                                      >
                                        <ArrowUpRight className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : discoverViewMode === 'compact' ? (
                  /* Küçük Simgeler (Kompakt Rozetler) Görünümü */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {sortedThemeItems.map(({ report, matches }, idx) => {
                      const repVal = (report as any).valuation || report.extractedData?.valuation;
                      const fairVal = parseFinancialNumber(repVal?.fair_value ?? report.fairValue) ?? 0;
                      const priceNum = parseFinancialNumber(report.price) ?? 0;
                      const compactScoreNum = parseNumericScore(report.score);
                      const discount = (fairVal > 0 && priceNum > 0)
                        ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                        : null;
                      const isAl = report.decision === 'AL';
                      const isAlma = report.decision === 'ALMA';

                      return (
                        <div
                          key={`${report.id}-compact-${idx}`}
                          onClick={() => openReport(report.id, report.ticker)}
                          className={`fv-card bg-[#151821] hover:bg-[#1c212c] border border-[#262c38] p-3.5 rounded-xl cursor-pointer group flex flex-col justify-between space-y-2.5 overflow-hidden ${
                            isAl ? 'fv-card-emerald' : isAlma ? 'fv-card-rose' : 'fv-card-amber'
                          }`}
                        >
                          <div className={`h-0.5 -mx-3.5 -mt-3.5 mb-0.5 ${isAl ? 'bg-emerald-400/80' : isAlma ? 'bg-rose-400/80' : 'bg-amber-400/70'}`} />
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-black text-base text-white group-hover:text-[#f5c242] transition">
                              {report.ticker}
                            </span>
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              isAl ? 'bg-emerald-500/15 text-emerald-400' : isAlma ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'
                            }`}>
                              {report.decision}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-slate-400 text-[11px] truncate max-w-[110px]">
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

                          <div className="pt-2 border-t border-[#232834] flex items-center justify-between text-[11px] font-mono">
                            <span className="text-white font-bold">{priceNum > 0 ? `₺${priceNum.toFixed(1)}` : '—'}</span>
                            <div className="flex items-center gap-1">
                              {matches.length > 0 && (
                                <span className="text-[10px] text-cyan-400">{matches.length}t</span>
                              )}
                              {compactScoreNum !== null ? (
                                <span className={`font-bold px-1.5 py-0.5 rounded bg-[#101319] border border-[#262c38] ${getScoreColorStyle(report.score).text}`}>
                                  {compactScoreNum}p
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Kartlar Grid Görünümü */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedThemeItems.map(({ report, matches }, idx) => {
                      const repVal = (report as any).valuation || report.extractedData?.valuation;
                      const fairVal = parseFinancialNumber(repVal?.fair_value ?? report.fairValue) ?? 0;
                      const priceNum = parseFinancialNumber(report.price) ?? 0;
                      const discount = (fairVal > 0 && priceNum > 0)
                        ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                        : null;
                      const isAl = report.decision === 'AL';
                      const isAlma = report.decision === 'ALMA';
                      const companyName = (report as any).companyName || report.extractedData?.company_name || '';
                      const symUpper = (report.ticker || '').toUpperCase();
                      const inPort = portfolioTickers.includes(symUpper);
                      const inFav = favoriteTickers.includes(symUpper);
                      const marginBarPct = discount !== null
                        ? Math.max(10, Math.min(100, Math.round(Math.abs(discount))))
                        : 0;
                      const orderedMatches = [...matches].sort(
                        (a, b) => (selectedThemeFilters.includes(b.themeId) ? 1 : 0) - (selectedThemeFilters.includes(a.themeId) ? 1 : 0)
                      );
                      const leadMatch = orderedMatches[0];

                      const scoreNum = parseNumericScore(report.score);

                      return (
                        <div
                          key={`${report.id}-theme-card-${idx}`}
                          onClick={() => openReport(report.id, report.ticker)}
                          className={`fv-card ${isAl ? 'fv-card-emerald' : isAlma ? 'fv-card-rose' : 'fv-card-amber'} relative rounded-2xl bg-[#151821] border border-[#262c38] overflow-hidden cursor-pointer group flex flex-col justify-between`}
                        >
                          <div className={`h-1 w-full ${isAl ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : isAlma ? 'bg-gradient-to-r from-rose-500 to-red-400' : 'bg-gradient-to-r from-amber-500 to-yellow-400'}`} />
                          <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                            <div className="space-y-3.5">
                              {/* Tier 1: Kimlik + Karar + Kalite Skoru + Hızlı Ekle */}
                              <div className="flex items-start justify-between gap-2.5">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xl font-black text-white font-mono tracking-tight group-hover:text-[#f5c242] transition">
                                      {report.ticker}
                                    </span>
                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md font-mono border ${
                                      isAl ? 'bg-emerald-500/12 text-emerald-400 border-emerald-500/35' :
                                      isAlma ? 'bg-rose-500/12 text-rose-400 border-rose-500/35' :
                                      'bg-amber-500/12 text-amber-400 border-amber-500/35'
                                    }`}>
                                      {report.decision}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-1 text-[11.5px] text-slate-400 font-sans truncate max-w-[215px]">
                                    <span className="truncate">{companyName || getCompanySectorDisplayName(report.ticker, report.sector)}</span>
                                  </div>
                                  {companyName && (
                                    <div className="text-[10.5px] text-slate-500 font-mono truncate max-w-[215px] mt-0.5">
                                      {getCompanySectorDisplayName(report.ticker, report.sector)}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {scoreNum !== null && (
                                    <span className={`px-2 py-1 rounded-lg bg-[#101319] border border-[#262c38] text-xs font-mono font-bold ${getScoreColorStyle(report.score).text}`}>
                                      {formatScore(report.score)}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); toggleFavorite(report.ticker); }}
                                    title={inFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                                    className={`p-1.5 rounded-lg border cursor-pointer ${
                                      inFav
                                        ? 'bg-amber-400/15 text-amber-300 border-amber-400/40'
                                        : 'bg-[#101319] text-slate-500 hover:text-amber-300 border-[#262c38]'
                                    }`}
                                  >
                                    <Star className={`w-3.5 h-3.5 ${inFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); togglePortfolio(report.ticker); }}
                                    title={inPort ? 'Portföyden Çıkar' : 'Portföye Ekle'}
                                    className={`p-1.5 rounded-lg border cursor-pointer ${
                                      inPort
                                        ? 'bg-[#f5c242]/15 text-[#f5c242] border-[#f5c242]/40'
                                        : 'bg-[#101319] text-slate-500 hover:text-[#f5c242] border-[#262c38]'
                                    }`}
                                  >
                                    <Briefcase className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Tier 2: Fiyat & Adil Değer & İskonto Şeridi */}
                              <div className="p-3 bg-[#101319] rounded-xl border border-[#232834] space-y-2.5">
                                <div className="grid grid-cols-3 divide-x divide-[#232834] text-sm font-mono text-center">
                                  <div>
                                    <span className="text-slate-400 text-[10.5px] block font-sans">Fiyat</span>
                                    <span className="text-white font-bold">{priceNum > 0 ? `₺${priceNum.toFixed(2)}` : '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 text-[10.5px] block font-sans">Adil Değer</span>
                                    <span className="text-emerald-400 font-bold">{fairVal > 0 ? `₺${fairVal.toFixed(2)}` : '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 text-[10.5px] block font-sans">Potansiyel</span>
                                    {discount !== null ? (
                                      <span className={`font-bold ${discount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {discount >= 0 ? `+${discount}%` : `${discount}%`}
                                      </span>
                                    ) : <span className="text-slate-500">—</span>}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                                    <span>Değerleme Marjı</span>
                                    <span>{discount !== null ? (discount >= 0 ? `%${discount} İskonto` : `%${Math.abs(discount)} Primli`) : '—'}</span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-[#1a1f2b] overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${discount !== null && discount >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                      style={{ width: `${marginBarPct}%` }}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Tier 3: Eşleşen Temalar & Metrik Kanıtı */}
                              {orderedMatches.length > 0 && leadMatch && (
                                <div className="p-3 rounded-xl bg-[#101319]/80 border border-[#232834] space-y-2">
                                  <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono">
                                    <span className="text-slate-400 uppercase tracking-wider">Tema Kanıtı ({orderedMatches.length})</span>
                                    <span className="px-2 py-0.5 rounded bg-cyan-500/12 border border-cyan-500/30 text-cyan-300 font-bold">
                                      {leadMatch.metricValue}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {orderedMatches.map(m => (
                                      <span
                                        key={m.themeId}
                                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border font-semibold ${m.badgeClass}`}
                                      >
                                        {renderThemeIcon(m.iconTag, 'w-3 h-3')}
                                        <span>{m.shortLabel}</span>
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-xs text-slate-300 font-sans leading-relaxed pt-1.5 border-t border-[#232834] line-clamp-2">
                                    {leadMatch.reason}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Kompakt Alt Bilgi & İncele İkonu */}
                            <div className="pt-2.5 border-t border-[#232834] flex items-center justify-between text-[11px] font-mono text-slate-500">
                              <span>{report.period || formatAnalysisDate(report.createdAt) || 'Güncel Analiz'}</span>
                              <span className="inline-flex items-center gap-1 text-slate-400 group-hover:text-[#f5c242] transition font-sans font-semibold">
                                <span>Detay</span>
                                <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                              </span>
                            </div>
                          </div>
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
            const isDashboard = !isWatchlist && !isPortfolio; // AKIŞ PANELİ

            if (!userSession?.isLoggedIn) {
              if (isWatchlist) return renderAuthGate('Favoriler');
              if (isPortfolio) return renderAuthGate('Portföy');
              return renderAuthGate('Akış');
            }

            // ==========================================
            // 1. AKIŞ PANELİ (CANLI KAP İSTİHBARAT AKIŞI)
            // ==========================================
            if (isDashboard) {
              const analyzedTickersUnique = [...new Set(
                savedReports.map(r => (r.ticker || '').toUpperCase().trim()).filter(Boolean)
              )];
              const fallbackFeed = analyzedTickersUnique.length > 0
                ? getCompanyNewsFeed({ tickers: analyzedTickersUnique })
                : [];
              const baseFeed = liveNewsFeed.length > 0 ? liveNewsFeed : fallbackFeed;
              const newsCategories = getNewsCategories(baseFeed);

              const impactCounts = {
                ALL: baseFeed.length,
                HIGH_IMPACT: baseFeed.filter(i => i.impact === 'HIGH_IMPACT').length,
                POSITIVE: baseFeed.filter(i => i.impact === 'POSITIVE').length,
                NEGATIVE: baseFeed.filter(i => i.impact === 'NEGATIVE').length,
                NEUTRAL: baseFeed.filter(i => i.impact === 'NEUTRAL').length,
              };

              let newsFeed = baseFeed.filter(item => {
                if (newsCategoryFilter !== 'ALL' && item.category !== newsCategoryFilter) return false;
                if (newsImpactFilter !== 'ALL' && item.impact !== newsImpactFilter) return false;
                return true;
              });

              if (newsSearchTerm.trim()) {
                const nq = newsSearchTerm.trim().toLocaleLowerCase('tr-TR');
                newsFeed = newsFeed.filter(item =>
                  item.ticker.toLocaleLowerCase('tr-TR').includes(nq) ||
                  item.companyName.toLocaleLowerCase('tr-TR').includes(nq) ||
                  item.title.toLocaleLowerCase('tr-TR').includes(nq) ||
                  item.summary.toLocaleLowerCase('tr-TR').includes(nq) ||
                  (item.fullText || '').toLocaleLowerCase('tr-TR').includes(nq) ||
                  item.categoryLabel.toLocaleLowerCase('tr-TR').includes(nq)
                );
              }

              return (
                <div className="space-y-5 fv-panel-enter">
                  {/* Akış İstihbarat Başlık & Kontrol Paneli */}
                  <div className="bg-[#151821] border border-[#262c38] p-5 sm:p-6 rounded-2xl space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/12 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 relative">
                          <Radio className="w-5 h-5" />
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#151821] animate-pulse" />
                        </div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h2 className="text-xl font-bold font-sans text-white tracking-tight">
                            KAP Bildirim Akışı
                          </h2>
                          {lastFeedSync && (
                            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                              • {lastFeedSync.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => refreshLiveFeed(true)}
                          disabled={isFeedLoading}
                          className="fv-pill px-3.5 py-2 rounded-xl bg-[#101319] hover:bg-[#1e232e] border border-[#262c38] text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="KAP Bildirimlerini Yenile"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isFeedLoading ? 'animate-spin text-sky-400' : 'text-emerald-400'}`} />
                          <span>{isFeedLoading ? 'Taranıyor...' : 'Yenile'}</span>
                        </button>

                        <div className="relative flex-1 sm:flex-initial min-w-[245px]">
                          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={newsSearchTerm}
                            onChange={(e) => setNewsSearchTerm(e.target.value)}
                            placeholder="Hisse, ceza veya sözleşme ara..."
                            className="w-full bg-[#101319] border border-[#262c38] rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 transition font-sans"
                          />
                          {newsSearchTerm && (
                            <button
                              type="button"
                              onClick={() => setNewsSearchTerm('')}
                              aria-label="Aramayı temizle"
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Etki / Sinyal Filtre Çubuğu */}
                    {baseFeed.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-3 border-t border-[#232834]">
                        {[
                          { id: 'ALL', label: 'Tümü', count: impactCounts.ALL, active: 'bg-slate-200 text-slate-950 border-slate-200' },
                          { id: 'NEGATIVE', label: '▼ Olumsuz / Ceza', count: impactCounts.NEGATIVE, active: 'bg-rose-500/20 text-rose-300 border-rose-500/50' },
                          { id: 'HIGH_IMPACT', label: '⚡ Yüksek Etki', count: impactCounts.HIGH_IMPACT, active: 'bg-purple-500/20 text-purple-300 border-purple-500/50' },
                          { id: 'POSITIVE', label: '▲ Olumlu', count: impactCounts.POSITIVE, active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' },
                          { id: 'NEUTRAL', label: '● Bilgilendirme', count: impactCounts.NEUTRAL, active: 'bg-[#252b36] text-slate-200 border-slate-500/50' },
                        ].map(imp => {
                          const active = newsImpactFilter === imp.id;
                          return (
                            <button
                              key={imp.id}
                              type="button"
                              onClick={() => setNewsImpactFilter(imp.id as any)}
                              className={`fv-pill inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                                active
                                  ? imp.active
                                  : 'bg-[#101319] text-slate-400 border-[#232834] hover:text-white'
                              }`}
                            >
                              <span>{imp.label}</span>
                              <span className="font-mono text-[10px] opacity-80">{imp.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Kategori Filtre Hapları */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar touch-pan-x">
                    {newsCategories.map(cat => {
                      const active = newsCategoryFilter === cat.id;
                      const catIcon = cat.id === 'FINANCIALS' ? <FileText className="w-3.5 h-3.5" />
                        : cat.id === 'DIVIDEND' ? <Coins className="w-3.5 h-3.5" />
                        : cat.id === 'CONTRACT' ? <Briefcase className="w-3.5 h-3.5" />
                        : cat.id === 'BUYBACK' ? <RefreshCw className="w-3.5 h-3.5" />
                        : cat.id === 'INVESTMENT' ? <Building2 className="w-3.5 h-3.5" />
                        : cat.id === 'GENERAL' ? <ShieldAlert className="w-3.5 h-3.5" />
                        : <Newspaper className="w-3.5 h-3.5" />;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setNewsCategoryFilter(cat.id)}
                          className={`fv-pill flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer border ${
                            active
                              ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                              : 'bg-[#151821] text-slate-300 border-[#262c38] hover:text-white hover:bg-[#1c212c]'
                          }`}
                        >
                          {catIcon}
                          <span>{cat.label}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                            active ? 'bg-black/25 text-white' : 'bg-[#101319] text-slate-400 border border-[#262c38]'
                          }`}>
                            {cat.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Haber Kartları Akışı */}
                  {savedReports.length === 0 ? (
                    <div className="bg-[#151821] border border-[#262c38] rounded-2xl p-12 text-center text-slate-400 space-y-4">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400">
                        <Newspaper className="w-7 h-7" />
                      </div>
                      <h4 className="text-base font-bold text-white font-sans">
                        Henüz Analiz Edilmiş Şirket Bulunmuyor
                      </h4>
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={resetToNewAnalysis}
                          className="fv-pill inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold cursor-pointer font-sans"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Yeni Şirket Analiz Et</span>
                        </button>
                      </div>
                    </div>
                  ) : isFeedLoading && liveNewsFeed.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[0, 1, 2, 3].map(sk => (
                        <div key={sk} className="bg-[#151821] border border-[#262c38] rounded-2xl p-5 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl fv-shimmer shrink-0" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3.5 w-44 rounded fv-shimmer" />
                              <div className="h-4 w-4/5 rounded fv-shimmer" />
                            </div>
                          </div>
                          <div className="h-3 w-full rounded fv-shimmer" />
                          <div className="h-3 w-2/3 rounded fv-shimmer" />
                        </div>
                      ))}
                    </div>
                  ) : newsFeed.length === 0 ? (
                    <div className="bg-[#151821] border border-[#262c38] rounded-2xl p-12 text-center text-slate-400 space-y-3">
                      <Newspaper className="w-12 h-12 mx-auto text-slate-600 opacity-60" />
                      <h4 className="text-base font-bold text-slate-200 font-sans">
                        Seçili Filtrede Bildirim Bulunamadı
                      </h4>
                      <button
                        type="button"
                        onClick={() => { setNewsCategoryFilter('ALL'); setNewsImpactFilter('ALL'); setNewsSearchTerm(''); }}
                        className="fv-pill px-4 py-2 bg-[#21262d] hover:bg-[#2e3440] text-slate-200 rounded-xl text-xs font-bold cursor-pointer font-sans border border-[#2e3440]"
                      >
                        Tüm Filtreleri Sıfırla
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {newsFeed.map((item) => {
                        const vis = getDisclosureVisualStyle(item);
                        return (
                          <div
                            key={item.id}
                            onClick={() => openDisclosureModal(item)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openDisclosureModal(item);
                              }
                            }}
                            className={`fv-card ${vis.hoverCls} bg-[#151821] hover:bg-[#1a1f2b] border border-[#262c38] rounded-2xl overflow-hidden cursor-pointer flex group text-left`}
                          >
                            {/* Sol Semantik Etki Şeridi */}
                            <div className={`w-1.5 shrink-0 ${vis.accentBar}`} />

                            <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col justify-between gap-3">
                              <div className="space-y-2.5">
                                {/* Üst Satır: İkon + Ticker + Kategori + Zaman + Etki Rozeti */}
                                <div className="flex items-start justify-between gap-2.5">
                                  <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${vis.iconBg}`}>
                                      {vis.icon}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-mono font-black text-xs text-white bg-[#101319] px-2 py-0.5 rounded-md border border-[#2e3440] group-hover:border-emerald-500/40 group-hover:text-emerald-400 transition">
                                          {item.ticker}
                                        </span>
                                        <span className="text-[11px] font-sans font-semibold text-slate-300">
                                          {item.categoryLabel}
                                        </span>
                                        <span className="text-slate-600">•</span>
                                        <span className="text-[11px] font-mono text-slate-400">
                                          {item.timeAgo}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-500 truncate max-w-[260px] mt-0.5 font-sans">
                                        {item.companyName}
                                      </div>
                                    </div>
                                  </div>

                                  <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-sans font-bold border shrink-0 ${vis.badgeCls}`}>
                                    {vis.badgeText}
                                  </span>
                                </div>

                                {/* Anlamlı, Net Başlık (Jenerik "Özel Durum Açıklaması" Yerine Gerçek Olay) */}
                                <h3 className="text-[15px] font-bold text-white font-sans group-hover:text-emerald-300 transition leading-snug">
                                  {item.title}
                                </h3>

                                {/* Çıkarılan Kilit Finansal Metrik Hapları (Tutar, İndirim, Süre, Karşı Taraf) */}
                                {item.keyMetrics && item.keyMetrics.length > 0 && (
                                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                    {item.keyMetrics.map((m, mIdx) => (
                                      <span
                                        key={mIdx}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                                          m.tone === 'negative'
                                            ? 'bg-rose-500/12 text-rose-300 border-rose-500/30'
                                            : m.tone === 'positive'
                                            ? 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30'
                                            : 'bg-[#101319] text-slate-300 border-[#262c38]'
                                        }`}
                                      >
                                        <span className="text-[10px] opacity-75">{m.label}:</span>
                                        <strong className="font-bold">{m.value}</strong>
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Gerçek KAP İçeriğinden Özet */}
                                <p className="text-xs text-slate-300/90 font-sans leading-relaxed line-clamp-3">
                                  {renderHighlightedFinancialText(item.summary)}
                                </p>
                              </div>

                              {/* Alt Aksiyon Şeridi */}
                              <div className="flex items-center justify-between pt-2.5 border-t border-[#232834] flex-wrap gap-2">
                                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 group-hover:text-white transition">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>{item.fullText ? 'Tam Metni & Özeti İncele' : 'Bildirim Detayı'}</span>
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:translate-x-0.5 group-hover:text-emerald-400 transition" />
                                </span>

                                <div className="flex items-center gap-2.5">
                                  <a
                                    href={item.kapUrl || item.url || getKapCompanyDisclosuresUrl(item.ticker)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#101319] hover:bg-sky-600/20 text-sky-400 hover:text-sky-300 border border-[#262c38] hover:border-sky-500/40 text-[11px] font-mono font-bold transition"
                                    title="Doğrudan KAP resmi bildirim sayfasını aç"
                                  >
                                    <span>{item.kapId ? `KAP #${item.kapId}` : 'KAP'}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // ==========================================
            // 2. PORTFÖY & FAVORİLER LİSTESİ (Şirket Başına En Güncel Tek Rapor)
            // ==========================================
            const deduplicatedSaved = getLatestReportsPerTicker(savedReports);
            const activeTickersUpper = [...new Set(
              (isPortfolio ? portfolioTickers : favoriteTickers).map(t => t.toUpperCase().trim()).filter(Boolean)
            )];

            const collectionAll = deduplicatedSaved.filter(r =>
              activeTickersUpper.includes((r.ticker || '').toUpperCase())
            );
            const analyzedInCollectionSet = new Set(collectionAll.map(r => (r.ticker || '').toUpperCase()));
            const unanalyzedWatchTickers = activeTickersUpper.filter(sym => !analyzedInCollectionSet.has(sym));
            const colAl = collectionAll.filter(r => (r.decision || '').trim().toUpperCase() === 'AL');
            const colAlma = collectionAll.filter(r => (r.decision || '').trim().toUpperCase() === 'ALMA');
            const colNotr = collectionAll.filter(r => {
              const d = (r.decision || '').trim().toUpperCase();
              return d !== 'AL' && d !== 'ALMA';
            });

            const activeDecisionFilter = isPortfolio ? portfolioDecisionFilter : favoritesDecisionFilter;
            const setActiveDecisionFilter = isPortfolio ? setPortfolioDecisionFilter : setFavoritesDecisionFilter;

            let baseList = activeDecisionFilter === 'AL'
              ? colAl
              : activeDecisionFilter === 'NÖTR'
              ? colNotr
              : activeDecisionFilter === 'ALMA'
              ? colAlma
              : collectionAll;

            if (analyzedSearch.trim()) {
              const q = analyzedSearch.trim().toLocaleLowerCase('tr-TR');
              baseList = baseList.filter(r =>
                (r.ticker || '').toLocaleLowerCase('tr-TR').includes(q) ||
                ((r as any).companyName || r.extractedData?.company_name || '').toLocaleLowerCase('tr-TR').includes(q) ||
                getCompanySectorDisplayName(r.ticker, r.sector).toLocaleLowerCase('tr-TR').includes(q)
              );
            }

            const getItemValuationMetrics = (item: SavedReport) => {
              const repVal = (item as any).valuation || item.extractedData?.valuation;
              const fairVal = parseFinancialNumber(item.fairValue ?? repVal?.composite_fair_value ?? repVal?.fair_value ?? repVal?.dcf_fair_value) ?? 0;
              const priceNum = parseFinancialNumber(item.price) ?? 0;
              const discount = (fairVal > 0 && priceNum > 0)
                ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                : null;
              return { fairVal, priceNum, discount };
            };

            const sortedList = [...baseList].sort((a, b) => {
              const { key, direction } = savedTableSort;
              const dir = direction === 'asc' ? 1 : -1;
              if (key === 'ticker') {
                return (a.ticker || '').localeCompare(b.ticker || '', 'tr') * dir;
              }
              if (key === 'date') {
                return (reportTimestamp(a) - reportTimestamp(b)) * dir;
              }
              if (key === 'price') {
                return ((parseFinancialNumber(a.price) ?? 0) - (parseFinancialNumber(b.price) ?? 0)) * dir;
              }
              if (key === 'fairValue') {
                return (getItemValuationMetrics(a).fairVal - getItemValuationMetrics(b).fairVal) * dir;
              }
              if (key === 'discount') {
                const dA = getItemValuationMetrics(a).discount ?? -999;
                const dB = getItemValuationMetrics(b).discount ?? -999;
                return (dA - dB) * dir;
              }
              if (key === 'decision') {
                return (a.decision || '').localeCompare(b.decision || '', 'tr') * dir;
              }
              const sA = parseNumericScore(a.score) ?? -1;
              const sB = parseNumericScore(b.score) ?? -1;
              if (sA !== sB) return (sA - sB) * dir;
              return (reportTimestamp(b) - reportTimestamp(a));
            });

            // Koleksiyon KPI İstatistikleri (Yalnızca Gerçek Kayıtlı Raporlardan)
            const totalCount = collectionAll.length;
            const validScores = collectionAll
              .map(r => parseNumericScore(r.score))
              .filter((s): s is number => s !== null && Number.isFinite(s));
            const avgScore = validScores.length > 0
              ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
              : null;

            const withUpside = collectionAll
              .map(r => ({ report: r, ...getItemValuationMetrics(r) }))
              .filter(x => x.discount !== null);
            const avgUpside = withUpside.length > 0
              ? Number((withUpside.reduce((acc, x) => acc + (x.discount || 0), 0) / withUpside.length).toFixed(1))
              : null;
            const discountedCount = withUpside.filter(x => (x.discount || 0) > 0).length;
            const topOpportunity = [...withUpside].sort((a, b) => (b.discount ?? -999) - (a.discount ?? -999))[0] || null;

            const sectorFreq = new Map<string, number>();
            collectionAll.forEach(r => {
              const sName = getCompanySectorDisplayName(r.ticker, r.sector);
              sectorFreq.set(sName, (sectorFreq.get(sName) || 0) + 1);
            });
            const topSectorEntry = Array.from(sectorFreq.entries()).sort((a, b) => b[1] - a[1])[0] || null;

            const alPct = totalCount > 0 ? (colAl.length / totalCount) * 100 : 0;
            const notrPct = totalCount > 0 ? (colNotr.length / totalCount) * 100 : 0;
            const almaPct = totalCount > 0 ? (colAlma.length / totalCount) * 100 : 0;

            // Hızlı Ekleme Adayları (Analiz edilmiş ancak henüz bu listede olmayan şirketler)
            const addCandidates = deduplicatedSaved.filter(r => {
              const sym = (r.ticker || '').toUpperCase();
              if (activeTickersUpper.includes(sym)) return false;
              if (!quickAddQuery.trim()) return true;
              const q = quickAddQuery.trim().toLocaleLowerCase('tr-TR');
              return sym.toLocaleLowerCase('tr-TR').includes(q) ||
                ((r as any).companyName || r.extractedData?.company_name || '').toLocaleLowerCase('tr-TR').includes(q);
            });

            const pageTitle = isPortfolio ? 'Portföy' : 'Favoriler';
            const currentViewMode = isPortfolio ? portfolioViewMode : watchlistViewMode;
            const setViewMode = isPortfolio ? setPortfolioViewMode : setWatchlistViewMode;
            const showArchitect = isPortfolio && portfolioWorkspaceTab === 'architect';
            const rotateOutCount = forensicPortfolioPlan.rotationSignals.rotateOut.length;

            const toggleSavedSort = (key: 'score' | 'ticker' | 'price' | 'fairValue' | 'discount' | 'decision' | 'date') => {
              setSavedTableSort(prev => ({
                key,
                direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
              }));
            };

            const formatTryInt = (val: number | null | undefined) => {
              if (val == null || !Number.isFinite(val)) return '₺0';
              return `₺${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(val))}`;
            };

            const formatPctSigned = (v: number | null | undefined) => {
              if (v == null || !Number.isFinite(v)) return '—';
              return `${v >= 0 ? '+' : '-'}%${Math.abs(v).toFixed(1)}`;
            };

            const getTargetStatusMeta = (status: PortfolioTargetStatus) => {
              if (status === 'TARGET_REACHED') {
                return { label: 'Hedefe Ulaştı', cls: 'text-rose-400' };
              }
              if (status === 'NEAR_TARGET') {
                return { label: 'Hedefe Yakın', cls: 'text-amber-300' };
              }
              if (status === 'FORENSIC_EXIT') {
                return { label: 'Risk Uyarısı', cls: 'text-rose-400' };
              }
              if (status === 'BELOW_RF_HURDLE') {
                return { label: 'Faiz Altı', cls: 'text-slate-400' };
              }
              if (status === 'ACCUMULATE') {
                return { label: 'Uygun', cls: 'text-emerald-400' };
              }
              return { label: 'Tut', cls: 'text-slate-400' };
            };

            const customizedRuleCount = (
              [
                'maxSectorWeightPct',
                'maxSingleStockWeightPct',
                'minOcfConversionPct',
                'minEbitdaMarginPct',
                'includeHighQualityNeutralCount',
                'rotationTakeProfitUpsideThresholdPct',
                'deduplicateGroupHoldings',
                'enforceRiskFreeHurdle',
                'riskFreeRatePct',
              ] as const
            ).filter(k => architectConfig[k] !== DEFAULT_PORTFOLIO_ARCHITECT_CONFIG[k]).length;

            const activePreset = PORTFOLIO_ARCHITECT_PRESETS.find(
              p =>
                p.config.targetCount === architectConfig.targetCount &&
                p.config.maxSectorWeightPct === architectConfig.maxSectorWeightPct &&
                p.config.maxSingleStockWeightPct === architectConfig.maxSingleStockWeightPct &&
                p.config.minOcfConversionPct === architectConfig.minOcfConversionPct &&
                p.config.includeHighQualityNeutralCount === architectConfig.includeHighQualityNeutralCount
            );

            const SECTOR_BAR_COLORS = [
              'bg-slate-200',
              'bg-slate-400',
              'bg-slate-500',
              'bg-slate-600',
              'bg-zinc-500',
              'bg-slate-700',
              'bg-zinc-600',
              'bg-slate-300',
            ];

            const renderCapitalPlannerBar = (allocResult: CapitalAllocationPlanResult, scope: 'architect' | 'holdings') => {
              const isTopUp = portfolioCapitalState.allocationMode === 'topup';
              const activeAmount = isTopUp ? portfolioCapitalState.topUpCapitalTry : portfolioCapitalState.initialCapitalTry;
              const quickAmounts = isTopUp
                ? [10000, 25000, 50000, 100000]
                : [50000, 100000, 250000, 500000];
              const isCollapsed = scope === 'holdings' && !isHoldingsCapitalOpen;

              return (
                <div className="bg-[#151821] border border-[#232834] rounded-xl px-4 py-3 space-y-2.5">
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-xs font-sans font-semibold text-slate-300 whitespace-nowrap mr-0.5">
                        Yatırım Tutarı
                      </span>

                      <div className="inline-flex items-center bg-[#101319] p-0.5 rounded-lg border border-[#232834]">
                        <button
                          type="button"
                          onClick={() => updatePortfolioCapitalState(p => ({ ...p, allocationMode: 'initial' }))}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer border transition-colors ${
                            !isTopUp
                              ? 'bg-[#222836] text-white border-[#3b4458]'
                              : 'text-slate-400 hover:text-slate-200 border-transparent'
                          }`}
                        >
                          Başlangıç
                        </button>
                        <button
                          type="button"
                          onClick={() => updatePortfolioCapitalState(p => ({ ...p, allocationMode: 'topup' }))}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer border transition-colors ${
                            isTopUp
                              ? 'bg-[#222836] text-white border-[#3b4458]'
                              : 'text-slate-400 hover:text-slate-200 border-transparent'
                          }`}
                        >
                          İlave Alım
                        </button>
                      </div>

                      {!isCollapsed && (
                        <>
                          <div className="flex items-center bg-[#101319] border border-[#262c38] focus-within:border-slate-400 rounded-lg px-2.5 py-1 gap-1.5">
                            <span className="text-xs font-mono font-semibold text-slate-400">
                              {isTopUp ? '+₺' : '₺'}
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              value={activeAmount}
                              onChange={(e) => {
                                const parsed = Math.max(0, Number(e.target.value) || 0);
                                updatePortfolioCapitalState(prev =>
                                  isTopUp
                                    ? { ...prev, topUpCapitalTry: parsed }
                                    : { ...prev, initialCapitalTry: parsed }
                                );
                              }}
                              aria-label={isTopUp ? 'İlave Yatırım Tutarı (TL)' : 'Başlangıç Sermayesi (TL)'}
                              className="w-24 bg-transparent text-xs font-mono font-semibold text-white focus:outline-none tabular-nums"
                            />
                          </div>

                          <div className="flex items-center gap-1 flex-wrap">
                            {quickAmounts.map(amt => (
                              <button
                                key={amt}
                                type="button"
                                onClick={() =>
                                  updatePortfolioCapitalState(prev =>
                                    isTopUp
                                      ? { ...prev, topUpCapitalTry: amt }
                                      : { ...prev, initialCapitalTry: amt }
                                  )
                                }
                                className={`px-2 py-1 rounded-md text-[11px] font-mono font-medium border cursor-pointer transition-colors ${
                                  activeAmount === amt
                                    ? 'bg-[#222836] text-white border-[#3b4458]'
                                    : 'bg-[#101319] text-slate-400 hover:text-slate-200 border-[#232834]'
                                }`}
                              >
                                {isTopUp ? `+${Math.round(amt / 1000)}B` : `${Math.round(amt / 1000)}B`}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between xl:justify-end gap-3 flex-wrap">
                      {!isCollapsed && (
                        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono bg-[#101319] border border-[#232834] rounded-lg px-3 py-1.5 tabular-nums">
                          {isTopUp && (
                            <>
                              <span className="text-slate-400">
                                {allocResult.hasSavedLots ? 'Mevcut' : 'Baz'}: <strong className="text-slate-200">{formatTryInt(allocResult.existingPortfolioValueTry)}</strong>
                              </span>
                              <span className="text-slate-700">|</span>
                            </>
                          )}
                          <span className="text-slate-400">
                            Dağıtılan: <strong className="text-white">{formatTryInt(allocResult.deployedAmountTry)}</strong>
                          </span>
                          {allocResult.cashReserveTry > 0 && (
                            <>
                              <span className="text-slate-700">|</span>
                              <span className="text-slate-400">
                                Nakit/PPF: <strong className="text-slate-200">{formatTryInt(allocResult.cashReserveTry)}</strong>
                              </span>
                            </>
                          )}
                          <span className="text-slate-700">|</span>
                          <span className="text-slate-400">
                            Kalan Nakit: <strong className="text-slate-300">{formatTryInt(allocResult.unallocatedCashTry)}</strong>
                          </span>
                          {isTopUp && (
                            <>
                              <span className="text-slate-700">|</span>
                              <span className="text-slate-400">
                                Yeni Toplam: <strong className="text-white">{formatTryInt(allocResult.finalPortfolioValueTry)}</strong>
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {scope === 'holdings' && (
                        <button
                          type="button"
                          onClick={() => setIsHoldingsCapitalOpen(v => !v)}
                          className="p-1.5 rounded-lg bg-[#101319] border border-[#232834] text-slate-400 hover:text-white cursor-pointer"
                          title={isCollapsed ? 'Planlayıcıyı Aç' : 'Daralt'}
                        >
                          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {!isCollapsed && isTopUp && (
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 pt-2.5 border-t border-[#232834]">
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                        <span className="text-slate-400 font-sans mr-1">Dağıtım Modu:</span>
                        <button
                          type="button"
                          onClick={() => updatePortfolioCapitalState(p => ({ ...p, topUpStrategy: 'smart_rebalance' }))}
                          className={`px-2.5 py-1 rounded-md border font-sans font-medium cursor-pointer transition-colors ${
                            portfolioCapitalState.topUpStrategy === 'smart_rebalance'
                              ? 'bg-[#222836] text-white border-[#3b4458]'
                              : 'bg-[#101319] text-slate-400 hover:text-slate-200 border-[#232834]'
                          }`}
                        >
                          Akıllı Dengeleme
                        </button>
                        <button
                          type="button"
                          onClick={() => updatePortfolioCapitalState(p => ({ ...p, topUpStrategy: 'proportional' }))}
                          className={`px-2.5 py-1 rounded-md border font-sans font-medium cursor-pointer transition-colors ${
                            portfolioCapitalState.topUpStrategy === 'proportional'
                              ? 'bg-[#222836] text-white border-[#3b4458]'
                              : 'bg-[#101319] text-slate-400 hover:text-slate-200 border-[#232834]'
                          }`}
                        >
                          Sabit Oransal
                        </button>
                      </div>

                      {scope === 'holdings' && allocResult.deployedAmountTry > 0 && (
                        <div className="flex items-center gap-2">
                          {topUpAppliedNotice && (
                            <span className="text-xs text-slate-300 font-sans font-medium">{topUpAppliedNotice}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => commitTopUpToPositions(allocResult)}
                            className="fv-btn-primary px-3 py-1 rounded-lg text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>İlave Alımları İşle</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {!isCollapsed && allocResult.warningMessage && (
                    <div className="px-3 py-2 rounded-lg bg-[#101319] border border-[#262c38] border-l-2 border-l-amber-400 text-xs text-slate-300 font-sans flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      <span>{allocResult.warningMessage}</span>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div className="space-y-4 fv-panel-enter">
                {/* ÜST BAŞLIK & KURUMSAL KOMUTA ÇUBUĞU */}
                <div className="bg-[#151821] border border-[#232834] px-5 py-4 rounded-xl space-y-4">
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg sm:text-xl font-semibold font-sans text-white tracking-tight">
                          {pageTitle}
                        </h2>
                        {!isPortfolio && (
                          <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-[#101319] text-slate-300 border border-[#232834]">
                            {activeTickersUpper.length}
                          </span>
                        )}
                      </div>

                      {isPortfolio && (
                        <div className="flex items-center gap-1 bg-[#101319] p-1 rounded-lg border border-[#232834]">
                          <button
                            type="button"
                            onClick={() => setPortfolioWorkspaceTab('holdings')}
                            className={`px-3 py-1 rounded-md text-xs font-sans font-medium cursor-pointer border transition-colors ${
                              !showArchitect
                                ? 'bg-[#222836] text-white border-[#3b4458]'
                                : 'text-slate-400 hover:text-slate-200 border-transparent'
                            }`}
                          >
                            Portföyüm ({portfolioTickers.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPortfolioWorkspaceTab('architect')}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-sans font-medium cursor-pointer border transition-colors ${
                              showArchitect
                                ? 'bg-[#222836] text-white border-[#3b4458]'
                                : 'text-slate-400 hover:text-slate-200 border-transparent'
                            }`}
                          >
                            <span>Model Portföy</span>
                            {rotateOutCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-mono font-semibold text-rose-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                {rotateOutCount}
                              </span>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Sağ Aksiyonlar */}
                    {showArchitect ? (
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        {/* Kurumsal Şablon Seçici */}
                        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[#101319] border border-[#232834]">
                          {PORTFOLIO_ARCHITECT_PRESETS.map(preset => {
                            const isActive = activePreset?.id === preset.id;
                            const shortLbl =
                              preset.id === 'INSTITUTIONAL_10'
                                ? 'Standart 10'
                                : preset.id === 'FOCUSED_8'
                                ? 'Odaklı 8'
                                : 'Geniş 12';
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => updateArchitectConfig({ ...preset.config })}
                                title={preset.subtitle}
                                className={`px-2.5 py-1.5 rounded-md font-sans font-medium cursor-pointer whitespace-nowrap border transition-colors ${
                                  isActive
                                    ? 'bg-[#222836] text-white border-[#3b4458]'
                                    : 'text-slate-400 hover:text-slate-200 border-transparent'
                                }`}
                              >
                                {shortLbl}
                              </button>
                            );
                          })}
                        </div>

                        {/* Hisse Sayısı Stepper */}
                        <div className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg bg-[#101319] border border-[#232834]">
                          <button
                            type="button"
                            aria-label="Hisse sayısını azalt"
                            disabled={architectConfig.targetCount <= 5}
                            onClick={() =>
                              updateArchitectConfig(prev => ({
                                ...prev,
                                targetCount: Math.max(5, prev.targetCount - 1),
                              }))
                            }
                            className="w-6 h-6 rounded bg-[#151821] hover:bg-[#222836] border border-[#232834] flex items-center justify-center text-slate-300 cursor-pointer disabled:opacity-35"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="min-w-[24px] text-center font-mono font-semibold text-xs text-white tabular-nums">
                            {architectConfig.targetCount}
                          </span>
                          <button
                            type="button"
                            aria-label="Hisse sayısını artır"
                            disabled={architectConfig.targetCount >= 20}
                            onClick={() =>
                              updateArchitectConfig(prev => ({
                                ...prev,
                                targetCount: Math.min(20, prev.targetCount + 1),
                              }))
                            }
                            className="w-6 h-6 rounded bg-[#151821] hover:bg-[#222836] border border-[#232834] flex items-center justify-center text-slate-300 cursor-pointer disabled:opacity-35"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Canlı BIST Fiyat Güncelleme */}
                        <button
                          type="button"
                          disabled={isRefreshingLivePrices || savedReports.length === 0}
                          onClick={() => void refreshLivePrices()}
                          title={
                            livePriceUpdatedAt
                              ? `Canlı BIST fiyatları (${forensicPortfolioPlan.livePricesAppliedCount} hisse güncellendi)`
                              : 'İş Yatırım canlı BIST fiyatlarını çekerek hedef potansiyelleri güncelle'
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-[#101319] hover:bg-[#1a1f2b] text-slate-300 hover:text-white border-[#232834] font-sans font-medium cursor-pointer disabled:opacity-40 transition-colors"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isRefreshingLivePrices ? 'animate-spin' : ''}`} />
                          <span>Canlı Fiyat</span>
                          {livePriceUpdatedAt ? (
                            <span className="text-[10px] font-mono text-slate-400">
                              {new Date(livePriceUpdatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span className="text-[10px] font-sans text-slate-500">Fiyat Güncelle</span>
                          )}
                        </button>

                        {/* Açılır-Kapanır Portföy Kuralları Çekmecesi */}
                        <button
                          type="button"
                          aria-expanded={isArchitectFiltersOpen}
                          onClick={() => setIsArchitectFiltersOpen(v => !v)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-sans font-medium cursor-pointer transition-colors ${
                            isArchitectFiltersOpen || customizedRuleCount > 0
                              ? 'bg-[#222836] text-white border-[#3b4458]'
                              : 'bg-[#101319] text-slate-300 hover:text-white border-[#232834]'
                          }`}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                          <span>Kurallar</span>
                          {customizedRuleCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#151821] text-slate-200 border border-[#2e3440]">
                              {customizedRuleCount}
                            </span>
                          )}
                          {isArchitectFiltersOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                        </button>

                        <button
                          type="button"
                          disabled={forensicPortfolioPlan.modelPortfolio.length === 0}
                          onClick={() => applyModelPortfolioWithLots(modelAllocationPlan, 'merge')}
                          className="px-3 py-1.5 rounded-lg bg-[#101319] hover:bg-[#1e2430] text-slate-200 border border-[#2a3140] font-medium cursor-pointer disabled:opacity-40 transition-colors"
                        >
                          + Eksikleri Ekle
                        </button>
                        <button
                          type="button"
                          disabled={forensicPortfolioPlan.modelPortfolio.length === 0}
                          onClick={() => {
                            applyModelPortfolioWithLots(modelAllocationPlan, 'replace');
                            setPortfolioWorkspaceTab('holdings');
                          }}
                          className="fv-btn-primary px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer disabled:opacity-40"
                        >
                          Portföye Uygula ({forensicPortfolioPlan.modelPortfolio.length})
                        </button>
                      </div>
                    ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {isPortfolio && portfolioTickers.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setBatchScope('PORTFOLIO');
                            setLeaderboardSubTab('BATCH_CHANGES');
                            navigateTo('leaderboard');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#101319] hover:bg-[#1e2430] text-slate-200 border border-[#2a3140] text-xs font-medium cursor-pointer transition-colors"
                          title="Portföydeki hisselerin bilançolarını topluca güncelle ve değişimleri incele"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                          <span>Bilançoları Güncelle</span>
                        </button>
                      )}
                      {deduplicatedSaved.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setQuickAddOpen(p => !p)}
                          className="fv-btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isPortfolio ? 'Portföye Ekle' : 'Favoriye Ekle'}</span>
                        </button>
                      )}

                      <div className="flex items-center bg-[#101319] p-0.5 rounded-lg border border-[#232834]">
                        <button
                          type="button"
                          title="Liste / Tablo Görünümü"
                          onClick={() => setViewMode('list')}
                          className={`p-1.5 rounded-md cursor-pointer transition-colors ${currentViewMode === 'list' ? 'bg-[#222836] text-white' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          <List className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Kart Görünümü"
                          onClick={() => setViewMode('cards')}
                          className={`p-1.5 rounded-md cursor-pointer transition-colors ${currentViewMode === 'cards' ? 'bg-[#222836] text-white' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Kompakt Rozetler"
                          onClick={() => setViewMode('compact')}
                          className={`p-1.5 rounded-md cursor-pointer transition-colors ${currentViewMode === 'compact' ? 'bg-[#222836] text-white' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          <Grid className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    )}
                  </div>

                  {/* AÇILIR KAPANIR PORTFÖY KURALLARI ÇEKMECESİ */}
                  {showArchitect && isArchitectFiltersOpen && (
                    <div className="p-4 rounded-xl bg-[#101319] border border-[#232834] space-y-4">
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#232834]">
                        <span className="text-xs font-sans font-semibold text-slate-200">
                          Portföy Kuralları
                        </span>
                        <button
                          type="button"
                          onClick={() => updateArchitectConfig({ ...DEFAULT_PORTFOLIO_ARCHITECT_CONFIG })}
                          className="text-[11px] font-sans font-medium text-slate-300 hover:text-white hover:underline cursor-pointer inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Varsayılana Sıfırla</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
                        {/* Sütun 1: Risksiz Faiz Eşiği */}
                        <div className="space-y-2.5">
                          <div className="text-[11px] font-sans font-medium text-slate-400">
                            Risksiz Faiz Eşiği
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              updateArchitectConfig(prev => ({
                                ...prev,
                                enforceRiskFreeHurdle: !prev.enforceRiskFreeHurdle,
                              }))
                            }
                            className={`w-full px-3 py-1.5 rounded-lg border font-mono text-xs font-medium cursor-pointer text-left flex items-center justify-between transition-colors ${
                              architectConfig.enforceRiskFreeHurdle
                                ? 'bg-[#222836] text-white border-[#3b4458]'
                                : 'bg-[#151821] text-slate-400 border-[#232834]'
                            }`}
                          >
                            <span>Rf Altını Ele</span>
                            <span className={architectConfig.enforceRiskFreeHurdle ? 'text-emerald-400' : 'text-slate-500'}>
                              {architectConfig.enforceRiskFreeHurdle ? 'Açık' : 'Kapalı'}
                            </span>
                          </button>
                          <div className="space-y-1">
                            <span className="text-slate-400 block font-sans text-[11px]">Yıllık Rf Oranı</span>
                            <div className="flex flex-wrap gap-1.5">
                              {([null, 30, 35, 38, 42] as const).map(rfOpt => (
                                <button
                                  key={String(rfOpt)}
                                  type="button"
                                  onClick={() => updateArchitectConfig(prev => ({ ...prev, riskFreeRatePct: rfOpt }))}
                                  className={`px-2 py-1 rounded-md font-mono font-medium border cursor-pointer transition-colors ${
                                    architectConfig.riskFreeRatePct === rfOpt
                                      ? 'bg-[#222836] text-white border-[#3b4458]'
                                      : 'bg-[#151821] text-slate-400 hover:text-slate-200 border-[#232834]'
                                  }`}
                                >
                                  {rfOpt === null ? `Oto (%${forensicPortfolioPlan.effectiveRiskFreeRatePct})` : `%${rfOpt}`}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Sütun 2: Çeşitlendirme */}
                        <div className="space-y-2.5">
                          <div className="text-[11px] font-sans font-medium text-slate-400">
                            Çeşitlendirme
                          </div>
                          <div className="space-y-1">
                            <span className="text-slate-400 block font-sans text-[11px]">Maks. Sektör Tavanı</span>
                            <div className="flex flex-wrap gap-1.5">
                              {([15, 20, 25, 30] as const).map(secCap => (
                                <button
                                  key={secCap}
                                  type="button"
                                  onClick={() => updateArchitectConfig(prev => ({ ...prev, maxSectorWeightPct: secCap }))}
                                  className={`px-2 py-1 rounded-md font-mono font-medium border cursor-pointer transition-colors ${
                                    architectConfig.maxSectorWeightPct === secCap
                                      ? 'bg-[#222836] text-white border-[#3b4458]'
                                      : 'bg-[#151821] text-slate-400 hover:text-slate-200 border-[#232834]'
                                  }`}
                                >
                                  %{secCap}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-slate-400 block font-sans text-[11px]">Maks. Tek Hisse</span>
                            <div className="flex flex-wrap gap-1.5">
                              {([10, 12, 15, 20] as const).map(stockCap => (
                                <button
                                  key={stockCap}
                                  type="button"
                                  onClick={() => updateArchitectConfig(prev => ({ ...prev, maxSingleStockWeightPct: stockCap }))}
                                  className={`px-2 py-1 rounded-md font-mono font-medium border cursor-pointer transition-colors ${
                                    architectConfig.maxSingleStockWeightPct === stockCap
                                      ? 'bg-[#222836] text-white border-[#3b4458]'
                                      : 'bg-[#151821] text-slate-400 hover:text-slate-200 border-[#232834]'
                                  }`}
                                >
                                  %{stockCap}
                                </button>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              updateArchitectConfig(prev => ({ ...prev, deduplicateGroupHoldings: !prev.deduplicateGroupHoldings }))
                            }
                            className={`w-full px-3 py-1.5 rounded-lg border font-mono text-xs font-medium cursor-pointer text-left flex items-center justify-between transition-colors ${
                              architectConfig.deduplicateGroupHoldings
                                ? 'bg-[#222836] text-white border-[#3b4458]'
                                : 'bg-[#151821] text-slate-400 border-[#232834]'
                            }`}
                          >
                            <span>Grup Tekilleştir</span>
                            <span className={architectConfig.deduplicateGroupHoldings ? 'text-emerald-400' : 'text-slate-500'}>
                              {architectConfig.deduplicateGroupHoldings ? 'Açık' : 'Kapalı'}
                            </span>
                          </button>
                        </div>

                        {/* Sütun 3: Kalite Eşikleri */}
                        <div className="space-y-2.5">
                          <div className="text-[11px] font-sans font-medium text-slate-400">
                            Kalite Eşikleri
                          </div>
                          <div className="space-y-1">
                            <span className="text-slate-400 block font-sans text-[11px]">Min. Nakit Dönüşümü</span>
                            <div className="flex flex-wrap gap-1.5">
                              {([0, 65, 80, 100] as const).map(ocfMin => (
                                <button
                                  key={ocfMin}
                                  type="button"
                                  onClick={() => updateArchitectConfig(prev => ({ ...prev, minOcfConversionPct: ocfMin }))}
                                  className={`px-2 py-1 rounded-md font-mono font-medium border cursor-pointer transition-colors ${
                                    architectConfig.minOcfConversionPct === ocfMin
                                      ? 'bg-[#222836] text-white border-[#3b4458]'
                                      : 'bg-[#151821] text-slate-400 hover:text-slate-200 border-[#232834]'
                                  }`}
                                >
                                  {ocfMin === 0 ? 'Esnek' : `%${ocfMin}`}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-slate-400 block font-sans text-[11px]">Min. FAVÖK / NÖTR</span>
                            <div className="flex flex-wrap gap-1.5">
                              {([5, 8, 12] as const).map(ebMin => (
                                <button
                                  key={ebMin}
                                  type="button"
                                  onClick={() => updateArchitectConfig(prev => ({ ...prev, minEbitdaMarginPct: ebMin }))}
                                  className={`px-2 py-1 rounded-md font-mono font-medium border cursor-pointer transition-colors ${
                                    architectConfig.minEbitdaMarginPct === ebMin
                                      ? 'bg-[#222836] text-white border-[#3b4458]'
                                      : 'bg-[#151821] text-slate-400 hover:text-slate-200 border-[#232834]'
                                  }`}
                                >
                                  %{ebMin}
                                </button>
                              ))}
                              {([0, 1, 2] as const).map(nCnt => (
                                <button
                                  key={`nc-${nCnt}`}
                                  type="button"
                                  onClick={() => updateArchitectConfig(prev => ({ ...prev, includeHighQualityNeutralCount: nCnt }))}
                                  className={`px-2 py-1 rounded-md font-mono font-medium border cursor-pointer transition-colors ${
                                    architectConfig.includeHighQualityNeutralCount === nCnt
                                      ? 'bg-[#222836] text-white border-[#3b4458]'
                                      : 'bg-[#151821] text-slate-400 hover:text-slate-200 border-[#232834]'
                                  }`}
                                >
                                  +{nCnt} NÖTR
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Sütun 4: Hedef & Kâr-Al */}
                        <div className="space-y-2.5">
                          <div className="text-[11px] font-sans font-medium text-slate-400">
                            Hedef &amp; Kâr-Al
                          </div>
                          <div className="space-y-1">
                            <span className="text-slate-400 block font-sans text-[11px]">Kâr-Al Eşiği</span>
                            <div className="flex flex-wrap gap-1.5">
                              {([8, 10, 12, 15, 20] as const).map(rot => (
                                <button
                                  key={rot}
                                  type="button"
                                  onClick={() =>
                                    updateArchitectConfig(prev => ({
                                      ...prev,
                                      rotationTakeProfitUpsideThresholdPct: rot,
                                    }))
                                  }
                                  className={`px-2 py-1 rounded-md font-mono font-medium border cursor-pointer transition-colors ${
                                    architectConfig.rotationTakeProfitUpsideThresholdPct === rot
                                      ? 'bg-[#222836] text-white border-[#3b4458]'
                                      : 'bg-[#151821] text-slate-400 hover:text-slate-200 border-[#232834]'
                                  }`}
                                >
                                  &lt;%{rot}
                                </button>
                              ))}
                            </div>
                            <p className="text-[11px] text-slate-500 font-sans pt-1 leading-relaxed">
                              Potansiyeli yıllık %{forensicPortfolioPlan.effectiveRiskFreeRatePct} altında kalan hisseler model alıma dahil edilmez.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!showArchitect && (
                  <>
                  {/* Hızlı Hisse Ekleme Çekmecesi (Analiz Edilmiş Raporlardan Tek Tıkla Ekle) */}
                  {quickAddOpen && (
                    <div className="p-3.5 rounded-xl bg-[#101319] border border-[#232834] space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="relative flex-1 max-w-sm">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={quickAddQuery}
                            onChange={(e) => setQuickAddQuery(e.target.value)}
                            placeholder="Analiz edilmiş şirketlerden ara..."
                            autoFocus
                            className="w-full bg-[#151821] border border-[#262c38] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-400"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => { setQuickAddOpen(false); setQuickAddQuery(''); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e232e] cursor-pointer"
                          title="Kapat"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {addCandidates.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                          {addCandidates.slice(0, 24).map(cand => (
                            <button
                              key={cand.id}
                              type="button"
                              onClick={() => isPortfolio ? togglePortfolio(cand.ticker) : toggleFavorite(cand.ticker)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#151821] hover:bg-[#1e2430] border border-[#232834] hover:border-[#3b4458] text-xs font-mono text-slate-200 hover:text-white cursor-pointer transition-colors"
                            >
                              <Plus className="w-3 h-3 text-slate-400" />
                              <span className="font-semibold">{cand.ticker}</span>
                              <span className={`text-[10px] font-medium ${
                                cand.decision === 'AL' ? 'text-emerald-400' : cand.decision === 'ALMA' ? 'text-rose-400' : 'text-amber-300'
                              }`}>
                                {cand.decision}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 font-sans">
                          Eklenebilecek başka analiz edilmiş şirket bulunmuyor.
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4-KART KPI KOMUTA ŞERİDİ */}
                  {totalCount > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* KPI 1: Karar Dağılımı */}
                      <div className="fv-kpi-card bg-[#101319] border border-[#232834] rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-sans font-medium text-slate-400">
                          <span>KARAR DAĞILIMI</span>
                          <span className="text-slate-200 font-mono">{totalCount} hisse</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-emerald-400 font-semibold">{colAl.length} AL</span>
                          <span className="text-slate-700">·</span>
                          <span className="text-amber-300 font-semibold">{colNotr.length} NÖTR</span>
                          <span className="text-slate-700">·</span>
                          <span className="text-rose-400 font-semibold">{colAlma.length} ALMA</span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-[#1b202b] overflow-hidden flex">
                          {alPct > 0 && <div className="h-full bg-emerald-400/80" style={{ width: `${alPct}%` }} />}
                          {notrPct > 0 && <div className="h-full bg-amber-300/80" style={{ width: `${notrPct}%` }} />}
                          {almaPct > 0 && <div className="h-full bg-rose-400/80" style={{ width: `${almaPct}%` }} />}
                        </div>
                      </div>

                      {/* KPI 2: Ortalama Kalite Skoru */}
                      <div className="fv-kpi-card bg-[#101319] border border-[#232834] rounded-xl p-3.5 space-y-2">
                        <div className="text-[11px] font-sans font-medium text-slate-400">ORTALAMA KALİTE SKORU</div>
                        <div className="flex items-baseline gap-2 font-mono">
                          <span className="text-lg font-semibold text-white">
                            {avgScore !== null ? `${avgScore}/100` : '—'}
                          </span>
                          <span className="text-[11px] text-slate-500">model puanı</span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-[#1b202b] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-slate-300/75"
                            style={{ width: `${avgScore !== null ? Math.max(6, Math.min(100, avgScore)) : 0}%` }}
                          />
                        </div>
                      </div>

                      {/* KPI 3: Ortalama Adil Değer Potansiyeli */}
                      <div className="fv-kpi-card bg-[#101319] border border-[#232834] rounded-xl p-3.5 space-y-1.5">
                        <div className="text-[11px] font-sans font-medium text-slate-400">ORT. ADİL DEĞER MARJI</div>
                        <div className={`text-lg font-mono font-semibold ${
                          avgUpside === null ? 'text-slate-400' : avgUpside >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {avgUpside !== null ? (avgUpside >= 0 ? `+%${avgUpside}` : `-%${Math.abs(avgUpside)}`) : '—'}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          <span className="text-slate-200 font-medium">{discountedCount}</span> / {withUpside.length} iskontolu
                        </div>
                      </div>

                      {/* KPI 4: Portföy için Sektör Yoğunlaşması / Favoriler için En Cazip Fırsat */}
                      {isPortfolio ? (
                        <div className="fv-kpi-card bg-[#101319] border border-[#232834] rounded-xl p-3.5 space-y-1.5">
                          <div className="text-[11px] font-sans font-medium text-slate-400">SEKTÖR ÇEŞİTLİLİĞİ</div>
                          <div className="text-lg font-mono font-semibold text-white">
                            {sectorFreq.size} <span className="text-xs font-normal text-slate-400">farklı sektör</span>
                          </div>
                          {topSectorEntry && (
                            <div className="text-[11px] font-sans text-slate-400 truncate" title={topSectorEntry[0]}>
                              En yüksek: <strong className="text-slate-200 font-medium">{topSectorEntry[0]}</strong> (%{Math.round((topSectorEntry[1] / totalCount) * 100)})
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          role={topOpportunity ? 'button' : undefined}
                          tabIndex={topOpportunity ? 0 : undefined}
                          onClick={() => topOpportunity && openReport(topOpportunity.report.id, topOpportunity.report.ticker)}
                          onKeyDown={(e) => {
                            if (topOpportunity && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              openReport(topOpportunity.report.id, topOpportunity.report.ticker);
                            }
                          }}
                          className={`fv-kpi-card bg-[#101319] border border-[#232834] rounded-xl p-3.5 space-y-1.5 ${topOpportunity ? 'cursor-pointer hover:border-[#3b4458]' : ''}`}
                        >
                          <div className="text-[11px] font-sans font-medium text-slate-400">EN YÜKSEK POTANSİYEL</div>
                          {topOpportunity ? (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-lg font-mono font-semibold text-white">{topOpportunity.report.ticker}</span>
                                <span className={`text-sm font-mono font-semibold ${(topOpportunity.discount || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {(topOpportunity.discount || 0) >= 0 ? `+%${topOpportunity.discount}` : `-%${Math.abs(topOpportunity.discount || 0)}`}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                                <span>{topOpportunity.report.decision} · {formatScore(topOpportunity.report.score)}</span>
                                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-slate-500 font-mono pt-1">—</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Henüz Analiz Edilmemiş İzleme / Portföy Hisseleri Şeridi */}
                  {unanalyzedWatchTickers.length > 0 && (
                    <div className="p-3 rounded-xl bg-[#101319] border border-[#232834] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 text-xs text-slate-300 font-sans">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                        <span>
                          <strong className="text-white font-medium">{unanalyzedWatchTickers.length}</strong> hisse listede ancak henüz değerleme raporu oluşturulmadı:
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {unanalyzedWatchTickers.map(sym => (
                          <div
                            key={sym}
                            className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-[#151821] border border-[#232834] text-xs font-mono"
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenOrAnalyzeTicker(sym)}
                              className="inline-flex items-center gap-1.5 text-slate-200 hover:text-white font-semibold cursor-pointer"
                              title={`${sym} analizini başlat`}
                            >
                              <span>{sym}</span>
                              <span className="text-[10px] font-sans font-medium text-slate-400">Analiz Et</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => isPortfolio ? togglePortfolio(sym) : toggleFavorite(sym)}
                              className="p-0.5 rounded text-slate-500 hover:text-rose-400 cursor-pointer"
                              title={`${sym} listeden çıkar`}
                              aria-label={`${sym} çıkar`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  </>
                  )}
                </div>

                {showArchitect ? (() => {
                  const plan = forensicPortfolioPlan;
                  const alloc = modelAllocationPlan;
                  const allocRowByTicker = new Map(alloc.rows.map(r => [r.ticker, r]));
                  const tierBadgeMeta = (tier: string) => {
                    if (tier === 'TIER_1_CORE') {
                      return { label: 'Ana', cls: 'text-slate-500' };
                    }
                    if (tier === 'TIER_2_SATELLITE') {
                      return { label: 'İkincil', cls: 'text-slate-500' };
                    }
                    if (tier === 'TIER_3_FILTERED') {
                      return { label: 'Elenen', cls: 'text-rose-400' };
                    }
                    if (tier === 'A_PLUS_NEUTRAL') {
                      return { label: 'A+ NÖTR', cls: 'text-slate-400' };
                    }
                    return { label: 'Riskli NÖTR', cls: 'text-rose-400' };
                  };

                  return (
                    <div data-testid="fv-portfolio-architect" className="space-y-4 fv-panel-enter">
                      {/* Tek Bantlı 5 Metrikli Kurumsal Özet Şeridi */}
                      <div className="bg-[#151821] border border-[#232834] rounded-xl grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-[#232834] overflow-hidden tabular-nums">
                        <div className="p-4 space-y-1">
                          <div className="text-[11px] font-sans font-medium text-slate-400">Portföy Yapısı</div>
                          <div className="text-base sm:text-lg font-semibold font-mono text-white">
                            {plan.modelPortfolio.length} Hisse <span className="text-xs font-normal text-slate-400">· {plan.sectorBreakdown.length} Sektör</span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {plan.tier1CoreAl.length} Ana · {plan.tier2SatelliteAl.length} İkincil
                          </div>
                          {plan.cashReserveWeightPct > 0 && (
                            <div className="text-[11px] font-mono text-slate-300">
                              Hisse %{plan.equityAllocationWeightPct} · Nakit/PPF %{plan.cashReserveWeightPct}
                            </div>
                          )}
                        </div>

                        <div className="p-4 space-y-1">
                          <div className="text-[11px] font-sans font-medium text-slate-400">Hedef Portföy Değeri</div>
                          <div className="text-sm sm:text-base font-semibold font-mono text-white truncate">
                            {formatTryInt(alloc.finalPortfolioValueTry)} <span className="text-slate-300">→ {formatTryInt(alloc.impliedPortfolioFairValueTry)}</span>
                          </div>
                          <div className="text-[11px] font-sans text-slate-400">
                            Tek hisse tavanı <span className="font-mono text-slate-300">%{architectConfig.maxSingleStockWeightPct}</span>
                            {alloc.cashReserveTry > 0 && (
                              <span className="text-slate-300"> · Nakit/PPF rezervi <span className="font-mono">{formatTryInt(alloc.cashReserveTry)}</span></span>
                            )}
                          </div>
                        </div>

                        <div className="p-4 space-y-1">
                          <div className="text-[11px] font-sans font-medium text-slate-400">Ortalama Potansiyel</div>
                          <div className={`text-base sm:text-lg font-semibold font-mono ${
                            plan.weightedAvgUpsidePct != null && plan.weightedAvgUpsidePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {formatPctSigned(plan.weightedAvgUpsidePct)}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            Rf %{plan.effectiveRiskFreeRatePct} üstü{' '}
                            <span className="text-slate-200 font-medium">
                              {plan.weightedAvgUpsidePct != null
                                ? `${plan.weightedAvgUpsidePct - plan.effectiveRiskFreeRatePct >= 0 ? '+' : ''}${(plan.weightedAvgUpsidePct - plan.effectiveRiskFreeRatePct).toFixed(1)}p`
                                : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 space-y-1">
                          <div className="text-[11px] font-sans font-medium text-slate-400">Ortalama Skor / EVA</div>
                          <div className="flex items-baseline gap-1.5 font-mono">
                            <span className="text-base sm:text-lg font-semibold text-white">
                              {plan.weightedAvgScore != null ? `${plan.weightedAvgScore}/100` : '—'}
                            </span>
                            <span className="text-xs font-medium text-slate-300">
                              {plan.weightedAvgEvaPct != null ? `· EVA ${plan.weightedAvgEvaPct >= 0 ? '+' : ''}${plan.weightedAvgEvaPct}p` : ''}
                            </span>
                          </div>
                          <div className="text-[11px] font-sans text-slate-400">
                            {architectConfig.enforceRiskFreeHurdle && plan.belowRiskFreeAlCount > 0
                              ? `Faiz altı elenen: ${plan.belowRiskFreeAlCount}`
                              : `A+ NÖTR adayı: ${plan.tierANeutralCandidates.length}`}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setArchitectTierFilter('ROTATION')}
                          className="p-4 space-y-1 text-left hover:bg-[#1a1f2b] transition-colors cursor-pointer col-span-2 lg:col-span-1"
                        >
                          <div className="flex items-center justify-between text-[11px] font-sans font-medium text-slate-400">
                            <span>Değişim Durumu</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                          <div className="flex items-center gap-2 font-mono text-base sm:text-lg font-semibold">
                            <span className={plan.rotationSignals.rotateOut.length > 0 ? 'text-rose-400' : 'text-slate-300'}>
                              {plan.rotationSignals.rotateOut.length} Çıkış
                            </span>
                            <span className="text-slate-600">/</span>
                            <span className="text-slate-300">{plan.rotationSignals.hold.length} Korunan</span>
                          </div>
                          <div className="text-[11px] font-sans text-slate-400">
                            Kâr-al eşiği <span className="font-mono">&lt;%{architectConfig.rotationTakeProfitUpsideThresholdPct}</span>
                          </div>
                        </button>
                      </div>

                      {/* Sade Alt Sekmeler (Underline Tab Bar) */}
                      <div className="border-b border-[#232834] flex items-center gap-6 overflow-x-auto no-scrollbar">
                        {([
                          { id: 'MODEL', label: `Model Portföy (${plan.modelPortfolio.length})` },
                          { id: 'ROTATION', label: `Değişim Önerileri (${plan.rotationSignals.rotateOut.length})` },
                          { id: 'ALL_LAYERS', label: `AL Adayları (${plan.totalAlCount})` },
                          { id: 'NOTR_AUDIT', label: `NÖTR Hisseler (${plan.tierANeutralCandidates.length})` },
                        ] as const).map(tab => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setArchitectTierFilter(tab.id)}
                            className={`pb-2.5 text-xs whitespace-nowrap cursor-pointer border-b-2 transition-colors ${
                              architectTierFilter === tab.id
                                ? 'border-slate-100 text-white font-semibold'
                                : 'border-transparent text-slate-400 hover:text-slate-200 font-medium'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* TL Sermaye & Aylık İlave Yatırım Toolbar'ı */}
                      {architectTierFilter === 'MODEL' && renderCapitalPlannerBar(alloc, 'architect')}

                      {/* SEKMELERİN İÇERİĞİ */}
                      {architectTierFilter === 'MODEL' && (
                        <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                          {/* Tablo İçi Entegre Monokrom Sektör Dağılım Şeridi */}
                          {plan.sectorBreakdown.length > 0 && (
                            <div className="px-4 py-3 border-b border-[#232834] space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-sans text-slate-400">
                                <span className="font-medium">
                                  Sektörel Dağılım <span className="text-slate-500 font-mono">(Tavan %{architectConfig.maxSectorWeightPct})</span>
                                </span>
                                <span className="font-mono text-slate-400">{plan.sectorBreakdown.length} Sektör</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-[#101319] overflow-hidden flex gap-0.5">
                                {plan.sectorBreakdown.map((sec, sIdx) => (
                                  <div
                                    key={sec.sectorName}
                                    className={`h-full ${SECTOR_BAR_COLORS[sIdx % SECTOR_BAR_COLORS.length]} first:rounded-l-full last:rounded-r-full`}
                                    style={{ width: `${Math.max(1, sec.weightPct)}%` }}
                                    title={`${sec.sectorName}: %${sec.weightPct.toFixed(1)} (${sec.tickers.join(', ')})`}
                                  />
                                ))}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                {plan.sectorBreakdown.map((sec, sIdx) => {
                                  const secTryTotal = sec.tickers.reduce(
                                    (sum, tk) => sum + (allocRowByTicker.get(tk)?.finalValueTry || 0),
                                    0
                                  );
                                  return (
                                    <span
                                      key={sec.sectorName}
                                      className="inline-flex items-center gap-1.5 text-xs font-mono"
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${SECTOR_BAR_COLORS[sIdx % SECTOR_BAR_COLORS.length]}`} />
                                      <span className="text-slate-300 font-sans">{sec.sectorName}</span>
                                      <span className={`font-semibold ${sec.weightPct > architectConfig.maxSectorWeightPct ? 'text-rose-400' : 'text-slate-100'}`}>
                                        %{sec.weightPct.toFixed(1)}
                                      </span>
                                      {secTryTotal > 0 && (
                                        <span className="text-slate-500 text-[11px]">{formatTryInt(secTryTotal)}</span>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Model Portföy Tablosu */}
                          <div className="overflow-x-auto touch-pan-x no-scrollbar">
                            <table className="w-full text-left text-xs border-collapse font-sans">
                              <thead>
                                <tr className="border-b border-[#232834] bg-[#101319] text-[11px] font-sans font-medium text-slate-400">
                                  <th className="py-2.5 px-4">Hisse</th>
                                  <th className="py-2.5 px-3 text-center">Ağırlık</th>
                                  <th className="py-2.5 px-3 text-right">
                                    {portfolioCapitalState.allocationMode === 'topup' ? 'İlave Alım' : 'Tutar / Lot'}
                                  </th>
                                  <th className="py-2.5 px-3 text-right">Fiyat / Adil Değer</th>
                                  <th className="py-2.5 px-3 text-center">Potansiyel</th>
                                  <th className="py-2.5 px-3 text-center">Temel Kalite</th>
                                  <th className="py-2.5 px-4 text-right">İşlem</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#232834] text-slate-200 tabular-nums">
                                {plan.modelPortfolio.map((item) => {
                                  const meta = tierBadgeMeta(item.tier);
                                  const allocRow = allocRowByTicker.get(item.ticker);
                                  const statusMeta = getTargetStatusMeta(item.targetStatus);
                                  const isTopUp = portfolioCapitalState.allocationMode === 'topup';
                                  return (
                                    <tr
                                      key={item.ticker}
                                      onClick={() => openReport(item.reportId, item.ticker)}
                                      className="fv-row cursor-pointer group"
                                    >
                                      <td className="py-3 px-4">
                                        <div className="min-w-0">
                                          <div className="flex items-baseline gap-2">
                                            <span className="font-mono font-semibold text-sm text-white group-hover:underline">
                                              {item.ticker}
                                            </span>
                                            <span className={`text-[11px] font-sans ${meta.cls}`}>
                                              {meta.label}
                                            </span>
                                          </div>
                                          <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                                            {item.sectorName} · {item.period}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-3 px-3 text-center font-mono">
                                        <div className="inline-flex flex-col items-center gap-1 min-w-[74px]">
                                          <span className="font-semibold text-sm text-white">
                                            %{item.recommendedWeightPct.toFixed(1)}
                                          </span>
                                          {isTopUp && allocRow && (
                                            <span className="text-[10px] text-slate-400">
                                              {allocRow.existingWeightPct.toFixed(1)}% → {allocRow.finalWeightPct.toFixed(1)}%
                                            </span>
                                          )}
                                          <div className="w-full h-1 rounded-full bg-[#101319] overflow-hidden">
                                            <div
                                              className="h-full rounded-full bg-slate-400/70"
                                              style={{ width: `${Math.min(100, Math.round((item.recommendedWeightPct / Math.max(1, architectConfig.maxSingleStockWeightPct)) * 100))}%` }}
                                            />
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-3 px-3 text-right font-mono">
                                        {allocRow ? (
                                          allocRow.isSkippedForRotation ? (
                                            <div className="inline-flex flex-col items-end">
                                              <span className="text-[11px] font-medium text-amber-300">
                                                {allocRow.skipReason || '0 ₺ Alım'}
                                              </span>
                                              {isTopUp && (
                                                <span className="text-[10.5px] text-slate-500 mt-0.5">
                                                  Mevcut: {formatTryInt(allocRow.existingValueTry)}
                                                </span>
                                              )}
                                            </div>
                                          ) : isTopUp ? (
                                            <div>
                                              <div className="text-emerald-400 font-semibold text-sm">
                                                +{formatTryInt(allocRow.orderAmountTry)}
                                              </div>
                                              <div className="text-[11px] text-slate-400">
                                                +{allocRow.orderLots} Lot · Top: {formatTryInt(allocRow.finalValueTry)}
                                              </div>
                                            </div>
                                          ) : (
                                            <div>
                                              <div className="text-white font-semibold text-sm">
                                                {formatTryInt(allocRow.orderAmountTry)}
                                              </div>
                                              <div className="text-[11px] text-slate-400">
                                                {allocRow.orderLots} Lot
                                              </div>
                                            </div>
                                          )
                                        ) : (
                                          <span className="text-slate-500">—</span>
                                        )}
                                      </td>
                                      <td
                                        className="py-3 px-3 text-right font-mono"
                                        title={
                                          item.isLivePrice && item.reportPrice > 0
                                            ? `Canlı BIST Fiyatı (Rapor: ₺${item.reportPrice.toFixed(2)}${item.priceDriftPct != null ? `, ${item.priceDriftPct >= 0 ? '+' : ''}${item.priceDriftPct.toFixed(1)}%` : ''})`
                                            : undefined
                                        }
                                      >
                                        <div className="text-white font-medium">{item.price > 0 ? `₺${item.price.toFixed(2)}` : '—'}</div>
                                        <div className="text-slate-400 text-[11px]">{item.fairValue > 0 ? `Adil ₺${item.fairValue.toFixed(2)}` : '—'}</div>
                                      </td>
                                      <td className="py-3 px-3 text-center font-mono">
                                        <div className="inline-flex flex-col items-center gap-0.5">
                                          <span className={`text-xs font-semibold ${
                                            item.upsidePct > 0
                                              ? 'text-emerald-400'
                                              : item.upsidePct < 0
                                              ? 'text-rose-400'
                                              : 'text-slate-300'
                                          }`}>
                                            {formatPctSigned(item.upsidePct)}
                                          </span>
                                          <span className="text-[10.5px] text-slate-500">
                                            Rf {item.excessReturnOverRfPct >= 0 ? '+' : ''}{item.excessReturnOverRfPct.toFixed(1)}p
                                          </span>
                                          {(item.targetStatus === 'TARGET_REACHED' || item.targetStatus === 'NEAR_TARGET' || item.targetStatus === 'FORENSIC_EXIT') && (
                                            <span className={`text-[10px] font-sans font-medium ${statusMeta.cls}`}>
                                              {statusMeta.label}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-3 px-3 text-center font-mono text-[11px]">
                                        <div className="font-medium text-slate-200">
                                          {item.score}/100 · EVA {item.evaSpreadPct != null ? `${item.evaSpreadPct >= 0 ? '+' : ''}${item.evaSpreadPct}p` : '—'}
                                        </div>
                                        <div className="text-slate-500 mt-0.5">
                                          {item.isBankOrInsurance
                                            ? 'Finansal Kurum'
                                            : `OCF %${item.ocfConversionPct ?? '—'} · ${item.isNetCash ? 'Net Nakit' : `Borç ${item.netDebtToEbitda ?? '—'}x`}`}
                                        </div>
                                      </td>
                                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="inline-flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => togglePortfolio(item.ticker)}
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border cursor-pointer transition-colors ${
                                              item.inCurrentPortfolio
                                                ? 'bg-[#222836] text-white border-[#3b4458]'
                                                : 'bg-[#101319] hover:bg-[#1e2430] text-slate-300 hover:text-white border-[#232834]'
                                            }`}
                                          >
                                            {item.inCurrentPortfolio ? '✓ Portföyde' : 'Ekle'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => toggleCompareTicker(item.ticker)}
                                            className={`p-1.5 rounded-md border cursor-pointer transition-colors ${
                                              compareTickers.includes(item.ticker)
                                                ? 'bg-[#222836] text-white border-[#3b4458]'
                                                : 'bg-transparent text-slate-500 hover:text-white border-transparent hover:border-[#232834]'
                                            }`}
                                            title="Yan Yana Kıyasla"
                                          >
                                            <Scale className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {architectTierFilter === 'ROTATION' && (
                        <div className="space-y-4">
                          {/* Çıkış ve Değişim Önerileri */}
                          <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-[#232834] bg-[#101319] flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${plan.rotationSignals.rotateOut.length > 0 ? 'bg-rose-400' : 'bg-slate-500'}`} />
                                <h3 className="font-sans font-semibold text-xs text-white">
                                  Çıkış ve Değişim Önerileri ({plan.rotationSignals.rotateOut.length})
                                </h3>
                              </div>
                              <span className="text-[11px] font-mono text-slate-400">
                                Eşik: &lt;%{architectConfig.rotationTakeProfitUpsideThresholdPct} veya Risk / ALMA
                              </span>
                            </div>

                            {portfolioTickers.length === 0 ? (
                              <div className="p-6 text-center">
                                <p className="text-xs text-slate-400 font-sans">
                                  Mevcut portföyünüzde hisse bulunmadığı için çıkış önerisi hesaplanmadı. Üstteki <strong className="text-slate-200 font-medium">Portföye Uygula</strong> butonuyla başlayabilirsiniz.
                                </p>
                              </div>
                            ) : plan.rotationSignals.rotateOut.length === 0 ? (
                              <div className="p-4 text-xs font-sans text-slate-300 flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span>Portföyünüzdeki tüm hisseler güncel kâr-al ve kalite eşiklerinin üzerinde yer alıyor.</span>
                              </div>
                            ) : (
                              <div className="divide-y divide-[#232834]">
                                {plan.rotationSignals.rotateOut.map((sig) => (
                                  <div
                                    key={sig.candidate.ticker}
                                    className="px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[#1a1f2b] transition-colors"
                                  >
                                    <div className="space-y-0.5 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono font-semibold text-sm text-white">{sig.candidate.ticker}</span>
                                        <span className="text-[11px] font-mono text-slate-400">
                                          {sig.candidate.sectorName} · Skor {sig.candidate.score}/100 ·{' '}
                                          <span className={sig.candidate.upsidePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                            {formatPctSigned(sig.candidate.upsidePct)}
                                          </span>
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-400 font-sans">{sig.reason}</p>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                      {sig.suggestedReplacement && (
                                        <button
                                          type="button"
                                          onClick={() => swapPortfolioTicker(sig.candidate.ticker, sig.suggestedReplacement!.ticker)}
                                          className="fv-btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                                        >
                                          <RefreshCw className="w-3.5 h-3.5" />
                                          <span>
                                            Değiştir: {sig.candidate.ticker} → {sig.suggestedReplacement.ticker} ({formatPctSigned(sig.suggestedReplacement.upsidePct)})
                                          </span>
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => togglePortfolio(sig.candidate.ticker)}
                                        className="px-2.5 py-1.5 rounded-lg bg-[#101319] hover:bg-[#1e2430] text-slate-300 hover:text-white border border-[#2a3140] text-xs font-medium cursor-pointer transition-colors"
                                      >
                                        Çıkar
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Korunan Pozisyonlar ve Yeni Giriş Adayları */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                              <div className="px-4 py-2.5 border-b border-[#232834] bg-[#101319]">
                                <h4 className="text-xs font-semibold text-white font-sans">
                                  Korunan Pozisyonlar ({plan.rotationSignals.hold.length})
                                </h4>
                              </div>
                              {plan.rotationSignals.hold.length === 0 ? (
                                <p className="p-4 text-xs text-slate-500 font-sans">Korunan pozisyon bulunmuyor.</p>
                              ) : (
                                <div className="divide-y divide-[#232834] max-h-72 overflow-y-auto">
                                  {plan.rotationSignals.hold.map(h => (
                                    <div
                                      key={h.candidate.ticker}
                                      onClick={() => openReport(h.candidate.reportId, h.candidate.ticker)}
                                      className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs font-mono hover:bg-[#1a1f2b] cursor-pointer transition-colors"
                                    >
                                      <div className="min-w-0 truncate">
                                        <span className="font-semibold text-white">{h.candidate.ticker}</span>
                                        <span className="text-slate-400 font-sans ml-2">{h.statusLabel}</span>
                                      </div>
                                      <span className="text-emerald-400 font-semibold shrink-0">{formatPctSigned(h.candidate.upsidePct)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                              <div className="px-4 py-2.5 border-b border-[#232834] bg-[#101319]">
                                <h4 className="text-xs font-semibold text-white font-sans">
                                  Yeni Giriş Adayları ({plan.rotationSignals.rotateIn.length})
                                </h4>
                              </div>
                              {plan.rotationSignals.rotateIn.length === 0 ? (
                                <p className="p-4 text-xs text-slate-500 font-sans">Model portföydeki tüm hisseler zaten portföyünüzde yer alıyor.</p>
                              ) : (
                                <div className="divide-y divide-[#232834] max-h-72 overflow-y-auto">
                                  {plan.rotationSignals.rotateIn.map(cand => (
                                    <div
                                      key={cand.ticker}
                                      onClick={() => openReport(cand.reportId, cand.ticker)}
                                      className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs font-mono hover:bg-[#1a1f2b] cursor-pointer transition-colors"
                                    >
                                      <div className="min-w-0 truncate">
                                        <span className="font-semibold text-white">{cand.ticker}</span>
                                        <span className="text-slate-400 font-sans ml-2">{cand.sectorName} · Skor {cand.score}</span>
                                      </div>
                                      <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <span className="text-emerald-400 font-semibold">{formatPctSigned(cand.upsidePct)}</span>
                                        <button
                                          type="button"
                                          onClick={() => togglePortfolio(cand.ticker)}
                                          className="px-2 py-1 rounded-md bg-[#101319] hover:bg-[#222836] text-slate-300 hover:text-white border border-[#232834] text-[11px] font-medium cursor-pointer transition-colors"
                                        >
                                          + Ekle
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {architectTierFilter === 'ALL_LAYERS' && (
                        <div className="space-y-4">
                          {/* Kriter Dışı Kalan AL Hisseleri */}
                          {plan.tier3FilteredAl.length > 0 && (
                            <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                              <div className="px-4 py-2.5 border-b border-[#232834] bg-[#101319] flex items-center justify-between gap-2">
                                <h4 className="text-xs font-semibold text-white font-sans flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                                  <span>
                                    Kriter Dışı Kalan AL Hisseleri ({plan.tier3FilteredAl.length}
                                    {plan.belowRiskFreeAlCount > 0 ? ` · ${plan.belowRiskFreeAlCount} faiz altı` : ''})
                                  </span>
                                </h4>
                              </div>
                              <div className="divide-y divide-[#232834]">
                                {plan.tier3FilteredAl.map(item => (
                                  <div
                                    key={item.ticker}
                                    onClick={() => openReport(item.reportId, item.ticker)}
                                    className="px-4 py-3 hover:bg-[#1a1f2b] cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors"
                                  >
                                    <div className="min-w-0 space-y-0.5">
                                      <div className="flex items-center gap-2 font-mono">
                                        <span className="font-semibold text-sm text-white">{item.ticker}</span>
                                        <span className="text-xs font-sans text-slate-400">{item.sectorName}</span>
                                      </div>
                                      <p className="text-xs text-slate-400 font-sans">
                                        {item.filterReasons.join(' · ')}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0 font-mono text-xs">
                                      <span className={item.upsidePct >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                                        {formatPctSigned(item.upsidePct)}
                                      </span>
                                      <span className="text-slate-400">Skor {item.score}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Ana ve İkincil AL Adayları */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                              <div className="px-4 py-2.5 border-b border-[#232834] bg-[#101319]">
                                <h4 className="text-xs font-semibold text-white font-sans">
                                  Ana Pozisyon Adayları ({plan.tier1CoreAl.length})
                                </h4>
                              </div>
                              <div className="divide-y divide-[#232834] max-h-96 overflow-y-auto">
                                {plan.tier1CoreAl.map(c => (
                                  <div
                                    key={c.ticker}
                                    onClick={() => openReport(c.reportId, c.ticker)}
                                    className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-[#1a1f2b] cursor-pointer transition-colors"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-mono font-semibold text-white truncate">
                                        {c.ticker} <span className="text-slate-400 font-sans font-normal">· {c.sectorName}</span>
                                      </div>
                                      <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                                        Skor {c.score} · EVA {c.evaSpreadPct != null ? `+${c.evaSpreadPct}p` : '—'} · {c.isNetCash ? 'Net Nakit' : `Borç ${c.netDebtToEbitda ?? '—'}x`}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 font-mono" onClick={(e) => e.stopPropagation()}>
                                      <span className="text-emerald-400 font-semibold">{formatPctSigned(c.upsidePct)}</span>
                                      <button
                                        type="button"
                                        onClick={() => togglePortfolio(c.ticker)}
                                        className={`px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors ${
                                          c.inCurrentPortfolio
                                            ? 'bg-[#222836] text-white border-[#3b4458]'
                                            : 'bg-[#101319] hover:bg-[#1e2430] text-slate-300 border-[#232834]'
                                        }`}
                                      >
                                        {c.inCurrentPortfolio ? '✓' : '+'}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                              <div className="px-4 py-2.5 border-b border-[#232834] bg-[#101319]">
                                <h4 className="text-xs font-semibold text-white font-sans">
                                  İkincil Pozisyon Adayları ({plan.tier2SatelliteAl.length})
                                </h4>
                              </div>
                              <div className="divide-y divide-[#232834] max-h-96 overflow-y-auto">
                                {plan.tier2SatelliteAl.map(c => (
                                  <div
                                    key={c.ticker}
                                    onClick={() => openReport(c.reportId, c.ticker)}
                                    className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-[#1a1f2b] cursor-pointer transition-colors"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-mono font-semibold text-white truncate">
                                        {c.ticker} <span className="text-slate-400 font-sans font-normal">· {c.sectorName}</span>
                                      </div>
                                      <div className="text-[11px] text-slate-400 font-sans truncate mt-0.5">
                                        {c.cautionNotes.join(' · ')}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 font-mono" onClick={(e) => e.stopPropagation()}>
                                      <span className="text-emerald-400 font-semibold">{formatPctSigned(c.upsidePct)}</span>
                                      <button
                                        type="button"
                                        onClick={() => togglePortfolio(c.ticker)}
                                        className={`px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors ${
                                          c.inCurrentPortfolio
                                            ? 'bg-[#222836] text-white border-[#3b4458]'
                                            : 'bg-[#101319] hover:bg-[#1e2430] text-slate-300 border-[#232834]'
                                        }`}
                                      >
                                        {c.inCurrentPortfolio ? '✓' : '+'}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {architectTierFilter === 'NOTR_AUDIT' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-[#232834] bg-[#101319]">
                              <h4 className="text-xs font-semibold text-white font-sans">
                                Yüksek Kaliteli NÖTR ({plan.tierANeutralCandidates.length})
                              </h4>
                            </div>
                            <div className="divide-y divide-[#232834] max-h-96 overflow-y-auto">
                              {plan.tierANeutralCandidates.map(c => (
                                <div
                                  key={c.ticker}
                                  onClick={() => openReport(c.reportId, c.ticker)}
                                  className="px-4 py-2.5 hover:bg-[#1a1f2b] cursor-pointer flex items-center justify-between gap-2 text-xs transition-colors"
                                >
                                  <div className="min-w-0">
                                    <div className="font-mono font-semibold text-white truncate">
                                      {c.ticker} <span className="text-slate-400 font-sans font-normal">· {c.sectorName}</span>
                                    </div>
                                    <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                                      Skor {c.score}/100 · EVA {c.evaSpreadPct != null ? `+${c.evaSpreadPct}p` : '—'} · OCF/Net {c.ocfConversionPct != null ? `%${c.ocfConversionPct}` : '—'}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 font-mono" onClick={(e) => e.stopPropagation()}>
                                    <span className={c.upsidePct >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                                      {formatPctSigned(c.upsidePct)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => togglePortfolio(c.ticker)}
                                      className={`px-2 py-1 rounded-md border text-[11px] font-medium cursor-pointer transition-colors ${
                                        c.inCurrentPortfolio
                                          ? 'bg-[#222836] text-white border-[#3b4458]'
                                          : 'bg-[#101319] hover:bg-[#1e2430] text-slate-300 border-[#232834]'
                                      }`}
                                    >
                                      {c.inCurrentPortfolio ? '✓ Portföyde' : '+ Ekle'}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-[#232834] bg-[#101319]">
                              <h4 className="text-xs font-semibold text-white font-sans flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                                <span>Riskli / Değer Tuzağı ({plan.neutralValueTraps.length})</span>
                              </h4>
                            </div>
                            <div className="divide-y divide-[#232834] max-h-96 overflow-y-auto">
                              {plan.neutralValueTraps.slice(0, 15).map(c => (
                                <div
                                  key={c.ticker}
                                  onClick={() => openReport(c.reportId, c.ticker)}
                                  className="px-4 py-2.5 hover:bg-[#1a1f2b] cursor-pointer space-y-0.5 text-xs transition-colors"
                                >
                                  <div className="flex items-center justify-between font-mono">
                                    <span className="font-semibold text-white">
                                      {c.ticker} <span className="text-slate-400 font-sans font-normal">· {c.sectorName}</span>
                                    </span>
                                    <span className="text-amber-300 font-semibold">{formatPctSigned(c.upsidePct)}</span>
                                  </div>
                                  <div className="text-slate-400 font-sans text-[11px]">
                                    {c.filterReasons.join(' · ')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })() : (() => {
                  const holdingAllocByTicker = isPortfolio
                    ? new Map(holdingsAllocationPlan.rows.map(r => [r.ticker, r]))
                    : null;
                  const rotateAlerts = isPortfolio ? forensicPortfolioPlan.rotationSignals.rotateOut : [];
                  const isTopUpMode = portfolioCapitalState.allocationMode === 'topup';

                  return (
                <>
                {/* HEDEF FİYATA ULAŞAN / DEĞİŞİM GEREKTİREN HİSSE UYARISI (Yalnızca Portföyüm'de) */}
                {isPortfolio && rotateAlerts.length > 0 && (
                  <div className="bg-[#151821] border border-[#232834] border-l-2 border-l-rose-400 rounded-xl p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#232834]">
                      <div className="flex items-center gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                        <div>
                          <h3 className="text-xs font-semibold text-white font-sans">
                            Hedefe Yaklaşan veya Değişim Gerektiren Hisseler ({rotateAlerts.length})
                          </h3>
                          <p className="text-[11px] text-slate-400 font-sans">
                            Adil değer hedefine ulaşan veya kalitesi bozulan pozisyonları tek tıkla Model Portföy adayıyla değiştirebilirsiniz.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPortfolioWorkspaceTab('architect');
                          setArchitectTierFilter('ROTATION');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#101319] hover:bg-[#1e2430] text-slate-200 border border-[#2a3140] text-xs font-medium cursor-pointer self-start sm:self-auto transition-colors"
                      >
                        Değişim Önerilerini Gör
                      </button>
                    </div>

                    <div className="divide-y divide-[#232834] rounded-lg border border-[#232834] bg-[#101319] overflow-hidden">
                      {rotateAlerts.map(sig => (
                        <div
                          key={sig.candidate.ticker}
                          className="px-3.5 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
                              <span className="font-semibold text-sm text-white">{sig.candidate.ticker}</span>
                              <span className="text-slate-400">
                                ₺{sig.candidate.price.toFixed(2)} → Adil ₺{sig.candidate.fairValue.toFixed(2)}
                              </span>
                              <span className={`font-semibold ${
                                sig.candidate.upsidePct <= 0 ? 'text-rose-400' : 'text-amber-300'
                              }`}>
                                {formatPctSigned(sig.candidate.upsidePct)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 font-sans">{sig.reason}</p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {sig.suggestedReplacement && (
                              <button
                                type="button"
                                onClick={() => swapPortfolioTicker(sig.candidate.ticker, sig.suggestedReplacement!.ticker)}
                                className="fv-btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>
                                  Değiştir: {sig.candidate.ticker} → {sig.suggestedReplacement.ticker} ({formatPctSigned(sig.suggestedReplacement.upsidePct)})
                                </span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openReport(sig.candidate.reportId, sig.candidate.ticker)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#151821] hover:bg-[#1e2430] text-slate-300 hover:text-white border border-[#232834] text-xs font-medium cursor-pointer transition-colors"
                            >
                              İncele
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PORTFÖYÜM TL BÜTÇE & AYLIK İLAVE ALIM DAĞITICI */}
                {isPortfolio && collectionAll.length > 0 && renderCapitalPlannerBar(holdingsAllocationPlan, 'holdings')}

                {/* Filtre, Arama & Sıralama Kontrol Barı */}
                <div className="bg-[#151821] border border-[#232834] px-4 py-3 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Karar Filtreleri (Portföy & Favoriler Her İkisinde Aktif) */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {[
                      { key: 'ALL', label: 'TÜMÜ', count: collectionAll.length, dot: 'bg-slate-400' },
                      { key: 'AL', label: 'AL', count: colAl.length, dot: 'bg-emerald-400' },
                      { key: 'NÖTR', label: 'NÖTR', count: colNotr.length, dot: 'bg-amber-300' },
                      { key: 'ALMA', label: 'ALMA', count: colAlma.length, dot: 'bg-rose-400' },
                    ].map(tab => {
                      const isSelected = activeDecisionFilter === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setActiveDecisionFilter(tab.key as any)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border whitespace-nowrap transition-colors ${
                            isSelected
                              ? 'bg-[#222836] text-white border-[#3b4458]'
                              : 'border-transparent bg-[#101319] text-slate-400 hover:text-slate-200 hover:border-[#232834]'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${tab.dot}`} />
                          <span>{tab.label}</span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Arama */}
                  <div className="relative w-full lg:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={analyzedSearch}
                      onChange={(e) => setAnalyzedSearch(e.target.value)}
                      placeholder="Hisse veya sektör ara..."
                      className="w-full bg-[#101319] border border-[#232834] rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-400 transition font-sans"
                    />
                    {analyzedSearch && (
                      <button
                        type="button"
                        onClick={() => setAnalyzedSearch('')}
                        aria-label="Aramayı temizle"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Şirketler Gösterimi */}
                {sortedList.length === 0 ? (
                  <div className="bg-[#151821] border border-[#232834] rounded-xl p-12 text-center text-slate-400 space-y-3.5">
                    <div className="w-12 h-12 mx-auto rounded-xl border border-[#232834] bg-[#101319] flex items-center justify-center text-slate-400">
                      {isPortfolio ? <Briefcase className="w-6 h-6" /> : <Star className="w-6 h-6" />}
                    </div>
                    <h4 className="text-base font-semibold text-slate-100 font-sans">
                      {collectionAll.length > 0
                        ? 'Seçili Filtreye Uyan Şirket Bulunamadı'
                        : isPortfolio
                        ? 'Portföyünüzde Henüz Şirket Yok'
                        : 'Favori Listenizde Henüz Şirket Yok'}
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto font-sans">
                      {collectionAll.length > 0
                        ? 'Farklı bir karar filtresi seçebilir veya arama metnini temizleyebilirsiniz.'
                        : isPortfolio
                        ? 'Üstteki "Portföye Ekle" butonundan mevcut analizlerinizi ekleyebilir veya şirket raporundaki "+ Portföy" butonunu kullanabilirsiniz.'
                        : 'Üstteki "Favoriye Ekle" butonundan izlemek istediğiniz şirketleri ekleyebilir veya rapor ekranındaki "★ İzle" butonuna tıklayabilirsiniz.'}
                    </p>
                    <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1">
                      {collectionAll.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => { setActiveDecisionFilter('ALL'); setAnalyzedSearch(''); }}
                          className="px-4 py-2 bg-[#222836] hover:bg-[#2b313d] text-white rounded-lg text-xs font-medium border border-[#3b4458] cursor-pointer"
                        >
                          Filtreleri Temizle
                        </button>
                      ) : (
                        <>
                          {deduplicatedSaved.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setQuickAddOpen(true)}
                              className="fv-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Analizlerden Hızlı Ekle</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => navigateTo('input')}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-[#101319] hover:bg-[#1e2430] text-slate-200 border border-[#2a3140] rounded-lg text-xs font-medium cursor-pointer font-sans"
                          >
                            <PlusCircle className="w-4 h-4" />
                            <span>Yeni Şirket Analiz Et</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : currentViewMode === 'list' ? (
                  /* Liste / Tablo Görünümü */
                  <div className="bg-[#151821] border border-[#232834] rounded-xl overflow-hidden">
                    <div className="overflow-x-auto touch-pan-x no-scrollbar">
                      <table className="w-full text-left text-xs border-collapse font-sans">
                        <thead>
                          <tr className="border-b border-[#232834] bg-[#101319] text-[11px] font-sans font-medium text-slate-400">
                            <th onClick={() => toggleSavedSort('ticker')} className="py-3 px-4 cursor-pointer select-none hover:text-white sticky left-0 bg-[#101319] z-10 min-w-[130px]">
                              <span className="inline-flex items-center gap-1">
                                <span>Hisse</span>
                                {savedTableSort.key === 'ticker' && <span className="text-white">{savedTableSort.direction === 'asc' ? '↑' : '↓'}</span>}
                              </span>
                            </th>
                            <th className="py-3 px-3">Sektör</th>
                            {isPortfolio && (
                              <>
                                <th className="py-3 px-3 text-center">Hedef Ağırlık</th>
                                <th className="py-3 px-3 text-center">Mevcut Lot</th>
                                <th className="py-3 px-3 text-right">
                                  {isTopUpMode ? 'İlave Alım' : 'Tutar / Lot'}
                                </th>
                              </>
                            )}
                            <th onClick={() => toggleSavedSort('price')} className="py-3 px-3 text-right cursor-pointer select-none hover:text-white">
                              <span className="inline-flex items-center justify-end gap-1 w-full">
                                <span>Fiyat</span>
                                {savedTableSort.key === 'price' && <span className="text-white">{savedTableSort.direction === 'asc' ? '↑' : '↓'}</span>}
                              </span>
                            </th>
                            <th onClick={() => toggleSavedSort('fairValue')} className="py-3 px-3 text-right cursor-pointer select-none hover:text-white">
                              <span className="inline-flex items-center justify-end gap-1 w-full">
                                <span>Adil Değer</span>
                                {savedTableSort.key === 'fairValue' && <span className="text-white">{savedTableSort.direction === 'asc' ? '↑' : '↓'}</span>}
                              </span>
                            </th>
                            <th onClick={() => toggleSavedSort('discount')} className="py-3 px-3 text-center cursor-pointer select-none hover:text-white">
                              <span className="inline-flex items-center justify-center gap-1 w-full">
                                <span>Potansiyel</span>
                                {savedTableSort.key === 'discount' && <span className="text-white">{savedTableSort.direction === 'asc' ? '↑' : '↓'}</span>}
                              </span>
                            </th>
                            <th onClick={() => toggleSavedSort('score')} className="py-3 px-3 text-center cursor-pointer select-none hover:text-white">
                              <span className="inline-flex items-center justify-center gap-1 w-full">
                                <span>Skor</span>
                                {savedTableSort.key === 'score' && <span className="text-white">{savedTableSort.direction === 'asc' ? '↑' : '↓'}</span>}
                              </span>
                            </th>
                            <th onClick={() => toggleSavedSort('decision')} className="py-3 px-3 text-center cursor-pointer select-none hover:text-white">
                              <span className="inline-flex items-center justify-center gap-1 w-full">
                                <span>Karar</span>
                                {savedTableSort.key === 'decision' && <span className="text-white">{savedTableSort.direction === 'asc' ? '↑' : '↓'}</span>}
                              </span>
                            </th>
                            <th onClick={() => toggleSavedSort('date')} className="py-3 px-3 text-center cursor-pointer select-none hover:text-white">
                              <span className="inline-flex items-center justify-center gap-1 w-full">
                                <span>Tarih</span>
                                {savedTableSort.key === 'date' && <span className="text-white">{savedTableSort.direction === 'asc' ? '↑' : '↓'}</span>}
                              </span>
                            </th>
                            <th className="py-3 px-4 text-right">İşlem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#232834] text-slate-300 tabular-nums">
                          {sortedList.map((item) => {
                            const isAl = (item.decision || '').trim().toUpperCase() === 'AL';
                            const isAlma = (item.decision || '').trim().toUpperCase() === 'ALMA';
                            const { fairVal, priceNum, discount } = getItemValuationMetrics(item);
                            const companyName = (item as any).companyName || item.extractedData?.company_name || '';
                            const symUpper = (item.ticker || '').toUpperCase();
                            const inPort = portfolioTickers.includes(symUpper);
                            const inFav = favoriteTickers.includes(symUpper);
                            const hAlloc = holdingAllocByTicker?.get(symUpper);
                            const hStatusMeta = hAlloc ? getTargetStatusMeta(hAlloc.candidate.targetStatus) : null;

                            return (
                              <tr
                                key={item.id}
                                onClick={() => openReport(item.id, item.ticker)}
                                className="fv-row cursor-pointer group"
                              >
                                <td className="py-3 px-4 sticky left-0 bg-[#151821] group-hover:bg-[#1c222d] z-10 min-w-[130px]">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-semibold text-sm text-white group-hover:underline">
                                      {item.ticker}
                                    </span>
                                    {item.isValueTrap && (
                                      <span title="Değer Tuzağı Uyarısı" className="text-rose-400">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                      </span>
                                    )}
                                    {companyName && (
                                      <span className="text-xs text-slate-400 truncate max-w-[165px] hidden sm:inline">
                                        {companyName}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3 font-sans text-xs text-slate-400">
                                  {getCompanySectorDisplayName(item.ticker, item.sector)}
                                </td>
                                {isPortfolio && (
                                  <>
                                    <td className="py-3 px-3 text-center font-mono text-xs">
                                      {hAlloc ? (
                                        <div className="inline-flex flex-col items-center">
                                          <span className="font-semibold text-white">%{hAlloc.targetWeightPct.toFixed(1)}</span>
                                          {isTopUpMode && (
                                            <span className="text-[10px] text-slate-400">
                                              {hAlloc.existingWeightPct.toFixed(1)}% → {hAlloc.finalWeightPct.toFixed(1)}%
                                            </span>
                                          )}
                                        </div>
                                      ) : <span className="text-slate-500">—</span>}
                                    </td>
                                    <td className="py-3 px-3 text-center font-mono" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={
                                          portfolioCapitalState.positions[symUpper]?.shares != null
                                            ? portfolioCapitalState.positions[symUpper]?.shares
                                            : hAlloc?.existingLots || 0
                                        }
                                        onChange={(e) => updateHoldingShares(symUpper, e.target.value)}
                                        aria-label={`${symUpper} mevcut lot adedi`}
                                        className="w-16 bg-[#101319] border border-[#232834] focus:border-slate-400 rounded-md px-2 py-1 text-center text-xs font-mono font-semibold text-white tabular-nums focus:outline-none"
                                      />
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono text-xs">
                                      {hAlloc ? (
                                        hAlloc.isSkippedForRotation ? (
                                          <span className="text-[11px] font-medium text-amber-300">
                                            {hAlloc.skipReason || '0 ₺ Alım'}
                                          </span>
                                        ) : isTopUpMode ? (
                                          <div>
                                            <div className="text-emerald-400 font-semibold">+{formatTryInt(hAlloc.orderAmountTry)}</div>
                                            <div className="text-[10.5px] text-slate-400">
                                              +{hAlloc.orderLots} Lot · Top: {formatTryInt(hAlloc.finalValueTry)}
                                            </div>
                                          </div>
                                        ) : (
                                          <div>
                                            <div className="text-white font-semibold">{formatTryInt(hAlloc.orderAmountTry)}</div>
                                            <div className="text-[10.5px] text-slate-400">{hAlloc.orderLots} Lot</div>
                                          </div>
                                        )
                                      ) : <span className="text-slate-500">—</span>}
                                    </td>
                                  </>
                                )}
                                <td className="py-3 px-3 text-right font-mono font-medium text-white">
                                  {priceNum > 0 ? `₺${priceNum.toFixed(2)}` : '—'}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-medium text-slate-300">
                                  {fairVal > 0 ? `₺${fairVal.toFixed(2)}` : '—'}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <div className="inline-flex flex-col items-center gap-0.5">
                                    {discount !== null ? (
                                      <span className={`text-xs font-mono font-semibold ${
                                        discount > 0
                                          ? 'text-emerald-400'
                                          : discount < 0
                                          ? 'text-rose-400'
                                          : 'text-slate-300'
                                      }`}>
                                        {discount >= 0 ? `+${discount}%` : `${discount}%`}
                                      </span>
                                    ) : <span className="text-slate-500">—</span>}
                                    {isPortfolio && hStatusMeta && (hAlloc?.candidate.targetStatus === 'TARGET_REACHED' || hAlloc?.candidate.targetStatus === 'NEAR_TARGET' || hAlloc?.candidate.targetStatus === 'FORENSIC_EXIT') && (
                                      <span className={`text-[10px] font-sans font-medium whitespace-nowrap ${hStatusMeta.cls}`}>
                                        {hStatusMeta.label}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-center font-mono font-medium text-xs text-slate-200">
                                  {formatScore(item.score)}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className={`text-xs font-mono font-semibold ${
                                    isAl ? 'text-emerald-400' :
                                    isAlma ? 'text-rose-400' :
                                    'text-amber-300'
                                  }`}>
                                    {item.decision || 'NÖTR'}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-center font-mono text-[11px] text-slate-400">
                                  {formatAnalysisDate(item.createdAt) || '—'}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); toggleCompareTicker(item.ticker); }}
                                      title={compareTickers.includes((item.ticker || '').toUpperCase()) ? 'Kıyaslamadan Çıkar' : 'Yan Yana Kıyasla'}
                                      className={`p-1.5 rounded-md border cursor-pointer transition-colors ${
                                        compareTickers.includes((item.ticker || '').toUpperCase())
                                          ? 'bg-[#222836] text-white border-[#3b4458]'
                                          : 'bg-transparent text-slate-500 hover:text-white border-transparent hover:border-[#232834]'
                                      }`}
                                    >
                                      <Scale className="w-3.5 h-3.5" />
                                    </button>
                                    {!isPortfolio && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); togglePortfolio(item.ticker); }}
                                        title={inPort ? 'Portföyden Çıkar' : 'Portföye Ekle'}
                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer transition-colors ${
                                          inPort
                                            ? 'bg-[#222836] text-white border-[#3b4458]'
                                            : 'bg-[#101319] text-slate-300 hover:text-white border-[#232834]'
                                        }`}
                                      >
                                        <Briefcase className="w-3 h-3" />
                                        <span className="hidden xl:inline">{inPort ? 'Portföyde' : '+ Portföy'}</span>
                                      </button>
                                    )}
                                    {isPortfolio && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(item.ticker); }}
                                        title={inFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                                        className={`p-1.5 rounded-md border cursor-pointer transition-colors ${
                                          inFav
                                            ? 'bg-[#222836] text-amber-300 border-[#3b4458]'
                                            : 'bg-transparent text-slate-500 hover:text-white border-transparent hover:border-[#232834]'
                                        }`}
                                      >
                                        <Star className={`w-3.5 h-3.5 ${inFav ? 'fill-amber-300 text-amber-300' : ''}`} />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isPortfolio) togglePortfolio(item.ticker);
                                        else toggleFavorite(item.ticker);
                                      }}
                                      className="p-1.5 rounded-md bg-transparent hover:bg-[#1e2430] text-slate-500 hover:text-rose-400 border border-transparent hover:border-[#232834] cursor-pointer transition-colors"
                                      title={isPortfolio ? 'Portföyden Çıkar' : 'Favorilerden Çıkar'}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openReport(item.id, item.ticker);
                                      }}
                                      className="p-1.5 rounded-md bg-[#101319] hover:bg-[#222836] text-slate-300 hover:text-white cursor-pointer border border-[#232834] transition-colors"
                                      title="Şirket Analizini Aç"
                                    >
                                      <ArrowUpRight className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : currentViewMode === 'compact' ? (
                  /* Kompakt Rozetler Görünümü */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {sortedList.map((item) => {
                      const isAl = (item.decision || '').trim().toUpperCase() === 'AL';
                      const isAlma = (item.decision || '').trim().toUpperCase() === 'ALMA';
                      const { priceNum, discount } = getItemValuationMetrics(item);
                      const compactScoreNum = parseNumericScore(item.score);

                      return (
                        <div
                          key={item.id}
                          onClick={() => openReport(item.id, item.ticker)}
                          className={`fv-card ${isAl ? 'fv-card-emerald' : isAlma ? 'fv-card-rose' : 'fv-card-amber'} bg-[#151821] hover:bg-[#1c212c] border border-[#262c38] p-3.5 rounded-xl cursor-pointer group flex flex-col justify-between space-y-2.5 overflow-hidden`}
                        >
                          <div className={`h-0.5 -mx-3.5 -mt-3.5 mb-0.5 ${isAl ? 'bg-emerald-400/80' : isAlma ? 'bg-rose-400/80' : 'bg-amber-400/75'}`} />
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-black text-base text-white group-hover:text-emerald-400 transition">
                              {item.ticker}
                            </span>
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              isAl ? 'bg-emerald-500/15 text-emerald-400' : isAlma ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'
                            }`}>
                              {item.decision || 'NÖTR'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-slate-400 text-[11px] truncate max-w-[115px]">
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

                          <div className="pt-2 border-t border-[#232834] flex items-center justify-between text-[11px] font-mono">
                            <span className="text-white font-bold">{priceNum > 0 ? `₺${priceNum.toFixed(1)}` : '—'}</span>
                            {compactScoreNum !== null ? (
                              <span className={`font-bold px-1.5 py-0.5 rounded bg-[#101319] border border-[#262c38] ${getScoreColorStyle(item.score).text}`}>
                                {compactScoreNum}p
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

                      const { fairVal, priceNum, discount } = getItemValuationMetrics(item);
                      const companyName = (item as any).companyName || item.extractedData?.company_name || '';
                      const symCard = (item.ticker || '').toUpperCase();
                      const inPort = portfolioTickers.includes(symCard);
                      const inFav = favoriteTickers.includes(symCard);
                      const cardAlloc = holdingAllocByTicker?.get(symCard);
                      const cardStatusMeta = cardAlloc ? getTargetStatusMeta(cardAlloc.candidate.targetStatus) : null;
                      const marginBarPct = discount !== null
                        ? Math.max(10, Math.min(100, Math.round(Math.abs(discount))))
                        : 0;

                      return (
                        <div
                          key={item.id}
                          onClick={() => openReport(item.id, item.ticker)}
                          className={`fv-card ${isAl ? 'fv-card-emerald' : isAlma ? 'fv-card-rose' : 'fv-card-amber'} bg-[#151821] border border-[#262c38] rounded-2xl overflow-hidden cursor-pointer flex flex-col justify-between group`}
                        >
                          <div className={`h-1 w-full ${isAl ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : isAlma ? 'bg-gradient-to-r from-rose-500 to-red-400' : 'bg-gradient-to-r from-amber-500 to-yellow-400'}`} />
                          <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                            <div className="space-y-3.5">
                              {/* Başlık */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-black text-lg text-white group-hover:text-emerald-400 transition">
                                      {item.ticker}
                                    </span>
                                    {item.period && (
                                      <span className="text-[11px] font-mono text-slate-300 bg-[#101319] px-2 py-0.5 rounded-md border border-[#262c38]">
                                        {item.period}
                                      </span>
                                    )}
                                    <span className="text-[11px] font-mono text-slate-400 bg-[#101319] px-2 py-0.5 rounded-md border border-[#262c38]">
                                      {getCompanySectorDisplayName(item.ticker, item.sector)}
                                    </span>
                                  </div>
                                  {companyName && (
                                    <div className="text-xs text-slate-400 truncate max-w-[215px] mt-0.5 font-sans">
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
                                    className={`p-1.5 rounded-lg border cursor-pointer ${
                                      inFav
                                        ? 'bg-amber-400/20 text-amber-300 border-amber-400/50 hover:bg-amber-400/30'
                                        : 'bg-[#101319] text-slate-400 hover:text-white border-[#262c38]'
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
                                    className={`p-1.5 rounded-lg border cursor-pointer ${
                                      inPort
                                        ? 'bg-[#f5c242]/20 text-[#f5c242] border-[#f5c242]/50 hover:bg-[#f5c242]/30 font-bold'
                                        : 'bg-[#101319] text-slate-400 hover:text-white border-[#262c38]'
                                    }`}
                                  >
                                    <Briefcase className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Karar + Skor + Hedef / Değer Tuzağı Uyarı Şeridi */}
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold inline-flex items-center gap-2 ${badgeCls}`}>
                                  <span>{item.decision || 'NÖTR'}</span>
                                  <span className="w-px h-3 bg-current opacity-30" />
                                  <span className={getScoreColorStyle(item.score).text}>{formatScore(item.score)}</span>
                                </div>
                                {isPortfolio && cardStatusMeta ? (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${cardStatusMeta.cls}`}>
                                    {cardStatusMeta.label}
                                  </span>
                                ) : item.isValueTrap ? (
                                  <span className="inline-flex items-center gap-1 text-[10.5px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/12 text-rose-300 border border-rose-500/30">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>Değer Tuzağı</span>
                                  </span>
                                ) : null}
                              </div>

                              {/* Portföyüm TL Tahsisat & Ağırlık Özeti */}
                              {isPortfolio && cardAlloc && (
                                <div className="px-3 py-2 rounded-xl bg-[#101319] border border-[#232834] flex items-center justify-between text-xs font-mono">
                                  <div>
                                    <span className="text-[10px] text-slate-500 block font-sans">AĞIRLIK</span>
                                    <span className="text-[#f5c242] font-bold">%{cardAlloc.targetWeightPct.toFixed(1)}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[10px] text-slate-500 block font-sans">
                                      {isTopUpMode ? 'İLAVE ALIM' : 'TL TAHSİSAT'}
                                    </span>
                                    {cardAlloc.isSkippedForRotation ? (
                                      <span className="text-amber-300 font-bold">{cardAlloc.skipReason || '0 ₺ Alım'}</span>
                                    ) : isTopUpMode ? (
                                      <span className="text-emerald-400 font-bold">
                                        +{formatTryInt(cardAlloc.orderAmountTry)} (+{cardAlloc.orderLots} Lot)
                                      </span>
                                    ) : (
                                      <span className="text-white font-bold">
                                        {formatTryInt(cardAlloc.orderAmountTry)} ({cardAlloc.orderLots} Lot)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Fiyat & Adil Değer & Hedef Çubuğu */}
                              <div className="p-3 bg-[#101319] rounded-xl border border-[#232834] space-y-2.5">
                                <div className="grid grid-cols-3 divide-x divide-[#232834] text-sm font-mono text-center">
                                  <div>
                                    <span className="text-slate-400 text-[10.5px] block font-sans">Fiyat</span>
                                    <span className="text-white font-bold">{priceNum > 0 ? `₺${priceNum.toFixed(2)}` : '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 text-[10.5px] block font-sans">Adil Değer</span>
                                    <span className="text-emerald-400 font-bold">{fairVal > 0 ? `₺${fairVal.toFixed(2)}` : '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 text-[10.5px] block font-sans">Potansiyel</span>
                                    {discount !== null ? (
                                      <span className={`font-bold ${discount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {discount >= 0 ? `+${discount}%` : `${discount}%`}
                                      </span>
                                    ) : <span className="text-slate-500">—</span>}
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                                    <span>Değerleme Marjı</span>
                                    <span>{discount !== null ? (discount >= 0 ? `%${discount} İskonto` : `%${Math.abs(discount)} Primli`) : '—'}</span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-[#1b202b] overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${discount !== null && discount >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                                      style={{ width: `${marginBarPct}%` }}
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="text-[11px] text-slate-500 flex items-center justify-between font-mono">
                                <span>Güncelleme: {formatAnalysisDate(item.createdAt) || '—'}</span>
                              </div>
                            </div>

                            {/* Alt Aksiyon Butonları */}
                            <div className="flex items-center gap-2 pt-2.5 border-t border-[#232834]">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openReport(item.id, item.ticker);
                                }}
                                className="flex-1 py-2 bg-[#1e232e] group-hover:bg-emerald-600 group-hover:text-white text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-[#2e3440] group-hover:border-emerald-500 cursor-pointer"
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
                                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/12 rounded-xl border border-transparent hover:border-rose-500/35 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                </>
                  );
                })()}
              </div>
            );
          })()}

        </div>
      </main>

      {/* Gizli Yedek Yükleme Dosya Girişi */}
      <input
        type="file"
        ref={backupFileInputRef}
        accept=".json,application/json"
        className="hidden"
        onChange={importBackup}
      />

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
        onNavigateTab={(tab) => navigateTo(tab)}
      />

      {/* Kök Düzey KAP Bildirim Detay Modalı (fixed viewport, header üstünde, Akış & Kokpit ortak) */}
      {selectedDisclosure && (() => {
        const vis = getDisclosureVisualStyle(selectedDisclosure);
        const fullTextParagraphs = (selectedDisclosure.fullText || '')
          .split(/\n+/)
          .map(p => p.trim())
          .filter(Boolean);
        const takeawaysList = (selectedDisclosure.keyTakeaways && selectedDisclosure.keyTakeaways.length > 0
          ? selectedDisclosure.keyTakeaways
          : [selectedDisclosure.summary]);
        // Tek cümlelik kısa bir KAP bildirimi zaten birebir Kilit Noktalar'da yer alıyorsa alt kutuyu tekrarlama
        const normClean = (s: string) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
        const isSingleRedundantBody =
          fullTextParagraphs.length === 1 &&
          takeawaysList.length === 1 &&
          normClean(fullTextParagraphs[0]) === normClean(takeawaysList[0]);

        const handleCopyDisclosure = async () => {
          const body = selectedDisclosure.fullText || selectedDisclosure.summary.replace(/\*\*/g, '');
          const payload = `[${selectedDisclosure.ticker}] ${selectedDisclosure.title}\n${body}\nKaynak: ${selectedDisclosure.kapUrl || selectedDisclosure.url}`;
          try {
            await navigator.clipboard.writeText(payload);
            setCopiedDisclosureText(true);
            setTimeout(() => setCopiedDisclosureText(false), 2000);
          } catch {}
        };

        const modalBaseFeed = liveNewsFeed.length > 0
          ? liveNewsFeed
          : getCompanyNewsFeed({
              tickers: [...new Set(savedReports.map(r => (r.ticker || '').toUpperCase().trim()).filter(Boolean))]
            });
        const sameTickerOthers = modalBaseFeed.filter(n => n.id !== selectedDisclosure.id && n.ticker === selectedDisclosure.ticker);
        const otherTickerOthers = modalBaseFeed.filter(n => n.id !== selectedDisclosure.id && n.ticker !== selectedDisclosure.ticker);
        const relatedDisclosures = [...sameTickerOthers, ...otherTickerOthers];

        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md"
            onClick={() => setSelectedDisclosure(null)}
          >
            <div
              className="fv-modal-panel bg-[#12151c] border border-[#2e3440] rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Üst Semantik Vurgu Şeridi */}
              <div className={`h-1.5 w-full shrink-0 ${vis.topBar}`} />

              {/* Sabit Üst Başlık & Kapatma Çubuğu (Sağ kolonla asla çakışmaz) */}
              <div className="flex items-center justify-between gap-3 px-5 sm:px-7 py-3 bg-[#101319] border-b border-[#232834] shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="font-mono text-xs font-black text-white bg-[#151821] px-2 py-0.5 rounded border border-[#2e3440]">
                    BIST:{selectedDisclosure.ticker}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-sans font-bold border ${vis.badgeCls}`}>
                    {vis.badgeText}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {selectedDisclosure.timeAgo}
                  </span>
                  {selectedDisclosure.kapId && (
                    <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
                      • KAP #{selectedDisclosure.kapId}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDisclosure(null)}
                  aria-label="Bildirimi kapat"
                  className="fv-pill inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-slate-300 hover:text-white bg-[#1a1e26] border border-[#2e3440] hover:bg-[#252b36] cursor-pointer shrink-0 text-xs font-mono"
                  title="Kapat (ESC)"
                >
                  <span className="hidden sm:inline text-[10px] text-slate-400">ESC</span>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Kaydırılabilir Modal İçeriği */}
              <div className="overflow-y-auto flex-1">
                <div className="flex flex-col md:flex-row gap-6 p-5 sm:p-7">
                  {/* Sol / Ana Kolon */}
                  <div className="flex-1 min-w-0 space-y-5">
                    {/* Şirket Başlığı ve Anlamlı Başlık */}
                    <div className={`p-4 rounded-xl bg-gradient-to-r border ${vis.headerTint} space-y-3`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${vis.iconBg}`}>
                          {vis.icon}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-slate-200 font-sans truncate">
                            {selectedDisclosure.companyName}
                          </h4>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px] text-slate-400 font-sans">
                            <span>{selectedDisclosure.categoryLabel}</span>
                            {selectedDisclosure.originalSubject && selectedDisclosure.originalSubject !== selectedDisclosure.title && (
                              <>
                                <span className="text-slate-600">•</span>
                                <span className="text-slate-500">KAP Sınıfı: {selectedDisclosure.originalSubject}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <h2 className="text-lg sm:text-xl font-bold font-sans text-white tracking-tight leading-snug">
                        {selectedDisclosure.title}
                      </h2>
                    </div>

                    {/* On-demand KAP tam metin yükleme göstergesi */}
                    {isHydratingDisclosure && (
                      <div className="p-3.5 rounded-xl bg-[#161a23] border border-[#262c38] space-y-2">
                        <div className="flex items-center gap-2 text-[11px] font-mono text-sky-400">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Resmi KAP bildirim metni çekiliyor...</span>
                        </div>
                        <div className="h-3 w-full rounded fv-shimmer" />
                        <div className="h-3 w-4/5 rounded fv-shimmer" />
                      </div>
                    )}

                    {/* Çıkarılan Finansal Metrik Kartları */}
                    {selectedDisclosure.keyMetrics && selectedDisclosure.keyMetrics.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {selectedDisclosure.keyMetrics.map((m, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-xl border font-mono ${
                              m.tone === 'negative'
                                ? 'bg-rose-500/8 border-rose-500/30'
                                : m.tone === 'positive'
                                ? 'bg-emerald-500/8 border-emerald-500/30'
                                : 'bg-[#161a23] border-[#262c38]'
                            }`}
                          >
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">{m.label}</div>
                            <div className={`text-sm font-bold mt-0.5 ${
                              m.tone === 'negative'
                                ? 'text-rose-300'
                                : m.tone === 'positive'
                                ? 'text-emerald-300'
                                : 'text-white'
                            }`}>
                              {m.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Kilit Noktalar & Finansal Etki */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="text-[11px] font-bold font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Kilit Noktalar &amp; Finansal Etki</span>
                        </h5>
                        {isSingleRedundantBody && (
                          <button
                            type="button"
                            onClick={handleCopyDisclosure}
                            className="fv-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#181c24] hover:bg-[#222834] border border-[#2e3440] text-[11px] font-mono text-slate-300 hover:text-white cursor-pointer"
                          >
                            {copiedDisclosureText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedDisclosureText ? 'Kopyalandı' : 'Kopyala'}</span>
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {takeawaysList.map((bullet, idx) => (
                          <div key={idx} className="flex items-start gap-3 text-sm text-slate-200 leading-relaxed font-sans bg-[#161a23] p-3.5 rounded-xl border border-[#262c38]">
                            <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${vis.dotCls}`} />
                            <span>{renderHighlightedFinancialText(bullet)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resmi KAP Bildirim Metni (Çok paragraflı / tam orijinal metin + tek tık kopyala) */}
                    {fullTextParagraphs.length > 0 && !isSingleRedundantBody && (
                      <div className="p-4 rounded-xl bg-[#101319] border border-[#262c38] space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-sky-400" />
                            <span>Resmi KAP Bildirim Metni</span>
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyDisclosure}
                            className="fv-pill inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#181c24] hover:bg-[#222834] border border-[#2e3440] text-[11px] font-mono text-slate-300 hover:text-white cursor-pointer"
                          >
                            {copiedDisclosureText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedDisclosureText ? 'Kopyalandı' : 'Kopyala'}</span>
                          </button>
                        </div>
                        <div className="space-y-2.5 text-xs sm:text-[13px] text-slate-300 font-sans leading-relaxed max-h-60 overflow-y-auto pr-1">
                          {fullTextParagraphs.map((para, pIdx) => (
                            <p key={pIdx}>{para}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Alt Kaynak Bağlantıları */}
                    <div className="pt-3 border-t border-[#262c38] flex items-center gap-2.5 flex-wrap">
                      <a
                        href={selectedDisclosure.kapUrl || selectedDisclosure.url || getKapCompanyDisclosuresUrl(selectedDisclosure.ticker)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-sans font-bold text-xs cursor-pointer"
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
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-bold text-xs cursor-pointer"
                        >
                          <span>Bigpara Metni</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Sağ Yan Kolon - Şirket Değerleme Kartı & İlgili Bildirimler */}
                  <div className="w-full md:w-72 shrink-0 space-y-4 pt-4 md:pt-0 md:border-l md:border-[#262c38] md:pl-6">
                    {(() => {
                      const report = findLatestReportByTicker(savedReports, selectedDisclosure.ticker);
                      const priceNum = report ? (parseFinancialNumber(report.price) ?? 0) : 0;
                      const fairVal = report ? (parseFinancialNumber(report.fairValue) ?? 0) : 0;
                      const discount = (fairVal > 0 && priceNum > 0)
                        ? Number((((fairVal - priceNum) / priceNum) * 100).toFixed(1))
                        : null;
                      return (
                        <div className="p-4 rounded-xl bg-[#161a23] border border-[#262c38] space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-mono font-black text-sm text-white">
                                {selectedDisclosure.ticker}
                              </span>
                              <p className="text-[11px] text-slate-400 font-sans truncate max-w-[165px]">
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
                            <div className="space-y-2 pt-2 border-t border-[#262c38] text-xs">
                              <div className="flex items-center justify-between text-slate-400">
                                <span>Güncel Fiyat:</span>
                                <span className="font-mono font-bold text-white">{priceNum > 0 ? `₺${priceNum.toFixed(2)}` : '—'}</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-400">
                                <span>Adil Değer:</span>
                                <span className="font-mono font-bold text-emerald-400">{fairVal > 0 ? `₺${fairVal.toFixed(2)}` : '—'}</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-400">
                                <span>Kalite Skoru:</span>
                                <span className={`font-mono font-bold ${getScoreColorStyle(report.score).text}`}>{formatScore(report.score)}</span>
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
                                className="w-full mt-2 py-2 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/22 text-emerald-400 border border-emerald-500/35 text-xs font-bold font-sans cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <span>Şirket Analizine Git</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="pt-2 border-t border-[#262c38] space-y-2">
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
                                className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold font-sans cursor-pointer"
                              >
                                Analiz Başlat
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Diğer Şirket Bildirimleri */}
                    <div className="space-y-2.5">
                      <h5 className="text-[11px] font-bold font-mono uppercase tracking-wider text-slate-400">
                        Diğer Bildirimler
                      </h5>
                      {relatedDisclosures.length === 0 ? (
                        <p className="text-xs text-slate-500 font-sans">Başka bildirim bulunmuyor.</p>
                      ) : (
                        <div className="space-y-2">
                          {relatedDisclosures.slice(0, 5).map(other => {
                            const oVis = getDisclosureVisualStyle(other);
                            return (
                              <div
                                key={other.id}
                                onClick={() => openDisclosureModal(other)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openDisclosureModal(other);
                                  }
                                }}
                                className="fv-card p-3 rounded-xl bg-[#161a23] hover:bg-[#1f2532] border border-[#262c38] cursor-pointer space-y-1 group"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="inline-flex items-center gap-1.5 font-mono font-bold text-white">
                                    <span className={`w-1.5 h-1.5 rounded-full ${oVis.dotCls}`} />
                                    <span>{other.ticker}</span>
                                  </span>
                                  <span className="text-slate-500 font-mono text-[10px]">
                                    {other.timeAgo}
                                  </span>
                                </div>
                                <p className="text-xs font-semibold text-slate-200 group-hover:text-white font-sans line-clamp-2 leading-snug">
                                  {other.title}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* YÜZEN KARŞILAŞTIRMA TEPSİSİ (2-3 HİSSE YAN YANA KIYASLAMA) */}
      {compareTickers.length > 0 && !isCompareModalOpen && (
        <div
          data-testid="fv-compare-tray"
          className="fixed bottom-16 md:bottom-5 left-1/2 -translate-x-1/2 z-[55] bg-[#131722]/95 backdrop-blur-md border border-cyan-500/40 rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-center gap-3 flex-wrap max-w-[95vw]"
        >
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-400">
            <Scale className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Kıyaslama ({compareTickers.length}/3):</span>
          </div>
          <div className="flex items-center gap-1.5">
            {compareTickers.map(tk => (
              <span
                key={tk}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#1c2230] border border-[#2f384b] font-mono text-xs font-bold text-white"
              >
                <span>{tk}</span>
                <button
                  type="button"
                  onClick={() => toggleCompareTicker(tk)}
                  className="text-slate-400 hover:text-rose-400 cursor-pointer"
                  aria-label={`${tk} kıyaslamadan çıkar`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={compareTickers.length < 2}
              onClick={() => setIsCompareModalOpen(true)}
              className="fv-pill px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold font-sans flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
            >
              <span>Yan Yana Kıyasla</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => { setCompareTickers([]); setIsCompareModalOpen(false); }}
              className="px-2 py-1.5 rounded-xl text-xs font-mono text-slate-400 hover:text-rose-400 hover:bg-[#1c2230] cursor-pointer"
              title="Seçimi Temizle"
            >
              Temizle
            </button>
          </div>
        </div>
      )}

      {/* KURUMSAL YAN YANA ŞİRKET KIYASLAMA MODALI */}
      {isCompareModalOpen && compareTickers.length >= 2 && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md"
          onClick={() => setIsCompareModalOpen(false)}
        >
          <div
            data-testid="fv-compare-modal"
            className="fv-modal-panel bg-[#12151c] border border-[#2e3440] rounded-2xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-[#101319] border-b border-[#232834]">
              <div className="flex items-center gap-2.5">
                <Scale className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm sm:text-base font-bold text-white font-sans">
                  Yan Yana Şirket Değerleme &amp; Adli Matris Kıyaslaması ({compareTickers.length} Şirket)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCompareModalOpen(false)}
                className="p-1.5 rounded-xl bg-[#1a1e26] hover:bg-[#252b36] text-slate-300 hover:text-white border border-[#2e3440] cursor-pointer"
                aria-label="Kıyaslamayı kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-auto p-4 sm:p-6">
              <div className={`grid gap-4 ${compareTickers.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
                {compareTickers.map(tk => {
                  const rep = findLatestReportByTicker(savedReports, tk);
                  const pr = rep ? (parseFinancialNumber(rep.price) ?? 0) : 0;
                  const fv = rep ? (parseFinancialNumber(rep.fairValue) ?? 0) : 0;
                  const disc = (fv > 0 && pr > 0) ? Number((((fv - pr) / pr) * 100).toFixed(1)) : null;
                  const sc = rep ? parseNumericScore(rep.score) : null;
                  const dec = (rep?.decision || 'NÖTR').toUpperCase();
                  const hist = Array.isArray(rep?.extractedData?.financial_history) ? rep!.extractedData.financial_history : [];
                  const latest = hist.length > 0 ? hist[hist.length - 1] : null;
                  const margin = latest?.ebitda_margin ?? latest?.net_margin ?? latest?.combined_ratio ?? null;
                  const ret = latest?.roic ?? latest?.roe ?? null;
                  const ocf = parseFinancialNumber(latest?.operating_cash_flow);
                  const tDebt = parseFinancialNumber(latest?.total_debt);
                  const cEq = parseFinancialNumber(latest?.cash_and_equivalents);
                  const netD = parseFinancialNumber(latest?.net_debt) ?? (tDebt != null && cEq != null ? tDebt - cEq : null);

                  return (
                    <div key={tk} className="bg-[#161a23] border border-[#2a3140] rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2 border-b border-[#262c38] pb-3">
                          <div className="min-w-0">
                            <div className="font-mono font-black text-lg text-white">{tk}</div>
                            <div className="text-[11px] text-slate-400 font-sans truncate">
                              {rep ? getCompanySectorDisplayName(tk, rep.sector) : 'Analiz Bulunamadı'}
                            </div>
                          </div>
                          {rep && (
                            <span className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold border ${
                              dec === 'AL' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35' :
                              dec === 'ALMA' ? 'bg-rose-500/15 text-rose-400 border-rose-500/35' :
                              'bg-amber-500/15 text-amber-300 border-amber-500/35'
                            }`}>
                              {dec}
                            </span>
                          )}
                        </div>

                        {rep ? (
                          <div className="space-y-2 text-xs font-mono">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Dönem:</span>
                              <span className="text-slate-200">{rep.period || '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Piyasa Fiyatı:</span>
                              <span className="text-white font-bold">{pr > 0 ? `₺${pr.toFixed(2)}` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Adil Değer:</span>
                              <span className="text-[#f5c242] font-bold">{fv > 0 ? `₺${fv.toFixed(2)}` : '—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Potansiyel:</span>
                              <span className={`font-bold ${disc == null ? 'text-slate-400' : disc >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {disc != null ? `${disc >= 0 ? '+' : ''}%${disc}` : '—'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Kalite Skoru:</span>
                              <span className={`font-bold ${sc != null ? getScoreColorStyle(sc).text : 'text-slate-400'}`}>
                                {sc != null ? `${sc}/100` : '—'}
                              </span>
                            </div>
                            <div className="pt-2 border-t border-[#232834] space-y-1.5">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Operasyonel Marj:</span>
                                <span className="text-slate-200">{margin != null ? `%${Number(margin).toFixed(1)}` : '—'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">ROIC / ROE:</span>
                                <span className="text-slate-200">{ret != null ? `%${Number(ret).toFixed(1)}` : '—'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Operasyonel Nakit:</span>
                                <span className={ocf != null && ocf < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                                  {ocf != null ? formatAmount(ocf, 'bin', false, '', '', rep.extractedData?.currency || 'TRY') : '—'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">{netD != null && netD < 0 ? 'Net Nakit:' : 'Net Borç:'}</span>
                                <span className={netD != null && netD < 0 ? 'text-emerald-400' : 'text-slate-200'}>
                                  {netD != null ? formatAmount(Math.abs(netD), 'bin', false, '', '', rep.extractedData?.currency || 'TRY') : '—'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="py-6 text-center text-xs text-slate-400 font-sans">
                            Bu hisse için henüz analiz raporu bulunmuyor.
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setIsCompareModalOpen(false);
                          if (rep) openReport(rep.id, rep.ticker);
                          else handleOpenOrAnalyzeTicker(tk);
                        }}
                        className="w-full py-2 rounded-xl bg-emerald-500/12 hover:bg-emerald-500/22 text-emerald-400 border border-emerald-500/35 text-xs font-bold font-sans flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>{rep ? 'Tam Raporu Aç' : 'Analiz Başlat'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBİL ALT SABİT NAVİGASYON BARI (MD:HIDDEN) */}
      <nav 
        aria-label="Mobil Ana Menü"
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#111418]/95 backdrop-blur-md border-t border-[#21262d] flex items-center justify-start sm:justify-around overflow-x-auto no-scrollbar gap-0.5 py-1.5 px-2 pb-safe md:hidden select-none shadow-2xl"
      >
        <button
          type="button"
          onClick={() => navigateTo('cockpit')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition cursor-pointer shrink-0 min-w-[54px] ${
            step === 'cockpit'
              ? 'text-[#f5c242] font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span className="text-[10px]">Ana Sayfa</span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo('input')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition cursor-pointer shrink-0 min-w-[54px] ${
            step === 'input'
              ? 'text-emerald-400 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span className="text-[10px]">Analiz</span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo('saved')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition cursor-pointer shrink-0 min-w-[54px] ${
            step === 'saved' && analyzedTab !== 'PORTFOLIO' && analyzedTab !== 'FAVORITES'
              ? 'text-emerald-400 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span className="text-[10px]">Akış</span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo('portfolio')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition cursor-pointer shrink-0 min-w-[54px] relative ${
            step === 'saved' && analyzedTab === 'PORTFOLIO'
              ? 'text-[#f5c242] font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span className="text-[10px]">Portföy</span>
          {portfolioTickers.length > 0 && (
            <span className="absolute top-0 right-1 text-[9px] font-mono px-1 rounded-full bg-[#f5c242] text-slate-950 font-black">
              {portfolioTickers.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigateTo('favorites')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition cursor-pointer shrink-0 min-w-[54px] relative ${
            step === 'saved' && analyzedTab === 'FAVORITES'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Star className="w-4 h-4" />
          <span className="text-[10px]">Favoriler</span>
          {favoriteTickers.length > 0 && (
            <span className="absolute top-0 right-1 text-[9px] font-mono px-1 rounded-full bg-amber-400 text-slate-950 font-black">
              {favoriteTickers.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigateTo('themes')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition cursor-pointer shrink-0 min-w-[54px] ${
            step === 'themes'
              ? 'text-cyan-400 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-[10px]">Temalar</span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo('leaderboard')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition cursor-pointer shrink-0 min-w-[54px] ${
            step === 'leaderboard'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span className="text-[10px]">Tarama</span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo('sectors')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 rounded-lg transition cursor-pointer shrink-0 min-w-[54px] ${
            step === 'sectors'
              ? 'text-emerald-400 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span className="text-[10px]">Sektörler</span>
        </button>
      </nav>

    </div>
  );
}
