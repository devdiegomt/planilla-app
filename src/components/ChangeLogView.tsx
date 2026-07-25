'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { Course } from '@/types';

interface Props {
  course: Course;
}

const DEFAULT_LIMIT = 25;

export function ChangeLogView({ course }: Props) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);

  const entries = useLiveQuery(
    () => db.changeLog
      .where('courseId').equals(course.id!)
      .reverse()
      .sortBy('at')
      .then(rows => rows.slice(0, limit)),
    [course.id, limit],
  ) ?? [];

  const total = useLiveQuery(
    () => db.changeLog.where('courseId').equals(course.id!).count(),
    [course.id],
  ) ?? 0;

  const clearAll = async () => {
    if (!confirm(`Vas a borrar el historial de ${total} ediciones del curso ${course.code}. ¿Continuar?`)) return;
    await db.changeLog.where('courseId').equals(course.id!).delete();
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <header
        className="px-4 py-2.5 bg-neutral-50 border-b flex items-center justify-between cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">{open ? '▾' : '▸'}</span>
          <span className="font-medium">Historial de ediciones</span>
          <span className="text-xs text-neutral-500">{total} entradas</span>
        </div>
        {open && total > 0 && (
          <button
            onClick={e => { e.stopPropagation(); clearAll(); }}
            className="text-xs text-red-600 hover:text-red-800 underline"
          >
            Borrar historial
          </button>
        )}
      </header>

      {open && (
        <div>
          {entries.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">
              Aún no has editado nada en este curso.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 max-h-72 overflow-y-auto">
              {entries.map(e => (
                <li key={e.id} className="px-4 py-1.5 text-sm flex items-baseline gap-3">
                  <span className="text-[10px] text-neutral-400 tabular-nums w-32 shrink-0">
                    {formatWhen(e.at)}
                  </span>
                  <span className="text-xs text-neutral-500 truncate w-48 shrink-0" title={e.studentName}>
                    {e.studentName}
                  </span>
                  <span className={`text-xs ${e.kind === 'nota' ? 'text-neutral-900' : 'text-amber-800'}`}>
                    {e.summary}
                  </span>
                </li>
              ))}
              {total > entries.length && (
                <li className="px-4 py-2 text-xs text-neutral-500 text-center">
                  <button
                    onClick={() => setLimit(l => l + 50)}
                    className="underline hover:text-neutral-800"
                  >
                    Ver 50 más ({total - entries.length} restantes)
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}
