/**
 * Cuánta historia de ediciones se conserva.
 *
 * `changeLog` escribe una fila por cada nota corregida y cada F/R marcado, y
 * nunca se podaba. Para un docente son decenas de miles de filas al año; lo
 * que pesa no es la base local sino el servidor, porque la tabla sincroniza.
 *
 * El valor de una entrada decae rápido: sirve para "qué toqué esta semana".
 * Lo de un trimestre cerrado ya está archivado en `trimesterSnapshots`, que es
 * el registro con valor legal y ese no se toca nunca.
 *
 * Borrar una fila sincronizable normalmente deja una lápida, que en el
 * servidor queda como la misma fila marcada `deleted_at` — o sea que podar en
 * local no libera nada allá. Por eso la poda va por dos caminos: en local sin
 * lápida (`withoutTombstone`), y en el servidor con un borrado de verdad.
 */

/** Seis meses: cubre el trimestre en curso y el anterior con margen. */
export const RETENCION_CHANGELOG_DIAS = 180;

/** Como mucho una poda local al día: no es trabajo para cada arranque. */
export const PODA_LOCAL_CADA_HORAS = 24;

/**
 * Tope de filas que el servidor borra por corrida. La poda va dentro del cron
 * de la tarde, que ya tiene el minuto contado; si hay más atraso, se termina
 * mañana.
 */
export const PODA_SERVIDOR_MAX_FILAS = 5000;

/** La fecha ISO antes de la cual se puede podar. */
export function cutoffIso(ahora: Date, dias = RETENCION_CHANGELOG_DIAS): string {
  const d = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/**
 * ¿Toca podar? `ultimaIso` es cuándo se podó por última vez en este
 * dispositivo. Una marca ausente o ilegible cuenta como "nunca".
 */
export function debePodar(
  ultimaIso: string | null | undefined,
  ahora: Date,
  cadaHoras = PODA_LOCAL_CADA_HORAS,
): boolean {
  if (!ultimaIso) return true;
  const t = Date.parse(ultimaIso);
  if (!Number.isFinite(t)) return true;
  // Un reloj adelantado y luego corregido dejaría una marca futura que
  // bloquearía la poda para siempre: se trata como "nunca".
  if (t > ahora.getTime()) return true;
  return ahora.getTime() - t >= cadaHoras * 60 * 60 * 1000;
}

/** Texto para la vista: hasta dónde llega la historia que se conserva. */
export function describeRetencion(dias = RETENCION_CHANGELOG_DIAS): string {
  const meses = Math.round(dias / 30);
  return `Se conservan los últimos ${meses} meses. Lo de trimestres cerrados `
    + `queda archivado aparte, al cerrar el trimestre.`;
}
