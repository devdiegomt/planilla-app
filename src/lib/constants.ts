/**
 * Metadata institucional del colegio GLA — constantes derivadas del análisis
 * de las 19 planillas y del Califica-451 (consolidado 2026).
 */

/** COD_MAT y nombre de materia por grado (nivel académico). */
export const GRADE_META: Record<number, { codMat: string; materia: string }> = {
  8:  { codMat: '2508', materia: 'Information Technology' },
  9:  { codMat: '2509', materia: 'Information Technology' },
  10: { codMat: '2510', materia: 'Information Technology' },
  11: { codMat: '3011', materia: 'Informática y tecnología' },
};

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

/** Directores de grupo 2026. */
export const DIRECTORES: Record<number, string> = {
  801: 'Diana Gaviria', 802: 'Jose Morales', 803: 'Juan Sanmartín',
  804: 'Tatiana Wild', 805: 'Carol Largo', 806: 'Alejandra Numpaque',
  901: 'Mónica Arango', 902: 'Natalia Chacón', 903: 'David Torres',
  904: 'Gabriela Lozada', 905: 'Sandy Jiménez',
  1001: 'Andrés Carvajal', 1002: 'Fernando Izquierdo',
  1003: 'Marcela Dávila', 1004: 'Verónica Sarmiento',
  1101: 'Julián Ortiz', 1102: 'Luisa Gil',
  1103: 'Wilmar Bedoya', 1104: 'Heidy Chávez',
};

/** Categoría + peso interno para cada subnota, en el orden que aparecen en el Califica. */
export type SlotDef = { key: string; cat: 'K'|'M'|'U'|'C'|'E'; weight: number };

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

/** Devuelve los slots de subnotas correctos según el grado del curso. */
export function slotsFor(grade: number): SlotDef[] {
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

export function columnsFor(grade: number): ColumnDef[] {
  const slots = slotsFor(grade);
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

/** Los 19 cursos que el docente maneja actualmente. */
export const CURSOS_ORDER = [
  801, 802, 803, 804, 805, 806,
  901, 902, 903, 904, 905,
  1001, 1002, 1003, 1004,
  1101, 1102, 1103, 1104,
];
