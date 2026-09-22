import type { Course, CycleData, SessionData } from '@/types';

/**
 * Cuántas veces se marca lista en un ciclo, y dónde vive cada marca.
 *
 * No lo decide el grado. El supuesto viejo —"dos si es 11°, una si no"— era
 * falso en las dos direcciones, y el horario tampoco alcanza como verdad:
 *
 * - Un curso del **Día Fijo** tiene una clase en casi todos los ciclos y dos
 *   en los que les caen dos viernes, porque el viernes no consume rotación.
 * - Una **clase en bloque** son dos franjas seguidas del mismo día: se marca
 *   lista UNA vez. Eso ya sale bien, porque las sesiones se cuentan por fecha
 *   y no por bloque.
 * - Hay **materias que ven al mismo curso varias veces por ciclo**; no son dos
 *   ni son una.
 *
 * Por eso el horario propone y el docente dispone: `sessionsByCiclo` guarda
 * solo lo que él corrigió y el resto sale de las fechas de clase.
 */

/** Lo que propone el horario: una por cada fecha de clase, mínimo una. */
export function scheduledSessions(sessionDates: string[]): number {
  return Math.max(1, sessionDates.length);
}

/** Cuántas sesiones tiene ese ciclo: lo corregido si lo hay, si no el horario. */
export function sessionsInCiclo(
  course: Pick<Course, 'sessionsByCiclo'>,
  ciclo: number,
  sessionDates: string[],
): number {
  const propio = course.sessionsByCiclo?.[ciclo];
  if (propio != null && propio >= 1) return Math.floor(propio);
  return scheduledSessions(sessionDates);
}

/** ¿El docente cambió lo que decía el horario para este ciclo? */
export function isOverridden(
  course: Pick<Course, 'sessionsByCiclo'>,
  ciclo: number,
  sessionDates: string[],
): boolean {
  const propio = course.sessionsByCiclo?.[ciclo];
  return propio != null && propio !== scheduledSessions(sessionDates);
}

/**
 * Las sesiones guardadas de un ciclo, ya normalizadas.
 *
 * Lee `S1`/`S2` de las filas viejas para no perder nada de lo ya marcado. Lo
 * que se escribe de ahora en adelante va en `sessions`.
 */
export function sessionsOf(c: CycleData | undefined): SessionData[] {
  if (!c) return [];
  if (c.sessions) return c.sessions;
  const viejas = [c.S1, c.S2].filter(Boolean) as SessionData[];
  return viejas;
}

/** La sesión n (1-based) de un ciclo, o undefined si no está marcada. */
export function sessionAt(c: CycleData | undefined, n: number): SessionData | undefined {
  return sessionsOf(c)[n - 1];
}

/** Una sesión en blanco, para cuando se añade una. */
export function emptySession(): SessionData {
  return { F: false, R: false, N: 0 };
}

/**
 * Escribe la sesión n de un ciclo y devuelve el arreglo completo.
 *
 * Rellena los huecos con sesiones vacías: marcar la 3 sin haber tocado la 2 no
 * puede dejar el arreglo corrido, porque el índice ES el número de sesión.
 */
export function withSession(
  c: CycleData | undefined,
  n: number,
  patch: SessionData,
): SessionData[] {
  const out = [...sessionsOf(c)];
  while (out.length < n) out.push(emptySession());
  out[n - 1] = patch;
  return out;
}

/**
 * Consolida las sesiones en las banderas del ciclo.
 *
 * Una falla en cualquier sesión es falla del ciclo. Se justifica solo si TODAS
 * las que la tienen están justificadas: basta una sin justificar para que el
 * ciclo cuente en contra.
 */
export function consolidate(sessions: SessionData[]): Pick<CycleData, 'F' | 'R' | 'Fj' | 'Rj'> {
  const conF = sessions.filter(s => s.F);
  const conR = sessions.filter(s => s.R);
  return {
    F: conF.length > 0,
    R: conR.length > 0,
    Fj: conF.length > 0 ? conF.every(s => !!s.Fj) : undefined,
    Rj: conR.length > 0 ? conR.every(s => !!s.Rj) : undefined,
  };
}
