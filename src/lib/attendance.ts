/**
 * Estados de asistencia y su traducción al formato de `asistencia-autofill`
 * (planilla-v2).
 *
 * La app guarda dos banderas por marca —¿hay falla? ¿está justificada?— pero
 * tanto la UI como Classroom Live razonan en términos de un solo estado de tres
 * (o cuatro, contando falla y retardo por separado). Este módulo es la única
 * traducción entre ambas representaciones, para que el par (flag, justificada)
 * no se interprete a mano en cada componente.
 */

import type { CycleData, SessionData } from '@/types';

/** Qué se está marcando. */
export type MarkKind = 'F' | 'R';

/** Estado visible de una marca. */
export type MarkState = 'none' | 'injustificada' | 'justificada';

/** Nombre de la bandera de justificación que acompaña a cada marca. */
const JUST_FIELD = { F: 'Fj', R: 'Rj' } as const;

export function justFieldOf(kind: MarkKind): 'Fj' | 'Rj' {
  return JUST_FIELD[kind];
}

/** Estado a partir del par de banderas. `undefined` en la justificación = injustificada. */
export function markState(on?: boolean, justified?: boolean): MarkState {
  if (!on) return 'none';
  return justified ? 'justificada' : 'injustificada';
}

/** Lee el estado de una marca en un ciclo. */
export function cycleMarkState(c: CycleData | undefined, kind: MarkKind): MarkState {
  if (!c) return 'none';
  return markState(c[kind], c[JUST_FIELD[kind]]);
}

/** Lee el estado de una marca en una sesión de 11°. */
export function sessionMarkState(s: SessionData | undefined, kind: MarkKind): MarkState {
  if (!s) return 'none';
  return markState(s[kind], s[JUST_FIELD[kind]]);
}

/**
 * Ciclo de la UI al hacer click: sin marca → injustificada → justificada → sin marca.
 *
 * El orden no es arbitrario: lo común es marcar una falla del día (injustificada)
 * y solo después, cuando llega la excusa, subirla a justificada. Poner
 * injustificada primero deja el caso frecuente a un solo click.
 */
export function nextMarkState(current: MarkState): MarkState {
  if (current === 'none') return 'injustificada';
  if (current === 'injustificada') return 'justificada';
  return 'none';
}

/**
 * `tipo` que espera `asistencia-autofill`.
 *
 * Ojo con la concordancia de género en los literales: la plataforma usa
 * `ausencia_justificada` (femenino) pero `retardo_justificado` (masculino).
 */
const AUTOFILL_TIPO = {
  F: {
    injustificada: 'ausencia_injustificada',
    justificada: 'ausencia_justificada',
  },
  R: {
    injustificada: 'retardo_injustificado',
    justificada: 'retardo_justificado',
  },
} as const;

export type AutofillTipo =
  | 'ausencia_injustificada' | 'ausencia_justificada'
  | 'retardo_injustificado' | 'retardo_justificado';

/** null cuando no hay nada que reportar (la plataforma asume presente). */
export function autofillTipo(kind: MarkKind, state: MarkState): AutofillTipo | null {
  if (state === 'none') return null;
  return AUTOFILL_TIPO[kind][state];
}

/** Etiqueta corta para la grilla: '·', 'F', 'FJ'. */
export function markLabel(kind: MarkKind, state: MarkState): string {
  if (state === 'none') return '·';
  return state === 'justificada' ? `${kind}J` : kind;
}

/** Texto para tooltips y para el changeLog. */
export function markDescription(kind: MarkKind, state: MarkState): string {
  const noun = kind === 'F' ? 'Falla' : 'Retardo';
  if (state === 'none') return `Sin ${noun.toLowerCase()}`;
  // 'Falla justificada' / 'Retardo justificado'
  const adj = kind === 'F'
    ? (state === 'justificada' ? 'justificada' : 'injustificada')
    : (state === 'justificada' ? 'justificado' : 'injustificado');
  return `${noun} ${adj}`;
}

/**
 * Consolida las sesiones de 11° en el estado del ciclo.
 *
 * Regla: el ciclo queda justificado solo si TODAS las sesiones marcadas lo
 * están. Una sesión sin justificar basta para que el ciclo cuente en contra —
 * es la lectura conservadora, y es la que importa para las consecuencias.
 */
export function consolidateSessions(
  sessions: (SessionData | undefined)[],
  kind: MarkKind,
): { on: boolean; justified: boolean } {
  const marked = sessions.filter(s => s?.[kind]);
  if (marked.length === 0) return { on: false, justified: false };
  return { on: true, justified: marked.every(s => !!s![JUST_FIELD[kind]]) };
}
