/**
 * Moverse por la cuadrícula de notas con las flechas.
 *
 * En un `<input type="number">` las flechas suben y bajan el valor, que es
 * justo lo contrario de lo que uno quiere calificando: se va por la columna
 * estudiante por estudiante. Por eso la casilla dejó de ser `type="number"`
 * (ver PlanillaGrid) y el teclado se maneja acá.
 *
 * Izquierda y derecha son el caso delicado: dentro de la casilla también
 * mueven el cursor. Solo saltan de columna cuando el cursor ya está en la
 * punta, así que corregir el "8" de un "85" sigue funcionando.
 *
 * Puro a propósito: decide a dónde ir, no toca el DOM.
 */

export interface GridPos {
  row: number;
  col: number;
}

export interface NavKey {
  key: string;
  shiftKey?: boolean;
  /** El cursor está al principio del texto (y no hay nada seleccionado). */
  atStart: boolean;
  /** El cursor está al final del texto (y no hay nada seleccionado). */
  atEnd: boolean;
}

export interface GridSize {
  rows: number;
  cols: number;
}

/**
 * A qué casilla ir, o null si el teclazo no mueve.
 *
 * Null también cuando el salto se saldría de la cuadrícula: en el borde se
 * queda quieto en vez de dar la vuelta, que sería perder de vista dónde se
 * estaba escribiendo.
 */
export function nextCell(from: GridPos, k: NavKey, size: GridSize): GridPos | null {
  const destino = target(from, k);
  if (!destino) return null;
  if (destino.row < 0 || destino.row >= size.rows) return null;
  if (destino.col < 0 || destino.col >= size.cols) return null;
  if (destino.row === from.row && destino.col === from.col) return null;
  return destino;
}

function target(from: GridPos, k: NavKey): GridPos | null {
  switch (k.key) {
    case 'ArrowUp':
      return { row: from.row - 1, col: from.col };
    case 'ArrowDown':
      return { row: from.row + 1, col: from.col };
    // Enter baja, como en una hoja de cálculo: calificando se avanza por la
    // columna, no por la fila.
    case 'Enter':
      return { row: from.row + (k.shiftKey ? -1 : 1), col: from.col };
    case 'ArrowLeft':
      return k.atStart ? { row: from.row, col: from.col - 1 } : null;
    case 'ArrowRight':
      return k.atEnd ? { row: from.row, col: from.col + 1 } : null;
    default:
      return null;
  }
}

/**
 * Lo que queda en la casilla mientras se escribe.
 *
 * Solo dígitos y tope en 100. Se deja quedar vacía —no se fuerza un 0— para
 * poder borrar y escribir encima; al guardar, vacío es 0, que en la plataforma
 * significa "sin calificar" y no "sacó cero".
 */
export function sanitizeNota(texto: string): string {
  const soloDigitos = texto.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (soloDigitos === '') return '';
  return String(Math.min(100, parseInt(soloDigitos, 10)));
}

/** El número que se guarda de lo que quedó escrito. */
export function notaValue(texto: string): number {
  const n = parseInt(texto, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}
