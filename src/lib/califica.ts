/**
 * Lectura de la cabecera de la plantilla Califica.
 *
 * Por qué existe: el exportador escribe las 10 u 11 notas **posicionalmente**,
 * asumiendo que el orden de los logros en la plantilla coincide con `SLOTS_8_10`
 * / `SLOTS_11`. Hoy coincide, pero nadie lo comprobaba. Si el colegio cambia el
 * set de logros —y las descripciones traen el trimestre embebido, así que la
 * plantilla del T3 será distinta por definición— las notas caerían en el logro
 * equivocado sin ninguna señal.
 *
 * De paso, la plantilla ya trae el nombre real de cada logro
 * ('C4. ORGANIZING CONTENT WITH BASIC LAYOUT'), que la app mostraba como un
 * escueto 'C4'.
 *
 * El parser se auto-localiza buscando la fila que contiene 'COD_ALUM' en vez de
 * asumir números de fila fijos: la plantilla del colegio ya tiene el bloque de
 * encabezados desplazado respecto a lo que uno esperaría, y puede volver a
 * moverse.
 */

import type ExcelJS from 'exceljs';
import { normalizeName } from './utils';
import { slotsFor } from './constants';

export interface AchievementColumn {
  /** Índice de columna en la hoja (1-based, como ExcelJS). */
  col: number;
  /** Código interno de la plataforma: 'log_21'. */
  log: string;
  /** Descripción completa tal como viene: 'CONOCIMIENTO T2 - C4. ORGANIZING…'. */
  desc: string;
  /** Columna real deducida de la descripción: 'C4'. */
  column: string;
  /** Categoría deducida: 'K' | 'M' | 'U' | 'C' | 'E'. */
  cat: string;
  /** Título sin el prefijo de categoría/trimestre: 'ORGANIZING CONTENT…'. */
  title: string;
}

export interface HeaderMismatch {
  /** Posición (1-based) de la columna de notas donde se detectó el problema. */
  pos: number;
  esperado: string;
  encontrado: string;
}

/** Posición de cada columna de metadatos, localizada por su etiqueta. */
export interface CalificaCols {
  codPer: number;
  codCur: number;
  codGru: number;
  codMat: number;
  materia: number;
  codAlum: number;
  nombre: number;
}

export interface CalificaHeader {
  /** Fila donde vive la cabecera ('COD_ALUM'). */
  headerRow: number;
  /** Primera fila de estudiantes. */
  firstDataRow: number;
  cols: CalificaCols;
  /** Primera columna de notas. */
  firstGradeCol: number;
  achievements: AchievementColumn[];
}

/**
 * Normaliza una etiqueta de encabezado para compararla.
 *
 * `normalizeName` no toca los guiones bajos, así que 'COD_ALUM' nunca igualaría
 * a 'COD ALUM'. Aquí se unifican guiones bajos y espacios.
 */
function normLabel(s: string): string {
  return normalizeName(s.replace(/_/g, ' '));
}

/** Prefijo de la descripción → categoría interna. */
const CAT_BY_PREFIX: { prefix: string; cat: string }[] = [
  { prefix: 'CONOCIMIENTO', cat: 'K' },
  { prefix: 'METODO', cat: 'M' },
  { prefix: 'USO', cat: 'U' },
  { prefix: 'COMUNICACION', cat: 'C' },
  { prefix: 'EVA', cat: 'E' },          // 'EVA. TRIMESTRAL'
];

function cellText(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const v = ws.getRow(row).getCell(col).value;
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in v) {
    return (v.richText as { text: string }[]).map(t => t.text).join('');
  }
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
  return String(v);
}

/**
 * Descompone 'CONOCIMIENTO T2 - C4. ORGANIZING CONTENT' en sus partes.
 * Devuelve null si la descripción no sigue el patrón del colegio.
 */
export function parseAchievementDesc(
  desc: string,
): { cat: string; column: string; title: string } | null {
  const norm = normalizeName(desc);
  const m = norm.match(/^(.+?)\s+T\d+\s*-\s*C(\d+)\.?\s*(.*)$/);
  if (!m) return null;
  const prefix = m[1].trim();
  const hit = CAT_BY_PREFIX.find(c => prefix.startsWith(c.prefix));
  if (!hit) return null;
  // El título se toma del texto original para conservar tildes y minúsculas.
  const tail = desc.match(/C\d+\.?\s*(.*)$/);
  return {
    cat: hit.cat,
    column: `C${m[2]}`,
    title: (tail?.[1] ?? '').trim(),
  };
}

/**
 * Localiza la cabecera y extrae las columnas de logros.
 *
 * Lanza si no encuentra la estructura: preferimos abortar la exportación a
 * producir un archivo cuyo mapeo no podemos garantizar.
 */
export function readCalificaHeader(ws: ExcelJS.Worksheet): CalificaHeader {
  let headerRow = -1;
  const found = new Map<string, number>();

  for (let r = 1; r <= 30 && headerRow < 0; r++) {
    for (let c = 1; c <= 40; c++) {
      if (normLabel(cellText(ws, r, c)) === 'COD ALUM') {
        headerRow = r;
        break;
      }
    }
  }
  if (headerRow < 0) {
    throw new Error(
      'No se encontró la fila de encabezados (COD_ALUM) en la plantilla Califica. ' +
      '¿Cambió el formato del colegio?',
    );
  }

  // Localizar cada metadato por su etiqueta, no por su posición: así un
  // desplazamiento de la plantilla se detecta en vez de corromper el archivo.
  for (let c = 1; c <= 40; c++) {
    const label = normLabel(cellText(ws, headerRow, c));
    if (label && !found.has(label)) found.set(label, c);
  }

  const need = (label: string): number => {
    const c = found.get(label);
    if (c == null) {
      throw new Error(`La plantilla Califica no tiene la columna "${label}".`);
    }
    return c;
  };

  const cols: CalificaCols = {
    codPer:  need('COD PER'),
    codCur:  need('COD CUR'),
    codGru:  need('COD GRU'),
    codMat:  need('COD MAT'),
    materia: need('NOMBRE MATERIA'),
    codAlum: need('COD ALUM'),
    nombre:  need('NOMBRE ALUMNO'),
  };

  const firstGradeCol = cols.nombre + 1;
  const achievements: AchievementColumn[] = [];

  for (let c = firstGradeCol; c <= firstGradeCol + 20; c++) {
    const log = cellText(ws, headerRow, c).trim();
    if (!log) break;                                  // fin del bloque de logros
    const desc = cellText(ws, headerRow - 1, c).trim();
    const parsed = parseAchievementDesc(desc);
    achievements.push({
      col: c,
      log,
      desc,
      column: parsed?.column ?? '',
      cat: parsed?.cat ?? '',
      title: parsed?.title ?? '',
    });
  }

  return { headerRow, firstDataRow: headerRow + 1, cols, firstGradeCol, achievements };
}

/**
 * Compara la cabecera de la plantilla contra los slots que la app asume para
 * ese grado. Devuelve la lista de discrepancias (vacía = todo bien).
 *
 * Se validan tres cosas por posición: que haya la misma cantidad de columnas,
 * que la columna real (C4, C7…) coincida y que la categoría coincida. Con eso
 * basta para descartar un reordenamiento o un cambio de plan de logros.
 */
export function validateHeaderAgainstSlots(
  header: CalificaHeader,
  grade: number,
): HeaderMismatch[] {
  const slots = slotsFor(grade);
  const out: HeaderMismatch[] = [];

  if (header.achievements.length !== slots.length) {
    out.push({
      pos: 0,
      esperado: `${slots.length} columnas de logros`,
      encontrado: `${header.achievements.length}`,
    });
    return out;      // con distinta cantidad, comparar por posición no informa
  }

  header.achievements.forEach((a, i) => {
    const slot = slots[i];
    const expectedColumn = slot.key.split('_')[1];
    if (!a.column || !a.cat) {
      out.push({
        pos: i + 1,
        esperado: `${expectedColumn} (${slot.cat})`,
        encontrado: `descripción ilegible: "${a.desc || a.log}"`,
      });
      return;
    }
    if (a.column !== expectedColumn || a.cat !== slot.cat) {
      out.push({
        pos: i + 1,
        esperado: `${expectedColumn} (${slot.cat})`,
        encontrado: `${a.column} (${a.cat}) · ${a.log}`,
      });
    }
  });

  return out;
}

/** Mensaje accionable para abortar la exportación. */
export function describeMismatches(ms: HeaderMismatch[], grade: number): string {
  const detalle = ms
    .map(m => m.pos === 0
      ? `· ${m.encontrado} en la plantilla, se esperaban ${m.esperado}`
      : `· columna de notas ${m.pos}: se esperaba ${m.esperado}, la plantilla trae ${m.encontrado}`)
    .join('\n');
  return (
    `La plantilla Califica no coincide con el mapeo de logros de ${grade}°.\n${detalle}\n\n` +
    'Exportar así escribiría las notas en el logro equivocado. ' +
    'Actualiza la plantilla en public/templates o el mapeo en constants.ts.'
  );
}
