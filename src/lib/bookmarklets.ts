/**
 * Los favoritos arrastrables que hacen el trabajo del lado de la plataforma.
 *
 * **Por qué existen.** Instalar Tampermonkey, pegar un script y activar
 * "Permitir user scripts" es el muro más alto para que otro docente use esto,
 * y muchos colegios bloquean las extensiones. Un favorito se instala
 * arrastrándolo a la barra. Medido el 16/09/2026: la pantalla de asistencia de
 * la plataforma no tiene CSP y el favorito corrió.
 *
 * **Por qué no todos pueden serlo.** Un favorito se inyecta una vez y muere en
 * la siguiente recarga. Mientras un script recorra la pantalla haciendo clic —y
 * cada clic recargue la página— no se vuelve a inyectar y la corrida queda a
 * medias. Eso valía para todos hasta que se midió que el mismo envío hecho con
 * `fetch` no recarga nada (26/09/2026): el extractor de actividades ya va por
 * ahí y por eso entra acá entero. El de historial todavía recorre, y el que
 * escribe la matriz recorre a propósito, porque verlo en pantalla es parte de
 * lo que lo hace seguro.
 *
 * **De dónde sale el código.** Se trae del repositorio de los scripts al
 * compilar, no se copia acá. Una copia se queda vieja en silencio y entonces el
 * favorito hace algo distinto de lo que el script arreglado hace — que es
 * justo el error que nadie nota. Si la traída falla, la pantalla lo dice y
 * ofrece el camino manual en vez de tumbar el despliegue.
 */

const REPO = 'https://raw.githubusercontent.com/devdiegomt/planilla-v2';
const RAMA = 'claude/classroom-live-scraper-vurq1i';

export interface Favorito {
  id: string;
  /** El archivo en el repositorio de los scripts. */
  archivo: string;
  /**
   * Envolver el script en el marco: el favorito mete la plataforma en un
   * iframe del mismo origen y reinyecta el script en cada carga de adentro.
   * Es lo único que hacía Tampermonkey, y es lo que deja correr un recorrido
   * de varios pasos desde un favorito.
   */
  conMarco?: boolean;
  /** Lo que dice el botón que se arrastra. Corto: va en la barra del navegador. */
  boton: string;
  titulo: string;
  /** Para qué sirve, en una frase. */
  para: string;
  /** Si toca algo en la plataforma, y cuándo. */
  escribe: string | null;
  pasos: string[];
  /** A dónde ir en la app antes o después. */
  enLaApp?: { href: string; texto: string };
}

/**
 * Los caminos que sirven de favorito, en el orden en que un docente se los
 * encuentra: lo de todos los días primero, lo de una vez al año al final.
 *
 * Desde que existe el marco —que reinyecta el script en cada carga, que es lo
 * único que hacía la extensión— **ninguno de los que solo leen pide instalar
 * nada**. Eso no es un detalle: tener que explicar "estos dos se arrastran
 * pero este otro necesita una extensión" es la clase de excepción que hace que
 * alguien abandone en el primer intento.
 */
export const FAVORITOS: Favorito[] = [
  {
    id: 'asistencia',
    archivo: 'asistencia-autofill.user.js',
    // El marco es lo que hace que este camino valga la pena: sin él hay que
    // poner fecha, hora, curso y asignatura a mano, y entonces sale más rápido
    // escribir la asistencia directo en la plataforma.
    conMarco: true,
    boton: 'Asistencia GLA',
    titulo: 'Pasar la asistencia a la plataforma',
    para: 'Marca en la plataforma las fallas y los retardos que ya marcaste acá. '
        + 'Pone la fecha, la hora, el curso y la asignatura solo.',
    escribe: 'Marca en pantalla y se detiene. Nada queda guardado hasta que tú '
           + 'pulses Guardar.',
    pasos: [
      'En la app, copia la asistencia del día desde el inicio.',
      'En la plataforma, abre cualquier pantalla con tu sesión iniciada.',
      'Pulsa el favorito: la plataforma queda dentro de un marco y aparece un panel.',
      'Pega ahí lo que copiaste y pulsa "Flujo completo".',
      'Revisa lo que marcó y pulsa Guardar, dentro del mismo marco.',
    ],
    enLaApp: { href: '/', texto: 'Copiar la asistencia del día' },
  },
  {
    id: 'actividades',
    archivo: 'actividades-extractor.user.js',
    boton: 'Matriz GLA',
    titulo: 'Traer tu matriz de actividades',
    para: 'Lee cuánto pesa cada nota de tu materia y en qué ciclo cae. Sin esto, '
        + 'la app calcula con los pesos de Informática, que no tienen por qué ser los tuyos.',
    escribe: null,
    pasos: [
      'En la plataforma, abre la matriz de actividades y déjala cargada.',
      'Pulsa el favorito: recorre tus cursos solo, sin recargar la página.',
      'Cuando termine, copia lo que te muestra.',
      'Vuelve a la app y pégalo en Matriz de actividades.',
    ],
    enLaApp: { href: '/matriz', texto: 'Matriz de actividades' },
  },
  {
    id: 'historial',
    archivo: 'historial-extractor.user.js',
    conMarco: true,
    boton: 'Historial GLA',
    titulo: 'Traer las notas de trimestres pasados',
    para: 'Solo si empezaste a usar la app con el año ya empezado. La plataforma '
        + 'guarda las definitivas de los trimestres anteriores; la app no puede '
        + 'calcularlas porque esas notas ya no están en tu planilla.',
    escribe: null,
    pasos: [
      'En la plataforma, abre cualquier pantalla con tu sesión iniciada.',
      'Pulsa el favorito: la plataforma queda dentro de un marco y aparece un panel.',
      'Elige los trimestres que quieres traer y arranca. Recorre tus cursos solo.',
      'Cuando termine, copia lo que te muestra y pégalo en la app.',
    ],
    enLaApp: { href: '/ajustes/traer', texto: 'Notas de trimestres anteriores' },
  },
];

/** Lo que recorre la pantalla y por eso todavía pide la extensión. */
export const CON_EXTENSION = [
  {
    titulo: 'Notas de trimestres anteriores',
    porque: 'Recorre curso por curso y cada paso recarga la página, así que un '
          + 'favorito se perdería a la mitad.',
    enLaApp: { href: '/ajustes/traer', texto: 'Notas de trimestres anteriores' },
  },
  {
    titulo: 'Llenar la matriz desde la app',
    porque: 'Es el único camino que escribe de verdad en la plataforma, y va fila '
          + 'por fila a la vista. Verlo pasar en pantalla es parte de lo que lo hace seguro.',
    enLaApp: { href: '/matriz', texto: 'Matriz de actividades' },
  },
  {
    id: 'historial',
    archivo: 'historial-extractor.user.js',
    conMarco: true,
    boton: 'Historial GLA',
    titulo: 'Traer las notas de trimestres pasados',
    para: 'Solo si empezaste a usar la app con el año ya empezado. La plataforma '
        + 'guarda las definitivas de los trimestres anteriores; la app no puede '
        + 'calcularlas porque esas notas ya no están en tu planilla.',
    escribe: null,
    pasos: [
      'En la plataforma, abre cualquier pantalla con tu sesión iniciada.',
      'Pulsa el favorito: la plataforma queda dentro de un marco y aparece un panel.',
      'Elige los trimestres que quieres traer y arranca. Recorre tus cursos solo.',
      'Cuando termine, copia lo que te muestra y pégalo en la app.',
    ],
    enLaApp: { href: '/ajustes/traer', texto: 'Notas de trimestres anteriores' },
  },
];

export interface FavoritoListo extends Favorito {
  /** El `javascript:` entero, listo para el `href`. */
  url: string;
  /** Cuánto pesa, para decirlo antes de arrastrarlo. */
  kb: string;
}

/**
 * Trae el script y lo vuelve un `javascript:`.
 *
 * El `void 0` del final no es adorno: sin él el navegador ve que el script
 * devuelve algo y abandona la página para mostrar ese valor.
 *
 * Devuelve null si no se pudo traer. La pantalla enseña entonces el camino
 * manual: es mejor que un botón que promete algo y no lo cumple.
 */
async function traer(ruta: string): Promise<string | null> {
  try {
    // Se traen al compilar, no en cada visita. Un despliegue nuevo los vuelve
    // a traer, que es lo que los mantiene al día.
    const res = await fetch(`${REPO}/${RAMA}/${ruta}`, { cache: 'force-cache' });
    if (!res.ok) return null;
    return (await res.text()).replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

export async function cargarFavorito(f: Favorito): Promise<FavoritoListo | null> {
  const fuente = await traer(f.archivo);
  // Sin código real no hay favorito: mejor el camino manual que un botón que
  // arrastra una página de error de GitHub.
  if (!fuente || !fuente.includes('==UserScript==')) return null;

  let codigo = fuente;
  if (f.conMarco) {
    const marco = await traer('recon/marco.js');
    if (!marco || !marco.includes('__glaMarco')) return null;
    /*
     * El script viaja como cadena y NO se toca: `JSON.stringify` lo mete
     * entero, escapado, y el marco lo inyecta tal cual. Es la misma envoltura
     * que arma `recon/hacer-bookmarklet.mjs` allá, y tiene que seguir siéndolo:
     * si acá se modificara al envolver, habría dos versiones del mismo script
     * y ninguna señal de cuál corre.
     */
    codigo = `var FUENTE = ${JSON.stringify(fuente)};\n${marco}`;
  }

  const url = 'javascript:' + encodeURIComponent(codigo + '\nvoid 0;');
  return { ...f, url, kb: (url.length / 1024).toFixed(0) };
}
