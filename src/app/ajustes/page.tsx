import { CloseTrimester } from '@/components/CloseTrimester';
import { BackupRestore } from '@/components/BackupRestore';
import { RepairPanel } from '@/components/RepairPanel';
import { PwaInstall } from '@/components/PwaInstall';
import { PushSetup } from '@/components/PushSetup';

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
          Cierre de trimestre, copias de seguridad, reparación e instalación.
        </p>
      </header>

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
    </main>
  );
}
