'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addEvent, updateEvent, deleteEvent } from '@/lib/db';
import { sortedCourseCodes } from '@/lib/courseOrder';
import { minutesBetween } from '@/lib/horarioGrid';
import { upcomingEvents, eventLastDate } from '@/lib/dayAgenda';
import { todayIso } from '@/lib/schedule';
import { FormModal, Campo, HorasCampo, Botones } from './FormModal';
import type { CalendarEvent } from '@/types';

/**
 * Lo temporal: lo que pasa una vez y no todas las semanas.
 *
 * El horario se repite en cada vuelta de la rotación, así que no sirve para la
 * reunión de proyecto de esta semana ni para el reemplazo de mañana — quedarían
 * puestos para siempre y tocaría acordarse de borrarlos. Esto va con fecha y se
 * vence solo.
 */

export type TempEventDraft = Omit<CalendarEvent, 'kind'> & { kind?: CalendarEvent['kind'] };

const TIPOS: { valor: CalendarEvent['kind']; texto: string }[] = [
  { valor: 'actividad', texto: 'Actividad' },
  { valor: 'reemplazo', texto: 'Reemplazo' },
  { valor: 'entrega', texto: 'Entrega' },
  { valor: 'otro', texto: 'Otro' },
];

export function TempEventEditor({
  draft, onClose,
}: {
  draft: TempEventDraft;
  onClose: () => void;
}) {
  const cursos = sortedCourseCodes(useLiveQuery(() => db.courses.toArray(), []) ?? []);
  const [e, setE] = useState<TempEventDraft>(draft);
  const set = (patch: Partial<TempEventDraft>) => setE(prev => ({ ...prev, ...patch }));
  const kind = e.kind ?? 'actividad';

  const start = e.startTime ?? '';
  const end = e.endTime ?? '';
  const minutos = minutesBetween(start, end);
  // Sin hora vale: queda como algo de todo el día. Lo que no vale es media hora.
  const horasOk = (!start && !end) || minutos > 0;
  const puedeGuardar = !!e.title?.trim() && !!e.date && horasOk;

  const guardar = async () => {
    if (!puedeGuardar) return;
    const fila = {
      title: e.title!.trim(),
      date: e.date!,
      // Un fin anterior al inicio no es un rango: se guarda como un solo día.
      endDate: e.endDate && e.endDate > e.date! ? e.endDate : undefined,
      startTime: start || undefined,
      endTime: end || undefined,
      kind,
      courseCode: e.courseCode || undefined,
      description: e.description?.trim() || undefined,
    };
    if (e.id) await updateEvent(e.id, fila);
    else await addEvent(fila);
    onClose();
  };

  const borrar = async () => {
    if (!e.id) return;
    if (!confirm(`¿Borrar “${e.title}”?`)) return;
    await deleteEvent(e.id);
    onClose();
  };

  return (
    <FormModal label={e.id ? 'Editar' : 'Algo temporal'} onClose={onClose}>
      <h2 className="font-medium">{e.id ? 'Editar' : 'Algo temporal'}</h2>
      <p className="text-xs text-neutral-500">
        Pasa en estas fechas y no todas las semanas. Sale en tu día y en el
        calendario, y cuando la fecha pasa deja de aparecer solo.
      </p>

      <Campo label="Qué es">
        <div className="grid grid-cols-4 gap-1.5">
          {TIPOS.map(t => (
            <button
              key={t.valor}
              onClick={() => set({ kind: t.valor })}
              aria-pressed={kind === t.valor}
              className={`px-1.5 py-1.5 rounded-md border text-xs ${
                kind === t.valor ? 'boton-primario border-neutral-900' : 'bg-white'
              }`}
            >
              {t.texto}
            </button>
          ))}
        </div>
      </Campo>

      <Campo
        label="Título"
        hint={kind === 'reemplazo' ? 'Escribe aquí el curso: “Reemplazo 903”.' : undefined}
      >
        <input
          type="text"
          value={e.title ?? ''}
          onChange={ev => set({ title: ev.target.value })}
          placeholder={kind === 'reemplazo' ? 'Reemplazo 903' : 'Reunión de proyecto'}
          className="w-full border rounded px-2 py-1.5"
        />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Día">
          <input
            type="date"
            value={e.date ?? ''}
            onChange={ev => set({ date: ev.target.value })}
            className="w-full border rounded px-2 py-1.5"
          />
        </Campo>
        <Campo label="Hasta" hint="Solo si dura varios días.">
          <input
            type="date"
            value={e.endDate ?? ''}
            min={e.date}
            onChange={ev => set({ endDate: ev.target.value })}
            className="w-full border rounded px-2 py-1.5"
          />
        </Campo>
      </div>

      <HorasCampo
        opcional
        startTime={start} endTime={end}
        minutos={minutos} horasOk={horasOk}
        onChange={patch => set(patch)}
      />

      <Campo label="Curso" hint="Solo si es de un curso tuyo; un reemplazo no lo es.">
        <select
          value={e.courseCode ?? ''}
          onChange={ev => set({ courseCode: ev.target.value })}
          className="w-full border rounded px-2 py-1.5"
        >
          <option value="">Sin curso</option>
          {cursos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Campo>

      <Campo label="Nota">
        <textarea
          value={e.description ?? ''}
          onChange={ev => set({ description: ev.target.value })}
          rows={2}
          className="w-full border rounded px-2 py-1.5"
        />
      </Campo>

      <Botones onGuardar={guardar} puedeGuardar={puedeGuardar} onClose={onClose}
               onBorrar={e.id ? borrar : undefined} />
    </FormModal>
  );
}

// ---------- la lista ----------

const BADGE: Record<CalendarEvent['kind'], string> = {
  entrega: 'bg-red-100 text-red-800',
  actividad: 'bg-blue-100 text-blue-800',
  reemplazo: 'bg-violet-100 text-violet-800',
  festivo: 'bg-neutral-100 text-neutral-700',
  otro: 'bg-neutral-100 text-neutral-700',
};

const ETIQUETA: Record<CalendarEvent['kind'], string> = {
  entrega: 'Entrega', actividad: 'Actividad', reemplazo: 'Reemplazo',
  festivo: 'Festivo', otro: 'Otro',
};

/** 'YYYY-MM-DD' → 'mar 22 sep'. */
function fechaCorta(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

/**
 * Lo temporal que viene, debajo del horario.
 *
 * Va acá y no solo en el calendario porque es donde se mira "qué tengo estos
 * días": el horario dice lo de siempre y esto dice lo que se sale de siempre.
 */
export function TempEventsPanel({ dias = 14 }: { dias?: number }) {
  const events = useLiveQuery(() => db.events.toArray(), []) ?? [];
  const [draft, setDraft] = useState<TempEventDraft | null>(null);
  const hoy = todayIso();
  const proximos = upcomingEvents(events, hoy, dias);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">Estos días</h2>
          <p className="text-xs text-neutral-500">
            Reuniones, reemplazos y actividades que no se repiten cada semana.
          </p>
        </div>
        <button
          onClick={() => setDraft({ title: '', date: hoy, kind: 'actividad' })}
          className="shrink-0 text-sm px-3 py-1.5 rounded-md border hover:bg-neutral-50"
        >
          + Algo temporal
        </button>
      </div>

      {proximos.length === 0 ? (
        <p className="tarjeta p-4 text-sm text-neutral-500 text-center">
          Nada fuera de lo normal en los próximos {dias} días.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100 tarjeta overflow-hidden">
          {proximos.map(ev => {
            const enCurso = ev.date <= hoy && hoy <= eventLastDate(ev);
            return (
              <li key={ev.id}>
                <button
                  onClick={() => setDraft(ev)}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm
                             hover:bg-neutral-50"
                >
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${BADGE[ev.kind]}`}>
                    {ETIQUETA[ev.kind]}
                  </span>
                  <span className="flex-1 truncate">
                    {ev.title}
                    {ev.description && (
                      <span className="text-neutral-500"> · {ev.description}</span>
                    )}
                  </span>
                  <span className="text-[11px] text-neutral-500 tabular-nums shrink-0 text-right">
                    <span className={enCurso ? 'font-medium text-neutral-800' : ''}>
                      {fechaCorta(ev.date)}
                      {eventLastDate(ev) !== ev.date ? ` → ${fechaCorta(eventLastDate(ev))}` : ''}
                    </span>
                    {ev.startTime && <span className="block">{ev.startTime}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {draft && <TempEventEditor draft={draft} onClose={() => setDraft(null)} />}
    </section>
  );
}
