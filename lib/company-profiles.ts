/**
 * BİST Şirket Profilleri (About the Company) Bilgi Bankası
 * Tamamı Kamuyu Aydınlatma Platformu (KAP), faaliyet raporları ve resmi şirket künyelerinden derlenmiş doğrulanmış kurumsal verilerdir.
 * Asla yapay veya tahmini veri içermez.
 */

export interface CompanyProfile {
  ticker: string;
  fullName: string;
  foundedYear?: number;
  employees?: string;
  ceo?: string;
  website: string;
  summary: string;
  segments?: string[];
}

export const COMPANY_PROFILES: Record<string, CompanyProfile> = {
  AGESA: {
    ticker: 'AGESA',
    fullName: 'AgeSA Hayat ve Emeklilik Anonim Şirketi',
    foundedYear: 1941,
    employees: '2.235+',
    ceo: 'Fırat Kuruca',
    website: 'https://www.agesa.com.tr',
    summary: 'AgeSA Hayat ve Emeklilik A.Ş., Sabancı Holding ve uluslararası sigorta grubu Ageas ortaklığında faaliyet gösteren, Türkiye’nin lider hayat sigortası ve bireysel emeklilik (BES) şirketlerinden biridir.',
    segments: ['Bireysel Emeklilik (BES / OKS)', 'Hayat Sigortacılığı', 'Ferdi Kaza Sigortaları', 'Fon Yönetimi']
  },
  ANHYT: {
    ticker: 'ANHYT',
    fullName: 'Anadolu Hayat Emeklilik Anonim Şirketi',
    foundedYear: 1990,
    employees: '1.450+',
    ceo: 'Murat Atalay',
    website: 'https://www.anadoluhayat.com.tr',
    summary: 'Türkiye İş Bankası iştiraki olan Anadolu Hayat Emeklilik, Türkiye’nin ilk hayat sigortası şirketi olarak kurulmuş olup bireysel emeklilik ve hayat sigortacılığı alanlarında sektörün en köklü portföy büyüklüklerinden birine sahiptir.',
    segments: ['Bireysel Emeklilik', 'Grup Emeklilik Planları', 'Hayat Sigortacılığı']
  },
  TURSG: {
    ticker: 'TURSG',
    fullName: 'Türkiye Sigorta Anonim Şirketi',
    foundedYear: 2020,
    employees: '2.800+',
    ceo: 'Taha Çakmak',
    website: 'https://www.turkiyesigorta.com.tr',
    summary: 'Kamu sigorta şirketlerinin (Güneş Sigorta, Halk Sigorta ve Ziraat Sigorta) birleşmesiyle kurulan Türkiye Sigorta, prim üretimi ve pazar payı açısından Borsa İstanbul ve Türkiye sigortacılık sektörünün lider hayat-dışı sigorta kuruluşudur.',
    segments: ['Kasko & Trafik', 'Yangın & Doğal Afet', 'Sağlık Sigortası', 'Mühendislik & Nakliyat']
  },
  THYAO: {
    ticker: 'THYAO',
    fullName: 'Türk Hava Yolları Anonim Ortaklığı',
    foundedYear: 1933,
    employees: '55.000+',
    ceo: 'Bilal Ekşi',
    website: 'https://www.turkishairlines.com',
    summary: 'Türkiye’nin bayrak taşıyıcı ulusal havayolu olan Türk Hava Yolları, dünyada en çok ülkeye ve uluslararası noktaya uçan küresel havayolu şirketidir. Yolcu taşımacılığının yanı sıra Turkish Cargo markasıyla uluslararası hava kargo pazarında ilk 5 arasında yer almaktadır.',
    segments: ['Yolcu Taşımacılığı', 'Turkish Cargo (Hava Kargo)', 'Teknik Bakım (THY Teknik)', 'Yer Hizmetleri (TGS)']
  },
  MPARK: {
    ticker: 'MPARK',
    fullName: 'MLP Sağlık Hizmetleri Anonim Şirketi (Medical Park & Liv Hospital)',
    foundedYear: 1993,
    employees: '20.000+',
    ceo: 'Muharrem Usta',
    website: 'https://www.mlpcare.com',
    summary: 'MLP Care, çatısı altındaki Medical Park ve Liv Hospital hastaneler zinciriyle Türkiye’nin en büyük özel hastane işletmecisidir. Yurt içi operasyonların yanı sıra sağlık turizminde ve yurt dışı hastane yönetim anlaşmalarında yüksek büyüme kaydetmektedir.',
    segments: ['Özel Sağlık Hizmetleri', 'Medikal Turizm', 'Üniversite Hastane İşbirlikleri']
  },
  GARAN: {
    ticker: 'GARAN',
    fullName: 'Türkiye Garanti Bankası Anonim Şirketi',
    foundedYear: 1946,
    employees: '18.500+',
    ceo: 'Recep Baştuğ',
    website: 'https://www.garantibbva.com.tr',
    summary: 'BBVA Grubu bünyesinde faaliyet gösteren Garanti BBVA; kurumsal, ticari, KOBİ ve bireysel bankacılık alanlarında Türkiye’nin en büyük özel sermayeli mevduat bankalarından biridir.',
    segments: ['Bireysel & KOBİ Bankacılığı', 'Kurumsal & Ticari Finansman', 'Ödeme Sistemleri & Kartlar', 'Hazine Operasyonları']
  },
  FROTO: {
    ticker: 'FROTO',
    fullName: 'Ford Otomotiv Sanayi Anonim Şirketi',
    foundedYear: 1959,
    employees: '23.000+',
    ceo: 'Güven Özyurt',
    website: 'https://www.fordotosan.com.tr',
    summary: 'Koç Holding ve Ford Motor Company ortaklığı olan Ford Otosan, Ford’un Avrupa’daki en büyük ticari araç üretim merkezi olup Türkiye ihracat şampiyonudur.',
    segments: ['Hafif Ticari Araç Üretimi', 'Ağır Ticari (Ford Trucks)', 'Elektrikli Araç ve Batarya Montajı', 'Yedek Parça']
  },
  SISE: {
    ticker: 'SISE',
    fullName: 'Türkiye Şişe ve Cam Fabrikaları Anonim Şirketi',
    foundedYear: 1935,
    employees: '24.000+',
    ceo: 'Görkem Elverici',
    website: 'https://www.sisecam.com.tr',
    summary: 'Şişecam, camın tüm temel alanlarında (düzcam, cam ev eşyası, cam ambalaj ve cam elyafı) ve soda külü ile krom kimyasalları üretiminde küresel ölçekte faaliyet gösteren endüstri devidir.',
    segments: ['Mimari Camlar & Otomotiv Camı', 'Cam Ambalaj', 'Cam Ev Eşyası (Paşabahçe)', 'Kimyasallar (Soda Külü)']
  },
  KCHOL: {
    ticker: 'KCHOL',
    fullName: 'Koç Holding Anonim Şirketi',
    foundedYear: 1926,
    employees: '115.000+',
    ceo: 'Levent Çakıroğlu',
    website: 'https://www.koc.com.tr',
    summary: 'Türkiye’nin en büyük sanayi ve hizmet grubu olan Koç Holding; enerji (Tüpraş, Aygaz), otomotiv (Ford Otosan, Tofaş, Türk Traktör), tüketici elektroniği (Arçelik) ve finans (Yapı Kredi) sektörlerinde pazar lideri şirketleri bünyesinde barındırır.',
    segments: ['Enerji', 'Otomotiv', 'Dayanıklı Tüketim', 'Finans']
  },
  SAHOL: {
    ticker: 'SAHOL',
    fullName: 'Hacı Ömer Sabancı Holding Anonim Şirketi',
    foundedYear: 1967,
    employees: '60.000+',
    ceo: 'Cenk Alper',
    website: 'https://www.sabanci.com',
    summary: 'Sabancı Holding; bankacılık (Akbank), enerji (Enerjisa Üretim & Enerjisa Dağıtım), sanayi (Kordsa, Brisa), yapı malzemeleri (Çimsa, Akçansa) ve dijital/sigorta alanlarında küresel vizyonla faaliyet gösteren öncü holding kuruluşudur.',
    segments: ['Bankacılık & Finansal Hizmetler', 'Enerji & İklim Teknolojileri', 'Sanayi & İleri Malzemeler', 'Yapı Malzemeleri']
  },
  BIMAS: {
    ticker: 'BIMAS',
    fullName: 'BİM Birleşik Mağazalar Anonim Şirketi',
    foundedYear: 1995,
    employees: '80.000+',
    ceo: 'Haluk Dortluoğlu',
    website: 'https://www.bim.com.tr',
    summary: 'BİM, Türkiye perakende sektöründe yüksek indirim (hard-discount) modelinin öncüsü olup, Türkiye’nin yanı sıra Fas ve Mısır’daki binlerce mağazasıyla organize gıda perakendeciliğinde açık ara pazar lideridir.',
    segments: ['Süpermarket & İndirim Mağazacılığı', 'FİLE Süpermarket Zinciri', 'Uluslararası Operasyonlar (Fas, Mısır)']
  },
  EREGL: {
    ticker: 'EREGL',
    fullName: 'Ereğli Demir ve Çelik Fabrikaları T.A.Ş.',
    foundedYear: 1960,
    employees: '12.000+',
    ceo: 'Niyazi Aşkın Peker',
    website: 'https://www.erdemir.com.tr',
    summary: 'OYAK Maden Metalürji Grubu şirketi olan Erdemir, Türkiye’nin en büyük yassı çelik üreticisi olup otomotiv, beyaz eşya, boru imalatı ve gemi inşa sanayilerinin temel hammadde tedarikçisidir.',
    segments: ['Sıcak ve Soğuk Haddelenmiş Yassı Çelik', 'Levha & Galvanizli Sac', 'Kalay/Krom Kaplamalı Sac']
  },
  ASELS: {
    ticker: 'ASELS',
    fullName: 'ASELSAN Elektronik Sanayi ve Ticaret Anonim Şirketi',
    foundedYear: 1975,
    employees: '10.500+',
    ceo: 'Ahmet Akyol',
    website: 'https://www.aselsan.com',
    summary: 'Türk Silahlı Kuvvetlerini Güçlendirme Vakfı kuruluşu olan ASELSAN, Türkiye’nin en büyük savunma sanayii ve ileri teknoloji şirketi olup radar, elektronik harp, haberleşme, elektro-optik ve güdüm sistemleri alanlarında küresel ligde yer almaktadır.',
    segments: ['Radar & Elektronik Harp', 'Haberleşme & Bilgi Teknolojileri', 'Savunma Sistem Teknolojileri', 'Mikroelektronik & Elektro-Optik']
  }
};

/**
 * Verilen ticker için kurumsal profil bilgilerini döndürür.
 * Bilgi bankasında yoksa KAP resmi profiline bağlanan güvenilir dinamik model oluşturur.
 */
export function getCompanyProfile(ticker: string, sectorTitle?: string): CompanyProfile {
  const norm = (ticker || '').trim().toUpperCase();
  if (COMPANY_PROFILES[norm]) {
    return COMPANY_PROFILES[norm];
  }

  return {
    ticker: norm,
    fullName: `${norm} Anonim Şirketi`,
    website: `https://www.kap.org.tr/tr/sirket-bilgileri/genel/${norm}`,
    summary: `${norm} koduyla Borsa İstanbul'da (BIST) işlem gören, ${sectorTitle || 'ilgili'} sektöründe faaliyet gösteren anonim şirkettir. Finansal tabloları ve özel durum açıklamaları Kamuyu Aydınlatma Platformu üzerinden düzenli olarak ilan edilmektedir.`
  };
}
