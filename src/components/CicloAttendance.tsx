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
import type { Course, Student } from '@/types';

interface Props {
  course: Course;
  initialCiclo?: number;
}

/**
 * Editor de F/R por ciclo.
 * - 8°–10°: dos checkboxes F/R por estudiante, un botón "Confirmar ciclo N".
 * - 11°: cuatro checkboxes F1/R1/F2/R2, dos botones "Confirmar S1" y "Confirmar S2".
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
    let F = 0, R = 0, F1 = 0, R1 = 0, F2 = 0, R2 = 0;
    for (const s of activos) {
      const c = s.cycles.find(x => x.ciclo === ciclo);
      if (!c) continue;
      if (c.F) F++;
      if (c.R) R++;
      if (isEleven) {
        if (c.S1?.F) F1++;
        if (c.S1?.R) R1++;
        if (c.S2?.F) F2++;
        if (c.S2?.R) R2++;
      }
    }
    return { F, R, F1, R1, F2, R2 };
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
            : ` · ${stats.F}F · ${stats.R}R`}
        </span>
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {isEleven ? (
            <>
              <ConfirmButton
                label="S1" mark={markS1}
                onConfirm={() => confirmAttendance(course.id!, ciclo, 1)}
                onUndo={() => unconfirmAttendance(course.id!, ciclo, 1)}
              />
              <ConfirmButton
                label="S2" mark={markS2}
                onConfirm={() => confirmAttendance(course.id!, ciclo, 2)}
                onUndo={() => unconfirmAttendance(course.id!, ciclo, 2)}
              />
            </>
          ) : (
            <ConfirmButton
              label={`ciclo ${ciclo}`} mark={markCiclo}
              onConfirm={() => confirmAttendance(course.id!, ciclo)}
              onUndo={() => unconfirmAttendance(course.id!, ciclo)}
            />
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
                    <>
                      <SessionCheck
                        checked={c?.S1?.F ?? false}
                        color="red"
                        onChange={v => updateSessionAttendance(s.id!, ciclo, 1, 'F', v)}
                      />
                      <SessionCheck
                        checked={c?.S1?.R ?? false}
                        color="amber"
                        onChange={v => updateSessionAttendance(s.id!, ciclo, 1, 'R', v)}
                      />
                      <SessionCheck
                        checked={c?.S2?.F ?? false}
                        color="red"
                        onChange={v => updateSessionAttendance(s.id!, ciclo, 2, 'F', v)}
                      />
                      <SessionCheck
                        checked={c?.S2?.R ?? false}
                        color="amber"
                        onChange={v => updateSessionAttendance(s.id!, ciclo, 2, 'R', v)}
                      />
                    </>
                  ) : (
                    <>
                      <SessionCheck
                        checked={c?.F ?? false}
                        color="red"
                        onChange={v => updateAttendance(s.id!, ciclo, 'F', v)}
                      />
                      <SessionCheck
                        checked={c?.R ?? false}
                        color="amber"
                        onChange={v => updateAttendance(s.id!, ciclo, 'R', v)}
                      />
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SessionCheck({
  checked, color, onChange,
}: {
  checked: boolean;
  color: 'red' | 'amber';
  onChange: (v: boolean) => void;
}) {
  const cls = color === 'red' ? 'accent-red-600' : 'accent-amber-600';
  return (
    <td className="p-2 text-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className={`w-4 h-4 ${cls}`}
      />
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
