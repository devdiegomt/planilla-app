'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, applyHistorialImport } from '@/lib/db';
import {
  parseHistorialJson, planHistorialImport, NOMBRE_PERIODO,
  type HistorialPlan,
} from '@/lib/historial';
import type { Student } from '@/types';

/**
 * Trae las definitivas de los trimestres anteriores.
 *
 * **Es una herramienta de relleno, no parte del flujo normal.** Cerrar el
 * trimestre en la app ya archiva la definitiva de cada estudiante
 * (`closeTrimester` → `trimesterSnapshots`), así que a quien la usa desde
 * marzo no le hace falta esto nunca. Existe para el caso contrario: el año ya
 * empezado, con trimestres que nunca se cerraron acá y cuya única fuente es la
 * plataforma.
 *
 * Se pega, no se sube un archivo: el extractor deja el texto en el portapapeles
 * y así funciona igual en el celular, sin descargar ni buscar en carpetas. El
 * selector de archivo queda de respaldo para cuando el portapapeles no está
 * disponible.
 *
 * **Revisar antes de guardar.** Primero se ve a quién va a tocar y a quién no;
 * recién después se guarda. Acá el emparejamiento es por código, así que el
 * riesgo de cruzar a dos estudiantes es bajo; lo que sí pasa y hay que ver
 * antes es que falte medio curso o que el archivo sea de otro año.
 */
export function ImportHistorial() {
  const year = new Date().getFullYear();
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const students = useLiveQuery<Student[]>(() => db.students.toArray(), []);

  const [texto, setTexto] = useState('');
  const [plan, setPlan] = useState<HistorialPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const listo = !!courses && !!students;

  function revisar(contenido: string) {
    setError(null);
    setGuardado(null);
    setPlan(null);
    if (!listo) return;
    try {
      const archivo = parseHistorialJson(contenido);
      setPlan(planHistorialImport(archivo, students!, courses!.map(c => c.code), year));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function guardar() {
    if (!plan) return;
    setBusy(true);
    try {
      setGuardado(await applyHistorialImport(plan));
      setPlan(null);
      setTexto('');
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
          Notas de los trimestres anteriores
        </label>
        <textarea
          value={texto}
          onChange={e => { setTexto(e.target.value); setPlan(null); setGuardado(null); }}
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
          Trae la definitiva de cada estudiante en los trimestres que ya pasaron.
          <strong className="font-medium"> Solo hace falta una vez</strong>, si
          empezaste a usar la app con el año ya empezado: a partir de ahí cada
          trimestre que cierres acá queda guardado solo.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">❌ {error}</p>}

      {guardado !== null && (
        <p className="text-sm text-green-700">
          ✔ Guardado para {guardado} estudiante{guardado === 1 ? '' : 's'}.
        </p>
      )}

      {plan && <Preview plan={plan} onGuardar={guardar} busy={busy} />}
    </div>
  );
}

function Preview({ plan, onGuardar, busy }: {
  plan: HistorialPlan; onGuardar: () => void; busy: boolean;
}) {
  const nada = plan.totales.estudiantes === 0;
  return (
    <div className="panel p-3 space-y-2 min-w-0">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Stat label="Estudiantes" value={plan.totales.estudiantes} tone={nada ? 'warn' : 'good'} />
        <Stat label="Trimestres" value={plan.totales.periodos} />
        <Stat label="Cursos" value={plan.cursos.filter(c => !c.faltaEnApp).length} />
      </div>

      {plan.generadoEn && (
        <p className="text-[11px] text-neutral-500">
          Extraído el {new Date(plan.generadoEn).toLocaleString('es-CO', {
            dateStyle: 'medium', timeStyle: 'short',
          })}
        </p>
      )}

      {nada && (
        <p className="text-sm text-amber-700">
          No hay nada nuevo que guardar. Puede que ya lo hayas traído antes, o que
          los códigos no coincidan con los de tus estudiantes.
        </p>
      )}

      {plan.advertencias.length > 0 && (
        <ul className="text-[12px] text-amber-800 space-y-1">
          {plan.advertencias.map((a, i) => <li key={i}>⚠ {a}</li>)}
        </ul>
      )}

      <details className="text-[12px]">
        <summary className="cursor-pointer text-neutral-600">Ver curso por curso</summary>
        <ul className="mt-1 space-y-1">
          {plan.cursos.map(c => (
            <li key={c.courseCode} className="flex flex-wrap items-baseline gap-2 min-w-0">
              <span className="font-medium shrink-0">{c.courseCode}</span>
              {c.faltaEnApp
                ? <span className="text-amber-700">no existe acá, se omite</span>
                : <>
                    <span className="text-neutral-600">{c.cambios.length} estudiante(s)</span>
                    {c.noEnApp.length > 0 &&
                      <span className="text-amber-700">· {c.noEnApp.length} sin fila acá</span>}
                    {c.noEnArchivo.length > 0 &&
                      <span className="text-neutral-500">· {c.noEnArchivo.length} sin datos</span>}
                  </>}
            </li>
          ))}
        </ul>
      </details>

      <button
        onClick={onGuardar}
        disabled={busy || nada}
        className="text-sm px-3 py-1.5 rounded-lg boton-primario disabled:opacity-50"
      >
        {busy ? 'Guardando…' : `Guardar para ${plan.totales.estudiantes} estudiante(s)`}
      </button>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-green-700' : tone === 'warn' ? 'text-amber-700' : 'text-neutral-700';
  return (
    <span className="whitespace-nowrap">
      <span className={`font-semibold ${color}`}>{value}</span>{' '}
      <span className="text-neutral-500">{label}</span>
    </span>
  );
}

export { NOMBRE_PERIODO };
