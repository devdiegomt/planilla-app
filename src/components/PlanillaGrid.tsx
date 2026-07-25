'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, updateColumnValue } from '@/lib/db';
import {
  slotsFor, columnsFor,
  NOTA_APROBACION, NOTA_EXPERTO,
} from '@/lib/constants';
import { calcDef } from '@/lib/formula';
import type { Course } from '@/types';

interface Props {
  course: Course;
}

/**
 * Vista tipo "planilla digital" — un input por columna real de la plataforma
 * (C2..C9 + EV). Cuando una columna alimenta más de una categoría (ej. C4 en
 * K y C), el input se propaga a los slots correspondientes al guardar.
 * La definitiva usa el algoritmo real de la plataforma (ignore-zeros).
 */
export function PlanillaGrid({ course }: Props) {
  const students = useLiveQuery(
    () => db.students.where('courseId').equals(course.id!).sortBy('order'),
    [course.id]
  );

  if (!students) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const activos = students.filter(s => !s.withdrawnAt);
  const slots = slotsFor(course.grade);
  const columns = columnsFor(course.grade);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b bg-neutral-50 text-left">
            <th className="p-2 sticky left-0 bg-neutral-50">#</th>
            <th className="p-2 sticky left-8 bg-neutral-50">Estudiante</th>
            {columns.map(col => (
              <th
                key={col.column}
                className="p-2 text-center whitespace-nowrap"
                title={col.slotKeys.join(' + ')}
              >
                <div>{col.column}</div>
                <div className="text-[9px] text-neutral-500 font-normal">
                  {col.cats.join('·')}
                </div>
              </th>
            ))}
            <th className="p-2 text-center bg-neutral-100">DEF</th>
          </tr>
        </thead>
        <tbody>
          {activos.map((s, i) => {
            const def = calcDef(s.subnotas, slots, 'platform');
            const defColor = def.definitiva >= NOTA_EXPERTO ? 'text-green-700 font-semibold'
                           : def.definitiva >= NOTA_APROBACION ? 'text-neutral-800'
                           : 'text-red-700';
            return (
              <tr key={s.id} className="border-b hover:bg-neutral-50">
                <td className="p-2 sticky left-0 bg-white text-neutral-500">{i + 1}</td>
                <td className="p-2 sticky left-8 bg-white whitespace-nowrap">{s.nombre}</td>
                {columns.map(col => {
                  const value = s.subnotas[col.slotKeys[0]] ?? 0;
                  return (
                    <td key={col.column} className="p-1 text-center">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={value}
                        onChange={e => {
                          const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                          updateColumnValue(s.id!, col.slotKeys, v);
                        }}
                        className="w-12 text-center border rounded p-1"
                      />
                    </td>
                  );
                })}
                <td className={`p-2 text-center bg-neutral-50 ${defColor}`}>
                  {def.definitiva}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">
        {columns.length} columnas ({slots.length} slots internos) · {activos.length} activos ·
        Definitiva con algoritmo de la plataforma (ignore-zeros).
      </p>
    </div>
  );
}
