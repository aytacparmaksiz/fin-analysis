'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  X,
  RefreshCw,
  Search,
  TrendingUp,
  TrendingDown,
  Calendar,
  Newspaper,
  BarChart3,
  ArrowUpRight,
  Star,
  PlusCircle,
  Clock,
  Activity
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
  Tooltip,
  ReferenceLine
} from 'recharts';
import type { SavedReport } from '@/lib/report-resolver';
import type { CompanyNewsItem } from '@/lib/news-service';
import type {
  CockpitOverviewData,
  CockpitCardData,
  CockpitChartRange
} from '@/lib/cockpit-service';

interface MarketCockpitProps {
  savedReports: SavedReport[];
  favoriteTickers: string[];
  liveNewsFeed: CompanyNewsItem[];
  onToggleFavorite: (ticker: string) => void;
  onOpenTicker: (ticker: string) => void;
  onOpenReport: (reportId: string, ticker: string) => void;
  onGoToNewAnalysis: () => void;
}

const STORAGE_CARDS_KEY = 'fin_cockpit_cards_v1';

function formatMarketCapCompact(val: number | null | undefined): string {
  if (!val || !Number.isFinite(val) || val <= 0) return '—';
  if (val >= 1_000_000_000) {
    return `${(val / 1_000_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} Mr`;
  }
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`;
  }
  return val.toLocaleString('tr-TR');
}

function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}%${val.toFixed(1)}`;
}

function StockComparisonCard({
  ticker,
  onRemove,
  onOpenTicker,
  refreshToken
}: {
  ticker: string;
  onRemove: (ticker: string) => void;
  onOpenTicker: (ticker: string) => void;
  refreshToken: number;
}) {
  const [range, setRange] = useState<CockpitChartRange>('1G');
  const [card, setCard] = useState<CockpitCardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadCard = useCallback(async () => {
    try {
      const res = await fetch(`/api/cockpit/card?ticker=${encodeURIComponent(ticker)}&range=${range}`, {
        cache: 'no-store'
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success && json?.card) {
        setCard(json.card);
      }
    } catch {
      // Sessiz hata toleransı
    } finally {
      setLoading(false);
    }
  }, [ticker, range]);

  useEffect(() => {
    setLoading(true);
    loadCard();
  }, [loadCard, refreshToken]);

  const isPositive = (card?.changePct ?? 0) >= 0;
  const strokeColor = isPositive ? '#10b981' : '#f43f5e';

  return (
    <div className="bg-[#14171d] border border-[#242934] hover:border-[#343c4d] rounded-xl p-3.5 flex flex-col justify-between gap-3 transition-colors shadow-lg">
      {/* Üst Başlık: Sembol, Fiyat, Değişim & Kapat */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpenTicker(ticker)}
            className="flex items-center gap-2 min-w-0 text-left group cursor-pointer"
            title={`${ticker} tam analizini aç`}
          >
            <span className="w-6 h-6 rounded-md bg-[#1e2430] border border-[#2e3646] flex items-center justify-center font-mono text-[10px] font-bold text-[#f5c242] shrink-0">
              {ticker.slice(0, 2)}
            </span>
            <span className="font-mono font-bold text-sm text-white group-hover:text-[#f5c242] transition truncate">
              {ticker}
            </span>
            <span className="font-mono font-bold text-sm text-white">
              {card?.price ? card.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
              isPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
            }`}>
              {card ? `${isPositive ? '+' : ''}%${card.changePct.toFixed(2)}` : '—'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onRemove(ticker)}
            className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-[#1e232d] transition cursor-pointer shrink-0"
            title="Kartı Kaldır"
            aria-label={`${ticker} kartını kaldır`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Taban / Tavan / Yüksek / Düşük / Önc. Kap. */}
        <div className="grid grid-cols-5 gap-1 text-[10px] font-mono border-b border-[#222732] pb-2">
          <div>
            <div className="text-slate-500">Taban</div>
            <div className="text-slate-200 font-semibold">{card?.floorPrice ? card.floorPrice.toFixed(2) : '—'}</div>
          </div>
          <div>
            <div className="text-slate-500">Tavan</div>
            <div className="text-slate-200 font-semibold">{card?.ceilingPrice ? card.ceilingPrice.toFixed(2) : '—'}</div>
          </div>
          <div>
            <div className="text-slate-500">Yüksek</div>
            <div className="text-slate-200 font-semibold">{card?.dayHigh ? card.dayHigh.toFixed(2) : '—'}</div>
          </div>
          <div>
            <div className="text-slate-500">Düşük</div>
            <div className="text-slate-200 font-semibold">{card?.dayLow ? card.dayLow.toFixed(2) : '—'}</div>
          </div>
          <div className="text-right">
            <div className="text-slate-500">Önc.Kap</div>
            <div className="text-slate-200 font-semibold">{card?.prevClose ? card.prevClose.toFixed(2) : '—'}</div>
          </div>
        </div>
      </div>

      {/* Grafik Zaman Aralığı Sekmeleri (Sadece Özet Grafik) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {(['1G', '1H', '1A', '1Y'] as CockpitChartRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition cursor-pointer ${
                  range === r
                    ? 'bg-[#252c39] text-white border border-[#3a4356]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onOpenTicker(ticker)}
            className="text-[10.5px] font-mono text-cyan-400 hover:text-[#f5c242] flex items-center gap-0.5 transition cursor-pointer"
          >
            <span>Analiz</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* Sparkline Çizgi Grafik */}
        <div className="h-24 w-full bg-[#101318] border border-[#1e232d] rounded-lg px-1 pt-1">
          {loading && !card ? (
            <div className="h-full flex items-center justify-center text-[11px] font-mono text-slate-500">
              Yükleniyor...
            </div>
          ) : card && card.points.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={card.points} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#181b20',
                    border: '1px solid #2e3440',
                    borderRadius: '8px',
                    fontSize: '11px',
                    padding: '4px 8px'
                  }}
                  labelStyle={{ color: '#94a3b8', fontFamily: 'monospace' }}
                  formatter={(value: any) => [`₺${Number(value).toFixed(2)}`, ticker]}
                />
                {range === '1G' && card.prevClose > 0 && (
                  <ReferenceLine y={card.prevClose} stroke="#475569" strokeDasharray="3 3" />
                )}
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={strokeColor}
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-[11px] font-mono text-slate-500">
              Grafik verisi bekleniyor
            </div>
          )}
        </div>
      </div>

      {/* Temel Çarpanlar (F/K, PD/DD, FD/FAVÖK, Piyasa Değeri) */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-mono border-t border-[#222732] pt-2.5">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">F/K</span>
          <span className="text-white font-semibold">{card?.multiples.pe ? card.multiples.pe.toFixed(2) : '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">FD/FAVÖK</span>
          <span className="text-white font-semibold">{card?.multiples.evEbitda ? card.multiples.evEbitda.toFixed(2) : '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">PD/DD</span>
          <span className="text-white font-semibold">{card?.multiples.pb ? card.multiples.pb.toFixed(2) : '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Piy. Değ.</span>
          <span className="text-[#f5c242] font-semibold">{formatMarketCapCompact(card?.multiples.marketCapTl)}</span>
        </div>
      </div>

      {/* Performans Izgarası (1H, 1A, 3A, 6A, YTD, 1Y) */}
      <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-[#222732] text-[10.5px] font-mono">
        {[
          { label: '1H', val: card?.perf.w1 },
          { label: '1A', val: card?.perf.m1 },
          { label: '3A', val: card?.perf.m3 },
          { label: '6A', val: card?.perf.m6 },
          { label: 'YTD', val: card?.perf.ytd },
          { label: '1Y', val: card?.perf.y1 }
        ].map((p) => {
          const isUp = (p.val ?? 0) >= 0;
          return (
            <div key={p.label} className="flex items-center justify-between bg-[#101318] px-1.5 py-1 rounded border border-[#1e232d]">
              <span className="text-slate-500">{p.label}</span>
              <span className={p.val == null ? 'text-slate-500' : isUp ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {formatPct(p.val)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MarketCockpit({
  savedReports,
  favoriteTickers,
  liveNewsFeed,
  onToggleFavorite,
  onOpenTicker,
  onOpenReport,
  onGoToNewAnalysis
}: MarketCockpitProps) {
  const [overview, setOverview] = useState<CockpitOverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [refreshToken, setRefreshToken] = useState<number>(0);

  // Kullanıcının eklediği karşılaştırma kartları (Varsayılan boş!)
  const [cardTickers, setCardTickers] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addSearchQuery, setAddSearchQuery] = useState<string>('');

  // Alt panellerin aktif sekmeleri
  const [agendaTab, setAgendaTab] = useState<'agenda' | 'earnings'>('agenda');
  const [marketTab, setMarketTab] = useState<'sectors' | 'gainers' | 'losers'>('sectors');
  const [feedTab, setFeedTab] = useState<'all' | 'favorites'>('all');

  // İzleme listesi hızlı ekleme
  const [watchlistQuery, setWatchlistQuery] = useState<string>('');
  const [showWatchlistAdd, setShowWatchlistAdd] = useState<boolean>(false);

  // Kayıtlı kartları localStorage'dan yükle (Varsayılan boş)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CARDS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCardTickers(parsed.filter((t) => typeof t === 'string' && t.trim().length >= 2).slice(0, 10));
        }
      }
    } catch {}
  }, []);

  const persistCardTickers = useCallback((next: string[]) => {
    setCardTickers(next);
    try {
      localStorage.setItem(STORAGE_CARDS_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const addCardTicker = useCallback((rawTicker: string) => {
    const clean = rawTicker.toUpperCase().replace(/\.IS$/i, '').trim();
    if (!clean) return;
    setCardTickers((prev) => {
      if (prev.includes(clean)) return prev;
      const next = [...prev, clean].slice(0, 10);
      try {
        localStorage.setItem(STORAGE_CARDS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setAddSearchQuery('');
    setIsAddModalOpen(false);
  }, []);

  const removeCardTicker = useCallback((tk: string) => {
    persistCardTickers(cardTickers.filter((c) => c !== tk));
  }, [cardTickers, persistCardTickers]);

  const fetchOverview = useCallback(async (force = false) => {
    try {
      const res = await fetch(`/api/cockpit${force ? '?refresh=true' : ''}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.success) {
        setOverview(json);
      }
    } catch {
      // Sessiz hata toleransı
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview(false);
    const interval = setInterval(() => {
      fetchOverview(true);
      setRefreshToken((t) => t + 1);
    }, 45_000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  const filteredAddCandidates = useMemo(() => {
    const q = addSearchQuery.toUpperCase().trim();
    const list = overview?.allTickers || [];
    if (!q) return list.slice(0, 18);
    return list
      .filter((item) => item.ticker.includes(q) || item.name.toUpperCase().includes(q))
      .slice(0, 18);
  }, [overview?.allTickers, addSearchQuery]);

  const watchlistItems = useMemo(() => {
    const tickers = favoriteTickers.length > 0
      ? favoriteTickers
      : savedReports.slice(0, 8).map((r) => r.ticker);
    const uniq = Array.from(new Set(tickers.map((t) => t.toUpperCase())));
    return uniq.map((tk) => {
      const q = overview?.quotesMap?.[tk];
      return {
        ticker: tk,
        price: q?.price ?? null,
        changePct: q?.changePct ?? null,
        isFavorite: favoriteTickers.includes(tk)
      };
    });
  }, [favoriteTickers, savedReports, overview?.quotesMap]);

  const displayedNews = useMemo(() => {
    if (feedTab === 'favorites' && favoriteTickers.length > 0) {
      const favSet = new Set(favoriteTickers.map((t) => t.toUpperCase()));
      return liveNewsFeed.filter((n) => favSet.has((n.ticker || '').toUpperCase()));
    }
    return liveNewsFeed;
  }, [liveNewsFeed, feedTab, favoriteTickers]);

  return (
    <div className="w-full max-w-[1680px] mx-auto px-3 sm:px-5 py-4 space-y-4">
      {/* ÜST PİYASA ENDEKS VE DÖVİZ ŞERİDİ */}
      <div className="bg-[#12151b] border border-[#232834] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          {(overview?.indices && overview.indices.length > 0
            ? overview.indices
            : [
                { symbol: 'XU100', label: 'XU100', price: 0, changePct: 0, decimals: 2 },
                { symbol: 'XU030', label: 'XU030', price: 0, changePct: 0, decimals: 2 },
                { symbol: 'USDTRY', label: 'USDTRY', price: 0, changePct: 0, decimals: 4 },
                { symbol: 'EURTRY', label: 'EURTRY', price: 0, changePct: 0, decimals: 4 }
              ]
          ).map((idx) => {
            const isUp = idx.changePct >= 0;
            return (
              <div key={idx.symbol} className="flex items-baseline gap-2.5">
                <div>
                  <div className="text-[11px] font-mono text-slate-400">{idx.label}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm sm:text-base font-mono font-bold text-white">
                      {idx.price > 0
                        ? idx.price.toLocaleString('tr-TR', {
                            minimumFractionDigits: idx.decimals,
                            maximumFractionDigits: idx.decimals
                          })
                        : '—'}
                    </span>
                    {idx.price > 0 && (
                      <span className={`text-xs font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isUp ? '+' : ''}%{idx.changePct.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-[#181c24] px-2.5 py-1 rounded-lg border border-[#252b37]">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>BIST 15 dk gecikmeli</span>
          </span>
          <button
            type="button"
            onClick={() => {
              fetchOverview(true);
              setRefreshToken((t) => t + 1);
            }}
            className="p-1.5 rounded-lg bg-[#181c24] hover:bg-[#21262d] text-slate-300 hover:text-white border border-[#252b37] transition cursor-pointer"
            title="Piyasa Verilerini Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onGoToNewAnalysis}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-sans font-bold text-xs transition cursor-pointer shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Yeni Analiz</span>
          </button>
        </div>
      </div>

      {/* ANA İKİ SÜTUNLU KOKPİT YERLEŞİMİ (Sol/Orta Alan + Sağ İzleme & Akış Sütunu) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* SOL & ORTA ALAN (9 Sütun) */}
        <div className="xl:col-span-9 space-y-4 min-w-0">
          {/* KARTLAR BÖLÜMÜ (Varsayılan Boş, Kullanıcı Ekledikçe Yan Yana Açılır) */}
          <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-sans font-bold text-white">Kartlar</h2>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1d222b] hover:bg-[#262d39] text-slate-200 hover:text-[#f5c242] border border-[#2e3545] text-xs font-semibold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ekle</span>
                </button>
                {cardTickers.length > 0 && (
                  <span className="text-[11px] font-mono text-slate-400">
                    {cardTickers.length}/10 Hisse
                  </span>
                )}
              </div>
              {cardTickers.length > 0 && (
                <button
                  type="button"
                  onClick={() => persistCardTickers([])}
                  className="text-[11px] font-mono text-slate-400 hover:text-rose-400 transition cursor-pointer"
                >
                  Tümünü Temizle
                </button>
              )}
            </div>

            {/* Hisse Kartı Ekleme Arama Kutusu */}
            {isAddModalOpen && (
              <div className="bg-[#181b22] border border-[#2e3545] rounded-xl p-3 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={addSearchQuery}
                    onChange={(e) => setAddSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && addSearchQuery.trim()) {
                        addCardTicker(addSearchQuery);
                      } else if (e.key === 'Escape') {
                        setIsAddModalOpen(false);
                      }
                    }}
                    placeholder="BIST hisse kodu veya şirket adı yazın (Örn: THYAO, TURSG, AGESA)..."
                    autoFocus
                    className="w-full bg-[#111419] border border-[#2a303d] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#f5c242]"
                  />
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#232834] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {filteredAddCandidates.map((item) => {
                    const alreadyAdded = cardTickers.includes(item.ticker);
                    return (
                      <button
                        key={item.ticker}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => addCardTicker(item.ticker)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition flex items-center gap-1.5 ${
                          alreadyAdded
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 opacity-60 cursor-default'
                            : 'bg-[#12151b] hover:bg-[#21262d] text-slate-200 hover:text-[#f5c242] border-[#282e3b] cursor-pointer'
                        }`}
                      >
                        <span className="font-bold">{item.ticker}</span>
                        {item.price > 0 && (
                          <span className="text-[10px] text-slate-400">
                            ₺{item.price.toFixed(2)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {addSearchQuery.trim().length >= 2 && filteredAddCandidates.length === 0 && (
                    <button
                      type="button"
                      onClick={() => addCardTicker(addSearchQuery)}
                      className="px-3 py-1.5 rounded-lg text-xs font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 cursor-pointer"
                    >
                      + {addSearchQuery.toUpperCase().trim()} Kodunu Kart Olarak Ekle
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Kartlar Grid veya Boş Durum */}
            {cardTickers.length === 0 ? (
              <div className="border border-dashed border-[#2b313e] bg-[#101318]/70 rounded-xl py-10 px-4 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-[#181c24] border border-[#282e3b] flex items-center justify-center text-[#f5c242]">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="space-y-1 max-w-md">
                  <div className="text-sm font-sans font-semibold text-white">
                    Karşılaştırma Kartı Alanı Boş
                  </div>
                  <p className="text-xs text-slate-400 font-sans">
                    Fiyat grafiği, tavan/taban marjları, temel çarpanlar ve dönemsel getirileri yan yana izlemek için yukarıdaki <strong className="text-slate-200">+ Ekle</strong> butonundan BIST hisseleri ekleyin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1d222b] hover:bg-[#262d39] text-[#f5c242] border border-[#323a4b] text-xs font-semibold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Hisse Kartı Ekle</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3">
                {cardTickers.map((tk) => (
                  <StockComparisonCard
                    key={tk}
                    ticker={tk}
                    onRemove={removeCardTicker}
                    onOpenTicker={onOpenTicker}
                    refreshToken={refreshToken}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ALT İKİ PANEL: AJANDA / SON BİLANÇOLAR & EN SEKTÖRLER / EN HİSSELER */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* SOL PANEL: AJANDA & SON BİLANÇOLAR */}
            <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-3 shadow-md">
              <div className="flex items-center justify-between border-b border-[#222732] pb-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAgendaTab('agenda')}
                    className={`px-3 py-1 rounded-lg text-xs font-sans font-bold transition cursor-pointer ${
                      agendaTab === 'agenda'
                        ? 'bg-[#212632] text-white border border-[#323a4b]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Ajanda (TR & ABD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgendaTab('earnings')}
                    className={`px-3 py-1 rounded-lg text-xs font-sans font-bold transition cursor-pointer ${
                      agendaTab === 'earnings'
                        ? 'bg-[#212632] text-white border border-[#323a4b]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Son Bilançolar
                  </button>
                </div>
                <Calendar className="w-4 h-4 text-slate-400" />
              </div>

              {agendaTab === 'agenda' ? (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {overview?.agenda && overview.agenda.length > 0 ? (
                    overview.agenda.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between gap-3 bg-[#161a22] border border-[#222732] rounded-lg px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 text-center bg-[#101318] border border-[#232834] rounded-md py-1 shrink-0 font-mono">
                            <div className="text-[11px] font-bold text-white leading-none">{ev.dayNum}</div>
                            <div className="text-[9px] text-slate-400 uppercase mt-0.5">{ev.monthTr}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold ${
                                ev.country === 'TR'
                                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                  : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                              }`}>
                                {ev.country === 'TR' ? 'TR' : 'ABD'}
                              </span>
                              <span className="text-[10.5px] font-mono text-slate-400">{ev.timeTr}</span>
                            </div>
                            <div className="text-slate-200 font-medium truncate mt-0.5" title={ev.title}>
                              {ev.title}
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono text-[10.5px] shrink-0 space-y-0.5">
                          {ev.actual != null ? (
                            <div className="text-emerald-400 font-bold">Gerç: {ev.actual}</div>
                          ) : ev.forecast != null ? (
                            <div className="text-[#f5c242]">Bekl: {ev.forecast}</div>
                          ) : null}
                          {ev.previous != null && (
                            <div className="text-slate-400">Önc: {ev.previous}</div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-xs font-mono text-slate-400">
                      {loadingOverview ? 'Ekonomik takvim yükleniyor...' : 'Yakın tarihli TR/ABD ekonomik takvim verisi bulunamadı.'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {savedReports.length > 0 ? (
                    savedReports.slice(0, 12).map((rep) => (
                      <button
                        key={rep.id}
                        type="button"
                        onClick={() => onOpenReport(rep.id, rep.ticker)}
                        className="w-full flex items-center justify-between gap-3 bg-[#161a22] hover:bg-[#1c212b] border border-[#222732] rounded-lg px-3 py-2 text-xs transition cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono font-bold text-[#f5c242] w-14 shrink-0">{rep.ticker}</span>
                          <span className="text-slate-300 font-mono text-[11px]">{rep.period || '2025/12'}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 font-mono">
                          <span className="text-slate-300">{rep.score || '—'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                            rep.decision === 'AL'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : rep.decision === 'ALMA'
                              ? 'bg-rose-500/15 text-rose-400'
                              : 'bg-amber-500/15 text-amber-400'
                          }`}>
                            {rep.decision}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="py-8 text-center text-xs font-mono text-slate-400">
                      Henüz analiz edilmiş bilanço raporu bulunmuyor.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ORTA PANEL: EN SEKTÖRLER & EN HİSSELER */}
            <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-3 shadow-md">
              <div className="flex items-center justify-between border-b border-[#222732] pb-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMarketTab('sectors')}
                    className={`px-3 py-1 rounded-lg text-xs font-sans font-bold transition cursor-pointer ${
                      marketTab === 'sectors'
                        ? 'bg-[#212632] text-white border border-[#323a4b]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    En Sektörler
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketTab('gainers')}
                    className={`px-3 py-1 rounded-lg text-xs font-sans font-bold transition cursor-pointer ${
                      marketTab === 'gainers'
                        ? 'bg-[#212632] text-white border border-[#323a4b]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Yükselenler
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketTab('losers')}
                    className={`px-3 py-1 rounded-lg text-xs font-sans font-bold transition cursor-pointer ${
                      marketTab === 'losers'
                        ? 'bg-[#212632] text-white border border-[#323a4b]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Düşenler
                  </button>
                </div>
                <BarChart3 className="w-4 h-4 text-slate-400" />
              </div>

              {marketTab === 'sectors' ? (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {overview?.topSectors && overview.topSectors.length > 0 ? (
                    overview.topSectors.map((sec) => {
                      const isUp = sec.avgChangePct >= 0;
                      return (
                        <div
                          key={sec.sector}
                          className="flex items-center justify-between gap-3 bg-[#161a22] border border-[#222732] rounded-lg px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="text-slate-200 font-semibold truncate">{sec.sector}</div>
                            <div className="text-[10.5px] font-mono text-slate-400">
                              {sec.stockCount} hisse • Lider:{' '}
                              <button
                                type="button"
                                onClick={() => onOpenTicker(sec.leaderTicker)}
                                className="text-[#f5c242] hover:underline cursor-pointer"
                              >
                                {sec.leaderTicker}
                              </button>
                            </div>
                          </div>
                          <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs shrink-0 ${
                            isUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                          }`}>
                            {isUp ? '+' : ''}%{sec.avgChangePct.toFixed(2)}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-xs font-mono text-slate-400">
                      {loadingOverview ? 'Sektör performansları yükleniyor...' : 'Sektör verisi şu an alınamadı.'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {(marketTab === 'gainers' ? overview?.topGainers : overview?.topLosers)?.map((st) => {
                    const isUp = st.changePct >= 0;
                    return (
                      <button
                        key={st.ticker}
                        type="button"
                        onClick={() => onOpenTicker(st.ticker)}
                        className="w-full flex items-center justify-between gap-3 bg-[#161a22] hover:bg-[#1c212b] border border-[#222732] rounded-lg px-3 py-2 text-xs transition cursor-pointer text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[#f5c242]">{st.ticker}</span>
                            <span className="text-slate-300 truncate">{st.name}</span>
                          </div>
                          <div className="text-[10.5px] text-slate-400 font-mono">{st.sector}</div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 font-mono">
                          <span className="text-white font-bold">₺{st.price.toFixed(2)}</span>
                          <span className={`px-1.5 py-0.5 rounded font-bold text-[11px] ${
                            isUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                          }`}>
                            {isUp ? '+' : ''}%{st.changePct.toFixed(2)}
                          </span>
                        </div>
                      </button>
                    );
                  }) || (
                    <div className="py-8 text-center text-xs font-mono text-slate-400">
                      Hisse verisi yükleniyor...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SAĞ SÜTUN (3 Sütun): İZLEME LİSTESİ & CANLI KAP AKIŞI */}
        <div className="xl:col-span-3 space-y-4 min-w-0">
          {/* İZLEME LİSTESİ */}
          <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between border-b border-[#222732] pb-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-sans font-bold text-white">İzleme Listesi</span>
              </div>
              <button
                type="button"
                onClick={() => setShowWatchlistAdd((p) => !p)}
                className="text-xs font-mono text-slate-400 hover:text-[#f5c242] transition cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ekle</span>
              </button>
            </div>

            {showWatchlistAdd && (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={watchlistQuery}
                  onChange={(e) => setWatchlistQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && watchlistQuery.trim()) {
                      onToggleFavorite(watchlistQuery.toUpperCase().trim());
                      setWatchlistQuery('');
                      setShowWatchlistAdd(false);
                    }
                  }}
                  placeholder="Kod ekle (Örn: MPARK)"
                  className="w-full bg-[#101318] border border-[#282e3b] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#f5c242]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (watchlistQuery.trim()) {
                      onToggleFavorite(watchlistQuery.toUpperCase().trim());
                      setWatchlistQuery('');
                      setShowWatchlistAdd(false);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#212632] text-[#f5c242] text-xs font-bold cursor-pointer"
                >
                  Ekle
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 text-[10.5px] font-mono text-slate-400 px-2">
              <span>Sembol</span>
              <span className="text-right">Fiyat</span>
              <span className="text-right">Değişim</span>
            </div>

            <div className="divide-y divide-[#1e232d] max-h-72 overflow-y-auto">
              {watchlistItems.length > 0 ? (
                watchlistItems.map((item) => {
                  const isUp = (item.changePct ?? 0) >= 0;
                  return (
                    <div
                      key={item.ticker}
                      onClick={() => onOpenTicker(item.ticker)}
                      className="grid grid-cols-3 items-center py-2 px-2 hover:bg-[#1a1f29] rounded-lg transition cursor-pointer font-mono text-xs"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-5 h-5 rounded bg-[#1d222c] border border-[#2a3140] flex items-center justify-center text-[9px] font-bold text-[#f5c242] shrink-0">
                          {item.ticker.slice(0, 2)}
                        </span>
                        <span className="font-bold text-white truncate">{item.ticker}</span>
                      </div>
                      <div className="text-right text-slate-200 font-semibold">
                        {item.price ? item.price.toFixed(2) : '—'}
                      </div>
                      <div className="text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                          item.changePct == null
                            ? 'text-slate-500'
                            : isUp
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-rose-500/15 text-rose-400'
                        }`}>
                          {item.changePct == null ? '—' : `${isUp ? '+' : ''}%${item.changePct.toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 font-sans">
                  İzleme listenize hisse ekleyerek fiyatları buradan takip edebilirsiniz.
                </div>
              )}
            </div>
          </div>

          {/* AKIŞ (CANLI KAP & BÜLTENLER) */}
          <div className="bg-[#12151b] border border-[#232834] rounded-xl p-4 space-y-3 shadow-md">
            <div className="flex items-center justify-between border-b border-[#222732] pb-2">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-sans font-bold text-white">Akış</span>
              </div>
              <div className="flex items-center gap-1 bg-[#171b23] p-0.5 rounded-lg border border-[#252b37] text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setFeedTab('all')}
                  className={`px-2 py-0.5 rounded transition cursor-pointer ${
                    feedTab === 'all' ? 'bg-[#252c39] text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tümü
                </button>
                <button
                  type="button"
                  onClick={() => setFeedTab('favorites')}
                  className={`px-2 py-0.5 rounded transition cursor-pointer ${
                    feedTab === 'favorites' ? 'bg-[#252c39] text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Favoriler
                </button>
              </div>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {displayedNews.length > 0 ? (
                displayedNews.slice(0, 12).map((news, idx) => (
                  <div
                    key={news.id || idx}
                    className="bg-[#161a22] hover:bg-[#1b202a] border border-[#222732] rounded-lg p-2.5 space-y-1 transition"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-bold">
                          {news.source || 'KAP'}
                        </span>
                        {news.ticker && (
                          <button
                            type="button"
                            onClick={() => onOpenTicker(news.ticker)}
                            className="text-[#f5c242] font-bold hover:underline cursor-pointer"
                          >
                            {news.ticker}
                          </button>
                        )}
                      </div>
                      <span className="text-slate-400">{news.timeAgo || news.publishDate}</span>
                    </div>
                    <a
                      href={news.kapUrl || news.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-slate-200 hover:text-white leading-snug line-clamp-2 font-sans"
                    >
                      {news.title}
                    </a>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 font-sans">
                  {feedTab === 'favorites'
                    ? 'Favori hisseleriniz için güncel KAP bildirimi bulunamadı.'
                    : 'Analiz ettiğiniz şirketlere ait güncel KAP bildirimleri burada listelenir.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
