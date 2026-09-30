import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Gemini Free Tier Kısıtları:
 * - 5 RPM (Dakikada en fazla 5 istek -> İstekler arası en az 12-13 saniye aralık)
 * - 250k TPM (Dakikada en fazla 250.000 token -> Kayan pencere ile 240k TPM tavanı)
 * - 20 RPD (Günde en fazla 20 istek -> RAM + Disk önbellekleme)
 */

export const CANDIDATE_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
];

// TPM (Tokens Per Minute) koruma kısıtları (dakikada maks 240k token)
const MAX_TPM = 240000;
const TPM_WINDOW_MS = 60000;

interface TokenUsageEntry {
  timestamp: number;
  tokens: number;
}

const tokenUsageHistory: TokenUsageEntry[] = [];

// Global istek kuyruğu durumu
let lastRequestTimestamp = 0;

// In-memory önbellek
const memoryCache = new Map<string, { timestamp: number; data: any }>();

// Disk tabanlı kalıcı önbellek (Sunucu yeniden başlasa da RPD kotasını korur)
const CACHE_FILE_PATH = path.join(os.tmpdir(), 'fin_analiz_gemini_cache.json');

function loadDiskCache(): Record<string, { timestamp: number; data: any }> {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[GeminiCache] Disk önbelleği okunamadı:', err);
  }
  return {};
}

function saveDiskCache(cacheObj: Record<string, { timestamp: number; data: any }>) {
  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheObj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[GeminiCache] Disk önbelleği yazılamadı:', err);
  }
}

/**
 * Önbellekten veri çek (24 saat geçerli)
 */
export function getCachedGeminiResult(cacheKey: string): any | null {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 saat

  // 1. Önce RAM kontrolü
  if (memoryCache.has(cacheKey)) {
    const entry = memoryCache.get(cacheKey)!;
    if (now - entry.timestamp < maxAge) {
      console.log(`[GeminiCache] RAM önbellekten yüklendi: ${cacheKey}`);
      return entry.data;
    }
    memoryCache.delete(cacheKey);
  }

  // 2. Disk kontrolü
  const disk = loadDiskCache();
  if (disk[cacheKey]) {
    const entry = disk[cacheKey];
    if (now - entry.timestamp < maxAge) {
      console.log(`[GeminiCache] Disk önbellekten yüklendi: ${cacheKey}`);
      memoryCache.set(cacheKey, entry);
      return entry.data;
    }
  }

  return null;
}

/**
 * Veriyi önbelleğe yaz (RAM + Disk)
 */
export function setCachedGeminiResult(cacheKey: string, data: any) {
  const entry = { timestamp: Date.now(), data };
  memoryCache.set(cacheKey, entry);

  try {
    const disk = loadDiskCache();
    disk[cacheKey] = entry;
    // Maksimum 100 girdi sakla
    const keys = Object.keys(disk);
    if (keys.length > 100) {
      keys.sort((a, b) => disk[a].timestamp - disk[b].timestamp);
      for (let i = 0; i < keys.length - 100; i++) {
        delete disk[keys[i]];
      }
    }
    saveDiskCache(disk);
  } catch (err) {
    console.warn('[GeminiCache] Disk önbelleği güncellenemedi:', err);
  }
}

/**
 * Metin içeriğinden SHA-256 hash üretir
 */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 16);
}

/**
 * 250k TPM sınırını korumak için metni gereksiz boşluklardan ve tekrarlardan arındırır
 */
export function optimizeTextForGemini(text: string, maxChars = 120000): string {
  if (!text) return '';

  let cleaned = text
    // Çoklu boşluk ve yatay boşlukları tekle
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    // Tekrarlanan sayfa altı / üstü ve dipnot kalıplarını sadeleştir
    .replace(/(?:Sayfa|Page)\s+\d+\s*(?:\/\s*\d+)?/gi, '')
    .trim();

  if (cleaned.length > maxChars) {
    console.log(`[GeminiLimiter] Metin boyutu ${cleaned.length} karakterden ${maxChars} karaktere optimize edildi.`);
    cleaned = cleaned.slice(0, maxChars) + '\n...[İçerik 250k TPM sınırına uyum için optimize edildi]...';
  }

  return cleaned;
}

/**
 * İstek parametrelerindeki tahmini token sayısını hesaplar
 */
export function estimateTokenCount(params: any): number {
  try {
    let charCount = 0;
    if (typeof params?.contents === 'string') {
      charCount += params.contents.length;
    } else if (Array.isArray(params?.contents)) {
      for (const item of params.contents) {
        if (typeof item === 'string') charCount += item.length;
        else if (item?.text) charCount += item.text.length;
        else if (typeof item === 'object') charCount += JSON.stringify(item).length;
      }
    }
    if (params?.config?.systemInstruction) {
      charCount += String(params.config.systemInstruction).length;
    }
    // Türkçe ve finansal metinlerde 1 token ortalama 3.5 - 4 karakterdir
    return Math.ceil(charCount / 3.5) + 500;
  } catch {
    return 2000;
  }
}

function cleanOldTokenEntries(now: number) {
  while (tokenUsageHistory.length > 0 && now - tokenUsageHistory[0].timestamp > TPM_WINDOW_MS) {
    tokenUsageHistory.shift();
  }
}

function getCurrentMinuteTokens(now: number): number {
  cleanOldTokenEntries(now);
  return tokenUsageHistory.reduce((sum, entry) => sum + entry.tokens, 0);
}

function recordTokens(tokens: number) {
  const now = Date.now();
  cleanOldTokenEntries(now);
  tokenUsageHistory.push({ timestamp: now, tokens });
}

/**
 * Token kullanımını kaydeder (Vercel timeout olmaması için sunucuda bekleme yapılmaz)
 */
export async function scheduleRequestSlot(estimatedTokens = 2000): Promise<number> {
  lastRequestTimestamp = Date.now();
  recordTokens(estimatedTokens);
  return 0;
}

export interface GeminiCallParams {
  ai: GoogleGenAI;
  baseParams: any;
  preferredModel?: string;
  cacheKey?: string;
  onWaitProgress?: (seconds: number, message: string) => void;
}

/**
 * Hız Sınırlayıcı & Hızlı Yeniden Deneme (Free tier koruması)
 * Vercel serverless zaman aşımını (timeout) önlemek için:
 * - Fonksiyon içi 13 saniyelik bekleme tamamen kaldırılmıştır.
 * - Fonksiyon içinde en fazla 1 kez hızlı yeniden deneme (1.5 sn) yapılır.
 * - Rate limit devam ederse hemen 429 status ve retryAfter: 5 döner; bekleme istemciye devredilir.
 */
export async function generateWithRateLimitAndBackoff(params: GeminiCallParams): Promise<any> {
  const { ai, baseParams, preferredModel, cacheKey } = params;

  // 1. Önbellek kontrolü (20 RPD kotasını harcamamak için ilk adım)
  if (cacheKey) {
    const cached = getCachedGeminiResult(cacheKey);
    if (cached) {
      return {
        text: typeof cached === 'string' ? cached : JSON.stringify(cached),
        fromCache: true,
      };
    }
  }

  // 2. Token tahmini ve kaydı (Sunucuda bekletme yapılmaz)
  const estimatedTokens = estimateTokenCount(baseParams);
  await scheduleRequestSlot(estimatedTokens);

  const modelsToTry = preferredModel 
    ? [preferredModel, ...CANDIDATE_MODELS.filter(m => m !== preferredModel)]
    : CANDIDATE_MODELS;

  let lastError: any = null;
  let hasRetried = false;

  for (const model of modelsToTry) {
    try {
      console.log(`[GeminiClient] Model ${model} ile istek gönderiliyor...`);
      lastRequestTimestamp = Date.now();
      const response = await ai.models.generateContent({
        ...baseParams,
        model,
      });

      // Başarılı yanıtı önbelleğe kaydet
      if (cacheKey && response?.text) {
        try {
          const parsed = JSON.parse(response.text);
          setCachedGeminiResult(cacheKey, parsed);
        } catch {
          setCachedGeminiResult(cacheKey, response.text);
        }
      }

      return response;
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.statusCode || err?.code || err?.error?.code || (err?.message?.includes('429') ? 429 : 0);
      const isRateLimit = status === 429 || 
        err?.isRateLimit || 
        /too many requests|rate[- ]limit|resource_exhausted|quota/i.test(err?.message || '');
      const isServerBusy = status === 503 || err?.code === 503 || /unavailable|server busy/i.test(err?.message || '');

      console.warn(`[GeminiClient] Model ${model} hata verdi:`, {
        status,
        message: err?.message?.slice(0, 150),
        isRateLimit,
        isServerBusy,
      });

      if ((isRateLimit || isServerBusy) && !hasRetried) {
        hasRetried = true;
        // Sunucu içinde en fazla 1 kez 1.5 sn hızlı bekleme
        const waitMs = 1500;
        console.warn(`[GeminiClient] API hız sınırı/meşguliyet. ${waitMs}ms sonra 1 kez hızlı denenecek...`);
        if (params.onWaitProgress) {
          params.onWaitProgress(1.5, 'API hız sınırı nedeniyle 1.5 sn bekleniyor...');
        }
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        lastRequestTimestamp = Date.now();

        try {
          console.log(`[GeminiClient] Model ${model} ile hızlı yeniden deneme...`);
          const retryResponse = await ai.models.generateContent({
            ...baseParams,
            model,
          });

          if (cacheKey && retryResponse?.text) {
            try {
              const parsed = JSON.parse(retryResponse.text);
              setCachedGeminiResult(cacheKey, parsed);
            } catch {
              setCachedGeminiResult(cacheKey, retryResponse.text);
            }
          }

          return retryResponse;
        } catch (retryErr: any) {
          lastError = retryErr;
          console.warn(`[GeminiClient] Model ${model} hızlı yeniden denemede de hata verdi:`, retryErr?.message?.slice(0, 150));
          // Bir sonraki modele geç
        }
      }
      // Model desteklenmiyor, 400 hatası veya retry sonrası hata: döngü bir sonraki modeli dener
    }
  }

  // Tüm modeller denendikten sonra hala rate limit hatası varsa 429 fırlat
  const status = lastError?.status || lastError?.statusCode || lastError?.code || lastError?.error?.code || (lastError?.message?.includes('429') ? 429 : 0);
  const isRateLimit = status === 429 || 
    lastError?.isRateLimit || 
    /too many requests|rate[- ]limit|resource_exhausted|quota/i.test(lastError?.message || '');

  if (isRateLimit) {
    const finalRateError: any = new Error(
      'Gemini API hız sınırına ulaşıldı (Rate Limit 429). Lütfen 5 saniye sonra tekrar deneyin.'
    );
    finalRateError.status = 429;
    finalRateError.statusCode = 429;
    finalRateError.isRateLimit = true;
    finalRateError.retryAfter = 5;
    throw finalRateError;
  }

  throw lastError || new Error('Gemini API çağrısı başarısız oldu.');
}

/**
 * Gemini yanıtlarındaki olası Markdown kod bloklarını (```json ... ```) temizler
 * ve JSON verisini güvenle ayrıştırır.
 */
export function cleanAndParseJson(text: string): any {
  if (!text) return {};
  let cleaned = String(text).trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      } catch {}
    }
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1));
      } catch {}
    }
    throw err;
  }
}
