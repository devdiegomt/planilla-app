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
 * **Las franjas las definen las clases y los descansos, no los eventos.** Un
 * evento con horas propias —empieza a mitad de una hora, termina en la
 * siguiente— creaba su propia fila y corría la numeración: la 4ª pasaba a 5ª y
 * así hasta el final. Ahora un evento se mete en la franja con la que más se
 * cruza, y solo crea fila si no se cruza con ninguna.
 *
 * **Y las horas se numeran por dónde hay clase**, no por "toda fila que no sea
 * descanso". Es la defensa de fondo: cualquier bloque raro que llegue a hacer
 * fila suya no puede robarle el número a una hora de clase.
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
  /** Hay al menos una clase en ella: es lo que la hace una hora numerada. */
  hasClass: boolean;
  /** Los bloques 'descanso' que la declaran, en orden de tipo de día. */
  breakBlocks: ScheduleBlock[];
  /** Cómo se llama ('Descanso', 'Almuerzo'). */
  breakLabel?: string;
  /** La hora que parte el descanso en dos turnos, si los tiene. */
  turnSplit?: string;
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

/**
 * El rato que dura el acompañamiento de ese día.
 *
 * El acompañamiento no dura todo el descanso: hay dos turnos, y a cada docente
 * le toca uno. La hora que los parte es de la franja (`turnSplit`) y el turno
 * es de cada día, así que con las dos cosas sale el rango real.
 *
 * Devuelve null si la franja no tiene turnos, si ese día no tiene turno
 * asignado, o si la hora de corte quedó fuera del descanso — ahí partirla no
 * significaría nada y es mejor no inventar un rango.
 */
export function turnRange(
  franja: { startTime: string; endTime: string; turnSplit?: string },
  turn: 1 | 2 | undefined,
): { startTime: string; endTime: string } | null {
  const corte = franja.turnSplit;
  if (!turn || !corte) return null;
  if (corte <= franja.startTime || corte >= franja.endTime) return null;
  return turn === 1
    ? { startTime: franja.startTime, endTime: corte }
    : { startTime: corte, endTime: franja.endTime };
}

/** Minutos en que dos rangos horarios se pisan. 0 si no se tocan. */
export function overlapMinutes(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): number {
  const ini = a.startTime > b.startTime ? a.startTime : b.startTime;
  const fin = a.endTime < b.endTime ? a.endTime : b.endTime;
  return minutesBetween(ini, fin);
}

export function buildHorarioSlots(schedule: ScheduleBlock[]): HorarioSlot[] {
  const bySlot = new Map<string, HorarioSlot>();

  const nueva = (b: ScheduleBlock): HorarioSlot => {
    const key = `${b.startTime}-${b.endTime}`;
    const slot: HorarioSlot = {
      key,
      startTime: b.startTime,
      endTime: b.endTime,
      minutes: minutesBetween(b.startTime, b.endTime),
      byDay: new Map(),
      isBreak: false,
      hasClass: false,
      breakBlocks: [],
    };
    bySlot.set(key, slot);
    return slot;
  };

  const meter = (slot: HorarioSlot, b: ScheduleBlock) => {
    const list = slot.byDay.get(b.dayType) ?? [];
    list.push(b);
    slot.byDay.set(b.dayType, list);
  };

  // --- Pase 1: las clases y los descansos definen las filas ---
  const eventos: ScheduleBlock[] = [];
  for (const b of schedule) {
    const kind = b.kind ?? 'clase';
    if (kind === 'evento') { eventos.push(b); continue; }

    const slot = bySlot.get(`${b.startTime}-${b.endTime}`) ?? nueva(b);
    if (kind === 'descanso') {
      slot.isBreak = true;
      slot.breakBlocks.push(b);
      if (!slot.breakLabel) slot.breakLabel = b.title?.trim() || undefined;
      if (!slot.turnSplit) slot.turnSplit = b.turnSplit || undefined;
    } else {
      slot.hasClass = true;
      meter(slot, b);
    }
  }

  // --- Pase 2: cada evento cae en la franja con la que más se cruza ---
  // Se recalcula la lista en cada vuelta a propósito: si un evento tuvo que
  // abrir su propia fila, el siguiente que caiga ahí se le suma en vez de
  // abrir otra igual.
  for (const b of eventos) {
    let destino: HorarioSlot | undefined;
    let mayor = 0;
    for (const s of bySlot.values()) {
      const cruce = overlapMinutes(s, b);
      if (cruce > mayor) { mayor = cruce; destino = s; }
    }
    meter(destino ?? nueva(b), b);
  }

  for (const slot of bySlot.values()) {
    slot.breakBlocks.sort(
      (a, b) => DAY_TYPES.indexOf(a.dayType) - DAY_TYPES.indexOf(b.dayType),
    );
    // Dentro de una celda, en orden de reloj: un evento que se sumó a la
    // franja puede empezar después de la clase que ya estaba.
    for (const list of slot.byDay.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
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
 * Numera las franjas donde hay clase, como en el horario del colegio: los
 * descansos van entre horas y no consumen número.
 *
 * Se numera por dónde HAY CLASE y no por "toda fila que no sea descanso".
 * Con lo segundo, cualquier fila rara —un evento con horas propias, un bloque
 * mal puesto— se colaba en la cuenta y corría todo lo que venía después: la 4ª
 * hora pasaba a 5ª y la 7ª terminaba de 8ª. Numerando por las clases, lo que
 * se agregue encima no puede robarle el número a nadie.
 */
export function hourNumbers(slots: HorarioSlot[]): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const s of slots) {
    if (!s.hasClass) continue;
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
