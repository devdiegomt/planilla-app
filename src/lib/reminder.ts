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
  courseSessionDates,
  currentCicloForCourse,
  sessionInCiclo,
} from './schedule';
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

  // F/R sin registrar: se mira la sesión más reciente de cada curso hasta ayer.
  const trimStart = activeTrimStart(today, yearConfig) ?? yearConfig.startDate;
  const trimSeq = new Map<string, DayType | 'weekend' | 'skip'>();
  for (const [iso, s] of seq) {
    if (iso >= trimStart && iso < today) trimSeq.set(iso, s);
  }

  const pendingCourses: string[] = [];
  for (const course of courses) {
    if (!schedule.some(b => b.courseCode === course.code)) continue;   // no lo dicta
    const sessionsPerCiclo = course.grade === 11 ? 2 : 1;
    const sessionDates = courseSessionDates(course.code, trimSeq, schedule);
    const lastSessionDate = sessionDates.at(-1);
    if (!lastSessionDate) continue;
    const cicloAyer = currentCicloForCourse(lastSessionDate, sessionDates, 9, sessionsPerCiclo);
    if (cicloAyer <= 0) continue;
    const sess = sessionInCiclo(lastSessionDate, sessionDates, sessionsPerCiclo);
    // El match va por `courseCode`, NO por `courseId`: los ids locales de Dexie
    // los borra `stripLocalMeta` antes de subir, así que aquí ambos lados serían
    // `undefined` y la comparación daría true para cualquier curso — una marca
    // de 801 dejaba los 19 cursos como registrados.
    const mark = attendanceMarks.find(m =>
      m.courseCode === course.code
      && m.ciclo === cicloAyer
      && (sess == null ? m.session == null : m.session === sess),
    );
    if (!mark) pendingCourses.push(course.code);
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
