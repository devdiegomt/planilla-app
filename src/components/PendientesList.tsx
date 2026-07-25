'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addTodo, updateTodo, deleteTodo } from '@/lib/db';
import { CURSOS_ORDER } from '@/lib/constants';
import type { Todo } from '@/types';

interface Props {
  /** Si se define, filtra pendientes por ese curso. */
  courseCode?: string;
  /** Máximo de items a mostrar; el resto se accede desde /pendientes. */
  limit?: number;
  /** Compacto = sin formulario de nuevo, solo lista. */
  compact?: boolean;
}

const PRIO_ORDER: Record<Todo['priority'], number> = { high: 0, medium: 1, low: 2 };
const PRIO_LABEL: Record<Todo['priority'], string> = {
  high: 'Alta', medium: 'Media', low: 'Baja',
};
const PRIO_BADGE: Record<Todo['priority'], string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-neutral-100 text-neutral-700',
};

export function PendientesList({ courseCode, limit, compact }: Props) {
  const all = useLiveQuery(() => db.todos.toArray(), []) ?? [];

  const filtered = useMemo(() => {
    let list = all;
    if (courseCode) list = list.filter(t => t.courseCode === courseCode);
    list = [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      const dp = PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
      if (dp !== 0) return dp;
      const ad = a.dueDate ?? '9999-99-99';
      const bd = b.dueDate ?? '9999-99-99';
      return ad.localeCompare(bd);
    });
    return list;
  }, [all, courseCode]);

  const visible = limit ? filtered.slice(0, limit) : filtered;
  const hidden = filtered.length - visible.length;

  return (
    <div className="space-y-3">
      {!compact && <NewTodoForm defaultCourseCode={courseCode} />}

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {courseCode ? 'Sin pendientes en este curso.' : 'Sin pendientes.'}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 border rounded-lg overflow-hidden">
          {visible.map(t => <TodoRow key={t.id} todo={t} showCourse={!courseCode} />)}
          {hidden > 0 && (
            <li className="p-2 text-center text-xs">
              <Link href="/pendientes" className="text-neutral-600 hover:underline">
                Ver {hidden} más
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function TodoRow({ todo, showCourse }: { todo: Todo; showCourse: boolean }) {
  const done = todo.status === 'done';
  const overdue = !done && todo.dueDate && todo.dueDate < todayIso();
  return (
    <li className={`px-3 py-2 flex items-center gap-2 text-sm ${done ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={done}
        onChange={e => updateTodo(todo.id!, { status: e.target.checked ? 'done' : 'pending' })}
        className="w-4 h-4"
      />
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${PRIO_BADGE[todo.priority]}`}>
        {PRIO_LABEL[todo.priority]}
      </span>
      <span className={`flex-1 ${done ? 'line-through' : ''}`}>{todo.title}</span>
      {showCourse && todo.courseCode && (
        <Link
          href={`/curso/${todo.courseCode}`}
          className="text-[11px] text-neutral-500 hover:text-neutral-800 shrink-0"
        >
          {todo.courseCode}
        </Link>
      )}
      {todo.dueDate && (
        <span className={`text-[11px] tabular-nums shrink-0 ${overdue ? 'text-red-700 font-medium' : 'text-neutral-500'}`}>
          {formatDate(todo.dueDate)}
        </span>
      )}
      <button
        onClick={() => deleteTodo(todo.id!)}
        className="text-[11px] text-neutral-400 hover:text-red-700"
        title="Borrar"
      >
        ✕
      </button>
    </li>
  );
}

function NewTodoForm({ defaultCourseCode }: { defaultCourseCode?: string }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Todo['priority']>('medium');
  const [dueDate, setDueDate] = useState('');
  const [courseCode, setCourseCode] = useState(defaultCourseCode ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await addTodo({
      title: title.trim(),
      priority,
      status: 'pending',
      dueDate: dueDate || undefined,
      courseCode: courseCode || undefined,
    });
    setTitle('');
    setDueDate('');
    setPriority('medium');
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 flex-wrap">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Nuevo pendiente..."
        className="flex-1 min-w-0 border rounded px-2 py-1 text-sm"
      />
      <select
        value={priority}
        onChange={e => setPriority(e.target.value as Todo['priority'])}
        className="border rounded px-2 py-1 text-sm"
      >
        <option value="high">Alta</option>
        <option value="medium">Media</option>
        <option value="low">Baja</option>
      </select>
      {!defaultCourseCode && (
        <select
          value={courseCode}
          onChange={e => setCourseCode(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">Sin curso</option>
          {CURSOS_ORDER.map(c => <option key={c} value={String(c)}>{c}</option>)}
        </select>
      )}
      <input
        type="date"
        value={dueDate}
        onChange={e => setDueDate(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={!title.trim()}
        className="px-3 py-1 rounded bg-neutral-900 text-white text-sm disabled:opacity-40"
      >
        Añadir
      </button>
    </form>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  if (diff > 1 && diff < 7) return `en ${diff}d`;
  if (diff < 0 && diff > -7) return `hace ${-diff}d`;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}
