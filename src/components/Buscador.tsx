'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { calcDef } from '@/lib/formula';
import { slotsFor } from '@/lib/constants';
import { useSubjects } from '@/lib/useSubjects';
import {
  interpretar, responder, EJEMPLOS,
  type DatoEstudiante, type Respuesta,
} from '@/lib/consulta';

/**
 * Preguntar en español sobre los propios cursos.
 *
 * Todo pasa en el dispositivo: lee lo que ya está guardado y responde. **Ningún
 * nombre ni nota sale de acá**, que con menores es la diferencia entre poder
 * usarlo y no.
 *
 * Responde lo que entiende y dice cuando no entendió. No devuelve una
 * aproximación: una respuesta plausible pero equivocada sobre las notas de un
 * estudiante es peor que "no te entendí, probá con esto".
 */
export function Buscador() {
  const [texto, setTexto] = useState('');
  const [preguntado, setPreguntado] = useState('');

  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const students = useLiveQuery(() => db.students.toArray(), []);
  const subjects = useSubjects();

  /*
   * Las fallas y los retardos se cuentan por ciclo, igual que en el resumen del
   * curso (`computeAttendanceStats`). Contarlos distinto acá daría dos números
   * para lo mismo según qué pantalla se mire.
   */
  const datos = useMemo<DatoEstudiante[]>(() => {
    if (!courses || !students) return [];
    const porId = new Map(courses.map(c => [c.id!, c]));
    return students.flatMap(s => {
      const curso = porId.get(s.courseId);
      if (!curso) return [];
      const slots = slotsFor(curso.grade, subjects);
      const r = calcDef(s.subnotas ?? {}, slots, 'platform');
      let fallas = 0, fallasJust = 0, retardos = 0;
      for (const c of s.cycles ?? []) {
        if (c.F) { fallas++; if (c.Fj) fallasJust++; }
        if (c.R) retardos++;
      }
      return [{
        student: s,
        courseCode: curso.code,
        grade: curso.grade,
        def: r.definitiva,
        cats: { K: r.K, M: r.M, U: r.U, C: r.C, E: r.E },
        fallas, fallasJust, retardos,
        // 0 es "sin calificar": es lo que la plataforma ignora al promediar.
        sinCalificar: slots.map(sl => sl.key).filter(k => !(s.subnotas?.[k] > 0)),
      }];
    });
  }, [courses, students]);

  const resultado = useMemo<Respuesta | null>(() => {
    if (!preguntado) return null;
    const consulta = interpretar(preguntado, { cursos: (courses ?? []).map(c => c.code) });
    return consulta ? responder(consulta, datos) : null;
  }, [preguntado, courses, datos]);

  const noEntendio = preguntado !== '' && resultado === null;

  return (
    <div className="space-y-3 min-w-0">
      <form
        onSubmit={e => { e.preventDefault(); setPreguntado(texto.trim()); }}
        className="flex gap-2 min-w-0"
      >
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="¿Quién va perdiendo en 11?"
          aria-label="Pregunta sobre tus cursos"
          className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="shrink-0 text-sm px-3 py-2 rounded-lg boton-primario"
        >
          Preguntar
        </button>
      </form>

      {!preguntado && (
        <p className="text-[11px] text-neutral-500">
          Responde con lo que está en este equipo. Nada sale de acá.
        </p>
      )}

      {noEntendio && (
        <div className="text-sm">
          <p className="text-amber-700">No entendí esa pregunta. Probá con alguna de estas:</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {EJEMPLOS.map(e => (
              <li key={e}>
                <button
                  onClick={() => { setTexto(e); setPreguntado(e); }}
                  className="text-xs border rounded-full px-2.5 py-1 bg-neutral-50 hover:bg-neutral-100"
                >
                  {e}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resultado && <Resultado r={resultado} />}
    </div>
  );
}

function Resultado({ r }: { r: Respuesta }) {
  return (
    <div className="tarjeta p-3 min-w-0">
      <p className="font-medium text-sm">{r.titulo}</p>
      <p className="text-xs text-neutral-600 mt-0.5">{r.resumen}</p>

      {r.filas.length > 0 && (
        <ul className="mt-2 divide-y text-sm">
          {r.filas.slice(0, 40).map((f, i) => (
            <li key={`${f.codAlum}-${i}`} className="py-1 flex items-baseline gap-2 min-w-0">
              <span className="shrink-0 text-xs text-neutral-500 w-10 tabular-nums">{f.courseCode}</span>
              <span className="min-w-0 truncate">{f.nombre}</span>
              {f.detalle && (
                <span className="hidden sm:inline text-xs text-neutral-500 truncate min-w-0">
                  {f.detalle}
                </span>
              )}
              <span className="ml-auto shrink-0 tabular-nums font-medium">{f.valor}</span>
            </li>
          ))}
        </ul>
      )}

      {r.filas.length > 40 && (
        <p className="text-[11px] text-neutral-500 mt-2">
          Se muestran 40 de {r.filas.length}. Acotá la pregunta a un curso para verlos todos.
        </p>
      )}
    </div>
  );
}
