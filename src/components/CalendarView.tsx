'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  upsertYearConfig,
  upsertCalendarDay,
  clearCalendarDay,
  addEvent, deleteEvent,
} from '@/lib/db';
import { CURSOS_ORDER } from '@/lib/constants';
import {
  computeDayTypes,
  dayTypeLabel,
  formatIso,
  parseIso,
  todayIso,
  type DateStatus,
} from '@/lib/schedule';
import { holidaysForYear } from '@/lib/holidays-co';
import {
  buildCycleMap, cycleBadge, cycleLabel, type CourseCycle,
} from '@/lib/cycles';
import { eventDotColor } from './EventsList';
import type { DayType, CalendarEvent } from '@/types';

const DEFAULT_YEAR = new Date().getFullYear();

export function CalendarView() {
  const yearCfg = useLiveQuery(() => db.yearConfig.where('year').equals(DEFAULT_YEAR).first());
  const customDays = useLiveQuery(() => db.calendarDays.toArray()) ?? [];
  const schedule = useLiveQuery(() => db.schedule.toArray()) ?? [];
  const courses = useLiveQuery(() => db.courses.toArray()) ?? [];
  const events = useLiveQuery(() => db.events.toArray()) ?? [];
  const eventsByDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const arr = m.get(e.date);
      if (arr) arr.push(e); else m.set(e.date, [e]);
    }
    return m;
  }, [events]);

  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() }; // month 0-11
  });

  const startDate = yearCfg?.startDate ?? `${DEFAULT_YEAR}-01-27`;
  const initialDayType = (yearCfg?.initialDayType ?? 'D1') as DayType;

  // Rango a computar: desde startDate hasta fin del mes visible + un colchón
  const rangeEnd = useMemo(() => {
    const d = new Date(Date.UTC(visibleMonth.year, visibleMonth.month + 2, 0));
    return formatIso(d);
  }, [visibleMonth]);

  const sequence = useMemo(
    () => computeDayTypes(startDate, initialDayType, rangeEnd, customDays, true),
    [startDate, initialDayType, rangeEnd, customDays],
  );

  const holidayNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidaysForYear(visibleMonth.year)) m.set(h.date, h.name);
    return m;
  }, [visibleMonth.year]);

  // El ciclo se cuenta por curso sobre las sesiones del trimestre, así que se
  // arma de una pasada para todo el rango en vez de por casilla.
  const cycleMap = useMemo(
    () => (yearCfg ? buildCycleMap(sequence, schedule, courses, yearCfg) : new Map()),
    [sequence, schedule, courses, yearCfg],
  );

  const grid = useMemo(() => buildMonthGrid(visibleMonth.year, visibleMonth.month), [visibleMonth]);
  const monthLabel = new Date(Date.UTC(visibleMonth.year, visibleMonth.month, 1))
    .toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="space-y-6">
      <YearConfigForm
        year={DEFAULT_YEAR}
        startDate={startDate}
        initialDayType={initialDayType}
        trim1Start={yearCfg?.trim1Start ?? ''}
        trim2Start={yearCfg?.trim2Start ?? ''}
        trim3Start={yearCfg?.trim3Start ?? ''}
      />

      <NoClassRange />

      <div className="flex items-center justify-between">
        <button
          onClick={() => setVisibleMonth(prev => shiftMonth(prev, -1))}
          className="px-3 py-1.5 border rounded-md text-sm hover:bg-neutral-50"
        >
          ← Anterior
        </button>
        <h2 className="text-lg font-medium capitalize">{monthLabel}</h2>
        <button
          onClick={() => setVisibleMonth(prev => shiftMonth(prev, 1))}
          className="px-3 py-1.5 border rounded-md text-sm hover:bg-neutral-50"
        >
          Siguiente →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
          <div key={d} className="text-center font-medium text-neutral-500 py-1">{d}</div>
        ))}
        {grid.map(cell => {
          if (!cell) return <div key={Math.random()} />;
          const status = sequence.get(cell.iso);
          const holidayName = holidayNames.get(cell.iso);
          const custom = customDays.find(c => c.date === cell.iso);
          const isToday = cell.iso === todayIso();
          return (
            <DayCell
              key={cell.iso}
              iso={cell.iso}
              day={cell.day}
              status={status}
              holidayName={holidayName}
              isToday={isToday}
              customStatus={custom?.status}
              customOverride={custom?.overrideDayType ?? null}
              events={eventsByDate.get(cell.iso) ?? []}
              cycles={cycleMap.get(cell.iso) ?? []}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Días hábiles (lun-vie) dentro de un rango inclusivo. */
function weekdaysBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const cursor = parseIso(fromIso);
  const end = parseIso(toIso);
  while (cursor <= end) {
    const wd = cursor.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(formatIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Marcar (o desmarcar) una semana entera sin clase.
 *
 * No es una comodidad: si las vacaciones no están marcadas, `computeDayTypes`
 * las cuenta como lectivas y toda la numeración de ciclos queda corrida a
 * partir de ahí. Hacerlo día por día son cinco pop-ups por semana, y eso
 * termina en que no se marca.
 */
function NoClassRange() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rango = desde && hasta && desde <= hasta ? weekdaysBetween(desde, hasta) : [];

  async function aplicar(marcar: boolean) {
    if (rango.length === 0) return;
    const verbo = marcar ? 'marcar como sin clase' : 'quitar la marca de';
    if (!confirm(`Vas a ${verbo} ${rango.length} día(s) hábil(es), del ${desde} al ${hasta}. ¿Seguir?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      for (const iso of rango) {
        if (marcar) await upsertCalendarDay({ date: iso, status: 'cancelado', overrideDayType: null });
        else await clearCalendarDay(iso);
      }
      setMsg(`✅ ${rango.length} día(s) ${marcar ? 'marcados sin clase' : 'restaurados'}. Los ciclos se recalcularon.`);
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-lg p-3 bg-neutral-50 space-y-2">
      <div className="text-sm font-medium">Semana sin clase</div>
      <p className="text-xs text-neutral-600">
        Vacaciones o jornadas institucionales. Los días marcados no consumen ciclo:
        si no los marcas, la numeración queda corrida de ahí en adelante.
      </p>
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-xs">
          <span className="block text-neutral-500 mb-0.5">Desde</span>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                 className="border rounded px-2 py-1 text-sm" />
        </label>
        <label className="text-xs">
          <span className="block text-neutral-500 mb-0.5">Hasta</span>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                 className="border rounded px-2 py-1 text-sm" />
        </label>
        <button
          onClick={() => aplicar(true)}
          disabled={busy || rango.length === 0}
          className="px-3 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
        >
          Marcar {rango.length > 0 ? `${rango.length} día${rango.length === 1 ? '' : 's'}` : ''}
        </button>
        <button
          onClick={() => aplicar(false)}
          disabled={busy || rango.length === 0}
          className="px-3 py-1.5 rounded-md border text-sm hover:bg-white disabled:opacity-40"
        >
          Quitar marca
        </button>
      </div>
      {desde && hasta && desde > hasta && (
        <p className="text-xs text-red-700">La fecha inicial es posterior a la final.</p>
      )}
      {msg && <p className="text-xs text-neutral-700">{msg}</p>}
    </div>
  );
}

function DayCell({
  iso, day, status, holidayName, isToday, customStatus, customOverride, events, cycles,
}: {
  iso: string;
  day: number;
  status: DateStatus | undefined;
  holidayName?: string;
  isToday: boolean;
  customStatus?: 'lectivo' | 'festivo' | 'cancelado';
  customOverride: DayType | null;
  events: CalendarEvent[];
  cycles: CourseCycle[];
}) {
  const [open, setOpen] = useState(false);
  const badge = cycleBadge(cycles);
  const popRef = useRef<HTMLDivElement | null>(null);

  /*
   * El panel se abre encima del calendario y no tenía forma de cerrarse: había
   * que elegir una opción —cancelado, festivo, forzar día— aunque solo se
   * quisiera consultar el ciclo. Se cierra por la X, haciendo clic afuera o con
   * Esc; el clic afuera es el que más se usa sin pensarlo.
   */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const bg =
    status === 'weekend' ? 'bg-neutral-50 text-neutral-400' :
    status === 'skip'    ? 'bg-red-50 text-red-700' :
    status === 'FIJO'    ? 'bg-amber-50 text-amber-800' :
                           'bg-blue-50 text-blue-800';

  const ring = isToday ? 'ring-2 ring-neutral-900' : '';

  const setStatus = async (s: 'festivo' | 'cancelado' | null) => {
    if (s === null) {
      await clearCalendarDay(iso);
    } else {
      await upsertCalendarDay({ date: iso, status: s, overrideDayType: null });
    }
    setOpen(false);
  };

  const setOverride = async (dt: DayType | null) => {
    if (dt === null) {
      await clearCalendarDay(iso);
    } else {
      await upsertCalendarDay({ date: iso, status: 'lectivo', overrideDayType: dt });
    }
    setOpen(false);
  };

  return (
    /* El ref va en el contenedor, no en el panel: si el botón del día quedara
       "fuera", su mousedown cerraría y el click siguiente lo volvería a abrir. */
    <div className="relative" ref={popRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full aspect-square rounded-md text-left p-1.5 border border-transparent hover:border-neutral-300 ${bg} ${ring}`}
        title={holidayName ?? ''}
      >
        <div className="text-xs font-medium">{day}</div>
        <div className="text-[10px] mt-0.5">
          {status && status !== 'weekend' ? dayTypeLabel(status) : ''}
        </div>
        {badge && (
          <div
            className="text-[10px] leading-tight mt-0.5"
            title={cycles.map(c => `${c.courseCode} · ${cycleLabel(c)}`).join('\n')}
          >
            <span className="font-semibold text-neutral-900 bg-white/70 rounded px-1">
              {badge}
            </span>
            {cycles.some(c => c.sessionsInCiclo > 1 && c.session > 1) && (
              <span className="ml-1 text-neutral-600" title="Segunda clase de este ciclo">2ª</span>
            )}
          </div>
        )}
        {holidayName && (
          <div className="text-[9px] truncate mt-0.5" title={holidayName}>
            {holidayName}
          </div>
        )}
        {events.length > 0 && (
          <div className="mt-0.5 flex gap-0.5 flex-wrap">
            {events.slice(0, 6).map(ev => (
              <span
                key={ev.id}
                className={`w-1.5 h-1.5 rounded-full ${eventDotColor(ev.kind)}`}
                title={`${ev.title}${ev.courseCode ? ` (${ev.courseCode})` : ''}`}
              />
            ))}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 bg-white border rounded-md shadow-lg p-2 text-xs w-40 space-y-1">
          <div className="font-medium text-neutral-700 pb-1 border-b mb-1 flex items-center justify-between gap-2">
            <span>{iso}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              title="Cerrar (Esc)"
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded
                         text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
            >
              ✕
            </button>
          </div>

          {cycles.length > 0 && (
            <div className="pb-1 mb-1 border-b">
              <div className="text-[10px] text-neutral-500 px-2 pb-0.5">Ciclo por curso:</div>
              <div className="max-h-28 overflow-auto">
                {cycles.map(c => (
                  <div key={c.courseCode} className="flex justify-between px-2 py-0.5 text-[10px]">
                    <span>{c.courseCode}</span>
                    <span className="tabular-nums font-medium text-neutral-800">
                      {cycleLabel(c)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setStatus('cancelado')} className="w-full text-left px-2 py-1 hover:bg-neutral-100 rounded">
            Marcar cancelado
          </button>
          <button onClick={() => setStatus('festivo')} className="w-full text-left px-2 py-1 hover:bg-neutral-100 rounded">
            Marcar festivo extra
          </button>
          <div className="border-t pt-1 mt-1">
            <div className="text-[10px] text-neutral-500 px-2 pb-1">Forzar día:</div>
            <div className="grid grid-cols-3 gap-1 px-1">
              {(['D1', 'D2', 'D3', 'D4', 'D5', 'FIJO'] as DayType[]).map(dt => (
                <button
                  key={dt}
                  onClick={() => setOverride(dt)}
                  className={`px-1.5 py-0.5 border rounded text-[10px] hover:bg-neutral-100 ${
                    customOverride === dt ? 'bg-neutral-900 text-white border-neutral-900' : ''
                  }`}
                >
                  {dt === 'FIJO' ? 'Fijo' : dt}
                </button>
              ))}
            </div>
          </div>
          {(customStatus || customOverride) && (
            <button
              onClick={() => setStatus(null)}
              className="w-full text-left px-2 py-1 hover:bg-red-50 text-red-700 rounded border-t mt-1 pt-2"
            >
              Quitar override
            </button>
          )}
          <div className="border-t mt-1 pt-2">
            <div className="text-[10px] text-neutral-500 px-2 pb-1">Eventos:</div>
            {events.length === 0 && (
              <div className="text-[10px] text-neutral-400 px-2 pb-1 italic">Ninguno</div>
            )}
            {events.map(ev => (
              <div key={ev.id} className="flex items-center gap-1 px-2 py-0.5 group">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${eventDotColor(ev.kind)}`} />
                <span className="text-[10px] truncate flex-1" title={ev.title}>
                  {ev.title}
                  {ev.courseCode && <span className="text-neutral-400"> · {ev.courseCode}</span>}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); deleteEvent(ev.id!); }}
                  className="text-[10px] text-neutral-300 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            ))}
            <QuickAddEvent iso={iso} />
          </div>
        </div>
      )}
    </div>
  );
}

function QuickAddEvent({ iso }: { iso: string }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CalendarEvent['kind']>('entrega');
  const [courseCode, setCourseCode] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await addEvent({
      title: title.trim(),
      date: iso,
      kind,
      courseCode: courseCode || undefined,
    });
    setTitle('');
  };

  return (
    <form onClick={e => e.stopPropagation()} onSubmit={submit} className="mt-1 space-y-1 px-1">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Añadir evento..."
        className="w-full border rounded px-1.5 py-0.5 text-[10px]"
      />
      <div className="flex gap-1">
        <select
          value={kind}
          onChange={e => setKind(e.target.value as CalendarEvent['kind'])}
          className="border rounded px-1 py-0.5 text-[10px] flex-1 min-w-0"
        >
          <option value="entrega">Entrega</option>
          <option value="actividad">Actividad</option>
          <option value="otro">Otro</option>
        </select>
        <select
          value={courseCode}
          onChange={e => setCourseCode(e.target.value)}
          className="border rounded px-1 py-0.5 text-[10px] flex-1 min-w-0"
        >
          <option value="">Curso</option>
          {CURSOS_ORDER.map(c => <option key={c} value={String(c)}>{c}</option>)}
        </select>
        <button
          type="submit"
          disabled={!title.trim()}
          className="px-2 py-0.5 rounded bg-neutral-900 text-white text-[10px] disabled:opacity-40"
        >
          +
        </button>
      </div>
    </form>
  );
}

function YearConfigForm({
  year, startDate, initialDayType, trim1Start, trim2Start, trim3Start,
}: {
  year: number;
  startDate: string;
  initialDayType: DayType;
  trim1Start: string;
  trim2Start: string;
  trim3Start: string;
}) {
  const [sd, setSd] = useState(startDate);
  const [dt, setDt] = useState<DayType>(initialDayType);
  const [t1, setT1] = useState(trim1Start);
  const [t2, setT2] = useState(trim2Start);
  const [t3, setT3] = useState(trim3Start);

  const dirty = sd !== startDate || dt !== initialDayType
    || t1 !== trim1Start || t2 !== trim2Start || t3 !== trim3Start;

  const save = () => upsertYearConfig({
    year,
    startDate: sd,
    initialDayType: dt,
    trim1Start: t1 || undefined,
    trim2Start: t2 || undefined,
    trim3Start: t3 || undefined,
  });

  return (
    <div className="border rounded-lg p-4 bg-neutral-50 space-y-3">
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Año</label>
          <div className="px-3 py-1.5 border rounded bg-white text-sm">{year}</div>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Primer día lectivo</label>
          <input
            type="date" value={sd} onChange={e => setSd(e.target.value)}
            className="px-3 py-1.5 border rounded bg-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Tipo inicial</label>
          <select
            value={dt} onChange={e => setDt(e.target.value as DayType)}
            className="px-3 py-1.5 border rounded bg-white text-sm"
          >
            {(['D1', 'D2', 'D3', 'D4', 'D5'] as DayType[]).map(x => (
              <option key={x} value={x}>Día {x.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Inicio Trim 1</label>
          <input type="date" value={t1} onChange={e => setT1(e.target.value)}
            className="px-3 py-1.5 border rounded bg-white text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Inicio Trim 2</label>
          <input type="date" value={t2} onChange={e => setT2(e.target.value)}
            className="px-3 py-1.5 border rounded bg-white text-sm" />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Inicio Trim 3</label>
          <input type="date" value={t3} onChange={e => setT3(e.target.value)}
            className="px-3 py-1.5 border rounded bg-white text-sm" />
        </div>
        <button
          disabled={!dirty}
          onClick={save}
          className="px-4 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

// ---- helpers de grid ----

type Cell = { iso: string; day: number } | null;

function buildMonthGrid(year: number, month: number): Cell[] {
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const jsWd = first.getUTCDay();                // 0 dom .. 6 sáb
  const leadBlanks = (jsWd + 6) % 7;             // convertir a L=0 ... D=6
  const cells: Cell[] = [];
  for (let i = 0; i < leadBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = formatIso(new Date(Date.UTC(year, month, d)));
    cells.push({ iso, day: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(cur: { year: number; month: number }, delta: number) {
  const total = cur.year * 12 + cur.month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}
