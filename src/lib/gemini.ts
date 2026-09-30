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
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
];

// İstekler arası minimum bekleme süresi (13 saniye = dakikada en fazla 4.6 istek)
const MIN_INTERVAL_MS = 13000;

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
let queuePromise: Promise<number> = Promise.resolve(0);

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
 * 5 RPM ve 240k TPM hız sınırını garanti eden senkronize bekleme kuyruğu
 */
async function scheduleRequestSlot(estimatedTokens = 2000): Promise<number> {
  const executeSlot = async () => {
    let now = Date.now();
    let totalWaitMs = 0;

    // 1. RPM Kontrolü (Minimum 13 saniye aralık -> <= 4.6 RPM)
    const elapsed = now - lastRequestTimestamp;
    if (lastRequestTimestamp > 0 && elapsed < MIN_INTERVAL_MS) {
      const waitMs = MIN_INTERVAL_MS - elapsed;
      console.log(`[GeminiRateLimiter] 5 RPM koruması devrede. ${Math.ceil(waitMs / 1000)} sn bekleniyor...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      totalWaitMs += waitMs;
    }

    // 2. TPM Kontrolü (Dakikada maks 240k token)
    now = Date.now();
    const currentTokens = getCurrentMinuteTokens(now);
    if (currentTokens + estimatedTokens > MAX_TPM && tokenUsageHistory.length > 0) {
      const oldest = tokenUsageHistory[0];
      const tpmWait = Math.max(1000, (oldest.timestamp + TPM_WINDOW_MS + 500) - now);
      console.warn(`[GeminiRateLimiter] 240k TPM koruması devrede (Mevcut: ${currentTokens} + Tahmini: ${estimatedTokens} > ${MAX_TPM}). ${Math.ceil(tpmWait / 1000)} sn bekleniyor...`);
      await new Promise((resolve) => setTimeout(resolve, tpmWait));
      totalWaitMs += tpmWait;
    }

    lastRequestTimestamp = Date.now();
    recordTokens(estimatedTokens);
    return totalWaitMs;
  };

  const nextPromise = queuePromise.then(executeSlot, executeSlot);
  queuePromise = nextPromise;
  return nextPromise;
}

export interface GeminiCallParams {
  ai: GoogleGenAI;
  baseParams: any;
  preferredModel?: string;
  cacheKey?: string;
  onWaitProgress?: (seconds: number, message: string) => void;
}

/**
 * Üstel Geri Çekilme (Exponential Backoff: 2s, 4s, 8s, 16s) & Hız Sınırlayıcı (5 RPM / 240k TPM)
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

  // 2. Token tahmini ve Kuyruk Planlaması (5 RPM & 240k TPM garantisi)
  const estimatedTokens = estimateTokenCount(baseParams);
  await scheduleRequestSlot(estimatedTokens);

  const modelsToTry = preferredModel 
    ? [preferredModel, ...CANDIDATE_MODELS.filter(m => m !== preferredModel)]
    : CANDIDATE_MODELS;

  let lastError: any = null;

  for (const model of modelsToTry) {
    const MAX_RETRIES_PER_MODEL = 4;

    for (let attempt = 0; attempt < MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        console.log(`[GeminiClient] Model ${model} ile istek gönderiliyor (Deneme ${attempt + 1}/${MAX_RETRIES_PER_MODEL})...`);
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
        const status = err?.status || err?.statusCode || (err?.message?.includes('429') ? 429 : 0);
        const isRateLimit = status === 429 || err?.message?.includes('RESOURCE_EXHAUSTED') || err?.message?.includes('quota');
        const isServerBusy = status === 503 || err?.message?.includes('UNAVAILABLE');

        console.warn(`[GeminiClient] Model ${model} hata verdi:`, {
          status,
          message: err?.message?.slice(0, 150),
          isRateLimit,
          isServerBusy,
        });

        if (isRateLimit || isServerBusy) {
          // Üstel geri çekilme (Exponential backoff): Kullanıcı talimatı: 2s, 4s, 8s, 16s + jitter
          const baseDelay = Math.min(20000, Math.pow(2, attempt + 1) * 1000); // 2s, 4s, 8s, 16s
          const jitter = Math.floor(Math.random() * 600);
          const totalWait = baseDelay + jitter;
          const waitSec = Math.ceil(totalWait / 1000);

          const waitMessage = isRateLimit 
            ? `API hız sınırı (429) nedeniyle ${waitSec} saniye bekleniyor... (Deneme ${attempt + 1}/${MAX_RETRIES_PER_MODEL})`
            : `Sunucu meşgul (503) nedeniyle ${waitSec} saniye bekleniyor...`;

          console.warn(`[GeminiClient] ${waitMessage}`);
          if (params.onWaitProgress) {
            params.onWaitProgress(waitSec, waitMessage);
          }

          await new Promise((resolve) => setTimeout(resolve, totalWait));
          lastRequestTimestamp = Date.now();
          continue;
        } else {
          // Model desteklenmiyor veya 400 hatası ise bir sonraki modele geç
          break;
        }
      }
    }
  }

  // Kullanıcı dostu ve HTTP 429 durum kodunu taşıyan hata nesnesi
  const finalError: any = new Error(
    'Gemini API hız veya günlük kotası aşıldı (5 RPM / 240k TPM / 20 RPD). Sistem üstel geri çekilmeyi denedi. Lütfen yaklaşık 20-30 saniye sonra tekrar deneyin veya kayıtlı analizleri kullanın.'
  );
  finalError.status = 429;
  finalError.isRateLimit = true;
  finalError.retryAfter = 20;

  throw finalError;
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
