import Link from 'next/link';

/**
 * Una lista de destinos: título, una línea de qué es, y se entra.
 *
 * Existe porque tanto "Más" como Ajustes eran un muro de paneles apilados en
 * una sola página larga. Con todo abierto a la vez no hay jerarquía: el
 * "Borrar los datos de este equipo" pesa lo mismo que "Instalar app", y para
 * encontrar algo hay que leerlo todo. Una lista de destinos se recorre con la
 * vista y se entra a lo que se buscaba.
 *
 * La línea de abajo no es decoración: dice **cuándo** se usa cada cosa, que es
 * lo que un docente que no armó la app no tiene cómo saber.
 */
export interface Destino {
  href: string;
  titulo: string;
  descripcion: string;
  /** Marca lo que no tiene vuelta atrás. */
  peligro?: boolean;
}

export function ListaDestinos({ destinos }: { destinos: Destino[] }) {
  return (
    <ul className="border rounded-lg divide-y overflow-hidden bg-white">
      {destinos.map(d => (
        <li key={d.href}>
          <Link
            href={d.href}
            className={`flex items-center gap-3 px-4 py-3 min-w-0
                        hover:bg-neutral-50 active:bg-neutral-100 transition-colors
                        ${d.peligro ? 'text-red-800' : ''}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{d.titulo}</span>
              <span className={`block text-[12px] ${d.peligro ? 'text-red-700' : 'text-neutral-500'}`}>
                {d.descripcion}
              </span>
            </span>
            <svg
              viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              className="shrink-0 text-neutral-400"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Encabezado común de las páginas de segundo nivel, con la vuelta atrás. */
export function CabeceraInterna({ volverA, volverTexto, titulo, descripcion }: {
  volverA: string;
  volverTexto: string;
  titulo: string;
  descripcion?: string;
}) {
  return (
    <header className="min-w-0">
      <Link href={volverA} className="text-sm text-neutral-500 hover:underline">
        ← {volverTexto}
      </Link>
      <h1 className="text-2xl font-semibold mt-1">{titulo}</h1>
      {descripcion && <p className="text-sm text-neutral-500">{descripcion}</p>}
    </header>
  );
}
