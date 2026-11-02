import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey = 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    process.env.SUPABASE_ANON_KEY || 
    '';

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  if (!supabaseClient) {
    const isNode = typeof window === 'undefined';
    let customFetch: typeof fetch | undefined;
    if (isNode) {
      customFetch = (input: RequestInfo | URL, init?: RequestInit) => {
        // Node ortamında Windows proxy / antivirüs ara sertifika toleransı
        if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        }
        return fetch(input, init);
      };
    }

    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
      global: customFetch ? { fetch: customFetch } : undefined,
    });
  }
  return supabaseClient;
}

export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseKey = 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    process.env.SUPABASE_ANON_KEY || 
    '';
  return Boolean(supabaseUrl && supabaseKey);
}
