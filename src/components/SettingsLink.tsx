'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Engranaje hacia /ajustes.
 *
 * Va en el grupo derecho de la barra y no en `MainNav`: en 375px los íconos de
 * navegación ya van al límite, y ajustes no es una sección de contenido más.
 * Solo ícono, también en escritorio — el engranaje no necesita etiqueta.
 *
 * No cuelga del menú de la cuenta porque la app es local-first: el backup, la
 * reparación y la instalación tienen que alcanzarse sin sesión iniciada.
 */
export function SettingsLink() {
  const pathname = usePathname();
  const active = pathname === '/ajustes';

  return (
    <Link
      href="/ajustes"
      aria-label="Ajustes"
      aria-current={active ? 'page' : undefined}
      title="Ajustes"
      className={`rounded-md p-1.5 transition-colors
                  ${active
                    ? 'text-neutral-900 bg-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}
    >
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    </Link>
  );
}
