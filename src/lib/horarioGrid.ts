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
 *
 * **Ser descanso es de la franja, no de lo que le caiga adentro.** Antes la
 * franja era descanso solo si TODO lo que había en ella lo era, así que apenas
 * se ponía una actividad en el descanso la fila pasaba a contar como hora de
 * clase: las 7 horas se volvían 8 y la séptima se corría a la octava. Ahora la
 * declara un bloque `descanso` y nada de lo que se agregue encima se la quita.
 */

export const DAY_TYPES: DayType[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'FIJO'];

export interface HorarioSlot {
  key: string;                          // 'HH:mm-HH:mm'
  startTime: string;
  endTime: string;
  minutes: number;
  /**
   * Lo que va en las celdas de cada día: clases y eventos. Los descansos no
   * están acá porque no son de un día suelto sino de la franja entera; van en
   * `breakBlocks` y se dibujan una sola vez, en el rótulo de la fila.
   */
  byDay: Map<DayType, ScheduleBlock[]>;
  /** La franja es descanso porque hay un bloque que lo declara. */
  isBreak: boolean;
  /** Los bloques 'descanso' que la declaran, en orden de tipo de día. */
  breakBlocks: ScheduleBlock[];
  /** Cómo se llama ('Descanso', 'Almuerzo'). */
  breakLabel?: string;
}

/** Un rato sin franja entre dos franjas: donde normalmente va un descanso. */
export interface HorarioGap {
  startTime: string;
  endTime: string;
  minutes: number;
  /** `key` de la franja anterior, para saber después de cuál va la fila. */
  afterKey: string;
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

export function isBreakBlock(b: ScheduleBlock): boolean {
  return b.kind === 'descanso';
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
        isBreak: false,
        breakBlocks: [],
      };
      bySlot.set(key, slot);
    }

    if (isBreakBlock(b)) {
      slot.isBreak = true;
      slot.breakBlocks.push(b);
      if (!slot.breakLabel) slot.breakLabel = b.title?.trim() || undefined;
      continue;
    }

    const list = slot.byDay.get(b.dayType) ?? [];
    list.push(b);
    slot.byDay.set(b.dayType, list);
  }

  for (const slot of bySlot.values()) {
    slot.breakBlocks.sort(
      (a, b) => DAY_TYPES.indexOf(a.dayType) - DAY_TYPES.indexOf(b.dayType),
    );
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
 *
 * Con `isBreak` declarado por la propia franja, poner una reunión o un
 * reemplazo dentro del descanso ya no le corre el número a nadie.
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

/**
 * Los ratos que quedan libres entre franja y franja.
 *
 * Es donde va el descanso: la app los ofrece para crear la franja de una vez,
 * en vez de que haya que teclear las horas y arriesgarse a no calzar con las
 * de al lado.
 */
export function gapsBetween(slots: HorarioSlot[]): HorarioGap[] {
  const out: HorarioGap[] = [];
  for (let i = 1; i < slots.length; i++) {
    const prev = slots[i - 1], next = slots[i];
    const minutes = minutesBetween(prev.endTime, next.startTime);
    if (minutes <= 0) continue;            // pegadas o solapadas: no hay hueco
    out.push({ startTime: prev.endTime, endTime: next.startTime, minutes, afterKey: prev.key });
  }
  return out;
}
