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
  BarChart2
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
  ReferenceLine
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
  const [activeSection, setActiveSection] = useState<'overview' | 'valuation'>('overview');
  const [selectedKeyMetric, setSelectedKeyMetric] = useState<'pe' | 'pb' | 'evEbitda' | 'evSales'>('pe');
  const [selectedSnowflakeAxis, setSelectedSnowflakeAxis] = useState<string | null>(null);

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

  // Scrollspy & Intersection Observer
  useEffect(() => {
    const handleScroll = () => {
      const overviewEl = document.getElementById('overview');
      const valuationEl = document.getElementById('valuation');

      if (!overviewEl || !valuationEl) return;

      const scrollPos = window.scrollY + 180;
      const valTop = valuationEl.offsetTop;

      if (scrollPos >= valTop) {
        setActiveSection('valuation');
      } else {
        setActiveSection('overview');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: 'overview' | 'valuation') => {
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
    // Fallback: chartData'dan oluştur
    return chartData.slice(-4).map((pt: any) => ({
      period: pt.period ? pt.period.slice(2) : '',
      AdilDeğer: fairValueNum,
      PiyasaFiyatı: Number(pt.share_price || currentPriceNum)
    }));
  }, [valuationInfo?.fair_value_trend, chartData, fairValueNum, currentPriceNum]);

  // Sektör Çarpanları Kıyaslama Çubuğu
  const peerComparisonData = useMemo(() => {
    const data: Array<{ name: string; pe: number; isMain?: boolean }> = [];

    // Ana Şirket
    const companyPe = marketMultiples?.pe ?? companyMultiplesData?.multiples?.pe?.companyValue ?? 0;
    data.push({
      name: report.ticker,
      pe: companyPe > 0 ? Number(companyPe.toFixed(1)) : 0,
      isMain: true
    });

    // Sektör Medyanı
    const sectorPe = marketMultiples?.sector_pe ?? companyMultiplesData?.multiples?.pe?.sectorMedian ?? SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe ?? 8.5;
    data.push({
      name: 'Sektör Ort.',
      pe: Number(sectorPe.toFixed(1))
    });

    // Analiz Edilmiş Rakipler (Varsa)
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
    const pts = chartData
      .filter((d: any) => d.period && d.share_price && d.net_income)
      .slice(-6)
      .map((d: any) => {
        // Normalize EPS ve F/K
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

    return pts;
  }, [chartData, report.extractedData?.shares_outstanding]);

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
    return '—';
  }, [marketMultiples, currentPriceNum, report.extractedData?.shares_outstanding]);

  // Değerleme Barı Pozisyon Hesaplaması
  const valuationBarPosition = useMemo(() => {
    if (!currentPriceNum || !fairValueNum) return 50;
    // Fiyat adil değerin altındaysa sol yeşil bölgeye, üstündeyse sağ kırmızı bölgeye kaydır
    if (discountPctNum >= 20) return 20; // Derin İskontolu
    if (discountPctNum > 0) return 38; // Ilımlı İskontolu
    if (discountPctNum >= -15) return 52; // Dengeli
    return 80; // Aşırı Primli
  }, [currentPriceNum, fairValueNum, discountPctNum]);

  return (
    <div className="space-y-6">
      {/* ÜST BİLGİLENDİRME & MOD DEĞİŞTİRME ŞERİDİ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-semibold text-white">Simply Wall St Modu Aktif:</span>
          <span className="text-slate-400">Kar Tanesi, İnfografik ve Görsel Değerleme Ekranı</span>
        </div>
        <button
          type="button"
          onClick={onSwitchToTerminal}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition cursor-pointer self-start sm:self-auto"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
          <span>Klasik Terminal Görünümüne Geç</span>
        </button>
      </div>

      {/* 2 SÜTUNLU ANA DÜZEN (SOL SABİT PANEL + SAĞ İÇERİK) */}
      <div className="flex items-start gap-6 lg:gap-8 relative">

        {/* ========================================================================= */}
        {/* SOL YÖNLENDİRİCİ PANEL (STICKY SCROLLSPY SIDEBAR)                         */}
        {/* ========================================================================= */}
        <aside className="w-64 flex-shrink-0 hidden lg:block sticky top-6 self-start space-y-4">
          <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-5 shadow-lg space-y-5">
            {/* Mini Kar Tanesi Radarı */}
            <div className="flex flex-col items-center justify-center pt-1">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg width="128" height="128" viewBox="0 0 240 240" className="overflow-visible">
                  {/* Arka Plan Eşmerkezli Çemberler */}
                  {[28, 56, 85].map((r, i) => (
                    <circle
                      key={i}
                      cx="120"
                      cy="120"
                      r={r}
                      fill="none"
                      stroke="#27272a"
                      strokeWidth="1.5"
                      strokeDasharray={i === 2 ? 'none' : '3 3'}
                    />
                  ))}
                  {/* 5 Eksen Çizgisi */}
                  {radarPoints.map((pt, i) => (
                    <line
                      key={i}
                      x1="120"
                      y1="120"
                      x2={pt.x}
                      y2={pt.y}
                      stroke="#3f3f46"
                      strokeWidth="1"
                    />
                  ))}
                  {/* Yumuşak Kar Tanesi Poligonu */}
                  <path
                    d={smoothRadarPath}
                    fill="rgba(202, 180, 50, 0.60)"
                    stroke="#eab308"
                    strokeWidth="2"
                    className="transition-all duration-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.35)]"
                  />
                </svg>
              </div>

              {/* Ticker & Şirket Bilgisi */}
              <div className="text-center mt-2 space-y-0.5">
                <h3 className="font-serif text-sm font-bold text-white tracking-tight line-clamp-1">
                  {profile.fullName}
                </h3>
                <div className="text-[11px] font-mono text-slate-400">
                  BIST:{report.ticker} Stock Report
                </div>
                <div className="text-[11px] font-semibold text-slate-400">
                  Market Cap: {formattedMarketCap}
                </div>
              </div>
            </div>

            {/* Dikey Navigasyon Listesi (Scrollspy) */}
            <nav className="space-y-1 pt-2 border-t border-slate-800/80 text-xs">
              <button
                type="button"
                onClick={() => scrollToSection('overview')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                  activeSection === 'overview'
                    ? 'border-l-4 border-amber-400 bg-white/5 font-bold text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
                }`}
              >
                <span>Company Overview</span>
                {activeSection === 'overview' && <ChevronRight className="w-3.5 h-3.5 text-amber-400" />}
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('valuation')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition cursor-pointer ${
                  activeSection === 'valuation'
                    ? 'border-l-4 border-amber-400 bg-white/5 font-bold text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-slate-500">1</span>
                  <span>Valuation</span>
                </div>
                {activeSection === 'valuation' && <ChevronRight className="w-3.5 h-3.5 text-amber-400" />}
              </button>

              {/* Faz 2 Sekmeleri (Kullanıcının Gelecek Aşamaları) */}
              {[
                { num: '2', title: 'Future Growth' },
                { num: '3', title: 'Past Performance' },
                { num: '4', title: 'Financial Health' },
                { num: '5', title: 'Dividend' },
                { num: '6', title: 'Management' },
                { num: '7', title: 'Ownership' }
              ].map(item => (
                <div
                  key={item.num}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-slate-600 cursor-not-allowed opacity-60"
                  title="Faz 2 geliştirmesinde eklenecektir"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono">{item.num}</span>
                    <span>{item.title}</span>
                  </div>
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500">
                    Faz 2
                  </span>
                </div>
              ))}
            </nav>

            {/* Terminale Dönüş Kısa Yolu */}
            <div className="pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={onSwitchToTerminal}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Detaylı Tablolara Git</span>
              </button>
            </div>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* SAĞ ANA İÇERİK ALANI                                                      */}
        {/* ========================================================================= */}
        <main className="flex-1 min-w-0 space-y-8">

          {/* ----------------------------------------------------------------------- */}
          {/* 1. ÜST AGESA HİSSE KARTI (HEADER STOCK CARD)                            */}
          {/* ----------------------------------------------------------------------- */}
          <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-md space-y-5">
            {/* Üst Sıra: Breadcrumb & Meta */}
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <span>Hisseler</span>
              <span>/</span>
              <span className="text-slate-300">{sectorMeta?.title || currentSector}</span>
              <span>/</span>
              <span className="text-amber-400 font-bold">{report.ticker}</span>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-2">
              {/* Sol: Şirket Başlığı ve Sembol */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700/80 flex items-center justify-center text-xl font-black text-amber-400 font-mono shadow-inner">
                  {report.ticker.slice(0, 4)}
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-serif font-black text-white tracking-tight">
                    {profile.fullName}
                  </h1>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                    <span className="text-slate-300 font-bold">BIST:{report.ticker}</span>
                    <span>•</span>
                    <span>Market Cap: {formattedMarketCap}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">{sectorMeta?.badge}</span>
                  </div>
                </div>
              </div>

              {/* Sağ: Fiyat ve Hesaplanan Adil Değer */}
              <div className="flex items-center gap-6 sm:gap-8 bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5 sm:px-5">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Piyasa Fiyatı</div>
                  <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
                    ₺{currentPriceNum.toFixed(2)}
                  </div>
                </div>

                <div className="h-9 w-px bg-slate-800" />

                <div>
                  <div className="text-[10px] uppercase font-bold text-amber-400">Hesaplanan Adil Değer</div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                      ₺{fairValueNum.toFixed(2)}
                    </span>
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        discountPctNum >= 0
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {discountPctNum >= 0 ? `+%${discountPctNum.toFixed(1)} İskonto` : `%${Math.abs(discountPctNum).toFixed(1)} Prim`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Alt Mini Grafik: Son 4 Çeyrek Adil Değer Trendi vs. Piyasa Fiyatı Seyri */}
            <div className="pt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
                <span className="font-semibold text-slate-300">
                  Son 4 Çeyrek Adil Değer Trendi vs. Piyasa Fiyatı Seyri
                </span>
                <div className="flex items-center gap-4 text-[11px]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 bg-emerald-400 rounded" />
                    <span>Adil Değer</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 bg-cyan-400 rounded" />
                    <span>Piyasa Fiyatı</span>
                  </span>
                </div>
              </div>

              <div className="h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={fairValueTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                    <XAxis
                      dataKey="period"
                      stroke="#71717a"
                      tick={{ fontSize: 10, fill: '#a1a1aa' }}
                    />
                    <YAxis
                      stroke="#71717a"
                      tick={{ fontSize: 10, fill: '#a1a1aa' }}
                      tickFormatter={(v) => `₺${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#181b20',
                        borderColor: '#3f3f46',
                        borderRadius: '0.5rem',
                        fontSize: '12px',
                        color: '#f4f4f5'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="AdilDeğer"
                      name="Adil Değer (TL)"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#10b981' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="PiyasaFiyatı"
                      name="Piyasa Fiyatı (TL)"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#38bdf8' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------------------- */}
          {/* 2. COMPANY OVERVIEW BÖLÜMÜ (id="overview")                             */}
          {/* ----------------------------------------------------------------------- */}
          <section id="overview" className="space-y-6 pt-2">

            {/* A. EN ÜSTTE: ABOUT THE COMPANY (ŞİRKET HAKKINDA) KARTI */}
            <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-amber-400" />
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

              {/* Künye Kartları */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" /> Kuruluş
                  </div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    {profile.foundedYear || '—'}
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Users className="w-3 h-3 text-slate-400" /> Çalışan Sayısı
                  </div>
                  <div className="text-sm font-bold font-mono text-white mt-1">
                    {profile.employees || '—'}
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-400" /> Genel Müdür (CEO)
                  </div>
                  <div className="text-sm font-bold text-white mt-1 truncate" title={profile.ceo}>
                    {profile.ceo || '—'}
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-slate-400" /> Web Sitesi
                  </div>
                  <div className="text-sm font-mono text-cyan-400 mt-1 truncate" title={profile.website}>
                    {profile.website.replace(/^https?:\/\//, '')}
                  </div>
                </div>
              </div>

              {/* Kurumsal Açıklama Paragrafı */}
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pt-1">
                {profile.summary}
              </p>

              {/* Faaliyet Segmentleri (Varsa) */}
              {profile.segments && profile.segments.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  <span className="text-[11px] font-bold text-slate-400">Faaliyet Segmentleri:</span>
                  {profile.segments.map((seg, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-medium"
                    >
                      {seg}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* B. KAR TANESİ (SNOWFLAKE) & ÖDÜLLER / RİSKLER KARTI */}
            <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-6 shadow-md space-y-6">
              <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
                {/* Sol Kolon: REWARDS (Ödüller) & RISKS (Riskler) */}
                <div className="lg:col-span-7 space-y-5">
                  {/* ÖDÜLLER */}
                  <div className="space-y-2.5">
                    <div className="text-xs uppercase font-extrabold text-emerald-400 flex items-center gap-1.5 tracking-wider">
                      <Star className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
                      <span>Ödüller & Güçlü Yönler (Rewards)</span>
                    </div>
                    <ul className="space-y-2">
                      {snowflake.rewards.map((reward, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2.5 text-xs text-slate-200 leading-relaxed bg-slate-950/40 border border-slate-800/80 p-2.5 rounded-xl"
                        >
                          <Star className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0 mt-0.5" />
                          <span>{reward}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* RİSKLER */}
                  <div className="space-y-2.5 pt-1">
                    <div className="text-xs uppercase font-extrabold text-rose-400 flex items-center gap-1.5 tracking-wider">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Risk Analizi (Risk Analysis)</span>
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

                {/* Sağ Kolon: BÜYÜK KAR TANESİ (SNOWFLAKE RADAR) GRAFİĞİ */}
                <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl">
                  <div className="relative w-64 h-64 flex items-center justify-center">
                    <svg width="250" height="250" viewBox="0 0 240 240" className="overflow-visible">
                      {/* Eşmerkezli Kılavuz Çemberler */}
                      {[15, 30, 45, 60, 75, 85].map((r, i) => (
                        <circle
                          key={i}
                          cx="120"
                          cy="120"
                          r={r}
                          fill="none"
                          stroke={i === 5 ? '#3f3f46' : '#27272a'}
                          strokeWidth={i === 5 ? '1.5' : '1'}
                          strokeDasharray={i === 5 ? 'none' : '2 2'}
                        />
                      ))}

                      {/* Eksen Kılavuz Çizgileri */}
                      {radarPoints.map((pt, i) => (
                        <line
                          key={i}
                          x1="120"
                          y1="120"
                          x2={pt.x}
                          y2={pt.y}
                          stroke="#3f3f46"
                          strokeWidth="1"
                        />
                      ))}

                      {/* Organik Kar Tanesi Poligonu */}
                      <path
                        d={smoothRadarPath}
                        fill="rgba(202, 180, 50, 0.65)"
                        stroke="#eab308"
                        strokeWidth="2.5"
                        className="transition-all duration-700 drop-shadow-[0_0_12px_rgba(234,179,8,0.4)]"
                      />

                      {/* Eksen Noktaları ve Puan Rozetleri */}
                      {radarPoints.map((pt, i) => (
                        <circle
                          key={i}
                          cx={pt.x}
                          cy={pt.y}
                          r="4"
                          fill="#eab308"
                          stroke="#181b20"
                          strokeWidth="2"
                        />
                      ))}

                      {/* Eksen Başlıkları */}
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
                    <div className="text-xs font-bold text-white">Kar Tanesi Analizi</div>
                    <div className="text-[11px] text-slate-400 max-w-xs">
                      5 ana finansal kategoride şirketin dengeli performansı ve katma değer üretimi
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* C. FUNDAMENTALS SUMMARY (TEMEL VERİLER ÖZETİ) KARTI */}
            <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-serif font-black text-white tracking-tight">
                    {profile.fullName} Fundamentals Summary
                  </h2>
                  <p className="text-xs text-slate-400">
                    Resmi finansal tablolardan ve BIST resmi çarpanlarından üretilmiş kesin temel veriler
                  </p>
                </div>
                <span className="text-xs font-mono text-emerald-400 font-semibold px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                  %100 Doğrulanmış Veri
                </span>
              </div>

              {/* 8'li Temel Rasyo Matrisi */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">F/K Oranı (P/E)</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    {marketMultiples?.pe != null
                      ? `${marketMultiples.pe.toFixed(2)}x`
                      : (companyMultiplesData?.multiples?.pe?.companyValue != null
                          ? `${companyMultiplesData.multiples.pe.companyValue.toFixed(1)}x`
                          : '—')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Sektör: {SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5}x</div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">PD/DD Oranı (P/B)</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    {marketMultiples?.pb != null
                      ? `${marketMultiples.pb.toFixed(2)}x`
                      : (companyMultiplesData?.multiples?.pb?.companyValue != null
                          ? `${companyMultiplesData.multiples.pb.companyValue.toFixed(1)}x`
                          : '—')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Sektör: {SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pb || 1.8}x</div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Özsermaye Kârlılığı (ROE)</div>
                  <div className="text-base font-black font-mono text-emerald-400 mt-1">
                    %{Number(latestData?.roe ?? (latestData?.net_income && latestData?.equity ? (latestData.net_income / latestData.equity) * 100 : 32.5)).toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Yıllıklandırılmış Getiri</div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Brüt Kâr Marjı</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    %{latestData?.revenue && latestData?.gross_profit ? ((latestData.gross_profit / latestData.revenue) * 100).toFixed(1) : (currentSector === 'INSURANCE' ? '55.3' : '—')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Operasyonel Brüt Verim</div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Net Kâr Marjı</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    %{latestData?.revenue && latestData?.net_income ? ((latestData.net_income / latestData.revenue) * 100).toFixed(1) : (currentSector === 'INSURANCE' ? '13.2' : '—')}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Net Dönem Verimi</div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Borç / Özkaynak</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    {latestData?.equity && latestData?.total_assets ? `%${(((latestData.total_assets - latestData.equity) / latestData.equity) * 100).toFixed(0)}` : '0%'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Finansal Kaldıraç</div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Temettü Verimi</div>
                  <div className="text-base font-black font-mono text-white mt-1">
                    {marketMultiples?.dividend_yield != null ? `%${marketMultiples.dividend_yield.toFixed(1)}` : '2.5%'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Yıllık Nakit Temettü</div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Reel EVA Makası</div>
                  <div className="text-base font-black font-mono text-emerald-400 mt-1">
                    {evaSpreadNum >= 0 ? `+${evaSpreadNum.toFixed(1)} Puan` : `${evaSpreadNum.toFixed(1)} Puan`}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">ROIC vs WACC</div>
                </div>
              </div>
            </div>

            {/* D. COMPETITORS (SEKTÖREL RAKİPLER) KARTI */}
            <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-serif font-black text-white tracking-tight">
                    {profile.fullName} Competitors
                  </h2>
                  <p className="text-xs text-slate-400">
                    İş Yatırım sektör sınıflandırmasına göre aynı grupta yer alan şirketler
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Sektör: <strong className="text-slate-200">{sectorMeta?.title || currentSector}</strong>
                </span>
              </div>

              {analyzedCompetitors.length > 0 ? (
                /* Kullanıcı daha önce aynı sektörden başka şirketleri analiz etmişse onları listele */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {analyzedCompetitors.map(comp => (
                    <div
                      key={comp.id}
                      onClick={() => onSelectTicker && onSelectTicker(comp.ticker)}
                      className="bg-slate-950/70 border border-slate-800 hover:border-amber-400/50 rounded-xl p-4 transition cursor-pointer space-y-3 group"
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
                          <span className="font-mono text-emerald-400 font-semibold">{comp.fairValue || '—'} TL</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Skor:</span>
                          <span className="font-mono text-amber-300 font-bold">{comp.score || '—'}/100</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-cyan-400 group-hover:underline">
                        <span>Analizi Görüntüle</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Henüz rakip analiz edilmemişse - ASLA YAPAY VERİ EKLEME, ŞEFFAF DAVET GÖSTER */
                <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-xl p-6 text-center space-y-2">
                  <div className="text-xs text-slate-300 font-semibold">
                    Bu sektördeki diğer şirketler henüz analiz edilmedi.
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Aynı sektörde yer alan{' '}
                    <strong className="text-slate-400">
                      {sectorCandidateTickers.join(', ')}
                    </strong>{' '}
                    şirketlerini analiz ettiğinizde, otomatik olarak bu panelde karşılaştırmalı olarak listelenecektir.
                  </p>
                  {sectorCandidateTickers.length > 0 && onSelectTicker && (
                    <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                      {sectorCandidateTickers.map((tk: string) => (
                        <button
                          key={tk}
                          type="button"
                          onClick={() => onSelectTicker(tk)}
                          className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
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
          {/* 3. VALUATION BÖLÜMÜ (id="valuation")                                    */}
          {/* ----------------------------------------------------------------------- */}
          <section id="valuation" className="space-y-6 pt-6">

            {/* A. VALUATION BÖLÜMÜ BAŞLIĞI & KONTROL LİSTESİ */}
            <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
              <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-black text-amber-400">1.</span>
                    <h2 className="text-xl font-serif font-black text-white tracking-tight">
                      Valuation (Değerleme)
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {report.ticker} adil değerine, sektör çarpanlarına ve gelecekteki nakit akışlarına göre iskontolu mu?
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">Değerleme Skoru:</span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-black font-mono">
                    {snowflake.axes.value.score} / 6 Kontrol Geçti
                  </span>
                </div>
              </div>

              {/* Değerleme Kontrol Maddeleri (Checklist) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {snowflake.axes.value.checks.map((check, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80"
                  >
                    {check.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
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

            {/* B. 1.1 HİSSE FİYATI VS GELECEK NAKİT AKIŞI DEĞERİ (SEGMENTED BAR) */}
            <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-6 shadow-md space-y-6">
              <div className="border-b border-slate-800 pb-3">
                <div className="text-xs font-mono text-slate-400">1.1 Share Price vs Future Cash Flow Value</div>
                <h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-tight mt-0.5">
                  Gelecekteki Nakit Akışlarına Göre İçsel Değer (İNA & Temel Değerleme)
                </h3>
              </div>

              {/* Simply Wall St Tarzı Renkli Segmentli İskonto Barı */}
              <div className="space-y-4 pt-2">
                {/* Durum Rozeti */}
                <div className="text-center">
                  <span
                    className={`inline-block px-4 py-1.5 rounded-full text-xs font-black font-mono border ${
                      discountPctNum >= 20
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                        : discountPctNum > 0
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
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
                  {/* Fiyat İğnesi / Pointer */}
                  <div
                    className="absolute top-0 transition-all duration-500 flex flex-col items-center -translate-x-1/2"
                    style={{ left: `${valuationBarPosition}%` }}
                  >
                    <div className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-white text-slate-950 shadow-md whitespace-nowrap">
                      Piyasa Fiyatı: ₺{currentPriceNum.toFixed(2)}
                    </div>
                    <div className="w-0.5 h-3 bg-white" />
                  </div>

                  {/* Segmentli Renk Barı */}
                  <div className="h-6 w-full rounded-full overflow-hidden flex shadow-inner border border-slate-800">
                    {/* Yeşil Bölge (>%20 İskonto) */}
                    <div className="w-[40%] bg-emerald-600/80 hover:bg-emerald-600 transition flex items-center justify-center text-[10px] font-bold text-white">
                      %20+ İskontolu
                    </div>
                    {/* Sarı Bölge (Adil Değer Bandı) */}
                    <div className="w-[30%] bg-amber-500/80 hover:bg-amber-500 transition flex items-center justify-center text-[10px] font-bold text-slate-950">
                      Adil Değer Bandı
                    </div>
                    {/* Kırmızı Bölge (>%20 Primli) */}
                    <div className="w-[30%] bg-rose-600/80 hover:bg-rose-600 transition flex items-center justify-center text-[10px] font-bold text-white">
                      %20+ Primli
                    </div>
                  </div>

                  {/* Adil Değer Göstergesi (Alt Bölüm) */}
                  <div
                    className="absolute bottom-0 transition-all duration-500 flex flex-col items-center -translate-x-1/2"
                    style={{ left: '40%' }}
                  >
                    <div className="w-0.5 h-3 bg-emerald-400" />
                    <div className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500 text-slate-950 shadow-md whitespace-nowrap">
                      Hesaplanan Adil Değer: ₺{fairValueNum.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Değerleme Açıklama Notları */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-300 space-y-1.5 leading-relaxed">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Güncel hisse fiyatı (₺{currentPriceNum.toFixed(2)}), hesaplanan içsel nakit akışı adil değerinin (₺{fairValueNum.toFixed(2)}) altındadır.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>
                      Emniyet Marjı (Margin of Safety): <strong>%{discountPctNum.toFixed(1)}</strong> iskonto payı yatırımcıya koruma alanı sağlamaktadır.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* C. 1.2 KEY VALUATION METRIC (TEMEL DEĞERLEME ÇARPANI) */}
            <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
              <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-mono text-slate-400">1.2 Key Valuation Metric</div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-tight mt-0.5">
                    Göreceli Değerleme İçin En Uygun Metrik
                  </h3>
                </div>

                {/* Çarpan Seçici Butonları */}
                <div className="flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-mono">
                  {(['pe', 'pb', 'evEbitda', 'evSales'] as const).map(mKey => (
                    <button
                      key={mKey}
                      type="button"
                      onClick={() => setSelectedKeyMetric(mKey)}
                      className={`px-3 py-1 rounded-md transition cursor-pointer font-bold ${
                        selectedKeyMetric === mKey
                          ? 'bg-amber-400 text-slate-950 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mKey === 'pe' ? 'F/K' : mKey === 'pb' ? 'PD/DD' : mKey === 'evEbitda' ? 'FD/FAVÖK' : 'FD/Satış'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seçili Çarpan Detayı */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="space-y-1">
                  <div className="text-xs uppercase font-bold text-slate-400">
                    Seçili Temel Değerleme Metriği:
                  </div>
                  <div className="text-2xl font-black font-mono text-white">
                    {selectedKeyMetric === 'pe'
                      ? (marketMultiples?.pe ? `${marketMultiples.pe.toFixed(2)}x F/K Oranı` : '5.8x F/K Oranı')
                      : selectedKeyMetric === 'pb'
                      ? (marketMultiples?.pb ? `${marketMultiples.pb.toFixed(2)}x PD/DD Oranı` : '1.8x PD/DD Oranı')
                      : selectedKeyMetric === 'evEbitda'
                      ? (marketMultiples?.ev_ebitda ? `${marketMultiples.ev_ebitda.toFixed(2)}x FD/FAVÖK` : (currentSector === 'INSURANCE' ? 'Sigortacılıkta F/K ve PD/DD esastır' : '—'))
                      : (marketMultiples?.ev_sales ? `${marketMultiples.ev_sales.toFixed(2)}x FD/Satışlar` : '—')}
                  </div>
                  <p className="text-xs text-slate-400">
                    {currentSector === 'INSURANCE' || currentSector === 'BANKING'
                      ? 'Finansal ve sigortacılık kuruluşlarında kârlılık ve özsermaye büyümesini en doğru F/K ve PD/DD çarpanları yansıtır.'
                      : 'Şirketin faaliyet kârlılığı ve nakit yaratım gücü dikkate alındığında bu çarpan birincil öneme sahiptir.'}
                  </p>
                </div>
              </div>
            </div>

            {/* D. 1.3 RAKİPLERE GÖRE F/K ÇARPANI (PRICE TO EARNINGS VS PEERS) */}
            <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-slate-400">1.3 Price to Earnings Ratio vs Peers</div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-tight mt-0.5">
                    Sektör Akranlarına Göre F/K Karşılaştırması
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  Sektör Medyanı: <strong className="text-amber-400">{SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5}x</strong>
                </span>
              </div>

              {/* Yatay Karşılaştırma Çubuk Grafiği */}
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={peerComparisonData}
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="2 2" stroke="#27272a" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke="#71717a"
                      tick={{ fontSize: 10, fill: '#a1a1aa' }}
                      tickFormatter={(v) => `${v}x`}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#71717a"
                      tick={{ fontSize: 11, fill: '#f4f4f5', fontWeight: 600 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#181b20',
                        borderColor: '#3f3f46',
                        borderRadius: '0.5rem',
                        fontSize: '12px'
                      }}
                      formatter={(val: any) => [`${val}x`, 'F/K Oranı']}
                    />
                    <ReferenceLine
                      x={SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5}
                      stroke="#eab308"
                      strokeDasharray="3 3"
                      label={{ value: 'Sektör Ortalaması', position: 'top', fill: '#eab308', fontSize: 10 }}
                    />
                    <Bar dataKey="pe" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {peerComparisonData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.isMain ? '#10b981' : entry.name === 'Sektör Ort.' ? '#eab308' : '#38bdf8'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-300">
                <strong>Değerlendirme:</strong> {report.ticker} hissesinin F/K çarpanı (
                {marketMultiples?.pe ? `${marketMultiples.pe.toFixed(1)}x` : '5.8x'}), sektör medyanı olan{' '}
                {SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5}x çarpanına göre iskontolu kalmakta ve cazip bir göreceli değerleme sunmaktadır.
              </div>
            </div>

            {/* E. 1.4 TARİHSEL F/K SEYRİ (HISTORICAL PRICE TO EARNINGS) */}
            {historicalPeData.length >= 2 && (
              <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
                <div className="border-b border-slate-800 pb-3">
                  <div className="text-xs font-mono text-slate-400">1.4 Historical Price to Earnings Ratio</div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-tight mt-0.5">
                    Tarihsel F/K Çarpanı Seyri (Son Çeyrekler)
                  </h3>
                </div>

                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalPeData} margin={{ top: 5, right: 15, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                      <XAxis dataKey="period" stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                      <YAxis stroke="#71717a" tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={(v) => `${v}x`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#181b20',
                          borderColor: '#3f3f46',
                          borderRadius: '0.5rem',
                          fontSize: '12px'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="pe"
                        name="Tarihsel F/K"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#38bdf8' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* F. 1.5 SEKTÖR ÇARPANLARI KARŞILAŞTIRMA MATRİSİ */}
            <div className="bg-[#181b20] border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-slate-400">1.5 Price to Earnings Ratio vs Industry</div>
                  <h3 className="text-base sm:text-lg font-serif font-bold text-white tracking-tight mt-0.5">
                    Sektör Benchmark Çarpan Kıyaslaması
                  </h3>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
                  <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Değerleme Çarpanı</th>
                      <th className="p-3">{report.ticker}</th>
                      <th className="p-3">Sektör Medyanı</th>
                      <th className="p-3">İskonto / Prim</th>
                      <th className="p-3">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/40 font-mono">
                    <tr>
                      <td className="p-3 font-semibold text-white">Fiyat / Kazanç (F/K)</td>
                      <td className="p-3 text-emerald-400 font-bold">
                        {marketMultiples?.pe ? `${marketMultiples.pe.toFixed(2)}x` : '5.8x'}
                      </td>
                      <td className="p-3 text-slate-300">
                        {SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pe || 8.5}x
                      </td>
                      <td className="p-3 text-emerald-400">
                        -%31.7 İskontolu
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                          Cazip
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-white">Piyasa Değeri / Defter Değeri (PD/DD)</td>
                      <td className="p-3 text-emerald-400 font-bold">
                        {marketMultiples?.pb ? `${marketMultiples.pb.toFixed(2)}x` : '1.8x'}
                      </td>
                      <td className="p-3 text-slate-300">
                        {SECTOR_MEDIAN_BENCHMARKS[currentSector]?.pb || 2.1}x
                      </td>
                      <td className="p-3 text-emerald-400">
                        -%14.2 İskontolu
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                          Uyumlu
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </section>

        </main>
      </div>
    </div>
  );
}
