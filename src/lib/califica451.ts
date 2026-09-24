/**
 * Califica de todos los cursos: se descarga de la plataforma (pantalla "por
 * profesor", una hoja por curso), se llenan las notas y se devuelve el mismo
 * archivo para importarlo de una vez.
 *
 * Por qué sobre el archivo descargado y no sobre una plantilla: el orden de
 * las filas, los códigos y los encabezados del trimestre salen de la propia
 * plataforma. La app solo pone notas, buscando a cada estudiante por COD_ALUM.
 * Así no puede reordenar filas, perder un estudiante ni escribir encabezados
 * de otro trimestre.
 *
 * Regla de seguridad: si la app tiene 0 (sin calificar) y la plataforma ya
 * tiene una nota, se conserva la de la plataforma. No sabemos todavía qué hace
 * Importar con celdas en 0; mejor no borrar lo que ya está cargado.
 */

import * as XLSX from 'xlsx';
import type { Course, Student } from '@/types';
import { slotsFor, type ConSlots } from './constants';
import {
  validateHeaderAgainstSlots, describeMismatches, type PlatformCalifica,
} from './califica';

export interface CourseFillReport {
  hoja: string;
  curso: string;
  /** Si es null la hoja se llenó; si no, se dejó intacta por este motivo. */
  omitido: string | null;
  /** Celdas de nota que cambiaron. */
  escritas: number;
  /** App en 0 y plataforma con nota: se dejó la de la plataforma. */
  conservadas: { nombre: string; log: string; plataforma: number }[];
  /** Filas de la plataforma sin estudiante activo en la app: quedan intactas. */
  soloPlataforma: string[];
  /** Activos de la app sin fila en la plataforma: sus notas no van en el archivo. */
  soloApp: string[];
}

export function fillPlatformWorkbook(
  wb: XLSX.WorkBook,
  sheets: { name: string; data: PlatformCalifica }[],
  courses: Map<string, Course>,
  activosPorCurso: Map<string, Student[]>,
  subjects: ConSlots[] | undefined,
): CourseFillReport[] {
  return sheets.map(({ name, data }) => {
    const rep: CourseFillReport = {
      hoja: name, curso: data.curso, omitido: null,
      escritas: 0, conservadas: [], soloPlataforma: [], soloApp: [],
    };
    const course = courses.get(data.curso);
    if (!course) {
      rep.omitido = 'El curso no existe en la app.';
      return rep;
    }
    if (data.grade !== course.grade) {
      rep.omitido = `La hoja es de ${data.grade}° y el curso en la app es de ${course.grade}°.`;
      return rep;
    }
    if (data.periodo !== course.trimestre) {
      rep.omitido = `La hoja es del T${data.periodo} y el curso está en T${course.trimestre}.`;
      return rep;
    }
    const ms = validateHeaderAgainstSlots(data, course.grade, subjects);
    if (ms.length > 0) {
      rep.omitido = describeMismatches(ms, course.grade);
      return rep;
    }

    const ws = wb.Sheets[name];
    const slots = slotsFor(course.grade, subjects);
    const activos = activosPorCurso.get(course.code) ?? [];
    const porCodigo = new Map(activos.filter(s => s.codAlum).map(s => [s.codAlum!, s]));
    const usados = new Set<Student>();

    for (const e of data.estudiantes) {
      const s = porCodigo.get(e.cod_alum);
      if (!s) {
        rep.soloPlataforma.push(e.nombre);
        continue;
      }
      usados.add(s);
      slots.forEach((slot, i) => {
        const addr = XLSX.utils.encode_cell({ r: e.fila - 1, c: data.header.firstGradeCol + i - 1 });
        const actual = ws[addr] as XLSX.CellObject | undefined;
        const plataforma = Number(actual?.v) || 0;
        const app = Math.round(s.subnotas[slot.key] ?? 0);
        if (app === plataforma) return;
        if (app === 0) {
          rep.conservadas.push({ nombre: e.nombre, log: data.achievements[i].log, plataforma });
          return;
        }
        const nueva: XLSX.CellObject = { ...(actual ?? {}), t: 'n', v: app };
        delete nueva.w;                               // el texto formateado viejo mentiría
        ws[addr] = nueva;
        rep.escritas++;
      });
    }

    rep.soloApp = activos
      .filter(s => !usados.has(s))
      .map(s => s.codAlum ? s.nombre : `${s.nombre} (sin código)`);
    return rep;
  });
}

/** Serializa en el mismo formato que entrega la plataforma (.xls BIFF8). */
export function writeWorkbookXls(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { bookType: 'xls', type: 'array' }) as ArrayBuffer;
}
