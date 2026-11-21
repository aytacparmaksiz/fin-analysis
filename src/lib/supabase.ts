import { createClient, SupabaseClient } from '@supabase/supabase-js';

const clientCache = new Map<string, SupabaseClient>();

function resolveSupabaseUrl(): string {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  if (!url || url.includes('your-project')) return '';
  return url;
}

function resolveSupabaseAnonKey(): string {
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!key || key === 'your_supabase_anon_key_here') return '';
  return key;
}

function resolveSupabaseServiceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function getOrCreateClient(url: string, key: string): SupabaseClient | null {
  if (!url || !key) return null;
  const cacheKey = `${url}::${key}`;
  const existing = clientCache.get(cacheKey);
  if (existing) return existing;

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
  clientCache.set(cacheKey, client);
  return client;
}

/**
 * Standart (RLS kapsamlı) Supabase istemcisi.
 * Hiçbir zaman SUPABASE_SERVICE_ROLE_KEY kullanmaz.
 */
export function getSupabase(): SupabaseClient | null {
  return getOrCreateClient(resolveSupabaseUrl(), resolveSupabaseAnonKey());
}

/**
 * Sunucu tarafı yetkili yazma/bakım işlemleri için Supabase Service Role istemcisi.
 * Yalnızca SUPABASE_SERVICE_ROLE_KEY tanımlıysa döner.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (typeof window !== 'undefined') return null;
  return getOrCreateClient(resolveSupabaseUrl(), resolveSupabaseServiceRoleKey());
}

/**
 * Kimlik/kaynak doğrulamasından geçmiş sunucu yazma rotaları için en uygun istemci.
 */
export function getSupabaseForAuthorizedWrite(): SupabaseClient | null {
  return getSupabaseAdmin() || getSupabase();
}

export function isSupabaseConfigured(): boolean {
  const url = resolveSupabaseUrl();
  const key = resolveSupabaseAnonKey() || resolveSupabaseServiceRoleKey();
  return Boolean(url && key);
}
