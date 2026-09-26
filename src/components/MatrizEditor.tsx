'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, applyActividades, getYearConfig } from '@/lib/db';
import { parseActividades, type CursoLeido } from '@/lib/actividades';
import { slotsOf } from '@/lib/subjects';
import {
  filasDeCurso, validarMatriz, slotsDeFilas, cambiosDeGrado, descripcionDe,
  totalCambios, jsonParaPlataforma, comparaConLaApp,
  DESTINOS, CICLOS, COLUMNAS,
  type FilaMatriz, type PlanMatriz, type ContraLaApp,
} from '@/lib/matriz';

/**
 * Llenar la matriz de actividades desde la app.
 *
 * En la plataforma se edita fila por fila, con "Editar" y "Actualizar" en cada
 * una: unas diez por curso, diecinueve cursos. Acá se edita de una y sale un
 * plan que el script de planilla-v2 aplica allá.
 *
 * **Hay que traer primero la matriz de la plataforma.** No es un capricho: la
 * fila de allá lleva adentro unos identificadores que la app no puede inventar,
 * y el plan solo puede cambiar filas que ya existen. Traerla también es lo que
 * permite mandar lo que había antes de cada fila, para que el script verifique
 * que está escribiendo donde cree.
 */
type PorGrado = { grado: number; cursos: string[]; originales: FilaMatriz[]; filas: FilaMatriz[] };

export function MatrizEditor() {
  const year = new Date().getFullYear();
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const cfg = useLiveQuery(() => getYearConfig(year), [year]);

  const [texto, setTexto] = useState('');
  const [grados, setGrados] = useState<PorGrado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [busy, setBusy] = useState(false);

  const trimestre = courses?.[0]?.trimestre ?? 1;

  function traer(contenido: string) {
    setError(null); setAviso(null); setCopiado(false);
    try {
      const archivo = parseActividades(contenido);
      const porGrado = new Map<number, CursoLeido[]>();
      for (const c of archivo.cursos) {
        const g = Number(c.grado);
        if (g) porGrado.set(g, [...(porGrado.get(g) ?? []), c]);
      }
      const lista: PorGrado[] = [];
      for (const [grado, cursos] of [...porGrado.entries()].sort((a, b) => a[0] - b[0])) {
        const originales = filasDeCurso(cursos[0]);
        if (!originales.length) continue;
        lista.push({
          grado,
          // Los cursos de ese grado que el docente tiene en la app: son los que
          // el script va a recorrer, no solo el que se leyó.
          cursos: (courses ?? []).filter(c => c.grade === grado).map(c => c.code).sort(),
          originales,
          filas: originales.map(f => ({ ...f })),
        });
      }
      if (!lista.length) throw new Error('El archivo no trae ninguna matriz que se pueda leer.');
      setGrados(lista);
    } catch (e) {
      setGrados(null);
      setError((e as Error).message);
    }
  }

  function editar(grado: number, i: number, patch: Partial<FilaMatriz>) {
    setCopiado(false);
    setGrados(gs => gs?.map(g => g.grado !== grado ? g : {
      ...g, filas: g.filas.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    }) ?? null);
  }

  const problemas = useMemo(() => {
    const out: { grado: number; lista: string[] }[] = [];
    for (const g of grados ?? []) {
      const lista = validarMatriz(g.filas);
      if (lista.length) out.push({ grado: g.grado, lista });
    }
    return out;
  }, [grados]);

  const plan: PlanMatriz | null = useMemo(() => {
    if (!grados) return null;
    return {
      generadoEn: new Date().toISOString(),
      trimestre,
      grados: grados.map(g => ({
        grado: g.grado,
        cursos: g.cursos,
        cambios: cambiosDeGrado(g.originales, g.filas, trimestre),
      })).filter(g => g.cambios.length > 0),
    };
  }, [grados, trimestre]);

  const nCambios = plan ? totalCambios(plan) : 0;
  const sano = problemas.length === 0;

  async function guardarEnLaApp() {
    if (!grados || !sano) return;
    setBusy(true); setError(null);
    try {
      const n = await applyActividades(year, grados.map(g => ({
        grade: g.grado, slots: slotsDeFilas(g.filas),
      })));
      setAviso(`Guardado para ${n} grado${n === 1 ? '' : 's'}. Las notas ya se calculan con estos porcentajes.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copiar() {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(jsonParaPlataforma(plan));
      setCopiado(true);
    } catch {
      setError('No se pudo copiar. Selecciona el texto de abajo y cópialo a mano.');
    }
  }

  return (
    <div className="space-y-6">
      <section className="border rounded-lg p-4 bg-neutral-50 space-y-2">
        <h2 className="font-medium">1. Trae la matriz de la plataforma</h2>
        <p className="text-[12px] text-neutral-600">
          Se necesita una vez por trimestre. La app no puede llenar una matriz que
          no ha visto: cada fila de la plataforma tiene lo suyo, y solo se pueden
          cambiar filas que ya existen.
        </p>
        <textarea
          value={texto}
          onChange={e => { setTexto(e.target.value); setGrados(null); }}
          placeholder="Pega acá el texto que copiaste en la plataforma…"
          rows={3}
          className="w-full text-xs font-mono border rounded-lg p-2"
        />
        <button
          onClick={() => traer(texto)}
          disabled={!texto.trim() || !courses}
          className="text-sm px-3 py-1.5 rounded-lg border bg-white disabled:opacity-50"
        >
          Traer
        </button>
        {error && <p className="text-sm text-red-600">❌ {error}</p>}
      </section>

      {grados?.map(g => (
        <TablaGrado
          key={g.grado}
          g={g}
          trimestre={trimestre}
          contraLaApp={comparaConLaApp(g.filas, slotsOf(cfg, g.grado))}
          problemas={problemas.find(p => p.grado === g.grado)?.lista ?? []}
          onEditar={(i, patch) => editar(g.grado, i, patch)}
        />
      ))}

      {grados && (
        <section className="border rounded-lg p-4 bg-neutral-50 space-y-3">
          <h2 className="font-medium">3. Guarda y manda</h2>

          {!sano && (
            <p className="text-sm text-red-700">
              Arregla lo de arriba antes de mandar nada a la plataforma.
            </p>
          )}
          {aviso && <p className="text-sm text-green-700">✔ {aviso}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={guardarEnLaApp}
              disabled={busy || !sano}
              className="text-sm px-3 py-1.5 rounded-lg border bg-white disabled:opacity-50"
            >
              {busy ? 'Guardando…' : 'Guardar en la app'}
            </button>
            <button
              onClick={copiar}
              disabled={!sano || nCambios === 0}
              className="text-sm px-3 py-1.5 rounded-lg bg-neutral-900 text-white disabled:opacity-50"
            >
              {copiado
                ? '✔ Copiado'
                : `Copiar para la plataforma (${nCambios} fila${nCambios === 1 ? '' : 's'})`}
            </button>
          </div>

          <p className="text-[12px] text-neutral-600">
            {nCambios === 0
              ? 'Todavía no cambiaste nada, así que no hay nada que mandar.'
              : 'Pega el texto copiado en el panel del ayudante, en la pantalla de la ' +
                'matriz. Te muestra fila por fila qué va a cambiar antes de tocar nada.'}
          </p>

          {plan && nCambios > 0 && (
            <details className="text-[12px]">
              <summary className="cursor-pointer text-neutral-600">
                Ver qué va a cambiar
              </summary>
              <ul className="mt-2 space-y-1">
                {plan.grados.map(g => (
                  <li key={g.grado}>
                    <span className="font-medium">{g.grado}°</span>
                    <span className="text-neutral-500"> · {g.cursos.join(', ') || 'sin cursos acá'}</span>
                    <ul className="ml-4 mt-1 space-y-0.5">
                      {g.cambios.map((c, i) => (
                        <li key={i} className="min-w-0 break-words">
                          {c.meta} · fila {c.posicion} — cambia el {c.campos.join(', el ')}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {cfg && !cfg.subjects?.length && (
        <p className="text-[12px] text-amber-800">
          ⚠ Todavía no configuraste tus materias en Ajustes. Guardar acá igual funciona,
          pero conviene ponerles nombre.
        </p>
      )}
    </div>
  );
}

const CONTRA_APP: Record<ContraLaApp, { texto: string; clase: string }> = {
  igual: { texto: 'Coincide con lo que la app usa para calificar', clase: 'text-green-700' },
  pesos: { texto: 'Los porcentajes no son los que la app está usando', clase: 'text-amber-700' },
  estructura: {
    texto: 'Cambia a qué nota va cada actividad; la app todavía usa otra repartición',
    clase: 'text-amber-800',
  },
};

function TablaGrado({ g, trimestre, contraLaApp, problemas, onEditar }: {
  g: PorGrado;
  trimestre: number;
  contraLaApp: ContraLaApp;
  problemas: string[];
  onEditar: (i: number, patch: Partial<FilaMatriz>) => void;
}) {
  const sumas = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of g.filas) m.set(f.cat, (m.get(f.cat) ?? 0) + (f.porcentaje || 0));
    return m;
  }, [g.filas]);

  return (
    <section className="border rounded-lg p-4 bg-neutral-50 space-y-3 min-w-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-medium">2. {g.grado}°</h2>
        <span className="text-[12px] text-neutral-500">
          {g.cursos.length ? g.cursos.join(', ') : 'ningún curso de este grado en la app'}
        </span>
      </div>

      {/*
        * Cómo va contra lo que la app usa para calificar. Antes esto era una
        * pantalla aparte en Configuración que solo comparaba; acá se ve
        * mientras se edita, que es cuando sirve.
        */}
      <p className={`text-[12px] ${CONTRA_APP[contraLaApp].clase}`}>
        {contraLaApp === 'igual' ? '✔' : '⚠'} {CONTRA_APP[contraLaApp].texto}
        {contraLaApp !== 'igual' && ' — "Guardar en la app" lo pone al día.'}
      </p>

      {problemas.length > 0 && (
        <ul className="text-[12px] text-red-700 space-y-0.5">
          {problemas.map((p, i) => <li key={i}>⚠ {p}</li>)}
        </ul>
      )}

      <div className="overflow-x-auto">
        <table className="text-[12px] w-full min-w-[640px]">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1 pr-2">Categoría</th>
              <th className="py-1 pr-2">Columna</th>
              <th className="py-1 pr-2">Título</th>
              <th className="py-1 pr-2 w-16">%</th>
              <th className="py-1 pr-2 w-20">Ciclo</th>
              <th className="py-1 w-28">Para</th>
            </tr>
          </thead>
          <tbody>
            {g.filas.map((f, i) => {
              const primera = i === 0 || g.filas[i - 1].cat !== f.cat;
              const suma = sumas.get(f.cat) ?? 0;
              return (
                <tr key={`${f.meta}|${f.posicion}`} className={primera ? 'border-t' : ''}>
                  <td className="py-1 pr-2 align-middle whitespace-nowrap">
                    {primera && (
                      <span className={suma === 100 ? 'text-neutral-700' : 'text-red-700'}>
                        {f.cat} <span className="text-neutral-400">{suma}%</span>
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      value={f.columna}
                      onChange={e => onEditar(i, { columna: e.target.value })}
                      className="border rounded px-1 py-0.5 bg-white"
                      aria-label={`Columna de ${f.meta} fila ${f.posicion}`}
                    >
                      <option value="">—</option>
                      {COLUMNAS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={f.titulo}
                      onChange={e => onEditar(i, { titulo: e.target.value })}
                      placeholder={f.vacia ? 'sin estrenar' : ''}
                      className="border rounded px-1 py-0.5 w-full bg-white"
                      aria-label={`Título de ${f.meta} fila ${f.posicion}`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    {/*
                      * type="text" y no "number", por lo mismo que la casilla de
                      * nota: con number, las flechas y la rueda del mouse cambian
                      * el valor al pasar por encima.
                      */}
                    <input
                      type="text"
                      inputMode="numeric"
                      value={String(f.porcentaje)}
                      onChange={e => {
                        const v = e.target.value.replace(/[^\d]/g, '');
                        onEditar(i, { porcentaje: v === '' ? 0 : parseInt(v) });
                      }}
                      className="border rounded px-1 py-0.5 w-full text-right bg-white"
                      aria-label={`Porcentaje de ${f.meta} fila ${f.posicion}`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      value={f.ciclo}
                      onChange={e => onEditar(i, { ciclo: e.target.value })}
                      className="border rounded px-1 py-0.5 bg-white"
                      aria-label={`Ciclo de ${f.meta} fila ${f.posicion}`}
                    >
                      <option value="">—</option>
                      {CICLOS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="py-1">
                    <select
                      value={f.destino}
                      onChange={e => onEditar(i, { destino: e.target.value })}
                      className="border rounded px-1 py-0.5 bg-white"
                      aria-label={`Destino de ${f.meta} fila ${f.posicion}`}
                    >
                      <option value="">—</option>
                      {DESTINOS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-neutral-500">
        Así queda el título en la plataforma:{' '}
        <span className="font-mono">
          {descripcionDe(g.filas[0], trimestre) || '(sin estrenar)'}
        </span>
      </p>
    </section>
  );
}
