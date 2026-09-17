'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, upsertScheduleBlock, deleteScheduleBlock } from '@/lib/db';
import { sortedCourseCodes } from '@/lib/courseOrder';
import {
  DAY_TYPES, buildHorarioSlots, blockLabel, hourNumbers, minutesBetween, gapsBetween,
  type HorarioGap, type HorarioSlot,
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
 *
 * Hay dos cosas distintas que se pueden crear, y no se editan igual:
 *
 * - Un **bloque** (clase o evento) es de un día: va en una celda.
 * - Una **franja de descanso** es de la fila entera, porque el descanso está a
 *   la misma hora todos los días. Por eso se edita desde el rótulo de la fila y
 *   no desde una celda, y por eso la fila sigue siendo descanso aunque se le
 *   ponga una actividad encima: si no, esa actividad le robaba el número a las
 *   horas siguientes y la séptima terminaba de octava.
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

/** Lo que se edita de una franja de descanso: vale para varios días a la vez. */
interface BreakDraft {
  /** Los bloques que ya existían, para actualizarlos en vez de duplicarlos. */
  original: ScheduleBlock[];
  title: string;
  startTime: string;
  endTime: string;
  note: string;
  days: DayType[];
}

/** `block` es solo un consecutivo dentro del día; el orden lo da la hora. */
function siguienteBlock(schedule: ScheduleBlock[], dayType: DayType): number {
  return Math.max(0, ...schedule.filter(x => x.dayType === dayType).map(x => x.block)) + 1;
}

export function HorarioEditor() {
  const schedule = useLiveQuery(() => db.schedule.toArray(), []) ?? [];
  // Los cursos que el docente importó. Antes eran 19 códigos fijos, así que
  // otro profesor veía cursos que no dicta y no veía los suyos.
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
  const [selectedDay, setSelectedDay] = useState<DayType>('D1');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [breakDraft, setBreakDraft] = useState<BreakDraft | null>(null);

  const slots = buildHorarioSlots(schedule);
  const horas = hourNumbers(slots);
  // Los ratos libres entre franja y franja: ahí es donde va el descanso, así
  // que se ofrecen con las horas ya puestas.
  const huecos = new Map(gapsBetween(slots).map(g => [g.afterKey, g]));

  const nuevo = (dayType: DayType, slot?: HorarioSlot): Draft => ({
    dayType,
    courseCode: '',
    kind: 'clase',
    startTime: slot?.startTime ?? '',
    endTime: slot?.endTime ?? '',
  });

  const nuevoDescanso = (gap?: HorarioGap): BreakDraft => ({
    original: [],
    title: 'Descanso',
    startTime: gap?.startTime ?? '',
    endTime: gap?.endTime ?? '',
    note: '',
    days: [...DAY_TYPES],
  });

  const editarDescanso = (slot: HorarioSlot): BreakDraft => ({
    original: slot.breakBlocks,
    title: slot.breakLabel ?? 'Descanso',
    startTime: slot.startTime,
    endTime: slot.endTime,
    note: slot.breakBlocks.find(b => b.note)?.note ?? '',
    days: slot.breakBlocks.map(b => b.dayType),
  });

  const acciones = {
    onEdit: (b: ScheduleBlock) => setDraft(b),
    onAdd: (dt: DayType, slot: HorarioSlot) => setDraft(nuevo(dt, slot)),
    onEditBreak: (slot: HorarioSlot) => setBreakDraft(editarDescanso(slot)),
    onAddBreak: (gap?: HorarioGap) => setBreakDraft(nuevoDescanso(gap)),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-neutral-500">
          {slots.length === 0
            ? 'Todavía no hay franjas.'
            : `${horas.size} horas de clase · ${schedule.length} bloques`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => acciones.onAddBreak()}
            className="shrink-0 text-sm px-3 py-1.5 rounded-md border hover:bg-neutral-50"
          >
            + Descanso
          </button>
          <button
            onClick={() => setDraft(nuevo(selectedDay))}
            className="shrink-0 text-sm px-3 py-1.5 rounded-md border hover:bg-neutral-50"
          >
            + Nueva franja
          </button>
        </div>
      </div>

      {slots.length === 0 ? (
        <p className="border rounded-lg p-6 text-sm text-neutral-500 text-center">
          Empieza con “Nueva franja”: defines la hora de inicio y fin, y después
          vas llenando cada día.
        </p>
      ) : (
        <>
          <GridDesktop slots={slots} horas={horas} huecos={huecos} {...acciones} />
          <TimelineMobile
            slots={slots} horas={horas} huecos={huecos}
            selectedDay={selectedDay} onSelectDay={setSelectedDay}
            {...acciones}
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

      {breakDraft && (
        <BreakEditor
          draft={breakDraft}
          schedule={schedule}
          onClose={() => setBreakDraft(null)}
        />
      )}
    </div>
  );
}

interface Acciones {
  onEdit: (b: ScheduleBlock) => void;
  onAdd: (dt: DayType, slot: HorarioSlot) => void;
  onEditBreak: (slot: HorarioSlot) => void;
  onAddBreak: (gap?: HorarioGap) => void;
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

/**
 * El rótulo de la fila. En una franja de clase, el número de hora; en una de
 * descanso, su nombre, que además abre su editor — es el único camino para
 * cambiarla, porque el descanso no vive en ninguna celda.
 */
function SlotLabel({
  slot, hora, onEditBreak,
}: {
  slot: HorarioSlot;
  hora?: number;
  onEditBreak: (slot: HorarioSlot) => void;
}) {
  return (
    <>
      {slot.isBreak ? (
        <button
          onClick={() => onEditBreak(slot)}
          className="text-xs font-medium text-neutral-600 underline decoration-dotted
                     underline-offset-2 hover:text-neutral-900"
        >
          {slot.breakLabel ?? 'Descanso'}
        </button>
      ) : hora != null ? (
        <div className="text-xs font-medium text-neutral-700">{hora}ª hora</div>
      ) : null}
      <div className="text-xs text-neutral-600 tabular-nums whitespace-nowrap">
        {slot.startTime}–{slot.endTime}
      </div>
      <div className="text-[11px] text-neutral-400">{slot.minutes} min</div>
    </>
  );
}

// ---------- escritorio ----------

function GridDesktop({
  slots, horas, huecos, onEdit, onAdd, onEditBreak, onAddBreak,
}: Acciones & {
  slots: HorarioSlot[];
  horas: Map<string, number>;
  huecos: Map<string, HorarioGap>;
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
          {slots.map(slot => {
            const hueco = huecos.get(slot.key);
            return [
              <tr key={slot.key} className={`border-b ${slot.isBreak ? 'bg-neutral-50' : ''}`}>
                <th scope="row" className="p-2 text-left align-top font-normal">
                  <SlotLabel slot={slot} hora={horas.get(slot.key)} onEditBreak={onEditBreak} />
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
              </tr>,
              hueco ? (
                <tr key={`${slot.key}-hueco`} className="border-b">
                  <th scope="row" className="p-2 text-left align-top font-normal">
                    <div className="text-xs text-neutral-400 tabular-nums whitespace-nowrap">
                      {hueco.startTime}–{hueco.endTime}
                    </div>
                    <div className="text-[11px] text-neutral-400">{hueco.minutes} min</div>
                  </th>
                  <td colSpan={DAY_TYPES.length} className="p-1">
                    <button
                      onClick={() => onAddBreak(hueco)}
                      className="w-full rounded-md border border-dashed border-neutral-200 py-1.5
                                 text-xs text-neutral-400 hover:text-neutral-700
                                 hover:border-neutral-400 transition-colors"
                    >
                      + Franja de descanso aquí
                    </button>
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- móvil ----------

function TimelineMobile({
  slots, horas, huecos, selectedDay, onSelectDay, onEdit, onAdd, onEditBreak, onAddBreak,
}: Acciones & {
  slots: HorarioSlot[];
  horas: Map<string, number>;
  huecos: Map<string, HorarioGap>;
  selectedDay: DayType;
  onSelectDay: (dt: DayType) => void;
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
          const hueco = huecos.get(slot.key);
          const hora = horas.get(slot.key);
          return [
            <li key={slot.key} className="flex gap-2">
              {/* Riel de horas: el inicio y el fin siempre visibles y sin cortar,
                  que era justo lo que la tabla anterior perdía en el celular. */}
              <div className="w-14 shrink-0 pt-1.5 text-right">
                <div className="text-xs tabular-nums text-neutral-700">{slot.startTime}</div>
                <div className="text-[11px] tabular-nums text-neutral-400">{slot.endTime}</div>
              </div>
              <div className="flex-1 min-w-0">
                {slot.isBreak ? (
                  <button
                    onClick={() => onEditBreak(slot)}
                    className="text-[11px] text-neutral-500 mb-0.5 underline decoration-dotted
                               underline-offset-2"
                  >
                    {slot.breakLabel ?? 'Descanso'} · {slot.minutes} min
                  </button>
                ) : hora != null ? (
                  <div className="text-[11px] text-neutral-400 mb-0.5">
                    {hora}ª hora · {slot.minutes} min
                  </div>
                ) : null}
                {items.length === 0
                  ? <EmptyCell compact onAdd={() => onAdd(selectedDay, slot)} />
                  : <div className="space-y-1">
                      {items.map(b => <BlockChip key={b.id} b={b} onEdit={onEdit} />)}
                    </div>}
              </div>
            </li>,
            hueco ? (
              <li key={`${slot.key}-hueco`} className="flex gap-2">
                <div className="w-14 shrink-0 pt-1 text-right">
                  <div className="text-[11px] tabular-nums text-neutral-400">{hueco.startTime}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => onAddBreak(hueco)}
                    className="w-full rounded-md border border-dashed border-neutral-200 h-7
                               text-xs text-neutral-400 hover:text-neutral-700
                               hover:border-neutral-400 transition-colors"
                  >
                    + Descanso ({hueco.minutes} min)
                  </button>
                </div>
              </li>
            ) : null,
          ];
        })}
      </ul>
    </div>
  );
}

// ---------- editor de bloque ----------

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
    await upsertScheduleBlock({
      ...b,
      block: b.block ?? siguienteBlock(schedule, b.dayType),
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
    <Modal label={b.id ? 'Editar bloque' : 'Nuevo bloque'} onClose={onClose}>
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
        <div className="grid grid-cols-2 gap-1.5">
          {/* El descanso no está acá a propósito: no es de un día, es de la
              franja entera, y se crea con el botón “+ Descanso”. */}
          {(['clase', 'evento'] as BlockKind[]).map(k => (
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
              {cursos.length ? '— elige un curso —' : '— importa tu Califica primero —'}
            </option>
            {cursos.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
      ) : (
        <Campo
          label="Título"
          hint="Si es un reemplazo, escribe aquí el curso (“Reemplazo 903”). No cuenta como clase tuya."
        >
          <input
            type="text"
            value={b.title ?? ''}
            onChange={e => set({ title: e.target.value })}
            placeholder="Reunión de área"
            className="w-full border rounded px-2 py-1.5"
          />
        </Campo>
      )}

      <HorasCampo
        startTime={b.startTime} endTime={b.endTime}
        onChange={patch => set(patch)}
        minutos={minutos} horasOk={horasOk}
      />

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

      <Botones onGuardar={guardar} puedeGuardar={puedeGuardar} onClose={onClose}
               onBorrar={b.id ? borrar : undefined} />
    </Modal>
  );
}

// ---------- editor de franja de descanso ----------

function BreakEditor({
  draft, schedule, onClose,
}: {
  draft: BreakDraft;
  schedule: ScheduleBlock[];
  onClose: () => void;
}) {
  const [d, setD] = useState<BreakDraft>(draft);
  const set = (patch: Partial<BreakDraft>) => setD(prev => ({ ...prev, ...patch }));
  const esNuevo = d.original.length === 0;

  const minutos = minutesBetween(d.startTime, d.endTime);
  const horasOk = minutos > 0;
  const puedeGuardar = horasOk && !!d.title.trim() && d.days.length > 0;

  const alternarDia = (dt: DayType) =>
    set({ days: d.days.includes(dt) ? d.days.filter(x => x !== dt) : [...d.days, dt] });

  const guardar = async () => {
    if (!puedeGuardar) return;
    const quiero = new Set(d.days);
    const previos = new Map(d.original.map(b => [b.dayType, b]));
    // Un descanso es una fila del horario, así que se guarda un bloque por cada
    // día marcado y se borran los de los días que se desmarcaron.
    for (const dt of DAY_TYPES) {
      const prev = previos.get(dt);
      if (quiero.has(dt)) {
        await upsertScheduleBlock({
          ...(prev ?? {}),
          dayType: dt,
          block: prev?.block ?? siguienteBlock(schedule, dt),
          courseCode: '',
          kind: 'descanso',
          title: d.title.trim(),
          startTime: d.startTime,
          endTime: d.endTime,
          room: undefined,
          note: d.note.trim() || undefined,
        } as ScheduleBlock);
      } else if (prev?.id) {
        await deleteScheduleBlock(prev.id);
      }
    }
    onClose();
  };

  const borrar = async () => {
    if (esNuevo) return;
    if (!confirm(`¿Borrar la franja “${d.title.trim() || 'Descanso'}” de todos los días?`)) return;
    for (const b of d.original) if (b.id) await deleteScheduleBlock(b.id);
    onClose();
  };

  return (
    <Modal label={esNuevo ? 'Nueva franja de descanso' : 'Editar descanso'} onClose={onClose}>
      <h2 className="font-medium">{esNuevo ? 'Nueva franja de descanso' : 'Editar descanso'}</h2>
      <p className="text-xs text-neutral-500">
        Una franja de descanso no cuenta como hora de clase, así que las horas
        siguen numeradas igual. Puedes poner actividades dentro sin que se
        corran.
      </p>

      <Campo label="Nombre">
        <input
          type="text"
          value={d.title}
          onChange={e => set({ title: e.target.value })}
          placeholder="Descanso"
          className="w-full border rounded px-2 py-1.5"
        />
      </Campo>

      <HorasCampo
        startTime={d.startTime} endTime={d.endTime}
        onChange={patch => set(patch)}
        minutos={minutos} horasOk={horasOk}
      />

      <Campo label="Días" hint="Desmarca un día si ese descanso te cae a otra hora.">
        <div className="grid grid-cols-3 gap-1.5">
          {DAY_TYPES.map(dt => {
            const activo = d.days.includes(dt);
            return (
              <button
                key={dt}
                onClick={() => alternarDia(dt)}
                aria-pressed={activo}
                className={`px-2 py-1.5 rounded-md border text-sm ${
                  activo ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white'
                }`}
              >
                {dayLabel(dt)}
              </button>
            );
          })}
        </div>
      </Campo>

      <Campo label="Nota" hint="Por ejemplo, dónde te toca estar en ese descanso.">
        <textarea
          value={d.note}
          onChange={e => set({ note: e.target.value })}
          rows={2}
          className="w-full border rounded px-2 py-1.5"
        />
      </Campo>

      <Botones onGuardar={guardar} puedeGuardar={puedeGuardar} onClose={onClose}
               onBorrar={esNuevo ? undefined : borrar} />
    </Modal>
  );
}

// ---------- piezas compartidas ----------

function Modal({
  label, onClose, children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    // z-[60]: por encima de la barra inferior de móvil, que va en z-50.
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl border shadow-lg
                   p-4 space-y-3 max-h-[85vh] overflow-y-auto
                   pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4"
      >
        {children}
      </div>
    </div>
  );
}

function HorasCampo({
  startTime, endTime, onChange, minutos, horasOk,
}: {
  startTime: string;
  endTime: string;
  onChange: (patch: { startTime?: string; endTime?: string }) => void;
  minutos: number;
  horasOk: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Inicio">
          <input
            type="time"
            value={startTime}
            onChange={e => onChange({ startTime: e.target.value })}
            className="w-full border rounded px-2 py-1.5"
          />
        </Campo>
        <Campo label="Fin">
          <input
            type="time"
            value={endTime}
            onChange={e => onChange({ endTime: e.target.value })}
            className="w-full border rounded px-2 py-1.5"
          />
        </Campo>
      </div>
      <p className="text-xs text-neutral-500">
        {horasOk ? `${minutos} min` : 'Pon una hora de fin posterior a la de inicio.'}
      </p>
    </>
  );
}

function Botones({
  onGuardar, puedeGuardar, onClose, onBorrar,
}: {
  onGuardar: () => void;
  puedeGuardar: boolean;
  onClose: () => void;
  onBorrar?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <button
        onClick={onGuardar}
        disabled={!puedeGuardar}
        className="px-3 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
      >
        Guardar
      </button>
      <button onClick={onClose} className="px-3 py-1.5 rounded-md border text-sm">
        Cancelar
      </button>
      {onBorrar && (
        <button onClick={onBorrar} className="ml-auto text-sm text-red-600 hover:text-red-800">
          Borrar
        </button>
      )}
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
