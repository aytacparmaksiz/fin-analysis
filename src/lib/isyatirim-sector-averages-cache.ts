/**
 * İş Yatırım Resmi Web Portalı 53 Alt Sektör Resmi Çarpan Ortalamaları Başlangıç Tabanı (Baseline)
 * Kaynak: https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Temel-Degerler-Ve-Oranlar.aspx?sektor={SEKTOR_KODU}
 * Güncelleme: 15 Ekim 2026
 */

export interface IsYatirimSectorAverage {
  sectorCode: string;
  sectorName: string;
  pe: number | null;
  evEbitda: number | null;
  evSales: number | null;
  pb: number | null;
  updatedAt: string;
}

export const OFFICIAL_ISYATIRIM_SECTOR_AVERAGES_BASELINE: Record<string, IsYatirimSectorAverage> = {
  "0001": {
    "sectorCode": "0001",
    "sectorName": "Bankacılık",
    "pe": 5.17,
    "evEbitda": null,
    "evSales": null,
    "pb": 1.03,
    "updatedAt": "2026-10-15T13:01:48.236Z"
  },
  "0051": {
    "sectorCode": "0051",
    "sectorName": "Aracı Kurumlar",
    "pe": 4,
    "evEbitda": 2.37,
    "evSales": 0.08,
    "pb": 0.9,
    "updatedAt": "2026-10-15T13:01:48.948Z"
  },
  "0004": {
    "sectorCode": "0004",
    "sectorName": "Cam",
    "pe": 9.8,
    "evEbitda": 13.24,
    "evSales": 1.02,
    "pb": 0.43,
    "updatedAt": "2026-10-15T13:01:50.632Z"
  },
  "0002": {
    "sectorCode": "0002",
    "sectorName": "Bilgisayar Toptancılığı",
    "pe": 14.56,
    "evEbitda": 3.78,
    "evSales": 0.1,
    "pb": 1.41,
    "updatedAt": "2026-10-15T13:01:50.921Z"
  },
  "0003": {
    "sectorCode": "0003",
    "sectorName": "Boya",
    "pe": 21.99,
    "evEbitda": 12.73,
    "evSales": 3.91,
    "pb": 6.64,
    "updatedAt": "2026-10-15T13:01:51.882Z"
  },
  "0008": {
    "sectorCode": "0008",
    "sectorName": "Demir-Çelik Temel",
    "pe": 27.37,
    "evEbitda": 10.03,
    "evSales": 1.03,
    "pb": 0.95,
    "updatedAt": "2026-10-15T13:01:52.206Z"
  },
  "0005": {
    "sectorCode": "0005",
    "sectorName": "Çimento",
    "pe": 10.82,
    "evEbitda": 7.68,
    "evSales": 1.32,
    "pb": 1.24,
    "updatedAt": "2026-10-15T13:01:53.768Z"
  },
  "0006": {
    "sectorCode": "0006",
    "sectorName": "Dayanıklı Tüketim",
    "pe": 12.5,
    "evEbitda": 7.04,
    "evSales": 0.58,
    "pb": 0.79,
    "updatedAt": "2026-10-15T13:01:54.292Z"
  },
  "0007": {
    "sectorCode": "0007",
    "sectorName": "Demir-Çelik Döküm",
    "pe": 8.34,
    "evEbitda": 7.58,
    "evSales": 2.12,
    "pb": 3.24,
    "updatedAt": "2026-10-15T13:01:54.948Z"
  },
  "0009": {
    "sectorCode": "0009",
    "sectorName": "Deri Giyim",
    "pe": 8.26,
    "evEbitda": 3.06,
    "evSales": 1.44,
    "pb": 0.95,
    "updatedAt": "2026-10-15T13:01:56.028Z"
  },
  "0038": {
    "sectorCode": "0038",
    "sectorName": "Elektrik - Doğalgaz Dağıtım",
    "pe": 19.54,
    "evEbitda": 9.1,
    "evSales": 2.01,
    "pb": 1.6,
    "updatedAt": "2026-10-15T13:01:56.390Z"
  },
  "0012": {
    "sectorCode": "0012",
    "sectorName": "Elektrik Enerji Ürt.Teçh/Tesis Kurulum",
    "pe": 17.89,
    "evEbitda": 11.31,
    "evSales": 3.63,
    "pb": 3.31,
    "updatedAt": "2026-10-15T13:01:57.700Z"
  },
  "0011": {
    "sectorCode": "0011",
    "sectorName": "Elektrik Üretim",
    "pe": 16.87,
    "evEbitda": 8.39,
    "evSales": 3.56,
    "pb": 0.84,
    "updatedAt": "2026-10-15T13:01:58.909Z"
  },
  "0010": {
    "sectorCode": "0010",
    "sectorName": "Eğlence Hizmetleri",
    "pe": 8.63,
    "evEbitda": 4.11,
    "evSales": 2.06,
    "pb": 4.64,
    "updatedAt": "2026-10-15T13:01:59.309Z"
  },
  "0049": {
    "sectorCode": "0049",
    "sectorName": "Diğer",
    "pe": 5.32,
    "evEbitda": 9.62,
    "evSales": 2.9,
    "pb": 1.77,
    "updatedAt": "2026-10-15T13:02:00.568Z"
  },
  "0054": {
    "sectorCode": "0054",
    "sectorName": "Endüstriyel Makine -Teçhizat Üretim",
    "pe": 8.22,
    "evEbitda": 11.34,
    "evSales": 7.29,
    "pb": 4.64,
    "updatedAt": "2026-10-15T13:02:02.143Z"
  },
  "0015": {
    "sectorCode": "0015",
    "sectorName": "GYO",
    "pe": 7.63,
    "evEbitda": null,
    "evSales": null,
    "pb": 0.79,
    "updatedAt": "2026-10-15T13:02:02.291Z"
  },
  "0013": {
    "sectorCode": "0013",
    "sectorName": "Endüstriyel Tekstil",
    "pe": 6.66,
    "evEbitda": 15.11,
    "evSales": 2.72,
    "pb": 0.62,
    "updatedAt": "2026-10-15T13:02:06.132Z"
  },
  "0014": {
    "sectorCode": "0014",
    "sectorName": "Fin.Kiralama ve Faktoring",
    "pe": 12.18,
    "evEbitda": null,
    "evSales": null,
    "pb": 4.42,
    "updatedAt": "2026-10-15T13:02:07.123Z"
  },
  "0016": {
    "sectorCode": "0016",
    "sectorName": "Gıda",
    "pe": 14.75,
    "evEbitda": 11.08,
    "evSales": 1.78,
    "pb": 2.42,
    "updatedAt": "2026-10-15T13:02:07.732Z"
  },
  "0050": {
    "sectorCode": "0050",
    "sectorName": "İletişim",
    "pe": 9.38,
    "evEbitda": 2.71,
    "evSales": 1.1,
    "pb": 0.71,
    "updatedAt": "2026-10-15T13:02:09.727Z"
  },
  "0019": {
    "sectorCode": "0019",
    "sectorName": "Holdingler",
    "pe": 11.25,
    "evEbitda": null,
    "evSales": null,
    "pb": 1.1,
    "updatedAt": "2026-10-15T13:02:09.827Z"
  },
  "0017": {
    "sectorCode": "0017",
    "sectorName": "Havayolları ve Hizm.",
    "pe": 5.81,
    "evEbitda": 5.22,
    "evSales": 0.92,
    "pb": 0.59,
    "updatedAt": "2026-10-15T13:02:10.270Z"
  },
  "0020": {
    "sectorCode": "0020",
    "sectorName": "İletişim Cihazları",
    "pe": null,
    "evEbitda": 7.63,
    "evSales": 0.87,
    "pb": 1.8,
    "updatedAt": "2026-10-15T13:02:10.451Z"
  },
  "0018": {
    "sectorCode": "0018",
    "sectorName": "Hayvancılık",
    "pe": 9.21,
    "evEbitda": 7.58,
    "evSales": 1.18,
    "pb": 2.26,
    "updatedAt": "2026-10-15T13:02:11.897Z"
  },
  "0021": {
    "sectorCode": "0021",
    "sectorName": "İnşaat Malzemeleri",
    "pe": 12.59,
    "evEbitda": 8.5,
    "evSales": 1.02,
    "pb": 2.46,
    "updatedAt": "2026-10-15T13:02:12.705Z"
  },
  "0022": {
    "sectorCode": "0022",
    "sectorName": "İnşaat- Taahhüt",
    "pe": 13.16,
    "evEbitda": 12.7,
    "evSales": 1.92,
    "pb": 1.72,
    "updatedAt": "2026-10-15T13:02:14.499Z"
  },
  "0023": {
    "sectorCode": "0023",
    "sectorName": "Kablo",
    "pe": 13.88,
    "evEbitda": 12.9,
    "evSales": 3.13,
    "pb": 2.81,
    "updatedAt": "2026-10-15T13:02:15.418Z"
  },
  "0026": {
    "sectorCode": "0026",
    "sectorName": "Kırtasiye",
    "pe": null,
    "evEbitda": 4.66,
    "evSales": 1.84,
    "pb": 2.86,
    "updatedAt": "2026-10-15T13:02:15.555Z"
  },
  "0024": {
    "sectorCode": "0024",
    "sectorName": "Kağıt Ürünleri",
    "pe": 11.38,
    "evEbitda": 10.42,
    "evSales": 1.66,
    "pb": 1.5,
    "updatedAt": "2026-10-15T13:02:16.529Z"
  },
  "0030": {
    "sectorCode": "0030",
    "sectorName": "Mobilya",
    "pe": 5.49,
    "evEbitda": 8,
    "evSales": 1.2,
    "pb": 0.9,
    "updatedAt": "2026-10-15T13:02:17.001Z"
  },
  "0052": {
    "sectorCode": "0052",
    "sectorName": "Madencilik",
    "pe": 24,
    "evEbitda": 13.2,
    "evSales": 4.79,
    "pb": 2.44,
    "updatedAt": "2026-10-15T13:02:17.468Z"
  },
  "0028": {
    "sectorCode": "0028",
    "sectorName": "Medya",
    "pe": 6.98,
    "evEbitda": 11.01,
    "evSales": 1.57,
    "pb": 2.98,
    "updatedAt": "2026-10-15T13:02:18.457Z"
  },
  "0025": {
    "sectorCode": "0025",
    "sectorName": "Kimyasal Ürün",
    "pe": 16.51,
    "evEbitda": 9.9,
    "evSales": 3.32,
    "pb": 1.89,
    "updatedAt": "2026-10-15T13:02:19.765Z"
  },
  "0029": {
    "sectorCode": "0029",
    "sectorName": "Meşrubat / İçecek",
    "pe": 10.47,
    "evEbitda": 5,
    "evSales": 0.94,
    "pb": 1.86,
    "updatedAt": "2026-10-15T13:02:20.882Z"
  },
  "0035": {
    "sectorCode": "0035",
    "sectorName": "Perakande - Ticaret",
    "pe": 16.12,
    "evEbitda": 8.87,
    "evSales": 0.58,
    "pb": 2.22,
    "updatedAt": "2026-10-15T13:02:21.232Z"
  },
  "0034": {
    "sectorCode": "0034",
    "sectorName": "Pazarlama",
    "pe": 10.72,
    "evEbitda": 9.08,
    "evSales": 3.89,
    "pb": 3.2,
    "updatedAt": "2026-10-15T13:02:22.873Z"
  },
  "0031": {
    "sectorCode": "0031",
    "sectorName": "Otomotiv",
    "pe": 9.19,
    "evEbitda": 9.92,
    "evSales": 0.59,
    "pb": 1.98,
    "updatedAt": "2026-10-15T13:02:22.899Z"
  },
  "0032": {
    "sectorCode": "0032",
    "sectorName": "Otomotiv Lastiği",
    "pe": null,
    "evEbitda": 5.32,
    "evSales": 0.44,
    "pb": 1.06,
    "updatedAt": "2026-10-15T13:02:24.496Z"
  },
  "0033": {
    "sectorCode": "0033",
    "sectorName": "Otomotiv Parçası",
    "pe": 16.64,
    "evEbitda": 22.67,
    "evSales": 2.31,
    "pb": 3.49,
    "updatedAt": "2026-10-15T13:02:25.721Z"
  },
  "0040": {
    "sectorCode": "0040",
    "sectorName": "Sigorta",
    "pe": 4.59,
    "evEbitda": null,
    "evSales": null,
    "pb": 1.78,
    "updatedAt": "2026-10-20T21:00:00.000Z"
  },
  "0039": {
    "sectorCode": "0039",
    "sectorName": "Seramik",
    "pe": 18.59,
    "evEbitda": 9.63,
    "evSales": 1.08,
    "pb": 1.26,
    "updatedAt": "2026-10-15T13:02:27.515Z"
  },
  "0053": {
    "sectorCode": "0053",
    "sectorName": "Savunma",
    "pe": 38.47,
    "evEbitda": 26.41,
    "evSales": 6.99,
    "pb": 5.12,
    "updatedAt": "2026-10-15T13:02:28.775Z"
  },
  "0037": {
    "sectorCode": "0037",
    "sectorName": "Sağlık ve İlaç",
    "pe": 14.88,
    "evEbitda": 5.58,
    "evSales": 1.67,
    "pb": 1.67,
    "updatedAt": "2026-10-15T13:02:29.086Z"
  },
  "0036": {
    "sectorCode": "0036",
    "sectorName": "Petrol",
    "pe": 10.2,
    "evEbitda": 5.88,
    "evSales": 0.55,
    "pb": 1.55,
    "updatedAt": "2026-10-15T13:02:31.366Z"
  },
  "0043": {
    "sectorCode": "0043",
    "sectorName": "Teknoloji",
    "pe": 14.88,
    "evEbitda": 8.55,
    "evSales": 3.48,
    "pb": 2.79,
    "updatedAt": "2026-10-15T13:02:31.743Z"
  },
  "0045": {
    "sectorCode": "0045",
    "sectorName": "Tekstil Entegre",
    "pe": 12.18,
    "evEbitda": 6.46,
    "evSales": 1.37,
    "pb": 1.43,
    "updatedAt": "2026-10-15T13:02:31.758Z"
  },
  "0046": {
    "sectorCode": "0046",
    "sectorName": "Turizm",
    "pe": 7.19,
    "evEbitda": 13.18,
    "evSales": 8.79,
    "pb": 3.39,
    "updatedAt": "2026-10-15T13:02:32.917Z"
  },
  "0042": {
    "sectorCode": "0042",
    "sectorName": "Tarım Kimyasalları",
    "pe": 15.71,
    "evEbitda": 8.56,
    "evSales": 2.29,
    "pb": 2.46,
    "updatedAt": "2026-10-15T13:02:41.403Z"
  },
  "0041": {
    "sectorCode": "0041",
    "sectorName": "Spor",
    "pe": 15.23,
    "evEbitda": 5.41,
    "evSales": 1.1,
    "pb": 1.13,
    "updatedAt": "2026-10-15T13:02:42.003Z"
  },
  "0055": {
    "sectorCode": "0055",
    "sectorName": "Varlık Yönetim",
    "pe": 5.8,
    "evEbitda": null,
    "evSales": 1.85,
    "pb": 1.47,
    "updatedAt": "2026-10-15T13:02:48.718Z"
  },
  "0047": {
    "sectorCode": "0047",
    "sectorName": "Yatırım Ortaklıkları",
    "pe": 3.29,
    "evEbitda": 3.21,
    "evSales": 2.48,
    "pb": 1.78,
    "updatedAt": "2026-10-15T13:02:49.168Z"
  },
  "0048": {
    "sectorCode": "0048",
    "sectorName": "Ulaştırma-Lojistik",
    "pe": 19.05,
    "evEbitda": 7.6,
    "evSales": 1.66,
    "pb": 3.57,
    "updatedAt": "2026-10-15T13:02:50.002Z"
  }
};

export const ISYATIRIM_SECTOR_NAME_TO_CODE: Record<string, string> = {
  "Bankacılık": "0001",
  "Aracı Kurumlar": "0051",
  "Cam": "0004",
  "Bilgisayar Toptancılığı": "0002",
  "Boya": "0003",
  "Demir-Çelik Temel": "0008",
  "Çimento": "0005",
  "Dayanıklı Tüketim": "0006",
  "Demir-Çelik Döküm": "0007",
  "Deri Giyim": "0009",
  "Elektrik - Doğalgaz Dağıtım": "0038",
  "Elektrik Enerji Ürt.Teçh/Tesis Kurulum": "0012",
  "Elektrik Üretim": "0011",
  "Eğlence Hizmetleri": "0010",
  "Diğer": "0049",
  "Endüstriyel Makine -Teçhizat Üretim": "0054",
  "GYO": "0015",
  "Endüstriyel Tekstil": "0013",
  "Fin.Kiralama ve Faktoring": "0014",
  "Gıda": "0016",
  "İletişim": "0050",
  "Holdingler": "0019",
  "Havayolları ve Hizm.": "0017",
  "İletişim Cihazları": "0020",
  "Hayvancılık": "0018",
  "İnşaat Malzemeleri": "0021",
  "İnşaat- Taahhüt": "0022",
  "Kablo": "0023",
  "Kırtasiye": "0026",
  "Kağıt Ürünleri": "0024",
  "Mobilya": "0030",
  "Madencilik": "0052",
  "Medya": "0028",
  "Kimyasal Ürün": "0025",
  "Meşrubat / İçecek": "0029",
  "Perakande - Ticaret": "0035",
  "Pazarlama": "0034",
  "Otomotiv": "0031",
  "Otomotiv Lastiği": "0032",
  "Otomotiv Parçası": "0033",
  "Sigorta": "0040",
  "Seramik": "0039",
  "Savunma": "0053",
  "Sağlık ve İlaç": "0037",
  "Petrol": "0036",
  "Teknoloji": "0043",
  "Tekstil Entegre": "0045",
  "Turizm": "0046",
  "Tarım Kimyasalları": "0042",
  "Spor": "0041",
  "Varlık Yönetim": "0055",
  "Yatırım Ortaklıkları": "0047",
  "Ulaştırma-Lojistik": "0048"
};
