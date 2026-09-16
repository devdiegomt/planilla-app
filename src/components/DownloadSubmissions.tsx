'use client';

import { useRef, useState } from 'react';
import { downloadBlob } from '@/lib/utils';
import { planZipEntregas, resumenCsv, type EntregaParaZip } from '@/lib/submissionsZip';
import { nombreSeguro } from '@/lib/driveExport';

/**
 * Descarga las entregas en un ZIP con una carpeta por estudiante.
 *
 * Reemplaza lo que hacía classroom-rpa en otra página: bajar todos los trabajos
 * de una vez y revisarlos uno por uno al descomprimir. Ver y abrir una entrega
 * suelta sigue estando en la lista de abajo; esto se suma, no la reemplaza.
 *
 * El ZIP se arma acá y no en el servidor porque un curso completo son decenas
 * de archivos y una función de Vercel se corta al minuto. Además así se ve el
 * avance y se puede cancelar.
 */

export interface TrabajoParaBajar {
  /** Título del trabajo. En el ZIP de un curso es la subcarpeta. */
  titulo: string;
  entregas: EntregaParaZip[];
  maxPoints?: number;
}

interface Props {
  /** Nombre del archivo ZIP, sin extensión. */
  nombreBase: string;
  /**
   * Trae los trabajos a bajar. Es una función y no un arreglo para que sirva
   * igual al trabajo que ya está en pantalla y al curso entero, cuyas entregas
   * hay que ir a buscar una tarea a la vez.
   */
  cargar: () => Promise<TrabajoParaBajar[]>;
  /** Con varios trabajos, cada uno va como subcarpeta del estudiante. */
  agruparPorTrabajo: boolean;
  etiqueta: string;
}

type Avance = { hechos: number; total: number; actual: string };

export function DownloadSubmissions({ nombreBase, cargar, agruparPorTrabajo, etiqueta }: Props) {
  const [busy, setBusy] = useState(false);
  const [avance, setAvance] = useState<Avance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const cancelar = useRef(false);

  async function descargar() {
    setBusy(true);
    setError(null);
    setAviso(null);
    cancelar.current = false;
    try {
      setAvance({ hechos: 0, total: 0, actual: 'buscando las entregas…' });
      const trabajos = await cargar();
      if (cancelar.current) throw new Error('cancelado');

      const total = trabajos.reduce(
        (n, t) => n + planZipEntregas(t.entregas).entradas.length, 0,
      );
      if (total === 0) {
        setAviso('No hay archivos para bajar: nadie entregó todavía, o lo entregado son enlaces.');
        return;
      }

      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const fallidos: string[] = [];
      let hechos = 0;

      for (const t of trabajos) {
        const plan = planZipEntregas(t.entregas, agruparPorTrabajo ? t.titulo : undefined);

        // El resumen dice quién no entregó, que mirando carpetas no se ve:
        // quien no entregó no tiene carpeta.
        const nombreResumen = agruparPorTrabajo
          ? `_resumen - ${nombreSeguro(t.titulo, 'trabajo')}.csv`
          : '_resumen.csv';
        zip.file(nombreResumen, resumenCsv(t.entregas, t.maxPoints));

        for (const entrada of plan.entradas) {
          if (cancelar.current) throw new Error('cancelado');
          setAvance({ hechos, total, actual: entrada.titulo });
          try {
            const r = await fetch(`/api/classroom/drive/${encodeURIComponent(entrada.fileId)}`);
            if (!r.ok) {
              // Un trabajo que no se deja bajar no puede tumbar la descarga
              // entera: se anota y se sigue con el siguiente.
              fallidos.push(`${entrada.ruta} (${r.status})`);
              continue;
            }
            zip.file(entrada.ruta, await r.blob());
          } catch {
            if (cancelar.current) throw new Error('cancelado');
            fallidos.push(entrada.ruta);
          }
          hechos++;
        }
      }

      if (fallidos.length > 0) {
        zip.file('_no-se-pudieron-bajar.txt', fallidos.join('\n') + '\n');
        setAviso(`${fallidos.length} archivo(s) no se pudieron bajar; están listados dentro del ZIP.`);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `${nombreSeguro(nombreBase, 'entregas')}.zip`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg === 'cancelado' ? 'Descarga cancelada.' : msg);
    } finally {
      setBusy(false);
      setAvance(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={descargar}
          disabled={busy}
          className="px-3 py-1.5 rounded-md border text-sm hover:bg-neutral-50 disabled:opacity-40"
        >
          {busy ? 'Bajando…' : `⬇ ${etiqueta}`}
        </button>
        {busy && (
          <button
            onClick={() => { cancelar.current = true; }}
            className="px-2 py-1 rounded-md border text-xs hover:bg-neutral-50"
          >
            Cancelar
          </button>
        )}
      </div>

      {avance && (
        <p className="text-xs text-neutral-600 truncate">
          {avance.total > 0 ? `${avance.hechos} de ${avance.total} · ` : ''}{avance.actual}
        </p>
      )}
      {aviso && <p className="text-xs text-amber-700">⚠ {aviso}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
