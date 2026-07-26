/**
 * Cliente Supabase para uso client-side (browser).
 * Singleton — un solo cliente por sesión de JS para que el auth funcione.
 * La anon key es pública por diseño; los datos están protegidos por RLS.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY no configurados en .env.local',
    );
  }
  cached = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return cached;
}
