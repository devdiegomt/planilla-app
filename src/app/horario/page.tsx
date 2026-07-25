import { HorarioEditor } from '@/components/HorarioEditor';

export default function HorarioPage() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Horario</h1>
        <p className="text-sm text-neutral-500">
          Configura los bloques de cada tipo de día. Los 5 días numerados (D1–D5)
          rotan de lunes a jueves; el viernes es siempre Día Fijo.
        </p>
      </header>
      <HorarioEditor />
    </main>
  );
}
