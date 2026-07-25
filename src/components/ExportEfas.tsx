'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { exportEfas, type EfasReport } from '@/lib/efasExporter';
import { downloadBlob } from '@/lib/utils';

export function ExportEfas() {
  const courses = useLiveQuery(() => db.courses.toArray()) ?? [];
  const students = useLiveQuery(() => db.students.toArray()) ?? [];
  const trimestreDefault = courses[0]?.trimestre ?? 2;

  const [trimestre, setTrimestre] = useState<number>(trimestreDefault);
  const [busy, setBusy] = useState(false);
  const [lastReport, setLastReport] = useState<EfasReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const byCourse = groupBy(students, s => s.courseId);
      const { blob, report } = await exportEfas(courses, byCourse, trimestre);
      downloadBlob(blob, report.filename);
      setLastReport(report);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (courses.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Importa la Planilla primero para generar el EFAS.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-neutral-600">Trimestre</label>
        <select
          value={trimestre}
          onChange={e => setTrimestre(parseInt(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {[1, 2, 3].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          disabled={busy}
          onClick={generate}
          className="px-4 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
        >
          {busy ? 'Generando...' : `Generar EFAS T${trimestre}`}
        </button>
        <span className="text-xs text-neutral-500">
          {courses.length} cursos · {students.filter(s => !s.withdrawnAt).length} estudiantes activos
        </span>
      </div>

      {err && <p className="text-sm text-red-600">❌ {err}</p>}

      {lastReport && (
        <div className="border rounded-lg overflow-hidden text-sm">
          <div className="bg-neutral-50 px-3 py-2 border-b flex items-baseline justify-between">
            <span className="font-medium">✅ {lastReport.filename}</span>
            <span className="text-xs text-neutral-500">
              Total {lastReport.totals.activos} · {lastReport.totals.aprobandoPct}% aprob · {lastReport.totals.expertoPct}% ≥80
            </span>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="min-w-full text-xs">
              <thead className="bg-white sticky top-0">
                <tr className="border-b text-neutral-500">
                  <th className="p-1.5 text-left">Curso</th>
                  <th className="p-1.5 text-right">N</th>
                  <th className="p-1.5 text-right">% Aprob</th>
                  <th className="p-1.5 text-right">% ≥80</th>
                  <th className="p-1.5 text-right">DEF prom</th>
                </tr>
              </thead>
              <tbody>
                {lastReport.rows.map(r => (
                  <tr key={r.curso} className="border-b">
                    <td className="p-1.5 font-medium">{r.curso}</td>
                    <td className="p-1.5 text-right tabular-nums">{r.activos}</td>
                    <td className={`p-1.5 text-right tabular-nums ${pctTone(r.aprobandoPct)}`}>
                      {r.aprobandoPct}%
                    </td>
                    <td className="p-1.5 text-right tabular-nums">{r.expertoPct}%</td>
                    <td className="p-1.5 text-right tabular-nums">{r.promedio}</td>
                  </tr>
                ))}
                <tr className="bg-neutral-50 font-medium">
                  <td className="p-1.5">TOTAL</td>
                  <td className="p-1.5 text-right tabular-nums">{lastReport.totals.activos}</td>
                  <td className="p-1.5 text-right tabular-nums">{lastReport.totals.aprobandoPct}%</td>
                  <td className="p-1.5 text-right tabular-nums">{lastReport.totals.expertoPct}%</td>
                  <td className="p-1.5 text-right tabular-nums">{lastReport.totals.promedio}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function pctTone(p: number): string {
  if (p >= 90) return 'text-green-700';
  if (p >= 75) return 'text-neutral-800';
  if (p >= 60) return 'text-amber-700';
  return 'text-red-700';
}

function groupBy<T, K>(items: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    const arr = m.get(k);
    if (arr) arr.push(it); else m.set(k, [it]);
  }
  return m;
}
