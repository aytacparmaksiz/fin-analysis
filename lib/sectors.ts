export type SectorType = 'INSURANCE' | 'BANKING' | 'HOLDING' | 'INDUSTRIAL';

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
  'RAYYS',
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
    text.includes('net aktif değer') ||
    text.includes('iştirak')
  ) {
    return 'HOLDING';
  }

  return 'INDUSTRIAL';
}
