'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, upsertYearConfig } from '@/lib/db';
import { gradesOf } from '@/lib/courseOrder';
import { normalizeSubjects, subjectFor } from '@/lib/subjects';
import type { SubjectConfig } from '@/types';

/**
 * Las materias que el docente dicta, por grado.
 *
 * Antes eran la constante `GRADE_META`: Informática de 8° a 11°, fija en el
 * código. Un docente de otra materia no podía exportar ni el Califica ni la
 * asistencia, porque la cabecera del Califica lleva el nombre y el código de
 * la asignatura, y el autofill busca ese nombre en la lista de la plataforma.
 *
 * Los grados salen de los cursos importados: no tiene sentido pedir la materia
 * de un grado que no se dicta.
 */
export function SubjectsConfig() {
  const year = new Date().getFullYear();
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
  const yearCfg = useLiveQuery(
    () => db.yearConfig.where('year').equals(year).first(), [year],
  );

  const grades = gradesOf(courses);
  const [filas, setFilas] = useState<SubjectConfig[]>([]);
  const [estado, setEstado] = useState('');

  // Una fila por grado que el docente dicta, con lo ya guardado si existe.
  useEffect(() => {
    setFilas(grades.map(g => subjectFor(yearCfg, g) ?? { grade: g, codMat: '', materia: '' }));
    // `grades.join` y no `grades`: el arreglo es nuevo en cada render.
  }, [grades.join(','), yearCfg]);

  const set = (grade: number, patch: Partial<SubjectConfig>) =>
    setFilas(prev => prev.map(f => (f.grade === grade ? { ...f, ...patch } : f)));

  const guardar = async () => {
    if (!yearCfg) {
      setEstado('❌ Primero definí el año lectivo en Calendario.');
      return;
    }
    const { id: _id, ...resto } = yearCfg;
    await upsertYearConfig({ ...resto, subjects: normalizeSubjects(filas) });
    setEstado('✅ Guardado');
  };

  if (courses.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Importa tu Califica primero: los grados salen de tus cursos.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        El nombre tiene que coincidir con el de la lista de asignaturas de la
        plataforma — el autofill de asistencia lo busca por ahí. El código
        (2508, 3011…) aparece en el Califica, y al importar los códigos la app
        te avisa si no coincide.
      </p>

      <ul className="space-y-2">
        {filas.map(f => (
          // Una tarjeta por grado: en una sola fila, a 360px el código se caía
          // a otra línea y quedaba desalineado del grado al que pertenece.
          <li key={f.grade} className="border rounded-md bg-white p-2 space-y-1.5">
            <div className="text-sm font-medium">{f.grade}°</div>
            <div className="flex gap-2">
              <label className="text-xs flex-1 min-w-0">
                <span className="block text-neutral-500 mb-0.5">Materia</span>
                <input
                  type="text"
                  value={f.materia}
                  onChange={e => set(f.grade, { materia: e.target.value })}
                  placeholder="Como en la plataforma"
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs w-24 shrink-0">
                <span className="block text-neutral-500 mb-0.5">Código</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={f.codMat}
                  onChange={e => set(f.grade, { codMat: e.target.value })}
                  placeholder="2508"
                  className="w-full border rounded px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button
          onClick={guardar}
          className="px-3 py-1.5 rounded-md bg-neutral-900 text-white text-sm"
        >
          Guardar materias
        </button>
        {estado && <span className="text-sm text-neutral-600">{estado}</span>}
      </div>
    </div>
  );
}
