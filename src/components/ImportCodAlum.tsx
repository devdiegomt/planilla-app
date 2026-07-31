'use client';

import { useState } from 'react';
import { parseCodAlumJson, type ParseWarning } from '@/lib/codalum';
import { hydrateCodAlum, type CodAlumReport } from '@/lib/db';

/**
 * Importa el JSON que baja `codalum-extractor` (planilla-v2) y escribe el
 * COD_ALUM sobre las filas de estudiantes.
 *
 * El reporte es el producto principal: además de hidratar, cruza el roster de
 * la app contra el de Classroom Live y saca a la luz los ingresos nuevos y los
 * retiros que todavía no se reflejan localmente.
 */
export function ImportCodAlum() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CodAlumReport | null>(null);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [generado, setGenerado] = useState<string>('');

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    setWarnings([]);
    try {
      const parsed = parseCodAlumJson(await file.text());
      setGenerado(parsed.generado);
      setWarnings(parsed.warnings);
      setReport(await hydrateCodAlum(parsed));
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
          Códigos de Classroom Live (JSON de codalum-extractor)
        </label>
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="block w-full text-sm"
        />
        <p className="text-[11px] text-neutral-500 mt-1">
          Escribe el COD_ALUM en cada estudiante. A diferencia del consolidado
          Califica, el código queda en la fila y se sincroniza entre dispositivos.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">❌ {error}</p>}

      {report && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Stat label="Hidratados" value={report.hydrated} tone="good" />
            <Stat label="Ya correctos" value={report.alreadyCorrect} />
            <Stat label="Cursos" value={report.coursesMatched} />
            {report.fuzzyMatched.length > 0 && (
              <Stat label="Por typo" value={report.fuzzyMatched.length} tone="warn" />
            )}
            {report.notInApp.length > 0 && (
              <Stat label="Nuevos en plataforma" value={report.notInApp.length} tone="warn" />
            )}
            {report.notInPlatform.length > 0 && (
              <Stat label="No están en plataforma" value={report.notInPlatform.length} tone="warn" />
            )}
          </div>
          {generado && (
            <p className="text-[11px] text-neutral-500">
              Extraído el {new Date(generado).toLocaleString('es-CO', {
                dateStyle: 'medium', timeStyle: 'short',
              })}
            </p>
          )}

          <Detail
            title="Ingresos nuevos — están en Classroom Live pero no en la app"
            hint="Reimporta la Planilla para traerlos, o agrégalos a mano."
            tone="warn"
            items={report.notInApp.map(x => `${x.course} · ${x.nombre} (${x.cod})`)}
          />
          <Detail
            title="Sin contraparte en Classroom Live"
            hint="Probables retiros: verifica y márcalos como retirados."
            tone="warn"
            items={report.notInPlatform.map(x => `${x.course} · ${x.nombre}`)}
          />
          <Detail
            title="Nombres que difieren (match por typo)"
            hint="La app y la plataforma escriben distinto el mismo nombre."
            items={report.fuzzyMatched.map(x => `${x.course} · "${x.app}" ↔ "${x.platform}"`)}
          />
          <Detail
            title="Códigos que cambiaron"
            hint="La fila ya tenía otro código; se sobrescribió."
            tone="warn"
            items={report.changed.map(x => `${x.course} · ${x.nombre}: ${x.from} → ${x.to}`)}
          />
          <Detail
            title="Cursos del JSON que la app no tiene"
            items={report.coursesNotInApp}
          />
          <Detail
            title="Advertencias del archivo"
            items={warnings.map(w => `${w.course}: ${w.message}`)}
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  label, value, tone,
}: { label: string; value: number; tone?: 'good' | 'warn' }) {
  const cls = tone === 'good' ? 'text-green-700'
            : tone === 'warn' ? 'text-amber-700'
            : 'text-neutral-800';
  return (
    <span className="text-xs">
      <span className="text-neutral-500">{label}: </span>
      <span className={`font-semibold tabular-nums ${cls}`}>{value}</span>
    </span>
  );
}

function Detail({
  title, hint, items, tone,
}: {
  title: string;
  hint?: string;
  items: string[];
  tone?: 'warn';
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className={`border rounded p-2 ${tone === 'warn' ? 'border-amber-300 bg-amber-50' : 'bg-neutral-50'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left text-xs font-medium flex justify-between items-baseline gap-2"
      >
        <span>{title} ({items.length})</span>
        <span className="text-neutral-400 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {hint && <p className="text-[11px] text-neutral-500 mt-0.5">{hint}</p>}
      {open && (
        <ul className="mt-1.5 space-y-0.5 text-[11px] font-mono text-neutral-700 max-h-48 overflow-auto">
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
    </div>
  );
}
