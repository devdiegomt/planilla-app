/**
 * Exportador de Califica xlsx desde el estado en Dexie.
 *
 * Estrategia: descargar la plantilla estática (public/templates/Califica-*.xlsx),
 * abrirla con ExcelJS, sobrescribir B11 (título del curso) y las filas 14+ con
 * los estudiantes activos del curso, y devolver el Blob para descarga.
 *
 * Fuzzy matching pesca typos de nombre entre la Planilla del docente y el
 * consolidado del colegio (Califica-451). Ver utils.ts.
 */

import ExcelJS from 'exceljs';
import type { Course, Student, ExportReport } from '@/types';
import { CURSO_PALABRAS, GRADE_META, slotsFor, columnsFor } from './constants';
import { normalizeName, findFuzzyMatch } from './utils';

interface ExportParams {
  course: Course;
  students: Student[];                      // solo activos
  codAlumMap: Map<string, string>;          // {nombreNormalizado: cod}
  trimestre: number;
}

export async function exportCalifica(params: ExportParams): Promise<{ blob: Blob; report: ExportReport }> {
  const { course, students, codAlumMap, trimestre } = params;

  const cursoNum = parseInt(course.code);
  const cursoPalabras = CURSO_PALABRAS[cursoNum] ?? `CURSO ${cursoNum}`;
  const gradeNum = course.grade;
  const slots = slotsFor(gradeNum);
  const nSlots = slots.length;                   // 10 u 11
  const meta = GRADE_META[gradeNum];
  const codGru = String(gradeNum).padStart(2, '0').padEnd(5, ' ');
  const codCur = String(cursoNum).padEnd(10, ' ');
  const codPer = String(trimestre).padStart(2, '0');
  const isEleven = gradeNum === 11;

  const templateUrl = isEleven
    ? '/templates/Califica-11-template.xlsx'
    : '/templates/Califica-8-10-template.xlsx';

  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error(`No se pudo cargar la plantilla ${templateUrl}`);
  const templateBuffer = await res.arrayBuffer();

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const ws = workbook.getWorksheet('RepCalifica') ?? workbook.worksheets[0];

  // 1) Encabezado del curso
  ws.getCell('B11').value =
    `Curso:  ${cursoPalabras}  (${cursoNum})          Materia:${meta.materia}`;

  // 2) Guardar estilos de la fila plantilla (14) para replicar
  const templateRow = ws.getRow(14);
  const lastCol = 8 + nSlots;
  const styles: Partial<ExcelJS.Style>[] = [];
  for (let c = 2; c <= lastCol; c++) {
    const cell = templateRow.getCell(c);
    styles.push({
      font: { ...cell.font },
      alignment: cell.alignment ? { ...cell.alignment } : undefined,
      numFmt: cell.numFmt,
      border: cell.border ? { ...cell.border } : undefined,
      fill: cell.fill ? { ...cell.fill } : undefined,
    });
  }

  // 3) Escribir estudiantes
  const missingCods: string[] = [];
  const typoMatches: { planilla: string; califica: string; cod: string }[] = [];
  const allNames = Array.from(codAlumMap.keys());

  students.forEach((student, i) => {
    const row = ws.getRow(14 + i);
    const nameNorm = normalizeName(student.nombre);
    // El código de la fila manda: lo escribe `hydrateCodAlum` desde el JSON del
    // extractor de planilla-v2, viaja por el sync y ya resolvió los typos una
    // sola vez. El mapa del Califica-451 queda como respaldo para bases que
    // todavía no han corrido esa importación.
    let codAlum = student.codAlum || codAlumMap.get(nameNorm);
    if (!codAlum) {
      const fuzzy = findFuzzyMatch(nameNorm, allNames);
      if (fuzzy) {
        codAlum = codAlumMap.get(fuzzy)!;
        typoMatches.push({ planilla: student.nombre, califica: fuzzy, cod: codAlum });
      } else {
        codAlum = 'FALTA_COD_ALUM';
        missingCods.push(student.nombre);
      }
    }

    const values = [
      codPer,             // col B
      codCur,             // col C
      codGru,             // col D
      meta.codMat,        // col E
      meta.materia,       // col F
      codAlum,            // col G
      student.nombre,     // col H
      ...slots.map(slot => Math.round(student.subnotas[slot.key] ?? 0)),
    ];

    values.forEach((val, j) => {
      const cell = row.getCell(2 + j);
      cell.value = val;
      const style = styles[j];
      if (style.font)      cell.font      = style.font as ExcelJS.Font;
      if (style.alignment) cell.alignment = style.alignment as ExcelJS.Alignment;
      if (style.numFmt)    cell.numFmt    = style.numFmt;
      if (style.border)    cell.border    = style.border as ExcelJS.Borders;
      if (style.fill)      cell.fill      = style.fill as ExcelJS.Fill;
    });
    row.commit();
  });

  // 4) Limpiar filas sobrantes (por si la plantilla tenía más estudiantes)
  const lastNewRow = 14 + students.length - 1;
  for (let r = lastNewRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    for (let c = 2; c <= lastCol; c++) {
      row.getCell(c).value = null;
    }
  }

  // 5) Serializar
  const outBuffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const filename = `Califica-${cursoNum}-${meta.codMat}-${codPer}.xlsx`;
  return {
    blob,
    report: {
      ok: true,
      curso: cursoNum,
      nEstudiantesEscritos: students.length,
      estudiantesSinCodAlum: missingCods,
      typoMatches,
      filename,
    },
  };
}

// ---- Observaciones de nota ----

export interface ObsExportReport {
  filename: string;
  rows: number;                        // observaciones exportadas
  studentsWithObs: number;             // estudiantes que tienen al menos una
}

/**
 * Exporta las observaciones docentes por columna a un XLSX plano.
 *
 * Diseño intencional: una fila por observación, no una fila por estudiante.
 * Facilita filtrar en Excel por columna ("todas las C7 con observación"),
 * por rango de nota ("todos los reprobados con comentario"), o pegar el
 * texto en un informe. La nota va en columna propia para que ordenar por
 * ella agrupe reprobados arriba.
 */
export async function exportObservations(
  course: Course,
  students: Student[],                 // activos
): Promise<{ blob: Blob; report: ObsExportReport } | null> {
  const columns = columnsFor(course.grade);
  const colBySlot = new Map<string, { column: string; cats: string[] }>();
  for (const c of columns) {
    for (const k of c.slotKeys) colBySlot.set(k, { column: c.column, cats: c.cats });
  }

  interface ObsRow {
    nombre: string;
    column: string;
    cats: string;
    nota: number;
    obs: string;
  }
  const rows: ObsRow[] = [];
  const studentsWithObs = new Set<string>();

  for (const s of students) {
    const obs = s.noteObservations ?? {};
    for (const [col, text] of Object.entries(obs)) {
      if (!text?.trim()) continue;
      // La columna en el dict es real ('C4', 'C7', ...). El valor vive en
      // el primer slot que la usa (ambos slots tienen el mismo valor por
      // el propagador de updateColumnValue).
      const columnDef = columns.find(c => c.column === col);
      const slot = columnDef?.slotKeys[0];
      const nota = slot ? (s.subnotas[slot] ?? 0) : 0;
      rows.push({
        nombre: s.nombre,
        column: col,
        cats: columnDef?.cats.join('·') ?? '',
        nota: Math.round(nota),
        obs: text.trim(),
      });
      studentsWithObs.add(s.nombre);
    }
  }

  if (rows.length === 0) return null;

  rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')
    || (parseInt(a.column.slice(1)) - parseInt(b.column.slice(1))));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Obs ${course.code}`);

  ws.columns = [
    { header: 'Estudiante', key: 'nombre', width: 34 },
    { header: 'Col',        key: 'column', width: 6  },
    { header: 'Cat',        key: 'cats',   width: 8  },
    { header: 'Nota',       key: 'nota',   width: 6  },
    { header: 'Observación', key: 'obs',   width: 60 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of rows) {
    const excelRow = ws.addRow(r);
    excelRow.getCell('obs').alignment = { wrapText: true, vertical: 'top' };
    excelRow.getCell('nota').alignment = { horizontal: 'center' };
    // Reprobados destacan: mismo criterio que el input rojo en la grilla.
    if (r.nota > 0 && r.nota < 70) {
      excelRow.getCell('nota').font = { bold: true, color: { argb: 'FFB91C1C' } };
    }
  }

  const outBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const filename = `Observaciones-${course.code}-${course.year}-T${course.trimestre}.xlsx`;
  return {
    blob,
    report: { filename, rows: rows.length, studentsWithObs: studentsWithObs.size },
  };
}
