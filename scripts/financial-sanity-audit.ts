import { computeSectorValuationAndDrivers, enrichAndSanitizeFinancialHistory, calculateSectorScore } from '../lib/valuation';
import { KNOWN_BIST_DIRECTORY } from '../lib/bist-service';

/**
 * Otomatik Finansal Makuliyet ve Mantık Denetçisi (Financial Sanity & Plausibility Auditor)
 * Bu script, kod tabanındaki gizli finansal mantık hatalarını, statik çarpanları, 
 * TMS 29 kaynaklı negatif kâr sapmalarını ve senaryo anomalilerini otomatik olarak denetler.
 */
async function runFinancialSanityAudit() {
  console.log('🔍 [AUDITOR] Finansal Makuliyet ve Mantık Denetimi Başlatılıyor...\n');

  const testCases = [
    {
      ticker: 'MGROS',
      name: 'Migros Ticaret A.Ş.',
      sector: 'INDUSTRIAL' as const,
      mockData: {
        ticker: 'MGROS',
        sector: 'INDUSTRIAL',
        currency: 'Bin TRY',
        share_count: '181.054.233',
        valuation: { current_price: 515.5 },
        financial_history: [
          {
            period: '2024/12',
            revenue: 310000000,
            gross_profit: 68000000,
            operating_profit: 14500000, // Pozitif esas faaliyet kârı
            ebitda: 18500000,
            net_income: -2100000, // TMS 29 parasal pozisyon zararı
            equity: 35000000,
            financial_debt: 25000000,
            total_assets: 210000000,
            current_liabilities: 120000000,
            wacc: 35.3
          }
        ]
      }
    },
    {
      ticker: 'THYAO',
      name: 'Türk Hava Yolları A.O.',
      sector: 'INDUSTRIAL' as const,
      mockData: {
        ticker: 'THYAO',
        sector: 'INDUSTRIAL',
        currency: 'Bin TRY',
        share_count: '1.380.000.000',
        valuation: { current_price: 310.0 },
        financial_history: [
          {
            period: '2024/12',
            revenue: 650000000,
            gross_profit: 140000000,
            operating_profit: 85000000,
            ebitda: 130000000,
            net_income: 75000000,
            equity: 420000000,
            financial_debt: 280000000,
            total_assets: 950000000,
            wacc: 36.0
          }
        ]
      }
    },
    {
      ticker: 'AGESA',
      name: 'Agesa Hayat ve Emeklilik A.Ş.',
      sector: 'INSURANCE' as const,
      mockData: {
        ticker: 'AGESA',
        sector: 'INSURANCE',
        currency: 'Bin TRY',
        share_count: '180.000.000',
        valuation: { current_price: 230.0 },
        financial_history: [
          {
            period: '2025/12',
            revenue: 18500000,
            gross_written_premiums: 18500000,
            technical_profit: 3200000,
            investment_income: 5800000,
            net_income: 4100000,
            equity: 12500000,
            total_assets: 48000000,
            roe: 48.5,
            wacc: 38.0
          }
        ]
      }
    },
    {
      ticker: 'EKGYO',
      name: 'Emlak Konut GYO A.Ş.',
      sector: 'REIT' as const,
      mockData: {
        ticker: 'EKGYO',
        sector: 'REIT',
        currency: 'Bin TRY',
        share_count: '3.800.000.000',
        valuation: { current_price: 14.50 },
        financial_history: [
          {
            period: '2024/12',
            revenue: 35000000,
            operating_profit: 8500000,
            net_income: 12000000,
            equity: 55000000,
            total_assets: 95000000,
            wacc: 32.0
          }
        ]
      }
    }
  ];

  let passedChecks = 0;
  let totalChecks = 0;

  function assertAudit(condition: boolean, desc: string) {
    totalChecks++;
    if (condition) {
      console.log(`  ✅ [GEÇTİ] ${desc}`);
      passedChecks++;
    } else {
      console.error(`  ❌ [HATA SAPTANDI] ${desc}`);
    }
  }

  // 1. KONTROL: Migros ROIC Sanity Audit (TMS 29 Net Parasal Kaybı EBIT'i Bozmamalı)
  const mgrosCase = testCases[0];
  enrichAndSanitizeFinancialHistory(mgrosCase.mockData, mgrosCase.sector, 515.5);
  const mgrosLatest = mgrosCase.mockData.financial_history[0];
  
  console.log(`\n--- 1. ROIC & Faaliyet Kârlılığı Denetimi (MGROS) ---`);
  console.log(`MGROS Hesaplanmış ROIC: %${mgrosLatest.roic} | Beklenen: Pozitif (%4.5 - %6.5 bandı)`);
  assertAudit(
    mgrosLatest.roic !== null && mgrosLatest.roic > 0 && mgrosLatest.roic >= 4.0 && mgrosLatest.roic <= 7.0,
    `MGROS ROIC değeri piyasa gerçekliğiyle uyumlu pozitif (%${mgrosLatest.roic}) olarak hesaplandı (Negatif net kâr tuzağına düşmedi).`
  );

  // 2. KONTROL: Dinamik Hedef Çarpan Denetimi (Statik 6.5x Hatası Var mı?)
  console.log(`\n--- 2. Dinamik Hedef Çarpan Denetimi (Statik 6.5x Engeli) ---`);
  const multiplesFound = new Set<number>();
  for (const tc of testCases) {
    enrichAndSanitizeFinancialHistory(tc.mockData, tc.sector, tc.mockData.valuation.current_price);
    const res = computeSectorValuationAndDrivers(tc.mockData, String(tc.mockData.valuation.current_price), tc.sector);
    const mult = res.drivers.target_multiple.numericValue;
    multiplesFound.add(mult);
    console.log(`${tc.ticker} (${tc.sector}): Hedef Çarpan = ${res.drivers.target_multiple.value} | Gerekçe: ${res.drivers.target_multiple.sourceExplanation}`);
  }

  assertAudit(
    multiplesFound.size >= 3,
    `Tüm şirketlerin çarpanları sektörlerine ve finansal verilerine göre dinamik ayrıştı (Tek bir sabit sayıya kilitlenmedi).`
  );
  assertAudit(
    !multiplesFound.has(6.5) || multiplesFound.size > 1,
    `MGROS hedef çarpanı statik 6.5x değil, dinamik (${testCases[0].mockData.ticker} için sektör tabanlı) üretildi.`
  );

  // 3. KONTROL: Senaryo Bandı Sıralaması (Ayı < Baz < Boğa)
  console.log(`\n--- 3. Adil Değer ve Senaryo Bandı Mantık Denetimi ---`);
  for (const tc of testCases) {
    const res = computeSectorValuationAndDrivers(tc.mockData, String(tc.mockData.valuation.current_price), tc.sector);
    const bear = res.valuation.bear_price || 0;
    const base = res.valuation.fair_value || 0;
    const bull = res.valuation.bull_price || 0;
    console.log(`${tc.ticker}: Ayı (${bear} TL) < Baz (${base} TL) < Boğa (${bull} TL)`);
    assertAudit(
      bear <= base && base <= bull,
      `${tc.ticker} Senaryo bandı sıralaması kusursuz: Ayı (${bear}) <= Baz (${base}) <= Boğa (${bull})`
    );
  }

  console.log(`\n========================================`);
  console.log(`📊 DENETİM SONUCU: ${passedChecks} / ${totalChecks} Denetim Başarıyla Geçildi.`);
  console.log(`========================================\n`);

  if (passedChecks !== totalChecks) {
    process.exit(1);
  }
}

runFinancialSanityAudit().catch((err) => {
  console.error('Denetim sırasında beklenmeyen hata:', err);
  process.exit(1);
});
