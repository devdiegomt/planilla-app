'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { todayIso } from '@/lib/schedule';
import { deberesDe, type Deber, type DeberTipo } from '@/lib/deberes';

const DEFAULT_YEAR = new Date().getFullYear();

/** Qué es cada cosa, en el vocabulario del colegio. */
const ROTULO: Record<DeberTipo, string> = {
  asistencia: 'Asistencia',
  notas: 'Notas',
  cierre: 'Trimestre',
};

const COLOR: Record<DeberTipo, string> = {
  asistencia: 'bg-amber-100 text-amber-800',
  notas: 'bg-blue-100 text-blue-800',
  cierre: 'bg-red-100 text-red-800',
};

interface Props {
  /** Cuántos mostrar; el resto se resume con un enlace a /pendientes. */
  limit?: number;
  /** Si se define, solo los de ese curso. */
  courseCode?: string;
}

/**
 * Lo que la app ve que falta, sin que nadie lo haya anotado.
 *
 * Va ARRIBA de la lista escrita a mano y no mezclado con ella, porque son dos
 * cosas distintas: esto se resuelve yendo a una pantalla y deja de aparecer
 * solo; lo escrito a mano lo tacha el docente cuando quiere. Mezclarlas dejaba
 * una lista donde no se sabe qué se puede tachar.
 *
 * No hay nada que marcar acá a propósito: un deber detectado desaparece cuando
 * el dato que lo produjo cambia. Una casilla para tacharlo sería una forma de
 * decirle a la app que mienta.
 */
export function Deberes({ limit, courseCode }: Props) {
  /*
   * `?? null` no sobra: `useLiveQuery` devuelve `undefined` mientras Dexie
   * responde Y cuando no hay fila, que son dos cosas distintas. Sin
   * distinguirlas, el docente que todavía no configuró el año veía esta
   * sección vacía para siempre, sin nada que le dijera por qué.
   */
  const yearCfg = useLiveQuery(
    () => db.yearConfig.where('year').equals(DEFAULT_YEAR).first().then(c => c ?? null),
  );
  const calendarDays = useLiveQuery(() => db.calendarDays.toArray()) ?? [];
  const schedule = useLiveQuery(() => db.schedule.toArray()) ?? [];
  const courses = useLiveQuery(() => db.courses.toArray()) ?? [];
  const students = useLiveQuery(() => db.students.toArray()) ?? [];
  const attendanceMarks = useLiveQuery(() => db.attendanceMarks.toArray()) ?? [];

  const hoy = todayIso();
  const todos = useMemo(
    () => deberesDe(
      {
        yearConfig: yearCfg ?? undefined,
        schedule, calendarDays, courses, students, attendanceMarks,
      },
      hoy,
    ),
    [yearCfg, schedule, calendarDays, courses, students, attendanceMarks, hoy],
  );

  const lista = courseCode ? todos.filter(d => d.courseCode === courseCode) : todos;
  const visibles = limit ? lista.slice(0, limit) : lista;
  const ocultos = lista.length - visibles.length;

  // Mientras Dexie responde no se afirma nada: decir "todo al día" y
  // contradecirse medio segundo después es peor que no decir nada.
  if (yearCfg === undefined) return null;

  // Sin año configurado no hay ciclos ni fechas, así que no hay nada que
  // deducir. Decirlo, y decir dónde se arregla, en vez de dejar el hueco.
  if (yearCfg === null) {
    return (
      <p className="text-sm text-tinta-suave">
        Para saber qué falta, la app necesita saber cuándo empieza el año y cómo
        es tu horario.{' '}
        <Link href="/calendario" className="text-acento hover:underline">
          Configurar el año
        </Link>
      </p>
    );
  }

  if (lista.length === 0) {
    return (
      <p className="text-sm text-tinta-suave">
        No hay nada atrasado. La app avisa acá cuando falte registrar una
        asistencia o poner las notas de un ciclo.
      </p>
    );
  }

  return (
    <ul className="tarjeta overflow-hidden divide-y divide-borde">
      {visibles.map(d => <FilaDeber key={d.clave} deber={d} />)}
      {ocultos > 0 && (
        <li className="p-2 text-center text-xs">
          <Link href="/pendientes" className="text-tinta-suave hover:underline">
            Ver {ocultos} más
          </Link>
        </li>
      )}
    </ul>
  );
}

function FilaDeber({ deber }: { deber: Deber }) {
  return (
    <li>
      <Link
        href={deber.href}
        className="flex items-start gap-3 px-3 py-2.5 text-sm hover:bg-hundido transition-colors"
      >
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5 ${COLOR[deber.tipo]}`}
        >
          {ROTULO[deber.tipo]}
        </span>
        {/* `min-w-0` porque un hijo de flex trae `min-width: auto` y se niega a
            bajar del ancho de su texto: sin esto el detalle largo del cierre
            empuja la fila fuera de la pantalla en el celular. */}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{deber.titulo}</span>
          {deber.detalle && (
            <span className="block text-[12px] text-tinta-suave">{deber.detalle}</span>
          )}
        </span>
        {deber.fecha && (
          <span className="text-[11px] text-tinta-tenue tabular-nums shrink-0 mt-0.5">
            {cuandoFue(deber.fecha)}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * Hace cuánto quedó pendiente.
 *
 * En días y no en fecha porque lo que decide si hay que correr es cuánto lleva
 * esperando: "hace 3 días" se entiende sin hacer la cuenta, "12 de marzo" no.
 */
function cuandoFue(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy.getTime() - d.getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}
