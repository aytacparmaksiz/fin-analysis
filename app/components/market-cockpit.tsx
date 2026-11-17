'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  X,
  RefreshCw,
  Search,
  Calendar,
  Newspaper,
  BarChart3,
  ArrowUpRight,
  Star,
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

function cleanFeedTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/^\*+[^*]+\*+(?:\s*\*+[^*]+\*+)*\s*/g, '')
    .replace(/\*\*\*[A-Z0-9]+\*\*\*\s*/gi, '')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  const strokeColor = isPositive ? '#22c55e' : '#ef4444';

  return (
    <div className="bg-[#13161b] border border-[#232730] hover:border-[#323846] rounded-lg p-3.5 flex flex-col justify-between gap-3 transition-colors min-w-0">
      {/* Üst Başlık: Sembol, Fiyat, Değişim & Kapat */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpenTicker(ticker)}
            className="flex items-center gap-2 min-w-0 text-left group cursor-pointer"
            title={`${ticker} tam analizini aç`}
          >
            <span className="w-6 h-6 rounded bg-[#1b1f27] border border-[#2a303c] flex items-center justify-center font-mono text-[10px] font-bold text-slate-200 shrink-0">
              {ticker.slice(0, 2)}
            </span>
            <span className="font-mono font-bold text-sm text-white group-hover:text-[#f5c242] transition shrink-0">
              {ticker}
            </span>
            <span className="font-mono font-semibold text-sm text-slate-100 shrink-0">
              {card?.price ? card.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold shrink-0 ${
              isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
            }`}>
              {card ? `${isPositive ? '+' : ''}%${card.changePct.toFixed(2)}` : '—'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onRemove(ticker)}
            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-[#1c2028] transition cursor-pointer shrink-0"
            title="Kartı Kaldır"
            aria-label={`${ticker} kartını kaldır`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Yüksek / Düşük / Önc. Kap. (Taban ve Tavan kaldırıldı) */}
        <div className="grid grid-cols-3 gap-2 text-[11px] font-mono border-b border-[#20242d] pb-2">
          <div>
            <div className="text-slate-500 text-[10px]">Yüksek</div>
            <div className="text-slate-200 font-medium">{card?.dayHigh ? card.dayHigh.toFixed(2) : '—'}</div>
          </div>
          <div className="text-center">
            <div className="text-slate-500 text-[10px]">Düşük</div>
            <div className="text-slate-200 font-medium">{card?.dayLow ? card.dayLow.toFixed(2) : '—'}</div>
          </div>
          <div className="text-right">
            <div className="text-slate-500 text-[10px]">Önc. Kap.</div>
            <div className="text-slate-200 font-medium">{card?.prevClose ? card.prevClose.toFixed(2) : '—'}</div>
          </div>
        </div>
      </div>

      {/* Grafik Zaman Aralığı Sekmeleri */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {(['1G', '1H', '1A', '1Y'] as CockpitChartRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
                  range === r
                    ? 'bg-[#222731] text-white border border-[#323948]'
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
            className="text-[11px] font-mono text-slate-400 hover:text-white flex items-center gap-0.5 transition cursor-pointer"
          >
            <span>Analiz</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        {/* Sparkline Çizgi Grafik */}
        <div className="h-24 w-full bg-[#0e1014] border border-[#1d212a] rounded-md px-1 pt-1">
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
                    backgroundColor: '#161920',
                    border: '1px solid #2b313c',
                    borderRadius: '6px',
                    fontSize: '11px',
                    padding: '4px 8px'
                  }}
                  labelStyle={{ color: '#94a3b8', fontFamily: 'monospace' }}
                  formatter={(value: any) => [`₺${Number(value).toFixed(2)}`, ticker]}
                />
                {range === '1G' && card.prevClose > 0 && (
                  <ReferenceLine y={card.prevClose} stroke="#3f4654" strokeDasharray="3 3" />
                )}
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={strokeColor}
                  strokeWidth={1.6}
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

      {/* Temel Çarpanlar */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-mono border-t border-[#20242d] pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">F/K</span>
          <span className="text-slate-100 font-semibold">{card?.multiples.pe ? card.multiples.pe.toFixed(2) : '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">FD/FAVÖK</span>
          <span className="text-slate-100 font-semibold">{card?.multiples.evEbitda ? card.multiples.evEbitda.toFixed(2) : '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">PD/DD</span>
          <span className="text-slate-100 font-semibold">{card?.multiples.pb ? card.multiples.pb.toFixed(2) : '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 whitespace-nowrap">Piy. Değ.</span>
          <span className="text-slate-100 font-semibold whitespace-nowrap">{formatMarketCapCompact(card?.multiples.marketCapTl)}</span>
        </div>
      </div>

      {/* Performans Izgarası (1H, 1A, 3A, 6A, YTD, 1Y) */}
      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-[#20242d] text-[10.5px] font-mono">
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
            <div key={p.label} className="flex items-center justify-between gap-1 bg-[#0e1014] px-2 py-1 rounded border border-[#1d212a]">
              <span className="text-slate-500 shrink-0">{p.label}</span>
              <span className={`truncate ${p.val == null ? 'text-slate-500' : isUp ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}`}>
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
  onOpenReport
}: MarketCockpitProps) {
  const [overview, setOverview] = useState<CockpitOverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [refreshToken, setRefreshToken] = useState<number>(0);

  // Kullanıcının eklediği karşılaştırma kartları (Varsayılan boş)
  const [cardTickers, setCardTickers] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addSearchQuery, setAddSearchQuery] = useState<string>('');

  // Alt panellerin aktif sekmeleri
  const [agendaTab, setAgendaTab] = useState<'agenda' | 'earnings'>('agenda');
  const [marketTab, setMarketTab] = useState<'sectors' | 'gainers' | 'losers'>('sectors');
  const [feedTab, setFeedTab] = useState<'all' | 'favorites'>('all');

  // Favoriler hızlı ekleme
  const [watchlistQuery, setWatchlistQuery] = useState<string>('');
  const [showWatchlistAdd, setShowWatchlistAdd] = useState<boolean>(false);

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

  // Sağdaki Favoriler kartı yalnızca kullanıcının favori listesine bağlıdır
  const favoriteItems = useMemo(() => {
    const uniq = Array.from(new Set(favoriteTickers.map((t) => t.toUpperCase())));
    return uniq.map((tk) => {
      const q = overview?.quotesMap?.[tk];
      return {
        ticker: tk,
        price: q?.price ?? null,
        changePct: q?.changePct ?? null
      };
    });
  }, [favoriteTickers, overview?.quotesMap]);

  const displayedNews = useMemo(() => {
    if (feedTab === 'favorites') {
      const favSet = new Set(favoriteTickers.map((t) => t.toUpperCase()));
      return liveNewsFeed.filter((n) => favSet.has((n.ticker || '').toUpperCase()));
    }
    return liveNewsFeed;
  }, [liveNewsFeed, feedTab, favoriteTickers]);

  return (
    <div className="w-full space-y-3">
      {/* ÜST PİYASA ENDEKS VE DÖVİZ ŞERİDİ */}
      <div className="bg-[#111419] border border-[#20242d] rounded-lg px-4 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-6 sm:gap-10">
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
              <div key={idx.symbol} className="flex items-baseline gap-2">
                <div>
                  <div className="text-[10.5px] font-mono text-slate-400">{idx.label}</div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono font-semibold text-white">
                      {idx.price > 0
                        ? idx.price.toLocaleString('tr-TR', {
                            minimumFractionDigits: idx.decimals,
                            maximumFractionDigits: idx.decimals
                          })
                        : '—'}
                    </span>
                    {idx.price > 0 && (
                      <span className={`text-[11px] font-mono font-semibold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isUp ? '+' : ''}%{idx.changePct.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-[#161a21] px-2.5 py-1 rounded border border-[#232730]">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>BIST 15 dk gecikmeli</span>
          </span>
          <button
            type="button"
            onClick={() => {
              fetchOverview(true);
              setRefreshToken((t) => t + 1);
            }}
            className="p-1.5 rounded bg-[#161a21] hover:bg-[#1e222b] text-slate-300 hover:text-white border border-[#232730] transition cursor-pointer"
            title="Piyasa Verilerini Yenile"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin text-slate-200' : ''}`} />
          </button>
        </div>
      </div>

      {/* ANA İKİ SÜTUNLU YERLEŞİM */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-start">
        {/* SOL & ORTA ALAN (9 Sütun) */}
        <div className="xl:col-span-9 space-y-3 min-w-0">
          {/* KARTLAR BÖLÜMÜ (Varsayılan Boş, Kullanıcı Ekledikçe Yan Yana Açılır) */}
          <div className="bg-[#111419] border border-[#20242d] rounded-lg p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-sans font-bold text-white">Kartlar</h2>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#1a1e26] hover:bg-[#222732] text-slate-200 hover:text-white border border-[#2a303c] text-xs font-medium transition cursor-pointer"
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
              <div className="bg-[#151920] border border-[#292f3b] rounded-lg p-3 space-y-2.5">
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
                    className="w-full bg-[#0e1014] border border-[#262b36] rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-[#202530] cursor-pointer"
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
                        className={`px-2.5 py-1 rounded text-xs font-mono border transition flex items-center gap-1.5 ${
                          alreadyAdded
                            ? 'bg-[#1a1f28] text-slate-500 border-[#262c38] opacity-60 cursor-default'
                            : 'bg-[#0e1014] hover:bg-[#1c212a] text-slate-200 hover:text-white border-[#252a35] cursor-pointer'
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
                      className="px-3 py-1.5 rounded text-xs font-mono bg-[#1c212a] text-white border border-[#2f3644] cursor-pointer"
                    >
                      + {addSearchQuery.toUpperCase().trim()} Kodunu Kart Olarak Ekle
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Kartlar Grid veya Boş Durum */}
            {cardTickers.length === 0 ? (
              <div className="border border-dashed border-[#262b35] bg-[#0e1014] rounded-lg py-10 px-4 flex flex-col items-center justify-center text-center space-y-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#161a21] border border-[#242934] flex items-center justify-center text-slate-300">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="space-y-1 max-w-md">
                  <div className="text-sm font-sans font-semibold text-white">
                    Karşılaştırma Kartı Alanı Boş
                  </div>
                  <p className="text-xs text-slate-400 font-sans">
                    Fiyat grafiği, temel çarpanlar ve dönemsel getirileri yan yana izlemek için <strong className="text-slate-200">+ Ekle</strong> butonundan BIST hisseleri ekleyin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1a1e26] hover:bg-[#222732] text-slate-100 border border-[#2b313e] text-xs font-medium transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Hisse Kartı Ekle</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
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

          {/* ALT İKİ PANEL: AJANDA / SON BİLANÇOLAR & SEKTÖREL / YÜKSELENLER */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* SOL PANEL: AJANDA & SON BİLANÇOLAR */}
            <div className="bg-[#111419] border border-[#20242d] rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#20242d] pb-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAgendaTab('agenda')}
                    className={`px-2.5 py-1 rounded text-xs font-sans font-semibold transition cursor-pointer ${
                      agendaTab === 'agenda'
                        ? 'bg-[#1d222b] text-white border border-[#2c3340]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Ajanda (TR & ABD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgendaTab('earnings')}
                    className={`px-2.5 py-1 rounded text-xs font-sans font-semibold transition cursor-pointer ${
                      agendaTab === 'earnings'
                        ? 'bg-[#1d222b] text-white border border-[#2c3340]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Son Bilançolar
                  </button>
                </div>
                <Calendar className="w-4 h-4 text-slate-500" />
              </div>

              {agendaTab === 'agenda' ? (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {overview?.agenda && overview.agenda.length > 0 ? (
                    overview.agenda.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between gap-3 bg-[#15181e] border border-[#20242d] rounded px-2.5 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 text-center bg-[#0e1014] border border-[#20242d] rounded py-1 shrink-0 font-mono">
                            <div className="text-[11px] font-bold text-white leading-none">{ev.dayNum}</div>
                            <div className="text-[9px] text-slate-400 uppercase mt-0.5">{ev.monthTr}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold ${
                                ev.country === 'TR'
                                  ? 'bg-rose-500/10 text-rose-300 border border-rose-500/25'
                                  : 'bg-slate-700/40 text-slate-200 border border-slate-600/40'
                              }`}>
                                {ev.country === 'TR' ? 'TR' : 'ABD'}
                              </span>
                              <span className="text-[10.5px] font-mono text-slate-400">{ev.timeTr}</span>
                            </div>
                            <div className="text-slate-200 font-medium truncate mt-0.5" title={ev.title}>
                              {ev.title.replace(/\*+$/, '').trim()}
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono text-[10.5px] shrink-0 space-y-0.5">
                          {ev.actual != null ? (
                            <div className="text-emerald-400 font-semibold">Gerç: {ev.actual}</div>
                          ) : ev.forecast != null ? (
                            <div className="text-slate-200">Bekl: {ev.forecast}</div>
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
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {savedReports.length > 0 ? (
                    savedReports.slice(0, 12).map((rep) => (
                      <button
                        key={rep.id}
                        type="button"
                        onClick={() => onOpenReport(rep.id, rep.ticker)}
                        className="w-full flex items-center justify-between gap-3 bg-[#15181e] hover:bg-[#1b1f27] border border-[#20242d] rounded px-3 py-2 text-xs transition cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono font-bold text-white w-14 shrink-0">{rep.ticker}</span>
                          <span className="text-slate-400 font-mono text-[11px]">{rep.period || '2025/12'}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 font-mono">
                          <span className="text-slate-300">{rep.score || '—'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                            rep.decision === 'AL'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : rep.decision === 'ALMA'
                              ? 'bg-rose-500/10 text-rose-400'
                              : 'bg-amber-500/10 text-amber-400'
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

            {/* ORTA PANEL: SEKTÖREL & HİSSELER */}
            <div className="bg-[#111419] border border-[#20242d] rounded-lg p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#20242d] pb-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMarketTab('sectors')}
                    className={`px-2.5 py-1 rounded text-xs font-sans font-semibold transition cursor-pointer ${
                      marketTab === 'sectors'
                        ? 'bg-[#1d222b] text-white border border-[#2c3340]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Sektörel
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketTab('gainers')}
                    className={`px-2.5 py-1 rounded text-xs font-sans font-semibold transition cursor-pointer ${
                      marketTab === 'gainers'
                        ? 'bg-[#1d222b] text-white border border-[#2c3340]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Yükselenler
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketTab('losers')}
                    className={`px-2.5 py-1 rounded text-xs font-sans font-semibold transition cursor-pointer ${
                      marketTab === 'losers'
                        ? 'bg-[#1d222b] text-white border border-[#2c3340]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Düşenler
                  </button>
                </div>
                <BarChart3 className="w-4 h-4 text-slate-500" />
              </div>

              {marketTab === 'sectors' ? (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {overview?.topSectors && overview.topSectors.length > 0 ? (
                    overview.topSectors.map((sec) => {
                      const isUp = sec.avgChangePct >= 0;
                      return (
                        <div
                          key={sec.sector}
                          className="flex items-center justify-between gap-3 bg-[#15181e] border border-[#20242d] rounded px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="text-slate-200 font-medium truncate">{sec.sector}</div>
                            <div className="text-[10.5px] font-mono text-slate-400">
                              {sec.stockCount} hisse • Lider:{' '}
                              <button
                                type="button"
                                onClick={() => onOpenTicker(sec.leaderTicker)}
                                className="text-slate-200 hover:text-white hover:underline cursor-pointer"
                              >
                                {sec.leaderTicker}
                              </button>
                            </div>
                          </div>
                          <span className={`font-mono font-semibold px-2 py-0.5 rounded text-xs shrink-0 ${
                            isUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
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
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {(marketTab === 'gainers' ? overview?.topGainers : overview?.topLosers)?.map((st) => {
                    const isUp = st.changePct >= 0;
                    return (
                      <button
                        key={st.ticker}
                        type="button"
                        onClick={() => onOpenTicker(st.ticker)}
                        className="w-full flex items-center justify-between gap-3 bg-[#15181e] hover:bg-[#1b1f27] border border-[#20242d] rounded px-3 py-2 text-xs transition cursor-pointer text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white">{st.ticker}</span>
                            <span className="text-slate-300 truncate">{st.name}</span>
                          </div>
                          <div className="text-[10.5px] text-slate-400 font-mono">{st.sector}</div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 font-mono">
                          <span className="text-slate-100 font-semibold">₺{st.price.toFixed(2)}</span>
                          <span className={`px-1.5 py-0.5 rounded font-semibold text-[11px] ${
                            isUp ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
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

        {/* SAĞ SÜTUN (3 Sütun): FAVORİLER & CANLI KAP AKIŞI */}
        <div className="xl:col-span-3 space-y-3 min-w-0">
          {/* FAVORİLER (Yalnızca Favori Hisseler ile Senkronize) */}
          <div className="bg-[#111419] border border-[#20242d] rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-center justify-between border-b border-[#20242d] pb-2">
              <div className="flex items-center gap-2">
                <Star className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-sans font-bold text-white">Favoriler</span>
              </div>
              <button
                type="button"
                onClick={() => setShowWatchlistAdd((p) => !p)}
                className="text-xs font-mono text-slate-400 hover:text-white transition cursor-pointer flex items-center gap-1"
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
                  placeholder="Favoriye ekle (Örn: MPARK)"
                  className="w-full bg-[#0e1014] border border-[#262b36] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-slate-400"
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
                  className="px-2.5 py-1 rounded bg-[#1d222b] text-white border border-[#2d3340] text-xs font-semibold cursor-pointer"
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

            <div className="divide-y divide-[#1c2029] max-h-72 overflow-y-auto">
              {favoriteItems.length > 0 ? (
                favoriteItems.map((item) => {
                  const isUp = (item.changePct ?? 0) >= 0;
                  return (
                    <div
                      key={item.ticker}
                      onClick={() => onOpenTicker(item.ticker)}
                      className="grid grid-cols-3 items-center py-2 px-2 hover:bg-[#171b22] rounded transition cursor-pointer font-mono text-xs group"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-5 h-5 rounded bg-[#1a1f28] border border-[#262d3a] flex items-center justify-center text-[9px] font-bold text-slate-200 shrink-0">
                          {item.ticker.slice(0, 2)}
                        </span>
                        <span className="font-bold text-white truncate">{item.ticker}</span>
                      </div>
                      <div className="text-right text-slate-200 font-medium">
                        {item.price ? item.price.toFixed(2) : '—'}
                      </div>
                      <div className="text-right flex items-center justify-end gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                          item.changePct == null
                            ? 'text-slate-500'
                            : isUp
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {item.changePct == null ? '—' : `${isUp ? '+' : ''}%${item.changePct.toFixed(2)}`}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(item.ticker);
                          }}
                          title="Favorilerden Çıkar"
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 font-sans">
                  Favori listeniz henüz boş. Üstteki <strong className="text-slate-200">+ Ekle</strong> butonundan veya analiz ekranından hisse ekleyebilirsiniz.
                </div>
              )}
            </div>
          </div>

          {/* AKIŞ (CANLI KAP & BÜLTENLER) */}
          <div className="bg-[#111419] border border-[#20242d] rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-center justify-between border-b border-[#20242d] pb-2">
              <div className="flex items-center gap-2">
                <Newspaper className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-sans font-bold text-white">Akış</span>
              </div>
              <div className="flex items-center gap-1 bg-[#161a21] p-0.5 rounded border border-[#232730] text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setFeedTab('all')}
                  className={`px-2 py-0.5 rounded transition cursor-pointer ${
                    feedTab === 'all' ? 'bg-[#222732] text-white font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tümü
                </button>
                <button
                  type="button"
                  onClick={() => setFeedTab('favorites')}
                  className={`px-2 py-0.5 rounded transition cursor-pointer ${
                    feedTab === 'favorites' ? 'bg-[#222732] text-white font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Favoriler
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {displayedNews.length > 0 ? (
                displayedNews.slice(0, 12).map((news, idx) => (
                  <div
                    key={news.id || idx}
                    className="bg-[#15181e] hover:bg-[#191d24] border border-[#20242d] rounded p-2.5 space-y-1 transition"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 font-semibold">
                          {news.source || 'KAP'}
                        </span>
                        <span className="text-slate-600">•</span>
                        {news.ticker && (
                          <button
                            type="button"
                            onClick={() => onOpenTicker(news.ticker)}
                            className="text-slate-200 font-bold hover:text-white hover:underline cursor-pointer"
                          >
                            {news.ticker}
                          </button>
                        )}
                      </div>
                      <span className="text-slate-500">{news.timeAgo || news.publishDate}</span>
                    </div>
                    <a
                      href={news.kapUrl || news.url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-slate-200 hover:text-white leading-snug line-clamp-2 font-sans"
                    >
                      {cleanFeedTitle(news.title)}
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
