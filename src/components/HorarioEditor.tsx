'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, upsertScheduleBlock, deleteScheduleBlock } from '@/lib/db';
import { sortedCourseCodes } from '@/lib/courseOrder';
import {
  DAY_TYPES, buildHorarioSlots, blockLabel, hourNumbers, minutesBetween, gapsBetween,
  turnRange, type HorarioGap, type HorarioSlot,
} from '@/lib/horarioGrid';
import { computeDayTypes, todayIso } from '@/lib/schedule';
import { nextDateOfDayType, addDays } from '@/lib/dayAgenda';
import { FormModal, Campo, HorasCampo, Botones } from './FormModal';
import { TempEventEditor, type TempEventDraft } from './TempEventEditor';
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
 * - Lo **temporal** (una reunión de esta semana, un reemplazo de mañana) no es
 *   del horario: va con fecha y se vence solo. Desde la celda se puede pasar a
 *   crearlo con la fecha ya calculada — qué día del calendario es el próximo
 *   D2 lo sabe la app, y hacerlo contar a mano es justo lo que sobra.
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

/**
 * Lo que se edita de una franja de descanso.
 *
 * La nota va POR DÍA porque el acompañamiento cambia de lugar según el día:
 * un día en el patio, otro en la cafetería. Con una sola nota para toda la
 * franja no había dónde escribirlo.
 */
interface BreakDraft {
  /** Los bloques que ya existían, para actualizarlos en vez de duplicarlos. */
  original: ScheduleBlock[];
  title: string;
  startTime: string;
  endTime: string;
  /** La hora que parte la franja en dos turnos; vacía si no hay turnos. */
  turnSplit: string;
  days: DayType[];
  /** Dónde te toca ese día: { D1: 'Patio 2', D3: 'Cafetería' }. */
  notes: Partial<Record<DayType, string>>;
  /** Qué turno te toca ese día. */
  turns: Partial<Record<DayType, 1 | 2>>;
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
  // Para saber qué fecha es el próximo D2, D3… cuando se crea algo temporal
  // desde una celda. Sin esto habría que contar la rotación a mano.
  const yearCfg = useLiveQuery(
    () => db.yearConfig.where('year').equals(new Date().getFullYear()).first(), []);
  const customDays = useLiveQuery(() => db.calendarDays.toArray(), []) ?? [];
  const [selectedDay, setSelectedDay] = useState<DayType>('D1');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [breakDraft, setBreakDraft] = useState<BreakDraft | null>(null);
  const [tempDraft, setTempDraft] = useState<TempEventDraft | null>(null);

  const hoy = todayIso();
  // Una vuelta larga alcanza: el próximo D-lo-que-sea cae dentro de un mes.
  const seq = yearCfg
    ? computeDayTypes(yearCfg.startDate, yearCfg.initialDayType, addDays(hoy, 45), customDays, true)
    : null;

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
    turnSplit: '',
    days: [...DAY_TYPES],
    notes: {},
    turns: {},
  });

  const editarDescanso = (slot: HorarioSlot): BreakDraft => ({
    original: slot.breakBlocks,
    title: slot.breakLabel ?? 'Descanso',
    startTime: slot.startTime,
    endTime: slot.endTime,
    turnSplit: slot.turnSplit ?? '',
    days: slot.breakBlocks.map(b => b.dayType),
    notes: Object.fromEntries(
      slot.breakBlocks.filter(b => b.note).map(b => [b.dayType, b.note!]),
    ),
    turns: Object.fromEntries(
      slot.breakBlocks.filter(b => b.turn).map(b => [b.dayType, b.turn!]),
    ),
  });

  /**
   * Pasar de un bloque fijo a algo de un solo día, conservando lo ya escrito.
   *
   * La fecha sale de la rotación: la próxima vez que caiga ese tipo de día. Si
   * el año no está configurado todavía, queda hoy y él la corrige.
   */
  const soloUnaVez = (b: Draft) => {
    setDraft(null);
    setTempDraft({
      title: b.kind === 'clase' ? '' : (b.title ?? ''),
      date: (seq && nextDateOfDayType(b.dayType, seq, hoy)) ?? hoy,
      startTime: b.startTime || undefined,
      endTime: b.endTime || undefined,
      kind: 'actividad',
      description: b.note?.trim() || undefined,
    });
  };

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
          onSoloUnaVez={soloUnaVez}
          onClose={() => setDraft(null)}
        />
      )}

      {tempDraft && (
        <TempEventEditor draft={tempDraft} onClose={() => setTempDraft(null)} />
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

function BlockChip({
  b, slot, onEdit,
}: {
  b: ScheduleBlock;
  /** La franja donde se está dibujando, para saber si sus horas son otras. */
  slot?: HorarioSlot;
  onEdit: (b: ScheduleBlock) => void;
}) {
  const kind = b.kind ?? 'clase';
  // Un evento puede caer en esta franja sin tener sus mismas horas: se muestran
  // para no hacerle creer que empieza cuando empieza la hora.
  const horasPropias = !!slot && (b.startTime !== slot.startTime || b.endTime !== slot.endTime);
  return (
    <button
      onClick={() => onEdit(b)}
      className={`w-full text-left border rounded-md px-2 py-1.5 transition-colors
                  hover:ring-2 hover:ring-neutral-300 ${kindClasses(kind)}`}
    >
      <div className={`break-words ${kind === 'clase' ? 'font-medium' : 'text-xs leading-snug'}`}>
        {blockLabel(b)}
      </div>
      {horasPropias && (
        <div className="text-[11px] text-neutral-500 tabular-nums">
          {b.startTime}–{b.endTime}
        </div>
      )}
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
 * El descanso de ESE día dentro de una franja de descanso.
 *
 * Se dibuja por día y no solo en el rótulo de la fila porque el acompañamiento
 * cambia de lugar según el día, y porque si no, apagar un día no se notaba: la
 * fila se veía igual con el descanso y sin él.
 */
function BreakChip({
  b, slot, onEdit,
}: {
  b: ScheduleBlock;
  slot: HorarioSlot;
  onEdit: (slot: HorarioSlot) => void;
}) {
  // El acompañamiento no dura todo el descanso: si ese día te toca turno, es
  // su rango el que hay que ver, no el de la franja.
  const turno = turnRange(slot, b.turn);
  const lugar = b.note?.trim();
  return (
    <button
      onClick={() => onEdit(slot)}
      title={[slot.breakLabel ?? 'Descanso',
              turno && `${b.turn}º turno ${turno.startTime}–${turno.endTime}`,
              lugar].filter(Boolean).join(' · ')}
      className="w-full text-left border border-dashed border-neutral-300 bg-neutral-100
                 rounded-md px-2 py-1 text-xs leading-snug text-neutral-600
                 transition-colors hover:ring-2 hover:ring-neutral-300"
    >
      {turno && (
        <div className="text-[11px] text-neutral-500 tabular-nums">
          {b.turn}º {turno.startTime}–{turno.endTime}
        </div>
      )}
      {lugar || (turno ? null : <span className="text-neutral-400">—</span>)}
    </button>
  );
}

/**
 * El rótulo de la fila. En una franja de clase, el número de hora; en una de
 * descanso, su nombre, que además abre su editor.
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
                  const descanso = slot.breakBlocks.find(b => b.dayType === dt);
                  return (
                    <td key={dt} className="p-1 align-top">
                      {descanso || items.length > 0 ? (
                        <div className="space-y-1">
                          {descanso && (
                            <BreakChip b={descanso} slot={slot} onEdit={onEditBreak} />
                          )}
                          {items.map(b => (
                            <BlockChip key={b.id} b={b} slot={slot} onEdit={onEdit} />
                          ))}
                        </div>
                      ) : (
                        <EmptyCell onAdd={() => onAdd(dt, slot)} />
                      )}
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
          const descanso = slot.breakBlocks.find(b => b.dayType === selectedDay);
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
                {descanso || items.length > 0 ? (
                  <div className="space-y-1">
                    {descanso && <BreakChip b={descanso} slot={slot} onEdit={onEditBreak} />}
                    {items.map(b => <BlockChip key={b.id} b={b} slot={slot} onEdit={onEdit} />)}
                  </div>
                ) : (
                  <EmptyCell compact onAdd={() => onAdd(selectedDay, slot)} />
                )}
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
  draft, schedule, cursos, onSoloUnaVez, onClose,
}: {
  draft: Draft;
  schedule: ScheduleBlock[];
  cursos: string[];
  /** Pasa lo escrito a un evento de una sola fecha. */
  onSoloUnaVez: (b: Draft) => void;
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
    <FormModal label={b.id ? 'Editar bloque' : 'Nuevo bloque'} onClose={onClose}>
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

      {!b.id && (
        <p className="text-xs text-neutral-500">
          Esto se repite en todos los {dayLabelLong(b.dayType)} del año.{' '}
          <button
            onClick={() => onSoloUnaVez(b)}
            className="underline decoration-dotted underline-offset-2 hover:text-neutral-800"
          >
            ¿Es solo una vez?
          </button>
        </p>
      )}

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
    </FormModal>
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

  const turno1 = turnRange(d, 1);
  const turno2 = turnRange(d, 2);
  const corteOk = !!turno1 && !!turno2;

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
          note: d.notes[dt]?.trim() || undefined,
          turnSplit: corteOk ? d.turnSplit : undefined,
          // Sin hora de corte no hay turnos, así que el turno guardado sobra.
          turn: corteOk ? d.turns[dt] : undefined,
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
    <FormModal label={esNuevo ? 'Nueva franja de descanso' : 'Editar descanso'} onClose={onClose}>
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

      <Campo
        label="Los turnos se parten a las"
        hint={
          corteOk
            ? `1º turno ${turno1!.startTime}–${turno1!.endTime} · 2º turno ${turno2!.startTime}–${turno2!.endTime}`
            : 'El acompañamiento no dura todo el descanso. Déjalo vacío si acá no hay turnos.'
        }
      >
        <input
          type="time"
          value={d.turnSplit}
          onChange={e => set({ turnSplit: e.target.value })}
          className="w-full border rounded px-2 py-1.5"
        />
      </Campo>

      <div className="space-y-1">
        <span className="text-xs text-neutral-600">
          Días{corteOk ? ', turno y acompañamiento' : ' y acompañamiento'}
        </span>
        <p className="text-[11px] text-neutral-500">
          Apaga un día si ese descanso te cae a otra hora. En cada uno puedes
          escribir dónde te toca estar; lo que escribas se ve en el horario.
        </p>
        <div className="space-y-1">
          {DAY_TYPES.map(dt => {
            const activo = d.days.includes(dt);
            return (
              <div key={dt} className="flex items-center gap-2">
                <button
                  onClick={() => alternarDia(dt)}
                  aria-pressed={activo}
                  className={`shrink-0 w-20 px-2 py-1.5 rounded-md border text-xs ${
                    activo ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-400'
                  }`}
                >
                  {dayLabel(dt)}
                </button>
                {corteOk && (
                  <div className="shrink-0 flex rounded-md border overflow-hidden">
                    {([undefined, 1, 2] as const).map(t => (
                      <button
                        key={t ?? 'todo'}
                        onClick={() => set({ turns: { ...d.turns, [dt]: t } })}
                        disabled={!activo}
                        aria-pressed={(d.turns[dt] ?? undefined) === t}
                        title={
                          t === undefined
                            ? 'Todo el descanso'
                            : `${t}º turno · ${(t === 1 ? turno1! : turno2!).startTime}–${(t === 1 ? turno1! : turno2!).endTime}`
                        }
                        className={`w-7 py-1.5 text-xs border-r last:border-r-0 disabled:opacity-40 ${
                          (d.turns[dt] ?? undefined) === t
                            ? 'bg-neutral-900 text-white'
                            : 'bg-white text-neutral-600'
                        }`}
                      >
                        {t ?? '—'}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={d.notes[dt] ?? ''}
                  disabled={!activo}
                  onChange={e => set({ notes: { ...d.notes, [dt]: e.target.value } })}
                  placeholder={activo ? 'Dónde acompañas' : 'sin descanso a esta hora'}
                  aria-label={`Acompañamiento del ${dayLabelLong(dt)}`}
                  className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm
                             disabled:bg-neutral-50 disabled:text-neutral-400"
                />
              </div>
            );
          })}
        </div>
      </div>

      <Botones onGuardar={guardar} puedeGuardar={puedeGuardar} onClose={onClose}
               onBorrar={esNuevo ? undefined : borrar} />
    </FormModal>
  );
}
