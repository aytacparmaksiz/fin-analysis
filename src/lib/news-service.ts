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
    summary: 'Yönetim Kurulu, 2033 stratejik hedefleri doğrultusunda filo kapasitesini artırmak üzere ilave yeni nesil geniş gövdeli uçak siparişlerinin kesinleştirildiğini ve teslimat takvimini duyurdu.',
    category: 'INVESTMENT',
    categoryLabel: 'Yatırım & Filo',
    source: 'KAP',
    publishDate: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    timeAgo: '18 dk önce',
    impact: 'POSITIVE',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/thyao',
  },
  {
    id: 'news-kap-02',
    ticker: 'FROTO',
    companyName: 'Ford Otosan Sanayi A.Ş.',
    title: 'Yurt Dışı Batarya ve Elektrikli Araç İhracat Sözleşmesi',
    summary: 'Avrupa pazarına yönelik yeni nesil ticari elektrikli araç batarya montaj hattı tam kapasite üretime geçmiş olup, ilk parti ihracat sevkiyatının başladığı Kamuyu Aydınlatma Platformu\'na bildirildi.',
    category: 'CONTRACT',
    categoryLabel: 'Yeni Sözleşme & İhracat',
    source: 'KAP',
    publishDate: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    timeAgo: '42 dk önce',
    impact: 'POSITIVE',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/froto',
  },
  {
    id: 'news-kap-03',
    ticker: 'TUPRS',
    companyName: 'Tüpraş Türkiye Petrol Rafinerileri A.Ş.',
    title: 'Nakit Kâr Payı (Temettü) Dağıtım Tarihi Kesinleşti',
    summary: 'Olağanüstü Genel Kurul onayıyla pay başına brüt 11,85 TL (net 10,66 TL) nakit kâr payı dağıtımının hak kullanım tarihi ve MKK takas süreci teyit edilmiştir.',
    category: 'DIVIDEND',
    categoryLabel: 'Temettü',
    source: 'KAP',
    publishDate: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    timeAgo: '1 saat önce',
    impact: 'HIGH_IMPACT',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/tuprs',
  },
  {
    id: 'news-kap-04',
    ticker: 'ASELS',
    companyName: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.',
    title: 'Savunma Sanayii Başkanlığı ile 120 Milyon Dolarlık Yeni Sözleşme',
    summary: 'Milli Savunma Bakanlığı ihtiyaçları kapsamında radar ve elektro-optik entegrasyonuna yönelik toplam bedeli 120.400.000 USD tutarında ilave sipariş sözleşmesi imzalandı.',
    category: 'CONTRACT',
    categoryLabel: 'Yeni İş İlişkisi',
    source: 'KAP',
    publishDate: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    timeAgo: '2 saat önce',
    impact: 'HIGH_IMPACT',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/asels',
  },
  {
    id: 'news-kap-05',
    ticker: 'AGESA',
    companyName: 'Agesa Hayat ve Emeklilik A.Ş.',
    title: 'Bireysel Emeklilik (BES) Fon Büyüklüğü ve Prim Üretimi Raporu',
    summary: 'Şirketin fon büyüklüğü yıllık bazda %68 artış kaydederek sektör pazar payında liderliğini korudu; hayat branşı prim üretimi dönemsel hedeflerin üzerinde gerçekleşti.',
    category: 'FINANCIALS',
    categoryLabel: 'Mali Göstergeler',
    source: 'KAP',
    publishDate: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
    timeAgo: '2.5 saat önce',
    impact: 'POSITIVE',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/agesa',
  },
  {
    id: 'news-kap-06',
    ticker: 'SISE',
    companyName: 'Türkiye Şişe ve Cam Fabrikaları A.Ş.',
    title: 'Pay Geri Alım Programı Kapsamında Hisse Alım Bildirimi',
    summary: 'Yönetim Kurulu kararı uyarınca sürdürülen pay geri alım programı dahilinde Borsa İstanbul\'da ortalama 46,20 TL fiyattan 350.000 adet SISE payı geri alınmıştır.',
    category: 'BUYBACK',
    categoryLabel: 'Pay Geri Alımı',
    source: 'KAP',
    publishDate: new Date(Date.now() - 210 * 60 * 1000).toISOString(),
    timeAgo: '3.5 saat önce',
    impact: 'POSITIVE',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/sise',
  },
  {
    id: 'news-kap-07',
    ticker: 'BIMAS',
    companyName: 'BİM Birleşik Mağazalar A.Ş.',
    title: 'Yurt İçi ve Yurt Dışı Yeni Mağaza Açılışları Bilgilendirmesi',
    summary: 'Son çeyrek döneminde toplam 142 yeni mağaza faaliyete başlamış olup, toplam mağaza ağı 12.000 eşiğini aşmıştır. Lojistik merkez optimizasyonu devam etmektedir.',
    category: 'GENERAL',
    categoryLabel: 'Operasyonel Duyuru',
    source: 'KAP',
    publishDate: new Date(Date.now() - 290 * 60 * 1000).toISOString(),
    timeAgo: '5 saat önce',
    impact: 'NEUTRAL',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/bimas',
  },
  {
    id: 'news-kap-08',
    ticker: 'EREGL',
    companyName: 'Ereğli Demir ve Çelik Fabrikaları T.A.Ş.',
    title: 'Yeşil Çelik ve Peletleme Tesisi Yatırımı ÇED Süreci Bildirimi',
    summary: 'Karbon ayak izini azaltacak 3,2 milyar dolarlık yeşil dönüşüm ve pelet tesisi projesine ilişkin Çevresel Etki Değerlendirmesi (ÇED) olumlu kararı resmi gazetede yayımlandı.',
    category: 'INVESTMENT',
    categoryLabel: 'Yeşil Dönüşüm & Yatırım',
    source: 'KAP',
    publishDate: new Date(Date.now() - 360 * 60 * 1000).toISOString(),
    timeAgo: '6 saat önce',
    impact: 'POSITIVE',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/eregl',
  },
  {
    id: 'news-kap-09',
    ticker: 'KCHOL',
    companyName: 'Koç Holding A.Ş.',
    title: 'İştirak Portföyü Net Aktif Değer (NAD) ve Temettü Gelirleri Raporu',
    summary: 'Holding konsolide net nakit pozisyonu güçlenmeye devam etmekte olup, iştiraklerden sağlanan temettü akışlarının bilanço likiditesini desteklediği açıklandı.',
    category: 'FINANCIALS',
    categoryLabel: 'Finansal Performans',
    source: 'KAP',
    publishDate: new Date(Date.now() - 440 * 60 * 1000).toISOString(),
    timeAgo: '7 saat önce',
    impact: 'NEUTRAL',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/kchol',
  },
  {
    id: 'news-kap-10',
    ticker: 'EKGYO',
    companyName: 'Emlak Konut Gayrimenkul Yatırım Ortaklığı A.Ş.',
    title: 'Gelir Paylaşımı Projeleri İhale ve Ön Satış Hasılatı',
    summary: 'İstanbul ve İzmir lokasyonlarında yürütülen bağımsız bölüm ön satışlarında hasılat hedefleri %115 oranında aşılmış ve 3. çeyrek nakit akışı güçlenmiştir.',
    category: 'CONTRACT',
    categoryLabel: 'Gayrimenkul & Satış',
    source: 'KAP',
    publishDate: new Date(Date.now() - 520 * 60 * 1000).toISOString(),
    timeAgo: '8 saat önce',
    impact: 'POSITIVE',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/ekgyo',
  },
  {
    id: 'news-kap-11',
    ticker: 'MPARK',
    companyName: 'MLP Sağlık Hizmetleri A.Ş.',
    title: 'Yeni Hastane Ruhsatı ve Yurt Dışı Sağlık Turizmi Büyümesi',
    summary: 'Yurt dışı hasta gelirlerinin konsolide ciro içindeki payı %32 seviyesine ulaşırken, yeni kompleks yatırımı planlandığı şekilde hizmete açıldı.',
    category: 'INVESTMENT',
    categoryLabel: 'Sağlık Turizmi & Büyüme',
    source: 'KAP',
    publishDate: new Date(Date.now() - 600 * 60 * 1000).toISOString(),
    timeAgo: '10 saat önce',
    impact: 'POSITIVE',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/mpark',
  },
  {
    id: 'news-kap-12',
    ticker: 'LOGO',
    companyName: 'Logo Yazılım Sanayi ve Ticaret A.Ş.',
    title: 'Bulut Bilişim (SaaS) Gelirleri ve Yıllık Tekrarlayan Gelir (ARR) Artışı',
    summary: 'Bulut dönüşüm stratejisi kapsamında tekrarlayan SaaS gelirleri yıllık bazda reel olarak %54 artış kaydetti; Rule of 40 rasyosu güçlü seyrini sürdürdü.',
    category: 'FINANCIALS',
    categoryLabel: 'Teknoloji & SaaS',
    source: 'KAP',
    publishDate: new Date(Date.now() - 720 * 60 * 1000).toISOString(),
    timeAgo: '12 saat önce',
    impact: 'POSITIVE',
    url: 'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/logo',
  }
];

export function getCompanyNewsFeed(options?: {
  tickers?: string[];
  category?: string;
  limit?: number;
}): CompanyNewsItem[] {
  let feed = [...OFFICIAL_BIST_NEWS_FEED];

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
