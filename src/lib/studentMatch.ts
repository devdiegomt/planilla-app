import { normalizeName } from './utils';
import { studentSyncId, studentSyncIdByCode } from './syncId';
import type { Student } from '@/types';

/**
 * A quién de la base corresponde cada estudiante del archivo.
 *
 * Vive aparte de `db.ts` y sin tocar Dexie porque es la lógica más delicada de
 * la app: equivocarse acá retira a un estudiante con sus notas y crea otro en
 * blanco al lado. Siendo pura se puede ejercer sin navegador.
 *
 * La regla: manda el COD_ALUM, y el nombre es el respaldo. El código lo asigna
 * el colegio y no cambia; el nombre sí — de hecho `hydrateCodAlum` tiene un
 * emparejamiento aproximado justamente porque los nombres difieren entre la
 * app y la plataforma.
 */

/**
 * Clave estable de un nombre dentro de un curso.
 *
 * Dos estudiantes con el mismo nombre producirían la misma clave y chocarían
 * contra el índice único; el sufijo #n los separa de forma reproducible,
 * porque el orden del archivo es estable.
 */
export function dedupKey(nombre: string, seen: Map<string, number>): string {
  const base = normalizeName(nombre);
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
}

/** Lo que trae el archivo de cada estudiante. */
export type StudentIn = Omit<Student, 'id' | 'courseId' | 'courseCode'>;

export interface MergePlan {
  /** Filas que ya existen: se refresca solo lo que el archivo sabe. */
  updates: {
    id: number;
    patch: Partial<Student>;
    /** true si se reconoció por código pese a que el nombre cambió. */
    porCodigo: boolean;
  }[];
  /** Filas nuevas, con la clave de sincronización que les toca. */
  adds: { student: StudentIn; syncId: string }[];
  /** Ya no están en el archivo: retiro suave, nunca borrado. */
  withdraws: number[];
}

export function planStudentMerge(
  prev: Student[],
  incoming: StudentIn[],
  year: number,
  courseCode: string,
): MergePlan {
  const plan: MergePlan = { updates: [], adds: [], withdraws: [] };

  const prevSeen = new Map<string, number>();
  const pending = new Map<string, Student>();
  const porCodigo = new Map<string, string>();
  for (const s of [...prev].sort((a, b) => a.order - b.order)) {
    const k = dedupKey(s.nombre, prevSeen);
    pending.set(k, s);
    if (s.codAlum) porCodigo.set(s.codAlum, k);
  }

  const seen = new Map<string, number>();
  for (const s of incoming) {
    // Se llama siempre, aunque después se empareje por código: es lo que
    // mantiene consistente la numeración de homónimos.
    const key = dedupKey(s.nombre, seen);

    const claveCod = s.codAlum ? porCodigo.get(s.codAlum) : undefined;
    const clave = claveCod ?? (pending.has(key) ? key : undefined);
    const hit = clave ? pending.get(clave) : undefined;

    if (hit) {
      const patch: Partial<Student> = {
        order: s.order,
        courseCode,
        withdrawnAt: null,
      };
      // Emparejado por código y el nombre cambió: la plataforma es la buena.
      if (claveCod && s.nombre && s.nombre !== hit.nombre) patch.nombre = s.nombre;
      // La fila venía sin código: se escribe de una.
      if (s.codAlum && !hit.codAlum) patch.codAlum = s.codAlum;

      plan.updates.push({ id: hit.id!, patch, porCodigo: !!claveCod });
      pending.delete(clave!);
      if (hit.codAlum) porCodigo.delete(hit.codAlum);
    } else {
      plan.adds.push({
        student: s,
        // Con código, la clave es el código: dos dispositivos que importen el
        // mismo archivo llegan al mismo UUID aunque el nombre se corrija.
        syncId: s.codAlum
          ? studentSyncIdByCode(year, courseCode, s.codAlum)
          : studentSyncId(year, courseCode, key),
      });
    }
  }

  for (const sobrante of pending.values()) {
    if (!sobrante.withdrawnAt) plan.withdraws.push(sobrante.id!);
  }
  return plan;
}
