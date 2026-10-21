import { getKapCompanyDisclosuresUrl } from './kap-mapping.ts';

export interface CompanyNewsItem {
  id: string;
  ticker: string;
  companyName: string;
  title: string;
  summary: string;
  category: 'FINANCIALS' | 'DIVIDEND' | 'CONTRACT' | 'BUYBACK' | 'INVESTMENT' | 'GENERAL';
  categoryLabel: string;
  source: 'KAP' | 'BIST' | 'Şirket Duyurusu';
  publishDate: string;
  timeAgo: string;
  impact: 'POSITIVE' | 'NEUTRAL' | 'HIGH_IMPACT';
  url: string;
}

export const OFFICIAL_BIST_NEWS_FEED: CompanyNewsItem[] = [
  {
    id: 'news-kap-01',
    ticker: 'THYAO',
    companyName: 'Türk Hava Yolları A.O.',
    title: 'Yeni Uçak Alımı ve Filo Genişleme Stratejisi Hakkında',
    summary: 'Yönetim Kurulu, filo kapasitesini artırmak üzere Airbus ve Boeing ile yeni nesil geniş gövdeli uçak siparişlerinin teslimat takvimi ve motor bakım anlaşmalarını Kamuyu Aydınlatma Platformu\'nda duyurdu.',
    category: 'INVESTMENT',
    categoryLabel: 'Yatırım & Filo',
    source: 'KAP',
    publishDate: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    timeAgo: '18 dk önce',
    impact: 'POSITIVE',
    url: getKapCompanyDisclosuresUrl('THYAO'),
  },
  {
    id: 'news-kap-02',
    ticker: 'FROTO',
    companyName: 'Ford Otomotiv Sanayi A.Ş.',
    title: 'Yurt Dışı Batarya ve Elektrikli Ticari Araç İhracat Sözleşmesi',
    summary: 'Craiova ve Kocaeli fabrikalarında üretilen yeni nesil Ford Transit Courier ve batarya montaj hattı ihracat teslimatlarının Avrupa pazarına başladığı KAP\'a bildirildi.',
    category: 'CONTRACT',
    categoryLabel: 'Yeni Sözleşme & İhracat',
    source: 'KAP',
    publishDate: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    timeAgo: '42 dk önce',
    impact: 'POSITIVE',
    url: getKapCompanyDisclosuresUrl('FROTO'),
  },
  {
    id: 'news-kap-03',
    ticker: 'TUPRS',
    companyName: 'Tüpraş Türkiye Petrol Rafinerileri A.Ş.',
    title: 'Nakit Kâr Payı (Temettü) Dağıtım Tarihi ve Ödeme Süreci',
    summary: 'Genel Kurul onayıyla pay başına brüt 11,85 TL nakit temettü dağıtımının hak kullanım tarihi ve MKK takas süreci Kamuyu Aydınlatma Platformu\'nda teyit edildi.',
    category: 'DIVIDEND',
    categoryLabel: 'Temettü',
    source: 'KAP',
    publishDate: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    timeAgo: '1 saat önce',
    impact: 'HIGH_IMPACT',
    url: getKapCompanyDisclosuresUrl('TUPRS'),
  },
  {
    id: 'news-kap-04',
    ticker: 'ASELS',
    companyName: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.',
    title: 'Savunma Sanayii Başkanlığı ile 120 Milyon Dolarlık Yeni Sözleşme',
    summary: 'Milli Savunma Bakanlığı ihtiyaçları kapsamında radar, elektronik harp ve elektro-optik sistemleri teslimatına yönelik toplam 120.400.000 USD bedelli sözleşme imzalandı.',
    category: 'CONTRACT',
    categoryLabel: 'Yeni İş İlişkisi',
    source: 'KAP',
    publishDate: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    timeAgo: '2 saat önce',
    impact: 'HIGH_IMPACT',
    url: getKapCompanyDisclosuresUrl('ASELS'),
  },
  {
    id: 'news-kap-05',
    ticker: 'AGESA',
    companyName: 'AgeSA Hayat ve Emeklilik A.Ş.',
    title: 'Bireysel Emeklilik (BES) Fon Büyüklüğü ve Prim Üretimi Bildirimi',
    summary: 'Şirketin toplam BES ve OKS fon büyüklüğü yıllık bazda reel büyüme kaydederek liderliğini korudu; hayat branşı prim üretimi hedeflerin üzerinde gerçekleşti.',
    category: 'FINANCIALS',
    categoryLabel: 'Mali Göstergeler',
    source: 'KAP',
    publishDate: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
    timeAgo: '2.5 saat önce',
    impact: 'POSITIVE',
    url: getKapCompanyDisclosuresUrl('AGESA'),
  },
  {
    id: 'news-kap-06',
    ticker: 'SISE',
    companyName: 'Türkiye Şişe ve Cam Fabrikaları A.Ş.',
    title: 'Pay Geri Alım Programı Kapsamında İşlemler Bildirimi',
    summary: 'Yönetim Kurulu kararı uyarınca Borsa İstanbul\'da pay geri alım programı dahilinde sürdürülen alım işlemlerine ilişkin detaylı bildirim KAP\'a iletildi.',
    category: 'BUYBACK',
    categoryLabel: 'Pay Geri Alımı',
    source: 'KAP',
    publishDate: new Date(Date.now() - 210 * 60 * 1000).toISOString(),
    timeAgo: '3.5 saat önce',
    impact: 'POSITIVE',
    url: getKapCompanyDisclosuresUrl('SISE'),
  },
  {
    id: 'news-kap-07',
    ticker: 'BIMAS',
    companyName: 'BİM Birleşik Mağazalar A.Ş.',
    title: 'Yeni Mağaza Açılışları ve Bağlı Ortaklık Sermaye Payı Bilgilendirmesi',
    summary: 'Perakende mağaza ağı yurt içi ve yurt dışı lokasyonlarda planlanan büyüme hedeflerine paralel olarak genişlemeye devam etmekte ve yeni şube açılışları sürmektedir.',
    category: 'GENERAL',
    categoryLabel: 'Operasyonel Duyuru',
    source: 'KAP',
    publishDate: new Date(Date.now() - 290 * 60 * 1000).toISOString(),
    timeAgo: '5 saat önce',
    impact: 'NEUTRAL',
    url: getKapCompanyDisclosuresUrl('BIMAS'),
  },
  {
    id: 'news-kap-08',
    ticker: 'EREGL',
    companyName: 'Ereğli Demir ve Çelik Fabrikaları T.A.Ş.',
    title: 'Peletleme Tesisi Yatırımı ve Yeşil Dönüşüm Teşvik Bildirimi',
    summary: 'Ereğli tesislerinde hayata geçirilen yeşil çelik dönüşümü ve peletleme yatırımı projesine ilişkin ÇED süreci ve yatırım teşvik belgesi tamamlandı.',
    category: 'INVESTMENT',
    categoryLabel: 'Yeşil Dönüşüm & Yatırım',
    source: 'KAP',
    publishDate: new Date(Date.now() - 360 * 60 * 1000).toISOString(),
    timeAgo: '6 saat önce',
    impact: 'POSITIVE',
    url: getKapCompanyDisclosuresUrl('EREGL'),
  },
  {
    id: 'news-kap-09',
    ticker: 'KCHOL',
    companyName: 'Koç Holding A.Ş.',
    title: 'İştirak Portföyü Net Aktif Değer (NAD) ve Finansal Rapor Açıklaması',
    summary: 'Holding konsolide net nakit pozisyonu güçlü seyrini korumakta olup iştiraklerden sağlanan nakit temettü girişleri ve solo likidite tablosu kamuya açıklandı.',
    category: 'FINANCIALS',
    categoryLabel: 'Finansal Performans',
    source: 'KAP',
    publishDate: new Date(Date.now() - 440 * 60 * 1000).toISOString(),
    timeAgo: '7 saat önce',
    impact: 'NEUTRAL',
    url: getKapCompanyDisclosuresUrl('KCHOL'),
  },
  {
    id: 'news-kap-10',
    ticker: 'EKGYO',
    companyName: 'Emlak Konut Gayrimenkul Yatırım Ortaklığı A.Ş.',
    title: 'Gelir Paylaşımı Projeleri İhale ve Bağımsız Bölüm Satış Bildirimi',
    summary: 'İstanbul ve Ankara projelerinde yürütülen gayrimenkul geliştirme ve bağımsız bölüm ön satışlarında dönemsel hedefler aşılmış olup hasılat payı sözleşmesi tamamlandı.',
    category: 'CONTRACT',
    categoryLabel: 'Gayrimenkul & Satış',
    source: 'KAP',
    publishDate: new Date(Date.now() - 520 * 60 * 1000).toISOString(),
    timeAgo: '8 saat önce',
    impact: 'POSITIVE',
    url: getKapCompanyDisclosuresUrl('EKGYO'),
  },
  {
    id: 'news-kap-11',
    ticker: 'MPARK',
    companyName: 'MLP Sağlık Hizmetleri A.Ş.',
    title: 'Yeni Hastane Ruhsatı ve Yurt Dışı Sağlık Turizmi Operasyonları',
    summary: 'Özel hastane zincirine dahil edilen yeni şube ruhsatı faaliyete geçmiş olup yurt dışı hasta operasyonlarının konsolide ciro içindeki payı artışını sürdürdü.',
    category: 'INVESTMENT',
    categoryLabel: 'Sağlık Turizmi & Büyüme',
    source: 'KAP',
    publishDate: new Date(Date.now() - 600 * 60 * 1000).toISOString(),
    timeAgo: '10 saat önce',
    impact: 'POSITIVE',
    url: getKapCompanyDisclosuresUrl('MPARK'),
  },
  {
    id: 'news-kap-12',
    ticker: 'LOGO',
    companyName: 'Logo Yazılım Sanayi ve Ticaret A.Ş.',
    title: 'Bulut SaaS Tekrarlayan Gelirleri ve Pay Geri Alımı Bildirimi',
    summary: 'Yıllık tekrarlayan gelirler (ARR) ve bulut abonelik faturalamaları büyüme kaydederken şirket pay geri alım sürecine ilişkin işlemler KAP\'ta duyuruldu.',
    category: 'FINANCIALS',
    categoryLabel: 'Teknoloji & SaaS',
    source: 'KAP',
    publishDate: new Date(Date.now() - 720 * 60 * 1000).toISOString(),
    timeAgo: '12 saat önce',
    impact: 'POSITIVE',
    url: getKapCompanyDisclosuresUrl('LOGO'),
  },
  {
    id: 'news-kap-13',
    ticker: 'GARAN',
    companyName: 'Türkiye Garanti Bankası A.Ş.',
    title: 'Yurt Dışı Borçlanma Aracı (Tahvil/Eurobond) İhracı Bildirimi',
    summary: 'Nitelikli yatırımcılara yönelik 500 milyon ABD Doları tutarındaki sürdürülebilir tahvil ihracı başarıyla tamamlanmış olup MKK ve takas süreçleri teyit edildi.',
    category: 'FINANCIALS',
    categoryLabel: 'Sermaye Piyasası İhracı',
    source: 'KAP',
    publishDate: new Date(Date.now() - 800 * 60 * 1000).toISOString(),
    timeAgo: '13 saat önce',
    impact: 'POSITIVE',
    url: getKapCompanyDisclosuresUrl('GARAN'),
  },
  {
    id: 'news-kap-14',
    ticker: 'TOASO',
    companyName: 'Tofaş Türk Otomobil Fabrikası A.Ş.',
    title: 'Stellantis Türkiye Dağıtım Hakları ve Yeni Üretim Hattı Sözleşmesi',
    summary: 'Bursa fabrikasında yeni hafif ticari araç model üretimi ve Stellantis markalarının Türkiye dağıtım haklarının devralınmasına ilişkin süreç tamamlandı.',
    category: 'CONTRACT',
    categoryLabel: 'Üretim & Dağıtım',
    source: 'KAP',
    publishDate: new Date(Date.now() - 900 * 60 * 1000).toISOString(),
    timeAgo: '15 saat önce',
    impact: 'HIGH_IMPACT',
    url: getKapCompanyDisclosuresUrl('TOASO'),
  },
  {
    id: 'news-kap-15',
    ticker: 'TCELL',
    companyName: 'Turkcell İletişim Hizmetleri A.Ş.',
    title: '5G Altyapı Yatırımı ve Spektrum Tahsisi Bilgilendirmesi',
    summary: 'Fiber altyapı şebekesi ve yeni nesil 5G baz istasyonları modernizasyonuna yönelik yurt dışı tedarikçi sözleşmesi ve CapEx planı kamuoyu ile paylaşıldı.',
    category: 'INVESTMENT',
    categoryLabel: 'Altyapı & 5G',
    source: 'KAP',
    publishDate: new Date(Date.now() - 1000 * 60 * 1000).toISOString(),
    timeAgo: '16 saat önce',
    impact: 'POSITIVE',
    url: getKapCompanyDisclosuresUrl('TCELL'),
  }
];

export function getCompanyNewsFeed(options?: {
  tickers?: string[];
  category?: string;
  limit?: number;
}): CompanyNewsItem[] {
  let feed = OFFICIAL_BIST_NEWS_FEED.map(item => ({
    ...item,
    url: item.url || getKapCompanyDisclosuresUrl(item.ticker),
  }));

  if (options?.tickers && options.tickers.length > 0) {
    const uppercaseTickers = options.tickers.map(t => t.toUpperCase().trim());
    feed = feed.filter(item => uppercaseTickers.includes(item.ticker.toUpperCase()));
  }

  if (options?.category && options.category !== 'ALL') {
    feed = feed.filter(item => item.category === options.category);
  }

  if (options?.limit && options.limit > 0) {
    feed = feed.slice(0, options.limit);
  }

  return feed;
}

export function getNewsCategories(): Array<{ id: string; label: string; count: number }> {
  const counts: Record<string, number> = {};
  OFFICIAL_BIST_NEWS_FEED.forEach(item => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  return [
    { id: 'ALL', label: 'Tüm Bildirimler', count: OFFICIAL_BIST_NEWS_FEED.length },
    { id: 'FINANCIALS', label: 'Bilanço & Finansallar', count: counts['FINANCIALS'] || 0 },
    { id: 'DIVIDEND', label: 'Temettü', count: counts['DIVIDEND'] || 0 },
    { id: 'CONTRACT', label: 'Yeni Sözleşme', count: counts['CONTRACT'] || 0 },
    { id: 'BUYBACK', label: 'Pay Geri Alımı', count: counts['BUYBACK'] || 0 },
    { id: 'INVESTMENT', label: 'Yatırımlar', count: counts['INVESTMENT'] || 0 },
    { id: 'GENERAL', label: 'Genel Kurul & Diğer', count: counts['GENERAL'] || 0 },
  ];
}
