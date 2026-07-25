/**
 * Exportador EFAS: consolidado institucional en XLSX.
 *
 * Una fila por curso con % aprobación (DEF ≥ 70) y % Experto+Aprendiz (DEF ≥ 80),
 * ordenados por CURSOS_ORDER (agrupados por grado). Cierra con fila TOTAL.
 */

import ExcelJS from 'exceljs';
import type { Course, Student } from '@/types';
import { CURSOS_ORDER, NOTA_APROBACION, NOTA_EXPERTO } from './constants';
import { computeCourseStats } from './stats';

export interface EfasRow {
  curso: string;
  activos: number;
  aprobando: number;
  aprobandoPct: number;
  experto: number;
  expertoPct: number;
  promedio: number;
}

export interface HonorRow {
  curso: string;
  nombre: string;
  def: number;
}

export interface EfasReport {
  filename: string;
  trimestre: number;
  rows: EfasRow[];
  totals: Omit<EfasRow, 'curso'>;
  honor: HonorRow[];
}

/** Calcula las filas EFAS + la lista de salón de honor a partir de los cursos. */
export function buildEfasRows(
  courses: Course[],
  studentsByCourse: Map<number, Student[]>,
): { rows: EfasRow[]; totals: Omit<EfasRow, 'curso'>; honor: HonorRow[] } {
  const rows: EfasRow[] = [];
  const honor: HonorRow[] = [];
  const ordered = [...courses].sort((a, b) => {
    const ai = CURSOS_ORDER.indexOf(parseInt(a.code));
    const bi = CURSOS_ORDER.indexOf(parseInt(b.code));
    return ai - bi;
  });

  let totalActivos = 0, totalAprob = 0, totalExp = 0, sumPromWeighted = 0;

  for (const c of ordered) {
    const students = studentsByCourse.get(c.id!) ?? [];
    const stats = computeCourseStats(students, c.grade);
    rows.push({
      curso: c.code,
      activos: stats.activos,
      aprobando: stats.aprobando,
      aprobandoPct: stats.aprobandoPct,
      experto: stats.experto,
      expertoPct: stats.expertoPct,
      promedio: stats.promedio,
    });
    for (const e of stats.expertos) {
      honor.push({ curso: c.code, nombre: e.student.nombre, def: e.def });
    }
    totalActivos += stats.activos;
    totalAprob += stats.aprobando;
    totalExp += stats.experto;
    sumPromWeighted += stats.promedio * stats.activos;
  }

  const totals: Omit<EfasRow, 'curso'> = {
    activos: totalActivos,
    aprobando: totalAprob,
    aprobandoPct: totalActivos ? Math.round((totalAprob / totalActivos) * 100) : 0,
    experto: totalExp,
    expertoPct: totalActivos ? Math.round((totalExp / totalActivos) * 100) : 0,
    promedio: totalActivos ? Math.round(sumPromWeighted / totalActivos) : 0,
  };

  return { rows, totals, honor };
}

/** Genera el Blob XLSX del EFAS con hoja Consolidado + hoja Salón de honor. */
export async function exportEfas(
  courses: Course[],
  studentsByCourse: Map<number, Student[]>,
  trimestre: number,
): Promise<{ blob: Blob; report: EfasReport }> {
  const { rows, totals, honor } = buildEfasRows(courses, studentsByCourse);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'planilla-app';
  const ws = wb.addWorksheet('EFAS');

  // Encabezado (título)
  const year = new Date().getFullYear();
  ws.mergeCells('A1:F1');
  const title = ws.getCell('A1');
  title.value = `EFAS · Consolidado Trimestre ${trimestre} · ${year}`;
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  // Encabezados de columna (fila 3, dejando fila 2 vacía para respiro)
  ws.addRow([]);
  ws.addRow([
    'CURSO',
    'No. de Estudiantes',
    `% Aprobación (≥${NOTA_APROBACION})`,
    `% Experto + Aprendiz (≥${NOTA_EXPERTO})`,
    'DEF promedio',
  ]);
  const hRow = ws.getRow(3);
  hRow.eachCell(c => {
    c.font = { bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    c.border = allBorders();
  });
  hRow.height = 32;

  // Filas de datos
  for (const r of rows) {
    const row = ws.addRow([
      r.curso,
      r.activos,
      r.aprobandoPct / 100,
      r.expertoPct / 100,
      r.promedio,
    ]);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).numFmt = '0%';
    row.getCell(4).numFmt = '0%';
    row.getCell(5).alignment = { horizontal: 'center' };
    row.eachCell(c => { c.border = allBorders(); });
    tintByAprobacion(row.getCell(3), r.aprobandoPct);
  }

  // Fila TOTAL
  const totalRow = ws.addRow([
    'TOTAL',
    totals.activos,
    totals.aprobandoPct / 100,
    totals.expertoPct / 100,
    totals.promedio,
  ]);
  totalRow.eachCell(c => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    c.border = allBorders();
    c.alignment = { ...(c.alignment ?? {}), horizontal: 'center' };
  });
  totalRow.getCell(3).numFmt = '0%';
  totalRow.getCell(4).numFmt = '0%';

  // Anchos
  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 24;
  ws.getColumn(4).width = 30;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 4;

  // Congelar encabezado
  ws.views = [{ state: 'frozen', ySplit: 3 }];

  // ---- Hoja 2: Salón de honor ----
  const hs = wb.addWorksheet('Salón de honor');
  hs.mergeCells('A1:D1');
  const hsTitle = hs.getCell('A1');
  hsTitle.value = `Salón de honor · DEF ≥ ${NOTA_EXPERTO} · Trimestre ${trimestre} · ${year}`;
  hsTitle.font = { bold: true, size: 14 };
  hsTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  hs.getRow(1).height = 24;

  hs.addRow([]);
  hs.addRow(['#', 'CURSO', 'ESTUDIANTE', 'DEF']);
  const hsHeader = hs.getRow(3);
  hsHeader.eachCell(c => {
    c.font = { bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    c.border = allBorders();
  });

  // Ya ordenados por curso (CURSOS_ORDER); resortear cada bloque por DEF desc
  const grouped = new Map<string, HonorRow[]>();
  for (const h of honor) {
    (grouped.get(h.curso) ?? grouped.set(h.curso, []).get(h.curso)!).push(h);
  }
  const sortedHonor: HonorRow[] = [];
  for (const [, list] of grouped) {
    list.sort((a, b) => b.def - a.def || a.nombre.localeCompare(b.nombre, 'es'));
    sortedHonor.push(...list);
  }

  sortedHonor.forEach((h, i) => {
    const row = hs.addRow([i + 1, h.curso, h.nombre, h.def]);
    row.getCell(1).alignment = { horizontal: 'right' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.eachCell(c => { c.border = allBorders(); });
    tintByDef(row.getCell(4), h.def);
  });

  hs.getColumn(1).width = 6;
  hs.getColumn(2).width = 10;
  hs.getColumn(3).width = 40;
  hs.getColumn(4).width = 10;
  hs.views = [{ state: 'frozen', ySplit: 3 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = `EFAS-${year}-T${trimestre}.xlsx`;

  return { blob, report: { filename, trimestre, rows, totals, honor: sortedHonor } };
}

// ---- helpers de estilo ----

function allBorders(): ExcelJS.Borders {
  const b = { style: 'thin' as const, color: { argb: 'FFB0B0B0' } };
  return { top: b, left: b, bottom: b, right: b } as ExcelJS.Borders;
}

function tintByAprobacion(cell: ExcelJS.Cell, pct: number) {
  const argb =
    pct >= 90 ? 'FFDCFCE7' :   // verde claro
    pct >= 75 ? 'FFFEF9C3' :   // amarillo claro
    pct >= 60 ? 'FFFFEDD5' :   // naranja claro
                'FFFECACA';    // rojo claro
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function tintByDef(cell: ExcelJS.Cell, def: number) {
  const argb =
    def >= 95 ? 'FFBBF7D0' :   // verde
    def >= 90 ? 'FFDCFCE7' :   // verde claro
                'FFECFCCB';    // lima claro (80-89)
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  cell.font = { bold: true };
}
