import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Gemini Free Tier Kısıtları:
 * - 5 RPM (Dakikada en fazla 5 istek -> En az 12-13 saniye aralık)
 * - 250k TPM (Dakikada en fazla 250.000 token)
 * - 20 RPD (Günde en fazla 20 istek -> Önbellekleme hayati önem taşır)
 */

export const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
];

// İstekler arası minimum bekleme süresi (13 saniye = dakikada maks 4.6 istek)
const MIN_INTERVAL_MS = 13000;

// Global durum (Tek bir sunucu sürecinde istek kuyruğunu koordine eder)
let lastRequestTimestamp = 0;
let queuePromise: Promise<void> = Promise.resolve();

// In-memory önbellek
const memoryCache = new Map<string, { timestamp: number; data: any }>();

// Disk tabanlı kalıcı önbellek (Sunucu yeniden başlasa da kota tüketimini korur)
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
    // Çoklu boşluk ve satır başlarını tekle
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    // Tekrarlanan sayfa altı / üstü ve dipnot kalıplarını sadeleştir
    .replace(/(?:Sayfa|Page)\s+\d+\s*(?:\/\s*\d+)?/gi, '')
    .trim();

  if (cleaned.length > maxChars) {
    console.log(`[GeminiLimiter] Metin boyutu ${cleaned.length} karakterden ${maxChars} karaktere optimize edildi.`);
    cleaned = cleaned.slice(0, maxChars) + '\n...[İçerik TPM sınırına uyum için optimize edildi]...';
  }

  return cleaned;
}

/**
 * 5 RPM hız sınırını garanti eden senkronize bekleme kuyruğu
 */
async function scheduleRequestSlot(): Promise<number> {
  const executeSlot = async () => {
    const now = Date.now();
    const elapsed = now - lastRequestTimestamp;
    let waitMs = 0;

    if (elapsed < MIN_INTERVAL_MS) {
      waitMs = MIN_INTERVAL_MS - elapsed;
      console.log(`[GeminiRateLimiter] 5 RPM koruması devrede. ${Math.ceil(waitMs / 1000)} sn bekleniyor...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    lastRequestTimestamp = Date.now();
    return waitMs;
  };

  const currentQueue = queuePromise.then(executeSlot, executeSlot);
  queuePromise = currentQueue.then(() => {});
  return currentQueue;
}

export interface GeminiCallParams {
  ai: GoogleGenAI;
  baseParams: any;
  preferredModel?: string;
  cacheKey?: string;
  onWaitProgress?: (seconds: number) => void;
}

/**
 * Üstel Geri Çekilme (Exponential Backoff) & Hız Sınırlayıcı (Rate Limiting) Korumalı Gemini Çağrısı
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

  // 2. Minimum 13 sn aralık kuyruğu (5 RPM garantisi)
  await scheduleRequestSlot();

  const modelsToTry = preferredModel 
    ? [preferredModel, ...CANDIDATE_MODELS.filter(m => m !== preferredModel)]
    : CANDIDATE_MODELS;

  let lastError: any = null;

  for (const model of modelsToTry) {
    const MAX_RETRIES_PER_MODEL = 3;

    for (let attempt = 0; attempt < MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        console.log(`[GeminiClient] Model ${model} ile istek gönderiliyor (Deneme ${attempt + 1}/${MAX_RETRIES_PER_MODEL})...`);
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
          // Üstel geri çekilme (Exponential backoff) + Jitter
          // Deneme 0: ~3-4s, Deneme 1: ~7-8s, Deneme 2: ~14-15s
          const baseDelay = Math.pow(2, attempt + 1) * 1500;
          const jitter = Math.floor(Math.random() * 1000);
          const totalWait = baseDelay + jitter;

          console.warn(`[GeminiClient] ${isRateLimit ? '429 Rate Limit (Hız Sınırı)' : '503 Sunucu Meşgul'}. ${Math.ceil(totalWait / 1000)} sn üstel geri çekilme uygulanıyor...`);
          await new Promise((resolve) => setTimeout(resolve, totalWait));

          // 429 durumunda API key kotası kısıtlandığı için farklı bir modele hemen atlamak yerine
          // aynı modelde geri çekilip beklemenin sonuca ulaşma şansı daha yüksektir.
          continue;
        } else {
          // Model desteklenmiyor veya başka bir 400 hatası ise bir sonraki modele geç
          break;
        }
      }
    }
  }

  // Kullanıcı dostu hata mesajı üret
  if (lastError?.status === 429 || lastError?.message?.includes('429') || lastError?.message?.includes('RESOURCE_EXHAUSTED')) {
    throw new Error(
      'Gemini API hız veya günlük kotası aşıldı (5 RPM / 20 RPD). Sistem üstel geri çekilmeyi denedi. Lütfen yaklaşık 30-60 saniye sonra tekrar deneyin veya kayıtlı analizleri kullanın.'
    );
  }

  throw lastError || new Error('Gemini API yanıt vermedi.');
}
