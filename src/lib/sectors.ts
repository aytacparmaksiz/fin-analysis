export type SectorType = 'INSURANCE' | 'BANKING' | 'HOLDING' | 'INDUSTRIAL' | 'REIT' | 'TECH';

export interface SectorDefinition {
  id: SectorType;
  title: string;
  badge: string;
  description: string;
  revenueLabel: string;
  revenueSublabel: string;
  operatingProfitLabel: string;
  operatingProfitSublabel: string;
  marginLabel: string;
  marginSublabel: string;
  valuationMultiples: string;
  primaryEfficiencyMetric: string;
}

export interface MetricScoreRule {
  key: string;
  name: string;
  maxScore: number;
  description: string;
}

export interface SectorRiskThresholds {
  criticalDebtRatio?: number; // e.g. Net Debt / EBITDA > 4.0
  minLiquidityRatio?: number; // Current ratio < 1.0
  combinedRatioDanger?: number; // > 102% for Insurance
  nplDanger?: number; // > 5.0% for Banking
  minMarginOfSafety: number; // %20 asgari güvenlik marjı
  idealMarginOfSafety: number; // %30 güçlü emniyet marjı
}

export interface SectorScoringDefinition {
  sector: SectorType;
  categories: [MetricScoreRule, MetricScoreRule, MetricScoreRule, MetricScoreRule];
  riskThresholds: SectorRiskThresholds;
}

export const SECTOR_SCORING_CONFIG: Record<SectorType, SectorScoringDefinition> = {
  INSURANCE: {
    sector: 'INSURANCE',
    categories: [
      { key: 'technical_profitability', name: 'Teknik Kârlılık & Kombine Oran', maxScore: 25, description: 'Hasar/Prim ve Masraf Oranı toplamı (<%95 pozitif teknik kâr)' },
      { key: 'portfolio_yield', name: 'Yatırım Getirisi & Float Gücü', maxScore: 25, description: 'Net finansal gelirler ve yüksek faiz ortamında float portföy verimi' },
      { key: 'capital_adequacy', name: 'Sermaye Yeterliliği & ROE', maxScore: 25, description: 'Özkaynak kârlılığı ve sermaye tamponu' },
      { key: 'premium_growth', name: 'Prim Büyümesi & Pazar Genişlemesi', maxScore: 25, description: 'Brüt yazılan prim ve BES AUM büyüme dinamikleri' },
    ],
    riskThresholds: {
      combinedRatioDanger: 102.0,
      minMarginOfSafety: 20.0,
      idealMarginOfSafety: 30.0,
    },
  },
  BANKING: {
    sector: 'BANKING',
    categories: [
      { key: 'asset_quality', name: 'Kredi Kalitesi & Risk Yönetimi (NPL)', maxScore: 25, description: 'Takipteki alacaklar rasyosu ve karşılık oranları (<%3.0 güçlü)' },
      { key: 'net_interest_margin', name: 'Net Faiz Marjı (NIM) & Fonlama', maxScore: 25, description: 'Kredi-mevduat makası ve fonlama maliyeti yönetimi' },
      { key: 'capital_adequacy', name: 'Sermaye Yeterliliği (SYR) & ROE', maxScore: 25, description: 'BDDK yasal sermaye tamponu (SYR >%14) ve özkaynak verimi' },
      { key: 'fee_efficiency', name: 'Komisyon & Dijital Bankacılık', maxScore: 25, description: 'Faiz dışı gelir üretimi ve operasyonel gider karşılama gücü' },
    ],
    riskThresholds: {
      nplDanger: 5.0,
      minMarginOfSafety: 20.0,
      idealMarginOfSafety: 30.0,
    },
  },
  HOLDING: {
    sector: 'HOLDING',
    categories: [
      { key: 'nav_discount', name: 'Net Aktif Değeri (NAD) İskontosu', maxScore: 25, description: 'Piyasa değeri vs portföy net aktif değeri iskonto cazibesi (>%30)' },
      { key: 'solo_liquidity', name: 'Solo Nakit Gücü & Borçsuzluk', maxScore: 25, description: 'Holding merkezinin solo net nakit fazlası ve likidite esnekliği' },
      { key: 'dividend_yield', name: 'İştirak Temettü Akışı & Verimlilik', maxScore: 25, description: 'İştiraklerden temettü tahsilatı ve sürdürülebilir nakit üretimi' },
      { key: 'nav_growth', name: 'Hisse Başı NAD Büyümesi & Katalizör', maxScore: 25, description: 'Konsolide portföy büyümesi ve halka arz/satış potansiyeli' },
    ],
    riskThresholds: {
      minMarginOfSafety: 20.0,
      idealMarginOfSafety: 30.0,
    },
  },
  REIT: {
    sector: 'REIT',
    categories: [
      { key: 'nav_discount', name: 'Net Aktif Değeri (NAD) İskontosu', maxScore: 25, description: 'Portföy NAD / Piyasa Değeri iskontosu (%25-%40 üzeri cazip)' },
      { key: 'debt_ltv', name: 'Finansal Borç / Portföy (LTV Oranı)', maxScore: 25, description: 'Finansal Borç / Aktif oranı (<%40 sağlıklı sermaye tamponu)' },
      { key: 'rental_ffo_yield', name: 'Kira Akışı & FFO Verimi', maxScore: 25, description: 'Düzenli kira gelirleri ve operasyonel nakit üretimi (FFO)' },
      { key: 'revaluation_growth', name: 'Portföy Büyümesi & Ekspertiz Değeri', maxScore: 25, description: 'Yıl sonu gayrimenkul ekspertiz ve proje portföyü reel büyümesi' },
    ],
    riskThresholds: {
      criticalDebtRatio: 3.5,
      minLiquidityRatio: 0.9,
      minMarginOfSafety: 20.0,
      idealMarginOfSafety: 30.0,
    },
  },
  TECH: {
    sector: 'TECH',
    categories: [
      { key: 'rule_of_40', name: 'Rule of 40 (Büyüme + FCF Marjı)', maxScore: 25, description: 'Hasılat artışı + Serbest Nakit Akışı marjı toplamı (>= %40 dünya standardı)' },
      { key: 'gross_margin_software', name: 'Yüksek Brüt Kâr Marjı', maxScore: 25, description: 'Yazılım ve lisanslama kârlılığı (>= %50 güçlü fiyatlama kalkanı)' },
      { key: 'net_cash_cushion', name: 'Net Nakit Pozisyonu & Borçsuzluk', maxScore: 25, description: 'Teknoloji şirketlerinde negatif net borç (güçlü net nakit fazlası)' },
      { key: 'capital_efficiency_roic', name: 'Sermaye Verimliliği (ROIC & ROE)', maxScore: 25, description: 'Hafif varlık yapısı (Asset-light) ve yüksek yatırılan sermaye getirisi' },
    ],
    riskThresholds: {
      criticalDebtRatio: 2.0,
      minLiquidityRatio: 1.5,
      minMarginOfSafety: 20.0,
      idealMarginOfSafety: 30.0,
    },
  },
  INDUSTRIAL: {
    sector: 'INDUSTRIAL',
    categories: [
      { key: 'financial_health', name: 'Finansal Sağlık & Likidite', maxScore: 25, description: 'Cari oran (>1.2) ve Net Borç / FAVÖK (<2.5x) emniyet seviyeleri' },
      { key: 'capital_efficiency', name: 'Sermaye Verimliliği (ROIC > WACC)', maxScore: 25, description: 'Yatırılan sermaye getirisinin ağırlıklı sermaye maliyetini aşması' },
      { key: 'cash_flow_quality', name: 'Nakit Akış Kalitesi (OCF & FCF)', maxScore: 25, description: 'Kârın serbest nakde dönüşümü (Makyajsız bilanço ve Buffett Kazancı)' },
      { key: 'growth_moat', name: 'Reel Büyüme & Rekabet Kalkanı (Moat)', maxScore: 25, description: 'Hasılat artışı, fiyatlama gücü ve FAVÖK marjı stabilitesi' },
    ],
    riskThresholds: {
      criticalDebtRatio: 4.0,
      minLiquidityRatio: 1.0,
      minMarginOfSafety: 20.0,
      idealMarginOfSafety: 30.0,
    },
  },
};

export const SECTOR_DEFINITIONS: Record<SectorType, SectorDefinition> = {
  INSURANCE: {
    id: 'INSURANCE',
    title: 'Sigortacılık & Bireysel Emeklilik',
    badge: 'Sigorta / Emeklilik Modu',
    description: 'Sigorta şirketlerinde klasik hasılat ve FAVÖK bulunmaz. Prim üretimi, teknik bölüm dengesi, kombine oran ve portföy yatırım gelirleri esastır.',
    revenueLabel: 'Prim Üretimi (Brüt Primler)',
    revenueSublabel: 'Brüt Yazılan Primler ve Teknik Gelirler Toplamı',
    operatingProfitLabel: 'Teknik Bölüm Dengesi / Kârı',
    operatingProfitSublabel: 'Sigortacılık ve Hayat/Emeklilik Esas Faaliyet Kârı',
    marginLabel: 'Kombine Oran / Portföy Getirisi',
    marginSublabel: 'Hasar/Prim + Masraf Oranı (Teknik Kârlılık)',
    valuationMultiples: 'PD/DD (Fiyat/Defter Değeri) & F/K',
    primaryEfficiencyMetric: 'Özkaynak Kârlılığı (ROE %)',
  },
  BANKING: {
    id: 'BANKING',
    title: 'Bankacılık & Finans',
    badge: 'Banka / Finans Modu',
    description: 'Bankalarda faiz gelirleri, net faiz marjı (NIM), komisyon gelirleri, kredi/mevduat kalitesi ve sermaye yeterlilik rasyosu (SYR) esastır.',
    revenueLabel: 'Net Faiz Geliri (NII)',
    revenueSublabel: 'Kredilerden Alınan Faizler - Mevduat Faiz Giderleri',
    operatingProfitLabel: 'Faaliyet Kârı (Provizyon Öncesi)',
    operatingProfitSublabel: 'Net Faiz + Net Ücret & Komisyon Gelirleri',
    marginLabel: 'Net Faiz Marjı (NIM %)',
    marginSublabel: 'Net Faiz Geliri / Ortalama Faiz Getirili Aktifler',
    valuationMultiples: 'PD/DD & F/K',
    primaryEfficiencyMetric: 'Özkaynak Kârlılığı (ROE %)',
  },
  HOLDING: {
    id: 'HOLDING',
    title: 'Holdingler & Yatırım Şirketleri',
    badge: 'Holding / NAD Modu',
    description: 'Holdinglerde klasik FAVÖK yerine Net Aktif Değeri (NAD / NAV), solo net nakit/borç pozisyonu ve iştirak temettü akışları esastır.',
    revenueLabel: 'Konsolide Hasılat / Portföy Geliri',
    revenueSublabel: 'İştirak Satışları ve Solo Temettü Girişleri',
    operatingProfitLabel: 'Kombine Faaliyet Kârı',
    operatingProfitSublabel: 'Grup Şirketleri Faaliyet Kârı',
    marginLabel: 'Tarihsel NAD İskontosu (%)',
    marginSublabel: 'Piyasa Değeri vs Portföy Net Aktif Değeri',
    valuationMultiples: 'NAD İskontosu & Parçaların Toplamı (SOTP)',
    primaryEfficiencyMetric: 'Hisse Başı NAD Büyümesi',
  },
  REIT: {
    id: 'REIT',
    title: 'Gayrimenkul Yatırım Ortaklığı (GYO)',
    badge: 'GYO / NAD Modu (Vergisiz %0 KV)',
    description: 'GYO’lar 5520 sayılı KVK md. 5/1-d uyarınca Kurumlar Vergisinden MUAFTIR (%0 KV). Net Aktif Değeri (NAD / NAV), LTV borçluluk ve kira/FFO akışı esastır.',
    revenueLabel: 'Kira & Proje Gelirleri (Hasılat)',
    revenueSublabel: 'Düzenli Kira Gelirleri ve Bağımsız Bölüm Satışları',
    operatingProfitLabel: 'Esas Faaliyet Kârı (Ekspertiz Öncesi/Dahil)',
    operatingProfitSublabel: 'Portföy Operasyonel Kârı ve Ekspertiz Kazançları',
    marginLabel: 'Portföy NAD İskontosu (%)',
    marginSublabel: 'Piyasa Değeri vs Gayrimenkul Net Aktif Değeri',
    valuationMultiples: 'P/NAV (Piyasa/NAD), PD/DD & F/K',
    primaryEfficiencyMetric: 'Portföy Büyüklüğü & NAD Büyümesi',
  },
  TECH: {
    id: 'TECH',
    title: 'Teknoloji, Bilişim & Yazılım',
    badge: 'Teknoloji / SaaS & Rule of 40 Modu',
    description: 'Teknoloji şirketlerinde hafif varlık yapısı (Asset-light), Rule of 40 metriği, yüksek brüt kâr marjı ve net nakit pozisyonu esastır.',
    revenueLabel: 'Yazılım & Teknoloji Gelirleri',
    revenueSublabel: 'Lisans, SaaS, Ar-Ge ve Teknoloji Satışları',
    operatingProfitLabel: 'FAVÖK (EBITDA)',
    operatingProfitSublabel: 'Operasyonel Nakit Üretimi',
    marginLabel: 'Brüt Kâr & FCF Marjı (%)',
    marginSublabel: 'Fiyatlama Gücü ve Nakit Dönüşüm Oranı',
    valuationMultiples: 'FD/Satışlar (EV/Sales), FD/FAVÖK & PEG',
    primaryEfficiencyMetric: 'Rule of 40 (Büyüme + FCF Marjı %)',
  },
  INDUSTRIAL: {
    id: 'INDUSTRIAL',
    title: 'Sanayi, Hizmet & Genel Ticaret',
    badge: 'Sanayi / Reel Sektör Modu',
    description: 'Reel sektör şirketlerinde hasılat, FAVÖK marjı, net borç/FAVÖK ve ROIC vs WACC makası esastır.',
    revenueLabel: 'Satış Gelirleri (Hasılat)',
    revenueSublabel: 'Net Satışlar ve Esas Faaliyet Gelirleri',
    operatingProfitLabel: 'FAVÖK (EBITDA)',
    operatingProfitSublabel: 'Faiz, Amortisman ve Vergi Öncesi Operasyonel Kâr',
    marginLabel: 'FAVÖK Marjı (%)',
    marginSublabel: 'FAVÖK / Satış Gelirleri',
    valuationMultiples: 'FD/FAVÖK (EV/EBITDA), F/K & FD/Satışlar',
    primaryEfficiencyMetric: 'ROIC vs WACC Sermaye Makası',
  },
};

export const BIST_INSURANCE_TICKERS = [
  'AGESA',
  'ANHYT',
  'TURSG',
  'ANSGR',
  'AKGRT',
  'RAYSG',
];

export const BIST_BANKING_TICKERS = [
  'GARAN',
  'AKBNK',
  'ISCTR',
  'YKBNK',
  'VAKBN',
  'HALKB',
  'ALBRK',
  'SKBNK',
  'TSKB',
  'QNBFB',
  'KLNMA',
  'ICBCT',
];

export const BIST_HOLDING_TICKERS = [
  'KCHOL',
  'SAHOL',
  'AGHOL',
  'DOHOL',
  'ALARK',
  'TKFEN',
  'SISE',
  'BERA',
  'GSDHO',
  'GLYHO',
  'VERUS',
  'GOZDE',
];

export const BIST_REIT_TICKERS = [
  'EKGYO',
  'TRGYO',
  'ISGYO',
  'SNGYO',
  'OZKGY',
  'KLGYO',
  'VKGYO',
  'KZBGY',
  'PSGYO',
  'YKGYO',
  'ALGYO',
  'HLGYO',
  'PEKGY',
  'RYGYO',
  'AKFGY',
  'DGGYO',
  'MRGYO',
  'KGYO',
  'MSGYO',
  'ZRGYO',
  'BASGZ',
];

export const BIST_TECH_TICKERS = [
  'LOGO',
  'MIATK',
  'VBTYZ',
  'ARDYZ',
  'KFEIN',
  'FONET',
  'SMART',
  'LINK',
  'SDTTR',
  'KONTSE',
  'REEDR',
  'MOBTL',
  'HTTBT',
  'PKART',
  'PAPIL',
  'INDES',
  'DGATE',
  'DESPC',
  'ALCTL',
  'NETAS',
  'EDATA',
  'OBAMS',
  'EFORC',
  'BINHO',
];

export function detectSector(ticker: string, contextText = ''): SectorType {
  const normTicker = (ticker || '').toUpperCase().trim();
  if (BIST_INSURANCE_TICKERS.includes(normTicker)) {
    return 'INSURANCE';
  }
  if (BIST_BANKING_TICKERS.includes(normTicker)) {
    return 'BANKING';
  }
  if (BIST_HOLDING_TICKERS.includes(normTicker)) {
    return 'HOLDING';
  }
  if (BIST_REIT_TICKERS.includes(normTicker)) {
    return 'REIT';
  }
  if (BIST_TECH_TICKERS.includes(normTicker)) {
    return 'TECH';
  }

  const text = (normTicker + ' ' + contextText).toLowerCase();
  if (
    text.includes('sigorta') ||
    text.includes('emeklilik') ||
    text.includes('hayat') ||
    text.includes('hasar/prim') ||
    text.includes('kombine oran') ||
    text.includes('teknik denge') ||
    text.includes('teknik karşılık') ||
    text.includes('yazılan prim') ||
    text.includes('reasürans')
  ) {
    return 'INSURANCE';
  }

  if (
    text.includes('banka') ||
    text.includes('katılım') ||
    text.includes('net faiz marjı') ||
    text.includes('mevduat') ||
    text.includes('kredi mevduat')
  ) {
    return 'BANKING';
  }

  if (
    text.includes('holding') ||
    text.includes('yatırımlar') ||
    text.includes('iştirak')
  ) {
    return 'HOLDING';
  }

  if (
    text.includes('gyo') ||
    text.includes('gayrimenkul yatırım') ||
    text.includes('reit') ||
    text.includes('kira geliri') ||
    text.includes('gayrimenkul portföy')
  ) {
    return 'REIT';
  }

  if (
    text.includes('yazılım') ||
    text.includes('teknoloji') ||
    text.includes('bilişim') ||
    text.includes('software') ||
    text.includes('saas') ||
    text.includes('ar-ge')
  ) {
    return 'TECH';
  }

  return 'INDUSTRIAL';
}
