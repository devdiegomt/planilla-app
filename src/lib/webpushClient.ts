/**
 * Wrapper server-only sobre web-push con los VAPID keys de env.
 * NO importar desde componentes client.
 */

import webpush from 'web-push';

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      'VAPID env vars no configuradas: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT',
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface SubscriptionRow {
  id: string;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
}

export interface SendResult {
  id: string;
  ok: boolean;
  gone: boolean;                       // 404/410 — hay que borrar la suscripción
  error?: string;
}

/**
 * Envía una notificación a una suscripción. Devuelve resultado; nunca lanza.
 */
export async function sendPush(
  sub: SubscriptionRow,
  payload: PushPayload,
): Promise<SendResult> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
      },
      JSON.stringify(payload),
    );
    return { id: sub.id, ok: true, gone: false };
  } catch (e) {
    const err = e as { statusCode?: number; message?: string };
    const gone = err.statusCode === 404 || err.statusCode === 410;
    return {
      id: sub.id,
      ok: false,
      gone,
      error: `${err.statusCode ?? '?'} ${err.message ?? 'error desconocido'}`,
    };
  }
}
