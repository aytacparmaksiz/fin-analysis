import { OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE } from './isyatirim-multiples-cache.ts';

export type SectorType = 
  | 'INDUSTRIAL'
  | 'AVIATION'
  | 'BANKING'
  | 'INSURANCE'
  | 'HOLDING'
  | 'REIT'
  | 'RETAIL'
  | 'UTILITIES_TELCO'
  | 'FINANCIAL_SERVICES'
  | 'HEALTHCARE'
  | 'TECH';

export const SECTOR_TYPE_NAMES: Record<string, string> = {
  AVIATION: 'Havacılık',
  BANKING: 'Bankacılık',
  INSURANCE: 'Sigortacılık',
  HOLDING: 'Holding',
  REIT: 'Gayrimenkul (GYO)',
  RETAIL: 'Perakende',
  UTILITIES_TELCO: 'Enerji & Telekom',
  HEALTHCARE: 'Sağlık & İlaç',
  TECH: 'Teknoloji & Yazılım',
  FINANCIAL_SERVICES: 'Finansal Hizmetler',
  INDUSTRIAL: 'Sanayi & İmalat',
};

export const ISYATIRIM_53_OFFICIAL_SECTOR_NAMES: string[] = [
  'Aracı Kurumlar',
  'Bankacılık',
  'Bilgisayar Toptancılığı',
  'Boya',
  'Cam Sanayii',
  'Dayanıklı Tüketim',
  'Demir-Çelik Döküm',
  'Demir-Çelik Temel',
  'Deri Giyim',
  'Elektrik - Doğalgaz Dağıtım',
  'Elektrik Enerji Ürt.Teçh/Tesis Kurulum',
  'Elektrik Üretim',
  'Endüstriyel Makine -Teçhizat Üretim',
  'Endüstriyel Tekstil',
  'Eğlence Hizmetleri',
  'Fin.Kiralama ve Faktoring',
  'GYO',
  'Gıda',
  'Gıda & Ticaret Perakende',
  'Havacılık',
  'Hayvancılık',
  'Holding',
  'Kablo',
  'Kağıt Ürünleri',
  'Kimyasal Ürün',
  'Kırtasiye',
  'Madencilik',
  'Medya',
  'Meşrubat / İçecek',
  'Mobilya',
  'Otomotiv',
  'Otomotiv Lastiği',
  'Otomotiv Parçası',
  'Pazarlama',
  'Petrol',
  'Savunma',
  'Sağlık ve İlaç',
  'Seramik',
  'Sigortacılık',
  'Spor',
  'Tarım Kimyasalları',
  'Teknoloji',
  'Tekstil Entegre',
  'Turizm',
  'Ulaştırma-Lojistik',
  'Varlık Yönetim',
  'Yatırım Ortaklıkları',
  'Çimento',
  'İletişim',
  'İletişim Cihazları',
  'İnşaat Malzemeleri',
  'İnşaat- Taahhüt',
  'Diğer'
];

export const BIST_COMPANY_SPECIFIC_SECTOR: Record<string, string> = {
  // Havacılık
  THYAO: 'Havacılık',
  PGSUS: 'Havacılık',
  TAVHL: 'Havalimanı & Hizmet',
  CLEBI: 'Yer Hizmetleri',
  
  // Otomotiv
  FROTO: 'Otomotiv Sanayii',
  TOASO: 'Otomotiv Sanayii',
  TTRAK: 'Traktör & Ziraat Mak.',
  DOAS: 'Otomotiv Distribütörlük',
  OTKAR: 'Ticari & Zırhlı Araç',
  BFREN: 'Fren & Parça Sanayii',
  BRISA: 'Lastik Sanayii',
  GOODY: 'Lastik Sanayii',
  TMSN: 'Motor & Traktör',

  // Savunma
  ASELS: 'Savunma Sanayii',
  SDTTR: 'Savunma Teknolojileri',
  ALTNY: 'Savunma Teknolojileri',
  PAPIL: 'Güvenlik & Biyometri',

  // Rafineri & Kimya
  TUPRS: 'Petrol & Rafineri',
  PETKM: 'Petrokimya',
  AYGAZ: 'LPG Dağıtım',
  SASA: 'Polyester & Elyaf',
  HEKTS: 'Tarım Kimyasalları',
  BAGFS: 'Gübre Sanayii',
  GUBRF: 'Gübre Sanayii',
  EGPRO: 'Plastik Profil',
  ALKIM: 'Kimya Sanayii',

  // Demir-Çelik & Metal
  EREGL: 'Demir-Çelik',
  KRDMD: 'Demir-Çelik',
  KRDMA: 'Demir-Çelik',
  KRDMB: 'Demir-Çelik',
  ISDMR: 'Demir-Çelik',
  CEMTS: 'Vasıflı Çelik',
  BUCIM: 'Çimento & Çelik',

  // Cam
  SISE: 'Cam Sanayii',

  // Perakende & Tüketim
  BIMAS: 'Gıda Perakende',
  MGROS: 'Gıda Perakende',
  SOKM: 'Gıda Perakende',
  BIZIM: 'Toptan & Perakende',

  // Dayanıklı Tüketim
  ARCLK: 'Beyaz Eşya & Elektronik',
  VESBE: 'Beyaz Eşya Sanayii',
  VESTL: 'Tüketici Elektroniği',

  // Sağlık & İlaç
  MPARK: 'Sağlık & Hastanecilik',
  GENIL: 'İlaç & Sağlık',
  SELEC: 'İlaç Dağıtım',
  TRILC: 'İlaç Sanayii',
  DEVA: 'İlaç Sanayii',
  ECZYT: 'Sağlık & İlaç Yatırım',

  // GYO
  EKGYO: 'Gayrimenkul (GYO)',
  TRGYO: 'Gayrimenkul (GYO)',
  ISGYO: 'Gayrimenkul (GYO)',
  OZKGY: 'Gayrimenkul (GYO)',
  SNGYO: 'Gayrimenkul (GYO)',
  VKGYO: 'Gayrimenkul (GYO)',
  ALGYO: 'Gayrimenkul (GYO)',
  KLGYO: 'Gayrimenkul (GYO)',
  RYGYO: 'Gayrimenkul (GYO)',
  KZGYO: 'Gayrimenkul (GYO)',

  // Sigorta
  AGESA: 'Sigortacılık & BES',
  ANHYT: 'Sigortacılık & BES',
  TURSG: 'Sigortacılık',
  ANSGR: 'Sigortacılık',
  AKGRT: 'Sigortacılık',
  RAYSG: 'Sigortacılık',

  // Banka
  GARAN: 'Bankacılık',
  AKBNK: 'Bankacılık',
  ISCTR: 'Bankacılık',
  YKBNK: 'Bankacılık',
  VAKBN: 'Bankacılık',
  HALKB: 'Bankacılık',
  ALBRK: 'Katılım Bankacılığı',
  SKBNK: 'Bankacılık',
  TSKB: 'Kalkınma Bankacılığı',

  // Holding
  KCHOL: 'Holding',
  SAHOL: 'Holding',
  AGHOL: 'Holding',
  DOHOL: 'Holding',
  ALARK: 'Holding',
  ENKAI: 'İnşaat & Taahhüt',
  TKFEN: 'Taahhüt & Tarım',

  // Telekomünikasyon
  TCELL: 'Telekomünikasyon',
  TTKOM: 'Telekomünikasyon',

  // Enerji & Elektrik
  AKSEN: 'Enerji Üretim',
  ENJSA: 'Elektrik Dağıtım',
  ASTOR: 'Trafo & Elektrik Ekipman',
  CWENE: 'Güneş Enerjisi',
  EUPWR: 'Elektrik Sistemleri',
  GESAN: 'Elektrik & Mühendislik',
  KONTR: 'Kontrol & Otomasyon',
  GWIND: 'Rüzgar & Yenilenebilir',
  CANTE: 'Termik Enerji',
  ZOREN: 'Enerji',

  // Teknoloji & Yazılım
  LOGO: 'Yazılım & Bilişim',
  MIATK: 'Bilişim & Savunma Yazılım',
  VBTYZ: 'Kurumsal Yazılım',
  ARDYZ: 'Bilişim Teknolojileri',
  FONET: 'Sağlık Bilişim',
  SMART: 'Yazılım Teknolojileri',
  KFEIN: 'Bilişim Hizmetleri',
  REEDR: 'Mobil Teknoloji',

  // Çimento
  OYAKC: 'Çimento Sanayii',
  CIMSA: 'Çimento Sanayii',
  AKCNS: 'Çimento Sanayii',
  NUHCM: 'Çimento Sanayii',

  // Gıda & İçecek
  CCOLA: 'Meşrubat & İçecek',
  AEFES: 'İçecek Sanayii',
  ULKER: 'Gıda & Bisküvi',
  TATGD: 'Konserve & Gıda',
  PNSUT: 'Süt Ürünleri',

  // Madencilik
  KOZAL: 'Altın Madenciliği',
  KOZAA: 'Madencilik',
  IPEKE: 'Doğal Kaynaklar',
};

/**
 * İş Yatırım 53 Resmi Sektör Adını Sistemimizin 11 Temel Değerleme Sektör Tipine Eşler.
 * Kaynak: İş Yatırım Resmi Temel Değerler ve Oranlar Tablosu (630 BIST Şirketinin Tamamı).
 */
export function mapIsYatirimSectorToValuationSector(isySectorName?: string | null): SectorType {
  if (!isySectorName) return 'INDUSTRIAL';
  const s = isySectorName.trim();
  
  if (s === 'Bankacılık') return 'BANKING';
  if (s === 'Sigorta') return 'INSURANCE';
  if (s === 'GYO') return 'REIT';
  if (s === 'Holdingler') return 'HOLDING';
  if (s === 'Havayolları ve Hizm.') return 'AVIATION';
  if (s === 'Perakande - Ticaret' || s === 'Pazarlama') return 'RETAIL';
  if (s === 'Teknoloji' || s === 'Bilgisayar Toptancılığı' || s === 'İletişim Cihazları') return 'TECH';
  if (s === 'Sağlık ve İlaç') return 'HEALTHCARE';
  if (
    s === 'Elektrik Üretim' || 
    s === 'Elektrik - Doğalgaz Dağıtım' || 
    s === 'Elektrik Enerji Ürt.Teçh/Tesis Kurulum' || 
    s === 'İletişim'
  ) {
    return 'UTILITIES_TELCO';
  }
  if (
    s === 'Fin.Kiralama ve Faktoring' || 
    s === 'Aracı Kurumlar' || 
    s === 'Varlık Yönetim' || 
    s === 'Yatırım Ortaklıkları'
  ) {
    return 'FINANCIAL_SERVICES';
  }
  
  // Geri kalan tüm reel üretim, imalat ve sanayi sektörleri:
  // Cam, Çimento, Demir-Çelik Temel, Demir-Çelik Döküm, Otomotiv, Otomotiv Parçası, Otomotiv Lastiği,
  // Savunma, Kimyasal Ürün, Tarım Kimyasalları, Petrol, Madencilik, Seramik, Boya, Kablo, Kağıt Ürünleri,
  // Mobilya, Dayanıklı Tüketim, Endüstriyel Makine -Teçhizat Üretim, Endüstriyel Tekstil, Tekstil Entegre,
  // Deri Giyim, Gıda, Meşrubat / İçecek, Hayvancılık, İnşaat Malzemeleri, İnşaat- Taahhüt, Ulaştırma-Lojistik,
  // Turizm, Medya, Kırtasiye, Spor, Eğlence Hizmetleri, Diğer
  return 'INDUSTRIAL';
}

/**
 * Şirketin Borsa İstanbul'daki resmi sektör adını kullanıcı dostu Türkçe olarak döndürür.
 * Asla jenerik 'BIST' döndürmez. Öncelikli olarak İş Yatırım resmi veritabanından çeker.
 */
export function getCompanySectorDisplayName(ticker?: string, rawSector?: string): string {
  if (ticker) {
    const cleanTicker = ticker.trim().toUpperCase().replace(/\.IS$/i, '');
    const isy = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[cleanTicker];
    if (isy && isy.sectorName) {
      if (isy.sectorName === 'Havayolları ve Hizm.') return 'Havacılık';
      if (isy.sectorName === 'Perakande - Ticaret') return 'Gıda & Ticaret Perakende';
      if (isy.sectorName === 'Holdingler') return 'Holding';
      if (isy.sectorName === 'Sigorta') return 'Sigortacılık';
      if (isy.sectorName === 'Cam') return 'Cam Sanayii';
      return isy.sectorName;
    }
    if (BIST_COMPANY_SPECIFIC_SECTOR[cleanTicker]) {
      return BIST_COMPANY_SPECIFIC_SECTOR[cleanTicker];
    }
  }

  if (rawSector) {
    const cleanSector = rawSector.trim();
    const upperSector = cleanSector.toUpperCase();
    if (SECTOR_TYPE_NAMES[upperSector]) {
      return SECTOR_TYPE_NAMES[upperSector];
    }
    if (cleanSector !== 'BIST' && upperSector !== 'INDUSTRIAL' && cleanSector.length > 2) {
      return cleanSector;
    }
  }

  return 'Sanayi & İmalat';
}

export type FinancialArchetype =
  | 'INDUSTRIAL'          // A) REEL SEKTÖR & SANAYİ (Otomotiv, Kimya, Çimento, Demir-Çelik, Teknoloji, Sağlık)
  | 'AVIATION'            // B) HAVACILIK & ULAŞTIRMA (TAVHL, THYAO, PGSUS)
  | 'BANKING'             // C) BANKACILIK (GARAN, AKBNK, ISCTR, YKBNK)
  | 'INSURANCE'           // D) SİGORTACILIK (TURSG, AGESA, ANSGR)
  | 'HOLDING_REIT'        // E) GYO & HOLDİNGLER (EKGYO, SAHOL, KCHOL)
  | 'RETAIL'              // F) PERAKENDE & TÜKETİM (BIMAS, MGROS, CCOLA)
  | 'UTILITIES_TELCO'     // G) ENERJİ & TELEKOMÜNİKASYON (ENJSA, TCELL, TTKOM)
  | 'FINANCIAL_SERVICES'; // H) FACTORING, LEASING & GİRİŞİM (VAKFN, GSDHO)

export function getFinancialArchetype(sector: SectorType): FinancialArchetype {
  switch (sector) {
    case 'AVIATION':
      return 'AVIATION';
    case 'BANKING':
      return 'BANKING';
    case 'INSURANCE':
      return 'INSURANCE';
    case 'HOLDING':
    case 'REIT':
      return 'HOLDING_REIT';
    case 'RETAIL':
      return 'RETAIL';
    case 'UTILITIES_TELCO':
      return 'UTILITIES_TELCO';
    case 'FINANCIAL_SERVICES':
      return 'FINANCIAL_SERVICES';
    case 'HEALTHCARE':
    case 'TECH':
    case 'INDUSTRIAL':
    default:
      return 'INDUSTRIAL';
  }
}

export interface FeaturedMetric {
  key: string;
  name: string;
  unit?: string;
  description: string;
}

export interface SectorArchetypeConfig {
  archetype: FinancialArchetype;
  name: string;
  badge: string;
  description: string;
  disabledMetrics: string[];
  featuredMetrics: FeaturedMetric[];
  seasonalityWarning?: boolean;
  workingCapitalExemption?: boolean;
  fxDebtDominant?: boolean;
  taxRate: number;
}

export const SECTOR_ARCHETYPE_CONFIGS: Record<FinancialArchetype, SectorArchetypeConfig> = {
  INDUSTRIAL: {
    archetype: 'INDUSTRIAL',
    name: 'Reel Sektör & Sanayi',
    badge: 'Sanayi / Reel Sektör Modu',
    description: 'Standart Bilanço/Gelir Tablosu rasyoları geçerlidir: Brüt Kâr, FAVÖK, Net Borç, FD/FAVÖK, F/K, PD/DD, Stok Devir Hızı, Cari Oran.',
    disabledMetrics: [],
    featuredMetrics: [
      { key: 'gross_margin', name: 'Brüt Kâr Marjı', unit: '%', description: 'Satış kârlılığı ve fiyatlama gücü' },
      { key: 'ebitda_margin', name: 'FAVÖK Marjı', unit: '%', description: 'Operasyonel nakit kârlılığı' },
      { key: 'net_debt_ebitda', name: 'Net Borç / FAVÖK', unit: 'x', description: 'Borç ödeme kapasitesi (<2.5x sağlıklı)' },
      { key: 'roic', name: 'ROIC vs WACC Makası', unit: '%', description: 'Yatırılan sermayenin ekonomik katma değeri' },
      { key: 'current_ratio', name: 'Cari Oran', unit: 'x', description: 'Kısa vadeli likidite gücü (>1.2x)' },
    ],
    taxRate: 0.25,
  },
  AVIATION: {
    archetype: 'AVIATION',
    name: 'Havacılık & Ulaştırma',
    badge: 'Havacılık / TTM & Mevsimsellik Modu',
    description: 'Mevsimsellik uyarısı aktiftir. Yıllıklandırmada KESİNLİKLE düz çarpma (6A*2) yasaktır, TTM zorunludur. Döviz cinsi borçlar ve yolcu trafiği esastır.',
    disabledMetrics: [],
    featuredMetrics: [
      { key: 'passenger_traffic', name: 'Yolcu Trafiği & Doluluk Oranı', unit: 'Yolcu / %', description: 'AKK/ASK ve filo doluluk verimi' },
      { key: 'ttm_ebitda', name: 'TTM FAVÖK', unit: 'TL', description: 'Son 12 ay kümülatif operasyonel nakit üretimi' },
      { key: 'fx_net_debt', name: 'Döviz Cinsi Net Borç', unit: 'Döviz', description: 'EUR/USD cinsi filo ve finansal kiralama borçları' },
      { key: 'ebitda_margin', name: 'FAVÖK Marjı', unit: '%', description: 'Yakıt ve personel sonrası faaliyet marjı' },
      { key: 'free_cash_flow', name: 'Serbest Nakit Akışı (FCF)', unit: 'TL', description: 'Uçak alımları/CapEx sonrası kalan nakit' },
    ],
    seasonalityWarning: true,
    fxDebtDominant: true,
    taxRate: 0.25,
  },
  BANKING: {
    archetype: 'BANKING',
    name: 'Bankacılık & Finans',
    badge: 'Banka / NII & NIM Modu',
    description: 'Bankalarda faiz gelirleri, net faiz marjı (NIM), komisyon gelirleri, aktif kalitesi (NPL) ve sermaye yeterlilik rasyosu (SYR) esastır.',
    disabledMetrics: ['ebitda', 'gross_profit', 'ev_ebitda', 'ev_sales', 'net_debt', 'current_ratio', 'quick_ratio', 'financial_debt', 'stock_turnover', 'gross_margin', 'ebitda_margin'],
    featuredMetrics: [
      { key: 'nim', name: 'Net Faiz Marjı (NIM)', unit: '%', description: 'Kredi-mevduat makası ve aktif getiri oranı' },
      { key: 'net_interest_income', name: 'Net Faiz Geliri (NII)', unit: 'TL', description: 'Faiz gelirleri eksi mevduat faiz giderleri' },
      { key: 'npl_ratio', name: 'Takipteki Krediler Oranı (NPL)', unit: '%', description: 'Aktif kalitesi ve tahsilat gücü (<%3.0 sağlıklı)' },
      { key: 'car_syr', name: 'Sermaye Yeterliliği (SYR/CAR)', unit: '%', description: 'BDDK yasal sermaye tamponu (>%14 güçlü)' },
      { key: 'roe', name: 'Özkaynak Kârlılığı (ROE)', unit: '%', description: 'Banka sermayesinin getiri oranı' },
      { key: 'pb', name: 'PD/DD & F/K', unit: 'x', description: 'Bankacılık piyasa değerleme çarpanları' },
    ],
    taxRate: 0.30,
  },
  INSURANCE: {
    archetype: 'INSURANCE',
    name: 'Sigortacılık & Bireysel Emeklilik',
    badge: 'Sigorta / Teknik Denge & Float Modu',
    description: 'Sigorta şirketlerinde klasik hasılat ve FAVÖK bulunmaz. Prim üretimi, teknik denge, hasar/prim ve masraf oranı, kombine oran ve ROE esastır.',
    disabledMetrics: ['ebitda', 'ev_ebitda', 'ev_sales', 'net_debt', 'stock_turnover', 'ebitda_margin'],
    featuredMetrics: [
      { key: 'gross_written_premiums', name: 'Yazılan Net / Brüt Prim', unit: 'TL', description: 'Poliçe üretimi ve pazar payı genişlemesi' },
      { key: 'loss_ratio', name: 'Hasar / Prim Oranı', unit: '%', description: 'Ödenen/tahakkuk eden hasar maliyeti (<%75 olumlu)' },
      { key: 'expense_ratio', name: 'Masraf Oranı', unit: '%', description: 'Faaliyet ve komisyon gider oranı' },
      { key: 'combined_ratio', name: 'Bileşik Oran (Combined Ratio)', unit: '%', description: 'Hasar + Masraf toplamı (<%100 teknik kâr üretir)' },
      { key: 'roe', name: 'Özkaynak Kârlılığı (ROE)', unit: '%', description: 'Float yatırım getirisi ve teknik kâr ile beslenen getiri' },
    ],
    taxRate: 0.30,
  },
  HOLDING_REIT: {
    archetype: 'HOLDING_REIT',
    name: 'GYO & Holdingler',
    badge: 'Holding / GYO & NAD İskontosu Modu',
    description: 'Holdinglerde tekil F/K kullanımı yanıltıcıdır. Net Aktif Değeri (NAD / NAV), PD/NAD İskontosu/Primi ve iştirak temettü/kâr katkısı esastır.',
    disabledMetrics: ['ev_ebitda', 'ev_sales'],
    featuredMetrics: [
      { key: 'nav_discount', name: 'Net Aktif Değeri (NAD / NAV) İskontosu', unit: '%', description: 'Piyasa değeri vs portföy net aktif değeri iskonto cazibesi (>%25-%35)' },
      { key: 'pb_nav', name: 'PD/NAD Oranı', unit: 'x', description: 'Portföy değerleme çarpanı' },
      { key: 'subsidiary_contribution', name: 'İştirak Kâr / Temettü Katkısı', unit: 'TL', description: 'Portföy şirketlerinden düzenli nakit ve temettü akışı' },
      { key: 'solo_liquidity', name: 'Solo Nakit / Borç Dengesi', unit: 'TL', description: 'Merkez holding bilançosunun net nakit gücü ve borçsuzluk' },
    ],
    taxRate: 0.25, // REIT has 0% tax, handled dynamically per sector
  },
  RETAIL: {
    archetype: 'RETAIL',
    name: 'Perakende & Tüketim',
    badge: 'Perakende / Negatif Çalışma Sermayesi Modu',
    description: 'Negatif İşletme Sermayesi modeli nedeniyle Cari Oran < 1.0 olması risk olarak YORUMLANMAMALIDIR (tedarikçi vadeleri nakit üretir). SSS büyümesi ve mağaza sayısı esastır.',
    disabledMetrics: [],
    featuredMetrics: [
      { key: 'sss_growth', name: 'Aynı Mağaza Satış Büyümesi (SSS)', unit: '%', description: 'Mevcut mağazaların enflasyon üzeri reel büyümesi' },
      { key: 'store_count', name: 'Mağaza Sayısı & m² Büyümesi', unit: 'Adet', description: 'Organik şebeke genişlemesi' },
      { key: 'ifrs16_ebitda', name: 'IFRS 16 Düzeltilmiş FAVÖK', unit: 'TL', description: 'Kira yükümlülükleri arındırılmış operasyonel kâr' },
      { key: 'negative_nwc', name: 'Negatif İşletme Sermayesi Gücü', unit: 'TL', description: 'Tedarikçi finansmanı ile sağlanan faizsiz fon kaynağı' },
      { key: 'stock_turnover', name: 'Stok Devir Hızı', unit: 'Gün', description: 'Raf devir ve stok nakde dönüşüm süresi' },
    ],
    workingCapitalExemption: true,
    taxRate: 0.25,
  },
  UTILITIES_TELCO: {
    archetype: 'UTILITIES_TELCO',
    name: 'Enerji & Telekomünikasyon',
    badge: 'Altyapı / FCF & CapEx Yoğun Mod',
    description: 'Yüksek amortisman ve borçluluk doğaldır (altyapı yatırımları). Serbest Nakit Akışı (FCF), CapEx/Satışlar, ARPU ve MW kurulu güç esastır.',
    disabledMetrics: [],
    featuredMetrics: [
      { key: 'free_cash_flow', name: 'Serbest Nakit Akışı (FCF)', unit: 'TL', description: 'Sermaye yatırımları sonrası üretilen serbest nakit' },
      { key: 'capex_to_sales', name: 'CapEx / Satışlar', unit: '%', description: 'Altyapı yatırım yoğunluğu ve şebeke modernizasyonu' },
      { key: 'arpu', name: 'ARPU / Fiyatlama Gücü', unit: 'TL', description: 'Abone başına aylık ortalama gelir / PTF fiyatlama esnekliği' },
      { key: 'capacity_subscribers', name: 'Abone Sayısı / MW Kurulu Güç', unit: 'Birim', description: 'Operasyonel ölçek büyüklüğü' },
      { key: 'net_debt_ebitda', name: 'Net Borç / FAVÖK', unit: 'x', description: 'Uzun vadeli proje finansmanı borç karşılama gücü' },
    ],
    taxRate: 0.25,
  },
  FINANCIAL_SERVICES: {
    archetype: 'FINANCIAL_SERVICES',
    name: 'Factoring, Leasing & Girişim',
    badge: 'Finansal Hizmetler / Kredi & Faiz Modu',
    description: 'Bankacılık arketipi mantığıyla çalışır; FAVÖK ve Net Borç gösterimi KAPALIDIR. Alacak kalitesi (NPL), finansman marjı ve özkaynak kârlılığı esastır.',
    disabledMetrics: ['ebitda', 'gross_profit', 'ev_ebitda', 'ev_sales', 'net_debt', 'current_ratio', 'quick_ratio', 'financial_debt', 'stock_turnover', 'gross_margin', 'ebitda_margin'],
    featuredMetrics: [
      { key: 'factoring_income', name: 'Faktoring / Finansman Gelirleri', unit: 'TL', description: 'Faiz ve komisyon gelirleri toplamı' },
      { key: 'npl_ratio', name: 'Takipteki Alacaklar Oranı (NPL)', unit: '%', description: 'Kredi ve alacak portföy kalitesi (<%4.0)' },
      { key: 'leverage_ratio', name: 'Kaldıraç Oranı', unit: 'x', description: 'Toplam Varlıklar / Özkaynaklar' },
      { key: 'roe', name: 'Özkaynak Kârlılığı (ROE)', unit: '%', description: 'Finansal aracılık kârlılığı' },
      { key: 'pb', name: 'PD/DD & F/K', unit: 'x', description: 'Defter değeri ve kazanç çarpanları' },
    ],
    taxRate: 0.25,
  },
};

export function isMetricDisabled(metricKey: string, sector: SectorType): boolean {
  const archetype = getFinancialArchetype(sector);
  const cfg = SECTOR_ARCHETYPE_CONFIGS[archetype];
  if (!cfg) return false;
  return cfg.disabledMetrics.includes(metricKey);
}

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
  criticalDebtRatio?: number;
  minLiquidityRatio?: number;
  combinedRatioDanger?: number;
  nplDanger?: number;
  minMarginOfSafety: number;
  idealMarginOfSafety: number;
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
  AVIATION: {
    sector: 'AVIATION',
    categories: [
      { key: 'passenger_capacity', name: 'Kapasite & Yolcu Büyümesi', maxScore: 25, description: 'Arz Edilen Koltuk Kilometre (AKK/ASK) ve yolcu doluluk oranları' },
      { key: 'ttm_profitability', name: 'TTM FAVÖK & Faaliyet Marjı', maxScore: 25, description: 'Mevsimsellikten arındırılmış son 12 ay operasyonel nakit marjı' },
      { key: 'fx_debt_leverage', name: 'Döviz Borçluluğu & Filo Finansmanı', maxScore: 25, description: 'Döviz borç yükü (EUR/USD) ve Net Borç / TTM FAVÖK (<3.5x)' },
      { key: 'cash_fcf_quality', name: 'Serbest Nakit Akışı (FCF) & Filo CapEx', maxScore: 25, description: 'Uçak yatırımları sonrası serbest nakit üretim gücü' },
    ],
    riskThresholds: {
      criticalDebtRatio: 4.5,
      minLiquidityRatio: 0.8,
      minMarginOfSafety: 20.0,
      idealMarginOfSafety: 30.0,
    },
  },
  RETAIL: {
    sector: 'RETAIL',
    categories: [
      { key: 'negative_wc_cash', name: 'Negatif Çalışma Sermayesi & Nakit Üretimi', maxScore: 25, description: 'Tedarikçi finansmanı gücü ve kasadaki serbest nakit akışı' },
      { key: 'sss_expansion', name: 'Aynı Mağaza Satış Büyümesi (SSS)', maxScore: 25, description: 'Enflasyon üzeri reel sepet ve işlem hacmi genişlemesi' },
      { key: 'inventory_efficiency', name: 'Stok Devir Hızı & Raf Verimi', maxScore: 25, description: 'Hızlı stok dönüşümü ve minimum fire oranı' },
      { key: 'ifrs16_margin', name: 'IFRS 16 FAVÖK Marjı & ROE', maxScore: 25, description: 'Kira sonrası operasyonel kârlılık ve sermaye getirisi' },
    ],
    riskThresholds: {
      criticalDebtRatio: 3.5,
      minLiquidityRatio: 0.5, // Negative working capital naturally has current ratio < 1.0
      minMarginOfSafety: 20.0,
      idealMarginOfSafety: 30.0,
    },
  },
  UTILITIES_TELCO: {
    sector: 'UTILITIES_TELCO',
    categories: [
      { key: 'fcf_generation', name: 'Serbest Nakit Akışı (FCF)', maxScore: 25, description: 'Altyapı yatırımları sonrası güçlü operasyonel nakit üretimi' },
      { key: 'capex_intensity', name: 'CapEx / Satışlar & Şebeke Yatırımları', maxScore: 25, description: 'Yatırım verimliliği ve kapasite artış dengesi' },
      { key: 'pricing_power_arpu', name: 'ARPU & Tarife Fiyatlama Gücü', maxScore: 25, description: 'Regülasyon ve enflasyon karşısında reel tarife koruması' },
      { key: 'debt_service', name: 'Borç Karşılama Gücü (Net Borç / FAVÖK)', maxScore: 25, description: 'Uzun vadeli proje borçlarının sürdürülebilirliği (<3.8x)' },
    ],
    riskThresholds: {
      criticalDebtRatio: 4.5,
      minLiquidityRatio: 0.8,
      minMarginOfSafety: 20.0,
      idealMarginOfSafety: 30.0,
    },
  },
  FINANCIAL_SERVICES: {
    sector: 'FINANCIAL_SERVICES',
    categories: [
      { key: 'asset_quality', name: 'Alacak Kalitesi & Karşılık Oranı (NPL)', maxScore: 25, description: 'Takipteki faktoring/leasing alacakları rasyosu (<%4.0)' },
      { key: 'financing_margin', name: 'Finansman Geliri & Faiz Marjı', maxScore: 25, description: 'Fonlama maliyeti ile plasman faiz makası' },
      { key: 'capital_buffer', name: 'Sermaye Yeterliliği & Özkaynak Oranı', maxScore: 25, description: 'Kaldıraç yönetimi ve yasal özkaynak tamponu' },
      { key: 'volume_growth', name: 'İşlem Hacmi & Portföy Büyümesi', maxScore: 25, description: 'Faktoring ciro/leasing portföy büyümesi ve ROE' },
    ],
    riskThresholds: {
      nplDanger: 5.0,
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
  HEALTHCARE: {
    sector: 'HEALTHCARE',
    categories: [
      { key: 'operating_margin', name: 'Operasyonel Kârlılık & FAVÖK', maxScore: 25, description: 'Sağlık hizmetleri FAVÖK marjı ve hasta başı verimlilik' },
      { key: 'capital_efficiency', name: 'Sermaye Verimliliği (ROIC vs WACC)', maxScore: 25, description: 'Hastane yatırımlarının sermaye maliyetini aşan getiri oranı' },
      { key: 'balance_sheet_safety', name: 'Bilanço & Borçluluk Güvenliği', maxScore: 25, description: 'Net Borç / FAVÖK (<3.0x) ve güçlü işletme nakit akışı' },
      { key: 'growth_moat', name: 'Hasılat & Medikal Turizm Büyümesi', maxScore: 25, description: 'Yurt içi ve uluslararası sağlık hizmetleri ciro büyümesi' },
    ],
    riskThresholds: {
      criticalDebtRatio: 3.5,
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
    description: 'Bankalarda faiz gelirleri, net faiz marjı (NIM), komisyon gelirleri, kredi/mevduat kalitesi ve sermaye yeterlilik rasyosu (SYR) esastır. FAVÖK ve Net Borç devre dışıdır.',
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
    description: 'Holdinglerde tekil F/K yerine Net Aktif Değeri (NAD / NAV), solo net nakit/borç pozisyonu ve iştirak temettü akışları esastır.',
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
  AVIATION: {
    id: 'AVIATION',
    title: 'Havacılık, Ulaştırma & Havalimanı İşletmeciliği',
    badge: 'Havacılık / TTM & Mevsimsellik Modu',
    description: 'Havacılıkta üçüncü çeyrek yaz mevsimselliği sektör kârının büyük bölümünü oluşturur. Yıllıklandırmada düz çarpma (6A*2) yasaktır, TTM zorunludur. Döviz borçlanma maliyeti (EUR/USD) ve yolcu trafiği esastır.',
    revenueLabel: 'Havacılık & Hizmet Satışları (Hasılat)',
    revenueSublabel: 'Yolcu, Kargo ve Yer Hizmetleri Gelirleri',
    operatingProfitLabel: 'FAVÖK (TTM)',
    operatingProfitSublabel: 'Son 12 Ay Kümülatif Operasyonel Kâr',
    marginLabel: 'FAVÖK Marjı (%)',
    marginSublabel: 'FAVÖK / Toplam Hasılat',
    valuationMultiples: 'FD/FAVÖK (EV/EBITDA), F/K & EV/Sales',
    primaryEfficiencyMetric: 'Yolcu Trafiği & Döviz Net Borç',
  },
  RETAIL: {
    id: 'RETAIL',
    title: 'Organize Perakende & Hızlı Tüketim',
    badge: 'Perakende / Negatif Çalışma Sermayesi Modu',
    description: 'Perakendede tedarikçi finansmanı modeli sayesinde Cari Oran < 1.0 olması doğaldır ve likidite riski oluşturmaz. Aynı Mağaza Satışları (SSS), mağaza sayısı ve IFRS 16 FAVÖK esastır.',
    revenueLabel: 'Net Satışlar (Perakende Cirosu)',
    revenueSublabel: 'Mağaza Satışları ve Online Dağıtım Hasılatı',
    operatingProfitLabel: 'FAVÖK (IFRS 16 Uyumlu)',
    operatingProfitSublabel: 'Kira Yükümlülükleri Düzeltilmiş Operasyonel Kâr',
    marginLabel: 'FAVÖK Marjı (%)',
    marginSublabel: 'IFRS 16 FAVÖK / Satışlar',
    valuationMultiples: 'FD/FAVÖK, F/K & FD/Satışlar',
    primaryEfficiencyMetric: 'Aynı Mağaza Satış Büyümesi (SSS %)',
  },
  UTILITIES_TELCO: {
    id: 'UTILITIES_TELCO',
    title: 'Enerji Üretim/Dağıtım & Telekomünikasyon',
    badge: 'Altyapı / FCF & CapEx Yoğun Mod',
    description: 'Sermaye yoğun altyapı sektörlerinde yüksek amortisman ve borçluluk doğaldır. Serbest Nakit Akışı (FCF), CapEx/Satışlar, ARPU ve MW kurulu güç esastır.',
    revenueLabel: 'Satış Gelirleri (Hasılat)',
    revenueSublabel: 'Elektrik Dağıtım/Üretim ve Telekomünikasyon Gelirleri',
    operatingProfitLabel: 'FAVÖK (EBITDA)',
    operatingProfitSublabel: 'Faiz, Amortisman ve Vergi Öncesi Faaliyet Kârı',
    marginLabel: 'FAVÖK & FCF Marjı (%)',
    marginSublabel: 'Operasyonel Kârlılık ve Nakit Dönüşüm Marjı',
    valuationMultiples: 'FD/FAVÖK, FCF Verimi & F/K',
    primaryEfficiencyMetric: 'Serbest Nakit Akışı (FCF) & CapEx/Satışlar',
  },
  FINANCIAL_SERVICES: {
    id: 'FINANCIAL_SERVICES',
    title: 'Faktoring, Finansal Kiralama (Leasing) & Girişim',
    badge: 'Finansal Hizmetler / Kredi & Faiz Modu',
    description: 'Bankacılık arketipi mantığıyla çalışır; FAVÖK ve Net Borç gösterimi KAPALIDIR. Faktoring/leasing gelirleri, alacak kalitesi (NPL) ve özkaynak kârlılığı (ROE) esastır.',
    revenueLabel: 'Faktoring / Finansman Gelirleri',
    revenueSublabel: 'Alacak Faizleri ve Finansal Aracılık Gelirleri',
    operatingProfitLabel: 'Esas Faaliyet Kârı',
    operatingProfitSublabel: 'Karşılık Öncesi Net Finansman Kârı',
    marginLabel: 'Faiz Marjı & Alacak Kârlılığı (%)',
    marginSublabel: 'Finansman Geliri / Ortalama Alacak Portföyü',
    valuationMultiples: 'PD/DD & F/K',
    primaryEfficiencyMetric: 'Özkaynak Kârlılığı (ROE %)',
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
  HEALTHCARE: {
    id: 'HEALTHCARE',
    title: 'Sağlık & Hastanecilik',
    badge: 'Sağlık & Hastanecilik Modu',
    description: 'Özel hastane zincirleri, medikal turizm, yatak kapasitesi, ARPU ve operasyonel FAVÖK marjı kilit değer sürücüleridir.',
    revenueLabel: 'Sağlık Hizmet Gelirleri (Hasılat)',
    revenueSublabel: 'Yurt İçi Hasta ve Uluslararası Medikal Turizm Gelirleri',
    operatingProfitLabel: 'FAVÖK (EBITDA)',
    operatingProfitSublabel: 'Faiz, Amortisman ve Vergi Öncesi Operasyonel Kâr',
    marginLabel: 'FAVÖK Marjı (%)',
    marginSublabel: 'FAVÖK / Sağlık Hizmet Hasılatı',
    valuationMultiples: 'FD/FAVÖK (EV/EBITDA), F/K & PD/DD',
    primaryEfficiencyMetric: 'ROIC vs WACC Sermaye Makası',
  },
};

export const BIST_AVIATION_TICKERS = [
  'THYAO',
  'PGSUS',
  'TAVHL',
  'CLEBI',
  'RYSAS',
  'GSDDE',
];

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
  'BERA',
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

export const BIST_RETAIL_TICKERS = [
  'BIMAS',
  'MGROS',
  'SOKM',
  'BIZIM',
  'CCOLA',
  'MAVI',
  'VAKKO',
  'SUWEN',
  'DMSAS',
  'ULKER',
];

export const BIST_UTILITIES_TELCO_TICKERS = [
  'ENJSA',
  'TCELL',
  'TTKOM',
  'AKSEN',
  'GWIND',
  'AYDEM',
  'CANTE',
  'ZOREN',
  'CWENE',
  'EUPWR',
  'ASTOR',
  'ALFAS',
  'SMRTG',
  'ODAS',
  'CONSE',
  'MAGEN',
  'KAREL',
];

export const BIST_LEASING_TICKERS = [
  'VAKFN', // Vakıf Finansal Kiralama A.Ş. (Leasing)
  'ISFIN', // İş Finansal Kiralama A.Ş. (Leasing)
  'QNBFL', // QNB Finansleasing (Leasing)
  'SEKFK', // Şeker Finansal Kiralama A.Ş. (Leasing)
];

export const BIST_FACTORING_TICKERS = [
  'GARFA', // Garanti Faktoring A.Ş.
  'CRDFA', // Creditwest Faktoring A.Ş.
  'LIDFA', // Lider Faktoring A.Ş.
  'ULUFA', // Ulusal Faktoring A.Ş.
];

export const BIST_BROKERAGE_TICKERS = [
  'ISMEN', // İş Yatırım Menkul Değerler A.Ş.
  'INFO',  // İnfo Yatırım Menkul Değerler A.Ş.
  'OSMEN', // Osmanlı Yatırım Menkul Değerler A.Ş.
  'UNLU',  // Ünlü & Co Menkul Değerler A.Ş.
];

export type FinancialServicesSubsector = 'LEASING' | 'FACTORING' | 'BROKERAGE_AUM' | 'INVESTMENT_HOLDING';

export function getFinancialServicesSubsector(ticker: string): FinancialServicesSubsector | null {
  const clean = String(ticker || '').trim().toUpperCase();
  if (BIST_LEASING_TICKERS.includes(clean)) return 'LEASING';
  if (BIST_FACTORING_TICKERS.includes(clean)) return 'FACTORING';
  if (BIST_BROKERAGE_TICKERS.includes(clean)) return 'BROKERAGE_AUM';
  if (clean === 'GSDHO') return 'INVESTMENT_HOLDING';
  return null;
}

export const BIST_FINANCIAL_SERVICES_TICKERS = [
  ...BIST_LEASING_TICKERS,
  ...BIST_FACTORING_TICKERS,
  ...BIST_BROKERAGE_TICKERS,
  'GSDHO',
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

export const BIST_HEALTHCARE_TICKERS = [
  'MPARK',
  'LKMNH',
  'TNZTP',
  'GENIL',
  'SELEC',
  'TRILC',
  'RTALB',
  'ANGEN',
  'MEDTR',
  'ONCSM',
];

export function detectSector(ticker: string, contextText = ''): SectorType {
  const normTicker = (ticker || '').toUpperCase().trim();
  const cleanTicker = normTicker.replace(/\.IS$/i, '').trim();

  // 1. İş Yatırım Resmi 630 Şirket Baseline Kontrolü (Birincil Yetkili Kaynak)
  const isy = OFFICIAL_ISYATIRIM_MULTIPLES_BASELINE[cleanTicker];
  if (isy && isy.sectorName) {
    return mapIsYatirimSectorToValuationSector(isy.sectorName);
  }

  // 2. Ticker bazlı kesin eşleştirme (Yeni halka arzlar ve baseline dışı hisseler için)
  if (BIST_HEALTHCARE_TICKERS.includes(cleanTicker)) {
    return 'HEALTHCARE';
  }
  if (BIST_AVIATION_TICKERS.includes(cleanTicker)) {
    return 'AVIATION';
  }
  if (BIST_INSURANCE_TICKERS.includes(cleanTicker)) {
    return 'INSURANCE';
  }
  if (BIST_BANKING_TICKERS.includes(cleanTicker)) {
    return 'BANKING';
  }
  if (BIST_FINANCIAL_SERVICES_TICKERS.includes(cleanTicker)) {
    return 'FINANCIAL_SERVICES';
  }
  if (BIST_RETAIL_TICKERS.includes(cleanTicker)) {
    return 'RETAIL';
  }
  if (BIST_UTILITIES_TELCO_TICKERS.includes(cleanTicker)) {
    return 'UTILITIES_TELCO';
  }
  if (BIST_HOLDING_TICKERS.includes(cleanTicker)) {
    return 'HOLDING';
  }
  if (BIST_REIT_TICKERS.includes(cleanTicker) || cleanTicker.endsWith('GYO')) {
    return 'REIT';
  }
  if (BIST_TECH_TICKERS.includes(cleanTicker)) {
    return 'TECH';
  }

  // 2. Türkçe ve bağlam metni analizi
  const text = (cleanTicker + ' ' + contextText)
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR');

  if (
    text.includes('havacılık') ||
    text.includes('havayolu') ||
    text.includes('uçak') ||
    text.includes('yolcu trafiği') ||
    text.includes('hava meydan') ||
    text.includes('yer hizmet') ||
    text.includes('havalimanı') ||
    text.includes('airport') ||
    text.includes('airline') ||
    text.includes('aviation')
  ) {
    return 'AVIATION';
  }

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
    text.includes('faktoring') ||
    text.includes('factoring') ||
    text.includes('finansal kiralama') ||
    text.includes('leasing') ||
    text.includes('girişim sermayesi') ||
    text.includes('menkul değer') ||
    text.includes('aracı kurum')
  ) {
    return 'FINANCIAL_SERVICES';
  }

  if (
    text.includes('perakende') ||
    text.includes('süpermarket') ||
    text.includes('mağaza') ||
    text.includes('gıda perakende') ||
    text.includes('aynı mağaza') ||
    text.includes('sss büyüme')
  ) {
    return 'RETAIL';
  }

  if (
    text.includes('elektrik') ||
    text.includes('enerji') ||
    text.includes('santral') ||
    text.includes('telekom') ||
    text.includes('telekomünikasyon') ||
    text.includes('şebeke') ||
    text.includes('arpu') ||
    text.includes('kurulu güç') ||
    text.includes('yenilenebilir enerji') ||
    text.includes('rüzgar santrali') ||
    text.includes('güneş santrali')
  ) {
    return 'UTILITIES_TELCO';
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

  if (
    text.includes('sağlık') ||
    text.includes('hastane') ||
    text.includes('hastanecilik') ||
    text.includes('medikal') ||
    text.includes('ilaç') ||
    text.includes('medical park')
  ) {
    return 'HEALTHCARE';
  }

  return 'INDUSTRIAL';
}
