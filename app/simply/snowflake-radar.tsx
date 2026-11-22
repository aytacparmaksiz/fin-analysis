'use client';

import React, { useState, useMemo, useId } from 'react';
import {
  getSnowflakeCoordinates,
  generateSmoothSnowflakePath,
  type SnowflakeAnalysisResult
} from '@/lib/snowflake';

export interface SnowflakeRadarProps {
  axes: SnowflakeAnalysisResult['axes'];
  ticker: string;
  size?: number | string;
  onSelectSection?: (sectionId: string) => void;
  className?: string;
  showLabels?: boolean;
}

interface SectorMeta {
  key: keyof SnowflakeAnalysisResult['axes'];
  labelEn: string;
  labelTr: string;
  sectionId: string;
  centerDeg: number;
  labelX: number;
  labelY: number;
  textAnchor: 'middle' | 'start' | 'end';
}

const SECTOR_METAS: SectorMeta[] = [
  {
    key: 'value',
    labelEn: 'VALUE',
    labelTr: 'DEĞERLEME',
    sectionId: 'sec-adildeger',
    centerDeg: -90,
    labelX: 140,
    labelY: 26,
    textAnchor: 'middle'
  },
  {
    key: 'future',
    labelEn: 'FUTURE',
    labelTr: 'GELECEK',
    sectionId: 'sec-adildeger',
    centerDeg: -18,
    labelX: 250,
    labelY: 104,
    textAnchor: 'start'
  },
  {
    key: 'past',
    labelEn: 'PAST',
    labelTr: 'GEÇMİŞ',
    sectionId: 'sec-grafikler',
    centerDeg: 54,
    labelX: 212,
    labelY: 236,
    textAnchor: 'start'
  },
  {
    key: 'health',
    labelEn: 'HEALTH',
    labelTr: 'SAĞLIK',
    sectionId: 'sec-tablolar',
    centerDeg: 126,
    labelX: 68,
    labelY: 236,
    textAnchor: 'end'
  },
  {
    key: 'dividend',
    labelEn: 'DIVIDEND',
    labelTr: 'TEMETTÜ',
    sectionId: 'sec-temettu',
    centerDeg: 198,
    labelX: 30,
    labelY: 104,
    textAnchor: 'end'
  }
];

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function makeWedgePath(cx: number, cy: number, rIn: number, rOut: number, startDeg: number, endDeg: number): string {
  const startRad = degToRad(startDeg);
  const endRad = degToRad(endDeg);

  const x1 = cx + rOut * Math.cos(startRad);
  const y1 = cy + rOut * Math.sin(startRad);
  const x2 = cx + rOut * Math.cos(endRad);
  const y2 = cy + rOut * Math.sin(endRad);

  if (rIn <= 0) {
    return `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rOut} ${rOut} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
  }

  const x3 = cx + rIn * Math.cos(endRad);
  const y3 = cy + rIn * Math.sin(endRad);
  const x4 = cx + rIn * Math.cos(startRad);
  const y4 = cy + rIn * Math.sin(startRad);

  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${rOut} ${rOut} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${rIn} ${rIn} 0 0 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z`;
}

export default function SnowflakeRadar({
  axes,
  ticker,
  size = 280,
  onSelectSection,
  className = '',
  showLabels = true
}: SnowflakeRadarProps) {
  const [hoveredAxis, setHoveredAxis] = useState<string | null>(null);
  const rawUid = useId();
  const uid = rawUid.replace(/[^a-zA-Z0-9_-]/g, '');
  const glowFilterId = `sfGlow-${uid}`;
  const goldGradId = `sfGoldGradient-${uid}`;
  const hoverSectorGradId = `sfHoverSectorGrad-${uid}`;

  const cx = 140;
  const cy = 140;
  const maxR = 95;
  const rMid = 63.3;
  const rIn = 31.7;

  // 5 eksenin toplam skoruna göre dinamik renk spektrumu (20+ Zümrüt, 12-19 Altın, <12 Mercan)
  const totalScore = useMemo(() => {
    return Object.values(axes || {}).reduce((sum, axis) => sum + (axis?.score ?? 0), 0);
  }, [axes]);

  const radarPalette = useMemo(() => {
    if (totalScore >= 20) {
      return {
        stop0: '#6ee7b7',
        stop60: '#10b981',
        stop100: '#047857',
        stroke: '#10b981',
        dotFill: '#6ee7b7',
        glowRgba: 'rgba(16,185,129,0.38)'
      };
    }
    if (totalScore >= 12) {
      return {
        stop0: '#fde047',
        stop60: '#f5c242',
        stop100: '#d97706',
        stroke: '#f5c242',
        dotFill: '#fde047',
        glowRgba: 'rgba(245,194,66,0.35)'
      };
    }
    return {
      stop0: '#fda4af',
      stop60: '#f43f5e',
      stop100: '#be123c',
      stroke: '#f43f5e',
      dotFill: '#fda4af',
      glowRgba: 'rgba(244,63,94,0.38)'
    };
  }, [totalScore]);

  // Snowflake organigini hesapla
  const radarPoints = useMemo(() => {
    return getSnowflakeCoordinates(axes, cx, cy, maxR);
  }, [axes]);

  const smoothRadarPath = useMemo(() => {
    return generateSmoothSnowflakePath(radarPoints);
  }, [radarPoints]);

  const handleSectorClick = (sectionId: string) => {
    if (onSelectSection) {
      onSelectSection(sectionId);
    } else {
      const el = document.getElementById(sectionId);
      if (el) {
        const yOffset = typeof window !== 'undefined' && window.innerWidth < 1024 ? -112 : -76;
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    }
  };

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 280 280"
        width={size}
        height={size}
        className="overflow-visible"
      >
        <defs>
          {/* Organik Snowflake Glow Filtresi */}
          <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Dinamik Skor Gradyanı */}
          <radialGradient id={goldGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={radarPalette.stop0} stopOpacity="0.85" />
            <stop offset="60%" stopColor={radarPalette.stop60} stopOpacity="0.75" />
            <stop offset="100%" stopColor={radarPalette.stop100} stopOpacity="0.65" />
          </radialGradient>

          {/* Vurgu (Hover) Gradyanı */}
          <radialGradient id={hoverSectorGradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor={radarPalette.stroke} stopOpacity="0.14" />
          </radialGradient>
        </defs>

        {/* ========================================================================= */}
        {/* 1. ARKA TABAN RADAR GRAFİĞİ (3 KONSANTRİK HALKA VE 5 DİLİM)               */}
        {/* ========================================================================= */}
        <g className="radar-grid-background">
          {SECTOR_METAS.map((meta) => {
            const startDeg = meta.centerDeg - 36;
            const endDeg = meta.centerDeg + 36;
            const isHovered = hoveredAxis === meta.key;

            return (
              <g
                key={meta.key}
                role="button"
                tabIndex={0}
                aria-label={`${meta.labelTr} (${axes[meta.key]?.score ?? 0}/6 Puan)`}
                className="cursor-pointer transition-all duration-200 focus:outline-none"
                onMouseEnter={() => setHoveredAxis(meta.key)}
                onMouseLeave={() => setHoveredAxis(null)}
                onFocus={() => setHoveredAxis(meta.key)}
                onBlur={() => setHoveredAxis(null)}
                onTouchStart={() => setHoveredAxis(meta.key)}
                onClick={() => handleSectorClick(meta.sectionId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSectorClick(meta.sectionId);
                  }
                }}
              >
                {/* Dış Halka Bandı (rMid -> maxR) */}
                <path
                  d={makeWedgePath(cx, cy, rMid, maxR, startDeg, endDeg)}
                  fill={isHovered ? '#2f3644' : '#1c2027'}
                  stroke="#2b313d"
                  strokeWidth="1.2"
                  className="transition-colors duration-200"
                />

                {/* Orta Halka Bandı (rIn -> rMid) */}
                <path
                  d={makeWedgePath(cx, cy, rIn, rMid, startDeg, endDeg)}
                  fill={isHovered ? '#262d3a' : '#161920'}
                  stroke="#2b313d"
                  strokeWidth="1.2"
                  className="transition-colors duration-200"
                />

                {/* İç Daire Bandı (0 -> rIn) */}
                <path
                  d={makeWedgePath(cx, cy, 0, rIn, startDeg, endDeg)}
                  fill={isHovered ? '#202632' : '#11141a'}
                  stroke="#2b313d"
                  strokeWidth="1.2"
                  className="transition-colors duration-200"
                />

                {/* Hover Olduğunda Tüm Dilim Üzerine Vurgu Katmanı */}
                {isHovered && (
                  <path
                    d={makeWedgePath(cx, cy, 0, maxR, startDeg, endDeg)}
                    fill={`url(#${hoverSectorGradId})`}
                    stroke={radarPalette.stroke}
                    strokeWidth="1.5"
                    className="animate-in fade-in duration-200"
                  />
                )}
              </g>
            );
          })}

          {/* 3 Konsantrik Çember Çizgisi (Daha Belirgin Net Konturlar) */}
          <circle cx={cx} cy={cy} r={maxR} fill="none" stroke="#3b4252" strokeWidth="1.8" />
          <circle cx={cx} cy={cy} r={rMid} fill="none" stroke="#323846" strokeWidth="1.2" />
          <circle cx={cx} cy={cy} r={rIn} fill="none" stroke="#2b313d" strokeWidth="1" />

          {/* 5 Eksen Ayrımları (Radial Spokes / Divider Lines) */}
          {SECTOR_METAS.map((meta) => {
            const divRad = degToRad(meta.centerDeg + 36);
            const x2 = cx + maxR * Math.cos(divRad);
            const y2 = cy + maxR * Math.sin(divRad);
            return (
              <line
                key={`spoke-${meta.key}`}
                x1={cx}
                y1={cy}
                x2={x2.toFixed(1)}
                y2={y2.toFixed(1)}
                stroke="#323846"
                strokeWidth="1.5"
              />
            );
          })}
        </g>

        {/* ========================================================================= */}
        {/* 2. DİNAMİK ORGANİK SNOWFLAKE VERİ POLİGONU (SKORA DUYARLI GRADİENT)       */}
        {/* ========================================================================= */}
        {smoothRadarPath && (
          <path
            d={smoothRadarPath}
            fill={`url(#${goldGradId})`}
            stroke={radarPalette.stroke}
            strokeWidth="2.5"
            strokeLinejoin="round"
            filter={`url(#${glowFilterId})`}
            style={{ filter: `drop-shadow(0 0 8px ${radarPalette.glowRgba})` }}
            className="transition-all duration-500 pointer-events-none"
          />
        )}

        {/* Veri Tepe Noktaları (Noktalar) */}
        {radarPoints.map((pt) => {
          const isHovered = hoveredAxis === pt.axis;
          return (
            <g
              key={`pt-${pt.axis}`}
              className="cursor-pointer transition-transform duration-200"
              onMouseEnter={() => setHoveredAxis(pt.axis)}
              onMouseLeave={() => setHoveredAxis(null)}
              onClick={() => {
                const sMeta = SECTOR_METAS.find(m => m.key === pt.axis);
                if (sMeta) handleSectorClick(sMeta.sectionId);
              }}
            >
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 6.5 : 4.5}
                fill="#12151b"
                stroke={radarPalette.stroke}
                strokeWidth={isHovered ? 2.5 : 1.8}
                className="transition-all duration-200"
              />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 3.5 : 2}
                fill={radarPalette.dotFill}
                className="transition-all duration-200"
              />
            </g>
          );
        })}

        {/* Merkez Ticker Rozeti */}
        <circle cx={cx} cy={cy} r={14} fill="#181c24" stroke="#323846" strokeWidth="1.4" />
        <text
          x={cx}
          y={cy + 3.5}
          textAnchor="middle"
          fill={radarPalette.stroke}
          fontSize={ticker && ticker.trim().length >= 5 ? '7.8' : '9'}
          fontWeight="bold"
          fontFamily="monospace"
        >
          {ticker ? ticker.trim().toUpperCase().slice(0, 5) : 'BIST'}
        </text>

        {/* ========================================================================= */}
        {/* 3. 5 EKSEN DIŞ ETİKETLERİ (VALUE, FUTURE, PAST, HEALTH, DIVIDEND)         */}
        {/* ========================================================================= */}
        {showLabels && SECTOR_METAS.map((meta) => {
          const isHovered = hoveredAxis === meta.key;
          const score = axes[meta.key]?.score ?? 0;

          return (
            <g
              key={`label-${meta.key}`}
              className="cursor-pointer group"
              onMouseEnter={() => setHoveredAxis(meta.key)}
              onMouseLeave={() => setHoveredAxis(null)}
              onClick={() => handleSectorClick(meta.sectionId)}
            >
              {/* Ana Türkçe Başlık (DEĞERLEME, GELECEK, GEÇMİŞ, SAĞLIK, TEMETTÜ) */}
              <text
                x={meta.labelX}
                y={meta.labelY}
                textAnchor={meta.textAnchor}
                fill={isHovered ? '#f5c242' : '#e2e8f0'}
                fontSize="11"
                fontWeight={isHovered ? '900' : '700'}
                fontFamily="system-ui, -apple-system, sans-serif"
                letterSpacing="0.06em"
                className="transition-colors duration-200"
              >
                {meta.labelTr}
              </text>

              {/* Puan ve Türkçe Açıklama Rozeti */}
              <text
                x={meta.labelX}
                y={meta.labelY + 12}
                textAnchor={meta.textAnchor}
                fill={isHovered ? '#fde047' : '#94a3b8'}
                fontSize="9"
                fontWeight="600"
                fontFamily="monospace"
                className="transition-colors duration-200"
              >
                {score}/6 {isHovered ? '• İNCELE' : ''}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover Edildiğinde Canlı İpucu Balonu (Tooltip) */}
      {hoveredAxis && (
        <div className="absolute -bottom-2 bg-slate-900/95 border border-[#f5c242]/40 backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono text-[#f5c242] shadow-xl pointer-events-none animate-in fade-in slide-in-from-bottom-1 duration-150">
          {SECTOR_METAS.find(m => m.key === hoveredAxis)?.labelTr}: {axes[hoveredAxis as keyof typeof axes]?.score}/6 Puan (Detay İçin Tıklayın)
        </div>
      )}
    </div>
  );
}
