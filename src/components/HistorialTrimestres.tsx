'use client';

import { useMemo } from 'react';
import { resumenDe, type ResumenEstudiante } from '@/lib/historial';
import type { Course, Student } from '@/types';
import { NOTA_APROBACION } from '@/lib/constants';

/**
 * En cuánto lleva la materia cada estudiante.
 *
 * Es lo que la plataforma NO muestra en ningún lado: ahí las notas están de a
 * un curso y un periodo por vez. Lo que aporta esta tabla no son los datos, es
 * verlos juntos.
 *
 * El trimestre en curso sale de la app —es el que se está calificando— y los
 * anteriores, de lo que se trajo de la plataforma. La columna dice de dónde
 * viene cada uno para que no haya que adivinarlo.
 */
export function HistorialTrimestres({ course, students }: {
  course: Course; students: Student[];
}) {
  const filas = useMemo(
    () => students.map(s => ({ s, r: resumenDe(s, course) })),
    [students, course],
  );

  const conHistorial = filas.some(f =>
    f.r.periodos.some(p => p.origen === 'plataforma' && p.valor != null));

  if (!conHistorial) {
    return (
      <p className="text-sm text-neutral-500">
        Todavía no traés las notas de los trimestres anteriores. Se cargan desde
        el inicio, en &ldquo;Notas de los trimestres anteriores&rdquo;.
      </p>
    );
  }

  const etiquetas = filas[0]?.r.periodos.map(p => p.etiqueta) ?? [];
  const hayFinal = filas.some(f => f.r.finalPlataforma != null);

  return (
    <div className="overflow-x-auto">
      <table className="text-sm min-w-full">
        <thead>
          <tr className="text-neutral-500 text-left">
            <th className="font-medium py-1 pr-3">Estudiante</th>
            {etiquetas.map(e => (
              <th key={e} className="font-medium py-1 px-2 text-center tabular-nums">{e}</th>
            ))}
            <th className="font-medium py-1 px-2 text-center">Va en</th>
            {hayFinal && <th className="font-medium py-1 px-2 text-center">Final</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map(({ s, r }) => (
            <tr key={s.id} className="border-t">
              <td className="py-1 pr-3 min-w-0 max-w-[16rem] truncate">{s.nombre}</td>
              {r.periodos.map(p => (
                <td key={p.periodo} className="py-1 px-2 text-center tabular-nums">
                  <Nota valor={p.valor} enCurso={p.origen === 'app'} />
                </td>
              ))}
              <td className="py-1 px-2 text-center tabular-nums font-semibold">
                <Nota valor={r.acumulado} />
              </td>
              {hayFinal && (
                <td className="py-1 px-2 text-center tabular-nums">
                  <Nota valor={r.finalPlataforma} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-neutral-500 mt-2">
        &ldquo;Va en&rdquo; es el promedio de los trimestres que ya tienen nota, para
        saber cómo viene cada uno. No es la definitiva del año: esa la calcula el
        colegio{hayFinal ? ' y es la de la columna Final' : ''}.
        {' '}El trimestre <span className="underline decoration-dotted">subrayado</span> es
        el que estás calificando ahora.
      </p>
    </div>
  );
}

function Nota({ valor, enCurso }: { valor: number | null; enCurso?: boolean }) {
  if (valor == null) return <span className="text-neutral-300">—</span>;
  const tono = valor >= NOTA_APROBACION ? 'text-neutral-800' : 'text-red-600 font-medium';
  return (
    <span className={`${tono}${enCurso ? ' underline decoration-dotted' : ''}`}>{valor}</span>
  );
}

export type { ResumenEstudiante };
