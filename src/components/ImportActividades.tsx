'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, applyActividades, getYearConfig } from '@/lib/db';
import { slotsOf } from '@/lib/subjects';
import {
  parseActividades, planActividades, describirSlot, gradosQueCambian,
  type PlanActividades, type ComparacionGrado,
} from '@/lib/actividades';
import type { Student } from '@/types';

/**
 * Trae de la plataforma cuánto pesa cada actividad.
 *
 * Los porcentajes con los que la app calcula la definitiva venían fijos en el
 * código: son los de informática de 8° a 11°, y corridos contra la plataforma
 * el 24/09/2026 resultaron exactos. Esto no viene a corregirlos, viene a que
 * dejen de ser una suposición: otra materia puede repartir distinto, y hasta
 * ahora la app lo habría calculado mal sin decir nada.
 *
 * **Se revisa antes de guardar.** Cambiar un porcentaje es inofensivo; cambiar
 * la columna a la que va una actividad deja notas ya escritas sin dónde caer,
 * así que eso se cuenta aparte y se muestra antes.
 */
export function ImportActividades() {
  const year = new Date().getFullYear();
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const students = useLiveQuery<Student[]>(() => db.students.toArray(), []);
  const cfg = useLiveQuery(() => getYearConfig(year), [year]);

  const [texto, setTexto] = useState('');
  const [plan, setPlan] = useState<PlanActividades | null>(null);
  const [marcados, setMarcados] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const listo = !!courses && !!students;

  function limpiar() {
    setPlan(null);
    setGuardado(null);
    setMarcados([]);
  }

  function revisar(contenido: string) {
    setError(null);
    limpiar();
    if (!listo) return;
    try {
      const archivo = parseActividades(contenido);
      const conAlumnos = courses!.map(course => ({
        course,
        students: students!.filter(s => s.courseId === course.id),
      }));
      const p = planActividades(archivo, conAlumnos, g => slotsOf(cfg, g));
      setPlan(p);
      // Vienen marcados los cambios de porcentaje, que no ponen nada en riesgo.
      // Los de estructura se marcan a mano: ahí hay notas que pueden perderse.
      setMarcados(p.grados.filter(g => g.estado === 'pesos').map(g => g.grade));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function guardar() {
    if (!plan) return;
    setBusy(true);
    try {
      const cambios = plan.grados
        .filter(g => marcados.includes(g.grade))
        .map(g => ({ grade: g.grade, slots: g.leidos }));
      setGuardado(await applyActividades(year, cambios));
      setPlan(null);
      setTexto('');
      setMarcados([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">
          Cuánto pesa cada actividad
        </label>
        <textarea
          value={texto}
          onChange={e => { setTexto(e.target.value); limpiar(); }}
          placeholder="Pega acá el texto que copiaste en la plataforma…"
          rows={3}
          className="w-full text-xs font-mono border rounded-lg p-2"
        />
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <button
            onClick={() => revisar(texto)}
            disabled={!texto.trim() || !listo}
            className="text-sm px-3 py-1.5 rounded-lg border bg-neutral-50 disabled:opacity-50"
          >
            Revisar
          </button>
          <span className="text-[11px] text-neutral-500">o</span>
          <input
            type="file"
            accept=".json,application/json"
            className="text-[11px]"
            onChange={async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              const t = await f.text();
              setTexto(t);
              revisar(t);
            }}
          />
        </div>
        <p className="text-[11px] text-neutral-500 mt-1">
          Trae de la matriz de actividades cuánto vale cada nota dentro de su
          categoría. <strong className="font-medium">Solo hace falta una vez
          por año</strong>, o cuando el colegio cambie el reparto.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">❌ {error}</p>}

      {guardado !== null && (
        <p className="text-sm text-green-700">
          ✔ Guardado para {guardado} grado{guardado === 1 ? '' : 's'}.
        </p>
      )}

      {plan && (
        <Preview
          plan={plan}
          marcados={marcados}
          onMarcar={g => setMarcados(m =>
            m.includes(g) ? m.filter(x => x !== g) : [...m, g])}
          onGuardar={guardar}
          busy={busy}
        />
      )}
    </div>
  );
}

function Preview({ plan, marcados, onMarcar, onGuardar, busy }: {
  plan: PlanActividades;
  marcados: number[];
  onMarcar: (grade: number) => void;
  onGuardar: () => void;
  busy: boolean;
}) {
  const cambian = gradosQueCambian(plan);
  const iguales = plan.grados.filter(g => g.estado === 'igual');

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-neutral-50 min-w-0">
      {plan.generadoEn && (
        <p className="text-[11px] text-neutral-500">
          Sacado de la plataforma el {new Date(plan.generadoEn).toLocaleString('es-CO', {
            dateStyle: 'medium', timeStyle: 'short',
          })}
        </p>
      )}

      {iguales.length > 0 && cambian.length === 0 && (
        <p className="text-sm text-green-700">
          ✔ Todo coincide con lo que la app ya está usando
          ({iguales.map(g => `${g.grade}°`).join(', ')}). No hay nada que cambiar.
        </p>
      )}

      {plan.grados.map(g => (
        <Grado
          key={g.grade}
          g={g}
          marcado={marcados.includes(g.grade)}
          onMarcar={() => onMarcar(g.grade)}
        />
      ))}

      {plan.errores.length > 0 && (
        <ul className="text-[12px] text-amber-800 space-y-1">
          {plan.errores.map((e, i) => (
            <li key={i}>⚠ {e.curso}: {e.motivo}</li>
          ))}
        </ul>
      )}

      {cambian.length > 0 && (
        <button
          onClick={onGuardar}
          disabled={busy || marcados.length === 0}
          className="text-sm px-3 py-1.5 rounded-lg bg-neutral-900 text-white disabled:opacity-50"
        >
          {busy
            ? 'Guardando…'
            : `Guardar ${marcados.length} grado${marcados.length === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}

const TONO: Record<ComparacionGrado['estado'], string> = {
  igual: 'text-green-700',
  pesos: 'text-amber-700',
  estructura: 'text-red-700',
  ilegible: 'text-red-700',
};

const RESUMEN: Record<ComparacionGrado['estado'], string> = {
  igual: 'coincide con lo que usa la app',
  pesos: 'los porcentajes cambiaron',
  estructura: 'cambió a qué nota va cada actividad',
  ilegible: 'no se pudo leer',
};

function Grado({ g, marcado, onMarcar }: {
  g: ComparacionGrado; marcado: boolean; onMarcar: () => void;
}) {
  const elegible = g.estado === 'pesos' || g.estado === 'estructura';
  return (
    <div className="text-[12px] space-y-1 min-w-0">
      <div className="flex flex-wrap items-baseline gap-2 min-w-0">
        {elegible && (
          <input
            type="checkbox"
            checked={marcado}
            onChange={onMarcar}
            className="shrink-0"
            aria-label={`Usar los porcentajes de ${g.grade}°`}
          />
        )}
        <span className="font-medium shrink-0">{g.grade}°</span>
        <span className={TONO[g.estado]}>{RESUMEN[g.estado]}</span>
        <span className="text-neutral-500">· {g.cursos.join(', ')}</span>
      </div>

      {g.estado === 'estructura' && (
        <p className="text-red-700">
          {g.notasEnRiesgo > 0
            ? `⚠ ${g.notasEnRiesgo} nota(s) ya escritas se quedarían sin casilla. ` +
              'Anótalas antes de aplicar esto.'
            : 'No hay notas escritas que se pierdan, pero revisa la lista antes de aplicar.'}
        </p>
      )}

      {g.problemas.map((p, i) => (
        <p key={i} className="text-amber-800">⚠ {p}</p>
      ))}

      {g.estado !== 'igual' && g.leidos.length > 0 && (
        <details>
          <summary className="cursor-pointer text-neutral-600">
            Ver el reparto
          </summary>
          <div className="mt-1 space-y-1 font-mono text-[11px]">
            <p className="break-words">
              <span className="text-neutral-500">plataforma: </span>
              {g.leidos.map(describirSlot).join('  ')}
            </p>
            <p className="break-words">
              <span className="text-neutral-500">la app:     </span>
              {g.actuales.map(describirSlot).join('  ')}
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
