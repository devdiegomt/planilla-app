'use client';

import { useState } from 'react';
import { updateColumnValue } from '@/lib/db';
import { FormModal } from './FormModal';
import type { PastePlan } from '@/lib/pasteNotas';

/**
 * Lo que se va a escribir antes de escribirlo.
 *
 * Existe por una sola razón: pegar una columna de números empareja por
 * posición, y si el Excel está ordenado distinto cada nota cae en otro
 * estudiante sin que nada se vea raro. Mostrar nombre y nota lado a lado
 * convierte ese error invisible en uno que se ve antes de guardar.
 */

const COMO: Record<PastePlan['match'], { texto: string; cls: string }> = {
  codigo: {
    texto: 'Emparejado por el código de cada estudiante',
    cls: 'bg-green-100 text-green-800',
  },
  nombre: {
    texto: 'Emparejado por nombre',
    cls: 'bg-green-100 text-green-800',
  },
  posicion: {
    texto: 'Emparejado por posición en la lista',
    cls: 'bg-amber-100 text-amber-900',
  },
};

export function PasteNotasPreview({
  plan, onClose,
}: {
  plan: PastePlan;
  onClose: () => void;
}) {
  const [aplicando, setAplicando] = useState(false);
  const como = COMO[plan.match];

  const aplicar = async () => {
    setAplicando(true);
    try {
      for (const fila of plan.rows) {
        for (const c of fila.cells) {
          if (c.from === c.to) continue;
          await updateColumnValue(fila.studentId, c.slotKeys, c.to);
        }
      }
      onClose();
    } finally {
      setAplicando(false);
    }
  };

  return (
    <FormModal label="Revisar las notas pegadas" onClose={onClose}>
      <h2 className="font-medium">Revisa antes de aplicar</h2>

      <div className={`text-xs px-2 py-1.5 rounded ${como.cls}`}>{como.texto}</div>

      {plan.warnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200
                               rounded px-2 py-1.5">
          ⚠ {w}
        </p>
      ))}

      {plan.rows.length > 0 && (
        <div className="border rounded-md max-h-[40vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 sticky top-0">
              <tr className="text-left">
                <th className="px-2 py-1 font-medium">Estudiante</th>
                {plan.columns.map(c => (
                  <th key={c} className="px-2 py-1 font-medium text-center">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.rows.map(fila => [
                <tr key={fila.studentId} className="border-t">
                  <td className="px-2 py-1 truncate max-w-[10rem]" title={fila.studentName}>
                    {fila.studentName}
                  </td>
                  {plan.columns.map(col => {
                    const c = fila.cells.find(x => x.column === col);
                    if (!c) return <td key={col} className="px-2 py-1 text-center text-neutral-300">—</td>;
                    const cambia = c.from !== c.to;
                    return (
                      <td key={col} className="px-2 py-1 text-center tabular-nums">
                        {cambia ? (
                          <>
                            <span className="text-neutral-400 line-through">{c.from || '–'}</span>
                            <span className="mx-1 text-neutral-400">→</span>
                            <span className="font-medium text-neutral-900">{c.to}</span>
                          </>
                        ) : (
                          <span className="text-neutral-400">{c.to}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>,
                /* En su propia fila y no como una celda más: como celda le
                   corría las columnas solo a los que traían un problema. */
                fila.issues.length > 0 ? (
                  <tr key={`${fila.studentId}-issues`}>
                    <td colSpan={plan.columns.length + 1}
                        className="px-2 pb-1 text-[11px] text-red-700">
                      {fila.issues.join(' · ')}
                    </td>
                  </tr>
                ) : null,
              ])}
            </tbody>
          </table>
        </div>
      )}

      {plan.unmatched.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-neutral-600">
            {plan.unmatched.length} fila{plan.unmatched.length === 1 ? '' : 's'} sin ubicar
          </summary>
          <ul className="mt-1 space-y-0.5 text-neutral-500 max-h-24 overflow-y-auto">
            {plan.unmatched.map((u, i) => <li key={i} className="truncate">{u}</li>)}
          </ul>
        </details>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={aplicar}
          disabled={plan.changes === 0 || aplicando}
          className="px-3 py-1.5 rounded-md boton-primario text-sm disabled:opacity-40"
        >
          {aplicando
            ? 'Aplicando…'
            : plan.changes === 0
              ? 'Nada que cambiar'
              : `Aplicar ${plan.changes} nota${plan.changes === 1 ? '' : 's'}`}
        </button>
        <button onClick={onClose} disabled={aplicando}
                className="px-3 py-1.5 rounded-md border text-sm">
          Cancelar
        </button>
      </div>
    </FormModal>
  );
}
