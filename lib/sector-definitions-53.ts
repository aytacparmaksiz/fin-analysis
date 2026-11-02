/**
 * Borsa İstanbul 53 Resmi Sektör Eksiksiz Tanım, Skorlama & Arketip Mimarisi
 * Otomatik Üretilmiş & Doğrulanmış Master Konfigürasyon
 * Tarih: 2026
 */

import {
  type SectorType,
  type FinancialArchetype,
  type SectorDefinition,
  type SectorScoringDefinition,
  type SectorArchetypeConfig
} from './sectors.ts';

export const OFFICIAL_53_SECTOR_CONFIGS: Record<string, {
  archetype: FinancialArchetype;
  valuationSector: SectorType;
  definition: SectorDefinition;
  scoring: SectorScoringDefinition;
  archetypeConfig: SectorArchetypeConfig;
}> = {
  "Aracı Kurumlar": {
    archetype: "FINANCIAL_SERVICES",
    valuationSector: "FINANCIAL_SERVICES",
    definition: {
      id: "FINANCIAL_SERVICES",
      title: "Aracı Kurumlar & Menkul Değerler",
      badge: "Aracı Kurumlar / Hacim & Komisyon Modu",
      description: "BIST işlem hacmi pazar payı, komisyon marjı, kredili işlem faiz gelirleri, AUM portföy yönetimi ve sermaye yeterliliği esastır.",
      revenueLabel: "Komisyon & Aracılık Gelirleri",
      revenueSublabel: "Hisse Senedi, VİOP ve Borçlanma Araçları İşlem Komisyonları",
      operatingProfitLabel: "Esas Faaliyet Kârı",
      operatingProfitSublabel: "Komisyon ve Kredili İşlem Faiz Gelirleri Toplamı",
      marginLabel: "Komisyon Marjı & Özkaynak Getirisi (%)",
      marginSublabel: "Net Komisyon / Toplam Aracılık Hacmi",
      valuationMultiples: "PD/DD & F/K",
      primaryEfficiencyMetric: "BIST İşlem Hacmi Pazar Payı (%)",
    },
    scoring: {
      sector: "FINANCIAL_SERVICES",
      categories: [
        {"key":"volume_market_share","name":"BIST İşlem Hacmi & Pazar Payı","maxScore":25,"description":"Pay ve VİOP piyasalarındaki işlem hacmi büyümesi ve pazar payı"},
        {"key":"commission_interest_spread","name":"Komisyon & Kredili Faiz Marjı","maxScore":25,"description":"İşlem başına net komisyon oranı ve kredili mevduat faiz getirisi"},
        {"key":"capital_adequacy","name":"Sermaye Yeterliliği & Özkaynak Tamponu","maxScore":25,"description":"SPK yasal sermaye yeterliliği ve likidite karşılama oranı"},
        {"key":"aum_wealth_mgmt","name":"Portföy Yönetimi (AUM) & ROE","maxScore":25,"description":"Yönetilen varlık büyüklüğü (AUM) ve özkaynak kârlılığı"}
      ],
      riskThresholds: {"nplDanger":4,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "FINANCIAL_SERVICES",
      name: "Aracı Kurumlar & Menkul Değerler",
      badge: "Aracı Kurumlar / Hacim & Komisyon Modu",
      description: "BIST işlem hacmi pazar payı, komisyon marjı, kredili işlem faiz gelirleri, AUM portföy yönetimi ve sermaye yeterliliği esastır.",
      disabledMetrics: ["ebitda","gross_profit","ev_ebitda","ev_sales","net_debt","current_ratio","quick_ratio","financial_debt","stock_turnover","gross_margin","ebitda_margin"],
      featuredMetrics: [{"key":"trading_volume_share","name":"İşlem Hacmi Pazar Payı","unit":"%","description":"BIST toplam pay piyasası pazar payı"},{"key":"commission_spread","name":"Komisyon Marjı","unit":"bps","description":"İşlem hacmi başına net komisyon verimi"},{"key":"credit_interest_income","name":"Kredili İşlem Faiz Geliri","unit":"TL","description":"Müşteri kredili pay alım faiz gelirleri"},{"key":"aum_growth","name":"Yönetilen Portföy (AUM)","unit":"TL","description":"Yatırım fonları ve özel portföy büyüklüğü"},{"key":"roe","name":"Özkaynak Kârlılığı (ROE)","unit":"%","description":"Sermaye verimi ve kârlılık"}],
      
      taxRate: 0.25,
    }
  },
  "Bankacılık": {
    archetype: "BANKING",
    valuationSector: "BANKING",
    definition: {
      id: "BANKING",
      title: "Bankacılık & Finans",
      badge: "Banka / NII & NIM Modu",
      description: "Bankalarda faiz gelirleri, net faiz marjı (NIM), komisyon gelirleri, aktif kalitesi (NPL), sermaye yeterlilik rasyosu (SYR) ve Gordon Justified P/B esastır.",
      revenueLabel: "Net Faiz Geliri (NII)",
      revenueSublabel: "Kredilerden Alınan Faizler - Mevduat Faiz Giderleri",
      operatingProfitLabel: "Faaliyet Kârı (Provizyon Öncesi)",
      operatingProfitSublabel: "Net Faiz + Net Ücret & Komisyon Gelirleri",
      marginLabel: "Net Faiz Marjı (NIM %)",
      marginSublabel: "Net Faiz Geliri / Ortalama Faiz Getirili Aktifler",
      valuationMultiples: "PD/DD & F/K",
      primaryEfficiencyMetric: "Özkaynak Kârlılığı (ROE %)",
    },
    scoring: {
      sector: "BANKING",
      categories: [
        {"key":"asset_quality","name":"Kredi Kalitesi & Risk Yönetimi (NPL)","maxScore":25,"description":"Takipteki alacaklar rasyosu ve karşılık oranları (<%3.0 güçlü)"},
        {"key":"net_interest_margin","name":"Net Faiz Marjı (NIM) & Fonlama","maxScore":25,"description":"Kredi-mevduat makası ve fonlama maliyeti yönetimi"},
        {"key":"capital_adequacy","name":"Sermaye Yeterliliği (SYR) & ROE","maxScore":25,"description":"BDDK yasal sermaye tamponu (SYR >%14) ve özkaynak verimi"},
        {"key":"fee_efficiency","name":"Komisyon & Dijital Bankacılık","maxScore":25,"description":"Faiz dışı gelir üretimi ve operasyonel gider karşılama gücü"}
      ],
      riskThresholds: {"nplDanger":5,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "BANKING",
      name: "Bankacılık & Finans",
      badge: "Banka / NII & NIM Modu",
      description: "Bankalarda faiz gelirleri, net faiz marjı (NIM), komisyon gelirleri, aktif kalitesi (NPL), sermaye yeterlilik rasyosu (SYR) ve Gordon Justified P/B esastır.",
      disabledMetrics: ["ebitda","gross_profit","ev_ebitda","ev_sales","net_debt","current_ratio","quick_ratio","financial_debt","stock_turnover","gross_margin","ebitda_margin"],
      featuredMetrics: [{"key":"nim","name":"Net Faiz Marjı (NIM)","unit":"%","description":"Kredi-mevduat makası ve aktif getiri oranı"},{"key":"net_interest_income","name":"Net Faiz Geliri (NII)","unit":"TL","description":"Faiz gelirleri eksi mevduat faiz giderleri"},{"key":"npl_ratio","name":"Takipteki Krediler Oranı (NPL)","unit":"%","description":"Aktif kalitesi ve tahsilat gücü (<%3.0)"},{"key":"car_syr","name":"Sermaye Yeterliliği (SYR/CAR)","unit":"%","description":"BDDK yasal sermaye tamponu (>%14)"},{"key":"roe","name":"Özkaynak Kârlılığı (ROE)","unit":"%","description":"Banka sermayesinin getiri oranı"}],
      
      taxRate: 0.3,
    }
  },
  "Bilgisayar Toptancılığı": {
    archetype: "TECH",
    valuationSector: "TECH",
    definition: {
      id: "TECH",
      title: "Bilgisayar & Teknoloji Toptancılığı",
      badge: "Distribütörlük / İşletme Sermayesi Modu",
      description: "Distribütörlük işletme sermayesi döngüsü, stok dönüş hızı, döviz koruma mekanizmaları, net kâr marjı ve FD/Satışlar esastır.",
      revenueLabel: "Teknoloji Dağıtım Hasılatı",
      revenueSublabel: "Donanım, Yazılım ve Bulut Çözümleri Toptan Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Operasyonel Dağıtım Kârı",
      marginLabel: "FAVÖK & Net Kâr Marjı (%)",
      marginSublabel: "Düşük Marj / Yüksek Devir Hızı Dengesi",
      valuationMultiples: "FD/Satışlar, F/K & PD/DD",
      primaryEfficiencyMetric: "İşletme Sermayesi Döngüsü & Stok Devri",
    },
    scoring: {
      sector: "TECH",
      categories: [
        {"key":"working_capital_cycle","name":"İşletme Sermayesi & Nakit Dönüşüm Süresi","maxScore":25,"description":"Alacak, borç ve stok vadeleri dengesi (<45 gün)"},
        {"key":"channel_growth","name":"Hasılat Büyümesi & Bayi Yaygınlığı","maxScore":25,"description":"BT harcamaları ve kurumsal distribütörlük genişlemesi"},
        {"key":"margin_fx_protection","name":"Net Marj & Kur Riski Yönetimi","maxScore":25,"description":"Türev hedging ile döviz kur riskinden arındırılmış net kâr"},
        {"key":"capital_efficiency","name":"Sermaye Verimliliği (ROIC & ROE)","maxScore":25,"description":"Yatırılan işletme sermayesinin getiri gücü"}
      ],
      riskThresholds: {"criticalDebtRatio":3,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "TECH",
      name: "Bilgisayar & Teknoloji Toptancılığı",
      badge: "Distribütörlük / İşletme Sermayesi Modu",
      description: "Distribütörlük işletme sermayesi döngüsü, stok dönüş hızı, döviz koruma mekanizmaları, net kâr marjı ve FD/Satışlar esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"working_capital_days","name":"Nakit Dönüşüm Süresi","unit":"Gün","description":"İşletme sermayesinin nakde dönme hızı"},{"key":"inventory_turnover","name":"Stok Devir Hızı","unit":"x","description":"Yıllık stok yenilenme katsayısı"},{"key":"net_margin","name":"Net Kâr Marjı","unit":"%","description":"Hedging ve finansman sonrası net kârlılık"},{"key":"ev_sales","name":"FD / Satışlar","unit":"x","description":"Distribütörlük piyasa çarpanı"},{"key":"roe","name":"Özkaynak Kârlılığı","unit":"%","description":"Sermaye getirisi"}],
      
      taxRate: 0.25,
    }
  },
  "Boya": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Boya & Kaplama Sanayii",
      badge: "Kimya / Döngüsel Marj & İhracat Modu",
      description: "Hammadde maliyetleri (akrilik, solvent, pigment), inşaat/sanayi talebi, ihracat payı ve Through-the-Cycle FAVÖK marjı esastır.",
      revenueLabel: "Boya & Kaplama Satış Gelirleri",
      revenueSublabel: "Dekoratif, Sanayi ve Oto Boyaları Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Operasyonel Faaliyet Kârı",
      marginLabel: "Brüt & FAVÖK Marjı (%)",
      marginSublabel: "Hammadde Maliyet Yansıtma Gücü",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Through-the-Cycle Marj & ROIC",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"raw_material_margin","name":"Hammadde Maliyet Kalkanı & Brüt Marj","maxScore":25,"description":"Petrokimya bazlı hammadde maliyet artışlarını fiyata yansıtma gücü"},
        {"key":"export_expansion","name":"İhracat Payı & Küresel Pazar","maxScore":25,"description":"Yurt dışı pazar çeşitliliği ve döviz gelirleri"},
        {"key":"cash_generation","name":"Nakit Akış Kalitesi (OCF & FCF)","maxScore":25,"description":"Kârın serbest nakde dönüşüm oranı"},
        {"key":"balance_sheet_safety","name":"Bilanço Sağlığı & Net Borç / FAVÖK","maxScore":25,"description":"Borçluluk emniyet seviyesi (<2.5x)"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Boya & Kaplama Sanayii",
      badge: "Kimya / Döngüsel Marj & İhracat Modu",
      description: "Hammadde maliyetleri (akrilik, solvent, pigment), inşaat/sanayi talebi, ihracat payı ve Through-the-Cycle FAVÖK marjı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Fiyatlama gücü"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Hasılat içindeki yurt dışı payı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Cam": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Cam Sanayii & Entegre Soda Külü",
      badge: "Cam / Düzcam & Soda Külü Modu",
      description: "Entegre üretim yapısı, global soda külü (soda ash) ve düzcam fiyatları, fırın yatırımları ve 5 yıllık Through-the-Cycle normalizasyonu esastır.",
      revenueLabel: "Cam & Soda Külü Satış Gelirleri",
      revenueSublabel: "Düzcam, Cam Ev Eşyası, Ambalaj ve Kimyasallar Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Döngüsel Normalleştirilmiş Operasyonel Kâr",
      marginLabel: "Through-the-Cycle FAVÖK Marjı (%)",
      marginSublabel: "5 Yıllık Tarihsel Medyan Kârlılık",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Global Düzcam & Soda Marjı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"cycle_margin","name":"Through-the-Cycle Operasyonel Marj","maxScore":25,"description":"Dip dönem marjlarının 5 yıllık tarihsel medyan ile korunması"},
        {"key":"energy_capex_efficiency","name":"Fırın CapEx & Enerji Verimliliği","maxScore":25,"description":"Doğalgaz ve fırın modernizasyonu yatırım getirisi"},
        {"key":"global_footprint","name":"İhracat & Global Satış Ağı","maxScore":25,"description":"Uluslararası pazar çeşitliliği ve döviz gelirleri"},
        {"key":"asset_base_safety","name":"Varlık Tabanı Koruması & Likidite","maxScore":25,"description":"Maddi duran varlık ikame gücü ve borç tamponu"}
      ],
      riskThresholds: {"criticalDebtRatio":4,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Cam Sanayii & Entegre Soda Külü",
      badge: "Cam / Düzcam & Soda Külü Modu",
      description: "Entegre üretim yapısı, global soda külü (soda ash) ve düzcam fiyatları, fırın yatırımları ve 5 yıllık Through-the-Cycle normalizasyonu esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"mid_cycle_margin","name":"Through-the-Cycle Marj","unit":"%","description":"Döngüsel normalize FAVÖK marjı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Cari çeyrek kârlılığı"},{"key":"export_ratio","name":"İhracat & Global Satış","unit":"%","description":"Yurt dışı hasılat payı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borç karşılama kapasitesi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Yatırılan sermayenin getirisi"}],
      
      taxRate: 0.25,
    }
  },
  "Çimento": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Çimento & Klinker Sanayii",
      badge: "Çimento / Varlık İkame & Döngü Modu",
      description: "Klinker kapasite kullanım oranı, yakıt (petrokök/kömür) maliyet yönetimi, ihracat liman erişimi ve tesis ikame değeri esastır.",
      revenueLabel: "Çimento & Klinker Satış Hasılatı",
      revenueSublabel: "Yurt İçi ve İhracat Çimento / Klinker Sevkiyatları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Ton Başına Operasyonel Kâr",
      marginLabel: "Ton Başına FAVÖK & Marj (%)",
      marginSublabel: "Yakıt ve Enerji Maliyetleri Sonrası Faaliyet Kârı",
      valuationMultiples: "FD/FAVÖK, F/K & FD/Kapasite (Ton)",
      primaryEfficiencyMetric: "Kapasite Kullanımı & İkame Değeri",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"capacity_utilization","name":"Kapasite Kullanımı & Ton Başına Kâr","maxScore":25,"description":"Klinker üretim kapasitesi ve ton başına nakit kârlılık"},
        {"key":"energy_fuel_hedging","name":"Enerji & Yakıt Maliyet Kalkanı","maxScore":25,"description":"Petrokök ve elektrik maliyetlerini fiyata yansıtma gücü"},
        {"key":"free_cash_flow","name":"Nakit Üretimi & Serbest Nakit Akışı","maxScore":25,"description":"Düşük bakım CapEx ile yüksek serbest nakit üretimi"},
        {"key":"debt_coverage","name":"Net Borç / FAVÖK & Bilanço Sağlığı","maxScore":25,"description":"Güçlü sermaye tamponu ve düşük finansal borç"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Çimento & Klinker Sanayii",
      badge: "Çimento / Varlık İkame & Döngü Modu",
      description: "Klinker kapasite kullanım oranı, yakıt (petrokök/kömür) maliyet yönetimi, ihracat liman erişimi ve tesis ikame değeri esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"ebitda_per_ton","name":"Ton Başına FAVÖK","unit":"USD/Ton","description":"Operasyonel klinker kâr marjı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Ciro kârlılığı"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"CapEx sonrası üretilen nakit"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borçluluk çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Dayanıklı Tüketim": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Dayanıklı Tüketim & Beyaz Eşya",
      badge: "Beyaz Eşya / Döngüsel Normalizasyon Modu",
      description: "Küresel talep döngüsü, hammadde (çelik, plastik) maliyetleri, ihracat pazar payı ve TFRS 16 borç düzeltmeli normalizasyon esastır.",
      revenueLabel: "Satış Gelirleri (Hasılat)",
      revenueSublabel: "Beyaz Eşya, Tüketici Elektroniği ve Küçük Ev Aletleri Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Döngüsel Normalleştirilmiş Operasyonel Kâr",
      marginLabel: "Döngüsel FAVÖK Marjı (%)",
      marginSublabel: "Hammadde Enflasyonu Arındırılmış Marj",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Döngüsel FAVÖK Marjı & İhracat Gücü",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"cycle_margin","name":"Through-the-Cycle FAVÖK Marjı","maxScore":25,"description":"Avrupa ve iç pazar talep döngüsünde marj dayanıklılığı"},
        {"key":"export_share","name":"İhracat & Coğrafi Çeşitlilik","maxScore":25,"description":"Küresel marka gücü ve döviz cinsi hasılat oranı"},
        {"key":"working_capital","name":"İşletme Sermayesi & Stok Verimi","maxScore":25,"description":"Bayi ağı tahsilat gücü ve stok nakde dönüşüm hızı"},
        {"key":"debt_service","name":"Borç Karşılama (Net Borç / FAVÖK)","maxScore":25,"description":"Satın alma ve CapEx borçlarının sürdürülebilirliği"}
      ],
      riskThresholds: {"criticalDebtRatio":3.8,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Dayanıklı Tüketim & Beyaz Eşya",
      badge: "Beyaz Eşya / Döngüsel Normalizasyon Modu",
      description: "Küresel talep döngüsü, hammadde (çelik, plastik) maliyetleri, ihracat pazar payı ve TFRS 16 borç düzeltmeli normalizasyon esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel marj"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Yurt dışı hasılat payı"},{"key":"working_capital_days","name":"Nakit Dönüşüm Süresi","unit":"Gün","description":"İşletme sermayesi döngüsü"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borç karşılama kapasitesi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Demir-Çelik Döküm": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Demir-Çelik Döküm & Vasıflı Metal",
      badge: "Döküm / Katma Değerli İmalat Modu",
      description: "Katma değerli alaşımlı döküm, otomotiv ve makine sanayii müşteri sözleşmeleri, hurda/enerji maliyet makası ve Through-the-Cycle medyanı esastır.",
      revenueLabel: "Döküm Parça & Metal Satış Gelirleri",
      revenueSublabel: "Otomotiv, Raylı Sistem ve Makine Döküm Parçaları Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "İşlenmiş & Katma Değerli Ürün Operasyonel Kârı",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "Hurda ve Enerji Maliyetleri Sonrası Kâr",
      valuationMultiples: "FD/FAVÖK & F/K",
      primaryEfficiencyMetric: "Katma Değerli Ürün Marjı & Hurda Makası",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"spread_margin","name":"Brüt Kâr Marjı & Hurda/Enerji Makası","maxScore":25,"description":"Hammadde maliyet artışlarını OEM müşterilere yansıtma hızı"},
        {"key":"oem_export","name":"İhracat & Otomotiv/Makine Sözleşmeleri","maxScore":25,"description":"Tier-1 küresel otomotiv üreticileriyle uzun vadeli kontratlar"},
        {"key":"asset_backing","name":"Varlık İkame Tabanı & CapEx","maxScore":25,"description":"Modern işleme merkezleri ve fırın ikame değeri güvencesi"},
        {"key":"debt_safety","name":"Finansal Kaldıraç & Net Borç / FAVÖK","maxScore":25,"description":"Yatırım borçlarının operasyonel nakitle karşılanması"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Demir-Çelik Döküm & Vasıflı Metal",
      badge: "Döküm / Katma Değerli İmalat Modu",
      description: "Katma değerli alaşımlı döküm, otomotiv ve makine sanayii müşteri sözleşmeleri, hurda/enerji maliyet makası ve Through-the-Cycle medyanı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Fiyatlama gücü"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Döviz cinsi gelir payı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Demir-Çelik Temel": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Demir-Çelik Ana Sanayii",
      badge: "Çelik / HRC Yayılımı & Döngü Modu",
      description: "Sıcak Haddelenmiş Rulo (HRC) - Hurda/Kömür/Cevher fiyat makası, küresel çelik döngüsü, 5 yıllık medyan FAVÖK ve varlık ikame tabanı esastır.",
      revenueLabel: "Yassı & Uzun Çelik Satış Gelirleri",
      revenueSublabel: "HRC, Kangal, Kütük ve Katma Değerli Sac Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Döngüsel Normalleştirilmiş Operasyonel Kâr",
      marginLabel: "Ton Başına FAVÖK & HRC Yayılımı",
      marginSublabel: "Çelik Fiyatı eksi Cevher/Kömür/Hurda Girdileri",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "HRC Fiyat Makası & Medyan FAVÖK",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"hrc_spread","name":"HRC - Hammadde Yayılım Marjı","maxScore":25,"description":"Küresel çelik fiyatı ile cevher ve hurda maliyet makası"},
        {"key":"cycle_ebitda","name":"Through-the-Cycle Medyan Kârlılık","maxScore":25,"description":"5 yıllık tarihsel medyan ile döngü dibi FAVÖK normalizasyonu"},
        {"key":"green_steel_capex","name":"Modernizasyon & Yeşil Çelik CapEx","maxScore":25,"description":"Pelet tesisi ve karbon salınımı azaltıcı yatırımlar"},
        {"key":"balance_sheet_strength","name":"Bilanço Gücü & Net Nakit / Borç","maxScore":25,"description":"Çelik döngüsünün dip evrelerinde güçlü net nakit tamponu"}
      ],
      riskThresholds: {"criticalDebtRatio":4,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Demir-Çelik Ana Sanayii",
      badge: "Çelik / HRC Yayılımı & Döngü Modu",
      description: "Sıcak Haddelenmiş Rulo (HRC) - Hurda/Kömür/Cevher fiyat makası, küresel çelik döngüsü, 5 yıllık medyan FAVÖK ve varlık ikame tabanı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"ebitda_per_ton","name":"Ton Başına FAVÖK","unit":"USD/Ton","description":"Çelik birim kârlılığı"},{"key":"mid_cycle_margin","name":"Through-the-Cycle Marj","unit":"%","description":"Tarihsel normalize marj"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"CapEx sonrası nakit üretimi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Deri Giyim": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Deri Giyim & Lüks Tüketim İmalatı",
      badge: "Deri & Tekstil / İhracat & Marj Modu",
      description: "İhracat payı, lüks segment fiyatlama gücü, hammadde temini ve stok devir verimliliği esastır.",
      revenueLabel: "Deri Mamul & Giyim Satış Gelirleri",
      revenueSublabel: "Deri Konfeksiyon, Saraciye ve Ayakkabı Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Perakende & İhracat Operasyonel Kârı",
      marginLabel: "Brüt & FAVÖK Marjı (%)",
      marginSublabel: "Lüks Segment Fiyatlama Gücü",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "İhracat Kârlılığı & Stok Devri",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"luxury_margin","name":"Brüt Kâr Marjı & Fiyatlama Gücü","maxScore":25,"description":"Lüks ve üst segment ürünlerde yüksek brüt kârlılık koruması"},
        {"key":"export_fx","name":"İhracat Hasılat Oranı & Kur Koruması","maxScore":25,"description":"Avrupa ve küresel markalara yapılan ihracatın ciro payı"},
        {"key":"inventory_speed","name":"Stok Devir Hızı & Fire Oranı","maxScore":25,"description":"Pahalı hammadde stoklarının hızlı nakde çevrilmesi"},
        {"key":"liquidity_debt","name":"Likidite & Borç Karşılama","maxScore":25,"description":"Kısa vadeli işletme kredisi yükünün yönetilebilirliği"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Deri Giyim & Lüks Tüketim İmalatı",
      badge: "Deri & Tekstil / İhracat & Marj Modu",
      description: "İhracat payı, lüks segment fiyatlama gücü, hammadde temini ve stok devir verimliliği esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Fiyatlama gücü"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Döviz geliri payı"},{"key":"inventory_turnover","name":"Stok Devir Hızı","unit":"x","description":"Stok dönüş hızı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borçluluk çarpanı"}],
      
      taxRate: 0.25,
    }
  },
  "Diğer": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Genel Sanayi & Çeşitli Hizmetler",
      badge: "Sanayi / Reel Sektör Modu",
      description: "Standart reel sektör dinamikleri: Brüt Kâr, FAVÖK Marjı, Net Borç / FAVÖK, ROIC ve nakit dönüşüm verimi esastır.",
      revenueLabel: "Satış Gelirleri (Hasılat)",
      revenueSublabel: "Net Satışlar ve Esas Faaliyet Gelirleri",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Faiz, Amortisman ve Vergi Öncesi Operasyonel Kâr",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "FAVÖK / Satış Gelirleri",
      valuationMultiples: "FD/FAVÖK, F/K & PD/DD",
      primaryEfficiencyMetric: "ROIC vs WACC Sermaye Makası",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"financial_health","name":"Finansal Sağlık & Likidite","maxScore":25,"description":"Cari oran (>1.2) ve Net Borç / FAVÖK (<2.5x) emniyet seviyeleri"},
        {"key":"capital_efficiency","name":"Sermaye Verimliliği (ROIC > WACC)","maxScore":25,"description":"Yatırılan sermaye getirisinin ağırlıklı sermaye maliyetini aşması"},
        {"key":"cash_flow_quality","name":"Nakit Akış Kalitesi (OCF & FCF)","maxScore":25,"description":"Kârın serbest nakde dönüşümü ve kaliteli bilanço"},
        {"key":"growth_moat","name":"Reel Büyüme & Rekabet Moat","maxScore":25,"description":"Hasılat artışı, fiyatlama gücü ve pazar payı"}
      ],
      riskThresholds: {"criticalDebtRatio":4,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Genel Sanayi & Çeşitli Hizmetler",
      badge: "Sanayi / Reel Sektör Modu",
      description: "Standart reel sektör dinamikleri: Brüt Kâr, FAVÖK Marjı, Net Borç / FAVÖK, ROIC ve nakit dönüşüm verimi esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Fiyatlama gücü"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel marj"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"},{"key":"current_ratio","name":"Cari Oran","unit":"x","description":"Likidite gücü"}],
      
      taxRate: 0.25,
    }
  },
  "Eğlence Hizmetleri": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Eğlence, Medya & Rekreasyon Hizmetleri",
      badge: "Eğlence / Biletleme & Etkinlik Modu",
      description: "Etkinlik trafiği, biletleme ve sponsorluk hasılatı, mevsimsellik ve serbest nakit akışı esastır.",
      revenueLabel: "Hizmet & Etkinlik Gelirleri",
      revenueSublabel: "Biletleme, Lisans, Sponsorluk ve Yiyecek/İçecek Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Etkinlik ve Tesis Operasyonel Kârı",
      marginLabel: "FAVÖK & Faaliyet Marjı (%)",
      marginSublabel: "Operasyonel Nakit Kârlılığı",
      valuationMultiples: "FD/FAVÖK & F/K",
      primaryEfficiencyMetric: "Nakit Akış Dönüşüm Oranı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"attendance_growth","name":"Hasılat Büyümesi & Doluluk Oranı","maxScore":25,"description":"Ziyaretçi trafiği ve bilet başı ortalama gelir büyümesi"},
        {"key":"operating_leverage","name":"Faaliyet Kârı & Operasyonel Kaldıraç","maxScore":25,"description":"Sabit tesis giderleri karşısında artan hasılatın marja katkısı"},
        {"key":"cash_quality","name":"Nakit Akış Kalitesi (FCF)","maxScore":25,"description":"Peşin bilet tahsilatları ile negatif çalışma sermayesi üretimi"},
        {"key":"debt_flexibility","name":"Borçluluk & Finansal Esneklik","maxScore":25,"description":"Düşük finansal borç ve tesis amortisman dengesi"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Eğlence, Medya & Rekreasyon Hizmetleri",
      badge: "Eğlence / Biletleme & Etkinlik Modu",
      description: "Etkinlik trafiği, biletleme ve sponsorluk hasılatı, mevsimsellik ve serbest nakit akışı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"Tesis yatırımları sonrası nakit"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"current_ratio","name":"Cari Oran","unit":"x","description":"Kısa vadeli likidite"},{"key":"roe","name":"Özkaynak Kârlılığı","unit":"%","description":"Sermaye verimi"}],
      
      taxRate: 0.25,
    }
  },
  "Elektrik - Doğalgaz Dağıtım": {
    archetype: "UTILITIES_TELCO",
    valuationSector: "UTILITIES_TELCO",
    definition: {
      id: "UTILITIES_TELCO",
      title: "Elektrik & Doğalgaz Dağıtım Altyapısı",
      badge: "Regüle Altyapı / EPDK RAB Modu",
      description: "EPDK Düzenlemeye Tabi Varlık Tabanı (RAB / Regulated Asset Base), reel WACC getirisi, kayıp-kaçak verimi ve garantili tarife nakit akışı esastır.",
      revenueLabel: "Dağıtım & Perakende Elektrik Hasılatı",
      revenueSublabel: "EPDK Regüle Dağıtım Tarifesi ve Perakende Enerji Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Regüle Getiri ve Operasyonel Verimlilik Kârı",
      marginLabel: "RAB Getiri Oranı & FAVÖK Marjı (%)",
      marginSublabel: "Düzenlemeye Tabi Varlık Getirisi",
      valuationMultiples: "FD/FAVÖK & Justified P/B",
      primaryEfficiencyMetric: "RAB Getirisi & Reel WACC",
    },
    scoring: {
      sector: "UTILITIES_TELCO",
      categories: [
        {"key":"rab_growth","name":"RAB (Düzenlemeye Tabi Varlık) Büyümesi","maxScore":25,"description":"EPDK onaylı şebeke yatırımları ve varlık tabanı büyümesi"},
        {"key":"efficiency_losses","name":"Operasyonel Verimlilik & Kayıp-Kaçak","maxScore":25,"description":"Hedef kayıp-kaçak oranının altında kalarak ilave teşvik primi kazanma"},
        {"key":"fcf_dividend","name":"Serbest Nakit Akışı & Temettü Gücü","maxScore":25,"description":"Düzenli tarife nakit akışı ve sürdürülebilir kâr payı dağıtımı"},
        {"key":"debt_service","name":"Borç Karşılama (Net Borç / FAVÖK)","maxScore":25,"description":"Uzun vadeli altyapı borç servis karşılama rasyosu"}
      ],
      riskThresholds: {"criticalDebtRatio":4.5,"minLiquidityRatio":0.8,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "UTILITIES_TELCO",
      name: "Elektrik & Doğalgaz Dağıtım Altyapısı",
      badge: "Regüle Altyapı / EPDK RAB Modu",
      description: "EPDK Düzenlemeye Tabi Varlık Tabanı (RAB / Regulated Asset Base), reel WACC getirisi, kayıp-kaçak verimi ve garantili tarife nakit akışı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"rab_growth_rate","name":"RAB Büyüme Oranı","unit":"%","description":"Düzenlemeye tabi varlık artışı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Dağıtım tarifesi kârlılığı"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"CapEx sonrası temettü kaynağı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Altyapı borç yükü (<4.0x)"},{"key":"dividend_yield","name":"Temettü Verimi","unit":"%","description":"Yıllık kâr payı getirisi"}],
      
      taxRate: 0.25,
    }
  },
  "Elektrik Enerji Ürt.Teçh/Tesis Kurulum": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Elektrik Enerji Teçhizatı, Trafo & Tesis Kurulum",
      badge: "Teçhizat / Backlog & İhracat Modu",
      description: "Trafo, şebeke ve güneş paneli sipariş birikimi (Backlog), ihracat oranı, yüksek marjlı proje teslimatları ve CapEx çarpanı esastır.",
      revenueLabel: "Teçhizat Satış & Mühendislik Hasılatı",
      revenueSublabel: "Trafo, Güneş Paneli, Şalt Sahası ve EPC Taahhüt Gelirleri",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Katma Değerli Ekipman ve Proje Faaliyet Kârı",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "Mühendislik ve İhracat Odaklı Operasyonel Marj",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Sipariş Birikimi (Backlog) & FAVÖK Marjı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"backlog_coverage","name":"Sipariş Backlog / Hasılat Oranı","maxScore":25,"description":"Gelecek 12-24 aylık ciroyu güvenceye alan teyitli sipariş stoğu"},
        {"key":"export_ratio","name":"İhracat Payı & Küresel Sertifikasyon","maxScore":25,"description":"Avrupa ve ABD şebekelerine yapılan yüksek marjlı trafo ihracatı"},
        {"key":"margin_stability","name":"Yüksek FAVÖK Marjı Stabilitesi","maxScore":25,"description":"Katma değerli teknoloji üretimiyle korunan %25+ FAVÖK marjı"},
        {"key":"net_cash_safety","name":"Net Nakit Pozisyonu & İşletme Sermayesi","maxScore":25,"description":"Peşin proje avansları ile sıfır net borç ve finansal rahatlık"}
      ],
      riskThresholds: {"criticalDebtRatio":2.8,"minLiquidityRatio":1.3,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Elektrik Enerji Teçhizatı, Trafo & Tesis Kurulum",
      badge: "Teçhizat / Backlog & İhracat Modu",
      description: "Trafo, şebeke ve güneş paneli sipariş birikimi (Backlog), ihracat oranı, yüksek marjlı proje teslimatları ve CapEx çarpanı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"backlog_book_to_bill","name":"Book-to-Bill Oranı","unit":"x","description":"Alınan sipariş / Faturalanan ciro (>1.2x)"},{"key":"export_ratio","name":"İhracat Payı","unit":"%","description":"Döviz bazlı satış payı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Yüksek katma değerli operasyonel kâr"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"Yatırımlar sonrası net nakit üretimi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Elektrik Üretim": {
    archetype: "UTILITIES_TELCO",
    valuationSector: "UTILITIES_TELCO",
    definition: {
      id: "UTILITIES_TELCO",
      title: "Elektrik Üretimi & Yenilenebilir Enerji",
      badge: "Enerji Üretim / Kurulu Güç (MW) & PTF Modu",
      description: "Kurulu güç (MW), YEKDEM döviz bazlı alım garantileri, serbest piyasa PTF fiyatlama esnekliği ve proje finansmanı borç köprüsü esastır.",
      revenueLabel: "Elektrik Üretim Satış Hasılatı",
      revenueSublabel: "YEKDEM Alım Garantisi ve Serbest Piyasa (PTF) Elektrik Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Santral Operasyonel Nakit Akışı",
      marginLabel: "FAVÖK Marjı & MWh Başı Kâr",
      marginSublabel: "Üretim Maliyeti Sonrası Serbest Nakit Marjı",
      valuationMultiples: "FD/FAVÖK, FD/MW & F/K",
      primaryEfficiencyMetric: "Kurulu Güç (MW) & FCF Verimi",
    },
    scoring: {
      sector: "UTILITIES_TELCO",
      categories: [
        {"key":"mw_growth","name":"Kurulu Güç (MW) Kapasite Büyümesi","maxScore":25,"description":"Rüzgar, güneş ve hidroelektrik santral yatırımları ile MW artışı"},
        {"key":"pricing_mix","name":"YEKDEM / PTF Satış Fiyatlama Dengesi","maxScore":25,"description":"Dolar garantili YEKDEM tarifesi ile serbest PTF satış dengesi"},
        {"key":"fcf_generation","name":"Serbest Nakit Akışı (FCF) Üretimi","maxScore":25,"description":"Sıfır yakıt maliyetli yenilenebilir üretimden güçlü nakit akışı"},
        {"key":"project_debt","name":"Proje Finansmanı Borç Karşılama Gücü","maxScore":25,"description":"Uzun vadeli santral yatırım borçlarının FAVÖK ile ödenme gücü"}
      ],
      riskThresholds: {"criticalDebtRatio":4.5,"minLiquidityRatio":0.8,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "UTILITIES_TELCO",
      name: "Elektrik Üretimi & Yenilenebilir Enerji",
      badge: "Enerji Üretim / Kurulu Güç (MW) & PTF Modu",
      description: "Kurulu güç (MW), YEKDEM döviz bazlı alım garantileri, serbest piyasa PTF fiyatlama esnekliği ve proje finansmanı borç köprüsü esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"installed_capacity_mw","name":"Kurulu Güç","unit":"MW","description":"Toplam santral üretim kapasitesi"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Üretim operasyonel nakit marjı"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"Santral CapEx sonrası nakit üretimi"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Proje kredisi karşılama oranı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Endüstriyel Makine -Teçhizat Üretim": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Endüstriyel Makine & Ağır Teçhizat Üretimi",
      badge: "Makine / Mühendislik & Sipariş Modu",
      description: "Mühendislik katma değeri, sipariş teslimat döngüsü, ihracat payı ve Through-the-Cycle 5 yıllık tarihsel medyan marjı esastır.",
      revenueLabel: "Makine & Teçhizat Satış Gelirleri",
      revenueSublabel: "Endüstriyel Tesis, Takım Tezgahı ve Ağır Sanayi Ekipmanları Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Katma Değerli İmalat Operasyonel Kârı",
      marginLabel: "Brüt & FAVÖK Marjı (%)",
      marginSublabel: "Mühendislik ve Özelleştirilmiş Tasarım Kârlılığı",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Mühendislik Katma Değeri & ROIC",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"engineering_margin","name":"Katma Değerli Brüt Kâr Marjı","maxScore":25,"description":"Özel tasarım ve Ar-Ge yoğun makinelerde yüksek brüt kâr koruması"},
        {"key":"export_backlog","name":"İhracat Hasılatı & Sipariş Backlog","maxScore":25,"description":"Küresel pazarlara yapılan teslimatlar ve sipariş birikimi"},
        {"key":"cash_conversion","name":"Nakit Akış Kalitesi (OCF / Net Kâr)","maxScore":25,"description":"Hakediş ve teslimat nakdinin bilançoya girişi"},
        {"key":"balance_safety","name":"Borçluluk Güvenliği & Likidite","maxScore":25,"description":"Net Borç / FAVÖK (<2.5x) ve işletme sermayesi güvenliği"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.2,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Endüstriyel Makine & Ağır Teçhizat Üretimi",
      badge: "Makine / Mühendislik & Sipariş Modu",
      description: "Mühendislik katma değeri, sipariş teslimat döngüsü, ihracat payı ve Through-the-Cycle 5 yıllık tarihsel medyan marjı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Fiyatlama gücü"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Döviz geliri payı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Endüstriyel Tekstil": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Endüstriyel & Teknik Tekstil, Kord Bezi",
      badge: "Teknik Tekstil / Kord Bezi & Kompozit Modu",
      description: "Lastik kord bezi, kompozit malzemeler, global OEM onayları, Through-the-Cycle marj normalizasyonu ve varlık tabanı koruması esastır.",
      revenueLabel: "Teknik Tekstil & Kompozit Gelirleri",
      revenueSublabel: "Lastik Kord Bezi, Endüstriyel İplik ve Havacılık Kompozit Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Yüksek Teknolojili Malzeme Operasyonel Kârı",
      marginLabel: "Teknik Ürün FAVÖK Marjı (%)",
      marginSublabel: "OEM Onaylı ve Yüksek Katma Değerli Ürün Kârı",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Kord Bezi Marjı & Global OEM Satışları",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"tech_margin","name":"Teknik Ürün Marjı & Fiyatlama Kalkanı","maxScore":25,"description":"Geleneksel tekstilden ayrışan yüksek kord bezi ve kompozit kârlılığı"},
        {"key":"global_oem","name":"Küresel OEM Pazar Payı & İhracat","maxScore":25,"description":"Dünyanın önde gelen lastik ve havacılık üreticilerine tedarik payı"},
        {"key":"rd_composite","name":"Ar-Ge & Kompozit Yatırımları","maxScore":25,"description":"Havacılık ve otomotiv hafifletme teknolojileri yatırımları"},
        {"key":"balance_strength","name":"Finansal Sağlık & Net Borç / FAVÖK","maxScore":25,"description":"Yatırımların sağlıklı borç/özkaynak dengesiyle fonlanması"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Endüstriyel & Teknik Tekstil, Kord Bezi",
      badge: "Teknik Tekstil / Kord Bezi & Kompozit Modu",
      description: "Lastik kord bezi, kompozit malzemeler, global OEM onayları, Through-the-Cycle marj normalizasyonu ve varlık tabanı koruması esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Fiyatlama kalkanı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Global satış payı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borçluluk çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Fin.Kiralama ve Faktoring": {
    archetype: "FINANCIAL_SERVICES",
    valuationSector: "FINANCIAL_SERVICES",
    definition: {
      id: "FINANCIAL_SERVICES",
      title: "Finansal Kiralama (Leasing) & Faktoring",
      badge: "Finansal Hizmetler / Kredi Spread Modu",
      description: "Net faiz ve faktoring marjı (Spread), plasman hacmi büyümesi, takipteki alacaklar (NPL) karşılıkları ve Gordon Growth Justified P/B esastır.",
      revenueLabel: "Faiz & Finansman Gelirleri",
      revenueSublabel: "Faktoring ve Leasing Sözleşmelerinden Alınan Faizler",
      operatingProfitLabel: "Esas Faaliyet Kârı (Karşılık Öncesi)",
      operatingProfitSublabel: "Net Faiz Marjı ve Komisyon Gelirleri",
      marginLabel: "Net Finansman Spreadi & Marjı (%)",
      marginSublabel: "Plasman Getirisi eksi Fonlama Maliyeti",
      valuationMultiples: "PD/DD & F/K",
      primaryEfficiencyMetric: "Net Faiz Marjı (Spread) & NPL",
    },
    scoring: {
      sector: "FINANCIAL_SERVICES",
      categories: [
        {"key":"asset_quality_npl","name":"Alacak Kalitesi & Karşılık Oranı (NPL)","maxScore":25,"description":"Takipteki faktoring/leasing alacakları rasyosu (<%4.0)"},
        {"key":"interest_spread","name":"Net Faiz & Finansman Spreadi","maxScore":25,"description":"Fonlama maliyeti ile plasman faiz makasının korunması"},
        {"key":"capital_adequacy","name":"Sermaye Yeterliliği & Özkaynak Oranı","maxScore":25,"description":"Kaldıraç yönetimi ve yasal özkaynak tamponu"},
        {"key":"volume_growth","name":"Plasman Hacmi & ROE","maxScore":25,"description":"Faktoring ciro/leasing portföy büyümesi ve özkaynak getirisi"}
      ],
      riskThresholds: {"nplDanger":5,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "FINANCIAL_SERVICES",
      name: "Finansal Kiralama (Leasing) & Faktoring",
      badge: "Finansal Hizmetler / Kredi Spread Modu",
      description: "Net faiz ve faktoring marjı (Spread), plasman hacmi büyümesi, takipteki alacaklar (NPL) karşılıkları ve Gordon Growth Justified P/B esastır.",
      disabledMetrics: ["ebitda","gross_profit","ev_ebitda","ev_sales","net_debt","current_ratio","quick_ratio","financial_debt","stock_turnover","gross_margin","ebitda_margin"],
      featuredMetrics: [{"key":"factoring_income","name":"Finansman Gelirleri","unit":"TL","description":"Faiz ve faktoring gelirleri"},{"key":"npl_ratio","name":"Takipteki Alacaklar (NPL)","unit":"%","description":"Alacak portföy riski (<%4.0)"},{"key":"leverage_ratio","name":"Kaldıraç Oranı","unit":"x","description":"Toplam Varlıklar / Özkaynaklar"},{"key":"roe","name":"Özkaynak Kârlılığı (ROE)","unit":"%","description":"Finansal aracılık kârlılığı"},{"key":"pb","name":"PD/DD","unit":"x","description":"Defter değeri çarpanı"}],
      
      taxRate: 0.25,
    }
  },
  "Gıda": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Gıda Üretimi & İşleme",
      badge: "Gıda / Defansif FMCG Hacim Modu",
      description: "Temel gıda defansif talep gücü, hammadde fiyat dalgalanmalarına karşı esneklik, nakit dönüşüm kalitesi ve tahakkuk riski denetimi esastır.",
      revenueLabel: "Gıda Satış Gelirleri (Hasılat)",
      revenueSublabel: "Temel Gıda, Paketli Tüketim ve Bakliyat/Yağ Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Operasyonel Faaliyet Kârı",
      marginLabel: "Brüt & FAVÖK Marjı (%)",
      marginSublabel: "Tarımsal Hammadde Enflasyonu Arındırılmış Marj",
      valuationMultiples: "FD/FAVÖK & F/K",
      primaryEfficiencyMetric: "Nakit Akış Kalitesi & Brüt Marj",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"defensive_volume","name":"Hacim Büyümesi & Fiyatlama Gücü","maxScore":25,"description":"Defansif temel gıda talebi ve enflasyonist fiyat artışlarını yansıtma gücü"},
        {"key":"margin_management","name":"Brüt Kâr Marjı & Maliyet Yönetimi","maxScore":25,"description":"Tarımsal hammadde fiyat şoklarına karşı tedarik zinciri esnekliği"},
        {"key":"cash_conversion","name":"Nakit Dönüşüm Kalitesi (OCF / Net Kâr)","maxScore":25,"description":"Makyajsız bilanço ve net kârın güçlü işletme nakdine dönüşmesi"},
        {"key":"balance_strength","name":"Bilanço Gücü & Borçsuzluk","maxScore":25,"description":"Düşük net borç ve güçlü işletme sermayesi tamponu"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Gıda Üretimi & İşleme",
      badge: "Gıda / Defansif FMCG Hacim Modu",
      description: "Temel gıda defansif talep gücü, hammadde fiyat dalgalanmalarına karşı esneklik, nakit dönüşüm kalitesi ve tahakkuk riski denetimi esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Hammadde maliyet kalkanı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"CapEx sonrası nakit"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "GYO": {
    archetype: "REIT",
    valuationSector: "REIT",
    definition: {
      id: "REIT",
      title: "Gayrimenkul Yatırım Ortaklığı (GYO)",
      badge: "GYO / NAD & %50 Temettü İstisna Modu (7524 Sayılı Kanun)",
      description: "SPK/EPRA onaylı Net Aktif Değer (NAD), %25-%40 iskonto koridoru, kasadaki net nakdin tam değerle (1.0x) eklenmesi, LTV borçluluk denetimi ve 7524 sayılı Kanun gereği %50 kira temettü dağıtım istisnası esastır.",
      revenueLabel: "Kira & Proje Gelirleri (Hasılat)",
      revenueSublabel: "Düzenli Kira Gelirleri ve Bağımsız Bölüm Satışları",
      operatingProfitLabel: "Esas Faaliyet Kârı (Ekspertiz Öncesi/Dahil)",
      operatingProfitSublabel: "Portföy Operasyonel Kârı ve Ekspertiz Kazançları",
      marginLabel: "Portföy NAD İskontosu (%)",
      marginSublabel: "Piyasa Değeri vs Gayrimenkul Net Aktif Değeri",
      valuationMultiples: "P/NAV (Piyasa/NAD), PD/DD & F/K",
      primaryEfficiencyMetric: "NAD İskontosu & Kira Temettü Verimi",
    },
    scoring: {
      sector: "REIT",
      categories: [
        {"key":"nav_discount","name":"Portföy NAD İskontosu & Ekspertiz Değeri","maxScore":25,"description":"Portföy NAD / Piyasa Değeri iskontosu (%25-%40 üzeri cazip)"},
        {"key":"debt_ltv","name":"Finansal Borç / Portföy (LTV Oranı)","maxScore":25,"description":"Finansal Borç / Aktif oranı (<%40 sağlıklı sermaye tamponu)"},
        {"key":"rental_ffo_yield","name":"Kira Akışı & FFO Verimi","maxScore":25,"description":"Düzenli kira gelirleri ve operasyonel nakit üretimi (FFO)"},
        {"key":"tax_payout_compliance","name":"7524 Sayılı Kanun Temettü Dağıtım Uyumu","maxScore":25,"description":"Kurumlar vergisi istisnası için >=%50 temettü dağıtım şartına uyum"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":0.9,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "REIT",
      name: "Gayrimenkul Yatırım Ortaklığı (GYO)",
      badge: "GYO / NAD & %50 Temettü İstisna Modu (7524 Sayılı Kanun)",
      description: "SPK/EPRA onaylı Net Aktif Değer (NAD), %25-%40 iskonto koridoru, kasadaki net nakdin tam değerle (1.0x) eklenmesi, LTV borçluluk denetimi ve 7524 sayılı Kanun gereği %50 kira temettü dağıtım istisnası esastır.",
      disabledMetrics: ["ev_ebitda","ev_sales"],
      featuredMetrics: [{"key":"nav_discount","name":"Net Aktif Değeri (NAD) İskontosu","unit":"%","description":"Piyasa değeri vs portföy NAD cazibesi"},{"key":"debt_ltv","name":"Kredi / Değer Oranı (LTV)","unit":"%","description":"Finansal borç / Gayrimenkul portföyü (<%40)"},{"key":"reit_payout_ratio","name":"Kira Temettü Dağıtım Oranı","unit":"%","description":"7524 Sayılı Kanun kâr payı eşiği (>=%50)"},{"key":"noi_cap_rate","name":"Kira Getirisi (Cap Rate)","unit":"%","description":"Net faaliyet gelirleri / Portföy değeri"},{"key":"pb_nav","name":"PD / NAD Oranı","unit":"x","description":"Portföy değerleme çarpanı"}],
      
      taxRate: 0,
    }
  },
  "Havayolları ve Hizm.": {
    archetype: "AVIATION",
    valuationSector: "AVIATION",
    definition: {
      id: "AVIATION",
      title: "Havacılık & Yer Hizmetleri İşletmeciliği",
      badge: "Havacılık / TTM & Filo Kiralama Modu",
      description: "Arz Edilen Koltuk Kilometre (AKK/ASK), yolcu doluluk oranları, TTM FAVÖK (3. çeyrek yaz mevsimselliği düzeltmeli), UFRS 16 filo kira borcu köprüsü ve döviz borç dengesi esastır.",
      revenueLabel: "Havacılık & Hizmet Satışları (Hasılat)",
      revenueSublabel: "Yolcu, Kargo ve Yer Hizmetleri Gelirleri",
      operatingProfitLabel: "FAVÖK (TTM)",
      operatingProfitSublabel: "Son 12 Ay Kümülatif Operasyonel Kâr",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "FAVÖK / Toplam Hasılat",
      valuationMultiples: "FD/FAVÖK, F/K & EV/Sales",
      primaryEfficiencyMetric: "Yolcu Trafiği & TTM FAVÖK",
    },
    scoring: {
      sector: "AVIATION",
      categories: [
        {"key":"passenger_capacity","name":"Yolcu Kapasitesi & Doluluk Oranı","maxScore":25,"description":"Arz Edilen Koltuk Kilometre (AKK/ASK) ve yolcu doluluk oranları"},
        {"key":"ttm_profitability","name":"TTM FAVÖK & Faaliyet Kârlılığı","maxScore":25,"description":"Mevsimsellikten arındırılmış son 12 ay operasyonel nakit marjı"},
        {"key":"fx_debt_leverage","name":"Döviz Cinsi Borçluluk & Filo Finansmanı","maxScore":25,"description":"Döviz borç yükü (EUR/USD) ve Net Borç / TTM FAVÖK (<3.5x)"},
        {"key":"cash_fcf_quality","name":"Serbest Nakit Akışı (FCF) & Filo CapEx","maxScore":25,"description":"Uçak yatırımları sonrası serbest nakit üretim gücü"}
      ],
      riskThresholds: {"criticalDebtRatio":4.5,"minLiquidityRatio":0.8,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "AVIATION",
      name: "Havacılık & Yer Hizmetleri İşletmeciliği",
      badge: "Havacılık / TTM & Filo Kiralama Modu",
      description: "Arz Edilen Koltuk Kilometre (AKK/ASK), yolcu doluluk oranları, TTM FAVÖK (3. çeyrek yaz mevsimselliği düzeltmeli), UFRS 16 filo kira borcu köprüsü ve döviz borç dengesi esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"passenger_traffic","name":"Yolcu Trafiği & Doluluk","unit":"Yolcu / %","description":"AKK/ASK ve filo doluluk verimi"},{"key":"ttm_ebitda","name":"TTM FAVÖK","unit":"TL","description":"Son 12 ay kümülatif nakit üretimi"},{"key":"fx_net_debt","name":"Döviz Cinsi Net Borç","unit":"Döviz","description":"EUR/USD cinsi filo kira borçları"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Yakıt ve personel sonrası marj"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"Filo CapEx sonrası serbest nakit"}],
      
      taxRate: 0.25,
    }
  },
  "Hayvancılık": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Hayvancılık, Yem & Entegre Et/Süt Üretimi",
      badge: "Tarım / Biyolojik Varlık & Hacim Modu",
      description: "Biyolojik varlık değerlemesi, yem maliyeti / süt ve et fiyat paritesi, soğuk zincir lojistiği ve nakit dönüşüm kalitesi esastır.",
      revenueLabel: "Hayvansal Ürün & Yem Satış Hasılatı",
      revenueSublabel: "Et, Süt, Damızlık Canlı Varlık ve Yem Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Biyolojik Varlık Değer Düzeltmeli Operasyonel Kâr",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "Yem Girdisi Sonrası Faaliyet Kârı",
      valuationMultiples: "FD/FAVÖK & F/K",
      primaryEfficiencyMetric: "Yem Paritesi & Biyolojik Varlık Getirisi",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"feed_parity","name":"Yem / Ürün Fiyat Paritesi & Brüt Marj","maxScore":25,"description":"Süt/yem ve et/yem paritesinde kârlı üretim dengesi"},
        {"key":"biological_growth","name":"Biyolojik Varlık Büyümesi & Kapasite","maxScore":25,"description":"Damızlık sürü büyüklüğü ve genetik verimlilik artışı"},
        {"key":"cash_generation","name":"Nakit Akış Kalitesi (OCF)","maxScore":25,"description":"Perakende zincirlerinden düzenli nakit tahsilatı"},
        {"key":"debt_service","name":"Borçluluk & Faiz Karşılama","maxScore":25,"description":"Tarımsal sübvansiyonlu kredilerin sürdürülebilirliği"}
      ],
      riskThresholds: {"criticalDebtRatio":3.8,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Hayvancılık, Yem & Entegre Et/Süt Üretimi",
      badge: "Tarım / Biyolojik Varlık & Hacim Modu",
      description: "Biyolojik varlık değerlemesi, yem maliyeti / süt ve et fiyat paritesi, soğuk zincir lojistiği ve nakit dönüşüm kalitesi esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Yem maliyet kalkanı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel marj"},{"key":"biological_assets","name":"Biyolojik Varlık Değeri","unit":"TL","description":"Canlı hayvan portföy değeri"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borçluluk çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Holdingler": {
    archetype: "HOLDING",
    valuationSector: "HOLDING",
    definition: {
      id: "HOLDING",
      title: "Holdingler & Yatırım Şirketleri",
      badge: "Holding / SOTP & NAD İskontosu Modu",
      description: "Parçaların Toplamı (SOTP) & Net Aktif Değeri (NAD) holding iskontosu (%25-%35), iştirak temettü akışı, solo net nakit/borç pozisyonu ve portföy büyümesi esastır.",
      revenueLabel: "Konsolide Hasılat / Portföy Geliri",
      revenueSublabel: "İştirak Satışları ve Solo Temettü Girişleri",
      operatingProfitLabel: "Kombine Faaliyet Kârı",
      operatingProfitSublabel: "Grup Şirketleri Faaliyet Kârı",
      marginLabel: "Tarihsel NAD İskontosu (%)",
      marginSublabel: "Piyasa Değeri vs Portföy Net Aktif Değeri",
      valuationMultiples: "NAD İskontosu & Parçaların Toplamı (SOTP)",
      primaryEfficiencyMetric: "Hisse Başı NAD Büyümesi & Solo Net Nakit",
    },
    scoring: {
      sector: "HOLDING",
      categories: [
        {"key":"nav_discount","name":"Net Aktif Değeri (NAD) İskontosu","maxScore":25,"description":"Piyasa değeri vs portföy net aktif değeri iskonto cazibesi (>%30)"},
        {"key":"solo_liquidity","name":"Solo Nakit Gücü & Borçsuzluk","maxScore":25,"description":"Holding merkezinin solo net nakit fazlası ve likidite esnekliği"},
        {"key":"dividend_yield","name":"İştirak Temettü Akışı & Nakit Üretimi","maxScore":25,"description":"İştiraklerden temettü tahsilatı ve sürdürülebilir nakit üretimi"},
        {"key":"nav_growth","name":"Konsolide Özkaynak Büyümesi & Katalizörler","maxScore":25,"description":"Halka arzlar, satın almalar ve portföy büyüme katalizörleri"}
      ],
      riskThresholds: {"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "HOLDING",
      name: "Holdingler & Yatırım Şirketleri",
      badge: "Holding / SOTP & NAD İskontosu Modu",
      description: "Parçaların Toplamı (SOTP) & Net Aktif Değeri (NAD) holding iskontosu (%25-%35), iştirak temettü akışı, solo net nakit/borç pozisyonu ve portföy büyümesi esastır.",
      disabledMetrics: ["ev_ebitda","ev_sales"],
      featuredMetrics: [{"key":"nav_discount","name":"Net Aktif Değeri (NAD) İskontosu","unit":"%","description":"Piyasa değeri vs portföy NAD cazibesi (>%25-%35)"},{"key":"pb_nav","name":"PD / NAD Oranı","unit":"x","description":"Portföy değerleme çarpanı"},{"key":"subsidiary_contribution","name":"İştirak Temettü / Kâr Katkısı","unit":"TL","description":"İştiraklerden düzenli nakit akışı"},{"key":"solo_liquidity","name":"Solo Net Nakit / Borç","unit":"TL","description":"Merkez holding bilançosunun net nakit gücü"},{"key":"roe","name":"Konsolide ROE","unit":"%","description":"Konsolide özkaynak kârlılığı"}],
      
      taxRate: 0.25,
    }
  },
  "İletişim": {
    archetype: "UTILITIES_TELCO",
    valuationSector: "UTILITIES_TELCO",
    definition: {
      id: "UTILITIES_TELCO",
      title: "Telekomünikasyon Hizmetleri",
      badge: "Telekom / OpFCF & ARPU Modu",
      description: "OpFCF (FAVÖK - CapEx), Spektrum ve 5G lisans yatırımları, ARPU büyümesi, abone tabanı genişlemesi ve altyapı borç servis gücü esastır.",
      revenueLabel: "Telekomünikasyon Satış Gelirleri",
      revenueSublabel: "Mobil, Sabit Genişbant ve Kurumsal Veri Gelirleri",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Operasyonel Nakit Akışı",
      marginLabel: "OpFCF & FAVÖK Marjı (%)",
      marginSublabel: "Altyapı CapEx Sonrası Kalan Operasyonel Nakit",
      valuationMultiples: "FD/FAVÖK, F/K & FD/OpFCF",
      primaryEfficiencyMetric: "OpFCF (FAVÖK - CapEx) & ARPU",
    },
    scoring: {
      sector: "UTILITIES_TELCO",
      categories: [
        {"key":"opfcf_generation","name":"Serbest Nakit Akışı (OpFCF) Üretimi","maxScore":25,"description":"Şebeke yatırımları sonrası üretilen net operasyonel nakit (FAVÖK - CapEx)"},
        {"key":"arpu_growth","name":"ARPU Büyümesi & Enflasyonist Tarife Koruma","maxScore":25,"description":"Abone başına ortalama gelirin enflasyon üzerinde reel artışı"},
        {"key":"spectrum_capex","name":"Spektrum & Fiber Şebeke CapEx Verimliliği","maxScore":25,"description":"Fiber hane erişimi ve 5G lisans yatırım verimliliği"},
        {"key":"debt_service","name":"Borç Karşılama Gücü (Net Borç / FAVÖK)","maxScore":25,"description":"Döviz borç riski ve borç servis karşılama rasyosu (<2.2x)"}
      ],
      riskThresholds: {"criticalDebtRatio":4,"minLiquidityRatio":0.9,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "UTILITIES_TELCO",
      name: "Telekomünikasyon Hizmetleri",
      badge: "Telekom / OpFCF & ARPU Modu",
      description: "OpFCF (FAVÖK - CapEx), Spektrum ve 5G lisans yatırımları, ARPU büyümesi, abone tabanı genişlemesi ve altyapı borç servis gücü esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"arpu","name":"ARPU (Abone Başı Gelir)","unit":"TL","description":"Aylık ortalama abone geliri"},{"key":"op_fcf","name":"OpFCF (FAVÖK - CapEx)","unit":"TL","description":"Yatırımlar sonrası kalan serbest nakit"},{"key":"capex_to_sales","name":"CapEx / Satışlar","unit":"%","description":"Şebeke yatırım yoğunluğu"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"}],
      
      taxRate: 0.25,
    }
  },
  "İletişim Cihazları": {
    archetype: "TECH",
    valuationSector: "TECH",
    definition: {
      id: "TECH",
      title: "İletişim Cihazları & Şebeke Donanımı",
      badge: "Şebeke Donanımı / Ar-Ge & Backlog Modu",
      description: "Telekom altyapı donanımı, şebeke cihazları, savunma/güvenlik haberleşme Ar-Ge'si ve sipariş backlog teslimatları esastır.",
      revenueLabel: "Cihaz & Altyapı Donanım Gelirleri",
      revenueSublabel: "Şebeke Santralleri, Modem, IoT ve Güvenli İletişim Cihazları Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Donanım & Mühendislik Operasyonel Kârı",
      marginLabel: "Brüt & FAVÖK Marjı (%)",
      marginSublabel: "Katma Değerli Ar-Ge ve Lisanslama Kârlılığı",
      valuationMultiples: "FD/Satışlar, FD/FAVÖK & F/K",
      primaryEfficiencyMetric: "Sipariş Backlog & Ar-Ge Yoğunluğu",
    },
    scoring: {
      sector: "TECH",
      categories: [
        {"key":"backlog_coverage","name":"Sipariş Backlog / Hasılat Oranı","maxScore":25,"description":"Telekom operatörleri ve kamu kurumlarından alınan teyitli siparişler"},
        {"key":"rd_intensity","name":"Ar-Ge Yatırımları & Patent Portföyü","maxScore":25,"description":"Hasılatın Ar-Ge'ye ayrılan payı ve yerli ürün ticarileşmesi"},
        {"key":"ebitda_margin","name":"Operasyonel FAVÖK Marjı","maxScore":25,"description":"Katma değerli donanım ve yazılım teslimatlarında kâr marjı"},
        {"key":"net_cash","name":"Bilanço Likiditesi & Net Nakit","maxScore":25,"description":"Borçsuz bilanço yapısı ve proje avans nakdi"}
      ],
      riskThresholds: {"criticalDebtRatio":2.5,"minLiquidityRatio":1.3,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "TECH",
      name: "İletişim Cihazları & Şebeke Donanımı",
      badge: "Şebeke Donanımı / Ar-Ge & Backlog Modu",
      description: "Telekom altyapı donanımı, şebeke cihazları, savunma/güvenlik haberleşme Ar-Ge'si ve sipariş backlog teslimatları esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"order_backlog","name":"Sipariş Birikimi","unit":"TL","description":"Teslim edilecek teyitli siparişler"},{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Donanım kârlılığı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "İnşaat Malzemeleri": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "İnşaat Malzemeleri & Yalıtım Sanayii",
      badge: "Yapı / Varlık İkame & Döngü Modu",
      description: "İnşaat sektörü ruhsat ve konut döngüsü, ihracat pazarları, hammadde maliyet yönetimi ve Through-the-Cycle medyan normalizasyonu esastır.",
      revenueLabel: "İnşaat Malzemesi Satış Gelirleri",
      revenueSublabel: "Yalıtım, Tuğla, Gazbeton, Alçı ve Prefabrik Yapı Malzemeleri Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Operasyonel Faaliyet Kârı",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "Döngüsel İkame Marjı",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Döngüsel Marj & İhracat Payı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"gross_margin","name":"Brüt Kâr Marjı & Fiyatlama Esnekliği","maxScore":25,"description":"Enerji ve hammadde maliyet artışlarını satış fiyatına yansıtma gücü"},
        {"key":"export_share","name":"İhracat Hasılat Oranı & Pazar Çeşitliliği","maxScore":25,"description":"İç inşaat döngüsünden bağımsız ihracat döviz gelirleri"},
        {"key":"cycle_ebitda","name":"Through-the-Cycle Kârlılık Koruması","maxScore":25,"description":"İnşaat krizlerinde marj erozyonunu sınırlayan esnek maliyet yapısı"},
        {"key":"debt_safety","name":"Net Borç / FAVÖK & Likidite","maxScore":25,"description":"Kaldıraç emniyeti ve güçlü işletme sermayesi"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "İnşaat Malzemeleri & Yalıtım Sanayii",
      badge: "Yapı / Varlık İkame & Döngü Modu",
      description: "İnşaat sektörü ruhsat ve konut döngüsü, ihracat pazarları, hammadde maliyet yönetimi ve Through-the-Cycle medyan normalizasyonu esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Fiyatlama esnekliği"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Yurt dışı hasılat payı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "İnşaat- Taahhüt": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Uluslararası İnşaat - Taahhüt & EPC",
      badge: "Müteahhitlik / EPC Backlog & Döviz Nakit Modu",
      description: "EPC sözleşme birikimi (Backlog), net nakit/peşin proje avansları köprüsü, döviz bazlı hakediş gücü ve jeopolitik risk yönetimi esastır.",
      revenueLabel: "EPC & Mühendislik Hakediş Gelirleri",
      revenueSublabel: "Uluslararası Altyapı, Enerji ve Endüstriyel Tesis Taahhüt Hasılatı",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Proje Karlılığı ve Mühendislik Katma Değeri",
      marginLabel: "Hakediş FAVÖK Marjı (%)",
      marginSublabel: "Sözleşmeli EPC Operasyonel Kârı",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "EPC Sipariş Birikimi (Backlog) & Net Nakit",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"backlog_coverage","name":"EPC Sipariş Backlog / Ciro Kapsam Oranı","maxScore":25,"description":"Gelecek 2-3 yıllık ciroyu garanti altına alan teyitli uluslararası sözleşmeler"},
        {"key":"net_cash_cushion","name":"Net Nakit Gücü & Peşin Proje Avansları","maxScore":25,"description":"Bilançoda güçlü net döviz nakit fazlası ve borçsuzluk"},
        {"key":"fx_revenues","name":"Döviz Hakediş Gelirleri & Kur Kalkanı","maxScore":25,"description":"Cironun %80+ kısmının USD/EUR bazlı uluslararası hakedişlerden oluşması"},
        {"key":"project_margin","name":"Proje Kârlılığı & Faaliyet Marjı","maxScore":25,"description":"Gecikme cezalarından arındırılmış başarılı proje tamamlama kârı"}
      ],
      riskThresholds: {"criticalDebtRatio":2.5,"minLiquidityRatio":1.3,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Uluslararası İnşaat - Taahhüt & EPC",
      badge: "Müteahhitlik / EPC Backlog & Döviz Nakit Modu",
      description: "EPC sözleşme birikimi (Backlog), net nakit/peşin proje avansları köprüsü, döviz bazlı hakediş gücü ve jeopolitik risk yönetimi esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"backlog_years","name":"Backlog / Ciro Kapsamı","unit":"Yıl","description":"Mevcut siparişlerin yıllık ciroyu karşılama süresi"},{"key":"fx_net_cash","name":"Döviz Net Nakit","unit":"USD","description":"Kasada hazır serbest döviz fazlası"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Proje operasyonel kârlılığı"},{"key":"advance_payments","name":"Alınan Proje Avansları","unit":"TL","description":"Sıfır maliyetli müşteri finansmanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Kablo": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Kablo & Enerji İletim Hatları Sanayii",
      badge: "Kablo / Bakır/Alüminyum Makası & Enerji Şebeke Modu",
      description: "Bakır/alüminyum hammadde fiyat koruması (hedging), enerji iletim ve fiber şebeke yatırımları, ihracat oranı ve Through-the-Cycle marjı esastır.",
      revenueLabel: "Kablo Satış Gelirleri (Hasılat)",
      revenueSublabel: "Enerji Kabloları, Haberleşme/Fiber Kabloları ve Emaye Bobin Teli Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Hammadde Hedging Düzeltmeli Operasyonel Kâr",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "Katma Değerli İletim Kablosu Kârlılığı",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Hammadde Hedging Marjı & İhracat",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"copper_spread","name":"Bakır/Alüminyum Yayılım Marjı","maxScore":25,"description":"Metal fiyat riskinin LME kontratlarıyla tam korunması (hedging)"},
        {"key":"grid_demand","name":"İhracat Payı & Enerji İletim Şebeke Talebi","maxScore":25,"description":"Avrupa şebeke yenileme ve yenilenebilir enerji santral kablo talebi"},
        {"key":"working_capital","name":"Nakit Akış Kalitesi & İşletme Sermayesi","maxScore":25,"description":"Değerli hammadde stoklarının nakit akışını bozmaması"},
        {"key":"debt_leverage","name":"Finansal Borçluluk & Net Borç / FAVÖK","maxScore":25,"description":"Hammadde finansmanı borçlarının operasyonel nakitle dengesi"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Kablo & Enerji İletim Hatları Sanayii",
      badge: "Kablo / Bakır/Alüminyum Makası & Enerji Şebeke Modu",
      description: "Bakır/alüminyum hammadde fiyat koruması (hedging), enerji iletim ve fiber şebeke yatırımları, ihracat oranı ve Through-the-Cycle marjı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Metal hedging sonrası marj"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Döviz cinsi ciro payı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Kağıt Ürünleri": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Kağıt, Karton & Ambalaj Sanayii",
      badge: "Kağıt / Hamur Fiyatı & Geri Dönüşüm Modu",
      description: "Selüloz / atık kağıt hammadde fiyatları, enerji maliyeti, ambalaj talebi ve 5 yıllık Through-the-Cycle tarihsel medyan normalizasyonu esastır.",
      revenueLabel: "Kağıt & Ambalaj Satış Hasılatı",
      revenueSublabel: "Oluklu Mukavva, Kutu, Temizlik Kağıdı ve Karton Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Döngüsel Normalleştirilmiş Operasyonel Kâr",
      marginLabel: "Through-the-Cycle FAVÖK Marjı (%)",
      marginSublabel: "Selüloz/Atık Kağıt Maliyet Makası Sonrası Kâr",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Through-the-Cycle FAVÖK & Varlık Tabanı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"pulp_spread","name":"Selüloz/Atık Kağıt Maliyet Kalkanı & Marj","maxScore":25,"description":"Küresel hamur ve enerji maliyetlerini satış fiyatına yansıtma gücü"},
        {"key":"ecommerce_demand","name":"İhracat & E-Ticaret Ambalaj Talebi","maxScore":25,"description":"Gıda, perakende ve e-ticaret lojistik kutu talebi büyümesi"},
        {"key":"free_cash_flow","name":"Nakit Üretimi & Serbest Nakit Akışı","maxScore":25,"description":"Geri dönüşüm tesislerinden yüksek serbest nakit üretimi"},
        {"key":"debt_coverage","name":"Net Borç / FAVÖK & Finansal Sağlık","maxScore":25,"description":"Kapasite artış yatırımları sonrası borç karşılama gücü"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Kağıt, Karton & Ambalaj Sanayii",
      badge: "Kağıt / Hamur Fiyatı & Geri Dönüşüm Modu",
      description: "Selüloz / atık kağıt hammadde fiyatları, enerji maliyeti, ambalaj talebi ve 5 yıllık Through-the-Cycle tarihsel medyan normalizasyonu esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"mid_cycle_margin","name":"Through-the-Cycle Marj","unit":"%","description":"Döngüsel normalize kârlılık"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Yurt dışı satış payı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Kırtasiye": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Kırtasiye, Ofis & Eğitim Gereçleri",
      badge: "Kırtasiye / Sezonluk Talep & Dağıtım Modu",
      description: "Okula dönüş sezonluk nakit girişi, lisanslı ürün portföyü, döviz kuru koruması ve Through-the-Cycle kâr normalizasyonu esastır.",
      revenueLabel: "Kırtasiye Satış Gelirleri (Hasılat)",
      revenueSublabel: "Yazı Gereçleri, Defter, Okul/Büro Malzemeleri ve Oyuncak Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Sezonluk Düzeltilmiş Faaliyet Kârı",
      marginLabel: "Brüt & FAVÖK Marjı (%)",
      marginSublabel: "Marka Primi ve Dağıtım Kanalı Kârlılığı",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Sezonluk Nakit Akışı & Brüt Kâr Marjı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"seasonal_margin","name":"Sezonluk Talep Yönetimi & Brüt Marj","maxScore":25,"description":"3. çeyrek okula dönüş yoğunluğu ve yıl boyu marj dengesi"},
        {"key":"brand_portfolio","name":"Lisanslı Marka Portföyü & Dağıtım Ağı","maxScore":25,"description":"Özgün marka ve lisanslı ürünlerin sağladığı fiyatlama gücü"},
        {"key":"inventory_rotation","name":"Stok Devir Hızı & İşletme Sermayesi","maxScore":25,"description":"Sezon öncesi stok birikiminin hızla nakde dönüşmesi"},
        {"key":"debt_safety","name":"Borçluluk & Faiz Karşılama Gücü","maxScore":25,"description":"Sezon dışı çeyreklerde finansman gideri karşılama gücü"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Kırtasiye, Ofis & Eğitim Gereçleri",
      badge: "Kırtasiye / Sezonluk Talep & Dağıtım Modu",
      description: "Okula dönüş sezonluk nakit girişi, lisanslı ürün portföyü, döviz kuru koruması ve Through-the-Cycle kâr normalizasyonu esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Marka fiyatlama gücü"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"inventory_turnover","name":"Stok Devir Hızı","unit":"x","description":"Stok yenilenme katsayısı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borçluluk çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Kimyasal Ürün": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Petrokimya & Temel Kimyasallar Sanayii",
      badge: "Petrokimya / Etilen-Nafta Yayılım Modu",
      description: "Etilen-nafta yayılımı, Akdeniz rafineri marjı korelasyonu, döngüsel dip (trough) FAVÖK normalizasyonu ve Merton opsiyonel varlık tabanı esastır.",
      revenueLabel: "Kimyasal & Polimer Satış Gelirleri",
      revenueSublabel: "Etilen, Polietilen, Polipropilen, Elyaf ve Temel Kimyasal Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Döngüsel Normalleştirilmiş Operasyonel Kâr",
      marginLabel: "Etilen-Nafta Fiyat Makası & FAVÖK Marjı",
      marginSublabel: "Polimer Satış Fiyatı eksi Ham Nafta Maliyeti",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Etilen-Nafta Yayılımı & Medyan Marj",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"crack_spread","name":"Etilen - Nafta Fiyat Makası","maxScore":25,"description":"Global petrokimya arz-talep dengesi ve marj genişlemesi"},
        {"key":"cycle_margin","name":"Through-the-Cycle Normalleştirilmiş Marj","maxScore":25,"description":"Dip dönemlerde %8.2 medyan marjı ile operasyonel değerleme koruması"},
        {"key":"asset_floor","name":"Merton Opsiyonel Varlık Tabanı Gücü","maxScore":25,"description":"Devasa petrokimya tesisinin faal ikame değerinin %22 EV tabanı oluşturması"},
        {"key":"fx_debt","name":"Finansal Borç Yapısı & Döviz Riski","maxScore":25,"description":"Döviz bazlı hammadde borçlarının nakit akışıyla karşılanması"}
      ],
      riskThresholds: {"criticalDebtRatio":4.5,"minLiquidityRatio":0.9,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Petrokimya & Temel Kimyasallar Sanayii",
      badge: "Petrokimya / Etilen-Nafta Yayılım Modu",
      description: "Etilen-nafta yayılımı, Akdeniz rafineri marjı korelasyonu, döngüsel dip (trough) FAVÖK normalizasyonu ve Merton opsiyonel varlık tabanı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"ethylene_naphtha_spread","name":"Etilen-Nafta Makası","unit":"USD/Ton","description":"Petrokimya sektör göstergesi"},{"key":"mid_cycle_margin","name":"Through-the-Cycle Marj","unit":"%","description":"Döngüsel medyan FAVÖK marjı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç çarpanı"},{"key":"merton_asset_floor","name":"Varlık Tabanı Güvencesi","unit":"%","description":"Minimum operasyonel değer tabanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Madencilik": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Madencilik & Değerli Metaller",
      badge: "Maden / Rezerv & Üretim Maliyeti Modu",
      description: "Kanıtlanmış/Muhtemel rezerv büyüklüğü, Ons başına sürdürülebilir üretim maliyeti (AISC), metal fiyat döngüsü ve net nakit pozisyonu esastır.",
      revenueLabel: "Maden & Metal Satış Gelirleri",
      revenueSublabel: "Altın, Gümüş, Bakır, Krom ve Kurşun/Çinko Konsantresi Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Maden Üretim Operasyonel Nakit Akışı",
      marginLabel: "Ons Başına Kâr & FAVÖK Marjı (%)",
      marginSublabel: "Satış Fiyatı eksi AISC Üretim Maliyeti",
      valuationMultiples: "FD/FAVÖK, F/K & FD/Rezerv (Ons)",
      primaryEfficiencyMetric: "Rezerv Değeri & AISC Üretim Maliyeti",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"reserve_quality","name":"Rezerv Büyüklüğü & Tenör Kalitesi","maxScore":25,"description":"Kanıtlanmış/Muhtemel rezervler ve yüksek tenörlü cevher yapısı"},
        {"key":"low_aisc","name":"Düşük AISC Üretim Maliyeti Kalkanı","maxScore":25,"description":"Ons başına düşük üretim maliyetiyle yüksek serbest nakit marjı"},
        {"key":"fcf_net_cash","name":"Serbest Nakit Akışı (FCF) & Net Nakit","maxScore":25,"description":"Sıfır finansal borç, yüksek net nakit ve külçe altın rezervi"},
        {"key":"capital_efficiency","name":"Sermaye Verimliliği (ROIC vs WACC)","maxScore":25,"description":"Yeni maden arama ve sondaj yatırımlarının ekonomik katma değeri"}
      ],
      riskThresholds: {"criticalDebtRatio":2,"minLiquidityRatio":1.5,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Madencilik & Değerli Metaller",
      badge: "Maden / Rezerv & Üretim Maliyeti Modu",
      description: "Kanıtlanmış/Muhtemel rezerv büyüklüğü, Ons başına sürdürülebilir üretim maliyeti (AISC), metal fiyat döngüsü ve net nakit pozisyonu esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"aisc_per_oz","name":"AISC Üretim Maliyeti","unit":"USD/Ons","description":"Ons başına toplam nakit maliyet"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Maden faaliyet kârlılığı"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"Arama CapEx sonrası nakit"},{"key":"net_cash_cushion","name":"Net Nakit Varlığı","unit":"TL","description":"Kasada hazır net nakit gücü"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Medya": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Medya, Yayıncılık & Dijital İletişim",
      badge: "Medya / Reklam & Dijital Dönüşüm Modu",
      description: "Dijital abonelik ve reklam gelirleri, içerik telif kütüphanesi, operasyonel nakit dönüşümü ve işletme sermayesi esastır.",
      revenueLabel: "Medya & Reklam Gelirleri (Hasılat)",
      revenueSublabel: "Televizyon, Dijital Platform, Gazete ve Açık Hava Reklam Gelirleri",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Yayın ve İçerik Operasyonel Kârı",
      marginLabel: "FAVÖK & Faaliyet Marjı (%)",
      marginSublabel: "İçerik Üretim Maliyeti Sonrası Kâr",
      valuationMultiples: "FD/FAVÖK, F/K & FD/Satışlar",
      primaryEfficiencyMetric: "Dijital Reklam Büyümesi & Nakit Akışı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"digital_ad_growth","name":"Dijital Gelir Payı & Reklam Büyümesi","maxScore":25,"description":"Geleneksel basından dijital platformlara geçiş hızı ve reklam geliri"},
        {"key":"operating_margin","name":"Faaliyet Marjı & İçerik Amortismanı","maxScore":25,"description":"Dizi, film ve program maliyetlerinin amortisman dengesi"},
        {"key":"fcf_conversion","name":"Nakit Akış Kalitesi (FCF)","maxScore":25,"description":"Düşük CapEx ihtiyacı ile reklam hasılatının nakde dönüşmesi"},
        {"key":"debt_safety","name":"Borçluluk & Finansal Risk","maxScore":25,"description":"Düşük net borç ve döviz riskinden arındırılmış bilanço"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Medya, Yayıncılık & Dijital İletişim",
      badge: "Medya / Reklam & Dijital Dönüşüm Modu",
      description: "Dijital abonelik ve reklam gelirleri, içerik telif kütüphanesi, operasyonel nakit dönüşümü ve işletme sermayesi esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"İçerik yatırımları sonrası nakit"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"current_ratio","name":"Cari Oran","unit":"x","description":"Likidite gücü"},{"key":"roe","name":"Özkaynak Kârlılığı","unit":"%","description":"Sermaye verimi"}],
      
      taxRate: 0.25,
    }
  },
  "Meşrubat / İçecek": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Meşrubat, İçecek & Bira Sanayii",
      badge: "İçecek / FMCG Fiyatlama Gücü Modu",
      description: "FMCG defansif tüketim hacmi, güçlü marka değeri ve fiyatlama gücü, hammadde (şeker, malt, alüminyum kutu) esnekliği ve nakit dönüşüm kalitesi esastır.",
      revenueLabel: "Meşrubat & İçecek Satış Hasılatı",
      revenueSublabel: "Gazlı İçecek, Bira, Su, Meyve Suyu ve Enerji İçeceği Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Güçlü Dağıtım Ağı Operasyonel Kârı",
      marginLabel: "Ünite Kasa Başına FAVÖK & Marj (%)",
      marginSublabel: "Satış Hasılatı / Kasa Başına Nakit Kâr",
      valuationMultiples: "FD/FAVÖK & F/K",
      primaryEfficiencyMetric: "Koli/Litre Hacim Büyümesi & FAVÖK Marjı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"volume_pricing","name":"Satış Hacmi Büyümesi & Fiyatlama Gücü","maxScore":25,"description":"Koli/ünite kasa satış hacmi artışı ve enflasyon üzeri reel fiyatlama"},
        {"key":"margin_stability","name":"Yüksek & İstikrarlı FAVÖK Marjı","maxScore":25,"description":"Gelişmekte olan ülkeler ve iç pazarda korunan yüksek nakit marjı"},
        {"key":"fcf_quality","name":"Nakit Akış Kalitesi (Buffett Kazancı & FCF)","maxScore":25,"description":"Makyajsız bilanço ve net kârın %100+ serbest nakde dönüşümü"},
        {"key":"debt_safety","name":"Bilanço Güvenliği & Net Borç / FAVÖK","maxScore":25,"description":"Satın almalar sonrası hızlı borç azaltımı (De-leveraging)"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Meşrubat, İçecek & Bira Sanayii",
      badge: "İçecek / FMCG Fiyatlama Gücü Modu",
      description: "FMCG defansif tüketim hacmi, güçlü marka değeri ve fiyatlama gücü, hammadde (şeker, malt, alüminyum kutu) esnekliği ve nakit dönüşüm kalitesi esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"unit_case_volume","name":"Hacim Büyümesi","unit":"%","description":"Satış hacmi reel artışı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel nakit kârlılığı"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"Yatırımlar sonrası net nakit"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borç karşılama rasyosu"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Mobilya": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Mobilya & Ev Eşyaları İmalatı",
      badge: "Mobilya / Perakende Şebekesi & İhracat Modu",
      description: "Mağaza dağıtım şebekesi, ihracat pazarları, sünger/ahşap/kumaş maliyetleri ve TFRS 16 borç düzeltmeli Through-the-Cycle normalizasyonu esastır.",
      revenueLabel: "Mobilya & Yatak Satış Gelirleri",
      revenueSublabel: "Ev Mobilyası, Yatak, Baza, Ofis ve Modüler Mobilya Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Perakende & Bayi Ağı Faaliyet Kârı",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "Hammadde ve Kira Yükümlülükleri Sonrası Kâr",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Mağaza Verimliliği & İhracat Marjı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"raw_material_margin","name":"Brüt Kâr Marjı & Hammadde Maliyet Yönetimi","maxScore":25,"description":"Sünger (TDI), sunta ve kumaş maliyetlerini fiyata yansıtma gücü"},
        {"key":"retail_expansion","name":"İhracat Payı & Mağaza Ağı Genişlemesi","maxScore":25,"description":"Yurt içi münhasır bayi ağı ve yurt dışı konsept mağaza büyümesi"},
        {"key":"inventory_speed","name":"Stok Devir Hızı & Nakit Dönüşümü","maxScore":25,"description":"Büyük hacimli mobilya stoklarının hızlı teslimat döngüsü"},
        {"key":"debt_safety","name":"Finansal Sağlık & Net Borç / FAVÖK","maxScore":25,"description":"TFRS 16 kira borçları dahil borç yükünün yönetilebilirliği"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Mobilya & Ev Eşyaları İmalatı",
      badge: "Mobilya / Perakende Şebekesi & İhracat Modu",
      description: "Mağaza dağıtım şebekesi, ihracat pazarları, sünger/ahşap/kumaş maliyetleri ve TFRS 16 borç düzeltmeli Through-the-Cycle normalizasyonu esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Fiyatlama gücü"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"store_count","name":"Mağaza Sayısı","unit":"Adet","description":"Perakende satış noktası"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Otomotiv": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Otomotiv Ana Sanayii (OEM)",
      badge: "Otomotiv / OEM Maliyet Artı Kâr & Dönüşüm Modu",
      description: "OEM maliyet-artı kâr sözleşmeleri, yeni model CapEx dönüşüm normalizasyonu, ihracat payı, FD/FAVÖK ve Justified P/B esastır.",
      revenueLabel: "Otomotiv Satış Gelirleri (Hasılat)",
      revenueSublabel: "Ticari Araç, Binek Araç, Traktör ve Yedek Parça İhracatı/İç Satışı",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "OEM Sözleşme Marjı ve Faaliyet Kârı",
      marginLabel: "OEM Sözleşme Marjı & FAVÖK (%)",
      marginSublabel: "Maliyet Artı Kâr (Cost-Plus) Anlaşmalı Kârlılık",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "OEM Sözleşme Marjı & ROIC",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"cost_plus_contract","name":"OEM Maliyet Artı Kâr & Sözleşme Marjı","maxScore":25,"description":"Ana ortakla yapılan garantili 'Cost-Plus' sözleşme kârlılığı"},
        {"key":"model_capex_export","name":"İhracat Payı & Yeni Model Dönüşüm Verimi","maxScore":25,"description":"Elektrikli/yeni model yatırımları sonrası devreye giren yüksek ihracat"},
        {"key":"capital_efficiency","name":"Sermaye Verimliliği (ROIC vs WACC)","maxScore":25,"description":"Yüksek yatırılan sermaye getirisi ve ekonomik katma değer (EVA)"},
        {"key":"debt_cushion","name":"Net Borç / FAVÖK & Bilanço Tamponu","maxScore":25,"description":"Yeni model fabrika yatırımı borçlarının operasyonel kârla dengesi"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Otomotiv Ana Sanayii (OEM)",
      badge: "Otomotiv / OEM Maliyet Artı Kâr & Dönüşüm Modu",
      description: "OEM maliyet-artı kâr sözleşmeleri, yeni model CapEx dönüşüm normalizasyonu, ihracat payı, FD/FAVÖK ve Justified P/B esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Hasılat içindeki ihracat payı (>%70)"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Garantili OEM operasyonel marjı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye verimliliği makası"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borç karşılama kapasitesi"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"CapEx dönüşümü sonrası nakit"}],
      
      taxRate: 0.25,
    }
  },
  "Otomotiv Lastiği": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Otomotiv Lastiği & Kauçuk Sanayii",
      badge: "Lastik / Orijinal Ekipman & Yenileme Pazarı Modu",
      description: "Yenileme (Aftermarket) vs Orijinal Ekipman (OEM) miksi, kauçuk/petrol maliyet yönetimi, ihracat marjı ve Through-the-Cycle FAVÖK esastır.",
      revenueLabel: "Lastik Satış Hasılatı",
      revenueSublabel: "Binek, Ticari, Zirai ve Ağır Vasıta Lastikleri Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Operasyonel Faaliyet Kârı",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "Kauçuk ve Enerji Maliyetleri Sonrası Nakit Marjı",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Yenileme Pazarı Payı & Brüt Marj",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"aftermarket_pricing","name":"Yenileme Pazarı Payı & Fiyatlama Gücü","maxScore":25,"description":"Yüksek kârlı yenileme (aftermarket) pazar payı ve fiyatlama avantajı"},
        {"key":"raw_material_shield","name":"Kauçuk/Hammadde Maliyet Kalkanı","maxScore":25,"description":"Doğal ve sentetik kauçuk fiyat artışlarını fiyata yansıtma hızı"},
        {"key":"export_capacity","name":"İhracat Gelirleri & Kapasite Kullanımı","maxScore":25,"description":"Fabrika kapasite kullanım oranı ve Avrupa ihracatı"},
        {"key":"debt_coverage","name":"Borç Karşılama (Net Borç / FAVÖK)","maxScore":25,"description":"Fabrika modernizasyonu borçlarının FAVÖK ile ödenme gücü"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Otomotiv Lastiği & Kauçuk Sanayii",
      badge: "Lastik / Orijinal Ekipman & Yenileme Pazarı Modu",
      description: "Yenileme (Aftermarket) vs Orijinal Ekipman (OEM) miksi, kauçuk/petrol maliyet yönetimi, ihracat marjı ve Through-the-Cycle FAVÖK esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Aftermarket fiyatlama gücü"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Döviz bazlı satış payı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç çarpanı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Otomotiv Parçası": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Otomotiv Yan Sanayii & Komponent Üretimi",
      badge: "Oto Parça / Tier-1 Tedarik & İhracat Modu",
      description: "Tier-1 global OEM tedarik sözleşmeleri, parça başı katma değer, hammadde fiyat yansıtma gücü ve Through-the-Cycle marj normalizasyonu esastır.",
      revenueLabel: "Oto Parça & Komponent Hasılatı",
      revenueSublabel: "Fren, Şasi, Motor Blok, Aydınlatma ve Plastik Parça Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Tier-1 İmalat Operasyonel Kârı",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "Katma Değerli Komponent Satış Kârlılığı",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Tier-1 İhracat Payı & ROIC",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"tier1_contracts","name":"Tier-1 OEM Tedarik Payı & İhracat","maxScore":25,"description":"Küresel otomotiv devlerine doğrudan uzun vadeli parça tedariki"},
        {"key":"raw_material_pass","name":"Hammadde Fiyat Yansıtma Hızı & Marj","maxScore":25,"description":"Alüminyum, çelik ve plastik fiyat artışlarını kontratla yansıtma"},
        {"key":"component_capex","name":"Katma Değerli Komponent CapEx Verimi","maxScore":25,"description":"Hafifletme ve elektrikli araç komponent yatırımları getirisi"},
        {"key":"debt_safety","name":"Finansal Kaldıraç & Net Borç / FAVÖK","maxScore":25,"description":"İşletme sermayesi ve makine yatırım borçlarının emniyet seviyesi"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Otomotiv Yan Sanayii & Komponent Üretimi",
      badge: "Oto Parça / Tier-1 Tedarik & İhracat Modu",
      description: "Tier-1 global OEM tedarik sözleşmeleri, parça başı katma değer, hammadde fiyat yansıtma gücü ve Through-the-Cycle marj normalizasyonu esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Küresel OEM hasılat payı"},{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Parça başı katma değer"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Pazarlama": {
    archetype: "RETAIL",
    valuationSector: "RETAIL",
    definition: {
      id: "RETAIL",
      title: "Ticaret, Pazarlama & Dağıtım Ağı",
      badge: "Ticaret / Dağıtım & Çalışma Sermayesi Modu",
      description: "Dağıtım kanalı ölçeği, işletme sermayesi yönetimi, satış komisyon marjı ve nakit akış dönüşüm gücü esastır.",
      revenueLabel: "Ticaret & Dağıtım Gelirleri",
      revenueSublabel: "Toptan Satış, Bayi Dağıtımı ve Dış Ticaret Gelirleri",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Ticari Aracılık ve Dağıtım Faaliyet Kârı",
      marginLabel: "FAVÖK & Ticari Komisyon Marjı (%)",
      marginSublabel: "Hızlı Devir / Dağıtım Kârlılığı",
      valuationMultiples: "FD/Satışlar, FD/FAVÖK & F/K",
      primaryEfficiencyMetric: "Nakit Dönüşüm Süresi & Hasılat Hızı",
    },
    scoring: {
      sector: "RETAIL",
      categories: [
        {"key":"channel_scale","name":"Dağıtım Hacmi & Pazar Genişlemesi","maxScore":25,"description":"Yaygın bayi ağı ve yıllık ticaret hacmi büyümesi"},
        {"key":"commission_margin","name":"Brüt Kâr & Komisyon Marjı","maxScore":25,"description":"Ticari spread ve dağıtım komisyon kârlılığı"},
        {"key":"working_capital","name":"İşletme Sermayesi & Stok Devir Hızı","maxScore":25,"description":"Alacak tahsilat disiplini ve hızlı stok nakde dönüşümü"},
        {"key":"debt_safety","name":"Borçluluk & Finansal Güvenlik","maxScore":25,"description":"Ticari kredilerin nakit akışıyla güvenli karşılanması"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "RETAIL",
      name: "Ticaret, Pazarlama & Dağıtım Ağı",
      badge: "Ticaret / Dağıtım & Çalışma Sermayesi Modu",
      description: "Dağıtım kanalı ölçeği, işletme sermayesi yönetimi, satış komisyon marjı ve nakit akış dönüşüm gücü esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"working_capital_days","name":"Nakit Dönüşüm Süresi","unit":"Gün","description":"Ticari nakde dönüş hızı"},{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Dağıtım kârlılığı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç çarpanı"},{"key":"roe","name":"Özkaynak Kârlılığı","unit":"%","description":"Ticari sermaye getirisi"}],
      
      taxRate: 0.25,
    }
  },
  "Perakande - Ticaret": {
    archetype: "RETAIL",
    valuationSector: "RETAIL",
    definition: {
      id: "RETAIL",
      title: "Organize Perakende & Tüketim Ticareti",
      badge: "Perakende / Negatif Çalışma Sermayesi Modu",
      description: "Negatif Çalışma Sermayesi (tedarikçi float faizsiz fonlama avantajı), Benzer Mağaza Satış Büyümesi (LFL/SSS), UFRS 16 kira düzeltmeli FAVÖK ve raf devir hızı esastır.",
      revenueLabel: "Net Satışlar (Perakende Cirosu)",
      revenueSublabel: "Mağaza Satışları ve Online Dağıtım Hasılatı",
      operatingProfitLabel: "FAVÖK (IFRS 16 Uyumlu)",
      operatingProfitSublabel: "Kira Yükümlülükleri Düzeltilmiş Operasyonel Kâr",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "IFRS 16 FAVÖK / Satışlar",
      valuationMultiples: "FD/FAVÖK, F/K & FD/Satışlar",
      primaryEfficiencyMetric: "Aynı Mağaza Satış Büyümesi (SSS %) & Float",
    },
    scoring: {
      sector: "RETAIL",
      categories: [
        {"key":"negative_wc_cash","name":"Negatif Çalışma Sermayesi & Serbest Nakit","maxScore":25,"description":"Tedarikçi finansmanı modeli sayesinde faizsiz fon kaynağı ve nakit üretimi"},
        {"key":"sss_expansion","name":"Aynı Mağaza Satış Büyümesi (SSS %)","maxScore":25,"description":"Enflasyon üzeri sepet ve müşteri trafiği reel büyümesi"},
        {"key":"inventory_turnover","name":"Stok Devir Hızı & Fire Oranı","maxScore":25,"description":"Hızlı raf devri ve minimum ürün zayiatı"},
        {"key":"ifrs16_margin","name":"UFRS 16 Düzeltilmiş FAVÖK Marjı","maxScore":25,"description":"Kira giderleri arındırılmış operasyonel kâr stabilitesi"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":0.5,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "RETAIL",
      name: "Organize Perakende & Tüketim Ticareti",
      badge: "Perakende / Negatif Çalışma Sermayesi Modu",
      description: "Negatif Çalışma Sermayesi (tedarikçi float faizsiz fonlama avantajı), Benzer Mağaza Satış Büyümesi (LFL/SSS), UFRS 16 kira düzeltmeli FAVÖK ve raf devir hızı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"sss_growth","name":"Aynı Mağaza Satış Büyümesi (SSS)","unit":"%","description":"Organik reel büyüme"},{"key":"store_count","name":"Mağaza Sayısı","unit":"Adet","description":"Organik şebeke büyüklüğü"},{"key":"ifrs16_ebitda","name":"IFRS 16 Düzeltilmiş FAVÖK","unit":"TL","description":"Operasyonel kâr"},{"key":"negative_nwc","name":"Negatif İşletme Sermayesi","unit":"TL","description":"Tedarikçi float avantajı"},{"key":"stock_turnover","name":"Stok Devir Hızı","unit":"Gün","description":"Raf dönüş süresi"}],
      workingCapitalExemption: true,
      taxRate: 0.25,
    }
  },
  "Petrol": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Petrol, Rafineri & Akaryakıt Dağıtımı",
      badge: "Rafineri / Akdeniz Rafineri Marjı Modu",
      description: "Akdeniz kompleks rafineri marjı, beyaz ürün verimliliği, ham petrol stok değerleme etkisi ve USD bazlı döviz kalkanı esastır.",
      revenueLabel: "Petrol & Akaryakıt Satış Gelirleri",
      revenueSublabel: "Dizel, Benzin, Jet Yakıtı ve Asfalt Satışları Hasılatı",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Rafinaj & Dağıtım Operasyonel Kârı",
      marginLabel: "Varil Başı Rafineri Marjı & FAVÖK (%)",
      marginSublabel: "Akdeniz Kompleks Marjı ve Ürün Fiyat Farkları",
      valuationMultiples: "FD/FAVÖK & F/K",
      primaryEfficiencyMetric: "Akdeniz Rafineri Marjı & Beyaz Ürün Verimi",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"crack_spread","name":"Akdeniz Kompleks Rafineri Marjı","maxScore":25,"description":"Dizel ve jet yakıtı crack spread marjları gücü"},
        {"key":"yield_utilization","name":"Kapasite Kullanım Oranı & Beyaz Ürün Verimi","maxScore":25,"description":"Yüksek katma değerli beyaz ürün (dizel/benzin) verimliliği"},
        {"key":"fcf_dividend","name":"Serbest Nakit Akışı (FCF) & Temettü","maxScore":25,"description":"Kuvvetli nakit üretimi ve hissedara yüksek kâr payı akışı"},
        {"key":"balance_strength","name":"Finansal Sağlık & Net Borç / FAVÖK","maxScore":25,"description":"Döviz bazlı ham petrol alımlarına karşı güçlü nakit tamponu"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Petrol, Rafineri & Akaryakıt Dağıtımı",
      badge: "Rafineri / Akdeniz Rafineri Marjı Modu",
      description: "Akdeniz kompleks rafineri marjı, beyaz ürün verimliliği, ham petrol stok değerleme etkisi ve USD bazlı döviz kalkanı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"refinery_margin","name":"Net Rafineri Marjı","unit":"USD/Varil","description":"Varil başına operasyonel kâr"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"CapEx sonrası temettü kaynağı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borç karşılama gücü"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Sağlık ve İlaç": {
    archetype: "HEALTHCARE",
    valuationSector: "HEALTHCARE",
    definition: {
      id: "HEALTHCARE",
      title: "Sağlık Hizmetleri, Hastanecilik & İlaç Sanayii",
      badge: "Sağlık / Medikal Turizm & ARPU Modu",
      description: "Ruhsatlı ilaç portföyü, SGK iskonto ve referans fiyat koruması, medikal turizm hasta trafiği, hasta başı ARPU ve TFRS 16 düzeltmeli FAVÖK marjı esastır.",
      revenueLabel: "Sağlık Hizmet & İlaç Hasılatı",
      revenueSublabel: "Yurt İçi Hasta, Medikal Turizm ve Ruhsatlı İlaç Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "TFRS 16 Kira Düzeltmeli Operasyonel Kâr",
      marginLabel: "FAVÖK Marjı & Hasta Başı ARPU",
      marginSublabel: "Operasyonel Kârlılık ve Verimlilik",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Medikal Turizm ARPU & FAVÖK Marjı",
    },
    scoring: {
      sector: "HEALTHCARE",
      categories: [
        {"key":"operating_margin","name":"Operasyonel Kârlılık & FAVÖK Marjı","maxScore":25,"description":"Sağlık hizmetleri ve ilaç portföyü FAVÖK marjı stabilitesi"},
        {"key":"capital_efficiency","name":"Sermaye Verimliliği (ROIC vs WACC)","maxScore":25,"description":"Hastane yatırımlarının sermaye maliyetini aşan getiri oranı"},
        {"key":"balance_sheet_safety","name":"Bilanço & Borçluluk Güvenliği","maxScore":25,"description":"Net Borç / FAVÖK (<3.0x) ve güçlü işletme nakit akışı"},
        {"key":"medical_tourism_growth","name":"Hasılat & Medikal Turizm Büyümesi","maxScore":25,"description":"Yurt dışı döviz bazlı hasta trafiği ve ilaç ciro büyümesi"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "HEALTHCARE",
      name: "Sağlık Hizmetleri, Hastanecilik & İlaç Sanayii",
      badge: "Sağlık / Medikal Turizm & ARPU Modu",
      description: "Ruhsatlı ilaç portföyü, SGK iskonto ve referans fiyat koruması, medikal turizm hasta trafiği, hasta başı ARPU ve TFRS 16 düzeltmeli FAVÖK marjı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"medical_tourism_share","name":"Medikal Turizm Payı","unit":"%","description":"Döviz bazlı hasta geliri oranı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"TFRS 16 uyumlu operasyonel marj"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye verimliliği makası"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borç karşılama kapasitesi"},{"key":"operating_cash_flow","name":"İşletme Nakit Akışı","unit":"TL","description":"Operasyonel nakit üretimi"}],
      
      taxRate: 0.25,
    }
  },
  "Savunma": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Savunma Sanayii & Askeri Teknolojiler",
      badge: "Savunma / Backlog & Devlet Güvencesi Modu",
      description: "Sipariş birikimi (Backlog / Book-to-Bill > 1.2x), Ar-Ge teşvikleri, peşin proje avansları, savunma bütçesi görünürlüğü ve küresel savunma çarpanları esastır.",
      revenueLabel: "Savunma & Güvenlik Hasılatı",
      revenueSublabel: "Haberleşme, Radar, Aviyonik ve Elektro-Optik Sistem Teslimatları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Yüksek Katma Değerli Savunma Elektroniği Kârı",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "Devlet Garantili Proje Kârlılığı",
      valuationMultiples: "FD/FAVÖK & F/K",
      primaryEfficiencyMetric: "Sipariş Birikimi (Backlog) / Book-to-Bill",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"backlog_coverage","name":"Sipariş Birikimi (Backlog) & Book-to-Bill","maxScore":25,"description":"Yıllık cironun 3-4 katına ulaşan uzun vadeli devlet garantili sipariş stoku"},
        {"key":"rd_incentives","name":"Yüksek Ar-Ge Teşvikleri & Özgün Ürünler","maxScore":25,"description":"Devlet Ar-Ge destekleri, fikri mülkiyet ve stratejik yerlilik oranı"},
        {"key":"advance_cash","name":"Peşin Proje Avansları & Net Nakit Gücü","maxScore":25,"description":"Peşin proje hakedişleri ile sağlanan borçsuz finansman yapısı"},
        {"key":"ebitda_visibility","name":"Operasyonel FAVÖK Marjı & Gelir Görünürlüğü","maxScore":25,"description":"%25+ operasyonel nakit marjı ve uzun vadeli bütçe güvencesi"}
      ],
      riskThresholds: {"criticalDebtRatio":2.8,"minLiquidityRatio":1.3,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Savunma Sanayii & Askeri Teknolojiler",
      badge: "Savunma / Backlog & Devlet Güvencesi Modu",
      description: "Sipariş birikimi (Backlog / Book-to-Bill > 1.2x), Ar-Ge teşvikleri, peşin proje avansları, savunma bütçesi görünürlüğü ve küresel savunma çarpanları esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"backlog_billion_usd","name":"Sipariş Birikimi (Backlog)","unit":"Milyar USD","description":"Teyitli uzun vadeli sipariş stoku"},{"key":"book_to_bill","name":"Book-to-Bill Oranı","unit":"x","description":"Yeni sipariş / Teslimat oranı (>1.2x)"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Savunma elektroniği kârlılığı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Net nakit / düşük borçluluk"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Seramik": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Seramik, Vitrifiye & Yapı Gereçleri",
      badge: "Seramik / Enerji Maliyeti & İhracat Modu",
      description: "Doğalgaz enerji maliyet yönetimi, katma değerli karo/vitrifiye ihracatı, konut inşaat döngüsü ve Through-the-Cycle medyan normalizasyonu esastır.",
      revenueLabel: "Seramik & Porselen Satış Hasılatı",
      revenueSublabel: "Yer/Duvar Karosu, Vitrifiye ve Yapı Kimyasalları Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Döngüsel Normalleştirilmiş Faaliyet Kârı",
      marginLabel: "FAVÖK Marjı (%)",
      marginSublabel: "Doğalgaz Girdisi Sonrası Operasyonel Marj",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "İhracat Marjı & Doğalgaz Maliyet Kalkanı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"gas_cost_management","name":"Doğalgaz & Enerji Maliyet Kalkanı","maxScore":25,"description":"Fırın doğalgaz maliyet artışlarını satış fiyatına yansıtma gücü"},
        {"key":"export_value_add","name":"İhracat Oranı & Katma Değerli Ürün Payı","maxScore":25,"description":"Avrupa ve Amerika pazarlarına yapılan lüks seramik ihracatı"},
        {"key":"cycle_ebitda","name":"Through-the-Cycle Marj Güvencesi","maxScore":25,"description":"Konut inşaat döngüsü yavaşlarken marj dayanıklılığı"},
        {"key":"debt_safety","name":"Net Borç / FAVÖK & Likidite","maxScore":25,"description":"Yatırım borçlarının sürdürülebilirliği ve bilanço tamponu"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Seramik, Vitrifiye & Yapı Gereçleri",
      badge: "Seramik / Enerji Maliyeti & İhracat Modu",
      description: "Doğalgaz enerji maliyet yönetimi, katma değerli karo/vitrifiye ihracatı, konut inşaat döngüsü ve Through-the-Cycle medyan normalizasyonu esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Enerji maliyeti sonrası marj"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Döviz bazlı hasılat payı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Sigorta": {
    archetype: "INSURANCE",
    valuationSector: "INSURANCE",
    definition: {
      id: "INSURANCE",
      title: "Sigortacılık & Bireysel Emeklilik (BES)",
      badge: "Sigorta / Bileşik Oran & Float Getirisi Modu",
      description: "Bileşik Oran (Combined Ratio < %100 teknik kâr), BES AUM büyüklüğü, yüksek faiz ortamında float yatırım portföyü getirisi ve Gordon Growth Justified P/B esastır.",
      revenueLabel: "Prim Üretimi (Brüt Primler)",
      revenueSublabel: "Brüt Yazılan Primler ve Teknik Gelirler Toplamı",
      operatingProfitLabel: "Teknik Bölüm Dengesi / Kârı",
      operatingProfitSublabel: "Sigortacılık ve Hayat/Emeklilik Esas Faaliyet Kârı",
      marginLabel: "Kombine Oran / Portföy Getirisi",
      marginSublabel: "Hasar/Prim + Masraf Oranı (Teknik Kârlılık)",
      valuationMultiples: "PD/DD & F/K",
      primaryEfficiencyMetric: "Bileşik Oran (Combined Ratio) & Float ROE",
    },
    scoring: {
      sector: "INSURANCE",
      categories: [
        {"key":"technical_profitability","name":"Teknik Kârlılık & Kombine Oran","maxScore":25,"description":"Hasar/Prim ve Masraf Oranı toplamı (<%95 pozitif teknik kâr)"},
        {"key":"portfolio_yield","name":"Yatırım Getirisi & Float Gücü","maxScore":25,"description":"Net finansal gelirler ve yüksek faiz ortamında float portföy verimi"},
        {"key":"capital_adequacy","name":"Sermaye Yeterliliği & ROE","maxScore":25,"description":"Özkaynak kârlılığı ve sermaye tamponu"},
        {"key":"premium_growth","name":"Prim Büyümesi & BES AUM Genişlemesi","maxScore":25,"description":"Brüt yazılan prim ve BES AUM büyüme dinamikleri"}
      ],
      riskThresholds: {"combinedRatioDanger":102,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INSURANCE",
      name: "Sigortacılık & Bireysel Emeklilik (BES)",
      badge: "Sigorta / Bileşik Oran & Float Getirisi Modu",
      description: "Bileşik Oran (Combined Ratio < %100 teknik kâr), BES AUM büyüklüğü, yüksek faiz ortamında float yatırım portföyü getirisi ve Gordon Growth Justified P/B esastır.",
      disabledMetrics: ["ebitda","ev_ebitda","ev_sales","net_debt","stock_turnover","ebitda_margin"],
      featuredMetrics: [{"key":"combined_ratio","name":"Bileşik Oran (Combined Ratio)","unit":"%","description":"Hasar + Masraf toplamı (<%100 teknik kâr)"},{"key":"gross_written_premiums","name":"Yazılan Brüt Prim","unit":"TL","description":"Poliçe üretimi hacmi"},{"key":"loss_ratio","name":"Hasar / Prim Oranı","unit":"%","description":"Ödenen hasar maliyeti (<%75)"},{"key":"expense_ratio","name":"Masraf Oranı","unit":"%","description":"Faaliyet gideri oranı"},{"key":"roe","name":"Özkaynak Kârlılığı (ROE)","unit":"%","description":"Float getirisi ve kârlılık"}],
      
      taxRate: 0.3,
    }
  },
  "Spor": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Spor Kulüpleri & Futbol Yatırımları",
      badge: "Spor / Yayın & Sponsorluk Gelirleri Modu",
      description: "Yayın gelirleri, sponsorluk ve stadyum hasılatı, sporcu transfer kârları, finansal borç yapılandırma disiplini ve TTK 376 özkaynak izlemi esastır.",
      revenueLabel: "Spor & Mağazacılık Gelirleri",
      revenueSublabel: "Yayın Hakkı, Stadyum Bilet/Loca, Sponsorluk ve Lisanslı Ürün Satışları",
      operatingProfitLabel: "Faaliyet Kârı / Zararı",
      operatingProfitSublabel: "Sporcu Ücretleri Sonrası Operasyonel Denge",
      marginLabel: "Faaliyet Kâr Marjı (%)",
      marginSublabel: "Kulüp Gelirleri / Takım Maliyet Oranı",
      valuationMultiples: "FD/Satışlar & F/K",
      primaryEfficiencyMetric: "Yayın & Sponsorluk Nakit Akışı",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"commercial_growth","name":"Yayın & Sponsorluk Hasılat Gücü","maxScore":25,"description":"TFF yayın hakları, UEFA gelirleri ve sponsorluk anlaşmaları hacmi"},
        {"key":"wage_ratio","name":"Sporcu Ücretleri / Hasılat Oranı","maxScore":25,"description":"Takım bütçesinin ciroya oranı (<%65 finansal fair-play sınırı)"},
        {"key":"debt_restructure","name":"Borç Yapılandırması & Finansal Yük","maxScore":25,"description":"Bankalar konsorsiyumu borç yapılandırma taksit ödeme gücü"},
        {"key":"equity_ttk376","name":"Özkaynak Tamponu & TTK 376 Uyumu","maxScore":25,"description":"Negatif özkaynak riskinin sermaye artırımlarıyla telafi edilmesi"}
      ],
      riskThresholds: {"criticalDebtRatio":4.5,"minLiquidityRatio":0.7,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Spor Kulüpleri & Futbol Yatırımları",
      badge: "Spor / Yayın & Sponsorluk Gelirleri Modu",
      description: "Yayın gelirleri, sponsorluk ve stadyum hasılatı, sporcu transfer kârları, finansal borç yapılandırma disiplini ve TTK 376 özkaynak izlemi esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"wage_to_revenue","name":"Maaş / Ciro Oranı","unit":"%","description":"Takım maliyet disiplini (<%65)"},{"key":"commercial_revenue","name":"Ticari & Sponsorluk Hasılatı","unit":"TL","description":"Stat ve sponsorluk gelirleri"},{"key":"net_debt","name":"Finansal Net Borç","unit":"TL","description":"Banka borç yükü"},{"key":"equity","name":"Özkaynak Büyüklüğü","unit":"TL","description":"TTK 376 sermaye tamponu"},{"key":"ev_sales","name":"FD / Satışlar","unit":"x","description":"Kulüp piyasa çarpanı"}],
      
      taxRate: 0.25,
    }
  },
  "Tarım Kimyasalları": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Tarım Kimyasalları, Gübre & Zirai İlaç",
      badge: "Gübre / Amonyak-Üre Yayılımı & Sübvansiyon Modu",
      description: "Global amonyak/üre yayılım marjı, tarımsal sübvansiyon politikaları, sezonluk ekim döngüsü ve Through-the-Cycle FAVÖK normalizasyonu esastır.",
      revenueLabel: "Gübre & Zirai İlaç Satış Gelirleri",
      revenueSublabel: "Kompoze Gübre, Üre, Amonyum Nitrat ve Bitki Koruma Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Döngüsel Normalleştirilmiş Gübre Faaliyet Kârı",
      marginLabel: "Amonyak/Üre Fiyat Makası & Marj (%)",
      marginSublabel: "Doğalgaz/Amonyak Girdisi Sonrası Operasyonel Kâr",
      valuationMultiples: "FD/FAVÖK & F/K",
      primaryEfficiencyMetric: "Amonyak/Üre Fiyat Makası & Taban Marj",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"urea_spread","name":"Global Amonyak/Üre Fiyat Yayılımı","maxScore":25,"description":"Global doğalgaz maliyeti ile gübre satış fiyatı arasındaki makas"},
        {"key":"planting_demand","name":"Sezonluk Ekim Talebi & Taban Marj","maxScore":25,"description":"İlkbahar/sonbahar ekim döngüsünde istikrarlı taban marj güvencesi"},
        {"key":"farmer_financing","name":"İşletme Sermayesi & Çiftçi Finansmanı","maxScore":25,"description":"Tarım Kredi ve bayi tahsilat vadelerinin nakit akışına etkisi"},
        {"key":"debt_coverage","name":"Borç Karşılama Gücü (Net Borç / FAVÖK)","maxScore":25,"description":"Hammadde ithalat borçlarının operasyonel nakitle karşılanması"}
      ],
      riskThresholds: {"criticalDebtRatio":4,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Tarım Kimyasalları, Gübre & Zirai İlaç",
      badge: "Gübre / Amonyak-Üre Yayılımı & Sübvansiyon Modu",
      description: "Global amonyak/üre yayılım marjı, tarımsal sübvansiyon politikaları, sezonluk ekim döngüsü ve Through-the-Cycle FAVÖK normalizasyonu esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Hammadde fiyat makası"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"working_capital_days","name":"Nakit Dönüşüm Süresi","unit":"Gün","description":"Sezonluk alacak döngüsü"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Teknoloji": {
    archetype: "TECH",
    valuationSector: "TECH",
    definition: {
      id: "TECH",
      title: "Teknoloji, Bilişim & Yazılım (SaaS)",
      badge: "Teknoloji / SaaS ARR & Rule of 40 Modu",
      description: "Rule of 40 (Hasılat Büyümesi + FCF Marjı >= %40), SaaS tekrarlayan gelir (ARR), Asset-light hafif varlık primi ve yüksek net nakit tamponu esastır.",
      revenueLabel: "Yazılım & Teknoloji Gelirleri",
      revenueSublabel: "Lisans, SaaS Tekrarlayan Gelir (ARR) ve Sistem Entegrasyon Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Hafif Varlık Yapılı Operasyonel Nakit Üretimi",
      marginLabel: "Brüt Kâr & FCF Marjı (%)",
      marginSublabel: "Yüksek Fiyatlama Gücü ve Nakit Dönüşüm Oranı",
      valuationMultiples: "FD/Satışlar (EV/Sales), FD/FAVÖK & PEG",
      primaryEfficiencyMetric: "Rule of 40 (Büyüme + FCF Marjı %)",
    },
    scoring: {
      sector: "TECH",
      categories: [
        {"key":"rule_of_40","name":"Rule of 40 (Büyüme + FCF Marjı)","maxScore":25,"description":"Hasılat artışı + Serbest Nakit Akışı marjı toplamı (>= %40 dünya standardı)"},
        {"key":"software_gross_margin","name":"Yüksek Brüt Kâr Marjı","maxScore":25,"description":"Yazılım ve lisanslama kârlılığı (>= %50 güçlü fiyatlama kalkanı)"},
        {"key":"net_cash","name":"Net Nakit Pozisyonu & Borçsuzluk","maxScore":25,"description":"Teknoloji şirketlerinde negatif net borç (güçlü net nakit fazlası)"},
        {"key":"roic_efficiency","name":"Sermaye Verimliliği (ROIC & ROE)","maxScore":25,"description":"Hafif varlık yapısı (Asset-light) ve yüksek yatırılan sermaye getirisi"}
      ],
      riskThresholds: {"criticalDebtRatio":2,"minLiquidityRatio":1.5,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "TECH",
      name: "Teknoloji, Bilişim & Yazılım (SaaS)",
      badge: "Teknoloji / SaaS ARR & Rule of 40 Modu",
      description: "Rule of 40 (Hasılat Büyümesi + FCF Marjı >= %40), SaaS tekrarlayan gelir (ARR), Asset-light hafif varlık primi ve yüksek net nakit tamponu esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"rule_of_40","name":"Rule of 40 Skoru","unit":"%","description":"Büyüme + FCF marjı toplamı (>=%40)"},{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Yazılım ve lisans kârlılığı (>=%50)"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"Ar-Ge sonrası üretilen serbest nakit"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Net nakit zenginliği"},{"key":"ev_sales","name":"FD / Satışlar","unit":"x","description":"Teknoloji değerleme çarpanı"}],
      
      taxRate: 0.25,
    }
  },
  "Tekstil Entegre": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Tekstil Entegre & İplik / Kumaş İmalatı",
      badge: "Tekstil / İhracat & Döngüsel Normalizasyon Modu",
      description: "İhracat oranı, pamuk/elyaf hammadde fiyat dalgalanması, enerji maliyet yönetimi, Through-the-Cycle medyan FAVÖK ve varlık tabanı koruması esastır.",
      revenueLabel: "Entegre Tekstil Satış Gelirleri",
      revenueSublabel: "İplik, Dokuma/Örme Kumaş, Boyahane ve Konfeksiyon Satışları",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Döngüsel Normalleştirilmiş Tekstil Operasyonel Kârı",
      marginLabel: "Through-the-Cycle FAVÖK Marjı (%)",
      marginSublabel: "Pamuk/Enerji Maliyetleri Sonrası Tarihsel Medyan Kâr",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "İhracat Payı & Pamuk/Elyaf Makası",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"export_share","name":"İhracat Gelirleri & Kur Koruması","maxScore":25,"description":"Avrupa ve ABD hazır giyim devlerine yapılan döviz bazlı ihracat payı"},
        {"key":"cotton_spread","name":"Pamuk/Elyaf Hammadde Makası & Marj","maxScore":25,"description":"Pamuk fiyat oynaklığına karşı koruma ve iplik/kumaş marj dengesi"},
        {"key":"cycle_ebitda","name":"Through-the-Cycle Medyan Kârlılık","maxScore":25,"description":"Küresel tekstil döngüsü dip evrelerinde marj koruma ve varlık tabanı"},
        {"key":"debt_safety","name":"Finansal Sağlık & Net Borç / FAVÖK","maxScore":25,"description":"Yüksek faiz ortamında işletme kredisi yükünün yönetilebilirliği"}
      ],
      riskThresholds: {"criticalDebtRatio":3.5,"minLiquidityRatio":1.1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Tekstil Entegre & İplik / Kumaş İmalatı",
      badge: "Tekstil / İhracat & Döngüsel Normalizasyon Modu",
      description: "İhracat oranı, pamuk/elyaf hammadde fiyat dalgalanması, enerji maliyet yönetimi, Through-the-Cycle medyan FAVÖK ve varlık tabanı koruması esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"export_ratio","name":"İhracat Oranı","unit":"%","description":"Döviz bazlı hasılat payı (>%60)"},{"key":"gross_margin","name":"Brüt Kâr Marjı","unit":"%","description":"Hammadde maliyet kalkanı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Kaldıraç göstergesi"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Turizm": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Turizm, Otelcilik & Konaklama Tesisleri",
      badge: "Turizm / RevPAR & Sezonluk Nakit Akışı Modu",
      description: "Oda Başına Gelir (RevPAR), yatak doluluk oranı, yaz mevsimselliği nakit üretimi, döviz gelirleri ve gayrimenkul varlık tabanı esastır.",
      revenueLabel: "Otelcilik & Turizm Hizmet Gelirleri",
      revenueSublabel: "Konaklama, Yiyecek/İçecek, Kongre ve Spa Hizmetleri Hasılatı",
      operatingProfitLabel: "FAVÖK (EBITDA)",
      operatingProfitSublabel: "Mevsimsellik Düzeltmeli Operasyonel Nakit Akışı",
      marginLabel: "RevPAR & FAVÖK Marjı (%)",
      marginSublabel: "Mevcut Oda Başına Gelir ve Faaliyet Kârlılığı",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "RevPAR (Oda Başı Gelir) & Doluluk",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"revpar_occupancy","name":"RevPAR & Yatak Doluluk Oranı","maxScore":25,"description":"Yaz ve kış sezonlarında oda başı ortalama gelir ve doluluk başarısı"},
        {"key":"fx_pricing_power","name":"Döviz Hasılat Oranı & Fiyatlama Gücü","maxScore":25,"description":"Yabancı turist trafiği ile %75+ EUR/USD bazlı gelir güvencesi"},
        {"key":"seasonal_fcf","name":"Sezonluk Serbest Nakit Akışı (FCF)","maxScore":25,"description":"Yaz sezonunda üretilen serbest nakit ile kış sezonunun finanse edilmesi"},
        {"key":"real_estate_backing","name":"Varlık Tabanı Koruması & Borçluluk","maxScore":25,"description":"Otel gayrimenkul ekspertiz değeri ve yenileme CapEx borç tamponu"}
      ],
      riskThresholds: {"criticalDebtRatio":4,"minLiquidityRatio":0.9,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Turizm, Otelcilik & Konaklama Tesisleri",
      badge: "Turizm / RevPAR & Sezonluk Nakit Akışı Modu",
      description: "Oda Başına Gelir (RevPAR), yatak doluluk oranı, yaz mevsimselliği nakit üretimi, döviz gelirleri ve gayrimenkul varlık tabanı esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"revpar","name":"RevPAR (Oda Başı Gelir)","unit":"EUR","description":"Oda başına günlük ortalama gelir"},{"key":"occupancy_rate","name":"Yatak Doluluk Oranı","unit":"%","description":"Sezonluk doluluk performansı"},{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel nakit marjı"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"Borç karşılama kapasitesi"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"Yenileme CapEx sonrası nakit"}],
      
      taxRate: 0.25,
    }
  },
  "Ulaştırma-Lojistik": {
    archetype: "INDUSTRIAL",
    valuationSector: "INDUSTRIAL",
    definition: {
      id: "INDUSTRIAL",
      title: "Ulaştırma, Lojistik & Liman İşletmeciliği",
      badge: "Lojistik / Filo Kapasitesi & Navlun Modu",
      description: "Filo taşıma kapasitesi, sözleşmeli navlun marjları, UFRS 16 kiralama borç köprüsü, transit ticaret hacmi ve operasyonel nakit üretimi esastır.",
      revenueLabel: "Taşımacılık & Depolama Gelirleri",
      revenueSublabel: "Karayolu, Denizyolu Navlun, Antrepo ve Soğuk Zincir Dağıtım Gelirleri",
      operatingProfitLabel: "FAVÖK (UFRS 16 Düzeltmeli)",
      operatingProfitSublabel: "Filo ve Depo Kira Yükümlülükleri Düzeltilmiş Faaliyet Kârı",
      marginLabel: "FAVÖK & Navlun Marjı (%)",
      marginSublabel: "Akaryakıt ve Filo Maliyeti Sonrası Kâr",
      valuationMultiples: "FD/FAVÖK, F/K & Justified P/B",
      primaryEfficiencyMetric: "Navlun Marjı & UFRS 16 Borç Servisi",
    },
    scoring: {
      sector: "INDUSTRIAL",
      categories: [
        {"key":"fleet_volume","name":"Filo Kapasitesi & Taşıma Hacmi","maxScore":25,"description":"Tır, gemi veya vagon filo kapasitesi ve sefer doluluk verimi"},
        {"key":"contract_spread","name":"Navlun Sözleşme Marjı Stabilitesi","maxScore":25,"description":"Akaryakıt artışlarını navluna yansıtma ve sözleşmeli müşteri güvencesi"},
        {"key":"ifrs16_debt","name":"UFRS 16 Kira Borcu & Net Borç / FAVÖK","maxScore":25,"description":"Filo kiralama yükümlülükleri köprüsü ve borç servis karşılama rasyosu"},
        {"key":"fcf_cash","name":"Serbest Nakit Akışı (FCF) Üretimi","maxScore":25,"description":"Filo yenileme CapEx harcamaları sonrası nakit üretim gücü"}
      ],
      riskThresholds: {"criticalDebtRatio":4,"minLiquidityRatio":1,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "INDUSTRIAL",
      name: "Ulaştırma, Lojistik & Liman İşletmeciliği",
      badge: "Lojistik / Filo Kapasitesi & Navlun Modu",
      description: "Filo taşıma kapasitesi, sözleşmeli navlun marjları, UFRS 16 kiralama borç köprüsü, transit ticaret hacmi ve operasyonel nakit üretimi esastır.",
      disabledMetrics: [],
      featuredMetrics: [{"key":"ebitda_margin","name":"FAVÖK Marjı","unit":"%","description":"Operasyonel kârlılık"},{"key":"free_cash_flow","name":"Serbest Nakit Akışı","unit":"TL","description":"Filo CapEx sonrası nakit"},{"key":"net_debt_ebitda","name":"Net Borç / FAVÖK","unit":"x","description":"UFRS 16 dahil kaldıraç"},{"key":"export_ratio","name":"Uluslararası Navlun Payı","unit":"%","description":"Döviz bazlı taşıma hasılatı"},{"key":"roic","name":"ROIC vs WACC","unit":"%","description":"Sermaye katma değeri"}],
      
      taxRate: 0.25,
    }
  },
  "Varlık Yönetim": {
    archetype: "FINANCIAL_SERVICES",
    valuationSector: "FINANCIAL_SERVICES",
    definition: {
      id: "FINANCIAL_SERVICES",
      title: "Varlık Yönetim Şirketleri (NPL Portföy)",
      badge: "Varlık Yönetim / Tahsilat Çarpanı Modu",
      description: "Bankalardan devralınan donuk alacak (NPL) portföy tahsilat çarpanı, nakit dönüşüm verimi, anapara geri dönüş süresi ve Gordon Justified P/B esastır.",
      revenueLabel: "Tahsilat & Portföy Gelirleri",
      revenueSublabel: "Devralınan Takipteki Alacak Portföylerinden Yapılan Nakit Tahsilatlar",
      operatingProfitLabel: "Esas Faaliyet Kârı (Nakit FAVÖK)",
      operatingProfitSublabel: "Tahsilatlar eksi Operasyonel Çözümleme Giderleri",
      marginLabel: "Tahsilat Verimi & Özkaynak Kârlılığı (%)",
      marginSublabel: "Nakit Tahsilat / Satın Alma Maliyeti Oranı",
      valuationMultiples: "PD/DD & F/K",
      primaryEfficiencyMetric: "Tahsilat / Yatırım Çarpanı & Nakit Dönüşümü",
    },
    scoring: {
      sector: "FINANCIAL_SERVICES",
      categories: [
        {"key":"collection_multiple","name":"NPL Portföy Tahsilat Çarpanı","maxScore":25,"description":"Satın alınan donuk alacak portföyünün 1.8x - 2.5x üzeri tahsilat katsayısı"},
        {"key":"cash_conversion_yield","name":"Nakit Akış Dönüşüm Verimi","maxScore":25,"description":"Yıllık tahsilatların anapara geri dönüş süresini (<3 yıl) kısaltması"},
        {"key":"roe_leverage","name":"Özkaynak Kârlılığı (ROE) & Kaldıraç","maxScore":25,"description":"Düşük borç ve yüksek özkaynak verimiyle sermaye büyümesi"},
        {"key":"origination_power","name":"Yeni Portföy Alım Gücü & Likidite","maxScore":25,"description":"Bankaların NPL ihalelerinde rekabetçi portföy satın alma likiditesi"}
      ],
      riskThresholds: {"nplDanger":4,"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "FINANCIAL_SERVICES",
      name: "Varlık Yönetim Şirketleri (NPL Portföy)",
      badge: "Varlık Yönetim / Tahsilat Çarpanı Modu",
      description: "Bankalardan devralınan donuk alacak (NPL) portföy tahsilat çarpanı, nakit dönüşüm verimi, anapara geri dönüş süresi ve Gordon Justified P/B esastır.",
      disabledMetrics: ["ebitda","gross_profit","ev_ebitda","ev_sales","net_debt","current_ratio","quick_ratio","financial_debt","stock_turnover","gross_margin","ebitda_margin"],
      featuredMetrics: [{"key":"collection_yield","name":"Tahsilat / Maliyet Çarpanı","unit":"x","description":"Toplam portföy tahsilat katsayısı"},{"key":"roe","name":"Özkaynak Kârlılığı (ROE)","unit":"%","description":"Portföy çözümleme kârlılığı"},{"key":"pb","name":"PD / DD Oranı","unit":"x","description":"Defter değeri çarpanı"},{"key":"leverage_ratio","name":"Kaldıraç Oranı","unit":"x","description":"Aktif / Özkaynak oranı"},{"key":"cash_cushion","name":"Hazır Nakit Varlığı","unit":"TL","description":"İhale satın alma likiditesi"}],
      
      taxRate: 0.25,
    }
  },
  "Yatırım Ortaklıkları": {
    archetype: "FINANCIAL_SERVICES",
    valuationSector: "FINANCIAL_SERVICES",
    definition: {
      id: "FINANCIAL_SERVICES",
      title: "Menkul Kıymet Yatırım Ortaklıkları (MYO)",
      badge: "Yatırım Ortaklığı / Portföy NAD & Temettü Modu",
      description: "Menkul kıymet portföyünün günlük/haftalık Net Aktif Değeri (NAD), portföy iskontosu, temettü verimi ve likit varlık güvencesi esastır.",
      revenueLabel: "Portföy Gelirleri & Temettü Girişleri",
      revenueSublabel: "Hisse Senedi Alım-Satım Kârları, Faiz ve Temettü Gelirleri",
      operatingProfitLabel: "Net Dönem Kârı / Faaliyet Kârı",
      operatingProfitSublabel: "Portföy Yönetim Giderleri Sonrası Net Getiri",
      marginLabel: "Portföy NAD İskontosu (%)",
      marginSublabel: "Piyasa Değeri vs Menkul Kıymet Portföy Net Aktif Değeri",
      valuationMultiples: "PD/NAD & Temettü Verimi",
      primaryEfficiencyMetric: "Portföy NAD İskontosu (%) & Temettü",
    },
    scoring: {
      sector: "FINANCIAL_SERVICES",
      categories: [
        {"key":"portfolio_nav_discount","name":"Menkul Kıymet Portföy NAD İskontosu","maxScore":25,"description":"Piyasa değeri / Portföy net aktif değeri iskonto cazibesi (>%20)"},
        {"key":"benchmark_alpha","name":"Portföy Getirisi vs BIST 100 Karşılaştırması","maxScore":25,"description":"Portföy yöneticisinin endeks üzeri alfa yaratma performansı"},
        {"key":"dividend_payout","name":"Temettü Dağıtım Gücü & Likidite","maxScore":25,"description":"Yıllık kârın nakit temettü olarak ortaklara dağıtılma istikrarı"},
        {"key":"cost_management","name":"Yönetim Gider Oranı & Özkaynak Sağlığı","maxScore":25,"description":"Portföy büyüklüğüne oranla düşük komisyon ve yönetim gideri"}
      ],
      riskThresholds: {"minMarginOfSafety":20,"idealMarginOfSafety":30},
    },
    archetypeConfig: {
      archetype: "FINANCIAL_SERVICES",
      name: "Menkul Kıymet Yatırım Ortaklıkları (MYO)",
      badge: "Yatırım Ortaklığı / Portföy NAD & Temettü Modu",
      description: "Menkul kıymet portföyünün günlük/haftalık Net Aktif Değeri (NAD), portföy iskontosu, temettü verimi ve likit varlık güvencesi esastır.",
      disabledMetrics: ["ebitda","gross_profit","ev_ebitda","ev_sales","net_debt","current_ratio","quick_ratio","financial_debt","stock_turnover","gross_margin","ebitda_margin"],
      featuredMetrics: [{"key":"nav_discount","name":"Portföy NAD İskontosu","unit":"%","description":"Piyasa fiyatı / Net Aktif Değer"},{"key":"pb_nav","name":"PD / NAD Oranı","unit":"x","description":"Portföy çarpanı"},{"key":"dividend_yield","name":"Temettü Verimi","unit":"%","description":"Yıllık kâr payı getirisi"},{"key":"portfolio_value","name":"Toplam Portföy Değeri","unit":"TL","description":"Likit menkul kıymet büyüklüğü"},{"key":"roe","name":"Özkaynak Kârlılığı","unit":"%","description":"Portföy getiri katsayısı"}],
      
      taxRate: 0,
    }
  },
};
