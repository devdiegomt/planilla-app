/**
 * Composición del recordatorio diario push.
 *
 * Vive aparte del route handler a propósito: es lógica pura (datos → payload),
 * sin Supabase ni red, así que se puede ejercitar con escenarios controlados.
 * El route se queda solo con el fetch y el fan-out a las suscripciones.
 */

import {
  computeDayTypes,
  formatIso,
  classesForDayType,
} from './schedule';
import {
  buildCycleContext, cycleOf,
  type CycleContext, type CourseCycle,
} from './cycles';
import type {
  DayType, ScheduleBlock, CalendarDay, YearConfig, Course,
  AttendanceMark, Todo, CalendarEvent,
} from '@/types';

export interface ReminderPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Todo lo que el recordatorio necesita, ya deserializado de `sync_records`. */
export interface ReminderInput {
  yearConfig?: YearConfig;
  schedule: ScheduleBlock[];
  calendarDays: CalendarDay[];
  courses: Course[];
  attendanceMarks: AttendanceMark[];
  todos: Todo[];
  events: CalendarEvent[];
}

/**
 * Fecha de hoy en Colombia (UTC-5, sin horario de verano).
 *
 * El runtime de Vercel corre en UTC y `todayIso()` usa la zona del proceso, así
 * que acertaría solo mientras el cron dispare después de las 05:00 UTC. Anclar
 * el offset evita que mover el horario del cron corra las fechas un día.
 */
export function todayInBogota(now: Date = new Date()): string {
  return formatIso(new Date(now.getTime() - 5 * 60 * 60 * 1000));
}

/**
 * Arma el recordatorio del día.
 *
 * Devuelve null cuando no vale la pena notificar: sin configuración de año, o
 * si hoy no es día lectivo (festivo, fin de semana, cancelado), o si es lectivo
 * pero el docente no tiene bloques ese tipo de día.
 */
export function composeReminder(
  input: ReminderInput,
  today: string,
): ReminderPayload | null {
  const {
    yearConfig, schedule, calendarDays, courses, attendanceMarks, todos, events,
  } = input;

  if (!yearConfig) return null;             // sin config no se sabe si hoy es lectivo

  const seq = computeDayTypes(
    yearConfig.startDate,
    yearConfig.initialDayType,
    today,
    calendarDays,
    true,
  );
  const status = seq.get(today);
  if (!status || status === 'weekend' || status === 'skip') return null;

  const classesToday = classesForDayType(status as DayType, schedule);
  if (classesToday.length === 0) return null;

  const uniqueCodes = [...new Set(classesToday.map(c => c.courseCode))];

  // F/R sin registrar: se mira la última clase de cada curso ANTES de hoy.
  const ctx = buildCycleContext(seq, schedule, courses, yearConfig);
  const pendingCourses: string[] = [];
  for (const course of courses) {
    if (!schedule.some(b => b.courseCode === course.code)) continue;   // no lo dicta
    const ultima = lastClassBefore(ctx, course.code, today);
    if (!ultima) continue;
    // El match va por `courseCode`, NO por `courseId`: los ids locales de Dexie
    // los borra `stripLocalMeta` antes de subir, así que aquí ambos lados serían
    // `undefined` y la comparación daría true para cualquier curso — una marca
    // de 801 dejaba los 19 cursos como registrados.
    if (!hasMark(attendanceMarks, course.code, ultima)) pendingCourses.push(course.code);
  }
  pendingCourses.sort();

  // `date` y `dueDate` se guardan como 'YYYY-MM-DD' planos (vienen de
  // <input type="date">), así que comparar strings contra `today` es exacto.
  const eventsToday = events.filter(e =>
    e.date === today && (e.kind === 'entrega' || e.kind === 'actividad'),
  );
  const entregasToday = eventsToday.filter(e => e.kind === 'entrega');

  const openTodos = todos.filter(t => t.status === 'pending' && t.dueDate);
  const todosOverdue = openTodos.filter(t => t.dueDate! < today);
  const todosToday = openTodos.filter(t => t.dueDate === today);

  const dayLabel = status === 'FIJO' ? 'Día Fijo' : `Día ${status.slice(1)}`;
  const title = `${dayLabel} · ${classesToday.length} clase${plural(classesToday.length)} hoy`;

  const lines: string[] = [uniqueCodes.join(', ')];

  if (eventsToday.length > 0) {
    const codes = joinCapped(
      [...new Set(eventsToday.map(e => e.courseCode).filter((c): c is string => !!c))],
      4,
    );
    const label = entregasToday.length === eventsToday.length
      ? `${entregasToday.length} entrega${plural(entregasToday.length)}`
      : `${eventsToday.length} evento${plural(eventsToday.length)}`;
    lines.push(`📌 ${label} hoy${codes ? `: ${codes}` : ''}`);
  }

  const nTodos = todosOverdue.length + todosToday.length;
  if (nTodos > 0) {
    const detail = todosOverdue.length > 0
      ? ` (${todosOverdue.length} vencido${plural(todosOverdue.length)})`
      : '';
    lines.push(`⚠️ ${nTodos} pendiente${plural(nTodos)}${detail}`);
  }

  lines.push(
    pendingCourses.length > 0
      ? `📋 F/R sin registrar: ${joinCapped(pendingCourses, 5)}`
      : '✓ F/R al día',
  );

  return { title, body: lines.join('\n'), url: '/', tag: `daily-${today}` };
}

/** Una clase de hoy cuyo F/R todavía no se ha confirmado. */
interface PendingToday {
  code: string;
  ciclo: number;
  /** Null cuando el ciclo tiene una sola clase de ese curso. */
  session: number | null;
}

/**
 * Recordatorio de la tarde: clases dictadas HOY cuyo F/R sigue sin registrar.
 *
 * Complementa al matutino, que avisa de lo pendiente de días previos — cuando
 * ya no recuerdas quién faltó. Este llega el mismo día, mientras todavía puedes
 * resolverlo de memoria.
 *
 * **Devuelve null si no hay nada pendiente.** Es deliberado: un aviso que
 * también llega para decir "todo al día" se vuelve ruido y se aprende a
 * ignorar. Solo suena cuando hay algo que hacer.
 */
export function composeAfternoonReminder(
  input: ReminderInput,
  today: string,
): ReminderPayload | null {
  const { yearConfig, schedule, calendarDays, courses, attendanceMarks } = input;
  if (!yearConfig) return null;

  const seq = computeDayTypes(
    yearConfig.startDate, yearConfig.initialDayType, today, calendarDays, true,
  );
  const status = seq.get(today);
  if (!status || status === 'weekend' || status === 'skip') return null;

  const classesToday = classesForDayType(status as DayType, schedule);
  if (classesToday.length === 0) return null;
  const codesToday = new Set(classesToday.map(c => c.courseCode));

  // A diferencia del matutino, la ventana INCLUYE hoy: la sesión que nos
  // interesa es justamente la de esta mañana.
  const trimStart = activeTrimStart(today, yearConfig) ?? yearConfig.startDate;
  const trimSeq = new Map<string, DayType | 'weekend' | 'skip'>();
  for (const [iso, s] of seq) {
    if (iso >= trimStart && iso <= today) trimSeq.set(iso, s);
  }

  const ctx = buildCycleContext(seq, schedule, courses, yearConfig);
  const pending: PendingToday[] = [];
  for (const course of courses) {
    if (!codesToday.has(course.code)) continue;          // no la dictó hoy
    const hoy = cycleOf(ctx, course.code, today);
    if (!hoy) continue;                                   // fuera de los 9 ciclos
    if (!hasMark(attendanceMarks, course.code, hoy)) {
      pending.push({
        code: course.code, ciclo: hoy.ciclo,
        session: hoy.sessionsInCiclo > 1 ? hoy.session : null,
      });
    }
  }

  if (pending.length === 0) return null;                  // nada que recordar
  pending.sort((a, b) => a.code.localeCompare(b.code));

  const title = `F/R sin registrar · ${pending.length} clase${plural(pending.length)}`;
  const lines = pending.map(p =>
    `${p.code} · ciclo ${p.ciclo}${p.session ? ` · S${p.session}` : ''}`,
  );

  // Con una sola pendiente vale la pena llevar directo al editor; con varias,
  // cualquier elección sería arbitraria y la home las lista todas.
  const url = pending.length === 1
    ? `/curso/${pending[0].code}?ciclo=${pending[0].ciclo}`
    : '/';

  return {
    title,
    body: lines.join('\n'),
    url,
    tag: `afternoon-${today}`,
  };
}

/**
 * Última clase de un curso estrictamente antes de `iso`, con su ciclo y sesión.
 * Null si el curso todavía no ha tenido clase en el trimestre.
 */
function lastClassBefore(
  ctx: CycleContext, courseCode: string, iso: string,
): CourseCycle | null {
  const porCiclo = ctx.byCourseCiclo.get(courseCode);
  if (!porCiclo) return null;
  let mejor: string | null = null;
  for (const fechas of porCiclo.values()) {
    for (const f of fechas) {
      if (f < iso && (mejor === null || f > mejor)) mejor = f;
    }
  }
  return mejor ? cycleOf(ctx, courseCode, mejor) : null;
}

/**
 * ¿Está confirmada la asistencia de esa clase?
 *
 * La marca lleva `session` solo cuando el ciclo tiene más de una clase de ese
 * curso; con una sola, la marca es del ciclo entero y no trae sesión.
 */
function hasMark(
  marks: AttendanceMark[], courseCode: string, c: CourseCycle,
): boolean {
  const sess = c.sessionsInCiclo > 1 ? c.session : null;
  return marks.some(m =>
    m.courseCode === courseCode
    && m.ciclo === c.ciclo
    && (sess === null ? m.session == null : m.session === sess),
  );
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}

/** Une hasta `max` elementos y resume el resto como '+N'. */
function joinCapped(items: string[], max: number): string {
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} +${items.length - max}`;
}

function activeTrimStart(dateIso: string, cfg: YearConfig): string | undefined {
  const starts = [cfg.trim1Start, cfg.trim2Start, cfg.trim3Start]
    .filter((d): d is string => !!d && d <= dateIso)
    .sort();
  return starts.at(-1);
}
