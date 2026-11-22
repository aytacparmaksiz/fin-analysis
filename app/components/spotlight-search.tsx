'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, TrendingUp, Building2, ArrowRight, Sparkles, Compass } from 'lucide-react';
import type { SavedReport } from '../page';
import { formatCanonicalScore } from '@/lib/report-resolver';
import { parsePeriodSortKey } from '@/lib/valuation';
import { OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE } from '@/lib/isyatirim-multiples-cache';
import type { IsYatirimStockMultiples } from '@/lib/isyatirim-service';

export type SpotlightNavTab =
  | 'cockpit'
  | 'saved'
  | 'portfolio'
  | 'favorites'
  | 'themes'
  | 'leaderboard'
  | 'sectors'
  | 'input';

interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  savedReports: SavedReport[];
  onSelectReport: (reportId: string, ticker: string) => void;
  onAnalyzeTicker: (ticker: string) => void;
  onNavigateTab?: (tab: SpotlightNavTab) => void;
}

const POPULAR_TICKERS = [
  { ticker: 'THYAO', name: 'Türk Hava Yolları', sector: 'Havacılık' },
  { ticker: 'AGESA', name: 'Agesa Hayat Emeklilik', sector: 'Sigortacılık' },
  { ticker: 'GARAN', name: 'Garanti BBVA', sector: 'Bankacılık' },
  { ticker: 'FROTO', name: 'Ford Otosan', sector: 'Otomotiv' },
  { ticker: 'BIMAS', name: 'BİM Mağazalar', sector: 'Perakende' },
  { ticker: 'EREGL', name: 'Ereğli Demir Çelik', sector: 'Demir-Çelik' },
  { ticker: 'TCELL', name: 'Turkcell İletişim', sector: 'Telekom' },
  { ticker: 'KCHOL', name: 'Koç Holding', sector: 'Holding' },
  { ticker: 'SAHOL', name: 'Sabancı Holding', sector: 'Holding' },
  { ticker: 'ASELS', name: 'Aselsan', sector: 'Savunma' }
];

export default function SpotlightSearch({
  isOpen,
  onClose,
  savedReports,
  onSelectReport,
  onAnalyzeTicker,
  onNavigateTab
}: SpotlightSearchProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // 629 BIST Şirketi Kataloğu (Piyasa değerine göre sıralı)
  const bistCatalog = useMemo<IsYatirimStockMultiples[]>(() => {
    return Object.values(OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE || {}).sort(
      (a, b) => (b.marketCapMnTl ?? 0) - (a.marketCapMnTl ?? 0)
    );
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  // Her hisse (ticker) için YALNIZCA en son (en güncel) raporu filtreleyen tekilleştirme haritası
  const latestSavedMap = useMemo(() => {
    const map = new Map<string, SavedReport>();
    const getReportTs = (r: SavedReport) => {
      const cands = [r.extractedData?.saved_at, r.updatedAt, r.createdAt];
      for (const c of cands) {
        const ms = typeof c === 'string' ? Date.parse(c) : NaN;
        if (!Number.isNaN(ms)) return ms;
      }
      return Number(r.id) || 0;
    };

    for (const r of savedReports) {
      const sym = (r.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase();
      if (!sym) continue;
      const existing = map.get(sym);
      if (!existing) {
        map.set(sym, r);
      } else {
        const pExisting = parsePeriodSortKey(existing.period || existing.extractedData?.reporting_period || '');
        const pCurrent = parsePeriodSortKey(r.period || r.extractedData?.reporting_period || '');
        if (pCurrent > pExisting) {
          map.set(sym, r);
        } else if (pCurrent === pExisting && getReportTs(r) > getReportTs(existing)) {
          map.set(sym, r);
        }
      }
    }
    return map;
  }, [savedReports]);

  const uniqueSavedReports = useMemo(() => {
    return Array.from(latestSavedMap.values());
  }, [latestSavedMap]);

  if (!isOpen) return null;

  const normalizedQuery = query.trim().toUpperCase();
  const normalizedQueryTr = query.trim().toLocaleUpperCase('tr-TR');

  // Filtreleme: Her şirketin yalnızca en son raporu gösterilir
  const matchedSaved = uniqueSavedReports.filter(r => {
    const tk = (r.ticker || '').toUpperCase();
    const cname = String((r as any).companyName || r.extractedData?.company_name || '').toLocaleUpperCase('tr-TR');
    const sec = String(r.sector || '').toLocaleUpperCase('tr-TR');
    return !normalizedQuery || tk.includes(normalizedQuery) || cname.includes(normalizedQueryTr) || sec.includes(normalizedQueryTr);
  });
  const savedTickerSet = new Set(matchedSaved.map(r => (r.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase()));

  // 629 BIST Şirketi İçinde Tam Metin & Çarpanlı Arama (Kayıtlı olmayanlar için)
  const matchedBistCatalog = normalizedQuery.length > 0
    ? bistCatalog
        .filter(item => {
          const tk = (item.ticker || '').toUpperCase();
          if (savedTickerSet.has(tk)) return false;
          const nm = (item.name || '').toLocaleUpperCase('tr-TR');
          const sec = (item.sectorName || '').toLocaleUpperCase('tr-TR');
          return tk.includes(normalizedQuery) || nm.includes(normalizedQueryTr) || sec.includes(normalizedQueryTr);
        })
        .sort((a, b) => {
          const aExact = a.ticker.toUpperCase() === normalizedQuery ? 2 : a.ticker.toUpperCase().startsWith(normalizedQuery) ? 1 : 0;
          const bExact = b.ticker.toUpperCase() === normalizedQuery ? 2 : b.ticker.toUpperCase().startsWith(normalizedQuery) ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;
          return (b.marketCapMnTl ?? 0) - (a.marketCapMnTl ?? 0);
        })
        .slice(0, 12)
    : [];

  const displayedPopular = normalizedQuery.length === 0
    ? POPULAR_TICKERS.filter(p => !savedTickerSet.has(p.ticker.toUpperCase())).slice(0, 6)
    : [];

  const hasExactMatch =
    matchedSaved.some(r => (r.ticker || '').toUpperCase() === normalizedQuery) ||
    matchedBistCatalog.some(c => (c.ticker || '').toUpperCase() === normalizedQuery) ||
    displayedPopular.some(p => p.ticker.toUpperCase() === normalizedQuery);

  const showDirectAnalyze = normalizedQuery.length >= 2 && !hasExactMatch;

  type NavItem =
    | { type: 'saved'; item: SavedReport }
    | { type: 'bist'; comp: IsYatirimStockMultiples }
    | { type: 'popular'; comp: typeof POPULAR_TICKERS[number] }
    | { type: 'direct'; ticker: string };

  const navItems: NavItem[] = [
    ...matchedSaved.map(item => ({ type: 'saved' as const, item })),
    ...matchedBistCatalog.map(comp => ({ type: 'bist' as const, comp })),
    ...displayedPopular.map(comp => ({ type: 'popular' as const, comp })),
    ...(showDirectAnalyze ? [{ type: 'direct' as const, ticker: normalizedQuery }] : [])
  ];

  const handleSelect = (ticker: string) => {
    const existing = latestSavedMap.get(ticker.toUpperCase());
    if (existing) {
      onSelectReport(existing.id, existing.ticker);
    } else {
      onAnalyzeTicker(ticker);
    }
    onClose();
  };

  const triggerNavItem = (entry: NavItem | undefined) => {
    if (!entry) {
      if (normalizedQuery) handleSelect(normalizedQuery);
      return;
    }
    if (entry.type === 'saved') {
      onSelectReport(entry.item.id, entry.item.ticker);
      onClose();
    } else if (entry.type === 'bist' || entry.type === 'popular') {
      handleSelect(entry.comp.ticker);
    } else {
      handleSelect(entry.ticker);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="fv-modal-panel w-full max-w-xl bg-[#161a22] border border-[#2e3440] rounded-2xl shadow-2xl overflow-hidden divide-y divide-[#282d37]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arama Input Alanı */}
        <div className="p-4 flex items-center gap-3 bg-[#12151b]">
          <Search className="w-5 h-5 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (navItems.length > 0) {
                  setActiveIndex((prev) => (prev + 1) % navItems.length);
                }
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (navItems.length > 0) {
                  setActiveIndex((prev) => (prev - 1 + navItems.length) % navItems.length);
                }
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (navItems[activeIndex]) {
                  triggerNavItem(navItems[activeIndex]);
                } else if (normalizedQuery) {
                  handleSelect(normalizedQuery);
                }
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="629 BIST şirketi, sektör veya kayıtlı analiz ara (Örn: MPARK, FROTO)..."
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Aramayı temizle"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#21262d] transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="text-[10px] font-mono bg-[#21262d] hover:bg-[#2b313d] text-slate-400 hover:text-white px-2 py-1 rounded border border-[#2e3440] transition cursor-pointer"
            >
              ESC
            </button>
          )}
        </div>

        {/* Hızlı Terminal Geçişleri (Sorgu Boşken) */}
        {!normalizedQuery && onNavigateTab && (
          <div className="px-3 py-2.5 bg-[#11141a] flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mr-1">
              <Compass className="w-3 h-3 text-cyan-400" />
              <span>Paneller:</span>
            </span>
            {([
              { id: 'cockpit', label: 'Kokpit' },
              { id: 'saved', label: 'KAP Akışı' },
              { id: 'portfolio', label: 'Portföy' },
              { id: 'favorites', label: 'Favoriler' },
              { id: 'themes', label: 'Temalar' },
              { id: 'leaderboard', label: 'Tarama' },
              { id: 'sectors', label: 'Sektörler' },
              { id: 'input', label: '+ Analiz' },
            ] as const).map(nav => (
              <button
                key={nav.id}
                type="button"
                onClick={() => {
                  onNavigateTab(nav.id);
                  onClose();
                }}
                className="fv-pill px-2 py-0.5 rounded-md bg-[#181c24] hover:bg-[#232936] border border-[#282e3b] hover:border-cyan-500/40 text-[11px] font-sans text-slate-300 hover:text-white cursor-pointer"
              >
                {nav.label}
              </button>
            ))}
          </div>
        )}

        {/* Sonuç Listesi */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-[#21262d]">
          {/* Kayıtlı Analizler (Tekilleştirilmiş - Yalnızca En Son Rapor) */}
          {matchedSaved.length > 0 && (
            <div className="py-2">
              <div className="text-[10px] font-mono text-slate-400 px-3 py-1 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                Kayıtlı Analizler ({matchedSaved.length} Şirket)
              </div>
              <div className="space-y-1 mt-1">
                {matchedSaved.map((item, idx) => {
                  const isSelected = activeIndex === idx;
                  const dec = (item.decision || '').trim().toUpperCase();
                  const decStyle = dec === 'AL'
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : dec === 'ALMA'
                    ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                    : 'text-amber-400 bg-amber-500/10 border-amber-500/20';

                  // Skorun 83/100/100 gibi çift yazılmasını kesin olarak önler
                  const cleanScore = formatCanonicalScore(item.score) ?? '—';

                  return (
                    <button
                      key={item.id}
                      ref={(el) => { itemRefs.current[idx] = el; }}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        onSelectReport(item.id, item.ticker);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition text-left cursor-pointer group ${
                        isSelected
                          ? 'bg-[#21262d] border-emerald-500/40 shadow-sm'
                          : 'border-transparent hover:bg-[#21262d]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`font-mono font-bold text-sm transition ${
                          isSelected ? 'text-emerald-400' : 'text-white group-hover:text-emerald-400'
                        }`}>
                          {item.ticker}
                        </span>
                        <span className="text-xs text-slate-300 truncate max-w-[180px] sm:max-w-[220px]">
                          {(item as any).companyName || item.extractedData?.company_name || item.sector || 'BIST'}
                        </span>
                        {item.period && (
                          <span className="text-[10px] font-mono text-slate-400 bg-[#12151b] px-1.5 py-0.5 rounded border border-[#282d37] shrink-0">
                            {item.period}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-mono font-bold border px-2 py-0.5 rounded ${decStyle}`}>
                          {item.decision} • {cleanScore}
                        </span>
                        <ArrowRight className={`w-3.5 h-3.5 transition ${
                          isSelected ? 'text-emerald-400 translate-x-0.5' : 'text-slate-500 group-hover:text-white'
                        }`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 629 BIST Şirketi Resmi Kataloğu Eşleşmeleri */}
          {matchedBistCatalog.length > 0 && (
            <div className="py-2">
              <div className="text-[10px] font-mono text-slate-400 px-3 py-1 font-semibold uppercase tracking-wider flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Tüm BIST Şirketleri ({matchedBistCatalog.length})</span>
                </span>
                <span className="text-[9.5px] text-slate-500">Seç ➔ Canlı Analiz</span>
              </div>
              <div className="space-y-1 mt-1">
                {matchedBistCatalog.map((comp, bIdx) => {
                  const globalIdx = matchedSaved.length + bIdx;
                  const isSelected = activeIndex === globalIdx;
                  return (
                    <button
                      key={comp.ticker}
                      ref={(el) => { itemRefs.current[globalIdx] = el; }}
                      type="button"
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      onClick={() => handleSelect(comp.ticker)}
                      className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border transition text-left cursor-pointer group ${
                        isSelected
                          ? 'bg-[#21262d] border-cyan-500/40 shadow-sm'
                          : 'border-transparent hover:bg-[#21262d]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`font-mono font-bold text-sm shrink-0 transition ${
                          isSelected ? 'text-cyan-300' : 'text-[#f5c242] group-hover:text-white'
                        }`}>
                          {comp.ticker}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs text-slate-200 truncate">{comp.name}</div>
                          <div className="text-[10px] text-slate-500 font-sans truncate">{comp.sectorName}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 font-mono">
                        {typeof comp.lastPrice === 'number' && comp.lastPrice > 0 && (
                          <span className="text-[11px] font-bold text-slate-200 px-1.5 py-0.5 rounded bg-[#12151b] border border-[#282d37]">
                            ₺{comp.lastPrice.toFixed(2)}
                          </span>
                        )}
                        {typeof comp.pe === 'number' && comp.pe > 0 && (
                          <span className="hidden sm:inline-block text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-[#12151b] border border-[#282d37]">
                            F/K {comp.pe.toFixed(1)}
                          </span>
                        )}
                        {typeof comp.pb === 'number' && comp.pb > 0 && (
                          <span className="hidden sm:inline-block text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-[#12151b] border border-[#282d37]">
                            PD {comp.pb.toFixed(1)}
                          </span>
                        )}
                        <ArrowRight className={`w-3.5 h-3.5 transition ${
                          isSelected ? 'text-cyan-400 translate-x-0.5' : 'text-slate-500 group-hover:text-white'
                        }`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Popüler / Hızlı Analiz BIST Şirketleri */}
          {displayedPopular.length > 0 && (
            <div className="py-2">
              <div className="text-[10px] font-mono text-slate-400 px-3 py-1 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[#f5c242]" />
                {query ? 'Eşleşen BIST Hisseleri' : 'Popüler BIST Şirketleri'}
              </div>
              <div className="space-y-1 mt-1">
                {displayedPopular.map((comp, pIdx) => {
                  const globalIdx = matchedSaved.length + matchedBistCatalog.length + pIdx;
                  const isSelected = activeIndex === globalIdx;
                  return (
                    <button
                      key={comp.ticker}
                      ref={(el) => { itemRefs.current[globalIdx] = el; }}
                      type="button"
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                      onClick={() => handleSelect(comp.ticker)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition text-left cursor-pointer group ${
                        isSelected
                          ? 'bg-[#21262d] border-[#f5c242]/40 shadow-sm'
                          : 'border-transparent hover:bg-[#21262d]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`font-mono font-bold text-sm transition ${
                          isSelected ? 'text-white' : 'text-[#f5c242] group-hover:text-white'
                        }`}>
                          {comp.ticker}
                        </span>
                        <span className="text-xs text-slate-300">
                          {comp.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400 bg-[#12151b] px-2 py-0.5 rounded border border-[#282d37]">
                          {comp.sector}
                        </span>
                        <ArrowRight className={`w-3.5 h-3.5 transition ${
                          isSelected ? 'text-[#f5c242] translate-x-0.5' : 'text-slate-500 group-hover:text-white'
                        }`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Doğrudan Yeni Ticker Analiz Aksiyonu */}
          {showDirectAnalyze && (
            <div className="py-2">
              {(() => {
                const directIdx = matchedSaved.length + matchedBistCatalog.length + displayedPopular.length;
                const isSelected = activeIndex === directIdx;
                return (
                  <button
                    ref={(el) => { itemRefs.current[directIdx] = el; }}
                    type="button"
                    onMouseEnter={() => setActiveIndex(directIdx)}
                    onClick={() => handleSelect(normalizedQuery)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition text-left cursor-pointer group ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/40'
                        : 'bg-[#12151b] border-[#282d37] hover:bg-[#21262d]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs text-slate-200">
                        <strong className="font-mono text-emerald-400">{normalizedQuery}</strong> hissesini yeni analiz ekranında aç
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition" />
                  </button>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer Alt Bilgi */}
        <div className="p-3 bg-[#12151b] flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#21262d] rounded border border-[#2e3440] text-[10px] text-slate-300">↑↓</kbd>
              Gezin
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[#21262d] rounded border border-[#2e3440] text-[10px] text-slate-300">↵</kbd>
              Seç
            </span>
            <span className="hidden sm:inline text-slate-500">
              {bistCatalog.length} BIST şirketi dizinli
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-[#21262d] rounded border border-[#2e3440] text-[10px] text-slate-300">ESC</kbd>
            Kapat
          </span>
        </div>
      </div>
    </div>
  );
}
