import { createClient, SupabaseClient } from '@supabase/supabase-js';

const envSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const envSupabaseKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  '';

let defaultClient: SupabaseClient | null = null;
const clientCache = new Map<string, SupabaseClient>();

export function getSupabase(customUrl?: string, customKey?: string): SupabaseClient | null {
  const url = (customUrl || envSupabaseUrl || '').trim();
  const key = (customKey || envSupabaseKey || '').trim();

  if (!url || !key) {
    return null;
  }

  const cacheKey = `${url}::${key.slice(-10)}`;
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey)!;
  }

  const client = createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });

  clientCache.set(cacheKey, client);
  if (!customUrl && !customKey) {
    defaultClient = client;
  }
  return client;
}

export function isSupabaseConfigured(customUrl?: string, customKey?: string): boolean {
  const url = (customUrl || envSupabaseUrl || '').trim();
  const key = (customKey || envSupabaseKey || '').trim();
  return Boolean(url && key);
}
