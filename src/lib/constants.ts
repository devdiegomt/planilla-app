/**
 * Metadata institucional del colegio GLA — constantes derivadas del análisis
 * de las 19 planillas y del Califica-451 (consolidado 2026).
 */

/** Número de curso → nombre en palabras (encabezado del Califica). */
export const CURSO_PALABRAS: Record<number, string> = {
  801: 'OCHOCIENTOS UNO',   802: 'OCHOCIENTOS DOS',   803: 'OCHOCIENTOS TRES',
  804: 'OCHOCIENTOS CUATRO', 805: 'OCHOCIENTOS CINCO', 806: 'OCHOCIENTOS SEIS',
  901: 'NOVECIENTOS UNO',   902: 'NOVECIENTOS DOS',   903: 'NOVECIENTOS TRES',
  904: 'NOVECIENTOS CUATRO', 905: 'NOVECIENTOS CINCO',
  1001: 'DECIMO UNO',       1002: 'DECIMO DOS',
  1003: 'DECIMO TRES',      1004: 'DECIMO CUATRO',
  1101: 'UNDECIMO UNO',     1102: 'UNDECIMO DOS',
  1103: 'UNDECIMO TRES',    1104: 'UNDECIMO CUATRO',
};

/**
 * Categoría + peso interno para cada subnota, en el orden que aparecen en el
 * Califica.
 *
 * `ciclo` y `destino` salen de la matriz de actividades de la plataforma y son
 * **opcionales a propósito**: las constantes de abajo no los traen, y un
 * docente que nunca importó su matriz no los va a tener. Donde no hay ciclo,
 * la app se comporta como siempre — no inventa que una nota va en el ciclo 1.
 *
 * Con ellos, en cambio, la app sabe en qué ciclo se saca cada nota. Y de ahí
 * sale lo otro: **un ciclo sin ninguna nota es formativo**. No hace falta
 * preguntarlo aparte; la matriz ya lo dice.
 */
export type SlotDef = {
  key: string;
  cat: 'K'|'M'|'U'|'C'|'E';
  weight: number;
  /** 1..9, de la columna Ciclo de la matriz. Ausente si no se importó. */
  ciclo?: number;
  /** 'Casa' | 'Clase' | 'Casa-Clase', de la matriz. */
  destino?: string;
};

/** Mapeo de subnotas para 8°–10° (10 slots → columnas log_XX). */
export const SLOTS_8_10: SlotDef[] = [
  { key: 'K1_C4', cat: 'K', weight: 0.60 },
  { key: 'K2_C5', cat: 'K', weight: 0.40 },
  { key: 'M1_C6', cat: 'M', weight: 0.50 },
  { key: 'M2_C8', cat: 'M', weight: 0.50 },
  { key: 'U1_C2', cat: 'U', weight: 0.50 },
  { key: 'U2_C9', cat: 'U', weight: 0.50 },
  { key: 'C1_C3', cat: 'C', weight: 0.25 },
  { key: 'C2_C4', cat: 'C', weight: 0.25 },
  { key: 'C3_C5', cat: 'C', weight: 0.50 },
  { key: 'EV_C7', cat: 'E', weight: 1.00 },
];

/** Mapeo de subnotas para 11° (11 slots). */
export const SLOTS_11: SlotDef[] = [
  { key: 'K1_C2', cat: 'K', weight: 0.60 },
  { key: 'K2_C4', cat: 'K', weight: 0.40 },
  { key: 'M1_C3', cat: 'M', weight: 0.40 },
  { key: 'M2_C6', cat: 'M', weight: 0.60 },
  { key: 'U1_C5', cat: 'U', weight: 0.25 },
  { key: 'U2_C8', cat: 'U', weight: 0.50 },
  { key: 'U3_C9', cat: 'U', weight: 0.25 },
  { key: 'C1_C3', cat: 'C', weight: 0.25 },
  { key: 'C2_C4', cat: 'C', weight: 0.25 },
  { key: 'C3_C6', cat: 'C', weight: 0.50 },
  { key: 'EV_C7', cat: 'E', weight: 1.00 },
];

/** Cada categoría (K, M, U, C, E) pesa 20% de la definitiva. */
export const CATEGORY_WEIGHT = 0.20;

/** Escala de notas del colegio. */
export const NOTA_MIN = 30;
export const NOTA_APROBACION = 70;
export const NOTA_EXPERTO = 80;
export const NOTA_MAX = 100;

/**
 * Las materias del docente, en lo único que a los slots les importa de ellas.
 * Se escribe así y no como `SubjectConfig` para no importar `@/types`, que a
 * su vez importa `SlotDef` de acá.
 */
export type ConSlots = { grade: number; slots?: SlotDef[] };

/**
 * Los slots de subnotas de un grado.
 *
 * El segundo parámetro es **obligatorio a propósito**, aunque casi siempre
 * termine en los valores fijos. Cuando era opcional, cualquier pantalla que se
 * olvidara de pasar las materias del docente calculaba con los pesos de
 * informática sin que nada lo avisara — y dos pantallas mostrando definitivas
 * distintas del mismo estudiante es el peor error que puede tener esta app.
 * Siendo obligatorio, el que no tiene de dónde sacarlas escribe `undefined` y
 * eso se ve en el diff.
 */
export function slotsFor(grade: number, subjects: ConSlots[] | undefined): SlotDef[] {
  const propios = subjects?.find(s => s.grade === grade)?.slots;
  if (propios?.length) return propios;
  return grade === 11 ? SLOTS_11 : SLOTS_8_10;
}

/**
 * Agrupa los slots por su "columna real" en la plataforma (C2, C3, ..., C9).
 * Cada columna real puede alimentar más de un slot (ej. C4 alimenta K1_C4 y C2_C4).
 * El docente ingresa la nota una sola vez por columna.
 */
export interface ColumnDef {
  column: string;                     // 'C2', 'C3', ...
  slotKeys: string[];                 // slots que la usan (para propagar la nota)
  cats: string[];                     // categorías tocadas (para tooltip: 'K', 'C', ...)
}

export function columnsFor(grade: number, subjects: ConSlots[] | undefined): ColumnDef[] {
  const slots = slotsFor(grade, subjects);
  const map = new Map<string, ColumnDef>();
  for (const s of slots) {
    const col = s.key.split('_')[1];  // 'K1_C4' → 'C4'
    let entry = map.get(col);
    if (!entry) {
      entry = { column: col, slotKeys: [], cats: [] };
      map.set(col, entry);
    }
    entry.slotKeys.push(s.key);
    if (!entry.cats.includes(s.cat)) entry.cats.push(s.cat);
  }
  // Orden por número de columna (C2 antes que C10 aunque aquí solo llega a C9)
  return [...map.values()].sort((a, b) =>
    parseInt(a.column.slice(1)) - parseInt(b.column.slice(1))
  );
}


/**
 * Los ciclos en los que se saca alguna nota, según la matriz del docente.
 *
 * Devuelve **null** cuando ningún slot trae ciclo, que es el caso de quien no
 * importó su matriz. Null significa "no se sabe", y no es lo mismo que "en
 * ninguno": con null la app no marca nada, en vez de decirle a todo el mundo
 * que sus nueve ciclos son formativos.
 */
export function ciclosConNota(slots: SlotDef[]): Set<number> | null {
  const conCiclo = slots.filter(s => s.ciclo != null && s.ciclo > 0);
  if (conCiclo.length === 0) return null;
  return new Set(conCiclo.map(s => s.ciclo!));
}

/** Las notas que se sacan en un ciclo. Vacío si ese ciclo no lleva nota. */
export function slotsDelCiclo(slots: SlotDef[], ciclo: number): SlotDef[] {
  return slots.filter(s => s.ciclo === ciclo);
}

/**
 * Cómo se llama cada categoría en el colegio.
 *
 * En pantalla iba `K·C` bajo cada columna, que no significa nada para quien no
 * armó la app. La letra es la del código; el nombre es el que el docente ve en
 * la plataforma y en el manual.
 */
export const NOMBRE_CATEGORIA: Record<SlotDef['cat'], string> = {
  K: 'Conocimiento',
  M: 'Método',
  U: 'Uso',
  C: 'Comunicación',
  E: 'Evaluación',
};

/** Qué aporta una columna real: su categoría y cuánto pesa dentro de ella. */
export interface AporteColumna {
  cat: SlotDef['cat'];
  nombre: string;
  /** 0..100, redondeado. */
  porcentaje: number;
  ciclo?: number;
  destino?: string;
}

/**
 * Lo que hace cada columna, en palabras.
 *
 * Una columna real puede alimentar más de una categoría —C4 entra en
 * Conocimiento y en Comunicación— así que devuelve una lista y no un valor.
 */
export function aportesDeColumna(slots: SlotDef[], column: string): AporteColumna[] {
  return slots
    .filter(s => s.key.split('_')[1] === column)
    .map(s => ({
      cat: s.cat,
      nombre: NOMBRE_CATEGORIA[s.cat],
      porcentaje: Math.round(s.weight * 100),
      ...(s.ciclo != null ? { ciclo: s.ciclo } : {}),
      ...(s.destino ? { destino: s.destino } : {}),
    }));
}
