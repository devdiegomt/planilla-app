/**
 * Lectura de la cabecera de la plantilla Califica.
 *
 * Por qué existe: el exportador escribe las 10 u 11 notas **posicionalmente**,
 * asumiendo que el orden de los logros en la plantilla coincide con `SLOTS_8_10`
 * / `SLOTS_11`. Si el colegio cambia el set de logros, las notas caerían en el
 * logro equivocado sin ninguna señal.
 *
 * Los encabezados cambian cada trimestre (títulos y códigos `log_31`…), así que
 * la plantilla estática de `public/templates` solo sirve de molde: los
 * encabezados reales salen del .xls que se descarga de la plataforma
 * (`readPlatformCalifica`) y se guardan en el curso.
 *
 * El parser se auto-localiza buscando la fila que contiene 'COD_ALUM' en vez de
 * asumir números de fila fijos: la plantilla del colegio ya tiene el bloque de
 * encabezados desplazado respecto a lo que uno esperaría, y puede volver a
 * moverse.
 */

import type ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import type { Achievement } from '@/types';
import { normalizeName } from './utils';
import { slotsFor } from './constants';

export interface AchievementColumn {
  /** Índice de columna en la hoja (1-based, como ExcelJS). */
  col: number;
  /** Código interno de la plataforma: 'log_31'. */
  log: string;
  /** Descripción completa tal como viene: 'CONOCIMIENTO T3 - C4. CONDITIONAL…'. */
  desc: string;
  /** Columna real deducida de la descripción: 'C4'. */
  column: string;
  /** Categoría deducida: 'K' | 'M' | 'U' | 'C' | 'E'. */
  cat: string;
  /** Título sin el prefijo de categoría/trimestre: 'CONDITIONAL STATEMENTS.'. */
  title: string;
  /** Trimestre embebido en la descripción ('T3' → 3). */
  trimestre: number | null;
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

/** Lector de celdas 1-based, para compartir el parser entre ExcelJS y SheetJS. */
type CellReader = (row: number, col: number) => string;

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
 * Descompone 'CONOCIMIENTO T3 - C4. CONDITIONAL STATEMENTS.' en sus partes.
 * Devuelve null si la descripción no sigue el patrón del colegio.
 *
 * La plataforma no es consistente con la puntuación: en el T3 trae guion largo
 * ('MÉTODO T3 – C8.') y guion en vez de punto tras la columna ('C2 - VARIABLES').
 */
export function parseAchievementDesc(
  desc: string,
): { cat: string; column: string; title: string; trimestre: number } | null {
  const norm = normalizeName(desc);
  const m = norm.match(/^(.+?)\s+T(\d+)\s*[-–—]\s*C(\d+)(.*)$/);
  if (!m) return null;
  const prefix = m[1].trim();
  const hit = CAT_BY_PREFIX.find(c => prefix.startsWith(c.prefix));
  if (!hit) return null;
  // El título se toma del texto original para conservar tildes y minúsculas.
  const tail = desc.match(/C\d+\s*[.\-–—]?\s*(.*)$/);
  return {
    cat: hit.cat,
    column: `C${m[3]}`,
    title: (tail?.[1] ?? '').trim(),
    trimestre: parseInt(m[2]),
  };
}

function readHeaderWith(cell: CellReader): CalificaHeader {
  let headerRow = -1;
  const found = new Map<string, number>();

  for (let r = 1; r <= 30 && headerRow < 0; r++) {
    for (let c = 1; c <= 40; c++) {
      if (normLabel(cell(r, c)) === 'COD ALUM') {
        headerRow = r;
        break;
      }
    }
  }
  if (headerRow < 0) {
    throw new Error(
      'No se encontró la fila de encabezados (COD_ALUM) en el archivo Califica. ' +
      '¿Cambió el formato del colegio?',
    );
  }

  // Localizar cada metadato por su etiqueta, no por su posición: así un
  // desplazamiento de la plantilla se detecta en vez de corromper el archivo.
  for (let c = 1; c <= 40; c++) {
    const label = normLabel(cell(headerRow, c));
    if (label && !found.has(label)) found.set(label, c);
  }

  const need = (label: string): number => {
    const c = found.get(label);
    if (c == null) {
      throw new Error(`El archivo Califica no tiene la columna "${label}".`);
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
    const log = cell(headerRow, c).trim();
    if (!log) break;                                  // fin del bloque de logros
    const desc = cell(headerRow - 1, c).trim();
    const parsed = parseAchievementDesc(desc);
    achievements.push({
      col: c,
      log,
      desc,
      column: parsed?.column ?? '',
      cat: parsed?.cat ?? '',
      title: parsed?.title ?? '',
      trimestre: parsed?.trimestre ?? null,
    });
  }

  return { headerRow, firstDataRow: headerRow + 1, cols, firstGradeCol, achievements };
}

/**
 * Localiza la cabecera de una hoja ExcelJS y extrae las columnas de logros.
 *
 * Lanza si no encuentra la estructura: preferimos abortar la exportación a
 * producir un archivo cuyo mapeo no podemos garantizar.
 */
export function readCalificaHeader(ws: ExcelJS.Worksheet): CalificaHeader {
  return readHeaderWith((r, c) => cellText(ws, r, c));
}

export interface PlatformCalifica {
  grade: number;
  curso: string;
  periodo: number;
  codMat: string;
  achievements: AchievementColumn[];
  /** Roster del curso con su COD_ALUM; filas con código malformado se omiten. */
  estudiantes: { cod_alum: string; nombre: string }[];
  /** Nombres omitidos por COD_ALUM inválido. */
  omitidos: string[];
}

/**
 * Lee el Califica descargado de la plataforma (.xls o .xlsx).
 *
 * El grado y el periodo salen de la primera fila de estudiantes: la plataforma
 * no los pone en ningún otro lugar legible. El mismo archivo trae los
 * encabezados del trimestre y el COD_ALUM de cada estudiante del curso.
 */
export function readPlatformCalifica(buffer: ArrayBuffer): PlatformCalifica {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets['RepCalifica'] ?? wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El archivo no tiene hojas.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  const cell: CellReader = (r, c) => String(rows[r - 1]?.[c - 1] ?? '');

  const header = readHeaderWith(cell);
  const r = header.firstDataRow;
  const grade = parseInt(cell(r, header.cols.codGru));
  if (!grade) {
    throw new Error('El archivo no trae estudiantes, así que no se puede saber de qué grado es.');
  }
  const estudiantes: PlatformCalifica['estudiantes'] = [];
  const omitidos: string[] = [];
  for (let row = r; row <= rows.length; row++) {
    const nombre = cell(row, header.cols.nombre).trim();
    if (!nombre) break;                               // fin del roster
    const cod = cell(row, header.cols.codAlum).trim();
    if (/^\d{10}$/.test(cod)) estudiantes.push({ cod_alum: cod, nombre });
    else omitidos.push(nombre);
  }

  return {
    grade,
    curso: cell(r, header.cols.codCur).trim(),
    periodo: parseInt(cell(r, header.cols.codPer)),
    codMat: cell(r, header.cols.codMat).trim(),
    achievements: header.achievements,
    estudiantes,
    omitidos,
  };
}

/** Reconstruye las columnas de logros a partir de lo guardado en el curso. */
export function columnsFromStored(list: Achievement[]): AchievementColumn[] {
  return list.map((a, i) => {
    const parsed = a.desc ? parseAchievementDesc(a.desc) : null;
    return {
      col: i + 1,
      log: a.log,
      desc: a.desc ?? '',
      column: parsed?.column ?? '',
      cat: parsed?.cat ?? '',
      title: a.title,
      trimestre: parsed?.trimestre ?? null,
    };
  });
}

/**
 * Compara la cabecera contra los slots que la app asume para ese grado.
 * Devuelve la lista de discrepancias (vacía = todo bien).
 *
 * Se validan tres cosas por posición: que haya la misma cantidad de columnas,
 * que la columna real (C4, C7…) coincida y que la categoría coincida. Con eso
 * basta para descartar un reordenamiento o un cambio de plan de logros.
 */
export function validateHeaderAgainstSlots(
  header: { achievements: AchievementColumn[] },
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
      ? `· ${m.encontrado} en el archivo, se esperaban ${m.esperado}`
      : `· columna de notas ${m.pos}: se esperaba ${m.esperado}, el archivo trae ${m.encontrado}`)
    .join('\n');
  return (
    `Los encabezados del Califica no coinciden con el mapeo de logros de ${grade}°.\n${detalle}\n\n` +
    'Exportar así escribiría las notas en el logro equivocado. ' +
    'Revisa que el archivo sea del grado correcto; si el colegio cambió los logros, ' +
    'hay que ajustar el mapeo en constants.ts.'
  );
}
