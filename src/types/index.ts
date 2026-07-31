/** Tipos del dominio de la app. */

/**
 * Justificación de una marca de asistencia.
 *
 * Se modela como una bandera aparte y no como un enum que reemplace a `F`/`R`
 * porque `cycles` no es un índice de Dexie: agregar campos opcionales al objeto
 * no necesita migración, y `undefined` significa exactamente lo que la app
 * asumía antes de existir este campo — injustificada. Así los sitios que ya
 * leían `c.F` siguen valiendo sin tocarse.
 *
 * Invariante: `Fj` solo tiene sentido con `F === true`. Los helpers de
 * `db.ts` limpian la justificación al apagar la marca.
 */

/** Datos de una sesión (solo aplica a 11°). */
export interface SessionData {
  F: boolean;   // falla
  R: boolean;   // retardo
  N: number;    // nota de la sesión
  /** Falla justificada. Ausente = injustificada. */
  Fj?: boolean;
  /** Retardo justificado. Ausente = injustificado. */
  Rj?: boolean;
}

/** Datos de un ciclo por estudiante. */
export interface CycleData {
  ciclo: number;              // 1..9
  F: boolean;
  R: boolean;
  /**
   * Falla justificada. En 11° es la consolidación de las sesiones: solo es
   * `true` si TODAS las sesiones con falla están justificadas — basta una sin
   * justificar para que el ciclo cuente en contra.
   */
  Fj?: boolean;
  /** Retardo justificado. Misma consolidación que `Fj` en 11°. */
  Rj?: boolean;
  nota: number;               // nota agregada del ciclo (0-100)
  obs?: string | null;
  /** Solo en 11°: nota de sesión 1. */
  S1?: SessionData;
  /** Solo en 11°: nota de sesión 2. */
  S2?: SessionData;
}

/** Registro persistente de estudiante. */
export interface Student {
  id?: number;
  /**
   * Id LOCAL de Dexie. NO se sincroniza: en otra base el mismo número apunta a
   * otro curso. Se recalcula en cada pull a partir de `courseCode`.
   */
  courseId: number;
  /** Relación real con el curso ('801', '1101'). Estable entre dispositivos. */
  courseCode: string;
  codAlum: string;                    // 10 dígitos únicos del colegio
  nombre: string;
  order: number;                      // posición en la lista original
  activeFrom?: string;                // ISO date opcional
  withdrawnAt?: string | null;        // null si sigue matriculado
  cycles: CycleData[];                // 9 items
  subnotas: Record<string, number>;   // 10 (o 11 para 11°) claves
  noteObservations?: Record<string, string>;  // {C4: "razón...", C7: "..."} — por columna real
  syncId?: string;                    // UUID estable cross-device (sync)
  updatedAt?: string;                 // ISO datetime del último cambio local
}

/** Registro persistente de curso. */
export interface Course {
  id?: number;
  code: string;                       // '801', '1101', etc.
  grade: number;                      // 8, 9, 10, 11
  director: string;
  year: number;                       // 2026
  trimestre: number;                  // 1, 2, 3
  cyclesActive: boolean[];            // 9 items
  updatedAt: string;                  // ISO — timestamp del último cambio (usado por sync)
  syncId?: string;                    // UUID estable cross-device (sync)
}

/** Item de to-do (para v2, ya lo dejamos preparado). */
export interface Todo {
  id?: number;
  title: string;
  status: 'pending' | 'done';
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
  courseCode?: string;
  syncId?: string;
  updatedAt?: string;
}

/** Evento de calendario (para v2). */
export interface CalendarEvent {
  id?: number;
  date: string;                       // ISO
  title: string;
  description?: string;
  courseCode?: string;
  kind: 'entrega' | 'actividad' | 'festivo' | 'otro';
  syncId?: string;
  updatedAt?: string;
}

/** Tipos de día del calendario académico GLA (D1..D5 rotativos + FIJO viernes). */
export type DayType = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'FIJO';

/** Un bloque en el horario: qué curso, en qué tipo de día, en qué orden. */
export interface ScheduleBlock {
  id?: number;
  dayType: DayType;
  block: number;                      // 1..6 posición dentro del día
  courseCode: string;                 // '801', '1101', etc.
  startTime: string;                  // 'HH:mm'
  endTime: string;                    // 'HH:mm'
  room?: string;
  syncId?: string;
  updatedAt?: string;
}

/**
 * Estado o override de una fecha específica.
 * Solo se persisten fechas con algo distinto al default (festivos,
 * cancelaciones o forzar un tipo de día distinto al calculado).
 */
export interface CalendarDay {
  id?: number;
  date: string;                       // 'YYYY-MM-DD'
  status: 'lectivo' | 'festivo' | 'cancelado';
  overrideDayType?: DayType | null;   // fuerza el tipo de día si != null
  note?: string;
  syncId?: string;
  updatedAt?: string;
}

/** Configuración del año escolar (fecha de arranque + rotación inicial). */
export interface YearConfig {
  id?: number;
  year: number;
  startDate: string;                  // 'YYYY-MM-DD' primer día lectivo
  initialDayType: DayType;            // día tipo asignado al startDate
  trim1Start?: string;                // 'YYYY-MM-DD' inicio trimestre 1
  trim2Start?: string;                // 'YYYY-MM-DD' inicio trimestre 2
  trim3Start?: string;                // 'YYYY-MM-DD' inicio trimestre 3
  syncId?: string;
  updatedAt?: string;
}

/**
 * Marca de "sesión revisada": indica que el docente ya registró F/R para
 * ese ciclo (y sesión, en el caso de 11°). Ausencia = pendiente.
 *
 * Para 8°–10°: una marca por ciclo, `session` omitido.
 * Para 11°: hasta dos marcas por ciclo, `session` = 1 o 2.
 */
export interface AttendanceMark {
  id?: number;
  /** Id local, no se sincroniza (ver Student.courseId). */
  courseId: number;
  /** Relación estable con el curso. */
  courseCode: string;
  ciclo: number;                      // 1..9
  session?: 1 | 2;                    // solo aplicable a 11°
  confirmedAt: string;                // ISO datetime
  syncId?: string;
  updatedAt?: string;
}

/** Registro auditado de una edición en el curso. */
export interface ChangeLog {
  id?: number;
  /** Id local, no se sincroniza (ver Student.courseId). */
  courseId: number;
  /** Relación estable con el curso. */
  courseCode: string;
  /** Id local, no se sincroniza. */
  studentId: number;
  /** Relación estable con el estudiante (su syncId). */
  studentSyncId?: string;
  studentName: string;                // denormalizado para poder mostrar sin join
  at: string;                         // ISO datetime
  kind: 'nota' | 'attendance';
  ciclo?: number;                     // 1..9, solo attendance o nota-por-ciclo
  summary: string;                    // 'C4: 50→77' o 'Ciclo 3 · S1 · F on'
  syncId?: string;
  updatedAt?: string;
}

/** Resultado del cálculo de definitiva por estudiante. */
export interface DefResult {
  K: number;
  M: number;
  U: number;
  C: number;
  E: number;
  definitiva: number;
}

/** Reporte del exportador Califica. */
export interface ExportReport {
  ok: boolean;
  curso: number;
  nEstudiantesEscritos: number;
  estudiantesSinCodAlum: string[];
  typoMatches: { planilla: string; califica: string; cod: string }[];
  filename: string;
}