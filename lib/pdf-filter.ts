/**
 * Finansal Tablo ve Rapor Akıllı Sayfa Filtreleme Motoru
 * 
 * Amaç: 50-100+ sayfalık hacimli faaliyet ve denetim raporlarından Bilanço, Gelir Tablosu,
 * Nakit Akış, Özkaynak Değişim ve kritik dipnot sayfalarını ayıklayarak
 * işlem süresini 5-10 saniye seviyesine çekmek ve Gateway Timeout (504) hatalarını önlemek.
 */

import { getDocumentProxy, extractText } from 'unpdf';

// 1. Birincil Finansal Tablo Başlıkları ve Kök Kelimeler (En Yüksek Öncelik: +12/+15 Puan)
export const PRIMARY_STATEMENT_KEYWORDS = [
  // Bilanço / Finansal Durum
  'finansal durum tablosu',
  'finansal durum tablolari',
  'finansal durum bilgileri',
  'finansal durum',
  'finansal pozisyon',
  'bilanço',
  'bilancosu',
  'bilanco',
  'statement of financial position',
  'balance sheet',
  
  // Gelir Tablosu / Kar veya Zarar
  'kapsamlı gelir tablosu',
  'kapsamlı gelir',
  'kar veya zarar tablosu',
  'kâr veya zarar tablosu',
  'kar veya zarar',
  'kâr veya zarar',
  'kar ve zarar',
  'kâr ve zarar',
  'kar zarar',
  'gelir tablosu',
  'gelir tablolari',
  'statement of profit or loss',
  'statement of comprehensive income',
  'income statement',
  'profit or loss',

  // Nakit Akış
  'nakit akış tablosu',
  'nakit akış tabloları',
  'nakit akım tablosu',
  'nakit akım tabloları',
  'nakit akışları',
  'nakit akış',
  'nakit akis',
  'nakit akım',
  'nakit akim',
  'statement of cash flows',
  'cash flow statement',
  'cash flows',

  // Özkaynak Değişim
  'özkaynak değişim tablosu',
  'özkaynak değişim tabloları',
  'özkaynaklar değişim tablosu',
  'özkaynak değişim',
  'ozkaynak degisim',
  'özkaynaklar değişim',
  'ozkaynaklar degisim',
  'statement of changes in equity',
  'changes in equity',

  // Teknik Bölüm (Sigorta / Emeklilik)
  'teknik bölüm dengesi',
  'teknik bölüm',
  'teknik bolum',
  'teknik kâr',
  'teknik kar',
  'teknik karşılıklar',
  'teknik karsiliklar',
  'hayat dışı teknik',
  'emeklilik teknik',
  'hayat ve emeklilik',

  // Varlıklar & Yükümlülükler (Bilanço Kısımları)
  'varlıklar',
  'varliklar',
  'yükümlülükler',
  'yukumlulukler',
  'dönen varlıklar',
  'donen varliklar',
  'duran varlıklar',
  'duran varliklar',
  'toplam varlıklar',
  'toplam aktifler',
  'kısa vadeli yükümlülükler',
  'kisa vadeli yukumlulukler',
  'uzun vadeli yükümlülükler',
  'uzun vadeli yukumlulukler',
  'toplam yükümlülükler',
  'kaynaklar',
  'özkaynaklar',
  'total assets',
  'total liabilities',
  'total equity'
];

// 2. İkincil Finansal Kalem ve Bilanço/Gelir Göstergeleri (+4 Puan)
export const SECONDARY_FINANCIAL_KEYWORDS = [
  'satış gelirleri',
  'hasılat',
  'satışların maliyeti',
  'brüt kâr',
  'brüt kar',
  'esas faaliyet kârı',
  'esas faaliyet karı',
  'faaliyet kârı',
  'faaliyet karı',
  'favök',
  'ebitda',
  'finansman giderleri',
  'finansman gelirleri',
  'vergi öncesi kâr',
  'vergi öncesi kar',
  'dönem net kârı',
  'dönem net karı',
  'işletme faaliyetlerinden nakit',
  'yatırım faaliyetlerinden nakit',
  'finansman faaliyetlerinden nakit',
  'maddi duran varlık',
  'maddi olmayan duran varlık',
  'yatırım harcamaları',
  'capex',
  'brüt yazılan prim',
  'net kazanılan prim',
  'hasar prim',
  'hasar/prim',
  'kombine oran',
  'net faiz geliri',
  'faaliyet gelirleri',
  'krediler ve alacaklar',
  'mevduat',
  'takipteki krediler',
  'sermaye yeterliliği',
  'net aktif değer',
  'nad tablosu',
  'iştirakler',
  'tms 29',
  'enflasyon muhasebesi',
  'parasal kazanç',
  'rehberlik',
  'beklentiler',
  'guidance',
  'yönetim hedefleri',
  'finansal göstergeler',
  'temel rasyolar'
];

// 3. Yönetim Rehberliği & Geleceğe Yönelik Beklentiler (+10 Puan)
export const GUIDANCE_AND_OUTLOOK_KEYWORDS = [
  'geleceğe yönelik beklentiler',
  'geleceğe ilişkin beklentiler',
  'beklentiler ve hedefler',
  'yönetim kurulu başkanı mesajı',
  'genel müdür mesajı',
  'faaliyet sonuçları ve beklentiler',
  'yönetim hedefleri',
  'stratejik hedefler',
  'yılı beklentileri',
  'geleceğe dönük değerlendirmeler',
  'forward looking statements',
  'guidance and outlook',
  'management guidance',
  'management expectations'
];

/**
 * Türkçe karakter duyarlı ve aksanları temizleyen normalizasyon (Aramada %100 eşleşme için saf ASCII'ye indirger)
 */
export function normalizeTextForSearch(str: string): string {
  if (!str) return '';
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // aksanları kaldır (bilanço -> bilanco, kâr -> kar, ç -> c, ş -> s, ğ -> g, ö -> o, ü -> u)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalleştirilmiş anahtar kelime listeleri
const NORMALIZED_PRIMARY = Array.from(new Set(PRIMARY_STATEMENT_KEYWORDS.map(k => normalizeTextForSearch(k))));
const NORMALIZED_SECONDARY = Array.from(new Set(SECONDARY_FINANCIAL_KEYWORDS.map(k => normalizeTextForSearch(k))));
const NORMALIZED_GUIDANCE = Array.from(new Set(GUIDANCE_AND_OUTLOOK_KEYWORDS.map(k => normalizeTextForSearch(k))));

export interface PageScoreResult {
  pageIndex: number;
  pageNum: number;
  score: number;
  isPrimary: boolean;
  isGuidance?: boolean;
  numberCount: number;
  matchedKeywords: string[];
}

/**
 * Tek bir sayfa metninin finansal önem derecesini puanlar
 */
export function scoreFinancialPage(pageText: string, pageIndex: number): PageScoreResult {
  const norm = normalizeTextForSearch(pageText);
  let score = 0;
  let isPrimary = false;
  let isGuidance = false;
  const matchedKeywords: string[] = [];

  if (!norm || norm.length < 30) {
    return { pageIndex, pageNum: pageIndex + 1, score: 0, isPrimary: false, isGuidance: false, numberCount: 0, matchedKeywords: [] };
  }

  // 1. Birincil Tablo Başlıkları Kontrolü (+12 puan, eğer sayfanın ilk 600 karakterindeyse +15 puan)
  const normHeader = norm.slice(0, 600);
  for (let i = 0; i < NORMALIZED_PRIMARY.length; i++) {
    const kw = NORMALIZED_PRIMARY[i];
    if (norm.includes(kw)) {
      const isHeader = normHeader.includes(kw);
      score += isHeader ? 15 : 12;
      isPrimary = true;
      matchedKeywords.push(PRIMARY_STATEMENT_KEYWORDS[i] || kw);
      break;
    }
  }

  // 2. İkincil Finansal Göstergeler Kontrolü (+4 puan her biri, en fazla 24 puan)
  let secondaryHits = 0;
  for (let i = 0; i < NORMALIZED_SECONDARY.length; i++) {
    const kw = NORMALIZED_SECONDARY[i];
    if (norm.includes(kw)) {
      score += 4;
      secondaryHits++;
      matchedKeywords.push(SECONDARY_FINANCIAL_KEYWORDS[i] || kw);
      if (secondaryHits >= 6) break; // puan tavanı
    }
  }

  // 3. Yönetim Rehberliği & Geleceğe Yönelik Beklentiler (+10 Puan)
  for (let i = 0; i < NORMALIZED_GUIDANCE.length; i++) {
    const kw = NORMALIZED_GUIDANCE[i];
    if (norm.includes(kw)) {
      score += 10;
      isGuidance = true;
      matchedKeywords.push(GUIDANCE_AND_OUTLOOK_KEYWORDS[i] || kw);
      break;
    }
  }

  // 4. Finansal Sayı & Tablo Yoğunluğu Puanlaması
  // Tablolarda binlik/ondalık ayraçları, parantezli negatif sayılar veya para miktarları yer alır
  const numberMatches = pageText.match(/(?:\(\s*-?\d[\d.,\s]*\d\s*\)|-?\b\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d+)?\b|-?\b\d+[.,]\d{1,4}%?|-?\b\d{3,}%?)/g);
  const numberCount = numberMatches ? numberMatches.length : 0;

  if (numberCount >= 20) {
    score += 8; // Bariz finansal tablo
  } else if (numberCount >= 10) {
    score += 5;
  } else if (numberCount >= 5) {
    score += 2;
  }

  // 5. Rapor Başlangıcı (İlk 3 sayfa - Yönetici Özeti ve Temel Göstergeler)
  if (pageIndex < 3) {
    if (norm.includes('ozet') || norm.includes('gosterge') || norm.includes('highlights') || norm.includes('finansal') || norm.includes('faaliyet')) {
      score += 6;
      matchedKeywords.push('yönetici_özeti');
    }
  }

  return {
    pageIndex,
    pageNum: pageIndex + 1,
    score,
    isPrimary,
    numberCount,
    matchedKeywords
  };
}

export interface FilterResult {
  selectedIndices: number[];
  combinedText: string;
  totalPages: number;
  matchedCount: number;
  summary: string;
}

/**
 * Sayfa metinleri dizisinden finansal tabloları akıllıca seçer ve filtreler
 */
export function filterFinancialPages(pageTexts: string[], maxPages = 16): FilterResult {
  const totalPages = pageTexts.length;

  if (totalPages === 0) {
    return {
      selectedIndices: [],
      combinedText: '',
      totalPages: 0,
      matchedCount: 0,
      summary: 'Boş belge.'
    };
  }

  // Eğer doküman zaten kısa ise (<= 14 sayfa), filtrelemeye gerek yoktur; tüm sayfalar korunur
  if (totalPages <= 14) {
    const combined = pageTexts
      .map((t, idx) => `--- [SAYFA ${idx + 1} / ${totalPages}] ---\n${t.trim()}`)
      .join('\n\n');
    return {
      selectedIndices: Array.from({ length: totalPages }, (_, i) => i),
      combinedText: combined,
      totalPages,
      matchedCount: totalPages,
      summary: `Kısa doküman: Tüm ${totalPages} sayfa korundu.`
    };
  }

  // Her sayfayı puanla
  const scoredPages: PageScoreResult[] = pageTexts.map((text, idx) => scoreFinancialPage(text, idx));
  const effectiveScores = new Map<number, number>(scoredPages.map(p => [p.pageIndex, p.score]));
  const selectedSet = new Set<number>();

  // 1. Doğrudan birincil tablo başlığı içeren sayfaları ve devam sayfalarını ekle (kaskad yapmadan)
  const naturallyPrimary = scoredPages.filter(p => p.isPrimary || p.score >= 12);
  for (const item of naturallyPrimary) {
    selectedSet.add(item.pageIndex);

    // Devam sayfası (Part 2: örn. Bilanço Varlıklar sonrası Yükümlülükler ve Özkaynaklar)
    if (item.pageIndex + 1 < totalPages) {
      const nextIdx = item.pageIndex + 1;
      selectedSet.add(nextIdx);
      const boostedScore = Math.max(effectiveScores.get(nextIdx) || 0, item.score - 1);
      effectiveScores.set(nextIdx, boostedScore);

      // Nakit akış veya özkaynak gibi 3 sayfaya uzayan yoğun tablolar
      if (scoredPages[nextIdx].numberCount >= 8 && item.pageIndex + 2 < totalPages) {
        const nextNextIdx = item.pageIndex + 2;
        if (scoredPages[nextNextIdx].numberCount >= 8) {
          selectedSet.add(nextNextIdx);
          const boostedScore2 = Math.max(effectiveScores.get(nextNextIdx) || 0, item.score - 2);
          effectiveScores.set(nextNextIdx, boostedScore2);
        }
      }
    }
  }

  // 2. Eşik puanı aşan ikincil finansal tabloları ekle (score >= 6)
  for (const item of scoredPages) {
    if (item.score >= 6) {
      selectedSet.add(item.pageIndex);
    }
  }

  // 3. Yönetim Rehberliği & Geleceğe Yönelik Beklenti Sayfaları (Yönetim Rehberlik Karnesi için en az 1-2 sayfa garanti et)
  const guidancePages = scoredPages.filter(p => p.isGuidance);
  for (const gPage of guidancePages.slice(0, 2)) {
    selectedSet.add(gPage.pageIndex);
  }

  // 4. Fallback: Eğer çok az sayfa eşleştiyse (< 4), en yüksek puanlı veya ilk 8 sayfayı al
  if (selectedSet.size < 4) {
    const sortedByScore = [...scoredPages].sort((a, b) => b.score - a.score);
    for (let i = 0; i < Math.min(8, totalPages); i++) {
      selectedSet.add(sortedByScore[i].pageIndex);
    }
    // İlk 3 sayfayı da garanti ekle
    for (let i = 0; i < Math.min(3, totalPages); i++) {
      selectedSet.add(i);
    }
  }

  // 5. Sayfa tavanı kısıtı (maxPages): Eğer çok fazla sayfa eşleştiyse en yüksek puanlıları seç
  let finalIndices = Array.from(selectedSet);
  if (finalIndices.length > maxPages) {
    finalIndices = finalIndices
      .sort((a, b) => (effectiveScores.get(b) || 0) - (effectiveScores.get(a) || 0))
      .slice(0, maxPages);
  }

  // Kronolojik sayfa sırasına geri diz
  finalIndices.sort((a, b) => a - b);

  // Metinleri birleştir
  const combinedText = finalIndices
    .map(idx => `--- [SAYFA ${idx + 1} / ${totalPages}] ---\n${(pageTexts[idx] || '').trim()}`)
    .join('\n\n');

  const summary = `${totalPages} sayfalık rapordan en kritik ${finalIndices.length} finansal tablo sayfası filtrelendi.`;

  return {
    selectedIndices: finalIndices,
    combinedText,
    totalPages,
    matchedCount: finalIndices.length,
    summary
  };
}

/**
 * Ham PDF ArrayBuffer/Uint8Array verisinden akıllı finansal metin çıkarımı yapar
 * Hacimli belgelerde (> 40 sayfa) sunucu zaman aşımını (timeout) önlemek için
 * finansal tabloların ve dipnotların yer aldığı ilk 25 sayfa ve son 10 sayfa hedeflenerek
 * yalnızca bu sayfaların metni çıkarılır.
 */
export async function extractSmartFinancialText(
  pdfInput: ArrayBuffer | Uint8Array,
  maxPages = 14
): Promise<{ text: string; totalPages: number; matchedPages: number; summary: string }> {
  const uint8 = pdfInput instanceof Uint8Array ? pdfInput : new Uint8Array(pdfInput);
  const pdf = await getDocumentProxy(uint8);
  const totalPages = (pdf && typeof pdf.numPages === 'number') ? pdf.numPages : 0;

  if (totalPages === 0) {
    return {
      text: '',
      totalPages: 0,
      matchedPages: 0,
      summary: 'Boş belge.'
    };
  }

  let pageTexts: string[];

  // 40 sayfadan uzun dokümanlarda sunucu ve istemcinin donmasını önlemek için
  // ilk 25 ve son 10 sayfayı (bilanço, gelir tablosu ve önemli dipnotlar) hedefleriz
  if (totalPages > 40) {
    const targetPageNumbers = new Set<number>();
    const firstPagesCount = Math.min(25, totalPages);
    for (let i = 1; i <= firstPagesCount; i++) {
      targetPageNumbers.add(i);
    }
    const lastPagesCount = Math.min(10, totalPages);
    for (let i = totalPages - lastPagesCount + 1; i <= totalPages; i++) {
      targetPageNumbers.add(i);
    }

    pageTexts = new Array(totalPages).fill('');

    await Promise.all(
      Array.from(targetPageNumbers).map(async (pageNum) => {
        try {
          const page = await pdf.getPage(pageNum);
          const content = await page.getTextContent();
          const pageText = (content.items || [])
            .filter((item: any) => item.str != null)
            .map((item: any) => item.str + (item.hasEOL ? '\n' : ''))
            .join('');
          pageTexts[pageNum - 1] = pageText;
        } catch (pageErr) {
          console.warn(`[PDFFilter] Sayfa ${pageNum} metni okunamadı:`, pageErr);
        }
      })
    );
  } else {
    const { text } = await extractText(pdf, { mergePages: false });
    pageTexts = Array.isArray(text) ? text : [String(text || '')];
  }

  const filterRes = filterFinancialPages(pageTexts, maxPages);

  return {
    text: filterRes.combinedText,
    totalPages: filterRes.totalPages,
    matchedPages: filterRes.matchedCount,
    summary: filterRes.summary
  };
}
