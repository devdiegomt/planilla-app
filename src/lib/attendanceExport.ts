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
  computeDayTypes, todayIso, classesForDayType,
} from './schedule';
import { buildCycleContext, sessionDatesOf } from './cycles';
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

/**
 * El archivo completo, tal como lo espera el userscript.
 *
 * **Sin `fecha` a propósito.** El campo es opcional en `asistencia-autofill` y
 * omitirlo es lo seguro: la plataforma ya trae la fecha de hoy, que es la
 * correcta cuando registrás la clase del día. Una fecha arrastrada en el JSON
 * dejaría la asistencia en otro día sin que nada lo delate.
 *
 * A cambio, el archivo solo sirve **el mismo día de la clase**. Por eso la app
 * sigue resolviendo la fecha de la sesión: ya no como dato del payload, sino
 * como comprobación de que el ciclo que estás exportando es el de hoy
 * (`AttendanceExportResult.isToday`).
 */
export interface AutofillPayload {
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
  /**
   * Requerido cuando el curso tiene más de una clase en ese ciclo: siempre en
   * 11° (dos tipos de día), y en los cursos del viernes cuando al ciclo le
   * caen dos viernes.
   */
  session?: 1 | 2;
}

export interface AttendanceExportResult {
  payload: AutofillPayload;
  filename: string;
  /** Activos con marca pero sin COD_ALUM: no se pueden reportar. */
  sinCodAlum: string[];
  /** Fecha real de la sesión. No viaja en el payload; sirve para verificar. */
  fechaIso: string;
  /**
   * `false` si la sesión de este ciclo no es hoy. El autofill usaría la fecha
   * de la plataforma (hoy) y la asistencia quedaría en el día equivocado.
   */
  isToday: boolean;
  dayType: DayType;
}

/** Error de negocio: se muestra al usuario, no es un bug. */
export class AttendanceExportError extends Error {}

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

  const courseBlocks = schedule.filter(b => b.courseCode === course.code);
  if (courseBlocks.length === 0) {
    throw new AttendanceExportError(
      `El curso ${course.code} no tiene bloques en el horario. Configúralo en /horario.`,
    );
  }

  // Horizonte amplio: 9 ciclos nunca pasan de ~5 meses, y el contexto ya
  // recorta por trimestre internamente.
  const seq = computeDayTypes(
    yearConfig.startDate, yearConfig.initialDayType,
    `${yearConfig.year}-12-31`, calendarDays, true,
  );
  const ctx = buildCycleContext(seq, schedule, [course], yearConfig);

  // Cuántas clases tiene ESTE curso en ESTE ciclo: puede ser 1, o 2 cuando el
  // ciclo trae dos viernes o el curso ocupa dos tipos de día (11°).
  const fechas = sessionDatesOf(ctx, course.code, ciclo);
  if (fechas.length === 0) {
    throw new AttendanceExportError(
      `El ciclo ${ciclo} no tiene ninguna clase de ${course.code} en el trimestre ` +
      `${course.trimestre}. Revisa el inicio del trimestre y las semanas sin clase ` +
      'en /calendario.',
    );
  }
  if (fechas.length > 1 && session == null) {
    throw new AttendanceExportError(
      `${course.code} tiene ${fechas.length} clases en el ciclo ${ciclo} ` +
      `(${fechas.join(' y ')}). Indica cuál sesión quieres exportar.`,
    );
  }
  const idxSesion = (session ?? 1) - 1;
  const fechaIso = fechas[idxSesion];
  if (!fechaIso) {
    throw new AttendanceExportError(
      `${course.code} solo tiene ${fechas.length} clase(s) en el ciclo ${ciclo}; ` +
      `no existe la sesión ${session}.`,
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

    // Con una sola clase en el ciclo el F/R vive en el ciclo; con dos, cada
    // clase tiene su propia marca (S1/S2) porque la plataforma las registra
    // por fecha.
    const porSesion = fechas.length > 1;
    const sd = porSesion ? (idxSesion === 0 ? c.S1 : c.S2) : undefined;
    const fState = porSesion ? sessionMarkState(sd, 'F') : cycleMarkState(c, 'F');
    const rState = porSesion ? sessionMarkState(sd, 'R') : cycleMarkState(c, 'R');

    // Una ausencia absorbe al retardo: no se puede llegar tarde a una clase a
    // la que no se asistió, y la plataforma acepta un solo tipo por estudiante.
    const tipo = autofillTipo('F', fState) ?? autofillTipo('R', rState);
    if (!tipo) continue;

    if (!s.codAlum) { sinCodAlum.push(s.nombre); continue; }
    marcas.push({ cod_alum: s.codAlum, tipo });
  }

  const materia = GRADE_META[course.grade]?.materia ?? '';
  const payload: AutofillPayload = {
    hora,
    curso: course.code,
    asignatura: materia.toUpperCase(),
    marcas,
  };

  const sufijo = fechas.length > 1 ? `-S${session ?? 1}` : '';
  return {
    payload,
    filename: `asistencia-${course.code}-C${ciclo}${sufijo}-${fechaIso}.json`,
    sinCodAlum,
    fechaIso,
    isToday: fechaIso === todayIso(),
    dayType,
  };
}
