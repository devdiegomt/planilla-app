'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, upsertScheduleBlock, deleteScheduleBlock } from '@/lib/db';
import { CURSOS_ORDER } from '@/lib/constants';
import type { DayType, ScheduleBlock } from '@/types';

const DAY_TYPES: DayType[] = ['D1', 'D2', 'D3', 'D4', 'D5', 'FIJO'];

function labelFor(dt: DayType) {
  return dt === 'FIJO' ? 'Día Fijo (viernes)' : `Día ${dt.slice(1)}`;
}

export function HorarioEditor() {
  const [selectedDay, setSelectedDay] = useState<DayType>('D1');
  const blocks = useLiveQuery(
    () => db.schedule.where('dayType').equals(selectedDay).sortBy('block'),
    [selectedDay],
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {DAY_TYPES.map(dt => (
          <button
            key={dt}
            onClick={() => setSelectedDay(dt)}
            className={`px-3 py-1.5 rounded-md text-sm border ${
              selectedDay === dt
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {labelFor(dt)}
          </button>
        ))}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 text-left border-b">
              <th className="p-2 w-16">Bloque</th>
              <th className="p-2 w-28">Curso</th>
              <th className="p-2 w-24">Inicio</th>
              <th className="p-2 w-24">Fin</th>
              <th className="p-2">Aula</th>
              <th className="p-2 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {blocks?.map(b => (
              <BlockRow key={b.id} block={b} />
            ))}
            <NewBlockRow
              dayType={selectedDay}
              nextBlock={(blocks?.at(-1)?.block ?? 0) + 1}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlockRow({ block }: { block: ScheduleBlock }) {
  const [b, setB] = useState(block);

  const save = (patch: Partial<ScheduleBlock>) => {
    const next = { ...b, ...patch };
    setB(next);
    upsertScheduleBlock(next);
  };

  return (
    <tr className="border-b">
      <td className="p-2">
        <input
          type="number"
          min={1}
          max={12}
          value={b.block}
          onChange={e => save({ block: parseInt(e.target.value) || 1 })}
          className="w-14 border rounded px-2 py-1"
        />
      </td>
      <td className="p-2">
        <select
          value={b.courseCode}
          onChange={e => save({ courseCode: e.target.value })}
          className="border rounded px-2 py-1 w-full"
        >
          {CURSOS_ORDER.map(c => (
            <option key={c} value={String(c)}>{c}</option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <input
          type="time"
          value={b.startTime}
          onChange={e => save({ startTime: e.target.value })}
          className="border rounded px-2 py-1"
        />
      </td>
      <td className="p-2">
        <input
          type="time"
          value={b.endTime}
          onChange={e => save({ endTime: e.target.value })}
          className="border rounded px-2 py-1"
        />
      </td>
      <td className="p-2">
        <input
          type="text"
          value={b.room ?? ''}
          onChange={e => save({ room: e.target.value })}
          className="border rounded px-2 py-1 w-full"
          placeholder="—"
        />
      </td>
      <td className="p-2">
        <button
          onClick={() => deleteScheduleBlock(b.id!)}
          className="text-red-600 hover:text-red-800 text-xs"
        >
          Borrar
        </button>
      </td>
    </tr>
  );
}

function NewBlockRow({ dayType, nextBlock }: { dayType: DayType; nextBlock: number }) {
  const [courseCode, setCourseCode] = useState(String(CURSOS_ORDER[0]));
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('07:45');
  const [room, setRoom] = useState('');

  const add = () => {
    upsertScheduleBlock({
      dayType,
      block: nextBlock,
      courseCode,
      startTime,
      endTime,
      room: room || undefined,
    });
    setRoom('');
  };

  return (
    <tr className="bg-neutral-50">
      <td className="p-2 text-neutral-500">{nextBlock}</td>
      <td className="p-2">
        <select
          value={courseCode}
          onChange={e => setCourseCode(e.target.value)}
          className="border rounded px-2 py-1 w-full"
        >
          {CURSOS_ORDER.map(c => (
            <option key={c} value={String(c)}>{c}</option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <input
          type="time"
          value={startTime}
          onChange={e => setStartTime(e.target.value)}
          className="border rounded px-2 py-1"
        />
      </td>
      <td className="p-2">
        <input
          type="time"
          value={endTime}
          onChange={e => setEndTime(e.target.value)}
          className="border rounded px-2 py-1"
        />
      </td>
      <td className="p-2">
        <input
          type="text"
          value={room}
          onChange={e => setRoom(e.target.value)}
          className="border rounded px-2 py-1 w-full"
          placeholder="Aula"
        />
      </td>
      <td className="p-2">
        <button
          onClick={add}
          className="text-neutral-900 hover:underline text-xs font-medium"
        >
          + Añadir
        </button>
      </td>
    </tr>
  );
}
