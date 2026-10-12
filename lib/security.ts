/**
 * Security & Input Validation Layer
 * ----------------------------------------------------------------------------
 * Finansal analiz terminali için katı güvenlik, girdi doğrulama ve
 * enjeksiyon koruma katmanı.
 */

// Borsa İstanbul ticker formatı: 2-10 karakter arası standart büyük harf ve rakam (örn. THYAO, ISCTR, AGESA)
export const BIST_TICKER_REGEX = /^[A-Z0-9]{2,10}$/;

// Rapor ID formatı: Alfanümerik ile başlayan ve biten, alt çizgi veya tire içerebilen güvenli belirteç
// Tekil '_' veya '-' gibi SQL wildcard/özel karakterleri kesinlikle reddedilir.
export const SAFE_ID_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9_-]{0,62}[a-zA-Z0-9])?$|^[a-zA-Z0-9]$/;

/**
 * Verilen hisse kodunun güvenli ve geçerli bir BIST formatında olduğunu doğrular.
 * SQL wildcard (% / _), betik (<script>), komut enjeksiyonu ve geçersiz karakterleri reddeder.
 */
export function isValidTicker(ticker: unknown): ticker is string {
  if (typeof ticker !== 'string') return false;
  const clean = ticker.trim().toUpperCase();
  return BIST_TICKER_REGEX.test(clean);
}

/**
 * Verilen rapor kimliğinin (ID) güvenli bir belirteç olduğunu doğrular.
 * Wildcard (% / _), SQL enjeksiyonu veya boşluk içeren tanımlayıcıları engeller.
 */
export function isValidReportId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const clean = id.trim();
  // SQL wildcard ve tekil altçizgi engeli
  if (clean === '_' || clean === '%' || clean === '*') return false;
  return SAFE_ID_REGEX.test(clean);
}

/**
 * Gelen silme isteği parametrelerini doğrular ve fail-safe parametreler döner.
 * Hatalı, wildcard veya eksik girdi durumunda geçersiz işaretler.
 */
export function validateDeleteReportParams(rawId: string | null, rawTicker: string | null): {
  isValid: boolean;
  error?: string;
  cleanId: string | null;
  cleanTicker: string | null;
} {
  if (!rawId && !rawTicker) {
    return { isValid: false, error: 'Rapor ID veya Ticker belirtilmedi.', cleanId: null, cleanTicker: null };
  }

  const cleanId = rawId ? rawId.trim() : null;
  const cleanTicker = rawTicker ? rawTicker.trim().toUpperCase() : null;

  if (cleanId !== null && !isValidReportId(cleanId)) {
    return { isValid: false, error: 'Geçersiz veya zararlı karakter içeren rapor ID formatı.', cleanId: null, cleanTicker: null };
  }

  if (cleanTicker !== null && !isValidTicker(cleanTicker)) {
    return { isValid: false, error: 'Geçersiz veya zararlı karakter içeren hisse kodu formatı.', cleanId: null, cleanTicker: null };
  }

  return { isValid: true, cleanId, cleanTicker };
}
