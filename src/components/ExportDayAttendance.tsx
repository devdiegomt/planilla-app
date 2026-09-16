'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { downloadBlob } from '@/lib/utils';
import { todayIso } from '@/lib/schedule';
import {
  buildDayAttendanceExports, toFechaDDMMYYYY, type DayExportItem,
} from '@/lib/attendanceExport';

/**
 * La asistencia del día, curso por curso, para pegar en el autofill.
 *
 * Antes esto bajaba un ZIP con un JSON por curso, y había que descomprimirlo y
 * después buscar cada archivo en el explorador. El panel del autofill
 * (planilla-v2) recibe el JSON en un `<textarea>` — el selector de archivo solo
 * lo rellena —, así que copiar y pegar salta el ZIP, la descompresión y el
 * explorador de archivos, y encima funciona igual en el celular.
 *
 * La lista se arma sola al elegir la fecha: es el recorrido del día, y marcar
 * lo ya copiado es lo que evita perder la cuenta entre cinco clases.
 *
 * El ZIP sigue disponible como respaldo, para cuando no hay portapapeles
 * (contexto inseguro, permisos) o se quiere guardar el día entero.
 */
/** "ciclo 4·S2 · bloque 6 · 3 marcas" */
function detalleDe(i: DayExportItem): string {
  const n = i.result!.payload.marcas.length;
  return `ciclo ${i.ciclo}${i.session ? `·S${i.session}` : ''}`
    + ` · bloque ${i.result!.payload.hora}`
    + ` · ${n} marca${n === 1 ? '' : 's'}`;
}

export function ExportDayAttendance() {
  const [fecha, setFecha] = useState(() => todayIso());
  const [busy, setBusy] = useState(false);
  const [copiados, setCopiados] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<string | null>(null);
  const [manual, setManual] = useState<{ clave: string; json: string } | null>(null);

  const yearCfg = useLiveQuery(
    () => db.yearConfig.where('year').equals(new Date().getFullYear()).first(), [],
  );
  const schedule = useLiveQuery(() => db.schedule.toArray(), []) ?? [];
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
  const students = useLiveQuery(() => db.students.toArray(), []) ?? [];
  const calendarDays = useLiveQuery(() => db.calendarDays.toArray(), []) ?? [];

  const esHoy = fecha === todayIso();

  // Se arma al cambiar la fecha, sin pulsar nada: es una función pura sobre lo
  // que ya está en memoria.
  const { items, error } = useMemo((): { items: DayExportItem[]; error: string | null } => {
    if (!yearCfg) return { items: [], error: 'Falta el año lectivo. Defínelo en Calendario.' };
    try {
      const res = buildDayAttendanceExports({
        dateIso: fecha, courses, students, schedule, calendarDays, yearConfig: yearCfg,
      });
      if (res.length === 0) {
        return { items: [], error: 'Ese día no tienes clases según el horario y el calendario.' };
      }
      return { items: res, error: null };
    } catch (e) {
      return { items: [], error: (e as Error).message };
    }
  }, [fecha, yearCfg, courses, students, schedule, calendarDays]);

  const ok = items.filter(i => i.result);
  const fallidos = items.filter(i => i.error);
  const sinCodigo = ok.flatMap(i => i.result!.sinCodAlum);

  const claveDe = (i: DayExportItem) => `${i.courseCode}-${i.session ?? ''}`;

  async function copiar(i: DayExportItem) {
    const clave = claveDe(i);
    const json = JSON.stringify(i.result!.payload, null, 2);
    setAviso(null);
    try {
      await navigator.clipboard.writeText(json);
      setCopiados(prev => new Set(prev).add(clave));
      setManual(null);
    } catch {
      // Sin portapapeles (contexto inseguro o permiso denegado) se muestra el
      // JSON para copiarlo a mano, en vez de dejar el botón sin hacer nada.
      setManual({ clave, json });
      setAviso('El navegador no dejó copiar. Selecciona el texto y cópialo a mano.');
    }
  }

  async function descargarZip() {
    setBusy(true);
    setAviso(null);
    try {
      // JSZip pesa lo suyo y solo hace falta al pulsar.
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const it of ok) {
        zip.file(it.result!.filename, JSON.stringify(it.result!.payload, null, 2));
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `asistencia-${fecha}.zip`);
    } catch (e) {
      setAviso(`No se pudo armar el ZIP: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const faltan = ok.length - ok.filter(i => copiados.has(claveDe(i))).length;

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-xs">
          <span className="block text-neutral-500 mb-0.5">Día</span>
          <input
            type="date"
            value={fecha}
            onChange={e => { setFecha(e.target.value); setCopiados(new Set()); setManual(null); }}
            className="border rounded px-2 py-1 text-sm"
          />
        </label>
        {ok.length > 0 && (
          <p className="text-xs text-neutral-600 pb-1.5">
            {faltan === 0
              ? `✅ Copiaste las ${ok.length}`
              : `${ok.length} clase${ok.length === 1 ? '' : 's'} · faltan ${faltan}`}
          </p>
        )}
      </div>

      {ok.length > 0 && (
        <p className="text-xs text-neutral-500">
          Copia una y pégala en el recuadro del panel de asistencia en Classroom
          Live. Repite con la siguiente.
        </p>
      )}

      {!esHoy && ok.length > 0 && (
        <p className="text-xs text-amber-700">
          ⚠ No es hoy. Los archivos no llevan fecha, así que el autofill los
          registraría con la de hoy: ajústala en Classroom Live antes de correrlos.
        </p>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      {aviso && <p className="text-xs text-amber-700">{aviso}</p>}

      {items.length > 0 && (
        <ul className="divide-y divide-neutral-100 border rounded text-xs">
          {items.map(i => {
            const clave = claveDe(i);
            const copiado = copiados.has(clave);
            return (
              <li key={clave} className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium w-10 shrink-0">{i.courseCode}</span>
                  {i.result ? (
                    <>
                      {/* En móvil el detalle baja a su propia línea: truncado
                          escondía el número de marcas, que es lo que confirma
                          que el JSON no va vacío. */}
                      <span className="hidden sm:inline text-neutral-600 truncate min-w-0">
                        {detalleDe(i)}
                      </span>
                      <button
                        onClick={() => copiar(i)}
                        className={`ml-auto shrink-0 px-2 py-1 rounded-md border whitespace-nowrap
                                    ${copiado
                                      ? 'bg-green-50 border-green-300 text-green-800'
                                      : 'hover:bg-neutral-50'}`}
                      >
                        {copiado ? '✓ Copiado' : 'Copiar'}
                      </button>
                    </>
                  ) : (
                    <span className="text-red-700">{i.error}</span>
                  )}
                </div>
                {i.result && (
                  <div className="sm:hidden text-neutral-500 mt-0.5">{detalleDe(i)}</div>
                )}
                {manual?.clave === clave && (
                  <textarea
                    readOnly
                    value={manual.json}
                    onFocus={e => e.currentTarget.select()}
                    rows={4}
                    className="mt-1 w-full border rounded p-1 font-mono text-[11px]"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-500">
          <button
            onClick={descargarZip}
            disabled={busy || ok.length === 0}
            className="px-2 py-1 rounded-md border hover:bg-neutral-50 disabled:opacity-40"
          >
            {busy ? 'Armando…' : '⬇ Bajar las ' + ok.length + ' en un ZIP'}
          </button>
          {ok.length > 0 && (
            <span>
              {toFechaDDMMYYYY(ok[0].result!.fechaIso)} · {ok[0].result!.dayType}
            </span>
          )}
          {fallidos.length > 0 && <span>{fallidos.length} sin generar</span>}
        </div>
      )}

      {sinCodigo.length > 0 && (
        <p className="text-xs text-amber-700">
          ⚠ {sinCodigo.length} estudiante(s) sin código quedaron fuera:{' '}
          {[...new Set(sinCodigo)].slice(0, 3).join(', ')}
          {sinCodigo.length > 3 && ' …'}
        </p>
      )}
    </div>
  );
}
