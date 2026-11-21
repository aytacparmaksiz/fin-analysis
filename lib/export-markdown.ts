import { formatAnalysisDate, parseNumericScore } from './report-resolver.ts';
import type { SavedReport } from './report-resolver.ts';
import { calculateDuPont5Step, calculateCompanyMultiples, parsePeriodSortKey, parseFinancialNumber } from './valuation.ts';
import { FinancialRatioEngine } from './ratio-engine.ts';
import { detectSector } from './sectors.ts';

export function generateFullAuditMarkdown(report: SavedReport): string {
  if (!report) return '';

  const ext = report.extractedData || {};
  const history: any[] = Array.isArray(ext.financial_history) ? [...ext.financial_history] : [];
  // Sort newest to oldest using robust period key
  const sortedHistory = [...history].sort((a, b) => parsePeriodSortKey(b?.period) - parsePeriodSortKey(a?.period));
  const periods = sortedHistory.map(h => h.period || '-');
  const latestItem = sortedHistory[0];

  const resolvedSector = report.sector || ext.sector || detectSector(report.ticker, ext.company_name);
  const rawCurrency = String(ext.currency || latestItem?.currency || 'TRY').replace(/^(?:tam|bin|birim)\s+/i, '').trim().toUpperCase();
  const currencyCode = (!rawCurrency || rawCurrency === 'TL' || rawCurrency === 'TRY' || rawCurrency === 'TAM' || rawCurrency === 'BIN') ? 'TRY' : rawCurrency;

  // Her kalemin kendi ölçeğini denetle (zaten Bin ölçeğindeyse ikinci kez 1000'e bölme)
  const isItemThousands = (item: any) => Boolean(item?.is_thousands && !item?._scaleNormalized);
  const defaultIsThousands = sortedHistory.length > 0 && isItemThousands(latestItem);
  const tableUnitLabel = `Bin ${currencyCode}`;

  const fmt = (val: any, divisor = 1, isPct = false) => {
    if (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) return '—';
    const parsed = parseFinancialNumber(val);
    if (parsed === null || !Number.isFinite(parsed)) return '—';
    const num = divisor !== 0 ? parsed / divisor : parsed;
    if (!Number.isFinite(num)) return '—';
    return isPct
      ? (num < 0 ? `-%${Math.abs(num).toFixed(1)}` : `%${num.toFixed(1)}`)
      : num.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  };

  const getScaleDivisorForItem = (item: any) => (isItemThousands(item) ? 1 : 1000);

  const rawPriceStr = report.price || (ext.current_price != null ? String(ext.current_price) : '—');
  const rawFvStr = report.fairValue || (ext.valuation?.fair_value != null ? String(ext.valuation.fair_value) : (ext.fair_value != null ? String(ext.fair_value) : '—'));
  const priceNum = parseFinancialNumber(rawPriceStr);
  const fvNum = parseFinancialNumber(rawFvStr);
  const potential = (priceNum !== null && fvNum !== null && priceNum > 0)
    ? `${(((fvNum - priceNum) / priceNum) * 100).toFixed(1)}%`
    : '—';

  const cleanPriceDisplay = priceNum !== null ? `${priceNum.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL` : (rawPriceStr !== '—' ? `${rawPriceStr}` : '—');
  const cleanFvDisplay = fvNum !== null ? `${fvNum.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL` : (rawFvStr !== '—' ? `${rawFvStr}` : '—');

  const resolvedPeriod = (report.period && String(report.period).trim())
    || (ext.reporting_period && String(ext.reporting_period).trim())
    || latestItem?.period
    || '—';
  const formattedDate = formatAnalysisDate(report.createdAt) || '—';
  const parsedScore = parseNumericScore(report.score ?? ext.scoreResult?.totalScore ?? ext.valuation?.scoreResult?.totalScore);
  const scoreDisplay = parsedScore !== null ? `${Math.round(parsedScore)} / 100` : '— / 100';

  let md = `# ${report.ticker} — BIST KAPSAMLI FİNANSAL DEĞERLEME & BÜTÜNCÜL DENETİM DOSYASI\n\n`;
  md += `**Şirket Adı:** ${ext.company_name || report.ticker} | **Sektör:** ${resolvedSector || 'Sanayi'}\n`;
  md += `**Raporlama Dönemi:** ${resolvedPeriod} | **Analiz Tarihi:** ${formattedDate}\n`;
  md += `**Cari Piyasa Fiyatı:** ${cleanPriceDisplay} | **Model Hisse Başı Adil Değer:** ${cleanFvDisplay} | **Potansiyel:** ${potential}\n`;
  md += `**Analist Nihai Kararı:** ${report.decision || 'NÖTR'} | **Sektörel Model Puanı:** ${scoreDisplay}\n`;

  const resolvedShareCount = parseFinancialNumber(
    ext.shares_outstanding ?? ext.share_count ?? latestItem?.shares_count ?? latestItem?.paid_in_capital
  );
  if (resolvedShareCount !== null && resolvedShareCount > 0 && priceNum !== null && priceNum > 0) {
    const effShares = (defaultIsThousands && ext.shares_outstanding == null && ext.share_count == null && latestItem?.shares_count == null)
      ? resolvedShareCount * 1000
      : resolvedShareCount;
    const mcapBn = (priceNum * effShares) / 1e9;
    md += `**Ödenmiş Sermaye (Lot):** ${effShares.toLocaleString('tr-TR')} | **Piyasa Değeri:** ${mcapBn.toFixed(2)} Milyar TL\n`;
  }
  md += `\n---\n\n`;

  md += `## BÖLÜM 1: KURUMSAL DEĞERLEME VE ARAŞTIRMA RAPORU (TAM METİN)\n\n`;
  md += (report.report || 'Rapor metni bulunamadı.').trim() + '\n\n';
  md += `---\n\n`;

  const resolveFinancialDebt = (h: any): number | null => {
    const explicit = parseFinancialNumber(h?.financial_debt);
    if (explicit !== null) return explicit;
    const st = parseFinancialNumber(h?.short_term_debt);
    const lt = parseFinancialNumber(h?.long_term_debt);
    if (st === null && lt === null) return null;
    return (st ?? 0) + (lt ?? 0);
  };

  if (sortedHistory.length > 0) {
    md += `## BÖLÜM 2: DÖNEMSEL BİLANÇO VERİ HAVUZU (${tableUnitLabel})\n\n`;
    md += `| Bilanço Kalemi | ${periods.join(' | ')} |\n`;
    md += `| :--- | ${periods.map(() => ':---').join(' | ')} |\n`;

    const bsRows: { label: string; getter: (h: any) => any }[] = [
      { label: 'Dönen Varlıklar', getter: h => h?.current_assets },
      { label: 'Nakit ve Nakit Benzerleri', getter: h => h?.cash_and_equivalents ?? h?.cash },
      { label: 'Finansal Varlıklar', getter: h => h?.financial_assets_insured ?? h?.financial_investments },
      { label: 'Ticari Alacaklar', getter: h => h?.trade_receivables },
      { label: 'Stoklar', getter: h => h?.inventories },
      { label: 'Duran Varlıklar', getter: h => h?.non_current_assets },
      { label: 'Toplam Varlıklar', getter: h => h?.total_assets },
      { label: 'Kısa Vadeli Yükümlülükler', getter: h => h?.current_liabilities },
      { label: 'Finansal Borçlar (Kısa + Uzun)', getter: resolveFinancialDebt },
      { label: 'Net Finansal Borç', getter: h => h?.net_debt },
      { label: 'Toplam Özkaynaklar', getter: h => h?.equity },
    ];

    bsRows.forEach(row => {
      const vals = sortedHistory.map(h => fmt(row.getter(h), getScaleDivisorForItem(h)));
      md += `| ${row.label} | ${vals.join(' | ')} |\n`;
    });
    md += `\n---\n\n`;

    md += `## BÖLÜM 3: DÖNEMSEL GELİR TABLOSU VERİ HAVUZU (${tableUnitLabel})\n\n`;
    md += `| Gelir Tablosu Kalemi | ${periods.join(' | ')} |\n`;
    md += `| :--- | ${periods.map(() => ':---').join(' | ')} |\n`;

    const isInsurance = resolvedSector === 'INSURANCE';
    const isBanking = resolvedSector === 'BANKING';
    const isRows: { label: string; getter: (h: any) => any }[] = isInsurance
      ? [
          { label: 'Brüt Yazılan Primler (Hasılat)', getter: h => h?.gross_written_premiums ?? h?.written_premiums ?? h?.revenue },
          { label: 'Kazanılan Primler', getter: h => h?.earned_premiums },
          { label: 'Teknik Bölüm Dengesi / Kârı', getter: h => h?.technical_balance ?? h?.technical_profit },
          { label: 'Yatırım Gelirleri', getter: h => h?.investment_income },
          { label: 'Net Dönem Kârı', getter: h => h?.net_income },
        ]
      : isBanking
      ? [
          { label: 'Faiz Gelirleri', getter: h => h?.interest_income },
          { label: 'Net Faiz Geliri', getter: h => h?.net_interest_income ?? h?.revenue },
          { label: 'Net Ücret ve Komisyon Gelirleri', getter: h => h?.net_fee_income ?? h?.net_fees_and_commissions },
          { label: 'Toplam Faaliyet Gelirleri', getter: h => h?.total_operating_income ?? h?.revenue },
          { label: 'Faaliyet Kârı / (Vergi Öncesi)', getter: h => h?.operating_profit ?? h?.operating_income ?? h?.ebit },
          { label: 'Net Dönem Kârı / (Zararı)', getter: h => h?.net_income },
        ]
      : [
          { label: 'Satış Gelirleri (Hasılat)', getter: h => h?.revenue },
          { label: 'Brüt Kâr', getter: h => h?.gross_profit },
          { label: 'Esas Faaliyet Kârı', getter: h => h?.operating_profit ?? h?.operating_income ?? h?.ebit },
          { label: 'FAVÖK (EBITDA)', getter: h => h?.ebitda },
          { label: 'Net Finansman Giderleri', getter: h => h?.financing_expenses ?? h?.financial_expenses ?? h?.interest_expenses },
          { label: 'Net Dönem Kârı / (Zararı)', getter: h => h?.net_income },
        ];

    isRows.forEach(row => {
      const vals = sortedHistory.map(h => fmt(row.getter(h), getScaleDivisorForItem(h)));
      md += `| ${row.label} | ${vals.join(' | ')} |\n`;
    });
    md += `\n---\n\n`;

    md += `## BÖLÜM 4: NAKİT AKIŞ VE LİKİDİTE DÖNGÜSÜ (${tableUnitLabel})\n\n`;
    md += `| Nakit Akış Kalemi | ${periods.join(' | ')} |\n`;
    md += `| :--- | ${periods.map(() => ':---').join(' | ')} |\n`;

    const cfRows: { label: string; getter: (h: any) => any }[] = [
      { label: 'İşletme Nakit Akışı (OCF)', getter: h => h?.operating_cash_flow ?? h?.net_operating_cash_flow },
      { label: 'Maddi Duran Varlık Alımları (CAPEX)', getter: h => h?.tangible_capex ?? h?.capex },
      { label: 'Serbest Nakit Akışı (FCF)', getter: h => h?.free_cash_flow },
    ];

    cfRows.forEach(row => {
      const vals = sortedHistory.map(h => fmt(row.getter(h), getScaleDivisorForItem(h)));
      md += `| ${row.label} | ${vals.join(' | ')} |\n`;
    });
    md += `\n---\n\n`;

    md += `## BÖLÜM 5: FİNANSAL RASYOLAR, VERİMLİLİK VE MARJLAR\n\n`;
    md += `| Finansal Gösterge | ${periods.join(' | ')} |\n`;
    md += `| :--- | ${periods.map(() => ':---').join(' | ')} |\n`;

    const ratioRows: { label: string; key: string; isPct?: boolean }[] = [
      { label: 'Cari Oran (Dönen Varlık / KV Borç)', key: 'current_ratio' },
      { label: 'Likidite (Asit-Test) Oranı', key: 'quick_ratio' },
      { label: 'Nakit Oran', key: 'cash_ratio' },
      { label: 'Kaldıraç Oranı (Toplam Borç / Toplam Varlıklar)', key: 'leverage_ratio', isPct: true },
      { label: 'Aktif Devir Hızı', key: 'asset_turnover' },
      { label: 'Özkaynak Devir Hızı', key: 'equity_turnover' },
      { label: 'Özkaynak Kârlılığı (ROE)', key: 'roe', isPct: true },
      { label: 'Aktif Kârlılığı (ROA)', key: 'roa', isPct: true },
      { label: 'FAVÖK Marjı', key: 'ebitda_margin', isPct: true },
      { label: 'Net Kâr Marjı', key: 'net_margin', isPct: true },
      { label: 'Yatırılan Sermaye Kârlılığı (ROIC)', key: 'roic', isPct: true },
      { label: 'Ağırlıklı Ortalama Sermaye Maliyeti (WACC)', key: 'wacc', isPct: true },
      { label: 'EVA Makası (ROIC - WACC)', key: 'eva_spread', isPct: true },
    ];

    ratioRows.forEach(row => {
      const vals = sortedHistory.map(h => fmt(h[row.key], 1, row.isPct));
      md += `| ${row.label} | ${vals.join(' | ')} |\n`;
    });
    md += `\n---\n\n`;
  }

  // Multiples & Benchmarks (Asla 100M lot veya 100 TL sahte fiyat uydurmaz)
  const shareCountForMult = (resolvedShareCount !== null && resolvedShareCount > 0)
    ? ((defaultIsThousands && ext.shares_outstanding == null && ext.share_count == null && latestItem?.shares_count == null)
        ? resolvedShareCount * 1000
        : resolvedShareCount)
    : null;

  if (latestItem && priceNum !== null && priceNum > 0 && shareCountForMult !== null && shareCountForMult > 0) {
    const multiples = calculateCompanyMultiples(
      latestItem,
      priceNum,
      shareCountForMult,
      resolvedSector || 'INDUSTRIAL',
      ext.official_sector_name,
      ext.currency,
      ext.market_multiples ?? null,
      sortedHistory
    );
    if (multiples && multiples.multiples) {
      md += `## BÖLÜM 6: PİYASA ÇARPANLARI VE SEKTÖREL BENCHMARK KIYASI\n\n`;
      md += `| Değerleme Çarpanı | Şirket Değeri | Sektör Medyanı | İskonto / Prim Oranı | Durum |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      const mRows = [
        { name: 'Fiyat / Kazanç (F/K)', data: multiples.multiples.pe },
        { name: 'Piyasa Değeri / Defter Değeri (PD/DD)', data: multiples.multiples.pb },
        { name: 'Firma Değeri / FAVÖK (FD/FAVÖK)', data: multiples.multiples.evEbitda },
        { name: 'Firma Değeri / Satışlar (FD/Satış)', data: multiples.multiples.evSales },
      ];
      mRows.forEach(m => {
        const v = (m.data?.companyValue != null && Number.isFinite(m.data.companyValue)) ? `${m.data.companyValue.toFixed(2)}x` : '—';
        const b = (m.data?.sectorMedian != null && Number.isFinite(m.data.sectorMedian)) ? `${m.data.sectorMedian.toFixed(2)}x` : '—';
        const d = (m.data?.diffPct != null && Number.isFinite(m.data.diffPct)) ? (m.data.diffPct < 0 ? `-%${Math.abs(m.data.diffPct).toFixed(1)}` : `%${m.data.diffPct.toFixed(1)}`) : '—';
        const s = m.data?.status === 'DISCOUNTED' ? 'Sektöre Göre İskontolu' : m.data?.status === 'PREMIUM' ? 'Sektöre Göre Primli' : 'Makul / Nötr';
        md += `| ${m.name} | ${v} | ${b} | ${d} | ${s} |\n`;
      });
      md += `\n---\n\n`;
    }
  } else {
    md += `## BÖLÜM 6: PİYASA ÇARPANLARI VE SEKTÖREL BENCHMARK KIYASI\n\n`;
    md += `> Piyasa çarpanları hesabı için güncel fiyat veya doğrulanmış pay adedi verisi eksiktir (Veri Yok).\n\n---\n\n`;
  }

  // DuPont 5-Step & Accrual (TTM bağlamı geçirilerek)
  if (sortedHistory.length > 0) {
    const chronoHistory = [...sortedHistory].reverse();
    const cachedUm = ext.unified_metrics && ext.unified_metrics.period === latestItem?.period
      ? ext.unified_metrics
      : null;
    const computedUm = cachedUm ?? FinancialRatioEngine.computeMetrics({
      ticker: report.ticker,
      history: chronoHistory,
      currentPrice: priceNum ?? 0,
      shareCount: shareCountForMult ?? 0,
      sector: resolvedSector,
      currency: ext.currency || 'TRY',
    });
    const ttmOpt = computedUm?.ttm
      ? {
          revenue: computedUm.ttm.revenue,
          ebitda: computedUm.ttm.ebitda,
          operatingProfit: computedUm.ttm.operatingProfit,
          ebt: computedUm.ttm.ebt,
          interestExpense: computedUm.ttm.interestExpense,
          netIncome: computedUm.ttm.netIncome,
        }
      : null;

    const dupont = calculateDuPont5Step(
      sortedHistory[0],
      sortedHistory[1],
      resolvedSector,
      ttmOpt
        ? {
            ttm: ttmOpt,
            equity: parseFinancialNumber(sortedHistory[0]?.equity),
            totalAssets: parseFinancialNumber(sortedHistory[0]?.total_assets),
          }
        : undefined
    );
    if (dupont.hasData) {
      const fmtDupontPct = (v: number | null) =>
        v != null && Number.isFinite(v) ? (v < 0 ? `-%${Math.abs(v).toFixed(1)}` : `%${v.toFixed(1)}`) : '—';
      md += `## BÖLÜM 7: DUPONT 5-AŞAMALI KÂRLILIK AYRIŞTIRMASI VE DENETİM\n\n`;
      md += `- **Vergi Yükü (Net Kâr / EBT):** ${fmtDupontPct(dupont.taxBurden != null ? dupont.taxBurden * 100 : null)}\n`;
      md += `- **Faiz Yükü (EBT / EBIT):** ${fmtDupontPct(dupont.interestBurden != null ? dupont.interestBurden * 100 : null)}\n`;
      md += `- **Operasyonel Marj (EBIT / Ciro):** ${fmtDupontPct(dupont.ebitMargin)}\n`;
      md += `- **Varlık Devir Hızı (Ciro / Aktifler):** ${dupont.assetTurnover != null && Number.isFinite(dupont.assetTurnover) ? `${dupont.assetTurnover.toFixed(2)}x` : '—'}\n`;
      md += `- **Finansal Kaldıraç (Aktif / Özkaynak):** ${dupont.financialLeverage != null && Number.isFinite(dupont.financialLeverage) ? `${dupont.financialLeverage.toFixed(2)}x` : '—'}\n`;
      md += `- **Ayrıştırılmış ROE (Özkaynak Kârlılığı):** ${fmtDupontPct(dupont.calculatedRoe)}\n\n`;
      if (dupont.driverSummary) {
        md += `> **DuPont Teşhis Özeti:** ${dupont.driverSummary}\n\n`;
      }
      md += `---\n\n`;
    }
  }

  md += `## BÖLÜM 8: METODOLOJİ VE ÇAPRAZ KONTROL PROTOKOLÜ\n\n`;
  md += `1. Bu denetim dosyası, Borsa İstanbul (BİST) ve KAP'a bildirilen resmi konsolide finansal tablolardan derlenmiştir.\n`;
  md += `2. Şirketin adil değeri, cari piyasa fiyatından bağımsız olarak operasyonel kâr üretimi, bilanço varlık tabanı ve sermaye maliyeti (WACC) dinamikleriyle modellenmiştir.\n`;
  md += `3. Tüm tutarlar ilgili tablolarda aksi belirtilmedikçe '${tableUnitLabel}' cinsindendir.\n`;

  return md;
}
