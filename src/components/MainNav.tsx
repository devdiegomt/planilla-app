'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DownloadIcon, ENTREGAS_URL, NAV_LINKS } from './nav-icons';

/**
 * Navegación de escritorio, con etiquetas de texto.
 *
 * En móvil solo queda el nombre de la app: los destinos están en `BottomNav` y
 * en `NavMenu`. Antes esto intentaba meter ocho íconos en la fila superior y a
 * 375px se pisaban unos a otros.
 *
 * `shrink-0` en cada enlace es lo que impide que vuelva a pasar: sin eso los
 * enlaces se encogen por debajo del ancho de su ícono, que tiene `shrink-0`
 * propio, y el ícono se desborda de su caja en vez de recortarse.
 */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 min-w-0">
      <Link
        href="/"
        aria-label="Inicio"
        className={`rounded-md px-1 py-1.5 font-semibold whitespace-nowrap transition-colors
                    ${pathname === '/' ? 'text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'}`}
      >
        planilla-app
      </Link>

      {NAV_LINKS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            title={label}
            className={`hidden sm:flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5
                        transition-colors
                        ${active
                          ? 'text-neutral-900 bg-neutral-100'
                          : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}
          >
            <Icon />
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        );
      })}

      <a
        href={ENTREGAS_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Descargar entregas de un ciclo (abre classroom-rpa en pestaña nueva)"
        className="hidden sm:flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5
                   text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
      >
        <DownloadIcon />
        <span className="whitespace-nowrap">Descargar entregas ↗</span>
      </a>
    </nav>
  );
}
