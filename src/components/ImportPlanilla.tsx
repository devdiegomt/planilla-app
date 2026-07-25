'use client';

import { useState } from 'react';
import { importPlanilla, importCodAlumMap } from '@/lib/importer';
import { upsertCourseWithStudents } from '@/lib/db';
import { DIRECTORES } from '@/lib/constants';
import { normalizeName } from '@/lib/utils';

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
      setStatus(`❌ Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCodMap(file: File) {
    setBusy(true);
    setStatus(`Procesando ${file.name}...`);
    try {
      const buf = await file.arrayBuffer();
      const map = await importCodAlumMap(buf);

      // Guardar el mapa completo en localStorage (para el exportador)
      const serialized = JSON.stringify(Array.from(map.entries()));
      localStorage.setItem('codAlumMap', serialized);

      // Además, actualizar codAlum de estudiantes ya importados
      const { db } = await import('@/lib/db');
      const students = await db.students.toArray();
      let updated = 0;
      for (const s of students) {
        const cod = map.get(normalizeName(s.nombre));
        if (cod && s.codAlum !== cod) {
          await db.students.update(s.id!, { codAlum: cod });
          updated++;
        }
      }
      setStatus(`✅ Mapa cargado: ${map.size} códigos. Actualizados: ${updated} estudiantes.`);
    } catch (err) {
      setStatus(`❌ Error: ${(err as Error).message}`);
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
      <div>
        <label className="block text-sm font-medium mb-1">
          Consolidado de códigos (Califica-XXX.xls o .xlsx)
        </label>
        <input
          type="file"
          accept=".xls,.xlsx"
          disabled={busy}
          onChange={e => e.target.files?.[0] && handleCodMap(e.target.files[0])}
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
