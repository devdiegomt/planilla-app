/** Tipos del dominio de la app. */

/** Datos de una sesión (solo aplica a 11°). */
export interface SessionData {
  F: boolean;   // falla
  R: boolean;   // retardo
  N: number;    // nota de la sesión
}

/** Datos de un ciclo por estudiante. */
export interface CycleData {
  ciclo: number;              // 1..9
  F: boolean;
  R: boolean;
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
  courseId: number;
  codAlum: string;                    // 10 dígitos únicos del colegio
  nombre: string;
  order: number;                      // posición en la lista original
  activeFrom?: string;                // ISO date opcional
  withdrawnAt?: string | null;        // null si sigue matriculado
  cycles: CycleData[];                // 9 items
  subnotas: Record<string, number>;   // 10 (o 11 para 11°) claves
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
  updatedAt: string;                  // ISO
}

/** Item de to-do (para v2, ya lo dejamos preparado). */
export interface Todo {
  id?: number;
  title: string;
  status: 'pending' | 'done';
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
  courseCode?: string;
}

/** Evento de calendario (para v2). */
export interface CalendarEvent {
  id?: number;
  date: string;                       // ISO
  title: string;
  description?: string;
  courseCode?: string;
  kind: 'entrega' | 'actividad' | 'festivo' | 'otro';
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
  courseId: number;
  ciclo: number;                      // 1..9
  session?: 1 | 2;                    // solo aplicable a 11°
  confirmedAt: string;                // ISO datetime
}

/** Registro auditado de una edición en el curso. */
export interface ChangeLog {
  id?: number;
  courseId: number;
  studentId: number;
  studentName: string;                // denormalizado para poder mostrar sin join
  at: string;                         // ISO datetime
  kind: 'nota' | 'attendance';
  ciclo?: number;                     // 1..9, solo attendance o nota-por-ciclo
  summary: string;                    // 'C4: 50→77' o 'Ciclo 3 · S1 · F on'
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
