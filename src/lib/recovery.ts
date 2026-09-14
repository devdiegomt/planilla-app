/**
 * Recuperación de la app en un navegador concreto, sin tocar datos.
 *
 * El caso que motivó esto: la app se caía en el computador del colegio y en el
 * de la casa funcionaba. Lo que difiere entre máquinas no es el servidor ni las
 * variables de entorno, sino la copia de la app que cada navegador guarda
 * (service worker + Cache Storage). Repararla es borrar ESA copia.
 *
 * Nunca se toca IndexedDB ni localStorage: ahí viven las notas y los cambios
 * que aún no se sincronizan. "Borrar datos del sitio" completo los perdería.
 */

/** Desregistra el service worker, vacía el caché y recarga. */
export async function repairAndReload(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map(r => r.unregister()));
  } catch { /* sin service worker: nada que quitar */ }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch { /* sin Cache Storage */ }
  location.reload();
}

export interface ErrorExplicado {
  titulo: string;
  mensaje: string;
  /** Si reparar el caché tiene sentido para este error. */
  reparable: boolean;
}

/** Traduce el error a algo accionable. Si no se reconoce, se dice tal cual. */
export function explicarError(err: unknown): ErrorExplicado {
  const e = err as { name?: string; message?: string } | null;
  const texto = `${e?.name ?? ''} ${e?.message ?? String(err ?? '')}`;

  if (/VersionError/.test(texto)) {
    return {
      titulo: 'Copia desactualizada de la app',
      mensaje: 'La base de datos de este navegador es más nueva que la app que cargó. '
        + 'Pasa cuando el navegador sirve una copia vieja desde caché.',
      reparable: true,
    };
  }
  if (/ChunkLoadError|Loading chunk|Unexpected token '<'|dynamically imported module/.test(texto)) {
    return {
      titulo: 'No cargó un archivo de la app',
      mensaje: 'La copia guardada en este navegador está dañada o incompleta. '
        + 'Es típico después de una red con filtro de contenido.',
      reparable: true,
    };
  }
  if (/blocked|DatabaseClosedError/i.test(texto)) {
    return {
      titulo: 'La base de datos está ocupada',
      mensaje: 'Probablemente hay otra pestaña de planilla-app abierta. Ciérrala y recarga.',
      reparable: false,
    };
  }
  return {
    titulo: 'La app encontró un error',
    mensaje: 'Si se repite, copia el detalle de abajo y compártelo.',
    reparable: true,
  };
}

/**
 * Guardia de arranque, independiente de los archivos de la app.
 *
 * Va como script inline porque el fallo que atiende es justamente que los
 * archivos de la app no cargan o vienen dañados: nada que viva en ellos —React,
 * `error.tsx`— alcanzaría a mostrarse. ES5 a propósito, para correr en
 * cualquier navegador del colegio.
 *
 * OJO con el orden: Next inserta sus propios scripts en el <head> ANTES que
 * este (verificado en el build: 17 scripts `async` delante). Un archivo que
 * falle muy rápido puede disparar su error antes de que haya quién lo escuche.
 * Por eso, además de los listeners, hay un vigía que no depende del orden: si
 * la app no terminó de arrancar un rato después de cargar la página, se avisa.
 *
 * Solo reacciona a errores de carga de la app o de versión de la base, no a
 * cualquier excepción: mostrar el aviso por errores ajenos lo volvería ruido.
 */
export const BOOT_GUARD_SCRIPT = `(function () {
  var visible = false;
  function reparar() {
    var tareas = [];
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        tareas.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }));
      }
    } catch (e) {}
    try {
      if (window.caches) {
        tareas.push(caches.keys().then(function (ks) {
          return Promise.all(ks.map(function (k) { return caches.delete(k); }));
        }));
      }
    } catch (e) {}
    Promise.all(tareas).catch(function () {}).then(function () { location.reload(); });
  }
  function mostrar(titulo, detalle, mensaje) {
    if (visible) return;
    visible = true;
    function pintar() {
      var d = document.createElement('div');
      d.setAttribute('role', 'alert');
      d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;'
        + 'max-width:520px;margin:0 auto;background:#fff;border:1px solid #fca5a5;'
        + 'border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:14px;'
        + 'font:14px/1.45 system-ui,sans-serif;color:#1f2937';
      d.innerHTML = '<strong style="display:block;color:#991b1b;margin-bottom:4px"></strong>'
        + '<div data-m style="margin-bottom:8px"></div>'
        + '<code style="display:block;font-size:11px;color:#6b7280;white-space:pre-wrap;'
        + 'word-break:break-word;margin-bottom:10px"></code>'
        + '<button type="button" style="background:#111827;color:#fff;border:0;border-radius:6px;'
        + 'padding:7px 12px;font:inherit;cursor:pointer">Reparar y recargar</button>'
        + '<div style="font-size:11px;color:#6b7280;margin-top:6px">'
        + 'Tus datos no se tocan: solo se limpia la copia de la app guardada en este navegador.</div>';
      d.querySelector('strong').textContent = titulo;
      d.querySelector('[data-m]').textContent = mensaje
        || 'La copia de la app guardada en este navegador parece dañada o desactualizada.';
      d.querySelector('code').textContent = detalle;
      d.querySelector('button').onclick = reparar;
      document.body.appendChild(d);
    }
    if (document.body) pintar();
    else document.addEventListener('DOMContentLoaded', pintar);
  }
  window.__planillaRepair = reparar;
  window.__planillaShowError = mostrar;
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT' && /\\/_next\\//.test(t.src || '')) {
      mostrar('No cargó un archivo de la app', t.src);
      return;
    }
    var err = e.error;
    var txt = err ? (err.name + ': ' + err.message) : String(e.message || '');
    if (/ChunkLoadError|Loading chunk|Unexpected token '<'/.test(txt)) {
      mostrar('No cargó un archivo de la app', txt);
    }
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var txt = r ? ((r.name || '') + ': ' + (r.message || r)) : '';
    if (/ChunkLoadError|Loading chunk|VersionError|dynamically imported module/.test(txt)) {
      mostrar('La app no pudo arrancar', txt);
    }
  });
  // Vigía: la app marca __planillaHydrated al montar. Si tras cargar la página
  // sigue sin marcar, algo impidió el arranque aunque ningún evento lo contara.
  function revisar() {
    if (window.__planillaHydrated || visible) return;
    mostrar('La app no terminó de arrancar',
      'La página cargó, pero la aplicación no llegó a iniciarse.');
  }
  window.addEventListener('load', function () { setTimeout(revisar, 8000); });
  // Por si 'load' nunca llega (una petición que queda colgada).
  document.addEventListener('DOMContentLoaded', function () { setTimeout(revisar, 25000); });
})();`;
