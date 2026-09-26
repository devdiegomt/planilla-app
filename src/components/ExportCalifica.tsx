'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { exportCalifica } from '@/lib/exporter';
import {
  readPlatformCalifica, validateHeaderAgainstSlots, describeMismatches, parseAchievementDesc,
  type PlatformCalifica,
} from '@/lib/califica';
import { db, hydrateCodAlum, type CodAlumReport } from '@/lib/db';
import { downloadBlob } from '@/lib/utils';
import { subjectFor } from '@/lib/subjects';
import type { Course, Student, ExportReport, Achievement } from '@/types';

interface Props {
  course: Course;
  students: Student[];  // activos
  trimestre: number;
}

export function ExportCalifica({ course, students, trimestre }: Props) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ExportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [codigos, setCodigos] = useState<{ curso: string; r: CodAlumReport } | null>(null);

  // La materia del grado sale de Ajustes: la cabecera del Califica lleva su
  // nombre y su código, y antes venían de una constante fija.
  const yearCfg = useLiveQuery(
    () => db.yearConfig.where('year').equals(course.year).first(), [course.year],
  );

  // Trimestre de los encabezados guardados, para avisar antes de exportar.
  const primero = course.achievements?.[0]?.desc;
  const tEncabezados = primero ? parseAchievementDesc(primero)?.trimestre ?? null : null;
  const sinCodigo = students.filter(s => !s.codAlum).length;

  function limpiar() {
    setReport(null);
    setError(null);
    setAviso(null);
    setCodigos(null);
  }

  async function handleExport() {
    setBusy(true);
    limpiar();
    try {
      // El mapa del Califica-451 ya no es obligatorio: si los estudiantes tienen
      // `codAlum` en la fila, el exportador se apoya en eso. Solo se exige
      // cuando falta en ambos lados.
      const raw = localStorage.getItem('codAlumMap');
      const codAlumMap = new Map<string, string>(raw ? JSON.parse(raw) : []);
      if (!raw && sinCodigo > 0) {
        setError(
          `Faltan códigos de ${sinCodigo} estudiante(s). Carga aquí el Califica del curso ` +
          'descargado de la plataforma ("Cargar Califica de la plataforma").',
        );
        return;
      }

      const subject = subjectFor(yearCfg, course.grade);
      if (!subject?.materia.trim()) {
        setError(
          `Falta configurar la materia de ${course.grade}° en Ajustes: el Califica ` +
          'lleva el nombre de la asignatura y su código en la cabecera.',
        );
        return;
      }

      const { blob, report } = await exportCalifica({
        course, students, codAlumMap, trimestre, subject,
      });
      downloadBlob(blob, report.filename);
      setReport(report);

      // Los nombres de los logros solo existen en la plantilla. Guardarlos aquí
      // evita tener que abrirla de nuevo para que la grilla los muestre.
      if (course.id && report.achievements.length > 0) {
        const prev = JSON.stringify(course.achievements ?? []);
        if (prev !== JSON.stringify(report.achievements)) {
          await db.courses.update(course.id, { achievements: report.achievements });
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Un solo archivo, dos usos: el Califica que baja la plataforma trae el
   * COD_ALUM de cada estudiante del curso y los encabezados del trimestre.
   * Los códigos van a las filas del curso del archivo; los encabezados, a
   * todos los cursos del grado. Ambos viajan por el sync.
   */
  async function handleCalifica(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    limpiar();
    try {
      const p = readPlatformCalifica(await file.arrayBuffer());
      if (p.grade !== course.grade) {
        throw new Error(`El archivo es de ${p.grade}° (curso ${p.curso}) y este curso es de ${course.grade}°.`);
      }

      // Códigos primero: siguen sirviendo aunque el archivo sea de otro trimestre.
      const r = await hydrateCodAlum({
        generado: '',
        courses: [{ cod_cur: p.curso, cod_gru: String(p.grade), cod_mat: p.codMat, estudiantes: p.estudiantes }],
        warnings: [],
        totalStudents: p.estudiantes.length,
      });
      setCodigos({ curso: p.curso, r });

      await guardarEncabezados(p);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function guardarEncabezados(p: PlatformCalifica) {
    const ms = validateHeaderAgainstSlots(p, course.grade, yearCfg?.subjects);
    if (ms.length > 0) throw new Error(describeMismatches(ms, course.grade));
    const otroT = p.achievements.find(a => a.trimestre !== trimestre);
    if (p.periodo !== trimestre || otroT) {
      throw new Error(
        `Los encabezados del archivo son del T${otroT?.trimestre ?? p.periodo} y el curso está en ` +
        `T${trimestre}; no se guardaron. Descarga el Califica del trimestre actual.`,
      );
    }

    const achievements: Achievement[] = p.achievements.map(a => ({
      column: a.column, log: a.log, title: a.title, desc: a.desc,
    }));
    const mismos = await db.courses
      .where('grade').equals(course.grade)
      .filter(c => c.year === course.year)
      .toArray();
    await db.transaction('rw', db.courses, async () => {
      for (const c of mismos) {
        if (c.id) await db.courses.update(c.id, { achievements });
      }
    });
    setAviso(
      `Encabezados del T${trimestre} guardados en los cursos de ${course.grade}°: ` +
      mismos.map(c => c.code).sort().join(', ') + '.',
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleExport}
        disabled={busy}
        className="rounded-md boton-primario px-4 py-2 text-sm font-medium
                   whitespace-nowrap hover:bg-neutral-700 disabled:opacity-50"
      >
        {/* Sin el número del curso: está en el título, dos líneas más arriba,
            y era lo que volvía la etiqueta demasiado larga para un celular. */}
        {busy ? 'Procesando...' : 'Generar Califica'}
      </button>

      <div className="text-xs text-neutral-600">
        <label className={`cursor-pointer hover:underline ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          <input type="file" accept=".xls,.xlsx" className="hidden" onChange={handleCalifica} disabled={busy} />
          Cargar Califica de la plataforma (.xls)
        </label>
        {tEncabezados === trimestre && (
          <span className="ml-1 text-green-700">· encabezados T{trimestre} ✓</span>
        )}
        {tEncabezados !== null && tEncabezados !== trimestre && (
          <span className="ml-1 text-amber-700">· encabezados del T{tEncabezados}</span>
        )}
        {sinCodigo > 0 && (
          <span className="ml-1 text-amber-700">· {sinCodigo} sin código</span>
        )}
      </div>

      {codigos && <ResumenCodigos curso={codigos.curso} r={codigos.r} actual={course.code} />}

      {aviso && (
        <p className="text-sm text-green-800 bg-green-50 border border-green-300 rounded p-2 max-w-xl">
          ✅ {aviso}
        </p>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-300 rounded p-2 max-w-xl">
          <p className="font-medium mb-1">❌ No se completó</p>
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{error}</pre>
        </div>
      )}

      {report && (
        <div className="text-sm text-neutral-700">
          <p>✅ Generado: {report.filename} ({report.nEstudiantesEscritos} estudiantes)</p>
          {report.typoMatches.length > 0 && (
            <div className="text-amber-700 mt-1">
              <p className="font-medium">Typos corregidos automáticamente:</p>
              <ul className="list-disc list-inside">
                {report.typoMatches.map((t, i) => (
                  <li key={i}>{t.planilla} → {t.califica} (COD {t.cod})</li>
                ))}
              </ul>
            </div>
          )}
          {report.estudiantesSinCodAlum.length > 0 && (
            <div className="text-red-700 mt-1">
              <p className="font-medium">⚠️ Sin código (corrige antes de subir):</p>
              <ul className="list-disc list-inside">
                {report.estudiantesSinCodAlum.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResumenCodigos({ curso, r, actual }: { curso: string; r: CodAlumReport; actual: string }) {
  if (r.coursesNotInApp.length > 0) {
    return (
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded p-2 max-w-xl">
        El archivo es del curso {curso}, que no existe en la app; no se escribieron códigos.
      </p>
    );
  }
  const listas: { titulo: string; items: string[] }[] = [
    { titulo: 'En la plataforma pero no en la app (¿ingresos nuevos?)', items: r.notInApp.map(x => `${x.nombre} (${x.cod})`) },
    { titulo: 'En la app pero no en la plataforma (¿retirados?)', items: r.notInPlatform.map(x => x.nombre) },
    { titulo: 'Nombres escritos distinto', items: r.fuzzyMatched.map(x => `${x.app} ↔ ${x.platform}`) },
    { titulo: 'Códigos que cambiaron', items: r.changed.map(x => `${x.nombre}: ${x.from} → ${x.to}`) },
  ].filter(l => l.items.length > 0);

  return (
    <div className="text-sm bg-neutral-50 border rounded p-2 max-w-xl space-y-1">
      <p>
        ✅ Códigos de {curso}{curso !== actual && <span className="text-amber-700"> (no es este curso)</span>}:{' '}
        {r.hydrated} escritos · {r.alreadyCorrect} ya estaban
      </p>
      {listas.map(l => (
        <div key={l.titulo} className="text-xs text-amber-800">
          <p className="font-medium">{l.titulo} ({l.items.length})</p>
          <ul className="list-disc list-inside">
            {l.items.map((it, i) => <li key={i}>{it}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
