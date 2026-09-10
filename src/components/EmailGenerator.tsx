'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { CURSOS_ORDER } from '@/lib/constants';
import {
  buildEmailCandidates, renderEmail, vozSugerida, UMBRALES_POR_DEFECTO,
  PLANTILLA_POR_DEFECTO, ASUNTO_POR_DEFECTO,
  PLANTILLA_ESTUDIANTE, ASUNTO_ESTUDIANTE,
  type EmailThresholds, type EmailCandidate, type Voz,
} from '@/lib/emails';
import type { Student } from '@/types';

/*
 * Preferencias del docente. Van en localStorage y NO sincronizan: son ajustes
 * de redacción, no datos del colegio. Si más adelante hace falta tenerlos
 * iguales en el celular y el portátil, habría que subirlos a una tabla.
 */
const K_UMBRALES = 'emails:umbrales';
const K_PLANTILLA = 'emails:plantilla';
const K_ASUNTO = 'emails:asunto';
const K_DOCENTE = 'emails:docente';
const K_PLANTILLA_EST = 'emails:plantillaEstudiante';
const K_ASUNTO_EST = 'emails:asuntoEstudiante';

function leer<T>(clave: string, porDefecto: T): T {
  if (typeof window === 'undefined') return porDefecto;
  try {
    const v = localStorage.getItem(clave);
    return v == null ? porDefecto : (JSON.parse(v) as T);
  } catch { return porDefecto; }
}
function guardar(clave: string, valor: unknown) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* nada */ }
}

export function EmailGenerator() {
  const courses = useLiveQuery(() => db.courses.toArray(), []) ?? [];
  const logs = useLiveQuery(() => db.emailLog.toArray(), []) ?? [];

  const ordenados = useMemo(() => {
    const orden = new Map(CURSOS_ORDER.map((c, i) => [String(c), i]));
    return [...courses].sort((a, b) => (orden.get(a.code) ?? 999) - (orden.get(b.code) ?? 999));
  }, [courses]);

  const [code, setCode] = useState('');
  const course = ordenados.find(c => c.code === code) ?? ordenados[0];

  const students = useLiveQuery<Student[]>(
    () => (course?.id
      ? db.students.where('courseId').equals(course.id).toArray()
      : Promise.resolve<Student[]>([])),
    [course?.id],
  ) ?? [];

  const [umbrales, setUmbrales] = useState<EmailThresholds>(
    () => leer(K_UMBRALES, UMBRALES_POR_DEFECTO));
  const [docente, setDocente] = useState(() => leer(K_DOCENTE, ''));
  const [plantilla, setPlantilla] = useState(() => leer(K_PLANTILLA, PLANTILLA_POR_DEFECTO));
  const [asunto, setAsunto] = useState(() => leer(K_ASUNTO, ASUNTO_POR_DEFECTO));
  const [plantillaEst, setPlantillaEst] = useState(() => leer(K_PLANTILLA_EST, PLANTILLA_ESTUDIANTE));
  const [asuntoEst, setAsuntoEst] = useState(() => leer(K_ASUNTO_EST, ASUNTO_ESTUDIANTE));
  // Voz elegida a mano; sin entrada se usa la sugerida por los motivos.
  const [vozManual, setVozManual] = useState<Record<string, Voz>>({});
  const [verPlantilla, setVerPlantilla] = useState(false);
  const [verTodos, setVerTodos] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const candidatos = useMemo(
    () => (course ? buildEmailCandidates(course, students, umbrales, logs) : []),
    [course, students, umbrales, logs],
  );
  const visibles = verTodos ? candidatos : candidatos.filter(c => c.reincidio);

  const vozDe = (c: EmailCandidate): Voz => vozManual[c.studentSyncId] ?? vozSugerida(c);
  const renderizar = (c: EmailCandidate) => {
    const v = vozDe(c);
    return renderEmail(
      c, course!, docente,
      v === 'estudiante' ? plantillaEst : plantilla,
      v === 'estudiante' ? asuntoEst : asunto,
      v,
    );
  };

  const setUmbral = (k: keyof EmailThresholds, v: number) => {
    const next = { ...umbrales, [k]: Math.max(1, v || 1) };
    setUmbrales(next); guardar(K_UMBRALES, next);
  };

  async function copiar(c: EmailCandidate) {
    if (!course) return;
    const { asunto: a, cuerpo } = renderizar(c);
    await navigator.clipboard.writeText(`${a}\n\n${cuerpo}`);
    setCopiado(c.studentSyncId);
    setTimeout(() => setCopiado(null), 1500);
  }

  async function marcarEnviado(c: EmailCandidate) {
    if (!course) return;
    await db.emailLog.add({
      studentSyncId: c.studentSyncId,
      courseCode: course.code,
      year: course.year,
      trimestre: course.trimestre,
      nombre: c.nombre,
      notas30: c.notas30.length,
      retardos: c.retardos.length,
      fallas: c.fallas.length,
      at: new Date().toISOString(),
    });
  }

  if (ordenados.length === 0) {
    return <p className="text-sm text-neutral-500">Importa la planilla primero.</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-xs">
          <span className="block text-neutral-500 mb-0.5">Curso</span>
          <select
            value={course?.code ?? ''}
            onChange={e => setCode(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            {ordenados.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </label>
        {([
          ['notas30', 'Notas en 30'],
          ['retardos', 'Retardos'],
          ['fallas', 'Inasistencias'],
        ] as const).map(([k, label]) => (
          <label key={k} className="text-xs">
            <span className="block text-neutral-500 mb-0.5">{label} ≥</span>
            <input
              type="number" min={1} max={20} value={umbrales[k]}
              onChange={e => setUmbral(k, parseInt(e.target.value))}
              className="border rounded px-2 py-1 text-sm w-16"
            />
          </label>
        ))}
        <label className="text-xs flex-1 min-w-[180px]">
          <span className="block text-neutral-500 mb-0.5">Tu nombre (firma)</span>
          <input
            value={docente}
            onChange={e => { setDocente(e.target.value); guardar(K_DOCENTE, e.target.value); }}
            placeholder="Diego Mayorga"
            className="border rounded px-2 py-1 text-sm w-full"
          />
        </label>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className={visibles.length ? 'font-medium' : 'text-neutral-500'}>
          {visibles.length} estudiante{visibles.length === 1 ? '' : 's'} para escribir
        </span>
        {candidatos.length > visibles.length && (
          <label className="flex items-center gap-1 text-neutral-600">
            <input type="checkbox" checked={verTodos} onChange={e => setVerTodos(e.target.checked)} />
            ver también los {candidatos.length - visibles.length} que ya recibieron correo
          </label>
        )}
        <button
          onClick={() => setVerPlantilla(v => !v)}
          className="ml-auto text-neutral-600 underline"
        >
          {verPlantilla ? 'ocultar plantilla' : 'editar plantilla'}
        </button>
      </div>

      {verPlantilla && (
        <div className="border rounded p-2 space-y-2 bg-neutral-50">
          <label className="block text-xs">
            <span className="text-neutral-500">Asunto</span>
            <input
              value={asunto}
              onChange={e => { setAsunto(e.target.value); guardar(K_ASUNTO, e.target.value); }}
              className="border rounded px-2 py-1 text-sm w-full mt-0.5"
            />
          </label>
          <label className="block text-xs">
            <span className="text-neutral-500">
              Cuerpo · variables: {'{estudiante} {curso} {trimestre} {docente} {secciones}'}
            </span>
            <textarea
              value={plantilla}
              onChange={e => { setPlantilla(e.target.value); guardar(K_PLANTILLA, e.target.value); }}
              rows={10}
              className="border rounded p-2 text-xs w-full mt-0.5 font-mono"
            />
          </label>
          <p className="text-[11px] text-neutral-500">
            {'{secciones}'} lo arma la app según lo que aplique a cada estudiante.
            Estos ajustes se guardan solo en este dispositivo.
          </p>
          <div className="border-t pt-2 space-y-2">
            <p className="text-[11px] font-medium text-neutral-600">
              Plantilla dirigida al estudiante (tuteo)
            </p>
            <label className="block text-xs">
              <span className="text-neutral-500">Asunto</span>
              <input
                value={asuntoEst}
                onChange={e => { setAsuntoEst(e.target.value); guardar(K_ASUNTO_EST, e.target.value); }}
                className="border rounded px-2 py-1 text-sm w-full mt-0.5"
              />
            </label>
            <textarea
              value={plantillaEst}
              onChange={e => { setPlantillaEst(e.target.value); guardar(K_PLANTILLA_EST, e.target.value); }}
              rows={8}
              className="border rounded p-2 text-xs w-full font-mono"
            />
          </div>
          <button
            onClick={() => {
              setPlantilla(PLANTILLA_POR_DEFECTO); guardar(K_PLANTILLA, PLANTILLA_POR_DEFECTO);
              setAsunto(ASUNTO_POR_DEFECTO); guardar(K_ASUNTO, ASUNTO_POR_DEFECTO);
              setPlantillaEst(PLANTILLA_ESTUDIANTE); guardar(K_PLANTILLA_EST, PLANTILLA_ESTUDIANTE);
              setAsuntoEst(ASUNTO_ESTUDIANTE); guardar(K_ASUNTO_EST, ASUNTO_ESTUDIANTE);
            }}
            className="text-xs text-neutral-600 underline"
          >
            restaurar plantilla por defecto
          </button>
        </div>
      )}

      {visibles.length === 0 && (
        <p className="text-neutral-500 text-xs">
          Nadie supera los umbrales en {course?.code}
          {candidatos.length > 0 && ' que no haya recibido correo ya'}.
        </p>
      )}

      <div className="space-y-3">
        {visibles.map(c => {
          const { cuerpo } = course ? renderizar(c) : { cuerpo: '' };
          const voz = vozDe(c);
          return (
            <div key={c.studentSyncId} className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-neutral-50 border-b flex items-center gap-2 flex-wrap">
                <span className="font-medium">{c.nombre}</span>
                {c.email && <span className="text-xs text-neutral-500">{c.email}</span>}
                <span className="text-[11px] flex gap-1">
                  {c.notas30.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                      {c.notas30.length} × 30
                    </span>
                  )}
                  {c.retardos.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      {c.retardos.length} retardos
                    </span>
                  )}
                  {c.fallas.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700">
                      {c.fallas.length} faltas
                    </span>
                  )}
                </span>
                {c.previo && (
                  <span className="text-[11px] text-neutral-500">
                    último correo:{' '}
                    {new Date(c.previo.at).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
                  </span>
                )}
                <div className="ml-auto flex gap-2 items-center">
                  <select
                    value={voz}
                    onChange={e => setVozManual(m => ({ ...m, [c.studentSyncId]: e.target.value as Voz }))}
                    title="A quién va dirigido el texto"
                    className="border rounded px-1.5 py-1 text-xs bg-white"
                  >
                    <option value="estudiante">Al estudiante (tú)</option>
                    <option value="acudiente">Al acudiente (usted)</option>
                  </select>
                  <button
                    onClick={() => copiar(c)}
                    className="px-2 py-1 rounded bg-neutral-900 text-white text-xs"
                  >
                    {copiado === c.studentSyncId ? '✓ Copiado' : 'Copiar'}
                  </button>
                  <button
                    onClick={() => marcarEnviado(c)}
                    className="px-2 py-1 rounded border text-xs bg-white hover:bg-neutral-50"
                    title="No volverá a listarse hasta que acumule más"
                  >
                    Marcar enviado
                  </button>
                </div>
              </div>
              <pre className="p-3 text-xs whitespace-pre-wrap font-sans text-neutral-700 max-h-56 overflow-auto">
                {cuerpo}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
