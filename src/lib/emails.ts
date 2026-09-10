/**
 * Generador de correos de seguimiento.
 *
 * Sin IA: el texto sale de una plantilla fija y lo que personaliza cada correo
 * son las observaciones que el docente ya escribió en la planilla y en la
 * asistencia. Por eso este módulo depende de que esas razones existan — un
 * correo que solo dice "sacó 30" no le sirve a nadie.
 *
 * No dispara por cada 30 suelto sino por REINCIDENCIA, que es lo que amerita
 * escribir a la casa. Son tres situaciones y un solo correo por estudiante con
 * las secciones que apliquen.
 */

import { NOTA_MIN } from './constants';
import type { Student, Course, CycleData, EmailLog, Achievement } from '@/types';

export interface EmailThresholds {
  /** Cuántas notas en el piso para considerarlo reincidencia. */
  notas30: number;
  /** Cuántos retardos INJUSTIFICADOS. */
  retardos: number;
  /** Cuántas inasistencias (justificadas incluidas: igual hay que recuperar). */
  fallas: number;
}

export const UMBRALES_POR_DEFECTO: EmailThresholds = {
  notas30: 2, retardos: 3, fallas: 1,
};

/** Una ocurrencia de falla o retardo, ya resuelta a nivel de clase. */
export interface Ocurrencia {
  ciclo: number;
  /** Null si el ciclo trae una sola clase del curso. */
  session: number | null;
  justificada: boolean;
  obs: string;
}

export interface NotaBaja {
  column: string;
  logro: string;
  nota: number;
  obs: string;
}

export interface EmailCandidate {
  studentSyncId: string;
  nombre: string;
  email?: string;
  notas30: NotaBaja[];
  retardos: Ocurrencia[];              // solo injustificados
  fallas: Ocurrencia[];                // todas
  /** Motivos por los que entró a la lista. */
  motivos: ('academico' | 'retardos' | 'inasistencia')[];
  /** Último correo generado, si lo hubo. */
  previo?: EmailLog;
  /** Acumuló más desde el último correo. */
  reincidio: boolean;
}

/**
 * Saca las ocurrencias de falla o retardo de un ciclo.
 *
 * Si el ciclo trae marcas por sesión se devuelven por separado (son días
 * distintos); si no, la marca es del ciclo entero. No hace falta el horario:
 * basta con lo que quedó guardado.
 */
function ocurrencias(c: CycleData, kind: 'F' | 'R'): Ocurrencia[] {
  const jKey = kind === 'F' ? 'Fj' : 'Rj';
  const porSesion: Ocurrencia[] = [];
  for (const [n, sd] of [[1, c.S1], [2, c.S2]] as const) {
    if (sd?.[kind]) {
      porSesion.push({
        ciclo: c.ciclo, session: n,
        justificada: !!sd[jKey], obs: (sd.obs ?? '').trim(),
      });
    }
  }
  if (porSesion.length > 0) return porSesion;
  if (!c[kind]) return [];
  return [{
    ciclo: c.ciclo, session: null,
    justificada: !!c[jKey], obs: (c.obs ?? '').trim(),
  }];
}

/**
 * Estudiantes que ameritan correo, con el detalle de por qué.
 *
 * A un estudiante con correo previo solo se le vuelve a listar si acumuló más
 * desde entonces: la comparación es contra los conteos guardados, no contra la
 * fecha, porque lo que importa no es cuánto pasó sino si volvió a pasar.
 */
export function buildEmailCandidates(
  course: Course,
  students: Student[],
  thresholds: EmailThresholds,
  logs: EmailLog[],
): EmailCandidate[] {
  const titulo = new Map(
    (course.achievements ?? [])
      .filter((a: Achievement) => a.column && a.title)
      .map((a: Achievement) => [a.column, a.title]),
  );
  // Solo el correo más reciente de cada estudiante en este trimestre.
  const ultimo = new Map<string, EmailLog>();
  for (const l of logs) {
    if (l.courseCode !== course.code || l.trimestre !== course.trimestre) continue;
    const prev = ultimo.get(l.studentSyncId);
    if (!prev || l.at > prev.at) ultimo.set(l.studentSyncId, l);
  }

  const out: EmailCandidate[] = [];

  for (const s of students) {
    if (s.withdrawnAt) continue;

    const notas30: NotaBaja[] = [];
    // El piso se detecta por columna real, no por slot: C4 alimenta dos slots
    // con el mismo valor y contarlo dos veces inflaría la reincidencia.
    const vistas = new Set<string>();
    for (const [slot, valor] of Object.entries(s.subnotas ?? {})) {
      if (valor !== NOTA_MIN) continue;
      const column = slot.split('_')[1];
      if (!column || vistas.has(column)) continue;
      vistas.add(column);
      notas30.push({
        column,
        logro: titulo.get(column) ?? '',
        nota: valor,
        obs: (s.noteObservations?.[column] ?? '').trim(),
      });
    }
    notas30.sort((a, b) => a.column.localeCompare(b.column));

    const todosRetardos = (s.cycles ?? []).flatMap(c => ocurrencias(c, 'R'));
    const retardos = todosRetardos.filter(o => !o.justificada);
    const fallas = (s.cycles ?? []).flatMap(c => ocurrencias(c, 'F'));

    const motivos: EmailCandidate['motivos'] = [];
    if (notas30.length >= thresholds.notas30) motivos.push('academico');
    if (retardos.length >= thresholds.retardos) motivos.push('retardos');
    if (fallas.length >= thresholds.fallas) motivos.push('inasistencia');
    if (motivos.length === 0) continue;

    const previo = s.syncId ? ultimo.get(s.syncId) : undefined;
    const reincidio = !previo
      || notas30.length > previo.notas30
      || retardos.length > previo.retardos
      || fallas.length > previo.fallas;

    out.push({
      studentSyncId: s.syncId ?? '',
      nombre: s.nombre,
      email: s.email,
      notas30, retardos, fallas, motivos,
      previo, reincidio,
    });
  }

  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * A quién se le habla. Cambia el pronombre y el tono, no los datos.
 *
 * El de no entrega va al estudiante porque la acción es suya —adelantar el
 * trabajo—, mientras que reincidencia de retardos o inasistencia es
 * información para la casa.
 */
export type Voz = 'estudiante' | 'acudiente';

/** Voz sugerida: al estudiante si lo único que pasa es que no entregó. */
export function vozSugerida(c: EmailCandidate): Voz {
  return c.motivos.length === 1 && c.motivos[0] === 'academico'
    ? 'estudiante' : 'acudiente';
}

export const PLANTILLA_ESTUDIANTE = `Hola {estudiante},

Te escribo por tu desempeño en Informática durante el trimestre {trimestre}.

{secciones}
Aún estás a tiempo de recuperar tu nota. Si tienes dudas sobre qué hacer o hasta cuándo, escríbeme o búscame en clase.

{docente}`;

export const ASUNTO_ESTUDIANTE = '{curso} · Informática — Tienes trabajos pendientes';

/** Plantilla por defecto. `{secciones}` la arma el generador. */
export const PLANTILLA_POR_DEFECTO = `Cordial saludo.

Me permito informarle sobre la situación de {estudiante}, del curso {curso}, en la asignatura de Informática durante el trimestre {trimestre}.

{secciones}
Agradezco su acompañamiento para superar esta situación. Quedo atento a cualquier inquietud.

Cordialmente,
{docente}`;

export const ASUNTO_POR_DEFECTO = '{curso} · Informática — Seguimiento de {estudiante}';

function listaCiclos(os: Ocurrencia[]): string {
  const unicos = [...new Set(os.map(o => o.ciclo))].sort((a, b) => a - b);
  return unicos.map(c => `ciclo ${c}`).join(', ');
}

/** Arma las secciones que apliquen, en orden fijo y en la voz pedida. */
function componerSecciones(c: EmailCandidate, voz: Voz): string {
  const tu = voz === 'estudiante';
  const partes: string[] = [];

  if (c.motivos.includes('academico')) {
    const items = c.notas30.map(n => {
      const nombre = n.logro ? `${n.column} — ${n.logro}` : n.column;
      const razon = n.obs ? `\n    Observación: ${n.obs}` : '';
      return `  • ${nombre}: ${n.nota}${razon}`;
    });
    partes.push(tu
      ? `Estas actividades están en la nota mínima (${NOTA_MIN}) porque no las has `
        + `entregado o no las has sustentado:\n${items.join('\n')}`
      : `Actividades con la nota mínima (${NOTA_MIN}), que corresponden a trabajos `
        + `no entregados o sin sustentar:\n${items.join('\n')}`);
  }

  if (c.motivos.includes('retardos')) {
    const items = c.retardos.map(o => {
      const donde = `ciclo ${o.ciclo}${o.session ? ` (sesión ${o.session})` : ''}`;
      return `  • ${donde}${o.obs ? ` — ${o.obs}` : ''}`;
    });
    partes.push(tu
      ? `Tienes ${c.retardos.length} retardos injustificados:\n${items.join('\n')}`
      : `Retardos injustificados registrados (${c.retardos.length}):\n${items.join('\n')}`);
  }

  if (c.motivos.includes('inasistencia')) {
    partes.push(tu
      ? `No asististe a: ${listaCiclos(c.fallas)}.\n`
        + 'Para ponerte al día, la guía de cada ciclo está publicada en Classroom, '
        + 'en la sección RESOURCES.'
      : `Clases a las que no asistió: ${listaCiclos(c.fallas)}.\n`
        + 'Para ponerse al día, la guía de cada ciclo está publicada en Classroom, '
        + 'en la sección RESOURCES.');
  }

  return partes.join('\n\n') + '\n';
}

export interface CorreoRenderizado {
  asunto: string;
  cuerpo: string;
}

export function renderEmail(
  c: EmailCandidate,
  course: Course,
  docente: string,
  plantilla = PLANTILLA_POR_DEFECTO,
  asuntoTpl = ASUNTO_POR_DEFECTO,
  voz: Voz = 'acudiente',
): CorreoRenderizado {
  const vars: Record<string, string> = {
    estudiante: c.nombre,
    curso: course.code,
    trimestre: String(course.trimestre),
    docente: docente || '(tu nombre)',
    secciones: componerSecciones(c, voz),
  };
  const sustituir = (t: string) =>
    t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return { asunto: sustituir(asuntoTpl), cuerpo: sustituir(plantilla) };
}
