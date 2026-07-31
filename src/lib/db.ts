import Dexie, { Table } from 'dexie';
import type {
  Course, Student, Todo, CalendarEvent,
  ScheduleBlock, CalendarDay, YearConfig,
  AttendanceMark, ChangeLog,
} from '@/types';
import { courseSyncId, studentSyncId } from './syncId';
import { normalizeName, findFuzzyMatch } from './utils';
import type { ParsedCodAlum } from './codalum';
import {
  justFieldOf, cycleMarkState, sessionMarkState, consolidateSessions,
  markDescription, type MarkKind, type MarkState,
} from './attendance';

/** Registro local de una eliminación pendiente de propagar al servidor. */
export interface SyncTombstone {
  id?: number;
  tableName: string;
  syncId: string;
  deletedAt: string;                  // ISO datetime local
}

/**
 * Bandera para saltar el hook 'deleting' cuando la eliminación viene del pull
 * (aplicando una tombstone remota) o de una reparación local. Declarada antes
 * de la clase para que el upgrade de v9 pueda subirla dentro del try/finally
 * sin caer en TDZ.
 */
let SUPPRESS_TOMBSTONE = 0;
export async function withoutTombstone<T>(fn: () => Promise<T>): Promise<T> {
  SUPPRESS_TOMBSTONE++;
  try {
    return await fn();
  } finally {
    SUPPRESS_TOMBSTONE--;
  }
}

class PlanillaDB extends Dexie {
  courses!: Table<Course, number>;
  students!: Table<Student, number>;
  todos!: Table<Todo, number>;
  events!: Table<CalendarEvent, number>;
  schedule!: Table<ScheduleBlock, number>;
  calendarDays!: Table<CalendarDay, number>;
  yearConfig!: Table<YearConfig, number>;
  attendanceMarks!: Table<AttendanceMark, number>;
  changeLog!: Table<ChangeLog, number>;
  syncTombstones!: Table<SyncTombstone, number>;

  constructor() {
    super('planilla-app');

    // v1: solo courses + students
    this.version(1).stores({
      courses: '++id, code, grade, year, trimestre',
      students: '++id, courseId, codAlum, nombre, order',
      todos: '++id, status, priority, dueDate, courseCode',
      events: '++id, date, courseCode, kind',
    });

    // v2: horario + calendario + config de año
    this.version(2).stores({
      courses: '++id, code, grade, year, trimestre',
      students: '++id, courseId, codAlum, nombre, order',
      todos: '++id, status, priority, dueDate, courseCode',
      events: '++id, date, courseCode, kind',
      schedule: '++id, dayType, block, courseCode, [dayType+block]',
      calendarDays: '++id, &date, status',
      yearConfig: '++id, &year',
    });

    // v3: marcas de asistencia confirmada
    this.version(3).stores({
      courses: '++id, code, grade, year, trimestre',
      students: '++id, courseId, codAlum, nombre, order',
      todos: '++id, status, priority, dueDate, courseCode',
      events: '++id, date, courseCode, kind',
      schedule: '++id, dayType, block, courseCode, [dayType+block]',
      calendarDays: '++id, &date, status',
      yearConfig: '++id, &year',
      attendanceMarks: '++id, courseId, ciclo, [courseId+ciclo]',
    });

    // v4: historial de ediciones (audit log)
    this.version(4).stores({
      courses: '++id, code, grade, year, trimestre',
      students: '++id, courseId, codAlum, nombre, order',
      todos: '++id, status, priority, dueDate, courseCode',
      events: '++id, date, courseCode, kind',
      schedule: '++id, dayType, block, courseCode, [dayType+block]',
      calendarDays: '++id, &date, status',
      yearConfig: '++id, &year',
      attendanceMarks: '++id, courseId, ciclo, [courseId+ciclo]',
      changeLog: '++id, courseId, studentId, at, kind, ciclo',
    });

    // v5: agente IA calificador (rúbricas y resultados)
    this.version(5).stores({
      courses: '++id, code, grade, year, trimestre',
      students: '++id, courseId, codAlum, nombre, order',
      todos: '++id, status, priority, dueDate, courseCode',
      events: '++id, date, courseCode, kind',
      schedule: '++id, dayType, block, courseCode, [dayType+block]',
      calendarDays: '++id, &date, status',
      yearConfig: '++id, &year',
      attendanceMarks: '++id, courseId, ciclo, [courseId+ciclo]',
      changeLog: '++id, courseId, studentId, at, kind, ciclo',
      rubrics: '++id, name, courseCode, createdAt',
      gradingResults: '++id, rubricId, at, courseCode, studentName',
    });

    // v6: sync (syncId UUID + updatedAt indexados en todas las tablas)
    this.version(6).stores({
      courses: '++id, code, grade, year, trimestre, &syncId, updatedAt',
      students: '++id, courseId, codAlum, nombre, order, &syncId, updatedAt',
      todos: '++id, status, priority, dueDate, courseCode, &syncId, updatedAt',
      events: '++id, date, courseCode, kind, &syncId, updatedAt',
      schedule: '++id, dayType, block, courseCode, [dayType+block], &syncId, updatedAt',
      calendarDays: '++id, &date, status, &syncId, updatedAt',
      yearConfig: '++id, &year, &syncId, updatedAt',
      attendanceMarks: '++id, courseId, ciclo, [courseId+ciclo], &syncId, updatedAt',
      changeLog: '++id, courseId, studentId, at, kind, ciclo, &syncId, updatedAt',
      rubrics: '++id, name, courseCode, createdAt, &syncId, updatedAt',
      gradingResults: '++id, rubricId, at, courseCode, studentName, &syncId, updatedAt',
    }).upgrade(async tx => {
      // Migración de datos: poblar syncId y updatedAt en cada fila existente
      const tables = [
        'courses', 'students', 'todos', 'events', 'schedule',
        'calendarDays', 'yearConfig', 'attendanceMarks', 'changeLog',
        'rubrics', 'gradingResults',
      ] as const;
      for (const name of tables) {
        await tx.table(name).toCollection().modify(row => {
          if (!row.syncId) row.syncId = crypto.randomUUID();
          if (!row.updatedAt) {
            // Preferir un timestamp preexistente si el schema lo tiene
            row.updatedAt = row.createdAt || row.at || row.confirmedAt || new Date().toISOString();
          }
        });
      }
    });

    // v7: tabla local de tombstones para propagar deletes
    this.version(7).stores({
      courses: '++id, code, grade, year, trimestre, &syncId, updatedAt',
      students: '++id, courseId, codAlum, nombre, order, &syncId, updatedAt',
      todos: '++id, status, priority, dueDate, courseCode, &syncId, updatedAt',
      events: '++id, date, courseCode, kind, &syncId, updatedAt',
      schedule: '++id, dayType, block, courseCode, [dayType+block], &syncId, updatedAt',
      calendarDays: '++id, &date, status, &syncId, updatedAt',
      yearConfig: '++id, &year, &syncId, updatedAt',
      attendanceMarks: '++id, courseId, ciclo, [courseId+ciclo], &syncId, updatedAt',
      changeLog: '++id, courseId, studentId, at, kind, ciclo, &syncId, updatedAt',
      rubrics: '++id, name, courseCode, createdAt, &syncId, updatedAt',
      gradingResults: '++id, rubricId, at, courseCode, studentName, &syncId, updatedAt',
      syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
    });

    // v8: las relaciones dejan de vivir en ids autoincrementales locales.
    //
    // `courseId` es un ++id de Dexie: solo tiene sentido dentro de la base que
    // lo generó. Al sincronizarlo, los estudiantes caían en el curso equivocado
    // en cualquier base cuyo orden de ids fuera distinto. Ahora la relación real
    // es `courseCode` y `courseId` se recalcula localmente en cada pull.
    //
    // El índice [year+code] queda como no-único a propósito: IndexedDB valida los
    // unique-index al crear el índice, no al insertar, y con cursos duplicados
    // pre-existentes fallaría antes de que el upgrade tuviera oportunidad de
    // limpiarlos. La promoción a &[year+code] vive en v10, después de que v9
    // haya colapsado los duplicados.
    this.version(8).stores({
      courses: '++id, code, grade, year, trimestre, [year+code], &syncId, updatedAt',
      students: '++id, courseId, courseCode, codAlum, nombre, order, &syncId, updatedAt',
      todos: '++id, status, priority, dueDate, courseCode, &syncId, updatedAt',
      events: '++id, date, courseCode, kind, &syncId, updatedAt',
      schedule: '++id, dayType, block, courseCode, [dayType+block], &syncId, updatedAt',
      calendarDays: '++id, &date, status, &syncId, updatedAt',
      yearConfig: '++id, &year, &syncId, updatedAt',
      attendanceMarks: '++id, courseId, courseCode, ciclo, [courseId+ciclo], &syncId, updatedAt',
      changeLog: '++id, courseId, courseCode, studentId, studentSyncId, at, kind, ciclo, &syncId, updatedAt',
      rubrics: '++id, name, courseCode, createdAt, &syncId, updatedAt',
      gradingResults: '++id, rubricId, at, courseCode, studentName, &syncId, updatedAt',
      syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
    }).upgrade(async tx => {
      // Poblar courseCode desde el courseId actual. Es "el mejor esfuerzo
      // posible": si la base ya venía corrupta, el código heredado será el
      // equivocado y hay que reparar con mergeDuplicateCourses + reimportación.
      const courses = await tx.table('courses').toArray();
      const codeById = new Map<number, string>(
        courses.map((c: Course) => [c.id!, c.code]),
      );
      for (const name of ['students', 'attendanceMarks', 'changeLog']) {
        await tx.table(name).toCollection().modify(row => {
          if (!row.courseCode) row.courseCode = codeById.get(row.courseId) ?? '';
        });
      }
      // Referencia estable a estudiante en el audit log
      const students = await tx.table('students').toArray();
      const sidById = new Map<number, string>(
        students.map((s: Student) => [s.id!, s.syncId!]),
      );
      await tx.table('changeLog').toCollection().modify(row => {
        if (!row.studentSyncId) row.studentSyncId = sidById.get(row.studentId) ?? '';
      });
    });

    // v9: colapsa cursos duplicados (mismo `code`) antes de que v10 imponga la
    // unicidad. No hay cambio de esquema — es solo migración de datos.
    //
    // Los deletes NO deben propagarse como tombstones: dos dispositivos podrían
    // elegir keepers distintos (min id local es device-específico) y terminar
    // borrándose mutuamente el ganador tras el próximo sync. La limpieza queda
    // local; para bases ya cruzadas con el servidor, RepairPanel → "Reconstruir
    // servidor" sigue siendo la única forma segura de sanear allá.
    this.version(9).stores({
      courses: '++id, code, grade, year, trimestre, [year+code], &syncId, updatedAt',
      students: '++id, courseId, courseCode, codAlum, nombre, order, &syncId, updatedAt',
      todos: '++id, status, priority, dueDate, courseCode, &syncId, updatedAt',
      events: '++id, date, courseCode, kind, &syncId, updatedAt',
      schedule: '++id, dayType, block, courseCode, [dayType+block], &syncId, updatedAt',
      calendarDays: '++id, &date, status, &syncId, updatedAt',
      yearConfig: '++id, &year, &syncId, updatedAt',
      attendanceMarks: '++id, courseId, courseCode, ciclo, [courseId+ciclo], &syncId, updatedAt',
      changeLog: '++id, courseId, courseCode, studentId, studentSyncId, at, kind, ciclo, &syncId, updatedAt',
      rubrics: '++id, name, courseCode, createdAt, &syncId, updatedAt',
      gradingResults: '++id, rubricId, at, courseCode, studentName, &syncId, updatedAt',
      syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
    }).upgrade(async tx => {
      SUPPRESS_TOMBSTONE++;
      try {
        const courses = await tx.table('courses').toArray();
        const byCode = new Map<string, Course[]>();
        for (const c of courses as Course[]) {
          const arr = byCode.get(c.code) ?? [];
          arr.push(c);
          byCode.set(c.code, arr);
        }
        for (const [code, rows] of byCode) {
          if (rows.length < 2) continue;
          const keep = rows.reduce((a, b) => (a.id! < b.id! ? a : b));
          const dropIds = rows.filter(c => c.id !== keep.id).map(c => c.id!);
          for (const name of ['students', 'attendanceMarks', 'changeLog']) {
            await tx.table(name)
              .where('courseId').anyOf(dropIds)
              .modify({ courseId: keep.id, courseCode: code });
          }
          await tx.table('courses').bulkDelete(dropIds);
        }
      } finally {
        SUPPRESS_TOMBSTONE--;
      }
    });

    // v10: con la base ya sin cursos duplicados, promovemos [year+code] a
    // unique. Esto blinda todos los flujos futuros (import, pull, mano suelta
    // en consola) contra reintroducir el bug de duplicados que enmascaraba el
    // sync de FKs locales.
    this.version(10).stores({
      courses: '++id, code, grade, year, trimestre, &[year+code], &syncId, updatedAt',
      students: '++id, courseId, courseCode, codAlum, nombre, order, &syncId, updatedAt',
      todos: '++id, status, priority, dueDate, courseCode, &syncId, updatedAt',
      events: '++id, date, courseCode, kind, &syncId, updatedAt',
      schedule: '++id, dayType, block, courseCode, [dayType+block], &syncId, updatedAt',
      calendarDays: '++id, &date, status, &syncId, updatedAt',
      yearConfig: '++id, &year, &syncId, updatedAt',
      attendanceMarks: '++id, courseId, courseCode, ciclo, [courseId+ciclo], &syncId, updatedAt',
      changeLog: '++id, courseId, courseCode, studentId, studentSyncId, at, kind, ciclo, &syncId, updatedAt',
      rubrics: '++id, name, courseCode, createdAt, &syncId, updatedAt',
      gradingResults: '++id, rubricId, at, courseCode, studentName, &syncId, updatedAt',
      syncTombstones: '++id, tableName, syncId, deletedAt, [tableName+syncId]',
    });
  }
}

export const db = new PlanillaDB();

/**
 * Instalar hooks de sync después de crear la instancia.
 * - creating/updating: auto-setean syncId y updatedAt
 * - deleting: enqueue una tombstone local (excepto si SUPPRESS_TOMBSTONE está activo)
 * Solo se ejecuta en el cliente.
 */
if (typeof window !== 'undefined') {
  const SYNCABLE = [
    'courses', 'students', 'todos', 'events', 'schedule',
    'calendarDays', 'yearConfig', 'attendanceMarks', 'changeLog',
  ];
  for (const name of SYNCABLE) {
    const table = db.table(name);
    // Dexie hook 'creating': (primKey, obj, transaction) — mutamos obj in place
    table.hook('creating', function (_pk, obj) {
      const row = obj as Record<string, unknown>;
      if (!row.syncId) row.syncId = crypto.randomUUID();
      // La guarda es crítica: sin ella, toda fila traída del servidor por el
      // pull quedaba marcada como "modificada ahora", se re-empujaba en el push
      // siguiente y el last-write-wins comparaba timestamps inventados.
      if (!row.updatedAt) row.updatedAt = new Date().toISOString();
    });
    // Dexie hook 'updating': (modifications, primKey, obj, transaction) — devolvemos el patch modificado
    table.hook('updating', function (modifications) {
      const mods = modifications as Record<string, unknown>;
      if ('updatedAt' in mods) return undefined;    // ya lo trae, no tocar
      return { ...mods, updatedAt: new Date().toISOString() };
    });
    // Dexie hook 'deleting': (primKey, obj, transaction) — enqueue tombstone si aplica.
    // Debe usar la transacción actual porque el hook corre dentro de una tx activa;
    // abrir otra tx (fire-and-forget) genera un TransactionInactiveError silencioso.
    table.hook('deleting', function (_pk, obj, trans) {
      if (SUPPRESS_TOMBSTONE > 0) return;
      const syncId = (obj as { syncId?: string })?.syncId;
      if (!syncId) return;
      // trans.table() está scopeada a la tx en curso; syncTombstones debe estar
      // en el scope 'rw' de esa tx. Los helpers de borrado harán la delete
      // dentro de db.transaction('rw', <src>, db.syncTombstones, ...).
      const tsTable = trans.table('syncTombstones');
      tsTable.add({
        tableName: name,
        syncId,
        deletedAt: new Date().toISOString(),
      });
    });
  }
}

// En desarrollo, `db` queda accesible desde la consola del navegador para
// diagnosticar. En producción no se expone.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as Record<string, unknown>).db = db;
}

/** Helpers de acceso pensados para usarse desde componentes con useLiveQuery. */
export async function getCourseByCode(code: string) {
  return db.courses.where('code').equals(code).first();
}

export async function getStudentsForCourse(courseId: number) {
  return db.students
    .where('courseId').equals(courseId)
    .sortBy('order');
}

/** Estudiantes activos (sin fecha de retiro). */
export async function getActiveStudentsForCourse(courseId: number) {
  const all = await getStudentsForCourse(courseId);
  return all.filter(s => !s.withdrawnAt);
}

/**
 * Mapa `code → id local`. Lo consume sync.ts para reconstruir el `courseId` de
 * cada fila hija que llega del servidor.
 */
export async function getCourseIdByCodeMap(): Promise<Map<string, number>> {
  const all = await db.courses.toArray();
  return new Map(all.map(c => [c.code, c.id!]));
}

/**
 * Inserta o actualiza un curso y su lista de estudiantes.
 *
 * Antes esto borraba todos los estudiantes del curso y los volvía a crear. Eso
 * regeneraba los syncId en cada importación (misma persona = registro nuevo →
 * duplicados al sincronizar), emitía una lápida por estudiante y borraba las
 * notas ya capturadas en la app. Ahora hace match por nombre normalizado:
 * actualiza los que siguen, crea los nuevos y retira suavemente los ausentes.
 */
export async function upsertCourseWithStudents(
  course: Omit<Course, 'id'>,
  students: Omit<Student, 'id' | 'courseId' | 'courseCode'>[],
): Promise<number> {
  return db.transaction('rw', db.courses, db.students, async () => {
    const now = new Date().toISOString();

    const existing = await getCourseByCode(course.code);
    let courseId: number;
    if (existing) {
      courseId = existing.id!;
      await db.courses.update(courseId, { ...course, updatedAt: now });
    } else {
      courseId = await db.courses.add({
        ...course,
        // Identidad determinista: el mismo curso produce el mismo UUID en
        // cualquier dispositivo, así el pull nunca crea una segunda fila 801.
        syncId: courseSyncId(course.year, course.code),
        updatedAt: now,
      }) as number;
    }

    // Dos estudiantes con el mismo nombre en un curso producirían el mismo
    // syncId determinista y chocarían contra el índice único. El sufijo #n los
    // separa de forma reproducible (el orden de la planilla es estable).
    const prevSeen = new Map<string, number>();
    const prev = (await db.students.where('courseId').equals(courseId).toArray())
      .sort((a, b) => a.order - b.order);
    const pending = new Map(prev.map(s => [dedupKey(s.nombre, prevSeen), s]));

    const seen = new Map<string, number>();
    for (const s of students) {
      const key = dedupKey(s.nombre, seen);
      const hit = pending.get(key);
      if (hit) {
        // Solo se refresca lo que viene de la planilla. Notas, observaciones y
        // asistencia capturadas en la app se conservan intactas.
        await db.students.update(hit.id!, {
          order: s.order,
          courseCode: course.code,
          courseId,
          withdrawnAt: null,
        });
        pending.delete(key);
      } else {
        await db.students.add({
          ...s,
          courseId,
          courseCode: course.code,
          syncId: studentSyncId(course.year, course.code, key),
          updatedAt: now,
        } as Student);
      }
    }

    // Los que ya no aparecen en la planilla: retiro suave, nunca delete. Un
    // delete aquí destruiría las notas del trimestre y propagaría una lápida.
    for (const orphan of pending.values()) {
      if (!orphan.withdrawnAt) {
        await db.students.update(orphan.id!, { withdrawnAt: now });
      }
    }

    return courseId;
  });
}

/** Marca un estudiante como retirado (soft-delete). */
export async function withdrawStudent(studentId: number) {
  await db.students.update(studentId, { withdrawnAt: new Date().toISOString() });
}

/** Actualiza una subnota específica de un estudiante. */
export async function updateSubnota(studentId: number, slotKey: string, value: number) {
  const s = await db.students.get(studentId);
  if (!s) return;
  s.subnotas[slotKey] = value;
  await db.students.update(studentId, { subnotas: s.subnotas });
}

/**
 * Actualiza todos los slots que apuntan a la misma columna real de la
 * plataforma con el mismo valor (ej. C4 → K1_C4 y C2_C4). Registra
 * el cambio en changeLog si prev != next.
 */
export async function updateColumnValue(
  studentId: number,
  slotKeys: string[],
  value: number,
) {
  const s = await db.students.get(studentId);
  if (!s) return;
  const prev = s.subnotas[slotKeys[0]] ?? 0;
  if (prev === value) return;
  for (const k of slotKeys) s.subnotas[k] = value;
  const column = slotKeys[0].split('_')[1];
  await db.transaction('rw', db.students, db.changeLog, async () => {
    await db.students.update(studentId, { subnotas: s.subnotas });
    await db.changeLog.add({
      courseId: s.courseId,
      courseCode: s.courseCode,
      studentId,
      studentSyncId: s.syncId,
      studentName: s.nombre,
      at: new Date().toISOString(),
      kind: 'nota',
      summary: `${column}: ${prev}→${value}`,
    });
  });
}

/**
 * Guarda/actualiza/borra la observación docente asociada a una nota de una
 * columna real (C2..C9). Texto vacío borra la entrada.
 */
export async function updateColumnObservation(
  studentId: number,
  column: string,
  text: string,
) {
  const s = await db.students.get(studentId);
  if (!s) return;
  const prev = s.noteObservations?.[column] ?? '';
  const next = text.trim();
  if (prev === next) return;
  const obs = { ...(s.noteObservations ?? {}) };
  if (next) obs[column] = next;
  else delete obs[column];
  const summary = !prev
    ? `Obs ${column}: (agregada)`
    : !next
    ? `Obs ${column}: (borrada)`
    : `Obs ${column}: (editada)`;
  await db.transaction('rw', db.students, db.changeLog, async () => {
    await db.students.update(studentId, { noteObservations: obs });
    await db.changeLog.add({
      courseId: s.courseId,
      courseCode: s.courseCode,
      studentId,
      studentSyncId: s.syncId,
      studentName: s.nombre,
      at: new Date().toISOString(),
      kind: 'nota',
      summary,
    });
  });
}

/** Actualiza F/R de un ciclo (8°–10°) y registra el cambio. */
export async function updateAttendance(
  studentId: number,
  cycle: number,
  field: MarkKind,
  state: MarkState,
) {
  const s = await db.students.get(studentId);
  if (!s) return;
  const c = s.cycles.find(c => c.ciclo === cycle);
  if (!c) return;
  const jField = justFieldOf(field);
  if (cycleMarkState(c, field) === state) return;

  c[field] = state !== 'none';
  // Apagar la marca limpia la justificación: (F=false, Fj=true) no significa
  // nada y ensuciaría el export y las estadísticas.
  c[jField] = state === 'justificada';

  await db.transaction('rw', db.students, db.changeLog, async () => {
    await db.students.update(studentId, { cycles: s.cycles });
    await db.changeLog.add({
      courseId: s.courseId,
      courseCode: s.courseCode,
      studentId,
      studentSyncId: s.syncId,
      studentName: s.nombre,
      at: new Date().toISOString(),
      kind: 'attendance',
      ciclo: cycle,
      summary: `Ciclo ${cycle} · ${markDescription(field, state)}`,
    });
  });
}

// ---- Horario y calendario ----

export async function getYearConfig(year: number) {
  return db.yearConfig.where('year').equals(year).first();
}

export async function upsertYearConfig(cfg: Omit<YearConfig, 'id'>) {
  const existing = await getYearConfig(cfg.year);
  if (existing) {
    await db.yearConfig.update(existing.id!, cfg);
    return existing.id!;
  }
  return (await db.yearConfig.add(cfg)) as number;
}

export async function getScheduleForDayType(dayType: string) {
  return db.schedule.where('dayType').equals(dayType).sortBy('block');
}

export async function upsertScheduleBlock(b: ScheduleBlock) {
  if (b.id) {
    await db.schedule.update(b.id, b);
    return b.id;
  }
  return (await db.schedule.add(b)) as number;
}

export async function deleteScheduleBlock(id: number) {
  await db.transaction('rw', db.schedule, db.syncTombstones, async () => {
    await db.schedule.delete(id);
  });
}

export async function getCalendarDay(dateIso: string) {
  return db.calendarDays.where('date').equals(dateIso).first();
}

export async function upsertCalendarDay(cd: CalendarDay) {
  const existing = await getCalendarDay(cd.date);
  if (existing) {
    await db.calendarDays.update(existing.id!, cd);
    return existing.id!;
  }
  return (await db.calendarDays.add(cd)) as number;
}

export async function clearCalendarDay(dateIso: string) {
  await db.transaction('rw', db.calendarDays, db.syncTombstones, async () => {
    const existing = await getCalendarDay(dateIso);
    if (existing?.id) await db.calendarDays.delete(existing.id);
  });
}

// ---- Pendientes (To-do) ----

export async function addTodo(t: Omit<Todo, 'id'>) {
  return (await db.todos.add(t)) as number;
}

export async function updateTodo(id: number, patch: Partial<Todo>) {
  await db.todos.update(id, patch);
}

export async function deleteTodo(id: number) {
  await db.transaction('rw', db.todos, db.syncTombstones, async () => {
    await db.todos.delete(id);
  });
}

// ---- Eventos de curso (entregas, actividades) ----

export async function addEvent(e: Omit<CalendarEvent, 'id'>) {
  return (await db.events.add(e)) as number;
}

export async function updateEvent(id: number, patch: Partial<CalendarEvent>) {
  await db.events.update(id, patch);
}

export async function deleteEvent(id: number) {
  await db.transaction('rw', db.events, db.syncTombstones, async () => {
    await db.events.delete(id);
  });
}

// ---- Asistencia (F/R confirmada por ciclo/sesión) ----

/**
 * `session` = 1 o 2 para 11° (marca solo esa sesión).
 * `session` omitido para 8°–10° (marca el ciclo completo).
 */
export async function getAttendanceMark(
  courseId: number, ciclo: number, session?: 1 | 2,
) {
  const rows = await db.attendanceMarks
    .where('[courseId+ciclo]').equals([courseId, ciclo])
    .toArray();
  if (session == null) return rows.find(r => r.session == null);
  return rows.find(r => r.session === session);
}

export async function confirmAttendance(
  courseId: number, ciclo: number, session?: 1 | 2,
) {
  const existing = await getAttendanceMark(courseId, ciclo, session);
  const confirmedAt = new Date().toISOString();
  if (existing) {
    await db.attendanceMarks.update(existing.id!, { confirmedAt });
    return existing.id!;
  }
  const course = await db.courses.get(courseId);
  const row: Omit<AttendanceMark, 'id'> = {
    courseId,
    courseCode: course?.code ?? '',
    ciclo,
    confirmedAt,
  };
  if (session != null) row.session = session;
  return (await db.attendanceMarks.add(row)) as number;
}

export async function unconfirmAttendance(
  courseId: number, ciclo: number, session?: 1 | 2,
) {
  await db.transaction('rw', db.attendanceMarks, db.syncTombstones, async () => {
    const existing = await getAttendanceMark(courseId, ciclo, session);
    if (existing?.id) await db.attendanceMarks.delete(existing.id);
  });
}

/**
 * Actualiza F/R de una sesión específica de 11° y recalcula el consolidado del
 * ciclo. La consolidación de la justificación no es un OR como la de la marca:
 * ver `consolidateSessions`.
 */
export async function updateSessionAttendance(
  studentId: number,
  ciclo: number,
  session: 1 | 2,
  field: MarkKind,
  state: MarkState,
) {
  const s = await db.students.get(studentId);
  if (!s) return;
  const c = s.cycles.find(x => x.ciclo === ciclo);
  if (!c) return;
  c.S1 ??= { F: false, R: false, N: 0 };
  c.S2 ??= { F: false, R: false, N: 0 };
  const target = session === 1 ? c.S1 : c.S2;
  const jField = justFieldOf(field);
  if (sessionMarkState(target, field) === state) return;

  target[field] = state !== 'none';
  target[jField] = state === 'justificada';

  const rolled = consolidateSessions([c.S1, c.S2], field);
  c[field] = rolled.on;
  c[jField] = rolled.justified;

  await db.transaction('rw', db.students, db.changeLog, async () => {
    await db.students.update(studentId, { cycles: s.cycles });
    await db.changeLog.add({
      courseId: s.courseId,
      courseCode: s.courseCode,
      studentId,
      studentSyncId: s.syncId,
      studentName: s.nombre,
      at: new Date().toISOString(),
      kind: 'attendance',
      ciclo,
      summary: `Ciclo ${ciclo} · S${session} · ${markDescription(field, state)}`,
    });
  });
}

// ---- Diagnóstico y reparación ----

export interface DuplicateReport {
  code: string;
  ids: number[];
  studentCounts: number[];
}

/** Lista los códigos de curso que aparecen más de una vez en la base local. */
export async function findDuplicateCourses(): Promise<DuplicateReport[]> {
  const all = await db.courses.toArray();
  const byCode = new Map<string, Course[]>();
  for (const c of all) {
    const arr = byCode.get(c.code) ?? [];
    arr.push(c);
    byCode.set(c.code, arr);
  }
  const out: DuplicateReport[] = [];
  for (const [code, rows] of byCode) {
    if (rows.length < 2) continue;
    const counts: number[] = [];
    for (const r of rows) {
      counts.push(await db.students.where('courseId').equals(r.id!).count());
    }
    out.push({ code, ids: rows.map(r => r.id!), studentCounts: counts });
  }
  return out;
}

/**
 * Colapsa los cursos duplicados en uno solo (se queda con el id más bajo) y
 * reapunta a él a los estudiantes, marcas de asistencia y changeLog.
 *
 * Corre con tombstones suprimidas: los duplicados son basura local, no
 * eliminaciones que deban propagarse al servidor.
 */
export async function mergeDuplicateCourses(): Promise<number> {
  const dups = await findDuplicateCourses();
  if (dups.length === 0) return 0;

  let merged = 0;
  await withoutTombstone(async () => {
    await db.transaction(
      'rw',
      db.courses, db.students, db.attendanceMarks, db.changeLog, db.syncTombstones,
      async () => {
        for (const d of dups) {
          const keep = Math.min(...d.ids);
          const drop = d.ids.filter(id => id !== keep);
          for (const name of ['students', 'attendanceMarks', 'changeLog'] as const) {
            await db.table(name)
              .where('courseId').anyOf(drop)
              .modify({ courseId: keep, courseCode: d.code });
          }
          await db.courses.bulkDelete(drop);
          merged += drop.length;
        }
      },
    );
  });
  return merged;
}

/**
 * Reasigna estudiantes a su curso correcto usando un mapa
 * `nombreNormalizado → códigoDeCurso` sacado de la planilla original.
 * Es la salida para bases que ya quedaron cruzadas antes del fix.
 */
export async function repairStudentCourses(
  nameToCode: Map<string, string>,
): Promise<{ fixed: number; unmatched: string[] }> {
  const codeToId = await getCourseIdByCodeMap();
  const unmatched: string[] = [];
  let fixed = 0;

  await db.transaction('rw', db.students, async () => {
    const all = await db.students.toArray();
    for (const s of all) {
      const code = nameToCode.get(normalizeName(s.nombre));
      if (!code) { unmatched.push(s.nombre); continue; }
      const id = codeToId.get(code);
      if (id == null) { unmatched.push(s.nombre); continue; }
      if (s.courseId === id && s.courseCode === code) continue;
      await db.students.update(s.id!, { courseId: id, courseCode: code });
      fixed++;
    }
  });
  return { fixed, unmatched };
}


// ---- Hidratación de COD_ALUM desde planilla-v2 ----

export interface CodAlumReport {
  /** Cursos del JSON que existen en la app. */
  coursesMatched: number;
  /** Cursos del JSON que la app no tiene (¿otro año? ¿no los dictas?). */
  coursesNotInApp: string[];
  /** Estudiantes a los que se les escribió el código. */
  hydrated: number;
  /** Ya tenían el código correcto; no se tocaron. */
  alreadyCorrect: number;
  /** Match por typo: el nombre difiere entre la app y la plataforma. */
  fuzzyMatched: { course: string; app: string; platform: string; cod: string }[];
  /** El código cambió respecto al que ya tenía la fila (rematrícula, corrección). */
  changed: { course: string; nombre: string; from: string; to: string }[];
  /** Activos en la app sin contraparte en la plataforma → posibles retirados. */
  notInPlatform: { course: string; nombre: string }[];
  /** En la plataforma pero no en la app → ingresos nuevos por importar. */
  notInApp: { course: string; nombre: string; cod: string }[];
}

/**
 * Escribe el COD_ALUM del JSON del extractor sobre las filas de `students`.
 *
 * El match es por curso + nombre normalizado, con fuzzy como respaldo para los
 * typos entre la Planilla del docente y el registro del colegio (el mismo
 * problema que ya resolvía el exportador, pero ahora se corrige una sola vez y
 * queda persistido en la fila en vez de recalcularse en cada exportación).
 *
 * Solo toca `codAlum`: nombres, notas, ciclos y observaciones no se pisan. Los
 * retirados quedan fuera del match para no revivirlos ni contaminar el reporte.
 */
export async function hydrateCodAlum(parsed: ParsedCodAlum): Promise<CodAlumReport> {
  const report: CodAlumReport = {
    coursesMatched: 0, coursesNotInApp: [],
    hydrated: 0, alreadyCorrect: 0,
    fuzzyMatched: [], changed: [],
    notInPlatform: [], notInApp: [],
  };

  for (const pc of parsed.courses) {
    const course = await getCourseByCode(pc.cod_cur);
    if (!course?.id) {
      report.coursesNotInApp.push(pc.cod_cur);
      continue;
    }
    report.coursesMatched++;

    const students = (await db.students.where('courseId').equals(course.id).toArray())
      .filter(s => !s.withdrawnAt);

    // Índice de la app por nombre normalizado. Los homónimos dentro de un curso
    // son raros pero posibles; se resuelven en orden de aparición.
    const byName = new Map<string, typeof students>();
    for (const s of students) {
      const k = normalizeName(s.nombre);
      const arr = byName.get(k) ?? [];
      arr.push(s);
      byName.set(k, arr);
    }
    const appNames = [...byName.keys()];
    const consumed = new Set<number>();

    for (const ps of pc.estudiantes) {
      const pname = normalizeName(ps.nombre);
      let bucket = byName.get(pname);
      let viaFuzzy: string | null = null;

      if (!bucket || bucket.every(s => consumed.has(s.id!))) {
        const candidate = findFuzzyMatch(pname, appNames);
        if (candidate) {
          const alt = byName.get(candidate);
          if (alt && alt.some(s => !consumed.has(s.id!))) {
            bucket = alt;
            viaFuzzy = candidate;
          }
        }
      }

      const hit = bucket?.find(s => !consumed.has(s.id!));
      if (!hit) {
        report.notInApp.push({ course: pc.cod_cur, nombre: ps.nombre, cod: ps.cod_alum });
        continue;
      }
      consumed.add(hit.id!);

      if (viaFuzzy) {
        report.fuzzyMatched.push({
          course: pc.cod_cur, app: hit.nombre, platform: ps.nombre, cod: ps.cod_alum,
        });
      }

      if (hit.codAlum === ps.cod_alum) {
        report.alreadyCorrect++;
        continue;
      }
      if (hit.codAlum) {
        report.changed.push({
          course: pc.cod_cur, nombre: hit.nombre, from: hit.codAlum, to: ps.cod_alum,
        });
      }
      await db.students.update(hit.id!, { codAlum: ps.cod_alum });
      report.hydrated++;
    }

    for (const s of students) {
      if (!consumed.has(s.id!)) {
        report.notInPlatform.push({ course: pc.cod_cur, nombre: s.nombre });
      }
    }
  }

  return report;
}

/**
 * Clave de identidad de un estudiante dentro de un curso. Si el nombre ya
 * apareció, se le agrega un sufijo `#2`, `#3`… para que dos homónimos no
 * colapsen en el mismo syncId.
 */
function dedupKey(nombre: string, seen: Map<string, number>): string {
  const base = normalizeName(nombre);
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
}

/**
 * Cuánta información capturada en la app tiene una fila de estudiante.
 * Se usa para decidir cuál copia sobrevive al deduplicar: si las notas
 * quedaron repartidas entre dos duplicados, se conserva la más completa.
 */
export function studentDataScore(s: Student): number {
  const notas = Object.values(s.subnotas ?? {}).filter(v => v > 0).length;
  const ciclos = (s.cycles ?? []).filter(c => c.F || c.R || c.nota > 0).length;
  const obs = Object.keys(s.noteObservations ?? {}).length;
  return notas + ciclos + obs;
}

export interface DedupeReport {
  removed: number;
  merged: number;                     // campos rescatados de la copia perdedora
  affectedCourses: string[];
}

/**
 * Colapsa estudiantes duplicados dentro de un mismo curso (match por nombre
 * normalizado). Conserva la fila con más datos y, antes de borrar las otras,
 * rescata de ellas las notas y ciclos que a la ganadora le falten — cuando el
 * duplicado se creó a mitad de trimestre, las notas quedan repartidas.
 *
 * Los deletes SÍ generan lápidas: son filas basura que también hay que eliminar
 * del servidor.
 */
export async function dedupeStudents(): Promise<DedupeReport> {
  const report: DedupeReport = { removed: 0, merged: 0, affectedCourses: [] };
  const all = await db.students.toArray();

  const groups = new Map<string, Student[]>();
  for (const s of all) {
    const key = `${s.courseId}::${normalizeName(s.nombre)}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const courses = new Set<string>();

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => studentDataScore(b) - studentDataScore(a) || (a.id! - b.id!));
    const [keep, ...drop] = rows;

    const subnotas = { ...(keep.subnotas ?? {}) };
    const cycles = (keep.cycles ?? []).map(c => ({ ...c }));
    const obs = { ...(keep.noteObservations ?? {}) };
    let mergedFields = 0;

    for (const d of drop) {
      for (const [k, v] of Object.entries(d.subnotas ?? {})) {
        if (v > 0 && !(subnotas[k] > 0)) { subnotas[k] = v; mergedFields++; }
      }
      for (const dc of d.cycles ?? []) {
        const target = cycles.find(c => c.ciclo === dc.ciclo);
        if (!target) continue;
        if (dc.nota > 0 && target.nota === 0) { target.nota = dc.nota; mergedFields++; }
        // La justificación viaja con la marca: rescatarla aparte dejaría un
        // (F=false, Fj=true) sin sentido en la fila ganadora.
        if (dc.F && !target.F) { target.F = true; target.Fj = dc.Fj; mergedFields++; }
        if (dc.R && !target.R) { target.R = true; target.Rj = dc.Rj; mergedFields++; }
      }
      for (const [k, v] of Object.entries(d.noteObservations ?? {})) {
        if (v && !obs[k]) { obs[k] = v; mergedFields++; }
      }
      if (!keep.codAlum && d.codAlum) keep.codAlum = d.codAlum;
    }

    await db.transaction('rw', db.students, db.syncTombstones, async () => {
      await db.students.update(keep.id!, {
        subnotas, cycles, noteObservations: obs, codAlum: keep.codAlum,
      });
      await db.students.bulkDelete(drop.map(d => d.id!));
    });

    report.removed += drop.length;
    report.merged += mergedFields;
    if (keep.courseCode) courses.add(keep.courseCode);
  }

  report.affectedCourses = [...courses].sort();
  return report;
}