import type { SectorType } from './sectors';

export interface SynthesizedPillarEvidence {
  label: string;
  value: string;
  comment: string;
}

export interface SynthesizedPillar {
  id: 'moat' | 'capital' | 'cash_fortress' | 'asymmetry';
  title: string;
  subtitle?: string;
  status: 'GÜÇLÜ' | 'DENGELİ' | 'ZAYIF';
  badgeTone?: 'positive' | 'neutral' | 'negative';
  badgeText: string;
  metrics: Array<{ label: string; value: string; isPositive?: boolean }>;
  shortSummary: string;
  narrative: string;
  evidenceItems: SynthesizedPillarEvidence[];
}

export interface ThesisChecklistItem {
  category: string;
  metric: string;
  threshold: string;
  period: string;
  text: string;
}

export interface SectorComparisonBadge {
  label: string;
  companyValue: string;
  benchmarkValue: string;
  verdict: string;
  isAdvantage: boolean;
}

export interface StandoutHighlight {
  tag: string;
  title: string;
  detail: string;
  tone: 'emerald' | 'cyan' | 'amber' | 'rose';
}

export interface SynthesizedInvestmentDossier {
  decisionMode: 'AL' | 'NÖTR' | 'ALMA';
  convictionBadge: string;
  headline: string;
  whyActionTitle: string;
  whyActionParagraphs: string[];
  opportunitySourceTitle: string;
  opportunityMechanismTag: string;
  opportunitySourceNarrative: string;
  sectoralEdgeTitle: string;
  sectoralEdgeNarrative: string;
  sectoralComparisonBadges: SectorComparisonBadge[];
  standoutHighlights: StandoutHighlight[];
  pillars: SynthesizedPillar[];
  catalysts: string[];
  thesisBreakers: string[];
  catalystChecklist: ThesisChecklistItem[];
  breakerChecklist: ThesisChecklistItem[];
}

export interface ThesisSynthesisInput {
  ticker: string;
  companyName?: string;
  decision: string;
  score?: number;
  currentSector: SectorType;
  officialSectorName: string;
  currentPrice: number;
  fairValue: number;
  discountPct: number;
  latestData: any;
  chartData?: any[];
  roic: number;
  wacc: number;
  nominalWacc?: number;
  evaSpread: number;
  isTms29?: boolean;
  earningsQuality?: any;
  dupontResult?: any;
  companyMultiplesData?: any;
  marketMultiples?: any;
  drivers?: {
    revenue_growth?: { label: string; value: number; note?: string };
    net_income_growth?: { label: string; value: number; note?: string };
    margin?: { label: string; value: number; note?: string };
    target_multiple?: { label: string; value: string; numericValue?: number; note?: string };
  };
  capAllocAudit?: any;
  sameSectorPeers?: Array<{ ticker: string; name: string; marketCapMnTl: number | null }>;
  consensusTargetPrice?: number;
  overrideReason?: string;
  isValueTrap?: boolean;
  valueTrapReasons?: string[];
  executiveVerdict?: {
    thesis?: string;
    catalysts?: string;
    risks?: string;
  };
}

function toSafeNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const str = String(val).trim();
  if (!str || /^[-—–\s]+$/.test(str) || /^(?:n\/a|null|nil|nan)$/i.test(str)) return null;
  const hasParen = /\([^(]*\d+[^(]*\)/.test(str);
  const hasTrailingMinus = /\d[%]?\s*[-−–—]/.test(str) || /[-−–—]\s*$/.test(str);
  const hasLeadingMinus = /^\s*[-−–—]/.test(str) || /[₺$€£%]\s*[-−–—]\s*\d/.test(str);
  const isNeg = hasParen || hasTrailingMinus || hasLeadingMinus;
  let cleaned = str
    .replace(/\u00A0/g, ' ')
    .replace(/[()−–—%₺$€£¥\s]/g, '')
    .replace(/\b(?:TL|TRY|USD|EUR|GBP|CHF|JPY|Bin|Milyon|Mn|Milyar|Mr)\b/gi, '')
    .replace(/-/g, '')
    .trim();
  if (!cleaned) return null;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    cleaned = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    cleaned = (cleaned.match(/,/g) || []).length > 1 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else if (hasDot) {
    const dots = (cleaned.match(/\./g) || []).length;
    if (dots > 1) cleaned = cleaned.replace(/\./g, '');
  }
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return n === 0 ? 0 : (isNeg ? -Math.abs(n) : n);
}

export function synthesizeInvestmentThesis(input: ThesisSynthesisInput): SynthesizedInvestmentDossier {
  const ticker = (input.ticker || 'ŞİRKET').toUpperCase();
  const decisionMode: 'AL' | 'NÖTR' | 'ALMA' =
    input.decision === 'AL' ? 'AL' : input.decision === 'ALMA' ? 'ALMA' : 'NÖTR';
  const d = input.latestData || {};
  const rawInput = input as any;
  const sec: string = input.currentSector || rawInput.sector || 'INDUSTRIAL';
  const sectorName = input.officialSectorName || 'Sanayi';
  const isTechOrDefense = sec === 'TECH' || sec === 'DEFENSE' || sec === 'TECH_SW' || /savunma|yazılım|bilişim|teknoloji/i.test(sectorName);

  const fmtPct = (v: number | null | undefined, dec = 1, showPlus = false): string => {
    if (v === null || v === undefined || !Number.isFinite(v)) return 'Veri Yok';
    const zeroFloor = Math.pow(10, -(dec + 1));
    const clean = Math.abs(v) < zeroFloor ? 0 : v;
    if (clean < 0) return `-%${Math.abs(clean).toFixed(dec)}`;
    if (clean > 0) return `${showPlus ? '+' : ''}%${clean.toFixed(dec)}`;
    return `%${(0).toFixed(dec)}`;
  };
  const fmtPrice = (v: number | null | undefined): string =>
    (v !== null && v !== undefined && Number.isFinite(v) && v > 0) ? `₺${v.toFixed(2)}` : 'Veri Yok';
  const fmtMult = (v: number | null | undefined, dec = 2): string =>
    (v !== null && v !== undefined && Number.isFinite(v)) ? `${v.toFixed(dec)}x` : 'Veri Yok';

  const formatMoneyCompact = (val: number | null | undefined): string => {
    if (val === null || val === undefined || !Number.isFinite(val)) return 'Veri Yok';
    const sign = val < 0 ? '-' : '';
    const abs = Math.abs(val);
    if (abs >= 1e9) return `${sign}₺${(abs / 1e9).toFixed(1)} Mr`;
    if (abs >= 1e6) return `${sign}₺${(abs / 1e6).toFixed(0)} Mn`;
    if (abs >= 1e3) return `${sign}₺${(abs / 1e3).toFixed(0)} Bin`;
    return `${sign}₺${abs.toFixed(0)}`;
  };

  // Fiyat ve Değerleme Girdileri (güvenli parse, null/NaN TypeError engelli)
  const currentPriceNum = toSafeNum(input.currentPrice);
  const fairValueNum = toSafeNum(input.fairValue);
  const discountPctNum = toSafeNum(input.discountPct);
  const consensusNum = toSafeNum(input.consensusTargetPrice);

  // Temel Finansal Büyüklükler (null korumalı)
  const rev = toSafeNum(d.revenue ?? d.gross_written_premiums ?? rawInput.revenue) ?? 0;
  const grossProfit = toSafeNum(d.gross_profit ?? rawInput.grossProfit) ?? 0;
  const ebitdaRaw = toSafeNum(d.ebitda ?? d.operating_profit ?? rawInput.ebitda);
  const ebitda = ebitdaRaw ?? 0;
  const netIncomeRaw = toSafeNum(d.net_income ?? rawInput.netIncome);
  const netIncome = netIncomeRaw ?? 0;
  const ocfRaw = toSafeNum(d.operating_cash_flow ?? input.earningsQuality?.ocf ?? rawInput.operatingCashFlow);
  const ocf = ocfRaw ?? 0;
  const hasOcfData = ocfRaw !== null;
  const capex = Math.abs(toSafeNum(d.capex ?? d.tangible_capex ?? rawInput.capex) ?? 0);
  const fcfRaw = toSafeNum(d.free_cash_flow ?? rawInput.freeCashFlow);
  const fcf = fcfRaw ?? (hasOcfData ? (ocf - capex) : 0);
  const hasFcfData = fcfRaw !== null || hasOcfData;
  const equity = toSafeNum(d.equity ?? rawInput.equity) ?? 0;
  const totalAssets = toSafeNum(d.total_assets ?? rawInput.totalAssets) ?? 0;
  const hasNetDebtInput = d.net_debt != null || rawInput.netDebt != null || d.short_term_debt != null || d.long_term_debt != null;
  const fallbackDebtCalc = ((toSafeNum(d.short_term_debt) ?? 0) + (toSafeNum(d.long_term_debt) ?? 0)) - (toSafeNum(d.cash_and_equivalents ?? d.cash) ?? 0);
  const netDebtVal: number | null = hasNetDebtInput ? (toSafeNum(d.net_debt ?? rawInput.netDebt) ?? fallbackDebtCalc) : null;
  const netDebt = netDebtVal ?? 0;
  const cashAndInv = (toSafeNum(d.cash_and_equivalents ?? d.cash) ?? 0) + (toSafeNum(d.financial_investments ?? d.financial_assets_insured) ?? 0);
  const currentAssets = toSafeNum(d.current_assets) ?? 0;
  const currentLiabilities = toSafeNum(d.current_liabilities) ?? 0;
  const tradePayables = toSafeNum(d.trade_payables) ?? 0;
  const tradeReceivables = toSafeNum(d.trade_receivables ?? d.receivables) ?? 0;
  const inventories = toSafeNum(d.inventories) ?? 0;
  const wcChange = toSafeNum(d.working_capital_change) ?? 0;

  // Rasyolar (Sentetik varsayımlar kaldırıldı)
  const rawGrossM = (rev > 0 && d.gross_profit != null)
    ? (grossProfit / rev) * 100
    : toSafeNum(d.gross_margin ?? rawInput.grossMargin);
  const grossMargin = (rawGrossM !== null && Math.abs(rawGrossM) <= 200) ? rawGrossM : null;

  const rawEbitdaM = (rev > 0 && (d.ebitda != null || d.operating_profit != null))
    ? (ebitda / rev) * 100
    : toSafeNum(d.ebitda_margin ?? input.drivers?.margin?.value ?? rawInput.ebitdaMargin);
  const ebitdaMargin = (rawEbitdaM !== null && Math.abs(rawEbitdaM) <= 200) ? rawEbitdaM : null;

  const rawNetM = (rev > 0 && d.net_income != null)
    ? (netIncome / rev) * 100
    : toSafeNum(d.net_margin ?? rawInput.netMargin);
  const netMargin = (rawNetM !== null && Math.abs(rawNetM) <= 200) ? rawNetM : null;

  const dupontCalcRoe = toSafeNum(input.dupontResult?.calculatedRoe);
  const roe = dupontCalcRoe
    ?? toSafeNum(d.roe)
    ?? toSafeNum(rawInput.roe)
    ?? (equity > 0 && netIncomeRaw !== null ? (netIncome / equity) * 100 : null);

  const assetTurnover = toSafeNum(input.dupontResult?.assetTurnover)
    ?? (totalAssets > 0 && rev > 0 ? rev / totalAssets : null);

  const currentRatio: number | null = currentLiabilities > 0
    ? currentAssets / currentLiabilities
    : toSafeNum(d.current_ratio ?? rawInput.currentRatio);

  const isNetCash = netDebtVal !== null && netDebtVal <= 0;
  const netDebtToEbitda: number | null = (netDebtVal !== null && !isNetCash && ebitda > 0)
    ? (netDebtVal / ebitda)
    : null;

  // Nakit Kalitesi ve Çalışma Sermayesi
  const rawEqRatio = toSafeNum(input.earningsQuality?.cashConversionRatio);
  const cashConvPct: number | null = rawEqRatio !== null
    ? rawEqRatio
    : (netIncome > 0 && hasOcfData ? (ocf / netIncome) * 100 : (hasOcfData && ocf > 0 && netIncome <= 0 ? null : (hasOcfData ? 0 : null)));
  const cashConv = cashConvPct !== null ? cashConvPct / 100 : 0;
  const isSupplierDebtDrivenOcf = hasOcfData && ocf > 0 && wcChange > 0 && (wcChange / ocf) >= 0.70 && netIncome < 0;
  const hasNegativeWorkingCapitalFloat = tradePayables > 0 && tradePayables > (tradeReceivables + inventories * 0.85) && ocf > 0 && netIncome > 0;

  const roic = toSafeNum(input.roic) ?? toSafeNum(d.roic);
  const wacc = toSafeNum(input.wacc) ?? toSafeNum(d.real_wacc ?? d.wacc);
  const evaSpread = toSafeNum(input.evaSpread)
    ?? toSafeNum(d.eva_spread)
    ?? ((roic !== null && wacc !== null) ? Number((roic - wacc).toFixed(1)) : null);
  const isPositiveEva = evaSpread !== null && evaSpread >= 0 && (roic === null || wacc === null || roic >= wacc);
  const formattedEvaPts = evaSpread === null
    ? 'Veri Yok'
    : (evaSpread >= 0 ? `+${evaSpread.toFixed(1)}` : `${evaSpread.toFixed(1)}`);
  const formattedEvaPct = fmtPct(evaSpread, 1, true);
  const isStrongCashConv = hasOcfData && ocf > 0 && !isSupplierDebtDrivenOcf && (netIncome <= 0 || cashConv >= 0.50);

  // Çarpanlar & Sektör Kıyaslaması (gerçek değerler null korumalı)
  const compPe = toSafeNum(input.companyMultiplesData?.multiples?.pe?.companyValue ?? input.marketMultiples?.pe);
  const secPe = toSafeNum(input.companyMultiplesData?.benchmark?.peMedian ?? input.marketMultiples?.sector_averages?.pe);
  const compPb = toSafeNum(input.companyMultiplesData?.multiples?.pb?.companyValue ?? input.marketMultiples?.pb);
  const secPb = toSafeNum(input.companyMultiplesData?.benchmark?.pbMedian ?? input.marketMultiples?.sector_averages?.pb);
  const compEvEbitda = toSafeNum(input.companyMultiplesData?.multiples?.evEbitda?.companyValue ?? input.marketMultiples?.ev_ebitda);
  const secEvEbitda = toSafeNum(input.companyMultiplesData?.benchmark?.evEbitdaMedian ?? input.marketMultiples?.sector_averages?.ev_ebitda);

  const peDiscountPct = (compPe !== null && compPe > 0 && secPe !== null && secPe > 0) ? ((secPe - compPe) / secPe) * 100 : null;
  const pbDiscountPct = (compPb !== null && compPb > 0 && secPb !== null && secPb > 0) ? ((secPb - compPb) / secPb) * 100 : null;
  const evEbitdaDiscountPct = (compEvEbitda !== null && compEvEbitda > 0 && secEvEbitda !== null && secEvEbitda > 0) ? ((secEvEbitda - compEvEbitda) / secEvEbitda) * 100 : null;

  const upsidePct: number | null = (currentPriceNum !== null && currentPriceNum > 0 && fairValueNum !== null)
    ? ((fairValueNum - currentPriceNum) / currentPriceNum) * 100
    : discountPctNum;

  const revGrowthProj = toSafeNum(input.drivers?.revenue_growth?.value);
  const netGrowthProj = toSafeNum(input.drivers?.net_income_growth?.value);
  const targetMultLabel = input.drivers?.target_multiple?.value || 'Sektör Hedef Çarpanı';
  const peerListStr = (input.sameSectorPeers || []).slice(0, 4).map(p => p.ticker).join(', ');

  const isTfrs10 = Boolean(input.capAllocAudit?.isInvestmentEntity);
  const hasShadowHoldingRisk = Boolean(
    input.capAllocAudit &&
    !input.capAllocAudit.isInvestmentEntity &&
    input.capAllocAudit.isRiskDetected
  );

  // ---------------------------------------------------------------------------
  // 1. BAŞLIK (HEADLINE) & KANAAT ROZETİ (CONVICTION BADGE)
  // ---------------------------------------------------------------------------
  let convictionBadge = 'DENGELİ / KOŞULLU İZLEME TEZİ';
  if (decisionMode === 'AL') {
    convictionBadge = isPositiveEva && isNetCash && ocf > 0
      ? 'YÜKSEK KANAAT ALIM TEZİ • TAM KALE & NAKİT MAKİNESİ'
      : 'ÇOKLU KRİTER ONAYLI KURUMSAL ALIM TEZİ';
  } else if (decisionMode === 'ALMA') {
    convictionBadge = 'ADLİ RİSK & SERMAYE KORUMA UYARISI (YATIRIM ÖNERİLMEZ)';
  } else {
    convictionBadge = isTfrs10
      ? 'TFRS 10 İŞTİRAK PORTFÖYÜ • NET AKTİF DEĞER İZLEME TEZİ'
      : 'SEÇİCİ İZLEME TEZİ • KATALİZÖR & MARJ TEYİDİ BEKLENİYOR';
  }

  let headline = '';
  const ebMDisp = fmtPct(ebitdaMargin);
  const roicDisp = fmtPct(roic);
  const roeDisp = fmtPct(roe);
  const waccDisp = fmtPct(wacc);

  if (decisionMode === 'AL') {
    if (sec === 'RETAIL' || hasNegativeWorkingCapitalFloat) {
      headline = `${sectorName} sektöründe negatif işletme sermayesi ve hızlı stok çevrimiyle sıfır faizli büyüme finanse eden, ${isPositiveEva ? `${formattedEvaPct} reel EVA makası` : `güçlü mağaza/kanal nakit döngüsü`} ve nakit dönüşümüyle yüksek faiz ortamını rekabet kalkanına çeviren lider iş modeli.`;
    } else if (sec === 'INSURANCE') {
      headline = `Disiplinli teknik kârlılık ile büyüyen dev prim ve yatırım havuzunu yüksek TL faiz ortamında bileşik nakit makinesine dönüştüren, ${roe !== null ? `${roeDisp} özkaynak kârlılığına rağmen` : 'güçlü özkaynak getirisiyle'} sektör çarpanlarına göre belirgin iskonto sunan sigorta lideri.`;
    } else if (isTechOrDefense) {
      headline = `Yüksek katma değerli fikri mülkiyet (Ar-Ge), döviz bazlı sözleşme görünürlüğü ve ${isPositiveEva ? `${formattedEvaPct} reel sermaye getirisiyle (ROIC > WACC)` : `${ebMDisp} FAVÖK marjı disipliniyle`} enflasyonist ortamda marjlarını koruyan büyüme ve nakit bileşikçisi.`;
    } else if (sec === 'AVIATION') {
      headline = `Döviz tabanlı küresel gelir mimarisi, güçlü operasyonel nakit akışı ve sektör ortalamasının altındaki çarpan fiyatlamasıyla küresel ölçek avantajını bilançosuna yansıtan bayrak taşıyıcı değer tezi.`;
    } else if (sec === 'REIT') {
      headline = `Kira ve operasyonel nakit akışı üretim gücü, güçlü maddi duran varlık tabanı ve ${isNetCash ? 'net nakit bilançosuyla' : 'kontrollü borç/varlık yapısıyla'} varlık değerine kıyasla derin güvenlik marjı sunan gayrimenkul portföyü.`;
    } else if (sec === 'HOLDING') {
      headline = `Farklı sektörlerdeki nakit üreten iştirak portföyü, solo bilançodaki döviz/nakit kalkanı ve Net Aktif Değerine (NAD) göre sunduğu çift katmanlı holding iskontosuyla asimetrik getiri fırsatı.`;
    } else {
      headline = `${sectorName} sektöründe ${ebitdaMargin !== null ? `${ebMDisp} FAVÖK marjı, ` : ''}${roic !== null ? (isPositiveEva ? `sermaye maliyetini aşan ${roicDisp} reel ROIC performansı` : `iskontolu varlık tabanı (${roicDisp} ROIC)`) : 'operasyonel varlık tabanı'} ve ${isNetCash ? 'net nakit bilançosuyla' : 'sağlıklı borç çevrimiyle'} operasyonel kalitesi piyasa tarafından henüz tam fiyatlanmamış değer fırsatı.`;
    }
  } else if (decisionMode === 'ALMA') {
    if (hasShadowHoldingRisk) {
      headline = `Ana faaliyetinden ürettiği nakdi çekirdek işini büyütmek yerine ilişkili taraflara / finansal yatırımlara aktaran (Gölge Holdingleşme Riski) ve operasyonel görünümü zayıflayan sermaye tahsisi uyarısı.`;
    } else if (isSupplierDebtDrivenOcf) {
      headline = `Net zarar açıklamasına rağmen faaliyet nakit akışının büyük kısmını tedarikçi vadelerini açarak (ticari borç biriktirerek) sağlayan, negatif EVA makasına sahip yüksek riskli değer tuzağı görünümü.`;
    } else {
      const evaMeta = (roic !== null && wacc !== null) ? ` (Reel ROIC: ${roicDisp} vs WACC: ${waccDisp})` : '';
      headline = `${sectorName} sektöründe daralan operasyonel marjlar, sermaye maliyetinin altında kalan getiri${evaMeta} ve zayıf nakit dönüşümü nedeniyle iskonto görünümünün temel kaliteyle desteklenmediği risk profili.`;
    }
  } else {
    if (isTfrs10) {
      headline = `TFRS 10 kapsamında ticari mal satışı yerine teknoloji ve girişim iştiraklerinin gerçeğe uygun değerlemesiyle büyüklük üreten, operasyonel çarpanlar yerine İştirak Portföyü Net Aktif Değeri (PD/NAD) üzerinden izlenmesi gereken portföy şirketi.`;
    } else {
      headline = `${sectorName} sektöründe ${isPositiveEva && roic !== null ? `pozitif sermaye getirisi (${roicDisp} ROIC) üretmesine karşın` : `mevcut marj ve sermaye maliyeti dengesinde`} güçlü bir güvenlik marjı veya nakit dönüşüm ivmesi teyit edilene kadar seçici izlenmesi gereken dengeli görünüm.`;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. NEDEN ALMALISINIZ / İZLEMELİSİNİZ? (KRİTERLERİ HARMANLAYAN ANA YATIRIM TEZİ)
  // ---------------------------------------------------------------------------
  const whyActionTitle =
    decisionMode === 'AL'
      ? `Neden ${ticker}? — Yatırım Tezi`
      : decisionMode === 'ALMA'
      ? `Neden Uzak Durulmalı? — Risk Tezi`
      : `Neden ${ticker} İzlenmeli? — Bekleme Tezi`;

  const whyActionParagraphs: string[] = [];
  const fvPriceStr = fmtPrice(fairValueNum);
  const curPriceStr = fmtPrice(currentPriceNum);
  const cashConvDisp = cashConvPct !== null ? fmtPct(cashConvPct, 0) : 'Veri Yok';
  const netMarginStr = netMargin !== null ? fmtPct(netMargin) : 'Veri Yok';

  if (decisionMode === 'AL') {
    const cashNarrative = isStrongCashConv
      ? `ürettiği operasyonel kârı kağıt üzerinde bırakmayıp ${cashConvPct !== null ? `${cashConvDisp} dönüşüm oranıyla` : 'güçlü oranla'} sıcak işletme nakdine tahvil etmesi ile tahakkuk riskinden ayrışmaktadır`
      : hasOcfData && ocf > 0
      ? `pozitif işletme nakit akışı üretmekle birlikte muhasebe kârının nakde dönüşüm oranının (${cashConvDisp}) işletme sermayesi ve değerleme kalemleri nedeniyle yakından izlenmesi gerekmektedir`
      : `operasyonel marj disipliniyle içsel fon yaratma kapasitesini korumaktadır`;

    const balanceSheetNarrative = isNetCash
      ? `Bilançosundaki Net Nakit pozisyonu sayesinde, yüksek TL faiz ortamında bankalara finansman gideri ödemek yerine nakit varlıklarından faiz geliri yazarak ${netMargin !== null && netMargin >= 0 ? `net kâr marjını (${netMarginStr})` : 'bilanço likiditesini'} rakiplerine karşı sigortalamaktadır.`
      : netDebtToEbitda !== null
      ? `Net Borç / FAVÖK rasyosunu ${netDebtToEbitda.toFixed(2)}x gibi yönetilebilir bir eşikte tutarak yüksek faiz ortamında finansman giderlerinin esas faaliyet kârını eritmesini engellemektedir.`
      : `Bilanço borçluluk yapısı dönemsel finansal tablolar üzerinden izlenmektedir.`;

    whyActionParagraphs.push(
      `${ticker} için oluşturduğumuz ALIM tezi, tek bir ucuzluk çarpanına değil; kârlılık kalitesi, sermaye verimliliği ve bilanço sağlamlığının aynı anda kesişmesine dayanmaktadır. Şirket, ${sectorName} sektöründe ${ebitdaMargin !== null ? `${ebMDisp} FAVÖK marjı üretirken, ` : ''}${cashNarrative}. ${balanceSheetNarrative}`
    );

    const multComparison = (compPe !== null && compPe > 0 && secPe !== null && secPe > 0 && compPe < secPe && peDiscountPct !== null)
      ? `Sektör medyanı ${secPe.toFixed(1)}x F/K seviyesindeyken şirketin ${compPe.toFixed(1)}x F/K (${fmtPct(Math.abs(peDiscountPct), 0)} sektörel iskonto) ile işlem görmesi`
      : (compEvEbitda !== null && compEvEbitda > 0 && secEvEbitda !== null && secEvEbitda > 0 && compEvEbitda < secEvEbitda)
      ? `Sektör ortalaması ${secEvEbitda.toFixed(1)}x FD/FAVÖK seviyesindeyken şirketin ${compEvEbitda.toFixed(1)}x FD/FAVÖK çarpanıyla fiyatlanması`
      : (currentPriceNum !== null && fairValueNum !== null && upsidePct !== null)
      ? `Mevcut ${curPriceStr} fiyat seviyesinin 12 aylık ${fvPriceStr} içsel değer hedefimize göre ${fmtPct(Math.abs(upsidePct))} getiri potansiyeli taşıması`
      : `Modelimizin hesapladığı ${fvPriceStr} içsel adil değer hedefi`;

    let growthSentence = 'değerleme asimetrisini desteklemektedir.';
    if (revGrowthProj !== null && netGrowthProj !== null) {
      if (netGrowthProj > 0 && revGrowthProj > 0) {
        growthSentence = `ve önümüzdeki 12 ayda beklenen ${fmtPct(revGrowthProj, 0)} hasılat / ${fmtPct(netGrowthProj, 0)} net kâr büyüme projeksiyonu birleştiğinde, yatırımcıya hem çarpan genişlemesi hem de içsel özkaynak büyümesi sunan çift motorlu bir fırsat penceresi açılmaktadır.`;
      } else if (netGrowthProj < 0) {
        const revClause = revGrowthProj >= 0
          ? `${fmtPct(revGrowthProj, 0)} hasılat direnci`
          : `${fmtPct(revGrowthProj, 0)} ciro daralması riskine rağmen maliyet disiplini`;
        growthSentence = `ile birleştiğinde; önümüzdeki 12 ayda yüksek baz etkisi veya sektörel döngü normalleşmesi kaynaklı beklenen net kâr daralmasına (${fmtPct(netGrowthProj, 0)}) rağmen, ${revClause} ve cazip değerleme marjı, kârdaki döngüsel dip seviyesinin hisse fiyatında fazlasıyla iskonto edildiğini ve yeniden değerleme potansiyelini desteklemektedir.`;
      } else {
        growthSentence = revGrowthProj >= 0
          ? `ve önümüzdeki 12 ayda beklenen ${fmtPct(revGrowthProj, 0)} hasılat büyümesi ile birleştiğinde, çarpan genişlemesi ve adil değere yakınsama potansiyeli sunmaktadır.`
          : `mevcut değerleme marjının korunması açısından izlenmektedir.`;
      }
    } else if (revGrowthProj !== null) {
      growthSentence = revGrowthProj >= 0
        ? `ve önümüzdeki 12 ayda beklenen ${fmtPct(revGrowthProj, 0)} hasılat büyümesi ile birleştiğinde, adil değere yakınsama potansiyeli sunmaktadır.`
        : `cirodaki ${fmtPct(revGrowthProj, 0)} daralma beklentisine karşın güvenlik marjıyla dengelenmektedir.`;
    }

    const evaParagraphLead = (roic !== null && wacc !== null && evaSpread !== null)
      ? (isPositiveEva
          ? `İkinci temel dayanak noktası, şirketin yatırdığı her 100 TL'lik sermayeden enflasyondan arındırılmış bazda ${roicDisp} Reel ROIC üreterek ${waccDisp}'lik reel sermaye maliyetinin üzerinde (${formattedEvaPts} puan EVA) gerçek ekonomik değer yaratmasıdır.`
          : `İkinci temel dayanak noktası, şirketin muhasebesel reel sermaye getirisi (${roicDisp} Reel ROIC) mevcut aşamada ${waccDisp}'lik reel sermaye maliyetinin altında (${formattedEvaPts} puan negatif EVA makası) kalsa da, sahip olduğu varlık tabanı ve nakit akışı kapasitesinin piyasa fiyatında derin bir güvenlik marjıyla iskonto edilmiş olmasıdır.`)
      : `İkinci temel dayanak noktası, şirketin operasyonel nakit üretim kapasitesi ve mevcut piyasa çarpanlarının adil değere kıyasla sunduğu marjdır.`;

    whyActionParagraphs.push(`${evaParagraphLead} ${multComparison} ${growthSentence}`);
  } else if (decisionMode === 'ALMA') {
    const evaSentence = (roic !== null && wacc !== null && evaSpread !== null)
      ? `Şirketin reel sermaye getirisi (ROIC: ${roicDisp}), reel sermaye maliyetinin (${waccDisp}) ${evaSpread < 0 ? `${Math.abs(evaSpread).toFixed(1)} puan altında kalarak negatif ekonomik değer (sermaye erozyonu) üretmektedir` : `üzerinde kalıcı bir güvenlik marjı oluşturamamaktadır`}.`
      : `Mevcut finansal veriler sermaye maliyeti üzerinde sürdürülebilir ekonomik değer üretimini teyit etmemektedir.`;

    whyActionParagraphs.push(
      `${ticker} için modelimizin verdiği ALMA (Uzak Dur) kararı, hissenin yüzeysel çarpanlarından ziyade 4 boyutlu adli finansal stres testindeki yapısal kırılmalardan kaynaklanmaktadır. ${evaSentence}`
    );
    whyActionParagraphs.push(
      `${hasShadowHoldingRisk
        ? `Buna ek olarak, şirketin esas faaliyetlerinden ürettiği kaynağı çekirdek işine yatırmak yerine grup içi ilişkili taraflara veya uzun vadeli finansal yatırımlara yönlendirmesi (${input.capAllocAudit?.summaryTitle || 'Gölge Holdingleşme & Sermaye Tahsisi Riski'}), azınlık hissedarlar açısından nakit akışı görünürlüğünü zedelemektedir.`
        : isSupplierDebtDrivenOcf
        ? `Nakit akışı tablosunda pozitif görünen işletme nakdinin esas faaliyet kârından değil, tedarikçi borç vadelerinin uzatılmasından (işletme sermayesi borçlanmasından) kaynaklanması ve net zarar trendi, hisseyi klasik bir 'Değer Tuzağı' konumuna sokmaktadır.`
        : `Operasyonel marjlardaki baskı (${ebitdaMargin !== null ? `${ebMDisp} FAVÖK marjı` : 'FAVÖK Veri Yok'}, ${netMargin !== null ? `${netMarginStr} net marj` : 'Net Marj Veri Yok'}) ve ${isNetCash ? 'zayıf serbest nakit üretimi' : netDebtToEbitda !== null ? `${netDebtToEbitda.toFixed(2)}x Net Borç/FAVÖK baskısı` : 'operasyonel nakit kırılganlığı'}, içsel adil değerin (${fvPriceStr}) piyasa fiyatının (${curPriceStr}) altında veya güvensiz bölgede kalmasına yol açmaktadır.`}`
    );
  } else {
    if (isTfrs10) {
      whyActionParagraphs.push(
        `${ticker}, TFRS 10 kapsamında bir 'Yatırım İşletmesi / Girişim Sermayesi Portföyü' statüsünde faaliyet gösterdiği için klasik sanayi veya yazılım şirketleri gibi satış/FAVÖK büyümesi üzerinden değil, elindeki iştirak portföyünün gerçeğe uygun değer artışı ve yatırım çıkışı / halka arz potansiyeli üzerinden değerlendirilmelidir.`
      );
      whyActionParagraphs.push(
        `Şirketin ${formatMoneyCompact(equity)} büyüklüğündeki borçsuz özkaynak (Net Aktif Değer) tabanı ve ${compPb !== null && compPb > 0 ? `${compPb.toFixed(2)}x PD/DD çarpanı` : 'mevcut piyasa fiyatlaması'}, holding/girişim sermayesi iskonto normlarıyla uyumlu bir denge sunmaktadır. Yeni bir iştirak halka arzı veya nakit temettü/çıkış katalizörü gerçekleşene kadar NÖTR (İzle) duruşu korunmaktadır.`
      );
    } else if (upsidePct !== null && upsidePct >= 15) {
      const discText = discountPctNum !== null ? fmtPct(discountPctNum, 0) : fmtPct(upsidePct, 0);
      whyActionParagraphs.push(
        `${ticker}, ${sectorName} sektöründe ${ebitdaMargin !== null ? `${ebMDisp} FAVÖK marjı ve ` : ''}hesaplanan ${fvPriceStr} adil değerimiz ile güncel ${curPriceStr} fiyat seviyesine kıyasla kağıt üzerinde ${fmtPct(upsidePct)} yükseliş potansiyeli (${discText} iskonto) sunmaktadır. Ancak modelimizin agresif bir 'AL' yerine 'NÖTR (Temkinli İzleme)' duruşu benimsemesi; kâğıt üzerindeki iskontonun sermaye getirisinde (${roic !== null ? `ROIC: ${roicDisp}` : 'sermaye getirisi'}), serbest nakit akışı dönüşümünde (${cashConvDisp}) ve bilanço dinamiklerinde yeni çeyrek teyitlerine ihtiyaç duymasından kaynaklanmaktadır.`
      );
      whyActionParagraphs.push(
        `Kriterler harmanlandığında; derin iskontoya rağmen sermaye koruma disiplini önceliklendirilmiştir. Şirketin adil değerine doğru kalıcı bir yeniden değerleme başlatabilmesi için yalnızca ucuz çarpanlar yetersiz olup; nakit tahsilat kabiliyetinin güçlenmesi ve kârın operasyonel serbest nakde dönüştüğünün teyit edilmesi beklenmektedir.`
      );
    } else {
      whyActionParagraphs.push(
        `${ticker}, ${sectorName} sektöründe ${ebitdaMargin !== null ? `${ebMDisp} FAVÖK marjı ve ` : ''}${roic !== null ? `${roicDisp} Reel ROIC ile` : 'mevcut finansal görünümüyle'} faaliyet göstermesine karşın, mevcut ${curPriceStr} piyasa fiyatı ile ${fvPriceStr} içsel adil değerimiz arasındaki makas (${fmtPct(upsidePct, 1, true)}), yüksek enflasyon ve faiz ortamında talep ettiğimiz asgari güvenlik marjı eşiğini henüz tam olarak aşamamaktadır.`
      );
      whyActionParagraphs.push(
        `Kriterler harmanlandığında; şirketin ${isPositiveEva ? 'pozitif EVA üretimi ve operasyonel duruşu olumlu olmakla birlikte' : 'sermaye maliyeti baskısı ve marj dengesi gözetildiğinde'}, agresif alım için ya çarpanlarda geri çekilme (daha derin iskonto) ya da serbest nakit akışı dönüşümünde (${cashConvDisp}) ve çeyreklik marjlarda yukarı yönlü bir kırılım beklenmelidir.`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 3. NEDEN BURADA BİR FIRSAT VAR? (FIRSATIN KAYNAĞI & PİYASA YANILGISI)
  // ---------------------------------------------------------------------------
  let opportunitySourceTitle =
    decisionMode === 'AL'
      ? 'Piyasa Neyi Eksik Fiyatlıyor?'
      : decisionMode === 'ALMA'
      ? 'Değer Tuzağı Riski Nerede?'
      : 'Fırsat İçin Ne Bekleniyor?';

  let opportunityMechanismTag = 'ÇOKLU KRİTER ASİMETRİSİ';
  let opportunitySourceNarrative = '';

  const isFxFunctional = ['THYAO', 'PGSUS', 'TAVHL', 'CLEBI', 'DOCO', 'ENKAI'].includes(ticker.toUpperCase());

  if (decisionMode === 'AL') {
    if (isFxFunctional) {
      opportunityMechanismTag = 'DÖVİZ BAZLI OPERASYONEL GÜÇ & TMS 29 BAĞIŞIKLIĞI';
      opportunitySourceNarrative = `Piyasa oyuncuları, Türkiye'deki yüksek yerel enflasyon ve kârları törpüleyen TMS 29 enflasyon muhasebesi baskısını toptancı bir yaklaşımla tüm hisselere teşmil etme yanılgısına düşmektedir. Oysa ${ticker}, fonksiyonel para birimi yabancı para (EUR/USD) olan ve SPK/KGK mevzuatı gereği TMS 29 enflasyon muhasebesi uygulamayan; gelirlerinin ezici çoğunluğu döviz bazlı uluslararası havacılık/hizmet tarifelerine dayalı bir şirkettir. TL enflasyonundan bağımsız döviz nakit yaratma gücü (${cashConvDisp} nakit dönüşümü) ve bilanço dayanıklılığı, hissenin ${fvPriceStr} adil değerine ulaşmasındaki en kuvvetli katalizördür.`;
    } else if (input.isTms29 && hasOcfData && netIncomeRaw !== null && netIncome > 0 && ocf > netIncome) {
      opportunityMechanismTag = 'TMS 29 MUHASEBE PERDESİ vs. GÜÇLÜ NAKİT KASASI';
      opportunitySourceNarrative = `Piyasa şu an ${ticker} hissesini yalnızca gelir tablosunun en alt satırındaki TMS 29 enflasyon muhasebesi (parasallık düzeltmesi ve stok endekslemesi) baskısıyla değerlendirme yanılgısına düşmektedir. Oysa nakit akış tablosu incelendiğinde, şirketin net kârının ${cashConvDisp} oranında sıcak işletme nakdi ürettiği görülmektedir. Muhasebesel ve nakit çıkışı gerektirmeyen düzeltmeler geçici olarak kârı törpülerken, kasaya giren gerçek nakit şirketin içsel değerini ${fvPriceStr} seviyesine taşımaktadır.`;
    } else if (isNetCash && isPositiveEva) {
      opportunityMechanismTag = 'YÜKSEK FAİZ ORTAMINDA NET NAKİT & POZİTİF EVA ASİMETRİSİ';
      opportunitySourceNarrative = `Borsa İstanbul'da yüksek faiz politikası nedeniyle sanayi ve hizmet şirketlerinin tamamına piyasa tarafından toptancı bir 'finansman gideri iskontosu' uygulanmaktadır. Ancak piyasanın gözden kaçırdığı kritik ayrım şudur: ${ticker} borçlu bir şirket değil, bilançosunda Net Nakit taşıyan ve ${formattedEvaPct} pozitif EVA üreten bir nakit kalesidir. Yüksek faiz ortamı borçlu rakiplerini zayıflatırken ${ticker}'in pazar payını ve finansal gelirlerini beslemekte; bu da mevcut fiyatlamada belirgin bir piyasa verimsizliği (fırsat) yaratmaktadır.`;
    } else if (capex > 0 && ocf > 0 && (capex / Math.max(ocf, 1)) >= 0.45) {
      opportunityMechanismTag = 'YATIRIM HARCAMASI EVRESİNDEN NAKİT HASADI EVRESİNE GEÇİŞ';
      const capexGrowthNote = (netGrowthProj !== null && netGrowthProj > 0 && revGrowthProj !== null && revGrowthProj > 0)
        ? `oluşacak ${fmtPct(revGrowthProj, 0)} hasılat ve ${fmtPct(netGrowthProj, 0)} net kâr sıçramasını henüz fiyatlamamıştır.`
        : `oluşacak operasyonel kapasite artışını ve nakit akışı ivmesini henüz fiyatlamamıştır.`;
      opportunitySourceNarrative = `Şirket son dönemlerde kapasite ve verimlilik yatırımları nedeniyle nakit akışının önemli bir bölümünü büyümeye yönlendirmiştir. Kısa vadeli düşünen piyasa oyuncuları yatırım harcamaları nedeniyle baskılanan serbest nakit akışına odaklanırken, bu yatırımların devreye girmesiyle ${capexGrowthNote} Yatırım döngüsünün tamamlanıp 'Nakit Hasadı' evresine geçilmesi ana yeniden değerleme kaynağıdır.`;
    } else if (
      (compPe !== null && compPe > 0 && secPe !== null && secPe > 0 && compPe < secPe * 0.85) ||
      (compEvEbitda !== null && compEvEbitda > 0 && secEvEbitda !== null && secEvEbitda > 0 && compEvEbitda < secEvEbitda * 0.85)
    ) {
      opportunityMechanismTag = 'KALİTE - ÇARPAN ANOMALİSİ (SEKTÖR ÜSTÜ GETİRİ, SEKTÖR ALTI ÇARPAN)';
      const compSnippet = (compPe !== null && compPe > 0 && secPe !== null && secPe > 0)
        ? `${compPe.toFixed(1)}x F/K vs Sektör ${secPe.toFixed(1)}x`
        : `${compEvEbitda!.toFixed(1)}x FD/FAVÖK vs Sektör ${secEvEbitda!.toFixed(1)}x`;
      opportunitySourceNarrative = `Finansal teoride özkaynak kârlılığı (${roeDisp} ROE) ve sermaye getirisi (${roicDisp} ROIC) sektör ortalamasının üzerinde olan şirketlerin sektöre göre primli işlem görmesi gerekir. Ancak ${ticker}, üstün sermaye verimliliğine rağmen ${sectorName} sektör medyanının altında (${compSnippet}) fiyatlanmaktadır. Bu kalite-çarpan anomalisi, hisse başına ${fvPriceStr} hedef değerimize giden en somut güvenlik marjını oluşturmaktadır.`;
    } else {
      const growthLabel = (netGrowthProj !== null && netGrowthProj >= 0)
        ? `12 aylık ileri projeksiyondaki ${fmtPct(netGrowthProj, 0)} kâr büyüme kapasitesini`
        : (revGrowthProj !== null && revGrowthProj >= 0)
        ? `döngüsel dip sonrası toparlanma potansiyelini ve ${fmtPct(revGrowthProj, 0)} ciro direncini`
        : `operasyonel maliyet optimizasyonu ve toparlanma potansiyelini`;
      opportunityMechanismTag = (netGrowthProj === null || netGrowthProj >= 0)
        ? 'İÇSEL SERMAYE BİRİKİMİ & GELECEK KÂR İVMESİ'
        : 'DÖNGÜSEL DİP & SERMAYE VERİMLİLİĞİ ASİMETRİSİ';
      const evaClosingSentence = isPositiveEva
        ? `Sermaye maliyetini aşan (${formattedEvaPts} puan EVA) değer üretimi korundukça, içsel özkaynak birikimi hisse fiyatını adil değerine (${fvPriceStr}) yakınsatacaktır.`
        : `Operasyonel marj disiplini ve varlık iskontosu (${formattedEvaPts} puan EVA makası) korundukça, kârlılık normalleşmesiyle hisse fiyatı adil değerine (${fvPriceStr}) yakınsayacaktır.`;
      opportunitySourceNarrative = `Piyasa, şirketin geçmiş çeyreklerdeki baz etkisini ileriye doğrusal olarak taşırken; şirketin maliyet optimizasyonu, ${ebitdaMargin !== null ? `${ebMDisp} FAVÖK marjı disiplini` : 'marj yönetimi'} ve ${growthLabel} iskonto etmektedir. ${evaClosingSentence}`;
    }
  } else if (decisionMode === 'ALMA') {
    opportunityMechanismTag = hasShadowHoldingRisk
      ? 'GÖLGE HOLDİNGLEŞME & SERMAYE TAHSİSİ RİSKİ'
      : isSupplierDebtDrivenOcf
      ? 'TEDARİKÇİ BORCUYLA FİNANSE EDİLEN OPTİK NAKİT TUZAĞI'
      : 'NEGATİF EVA & SERMAYE EROZYONU RİSKİ';
    const capitalErosionClause = (wacc !== null && roic !== null)
      ? `şirketin sermaye maliyetinin (${waccDisp}) altında getiri (${roicDisp} ROIC) üreterek her çeyrek reel özkaynak erozyonu yaşadığını`
      : `şirketin sermaye maliyetinin altında getiri ve zayıf nakit kalitesiyle özkaynak erozyonu yaşadığını`;
    opportunitySourceNarrative = `Bireysel yatırımcılar çoğu zaman hissenin zirvesinden düşmüş olmasına veya tek bir çarpanın (örneğin PD/DD'nin) düşük görünmesine bakarak burada bir 'fırsat' olduğunu düşünebilir. Ancak adli denetimimiz, ${
      hasShadowHoldingRisk
        ? `şirketin kasasındaki nakdin çekirdek operasyona değil grup içi/finansal yatırımlara kaydırıldığını ve ana işkolunun nakit dönüşümünün zayıfladığını`
        : isSupplierDebtDrivenOcf
        ? `raporlanan işletme nakdinin operasyonel kârdan değil, ödenmeyen tedarikçi borçlarından (ticari borç artışından) geldiğini ve şirketin net zararda olduğunu`
        : capitalErosionClause
    } ortaya koymaktadır. Kalite ve nakit doğrulaması olmayan ucuzluk bir fırsat değil, değer tuzağıdır.`;
  } else {
    if (isTfrs10) {
      opportunityMechanismTag = 'TFRS 10 NET AKTİF DEĞER & İŞTİRAK ÇIKIŞ OPSİYONU';
      opportunitySourceNarrative = `${ticker} için esas fırsat mekanizması klasik ürün satışı değil, portföyündeki teknoloji ve girişim iştiraklerinin büyümesi, yeni yatırım turlarında daha yüksek değerlemeye ulaşması veya halka arz yoluyla nakde dönmesidir. Mevcut ${compPb !== null && compPb > 0 ? `${compPb.toFixed(2)}x PD/NAD` : 'çarpan'} seviyesi portföyün defter değerini makul bir holding iskontosuyla yansıtmaktadır.`;
    } else if (upsidePct !== null && upsidePct >= 15) {
      const discText = discountPctNum !== null ? fmtPct(discountPctNum, 0) : fmtPct(upsidePct, 0);
      opportunityMechanismTag = 'YÜKSEK İSKONTOYA RAĞMEN FİNANSAL TEYİT BEKLENTİSİ';
      opportunitySourceNarrative = `Piyasa şu an ${ticker} hissesini ${curPriceStr} seviyesinde hesaplanan ${fvPriceStr} adil değerine göre ${discText} gibi derin bir iskontoyla fiyatlamaktadır. Ancak modelimizin temkinli bekle-gör (NÖTR) tutumu alım için hisse fiyatının daha da düşmesini değil; kâğıt üzerinde görünen operasyonel kârlılığın (${ebMDisp} FAVÖK marjı) serbest nakit akışına dönüştüğünün ve işletme sermayesi/tahsilat döngüsünün çeyreklik bilançolarda kanıtlanmasını beklemektedir. Bu teyitler gerçekleştiğinde iskonto makasının hızla kapanması ana getiri katalizörü olacaktır.`;
    } else {
      const targetDiscountPrice = fairValueNum !== null && fairValueNum > 0 ? Number((fairValueNum * 0.80).toFixed(2)) : null;
      const priceDropNeeded = currentPriceNum !== null && targetDiscountPrice !== null && currentPriceNum > targetDiscountPrice;
      opportunityMechanismTag = 'TAM FİYATLANMIŞ KALİTE / KATALİZÖR BEKLENTİSİ';
      opportunitySourceNarrative = priceDropNeeded
        ? `Piyasa, ${ticker} hissesinin mevcut operasyonel kalitesini ve ${ebMDisp} FAVÖK marjını güncel ${curPriceStr} fiyat seviyesinde büyük ölçüde dengeli fiyatlamaktadır. Burada yeni ve güçlü bir alım fırsatı doğması için ya önümüzdeki çeyreklerde FAVÖK marjının ve serbest nakit akışının beklentileri aşması ya da piyasa dalgalanmalarında hissenin ${fmtPrice(targetDiscountPrice)} ve altındaki güvenlik marjı bölgesine çekilmesi gerekmektedir.`
        : `Piyasa, ${ticker} hissesini içsel değerine yakın (${fmtPct(upsidePct, 1, true)} makas) dengeli bir bantta fiyatlamaktadır. Güçlü bir alım döngüsünün tetiklenmesi için serbest nakit akışı dönüşümünün (${cashConvDisp}) güçlenmesi ve yeni büyüme katalizörlerinin bilançoda teyit edilmesi beklenmektedir.`;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. SEKTÖREL REKABET AVANTAJI (BU SEKTÖRDE NEDEN ÖNE ÇIKIYOR?)
  // ---------------------------------------------------------------------------
  const sectoralEdgeTitle = `${sectorName} Sektöründeki Konumu`;
  let sectoralEdgeNarrative = '';
  const gmDisp = fmtPct(grossMargin);
  const turnDisp = fmtMult(assetTurnover, 2);
  const nbDisp = isNetCash ? 'Net Nakit' : (netDebtToEbitda !== null ? `${netDebtToEbitda.toFixed(2)}x NB/FAVÖK` : 'Veri Yok');

  if (sec === 'RETAIL') {
    sectoralEdgeNarrative = `Perakende sektöründe rekabeti belirleyen ana unsur mağaza/kanal başına stok devir hızı (${turnDisp} aktif devir hızı) ve tedarikçi finansman gücüdür. ${ticker}, yüksek marka/kanal gücü sayesinde ürünlerini hızla nakde çevirirken tedarikçi vadelerinden yararlanmakta; böylece işletme sermayesi için banka kredisine ihtiyaç duymadan büyümektedir. ${peerListStr ? `BIST ${sectorName} sektöründeki akranları (${peerListStr}) ile kıyaslandığında` : `Sektör genelinde`} ${gmDisp} brüt kâr marjı ve ${isNetCash ? 'net nakit kalkanı' : `${nbDisp} borçluluk rasyosu`} ile sektörel maliyet enflasyonunu fiyatlarına en hızlı yansıtan oyuncular arasında öne çıkmaktadır.`;
  } else if (sec === 'INSURANCE') {
    sectoralEdgeNarrative = `Sigortacılık sektöründe gerçek üstünlük sadece poliçe kesmek değil, hasar/prim dengesini (teknik kârlılığı) koruyarak toplanan devasa prim havuzunu (${formatMoneyCompact(cashAndInv)} yatırım portföyü) yüksek getirili finansal araçlarda nemalandırmaktır. ${ticker}, güçlü acente/banka dağıtım ağı ve disiplinli risk seçimiyle ${roeDisp} özkaynak kârlılığına ulaşırken, ${peerListStr ? `sektördeki diğer oyunculara (${peerListStr}) kıyasla` : 'sektör ortalamasına göre'} sermaye yeterliliğini ve temettü dağıtım kapasitesini en güçlü büyüten kurumların başında gelmektedir.`;
  } else if (sec === 'DEFENSE' || sec === 'TECH_SW') {
    sectoralEdgeNarrative = `${sectorName} sektöründe şirketleri ayrıştıran en kritik kriter, tekrarlayan sözleşme ve bekleyen sipariş bakiyesi, Ar-Ge fikri mülkiyet duvarı ve nitelikli mühendislik ölçeğidir. ${ticker}, yüksek giriş bariyerine sahip iş modeliyle ${gmDisp} brüt marj ve ${ebMDisp} FAVÖK marjı üretirken, ${peerListStr ? `sektör akranları (${peerListStr}) arasında` : 'sektör içinde'} döviz bazlı/enflasyona endeksli gelir yapısı ve ${roicDisp} reel sermaye getirisiyle ayrışmaktadır.`;
  } else if (sec === 'AVIATION') {
    sectoralEdgeNarrative = `Havacılık ve ulaştırma sektöründe küresel aktarma merkezi konumu, yüksek yolcu doluluk oranı, kargo gelir çeşitliliği ve birim koltuk maliyeti kontrolü rekabetin anahtarıdır. ${ticker}, gelirlerinin büyük bölümünü döviz bazında kazanırken operasyonel nakit akışını güçlü tutmakta ve küresel/yerel akranlarına kıyasla çok daha cazip FD/FAVÖK (${compEvEbitda !== null && compEvEbitda > 0 ? `${compEvEbitda.toFixed(1)}x` : 'iskontolu'}) çarpanıyla işlem görmektedir.`;
  } else if (sec === 'REIT') {
    sectoralEdgeNarrative = `GYO sektöründe birçok şirket yalnızca yılda bir kez yapılan yeniden değerleme (kağıt üzerindeki değer artışı) ile kâr yazarken, ${ticker} ${ocf > 0 ? 'gerçek kira ve proje nakit akışı üretimiyle' : 'portföy büyüklüğüyle'} ve ${isNetCash ? 'sıfır net borç (Net Nakit) avantajıyla' : 'kontrollü bilanço kaldıraç yapısıyla'} öne çıkmaktadır. 7524 sayılı kanun kapsamındaki yeni GYO vergi/temettü rejimi altında, düzenli nakit üreten ve borçsuz GYO'lar sektörde pozitif ayrışmaktadır.`;
  } else if (sec === 'HOLDING' || isTfrs10) {
    sectoralEdgeNarrative = `${isTfrs10 ? 'Girişim sermayesi ve yatırım şirketleri' : 'Holdingler'} arasında fark yaratan temel unsur, solo bilançodaki nakit/borç disiplini ve iştirak portföyünün çeşitliliğidir. ${ticker}, ${isNetCash ? 'solo düzeyde net nakit pozisyonuna sahip olması' : 'dengeli finansal yapısı'} ve ${compPb !== null && compPb > 0 ? `${compPb.toFixed(2)}x PD/DD (PD/NAD)` : 'mevcut NAD'} çarpanıyla yatırımcıya iştirak portföyüne doğrudan ortak olma imkanı sunmaktadır.`;
  } else {
    const roicEdgeSentence = (roic === null || wacc === null)
      ? `Sermaye verimliliği ve marj gelişimi çeyreklik bilançolar üzerinden izlenmektedir.`
      : isPositiveEva
      ? `Şirketin ${roicDisp} Reel ROIC performansı, sermaye maliyetinin (${waccDisp}) üzerinde kalarak fiyatlama gücünü kanıtlamaktadır.`
      : `Şirketin ${roicDisp} Reel ROIC performansı henüz ${waccDisp}'lik sermaye maliyetinin altında (${formattedEvaPts} puan EVA) seyretmekte olup marj genişlemesi yakından izlenmektedir.`;
    sectoralEdgeNarrative = `BIST ${sectorName} sektöründe (${peerListStr || 'akran grubu'}) birçok şirket yüksek işletme sermayesi ihtiyacı ve artan kredi faizleri nedeniyle marj daralması yaşarken; ${ticker} ${gmDisp} brüt marj, ${ebMDisp} FAVÖK marjı ve ${isNetCash ? 'Net Nakit bilançosu' : `${nbDisp} disiplini`} ile faaliyet göstermektedir. ${roicEdgeSentence}`;
  }

  // Sektörel Karşılaştırma Rozetleri
  const formatZTag = (compVal: number | null, secVal: number | null): string => {
    if (compVal === null || secVal === null || compVal <= 0 || secVal <= 0) return '';
    const zVal = Math.max(-3.5, Math.min(3.5, (compVal - secVal) / (secVal * 0.35)));
    return ` (${zVal > 0 ? '+' : ''}${zVal.toFixed(1)}σ)`;
  };
  const discountTypeLabel = isPositiveEva ? 'Pozitif Alfa İskontosu' : 'Düşük ROIC İskontosu';

  let pbEvVerdict = 'Çarpan verisi bekleniyor';
  let pbEvAdv = false;
  if (compEvEbitda !== null && compEvEbitda > 0 && secEvEbitda !== null && secEvEbitda > 0 && evEbitdaDiscountPct !== null) {
    if (compEvEbitda <= secEvEbitda) {
      pbEvVerdict = `${discountTypeLabel}: %${Math.min(99, Math.abs(evEbitdaDiscountPct)).toFixed(0)} ucuz${formatZTag(compEvEbitda, secEvEbitda)}`;
      pbEvAdv = true;
    } else {
      pbEvVerdict = `Sektöre göre %${Math.min(200, Math.abs(evEbitdaDiscountPct)).toFixed(0)} primli${formatZTag(compEvEbitda, secEvEbitda)}`;
      pbEvAdv = compEvEbitda <= secEvEbitda * 1.05;
    }
  } else if (compPb !== null && compPb > 0 && secPb !== null && secPb > 0 && pbDiscountPct !== null) {
    if (compPb <= secPb) {
      pbEvVerdict = `${discountTypeLabel}: %${Math.min(99, Math.abs(pbDiscountPct)).toFixed(0)} ucuz${formatZTag(compPb, secPb)}`;
      pbEvAdv = true;
    } else {
      pbEvVerdict = `Sektöre göre %${Math.min(200, Math.abs(pbDiscountPct)).toFixed(0)} primli${formatZTag(compPb, secPb)}`;
      pbEvAdv = compPb <= secPb * 1.05;
    }
  } else if (compEvEbitda !== null && compEvEbitda < 0) {
    pbEvVerdict = 'Negatif FAVÖK nedeniyle FD/FAVÖK oluşmadı';
  }

  const sectoralComparisonBadges: SectorComparisonBadge[] = [
    {
      label: 'F/K (Fiyat / Kazanç)',
      companyValue: (compPe !== null && compPe > 0) ? `${compPe.toFixed(1)}x` : 'Negatif / AD',
      benchmarkValue: `Sektör: ${secPe !== null && secPe > 0 ? `${secPe.toFixed(1)}x` : 'Veri Yok'}`,
      verdict: (compPe !== null && compPe > 0 && secPe !== null && secPe > 0 && peDiscountPct !== null)
        ? (compPe < secPe
            ? `${discountTypeLabel}: %${Math.min(90, Math.abs(peDiscountPct)).toFixed(0)} ucuz${formatZTag(compPe, secPe)}`
            : `Sektöre göre %${Math.min(200, Math.abs(peDiscountPct)).toFixed(0)} primli${formatZTag(compPe, secPe)}`)
        : (compPe !== null && compPe > 0 ? `Cari F/K: ${compPe.toFixed(1)}x` : 'Net kâr bazında çarpan oluşmadı'),
      isAdvantage: Boolean(compPe !== null && compPe > 0 && secPe !== null && secPe > 0 && compPe <= secPe * 1.05)
    },
    {
      label: 'FD / FAVÖK & PD/DD',
      companyValue: (compEvEbitda !== null && compEvEbitda > 0)
        ? `${compEvEbitda.toFixed(1)}x FD/FAVÖK`
        : `${(compPb !== null && compPb > 0) ? `${compPb.toFixed(2)}x PD/DD` : '—'}`,
      benchmarkValue: (compEvEbitda !== null && compEvEbitda > 0)
        ? `Sektör: ${secEvEbitda !== null && secEvEbitda > 0 ? `${secEvEbitda.toFixed(1)}x` : 'Veri Yok'}`
        : `Sektör: ${secPb !== null && secPb > 0 ? `${secPb.toFixed(2)}x` : 'Veri Yok'}`,
      verdict: pbEvVerdict,
      isAdvantage: pbEvAdv
    },
    {
      label: 'Sermaye Getirisi (Reel ROIC)',
      companyValue: roicDisp,
      benchmarkValue: `Reel WACC: ${waccDisp}`,
      verdict: evaSpread === null
        ? 'EVA Verisi Eksik'
        : (isPositiveEva
            ? `${formattedEvaPts} Puan Reel Değer Üretimi`
            : `${formattedEvaPts} Puan Sermaye Erozyonu`),
      isAdvantage: isPositiveEva
    },
    {
      label: 'Bilanço & Borçluluk Kalkanı',
      companyValue: isNetCash ? 'Net Nakit' : (ebitda <= 0 && netDebtVal !== null && netDebtVal > 0 ? 'Negatif FAVÖK' : nbDisp),
      benchmarkValue: 'Güvenli Eşik: <1.50x',
      verdict: isNetCash
        ? 'Sıfır Net Borç • Faiz Geliri Avantajı'
        : netDebtToEbitda === null
        ? (ebitda <= 0 && netDebtVal !== null && netDebtVal > 0 ? 'Negatif FAVÖK / Borç Baskısı' : 'Borçluluk verisi izleniyor')
        : netDebtToEbitda <= 1.5
        ? 'Düşük Kaldıraç • Güvenli Borç Çevrimi'
        : 'Yüksek Faiz Ortamında Borç Baskısı',
      isAdvantage: isNetCash || (netDebtToEbitda !== null && netDebtToEbitda <= 1.8)
    }
  ];

  // ---------------------------------------------------------------------------
  // 5. ÖNE ÇIKAN 4 SOMUT AYIRT EDİCİ ÖZELLİK (STANDOUT HIGHLIGHTS)
  // ---------------------------------------------------------------------------
  const standoutHighlights: StandoutHighlight[] = [
    {
      tag: 'SERMAYE VERİMLİLİĞİ',
      title: evaSpread === null
        ? 'Sermaye Verimliliği (ROIC / WACC Verisi Eksik)'
        : isPositiveEva
        ? `Reel Sermaye Maliyetini Aşan Değer Üretimi (${formattedEvaPts} Puan EVA)`
        : `Sermaye Maliyetinin Altında Getiri (${formattedEvaPts} Puan EVA)`,
      detail: `Şirket yatırdığı sermayeden reel bazda ${roicDisp} getiri (ROIC) elde ederken, ${roeDisp} özkaynak kârlılığı (ROE) ile çalışmaktadır.`,
      tone: evaSpread === null ? 'amber' : (isPositiveEva ? 'emerald' : 'rose')
    },
    {
      tag: 'NAKİT AKIŞ KALİTESİ',
      title: isStrongCashConv
        ? `Güçlü İşletme Nakit Üretimi (Nakit / Net Kâr: ${cashConvPct !== null ? `${cashConvPct.toFixed(0)}%` : 'Pozitif OCF'})`
        : isSupplierDebtDrivenOcf
        ? `Tedarikçi Vadelerine Dayalı Kırılgan Nakit Akışı`
        : hasOcfData && ocf > 0
        ? `Sınırlı Nakit Dönüşümü (Nakit / Net Kâr: ${cashConvDisp})`
        : `Zayıf İşletme Nakit Dönüşümü ve Tahakkuk Baskısı`,
      detail: isStrongCashConv
        ? `Raporlanan muhasebe kârı sıcak nakit akışıyla desteklenmekte olup ${hasFcfData && fcf > 0 ? 'Serbest Nakit Akışı pozitiftir.' : 'üretilen nakit kapasite yatırımlarını finanse etmektedir.'}`
        : hasOcfData && ocf > 0 && !isSupplierDebtDrivenOcf
        ? `İşletme nakit akışı pozitif olmakla birlikte muhasebe kârının nakde dönüşüm oranı (${cashConvDisp}) işletme sermayesi ve değerleme kalemleri nedeniyle sınırlı kalmaktadır.`
        : `Operasyonel kârın serbest nakde dönüşümünde işletme sermayesi (stok ve alacak) baskısı izlenmektedir.`,
      tone: isStrongCashConv ? 'cyan' : (hasOcfData && ocf > 0 && !isSupplierDebtDrivenOcf ? 'amber' : 'rose')
    },
    {
      tag: 'BİLANÇO MİMARİSİ',
      title: isNetCash
        ? `Net Nakit Kalesi & Yüksek Faiz Bağışıklığı`
        : netDebtToEbitda === null
        ? (ebitda <= 0 && netDebtVal !== null && netDebtVal > 0 ? 'Net Borç ve Operasyonel Zarar Baskısı' : 'Bilanço Kaldıraç Durumu (Veri Eksik)')
        : netDebtToEbitda <= 1.8
        ? `Kontrollü Finansal Kaldıraç (${netDebtToEbitda.toFixed(2)}x Net Borç/FAVÖK)`
        : `Yüksek Finansal Borç Yükü (${netDebtToEbitda.toFixed(2)}x Net Borç/FAVÖK)`,
      detail: isNetCash
        ? `Finansal borçlarını aşan nakit/yatırım varlıkları sayesinde kredi faiz şoklarından etkilenmez; aksine mevduat/yatırım getirisi yazar.`
        : currentRatio !== null
        ? `Cari oran ${currentRatio.toFixed(2)}x seviyesinde olup kısa vadeli yükümlülüklerin çevrimi ${currentRatio >= 1.2 ? 'güvenli bölgededir.' : 'yakın likidite takibi gerektirir.'}`
        : `Kısa vadeli likidite ve borç çevrimi dönemsel tablolar üzerinden takip edilmektedir.`,
      tone: isNetCash ? 'emerald' : (netDebtToEbitda !== null && netDebtToEbitda <= 1.8 ? 'amber' : 'rose')
    },
    {
      tag: 'DEĞERLEME & HEDEF POTANSİYEL',
      title: upsidePct === null
        ? `İçsel Değer Hedefi (${fvPriceStr})`
        : upsidePct >= 15
        ? `Adil Değere Göre +${fmtPct(upsidePct)} Yükseliş Potansiyeli (${fvPriceStr})`
        : upsidePct >= 0
        ? `İçsel Değerine Yakın Dengeli Fiyatlama (+${fmtPct(upsidePct)})`
        : `İçsel Değerinin Üzerinde Primli Fiyatlama (${fmtPct(upsidePct)})`,
      detail: `${targetMultLabel} ve ${netGrowthProj === null ? 'operasyonel projeksiyonlar' : (netGrowthProj >= 0 ? `${fmtPct(netGrowthProj, 0)} ileri kâr büyümesi` : `${fmtPct(Math.abs(netGrowthProj), 0)} kâr normalleşmesi`)} baz alındığında ${
        consensusNum !== null && consensusNum > 0
          ? `model hedefimiz ${fvPriceStr} (Piyasa Konsensüsü: ${fmtPrice(consensusNum)}) seviyesindedir.`
          : `12 aylık ağırlıklı adil değerimiz ${fvPriceStr} olarak hesaplanmıştır.`
      }`,
      tone: (upsidePct !== null && upsidePct >= 15 && decisionMode === 'AL') ? 'emerald' : ((upsidePct !== null && upsidePct < 0) || decisionMode === 'ALMA') ? 'rose' : 'amber'
    }
  ];

  // ---------------------------------------------------------------------------
  // 6. DÖRT HARMANLANMIŞ KARAR SÜTUNU (4-PILLAR SYNTHESIS MATRIX)
  // ---------------------------------------------------------------------------
  const moatGood = (ebitdaMargin !== null && ebitdaMargin >= 14) || (grossMargin !== null && grossMargin >= 25) || (sec === 'RETAIL' && assetTurnover !== null && assetTurnover >= 1.4) || (sec === 'INSURANCE' && roe !== null && roe >= 30);
  const capGood = isPositiveEva && roe !== null && roe >= 20;
  const cashGood = isStrongCashConv && (isNetCash || (netDebtToEbitda !== null && netDebtToEbitda <= 2.0)) && !hasShadowHoldingRisk;
  const valGood = upsidePct !== null && upsidePct >= 18 && (
    (compPe !== null && secPe !== null && compPe > 0 && compPe <= secPe * 1.1) ||
    (compEvEbitda !== null && secEvEbitda !== null && compEvEbitda > 0 && compEvEbitda <= secEvEbitda * 1.1) ||
    (compPb !== null && secPb !== null && compPb > 0 && compPb <= secPb * 1.1)
  );

  const pillars: SynthesizedPillar[] = [
    {
      id: 'moat',
      title: '1. Fiyatlama Gücü ve Marjlar',
      subtitle: `${sectorName} Sektörel Marj Kalitesi`,
      status: moatGood ? 'GÜÇLÜ' : (ebitdaMargin !== null && ebitdaMargin >= 8) ? 'DENGELİ' : 'ZAYIF',
      badgeTone: moatGood ? 'positive' : (ebitdaMargin !== null && ebitdaMargin >= 8) ? 'neutral' : 'negative',
      badgeText: moatGood ? 'Yüksek Kalkan' : (ebitdaMargin !== null && ebitdaMargin >= 8) ? 'Sektörel Standart' : (ebitdaMargin === null ? 'Veri Sınırlı' : 'Marj Baskısı'),
      metrics: [
        { label: 'Brüt Marj', value: gmDisp, isPositive: grossMargin !== null && grossMargin >= 22 },
        { label: 'FAVÖK Marjı', value: ebMDisp, isPositive: ebitdaMargin !== null && ebitdaMargin >= 14 },
        { label: 'Aktif Devir', value: turnDisp, isPositive: assetTurnover !== null && assetTurnover >= 0.7 }
      ],
      shortSummary: moatGood
        ? `${gmDisp} brüt marj ve ${ebMDisp} FAVÖK marjı ile maliyet artışlarını satış fiyatlarına yansıtma gücü yüksektir.`
        : `${ebMDisp} FAVÖK marjı maliyet baskısına duyarlı olup hacim artışı ve gider kontrolü gerektirmektedir.`,
      narrative: moatGood
        ? `Şirket, maliyet enflasyonunu satış fiyatlarına yansıtabilme kabiliyeti (${gmDisp} brüt marj) ve ${ebMDisp} FAVÖK marjı ile sektörde güçlü bir rekabet avantajı sergilemektedir.`
        : `Artan üretim ve faaliyet giderleri operasyonel marjları (${ebMDisp} FAVÖK marjı) sınırlamakta olup, kârlılık için hacim artışı ve maliyet disiplini kritik önemdedir.`,
      evidenceItems: [
        {
          label: 'Brüt Kâr Marjı Kalitesi',
          value: gmDisp,
          comment: grossMargin !== null && grossMargin >= 22 ? 'Üretim/tedarik maliyetlerine karşı güçlü fiyatlama kalkanı' : 'Girdi maliyetlerine karşı sınırlı brüt kâr tamponu'
        },
        {
          label: 'Operasyonel FAVÖK Marjı',
          value: ebMDisp,
          comment: ebitdaMargin !== null && ebitdaMargin >= 14 ? 'Sektör standartlarının üzerinde operasyonel verimlilik' : 'Faaliyet giderleri sonrası daralan veya sınırlı operasyonel marj'
        },
        {
          label: 'Net Marj & Aktif Devir Hızı',
          value: `${netMarginStr} • ${turnDisp}`,
          comment: 'Birim varlık başına ciro üretimi ve net kâra dönüşüm oranı'
        }
      ]
    },
    {
      id: 'capital',
      title: '2. Sermaye Getirisi & Değer Üretimi',
      subtitle: 'Sermaye Maliyetine Göre Reel Getiri',
      status: capGood ? 'GÜÇLÜ' : isPositiveEva ? 'DENGELİ' : 'ZAYIF',
      badgeTone: evaSpread === null ? 'neutral' : (isPositiveEva ? 'positive' : evaSpread >= -2 ? 'neutral' : 'negative'),
      badgeText: evaSpread === null ? 'Veri Eksik' : (isPositiveEva ? `${formattedEvaPts} Puan EVA` : `${formattedEvaPts} Puan Negatif EVA`),
      metrics: [
        { label: 'Reel ROIC', value: roicDisp, isPositive: roic !== null && wacc !== null && roic > wacc },
        { label: 'Reel WACC', value: waccDisp, isPositive: true },
        { label: 'ROE', value: roeDisp, isPositive: roe !== null && roe >= 25 }
      ],
      shortSummary: evaSpread === null
        ? `Reel ROIC (${roicDisp}) veya Reel WACC (${waccDisp}) kalemlerinden biri eksik olduğundan net EVA makası izlenmektedir.`
        : isPositiveEva
        ? `${roicDisp} Reel ROIC, ${waccDisp} sermaye maliyetini aşarak (${formattedEvaPts} puan) reel ekonomik değer üretmektedir.`
        : `${roicDisp} Reel ROIC, ${waccDisp} sermaye maliyetinin altında (${formattedEvaPts} puan) kalarak reel değer üretimini sınırlamaktadır.`,
      narrative: evaSpread === null
        ? `Yatırılan sermaye getirisi (${roicDisp} ROIC) ve sermaye maliyeti (${waccDisp} WACC) bileşenleri dönemsel tablolar üzerinden takip edilmektedir.`
        : isPositiveEva
        ? `Yatırılan sermaye üzerinden elde edilen ${roicDisp} reel getiri, ${waccDisp}'lik sermaye maliyetini aşarak hissedarlar için her çeyrek reel ekonomik katma değer (EVA) yaratmaktadır.`
        : `Yatırılan sermaye getirisi (${roicDisp} ROIC) henüz reel sermaye maliyetini (${waccDisp} WACC) karşılayamamakta; bu durum içsel büyümenin değer yaratmasını zorlaştırmaktadır.`,
      evidenceItems: [
        {
          label: 'Enflasyondan Arındırılmış Reel ROIC',
          value: roicDisp,
          comment: 'Yatırılan net işletme sermayesinden elde edilen reel getiri oranı'
        },
        {
          label: 'Reel Sermaye Maliyeti (WACC) & EVA',
          value: `${waccDisp} (${formattedEvaPts} Puan)`,
          comment: evaSpread === null ? 'Sermaye maliyeti kıyaslaması için ek veri bekleniyor' : (isPositiveEva ? 'Sermaye maliyetinin üzerinde pozitif ekonomik değer yaratımı' : 'Sermaye maliyetinin altında getiri ve reel özkaynak baskısı')
        },
        {
          label: 'Özkaynak Kârlılığı (ROE)',
          value: roeDisp,
          comment: roe !== null && roe >= 25 ? 'Hissedar sermayesini büyüten güçlü içsel kârlılık' : 'Enflasyon ortamında izlenmesi gereken özkaynak getirisi'
        }
      ]
    },
    {
      id: 'cash_fortress',
      title: '3. Nakit Üretimi & Bilanço Gücü',
      subtitle: 'Operasyonel Nakit & Borçluluk',
      status: (isNetCash && isStrongCashConv) || cashGood ? 'GÜÇLÜ' : (hasOcfData && ocf > 0 && !hasShadowHoldingRisk) ? 'DENGELİ' : 'ZAYIF',
      badgeTone: hasShadowHoldingRisk ? 'negative' : isStrongCashConv ? 'positive' : (hasOcfData && ocf > 0 ? 'neutral' : 'negative'),
      badgeText: hasShadowHoldingRisk
        ? 'Sermaye Tahsisi Uyarısı'
        : isNetCash && isStrongCashConv
        ? 'Net Nakit & Güçlü Nakit'
        : hasOcfData && ocf > 0
        ? 'Pozitif İşletme Nakdi'
        : 'Nakit Çıkışı / Borç Baskısı',
      metrics: [
        { label: 'Nakit / Net Kâr', value: cashConvDisp, isPositive: cashConv >= 0.8 && ocf > 0 },
        { label: 'Net Borç/FAVÖK', value: isNetCash ? 'Net Nakit' : (ebitda <= 0 && netDebtVal !== null && netDebtVal > 0 ? 'Negatif FAVÖK' : nbDisp), isPositive: isNetCash || (netDebtToEbitda !== null && netDebtToEbitda <= 1.8) },
        { label: 'Cari Oran', value: fmtMult(currentRatio, 2), isPositive: currentRatio !== null && currentRatio >= 1.2 }
      ],
      shortSummary: hasShadowHoldingRisk
        ? `Üretilen nakdin çekirdek faaliyet dışı finansal yatırımlara / grup içi alacaklara yönelmesi sermaye tahsisi riski yaratmaktadır.`
        : cashGood
        ? `${cashConvDisp} nakit dönüşümü ve ${isNetCash ? 'Net Nakit bilançosu' : `${nbDisp} düşük borçluluk`} faiz şoklarına tam koruma sağlamaktadır.`
        : `İşletme sermayesi ihtiyacı ve yatırım harcamaları nedeniyle serbest nakit akışı dönüşümü (${cashConvDisp}) yakından izlenmelidir.`,
      narrative: hasShadowHoldingRisk
        ? `Şirketin nakit kaynaklarının önemli bir kısmının ana faaliyet dışı finansal yatırımlara / grup içi alacaklara yönelmesi nedeniyle sermaye tahsisi kalitesi ihtiyatlı izlenmelidir.`
        : cashGood
        ? `Operasyonel kârın güçlü biçimde kasaya nakit olarak girmesi ve ${isNetCash ? 'Net Nakit kalkanı' : 'düşük borçluluk oranı'}, şirketi makro faiz şoklarına karşı tam korumalı kılmaktadır.`
        : `İşletme sermayesi döngüsü (alacak ve stok finansmanı) veya yatırım harcamaları nakit üretimini baskılamakta olup, serbest nakit akışı dönüşümü yakından takip edilmelidir.`,
      evidenceItems: [
        {
          label: 'İşletme Nakit Dönüşümü',
          value: hasOcfData ? `${cashConvDisp} (${formatMoneyCompact(ocf)})` : 'Veri Yok',
          comment: isStrongCashConv ? 'Raporlanan kâr sıcak işletme nakdiyle doğrulanıyor' : 'Alacak ve stok değişimleri nakit dönüşümünü sınırlıyor'
        },
        {
          label: 'Serbest Nakit & Yatırım Harcaması',
          value: hasFcfData ? `${formatMoneyCompact(fcf)} (Yatırım: ${formatMoneyCompact(capex)})` : 'Veri Yok',
          comment: hasFcfData && fcf >= 0 ? 'Yatırımlar sonrası kasada kalan pozitif serbest nakit' : 'Yatırım harcamaları veya zayıf nakit kaynaklı serbest nakit baskısı'
        },
        {
          label: 'Net Borç & Kısa Vadeli Likidite',
          value: `${isNetCash ? 'Net Nakit' : (ebitda <= 0 && netDebtVal !== null && netDebtVal > 0 ? 'Negatif FAVÖK' : `${nbDisp} NB/FAVÖK`)} • Cari: ${fmtMult(currentRatio, 2)}`,
          comment: isNetCash || (netDebtToEbitda !== null && netDebtToEbitda <= 1.8) ? 'Güvenli borç çevrimi ve güçlü likidite tamponu' : 'Yüksek faiz ortamında izlenmesi gereken kaldıraç yükü'
        }
      ]
    },
    {
      id: 'asymmetry',
      title: '4. Çarpan İskontosu & Büyüme Potansiyeli',
      subtitle: 'Sektörel Çarpanlar & İleri Projeksiyon',
      status: valGood ? 'GÜÇLÜ' : (upsidePct !== null && upsidePct >= 5) ? 'DENGELİ' : 'ZAYIF',
      badgeTone: valGood ? 'positive' : (upsidePct !== null && upsidePct >= 0) ? 'neutral' : 'negative',
      badgeText: upsidePct === null
        ? 'Değerleme Bekleniyor'
        : (upsidePct >= 0 ? `+${fmtPct(upsidePct)} Potansiyel` : `${fmtPct(upsidePct)} Primli`),
      metrics: [
        { label: 'F/K vs Sektör', value: `${(compPe !== null && compPe > 0) ? `${compPe.toFixed(1)}x` : '—'} / ${(secPe !== null && secPe > 0) ? `${secPe.toFixed(1)}x` : '—'}`, isPositive: Boolean(compPe !== null && compPe > 0 && secPe !== null && compPe <= secPe) },
        { label: '12A Kâr Büyüme', value: fmtPct(netGrowthProj, 0), isPositive: netGrowthProj !== null && netGrowthProj >= 25 },
        { label: 'Adil Değer', value: fvPriceStr, isPositive: Boolean(fairValueNum !== null && currentPriceNum !== null && fairValueNum > currentPriceNum) }
      ],
      shortSummary: upsidePct === null
        ? `Model adil değer hedefi ${fvPriceStr} olarak hesaplanmış olup piyasa fiyatı kıyaslaması beklenmektedir.`
        : valGood
        ? `Sektörel çarpan iskontosu ve ${fvPriceStr} adil değer hedefi, mevcut fiyata göre +${fmtPct(upsidePct)} cazip getiri asimetrisi sunmaktadır.`
        : `${curPriceStr} piyasa fiyatı ile ${fvPriceStr} adil değer arasındaki fark (${fmtPct(upsidePct)}) ${upsidePct >= 15 ? 'finansal teyit gerektiren koşullu potansiyele' : upsidePct >= 0 ? 'sınırlı güvenlik marjına' : 'primli fiyatlamaya'} işaret etmektedir.`,
      narrative: upsidePct === null
        ? `Model değerlemesi ${fvPriceStr} seviyesinde olup ileri projeksiyonlar çeyreklik bilançolarla güncellenmektedir.`
        : valGood
        ? (netGrowthProj !== null && netGrowthProj >= 0
            ? `Şirket hem sektör çarpanlarına göre cazip bir iskontoyla işlem görmekte hem de ${fmtPct(revGrowthProj, 0)} hasılat / ${fmtPct(netGrowthProj, 0)} kâr büyüme beklentisiyle ${fvPriceStr} adil değere güçlü bir asimetri sunmaktadır.`
            : `Şirket sektör çarpanlarına göre cazip bir iskontoyla işlem görmekte; ${revGrowthProj !== null && revGrowthProj >= 0 ? `${fmtPct(revGrowthProj, 0)} hasılat direnci` : 'operasyonel maliyet kontrolü'} ve sermaye verimliliğiyle (${roicDisp} ROIC) kâr döngüsünün dip noktasında ${fvPriceStr} adil değere güçlü bir asimetri sunmaktadır.`)
        : `Mevcut ${curPriceStr} fiyat seviyesi, ${sectorName} sektörü çarpanları ve ${netGrowthProj === null ? 'mevcut kâr projeksiyonlarıyla' : (netGrowthProj >= 0 ? `${fmtPct(netGrowthProj, 0)} ileri kâr büyüme beklentisiyle` : `${fmtPct(Math.abs(netGrowthProj), 0)} kâr daralması beklentisiyle`)} kıyaslandığında ${upsidePct >= 15 ? `kağıt üzerinde ${fmtPct(upsidePct, 0)} iskonto potansiyeli sunsa da operasyonel/nakit teyidi ihtiyacı nedeniyle temkinli bir görünüm` : upsidePct >= 0 ? 'sınırlı bir güvenlik marjı' : 'primli bir fiyatlama'} sunmaktadır.`,
      evidenceItems: [
        {
          label: 'Sektörel Çarpan Kıyaslaması',
          value: (compPe !== null && compPe > 0)
            ? `${compPe.toFixed(1)}x F/K (Sektör: ${secPe !== null ? `${secPe.toFixed(1)}x` : '—'})`
            : `${(compPb !== null && compPb > 0) ? `${compPb.toFixed(2)}x PD/DD (Sektör: ${secPb !== null ? `${secPb.toFixed(2)}x` : '—'})` : `Sektör F/K: ${secPe !== null ? `${secPe.toFixed(1)}x` : 'Veri Yok'}`}`,
          comment: 'BIST sektör medyan çarpanlarına göre göreceli fiyatlama konumu'
        },
        {
          label: '12 Aylık İleri Büyüme Beklentisi',
          value: `Hasılat: ${fmtPct(revGrowthProj, 0)} • Kâr: ${fmtPct(netGrowthProj, 0)}`,
          comment: 'İleri dönem ciro ve net kâr projeksiyonu'
        },
        {
          label: 'Adil Değer & Güvenlik Marjı',
          value: `${fvPriceStr} (${fmtPct(upsidePct, 1, true)})`,
          comment: `Güncel ${curPriceStr} fiyata göre hesaplanan getiri/prim farkı`
        }
      ]
    }
  ];

  // ---------------------------------------------------------------------------
  // 7. KİLİT KATALİZÖRLER VS. TEZİ BOZACAK KIRMIZI ÇİZGİLER (THESIS BREAKERS)
  // ---------------------------------------------------------------------------
  const catalyst1 = (revGrowthProj === null || netGrowthProj === null)
    ? `12 aylık dönemde hasılat ve net kâr performansının çeyreklik bilançolarda teyit edilmesiyle çarpanların ${targetMultLabel} hedefine yakınsaması.`
    : (revGrowthProj >= 0 && netGrowthProj >= 0)
    ? `12 aylık ileri projeksiyonda beklenen ${fmtPct(revGrowthProj)} hasılat değişimi ve ${fmtPct(netGrowthProj)} net kâr artışının çeyreklik bilançolarda teyit edilmesiyle çarpanların ${targetMultLabel} hedefine yakınsaması.`
    : `12 aylık ileri projeksiyonda ${revGrowthProj >= 0 ? `${fmtPct(revGrowthProj)} hasılat performansı` : `${fmtPct(revGrowthProj)} düzeyindeki ciro daralmasının dengelenmesi`} ve döngüsel dip sonrası marj toparlanmasının teyit edilmesiyle çarpanların ${targetMultLabel} hedefine yakınsaması.`;

  const catalysts: string[] = [
    catalyst1,
    isNetCash
      ? `Net Nakit bilançonun yüksek faiz ortamında ürettiği finansal gelir katkısı ve olası temettü / kapasite artırım hamlelerinin özkaynak kârlılığını (${roeDisp}) desteklemesi.`
      : `Dezenflasyon sürecinde politika faizlerinde başlayacak kademeli indirim döngüsünün şirketin finansman giderlerini düşürerek ${netMargin !== null && netMargin >= 0 ? `net kâr marjını (${netMarginStr}) hızla genişletmesi` : 'net kârlılığa geçişini desteklemesi'}.`,
    sec === 'RETAIL'
      ? `Yeni mağaza ve çevrimiçi kanal açılışları ile sepet büyüklüğü artışının negatif işletme sermayesi nakit havuzunu büyütmeye devam etmesi.`
      : sec === 'INSURANCE'
      ? `Artan poliçe prim üretimiyle büyüyen yatırım portföyünün (${formatMoneyCompact(cashAndInv)}) yüksek TL mevduat ve tahvil getirilerinden güçlü finansal gelir yazmaya devam etmesi.`
      : isTechOrDefense
      ? `Yeni ihracat ve bekleyen sipariş sözleşmelerinin açıklanması ve Ar-Ge tabanlı yüksek marjlı ürünlerin toplam ciro içindeki payının artması.`
      : isTfrs10
      ? `Portföydeki teknoloji ve girişim sermayesi iştiraklerinden yeni bir halka arz, stratejik blok satış veya yüksek çarpanlı yatırım turu gerçekleşmesi.`
      : `${sectorName} sektöründe (${(compEvEbitda !== null && compEvEbitda > 0 && secEvEbitda !== null && secEvEbitda > 0) ? `${compEvEbitda.toFixed(1)}x FD/FAVÖK vs Sektör ${secEvEbitda.toFixed(1)}x` : `${(compPe !== null && compPe > 0 && secPe !== null && secPe > 0) ? `${compPe.toFixed(1)}x F/K vs Sektör ${secPe.toFixed(1)}x` : 'mevcut çarpanlar'}`}) tarihsel ortalamalara göre oluşan iskonto makasının kapanması ve hedef çarpanlara yakınsama.`
  ];

  const minSafeEbitdaMargin = ebitdaMargin === null
    ? null
    : (ebitdaMargin > 6.4
        ? Math.max(5.0, Number((ebitdaMargin * 0.78).toFixed(1)))
        : Number((ebitdaMargin * 0.7).toFixed(1)));

  const thesisBreakers: string[] = [
    ebitdaMargin === null
      ? `Operasyonel Marj Bozulması: Şirketin girdi maliyeti artışlarını fiyatlara yansıtamaması sonucu kâr marjlarının daralması.`
      : ebitdaMargin <= 0
      ? `Operasyonel Zarar Sarmalı: Şirketin mevcut negatif FAVÖK marjının (${ebMDisp}) maliyet baskısı ve fiyat rekabetiyle pozitif bölgeye geçememesi, operasyonel nakit yakımının kronikleşmesi.`
      : `Operasyonel Marj Kırılımı: Şirketin çekirdek FAVÖK marjının (${ebMDisp}) maliyet baskısı veya fiyat rekabetiyle üst üste 2 çeyrek %${minSafeEbitdaMargin} eşiğinin altına sarkması.`,
    evaSpread === null
      ? `Sermaye Verimliliği Riski: Reel ROIC (${roicDisp}) performansının sermaye maliyetinin (${waccDisp}) altında kalarak değer erozyonuna yol açması.`
      : isPositiveEva
      ? `Sermaye Getirisi Erozyonu: Reel ROIC performansının (${roicDisp}) gerileyerek ${waccDisp} olan Reel WACC eşiğinin altına inmesi ve EVA makasının negatife dönmesi.`
      : `Kronik Negatif EVA Devamı: Reel ROIC'in (${roicDisp}) sermaye maliyetinin (${waccDisp}) altında kalmaya devam ederek özkaynaklarda reel erimeyi derinleştirmesi.`,
    hasShadowHoldingRisk
      ? `Sermaye Tahsisi Riski: Ana faaliyetten üretilen nakdin çekirdek operasyon yerine ilişkili taraflara / finansal yatırımlara aktarılmasının devam etmesi ve nakit dönüşümünün bozulması.`
      : `Nakit Akışı & İşletme Sermayesi Bozulması: Faaliyet nakit akışının ticari alacak tahsilat sürelerinin uzaması veya stok birikimi nedeniyle negatife dönmesi ${!isNetCash ? `veya Net Borç/FAVÖK rasyosunun (${nbDisp}) 2.50x tehlike sınırını aşması` : 've net nakit tamponunun erimesi'}.`
  ];

  const sanitizeTurkishChecklistText = (raw: string): string => {
    return String(raw || '')
      .replace(/\*\*/g, '')
      .replace(/\s*\(\s*(?:Asset\s+Trap|Peak\s+Margin|Cash\s+Burn|Rule\s+of\s+40|Shadow\s+Holding|Forensic\s+Red\s+Team|Distressed\s+Turnaround(?:\s+Model)?|Operating\s+Leverage|Tangible\s+CapEx|CapEx|Float|Backlog|IPO|Re-rating|exit\/halka\s+arz|CASK|pricing\s+power|Combined\s+Ratio|Bear\s+Case(?:\s+Target)?|Bull\s+Case(?:\s+Target)?|Valuation|FCF|OCF|YoY|QoQ)\s*\)/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  if (input.isValueTrap && Array.isArray(input.valueTrapReasons)) {
    for (const r of input.valueTrapReasons) {
      const cleanedReason = sanitizeTurkishChecklistText(r);
      if (cleanedReason && !thesisBreakers.includes(cleanedReason)) {
        thesisBreakers.push(cleanedReason);
      }
    }
  }

  const catalystChecklist: ThesisChecklistItem[] = [
    {
      category: 'Büyüme & Hedef Çarpan',
      metric: '12 Aylık Hasılat ve Kâr Hedefi',
      threshold: (revGrowthProj === null && netGrowthProj === null)
        ? 'Çeyreklik Büyüme Teyidi Bekleniyor'
        : (netGrowthProj !== null && netGrowthProj >= 0)
        ? `Hasılat ${fmtPct(revGrowthProj, 0, true)} • Kâr ${fmtPct(netGrowthProj, 0, true)}`
        : `Hasılat ${fmtPct(revGrowthProj, 0, true)} • Marj Dengelenmesi`,
      period: 'Çeyreklik Bilanço Takibi',
      text: catalysts[0]
    },
    {
      category: isNetCash ? 'Nakit Getirisi & Özkaynak' : 'Finansman Gideri & Net Marj',
      metric: isNetCash ? 'Net Nakit ve ROE Katkısı' : 'Faiz Maliyeti ve Net Marj',
      threshold: isNetCash
        ? `ROE ≥ %${Math.max(20, roe ?? 20).toFixed(1)} • Net Nakit Korunumu`
        : `${netMargin !== null && netMargin >= 0 ? `Net Marj > %${(netMargin + 1.5).toFixed(1)}` : 'Net Kâra Geçiş'} • Finansman Düşüşü`,
      period: '6-12 Aylık Dönem',
      text: catalysts[1]
    },
    {
      category: 'Sektörel Katalizör & Değerleme',
      metric: sec === 'RETAIL'
        ? 'Kanal Büyümesi ve Nakit Döngüsü'
        : sec === 'INSURANCE'
        ? 'Yatırım Portföyü ve Teknik Kâr'
        : isTechOrDefense
        ? 'Sipariş Bakiyesi ve İhracat Payı'
        : isTfrs10
        ? 'İştirak Çıkışı ve Net Aktif Değer'
        : 'Sektörel Çarpan Yakınsaması',
      threshold: (compEvEbitda !== null && compEvEbitda > 0 && secEvEbitda !== null && secEvEbitda > 0)
        ? `Hedef: ${secEvEbitda.toFixed(1)}x FD/FAVÖK`
        : (compPe !== null && compPe > 0 && secPe !== null && secPe > 0)
        ? `Hedef: ${secPe.toFixed(1)}x F/K`
        : `Hedef Adil Değer: ${fvPriceStr}`,
      period: '12 Aylık Hedef',
      text: catalysts[2]
    }
  ];

  const breakerChecklist: ThesisChecklistItem[] = [
    {
      category: 'Operasyonel Marj Kırmızı Çizgisi',
      metric: 'Çekirdek FAVÖK Marjı',
      threshold: ebitdaMargin === null
        ? 'Mevcut Marj: Veri Yok (Daralma İzlenmeli)'
        : ebitdaMargin <= 0
        ? `FAVÖK Marjı ≤ %0.0 (Mevcut: ${ebMDisp})`
        : `FAVÖK Marjı < %${minSafeEbitdaMargin} (Mevcut: ${ebMDisp})`,
      period: 'Üst Üste 2 Çeyrek',
      text: thesisBreakers[0]
    },
    {
      category: 'Sermaye Verimliliği Eşiği',
      metric: 'Reel ROIC ve Sermaye Maliyeti',
      threshold: `Reel ROIC < ${waccDisp} Reel WACC`,
      period: 'Yıllıklandırılmış Takip',
      text: thesisBreakers[1]
    },
    {
      category: hasShadowHoldingRisk ? 'Sermaye Tahsisi Disiplini' : 'Nakit Akışı & Kaldıraç Sınırı',
      metric: hasShadowHoldingRisk ? 'İlişkili Taraf ve Finansal Yatırım' : 'İşletme Nakdi ve Borç/FAVÖK',
      threshold: hasShadowHoldingRisk
        ? 'Ana Faaliyet Dışı Nakit Çıkışı Devamı'
        : !isNetCash
        ? `İşletme Nakdi < 0 veya NB/FAVÖK > 2.50x`
        : 'İşletme Nakdi < 0 ve Net Nakit Erimesi',
      period: 'Çeyreklik Nakit Akış Tablosu',
      text: thesisBreakers[2]
    }
  ];

  if (thesisBreakers.length > 3) {
    for (let i = 3; i < thesisBreakers.length; i++) {
      const extraText = thesisBreakers[i];
      const colonIdx = extraText.indexOf(':');
      const extractedCat = colonIdx > 3 && colonIdx <= 48
        ? extraText.slice(0, colonIdx).trim()
        : 'Adli Denetim Bulgusu';
      breakerChecklist.push({
        category: extractedCat,
        metric: 'Değer Tuzağı Kriteri',
        threshold: 'Yapısal Bilanço / Kârlılık Uyarısı',
        period: 'Sürekli Takip',
        text: extraText
      });
    }
  }

  return {
    decisionMode,
    convictionBadge,
    headline,
    whyActionTitle,
    whyActionParagraphs,
    opportunitySourceTitle,
    opportunityMechanismTag,
    opportunitySourceNarrative,
    sectoralEdgeTitle,
    sectoralEdgeNarrative,
    sectoralComparisonBadges,
    standoutHighlights,
    pillars,
    catalysts,
    thesisBreakers,
    catalystChecklist,
    breakerChecklist
  };
}
