import { Deberes } from '@/components/Deberes';
import { PendientesList } from '@/components/PendientesList';

/**
 * Pendientes, en dos listas que no se mezclan.
 *
 * Arriba lo que la app ve sola —una clase dictada sin F/R, un ciclo con notas
 * a medias, un trimestre sin cerrar—, que es lo que de verdad se pierde de
 * vista: son diecinueve cursos por nueve ciclos y nadie lo revisa a mano.
 * Abajo lo que el docente anota, que la app no puede adivinar.
 *
 * Separadas y no en una sola lista porque se resuelven distinto: lo de arriba
 * desaparece cuando el dato cambia y no se puede tachar; lo de abajo se tacha
 * cuando uno quiere. Juntas quedaba una lista donde no se sabe qué se puede
 * marcar como hecho.
 */
export default function PendientesPage() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Pendientes</h1>
        <p className="text-sm text-tinta-suave">
          Lo que la app ve que falta, y lo que anotes tú.
        </p>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="font-medium">Lo que falta</h2>
          <p className="text-[13px] text-tinta-suave">
            Sale de tus cursos y tu horario. Desaparece solo cuando lo resuelves.
          </p>
        </div>
        <Deberes />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-medium">Tus notas</h2>
          <p className="text-[13px] text-tinta-suave">
            Lo que apuntes acá. Con prioridad, fecha y curso, todo opcional.
          </p>
        </div>
        <PendientesList />
      </section>
    </main>
  );
}
