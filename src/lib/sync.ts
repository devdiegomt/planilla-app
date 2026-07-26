/**
 * Motor de sincronización Dexie ↔ Supabase.
 *
 * Modelo: una tabla `sync_records` en Supabase con (user_id, table_name, sync_id, data JSONB, updated_at).
 * Cada registro Dexie se serializa a un record; sync_id + updatedAt viven en la
 * fila Dexie (via hooks). Last-write-wins por updated_at.
 *
 * Limitaciones conocidas del MVP:
 * - Deletes en dispositivo A no se propagan a dispositivo B. Se resuelve con
 *   tombstones en fase 2.1.
 * - Sin resolución de conflictos manual: si dos dispositivos editan lo mismo,
 *   gana el updatedAt más reciente sin avisar al usuario.
 */

import { db } from './db';
import { getSupabase } from './supabase';

/** Tablas syncables (mismo orden que la migración v6 y el push queue). */
export const SYNCABLE_TABLES = [
  'courses', 'students', 'todos', 'events', 'schedule',
  'calendarDays', 'yearConfig', 'attendanceMarks', 'changeLog',
  'rubrics', 'gradingResults',
] as const;

export type SyncableTable = typeof SYNCABLE_TABLES[number];

interface SyncRow {
  syncId?: string;
  updatedAt?: string;
  [k: string]: unknown;
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
  errorMessages: string[];
  at: string;
}

/** Sube a Supabase todo lo que se modificó desde el último push. */
export async function pushAll(userId: string): Promise<PushReport> {
  const supabase = getSupabase();
  const lastPushed = localStorage.getItem(lastPushKey(userId)) ?? '1970-01-01T00:00:00Z';
  const report: PushReport = {
    ok: true, perTable: {}, totalPushed: 0, totalErrors: 0,
    errorMessages: [], at: new Date().toISOString(),
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

  if (report.ok) {
    localStorage.setItem(lastPushKey(userId), report.at);
  }
  return report;
}

/** ---- Pull ---- */

export interface PullReport {
  ok: boolean;
  perTable: Record<string, { fetched: number; applied: number; skipped: number }>;
  totalApplied: number;
  errorMessages: string[];
  at: string;
}

/** Trae de Supabase todo lo actualizado desde el último pull y hace LWW merge. */
export async function pullAll(userId: string): Promise<PullReport> {
  const supabase = getSupabase();
  const lastPulled = localStorage.getItem(lastPullKey(userId)) ?? '1970-01-01T00:00:00Z';
  const report: PullReport = {
    ok: true, perTable: {}, totalApplied: 0, errorMessages: [],
    at: new Date().toISOString(),
  };

  for (const table of SYNCABLE_TABLES) {
    const { data, error } = await supabase
      .from('sync_records')
      .select('sync_id, data, updated_at')
      .eq('user_id', userId)
      .eq('table_name', table)
      .gt('updated_at', lastPulled);

    if (error) {
      report.errorMessages.push(`${table}: ${error.message}`);
      report.ok = false;
      report.perTable[table] = { fetched: 0, applied: 0, skipped: 0 };
      continue;
    }

    let applied = 0, skipped = 0;
    for (const remote of data ?? []) {
      const localRow = await db.table(table)
        .where('syncId').equals(remote.sync_id).first() as SyncRow | undefined;

      const localUpdated = localRow?.updatedAt ?? '';
      const remoteUpdated = remote.updated_at ?? '';

      if (localRow && localUpdated >= remoteUpdated) {
        skipped++;
        continue;
      }

      // Payload remoto: `data` es el objeto completo; mantener el `id` local si existe
      const merged: SyncRow = {
        ...(remote.data as Record<string, unknown>),
        syncId: remote.sync_id,
        updatedAt: remote.updated_at,
      };
      if (localRow?.id) merged.id = localRow.id;

      // Los hooks no deben re-bumpear updatedAt en este write; lo evitamos
      // pasando updatedAt explícito (el hook 'updating' lo respeta).
      if (localRow?.id) {
        await db.table(table).update(localRow.id as number, merged);
      } else {
        // No local — insertar; el hook 'creating' seteará updatedAt.
        // Para preservar el remoteUpdated, hacemos put (upsert) con updatedAt explícito.
        delete merged.id;
        await db.table(table).put(merged);
      }
      applied++;
    }
    report.perTable[table] = { fetched: data?.length ?? 0, applied, skipped };
    report.totalApplied += applied;
  }

  if (report.ok) {
    localStorage.setItem(lastPullKey(userId), report.at);
  }
  return report;
}

/** Sync completo: pull primero (para no pisar cambios remotos), luego push. */
export async function syncAll(userId: string): Promise<{ pull: PullReport; push: PushReport }> {
  const pull = await pullAll(userId);
  const push = await pushAll(userId);
  return { pull, push };
}

/** ---- Status ---- */

export interface SyncStatus {
  pendingPush: number;                // filas locales sin sincronizar
  lastPullAt: string | null;
  lastPushAt: string | null;
}

/** Cuenta cuántas filas locales tienen updatedAt > lastPush (pendientes de push). */
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
  return {
    pendingPush: pending,
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
 * Devuelve una copia de `row` sin los campos de metadata local (id, syncId,
 * updatedAt) para persistir en el JSONB de Supabase. syncId y updatedAt
 * están en columnas separadas.
 */
function stripLocalMeta(row: SyncRow): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  delete out.id;
  delete out.syncId;
  delete out.updatedAt;
  return out;
}
