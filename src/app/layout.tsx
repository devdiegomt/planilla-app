import type { Metadata, Viewport } from 'next';
import { PwaSetup } from '@/components/PwaSetup';
import { TemaVivo } from '@/components/TemaVivo';
import { SessionProvider } from '@/components/SessionProvider';
import { MainNav } from '@/components/MainNav';
import { SettingsLink } from '@/components/SettingsLink';
import { NavMenu } from '@/components/NavMenu';
import { BottomNav } from '@/components/BottomNav';
import { NavSession } from '@/components/NavSession';
import { SyncStatus } from '@/components/SyncStatus';
import { BOOT_GUARD_SCRIPT } from '@/lib/recovery';
import { GUION_TEMA } from '@/lib/tema';
import './globals.css';

export const metadata: Metadata = {
  title: 'planilla-app',
  description: 'Automatización de planillas y Califica',
  applicationName: 'planilla-app',
  appleWebApp: {
    capable: true,
    title: 'planilla',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      { url: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
    ],
    apple: '/icon-192.svg',
  },
};

/*
 * Sin `themeColor`: lo pone `lib/tema.ts`, que es quien sabe el tema efectivo.
 * Next solo sabe escribirlo por `prefers-color-scheme`, y eso deja la barra
 * blanca sobre la app oscura para quien eligió "siempre oscuro" con el equipo
 * en claro.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/*
 * `suppressHydrationWarning` va en `<html>` por `data-tema`: el guion del
 * `<head>` lo escribe antes de hidratar, así que el servidor manda un `<html>`
 * sin el atributo y el cliente encuentra uno con él. React avisa del desajuste
 * y **no lo repara**; sin esto el aviso queda en la consola para siempre y tapa
 * los desajustes de verdad. Va solo en `<html>`, así que no silencia nada de
 * adentro. La otra salida sería pintar el tema después de hidratar, que es
 * justo el fogonazo blanco que el guion existe para evitar.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Inline para no depender de los archivos de la app: si esos no cargan,
            React y las pantallas de error tampoco. Next igual pone sus scripts
            antes que este; por eso la guardia trae un vigía que no depende del
            orden (ver lib/recovery.ts). */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_GUARD_SCRIPT }} />
        {/* El tema, ANTES de pintar. Si esto llegara con React, la página
            arrancaría en claro y saltaría a oscuro medio segundo después — un
            fogonazo blanco a las once de la noche, que es justo cuando alguien
            tiene puesto el modo oscuro. */}
        <script dangerouslySetInnerHTML={{ __html: GUION_TEMA }} />
      </head>
      <body className="min-h-screen antialiased">
        <SessionProvider>
          {/* z-50: la barra es el chrome de la app y debe quedar por encima de
              las columnas fijas de la planilla (z-10) y de sus popovers (z-30). */}
          <header className="border-b border-borde bg-superficie/85 backdrop-blur sticky top-0 z-50">
            <div className="max-w-5xl mx-auto px-3 sm:px-6 py-1 sm:py-3 flex items-center gap-2 sm:gap-4 text-sm">
              <MainNav />
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <SyncStatus />
                <SettingsLink />
                <NavSession />
                <NavMenu />
              </div>
            </div>
          </header>
          <PwaSetup />
          <TemaVivo />
          {/* El aire de abajo es para que `BottomNav`, que va fijo, no tape la
              última fila de la planilla. Incluye el área segura del gesto. */}
          <div className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
            {children}
          </div>
          <BottomNav />
        </SessionProvider>
      </body>
    </html>
  );
}
