/**
 * Motor de sincronización Dexie ↔ Supabase.
 *
 * Modelo: una tabla `sync_records` en Supabase con (user_id, table_name, sync_id, data JSONB, updated_at).
 * Cada registro Dexie se serializa a un record; sync_id + updatedAt viven en la
 * fila Dexie (via hooks). Last-write-wins por updated_at.
 *
 * REGLA CENTRAL: un id autoincremental de Dexie (`id`, `courseId`, `studentId`)
 * solo significa algo dentro de la base que lo generó. NUNCA sale de este
 * archivo hacia el servidor. Las relaciones viajan como claves estables
 * (`courseCode`, `studentSyncId`) y el `courseId` local se reconstruye en cada
 * pull contra la base de destino.
 *
 * Limitaciones conocidas:
 * - Sin resolución de conflictos manual: si dos dispositivos editan la misma
 *   fila, gana el updatedAt más reciente y solo se cuenta en report.conflicts.
 * - El reloj es del cliente. Con dos dispositivos muy desfasados, el LWW puede
 *   dar un resultado contraintuitivo.
 */

import { db, withoutTombstone, getCourseIdByCodeMap } from './db';
import { getSupabase } from './supabase';

/**
 * Tablas syncables. `courses` DEBE ir primero: las tablas hijas necesitan el
 * mapa code → id local ya poblado para reconstruir su courseId.
 */
export const SYNCABLE_TABLES = [
  'courses',
  'students', 'todos', 'events', 'schedule',
  'calendarDays', 'yearConfig', 'attendanceMarks', 'changeLog',
] as const;

export type SyncableTable = typeof SYNCABLE_TABLES[number];

/** Tablas cuyo `courseId` hay que reconstruir desde `courseCode`. */
const COURSE_CHILDREN = new Set<string>(['students', 'attendanceMarks', 'changeLog']);

/**
 * Marcador para una fila hija cuyo curso todavía no existe localmente.
 * Se reengancha en `relinkOrphans()` al final del pull, o en el pull siguiente.
 * No se usa 0 ni null porque son valores que el índice trataría como legítimos.
 */
export const ORPHAN_COURSE_ID = -1;

/** Tamaño de página del select. Supabase corta en 1000 filas por defecto. */
const PAGE_SIZE = 500;

interface SyncRow {
  id?: number;
  syncId?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

interface RemoteRecord {
  sync_id: string;
  data: Record<string, unknown>;
  updated_at: string | null;
  deleted_at: string | null;
}

/** Key en localStorage para el timestamp del último pull exitoso por usuario. */
function lastPullKey(userId: string) {
  return `sync:lastPull:${userId}`;
}
function lastPushKey(userId: string) {
  return `sync:lastPush:${userId}`;
}

/** ---- Push ---- */

export interface PushReport {
  ok: boolean;
  perTable: Record<string, { pushed: number; errors: number }>;
  totalPushed: number;
  totalErrors: number;
  tombstonesPushed: number;
  errorMessages: string[];
  at: string;
}

/** Sube a Supabase todo lo que se modificó desde el último push. */
export async function pushAll(userId: string): Promise<PushReport> {
  const supabase = getSupabase();
  const lastPushed = localStorage.getItem(lastPushKey(userId)) ?? '1970-01-01T00:00:00Z';
  const report: PushReport = {
    ok: true, perTable: {}, totalPushed: 0, totalErrors: 0,
    tombstonesPushed: 0, errorMessages: [], at: new Date().toISOString(),
  };

  for (const table of SYNCABLE_TABLES) {
    const rows = await db.table(table)
      .filter((r: SyncRow) => (r.updatedAt ?? '') > lastPushed)
      .toArray() as SyncRow[];

    const payload = rows
      .filter(r => r.syncId)
      .map(r => ({
        user_id: userId,
        table_name: table,
        sync_id: r.syncId!,
        data: stripLocalMeta(r),
        updated_at: r.updatedAt ?? report.at,
      }));

    if (payload.length === 0) {
      report.perTable[table] = { pushed: 0, errors: 0 };
      continue;
    }

    // Upsert en batches de 100 (Supabase acepta más pero es prudente)
    let pushed = 0, errors = 0;
    for (let i = 0; i < payload.length; i += 100) {
      const batch = payload.slice(i, i + 100);
      const { error } = await supabase
        .from('sync_records')
        .upsert(batch, { onConflict: 'user_id,table_name,sync_id' });
      if (error) {
        errors += batch.length;
        report.errorMessages.push(`${table}: ${error.message}`);
        report.ok = false;
      } else {
        pushed += batch.length;
      }
    }
    report.perTable[table] = { pushed, errors };
    report.totalPushed += pushed;
    report.totalErrors += errors;
  }

  // Flush tombstones: upsert como fila con deleted_at != null, luego clear
  const tombstones = await db.syncTombstones.toArray();
  if (tombstones.length > 0) {
    const tPayload = tombstones.map(t => ({
      user_id: userId,
      table_name: t.tableName,
      sync_id: t.syncId,
      data: {},                        // el data del tombstone es irrelevante
      updated_at: t.deletedAt,
      deleted_at: t.deletedAt,
    }));
    for (let i = 0; i < tPayload.length; i += 100) {
      const batch = tPayload.slice(i, i + 100);
      const { error } = await supabase
        .from('sync_records')
        .upsert(batch, { onConflict: 'user_id,table_name,sync_id' });
      if (error) {
        report.errorMessages.push(`tombstones: ${error.message}`);
        report.ok = false;
      } else {
        report.tombstonesPushed += batch.length;
      }
    }
    // Solo limpiar tombstones que se pushearon exitosamente
    if (report.tombstonesPushed === tombstones.length) {
      await db.syncTombstones.clear();
    }
  }

  if (report.ok) {
    localStorage.setItem(lastPushKey(userId), report.at);
  }
  return report;
}

/** ---- Pull ---- */

export interface PullReport {
  ok: boolean;
  perTable: Record<string, { fetched: number; applied: number; skipped: number; deleted: number }>;
  totalApplied: number;
  totalDeleted: number;
  conflicts: number;                  // filas donde el remoto pisó un cambio local no sincronizado
  orphans: number;                    // filas hijas cuyo curso aún no llegó
  dedupedCourses: number;             // cursos duplicados colapsados por código
  errorMessages: string[];
  at: string;
}

/**
 * Trae de Supabase todo lo actualizado desde el último pull y hace LWW merge.
 *
 * Se procesa `courses` primero para poder mapear `courseCode` → id local en las
 * tablas hijas. Sin ese paso, el `courseId` que viniera en el JSONB apuntaría a
 * un curso arbitrario de esta base y los estudiantes terminarían en otro curso.
 */
export async function pullAll(userId: string): Promise<PullReport> {
  const supabase = getSupabase();
  const lastPulled = localStorage.getItem(lastPullKey(userId)) ?? '1970-01-01T00:00:00Z';
  const lastPushed = localStorage.getItem(lastPushKey(userId)) ?? '1970-01-01T00:00:00Z';
  const report: PullReport = {
    ok: true, perTable: {}, totalApplied: 0, totalDeleted: 0,
    conflicts: 0, orphans: 0, dedupedCourses: 0,
    errorMessages: [], at: new Date().toISOString(),
  };

  // Avanzamos el cursor hasta el updated_at más alto que realmente vimos, no
  // hasta la hora de arranque del pull: las filas escritas por otro dispositivo
  // durante la llamada de red quedaban antes en tierra de nadie.
  let maxSeen = lastPulled;

  let courseIdByCode: Map<string, number> | null = null;
  let studentIdBySyncId: Map<string, number> | null = null;

  for (const table of SYNCABLE_TABLES) {
    // Los mapas se construyen justo antes de la primera tabla que los necesita,
    // ya con `courses` (y `students`) aplicados en esta misma corrida.
    if (COURSE_CHILDREN.has(table) && !courseIdByCode) {
      courseIdByCode = await getCourseIdByCodeMap();
    }
    if (table === 'changeLog' && !studentIdBySyncId) {
      studentIdBySyncId = await buildStudentIdMap();
    }

    let rows: RemoteRecord[];
    try {
      rows = await fetchTable(supabase, userId, table, lastPulled);
    } catch (e) {
      report.errorMessages.push(`${table}: ${(e as Error).message}`);
      report.ok = false;
      report.perTable[table] = { fetched: 0, applied: 0, skipped: 0, deleted: 0 };
      continue;
    }

    let applied = 0, skipped = 0, deleted = 0;

    for (const remote of rows) {
      const remoteUpdated = remote.updated_at ?? '';
      if (remoteUpdated > maxSeen) maxSeen = remoteUpdated;

      const localRow = await db.table(table)
        .where('syncId').equals(remote.sync_id).first() as SyncRow | undefined;

      const localUpdated = localRow?.updatedAt ?? '';
      const isTombstone = remote.deleted_at != null;

      // Skip si local es más nuevo o igual
      if (localRow && localUpdated >= remoteUpdated) {
        skipped++;
        continue;
      }

      // Conflicto: el remoto va a pisar un cambio local no sincronizado
      if (localRow && localUpdated > lastPushed) {
        report.conflicts++;
      }

      if (isTombstone) {
        // Delete local (withoutTombstone para no re-enqueue)
        if (localRow?.id != null) {
          await withoutTombstone(async () => {
            await db.table(table).delete(localRow.id as number);
          });
          deleted++;
          if (table === 'courses') courseIdByCode = await getCourseIdByCodeMap();
        }
        continue;
      }

      const merged: SyncRow = {
        ...remote.data,
        syncId: remote.sync_id,
        // Explícito: el hook 'creating' respeta este valor, así la fila no queda
        // marcada como recién modificada y no se re-empuja en el push siguiente.
        updatedAt: remote.updated_at ?? report.at,
      };

      // --- Reconstrucción de las FKs locales ---
      if (COURSE_CHILDREN.has(table)) {
        const code = merged.courseCode as string | undefined;
        const localCourseId = code ? courseIdByCode!.get(code) : undefined;
        if (localCourseId == null) {
          // El curso todavía no existe aquí. Se guarda igual, marcado, y se
          // reengancha al final. Descartarlo perdería la fila para siempre,
          // porque el cursor lastPull ya habría pasado por encima.
          merged.courseId = ORPHAN_COURSE_ID;
          report.orphans++;
        } else {
          merged.courseId = localCourseId;
        }
      }
      if (table === 'changeLog') {
        const sid = merged.studentSyncId as string | undefined;
        merged.studentId = (sid ? studentIdBySyncId!.get(sid) : undefined) ?? ORPHAN_COURSE_ID;
      }

      // --- Escritura ---
      let target = localRow;

      // Un curso que llega con un código que ya existe localmente pero con otro
      // syncId es un duplicado (típicamente: la misma planilla importada en dos
      // dispositivos antes de sincronizar). Se colapsan en la fila local y se
      // manda a borrar el syncId perdedor, con un criterio determinista para
      // que ambos dispositivos elijan el mismo ganador y no se lo devuelvan.
      if (!target && table === 'courses') {
        const code = merged.code as string | undefined;
        const twin = code
          ? await db.courses.where('code').equals(code).first()
          : undefined;
        if (twin?.id != null) {
          const winner = remote.sync_id < (twin.syncId ?? '') ? remote.sync_id : twin.syncId!;
          const loser = winner === remote.sync_id ? twin.syncId! : remote.sync_id;
          await db.syncTombstones.add({
            tableName: 'courses',
            syncId: loser,
            deletedAt: new Date().toISOString(),
          });
          merged.syncId = winner;
          target = twin as unknown as SyncRow;
          report.dedupedCourses++;
        }
      }

      if (target?.id != null) {
        await db.table(table).update(target.id, merged);
      } else {
        delete merged.id;
        await db.table(table).put(merged);
      }
      applied++;

      // Los mapas quedan obsoletos apenas cambia el padre.
      if (table === 'courses') courseIdByCode = await getCourseIdByCodeMap();
    }

    if (table === 'students' && applied > 0) studentIdBySyncId = null;

    report.perTable[table] = { fetched: rows.length, applied, skipped, deleted };
    report.totalApplied += applied;
    report.totalDeleted += deleted;
  }

  // Segunda pasada: filas hijas que llegaron antes que su curso.
  if (report.orphans > 0) {
    await relinkOrphans();
  }

  if (report.ok) {
    localStorage.setItem(lastPullKey(userId), maxSeen);
  }
  return report;
}

/** Sync completo: pull primero (para no pisar cambios remotos), luego push. */
export async function syncAll(userId: string): Promise<{ pull: PullReport; push: PushReport }> {
  const pull = await pullAll(userId);
  const push = await pushAll(userId);
  return { pull, push };
}

/**
 * Reengancha las filas marcadas como huérfanas contra los cursos y estudiantes
 * que ya existan localmente.
 *
 * El patch incluye `updatedAt` a propósito: el hook 'updating' de Dexie lo
 * respeta y no lo refresca, así que reparar una FK local no cuenta como una
 * edición del usuario ni dispara un push innecesario.
 */
export async function relinkOrphans(): Promise<number> {
  const codeToId = await getCourseIdByCodeMap();
  const studentIds = await buildStudentIdMap();
  let fixed = 0;

  for (const name of ['students', 'attendanceMarks', 'changeLog'] as const) {
    const orphans = await db.table(name)
      .where('courseId').equals(ORPHAN_COURSE_ID).toArray() as SyncRow[];
    for (const row of orphans) {
      const code = row.courseCode as string | undefined;
      const id = code ? codeToId.get(code) : undefined;
      if (id == null || row.id == null) continue;
      await db.table(name).update(row.id, { courseId: id, updatedAt: row.updatedAt });
      fixed++;
    }
  }

  const logOrphans = await db.changeLog
    .where('studentId').equals(ORPHAN_COURSE_ID).toArray() as unknown as SyncRow[];
  for (const row of logOrphans) {
    const sid = row.studentSyncId as string | undefined;
    const id = sid ? studentIds.get(sid) : undefined;
    if (id == null || row.id == null) continue;
    await db.changeLog.update(row.id, { studentId: id, updatedAt: row.updatedAt });
    fixed++;
  }

  return fixed;
}

/** ---- Status ---- */

export interface SyncStatus {
  pendingPush: number;                // filas locales sin sincronizar
  lastPullAt: string | null;
  lastPushAt: string | null;
}

/** Cuenta cuántas filas locales tienen updatedAt > lastPush + tombstones pendientes. */
export async function getSyncStatus(userId: string): Promise<SyncStatus> {
  const lastPush = localStorage.getItem(lastPushKey(userId));
  const lastPull = localStorage.getItem(lastPullKey(userId));

  let pending = 0;
  const threshold = lastPush ?? '1970-01-01T00:00:00Z';
  for (const table of SYNCABLE_TABLES) {
    const count = await db.table(table)
      .filter((r: SyncRow) => (r.updatedAt ?? '') > threshold)
      .count();
    pending += count;
  }
  const tombstones = await db.syncTombstones.count();
  return {
    pendingPush: pending + tombstones,
    lastPullAt: lastPull,
    lastPushAt: lastPush,
  };
}

/** Borra el estado de sync (útil si el usuario cambia de cuenta o quiere re-sync completo). */
export function resetSyncState(userId: string) {
  localStorage.removeItem(lastPullKey(userId));
  localStorage.removeItem(lastPushKey(userId));
}

// ---- helpers ----

/**
 * Trae todas las filas de una tabla actualizadas después de `since`, paginando.
 * El select viene ordenado por updated_at para que la paginación sea estable y
 * para que los cursos lleguen en un orden reproducible entre dispositivos.
 */
async function fetchTable(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  table: string,
  since: string,
): Promise<RemoteRecord[]> {
  const out: RemoteRecord[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('sync_records')
      .select('sync_id, data, updated_at, deleted_at')
      .eq('user_id', userId)
      .eq('table_name', table)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .order('sync_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as RemoteRecord[];
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return out;
}

/** Mapa `syncId de estudiante` → id local, para reconstruir changeLog.studentId. */
async function buildStudentIdMap(): Promise<Map<string, number>> {
  const all = await db.students.toArray();
  const m = new Map<string, number>();
  for (const s of all) {
    if (s.syncId && s.id != null) m.set(s.syncId, s.id);
  }
  return m;
}

/**
 * Devuelve una copia de `row` lista para el JSONB de Supabase.
 *
 * Fuera van la metadata de sync (id, syncId, updatedAt viven en columnas
 * propias) y —esto es lo que causaba que los estudiantes cambiaran de curso—
 * las claves foráneas locales. `courseId` y `studentId` son autoincrementales
 * de Dexie: en otra base, o después de un pull que recreó los cursos en otro
 * orden, el mismo número apunta a un curso distinto. La relación viaja como
 * `courseCode` / `studentSyncId`, que sí son estables.
 */
function stripLocalMeta(row: SyncRow): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  delete out.id;
  delete out.syncId;
  delete out.updatedAt;
  delete out.courseId;
  delete out.studentId;
  return out;
}