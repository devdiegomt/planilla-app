import { GlobalDashboard } from '@/components/GlobalDashboard';
import { Buscador } from '@/components/Buscador';
import { ImportCalifica451 } from '@/components/ImportCalifica451';
import { TodayClasses } from '@/components/TodayClasses';
import { PrimerArranque } from '@/components/PrimerArranque';
import { ExportEfas } from '@/components/ExportEfas';
import { ExportDayAttendance } from '@/components/ExportDayAttendance';
import { PendientesList } from '@/components/PendientesList';

/**
 * El home es el trabajo del día. Lo que se hace una vez al año, una vez por
 * trimestre o solo cuando algo falla vive en /ajustes (engranaje de la barra).
 */
export default function Home() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">planilla-app</h1>
        <p className="text-sm text-neutral-500">
          Automatización de planillas y Califica — GLA 2026
        </p>
      </header>

      {/* Solo aparece si falta algún paso de configuración; con la base lista
          el inicio queda igual que antes. */}
      <PrimerArranque />

      <section>
        <TodayClasses />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-medium">Pendientes</h2>
        </div>
        <PendientesList limit={5} compact />
      </section>

      <section>
        <h2 className="font-medium mb-3">Cursos</h2>
        {/*
        * Arriba de todo: es lo primero que se hace al abrir la app con una duda
        * puntual, y bajarlo lo convertiría en algo que hay que ir a buscar.
        */}
      <section>
        <Buscador />
      </section>

      <GlobalDashboard />
      </section>

      <section className="border rounded-lg p-4 bg-neutral-50 space-y-5">
        <div>
          <h2 className="font-medium mb-3">Asistencia para Classroom Live</h2>
          <ExportDayAttendance />
        </div>
        <div className="border-t pt-4">
          <h2 className="font-medium mb-3">Reportes</h2>
          <ExportEfas />
        </div>
      </section>

      {/*
        * Acá queda solo el Califica, que es lo que se hace cada semana. La
        * Planilla del año, los códigos y el historial son de arranque —una vez
        * al año o una vez y nunca más— y se fueron a /ajustes.
        */}
      <section className="border rounded-lg p-4 bg-neutral-50">
        <ImportCalifica451 />
      </section>
    </main>
  );
}
