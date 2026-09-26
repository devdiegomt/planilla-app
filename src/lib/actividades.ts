/**
 * Los porcentajes reales de la matriz de actividades de la plataforma.
 *
 * Hasta ahora los pesos internos de cada subnota vivían fijos en
 * `SLOTS_8_10` y `SLOTS_11` (`lib/constants.ts`). Corridos contra la matriz
 * (pantalla 831) el 24/09/2026 resultaron **exactos** para los cuatro grados,
 * así que esto no viene a corregir un error: viene a que dejen de ser una
 * constante. Son los pesos de UNA materia —informática— y otro docente que
 * abra la app hoy calcularía sus definitivas con los de Diego sin enterarse.
 *
 * Igual que `planPaste` y `planHistorialImport`, acá se **arma un plan y no se
 * escribe**. Lo que hay que ver antes de aplicar no es un cruce de estudiantes
 * sino si lo leído cambia las COLUMNAS: la clave de un slot (`K1_C4`) lleva su
 * columna adentro, y de ahí salen la rejilla de notas, el Califica y las
 * subnotas ya guardadas. Cambiar un peso es inofensivo; cambiar una columna
 * deja notas escritas sin dónde caer, y eso se cuenta y se muestra.
 */
import type { SlotDef } from './constants';
import { slotsFor } from './constants';
import type { Course, Student } from '@/types';

// --- Lo que entrega el extractor -------------------------------------------

export interface ActividadLeida {
  meta: string;
  /** La fila número N dentro de su meta, contando las casillas sin usar. */
  posicion?: number;
  general?: string;
  descripcion: string;
  porcentaje: number;
  ciclo?: string;
  destino?: string;
}

/** Una de las ocho casillas por categoría que la plataforma trae sin estrenar. */
export interface CasillaVacia {
  meta: string;
  posicion: number;
  descripcion: string;
}

export interface CursoLeido {
  curso: string;
  grado: number;
  materia?: string;
  materiaNombre?: string;
  periodo?: string;
  actividades: ActividadLeida[];
  casillasSinUsar?: CasillaVacia[];
}

export interface ArchivoActividades {
  generadoEn?: string;
  profesor?: string;
  cursos: CursoLeido[];
  errores: { curso: string; motivo: string }[];
}

/**
 * Los rótulos de la columna "Meta" → la categoría.
 *
 * Se comparan sin tildes y sin mayúsculas porque la plataforma no es
 * consistente ("MÉTODO", "EVA. TRIMESTRAL"), y por prefijo porque "EVA."
 * viene a veces con el punto y a veces sin él.
 */
const METAS: { prefijo: string; cat: SlotDef['cat'] }[] = [
  { prefijo: 'conocimiento', cat: 'K' },
  { prefijo: 'metodo',       cat: 'M' },
  { prefijo: 'uso',          cat: 'U' },
  { prefijo: 'comunicacion', cat: 'C' },
  { prefijo: 'eva',          cat: 'E' },
];

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function catDeMeta(meta: string): SlotDef['cat'] | null {
  const limpio = sinTildes(meta);
  return METAS.find(m => limpio.startsWith(m.prefijo))?.cat ?? null;
}

/**
 * La columna real (`C4`) que sale del título del logro.
 *
 * La plataforma no es consistente con la puntuación ni dentro de un mismo
 * curso: se vieron `T3 - C4. TÍTULO`, `T3 – C8. TÍTULO` (raya) y
 * `T3 - C2 - TÍTULO`. Por eso se busca la columna y no se parsea el formato.
 */
export function columnaDeDescripcion(desc: string): string | null {
  const m = /T\s*\d+\s*[-–—]\s*C\s*(\d+)/i.exec(desc);
  return m ? `C${m[1]}` : null;
}

// --- Leer ------------------------------------------------------------------

/** Parsea el JSON del extractor. Lanza con un mensaje en español si no lo es. */
export function parseActividades(raw: string): ArchivoActividades {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('Eso no es un archivo de actividades: no se pudo leer como JSON.');
  }
  const o = data as Partial<ArchivoActividades>;
  if (!o || !Array.isArray(o.cursos)) {
    throw new Error('Al archivo le falta la lista de cursos. ¿Copiaste todo el texto?');
  }
  return {
    generadoEn: typeof o.generadoEn === 'string' ? o.generadoEn : undefined,
    profesor: typeof o.profesor === 'string' ? o.profesor : undefined,
    cursos: o.cursos.filter(c => c && Array.isArray(c.actividades)),
    errores: Array.isArray(o.errores) ? o.errores : [],
  };
}

export interface LecturaCurso {
  slots: SlotDef[];
  problemas: string[];
}

/**
 * Los slots que describe un curso de la matriz.
 *
 * El número dentro de la clave (`K1`, `K2`) es el orden de aparición dentro de
 * su categoría, que es exactamente como se armaron las constantes. `EV_` es el
 * prefijo de la evaluación trimestral, que siempre es una sola.
 */
export function slotsDeCurso(curso: CursoLeido): LecturaCurso {
  const problemas: string[] = [];
  const slots: SlotDef[] = [];
  const vistos = new Map<SlotDef['cat'], number>();

  for (const a of curso.actividades) {
    const cat = catDeMeta(a.meta ?? '');
    if (!cat) {
      problemas.push(`No reconozco la meta "${a.meta}".`);
      continue;
    }
    const col = columnaDeDescripcion(a.descripcion ?? '');
    if (!col) {
      problemas.push(`No encuentro la columna en "${a.descripcion}".`);
      continue;
    }
    const n = (vistos.get(cat) ?? 0) + 1;
    vistos.set(cat, n);
    slots.push({
      key: cat === 'E' ? `EV_${col}` : `${cat}${n}_${col}`,
      cat,
      weight: (a.porcentaje ?? 0) / 100,
    });
  }

  // Cada categoría tiene que sumar 100%: es lo que hace que el promedio
  // ponderado de la fórmula "platform" sea un promedio y no otra cosa.
  for (const cat of ['K', 'M', 'U', 'C', 'E'] as const) {
    const suma = slots.filter(s => s.cat === cat).reduce((a, s) => a + s.weight, 0);
    if (!suma) {
      problemas.push(`La categoría ${cat} no trae ninguna actividad con porcentaje.`);
    } else if (Math.abs(suma - 1) > 0.005) {
      problemas.push(`La categoría ${cat} suma ${Math.round(suma * 100)}%, no 100%.`);
    }
  }
  return { slots, problemas };
}

// --- Comparar --------------------------------------------------------------

export type EstadoGrado = 'igual' | 'pesos' | 'estructura' | 'ilegible';

export interface ComparacionGrado {
  grade: number;
  /** Los cursos de ese grado que trajo el archivo. */
  cursos: string[];
  leidos: SlotDef[];
  actuales: SlotDef[];
  estado: EstadoGrado;
  problemas: string[];
  /** Notas ya escritas que quedarían sin columna. Solo importa si 'estructura'. */
  notasEnRiesgo: number;
}

export interface PlanActividades {
  grados: ComparacionGrado[];
  /** Cursos que el extractor no pudo leer. */
  errores: { curso: string; motivo: string }[];
  profesor?: string;
  generadoEn?: string;
}

/** Mismas claves en el mismo orden: las mismas actividades en las mismas columnas. */
export const mismaEstructura = (a: SlotDef[], b: SlotDef[]) =>
  a.length === b.length && a.every((s, i) => s.key === b[i].key && s.cat === b[i].cat);

/** Mismos porcentajes. Solo tiene sentido si ya coincide la estructura. */
export const mismosPesos = (a: SlotDef[], b: SlotDef[]) =>
  a.every((s, i) => Math.abs(s.weight - b[i].weight) < 0.005);

/**
 * Compara lo leído contra lo que la app usa hoy, grado por grado.
 *
 * `actualesDe` deja inyectar los slots configurados; por omisión son los fijos.
 * No escribe nada: devuelve qué cambiaría y qué costaría.
 */
export function planActividades(
  archivo: ArchivoActividades,
  cursosApp: { course: Course; students: Student[] }[] = [],
  actualesDe: (grade: number) => SlotDef[] = g => slotsFor(g, undefined),
): PlanActividades {
  const porGrado = new Map<number, CursoLeido[]>();
  for (const c of archivo.cursos) {
    const g = Number(c.grado);
    if (!g) continue;
    porGrado.set(g, [...(porGrado.get(g) ?? []), c]);
  }

  const grados: ComparacionGrado[] = [];
  for (const [grade, cursos] of [...porGrado.entries()].sort((a, b) => a[0] - b[0])) {
    const problemas: string[] = [];
    const lecturas = cursos.map(c => ({ curso: c.curso, ...slotsDeCurso(c) }));
    for (const l of lecturas) {
      for (const p of l.problemas) problemas.push(`${l.curso}: ${p}`);
    }

    // Dos cursos del mismo grado tienen que describir lo mismo. Si no, se dice
    // en vez de elegir uno: significaría que la materia no está pareja entre
    // cursos, y aplicar cualquiera de los dos dejaría al otro mal calculado.
    const buenos = lecturas.filter(l => l.slots.length > 0);
    const base = buenos[0];
    if (!base) {
      grados.push({
        grade, cursos: cursos.map(c => c.curso), leidos: [], actuales: actualesDe(grade),
        estado: 'ilegible', problemas, notasEnRiesgo: 0,
      });
      continue;
    }
    const discrepan = buenos.filter(
      l => !mismaEstructura(l.slots, base.slots) || !mismosPesos(l.slots, base.slots),
    );
    if (discrepan.length) {
      problemas.push(
        `${base.curso} y ${discrepan.map(d => d.curso).join(', ')} no traen los mismos ` +
        'porcentajes. Revisa la matriz de esos cursos antes de aplicar.',
      );
    }

    const actuales = actualesDe(grade);
    const leidos = base.slots;
    let estado: EstadoGrado;
    if (problemas.length && discrepan.length) estado = 'ilegible';
    else if (!mismaEstructura(leidos, actuales)) estado = 'estructura';
    else if (!mismosPesos(leidos, actuales)) estado = 'pesos';
    else estado = 'igual';

    // Notas que se quedarían sin columna. Una subnota en 0 no cuenta: 0 es
    // "sin calificar", así que no hay nada que perder.
    let notasEnRiesgo = 0;
    if (estado === 'estructura') {
      const quedan = new Set(leidos.map(s => s.key));
      const sueltas = actuales.filter(s => !quedan.has(s.key)).map(s => s.key);
      for (const { course, students } of cursosApp) {
        if (course.grade !== grade) continue;
        for (const st of students) {
          for (const k of sueltas) {
            if ((st.subnotas?.[k] ?? 0) > 0) notasEnRiesgo++;
          }
        }
      }
    }

    grados.push({
      grade, cursos: cursos.map(c => c.curso), leidos, actuales, estado, problemas, notasEnRiesgo,
    });
  }

  return {
    grados,
    errores: archivo.errores,
    profesor: archivo.profesor,
    generadoEn: archivo.generadoEn,
  };
}

/** Una línea legible de un slot, para la vista previa: `K·C4·60%`. */
export const describirSlot = (s: SlotDef) =>
  `${s.cat}·${s.key.split('_')[1]}·${Math.round(s.weight * 100)}%`;

/** Los grados que cambiarían algo si se aplicara el plan. */
export const gradosQueCambian = (plan: PlanActividades) =>
  plan.grados.filter(g => g.estado === 'pesos' || g.estado === 'estructura');
