'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker, versionado por deploy.
 *
 * En desarrollo NO se registra, y se desregistra el que hubiera: ahí los
 * archivos de Next no llevan hash en el nombre, así que el caché servía código
 * viejo después de cada cambio. Pasó varias veces antes de quitarlo.
 */
export function PwaSetup() {
  useEffect(() => {
    // Señal para el vigía de la guardia de arranque: React ya está corriendo.
    (window as unknown as { __planillaHydrated?: boolean }).__planillaHydrated = true;
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())))
        .catch(() => {});
      return;
    }

    const version = encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID ?? 'sin-version');
    const registrar = () => {
      navigator.serviceWorker
        // updateViaCache 'none': que el navegador no use una copia vieja de sw.js.
        .register(`/sw.js?v=${version}`, { updateViaCache: 'none' })
        .catch(err => console.warn('No se pudo registrar el service worker:', err));
    };
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });
    return () => window.removeEventListener('load', registrar);
  }, []);
  return null;
}
