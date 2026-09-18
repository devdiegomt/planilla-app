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
  /** Razón de la falla o el retardo de ESTA sesión. */
  obs?: string | null;
  /** Marcado por el docente al ver llegar al estudiante. Ver `CycleData.arrived`. */
  arrived?: boolean;
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
  /**
   * Razón de la falla o el retardo del ciclo. Cuando el ciclo trae dos clases
   * del curso, la razón vive en `S1.obs` / `S2.obs` porque son días distintos.
   */
  obs?: string | null;
  /** Solo en 11°: nota de sesión 1. */
  S1?: SessionData;
  /** Solo en 11°: nota de sesión 2. */
  S2?: SessionData;
  /**
   * "Ya llegó": chequeo de uso en vivo para ver de un vistazo quién falta por
   * entrar al salón. NO se exporta a Classroom Live — es una ayuda del docente,
   * no un registro oficial. Que no sea lo contrario de `F` es deliberado:
   * al empezar la clase nadie está marcado, y eso no significa que todos
   * hayan faltado.
   */
  arrived?: boolean;
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
  /**
   * Correo del estudiante (el canal para hablar con los acudientes).
   * Sale del roster de Google Classroom; ausente hasta que se importe.
   */
  email?: string;
  syncId?: string;                    // UUID estable cross-device (sync)
  updatedAt?: string;                 // ISO datetime del último cambio local
}

/**
 * Nombre real de un logro, leído de la plantilla Califica.
 * La plataforma lo identifica con `log`; la app lo asocia a su columna (C4, C7…).
 */
export interface Achievement {
  column: string;                     // 'C4'
  log: string;                        // 'log_21'
  title: string;                      // 'ORGANIZING CONTENT WITH BASIC LAYOUT'
  /**
   * Encabezado completo tal como lo escribe la plataforma
   * ('CONOCIMIENTO T3 - C4. CONDITIONAL STATEMENTS.'). Es lo que va en el
   * Califica exportado; trae embebido el trimestre.
   */
  desc?: string;
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
  /**
   * Nombres de los logros del trimestre, leídos de la plantilla Califica en la
   * última exportación. Ausente hasta que se exporte por primera vez.
   */
  achievements?: Achievement[];
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

/**
 * Algo que pasa en una fecha y no todas las semanas: una entrega, una reunión
 * de proyecto de esta semana, un reemplazo de mañana.
 *
 * Es de una FECHA, no de un tipo de día, y ahí está la diferencia con
 * `ScheduleBlock`: el horario se repite en cada vuelta de la rotación y esto
 * ocurre una vez y se vence solo. Con `startTime` cae en su franja del día
 * junto a las clases; sin hora, es de todo el día. `endDate` es para lo que
 * dura varios días seguidos (una semana de proyecto, un encargo mientras
 * alguien no está).
 */
export interface CalendarEvent {
  id?: number;
  date: string;                       // ISO, el primer día
  endDate?: string;                   // ISO, el último; ausente = solo `date`
  title: string;
  description?: string;
  courseCode?: string;
  startTime?: string;                 // 'HH:mm'; ausente = todo el día
  endTime?: string;                   // 'HH:mm'
  kind: 'entrega' | 'actividad' | 'reemplazo' | 'festivo' | 'otro';
  syncId?: string;
  updatedAt?: string;
}

/** Tipos de día del calendario académico GLA (D1..D5 rotativos + FIJO viernes). */
export type DayType = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'FIJO';

/** Un bloque en el horario: qué curso, en qué tipo de día, en qué orden. */
/**
 * Qué ocupa una franja. Ausente = 'clase': las filas anteriores a este campo
 * son todas clases, y así no hace falta migrarlas.
 *
 * Solo 'clase' cuenta para ciclos, asistencia, Califica y recordatorios. Un
 * reemplazo de otro curso va como 'evento' con el curso en `title`, NUNCA en
 * `courseCode`: `courseSessionDates` numera los ciclos de un curso a partir de
 * los tipos de día en que aparece su código, así que meterlo ahí le correría
 * la numeración de ciclos a ese curso.
 */
export type BlockKind = 'clase' | 'evento' | 'descanso';

export interface ScheduleBlock {
  id?: number;
  dayType: DayType;
  block: number;                      // 1..6 posición dentro del día
  courseCode: string;                 // '801', '1101', etc. Vacío si no es clase.
  startTime: string;                  // 'HH:mm'
  endTime: string;                    // 'HH:mm'
  room?: string;
  kind?: BlockKind;                   // ausente = 'clase'
  title?: string;                     // rótulo cuando no es un curso ('RDA', 'Reemplazo 903')
  note?: string;                      // nota libre, también sobre una clase
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
/**
 * Una materia que el docente dicta en un grado.
 *
 * Reemplaza la constante `GRADE_META`, que fijaba Informática de 8° a 11° y
 * dejaba fuera a cualquier otro docente. `codMat` es el código de la
 * plataforma (2508, 3011…) y `materia` el nombre como aparece en la lista de
 * asignaturas de Classroom Live — el autofill lo compara contra ese texto.
 */
export interface SubjectConfig {
  grade: number;
  codMat: string;
  materia: string;
}

export interface YearConfig {
  id?: number;
  year: number;
  /** Materias por grado. Ausente en bases anteriores a la v13. */
  subjects?: SubjectConfig[];
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

/**
 * Foto de un estudiante al cerrar un trimestre.
 *
 * El modelo vivo solo tiene un trimestre a la vez: `subnotas` es un mapa plano
 * de slots y `cycles` son nueve ciclos sin más. Al cerrar se archiva aquí y la
 * planilla queda en blanco para el siguiente.
 *
 * La referencia al estudiante es `studentSyncId` y no el id local de Dexie,
 * que no significa nada fuera de la base que lo generó. El nombre y el código
 * van denormalizados para poder leer el histórico aunque el estudiante ya no
 * esté matriculado.
 */
export interface TrimesterSnapshot {
  id?: number;
  studentSyncId: string;
  courseCode: string;
  year: number;
  trimestre: number;
  nombre: string;
  codAlum: string;
  subnotas: Record<string, number>;
  cycles: CycleData[];
  noteObservations?: Record<string, string>;
  /** Definitiva calculada al cerrar, para no depender de la fórmula futura. */
  definitiva: number;
  closedAt: string;                   // ISO datetime
  syncId?: string;
  updatedAt?: string;
}

/**
 * Correo de seguimiento ya generado para un estudiante.
 *
 * Guarda los conteos del momento, no solo la fecha: así se sabe si desde
 * entonces **reincidió**. Sin ese corte habría que elegir entre volver a
 * listarlo cada semana por los mismos tres retardos, o no volver a listarlo
 * nunca aunque acumule más.
 */
export interface EmailLog {
  id?: number;
  studentSyncId: string;
  courseCode: string;
  year: number;
  trimestre: number;
  nombre: string;                     // denormalizado, para leer sin join
  /** Conteos al generar, contra los que se compara la reincidencia. */
  notas30: number;
  retardos: number;
  fallas: number;
  at: string;                         // ISO datetime
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
  /** Logros leídos de la plantilla, ya validados contra el mapeo de la app. */
  achievements: Achievement[];
}