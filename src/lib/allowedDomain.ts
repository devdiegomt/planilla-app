/**
 * Qué correos pueden usar la app.
 *
 * Solo el dominio institucional: la app maneja nombres, códigos y notas de
 * menores, así que la cuenta tiene que ser la del colegio y no una personal.
 *
 * Esto controla QUIÉN ENTRA, no qué se queda afuera. La app es local-first:
 * los datos viven en el equipo del docente, y desactivarle el correo no los
 * borra de su navegador. Para eso está el borrado de salida en Ajustes.
 *
 * El filtro del cliente es para avisar temprano y con un mensaje claro; el que
 * manda es la política del servidor (`supabase/migrations/004_…`), porque un
 * filtro en el navegador se salta.
 */

export const DOMINIOS_PERMITIDOS = ['gla.edu.co'];

/** El dominio de un correo: lo que va después de la ÚLTIMA arroba. */
export function dominioDe(email: string): string {
  const limpio = email.trim().toLowerCase();
  const i = limpio.lastIndexOf('@');
  // Sin arroba, o con la arroba al final, no hay dominio que mirar.
  if (i < 0 || i === limpio.length - 1) return '';
  return limpio.slice(i + 1);
}

/**
 * Coincidencia exacta de dominio, no "termina en".
 * `algo@gla.edu.co.otrositio.com` no es del colegio.
 */
export function emailPermitido(email: string): boolean {
  const d = dominioDe(email);
  return d !== '' && DOMINIOS_PERMITIDOS.includes(d);
}

/** Mensaje para cuando el correo no es del colegio. */
export function mensajeDominio(): string {
  const lista = DOMINIOS_PERMITIDOS.map(d => `@${d}`).join(' o ');
  return `Usa tu correo del colegio (${lista}). Esta app maneja datos de `
    + 'estudiantes, así que solo funciona con la cuenta institucional.';
}
