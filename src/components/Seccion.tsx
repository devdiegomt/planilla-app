'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Una sección de la página del curso que se puede plegar.
 *
 * La página tenía siete bloques siempre abiertos y la información importante
 —asistencia y notas— quedaba enterrada entre lo que se mira una vez por mes.
 *
 * **Lo que se pliega se queda plegado.** Si al volver a entrar todo estuviera
 * abierto de nuevo, plegar no serviría de nada: habría que hacerlo cada vez. Se
 * recuerda por sección y no por curso, así que se decide una vez y vale para
 * los 19.
 *
 * **Y plegar no es perder:** `resumen` se muestra al lado del título cuando
 * está cerrada, para que lo de adentro siga estando a la vista de un vistazo.
 */
export function Seccion({ id, titulo, resumen, defaultOpen = false, children }: {
  /** Clave con la que se recuerda. Cambiarla olvida lo que el docente eligió. */
  id: string;
  titulo: string;
  resumen?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const clave = `seccion:${id}`;
  /*
   * Arranca en `defaultOpen` y no en lo guardado a propósito: leer
   * localStorage durante el render deja el servidor y el navegador pintando
   * cosas distintas, y React lo marca como error de hidratación. Se lee en el
   * efecto, ya montado.
   */
  const [abierta, setAbierta] = useState(defaultOpen);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(clave);
      if (guardado != null) setAbierta(guardado === '1');
    } catch { /* sin localStorage se queda con el valor por defecto */ }
  }, [clave]);

  function alternar() {
    const nueva = !abierta;
    setAbierta(nueva);
    try { localStorage.setItem(clave, nueva ? '1' : '0'); } catch { /* nada */ }
  }

  return (
    <section className="min-w-0">
      <button
        onClick={alternar}
        aria-expanded={abierta}
        className="w-full flex items-center gap-2 text-left py-1 min-w-0 group"
      >
        <span
          aria-hidden
          className={`shrink-0 text-neutral-400 transition-transform ${abierta ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide shrink-0 group-hover:text-neutral-700">
          {titulo}
        </h2>
        {!abierta && resumen && (
          <span className="text-xs text-neutral-500 truncate min-w-0">{resumen}</span>
        )}
      </button>
      {abierta && <div className="mt-2 min-w-0">{children}</div>}
    </section>
  );
}

/**
 * Una sección que no se pliega, para que se vea igual que las otras.
 *
 * Las notas son a lo que se entra a hacer: darles una flecha sería ofrecer
 * esconder justo lo que se vino a ver.
 */
export function SeccionFija({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="flex items-center gap-2 py-1">
        {/* Hueco del ancho de la flecha, para que los títulos queden alineados. */}
        <span aria-hidden className="shrink-0 text-transparent">▶</span>
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide">{titulo}</h2>
      </div>
      <div className="mt-2 min-w-0">{children}</div>
    </section>
  );
}
