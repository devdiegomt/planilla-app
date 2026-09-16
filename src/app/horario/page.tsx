import { HorarioEditor } from '@/components/HorarioEditor';

export default function HorarioPage() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Horario</h1>
        <p className="text-sm text-neutral-500">
          Las filas son franjas horarias y las columnas, tipos de día. Los 5 días
          numerados (D1–D5) rotan de lunes a jueves; el viernes es siempre Día Fijo.
          Tocá un bloque para editarlo, o un hueco para llenarlo.
        </p>
        <p className="text-xs text-neutral-500">
          Además de clases podés poner eventos (reuniones, reemplazos) y descansos
          con notas. Solo las clases cuentan para ciclos, asistencia y Califica.
        </p>
      </header>
      <HorarioEditor />
    </main>
  );
}
