'use client';

import { useState } from 'react';
import { exportObservations } from '@/lib/exporter';
import { downloadBlob } from '@/lib/utils';
import type { Course, Student } from '@/types';

interface Props {
  course: Course;
  students: Student[];                 // activos
}

/**
 * Descarga un XLSX con todas las observaciones de nota del curso: una fila por
 * observación, con nombre + columna + categoría + nota + texto. Deshabilitado
 * si ningún activo tiene observaciones aún.
 */
export function ExportObservations({ course, students }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const anyObs = students.some(s =>
    Object.values(s.noteObservations ?? {}).some(v => v?.trim())
  );

  async function handleExport() {
    setBusy(true);
    setMsg(null);
    try {
      const result = await exportObservations(course, students);
      if (!result) { setMsg('No hay observaciones en este curso.'); return; }
      downloadBlob(result.blob, result.report.filename);
      setMsg(
        `✅ ${result.report.rows} observaciones · ` +
        `${result.report.studentsWithObs} estudiante${result.report.studentsWithObs === 1 ? '' : 's'}`
      );
    } catch (err) {
      setMsg(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleExport}
        disabled={busy || !anyObs}
        title={anyObs ? 'Descargar observaciones (XLSX)' : 'Sin observaciones para exportar'}
        className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-40"
      >
        {busy ? 'Generando…' : '📝 Observaciones'}
      </button>
      {msg && <p className="text-xs text-neutral-600">{msg}</p>}
    </div>
  );
}
