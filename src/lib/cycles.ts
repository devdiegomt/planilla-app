/**
 * En qué ciclo va cada fecha, y qué sesión de ese ciclo le toca a cada curso.
 *
 * EL CICLO ES DE LA ROTACIÓN, NO DEL CURSO. Un ciclo es una vuelta completa
 * D1→D5 (cinco días numéricos). El día FIJO —el viernes— no consume rotación:
 * pertenece al ciclo que esté en curso.
 *
 * De ahí sale la consecuencia que no es obvia: como una vuelta D1→D5 abarca
 * seis o siete días de calendario, **a veces caen DOS viernes dentro del mismo
 * ciclo**. En el trimestre I de 2026 pasa en los ciclos 4 (27-feb y 6-mar) y 7
 * (27-mar y 10-abr).
 *
 * El modelo anterior contaba "la N-ésima sesión de este curso = ciclo N". Para
 * un curso que solo se dicta el viernes eso se desfasa un ciclo cada vez que un
 * ciclo tiene dos viernes, y a partir de la décima sesión devolvía `null`.
 * Verificado contra el cronograma del colegio: fallaba en 7 de los 9 viernes
 * del trimestre.
 *
 * Las semanas sin clase no consumen ciclo, siempre que estén marcadas en el
 * calendario: `computeDayTypes` las deja en `skip` y no cuentan como día
 * numérico. Si no se marcan, toda la numeración queda corrida.
 */

import {
  courseSessionDates,
  type DateStatus,
} from './schedule';
import type { ScheduleBlock, Course, YearConfig, DayType } from '@/types';

/** Máximo de ciclos por trimestre en el modelo del colegio. */
export const CICLOS_POR_TRIMESTRE = 9;

/** Días numéricos (D1..D5) que componen una vuelta completa. */
export const DIAS_POR_CICLO = 5;

export interface CourseCycle {
  courseCode: string;
  grade: number;
  trimestre: number;
  ciclo: number;                      // 1..9
  /** Ordinal de esta clase dentro del ciclo (1-based). */
  session: number;
  /**
   * Cuántas veces se dicta ese curso en ese ciclo. Normalmente 1; en 11° son 2
   * porque el curso aparece en dos tipos de día, y en los cursos del viernes
   * son 2 cuando al ciclo le caen dos viernes.
   */
  sessionsInCiclo: number;
}

/** Ventana [inicio, fin) de un trimestre. `fin` es null en el último. */
export interface TrimWindow {
  trimestre: number;
  start: string;
  end: string | null;
}

/**
 * Trimestres definidos en la configuración, ordenados y con su ventana.
 *
 * Si no hay ningún `trimNStart`, se devuelve un único tramo que arranca en el
 * inicio del año: mejor numerar todo como un bloque que no numerar nada.
 */
export function trimWindows(cfg: YearConfig): TrimWindow[] {
  const raw = [cfg.trim1Start, cfg.trim2Start, cfg.trim3Start];
  const defined = raw
    .map((start, i) => ({ trimestre: i + 1, start }))
    .filter((t): t is { trimestre: number; start: string } => !!t.start)
    .sort((a, b) => a.start.localeCompare(b.start));

  if (defined.length === 0) {
    return [{ trimestre: 1, start: cfg.startDate, end: null }];
  }
  return defined.map((t, i) => ({
    trimestre: t.trimestre,
    start: t.start,
    end: defined[i + 1]?.start ?? null,
  }));
}

/** Trimestre al que pertenece una fecha, o null si es anterior al primero. */
export function trimestreForDate(iso: string, cfg: YearConfig): number | null {
  const hit = trimWindows(cfg).find(w => iso >= w.start && (w.end === null || iso < w.end));
  return hit?.trimestre ?? null;
}

/**
 * Ciclo de la rotación al que pertenece cada fecha lectiva del trimestre.
 *
 * Un día numérico (D1..D5) es la i-ésima pieza de la rotación, así que su ciclo
 * es `ceil(i / 5)`. Un viernes no consume rotación: pertenece al ciclo que va
 * en curso, es decir al de los días numéricos que ya pasaron. Por eso dos
 * viernes pueden compartir ciclo, y por eso el viernes que abre el trimestre
 * antes del primer día numérico cae en el ciclo 1.
 */
export function cicloIndex(trimSeq: Map<string, DateStatus>): Map<string, number> {
  const out = new Map<string, number>();
  let numericos = 0;
  for (const iso of [...trimSeq.keys()].sort()) {
    const s = trimSeq.get(iso);
    if (s === 'weekend' || s === 'skip' || !s) continue;
    if (s === 'FIJO') {
      out.set(iso, Math.max(1, Math.ceil(numericos / DIAS_POR_CICLO)));
    } else {
      numericos++;
      out.set(iso, Math.ceil(numericos / DIAS_POR_CICLO));
    }
  }
  return out;
}

/**
 * Recorre cada curso una sola vez y devuelve `fecha → ciclos de esa fecha`.
 *
 * Se construye de una pasada a propósito: calcular el ciclo por celda del
 * calendario obligaría a rehacer las fechas de sesión de los 19 cursos en cada
 * casilla, y son ~42 casillas por mes.
 */
export function buildCycleMap(
  sequence: Map<string, DateStatus>,
  schedule: ScheduleBlock[],
  courses: Course[],
  cfg: YearConfig,
): Map<string, CourseCycle[]> {
  const out = new Map<string, CourseCycle[]>();
  if (courses.length === 0 || schedule.length === 0) return out;

  for (const win of trimWindows(cfg)) {
    // Subsecuencia del trimestre: define dónde empieza a contar la rotación.
    const trimSeq = new Map<string, DateStatus>();
    for (const [iso, s] of sequence) {
      if (iso >= win.start && (win.end === null || iso < win.end)) trimSeq.set(iso, s);
    }
    if (trimSeq.size === 0) continue;

    const cicloByDate = cicloIndex(trimSeq);

    for (const course of courses) {
      if (!schedule.some(b => b.courseCode === course.code)) continue;   // no lo dicta
      const dates = courseSessionDates(course.code, trimSeq, schedule);

      // Agrupar las clases del curso por el ciclo de la rotación; el ordinal
      // sale de cuántas van dentro de ese mismo ciclo.
      const porCiclo = new Map<number, string[]>();
      for (const iso of dates) {
        const ciclo = cicloByDate.get(iso);
        if (ciclo == null || ciclo > CICLOS_POR_TRIMESTRE) continue;
        const a = porCiclo.get(ciclo);
        if (a) a.push(iso); else porCiclo.set(ciclo, [iso]);
      }

      for (const [ciclo, isos] of porCiclo) {
        isos.forEach((iso, i) => {
          const entry: CourseCycle = {
            courseCode: course.code, grade: course.grade,
            trimestre: win.trimestre, ciclo,
            session: i + 1, sessionsInCiclo: isos.length,
          };
          const arr = out.get(iso);
          if (arr) arr.push(entry); else out.set(iso, [entry]);
        });
      }
    }
  }

  for (const arr of out.values()) arr.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  return out;
}

/**
 * Índice `curso → ciclo → fechas de sus clases en ese ciclo`.
 *
 * Es lo que reemplaza al viejo `sessionsPerCiclo = grade === 11 ? 2 : 1`. Ese
 * supuesto era falso en dos direcciones: un curso del viernes puede tener dos
 * clases en un ciclo (cuando al ciclo le caen dos viernes), y un curso de 11°
 * puede quedarse con una sola si le cancelan uno de sus dos días.
 */
export function buildCourseCicloIndex(
  byDate: Map<string, CourseCycle[]>,
): Map<string, Map<number, string[]>> {
  const out = new Map<string, Map<number, string[]>>();
  for (const iso of [...byDate.keys()].sort()) {
    for (const c of byDate.get(iso)!) {
      let porCiclo = out.get(c.courseCode);
      if (!porCiclo) { porCiclo = new Map(); out.set(c.courseCode, porCiclo); }
      const fechas = porCiclo.get(c.ciclo);
      if (fechas) fechas.push(iso); else porCiclo.set(c.ciclo, [iso]);
    }
  }
  return out;
}

export interface CycleContext {
  /** fecha → los cursos que se dictan ese día, con su ciclo y sesión. */
  byDate: Map<string, CourseCycle[]>;
  /** curso → ciclo → fechas de sus clases en ese ciclo. */
  byCourseCiclo: Map<string, Map<number, string[]>>;
}

/** Punto de entrada único: de aquí salen todos los cálculos de ciclo. */
export function buildCycleContext(
  sequence: Map<string, DateStatus>,
  schedule: ScheduleBlock[],
  courses: Course[],
  cfg: YearConfig,
): CycleContext {
  const byDate = buildCycleMap(sequence, schedule, courses, cfg);
  return { byDate, byCourseCiclo: buildCourseCicloIndex(byDate) };
}

/** Fechas de las clases de un curso en un ciclo. Vacío si no hay. */
export function sessionDatesOf(ctx: CycleContext, courseCode: string, ciclo: number): string[] {
  return ctx.byCourseCiclo.get(courseCode)?.get(ciclo) ?? [];
}

/** Ciclo y sesión de un curso en una fecha concreta. */
export function cycleOf(
  ctx: CycleContext, courseCode: string, iso: string,
): CourseCycle | null {
  return ctx.byDate.get(iso)?.find(c => c.courseCode === courseCode) ?? null;
}

/**
 * Etiqueta para la casilla del calendario.
 *
 * Es un solo número porque el ciclo es propiedad de la FECHA, no del curso:
 * todos los cursos que se dictan ese día están en el mismo ciclo. Lo que puede
 * variar entre ellos es cuál sesión del ciclo les toca, y eso va en el detalle.
 */
export function cycleBadge(cycles: CourseCycle[]): string | null {
  if (cycles.length === 0) return null;
  return `C${cycles[0].ciclo}`;
}

/**
 * 'C3', o 'C3 · S1' cuando el curso se dicta más de una vez en ese ciclo.
 * Mostrar 'S1' en un ciclo de una sola clase sería ruido.
 */
export function cycleLabel(c: CourseCycle): string {
  return c.sessionsInCiclo > 1 ? `C${c.ciclo} · S${c.session}` : `C${c.ciclo}`;
}
