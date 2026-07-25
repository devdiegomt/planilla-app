import { AgenteBrowser } from '@/components/AgenteBrowser';

export default function AgentePage() {
  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Agente IA calificador</h1>
        <p className="text-sm text-neutral-500">
          Define rúbricas, pega una entrega y obtén una calificación estructurada
          con retroalimentación. El agente corre en el servidor (nunca expone la API key
          al navegador).
        </p>
      </header>
      <AgenteBrowser />
    </main>
  );
}
