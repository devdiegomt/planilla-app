'use client';

import { useState } from 'react';
import { importPlanilla } from '@/lib/importer';
import { upsertCourseWithStudents } from '@/lib/db';

export function ImportPlanilla() {
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function handlePlanilla(file: File) {
    setBusy(true);
    setStatus(`Procesando ${file.name}...`);
    try {
      const buf = await file.arrayBuffer();
      const { courses, warnings } = await importPlanilla(buf);

      let totalStudents = 0;
      for (const course of courses) {
        const { students, ...courseData } = course;
        await upsertCourseWithStudents(courseData, students);
        totalStudents += students.length;
      }
      const wmsg = warnings.length ? ` (${warnings.length} advertencias)` : '';
      setStatus(`✅ Importados ${courses.length} cursos, ${totalStudents} estudiantes${wmsg}`);
    } catch (err) {
      setStatus(`❌ No se pudo importar: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">
          Planilla del año (PLANILLA-NOTAS-*.xlsx)
        </label>
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={e => e.target.files?.[0] && handlePlanilla(e.target.files[0])}
          className="block w-full text-sm"
        />
      </div>
      {status && (
        <p className={`text-sm ${status.startsWith('❌') ? 'text-red-600' : 'text-neutral-700'}`}>
          {status}
        </p>
      )}
    </div>
  );
}
