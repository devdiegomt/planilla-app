'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { GlobalDashboard } from './GlobalDashboard';
import { Buscador } from './Buscador';
import { ImportCalifica451 } from './ImportCalifica451';
import { TodayClasses } from './TodayClasses';
import { PrimerArranque } from './PrimerArranque';
import { ExportEfas } from './ExportEfas';
import { ExportDayAttendance } from './ExportDayAttendance';
import { PendientesList } from './PendientesList';
import { Bienvenida } from './Bienvenida';

/**
 * El inicio es el trabajo del día — salvo el primer día, que no hay trabajo.
 *
 * Sin un solo curso, todo lo de abajo está vacío o no puede hacer nada: los
 * pendientes sin pendientes, el EFAS sin a quién sumar, la asistencia sin a
 * quién marcar. Ahí se muestra solo la bienvenida, que tiene una sola cosa que
 * hacer. Con un curso ya adentro, el inicio vuelve a ser el de siempre.
 *
 * Lo que se hace una vez al año o cuando algo falla vive en Configuración.
 */
export function Inicio() {
  const cursos = useLiveQuery(() => db.courses.count(), []);

  // Mientras Dexie responde no se decide nada: pintar la bienvenida y
  // cambiarla medio segundo después es peor que esperar.
  if (cursos === undefined) return null;

  if (cursos === 0) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <Bienvenida />
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Tu planilla</h1>
        <p className="text-sm text-tinta-suave">
          Lo de hoy: tus clases, lo pendiente y las notas del trimestre.
        </p>
      </header>

      {/* Desaparece sola cuando no falta ningún paso. */}
      <PrimerArranque />

      <section>
        <TodayClasses />
      </section>

      {/*
        * Arriba y no al final: es lo primero que se hace al abrir la app con
        * una duda puntual, y bajarlo lo vuelve algo que hay que ir a buscar.
        */}
      <section>
        <Buscador />
      </section>

      <section>
        <h2 className="font-medium mb-3">Pendientes</h2>
        <PendientesList limit={5} compact />
      </section>

      <section>
        <h2 className="font-medium mb-3">Cursos</h2>
        <GlobalDashboard />
      </section>

      <section className="panel p-4 space-y-5">
        <div>
          <h2 className="font-medium mb-3">Asistencia para la plataforma</h2>
          <ExportDayAttendance />
        </div>
        <div className="border-t pt-4">
          <h2 className="font-medium mb-3">EFAS del trimestre</h2>
          <ExportEfas />
        </div>
      </section>

      {/*
        * El Califica se queda acá: es lo de cada semana. Lo de una vez al año
        * está en Configuración.
        */}
      <section id="califica" className="panel p-4 scroll-mt-20">
        <h2 className="font-medium mb-3">Califica de todos los cursos</h2>
        <ImportCalifica451 />
      </section>
    </main>
  );
}
