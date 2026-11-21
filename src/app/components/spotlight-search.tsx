'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, TrendingUp, Building2, ArrowRight, Sparkles } from 'lucide-react';
import type { SavedReport } from '../page';
import { formatCanonicalScore } from '@/lib/report-resolver';
import { parsePeriodSortKey } from '@/lib/valuation';

interface SpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
  savedReports: SavedReport[];
  onSelectReport: (reportId: string, ticker: string) => void;
  onAnalyzeTicker: (ticker: string) => void;
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
  onAnalyzeTicker
}: SpotlightSearchProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  // Filtreleme: Her şirketin yalnızca en son raporu gösterilir
  const matchedSaved = uniqueSavedReports.filter(r => 
    (r.ticker || '').toUpperCase().includes(normalizedQuery) ||
    ((r as any).companyName || r.extractedData?.company_name || '').toUpperCase().includes(normalizedQuery)
  );
  const savedTickerSet = new Set(matchedSaved.map(r => (r.ticker || '').trim().replace(/\.IS$/i, '').toUpperCase()));

  const matchedPopular = POPULAR_TICKERS.filter(p =>
    !savedTickerSet.has(p.ticker.toUpperCase()) &&
    (p.ticker.includes(normalizedQuery) ||
      p.name.toUpperCase().includes(normalizedQuery))
  );

  const displayedPopular = query
    ? matchedPopular
    : POPULAR_TICKERS.filter(p => !savedTickerSet.has(p.ticker.toUpperCase())).slice(0, 6);

  const hasExactMatch =
    matchedSaved.some(r => (r.ticker || '').toUpperCase() === normalizedQuery) ||
    displayedPopular.some(p => p.ticker.toUpperCase() === normalizedQuery);

  const showDirectAnalyze = normalizedQuery.length >= 2 && !hasExactMatch;

  type NavItem =
    | { type: 'saved'; item: SavedReport }
    | { type: 'popular'; comp: typeof POPULAR_TICKERS[number] }
    | { type: 'direct'; ticker: string };

  const navItems: NavItem[] = [
    ...matchedSaved.map(item => ({ type: 'saved' as const, item })),
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
    } else if (entry.type === 'popular') {
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
        className="w-full max-w-xl bg-[#161a22] border border-[#2e3440] rounded-2xl shadow-2xl overflow-hidden divide-y divide-[#282d37] animate-in zoom-in-95 duration-150"
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
            placeholder="Hisse kodu veya şirket adı ara (Örn: THYAO, AGESA)..."
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

          {/* Popüler / Hızlı Analiz BIST Şirketleri */}
          {displayedPopular.length > 0 && (
            <div className="py-2">
              <div className="text-[10px] font-mono text-slate-400 px-3 py-1 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[#f5c242]" />
                {query ? 'Eşleşen BIST Hisseleri' : 'Popüler BIST Şirketleri'}
              </div>
              <div className="space-y-1 mt-1">
                {displayedPopular.map((comp, pIdx) => {
                  const globalIdx = matchedSaved.length + pIdx;
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
                const directIdx = matchedSaved.length + displayedPopular.length;
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
