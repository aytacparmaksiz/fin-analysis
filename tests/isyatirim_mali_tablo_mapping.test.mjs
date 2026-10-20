import test from 'node:test';
import assert from 'node:assert/strict';
import { IsYatirimApiAdapter } from '../lib/isyatirim-adapter.ts';
import { enrichAndSanitizeFinancialHistory } from '../lib/valuation.ts';

test('İş Yatırım Financial Statement Mapping & Non-Zero Extraction Test Suite', async (t) => {
  await t.test('1. XI_29 Industrial Statement (THYAO style) maps all 25+ detailed fields accurately', () => {
    const rawRows = [
      { itemCode: '3AA', itemDescTr: 'Satış Gelirleri', value1: 300_000_000_000 },
      { itemCode: '3CA', itemDescTr: 'Satışların Maliyeti (-)', value1: -240_000_000_000 },
      { itemCode: '3D', itemDescTr: 'Brüt Kâr (Zarar)', value1: 60_000_000_000 },
      { itemCode: '3DA', itemDescTr: 'Pazarlama, Satış ve Dağıtım Giderleri (-)', value1: -15_000_000_000 },
      { itemCode: '3DB', itemDescTr: 'Genel Yönetim Giderleri (-)', value1: -8_000_000_000 },
      { itemCode: '3DC', itemDescTr: 'Araştırma ve Geliştirme Giderleri (-)', value1: -2_000_000_000 },
      { itemCode: '3DD', itemDescTr: 'Esas Faaliyetlerden Diğer Gelirler', value1: 10_000_000_000 },
      { itemCode: '3DE', itemDescTr: 'Esas Faaliyetlerden Diğer Giderler (-)', value1: -5_000_000_000 },
      { itemCode: '3EA', itemDescTr: 'Esas Faaliyet Kârı (Zararı)', value1: 40_000_000_000 },
      { itemCode: '3GA', itemDescTr: 'Finansman Gelirleri', value1: 6_000_000_000 },
      { itemCode: '3H', itemDescTr: 'Finansman Giderleri (-)', value1: -12_000_000_000 },
      { itemCode: '3I', itemDescTr: 'Sürdürülen Faaliyetler Vergi Öncesi Kârı (Zararı)', value1: 34_000_000_000 },
      { itemCode: '3J', itemDescTr: 'Vergi Geliri (Gideri)', value1: -7_000_000_000 },
      { itemCode: '3K', itemDescTr: 'Dönem Kârı (Zararı)', value1: 27_000_000_000 },
      // Bilanço - Dönen
      { itemCode: '1A', itemDescTr: 'Dönen Varlıklar', value1: 150_000_000_000 },
      { itemCode: '1AA', itemDescTr: 'Nakit ve Nakit Benzerleri', value1: 50_000_000_000 },
      { itemCode: '1AB', itemDescTr: 'Finansal Yatırımlar', value1: 10_000_000_000 },
      { itemCode: '1AC', itemDescTr: 'Ticari Alacaklar', value1: 40_000_000_000 },
      { itemCode: '1AE', itemDescTr: 'Diğer Alacaklar', value1: 5_000_000_000 },
      { itemCode: '1AEA', itemDescTr: 'Türev Araçlar', value1: 2_000_000_000 },
      { itemCode: '1AF', itemDescTr: 'Stoklar', value1: 35_000_000_000 },
      { itemCode: '1AH', itemDescTr: 'Peşin Ödenmiş Giderler', value1: 4_000_000_000 },
      { itemCode: '1AI', itemDescTr: 'Diğer Dönen Varlıklar', value1: 4_000_000_000 },
      // Bilanço - Duran
      { itemCode: '1B', itemDescTr: 'Duran Varlıklar', value1: 350_000_000_000 },
      { itemCode: '1BC', itemDescTr: 'Finansal Yatırımlar', value1: 15_000_000_000 },
      { itemCode: '1BG', itemDescTr: 'Maddi Duran Varlıklar', value1: 220_000_000_000 },
      { itemCode: '1BH', itemDescTr: 'Maddi Olmayan Duran Varlıklar', value1: 25_000_000_000 },
      { itemCode: '1BFAA', itemDescTr: 'Kullanım Hakkı Varlıkları', value1: 70_000_000_000 },
      { itemCode: '1BJ', itemDescTr: 'Ertelenmiş Vergi Varlığı', value1: 10_000_000_000 },
      { itemCode: '1BK', itemDescTr: 'Diğer Duran Varlıklar', value1: 10_000_000_000 },
      // Toplam Aktif
      { itemCode: '1', itemDescTr: 'Toplam Varlıklar', value1: 500_000_000_000 },
      // Kısa Vadeli Yükümlülükler
      { itemCode: '2A', itemDescTr: 'Kısa Vadeli Yükümlülükler', value1: 120_000_000_000 },
      { itemCode: '2AA', itemDescTr: 'Kısa Vadeli Borçlanmalar', value1: 30_000_000_000 },
      { itemCode: '2AAGAA', itemDescTr: 'Ticari Borçlar', value1: 50_000_000_000 },
      { itemCode: '2AAGE', itemDescTr: 'Çalışanlara Sağlanan Faydalara İlişkin Karşılıklar', value1: 8_000_000_000 },
      { itemCode: '2AAGAB', itemDescTr: 'Diğer Kısa Vadeli Yükümlülükler', value1: 32_000_000_000 },
      // Uzun Vadeli Yükümlülükler
      { itemCode: '2B', itemDescTr: 'Uzun Vadeli Yükümlülükler', value1: 180_000_000_000 },
      { itemCode: '2BA', itemDescTr: 'Uzun Vadeli Borçlanmalar', value1: 140_000_000_000 },
      { itemCode: '2BH', itemDescTr: 'Diğer Uzun Vadeli Yükümlülükler', value1: 40_000_000_000 },
      // Özkaynaklar
      { itemCode: '2O', itemDescTr: 'Özkaynaklar', value1: 200_000_000_000 },
      { itemCode: '2OA', itemDescTr: 'Ödenmiş Sermaye', value1: 1_380_000_000 },
      { itemCode: '2OCD', itemDescTr: 'Kâr Yedekleri', value1: 90_000_000_000 },
      { itemCode: '2OCE', itemDescTr: 'Geçmiş Yıllar Kârları/Zararları', value1: 81_620_000_000 },
      // Nakit Akışı
      { itemCode: '4A', itemDescTr: 'İşletme Faaliyetlerinden Kaynaklanan Net Nakit', value1: 65_000_000_000 },
      { itemCode: '4CAAA', itemDescTr: 'Amortisman ve İtfa Gideri İle İlgili Düzeltmeler', value1: 20_000_000_000 },
      { itemCode: '4CAF', itemDescTr: 'İşletme Sermayesinde Gerçekleşen Değişimler', value1: -12_000_000_000 },
      { itemCode: '4CAI', itemDescTr: 'Maddi ve Maddi Olmayan Duran Varlıkların Alımından Kaynaklanan Nakit Çıkışları', value1: -30_000_000_000 },
      { itemCode: '4CAK', itemDescTr: 'Yatırım Faaliyetlerinden Kaynaklanan Net Nakit', value1: -28_000_000_000 },
      { itemCode: '4CBE', itemDescTr: 'Finansman Faaliyetlerinden Kaynaklanan Net Nakit', value1: -15_000_000_000 },
      { itemCode: '4CBB', itemDescTr: 'Ödenen Temettüler', value1: -5_000_000_000 },
      { itemCode: '4D', itemDescTr: 'Nakit ve Nakit Benzerlerindeki Net Artış (Azalış)', value1: 22_000_000_000 }
    ];

    const dict = {};
    for (const row of rawRows) {
      if (row.itemCode) dict[`code_${row.itemCode.trim()}`] = row.value1;
      if (row.itemDescTr) dict[`desc_${row.itemDescTr.trim().toLowerCase()}`] = row.value1;
    }

    const item = IsYatirimApiAdapter.mapPeriodDictionary('2026/06', dict, {
      ticker: 'THYAO',
      sector: 'INDUSTRIAL',
      financialGroup: 'XI_29'
    });

    // Gelir tablosu kalemleri
    assert.equal(item.revenue, 300_000_000_000);
    assert.equal(item.cost_of_sales, -240_000_000_000);
    assert.equal(item.gross_profit, 60_000_000_000);
    assert.equal(item.marketing_expenses, -15_000_000_000);
    assert.equal(item.administrative_expenses, -8_000_000_000);
    assert.equal(item.rd_expenses, -2_000_000_000);
    assert.equal(item.other_operating_income_net, 5_000_000_000); // 10B - 5B
    assert.equal(item.operating_profit, 40_000_000_000);
    assert.equal(item.ebitda, 60_000_000_000); // 40B ebit + 20B amort
    assert.equal(item.profit_before_tax, 34_000_000_000);
    assert.equal(item.tax_expense, -7_000_000_000);
    assert.equal(item.net_income, 27_000_000_000);

    // Bilanço kalemleri
    assert.equal(item.current_assets, 150_000_000_000);
    assert.equal(item.cash_and_equivalents, 50_000_000_000);
    assert.equal(item.financial_investments, 10_000_000_000);
    assert.equal(item.trade_receivables, 40_000_000_000);
    assert.equal(item.other_receivables, 5_000_000_000);
    assert.equal(item.derivative_instruments, 2_000_000_000);
    assert.equal(item.inventories, 35_000_000_000);
    assert.equal(item.prepaid_expenses, 4_000_000_000);

    assert.equal(item.non_current_assets, 350_000_000_000);
    assert.equal(item.tangible_assets, 220_000_000_000);
    assert.equal(item.intangible_assets, 25_000_000_000);
    assert.equal(item.right_of_use_assets, 70_000_000_000);
    assert.equal(item.deferred_tax_assets, 10_000_000_000);

    assert.equal(item.total_assets, 500_000_000_000);

    assert.equal(item.short_term_debt, 30_000_000_000);
    assert.equal(item.trade_payables, 50_000_000_000);
    assert.equal(item.employee_benefit_obligations, 8_000_000_000);
    assert.equal(item.long_term_debt, 140_000_000_000);
    assert.equal(item.financial_debt, 170_000_000_000); // 30B + 140B
    assert.equal(item.net_debt, 110_000_000_000); // 170B - 50B cash - 10B liquid financial assets

    assert.equal(item.equity, 200_000_000_000);
    assert.equal(item.paid_in_capital, 1_380_000_000);
    assert.equal(item.retained_earnings, 171_620_000_000); // 90B + 81.62B

    // Nakit akışı kalemleri
    assert.equal(item.operating_cash_flow, 65_000_000_000);
    assert.equal(item.depreciation, 20_000_000_000);
    assert.equal(item.working_capital_change, -12_000_000_000);
    assert.equal(item.capex, 30_000_000_000);
    assert.equal(item.investing_cash_flow, -28_000_000_000);
    assert.equal(item.free_cash_flow, 35_000_000_000); // 65B - 30B capex
    assert.equal(item.financing_cash_flow, -15_000_000_000);
    assert.equal(item.dividends_paid, 5_000_000_000);
    assert.equal(item.net_change_in_cash, 22_000_000_000);
  });

  await t.test('2. enrichAndSanitizeFinancialHistory preserves all detailed items without nullification', () => {
    const rawHistory = [{
      period: '2026/06',
      revenue: 300_000_000_000,
      cost_of_sales: -240_000_000_000,
      gross_profit: 60_000_000_000,
      marketing_expenses: -15_000_000_000,
      administrative_expenses: -8_000_000_000,
      rd_expenses: -2_000_000_000,
      other_operating_income_net: 5_000_000_000,
      operating_profit: 40_000_000_000,
      operating_income: 40_000_000_000,
      ebit: 40_000_000_000,
      ebitda: 60_000_000_000,
      profit_before_tax: 34_000_000_000,
      ebt: 34_000_000_000,
      tax_expense: -7_000_000_000,
      net_income: 27_000_000_000,
      current_assets: 150_000_000_000,
      cash_and_equivalents: 50_000_000_000,
      trade_receivables: 40_000_000_000,
      other_receivables: 5_000_000_000,
      derivative_instruments: 2_000_000_000,
      inventories: 35_000_000_000,
      prepaid_expenses: 4_000_000_000,
      other_current_assets: 4_000_000_000,
      non_current_assets: 350_000_000_000,
      tangible_assets: 220_000_000_000,
      intangible_assets: 25_000_000_000,
      right_of_use_assets: 70_000_000_000,
      deferred_tax_assets: 10_000_000_000,
      total_assets: 500_000_000_000,
      current_liabilities: 120_000_000_000,
      short_term_debt: 30_000_000_000,
      trade_payables: 50_000_000_000,
      employee_benefit_obligations: 8_000_000_000,
      long_term_liabilities: 180_000_000_000,
      long_term_debt: 140_000_000_000,
      total_liabilities: 300_000_000_000,
      financial_debt: 170_000_000_000,
      net_debt: 120_000_000_000,
      equity: 200_000_000_000,
      paid_in_capital: 1_380_000_000,
      retained_earnings: 171_620_000_000,
      operating_cash_flow: 65_000_000_000,
      depreciation: 20_000_000_000,
      working_capital_change: -12_000_000_000,
      capex: 30_000_000_000,
      free_cash_flow: 35_000_000_000,
      investing_cash_flow: -28_000_000_000,
      financing_cash_flow: -15_000_000_000,
      dividends_paid: 5_000_000_000,
      net_change_in_cash: 22_000_000_000
    }];

    const sanitized = enrichAndSanitizeFinancialHistory(rawHistory, {
      ticker: 'THYAO',
      sector: 'INDUSTRIAL'
    });

    const item = sanitized[0];
    assert.equal(item.cost_of_sales, -240_000_000_000);
    assert.equal(item.marketing_expenses, -15_000_000_000);
    assert.equal(item.administrative_expenses, -8_000_000_000);
    assert.equal(item.tangible_assets, 220_000_000_000);
    assert.equal(item.intangible_assets, 25_000_000_000);
    assert.equal(item.retained_earnings, 171_620_000_000);
    assert.equal(item.depreciation, 20_000_000_000);
    assert.equal(item.working_capital_change, -12_000_000_000);
    assert.equal(item.profit_before_tax, 34_000_000_000);
  });
});
