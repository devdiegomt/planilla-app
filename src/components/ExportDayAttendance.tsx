'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { downloadBlob } from '@/lib/utils';
import { todayIso } from '@/lib/schedule';
import {
  buildDayAttendanceExports, toFechaDDMMYYYY, type DayExportItem,
} from '@/lib/attendanceExport';

/**
 * Descarga en un ZIP la asistencia de todas las clases de un día.
 *
 * El autofill procesa un curso y una hora por corrida, así que el ZIP no evita
 * las N corridas — evita las N navegaciones y, sobre todo, tener que acertar el
 * ciclo a mano en cada curso. El ciclo y la sesión salen de la fecha.
 */
export function ExportDayAttendance() {
  const [fecha, setFecha] = useState(() => todayIso());
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<DayExportItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const yearCfg = useLiveQuery(
    () => db.yearConfig.where('year').equals(new Date().getFullYear()).first(), [],
  );
  const schedule = useLiveQuery(() => db.schedule.toArray(), []) ?? [];
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
  const students = useLiveQuery(() => db.students.toArray(), []) ?? [];
  const calendarDays = useLiveQuery(() => db.calendarDays.toArray(), []) ?? [];

  const esHoy = fecha === todayIso();

  async function handleClick() {
    setBusy(true);
    setError(null);
    setItems(null);
    try {
      if (!yearCfg) throw new Error('Falta la configuración del año. Defínela en /calendario.');

      const res = buildDayAttendanceExports({
        dateIso: fecha, courses, students, schedule, calendarDays, yearConfig: yearCfg,
      });
      setItems(res);

      const ok = res.filter(i => i.result);
      if (ok.length === 0) {
        setError(res.length === 0
          ? 'Ese día no tienes clases según el horario y el calendario.'
          : 'Ninguna clase de ese día se pudo exportar. Mira el detalle.');
        return;
      }

      // JSZip pesa lo suyo y solo hace falta al pulsar: se carga aquí y no en
      // el primer render de la home.
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const it of ok) {
        zip.file(it.result!.filename, JSON.stringify(it.result!.payload, null, 2));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `asistencia-${fecha}.zip`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ok = items?.filter(i => i.result) ?? [];
  const fallidos = items?.filter(i => i.error) ?? [];
  const sinCodigo = ok.flatMap(i => i.result!.sinCodAlum);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-xs">
          <span className="block text-neutral-500 mb-0.5">Día</span>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </label>
        <button
          onClick={handleClick}
          disabled={busy || !yearCfg}
          className="px-3 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
        >
          {busy ? 'Generando…' : '⬇ Asistencia del día (ZIP)'}
        </button>
      </div>

      {!esHoy && (
        <p className="text-xs text-amber-700">
          ⚠ No es hoy. Los archivos no llevan fecha, así que el autofill los
          registraría con la de hoy: ajústala en Classroom Live antes de correrlos.
        </p>
      )}

      {error && <p className="text-sm text-red-700">❌ {error}</p>}

      {items && items.length > 0 && (
        <div className="text-xs space-y-1">
          <p className="text-neutral-700">
            {ok.length} archivo{ok.length === 1 ? '' : 's'}
            {fallidos.length > 0 && ` · ${fallidos.length} sin generar`}
          </p>
          <ul className="divide-y divide-neutral-100 border rounded">
            {items.map(it => (
              <li key={`${it.courseCode}-${it.session ?? ''}`} className="px-2 py-1 flex gap-2">
                <span className="font-medium w-12 shrink-0">{it.courseCode}</span>
                {it.result ? (
                  <span className="text-neutral-600">
                    ciclo {it.ciclo}{it.session ? ` · S${it.session}` : ''}
                    {' · '}bloque {it.result.payload.hora}
                    {' · '}
                    <span className={it.result.payload.marcas.length ? 'font-medium' : ''}>
                      {it.result.payload.marcas.length} marca
                      {it.result.payload.marcas.length === 1 ? '' : 's'}
                    </span>
                  </span>
                ) : (
                  <span className="text-red-700">{it.error}</span>
                )}
              </li>
            ))}
          </ul>
          {ok.length > 0 && (
            <p className="text-neutral-500">
              Fecha de las sesiones: {toFechaDDMMYYYY(ok[0].result!.fechaIso)}
              {' · '}{ok[0].result!.dayType}
            </p>
          )}
          {sinCodigo.length > 0 && (
            <p className="text-amber-700">
              ⚠ {sinCodigo.length} estudiante(s) sin COD_ALUM quedaron fuera:{' '}
              {[...new Set(sinCodigo)].slice(0, 3).join(', ')}
              {sinCodigo.length > 3 && ' …'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
