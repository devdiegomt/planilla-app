/**
 * Sesión Classroom vía cookie httpOnly.
 *
 * Guardamos { refresh_token, access_token, expiry_date } en una única cookie
 * httpOnly. El refresh_token es el que persiste; access_token se refresca
 * on-demand vía el OAuth2Client.
 */

import { cookies } from 'next/headers';
import { getOAuth2Client } from './googleOAuth';
import type { OAuth2Client, Credentials } from 'google-auth-library';

const COOKIE_NAME = 'classroom_tokens';
const MAX_AGE = 60 * 60 * 24 * 60;   // 60 días

export interface StoredTokens {
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
}

export async function saveTokens(tokens: Credentials) {
  const stored: StoredTokens = {
    refresh_token: tokens.refresh_token ?? undefined,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
  };
  const jar = await cookies();
  jar.set(COOKIE_NAME, JSON.stringify(stored), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredTokens; } catch { return null; }
}

export async function clearTokens() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * Devuelve un OAuth2Client autenticado con los tokens de la cookie.
 * Si el access_token vencerá pronto, lo refresca y guarda la nueva cookie.
 * Devuelve null si no hay sesión.
 */
export async function getAuthedClient(): Promise<OAuth2Client | null> {
  const stored = await loadTokens();
  if (!stored?.refresh_token && !stored?.access_token) return null;

  const client = getOAuth2Client();
  client.setCredentials({
    refresh_token: stored.refresh_token,
    access_token: stored.access_token,
    expiry_date: stored.expiry_date,
  });

  // Refrescar si el token vence en menos de 60s
  const now = Date.now();
  const willExpireSoon =
    !stored.access_token
    || (stored.expiry_date != null && stored.expiry_date - now < 60_000);

  if (willExpireSoon && stored.refresh_token) {
    try {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      await saveTokens({
        ...credentials,
        refresh_token: credentials.refresh_token ?? stored.refresh_token,
      });
    } catch {
      return null;
    }
  }

  return client;
}
