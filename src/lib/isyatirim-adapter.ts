/**
 * IsYatirimApiAdapter
 * ----------------------------------------------------------------------------
 * İş Yatırım Resmi API ve BIST Mali Tablo Eşleme Adaptörü (TFRS & UFRS Uyumlu).
 * 
 * Standartlar:
 * 1. Esas Faaliyet Kârı KESİNLİKLE 'FAALİYET KARI (ZARARI)' / 'Finansman Gideri Öncesi Faaliyet Karı'
 *    (Diğer faaliyet gelir/giderleri dahil TFRS ana kalemi) alanına eşlenir.
 *    Ham 'Net Faaliyet Kar/Zararı' (3H) tek başına kullanılmaz.
 * 2. Duran Varlıklar: Top-level Duran Varlıklar kalemi (1AK) doğrudan alınır;
 *    pasifteki azınlık payları veya başka bir özkaynak kalemi duran varlıklardan veya aktif toplamından DÜŞÜLMEZ.
 * 3. Nakit Akış & FCF: İş Yatırım resmi 'İşletme Faaliyetlerinden Kaynaklanan Net Nakit' (4C)
 *    ve 'Serbest Nakit Akım' (4CB) alanları birincil tek doğruluk kaynağıdır.
 * 4. PriorPeriodComparison: (t) ve (t-1) karşılaştırmalarında yeniden endekslenmiş/düzeltilmiş
 *    TMS 29 karşılaştırmalı verilerini baz alarak reel büyüme türetir.
 */

import type { SectorType } from './sectors.ts';
import type { FinancialHistoryItem } from './bist-service.ts';

export interface IsYatirimRawRow {
  itemCode?: string;
  itemDescTr?: string;
  itemDescEng?: string;
  value1?: string | number | null;
  value2?: string | number | null;
  value3?: string | number | null;
  value4?: string | number | null;
  [key: string]: any;
}

export interface IsYatirimPeriodDictionary {
  [key: string]: number;
}

export interface PriorPeriodComparisonResult {
  currentPeriod: string;
  priorPeriod: string;
  isRestatedTms29: boolean;
  revenueGrowthYoY: number | null;
  operatingProfitGrowthYoY: number | null;
  ebitdaGrowthYoY: number | null;
  netIncomeGrowthYoY: number | null;
}

export class IsYatirimApiAdapter {
  /**
   * Ham İş Yatırım periyot sözlüğünü (code_... ve desc_... anahtarlı)
   * TFRS standartlarına tam uyumlu FinancialHistoryItem nesnesine dönüştürür.
   */
  public static mapPeriodDictionary(
    period: string,
    dict: IsYatirimPeriodDictionary,
    meta: { ticker: string; sector: SectorType; financialGroup?: string }
  ): FinancialHistoryItem {
    const norm = (s: string) => s.toLowerCase().replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u').trim();

    const getVal = (codes: string[], descSubstrings: string[] = []): number | null => {
      // 1. Önce kodlar üzerinde sıfır olmayan gerçek değeri ara
      for (const c of codes) {
        const v = dict[`code_${c}`];
        if (v !== undefined && v !== null && v !== 0) return v;
      }
      // 2. Açıklama tam eşleşmesi üzerinde sıfır olmayan değeri ara
      for (const sub of descSubstrings) {
        const target = norm(sub);
        for (const [k, v] of Object.entries(dict)) {
          if (!k.startsWith('desc_')) continue;
          const descText = norm(k.slice(5));
          if (descText === target) {
            if (v !== undefined && v !== null && v !== 0) return v;
          }
        }
      }
      // 3. Açıklama alt metin eşleşmesi üzerinde sıfır olmayan değeri ara
      for (const sub of descSubstrings) {
        const target = norm(sub);
        for (const [k, v] of Object.entries(dict)) {
          if (!k.startsWith('desc_')) continue;
          const descText = norm(k.slice(5));
          if (descText.includes(target) && !descText.includes('yontemiyle degerlenen') && !descText.includes('yöntemiyle değerlenen')) {
            if (v !== undefined && v !== null && v !== 0) return v;
          }
        }
      }
      // 4. Eğer hiçbirinde sıfır olmayan değer bulunamadıysa ve bir kodda açıkça 0 varsa 0 dön
      for (const c of codes) {
        if (dict[`code_${c}`] === 0) return 0;
      }
      for (const sub of descSubstrings) {
        const target = norm(sub);
        for (const [k, v] of Object.entries(dict)) {
          if (!k.startsWith('desc_')) continue;
          const descText = norm(k.slice(5));
          if ((descText === target || descText.includes(target)) && v === 0) return 0;
        }
      }
      return null;
    };

    const getValByCode = (...codes: string[]): number | null => getVal(codes);
    const getValByDesc = (...descSubstrings: string[]): number | null => getVal([], descSubstrings);

    let revenue: number | null = null;
    let gross_profit: number | null = null;
    let cost_of_sales: number | null = null;
    let marketing_expenses: number | null = null;
    let administrative_expenses: number | null = null;
    let rd_expenses: number | null = null;
    let operating_expenses: number | null = null;
    let other_operating_income: number | null = null;
    let other_operating_expense: number | null = null;
    let other_operating_income_net: number | null = null;
    let operating_profit: number | null = null;
    let financing_income: number | null = null;
    let financing_expenses: number | null = null;
    let profit_before_tax: number | null = null;
    let ebt: number | null = null;
    let tax_expense: number | null = null;
    let net_income: number | null = null;
    let ebitda: number | null = null;

    let current_assets: number | null = null;
    let cash_and_equivalents: number | null = null;
    let financial_investments: number | null = null;
    let financial_assets_insured: number | null = null;
    let trade_receivables: number | null = null;
    let other_receivables: number | null = null;
    let derivative_instruments: number | null = null;
    let inventories: number | null = null;
    let prepaid_expenses: number | null = null;
    let other_current_assets: number | null = null;

    let non_current_assets: number | null = null;
    let non_current_financial_investments: number | null = null;
    let non_current_trade_receivables: number | null = null;
    let tangible_assets: number | null = null;
    let intangible_assets: number | null = null;
    let right_of_use_assets: number | null = null;
    let deferred_tax_assets: number | null = null;
    let other_non_current_assets: number | null = null;
    let total_assets: number | null = null;

    let current_liabilities: number | null = null;
    let short_term_debt: number | null = null;
    let trade_payables: number | null = null;
    let employee_benefit_obligations: number | null = null;
    let other_current_liabilities: number | null = null;
    let long_term_liabilities: number | null = null;
    let long_term_debt: number | null = null;
    let other_long_term_liabilities: number | null = null;
    let total_liabilities: number | null = null;
    let equity: number | null = null;
    let paid_in_capital: number | null = null;
    let retained_earnings: number | null = null;
    let net_debt: number | null = null;

    let operating_cash_flow: number | null = null;
    let grossOcf: number | null = null;
    let netOcf: number | null = null;
    let depreciation: number | null = null;
    let working_capital_change: number | null = null;
    let capex: number | null = null;
    let tangibleCapex: number | null = null;
    let totalCapex: number | null = null;
    let free_cash_flow: number | null = null;
    let dividends_paid: number | null = null;
    let investing_cash_flow: number | null = null;
    let financing_cash_flow: number | null = null;
    let net_change_in_cash: number | null = null;

    let pension_aum: number | null = null;
    let written_premiums: number | null = null;
    let earned_premiums: number | null = null;
    let technical_profit: number | null = null;
    let investment_income: number | null = null;
    let loss_ratio: number | null = null;
    let expense_ratio: number | null = null;
    let ga_ratio: number | null = null;
    let commission_ratio: number | null = null;
    let combined_ratio: number | null = null;

    if (meta.sector === 'INSURANCE') {
      cash_and_equivalents = getVal(['1A', '1AC'], ['nakit ve nakit benzer', 'bankalar']);
      financial_assets_insured = getVal(['1B', '1BF', '1BA'], ['finansal varlıklar ile riski sigortalılara ait', 'riski sigortalılara ait finansal', 'finansal varlıklar']);
      financial_investments = financial_assets_insured;
      trade_receivables = getVal(['1C', '1CA'], ['esas faaliyetlerden alacaklar', 'sigortacılık faaliyetlerinden alacaklar']);
      other_receivables = getVal(['1E', '1D'], ['diğer alacaklar', 'ilişkili taraflardan alacaklar']);
      pension_aum = getVal(['1JH', '2KD', '1CH'], ['emeklilik faaliyetlerinden borçlar', 'emeklilik faaliyetlerinden alacaklar']);

      current_assets = getVal(['1H', '1A'], ['cari varlıklar toplamı', 'dönen varlıklar toplamı']);
      non_current_assets = getVal(['1S', '1B'], ['cari olmayan varlıklar toplamı', 'duran varlıklar toplamı']);
      total_assets = getVal(['1T', '1Z'], ['varlıklar toplamı', 'aktif toplamı', 'toplam varlık']) ?? (((current_assets || 0) + (non_current_assets || 0)) || null);

      tangible_assets = getVal(['1H', '1G'], ['maddi varlıklar', 'maddi duran varlıklar']);
      intangible_assets = getVal(['1I'], ['maddi olmayan varlıklar']);

      current_liabilities = getVal(['2I', '2A'], ['kısa vadeli yükümlülükler toplamı', 'kısa vadeli yükümlülükler']);
      long_term_liabilities = getVal(['2MDZ', '2B'], ['uzun vadeli yükümlülükler toplamı', 'uzun vadeli yükümlülükler']);
      total_liabilities = (current_liabilities || 0) + (long_term_liabilities || 0);

      paid_in_capital = getVal(['2MEA', '2OA'], ['ödenmiş sermaye']);
      equity = getVal(['2O', '2N'], ['özsermaye toplamı', 'özkaynaklar toplamı', 'özkaynak']);
      retained_earnings = getVal(['2OC'], ['geçmiş yıllar karları', 'kar yedekleri']);

      const lifeWritten = getVal(['3DAAB'], ['1.1.1- brüt yazılan primler']);
      const nonLifeWritten = getVal(['3AAAA'], ['brüt yazılan primler']);
      if (lifeWritten !== null && lifeWritten > 0) {
        written_premiums = lifeWritten;
      } else {
        written_premiums = nonLifeWritten ?? getVal([], ['brüt yazılan primler', 'yazılan primler']);
      }
      revenue = written_premiums;

      const lifeEarned = getVal(['3DAA']);
      const nonLifeEarned = getVal(['3AA']);
      earned_premiums = (lifeEarned !== null && lifeEarned > 0) ? lifeEarned : (nonLifeEarned ?? getVal([], ['kazanılmış primler']));

      technical_profit =
        getVal(['3K', '3F'], ['genel teknik bölüm dengesi', 'j- genel teknik bölüm dengesi', 'hayat teknik bölüm dengesi', 'f- teknik bölüm dengesi- hayat']) ??
        getVal(['3C', '3H'], ['teknik bölüm dengesi']);

      investment_income = getVal(['3L', '3DB', '3DAEA'], ['yatırım gelirleri', 'teknik olmayan bölümden aktarılan yatırım gelirleri']);
      profit_before_tax = getVal(['3G', '3I', '3M'], ['vergi öncesi kar']);
      ebt = profit_before_tax;
      tax_expense = getVal(['3J', '3N'], ['vergi gideri', 'dönem vergi gideri']);
      net_income = getVal(['2MEZ', '3NJA', '3Z'], ['dönem net karı veya zararı', 'dönem net karı', 'dönem net kar', 'ana ortaklık payları']);

      ebitda = technical_profit;
      operating_profit = technical_profit;

      const claimsIncurred = getVal(['3DAB', '3DABA', '3AB'], ['gerçekleşen hasarlar']);
      const opExpenses = getVal(['3DAD', '3DADA', '3AD'], ['faaliyet giderleri']);
      cost_of_sales = claimsIncurred;
      administrative_expenses = opExpenses;
      depreciation = getVal(['4B'], ['amortisman']);

      const basePremium = (earned_premiums && Math.abs(earned_premiums) > 0) ? Math.abs(earned_premiums) : (written_premiums && Math.abs(written_premiums) > 0 ? Math.abs(written_premiums) : null);

      if (basePremium && basePremium > 0) {
        if (claimsIncurred !== null) {
          const lr = (Math.abs(claimsIncurred) / basePremium) * 100;
          if (lr > 5 && lr < 140) loss_ratio = Number(lr.toFixed(1));
        }
        if (opExpenses !== null) {
          const er = (Math.abs(opExpenses) / basePremium) * 100;
          if (er > 2 && er < 80) ga_ratio = Number(er.toFixed(1));
        }
        if (technical_profit !== null) {
          const impliedMargin = (technical_profit / basePremium) * 100;
          const impliedComb = 100 - Math.max(-30, Math.min(35, impliedMargin));
          combined_ratio = Number(impliedComb.toFixed(1));
          if (loss_ratio !== null) {
            expense_ratio = Number((combined_ratio - loss_ratio).toFixed(1));
          }
        } else if (loss_ratio !== null && ga_ratio !== null) {
          combined_ratio = Number((loss_ratio + ga_ratio).toFixed(1));
        } else if (loss_ratio !== null && expense_ratio !== null && (loss_ratio + expense_ratio) >= 55) {
          combined_ratio = Number((loss_ratio + expense_ratio).toFixed(1));
        }

        if (expense_ratio !== null && ga_ratio !== null) {
          commission_ratio = Number(Math.max(0, expense_ratio - ga_ratio).toFixed(1));
        }
      }

      net_debt = cash_and_equivalents !== null ? -cash_and_equivalents : null;
      operating_cash_flow = null;
      free_cash_flow = null;

    } else if (meta.sector === 'BANKING') {
      cash_and_equivalents = getVal(['1A', '1AA'], ['nakit değerler ve merkez bankası', 'nakit ve nakit benzer']);
      financial_assets_insured = getVal(['1B', '1C', '1D', '1AB', '1AE'], ['gerçeğe uygun değer farkı kar/zarara yansıtılan finansal varlıklar', 'finansal varlıklar', 'menkul değerler']);
      financial_investments = financial_assets_insured;
      trade_receivables = getVal(['1AF', '1E', '1F', '1DA'], ['krediler', 'kredi ve alacaklar']);
      other_receivables = getVal(['1AD'], ['para piyasalarından alacaklar']);
      total_assets = getVal(['1S', '1Z', '1'], ['varlıklar toplamı', 'aktif toplamı', 'toplam varlıklar']);
      current_assets = (cash_and_equivalents !== null || financial_assets_insured !== null || trade_receivables !== null)
        ? ((cash_and_equivalents || 0) + (financial_assets_insured || 0) + (trade_receivables || 0))
        : null;
      non_current_assets = (total_assets && current_assets) ? Math.max(0, total_assets - current_assets) : null;

      current_liabilities = getVal(['2A'], ['mevduat', 'toplanan fonlar']);
      paid_in_capital = getVal(['2OA', '2PA', '2MEA'], ['ödenmiş sermaye']);
      equity = getVal(['2O', '2P', '2N'], ['özkaynaklar toplamı', 'özsermaye toplamı', 'özkaynaklar']);
      retained_earnings = getVal(['2OE', '2PE'], ['yedek akçeler', 'geçmiş yıllar karı']);
      total_liabilities = (total_assets && equity) ? Math.max(0, total_assets - equity) : current_liabilities;
      long_term_liabilities = (total_liabilities && current_liabilities) ? Math.max(0, total_liabilities - current_liabilities) : null;

      revenue = getVal(['3C', '3CA'], ['net faiz geliri veya gideri', 'net faiz geliri']);
      gross_profit = getVal(['3H', '3I'], ['brüt faaliyet karı', 'faaliyet gelirleri toplamı']);
      cost_of_sales = getVal(['3CB', '3B'], ['faiz giderleri']);
      operating_profit = getVal(['3M', '3N', '3H'], ['net faaliyet karı veya zararı', 'sürdürülen faaliyetler vergi öncesi']);
      profit_before_tax = getVal(['3N', '3I', '3M'], ['sürdürülen faaliyetler vergi öncesi', 'vergi öncesi kar']);
      ebt = profit_before_tax;
      ebitda = operating_profit ?? gross_profit;
      net_income = getVal(['3Z', '3U', '2OZ', '2MEZ'], ['dönem net karı veya zararı', 'dönem net karı', 'net dönem karı']);
      tax_expense = getVal(['3IA'], ['vergi karşılığı']);

      operating_cash_flow = getVal(['4A', '4CAE'], ['işletme faaliyetlerinden nakit']) ?? net_income;
      free_cash_flow = operating_cash_flow;

    } else {
      // ======================================================================
      // SANAYİ, TİCARET, HAVACILIK, HOLDİNG, GYO, TEKNOLOJİ (XI_29 & UFRS FORMATI)
      // ======================================================================

      // 1. DÖNEN VARLIKLAR (TOP-LEVEL 1A)
      current_assets = getVal(['1A'], ['toplam dönen varlıklar', 'dönen varlıklar']);
      cash_and_equivalents = getVal(['1AA'], ['nakit ve nakit benzerleri']);
      financial_investments = getVal(['1AB'], ['finansal yatırımlar']);
      financial_assets_insured = financial_investments;
      trade_receivables = getVal(['1AC'], ['ticari alacaklar']);
      other_receivables = getVal(['1AE'], ['diğer alacaklar']);
      derivative_instruments = getVal(['1AEA', '1AAD'], ['türev araçlar', 'müşteri sözleşmelerinden doğan varlıklar']);
      inventories = getVal(['1AF'], ['stoklar']);
      prepaid_expenses = getVal(['1AH'], ['peşin ödenmiş giderler', 'diğer dönen varlıklar']);
      other_current_assets = getVal(['1AH', '1AJ'], ['diğer dönen varlıklar']);

      // 2. DURAN VARLIKLAR (TOP-LEVEL 1AK)
      non_current_assets = getVal(['1AK'], ['toplam duran varlıklar', 'duran varlıklar']);
      non_current_trade_receivables = getVal(['1B'], ['ticari alacaklar']);
      non_current_financial_investments = getVal(['1BC', '1BD'], ['finansal yatırımlar', 'özkaynak yöntemiyle değerlenen yatırımlar']);
      tangible_assets = getVal(['1BG'], ['maddi duran varlıklar']);
      intangible_assets = getVal(['1BH', '1BGA'], ['maddi olmayan duran varlıklar', 'şerefiye']);
      right_of_use_assets = getVal(['1BFAA'], ['kullanım hakkı varlıkları']);
      deferred_tax_assets = getVal(['1BJ'], ['ertelenmiş vergi varlığı']);
      other_non_current_assets = getVal(['1BK'], ['diğer duran varlıklar']);

      // 3. TOPLAM VARLIKLAR / AKTİF TOPLAMI (1BL / 1Z / 1)
      total_assets = getVal(['1BL', '1Z', '1'], ['toplam varlıklar', 'aktif toplamı']) ?? (((current_assets || 0) + (non_current_assets || 0)) || null);

      // 4. YÜKÜMLÜLÜKLER VE ÖZKAYNAKLAR
      current_liabilities = getVal(['2A'], ['toplam kısa vadeli yükümlülükler', 'kısa vadeli yükümlülükler']);
      short_term_debt = getVal(['2AA'], ['kısa vadeli borçlanmalar', 'finansal borçlar']);
      trade_payables = getVal(['2AAGAA', '2AC', '2AB'], ['ticari borçlar']);
      employee_benefit_obligations = getVal(['2AAGE', '2BF', '2BE'], ['borç karşılıkları', 'çalışanlara sağlanan faydalar', 'çalışanlara sağlanan faydalara iliş.karş.']);
      other_current_liabilities = getVal(['2AAGF', '2AAGAB', '2AAGCA'], ['diğer kısa vadeli yükümlülükler', 'diğer borçlar']);

      long_term_liabilities = getVal(['2B'], ['toplam uzun vadeli yükümlülükler', 'uzun vadeli yükümlülükler']);
      long_term_debt = getVal(['2BA'], ['uzun vadeli borçlanmalar', 'uzun vadeli finansal borç', 'finansal borçlar']);
      other_long_term_liabilities = getVal(['2BH', '2BBB', '2BG', '2BE'], ['diğer uzun vadeli yükümlülükler', 'diğer borçlar', 'ertelenmiş vergi yükümlülüğü']);
      total_liabilities = (current_liabilities || 0) + (long_term_liabilities || 0);

      equity = getVal(['2N', '2O'], ['ana ortaklığa ait özkaynaklar', 'toplam özkaynaklar', 'özkaynaklar']);
      paid_in_capital = getVal(['2OA', '2NA', '2MEA'], ['ödenmiş sermaye', 'çıkarılmış sermaye']);
      
      const priorYearsProfit = getVal(['2OCE'], ['geçmiş yıllar kar/zararları', 'geçmiş yıllar karları']) || 0;
      const restrictedReserves = getVal(['2OCD'], ['kardan ayrılan kısıtlanmış yedekler']) || 0;
      retained_earnings = (priorYearsProfit !== 0 || restrictedReserves !== 0) ? (priorYearsProfit + restrictedReserves) : null;

      if (short_term_debt !== null || long_term_debt !== null || cash_and_equivalents !== null) {
        const safeCash = cash_and_equivalents || 0;
        const safeFinAssets = (financial_investments && financial_investments !== safeCash) ? financial_investments : 0;
        net_debt = (short_term_debt || 0) + (long_term_debt || 0) - safeCash - safeFinAssets;
      }

      // 5. GELİR TABLOSU:
      revenue = getVal(['3AA', '3C', '3A'], ['satış gelirleri', 'hasılat']);
      cost_of_sales = getVal(['3CA', '3CB', '3B'], ['satışların maliyeti (-)', 'satışların maliyeti']);
      gross_profit = getVal(['3D', '3CAB'], ['ticari faaliyetlerden brüt kar', 'brüt kar (zarar)', 'brüt kar', 'brüt kâr (zarar)', 'brüt kâr']);
      
      if (cost_of_sales === null && revenue !== null && gross_profit !== null) {
        cost_of_sales = -(revenue - gross_profit);
      }

      marketing_expenses = getVal(['3DA'], ['pazarlama, satış ve dağıtım giderleri (-)', 'pazarlama giderleri', 'pazarlama']);
      administrative_expenses = getVal(['3DB'], ['genel yönetim giderleri (-)', 'genel yönetim giderleri']);
      rd_expenses = getVal(['3DC'], ['araştırma ve geliştirme giderleri (-)', 'arge giderleri']);
      
      other_operating_income = getVal(['3DD'], ['esas faaliyetlerden diğer gelirler', 'diğer faaliyet gelirleri']);
      other_operating_expense = getVal(['3DE'], ['esas faaliyetlerden diğer giderler (-)', 'esas faaliyetlerden diğer giderler', 'diğer faaliyet giderleri']);
      other_operating_income_net = (other_operating_income !== null || other_operating_expense !== null)
        ? ((other_operating_income || 0) - Math.abs(other_operating_expense || 0))
        : null;

      operating_expenses = ((marketing_expenses !== null || administrative_expenses !== null || rd_expenses !== null)
        ? ((marketing_expenses || 0) + (administrative_expenses || 0) + (rd_expenses || 0))
        : null) ?? getVal(['3E', '3DA', '3DB', '3DC'], ['faaliyet giderleri']);

      const tfrsOperatingProfit = getVal(
        ['3DF', '3EA', '3HACA', '3DEA'],
        [
          'esas faaliyet karı (zararı)',
          'esas faaliyet karı',
          'faaliyet karı (zararı)',
          'faaliyet karı',
          'finansman gideri öncesi faaliyet karı/zararı',
          'finansman gideri öncesi faaliyet karı'
        ]
      );

      const netOperatingProfitRaw = getVal(['4BA', '3H'], ['net faaliyet kar/zararı', 'net faaliyet karı']);

      if (tfrsOperatingProfit !== null) {
        operating_profit = tfrsOperatingProfit;
      } else if (netOperatingProfitRaw !== null) {
        const otherOpInc = other_operating_income ?? 0;
        const otherOpExp = other_operating_expense ? Math.abs(other_operating_expense) : 0;
        operating_profit = netOperatingProfitRaw + otherOpInc - otherOpExp;
      } else {
        operating_profit = getVal(['3M', '3N', '3L', '3G', '3I'], ['sürdürülen faaliyetler vergi öncesi karı', 'vergi öncesi kar']);
      }

      financing_income = getVal(['3GA', '3HB', '3FA'], ['finansman gelirleri', '(esas faaliyet dışı) finansal gelirler', 'finansal gelirler']);
      financing_expenses = getVal(['3HC', '4BB', '3FB', '3G', '3F'], ['finansman giderleri (-)', '(esas faaliyet dışı) finansal giderler (-)', 'finansman giderleri']);

      profit_before_tax = getVal(['3I', '3M', '3N'], ['sürdürülen faaliyetler vergi öncesi karı', 'vergi öncesi karı', 'vergi öncesi kar']);
      ebt = profit_before_tax;

      tax_expense = getVal(['3IA', '3IB', '3IC', '3J', '3N'], ['sürdürülen faaliyetler vergi geliri (gideri)', 'dönem vergi geliri (gideri)', 'vergi gideri']);
      net_income = getVal(['2OCF', '3Z', '3K', '3L', '3U', '2MEZ'], ['ana ortaklık payları', 'dönem net karı veya zararı', 'dönem karı (zararı)', 'dönem net kar']);

      depreciation = getVal(['4CAAA', '4B', '4CAB'], ['amortisman giderleri', 'amortisman & itfa payları', 'amortisman ve itfa gideri ile ilgili düzeltmeler', 'amortisman']);
      const coreEbitForEbitda = (
        (gross_profit !== null && operating_expenses !== null)
          ? (gross_profit - Math.abs(operating_expenses))
          : null
      ) ?? netOperatingProfitRaw;
      const ebitBaseForEbitda = (
        other_operating_income_net !== null &&
        other_operating_income_net < 0 &&
        coreEbitForEbitda !== null &&
        (operating_profit === null || coreEbitForEbitda > operating_profit)
      )
        ? coreEbitForEbitda
        : operating_profit;
      if (ebitBaseForEbitda !== null) {
        ebitda = ebitBaseForEbitda + (depreciation !== null ? Math.abs(depreciation) : 0);
      }

      // 6. NAKİT AKIŞI:
      const officialOcf = getVal(['4C'], ['işletme faaliyetlerinden kaynaklanan net nakit', 'işletme faaliyetlerinden net nakit']);
      const officialFcf = getVal(['4CB'], ['serbest nakit akım', 'serbest nakit akışı']);

      grossOcf = getVal(['4CAE', '4A'], ['işletme sermayesinde gerçekleşen değişimler öncesi', 'işletme sermayesinde değişik', 'faaliyetlerden kaynaklanan nakit akışları']);
      netOcf = officialOcf ?? getVal(['4A_NET'], ['işletme faaliyetlerinden net nakit']);
      operating_cash_flow = netOcf ?? grossOcf ?? net_income;

      working_capital_change = getVal(['4CAF'], ['işletme sermayesindeki değişiklikler']);
      tangibleCapex = getVal(['4CAI', '4CBDA'], ['sabit sermaye yatırımları', 'maddi ve maddi olmayan duran varlıkların alımından kaynaklanan nakit çıkışları', 'maddi duran varlık alım']);
      totalCapex = getVal(['4CAK'], ['yatırım faaliyetlerinden kaynaklanan nakit']);

      investing_cash_flow = totalCapex ?? getVal(['4B', '4CAK'], ['yatırım faaliyetlerinden kaynaklanan nakit']);
      financing_cash_flow = getVal(['4CBE'], ['finansman faaliyetlerden kaynaklanan nakit', 'finansman faaliyetlerinden kaynaklanan nakit']);
      dividends_paid = getVal(['4CBB'], ['temettü ödemeleri']);
      net_change_in_cash = getVal(['4D', '4CC', '4CBI'], ['nakit ve nakit benzerlerindeki net artış', 'nakit ve benzerlerindeki değişim']);

      if (officialFcf !== null) {
        free_cash_flow = officialFcf;
        if (operating_cash_flow !== null) {
          const derivedCapex = operating_cash_flow - officialFcf;
          capex = derivedCapex >= 0 ? derivedCapex : 0;
        } else {
          capex = tangibleCapex !== null ? Math.abs(tangibleCapex) : (totalCapex !== null ? Math.abs(totalCapex) : null);
        }
      } else {
        capex = tangibleCapex !== null ? Math.abs(tangibleCapex) : (totalCapex !== null ? Math.abs(totalCapex) : null);
        if (operating_cash_flow !== null && capex !== null) {
          free_cash_flow = operating_cash_flow - capex;
        } else {
          free_cash_flow = operating_cash_flow;
        }
      }
    }

    const financial_debt = (short_term_debt !== null || long_term_debt !== null)
      ? (short_term_debt || 0) + (long_term_debt || 0)
      : null;

    return {
      period,
      revenue,
      cost_of_sales,
      gross_profit,
      marketing_expenses,
      administrative_expenses,
      rd_expenses,
      operating_expenses,
      other_operating_income,
      other_operating_expense,
      other_operating_income_net,
      operating_profit,
      operating_income: operating_profit,
      ebit: operating_profit,
      ebitda,
      financing_income,
      financing_expenses,
      ebt,
      profit_before_tax: profit_before_tax ?? ebt,
      tax_expense,
      net_income,

      // Bilanço - Varlıklar
      current_assets,
      cash_and_equivalents,
      cash: cash_and_equivalents,
      financial_investments,
      financial_assets_insured: financial_assets_insured ?? financial_investments,
      trade_receivables,
      other_receivables,
      derivative_instruments,
      inventories,
      prepaid_expenses,
      other_current_assets,
      non_current_assets,
      non_current_financial_investments,
      non_current_trade_receivables,
      tangible_assets,
      intangible_assets,
      right_of_use_assets,
      deferred_tax_assets,
      other_non_current_assets,
      total_assets,

      // Bilanço - Yükümlülükler ve Özkaynaklar
      current_liabilities,
      short_term_debt,
      trade_payables,
      employee_benefit_obligations,
      other_current_liabilities,
      long_term_liabilities,
      long_term_debt,
      other_long_term_liabilities,
      total_liabilities,
      financial_debt,
      net_debt,
      equity,
      paid_in_capital,
      retained_earnings,

      // Nakit Akışı
      operating_cash_flow,
      gross_operating_cash_flow: grossOcf,
      net_operating_cash_flow: netOcf ?? operating_cash_flow,
      depreciation,
      working_capital_change,
      capex,
      tangible_capex: tangibleCapex,
      total_investing_outflow: totalCapex,
      investing_cash_flow,
      free_cash_flow,
      financing_cash_flow,
      dividends_paid: dividends_paid !== null ? Math.abs(dividends_paid) : null,
      net_change_in_cash,

      // Sektörel / Sigorta
      written_premiums,
      gross_written_premiums: written_premiums,
      earned_premiums,
      technical_profit,
      technical_balance: technical_profit,
      investment_income,
      pension_aum,
      loss_ratio,
      expense_ratio,
      ga_ratio,
      commission_ratio,
      combined_ratio,
      net_fx_position: getVal(['4BE', '4BEA', '4BEB'], ['net yabancı para pozisyonu', 'net ypp'])
    };
  }

  /**
   * Tarihsel Büyüme ve Enflasyon Muhasebesi (TMS 29) Karşılaştırma Mantığı:
   * (t) dönemi ile (t-1) dönemi karşılaştırılırken, aynı raporda sunulan yeniden endekslenmiş
   * veya TMS 29 ile homojenize edilmiş karşılaştırmalı seriyi baz alır.
   */
  public static computePriorPeriodComparison(
    series: FinancialHistoryItem[],
    targetPeriod?: string
  ): PriorPeriodComparisonResult | null {
    if (!series || series.length < 2) return null;
    const sorted = [...series].sort((a, b) => (a.period || '').localeCompare(b.period || ''));
    
    const currentItem = targetPeriod 
      ? sorted.find(s => s.period === targetPeriod) || sorted[sorted.length - 1]
      : sorted[sorted.length - 1];
    
    const curPeriod = currentItem.period || '';
    const curYear = parseInt(curPeriod.slice(0, 4), 10);
    const curQuarter = curPeriod.slice(5);

    // Aynı çeyreğin 1 yıl önceki dönemi (YoY)
    const priorPeriodTarget = `${curYear - 1}/${curQuarter}`;
    const priorItem = sorted.find(s => s.period === priorPeriodTarget);

    if (!priorItem) {
      return null;
    }

    const calcGrowth = (curVal?: number | null, prevVal?: number | null): number | null => {
      if (curVal == null || prevVal == null || Math.abs(prevVal) < 1e-4) return null;
      return Number((((curVal - prevVal) / Math.abs(prevVal)) * 100).toFixed(1));
    };

    const isRestatedTms29 = Boolean(
      (currentItem as any).is_tms29 || 
      (priorItem as any).is_tms29 ||
      curYear >= 2024
    );

    return {
      currentPeriod: curPeriod,
      priorPeriod: priorPeriodTarget,
      isRestatedTms29,
      revenueGrowthYoY: calcGrowth(
        currentItem.revenue ?? currentItem.gross_written_premiums,
        priorItem.revenue ?? priorItem.gross_written_premiums
      ),
      operatingProfitGrowthYoY: calcGrowth(
        currentItem.operating_profit ?? currentItem.technical_profit,
        priorItem.operating_profit ?? priorItem.technical_profit
      ),
      ebitdaGrowthYoY: calcGrowth(
        currentItem.ebitda ?? currentItem.technical_profit,
        priorItem.ebitda ?? priorItem.technical_profit
      ),
      netIncomeGrowthYoY: calcGrowth(
        currentItem.net_income,
        priorItem.net_income
      )
    };
  }
}
