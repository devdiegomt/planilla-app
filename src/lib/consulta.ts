import type { Student } from '@/types';
import { NOTA_APROBACION, NOTA_EXPERTO } from './constants';

/**
 * Preguntar en español sobre los propios datos, sin que nada salga del equipo.
 *
 * **No es un modelo de lenguaje, y no hace falta que lo sea.** El vocabulario
 * del oficio es chico y cerrado: cursos, grados, notas, categorías, fallas,
 * retardos, trimestres. Con eso alcanza para cubrir lo que se pregunta a
 * diario, y a cambio funciona sin red, sin costo, al instante, y **ningún
 * nombre de estudiante sale del dispositivo** — que con menores no es un
 * detalle.
 *
 * Puro y aparte de Dexie, como `pasteNotas` y `studentMatch`: acá se decide qué
 * entendió y se puede probar sin navegador.
 *
 * Lo que NO hace, a propósito: no responde lo que no entendió con una
 * aproximación. Si no reconoce la pregunta lo dice y sugiere las que sí sabe.
 * Inventar una respuesta plausible sobre notas de estudiantes es peor que no
 * responder.
 */

// ---------------------------------------------------------------------------
// Vocabulario
// ---------------------------------------------------------------------------

export const norm = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();

/** Las categorías, como las nombra el colegio y como las dice la gente. */
const CATEGORIAS: Record<string, 'K' | 'M' | 'U' | 'C' | 'E'> = {
  conocimiento: 'K', k: 'K',
  metodo: 'M', m: 'M',
  uso: 'U', u: 'U',
  comunicacion: 'C', c: 'C',
  evaluacion: 'E', e: 'E', 'evaluacion trimestral': 'E', trimestral: 'E',
};

export type Intencion =
  | 'resumen_curso'      // "cómo viene el 803"
  | 'reprobando'         // "quién va perdiendo en 11"
  | 'riesgo'             // "quién está en riesgo"
  | 'expertos'           // "quiénes van en experto"
  | 'fallas'             // "quién tiene más fallas"
  | 'retardos'           // "quién llega tarde"
  | 'sin_calificar'      // "a quién le falta la evaluación"
  | 'estudiante';        // "cuánto va Pérez"

export interface Consulta {
  intencion: Intencion;
  /** Los cursos sobre los que pregunta. Vacío = todos. */
  cursos: string[];
  /** Grado suelto ('11') cuando no nombró un curso puntual. */
  grado?: number;
  categoria?: 'K' | 'M' | 'U' | 'C' | 'E';
  /** Umbral dicho en la pregunta: "más de 3 fallas". */
  minimo?: number;
  /** Texto que parece un nombre o un código de estudiante. */
  quien?: string;
}

/** Lo que hace falta saber del mundo para interpretar: nada de Dexie acá. */
export interface Contexto {
  /** Códigos de curso que existen, tal como los escribe el docente ('801'). */
  cursos: string[];
}

const RE_CURSO = /\b(\d{3,4})\b/g;

/**
 * Interpreta la pregunta. Devuelve null si no la reconoce.
 *
 * El orden de las reglas importa: las más específicas primero. "quién va
 * perdiendo comunicación" es una pregunta de categoría, no de reprobados en
 * general, y si se mirara primero "perdiendo" se perdería el matiz.
 */
export function interpretar(texto: string, ctx: Contexto): Consulta | null {
  const t = norm(texto);
  if (!t) return null;

  // --- Cursos y grado ---
  const cursos: string[] = [];
  let grado: number | undefined;
  const existentes = new Set(ctx.cursos.map((c) => c.trim()));
  for (const m of t.matchAll(RE_CURSO)) {
    const n = m[1];
    if (existentes.has(n)) { cursos.push(n); continue; }
    // "en 11", "de once": un grado, no un curso.
    if (n.length <= 2) grado = Number(n);
  }
  for (const [palabra, valor] of Object.entries(
    { octavo: 8, noveno: 9, decimo: 10, undecimo: 11, once: 11, '8': 8, '9': 9, '10': 10, '11': 11 },
  )) {
    if (new RegExp(`\\b${palabra}\\b`).test(t)) grado ??= valor;
  }

  // --- Categoría ---
  let categoria: Consulta['categoria'];
  for (const [palabra, cat] of Object.entries(CATEGORIAS)) {
    if (palabra.length > 1 && new RegExp(`\\b${palabra}\\b`).test(t)) { categoria = cat; break; }
  }

  // --- Umbral ---
  const conUmbral = /\b(?:mas de|más de|mayor que|al menos|desde)\s+(\d+)/.exec(t);
  const minimo = conUmbral ? Number(conUmbral[1]) : undefined;

  const base = { cursos, grado, categoria, minimo };
  const dice = (...palabras: string[]) => palabras.some((p) => new RegExp(p).test(t));

  // --- Intención, de lo más específico a lo más general ---

  if (dice('sin calificar', 'falta(n)? (la )?nota', 'le falta', 'sin nota', 'no (le )?he calificado', 'pendiente de calificar')) {
    return { intencion: 'sin_calificar', ...base };
  }
  if (dice('retardo', 'llega tarde', 'tarde')) {
    return { intencion: 'retardos', ...base };
  }
  if (dice('falla', 'falta(s)? a clase', 'inasistencia', 'ausencia')) {
    return { intencion: 'fallas', ...base };
  }
  if (dice('experto', 'excelente', 'mejores')) {
    return { intencion: 'expertos', ...base };
  }
  if (dice('riesgo', 'al limite', 'al límite', 'justo')) {
    return { intencion: 'riesgo', ...base };
  }
  if (dice('perdiendo', 'reprobando', 'reprobado', 'rajado', 'van mal', 'va mal', 'pierde')) {
    return { intencion: 'reprobando', ...base };
  }
  if (dice('como viene', 'como va', 'como esta', 'resumen', 'promedio')) {
    // "cómo viene Pérez" es un estudiante; "cómo viene el 803" es un curso.
    const quien = nombreSuelto(texto, ctx);
    if (quien && cursos.length === 0) return { intencion: 'estudiante', ...base, quien };
    return { intencion: 'resumen_curso', ...base };
  }

  // Un nombre o un código a secas: la ficha de ese estudiante.
  const quien = nombreSuelto(texto, ctx);
  if (quien) return { intencion: 'estudiante', ...base, quien };

  return null;
}

/**
 * Lo que en la pregunta parece un nombre propio o un código.
 *
 * Se quitan primero las palabras del vocabulario: si no, "cómo viene" pasaría
 * por nombre y toda pregunta encontraría un estudiante.
 */
const RELLENO = new Set(norm(
  'como cuanto cuanta cuantos cuantas va van viene vienen esta estan anda lleva saco sacaron ' +
  'quien quienes que cual cuales el la los las de del en un una y ' +
  'curso cursos grado estudiante estudiantes alumno alumnos nota notas promedio resumen ' +
  'mas menos muestra dame dime a con para por se le les hay tiene tienen trimestre ' +
  'perdiendo reprobando riesgo experto fallas retardos calificar falta faltan',
).split(' '));

function nombreSuelto(texto: string, ctx: Contexto): string | undefined {
  const codigo = /\b\d{10}\b/.exec(texto);
  if (codigo) return codigo[0];
  const palabras = norm(texto).split(' ')
    .filter((p) => p && !RELLENO.has(p) && !/^\d+$/.test(p) && !CATEGORIAS[p]);
  // Una sola palabra suelta puede ser cualquier cosa; se exige que parezca un
  // apellido (letras, 3+) para no tomar ruido por nombre.
  const utiles = palabras.filter((p) => /^[a-zñ]{3,}$/.test(p));
  return utiles.length ? utiles.join(' ') : undefined;
}

/** Las preguntas que sí entiende, para ofrecerlas cuando no entendió. */
export const EJEMPLOS = [
  'cómo viene el 803',
  'quién va perdiendo en 11',
  'quién está en riesgo',
  'quién tiene más de 3 fallas',
  'a quién le falta la evaluación',
  'cuánto va Martínez',
];

// ---------------------------------------------------------------------------
// La respuesta
// ---------------------------------------------------------------------------

export interface FilaEstudiante {
  courseCode: string;
  nombre: string;
  codAlum: string;
  /** El número que responde la pregunta: la definitiva, las fallas, lo que sea. */
  valor: number;
  detalle?: string;
}

export interface Respuesta {
  intencion: Intencion;
  titulo: string;
  /** Una línea con el total, para leer sin contar filas. */
  resumen: string;
  filas: FilaEstudiante[];
  /** Cursos que la pregunta abarcó, para que se vea que no se ignoró ninguno. */
  cursosMirados: string[];
}

/** Lo que el buscador necesita de cada estudiante, ya calculado. */
export interface DatoEstudiante {
  student: Student;
  courseCode: string;
  grade: number;
  def: number;
  cats: { K: number; M: number; U: number; C: number; E: number };
  fallas: number;
  fallasJust: number;
  retardos: number;
  /** Claves de subnota todavía en 0, o sea sin calificar. */
  sinCalificar: string[];
}

function alcance(consulta: Consulta, datos: DatoEstudiante[]): DatoEstudiante[] {
  let out = datos;
  if (consulta.cursos.length) {
    const set = new Set(consulta.cursos);
    out = out.filter((d) => set.has(d.courseCode));
  } else if (consulta.grado != null) {
    out = out.filter((d) => d.grade === consulta.grado);
  }
  return out.filter((d) => !d.student.withdrawnAt);
}

const fila = (d: DatoEstudiante, valor: number, detalle?: string): FilaEstudiante => ({
  courseCode: d.courseCode,
  nombre: d.student.nombre,
  codAlum: d.student.codAlum,
  valor,
  detalle,
});

const plural = (n: number, uno: string, muchos: string) => `${n} ${n === 1 ? uno : muchos}`;

export function responder(consulta: Consulta, datos: DatoEstudiante[]): Respuesta {
  const enAlcance = alcance(consulta, datos);
  const cursosMirados = [...new Set(enAlcance.map((d) => d.courseCode))].sort();
  const donde = consulta.cursos.length
    ? consulta.cursos.join(', ')
    : consulta.grado != null ? `grado ${consulta.grado}` : 'todos tus cursos';

  const vacio = (titulo: string, nada: string): Respuesta =>
    ({ intencion: consulta.intencion, titulo, resumen: nada, filas: [], cursosMirados });

  switch (consulta.intencion) {
    case 'reprobando': {
      const cat = consulta.categoria;
      const filas = enAlcance
        .filter((d) => (cat ? d.cats[cat] : d.def) > 0 && (cat ? d.cats[cat] : d.def) < NOTA_APROBACION)
        .map((d) => fila(d, cat ? d.cats[cat] : d.def))
        .sort((a, b) => a.valor - b.valor);
      const que = cat ? `en ${nombreCat(cat)}` : '';
      if (!filas.length) return vacio(`Perdiendo ${que} · ${donde}`, 'Nadie está perdiendo. 🎉');
      return {
        intencion: consulta.intencion,
        titulo: `Perdiendo ${que} · ${donde}`.replace('  ', ' '),
        resumen: `${plural(filas.length, 'estudiante', 'estudiantes')} por debajo de ${NOTA_APROBACION}.`,
        filas, cursosMirados,
      };
    }

    case 'riesgo': {
      const filas = enAlcance
        .filter((d) => d.def >= NOTA_APROBACION && d.def < NOTA_APROBACION + 5)
        .map((d) => fila(d, d.def))
        .sort((a, b) => a.valor - b.valor);
      if (!filas.length) return vacio(`En riesgo · ${donde}`, `Nadie entre ${NOTA_APROBACION} y ${NOTA_APROBACION + 4}.`);
      return {
        intencion: consulta.intencion,
        titulo: `En riesgo · ${donde}`,
        resumen: `${plural(filas.length, 'estudiante', 'estudiantes')} entre ${NOTA_APROBACION} y ${NOTA_APROBACION + 4}: aprueban, pero por poco.`,
        filas, cursosMirados,
      };
    }

    case 'expertos': {
      const filas = enAlcance
        .filter((d) => d.def >= NOTA_EXPERTO)
        .map((d) => fila(d, d.def))
        .sort((a, b) => b.valor - a.valor);
      if (!filas.length) return vacio(`En experto · ${donde}`, `Nadie llega a ${NOTA_EXPERTO} todavía.`);
      return {
        intencion: consulta.intencion,
        titulo: `En experto · ${donde}`,
        resumen: `${plural(filas.length, 'estudiante', 'estudiantes')} en ${NOTA_EXPERTO} o más.`,
        filas, cursosMirados,
      };
    }

    case 'fallas': {
      const min = consulta.minimo ?? 1;
      const filas = enAlcance
        .filter((d) => d.fallas >= min)
        .map((d) => fila(d, d.fallas,
          d.fallasJust ? `${d.fallasJust} justificada${d.fallasJust === 1 ? '' : 's'}` : undefined))
        .sort((a, b) => b.valor - a.valor);
      if (!filas.length) return vacio(`Fallas · ${donde}`, `Nadie con ${min} falla(s) o más.`);
      return {
        intencion: consulta.intencion,
        titulo: `Fallas · ${donde}`,
        resumen: `${plural(filas.length, 'estudiante', 'estudiantes')} con ${min} o más. Las justificadas van aparte.`,
        filas, cursosMirados,
      };
    }

    case 'retardos': {
      const min = consulta.minimo ?? 1;
      const filas = enAlcance
        .filter((d) => d.retardos >= min)
        .map((d) => fila(d, d.retardos))
        .sort((a, b) => b.valor - a.valor);
      if (!filas.length) return vacio(`Retardos · ${donde}`, `Nadie con ${min} retardo(s) o más.`);
      return {
        intencion: consulta.intencion,
        titulo: `Retardos · ${donde}`,
        resumen: `${plural(filas.length, 'estudiante', 'estudiantes')} con ${min} o más.`,
        filas, cursosMirados,
      };
    }

    case 'sin_calificar': {
      const cat = consulta.categoria;
      const filas = enAlcance
        .map((d) => {
          const faltan = cat ? d.sinCalificar.filter((k) => k.startsWith(cat)) : d.sinCalificar;
          return { d, faltan };
        })
        .filter(({ faltan }) => faltan.length > 0)
        .map(({ d, faltan }) => fila(d, faltan.length, faltan.join(', ')))
        .sort((a, b) => b.valor - a.valor);
      const que = cat ? ` en ${nombreCat(cat)}` : '';
      if (!filas.length) return vacio(`Sin calificar${que} · ${donde}`, 'No falta ninguna nota. 🎉');
      return {
        intencion: consulta.intencion,
        titulo: `Sin calificar${que} · ${donde}`,
        resumen: `${plural(filas.length, 'estudiante', 'estudiantes')} con notas en cero, que la plataforma lee como sin calificar.`,
        filas, cursosMirados,
      };
    }

    case 'estudiante': {
      /*
       * Se empareja por palabra y no por la frase entera.
       *
       * Exigir la frase completa es fragil: basta que una palabra de relleno se
       * cuele —y siempre se cuela alguna— para no encontrar a nadie. Se cuentan
       * cuantas palabras de la pregunta aparecen en el nombre y se ordena por
       * eso, asi que el mas parecido queda arriba.
       *
       * Y si coinciden varios NO se elige uno: salen todos. Adivinar cual de
       * dos apellidos iguales es el que se preguntaba seria mostrar las notas
       * del estudiante equivocado.
       */
      const palabras = norm(consulta.quien ?? '').split(' ').filter((p) => p.length >= 3);
      const coincidencias = (d: DatoEstudiante) => {
        if (d.student.codAlum === consulta.quien) return 99;
        const nom = norm(d.student.nombre);
        return palabras.filter((p) => nom.includes(p)).length;
      };
      const filas = enAlcance
        .map((d) => ({ d, n: coincidencias(d) }))
        .filter(({ n }) => n > 0)
        .sort((a, b) => b.n - a.n)
        .map(({ d }) => d)
        .map((d) => fila(d, d.def,
          `K ${d.cats.K} · M ${d.cats.M} · U ${d.cats.U} · C ${d.cats.C} · E ${d.cats.E}` +
          ` — ${d.fallas} falla(s), ${d.retardos} retardo(s)`));
      if (!filas.length) {
        return vacio(`"${consulta.quien}"`, 'No encontré a nadie con ese nombre o código.');
      }
      return {
        intencion: consulta.intencion,
        titulo: filas.length === 1 ? filas[0].nombre : `"${consulta.quien}"`,
        resumen: filas.length === 1
          ? `Definitiva ${filas[0].valor} en ${filas[0].courseCode}.`
          : `${filas.length} coinciden con ese nombre.`,
        filas, cursosMirados,
      };
    }

    case 'resumen_curso':
    default: {
      const conNota = enAlcance.filter((d) => d.def > 0);
      if (!conNota.length) return vacio(`Resumen · ${donde}`, 'Todavía no hay notas cargadas.');
      const suma = conNota.reduce((a, d) => a + d.def, 0);
      const promedio = Math.floor(suma / conNota.length + 0.5);
      const perdiendo = conNota.filter((d) => d.def < NOTA_APROBACION).length;
      const filas = conNota
        .map((d) => fila(d, d.def))
        .sort((a, b) => a.valor - b.valor);
      return {
        intencion: 'resumen_curso',
        titulo: `Resumen · ${donde}`,
        resumen: `${enAlcance.length} activos · promedio ${promedio} · ` +
                 `${plural(perdiendo, 'perdiendo', 'perdiendo')}.`,
        filas, cursosMirados,
      };
    }
  }
}

function nombreCat(c: 'K' | 'M' | 'U' | 'C' | 'E'): string {
  return { K: 'conocimiento', M: 'método', U: 'uso', C: 'comunicación', E: 'evaluación' }[c];
}
