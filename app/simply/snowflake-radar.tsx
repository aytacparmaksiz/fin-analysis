'use client';

import React, { useState, useMemo } from 'react';
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
    sectionId: 'sec-rehberlik',
    centerDeg: -18,
    labelX: 250,
    labelY: 104,
    textAnchor: 'start'
  },
  {
    key: 'past',
    labelEn: 'PAST',
    labelTr: 'GEÇMİŞ',
    sectionId: 'sec-gecmis',
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

  const cx = 140;
  const cy = 140;
  const maxR = 95;
  const rMid = 63.3;
  const rIn = 31.7;

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
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          <filter id="sfGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Altın / Sarı Gradyan */}
          <radialGradient id="sfGoldGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fde047" stopOpacity="0.85" />
            <stop offset="60%" stopColor="#f5c242" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#d97706" stopOpacity="0.65" />
          </radialGradient>

          {/* Vurgu (Hover) Gradyanı */}
          <radialGradient id="sfHoverSectorGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#f5c242" stopOpacity="0.12" />
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
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredAxis(meta.key)}
                onMouseLeave={() => setHoveredAxis(null)}
                onClick={() => handleSectorClick(meta.sectionId)}
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
                    fill="url(#sfHoverSectorGrad)"
                    stroke="#f5c242"
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
        {/* 2. DİNAMİK ORGANİK SNOWFLAKE VERİ POLİGONU (ALTIN/SARI ŞEFFAF ALAN)        */}
        {/* ========================================================================= */}
        {smoothRadarPath && (
          <path
            d={smoothRadarPath}
            fill="url(#sfGoldGradient)"
            stroke="#f5c242"
            strokeWidth="2.5"
            strokeLinejoin="round"
            filter="url(#sfGlow)"
            className="transition-all duration-500 pointer-events-none drop-shadow-[0_0_8px_rgba(245,194,66,0.35)]"
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
                stroke="#f5c242"
                strokeWidth={isHovered ? 2.5 : 1.8}
                className="transition-all duration-200"
              />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 3.5 : 2}
                fill="#fde047"
                className="transition-all duration-200"
              />
            </g>
          );
        })}

        {/* Merkez Ticker Rozeti */}
        <circle cx={cx} cy={cy} r={14} fill="#181c24" stroke="#323846" strokeWidth="1.4" />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fill="#f5c242"
          fontSize="9"
          fontWeight="bold"
          fontFamily="monospace"
        >
          {ticker ? ticker.slice(0, 4) : 'BIST'}
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
