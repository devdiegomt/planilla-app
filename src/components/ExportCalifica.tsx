'use client';

import { useState } from 'react';
import { exportCalifica } from '@/lib/exporter';
import { db } from '@/lib/db';
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
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setReport(null);
    setError(null);
    try {
      // El mapa del Califica-451 ya no es obligatorio: si los estudiantes tienen
      // `codAlum` en la fila (importado del JSON del extractor de planilla-v2),
      // el exportador se apoya en eso. Solo se exige cuando falta en ambos lados.
      const raw = localStorage.getItem('codAlumMap');
      const codAlumMap = new Map<string, string>(raw ? JSON.parse(raw) : []);
      if (!raw && students.some(s => !s.codAlum)) {
        setError(
          'Faltan códigos de estudiante. Importa el JSON de Classroom Live ' +
          '(o el consolidado Califica) en la página principal.',
        );
        return;
      }

      const { blob, report } = await exportCalifica({ course, students, codAlumMap, trimestre });
      downloadBlob(blob, report.filename);
      setReport(report);

      // Los nombres de los logros solo existen en la plantilla. Guardarlos aquí
      // evita tener que abrirla de nuevo para que la grilla los muestre.
      if (course.id && report.achievements.length > 0) {
        const prev = JSON.stringify(course.achievements ?? []);
        if (prev !== JSON.stringify(report.achievements)) {
          await db.courses.update(course.id, { achievements: report.achievements });
        }
      }
    } catch (err) {
      setError((err as Error).message);
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

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-300 rounded p-2 max-w-xl">
          <p className="font-medium mb-1">❌ No se generó el archivo</p>
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{error}</pre>
        </div>
      )}

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
