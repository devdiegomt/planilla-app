'use client';

import type { CodAlumReport } from '@/lib/db';

/**
 * Quién no cuadró entre la app y la plataforma.
 *
 * Los códigos se escriben solos al subir el Califica de todos los cursos, y
 * hasta acá eso se resumía en una línea ("N escritos · M ya estaban"). Lo que
 * de verdad hay que mirar es lo OTRO: quién está en la plataforma y no en la
 * app (¿entró alguien?), quién está en la app y no en la plataforma (¿se
 * retiró?), a quién le cambió el código y qué nombres están escritos distinto.
 *
 * Eso vivía en un importador aparte que pedía un archivo del extractor de
 * códigos. Era una segunda puerta para lo mismo, y encima la que necesita
 * Tampermonkey. La revisión se queda; la puerta se fue.
 */
export function RevisionCodigos({ r }: { r: CodAlumReport }) {
  const listas: { titulo: string; items: string[]; tono: string }[] = [
    {
      titulo: 'En la plataforma pero no en la app',
      items: r.notInApp.map(x => `${x.course} · ${x.nombre}`),
      tono: 'text-amber-800',
    },
    {
      titulo: 'En la app pero no en la plataforma',
      items: r.notInPlatform.map(x => `${x.course} · ${x.nombre}`),
      tono: 'text-amber-800',
    },
    {
      titulo: 'Nombres escritos distinto',
      items: r.fuzzyMatched.map(x => `${x.course} · ${x.app} ↔ ${x.platform}`),
      tono: 'text-neutral-700',
    },
    {
      titulo: 'Códigos que cambiaron',
      items: r.changed.map(x => `${x.course} · ${x.nombre}: ${x.from} → ${x.to}`),
      tono: 'text-neutral-700',
    },
  ].filter(l => l.items.length > 0);

  if (listas.length === 0) {
    return (
      <p className="text-[12px] text-green-700">
        ✔ Todos los estudiantes de la plataforma cuadran con los de la app.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-neutral-600">
        Revisa esto: no es un error, pero conviene saberlo antes de calificar.
      </p>
      {listas.map(l => (
        <details key={l.titulo} className="text-[12px]">
          <summary className={`cursor-pointer ${l.tono}`}>
            {l.titulo} · {l.items.length}
          </summary>
          <ul className="mt-1 ml-4 space-y-0.5 text-neutral-600">
            {l.items.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </details>
      ))}
    </div>
  );
}
