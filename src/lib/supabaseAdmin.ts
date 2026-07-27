/**
 * Cliente Supabase con service_role — BYPASA RLS.
 * SOLO para uso server-side en endpoints protegidos (cron, webhooks).
 * NUNCA importar desde componentes cliente ni desde rutas que exponen datos
 * sin filtrar por user_id.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL no configurados. ' +
        'La service_role key se obtiene en Supabase → Settings → API.',
    );
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
