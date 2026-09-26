import type { Student, Course, PlatformHistory, TrimesterSnapshot } from '@/types';
import { calcDef } from './formula';
import { slotsFor, type ConSlots } from './constants';

/**
 * El historial de definitivas que trae `historial-extractor` (planilla-v2).
 *
 * Puro y aparte de Dexie, igual que `studentMatch` y `pasteNotas`: acá se
 * decide a quién le toca cada nota, que es lo delicado, y se puede probar sin
 * navegador.
 *
 * **Nunca se aplica de una.** `planHistorialImport` arma un plan y no escribe:
 * la vista previa muestra a quién va a tocar y a quién no antes de confirmar.
 * Es la misma regla que con las notas pegadas de un Excel, y por la misma
 * razón: un emparejamiento silencioso que sale mal no se nota hasta que la
 * nota equivocada ya está en el boletín de otro.
 *
 * Acá el riesgo es menor que al pegar —el archivo trae el código, así que el
 * orden no importa— pero lo que sí puede pasar es que el archivo sea de otro
 * año, o que le falte medio curso, y eso hay que verlo antes.
 */

/** Los periodos de la plataforma. No existe el '04'; el '05' es el final. */
export const PERIODOS = ['01', '02', '03', '05'] as const;
export type Periodo = (typeof PERIODOS)[number];

export const PERIODO_FINAL: Periodo = '05';

/** '01' → trimestre 1. El final no es un trimestre y devuelve null. */
export function trimestreDe(periodo: string): number | null {
  const n = Number(periodo);
  return n >= 1 && n <= 3 ? n : null;
}

export const NOMBRE_PERIODO: Record<string, string> = {
  '01': 'T1', '02': 'T2', '03': 'T3', '05': 'Final',
};

// ---------------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------------

export interface HistorialArchivo {
  generadoEn: string;
  periodos: string[];
  cursos: {
    periodo: string;
    curso: string;
    estudiantes: { cod_alum: string; nombre: string; definitiva: number | null }[];
  }[];
  avisos: { motivo: string }[];
  errores: { curso?: string; periodo?: string; motivo: string }[];
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Valida la forma del JSON antes de mirar su contenido.
 *
 * Los mensajes nombran lo que el docente ve en pantalla, no la estructura: al
 * que se equivocó de archivo no le sirve "esperaba un array en cursos".
 */
export function parseHistorialJson(texto: string): HistorialArchivo {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new Error('Eso no parece el texto que copiaste del extractor. Copialo de nuevo completo.');
  }
  if (!esObjeto(crudo)) throw new Error('El contenido no tiene la forma esperada.');

  const cursos = crudo.cursos;
  if (!Array.isArray(cursos)) {
    throw new Error('No encontré los cursos. ¿Seguro copiaste el historial y no otra cosa?');
  }
  if (cursos.length === 0) {
    throw new Error('El historial vino vacío: no trae ningún curso.');
  }

  const limpios: HistorialArchivo['cursos'] = [];
  for (const c of cursos) {
    if (!esObjeto(c)) continue;
    const estudiantes = Array.isArray(c.estudiantes) ? c.estudiantes : [];
    limpios.push({
      periodo: String(c.periodo ?? '').trim(),
      curso: String(c.curso ?? '').trim(),
      estudiantes: estudiantes.filter(esObjeto).map((e) => ({
        cod_alum: String(e.cod_alum ?? '').trim(),
        nombre: String(e.nombre ?? '').trim(),
        definitiva: typeof e.definitiva === 'number' && Number.isFinite(e.definitiva)
          ? e.definitiva : null,
      })),
    });
  }

  if (limpios.every((c) => c.estudiantes.length === 0)) {
    throw new Error('Los cursos vinieron sin estudiantes. Revisá que la tabla se viera en pantalla al extraer.');
  }

  return {
    generadoEn: String(crudo.generadoEn ?? ''),
    periodos: Array.isArray(crudo.periodos) ? crudo.periodos.map(String) : [],
    cursos: limpios,
    avisos: Array.isArray(crudo.avisos)
      ? crudo.avisos.filter(esObjeto).map((a) => ({ motivo: String(a.motivo ?? '') })) : [],
    errores: Array.isArray(crudo.errores)
      ? crudo.errores.filter(esObjeto).map((e) => ({
          curso: e.curso ? String(e.curso) : undefined,
          periodo: e.periodo ? String(e.periodo) : undefined,
          motivo: String(e.motivo ?? ''),
        })) : [],
  };
}

// ---------------------------------------------------------------------------
// El plan
// ---------------------------------------------------------------------------

export interface CambioEstudiante {
  studentId: number;
  codAlum: string;
  nombre: string;
  /** Lo que va a quedar guardado, ya fusionado con lo que hubiera. */
  definitivas: Record<string, number>;
  /** Periodos que esta importación agrega o cambia. */
  periodosTocados: string[];
}

export interface CursoDelPlan {
  courseCode: string;
  /** Está en el archivo pero no en la app: sus notas no tienen dónde ir. */
  faltaEnApp: boolean;
  cambios: CambioEstudiante[];
  /** Códigos del archivo que no corresponden a ningún estudiante de la app. */
  noEnApp: { codAlum: string; nombre: string }[];
  /** Estudiantes de la app que el archivo no menciona: quedan como estaban. */
  noEnArchivo: { codAlum: string; nombre: string }[];
}

export interface HistorialPlan {
  year: number;
  periodos: string[];
  generadoEn: string;
  cursos: CursoDelPlan[];
  totales: {
    estudiantes: number;
    periodos: number;
    noEnApp: number;
    noEnArchivo: number;
    cursosQueFaltan: number;
    sinCodigo: number;
  };
  /** Lo que conviene mirar antes de aplicar, en palabras. */
  advertencias: string[];
  /**
   * Los que no tienen código, por nombre y curso.
   *
   * Decir "1 estudiante no tiene código" no sirve de nada: hay 540 y no hay
   * forma de saber cuál. Con el nombre se arregla en un minuto.
   */
  sinCodigo: { courseCode: string; nombre: string }[];
}

/**
 * Arma el plan. No escribe nada.
 *
 * El emparejamiento es **solo por código**, nunca por nombre. Acá no hace falta
 * el respaldo por nombre que sí necesita la importación de la Planilla: el
 * archivo siempre trae el código, porque es la primera columna de la pantalla
 * de donde sale. Y un nombre que se parece no alcanza para escribirle a alguien
 * la definitiva de otro.
 */
export function planHistorialImport(
  archivo: HistorialArchivo,
  students: Student[],
  courseCodes: string[],
  year: number,
): HistorialPlan {
  const porCodigo = new Map<string, Student>();
  const sinCodigoLista: { courseCode: string; nombre: string }[] = [];
  for (const s of students) {
    const cod = (s.codAlum || '').trim();
    if (!cod) {
      if (!s.withdrawnAt) sinCodigoLista.push({ courseCode: s.courseCode, nombre: s.nombre });
      continue;
    }
    porCodigo.set(cod, s);
  }
  const sinCodigo = sinCodigoLista.length;
  const cursosApp = new Set(courseCodes.map((c) => c.trim()));

  // Un estudiante puede venir en varias entradas del archivo (una por periodo),
  // así que primero se juntan todos sus periodos y después se arma el cambio.
  const acumulado = new Map<string, { curso: string; porPeriodo: Map<string, number>; nombre: string }>();
  const porCurso = new Map<string, CursoDelPlan>();
  const vistosPorCurso = new Map<string, Set<string>>();

  const curso = (code: string): CursoDelPlan => {
    let c = porCurso.get(code);
    if (!c) {
      c = { courseCode: code, faltaEnApp: !cursosApp.has(code), cambios: [], noEnApp: [], noEnArchivo: [] };
      porCurso.set(code, c);
      vistosPorCurso.set(code, new Set());
    }
    return c;
  };

  for (const entrada of archivo.cursos) {
    const c = curso(entrada.curso);
    const vistos = vistosPorCurso.get(entrada.curso)!;
    for (const e of entrada.estudiantes) {
      if (!e.cod_alum) continue;
      vistos.add(e.cod_alum);
      const alumno = porCodigo.get(e.cod_alum);
      if (!alumno || alumno.id == null) {
        // De un curso que no existe acá no se listan los estudiantes uno por
        // uno: lo que falta es el curso entero, y esa advertencia ya lo dice.
        // Contarlos otra vez como "no están en la app" hacía parecer que eran
        // ingresos nuevos, que es otra cosa y se arregla de otra manera.
        if (!c.faltaEnApp && !c.noEnApp.some((n) => n.codAlum === e.cod_alum)) {
          c.noEnApp.push({ codAlum: e.cod_alum, nombre: e.nombre });
        }
        continue;
      }
      // Una definitiva en null es una celda que no se pudo leer, no un cero.
      if (e.definitiva == null) continue;
      let acc = acumulado.get(e.cod_alum);
      if (!acc) {
        acc = { curso: entrada.curso, porPeriodo: new Map(), nombre: e.nombre };
        acumulado.set(e.cod_alum, acc);
      }
      acc.porPeriodo.set(entrada.periodo, e.definitiva);
    }
  }

  for (const [cod, acc] of acumulado) {
    const alumno = porCodigo.get(cod)!;
    const previo = alumno.platformHistory;
    // Del mismo año se conserva lo que ya había y se pisa solo lo que viene;
    // de otro año se reemplaza entero, porque mezclar años sería peor.
    const base: Record<string, number> =
      previo && previo.year === year ? { ...previo.definitivas } : {};
    const tocados: string[] = [];
    for (const [periodo, valor] of acc.porPeriodo) {
      if (base[periodo] !== valor) tocados.push(periodo);
      base[periodo] = valor;
    }
    if (tocados.length === 0) continue;         // nada que cambiar
    curso(acc.curso).cambios.push({
      studentId: alumno.id!,
      codAlum: cod,
      nombre: alumno.nombre,
      definitivas: base,
      periodosTocados: tocados.sort(),
    });
  }

  // Los de la app que el archivo no menciona, por curso.
  for (const s of students) {
    const code = (s.courseCode || '').trim();
    if (!porCurso.has(code)) continue;
    const vistos = vistosPorCurso.get(code)!;
    const cod = (s.codAlum || '').trim();
    if (cod && !vistos.has(cod)) {
      porCurso.get(code)!.noEnArchivo.push({ codAlum: cod, nombre: s.nombre });
    }
  }

  const cursos = [...porCurso.values()].sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  const totales = {
    estudiantes: cursos.reduce((a, c) => a + c.cambios.length, 0),
    periodos: new Set(archivo.cursos.map((c) => c.periodo)).size,
    noEnApp: cursos.reduce((a, c) => a + c.noEnApp.length, 0),
    noEnArchivo: cursos.reduce((a, c) => a + c.noEnArchivo.length, 0),
    cursosQueFaltan: cursos.filter((c) => c.faltaEnApp).length,
    sinCodigo,
  };

  const advertencias: string[] = [];
  if (totales.cursosQueFaltan) {
    advertencias.push(
      `${totales.cursosQueFaltan} curso(s) del archivo no existen acá: ${cursos.filter((c) => c.faltaEnApp).map((c) => c.courseCode).join(', ')}. Sus notas no se van a guardar.`);
  }
  if (sinCodigo) {
    const quienes = sinCodigoLista.map((s) => `${s.nombre} (${s.courseCode})`).join(', ');
    advertencias.push(
      `Sin código, así que no hay con qué emparejarlos: ${quienes}. ` +
      'Se arreglan cargando el Califica de ese curso, que trae los códigos.');
  }
  if (totales.noEnApp) {
    advertencias.push(
      `${totales.noEnApp} estudiante(s) del archivo no están acá. Suelen ser ingresos nuevos o de otro curso.`);
  }
  if (totales.noEnArchivo) {
    advertencias.push(
      `${totales.noEnArchivo} estudiante(s) de la app no aparecen en el archivo. Se quedan como están.`);
  }
  for (const e of archivo.errores) {
    advertencias.push(
      `El extractor no pudo leer ${e.curso ?? 'un curso'}${e.periodo ? ' en el periodo ' + (NOMBRE_PERIODO[e.periodo] ?? e.periodo) : ''}: ${e.motivo}`);
  }

  return {
    year, periodos: archivo.periodos, generadoEn: archivo.generadoEn,
    cursos, totales, advertencias, sinCodigo: sinCodigoLista,
  };
}

/** Lo que hay que escribir, listo para Dexie. */
export function cambiosDelPlan(plan: HistorialPlan, ahora: string): {
  studentId: number; platformHistory: PlatformHistory;
}[] {
  const out: { studentId: number; platformHistory: PlatformHistory }[] = [];
  for (const c of plan.cursos) {
    if (c.faltaEnApp) continue;
    for (const cambio of c.cambios) {
      out.push({
        studentId: cambio.studentId,
        platformHistory: { year: plan.year, definitivas: cambio.definitivas, importedAt: ahora },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lo que se muestra
// ---------------------------------------------------------------------------

export interface PeriodoResumen {
  periodo: string;
  etiqueta: string;
  valor: number | null;
  /**
   * De dónde salió:
   *   'app'        — el trimestre en curso, que la app está calculando.
   *   'cierre'     — lo que la app archivó al cerrar ese trimestre.
   *   'plataforma' — lo que se trajo de la plataforma.
   */
  origen: 'app' | 'cierre' | 'plataforma';
  /**
   * El valor de la plataforma cuando NO coincide con el del cierre.
   *
   * No se esconde ninguno de los dos: que difieran significa que lo que la app
   * calculó al cerrar no es lo que quedó registrado en el colegio, y eso suele
   * querer decir que el Califica no llegó a subirse. Es justo lo que conviene
   * ver, no promediar ni elegir en silencio.
   */
  discrepancia?: number;
}

export interface ResumenEstudiante {
  periodos: PeriodoResumen[];
  /**
   * El promedio de los trimestres que ya tienen nota. NO es la definitiva del
   * año: el colegio la calcula a su manera y puede no ser un promedio simple.
   * Por eso se llama "va en" y no "definitiva".
   */
  acumulado: number | null;
  /** La del periodo FINAL, si la plataforma ya la publicó. Esa sí es oficial. */
  finalPlataforma: number | null;
}

/**
 * Arma la línea `T1 · T2 · T3 → va en` de un estudiante.
 *
 * Tres fuentes, en este orden:
 *
 *   1. **El trimestre en curso sale de la app**, que es donde está vivo. Aunque
 *      lo importado traiga otro valor, gana la app: es lo que se está
 *      calificando ahora y la plataforma puede estar vieja.
 *   2. **Los anteriores, del cierre de la app** si ese trimestre se cerró acá.
 *      Es el dato propio, calculado con la fórmula validada, y está aunque no
 *      haya red.
 *   3. **Y si no se cerró acá, lo importado de la plataforma.** Ese es el caso
 *      de quien empieza a usar la app a mitad de año: los trimestres que ya
 *      pasaron nunca se cerraron en la app y no hay de dónde sacarlos.
 *
 * O sea que para quien arranca en marzo y cierra cada trimestre, el importador
 * no hace falta: la app ya tiene el dato. Es una herramienta de relleno, no
 * parte del flujo normal.
 */
/** De dónde salió una definitiva. */
export type OrigenDefinitiva = 'app' | 'cierre' | 'plataforma';

export interface DefinitivaDe {
  valor: number | null;
  origen: OrigenDefinitiva;
  /** Lo que dice la plataforma cuando NO coincide con el cierre propio. */
  discrepancia?: number;
}

/**
 * La definitiva de un estudiante en un trimestre, con su procedencia.
 *
 * Es **la única regla de precedencia** que hay en la app, y por eso vive acá
 * sola: tanto la línea `T1 · T2 · T3` de la pantalla como el EFAS de un
 * trimestre pasado salen de esto. Con dos copias, dos pantallas mostrarían
 * números distintos del mismo estudiante — que es justo lo que esta app no
 * puede permitirse.
 *
 * `valor: null` significa **no hay dato**, y no es lo mismo que 0: un
 * estudiante sin nota de T1 no está perdiendo T1, es que ese trimestre no se
 * cerró acá ni se importó. Quien cuente promedios tiene que dejarlo fuera.
 */
export function definitivaDe(
  student: Student,
  course: Pick<Course, 'grade' | 'trimestre' | 'year'>,
  trimestre: number,
  cierres: Pick<TrimesterSnapshot, 'trimestre' | 'year' | 'definitiva'>[],
  subjects: ConSlots[] | undefined,
): DefinitivaDe {
  // 1. El trimestre en curso sale de la app, que es donde está vivo.
  if (trimestre === course.trimestre) {
    const def = calcDef(student.subnotas ?? {}, slotsFor(course.grade, subjects), 'platform').definitiva;
    return { valor: def > 0 ? def : null, origen: 'app' };
  }

  const hist = student.platformHistory;
  const delAnio = hist && hist.year === course.year ? hist.definitivas : {};
  const dePlataforma = delAnio[String(trimestre).padStart(2, '0')];

  // 2. Los pasados, del cierre de la app si ese trimestre se cerró acá.
  const delCierre = cierres.find(c => c.year === course.year && c.trimestre === trimestre)?.definitiva;
  if (delCierre != null) {
    return {
      valor: delCierre, origen: 'cierre',
      ...(dePlataforma != null && dePlataforma !== delCierre ? { discrepancia: dePlataforma } : {}),
    };
  }

  // 3. Y si no, lo importado de la plataforma.
  return { valor: dePlataforma != null ? dePlataforma : null, origen: 'plataforma' };
}

export function resumenDe(
  student: Student,
  course: Pick<Course, 'grade' | 'trimestre' | 'year'>,
  cierres: Pick<TrimesterSnapshot, 'trimestre' | 'year' | 'definitiva'>[] = [],
  subjects: ConSlots[] | undefined,
): ResumenEstudiante {
  const hist = student.platformHistory;
  const delAnio = hist && hist.year === course.year ? hist.definitivas : {};

  const periodos: PeriodoResumen[] = [];
  for (const p of PERIODOS) {
    if (p === PERIODO_FINAL) continue;
    const t = trimestreDe(p);
    if (t == null) continue;
    // Una sola regla de precedencia, compartida con el EFAS: ver `definitivaDe`.
    const d = definitivaDe(student, course, t, cierres, subjects);
    periodos.push({ periodo: p, etiqueta: NOMBRE_PERIODO[p], ...d });
  }

  const conNota = periodos.map((p) => p.valor).filter((v): v is number => v != null && v > 0);
  const acumulado = conNota.length
    ? Math.floor(conNota.reduce((a, b) => a + b, 0) / conNota.length + 0.5)
    : null;

  return {
    periodos,
    acumulado,
    finalPlataforma: delAnio[PERIODO_FINAL] ?? null,
  };
}
