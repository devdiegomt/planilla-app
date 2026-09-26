/**
 * Exportador EFAS: consolidado institucional en XLSX.
 *
 * Una fila por curso con % aprobación (DEF ≥ 70) y % Experto+Aprendiz (DEF ≥ 80),
 * ordenados por código de curso (agrupados por grado). Cierra con fila TOTAL.
 */

import ExcelJS from 'exceljs';
import type { Course, Student, TrimesterSnapshot } from '@/types';
import { NOTA_APROBACION, NOTA_EXPERTO, type ConSlots } from './constants';
import { compareCourseCodes } from './courseOrder';
import { definitivaDe } from './historial';

export interface EfasRow {
  curso: string;
  activos: number;
  /**
   * Activos de ese curso que NO tienen definitiva en el trimestre pedido.
   *
   * Quedan FUERA de todas las cuentas. No hay dato no es lo mismo que cero: un
   * estudiante sin nota de T1 no está perdiendo T1 — es que ese trimestre no
   * se cerró en la app ni se importó de la plataforma. Contarlos como 0
   * hundiría el promedio del curso y el porcentaje de aprobación con
   * estudiantes que nadie calificó mal.
   */
  sinDato: number;
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

/**
 * Calcula las filas EFAS + el salón de honor, **para el trimestre pedido**.
 *
 * Antes salía siempre del trimestre en curso: `buildEfasRows` ni siquiera
 * recibía el trimestre, así que el selector solo cambiaba el título del
 * archivo. Elegir T1 generaba el T3 con el rótulo equivocado, que es peor que
 * no dejar elegir.
 *
 * Ahora cada definitiva sale de `definitivaDe`, la misma regla que usa la
 * línea `T1 · T2 · T3` de la pantalla del curso: el trimestre en curso lo
 * calcula la app, los pasados salen del cierre propio, y lo importado de la
 * plataforma solo rellena los que nunca se cerraron acá.
 */
export function buildEfasRows(
  courses: Course[],
  studentsByCourse: Map<number, Student[]>,
  subjects: ConSlots[] | undefined,
  trimestre: number,
  /** Cierres archivados, agrupados por `studentSyncId`. */
  cierresByStudent: Map<string, Pick<TrimesterSnapshot, 'trimestre' | 'year' | 'definitiva'>[]>,
): { rows: EfasRow[]; totals: Omit<EfasRow, 'curso'>; honor: HonorRow[] } {
  const rows: EfasRow[] = [];
  const honor: HonorRow[] = [];
  const ordered = [...courses].sort((a, b) => compareCourseCodes(a.code, b.code));

  let totalActivos = 0, totalAprob = 0, totalExp = 0, totalSinDato = 0, sumaDefs = 0;

  for (const c of ordered) {
    const activos = (studentsByCourse.get(c.id!) ?? []).filter(s => !s.withdrawnAt);

    const conDef: { nombre: string; def: number }[] = [];
    let sinDato = 0;
    for (const s of activos) {
      const d = definitivaDe(s, c, trimestre, cierresByStudent.get(s.syncId ?? '') ?? [], subjects);
      if (d.valor == null || d.valor <= 0) { sinDato++; continue; }
      conDef.push({ nombre: s.nombre, def: d.valor });
    }

    const n = conDef.length;
    const aprobando = conDef.filter(x => x.def >= NOTA_APROBACION).length;
    const experto = conDef.filter(x => x.def >= NOTA_EXPERTO).length;
    const suma = conDef.reduce((a, x) => a + x.def, 0);

    rows.push({
      curso: c.code,
      activos: n,
      sinDato,
      aprobando,
      aprobandoPct: n ? Math.round((aprobando / n) * 100) : 0,
      experto,
      expertoPct: n ? Math.round((experto / n) * 100) : 0,
      promedio: n ? Math.round(suma / n) : 0,
    });

    for (const e of conDef.filter(x => x.def >= NOTA_EXPERTO).sort((a, b) => b.def - a.def)) {
      honor.push({ curso: c.code, nombre: e.nombre, def: e.def });
    }

    totalActivos += n;
    totalAprob += aprobando;
    totalExp += experto;
    totalSinDato += sinDato;
    // El total promedia sobre los estudiantes, no sobre los cursos: sumando
    // las definitivas y no los promedios, un curso de 12 no pesa igual que
    // uno de 30.
    sumaDefs += suma;
  }

  const totals: Omit<EfasRow, 'curso'> = {
    activos: totalActivos,
    sinDato: totalSinDato,
    aprobando: totalAprob,
    aprobandoPct: totalActivos ? Math.round((totalAprob / totalActivos) * 100) : 0,
    experto: totalExp,
    expertoPct: totalActivos ? Math.round((totalExp / totalActivos) * 100) : 0,
    promedio: totalActivos ? Math.round(sumaDefs / totalActivos) : 0,
  };

  return { rows, totals, honor };
}

/** Genera el Blob XLSX del EFAS con hoja Consolidado + hoja Salón de honor. */
export async function exportEfas(
  courses: Course[],
  studentsByCourse: Map<number, Student[]>,
  trimestre: number,
  subjects: ConSlots[] | undefined,
  cierresByStudent: Map<string, Pick<TrimesterSnapshot, 'trimestre' | 'year' | 'definitiva'>[]>,
): Promise<{ blob: Blob; report: EfasReport }> {
  const { rows, totals, honor } = buildEfasRows(
    courses, studentsByCourse, subjects, trimestre, cierresByStudent);

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

  // Ya ordenados por curso; resortear cada bloque por DEF desc
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
