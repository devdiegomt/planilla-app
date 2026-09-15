'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GearIcon } from './nav-icons';

/**
 * Engranaje hacia /ajustes, solo en escritorio. En móvil la entrada a Ajustes
 * está en `NavMenu`, porque en la barra de arriba no queda ancho.
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
      className={`hidden sm:block shrink-0 rounded-md p-1.5 transition-colors
                  ${active
                    ? 'text-neutral-900 bg-neutral-100'
                    : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}
    >
      <GearIcon />
    </Link>
  );
}
