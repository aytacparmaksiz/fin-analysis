import type { SavedReport } from './report-resolver.ts';
import { parseFinancialNumber } from './valuation.ts';

export type InvestmentThemeId = 
  | 'GROWTH' 
  | 'DEEP_VALUE' 
  | 'DEFENSIVE' 
  | 'TURNAROUND' 
  | 'HIGH_ROIC' 
  | 'CASH_COW'
  | 'AVOID';

export interface InvestmentThemeDefinition {
  id: InvestmentThemeId;
  name: string;
  shortLabel: string;
  iconTag: string;
  colorClass: string;
  badgeClass: string;
  description: string;
  criteriaSummary: string;
}

export interface CompanyThemeMatch {
  themeId: InvestmentThemeId;
  themeName: string;
  shortLabel: string;
  iconTag: string;
  badgeClass: string;
  reason: string;
  metricLabel: string;
  metricValue: string;
}

export const INVESTMENT_THEMES: Record<InvestmentThemeId, InvestmentThemeDefinition> = {
  GROWTH: {
    id: 'GROWTH',
    name: 'Hızlı Büyüme Potansiyeli',
    shortLabel: 'Hızlı Büyüme',
    iconTag: 'Rocket',
    colorClass: 'text-emerald-400',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80',
    description: 'Hasılat ve operasyonel kârı sektör ortalamasının üzerinde büyüyen, pazar payını genişleten büyüme liderleri.',
    criteriaSummary: 'Yıllık Hasılat/Kâr Büyümesi ≥ %30 • Pozitif FAVÖK • ROE ≥ %15 / ROIC ≥ %12',
  },
  DEEP_VALUE: {
    id: 'DEEP_VALUE',
    name: 'Varlık Zengini & Derin İskonto',
    shortLabel: 'Varlık Zengini',
    iconTag: 'Gem',
    colorClass: 'text-cyan-400',
    badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80',
    description: 'Bilanço özkaynakları ve net varlıklarına göre borsada derin iskontoyla işlem gören sağlam sermayeli şirketler.',
    criteriaSummary: 'PD/DD ≤ 1.6x • Özkaynak/Aktif ≥ %30 • Pozitif Net Defter Değeri',
  },
  DEFENSIVE: {
    id: 'DEFENSIVE',
    name: 'Defansif Nakit Kalesi',
    shortLabel: 'Nakit Kalesi',
    iconTag: 'Shield',
    colorClass: 'text-blue-400',
    badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-700/80',
    description: 'Net nakit pozisyonunda olan veya çok düşük borcu bulunan, serbest nakit akışı pozitif korunaklı şirketler.',
    criteriaSummary: 'Net Nakit Fazlası veya Net Borç/FAVÖK ≤ 1.0x • Pozitif Nakit Akışı (FCF/OCF)',
  },
  TURNAROUND: {
    id: 'TURNAROUND',
    name: 'Operasyonel Toparlanma (Turnaround)',
    shortLabel: 'Toparlanma',
    iconTag: 'RefreshCw',
    colorClass: 'text-amber-400',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-700/80',
    description: 'Geçmiş dönemlerdeki zarar veya marj daralması sonrası son çeyreklerde kârlılığa dönüş yapan toparlanma hikayeleri.',
    criteriaSummary: 'Zarardan Kâra Geçiş veya Çeyreklik Marjlarda Belirgin Toparlanma',
  },
  HIGH_ROIC: {
    id: 'HIGH_ROIC',
    name: 'Sermaye Verimliliği Şampiyonu',
    shortLabel: 'Yüksek ROIC',
    iconTag: 'Zap',
    colorClass: 'text-purple-400',
    badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-700/80',
    description: 'Yatırdığı sermayeden finansman maliyetinin üzerinde getiri üreterek gerçek ekonomik katma değer (EVA) yaratan şirketler.',
    criteriaSummary: 'ROIC > WACC (Pozitif EVA Makası) veya ROE ≥ %28',
  },
  CASH_COW: {
    id: 'CASH_COW',
    name: 'Nakit Akış Şampiyonu',
    shortLabel: 'Nakit Akışı',
    iconTag: 'DollarSign',
    colorClass: 'text-teal-400',
    badgeClass: 'bg-teal-950/80 text-teal-300 border-teal-700/80',
    description: 'Muhasebe kârını yüksek oranda kasaya giren serbest nakit akışına (FCF) dönüştürebilen nakit üretim makineleri.',
    criteriaSummary: 'Nakit Dönüşümü (OCF/Net Kâr) ≥ 0.90x veya FCF/Hasılat ≥ %8',
  },
  AVOID: {
    id: 'AVOID',
    name: 'Uzak Durulması Gerekenler & Yüksek Risk',
    shortLabel: 'Uzak Dur / Riskli',
    iconTag: 'AlertTriangle',
    colorClass: 'text-rose-400',
    badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-700/80',
    description: 'Değer tuzağı riski taşıyan, sermaye eritici negatif getiri üreten, aşırı borçlu veya ALMA kararı verilmiş şirketler.',
    criteriaSummary: 'ALMA Kararı • Değer Tuzağı Riski • Negatif ROIC (Sermaye Yıkımı) • Net Borç/FAVÖK > 4.5x',
  },
};

/**
 * Analiz edilmiş şirketin finansal verilerini ve rasyolarını inceleyerek
 * objektif olarak eşleştiği yatırım temalarını belirler.
 */
export function categorizeCompany(report: SavedReport): CompanyThemeMatch[] {
  const matches: CompanyThemeMatch[] = [];
  if (!report) return matches;

  const data = report.extractedData;
  const history = Array.isArray(data?.financial_history) ? data.financial_history : [];
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const prev1 = history.length > 1 ? history[history.length - 2] : null;
  const prev2 = history.length > 2 ? history[history.length - 3] : null;

  const multiples = data?.marketMultiples;
  const drivers = data?.fair_value_drivers;

  // Temel Değişkenler
  const pb = parseFinancialNumber(multiples?.pb);
  const roic = parseFinancialNumber(latest?.roic);
  const wacc = parseFinancialNumber(latest?.wacc);
  const roe = parseFinancialNumber(latest?.roe) ?? parseFinancialNumber(latest?.return_on_equity);
  const latestEbitda = parseFinancialNumber(latest?.ebitda ?? latest?.operating_profit);
  const latestNet = parseFinancialNumber(latest?.net_income);
  const latestRev = parseFinancialNumber(latest?.revenue ?? latest?.gross_written_premiums);
  const totalAssets = parseFinancialNumber(latest?.total_assets);
  const equity = parseFinancialNumber(latest?.equity);
  const netDebt = parseFinancialNumber(latest?.net_debt);
  const fcf = parseFinancialNumber(latest?.free_cash_flow);
  const ocf = parseFinancialNumber(latest?.operating_cash_flow);

  // 1. HIZLI BÜYÜME (GROWTH)
  let revGrowth = parseFinancialNumber(drivers?.revenue_growth?.value);
  let netGrowth = parseFinancialNumber(drivers?.net_income_growth?.value);

  // Sürücüler yoksa tarihsel çeyreklerden hesapla
  if (revGrowth === null && latestRev && prev1?.revenue) {
    const pRev = parseFinancialNumber(prev1.revenue);
    if (pRev && pRev > 0) {
      revGrowth = Number((((latestRev - pRev) / pRev) * 100).toFixed(1));
    }
  }

  const isGrowthCandidate = 
    ((revGrowth !== null && revGrowth >= 30) || (netGrowth !== null && netGrowth >= 30)) &&
    (latestEbitda !== null && latestEbitda > 0) &&
    ((roe !== null && roe >= 15) || (roic !== null && roic >= 12));

  if (isGrowthCandidate) {
    const growthVal = revGrowth !== null ? revGrowth : (netGrowth || 30);
    matches.push({
      themeId: 'GROWTH',
      themeName: INVESTMENT_THEMES.GROWTH.name,
      shortLabel: INVESTMENT_THEMES.GROWTH.shortLabel,
      iconTag: INVESTMENT_THEMES.GROWTH.iconTag,
      badgeClass: INVESTMENT_THEMES.GROWTH.badgeClass,
      reason: `Şirket yıllıklandırılmış bazda %${growthVal.toFixed(1)} büyüme temposuna ve güçlü operasyonel kârlılığa sahiptir.`,
      metricLabel: 'Büyüme Oranı',
      metricValue: `%${growthVal.toFixed(1)}`,
    });
  }

  // 2. VARLIK ZENGİNİ & DERİN İSKONTO (DEEP VALUE)
  const isDeepValue = 
    (pb !== null && pb > 0 && pb <= 1.6) &&
    (equity !== null && totalAssets !== null && totalAssets > 0 && (equity / totalAssets) >= 0.28) &&
    (equity > 0);

  if (isDeepValue && pb !== null && equity !== null && totalAssets !== null) {
    const eqRatio = Number(((equity / totalAssets) * 100).toFixed(1));
    matches.push({
      themeId: 'DEEP_VALUE',
      themeName: INVESTMENT_THEMES.DEEP_VALUE.name,
      shortLabel: INVESTMENT_THEMES.DEEP_VALUE.shortLabel,
      iconTag: INVESTMENT_THEMES.DEEP_VALUE.iconTag,
      badgeClass: INVESTMENT_THEMES.DEEP_VALUE.badgeClass,
      reason: `Şirket ${pb.toFixed(2)}x gibi cazip bir defter değeri çarpanı ve %${eqRatio} oranında güçlü bir özkaynak tabanına sahiptir.`,
      metricLabel: 'PD/DD Çarpanı',
      metricValue: `${pb.toFixed(2)}x`,
    });
  }

  // 3. DEFANSİF NAKİT KALESİ (DEFENSIVE CASH COW)
  const isNetCash = netDebt !== null && netDebt <= 0;
  const isLowDebt = netDebt !== null && latestEbitda !== null && latestEbitda > 0 && (netDebt / (latestEbitda * 4)) <= 1.0;
  const hasCashFlow = (fcf !== null && fcf > 0) || (ocf !== null && ocf > 0);

  if ((isNetCash || isLowDebt) && hasCashFlow) {
    const debtStr = isNetCash 
      ? `Net Nakit Fazlası (${Math.abs(netDebt || 0).toLocaleString('tr-TR')} Bin TL)`
      : `Düşük Borç/FAVÖK (${(netDebt! / ((latestEbitda || 1) * 4)).toFixed(2)}x)`;
    matches.push({
      themeId: 'DEFENSIVE',
      themeName: INVESTMENT_THEMES.DEFENSIVE.name,
      shortLabel: INVESTMENT_THEMES.DEFENSIVE.shortLabel,
      iconTag: INVESTMENT_THEMES.DEFENSIVE.iconTag,
      badgeClass: INVESTMENT_THEMES.DEFENSIVE.badgeClass,
      reason: `Şirket ${debtStr} ile sağlam bir likidite kalkanına ve pozitif nakit akışına sahiptir.`,
      metricLabel: 'Borçluluk Durumu',
      metricValue: isNetCash ? 'Net Nakit Pozisyonu' : 'Düşük Borç',
    });
  }

  // 4. OPERASYONEL TOPARLANMA (TURNAROUND)
  // Geçmiş çeyreklerde eksi FAVÖK / eksi Net Kâr olup son çeyrekte pozitife geçenler
  const prevEbitda = parseFinancialNumber(prev1?.ebitda);
  const prevNet = parseFinancialNumber(prev1?.net_income);
  const prev2Net = parseFinancialNumber(prev2?.net_income);

  const hadPriorLoss = (prevEbitda !== null && prevEbitda < 0) || (prevNet !== null && prevNet < 0) || (prev2Net !== null && prev2Net < 0);
  const isNowProfitable = (latestEbitda !== null && latestEbitda > 0) && (latestNet !== null && latestNet > 0);

  if (hadPriorLoss && isNowProfitable) {
    matches.push({
      themeId: 'TURNAROUND',
      themeName: INVESTMENT_THEMES.TURNAROUND.name,
      shortLabel: INVESTMENT_THEMES.TURNAROUND.shortLabel,
      iconTag: INVESTMENT_THEMES.TURNAROUND.iconTag,
      badgeClass: INVESTMENT_THEMES.TURNAROUND.badgeClass,
      reason: 'Şirket geçmiş dönem zararlarının ardından faaliyet kârını ve net kârlılığını yeniden pozitife geçirerek toparlanma sürecine girmiştir.',
      metricLabel: 'Toparlanma Durumu',
      metricValue: 'Kâra Dönüş Başarısı',
    });
  }

  // 5. SERMAYE VERİMLİLİĞİ ŞAMPİYONU (HIGH ROIC / EVA)
  const isEvaPositive = (roic !== null && wacc !== null && roic > wacc) || (roe !== null && roe >= 28);
  if (isEvaPositive && latestEbitda !== null && latestEbitda > 0) {
    const spreadStr = (roic !== null && wacc !== null) 
      ? `ROIC %${roic.toFixed(1)} > WACC %${wacc.toFixed(1)} (+%${(roic - wacc).toFixed(1)} EVA)`
      : `ROE %${(roe || 28).toFixed(1)}`;
    matches.push({
      themeId: 'HIGH_ROIC',
      themeName: INVESTMENT_THEMES.HIGH_ROIC.name,
      shortLabel: INVESTMENT_THEMES.HIGH_ROIC.shortLabel,
      iconTag: INVESTMENT_THEMES.HIGH_ROIC.iconTag,
      badgeClass: INVESTMENT_THEMES.HIGH_ROIC.badgeClass,
      reason: `Şirket yatırdığı sermayeden finansman maliyetinin üzerinde getiri elde ederek hissedarlarına net ekonomik katma değer (${spreadStr}) üretmektedir.`,
      metricLabel: 'Sermaye Verimi',
      metricValue: spreadStr,
    });
  }

  // 6. NAKİT AKIŞ ŞAMPİYONU (CASH COW)
  const isCashConversionHigh = 
    (ocf !== null && latestNet !== null && latestNet > 0 && (ocf / latestNet) >= 0.90) ||
    (fcf !== null && latestRev !== null && latestRev > 0 && (fcf / latestRev) >= 0.08);

  if (isCashConversionHigh && ((fcf !== null && fcf > 0) || (ocf !== null && ocf > 0))) {
    const ratioStr = (ocf !== null && latestNet !== null && latestNet > 0) 
      ? `%${((ocf / latestNet) * 100).toFixed(0)} Nakit Dönüşümü`
      : `%${(((fcf || 0) / (latestRev || 1)) * 100).toFixed(1)} FCF Marjı`;
    matches.push({
      themeId: 'CASH_COW',
      themeName: INVESTMENT_THEMES.CASH_COW.name,
      shortLabel: INVESTMENT_THEMES.CASH_COW.shortLabel,
      iconTag: INVESTMENT_THEMES.CASH_COW.iconTag,
      badgeClass: INVESTMENT_THEMES.CASH_COW.badgeClass,
      reason: `Şirket elde ettiği muhasebe kârını hızla kasaya giren nakde dönüştürmekte (${ratioStr}) ve yüksek serbest nakit akışı üretmektedir.`,
      metricLabel: 'Nakit Dönüşümü',
      metricValue: ratioStr,
    });
  }

  // 7. UZAK DURULMASI GEREKENLER & YÜKSEK RİSK (AVOID)
  const isAlma = (report.decision || '').trim().toUpperCase() === 'ALMA';
  const isValueTrap = Boolean(report.isValueTrap || data?.valuation?.is_value_trap);
  const isSevereDebt = netDebt !== null && latestEbitda !== null && latestEbitda > 0 && (netDebt / (latestEbitda * 4)) > 4.5;
  const isDestroyingCapital = roic !== null && roic < 0;

  if (isAlma || isValueTrap || isSevereDebt || isDestroyingCapital) {
    const riskReason = isValueTrap
      ? 'Değer Tuzağı Riski: Kağıt üzerinde ucuz görünse de kâr marjları ve operasyonel getiri hızla erozyona uğruyor.'
      : isAlma
      ? 'Resmi Analist Kararı: ALMA (Yatırım Önerilmez, model portföy güvenlik sınırlarını aşan risk faktörleri).'
      : isSevereDebt
      ? `Kritik Borçluluk Baskısı: Net Borç / FAVÖK çarpanı (${(netDebt! / ((latestEbitda || 1) * 4)).toFixed(1)}x) emniyet tavanını aşmış durumda.`
      : 'Sermaye Değer Yıkımı: Şirketin getirisi (ROIC negatif) sermaye maliyetini karşılayamıyor.';

    matches.push({
      themeId: 'AVOID',
      themeName: INVESTMENT_THEMES.AVOID.name,
      shortLabel: INVESTMENT_THEMES.AVOID.shortLabel,
      iconTag: INVESTMENT_THEMES.AVOID.iconTag,
      badgeClass: INVESTMENT_THEMES.AVOID.badgeClass,
      reason: riskReason,
      metricLabel: 'Risk Durumu',
      metricValue: isValueTrap ? 'Değer Tuzağı' : isAlma ? 'ALMA Kararı' : 'Yüksek Risk',
    });
  }

  return matches;
}

/**
 * Kayıtlı tüm raporları yatırım temalarına göre gruplayıp özet istatistik çıkarır.
 */
export function getThemeSummary(reports: SavedReport[]) {
  const themeMap: Record<InvestmentThemeId, Array<{ report: SavedReport; match: CompanyThemeMatch }>> = {
    GROWTH: [],
    DEEP_VALUE: [],
    DEFENSIVE: [],
    TURNAROUND: [],
    HIGH_ROIC: [],
    CASH_COW: [],
    AVOID: [],
  };

  reports.forEach(report => {
    const matches = categorizeCompany(report);
    matches.forEach(m => {
      themeMap[m.themeId].push({ report, match: m });
    });
  });

  return themeMap;
}
