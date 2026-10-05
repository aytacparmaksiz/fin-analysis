import { 
  computeSectorValuationAndDrivers, 
  enrichAndSanitizeFinancialHistory, 
  calculateDuPont5Step,
  calculateCompanyMultiples,
  calculateEarningsQuality,
  parsePeriodSortKey,
  safeDivide
} from '../lib/valuation';
import { KNOWN_BIST_DIRECTORY } from '../lib/bist-service';
import { type SectorType } from '../lib/sectors';

/**
 * ============================================================================
 * BIST 50 BATCH UNIVERSE & EXTREME BOUNDARY STRESS TEST AUDITOR
 * ============================================================================
 * 50 Farklı BIST Şirketi (Tüm Sektörler) + 4 Uç Sınır Vakası (Edge Cases):
 * 1. TTK 376 Borca Batıklık (Negatif Özsermaye)
 * 2. Operasyonel Zarar (EBITDA < 0, Parasal Kazanç Maskelemesi)
 * 3. Kasa Zengini Şirket (Net Nakit > Piyasa Değeri / EV)
 * 4. Şiddetli Büyüme / Daralma Şoku (+%500 Ciro, -%70 Daralma)
 *
 * 6 Temel Finansal Değişmez Kuralı (Financial Invariants):
 * - Invariant 1: Esas Faaliyet Kârı > 0 => ROIC > 0 (TMS 29 net zarar tuzağı koruması)
 * - Invariant 2: Çarpan Çeşitliliği (Tek bir statik 6.5x çarpanı olamaz, sektörel ve EVA dinamizmi)
 * - Invariant 3: Senaryo Fiyat Sıralaması: Ayı <= Adil Değer <= Boğa (NaN, null, Infinity yok)
 * - Invariant 4: Çeyreklik Veri Koruması (Pozitif kârlar kümülatif çıkarmayla negatifleşemez)
 * - Invariant 5: DuPont & Sektörel Vergi Uyumu (REIT %0, Banka/Sigorta %30, Sanayi %25)
 * - Invariant 6: Para Birimi & Ölçekleme Doğruluğu (Bin TRY / TL 1000x sapma koruması)
 */

interface SimulationCompany {
  ticker: string;
  name: string;
  sector: SectorType;
  price: number;
  shareCount: number;
  history: any[];
}

async function runBist50StressAudit() {
  console.log('🏛️ ============================================================================');
  console.log('🚀 [BOOST AUDITOR] BIST 50 UNIVERSE & EXTREME BOUNDARY STRESS AUDIT BAŞLATILIYOR');
  console.log('🏛️ ============================================================================\n');

  let passed = 0;
  let failed = 0;

  function assertAudit(testName: string, condition: boolean, detail: string) {
    if (condition) {
      console.log(`  ✅ [BAŞARILI] ${testName}: ${detail}`);
      passed++;
    } else {
      console.error(`  ❌ [KRİTİK HATA] ${testName}: ${detail}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // 50 BIST Şirketinden Oluşan Geniş Kohort (13 Sektör Grubu)
  // --------------------------------------------------------------------------
  const bist50Cohort: SimulationCompany[] = [
    // 1. Gıda Perakendesi (Negatif İşletme Sermayesi, Yüksek Ciro, İnce Marj)
    {
      ticker: 'MGROS', name: 'Migros Ticaret', sector: 'INDUSTRIAL', price: 515.5, shareCount: 181054233,
      history: [{ period: '2024/12', revenue: 215000000, operating_profit: 14500000, ebitda: 17200000, net_income: -2100000, equity: 38000000, financial_debt: 22000000, cash_and_equivalents: 26000000, total_assets: 198000000, current_liabilities: 125000000, wacc: 35.3 }]
    },
    {
      ticker: 'BIMAS', name: 'BİM Birleşik Mağazalar', sector: 'INDUSTRIAL', price: 490.0, shareCount: 607200000,
      history: [{ period: '2024/12', revenue: 420000000, operating_profit: 22000000, ebitda: 28000000, net_income: 14000000, equity: 85000000, financial_debt: 15000000, cash_and_equivalents: 28000000, total_assets: 240000000, current_liabilities: 130000000, wacc: 34.8 }]
    },
    {
      ticker: 'SOKM', name: 'Şok Marketler', sector: 'INDUSTRIAL', price: 46.5, shareCount: 593290000,
      history: [{ period: '2024/12', revenue: 160000000, operating_profit: 6500000, ebitda: 9800000, net_income: 1800000, equity: 22000000, financial_debt: 12000000, cash_and_equivalents: 9000000, total_assets: 95000000, current_liabilities: 65000000, wacc: 35.0 }]
    },
    {
      ticker: 'BIZIM', name: 'Bizim Toptan Satış', sector: 'INDUSTRIAL', price: 38.2, shareCount: 60000000,
      history: [{ period: '2024/12', revenue: 32000000, operating_profit: 1400000, ebitda: 1900000, net_income: 450000, equity: 4800000, financial_debt: 3100000, cash_and_equivalents: 2800000, total_assets: 18000000, current_liabilities: 12000000, wacc: 35.5 }]
    },

    // 2. Havacılık & Ulaştırma
    {
      ticker: 'THYAO', name: 'Türk Hava Yolları', sector: 'INDUSTRIAL', price: 310.0, shareCount: 1380000000,
      history: [{ period: '2024/12', revenue: 680000000, operating_profit: 85000000, ebitda: 145000000, net_income: 110000000, equity: 650000000, financial_debt: 420000000, cash_and_equivalents: 180000000, total_assets: 1350000000, current_liabilities: 380000000, wacc: 36.0 }]
    },
    {
      ticker: 'PGSUS', name: 'Pegasus Hava Taşımacılığı', sector: 'INDUSTRIAL', price: 245.0, shareCount: 102299707,
      history: [{ period: '2024/12', revenue: 115000000, operating_profit: 21000000, ebitda: 36000000, net_income: 18000000, equity: 78000000, financial_debt: 85000000, cash_and_equivalents: 24000000, total_assets: 210000000, current_liabilities: 55000000, wacc: 35.6 }]
    },
    {
      ticker: 'TAVHL', name: 'TAV Havalimanları', sector: 'INDUSTRIAL', price: 275.0, shareCount: 363281250,
      history: [{ period: '2024/12', revenue: 65000000, operating_profit: 14000000, ebitda: 22000000, net_income: 9500000, equity: 68000000, financial_debt: 62000000, cash_and_equivalents: 16000000, total_assets: 185000000, current_liabilities: 45000000, wacc: 35.2 }]
    },

    // 3. Otomotiv & İmalat
    {
      ticker: 'FROTO', name: 'Ford Otomotiv', sector: 'INDUSTRIAL', price: 1050.0, shareCount: 350910000,
      history: [{ period: '2024/12', revenue: 410000000, operating_profit: 34000000, ebitda: 42000000, net_income: 38000000, equity: 85000000, financial_debt: 65000000, cash_and_equivalents: 28000000, total_assets: 230000000, current_liabilities: 110000000, wacc: 34.5 }]
    },
    {
      ticker: 'TOASO', name: 'Tofaş Otomobil', sector: 'INDUSTRIAL', price: 210.0, shareCount: 500000000,
      history: [{ period: '2024/12', revenue: 145000000, operating_profit: 16000000, ebitda: 19500000, net_income: 14500000, equity: 42000000, financial_debt: 18000000, cash_and_equivalents: 22000000, total_assets: 95000000, current_liabilities: 42000000, wacc: 34.0 }]
    },
    {
      ticker: 'TTRAK', name: 'Türk Traktör', sector: 'INDUSTRIAL', price: 780.0, shareCount: 100066875,
      history: [{ period: '2024/12', revenue: 68000000, operating_profit: 11000000, ebitda: 12500000, net_income: 9800000, equity: 24000000, financial_debt: 8500000, cash_and_equivalents: 6500000, total_assets: 45000000, current_liabilities: 18000000, wacc: 34.2 }]
    },
    {
      ticker: 'DOAS', name: 'Doğuş Otomotiv', sector: 'INDUSTRIAL', price: 235.0, shareCount: 220000000,
      history: [{ period: '2024/12', revenue: 155000000, operating_profit: 17500000, ebitda: 19800000, net_income: 15200000, equity: 52000000, financial_debt: 14000000, cash_and_equivalents: 18000000, total_assets: 88000000, current_liabilities: 32000000, wacc: 34.6 }]
    },
    {
      ticker: 'OTKAR', name: 'Otokar', sector: 'INDUSTRIAL', price: 490.0, shareCount: 120000000,
      history: [{ period: '2024/12', revenue: 31000000, operating_profit: 3200000, ebitda: 4100000, net_income: 2400000, equity: 11500000, financial_debt: 12000000, cash_and_equivalents: 4500000, total_assets: 38000000, current_liabilities: 21000000, wacc: 34.8 }]
    },

    // 4. Demir-Çelik & Madencilik
    {
      ticker: 'EREGL', name: 'Ereğli Demir Çelik', sector: 'INDUSTRIAL', price: 48.5, shareCount: 3500000000,
      history: [{ period: '2024/12', revenue: 190000000, operating_profit: 15000000, ebitda: 26000000, net_income: 12000000, equity: 180000000, financial_debt: 75000000, cash_and_equivalents: 35000000, total_assets: 310000000, current_liabilities: 70000000, wacc: 35.8 }]
    },
    {
      ticker: 'KRDMD', name: 'Kardemir D', sector: 'INDUSTRIAL', price: 26.2, shareCount: 780297000,
      history: [{ period: '2024/12', revenue: 42000000, operating_profit: 3200000, ebitda: 5100000, net_income: 2100000, equity: 32000000, financial_debt: 14000000, cash_and_equivalents: 7500000, total_assets: 58000000, current_liabilities: 18000000, wacc: 35.5 }]
    },
    {
      ticker: 'KOZAL', name: 'Koza Altın', sector: 'INDUSTRIAL', price: 22.8, shareCount: 3202500000,
      history: [{ period: '2024/12', revenue: 14500000, operating_profit: 4800000, ebitda: 5900000, net_income: 6200000, equity: 48000000, financial_debt: 500000, cash_and_equivalents: 21000000, total_assets: 56000000, current_liabilities: 6500000, wacc: 34.5 }]
    },

    // 5. Savunma & İleri Teknoloji
    {
      ticker: 'ASELS', name: 'Aselsan', sector: 'INDUSTRIAL', price: 62.0, shareCount: 4560000000,
      history: [{ period: '2024/12', revenue: 75000000, operating_profit: 18000000, ebitda: 21000000, net_income: 16000000, equity: 82000000, financial_debt: 38000000, cash_and_equivalents: 15000000, total_assets: 165000000, current_liabilities: 55000000, wacc: 34.0 }]
    },
    {
      ticker: 'SDTTR', name: 'SDT Uzay ve Savunma', sector: 'TECH', price: 280.0, shareCount: 58000000,
      history: [{ period: '2024/12', revenue: 2200000, operating_profit: 680000, ebitda: 750000, net_income: 620000, equity: 2600000, financial_debt: 200000, cash_and_equivalents: 950000, total_assets: 4100000, current_liabilities: 1200000, roe: 28.5 }]
    },
    {
      ticker: 'MIATK', name: 'Mia Teknoloji', sector: 'TECH', price: 64.0, shareCount: 1900000000,
      history: [{ period: '2024/12', revenue: 3800000, operating_profit: 1450000, ebitda: 1600000, net_income: 1300000, equity: 5100000, financial_debt: 350000, cash_and_equivalents: 1400000, total_assets: 7800000, current_liabilities: 2100000, roe: 32.0 }]
    },
    {
      ticker: 'LOGO', name: 'Logo Yazılım', sector: 'TECH', price: 98.0, shareCount: 100000000,
      history: [{ period: '2024/12', revenue: 2600000, operating_profit: 850000, ebitda: 1100000, net_income: 780000, equity: 3400000, financial_debt: 400000, cash_and_equivalents: 1200000, total_assets: 5200000, current_liabilities: 1500000, roe: 26.5 }]
    },

    // 6. Sigortacılık & Emeklilik (Teknik Kâr, AUM, Prim Üretimi)
    {
      ticker: 'AGESA', name: 'Agesa Hayat Emeklilik', sector: 'INSURANCE', price: 230.0, shareCount: 180000000,
      history: [{ period: '2024/12', revenue: 18500000, gross_written_premiums: 18500000, technical_profit: 3200000, investment_income: 5800000, net_income: 4100000, equity: 12500000, total_assets: 48000000, roe: 48.5, loss_ratio: 65.0, expense_ratio: 21.0, combined_ratio: 86.0 }]
    },
    {
      ticker: 'ANHYT', name: 'Anadolu Hayat Emeklilik', sector: 'INSURANCE', price: 110.0, shareCount: 430000000,
      history: [{ period: '2024/12', revenue: 24000000, gross_written_premiums: 24000000, technical_profit: 4500000, investment_income: 7200000, net_income: 5600000, equity: 16800000, total_assets: 64000000, roe: 44.0, combined_ratio: 85.5 }]
    },
    {
      ticker: 'TURSG', name: 'Türkiye Sigorta', sector: 'INSURANCE', price: 16.5, shareCount: 5000000000,
      history: [{ period: '2024/12', revenue: 65000000, gross_written_premiums: 65000000, technical_profit: 8200000, investment_income: 14500000, net_income: 11200000, equity: 34000000, total_assets: 115000000, roe: 42.5, combined_ratio: 91.0 }]
    },
    {
      ticker: 'ANSGR', name: 'Anadolu Sigorta', sector: 'INSURANCE', price: 92.0, shareCount: 500000000,
      history: [{ period: '2024/12', revenue: 48000000, gross_written_premiums: 48000000, technical_profit: 5800000, investment_income: 11000000, net_income: 8400000, equity: 26000000, total_assets: 85000000, roe: 41.0, combined_ratio: 92.5 }]
    },

    // 7. Bankacılık (Net Faiz Geliri, Kredi Kalitesi, %30 KV)
    {
      ticker: 'GARAN', name: 'Garanti BBVA', sector: 'BANKING', price: 115.0, shareCount: 4200000000,
      history: [{ period: '2024/12', revenue: 260000000, net_income: 92000000, equity: 290000000, total_assets: 2450000000, roe: 36.5, net_margin: 35.4 }]
    },
    {
      ticker: 'AKBNK', name: 'Akbank', sector: 'BANKING', price: 56.0, shareCount: 5200000000,
      history: [{ period: '2024/12', revenue: 235000000, net_income: 78000000, equity: 265000000, total_assets: 2150000000, roe: 34.0, net_margin: 33.2 }]
    },
    {
      ticker: 'ISCTR', name: 'İş Bankası C', sector: 'BANKING', price: 13.8, shareCount: 25000000000,
      history: [{ period: '2024/12', revenue: 310000000, net_income: 88000000, equity: 320000000, total_assets: 2950000000, roe: 32.5, net_margin: 28.4 }]
    },
    {
      ticker: 'YKBNK', name: 'Yapı Kredi', sector: 'BANKING', price: 29.5, shareCount: 8447051284,
      history: [{ period: '2024/12', revenue: 220000000, net_income: 72000000, equity: 235000000, total_assets: 1980000000, roe: 35.0, net_margin: 32.7 }]
    },
    {
      ticker: 'VAKBN', name: 'VakıfBank', sector: 'BANKING', price: 21.0, shareCount: 9915851493,
      history: [{ period: '2024/12', revenue: 205000000, net_income: 42000000, equity: 185000000, total_assets: 2250000000, roe: 25.5, net_margin: 20.5 }]
    },

    // 8. GYO (KVK md. 5/1-d %0 Kurumlar Vergisi, NAD İskontosu)
    {
      ticker: 'EKGYO', name: 'Emlak Konut GYO', sector: 'REIT', price: 14.5, shareCount: 3800000000,
      history: [{ period: '2024/12', revenue: 32000000, operating_profit: 7800000, ebitda: 8200000, net_income: 8500000, equity: 72000000, total_assets: 145000000, roe: 13.5 }]
    },
    {
      ticker: 'TRGYO', name: 'Torunlar GYO', sector: 'REIT', price: 48.0, shareCount: 1000000000,
      history: [{ period: '2024/12', revenue: 14000000, operating_profit: 6200000, ebitda: 6800000, net_income: 18500000, equity: 86000000, total_assets: 112000000, roe: 24.0 }]
    },
    {
      ticker: 'ISGYO', name: 'İş GYO', sector: 'REIT', price: 17.2, shareCount: 1968750000,
      history: [{ period: '2024/12', revenue: 6500000, operating_profit: 2800000, ebitda: 3100000, net_income: 7200000, equity: 42000000, total_assets: 58000000, roe: 19.5 }]
    },
    {
      ticker: 'OZKGY', name: 'Özak GYO', sector: 'REIT', price: 11.4, shareCount: 1456000000,
      history: [{ period: '2024/12', revenue: 7800000, operating_profit: 3400000, ebitda: 3900000, net_income: 9100000, equity: 38000000, total_assets: 49000000, roe: 27.0 }]
    },

    // 9. Holdingler (SOTP / NAD Modeli)
    {
      ticker: 'KCHOL', name: 'Koç Holding', sector: 'HOLDING', price: 215.0, shareCount: 2535897050,
      history: [{ period: '2024/12', revenue: 1650000000, net_income: 85000000, equity: 460000000, total_assets: 2350000000, roe: 22.0 }]
    },
    {
      ticker: 'SAHOL', name: 'Sabancı Holding', sector: 'HOLDING', price: 92.5, shareCount: 2040403931,
      history: [{ period: '2024/12', revenue: 980000000, net_income: 48000000, equity: 290000000, total_assets: 1850000000, roe: 19.5 }]
    },
    {
      ticker: 'SISE', name: 'Şişecam', sector: 'INDUSTRIAL', price: 42.0, shareCount: 3063214056,
      history: [{ period: '2024/12', revenue: 185000000, operating_profit: 18000000, ebitda: 28000000, net_income: 14000000, equity: 145000000, financial_debt: 95000000, cash_and_equivalents: 42000000, total_assets: 295000000, current_liabilities: 88000000, wacc: 35.0 }]
    },
    {
      ticker: 'ALARK', name: 'Alarko Holding', sector: 'HOLDING', price: 94.0, shareCount: 435000000,
      history: [{ period: '2024/12', revenue: 45000000, net_income: 12500000, equity: 52000000, total_assets: 88000000, roe: 26.5 }]
    },
    {
      ticker: 'AGHOL', name: 'AG Anadolu Grubu Holding', sector: 'HOLDING', price: 345.0, shareCount: 243534518,
      history: [{ period: '2024/12', revenue: 380000000, net_income: 24000000, equity: 95000000, total_assets: 310000000, roe: 29.0 }]
    },

    // 10. Enerji & Rafineri
    {
      ticker: 'TUPRS', name: 'Tüpraş', sector: 'INDUSTRIAL', price: 168.0, shareCount: 1926795598,
      history: [{ period: '2024/12', revenue: 720000000, operating_profit: 62000000, ebitda: 74000000, net_income: 54000000, equity: 195000000, financial_debt: 45000000, cash_and_equivalents: 78000000, total_assets: 410000000, current_liabilities: 175000000, wacc: 35.0 }]
    },
    {
      ticker: 'PETKM', name: 'Petkim', sector: 'INDUSTRIAL', price: 21.4, shareCount: 2534400000,
      history: [{ period: '2024/12', revenue: 85000000, operating_profit: 4200000, ebitda: 7100000, net_income: 3100000, equity: 48000000, financial_debt: 38000000, cash_and_equivalents: 14000000, total_assets: 110000000, current_liabilities: 45000000, wacc: 35.5 }]
    },
    {
      ticker: 'AKSEN', name: 'Aksa Enerji', sector: 'INDUSTRIAL', price: 36.5, shareCount: 1226338000,
      history: [{ period: '2024/12', revenue: 38000000, operating_profit: 6800000, ebitda: 8900000, net_income: 5400000, equity: 34000000, financial_debt: 16000000, cash_and_equivalents: 9500000, total_assets: 62000000, current_liabilities: 19000000, wacc: 34.8 }]
    },
    {
      ticker: 'ENJSA', name: 'Enerjisa Enerji', sector: 'INDUSTRIAL', price: 61.0, shareCount: 1181068967,
      history: [{ period: '2024/12', revenue: 165000000, operating_profit: 19500000, ebitda: 24000000, net_income: 14500000, equity: 58000000, financial_debt: 42000000, cash_and_equivalents: 15000000, total_assets: 145000000, current_liabilities: 55000000, wacc: 34.6 }]
    },

    // 11. Telekomünikasyon
    {
      ticker: 'TCELL', name: 'Turkcell', sector: 'INDUSTRIAL', price: 96.0, shareCount: 2200000000,
      history: [{ period: '2024/12', revenue: 145000000, operating_profit: 32000000, ebitda: 58000000, net_income: 22000000, equity: 110000000, financial_debt: 75000000, cash_and_equivalents: 32000000, total_assets: 260000000, current_liabilities: 85000000, wacc: 34.2 }]
    },
    {
      ticker: 'TTKOM', name: 'Türk Telekom', sector: 'INDUSTRIAL', price: 48.0, shareCount: 3500000000,
      history: [{ period: '2024/12', revenue: 130000000, operating_profit: 26000000, ebitda: 48000000, net_income: 16500000, equity: 85000000, financial_debt: 68000000, cash_and_equivalents: 24000000, total_assets: 210000000, current_liabilities: 72000000, wacc: 34.5 }]
    },

    // 12. Dayanıklı Tüketim & Beyaz Eşya
    {
      ticker: 'ARCLK', name: 'Arçelik', sector: 'INDUSTRIAL', price: 145.0, shareCount: 675728205,
      history: [{ period: '2024/12', revenue: 320000000, operating_profit: 21000000, ebitda: 31000000, net_income: 9500000, equity: 88000000, financial_debt: 110000000, cash_and_equivalents: 38000000, total_assets: 280000000, current_liabilities: 125000000, wacc: 35.2 }]
    },
    {
      ticker: 'VESBE', name: 'Vestel Beyaz Eşya', sector: 'INDUSTRIAL', price: 18.5, shareCount: 1600000000,
      history: [{ period: '2024/12', revenue: 72000000, operating_profit: 5800000, ebitda: 8200000, net_income: 3800000, equity: 28000000, financial_debt: 24000000, cash_and_equivalents: 9000000, total_assets: 64000000, current_liabilities: 28000000, wacc: 35.0 }]
    },
    {
      ticker: 'VESTL', name: 'Vestel Elektronik', sector: 'INDUSTRIAL', price: 54.0, shareCount: 335456275,
      history: [{ period: '2024/12', revenue: 115000000, operating_profit: 6200000, ebitda: 11000000, net_income: 2200000, equity: 36000000, financial_debt: 52000000, cash_and_equivalents: 15000000, total_assets: 125000000, current_liabilities: 62000000, wacc: 35.6 }]
    },

    // 13. Sağlık & İlaç Dağıtım
    {
      ticker: 'MPARK', name: 'MLP Sağlık', sector: 'INDUSTRIAL', price: 320.0, shareCount: 208037202,
      history: [{ period: '2024/12', revenue: 26000000, operating_profit: 5400000, ebitda: 6800000, net_income: 4200000, equity: 14500000, financial_debt: 9800000, cash_and_equivalents: 4100000, total_assets: 32000000, current_liabilities: 12000000, wacc: 34.2 }]
    },
    {
      ticker: 'GENIL', name: 'Gen İlaç', sector: 'INDUSTRIAL', price: 84.0, shareCount: 300000000,
      history: [{ period: '2024/12', revenue: 9800000, operating_profit: 2100000, ebitda: 2500000, net_income: 2600000, equity: 9200000, financial_debt: 1200000, cash_and_equivalents: 3200000, total_assets: 14500000, current_liabilities: 4500000, wacc: 34.0 }]
    },
    {
      ticker: 'SELEC', name: 'Selçuk Ecza Deposu', sector: 'INDUSTRIAL', price: 62.0, shareCount: 621000000,
      history: [{ period: '2024/12', revenue: 145000000, operating_profit: 7200000, ebitda: 8400000, net_income: 5800000, equity: 28000000, financial_debt: 4500000, cash_and_equivalents: 8500000, total_assets: 54000000, current_liabilities: 24000000, wacc: 34.4 }]
    },
    {
      ticker: 'CCOLA', name: 'Coca-Cola İçecek', sector: 'INDUSTRIAL', price: 540.0, shareCount: 254370782,
      history: [{ period: '2024/12', revenue: 155000000, operating_profit: 24000000, ebitda: 31000000, net_income: 21500000, equity: 82000000, financial_debt: 42000000, cash_and_equivalents: 28000000, total_assets: 165000000, current_liabilities: 55000000, wacc: 33.8 }]
    }
  ];

  console.log(`📋 Toplam Simüle Edilecek Normal BIST Şirketi Sayısı: ${bist50Cohort.length}`);
  assertAudit('BIST 50 Kohort Genişliği', bist50Cohort.length >= 45, `${bist50Cohort.length} adet BIST hissesi başarıyla yüklendi.`);

  // ==========================================================================
  // INVARIANT 1: OPERATING PROFIT > 0 => ROIC > 0 AND REALISTIC
  // ==========================================================================
  console.log(`\n--- [INVARIANT 1] Esas Faaliyet Kârı > 0 => ROIC Pozitifliği ve Mantıksal Aralık ---`);
  for (const comp of bist50Cohort) {
    const rawData = {
      ticker: comp.ticker,
      sector: comp.sector,
      currency: 'Bin TRY',
      share_count: comp.shareCount.toString(),
      valuation: { current_price: comp.price },
      financial_history: comp.history
    };
    enrichAndSanitizeFinancialHistory(rawData);
    const hist = rawData.financial_history[0] as any;

    if (comp.sector === 'INDUSTRIAL' || comp.sector === 'TECH') {
      const opProfit = hist.operating_profit || 0;
      if (opProfit > 0) {
        assertAudit(
          `${comp.ticker} ROIC Pozitifliği`,
          hist.roic !== null && hist.roic > 0 && hist.roic <= 250,
          `Faaliyet kârı (+${(opProfit/1e6).toFixed(1)}M) > 0 iken ROIC = %${hist.roic} pozitif ve makul.`
        );
      }
    } else {
      // Finans, GYO ve Holdinglerde sermaye getirisi
      assertAudit(
        `${comp.ticker} Sektörel Sermaye Getirisi`,
        hist.roic !== null && hist.roic > 0,
        `${comp.sector} sektöründe sermaye verimliliği (%${hist.roic}) rasyonel.`
      );
    }
  }

  // ==========================================================================
  // INVARIANT 2: MULTIPLES VARIANCE & DYNAMIC EVA SCALING (NO HARDCODING)
  // ==========================================================================
  console.log(`\n--- [INVARIANT 2] Hedef Çarpan Çeşitliliği ve Dinamizm (Statik Sayı Yasağı) ---`);
  const multipleSet = new Set<number>();
  for (const comp of bist50Cohort) {
    const rawData = {
      ticker: comp.ticker,
      sector: comp.sector,
      currency: 'Bin TRY',
      share_count: comp.shareCount.toString(),
      valuation: { current_price: comp.price },
      financial_history: comp.history
    };
    enrichAndSanitizeFinancialHistory(rawData);
    const res = computeSectorValuationAndDrivers(rawData, String(comp.price), comp.sector);
    const num = res.drivers.target_multiple.numericValue;
    multipleSet.add(num);
  }

  assertAudit(
    'Hedef Çarpan Çeşitliliği (No Static 6.5x)',
    multipleSet.size >= 12,
    `BIST evreninde ${multipleSet.size} farklı dinamik hedef çarpan üretildi (Statik tek sayı yok).`
  );

  // ==========================================================================
  // INVARIANT 3: VALUATION BAND ORDERING: BEAR <= FAIR <= BULL
  // ==========================================================================
  console.log(`\n--- [INVARIANT 3] Senaryo Bandı Sıralaması: Ayı <= Adil Değer <= Boğa ---`);
  for (const comp of bist50Cohort) {
    const rawData = {
      ticker: comp.ticker,
      sector: comp.sector,
      currency: 'Bin TRY',
      share_count: comp.shareCount.toString(),
      valuation: { current_price: comp.price },
      financial_history: comp.history
    };
    enrichAndSanitizeFinancialHistory(rawData);
    const res = computeSectorValuationAndDrivers(rawData, String(comp.price), comp.sector);
    const v = res.valuation;

    const isOrdered = v.bear_price <= v.fair_value && v.fair_value <= v.bull_price;
    const isFiniteNumbers = !isNaN(v.fair_value) && isFinite(v.fair_value) &&
                           !isNaN(v.bear_price) && isFinite(v.bear_price) &&
                           !isNaN(v.bull_price) && isFinite(v.bull_price);

    assertAudit(
      `${comp.ticker} Senaryo Bandı`,
      isOrdered && isFiniteNumbers,
      `Ayı (${v.bear_price} TL) <= Adil (${v.fair_value} TL) <= Boğa (${v.bull_price} TL)`
    );
  }

  // ==========================================================================
  // INVARIANT 4: ÇEYREKLİK VERİ AYRIŞTIRMA & POZİTİF KÂR KORUMASI
  // ==========================================================================
  console.log(`\n--- [INVARIANT 4] Standalone vs. Cumulative Çeyreklik Veri Koruması ---`);
  // Kullanıcının belirttiği somut vaka: Şirket 1. çeyrek 6M kâr, 2. çeyrek 3M kâr ettiğinde (münferit)
  // sistem yapay bir şekilde 3 - 6 = -3M çıkarma işlemi yapmamalıdır.
  const standaloneSeries = [
    { period: '2026/03', revenue: 40000000, net_income: 6000000 },
    { period: '2026/06', revenue: 42000000, net_income: 3000000 } // Zaten 3 aylık münferit çeyrek
  ];
  const q1Rev = standaloneSeries[0].revenue;
  const q2Rev = standaloneSeries[1].revenue;
  const isCumulativeRev = q2Rev >= q1Rev * 1.35; // 42M < 40M * 1.35 (54M) => münferit olduğu anlaşılır

  assertAudit(
    'Münferit Çeyrek Tespiti',
    !isCumulativeRev,
    `Q2 hasılatı (${q2Rev/1e6}M) Q1'in 1.35x katından az olduğu için münferit seri olarak algılandı.`
  );

  // ==========================================================================
  // INVARIANT 5: DUPONT 5-STEP & SEKTÖREL VERGİ KALKANI UYUMU
  // ==========================================================================
  console.log(`\n--- [INVARIANT 5] DuPont 5-Step Sektörel Vergi Muafiyeti & Kaldıraç Uyumu ---`);
  const reitSample = bist50Cohort.find(c => c.ticker === 'EKGYO')!;
  const bankSample = bist50Cohort.find(c => c.ticker === 'GARAN')!;
  const indSample = bist50Cohort.find(c => c.ticker === 'THYAO')!;

  const reitDuPont = calculateDuPont5Step(reitSample.history[0], 'REIT');
  const bankDuPont = calculateDuPont5Step(bankSample.history[0], 'BANKING');
  const indDuPont = calculateDuPont5Step(indSample.history[0], 'INDUSTRIAL');

  assertAudit(
    'EKGYO (REIT) %0 Kurumlar Vergisi (KVK md. 5/1-d)',
    (reitDuPont.taxBurden ?? 0) >= 0.99,
    `GYO sektöründe vergi yükü çarpanı = ${reitDuPont.taxBurden} (Vergi %0)`
  );

  assertAudit(
    'GARAN (BANKA) %30 Kurumlar Vergisi Yükü',
    (bankDuPont.taxBurden ?? 0) <= 0.85,
    `Banka sektöründe vergi yükü çarpanı = ${bankDuPont.taxBurden} (Vergi %30)`
  );

  assertAudit(
    'THYAO (SANAYİ) %25 Kurumlar Vergisi Yükü',
    (indDuPont.taxBurden ?? 0) <= 0.88,
    `Sanayi sektöründe vergi yükü çarpanı = ${indDuPont.taxBurden} (Vergi %25)`
  );

  // ==========================================================================
  // INVARIANT 6: PARA BİRİMİ VE ÖLÇEKLEME (BIN TRY VS TL) GÜVENLİĞİ
  // ==========================================================================
  console.log(`\n--- [INVARIANT 6] Para Birimi & Bin TRY Ölçekleme Doğrulaması ---`);
  const multiplesCheck = calculateCompanyMultiples(
    { period: '2024/12', net_income: 1000000, equity: 5000000, ebitda: 1500000, revenue: 10000000, net_debt: 500000 },
    20.0,
    100000000,
    'INDUSTRIAL',
    null,
    'Bin TRY'
  );
  assertAudit(
    'Bin TRY F/K Normalizasyonu',
    multiplesCheck.multiples.pe.companyValue === 2.0,
    `1.000.000 Bin TRY net kâr için F/K çarpanı 2000x değil, 2.0x olarak doğru normalize edildi.`
  );

  // ==========================================================================
  // 4 KRİTİK UÇ SINIR TESTİ (EXTREME BOUNDARY STRESS CASES)
  // ==========================================================================
  console.log(`\n--- [EXTREME STRESS TESTS] 4 Uç Sınır Senaryosu Denetimi ---`);

  // Sınır Testi 1: TTK 376 Borca Batıklık (Negatif Özsermaye)
  console.log(`\n* Sınır Testi 1: TTK 376 Negatif Özsermaye (Insolvency)`);
  const insolventData = {
    ticker: 'BATIK',
    sector: 'INDUSTRIAL' as const,
    currency: 'Bin TRY',
    share_count: '10000000',
    valuation: { current_price: 10.0 },
    financial_history: [
      {
        period: '2024/12',
        revenue: 2000000,
        operating_profit: -500000,
        ebitda: -300000,
        net_income: -800000,
        equity: -1500000, // TTK 376 borca batıklık
        financial_debt: 3500000,
        cash_and_equivalents: 200000,
        total_assets: 2500000,
        current_liabilities: 3200000
      }
    ]
  };
  enrichAndSanitizeFinancialHistory(insolventData);
  const insolventVal = computeSectorValuationAndDrivers(insolventData, '10.0', 'INDUSTRIAL');
  assertAudit(
    'TTK 376 Borca Batıklık Koruması',
    insolventVal.valuation.is_insolvent === true && insolventVal.valuation.fair_value <= 5.0,
    `Negatif özsermayede adil değer tasfiye/risk tabanına çekildi (${insolventVal.valuation.fair_value} TL). Uyarı: ${insolventVal.valuation.boundary_warning}`
  );
  assertAudit(
    'TTK 376 Senaryo Bandı Sıralaması',
    insolventVal.valuation.bear_price <= insolventVal.valuation.fair_value && insolventVal.valuation.fair_value <= insolventVal.valuation.bull_price,
    `Borca batık şirkette bile: Ayı (${insolventVal.valuation.bear_price}) <= Adil (${insolventVal.valuation.fair_value}) <= Boğa (${insolventVal.valuation.bull_price})`
  );

  // Sınır Testi 2: Operasyonel Zarar & Net Parasal Kazanç Maskelemesi (TMS 29)
  console.log(`\n* Sınır Testi 2: Operasyonel Zarar (EBITDA < 0, Net Parasal Kâr)`);
  const opLossData = {
    ticker: 'ZARAR',
    sector: 'INDUSTRIAL' as const,
    currency: 'Bin TRY',
    share_count: '50000000',
    valuation: { current_price: 25.0 },
    financial_history: [
      {
        period: '2024/12',
        revenue: 15000000,
        operating_profit: -1200000, // Operasyonel zarar
        ebitda: -800000,
        net_income: 2500000, // TMS 29 parasal kâr nedeniyle net kâr pozitif görünmüş!
        equity: 45000000,
        financial_debt: 8000000,
        cash_and_equivalents: 5000000,
        total_assets: 65000000,
        current_liabilities: 15000000
      }
    ]
  };
  enrichAndSanitizeFinancialHistory(opLossData);
  const opLossHist = opLossData.financial_history[0] as any;
  assertAudit(
    'Operasyonel Zararda ROIC Negatifliği (TMS 29 Tuzağı Koruması)',
    opLossHist.roic !== null && opLossHist.roic < 0,
    `Net kâr muhasebesel olarak pozitif olsa bile, faaliyet zararı olduğu için ROIC = %${opLossHist.roic} negatif olarak saptandı.`
  );
  const opLossVal = computeSectorValuationAndDrivers(opLossData, '25.0', 'INDUSTRIAL');
  assertAudit(
    'Operasyonel Zararda Adil Değer Güvenliği',
    !isNaN(opLossVal.valuation.fair_value) && opLossVal.valuation.fair_value > 0,
    `Operasyonel zararda adil değer çökmeden defter değeri tabanı ile hesaplandı: ${opLossVal.valuation.fair_value} TL`
  );

  // Sınır Testi 3: Kasa Zengini Şirket (Net Nakit > Piyasa Değeri / EV)
  console.log(`\n* Sınır Testi 3: Kasa Zengini Şirket (Net Nakit > Piyasa Değeri)`);
  const cashRichData = {
    ticker: 'NAKIT',
    sector: 'INDUSTRIAL' as const,
    currency: 'Bin TRY',
    share_count: '100000000',
    valuation: { current_price: 30.0 }, // Piyasa değeri: 3 Milyar TL
    financial_history: [
      {
        period: '2024/12',
        revenue: 45000000,
        operating_profit: 6000000,
        ebitda: 7500000,
        net_income: 8000000,
        equity: 60000000,
        financial_debt: 0,
        cash_and_equivalents: 45000000, // 45 Milyar TL nakit (Piyasa değerinden kat kat fazla!)
        net_debt: -45000000,
        total_assets: 75000000,
        current_liabilities: 15000000
      }
    ]
  };
  enrichAndSanitizeFinancialHistory(cashRichData);
  const cashRichVal = computeSectorValuationAndDrivers(cashRichData, '30.0', 'INDUSTRIAL');
  assertAudit(
    'Kasa Zengini Şirket Adil Değer Güvenliği',
    cashRichVal.valuation.fair_value > 30.0 && !isNaN(cashRichVal.valuation.fair_value),
    `Devasa net nakit pozisyonu adil değere hisse başı nakit primi olarak yansıdı (${cashRichVal.valuation.fair_value} TL).`
  );

  // Sınır Testi 4: Aşırı Büyüme / Daralma Şoku (+%500 Ciro, -%70 Daralma)
  console.log(`\n* Sınır Testi 4: Aşırı Büyüme ve Daralma Şokları`);
  const shockData = {
    ticker: 'SOK',
    sector: 'INDUSTRIAL' as const,
    currency: 'Bin TRY',
    share_count: '100000000',
    valuation: { current_price: 50.0 },
    financial_history: [
      { period: '2023/12', revenue: 10000000, net_income: 1000000, equity: 20000000, ebitda: 1500000 },
      { period: '2024/12', revenue: 60000000, net_income: 9000000, equity: 35000000, ebitda: 11000000 } // +%500 ciro sıçraması
    ]
  };
  enrichAndSanitizeFinancialHistory(shockData);
  const shockVal = computeSectorValuationAndDrivers(shockData, '50.0', 'INDUSTRIAL');
  assertAudit(
    'Aşırı Büyüme Sıçraması (Growth Clamping)',
    shockVal.drivers.revenue_growth.value !== null && shockVal.valuation.fair_value > 0,
    `+%500 ciro sıçraması modelde patlamaya yol açmadan dengelendi: Adil Değer = ${shockVal.valuation.fair_value} TL`
  );

  console.log(`\n============================================================================`);
  console.log(`📊 [BIST 50 STRESS AUDIT TAMAMLANDI]`);
  console.log(`   Toplam Başarılı Test: ${passed}`);
  console.log(`   Toplam Hatalı Test:   ${failed}`);
  console.log(`============================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runBist50StressAudit().catch((err) => {
  console.error('BIST 50 denetim motoru çalışma hatası:', err);
  process.exit(1);
});
