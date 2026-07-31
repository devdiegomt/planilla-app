'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navegación principal.
 *
 * En móvil son solo íconos: las cinco etiquetas no caben en 375px junto al
 * estado de sync y la sesión. A partir de `sm` reaparece el texto.
 *
 * Como el ícono solo es más ambiguo que la palabra, se marca la ruta activa
 * con color y una barra inferior — sin eso, en el celular no hay forma de
 * saber en qué sección estás.
 */

const ICON = 'w-5 h-5 shrink-0';

function ClockIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  );
}

function CapIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4 2 9l10 5 10-5-10-5Z" />
      <path d="M6 11.5V16c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
    </svg>
  );
}

const LINKS = [
  { href: '/horario',    label: 'Horario',    Icon: ClockIcon },
  { href: '/calendario', label: 'Calendario', Icon: CalendarIcon },
  { href: '/pendientes', label: 'Pendientes', Icon: ChecklistIcon },
  { href: '/classroom',  label: 'Classroom',  Icon: CapIcon },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5 sm:gap-1 min-w-0">
      <Link
        href="/"
        aria-label="Inicio"
        title="Inicio"
        className={`flex items-center gap-2 rounded-md px-2 py-3 sm:py-1.5 transition-colors
                    ${pathname === '/' ? 'text-neutral-900' : 'text-neutral-600 hover:text-neutral-900'}`}
      >
        <span className="sm:hidden"><HomeIcon /></span>
        <span className="hidden sm:inline font-semibold whitespace-nowrap">planilla-app</span>
      </Link>

      {LINKS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            title={label}
            className={`relative flex items-center gap-1.5 rounded-md px-2.5 py-3 sm:py-1.5
                        transition-colors
                        ${active
                          ? 'text-neutral-900 bg-neutral-100'
                          : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}
          >
            <Icon />
            <span className="hidden sm:inline whitespace-nowrap">{label}</span>
            {active && (
              <span
                aria-hidden="true"
                className="sm:hidden absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-neutral-900"
              />
            )}
          </Link>
        );
      })}

      <a
        href="https://classroom-rpa.vercel.app"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Descargar entregas (abre classroom-rpa en pestaña nueva)"
        title="Descargar entregas de un ciclo (abre classroom-rpa en pestaña nueva)"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-3 sm:py-1.5 text-neutral-500
                   hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
      >
        <DownloadIcon />
        <span className="hidden sm:inline whitespace-nowrap">Descargar entregas ↗</span>
      </a>
    </nav>
  );
}
