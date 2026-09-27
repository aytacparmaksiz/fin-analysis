'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Send, FileText, AlertTriangle, Database, 
  RefreshCw, Printer, PlusCircle, History, 
  ChevronRight, UploadCloud, X, CheckCircle2, Search,
  TrendingUp, BarChart3, Target, Calendar, ArrowUpRight, ArrowDownRight, Minus,
  DollarSign, ShieldCheck, Activity, Layers, Sparkles
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
  AreaChart,
  Area,
  ReferenceLine
} from 'recharts';

interface SavedReport {
  id: string;
  ticker: string;
  price: string;
  createdAt: string;
  period?: string;
  report: string;
  decision: 'AL' | 'ALMA' | 'NÖTR';
  score?: string;
  extractedData?: any;
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

// Finansal Sayı Formatlayıcı
function formatFinancial(val: number | null | undefined, unit = '') {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return `${val.toLocaleString('tr-TR')}${unit ? ' ' + unit : ''}`;
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
    // Marjlar için doğrudan puan farkı (Örn: %25.4 - %21.2 = +4.2 puan)
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
    // Parasal değerler için yüzde büyüme: ((C - P) / |P|) * 100
    const pct = Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
    return {
      value: pct,
      text: pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`,
      isPositive: pct > 0,
      isNegative: pct < 0,
      isZero: pct === 0,
      isPoint: false
    };
  }
}

// Değişim Rozeti (YoY Change Badge)
// invert=true: Net Borç ve Maliyetlerde artış kötüdür (kırmızı), azalış iyidir (yeşil)
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
      <span className="inline-flex items-center text-[10px] font-mono text-slate-500 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
        Baz Yıl
      </span>
    );
  }

  if (change.isZero) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-medium text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
        ― %0.0
      </span>
    );
  }

  const isGood = invert ? change.isNegative : change.isPositive;

  const colorClass = isGood
    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80 shadow-sm shadow-emerald-950/40'
    : 'bg-rose-950/80 text-rose-400 border-rose-800/80 shadow-sm shadow-rose-950/40';

  const Icon = change.isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono font-bold px-1.5 py-0.5 rounded border ${colorClass} ${
        size === 'xs' ? 'text-[10px]' : 'text-[11px]'
      }`}
    >
      <Icon className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {change.text}
    </span>
  );
}

// Recharts İçin Yüksek Okunabilirlikli Özel Tooltip
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
                    : entry.value.toLocaleString('tr-TR')
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

// Fintables Tablo Konfigürasyonu
interface MetricRowConfig {
  label: string;
  sublabel: string;
  key: string;
  isMargin?: boolean;
  prefix?: string;
  suffix?: string;
  invert?: boolean;
  colorClass?: string;
  customCalc?: (d: any) => number | null;
}

interface MetricSectionConfig {
  title: string;
  icon: any;
  color: string;
  rows: MetricRowConfig[];
}

const FINTABLES_SECTIONS: MetricSectionConfig[] = [
  {
    title: '1. Gelir Tablosu & Büyüme Dinamikleri',
    icon: TrendingUp,
    color: 'text-emerald-400',
    rows: [
      {
        label: 'Satış Gelirleri (Hasılat)',
        sublabel: 'Net Satışlar / Toplam Gelir',
        key: 'revenue',
        colorClass: 'text-emerald-400',
      },
      {
        label: 'FAVÖK (EBITDA)',
        sublabel: 'Faiz, Amortisman ve Vergi Öncesi Faaliyet Kârı',
        key: 'ebitda',
        colorClass: 'text-cyan-400',
      },
      {
        label: 'Net Dönem Kârı',
        sublabel: 'Ana Ortaklık Payları Net Kârı',
        key: 'net_income',
        colorClass: 'text-blue-400',
      },
    ],
  },
  {
    title: '2. Kârlılık Marjları (%)',
    icon: BarChart3,
    color: 'text-cyan-400',
    rows: [
      {
        label: 'Brüt Kâr Marjı',
        sublabel: 'Brüt Kâr / Hasılat',
        key: 'gross_margin',
        isMargin: true,
        prefix: '%',
        colorClass: 'text-amber-300',
      },
      {
        label: 'FAVÖK Marjı',
        sublabel: 'FAVÖK / Hasılat',
        key: 'ebitda_margin',
        isMargin: true,
        prefix: '%',
        colorClass: 'text-cyan-300',
      },
      {
        label: 'Net Kâr Marjı',
        sublabel: 'Net Kâr / Hasılat',
        key: 'net_margin',
        isMargin: true,
        prefix: '%',
        colorClass: 'text-purple-300',
      },
    ],
  },
  {
    title: '3. Nakit Akışı & Yatırımlar',
    icon: DollarSign,
    color: 'text-sky-400',
    rows: [
      {
        label: 'İşletme Nakit Akışı (OCF)',
        sublabel: 'Esas Faaliyetlerden Elde Edilen Gerçek Nakit',
        key: 'operating_cash_flow',
        colorClass: 'text-sky-300',
      },
      {
        label: 'Yatırım Harcamaları (CAPEX)',
        sublabel: 'Maddi & Gayrimaddi Duran Varlık Alımları',
        key: 'capex',
        colorClass: 'text-amber-300',
      },
      {
        label: 'Serbest Nakit Akışı (FCF)',
        sublabel: 'İşletme Nakit Akışı - Yatırım Harcamaları',
        key: 'free_cash_flow',
        colorClass: 'text-emerald-400',
      },
    ],
  },
  {
    title: '4. Bilanço & Borçluluk Seviyesi',
    icon: ShieldCheck,
    color: 'text-rose-400',
    rows: [
      {
        label: 'Net Finansal Borç',
        sublabel: 'Finansal Borçlar - Nakit ve Nakit Benzerleri',
        key: 'net_debt',
        invert: true,
        colorClass: 'text-rose-400',
      },
      {
        label: 'Toplam Özkaynaklar',
        sublabel: 'Ana Ortaklığa Ait Özkaynak Büyüklüğü',
        key: 'equity',
        colorClass: 'text-indigo-300',
      },
    ],
  },
  {
    title: '5. Sermaye Verimliliği & Değer Yaratımı',
    icon: Target,
    color: 'text-purple-400',
    rows: [
      {
        label: 'ROIC (Yatırılan Sermaye Getirisi)',
        sublabel: 'NOPAT / Yatırılan Sermaye',
        key: 'roic',
        isMargin: true,
        prefix: '%',
        colorClass: 'text-emerald-400',
      },
      {
        label: 'WACC (Ağırlıklı Sermaye Maliyeti)',
        sublabel: 'Özsermaye ve Borçlanma Maliyet Bileşimi',
        key: 'wacc',
        isMargin: true,
        prefix: '%',
        invert: true,
        colorClass: 'text-rose-400',
      },
      {
        label: 'Ekonomik Katma Değer Makası (EVA Spread)',
        sublabel: 'ROIC - WACC (Pozitif = Hissedara Değer Yaratımı)',
        key: 'eva_spread',
        isMargin: true,
        prefix: '',
        suffix: ' puan',
        colorClass: 'text-emerald-300',
        customCalc: (d: any) => {
          if (d.roic !== undefined && d.wacc !== undefined && d.roic !== null && d.wacc !== null) {
            return Number((d.roic - d.wacc).toFixed(1));
          }
          return null;
        },
      },
    ],
  },
];

export default function ValuationTerminal() {
  const [mounted, setMounted] = useState(false);
  const [ticker, setTicker] = useState('');
  const [price, setPrice] = useState('');
  const [consensus, setConsensus] = useState('');
  const [peerMultiples, setPeerMultiples] = useState('');

  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // İşlem Aşamaları: 'input' -> 'review' -> 'report'
  const [step, setStep] = useState<'input' | 'review' | 'report'>('input');
  const [extractedData, setExtractedData] = useState<any>(null);

  // Rapor Sekmeleri: 'overview' | 'report' | 'tables' | 'guidance' | 'history'
  const [activeTab, setActiveTab] = useState<'overview' | 'report' | 'tables' | 'guidance' | 'history'>('overview');

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Arşiv
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem('fin_valuation_reports');
      if (stored) setSavedReports(JSON.parse(stored));
    } catch (e) {}
  }, []);

  const saveReport = (newReport: SavedReport) => {
    const updated = [newReport, ...savedReports.filter(r => r.id !== newReport.id)];
    setSavedReports(updated);
    localStorage.setItem('fin_valuation_reports', JSON.stringify(updated));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  // Aşama 1: PDF'ten Çok Yıllı Zaman Serisi ve Rehberlik Çıkarımı
  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Lütfen en az bir PDF dokümanı ekleyin (Örn: 2022-2026 raporları).');
      return;
    }
    setLoading(true);
    setError(null);
    setStatusMessage('Çok yıllık PDF belgeleri taranıyor ve 5+ yıllık finansal zaman serisi ayıklanıyor...');

    try {
      const fd = new FormData();
      fd.append('ticker', ticker);
      files.forEach(f => fd.append('files', f));

      const res = await fetch('/api/extract', {
        method: 'POST',
        body: fd
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Veri çıkarımı başarısız oldu.');

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
    setStatusMessage('ROIC vs WACC, DuPont, Owner\'s Earnings ve geçmiş çeyrek tez karşılaştırması çalıştırılıyor...');

    const normalizedTicker = ticker.toUpperCase().trim();
    const previousReportsForTicker = savedReports.filter(r => r.ticker === normalizedTicker);
    const previousReport = previousReportsForTicker.length > 0 ? previousReportsForTicker[0] : null;

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: normalizedTicker,
          price,
          consensus,
          peerMultiples,
          extractedData,
          previousReport: previousReport ? {
            createdAt: previousReport.createdAt,
            decision: previousReport.decision,
            score: previousReport.score,
            price: previousReport.price
          } : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Değerleme tamamlanamadı.');

      const isAlma = data.report.includes('Analist Kararı: ALMA') || data.report.includes('ALMA');
      const isAl = !isAlma && (data.report.includes('Analist Kararı: AL') || data.report.includes('AL'));
      const decision: 'AL' | 'ALMA' | 'NÖTR' = isAlma ? 'ALMA' : (isAl ? 'AL' : 'NÖTR');

      const scoreMatch = data.report.match(/Toplam Puan:\s*\*?\*?(\d+)\s*\/\s*100/i) || data.report.match(/\|\s*\*\*Toplam Puan\*\*\s*\|\s*\*\*(\d+)\*\*/i);
      const score = scoreMatch ? scoreMatch[1] : undefined;

      const newEntry: SavedReport = {
        id: Date.now().toString(),
        ticker: normalizedTicker,
        price,
        period: extractedData?.reporting_period,
        createdAt: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        report: data.report,
        decision,
        score,
        extractedData
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

  const activeReport = savedReports.find(r => r.id === activeReportId);
  const currentExtractedData = activeReport?.extractedData || extractedData;

  // Aktif hissenin tüm geçmiş çeyrek analizleri (Skor Takibi)
  const tickerHistory = activeReport 
    ? savedReports.filter(r => r.ticker === activeReport.ticker).reverse()
    : [];

  // Zaman Serisi Grafik Verisi
  const chartData = currentExtractedData?.financial_history || [];

  // Son Dönem ve Önceki Dönem Verileri
  const latestData = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const prevData = chartData.length > 1 ? chartData[chartData.length - 2] : null;

  // Önemli Değişim Hesaplamaları (Grafik ve Tablo Başlıkları İçin)
  const latestRevChange = calculateYoYChange(latestData?.revenue, prevData?.revenue);
  const latestEbitdaChange = calculateYoYChange(latestData?.ebitda, prevData?.ebitda);
  const latestNetChange = calculateYoYChange(latestData?.net_income, prevData?.net_income);
  const latestGrossMarginChange = calculateYoYChange(latestData?.gross_margin, prevData?.gross_margin, true);
  const latestEbitdaMarginChange = calculateYoYChange(latestData?.ebitda_margin, prevData?.ebitda_margin, true);
  const latestNetMarginChange = calculateYoYChange(latestData?.net_margin, prevData?.net_margin, true);
  const latestOcfChange = calculateYoYChange(latestData?.operating_cash_flow, prevData?.operating_cash_flow);
  const latestFcfChange = calculateYoYChange(latestData?.free_cash_flow, prevData?.free_cash_flow);
  const latestDebtChange = calculateYoYChange(latestData?.net_debt, prevData?.net_debt);

  // Ekonomik Değer Makası (ROIC - WACC)
  const latestSpread = (latestData?.roic !== undefined && latestData?.wacc !== undefined && latestData.roic !== null && latestData.wacc !== null)
    ? Number((latestData.roic - latestData.wacc).toFixed(1))
    : null;

  // OCF / Net Kâr Oranı
  const ocfRatio = (latestData?.operating_cash_flow && latestData?.net_income && latestData.net_income > 0)
    ? (latestData.operating_cash_flow / latestData.net_income).toFixed(2)
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans">
      
      {/* Sol Sidebar: Arşiv & Skor Takibi */}
      <aside className="w-full md:w-80 border-r border-slate-800 bg-slate-900/60 flex flex-col flex-shrink-0 print:hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm tracking-wide text-white">DEĞERLEME ARŞİVİ</span>
          </div>
          <button
            onClick={() => { setStep('input'); setActiveReportId(null); setExtractedData(null); }}
            className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-1.5 px-2.5 rounded transition cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Yeni Analiz
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {savedReports.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Henüz kayıtlı rapor yok.
            </div>
          ) : (
            savedReports.map(item => (
              <div
                key={item.id}
                onClick={() => { setActiveReportId(item.id); setStep('report'); }}
                className={`p-3 rounded-lg border cursor-pointer transition flex items-center justify-between group ${
                  activeReportId === item.id && step === 'report'
                    ? 'bg-slate-800 border-emerald-500/50 shadow-md shadow-emerald-950/20'
                    : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/60'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{item.ticker}</span>
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
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Sağ Ana Bölüm */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="border-b border-slate-800 p-4 flex items-center justify-between bg-slate-900/40 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <BarChart3 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Fintables Tarzı Kurumsal Temel Değerleme Terminali
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded">v2.0 PRO</span>
              </h1>
              <p className="text-xs text-slate-400">Çok yıllık finansal göstergeler, dinamik artış/azalış yüzdeleri, rehberlik karnesi ve çeyreklik skor takibi.</p>
            </div>
          </div>

          {step === 'report' && activeReport && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-3 rounded border border-slate-700 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> PDF / Yazdır
              </button>
              <button
                onClick={() => setStep('input')}
                className="text-xs text-slate-400 hover:text-white px-2 transition cursor-pointer"
              >
                Yeni Giriş
              </button>
            </div>
          )}
        </header>

        <div className="p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          
          {/* ADIM 1: GİRİŞ FORMU VE ÇOKLU PDF YÜKLEME */}
          {step === 'input' && (
            <form onSubmit={handleExtract} className="space-y-6 bg-slate-900/60 border border-slate-800 p-6 md:p-8 rounded-xl shadow-xl">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <span className="font-bold text-sm text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" /> 1. Aşama: Çok Yıllı Doküman Yükleme (2022-2026)
                </span>
                <span className="text-xs text-emerald-400 font-mono bg-emerald-950/80 border border-emerald-800 px-2.5 py-0.5 rounded">
                  Mod: Çok Dönemli Zaman Serisi
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Hisse Kodu</label>
                  <input
                    type="text"
                    value={ticker}
                    onChange={e => setTicker(e.target.value)}
                    required
                    placeholder="Örn: THYAO, FROTO"
                    className="w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-md p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none uppercase font-bold tracking-wider"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Güncel Fiyat (TL)</label>
                  <input
                    type="text"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-md p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Konsensüs Hedef (Ops.)</label>
                  <input
                    type="text"
                    value={consensus}
                    onChange={e => setConsensus(e.target.value)}
                    placeholder="Örn: 420 TL, Al Tavsiyesi"
                    className="w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-md p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Sektör Çarpanı (Ops.)</label>
                  <input
                    type="text"
                    value={peerMultiples}
                    onChange={e => setPeerMultiples(e.target.value)}
                    placeholder="Örn: Sektör F/K: 7.2"
                    className="w-full mt-1.5 bg-slate-950 border border-slate-700 rounded-md p-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Çoklu PDF Yükleme Alanı */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-emerald-500 bg-slate-950/40 p-8 rounded-lg text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 group"
              >
                <UploadCloud className="w-10 h-10 text-emerald-400 group-hover:scale-110 transition-transform" />
                <div>
                  <span className="text-sm font-semibold text-white">2022-2026 Faaliyet Raporları ve Finansal Tabloları Ekleyin</span>
                  <p className="text-xs text-slate-400 mt-1">İstediğiniz kadar döneme ait PDF yükleyebilirsiniz. Model tüm yılları kronolojik sıraya koyup trendleri yakalar.</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300">Yüklenecek Belgeler ({files.length} Adet):</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-md text-xs">
                        <span className="truncate text-slate-200 font-mono">{f.name}</span>
                        <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-rose-400 cursor-pointer">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold rounded-md transition flex items-center justify-center gap-2 text-sm shadow-lg cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> {statusMessage}
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" /> Çok Yıllı Belgeleri Tara ve Zaman Serisini Çıkar (Aşama 1)
                  </>
                )}
              </button>
            </form>
          )}

          {/* ADIM 2: DOĞRULAMA MASASI (HUMAN-IN-THE-LOOP) - OKUNABİLİR VE RENKLENDİRİLMİŞ */}
          {step === 'review' && extractedData && (
            <div className="space-y-6 bg-slate-900/60 border border-slate-800 p-6 md:p-8 rounded-xl shadow-xl">
              <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" /> 2. Aşama: Çok Yıllı Veri Doğrulama Masası
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Model yüklenen PDF'lerden aşağıdaki zaman serisi göstergelerini ve yönetim hedeflerini çıkardı. Artış ve azalış yönlerini inceleyip onaylayabilirsiniz.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-emerald-400">{extractedData.reporting_period}</div>
                  <div className="text-[11px] text-slate-400">Para Birimi: <strong className="text-white">{extractedData.currency || 'Belirtilmedi'}</strong></div>
                </div>
              </div>

              {/* Çıkarılan Zaman Serisi Özeti (Renklendirilmiş & YoY Rozetli) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" /> Çıkarılan Finansal Yıllar ({extractedData.financial_history?.length || 0} Dönem)
                  </span>
                  <span className="text-[11px] text-slate-400">Yeşil rozetler artışı, kırmızı rozetler azalışı simgeler (Borçta ters orantı).</span>
                </div>

                <div className="overflow-x-auto border border-slate-700/80 rounded-lg shadow-sm">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-800 text-slate-100 font-mono">
                      <tr>
                        <th className="p-3">Dönem</th>
                        <th className="p-3 text-right">Satış Gelirleri</th>
                        <th className="p-3 text-right">FAVÖK</th>
                        <th className="p-3 text-right">Net Kâr</th>
                        <th className="p-3 text-right">FAVÖK Marjı (%)</th>
                        <th className="p-3 text-right">ROIC (%)</th>
                        <th className="p-3 text-right">Net Borç</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono">
                      {extractedData.financial_history?.map((row: any, idx: number) => {
                        const prev = idx > 0 ? extractedData.financial_history[idx - 1] : null;
                        const revChg = calculateYoYChange(row.revenue, prev?.revenue);
                        const ebitdaChg = calculateYoYChange(row.ebitda, prev?.ebitda);
                        const netChg = calculateYoYChange(row.net_income, prev?.net_income);
                        const marginChg = calculateYoYChange(row.ebitda_margin, prev?.ebitda_margin, true);
                        const roicChg = calculateYoYChange(row.roic, prev?.roic, true);
                        const debtChg = calculateYoYChange(row.net_debt, prev?.net_debt);

                        return (
                          <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 font-bold text-white font-sans text-sm">{row.period}</td>
                            <td className="p-3 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-emerald-400 font-bold text-sm tracking-tight">{row.revenue?.toLocaleString('tr-TR') || '—'}</span>
                                <ChangeBadge change={revChg} size="xs" />
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-cyan-400 font-bold text-sm tracking-tight">{row.ebitda?.toLocaleString('tr-TR') || '—'}</span>
                                <ChangeBadge change={ebitdaChg} size="xs" />
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-blue-400 font-bold text-sm tracking-tight">{row.net_income?.toLocaleString('tr-TR') || '—'}</span>
                                <ChangeBadge change={netChg} size="xs" />
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-slate-100 font-bold text-sm tracking-tight">%{row.ebitda_margin ?? '—'}</span>
                                <ChangeBadge change={marginChg} size="xs" />
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-amber-300 font-bold text-sm tracking-tight">%{row.roic ?? '—'}</span>
                                <ChangeBadge change={roicChg} size="xs" />
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-rose-400 font-bold text-sm tracking-tight">{row.net_debt?.toLocaleString('tr-TR') || '—'}</span>
                                <ChangeBadge change={debtChg} invert={true} size="xs" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Geçmiş Hedef & Rehberlik Karnesi */}
              {extractedData.guidance_track_record?.length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-emerald-400" /> Yönetim Hedef & Gerçekleşme Karnesi
                  </span>
                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-800 text-slate-200">
                        <tr>
                          <th className="p-3">Dönem</th>
                          <th className="p-3">Verilen Hedef / Rehberlik</th>
                          <th className="p-3">Gerçekleşen</th>
                          <th className="p-3">Durum</th>
                          <th className="p-3">Analiz</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {extractedData.guidance_track_record.map((g: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/40">
                            <td className="p-3 font-bold font-mono text-white">{g.year_or_period}</td>
                            <td className="p-3 text-slate-200">{g.guidance_given}</td>
                            <td className="p-3 font-mono font-bold text-emerald-400">{g.actual_realized}</td>
                            <td className="p-3">
                              <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                                g.status === 'BAŞARILI' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                                g.status === 'BAŞARISIZ' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                                'bg-amber-950 text-amber-400 border border-amber-800'
                              }`}>
                                {g.status}
                              </span>
                            </td>
                            <td className="p-3 text-slate-300 text-xs leading-relaxed">{g.analysis}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Onay Butonları */}
              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-md transition cursor-pointer"
                >
                  Geri Dön & Yeniden Yükle
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleEvaluate}
                  className="w-2/3 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-sm font-bold rounded-md transition flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> {statusMessage}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Verileri Onayla ve Çok Yıllı Değerleme Raporunu Üret (Aşama 2)
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ADIM 3: FINTABLES TARZI SEKMELEŞTİRİLMİŞ ANALİZ VE GÖRSELLEŞTİRME */}
          {step === 'report' && activeReport && (
            <div className="space-y-6">
              
              {/* Üst Özet Barı */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-4">
                  <div className={`text-base font-black px-4 py-2 rounded-lg tracking-wider ${
                    activeReport.decision === 'AL' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/50' :
                    activeReport.decision === 'ALMA' ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/50' :
                    'bg-slate-700 text-slate-200'
                  }`}>
                    {activeReport.decision}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-white tracking-tight">{activeReport.ticker}</span>
                      <span className="text-sm font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded font-bold">
                        {activeReport.price} TL
                      </span>
                      {activeReport.period && (
                        <span className="text-xs text-slate-300 font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                          {activeReport.period}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Rapor Tarihi: {activeReport.createdAt}</div>
                  </div>
                </div>

                {activeReport.score && (
                  <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 p-3.5 rounded-lg shadow-inner">
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 uppercase font-semibold">Kurumsal Kalite Skoru</div>
                      <div className="text-2xl font-black font-mono text-emerald-400">{activeReport.score} <span className="text-xs text-slate-500 font-normal">/ 100</span></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sekme Navigasyonu (Tabs) */}
              <div className="flex border-b border-slate-800 gap-2 overflow-x-auto print:hidden">
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
                  onClick={() => setActiveTab('tables')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'tables'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <TrendingUp className="w-4 h-4" /> 2. Fintables Finansal Tablolar
                </button>
                <button
                  onClick={() => setActiveTab('guidance')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'guidance'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Target className="w-4 h-4" /> 3. Hedef & Rehberlik Karnesi
                </button>
                <button
                  onClick={() => setActiveTab('report')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'report'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4" /> 4. Değerleme Raporu (Fon Yöneticisi)
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'history'
                      ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <History className="w-4 h-4" /> 5. Çeyreklik Skor Takibi ({tickerHistory.length})
                </button>
              </div>

              {/* SEKME 1: GRAFİK TERMİNALİ (BÜYÜME ROZETLERİ VE NET OKUNABİLİRLİK İLE) */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {chartData.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800 text-sm">
                      Zaman serisi verisi bulunamadı. Çok yıllık PDF yüklediğinizde grafikler burada otomatik çizilir.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Grafik 1: Satış Gelirleri ve FAVÖK Büyümesi */}
                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 shadow-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                          <div>
                            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                              <TrendingUp className="w-4 h-4 text-emerald-400" /> Hasılat & FAVÖK Trendi (Büyüme)
                            </span>
                            <span className="text-[11px] text-slate-400">Üst sıra ciro ve operasyonel nakit üretim hacmi</span>
                          </div>
                          
                          {/* Son Dönem Artış / Azalış Rozetleri */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[11px]">
                              <span className="text-slate-400">Hasılat YoY:</span>
                              <ChangeBadge change={latestRevChange} size="xs" />
                            </div>
                            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[11px]">
                              <span className="text-slate-400">FAVÖK YoY:</span>
                              <ChangeBadge change={latestEbitdaChange} size="xs" />
                            </div>
                          </div>
                        </div>

                        <div className="h-64 w-full">
                          {mounted && (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                <XAxis dataKey="period" stroke="#94a3b8" tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                                <YAxis stroke="#94a3b8" tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                                <Bar dataKey="revenue" name="Hasılat" fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="ebitda" name="FAVÖK" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      {/* Grafik 2: Kârlılık Marjları Trendi */}
                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 shadow-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                          <div>
                            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                              <BarChart3 className="w-4 h-4 text-cyan-400" /> Kârlılık Marjları Evrimi (%)
                            </span>
                            <span className="text-[11px] text-slate-400">Brüt, FAVÖK ve Net marjların seyri</span>
                          </div>

                          {/* Son Dönem Marj Rozetleri */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[11px]">
                              <span className="text-amber-300 font-semibold">Brüt:</span>
                              <ChangeBadge change={latestGrossMarginChange} size="xs" />
                            </div>
                            <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-800 text-[11px]">
                              <span className="text-cyan-300 font-semibold">FAVÖK:</span>
                              <ChangeBadge change={latestEbitdaMarginChange} size="xs" />
                            </div>
                          </div>
                        </div>

                        <div className="h-64 w-full">
                          {mounted && (
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                <XAxis dataKey="period" stroke="#94a3b8" tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                                <YAxis stroke="#94a3b8" tick={{ fontSize: 11, fill: '#cbd5e1' }} unit="%" />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                                <Line type="monotone" dataKey="gross_margin" name="Brüt Marj %" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="ebitda_margin" name="FAVÖK Marjı %" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="net_margin" name="Net Marj %" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      {/* Grafik 3: ROIC vs WACC Makası (Ekonomik Değer Yaratımı) */}
                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 shadow-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                          <div>
                            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                              <Target className="w-4 h-4 text-purple-400" /> Sermaye Verimliliği: ROIC vs. WACC
                            </span>
                            <span className="text-[11px] text-slate-400">Yatırılan sermayenin getirisi vs. sermaye maliyeti</span>
                          </div>

                          {latestSpread !== null && (
                            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                              <span className="text-[10px] text-slate-400">EVA Makası:</span>
                              <span className={`text-xs font-bold font-mono ${latestSpread >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {latestSpread > 0 ? `+${latestSpread}` : latestSpread} puan
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                latestSpread >= 0 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}>
                                {latestSpread >= 0 ? 'Değer Yaratıyor' : 'Riskli'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="h-64 w-full">
                          {mounted && (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                <XAxis dataKey="period" stroke="#94a3b8" tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                                <YAxis stroke="#94a3b8" tick={{ fontSize: 11, fill: '#cbd5e1' }} unit="%" />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                                <Area type="monotone" dataKey="roic" name="ROIC % (Sermaye Getirisi)" stroke="#10b981" fill="#10b981" fillOpacity={0.25} strokeWidth={2.5} />
                                <Area type="monotone" dataKey="wacc" name="WACC % (Sermaye Maliyeti)" stroke="#ef4444" fill="#ef4444" fillOpacity={0.12} strokeWidth={2.5} />
                              </AreaChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                      {/* Grafik 4: Nakit Akış Kalitesi (OCF vs Net Kâr & Serbest Nakit) */}
                      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 shadow-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                          <div>
                            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                              <DollarSign className="w-4 h-4 text-sky-400" /> Nakit Akış Kalitesi (OCF vs. Net Kâr)
                            </span>
                            <span className="text-[11px] text-slate-400">Kârlılığın gerçek nakde dönüşme oranı</span>
                          </div>

                          {ocfRatio && (
                            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-[11px]">
                              <span className="text-slate-400">OCF / Net Kâr:</span>
                              <span className={`font-mono font-bold ${Number(ocfRatio) >= 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {ocfRatio}x
                              </span>
                              <span className="text-[10px] text-slate-500 font-sans">
                                {Number(ocfRatio) >= 1 ? '(Nakit Dönüşümü Güçlü)' : '(Zayıf Nakit Dönüşümü)'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="h-64 w-full">
                          {mounted && (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                <XAxis dataKey="period" stroke="#94a3b8" tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                                <YAxis stroke="#94a3b8" tick={{ fontSize: 11, fill: '#cbd5e1' }} />
                                <Tooltip content={<CustomChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                                <Bar dataKey="operating_cash_flow" name="İşletme Nakit Akışı (OCF)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="net_income" name="Net Kâr" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* SEKME 2: FİNTABLES TARZI FİNANSAL TABLOLAR (KATEGORİZE, YoY DEĞİŞİM ROZETLİ VE YÜKSEK OKUNABİLİRLİK) */}
              {activeTab === 'tables' && (
                <div className="space-y-6">

                  {/* Üst Yönetici KPI Kartları */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow-md">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Son Dönem Hasılat ({latestData?.period || '—'})</div>
                      <div className="text-lg md:text-xl font-black font-mono text-emerald-400 my-1">
                        {formatFinancial(latestData?.revenue)} <span className="text-xs text-slate-500 font-normal">{currentExtractedData?.currency || 'TL'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <ChangeBadge change={latestRevChange} size="sm" />
                        <span className="text-[10px] text-slate-400">Yıllık Büyüme</span>
                      </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow-md">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Son Dönem FAVÖK ({latestData?.period || '—'})</div>
                      <div className="text-lg md:text-xl font-black font-mono text-cyan-400 my-1">
                        {formatFinancial(latestData?.ebitda)} <span className="text-xs text-slate-500 font-normal">{currentExtractedData?.currency || 'TL'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <ChangeBadge change={latestEbitdaChange} size="sm" />
                        <span className="text-[10px] text-slate-400">Yıllık Büyüme</span>
                      </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow-md">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Son Dönem Net Kâr ({latestData?.period || '—'})</div>
                      <div className="text-lg md:text-xl font-black font-mono text-blue-400 my-1">
                        {formatFinancial(latestData?.net_income)} <span className="text-xs text-slate-500 font-normal">{currentExtractedData?.currency || 'TL'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <ChangeBadge change={latestNetChange} size="sm" />
                        <span className="text-[10px] text-slate-400">Yıllık Büyüme</span>
                      </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between shadow-md">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Sermaye Makası (ROIC - WACC)</div>
                      <div className={`text-lg md:text-xl font-black font-mono my-1 ${latestSpread && latestSpread >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {latestSpread !== null ? `${latestSpread > 0 ? '+' : ''}${latestSpread} puan` : '—'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          latestSpread && latestSpread >= 0 ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {latestSpread && latestSpread >= 0 ? 'Hissedara Değer Yaratıyor' : 'Sermaye Maliyetinin Altında'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Çok Yıllı Karşılaştırmalı Fintables Tablosu */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                    <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                        <div>
                          <span className="font-bold text-sm text-white">Çok Yıllı Karşılaştırmalı Finansal Göstergeler (Fintables Görünümü)</span>
                          <p className="text-xs text-slate-400">Dönemler arası artış ve azalışlar her hücrenin altında renkli yön rozetleri ile belirtilmektedir.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Artış / İyileşme
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ml-2" /> Azalış / Bozulma
                        </div>
                        <span className="text-xs text-emerald-400 font-mono bg-emerald-950 border border-emerald-800/80 px-2.5 py-1 rounded">
                          Birim: {currentExtractedData?.currency || 'TL'}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-800/90 text-slate-100 font-mono border-b border-slate-700">
                          <tr>
                            <th className="p-3.5 pl-5 min-w-[240px] text-xs font-bold uppercase tracking-wider">Finansal Kalem</th>
                            {chartData.map((d: any, idx: number) => (
                              <th key={idx} className="p-3.5 text-right min-w-[150px] text-xs font-bold uppercase tracking-wider">
                                <div>{d.period}</div>
                                {idx === 0 && <span className="text-[10px] text-slate-400 font-normal lowercase">(başlangıç)</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-800/70 font-mono">
                          {FINTABLES_SECTIONS.map((section, sIdx) => {
                            const SectionIcon = section.icon;

                            return (
                              <React.Fragment key={sIdx}>
                                {/* Kategori Başlığı Satırı */}
                                <tr className="bg-slate-950/80 border-y border-slate-800">
                                  <td colSpan={chartData.length + 1} className="py-2.5 px-4 font-sans font-bold text-xs uppercase tracking-wider text-slate-200">
                                    <div className="flex items-center gap-2">
                                      <SectionIcon className={`w-4 h-4 ${section.color}`} />
                                      <span>{section.title}</span>
                                    </div>
                                  </td>
                                </tr>

                                {/* Kategori Altındaki Kalemler */}
                                {section.rows.map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-slate-800/40 transition-colors group">
                                    <td className="p-3 pl-5 font-sans bg-slate-900/60 group-hover:bg-slate-800/60 transition-colors">
                                      <div className="font-bold text-white text-xs md:text-sm tracking-tight">{row.label}</div>
                                      <div className="text-[11px] text-slate-400 font-normal leading-tight mt-0.5">{row.sublabel}</div>
                                    </td>

                                    {chartData.map((d: any, idx: number) => {
                                      const prevD = idx > 0 ? chartData[idx - 1] : null;

                                      const val = row.customCalc ? row.customCalc(d) : d[row.key];
                                      const prevVal = prevD ? (row.customCalc ? row.customCalc(prevD) : prevD[row.key]) : null;

                                      const change = calculateYoYChange(val, prevVal, row.isMargin);

                                      let displayStr = '—';
                                      if (val !== null && val !== undefined && !isNaN(val)) {
                                        if (row.isMargin && row.prefix === '%') {
                                          displayStr = `%${val.toLocaleString('tr-TR')}`;
                                        } else if (row.suffix) {
                                          displayStr = `${val > 0 ? '+' : ''}${val.toLocaleString('tr-TR')}${row.suffix}`;
                                        } else {
                                          displayStr = val.toLocaleString('tr-TR');
                                        }
                                      }

                                      return (
                                        <td key={idx} className="p-3 text-right group-hover:bg-slate-800/30 transition-colors">
                                          <div className="flex flex-col items-end gap-1">
                                            <span className={`font-mono text-sm font-bold tracking-tight ${row.colorClass || 'text-white'}`}>
                                              {displayStr}
                                            </span>
                                            <ChangeBadge change={change} invert={row.invert} size="xs" />
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

                </div>
              )}

              {/* SEKME 3: HEDEF & REHBERLİK KARNESİ */}
              {activeTab === 'guidance' && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4 shadow-xl">
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
                            <th className="p-3">Yıl Sonu Gerçekleşen</th>
                            <th className="p-3">Karne Durumu</th>
                            <th className="p-3">Sapma & Güvenilirlik Değerlendirmesi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {currentExtractedData.guidance_track_record.map((g: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-800/40">
                              <td className="p-3 font-bold font-mono text-white">{g.year_or_period}</td>
                              <td className="p-3 text-slate-300">{g.guidance_given}</td>
                              <td className="p-3 font-mono font-bold text-emerald-400">{g.actual_realized}</td>
                              <td className="p-3">
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
                      Yüklenen belgelerde geçmiş yönetim rehberlik tablosu tespit edilemedi veya açıkça raporlanmamış.
                    </div>
                  )}
                </div>
              )}

              {/* SEKME 4: DEĞERLEME RAPORU (FON YÖNETİCİSİ - YÜKSEK OKUNABİLİRLİK İLE) */}
              {activeTab === 'report' && (
                <div className="bg-slate-900 border border-slate-800 p-8 md:p-12 rounded-xl shadow-2xl space-y-6 print:p-0 print:border-none print:bg-white print:text-black">
                  <div className="report-content">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ ...props }) => <h1 className="text-xl font-black text-white border-b border-slate-800 pb-2 mt-8 mb-4 tracking-tight" {...props} />,
                        h2: ({ ...props }) => <h2 className="text-lg font-bold text-emerald-400 border-b border-slate-800/80 pb-1 mt-6 mb-3 tracking-tight" {...props} />,
                        h3: ({ ...props }) => <h3 className="text-sm font-bold text-cyan-300 mt-5 mb-2 uppercase tracking-wide" {...props} />,
                        p: ({ ...props }) => <p className="text-sm text-slate-200 leading-relaxed mb-4" {...props} />,
                        table: ({ ...props }) => (
                          <div className="overflow-x-auto my-5 border border-slate-700 rounded-lg shadow-sm">
                            <table className="w-full text-left border-collapse text-xs" {...props} />
                          </div>
                        ),
                        thead: ({ ...props }) => <thead className="bg-slate-800 text-slate-100 border-b border-slate-700 font-bold" {...props} />,
                        tbody: ({ ...props }) => <tbody className="divide-y divide-slate-800 bg-slate-950/40" {...props} />,
                        tr: ({ ...props }) => <tr className="hover:bg-slate-800/40 transition-colors" {...props} />,
                        th: ({ ...props }) => <th className="p-3 font-bold text-slate-200 uppercase tracking-wider text-[11px]" {...props} />,
                        td: ({ ...props }) => <td className="p-3 text-slate-200 font-mono" {...props} />,
                        blockquote: ({ ...props }) => <blockquote className="border-l-4 border-amber-500 bg-amber-950/20 p-4 my-4 rounded-r-lg text-amber-200 text-xs leading-relaxed" {...props} />,
                        strong: ({ ...props }) => <strong className="font-semibold text-white" {...props} />,
                        ul: ({ ...props }) => <ul className="list-disc list-inside space-y-1.5 my-3 text-xs text-slate-300" {...props} />,
                        ol: ({ ...props }) => <ol className="list-decimal list-inside space-y-1.5 my-3 text-xs text-slate-300" {...props} />,
                        li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                        hr: ({ ...props }) => <hr className="border-slate-800 my-6" {...props} />,
                      }}
                    >
                      {activeReport.report}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* SEKME 5: ÇEYREKLİK SKOR VE KARAR EVRİMİ */}
              {activeTab === 'history' && (
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
                            <LineChart data={tickerHistory.map((h, i) => ({ name: h.period || h.createdAt.slice(0, 10), score: Number(h.score) || 0 }))}>
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
