/**
 * Cómo bajar de Drive el trabajo de un estudiante.
 *
 * Un archivo subido (PDF, imagen, .docx) se descarga tal cual. Uno nativo de
 * Google —Documentos, Presentaciones, Hojas de cálculo— NO tiene bytes que
 * descargar: hay que pedirle a Drive que lo exporte a un formato real. Como la
 * mayoría de los trabajos en Classroom son Documentos de Google, sin esto el
 * ZIP saldría casi vacío.
 */

/** A qué se exporta cada tipo nativo de Google, y con qué extensión. */
const EXPORTA_COMO: Record<string, { mime: string; ext: string }> = {
  // Documentos y presentaciones a PDF: es para leer el trabajo, y el PDF
  // conserva el formato tal como lo entregó el estudiante.
  'application/vnd.google-apps.document': { mime: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: '.pdf' },
  // Una hoja de cálculo a PDF perdería las fórmulas y el detalle: va a xlsx.
  'application/vnd.google-apps.spreadsheet': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
  'application/vnd.google-apps.drawing': { mime: 'image/png', ext: '.png' },
};

/**
 * Tipos nativos que Drive no sabe exportar. Un formulario o una carpeta no
 * tienen contenido que quepa en un archivo; quedan anotados en el resumen.
 */
const NO_EXPORTABLES = new Set([
  'application/vnd.google-apps.form',
  'application/vnd.google-apps.folder',
  'application/vnd.google-apps.site',
  'application/vnd.google-apps.map',
  'application/vnd.google-apps.script',
]);

export type PlanDescarga =
  | { tipo: 'descargar' }
  | { tipo: 'exportar'; mime: string; ext: string }
  | { tipo: 'omitir'; motivo: string };

export function planDeDescarga(mimeType: string | undefined): PlanDescarga {
  const m = (mimeType ?? '').trim();
  if (!m) return { tipo: 'descargar' };            // sin tipo: se intenta tal cual
  if (NO_EXPORTABLES.has(m)) {
    return { tipo: 'omitir', motivo: 'no es un archivo descargable' };
  }
  const exp = EXPORTA_COMO[m];
  if (exp) return { tipo: 'exportar', mime: exp.mime, ext: exp.ext };
  if (m.startsWith('application/vnd.google-apps.')) {
    return { tipo: 'omitir', motivo: `tipo de Google sin exportación (${m})` };
  }
  return { tipo: 'descargar' };
}

/** Caracteres que Windows rechaza en un nombre de archivo. */
const PROHIBIDOS = new RegExp('[<>:"|?*' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']', 'g');

/**
 * Limpia un nombre para que sea una carpeta o archivo válido dentro del ZIP.
 *
 * Las barras son lo importante: un nombre con "/" crearía carpetas fantasma al
 * descomprimir. También caen los caracteres que Windows rechaza, que es donde
 * la mayoría va a abrir el ZIP.
 */
export function nombreSeguro(nombre: string, porDefecto = 'sin-nombre'): string {
  const limpio = (nombre ?? '')
    .replace(/[/\\]/g, '-')
    .replace(PROHIBIDOS, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows tampoco admite que termine en punto o espacio.
    .replace(/[. ]+$/, '');
  return limpio || porDefecto;
}

/**
 * Añade la extensión solo si falta. Si el estudiante ya llamó a su trabajo
 * "Ensayo.pdf", no queremos "Ensayo.pdf.pdf".
 */
export function conExtension(nombre: string, ext: string): string {
  if (!ext) return nombre;
  return nombre.toLowerCase().endsWith(ext.toLowerCase()) ? nombre : nombre + ext;
}

/**
 * Reserva una ruta única dentro del ZIP. Dos archivos con el mismo nombre en la
 * carpeta de un mismo estudiante se pisarían sin avisar; el sufijo los separa.
 */
export function rutaUnica(usadas: Set<string>, ruta: string): string {
  if (!usadas.has(ruta)) { usadas.add(ruta); return ruta; }
  const punto = ruta.lastIndexOf('.');
  const base = punto > 0 ? ruta.slice(0, punto) : ruta;
  const ext = punto > 0 ? ruta.slice(punto) : '';
  for (let n = 2; ; n++) {
    const intento = `${base} (${n})${ext}`;
    if (!usadas.has(intento)) { usadas.add(intento); return intento; }
  }
}
