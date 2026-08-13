'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db, previewCloseTrimester, closeTrimester,
  ULTIMO_TRIMESTRE, type ClosePreview, type CloseReport,
} from '@/lib/db';

/**
 * Cierra el trimestre de TODOS los cursos de una vez.
 *
 * Es global y no por curso porque el colegio cambia de trimestre para los 19 a
 * la vez; hacerlo curso por curso serían 19 pasadas y la garantía de que alguno
 * quede a medias.
 *
 * La confirmación es por escrito y no un `confirm()`: la planilla queda en
 * blanco y conviene que el gesto cueste un poco.
 */
export function CloseTrimester() {
  const [preview, setPreview] = useState<ClosePreview | null>(null);
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CloseReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const archivados = useLiveQuery(() => db.trimesterSnapshots.count(), []) ?? 0;
  const esUltimo = preview ? preview.trimestre >= ULTIMO_TRIMESTRE : false;
  const confirmado = texto.trim().toUpperCase() === 'CERRAR';

  async function verAlcance() {
    setError(null); setReport(null); setTexto('');
    try { setPreview(await previewCloseTrimester()); }
    catch (e) { setError((e as Error).message); }
  }

  async function ejecutar() {
    if (!confirmado) return;
    setBusy(true); setError(null);
    try {
      setReport(await closeTrimester());
      setPreview(null); setTexto('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-neutral-600">
        Archiva las notas, los ciclos y las observaciones de todos los cursos, y
        deja la planilla en blanco para el trimestre siguiente. No toca
        estudiantes, códigos, horario ni calendario.
      </p>

      {archivados > 0 && (
        <p className="text-xs text-neutral-500">
          Ya hay {archivados} registro{archivados === 1 ? '' : 's'} archivado
          {archivados === 1 ? '' : 's'} de trimestres anteriores.
        </p>
      )}

      {!preview && !report && (
        <button
          onClick={verAlcance}
          className="px-3 py-1.5 rounded-md border bg-white text-sm hover:bg-neutral-50"
        >
          Ver qué se cerraría
        </button>
      )}

      {error && (
        <div className="text-red-700 bg-red-50 border border-red-300 rounded p-2 text-xs">
          ❌ {error}
        </div>
      )}

      {preview && (
        <div className="border border-amber-300 bg-amber-50 rounded p-3 space-y-2">
          <p className="font-medium text-amber-900">
            Vas a cerrar el trimestre {preview.trimestre}
            {!esUltimo && ` y arrancar el ${preview.trimestre + 1}`}
          </p>

          {esUltimo ? (
            <p className="text-xs text-amber-900">
              El {ULTIMO_TRIMESTRE} es el último del año: no hay siguiente al que pasar.
              Para el año nuevo, importa la planilla correspondiente.
            </p>
          ) : (
            <>
              <ul className="text-xs text-amber-900 list-disc list-inside space-y-0.5">
                <li>{preview.cursos.length} cursos · {preview.totalActivos} estudiantes activos</li>
                <li>
                  <strong>{preview.totalConDatos}</strong> se archivan (los que tienen
                  notas, ciclos u observaciones)
                </li>
                <li>La planilla queda en blanco y las marcas de asistencia se borran</li>
              </ul>

              {preview.trimestresMezclados.length > 0 && (
                <p className="text-xs text-red-700">
                  ⚠ Hay cursos en el trimestre {preview.trimestresMezclados.join(', ')}.
                  Todos pasarán al {preview.trimestre + 1}. Revisa antes de seguir.
                </p>
              )}
              {preview.totalConDatos === 0 && (
                <p className="text-xs text-red-700">
                  ⚠ No hay nada que archivar: ningún estudiante tiene notas. ¿Seguro
                  que es el trimestre correcto?
                </p>
              )}

              <details className="text-xs">
                <summary className="cursor-pointer text-amber-900">Ver por curso</summary>
                <div className="mt-1 max-h-40 overflow-auto">
                  {preview.cursos.map(c => (
                    <div key={c.code} className="flex justify-between px-1 py-0.5">
                      <span>{c.code}</span>
                      <span className="tabular-nums text-amber-900">
                        {c.conNotas}/{c.activos} con notas
                      </span>
                    </div>
                  ))}
                </div>
              </details>

              <p className="text-xs text-amber-900">
                Antes de seguir, baja un respaldo en <strong>Backup local</strong> —
                el archivo queda en la app, pero un respaldo aparte no sobra.
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-amber-900">
                  Escribe <strong>CERRAR</strong> para confirmar:
                </label>
                <input
                  value={texto}
                  onChange={e => setTexto(e.target.value)}
                  className="border rounded px-2 py-1 text-sm w-28"
                  placeholder="CERRAR"
                />
                <button
                  onClick={ejecutar}
                  disabled={!confirmado || busy}
                  className="px-3 py-1.5 rounded-md bg-red-700 text-white text-sm disabled:opacity-40"
                >
                  {busy ? 'Cerrando…' : `Cerrar trimestre ${preview.trimestre}`}
                </button>
                <button
                  onClick={() => { setPreview(null); setTexto(''); }}
                  className="text-xs text-neutral-600 underline"
                >
                  cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {report && (
        <div className="border border-green-300 bg-green-50 rounded p-3 text-xs space-y-1">
          <p className="font-medium text-green-900">
            ✅ Trimestre {report.trimestreCerrado} cerrado. Ahora estás en el{' '}
            {report.trimestreNuevo}.
          </p>
          <p className="text-green-900">
            {report.estudiantesArchivados} estudiantes archivados ·{' '}
            {report.cursosActualizados} cursos · {report.marcasBorradas} marcas de
            asistencia borradas.
          </p>
          <p className="text-green-900">
            Falta configurar el inicio del trimestre en <strong>/calendario</strong>:
            la fecha y forzar D1 ese día.
          </p>
        </div>
      )}
    </div>
  );
}
