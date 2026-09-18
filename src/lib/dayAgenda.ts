import type { CalendarEvent, DayType, ScheduleBlock } from '@/types';
import { entriesForDayType, type DateStatus } from './schedule';

/**
 * El día completo: lo que se repite cada rotación y lo que pasa una sola vez.
 *
 * El horario (`ScheduleBlock`) va por tipo de día y se repite en cada vuelta
 * D1→D5. Un evento (`CalendarEvent`) va por fecha y no vuelve: la reunión de
 * proyecto de esta semana, un reemplazo de mañana. Mezclarlos acá —puro, sin
 * Dexie— es lo que deja que el inicio muestre el día de verdad y no solo la
 * parte fija.
 *
 * Lo temporal se vence solo: pasada su fecha (o su `endDate`) deja de salir,
 * sin que haya que acordarse de borrarlo.
 */

export type AgendaItem =
  | { type: 'block'; startTime: string; block: ScheduleBlock }
  | { type: 'event'; startTime: string; event: CalendarEvent };

export interface DayAgenda {
  /** Con hora, en orden de reloj: clases, eventos del horario y temporales. */
  timed: AgendaItem[];
  /** Sin hora: son del día entero y van aparte para no inventarles un lugar. */
  allDay: CalendarEvent[];
}

/** El último día en que el evento sigue vigente. */
export function eventLastDate(e: CalendarEvent): string {
  return e.endDate && e.endDate > e.date ? e.endDate : e.date;
}

/** ¿Este evento cae en esa fecha? Cuenta el rango completo, no solo el inicio. */
export function eventRunsOn(e: CalendarEvent, dateIso: string): boolean {
  return e.date <= dateIso && dateIso <= eventLastDate(e);
}

export function eventsOnDate(events: CalendarEvent[], dateIso: string): CalendarEvent[] {
  return events.filter(e => eventRunsOn(e, dateIso));
}

export function dayAgenda(
  dateIso: string,
  dayType: DayType,
  schedule: ScheduleBlock[],
  events: CalendarEvent[],
): DayAgenda {
  const timed: AgendaItem[] = entriesForDayType(dayType, schedule)
    .map(block => ({ type: 'block' as const, startTime: block.startTime, block }));

  const allDay: CalendarEvent[] = [];
  for (const event of eventsOnDate(events, dateIso)) {
    if (event.startTime) timed.push({ type: 'event', startTime: event.startTime, event });
    else allDay.push(event);
  }

  // Empate a la misma hora: primero la clase. Un reemplazo o una reunión que
  // cae encima de una clase se lee como lo que es, algo añadido a esa hora.
  timed.sort((a, b) =>
    a.startTime.localeCompare(b.startTime) ||
    (a.type === b.type ? 0 : a.type === 'block' ? -1 : 1));

  allDay.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  return { timed, allDay };
}

/**
 * Lo temporal que sigue vivo: lo de hoy y lo que viene en los próximos días.
 *
 * Lo que ya pasó no entra, que es lo que hace que la lista no haya que limpiarla.
 */
export function upcomingEvents(
  events: CalendarEvent[],
  fromIso: string,
  days = 14,
): CalendarEvent[] {
  const hasta = addDays(fromIso, days);
  return events
    .filter(e => eventLastDate(e) >= fromIso && e.date <= hasta)
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
      a.title.localeCompare(b.title, 'es'));
}

/** ISO + n días, en UTC para no arrastrar la zona horaria del dispositivo. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * La próxima fecha en que cae ese tipo de día.
 *
 * Es lo que deja añadir algo temporal desde el horario: se elige la celda del
 * D2 y la app ya sabe qué día del calendario es ese D2, en vez de hacer contar
 * la rotación a mano.
 */
export function nextDateOfDayType(
  dayType: DayType,
  seq: Map<string, DateStatus>,
  fromIso: string,
): string | null {
  for (const iso of [...seq.keys()].sort()) {
    if (iso < fromIso) continue;
    if (seq.get(iso) === dayType) return iso;
  }
  return null;
}
