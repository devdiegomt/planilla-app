/**
 * Cálculo de la definitiva (DEF).
 *
 * Dos modos:
 *   - 'strict'       → los 0 cuentan como notas reales (lo que hace tu Excel Planilla).
 *   - 'platform'     → los 0 son "no calificado" y se ignoran (lo que hace la
 *                      plataforma del colegio, algoritmo confirmado 100% contra
 *                      la imagen del panel de 801 el 24-jul-2026).
 *
 * Reglas del modo 'platform':
 *   1) Por categoría K/M/U/C/E: promedio ponderado con los pesos internos,
 *      reescalando los pesos SOLO entre las subnotas > 0.
 *      Si todas las subnotas son 0 → Def de categoría = 0.
 *   2) Definitiva final: promedio simple de las categorías con Def > 0.
 *   3) Redondeo: half-up en el paso final (no banker's).
 */

import { SlotDef, CATEGORY_WEIGHT } from './constants';
import type { DefResult } from '@/types';

export type FormulaMode = 'strict' | 'platform';

/** Redondeo half-up escolar (Math.round hace half-away-from-zero en JS, sirve para positivos). */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/**
 * Calcula la definitiva y las 5 defs por categoría a partir de las 10 (u 11) subnotas.
 *
 * @param subnotas  Diccionario keyed por el slot.key de constants (ej. K1_C4, K2_C5, ...)
 * @param slots     El SLOT_MAP correspondiente al grado (SLOTS_8_10 o SLOTS_11)
 * @param mode      'strict' o 'platform'
 */
export function calcDef(
  subnotas: Record<string, number>,
  slots: SlotDef[],
  mode: FormulaMode = 'platform'
): DefResult {
  // Agrupar subnotas por categoría junto con su peso
  const byCat: Record<string, { s: number; w: number }[]> = {
    K: [], M: [], U: [], C: [], E: [],
  };
  for (const slot of slots) {
    const score = subnotas[slot.key] ?? 0;
    byCat[slot.cat].push({ s: score, w: slot.weight });
  }

  // Def por categoría
  const catDefs: Record<'K'|'M'|'U'|'C'|'E', number> = {
    K: 0, M: 0, U: 0, C: 0, E: 0,
  };

  for (const cat of ['K', 'M', 'U', 'C', 'E'] as const) {
    const items = byCat[cat];
    if (mode === 'strict') {
      catDefs[cat] = items.reduce((acc, { s, w }) => acc + s * w, 0);
    } else {
      // platform: ignorar subnotas 0, reescalar pesos
      const valid = items.filter(({ s }) => s > 0);
      if (valid.length === 0) {
        catDefs[cat] = 0;
      } else {
        const totalW = valid.reduce((acc, { w }) => acc + w, 0);
        catDefs[cat] = valid.reduce((acc, { s, w }) => acc + s * w, 0) / totalW;
      }
    }
  }

  // Definitiva
  let definitiva: number;
  if (mode === 'strict') {
    // Promedio ponderado 20/20/20/20/20
    const raw = (catDefs.K + catDefs.M + catDefs.U + catDefs.C + catDefs.E) * CATEGORY_WEIGHT;
    definitiva = roundHalfUp(raw);
  } else {
    // platform: promedio simple de categorías > 0
    const validCats = Object.values(catDefs).filter(v => v > 0);
    if (validCats.length === 0) {
      definitiva = 0;
    } else {
      const raw = validCats.reduce((a, b) => a + b, 0) / validCats.length;
      definitiva = roundHalfUp(raw);
    }
  }

  return { ...catDefs, definitiva };
}
