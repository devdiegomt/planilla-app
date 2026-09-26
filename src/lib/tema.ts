/**
 * Claro, oscuro, o lo que diga el sistema.
 *
 * La elección es **de este equipo**, no de la cuenta: el mismo docente puede
 * querer oscuro en el celular de noche y claro en el computador del salón. Por
 * eso vive en `localStorage` y no se sincroniza.
 */
export const TEMAS = ['sistema', 'claro', 'oscuro'] as const;
export type Tema = typeof TEMAS[number];

/** Lo que de verdad se pinta. "sistema" no es un tema, es de dónde sale. */
export type TemaEfectivo = 'claro' | 'oscuro';

export const CLAVE_TEMA = 'gla_tema';

export const esTema = (v: unknown): v is Tema =>
  typeof v === 'string' && (TEMAS as readonly string[]).includes(v);

export const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

/**
 * El color de la barra del navegador, uno por tema.
 *
 * Es el de `--superficie`, porque lo que queda pegado a esa barra es la
 * cabecera de la app. Iba fijo en `#0f172a` —un azul oscuro que no es de esta
 * paleta y que en claro dejaba una franja negra arriba de una app blanca.
 *
 * Va acá y no en el `viewport` de Next a propósito: Next solo sabe escribirlo
 * por `prefers-color-scheme`, y con eso el docente que elige "siempre oscuro"
 * con el equipo en claro se queda con la barra blanca sobre la app oscura. El
 * tema efectivo lo sabe este archivo, así que el color también sale de acá.
 */
export const COLOR_BARRA: Record<TemaEfectivo, string> = {
  claro: '#ffffff',
  oscuro: '#22201d',
};

/**
 * `<html data-tema>` lleva SIEMPRE el tema efectivo, nunca la elección.
 *
 * La otra opción era quitar el atributo con "sistema" y dejar que mandara un
 * `@media (prefers-color-scheme: dark)` en la hoja. Se descartó: con `@media`
 * los valores oscuros hay que escribirlos dos veces —una para el sistema y una
 * para la elección manual— y dos listas que hay que mantener iguales acaban
 * divergiendo. Bastaría agregar un tono a una y olvidarlo en la otra para que
 * el interruptor manual se viera bien y el automático no, que es justo el modo
 * de fallar que nadie prueba.
 *
 * Resolviéndolo acá, la hoja tiene un solo bloque oscuro y el "sistema" es
 * cosa de este archivo.
 */
export function resolver(t: Tema): TemaEfectivo {
  if (t !== 'sistema') return t;
  try {
    return window.matchMedia(CONSULTA_OSCURO).matches ? 'oscuro' : 'claro';
  } catch {
    return 'claro';
  }
}

/**
 * El guion que corre ANTES de pintar, inyectado en el `<head>`.
 *
 * Sin esto la página arranca en claro y salta a oscuro en cuanto React corre
 * — un fogonazo blanco a las once de la noche, que es justo cuando alguien
 * enciende el modo oscuro. Va como string porque tiene que ser un `<script>`
 * inline: un módulo de React llega tarde por definición.
 *
 * Todo en try/catch: en una ventana privada `localStorage` puede lanzar, y un
 * tema equivocado es mejor que una página en blanco.
 */
export const GUION_TEMA = `(function(){try{
var t=localStorage.getItem('${CLAVE_TEMA}');
if(t!=='oscuro'&&t!=='claro'){t=window.matchMedia('${CONSULTA_OSCURO}').matches?'oscuro':'claro';}
document.documentElement.setAttribute('data-tema',t);
var m=document.createElement('meta');m.name='theme-color';
m.content=t==='oscuro'?'${COLOR_BARRA.oscuro}':'${COLOR_BARRA.claro}';
document.head.appendChild(m);
}catch(e){}})();`;

/** Lee la elección guardada. 'sistema' si no hay o si no se puede leer. */
export function temaGuardado(): Tema {
  try {
    const v = localStorage.getItem(CLAVE_TEMA);
    return esTema(v) ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}

/** Guarda la elección y pinta lo que corresponda. Devuelve lo que se pintó. */
export function aplicarTema(t: Tema): TemaEfectivo {
  const efectivo = resolver(t);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-tema', efectivo);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', COLOR_BARRA[efectivo]);
  }
  try {
    if (t === 'sistema') localStorage.removeItem(CLAVE_TEMA);
    else localStorage.setItem(CLAVE_TEMA, t);
  } catch { /* en privado no se guarda, pero el tema ya se aplicó */ }
  return efectivo;
}

/**
 * Sigue al sistema mientras la elección sea "sistema".
 *
 * Como `data-tema` se resuelve una vez al arrancar, sin esto el docente que
 * eligió seguir al sistema se queda en el tema que tenía cuando abrió la app:
 * el celular pasa a oscuro al atardecer y la app sigue blanca. Devuelve la
 * función para dejar de escuchar.
 */
export function seguirAlSistema(): () => void {
  let mq: MediaQueryList;
  try {
    mq = window.matchMedia(CONSULTA_OSCURO);
  } catch {
    return () => {};
  }
  const alCambiar = () => {
    if (temaGuardado() === 'sistema') aplicarTema('sistema');
  };
  mq.addEventListener('change', alCambiar);
  return () => mq.removeEventListener('change', alCambiar);
}
