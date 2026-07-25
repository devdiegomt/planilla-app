'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  upsertYearConfig,
  upsertCalendarDay,
  clearCalendarDay,
} from '@/lib/db';
import {
  computeDayTypes,
  dayTypeLabel,
  formatIso,
  todayIso,
  type DateStatus,
} from '@/lib/schedule';
import { holidaysForYear } from '@/lib/holidays-co';
import type { DayType } from '@/types';

const DEFAULT_YEAR = new Date().getFullYear();

export function CalendarView() {
  const yearCfg = useLiveQuery(() => db.yearConfig.where('year').equals(DEFAULT_YEAR).first());
  const customDays = useLiveQuery(() => db.calendarDays.toArray()) ?? [];

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
            />
          );
        })}
      </div>
    </div>
  );
}

function DayCell({
  iso, day, status, holidayName, isToday, customStatus, customOverride,
}: {
  iso: string;
  day: number;
  status: DateStatus | undefined;
  holidayName?: string;
  isToday: boolean;
  customStatus?: 'lectivo' | 'festivo' | 'cancelado';
  customOverride: DayType | null;
}) {
  const [open, setOpen] = useState(false);

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
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full aspect-square rounded-md text-left p-1.5 border border-transparent hover:border-neutral-300 ${bg} ${ring}`}
        title={holidayName ?? ''}
      >
        <div className="text-xs font-medium">{day}</div>
        <div className="text-[10px] mt-0.5">
          {status && status !== 'weekend' ? dayTypeLabel(status) : ''}
        </div>
        {holidayName && (
          <div className="text-[9px] truncate mt-0.5" title={holidayName}>
            {holidayName}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 bg-white border rounded-md shadow-lg p-2 text-xs w-40 space-y-1">
          <div className="font-medium text-neutral-700 pb-1 border-b mb-1">{iso}</div>
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
        </div>
      )}
    </div>
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
