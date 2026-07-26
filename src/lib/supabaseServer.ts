/**
 * Cliente Supabase server-side con el JWT del cliente para respetar RLS.
 * NUNCA usar service_role en rutas cliente-facing (bypasa RLS).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Extrae el bearer del header Authorization, o null. */
export function bearerFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/**
 * Crea un cliente Supabase autenticado con el JWT del usuario.
 * Todas las queries respetan RLS scoped a auth.uid().
 */
export function serverClientFromToken(token: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Supabase env vars no configuradas.');
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Obtiene el user actual desde el JWT del request. Devuelve null si no autenticado.
 */
export async function currentUser(req: Request) {
  const token = bearerFromRequest(req);
  if (!token) return { user: null, client: null } as const;
  const client = serverClientFromToken(token);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { user: null, client: null } as const;
  return { user: data.user, client } as const;
}
