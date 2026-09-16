'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { gradesOf } from '@/lib/courseOrder';
import { gradesSinMateria } from '@/lib/subjects';
import { setupSteps, setupCompleto, type SetupStep } from '@/lib/setupSteps';

/**
 * Lista de primer arranque.
 *
 * Desaparece sola cuando los cinco pasos están hechos, así que para una base
 * ya configurada el inicio no cambia. No se puede descartar a mano: si falta
 * un paso, falta de verdad — sin códigos no sale la asistencia, y sin materias
 * no sale el Califica.
 */
export function PrimerArranque() {
  const year = new Date().getFullYear();
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const students = useLiveQuery(() => db.students.toArray(), []);
  const schedule = useLiveQuery(() => db.schedule.count(), []);
  // `.toArray()` y no `.first()`: con `.first()` no se distingue "todavía
  // cargando" de "no hay configuración", las dos dan undefined, y la lista
  // parpadeaba en cada carga aunque el año estuviera definido.
  const cfgs = useLiveQuery(
    () => db.yearConfig.where('year').equals(year).toArray(), [year],
  );

  // Mientras Dexie responde no se decide nada.
  if (!courses || !students || schedule === undefined || !cfgs) return null;

  const yearCfg = cfgs[0];

  const grados = gradesOf(courses);
  const steps = setupSteps({
    cursos: courses.length,
    tieneAnio: !!yearCfg,
    gradosSinMateria: gradesSinMateria(yearCfg, grados),
    bloquesHorario: schedule,
    estudiantes: students.length,
    estudiantesConCodigo: students.filter(s => s.codAlum).length,
  });

  if (setupCompleto(steps)) return null;

  const hechos = steps.filter(p => p.done).length;

  return (
    <section
      aria-label="Primeros pasos"
      className="border rounded-lg bg-white overflow-hidden"
    >
      <div className="px-4 py-3 border-b bg-neutral-50">
        <h2 className="font-medium">Primeros pasos</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {hechos} de {steps.length} listos. Esta lista desaparece sola al terminar.
        </p>
      </div>
      <ol className="divide-y">
        {steps.map((p, i) => <Paso key={p.id} paso={p} numero={i + 1} />)}
      </ol>
    </section>
  );
}

function Paso({ paso, numero }: { paso: SetupStep; numero: number }) {
  const bloqueado = !paso.done && !!paso.bloqueadoPor;

  return (
    <li className={`flex gap-3 px-4 py-3 ${bloqueado ? 'opacity-50' : ''}`}>
      <span
        aria-hidden="true"
        className={`shrink-0 w-6 h-6 rounded-full grid place-items-center text-xs font-medium ${
          paso.done
            ? 'bg-green-100 text-green-800'
            : bloqueado
              ? 'bg-neutral-100 text-neutral-400'
              : 'bg-neutral-900 text-white'
        }`}
      >
        {paso.done ? '✓' : numero}
      </span>

      <div className="min-w-0 flex-1">
        <div className={`text-sm ${paso.done ? 'text-neutral-500 line-through' : 'font-medium'}`}>
          {paso.titulo}
        </div>
        {!paso.done && (
          <p className="text-xs text-neutral-500 mt-0.5">{paso.porque}</p>
        )}
      </div>

      {!paso.done && !bloqueado && (
        <Link
          href={paso.href}
          className="shrink-0 self-start text-xs px-2.5 py-1 rounded-md border
                     hover:bg-neutral-50 whitespace-nowrap"
        >
          Ir
        </Link>
      )}
    </li>
  );
}
