/**
 * Lo que la app ve que falta, sin que nadie lo haya anotado.
 *
 * Pendientes era una lista escrita a mano y nada más, y eso deja afuera lo
 * único que la app sí puede saber sola: que una clase ya se dictó y su F/R
 * sigue sin registrar, que un ciclo que lleva nota está a medio calificar, que
 * el trimestre ya cambió y el anterior nunca se cerró. Mirar eso a mano es
 * revisar diecinueve cursos por nueve ciclos.
 *
 * Es lógica **pura**: entra lo que ya está en memoria y sale una lista. Sin
 * Dexie, sin red y sin React, así que se puede ejercitar con escenarios
 * inventados — el mismo camino de `lib/reminder.ts`, que además come de acá
 * para que el aviso del celular y la pantalla no puedan decir cosas distintas.
 *
 * **Lo que NO hace: adivinar.** Cada deber sale de un dato que existe. Donde la
 * app no sabe —el docente no importó su matriz, así que no se sabe qué ciclos
 * llevan nota— no se inventa un deber: no se muestra nada. Un pendiente falso
 * en una lista de pendientes la vuelve inútil más rápido que una lista vacía,
 * porque enseña a no mirarla.
 */

import { computeDayTypes, classesForDayType } from './schedule';
import { buildCycleContext, sessionDatesOf, trimWindows, type CycleContext } from './cycles';
import { slotsFor, ciclosConNota, slotsDelCiclo } from './constants';
import type {
  ScheduleBlock, CalendarDay, YearConfig, Course, Student, AttendanceMark,
} from '@/types';

export type DeberTipo = 'asistencia' | 'notas' | 'cierre';

export interface Deber {
  tipo: DeberTipo;
  /** Estable e irrepetible: sirve de `key` de React y para no duplicar. */
  clave: string;
  titulo: string;
  detalle?: string;
  href: string;
  courseCode?: string;
  /** Fecha de la clase o del hecho que lo disparó. Ordena la lista. */
  fecha?: string;
}

export interface DeberesInput {
  yearConfig?: YearConfig;
  schedule: ScheduleBlock[];
  calendarDays: CalendarDay[];
  courses: Course[];
  students: Student[];
  attendanceMarks: AttendanceMark[];
}

/**
 * Todo lo que falta hoy, lo más viejo primero.
 *
 * Sin configuración de año no hay ciclos ni fechas, así que no hay nada que
 * deducir: devuelve vacío en vez de suponer un calendario.
 */
export function deberesDe(input: DeberesInput, hoy: string): Deber[] {
  const { yearConfig, schedule, calendarDays, courses } = input;
  if (!yearConfig) return [];

  const seq = computeDayTypes(
    yearConfig.startDate, yearConfig.initialDayType, hoy, calendarDays, true,
  );
  const ctx = buildCycleContext(seq, schedule, courses, yearConfig);

  const deberes = [
    ...deberesDeAsistencia(input, ctx, hoy),
    ...deberesDeNotas(input, ctx, hoy),
    ...deberesDeCierre(input, hoy),
  ];
  // Lo más viejo primero: es lo que más cuesta reconstruir de memoria. Lo que
  // no tiene fecha (el cierre) va al final, porque no se venció un día
  // concreto — lleva esperando desde que cambió el trimestre.
  return deberes.sort((a, b) => (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999'));
}

/**
 * Clases ya dictadas cuyo F/R nunca se registró, en el trimestre en curso.
 *
 * **De dónde arranca a mirar, y por qué importa.** Quien empieza a usar la app
 * en septiembre tiene meses de clases sin marcar que nunca pensó marcar acá, y
 * listarlas todas sería abrir Pendientes a un muro de cien filas falsas. Así
 * que por cada curso se mira desde su PRIMERA marca en adelante: antes de esa
 * marca la app no tiene por qué dar por hecho que el docente quería llevar la
 * asistencia ahí. Y si ese curso no tiene ninguna marca todavía, se ofrece
 * solo la última clase — lo justo para empezar, no una cuenta pendiente.
 */
export type EntradaAsistencia =
  Pick<DeberesInput, 'yearConfig' | 'schedule' | 'courses' | 'attendanceMarks'>;

export function deberesDeAsistencia(
  input: EntradaAsistencia, ctx: CycleContext, hoy: string,
): Deber[] {
  const { yearConfig, schedule, courses, attendanceMarks } = input;
  if (!yearConfig) return [];

  const trim = trimestreEnCurso(yearConfig, hoy);
  const out: Deber[] = [];

  for (const course of courses) {
    if (!schedule.some(b => b.courseCode === course.code)) continue;   // no lo dicta
    const marcas = attendanceMarks.filter(m => m.courseCode === course.code);

    // Clases pasadas del trimestre, con su ciclo, ordenadas por fecha.
    const clases: { ciclo: number; fecha: string; sesion: number; deCuantas: number }[] = [];
    for (let ciclo = 1; ciclo <= 9; ciclo++) {
      const fechas = sessionDatesOf(ctx, course.code, trim, ciclo);
      fechas.forEach((fecha, i) => {
        if (fecha < hoy) {
          clases.push({ ciclo, fecha, sesion: i + 1, deCuantas: fechas.length });
        }
      });
    }
    if (clases.length === 0) continue;
    clases.sort((a, b) => a.fecha.localeCompare(b.fecha));

    const primerCicloMarcado = marcas.length
      ? Math.min(...marcas.map(m => m.ciclo))
      : null;
    const aRevisar = primerCicloMarcado === null
      ? clases.slice(-1)                                   // todavía no empieza
      : clases.filter(c => c.ciclo >= primerCicloMarcado);

    const sinMarcar = aRevisar.filter(c => {
      // La marca lleva sesión SOLO cuando el ciclo trae más de una clase de
      // ese curso; con una sola la marca es del ciclo entero y no trae sesión.
      // Comparar siempre por sesión dejaría toda marca vieja como inexistente.
      const sesion = c.deCuantas > 1 ? c.sesion : null;
      return !marcas.some(m =>
        m.ciclo === c.ciclo && (sesion === null ? m.session == null : m.session === sesion),
      );
    });
    if (sinMarcar.length === 0) continue;

    // UNA fila por curso, no una por clase. Con diecinueve cursos y nueve
    // ciclos, una fila por clase son más de cien filas y la pantalla deja de
    // servir justamente para el que más atrasado está. La fila lleva la
    // cuenta y entra por la más vieja, que es la que peor se recuerda.
    const primera = sinMarcar[0];
    out.push({
      tipo: 'asistencia',
      clave: `asistencia:${course.code}`,
      titulo: `Falta registrar la asistencia de ${course.code}`,
      detalle: sinMarcar.length === 1
        ? `Ciclo ${primera.ciclo}${primera.deCuantas > 1 ? `, clase ${primera.sesion} de ${primera.deCuantas}` : ''}`
        : `${sinMarcar.length} clases sin registrar, desde el ciclo ${primera.ciclo}`,
      href: `/curso/${course.code}?ciclo=${primera.ciclo}`,
      courseCode: course.code,
      fecha: primera.fecha,
    });
  }
  return out;
}

/**
 * Ciclos que llevan nota y siguen a medias.
 *
 * **Solo si el docente trajo su matriz de actividades.** Cuál ciclo lleva nota
 * lo dice la matriz y nada más, y cada materia tiene la suya. Sin ella,
 * `ciclosConNota` devuelve null —"no se sabe", que no es lo mismo que
 * "ninguno"— y acá eso significa no mostrar nada: con un conjunto vacío la app
 * le diría a quien no importó nada que no tiene ninguna nota que poner, y con
 * uno inventado le pediría notas de ciclos que en su materia son formativos.
 */
export function deberesDeNotas(
  input: DeberesInput, ctx: CycleContext, hoy: string,
): Deber[] {
  const { yearConfig, courses, students } = input;
  if (!yearConfig) return [];

  const trim = trimestreEnCurso(yearConfig, hoy);
  const out: Deber[] = [];

  for (const course of courses) {
    const slots = slotsFor(course.grade, yearConfig.subjects);
    const conNota = ciclosConNota(slots);
    if (conNota === null) continue;              // sin matriz, la app no sabe

    const alumnos = students.filter(s => s.courseCode === course.code && !s.withdrawnAt);
    if (alumnos.length === 0) continue;

    // Igual que la asistencia: una fila por curso, con los ciclos adentro.
    const pendientes: { ciclo: number; faltan: number; ultima: string }[] = [];
    for (const ciclo of [...conNota].sort((a, b) => a - b)) {
      const fechas = sessionDatesOf(ctx, course.code, trim, ciclo);
      const ultima = fechas.at(-1);
      if (!ultima || ultima >= hoy) continue;     // todavía no se dictó entero

      const claves = slotsDelCiclo(slots, ciclo).map(s => s.key);
      if (claves.length === 0) continue;

      // Un 0 es "sin calificar" en esta app: es lo que el algoritmo de la
      // plataforma ignora, y la mínima real es 30. Así que contar los ceros es
      // contar a quién le falta la nota, no a quién la perdió.
      const faltan = alumnos.filter(s => claves.some(k => !s.subnotas?.[k])).length;
      if (faltan > 0) pendientes.push({ ciclo, faltan, ultima });
    }
    if (pendientes.length === 0) continue;

    const ciclos = pendientes.map(p => p.ciclo);
    const peor = Math.max(...pendientes.map(p => p.faltan));
    out.push({
      tipo: 'notas',
      clave: `notas:${course.code}`,
      titulo: ciclos.length === 1
        ? `Faltan notas del ciclo ${ciclos[0]} en ${course.code}`
        : `Faltan notas en ${course.code}`,
      detalle: ciclos.length === 1
        ? (peor === alumnos.length
            ? `Ninguno de los ${alumnos.length} tiene nota todavía`
            : `${peor} de ${alumnos.length} sin nota`)
        : `Ciclos ${listar(ciclos)} · hasta ${peor} de ${alumnos.length} sin nota`,
      href: `/curso/${course.code}`,
      courseCode: course.code,
      fecha: pendientes[0].ultima,
    });
  }
  return out;
}

/** '2, 4 y 6' — como se enumera en español, no '2, 4, 6'. */
function listar(ns: number[]): string {
  if (ns.length <= 1) return String(ns[0] ?? '');
  return `${ns.slice(0, -1).join(', ')} y ${ns.at(-1)}`;
}

/**
 * El trimestre ya cambió y el anterior nunca se cerró.
 *
 * Se compara contra la fecha y no contra lo que crea una pantalla: si el
 * calendario dice que el trimestre 2 ya empezó y los cursos siguen en el 1, el
 * cierre quedó pendiente. Importa porque cerrar es lo que archiva las
 * definitivas en el historial; sin eso, ese trimestre no existe más que en la
 * plataforma.
 */
export function deberesDeCierre(input: DeberesInput, hoy: string): Deber[] {
  const { yearConfig, courses } = input;
  if (!yearConfig || courses.length === 0) return [];

  const enCurso = trimestreEnCurso(yearConfig, hoy);
  // El trimestre que los cursos tienen guardado; el más repetido manda, que es
  // el mismo criterio que usa la vista previa del cierre.
  const cuenta = new Map<number, number>();
  for (const c of courses) cuenta.set(c.trimestre, (cuenta.get(c.trimestre) ?? 0) + 1);
  const guardado = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];

  if (guardado >= enCurso) return [];
  return [{
    tipo: 'cierre',
    clave: `cierre:${guardado}`,
    titulo: `El trimestre ${guardado} ya terminó y no lo has cerrado`,
    detalle: `Según el calendario va el trimestre ${enCurso}. Al cerrar, las `
      + 'definitivas quedan guardadas y la planilla arranca en blanco.',
    href: '/ajustes/cierre',
  }];
}

/** El trimestre que corre hoy según el calendario. 1 si no hay fechas puestas. */
export function trimestreEnCurso(cfg: YearConfig, hoy: string): number {
  const ventanas = trimWindows(cfg);
  for (const v of ventanas) {
    if (hoy >= v.start && (v.end === null || hoy < v.end)) return v.trimestre;
  }
  // Antes del primer trimestre configurado, o sin ninguno: el primero.
  return ventanas[0]?.trimestre ?? 1;
}

/** Cuántas clases de hoy hay, para saber si vale la pena mirar el día. */
export function dictaHoy(
  cfg: YearConfig, schedule: ScheduleBlock[], calendarDays: CalendarDay[], hoy: string,
): number {
  const seq = computeDayTypes(cfg.startDate, cfg.initialDayType, hoy, calendarDays, true);
  const status = seq.get(hoy);
  if (!status || status === 'weekend' || status === 'skip') return 0;
  return classesForDayType(status, schedule).length;
}
