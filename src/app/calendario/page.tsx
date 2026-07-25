import { CalendarView } from '@/components/CalendarView';

export default function CalendarioPage() {
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Calendario</h1>
        <p className="text-sm text-neutral-500">
          Ajusta el arranque del año y marca festivos o cancelaciones. El motor
          calcula el tipo de día para cada fecha lectiva y salta los días perdidos.
        </p>
      </header>
      <CalendarView />
    </main>
  );
}
