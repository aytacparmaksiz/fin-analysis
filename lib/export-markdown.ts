import type { SavedReport } from './report-resolver.ts';
import { calculateDuPont5Step, calculateCompanyMultiples, parsePeriodSortKey, parseFinancialNumber } from './valuation.ts';

export function generateFullAuditMarkdown(report: SavedReport): string {
  if (!report) return '';

  const ext = report.extractedData || {};
  const history: any[] = Array.isArray(ext.financial_history) ? [...ext.financial_history] : [];
  // Sort newest to oldest using robust period key
  const sortedHistory = [...history].sort((a, b) => parsePeriodSortKey(b?.period) - parsePeriodSortKey(a?.period));
  const periods = sortedHistory.map(h => h.period || '-');

  const fmt = (val: any, divisor = 1, isPct = false) => {
    if (val === null || val === undefined || isNaN(Number(val))) return '—';
    const num = Number(val) / divisor;
    return isPct 
      ? `%${num.toFixed(1)}` 
      : num.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  };

  const rawPriceStr = report.price || String(ext.current_price || '—');
  const rawFvStr = report.fairValue || '—';
  const priceNum = parseFinancialNumber(rawPriceStr);
  const fvNum = parseFinancialNumber(rawFvStr);
  const potential = (priceNum !== null && fvNum !== null && priceNum > 0)
    ? `${(((fvNum - priceNum) / priceNum) * 100).toFixed(1)}%`
    : '—';

  const cleanPriceDisplay = priceNum !== null ? `${priceNum.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL` : (rawPriceStr !== '—' ? `${rawPriceStr}` : '—');
  const cleanFvDisplay = fvNum !== null ? `${fvNum.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL` : (rawFvStr !== '—' ? `${rawFvStr}` : '—');

  let md = `# ${report.ticker} — BIST KAPSAMLI FİNANSAL DEĞERLEME & BÜTÜNCÜL DENETİM DOSYASI\n\n`;
  md += `**Şirket Adı:** ${ext.company_name || report.ticker} | **Sektör:** ${report.sector || ext.sector || 'Sanayi'}\n`;
  md += `**Raporlama Dönemi:** ${report.period || ext.reporting_period || '2026/06'} | **Analiz Tarihi:** ${report.createdAt}\n`;
  md += `**Cari Piyasa Fiyatı:** ${cleanPriceDisplay} | **Model Hisse Başı Adil Değer:** ${cleanFvDisplay} | **Potansiyel:** ${potential}\n`;
  md += `**Analist Nihai Kararı:** ${report.decision || 'NÖTR'} | **Sektörel Model Puanı:** ${report.score != null ? report.score : '—'} / 100\n`;
  if (ext.shares_outstanding && priceNum !== null && priceNum > 0) {
    const shares = Number(ext.shares_outstanding);
    if (!isNaN(shares) && shares > 0) {
      const mcapBn = (priceNum * shares) / 1e9;
      md += `**Ödenmiş Sermaye (Lot):** ${shares.toLocaleString('tr-TR')} | **Piyasa Değeri:** ${mcapBn.toFixed(2)} Milyar TL\n`;
    }
  }
  md += `\n---\n\n`;

  md += `## BÖLÜM 1: KURUMSAL DEĞERLEME VE ARAŞTIRMA RAPORU (TAM METİN)\n\n`;
  md += (report.report || 'Rapor metni bulunamadı.').trim() + '\n\n';
  md += `---\n\n`;

  if (sortedHistory.length > 0) {
    md += `## BÖLÜM 2: DÖNEMSEL BİLANÇO VERİ HAVUZU (Bin TRY)\n\n`;
    md += `| Bilanço Kalemi | ${periods.join(' | ')} |\n`;
    md += `| :--- | ${periods.map(() => ':---').join(' | ')} |\n`;
    
    const bsRows: { label: string; key: string }[] = [
      { label: 'Dönen Varlıklar', key: 'current_assets' },
      { label: 'Nakit ve Nakit Benzerleri', key: 'cash_and_equivalents' },
      { label: 'Finansal Varlıklar', key: 'financial_assets_insured' },
      { label: 'Ticari Alacaklar', key: 'trade_receivables' },
      { label: 'Stoklar', key: 'inventories' },
      { label: 'Duran Varlıklar', key: 'non_current_assets' },
      { label: 'Toplam Varlıklar', key: 'total_assets' },
      { label: 'Kısa Vadeli Yükümlülükler', key: 'current_liabilities' },
      { label: 'Finansal Borçlar (Kısa + Uzun)', key: 'financial_debt' },
      { label: 'Net Finansal Borç', key: 'net_debt' },
      { label: 'Toplam Özkaynaklar', key: 'equity' },
    ];

    bsRows.forEach(row => {
      const vals = sortedHistory.map(h => fmt(h[row.key] ?? h[row.key === 'financial_debt' ? 'short_term_debt' : row.key], 1000));
      md += `| ${row.label} | ${vals.join(' | ')} |\n`;
    });
    md += `\n---\n\n`;

    md += `## BÖLÜM 3: DÖNEMSEL GELİR TABLOSU VERİ HAVUZU (Bin TRY)\n\n`;
    md += `| Gelir Tablosu Kalemi | ${periods.join(' | ')} |\n`;
    md += `| :--- | ${periods.map(() => ':---').join(' | ')} |\n`;

    const isInsurance = report.sector === 'INSURANCE';
    const isRows: { label: string; key: string }[] = isInsurance ? [
      { label: 'Brüt Yazılan Primler (Hasılat)', key: 'gross_written_premiums' },
      { label: 'Kazanılan Primler', key: 'earned_premiums' },
      { label: 'Teknik Bölüm Dengesi / Kârı', key: 'technical_balance' },
      { label: 'Yatırım Gelirleri', key: 'investment_income' },
      { label: 'Net Dönem Kârı', key: 'net_income' },
    ] : [
      { label: 'Satış Gelirleri (Hasılat)', key: 'revenue' },
      { label: 'Brüt Kâr', key: 'gross_profit' },
      { label: 'Esas Faaliyet Kârı', key: 'operating_income' },
      { label: 'FAVÖK (EBITDA)', key: 'ebitda' },
      { label: 'Net Finansman Giderleri', key: 'financial_expenses' },
      { label: 'Net Dönem Kârı / (Zararı)', key: 'net_income' },
    ];

    isRows.forEach(row => {
      const vals = sortedHistory.map(h => fmt(h[row.key] ?? h[row.key === 'gross_written_premiums' ? 'written_premiums' : row.key], 1000));
      md += `| ${row.label} | ${vals.join(' | ')} |\n`;
    });
    md += `\n---\n\n`;

    md += `## BÖLÜM 4: NAKİT AKIŞ VE LİKİDİTE DÖNGÜSÜ (Bin TRY)\n\n`;
    md += `| Nakit Akış Kalemi | ${periods.join(' | ')} |\n`;
    md += `| :--- | ${periods.map(() => ':---').join(' | ')} |\n`;

    const cfRows = [
      { label: 'İşletme Nakit Akışı (OCF)', key: 'operating_cash_flow' },
      { label: 'Maddi Duran Varlık Alımları (CAPEX)', key: 'capex' },
      { label: 'Serbest Nakit Akışı (FCF)', key: 'free_cash_flow' },
    ];

    cfRows.forEach(row => {
      const vals = sortedHistory.map(h => fmt(h[row.key], 1000));
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
      { label: 'Kaldıraç Oranı (Toplam Borç / Özkaynak)', key: 'leverage_ratio', isPct: true },
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

  // Multiples & Benchmarks
  const latestItem = sortedHistory[0];
  const shareCount = Number(ext.shares_outstanding) || 100000000;
  const multiples = calculateCompanyMultiples(
    latestItem,
    priceNum !== null && priceNum > 0 ? priceNum : 100,
    shareCount,
    report.sector || 'INDUSTRIAL',
    undefined,
    ext.currency,
    null,
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
      const v = m.data?.companyValue != null ? `${m.data.companyValue.toFixed(2)}x` : '—';
      const b = m.data?.sectorMedian != null ? `${m.data.sectorMedian.toFixed(2)}x` : '—';
      const d = m.data?.diffPct != null ? `%${m.data.diffPct.toFixed(1)}` : '—';
      const s = m.data?.status === 'DISCOUNTED' ? 'Sektöre Göre İskontolu' : m.data?.status === 'PREMIUM' ? 'Sektöre Göre Primli' : 'Makul / Nötr';
      md += `| ${m.name} | ${v} | ${b} | ${d} | ${s} |\n`;
    });
    md += `\n---\n\n`;
  }

  // DuPont 5-Step & Accrual
  if (sortedHistory.length > 0) {
    const dupont = calculateDuPont5Step(sortedHistory[0], sortedHistory[1], report.sector);
    if (dupont.hasData) {
      md += `## BÖLÜM 7: DUPONT 5-AŞAMALI KÂRLILIK AYRIŞTIRMASI VE DENETİM\n\n`;
      md += `- **Vergi Yükü (Net Kâr / EBT):** ${dupont.taxBurden != null ? `%${(dupont.taxBurden * 100).toFixed(1)}` : '—'}\n`;
      md += `- **Faiz Yükü (EBT / EBIT):** ${dupont.interestBurden != null ? `%${(dupont.interestBurden * 100).toFixed(1)}` : '—'}\n`;
      md += `- **Operasyonel Marj (EBIT / Ciro):** ${dupont.ebitMargin != null ? `%${dupont.ebitMargin.toFixed(1)}` : '—'}\n`;
      md += `- **Varlık Devir Hızı (Ciro / Aktifler):** ${dupont.assetTurnover != null ? `${dupont.assetTurnover.toFixed(2)}x` : '—'}\n`;
      md += `- **Finansal Kaldıraç (Aktif / Özkaynak):** ${dupont.financialLeverage != null ? `${dupont.financialLeverage.toFixed(2)}x` : '—'}\n`;
      md += `- **Ayrıştırılmış ROE (Özkaynak Kârlılığı):** ${dupont.calculatedRoe != null ? `%${dupont.calculatedRoe.toFixed(1)}` : '—'}\n\n`;
      if (dupont.driverSummary) {
        md += `> **DuPont Teşhis Özeti:** ${dupont.driverSummary}\n\n`;
      }
      md += `---\n\n`;
    }
  }

  md += `## BÖLÜM 8: METODOLOJİ VE ÇAPRAZ KONTROL PROTOKOLÜ\n\n`;
  md += `1. Bu denetim dosyası, Borsa İstanbul (BİST) ve KAP'a bildirilen resmi konsolide finansal tablolardan derlenmiştir.\n`;
  md += `2. Şirketin adil değeri, cari piyasa fiyatından bağımsız olarak operasyonel kâr üretimi, bilanço varlık tabanı ve sermaye maliyeti (WACC) dinamikleriyle modellenmiştir.\n`;
  md += `3. Tüm tutarlar ilgili tablolarda aksi belirtilmedikçe 'Bin TRY' cinsindendir.\n`;

  return md;
}
