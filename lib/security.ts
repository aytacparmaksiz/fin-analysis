/**
 * Security, Authentication, Rate Limiting & Input Validation Layer
 * ----------------------------------------------------------------------------
 * Finansal analiz terminali için katı güvenlik, kimlik/kaynak doğrulama,
 * hız sınırlama, girdi doğrulama ve prompt enjeksiyon koruma katmanı.
 */

// Borsa İstanbul ticker formatı: 2-10 karakter arası standart büyük harf ve rakam (örn. THYAO, ISCTR, AGESA)
export const BIST_TICKER_REGEX = /^[A-Z0-9]{2,10}$/;

// Rapor ID formatı: Alfanümerik ile başlayan ve biten, alt çizgi veya tire içerebilen güvenli belirteç
// Tekil '_' veya '-' gibi SQL wildcard/özel karakterleri kesinlikle reddedilir.
export const SAFE_ID_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9_-]{0,62}[a-zA-Z0-9])?$|^[a-zA-Z0-9]$/;

export function normalizeTicker(raw: string | null | undefined): string {
  return String(raw || '').toUpperCase().trim().replace(/\.IS$/i, '').trim();
}

export function escapeRegExp(str: string): string {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Kullanıcı veya dış kaynak kaynaklı metinleri LLM promptuna güvenli şekilde gömer.
 */
export function sanitizePromptInput(raw: unknown, maxLength = 2000): string {
  if (raw == null) return '';
  const cleaned = String(raw)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/<\/?USER_SUPPLIED_DATA>/gi, '[TAG]')
    .replace(/\b(?:SYSTEM|DEVELOPER|ASSISTANT)\s*:/gi, '[ROLE]:')
    .replace(/IGNORE\s+(?:ALL\s+)?PREVIOUS\s+INSTRUCTIONS/gi, '[FILTERED]')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLength);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const strA = String(a || '');
  const strB = String(b || '');
  const maxLen = Math.max(strA.length, strB.length);
  let diff = strA.length ^ strB.length;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < strA.length ? strA.charCodeAt(i) : 0;
    const cb = i < strB.length ? strB.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

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
  const cleanTicker = rawTicker ? normalizeTicker(rawTicker) : null;

  if (cleanId !== null && !isValidReportId(cleanId)) {
    return { isValid: false, error: 'Geçersiz veya zararlı karakter içeren rapor ID formatı.', cleanId: null, cleanTicker: null };
  }

  if (cleanTicker !== null && !isValidTicker(cleanTicker)) {
    return { isValid: false, error: 'Geçersiz veya zararlı karakter içeren hisse kodu formatı.', cleanId: null, cleanTicker: null };
  }

  return { isValid: true, cleanId, cleanTicker };
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'local';
}

const rateLimitStore = new Map<string, number[]>();
const MAX_RATE_BUCKETS = 2000;

export function resetRateLimitBuckets(): void {
  rateLimitStore.clear();
}

export function checkRateLimit(
  req: Request,
  bucket: string,
  maxRequests: number,
  windowMs = 60_000
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `${bucket}:${ip}`;

  if (rateLimitStore.size > MAX_RATE_BUCKETS) {
    for (const [k, stamps] of rateLimitStore.entries()) {
      const fresh = stamps.filter((ts) => now - ts < windowMs);
      if (fresh.length === 0) rateLimitStore.delete(k);
      else rateLimitStore.set(k, fresh);
    }
  }

  const history = (rateLimitStore.get(key) || []).filter((ts) => now - ts < windowMs);
  if (history.length >= maxRequests) {
    const oldest = history[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    rateLimitStore.set(key, history);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  history.push(now);
  rateLimitStore.set(key, history);
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - history.length),
    retryAfterSec: 0,
  };
}

function parseHostHeader(value: string | null): string {
  if (!value) return '';
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return '';
  }
}

export function authorizeApiMutation(
  req: Request,
  options?: { requireAdminTokenForBulk?: boolean; isBulkAction?: boolean }
): { authorized: boolean; status: number; reason?: string } {
  const expectedSecret = (process.env.API_SECRET_KEY || process.env.ADMIN_API_TOKEN || '').trim();
  const authHeader = (req.headers.get('authorization') || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const apiKeyHeader = (req.headers.get('x-api-key') || '').trim();
  const presentedToken = bearerToken || apiKeyHeader;

  if (expectedSecret && presentedToken && constantTimeEqual(presentedToken, expectedSecret)) {
    return { authorized: true, status: 200 };
  }

  const secFetchSite = (req.headers.get('sec-fetch-site') || '').trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return { authorized: false, status: 403, reason: 'Cross-site mutation isteği engellendi.' };
  }

  let urlHost = '';
  try {
    urlHost = new URL(req.url).host.toLowerCase();
  } catch {}
  const reqHost = (req.headers.get('x-forwarded-host') || req.headers.get('host') || urlHost).split(',')[0].trim().toLowerCase();
  const appUrlHost = parseHostHeader((process.env.NEXT_PUBLIC_APP_URL || '').trim());

  const originHeader = req.headers.get('origin');
  const refererHeader = req.headers.get('referer');
  const originHost = parseHostHeader(originHeader) || parseHostHeader(refererHeader);

  const isHostAllowed = (candidateHost: string) =>
    Boolean(candidateHost && (candidateHost === reqHost || (appUrlHost && candidateHost === appUrlHost)));

  if ((originHeader || refererHeader) && !isHostAllowed(originHost)) {
    return { authorized: false, status: 403, reason: 'Origin doğrulaması başarısız.' };
  }

  if (options?.isBulkAction && options?.requireAdminTokenForBulk) {
    if (expectedSecret) {
      return { authorized: false, status: 401, reason: 'Toplu silme işlemi için yönetici API anahtarı gerekli.' };
    }
    const isClientMarked = req.headers.get('x-requested-with') === 'fin-analiz-client';
    if (!isHostAllowed(originHost) || !isClientMarked) {
      return { authorized: false, status: 401, reason: 'Toplu silme işlemi yalnızca yetkili istemciden yapılabilir.' };
    }
    return { authorized: true, status: 200 };
  }

  if (expectedSecret && process.env.ALLOW_SAME_ORIGIN_BROWSER_MUTATIONS === 'false') {
    return { authorized: false, status: 401, reason: 'API anahtarı veya Bearer token gerekli.' };
  }

  const isSameOriginBrowser = Boolean((originHeader || refererHeader) && isHostAllowed(originHost));
  if (isSameOriginBrowser) {
    return { authorized: true, status: 200 };
  }

  return { authorized: false, status: 401, reason: 'Yetkisiz işlem: geçerli oturum veya API anahtarı gerekli.' };
}

export async function readBoundedJsonBody<T = any>(
  req: Request,
  maxBytes = 1_048_576
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const declaredLen = Number(req.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    return { ok: false, status: 413, error: 'İstek gövdesi izin verilen maksimum boyutu aşıyor (maks. 1 MB).' };
  }

  let rawText = '';
  try {
    rawText = await req.text();
  } catch {
    return { ok: false, status: 400, error: 'İstek gövdesi okunamadı.' };
  }

  if (new TextEncoder().encode(rawText).length > maxBytes) {
    return { ok: false, status: 413, error: 'İstek gövdesi izin verilen maksimum boyutu aşıyor (maks. 1 MB).' };
  }

  try {
    const data = JSON.parse(rawText) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 400, error: 'Geçersiz JSON gövdesi.' };
  }
}
