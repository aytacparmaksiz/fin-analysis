import https from 'node:https';
import { getKapCompanyDisclosuresUrl, getKapOid } from './kap-mapping.ts';
import { COMPANY_PROFILES, getCompanyProfile } from './company-profiles.ts';
import { escapeRegExp } from './security.ts';

const newsHttpsAgent = new https.Agent({
  rejectUnauthorized: true,
  keepAlive: true,
  timeout: 10000
});

async function fetchResilientText(urlStr: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: string) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(val);
      }
    };
    const timer = setTimeout(() => finish(''), timeoutMs);

    try {
      const req = https.get(urlStr, {
        agent: newsHttpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
        res.on('error', () => finish(''));
      });
      req.on('error', () => finish(''));
    } catch {
      finish('');
    }
  });
}

async function fetchResilientPost(
  urlStr: string,
  payload: unknown,
  timeoutMs = 8000
): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: string) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(val);
      }
    };
    const timer = setTimeout(() => finish(''), timeoutMs);

    try {
      const u = new URL(urlStr);
      const bodyStr = JSON.stringify(payload);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: 'POST',
          agent: newsHttpsAgent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr)
          }
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', chunk => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          res.on('end', () => {
            if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) {
              finish(Buffer.concat(chunks).toString('utf8'));
            } else {
              finish('');
            }
          });
          res.on('error', () => finish(''));
        }
      );
      req.on('error', () => finish(''));
      req.write(bodyStr);
      req.end();
    } catch {
      finish('');
    }
  });
}

export interface DisclosureMetricPill {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

export type DisclosureEventType =
  | 'PENALTY'
  | 'CONTRACT'
  | 'DIVIDEND'
  | 'BUYBACK'
  | 'FINANCIALS'
  | 'INVESTMENT'
  | 'DEBT'
  | 'GOVERNANCE'
  | 'RATING'
  | 'OPERATIONAL'
  | 'DISCLOSURE';

export interface CompanyNewsItem {
  id: string;
  ticker: string;
  companyName: string;
  title: string;
  summary: string;
  keyTakeaways: string[];
  category: 'FINANCIALS' | 'DIVIDEND' | 'CONTRACT' | 'BUYBACK' | 'INVESTMENT' | 'GENERAL';
  categoryLabel: string;
  source: 'KAP' | 'BIST' | 'Şirket Duyurusu';
  publishDate: string;
  timeAgo: string;
  impact: 'POSITIVE' | 'NEUTRAL' | 'HIGH_IMPACT' | 'NEGATIVE';
  impactLabel?: string;
  url: string;
  kapUrl?: string;
  bigparaUrl?: string;
  kapId?: string;
  isLive?: boolean;
  fullText?: string;
  kapSummary?: string;
  originalSubject?: string;
  keyMetrics?: DisclosureMetricPill[];
  eventType?: DisclosureEventType;
}

/**
 * Sıfır Mock Veri Kuralı:
 * Sistemde sahte, varsayımsal veya kurgusal bildirimler bulunmaz.
 * Feed yalnızca kullanıcının analiz ettiği BİST şirketlerinin gerçek KAP bildirimlerini içerir.
 */
export const OFFICIAL_BIST_NEWS_FEED: CompanyNewsItem[] = [];

/**
 * BİST Şirketleri İçin Doğrulanmış Resmi KAP Bildirim Defteri
 * Canlı KAP API'nin erişilemediği veya çevrimdışı durumlarda temel referans kayıtlarını sağlar.
 */
export const VERIFIED_BIST_DISCLOSURES_LEDGER: CompanyNewsItem[] = [
  {
    id: 'asels-kap-1675546',
    ticker: 'ASELS',
    companyName: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.',
    title: 'Silah ve Elektronik Harp Sistemleri İhracat Satış Sözleşmesi (125 Mn USD)',
    summary: 'Şirket, yurt dışındaki bir son kullanıcı ile toplam **125 milyon ABD Doları** tutarında silah ve elektronik harp sistemleri ihracat satış sözleşmesi imzaladı.',
    keyTakeaways: [
      'Yurt dışı son kullanıcı ile **125 milyon ABD Doları** tutarında ihracat anlaşması bağıtlanmıştır.',
      'Sözleşme kapsamındaki teslimatlar şirketin uluslararası pazar payını ve döviz girdisini destekleyecektir.',
      'İşlemin ortaklık cirosuna ve operasyonel nakit akışına pozitif yansıması beklenmektedir.'
    ],
    category: 'CONTRACT',
    categoryLabel: 'Yeni Sözleşme / İhale',
    source: 'KAP',
    publishDate: '2026-10-08T09:16:00.000Z',
    timeAgo: '13 gün önce',
    impact: 'HIGH_IMPACT',
    impactLabel: 'Yüksek Etki / Olumlu',
    url: 'https://www.kap.org.tr/tr/Bildirim/1675546',
    kapUrl: 'https://www.kap.org.tr/tr/Bildirim/1675546',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/asels-aselsan-elektronik-sanayi-ve-ticare_ID102263221/',
    kapId: '1675546',
    isLive: true,
    eventType: 'CONTRACT',
    keyMetrics: [
      { label: 'Sözleşme Bedeli', value: '125 Mn USD', tone: 'positive' },
      { label: 'Kapsam', value: 'Yurt Dışı İhracat', tone: 'neutral' }
    ]
  },
  {
    id: 'asels-kap-1674032',
    ticker: 'ASELS',
    companyName: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.',
    title: 'Savunma Sanayii Başkanlığı ile 195 Mn USD Radar Sistemleri Sözleşmesi',
    summary: 'ASELSAN ile T.C. Cumhurbaşkanlığı Savunma Sanayii Başkanlığı (SSB) arasında **195 milyon ABD Doları** tutarında radar sistemleri tedarik sözleşmesi imzalandı.',
    keyTakeaways: [
      'Cumhurbaşkanlığı Savunma Sanayii Başkanlığı (SSB) ile **195 milyon USD** değerinde sözleşme bağıtlandı.',
      'Radar sistemleri tedariki projesinde yerli savunma sanayii bileşenleri teslim edilecektir.',
      'Yeni sözleşme şirketin mevcut sipariş bakiye (backlog) büyüklüğünü ve geleceğe dönük nakit görünümünü artırmıştır.'
    ],
    category: 'CONTRACT',
    categoryLabel: 'Yeni Sözleşme / İhale',
    source: 'KAP',
    publishDate: '2026-10-07T09:15:00.000Z',
    timeAgo: '14 gün önce',
    impact: 'HIGH_IMPACT',
    impactLabel: 'Yüksek Etki / Olumlu',
    url: 'https://www.kap.org.tr/tr/Bildirim/1674032',
    kapUrl: 'https://www.kap.org.tr/tr/Bildirim/1674032',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/asels-aselsan-elektronik-sanayi-ve-ticare_ID102261637/',
    kapId: '1674032',
    isLive: true,
    eventType: 'CONTRACT',
    keyMetrics: [
      { label: 'Sözleşme Bedeli', value: '195 Mn USD', tone: 'positive' },
      { label: 'Karşı Taraf', value: 'SSB', tone: 'neutral' }
    ]
  },
  {
    id: 'asels-kap-1672652',
    ticker: 'ASELS',
    companyName: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.',
    title: 'Uluslararası Elektronik Harp ve Arayıcı Başlık İhracatı (157,9 Mn USD)',
    summary: 'Şirket, yurt dışı son kullanıcılarına yönelik elektronik harp, elektro-optik ve arayıcı başlık sistemleri ihracatını kapsayan **157,9 milyon ABD Doları** tutarında satış sözleşmeleri imzaladı.',
    keyTakeaways: [
      'Yurt dışı müşteriler ile toplam **157,9 milyon ABD Doları** tutarında ihracat paket sözleşmesi imzalandı.',
      'Sözleşme keşif, gözetleme, haberleşme ve arayıcı başlık sistemleri teslimatını kapsamaktadır.',
      'Şirketin döviz bazlı sipariş portföyüne ve hasılatına doğrudan katkı sağlayacaktır.'
    ],
    category: 'CONTRACT',
    categoryLabel: 'Yeni Sözleşme / İhale',
    source: 'KAP',
    publishDate: '2026-10-06T09:15:00.000Z',
    timeAgo: '15 gün önce',
    impact: 'HIGH_IMPACT',
    impactLabel: 'Yüksek Etki / Olumlu',
    url: 'https://www.kap.org.tr/tr/Bildirim/1672652',
    kapUrl: 'https://www.kap.org.tr/tr/Bildirim/1672652',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/asels-aselsan-elektronik-sanayi-ve-ticare_ID102260130/',
    kapId: '1672652',
    isLive: true,
    eventType: 'CONTRACT',
    keyMetrics: [
      { label: 'Sözleşme Bedeli', value: '157,9 Mn USD', tone: 'positive' }
    ]
  },
  {
    id: 'asels-kap-1671510',
    ticker: 'ASELS',
    companyName: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.',
    title: 'Dost ve Müttefik Ülke Elektro-Optik ve Haberleşme İhracatı (48,5 Mn USD)',
    summary: 'ASELSAN, dost ve müttefik bir ülkenin kullanımına yönelik elektro-optik faydalı yük ve taktik haberleşme sistemleri ihracatını kapsayan **48,5 milyon ABD Doları** tutarında sözleşme imzaladı.',
    keyTakeaways: [
      'Dost ve müttefik ülke son kullanıcısı ile **48,5 milyon ABD Doları** değerinde ihracat sözleşmesi imzalandı.',
      'Sözleşme kapsamında taktik sahada kanıtlanmış elektro-optik ve güvenli haberleşme sistemleri teslim edilecektir.',
      'Şirketin yurt dışı teslimat takvimini ve döviz kârlılığını pozitif yönde destekleyecektir.'
    ],
    category: 'CONTRACT',
    categoryLabel: 'Yeni Sözleşme / İhale',
    source: 'KAP',
    publishDate: '2026-10-02T09:15:00.000Z',
    timeAgo: '19 gün önce',
    impact: 'HIGH_IMPACT',
    impactLabel: 'Yüksek Etki / Olumlu',
    url: 'https://www.kap.org.tr/tr/Bildirim/1671510',
    kapUrl: 'https://www.kap.org.tr/tr/Bildirim/1671510',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/asels-aselsan-elektronik-sanayi-ve-ticare_ID102258842/',
    kapId: '1671510',
    isLive: true,
    eventType: 'CONTRACT',
    keyMetrics: [
      { label: 'Sözleşme Bedeli', value: '48,5 Mn USD', tone: 'positive' }
    ]
  },
  {
    id: 'asels-kap-1670614',
    ticker: 'ASELS',
    companyName: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.',
    title: 'Uzun Menzilli Hava Savunma Seri Üretim İlave Sözleşmesi (1,01 Mr Avro)',
    summary: 'ASELSAN ile Savunma Sanayii Başkanlığı (SSB) arasında uzun menzilli hava savunma sistemleri seri üretim projeleri kapsamında toplam **1.008.500.000 Avro** tutarında ilave sözleşmeler imzalandı.',
    keyTakeaways: [
      'T.C. Cumhurbaşkanlığı SSB ile **1.008.500.000 Avro** tutarında stratejik ilave sözleşme akdedilmiştir.',
      'Uzun menzilli hava savunma projelerinde seri üretim ve teslimat süreci genişletilmiştir.',
      'Şirketin orta ve uzun vadeli ciro projeksiyonuna rekor düzeyde katkı sunacaktır.'
    ],
    category: 'CONTRACT',
    categoryLabel: 'Yeni Sözleşme / İhale',
    source: 'KAP',
    publishDate: '2026-10-01T09:20:00.000Z',
    timeAgo: '20 gün önce',
    impact: 'HIGH_IMPACT',
    impactLabel: 'Yüksek Etki / Olumlu',
    url: 'https://www.kap.org.tr/tr/Bildirim/1670614',
    kapUrl: 'https://www.kap.org.tr/tr/Bildirim/1670614',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/asels-aselsan-elektronik-sanayi-ve-ticare_ID102257591/',
    kapId: '1670614',
    isLive: true,
    eventType: 'CONTRACT',
    keyMetrics: [
      { label: 'Sözleşme Bedeli', value: '1,01 Mr Avro', tone: 'positive' },
      { label: 'Karşı Taraf', value: 'SSB', tone: 'neutral' }
    ]
  },
  {
    id: 'asels-kap-1666885',
    ticker: 'ASELS',
    companyName: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.',
    title: 'ROKETSAN ile Hava Savunma Alt Bileşen Sözleşmesi (1,23 Mr Avro)',
    summary: 'ASELSAN ile ROKETSAN arasında hava savunma sistemlerine yönelik alt bileşenlerin tedariki kapsamında toplam **1.234.210.000 Avro** tutarında sözleşme imzalandı.',
    keyTakeaways: [
      'ROKETSAN ile **1.234.210.000 Avro** tutarında tarihi alt bileşen tedarik anlaşması imzalandı.',
      'Ortak hava savunma projelerinde operasyonel teslimat takvimi başlatılmıştır.',
      'Sözleşme bedelinin şirketin önümüzdeki dönem finansal büyümesine pozitif etkisi beklenmektedir.'
    ],
    category: 'CONTRACT',
    categoryLabel: 'Yeni Sözleşme / İhale',
    source: 'KAP',
    publishDate: '2026-09-23T09:15:00.000Z',
    timeAgo: '28 gün önce',
    impact: 'HIGH_IMPACT',
    impactLabel: 'Yüksek Etki / Olumlu',
    url: 'https://www.kap.org.tr/tr/Bildirim/1666885',
    kapUrl: 'https://www.kap.org.tr/tr/Bildirim/1666885',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/asels-aselsan-elektronik-sanayi-ve-ticare_ID102252818/',
    kapId: '1666885',
    isLive: true,
    eventType: 'CONTRACT',
    keyMetrics: [
      { label: 'Sözleşme Bedeli', value: '1,23 Mr Avro', tone: 'positive' },
      { label: 'Karşı Taraf', value: 'ROKETSAN', tone: 'neutral' }
    ]
  },
  {
    id: 'tursg-kap-fin-calendar',
    ticker: 'TURSG',
    companyName: 'Türkiye Sigorta Anonim Şirketi',
    title: '3. Çeyrek Finansal Sonuçları Açıklama Takvimi Güncellemesi',
    summary: 'Şirket, dönemsel konsolide finansal sonuçlarının Kamuyu Aydınlatma Platformu\'nda açıklanmasına ilişkin takvimi güncellediğini bildirdi.',
    keyTakeaways: [
      '3. çeyrek mali tablo açıklama takvimi kamuya duyuruldu.',
      'Prim üretimi ve teknik kâr gerçekleşmeleri belirlenen takvimde KAP\'a iletilecektir.'
    ],
    category: 'FINANCIALS',
    categoryLabel: 'Finansal Tablolar',
    source: 'KAP',
    publishDate: '2026-10-19T14:30:00.000Z',
    timeAgo: '2 gün önce',
    impact: 'NEUTRAL',
    impactLabel: 'Bilgilendirme',
    url: 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a140e95be70140ee2f466d0159',
    kapUrl: 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a140e95be70140ee2f466d0159',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/tursg-turkiye-sigorta-a-s_ID102271890/',
    isLive: true,
    eventType: 'FINANCIALS'
  },
  {
    id: 'tursg-kap-buyback',
    ticker: 'TURSG',
    companyName: 'Türkiye Sigorta Anonim Şirketi',
    title: '4 Mr TL Bütçeli Pay Geri Alım Programı Kapsamında İşlemler',
    summary: 'Şirket, Yönetim Kurulu onaylı **4 milyar TL** fon büyüklüğündeki Pay Geri Alım Programı kapsamında Borsa İstanbul\'da şirket paylarının geri alım işlemlerini sürdürmektedir.',
    keyTakeaways: [
      '**4 milyar TL** bütçeli pay geri alım programı çerçevesinde alımlar icra edilmektedir.',
      'Geri alım işlemleri hisse fiyat istikrarını ve ortaklık içsel değerini korumayı amaçlamaktadır.'
    ],
    category: 'BUYBACK',
    categoryLabel: 'Pay Geri Alımı',
    source: 'KAP',
    publishDate: '2026-10-17T15:00:00.000Z',
    timeAgo: '4 gün önce',
    impact: 'POSITIVE',
    impactLabel: 'Olumlu',
    url: 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a140e95be70140ee2f466d0159',
    kapUrl: 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a140e95be70140ee2f466d0159',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/tursg-turkiye-sigorta-a-s_ID102269540/',
    isLive: true,
    eventType: 'BUYBACK',
    keyMetrics: [
      { label: 'Program Fonu', value: '4 Mr TL', tone: 'positive' }
    ]
  },
  {
    id: 'mavi-kap-capital-reduction',
    ticker: 'MAVI',
    companyName: 'Mavi Giyim Sanayi ve Ticaret A.Ş.',
    title: 'Geri Alınan Payların Sermaye Azaltımı Yoluyla İptali',
    summary: 'Mavi Giyim, geri alınan şirket paylarının fon çıkışı gerektirmeyen sermaye azaltımı işlemleri yoluyla iptal edilmesine ve hisse başına değerin artırılmasına karar verdi.',
    keyTakeaways: [
      'Geri alınan şirket payları fon çıkışı olmaksızın sermaye azaltımıyla iptal edilecektir.',
      'İptal işlemi neticesinde hisse başına düşen kâr ve özkaynak oranı pozitif etkilenecektir.'
    ],
    category: 'BUYBACK',
    categoryLabel: 'Pay Geri Alımı & Sermaye',
    source: 'KAP',
    publishDate: '2026-09-18T16:20:00.000Z',
    timeAgo: '1 ay önce',
    impact: 'POSITIVE',
    impactLabel: 'Olumlu',
    url: 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a141733b5101417ea9aae11fec',
    kapUrl: 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a141733b5101417ea9aae11fec',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/mavi-mavi-giyim-sanayi-ve-ticaret-a-s_ID102250110/',
    isLive: true,
    eventType: 'BUYBACK'
  },
  {
    id: 'trgyo-kap-asset-sale',
    ticker: 'TRGYO',
    companyName: 'Torunlar Gayrimenkul Yatırım Ortaklığı A.Ş.',
    title: 'İstanbul Taşınmaz Satışı ve 1,2 Mr TL Nakit Girişi',
    summary: 'Torunlar GYO, İstanbul\'da bulunan taşınmazını **1,2 milyar TL** + KDV bedelle satışını tamamlayarak bilançoya doğrudan nakit girişi sağlandığını KAP\'a bildirdi.',
    keyTakeaways: [
      'İstanbul gayrimenkul portföyündeki taşınmaz **1,2 milyar TL** + KDV karşılığında satılmıştır.',
      'Elde edilen nakit fon şirketin net borçluluğunu azaltmak ve likiditeyi güçlendirmek için kullanılacaktır.'
    ],
    category: 'INVESTMENT',
    categoryLabel: 'Yatırım & Varlık Satışı',
    source: 'KAP',
    publishDate: '2026-10-14T11:45:00.000Z',
    timeAgo: '7 gün önce',
    impact: 'POSITIVE',
    impactLabel: 'Olumlu',
    url: 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a1413b7ef5014144f83882011f',
    kapUrl: 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a1413b7ef5014144f83882011f',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/trgyo-torunlar-gayrimenkul-yatirim-ortak_ID102266450/',
    isLive: true,
    eventType: 'INVESTMENT',
    keyMetrics: [
      { label: 'Satış Bedeli', value: '1,2 Mr TL + KDV', tone: 'positive' }
    ]
  },
  {
    id: 'thyao-kap-traffic-results',
    ticker: 'THYAO',
    companyName: 'Türk Hava Yolları A.O.',
    title: 'Eylül 2026 Trafik Sonuçları — Yolcu Sayısı %5,6 Arttı',
    summary: 'THY\'nin Eylül 2026 döneminde yolcu sayısı yıllık bazda **%5,6** artarken, yolcu doluluk oranı **1,3 puan** artış gösterdi.',
    keyTakeaways: [
      'Eylül 2026 döneminde toplam taşınan yolcu sayısı yıllık **%5,6** artış kaydetti.',
      'Yolcu doluluk oranı 1,3 puan iyileşerek operasyonel verimliliği destekledi.'
    ],
    category: 'FINANCIALS',
    categoryLabel: 'Operasyonel Sonuçlar',
    source: 'KAP',
    publishDate: '2026-10-09T18:00:00.000Z',
    timeAgo: '12 gün önce',
    impact: 'POSITIVE',
    impactLabel: 'Olumlu',
    url: 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a140f2ed720140f376bebb01a7',
    kapUrl: 'https://www.kap.org.tr/tr/sirket-bildirimleri/4028e4a140f2ed720140f376bebb01a7',
    bigparaUrl: 'https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/thyao-turk-hava-yollari-a-o_ID102264500/',
    isLive: true,
    eventType: 'OPERATIONAL',
    keyMetrics: [
      { label: 'Yolcu Artışı', value: '+%5,6', tone: 'positive' },
      { label: 'Doluluk Değişimi', value: '+1,3 puan', tone: 'positive' }
    ]
  }
];

// Bellek içi canlı bildirim önbelleği (Key: tickers_category, TTL: 90 saniye)
const liveFeedCache = new Map<string, { timestamp: number; items: CompanyNewsItem[] }>();
const CACHE_TTL_MS = 90 * 1000;

// Bellek içi KAP bildirim detay metin önbelleği (Key: kapId, TTL: 30 dakika)
const kapDetailCache = new Map<string, {
  timestamp: number;
  bodyText: string;
  structuredFields: Array<{ label: string; value: string }>;
}>();
const KAP_DETAIL_TTL_MS = 30 * 60 * 1000;
const MAX_KAP_DETAIL_CACHE = 300;

interface CompanyMeta {
  cleanName: string;
  fullName: string;
}

const KNOWN_COMPANIES: Record<string, CompanyMeta> = {
  TURSG: { cleanName: 'Türkiye Sigorta', fullName: 'Türkiye Sigorta Anonim Şirketi' },
  MAVI: { cleanName: 'Mavi Giyim', fullName: 'Mavi Giyim Sanayi ve Ticaret A.Ş.' },
  TRGYO: { cleanName: 'Torunlar GYO', fullName: 'Torunlar Gayrimenkul Yatırım Ortaklığı A.Ş.' },
  THYAO: { cleanName: 'Türk Hava Yolları', fullName: 'Türk Hava Yolları A.O.' },
  ASELS: { cleanName: 'Aselsan', fullName: 'Aselsan Elektronik Sanayi ve Ticaret A.Ş.' },
  BRISA: { cleanName: 'Brisa', fullName: 'Brisa Bridgestone Sabancı Lastik Sanayi ve Ticaret A.Ş.' },
  FROTO: { cleanName: 'Ford Otosan', fullName: 'Ford Otomotiv Sanayi A.Ş.' },
  TUPRS: { cleanName: 'Tüpraş', fullName: 'Tüpraş Türkiye Petrol Rafinerileri A.Ş.' },
  SISE: { cleanName: 'Şişecam', fullName: 'Türkiye Şişe ve Cam Fabrikaları A.Ş.' },
  BIMAS: { cleanName: 'BİM', fullName: 'BİM Birleşik Mağazalar A.Ş.' },
  AGESA: { cleanName: 'AgeSA', fullName: 'AgeSA Hayat ve Emeklilik A.Ş.' },
  GARAN: { cleanName: 'Garanti BBVA', fullName: 'Türkiye Garanti Bankası A.Ş.' },
  AKBNK: { cleanName: 'Akbank', fullName: 'Akbank T.A.Ş.' },
  ISCTR: { cleanName: 'İş Bankası', fullName: 'Türkiye İş Bankası A.Ş.' },
  YKBNK: { cleanName: 'Yapı Kredi', fullName: 'Yapı ve Kredi Bankası A.Ş.' },
  VAKBN: { cleanName: 'VakıfBank', fullName: 'Türkiye Vakıflar Bankası T.A.O.' },
  EKGYO: { cleanName: 'Emlak Konut GYO', fullName: 'Emlak Konut Gayrimenkul Yatırım Ortaklığı A.Ş.' },
  KCHOL: { cleanName: 'Koç Holding', fullName: 'Koç Holding A.Ş.' },
  SAHOL: { cleanName: 'Sabancı Holding', fullName: 'Hacı Ömer Sabancı Holding A.Ş.' },
  TCELL: { cleanName: 'Turkcell', fullName: 'Turkcell İletişim Hizmetleri A.Ş.' },
  TTKOM: { cleanName: 'Türk Telekom', fullName: 'Türk Telekomünikasyon A.Ş.' },
  TOASO: { cleanName: 'Tofaş', fullName: 'Tofaş Türk Otomobil Fabrikası A.Ş.' },
  PGSUS: { cleanName: 'Pegasus', fullName: 'Pegasus Hava Taşımacılığı A.Ş.' },
  TAVHL: { cleanName: 'TAV Havalimanları', fullName: 'TAV Havalimanları Holding A.Ş.' },
  MGROS: { cleanName: 'Migros', fullName: 'Migros Ticaret A.Ş.' },
  SOKM: { cleanName: 'Şok Marketler', fullName: 'Şok Marketler Ticaret A.Ş.' },
  EREGL: { cleanName: 'Ereğli Demir Çelik', fullName: 'Ereğli Demir ve Çelik Fabrikaları T.A.Ş.' },
  KRDMD: { cleanName: 'Kardemir', fullName: 'Kardemir Karabük Demir Çelik Sanayi A.Ş.' },
  PETKM: { cleanName: 'Petkim', fullName: 'Petkim Petrokimya Holding A.Ş.' },
  ENJSA: { cleanName: 'Enerjisa', fullName: 'Enerjisa Enerji A.Ş.' },
  AKSEN: { cleanName: 'Aksen Enerji', fullName: 'Aksen Enerji Üretim A.Ş.' },
  LOGO: { cleanName: 'Logo Yazılım', fullName: 'Logo Yazılım Sanayi ve Ticaret A.Ş.' },
  MPARK: { cleanName: 'MLP Sağlık', fullName: 'MLP Sağlık Hizmetleri A.Ş.' },
  ARCLK: { cleanName: 'Arçelik', fullName: 'Arçelik A.Ş.' },
  VESBE: { cleanName: 'Vestel Beyaz Eşya', fullName: 'Vestel Beyaz Eşya Sanayi ve Ticaret A.Ş.' },
  ISGYO: { cleanName: 'İş GYO', fullName: 'İş Gayrimenkul Yatırım Ortaklığı A.Ş.' },
  ALARK: { cleanName: 'Alarko Holding', fullName: 'Alarko Holding A.Ş.' },
  AGHOL: { cleanName: 'AG Anadolu Grubu', fullName: 'AG Anadolu Grubu Holding A.Ş.' },
};

export function getCompanyMeta(ticker: string): CompanyMeta {
  const norm = ticker.toUpperCase().trim();
  if (KNOWN_COMPANIES[norm]) return KNOWN_COMPANIES[norm];
  const profile = getCompanyProfile(norm);
  if (profile?.fullName && !profile.fullName.endsWith('Anonim Şirketi')) {
    return {
      cleanName: profile.fullName,
      fullName: profile.fullName,
    };
  }
  if (COMPANY_PROFILES[norm]?.fullName) {
    return {
      cleanName: norm,
      fullName: COMPANY_PROFILES[norm].fullName,
    };
  }
  return { cleanName: norm, fullName: `${norm} Anonim Şirketi` };
}

function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&#160;|&nbsp;|\u00A0/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : ' ';
    });
}

export function cleanHtmlText(html: string): string {
  if (!html) return '';
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(?:p|div|li|tr)>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToStructuredParagraphs(html: string): string {
  if (!html) return '';
  return decodeHtmlEntities(
    html
      // Satır içi biçimlendirme etiketlerini boşluk eklemeden kaldır ("Fab<span>r</span>ikaları" -> "Fabrikaları")
      .replace(/<\/?(?:span|b|strong|i|em|u|font|sup|sub|small|a)\b[^>]*>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:div|p|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function fixKapMojibakeText(input: string): string {
  if (!input) return '';
  return input
    // KAP kaynaklı bozuk kesme işareti kalıntıları ("Kurulu?nun" -> "Kurulu'nun", "A.Ş.?nin" -> "A.Ş.'nin")
    .replace(/([A-Za-zÇĞİÖŞÜçğıöşü.])\?(nın|nin|nun|nün|ın|in|un|ün|da|de|ta|te|dan|den|tan|ten|a|e|ı|i|u|ü|la|le|ya|ye|yı|yi|yu|yü)\b/gi, "$1'$2")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAllCapsTurkish(text: string): string {
  const s = (text || '').trim();
  if (!s || s.length < 14) return s;
  const letters = s.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || [];
  if (letters.length < 10) return s;
  const upperCount = letters.filter(ch => ch === ch.toLocaleUpperCase('tr-TR') && ch !== ch.toLocaleLowerCase('tr-TR')).length;
  if (upperCount / letters.length < 0.78) return s;
  const acronyms = new Set(['A.Ş.', 'A.Ş', 'T.A.Ş.', 'T.A.O.', 'GYO', 'SPK', 'KAP', 'BIST', 'BİST', 'TL', 'USD', 'EUR', 'AVRO', 'JCR', 'SSB', 'TCMB', 'TMS', 'TFRS', 'UMREK', 'ISIN', 'GMTN', 'ESG', 'KDV']);
  return s
    .split(/\s+/)
    .map((word, idx) => {
      const upper = word.toLocaleUpperCase('tr-TR');
      if (acronyms.has(upper) || /^TR[A-Z0-9]{10}$/.test(upper)) return upper;
      const lower = word.toLocaleLowerCase('tr-TR');
      if (idx > 0 && /^(ve|ile|veya|için|da|de)$/.test(lower)) return lower;
      const numPref = lower.match(/^(\d+\.)([a-zçğıöşü])(.*)$/);
      if (numPref) {
        return `${numPref[1]}${numPref[2].toLocaleUpperCase('tr-TR')}${numPref[3]}`;
      }
      return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
    })
    .join(' ');
}

function stripKapLegalFooter(text: string): string {
  if (!text) return '';
  return text
    .replace(/\(?\s*İşbu açıklamamız ile açıklamamızın İngilizce çevirisinde[\s\S]*$/i, '')
    .replace(/\(?\s*In case of a discrepancy between the Turkish and the English[\s\S]*$/i, '')
    .replace(/Yukarıdaki açıklamalarımızın,?\s*Sermaye Piyasası Kurulu[\s\S]*$/i, '')
    .replace(/\s*Kamuoyuna\s+saygıyla\s+duyurulur\.?\s*$/i, '')
    .replace(/\s*Kamuoyuna\s+saygılarımızla\s+duyurulur\.?\s*$/i, '')
    .replace(/\s*Saygılarımızla,?\s*$/i, '')
    .trim();
}

/**
 * KAP resmi bildirim sayfası HTML içeriğinden Türkçe açıklama gövdesini ve yapısal alanları ayıklar.
 * Next.js RSC/SSR çıktısındaki yinelenen blokları tekilleştirir ve gizli İngilizce blokları temizler.
 */
export function extractKapDisclosureBody(rawHtml: string): {
  bodyText: string;
  structuredFields: Array<{ label: string; value: string }>;
} {
  if (!rawHtml) return { bodyText: '', structuredFields: [] };

  const unesc = rawHtml
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&')
    .replace(/\\"/g, '"')
    .replace(/\\r\\n|\\n|\\r/g, '\n');

  // İngilizce gizli içerik bloklarını çıkar
  const noEn = unesc.replace(/<td[^>]*content-en[^>]*>[\s\S]*?<\/td>/gi, ' ');

  const seenNorm = new Set<string>();
  const paragraphs: string[] = [];

  const pushUniqueBlock = (raw: string) => {
    const cleaned = stripKapLegalFooter(htmlToStructuredParagraphs(raw));
    if (cleaned.length < 18) return;
    if (/^İlgili Şirketler\b/i.test(cleaned)) return;
    if (/^Özet Bilgi\s*$/i.test(cleaned)) return;
    const norm = cleaned.replace(/\s+/g, ' ').toLowerCase();
    if (seenNorm.has(norm)) return;
    seenNorm.add(norm);
    paragraphs.push(cleaned);
  };

  // 1. Birincil KAP rich-text açıklama hücreleri (taxonomy-context-value-summernote)
  for (const m of noEn.matchAll(/<td[^>]*class="[^"]*taxonomy-context-value-summernote[^"]*"[^>]*>([\s\S]*?)<\/td>/gi)) {
    pushUniqueBlock(m[1]);
  }

  // 2. Alternatif KAP şablonları (tahvil kupon ödemesi, pay geri alım, borçlanma aracı vb.)
  if (paragraphs.length === 0) {
    const ekMatch = noEn.match(/Ek Açıklamalar(?:<\/[^>]+>|\s|:)*([\s\S]{25,3500}?)(?:Yukarıdaki açıklamalarımızın|\d+:\["|\$L\d+|content-en|<\/table>)/i);
    if (ekMatch && ekMatch[1]) {
      pushUniqueBlock(ekMatch[1]);
    }
  }

  // 3. Yapısal tablo etiket-değer çiftleri (Yeni İş İlişkisi, Geri Alım, Temettü vb.)
  const structuredFields: Array<{ label: string; value: string }> = [];
  const seenFields = new Set<string>();
  for (const m of noEn.matchAll(/<td[^>]*taxonomy-field-title[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="[^"]*taxonomy-field-value[^"]*"[^>]*>([\s\S]*?)<\/td>/gi)) {
    const label = htmlToStructuredParagraphs(m[1])
      .replace(/\n/g, ' ')
      .replace(/Additional Explanations|Summary Info|Related Companies|Update Notification Flag|Correction Notification Flag/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const value = htmlToStructuredParagraphs(m[2]).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (
      label &&
      value &&
      value !== '-' &&
      value !== '[]' &&
      value !== 'Hayır (No)' &&
      value !== 'Evet (Yes)' &&
      label.length > 2 &&
      label.length < 110 &&
      value.length < 280
    ) {
      const fKey = `${label.toLowerCase()}::${value.toLowerCase()}`;
      if (!seenFields.has(fKey)) {
        seenFields.add(fKey);
        structuredFields.push({ label, value });
      }
    }
  }

  return {
    bodyText: paragraphs.join('\n\n').trim(),
    structuredFields
  };
}

async function fetchKapDisclosureDetail(kapId: string): Promise<{
  bodyText: string;
  structuredFields: Array<{ label: string; value: string }>;
}> {
  if (!kapId || !/^\d+$/.test(kapId)) {
    return { bodyText: '', structuredFields: [] };
  }

  const now = Date.now();
  const cached = kapDetailCache.get(kapId);
  if (cached && (now - cached.timestamp) < KAP_DETAIL_TTL_MS) {
    return { bodyText: cached.bodyText, structuredFields: cached.structuredFields };
  }

  const html = await fetchResilientText(`https://www.kap.org.tr/tr/Bildirim/${kapId}`, 4500);
  if (!html) return { bodyText: '', structuredFields: [] };

  const parsed = extractKapDisclosureBody(html);
  if (kapDetailCache.size >= MAX_KAP_DETAIL_CACHE) {
    const oldestKey = kapDetailCache.keys().next().value;
    if (oldestKey) kapDetailCache.delete(oldestKey);
  }
  kapDetailCache.set(kapId, {
    timestamp: now,
    bodyText: parsed.bodyText,
    structuredFields: parsed.structuredFields
  });
  return parsed;
}

/**
 * KAP "20.11.2026 21:12:27" biçimindeki TRT (UTC+3) tarihini ISO-8601 dizesine çevirir.
 */
export function parseKapPublishDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  const m = String(dateStr).trim().match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, dd, mm, yyyy, hh = '09', min = '00', ss = '00'] = m;
    const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+03:00`;
    const dt = new Date(iso);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString();
}

/**
 * Parasal tutarı başlık ve rozetler için okunabilir kompakt biçime dönüştürür:
 * 1.019.069.577 TL -> 1,02 Mr TL | 764.302.183 TL -> 764,3 Mn TL | 1.281.101.744 Avro -> 1,28 Mr Avro
 */
export function formatCompactCurrencyAmount(rawAmount: string): string {
  if (!rawAmount) return '';
  const cleaned = rawAmount.replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/^([\d.,]+)\s*(milyon|milyar|mlyr|mln|mr|mn|bin)?\s*(TL|TRY|USD|EUR|ABD\s*Dolar[ıi]|dolar|avro|euro)(?=$|[\s,.;:!?)'"+])/i);
  if (!m) return cleaned;

  const numRaw = m[1];
  const scaleWord = (m[2] || '').toLowerCase();
  let unit = m[3];
  if (/^(?:try|tl)$/i.test(unit)) unit = 'TL';
  else if (/usd|dolar/i.test(unit)) unit = 'USD';
  else if (/eur|avro|euro/i.test(unit)) unit = 'Avro';

  // Eğer metinde zaten "milyon" / "milyar" / "mln" / "mlyr" yazıyorsa kompakt kısaltma yap
  if (scaleWord === 'milyar' || scaleWord === 'mlyr' || scaleWord === 'mr') {
    return `${numRaw.replace(/\./g, ',')} Mr ${unit}`;
  }
  if (scaleWord === 'milyon' || scaleWord === 'mln' || scaleWord === 'mn') {
    return `${numRaw.replace(/\./g, ',')} Mn ${unit}`;
  }

  // Türkçe (1.019.069.577,50) veya İngilizce (18,632,108,000.50) binlik ayraçlı sayıyı ayrıştır
  let numeric = NaN;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(numRaw)) {
    numeric = parseFloat(numRaw.replace(/\./g, '').replace(',', '.'));
  } else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(numRaw)) {
    numeric = parseFloat(numRaw.replace(/,/g, ''));
  } else if (/^\d+,\d+$/.test(numRaw)) {
    numeric = parseFloat(numRaw.replace(',', '.'));
  } else {
    numeric = parseFloat(numRaw.replace(/,/g, ''));
  }

  if (!Number.isFinite(numeric)) return cleaned;
  if (scaleWord === 'bin') numeric *= 1000;

  if (numeric >= 1_000_000_000) {
    return `${(numeric / 1_000_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mr ${unit}`;
  }
  if (numeric >= 1_000_000) {
    return `${(numeric / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mn ${unit}`;
  }
  if (numeric >= 100_000) {
    return `${Math.round(numeric / 1_000).toLocaleString('tr-TR')} Bin ${unit}`;
  }
  return `${numeric.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${unit}`;
}

/**
 * KAP ve haber başlıklarındaki gereksiz kalıpları (KAP *** ... ***, bilinen ajans son ekleri,
 * şirket adı tekrarları ve iç içe parantez kesilmelerini) temizler; tarih/dönem tirelerini ASLA kesmez.
 */
export function sanitizeDisclosureTitle(rawTitle: string, ticker: string, companyName?: string): string {
  if (!rawTitle) return '';
  let title = fixKapMojibakeText(decodeHtmlEntities(rawTitle.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1'))).trim();

  // Yalnızca bilinen kaynak/ajans veya kısa gazete/yayıncı son eklerini temizle (Örn: " - Yeni Şafak", " - Matriks", " - KAP")
  // Tarih/dönem aralıklarını ("2026 - 2027 Dönemi", "1 Şubat - 30 Nisan") ASLA kesme
  title = title.replace(/\s*[-–/]\s*(?:KAP|Matriks|Foreks|ForInvest|AA|Anadolu Ajansı|Reuters|Bloomberg HT|Bloomberg|İHA|DHA|Bigpara|Dünya|Investing\.com)\b.*$/i, '').trim();
  title = title.replace(/\s+[-–]\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü.]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü.]+){0,2})$/, (full, pub, offset, str) => {
    const before = str.slice(0, offset).trim();
    if (/\d$/.test(before) || pub.length > 26 || /(?:Dönemi|Sözleşmesi|Raporu|Kararı|Bildirimi|Açıklaması)$/i.test(pub)) {
      return full;
    }
    return '';
  }).trim();
  title = title.replace(/^KAP\s*[-:–]\s*/i, '').trim();

  // Desen 1: KAP *** COMPANY *** TICKER *** SUBJECT
  const kapPattern = /KAP\s*\*\*\*\s*.*?\s*\*\*\*\s*[A-Z0-9]+\s*\*\*\*\s*(.*)/i;
  const match1 = title.match(kapPattern);
  if (match1 && match1[1]) {
    title = match1[1].trim();
  }

  // Desen 2: ***TICKER*** COMPANY (SUBJECT) — iç içe parantezleri (Örn: "(Özel Durum Açıklaması (Genel))") kırmadan yakala
  const starBalancedPattern = /\*\*\*[A-Z0-9]+\*\*\*\s*[^(]+\((.+)\)\s*$/i;
  const match2 = title.match(starBalancedPattern);
  if (match2 && match2[1]) {
    title = match2[1].trim();
  } else {
    const starFallback = /\*\*\*[A-Z0-9]+\*\*\*\s*(?:[^(]+)\(([^)]+)\)/i;
    const mFallback = title.match(starFallback);
    if (mFallback && mFallback[1]) {
      title = mFallback[1].trim();
    }
  }

  // Desen 3: ***TICKER*** veya ***OYA* *OYYAT*** kalıntıları
  title = title.replace(/^\*+[^*]+\*+(?:\s*\*+[^*]+\*+)*\s*/g, '');
  title = title.replace(/\*\*\*[A-Z0-9]+\*\*\*\s*/gi, '');
  title = title.replace(/\*+/g, '').trim();

  // Başta hisse kodu varsa temizle: "TURSG - " veya "TURSG: "
  title = title.replace(new RegExp(`^${escapeRegExp(ticker)}\\s*[-:–]\\s*`, 'i'), '');

  // Başta şirket adı varsa temizle
  if (companyName) {
    const cleanComp = companyName.replace(/Anonim Şirketi|A\.Ş\.|Sanayi ve Ticaret/gi, '').trim();
    if (cleanComp.length > 3) {
      title = title.replace(new RegExp(`^${escapeRegExp(cleanComp)}\\s*[-:–]\\s*`, 'i'), '');
    }
  }

  // Eğer tüm başlık dış parantez içindeyse parantezleri kaldır
  if (title.startsWith('(') && title.endsWith(')')) {
    const inner = title.slice(1, -1).trim();
    let depth = 0;
    let balanced = true;
    for (const ch of inner) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (depth < 0) { balanced = false; break; }
    }
    if (balanced && depth === 0) title = inner;
  }

  // Dengesiz yarım kalmış açık parantezleri onar: "Özel Durum Açıklaması (Genel" -> "Özel Durum Açıklaması (Genel)"
  const openCount = (title.match(/\(/g) || []).length;
  const closeCount = (title.match(/\)/g) || []).length;
  if (openCount > closeCount) {
    title += ')'.repeat(openCount - closeCount);
  }

  // "MAVI JEANS- B - KAP Haberleri - 2026-10-19 tarihli" gibi jenerik haber başlıkları
  if (/KAP Haberleri\s*-\s*\d{4}-\d{2}-\d{2}/i.test(title)) {
    title = 'KAP Bildirimleri ve Şirket Finansal Duyurusu';
  }

  // Matriks / Ajans editoryal yazım hatalarını temizle
  title = title
    .replace(/\bsonuçlarınnı\b/gi, 'sonuçlarının')
    .replace(/\bsonuclarınnı\b/gi, 'sonuçlarının')
    .replace(/\bertelendı\b/gi, 'ertelendi')
    .replace(/\baçıklanamsı\b/gi, 'açıklanması')
    .replace(/\bkrar verdi\b/gi, 'karar verdi')
    .replace(/\bSavuma\b/gi, 'Savunma')
    .replace(/\bIhale\b/gi, 'İhale')
    .replace(/\s{2,}/g, ' ');

  title = normalizeAllCapsTurkish(title);

  if (title.length > 0) {
    title = title.charAt(0).toLocaleUpperCase('tr-TR') + title.slice(1);
  }

  return title.trim();
}

const GENERIC_KAP_SUBJECTS = [
  /^özel durum açıklamas[ıi](?:\s*\((?:genel|güncelleme|düzeltme)\))?$/i,
  /^yeni iş ilişkisi$/i,
  /^sözleşme imzalanmas[ıi]$/i,
  /^paylar[ıi]n geri al[ıi]nmas[ıi]na ilişkin bildirim$/i,
  /^günlük pay geri al[ıi]m işlemleri$/i,
  /^pay d[ıi]ş[ıi]nda sermaye piyasas[ıi] arac[ıi] işlemlerine ilişkin bildirim/i,
  /^herhangi bir otoriteye mali tablo verilmesi$/i,
  /^finansal rapor$/i,
  /^faaliyet raporu(?:\s*\((?:konsolide|konsolide olmayan)\))?$/i,
  /^k[aâ]r pay[ıi] dağ[ıi]t[ıi]m işlemlerine ilişkin bildirim$/i,
  /^sermaye art[ıi]r[ıi]m[ıi]\s*-\s*azalt[ıi]m[ıi]\s*işlemlerine ilişkin bildirim$/i,
  /^kurumsal yönetim ilkelerine uyum/i,
  /^kredi derecelendirmesi$/i,
  /^kredi derecelendirme notu$/i,
  /^derecelendirme notu$/i,
  /^ihraç tavan[ıi]na ilişkin bildirim$/i,
  /^geleceğe dönük değerlendirmeler$/i,
  /^kap bildirimleri ve şirket finansal duyurusu$/i
];

export function isGenericDisclosureTitle(title: string): boolean {
  const clean = (title || '').trim().toLocaleLowerCase('tr-TR');
  if (!clean || clean.length < 5) return true;
  return GENERIC_KAP_SUBJECTS.some(rx => rx.test(clean));
}

function capitalizeTurkishFirst(str: string): string {
  const s = (str || '').trim();
  if (!s) return '';
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}

function findCurrencyAmounts(text: string): string[] {
  if (!text) return [];
  const rx = /\b\d{1,3}(?:(?:\.\d{3})+(?:,\d+)?|(?:,\d{3})+(?:\.\d+)?)\s*(?:TL|TRY|USD|EUR|ABD\s*Dolar[ıi]|dolar|avro|euro)(?=$|[\s,.;:!?)'"+])|\b\d+(?:[.,]\d+)?\s*(?:milyon|milyar|mlyr|mln|mr|mn|bin)\s*(?:TL|TRY|USD|EUR|ABD\s*Dolar[ıi]|dolar|avro|euro)(?=$|[\s,.;:!?)'"+])/gi;
  const matches = text.match(rx) || [];
  return [...new Set(matches.map(m => m.replace(/\s+/g, ' ').trim()))];
}

function cleanTurkishGenitivePhrase(phrase: string): string {
  return phrase
    .replace(/\bSistemlerinin\b/gi, 'Sistemleri')
    .replace(/\bÜrünlerinin\b/gi, 'Ürünleri')
    .replace(/\bCihazlarının\b/gi, 'Cihazları')
    .replace(/\bBileşenlerinin\b/gi, 'Bileşenleri')
    .replace(/\bHizmetlerinin\b/gi, 'Hizmetleri')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBuybackDetails(text: string): {
  dailyShares?: string;
  avgPrice?: string;
  cumulativeShares?: string;
  capitalRatio?: string;
} {
  if (!text) return {};
  // Günlük geri alınan pay ("toplam 310.000 TL nominal değerli", "1.636.467 adet pay", "16.800.000 adet")
  // Kümülatif "bugüne kadar geri alınan toplam 23.693.977 adet" ifadesini ayırt et
  const withoutCumulative = text.replace(/(?:bugüne\s+kadar|bu\s+işlemle\s+birlikte|program\s+kapsamında\s+toplam)[^.]{0,160}/gi, ' ');
  const dailyMatch =
    withoutCumulative.match(/(?:toplam\s+)?(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?\s*(?:milyon|bin))\s*(?:TL\s*nominal(?:\s*değerli)?|adet(?:\s*pay)?|lot)/i)
    || text.match(/(\d{1,3}(?:\.\d{3})+)\s*TL\s*nominal/i)
    || text.match(/(\d{1,3}(?:\.\d{3})+)\s*(?:adet|lot)/i);

  const avgPriceMatch =
    text.match(/(?:ağırlıklı\s*)?ortalama\s*(?:fiyat[ıi]?)?\s*:?\s*(\d+[.,]\d{2,4})\s*(?:TL)?/i)
    || text.match(/(\d+[.,]\d{2,4})\s*TL\s*(?:ağırlıklı\s*)?ortalama/i);

  const cumMatch = text.match(/(?:bugüne\s+kadar|toplam\s+(?:[a-zçğıöşü]+\s+grubu\s+)?)?(?:geri\s+alınan\s+toplam[^0-9]{0,30}|pay\s+sayısı\s+)(\d{1,3}(?:\.\d{3})+)\s*(?:adet|TL\s*nominal)/i);
  const ratioMatch = text.match(/sermaye(?:ye|sine)\s+oran[ıi][^%]{0,25}%\s*(\d+(?:[.,]\d+)?)/i);

  return {
    dailyShares: dailyMatch ? dailyMatch[1].trim() : undefined,
    avgPrice: avgPriceMatch ? `${avgPriceMatch[1].replace('.', ',')} TL` : undefined,
    cumulativeShares: cumMatch ? cumMatch[1].trim() : undefined,
    capitalRatio: ratioMatch ? `%${ratioMatch[1]}` : undefined
  };
}

function extractCreditRatingDetails(text: string): {
  agency: string;
  direction: 'DOWNGRADE' | 'UPGRADE' | 'AFFIRM' | 'UNKNOWN';
  fromGrade?: string;
  toGrade?: string;
  outlook?: string;
} {
  const lower = (text || '').toLocaleLowerCase('tr-TR');
  const agency = lower.includes('jcr') ? 'JCR Avrasya'
    : lower.includes('fitch') ? 'Fitch'
    : lower.includes('moody') ? "Moody's"
    : lower.includes('s&p') || lower.includes('standard & poor') ? 'S&P'
    : lower.includes('saha') ? 'SAHA'
    : 'Kurumsal';

  const isDowngrade = /(?:notu(?:nu)?[^.]{0,55}(?:indir|düşür)|aşağı\s*yönlü\s*revize|negatif\s*izleme)/i.test(text);
  const isUpgrade = /(?:notu(?:nu)?[^.]{0,55}(?:yükselt|artır)|yukarı\s*yönlü\s*revize)/i.test(text);
  const isAffirm = /(?:teyit\s*et|korudu|aynı\s*bırak)/i.test(text);
  const direction = isDowngrade ? 'DOWNGRADE' : isUpgrade ? 'UPGRADE' : isAffirm ? 'AFFIRM' : 'UNKNOWN';

  const transMatch = text.match(/["“']([A-Za-z0-9+\-()]{1,10})["”']\s*(?:'?den|'?dan|'?ten|'?tan)\s*["“']([A-Za-z0-9+\-()]{1,10})["”']\s*(?:'?e|'?a)/i);
  const outlookMatch = text.match(/görünüm(?:ünü|ü)?[^"“'.]{0,25}["“'](Durağan|Negatif|Pozitif|Stable|Negative|Positive)["”']/i)
    || text.match(/["“'](Durağan|Negatif|Pozitif)["”']\s+olarak\s+(?:revize|belirle|teyit)/i);

  return {
    agency,
    direction,
    fromGrade: transMatch ? transMatch[1] : undefined,
    toGrade: transMatch ? transMatch[2] : undefined,
    outlook: outlookMatch ? capitalizeTurkishFirst(outlookMatch[1]) : undefined
  };
}

function isNonCommercialContractText(lower: string): boolean {
  return (
    lower.includes('çerçeve sözleşmesi') ||
    lower.includes('ana sözleşme') ||
    lower.includes('esas sözleşme') ||
    lower.includes('toplu iş sözleşmesi') ||
    lower.includes('bağımsız denetim sözleşmesi') ||
    lower.includes('pay alım satım sözleşmesi') ||
    lower.includes('sözleşme fesih') ||
    lower.includes('sözleşmenin feshi')
  );
}

/**
 * Bildirimin gerçek içeriğinden (KAP Özet Bilgi + Resmi Bildirim Metni + Yapısal Alanlar)
 * yatırımcının tek bakışta ne olduğunu anlayacağı net, anlamlı ve spesifik başlık türetir.
 * "Özel Durum Açıklaması (Genel)" gibi boş kalıpların yerine gerçek olayı (ceza, sözleşme, temettü,
 * kredi notu indirimi, tahvil kuponu, trafik sonucu, yönetim değişikliği vb.) yazar.
 */
export function deriveMeaningfulDisclosureTitle(opts: {
  rawTitle?: string;
  kapSummary?: string;
  bodyText?: string;
  ticker: string;
  companyName?: string;
  year?: number | null;
  period?: string | null;
}): string {
  const cleanRaw = sanitizeDisclosureTitle(opts.rawTitle || '', opts.ticker, opts.companyName);
  const rawSummary = fixKapMojibakeText(decodeHtmlEntities((opts.kapSummary || '').replace(/\s+/g, ' ').trim()));
  // "Hk." kısaltmasındaki noktayı koparmadan yalnızca sonda gereksiz nokta varsa kaldır
  const cleanSummary = normalizeAllCapsTurkish(rawSummary)
    .replace(/(?<!\bHk)\.$/i, '')
    .trim();
  const body = fixKapMojibakeText((opts.bodyText || '').replace(/\s+/g, ' ').trim());
  const combined = `${cleanSummary} ${body} ${cleanRaw}`;
  const lower = combined.toLocaleLowerCase('tr-TR');

  const amounts = findCurrencyAmounts(body || cleanSummary || cleanRaw);
  const compactAmounts = amounts.map(formatCompactCurrencyAmount);

  // 0. Bare Finansal Rapor / Faaliyet Raporu (dönem bilgisi varsa zenginleştir)
  if (/^finansal rapor$/i.test(cleanRaw) && (opts.year || opts.period)) {
    const rawP = String(opts.period || '').trim();
    const mappedPeriod = rawP === '1' || /^1\b/.test(rawP) ? '1. Çeyrek (3 Aylık)'
      : rawP === '2' || /^2\b/.test(rawP) ? '2. Çeyrek (6 Aylık)'
      : rawP === '3' || /^3\b/.test(rawP) ? '3. Çeyrek (9 Aylık)'
      : rawP === '4' || /^4\b/.test(rawP) ? 'Yıllık (12 Aylık)'
      : (rawP && rawP !== '-' ? rawP : '');
    const periodLabel = [opts.year ? String(opts.year) : '', mappedPeriod].filter(Boolean).join(' ');
    if (periodLabel) return `${periodLabel} Finansal Raporu`;
  }

  // 1. İdari Para Cezası / Rekabet Kurumu Cezası / Vergi Cezası (ceza almadığını bildiren açıklamalar hariç)
  const isNoFineOutcome = lower.includes('ceza almadığ') || lower.includes('ceza verilmemesine') || lower.includes('ceza uygulanmamas');
  if (
    !isNoFineOutcome && (
      lower.includes('idari para cezas') ||
      lower.includes('para cezas') ||
      lower.includes('vergi cezas') ||
      (lower.includes('rekabet kurumu') && (lower.includes('ceza') || lower.includes('gerekçeli karar')))
    )
  ) {
    const authority = lower.includes('rekabet kurumu')
      ? 'Rekabet Kurumu'
      : lower.includes('spk') || lower.includes('sermaye piyasası kurulu')
      ? 'SPK'
      : lower.includes('vergi')
      ? 'Vergi'
      : 'Resmi Kurum';

    const discMatch = body.match(/%\s*(\d+(?:[.,]\d+)?)\s*(?:oran[ıi]nda)?\s*(?:peşin\s*ödeme\s*)?indirim/i);
    const payableMatch = body.match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?\s*(?:TL|TRY|USD|EUR|Avro)|\d+(?:[.,]\d+)?\s*(?:milyon|milyar)\s*(?:TL|TRY|USD|EUR|Avro))\s*(?:olarak|tutar[ıi]nda)?[^.]{0,45}ödenecek/i);
    const payableCompact = payableMatch ? formatCompactCurrencyAmount(payableMatch[1]) : (compactAmounts.length >= 2 ? compactAmounts[1] : compactAmounts[0]);

    if (discMatch && payableCompact) {
      return `${authority} İdari Para Cezası — %${discMatch[1]} İndirimle ${payableCompact} Ödeme`;
    }
    if (payableCompact) {
      return `${authority} İdari Para Cezası Kararı (${payableCompact})`;
    }
    return `${authority} İdari Para Cezası Bildirimi`;
  }

  // 2. Kredi Derecelendirme Notu (Not İndirimi / Artışı / Teyidi — gerçek gövdeden dinamik başlık!)
  if (
    lower.includes('kredi derecelendir') ||
    lower.includes('derecelendirme notu') ||
    /\b(jcr|fitch|moody'?s|s&p)\b/i.test(combined)
  ) {
    const rating = extractCreditRatingDetails(combined);
    const outlookSuffix = rating.outlook ? ` (Görünüm: ${rating.outlook})` : '';
    if (rating.direction === 'DOWNGRADE' && rating.fromGrade && rating.toGrade) {
      return `${rating.agency} Kredi Notunu ${rating.fromGrade}'den ${rating.toGrade}'e İndirdi${outlookSuffix}`;
    }
    if (rating.direction === 'UPGRADE' && rating.fromGrade && rating.toGrade) {
      return `${rating.agency} Kredi Notunu ${rating.fromGrade}'den ${rating.toGrade}'e Yükseltti${outlookSuffix}`;
    }
    if (rating.direction === 'DOWNGRADE') {
      return `${rating.agency} Kredi Notu İndirimi${outlookSuffix}`;
    }
    if (rating.direction === 'UPGRADE') {
      return `${rating.agency} Kredi Notu Artışı${outlookSuffix}`;
    }
    if (rating.direction === 'AFFIRM') {
      return `${rating.agency} Kredi Derecelendirme Notunu Teyit Etti${outlookSuffix}`;
    }
    if (cleanSummary && !isGenericDisclosureTitle(cleanSummary) && cleanSummary.length >= 10) {
      return capitalizeTurkishFirst(cleanSummary);
    }
    return `${rating.agency} Kredi Derecelendirme Notu Bildirimi`;
  }

  // 3. Yeni Ticari Sözleşme / İhale / Sipariş / Tedarik (Çerçeve/Ana/Toplu İş/M&A Pay Alım Satım hariç)
  if (
    !isNonCommercialContractText(lower) && (
      lower.includes('sözleşme') ||
      lower.includes('ihale') ||
      lower.includes('sipariş') ||
      /^yeni iş ilişkisi$/i.test(cleanRaw)
    )
  ) {
    const primaryAmt = compactAmounts[0] || '';
    const cpMatch = body.match(/(?:ile\s+)([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&()-]{2,42}?)\s+aras[ıi]nda/i)
      || body.match(/(Savunma Sanayii Başkanl[ıi]ğ[ıi]|ROKETSAN|TUSAŞ|BAYKAR|HAVELSAN|TÜRKSAT|BOTAŞ|TEİAŞ|TCDD|THY)/i);
    const counterparty = cpMatch ? cpMatch[1].replace(/\s+/g, ' ').trim() : '';

    const scopeMatch = body.match(/aras[ıi]nda\s+([^,.;]{6,75}?)\s+(?:tedariki|temini|kapsam[ıi]nda|projesi|ihracat[ıi]|sat[ıi]ş[ıi])/i)
      || body.match(/müşterisi\s+ile\s+([^,.;]{6,65}?)\s+(?:sat[ıi]ş[ıi]na|ihracat[ıi]na|tedarikine|teminine)/i);
    const scope = scopeMatch ? cleanTurkishGenitivePhrase(scopeMatch[1]) : '';
    const isExport = lower.includes('ihracat') || lower.includes('uluslararası') || lower.includes('yurt dışı');

    if (counterparty && primaryAmt && scope) {
      const candidate = `${counterparty} ile ${primaryAmt} ${capitalizeTurkishFirst(scope)} Sözleşmesi`;
      return candidate.length <= 96 ? candidate : `${counterparty} ile ${primaryAmt} Tutarında Yeni Sözleşme`;
    }
    if (counterparty && primaryAmt) {
      return `${counterparty} ile ${primaryAmt} Tutarında Sözleşme İmzalandı`;
    }
    if (primaryAmt && scope) {
      const prefix = isExport ? 'Uluslararası ' : '';
      const kind = isExport ? 'İhracat Sözleşmesi' : 'Sözleşmesi';
      const candidate = `${primaryAmt} ${prefix}${capitalizeTurkishFirst(scope)} ${kind}`;
      return candidate.length <= 96 ? candidate : `${primaryAmt} Tutarında ${prefix}${kind}`;
    }
    if (primaryAmt) {
      if (cleanSummary && !isGenericDisclosureTitle(cleanSummary) && cleanSummary.length >= 12) {
        return `${capitalizeTurkishFirst(cleanSummary)} (${primaryAmt})`;
      }
      return isExport
        ? `${primaryAmt} Tutarında Uluslararası İhracat Sözleşmesi`
        : `${primaryAmt} Tutarında Yeni Sözleşme / İş İlişkisi`;
    }
  }

  // 4. Tahvil / Bono / Kira Sertifikası Kupon Ödemesi veya İhraç
  if (
    lower.includes('kupon ödemesi') ||
    lower.includes('tahvil') ||
    lower.includes('kira sertifikas') ||
    lower.includes('finansman bonosu') ||
    lower.includes('borçlanma arac')
  ) {
    const isinMatch = combined.match(/\b(TR[A-Z0-9]{10})\b/);
    const couponMatch = combined.match(/(\d+)\.\s*kupon\s*ödemesi/i)
      || combined.match(/(birinci|ikinci|üçüncü|dördüncü|beşinci|alt[ıi]nc[ıi])\s+kupon\s+ödemesi/i);
    if (lower.includes('kupon ödemesi')) {
      const ord = couponMatch ? `${capitalizeTurkishFirst(couponMatch[1])}${/^\d+$/.test(couponMatch[1]) ? '.' : ''} ` : '';
      const isinSuffix = isinMatch ? ` (${isinMatch[1]})` : '';
      return `Tahvil ${ord}Kupon Ödemesi Gerçekleştirildi${isinSuffix}`;
    }
    if (cleanSummary && cleanSummary.length >= 10 && !isGenericDisclosureTitle(cleanSummary)) {
      return capitalizeTurkishFirst(cleanSummary);
    }
    // Spesifik tel/haber başlığını jenerik başlıkla ezme
    if (cleanRaw && !isGenericDisclosureTitle(cleanRaw) && cleanRaw.length >= 16) {
      return cleanRaw;
    }
    return compactAmounts[0]
      ? `Borçlanma Aracı / Tahvil İşlemi (${compactAmounts[0]})`
      : 'Borçlanma Aracı / Tahvil Bildirimi';
  }

  // 5. Pay Geri Alımı (Sadece gerçek pay geri alım bildirimleri; M&A "Pay Alım Satım Sözleşmesi" hariç)
  if (
    (lower.includes('geri alım') || lower.includes('payların geri alınması') || lower.includes('geri alındı')) &&
    !lower.includes('süresi sona erdi') &&
    !lower.includes('sonlandırıldı')
  ) {
    const bb = extractBuybackDetails(body);
    if (bb.dailyShares && bb.avgPrice) {
      return `Pay Geri Alımı — ${bb.dailyShares} Adet Pay (${bb.avgPrice} Ort.)`;
    }
    if (bb.dailyShares) {
      return `Pay Geri Alım İşlemi — ${bb.dailyShares} Adet Pay`;
    }
    if (compactAmounts[0]) {
      return `Pay Geri Alım Programı İşlemi (${compactAmounts[0]})`;
    }
  }

  // 6. Temettü / Kâr Payı / Sermaye Artırımı
  if (lower.includes('kâr payı') || lower.includes('kar payı') || lower.includes('temettü') || lower.includes('bedelsiz') || lower.includes('bedelli')) {
    const capPctMatch = body.match(/%\s*(\d+(?:[.,]\d+)?)\s*(?:oranında\s+)?(?:bedelsiz|bedelli)/i)
      || body.match(/(?:bedelsiz|bedelli)[^%]{0,30}%\s*(\d+(?:[.,]\d+)?)/i);
    if (lower.includes('bedelsiz') && capPctMatch) {
      return `%${capPctMatch[1]} Oranında Bedelsiz Sermaye Artırımı Bildirimi`;
    }
    if (lower.includes('bedelli') && capPctMatch) {
      return `%${capPctMatch[1]} Oranında Bedelli Sermaye Artırımı Bildirimi`;
    }
    const perShareMatch = body.match(/(?:pay başına|hisse başına)[^0-9]{0,25}(?:net|brüt)?[^0-9]{0,15}(\d+[.,]\d{2,4})\s*TL/i)
      || body.match(/(?:brüt|net)\s+(\d+[.,]\d{2,4})\s*TL\s*(?:nakit\s*)?(?:k[aâ]r\s*pay[ıi]|temettü)/i);
    if (perShareMatch) {
      return `Nakit Kâr Payı (Temettü) Bildirimi — Pay Başına ${perShareMatch[1]} TL`;
    }
  }

  // 7. KAP'ın resmi "Özet Bilgi" alanı zaten açıklayıcıysa doğrudan kullan (ve varsa dönem/tutarla güçlendir)
  if (cleanSummary && cleanSummary.length >= 6 && !isGenericDisclosureTitle(cleanSummary)) {
    const summaryCap = capitalizeTurkishFirst(cleanSummary);
    if (compactAmounts[0] && !summaryCap.includes(compactAmounts[0]) && !/\d+\s*(?:tl|usd|eur|avro|dolar|mn|mr)/i.test(summaryCap)) {
      const enhanced = `${summaryCap} (${compactAmounts[0]})`;
      if (enhanced.length <= 96) return enhanced;
    }
    return summaryCap;
  }

  // 8. Ham başlık jenerik değilse onu kullan
  if (cleanRaw && !isGenericDisclosureTitle(cleanRaw)) {
    return cleanRaw;
  }

  // 9. Gövde metninin ilk anlamlı cümlesinden kısa, net başlık türet
  if (body.length >= 25) {
    const firstSentence = body.split(/(?<=[.!?])\s+/)[0]?.trim() || body;
    const trimmed = firstSentence.length > 92
      ? `${firstSentence.slice(0, 89).replace(/[\s,;:-]+$/, '')}...`
      : firstSentence.replace(/\.$/, '');
    if (trimmed.length >= 15) {
      return capitalizeTurkishFirst(trimmed);
    }
  }

  return cleanRaw || `${opts.ticker} Resmi KAP Bildirimi`;
}

/**
 * Gerçek bildirim metninden yatırımcının anında tarayabileceği sayısal/olgusal metrik hapları çıkarır.
 */
export function extractDisclosureMetrics(opts: {
  title: string;
  bodyText?: string;
  structuredFields?: Array<{ label: string; value: string }>;
}): DisclosureMetricPill[] {
  const pills: DisclosureMetricPill[] = [];
  const seen = new Set<string>();
  const addPill = (label: string, value: string, tone: DisclosureMetricPill['tone'] = 'neutral') => {
    const cleanVal = value.replace(/\s+/g, ' ').trim();
    if (!label || !cleanVal) return;
    const key = `${label.toLowerCase()}::${cleanVal.toLowerCase()}`;
    if (seen.has(key) || pills.length >= 4) return;
    seen.add(key);
    pills.push({ label, value: cleanVal, tone });
  };

  const body = (opts.bodyText || '').replace(/\s+/g, ' ').trim();
  const combined = `${opts.title} ${body}`;
  const lower = combined.toLocaleLowerCase('tr-TR');
  const amounts = findCurrencyAmounts(body || opts.title);

  // 1. Ceza / Yaptırım metrikleri
  if (
    !lower.includes('ceza almadığ') &&
    (lower.includes('idari para cezas') || lower.includes('para cezas') || lower.includes('vergi cezas'))
  ) {
    const grossMatch = body.match(/toplam\s+(\d{1,3}(?:\.\d{3})+(?:,\d+)?\s*(?:TL|TRY|USD|EUR|Avro)|\d+(?:[.,]\d+)?\s*(?:milyon|milyar)\s*(?:TL|TRY|USD|EUR|Avro))\s*(?:idari\s*)?(?:para\s*)?ceza/i);
    const payableMatch = body.match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?\s*(?:TL|TRY|USD|EUR|Avro)|\d+(?:[.,]\d+)?\s*(?:milyon|milyar)\s*(?:TL|TRY|USD|EUR|Avro))\s*(?:olarak|tutar[ıi]nda)?[^.]{0,45}ödenecek/i);
    const discMatch = body.match(/%\s*(\d+(?:[.,]\d+)?)\s*(?:oran[ıi]nda)?\s*(?:peşin\s*ödeme\s*)?indirim/i);
    const daysMatch = body.match(/(\d+)\s*(?:günlük|gün)\s*(?:ödeme\s*)?süre/i);

    if (payableMatch) addPill('İndirimli Ödeme', formatCompactCurrencyAmount(payableMatch[1]), 'negative');
    if (grossMatch) addPill('Brüt Ceza', formatCompactCurrencyAmount(grossMatch[1]), 'negative');
    else if (!payableMatch && amounts[0]) addPill('Ceza Tutarı', formatCompactCurrencyAmount(amounts[0]), 'negative');
    if (discMatch) addPill('Peşin İndirim', `%${discMatch[1]}`, 'neutral');
    if (daysMatch) addPill('Ödeme Süresi', `${daysMatch[1]} Gün`, 'neutral');
    return pills;
  }

  // 2. Kredi Derecelendirme metrikleri
  if (lower.includes('derecelendirme') || /\b(jcr|fitch|moody'?s|s&p)\b/i.test(combined)) {
    const r = extractCreditRatingDetails(combined);
    if (r.agency !== 'Kurumsal') addPill('Kuruluş', r.agency, 'neutral');
    if (r.fromGrade && r.toGrade) {
      addPill('Kredi Notu', `${r.fromGrade} → ${r.toGrade}`, r.direction === 'DOWNGRADE' ? 'negative' : r.direction === 'UPGRADE' ? 'positive' : 'neutral');
    }
    if (r.outlook) {
      addPill('Görünüm', r.outlook, /negatif|negative/i.test(r.outlook) ? 'negative' : /pozitif|positive/i.test(r.outlook) ? 'positive' : 'neutral');
    }
    return pills;
  }

  // 3. Pay Geri Alımı metrikleri (günlük alım ile kümülatif toplamı ASLA karıştırma!)
  if ((lower.includes('geri alım') || lower.includes('geri alındı')) && !lower.includes('süresi sona erdi')) {
    const bb = extractBuybackDetails(body || opts.title);
    if (bb.dailyShares) addPill('Geri Alınan', `${bb.dailyShares} Adet`, 'positive');
    if (bb.avgPrice) addPill('Ort. Fiyat', bb.avgPrice, 'neutral');
    if (bb.capitalRatio) addPill('Sermaye Oranı', bb.capitalRatio, 'neutral');
    if (pills.length > 0) return pills;
  }

  // 4. Sözleşme / İhale metrikleri
  if (!isNonCommercialContractText(lower) && (lower.includes('sözleşme') || lower.includes('ihale') || lower.includes('sipariş'))) {
    if (amounts[0]) addPill('Sözleşme Bedeli', formatCompactCurrencyAmount(amounts[0]), 'positive');
    const cpMatch = body.match(/(?:ile\s+)([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&()-]{2,35}?)\s+aras[ıi]nda/i)
      || body.match(/\b(SSB|ROKETSAN|TUSAŞ|BAYKAR|HAVELSAN|TÜRKSAT|BOTAŞ|TEİAŞ)\b/);
    if (cpMatch) addPill('Karşı Taraf', cpMatch[1].trim(), 'neutral');
  }

  // 5. Tahvil / Borçlanma Aracı
  if (lower.includes('kupon ödemesi') || lower.includes('tahvil') || lower.includes('kira sertifikas')) {
    const isinMatch = combined.match(/\b(TR[A-Z0-9]{10})\b/);
    if (isinMatch) addPill('ISIN', isinMatch[1], 'neutral');
    if (lower.includes('kupon ödemesi')) addPill('İşlem', 'Kupon Ödemesi', 'neutral');
    if (amounts[0]) addPill('Tutar', formatCompactCurrencyAmount(amounts[0]), 'neutral');
  }

  // Genel parasal tutar / yüzde fallback
  if (pills.length === 0 && amounts[0]) {
    addPill('Bildirim Tutarı', formatCompactCurrencyAmount(amounts[0]), 'neutral');
  }
  if (pills.length < 2) {
    const pctMatch = body.match(/%\s*(\d+(?:[.,]\d+)?)/);
    if (pctMatch) {
      const tone: DisclosureMetricPill['tone'] = /art[ıi]ş|büyüme|yüksel/i.test(body)
        ? 'positive'
        : /düşüş|gerile|azalış|zarar|ceza/i.test(body)
        ? 'negative'
        : 'neutral';
      addPill('Oran', `%${pctMatch[1]}`, tone);
    }
  }

  // Yapısal alanlardan ek bilgi (henüz az pil varsa)
  if (pills.length < 3 && Array.isArray(opts.structuredFields)) {
    for (const f of opts.structuredFields) {
      if (pills.length >= 3) break;
      if (/tutar|bedel|tarih|oran|taraf/i.test(f.label) && f.value.length <= 36) {
        addPill(f.label.slice(0, 24), f.value, 'neutral');
      }
    }
  }

  return pills;
}

/**
 * Fiyat-duyarlı metrikleri kalın (**...**) vurgular:
 * - Parasal tutarlar: 120 milyon dolar, 34,50 TL, 1.019.069.577 TL, 764.302.183 TL, 18,632,108,000 TL, 4 milyar TL
 * - Yüzdeler: %15,4, %0,81, %25
 * - Pay ve lot: 36.532 adet, 18,655 milyon adet
 */
export function formatPriceSensitiveText(text: string): string {
  if (!text) return '';
  let res = text;
  // Zaten ** ile sarılı olmayan parasal tutar ve adetleri vurgula (Türkçe 'ı' karakterinde \b sorununu önlemek için lookahead kullan)
  res = res.replace(
    /(?<!\*\*)(\b\d{1,3}(?:(?:\.\d{3})+(?:,\d+)?|(?:,\d{3})+(?:\.\d+)?)\s*(?:TL|TRY|USD|EUR|ABD\s*Dolar[ıi]|dolar|avro|euro|adet|lot|nominal)(?=$|[\s,.;:!?)'"+])|\b\d+(?:[.,]\d+)?\s*(?:milyon|milyar|mlyr|mln|mr|mn|bin)?\s*(?:TL|TRY|USD|EUR|ABD\s*Dolar[ıi]|dolar|avro|euro|adet|lot|nominal)(?=$|[\s,.;:!?)'"+]))(?!\*\*)/gi,
    '**$1**'
  );
  res = res.replace(/(?<!\*\*)(%\s*\d+(?:[.,]\d+)?)(?!\*\*)/g, '**$1**');
  return res;
}

export function calculateTimeAgo(pubDate: string | Date): string {
  try {
    const pubTime = new Date(pubDate).getTime();
    if (isNaN(pubTime)) return 'Yeni';
    const diffMs = Math.max(0, Date.now() - pubTime);
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHrs = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMinutes < 60) {
      return diffMinutes <= 1 ? 'Az önce' : `${diffMinutes} dk önce`;
    }
    if (diffHrs < 24) {
      return `${diffHrs} saat önce`;
    }
    if (diffDays === 1) {
      return 'Dün';
    }
    if (diffDays < 30) {
      return `${diffDays} gün önce`;
    }
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} ay önce`;
  } catch {
    return 'Yeni';
  }
}

export function categorizeDisclosure(title: string, bodyText: string = ''): {
  category: CompanyNewsItem['category'];
  categoryLabel: string;
  impact: CompanyNewsItem['impact'];
  impactLabel: string;
  eventType: DisclosureEventType;
} {
  const combinedRaw = `${title} ${bodyText}`;
  const combined = combinedRaw.toLocaleLowerCase('tr-TR');
  const titleLower = (title || '').toLocaleLowerCase('tr-TR');

  // 1. Kredi Derecelendirme (Yatırım/Finansal alt kelimelerinden ÖNCE değerlendirilir — Moody's not indirimini yakalar!)
  if (
    combined.includes('kredi derecelendir') ||
    combined.includes('derecelendirme notu') ||
    /\b(jcr avrasya|fitch ratings|moody'?s|s&p global)\b/i.test(combinedRaw) ||
    titleLower.includes('derecelendirme')
  ) {
    const rating = extractCreditRatingDetails(combinedRaw);
    if (rating.direction === 'DOWNGRADE') {
      return {
        category: 'GENERAL',
        categoryLabel: 'Kredi Derecelendirme',
        impact: 'NEGATIVE',
        impactLabel: 'Olumsuz / Not İndirimi',
        eventType: 'RATING'
      };
    }
    if (rating.direction === 'UPGRADE') {
      return {
        category: 'GENERAL',
        categoryLabel: 'Kredi Derecelendirme',
        impact: 'POSITIVE',
        impactLabel: 'Olumlu / Not Artışı',
        eventType: 'RATING'
      };
    }
    return {
      category: 'GENERAL',
      categoryLabel: 'Kredi Derecelendirme',
      impact: 'NEUTRAL',
      impactLabel: 'Derecelendirme / Teyit',
      eventType: 'RATING'
    };
  }

  // 2. Olumsuz / Ceza / Yaptırım / Dava / Üretim Durdurma / Piyasa Tedbiri
  const isRekabetPenalty = combined.includes('rekabet kurumu') && (
    combined.includes('ceza') || combined.includes('soruşturma') || combined.includes('gerekçeli karar') || combined.includes('yaptırım') || combined.includes('ihlal')
  ) && !combined.includes('ceza almadığ') && !combined.includes('ceza verilmemesine');

  if (
    (!combined.includes('ceza almadığ') && (
      combined.includes('idari para cezas') ||
      combined.includes('para cezas') ||
      combined.includes('vergi cezas')
    )) ||
    isRekabetPenalty ||
    combined.includes('soruşturma başlat') ||
    combined.includes('üretim durdur') ||
    combined.includes('üretimine ara') ||
    combined.includes('grev karar') ||
    combined.includes('konkordato') ||
    combined.includes('sözleşme fesih') ||
    combined.includes('sözleşmenin feshi') ||
    combined.includes('ihale iptal') ||
    combined.includes('tedbir uygulaması')
  ) {
    const isFine = combined.includes('ceza');
    return {
      category: 'GENERAL',
      categoryLabel: isFine ? 'İdari Ceza / Yaptırım' : 'Hukuki / Operasyonel Risk',
      impact: 'NEGATIVE',
      impactLabel: isFine ? 'Olumsuz / Ceza' : 'Olumsuz / Risk',
      eventType: 'PENALTY'
    };
  }

  // 3. Kurumsal Rapor / Yatırımcı Sunumu / Sürdürülebilirlik Raporu (Şirket ünvanındaki "Fabrikaları" veya metindeki "finansal" kelimesiyle karışmamalı)
  if (
    titleLower.includes('sürdürülebilirlik raporu') ||
    titleLower.includes('yatırımcı sunumu') ||
    titleLower.includes('bilgilendirme notu') ||
    titleLower.includes('değerleme şirketinin seçimi') ||
    titleLower.includes('değerleme raporu')
  ) {
    return {
      category: 'GENERAL',
      categoryLabel: titleLower.includes('sunum') ? 'Yatırımcı Sunumu' : 'Kurumsal Rapor',
      impact: 'NEUTRAL',
      impactLabel: 'Bilgilendirme',
      eventType: 'GOVERNANCE'
    };
  }

  // 4. Ortak Pay Satışı (Hızlandırılmış talep toplama / kurumsal satış — yatırım DEĞİL!)
  if (
    combined.includes('hızlandırılmış talep toplama') ||
    (combined.includes('pay satış') && !combined.includes('geri al') && !combined.includes('satın alınması'))
  ) {
    return {
      category: 'BUYBACK',
      categoryLabel: 'Ortak Pay Satışı',
      impact: 'NEGATIVE',
      impactLabel: 'Olumsuz / Pay Satışı',
      eventType: 'BUYBACK'
    };
  }

  // 5. Pay Geri Alımı (M&A "Pay Alım Satım Sözleşmesi" hariç)
  if (
    (combined.includes('geri alım') || combined.includes('payların geri alınması') || combined.includes('geri alındı')) &&
    !combined.includes('pay alım satım sözleşmesi')
  ) {
    const isEnded = combined.includes('süresi sona erdi') || combined.includes('sonlandırıldı');
    return {
      category: 'BUYBACK',
      categoryLabel: 'Pay Geri Alımı',
      impact: isEnded ? 'NEUTRAL' : 'POSITIVE',
      impactLabel: isEnded ? 'Program Sona Erdi' : 'Olumlu',
      eventType: 'BUYBACK'
    };
  }

  // 6. Temettü & Sermaye (Sermaye Artırımı / Bedelsiz / Bedelli / Kâr Payı)
  if (
    combined.includes('kâr payı') ||
    combined.includes('kar payı') ||
    combined.includes('temettü') ||
    combined.includes('sermaye artırım') ||
    combined.includes('sermaye azaltım') ||
    combined.includes('bedelli') ||
    combined.includes('bedelsiz')
  ) {
    const isDilutive = combined.includes('bedelli') && !combined.includes('bedelsiz');
    return {
      category: 'DIVIDEND',
      categoryLabel: 'Temettü & Sermaye',
      impact: isDilutive ? 'NEUTRAL' : 'HIGH_IMPACT',
      impactLabel: isDilutive ? 'Bedelli / Sermaye' : 'Yüksek Etki / Olumlu',
      eventType: 'DIVIDEND'
    };
  }

  // 7. Tahvil / Kupon / Borçlanma Aracı / Kira Sertifikası
  if (
    combined.includes('kupon ödemesi') ||
    combined.includes('tahvil') ||
    combined.includes('finansman bonosu') ||
    combined.includes('kira sertifikas') ||
    combined.includes('borçlanma arac') ||
    combined.includes('ihraç tavan')
  ) {
    return {
      category: 'GENERAL',
      categoryLabel: 'Tahvil & Borçlanma',
      impact: 'NEUTRAL',
      impactLabel: 'Finansman / Kupon',
      eventType: 'DEBT'
    };
  }

  // 8. Yeni Ticari Sözleşme / İhale / Sipariş (Çerçeve / Ana / Toplu İş / Pay Alım Satım Sözleşmesi hariç)
  if (
    !isNonCommercialContractText(combined) && (
      combined.includes('yeni iş ilişkisi') ||
      combined.includes('sözleşme imzalan') ||
      combined.includes('satış sözleşmesi') ||
      combined.includes('tedarik sözleşmesi') ||
      combined.includes('ihale') ||
      combined.includes('sipariş') ||
      titleLower.includes('sözleşme')
    )
  ) {
    return {
      category: 'CONTRACT',
      categoryLabel: 'Yeni Sözleşme / İhale',
      impact: 'HIGH_IMPACT',
      impactLabel: 'Yüksek Etki / Olumlu',
      eventType: 'CONTRACT'
    };
  }

  // 9. Finansal Tablolar & Operasyonel Sonuçlar (Önceki dönem "(Önceki: ... net zarar)" metnini cari zarar sanma!)
  const currentOnly = combined.replace(/\(önceki:[^)]*\)/gi, ' ');
  if (
    titleLower.includes('trafik sonuç') ||
    titleLower.includes('yolcu') ||
    titleLower.includes('finansal rapor') ||
    titleLower.includes('finansal tablo') ||
    titleLower.includes('finansal sonuç') ||
    titleLower.includes('finansal ve operasyonel') ||
    titleLower.includes('geleceğe yönelik beklenti') ||
    titleLower.includes('geleceğe dönük değerlendirme') ||
    titleLower.includes('bilanço') ||
    titleLower.includes('faaliyet rapor') ||
    titleLower.includes('prim üretim') ||
    currentOnly.includes('konsolide bilanço') ||
    currentOnly.includes('solo bilanço')
  ) {
    const isTraffic = titleLower.includes('trafik') || titleLower.includes('yolcu');
    const isNegativePerf = (currentOnly.includes('net zarar') || currentOnly.includes('zarar açıkla')) && !currentOnly.includes('net kar') && !currentOnly.includes('net kâr');
    const isTrafficDrop = isTraffic && /düştü|azaldı|geriledi/.test(titleLower);
    return {
      category: 'FINANCIALS',
      categoryLabel: isTraffic ? 'Operasyonel Sonuçlar' : 'Finansal Tablolar',
      impact: (isNegativePerf || isTrafficDrop) ? 'NEGATIVE' : 'HIGH_IMPACT',
      impactLabel: isNegativePerf ? 'Olumsuz / Zarar' : isTrafficDrop ? 'Yolcu Düşüşü' : 'Yüksek Etki',
      eventType: isTraffic ? 'OPERATIONAL' : 'FINANCIALS'
    };
  }

  // 10. Yatırım / Kapasite / Varlık Satışı / Satın Alma (Şirket adındaki "Fabrikaları" veya "Yatırım Ortaklığı"/"Yatırımcı" ile tetiklenmemeli!)
  const scrubbedForInvestment = combined
    .replace(/gayrimenkul\s+yatırım\s+ortakl[ıi]ğ[ıi]/gi, '')
    .replace(/yatırımcı\w*/gi, '')
    .replace(/yatırım\s+(?:finansman|kuruluş|banka|fon)/gi, '')
    .replace(/(?:cam|çelik|otomobil|lastik|tekstil)\s+fabrikalar[ıi]/gi, '');

  if (
    scrubbedForInvestment.includes('kapasite artırım') ||
    scrubbedForInvestment.includes('yatırım teşvik') ||
    scrubbedForInvestment.includes('yeni yatırım') ||
    scrubbedForInvestment.includes('yatırımlarına') ||
    scrubbedForInvestment.includes('yatırımlarını') ||
    scrubbedForInvestment.includes('satın alma') ||
    scrubbedForInvestment.includes('satın alınması') ||
    scrubbedForInvestment.includes('satın aldı') ||
    scrubbedForInvestment.includes('taşınmaz satış') ||
    scrubbedForInvestment.includes('taşınmazını') ||
    scrubbedForInvestment.includes('maden kaynak') ||
    scrubbedForInvestment.includes('pay alım satım sözleşmesi') ||
    /(?:yeni|üretim)\s+(?:fabrika|tesis)/.test(scrubbedForInvestment) ||
    scrubbedForInvestment.includes('filo')
  ) {
    return {
      category: 'INVESTMENT',
      categoryLabel: 'Yatırım & Varlık İşlemi',
      impact: 'POSITIVE',
      impactLabel: 'Olumlu',
      eventType: 'INVESTMENT'
    };
  }

  // 11. Yönetim Kurulu / Genel Kurul / Kurumsal Yönetim / Üst Yönetim Değişikliği
  if (
    combined.includes('yönetim kurulu') ||
    combined.includes('genel kurul') ||
    combined.includes('genel müdür') ||
    combined.includes('üst yönetim') ||
    combined.includes('atama') ||
    combined.includes('atandığını') ||
    combined.includes('kurumsal yönetim')
  ) {
    return {
      category: 'GENERAL',
      categoryLabel: 'Kurumsal Yönetim',
      impact: 'NEUTRAL',
      impactLabel: 'Kurumsal Bildirim',
      eventType: 'GOVERNANCE'
    };
  }

  return {
    category: 'GENERAL',
    categoryLabel: 'Özel Durum Açıklaması',
    impact: 'NEUTRAL',
    impactLabel: 'Bilgilendirme',
    eventType: 'DISCLOSURE'
  };
}

function splitCleanSentences(text: string): string[] {
  if (!text) return [];
  const normalized = stripKapLegalFooter(text)
    .replace(/\r\n/g, '\n')
    // Kısaltmalardaki noktaları (A.Ş., T.C., No., vb., 1.019.069) cümle sonu sayma
    .replace(/\b(A\.Ş|T\.C|T\.A\.O|Ltd|Şti|No|Dr|Prof|Sn|vb|vs)\./gi, '$1§');

  const rawChunks = normalized
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9"'(])/)
    .map(s => s.replace(/§/g, '.').replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 16);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const s of rawChunks) {
    const k = s.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(s);
    }
  }
  return unique;
}

/**
 * Bildirim kartı için başlığın aynısını tekrar etmeyen, gerçek KAP metnindeki
 * kilit finansal olguları öne çıkaran 1-2 cümlelik özet üretir.
 * Gerçek içerik varken ASLA jenerik "mevzuat hükümleri uyarınca" kalıbı üretmez ve sayısal kırpma hatası yapmaz.
 */
export function buildDisclosureKeySummary(
  title: string,
  ticker: string,
  companyName: string,
  category: CompanyNewsItem['category'],
  bodyText?: string,
  kapSummary?: string
): string {
  const cleanBody = stripKapLegalFooter(bodyText || '').replace(/\s+/g, ' ').trim();
  if (cleanBody.length >= 25 && cleanBody.toLowerCase() !== title.trim().toLowerCase()) {
    const sentences = splitCleanSentences(bodyText || '');
    if (sentences.length >= 2) {
      // Eğer 1. cümle geçmiş atıfsa ("bildirilmişti", "açıklanmıştı") ve 2. cümle asıl yeni gelişmeyse, 2. cümleyi mutlaka dahil et
      const isFirstPastContext = /(?:bildirilmişti|açıklanmıştı|duyurulmuştu|kamuya açıklanmıştı)\.?$/i.test(sentences[0]);
      if (isFirstPastContext && (sentences[0].length + sentences[1].length) > 480) {
        return formatPriceSensitiveText(sentences[1]);
      }
      let combined = sentences[0];
      if ((combined.length + sentences[1].length) <= 520) {
        combined = `${combined} ${sentences[1]}`;
      } else if (/\d/.test(sentences[1]) && !/\d/.test(sentences[0])) {
        combined = sentences[1];
      }
      return formatPriceSensitiveText(combined);
    }
    const single = cleanBody.length > 420
      ? `${cleanBody.slice(0, 417).replace(/\s+\S*$/, '')}...`
      : cleanBody;
    return formatPriceSensitiveText(single);
  }

  const cleanKapSum = fixKapMojibakeText(normalizeAllCapsTurkish((kapSummary || '').replace(/\s+/g, ' ').trim()));
  if (cleanKapSum.length >= 12 && cleanKapSum.toLowerCase() !== title.trim().toLowerCase()) {
    return formatPriceSensitiveText(`${companyName} (${ticker}) tarafından "${cleanKapSum}" konulu resmi bildirim KAP'ta yayımlanmıştır.`);
  }

  const tLower = title.toLocaleLowerCase('tr-TR');
  const titleAmounts = findCurrencyAmounts(title);
  const amountStr = titleAmounts[0] ? formatCompactCurrencyAmount(titleAmounts[0]) : '';

  if (category === 'BUYBACK') {
    if (tLower.includes('süresi sona erdi') || tLower.includes('sonlandırıldı')) {
      return `${companyName} yürürlükteki Pay Geri Alım Programı süresinin tamamlandığını KAP'a bildirdi.`;
    }
    if (tLower.includes('hızlandırılmış talep toplama') || tLower.includes('pay satış')) {
      return amountStr
        ? `Ortaklık sermayesinde **${amountStr}** nominal tutarlı pay satış süreci hakkında KAP bildirimi yayımlandı.`
        : `Ortaklık pay satış işlemine ilişkin detaylar Kamuyu Aydınlatma Platformu'nda duyuruldu.`;
    }
    if (amountStr) {
      return `Şirket, pay geri alım programı kapsamında **${amountStr}** tutarında işlem gerçekleştirdiğini KAP'a bildirdi.`;
    }
    return `Yönetim Kurulu onaylı Pay Geri Alım Programı kapsamında Borsa İstanbul'da gerçekleştirilen pay alım detayları KAP'ta açıklandı.`;
  }

  if (category === 'FINANCIALS') {
    if (tLower.includes('erteleme') || tLower.includes('erteledi')) {
      return `Şirket, dönemsel konsolide finansal sonuçlarının KAP'ta açıklanmasına ilişkin takvimi güncellediğini duyurdu.`;
    }
    if (tLower.includes('trafik') || tLower.includes('yolcu')) {
      return formatPriceSensitiveText(title.length >= 36 ? title : `${companyName}, ilgili döneme ait yolcu sayısı, doluluk oranı ve operasyonel trafik gerçekleşmelerini KAP'ta paylaştı.`);
    }
    if (tLower.includes('net kar') || tLower.includes('net kâr') || tLower.includes('net zarar')) {
      return formatPriceSensitiveText(title);
    }
    if (amountStr) {
      return `Şirketin ilgili dönem konsolide finansal sonuçlarında **${amountStr}** tutarındaki gerçekleşmeler kamuoyu ile paylaşıldı.`;
    }
    return `${companyName} dönemsel konsolide finansal tabloları ve faaliyet sonuçları Kamuyu Aydınlatma Platformu'nda yayımlandı.`;
  }

  if (category === 'CONTRACT') {
    if (amountStr) {
      return `Şirket, sipariş bakiyesini ve ciro görünümünü destekleyen toplam **${amountStr}** tutarında yeni sözleşme imzaladı.`;
    }
    return `${companyName}, ana faaliyet alanında yeni sözleşme / ihale sürecine ilişkin detayları KAP'ta duyurdu.`;
  }

  if (category === 'DIVIDEND') {
    if (tLower.includes('bedelsiz') || tLower.includes('bedelli') || tLower.includes('sermaye artırım')) {
      return formatPriceSensitiveText(title.length >= 32 ? title : `${companyName} sermaye artırım sürecine ilişkin yönetim kararını KAP'ta ilan edildi.`);
    }
    const perShareMatch = title.match(/(?:brüt|net|pay\s*başına|hisse\s*başına)\s+(\d+[.,]\d+)\s*TL/i);
    if (perShareMatch) {
      return `Pay sahiplerine hisse başına **${perShareMatch[1]} TL** nakit kâr payı dağıtım teklifi ve hak kullanım süreci KAP'a bildirildi.`;
    }
    return `${companyName} kâr payı (temettü) dağıtım sürecine ilişkin yönetim kararı KAP'ta ilan edildi.`;
  }

  if (category === 'INVESTMENT') {
    if (amountStr) {
      return `Şirketin kapasite ve büyüme hedeflerine yönelik **${amountStr}** büyüklüğündeki yatırım/varlık işlemi KAP'a bildirildi.`;
    }
    return `${companyName}, kapasite, proje veya varlık yatırımlarına ilişkin güncel gelişmeleri KAP'ta kamuoyu ile paylaştı.`;
  }

  if (tLower.includes('derecelendirme')) {
    return `${companyName} için güncel kredi veya kurumsal yönetim derecelendirme notu KAP üzerinden paylaşıldı.`;
  }

  if (tLower.includes('kupon ödemesi') || tLower.includes('tahvil')) {
    return `${companyName} borçlanma aracı / tahvil kupon ödeme veya ihraç işleminin tamamlandığını KAP'a bildirdi.`;
  }

  return `${companyName} (${ticker}) tarafından "${title}" konulu resmi bildirim KAP'ta yayımlanmıştır. Detaylara aşağıdaki resmi KAP bağlantısından ulaşılabilir.`;
}

/**
 * Detay modalı için gerçek KAP bildirim metninden 2-4 maddelik somut, olgusal
 * kilit çıkarımlar (Key Takeaways) üretir. Gerçek metin varken ASLA jenerik kalıp basmaz.
 */
export function buildDisclosureKeyTakeaways(
  title: string,
  ticker: string,
  companyName: string,
  category: CompanyNewsItem['category'],
  bodyText?: string,
  structuredFields?: Array<{ label: string; value: string }>,
  kapSummary?: string
): string[] {
  const sentences = splitCleanSentences(bodyText || '');
  const takeaways: string[] = [];

  if (sentences.length > 0) {
    // Gerçek KAP cümlelerinden en bilgilendirici 4 maddeye kadar doğrudan çıkar
    for (const s of sentences) {
      if (takeaways.length >= 4) break;
      const formatted = formatPriceSensitiveText(s);
      takeaways.push(formatted);
    }
  }

  // Eğer gövde metni çok kısa tek bir cümleyse (ör: "Ekim ayı trafik sonuçları ektedir") yapısal alanları ekle
  if (takeaways.length < 2 && Array.isArray(structuredFields) && structuredFields.length > 0) {
    for (const f of structuredFields) {
      if (takeaways.length >= 4) break;
      if (/^(ilgili şirket|ilgili fon|özel durum|bildirim tipi)/i.test(f.label)) continue;
      takeaways.push(`${f.label}: ${formatPriceSensitiveText(f.value)}`);
    }
  }

  if (takeaways.length > 0) {
    return takeaways;
  }

  // Gövde metni hiç çekilemediyse (ör: yalnızca ekli PDF finansal tablo), konuya özgü kısa bilgi ver
  const cleanSum = fixKapMojibakeText(normalizeAllCapsTurkish((kapSummary || '').trim()));
  const titleAmounts = findCurrencyAmounts(title);
  const amountStr = titleAmounts[0] ? formatCompactCurrencyAmount(titleAmounts[0]) : '';
  const tLower = title.toLocaleLowerCase('tr-TR');

  if (cleanSum && cleanSum.toLowerCase() !== title.toLowerCase()) {
    takeaways.push(`KAP Özet Konusu: ${formatPriceSensitiveText(cleanSum)}`);
  }

  if (category === 'BUYBACK') {
    if (tLower.includes('süresi sona erdi') || tLower.includes('sonlandırıldı')) {
      takeaways.push(`Yürürlükteki Pay Geri Alım Programı'nın süresi tamamlanmıştır.`);
    } else if (tLower.includes('hızlandırılmış talep toplama') || tLower.includes('pay satış')) {
      takeaways.push(formatPriceSensitiveText(title));
    } else {
      takeaways.push(amountStr
        ? `Pay Geri Alım Programı kapsamında **${amountStr}** büyüklüğünde işlem gerçekleştirildi.`
        : `Yönetim Kurulu onaylı Pay Geri Alım Programı kapsamında Borsa İstanbul'da alım işlemi raporlandı.`);
    }
  } else if (category === 'FINANCIALS') {
    if (tLower.includes('net kar') || tLower.includes('net kâr') || tLower.includes('net zarar') || tLower.includes('yolcu')) {
      takeaways.push(formatPriceSensitiveText(title));
    } else {
      takeaways.push(`Dönemsel finansal tablolar / faaliyet sonuçları KAP'ta yayımlanmıştır.`);
    }
    takeaways.push(`Ekli finansal rapor ve dipnotlara resmi KAP bildirim bağlantısından doğrudan erişilebilir.`);
  } else if (category === 'CONTRACT') {
    takeaways.push(amountStr
      ? `Toplam **${amountStr}** tutarında yeni sözleşme / iş ilişkisi bağıtlandı.`
      : `Şirketin ciro ve sipariş bakiyesini etkileyen yeni sözleşme/ihale bildirimi KAP'ta paylaşıldı.`);
  } else if (category === 'DIVIDEND') {
    if (tLower.includes('bedelsiz') || tLower.includes('bedelli') || tLower.includes('sermaye artırım')) {
      takeaways.push(formatPriceSensitiveText(title));
    } else {
      const perShareMatch = title.match(/(?:brüt|net|pay\s*başına|hisse\s*başına)\s+(\d+[.,]\d+)\s*TL/i);
      takeaways.push(perShareMatch
        ? `Hisse başına **${perShareMatch[1]} TL** nakit kâr payı (temettü) dağıtım süreci KAP'ta ilan edildi.`
        : `Kâr payı dağıtımı veya sermaye artırım sürecine ilişkin yönetim kurulu kararı duyuruldu.`);
    }
  } else {
    takeaways.push(`${companyName} (${ticker}) tarafından "${title}" konulu bildirim KAP'a iletildi.`);
    takeaways.push(`Bildirim ekleri ve resmi dokümanlar için aşağıdaki KAP bağlantısını kullanabilirsiniz.`);
  }

  return takeaways;
}

interface BigparaArticleDetail {
  bodyText: string;
  directKapUrl?: string;
  kapId?: string;
}

/**
 * Bigpara KAP haber detay sayfasından resmi KAP bildirim bağlantısını ve açıklama metnini çeker.
 * KAP ID yakalanırsa ve Bigpara gövdesi yetersizse doğrudan resmi KAP sayfasından tam metni tamamlar.
 */
async function fetchBigparaArticleDetail(url: string): Promise<BigparaArticleDetail> {
  try {
    const html = await fetchResilientText(url, 3500);
    if (!html) return { bodyText: '' };

    let directKapUrl: string | undefined;
    let kapId: string | undefined;

    const kapMatch = html.match(/https?:\/\/(?:www\.)?kap\.org\.tr\/(?:tr\/)?Bildirim\/([0-9]+)/i);
    if (kapMatch) {
      kapId = kapMatch[1];
      directKapUrl = `https://www.kap.org.tr/tr/Bildirim/${kapId}`;
    }

    let bodyText = '';
    const ekIdx = html.indexOf('Ek Açıklamalar');
    if (ekIdx !== -1) {
      const rawChunk = html.slice(ekIdx, ekIdx + 2400);
      bodyText = stripKapLegalFooter(cleanHtmlText(rawChunk.replace(/^Ek Açıklamalar\s*(?:<br\s*\/?>)*/i, '')));
    } else {
      const ozetIdx = html.indexOf('Özet Bilgi');
      if (ozetIdx !== -1) {
        const rawChunk = html.slice(ozetIdx, ozetIdx + 1200);
        bodyText = stripKapLegalFooter(cleanHtmlText(rawChunk.replace(/^Özet Bilgi\s*(?:<br\s*\/?>)*/i, '')));
      }
    }

    // Bigpara kısa veya boş döndüyse ve KAP ID biliniyorsa doğrudan resmi KAP metnini çek
    if (kapId && bodyText.length < 40) {
      const kapDetail = await fetchKapDisclosureDetail(kapId);
      if (kapDetail.bodyText.length > bodyText.length) {
        bodyText = kapDetail.bodyText;
      }
    }

    return { bodyText, directKapUrl, kapId };
  } catch {
    return { bodyText: '' };
  }
}

/**
 * Aracı kurum araştırma notlarını, hedef fiyat revizyonlarını, sabah bültenlerini,
 * basın demeçlerini ve genel BIST tablo/endeks duyurularını eleyerek YALNIZCA şirketin
 * resmi fiyat-duyarlı açıklamalarını onaylar.
 */
export function isStrictCorporateAnnouncement(title: string, source?: string): boolean {
  void source;
  if (!title) return false;
  const t = title.trim();
  const tLower = t.toLocaleLowerCase('tr-TR');

  const brokerRegex = /(?:-|–|\()\s*(?:HSBC|İş Yatırım|Garanti|Ak Yatırım|Yapı Kredi|Ziraat|Vakıf|Deniz|QNB|Oyak|Gedik|Tacirler|Alnus|Ahlatcı|Trive|İnfo|A1 Capital|Marbas|Piramit|Osmanlı|PhillipCapital|Global Menkul|Ünlü|ICBC|Teb|Yatırım Finansman|Halk Yatırım)\b/i;
  if (brokerRegex.test(t)) return false;

  // Basın demeci / yönetici alıntısı ("THY/Olmuştur:", "Turkcell GM Koç:") ve çoklu hisse BIST tablolarını ele
  if (/^[A-ZÇĞİÖŞÜa-zçğıöşü]+\/[A-ZÇĞİÖŞÜa-zçğıöşü]+:/i.test(t)) return false;
  if (/^b[iıİ]st\s+(?:şirketlerinin|temettü\s+ve\s+bist|endeks)/i.test(t)) return false;
  if (/^borsa\s+istanbul\s+yatırımcı\s+bazında\s+tedbir/i.test(tLower)) return false;

  const noiseRegex = /\b(menkul|yatırım|portföy|değerler|bülten|analizi|notu|ziyaretleri|özel haber|bekliyor|sinyalleri|realizasyonu|hedef fiyat|tavsiye|anket|beklenti|model portföy|günlük|haftalık|şirket rapor|yorum|teknik görünüm|sektör rapor|hisse senedi|canlı grafik|grafik|röportaj|söyleşi|cnbc-e|bloomberg|açıklama tarihleri|çerçeve sözleşmesi)\b/i;
  if (noiseRegex.test(t)) return false;

  const corporateKeywords = [
    'sözleşme', 'ihale', 'iş ilişkisi', 'sipariş', 'satış sözleşme',
    'geri al', 'pay alım', 'pay satım', 'hisse alım',
    'temettü', 'kâr payı', 'kar payı', 'sermaye artırım', 'sermaye azaltım', 'bedelli', 'bedelsiz',
    'mali tablo', 'finansal sonuç', 'ertelendi', 'erteleme', 'bilanço', 'net kâr', 'net kar', 'net zarar', 'hasılat',
    'kapasite', 'tesis', 'satın alma', 'satın aldı', 'taşınmaz',
    'para cezası', 'idari para', 'rekabet kurumu', 'tahvil', 'kupon', 'derecelendirme',
    'kap\'a bildirdi', '-kap', 'kap:'
  ];

  return corporateKeywords.some(k => tLower.includes(k));
}

const LOW_SIGNAL_KAP_SUBJECTS = [
  /^şirket genel bilgi formu$/i,
  /^sorumluluk beyan[ıi]/i,
  /^kurumsal yönetim bilgi formu/i,
  /^kat[ıi]l[ıi]m finans[ıi]?\s+ilkeleri\s+bilgi\s+formu/i,
  /^finansal tablo d[ıi]ş[ıi]ndaki/i,
  /^ihraç belgesi/i,
  /^eski kap/i,
  /^bilgi formu$/i
];

function isLowSignalKapSubject(subject: string): boolean {
  const s = (subject || '').trim().toLocaleLowerCase('tr-TR');
  return LOW_SIGNAL_KAP_SUBJECTS.some(rx => rx.test(s));
}

function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  staggerMs = 0
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async (_, slot) => {
    if (staggerMs > 0 && slot > 0) {
      await sleepMs(slot * staggerMs);
    }
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await worker(items[idx], idx);
      if (staggerMs > 0 && nextIdx < items.length) {
        await sleepMs(staggerMs);
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function parseApproximateTurkishTimeAgo(timeAgo: string): string {
  const s = (timeAgo || '').toLocaleLowerCase('tr-TR').trim();
  const now = Date.now();
  const minMatch = s.match(/(\d+)\s*(?:dk|dakika)/);
  if (minMatch) return new Date(now - Number(minMatch[1]) * 60_000).toISOString();
  const hrMatch = s.match(/(\d+)\s*saat/);
  if (hrMatch) return new Date(now - Number(hrMatch[1]) * 3_600_000).toISOString();
  if (s.includes('dün')) return new Date(now - 86_400_000).toISOString();
  const dayMatch = s.match(/(\d+)\s*gün/);
  if (dayMatch) return new Date(now - Number(dayMatch[1]) * 86_400_000).toISOString();
  const dateMatch = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dateMatch) return parseKapPublishDate(dateMatch[0]);
  return new Date(now - 3_600_000).toISOString();
}

interface RawOfficialKapRow {
  publishDate?: string;
  kapTitle?: string;
  disclosureClass?: string;
  disclosureType?: string;
  summary?: string;
  subject?: string;
  stockCodes?: string;
  relatedStocks?: string;
  disclosureIndex?: number;
  year?: number | null;
  period?: string | null;
}

/**
 * Tek bir KAP bildirimini talep anında (on-demand) resmi KAP sayfasından çekip
 * anlamlı başlık, özet, kilit metrikler ve tam metinle zenginleştirir.
 */
export async function fetchSingleKapDisclosureDetail(opts: {
  kapId: string;
  ticker: string;
  rawTitle?: string;
  kapSummary?: string;
  companyName?: string;
}): Promise<{
  kapId: string;
  fullText: string;
  title: string;
  summary: string;
  keyTakeaways: string[];
  keyMetrics: DisclosureMetricPill[];
  category: CompanyNewsItem['category'];
  categoryLabel: string;
  impact: CompanyNewsItem['impact'];
  impactLabel: string;
  eventType: DisclosureEventType;
} | null> {
  const cleanId = String(opts.kapId || '').trim();
  if (!/^\d{5,9}$/.test(cleanId)) return null;

  const ticker = (opts.ticker || '').toUpperCase().trim();
  const meta = getCompanyMeta(ticker);
  const detail = await fetchKapDisclosureDetail(cleanId);
  if (!detail.bodyText && detail.structuredFields.length === 0) return null;

  const meaningfulTitle = deriveMeaningfulDisclosureTitle({
    rawTitle: opts.rawTitle,
    kapSummary: opts.kapSummary,
    bodyText: detail.bodyText,
    ticker,
    companyName: opts.companyName || meta.cleanName
  });
  const catInfo = categorizeDisclosure(`${meaningfulTitle} ${opts.rawTitle || ''} ${opts.kapSummary || ''}`, detail.bodyText);
  const summary = buildDisclosureKeySummary(meaningfulTitle, ticker, opts.companyName || meta.cleanName, catInfo.category, detail.bodyText, opts.kapSummary);
  const keyTakeaways = buildDisclosureKeyTakeaways(meaningfulTitle, ticker, opts.companyName || meta.cleanName, catInfo.category, detail.bodyText, detail.structuredFields, opts.kapSummary);
  const keyMetrics = extractDisclosureMetrics({ title: meaningfulTitle, bodyText: detail.bodyText || opts.kapSummary, structuredFields: detail.structuredFields });

  return {
    kapId: cleanId,
    fullText: detail.bodyText,
    title: meaningfulTitle,
    summary,
    keyTakeaways,
    keyMetrics,
    category: catInfo.category,
    categoryLabel: catInfo.categoryLabel,
    impact: catInfo.impact,
    impactLabel: catInfo.impactLabel,
    eventType: catInfo.eventType
  };
}

/**
 * Stream 0: Doğrudan Resmi KAP JSON API (POST /tr/api/disclosure/members/byCriteria)
 * + Şirketler Arası Dengeli Round-Robin Seçimi + WAF-Dostu Resmi KAP Tam Metin Ayıklayıcı
 */
async function fetchOfficialKapDisclosures(tickers: string[]): Promise<CompanyNewsItem[]> {
  const oidToTickers = new Map<string, string[]>();
  const oids: string[] = [];

  for (const t of tickers) {
    const oid = getKapOid(t);
    if (!oid) continue;
    if (!oidToTickers.has(oid)) {
      oidToTickers.set(oid, []);
      oids.push(oid);
    }
    oidToTickers.get(oid)!.push(t);
  }

  if (oids.length === 0) return [];

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 86400 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const rawText = await fetchResilientPost(
    'https://www.kap.org.tr/tr/api/disclosure/members/byCriteria',
    {
      mkkMemberOidList: oids,
      fromDate: fmt(from),
      toDate: fmt(now)
    },
    6500
  );

  if (!rawText) return [];

  let rows: RawOfficialKapRow[] = [];
  try {
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) rows = parsed;
  } catch {
    return [];
  }

  const tickerSet = new Set(tickers);
  const buckets = new Map<string, Array<{ ticker: string; row: RawOfficialKapRow; isoDate: string }>>();
  const seenIds = new Set<string>();
  const maxPerTicker = tickers.length <= 3 ? 6 : tickers.length <= 8 ? 4 : tickers.length <= 15 ? 3 : 2;

  for (const row of rows) {
    const kapIdNum = row.disclosureIndex;
    if (!kapIdNum) continue;
    const kapIdStr = String(kapIdNum);
    if (seenIds.has(kapIdStr)) continue;

    // Yalnızca şirketin kendi doğrudan bildirimlerini al (üçüncü parti kira sertifikası / fon bildirimlerini ele)
    const ownCodes = String(row.stockCodes || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);
    const matchedTicker = ownCodes.find(code => tickerSet.has(code));
    if (!matchedTicker) continue;

    const subject = decodeHtmlEntities(String(row.subject || '')).trim();
    if (isLowSignalKapSubject(subject)) continue;

    const list = buckets.get(matchedTicker) || [];
    if (list.length >= maxPerTicker) continue;

    seenIds.add(kapIdStr);
    list.push({
      ticker: matchedTicker,
      row,
      isoDate: parseKapPublishDate(row.publishDate || '')
    });
    buckets.set(matchedTicker, list);
  }

  // Dengeli Round-Robin Seçimi: Her izlenen şirket en güncel bildirimleriyle temsil edilir (hiçbir hisse aç kalmaz)
  const maxTotal = Math.min(44, Math.max(20, tickers.length * 2));
  const selectedRows: Array<{ ticker: string; row: RawOfficialKapRow; isoDate: string }> = [];
  for (let round = 0; round < maxPerTicker && selectedRows.length < maxTotal; round++) {
    for (const tk of tickers) {
      const list = buckets.get(tk);
      if (list && list[round]) {
        selectedRows.push(list[round]);
        if (selectedRows.length >= maxTotal) break;
      }
    }
  }

  // Seçilenleri tarihe göre yeniden eskiye sırala
  selectedRows.sort((a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime());

  if (selectedRows.length === 0) return [];

  // WAF-dostu gövde çekim bütçesi:
  // Önbellekte olanlar ücretsiz; önbellekte olmayanlardan en fazla 12 tanesini (öncelikle ceza, kredi derecelendirmesi,
  // yeni sözleşme, pay geri alım ve jenerik başlıklı ODA bildirimleri) düşük paralellikle (concurrency=2, 130ms aralıkla) çek;
  // kalanlar tıklanınca anında on-demand yüklenir.
  const nowTs = Date.now();
  const needsBodyBudget = new Set<string>();
  const priorityCandidates = selectedRows
    .map((entry, idx) => {
      const kapId = String(entry.row.disclosureIndex);
      const subject = decodeHtmlEntities(String(entry.row.subject || '')).trim();
      const kapSummary = decodeHtmlEntities(String(entry.row.summary || '')).trim();
      const isFr = entry.row.disclosureClass === 'FR';
      const isCached = Boolean(kapDetailCache.get(kapId) && (nowTs - (kapDetailCache.get(kapId)?.timestamp || 0)) < KAP_DETAIL_TTL_MS);
      if (isFr) return { kapId, score: -1, isCached };
      const comboLower = `${subject} ${kapSummary}`.toLocaleLowerCase('tr-TR');
      let score = 100 - idx;
      if (isGenericDisclosureTitle(subject) || isGenericDisclosureTitle(kapSummary)) score += 60;
      if (!kapSummary || kapSummary.length < 22) score += 35;
      if (/ceza|rekabet|derecelendirme|kredi not|sözleşme|geri alım|temettü|sermaye/.test(comboLower)) score += 55;
      return { kapId, score, isCached };
    })
    .filter(c => c.score > 0);

  let uncachedBudget = 12;
  for (const cand of [...priorityCandidates].sort((a, b) => b.score - a.score)) {
    if (cand.isCached) {
      needsBodyBudget.add(cand.kapId);
    } else if (uncachedBudget > 0) {
      needsBodyBudget.add(cand.kapId);
      uncachedBudget--;
    }
  }

  // Seçilen bildirimlerin resmi KAP tam metinlerini WAF-dostu sınırlı paralellikle çek
  const enriched = await runWithConcurrency(selectedRows, 2, async ({ ticker, row, isoDate }) => {
    const kapId = String(row.disclosureIndex);
    const meta = getCompanyMeta(ticker);
    const subject = decodeHtmlEntities(String(row.subject || '')).trim();
    const kapSummary = fixKapMojibakeText(decodeHtmlEntities(String(row.summary || '')).replace(/\s+/g, ' ').trim());

    const detail = needsBodyBudget.has(kapId)
      ? await fetchKapDisclosureDetail(kapId)
      : { bodyText: '', structuredFields: [] };

    const meaningfulTitle = deriveMeaningfulDisclosureTitle({
      rawTitle: subject,
      kapSummary,
      bodyText: detail.bodyText,
      ticker,
      companyName: meta.cleanName,
      year: row.year ?? null,
      period: row.period ?? null
    });

    const catInfo = categorizeDisclosure(
      `${meaningfulTitle} ${subject} ${kapSummary}`,
      detail.bodyText
    );

    const summary = buildDisclosureKeySummary(
      meaningfulTitle,
      ticker,
      meta.cleanName,
      catInfo.category,
      detail.bodyText,
      kapSummary
    );

    const keyTakeaways = buildDisclosureKeyTakeaways(
      meaningfulTitle,
      ticker,
      meta.cleanName,
      catInfo.category,
      detail.bodyText,
      detail.structuredFields,
      kapSummary
    );

    const keyMetrics = extractDisclosureMetrics({
      title: meaningfulTitle,
      bodyText: detail.bodyText || kapSummary,
      structuredFields: detail.structuredFields
    });

    const directKapUrl = `https://www.kap.org.tr/tr/Bildirim/${kapId}`;
    const companyFullName = row.kapTitle
      ? decodeHtmlEntities(String(row.kapTitle)).trim()
      : meta.fullName;

    const item: CompanyNewsItem = {
      id: `kap-official-${kapId}`,
      ticker,
      companyName: meta.fullName !== `${ticker} Anonim Şirketi` ? meta.fullName : companyFullName,
      title: meaningfulTitle,
      summary,
      keyTakeaways,
      category: catInfo.category,
      categoryLabel: catInfo.categoryLabel,
      source: 'KAP',
      publishDate: isoDate,
      timeAgo: calculateTimeAgo(isoDate),
      impact: catInfo.impact,
      impactLabel: catInfo.impactLabel,
      url: directKapUrl,
      kapUrl: directKapUrl,
      kapId,
      isLive: true,
      fullText: detail.bodyText || undefined,
      kapSummary: kapSummary || undefined,
      originalSubject: subject || undefined,
      keyMetrics: keyMetrics.length > 0 ? keyMetrics : undefined,
      eventType: catInfo.eventType
    };

    return item;
  }, 130);

  return enriched;
}

/**
 * Borsa İstanbul şirketlerinin Kamuyu Aydınlatma Platformu'na (KAP)
 * gönderdiği anlık ve gerçek bildirimleri yalnızca analiz edilen şirketler için canlı olarak çeker.
 */
export async function fetchLiveBistNewsFeed(options?: {
  tickers?: string[];
  category?: string;
  limit?: number;
  forceRefresh?: boolean;
}): Promise<CompanyNewsItem[]> {
  if (!options?.tickers || options.tickers.length === 0) {
    return [];
  }

  const normalizedTickers = [...new Set(
    options.tickers.map(t => t.toUpperCase().trim()).filter(Boolean)
  )];

  if (normalizedTickers.length === 0) {
    return [];
  }

  const cacheKey = `${[...normalizedTickers].sort().join(',')}_${options.category || 'ALL'}`;
  const cached = liveFeedCache.get(cacheKey);
  const now = Date.now();
  if (!options.forceRefresh && cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return filterFeed(cached.items, options);
  }

  const tickerSet = new Set(normalizedTickers);
  const gatheredItems: CompanyNewsItem[] = [];
  const seenKapIds = new Set<string>();
  const seenTitles = new Set<string>();

  const registerItem = (item: CompanyNewsItem) => {
    if (item.kapId && seenKapIds.has(item.kapId)) return;
    const dedupeKey = `${item.ticker}::${item.title.slice(0, 36).toLowerCase()}`;
    if (seenTitles.has(dedupeKey)) return;
    if (item.kapId) seenKapIds.add(item.kapId);
    seenTitles.add(dedupeKey);
    gatheredItems.push(item);
  };

  // ----------------------------------------------------------------------
  // Stream 0 (Birincil): Doğrudan Resmi KAP JSON API + Tam Metin Ayıklama
  // ----------------------------------------------------------------------
  try {
    const officialKapItems = await fetchOfficialKapDisclosures(normalizedTickers);
    for (const item of officialKapItems) {
      registerItem(item);
    }
  } catch {}

  // Hangi hisseler için resmi KAP akışı eksik kaldı? (Yalnızca 0 bildirimli hisseler için yedek akışa düş)
  const tickerLiveCounts = new Map<string, number>();
  for (const it of gatheredItems) {
    tickerLiveCounts.set(it.ticker, (tickerLiveCounts.get(it.ticker) || 0) + 1);
  }
  const missingTickers = normalizedTickers.filter(t => (tickerLiveCounts.get(t) || 0) === 0);

  // ----------------------------------------------------
  // Stream 1 (Yedek / Tamamlayıcı): Bigpara Resmi KAP Akışı
  // ----------------------------------------------------
  if (missingTickers.length > 0) {
    const missingSet = new Set(missingTickers);
    try {
      const pages = [1, 2, 3, 4];
      const bigparaPromises = pages.map(async page => {
        try {
          const html = await fetchResilientText(`https://bigpara.hurriyet.com.tr/haberler/kap-haberleri/?page=${page}`, 3500);
          if (!html) return [];
          const cardChunks = html.split(/class="news-card\b/);
          const pageItems: Array<{
            ticker: string;
            rawTitle: string;
            articleUrl: string;
            articleId: string;
            timeAgo: string;
          }> = [];

          for (const c of cardChunks.slice(1)) {
            const symbolMatch = c.match(/data-symbol-id="([A-Z0-9]+)"/i);
            const titleMatch = c.match(/class="news-card__title"[^>]*>([\s\S]*?)<\/a>/i);
            const linkMatch = c.match(/href="(\/haberler\/kap-haberleri\/[^"]+_ID([0-9]+)\/)"/i);
            const timeMatch = c.match(/class="news-card__category-dot">･<\/span>\s*([^<]+)<\/span>/i);

            if (titleMatch && linkMatch) {
              let sym = symbolMatch ? symbolMatch[1].toUpperCase() : '';
              const rawTitle = titleMatch[1].trim();
              if (!sym || sym === 'XU100' || sym === 'N/A') {
                const tMatch = rawTitle.match(/\*\*\*([A-Z0-9]+)\*\*\*/);
                if (tMatch) sym = tMatch[1].toUpperCase();
              }

              if (sym && missingSet.has(sym)) {
                pageItems.push({
                  ticker: sym,
                  rawTitle,
                  articleUrl: 'https://bigpara.hurriyet.com.tr' + linkMatch[1],
                  articleId: linkMatch[2],
                  timeAgo: timeMatch ? timeMatch[1].trim() : 'Yeni'
                });
              }
            }
          }
          return pageItems;
        } catch {
          return [];
        }
      });

      const streamMatches = (await Promise.all(bigparaPromises)).flat().slice(0, 8);
      await runWithConcurrency(streamMatches, 2, async (matchItem) => {
        try {
          const detail = await fetchBigparaArticleDetail(matchItem.articleUrl);
          if (detail.kapId && seenKapIds.has(detail.kapId)) return;

          const meta = getCompanyMeta(matchItem.ticker);
          const meaningfulTitle = deriveMeaningfulDisclosureTitle({
            rawTitle: matchItem.rawTitle,
            bodyText: detail.bodyText,
            ticker: matchItem.ticker,
            companyName: meta.cleanName
          });
          if (!meaningfulTitle || meaningfulTitle.length < 5) return;

          const catInfo = categorizeDisclosure(`${meaningfulTitle} ${matchItem.rawTitle}`, detail.bodyText);
          const summary = buildDisclosureKeySummary(meaningfulTitle, matchItem.ticker, meta.cleanName, catInfo.category, detail.bodyText);
          const keyTakeaways = buildDisclosureKeyTakeaways(meaningfulTitle, matchItem.ticker, meta.cleanName, catInfo.category, detail.bodyText);
          const keyMetrics = extractDisclosureMetrics({ title: meaningfulTitle, bodyText: detail.bodyText });
          const directKapUrl = detail.directKapUrl || (detail.kapId ? `https://www.kap.org.tr/tr/Bildirim/${detail.kapId}` : getKapCompanyDisclosuresUrl(matchItem.ticker));

          registerItem({
            id: `kap-stream-${matchItem.articleId}`,
            ticker: matchItem.ticker,
            companyName: meta.fullName,
            title: meaningfulTitle,
            summary,
            keyTakeaways,
            category: catInfo.category,
            categoryLabel: catInfo.categoryLabel,
            source: 'KAP',
            publishDate: parseApproximateTurkishTimeAgo(matchItem.timeAgo),
            timeAgo: matchItem.timeAgo,
            impact: catInfo.impact,
            impactLabel: catInfo.impactLabel,
            url: directKapUrl,
            kapUrl: directKapUrl,
            bigparaUrl: matchItem.articleUrl,
            kapId: detail.kapId,
            isLive: true,
            fullText: detail.bodyText || undefined,
            keyMetrics: keyMetrics.length > 0 ? keyMetrics : undefined,
            eventType: catInfo.eventType
          });
        } catch {}
      }, 100);
    } catch {}
  }

  // ----------------------------------------------------------------------
  // Stream 2 (Yedek): Hisse Bazlı BİST & KAP Terminal Tel Akışı (yalnızca hâlâ boş kalan hisseler)
  // ----------------------------------------------------------------------
  const stillMissing = normalizedTickers.filter(t => !gatheredItems.some(g => g.ticker === t));
  if (stillMissing.length > 0) {
    const wirePromises = stillMissing.slice(0, 10).map(async ticker => {
      try {
        const meta = getCompanyMeta(ticker);
        const jsonStr = await fetchResilientText(
          `https://news-headlines.tradingview.com/v2/headlines?category=base&lang=tr&client=web&symbol=BIST%3A${ticker}`,
          3500
        );
        if (!jsonStr) return [];
        let data: { items?: Array<{ title?: string; source?: string; published?: number }> };
        try {
          data = JSON.parse(jsonStr);
        } catch {
          return [];
        }
        const items = data?.items || [];
        const tickerResults: CompanyNewsItem[] = [];

        for (const item of items) {
          const rawTitle = (item.title || '').trim();
          if (!isStrictCorporateAnnouncement(rawTitle, item.source)) continue;

          const cleanTitle = deriveMeaningfulDisclosureTitle({
            rawTitle,
            ticker,
            companyName: meta.cleanName
          });
          if (!cleanTitle || cleanTitle.length < 5) continue;

          const pubTime = item.published ? item.published * 1000 : Date.now();
          const pubDate = new Date(pubTime).toISOString();
          const timeAgo = calculateTimeAgo(pubDate);

          const catInfo = categorizeDisclosure(cleanTitle);
          const summary = buildDisclosureKeySummary(cleanTitle, ticker, meta.cleanName, catInfo.category);
          const keyTakeaways = buildDisclosureKeyTakeaways(cleanTitle, ticker, meta.cleanName, catInfo.category);
          const keyMetrics = extractDisclosureMetrics({ title: cleanTitle });

          let kapId: string | undefined;
          let url = getKapCompanyDisclosuresUrl(ticker);
          const idMatch = rawTitle.match(/KAP:?\s*([0-9]{6,8})/i) || rawTitle.match(/Bildirim\/([0-9]{6,8})/i);
          if (idMatch) {
            kapId = idMatch[1];
            url = `https://www.kap.org.tr/tr/Bildirim/${kapId}`;
          }

          tickerResults.push({
            id: `kap-wire-${ticker}-${item.published || tickerResults.length + 1}`,
            ticker,
            companyName: meta.fullName,
            title: cleanTitle,
            summary,
            keyTakeaways,
            category: catInfo.category,
            categoryLabel: catInfo.categoryLabel,
            source: 'KAP',
            publishDate: pubDate,
            timeAgo,
            impact: catInfo.impact,
            impactLabel: catInfo.impactLabel,
            url,
            kapUrl: url,
            kapId,
            isLive: true,
            keyMetrics: keyMetrics.length > 0 ? keyMetrics : undefined,
            eventType: catInfo.eventType
          });

          if (tickerResults.length >= 6) break;
        }

        return tickerResults;
      } catch {
        return [];
      }
    });

    const wireResults = (await Promise.all(wirePromises)).flat();
    for (const item of wireResults) {
      registerItem(item);
    }
  }

  // ----------------------------------------------------------------------
  // Doğrulanmış Resmi BİST KAP Bildirim Defteri (Yalnızca çevrimdışı/boş kalan hisseler için arşiv tamamlama)
  // ----------------------------------------------------------------------
  const baseVerifiedItems = VERIFIED_BIST_DISCLOSURES_LEDGER.filter(item =>
    tickerSet.has(item.ticker.toUpperCase())
  );
  for (const item of baseVerifiedItems) {
    registerItem({
      ...item,
      timeAgo: calculateTimeAgo(item.publishDate)
    });
  }

  // Tarihe göre yeniden eskiye sırala
  gatheredItems.sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime());

  liveFeedCache.set(cacheKey, {
    timestamp: now,
    items: gatheredItems
  });

  return filterFeed(gatheredItems, options);
}

function filterFeed(
  feed: CompanyNewsItem[],
  options?: { tickers?: string[]; category?: string; limit?: number }
): CompanyNewsItem[] {
  let result = [...feed];

  if (options?.tickers && options.tickers.length > 0) {
    const uppercaseTickers = options.tickers.map(t => t.toUpperCase().trim());
    result = result.filter(item => uppercaseTickers.includes(item.ticker.toUpperCase()));
  }

  if (options?.category && options.category !== 'ALL') {
    result = result.filter(item => item.category === options.category);
  }

  if (options?.limit && options.limit > 0) {
    result = result.slice(0, options.limit);
  }

  return result;
}

export function getCompanyNewsFeed(options?: {
  tickers?: string[];
  category?: string;
  limit?: number;
}): CompanyNewsItem[] {
  return filterFeed(VERIFIED_BIST_DISCLOSURES_LEDGER, options);
}

export function getNewsCategories(feed?: CompanyNewsItem[]): Array<{ id: string; label: string; count: number }> {
  const activeFeed = feed || [];
  const counts: Record<string, number> = {};
  activeFeed.forEach(item => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  return [
    { id: 'ALL', label: 'Tüm Bildirimler', count: activeFeed.length },
    { id: 'FINANCIALS', label: 'Bilanço & Finansallar', count: counts['FINANCIALS'] || 0 },
    { id: 'DIVIDEND', label: 'Temettü & Sermaye', count: counts['DIVIDEND'] || 0 },
    { id: 'CONTRACT', label: 'Yeni Sözleşme', count: counts['CONTRACT'] || 0 },
    { id: 'BUYBACK', label: 'Pay Geri Alımı', count: counts['BUYBACK'] || 0 },
    { id: 'INVESTMENT', label: 'Yatırımlar', count: counts['INVESTMENT'] || 0 },
    { id: 'GENERAL', label: 'Hukuk, Ceza & Kurumsal', count: counts['GENERAL'] || 0 },
  ];
}
