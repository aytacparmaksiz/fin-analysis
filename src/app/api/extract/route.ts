import { GoogleGenAI, Type, Schema } from '@google/genai';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { detectSector, SectorType } from '@/lib/sectors';
import { 
  generateWithRateLimitAndBackoff, 
  optimizeTextForGemini, 
  computeContentHash,
  cleanAndParseJson
} from '@/lib/gemini';
import { 
  computeSectorValuationAndDrivers,
  parseFinancialNumber,
  safeDivide,
  safeRoe,
  safeMargin,
  homogenizeTms29Series
} from '@/lib/valuation';
import { extractSmartFinancialText } from '@/lib/pdf-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function parsePeriodSortKey(period: string): number {
  if (!period) return 0;
  const str = String(period).trim();
  const yrMatch = str.match(/(20\d{2})/);
  if (!yrMatch) return 0;
  const year = parseInt(yrMatch[1], 10);

  if (/(?:q1|1\.ç|1ç|\/0?3\b|3a\b)/i.test(str)) return year * 100 + 3;
  if (/(?:q2|2\.ç|2ç|\/0?6\b|6a\b)/i.test(str)) return year * 100 + 6;
  if (/(?:q3|3\.ç|3ç|\/0?9\b|9a\b)/i.test(str)) return year * 100 + 9;
  if (/(?:q4|4\.ç|4ç|\/12\b|12a\b)/i.test(str)) return year * 100 + 12;

  return year * 100 + 12;
}

function getAnnualizationFactor(period: string): number {
  if (!period) return 1.0;
  const str = String(period).toLowerCase();
  if (/(?:\/0?3\b|3a\b|q1\b|1\.ç|1ç)/i.test(str)) return 4.0;
  if (/(?:\/0?6\b|6a\b|q2\b|2\.ç|2ç)/i.test(str)) return 2.0;
  if (/(?:\/0?9\b|9a\b|q3\b|3\.ç|3ç)/i.test(str)) return 12.0 / 9.0;
  return 1.0;
}

function enrichAndSanitizeFinancialHistory(data: any) {
  if (!data || !Array.isArray(data.financial_history)) return data;

  const detectedSector: SectorType = data.sector || detectSector(data.ticker || '');
  data.sector = detectedSector;

  const debtInfo = data.debt_and_interest || {};

  // Varsa TL borçlanma faizini tespit et
  let parsedTlRate: number | null = null;
  if (debtInfo.tl_interest_rate) {
    const rateVal = parseFinancialNumber(debtInfo.tl_interest_rate, { isPercentage: true });
    if (rateVal !== null && rateVal > 5 && rateVal < 90) {
      parsedTlRate = rateVal;
    }
  }

  // Kronolojik sıralama
  const history = [...data.financial_history].filter(Boolean).sort((a, b) => {
    return parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period);
  });

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    if (!item) continue;

    // OCR & Sayısal Temizlik: Eksi bakiyeler, tireli ve parantezli sayılar, binlik/ondalık ayraçları
    const numericFields = [
      'revenue', 'ebitda', 'net_income', 'gross_profit', 'operating_profit',
      'operating_cash_flow', 'capex', 'free_cash_flow', 'net_debt',
      'equity', 'total_assets', 'current_assets', 'non_current_assets',
      'cash_and_equivalents', 'financial_assets_insured', 'trade_receivables',
      'written_premiums', 'earned_premiums', 'technical_profit', 'investment_income',
      'loss_ratio', 'expense_ratio', 'combined_ratio',
      'npl_ratio', 'car_ratio', 'nim', 'net_interest_income', 'loan_to_deposit',
      'nav', 'holding_discount', 'dividends_paid',
      'current_ratio', 'quick_ratio', 'cash_ratio', 'leverage_ratio',
      'asset_turnover', 'equity_turnover', 'roa', 'roe', 'roic', 'wacc'
    ];
    for (const f of numericFields) {
      if (item[f] !== undefined && item[f] !== null) {
        const parsed = parseFinancialNumber(item[f], { 
          isPercentage: f.includes('ratio') || f.includes('margin') || f === 'roe' || f === 'roa' || f === 'roic' || f === 'wacc' || f === 'nim' || f.includes('discount')
        });
        if (parsed !== null) item[f] = parsed;
      }
    }

    // Yıl tespiti
    const yrMatch = String(item.period || '').match(/(20\d{2})/);
    const yr = yrMatch ? parseInt(yrMatch[1], 10) : 2024;
    const annualFactor = getAnnualizationFactor(item.period);

    // Sigorta sektörü özel alan eşleştirmeleri
    if (detectedSector === 'INSURANCE') {
      if (item.written_premiums && (!item.revenue || item.revenue === 0)) {
        item.revenue = item.written_premiums;
      }
      if (item.technical_profit && (!item.ebitda || item.ebitda === 0)) {
        item.ebitda = item.technical_profit;
      }
      if (item.loss_ratio != null && item.expense_ratio != null && item.combined_ratio == null) {
        item.combined_ratio = Number(((item.loss_ratio || 0) + (item.expense_ratio || 0)).toFixed(1));
      }
      if (item.combined_ratio != null && item.ebitda_margin == null) {
        item.ebitda_margin = Number((100 - item.combined_ratio).toFixed(1));
      }
      if (item.equity != null && item.net_income != null && item.roe == null) {
        const roeRes = safeRoe(item.net_income, item.equity, annualFactor);
        item.roe = roeRes.roe;
        if (roeRes.isInsolvent) item.solvency_warning = roeRes.warning;
      }
      if (item.total_assets && item.total_assets > 0 && item.net_income != null && item.roa == null) {
        item.roa = Number(((item.net_income * annualFactor / item.total_assets) * 100).toFixed(2));
      }
      if (item.total_assets && item.equity != null && item.leverage_ratio == null && item.total_assets > 0) {
        item.leverage_ratio = Number((((item.total_assets - item.equity) / item.total_assets) * 100).toFixed(2));
      }
    }

    // Bilanço Kalemlerini Akıllı Türet ve Eksikleri Tamamla (İlave 4: Tablo Tirelerini Önleme)
    // 1. Nakit ve Nakit Benzerleri
    if (item.cash_and_equivalents == null) {
      if (typeof item.cash === 'number') item.cash_and_equivalents = item.cash;
      else if (typeof item.liquid_assets === 'number') item.cash_and_equivalents = item.liquid_assets;
      else if (typeof item.net_debt === 'number' && item.net_debt < 0) {
        item.cash_and_equivalents = Math.abs(item.net_debt);
      }
    }

    // 2. Finansal Yatırımlar / Alacaklar Eşitlemesi
    if (item.financial_assets_insured == null && typeof item.financial_investments === 'number') {
      item.financial_assets_insured = item.financial_investments;
    }
    if (item.financial_investments == null && typeof item.financial_assets_insured === 'number') {
      item.financial_investments = item.financial_assets_insured;
    }

    // 3. Toplam Aktifler, Cari Varlıklar ve Cari Olmayan Varlıklar Dengesi
    if (item.total_assets != null && item.total_assets > 0) {
      if (item.current_assets != null && item.non_current_assets == null) {
        item.non_current_assets = Math.max(0, item.total_assets - item.current_assets);
      } else if (item.non_current_assets != null && item.current_assets == null) {
        item.current_assets = Math.max(0, item.total_assets - item.non_current_assets);
      }
    } else if (item.current_assets != null && item.non_current_assets != null) {
      item.total_assets = item.current_assets + item.non_current_assets;
    }

    // Eğer Cari Varlıklar hala boşsa nakit + alacaklar + yatırımlardan türet
    if (item.current_assets == null) {
      const subTotal = (item.cash_and_equivalents || 0) + 
                       (item.financial_assets_insured || item.financial_investments || 0) + 
                       (item.trade_receivables || 0);
      if (subTotal > 0) {
        item.current_assets = subTotal;
        if (item.total_assets != null && item.non_current_assets == null) {
          item.non_current_assets = Math.max(0, item.total_assets - subTotal);
        }
      }
    }

    // Eğer Toplam Aktifler hala boşsa özkaynak ve kaldıraçtan türet
    if (item.total_assets == null && item.equity && item.leverage_ratio && item.leverage_ratio < 100) {
      item.total_assets = Number((item.equity / (1 - item.leverage_ratio / 100)).toFixed(0));
      if (item.current_assets != null && item.non_current_assets == null) {
        item.non_current_assets = Math.max(0, item.total_assets - item.current_assets);
      }
    }

    // Özkaynak boşsa toplam aktifler ve kaldıraçtan türet
    if (item.equity == null && item.total_assets != null && item.leverage_ratio != null && item.leverage_ratio < 100) {
      item.equity = Number((item.total_assets * (1 - item.leverage_ratio / 100)).toFixed(0));
    }

    // Tüm sektörler için ROE, ROA, Kaldıraç Oranı dinamik hesapla (Safe ROE koruması)
    if (item.equity != null && item.net_income != null && item.roe == null) {
      const roeRes = safeRoe(item.net_income, item.equity, annualFactor);
      item.roe = roeRes.roe;
      if (roeRes.isInsolvent) item.solvency_warning = roeRes.warning;
    }
    if (item.total_assets && item.total_assets > 0 && item.net_income != null && item.roa == null) {
      item.roa = Number(((item.net_income * annualFactor / item.total_assets) * 100).toFixed(2));
    }
    if (item.total_assets && item.equity != null && item.leverage_ratio == null && item.total_assets > 0) {
      item.leverage_ratio = Number((((item.total_assets - item.equity) / item.total_assets) * 100).toFixed(2));
    }

    // Likidite ve Faaliyet Oranları (Safe Divide ile sıfıra bölünme koruması)
    if (item.current_assets != null && item.current_assets > 0) {
      const totalLiabilities = (item.total_assets != null && item.equity != null)
        ? Math.max(1, item.total_assets - item.equity)
        : (item.current_assets * 0.3);
      const estCurrentLiab = detectedSector === 'INSURANCE'
        ? totalLiabilities * 0.045
        : totalLiabilities * 0.60;

      if (item.current_ratio == null && estCurrentLiab > 0) {
        const cr = safeDivide(item.current_assets, estCurrentLiab);
        if (cr !== null) item.current_ratio = Number(cr.toFixed(2));
      }
      if (item.quick_ratio == null && estCurrentLiab > 0) {
        const quick = detectedSector === 'INSURANCE' ? item.current_assets : item.current_assets * 0.75;
        const qr = safeDivide(quick, estCurrentLiab);
        if (qr !== null) item.quick_ratio = Number(qr.toFixed(2));
      }
      if (item.cash_ratio == null && estCurrentLiab > 0) {
        const cashVal = item.cash_and_equivalents ?? item.cash ?? item.liquid_assets ?? 0;
        const cashR = safeDivide(cashVal, estCurrentLiab);
        if (cashR !== null) item.cash_ratio = Number(cashR.toFixed(2));
      }
    }

    const rev = item.revenue ?? item.written_premiums;
    if (rev != null && rev > 0) {
      if (item.total_assets != null && item.total_assets > 0 && item.asset_turnover == null) {
        item.asset_turnover = Number(((rev * annualFactor) / item.total_assets).toFixed(2));
      }
      if (item.equity != null && item.equity > 0 && item.equity_turnover == null) {
        item.equity_turnover = Number(((rev * annualFactor) / item.equity).toFixed(2));
      }
    }

    // Eksik marjları hesapla (Safe Margin koruması)
    if (item.revenue && item.revenue > 0) {
      if (item.ebitda_margin == null && typeof item.ebitda === 'number') {
        item.ebitda_margin = safeMargin(item.ebitda, item.revenue);
      }
      if (item.net_margin == null && typeof item.net_income === 'number') {
        item.net_margin = safeMargin(item.net_income, item.revenue);
      }
      if (item.gross_margin == null && typeof item.gross_profit === 'number') {
        item.gross_margin = safeMargin(item.gross_profit, item.revenue);
      }
    }

    // Nakit Akış Kalemlerini Tamamla
    if (item.operating_cash_flow == null) {
      if (typeof item.ebitda === 'number' && item.ebitda > 0) {
        item.operating_cash_flow = Math.round(item.ebitda * 0.85);
      } else if (typeof item.net_income === 'number' && item.net_income > 0) {
        item.operating_cash_flow = Math.round(item.net_income * 1.10);
      }
    }
    if (item.capex == null) {
      if (typeof item.revenue === 'number' && item.revenue > 0) {
        item.capex = Math.round(item.revenue * (detectedSector === 'INSURANCE' ? 0.012 : 0.045));
      } else {
        item.capex = 0;
      }
    }
    if (item.free_cash_flow == null && item.operating_cash_flow != null) {
      item.free_cash_flow = item.operating_cash_flow - (item.capex || 0);
    }
    if (item.net_debt == null) {
      const cashVal = item.cash_and_equivalents ?? item.cash ?? 0;
      if (detectedSector === 'INSURANCE') {
        item.net_debt = -cashVal;
      } else if (item.total_assets && item.equity) {
        const totalLiabilities = Math.max(0, item.total_assets - item.equity);
        const estFinDebt = totalLiabilities * 0.45;
        item.net_debt = Math.round(estFinDebt - cashVal);
      }
    }

    // 1. Gerçekçi Türkiye piyasa WACC tabanı (TCMB ve faiz ortamı)
    let defaultWacc = 45.0; // 2024-2026 yüksek faiz ortamı varsayılanı
    if (yr <= 2021) defaultWacc = 18.5;
    else if (yr === 2022) defaultWacc = 22.0;
    else if (yr === 2023) defaultWacc = 32.5;
    else if (yr >= 2024) defaultWacc = 44.0;

    if (parsedTlRate) {
      defaultWacc = Number((parsedTlRate * 0.95).toFixed(1));
    }

    if (item.wacc == null || item.wacc === 0 || isNaN(Number(item.wacc))) {
      item.wacc = defaultWacc;
    } else {
      item.wacc = Number(Number(item.wacc).toFixed(1));
    }

    // 2. ROIC boş, 0 veya geçersizse finansal tablolardan türet
    if (item.roic == null || item.roic === 0 || isNaN(Number(item.roic))) {
      if (detectedSector === 'INSURANCE' && typeof item.roe === 'number') {
        item.roic = item.roe;
      } else {
        const equity = typeof item.equity === 'number' && item.equity > 0 ? item.equity : 0;
        const netDebt = typeof item.net_debt === 'number' && item.net_debt > 0 ? item.net_debt : 0;
        const investedCapital = equity + netDebt;

        const rawNopat = (typeof item.net_income === 'number' && item.net_income !== 0)
          ? item.net_income
          : ((typeof item.ebitda === 'number' && item.ebitda > 0) ? item.ebitda * 0.70 : 0);
        const nopat = rawNopat * annualFactor;

        if (investedCapital > 0 && nopat !== 0) {
          const calculated = (nopat / investedCapital) * 100;
          if (calculated >= -50 && calculated <= 150) {
            item.roic = Number(calculated.toFixed(1));
          } else if (typeof item.ebitda_margin === 'number' && item.ebitda_margin > 0) {
            item.roic = Number((item.ebitda_margin * 0.85).toFixed(1));
          } else {
            item.roic = Number((item.wacc * 0.88).toFixed(1));
          }
        } else if (typeof item.ebitda_margin === 'number' && item.ebitda_margin > 0) {
          item.roic = Number((item.ebitda_margin * 0.85).toFixed(1));
        } else if (typeof item.gross_margin === 'number' && item.gross_margin > 0) {
          item.roic = Number((item.gross_margin * 0.65).toFixed(1));
        } else {
          const prevRoic = i > 0 && history[i - 1]?.roic ? history[i - 1].roic : null;
          item.roic = prevRoic !== null ? prevRoic : Number((item.wacc * 0.88).toFixed(1));
        }
      }
    } else {
      item.roic = Number(Number(item.roic).toFixed(1));
    }

    item.eva_spread = Number((item.roic - item.wacc).toFixed(1));
  }

  // TMS 29 Homojenizasyonunu çalıştır (Bankacılık/Sigortacılık muafiyetini gözeterek)
  const { homogenizedHistory, hasTms29Adjustment, tms29Warnings } = homogenizeTms29Series(history, detectedSector);
  data.financial_history = homogenizedHistory;
  if (data.is_tms29_adjusted === undefined) {
    data.is_tms29_adjusted = hasTms29Adjustment;
  }
  if (tms29Warnings.length > 0 && !data.tms29_notes) {
    data.tms29_notes = tms29Warnings.join(' ');
  }

  return data;
}

function mergeExtractedData(results: any[]) {
  if (!results || results.length === 0) return {};
  if (results.length === 1) return enrichAndSanitizeFinancialHistory(results[0]);

  const merged: any = {
    ticker: '',
    sector: '',
    currency: '',
    reporting_period: '',
    share_count: '',
    financial_history: [],
    guidance_track_record: [],
    balance_sheet_summary: [],
    debt_and_interest: {},
    capex_and_kpi: {},
  };

  const periodMap = new Map<string, any>();
  const guidanceMap = new Map<string, any>();

  for (const r of results) {
    if (!r) continue;
    if (r.ticker && !merged.ticker) merged.ticker = r.ticker;
    if (r.sector && !merged.sector) merged.sector = r.sector;
    if (r.currency && !merged.currency) merged.currency = r.currency;
    if (r.share_count && !merged.share_count) merged.share_count = r.share_count;

    if (r.reporting_period) {
      if (!merged.reporting_period || String(r.reporting_period) > String(merged.reporting_period)) {
        merged.reporting_period = r.reporting_period;
        if (r.debt_and_interest) merged.debt_and_interest = r.debt_and_interest;
        if (r.capex_and_kpi) merged.capex_and_kpi = r.capex_and_kpi;
        if (r.currency) merged.currency = r.currency;
      }
    }

    if (Array.isArray(r.financial_history)) {
      for (const item of r.financial_history) {
        if (!item || !item.period) continue;
        const key = String(item.period).trim();
        if (periodMap.has(key)) {
          const existing = periodMap.get(key);
          periodMap.set(key, { ...existing, ...item });
        } else {
          periodMap.set(key, { ...item });
        }
      }
    }

    if (Array.isArray(r.guidance_track_record)) {
      for (const g of r.guidance_track_record) {
        if (!g || !g.year_or_period) continue;
        const key = `${g.year_or_period}_${(g.guidance_given || '').slice(0, 30)}`;
        if (!guidanceMap.has(key)) {
          guidanceMap.set(key, g);
        }
      }
    }

    if (Array.isArray(r.balance_sheet_summary)) {
      for (const b of r.balance_sheet_summary) {
        if (b && b.metric && !merged.balance_sheet_summary.some((x: any) => x.metric === b.metric)) {
          merged.balance_sheet_summary.push(b);
        }
      }
    }

    if (r.pros_cons && !merged.pros_cons) merged.pros_cons = r.pros_cons;
    if (r.fair_value_drivers && !merged.fair_value_drivers) merged.fair_value_drivers = r.fair_value_drivers;
    if (r.valuation && !merged.valuation) merged.valuation = r.valuation;
  }

  merged.financial_history = Array.from(periodMap.values()).sort((a, b) => {
    return parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period);
  });

  merged.guidance_track_record = Array.from(guidanceMap.values()).sort((a, b) => {
    return String(a.year_or_period).localeCompare(String(b.year_or_period), undefined, { numeric: true });
  });

  return enrichAndSanitizeFinancialHistory(merged);
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let ticker = '';
    let documents: { name: string; text: string }[] = [];
    let pdfFiles: File[] = [];

    if (contentType.includes('application/json')) {
      const json = await req.json();
      ticker = json.ticker || '';
      documents = json.documents || [];
    } else {
      const formData = await req.formData();
      ticker = formData.get('ticker') as string;
      pdfFiles = formData.getAll('files') as File[];
    }

    if (!ticker || (documents.length === 0 && pdfFiles.length === 0)) {
      return NextResponse.json({ error: 'Hisse kodu ve en az bir PDF/doküman gereklidir.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY eksik.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const targetSector = detectSector(ticker);

    const extractionSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        ticker: { type: Type.STRING },
        sector: { type: Type.STRING, description: 'Şirket sektörü: INSURANCE (Sigorta/Emeklilik), BANKING (Banka) veya INDUSTRIAL (Sanayi/Genel)' },
        currency: { type: Type.STRING, description: 'Raporlanan para birimi (Örn: Bin TRY, Milyon TL, TL)' },
        reporting_period: { type: Type.STRING, description: 'En güncel dönem (Örn: 2026/06 veya 2026/Q2)' },
        share_count: { type: Type.STRING, description: 'Ödenmiş sermaye / hisse adedi' },
        is_tms29_adjusted: { type: Type.BOOLEAN, description: 'Finansal tablolarda TMS 29 enflasyon muhasebesi uygulandı mı (true/false)' },
        tms29_notes: { type: Type.STRING, description: 'TMS 29 enflasyon muhasebesi uygulamasına dair dipnot özeti' },

        financial_history: {
          type: Type.ARRAY,
          description: 'İncelenen raporlara ait finansal zaman serisi verileri',
          items: {
            type: Type.OBJECT,
            properties: {
              period: { type: Type.STRING, description: 'Dönem veya Yıl (Örn: 2022, 2023, 2024, 2025, 2026, 2026/Q2)' },
              is_tms29: { type: Type.BOOLEAN, description: 'Bu döneme ait veriler TMS 29 enflasyon muhasebesine göre düzeltilmiş mi?' },
              revenue: { type: Type.NUMBER, description: 'Net Satış Gelirleri / Hasılat (Sigorta için Brüt Prim Üretimi)' },
              ebitda: { type: Type.NUMBER, description: 'FAVÖK (Sigorta için Teknik Bölüm Dengesi / Kârı)' },
              net_income: { type: Type.NUMBER, description: 'Net Dönem Kârı' },
              gross_margin: { type: Type.NUMBER, description: 'Brüt Kâr Marjı (%)' },
              ebitda_margin: { type: Type.NUMBER, description: 'FAVÖK Marjı (%) veya Sigortada Teknik Marj' },
              net_margin: { type: Type.NUMBER, description: 'Net Kâr Marjı (%)' },
              operating_cash_flow: { type: Type.NUMBER, description: 'İşletme Faaliyetlerinden Nakit Akışı (OCF)' },
              capex: { type: Type.NUMBER, description: 'Yatırım Harcamaları (CAPEX)' },
              free_cash_flow: { type: Type.NUMBER, description: 'Serbest Nakit Akışı (FCF)' },
              net_debt: { type: Type.NUMBER, description: 'Net Finansal Borç (Sigortada negatif nakit fazlası olabilir)' },
              roic: { type: Type.NUMBER, description: 'Yatırılan Sermaye Getirisi (ROIC % veya ROE %)' },
              wacc: { type: Type.NUMBER, description: 'Ağırlıklı Ortalama Sermaye Maliyeti (WACC %)' },
              equity: { type: Type.NUMBER, description: 'Toplam Özkaynaklar' },

              // Sektörel Özel Kalemler (Sigorta & Emeklilik)
              written_premiums: { type: Type.NUMBER, description: 'Brüt Yazılan Primler (Sigorta)' },
              earned_premiums: { type: Type.NUMBER, description: 'Net Kazanılan Primler (Sigorta)' },
              technical_profit: { type: Type.NUMBER, description: 'Teknik Bölüm Dengesi / Kârı (Sigorta)' },
              investment_income: { type: Type.NUMBER, description: 'Net Yatırım / Finansal Gelirler (Sigorta)' },
              loss_ratio: { type: Type.NUMBER, description: 'Hasar/Prim Oranı (%)' },
              expense_ratio: { type: Type.NUMBER, description: 'Masraf Oranı (%)' },
              combined_ratio: { type: Type.NUMBER, description: 'Kombine / Bileşik Oran (%)' },

              // Finansal Oranlar / Rasyolar
              current_ratio: { type: Type.NUMBER, description: 'Cari Oran' },
              quick_ratio: { type: Type.NUMBER, description: 'Likidite Oranı (Asit-Test)' },
              cash_ratio: { type: Type.NUMBER, description: 'Nakit Oran' },
              leverage_ratio: { type: Type.NUMBER, description: 'Kaldıraç Oranı (%)' },
              asset_turnover: { type: Type.NUMBER, description: 'Aktif Devir Hızı' },
              equity_turnover: { type: Type.NUMBER, description: 'Özkaynak Devir Hızı' },
              roa: { type: Type.NUMBER, description: 'Aktif Karlılık (ROA %)' },
              roe: { type: Type.NUMBER, description: 'Özkaynak Karlılığı (ROE %)' },

              // Sektörel Özel Kalemler (Bankacılık & Holding)
              npl_ratio: { type: Type.NUMBER, description: 'Takipteki Krediler Oranı (NPL / TGA %)' },
              car_ratio: { type: Type.NUMBER, description: 'Sermaye Yeterlilik Rasyosu (SYR / CAR %)' },
              nim: { type: Type.NUMBER, description: 'Net Faiz Marjı (NIM %)' },
              net_interest_income: { type: Type.NUMBER, description: 'Net Faiz Geliri (NII)' },
              loan_to_deposit: { type: Type.NUMBER, description: 'Kredi / Mevduat Oranı (LDR %)' },
              nav: { type: Type.NUMBER, description: 'Net Aktif Değeri (NAD / NAV - Holding)' },
              holding_discount: { type: Type.NUMBER, description: 'Tarihsel NAD İskontosu (% - Holding)' },
              dividends_paid: { type: Type.NUMBER, description: 'Ödenen / Alınan Temettüler' },

              // Bilanço Detayları
              current_assets: { type: Type.NUMBER, description: 'Cari Varlıklar Toplamı' },
              cash_and_equivalents: { type: Type.NUMBER, description: 'Nakit ve Nakit Benzeri Varlıklar' },
              financial_assets_insured: { type: Type.NUMBER, description: 'Finansal Varlıklar ile Riski Sigortalılara Ait Yatırımlar' },
              trade_receivables: { type: Type.NUMBER, description: 'Esas Faaliyetlerden Alacaklar' },
              non_current_assets: { type: Type.NUMBER, description: 'Cari Olmayan Varlıklar Toplamı' },
              total_assets: { type: Type.NUMBER, description: 'Toplam Varlıklar / Aktifler' },
            },
            required: ['period', 'revenue', 'ebitda', 'net_income'],
          },
        },

        guidance_track_record: {
          type: Type.ARRAY,
          description: 'Şirketin geçmiş yıllarda sunduğu hedefler/rehberlikler ve gerçekleşme oranları',
          items: {
            type: Type.OBJECT,
            properties: {
              year_or_period: { type: Type.STRING, description: 'Hedef dönemi (Örn: 2023, 2024, 2025)' },
              guidance_given: { type: Type.STRING, description: 'Yönetimin açıkladığı ciro, marj veya satış adedi hedefi' },
              actual_realized: { type: Type.STRING, description: 'Yıl sonunda gerçekleşen sonuç' },
              status: { type: Type.STRING, description: 'BAŞARILI, KISMEN, BAŞARISIZ veya BELİRTİLMEDİ' },
              analysis: { type: Type.STRING, description: 'Sapmanın nedeni ve yönetimin vaat tutma karnesi' },
            },
            required: ['year_or_period', 'guidance_given', 'actual_realized', 'status'],
          },
        },

        balance_sheet_summary: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              metric: { type: Type.STRING },
              val_latest: { type: Type.STRING },
              val_prev_year: { type: Type.STRING },
              page_ref: { type: Type.STRING, description: 'Verinin bulunduğu sayfa no / dipnot no' },
            },
            required: ['metric', 'val_latest'],
          },
        },

        debt_and_interest: {
          type: Type.OBJECT,
          properties: {
            short_term_debt_ratio: { type: Type.STRING, description: 'Kısa vadeli borç payı (%)' },
            long_term_debt_ratio: { type: Type.STRING, description: 'Uzun vadeli borç payı (%)' },
            tl_interest_rate: { type: Type.STRING, description: 'TL kredi efektif faizi' },
            fx_interest_rate: { type: Type.STRING, description: 'Döviz kredi efektif faizi' },
            ttm_favok: { type: Type.STRING, description: 'Son 4 Çeyreklik FAVÖK' },
            page_ref: { type: Type.STRING },
          },
        },

        capex_and_kpi: {
          type: Type.OBJECT,
          properties: {
            maintenance_capex: { type: Type.STRING, description: 'İdame CAPEX' },
            growth_capex: { type: Type.STRING, description: 'Büyüme CAPEX' },
            management_guidance: { type: Type.STRING, description: 'Gelecek dönem yönetici rehberliği' },
            planned_capex_budget: { type: Type.STRING, description: 'Planlanan büyük yatırım bütçesi' },
            sectoral_kpis: { type: Type.STRING, description: 'Sektörel KPI incelemesi' },
            sensitivity_summary: { type: Type.STRING, description: 'Duyarlılık analizi özeti' },
          },
        },

        pros_cons: {
          type: Type.OBJECT,
          description: 'Şirketin güçlü yönleri (pros) ve riskli/zayıf yönleri (cons)',
          properties: {
            pros: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  desc: { type: Type.STRING },
                },
                required: ['title', 'desc'],
              },
            },
            cons: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  desc: { type: Type.STRING },
                },
                required: ['title', 'desc'],
              },
            },
          },
        },

        fair_value_drivers: {
          type: Type.OBJECT,
          description: 'Adil değer sürücüleri ve ayı/boğa senaryoları',
          properties: {
            revenue_growth: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.NUMBER },
                label: { type: Type.STRING },
                bearLabel: { type: Type.STRING },
                bullLabel: { type: Type.STRING },
                note: { type: Type.STRING },
              },
            },
            net_income_growth: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.NUMBER },
                label: { type: Type.STRING },
                bearLabel: { type: Type.STRING },
                bullLabel: { type: Type.STRING },
                note: { type: Type.STRING },
              },
            },
            margin: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.NUMBER },
                label: { type: Type.STRING },
                bearLabel: { type: Type.STRING },
                bullLabel: { type: Type.STRING },
                note: { type: Type.STRING },
              },
            },
            target_multiple: {
              type: Type.OBJECT,
              properties: {
                value: { type: Type.STRING },
                label: { type: Type.STRING },
                bearLabel: { type: Type.STRING },
                bullLabel: { type: Type.STRING },
                note: { type: Type.STRING },
              },
            },
          },
        },
      },
      required: ['ticker', 'reporting_period', 'financial_history'],
    };

    const systemInstruction = `Sen katı, rasyonel ve zaman serisi (multi-year) analizi yapabilen kıdemli bir Finansal Veri Çıkarım motorusun.
GÖREVİN:
Yüklenen finansal raporları tarayarak finansal kalemleri, marjları, rasyoları ve geçmiş hedef/rehberlikleri birebir çıkarmaktır.

VERİ VE SAYI OKUMA KURALLARI:
1. EKSİ BAKİYE VE PARANTEZ FORMATLARI: Finansal tablolarda parantez içinde (örn: (1.234), (45.670), (1.250.000)) veya tire ile (örn: 1.234-, -1.234) verilen değerler NEGATİF SAYIDIR. Bunları KESİNLİKLE eksi (-) işaretli negatif sayı olarak ver (örn: -1234, -45670). Asla pozitif sayıya dönüştürme.
2. BİNLİK VE ONDALIK AYRAÇLARI: Türkiye formatında nokta (.) binlik ayracıdır (örn: 1.250.000 = 1250000), virgül (,) ise ondalık ayracıdır (örn: 12,5% = 12.5). Ondalıkları nokta (.) ile standart JSON float formatında döndür.
3. KESİNLİKLE FİNANSAL HALÜSİNASYON GÖRME: Raporlarda açıkça bulunmayan hiçbir rakamı uydurma. Eğer bir veri tabloda yer almıyorsa 0 değil, null bırak.
4. TMS 29 (ENFLASYON MUHASEBESİ): Raporlanan finansal tabloların TMS 29 Yüksek Enflasyonlu Ekonomilerde Finansal Raporlama standardına göre enflasyona göre düzeltilip düzeltilmediğini kontrol et. Her dönem için 'is_tms29' bayrağını (true/false) ve genel raporlama için 'is_tms29_adjusted' alanını işaretle.

SEKTÖREL UYARLAMA VE KESİN PARAMETRE KURALLARI:
1. Şirket AGESA, ANHYT, TURSG gibi bir SİGORTACILIK veya BİREYSEL EMEKLİLİK şirketi ise:
   - Klasik 'Satış Gelirleri' yerine 'Brüt Yazılan Primler' veya Teknik Gelirleri 'revenue' alanına yaz.
   - Klasik 'FAVÖK' yerine 'Teknik Bölüm Dengesi / Teknik Kâr'ı 'ebitda' alanına yaz.
   - Hasar/Prim Oranı, Masraf Oranı ve Kombine Oranı (Hasar + Masraf) mutlaka çıkar.
   - Özkaynak Kârlılığı (ROE) ve Aktif Kârlılığı (ROA) oranlarını doldur. Sigortacılıkta borçluluk aranmaz, özkaynak kârlılığı ve portföy büyüklüğü temel metriktir.
   - Bilanço kalemlerini (Cari Varlıklar, Nakit, Riski Sigortalılara Ait Yatırımlar, Toplam Varlıklar, Özkaynaklar) eksiksiz çıkar.
2. Şirket GARAN, AKBNK, ISCTR, YKBNK gibi BANKACILIK ise:
   - 'revenue' alanına Net Faiz Gelirleri (NII) veya Faaliyet Gelirlerini yaz.
   - Kesinlikle FAVÖK veya Brüt Kâr uydurma.
   - Net Faiz Marjı ('nim'), Takipteki Krediler Oranı ('npl_ratio'), Sermaye Yeterlilik Rasyosu ('car_ratio') ve ROE oranlarını doğrudan bilanço dipnotlarından çıkar.
3. Şirket KCHOL, SAHOL, AGHOL gibi HOLDİNG ise:
   - Net Aktif Değeri ('nav'), Tarihsel NAD İskonto Oranı ('holding_discount'), solo net nakit/borç ve iştirak temettü akışlarını ('dividends_paid') çıkar.
   - Holding konsolide rakamlarında operasyonel kâr yerine solo bilanço gücü ve temettü nakit akışını önceliklendir.
4. KESİNTİSİZ HALÜSİNASYON ENGELİ: Metinde açıkça belirtilmeyen oranları (örn: bankada olmayan bir FAVÖK marjı veya borç oranı) kafandan uydurma. Veri eksikse alanı null bırak.
5. Zaman serisi (financial_history) dizisinde bulunan tüm dönemleri (özellikle 2024, 2025, 2026 gibi güncel çeyrekleri) eksiksiz doldur.
6. Çıkarımlarını finansal tablolardaki verilere ve standart finans matematiğine dayandır.`;

    const batchResults: any[] = [];

    // Eğer istemciden ham dosyalar geldiyse, önce sunucu tarafında hızlıca unpdf ile akıllı sayfa filtrelemesi yap
    if (documents.length === 0 && pdfFiles.length > 0) {
      for (const file of pdfFiles) {
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const { text } = await extractSmartFinancialText(buffer);
          if (text && text.trim().length > 50) {
            documents.push({ name: file.name, text: text.trim() });
          }
        } catch (serverExtractErr) {
          console.warn(`[Extract] ${file.name} sunucu unpdf metin çıkarma hatası:`, serverExtractErr);
        }
      }
    }

    if (documents.length > 0) {
      // 1. İstemci veya Sunucu Tarafından Ayıklanmış Metin Dokümanları (Vercel 4.5 MB Sınırını Kesinlikle Aşmaz)
      // 1-5 dokümanı tek bir istekte birleştirerek gereksiz ara beklemeleri (13s) ve timeout'ları önle
      const DOC_BATCH_SIZE = 5;
      for (let i = 0; i < documents.length; i += DOC_BATCH_SIZE) {
        const batch = documents.slice(i, i + DOC_BATCH_SIZE);
        const rawDocTexts = batch.map((d: any) => `### RAPOR DOKÜMANI: ${d.name}\n${d.text}`).join('\n\n---\n\n');
        const docTexts = optimizeTextForGemini(rawDocTexts);

        const userPrompt = `Şirket: ${ticker.toUpperCase()}.
Aşağıda şirkete ait yüklenen faaliyet raporları, bilançolar ve gelir tablolarının metinleri yer almaktadır (Paket ${Math.floor(i / DOC_BATCH_SIZE) + 1}/${Math.ceil(documents.length / DOC_BATCH_SIZE)}):

${docTexts}

GÖREVLER:
1. Belgede yer alan tüm dönemlere ait Hasılat (revenue), FAVÖK (ebitda), Net Kâr (net_income), Marjlar (%), Nakit Akışları (OCF, CAPEX, FCF), Net Borç (net_debt) ve ROIC/WACC verilerini eksiksiz çıkar veya hesapla (özellikle 2024 ve sonraki yıllar dahil).
2. BİLANÇO DETAYLARI: Cari Varlıklar (current_assets), Nakit ve Nakit Benzerleri (cash_and_equivalents), Finansal Yatırımlar (financial_assets_insured), Alacaklar (trade_receivables), Cari Olmayan Varlıklar (non_current_assets), Toplam Varlıklar (total_assets) ve Toplam Özkaynaklar (equity) kalemlerini eksiksiz çıkar.
3. EKSİ BAKİYELER: Parantez içindeki veya tireli rakamları (örn: (1.234) veya 1.234-) KESİNLİKLE negatif sayı (-1234) olarak JSON'a yaz.
4. TMS 29: Tablolarda TMS 29 enflasyon muhasebesi varsa dönemlerin 'is_tms29' bayrağını true yap.
5. Varsa geçmiş yönetim hedeflerini (guidance) ve gerçekleşmelerini çıkar.
6. Rakamları tam veya ondalıklı sayı olarak ver. Tabloda olmayan rakamı uydurma, null bırak.`;

        try {
          const cacheKey = `extract_${ticker.toUpperCase()}_batch_${i}_${computeContentHash(docTexts)}`;
          const response = await generateWithRateLimitAndBackoff({
            ai,
            baseParams: {
              contents: [userPrompt],
              config: {
                systemInstruction,
                temperature: 0.0,
                responseMimeType: 'application/json',
                responseSchema: extractionSchema,
              },
            },
            cacheKey,
          });

          const parsedData = cleanAndParseJson(response.text || '{}');
          batchResults.push(parsedData);
        } catch (batchError: any) {
          console.error(`[Extract Text] Paket ${Math.floor(i / DOC_BATCH_SIZE) + 1} işlenirken hata:`, batchError);
        }
      }
    } else {
      // 2. Ham PDF Dosyaları (Doğrudan FormData Akışı)
      const BATCH_SIZE = pdfFiles.length > 5 ? 2 : (pdfFiles.length > 2 ? 2 : pdfFiles.length);
      const fileBatches: File[][] = [];
      for (let i = 0; i < pdfFiles.length; i += BATCH_SIZE) {
        fileBatches.push(pdfFiles.slice(i, i + BATCH_SIZE));
      }

      for (let bIndex = 0; bIndex < fileBatches.length; bIndex++) {
        const currentBatch = fileBatches[bIndex];
        const tempFilePaths: string[] = [];
        const uploadedGoogleFiles: any[] = [];
        const fileParts: any[] = [];

      try {
        console.log(`[Extract] Paket ${bIndex + 1}/${fileBatches.length} işleniyor (${currentBatch.length} PDF)...`);

        for (const file of currentBatch) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const tempPath = path.join(os.tmpdir(), `${Date.now()}_${bIndex}_${safeName}`);
          fs.writeFileSync(tempPath, buffer);
          tempFilePaths.push(tempPath);

          const uploadResult = await ai.files.upload({
            file: tempPath,
            config: {
              mimeType: 'application/pdf',
            },
          });

          let fileObj = uploadResult;
          while (fileObj.state === 'PROCESSING') {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            fileObj = await ai.files.get({ name: uploadResult.name! });
          }

          uploadedGoogleFiles.push(fileObj);

          fileParts.push({
            fileData: {
              fileUri: fileObj.uri!,
              mimeType: fileObj.mimeType || 'application/pdf',
            },
          });
        }

        const userPrompt = `Şirket: ${ticker.toUpperCase()}. 
Ekteki belgeleri incele (Paket ${bIndex + 1}/${fileBatches.length}):
1. Belgede yer alan tüm dönemlere ait Hasılat (revenue), FAVÖK (ebitda), Net Kâr (net_income), Marjlar (%), Nakit Akışları (OCF, CAPEX, FCF), Net Borç (net_debt) ve ROIC/WACC verilerini eksiksiz çıkar veya hesapla (özellikle 2024 ve sonraki yıllar dahil).
2. BİLANÇO DETAYLARI: Cari Varlıklar (current_assets), Nakit ve Nakit Benzerleri (cash_and_equivalents), Finansal Yatırımlar (financial_assets_insured), Alacaklar (trade_receivables), Cari Olmayan Varlıklar (non_current_assets), Toplam Varlıklar (total_assets) ve Toplam Özkaynaklar (equity) kalemlerini eksiksiz çıkar.
3. EKSİ BAKİYELER: Parantez içindeki veya tireli rakamları (örn: (1.234) veya 1.234-) KESİNLİKLE negatif sayı (-1234) olarak JSON'a yaz.
4. TMS 29: Tablolarda TMS 29 enflasyon muhasebesi varsa dönemlerin 'is_tms29' bayrağını true yap.
5. Varsa geçmiş yönetim hedeflerini (guidance) ve gerçekleşmelerini çıkar.
6. Rakamları tam veya ondalıklı sayı olarak ver. Tabloda olmayan rakamı uydurma, null bırak.`;

        const pdfHash = computeContentHash(currentBatch.map(f => `${f.name}_${f.size}`).join(';'));
        const cacheKey = `extract_${ticker.toUpperCase()}_pdf_${bIndex}_${pdfHash}`;

        const response = await generateWithRateLimitAndBackoff({
          ai,
          baseParams: {
            contents: [...fileParts, userPrompt],
            config: {
              systemInstruction,
              temperature: 0.0,
              responseMimeType: 'application/json',
              responseSchema: extractionSchema,
            },
          },
          cacheKey,
        });

        const parsedData = cleanAndParseJson(response.text || '{}');
        batchResults.push(parsedData);
      } catch (batchError: any) {
        console.error(`[Extract] Paket ${bIndex + 1} işlenirken hata:`, batchError);
      } finally {
        // Geçici yerel ve Google dosyalarını her paketten sonra hemen silerek kota şişmesini önle
        for (const p of tempFilePaths) {
          if (fs.existsSync(p)) {
            try {
              fs.unlinkSync(p);
            } catch (e) {}
          }
        }
        for (const gf of uploadedGoogleFiles) {
          try {
            if (gf?.name) {
              const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
              await client.files.delete({ name: gf.name });
            }
          } catch (e) {}
        }
      }
    }
  }

  if (batchResults.length === 0) {
      return NextResponse.json({ error: 'Yüklenen PDF belgelerinden veri çıkarılamadı.' }, { status: 500 });
    }

    // Çıkarılan tüm paketleri tek bir kronolojik zaman serisinde birleştir
    const finalData = mergeExtractedData(batchResults);

    // Dinamik Değer Sürücüleri ve Adil Değerleme Hesapla (Item 2 & 3)
    const { drivers, valuation } = computeSectorValuationAndDrivers(finalData);
    if (!finalData.fair_value_drivers || !finalData.fair_value_drivers.revenue_growth) {
      finalData.fair_value_drivers = drivers;
    }
    if (!finalData.valuation || !finalData.valuation.fair_value) {
      finalData.valuation = valuation;
    }

    return NextResponse.json({ success: true, data: finalData });

  } catch (error: any) {
    console.error('Extraction Error:', error);
    return NextResponse.json({ error: error.message || 'Veri çıkarımı başarısız oldu.' }, { status: 500 });
  }
}
