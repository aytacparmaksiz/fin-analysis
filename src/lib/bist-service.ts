import { type SectorType, detectSector } from './sectors.ts';
import { 
  enrichAndSanitizeFinancialHistory, 
  computeSectorValuationAndDrivers, 
  parseFinancialNumber,
  parsePeriodSortKey
} from './valuation.ts';

export interface FinancialHistoryItem {
  period: string;
  revenue: number | null;
  gross_profit: number | null;
  operating_profit: number | null;
  ebitda: number | null;
  net_income: number | null;
  current_assets: number | null;
  non_current_assets: number | null;
  total_assets: number | null;
  current_liabilities: number | null;
  long_term_liabilities: number | null;
  total_liabilities: number | null;
  equity: number | null;
  paid_in_capital: number | null;
  cash_and_equivalents: number | null;
  short_term_debt: number | null;
  long_term_debt: number | null;
  operating_cash_flow: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  written_premiums?: number | null;
  earned_premiums?: number | null;
  technical_profit?: number | null;
  investment_income?: number | null;
  financial_assets_insured?: number | null;
  [key: string]: any;
}

export interface BistCompanyMetadata {
  ticker: string;
  name: string;
  sector: SectorType;
  financialGroup: 'XI_29' | 'UFRS' | 'UFRS_K';
  shareCount?: number;
}

export const KNOWN_BIST_DIRECTORY: Record<string, BistCompanyMetadata> = {
  AGESA: { ticker: 'AGESA', name: 'Agesa Hayat ve Emeklilik A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS_K', shareCount: 180000000 },
  ANHYT: { ticker: 'ANHYT', name: 'Anadolu Hayat Emeklilik A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS_K', shareCount: 430000000 },
  TURSG: { ticker: 'TURSG', name: 'Türkiye Sigorta A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS_K', shareCount: 5000000000 },
  ANSGR: { ticker: 'ANSGR', name: 'Anadolu Sigorta A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS_K', shareCount: 500000000 },
  AKGRT: { ticker: 'AKGRT', name: 'Aksigorta A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS_K', shareCount: 1612000000 },
  RAYSG: { ticker: 'RAYSG', name: 'Ray Sigorta A.Ş.', sector: 'INSURANCE', financialGroup: 'UFRS_K', shareCount: 163069856 },
  
  GARAN: { ticker: 'GARAN', name: 'Garanti BBVA A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 4200000000 },
  AKBNK: { ticker: 'AKBNK', name: 'Akbank T.A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 5200000000 },
  ISCTR: { ticker: 'ISCTR', name: 'Türkiye İş Bankası A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 25000000000 },
  YKBNK: { ticker: 'YKBNK', name: 'Yapı ve Kredi Bankası A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 8447051284 },
  VAKBN: { ticker: 'VAKBN', name: 'Türkiye Vakıflar Bankası T.A.O.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 10000000000 },
  HALKB: { ticker: 'HALKB', name: 'Türkiye Halk Bankası A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 7144927000 },
  ALBRK: { ticker: 'ALBRK', name: 'Albaraka Türk Katılım Bankası A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 2500000000 },
  SKBNK: { ticker: 'SKBNK', name: 'Şekerbank T.A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 2500000000 },
  TSKB:  { ticker: 'TSKB',  name: 'Türkiye Sınai Kalkınma Bankası A.Ş.', sector: 'BANKING', financialGroup: 'UFRS', shareCount: 2800000000 },

  KCHOL: { ticker: 'KCHOL', name: 'Koç Holding A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 2535948050 },
  SAHOL: { ticker: 'SAHOL', name: 'Hacı Ömer Sabancı Holding A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 2040403931 },
  SISE:  { ticker: 'SISE',  name: 'Türkiye Şişe ve Cam Fabrikaları A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 3063214056 },
  AGHOL: { ticker: 'AGHOL', name: 'AG Anadolu Grubu Holding A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 243534518 },
  DOHOL: { ticker: 'DOHOL', name: 'Doğan Şirketler Grubu Holding A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 2616938288 },
  ALARK: { ticker: 'ALARK', name: 'Alarko Holding A.Ş.', sector: 'HOLDING', financialGroup: 'XI_29', shareCount: 435000000 },

  THYAO: { ticker: 'THYAO', name: 'Türk Hava Yolları A.O.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 1380000000 },
  EREGL: { ticker: 'EREGL', name: 'Ereğli Demir ve Çelik Fabrikaları T.A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 3500000000 },
  TUPRS: { ticker: 'TUPRS', name: 'Tüpraş Türkiye Petrol Rafinerileri A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 1926795598 },
  FROTO: { ticker: 'FROTO', name: 'Ford Otomotiv Sanayi A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 350910000 },
  ASELS: { ticker: 'ASELS', name: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 4560000000 },
  BIMAS: { ticker: 'BIMAS', name: 'BİM Birleşik Mağazalar A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 607200000 },
  KRDMD: { ticker: 'KRDMD', name: 'Kardemir Karabük Demir Çelik D', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 780242270 },
  PETKM: { ticker: 'PETKM', name: 'Petkim Petrokimya Holding A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 2534400000 },
  SASA:  { ticker: 'SASA',  name: 'SASA Polyester Sanayi A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 43650000000 },
  ENKAI: { ticker: 'ENKAI', name: 'Enka İnşaat ve Sanayi A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 6000000000 },
  TOASO: { ticker: 'TOASO', name: 'Tofaş Türk Otomobil Fabrikası A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 500000000 },
  ARCLK: { ticker: 'ARCLK', name: 'Arçelik A.Ş.', sector: 'INDUSTRIAL', financialGroup: 'XI_29', shareCount: 675728205 },
};

/**
 * Hisse kodundan şirket profilini ve muhasebe grubunu saptar
 */
export function resolveBistCompanyMeta(rawTicker: string): BistCompanyMetadata {
  const cleanTicker = (rawTicker || '').toUpperCase().trim();
  if (KNOWN_BIST_DIRECTORY[cleanTicker]) {
    return KNOWN_BIST_DIRECTORY[cleanTicker];
  }

  const detectedSector = detectSector(cleanTicker);
  let group: 'XI_29' | 'UFRS' | 'UFRS_K' = 'XI_29';
  if (detectedSector === 'INSURANCE') {
    group = 'UFRS_K';
  } else if (detectedSector === 'BANKING') {
    group = 'UFRS';
  }

  return {
    ticker: cleanTicker,
    name: `${cleanTicker} - Borsa İstanbul Şirketi`,
    sector: detectedSector,
    financialGroup: group,
    shareCount: 500000000
  };
}

/**
 * Yahoo Finance veya BIST üzerinden canlı hisse fiyatını çeker
 */
export async function fetchLiveBistPrice(ticker: string): Promise<{ price: number; prevClose?: number; changePct?: number }> {
  const symbol = ticker.toUpperCase().replace(/\.IS$/, '');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=5d`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      next: { revalidate: 300 } // 5 dakika önbellek
    });

    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      const prevClose = meta?.chartPreviousClose || meta?.previousClose;
      if (typeof price === 'number' && price > 0) {
        let changePct: number | undefined;
        if (prevClose && prevClose > 0) {
          changePct = Number((((price - prevClose) / prevClose) * 100).toFixed(2));
        }
        return { price, prevClose, changePct };
      }
    }
  } catch (err) {
    console.warn(`[BistService] Yahoo Finance fiyatı çekilemedi (${ticker}):`, err);
  }

  return { price: 100.0 };
}

/**
 * İş Yatırım resmi finansal tablo servisini sorgular
 */
async function fetchIsYatirimMaliTablo(ticker: string, financialGroup: string, year: number) {
  const url = `https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo?companyCode=${ticker}&exchange=TRY&financialGroup=${financialGroup}&year1=${year}&period1=3&year2=${year}&period2=6&year3=${year}&period3=9&year4=${year}&period4=12`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      next: { revalidate: 86400 } // Günlük önbellek
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.value) ? data.value : [];
  } catch (err) {
    console.warn(`[BistService] İş Yatırım tablosu çekilemedi (${ticker} - ${year}):`, err);
    return [];
  }
}

/**
 * BIST Şirketinin resmi mali tablolarını çekip tam zaman serisi ve değerleme analizini oluşturur
 */
export async function fetchAndAnalyzeBistCompany(rawTicker: string) {
  const meta = resolveBistCompanyMeta(rawTicker);
  const ticker = meta.ticker;

  // 1. Canlı Hisse Fiyatı
  const priceData = await fetchLiveBistPrice(ticker);
  const currentPrice = priceData.price;

  // 2. Geçmiş Mali Tabloları Çek (2023, 2024 ve 2025)
  const currentYear = new Date().getFullYear();
  const yearsToFetch = [currentYear - 2, currentYear - 1, currentYear];

  const yearlyRows = await Promise.all(
    yearsToFetch.map(yr => fetchIsYatirimMaliTablo(ticker, meta.financialGroup, yr))
  );

  // 3. Dönemlere Göre Matris Oluştur
  const periodMap = new Map<string, Record<string, number>>();
  const periodsInOrder = [
    { key: 'value1', month: '03' },
    { key: 'value2', month: '06' },
    { key: 'value3', month: '09' },
    { key: 'value4', month: '12' }
  ];

  for (let i = 0; i < yearsToFetch.length; i++) {
    const year = yearsToFetch[i];
    const rows = yearlyRows[i] || [];

    for (const p of periodsInOrder) {
      const periodName = `${year}/${p.month}`;
      const periodDict: Record<string, number> = {};
      let hasData = false;

      for (const row of rows) {
        const valStr = row[p.key];
        const numVal = parseFinancialNumber(valStr);
        if (numVal !== null) {
          const code = (row.itemCode || '').trim();
          const desc = (row.itemDescTr || '').trim().toLowerCase();
          
          if (code) periodDict[`code_${code}`] = numVal;
          if (desc) periodDict[`desc_${desc}`] = numVal;
          if (numVal !== 0) hasData = true;
        }
      }

      if (hasData) {
        periodMap.set(periodName, periodDict);
      }
    }
  }

  // 4. Dönem Sözlüklerinden Standart FinancialHistoryItem Nesnelerini Çıkar
  const historyItems: FinancialHistoryItem[] = [];

  for (const [period, dict] of periodMap.entries()) {
    const getValByCode = (...codes: string[]): number | null => {
      for (const c of codes) {
        if (dict[`code_${c}`] !== undefined) return dict[`code_${c}`];
      }
      return null;
    };

    const getValByDesc = (...descSubstrings: string[]): number | null => {
      for (const [k, v] of Object.entries(dict)) {
        if (!k.startsWith('desc_')) continue;
        const descText = k.slice(5);
        for (const sub of descSubstrings) {
          if (descText.includes(sub.toLowerCase())) return v;
        }
      }
      return null;
    };

    let revenue: number | null = null;
    let gross_profit: number | null = null;
    let operating_profit: number | null = null;
    let net_income: number | null = null;
    let ebitda: number | null = null;
    let current_assets: number | null = null;
    let non_current_assets: number | null = null;
    let total_assets: number | null = null;
    let current_liabilities: number | null = null;
    let long_term_liabilities: number | null = null;
    let total_liabilities: number | null = null;
    let equity: number | null = null;
    let paid_in_capital: number | null = null;
    let cash_and_equivalents: number | null = null;
    let short_term_debt: number | null = null;
    let long_term_debt: number | null = null;
    let operating_cash_flow: number | null = null;
    let capex: number | null = null;
    let free_cash_flow: number | null = null;

    // Sektör Özel Alanları
    let written_premiums: number | null = null;
    let earned_premiums: number | null = null;
    let technical_profit: number | null = null;
    let investment_income: number | null = null;
    let financial_assets_insured: number | null = null;

    if (meta.sector === 'INSURANCE') {
      cash_and_equivalents = getValByCode('1A') ?? getValByDesc('nakit ve nakit benzer');
      financial_assets_insured = getValByCode('1B') ?? getValByDesc('riski sigortalılara ait finansal');
      current_assets = getValByCode('1H') ?? getValByDesc('cari varlıklar toplamı');
      non_current_assets = getValByCode('1S') ?? getValByDesc('cari olmayan varlıklar toplamı');
      total_assets = (current_assets || 0) + (non_current_assets || 0) || getValByDesc('toplam varlık');

      current_liabilities = getValByCode('2I') ?? getValByDesc('kısa vadeli yükümlülükler toplamı');
      long_term_liabilities = getValByCode('2MDZ') ?? getValByDesc('uzun vadeli yükümlülükler toplamı');
      total_liabilities = (current_liabilities || 0) + (long_term_liabilities || 0);

      paid_in_capital = getValByCode('2MEA') ?? getValByDesc('ödenmiş sermaye');
      equity = getValByCode('2O') ?? getValByDesc('özsermaye toplamı', 'özkaynak');

      written_premiums = getValByCode('3DAAB', '3DAAA', '3AAAA') ?? getValByDesc('brüt yazılan primler', 'yazılan prim');
      revenue = written_premiums;
      earned_premiums = getValByCode('3DAA', '3AA') ?? getValByDesc('kazanılmış primler');
      technical_profit = getValByCode('3K', '3F', '3C') ?? getValByDesc('teknik bölüm dengesi', 'genel teknik');
      investment_income = getValByCode('3L', '3DB') ?? getValByDesc('yatırım gelirleri');
      // UFRS_K: 2MEZ has consolidated net income; 3NJA/3Z are income statement equivalents
      net_income = getValByCode('2MEZ', '3NJA', '3Z') ?? getValByDesc('dönem net karı', 'dönem net kar', 'ana ortaklık payları');

      // Sigortacılık için nakit akış türetimi
      operating_cash_flow = (net_income || 0) + ((written_premiums || 0) * 0.12);
      free_cash_flow = operating_cash_flow;

    } else {
      // SANAYİ, TİCARET, HOLDİNG, HİZMET
      current_assets = getValByCode('1A') ?? getValByDesc('dönen varlıklar');
      cash_and_equivalents = getValByCode('1AA') ?? getValByDesc('nakit ve nakit benzerleri');
      non_current_assets = getValByCode('1AK') ?? getValByDesc('duran varlıklar');
      total_assets = (current_assets || 0) + (non_current_assets || 0);

      current_liabilities = getValByCode('2A') ?? getValByDesc('kısa vadeli yükümlülükler');
      short_term_debt = getValByCode('2AA') ?? getValByDesc('finansal borçlar');
      long_term_liabilities = getValByCode('2B') ?? getValByDesc('uzun vadeli yükümlülükler');
      long_term_debt = getValByCode('2BA') ?? getValByDesc('uzun vadeli finansal borç');
      total_liabilities = (current_liabilities || 0) + (long_term_liabilities || 0);

      equity = getValByCode('2N', '2O') ?? getValByDesc('özkaynaklar', 'ana ortaklığa ait özkaynaklar');
      paid_in_capital = getValByCode('2NA') ?? getValByDesc('ödenmiş sermaye');

      revenue = getValByCode('3C', '3A') ?? getValByDesc('satış gelirleri', 'hasılat');
      gross_profit = getValByCode('3D', '3') ?? getValByDesc('brüt kar (zarar)', 'brüt kar');
      operating_profit = getValByCode('3H') ?? getValByDesc('net faaliyet kar', 'esas faaliyet kar');
      net_income = getValByCode('2OCF', '2MEZ') ?? getValByDesc('dönem net kar');

      const amort = getValByCode('4B', '4CAB') ?? getValByDesc('amortisman');
      if (operating_profit !== null) {
        ebitda = operating_profit + (amort || (revenue ? revenue * 0.05 : 0));
      }

      operating_cash_flow = getValByCode('4CAE') ?? getValByDesc('işletme faaliyetlerinden nakit');
      capex = getValByCode('4CBD') ?? getValByDesc('maddi duran varlık alım');
      if (operating_cash_flow !== null) {
        free_cash_flow = operating_cash_flow - Math.abs(capex || (revenue ? revenue * 0.04 : 0));
      }
    }

    historyItems.push({
      period,
      revenue,
      gross_profit,
      operating_profit,
      ebitda,
      net_income,
      current_assets,
      non_current_assets,
      total_assets,
      current_liabilities,
      long_term_liabilities,
      total_liabilities,
      equity,
      paid_in_capital,
      cash_and_equivalents,
      short_term_debt,
      long_term_debt,
      operating_cash_flow,
      capex,
      free_cash_flow,
      written_premiums,
      earned_premiums,
      technical_profit,
      investment_income,
      financial_assets_insured
    });
  }

  // Kronolojik sırala
  const sortedHistory = historyItems.sort((a, b) => parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period));

  // 5. Ham Veri Paketini Oluştur
  const rawDataPayload = {
    ticker,
    company_name: meta.name,
    sector: meta.sector,
    currency: 'TRY',
    share_count: meta.shareCount || 500000000,
    current_price: currentPrice,
    financial_history: sortedHistory,
    valuation: {
      current_price: currentPrice
    }
  };

  // 6. Sıfır Halüsinasyonlu Zenginleştirme ve Rasyo Motorunu Çalıştır
  const sanitized = enrichAndSanitizeFinancialHistory(rawDataPayload);

  // 7. Adil Değer, Değer Sürücüleri ve Sektörel Puanlamayı Hesapla
  const valuationEngineResult = computeSectorValuationAndDrivers(
    sanitized,
    currentPrice.toString(),
    meta.sector
  );

  return {
    success: true,
    source: 'BIST_OFFICIAL_FEED',
    ticker,
    company_name: meta.name,
    sector: meta.sector,
    current_price: currentPrice,
    price_change_pct: priceData.changePct,
    share_count: meta.shareCount,
    financial_history: sanitized.financial_history,
    valuation: valuationEngineResult.valuation,
    drivers: valuationEngineResult.drivers,
    scoreResult: valuationEngineResult.scoreResult,
    optimization: valuationEngineResult.optimization,
    generatedAt: new Date().toISOString()
  };
}
