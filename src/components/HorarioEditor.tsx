'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, upsertScheduleBlock, deleteScheduleBlock } from '@/lib/db';
import { sortedCourseCodes } from '@/lib/courseOrder';
import {
  DAY_TYPES, buildHorarioSlots, blockLabel, hourNumbers, minutesBetween,
  type HorarioSlot,
} from '@/lib/horarioGrid';
import type { BlockKind, DayType, ScheduleBlock } from '@/types';

/**
 * El horario, como horario.
 *
 * Filas = franjas horarias, columnas = tipos de día, igual que el horario en
 * papel del colegio. La tabla anterior era una fila por bloque con el curso en
 * un `<select>`: en el celular no cabía y el curso y las horas salían cortados.
 *
 * En escritorio va la rejilla completa (los seis tipos de día a la vez, que es
 * donde de verdad se lee). En móvil no caben seis columnas, así que se ve un
 * tipo de día a la vez como línea de tiempo vertical.
 */

function dayLabel(dt: DayType) {
  return dt === 'FIJO' ? 'Fijo' : `Día ${dt.slice(1)}`;
}

/** Para las pestañas de móvil: con 'Día 1' completo las seis no caben en 360px. */
function dayLabelShort(dt: DayType) {
  return dt === 'FIJO' ? 'Fijo' : dt;
}

function dayLabelLong(dt: DayType) {
  return dt === 'FIJO' ? 'Día Fijo (viernes)' : `Día ${dt.slice(1)}`;
}

type Draft = Omit<ScheduleBlock, 'block'> & { block?: number };

export function HorarioEditor() {
  const schedule = useLiveQuery(() => db.schedule.toArray(), []) ?? [];
  // Los cursos que el docente importó. Antes eran 19 códigos fijos, así que
  // otro profesor veía cursos que no dicta y no veía los suyos.
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
  const [selectedDay, setSelectedDay] = useState<DayType>('D1');
  const [draft, setDraft] = useState<Draft | null>(null);

  const slots = buildHorarioSlots(schedule);
  const horas = hourNumbers(slots);

  const nuevo = (dayType: DayType, slot?: HorarioSlot): Draft => ({
    dayType,
    courseCode: '',
    kind: 'clase',
    startTime: slot?.startTime ?? '',
    endTime: slot?.endTime ?? '',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          {slots.length === 0
            ? 'Todavía no hay franjas.'
            : `${slots.length} franjas · ${schedule.length} bloques`}
        </p>
        <button
          onClick={() => setDraft(nuevo(selectedDay))}
          className="shrink-0 text-sm px-3 py-1.5 rounded-md border hover:bg-neutral-50"
        >
          + Nueva franja
        </button>
      </div>

      {slots.length === 0 ? (
        <p className="border rounded-lg p-6 text-sm text-neutral-500 text-center">
          Empezá con “Nueva franja”: definís la hora de inicio y fin, y después
          vas llenando cada día.
        </p>
      ) : (
        <>
          <GridDesktop
            slots={slots} horas={horas}
            onEdit={b => setDraft(b)}
            onAdd={(dt, slot) => setDraft(nuevo(dt, slot))}
          />
          <TimelineMobile
            slots={slots} horas={horas}
            selectedDay={selectedDay} onSelectDay={setSelectedDay}
            onEdit={b => setDraft(b)}
            onAdd={(dt, slot) => setDraft(nuevo(dt, slot))}
          />
        </>
      )}

      {draft && (
        <BlockEditor
          draft={draft}
          schedule={schedule}
          cursos={sortedCourseCodes(courses)}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  );
}

// ---------- celda ----------

function kindClasses(kind: BlockKind) {
  if (kind === 'evento') return 'bg-amber-50 border-amber-200 text-amber-900';
  if (kind === 'descanso') return 'bg-neutral-100 border-neutral-200 text-neutral-600';
  return 'bg-white border-neutral-200 text-neutral-900';
}

function BlockChip({ b, onEdit }: { b: ScheduleBlock; onEdit: (b: ScheduleBlock) => void }) {
  const kind = b.kind ?? 'clase';
  return (
    <button
      onClick={() => onEdit(b)}
      className={`w-full text-left border rounded-md px-2 py-1.5 transition-colors
                  hover:ring-2 hover:ring-neutral-300 ${kindClasses(kind)}`}
    >
      <div className={`break-words ${kind === 'clase' ? 'font-medium' : 'text-xs leading-snug'}`}>
        {blockLabel(b)}
      </div>
      {b.room && <div className="text-[11px] text-neutral-500 truncate">{b.room}</div>}
      {b.note && <div className="text-[11px] text-neutral-500 truncate">{b.note}</div>}
    </button>
  );
}

/**
 * `compact` es para el móvil: un día suele tener más huecos que clases, y con
 * la altura de una clase la lista se vuelve puro scroll vacío.
 */
function EmptyCell({ onAdd, compact }: { onAdd: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onAdd}
      aria-label="Añadir en esta franja"
      className={`w-full rounded-md border border-dashed border-neutral-200 text-neutral-300
                  hover:text-neutral-600 hover:border-neutral-400 transition-colors
                  ${compact ? 'h-7 text-xs' : 'h-full min-h-[2.5rem]'}`}
    >
      +
    </button>
  );
}

// ---------- escritorio ----------

function GridDesktop({
  slots, horas, onEdit, onAdd,
}: {
  slots: HorarioSlot[];
  horas: Map<string, number>;
  onEdit: (b: ScheduleBlock) => void;
  onAdd: (dt: DayType, slot: HorarioSlot) => void;
}) {
  return (
    <div className="hidden sm:block border rounded-lg overflow-x-auto">
      <table className="w-full table-fixed text-sm border-collapse">
        <thead>
          <tr className="bg-neutral-50 border-b">
            <th className="p-2 text-left font-medium w-28">Franja</th>
            {DAY_TYPES.map(dt => (
              <th key={dt} className="p-2 text-center font-medium">{dayLabel(dt)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map(slot => (
            <tr key={slot.key} className={`border-b ${slot.isBreak ? 'bg-neutral-50' : ''}`}>
              <th scope="row" className="p-2 text-left align-top font-normal">
                {horas.has(slot.key) && (
                  <div className="text-xs font-medium text-neutral-700">
                    {horas.get(slot.key)}ª hora
                  </div>
                )}
                <div className="text-xs text-neutral-600 tabular-nums whitespace-nowrap">
                  {slot.startTime}–{slot.endTime}
                </div>
                <div className="text-[11px] text-neutral-400">{slot.minutes} min</div>
              </th>
              {DAY_TYPES.map(dt => {
                const items = slot.byDay.get(dt) ?? [];
                return (
                  <td key={dt} className="p-1 align-top">
                    {items.length === 0
                      ? <EmptyCell onAdd={() => onAdd(dt, slot)} />
                      : <div className="space-y-1">
                          {items.map(b => <BlockChip key={b.id} b={b} onEdit={onEdit} />)}
                        </div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- móvil ----------

function TimelineMobile({
  slots, horas, selectedDay, onSelectDay, onEdit, onAdd,
}: {
  slots: HorarioSlot[];
  horas: Map<string, number>;
  selectedDay: DayType;
  onSelectDay: (dt: DayType) => void;
  onEdit: (b: ScheduleBlock) => void;
  onAdd: (dt: DayType, slot: HorarioSlot) => void;
}) {
  return (
    <div className="sm:hidden space-y-3">
      {/* Los seis tipos de día no caben como columnas en 360px: se ve uno a la vez. */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
        {DAY_TYPES.map(dt => (
          <button
            key={dt}
            onClick={() => onSelectDay(dt)}
            aria-pressed={selectedDay === dt}
            className={`shrink-0 px-3 py-1.5 rounded-md text-sm border ${
              selectedDay === dt
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-neutral-700'
            }`}
          >
            {dayLabelShort(dt)}
          </button>
        ))}
      </div>

      <ul className="space-y-1.5">
        {slots.map(slot => {
          const items = slot.byDay.get(selectedDay) ?? [];
          return (
            <li key={slot.key} className="flex gap-2">
              {/* Riel de horas: el inicio y el fin siempre visibles y sin cortar,
                  que era justo lo que la tabla anterior perdía en el celular. */}
              <div className="w-14 shrink-0 pt-1.5 text-right">
                <div className="text-xs tabular-nums text-neutral-700">{slot.startTime}</div>
                <div className="text-[11px] tabular-nums text-neutral-400">{slot.endTime}</div>
              </div>
              <div className="flex-1 min-w-0">
                {horas.has(slot.key) && (
                  <div className="text-[11px] text-neutral-400 mb-0.5">
                    {horas.get(slot.key)}ª hora · {slot.minutes} min
                  </div>
                )}
                {items.length === 0
                  ? <EmptyCell compact onAdd={() => onAdd(selectedDay, slot)} />
                  : <div className="space-y-1">
                      {items.map(b => <BlockChip key={b.id} b={b} onEdit={onEdit} />)}
                    </div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- editor ----------

function BlockEditor({
  draft, schedule, cursos, onClose,
}: {
  draft: Draft;
  schedule: ScheduleBlock[];
  cursos: string[];
  onClose: () => void;
}) {
  const [b, setB] = useState<Draft>(draft);
  const kind: BlockKind = b.kind ?? 'clase';
  const set = (patch: Partial<Draft>) => setB(prev => ({ ...prev, ...patch }));

  const minutos = minutesBetween(b.startTime, b.endTime);
  const horasOk = minutos > 0;
  const identificado = kind === 'clase' ? !!b.courseCode : !!b.title?.trim();
  const puedeGuardar = horasOk && identificado;

  const guardar = async () => {
    if (!puedeGuardar) return;
    // `block` es solo un consecutivo dentro del tipo de día: el orden de
    // verdad lo da la hora (ver classesForDayType).
    const siguiente = Math.max(
      0, ...schedule.filter(x => x.dayType === b.dayType).map(x => x.block),
    ) + 1;
    await upsertScheduleBlock({
      ...b,
      block: b.block ?? siguiente,
      // Un evento nunca lleva código de curso: si lo llevara, le correría la
      // numeración de ciclos a ese curso.
      courseCode: kind === 'clase' ? b.courseCode : '',
      title: kind === 'clase' ? undefined : b.title?.trim(),
      room: b.room?.trim() || undefined,
      note: b.note?.trim() || undefined,
    } as ScheduleBlock);
    onClose();
  };

  const borrar = async () => {
    if (!b.id) return;
    if (!confirm(`¿Borrar “${blockLabel(b as ScheduleBlock)}” de ${dayLabelLong(b.dayType)}?`)) return;
    await deleteScheduleBlock(b.id);
    onClose();
  };

  return (
    // z-[60]: por encima de la barra inferior de móvil, que va en z-50.
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={b.id ? 'Editar bloque' : 'Nuevo bloque'}
        className="relative w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl border shadow-lg
                   p-4 space-y-3 max-h-[85vh] overflow-y-auto
                   pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4"
      >
        <h2 className="font-medium">{b.id ? 'Editar bloque' : 'Nuevo bloque'}</h2>

        <Campo label="Tipo de día">
          <select
            value={b.dayType}
            onChange={e => set({ dayType: e.target.value as DayType })}
            className="w-full border rounded px-2 py-1.5"
          >
            {DAY_TYPES.map(dt => <option key={dt} value={dt}>{dayLabelLong(dt)}</option>)}
          </select>
        </Campo>

        <Campo label="Qué es">
          <div className="grid grid-cols-3 gap-1.5">
            {(['clase', 'evento', 'descanso'] as BlockKind[]).map(k => (
              <button
                key={k}
                onClick={() => set({ kind: k })}
                aria-pressed={kind === k}
                className={`px-2 py-1.5 rounded-md border text-sm capitalize ${
                  kind === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </Campo>

        {kind === 'clase' ? (
          <Campo label="Curso">
            <select
              value={b.courseCode}
              onChange={e => set({ courseCode: e.target.value })}
              className="w-full border rounded px-2 py-1.5"
            >
              <option value="">
                {cursos.length ? '— elegí un curso —' : '— importá tu Planilla primero —'}
              </option>
              {cursos.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
        ) : (
          <Campo
            label="Título"
            hint={kind === 'evento'
              ? 'Si es un reemplazo, escribí acá el curso (“Reemplazo 903”). No cuenta como clase tuya.'
              : undefined}
          >
            <input
              type="text"
              value={b.title ?? ''}
              onChange={e => set({ title: e.target.value })}
              placeholder={kind === 'evento' ? 'Reunión de área' : 'Descanso'}
              className="w-full border rounded px-2 py-1.5"
            />
          </Campo>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Inicio">
            <input
              type="time"
              value={b.startTime}
              onChange={e => set({ startTime: e.target.value })}
              className="w-full border rounded px-2 py-1.5"
            />
          </Campo>
          <Campo label="Fin">
            <input
              type="time"
              value={b.endTime}
              onChange={e => set({ endTime: e.target.value })}
              className="w-full border rounded px-2 py-1.5"
            />
          </Campo>
        </div>
        <p className="text-xs text-neutral-500">
          {horasOk ? `${minutos} min` : 'Poné una hora de fin posterior a la de inicio.'}
        </p>

        <Campo label="Aula">
          <input
            type="text"
            value={b.room ?? ''}
            onChange={e => set({ room: e.target.value })}
            placeholder="Sala de informática"
            className="w-full border rounded px-2 py-1.5"
          />
        </Campo>

        <Campo label="Nota" hint="Por ejemplo, dónde te toca estar en ese descanso.">
          <textarea
            value={b.note ?? ''}
            onChange={e => set({ note: e.target.value })}
            rows={2}
            className="w-full border rounded px-2 py-1.5"
          />
        </Campo>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={guardar}
            disabled={!puedeGuardar}
            className="px-3 py-1.5 rounded-md bg-neutral-900 text-white text-sm
                       disabled:opacity-40"
          >
            Guardar
          </button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border text-sm">
            Cancelar
          </button>
          {b.id && (
            <button onClick={borrar} className="ml-auto text-sm text-red-600 hover:text-red-800">
              Borrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-neutral-600">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-neutral-500">{hint}</span>}
    </label>
  );
}
