'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeIcon, NAV_LINKS } from './nav-icons';

/**
 * Navegación de móvil, fija abajo.
 *
 * Los destinos no caben en la fila de arriba a 375px: los `<Link>` se encogen,
 * los `<svg>` tienen `shrink-0` y terminan pisándose entre sí. Abajo hay una
 * fila entera, y además queda al alcance del pulgar.
 *
 * Son **cinco** pestañas (~72px cada una, sobre el mínimo táctil de 44px).
 * Eran seis: Classroom y Correos se mudaron a `/mas`, que es el cajón que
 * puede crecer sin apretar la barra.
 *
 * Ajustes no está acá: se entra por "Más" y por el menú de `NavMenu`.
 *
 * `env(safe-area-inset-bottom)` deja libre la barra de gestos de Android/iOS;
 * sin eso la última fila de pestañas queda debajo del indicador del sistema.
 */

const TABS = [{ href: '/', short: 'Inicio', Icon: HomeIcon }, ...NAV_LINKS];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="sm:hidden fixed inset-x-0 bottom-0 z-50 border-t border-borde bg-superficie
                 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch">
        {TABS.map(({ href, short, Icon }) => {
          const active = href === '/'
            ? pathname === '/'
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1 min-w-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5
                            transition-colors
                            ${active ? 'text-neutral-900' : 'text-neutral-500'}`}
              >
                <Icon />
                <span className="text-[10px] leading-none truncate max-w-full px-0.5">
                  {short}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
