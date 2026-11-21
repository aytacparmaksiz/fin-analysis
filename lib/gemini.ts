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
  'gemini-3.5-flash-lite',         // 500 RPD, 15 RPM, ~1.2s latency (ultra hızlı & yüksek kota)
  'gemini-3-flash-preview',        // Hızlı ve stabil (~1.5s)
  'gemini-3.1-flash-lite',         // Hızlı flash-lite (~1.4s)
  'gemini-2.5-flash',              // Güvenilir, yüksek kotalı ana model
  'gemini-flash-latest',           // Resmi en güncel flash alias
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

// In-memory LRU önbellek (maks. 100 girdi)
const MAX_MEMORY_CACHE_ENTRIES = 100;
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
  const tmpPath = `${CACHE_FILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(cacheObj, null, 2), 'utf-8');
    fs.renameSync(tmpPath, CACHE_FILE_PATH);
  } catch (err) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    console.warn('[GeminiCache] Disk önbelleği yazılamadı:', err);
  }
}

export function getGeminiCacheStats(): { memorySize: number; maxEntries: number } {
  return { memorySize: memoryCache.size, maxEntries: MAX_MEMORY_CACHE_ENTRIES };
}

/**
 * Önbellekten veri çek (24 saat geçerli, LRU sıralamalı)
 */
export function getCachedGeminiResult(cacheKey: string): any | null {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 saat

  // 1. Önce RAM kontrolü
  if (memoryCache.has(cacheKey)) {
    const entry = memoryCache.get(cacheKey)!;
    memoryCache.delete(cacheKey);
    if (now - entry.timestamp < maxAge) {
      memoryCache.set(cacheKey, entry);
      console.log(`[GeminiCache] RAM önbellekten yüklendi: ${cacheKey}`);
      return entry.data;
    }
  }

  // 2. Disk kontrolü
  const disk = loadDiskCache();
  if (disk[cacheKey]) {
    const entry = disk[cacheKey];
    if (now - entry.timestamp < maxAge) {
      console.log(`[GeminiCache] Disk önbellekten yüklendi: ${cacheKey}`);
      if (memoryCache.size >= MAX_MEMORY_CACHE_ENTRIES) {
        const oldest = memoryCache.keys().next().value;
        if (oldest) memoryCache.delete(oldest);
      }
      memoryCache.set(cacheKey, entry);
      return entry.data;
    }
  }

  return null;
}

/**
 * Veriyi önbelleğe yaz (RAM LRU + Atomik Disk)
 */
export function setCachedGeminiResult(cacheKey: string, data: any) {
  const entry = { timestamp: Date.now(), data };
  memoryCache.delete(cacheKey);
  if (memoryCache.size >= MAX_MEMORY_CACHE_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(cacheKey, entry);

  try {
    const disk = loadDiskCache();
    disk[cacheKey] = entry;
    // Maksimum 100 girdi sakla
    const keys = Object.keys(disk);
    if (keys.length > MAX_MEMORY_CACHE_ENTRIES) {
      keys.sort((a, b) => disk[a].timestamp - disk[b].timestamp);
      for (let i = 0; i < keys.length - MAX_MEMORY_CACHE_ENTRIES; i++) {
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
 * Dakikalık TPM penceresini denetler ve token kotası doluysa eski pencere düşene kadar bekler (maks. 10s).
 */
export async function scheduleRequestSlot(estimatedTokens = 2000, maxWaitMs = 10000): Promise<number> {
  const start = Date.now();
  let totalWaited = 0;

  while (true) {
    const now = Date.now();
    const usedTokens = getCurrentMinuteTokens(now);
    if (usedTokens + estimatedTokens <= MAX_TPM || tokenUsageHistory.length === 0) {
      break;
    }
    const oldest = tokenUsageHistory[0];
    const remainingWindowMs = Math.max(25, oldest.timestamp + TPM_WINDOW_MS - now + 10);
    const elapsed = now - start;
    if (elapsed >= maxWaitMs) {
      break;
    }
    const sleepMs = Math.min(remainingWindowMs, maxWaitMs - elapsed);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
    totalWaited += sleepMs;
  }

  lastRequestTimestamp = Date.now();
  recordTokens(estimatedTokens);
  return totalWaited;
}

export interface GeminiCallParams {
  ai: GoogleGenAI;
  baseParams: any;
  preferredModel?: string;
  cacheKey?: string;
  maxAttempts?: number;
  attemptTimeoutMs?: number;
  onWaitProgress?: (seconds: number, message: string) => void;
}

/**
 * Hız Sınırlayıcı & Akıllı Fallback Zinciri
 */
export async function generateWithRateLimitAndBackoff(params: GeminiCallParams): Promise<any> {
  const { ai, baseParams, preferredModel, cacheKey } = params;

  // 1. Önbellek kontrolü (RPD kotasını korumak için ilk adım)
  if (cacheKey) {
    const cached = getCachedGeminiResult(cacheKey);
    if (cached) {
      return {
        text: typeof cached === 'string' ? cached : JSON.stringify(cached),
        fromCache: true,
      };
    }
  }

  // 2. Token tahmini ve kayan pencere TPM denetimi
  const estimatedTokens = estimateTokenCount(baseParams);
  await scheduleRequestSlot(estimatedTokens);

  const modelsToTry = preferredModel 
    ? [preferredModel, ...CANDIDATE_MODELS.filter(m => m !== preferredModel)]
    : CANDIDATE_MODELS;

  const isJsonMode = baseParams?.config?.responseMimeType === 'application/json';
  const maxAttempts = Math.max(1, Math.min(params.maxAttempts ?? 4, modelsToTry.length));
  const attemptTimeoutMs = params.attemptTimeoutMs ?? 12000;

  let lastError: any = null;
  let hadRateLimit = false;
  let attempts = 0;

  for (const model of modelsToTry) {
    if (attempts >= maxAttempts) break;
    attempts++;

    try {
      console.log(`[GeminiClient] Model ${model} ile istek gönderiliyor (Deneme ${attempts}/${maxAttempts})...`);
      lastRequestTimestamp = Date.now();

      const reqConfig = { ...(baseParams.config || {}) };
      if (model !== 'gemini-3.5-flash-lite' && (model.includes('3.') || model.includes('3-') || model.includes('flash'))) {
        reqConfig.thinkingConfig = {
          thinkingBudget: 0,
          includeThoughts: false,
          ...(reqConfig.thinkingConfig || {}),
        };
      }

      reqConfig.abortSignal = reqConfig.abortSignal || AbortSignal.timeout(attemptTimeoutMs);

      const response = await ai.models.generateContent({
        ...baseParams,
        config: reqConfig,
        model,
      });

      const responseText = String(response?.text || '').trim();
      if (!responseText) {
        const emptyErr: any = new Error(`Model ${model} boş yanıt döndürdü.`);
        emptyErr.status = 503;
        throw emptyErr;
      }

      if (isJsonMode) {
        let parsedJson: any;
        try {
          parsedJson = cleanAndParseJson(responseText);
        } catch (jsonErr: any) {
          const invalidErr: any = new Error(`Model ${model} geçersiz JSON döndürdü: ${jsonErr?.message || ''}`);
          invalidErr.status = 502;
          throw invalidErr;
        }
        const isValidNonEmptyJson =
          parsedJson &&
          typeof parsedJson === 'object' &&
          (Array.isArray(parsedJson) ? parsedJson.length > 0 : Object.keys(parsedJson).length > 0);
        if (!isValidNonEmptyJson) {
          const emptyJsonErr: any = new Error(`Model ${model} boş JSON nesnesi döndürdü.`);
          emptyJsonErr.status = 502;
          throw emptyJsonErr;
        }
        if (cacheKey) {
          setCachedGeminiResult(cacheKey, parsedJson);
        }
      } else if (cacheKey) {
        setCachedGeminiResult(cacheKey, responseText);
      }

      return response;
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.statusCode || err?.code || err?.error?.code || (err?.message?.includes('429') ? 429 : 0);
      const isTimeout = err?.name === 'AbortError' || err?.name === 'TimeoutError' || /aborted|timed? ?out/i.test(err?.message || '');
      const isRateLimit = status === 429 || 
        err?.isRateLimit || 
        /too many requests|rate[- ]limit|resource_exhausted|quota/i.test(err?.message || '');
      const isServerBusy = status === 503 || status === 502 || err?.code === 503 || isTimeout || /unavailable|server busy/i.test(err?.message || '');
      const isModelNotFound = status === 404 || /not found|no longer available|not supported/i.test(err?.message || '');

      console.warn(`[GeminiClient] Model ${model} hata verdi:`, {
        status,
        message: err?.message?.slice(0, 150),
        isRateLimit,
        isServerBusy,
        isModelNotFound,
        isTimeout,
      });

      if (isRateLimit || isServerBusy) {
        hadRateLimit = true;
        console.warn(`[GeminiClient] Model ${model} hız sınırına veya yoğunluğa takıldı. Bir sonraki modele geçiliyor...`);
        continue;
      }

      if (isModelNotFound) {
        console.warn(`[GeminiClient] Model ${model} kullanımdan kalkmış veya desteklenmiyor (404). Bir sonraki modele geçiliyor...`);
        continue;
      }
      // Model desteklenmiyor veya 400 hatası: döngü bir sonraki modeli dener
    }
  }

  // Eğer ana veya aday modellerden biri hız sınırına veya geçici yoğunluğa takıldıysa,
  // istemciye derhal 429 ve retryAfter: 5 dönülür; istemci güvenle bekleyip otomatik yeniden dener:
  const isRetryable = hadRateLimit || 
    (lastError && (
      lastError.status === 429 || 
      lastError.status === 503 ||
      lastError.code === 503 ||
      /too many requests|rate[- ]limit|resource_exhausted|quota|unavailable|demand|aborted/i.test(lastError.message || '')
    ));

  if (isRetryable) {
    const finalRateError: any = new Error(
      'Gemini API servisleri geçici olarak yoğun (Rate Limit / 503). Lütfen birkaç saniye sonra tekrar deneyin.'
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
