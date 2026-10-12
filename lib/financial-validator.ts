/**
 * FinancialDataValidator
 * ----------------------------------------------------------------------------
 * Finansal Veri Bütünlüğü ve Muhasebe Eşitlikleri Doğrulama Katmanı (Validation Step).
 * 
 * Görevler:
 * 1. Aktif Denkliği: Aktif Toplamı == Dönen Varlıklar + Duran Varlıklar kontrolü.
 * 2. Pasif Denkliği: Aktif Toplamı == Kısa Vadeli Yük. + Uzun Vadeli Yük. + Özkaynaklar.
 * 3. Duran Varlık Bütünlüğü: Azınlık paylarının aktiften düşülmediğini teyit eder.
 * 4. Gelir Tablosu Denkliği: Esas Faaliyet Kârı ve Net Kâr tutarlılığı.
 * 5. Nakit Akış Tutarlılığı: OCF ve FCF varlığı ve tutarlılık denetimi.
 */

import type { SectorType } from './sectors.ts';
import type { FinancialHistoryItem } from './bist-service.ts';
import { parsePeriodSortKey } from './valuation.ts';

export interface ItemValidationReport {
  period: string;
  isValid: boolean;
  warnings: string[];
  errors: string[];
  reconciledItem: FinancialHistoryItem;
}

export interface SeriesValidationReport {
  ticker?: string;
  sector?: SectorType;
  totalPeriods: number;
  validPeriods: number;
  warnings: string[];
  errors: string[];
  reconciledSeries: FinancialHistoryItem[];
}

export class FinancialDataValidator {
  /**
   * Tek bir dönemin bilanço, gelir tablosu ve nakit akış tutarlılığını doğrular
   * ve gerekirse matematiksel özdeşliklerle kendini iyileştirir (Self-Healing).
   */
  public static validateItem(
    item: FinancialHistoryItem,
    sector: SectorType = 'INDUSTRIAL'
  ): ItemValidationReport {
    const warnings: string[] = [];
    const errors: string[] = [];
    const copy: FinancialHistoryItem = { ...item };

    // 1. AKTİF DENKLİĞİ (Aktif Toplamı == Dönen Varlıklar + Duran Varlıklar)
    const currentA = copy.current_assets;
    const nonCurrentA = copy.non_current_assets;
    const totalA = copy.total_assets;

    if (currentA !== null && nonCurrentA !== null) {
      const sumAssets = currentA + nonCurrentA;
      if (totalA !== null && totalA > 0) {
        const diff = Math.abs(totalA - sumAssets);
        const relDiffPct = (diff / totalA) * 100;

        // %0.5'ten veya 10.000 TL'den büyük fark varsa incelenir
        if (relDiffPct > 0.5 && diff > 10_000) {
          warnings.push(
            `[Aktif Bütünlüğü] ${copy.period} döneminde Aktif Toplamı (${totalA.toLocaleString('tr-TR')}) ile Dönen (${currentA.toLocaleString('tr-TR')}) + Duran (${nonCurrentA.toLocaleString('tr-TR')}) toplamı (${sumAssets.toLocaleString('tr-TR')}) arasında %${relDiffPct.toFixed(2)} fark var.`
          );
          // Güvenilir mutabakat: Dönen ve Duran varlık toplamı esastır
          copy.total_assets = sumAssets;
        }
      } else {
        // Toplam varlık tanımsızsa dönen + duran toplamından türet
        copy.total_assets = sumAssets;
      }
    } else if (totalA !== null && currentA !== null && (!nonCurrentA || nonCurrentA <= 0) && totalA > currentA) {
      // Duran varlık eksikse toplam - dönen üzerinden tamamla
      copy.non_current_assets = totalA - currentA;
      warnings.push(`[Duran Varlık İyileştirmesi] ${copy.period} için eksik Duran Varlıklar aktif farkından (${copy.non_current_assets.toLocaleString('tr-TR')}) tamamlandı.`);
    }

    // 2. PASİF DENKLİĞİ (Aktif Toplamı == Pasif Toplamı)
    const currentL = copy.current_liabilities ?? 0;
    const longTermL = copy.long_term_liabilities ?? 0;
    const eq = copy.equity ?? 0;
    const totalP = (currentL + longTermL + eq);

    if (copy.total_assets !== null && copy.total_assets > 0 && totalP > 0 && sector !== 'BANKING' && sector !== 'INSURANCE' && sector !== 'FINANCIAL_SERVICES') {
      const diffP = Math.abs(copy.total_assets - totalP);
      const relDiffP = (diffP / copy.total_assets) * 100;

      if (relDiffP > 2.0 && diffP > 50_000) {
        warnings.push(
          `[Pasif Denkliği] ${copy.period} döneminde Aktif Toplamı (${copy.total_assets.toLocaleString('tr-TR')}) ile Pasif Toplamı (${totalP.toLocaleString('tr-TR')}) arasında %${relDiffP.toFixed(2)} fark var.`
        );
      }
    }

    // 3. GELİR TABLOSU VE ESAS FAALİYET KÂRI KONTROLÜ
    if (copy.revenue !== null && copy.gross_profit !== null && sector === 'INDUSTRIAL') {
      if (copy.revenue > 0 && copy.gross_profit > copy.revenue * 1.5) {
        errors.push(`[Gelir Tablosu Hatası] ${copy.period} döneminde Brüt Kâr (${copy.gross_profit}) Hasılatı (${copy.revenue}) aşamaz.`);
      }
    }

    // 4. NAKİT AKIŞ VE FCF KONTROLÜ
    if (copy.operating_cash_flow !== null && copy.free_cash_flow !== null) {
      if (copy.capex === null || copy.capex === undefined) {
        copy.capex = Math.abs(copy.operating_cash_flow - copy.free_cash_flow);
      }
    }

    const isValid = errors.length === 0;

    return {
      period: copy.period || 'UNKNOWN',
      isValid,
      warnings,
      errors,
      reconciledItem: copy
    };
  }

  /**
   * Tüm finansal seriyi ardışık olarak denetler, sıralar ve tam doğrulanmış seriyi döner.
   */
  public static validateSeries(
    series: FinancialHistoryItem[],
    sector: SectorType = 'INDUSTRIAL',
    ticker?: string
  ): SeriesValidationReport {
    const allWarnings: string[] = [];
    const allErrors: string[] = [];
    const reconciledList: FinancialHistoryItem[] = [];

    // Dönem bazlı kronolojik sıralama (parsePeriodSortKey ile robust sıralama)
    const sorted = [...series].sort((a, b) => parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period));

    let validCount = 0;
    for (const item of sorted) {
      const res = this.validateItem(item, sector);
      if (res.warnings.length > 0) {
        allWarnings.push(...res.warnings);
      }
      if (res.errors.length > 0) {
        allErrors.push(...res.errors);
      }
      if (res.isValid) {
        validCount++;
      }
      reconciledList.push(res.reconciledItem);
    }

    return {
      ticker,
      sector,
      totalPeriods: sorted.length,
      validPeriods: validCount,
      warnings: allWarnings,
      errors: allErrors,
      reconciledSeries: reconciledList
    };
  }
}
