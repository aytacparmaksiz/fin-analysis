/**
 * Finansal Tablo ve Rapor Akıllı Sayfa Filtreleme Motoru
 * 
 * Amaç: 50-100+ sayfalık hacimli faaliyet ve denetim raporlarından Bilanço, Gelir Tablosu,
 * Nakit Akış, Özkaynak Değişim ve kritik dipnot sayfalarını ayıklayarak
 * işlem süresini 5-10 saniye seviyesine çekmek ve Gateway Timeout (504) hatalarını önlemek.
 */

import { getDocumentProxy, extractText } from 'unpdf';

// 1. Birincil Finansal Tablo Başlıkları (En Yüksek Öncelik: +12 Puan)
const PRIMARY_STATEMENT_KEYWORDS = [
  'finansal durum tablosu',
  'bilanço',
  'bilancosu',
  'statement of financial position',
  'balance sheet',
  'kapsamlı gelir tablosu',
  'kar veya zarar tablosu',
  'kâr veya zarar tablosu',
  'gelir tablosu',
  'statement of profit or loss',
  'statement of comprehensive income',
  'income statement',
  'nakit akış tablosu',
  'nakit akım tablosu',
  'nakit akışları',
  'statement of cash flows',
  'cash flow statement',
  'özkaynak değişim tablosu',
  'özkaynaklar değişim tablosu',
  'statement of changes in equity',
  'teknik bölüm dengesi',
  'teknik kâr',
  'teknik kar',
  'teknik karşılıklar',
  'hayat dışı teknik',
  'emeklilik teknik',
  'hayat ve emeklilik'
];

// 2. İkincil Finansal Kalem ve Bilanço/Gelir Göstergeleri (+4 - +6 Puan)
const SECONDARY_FINANCIAL_KEYWORDS = [
  'dönen varlıklar',
  'duran varlıklar',
  'toplam varlıklar',
  'toplam aktifler',
  'kısa vadeli yükümlülükler',
  'uzun vadeli yükümlülükler',
  'kısa vadeli borçlar',
  'uzun vadeli borçlar',
  'toplam özkaynaklar',
  'toplam yükümlülükler',
  'özkaynaklar',
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
const NORMALIZED_PRIMARY = PRIMARY_STATEMENT_KEYWORDS.map(k => normalizeTextForSearch(k));
const NORMALIZED_SECONDARY = SECONDARY_FINANCIAL_KEYWORDS.map(k => normalizeTextForSearch(k));

export interface PageScoreResult {
  pageIndex: number;
  pageNum: number;
  score: number;
  isPrimary: boolean;
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
  const matchedKeywords: string[] = [];

  if (!norm || norm.length < 30) {
    return { pageIndex, pageNum: pageIndex + 1, score: 0, isPrimary: false, numberCount: 0, matchedKeywords: [] };
  }

  // 1. Birincil Tablo Başlıkları Kontrolü (+12 puan)
  for (let i = 0; i < NORMALIZED_PRIMARY.length; i++) {
    const kw = NORMALIZED_PRIMARY[i];
    if (norm.includes(kw)) {
      score += 12;
      isPrimary = true;
      matchedKeywords.push(PRIMARY_STATEMENT_KEYWORDS[i]);
    }
  }

  // 2. İkincil Finansal Göstergeler Kontrolü (+4 puan her biri, en fazla 24 puan)
  let secondaryHits = 0;
  for (let i = 0; i < NORMALIZED_SECONDARY.length; i++) {
    const kw = NORMALIZED_SECONDARY[i];
    if (norm.includes(kw)) {
      score += 4;
      secondaryHits++;
      matchedKeywords.push(SECONDARY_FINANCIAL_KEYWORDS[i]);
      if (secondaryHits >= 6) break; // puan tavanı
    }
  }

  // 3. Finansal Sayı & Tablo Yoğunluğu Puanlaması
  // Tablolarda çok sayıda binlik ayracı veya parantezli negatif sayı bulunur
  const numberMatches = pageText.match(/(?:\(\s*-?\d[\d.,]*\s*\)|-?\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|-?\b\d+,\d{1,2}%)/g);
  const numberCount = numberMatches ? numberMatches.length : 0;

  if (numberCount >= 20) {
    score += 8; // Bariz finansal tablo
  } else if (numberCount >= 10) {
    score += 5;
  } else if (numberCount >= 5) {
    score += 2;
  }

  // 4. Rapor Başlangıcı (İlk 3 sayfa - Yönetici Özeti ve Temel Göstergeler)
  if (pageIndex < 3) {
    if (norm.includes('ozet') || norm.includes('gosterge') || norm.includes('highlights') || norm.includes('finansal')) {
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
export function filterFinancialPages(pageTexts: string[], maxPages = 22): FilterResult {
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

  // Eğer doküman zaten kısa ise (<= 12 sayfa), filtrelemeye gerek yoktur; tüm sayfalar korunur
  if (totalPages <= 12) {
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

  const selectedSet = new Set<number>();

  // 1. Birincil tablo başlığı içeren sayfaları ve bir sonraki sayfayı (devam tablosu: örn. Yükümlülükler) ekle
  for (const item of scoredPages) {
    if (item.isPrimary || item.score >= 12) {
      selectedSet.add(item.pageIndex);
      // Bilanço ve Gelir tablosu genellikle 2 ardışık sayfadır
      if (item.pageIndex + 1 < totalPages) {
        selectedSet.add(item.pageIndex + 1);
      }
    }
  }

  // 2. Eşik puanı aşan ikincil finansal tabloları ekle (score >= 6)
  for (const item of scoredPages) {
    if (item.score >= 6) {
      selectedSet.add(item.pageIndex);
    }
  }

  // 3. Fallback: Eğer çok az sayfa eşleştiyse (< 4), en yüksek puanlı veya ilk 8 sayfayı al
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

  // 4. Sayfa tavanı kısıtı (maxPages): Eğer çok fazla sayfa eşleştiyse en yüksek puanlıları seç
  let finalIndices = Array.from(selectedSet);
  if (finalIndices.length > maxPages) {
    finalIndices = finalIndices
      .sort((a, b) => (scoredPages[b]?.score || 0) - (scoredPages[a]?.score || 0))
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
 */
export async function extractSmartFinancialText(
  pdfInput: ArrayBuffer | Uint8Array,
  maxPages = 22
): Promise<{ text: string; totalPages: number; matchedPages: number; summary: string }> {
  const uint8 = pdfInput instanceof Uint8Array ? pdfInput : new Uint8Array(pdfInput);
  const pdf = await getDocumentProxy(uint8);

  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pageTexts = Array.isArray(text) ? text : [String(text || '')];

  const filterRes = filterFinancialPages(pageTexts, maxPages);

  return {
    text: filterRes.combinedText,
    totalPages: filterRes.totalPages,
    matchedPages: filterRes.matchedCount,
    summary: filterRes.summary
  };
}
