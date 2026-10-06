import {
  enrichAndSanitizeFinancialHistory,
  calculateSectorScore,
  optimizeFinalDecision,
  computeSectorValuationAndDrivers
} from '../lib/valuation.ts';

interface CompanyTestCase {
  ticker: string;
  name: string;
  sector: 'INDUSTRIAL' | 'INSURANCE' | 'BANKING' | 'HOLDING' | 'REIT' | 'TECH';
  financialHistory: any[];
}

const testCompanies: CompanyTestCase[] = [
  {
    ticker: 'BIMAS',
    name: 'BİM Birleşik Mağazalar',
    sector: 'INDUSTRIAL',
    financialHistory: [
      {
        period: '2026/06',
        revenue: 250000000,
        operating_profit: 12500000,
        equity: 45000000,
        net_debt: -5000000, // Net nakit
        financial_debt: 2000000,
        cash_and_equivalents: 7000000,
        current_liabilities: 80000000, // Perakendede yüksek ticari borç
        total_assets: 135000000,
        ebitda: 17000000,
        operating_cash_flow: 18000000,
        free_cash_flow: 12000000,
        net_income: 9000000,
        is_tms29: true,
      }
    ]
  },
  {
    ticker: 'FROTO',
    name: 'Ford Otomotiv Sanayi',
    sector: 'INDUSTRIAL',
    financialHistory: [
      {
        period: '2026/06',
        revenue: 210000000,
        operating_profit: 22000000,
        equity: 60000000,
        net_debt: 25000000, // Borçlu otomotiv
        financial_debt: 38000000,
        cash_and_equivalents: 13000000,
        total_assets: 150000000,
        ebitda: 26000000,
        operating_cash_flow: 20000000,
        free_cash_flow: 14000000,
        net_income: 18000000,
        is_tms29: true,
      }
    ]
  },
  {
    ticker: 'LOGO',
    name: 'Logo Yazılım',
    sector: 'TECH',
    financialHistory: [
      {
        period: '2026/06',
        revenue: 2500000,
        gross_profit: 2100000, // Yüksek brüt marj
        gross_margin: 84.0,
        operating_profit: 850000,
        equity: 4000000,
        net_debt: -1200000, // Net nakit zengini yazılım
        financial_debt: 100000,
        cash_and_equivalents: 1300000,
        total_assets: 5800000,
        ebitda: 1000000,
        operating_cash_flow: 950000,
        free_cash_flow: 800000,
        net_income: 700000,
        roe: 35.0,
        is_tms29: true,
      }
    ]
  },
  {
    ticker: 'EKGYO',
    name: 'Emlak Konut GYO',
    sector: 'REIT',
    financialHistory: [
      {
        period: '2026/06',
        revenue: 22000000,
        operating_profit: 4500000,
        equity: 42000000,
        net_debt: 6000000,
        financial_debt: 12000000,
        cash_and_equivalents: 6000000,
        total_assets: 75000000,
        pb: 0.65, // %35 NAD iskontosu
        operating_cash_flow: 4000000,
        net_income: 4200000,
        is_tms29: true,
      }
    ]
  },
  {
    ticker: 'AGESA',
    name: 'Agesa Hayat ve Emeklilik',
    sector: 'INSURANCE',
    financialHistory: [
      {
        period: '2026/06',
        written_premiums: 12000000,
        revenue: 12000000,
        technical_balance: 3200000,
        investment_income: 2800000,
        equity: 12000000,
        net_income: 4500000,
        combined_ratio: 84.5,
        roe: 75.0,
        is_tms29: false, // Sigortacılık TMS 29 muaf
      }
    ]
  },
  {
    ticker: 'GARAN',
    name: 'Garanti BBVA',
    sector: 'BANKING',
    financialHistory: [
      {
        period: '2026/06',
        revenue: 95000000,
        net_interest_income: 55000000,
        operating_income: 62000000,
        equity: 240000000,
        net_income: 48000000,
        nim: 5.8,
        npl_ratio: 1.8,
        car_ratio: 17.5,
        roe: 40.0,
        is_tms29: false, // Bankacılık TMS 29 muaf
      }
    ]
  },
  {
    ticker: 'MPARK',
    name: 'MLP Sağlık Hizmetleri',
    sector: 'INDUSTRIAL',
    financialHistory: [
      {
        period: '2026/06',
        revenue: 28000000,
        operating_profit: 5200867,
        equity: 46379086,
        net_debt: 4936903,
        financial_debt: 8500000,
        cash_and_equivalents: 3563097,
        lease_liabilities: 8300011,
        total_assets: 75200000,
        current_liabilities: 18000000,
        ebitda: 6500000,
        operating_cash_flow: 5000000,
        free_cash_flow: 3500000,
        net_income: 4200000,
        is_tms29: true,
      }
    ]
  }
];

console.log('='.repeat(90));
console.log('ÇAPRAZ SEKTÖR FİNANSAL MANTIK VE TUTARLILIK DENETİMİ (CROSS-SECTOR AUDIT)');
console.log('='.repeat(90));

for (const tc of testCompanies) {
  const enriched = enrichAndSanitizeFinancialHistory({
    ticker: tc.ticker,
    sector: tc.sector,
    financial_history: tc.financialHistory
  });

  const latest = enriched.financial_history[0];
  const scoreResult = calculateSectorScore({
    ticker: tc.ticker,
    financial_history: enriched.financial_history
  }, tc.sector);

  const optimization = optimizeFinalDecision({
    rawDecision: 'AL',
    score: scoreResult.totalScore,
    valuation: { current_price: 100, fair_value: 145, discount_pct: 45 },
    latestData: latest,
    sector: tc.sector,
    scoreResult
  });

  console.log(`\n🏢 ${tc.ticker} (${tc.name}) [Sektör: ${tc.sector}]`);
  console.log(`   TMS 29: ${latest.is_tms29 ? 'Aktif (Reel Hesaplama)' : 'Muaf (Nominal Hesaplama)'}`);
  console.log(`   ROIC / ROE: %${latest.roic != null ? latest.roic : '—'}${latest.roic_tfrs16 ? ` (TFRS 16 Dahil: %${latest.roic_tfrs16})` : ''}`);
  console.log(`   Nominal WACC: %${latest.nominal_wacc ?? latest.wacc} | Reel WACC: %${latest.real_wacc ?? '—'}`);
  console.log(`   EVA Makası: ${latest.eva_spread > 0 ? '+' : ''}${latest.eva_spread} Puan (${latest.eva_spread >= 0 ? '🟢 Pozitif Değer Üretiyor' : '🔴 Sermaye Erozyonu'})`);
  console.log(`   Temel Skor: ${scoreResult.totalScore}/100 | Karar: ${optimization.finalDecision} (Override: ${optimization.overrideApplied ? optimization.overrideReason : 'Yok'})`);

  // Assertion kontrolleri
  if (tc.sector === 'BANKING' || tc.sector === 'INSURANCE') {
    if (latest.roic !== latest.roe) {
      console.error(`   ❌ HATA: Finansal sektörde ROIC ROE'ye eşit olmalıydı!`);
    }
  } else {
    if (typeof latest.roic !== 'number' || isNaN(latest.roic) || latest.roic <= 0) {
      console.error(`   ❌ HATA: ${tc.ticker} için ROIC pozitif ve sayı olmalıydı!`);
    }
  }

  if (latest.is_tms29) {
    if (!latest.real_wacc || latest.real_wacc >= latest.nominal_wacc) {
      console.error(`   ❌ HATA: TMS 29 altında Reel WACC (%${latest.real_wacc}) Nominal WACC'tan (%${latest.nominal_wacc}) düşük olmalıdır!`);
    }
  }
}

console.log('\n' + '='.repeat(90));
console.log('TÜM TESTLER TAMAMLANDI.');
console.log('='.repeat(90));
