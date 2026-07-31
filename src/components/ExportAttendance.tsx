'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { downloadBlob } from '@/lib/utils';
import {
  buildAttendanceExport, AttendanceExportError,
  type AttendanceExportResult,
} from '@/lib/attendanceExport';
import type { Course, Student } from '@/types';

interface Props {
  course: Course;
  students: Student[];                 // activos del curso
  ciclo: number;
  /** Requerido en 11°: cada sesión cae en una fecha distinta. */
  session?: 1 | 2;
}

/**
 * Descarga el JSON de asistencia del ciclo para `asistencia-autofill`.
 *
 * El resumen previo (fecha, bloque, marcas) importa: el autofill tiene dry-run,
 * pero si el archivo trae la fecha equivocada el dry-run la mostrará igual de
 * convincente. Ver la fecha resuelta antes de descargar es la única defensa
 * contra un trimestre mal configurado.
 */
export function ExportAttendance({ course, students, ciclo, session }: Props) {
  const [result, setResult] = useState<AttendanceExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const yearConfig = useLiveQuery(
    () => db.yearConfig.where('year').equals(course.year).first(),
    [course.year],
  );
  const schedule = useLiveQuery(() => db.schedule.toArray(), []) ?? [];
  const calendarDays = useLiveQuery(() => db.calendarDays.toArray(), []) ?? [];

  const label = session ? `JSON S${session}` : 'JSON asistencia';

  function handleClick() {
    setError(null);
    setResult(null);
    if (!yearConfig) {
      setError('Falta la configuración del año. Defínela en /calendario.');
      return;
    }
    try {
      const res = buildAttendanceExport({
        course, students, schedule, calendarDays, yearConfig, ciclo, session,
      });
      downloadBlob(
        new Blob([JSON.stringify(res.payload, null, 2)], { type: 'application/json' }),
        res.filename,
      );
      setResult(res);
    } catch (e) {
      setError(e instanceof AttendanceExportError
        ? e.message
        : `Error inesperado: ${(e as Error).message}`);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={!yearConfig}
        title="Descargar para asistencia-autofill (Classroom Live)"
        className="px-2 py-1 rounded border text-xs bg-white hover:bg-neutral-50 disabled:opacity-40"
      >
        ⬇ {label}
      </button>

      {result && (
        <span className="text-[10px] text-neutral-600 text-right leading-tight">
          {result.payload.fecha} · {result.dayType} · bloque {result.payload.hora}
          {' · '}
          <span className={result.payload.marcas.length ? 'font-medium' : ''}>
            {result.payload.marcas.length} marca{result.payload.marcas.length === 1 ? '' : 's'}
          </span>
          {result.sinCodAlum.length > 0 && (
            <span className="block text-amber-700">
              ⚠ {result.sinCodAlum.length} sin COD_ALUM: {result.sinCodAlum.slice(0, 2).join(', ')}
              {result.sinCodAlum.length > 2 && ` +${result.sinCodAlum.length - 2}`}
            </span>
          )}
        </span>
      )}

      {error && (
        <span className="text-[10px] text-red-600 text-right max-w-[260px] leading-tight">
          {error}
        </span>
      )}
    </span>
  );
}
