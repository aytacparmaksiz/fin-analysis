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
  'gemini-3.1-flash-lite-preview', // 500 RPD, 15 RPM (En yüksek günlük kota & hızlı)
  'gemini-3.6-flash',              // 860ms süper hızlı
  'gemini-3-flash-preview',        // 1.0sn hızlı ve stabil
  'gemini-3.7-flash',              // Kotası neredeyse boş (1/20)
  'gemini-flash-latest',           // Resmi en güncel flash alias
  'gemini-3.5-flash',              // Yedek flash (8/20)
  'gemini-3.8-flash',              // Kota aşımı geçtikten sonra fallback
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
  let hadRateLimit = false;
  let rateLimitError: any = null;
  let hasRetried = false;

  for (const model of modelsToTry) {
    try {
      console.log(`[GeminiClient] Model ${model} ile istek gönderiliyor...`);
      lastRequestTimestamp = Date.now();

      // Gemini 3.8 ve 3.x modellerinde varsayılan reasoning (thinking_level: MEDIUM) 15-25 sn sürer.
      // Vercel 10sn tavanı ve kurumsal proxy timeout'unu önlemek için latency-critical görevlerde
      // thinkingBudget: 0 (DISABLED) ayarlanarak düşünme aşaması kapatılır ve doğrudan sub-second yanıt alınır:
      const reqConfig = { ...(baseParams.config || {}) };
      if (model.includes('3.') || model.includes('3-') || model.includes('flash')) {
        reqConfig.thinkingConfig = {
          thinkingBudget: 0,
          includeThoughts: false,
          ...(reqConfig.thinkingConfig || {}),
        };
      }

      const response = await ai.models.generateContent({
        ...baseParams,
        config: reqConfig,
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
      const isModelNotFound = status === 404 || /not found|no longer available|not supported/i.test(err?.message || '');

      console.warn(`[GeminiClient] Model ${model} hata verdi:`, {
        status,
        message: err?.message?.slice(0, 150),
        isRateLimit,
        isServerBusy,
        isModelNotFound,
      });

      if (isRateLimit) {
        hadRateLimit = true;
        rateLimitError = err;
        console.warn(`[GeminiClient] Model ${model} hız sınırına (429) takıldı. Vercel timeout olmaması için beklemeden bir sonraki modele geçiliyor...`);
        continue;
      }

      if (isModelNotFound) {
        console.warn(`[GeminiClient] Model ${model} kullanımdan kalkmış veya desteklenmiyor (404). Bir sonraki modele geçiliyor...`);
        continue;
      }

      if (isServerBusy) {
        console.warn(`[GeminiClient] Model ${model} aşırı yoğunluk nedeniyle meşgul (503). Vercel timeout olmaması için beklemeden derhal bir sonraki modele geçiliyor...`);
        continue;
      }
      // Model desteklenmiyor veya 400 hatası: döngü bir sonraki modeli dener
    }
  }

  // Eğer ana veya aday modellerden biri hız sınırına takıldıysa (veya son hata 429 ise),
  // diğer modeller bulunamasa (404) dahi asıl sorun kota aşımıdır.
  // İstemciye derhal 429 ve retryAfter: 5 dönülür; istemci 5 saniye bekleyip ana modelle otomatik yeniden dener:
  if (hadRateLimit || (lastError && (lastError.status === 429 || /too many requests|rate[- ]limit|resource_exhausted|quota/i.test(lastError.message || '')))) {
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
