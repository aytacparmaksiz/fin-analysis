/**
 * Finansal Tablo ve Rapor Akıllı Sayfa Filtreleme Motoru
 * 
 * Amaç: 50-100+ sayfalık hacimli faaliyet ve denetim raporlarından Bilanço, Gelir Tablosu,
 * Nakit Akış, Özkaynak Değişim ve kritik dipnot sayfalarını ayıklayarak
 * işlem süresini 5-10 saniye seviyesine çekmek ve Gateway Timeout (504) hatalarını önlemek.
 */

import { getDocumentProxy, extractText } from 'unpdf';
import { PDFDocument } from 'pdf-lib';

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

export type DocumentCategory = 'financial' | 'activity' | 'presentation';

export const ACTIVITY_REPORT_KEYWORDS = [
  'yönetim kurulu başkanı mesajı',
  'başkanın mesajı',
  'genel müdür mesajı',
  'yönetim kurulu faaliyet raporu',
  'faaliyet sonuçları',
  'geleceğe yönelik beklentiler',
  'geleceğe ilişkin beklentiler',
  'beklentiler ve hedefler',
  'yönetim hedefleri',
  'stratejik hedefler',
  'guidance',
  'rehberlik',
  'pazar payı',
  'risk yönetimi',
  'risklerin değerlendirilmesi',
  'iç kontrol ve risk',
  'fırsatlar ve tehditler',
  'güçlü yönler',
  'zayıf yönler',
  'swot analizi',
  'operasyonel gelişmeler',
  'yatırımlar ve ar-ge',
  'kapasite kullanım',
  'sürdürülebilirlik hedefleri',
  'sektörel gelişmeler'
];

export const PRESENTATION_KEYWORDS = [
  'yatırımcı sunumu',
  'investor presentation',
  'gelecek hedefleri',
  'finansal hedefler',
  'orta vadeli hedefler',
  'orta vadeli plan',
  'marj hedefleri',
  'büyüme hedefleri',
  'guidance',
  'beklentiler',
  'outlook',
  'capex planı',
  'yatırım bütçesi',
  'değer yaratımı',
  'hissedar getirisi',
  'temettü politikası',
  'vizyon ve misyon',
  'karlılık hedefleri',
  'stratejik öncelikler'
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
const NORMALIZED_ACTIVITY = Array.from(new Set(ACTIVITY_REPORT_KEYWORDS.map(k => normalizeTextForSearch(k))));
const NORMALIZED_PRESENTATION = Array.from(new Set(PRESENTATION_KEYWORDS.map(k => normalizeTextForSearch(k))));

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

  // Metinleri birleştir (boş olmayan sayfaları önceliklendir)
  const indicesWithContent = finalIndices.filter(idx => (pageTexts[idx] || '').trim().length > 0);
  const activeIndices = indicesWithContent.length > 0 ? indicesWithContent : finalIndices;

  const combinedText = activeIndices
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

export function scoreActivityPage(pageText: string, pageIndex: number): PageScoreResult {
  const norm = normalizeTextForSearch(pageText);
  let score = 0;
  let isPrimary = false;
  let isGuidance = false;
  const matchedKeywords: string[] = [];

  if (!norm || norm.length < 30) {
    return { pageIndex, pageNum: pageIndex + 1, score: 0, isPrimary: false, isGuidance: false, numberCount: 0, matchedKeywords: [] };
  }

  for (let i = 0; i < NORMALIZED_ACTIVITY.length; i++) {
    const kw = NORMALIZED_ACTIVITY[i];
    if (norm.includes(kw)) {
      score += 10;
      matchedKeywords.push(ACTIVITY_REPORT_KEYWORDS[i] || kw);
      if (kw.includes('guidance') || kw.includes('beklenti') || kw.includes('hedef') || kw.includes('mesaj') || kw.includes('risk')) {
        isGuidance = true;
        isPrimary = true;
      }
    }
  }

  if (pageIndex < 4) {
    score += 8;
  }

  const numberMatches = pageText.match(/(?:\(\s*-?\d[\d.,\s]*\d\s*\)|-?\b\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d+)?\b|-?\b\d+[.,]\d{1,4}%?|-?\b\d{3,}%?)/g);
  const numberCount = numberMatches ? numberMatches.length : 0;
  if (numberCount >= 10) score += 5;

  return {
    pageIndex,
    pageNum: pageIndex + 1,
    score,
    isPrimary,
    isGuidance,
    numberCount,
    matchedKeywords
  };
}

export function scorePresentationPage(pageText: string, pageIndex: number): PageScoreResult {
  const norm = normalizeTextForSearch(pageText);
  let score = 0;
  let isPrimary = false;
  let isGuidance = false;
  const matchedKeywords: string[] = [];

  if (!norm || norm.length < 30) {
    return { pageIndex, pageNum: pageIndex + 1, score: 0, isPrimary: false, isGuidance: false, numberCount: 0, matchedKeywords: [] };
  }

  for (let i = 0; i < NORMALIZED_PRESENTATION.length; i++) {
    const kw = NORMALIZED_PRESENTATION[i];
    if (norm.includes(kw)) {
      score += 10;
      matchedKeywords.push(PRESENTATION_KEYWORDS[i] || kw);
      isPrimary = true;
      isGuidance = true;
    }
  }

  const percentMatches = pageText.match(/%?\s*\d+(?:[.,]\d+)?\s*%/g);
  if (percentMatches && percentMatches.length >= 2) {
    score += 6;
  }

  return {
    pageIndex,
    pageNum: pageIndex + 1,
    score,
    isPrimary,
    isGuidance,
    numberCount: percentMatches ? percentMatches.length : 0,
    matchedKeywords
  };
}

export function filterActivityPages(pageTexts: string[], maxPages = 16): FilterResult {
  const totalPages = pageTexts.length;
  if (totalPages === 0) {
    return { selectedIndices: [], combinedText: '', totalPages: 0, matchedCount: 0, summary: 'Boş belge.' };
  }
  if (totalPages <= 14) {
    const combined = pageTexts.map((t, idx) => `--- [SAYFA ${idx + 1} / ${totalPages}] ---\n${t.trim()}`).join('\n\n');
    return { selectedIndices: Array.from({ length: totalPages }, (_, i) => i), combinedText: combined, totalPages, matchedCount: totalPages, summary: `Tüm ${totalPages} sayfa korundu.` };
  }

  const scored = pageTexts.map((t, idx) => scoreActivityPage(t, idx));
  const selectedSet = new Set<number>();

  for (let i = 0; i < Math.min(3, totalPages); i++) selectedSet.add(i);

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  for (const s of sorted) {
    if (s.score >= 8 || s.isGuidance) {
      selectedSet.add(s.pageIndex);
      if (selectedSet.size >= maxPages) break;
    }
  }

  if (selectedSet.size < 4) {
    for (let i = 0; i < Math.min(8, totalPages); i++) selectedSet.add(sorted[i].pageIndex);
  }

  const finalIndices = Array.from(selectedSet).slice(0, maxPages).sort((a, b) => a - b);
  const combinedText = finalIndices.map(idx => `--- [SAYFA ${idx + 1} / ${totalPages}] ---\n${(pageTexts[idx] || '').trim()}`).join('\n\n');
  return {
    selectedIndices: finalIndices,
    combinedText,
    totalPages,
    matchedCount: finalIndices.length,
    summary: `${totalPages} sayfalık faaliyet raporundan yönetim ve risk sayfaları (${finalIndices.length} sayfa) filtrelendi.`
  };
}

export function filterPresentationPages(pageTexts: string[], maxPages = 16): FilterResult {
  const totalPages = pageTexts.length;
  if (totalPages === 0) {
    return { selectedIndices: [], combinedText: '', totalPages: 0, matchedCount: 0, summary: 'Boş belge.' };
  }
  if (totalPages <= 20) {
    const combined = pageTexts.map((t, idx) => `--- [SAYFA ${idx + 1} / ${totalPages}] ---\n${t.trim()}`).join('\n\n');
    return { selectedIndices: Array.from({ length: totalPages }, (_, i) => i), combinedText: combined, totalPages, matchedCount: totalPages, summary: `Tüm ${totalPages} slayt korundu.` };
  }

  const scored = pageTexts.map((t, idx) => scorePresentationPage(t, idx));
  const selectedSet = new Set<number>();
  for (let i = 0; i < Math.min(4, totalPages); i++) selectedSet.add(i);

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  for (const s of sorted) {
    if (s.score >= 6) {
      selectedSet.add(s.pageIndex);
      if (selectedSet.size >= maxPages) break;
    }
  }

  const finalIndices = Array.from(selectedSet).slice(0, maxPages).sort((a, b) => a - b);
  const combinedText = finalIndices.map(idx => `--- [SAYFA ${idx + 1} / ${totalPages}] ---\n${(pageTexts[idx] || '').trim()}`).join('\n\n');
  return {
    selectedIndices: finalIndices,
    combinedText,
    totalPages,
    matchedCount: finalIndices.length,
    summary: `${totalPages} slaytlık sunumdan en kritik ${finalIndices.length} sayfa filtrelendi.`
  };
}

export function filterDocumentPages(pageTexts: string[], category: DocumentCategory = 'financial', maxPages = 16): FilterResult {
  if (category === 'activity') {
    return filterActivityPages(pageTexts, maxPages);
  }
  if (category === 'presentation') {
    return filterPresentationPages(pageTexts, maxPages);
  }
  return filterFinancialPages(pageTexts, maxPages);
}

export interface SmartExtractionResult {
  text: string;
  totalPages: number;
  matchedPages: number;
  summary: string;
  totalExtractedChars?: number;
  isScannedPdf?: boolean;
}

/**
 * Ham PDF ArrayBuffer/Uint8Array verisinden kategoriye özel akıllı metin çıkarımı yapar.
 */
export async function extractSmartDocumentText(
  pdfInput: ArrayBuffer | Uint8Array,
  category: DocumentCategory = 'financial',
  maxPages = 14
): Promise<SmartExtractionResult> {
  let uint8: Uint8Array;
  if (pdfInput instanceof Uint8Array) {
    if (typeof Buffer !== 'undefined' && (Buffer.isBuffer(pdfInput) || (pdfInput as any) instanceof Buffer)) {
      uint8 = new Uint8Array(pdfInput.buffer, pdfInput.byteOffset, pdfInput.byteLength);
    } else {
      uint8 = pdfInput;
    }
  } else if (pdfInput instanceof ArrayBuffer) {
    uint8 = new Uint8Array(pdfInput);
  } else {
    uint8 = new Uint8Array(pdfInput);
  }

  let pdf: any;
  try {
    pdf = await getDocumentProxy(uint8);
  } catch (err) {
    console.warn('[extractSmartDocumentText] PDF proxy yüklenemedi:', err);
    return {
      text: '',
      totalPages: 0,
      matchedPages: 0,
      summary: 'PDF yükleme hatası.',
      totalExtractedChars: 0,
      isScannedPdf: false
    };
  }
  const totalPages = (pdf && typeof pdf.numPages === 'number') ? pdf.numPages : 0;

  if (totalPages === 0) {
    return {
      text: '',
      totalPages: 0,
      matchedPages: 0,
      summary: 'Boş belge.',
      totalExtractedChars: 0,
      isScannedPdf: false
    };
  }

  const pageTexts: string[] = new Array(totalPages).fill('');

  // HEDEF SAYFA SEÇİMİ (KAP Finansal Raporları & Gateway Timeout Koruması):
  // 1. Finansal Tablolar (financial): Bilanço, Gelir Tablosu, Nakit Akış ve Özkaynak Değişim
  //    istisnasız ilk 14 sayfa içindedir (KAP Denetim Raporu sonrası). 60-100 sayfalık dipnotları
  //    gereksiz yere parse edip sunucu süresini tüketmek yerine sadece ilk 14 sayfa taranır (300ms).
  // 2. Faaliyet Raporları (activity): Yönetim mesajı, rehberlik ve riskler ilk 20 sayfadadır.
  // 3. Yatırımcı Sunumu (presentation): İlk 18 slayt.
  let targetPageNumbers: number[] = [];
  if (category === 'activity') {
    const limit = Math.min(20, totalPages);
    targetPageNumbers = Array.from({ length: limit }, (_, i) => i + 1);
  } else if (category === 'presentation') {
    const limit = Math.min(18, totalPages);
    targetPageNumbers = Array.from({ length: limit }, (_, i) => i + 1);
  } else {
    // Bağımsız denetçi raporu ilk 10-15 sayfayı kaplayabileceği için ilk 28 sayfa taranır,
    // ardından akıllı filtreleme motoru en kritik 12 sayfayı seçer:
    const limit = Math.min(28, totalPages);
    targetPageNumbers = Array.from({ length: limit }, (_, i) => i + 1);
  }

  let totalExtractedChars = 0;
  await Promise.all(
    targetPageNumbers.map(async (pageNum) => {
      try {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const pageText = (content.items || [])
          .filter((item: any) => item.str != null)
          .map((item: any) => item.str + (item.hasEOL ? '\n' : ''))
          .join('');
        pageTexts[pageNum - 1] = pageText;
        totalExtractedChars += pageText.trim().length;
      } catch (pageErr) {
        console.warn(`[PDFFilter] Sayfa ${pageNum} metni okunamadı:`, pageErr);
      }
    })
  );

  const filterRes = filterDocumentPages(pageTexts, category, maxPages);

  return {
    text: filterRes.combinedText,
    totalPages: filterRes.totalPages,
    matchedPages: filterRes.matchedCount,
    summary: filterRes.summary,
    totalExtractedChars,
    isScannedPdf: totalExtractedChars < 100
  };
}

/**
 * Ham PDF ArrayBuffer/Uint8Array verisinden akıllı finansal metin çıkarımı yapar (Geriye dönük uyumlu).
 */
export async function extractSmartFinancialText(
  pdfInput: ArrayBuffer | Uint8Array,
  maxPages = 14,
  category: DocumentCategory = 'financial'
): Promise<SmartExtractionResult> {
  return extractSmartDocumentText(pdfInput, category, maxPages);
}

/**
 * Taranmış (görsel/resim) PDF'leri Vercel Gateway Timeout (10 sn) sınırına takılmamak için
 * en fazla `maxPagesPerChunk` (varsayılan 5) sayfalık hafif PDF parçalarına böler.
 */
export async function splitScannedPdfIntoChunks(
  pdfInput: ArrayBuffer | Uint8Array,
  maxPagesPerChunk = 5,
  maxTotalPages = 10
): Promise<Uint8Array[]> {
  try {
    let uint8: Uint8Array;
    if (pdfInput instanceof Uint8Array) {
      uint8 = pdfInput;
    } else {
      uint8 = new Uint8Array(pdfInput);
    }
    const srcDoc = await PDFDocument.load(uint8);
    const total = Math.min(srcDoc.getPageCount(), maxTotalPages);
    if (total <= maxPagesPerChunk) {
      return [uint8];
    }

    const chunks: Uint8Array[] = [];
    for (let start = 0; start < total; start += maxPagesPerChunk) {
      const end = Math.min(start + maxPagesPerChunk, total);
      const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
      const chunkDoc = await PDFDocument.create();
      const copied = await chunkDoc.copyPages(srcDoc, pageIndices);
      copied.forEach(p => chunkDoc.addPage(p));
      const bytes = await chunkDoc.save();
      chunks.push(bytes);
    }
    return chunks;
  } catch (err) {
    console.warn('[splitScannedPdfIntoChunks] Bölme hatası:', err);
    return [pdfInput instanceof Uint8Array ? pdfInput : new Uint8Array(pdfInput)];
  }
}

