'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { CURSOS_ORDER } from '@/lib/constants';

interface Props {
  /** Código del curso actual. */
  code: string;
  /** Ciclo abierto, para no perderlo al cambiar de curso. */
  ciclo?: number;
}

/**
 * Flechas para recorrer los cursos en el orden del colegio.
 *
 * El orden sale de `CURSOS_ORDER` (801…806, 901…905, 1001…1004, 1101…1104) y
 * da la vuelta: del último se pasa al primero. Solo entran los cursos que
 * existen en la base — navegar a uno sin importar dejaría la página cargando
 * para siempre.
 *
 * El `?ciclo` se conserva: revisar el mismo ciclo curso por curso es
 * justamente el recorrido que estas flechas ahorran.
 */
export function CourseNav({ code, ciclo }: Props) {
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];

  const { prev, next, pos, total } = useMemo(() => {
    const orden = new Map(CURSOS_ORDER.map((c, i) => [String(c), i]));
    const existentes = courses
      .map(c => c.code)
      // Un curso fuera de CURSOS_ORDER va al final, sin romper el recorrido.
      .sort((a, b) => (orden.get(a) ?? 999) - (orden.get(b) ?? 999));

    const i = existentes.indexOf(code);
    if (i < 0 || existentes.length < 2) {
      return { prev: null, next: null, pos: 0, total: existentes.length };
    }
    return {
      prev: existentes[(i - 1 + existentes.length) % existentes.length],
      next: existentes[(i + 1) % existentes.length],
      pos: i + 1,
      total: existentes.length,
    };
  }, [courses, code]);

  const href = (c: string) => (ciclo ? `/curso/${c}?ciclo=${ciclo}` : `/curso/${c}`);

  const boton = 'w-9 h-9 flex items-center justify-center rounded-md border bg-white '
    + 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 disabled:opacity-30';

  if (!prev || !next) return null;

  return (
    <div className="flex items-center gap-1.5">
      <Link href={href(prev)} className={boton} aria-label={`Curso anterior: ${prev}`} title={`← ${prev}`}>
        ←
      </Link>
      <span className="text-xs text-neutral-400 tabular-nums w-10 text-center">
        {pos}/{total}
      </span>
      <Link href={href(next)} className={boton} aria-label={`Curso siguiente: ${next}`} title={`${next} →`}>
        →
      </Link>
    </div>
  );
}
