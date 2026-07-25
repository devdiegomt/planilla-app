/**
 * Backup/restore de la base local (Dexie).
 *
 * Formato JSON: {version, exportedAt, tables: {courses, students, ...}}
 * El restore borra y reemplaza todo — es una operación irreversible.
 */

import { db } from './db';

const TABLES = [
  'courses', 'students', 'todos', 'events',
  'schedule', 'calendarDays', 'yearConfig', 'attendanceMarks',
  'changeLog', 'rubrics', 'gradingResults',
] as const;

export interface Backup {
  version: number;                    // versión del schema Dexie
  exportedAt: string;                 // ISO datetime
  tables: Record<string, unknown[]>;
}

export async function exportBackup(): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLES) {
    tables[name] = await db.table(name).toArray();
  }
  return {
    version: db.verno,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export interface RestoreReport {
  restored: Record<string, number>;
  skipped: string[];
}

export async function restoreBackup(data: Backup): Promise<RestoreReport> {
  if (!data || typeof data !== 'object' || !data.tables) {
    throw new Error('Backup inválido: falta la clave "tables"');
  }
  const report: RestoreReport = { restored: {}, skipped: [] };
  await db.transaction('rw', TABLES.map(t => db.table(t)), async () => {
    for (const name of TABLES) {
      const rows = data.tables[name];
      if (!Array.isArray(rows)) {
        report.skipped.push(name);
        continue;
      }
      await db.table(name).clear();
      if (rows.length > 0) {
        await db.table(name).bulkAdd(rows);
      }
      report.restored[name] = rows.length;
    }
  });
  return report;
}
