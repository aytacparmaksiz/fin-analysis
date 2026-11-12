/**
 * Kayıtlı Analiz Önbelleği (IndexedDB)
 *
 * 269+ analiz raporu (~30-70 MB) tarayıcının 5 MB'lık localStorage kotasına sığmadığı için
 * her cihaz farklı sayıda (80 / 111 / 130+) raporu yerelde tutabiliyordu. Bu modül raporları
 * kotası yüzlerce MB olan IndexedDB'de saklar; localStorage yalnızca eski sürümden geçiş için okunur.
 */

const DB_NAME = 'fin_analiz_cache';
const STORE = 'kv';
const REPORTS_KEY = 'fin_valuation_reports';
const LEGACY_LS_KEY = 'fin_valuation_reports';
export const LAST_CLOUD_SYNC_KEY = 'fin_last_cloud_sync_at';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadReportsCache<T = any>(): Promise<T[]> {
  const db = await openDb();
  if (db) {
    const fromIdb = await new Promise<T[] | null>(resolve => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(REPORTS_KEY);
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (fromIdb) return fromIdb;
  }
  // Eski sürüm geçişi: localStorage'daki kısmi listeyi bir kez oku
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_LS_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

let pendingList: any[] | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  const list = pendingList;
  pendingList = null;
  if (!list) return;
  const db = await openDb();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(list, REPORTS_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      // IndexedDB'ye başarıyla yazıldıysa, kotayı dolduran eski localStorage kopyasını temizle
      try { localStorage.removeItem(LEGACY_LS_KEY); } catch {}
      return;
    } catch (err) {
      console.warn('IndexedDB rapor önbelleği yazılamadı:', err);
    }
  }
  try { localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(list)); } catch {}
}

/** Rapor listesini (debounce ile) kalıcı önbelleğe yazar. */
export function saveReportsCache(list: any[]): void {
  if (typeof window === 'undefined' || !Array.isArray(list)) return;
  pendingList = list;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { void flush(); }, 250);
}
