'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { ConSlots } from './constants';

/**
 * Las materias del docente, que es de donde salen los pesos de las subnotas.
 *
 * Mientras Dexie responde devuelve `undefined`, y `slotsFor` cae en los pesos
 * fijos — que es exactamente lo que la app hacía siempre antes de esto, así
 * que ese instante no muestra nada peor que lo de ayer. En cuanto llega la
 * configuración se vuelve a dibujar con los pesos del docente.
 */
export function useSubjects(year = new Date().getFullYear()): ConSlots[] | undefined {
  return useLiveQuery(
    async () => (await db.yearConfig.where('year').equals(year).first())?.subjects,
    [year],
  );
}
