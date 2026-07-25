/**
 * Motor de días académicos GLA.
 *
 * Reglas:
 * - Viernes lectivo → tipo 'FIJO'.
 * - Cualquier otro día lectivo (lun–jue) → siguiente en rotación D1..D5.
 * - Sábado y domingo → 'weekend' (sin tipo).
 * - Festivos y días cancelados → 'skip' (no consumen rotación).
 * - Override manual en CalendarDay → fuerza tipo de día para esa fecha.
 *   Si el override es numérico, la rotación se posiciona justo después.
 */

import type { DayType, CalendarDay, ScheduleBlock } from '@/types';
import { holidaysForYear } from './holidays-co';

const NUM_SEQ: DayType[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

export type DateStatus = DayType | 'weekend' | 'skip';

/** 'YYYY-MM-DD' → Date UTC 00:00. */
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date → 'YYYY-MM-DD' en UTC. */
export function formatIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO local de hoy (usa zona horaria del dispositivo). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calcula el tipo de día para todas las fechas entre `startDate` y `endDate` (inclusive).
 *
 * @param startDate      ISO del primer día lectivo del año escolar.
 * @param initialDayType Tipo asignado al startDate (default 'D1').
 * @param endDate        ISO hasta donde calcular.
 * @param customDays     Overrides / festivos / cancelaciones cargados de la DB.
 * @param includeHolidaysCo Si true, agrega festivos oficiales del año de startDate.
 */
export function computeDayTypes(
  startDate: string,
  initialDayType: DayType,
  endDate: string,
  customDays: CalendarDay[] = [],
  includeHolidaysCo = true,
): Map<string, DateStatus> {
  const result = new Map<string, DateStatus>();

  // Construir set de festivos/cancelados y map de overrides
  const skipDates = new Set<string>();
  const overrides = new Map<string, DayType>();

  if (includeHolidaysCo) {
    const yStart = parseIso(startDate).getUTCFullYear();
    const yEnd = parseIso(endDate).getUTCFullYear();
    for (let y = yStart; y <= yEnd; y++) {
      for (const h of holidaysForYear(y)) skipDates.add(h.date);
    }
  }

  for (const cd of customDays) {
    if (cd.status === 'festivo' || cd.status === 'cancelado') {
      skipDates.add(cd.date);
    }
    if (cd.overrideDayType) {
      overrides.set(cd.date, cd.overrideDayType);
      // Un override manual no puede quedar oculto por festivo previo
      skipDates.delete(cd.date);
    }
  }

  // idx apunta al siguiente numérico a asignar; empieza en initialDayType.
  let idx = Math.max(0, NUM_SEQ.indexOf(initialDayType));
  const cursor = parseIso(startDate);
  const end = parseIso(endDate);

  while (cursor <= end) {
    const isoDate = formatIso(cursor);
    const wd = cursor.getUTCDay();

    if (wd === 0 || wd === 6) {
      result.set(isoDate, 'weekend');
    } else if (overrides.has(isoDate)) {
      const forced = overrides.get(isoDate)!;
      result.set(isoDate, forced);
      if (forced !== 'FIJO') {
        idx = (NUM_SEQ.indexOf(forced) + 1) % NUM_SEQ.length;
      }
    } else if (skipDates.has(isoDate)) {
      result.set(isoDate, 'skip');
    } else if (wd === 5) {
      result.set(isoDate, 'FIJO');
    } else {
      result.set(isoDate, NUM_SEQ[idx]);
      idx = (idx + 1) % NUM_SEQ.length;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

/** Obtiene el tipo de día de una fecha específica dado un rango ya calculado. */
export function dayTypeOf(
  targetIso: string,
  seq: Map<string, DateStatus>,
): DateStatus | undefined {
  return seq.get(targetIso);
}

/** Filtra el horario para un tipo de día y lo ordena por bloque. */
export function classesForDayType(
  dayType: DayType,
  schedule: ScheduleBlock[],
): ScheduleBlock[] {
  return schedule
    .filter(b => b.dayType === dayType)
    .sort((a, b) => a.block - b.block);
}

/** Etiqueta legible del tipo de día. */
export function dayTypeLabel(dt: DateStatus | undefined): string {
  if (!dt) return '—';
  if (dt === 'weekend') return 'Fin de semana';
  if (dt === 'skip') return 'No lectivo';
  if (dt === 'FIJO') return 'Día Fijo';
  return `Día ${dt.slice(1)}`;
}

/**
 * Para un curso dado, devuelve la lista de fechas ISO en que ese curso se
 * dictó (o se dictará) según el horario y la secuencia. Ciclo N corresponde
 * al índice N-1 de este arreglo.
 */
export function courseSessionDates(
  courseCode: string,
  sequence: Map<string, DateStatus>,
  schedule: ScheduleBlock[],
): string[] {
  // Precomputar en qué tipos de día aparece el curso
  const dayTypesWithCourse = new Set<DayType>(
    schedule.filter(b => b.courseCode === courseCode).map(b => b.dayType),
  );
  const dates: string[] = [];
  // Iterar la secuencia en orden cronológico
  const sortedIso = [...sequence.keys()].sort();
  for (const iso of sortedIso) {
    const s = sequence.get(iso);
    if (s === 'weekend' || s === 'skip' || !s) continue;
    if (dayTypesWithCourse.has(s as DayType)) dates.push(iso);
  }
  return dates;
}

/**
 * Devuelve el número de ciclo (1..cyclesPerTrim) al que corresponde `targetIso`
 * dentro del rango del trimestre. null si no hay clase de ese curso ese día.
 *
 * `sessionsPerCiclo` = 1 para 8°–10° (una sesión = un ciclo), = 2 para 11°
 * (los ciclos consumen dos sesiones cada uno, S1 y S2).
 */
export function cicloForDate(
  targetIso: string,
  sessionDates: string[],
  cyclesPerTrim = 9,
  sessionsPerCiclo = 1,
): number | null {
  const idx = sessionDates.indexOf(targetIso);
  if (idx < 0) return null;
  const n = Math.ceil((idx + 1) / sessionsPerCiclo);
  return n > cyclesPerTrim ? null : n;
}

/**
 * Ciclo actual = ciclo asociado a la sesión más reciente ≤ `todayIso`.
 * 8°–10°: 1 sesión = 1 ciclo. 11°: 2 sesiones consecutivas = 1 ciclo.
 */
export function currentCicloForCourse(
  todayIso: string,
  sessionDates: string[],
  cyclesPerTrim = 9,
  sessionsPerCiclo = 1,
): number {
  let count = 0;
  for (const iso of sessionDates) {
    if (iso <= todayIso) count++;
    else break;
  }
  if (count === 0) return 0;
  const ciclo = Math.ceil(count / sessionsPerCiclo);
  return Math.min(ciclo, cyclesPerTrim);
}

/**
 * Devuelve la sesión dentro del ciclo (1 o 2 para 11°) a la que corresponde
 * `targetIso`, o null si sessionsPerCiclo === 1 o la fecha no es una sesión.
 */
export function sessionInCiclo(
  targetIso: string,
  sessionDates: string[],
  sessionsPerCiclo = 1,
): 1 | 2 | null {
  if (sessionsPerCiclo === 1) return null;
  const idx = sessionDates.indexOf(targetIso);
  if (idx < 0) return null;
  const pos = (idx % sessionsPerCiclo) + 1;
  return pos === 1 ? 1 : 2;
}
