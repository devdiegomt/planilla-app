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
  courseSessionDates,
  currentCicloForCourse,
  sessionInCiclo,
  type DateStatus,
} from '@/lib/schedule';
import type {
  DayType, ScheduleBlock, Course, Student, AttendanceMark, YearConfig,
} from '@/types';

const DEFAULT_YEAR = new Date().getFullYear();

export function TodayClasses() {
  const yearCfg = useLiveQuery(() => db.yearConfig.where('year').equals(DEFAULT_YEAR).first());
  const customDays = useLiveQuery(() => db.calendarDays.toArray()) ?? [];
  const schedule = useLiveQuery(() => db.schedule.toArray()) ?? [];
  const courses = useLiveQuery(() => db.courses.toArray()) ?? [];
  const students = useLiveQuery(() => db.students.toArray()) ?? [];
  const marks = useLiveQuery(() => db.attendanceMarks.toArray()) ?? [];

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
    trimStart: activeTrimStart(today, yearCfg) ?? yearCfg.startDate,
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
  trimStart: string;
}

interface ClassInfo {
  block: ScheduleBlock;
  ciclo: number | null;
  session: 1 | 2 | null;              // solo 11°
  confirmed: boolean;
  fallas: number;
  retardos: number;
  activos: number;
}

function statusToClasses(status: DateStatus | undefined, schedule: ScheduleBlock[]): ScheduleBlock[] {
  if (!status || status === 'weekend' || status === 'skip') return [];
  return classesForDayType(status as DayType, schedule);
}

function classInfo(block: ScheduleBlock, dateIso: string, ctx: CicloCtx): ClassInfo {
  const course = ctx.courses.find(c => c.code === block.courseCode);
  if (!course) {
    return { block, ciclo: null, session: null, confirmed: false, fallas: 0, retardos: 0, activos: 0 };
  }
  const trimSeq = new Map<string, DateStatus>();
  for (const [iso, s] of ctx.sequence) {
    if (iso >= ctx.trimStart) trimSeq.set(iso, s);
  }
  const sessionDates = courseSessionDates(block.courseCode, trimSeq, ctx.schedule);
  const sessionsPerCiclo = course.grade === 11 ? 2 : 1;
  const ciclo = currentCicloForCourse(dateIso, sessionDates, 9, sessionsPerCiclo);
  const session = sessionInCiclo(dateIso, sessionDates, sessionsPerCiclo);
  // Para 11° "confirmed" = existe mark para (ciclo, session). Para 8°-10° = mark(ciclo).
  const mark = ctx.marks.find(m =>
    m.courseId === course.id
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
  const classes = statusToClasses(status, ctx.schedule);

  const prettyDate = new Date(dateIso + 'T00:00:00')
    .toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs text-neutral-500 uppercase">{label}</div>
          <div className="text-sm capitalize">{prettyDate}</div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-medium ${
          status === 'FIJO' ? 'bg-amber-100 text-amber-800' :
          status === 'weekend' || status === 'skip' ? 'bg-neutral-100 text-neutral-600' :
          'bg-blue-100 text-blue-800'
        }`}>
          {dayTypeLabel(status)}
        </div>
      </div>

      {!isLive && (
        <p className="text-sm text-neutral-500">Sin clases programadas.</p>
      )}

      {isLive && classes.length === 0 && (
        <p className="text-sm text-neutral-500">
          No hay bloques definidos para este día.{' '}
          <Link href="/horario" className="underline">Configurar</Link>
        </p>
      )}

      {classes.length > 0 && (
        <ul className="space-y-1.5">
          {classes.map(b => {
            const ci = classInfo(b, dateIso, ctx);
            return <ClassRow key={b.id} block={b} info={ci} />;
          })}
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

  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="text-xs text-neutral-500 w-4 text-right">{block.block}</span>
      <span className="text-xs text-neutral-500 tabular-nums w-24">
        {block.startTime}–{block.endTime}
      </span>
      <Link href={href} className="font-medium hover:underline">
        {block.courseCode}
      </Link>
      {block.room && <span className="text-xs text-neutral-500">· {block.room}</span>}
      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>
        {badge.text}
      </span>
      {(info.fallas > 0 || info.retardos > 0) && (
        <span className="text-[10px] text-neutral-500 tabular-nums">
          {info.fallas}F · {info.retardos}R
        </span>
      )}
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
