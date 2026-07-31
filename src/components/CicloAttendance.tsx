'use client';

import { useMemo, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  updateAttendance,
  updateSessionAttendance,
  confirmAttendance,
  unconfirmAttendance,
} from '@/lib/db';
import {
  cycleMarkState, sessionMarkState, nextMarkState,
  markLabel, markDescription,
  type MarkKind, type MarkState,
} from '@/lib/attendance';
import { ExportAttendance } from './ExportAttendance';
import type { Course, Student } from '@/types';

interface Props {
  course: Course;
  initialCiclo?: number;
}

/**
 * Editor de F/R por ciclo.
 * - 8°–10°: dos marcas F/R por estudiante, un botón "Confirmar ciclo N".
 * - 11°: cuatro marcas F1/R1/F2/R2, dos botones "Confirmar S1" y "Confirmar S2".
 *
 * Cada marca es un botón de tres estados (sin marca → injustificada →
 * justificada) en vez de un checkbox: Classroom Live distingue justificadas y
 * un checkbox no da para tres. Se mantiene un control por celda para no perder
 * densidad en cursos de 28 estudiantes.
 */
export function CicloAttendance({ course, initialCiclo = 1 }: Props) {
  const isEleven = course.grade === 11;
  const [ciclo, setCiclo] = useState(clamp(initialCiclo, 1, 9));

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
      if (isEleven) {
        if (c.S1?.F) F1++;
        if (c.S1?.R) R1++;
        if (c.S2?.F) F2++;
        if (c.S2?.R) R2++;
      }
    }
    return { F, Fj, R, Rj, F1, R1, F2, R2 };
  }, [activos, ciclo, isEleven]);

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
          {isEleven
            ? ` · S1: ${stats.F1}F/${stats.R1}R · S2: ${stats.F2}F/${stats.R2}R`
            : ` · ${stats.F}F${stats.Fj ? ` (${stats.Fj}j)` : ''}`
              + ` · ${stats.R}R${stats.Rj ? ` (${stats.Rj}j)` : ''}`}
        </span>
        <div className="ml-auto flex items-start gap-3 flex-wrap justify-end">
          {isEleven ? (
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
              {isEleven ? (
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
            </tr>
          </thead>
          <tbody>
            {activos.map((s, i) => {
              const c = s.cycles.find(x => x.ciclo === ciclo);
              return (
                <tr key={s.id} className="border-b hover:bg-neutral-50">
                  <td className="p-2 text-neutral-400">{i + 1}</td>
                  <td className="p-2 whitespace-nowrap">{s.nombre}</td>
                  {isEleven ? (
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
