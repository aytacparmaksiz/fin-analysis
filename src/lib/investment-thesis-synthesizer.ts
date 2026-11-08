import type { SectorType } from './sectors';

export interface SynthesizedPillar {
  id: 'moat' | 'capital' | 'cash_fortress' | 'asymmetry';
  title: string;
  subtitle?: string;
  status: 'GÜÇLÜ' | 'DENGELİ' | 'ZAYIF';
  badgeTone?: 'positive' | 'neutral' | 'negative';
  badgeText: string;
  metrics: Array<{ label: string; value: string; isPositive?: boolean }>;
  narrative: string;
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
  executiveVerdict?: {
    thesis?: string;
    catalysts?: string;
    risks?: string;
  };
}

export function synthesizeInvestmentThesis(input: ThesisSynthesisInput): SynthesizedInvestmentDossier {
  const ticker = (input.ticker || 'ŞİRKET').toUpperCase();
  const decisionMode: 'AL' | 'NÖTR' | 'ALMA' =
    input.decision === 'AL' ? 'AL' : input.decision === 'ALMA' ? 'ALMA' : 'NÖTR';
  const d = input.latestData || {};
  const sec: string = input.currentSector || 'INDUSTRIAL';
  const sectorName = input.officialSectorName || 'Sanayi';
  const isTechOrDefense = sec === 'TECH' || sec === 'DEFENSE' || sec === 'TECH_SW' || /savunma|yazılım|bilişim|teknoloji/i.test(sectorName);

  // Temel Finansal Büyüklükler
  const rev = Number(d.revenue || d.gross_written_premiums || 0);
  const grossProfit = Number(d.gross_profit || 0);
  const ebitda = Number(d.ebitda || d.operating_profit || 0);
  const netIncome = Number(d.net_income || 0);
  const ocf = Number(d.operating_cash_flow ?? input.earningsQuality?.ocf ?? 0);
  const capex = Math.abs(Number(d.capex ?? d.tangible_capex ?? 0));
  const fcf = Number(d.free_cash_flow ?? (ocf - capex));
  const equity = Number(d.equity || 0);
  const totalAssets = Number(d.total_assets || 0);
  const netDebt = Number(d.net_debt ?? ((Number(d.short_term_debt || 0) + Number(d.long_term_debt || 0)) - Number(d.cash_and_equivalents || d.cash || 0)));
  const cashAndInv = Number(d.cash_and_equivalents || d.cash || 0) + Number(d.financial_investments || d.financial_assets_insured || 0);
  const currentAssets = Number(d.current_assets || 0);
  const currentLiabilities = Number(d.current_liabilities || 0);
  const tradePayables = Number(d.trade_payables || 0);
  const tradeReceivables = Number(d.trade_receivables || d.receivables || 0);
  const inventories = Number(d.inventories || 0);
  const wcChange = Number(d.working_capital_change || 0);

  // Rasyolar
  const grossMargin = rev > 0 ? (grossProfit / rev) * 100 : 0;
  const ebitdaMargin = rev > 0 ? (ebitda / rev) * 100 : (Number(input.drivers?.margin?.value) || 0);
  const netMargin = rev > 0 ? (netIncome / rev) * 100 : 0;
  const roe = input.dupontResult?.calculatedRoe != null && !isNaN(input.dupontResult.calculatedRoe)
    ? Number(input.dupontResult.calculatedRoe)
    : (equity > 0 ? (netIncome / equity) * 100 : 0);
  const assetTurnover = input.dupontResult?.assetTurnover != null ? Number(input.dupontResult.assetTurnover) : (totalAssets > 0 ? rev / totalAssets : 0);
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 1.5;
  const netDebtToEbitda = ebitda > 0 ? netDebt / ebitda : (netDebt <= 0 ? -0.5 : 4.5);
  const isNetCash = netDebt <= 0;
  // Nakit Kalitesi ve Çalışma Sermayesi
  // input.earningsQuality.cashConversionRatio zaten yüzde olarak (örn. 172.2) gelir.
  // Eğer doğrudan ocf / netIncome üzerinden hesaplanırsa oran (1.72) çıkar, 100 ile çarpılarak normalize edilir.
  const rawEqRatio = input.earningsQuality?.cashConversionRatio;
  const cashConvPct = rawEqRatio != null
    ? Number(rawEqRatio)
    : (netIncome > 0 ? (ocf / netIncome) * 100 : (ocf > 0 ? 120 : 0));
  const cashConv = cashConvPct / 100; // 0.8 / 1.0 / 1.72 gibi oran karşılaştırmaları için
  const isSupplierDebtDrivenOcf = ocf > 0 && wcChange > 0 && (wcChange / ocf) >= 0.70 && netIncome < 0;
  const hasNegativeWorkingCapitalFloat = tradePayables > 0 && tradePayables > (tradeReceivables + inventories * 0.85) && ocf > 0 && netIncome > 0;

  const roic = Number(input.roic || 0);
  const wacc = Number(input.wacc || 4.7);
  const evaSpread = Number(input.evaSpread ?? (roic - wacc));
  const isPositiveEva = evaSpread >= 0;

  // Çarpanlar & Sektör Kıyaslaması
  const compPe = Number(input.companyMultiplesData?.multiples?.pe?.companyValue ?? input.marketMultiples?.pe ?? 0);
  const secPe = Number(input.companyMultiplesData?.benchmark?.peMedian ?? input.marketMultiples?.sector_averages?.pe ?? 9.5);
  const compPb = Number(input.companyMultiplesData?.multiples?.pb?.companyValue ?? input.marketMultiples?.pb ?? 0);
  const secPb = Number(input.companyMultiplesData?.benchmark?.pbMedian ?? input.marketMultiples?.sector_averages?.pb ?? 2.0);
  const compEvEbitda = Number(input.companyMultiplesData?.multiples?.evEbitda?.companyValue ?? input.marketMultiples?.ev_ebitda ?? 0);
  const secEvEbitda = Number(input.companyMultiplesData?.benchmark?.evEbitdaMedian ?? input.marketMultiples?.sector_averages?.ev_ebitda ?? 6.8);

  const peDiscountPct = compPe > 0 && secPe > 0 ? ((secPe - compPe) / secPe) * 100 : 0;
  const pbDiscountPct = compPb > 0 && secPb > 0 ? ((secPb - compPb) / secPb) * 100 : 0;
  const evEbitdaDiscountPct = compEvEbitda > 0 && secEvEbitda > 0 ? ((secEvEbitda - compEvEbitda) / secEvEbitda) * 100 : 0;

  const upsidePct = input.currentPrice > 0
    ? ((input.fairValue - input.currentPrice) / input.currentPrice) * 100
    : input.discountPct;

  const revGrowthProj = Number(input.drivers?.revenue_growth?.value ?? 38);
  const netGrowthProj = Number(input.drivers?.net_income_growth?.value ?? 42);
  const targetMultLabel = input.drivers?.target_multiple?.value || 'Sektör Hedef Çarpanı';
  const peerListStr = (input.sameSectorPeers || []).slice(0, 4).map(p => p.ticker).join(', ');

  const isTfrs10 = Boolean(input.capAllocAudit?.isInvestmentEntity);
  const hasShadowHoldingRisk = Boolean(
    input.capAllocAudit &&
    !input.capAllocAudit.isInvestmentEntity &&
    input.capAllocAudit.isRiskDetected
  );

  const formatMoneyCompact = (val: number): string => {
    const abs = Math.abs(val);
    if (abs >= 1e9) return `₺${(val / 1e9).toFixed(1)} Mr`;
    if (abs >= 1e6) return `₺${(val / 1e6).toFixed(0)} Mn`;
    if (abs >= 1e3) return `₺${(val / 1e3).toFixed(0)} Bin`;
    return `₺${val.toFixed(0)}`;
  };

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
  if (decisionMode === 'AL') {
    if (sec === 'RETAIL' || hasNegativeWorkingCapitalFloat) {
      headline = `${sectorName} sektöründe negatif işletme sermayesi ve hızlı stok çevrimiyle sıfır faizli büyüme finanse eden, +%${evaSpread.toFixed(1)} reel EVA makası ve güçlü nakit dönüşümüyle yüksek faiz ortamını rekabet kalkanına çeviren lider iş modeli.`;
    } else if (sec === 'INSURANCE') {
      headline = `Disiplinli teknik kârlılık ile büyüyen dev prim/yatırım havuzunu (Float) yüksek TL faiz ortamında bileşik nakit makinesine dönüştüren, %${roe.toFixed(1)} özkaynak kârlılığına rağmen sektör çarpanlarına göre belirgin iskonto sunan sigorta lideri.`;
    } else if (isTechOrDefense) {
      headline = `Yüksek katma değerli fikri mülkiyet (Ar-Ge), döviz bazlı sözleşme görünürlüğü ve +%${evaSpread.toFixed(1)} reel sermaye getirisiyle (ROIC > WACC) enflasyonist ortamda marjlarını koruyan büyüme ve nakit bileşikçisi.`;
    } else if (sec === 'AVIATION') {
      headline = `Döviz tabanlı küresel gelir mimarisi, güçlü operasyonel nakit akışı (OCF) ve sektör ortalamasının altındaki çarpan fiyatlamasıyla küresel ölçek avantajını bilançosuna yansıtan bayrak taşıyıcı değer tezi.`;
    } else if (sec === 'REIT') {
      headline = `Kira ve operasyonel nakit akışı üretim gücü, güçlü maddi duran varlık tabanı ve ${isNetCash ? 'net nakit bilançosuyla' : 'kontrollü LTV yapısıyla'} varlık değerine kıyasla derin güvenlik marjı sunan gayrimenkul portföyü.`;
    } else if (sec === 'HOLDING') {
      headline = `Farklı sektörlerdeki nakit üreten iştirak portföyü, solo bilançodaki döviz/nakit kalkanı ve Net Aktif Değerine (NAD) göre sunduğu çift katmanlı holding iskontosuyla asimetrik getiri fırsatı.`;
    } else {
      headline = `${sectorName} sektöründe %${ebitdaMargin.toFixed(1)} FAVÖK marjı, sermaye maliyetini aşan %${roic.toFixed(1)} reel ROIC performansı ve ${isNetCash ? 'net nakit bilançosuyla' : 'sağlıklı borç çevrimiyle'} operasyonel kalitesi piyasa tarafından henüz tam fiyatlanmamış değer fırsatı.`;
    }
  } else if (decisionMode === 'ALMA') {
    if (hasShadowHoldingRisk) {
      headline = `Ana faaliyetinden ürettiği nakdi çekirdek işini büyütmek yerine ilişkili taraflara / finansal yatırımlara aktaran (Gölge Holdingleşme Riski) ve operasyonel görünümü zayıflayan sermaye tahsisi uyarısı.`;
    } else if (isSupplierDebtDrivenOcf) {
      headline = `Net zarar açıklamasına rağmen faaliyet nakit akışının büyük kısmını tedarikçi vadelerini açarak (ticari borç biriktirerek) sağlayan, negatif EVA makasına sahip yüksek riskli değer tuzağı görünümü.`;
    } else {
      headline = `${sectorName} sektöründe daralan operasyonel marjlar, sermaye maliyetinin altında kalan getiri (Reel ROIC: %${roic.toFixed(1)} vs WACC: %${wacc.toFixed(1)}) ve zayıf nakit dönüşümü nedeniyle iskonto görünümünün temel kaliteyle desteklenmediği risk profili.`;
    }
  } else {
    if (isTfrs10) {
      headline = `TFRS 10 kapsamında ticari mal satışı yerine teknoloji ve girişim iştiraklerinin gerçeğe uygun değerlemesiyle büyüklük üreten, operasyonel çarpanlar yerine İştirak Portföyü Net Aktif Değeri (PD/NAD) üzerinden izlenmesi gereken portföy şirketi.`;
    } else {
      headline = `${sectorName} sektöründe ${isPositiveEva ? `pozitif sermaye getirisi (%${roic.toFixed(1)} ROIC) üretmesine karşın` : `mevcut marj ve sermaye maliyeti dengesinde`} güçlü bir güvenlik marjı veya nakit dönüşüm ivmesi teyit edilene kadar seçici izlenmesi gereken dengeli görünüm.`;
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

  if (decisionMode === 'AL') {
    // 1. Paragraf: Operasyonel Güç + Nakit Dönüşümü + Bilanço Kalkanı Sentezi
    const cashNarrative = ocf > 0
      ? `ürettiği operasyonel kârı kağıt üzerinde bırakmayıp ${(cashConv * 100).toFixed(0)}% dönüşüm oranıyla sıcak işletme nakdine (OCF) tahvil etmesi`
      : `operasyonel marj disipliniyle içsel fon yaratma kapasitesini koruması`;
    const balanceSheetNarrative = isNetCash
      ? `Bilançosundaki Net Nakit pozisyonu sayesinde, yüksek TL faiz ortamında bankalara finansman gideri ödemek yerine nakit varlıklarından faiz geliri yazarak net kâr marjını (%${netMargin.toFixed(1)}) rakiplerine karşı sigortalamaktadır.`
      : `Net Borç / FAVÖK rasyosunu ${netDebtToEbitda.toFixed(2)}x gibi yönetilebilir bir eşikte tutarak yüksek faiz ortamında finansman giderlerinin esas faaliyet kârını eritmesini engellemektedir.`;

    whyActionParagraphs.push(
      `${ticker} için oluşturduğumuz ALIM tezi, tek bir ucuzluk çarpanına değil; kârlılık kalitesi, sermaye verimliliği ve bilanço sağlamlığının aynı anda kesişmesine dayanmaktadır. Şirket, ${sectorName} sektöründe %${ebitdaMargin.toFixed(1)} FAVÖK marjı üretirken, ${cashNarrative} ile tahakkuk riskinden ayrışmaktadır. ${balanceSheetNarrative}`
    );

    // 2. Paragraf: Sermaye Verimliliği (ROIC vs WACC) + Büyüme + Çarpan Asimetrisi Sentezi
    const multComparison = compPe > 0 && secPe > 0 && compPe < secPe
      ? `Sektör medyanı ${secPe.toFixed(1)}x F/K seviyesindeyken şirketin ${compPe.toFixed(1)}x F/K (%${peDiscountPct.toFixed(0)} sektörel iskonto) ile işlem görmesi`
      : compEvEbitda > 0 && secEvEbitda > 0 && compEvEbitda < secEvEbitda
      ? `Sektör ortalaması ${secEvEbitda.toFixed(1)}x FD/FAVÖK seviyesindeyken şirketin ${compEvEbitda.toFixed(1)}x FD/FAVÖK çarpanıyla fiyatlanması`
      : `Mevcut ₺${input.currentPrice.toFixed(2)} fiyat seviyesinin 12 aylık ₺${input.fairValue.toFixed(2)} içsel değer hedefimize göre %${Math.abs(upsidePct).toFixed(1)} getiri potansiyeli taşıması`;

    whyActionParagraphs.push(
      `İkinci temel dayanak noktası, şirketin yatırdığı her 100 TL'lik sermayeden enflasyondan arındırılmış bazda %${roic.toFixed(1)} Reel ROIC üreterek %${wacc.toFixed(1)}'lik reel sermaye maliyetinin üzerinde (+${evaSpread.toFixed(1)} puan EVA) gerçek ekonomik değer yaratmasıdır. ${multComparison} ve önümüzdeki 12 ayda beklenen %${revGrowthProj.toFixed(0)} hasılat / %${netGrowthProj.toFixed(0)} net kâr büyüme projeksiyonu birleştiğinde, yatırımcıya hem çarpan genişlemesi (re-rating) hem de içsel özkaynak büyümesi sunan çift motorlu bir fırsat penceresi açılmaktadır.`
    );
  } else if (decisionMode === 'ALMA') {
    whyActionParagraphs.push(
      `${ticker} için modelimizin verdiği ALMA (Uzak Dur) kararı, hissenin yüzeysel çarpanlarından ziyade 4 boyutlu adli finansal stres testindeki yapısal kırılmalardan kaynaklanmaktadır. Şirketin reel sermaye getirisi (ROIC: %${roic.toFixed(1)}), reel sermaye maliyetinin (%${wacc.toFixed(1)}) ${evaSpread < 0 ? `${Math.abs(evaSpread).toFixed(1)} puan altında kalarak negatif ekonomik değer (sermaye erozyonu) üretmektedir` : `üzerinde kalıcı bir güvenlik marjı oluşturamamaktadır`}.`
    );
    whyActionParagraphs.push(
      `${hasShadowHoldingRisk
        ? `Buna ek olarak, şirketin esas faaliyetlerinden ürettiği kaynağı çekirdek işine yatırmak yerine grup içi ilişkili taraflara veya uzun vadeli finansal yatırımlara yönlendirmesi (${input.capAllocAudit?.summaryTitle || 'Gölge Holdingleşme & Sermaye Tahsisi Riski'}), azınlık hissedarlar açısından nakit akışı görünürlüğünü zedelemektedir.`
        : isSupplierDebtDrivenOcf
        ? `Nakit akışı tablosunda pozitif görünen işletme nakdinin esas faaliyet kârından değil, tedarikçi borç vadelerinin uzatılmasından (işletme sermayesi borçlanmasından) kaynaklanması ve net zarar trendi, hisseyi klasik bir 'Değer Tuzağı' konumuna sokmaktadır.`
        : `Operasyonel marjlardaki daralma (%${ebitdaMargin.toFixed(1)} FAVÖK marjı, %${netMargin.toFixed(1)} net marj) ve ${isNetCash ? 'zayıf serbest nakit üretimi' : `${netDebtToEbitda.toFixed(2)}x Net Borç/FAVÖK baskısı`}, içsel adil değerin (₺${input.fairValue.toFixed(2)}) piyasa fiyatının (₺${input.currentPrice.toFixed(2)}) altında kalmasına yol açmaktadır.`}`
    );
  } else {
    // NÖTR
    if (isTfrs10) {
      whyActionParagraphs.push(
        `${ticker}, TFRS 10 kapsamında bir 'Yatırım İşletmesi / Girişim Sermayesi Portföyü' statüsünde faaliyet gösterdiği için klasik sanayi veya yazılım şirketleri gibi satış/FAVÖK büyümesi üzerinden değil, elindeki iştirak portföyünün gerçeğe uygun değer artışı ve çıkış (exit/halka arz) potansiyeli üzerinden değerlendirilmelidir.`
      );
      whyActionParagraphs.push(
        `Şirketin ${formatMoneyCompact(equity)} büyüklüğündeki borçsuz özkaynak (Net Aktif Değer) tabanı ve ${compPb > 0 ? `${compPb.toFixed(2)}x PD/DD çarpanı` : 'mevcut piyasa fiyatlaması'}, holding/girişim sermayesi iskonto normlarıyla uyumlu bir denge sunmaktadır. Yeni bir iştirak halka arzı veya nakit temettü/çıkış katalizörü gerçekleşene kadar NÖTR (İzle) duruşu korunmaktadır.`
      );
    } else {
      whyActionParagraphs.push(
        `${ticker}, ${sectorName} sektöründe %${ebitdaMargin.toFixed(1)} FAVÖK marjı ve %${roic.toFixed(1)} Reel ROIC ile faaliyet göstermesine karşın, mevcut ₺${input.currentPrice.toFixed(2)} piyasa fiyatı ile ₺${input.fairValue.toFixed(2)} içsel adil değerimiz arasındaki makas (%${upsidePct >= 0 ? `+${upsidePct.toFixed(1)}` : upsidePct.toFixed(1)}), yüksek enflasyon ve faiz ortamında talep ettiğimiz asgari güvenlik marjı eşiğini henüz tam olarak aşamamaktadır.`
      );
      whyActionParagraphs.push(
        `Kriterler harmanlandığında; şirketin ${isPositiveEva ? 'pozitif EVA üretimi ve operasyonel duruşu olumlu olmakla birlikte' : 'sermaye maliyeti baskısı ve marj dengesi gözetildiğinde'}, agresif alım için ya çarpanlarda geri çekilme (daha derin iskonto) ya da serbest nakit akışı dönüşümünde (${(cashConv * 100).toFixed(0)}%) ve çeyreklik marjlarda yukarı yönlü bir kırılım beklenmelidir.`
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

  if (decisionMode === 'AL') {
    if (input.isTms29 && ocf > netIncome && netIncome >= 0) {
      opportunityMechanismTag = 'TMS 29 MUHASEBE PERDESİ vs. GÜÇLÜ NAKİT KASASI';
      opportunitySourceNarrative = `Piyasa şu an ${ticker} hissesini yalnızca gelir tablosunun en alt satırındaki TMS 29 enflasyon muhasebesi (parasallık düzeltmesi ve stok endekslemesi) baskısıyla değerlendirme yanılgısına düşmektedir. Oysa nakit akış tablosu incelendiğinde, şirketin net kârının ${(cashConv * 100).toFixed(0)}% üzerinde gerçek sıcak işletme nakdi (OCF) ürettiği görülmektedir. Muhasebesel ve nakit çıkışı gerektirmeyen düzeltmeler geçici olarak kârı törpülerken, kasaya giren gerçek nakit şirketin içsel değerini ₺${input.fairValue.toFixed(2)} seviyesine taşımaktadır.`;
    } else if (isNetCash && isPositiveEva) {
      opportunityMechanismTag = 'YÜKSEK FAİZ ORTAMINDA NET NAKİT & POZİTİF EVA ASİMETRİSİ';
      opportunitySourceNarrative = `Borsa İstanbul'da yüksek faiz politikası nedeniyle sanayi ve hizmet şirketlerinin tamamına piyasa tarafından toptancı bir 'finansman gideri iskontosu' uygulanmaktadır. Ancak piyasanın gözden kaçırdığı kritik ayrım şudur: ${ticker} borçlu bir şirket değil, bilançosunda Net Nakit taşıyan ve +%${evaSpread.toFixed(1)} pozitif EVA üreten bir nakit kalesidir. Yüksek faiz ortamı borçlu rakiplerini zayıflatırken ${ticker}'in pazar payını ve finansal gelirlerini beslemekte; bu da mevcut fiyatlamada belirgin bir piyasa verimsizliği (fırsat) yaratmaktadır.`;
    } else if (capex > 0 && ocf > 0 && (capex / Math.max(ocf, 1)) >= 0.45) {
      opportunityMechanismTag = 'YATIRIM (CAPEX) EVRESİNDEN NAKİT HASADI EVRESİNE GEÇİŞ';
      opportunitySourceNarrative = `Şirket son dönemlerde kapasite ve verimlilik yatırımları (CapEx) nedeniyle nakit akışının önemli bir bölümünü büyümeye yönlendirmiştir. Kısa vadeli düşünen piyasa oyuncuları yatırım harcamaları nedeniyle baskılanan serbest nakit akışına odaklanırken, bu yatırımların devreye girmesiyle oluşacak %${revGrowthProj.toFixed(0)} hasılat ve %${netGrowthProj.toFixed(0)} net kâr sıçramasını henüz fiyatlamamıştır. Yatırım döngüsünün tamamlanıp 'Nakit Hasadı' evresine geçilmesi ana yeniden değerleme (re-rating) kaynağıdır.`;
    } else if ((compPe > 0 && compPe < secPe * 0.85) || (compEvEbitda > 0 && compEvEbitda < secEvEbitda * 0.85)) {
      opportunityMechanismTag = 'KALİTE - ÇARPAN ANOMALİSİ (SEKTÖR ÜSTÜ GETİRİ, SEKTÖR ALTI ÇARPAN)';
      opportunitySourceNarrative = `Finansal teoride özkaynak kârlılığı (%${roe.toFixed(1)} ROE) ve sermaye getirisi (%${roic.toFixed(1)} ROIC) sektör ortalamasının üzerinde olan şirketlerin sektöre göre primli işlem görmesi gerekir. Ancak ${ticker}, üstün sermaye verimliliğine rağmen ${sectorName} sektör medyanının altında (${compPe > 0 ? `${compPe.toFixed(1)}x F/K vs Sektör ${secPe.toFixed(1)}x` : `${compEvEbitda.toFixed(1)}x FD/FAVÖK vs Sektör ${secEvEbitda.toFixed(1)}x`}) fiyatlanmaktadır. Bu kalite-çarpan anomalisi, hisse başına ₺${input.fairValue.toFixed(2)} hedef değerimize giden en somut güvenlik marjını oluşturmaktadır.`;
    } else {
      opportunityMechanismTag = 'İÇSEL SERMAYE BİRİKİMİ & GELECEK KÂR İVMESİ';
      opportunitySourceNarrative = `Piyasa, şirketin geçmiş çeyreklerdeki baz etkisini ileriye doğrusal olarak taşırken; şirketin maliyet optimizasyonu, %${ebitdaMargin.toFixed(1)} FAVÖK marjı disiplini ve 12 aylık ileri projeksiyondaki %${netGrowthProj.toFixed(0)} kâr büyüme kapasitesini iskonto etmektedir. Sermaye maliyetini aşan (+${evaSpread.toFixed(1)} puan) değer üretimi korundukça, içsel özkaynak birikimi hisse fiyatını adil değerine (₺${input.fairValue.toFixed(2)}) yakınsatacaktır.`;
    }
  } else if (decisionMode === 'ALMA') {
    opportunityMechanismTag = hasShadowHoldingRisk
      ? 'GÖLGE HOLDİNGLEŞME & SERMAYE TAHSİSİ RİSKİ'
      : isSupplierDebtDrivenOcf
      ? 'TEDARİKÇİ BORCUYLA FİNANSE EDİLEN OPTİK NAKİT TUZAĞI'
      : 'NEGATİF EVA & SERMAYE EROZYONU RİSKİ';
    opportunitySourceNarrative = `Bireysel yatırımcılar çoğu zaman hissenin zirvesinden düşmüş olmasına veya tek bir çarpanın (örneğin PD/DD'nin) düşük görünmesine bakarak burada bir 'fırsat' olduğunu düşünebilir. Ancak adli denetimimiz, ${
      hasShadowHoldingRisk
        ? `şirketin kasasındaki nakdin çekirdek operasyona değil grup içi/finansal yatırımlara kaydırıldığını ve ana işkolunun nakit dönüşümünün zayıfladığını`
        : isSupplierDebtDrivenOcf
        ? `raporlanan işletme nakdinin operasyonel kârdan değil, ödenmeyen tedarikçi borçlarından (ticari borç artışından) geldiğini ve şirketin net zararda olduğunu`
        : `şirketin sermaye maliyetinin (%${wacc.toFixed(1)}) altında getiri (%${roic.toFixed(1)} ROIC) üreterek her çeyrek reel özkaynak erozyonu yaşadığını`
    } ortaya koymaktadır. Kalite ve nakit doğrulaması olmayan ucuzluk bir fırsat değil, değer tuzağıdır.`;
  } else {
    opportunityMechanismTag = isTfrs10 ? 'TFRS 10 NET AKTİF DEĞER & ÇIKIŞ (EXIT) OPSİYONU' : 'TAM FİYATLANMIŞ KALİTE / KATALİZÖR BEKLENTİSİ';
    opportunitySourceNarrative = isTfrs10
      ? `${ticker} için esas fırsat mekanizması klasik ürün satışı değil, portföyündeki teknoloji ve girişim iştiraklerinin büyümesi, yeni yatırım turlarında daha yüksek değerlemeye ulaşması veya halka arz (IPO) yoluyla nakde dönmesidir. Mevcut ${compPb > 0 ? `${compPb.toFixed(2)}x PD/NAD` : 'çarpan'} seviyesi portföyün defter değerini makul bir holding iskontosuyla yansıtmaktadır.`
      : `Piyasa, ${ticker} hissesinin mevcut operasyonel kalitesini ve %${ebitdaMargin.toFixed(1)} FAVÖK marjını güncel ₺${input.currentPrice.toFixed(2)} fiyat seviyesinde büyük ölçüde doğru fiyatlamaktadır. Burada yeni ve güçlü bir alım fırsatı doğması için ya önümüzdeki çeyreklerde FAVÖK marjının ve serbest nakit akışının beklentileri aşması ya da piyasa dalgalanmalarında hissenin ₺${(input.fairValue * 0.80).toFixed(2)} ve altındaki güvenlik marjı bölgesine çekilmesi gerekmektedir.`;
  }

  // ---------------------------------------------------------------------------
  // 4. SEKTÖREL REKABET AVANTAJI (BU SEKTÖRDE NEDEN ÖNE ÇIKIYOR?)
  // ---------------------------------------------------------------------------
  const sectoralEdgeTitle = `${sectorName} Sektöründeki Konumu`;
  let sectoralEdgeNarrative = '';

  if (sec === 'RETAIL') {
    sectoralEdgeNarrative = `Perakende sektöründe rekabeti belirleyen ana unsur mağaza/kanal başına stok devir hızı (${assetTurnover.toFixed(2)}x aktif devir hızı) ve tedarikçi finansman gücüdür. ${ticker}, yüksek marka/kanal gücü sayesinde ürünlerini hızla nakde çevirirken tedarikçi vadelerinden yararlanmakta; böylece işletme sermayesi için banka kredisine ihtiyaç duymadan büyümektedir. ${peerListStr ? `BIST ${sectorName} sektöründeki akranları (${peerListStr}) ile kıyaslandığında` : `Sektör genelinde`} %${grossMargin.toFixed(1)} brüt kâr marjı ve ${isNetCash ? 'net nakit kalkanı' : `${netDebtToEbitda.toFixed(2)}x borçluluk rasyosu`} ile sektörel maliyet enflasyonunu fiyatlarına en hızlı yansıtan oyuncular arasında öne çıkmaktadır.`;
  } else if (sec === 'INSURANCE') {
    sectoralEdgeNarrative = `Sigortacılık sektöründe gerçek üstünlük sadece poliçe kesmek değil, hasar/prim dengesini (teknik kârlılığı) koruyarak toplanan devasa prim havuzunu (Float: ${formatMoneyCompact(cashAndInv)}) yüksek getirili finansal araçlarda nemalandırmaktır. ${ticker}, güçlü acente/banka dağıtım ağı ve disiplinli risk seçimiyle %${roe.toFixed(1)} özkaynak kârlılığına ulaşırken, ${peerListStr ? `sektördeki diğer oyunculara (${peerListStr}) kıyasla` : 'sektör ortalamasına göre'} sermaye yeterliliğini ve temettü dağıtım kapasitesini en güçlü büyüten kurumların başında gelmektedir.`;
  } else if (sec === 'DEFENSE' || sec === 'TECH_SW') {
    sectoralEdgeNarrative = `${sectorName} sektöründe şirketleri ayrıştıran en kritik kriter, tekrarlayan sözleşme/sipariş bakiyesi (Backlog), Ar-Ge fikri mülkiyet duvarı ve nitelikli mühendislik ölçeğidir. ${ticker}, yüksek giriş bariyerine sahip iş modeliyle %${grossMargin.toFixed(1)} brüt marj ve %${ebitdaMargin.toFixed(1)} FAVÖK marjı üretirken, ${peerListStr ? `sektör akranları (${peerListStr}) arasında` : 'sektör içinde'} döviz bazlı/enflasyona endeksli gelir yapısı ve %${roic.toFixed(1)} reel sermaye getirisiyle ayrışmaktadır.`;
  } else if (sec === 'AVIATION') {
    sectoralEdgeNarrative = `Havacılık ve ulaştırma sektöründe küresel hub (merkez) konumu, yüksek yolcu doluluk oranı, kargo gelir çeşitliliği ve birim koltuk maliyeti (CASK) kontrolü rekabetin anahtarıdır. ${ticker}, gelirlerinin büyük bölümünü döviz bazında kazanırken operasyonel nakit akışını (OCF) güçlü tutmakta ve küresel/yerel akranlarına kıyasla çok daha cazip FD/FAVÖK (${compEvEbitda > 0 ? `${compEvEbitda.toFixed(1)}x` : 'iskontolu'}) çarpanıyla işlem görmektedir.`;
  } else if (sec === 'REIT') {
    sectoralEdgeNarrative = `GYO sektöründe birçok şirket yalnızca yılda bir kez yapılan yeniden değerleme (kağıt üzerindeki değer artışı) ile kâr yazarken, ${ticker} ${ocf > 0 ? 'gerçek kira ve proje nakit akışı üretimiyle' : 'portföy büyüklüğüyle'} ve ${isNetCash ? 'sıfır net borç (Net Nakit) avantajıyla' : 'kontrollü bilanço kaldıraç yapısıyla'} öne çıkmaktadır. 7524 sayılı kanun kapsamındaki yeni GYO vergi/temettü rejimi altında, düzenli nakit üreten ve borçsuz GYO'lar sektörde pozitif ayrışmaktadır.`;
  } else if (sec === 'HOLDING' || isTfrs10) {
    sectoralEdgeNarrative = `${isTfrs10 ? 'Girişim sermayesi ve yatırım şirketleri' : 'Holdingler'} arasında fark yaratan temel unsur, solo bilançodaki nakit/borç disiplini ve iştirak portföyünün çeşitliliğidir. ${ticker}, ${isNetCash ? 'solo düzeyde net nakit pozisyonuna sahip olması' : 'dengeli finansal yapısı'} ve ${compPb > 0 ? `${compPb.toFixed(2)}x PD/DD (PD/NAD)` : 'iskontolu'} çarpanıyla yatırımcıya iştirak portföyüne doğrudan iskontolu ortak olma imkanı sunmaktadır.`;
  } else {
    sectoralEdgeNarrative = `BIST ${sectorName} sektöründe (${peerListStr || 'akran grubu'}) birçok şirket yüksek işletme sermayesi ihtiyacı ve artan kredi faizleri nedeniyle marj daralması yaşarken; ${ticker} %${grossMargin.toFixed(1)} brüt marj, %${ebitdaMargin.toFixed(1)} FAVÖK marjı ve ${isNetCash ? 'Net Nakit bilançosu' : `${netDebtToEbitda.toFixed(2)}x Net Borç/FAVÖK disiplini`} ile öne çıkmaktadır. Şirketin %${roic.toFixed(1)} Reel ROIC performansı, sektördeki ortalama sermaye getirisinin üzerinde kalarak fiyatlama gücünü (pricing power) kanıtlamaktadır.`;
  }

  // Sektörel Karşılaştırma Rozetleri (3-4 Somut Kıyaslama)
  const sectoralComparisonBadges: SectorComparisonBadge[] = [
    {
      label: 'F/K (Fiyat / Kazanç)',
      companyValue: compPe > 0 ? `${compPe.toFixed(1)}x` : 'Negatif / AD',
      benchmarkValue: `Sektör: ${secPe.toFixed(1)}x`,
      verdict: compPe > 0 && compPe < secPe
        ? `Sektöre göre %${Math.min(90, Math.abs(peDiscountPct)).toFixed(0)} daha ucuz`
        : compPe > 0
        ? `Sektöre göre %${Math.min(99, Math.abs(peDiscountPct)).toFixed(0)} primli`
        : 'Net kâr bazında çarpan oluşmadı',
      isAdvantage: compPe > 0 && compPe <= secPe * 1.05
    },
    {
      label: 'FD / FAVÖK &PD/DD',
      companyValue: compEvEbitda > 0 ? `${compEvEbitda.toFixed(1)}x FD/FAVÖK` : `${compPb > 0 ? `${compPb.toFixed(2)}x PD/DD` : '—'}`,
      benchmarkValue: compEvEbitda > 0 ? `Sektör: ${secEvEbitda.toFixed(1)}x` : `Sektör: ${secPb.toFixed(2)}x`,
      verdict: compEvEbitda > 0
        ? (compEvEbitda <= secEvEbitda ? `Operasyonel kâra göre %${Math.abs(evEbitdaDiscountPct).toFixed(0)} iskontolu` : 'Operasyonel çarpan sektör üstü')
        : (compPb > 0 && compPb <= secPb ? `Defter değerine göre %${Math.abs(pbDiscountPct).toFixed(0)} iskontolu` : 'Defter değeri çarpanı dengeli'),
      isAdvantage: compEvEbitda > 0 ? compEvEbitda <= secEvEbitda * 1.05 : (compPb > 0 && compPb <= secPb * 1.05)
    },
    {
      label: 'Sermaye Getirisi (Reel ROIC)',
      companyValue: `%${roic.toFixed(1)}`,
      benchmarkValue: `Reel WACC: %${wacc.toFixed(1)}`,
      verdict: isPositiveEva
        ? `+${evaSpread.toFixed(1)} Puan Reel Değer Üretimi`
        : `${evaSpread.toFixed(1)} Puan Sermaye Erozyonu`,
      isAdvantage: isPositiveEva
    },
    {
      label: 'Bilanço & Borçluluk Kalkanı',
      companyValue: isNetCash ? 'Net Nakit' : `${netDebtToEbitda.toFixed(2)}x NB/FAVÖK`,
      benchmarkValue: 'Güvenli Eşik: <1.50x',
      verdict: isNetCash
        ? 'Sıfır Net Borç • Faiz Geliri Avantajı'
        : netDebtToEbitda <= 1.5
        ? 'Düşük Kaldıraç • Güvenli Borç Çevrimi'
        : 'Yüksek Faiz Ortamında Borç Baskısı',
      isAdvantage: isNetCash || netDebtToEbitda <= 1.8
    }
  ];

  // ---------------------------------------------------------------------------
  // 5. ÖNE ÇIKAN 4 SOMUT AYIRT EDİCİ ÖZELLİK (STANDOUT HIGHLIGHTS)
  // ---------------------------------------------------------------------------
  const standoutHighlights: StandoutHighlight[] = [
    {
      tag: 'SERMAYE VERİMLİLİĞİ',
      title: isPositiveEva
        ? `Reel Sermaye Maliyetini Aşan Değer Üretimi (+${evaSpread.toFixed(1)} Puan EVA)`
        : `Sermaye Maliyetinin Altında Getiri (${evaSpread.toFixed(1)} Puan EVA)`,
      detail: `Şirket yatırdığı sermayeden reel bazda %${roic.toFixed(1)} getiri (ROIC) elde ederken, %${roe.toFixed(1)} özkaynak kârlılığı (ROE) ile çalışmaktadır.`,
      tone: isPositiveEva ? 'emerald' : 'rose'
    },
    {
      tag: 'NAKİT AKIŞ KALİTESİ',
      title: ocf > 0 && !isSupplierDebtDrivenOcf
        ? `Güçlü İşletme Nakit Üretimi (OCF / Net Kâr: ${(cashConv * 100).toFixed(0)}%)`
        : isSupplierDebtDrivenOcf
        ? `Tedarikçi Vadelerine Dayalı Kırılgan Nakit Akışı`
        : `Zayıf İşletme Nakit Dönüşümü ve Tahakkuk Baskısı`,
      detail: ocf > 0 && !isSupplierDebtDrivenOcf
        ? `Raporlanan muhasebe kârı sıcak nakit akışıyla desteklenmekte olup ${fcf > 0 ? 'Serbest Nakit Akışı (FCF) pozitiftir.' : 'üretilen nakit kapasite yatırımlarını (CapEx) finanse etmektedir.'}`
        : `Operasyonel kârın serbest nakde dönüşümünde işletme sermayesi (stok ve alacak) baskısı izlenmektedir.`,
      tone: ocf > 0 && !isSupplierDebtDrivenOcf ? 'cyan' : 'rose'
    },
    {
      tag: 'BİLANÇO MİMARİSİ',
      title: isNetCash
        ? `Net Nakit Kalesi & Yüksek Faiz Bağışıklığı`
        : netDebtToEbitda <= 1.8
        ? `Kontrollü Finansal Kaldıraç (${netDebtToEbitda.toFixed(2)}x Net Borç/FAVÖK)`
        : `Yüksek Finansal Borç Yükü (${netDebtToEbitda.toFixed(2)}x Net Borç/FAVÖK)`,
      detail: isNetCash
        ? `Finansal borçlarını aşan nakit/yatırım varlıkları sayesinde kredi faiz şoklarından etkilenmez; aksine mevduat/yatırım getirisi yazar.`
        : `Cari oran ${currentRatio.toFixed(2)}x seviyesinde olup kısa vadeli yükümlülüklerin çevrimi ${currentRatio >= 1.2 ? 'güvenli bölgededir.' : 'yakın likidite takibi gerektirir.'}`,
      tone: isNetCash ? 'emerald' : netDebtToEbitda <= 1.8 ? 'amber' : 'rose'
    },
    {
      tag: 'DEĞERLEME & HEDEF POTANSİYEL',
      title: upsidePct >= 15
        ? `Adil Değere Göre +%${upsidePct.toFixed(1)} Yükseliş Potansiyeli (₺${input.fairValue.toFixed(2)})`
        : upsidePct >= 0
        ? `İçsel Değerine Yakın Dengeli Fiyatlama (+%${upsidePct.toFixed(1)})`
        : `İçsel Değerinin Üzerinde Primli Fiyatlama (%${upsidePct.toFixed(1)})`,
      detail: `${targetMultLabel} ve %${netGrowthProj.toFixed(0)} ileri kâr büyümesi baz alındığında ${
        input.consensusTargetPrice
          ? `model hedefimiz ₺${input.fairValue.toFixed(2)} (Piyasa Konsensüsü: ₺${input.consensusTargetPrice.toFixed(2)}) seviyesindedir.`
          : `12 aylık ağırlıklı adil değerimiz ₺${input.fairValue.toFixed(2)} olarak hesaplanmıştır.`
      }`,
      tone: upsidePct >= 15 && decisionMode === 'AL' ? 'emerald' : upsidePct < 0 || decisionMode === 'ALMA' ? 'rose' : 'amber'
    }
  ];

  // ---------------------------------------------------------------------------
  // 6. DÖRT HARMANLANMIŞ KARAR SÜTUNU (4-PILLAR SYNTHESIS MATRIX)
  // ---------------------------------------------------------------------------
  const moatGood = ebitdaMargin >= 14 || grossMargin >= 25 || (sec === 'RETAIL' && assetTurnover >= 1.4) || (sec === 'INSURANCE' && roe >= 30);
  const capGood = isPositiveEva && roe >= 20;
  const cashGood = ocf > 0 && !isSupplierDebtDrivenOcf && (isNetCash || netDebtToEbitda <= 2.0) && !hasShadowHoldingRisk;
  const valGood = upsidePct >= 18 && (compPe <= secPe * 1.1 || compEvEbitda <= secEvEbitda * 1.1 || compPb <= secPb * 1.1);

  const pillars: SynthesizedPillar[] = [
    {
      id: 'moat',
      title: '1. Fiyatlama Gücü ve Marjlar',
      subtitle: `${sectorName} Sektörel Marj Kalitesi`,
      status: moatGood ? 'GÜÇLÜ' : ebitdaMargin >= 8 ? 'DENGELİ' : 'ZAYIF',
      badgeTone: moatGood ? 'positive' : ebitdaMargin >= 8 ? 'neutral' : 'negative',
      badgeText: moatGood ? 'Yüksek Kalkan' : ebitdaMargin >= 8 ? 'Sektörel Standart' : 'Marj Baskısı',
      metrics: [
        { label: 'Brüt Marj', value: `%${grossMargin.toFixed(1)}`, isPositive: grossMargin >= 22 },
        { label: 'FAVÖK Marjı', value: `%${ebitdaMargin.toFixed(1)}`, isPositive: ebitdaMargin >= 14 },
        { label: 'Aktif Devir', value: `${assetTurnover.toFixed(2)}x`, isPositive: assetTurnover >= 0.7 }
      ],
      narrative: moatGood
        ? `Şirket, maliyet enflasyonunu satış fiyatlarına yansıtabilme kabiliyeti (%${grossMargin.toFixed(1)} brüt marj) ve %${ebitdaMargin.toFixed(1)} FAVÖK marjı ile sektörde güçlü bir rekabet avantajı sergilemektedir.`
        : `Artan üretim ve faaliyet giderleri operasyonel marjları (%${ebitdaMargin.toFixed(1)} FAVÖK marjı) sınırlamakta olup, kârlılık için hacim artışı ve maliyet disiplini kritik önemdedir.`
    },
    {
      id: 'capital',
      title: '2. Sermaye Getirisi & Değer Üretimi',
      subtitle: 'Sermaye Maliyetine Göre Reel Getiri',
      status: capGood ? 'GÜÇLÜ' : isPositiveEva ? 'DENGELİ' : 'ZAYIF',
      badgeTone: isPositiveEva ? 'positive' : evaSpread >= -2 ? 'neutral' : 'negative',
      badgeText: isPositiveEva ? `+${evaSpread.toFixed(1)} Puan EVA` : `${evaSpread.toFixed(1)} Puan Negatif EVA`,
      metrics: [
        { label: 'Reel ROIC', value: `%${roic.toFixed(1)}`, isPositive: roic > wacc },
        { label: 'Reel WACC', value: `%${wacc.toFixed(1)}`, isPositive: true },
        { label: 'ROE', value: `%${roe.toFixed(1)}`, isPositive: roe >= 25 }
      ],
      narrative: isPositiveEva
        ? `Yatırılan sermaye üzerinden elde edilen %${roic.toFixed(1)} reel getiri, %${wacc.toFixed(1)}'lik sermaye maliyetini aşarak hissedarlar için her çeyrek reel ekonomik katma değer (EVA) yaratmaktadır.`
        : `Yatırılan sermaye getirisi (%${roic.toFixed(1)} ROIC) henüz reel sermaye maliyetini (%${wacc.toFixed(1)} WACC) karşılayamamakta; bu durum içsel büyümenin değer yaratmasını zorlaştırmaktadır.`
    },
    {
      id: 'cash_fortress',
      title: '3. Nakit Üretimi & Bilanço Gücü',
      subtitle: 'Operasyonel Nakit & Borçluluk',
      status: (isNetCash && ocf > 0) || (ocf > 0 && cashGood) ? 'GÜÇLÜ' : (ocf > 0 && !hasShadowHoldingRisk) ? 'DENGELİ' : 'ZAYIF',
      badgeTone: hasShadowHoldingRisk ? 'negative' : (ocf > 0) ? 'positive' : 'negative',
      badgeText: hasShadowHoldingRisk
        ? 'Sermaye Tahsisi Uyarısı'
        : isNetCash && ocf > 0
        ? 'Net Nakit & Güçlü OCF'
        : ocf > 0
        ? 'Pozitif İşletme Nakdi'
        : 'Nakit Çıkışı / Borç Baskısı',
      metrics: [
        { label: 'OCF / Net Kâr', value: `${cashConvPct.toFixed(0)}%`, isPositive: cashConv >= 0.8 && ocf > 0 },
        { label: 'Net Borç/FAVÖK', value: isNetCash ? 'Net Nakit' : `${netDebtToEbitda.toFixed(2)}x`, isPositive: isNetCash || netDebtToEbitda <= 1.8 },
        { label: 'Cari Oran', value: `${currentRatio.toFixed(2)}x`, isPositive: currentRatio >= 1.2 }
      ],
      narrative: hasShadowHoldingRisk
        ? `Şirketin nakit kaynaklarının önemli bir kısmının ana faaliyet dışı finansal yatırımlara / grup içi alacaklara yönelmesi nedeniyle sermaye tahsisi kalitesi ihtiyatlı izlenmelidir.`
        : cashGood
        ? `Operasyonel kârın güçlü biçimde kasaya nakit olarak girmesi ve ${isNetCash ? 'Net Nakit kalkanı' : 'düşük borçluluk oranı'}, şirketi makro faiz şoklarına karşı tam korumalı kılmaktadır.`
        : `İşletme sermayesi döngüsü (alacak ve stok finansmanı) veya yatırım harcamaları nakit üretimini baskılamakta olup, serbest nakit akışı dönüşümü yakından takip edilmelidir.`
    },
    {
      id: 'asymmetry',
      title: '4. Çarpan İskontosu & Büyüme Potansiyeli',
      subtitle: 'Sektörel Çarpanlar & İleri Projeksiyon',
      status: valGood ? 'GÜÇLÜ' : upsidePct >= 5 ? 'DENGELİ' : 'ZAYIF',
      badgeTone: valGood ? 'positive' : upsidePct >= 0 ? 'neutral' : 'negative',
      badgeText: upsidePct >= 0 ? `+%${upsidePct.toFixed(1)} Potansiyel` : `%${upsidePct.toFixed(1)} Primli`,
      metrics: [
        { label: 'F/K vs Sektör', value: compPe > 0 ? `${compPe.toFixed(1)}x / ${secPe.toFixed(1)}x` : `— / ${secPe.toFixed(1)}x`, isPositive: compPe > 0 && compPe <= secPe },
        { label: '12A Kâr Büyüme', value: `%${netGrowthProj.toFixed(0)}`, isPositive: netGrowthProj >= 25 },
        { label: 'Adil Değer', value: `₺${input.fairValue.toFixed(2)}`, isPositive: input.fairValue > input.currentPrice }
      ],
      narrative: valGood
        ? `Şirket hem sektör çarpanlarına göre cazip bir iskontoyla işlem görmekte hem de %${revGrowthProj.toFixed(0)} hasılat / %${netGrowthProj.toFixed(0)} kâr büyüme beklentisiyle ₺${input.fairValue.toFixed(2)} adil değere güçlü bir asimetri sunmaktadır.`
        : `Mevcut ₺${input.currentPrice.toFixed(2)} fiyat seviyesi, ${sectorName} sektörü çarpanları ve %${netGrowthProj.toFixed(0)} ileri kâr büyüme beklentisiyle kıyaslandığında ${upsidePct >= 0 ? 'sınırlı bir güvenlik marjı' : 'primli bir fiyatlama'} sunmaktadır.`
    }
  ];

  // ---------------------------------------------------------------------------
  // 7. KİLİT KATALİZÖRLER VS. TEZİ BOZACAK KIRMIZI ÇİZGİLER (THESIS BREAKERS)
  // ---------------------------------------------------------------------------
  const catalysts: string[] = [
    `12 aylık ileri projeksiyonda beklenen %${revGrowthProj.toFixed(1)} hasılat büyümesi ve %${netGrowthProj.toFixed(1)} net kâr artışının çeyreklik bilançolarda teyit edilmesiyle çarpanların ${targetMultLabel} hedefine yakınsaması.`,
    isNetCash
      ? `Net Nakit bilançonun yüksek faiz ortamında ürettiği finansal gelir katkısı ve olası temettü / kapasite artırım hamlelerinin özkaynak kârlılığını (%${roe.toFixed(1)}) desteklemesi.`
      : `Dezenflasyon sürecinde politika faizlerinde başlayacak kademeli indirim döngüsünün şirketin finansman giderlerini düşürerek net kâr marjını (%${netMargin.toFixed(1)}) hızla genişletmesi.`,
    sec === 'RETAIL'
      ? `Yeni mağaza/online kanal açılışları ve sepet büyüklüğü artışıyla negatif işletme sermayesi nakit havuzunun (Float) büyümeye devam etmesi.`
      : sec === 'INSURANCE'
      ? `Artan poliçe prim üretimiyle büyüyen yatırım portföyünün (${formatMoneyCompact(cashAndInv)}) yüksek TL mevduat/tahvil getirilerinden rekor finansal gelir yazmaya devam etmesi.`
      : isTechOrDefense
      ? `Yeni ihracat/bakiye sipariş (Backlog) sözleşmelerinin açıklanması ve Ar-Ge tabanlı yüksek marjlı ürünlerin toplam ciro içindeki payının artması.`
      : isTfrs10
      ? `Portföydeki teknoloji ve girişim sermayesi iştiraklerinden yeni bir halka arz (IPO), stratejik blok satış veya yüksek çarpanlı yatırım turu gerçekleşmesi.`
      : `${sectorName} sektöründe (${compEvEbitda > 0 ? `${compEvEbitda.toFixed(1)}x FD/FAVÖK vs Sektör ${secEvEbitda.toFixed(1)}x` : `${compPe > 0 ? `${compPe.toFixed(1)}x F/K vs Sektör ${secPe.toFixed(1)}x` : 'mevcut çarpanlar'}`}) tarihsel ortalamalara göre oluşan iskonto makasının kapanması (Re-rating).`
  ];

  const minSafeEbitdaMargin = Math.max(5.0, Number((ebitdaMargin * 0.78).toFixed(1)));
  const thesisBreakers: string[] = [
    `Operasyonel Marj Kırılımı: Şirketin çekirdek FAVÖK marjının (%${ebitdaMargin.toFixed(1)}) maliyet baskısı veya fiyat rekabetiyle üst üste 2 çeyrek %${minSafeEbitdaMargin} eşiğinin altına sarkması.`,
    isPositiveEva
      ? `Sermaye Getirisi Erozyonu: Reel ROIC performansının (%${roic.toFixed(1)}) gerileyerek %${wacc.toFixed(1)} olan Reel WACC eşiğinin altına inmesi ve EVA makasının negatife dönmesi.`
      : `Kronik Negatif EVA Devamı: Reel ROIC'in (%${roic.toFixed(1)}) sermaye maliyetinin (%${wacc.toFixed(1)}) altında kalmaya devam ederek özkaynaklarda reel erimeyi derinleştirmesi.`,
    hasShadowHoldingRisk
      ? `Sermaye Tahsisi Riski: Ana faaliyetten üretilen nakdin çekirdek operasyon yerine ilişkili taraflara / finansal yatırımlara aktarılmasının devam etmesi ve nakit dönüşümünün bozulması.`
      : `Nakit Akışı & İşletme Sermayesi Bozulması: Faaliyet nakit akışının (OCF) ticari alacak tahsilat sürelerinin uzaması veya stok birikimi nedeniyle negatife dönmesi ${!isNetCash ? `veya Net Borç/FAVÖK rasyosunun (${netDebtToEbitda.toFixed(2)}x) 2.50x tehlike sınırını aşması` : 've net nakit tamponunun erimesi'}.`
  ];

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
    thesisBreakers
  };
}
