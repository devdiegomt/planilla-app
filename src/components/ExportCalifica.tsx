'use client';

import { useState } from 'react';
import { exportCalifica } from '@/lib/exporter';
import { downloadBlob } from '@/lib/utils';
import type { Course, Student, ExportReport } from '@/types';

interface Props {
  course: Course;
  students: Student[];  // activos
  trimestre: number;
}

export function ExportCalifica({ course, students, trimestre }: Props) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ExportReport | null>(null);

  async function handleExport() {
    setBusy(true);
    setReport(null);
    try {
      const raw = localStorage.getItem('codAlumMap');
      if (!raw) {
        alert('Primero sube el consolidado de códigos en la página principal.');
        return;
      }
      const codAlumMap = new Map<string, string>(JSON.parse(raw));

      const { blob, report } = await exportCalifica({ course, students, codAlumMap, trimestre });
      downloadBlob(blob, report.filename);
      setReport(report);
    } catch (err) {
      alert(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleExport}
        disabled={busy}
        className="rounded-md bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50"
      >
        {busy ? 'Generando...' : `Generar Califica del curso ${course.code}`}
      </button>
      {report && (
        <div className="text-sm text-neutral-700">
          <p>✅ Generado: {report.filename} ({report.nEstudiantesEscritos} estudiantes)</p>
          {report.typoMatches.length > 0 && (
            <div className="text-amber-700 mt-1">
              <p className="font-medium">Typos corregidos automáticamente:</p>
              <ul className="list-disc list-inside">
                {report.typoMatches.map((t, i) => (
                  <li key={i}>{t.planilla} → {t.califica} (COD {t.cod})</li>
                ))}
              </ul>
            </div>
          )}
          {report.estudiantesSinCodAlum.length > 0 && (
            <div className="text-red-700 mt-1">
              <p className="font-medium">⚠️ Sin COD_ALUM (corrige antes de subir):</p>
              <ul className="list-disc list-inside">
                {report.estudiantesSinCodAlum.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
