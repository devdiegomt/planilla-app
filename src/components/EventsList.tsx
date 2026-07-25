'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addEvent, deleteEvent } from '@/lib/db';
import { CURSOS_ORDER } from '@/lib/constants';
import type { CalendarEvent } from '@/types';

interface Props {
  /** Si se define, filtra eventos por ese curso. */
  courseCode?: string;
  /** Fecha ISO por defecto en el formulario (útil desde el popover del calendario). */
  defaultDate?: string;
  /** Solo mostrar eventos futuros (o de hoy). */
  onlyUpcoming?: boolean;
  /** Máximo de items a mostrar. */
  limit?: number;
  /** Ocultar formulario, solo listar. */
  compact?: boolean;
}

const KIND_LABEL: Record<CalendarEvent['kind'], string> = {
  entrega: 'Entrega',
  actividad: 'Actividad',
  festivo: 'Festivo',
  otro: 'Otro',
};

const KIND_COLOR: Record<CalendarEvent['kind'], string> = {
  entrega: 'bg-red-500',
  actividad: 'bg-blue-500',
  festivo: 'bg-neutral-500',
  otro: 'bg-neutral-400',
};

const KIND_BADGE: Record<CalendarEvent['kind'], string> = {
  entrega: 'bg-red-100 text-red-800',
  actividad: 'bg-blue-100 text-blue-800',
  festivo: 'bg-neutral-100 text-neutral-700',
  otro: 'bg-neutral-100 text-neutral-700',
};

export function EventsList({
  courseCode, defaultDate, onlyUpcoming, limit, compact,
}: Props) {
  const all = useLiveQuery(() => db.events.toArray(), []) ?? [];

  const filtered = useMemo(() => {
    let list = all;
    if (courseCode) list = list.filter(e => e.courseCode === courseCode);
    if (onlyUpcoming) {
      const today = todayIso();
      list = list.filter(e => e.date >= today);
    }
    list = [...list].sort((a, b) => a.date.localeCompare(b.date));
    return list;
  }, [all, courseCode, onlyUpcoming]);

  const visible = limit ? filtered.slice(0, limit) : filtered;
  const hidden = filtered.length - visible.length;

  return (
    <div className="space-y-3">
      {!compact && <NewEventForm defaultCourseCode={courseCode} defaultDate={defaultDate} />}

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {onlyUpcoming ? 'Sin próximas entregas.' : 'Sin eventos.'}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 border rounded-lg overflow-hidden">
          {visible.map(e => <EventRow key={e.id} ev={e} showCourse={!courseCode} />)}
          {hidden > 0 && (
            <li className="p-2 text-center text-xs text-neutral-500">
              +{hidden} más
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function EventRow({ ev, showCourse }: { ev: CalendarEvent; showCourse: boolean }) {
  const isPast = ev.date < todayIso();
  return (
    <li className={`px-3 py-2 flex items-center gap-2 text-sm ${isPast ? 'opacity-60' : ''}`}>
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${KIND_BADGE[ev.kind]}`}>
        {KIND_LABEL[ev.kind]}
      </span>
      <span className="flex-1 truncate" title={ev.description ?? ev.title}>
        {ev.title}
      </span>
      {showCourse && ev.courseCode && (
        <Link
          href={`/curso/${ev.courseCode}`}
          className="text-[11px] text-neutral-500 hover:text-neutral-800 shrink-0"
        >
          {ev.courseCode}
        </Link>
      )}
      <span className="text-[11px] text-neutral-500 tabular-nums shrink-0">
        {formatDate(ev.date)}
      </span>
      <button
        onClick={() => deleteEvent(ev.id!)}
        className="text-[11px] text-neutral-400 hover:text-red-700"
        title="Borrar"
      >
        ✕
      </button>
    </li>
  );
}

function NewEventForm({
  defaultCourseCode, defaultDate,
}: {
  defaultCourseCode?: string;
  defaultDate?: string;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CalendarEvent['kind']>('entrega');
  const [date, setDate] = useState(defaultDate ?? todayIso());
  const [courseCode, setCourseCode] = useState(defaultCourseCode ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    await addEvent({
      title: title.trim(),
      date,
      kind,
      courseCode: courseCode || undefined,
    });
    setTitle('');
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2 flex-wrap">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Ej. Entrega proyecto final..."
        className="flex-1 min-w-0 border rounded px-2 py-1 text-sm"
      />
      <select
        value={kind}
        onChange={e => setKind(e.target.value as CalendarEvent['kind'])}
        className="border rounded px-2 py-1 text-sm"
      >
        <option value="entrega">Entrega</option>
        <option value="actividad">Actividad</option>
        <option value="otro">Otro</option>
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
        value={date}
        onChange={e => setDate(e.target.value)}
        className="border rounded px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={!title.trim() || !date}
        className="px-3 py-1 rounded bg-neutral-900 text-white text-sm disabled:opacity-40"
      >
        Añadir
      </button>
    </form>
  );
}

export function eventDotColor(kind: CalendarEvent['kind']): string {
  return KIND_COLOR[kind];
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
  if (diff > 1 && diff < 8) return `en ${diff}d`;
  if (diff < 0 && diff > -8) return `hace ${-diff}d`;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}
