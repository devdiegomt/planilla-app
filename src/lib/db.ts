import Dexie, { Table } from 'dexie';
import type {
  Course, Student, Todo, CalendarEvent,
  ScheduleBlock, CalendarDay, YearConfig,
  AttendanceMark, ChangeLog,
} from '@/types';

/** Registro local de una eliminación pendiente de propagar al servidor. */
export interface SyncTombstone {
  id?: number;
  tableName: string;
  syncId: string;
  deletedAt: string;                  // ISO datetime local
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

  }
}

export const db = new PlanillaDB();

/**
 * Bandera para saltar el hook 'deleting' cuando la eliminación viene del pull
 * (aplicando una tombstone remota). El motor sync la levanta con
 * `withoutTombstone(async () => { ... })` antes de borrar.
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
      row.updatedAt = new Date().toISOString();
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

/** Reemplaza un curso completo (borra estudiantes previos e inserta los nuevos). */
export async function upsertCourseWithStudents(
  course: Omit<Course, 'id'>,
  students: Omit<Student, 'id' | 'courseId'>[]
): Promise<number> {
  return db.transaction('rw', db.courses, db.students, db.syncTombstones, async () => {
    const existing = await getCourseByCode(course.code);
    let courseId: number;
    if (existing) {
      courseId = existing.id!;
      await db.courses.update(courseId, { ...course, updatedAt: new Date().toISOString() });
      await db.students.where('courseId').equals(courseId).delete();
    } else {
      courseId = await db.courses.add({ ...course, updatedAt: new Date().toISOString() }) as number;
    }
    await db.students.bulkAdd(students.map(s => ({ ...s, courseId })));
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
      studentId,
      studentName: s.nombre,
      at: new Date().toISOString(),
      kind: 'nota',
      summary: `${column}: ${prev}→${value}`,
    });
  });
}

/** Actualiza F/R de un ciclo (8°–10°) y registra el cambio. */
export async function updateAttendance(
  studentId: number,
  cycle: number,
  field: 'F' | 'R',
  value: boolean
) {
  const s = await db.students.get(studentId);
  if (!s) return;
  const c = s.cycles.find(c => c.ciclo === cycle);
  if (!c) return;
  if (c[field] === value) return;
  c[field] = value;
  await db.transaction('rw', db.students, db.changeLog, async () => {
    await db.students.update(studentId, { cycles: s.cycles });
    await db.changeLog.add({
      courseId: s.courseId,
      studentId,
      studentName: s.nombre,
      at: new Date().toISOString(),
      kind: 'attendance',
      ciclo: cycle,
      summary: `Ciclo ${cycle} · ${field} ${value ? 'on' : 'off'}`,
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
  const row: Omit<AttendanceMark, 'id'> = { courseId, ciclo, confirmedAt };
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
 * Actualiza F/R de una sesión específica de 11°, recalcula el consolidado
 * del ciclo (F = S1.F || S2.F, idem R) y registra el cambio.
 */
export async function updateSessionAttendance(
  studentId: number,
  ciclo: number,
  session: 1 | 2,
  field: 'F' | 'R',
  value: boolean,
) {
  const s = await db.students.get(studentId);
  if (!s) return;
  const c = s.cycles.find(x => x.ciclo === ciclo);
  if (!c) return;
  c.S1 ??= { F: false, R: false, N: 0 };
  c.S2 ??= { F: false, R: false, N: 0 };
  const target = session === 1 ? c.S1 : c.S2;
  if (target[field] === value) return;
  target[field] = value;
  c.F = (c.S1.F || c.S2.F);
  c.R = (c.S1.R || c.S2.R);
  await db.transaction('rw', db.students, db.changeLog, async () => {
    await db.students.update(studentId, { cycles: s.cycles });
    await db.changeLog.add({
      courseId: s.courseId,
      studentId,
      studentName: s.nombre,
      at: new Date().toISOString(),
      kind: 'attendance',
      ciclo,
      summary: `Ciclo ${ciclo} · S${session} · ${field} ${value ? 'on' : 'off'}`,
    });
  });
}
