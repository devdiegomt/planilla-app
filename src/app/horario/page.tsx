import { HorarioEditor } from '@/components/HorarioEditor';
import { TempEventsPanel } from '@/components/TempEventEditor';

export default function HorarioPage() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Horario</h1>
        <p className="text-sm text-neutral-500">
          Las filas son franjas horarias y las columnas, tipos de día. Los 5 días
          numerados (D1–D5) rotan de lunes a jueves; el viernes es siempre Día Fijo.
          Toca un bloque para editarlo, o un hueco para llenarlo.
        </p>
        <p className="text-xs text-neutral-500">
          Acá va lo que se repite cada semana: clases, eventos fijos y descansos.
          Lo que pasa una sola vez —una reunión, un reemplazo— va abajo, en
          “Estos días”. Solo las clases cuentan para ciclos, asistencia y Califica.
        </p>
      </header>
      <HorarioEditor />
      <TempEventsPanel />
    </main>
  );
}
