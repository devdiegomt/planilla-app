/**
 * Nombres cortos para la columna fija de la rejilla de notas.
 *
 * En el celular la columna del estudiante se llevaba casi todo el ancho —
 * "APONTE RAMÍREZ MARÍA JULIANA" en una sola línea— y de las notas no quedaba
 * nada a la vista. La columna tiene que encogerse, y para eso hay que acortar
 * el nombre.
 *
 * **Lo que no se puede negociar: el nombre corto tiene que identificar a UNA
 * persona del curso.** Si dos filas dicen "APONTE", calificar la de arriba
 * creyendo que es la de abajo es el error más caro que puede cometer esta app,
 * y no hay ninguna señal de que pasó. Por eso el corte no es fijo: se empieza
 * por el primer apellido y se va alargando SOLO a quien lo necesite, hasta que
 * no queden dos iguales.
 *
 * El orden de los nombres del colegio es apellido(s) primero, que es lo que
 * hace útil quedarse con la primera palabra.
 */

/** Divide en palabras, sin espacios de más. */
const palabras = (nombre: string) => nombre.trim().split(/\s+/).filter(Boolean);

/** `MARÍA` → `M.`; una palabra de una letra se deja como está. */
const inicial = (p: string) => (p.length <= 2 ? p : `${p[0]}.`);

/**
 * La etiqueta de un nombre en un nivel dado.
 *
 * Nivel 1 = solo el primer apellido. Cada nivel más añade la inicial de la
 * palabra siguiente: `APONTE` → `APONTE R.` → `APONTE R. M.`
 */
function enNivel(nombre: string, nivel: number): string {
  const ps = palabras(nombre);
  if (ps.length === 0) return nombre;
  const resto = ps.slice(1, nivel).map(inicial);
  return [ps[0], ...resto].join(' ');
}

/** Cuántos niveles distintos admite un nombre antes de quedarse sin palabras. */
const nivelMaximo = (nombre: string) => Math.max(1, palabras(nombre).length);

/**
 * Un nombre corto por estudiante, garantizando que no haya dos iguales.
 *
 * Devuelve las etiquetas en el mismo orden que recibió los nombres. Dos
 * estudiantes con el nombre completo idéntico son indistinguibles por nombre:
 * ahí los dos quedan con el nombre entero, que al menos no miente sobre lo que
 * se sabe. En la rejilla los separa el número de fila.
 */
export function nombresCortos(nombres: string[]): string[] {
  const niveles = nombres.map(() => 1);

  // Se sube de nivel solo a los que chocan, y se repite: alargar a uno puede
  // resolver su choque pero no el de los otros dos que quedaron juntos.
  for (let vuelta = 0; vuelta < 12; vuelta++) {
    const porEtiqueta = new Map<string, number[]>();
    nombres.forEach((n, i) => {
      const e = enNivel(n, niveles[i]);
      const grupo = porEtiqueta.get(e);
      if (grupo) grupo.push(i); else porEtiqueta.set(e, [i]);
    });

    let subioAlguno = false;
    for (const grupo of porEtiqueta.values()) {
      if (grupo.length < 2) continue;
      for (const i of grupo) {
        if (niveles[i] < nivelMaximo(nombres[i])) {
          niveles[i]++;
          subioAlguno = true;
        }
      }
    }
    if (!subioAlguno) break;   // o no hay choques, o ya nadie puede alargarse
  }

  // A quien agotó sus palabras y sigue chocando se le devuelve el nombre
  // entero: mejor una columna ancha en una fila que dos filas que se llaman
  // igual.
  const etiquetas = nombres.map((n, i) => enNivel(n, niveles[i]));
  const cuenta = new Map<string, number>();
  for (const e of etiquetas) cuenta.set(e, (cuenta.get(e) ?? 0) + 1);
  return etiquetas.map((e, i) => (cuenta.get(e)! > 1 ? nombres[i].trim() : e));
}
