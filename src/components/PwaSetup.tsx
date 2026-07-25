'use client';

import { useEffect } from 'react';

/** Registra el service worker una vez montada la app. */
export function PwaSetup() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Ignorar en dev-tools de Next; en dev el SW puede provocar caches raras.
    // Solo registrar cuando estamos servidos por Next (cualquier entorno).
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('SW register failed:', err);
      });
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
