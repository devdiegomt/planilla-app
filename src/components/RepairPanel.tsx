'use client';

import { useState } from 'react';
import { importPlanilla } from '@/lib/importer';
import { normalizeName } from '@/lib/utils';
import { getSupabase } from '@/lib/supabase';
import { useSession } from './SessionProvider';
import { db, findDuplicateCourses, mergeDuplicateCourses, dedupeStudents, repairStudentCourses } from '@/lib/db';
import { resetSyncState, relinkOrphans } from '@/lib/sync';

interface Diagnosis {
  courses: { code: string; id: number; syncId: string; total: number; activos: number }[];
  duplicateCourses: number;
  duplicateStudents: number;
}

/**
 * Reparación de una base corrompida por el bug de FKs locales sincronizadas.
 *
 * El orden de los pasos no es negociable:
 *   1. diagnosticar
 *   2. reparar local (colapsar cursos → deduplicar estudiantes → reasignar)
 *   3. reconstruir el servidor desde la base local ya limpia
 *
 * Reparar local sin vaciar el servidor no sirve de nada: el siguiente pull
 * devuelve los registros fantasma, porque para el motor de sync son filas
 * legítimas que faltan localmente.
 */
export function RepairPanel() {
  const { user } = useSession();
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const say = (m: string) => setLog(l => [...l, m]);

  async function diagnose() {
    setBusy(true);
    setLog([]);
    try {
      const courses = await db.courses.toArray();
      const rows: Diagnosis['courses'] = [];
      for (const c of courses) {
        const all = await db.students.where('courseId').equals(c.id!).toArray();
        rows.push({
          code: c.code,
          id: c.id!,
          syncId: (c.syncId ?? '').slice(0, 8),
          total: all.length,
          activos: all.filter(s => !s.withdrawnAt).length,
        });
      }
      rows.sort((a, b) => a.code.localeCompare(b.code));

      const dups = await findDuplicateCourses();

      const students = await db.students.toArray();
      const seen = new Map<string, number>();
      let dupStudents = 0;
      for (const s of students) {
        const k = `${s.courseId}::${normalizeName(s.nombre)}`;
        const n = (seen.get(k) ?? 0) + 1;
        seen.set(k, n);
        if (n > 1) dupStudents++;
      }

      setDiag({
        courses: rows,
        duplicateCourses: dups.reduce((a, d) => a + d.ids.length - 1, 0),
        duplicateStudents: dupStudents,
      });
    } catch (e) {
      say(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function repairLocal(file: File) {
    setBusy(true);
    setLog([]);
    try {
      // La planilla se usa solo como fuente de verdad para saber a qué curso
      // pertenece cada nombre. No se escribe nada desde ella en este paso.
      say('Leyendo la planilla…');
      const { courses } = await importPlanilla(await file.arrayBuffer());
      const nameToCode = new Map<string, string>();
      for (const c of courses) {
        for (const s of c.students) nameToCode.set(normalizeName(s.nombre), c.code);
      }
      say(`Planilla: ${courses.length} cursos, ${nameToCode.size} estudiantes.`);

      const mergedCourses = await mergeDuplicateCourses();
      say(`Cursos duplicados colapsados: ${mergedCourses}`);

      const dd = await dedupeStudents();
      say(`Estudiantes duplicados eliminados: ${dd.removed} (${dd.merged} campos rescatados de las copias)`);

      const rep = await repairStudentCourses(nameToCode);
      say(`Estudiantes reasignados a su curso: ${rep.fixed}`);
      if (rep.unmatched.length) {
        say(`⚠️ Sin match en la planilla (${rep.unmatched.length}): ${rep.unmatched.slice(0, 5).join(', ')}${rep.unmatched.length > 5 ? '…' : ''}`);
      }

      const relinked = await relinkOrphans();
      if (relinked) say(`Filas huérfanas reenganchadas: ${relinked}`);

      say('✅ Base local reparada. Revisa el diagnóstico antes de continuar.');
      await diagnose();
    } catch (e) {
      say(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function rebuildServer() {
    if (!user) return;
    if (!confirm(
      'Esto borra TODOS tus registros en Supabase y los reconstruye desde esta base local. ' +
      'Si tienes datos en otro dispositivo que no estén aquí, se pierden. ¿Continuar?',
    )) return;

    setBusy(true);
    setLog([]);
    try {
      const { error } = await getSupabase()
        .from('sync_records').delete().eq('user_id', user.id);
      if (error) throw new Error(error.message);
      say('Servidor vaciado.');

      // Las lápidas pendientes apuntan a filas que ya no existen allá.
      await db.syncTombstones.clear();
      say('Lápidas pendientes descartadas.');

      resetSyncState(user.id);
      say('Cursor de sync reiniciado.');
      say('✅ Listo. Pulsa "Sincronizar ahora" en el indicador de arriba para subir todo.');
    } catch (e) {
      say(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); diagnose(); }}
        className="text-sm text-neutral-600 underline hover:text-neutral-900"
      >
        Abrir herramientas de reparación
      </button>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <button
          onClick={diagnose}
          disabled={busy}
          className="px-3 py-1.5 rounded border bg-white disabled:opacity-40"
        >
          {busy ? 'Trabajando…' : 'Rediagnosticar'}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-neutral-500 underline">
          cerrar
        </button>
      </div>

      {diag && (
        <div className="space-y-2">
          <div className="flex gap-4 text-xs">
            <span className={diag.duplicateCourses ? 'text-red-700 font-medium' : 'text-green-700'}>
              Cursos duplicados: {diag.duplicateCourses}
            </span>
            <span className={diag.duplicateStudents ? 'text-red-700 font-medium' : 'text-green-700'}>
              Estudiantes duplicados: {diag.duplicateStudents}
            </span>
          </div>
          <div className="max-h-64 overflow-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-neutral-100 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1">Curso</th>
                  <th className="text-left px-2 py-1">id local</th>
                  <th className="text-left px-2 py-1">syncId</th>
                  <th className="text-right px-2 py-1">activos</th>
                  <th className="text-right px-2 py-1">total</th>
                </tr>
              </thead>
              <tbody>
                {diag.courses.map((c, i) => (
                  <tr key={i} className={c.activos > 45 || c.activos === 0 ? 'bg-red-50' : ''}>
                    <td className="px-2 py-1 font-medium">{c.code}</td>
                    <td className="px-2 py-1 text-neutral-500">{c.id}</td>
                    <td className="px-2 py-1 font-mono text-neutral-400">{c.syncId}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{c.activos}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-neutral-500">{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-neutral-500">
            Filas en rojo: cursos con más de 45 activos o con 0. Códigos repetidos en la
            primera columna significan cursos duplicados.
          </p>
        </div>
      )}

      <div className="border-t pt-3 space-y-2">
        <p className="font-medium">Paso 1 · Reparar la base local</p>
        <p className="text-xs text-neutral-500">
          Sube la planilla del año. Se usa solo para saber a qué curso pertenece cada
          nombre; no sobrescribe notas. Colapsa cursos duplicados, une estudiantes
          repetidos rescatando las notas de ambas copias y reasigna cada uno a su curso.
        </p>
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={e => e.target.files?.[0] && repairLocal(e.target.files[0])}
          className="block w-full text-xs"
        />
      </div>

      <div className="border-t pt-3 space-y-2">
        <p className="font-medium">Paso 2 · Reconstruir el servidor</p>
        <p className="text-xs text-neutral-500">
          Borra todos tus registros en Supabase y reinicia el cursor de sync. La base
          local pasa a ser la fuente de verdad. Hazlo solo cuando el diagnóstico de
          arriba esté limpio.
        </p>
        <button
          onClick={rebuildServer}
          disabled={busy || !user}
          className="px-3 py-1.5 rounded bg-red-600 text-white text-xs disabled:opacity-40"
        >
          Vaciar servidor y reiniciar sync
        </button>
        {!user && <p className="text-xs text-neutral-500">Inicia sesión para usar este paso.</p>}
      </div>

      {log.length > 0 && (
        <div className="border-t pt-3 space-y-0.5 font-mono text-[11px] text-neutral-700">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}