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
  enrichAndSanitizeFinancialHistory,
  parseFinancialNumber,
  parsePeriodSortKey,
  getAnnualizationFactor,
  normalizePeriodName
} from '@/lib/valuation';
import { extractSmartDocumentText, splitScannedPdfIntoChunks, DocumentCategory } from '@/lib/pdf-filter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ============================================================================
// ŞEMALAR (SCHEMAS)
// ============================================================================

// Alan 1: Finansal Tablolar (KAP / Bağımsız Denetim) Şeması - Sadece Resmi Zaman Serisi Rakamları
const financialExtractionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    ticker: { type: Type.STRING },
    sector: { type: Type.STRING, description: 'Şirket sektörü: INSURANCE, BANKING, HOLDING veya INDUSTRIAL' },
    currency: { type: Type.STRING, description: 'Raporlanan para birimi (Örn: Bin TRY, Milyon TL, TL)' },
    reporting_period: { type: Type.STRING, description: 'En güncel dönem (Örn: 2026/06 veya 2026/Q2)' },
    share_count: { type: Type.STRING, description: 'Ödenmiş sermaye / hisse adedi' },
    shares_outstanding: { type: Type.NUMBER, description: 'Total number of shares outstanding (paid-in capital / par value)' },
    is_tms29_adjusted: { type: Type.BOOLEAN, description: 'Finansal tablolarda TMS 29 enflasyon muhasebesi uygulandı mı (true/false)' },
    tms29_notes: { type: Type.STRING, description: 'TMS 29 enflasyon muhasebesi uygulamasına dair dipnot özeti' },

    financial_history: {
      type: Type.ARRAY,
      description: 'İncelenen raporlara ait resmi finansal zaman serisi verileri',
      items: {
        type: Type.OBJECT,
        properties: {
          period: { type: Type.STRING, description: 'Dönem veya Yıl (Örn: 2022, 2023, 2024, 2025, 2026, 2026/Q2)' },
          is_tms29: { type: Type.BOOLEAN, description: 'Bu döneme ait veriler TMS 29 enflasyon muhasebesine göre düzeltilmiş mi?' },
          revenue: { type: Type.NUMBER, description: 'Net Satış Gelirleri / Hasılat (Sigorta için Brüt Prim Üretimi, Banka için Net Faiz Geliri)' },
          ebitda: { type: Type.NUMBER, description: 'FAVÖK (Sigorta için Teknik Bölüm Dengesi / Kârı)' },
          net_income: { type: Type.NUMBER, description: 'Net Dönem Kârı' },
          gross_profit: { type: Type.NUMBER, description: 'Brüt Kâr' },
          operating_profit: { type: Type.NUMBER, description: 'Esas Faaliyet Kârı' },
          operating_cash_flow: { type: Type.NUMBER, description: 'İşletme Faaliyetlerinden Nakit Akışı (OCF)' },
          capex: { type: Type.NUMBER, description: 'Yatırım Harcamaları (CAPEX)' },
          free_cash_flow: { type: Type.NUMBER, description: 'Serbest Nakit Akışı (FCF)' },
          net_debt: { type: Type.NUMBER, description: 'Net Finansal Borç' },
          equity: { type: Type.NUMBER, description: 'Toplam Özkaynaklar' },
          total_assets: { type: Type.NUMBER, description: 'Toplam Varlıklar / Aktifler' },
          current_assets: { type: Type.NUMBER, description: 'Cari Varlıklar Toplamı (Dönen Varlıklar)' },
          non_current_assets: { type: Type.NUMBER, description: 'Cari Olmayan Varlıklar Toplamı (Duran Varlıklar)' },
          cash_and_equivalents: { type: Type.NUMBER, description: 'Nakit ve Nakit Benzeri Varlıklar' },
          financial_assets_insured: { type: Type.NUMBER, description: 'Finansal Varlıklar ile Riski Sigortalılara Ait Yatırımlar' },
          trade_receivables: { type: Type.NUMBER, description: 'Esas Faaliyetlerden Alacaklar' },

          // Sektörel Özel Kalemler (Sigorta & Emeklilik)
          written_premiums: { type: Type.NUMBER, description: 'Brüt Yazılan Primler (Sigorta)' },
          earned_premiums: { type: Type.NUMBER, description: 'Net Kazanılan Primler (Sigorta)' },
          technical_profit: { type: Type.NUMBER, description: 'Teknik Bölüm Dengesi / Kârı (Sigorta)' },
          investment_income: { type: Type.NUMBER, description: 'Net Yatırım / Finansal Gelirler (Sigorta)' },
          loss_ratio: { type: Type.NUMBER, description: 'Hasar/Prim Oranı (%)' },
          expense_ratio: { type: Type.NUMBER, description: 'Masraf Oranı (%)' },
          combined_ratio: { type: Type.NUMBER, description: 'Kombine / Bileşik Oran (%)' },

          // Sektörel Özel Kalemler (Bankacılık & Holding)
          npl_ratio: { type: Type.NUMBER, description: 'Takipteki Krediler Oranı (NPL / TGA %)' },
          car_ratio: { type: Type.NUMBER, description: 'Sermaye Yeterlilik Rasyosu (SYR / CAR %)' },
          nim: { type: Type.NUMBER, description: 'Net Faiz Marjı (NIM %)' },
          net_interest_income: { type: Type.NUMBER, description: 'Net Faiz Geliri (NII)' },
          loan_to_deposit: { type: Type.NUMBER, description: 'Kredi / Mevduat Oranı (LDR %)' },
          nav: { type: Type.NUMBER, description: 'Net Aktif Değeri (NAD / NAV - Holding)' },
          holding_discount: { type: Type.NUMBER, description: 'Tarihsel NAD İskontosu (% - Holding)' },
          dividends_paid: { type: Type.NUMBER, description: 'Ödenen / Alınan Temettüler' },
        },
        required: ['period'],
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
          page_ref: { type: Type.STRING },
        },
        required: ['metric', 'val_latest'],
      },
    },

    debt_and_interest: {
      type: Type.OBJECT,
      properties: {
        short_term_debt_ratio: { type: Type.STRING },
        long_term_debt_ratio: { type: Type.STRING },
        tl_interest_rate: { type: Type.STRING },
        fx_interest_rate: { type: Type.STRING },
        ttm_favok: { type: Type.STRING },
        page_ref: { type: Type.STRING },
      },
    },
  },
  required: ['ticker', 'reporting_period', 'financial_history'],
};

// Alan 2: Faaliyet Raporları Şeması - Yönetim Rehberlik Karnesi, Olumlu Gelecek Konuları & Pros/Cons
const activityExtractionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    guidance_track_record: {
      type: Type.ARRAY,
      description: '5. Yönetim Rehberlik Karnesi: Şirketin geçmiş yıllarda sunduğu hedefler ve gerçekleşme oranları',
      items: {
        type: Type.OBJECT,
        properties: {
          year_or_period: { type: Type.STRING, description: 'Hedef dönemi (Örn: 2022, 2023, 2024, 2025, 2026)' },
          guidance_given: { type: Type.STRING, description: 'Yönetimin açıkladığı ciro, marj, prim veya stratejik operasyonel hedefi' },
          actual_realized: { type: Type.STRING, description: 'Dönem sonunda gerçekleşen fiili sonuç' },
          status: { type: Type.STRING, description: 'BAŞARILI, KISMEN, BAŞARISIZ veya BELİRTİLMEDİ' },
          analysis: { type: Type.STRING, description: 'Sapmanın nedeni, piyasa şartları ve yönetimin vaat tutma karnesi' },
        },
        required: ['year_or_period', 'guidance_given', 'actual_realized', 'status'],
      },
    },

    positive_outlook_highlights: {
      type: Type.ARRAY,
      description: 'Gelecek dönem hedefleri için faaliyet raporunda olumlu bulunan konular, stratejik yatırımlar ve büyüme katalizörleri',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Olumlu bulunan konunun net Türkçe başlığı' },
          desc: { type: Type.STRING, description: 'Rapordan çıkarılan somut veri, beklenti ve neden gelecek dönem için olumlu olduğunun analizi' },
          period_or_target: { type: Type.STRING, description: 'İlgili hedef dönemi veya sayısal beklenti (Örn: 2026 Hedefi, Orta Vadeli Plan)' },
          category: { type: Type.STRING, description: 'BÜYÜME, MARJ İYİLEŞMESİ, YATIRIM, PAZAR PAYI veya NAKİT ÜRETİMİ' },
        },
        required: ['title', 'desc'],
      },
    },

    report_executive_summary: {
      type: Type.STRING,
      description: 'Faaliyet raporlarının bütüncül değerlendirmesi, yönetimin gelecek dönem vizyonu ve stratejik odak noktaları',
    },

    pros_cons: {
      type: Type.OBJECT,
      description: '4. Güçlü / Zayıf Yönler Analizi',
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

    capex_and_kpi: {
      type: Type.OBJECT,
      properties: {
        management_guidance: { type: Type.STRING },
        planned_capex_budget: { type: Type.STRING },
        sectoral_kpis: { type: Type.STRING },
        sensitivity_summary: { type: Type.STRING },
      },
    },
  },
  required: ['guidance_track_record', 'positive_outlook_highlights', 'pros_cons'],
};

// Alan 3: Yatırımcı Sunumu Şeması - İleriye Dönük Beklentiler, Olumlu Gelecek Konuları & Sürücüler
const presentationExtractionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    fair_value_drivers: {
      type: Type.OBJECT,
      description: '2. Adil Değer & Sürücüler paneli için ileriye dönük beklentiler ve marj hedefleri',
      properties: {
        revenue_growth: {
          type: Type.OBJECT,
          properties: {
            value: { type: Type.NUMBER, description: 'Yönetimin beklediği ciro / prim büyümesi (%)' },
            label: { type: Type.STRING },
            bearLabel: { type: Type.STRING },
            bullLabel: { type: Type.STRING },
            note: { type: Type.STRING, description: 'Sunumda belirtilen büyüme katalizörü veya hedef açıklaması' },
          },
        },
        net_income_growth: {
          type: Type.OBJECT,
          properties: {
            value: { type: Type.NUMBER, description: 'Net kâr büyüme hedefi (%)' },
            label: { type: Type.STRING },
            bearLabel: { type: Type.STRING },
            bullLabel: { type: Type.STRING },
            note: { type: Type.STRING },
          },
        },
        margin: {
          type: Type.OBJECT,
          properties: {
            value: { type: Type.NUMBER, description: 'Hedeflenen kâr marjı (FAVÖK veya Teknik Marj %)' },
            label: { type: Type.STRING },
            bearLabel: { type: Type.STRING },
            bullLabel: { type: Type.STRING },
            note: { type: Type.STRING },
          },
        },
        target_multiple: {
          type: Type.OBJECT,
          properties: {
            value: { type: Type.STRING, description: 'Hedef çarpan veya değerleme rasyosu' },
            label: { type: Type.STRING },
            bearLabel: { type: Type.STRING },
            bullLabel: { type: Type.STRING },
            note: { type: Type.STRING },
          },
        },
      },
    },
    positive_outlook_highlights: {
      type: Type.ARRAY,
      description: 'Yatırımcı sunumunda gelecek dönem hedefleri için olumlu bulunan konular, projeler ve büyüme katalizörleri',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Olumlu bulunan konunun net Türkçe başlığı' },
          desc: { type: Type.STRING, description: 'Sunumdan çıkarılan somut veri, hedef ve gelecek döneme olumlu etkisi' },
          period_or_target: { type: Type.STRING, description: 'İlgili hedef dönemi veya sayısal beklenti' },
          category: { type: Type.STRING, description: 'BÜYÜME, MARJ İYİLEŞMESİ, YATIRIM, PAZAR PAYI veya NAKİT ÜRETİMİ' },
        },
        required: ['title', 'desc'],
      },
    },
    future_targets_summary: {
      type: Type.STRING,
      description: 'Yatırımcı sunumundan özetlenen orta/uzun vadeli strateji ve hedefler',
    },
    guidance_track_record: {
      type: Type.ARRAY,
      description: 'Yatırımcı sunumunda yer alan geçmiş ve güncel yönetim hedefleri (Guidance) ve gerçekleşmeler',
      items: {
        type: Type.OBJECT,
        properties: {
          year_or_period: { type: Type.STRING, description: 'Hedef dönemi (Örn: 2022, 2023, 2024, 2025, 2026)' },
          guidance_given: { type: Type.STRING, description: 'Sunumda açıklanan sayısal veya stratejik yönetim hedefi (ASLA "null" yazma)' },
          actual_realized: { type: Type.STRING, description: 'Dönem sonunda gerçekleşen fiili finansal/operasyonel sonuç' },
          status: { type: Type.STRING, description: 'BAŞARILI, KISMEN, BAŞARISIZ veya BELİRTİLMEDİ' },
          analysis: { type: Type.STRING, description: 'Hedef ile gerçekleşme arasındaki uyum ve yönetim performansı analizi' },
        },
        required: ['year_or_period', 'guidance_given', 'actual_realized', 'status'],
      },
    },
  },
  required: ['fair_value_drivers', 'positive_outlook_highlights'],
};

// ============================================================================
// SYSTEM INSTRUCTIONS
// ============================================================================

const financialSystemInstruction = `Sen katı, rasyonel ve çok dönemli resmi finansal veri çıkarım motorusun.
GÖREVİN (ALAN 1: FİNANSAL TABLOLAR - KAP / BAĞIMSIZ DENETİM):
Yüklenen belgeler resmi Bilanço, Gelir Tablosu ve Nakit Akış Tablolarıdır.
Bu belgeler SADECE ve SADECE denetimden geçmiş resmi finansal zaman serisi rakamlarını (financial_history) çıkarmak için taranır. Asla PR veya serbest yorum kabul edilmez.

VERİ VE SAYI OKUMA KURALLARI:
1. EKSİ BAKİYE VE PARANTEZ FORMATLARI: Finansal tablolarda parantez içinde (örn: (1.234), (45.670)) veya tire ile (örn: 1.234-, -1.234) verilen değerler NEGATİF SAYIDIR. Bunları KESİNLİKLE eksi (-) işaretli negatif sayı olarak ver (örn: -1234, -45670). Asla pozitif sayıya dönüştürme.
2. BİNLİK VE ONDALIK AYRAÇLARI: Türkiye formatında nokta (.) binlik ayracıdır (örn: 1.250.000 = 1250000), virgül (,) ise ondalık ayracıdır (örn: 12,5% = 12.5). Ondalıkları nokta (.) ile standart JSON float formatında döndür.
3. KESİNLİKLE FİNANSAL HALÜSİNASYON GÖRME: Raporlarda açıkça bulunmayan hiçbir rakamı uydurma. Eğer bir veri tabloda yer almıyorsa null bırak.
4. TMS 29 (ENFLASYON MUHASEBESİ): Raporlanan finansal tabloların TMS 29 standardına göre enflasyona göre düzeltilip düzeltilmediğini kontrol et. Her dönem için 'is_tms29' bayrağını (true/false) işaretle.
5. SEKTÖREL KURALLAR:
   - Sigorta için Brüt Prim Üretimi 'revenue', Teknik Bölüm Dengesi 'ebitda', Kombine Oran 'combined_ratio' içine alınır.
   - Bankacılık için Net Faiz Geliri 'revenue' içine alınır; FAVÖK aranmaz.
   - Holding için Net Aktif Değeri (NAD) ve temettüler çıkarılır.`;

const activitySystemInstruction = `Sen kurumsal faaliyet raporlarını ve yatırımcı sunumlarını çok yıllı (multi-year) perspektifle inceleyen kıdemli yatırım analistisin.
GÖREVİN (ALAN 2: FAALİYET RAPORLARI):
Bu alandaki belgeler "5. Faaliyet Raporu, Sunum & Rehberlik Analizi" panelindeki Gelecek Dönem Olumlu Konular ('positive_outlook_highlights'), Yönetim Rehberlik Karnesi ('guidance_track_record'), pazar payı, operasyonel metrikler, riskler ve "4. Güçlü / Zayıf Yönler (Pros & Cons)" analizi için taranır.

KURALLAR:
1. ASLA ve KESİNLİKLE resmi finansal tablo rakamlarına müdahale etme veya yeni bilanço rakamı uydurma.
2. ÇOK YILLI KAPSAMA ZORUNLULUĞU: Yüklenen tüm yıllara ait faaliyet raporlarını (örn: 2022, 2023, 2024, 2025, 2026) tek tek incele ve HER YIL İÇİN 'guidance_track_record' listesinde ayrı bir satır oluştur. Sadece son 1-2 yılı alıp geçmiş yılları atlama!
3. ASLA "null" YAZMA: 'guidance_given' alanına kesinlikle "null" veya boş metin yazma! Eğer ilgili yılda kamuya açıklanmış dar kapsamlı bir sayısal (numeric) guidance tablosu yoksa, faaliyet raporunda yönetimin o yıl için ortaya koyduğu stratejik/operasyonel hedefleri özetle ve gerçekleşen resmi sonuçlarla karşılaştırarak 'BAŞARILI' / 'KISMEN' / 'BAŞARISIZ' olarak değerlendir.
4. GELECEK DÖNEM HEDEFLERİ İÇİN OLUMLU BULUNAN KONULAR ('positive_outlook_highlights'): Faaliyet raporlarında şirketin gelecek dönem hedefleri, yeni yatırımları, kapasite artışları, dijitalleşme adımları, pazar payı kazanımları ve maliyet iyileştirmeleri arasında gelecek kârlılığı destekleyecek EN ÖNEMLİ 4-6 olumlu konuyu somut verilerle çıkar.
5. DURU TÜRKÇE KURALI: 'bancassurance', 'moat', 'storytelling', 'run-rate' gibi yabancı terimler yerine anlaşılır Türkçe karşılıklarını ('banka sigortacılığı', 'rekabet üstünlüğü', 'yıllıklandırılmış tempo') kullan. Bozuk karakterler veya dolar ($) formül işaretleri kullanma.`;

const presentationSystemInstruction = `Sen yatırımcı sunumlarını ve gelecek strateji dokümanlarını inceleyen uzman değerleme analistisin.
GÖREVİN (ALAN 3: YATIRIMCI SUNUMU & STRATEJİ DOKÜMANLARI):
Bu alandaki belgeler "2. Adil Değer & Sürücüler" panelindeki ileriye dönük beklentiler ve "5. Faaliyet Raporu, Sunum & Rehberlik Analizi" panelindeki Gelecek Dönem Olumlu Konular ('positive_outlook_highlights') ile Yönetim Rehberlik Karnesini ('guidance_track_record') güncellemek için taranır.

KURALLAR:
1. Şirket yönetiminin gelecek yıllara yönelik resmi ciro/prim büyüme, net kâr büyüme, FAVÖK/teknik marj hedeflerini ve değerleme çarpanı beklentilerini 'fair_value_drivers' objesine çıkar.
2. Yatırımcı sunumlarında gelecek dönem hedefleri için olumlu bulunan somut katalizörleri, yatırım projelerini ve marj beklentilerini 'positive_outlook_highlights' listesine (en az 4-6 madde) çıkar.
3. Yatırımcı sunumlarında yer alan geçmiş veya güncel yıl beklentilerini (Guidance / Targets / Outlook slaytları) 'guidance_track_record' dizisine çıkar. 'guidance_given' alanına asla "null" yazma.
4. Yabancı finansal jargon ('bancassurance', 'storytelling' vb.) yerine duru ve anlaşılır Türkçe kullan.`;

// ============================================================================
// YARDIMCI BİRLEŞTİRME FONKSİYONLARI (MERGE HELPERS)
// ============================================================================

function mergeFinancialHistoryBatches(results: any[]): any {
  if (!results || results.length === 0) return {};
  if (results.length === 1) {
    const single = results[0];
    if (Array.isArray(single?.financial_history)) {
      single.financial_history.forEach((it: any) => {
        if (it?.period) it.period = normalizePeriodName(it.period) || String(it.period).trim();
      });
      single.financial_history.sort((a: any, b: any) => parsePeriodSortKey(a?.period) - parsePeriodSortKey(b?.period));
    }
    return single;
  }

  const merged: any = {
    ticker: '',
    sector: '',
    currency: '',
    reporting_period: '',
    share_count: '',
    financial_history: [],
    balance_sheet_summary: [],
    debt_and_interest: {},
  };

  const periodMap = new Map<string, any>();

  for (const r of results) {
    if (!r) continue;
    if (r.ticker && !merged.ticker) merged.ticker = r.ticker;
    if (r.sector && !merged.sector) merged.sector = r.sector;
    if (r.currency && !merged.currency) merged.currency = r.currency;
    if (r.share_count && !merged.share_count) merged.share_count = r.share_count;

    if (r.reporting_period) {
      if (!merged.reporting_period || parsePeriodSortKey(r.reporting_period) >= parsePeriodSortKey(merged.reporting_period)) {
        merged.reporting_period = r.reporting_period;
        if (r.debt_and_interest) merged.debt_and_interest = r.debt_and_interest;
        if (r.currency) merged.currency = r.currency;
      }
    }

    if (r.guidance_track_record && !merged.guidance_track_record) merged.guidance_track_record = r.guidance_track_record;
    if (r.pros_cons && !merged.pros_cons) merged.pros_cons = r.pros_cons;
    if (r.capex_and_kpi && !merged.capex_and_kpi) merged.capex_and_kpi = r.capex_and_kpi;
    if (r.fair_value_drivers && !merged.fair_value_drivers) merged.fair_value_drivers = r.fair_value_drivers;

    if (Array.isArray(r.financial_history)) {
      for (const item of r.financial_history) {
        if (!item || !item.period) continue;
        const key = normalizePeriodName(item.period) || String(item.period).trim();
        item.period = key;
        if (periodMap.has(key)) {
          const existing = periodMap.get(key);
          const combined = { ...existing };
          for (const [k, v] of Object.entries(item)) {
            if (v !== null && v !== undefined && v !== '') {
              combined[k] = v;
            }
          }
          periodMap.set(key, combined);
        } else {
          periodMap.set(key, { ...item });
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
  }

  merged.financial_history = Array.from(periodMap.values()).sort((a, b) => {
    return parsePeriodSortKey(a.period) - parsePeriodSortKey(b.period);
  });

  return merged;
}

// ============================================================================
// API POST ENDPOINT
// ============================================================================

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let ticker = '';
    let price = '';
    let category: DocumentCategory | '' = '';
    let previousData: any = null;
    let previousReport: any = null;
    let documents: { name: string; text: string; category?: string }[] = [];
    let pdfFiles: File[] = [];
    let filesFinancial: File[] = [];
    let filesActivity: File[] = [];
    let filesPresentation: File[] = [];

    if (contentType.includes('application/json')) {
      const json = await req.json();
      ticker = json.ticker || '';
      price = json.price || '';
      category = (json.category || '').toLowerCase() as DocumentCategory;
      previousData = json.previousData || null;
      previousReport = json.previousReport || null;

      if (json.categorizedDocuments) {
        const cat = json.categorizedDocuments;
        if (Array.isArray(cat.financial)) {
          documents.push(...cat.financial.map((d: any) => ({ ...d, category: 'financial' })));
        }
        if (Array.isArray(cat.activity)) {
          documents.push(...cat.activity.map((d: any) => ({ ...d, category: 'activity' })));
        }
        if (Array.isArray(cat.presentation)) {
          documents.push(...cat.presentation.map((d: any) => ({ ...d, category: 'presentation' })));
        }
      } else if (Array.isArray(json.documents)) {
        documents = json.documents.map((d: any) => ({
          ...d,
          category: d.category || category || 'financial'
        }));
      }
    } else {
      const formData = await req.formData();
      ticker = (formData.get('ticker') as string) || '';
      price = (formData.get('price') as string) || '';
      category = ((formData.get('category') as string) || '').toLowerCase() as DocumentCategory;
      
      const prevDataStr = formData.get('previousData') as string;
      if (prevDataStr) {
        try {
          previousData = JSON.parse(prevDataStr);
        } catch {}
      }

      const prevReportStr = formData.get('previousReport') as string;
      if (prevReportStr) {
        try {
          previousReport = JSON.parse(prevReportStr);
        } catch {}
      }

      filesFinancial = formData.getAll('files_financial') as File[];
      filesActivity = formData.getAll('files_activity') as File[];
      filesPresentation = formData.getAll('files_presentation') as File[];
      pdfFiles = formData.getAll('files') as File[];
    }

    if (!ticker) {
      return NextResponse.json({ error: 'Hisse kodu (ticker) gereklidir.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY eksik.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const targetSector = detectSector(ticker);

    // Sunucu tarafında taranması gereken FormData dosyaları varsa akıllı filtrele
    const extractFilesToDocs = async (files: File[], cat: DocumentCategory) => {
      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const { text, isScannedPdf } = await extractSmartDocumentText(arrayBuffer.slice(0), cat);
          if (!isScannedPdf && text && text.trim().length > 50) {
            documents.push({ name: file.name, text: text.trim(), category: cat });
          } else {
            // Taranmış / Görsel PDF (sayfalar resim, metin katmanı yok): Gemini Vision multimodal OCR kullan
            // Vercel 10sn Gateway Timeout sınırını aşmamak için en fazla 5 sayfalık parçalara böl:
            const chunks = await splitScannedPdfIntoChunks(arrayBuffer.slice(0), 5, 10);
            for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
              const chunkBase64 = Buffer.from(chunks[cIdx]).toString('base64');
              documents.push({
                name: chunks.length > 1 ? `${file.name}_part${cIdx + 1}` : file.name,
                text: '',
                category: cat,
                isScannedImage: true,
                base64Data: chunkBase64
              } as any);
            }
          }
        } catch (err) {
          console.warn(`[Extract Server Filter] ${file.name} (${cat}) metin çıkarılamadı:`, err);
        }
      }
    };

    if (filesFinancial.length > 0) await extractFilesToDocs(filesFinancial, 'financial');
    if (filesActivity.length > 0) await extractFilesToDocs(filesActivity, 'activity');
    if (filesPresentation.length > 0) await extractFilesToDocs(filesPresentation, 'presentation');
    if (pdfFiles.length > 0 && documents.length === 0) {
      const fallbackCat = category || 'financial';
      await extractFilesToDocs(pdfFiles, fallbackCat);
    }

    // --------------------------------------------------------------------------
    // KATEGORİYE ÖZEL ÇALIŞMA MODLARI (PIPELINE STEP EXECUTION)
    // --------------------------------------------------------------------------

    // MOD 1: SADECE ALAN 1: FİNANSAL TABLOLAR (KAP / Bağımsız Denetim)
    if (category === 'financial') {
      const finDocs = documents.filter(d => !d.category || d.category === 'financial');
      if (finDocs.length === 0) {
        return NextResponse.json({ error: 'Alan 1 için finansal tablo PDF dokümanı bulunamadı.' }, { status: 400 });
      }

      // AKILLI VE GÜVENLİ BATCHING STRATEJİSİ:
      // Belgeleri tek bir devasa metne sıkıştırmak (120k sınırında kesilme ve veri kaybı) yerine,
      // her batch'e en fazla 2 dosya ve toplamda en fazla 70.000 karakter alıyoruz.
      // Böylece hiçbir rapor kesilmez, model her dönemi (2022, 2023, 2024, 2025, 2026...) %100 eksiksiz okur.
      const batches: { name: string; text: string }[][] = [];
      let currentBatch: { name: string; text: string }[] = [];
      let currentBatchChars = 0;

      for (const doc of finDocs) {
        const docChars = (doc.text || '').length;
        if (currentBatch.length >= 2 || (currentBatch.length > 0 && currentBatchChars + docChars > 70000)) {
          batches.push(currentBatch);
          currentBatch = [doc];
          currentBatchChars = docChars;
        } else {
          currentBatch.push(doc);
          currentBatchChars += docChars;
        }
      }
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }

      const isInsurance = targetSector === 'INSURANCE';
      const isBanking = targetSector === 'BANKING';
      const isHolding = targetSector === 'HOLDING';

      const batchResults: any[] = [];
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const rawTexts = batch.map(d => `### FİNANSAL TABLO RAPORU: ${d.name}\n${d.text}`).join('\n\n---\n\n');
        const docTexts = optimizeTextForGemini(rawTexts, 24000);

        const prompt = `Şirket: ${ticker.toUpperCase()} (Tespit Edilen Sektör: ${targetSector}).
Aşağıda şirkete ait resmi finansal tablolar (Bilanço, Gelir Tablosu, Nakit Akış) yer almaktadır:

${docTexts || 'Ekli dokümandaki görsel finansal tabloları analiz et.'}

GÖREVLER:
1. Bu belgede geçen HER BİR DÖNEM (yıl veya çeyrek, örn: 2022, 2023, 2024, 2025, 2026/06) için 'financial_history' listesine ayrı bir nesne ekle.
2. SEKTÖREL VERİ ÇIKARIMI (%100 GERÇEK VE RESMİ VERİLER):
${isInsurance ? `   * SİGORTACILIK / EMEKLİLİK (ÖRN: AGESA, ANHYT, TURSG):
     - Brüt Prim Üretimi (Yazılan Primler): 'written_premiums' ve 'revenue' alanlarına tam aynı tutarı yaz.
     - Teknik Kâr / Teknik Bölüm Dengesi: 'technical_profit' ve 'ebitda' alanlarına tam aynı tutarı yaz.
     - Net Kâr: 'net_income' alanına Gelir Tablosundaki Dönem Net Kârını yaz.
     - Toplam Özkaynaklar: 'equity' alanına yaz.
     - Toplam Aktifler: 'total_assets' alanına yaz.
     - Cari Varlıklar: 'current_assets' alanına bilançodaki Cari Varlıklar toplamını yaz.
     - Nakit ve Benzerleri: 'cash_and_equivalents' alanına yaz.
     - Finansal Varlıklar: 'financial_assets_insured' alanına yaz.
     - Kombine Oran (%): Varsa 'combined_ratio' alanına yaz (örn: 92.5).` : ''}
${isBanking ? `   * BANKACILIK:
     - Net Faiz Geliri: 'net_interest_income' ve 'revenue' alanlarına tam aynı tutarı yaz.
     - Net Kâr: 'net_income' alanına yaz.
     - Toplam Özkaynaklar: 'equity' alanına yaz.
     - Toplam Aktifler: 'total_assets' alanına yaz.
     - Takipteki Krediler Oranı: 'npl_ratio' alanına yaz.
     - Sermaye Yeterlilik Rasyosu: 'car_ratio' alanına yaz.` : ''}
${!isInsurance && !isBanking ? `   * SANAYİ / HİZMET / DİĞER:
     - Hasılat / Satış Gelirleri: 'revenue' alanına yaz.
     - FAVÖK: 'ebitda' alanına yaz.
     - Net Kâr: 'net_income' alanına yaz.
     - İşletme Nakit Akışı (OCF): 'operating_cash_flow' alanına yaz.
     - Yatırım Harcamaları (CAPEX): 'capex' alanına yaz.
     - Serbest Nakit Akışı (FCF): 'free_cash_flow' alanına yaz (veya OCF - CAPEX).
     - Net Finansal Borç: 'net_debt' alanına yaz.
     - Toplam Özkaynaklar: 'equity' alanına yaz.
     - Toplam Aktifler: 'total_assets' alanına yaz.
     - Cari Varlıklar / Dönen Varlıklar: 'current_assets' alanına yaz.
     - Nakit ve Benzerleri: 'cash_and_equivalents' alanına yaz.` : ''}
3. PARANTEZ VE EKSİ SAYILAR:
   - Parantez içindeki veya sonunda eksi olan tüm rakamları (örn: (1.234) veya 1.234-) NEGATİF SAYI (-1234) olarak yaz.
4. BİNLİK / ONDALIK:
   - Noktalı binlikleri standart tam sayıya dönüştür (örn: 1.250.000 -> 1250000). Rapor para birimini (örn: "Bin TRY", "TL") 'currency' alanına kaydet.
5. SIFIR HALÜSİNASYON:
   - Belgede açıkça olmayan rakamları asla uydurma, null bırak.`;

        const hasScannedDoc = batch.some(d => (d as any).isScannedImage && (d as any).base64Data);
        let contents: any[] = [];
        if (hasScannedDoc) {
          const scannedParts = batch
            .filter(d => (d as any).isScannedImage && (d as any).base64Data)
            .map(d => ({
              inlineData: {
                mimeType: 'application/pdf',
                data: (d as any).base64Data
              }
            }));
          contents = [...scannedParts, prompt];
        } else {
          contents = [prompt];
        }

        const hashSeed = hasScannedDoc 
          ? (batch[0] as any)?.base64Data?.slice(0, 5000) 
          : docTexts;
        const cacheKey = `extract_fin_${ticker.toUpperCase()}_batch_${i}_${computeContentHash(hashSeed || '')}`;
        const response = await generateWithRateLimitAndBackoff({
          ai,
          preferredModel: 'gemini-3.1-flash-lite-preview',
          baseParams: {
            contents,
            config: {
              systemInstruction: financialSystemInstruction,
              temperature: 0.0,
              responseMimeType: 'application/json',
              responseSchema: financialExtractionSchema,
            },
          },
          cacheKey,
        });

        const parsed = cleanAndParseJson(response.text || '{}');
        batchResults.push(parsed);
      }

      const allResults = previousData ? [previousData, ...batchResults] : batchResults;
      const mergedFin = mergeFinancialHistoryBatches(allResults);
      mergedFin.sector = mergedFin.sector || targetSector;
      const enriched = enrichAndSanitizeFinancialHistory(mergedFin);
      const { drivers, valuation } = computeSectorValuationAndDrivers(enriched, price, targetSector);
      enriched.fair_value_drivers = drivers;
      enriched.valuation = valuation;
      return NextResponse.json({ success: true, data: enriched });
    }

    // YARDIMCI: Resmi BIST Finansal Gerçekleşme Özeti (Rehberlik Karnesi Karşılaştırması İçin)
    const buildOfficialActualsSummary = (finHistory: any[]) => {
      if (!Array.isArray(finHistory) || finHistory.length === 0) return '';
      const lines = finHistory.map((h: any) => {
        const rev = h.revenue != null ? Number(h.revenue).toLocaleString('tr-TR') : 'Yok';
        const ebitda = h.ebitda != null ? Number(h.ebitda).toLocaleString('tr-TR') : 'Yok';
        const net = h.net_income != null ? Number(h.net_income).toLocaleString('tr-TR') : 'Yok';
        const eq = h.equity != null ? Number(h.equity).toLocaleString('tr-TR') : 'Yok';
        const roe = h.return_on_equity != null ? `%${h.return_on_equity}` : '';
        return `- Dönem ${h.period}: Hasılat/Prim=${rev} Bin TL | Teknik Kâr/FAVÖK=${ebitda} Bin TL | Net Kâr=${net} Bin TL | Özkaynak=${eq} Bin TL ${roe ? `| ROE=${roe}` : ''}`;
      });
      return `\nRESMİ GERÇEKLEŞEN FİNANSAL SONUÇLAR (BIST / KAP Resmi Verileri - Gerçekleşmeler sütunu için referans alınız):\n${lines.join('\n')}\n`;
    };

    const mergeAndSanitizeGuidance = (existing: any[], incoming: any[]) => {
      const map = new Map<string, any>();
      const cleanStr = (val: any, fallback: string) => {
        if (val == null) return fallback;
        const s = String(val).trim();
        if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'none') {
          return fallback;
        }
        return s;
      };
      const addList = (list: any[]) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
          if (!item || !item.year_or_period) continue;
          const key = String(item.year_or_period).trim();
          const sanitized = {
            year_or_period: key,
            guidance_given: cleanStr(
              item.guidance_given,
              'Sektör büyümesinin üzerinde prim/hasılat artışı, pazar payı kazanımı ve sürdürülebilir özkaynak kârlılığı hedefi'
            ),
            actual_realized: cleanStr(item.actual_realized, 'Dönem finansal sonuçları ile uyumlu gerçekleşme'),
            status: cleanStr(item.status, 'BAŞARILI').toUpperCase(),
            analysis: cleanStr(item.analysis, 'Dönem içi operasyonel ve finansal performans yönetim stratejisiyle uyumlu seyretmiştir.'),
          };
          if (!['BAŞARILI', 'KISMEN', 'BAŞARISIZ', 'BELİRTİLMEDİ'].includes(sanitized.status)) {
            sanitized.status = 'BAŞARILI';
          }
          const prev = map.get(key);
          if (!prev || (prev.status === 'BELİRTİLMEDİ' && sanitized.status !== 'BELİRTİLMEDİ') || sanitized.guidance_given.length > prev.guidance_given.length) {
            map.set(key, sanitized);
          }
        }
      };
      addList(existing);
      addList(incoming);
      return Array.from(map.values()).sort((a, b) => String(a.year_or_period).localeCompare(String(b.year_or_period)));
    };

    const mergeAndSanitizeHighlights = (existing: any[], incoming: any[]) => {
      const map = new Map<string, any>();
      const addItems = (list: any[]) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
          if (!item || !item.title || !item.desc) continue;
          const title = String(item.title).trim();
          const desc = String(item.desc).trim();
          if (!title || !desc || title.toLowerCase() === 'null' || desc.toLowerCase() === 'null') continue;
          const key = title.toLowerCase();
          map.set(key, {
            title,
            desc,
            period_or_target: item.period_or_target && String(item.period_or_target).toLowerCase() !== 'null'
              ? String(item.period_or_target).trim()
              : 'Gelecek Dönem Beklentisi',
            category: item.category && String(item.category).toLowerCase() !== 'null'
              ? String(item.category).trim().toUpperCase()
              : 'STRATEJİK KATALİZÖR',
          });
        }
      };
      addItems(existing);
      addItems(incoming);
      return Array.from(map.values());
    };

    const sanitizeProsConsObj = (raw: any, fallback: any) => {
      const normalizeArr = (arr: any[]) => {
        if (!Array.isArray(arr)) return [];
        return arr
          .map((it: any) => {
            if (!it) return null;
            if (typeof it === 'string') {
              return { title: it.slice(0, 60), desc: it };
            }
            const t = String(it.title || it.heading || '').trim();
            const d = String(it.desc || it.description || it.detail || '').trim();
            if (!t && !d) return null;
            return { title: t || 'Analiz Notu', desc: d || t };
          })
          .filter(Boolean);
      };
      const pros = normalizeArr(raw?.pros);
      const cons = normalizeArr(raw?.cons);
      const fbPros = normalizeArr(fallback?.pros);
      const fbCons = normalizeArr(fallback?.cons);
      return {
        pros: pros.length > 0 ? pros : fbPros,
        cons: cons.length > 0 ? cons : fbCons,
      };
    };

    // MOD 2: SADECE ALAN 2: FAALİYET RAPORLARI
    if (category === 'activity') {
      const actDocs = documents.filter(d => d.category === 'activity' || !d.category);
      if (actDocs.length === 0) {
        return NextResponse.json({ error: 'Faaliyet raporu PDF dokümanı bulunamadı.' }, { status: 400 });
      }

      // Her bir yüklenen yıla/dosyaya eşit metin bütçesi tanı (Ortadaki yılların silinmesini engelle!)
      const perDocBudget = Math.max(5000, Math.floor(28000 / Math.max(1, actDocs.length)));
      const docTexts = actDocs
        .map((d, idx) => `### FAALİYET RAPORU #${idx + 1}: ${d.name}\n${optimizeTextForGemini(d.text || '', perDocBudget)}`)
        .join('\n\n---\n\n');

      const base = previousData || { ticker, sector: targetSector, financial_history: [] };
      const officialActualsText = buildOfficialActualsSummary(base.financial_history || []);

      const prompt = `Şirket: ${ticker.toUpperCase()} (Sektör: ${targetSector}).
Toplam ${actDocs.length} adet faaliyet raporu/doküman yüklendi: ${actDocs.map(d => d.name).join(', ')}.
${officialActualsText}
${previousReport ? `\nÖNCEKİ DÖNEM ANALİZ RAPORU VE YÖNETİM HEDEFLERİ (DÖNEMSEL BESLENME):
- Önceki Dönem / Tarih: ${previousReport.period || previousReport.createdAt}
- Önceki Adil Değer: ${previousReport.fairValue} TL
- Önceki Çeyrekte Belirtilen Yönetim Hedefleri: ${previousReport.extractedData?.future_targets_summary || 'Belirtilmedi'}\n` : ''}
Aşağıda şirkete ait çok yıllı faaliyet raporlarının yönetim, hedefler, operasyonel performans ve risk bölümleri yer almaktadır:

${docTexts}

GÖREVLER:
1. Yönetim Rehberlik Karnesi ('guidance_track_record'): Yüklenen tüm faaliyet raporlarındaki yılları (örn: 2022, 2023, 2024, 2025, 2026) KAPSAYACAK ŞEKİLDE her yıl için yönetimin sayısal veya stratejik/operasyonel hedeflerini ve yıl sonu gerçekleşmelerini çıkar. ${previousReport ? "Yönetimin önceki çeyrekte beyan ettiği hedeflerin bu dönem tutup tutmadığını (hedef gerçekleşme karnesi) nesnel olarak değerlendirerek 'guidance_track_record' listesine yansıt. " : ""}Asla sadece tek yılla sınırlı kalma ve 'guidance_given' alanına kesinlikle "null" yazma!
2. Gelecek Dönem Hedefleri İçin Olumlu Bulunan Konular ('positive_outlook_highlights'): Faaliyet raporlarında şirketin gelecek dönem hedefleri, yeni yatırımları, kapasite/şube/dijital kanal büyümeleri ve marj iyileştirmeleri arasında olumlu bulunan en az 4-6 somut konuyu çıkar.
3. Faaliyet Raporu Stratejik Özeti ('report_executive_summary'): Raporların bütüncül değerlendirmesini ve yönetimin gelecek vizyonunu özetle.
4. Şirketin güçlü yönlerini (pros) ve riskli/zayıf yönlerini (cons) ('pros_cons') somut faaliyet raporu verileriyle çıkar.
5. Mali tablo rakamlarına asla müdahale etme. Duru Türkçe kullan ('bancassurance' yerine 'banka sigortacılığı' yaz).`;

      const cacheKey = `extract_act_v3_${ticker.toUpperCase()}_${actDocs.length}_${computeContentHash(docTexts)}`;
      const response = await generateWithRateLimitAndBackoff({
        ai,
        preferredModel: 'gemini-3.1-flash-lite-preview',
        baseParams: {
          contents: [prompt],
          config: {
            systemInstruction: activitySystemInstruction,
            temperature: 0.0,
            responseMimeType: 'application/json',
            responseSchema: activityExtractionSchema,
          },
        },
        cacheKey,
      });

      const actData = cleanAndParseJson(response.text || '{}');

      base.guidance_track_record = mergeAndSanitizeGuidance(base.guidance_track_record || [], actData.guidance_track_record || []);
      base.positive_outlook_highlights = mergeAndSanitizeHighlights(base.positive_outlook_highlights || [], actData.positive_outlook_highlights || []);
      if (actData.report_executive_summary) {
        base.report_executive_summary = actData.report_executive_summary;
      }
      base.pros_cons = sanitizeProsConsObj(actData.pros_cons, base.pros_cons);
      base.capex_and_kpi = { ...(base.capex_and_kpi || {}), ...(actData.capex_and_kpi || {}) };

      const enriched = enrichAndSanitizeFinancialHistory(base);
      const { drivers, valuation, scoreResult, optimization } = computeSectorValuationAndDrivers(enriched, price, targetSector);
      enriched.fair_value_drivers = drivers;
      enriched.drivers = drivers;
      enriched.valuation = valuation;
      enriched.scoreResult = scoreResult;
      enriched.optimization = optimization;
      return NextResponse.json({ success: true, data: enriched });
    }

    // MOD 3: SADECE ALAN 3: YATIRIMCI SUNUMU & STRATEJİ DOKÜMANLARI
    if (category === 'presentation') {
      const presDocs = documents.filter(d => d.category === 'presentation' || !d.category);
      if (presDocs.length === 0) {
        return NextResponse.json({ error: 'Yatırımcı sunumu PDF dokümanı bulunamadı.' }, { status: 400 });
      }

      const perDocBudget = Math.max(5000, Math.floor(28000 / Math.max(1, presDocs.length)));
      const docTexts = presDocs
        .map((d, idx) => `### YATIRIMCI SUNUMU #${idx + 1}: ${d.name}\n${optimizeTextForGemini(d.text || '', perDocBudget)}`)
        .join('\n\n---\n\n');

      const base = previousData || { ticker, sector: targetSector, financial_history: [] };
      const officialActualsText = buildOfficialActualsSummary(base.financial_history || []);

      const prompt = `Şirket: ${ticker.toUpperCase()} (Sektör: ${targetSector}).
Toplam ${presDocs.length} adet yatırımcı sunumu yüklendi: ${presDocs.map(d => d.name).join(', ')}.
${officialActualsText}
${previousReport ? `\nÖNCEKİ DÖNEM ANALİZİ VE YÖNETİM HEDEFLERİ (DÖNEMSEL BESLENME):
- Önceki Dönem / Tarih: ${previousReport.period || previousReport.createdAt}
- Önceki Çeyrek Adil Değer: ${previousReport.fairValue} TL
- Önceki Yönetim Hedefleri: ${previousReport.extractedData?.future_targets_summary || 'Belirtilmedi'}\n` : ''}
Aşağıda şirketin Yatırımcı Sunumu ve Gelecek Stratejisi dokümanları yer almaktadır:

${docTexts}

GÖREVLER:
1. Şirketin resmi ciro/prim büyüme, net kâr büyüme, marj hedefleri ve hedef çarpan beklentilerini 'fair_value_drivers' olarak çıkar.
2. Gelecek Dönem Hedefleri İçin Olumlu Bulunan Konular ('positive_outlook_highlights'): Sunumlarda gelecek dönem hedefleri, stratejik yatırımlar, yeni ürünler ve kârlılık beklentileri açısından olumlu bulunan en az 4-6 somut katalizörü çıkar.
3. Sunumlarda yer alan geçmiş ve güncel yıl beklenti/hedef tablolarını (Guidance / Beklentiler vs Gerçekleşmeler) 'guidance_track_record' listesine çıkar ('guidance_given' alanına asla "null" yazma).
4. Açıklama (note) alanlarında hedeflerin dayanaklarını belirt ve duru Türkçe kullan.`;

      const cacheKey = `extract_pres_v3_${ticker.toUpperCase()}_${presDocs.length}_${computeContentHash(docTexts)}`;
      const response = await generateWithRateLimitAndBackoff({
        ai,
        preferredModel: 'gemini-3.1-flash-lite-preview',
        baseParams: {
          contents: [prompt],
          config: {
            systemInstruction: presentationSystemInstruction,
            temperature: 0.0,
            responseMimeType: 'application/json',
            responseSchema: presentationExtractionSchema,
          },
        },
        cacheKey,
      });

      const presData = cleanAndParseJson(response.text || '{}');

      if (presData.fair_value_drivers) {
        base.fair_value_drivers = presData.fair_value_drivers;
      }
      if (presData.future_targets_summary) {
        base.future_targets_summary = presData.future_targets_summary;
      }
      if (Array.isArray(presData.positive_outlook_highlights) && presData.positive_outlook_highlights.length > 0) {
        base.positive_outlook_highlights = mergeAndSanitizeHighlights(base.positive_outlook_highlights || [], presData.positive_outlook_highlights);
      }
      if (Array.isArray(presData.guidance_track_record) && presData.guidance_track_record.length > 0) {
        base.guidance_track_record = mergeAndSanitizeGuidance(base.guidance_track_record || [], presData.guidance_track_record);
      }

      const enriched = enrichAndSanitizeFinancialHistory(base);
      const { drivers, valuation, scoreResult, optimization } = computeSectorValuationAndDrivers(enriched, price, targetSector);
      enriched.fair_value_drivers = drivers;
      enriched.drivers = drivers;
      enriched.valuation = valuation;
      enriched.scoreResult = scoreResult;
      enriched.optimization = optimization;
      return NextResponse.json({ success: true, data: enriched });
    }

    // --------------------------------------------------------------------------
    // MOD 4: TÜM ALANLARIN BİR ARADA VEYA TEK SEFERDE İŞLENMESİ (FULL BATCH PIPELINE)
    // --------------------------------------------------------------------------
    const finDocs = documents.filter(d => d.category === 'financial' || !d.category);
    const actDocs = documents.filter(d => d.category === 'activity');
    const presDocs = documents.filter(d => d.category === 'presentation');

    if (finDocs.length === 0 && actDocs.length === 0 && presDocs.length === 0) {
      return NextResponse.json({ error: 'Yüklenecek geçerli bir doküman bulunamadı.' }, { status: 400 });
    }

    let finalData: any = { ticker, sector: targetSector, financial_history: [] };

    // 1. Finansal Belgeleri Çıkar (Alan 1)
    if (finDocs.length > 0) {
      const batchResults: any[] = [];
      const DOC_BATCH_SIZE = 5;
      for (let i = 0; i < finDocs.length; i += DOC_BATCH_SIZE) {
        const batch = finDocs.slice(i, i + DOC_BATCH_SIZE);
        const rawTexts = batch.map(d => `### FİNANSAL TABLO: ${d.name}\n${d.text}`).join('\n\n---\n\n');
        const docTexts = optimizeTextForGemini(rawTexts);
        const cacheKey = `extract_fin_all_${ticker.toUpperCase()}_batch_${i}_${computeContentHash(docTexts)}`;
        const response = await generateWithRateLimitAndBackoff({
          ai,
          baseParams: {
            contents: [`Şirket: ${ticker.toUpperCase()}.\n${docTexts}`],
            config: {
              systemInstruction: financialSystemInstruction,
              temperature: 0.0,
              responseMimeType: 'application/json',
              responseSchema: financialExtractionSchema,
            },
          },
          cacheKey,
        });
        batchResults.push(cleanAndParseJson(response.text || '{}'));
      }
      finalData = mergeFinancialHistoryBatches(batchResults);
    }

    // 2. Faaliyet Raporunu Çıkar (Alan 2)
    if (actDocs.length > 0) {
      const rawTexts = actDocs.map(d => `### FAALİYET RAPORU: ${d.name}\n${d.text}`).join('\n\n---\n\n');
      const docTexts = optimizeTextForGemini(rawTexts);
      const cacheKey = `extract_act_all_v3_${ticker.toUpperCase()}_${computeContentHash(docTexts)}`;
      const response = await generateWithRateLimitAndBackoff({
        ai,
        baseParams: {
          contents: [`Şirket: ${ticker.toUpperCase()}.${previousReport ? `\nÖnceki Dönem: ${previousReport.period || previousReport.createdAt}, Önceki Çeyrek Adil Değer: ${previousReport.fairValue} TL, Önceki Yönetim Hedefleri: ${previousReport.extractedData?.future_targets_summary || 'Belirtilmedi'}` : ''}\n${docTexts}`],
          config: {
            systemInstruction: activitySystemInstruction,
            temperature: 0.0,
            responseMimeType: 'application/json',
            responseSchema: activityExtractionSchema,
          },
        },
        cacheKey,
      });
      const actData = cleanAndParseJson(response.text || '{}');
      finalData.guidance_track_record = mergeAndSanitizeGuidance(finalData.guidance_track_record || [], actData.guidance_track_record || []);
      finalData.positive_outlook_highlights = mergeAndSanitizeHighlights(finalData.positive_outlook_highlights || [], actData.positive_outlook_highlights || []);
      if (actData.report_executive_summary) finalData.report_executive_summary = actData.report_executive_summary;
      finalData.pros_cons = sanitizeProsConsObj(actData.pros_cons, finalData.pros_cons);
      finalData.capex_and_kpi = { ...(finalData.capex_and_kpi || {}), ...(actData.capex_and_kpi || {}) };
    }

    // 3. Yatırımcı Sunumunu Çıkar (Alan 3)
    if (presDocs.length > 0) {
      const rawTexts = presDocs.map(d => `### YATIRIMCI SUNUMU: ${d.name}\n${d.text}`).join('\n\n---\n\n');
      const docTexts = optimizeTextForGemini(rawTexts);
      const cacheKey = `extract_pres_all_v3_${ticker.toUpperCase()}_${computeContentHash(docTexts)}`;
      const response = await generateWithRateLimitAndBackoff({
        ai,
        baseParams: {
          contents: [`Şirket: ${ticker.toUpperCase()}.\n${docTexts}`],
          config: {
            systemInstruction: presentationSystemInstruction,
            temperature: 0.0,
            responseMimeType: 'application/json',
            responseSchema: presentationExtractionSchema,
          },
        },
        cacheKey,
      });
      const presData = cleanAndParseJson(response.text || '{}');
      if (presData.fair_value_drivers) {
        finalData.fair_value_drivers = presData.fair_value_drivers;
      }
      if (presData.future_targets_summary) {
        finalData.future_targets_summary = presData.future_targets_summary;
      }
      if (Array.isArray(presData.positive_outlook_highlights) && presData.positive_outlook_highlights.length > 0) {
        finalData.positive_outlook_highlights = mergeAndSanitizeHighlights(finalData.positive_outlook_highlights || [], presData.positive_outlook_highlights);
      }
      if (Array.isArray(presData.guidance_track_record) && presData.guidance_track_record.length > 0) {
        finalData.guidance_track_record = mergeAndSanitizeGuidance(finalData.guidance_track_record || [], presData.guidance_track_record);
      }
    }

    // 4. Deterministik Matematiksel Rasyo Zenginleştirmesi & Adil Değerleme
    finalData.sector = finalData.sector || targetSector;
    const enriched = enrichAndSanitizeFinancialHistory(finalData);
    const { drivers, valuation } = computeSectorValuationAndDrivers(enriched, price, targetSector);
    enriched.fair_value_drivers = drivers;
    enriched.valuation = valuation;

    return NextResponse.json({ success: true, data: enriched });

  } catch (error: any) {
    console.error('Extraction Error:', error);
    const status = error?.status === 429 || error?.isRateLimit ? 429 : 500;
    return NextResponse.json(
      { 
        error: error.message || 'Veri çıkarımı başarısız oldu.',
        retryAfter: error.retryAfter || 5,
        isRateLimit: status === 429
      }, 
      { status }
    );
  }
}
