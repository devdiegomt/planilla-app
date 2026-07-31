import type { Metadata, Viewport } from 'next';
import { PwaSetup } from '@/components/PwaSetup';
import { SessionProvider } from '@/components/SessionProvider';
import { MainNav } from '@/components/MainNav';
import { NavSession } from '@/components/NavSession';
import { SyncStatus } from '@/components/SyncStatus';
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

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <SessionProvider>
          <header className="border-b bg-white sticky top-0 z-10">
            <div className="max-w-5xl mx-auto px-3 sm:px-6 py-1 sm:py-3 flex items-center gap-2 sm:gap-4 text-sm">
              <MainNav />
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <SyncStatus />
                <NavSession />
              </div>
            </div>
          </header>
          <PwaSetup />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
