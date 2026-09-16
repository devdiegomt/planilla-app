import type { DayType, ScheduleBlock } from '@/types';
import { isClassBlock } from './schedule';

/**
 * Arma la rejilla del horario: filas = franjas horarias, columnas = tipos de día.
 *
 * En el horario real del colegio la franja es la misma para todos los tipos de
 * día ("1 HORA 8:05–8:50" vale igual para el Día 1 que para el Día Fijo), así
 * que las filas se derivan agrupando los bloques por inicio–fin. Derivarlas en
 * vez de guardarlas en su propia tabla evita una migración y hace que el
 * horario que ya está cargado se vea como rejilla sin tocar un dato.
 *
 * Si dos tipos de día tienen horas casi iguales (8:05 y 8:06) salen dos filas
 * distintas. Es a propósito: se ve el desajuste y se corrige, en vez de que la
 * rejilla lo esconda agrupando por aproximación.
 */

export const DAY_TYPES: DayType[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'FIJO'];

export interface HorarioSlot {
  key: string;                          // 'HH:mm-HH:mm'
  startTime: string;
  endTime: string;
  minutes: number;
  byDay: Map<DayType, ScheduleBlock[]>; // varios si hay dos cosas a la misma hora
  /** La franja es descanso si todo lo que cae en ella lo es. */
  isBreak: boolean;
}

/** Minutos entre dos 'HH:mm'. 0 si alguna no se puede leer o el fin es antes. */
export function minutesBetween(start: string, end: string): number {
  const toMin = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };
  const a = toMin(start), b = toMin(end);
  if (a == null || b == null) return 0;
  return Math.max(0, b - a);
}

export function buildHorarioSlots(schedule: ScheduleBlock[]): HorarioSlot[] {
  const bySlot = new Map<string, HorarioSlot>();

  for (const b of schedule) {
    const key = `${b.startTime}-${b.endTime}`;
    let slot = bySlot.get(key);
    if (!slot) {
      slot = {
        key,
        startTime: b.startTime,
        endTime: b.endTime,
        minutes: minutesBetween(b.startTime, b.endTime),
        byDay: new Map(),
        isBreak: true,
      };
      bySlot.set(key, slot);
    }
    const list = slot.byDay.get(b.dayType) ?? [];
    list.push(b);
    slot.byDay.set(b.dayType, list);
    if ((b.kind ?? 'clase') !== 'descanso') slot.isBreak = false;
  }

  return [...bySlot.values()].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime),
  );
}

/** Rótulo de un bloque: el curso si es clase, el título si no. */
export function blockLabel(b: ScheduleBlock): string {
  if (isClassBlock(b)) return b.courseCode || '—';
  return b.title?.trim() || '—';
}

/**
 * Numera solo las franjas de clase, como en el horario del colegio: los
 * descansos van entre horas y no consumen número.
 */
export function hourNumbers(slots: HorarioSlot[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const s of slots) {
    if (s.isBreak) continue;
    out.set(s.key, ++n);
  }
  return out;
}
