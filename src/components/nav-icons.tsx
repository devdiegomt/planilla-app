/**
 * Íconos y destinos de la navegación, compartidos por la barra de escritorio
 * (`MainNav`) y la de móvil (`BottomNav`). Estaban duplicados dentro de
 * MainNav; con dos barras, una copia por barra se desincroniza sola.
 */

const ICON = 'w-5 h-5 shrink-0';

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function HomeIcon() {
  return <Svg><path d="m3 10 9-7 9 7" /><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /></Svg>;
}

export function ClockIcon() {
  return <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
}

export function CalendarIcon() {
  return <Svg><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></Svg>;
}

export function ChecklistIcon() {
  return (
    <Svg>
      <path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </Svg>
  );
}

/*
 * CapIcon y MailIcon ya no están en la barra —Classroom y Correos se mudaron a
 * /mas— pero se quedan dibujados: son los íconos de esos dos destinos y es
 * donde van a hacer falta cuando la lista de "Más" los lleve.
 */
export function CapIcon() {
  return (
    <Svg>
      <path d="M12 4 2 9l10 5 10-5-10-5Z" />
      <path d="M6 11.5V16c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.5" />
    </Svg>
  );
}

export function MailIcon() {
  return <Svg><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>;
}

export function DownloadIcon() {
  return (
    <Svg>
      <path d="M12 3v12" /><path d="m8 11 4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Svg>
  );
}

export function GearIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Svg>
  );
}

export function MoreIcon() {
  return (
    <Svg>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </Svg>
  );
}

/**
 * Los destinos de la barra. En la de abajo se les antepone Inicio; `short` es
 * la etiqueta de móvil, donde cada pestaña tiene ~60px.
 *
 * **Son cuatro y no seis a propósito.** Classroom y Correos estaban acá arriba
 * y no son de todos los días para todo el mundo: a Diego los estudiantes le
 * entregan por Classroom, pero a otro docente puede no servirle de nada. Con
 * los dos en la barra, lo que se usa a diario compartía sitio con lo que se
 * usa a veces — y no quedaba dónde poner lo que venga después. Ahora viven en
 * `/mas`, que es el cajón que puede crecer sin apretar la barra.
 */
export const NAV_LINKS = [
  { href: '/horario',    label: 'Horario',    short: 'Horario',  Icon: ClockIcon },
  { href: '/calendario', label: 'Calendario', short: 'Calend.',  Icon: CalendarIcon },
  { href: '/pendientes', label: 'Pendientes', short: 'Pend.',    Icon: ChecklistIcon },
  { href: '/mas',        label: 'Más',        short: 'Más',      Icon: MoreIcon },
] as const;
