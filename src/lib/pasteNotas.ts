import { normalizeName } from './utils';

/**
 * Pegar notas desde un Excel.
 *
 * Copiar una columna en Excel deja en el portapapeles texto plano: las filas
 * separadas por saltos de línea y las celdas por tabuladores. No hace falta
 * leer el archivo; basta con entender ese texto.
 *
 * **El peligro es el emparejamiento.** Una columna de puros números no tiene
 * identidad: se pega por posición, y si el Excel está ordenado distinto —otra
 * alfabetización, un retirado que acá no sale, alguien que llegó después— todo
 * lo que sigue cae en el estudiante equivocado, y en silencio, porque los
 * números se ven plausibles. Es el mismo problema que ya costó un bug: la
 * identidad de un estudiante es su COD_ALUM, no su nombre y mucho menos su
 * posición.
 *
 * Por eso esto arma un PLAN y no escribe nada. Si lo pegado trae una columna
 * de códigos o de nombres, empareja por ahí y el orden deja de importar. Si
 * solo trae números, empareja por posición pero lo dice, para que la vista
 * previa lo muestre antes de aplicar.
 *
 * Puro a propósito: no toca Dexie ni el DOM, así que se puede ejercer entero
 * sin navegador.
 */

export type ColumnKind = 'codigo' | 'nombre' | 'nota' | 'otra';
export type MatchMode = 'codigo' | 'nombre' | 'posicion';

/** Una columna de la cuadrícula, como la define `columnsFor`. */
export interface GridColumn {
  column: string;                       // 'C2', 'C7'…
  slotKeys: string[];
}

/** Un estudiante de la cuadrícula, ya filtrado a activos y en su orden. */
export interface GridStudent {
  row: number;
  id: number;
  nombre: string;
  codAlum: string;
  /** Lo que hay hoy, por columna real: { C2: 85 }. */
  current: Record<string, number>;
}

export interface PasteCell {
  col: number;                          // índice de columna en la cuadrícula
  column: string;
  slotKeys: string[];
  from: number;
  to: number;
}

export interface PasteRow {
  studentId: number;
  studentName: string;
  cells: PasteCell[];
  /** Lo que no se pudo usar de esta fila, para mostrarlo marcado. */
  issues: string[];
}

export interface PastePlan {
  match: MatchMode;
  rows: PasteRow[];
  /** Las columnas de la cuadrícula que se van a escribir. */
  columns: string[];
  warnings: string[];
  /** Filas del portapapeles que no se ubicaron, tal como venían. */
  unmatched: string[];
  /** Cuántos valores cambian de verdad. */
  changes: number;
}

// ---------- leer el portapapeles ----------

/** El texto del portapapeles como rejilla de celdas. */
export function parseClipboard(texto: string): string[][] {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  // Excel suele dejar un salto al final; las filas vacías del final sobran.
  while (lineas.length > 0 && lineas[lineas.length - 1].trim() === '') lineas.pop();
  return lineas.map(l => l.split('\t').map(c => c.trim()));
}

/**
 * ¿Es un pegado normal de una sola celda?
 *
 * Ahí no hay nada que repartir y el navegador ya sabe qué hacer: pegar dentro
 * de la casilla. Solo se interviene cuando vienen varios valores.
 */
export function isSingleCell(rows: string[][]): boolean {
  return rows.length <= 1 && (rows[0]?.length ?? 0) <= 1;
}

export interface NotaParse {
  ok: boolean;
  value?: number;
  /** Tenía decimales y se redondeó. */
  rounded?: boolean;
  /** Por qué no sirve, si no sirve. */
  reason?: string;
}

/**
 * Una celda del Excel como nota.
 *
 * La coma decimal se acepta porque es la del teclado de acá. Las notas son
 * enteras, así que un 85,4 se redondea — y se avisa, que un 8,5 de una escala
 * de 10 no se convierte en 85 por adivinanza: se muestra tal cual al lado de
 * los 70 y 80 y salta a la vista que la escala está mal.
 */
export function parseNota(raw: string): NotaParse {
  const t = raw.trim();
  if (t === '') return { ok: false, reason: 'vacía' };
  if (!/^-?\d+([.,]\d+)?$/.test(t)) return { ok: false, reason: 'no es un número' };
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) return { ok: false, reason: 'no es un número' };
  if (n < 0 || n > 100) return { ok: false, reason: 'fuera de 0–100' };
  const redondeada = Math.round(n);
  return { ok: true, value: redondeada, rounded: redondeada !== n };
}

/**
 * A qué se parece una celda suelta.
 *
 * El código va primero porque un COD_ALUM también es un número; se distingue
 * por el largo, que es de código y no de nota.
 */
function cellKind(t: string): ColumnKind {
  if (/^\d{7,}$/.test(t)) return 'codigo';
  if (/^-?\d+([.,]\d+)?$/.test(t)) return 'nota';
  if (/\p{L}/u.test(t)) return 'nombre';
  return 'otra';
}

/**
 * De qué es esta columna: gana lo que más aparece entre sus celdas llenas.
 *
 * Se mira si la celda ES un número, no si es una nota VÁLIDA. Son preguntas
 * distintas y mezclarlas costaba: una columna con un 120 y un "N/A" entre las
 * notas dejaba de reconocerse como columna de notas y la app respondía "no
 * encontré notas", cuando lo correcto es reconocerla y marcar esas dos celdas.
 * El rango se revisa después, celda por celda, donde sí se puede explicar.
 *
 * Por mayoría y no por un umbral fijo: con pocas filas cualquier umbral deja
 * columnas legítimas afuera. Un empate se queda en 'otra' — ahí de verdad no
 * hay con qué decidir.
 */
export function classifyColumn(celdas: string[]): ColumnKind {
  const llenas = celdas.filter(c => c !== '');
  if (llenas.length === 0) return 'otra';

  const votos = new Map<ColumnKind, number>();
  for (const c of llenas) {
    const k = cellKind(c);
    votos.set(k, (votos.get(k) ?? 0) + 1);
  }
  const orden = [...votos.entries()].sort((a, b) => b[1] - a[1]);
  if (orden.length > 1 && orden[0][1] === orden[1][1]) return 'otra';
  return orden[0][0];
}

/**
 * ¿La primera fila es un encabezado?
 *
 * Lo es cuando trae texto y ninguna nota, teniendo debajo filas que sí. Así
 * "Estudiante | Nota" se descarta y "María | 85" no, porque esa sí trae nota.
 */
export function looksLikeHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const primera = rows[0];
  const tieneLetras = primera.some(c => /\p{L}/u.test(c));
  const traeNota = primera.some(c => parseNota(c).ok);
  const laSiguienteTraeNota = rows[1].some(c => parseNota(c).ok);
  return tieneLetras && !traeNota && laSiguienteTraeNota;
}

// ---------- armar el plan ----------

/** Índice de nombres normalizados; los repetidos quedan marcados. */
function indexPorNombre(students: GridStudent[]) {
  const porNombre = new Map<string, GridStudent>();
  const ambiguos = new Set<string>();
  for (const s of students) {
    const k = normalizeName(s.nombre);
    if (porNombre.has(k)) ambiguos.add(k);
    porNombre.set(k, s);
  }
  return { porNombre, ambiguos };
}

export function planPaste(
  texto: string,
  students: GridStudent[],
  gridColumns: GridColumn[],
  startRow: number,
  startCol: number,
): PastePlan | null {
  const parsed = parseClipboard(texto);
  if (isSingleCell(parsed)) return null;

  const filas = looksLikeHeader(parsed) ? parsed.slice(1) : parsed;
  const anchura = Math.max(0, ...filas.map(f => f.length));
  const kinds: ColumnKind[] = [];
  for (let c = 0; c < anchura; c++) {
    kinds.push(classifyColumn(filas.map(f => f[c] ?? '')));
  }

  const colCodigo = kinds.indexOf('codigo');
  const colNombre = kinds.indexOf('nombre');
  const colsNota = kinds.flatMap((k, i) => (k === 'nota' ? [i] : []));

  const warnings: string[] = [];
  const unmatched: string[] = [];

  if (colsNota.length === 0) {
    return {
      match: 'posicion', rows: [], columns: [], changes: 0, unmatched,
      warnings: ['No encontré notas en lo que pegaste. Copia la columna de notas del Excel.'],
    };
  }

  const match: MatchMode =
    colCodigo >= 0 ? 'codigo' : colNombre >= 0 ? 'nombre' : 'posicion';

  const porCodigo = new Map(students.filter(s => s.codAlum).map(s => [s.codAlum.trim(), s]));
  const { porNombre, ambiguos } = indexPorNombre(students);

  // Las columnas de la cuadrícula que se escriben: desde la del foco hacia la
  // derecha, una por cada columna de notas pegada.
  const destino = colsNota
    .map((_, j) => startCol + j)
    .filter(c => c < gridColumns.length);
  if (destino.length < colsNota.length) {
    warnings.push(
      `Pegaste ${colsNota.length} columnas de notas y desde aquí solo caben ${destino.length}. ` +
      'Las que sobran se ignoran.',
    );
  }

  const rows: PasteRow[] = [];
  let redondeadas = 0;
  let cambios = 0;
  const usados = new Set<number>();

  filas.forEach((fila, i) => {
    // A quién le toca esta fila.
    let alumno: GridStudent | undefined;
    if (match === 'codigo') {
      const cod = (fila[colCodigo] ?? '').trim();
      alumno = porCodigo.get(cod);
      if (!alumno) { unmatched.push(fila.join(' · ') || `fila ${i + 1}`); return; }
    } else if (match === 'nombre') {
      const k = normalizeName(fila[colNombre] ?? '');
      if (ambiguos.has(k)) {
        unmatched.push(`${fila[colNombre]} (hay más de un estudiante con ese nombre)`);
        return;
      }
      alumno = porNombre.get(k);
      if (!alumno) { unmatched.push(fila[colNombre] || `fila ${i + 1}`); return; }
    } else {
      alumno = students[startRow + i];
      if (!alumno) { unmatched.push(fila.join(' · ') || `fila ${i + 1}`); return; }
    }

    if (usados.has(alumno.id)) {
      unmatched.push(`${alumno.nombre} (aparece dos veces en lo que pegaste)`);
      return;
    }
    usados.add(alumno.id);

    const cells: PasteCell[] = [];
    const issues: string[] = [];
    destino.forEach((gridCol, j) => {
      const crudo = fila[colsNota[j]] ?? '';
      const p = parseNota(crudo);
      const col = gridColumns[gridCol];
      if (!p.ok) {
        // Una celda vacía no es un error: significa "no toques esta nota".
        if (p.reason !== 'vacía') issues.push(`${col.column}: “${crudo}” ${p.reason}`);
        return;
      }
      if (p.rounded) redondeadas++;
      const from = alumno!.current[col.column] ?? 0;
      cells.push({ col: gridCol, column: col.column, slotKeys: col.slotKeys, from, to: p.value! });
      if (from !== p.value) cambios++;
    });

    if (cells.length > 0 || issues.length > 0) {
      rows.push({ studentId: alumno.id, studentName: alumno.nombre, cells, issues });
    }
  });

  // --- avisos ---
  if (match === 'posicion') {
    const caben = students.length - startRow;
    warnings.push(
      'Lo que pegaste no trae ni códigos ni nombres, así que va por posición: ' +
      'el primer valor al primer estudiante de esta lista. Revisa que el orden coincida.',
    );
    if (filas.length !== caben) {
      warnings.push(
        `Pegaste ${filas.length} valor${filas.length === 1 ? '' : 'es'} y desde aquí hay ` +
        `${caben} estudiante${caben === 1 ? '' : 's'}. Si el Excel trae a alguien de más o de ` +
        'menos, de ahí en adelante las notas quedan corridas.',
      );
    }
  }
  if (redondeadas > 0) {
    warnings.push(
      `${redondeadas} nota${redondeadas === 1 ? ' tenía decimales y se redondeó' : 's tenían decimales y se redondearon'}.`,
    );
  }
  if (unmatched.length > 0 && match !== 'posicion') {
    warnings.push(
      `${unmatched.length} fila${unmatched.length === 1 ? '' : 's'} no corresponde` +
      `${unmatched.length === 1 ? '' : 'n'} a ningún estudiante de este curso.`,
    );
  }

  return { match, rows, columns: destino.map(c => gridColumns[c].column), warnings, unmatched, changes: cambios };
}
