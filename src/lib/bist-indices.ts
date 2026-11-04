/**
 * Borsa İstanbul Resmi Endeks Bileşenleri ve Filtreleme Motoru
 * 
 * Borsa İstanbul (BIST) ve İş Yatırım resmi verileri baz alınarak:
 * - BIST 30 (XU030)
 * - BIST 50 (XU050)
 * - BIST 100 (XU100)
 * - BIST 100 Dışı (BIST Yan Hisseler / Non-BIST 100)
 * 
 * sınıflandırmalarını ve filtreleme yardımcılarını sunar.
 */

export const OFFICIAL_BIST_30_TICKERS = [
  "AEFES", "AKBNK", "ASELS", "ASTOR", "BIMAS",
  "EKGYO", "ENKAI", "EREGL", "FROTO", "GARAN",
  "GUBRF", "ISCTR", "KCHOL", "KRDMD", "MGROS",
  "PETKM", "PGSUS", "SAHOL", "SASA",  "SISE",
  "TAVHL", "TCELL", "THYAO", "TOASO", "TRALT",
  "TRMET", "TTKOM", "TUPRS", "VAKBN", "YKBNK"
] as const;

export const OFFICIAL_BIST_50_TICKERS = [
  "AEFES", "AKBNK", "ALARK", "ASELS", "ASTOR",
  "BIMAS", "BRSAN", "BTCIM", "CANTE", "CCOLA",
  "CIMSA", "CVKMD", "CWENE", "DOAS",  "ECILC",
  "EKGYO", "ENERY", "ENKAI", "EREGL", "FROTO",
  "GARAN", "GLRMK", "GUBRF", "HALKB", "HEKTS",
  "ISCTR", "KCHOL", "KONTR", "KRDMD", "MAVI",
  "MGROS", "OYAKC", "PETKM", "PGSUS", "SAHOL",
  "SASA",  "SISE",  "TAVHL", "TCELL", "THYAO",
  "TOASO", "TRALT", "TRMET", "TSKB",  "TTKOM",
  "TUPRS", "TURSG", "ULKER", "VAKBN", "YKBNK"
] as const;

export const OFFICIAL_BIST_100_TICKERS = [
  "AEFES", "AGHOL", "AHGAZ", "AKBNK", "AKCNS",
  "AKFYE", "AKSA",  "AKSEN", "ALARK", "ALBRK",
  "ALTNY", "ANHYT", "ANSGR", "ARCLK", "ASELS",
  "ASTOR", "AYGAZ", "BIMAS", "BINHO", "BRSAN",
  "BRYAT", "BTCIM", "CANTE", "CCOLA", "CIMSA",
  "CVKMD", "CWENE", "DOAS",  "DOHOL", "ECILC",
  "ECZYT", "EGEEN", "EGGUB", "EKGYO", "ENERY",
  "ENJSA", "ENKAI", "ENTRA", "EREGL", "EUREN",
  "FENER", "FROTO", "GARAN", "GLRMK", "GLYHO",
  "GRSEL", "GUBRF", "GWIND", "HALKB", "HEKTS",
  "ISCTR", "ISDMR", "ISMEN", "KARSN", "KATMR",
  "KCAER", "KCHOL", "KONTR", "KORDS", "KRDMD",
  "LMKDC", "MAVI",  "MGROS", "MPARK", "OBAMS",
  "ODAS",  "OTKAR", "OYAKC", "PAHOL", "PETKM",
  "PGSUS", "PSGYO", "RGYAS", "RYSAS", "SAHOL",
  "SASA",  "SISE",  "SNGYO", "SOKM",  "TABGD",
  "TAVHL", "TCELL", "TCKRC", "THYAO", "TKFEN",
  "TOASO", "TRALT", "TRENJ", "TRGYO", "TRMET",
  "TSKB",  "TTKOM", "TTRAK", "TUKAS", "TUPRS",
  "TURSG", "ULKER", "VAKBN", "VESTL", "YKBNK",
  "ZOREN"
] as const;

// Hızlı O(1) sorgu kümeleri (Sets)
export const BIST_30_SET = new Set<string>(OFFICIAL_BIST_30_TICKERS);
export const BIST_50_SET = new Set<string>([...OFFICIAL_BIST_50_TICKERS, ...OFFICIAL_BIST_30_TICKERS]);
export const BIST_100_SET = new Set<string>([
  ...OFFICIAL_BIST_100_TICKERS,
  ...OFFICIAL_BIST_50_TICKERS,
  ...OFFICIAL_BIST_30_TICKERS
]);

export type LeaderboardIndexFilter = 'ALL' | 'BIST30' | 'BIST50' | 'BIST100' | 'BIST_NON100';

export interface BistIndexOption {
  key: LeaderboardIndexFilter;
  label: string;
  shortLabel: string;
  description: string;
}

export const BIST_INDEX_OPTIONS: readonly BistIndexOption[] = [
  {
    key: 'ALL',
    label: 'Tüm Şirketler',
    shortLabel: 'Tümü',
    description: 'Borsa İstanbul’da kayıtlı tüm şirketler'
  },
  {
    key: 'BIST30',
    label: 'BIST 30',
    shortLabel: 'BIST 30',
    description: 'En yüksek piyasa değeri ve likiditeye sahip 30 dev şirket'
  },
  {
    key: 'BIST50',
    label: 'BIST 50',
    shortLabel: 'BIST 50',
    description: 'BIST 50 endeksinde yer alan öncü şirketler'
  },
  {
    key: 'BIST100',
    label: 'BIST 100',
    shortLabel: 'BIST 100',
    description: 'BIST 100 ana gösterge endeksi bileşenleri'
  },
  {
    key: 'BIST_NON100',
    label: 'BIST 100 Dışı (Yan Hisseler)',
    shortLabel: 'BIST 100 Dışı',
    description: 'BIST 100 dışında kalan potansiyel büyüme ve orta/küçük ölçekli şirketler'
  }
] as const;

/**
 * Verilen hisse kodunu temizler ve büyük harfe çevirir.
 */
function cleanTicker(ticker?: string | null): string {
  if (!ticker) return '';
  return ticker.trim().toUpperCase().replace(/\.IS$/i, '');
}

/**
 * Şirketin BIST 30 endeksinde olup olmadığını döner.
 */
export function isBist30(ticker?: string | null): boolean {
  return BIST_30_SET.has(cleanTicker(ticker));
}

/**
 * Şirketin BIST 50 endeksinde olup olmadığını döner (BIST 30'u da kapsar).
 */
export function isBist50(ticker?: string | null): boolean {
  return BIST_50_SET.has(cleanTicker(ticker));
}

/**
 * Şirketin BIST 100 endeksinde olup olmadığını döner (BIST 30 ve BIST 50'yi de kapsar).
 */
export function isBist100(ticker?: string | null): boolean {
  return BIST_100_SET.has(cleanTicker(ticker));
}

/**
 * Şirketin BIST 100 dışında olup olmadığını döner (BIST Yan Hisseler / Non-BIST 100).
 */
export function isBistNon100(ticker?: string | null): boolean {
  const sym = cleanTicker(ticker);
  if (!sym) return false;
  return !isBist100(sym);
}

/**
 * Şirketin en prestijli BIST endeks kategorisini döner:
 * 'BIST 30' | 'BIST 50' | 'BIST 100' | 'BIST 100 Dışı'
 */
export function getBistIndexCategory(ticker?: string | null): 'BIST 30' | 'BIST 50' | 'BIST 100' | 'BIST 100 Dışı' {
  const sym = cleanTicker(ticker);
  if (!sym) return 'BIST 100 Dışı';
  if (isBist30(sym)) return 'BIST 30';
  if (isBist50(sym)) return 'BIST 50';
  if (isBist100(sym)) return 'BIST 100';
  return 'BIST 100 Dışı';
}

export interface BistIndexBadgeInfo {
  label: 'BIST 30' | 'BIST 50' | 'BIST 100' | 'BIST 100 Dışı';
  badgeClass: string;
}

/**
 * Endeks etiketine göre Tailwind UI rozet stilini döner.
 */
export function getBistIndexBadge(ticker?: string | null): BistIndexBadgeInfo {
  const category = getBistIndexCategory(ticker);
  switch (category) {
    case 'BIST 30':
      return {
        label: 'BIST 30',
        badgeClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/80 hover:bg-indigo-900/90'
      };
    case 'BIST 50':
      return {
        label: 'BIST 50',
        badgeClass: 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80 hover:bg-cyan-900/90'
      };
    case 'BIST 100':
      return {
        label: 'BIST 100',
        badgeClass: 'bg-sky-950/80 text-sky-300 border-sky-800/80 hover:bg-sky-900/90'
      };
    case 'BIST 100 Dışı':
    default:
      return {
        label: 'BIST 100 Dışı',
        badgeClass: 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-750'
      };
  }
}

/**
 * Aktif endeks filtresine göre hissenin eşleşip eşleşmediğini kontrol eder.
 */
export function matchesIndexFilter(ticker: string | null | undefined, filter: LeaderboardIndexFilter): boolean {
  if (!filter || filter === 'ALL') return true;
  const sym = cleanTicker(ticker);
  if (!sym) return false;

  switch (filter) {
    case 'BIST30':
      return isBist30(sym);
    case 'BIST50':
      return isBist50(sym);
    case 'BIST100':
      return isBist100(sym);
    case 'BIST_NON100':
      return isBistNon100(sym);
    default:
      return true;
  }
}
