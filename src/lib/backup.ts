/**
 * Backup/restore de la base local (Dexie).
 *
 * Formato JSON: {version, exportedAt, tables: {courses, students, ...}}
 * El restore borra y reemplaza todo — es una operación irreversible.
 */

import { db, withoutTombstone } from './db';

const TABLES = [
  'courses', 'students', 'todos', 'events',
  'schedule', 'calendarDays', 'yearConfig', 'attendanceMarks',
  'changeLog',
  // El histórico de trimestres cerrados es lo único que queda de las notas de
  // un trimestre anterior: dejarlo fuera del respaldo lo volvería irrecuperable.
  'trimesterSnapshots',
  // El registro de correos evita reescribirle al mismo estudiante: sin él en el
  // respaldo, restaurar dejaria a todos como si nunca se les hubiera escrito.
  'emailLog',
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

  // `clear()` dispara el hook 'deleting' de cada tabla, que escribe en
  // syncTombstones usando la transacción en curso. Sin esa tabla en el scope,
  // el restore reventaba con un error de scope de Dexie.
  //
  // Y va envuelto en withoutTombstone: restaurar un backup es reemplazar el
  // estado local, no ordenar el borrado de cientos de filas en el servidor.
  await withoutTombstone(async () => {
    await db.transaction(
      'rw',
      [...TABLES.map(t => db.table(t)), db.syncTombstones],
      async () => {
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
      },
    );
  });
  return report;
}

/**
 * Borra de ESTE dispositivo todo lo que la app guarda de estudiantes.
 *
 * Es el cierre de un docente que deja el colegio, o que devuelve un equipo
 * prestado. La app es local-first: restringir el dominio del correo impide
 * entrar, pero no saca los datos del navegador de nadie. Esto sí.
 *
 * `withoutTombstone` es deliberado: esto NO es "borré estos estudiantes", que
 * se propagaría por sync y los borraría también de los otros dispositivos del
 * docente. Es "este equipo ya no los guarda". Lo que está en el servidor sigue
 * ahí y vuelve al iniciar sesión otra vez — por eso el borrado va junto al
 * cierre de sesión.
 */
export async function wipeLocalData(): Promise<number> {
  return withoutTombstone(async () => {
    let filas = 0;
    await db.transaction(
      'rw',
      [...TABLES.map(t => db.table(t)), db.syncTombstones],
      async () => {
        for (const name of TABLES) {
          filas += await db.table(name).count();
          await db.table(name).clear();
        }
        // Las lápidas pendientes tampoco tienen sentido en un equipo que se deja.
        await db.syncTombstones.clear();
      },
    );
    // Rastros fuera de Dexie: el mapa de códigos y la marca de poda.
    try {
      localStorage.removeItem('codAlumMap');
      localStorage.removeItem('changeLogPruneAt');
    } catch {
      // Almacenamiento bloqueado: no hay nada que limpiar ahí.
    }
    return filas;
  });
}
