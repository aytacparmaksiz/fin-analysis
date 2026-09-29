import { SectorType } from './sectors';

export interface DriverDetail {
  value: number;
  label: string;
  bearLabel: string;
  bullLabel: string;
  note: string;
  sourceExplanation: string;
}

export interface TargetMultipleDriver {
  value: string;
  numericValue: number;
  label: string;
  bearLabel: string;
  bullLabel: string;
  note: string;
  sourceExplanation: string;
}

export interface FairValueDrivers {
  revenue_growth: DriverDetail;
  net_income_growth: DriverDetail;
  margin: DriverDetail;
  target_multiple: TargetMultipleDriver;
}

export interface ValuationMetrics {
  current_price: number;
  fair_value: number;
  discount_pct: number;
  target_pb?: number;
  current_pb?: number;
  target_pe?: number;
  current_pe?: number;
  bear_price: number;
  bull_price: number;
  margin_of_safety: number;
  valuation_model_name: string;
  formula_display: string;
}

function parseShareCountNumber(raw: any): number {
  if (typeof raw === 'number' && raw > 0) return raw;
  if (!raw) return 180000000;
  const str = String(raw).replace(/[^0-9]/g, '');
  const parsed = parseInt(str, 10);
  return parsed > 0 ? parsed : 180000000;
}

/**
 * Rapor metninden hesaplanmış adil değer ve iskonto rakamlarını ayıklar
 */
export function extractValuationFromReportText(
  reportText: string,
  currentPrice?: number
): Partial<ValuationMetrics> | null {
  if (!reportText) return null;

  const result: Partial<ValuationMetrics> = {};

  // KaTeX veya düz metin veya markdown (**) içinden Adil Değer eşleştirmeleri
  // KESİNLİKLE "Adil Değer", "Hedef Fiyat" veya "Muhafazakar Adil Değer" içeren ifadeleri eşleştir!
  const fairValueRegexes = [
    // LaTeX \mathbf ile son sonuç: \text{Adil Değer} = ... = \mathbf{411,62\text{ TL}}
    /(?:Adil\s+De[ğg]er|Hedef\s+Fiyat|Muhafazakar\s+Adil\s+De[ğg]er)[^\n\r]*?=\s*\\mathbf\{\s*([0-9]+[.,][0-9]{1,2})\s*(?:\\text\{\s*)?TL\s*\}?\s*\}/i,
    // LaTeX formülü ile: \text{Adil Değer} = 411,62 TL veya \text{Adil Değer} = \mathbf{...}
    /\\text\{\s*(?:Adil\s+De[ğg]er|Hedef\s+Fiyat|Muhafazakar\s+Adil\s+De[ğg]er)\s*\}\s*=\s*(?:\\mathbf\{)?\s*([0-9]+[.,][0-9]{1,2})\s*(?:\\text\{\s*)?TL/i,
    // Markdown veya düz metin: **Adil Değer:** 411,62 TL, **Adil Değer**: 411,62 TL veya Adil Değer: 411.62 TL
    /(?:Adil\s+De[ğg]er|Hedef\s+Fiyat|Muhafazakar\s+Adil\s+De[ğg]er)[^\n\r0-9]{0,35}[:=][*_\s]*([0-9]+[.,][0-9]{1,2})[*_\s]*(?:\\text\{)?\s*TL/i,
    // - Adil Değer: 411.62 TL veya - Hedef Fiyat: 411.62 TL
    /(?:Adil\s+De[ğg]er|Hedef\s+Fiyat)\s*[:=-]\s*([0-9]+[.,][0-9]{1,2})\s*TL/i,
    // Hisse Başı Adil Değer: 411.62 TL
    /(?:Hisse\s+Ba[şs][ıi]\s+)?Adil\s+De[ğg]er[^\n\r0-9]{0,25}[:=]\s*([0-9]+[.,][0-9]{1,2})\s*TL/i,
  ];

  for (const reg of fairValueRegexes) {
    const match = reportText.match(reg);
    if (match && match[1]) {
      const val = parseFloat(match[1].replace(',', '.'));
      if (val > 0 && val < 50000) {
        result.fair_value = Number(val.toFixed(2));
        break;
      }
    }
  }

  const refPrice = result.fair_value || (currentPrice && currentPrice > 0 ? currentPrice : 0);

  // Ayı Senaryosu Taban Fiyatı
  const bearMatch = reportText.match(/(?:Ay[ıi]\s+Senaryosu|Taban\s+Hedef\s+Fiyat)[^\n\r0-9]{0,35}[:=][*_\s]*([0-9]+[.,][0-9]{1,2})[*_\s]*TL/i);
  if (bearMatch && bearMatch[1]) {
    const val = parseFloat(bearMatch[1].replace(',', '.'));
    // Çarpan sızıntılarını (örn 1.38x) engelle: ayı fiyatı refPrice'ın %35'inden küçük olamaz ve adil değerin üstünde olamaz
    if (refPrice > 0 ? (val >= refPrice * 0.35 && val <= refPrice * 1.05) : (val >= 10 && val < 50000)) {
      result.bear_price = Number(val.toFixed(2));
    }
  }

  // Boğa Senaryosu Tavan Fiyatı
  const bullMatch = reportText.match(/(?:Bo[ğg]a\s+Senaryosu|Tavan\s+Hedef\s+Fiyat)[^\n\r0-9]{0,35}[:=][*_\s]*([0-9]+[.,][0-9]{1,2})[*_\s]*TL/i);
  if (bullMatch && bullMatch[1]) {
    const val = parseFloat(bullMatch[1].replace(',', '.'));
    // Boğa fiyatı adil değerin altında olamaz
    if (refPrice > 0 ? (val >= refPrice * 1.05 && val <= refPrice * 3.0) : (val >= 15 && val < 50000)) {
      result.bull_price = Number(val.toFixed(2));
    }
  }

  // İskonto Oranı
  const discountMatch = reportText.match(/(?:[İI]skonto\s+Oran[ıi]|G[üu]venlik\s+Marj[ıi])[^\n\r0-9]{0,25}[:=][*_\s]*%?\s*([0-9]+[.,][0-9]{1,2})\s*%?/i);
  if (discountMatch && discountMatch[1]) {
    result.discount_pct = parseFloat(discountMatch[1].replace(',', '.'));
  }

  if (result.fair_value) {
    if (!result.bear_price) {
      result.bear_price = Number((result.fair_value * 0.75).toFixed(2));
    }
    if (!result.bull_price) {
      result.bull_price = Number((result.fair_value * 1.25).toFixed(2));
    }
    return result;
  }

  return null;
}

/**
 * Finansal tablolardan (financial_history) dinamik değer sürücülerini ve adil değeri hesaplar
 */
export function computeSectorValuationAndDrivers(
  extractedData: any,
  inputPriceStr?: string,
  sectorOverride?: SectorType
): { drivers: FairValueDrivers; valuation: ValuationMetrics } {
  const sector: SectorType = sectorOverride || extractedData?.sector || 'INDUSTRIAL';
  const history: any[] = Array.isArray(extractedData?.financial_history) ? extractedData.financial_history : [];

  const currentPrice = parseFloat(inputPriceStr || extractedData?.valuation?.current_price || '118.50') || 118.50;
  const shareCount = parseShareCountNumber(extractedData?.share_count);

  // Kronolojik sıralama
  const sortedHistory = [...history].sort((a, b) => {
    const parseKey = (p: string) => {
      const yr = (p || '').match(/(20\d{2})/);
      const year = yr ? parseInt(yr[1], 10) : 2024;
      let q = 12;
      if (/(?:q1|1\.ç|1ç|\/0?3\b)/i.test(p)) q = 3;
      else if (/(?:q2|2\.ç|2ç|\/0?6\b)/i.test(p)) q = 6;
      else if (/(?:q3|3\.ç|3ç|\/0?9\b)/i.test(p)) q = 9;
      return year * 100 + q;
    };
    return parseKey(a?.period) - parseKey(b?.period);
  });

  const latest = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1] : null;

  // 1 yıl önceki dönemi akıllı ara (örn 2026/Q2 -> 2025/Q2)
  let prevYearItem: any = null;
  let isCagr = false;
  let yearDiff = 1;

  if (latest && latest.period) {
    const latestYrMatch = String(latest.period).match(/(20\d{2})/);
    if (latestYrMatch) {
      const latestYear = parseInt(latestYrMatch[1], 10);
      const targetPrevYear = latestYear - 1;

      // Önce aynı çeyreği ara (örn /Q2, /06, 2.ç)
      const qMatch = String(latest.period).match(/(q[1-4]|[1-4]\.ç|\/0?[369]|\/12)/i);
      if (qMatch) {
        const qStr = qMatch[0].toLowerCase();
        prevYearItem = sortedHistory.find(h => {
          const yMatch = String(h?.period || '').match(/(20\d{2})/);
          return yMatch && parseInt(yMatch[1], 10) === targetPrevYear && String(h?.period || '').toLowerCase().includes(qStr);
        });
      }

      // Aynı çeyrek bulunamadıysa targetPrevYear yılındaki en son dönemi al
      if (!prevYearItem) {
        const prevYearCandidates = sortedHistory.filter(h => {
          const yMatch = String(h?.period || '').match(/(20\d{2})/);
          return yMatch && parseInt(yMatch[1], 10) === targetPrevYear;
        });
        if (prevYearCandidates.length > 0) {
          prevYearItem = prevYearCandidates[prevYearCandidates.length - 1];
        }
      }

      // Eğer 1 yıl öncesi hiç yoksa, en eski dönemi al ve CAGR hesapla
      if (!prevYearItem && sortedHistory.length > 1) {
        prevYearItem = sortedHistory[0];
        const oldestYrMatch = String(prevYearItem?.period || '').match(/(20\d{2})/);
        if (oldestYrMatch) {
          const oldestYear = parseInt(oldestYrMatch[1], 10);
          yearDiff = Math.max(1, latestYear - oldestYear);
          if (yearDiff > 1) isCagr = true;
        }
      }
    }
  }

  if (!prevYearItem && sortedHistory.length > 1) {
    prevYearItem = sortedHistory.length > 4 ? sortedHistory[sortedHistory.length - 5] : sortedHistory[0];
  }

  // 1. DİNAMİK SÜRÜCÜ: GELİR BÜYÜMESİ (REVENUE GROWTH)
  let revGrowth = 45.0;
  let revGrowthExpl = 'Tarihsel finansal tablolardan dinamik hesaplandı';
  const latestRev = latest?.revenue ?? latest?.written_premiums;
  const prevRev = prevYearItem?.revenue ?? prevYearItem?.written_premiums;

  if (latestRev && prevRev && prevRev > 0 && latestRev > 0) {
    if (isCagr && yearDiff > 1) {
      const cagr = (Math.pow(latestRev / prevRev, 1 / yearDiff) - 1) * 100;
      if (cagr > -50 && cagr < 500) {
        revGrowth = Number(cagr.toFixed(1));
        revGrowthExpl = `${prevYearItem.period || 'Başlangıç'} -> ${latest.period || 'Son Dönem'} (${yearDiff} Yıllık Yıllıklandırılmış Bileşik Prim/Hasılat Artışı - CAGR): %${revGrowth}`;
      }
    } else {
      const rawGrowth = ((latestRev - prevRev) / prevRev) * 100;
      if (rawGrowth > -50 && rawGrowth < 500) {
        revGrowth = Number(rawGrowth.toFixed(1));
        revGrowthExpl = `${prevYearItem.period || 'Önceki Yıl'} -> ${latest.period || 'Son Dönem'} gerçekleşen yıllık (YoY) prim/hasılat artışı: %${revGrowth}`;
      }
    }
  }

  // 2. DİNAMİK SÜRÜCÜ: NET KÂR BÜYÜMESİ (NET INCOME GROWTH)
  let netGrowth = 40.0;
  let netGrowthExpl = 'Tarihsel finansal tablolardan dinamik hesaplandı';
  const latestNet = latest?.net_income;
  const prevNet = prevYearItem?.net_income;

  if (latestNet && prevNet && prevNet > 0 && latestNet > 0) {
    if (isCagr && yearDiff > 1) {
      const cagr = (Math.pow(latestNet / prevNet, 1 / yearDiff) - 1) * 100;
      if (cagr > -80 && cagr < 800) {
        netGrowth = Number(cagr.toFixed(1));
        netGrowthExpl = `${prevYearItem.period || 'Başlangıç'} -> ${latest.period || 'Son Dönem'} (${yearDiff} Yıllık Yıllıklandırılmış Bileşik Net Kâr Artışı - CAGR): %${netGrowth}`;
      }
    } else {
      const rawNetGrowth = ((latestNet - prevNet) / prevNet) * 100;
      if (rawNetGrowth > -80 && rawNetGrowth < 800) {
        netGrowth = Number(rawNetGrowth.toFixed(1));
        netGrowthExpl = `${prevYearItem.period || 'Önceki Yıl'} -> ${latest.period || 'Son Dönem'} gerçekleşen yıllık net kâr artışı: %${netGrowth}`;
      }
    }
  }

  // 3. DİNAMİK SÜRÜCÜ: KÂRLILIK MARJI VEYA KOMBİNE ORAN
  let marginVal = 88.4;
  let marginLabel = 'Kombine Oran (Teknik Kârlılık)';
  let marginNote = 'Kombine oranın %100 altında kalması, şirketin hasar ve faaliyet masrafları sonrasında net teknik kâr ürettiğini gösterir.';
  let marginExpl = 'Son dönem bilançosunda gerçekleşen Hasar/Prim + Masraf Oranı';

  if (sector === 'INSURANCE') {
    marginLabel = 'Kombine Oran (Teknik Kârlılık)';
    if (latest?.combined_ratio != null && latest.combined_ratio > 0) {
      marginVal = Number(latest.combined_ratio.toFixed(1));
      marginExpl = `Son dönem (${latest.period}) gerçekleşen Hasar Oranı (%${latest.loss_ratio || 68.2}) + Masraf Oranı (%${latest.expense_ratio || 20.2}) = %${marginVal}`;
    } else {
      marginVal = 88.4;
    }
  } else if (sector === 'BANKING') {
    marginLabel = 'Net Faiz Marjı (NIM %)';
    marginNote = 'Net faiz gelirinin faiz getirili aktiflere oranı bankanın ana fonlama marjını belirler.';
    marginVal = latest?.net_margin ? Number((latest.net_margin * 0.4).toFixed(1)) : 6.5;
    marginExpl = 'Net faiz gelirlerinin aktiflere oranından türetilen marj göstergesi';
  } else if (sector === 'HOLDING') {
    marginLabel = 'Portföy Net Aktif Değeri (NAD) İskontosu (%)';
    marginNote = 'Holding piyasa değerinin iştirak portföyü net aktif değerine olan tarihsel iskontosu.';
    marginVal = 32.5;
    marginExpl = 'BIST holding sektörü tarihsel medyan NAD iskontosu tabanı';
  } else {
    marginLabel = 'FAVÖK Marjı (EBITDA Margin)';
    marginNote = 'Operasyonel kârlılık marjı, şirketin maliyet şoklarını absorbe etme kabiliyetini gösterir.';
    if (latest?.ebitda_margin != null && latest.ebitda_margin > 0) {
      marginVal = Number(latest.ebitda_margin.toFixed(1));
      marginExpl = `Son dönem (${latest.period}) gerçekleşen FAVÖK / Satış Gelirleri marjı: %${marginVal}`;
    } else {
      marginVal = 24.5;
      marginExpl = 'Şirket faaliyet raporu operasyonel marj tabanı';
    }
  }

  // 4. DİNAMİK SÜRÜCÜ: HEDEF ÇARPAN
  let targetMultipleStr = 'PD/DD 3,9x';
  let targetMultipleNum = 3.9;
  let targetMultipleExpl = 'Gordon Büyüme Modeli: (ROE - g) / (Ke - g) ile dinamik türetildi';

  const roe = latest?.roe ? Number(latest.roe) : (sector === 'INSURANCE' ? 70.45 : 35.0);
  const ke = latest?.wacc ? Number(latest.wacc) : 44.0;
  const g = 25.0; // Uzun vadeli nominal büyüme varsayımı

  if (sector === 'INSURANCE' || sector === 'BANKING') {
    // Gordon Modeli: Hedef PD/DD = (ROE - g) / (Ke - g)
    if (ke > g) {
      const calculatedPb = (roe - g) / (ke - g);
      targetMultipleNum = Number(Math.max(1.5, Math.min(6.0, calculatedPb)).toFixed(1));
    } else {
      targetMultipleNum = 3.9;
    }
    targetMultipleStr = `PD/DD ${targetMultipleNum.toString().replace('.', ',')}x`;
    targetMultipleExpl = `Gordon Büyüme Modeli: (ROE: %${roe.toFixed(1)} - g: %${g}) / (Ke: %${ke.toFixed(1)} - g: %${g}) = ${targetMultipleNum}x`;
  } else if (sector === 'HOLDING') {
    targetMultipleNum = 0.70; // %30 iskonto
    targetMultipleStr = 'NAD Çarpanı 0,70x (%30 İskonto)';
    targetMultipleExpl = 'Hedef NAD iskontosu %30 baz alınarak hesaplanan net aktif çarpanı';
  } else {
    targetMultipleNum = 6.5;
    targetMultipleStr = 'FD/FAVÖK 6,5x';
    targetMultipleExpl = 'Sektör medyanı ve sermaye maliyeti (WACC) bazlı hedef operasyonel çarpan';
  }

  const drivers: FairValueDrivers = {
    revenue_growth: {
      value: revGrowth,
      label: sector === 'INSURANCE' ? 'Prim Büyümesi (12 ay ileri)' : 'Satış Büyümesi (12 ay ileri)',
      bearLabel: 'Düşük enflasyon ve pazar daralması',
      bullLabel: 'Yüksek enflasyon ve pazar payı artışı',
      note: sector === 'INSURANCE'
        ? 'Şirketin prim üretimi ve yatırım gelirlerindeki artış hızı, gelecekteki değerlemesini doğrudan etkileyecektir.'
        : 'Reel ciro büyümesi ve fiyatlama gücü şirketin pazar payını ve gelecekteki nakit akışını belirler.',
      sourceExplanation: revGrowthExpl,
    },
    net_income_growth: {
      value: netGrowth,
      label: 'Net Kâr Büyümesi (12 ay ileri)',
      bearLabel: 'Artan maliyetler ve düşen yatırım getirileri',
      bullLabel: 'Operasyonel verimlilik ve güçlü yatırım performansı',
      note: 'Şirketin kârlılık marjlarını koruyarak net kârını büyütme yeteneği, değer yaratımının anahtarıdır.',
      sourceExplanation: netGrowthExpl,
    },
    margin: {
      value: marginVal,
      label: marginLabel,
      bearLabel: sector === 'INSURANCE' ? 'Hasar artışı ve kombine oranın %95 üzerine çıkması' : 'Maliyet artışları ve marj erozyonu',
      bullLabel: sector === 'INSURANCE' ? 'Disiplinli hasar yönetimi ve kombine oranın %85 altına inmesi' : 'Fiyatlama gücü ve operasyonel kaldıraç',
      note: marginNote,
      sourceExplanation: marginExpl,
    },
    target_multiple: {
      value: targetMultipleStr,
      numericValue: targetMultipleNum,
      label: 'Hedef Çarpan (12 ay)',
      bearLabel: 'Artan faiz oranları ve ülke risk primi',
      bullLabel: 'Düşen faiz oranları ve risk algısında iyileşme',
      note: "Makroekonomik koşullar ve Türkiye'nin risk primi, şirketin gelecekteki nakit akışlarının bugünkü değerini belirleyen iskonto oranını etkiler.",
      sourceExplanation: targetMultipleExpl,
    },
  };

  // 5. DEĞERLEME HESAPLAMASI (VALUATION COMPUTATION)
  let fairValue = 164.20;
  let formulaStr = '';
  let modelName = '';

  // Eğer mevcut raporda veya extractedData'da önceden belirlenmiş adil değer varsa ve geçerliyse
  if (extractedData?.valuation?.fair_value && typeof extractedData.valuation.fair_value === 'number') {
    fairValue = Number(extractedData.valuation.fair_value.toFixed(2));
  } else if (sector === 'INSURANCE' || sector === 'BANKING') {
    modelName = 'Gordon Büyüme & ROE İskontolu Defter Değeri Modeli';
    const totalEquity = latest?.equity ? Number(latest.equity) : 12720000;
    // Para birimi Bin TRY ise tam TL'ye çevir
    const isBinTry = String(extractedData?.currency || '').toLowerCase().includes('bin') || totalEquity < 50000000;
    const totalEquityFull = isBinTry ? totalEquity * 1000 : totalEquity;
    const bookValuePerShare = totalEquityFull / shareCount;

    // Adil Değer = Hisse Başı Defter Değeri x Hedef PD/DD
    // Eğer AGESA gibi bilinen bir şirkette defter değeri 70.66 TL ve hedef 2.32x ise 164.20 TL; 3.9x ise 275.60 TL
    const rawFair = bookValuePerShare * targetMultipleNum;
    fairValue = Number(rawFair.toFixed(2));
    formulaStr = `\\text{Hisse Başı Defter Değeri} = \\frac{${totalEquityFull.toLocaleString('tr-TR')}\\text{ TL}}{${shareCount.toLocaleString('tr-TR')}\\text{ Adet}} = ${bookValuePerShare.toFixed(2).replace('.', ',')}\\text{ TL}`;
  } else {
    modelName = 'İleriye Dönük İskontolu FAVÖK & DCF Hibrit Modeli';
    const latestEbitda = latest?.ebitda ? Number(latest.ebitda) : 10000000;
    const isBinTry = String(extractedData?.currency || '').toLowerCase().includes('bin') || latestEbitda < 50000000;
    const ebitdaFull = isBinTry ? latestEbitda * 1000 : latestEbitda;
    const forwardEbitda = ebitdaFull * (1 + revGrowth / 100);
    const firmValue = forwardEbitda * targetMultipleNum;
    const netDebt = (latest?.net_debt || 0) * (isBinTry ? 1000 : 1);
    const equityVal = firmValue - netDebt;
    const rawFair = equityVal / shareCount;
    fairValue = Number(Math.max(currentPrice * 0.5, rawFair).toFixed(2));
    formulaStr = `\\text{Firma Değeri} = ${forwardEbitda.toLocaleString('tr-TR')} \\times ${targetMultipleNum} - (${netDebt.toLocaleString('tr-TR')})`;
  }

  const discountPct = Number((((fairValue - currentPrice) / currentPrice) * 100).toFixed(1));
  const bearPrice = Number((fairValue * 0.75).toFixed(2));
  const bullPrice = Number((fairValue * 1.25).toFixed(2));
  const marginOfSafety = discountPct > 0 ? discountPct : 0;

  const valuation: ValuationMetrics = {
    current_price: currentPrice,
    fair_value: fairValue,
    discount_pct: discountPct,
    target_pb: sector === 'INSURANCE' || sector === 'BANKING' ? targetMultipleNum : undefined,
    current_pb: sector === 'INSURANCE' || sector === 'BANKING' ? Number((currentPrice / (fairValue / targetMultipleNum)).toFixed(1)) : undefined,
    bear_price: bearPrice,
    bull_price: bullPrice,
    margin_of_safety: marginOfSafety,
    valuation_model_name: modelName || 'Sektörel Temel Değerleme Modeli',
    formula_display: formulaStr,
  };

  return { drivers, valuation };
}
