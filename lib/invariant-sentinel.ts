/**
 * lib/invariant-sentinel.ts
 * ----------------------------------------------------------------------------
 * BÜTÜNLÜK NÖBETÇİSİ (INVARIANT SENTINEL & SELF-HEALING ENGINE)
 * 
 * Amaç:
 * Uygulama çalışırken veya rapor üretilirken arka planda çalışarak;
 * 1. Gelir Tablosu, Bilanço ve Nakit Akışı verileri ile,
 * 2. Snowflake (Kar Tanesi), Değerleme Sürücüleri, DuPont ve Çarpan Kartları
 * arasındaki tüm çelişkileri (metrik, oran, büyüme, çarpan) tespit eder.
 * 
 * Kural:
 * - Çelişki tespit edildiğinde sessizce hata üretmek yerine konsola KIRMIZI UYARI basar.
 * - HER ZAMAN tescilli ve denetlenmiş mali tablo verisi lehine OTOMATİK EŞİTLEME (Self-Healing) yapar.
 * - Ekrana veya rapor çıktısına asla birbiriyle çelişen iki rakamın ulaşmasına izin vermez.
 */

import type { SnowflakeAnalysisResult, SnowflakeCheck } from './snowflake.ts';
import type { UnifiedFinancialMetrics } from './ratio-engine.ts';
import { parseFinancialNumber } from './valuation.ts';

export interface InvariantValidationContext {
  ticker: string;
  sector?: string;
  financialHistory?: any[];
  latestData?: any;
  unifiedMetrics?: UnifiedFinancialMetrics | null;
  marketMultiples?: any;
  companyMultiples?: any;
  dupontResult?: any;
  currentPrice?: number;
}

export interface InvariantViolation {
  axis: string;
  checkId: string;
  field: string;
  badValue: any;
  groundTruthValue: any;
  reason: string;
  timestamp: string;
}

export class InvariantSentinel {
  private static recordedViolations: InvariantViolation[] = [];

  /**
   * Kırmızı renkli konsol uyarısı üretir (Hem Node.js ANSI hem de Tarayıcı CSS destekli)
   */
  public static logViolation(ticker: string, checkTitle: string, badVal: any, correctVal: any, reason: string): void {
    const isBrowser = typeof window !== 'undefined';
    const message = `[INVARIANT SENTINEL] 🚨 ÇELİŞKİ TESPİT EDİLDİ (${ticker} - ${checkTitle}): Karttaki Değer (${badVal}) != Mali Tablo Gerçeği (${correctVal}). Sebep: ${reason} -> Mali tablo lehine otomatik eşitlendi (Self-Healing).`;

    if (isBrowser) {
      console.warn(
        `%c${message}`,
        'color: #ffffff; background-color: #d90429; font-weight: bold; font-size: 12px; padding: 4px 8px; border-radius: 4px; border-left: 4px solid #7f0014;'
      );
    } else {
      console.warn(`\x1b[41m\x1b[37m\x1b[1m ${message} \x1b[0m`);
    }
  }

  /**
   * Kar Tanesi (Snowflake) sonuçlarını mali tablolara ve Tek Doğruluk Kaynağına (SSOT)
   * göre denetler, çelişkileri tespit eder ve anında kendi kendini onarır (Self-Healing).
   */
  public static validateAndHealSnowflake(
    sf: SnowflakeAnalysisResult,
    ctx: InvariantValidationContext
  ): SnowflakeAnalysisResult {
    if (!sf || !sf.axes) return sf;

    const ticker = ctx.ticker || 'BIST';
    const sorted = Array.isArray(ctx.financialHistory)
      ? [...ctx.financialHistory].sort((a, b) => String(a.period || '').localeCompare(String(b.period || '')))
      : [];
    const latest = sorted.length > 0 ? sorted[sorted.length - 1] : ctx.latestData;

    // 1. GERÇEKLEŞEN NET KÂR BÜYÜMESİ MUTABAKATI
    let trueProfitGrowth: number | null = null;
    if (ctx.unifiedMetrics?.growth?.netIncomeGrowthYoY != null) {
      trueProfitGrowth = ctx.unifiedMetrics.growth.netIncomeGrowthYoY;
    } else if (sorted.length >= 2) {
      const newest = sorted[sorted.length - 1];
      const prevYearSameQ = sorted.find(d => {
        if (!newest.period || !d.period) return false;
        const y1 = Number(newest.period.slice(0, 4));
        const q1 = newest.period.slice(5);
        return d.period === `${y1 - 1}/${q1}`;
      }) || sorted[sorted.length - 2];

      const n1 = Number(newest?.net_income ?? 0);
      const n0 = Number(prevYearSameQ?.net_income ?? 0);
      if (n0 !== 0) {
        trueProfitGrowth = Number((((n1 - n0) / Math.abs(n0)) * 100).toFixed(1));
      }
    }

    if (trueProfitGrowth !== null && !isNaN(trueProfitGrowth)) {
      const fmtGrowth = (val: number) => (val >= 0 ? `+%${val.toFixed(1)}` : `-%${Math.abs(val).toFixed(1)}`);

      // 2. Eksen (Gelecek Büyüme) kontrolleri: 2.1, 2.2, 2.3
      const savingsCheck = sf.axes.future.checks.find(c => c.id === 'earnings_vs_savings');
      if (savingsCheck && savingsCheck.metricValue) {
        const currentDisplayed = parseFloat(savingsCheck.metricValue.replace(/[^0-9.-]/g, ''));
        if (Math.abs(currentDisplayed - trueProfitGrowth) >= 0.5) {
          this.logViolation(
            ticker,
            savingsCheck.title,
            savingsCheck.metricValue,
            fmtGrowth(trueProfitGrowth),
            'Değerleme sürücüsü veya yapay varsayım, gerçekleşen mali tablo net kâr büyümesini ezmiş.'
          );
          savingsCheck.metricValue = fmtGrowth(trueProfitGrowth);
          savingsCheck.passed = trueProfitGrowth >= 32.0;
          savingsCheck.detail = savingsCheck.passed
            ? `Öngörülen net kâr artış ivmesi (%${trueProfitGrowth.toFixed(1)}), risksiz faiz ve sermaye koruma eşiğinin (%32.0) üzerindedir.`
            : `Beklenen kâr büyümesi (%${trueProfitGrowth.toFixed(1)}), risksiz getiri eşiğinin (%32.0) gerisindedir.`;
        }
      }

      const marketGrowthCheck = sf.axes.future.checks.find(c => c.id === 'earnings_vs_market');
      if (marketGrowthCheck && marketGrowthCheck.metricValue) {
        const curVal = parseFloat(marketGrowthCheck.metricValue.replace(/[^0-9.-]/g, ''));
        if (Math.abs(curVal - trueProfitGrowth) >= 0.5) {
          this.logViolation(
            ticker,
            marketGrowthCheck.title,
            marketGrowthCheck.metricValue,
            fmtGrowth(trueProfitGrowth),
            'Piyasaya göre kâr büyümesi kartında mali tablo verisi dışındaki varsayım ezildi.'
          );
          marketGrowthCheck.metricValue = fmtGrowth(trueProfitGrowth);
          marketGrowthCheck.passed = trueProfitGrowth >= 25.0;
          marketGrowthCheck.detail = marketGrowthCheck.passed
            ? `Şirketin kâr büyümesi (%${trueProfitGrowth.toFixed(1)}), BIST genel piyasa büyüme medyanının (%25.0) üzerindedir.`
            : `Kâr büyümesi (%${trueProfitGrowth.toFixed(1)}), genel piyasa kâr büyüme medyanının (%25.0) altındadır.`;
        }
      }

      const highGrowthCheck = sf.axes.future.checks.find(c => c.id === 'high_growth_earnings');
      if (highGrowthCheck && highGrowthCheck.metricValue) {
        const curVal = parseFloat(highGrowthCheck.metricValue.replace(/[^0-9.-]/g, ''));
        if (Math.abs(curVal - trueProfitGrowth) >= 0.5) {
          this.logViolation(
            ticker,
            highGrowthCheck.title,
            highGrowthCheck.metricValue,
            fmtGrowth(trueProfitGrowth),
            'Yüksek hızlı kâr büyümesi kartı gerçek mali tabloya eşitlendi.'
          );
          highGrowthCheck.metricValue = fmtGrowth(trueProfitGrowth);
          highGrowthCheck.passed = trueProfitGrowth >= 35.0;
          highGrowthCheck.detail = highGrowthCheck.passed
            ? `Yıllık kâr artış projeksiyonu (%${trueProfitGrowth.toFixed(1)}) yüksek büyüme bandında (%35+) güçlü seyretmektedir.`
            : `Kâr artış projeksiyonu (%${trueProfitGrowth.toFixed(1)}), yüksek büyüme eşiğinin (%35) altındadır.`;
        }
      }

      // 3. Eksen (Geçmiş Performans) kâr kontrolleri: 3.4, 3.5
      const accelCheck = sf.axes.past.checks.find(c => c.id === 'accelerating_growth');
      if (accelCheck && accelCheck.metricValue) {
        const curVal = parseFloat(accelCheck.metricValue.replace(/[^0-9.-]/g, ''));
        if (Math.abs(curVal - trueProfitGrowth) >= 0.5) {
          accelCheck.metricValue = `${fmtGrowth(trueProfitGrowth)} Son Dönem`;
        }
      }

      const pastIndCheck = sf.axes.past.checks.find(c => c.id === 'earnings_vs_industry');
      if (pastIndCheck && pastIndCheck.metricValue) {
        const curVal = parseFloat(pastIndCheck.metricValue.replace(/[^0-9.-]/g, ''));
        if (Math.abs(curVal - trueProfitGrowth) >= 0.5) {
          pastIndCheck.metricValue = fmtGrowth(trueProfitGrowth);
          pastIndCheck.passed = trueProfitGrowth >= 20.0;
        }
      }
    }

    // 2. F/K veya GYO İÇİN PD/DD ÇARPANLARI MUTABAKATI
    const isReit = ctx.sector === 'REIT' || ctx.latestData?.sector === 'REIT' || ctx.unifiedMetrics?.sector === 'REIT';
    if (isReit) {
      const truePb = ctx.companyMultiples?.multiples?.pb?.companyValue ?? ctx.marketMultiples?.pb ?? ctx.unifiedMetrics?.valuation?.pb ?? null;
      if (truePb !== null && truePb > 0) {
        for (const checkId of ['pe_vs_peers', 'pe_vs_industry', 'pe_vs_fair']) {
          const chk = sf.axes.value.checks.find(c => c.id === checkId);
          if (chk && chk.metricValue && chk.metricValue !== '—') {
            const curVal = parseFloat(chk.metricValue.replace(/[^0-9.-]/g, ''));
            if (!isNaN(curVal) && Math.abs(curVal - truePb) >= 0.05) {
              this.logViolation(
                ticker,
                chk.title,
                chk.metricValue,
                `${truePb.toFixed(2)}x`,
                'GYO PD/DD çarpanı canlı piyasa/İş Yatırım çarpanıyla çelişiyordu.'
              );
              chk.metricValue = `${truePb.toFixed(2)}x`;
              const threshVal = parseFloat((chk.threshold || '').replace(/[^0-9.-]/g, ''));
              if (!isNaN(threshVal) && threshVal > 0) {
                chk.passed = truePb <= threshVal;
              }
            }
          }
        }
      }
    } else {
      const truePe = ctx.companyMultiples?.multiples?.pe?.companyValue ?? ctx.marketMultiples?.pe ?? ctx.unifiedMetrics?.valuation?.pe ?? null;
      if (truePe !== null && truePe > 0) {
        for (const checkId of ['pe_vs_peers', 'pe_vs_industry', 'pe_vs_fair']) {
          const chk = sf.axes.value.checks.find(c => c.id === checkId);
          if (chk && chk.metricValue && chk.metricValue !== '—') {
            const curVal = parseFloat(chk.metricValue.replace(/[^0-9.-]/g, ''));
            if (!isNaN(curVal) && Math.abs(curVal - truePe) >= 0.2) {
              this.logViolation(
                ticker,
                chk.title,
                chk.metricValue,
                `${truePe.toFixed(1)}x`,
                'Değerleme F/K çarpanı canlı piyasa/İş Yatırım çarpanıyla çelişiyordu.'
              );
              chk.metricValue = `${truePe.toFixed(1)}x`;
              const threshVal = parseFloat((chk.threshold || '').replace(/[^0-9.-]/g, ''));
              if (!isNaN(threshVal) && threshVal > 0) {
                chk.passed = truePe <= threshVal;
              }
            }
          }
        }
      }
    }

    // 3. ROE (ÖZSERMAYE KÂRLILIĞI) MUTABAKATI
    const trueRoe = ctx.unifiedMetrics?.dupont?.calculatedRoe ?? ctx.unifiedMetrics?.margins?.roe ?? ctx.dupontResult?.calculatedRoe ?? null;
    if (trueRoe !== null && trueRoe > 0) {
      const roeCheck = sf.axes.past.checks.find(c => c.id === 'high_historical_roe');
      if (roeCheck && roeCheck.metricValue) {
        const curVal = parseFloat(roeCheck.metricValue.replace(/[^0-9.-]/g, ''));
        if (!isNaN(curVal) && Math.abs(curVal - trueRoe) >= 0.5) {
          this.logViolation(
            ticker,
            roeCheck.title,
            roeCheck.metricValue,
            `%${trueRoe.toFixed(1)}`,
            'Snowflake gerçekleşen ROE, DuPont 5 aşamalı kârlılık ayrıştırmasıyla uyuşmuyordu.'
          );
          roeCheck.metricValue = `%${trueRoe.toFixed(1)} Gerçekleşen ROE`;
          roeCheck.passed = trueRoe >= 20.0;
        }
      }

      // Gelecek ROE kontrolünü de hizala
      const futureRoeCheck = sf.axes.future.checks.find(c => c.id === 'future_roe');
      if (futureRoeCheck && futureRoeCheck.metricValue) {
        const curFutVal = parseFloat(futureRoeCheck.metricValue.replace(/[^0-9.-]/g, ''));
        if (!isNaN(curFutVal) && curFutVal < trueRoe) {
          futureRoeCheck.metricValue = `%${trueRoe.toFixed(1)} İleri ROE`;
          futureRoeCheck.passed = trueRoe >= 20.0;
        }
      }
    }

    // 4. CARİ ORAN (LİKİDİTE) MUTABAKATI
    const trueCurrentRatio = ctx.unifiedMetrics?.liquidity?.currentRatio ?? (
      latest?.current_assets && latest?.current_liabilities && latest.current_liabilities > 0
        ? Number((latest.current_assets / latest.current_liabilities).toFixed(2))
        : null
    );
    if (trueCurrentRatio !== null && trueCurrentRatio > 0) {
      const crCheck = sf.axes.health.checks.find(c => c.id === 'short_term_liabilities');
      if (crCheck && crCheck.metricValue && crCheck.metricValue.includes('Cari Oran')) {
        const curVal = parseFloat(crCheck.metricValue.replace(/[^0-9.-]/g, ''));
        if (!isNaN(curVal) && Math.abs(curVal - trueCurrentRatio) >= 0.05) {
          this.logViolation(
            ticker,
            crCheck.title,
            crCheck.metricValue,
            `${trueCurrentRatio.toFixed(2)}x`,
            'Cari oran bilançodaki dönen varlık / kısa vadeli borç ile çelişiyordu.'
          );
          crCheck.metricValue = `Cari Oran: ${trueCurrentRatio.toFixed(2)}x`;
          crCheck.passed = trueCurrentRatio >= 1.0;
        }
      }
    }

    // 5. NET BORÇ / FAVÖK (NET DEBT / EBITDA) TTM MUTABAKATI
    const trueNdEbitda = ctx.unifiedMetrics?.liquidity?.netDebtToEbitda ?? null;
    if (trueNdEbitda !== null && !isNaN(trueNdEbitda)) {
      for (const checkId of ['debt_level', 'reducing_debt']) {
        const chk = sf.axes.health.checks.find(c => c.id === checkId);
        if (chk && chk.metricValue && (chk.metricValue.includes('Net Borç / FAVÖK') || chk.metricValue.includes('Kontrollü Borç'))) {
          const curVal = parseFloat(chk.metricValue.replace(/[^0-9.-]/g, ''));
          if (!isNaN(curVal) && Math.abs(curVal - trueNdEbitda) >= 0.2) {
            this.logViolation(
              ticker,
              chk.title,
              chk.metricValue,
              `${trueNdEbitda.toFixed(1)}x`,
              'Net Borç / FAVÖK çarpanı kurumsal TTM FAVÖK yerine tek ara çeyreklik verisiyle hesaplanıyordu.'
            );
            chk.metricValue = checkId === 'debt_level'
              ? `Net Borç / FAVÖK: ${trueNdEbitda.toFixed(1)}x`
              : `Kontrollü Borç: ${trueNdEbitda.toFixed(1)}x`;
            chk.passed = trueNdEbitda <= 2.5;
          }
        }
      }
    }

    // 6. KÂR KALİTESİ VE NAKİT DÖNÜŞÜMÜ (TTM OCF / NET KÂR) MUTABAKATI
    const trueCashConvRatio = ctx.unifiedMetrics?.cashQuality?.cashConversionRatio ?? null;
    if (trueCashConvRatio !== null && !isNaN(trueCashConvRatio)) {
      const chk = sf.axes.past.checks.find(c => c.id === 'quality_earnings');
      if (chk && chk.metricValue && chk.metricValue.includes('Nakit Dönüşümü')) {
        const curVal = parseFloat(chk.metricValue.replace(/[^0-9.-]/g, ''));
        const trueCashConvPct = Math.round(trueCashConvRatio * 100);
        if (!isNaN(curVal) && Math.abs(curVal - trueCashConvPct) >= 5) {
          this.logViolation(
            ticker,
            chk.title,
            chk.metricValue,
            `Nakit Dönüşümü: %${trueCashConvPct}`,
            'Nakit dönüşüm oranı TTM kümülatif nakit akışları yerine tek çeyreklik veriden sapıyordu.'
          );
          chk.metricValue = `Nakit Dönüşümü: %${trueCashConvPct}`;
          chk.passed = trueCashConvPct >= 70;
        }
      }
    }

    // 7. NET KÂR MARJI (TTM ÇEKİRDEK MARJ) MUTABAKATI
    const trueNetMargin = ctx.unifiedMetrics?.margins?.netMargin ?? null;
    if (trueNetMargin !== null && !isNaN(trueNetMargin)) {
      const chk = sf.axes.past.checks.find(c => c.id === 'growing_profit_margin');
      if (chk && chk.metricValue && chk.metricValue.includes('Kâr Marjı')) {
        const curVal = parseFloat(chk.metricValue.replace(/[^0-9.-]/g, ''));
        if (!isNaN(curVal) && Math.abs(curVal - trueNetMargin) >= 0.5) {
          this.logViolation(
            ticker,
            chk.title,
            chk.metricValue,
            `%${trueNetMargin.toFixed(1)} Kâr Marjı`,
            'Net kâr marjı 12A TTM net marjı yerine tek çeyreklik marj üzerinden hesaplanıyordu.'
          );
          chk.metricValue = `%${trueNetMargin.toFixed(1)} Kâr Marjı`;
          chk.passed = trueNetMargin >= 10.0;
        }
      }
    }

    // 8. NET NAKİT VE FAİZ KARŞILAMA MUTABAKATI
    const isNetCashOrSurplus = (ctx.unifiedMetrics?.balanceSheet?.netDebt != null && ctx.unifiedMetrics.balanceSheet.netDebt <= 0) ||
      (ctx.unifiedMetrics?.dupont?.interestBurden != null && ctx.unifiedMetrics.dupont.interestBurden >= 1.0);
    if (isNetCashOrSurplus) {
      const icrCheck = sf.axes.health.checks.find(c => c.id === 'interest_coverage');
      if (icrCheck && !icrCheck.passed) {
        this.logViolation(
          ticker,
          icrCheck.title,
          icrCheck.metricValue,
          'Net Nakit Fazlası / Net Faiz Geliri',
          'Şirket net nakit fazlasında veya net finansman geliri pozisyonundayken faiz karşılama haksız yere başarısız sayılıyordu.'
        );
        icrCheck.metricValue = (ctx.unifiedMetrics?.balanceSheet?.netDebt != null && ctx.unifiedMetrics.balanceSheet.netDebt <= 0)
          ? 'Net Nakit Fazlası'
          : 'Net Faiz Geliri';
        icrCheck.passed = true;
      }
    }

    // 9. SKORLARI YENİDEN HESAPLA (Self-Healing Sonrası Puan Doğrulaması)
    for (const axisKey of Object.keys(sf.axes) as Array<keyof typeof sf.axes>) {
      const axis = sf.axes[axisKey];
      axis.score = axis.checks.filter(c => c.passed).length;
    }
    sf.totalScore = Object.values(sf.axes).reduce((sum, a) => sum + a.score, 0);
    sf.percentage = Math.round((sf.totalScore / 30) * 100);

    return sf;
  }

  /**
   * Değerleme sürücülerini (valuation drivers) mali tablolara göre doğrular ve iyileştirir
   */
  public static validateAndHealDrivers(drivers: any, ctx: InvariantValidationContext): any {
    if (!drivers) return drivers;
    const ticker = ctx.ticker || 'BIST';

    // Net Kâr Büyümesi Sürücüsü Kontrolü
    const trueProfitGrowth = ctx.unifiedMetrics?.growth?.netIncomeGrowthYoY;
    if (trueProfitGrowth != null && !isNaN(trueProfitGrowth)) {
      const currentDriverVal = Number(drivers?.net_income_growth?.value);
      if (!isNaN(currentDriverVal) && Math.abs(currentDriverVal - trueProfitGrowth) >= 5.0 && !drivers.net_income_growth?.isCustomGuidance) {
        this.logViolation(
          ticker,
          'Net Kâr Büyümesi Değer Sürücüsü',
          `%${currentDriverVal}`,
          `%${trueProfitGrowth}`,
          'Değer sürücüsü baz değeri, mali tablodaki gerçekleşen büyümeden kopmuş.'
        );
        drivers.net_income_growth.value = trueProfitGrowth;
        drivers.net_income_growth.sourceExplanation = `Mali tablolardan tescilli gerçekleşen YoY net kâr büyümesi: %${trueProfitGrowth.toFixed(1)}`;
      }
    }

    return drivers;
  }
}
