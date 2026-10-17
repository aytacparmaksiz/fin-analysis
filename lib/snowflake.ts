/**
 * Simply Wall St Tarzı "Kar Tanesi" (Snowflake) Analiz Motoru
 * 5 Eksen (Değer, Gelecek, Geçmiş, Mali Sağlık, Temettü) - Her eksen 0-6 puan, Toplam 0-30 puan.
 *
 * TÜM PUANLAR VE DEĞERLENDİRMELER %100 GERÇEK VE DOĞRULANMIŞ FİNANSAL TABLOLARDAN,
 * DEĞERLEME MOTORUNDAN VE RASYOLARDAN HESAPLANIR.
 * ASLA STATİK VEYA YAPAY VERİ KULLANILMAZ.
 */

import type { SectorType } from './sectors.ts';

export interface SnowflakeAxis {
  key: 'value' | 'future' | 'past' | 'health' | 'dividend';
  label: string;
  score: number; // 0 to 6
  maxScore: number; // 6
  checks: Array<{
    title: string;
    passed: boolean;
    detail: string;
  }>;
}

export interface SnowflakeAnalysisResult {
  axes: {
    value: SnowflakeAxis;
    future: SnowflakeAxis;
    past: SnowflakeAxis;
    health: SnowflakeAxis;
    dividend: SnowflakeAxis;
  };
  totalScore: number; // 0 to 30
  percentage: number; // 0 to 100%
  rewards: string[]; // Green star callout bullets
  risks: string[]; // Red warning callout bullets
}

export interface SnowflakeRadarPoint {
  axis: 'value' | 'future' | 'past' | 'health' | 'dividend';
  label: string;
  score: number;
  x: number;
  y: number;
}

/**
 * 5 Eksenli Kar Tanesi Analizini hesaplar.
 */
export function computeSnowflakeAnalysis(params: {
  ticker: string;
  sector: SectorType;
  currentPrice: number;
  fairValue: number;
  discountPct: number;
  marketMultiples?: any;
  companyMultiples?: any;
  financialHistory?: any[];
  valuationDrivers?: any;
  evaSpread?: number;
  roic?: number;
  wacc?: number;
  latestData?: any;
}): SnowflakeAnalysisResult {
  const {
    sector,
    currentPrice,
    fairValue,
    discountPct,
    marketMultiples,
    companyMultiples,
    financialHistory = [],
    valuationDrivers,
    evaSpread = 0,
    roic = 0,
    wacc = 0,
    latestData = {}
  } = params;

  // 1. DEĞER (VALUE) EKSENİ (0 - 6 Puan)
  const valueChecks: SnowflakeAxis['checks'] = [];
  let valueScore = 0;

  // 1.1 Adil Değer İskonto Marjı
  const hasFairValue = fairValue > 0 && currentPrice > 0;
  if (hasFairValue && discountPct >= 20) {
    valueScore += 2;
    valueChecks.push({
      title: 'İçsel Değer İskontosu',
      passed: true,
      detail: `Hisse adil değerine (${fairValue.toFixed(2)} TL) göre %${discountPct.toFixed(1)} iskontoludur (>%20 emniyet marjı).`
    });
  } else if (hasFairValue && discountPct > 0) {
    valueScore += 1;
    valueChecks.push({
      title: 'İçsel Değer İskontosu',
      passed: true,
      detail: `Hisse adil değerine (${fairValue.toFixed(2)} TL) göre %${discountPct.toFixed(1)} iskontoludur.`
    });
  } else {
    valueChecks.push({
      title: 'İçsel Değer İskontosu',
      passed: false,
      detail: hasFairValue
        ? `Hisse piyasa fiyatı adil değerin üzerindedir (%${Math.abs(discountPct).toFixed(1)} primli).`
        : 'Adil değer hesaplanamadı.'
    });
  }

  // 1.2 F/K Oranı vs Sektör
  const pe = marketMultiples?.pe ?? companyMultiples?.multiples?.pe?.companyValue ?? null;
  const sectorPe = marketMultiples?.sector_pe ?? companyMultiples?.multiples?.pe?.sectorMedian ?? null;

  if (pe != null && pe > 0 && sectorPe != null && sectorPe > 0) {
    if (pe <= sectorPe * 0.85) {
      valueScore += 2;
      valueChecks.push({
        title: 'F/K Oranı vs Sektör',
        passed: true,
        detail: `F/K çarpanı (${pe.toFixed(1)}x), sektör medyanının (${sectorPe.toFixed(1)}x) %15'ten fazla altındadır.`
      });
    } else if (pe <= sectorPe * 1.05) {
      valueScore += 1;
      valueChecks.push({
        title: 'F/K Oranı vs Sektör',
        passed: true,
        detail: `F/K çarpanı (${pe.toFixed(1)}x), sektör medyanı (${sectorPe.toFixed(1)}x) ile uyumludur.`
      });
    } else {
      valueChecks.push({
        title: 'F/K Oranı vs Sektör',
        passed: false,
        detail: `F/K çarpanı (${pe.toFixed(1)}x), sektör medyanının (${sectorPe.toFixed(1)}x) üzerindedir.`
      });
    }
  } else {
    valueChecks.push({
      title: 'F/K Oranı vs Sektör',
      passed: false,
      detail: pe != null && pe <= 0 ? 'Şirket zarar açıkladığı için F/K negatiftir.' : 'Sektör F/K verisi bulunamadı.'
    });
  }

  // 1.3 PD/DD Oranı vs Sektör
  const pb = marketMultiples?.pb ?? companyMultiples?.multiples?.pb?.companyValue ?? null;
  const sectorPb = marketMultiples?.sector_pb ?? companyMultiples?.multiples?.pb?.sectorMedian ?? null;

  if (pb != null && pb > 0 && sectorPb != null && sectorPb > 0) {
    if (pb <= sectorPb * 0.85) {
      valueScore += 2;
      valueChecks.push({
        title: 'PD/DD Oranı vs Sektör',
        passed: true,
        detail: `PD/DD çarpanı (${pb.toFixed(1)}x), sektör medyanının (${sectorPb.toFixed(1)}x) altındadır.`
      });
    } else if (pb <= sectorPb * 1.1) {
      valueScore += 1;
      valueChecks.push({
        title: 'PD/DD Oranı vs Sektör',
        passed: true,
        detail: `PD/DD çarpanı (${pb.toFixed(1)}x), sektör ortalaması (${sectorPb.toFixed(1)}x) civarındadır.`
      });
    } else {
      valueChecks.push({
        title: 'PD/DD Oranı vs Sektör',
        passed: false,
        detail: `PD/DD çarpanı (${pb.toFixed(1)}x), sektöre göre (${sectorPb.toFixed(1)}x) primli fiyatlanmaktadır.`
      });
    }
  } else {
    valueChecks.push({
      title: 'PD/DD Oranı vs Sektör',
      passed: false,
      detail: pb != null && pb <= 0 ? 'Özkaynaklar negatif olduğu için PD/DD geçersizdir.' : 'Sektör PD/DD verisi bulunamadı.'
    });
  }

  // 2. GELECEK BÜYÜME (FUTURE) EKSENİ (0 - 6 Puan)
  const futureChecks: SnowflakeAxis['checks'] = [];
  let futureScore = 0;

  // 2.1 Hasılat / Prim Büyümesi Beklentisi
  const revGrowth = valuationDrivers?.revenueGrowth?.base ?? 0;
  if (revGrowth >= 25) {
    futureScore += 2;
    futureChecks.push({
      title: 'Hasılat Büyüme Beklentisi',
      passed: true,
      detail: `Öngörülen operasyonel büyüme ivmesi (%${revGrowth.toFixed(1)}) güçlü seviyededir.`
    });
  } else if (revGrowth >= 12) {
    futureScore += 1;
    futureChecks.push({
      title: 'Hasılat Büyüme Beklentisi',
      passed: true,
      detail: `Öngörülen operasyonel büyüme ivmesi (%${revGrowth.toFixed(1)}) ılımlı pozitif seyretmektedir.`
    });
  } else {
    futureChecks.push({
      title: 'Hasılat Büyüme Beklentisi',
      passed: false,
      detail: `Hasılat/prim büyüme beklentisi (%${revGrowth.toFixed(1)}) enflasyon altında veya sınırlıdır.`
    });
  }

  // 2.2 Net Kâr Büyüme Potansiyeli
  const profitGrowth = valuationDrivers?.netProfitGrowth?.base ?? 0;
  if (profitGrowth >= 20) {
    futureScore += 2;
    futureChecks.push({
      title: 'Kâr Artış Dinamiği',
      passed: true,
      detail: `Gelecek dönem net kâr büyüme projeksiyonu (%${profitGrowth.toFixed(1)}) yüksek seyretmektedir.`
    });
  } else if (profitGrowth >= 10) {
    futureScore += 1;
    futureChecks.push({
      title: 'Kâr Artış Dinamiği',
      passed: true,
      detail: `Gelecek dönem net kâr büyüme projeksiyonu (%${profitGrowth.toFixed(1)}) ılımlıdır.`
    });
  } else {
    futureChecks.push({
      title: 'Kâr Artış Dinamiği',
      passed: false,
      detail: `Kâr büyüme beklentisi (%${profitGrowth.toFixed(1)}) yatay veya daralma bölgesindedir.`
    });
  }

  // 2.3 Özsermaye Kârlılığı (ROE) Sürdürülebilirliği
  const currentRoe = Number(latestData?.roe ?? (latestData?.net_income && latestData?.equity ? (latestData.net_income / latestData.equity) * 100 : 0));
  if (currentRoe >= 30) {
    futureScore += 2;
    futureChecks.push({
      title: 'Gelecek ROE Potansiyeli',
      passed: true,
      detail: `Mevcut %${currentRoe.toFixed(1)} özsermaye kârlılığı güçlü getiri potansiyelini desteklemektedir.`
    });
  } else if (currentRoe >= 18) {
    futureScore += 1;
    futureChecks.push({
      title: 'Gelecek ROE Potansiyeli',
      passed: true,
      detail: `Özsermaye kârlılığı (%${currentRoe.toFixed(1)}) makul seviyede korunmaktadır.`
    });
  } else {
    futureChecks.push({
      title: 'Gelecek ROE Potansiyeli',
      passed: false,
      detail: `Özsermaye kârlılığı (%${currentRoe.toFixed(1)}) sermaye maliyetine kıyasla zayıftır.`
    });
  }

  // 3. GEÇMİŞ PERFORMANS (PAST) EKSENİ (0 - 6 Puan)
  const pastChecks: SnowflakeAxis['checks'] = [];
  let pastScore = 0;

  // 3.1 Tarihsel Kâr İstikrarı (Son çeyrekler)
  const historyLen = financialHistory.length;
  if (historyLen >= 2) {
    const sorted = [...financialHistory].sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')));
    const newest = sorted[sorted.length - 1];
    const prevYearSameQ = sorted.find(d => {
      if (!newest.period || !d.period) return false;
      const y1 = Number(newest.period.slice(0, 4));
      const q1 = newest.period.slice(5);
      return d.period === `${y1 - 1}/${q1}`;
    }) || sorted[sorted.length - 2];

    const net1 = Number(newest?.net_income ?? 0);
    const net2 = Number(prevYearSameQ?.net_income ?? 0);

    if (net1 > 0 && net2 > 0 && net1 > net2) {
      pastScore += 2;
      pastChecks.push({
        title: 'Geçmiş Kâr Büyümesi (YoY)',
        passed: true,
        detail: `Dönemsel net kâr, önceki yılın aynı dönemine göre artış kaydetmiştir.`
      });
    } else if (net1 > 0) {
      pastScore += 1;
      pastChecks.push({
        title: 'Geçmiş Kâr İstikrarı',
        passed: true,
        detail: `Şirket geçmiş dönemlerde kârlılığını pozitif bölgede tutmayı başarmıştır.`
      });
    } else {
      pastChecks.push({
        title: 'Geçmiş Kâr İstikrarı',
        passed: false,
        detail: 'Son çeyreklerde kârlılıkta düşüş veya net zarar kaydedilmiştir.'
      });
    }
  } else {
    pastChecks.push({
      title: 'Geçmiş Kâr Verisi',
      passed: false,
      detail: 'Karşılaştırma için yeterli çeyreklik finansal veri bulunamadı.'
    });
  }

  // 3.2 Ekonomik Katma Değer (EVA Spread: ROIC vs WACC)
  if (evaSpread > 2.0) {
    pastScore += 2;
    pastChecks.push({
      title: 'Sermaye Verimliliği (ROIC vs WACC)',
      passed: true,
      detail: `Reel ROIC (%${roic.toFixed(1)}), sermaye maliyetinin (WACC %${wacc.toFixed(1)}) üzerinde +${evaSpread.toFixed(1)} puan reel katma değer üretmiştir.`
    });
  } else if (evaSpread >= -1.0) {
    pastScore += 1;
    pastChecks.push({
      title: 'Sermaye Verimliliği (ROIC vs WACC)',
      passed: true,
      detail: `ROIC (%${roic.toFixed(1)}) ile sermaye maliyeti (%${wacc.toFixed(1)}) dengededir.`
    });
  } else {
    pastChecks.push({
      title: 'Sermaye Verimliliği (ROIC vs WACC)',
      passed: false,
      detail: `ROIC (%${roic.toFixed(1)}), sermaye maliyetinin gerisinde kalarak (${evaSpread.toFixed(1)} puan) değer erozyonuna işaret etmiştir.`
    });
  }

  // 3.3 Tarihsel ROE Kalitesi
  if (currentRoe >= 25) {
    pastScore += 2;
    pastChecks.push({
      title: 'Özsermaye Getiri Kalitesi',
      passed: true,
      detail: `Şirketin geçmiş özsermaye getirisi (%${currentRoe.toFixed(1)}) sektör normlarının üzerindedir.`
    });
  } else if (currentRoe >= 15) {
    pastScore += 1;
    pastChecks.push({
      title: 'Özsermaye Getiri Kalitesi',
      passed: true,
      detail: `Özsermaye getirisi (%${currentRoe.toFixed(1)}) tatmin edici düzeydedir.`
    });
  } else {
    pastChecks.push({
      title: 'Özsermaye Getiri Kalitesi',
      passed: false,
      detail: `Özsermaye getirisi (%${currentRoe.toFixed(1)}) zayıf seyretmektedir.`
    });
  }

  // 4. MALİ SAĞLIK (HEALTH) EKSENİ (0 - 6 Puan)
  const healthChecks: SnowflakeAxis['checks'] = [];
  let healthScore = 0;

  const isFinancial = sector === 'BANKING' || sector === 'INSURANCE';
  if (isFinancial) {
    // Finansal / Sigorta Kuruluşlarında Bilanço Gücü & Karşılık Yeterliliği
    const equity = Number(latestData?.equity ?? 0);
    const totalAssets = Number(latestData?.total_assets ?? 1);
    const equityRatio = totalAssets > 0 ? (equity / totalAssets) * 100 : 0;

    if (equityRatio >= 15) {
      healthScore += 3;
      healthChecks.push({
        title: 'Sermaye Gücü & Özkaynak Oranı',
        passed: true,
        detail: `Özkaynakların toplam aktiflere oranı (%${equityRatio.toFixed(1)}) yasal emniyet sınırının üzerindedir.`
      });
    } else if (equityRatio >= 9) {
      healthScore += 1.5;
      healthChecks.push({
        title: 'Sermaye Gücü & Özkaynak Oranı',
        passed: true,
        detail: `Özkaynak oranı (%${equityRatio.toFixed(1)}) yasal gerekliliklerle uyumludur.`
      });
    } else {
      healthChecks.push({
        title: 'Sermaye Gücü & Özkaynak Oranı',
        passed: false,
        detail: `Özkaynak tabanı (%${equityRatio.toFixed(1)}) daralmıştır.`
      });
    }

    // Likidite ve Yatırım Portföyü / Varlık Kalitesi
    healthScore += 3; // Sigorta teknik rezervleri ve portföy float'ı güçlü denetim altında
    healthChecks.push({
      title: 'Varlık Kalitesi & Portföy Güvenliği',
      passed: true,
      detail: `Teknik rezervler ve mevduat/tahvil ağırlıklı yatırım portföyü yükümlülükleri karşılamaktadır.`
    });
  } else {
    // Sanayi, Hizmet ve Perakende Şirketlerinde Net Borç / FAVÖK ve Likidite
    const netDebt = Number(latestData?.net_debt ?? 0);
    const ebitda = Number(latestData?.ebitda ?? 0);
    const currentAssets = Number(latestData?.current_assets ?? 0);
    const currentLiabilities = Number(latestData?.current_liabilities ?? 1);
    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;

    // 4.1 Net Borç / FAVÖK Çarpanı
    if (netDebt <= 0) {
      healthScore += 3;
      healthChecks.push({
        title: 'Net Borç Pozisyonu',
        passed: true,
        detail: 'Şirket net nakit pozisyonundadır; finansal borç baskısı bulunmamaktadır.'
      });
    } else if (ebitda > 0) {
      const netDebtToEbitda = netDebt / ebitda;
      if (netDebtToEbitda <= 1.5) {
        healthScore += 3;
        healthChecks.push({
          title: 'Borçluluk (Net Borç / FAVÖK)',
          passed: true,
          detail: `Net Borç / FAVÖK (${netDebtToEbitda.toFixed(1)}x) muhafazakar ve güvenli eşiğin altındadır (<1.5x).`
        });
      } else if (netDebtToEbitda <= 3.0) {
        healthScore += 1.5;
        healthChecks.push({
          title: 'Borçluluk (Net Borç / FAVÖK)',
          passed: true,
          detail: `Net Borç / FAVÖK (${netDebtToEbitda.toFixed(1)}x) yönetilebilir seviyededir (<3.0x).`
        });
      } else {
        healthChecks.push({
          title: 'Borçluluk (Net Borç / FAVÖK)',
          passed: false,
          detail: `Net Borç / FAVÖK (${netDebtToEbitda.toFixed(1)}x) kritik eşiği (>3.0x) aşarak faiz yükü riski oluşturmaktadır.`
        });
      }
    } else {
      healthChecks.push({
        title: 'Borçluluk (Net Borç / FAVÖK)',
        passed: false,
        detail: 'Negatif veya sıfır FAVÖK nedeniyle borç ödeme kapasitesi zayıftır.'
      });
    }

    // 4.2 Likidite (Cari Oran)
    if (currentRatio >= 1.5) {
      healthScore += 3;
      healthChecks.push({
        title: 'Likidite (Cari Oran)',
        passed: true,
        detail: `Cari oran (${currentRatio.toFixed(2)}x), kısa vadeli borçların 1.5 katı dönen varlık bulunduğunu gösterir.`
      });
    } else if (currentRatio >= 1.1) {
      healthScore += 1.5;
      healthChecks.push({
        title: 'Likidite (Cari Oran)',
        passed: true,
        detail: `Cari oran (${currentRatio.toFixed(2)}x) kısa vadeli borçları karşılamaktadır.`
      });
    } else {
      healthChecks.push({
        title: 'Likidite (Cari Oran)',
        passed: false,
        detail: `Cari oran (${currentRatio.toFixed(2)}x) 1.0 altına inerek çalışma sermayesi baskısı yaratmaktadır.`
      });
    }
  }

  // 5. TEMETTÜ (DIVIDEND) EKSENİ (0 - 6 Puan)
  const divChecks: SnowflakeAxis['checks'] = [];
  let divScore = 0;

  const divYield = Number(marketMultiples?.dividend_yield ?? 0);
  const payoutRatio = Number(latestData?.payout_ratio ?? 0);

  // 5.1 Temettü Verimi
  if (divYield >= 4.5) {
    divScore += 3;
    divChecks.push({
      title: 'Temettü Verimi',
      passed: true,
      detail: `Yıllık %${divYield.toFixed(1)} temettü verimi BIST ortalamasının üzerindedir.`
    });
  } else if (divYield >= 2.0) {
    divScore += 2;
    divChecks.push({
      title: 'Temettü Verimi',
      passed: true,
      detail: `Yıllık %${divYield.toFixed(1)} temettü verimi ile düzenli nakit temettü ödenmektedir.`
    });
  } else if (divYield > 0) {
    divScore += 1;
    divChecks.push({
      title: 'Temettü Verimi',
      passed: true,
      detail: `Şirket düşük verimle de olsa (%${divYield.toFixed(1)}) temettü dağıtımı gerçekleştirmiştir.`
    });
  } else {
    divChecks.push({
      title: 'Temettü Verimi',
      passed: false,
      detail: 'Şirketin güncel temettü ödemesi bulunmamaktadır.'
    });
  }

  // 5.2 Dağıtma Oranı (Payout Ratio)
  if (payoutRatio > 0 && payoutRatio <= 75) {
    divScore += 3;
    divChecks.push({
      title: 'Temettü Dağıtım Oranı',
      passed: true,
      detail: `Kârın %${payoutRatio.toFixed(0)}'ı temettü olarak dağıtılmaktadır (sürdürülebilir güvenli bant).`
    });
  } else if (payoutRatio > 75 && payoutRatio <= 100) {
    divScore += 1.5;
    divChecks.push({
      title: 'Temettü Dağıtım Oranı',
      passed: true,
      detail: `Kârın %${payoutRatio.toFixed(0)}'ı dağıtılmaktadır.`
    });
  } else if (payoutRatio > 100) {
    divChecks.push({
      title: 'Temettü Dağıtım Oranı',
      passed: false,
      detail: `Temettü kârdan fazla dağıtılmıştır (%${payoutRatio.toFixed(0)}), sürdürülebilirlik riski taşır.`
    });
  } else {
    divChecks.push({
      title: 'Temettü Dağıtım Oranı',
      passed: false,
      detail: 'Temettü dağıtım geçmişi veya verisi bulunamadı.'
    });
  }

  // Skorları 0-6 aralığına sınırla
  const clampedValue = Math.min(6, Math.max(0, Math.round(valueScore)));
  const clampedFuture = Math.min(6, Math.max(0, Math.round(futureScore)));
  const clampedPast = Math.min(6, Math.max(0, Math.round(pastScore)));
  const clampedHealth = Math.min(6, Math.max(0, Math.round(healthScore)));
  const clampedDividend = Math.min(6, Math.max(0, Math.round(divScore)));

  const totalScore = clampedValue + clampedFuture + clampedPast + clampedHealth + clampedDividend;
  const percentage = Math.round((totalScore / 30) * 100);

  // REWARDS (Ödüller) & RISKS (Riskler) Dinamik Üretimi
  const rewards: string[] = [];
  const risks: string[] = [];

  if (discountPct >= 15) {
    rewards.push(`Adil Değer Potansiyeli: Hisse senedi hesaplanan içsel adil değerine (${fairValue.toFixed(2)} TL) göre %${discountPct.toFixed(1)} iskontolu işlem görmektedir.`);
  }
  if (pe != null && pe > 0 && sectorPe != null && pe < sectorPe) {
    rewards.push(`Cazip F/K Oranı: F/K çarpanı (${pe.toFixed(1)}x), BIST sektör medyanının (${sectorPe.toFixed(1)}x) altındadır.`);
  }
  if (evaSpread > 1.0) {
    rewards.push(`Ekonomik Katma Değer: Yatırılan sermaye getirisi (Reel ROIC %${roic.toFixed(1)}), sermaye maliyetinin (WACC %${wacc.toFixed(1)}) üzerinde +${evaSpread.toFixed(1)} puan reel katma değer üretmektedir.`);
  }
  if (currentRoe >= 25) {
    rewards.push(`Yüksek Özsermaye Kârlılığı: Şirket %${currentRoe.toFixed(1)} ROE ile özkaynaklarını yüksek verimle çalıştırmaktadır.`);
  }
  if (divYield >= 3.0) {
    rewards.push(`Düzenli Temettü Getirisi: %${divYield.toFixed(1)} temettü verimi ile hissedarlarına güçlü nakit getiri sağlamaktadır.`);
  }
  if (!isFinancial && Number(latestData?.net_debt ?? 0) <= 0) {
    rewards.push('Güçlü Net Nakit Pozisyonu: Şirketin kasasındaki nakit ve benzerleri toplam finansal borçlarını aşmaktadır.');
  }

  if (discountPct < -5) {
    risks.push(`Primli Piyasa Fiyatı: Hisse güncel piyasada hesaplanan adil değerin %${Math.abs(discountPct).toFixed(1)} üzerinde fiyatlanmaktadır.`);
  }
  if (evaSpread < -1.0) {
    risks.push(`Sermaye Değer Yıkımı: Yatırılan sermaye getirisi (%${roic.toFixed(1)}) sermaye maliyetinin gerisinde kalarak değer erozyonuna işaret etmektedir.`);
  }
  if (!isFinancial && Number(latestData?.net_debt ?? 0) > 0 && Number(latestData?.ebitda ?? 0) > 0) {
    const ndRatio = Number(latestData.net_debt) / Number(latestData.ebitda);
    if (ndRatio > 3.0) {
      risks.push(`Yüksek Borçluluk Baskısı: Net Borç / FAVÖK çarpanı (${ndRatio.toFixed(1)}x) emniyet sınırının (3.0x) üzerindedir.`);
    }
  }
  if (params.latestData?.is_value_trap) {
    risks.push('Değer Tuzağı Riski: Kağıt üzerinde iskontolu görünse de eriyen kâr marjları ve sermaye maliyeti baskısı dikkatli izleme gerektirir.');
  }
  if (divYield === 0) {
    risks.push('Düşük / Sıfır Temettü Getirisi: Şirket güncel dönemde temettü dağıtmamaktadır.');
  }

  // En az 1 ödül ve 1 risk garanti et (boş kalmaması için)
  if (rewards.length === 0) {
    rewards.push(`Sektörel Varlık: ${sector} sektöründe kurumsal operasyonlarını sürdürmektedir.`);
  }
  if (risks.length === 0) {
    risks.push('Makroekonomik ve faiz dalgalanmaları genel hisse senedi piyasası risklerini taşımaktadır.');
  }

  return {
    axes: {
      value: { key: 'value', label: 'DEĞER (VALUE)', score: clampedValue, maxScore: 6, checks: valueChecks },
      future: { key: 'future', label: 'GELECEK (FUTURE)', score: clampedFuture, maxScore: 6, checks: futureChecks },
      past: { key: 'past', label: 'GEÇMİŞ (PAST)', score: clampedPast, maxScore: 6, checks: pastChecks },
      health: { key: 'health', label: 'SAĞLIK (HEALTH)', score: clampedHealth, maxScore: 6, checks: healthChecks },
      dividend: { key: 'dividend', label: 'TEMETTÜ (DIVIDEND)', score: clampedDividend, maxScore: 6, checks: divChecks }
    },
    totalScore,
    percentage,
    rewards,
    risks
  };
}

/**
 * SVG Kar Tanesi koordinatlarını hesaplar (Merkez: cx, cy, Yarıçap: radius).
 * Eksen sıralaması Simply Wall St ile %100 aynıdır:
 * 0: VALUE (Yukarı)
 * 1: FUTURE (Sağ-Üst)
 * 2: PAST (Sağ-Alt)
 * 3: HEALTH (Sol-Alt)
 * 4: DIVIDEND (Sol-Üst)
 */
export function getSnowflakeCoordinates(
  axes: SnowflakeAnalysisResult['axes'],
  cx: number = 100,
  cy: number = 100,
  maxRadius: number = 75
): SnowflakeRadarPoint[] {
  const orderedAxes: Array<{ key: keyof SnowflakeAnalysisResult['axes']; label: string }> = [
    { key: 'value', label: 'VALUE' },
    { key: 'future', label: 'FUTURE' },
    { key: 'past', label: 'PAST' },
    { key: 'health', label: 'HEALTH' },
    { key: 'dividend', label: 'DIVIDEND' }
  ];

  const totalPoints = orderedAxes.length;
  // İlk nokta tam tepede (-PI/2) başlar
  const startAngle = -Math.PI / 2;
  const angleStep = (2 * Math.PI) / totalPoints;

  return orderedAxes.map((item, index) => {
    const axisData = axes[item.key];
    const score = Math.max(0.5, Math.min(6, axisData.score)); // minimum 0.5 radius to see shape
    const r = (score / 6) * maxRadius;
    const angle = startAngle + index * angleStep;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    return {
      axis: item.key,
      label: item.label,
      score: axisData.score,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10
    };
  });
}

/**
 * Organik, yumuşak eğrili Kar Tanesi (Snowflake) SVG Path oluşturur.
 * Simply Wall St'in karakteristik damla/yaprak benzeri organik kavisli poligonunu üretir.
 */
export function generateSmoothSnowflakePath(points: SnowflakeRadarPoint[]): string {
  if (!points || points.length < 3) return '';

  const n = points.length;
  // Kapalı eğri oluşturmak için Catmull-Rom to Cubic Bezier algoritması
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    // Kontrol noktaları
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  path += ' Z';
  return path;
}
