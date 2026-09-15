'use client';

import { useState } from 'react';
import {
  readPlatformWorkbook, validateHeaderAgainstSlots, type PlatformWorkbook,
} from '@/lib/califica';
import { fillPlatformWorkbook, writeWorkbookXls, type CourseFillReport } from '@/lib/califica451';
import { db, getCourseByCode, hydrateCodAlum, type CodAlumReport } from '@/lib/db';
import { downloadBlob } from '@/lib/utils';
import type { Achievement, Course, Student } from '@/types';

interface Resultado {
  filename: string;
  codigos: CodAlumReport;
  encabezados: string[];
  avisos: string[];
  cursos: CourseFillReport[];
  errores: PlatformWorkbook['errores'];
}

/**
 * Un clic para el Califica de todos los cursos: lee el archivo que baja la
 * plataforma, escribe los códigos, guarda los encabezados de cada grado y
 * devuelve el mismo archivo con las notas de la app.
 */
export function ImportCalifica451() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    setRes(null);
    try {
      const libro = readPlatformWorkbook(await file.arrayBuffer());
      const { wb, sheets } = libro;
      if (sheets.length === 0) {
        throw new Error('El archivo no trae ninguna hoja de Califica. ¿Es el que baja "planillas por profesor"?');
      }

      // 1) Códigos en las filas de cada curso.
      const codigos = await hydrateCodAlum({
        generado: '',
        courses: sheets.map(s => ({
          cod_cur: s.data.curso, cod_gru: String(s.data.grade),
          cod_mat: s.data.codMat, estudiantes: s.data.estudiantes,
        })),
        warnings: [],
        totalStudents: sheets.reduce((n, s) => n + s.data.estudiantes.length, 0),
      });

      const courses = new Map<string, Course>();
      for (const s of sheets) {
        const c = await getCourseByCode(s.data.curso);
        if (c) courses.set(c.code, c);
      }

      // 2) Encabezados del trimestre, uno por grado.
      const encabezados: string[] = [];
      const avisos: string[] = [];
      const grados = [...new Set(sheets.map(s => s.data.grade))].sort((a, b) => a - b);
      for (const g of grados) {
        const hoja = sheets.find(s => s.data.grade === g && courses.has(s.data.curso));
        const ref = hoja && courses.get(hoja.data.curso);
        if (!hoja || !ref) continue;
        const p = hoja.data;
        if (validateHeaderAgainstSlots(p, g).length > 0) {
          avisos.push(`${g}°: los encabezados no coinciden con el mapeo de logros; no se guardaron.`);
          continue;
        }
        if (p.periodo !== ref.trimestre || p.achievements.some(a => a.trimestre !== ref.trimestre)) {
          avisos.push(`${g}°: el archivo es del T${p.periodo} y los cursos están en T${ref.trimestre}; no se guardaron.`);
          continue;
        }
        const achievements: Achievement[] = p.achievements.map(a => ({
          column: a.column, log: a.log, title: a.title, desc: a.desc,
        }));
        const mismos = await db.courses.where('grade').equals(g).filter(c => c.year === ref.year).toArray();
        await db.transaction('rw', db.courses, async () => {
          for (const c of mismos) if (c.id) await db.courses.update(c.id, { achievements });
        });
        encabezados.push(`${g}°`);
      }

      // 3) Notas: se leen los estudiantes después de escribir los códigos.
      const activos = new Map<string, Student[]>();
      for (const c of courses.values()) {
        if (!c.id) continue;
        const ss = await db.students.where('courseId').equals(c.id).toArray();
        activos.set(c.code, ss.filter(s => !s.withdrawnAt));
      }
      const cursos = fillPlatformWorkbook(wb, sheets, courses, activos)
        .sort((a, b) => parseInt(a.curso) - parseInt(b.curso));

      const out = writeWorkbookXls(wb);
      downloadBlob(new Blob([out], { type: 'application/vnd.ms-excel' }), file.name);
      setRes({ filename: file.name, codigos, encabezados, avisos, cursos, errores: libro.errores });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const total = res?.cursos.reduce((n, c) => n + c.escritas, 0) ?? 0;
  const llenos = res?.cursos.filter(c => !c.omitido).length ?? 0;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1">
          Califica de todos los cursos (archivo de la plataforma)
        </label>
        <input
          type="file"
          accept=".xls,.xlsx"
          disabled={busy}
          onChange={handleFile}
          className="block w-full text-sm"
        />
        <p className="text-[11px] text-neutral-500 mt-1">
          Descárgalo en la plataforma: Importar/exportar planillas por profesor → Exportar.
          La app escribe los códigos, guarda los encabezados del trimestre y descarga el
          mismo archivo con tus notas, listo para importar. Si la app tiene 0 y la
          plataforma ya tiene nota, se conserva la de la plataforma.
        </p>
      </div>

      {busy && <p className="text-sm text-neutral-600">Procesando…</p>}
      {error && <p className="text-sm text-red-600 whitespace-pre-wrap">❌ {error}</p>}

      {res && (
        <div className="space-y-2 text-sm">
          <p>
            ✅ Descargado <span className="font-mono">{res.filename}</span>: {total} notas escritas
            en {llenos} de {res.cursos.length} cursos.
          </p>
          <p className="text-xs text-neutral-600">
            Códigos: {res.codigos.hydrated} escritos · {res.codigos.alreadyCorrect} ya estaban
            {res.encabezados.length > 0 && <> · Encabezados guardados: {res.encabezados.join(', ')}</>}
          </p>
          {[...res.avisos, ...res.errores.map(e => `${e.name}: ${e.message}`)].map((a, i) => (
            <p key={i} className="text-xs text-amber-800">⚠️ {a}</p>
          ))}

          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="pr-3 py-1">Curso</th>
                  <th className="pr-3 py-1">Escritas</th>
                  <th className="pr-3 py-1">Conservadas</th>
                  <th className="pr-3 py-1">Solo plataforma</th>
                  <th className="pr-3 py-1">Solo app</th>
                  <th className="py-1">Estado</th>
                </tr>
              </thead>
              <tbody>
                {res.cursos.map(c => (
                  <tr key={c.hoja} className="border-t align-top">
                    <td className="pr-3 py-1 font-medium">{c.curso}</td>
                    <td className="pr-3 py-1 tabular-nums">{c.escritas}</td>
                    <td className="pr-3 py-1"><Lista items={c.conservadas.map(x => `${x.nombre} · ${x.log}: ${x.plataforma}`)} /></td>
                    <td className="pr-3 py-1"><Lista items={c.soloPlataforma} /></td>
                    <td className="pr-3 py-1"><Lista items={c.soloApp} /></td>
                    <td className="py-1">
                      {c.omitido
                        ? <span className="text-amber-800 whitespace-pre-wrap">Sin tocar: {c.omitido}</span>
                        : <span className="text-green-700">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Lista({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-neutral-400">0</span>;
  return (
    <details>
      <summary className="cursor-pointer text-amber-800 tabular-nums">{items.length}</summary>
      <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-neutral-700">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </details>
  );
}
