import { PendientesList } from '@/components/PendientesList';

export default function PendientesPage() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Pendientes</h1>
        <p className="text-sm text-neutral-500">
          To-do local: prioridad, vencimiento y curso opcional. Sin límite de visualización.
        </p>
      </header>
      <PendientesList />
    </main>
  );
}
