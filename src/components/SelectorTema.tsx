'use client';

import { useEffect, useState } from 'react';
import { TEMAS, temaGuardado, aplicarTema, type Tema } from '@/lib/tema';

const ETIQUETA: Record<Tema, string> = {
  sistema: 'Como el sistema',
  claro: 'Claro',
  oscuro: 'Oscuro',
};

const PORQUE: Record<Tema, string> = {
  sistema: 'Sigue lo que tenga puesto tu celular o tu computador.',
  claro: 'Siempre claro, aunque el equipo esté en oscuro.',
  oscuro: 'Siempre oscuro, aunque el equipo esté en claro.',
};

/**
 * Elegir el tema.
 *
 * El valor se lee en un efecto y no al montar: en el servidor no hay
 * `localStorage`, y pintar "Como el sistema" para cambiarlo en el primer
 * dibujo es un desajuste de hidratación. Hasta que el efecto corre no hay
 * ninguno marcado, que dura un fotograma.
 */
export function SelectorTema() {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => { setTema(temaGuardado()); }, []);

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Tema de la app</legend>
      {TEMAS.map(t => (
        <label
          key={t}
          className={`flex items-start gap-3 px-3 py-2 rounded-lg border cursor-pointer
                      transition-colors ${
            tema === t ? 'border-acento bg-acento-claro' : 'border-borde hover:bg-hundido'}`}
        >
          <input
            type="radio"
            name="tema"
            value={t}
            checked={tema === t}
            onChange={() => setTema(aplicarTema(t))}
            className="mt-0.5 shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{ETIQUETA[t]}</span>
            <span className="block text-[12px] text-tinta-suave">{PORQUE[t]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
