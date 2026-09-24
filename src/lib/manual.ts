/**
 * El manual de convivencia, para consultarlo sin salir del dispositivo.
 *
 * **Cita, no aconseja.** La respuesta es el artículo TEXTUAL con su ubicación;
 * nunca "hacé esto". Un docente que actúa sobre un resumen equivocado de un
 * debido proceso le hace daño al estudiante y expone al colegio, y un resumen
 * plausible es indistinguible de uno correcto hasta que es tarde. Citando, el
 * docente lee lo que dice el manual y decide él.
 *
 * Todo pasa acá: el manual es un documento interno del colegio y subirlo a un
 * tercero no es una decisión de un docente suelto. Además no hace falta — un
 * documento legal ya viene indexado por su propia estructura.
 *
 * Puro y aparte de Dexie, como `pasteNotas` y `consulta`.
 */

// ---------------------------------------------------------------------------
// Limpieza del texto
// ---------------------------------------------------------------------------

/** Guion suave: lo que el PDF deja donde partió una palabra al final de renglón. */
const GUION_SUAVE = '­';

/**
 * Deja el texto buscable.
 *
 * Lo importante es lo primero: **unir las palabras que el PDF partió**. El
 * manual trae 2.591 guiones suaves, todos al final de un renglón, así que sin
 * esto "convivencia" no encuentra "convi<guion>vencia" y se pierde una de cada
 * seis apariciones. No falla ruidosamente: devuelve resultados, solo que no
 * todos, que es la peor forma de fallar de un buscador.
 */
export function limpiarTexto(crudo: string): string {
  return crudo
    // La palabra partida y su salto de renglón: se vuelven a pegar.
    .replace(new RegExp(GUION_SUAVE + '\\s*\\r?\\n\\s*', 'g'), '')
    // Alguno suelto sin salto: sobra igual.
    .replace(new RegExp(GUION_SUAVE, 'g'), '')
    .replace(/\r\n?/g, '\n');
}

/** Una línea del índice: las que llevan la fila de puntos hasta el número. */
const ES_INDICE = /\.{4,}/;
/** Un número de página suelto en su propia línea. */
const ES_PAGINA = /^\s*\d{1,4}\s*$/;
/** El número de un ítem de lista, que el PDF deja solo en su renglón. */
const ES_VINETA = /^\s*(\d{1,2}|[a-z])[.)]\s*$/;

export interface Articulo {
  numero: number;
  /** "Admisión a la Institución" — sin el punto final. */
  titulo: string;
  /** El cuerpo, tal cual lo dice el manual. Es lo que se muestra. */
  texto: string;
  /** "TÍTULO II" y "Capítulo I Derechos y Deberes…", para ubicarlo. */
  seccion: string;
  capitulo: string;
}

const RE_ARTICULO = /^Art[íi]culo\s+(\d+)\s*[.:-]\s*(.*)$/i;
const RE_SECCION = /^(T[ÍI]TULO\s+[IVXLC]+.*)$/i;
const RE_CAPITULO = /^(Cap[íi]tulo\s+[IVXLC]+.*)$/i;

/**
 * Parte el manual en artículos.
 *
 * El artículo es la unidad: es como el manual se cita y como un docente lo
 * busca ("¿qué dice el artículo sobre…?"). Cortar por párrafo daría fragmentos
 * sin contexto, y por capítulo daría bloques demasiado grandes para leer.
 */
export function parseManual(crudo: string): Articulo[] {
  const lineas = limpiarTexto(crudo).split('\n');

  const out: Articulo[] = [];
  let seccion = '';
  let capitulo = '';
  let actual: { numero: number; primeraLinea: string; cuerpo: string[] } | null = null;

  const cerrar = () => {
    if (!actual) return;
    /*
     * Lo que sigue al "Artículo N." entra al cuerpo como una línea más, no
     * aparte: el PDF corta la frase por ancho de columna, así que "Es el acto
     * por" y "el cual se admite al aspirante…" son la misma oración. Tratarla
     * como párrafo propio partía todos los artículos en la primera frase.
     */
    const parrafos = unirRenglones([actual.primeraLinea, ...actual.cuerpo]);
    const { titulo, resto } = partirTitulo(parrafos[0] ?? '');
    const texto = [resto, ...parrafos.slice(1)].filter(Boolean).join('\n\n').trim();
    // Un "artículo" sin cuerpo suele ser una entrada del índice que se coló.
    if (texto.length >= 20) {
      out.push({ numero: actual.numero, titulo, texto, seccion, capitulo });
    }
    actual = null;
  };

  for (const bruta of lineas) {
    const linea = bruta.replace(/\t/g, ' ').trimEnd();
    if (ES_INDICE.test(linea)) continue;          // el índice del principio
    if (ES_PAGINA.test(linea)) continue;          // números de página sueltos

    const art = RE_ARTICULO.exec(linea.trim());
    if (art) {
      cerrar();
      actual = { numero: Number(art[1]), primeraLinea: art[2], cuerpo: [] };
      continue;
    }

    const sec = RE_SECCION.exec(linea.trim());
    if (sec) { cerrar(); seccion = limpiar(sec[1]); capitulo = ''; continue; }

    const cap = RE_CAPITULO.exec(linea.trim());
    if (cap) { cerrar(); capitulo = limpiar(cap[1]); continue; }

    if (actual) actual.cuerpo.push(linea);
  }
  cerrar();

  return out;
}

const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Vuelve a armar los párrafos que el PDF dejó cortados por ancho de columna.
 *
 * Un renglón que termina sin punto sigue en el siguiente: se pegan con un
 * espacio. Y el número de un ítem de lista viene solo en su renglón, así que se
 * pega con lo que sigue — si no, la lista queda de números sueltos.
 */
function unirRenglones(lineas: string[]): string[] {
  const parrafos: string[] = [];
  let actual = '';
  let vineta = '';

  const empujar = () => {
    const t = limpiar(actual);
    if (t) parrafos.push(t);
    actual = '';
  };

  for (const l of lineas) {
    const t = l.trim();
    if (!t) { empujar(); continue; }
    if (ES_VINETA.test(t)) { empujar(); vineta = t.replace(/\s+/g, ''); continue; }
    if (vineta) { actual = `${vineta} ${t}`; vineta = ''; continue; }
    actual = actual ? `${actual} ${t}` : t;
  }
  empujar();
  return parrafos;
}

/**
 * Separa el título del artículo de su primera frase.
 *
 * El manual escribe "Artículo 5. Admisión a la Institución. Es el acto por…":
 * el título es lo que va hasta el primer punto. Se acota el largo para no
 * tragarse media frase cuando un artículo no tiene título.
 */
function partirTitulo(primera: string): { titulo: string; resto: string } {
  const m = /^([^.:]{3,120})[.:]\s*([\s\S]*)$/.exec(primera.trim());
  if (!m) return { titulo: '', resto: limpiar(primera) };
  return { titulo: limpiar(m[1]), resto: limpiar(m[2]) };
}

// ---------------------------------------------------------------------------
// Buscar
// ---------------------------------------------------------------------------

export const norm = (s: string) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const VACIAS = new Set(norm(
  'que como cual cuales cuando donde quien el la los las un una unos unas de del en y o a ' +
  'con para por se le les su sus lo al es son esta estan hay debe debo puedo puede si no ' +
  'hacer hago pasa dice sobre ante segun cuanto tiene',
).split(' '));

/**
 * Cómo se dice lo mismo en el colegio y cómo lo dice el manual.
 *
 * Un docente pregunta "¿qué hago si un estudiante hace bullying?" y el manual
 * habla de "acoso escolar" y de "situaciones tipo II". Sin este puente la
 * búsqueda no encuentra nada y parece que el manual no lo trata.
 */
const SINONIMOS: Record<string, string[]> = {
  bullying: ['acoso', 'matoneo', 'hostigamiento'],
  acoso: ['bullying', 'matoneo', 'hostigamiento'],
  copiar: ['fraude', 'plagio', 'deshonestidad'],
  copia: ['fraude', 'plagio', 'deshonestidad'],
  plagio: ['fraude', 'deshonestidad'],
  expulsion: ['cancelacion', 'desescolarizacion', 'exclusion'],
  expulsar: ['cancelacion', 'desescolarizacion', 'exclusion'],
  falta: ['situacion', 'infraccion'],
  faltas: ['situaciones', 'infracciones'],
  celular: ['dispositivo', 'electronico', 'movil'],
  inasistencia: ['ausencia', 'falla', 'asistencia'],
  llegar: ['puntualidad', 'retardo', 'tardanza'],
  tarde: ['puntualidad', 'retardo', 'tardanza'],
  pelea: ['agresion', 'violencia'],
  pegar: ['agresion', 'violencia'],
  droga: ['sustancia', 'psicoactiva'],
  uniforme: ['presentacion', 'porte'],
  observador: ['seguimiento', 'registro'],
  proceso: ['debido', 'procedimiento', 'conducto'],
};

/**
 * Los sinónimos de una palabra, tolerando la conjugación.
 *
 * El diccionario guarda "copiar" y el docente escribe "copió"; guarda "pegar"
 * y escribe "pegó". Buscar la clave exacta fallaba justo con las preguntas
 * naturales: "un estudiante copió en una evaluación" no encontraba los
 * artículos de fraude, que son los que responden.
 *
 * Recortar a N letras no alcanza, porque el español cambia la VOCAL al
 * conjugar: "pego" y "pega" se separan en la cuarta letra y "copio"/"copia" en
 * la quinta, así que no hay N que sirva para las dos. Se quita la terminación,
 * que es lo que de verdad cambia.
 */
const TERMINACION = /(ando|iendo|ar|er|ir|os|as|es|an|en|o|a|e|ó|é)$/;

function raizDe(palabra: string): string {
  const corta = palabra.replace(TERMINACION, '');
  return corta.length >= 3 ? corta : palabra;
}

function sinonimosDe(palabra: string): string[] {
  const exacto = SINONIMOS[palabra];
  if (exacto) return exacto;
  const raiz = raizDe(palabra);
  if (raiz.length < 3) return [];
  for (const clave of Object.keys(SINONIMOS)) {
    if (raizDe(clave) === raiz) return SINONIMOS[clave];
  }
  return [];
}

export interface Coincidencia {
  articulo: Articulo;
  /** Cuántos términos distintos de la pregunta aparecen. Manda al ordenar. */
  cobertura: number;
  puntaje: number;
  /** Los términos que sí aparecieron, para resaltarlos. */
  terminos: string[];
}

export interface ResultadoManual {
  /** Los términos que se buscaron, ya con sinónimos. */
  buscados: string[];
  coincidencias: Coincidencia[];
}

/**
 * Busca en el manual y devuelve artículos, no un resumen.
 *
 * Ordena por **cobertura** antes que por frecuencia: un artículo que menciona
 * los tres términos de la pregunta una vez cada uno responde mejor que otro que
 * repite uno solo quince veces. Con la frecuencia sola, el artículo que define
 * una palabra le gana siempre al que trata el caso.
 */
export function buscarEnManual(
  articulos: Articulo[],
  pregunta: string,
  limite = 5,
): ResultadoManual {
  const crudos = norm(pregunta).split(/[^a-z0-9ñ]+/)
    .filter((p) => p.length >= 3 && !VACIAS.has(p));
  if (!crudos.length) return { buscados: [], coincidencias: [] };

  // Los sinónimos se buscan pero no exigen: suman si aparecen.
  const expandidos = new Set(crudos);
  for (const p of crudos) for (const s of sinonimosDe(p)) expandidos.add(s);
  const buscados = [...expandidos];

  /*
   * Cada término pesa por lo raro que es en el manual (IDF).
   *
   * Sin esto, "estudiante" —que aparece en casi todos los artículos— pesaba
   * igual que "celular", y el artículo más largo ganaba siempre: "Deberes de
   * los Estudiantes" salía primero para bullying, para llegar tarde y para
   * inasistencia, porque menciona todo una vez. Una palabra que está en todas
   * partes no distingue nada, y tiene que pesar como lo que es: casi cero.
   */
  const enCuantos = new Map<string, number>();
  for (const t of buscados) {
    let n = 0;
    for (const a of articulos) {
      if (contar(norm(a.titulo), t) || contar(norm(a.texto), t)) n++;
    }
    enCuantos.set(t, n);
  }
  const N = Math.max(articulos.length, 1);
  const peso = (t: string) => Math.log(1 + N / (1 + (enCuantos.get(t) ?? 0)));

  const coincidencias: Coincidencia[] = [];
  for (const a of articulos) {
    const enTitulo = norm(a.titulo);
    const enTexto = norm(a.texto);
    let puntaje = 0;
    const terminos: string[] = [];

    for (const t of buscados) {
      const esPropio = crudos.includes(t);          // lo que preguntó, no un sinónimo
      const enT = contar(enTitulo, t);
      const enC = contar(enTexto, t);
      if (!enT && !enC) continue;
      terminos.push(t);
      // El título pesa: un artículo que se LLAMA así trata del tema, no lo
      // menciona de paso.
      puntaje += (enT * 10 + Math.min(enC, 8)) * (esPropio ? 1 : 0.4) * peso(t);
    }
    if (!terminos.length) continue;
    /*
     * La cobertura es CUÁNTOS términos de la pregunta responde: un entero, y
     * nada más. Ponderarla por rareza mezclaba dos cosas distintas y salía
     * peor: "debido proceso disciplinario" devolvía el reglamento del
     * transporte —que nombra "disciplinario" una vez— por encima de
     * "Principios del Debido Proceso", porque el término raro solo pesaba más
     * que los dos comunes juntos. Cuántos responde es una pregunta; cuánto
     * importan es otra, y esa la contesta el puntaje.
     */
    const cobertura = crudos.filter((t) =>
      terminos.includes(t) || sinonimosDe(t).some((s) => terminos.includes(s))).length;
    coincidencias.push({ articulo: a, cobertura, puntaje, terminos });
  }

  coincidencias.sort((x, y) => y.cobertura - x.cobertura || y.puntaje - x.puntaje
    || x.articulo.numero - y.articulo.numero);
  return { buscados, coincidencias: coincidencias.slice(0, limite) };
}

/** Cuántas veces aparece `t` en `texto`, por palabra entera o como prefijo. */
function contar(texto: string, t: string): number {
  if (!t) return 0;
  let n = 0, i = 0;
  while ((i = texto.indexOf(t, i)) !== -1) {
    const antes = i === 0 ? ' ' : texto[i - 1];
    if (!/[a-z0-9ñ]/.test(antes)) n++;   // empieza palabra: "estudiante" cuenta en "estudiantes"
    i += t.length;
  }
  return n;
}

/** La ubicación de un artículo, para citarlo. */
export function citar(a: Articulo): string {
  return [`Artículo ${a.numero}`, a.capitulo, a.seccion].filter(Boolean).join(' · ');
}
