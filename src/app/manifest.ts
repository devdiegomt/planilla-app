import type { MetadataRoute } from 'next';
import { COLOR_BARRA } from '@/lib/tema';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'planilla-app',
    short_name: 'planilla',
    description: 'Automatización de planillas y Califica — GLA 2026',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    /*
     * El manifiesto es uno solo y no puede tener dos temas: es la pantalla de
     * arranque de la app instalada, antes de que corra un solo guion. Van los
     * valores del tema claro, que es el que ve quien no eligió nada con el
     * equipo en claro. Quien tenga oscuro ve esta pantalla un instante y
     * después la app, ya en su tema. El `theme_color` sale de `lib/tema.ts`
     * para que no vuelva a quedarse atrás cuando cambie la paleta: acá había
     * un `#0f172a` que ya no era de ningún tema de la app.
     */
    background_color: '#faf8f5',
    theme_color: COLOR_BARRA.claro,
    icons: [
      { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
