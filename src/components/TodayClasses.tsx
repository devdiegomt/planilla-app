'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  computeDayTypes,
  dayTypeLabel,
  todayIso,
  classesForDayType,
  isClassBlock,
  type DateStatus,
} from '@/lib/schedule';
import { blockLabel } from '@/lib/horarioGrid';
import { dayAgenda, type DayAgenda } from '@/lib/dayAgenda';
import { buildCycleContext, cycleOf, type CycleContext } from '@/lib/cycles';
import type {
  DayType, ScheduleBlock, Course, Student, AttendanceMark, YearConfig, CalendarEvent,
} from '@/types';

const DEFAULT_YEAR = new Date().getFullYear();

export function TodayClasses() {
  const yearCfg = useLiveQuery(() => db.yearConfig.where('year').equals(DEFAULT_YEAR).first());
  const customDays = useLiveQuery(() => db.calendarDays.toArray()) ?? [];
  const schedule = useLiveQuery(() => db.schedule.toArray()) ?? [];
  const courses = useLiveQuery(() => db.courses.toArray()) ?? [];
  const students = useLiveQuery(() => db.students.toArray()) ?? [];
  const marks = useLiveQuery(() => db.attendanceMarks.toArray()) ?? [];
  // Lo temporal: reuniones, reemplazos y entregas de una fecha concreta.
  const events = useLiveQuery(() => db.events.toArray()) ?? [];

  const today = todayIso();
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  if (!yearCfg) {
    return (
      <div className="border rounded-lg p-4 bg-amber-50 text-sm">
        Aún no has configurado el año escolar.{' '}
        <Link href="/calendario" className="underline font-medium">Ir a calendario</Link>{' '}
        para fijar la fecha de inicio y el tipo de día inicial.
      </div>
    );
  }

  const seq = computeDayTypes(
    yearCfg.startDate,
    yearCfg.initialDayType,
    tomorrow,
    customDays,
    true,
  );

  const todayStatus = seq.get(today);
  const tomorrowStatus = seq.get(tomorrow);

  // Contexto compartido para cálculo de ciclos
  const ctx: CicloCtx = {
    sequence: seq,
    schedule,
    courses,
    students,
    marks,
    events,
    trimStart: activeTrimStart(today, yearCfg) ?? yearCfg.startDate,
    cycles: buildCycleContext(seq, schedule, courses, yearCfg),
  };

  const todayClasses = statusToClasses(todayStatus, schedule);
  const pending = todayClasses
    .map(b => classInfo(b, today, ctx))
    .filter(ci => ci.ciclo != null && !ci.confirmed);

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <PendingBanner items={pending} />
      )}
      {!yearCfg.trim2Start && !yearCfg.trim1Start && !yearCfg.trim3Start && (
        <div className="border rounded-lg p-3 bg-neutral-50 text-xs text-neutral-600">
          Tip: define fechas de inicio de trimestre en{' '}
          <Link href="/calendario" className="underline">calendario</Link>{' '}
          para que los ciclos se cuenten desde ahí en vez del arranque del año.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <DayCard label="Hoy"    dateIso={today}    status={todayStatus}    ctx={ctx} />
        <DayCard label="Mañana" dateIso={tomorrow} status={tomorrowStatus} ctx={ctx} />
      </div>
    </div>
  );
}

// ---- tipos internos ----

interface CicloCtx {
  sequence: Map<string, DateStatus>;
  schedule: ScheduleBlock[];
  courses: Course[];
  students: Student[];
  marks: AttendanceMark[];
  events: CalendarEvent[];
  trimStart: string;
  cycles?: CycleContext;
}

interface ClassInfo {
  block: ScheduleBlock;
  ciclo: number | null;
  /** Null si el ciclo trae una sola clase de ese curso. */
  session: number | null;
  confirmed: boolean;
  fallas: number;
  retardos: number;
  activos: number;
}

function statusToClasses(status: DateStatus | undefined, schedule: ScheduleBlock[]): ScheduleBlock[] {
  if (!status || status === 'weekend' || status === 'skip') return [];
  return classesForDayType(status as DayType, schedule);
}

/**
 * El día completo: el horario de ese tipo de día MÁS lo temporal de esa fecha.
 *
 * Lo temporal es lo que no se repite —la reunión de esta semana, el reemplazo
 * de mañana— y sin esto no se veía en ninguna parte del día. El banner de F/R
 * sigue mirando solo las clases.
 *
 * Un fin de semana o un festivo no tiene horario, pero sí puede tener algo
 * anotado, así que la fecha se mira igual y solo se salta la parte del horario.
 */
function agendaOf(
  dateIso: string,
  status: DateStatus | undefined,
  ctx: CicloCtx,
): DayAgenda {
  const esLectivo = status && status !== 'weekend' && status !== 'skip';
  return dayAgenda(
    dateIso,
    (esLectivo ? status : 'D1') as DayType,
    esLectivo ? ctx.schedule : [],
    ctx.events,
  );
}

function classInfo(block: ScheduleBlock, dateIso: string, ctx: CicloCtx): ClassInfo {
  const course = ctx.courses.find(c => c.code === block.courseCode);
  if (!course) {
    return { block, ciclo: null, session: null, confirmed: false, fallas: 0, retardos: 0, activos: 0 };
  }
  // El ciclo sale de la rotación (ver lib/cycles): no se cuenta por curso.
  const cc = ctx.cycles ? cycleOf(ctx.cycles, block.courseCode, dateIso) : null;
  const ciclo = cc?.ciclo ?? 0;
  // La sesión solo distingue cuando el ciclo trae más de una clase del curso:
  // siempre en 11°, y en los cursos del viernes cuando al ciclo le caen dos.
  const session = cc && cc.sessionsInCiclo > 1 ? cc.session : null;
  const mark = ctx.marks.find(m =>
    m.courseCode === course.code
    && m.ciclo === ciclo
    && (session == null ? m.session == null : m.session === session)
  );
  const activos = ctx.students.filter(s => s.courseId === course.id && !s.withdrawnAt);
  let fallas = 0, retardos = 0;
  if (ciclo && ciclo > 0) {
    for (const s of activos) {
      const c = s.cycles.find(x => x.ciclo === ciclo);
      if (session === 1) {
        if (c?.S1?.F) fallas++;
        if (c?.S1?.R) retardos++;
      } else if (session === 2) {
        if (c?.S2?.F) fallas++;
        if (c?.S2?.R) retardos++;
      } else {
        if (c?.F) fallas++;
        if (c?.R) retardos++;
      }
    }
  }
  return {
    block,
    ciclo: ciclo && ciclo > 0 ? ciclo : null,
    session,
    confirmed: !!mark,
    fallas, retardos,
    activos: activos.length,
  };
}

function activeTrimStart(dateIso: string, cfg: YearConfig): string | undefined {
  const starts = [cfg.trim1Start, cfg.trim2Start, cfg.trim3Start]
    .filter(Boolean)
    .filter(d => d! <= dateIso)
    .sort();
  return starts.at(-1);
}

// ---- componentes ----

function DayCard({
  label, dateIso, status, ctx,
}: {
  label: string;
  dateIso: string;
  status: DateStatus | undefined;
  ctx: CicloCtx;
}) {
  const isLive = status && status !== 'weekend' && status !== 'skip';
  // El día completo: las reuniones y los descansos también son parte de su día,
  // y lo temporal de esa fecha entra en su hora junto a las clases. El banner
  // de F/R pendientes sigue mirando solo las clases.
  const { timed, allDay } = agendaOf(dateIso, status, ctx);
  const vacio = timed.length === 0 && allDay.length === 0;

  const prettyDate = new Date(dateIso + 'T00:00:00')
    .toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs text-neutral-500 uppercase">{label}</div>
          <div className="text-sm first-letter:uppercase">{prettyDate}</div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${
          status === 'FIJO' ? 'bg-amber-100 text-amber-800' :
          status === 'weekend' || status === 'skip' ? 'bg-neutral-100 text-neutral-600' :
          'bg-blue-100 text-blue-800'
        }`}>
          {dayTypeLabel(status)}
        </div>
      </div>

      {!isLive && vacio && (
        <p className="text-sm text-neutral-500">Sin clases programadas.</p>
      )}

      {isLive && vacio && (
        <p className="text-sm text-neutral-500">
          No hay bloques definidos para este día.{' '}
          <Link href="/horario" className="underline">Configurar</Link>
        </p>
      )}

      {timed.length > 0 && (
        <ul className="space-y-1.5">
          {timed.map(item => (
            item.type === 'event'
              ? <EventRow key={`e${item.event.id}`} ev={item.event} />
              : isClassBlock(item.block)
                ? <ClassRow key={item.block.id} block={item.block}
                            info={classInfo(item.block, dateIso, ctx)} />
                : <EntryRow key={item.block.id} block={item.block} />
          ))}
        </ul>
      )}

      {allDay.length > 0 && (
        <ul className={`space-y-1.5 ${timed.length > 0 ? 'mt-2 pt-2 border-t' : ''}`}>
          {allDay.map(ev => <EventRow key={`e${ev.id}`} ev={ev} sinHora />)}
        </ul>
      )}
    </div>
  );
}

function ClassRow({ block, info }: { block: ScheduleBlock; info: ClassInfo }) {
  const cicloLabel = info.ciclo == null
    ? ''
    : info.session != null
      ? `C${info.ciclo}·S${info.session}`
      : `C${info.ciclo}`;
  const badge = info.ciclo == null
    ? { text: '—', cls: 'bg-neutral-100 text-neutral-500' }
    : info.confirmed
    ? { text: `✓ ${cicloLabel}`, cls: 'bg-green-100 text-green-800' }
    : { text: `${cicloLabel} pend.`, cls: 'bg-amber-100 text-amber-800' };

  const href = info.ciclo != null
    ? `/curso/${block.courseCode}?ciclo=${info.ciclo}`
    : `/curso/${block.courseCode}`;

  // `shrink-0` en todo menos el aula: sin eso, a 360px la fila se encoge y la
  // hora se parte en dos líneas y la insignia también. El aula es lo único que
  // puede ceder, y cede truncándose.
  return (
    <li className="flex items-center gap-2 text-sm">
      {/* Sin el número de bloque: es un consecutivo de creación y, ahora que la
          lista va en orden de reloj, salía desordenado (4, 5, 3). */}
      <span className="shrink-0 text-xs text-neutral-500 tabular-nums w-24">
        {block.startTime}–{block.endTime}
      </span>
      <Link href={href} className="shrink-0 font-medium hover:underline">
        {block.courseCode}
      </Link>
      {block.room && (
        <span className="text-xs text-neutral-500 truncate min-w-0">· {block.room}</span>
      )}
      <span className={`ml-auto shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5
                        rounded font-medium ${badge.cls}`}>
        {badge.text}
      </span>
      {(info.fallas > 0 || info.retardos > 0) && (
        <span className="shrink-0 text-[10px] text-neutral-500 tabular-nums">
          {info.fallas}F · {info.retardos}R
        </span>
      )}
    </li>
  );
}

/**
 * Una reunión, un reemplazo o un descanso. No enlaza a `/curso/` — no tiene
 * código de curso — ni lleva ciclo ni F/R, porque no es una clase suya.
 */
function EntryRow({ block }: { block: ScheduleBlock }) {
  const esDescanso = block.kind === 'descanso';
  // Aula y nota en un solo texto: como renglones aparte se apretaban a 360px.
  const detalle = [block.room, block.note].filter(Boolean).join(' · ');
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-xs text-neutral-500 tabular-nums w-24">
        {block.startTime}–{block.endTime}
      </span>
      {/* Tope en vez de encogerse: si compite con el detalle, "Descanso" se
          cortaba sobrando espacio. Con el tope, un título largo se trunca al
          45 % y uno corto se lee entero. */}
      <span className={`shrink-0 max-w-[45%] truncate ${
        esDescanso ? 'text-neutral-500' : 'font-medium text-amber-900'
      }`}>
        {blockLabel(block)}
      </span>
      {detalle && (
        <span className="text-xs text-neutral-500 truncate min-w-0">· {detalle}</span>
      )}
      <span className={`ml-auto shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5
                        rounded font-medium ${
        esDescanso ? 'bg-neutral-100 text-neutral-600' : 'bg-amber-100 text-amber-800'
      }`}>
        {esDescanso ? 'descanso' : 'evento'}
      </span>
    </li>
  );
}

const EVENT_BADGE: Record<CalendarEvent['kind'], string> = {
  entrega: 'bg-red-100 text-red-800',
  actividad: 'bg-blue-100 text-blue-800',
  reemplazo: 'bg-violet-100 text-violet-800',
  festivo: 'bg-neutral-100 text-neutral-700',
  otro: 'bg-neutral-100 text-neutral-700',
};

const EVENT_LABEL: Record<CalendarEvent['kind'], string> = {
  entrega: 'entrega', actividad: 'actividad', reemplazo: 'reemplazo',
  festivo: 'festivo', otro: 'otro',
};

/**
 * Algo temporal dentro del día: no es del horario, es de esta fecha.
 *
 * Se ve como las otras filas para que el día se lea de corrido, pero con su
 * color propio, que es lo que dice de un vistazo qué se sale de lo normal hoy.
 */
function EventRow({ ev, sinHora }: { ev: CalendarEvent; sinHora?: boolean }) {
  const hora = ev.startTime
    ? `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ''}`
    : 'todo el día';
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-xs text-neutral-500 tabular-nums w-24">
        {sinHora ? <span className="not-italic text-neutral-400">{hora}</span> : hora}
      </span>
      <span className="shrink-0 max-w-[45%] truncate font-medium text-neutral-800">
        {ev.title}
      </span>
      {ev.description && (
        <span className="text-xs text-neutral-500 truncate min-w-0">· {ev.description}</span>
      )}
      <span className={`ml-auto shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5
                        rounded font-medium ${EVENT_BADGE[ev.kind]}`}>
        {EVENT_LABEL[ev.kind]}
      </span>
    </li>
  );
}

function PendingBanner({ items }: { items: ClassInfo[] }) {
  return (
    <div className="border-l-4 border-amber-500 bg-amber-50 rounded-r-md px-4 py-3 text-sm">
      <div className="font-medium text-amber-900 mb-1">
        {items.length} clase{items.length > 1 ? 's' : ''} de hoy sin confirmar F/R
      </div>
      <div className="flex gap-2 flex-wrap">
        {items.map(ci => (
          <Link
            key={ci.block.id}
            href={`/curso/${ci.block.courseCode}?ciclo=${ci.ciclo}`}
            className="text-xs bg-white border border-amber-300 rounded px-2 py-1 hover:bg-amber-100 text-amber-900"
          >
            {ci.block.courseCode} · C{ci.ciclo}{ci.session ? `·S${ci.session}` : ''}
          </Link>
        ))}
      </div>
    </div>
  );
}
