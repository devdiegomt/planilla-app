import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { PwaSetup } from '@/components/PwaSetup';
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
        <nav className="border-b bg-white sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4 text-sm">
            <Link href="/" className="font-semibold">planilla-app</Link>
            <Link href="/horario" className="text-neutral-600 hover:text-neutral-900">Horario</Link>
            <Link href="/calendario" className="text-neutral-600 hover:text-neutral-900">Calendario</Link>
            <Link href="/pendientes" className="text-neutral-600 hover:text-neutral-900">Pendientes</Link>
            <Link href="/classroom" className="text-neutral-600 hover:text-neutral-900">Classroom</Link>
            <Link href="/agente" className="text-neutral-600 hover:text-neutral-900">Agente IA</Link>
          </div>
        </nav>
        <PwaSetup />
        {children}
      </body>
    </html>
  );
}
