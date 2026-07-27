/**
 * Importador de PLANILLA-NOTAS-XXXX.xlsx
 *
 * Detecta automáticamente:
 *   - la fila donde arrancan los estudiantes (busca la primera con COD numérico en col A);
 *   - si es curso de 8°-10° (10 subnotas en cols 44-53) o de 11° (11 subnotas en cols 80-90).
 *
 * Cada hoja de curso se procesa a un `Course` + array de `Student`.
 * Se descartan hojas EFAS/PENDIENTE y las auxiliares numéricas ("27", "28", ...).
 *
 * Port fiel del Python parse_planilla.py — validado 100% (536/539 matches strict
 * al 24-jul-2026; los 3 mismatches son bugs de fórmula en la Planilla del docente).
 */

import * as XLSX from 'xlsx';
import type { Course, Student, CycleData } from '@/types';
import { DIRECTORES, SLOTS_8_10, SLOTS_11 } from './constants';

interface ImportResult {
  courses: (Course & { students: Omit<Student, 'id' | 'courseId' | 'courseCode'>[] })[];
  warnings: string[];
}

/** Convierte una celda AOA (Array of Arrays) a número o 0. */
function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

/** Convierte una celda AOA a booleano (TRUE/FALSE del Excel). */
function bool(v: unknown): boolean {
  return v === true || v === 'TRUE' || v === 1;
}

/** Convierte una celda AOA a string o undefined. */
function str(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return String(v);
}

/**
 * Busca la primera fila donde col A es un número > 0 y col B tiene contenido.
 * Devuelve el índice 0-based en el AOA.
 */
function findFirstStudentRow(aoa: unknown[][], maxScan = 15): number {
  for (let r = 0; r < Math.min(aoa.length, maxScan); r++) {
    const row = aoa[r] || [];
    const cod = row[0];
    const name = row[1];
    if (typeof cod === 'number' && cod > 0 && name) return r;
  }
  return -1;
}

/**
 * Parsea una hoja de 8°-10°.
 * Layout: 9 ciclos × [F, R, NOTA, OBS] desde col 2 (0-indexed).
 * 10 subnotas agregadas en cols 43-52.
 * DEF de la hoja en col 53.
 */
function parseCourse810(aoa: unknown[][], code: string, director: string, trimestre: number): (Course & { students: Omit<Student, 'id' | 'courseId' | 'courseCode'>[] }) {
  const startRow = findFirstStudentRow(aoa);
  if (startRow < 0) throw new Error(`No se encontró la primera fila de estudiantes en ${code}`);

  const students: Omit<Student, 'id' | 'courseId' | 'courseCode'>[] = [];
  let r = startRow;
  while (r < aoa.length) {
    const row = aoa[r] || [];
    const cod = row[0];
    const name = row[1];
    if (typeof cod !== 'number' || cod <= 0 || !name) {
      if (students.length > 0 && r > startRow + students.length + 3) break;
      r++;
      continue;
    }

    // 9 ciclos × 4 columnas
    const cycles: CycleData[] = [];
    for (let i = 0; i < 9; i++) {
      const base = 2 + i * 4;  // col 2 = 3ra columna (0-indexed): F del ciclo 1
      cycles.push({
        ciclo: i + 1,
        F: bool(row[base]),
        R: bool(row[base + 1]),
        nota: num(row[base + 2]),
        obs: str(row[base + 3]) ?? null,
      });
    }

    // 10 subnotas en cols 43-52 (0-indexed)
    const subnotas: Record<string, number> = {};
    for (let i = 0; i < SLOTS_8_10.length; i++) {
      subnotas[SLOTS_8_10[i].key] = num(row[43 + i]);
    }

    students.push({
      codAlum: '',                                     // se llena por el exportador con el mapa global
      nombre: String(name).trim(),
      order: cod,
      cycles,
      subnotas,
      withdrawnAt: null,
    });
    r++;
  }

  return {
    code,
    grade: Math.floor(parseInt(code) / 100),
    director,
    year: new Date().getFullYear(),
    trimestre,
    cyclesActive: Array(9).fill(true),
    updatedAt: new Date().toISOString(),
    students,
  };
}

/**
 * Parsea una hoja de 11°.
 * Layout: 9 ciclos × 8 cols [F1, R1, N1, F2, R2, N2, NOTA, OBS] desde col 2.
 * 11 subnotas agregadas en cols 79-89.
 */
function parseCourse11(aoa: unknown[][], code: string, director: string, trimestre: number): (Course & { students: Omit<Student, 'id' | 'courseId' | 'courseCode'>[] }) {
  const startRow = findFirstStudentRow(aoa);
  if (startRow < 0) throw new Error(`No se encontró la primera fila de estudiantes en ${code}`);

  const students: Omit<Student, 'id' | 'courseId' | 'courseCode'>[] = [];
  let r = startRow;
  while (r < aoa.length) {
    const row = aoa[r] || [];
    const cod = row[0];
    const name = row[1];
    if (typeof cod !== 'number' || cod <= 0 || !name) {
      if (students.length > 0 && r > startRow + students.length + 3) break;
      r++;
      continue;
    }

    // 9 ciclos × 8 columnas (2 sesiones + nota + obs)
    const cycles: CycleData[] = [];
    for (let i = 0; i < 9; i++) {
      const base = 2 + i * 8;
      cycles.push({
        ciclo: i + 1,
        F: bool(row[base]) || bool(row[base + 3]),  // F consolidada = F de cualquier sesión
        R: bool(row[base + 1]) || bool(row[base + 4]),
        nota: num(row[base + 6]),
        obs: str(row[base + 7]) ?? null,
        S1: { F: bool(row[base]),     R: bool(row[base + 1]), N: num(row[base + 2]) },
        S2: { F: bool(row[base + 3]), R: bool(row[base + 4]), N: num(row[base + 5]) },
      });
    }

    // 11 subnotas en cols 79-89 (0-indexed)
    const subnotas: Record<string, number> = {};
    for (let i = 0; i < SLOTS_11.length; i++) {
      subnotas[SLOTS_11[i].key] = num(row[79 + i]);
    }

    students.push({
      codAlum: '',
      nombre: String(name).trim(),
      order: cod,
      cycles,
      subnotas,
      withdrawnAt: null,
    });
    r++;
  }

  return {
    code,
    grade: 11,
    director,
    year: new Date().getFullYear(),
    trimestre,
    cyclesActive: Array(9).fill(true),
    updatedAt: new Date().toISOString(),
    students,
  };
}

/**
 * Parsea un archivo Planilla completo (ArrayBuffer del File).
 *
 * Convención de nombre de hoja: "801 (S1)", "1101 (S7)", etc.
 * Se extrae el código del curso y el director (segundo puede sobrescribirse por DIRECTORES).
 */
export async function importPlanilla(buffer: ArrayBuffer, trimestre = 2): Promise<ImportResult> {
  const wb = XLSX.read(buffer, { type: 'array' });
  const result: ImportResult = { courses: [], warnings: [] };

  for (const sheetName of wb.SheetNames) {
    if (!/^\d/.test(sheetName) || !sheetName.includes('(')) continue;    // saltar EFAS, PENDIENTE, hojas '27'..'32'
    const codeMatch = sheetName.match(/^(\d+)/);
    if (!codeMatch) continue;
    const code = codeMatch[1];
    const courseNum = parseInt(code);

    // Título del curso está en A1 con formato "801 (DIANA GAVIRIA)"
    const sheet = wb.Sheets[sheetName];
    const title = sheet['A1']?.v as string | undefined;
    let director = DIRECTORES[courseNum] ?? '';
    if (title && title.includes('(')) {
      const m = title.match(/\(([^)]+)\)/);
      if (m) director = m[1].trim();
    }

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });

    try {
      const course = code.startsWith('11')
        ? parseCourse11(aoa, code, director, trimestre)
        : parseCourse810(aoa, code, director, trimestre);
      result.courses.push(course);
    } catch (err) {
      result.warnings.push(`${sheetName}: ${(err as Error).message}`);
    }
  }

  return result;
}

/**
 * Parsea el Califica-451 consolidado (una hoja por curso).
 * Devuelve un mapa {nombreNormalizado: codAlum} para hidratar los importados.
 */
export async function importCodAlumMap(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const wb = XLSX.read(buffer, { type: 'array' });
  const map = new Map<string, string>();
  const { normalizeName } = await import('./utils');

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    // Los estudiantes empiezan en la fila 14 (índice 13). Col G (idx 6) = COD_ALUM, col H (idx 7) = nombre.
    for (let r = 13; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const cod = row[6];
      const name = row[7];
      if (cod && name && typeof name === 'string') {
        map.set(normalizeName(name), String(cod).trim());
      }
    }
  }
  return map;
}