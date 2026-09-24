import Link from 'next/link';
import { SubjectsConfig } from '@/components/SubjectsConfig';
import { ImportPlanilla } from '@/components/ImportPlanilla';
import { ImportCodAlum } from '@/components/ImportCodAlum';
import { ImportHistorial } from '@/components/ImportHistorial';
import { ImportActividades } from '@/components/ImportActividades';
import { CloseTrimester } from '@/components/CloseTrimester';
import { BackupRestore } from '@/components/BackupRestore';
import { RepairPanel } from '@/components/RepairPanel';
import { PwaInstall } from '@/components/PwaInstall';
import { PushSetup } from '@/components/PushSetup';
import { WipeDevice } from '@/components/WipeDevice';

/**
 * Todo lo que se hace una vez al año, una vez por trimestre o solo cuando algo
 * falla. Vive acá y no en el home para que el home sea el trabajo del día:
 * clases, pendientes, cursos, asistencia y Califica.
 */
export default function AjustesPage() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Ajustes</h1>
        <p className="text-sm text-neutral-500">
          Puesta a punto, cierre de trimestre, copias de seguridad, reparación,
          instalación y borrado de salida.
        </p>
      </header>

      <section className="border rounded-lg p-4 bg-neutral-50">
        <h2 className="font-medium mb-3">Mis materias</h2>
        <SubjectsConfig />
      </section>

      {/*
        * Las tres son de puesta a punto: la Planilla una vez al año, los
        * códigos cuando entra gente nueva, y el historial una sola vez si se
        * empezó con el año ya empezado. Ninguna es del trabajo de la semana,
        * por eso salieron del inicio.
        */}
      <section className="border rounded-lg p-4 bg-neutral-50 space-y-5">
        <div>
          <h2 className="font-medium mb-3">Traer datos de la plataforma</h2>
          <ImportPlanilla />
        </div>
        <div className="border-t pt-4">
          <ImportCodAlum />
        </div>
        <div className="border-t pt-4">
          <ImportHistorial />
        </div>
        <div className="border-t pt-4">
          <ImportActividades />
          <p className="text-[11px] text-neutral-500 mt-2">
            Acá solo se traen. Para cambiarlos y mandarlos de vuelta,{' '}
            <Link href="/matriz" className="underline">edita la matriz de actividades</Link>.
          </p>
        </div>
      </section>

      <section className="border rounded-lg p-4 bg-neutral-50">
        <h2 className="font-medium mb-3">Cierre de trimestre</h2>
        <CloseTrimester />
      </section>

      <section className="border rounded-lg p-4 bg-neutral-50">
        <h2 className="font-medium mb-3">Backup local</h2>
        <BackupRestore />
      </section>

      <section className="border rounded-lg p-4 bg-neutral-50">
        <h2 className="font-medium mb-3">Diagnóstico y reparación</h2>
        <RepairPanel />
      </section>

      <section className="border rounded-lg p-4 bg-neutral-50">
        <h2 className="font-medium mb-3">Instalar app</h2>
        <PwaInstall />
      </section>

      <section className="border rounded-lg p-4 bg-neutral-50">
        <h2 className="font-medium mb-3">Notificaciones</h2>
        <PushSetup />
      </section>

      {/* Al final y con borde rojo: es lo único de esta página sin vuelta atrás. */}
      <section className="border border-red-200 rounded-lg p-4 bg-red-50">
        <h2 className="font-medium mb-3 text-red-900">Borrar los datos de este equipo</h2>
        <WipeDevice />
      </section>
    </main>
  );
}
