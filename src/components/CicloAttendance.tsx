'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  updateAttendance,
  updateSessionAttendance,
  confirmAttendance,
  unconfirmAttendance,
  updateAttendanceObservation,
} from '@/lib/db';
import {
  cycleMarkState, sessionMarkState, nextMarkState,
  markLabel, markDescription,
  type MarkKind, type MarkState,
} from '@/lib/attendance';
import { computeDayTypes } from '@/lib/schedule';
import { buildCycleContext, sessionDatesOf } from '@/lib/cycles';
import { ExportAttendance } from './ExportAttendance';
import type { Course, Student } from '@/types';

interface Props {
  course: Course;
  initialCiclo?: number;
}

/**
 * Editor de F/R por ciclo.
 *
 * Si el ciclo trae UNA clase del curso: dos marcas F/R y un botón "Confirmar
 * ciclo N". Si trae DOS: cuatro marcas F1/R1/F2/R2 y un confirmar por sesión,
 * porque el colegio registra la asistencia de cada fecha por separado.
 *
 * Eso pasa siempre en 11° (ocupa dos tipos de día) y también en los cursos del
 * viernes cuando al ciclo le caen dos viernes — no se decide por el grado.
 *
 * Cada marca es un botón de tres estados (sin marca → injustificada →
 * justificada) en vez de un checkbox: Classroom Live distingue justificadas y
 * un checkbox no da para tres. Se mantiene un control por celda para no perder
 * densidad en cursos de 28 estudiantes.
 */
export function CicloAttendance({ course, initialCiclo = 1 }: Props) {
  const [ciclo, setCiclo] = useState(clamp(initialCiclo, 1, 9));

  const yearCfg = useLiveQuery(() => db.yearConfig.where('year').equals(course.year).first(), [course.year]);
  const customDays = useLiveQuery(() => db.calendarDays.toArray(), []) ?? [];
  const schedule = useLiveQuery(() => db.schedule.toArray(), []) ?? [];

  /*
   * Cuántas clases tiene ESTE curso en ESTE ciclo. Antes se asumía "dos si es
   * 11°, una si no", pero un curso del viernes también puede tener dos cuando
   * al ciclo le caen dos viernes — y entonces el colegio registra la asistencia
   * de cada fecha por separado.
   */
  const sessionDates = useMemo(() => {
    if (!yearCfg || schedule.length === 0) return [];
    const seq = computeDayTypes(
      yearCfg.startDate, yearCfg.initialDayType, `${yearCfg.year}-12-31`, customDays, true,
    );
    const ctx = buildCycleContext(seq, schedule, [course], yearCfg);
    return sessionDatesOf(ctx, course.code, ciclo);
  }, [yearCfg, schedule, customDays, course, ciclo]);

  const porSesion = sessionDates.length > 1;

  useEffect(() => setCiclo(clamp(initialCiclo, 1, 9)), [initialCiclo]);

  const students = useLiveQuery(
    () => db.students.where('courseId').equals(course.id!).sortBy('order'),
    [course.id],
  );
  const marks = useLiveQuery(
    () => db.attendanceMarks
      .where('[courseId+ciclo]').equals([course.id!, ciclo]).toArray(),
    [course.id, ciclo],
  ) ?? [];

  const activos: Student[] = useMemo(
    () => (students ?? []).filter(s => !s.withdrawnAt),
    [students],
  );

  const markCiclo = marks.find(m => m.session == null);
  const markS1 = marks.find(m => m.session === 1);
  const markS2 = marks.find(m => m.session === 2);

  const stats = useMemo(() => {
    let F = 0, Fj = 0, R = 0, Rj = 0, F1 = 0, R1 = 0, F2 = 0, R2 = 0;
    for (const s of activos) {
      const c = s.cycles.find(x => x.ciclo === ciclo);
      if (!c) continue;
      if (c.F) { F++; if (c.Fj) Fj++; }
      if (c.R) { R++; if (c.Rj) Rj++; }
      if (porSesion) {
        if (c.S1?.F) F1++;
        if (c.S1?.R) R1++;
        if (c.S2?.F) F2++;
        if (c.S2?.R) R2++;
      }
    }
    return { F, Fj, R, Rj, F1, R1, F2, R2 };
  }, [activos, ciclo, porSesion]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <header className="px-4 py-3 bg-neutral-50 border-b flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium">Asistencia · Ciclo</span>
        <select
          value={ciclo}
          onChange={e => setCiclo(parseInt(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {Array.from({ length: 9 }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className="text-xs text-neutral-500">
          {activos.length} activos
          {porSesion
            ? ` · S1: ${stats.F1}F/${stats.R1}R · S2: ${stats.F2}F/${stats.R2}R`
            : ` · ${stats.F}F${stats.Fj ? ` (${stats.Fj}j)` : ''}`
              + ` · ${stats.R}R${stats.Rj ? ` (${stats.Rj}j)` : ''}`}
        </span>
        <div className="ml-auto flex items-start gap-3 flex-wrap justify-end">
          {porSesion ? (
            <>
              <div className="flex items-start gap-2">
                <ConfirmButton
                  label="S1" mark={markS1}
                  onConfirm={() => confirmAttendance(course.id!, ciclo, 1)}
                  onUndo={() => unconfirmAttendance(course.id!, ciclo, 1)}
                />
                <ExportAttendance
                  course={course} students={activos} ciclo={ciclo} session={1}
                />
              </div>
              <div className="flex items-start gap-2">
                <ConfirmButton
                  label="S2" mark={markS2}
                  onConfirm={() => confirmAttendance(course.id!, ciclo, 2)}
                  onUndo={() => unconfirmAttendance(course.id!, ciclo, 2)}
                />
                <ExportAttendance
                  course={course} students={activos} ciclo={ciclo} session={2}
                />
              </div>
            </>
          ) : (
            <>
              <ConfirmButton
                label={`ciclo ${ciclo}`} mark={markCiclo}
                onConfirm={() => confirmAttendance(course.id!, ciclo)}
                onUndo={() => unconfirmAttendance(course.id!, ciclo)}
              />
              <ExportAttendance course={course} students={activos} ciclo={ciclo} />
            </>
          )}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-white border-b text-neutral-500">
            <tr>
              <th className="p-2 text-left w-8">#</th>
              <th className="p-2 text-left">Estudiante</th>
              {porSesion ? (
                <>
                  <th className="p-2 text-center w-14">F1</th>
                  <th className="p-2 text-center w-14">R1</th>
                  <th className="p-2 text-center w-14">F2</th>
                  <th className="p-2 text-center w-14">R2</th>
                </>
              ) : (
                <>
                  <th className="p-2 text-center w-16">F</th>
                  <th className="p-2 text-center w-16">R</th>
                </>
              )}
              <th className="p-2 text-center w-10" title="Razón de la falla o el retardo">
                Razón
              </th>
            </tr>
          </thead>
          <tbody>
            {activos.map((s, i) => {
              const c = s.cycles.find(x => x.ciclo === ciclo);
              return (
                <tr key={s.id} className="border-b hover:bg-neutral-50">
                  <td className="p-2 text-neutral-400">{i + 1}</td>
                  <td className="p-2 whitespace-nowrap">{s.nombre}</td>
                  {porSesion ? (
                    ([1, 2] as const).flatMap(sess =>
                      (['F', 'R'] as const).map(kind => (
                        <MarkCell
                          key={`${sess}${kind}`}
                          kind={kind}
                          state={sessionMarkState(sess === 1 ? c?.S1 : c?.S2, kind)}
                          onCycle={next => updateSessionAttendance(s.id!, ciclo, sess, kind, next)}
                          student={s.nombre}
                        />
                      )),
                    )
                  ) : (
                    (['F', 'R'] as const).map(kind => (
                      <MarkCell
                        key={kind}
                        kind={kind}
                        state={cycleMarkState(c, kind)}
                        onCycle={next => updateAttendance(s.id!, ciclo, kind, next)}
                        student={s.nombre}
                      />
                    ))
                  )}
                  <ReasonCell
                    student={s.nombre}
                    ciclo={ciclo}
                    porSesion={porSesion}
                    obsCiclo={c?.obs ?? ''}
                    obsS1={c?.S1?.obs ?? ''}
                    obsS2={c?.S2?.obs ?? ''}
                    onSave={(sess, texto) =>
                      updateAttendanceObservation(s.id!, ciclo, sess, texto)}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t bg-neutral-50 flex items-center gap-3 flex-wrap text-[11px] text-neutral-600">
        <span>Click para ciclar:</span>
        <LegendChip cls="bg-white border-neutral-200 text-neutral-300" label="·" text="sin marca" />
        <LegendChip cls="bg-red-600 border-red-600 text-white" label="F" text="falla injustificada" />
        <LegendChip cls="bg-red-50 border-red-400 text-red-700" label="FJ" text="falla justificada" />
        <LegendChip cls="bg-amber-500 border-amber-500 text-white" label="R" text="retardo injustificado" />
        <LegendChip cls="bg-amber-50 border-amber-400 text-amber-700" label="RJ" text="retardo justificado" />
      </div>
    </div>
  );
}

function LegendChip({ cls, label, text }: { cls: string; label: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center justify-center w-7 h-5 rounded border text-[10px] font-semibold ${cls}`}>
        {label}
      </span>
      {text}
    </span>
  );
}

/**
 * Razón de la falla o el retardo, en un popover.
 *
 * Sirve tanto para dejar el motivo ("cita médica", "se fue a enfermería") como
 * para anotar en vivo lo que todavía no se resuelve ("aún no llega"). Cuando el
 * ciclo trae dos clases se piden por separado: son días distintos.
 */
function ReasonCell({
  student, ciclo, porSesion, obsCiclo, obsS1, obsS2, onSave,
}: {
  student: string;
  ciclo: number;
  porSesion: boolean;
  obsCiclo: string;
  obsS1: string;
  obsS2: string;
  onSave: (session: 1 | 2 | null, texto: string) => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [d0, setD0] = useState(obsCiclo);
  const [d1, setD1] = useState(obsS1);
  const [d2, setD2] = useState(obsS2);
  const ref = useRef<HTMLTableCellElement | null>(null);

  const hay = porSesion ? !!(obsS1 || obsS2) : !!obsCiclo;
  const resumen = porSesion
    ? [obsS1 && `S1: ${obsS1}`, obsS2 && `S2: ${obsS2}`].filter(Boolean).join('\n')
    : obsCiclo;

  // Sincronizar los borradores cuando cambia el dato externo (sync, otro ciclo).
  useEffect(() => {
    if (!open) { setD0(obsCiclo); setD1(obsS1); setD2(obsS2); }
  }, [open, obsCiclo, obsS1, obsS2]);

  /*
   * Las dos sesiones se guardan EN SERIE, no en paralelo. Cada escritura hace
   * un lee-muta-escribe sobre la misma fila del estudiante: dispararlas juntas
   * hacía que la segunda leyera antes de que la primera hubiera guardado, y la
   * razón de S1 se perdía en silencio.
   */
  const guardarYCerrar = async () => {
    setOpen(false);
    if (porSesion) {
      if (d1 !== obsS1) await onSave(1, d1);
      if (d2 !== obsS2) await onSave(2, d2);
    } else if (d0 !== obsCiclo) {
      await onSave(null, d0);
    }
  };

  useEffect(() => {
    if (!open) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) guardarYCerrar();
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, d0, d1, d2]);

  const campo = (label: string, val: string, set: (v: string) => void) => (
    <label className="block">
      {porSesion && <span className="text-[10px] text-neutral-500">{label}</span>}
      <textarea
        value={val}
        onChange={e => set(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setD0(obsCiclo); setD1(obsS1); setD2(obsS2); setOpen(false); }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardarYCerrar();
        }}
        rows={2}
        placeholder="Aún no llega, cita médica, se fue a enfermería…"
        className="w-full text-xs border rounded p-1.5 resize-y min-h-[44px]"
      />
    </label>
  );

  return (
    <td className="p-1 text-center relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Razón · ${student}`}
        title={hay ? resumen : 'Anotar razón'}
        className={`text-[11px] leading-none px-1 py-1 rounded hover:bg-neutral-100 ${
          hay ? 'text-blue-700' : 'text-neutral-300'
        }`}
      >
        {hay ? '💬' : '＋'}
      </button>

      {open && (
        <div className="absolute z-30 top-full right-0 mt-1 w-60 bg-white border border-neutral-300
                        rounded-md shadow-lg p-2 text-left space-y-1.5">
          <div className="text-[10px] text-neutral-500 flex justify-between">
            <span className="truncate max-w-[150px]" title={student}>{student}</span>
            <span className="font-medium text-neutral-800">Ciclo {ciclo}</span>
          </div>
          {porSesion ? (
            <>
              {campo('Sesión 1', d1, setD1)}
              {campo('Sesión 2', d2, setD2)}
            </>
          ) : (
            campo('', d0, setD0)
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-neutral-400">Ctrl+Enter guarda</span>
            <button
              type="button"
              onClick={guardarYCerrar}
              className="text-[11px] px-2 py-0.5 rounded bg-neutral-900 text-white"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </td>
  );
}

/**
 * Marca de asistencia de tres estados. El relleno sólido señala injustificada
 * (lo que cuenta en contra) y el contorno, justificada — así se distingue la
 * gravedad de un vistazo sin leer la etiqueta.
 */
function MarkCell({
  kind, state, onCycle, student,
}: {
  kind: MarkKind;
  state: MarkState;
  onCycle: (next: MarkState) => void | Promise<unknown>;
  student: string;
}) {
  const palette: Record<MarkState, string> = kind === 'F'
    ? {
        none: 'bg-white border-neutral-200 text-neutral-300 hover:border-neutral-400',
        injustificada: 'bg-red-600 border-red-600 text-white',
        justificada: 'bg-red-50 border-red-400 text-red-700',
      }
    : {
        none: 'bg-white border-neutral-200 text-neutral-300 hover:border-neutral-400',
        injustificada: 'bg-amber-500 border-amber-500 text-white',
        justificada: 'bg-amber-50 border-amber-400 text-amber-700',
      };

  return (
    <td className="p-1 text-center">
      <button
        type="button"
        onClick={() => onCycle(nextMarkState(state))}
        aria-label={`${student} · ${markDescription(kind, state)}`}
        title={`${markDescription(kind, state)} — click para cambiar`}
        className={`w-9 h-7 rounded border text-[11px] font-semibold tabular-nums
                    transition-colors ${palette[state]}`}
      >
        {markLabel(kind, state)}
      </button>
    </td>
  );
}

function ConfirmButton({
  label, mark, onConfirm, onUndo,
}: {
  label: string;
  mark: { confirmedAt: string } | undefined;
  onConfirm: () => void | Promise<unknown>;
  onUndo: () => void | Promise<unknown>;
}) {
  if (mark) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-green-700 font-medium">
          ✓ {label} · {new Date(mark.confirmedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
        <button
          onClick={() => onUndo()}
          className="text-xs text-neutral-600 hover:text-neutral-900 underline"
        >
          desmarcar
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => onConfirm()}
      className="px-3 py-1 rounded-md bg-neutral-900 text-white text-xs font-medium"
    >
      Confirmar {label}
    </button>
  );
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(Math.max(x, lo), hi);
}
