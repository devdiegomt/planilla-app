import { GlobalDashboard } from '@/components/GlobalDashboard';
import { ImportPlanilla } from '@/components/ImportPlanilla';
import { TodayClasses } from '@/components/TodayClasses';
import { ExportEfas } from '@/components/ExportEfas';
import { BackupRestore } from '@/components/BackupRestore';
import { RepairPanel } from '@/components/RepairPanel';
import { PwaInstall } from '@/components/PwaInstall';
import { PushSetup } from '@/components/PushSetup';
import { PendientesList } from '@/components/PendientesList';

export default function Home() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">planilla-app</h1>
        <p className="text-sm text-neutral-500">
          Automatización de planillas y Califica — GLA 2026
        </p>
      </header>

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
        <GlobalDashboard />
      </section>

      <section className="border rounded-lg p-4 bg-neutral-50">
        <h2 className="font-medium mb-3">Reportes</h2>
        <ExportEfas />
      </section>

      <section className="border rounded-lg p-4 bg-neutral-50">
        <h2 className="font-medium mb-3">Importar datos</h2>
        <ImportPlanilla />
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