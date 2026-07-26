'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useSession } from './SessionProvider';

type PermState = 'default' | 'granted' | 'denied' | 'unsupported';

interface State {
  perm: PermState;
  subscribed: boolean;
  endpoint: string | null;
  busy: boolean;
  status: string | null;
  error: string | null;
}

export function PushSetup() {
  const { user, loading } = useSession();
  const [state, setState] = useState<State>({
    perm: 'default',
    subscribed: false,
    endpoint: null,
    busy: false,
    status: null,
    error: null,
  });

  // Detectar soporte y estado inicial
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState(s => ({ ...s, perm: 'unsupported' }));
      return;
    }
    const perm = Notification.permission as PermState;
    setState(s => ({ ...s, perm }));
    // Cargar suscripción actual del navegador (si existe)
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        if (sub) {
          setState(s => ({ ...s, subscribed: true, endpoint: sub.endpoint }));
        }
      }),
    );
  }, []);

  if (loading) return null;
  if (!user) return null;                    // solo con sesión
  if (state.perm === 'unsupported') {
    return (
      <div className="text-sm text-neutral-500">
        Este navegador no soporta notificaciones push.
      </div>
    );
  }

  const getAccessToken = async () => {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  };

  const enable = async () => {
    setState(s => ({ ...s, busy: true, error: null, status: null }));
    try {
      const perm = await Notification.requestPermission();
      setState(s => ({ ...s, perm: perm as PermState }));
      if (perm !== 'granted') {
        setState(s => ({ ...s, busy: false, error: 'Permiso rechazado en el navegador.' }));
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error('VAPID public key no configurada.');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const token = await getAccessToken();
      if (!token) throw new Error('Sesión sin token (recarga).');
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState(s => ({
        ...s, busy: false, subscribed: true,
        endpoint: sub.endpoint,
        status: '✓ Notificaciones habilitadas',
      }));
    } catch (e) {
      setState(s => ({ ...s, busy: false, error: (e as Error).message }));
    }
  };

  const disable = async () => {
    setState(s => ({ ...s, busy: true, error: null, status: null }));
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe();
      if (endpoint) {
        const token = await getAccessToken();
        if (token) {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ endpoint }),
          });
        }
      }
      setState(s => ({
        ...s, busy: false, subscribed: false, endpoint: null,
        status: 'Notificaciones deshabilitadas.',
      }));
    } catch (e) {
      setState(s => ({ ...s, busy: false, error: (e as Error).message }));
    }
  };

  const test = async () => {
    setState(s => ({ ...s, busy: true, error: null, status: null }));
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Sesión sin token.');
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState(s => ({
        ...s, busy: false,
        status: `✓ Enviada a ${data.sent} dispositivo(s)${data.failed ? ` · ${data.failed} fallaron` : ''}${data.goneCleared ? ` · ${data.goneCleared} expiradas removidas` : ''}`,
      }));
    } catch (e) {
      setState(s => ({ ...s, busy: false, error: (e as Error).message }));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {!state.subscribed ? (
          <button
            disabled={state.busy || state.perm === 'denied'}
            onClick={enable}
            className="px-4 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
          >
            {state.busy ? 'Habilitando…' : 'Habilitar notificaciones'}
          </button>
        ) : (
          <>
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-medium">
              ✓ Notificaciones activas
            </span>
            <button
              disabled={state.busy}
              onClick={test}
              className="px-3 py-1 rounded-md border text-sm hover:bg-neutral-50 disabled:opacity-40"
            >
              Probar
            </button>
            <button
              disabled={state.busy}
              onClick={disable}
              className="text-xs text-neutral-600 hover:text-neutral-900 underline"
            >
              Deshabilitar
            </button>
          </>
        )}
        {state.perm === 'denied' && (
          <span className="text-xs text-red-700">
            El navegador rechazó el permiso. Actívalo desde la configuración del sitio.
          </span>
        )}
      </div>
      {state.status && <p className="text-xs text-neutral-700">{state.status}</p>}
      {state.error && <p className="text-sm text-red-600">❌ {state.error}</p>}
    </div>
  );
}

/**
 * Convierte una key VAPID pública (base64url) al Uint8Array que exige
 * `applicationServerKey` de PushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}
