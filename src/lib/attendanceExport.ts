/**
 * Arma el JSON que consume `asistencia-autofill` (planilla-v2).
 *
 * Esta es la pieza que justifica que la app esté en medio de los dos
 * userscripts: el extractor da los `cod_alum` y el autofill sabe llenar la
 * página, pero ninguno sabe **en qué fecha y en qué bloque** cae el ciclo 3 de
 * 801. Eso solo lo sabe el motor de días D1–D5 junto con el horario.
 *
 * Lógica pura: no toca Dexie ni el DOM, así que se puede ejercitar con
 * escenarios controlados.
 */

import {
  computeDayTypes, formatIso, parseIso,
  courseSessionDates, classesForDayType,
} from './schedule';
import { autofillTipo, cycleMarkState, sessionMarkState, type AutofillTipo } from './attendance';
import { GRADE_META } from './constants';
import type {
  Course, Student, ScheduleBlock, CalendarDay, YearConfig, DayType,
} from '@/types';

/** Una marca en el formato del autofill. */
export interface AutofillMarca {
  cod_alum: string;
  tipo: AutofillTipo;
}

/** El archivo completo, tal como lo espera el userscript. */
export interface AutofillPayload {
  fecha: string;                      // 'DD/MM/AAAA'
  hora: number;                       // bloque dentro del día
  curso: string;                      // '801'
  asignatura: string;                 // en mayúsculas
  marcas: AutofillMarca[];
}

export interface AttendanceExportInput {
  course: Course;
  students: Student[];                // se filtran los retirados aquí
  schedule: ScheduleBlock[];
  calendarDays: CalendarDay[];
  yearConfig: YearConfig;
  ciclo: number;                      // 1..9
  session?: 1 | 2;                    // requerido en 11°
}

export interface AttendanceExportResult {
  payload: AutofillPayload;
  filename: string;
  /** Activos con marca pero sin COD_ALUM: no se pueden reportar. */
  sinCodAlum: string[];
  /** Fecha en ISO, para mostrarla legible en la UI. */
  fechaIso: string;
  dayType: DayType;
}

/** Error de negocio: se muestra al usuario, no es un bug. */
export class AttendanceExportError extends Error {}

/**
 * Ventana del trimestre al que pertenece el curso.
 *
 * Se usa `course.trimestre` y no "el trimestre de hoy": los datos del curso son
 * de SU trimestre, y exportar en agosto un ciclo del trimestre 2 debe seguir
 * resolviendo las fechas de ese trimestre.
 */
function trimWindow(cfg: YearConfig, trimestre: number): { start: string; end: string } {
  const starts = [cfg.trim1Start, cfg.trim2Start, cfg.trim3Start];
  const start = starts[trimestre - 1] || cfg.startDate;
  // El fin es el arranque del siguiente trimestre definido; si no hay (último),
  // se toma un horizonte amplio — 9 ciclos nunca pasan de ~5 meses.
  const nextDefined = starts.slice(trimestre).find((d): d is string => !!d);
  if (nextDefined) return { start, end: nextDefined };
  const d = parseIso(start);
  d.setUTCDate(d.getUTCDate() + 200);
  return { start, end: formatIso(d) };
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA', el formato que espera la plataforma. */
export function toFechaDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Construye el payload para un ciclo (y sesión, en 11°).
 *
 * Lanza `AttendanceExportError` con un mensaje accionable cuando falta
 * configuración o el ciclo todavía no tiene fecha.
 */
export function buildAttendanceExport(
  input: AttendanceExportInput,
): AttendanceExportResult {
  const { course, students, schedule, calendarDays, yearConfig, ciclo, session } = input;

  const isEleven = course.grade === 11;
  const sessionsPerCiclo = isEleven ? 2 : 1;
  if (isEleven && session == null) {
    throw new AttendanceExportError('En 11° hay que indicar la sesión (S1 o S2).');
  }

  const courseBlocks = schedule.filter(b => b.courseCode === course.code);
  if (courseBlocks.length === 0) {
    throw new AttendanceExportError(
      `El curso ${course.code} no tiene bloques en el horario. Configúralo en /horario.`,
    );
  }

  const { start, end } = trimWindow(yearConfig, course.trimestre);
  const seq = computeDayTypes(
    yearConfig.startDate, yearConfig.initialDayType, end, calendarDays, true,
  );
  // Recortar al trimestre: `courseSessionDates` numera las sesiones desde el
  // primer día del rango que reciba, así que el rango define qué es "ciclo 1".
  const trimSeq = new Map<string, ReturnType<typeof seq.get>>();
  for (const [iso, s] of seq) {
    if (iso >= start && iso <= end) trimSeq.set(iso, s);
  }

  const sessionDates = courseSessionDates(
    course.code,
    trimSeq as Map<string, DayType | 'weekend' | 'skip'>,
    schedule,
  );

  const idx = (ciclo - 1) * sessionsPerCiclo + ((session ?? 1) - 1);
  const fechaIso = sessionDates[idx];
  if (!fechaIso) {
    throw new AttendanceExportError(
      `El ciclo ${ciclo}${session ? ` · S${session}` : ''} no tiene fecha en el trimestre ` +
      `${course.trimestre}: solo hay ${sessionDates.length} sesiones de ${course.code}. ` +
      `Revisa el inicio del trimestre y los festivos en /calendario.`,
    );
  }

  const dayType = seq.get(fechaIso) as DayType;
  const blocksThatDay = classesForDayType(dayType, schedule)
    .filter(b => b.courseCode === course.code);
  if (blocksThatDay.length === 0) {
    // No debería pasar: la fecha salió de las sesiones del curso.
    throw new AttendanceExportError(
      `Inconsistencia: ${fechaIso} es ${dayType} pero ${course.code} no tiene bloque ese día.`,
    );
  }
  const hora = blocksThatDay[0].block;

  // Solo se reportan los que tienen algo que reportar: la plataforma asume
  // presente a quien no aparece en `marcas`.
  const marcas: AutofillMarca[] = [];
  const sinCodAlum: string[] = [];

  for (const s of students) {
    if (s.withdrawnAt) continue;
    const c = s.cycles.find(x => x.ciclo === ciclo);
    if (!c) continue;

    const fState = isEleven
      ? sessionMarkState(session === 1 ? c.S1 : c.S2, 'F')
      : cycleMarkState(c, 'F');
    const rState = isEleven
      ? sessionMarkState(session === 1 ? c.S1 : c.S2, 'R')
      : cycleMarkState(c, 'R');

    // Una ausencia absorbe al retardo: no se puede llegar tarde a una clase a
    // la que no se asistió, y la plataforma acepta un solo tipo por estudiante.
    const tipo = autofillTipo('F', fState) ?? autofillTipo('R', rState);
    if (!tipo) continue;

    if (!s.codAlum) { sinCodAlum.push(s.nombre); continue; }
    marcas.push({ cod_alum: s.codAlum, tipo });
  }

  const materia = GRADE_META[course.grade]?.materia ?? '';
  const payload: AutofillPayload = {
    fecha: toFechaDDMMYYYY(fechaIso),
    hora,
    curso: course.code,
    asignatura: materia.toUpperCase(),
    marcas,
  };

  const sufijo = session ? `-S${session}` : '';
  return {
    payload,
    filename: `asistencia-${course.code}-C${ciclo}${sufijo}-${fechaIso}.json`,
    sinCodAlum,
    fechaIso,
    dayType,
  };
}
