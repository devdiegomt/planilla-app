'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import type { Course } from '@/types';

/**
 * El director de grupo, editable en la cabecera del curso.
 *
 * Es el único dato con valor que la Planilla del año traía y el Califica no.
 * Como el Califica es el punto de partida para cualquier docente que no exporta
 * la Planilla, este campo llega vacío y se llena a mano una vez.
 *
 * No se pide al importar: son 19 nombres y nada depende de ellos. Se escriben
 * cuando hagan falta, curso por curso.
 */
export function DirectorField({ course }: { course: Course }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(course.director ?? '');

  // Si cambia el curso (las flechas de CourseNav), el campo sigue al nuevo.
  useEffect(() => {
    setValor(course.director ?? '');
    setEditando(false);
  }, [course.id, course.director]);

  const guardar = async () => {
    const limpio = valor.trim();
    setEditando(false);
    if (limpio === (course.director ?? '')) return;
    if (course.id) await db.courses.update(course.id, { director: limpio });
  };

  if (editando) {
    return (
      <input
        autoFocus
        type="text"
        value={valor}
        onChange={e => setValor(e.target.value)}
        onBlur={guardar}
        onKeyDown={e => {
          if (e.key === 'Enter') guardar();
          if (e.key === 'Escape') { setValor(course.director ?? ''); setEditando(false); }
        }}
        placeholder="Director de grupo"
        aria-label="Director de grupo"
        className="text-base font-normal border rounded px-2 py-0.5 w-48"
      />
    );
  }

  return (
    <button
      onClick={() => setEditando(true)}
      title="Editar el director de grupo"
      className="text-neutral-500 font-normal hover:text-neutral-900 hover:underline"
    >
      {course.director?.trim()
        ? `· ${course.director}`
        : '· + director de grupo'}
    </button>
  );
}
