/**
 * Identidad estable para el sync.
 *
 * El problema que resuelve: `crypto.randomUUID()` inventa una identidad nueva
 * cada vez que se crea una fila. Reimportar la misma planilla, o importarla en
 * dos dispositivos antes de sincronizar, producía N registros distintos para la
 * misma persona real — y el motor de sync no tenía forma de saber que eran la
 * misma. De ahí los 56 estudiantes en un curso de 28.
 *
 * Con un UUID derivado de una clave natural, el mismo curso o el mismo
 * estudiante producen el mismo `sync_id` en cualquier base y en cualquier
 * corrida, así que el upsert contra Supabase converge en vez de acumular.
 *
 * La función es síncrona a propósito: los hooks de Dexie ('creating') no pueden
 * esperar una promesa, así que Web Crypto (SHA-1/SHA-256) queda descartado.
 * FNV-1a con cuatro semillas da 128 bits, más que suficiente para las ~700
 * filas de un año escolar.
 */

function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * UUID determinista a partir de una clave arbitraria. El formato respeta la
 * estructura de un UUID v5 (versión + variante) porque la columna `sync_id`
 * en Supabase es de tipo `uuid` y Postgres valida la forma.
 */
export function stableUuid(key: string): string {
  const a = fnv1a(key, 0x811c9dc5);
  const b = fnv1a(key, 0x9e3779b9);
  const c = fnv1a(key + '\u0000', 0x85ebca6b);
  const d = fnv1a('\u0000' + key, 0xc2b2ae35);
  const hex = [a, b, c, d]
    .map(n => n.toString(16).padStart(8, '0'))
    .join('');

  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    '5' + hex.slice(13, 16),      // versión 5
    variant + hex.slice(17, 20),  // variante RFC 4122
    hex.slice(20, 32),
  ].join('-');
}

/** Clave natural de un curso: el año escolar y su código. */
export function courseSyncId(year: number, code: string): string {
  return stableUuid(`course:${year}:${code}`);
}

/**
 * Clave natural de un estudiante.
 *
 * `nombreNorm` debe venir de `normalizeName()`. No se usa `codAlum` —que sería
 * la clave ideal— porque el importador lo deja vacío: se hidrata después con el
 * consolidado de Califica, y para entonces la fila ya existe con su syncId.
 */
export function studentSyncId(
  year: number,
  courseCode: string,
  nombreNorm: string,
): string {
  return stableUuid(`student:${year}:${courseCode}:${nombreNorm}`);
}