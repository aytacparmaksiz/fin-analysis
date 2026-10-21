'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, TrendingUp, Building2, ArrowRight } from 'lucide-react';
import type { SavedReport } from '../page';

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const normalizedQuery = query.trim().toUpperCase();

  // Filtreleme: Hem kayıtlı raporlar hem de popüler BIST şirketleri
  const matchedSaved = savedReports.filter(r => 
    (r.ticker || '').toUpperCase().includes(normalizedQuery) ||
    ((r as any).companyName || r.extractedData?.company_name || '').toUpperCase().includes(normalizedQuery)
  );

  const matchedPopular = POPULAR_TICKERS.filter(p =>
    p.ticker.includes(normalizedQuery) ||
    p.name.toUpperCase().includes(normalizedQuery)
  );

  const handleSelect = (ticker: string) => {
    const existing = savedReports.find(r => r.ticker?.toUpperCase() === ticker.toUpperCase());
    if (existing) {
      onSelectReport(existing.id, existing.ticker);
    } else {
      onAnalyzeTicker(ticker);
    }
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
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
              if (e.key === 'Enter' && normalizedQuery) {
                handleSelect(normalizedQuery);
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
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="text-[10px] font-mono bg-[#21262d] text-slate-400 px-1.5 py-0.5 rounded border border-[#2e3440]">
              ESC
            </kbd>
          )}
        </div>

        {/* Sonuç Listesi */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-[#21262d]">
          {/* Kayıtlı Analizler */}
          {matchedSaved.length > 0 && (
            <div className="py-2">
              <div className="text-[10px] font-mono text-slate-400 px-3 py-1 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                Kayıtlı Analizler ({matchedSaved.length})
              </div>
              <div className="space-y-1 mt-1">
                {matchedSaved.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.ticker)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#21262d] transition text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm text-white group-hover:text-emerald-400 transition">
                        {item.ticker}
                      </span>
                      <span className="text-xs text-slate-300 truncate max-w-[220px]">
                        {(item as any).companyName || item.extractedData?.company_name || item.sector || 'BIST'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        {item.decision} • {item.score}/100
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popüler / Hızlı Analiz BIST Şirketleri */}
          <div className="py-2">
            <div className="text-[10px] font-mono text-slate-400 px-3 py-1 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-[#f5c242]" />
              {query ? 'Eşleşen BIST Hisseleri' : 'Popüler BIST Şirketleri'}
            </div>
            <div className="space-y-1 mt-1">
              {(query ? matchedPopular : POPULAR_TICKERS.slice(0, 6)).map(comp => (
                <button
                  key={comp.ticker}
                  type="button"
                  onClick={() => handleSelect(comp.ticker)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#21262d] transition text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-[#f5c242] group-hover:text-white transition">
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
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Alt Bilgi */}
        <div className="p-3 bg-[#12151b] flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span>Seçmek için Enter &apos;a basın</span>
          <span>Kapatmak için ESC</span>
        </div>
      </div>
    </div>
  );
}
