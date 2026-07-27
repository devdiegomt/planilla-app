'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, updateColumnValue, updateColumnObservation } from '@/lib/db';
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
 * Cada celda soporta una observación docente por columna (popover con textarea).
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
            {columns.map(col => {
              const isEv = col.cats.length === 1 && col.cats[0] === 'E';
              return (
                <th
                  key={col.column}
                  className={`p-2 text-center whitespace-nowrap ${
                    isEv ? 'bg-amber-100 border-x-2 border-amber-400' : ''
                  }`}
                  title={
                    isEv
                      ? `${col.slotKeys.join(' + ')} · Nota de evaluación: 100% de la categoría E (peso 20% de la DEF)`
                      : col.slotKeys.join(' + ')
                  }
                >
                  <div className={isEv ? 'font-bold text-amber-900' : ''}>
                    {col.column}
                    {isEv && <span className="ml-1 text-[11px]">★</span>}
                  </div>
                  <div className={`text-[9px] font-normal ${isEv ? 'text-amber-800' : 'text-neutral-500'}`}>
                    {col.cats.join('·')}
                  </div>
                </th>
              );
            })}
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
                  const observation = s.noteObservations?.[col.column] ?? '';
                  const isEv = col.cats.length === 1 && col.cats[0] === 'E';
                  return (
                    <NoteCell
                      key={col.column}
                      studentId={s.id!}
                      studentName={s.nombre}
                      column={col.column}
                      slotKeys={col.slotKeys}
                      value={value}
                      observation={observation}
                      isEv={isEv}
                    />
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
        <span className="ml-2 text-amber-800">
          ★ C7 (EV) es toda la categoría E — un cambio ahí mueve la DEF ~4 pts.
        </span>
        <span className="ml-2 text-neutral-500">
          · Click en 📝 para observación · fondo rojo = nota &lt; {NOTA_APROBACION}
        </span>
      </p>
    </div>
  );
}

/**
 * Celda con input de nota + botón de observación (popover con textarea).
 */
function NoteCell({
  studentId, studentName, column, slotKeys, value, observation, isEv,
}: {
  studentId: number;
  studentName: string;
  column: string;
  slotKeys: string[];
  value: number;
  observation: string;
  isEv: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(observation);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Cuando cambia la observación externa (por sync/pull), sincronizar el draft si el popover está cerrado
  useEffect(() => {
    if (!open) setDraft(observation);
  }, [observation, open]);

  // Cerrar popover al click afuera
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        commitAndClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  // Autofocus del textarea al abrir
  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  const commitAndClose = () => {
    if (draft !== observation) updateColumnObservation(studentId, column, draft);
    setOpen(false);
  };

  // Fondo rojo del input si la nota reprueba (0 se considera "sin calificar")
  const isFailing = value > 0 && value < NOTA_APROBACION;

  const cellBg = isEv ? 'bg-amber-50 border-x-2 border-amber-400' : '';
  const inputColor = isFailing
    ? 'bg-red-100 border-red-400 text-red-900 font-semibold'
    : isEv
    ? 'border-amber-500 font-semibold'
    : '';

  return (
    <td className={`p-1 text-center ${cellBg} relative`}>
      <div className="inline-flex items-center gap-0.5">
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={e => {
            const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
            updateColumnValue(studentId, slotKeys, v);
          }}
          className={`w-12 text-center border rounded p-1 ${inputColor}`}
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title={observation ? `Obs: ${observation}` : 'Añadir observación'}
          className={`text-[11px] leading-none px-0.5 hover:text-neutral-900 ${
            observation ? 'text-blue-700' : 'text-neutral-300'
          }`}
        >
          {observation ? '📝' : '＋'}
        </button>
      </div>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1 w-64 bg-white border border-neutral-300 rounded-md shadow-lg p-2 text-left"
        >
          <div className="text-[10px] text-neutral-500 mb-1 flex items-baseline justify-between">
            <span className="truncate max-w-[130px]" title={studentName}>
              {studentName}
            </span>
            <span className="font-medium text-neutral-800 ml-2">
              {column} · {value || '–'}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setDraft(observation); setOpen(false); }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitAndClose();
            }}
            rows={3}
            placeholder="Razón de la nota, contexto, feedback…"
            className="w-full text-xs border rounded p-1.5 resize-y min-h-[60px]"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-neutral-400">
              Ctrl+Enter guarda · Esc cancela
            </span>
            <div className="flex gap-2">
              {observation && (
                <button
                  type="button"
                  onClick={() => { setDraft(''); }}
                  className="text-[11px] text-red-600 hover:underline"
                >
                  Borrar
                </button>
              )}
              <button
                type="button"
                onClick={commitAndClose}
                className="text-[11px] px-2 py-0.5 rounded bg-neutral-900 text-white"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </td>
  );
}
