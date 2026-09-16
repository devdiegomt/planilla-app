import { nombreSeguro, rutaUnica } from './driveExport';
import type { Attachment } from './classroomApi';

/**
 * Qué va dentro del ZIP de entregas y con qué ruta.
 *
 * La estructura es la que pidió Diego: una carpeta por estudiante y dentro su
 * trabajo. Para el ZIP de un curso entero se mete el nombre del trabajo como
 * subcarpeta, así el estudiante sigue siendo el primer nivel — que es como se
 * revisa: se abre la carpeta de alguien y se ve todo lo suyo junto.
 *
 * Esto solo decide rutas. Bajar los archivos es del navegador, porque una
 * descarga de curso completo son decenas de archivos y una función de Vercel se
 * corta al minuto.
 */

export interface EntregaParaZip {
  studentName?: string;
  state?: string;
  late?: boolean;
  assignedGrade?: number | null;
  assignmentSubmission?: { attachments?: Attachment[] };
  alternateLink?: string;
}

export interface EntradaZip {
  fileId: string;
  /** Título original, para los mensajes de avance. */
  titulo: string;
  /** Ruta dentro del ZIP, ya única. */
  ruta: string;
}

export interface PlanZip {
  entradas: EntradaZip[];
  /** Estudiantes sin ningún archivo descargable, con el motivo. */
  sinArchivos: { estudiante: string; motivo: string }[];
}

/** Lo que no es un archivo de Drive no se puede meter en el ZIP. */
function motivoSinArchivo(adjuntos: Attachment[]): string {
  if (adjuntos.length === 0) return 'sin entrega';
  if (adjuntos.some(a => a.link)) return 'entregó un enlace';
  if (adjuntos.some(a => a.youTubeVideo)) return 'entregó un video de YouTube';
  if (adjuntos.some(a => a.form)) return 'entregó un formulario';
  return 'sin archivos de Drive';
}

export function planZipEntregas(
  entregas: EntregaParaZip[],
  subcarpeta?: string,
): PlanZip {
  const entradas: EntradaZip[] = [];
  const sinArchivos: PlanZip['sinArchivos'] = [];
  const usadas = new Set<string>();

  // Por nombre, que es como se busca a alguien al descomprimir.
  const ordenadas = [...entregas].sort(
    (a, b) => (a.studentName ?? '').localeCompare(b.studentName ?? '', 'es'),
  );

  for (const e of ordenadas) {
    const estudiante = nombreSeguro(e.studentName ?? '', 'sin nombre');
    const adjuntos = e.assignmentSubmission?.attachments ?? [];
    const archivos = adjuntos.filter(a => a.driveFile?.id);

    if (archivos.length === 0) {
      sinArchivos.push({ estudiante, motivo: motivoSinArchivo(adjuntos) });
      continue;
    }

    for (const a of archivos) {
      const titulo = a.driveFile!.title ?? 'trabajo';
      const partes = [estudiante];
      if (subcarpeta) partes.push(nombreSeguro(subcarpeta, 'trabajo'));
      partes.push(nombreSeguro(titulo, 'trabajo'));
      entradas.push({
        fileId: a.driveFile!.id!,
        titulo,
        ruta: rutaUnica(usadas, partes.join('/')),
      });
    }
  }

  return { entradas, sinArchivos };
}

/** Una celda de CSV: comillas dobles si hace falta, y las internas duplicadas. */
function celda(v: unknown): string {
  const s = String(v ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const ESTADOS: Record<string, string> = {
  TURNED_IN: 'Entregada',
  RETURNED: 'Devuelta',
  RECLAIMED_BY_STUDENT: 'Retomada',
  CREATED: 'Asignada',
  NEW: 'Sin abrir',
};

/**
 * Resumen que va en la raíz del ZIP.
 *
 * Es lo que responde "¿quién no entregó?", que mirando carpetas no se ve: quien
 * no entregó no tiene carpeta. Va con BOM para que Excel lo abra con las tildes
 * bien.
 */
export function resumenCsv(
  entregas: EntregaParaZip[],
  maxPoints?: number,
): string {
  const filas = [['Estudiante', 'Estado', 'Tarde', 'Nota', 'Archivos', 'Enlace'].join(',')];
  const ordenadas = [...entregas].sort(
    (a, b) => (a.studentName ?? '').localeCompare(b.studentName ?? '', 'es'),
  );
  for (const e of ordenadas) {
    const archivos = (e.assignmentSubmission?.attachments ?? []).filter(a => a.driveFile?.id);
    filas.push([
      celda(e.studentName ?? ''),
      celda(ESTADOS[e.state ?? ''] ?? e.state ?? ''),
      celda(e.late ? 'sí' : ''),
      celda(e.assignedGrade != null
        ? `${e.assignedGrade}${maxPoints ? `/${maxPoints}` : ''}`
        : ''),
      celda(archivos.length),
      celda(e.alternateLink ?? ''),
    ].join(','));
  }
  return '﻿' + filas.join('\r\n') + '\r\n';
}
